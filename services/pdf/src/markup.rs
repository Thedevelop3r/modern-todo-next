//! Turning the document tree into Typst markup.
//!
//! Every string that reaches the template goes through `escape` first. Typst
//! markup has its own metacharacters (`#` starts code, `[` opens a block, `*`
//! and `_` are emphasis), so unescaped user text could otherwise change the
//! meaning of the document - the same class of problem as SQL injection, in a
//! typesetting language.

use crate::payload::{Block, RichText, Run};

/// Escape text so Typst treats it as literal content and nothing else.
pub fn escape(input: &str) -> String {
    let mut out = String::with_capacity(input.len() + 8);
    for ch in input.chars() {
        match ch {
            // `#` would start a code expression, `\` an escape sequence.
            '#' | '\\' | '$' => {
                out.push('\\');
                out.push(ch);
            }
            // Brackets delimit content blocks.
            '[' | ']' | '{' | '}' => {
                out.push('\\');
                out.push(ch);
            }
            // Emphasis, headings, list markers and labels.
            '*' | '_' | '`' | '<' | '>' | '@' | '=' | '-' | '+' | '/' | '~' | '\'' | '"' => {
                out.push('\\');
                out.push(ch);
            }
            // A carriage return would produce a stray break.
            '\r' => {}
            _ => out.push(ch),
        }
    }
    out
}

/// A quoted Typst string, for places that take a value rather than content.
pub fn quoted(input: &str) -> String {
    let mut out = String::with_capacity(input.len() + 2);
    out.push('"');
    for ch in input.chars() {
        match ch {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' | '\r' => out.push(' '),
            _ => out.push(ch),
        }
    }
    out.push('"');
    out
}

/// Only a `#rrggbb` literal is passed through; anything else falls back.
fn color_literal(value: &str, fallback: &str) -> String {
    let trimmed = value.trim();
    let valid = trimmed.len() == 7
        && trimmed.starts_with('#')
        && trimmed[1..].chars().all(|c| c.is_ascii_hexdigit());
    format!("rgb({})", quoted(if valid { trimmed } else { fallback }))
}

pub fn color(value: &str) -> String {
    color_literal(value, "#0b0d12")
}

/// A CSS length the sanitizer already validated, converted to a Typst length.
fn size_literal(value: &str) -> Option<String> {
    let trimmed = value.trim();
    let (number, unit) = trimmed.split_at(
        trimmed
            .find(|c: char| c.is_alphabetic() || c == '%')
            .unwrap_or(trimmed.len()),
    );
    let parsed: f64 = number.parse().ok()?;
    if !parsed.is_finite() || parsed <= 0.0 || parsed > 200.0 {
        return None;
    }
    match unit {
        // Browser pixels are 96/inch; Typst points are 72/inch.
        "px" | "" => Some(format!("{:.2}pt", parsed * 0.75)),
        "pt" => Some(format!("{parsed:.2}pt")),
        "em" | "rem" => Some(format!("{:.2}em", parsed)),
        "%" => Some(format!("{:.2}em", parsed / 100.0)),
        _ => None,
    }
}

/// Render one run, wrapping it in whatever marks apply.
fn run_markup(run: &Run) -> String {
    if run.text.is_empty() {
        return String::new();
    }

    let has = |name: &str| run.marks.iter().any(|m| m == name);

    // `code` is a raw span, so it must not also be escaped as markup.
    let mut body = if has("code") {
        format!("#raw({})", quoted(&run.text))
    } else {
        escape(&run.text)
    };

    if has("strong") {
        body = format!("#strong[{body}]");
    }
    if has("em") {
        body = format!("#emph[{body}]");
    }
    if has("underline") {
        body = format!("#underline[{body}]");
    }
    if has("strike") {
        body = format!("#strike[{body}]");
    }
    if has("mark") {
        body = format!("#highlight[{body}]");
    }

    // Colour, size and family each map to one text() argument.
    let mut args: Vec<String> = Vec::new();
    if let Some(value) = run.color.as_deref().filter(|v| !v.is_empty()) {
        args.push(format!("fill: {}", color(value)));
    }
    if let Some(value) = run.size.as_deref().and_then(size_literal) {
        args.push(format!("size: {value}"));
    }
    if let Some(value) = run.font.as_deref().filter(|v| !v.is_empty()) {
        // Only the generic families the toolbar offers map to a real face here.
        let family = if value.contains("serif") && !value.contains("sans") {
            "Liberation Serif"
        } else if value.contains("mono") {
            "Liberation Mono"
        } else {
            "Liberation Sans"
        };
        args.push(format!("font: {}", quoted(family)));
    }
    if !args.is_empty() {
        body = format!("#text({})[{}]", args.join(", "), body);
    }

    if let Some(href) = run.href.as_deref().filter(|v| !v.is_empty()) {
        // Only http(s) and mailto reach here - the sanitizer dropped the rest -
        // but the check is repeated because this service trusts nothing.
        if href.starts_with("http://") || href.starts_with("https://") || href.starts_with("mailto:") {
            body = format!("#link({})[{}]", quoted(href), body);
        }
    }

    body
}

