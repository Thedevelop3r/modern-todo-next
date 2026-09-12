// general.typ - the default variation's layout.
//
// Deliberately restrained: a coloured masthead, a metadata grid, the body, then
// subtasks and tags. The later variations change the furniture, not the bones.

#import "common.typ": *

#show: setup.with(doc_title: doc.at("title", default: "Todo"))

#let org = meta.at("organization", default: "")
#let version = meta.at("version", default: 0)

#let title_body = sys.inputs.at("titleBody", default: "")

#masthead(
  eyebrow: if org != "" { org } else { doc.at("kind", default: "todo") },
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

#v(14pt)

#field_grid(doc.at("fields", default: ()))

#v(6pt)

// The body, already converted to Typst content by the service.
#let body = sys.inputs.at("body", default: "")
#if body.trim() != "" {
  section("Details")
  eval(body, mode: "markup")
}

#let items = doc.at("items", default: ())
#if items.len() > 0 {
  section(if doc.at("kind", default: "") == "project" { "Todos" } else { "Items" })
  record_table(items)
}

#let subtasks = doc.at("subtasks", default: ())
#if subtasks.len() > 0 {
  section("Checklist")
  checklist(subtasks)
}

#let tags = doc.at("tags", default: ())
#if tags.len() > 0 {
  section("Tags")
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
