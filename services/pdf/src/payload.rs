//! The render request contract.
//!
//! Note what this is *not*: HTML. The Node server owns the sanitizer that
//! defines which tags may exist at all, and it converts the sanitized markup
//! into the closed tree below before sending it here. That keeps an HTML parser
//! - and therefore attacker-controlled markup - out of this service entirely,
//! and it keeps the conversion next to the allowlist that decides its shape.

use serde::Deserialize;

/// One run of text with the marks that apply to it.
#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Run {
    #[serde(default)]
    pub text: String,
    /// "strong" | "em" | "underline" | "strike" | "code" | "mark"
    #[serde(default)]
    pub marks: Vec<String>,
    #[serde(default)]
    pub color: Option<String>,
    /// A CSS length as the sanitizer validated it, e.g. "14px".
    #[serde(default)]
    pub size: Option<String>,
    #[serde(default)]
    pub font: Option<String>,
    #[serde(default)]
    pub href: Option<String>,
}

/// A block-level element. The variants match the sanitizer's allowlist exactly.
#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum Block {
    Paragraph {
        #[serde(default)]
        runs: Vec<Run>,
        #[serde(default)]
        align: Option<String>,
    },
    Heading {
        #[serde(default = "default_level")]
        level: u8,
        #[serde(default)]
        runs: Vec<Run>,
        #[serde(default)]
        align: Option<String>,
    },
    List {
        #[serde(default)]
        ordered: bool,
        #[serde(default)]
        items: Vec<Vec<Run>>,
    },
    Quote {
        #[serde(default)]
        runs: Vec<Run>,
    },
    Code {
        #[serde(default)]
        text: String,
    },
    /// Anything the converter did not recognise degrades to plain text rather
    /// than being dropped - losing a user's words silently is worse.
    #[serde(other)]
    Unknown,
}

fn default_level() -> u8 {
    2
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RichText {
    #[serde(default)]
    pub blocks: Vec<Block>,
    /// The plaintext mirror, used when the tree is empty.
    #[serde(default)]
    pub text: String,
}

/// A label/value pair in the metadata grid.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Field {
    pub label: String,
    #[serde(default)]
    pub value: String,
}

/// A row in a list of records - a project's todos, and later a variant's own
/// collections. Everything is pre-formatted text: the renderer does no date
/// arithmetic and knows no status vocabulary.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Item {
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub status: String,
    #[serde(default)]
    pub priority: String,
    #[serde(default)]
    pub due: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Subtask {
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub done: bool,
}

/// Resolved theme colours, so the PDF matches the account's chosen palette.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Theme {
    #[serde(default = "white")]
    pub bg: String,
    #[serde(default = "light_surface")]
    pub surface: String,
    #[serde(default = "near_black")]
    pub fg: String,
    #[serde(default = "grey")]
    pub fg_muted: String,
    #[serde(default = "indigo")]
    pub primary: String,
    #[serde(default = "white")]
    pub primary_fg: String,
    #[serde(default = "light_border")]
    pub border: String,
}

fn white() -> String {
    "#ffffff".into()
}
fn light_surface() -> String {
    "#f6f7f9".into()
}
fn near_black() -> String {
    "#0b0d12".into()
}
fn grey() -> String {
    "#5b6472".into()
}
fn indigo() -> String {
    "#4f46e5".into()
}
fn light_border() -> String {
    "#e4e7ec".into()
}

impl Default for Theme {
    fn default() -> Self {
        Self {
            bg: white(),
            surface: light_surface(),
            fg: near_black(),
            fg_muted: grey(),
            primary: indigo(),
            primary_fg: white(),
            border: light_border(),
        }
    }
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Meta {
    #[serde(default)]
    pub generated_at: String,
    #[serde(default)]
    pub generated_by: String,
    /// The human-facing reference, which is also in the filename.
    #[serde(default)]
    pub reference: String,
    #[serde(default)]
    pub organization: String,
    #[serde(default)]
    pub version: u32,
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Document {
    #[serde(default)]
    pub kind: String,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub title_runs: Vec<Run>,
    #[serde(default)]
    pub description: RichText,
    #[serde(default)]
    pub fields: Vec<Field>,
    /// A handling marking printed on every page - "Official - Sensitive" and
    /// the like. Empty for variants that have nothing to declare, and the
    /// template is what decides whether to honour it.
    #[serde(default)]
    pub banner: String,
    /// A standing notice the variant declares - "this is not a medical record"
    /// and the like. Printed by the templates that honour it; this service does
    /// not decide whether one is needed.
    #[serde(default)]
    pub notice: String,
    /// A second table, for documents that carry two lists - a station's prep
    /// and the order it generates. Same row shape as `items`.
    #[serde(default)]
    pub secondary: Vec<Item>,
    #[serde(default)]
    pub secondary_headings: Vec<String>,
    /// Column headings for `items`, when the default four do not describe what
    /// the table actually holds - an evidence manifest is not a todo list.
    #[serde(default)]
    pub item_headings: Vec<String>,
    /// Values a template prints as a prominent band rather than in the grid -
    /// a school's score and weight, and whatever later variants elevate. The
    /// caller decides which; this service only lays them out.
    #[serde(default)]
    pub highlights: Vec<Field>,
    #[serde(default)]
    pub subtasks: Vec<Subtask>,
    #[serde(default)]
    pub items: Vec<Item>,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub notes: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RenderRequest {
    /// Echoes the caller's request id, so a log line here matches one there.
    #[serde(default)]
    pub request_id: String,
    /// Which application variant's template to use.
    #[serde(default = "general")]
    pub template: String,
    #[serde(default)]
    pub theme: Theme,
    #[serde(default)]
    pub meta: Meta,
    #[serde(default)]
    pub document: Document,
}

fn general() -> String {
    "general".into()
}
