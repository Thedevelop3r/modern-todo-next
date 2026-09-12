// school.typ - the School variation's layout.
//
// The bones are General's. What differs is what comes first: an assignment is
// read for its mark, so the highlight band sits directly under the masthead,
// above the metadata grid, and the course rides in the eyebrow where the
// organisation would otherwise be.

#import "common.typ": *

#show: setup.with(doc_title: doc.at("title", default: "Assignment"))

#let org = meta.at("organization", default: "")
#let version = meta.at("version", default: 0)
#let title_body = sys.inputs.at("titleBody", default: "")

#let course = {
  let found = doc.at("fields", default: ()).filter(f => f.label == "Course")
  if found.len() > 0 { found.first().value } else { "" }
}

#masthead(
  eyebrow: {
    let parts = ()
    if org != "" { parts.push(org) }
    if course != "" { parts.push(course) }
    if parts.len() == 0 { "assignment" } else { parts.join("  ·  ") }
  },
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

// The mark first: it is the reason this sheet gets printed.
#highlight_band(doc.at("highlights", default: ()))

#v(10pt)

#field_grid(doc.at("fields", default: ()))

#v(6pt)

#let body = sys.inputs.at("body", default: "")
#if body.trim() != "" {
  section("Brief")
  eval(body, mode: "markup")
}

#let items = doc.at("items", default: ())
#if items.len() > 0 {
  section("Assignments")
  record_table(items)
}

#let subtasks = doc.at("subtasks", default: ())
#if subtasks.len() > 0 {
  section("Checklist")
  checklist(subtasks)
}

#let tags = doc.at("tags", default: ())
#if tags.len() > 0 {
  section("Subjects")
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
