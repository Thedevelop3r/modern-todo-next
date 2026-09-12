//! Compiling a request into PDF bytes.

use std::sync::OnceLock;

use typst::foundations::{Dict, IntoValue};
use typst_as_lib::TypstEngine;
use typst_layout::PagedDocument;

use crate::markup::{rich_text_markup, runs_markup};
use crate::payload::{Block, RenderRequest, Run};

/// The fonts are embedded rather than read from the filesystem: a slim runtime
/// image has none at all, and a PDF whose text depends on what the host happens
/// to have installed is not reproducible.
static FONTS: &[&[u8]] = &[
    include_bytes!("../fonts/LiberationSans-Regular.ttf"),
    include_bytes!("../fonts/LiberationSans-Bold.ttf"),
    include_bytes!("../fonts/LiberationSans-Italic.ttf"),
    include_bytes!("../fonts/LiberationSans-BoldItalic.ttf"),
    include_bytes!("../fonts/LiberationSerif-Regular.ttf"),
    include_bytes!("../fonts/LiberationSerif-Bold.ttf"),
    include_bytes!("../fonts/LiberationMono-Regular.ttf"),
    // A fallback with far wider Unicode coverage. Users type in any language,
    // and Liberation alone would render much of it as .notdef boxes.
    include_bytes!("../fonts/DejaVuSans.ttf"),
];

/// Extra faces loaded from disk at startup, if a directory was configured.
///
/// The embedded set above is the guaranteed baseline - the service renders
/// correctly with nothing installed. Full CJK coverage is another 20 MB, which
/// does not belong in the binary, so the image installs it as a package and
/// points `PDF_FONT_DIR` at it. Coverage grows; reproducibility is unaffected,
/// because the embedded faces are still what Latin text resolves to.
static EXTRA_FONTS: OnceLock<Vec<Vec<u8>>> = OnceLock::new();

pub fn load_extra_fonts() -> usize {
    let fonts = EXTRA_FONTS.get_or_init(|| {
        let Ok(dir) = std::env::var("PDF_FONT_DIR") else {
            return Vec::new();
        };
        let Ok(entries) = std::fs::read_dir(&dir) else {
            tracing::warn!(dir = %dir, "PDF_FONT_DIR is not readable; using embedded fonts only");
            return Vec::new();
        };

        let mut loaded = Vec::new();
        for entry in entries.flatten() {
            let path = entry.path();
            let extension = path
                .extension()
                .and_then(|e| e.to_str())
                .map(str::to_ascii_lowercase)
                .unwrap_or_default();
            if !matches!(extension.as_str(), "ttf" | "otf" | "ttc" | "otc") {
                continue;
            }
            match std::fs::read(&path) {
                Ok(bytes) => loaded.push(bytes),
                Err(error) => tracing::warn!(path = ?path, %error, "could not read font"),
            }
        }
        loaded
    });
    fonts.len()
}

static COMMON: &str = include_str!("../templates/common.typ");
static GENERAL: &str = include_str!("../templates/general.typ");
static SCHOOL: &str = include_str!("../templates/school.typ");
static LAW_ENFORCEMENT: &str = include_str!("../templates/law-enforcement.typ");
static HOSPITAL: &str = include_str!("../templates/hospital.typ");
static RESTAURANT: &str = include_str!("../templates/restaurant.typ");

/// Which templates this build knows about. Later variations are added here.
fn template_source(name: &str) -> &'static str {
    match name {
        "school" => SCHOOL,
        "law-enforcement" => LAW_ENFORCEMENT,
        "hospital" => HOSPITAL,
        "restaurant" => RESTAURANT,
        // Law enforcement, hospital and restaurant land in later phases; until
        // then an unknown variation renders as General rather than failing.
        _ => GENERAL,
    }
}

#[derive(Debug)]
pub enum RenderError {
    Compile(String),
    Pdf(String),
}

impl std::fmt::Display for RenderError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            RenderError::Compile(message) => write!(f, "template failed to compile: {message}"),
            RenderError::Pdf(message) => write!(f, "pdf export failed: {message}"),
        }
    }
}

