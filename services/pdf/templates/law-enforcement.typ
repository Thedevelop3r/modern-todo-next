// law-enforcement.typ - the Law Enforcement variation's layout.
//
// Two things differ from General, and both are about the document leaving the
// building: a handling marking on every page, top and bottom, and an evidence
// manifest that lists what was attached to the case with the checksum each was
// stored under.

#import "common.typ": *

#let banner = doc.at("banner", default: "")

#show: setup.with(doc_title: doc.at("title", default: "Case"), banner: banner)

#let org = meta.at("organization", default: "")
#let version = meta.at("version", default: 0)
#let title_body = sys.inputs.at("titleBody", default: "")

#masthead(
  eyebrow: if org != "" { org } else { "case record" },
  title: if title_body.trim() != "" {
    eval(title_body, mode: "markup")
  } else {
    doc.at("title", default: "Untitled")
  },
  subtitle: {
    let parts = ()
    if meta.at("reference", default: "") != "" { parts.push(meta.reference) }
    if version > 0 { parts.push("Version " + str(version)) }
    parts.join("  ·  ")
  },
)

#v(12pt)

// Case number, classification and incident time: what identifies the record.
#highlight_band(doc.at("highlights", default: ()))

#v(10pt)

#field_grid(doc.at("fields", default: ()))

#v(6pt)

#let body = sys.inputs.at("body", default: "")
#if body.trim() != "" {
  section("Narrative")
  eval(body, mode: "markup")
}

// The manifest. Headings come from the caller, because these rows are exhibits
// rather than tasks.
#let items = doc.at("items", default: ())
#if items.len() > 0 {
  section("Evidence manifest")
  record_table(items, headings: doc.at("itemHeadings", default: ()))
  v(4pt)
  text(size: 7.5pt, fill: theme.muted, "Each checksum is of the bytes as stored.")
}

#let subtasks = doc.at("subtasks", default: ())
#if subtasks.len() > 0 {
  section("Actions")
  checklist(subtasks)
}

#let tags = doc.at("tags", default: ())
#if tags.len() > 0 {
  section("Flags")
  chips(tags)
}

#let notes = doc.at("notes", default: ())
#if notes.len() > 0 {
  section("Notes")
  for note in notes {
    block(
      width: 100%,
      inset: (x: 10pt, y: 7pt),
      fill: theme.surface,
      radius: 4pt,
      text(size: 9.5pt, fill: theme.fg, note),
    )
    v(4pt, weak: true)
  }
}
