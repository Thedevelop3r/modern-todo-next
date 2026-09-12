// hospital.typ - the Hospital variation's layout.
//
// A handover sheet: what identifies the task, how urgent it is and when it is
// due, then the detail. Two things differ from General - the handling banner on
// every page, and the standing notice at the foot saying plainly what this
// document is not. The notice is printed last because it is read once; the
// banner is printed on every page because it governs the page.

#import "common.typ": *

#let banner = doc.at("banner", default: "")

#show: setup.with(doc_title: doc.at("title", default: "Task"), banner: banner)

#let org = meta.at("organization", default: "")
#let version = meta.at("version", default: 0)
#let title_body = sys.inputs.at("titleBody", default: "")

#let ward = {
  let found = doc.at("fields", default: ()).filter(f => f.label == "Ward")
  if found.len() > 0 { found.first().value } else { "" }
}

#masthead(
  eyebrow: {
    let parts = ()
    if org != "" { parts.push(org) }
    if ward != "" { parts.push(ward) }
    if parts.len() == 0 { "task" } else { parts.join("  ·  ") }
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

// Patient reference, triage and due window: what a handover is read for.
#highlight_band(doc.at("highlights", default: ()))

#v(10pt)

#field_grid(doc.at("fields", default: ()))

#v(6pt)

#let body = sys.inputs.at("body", default: "")
#if body.trim() != "" {
  section("Detail")
  eval(body, mode: "markup")
}

#let items = doc.at("items", default: ())
#if items.len() > 0 {
  section("Tasks")
  record_table(items, headings: doc.at("itemHeadings", default: ()))
}

#let subtasks = doc.at("subtasks", default: ())
#if subtasks.len() > 0 {
  section("Steps")
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

#v(1fr)

// Last on the page, and on every copy of it that leaves the ward.
#notice_box(doc.at("notice", default: ""))