/// The subset of the request the template reads as JSON.
fn document_json(request: &RenderRequest) -> String {
    let fields: Vec<_> = request
        .document
        .fields
        .iter()
        .map(|f| serde_json::json!({ "label": f.label, "value": f.value }))
        .collect();
    let subtasks: Vec<_> = request
        .document
        .subtasks
        .iter()
        .map(|s| serde_json::json!({ "title": s.title, "done": s.done }))
        .collect();

    let items: Vec<_> = request
        .document
        .items
        .iter()
        .map(|i| serde_json::json!({
            "title": i.title,
            "status": i.status,
            "priority": i.priority,
            "due": i.due,
        }))
        .collect();

    let highlights: Vec<_> = request
        .document
        .highlights
        .iter()
        .map(|f| serde_json::json!({ "label": f.label, "value": f.value }))
        .collect();

    let secondary: Vec<_> = request
        .document
        .secondary
        .iter()
        .map(|i| serde_json::json!({
            "title": i.title,
            "status": i.status,
            "priority": i.priority,
            "due": i.due,
        }))
        .collect();

    serde_json::json!({
        "kind": request.document.kind,
        "title": request.document.title,
        "fields": fields,
        "highlights": highlights,
        "banner": request.document.banner,
        "notice": request.document.notice,
        "itemHeadings": request.document.item_headings,
        "secondary": secondary,
        "secondaryHeadings": request.document.secondary_headings,
        "subtasks": subtasks,
        "items": items,
        "tags": request.document.tags,
        "notes": request.document.notes,
    })
    .to_string()
}

fn meta_json(request: &RenderRequest) -> String {
    serde_json::json!({
        "generatedAt": request.meta.generated_at,
        "generatedBy": request.meta.generated_by,
        "reference": request.meta.reference,
        "organization": request.meta.organization,
        "version": request.meta.version,
    })
    .to_string()
}

/// How many words of body text a document carries, used only for logging.
pub fn body_size(request: &RenderRequest) -> usize {
    fn runs_len(runs: &[Run]) -> usize {
        runs.iter().map(|r| r.text.len()).sum()
    }
    request
        .document
        .description
        .blocks
        .iter()
        .map(|block| match block {
            Block::Paragraph { runs, .. } | Block::Heading { runs, .. } | Block::Quote { runs } => runs_len(runs),
            Block::List { items, .. } => items.iter().map(|r| runs_len(r)).sum(),
            Block::Code { text } => text.len(),
            Block::Unknown => 0,
        })
        .sum()
}

pub fn render(request: &RenderRequest) -> Result<Vec<u8>, RenderError> {
    // The body is converted to Typst content here, where every piece of user
    // text is escaped, rather than inside the template.
    let body = rich_text_markup(&request.document.description);

    let mut inputs = Dict::new();
    let mut put = |key: &str, value: String| {
        inputs.insert(key.into(), value.into_value());
    };

    put("body", body);
    // A formatted title renders in the masthead; the plain one is the fallback
    // and is also what the document metadata and filename use.
    put("titleBody", runs_markup(&request.document.title_runs));
    put("document", document_json(request));
    put("meta", meta_json(request));
    put("bg", request.theme.bg.clone());
    put("surface", request.theme.surface.clone());
    put("fg", request.theme.fg.clone());
    put("fgMuted", request.theme.fg_muted.clone());
    put("primary", request.theme.primary.clone());
    put("primaryFg", request.theme.primary_fg.clone());
    put("border", request.theme.border.clone());

    let extra = EXTRA_FONTS.get().map(Vec::as_slice).unwrap_or(&[]);
    let fonts = FONTS
        .iter()
        .copied()
        .chain(extra.iter().map(Vec::as_slice));

    let engine = TypstEngine::builder()
        .main_file(template_source(&request.template))
        .fonts(fonts)
        // The shared furniture is resolved by name, so a template can import it.
        .with_static_source_file_resolver([("common.typ", COMMON)])
        .build();

    let document: PagedDocument = engine
        .compile_with_input(inputs)
        .output
        .map_err(|error| RenderError::Compile(format!("{error:?}")))?;

    typst_pdf::pdf(&document, &typst_pdf::PdfOptions::default())
        .map_err(|error| RenderError::Pdf(format!("{error:?}")))
}