pub fn runs_markup(runs: &[Run]) -> String {
    runs.iter().map(run_markup).collect::<Vec<_>>().join("")
}

fn alignment(align: &Option<String>) -> Option<&'static str> {
    match align.as_deref() {
        Some("center") => Some("center"),
        Some("right") => Some("right"),
        Some("justify") => Some("left"), // Typst justifies via par(justify:)
        _ => None,
    }
}

fn block_markup(block: &Block) -> String {
    match block {
        Block::Paragraph { runs, align } => {
            let body = runs_markup(runs);
            if body.trim().is_empty() {
                return String::new();
            }
            match alignment(align) {
                Some(side) => format!("#align({side})[{body}]\n\n"),
                None => format!("{body}\n\n"),
            }
        }
        Block::Heading { level, runs, align } => {
            let body = runs_markup(runs);
            if body.trim().is_empty() {
                return String::new();
            }
            // The document's own title is the level-1 heading, so body
            // headings start at 2 and are clamped to keep the hierarchy sane.
            let depth = (*level).clamp(2, 4);
            let heading = format!("#heading(level: {depth})[{body}]\n\n");
            match alignment(align) {
                Some(side) => format!("#align({side})[{heading}]\n\n"),
                None => heading,
            }
        }
        Block::List { ordered, items } => {
            if items.is_empty() {
                return String::new();
            }
            let entries = items
                .iter()
                .map(|runs| format!("  [{}]", runs_markup(runs)))
                .collect::<Vec<_>>()
                .join(",\n");
            let function = if *ordered { "enum" } else { "list" };
            format!("#{function}(\n{entries}\n)\n\n")
        }
        Block::Quote { runs } => {
            let body = runs_markup(runs);
            if body.trim().is_empty() {
                return String::new();
            }
            format!("#quote(block: true)[{body}]\n\n")
        }
        Block::Code { text } => {
            if text.trim().is_empty() {
                return String::new();
            }
            format!("#block(width: 100%, fill: luma(245), inset: 8pt, radius: 4pt)[#raw({}, block: true)]\n\n", quoted(text))
        }
        Block::Unknown => String::new(),
    }
}

/// The whole rich-text body as Typst content.
pub fn rich_text_markup(rich: &RichText) -> String {
    let rendered: String = rich.blocks.iter().map(block_markup).collect();

    if !rendered.trim().is_empty() {
        return rendered;
    }

    // No tree, but the plaintext mirror may still have something to say.
    if rich.text.trim().is_empty() {
        return String::new();
    }
    rich.text
        .split("\n\n")
        .filter(|para| !para.trim().is_empty())
        .map(|para| format!("{}\n\n", escape(para.trim())))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn escapes_typst_metacharacters() {
        // A `#` would otherwise start a code expression.
        assert_eq!(escape("#let x = 1"), "\\#let x \\= 1");
        assert_eq!(escape("a[b]c"), "a\\[b\\]c");
        assert_eq!(escape("*bold*"), "\\*bold\\*");
        assert!(!escape("plain text").contains('\\'));
    }

    #[test]
    fn quoted_strings_cannot_break_out() {
        assert_eq!(quoted("say \"hi\""), "\"say \\\"hi\\\"\"");
        assert_eq!(quoted("back\\slash"), "\"back\\\\slash\"");
        assert_eq!(quoted("two\nlines"), "\"two lines\"");
    }

    #[test]
    fn only_hex_colours_pass_through() {
        assert_eq!(color("#dc2626"), "rgb(\"#dc2626\")");
        // Anything else falls back rather than reaching the template.
        assert_eq!(color("red; evil"), "rgb(\"#0b0d12\")");
        assert_eq!(color(""), "rgb(\"#0b0d12\")");
    }

    #[test]
    fn css_pixels_become_typst_points() {
        assert_eq!(size_literal("16px").as_deref(), Some("12.00pt"));
        assert_eq!(size_literal("12pt").as_deref(), Some("12.00pt"));
        // Absurd or unparseable sizes are dropped, not clamped silently.
        assert_eq!(size_literal("9999px"), None);
        assert_eq!(size_literal("nonsense"), None);
        assert_eq!(size_literal("0px"), None);
    }

    #[test]
    fn marks_nest_and_links_are_scheme_checked() {
        let run = Run {
            text: "hello".into(),
            marks: vec!["strong".into(), "em".into()],
            href: Some("javascript:alert(1)".into()),
            ..Default::default()
        };
        let markup = run_markup(&run);
        assert!(markup.contains("#strong["));
        assert!(markup.contains("#emph["));
        // The sanitizer already dropped this, and so does the renderer.
        assert!(!markup.contains("javascript"));
    }

    #[test]
    fn falls_back_to_the_plaintext_mirror() {
        let rich = RichText {
            blocks: vec![],
            text: "first para\n\nsecond para".into(),
        };
        let markup = rich_text_markup(&rich);
        assert!(markup.contains("first para"));
        assert!(markup.contains("second para"));
    }
}
