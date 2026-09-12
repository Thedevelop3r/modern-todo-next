// restaurant.typ - the Restaurant variation's layout.
//
// Two sheets in one template, because a station prints both and a kitchen has
// no time to open two documents: the prep list, then the order sheet of
// everything that has run below its par level. A document with only one of them
// prints only that one.

#import "common.typ": *

#show: setup.with(doc_title: doc.at("title", default: "Prep"))

#let org = meta.at("organization", default: "")
#let version = meta.at("version", default: 0)
#let title_body = sys.inputs.at("titleBody", default: "")

#masthead(
  eyebrow: if org != "" { org } else { "service" },
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

// Station, shift and covers: what a section chef reads first.
#highlight_band(doc.at("highlights", default: ()))

#v(10pt)

#field_grid(doc.at("fields", default: ()))

#v(6pt)

#let body = sys.inputs.at("body", default: "")
#if body.trim() != "" {
  section("Method")
  eval(body, mode: "markup")
}

#let items = doc.at("items", default: ())
#if items.len() > 0 {
  section("Prep")
  record_table(items, headings: doc.at("itemHeadings", default: ()))
}

// Everything below par, and how much of it to order.
#let orders = doc.at("secondary", default: ())
#if orders.len() > 0 {
  section("Order sheet")
  record_table(orders, headings: doc.at("secondaryHeadings", default: ()))
}

#let subtasks = doc.at("subtasks", default: ())
#if subtasks.len() > 0 {
  section("Steps")
  checklist(subtasks)
}

#let tags = doc.at("tags", default: ())
#if tags.len() > 0 {
  section("Labels")
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

#notice_box(doc.at("notice", default: ""))
