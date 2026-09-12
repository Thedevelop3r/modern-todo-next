// common.typ - the page furniture every variation shares.
//
// A template receives exactly one input, `doc`, which the service assembles.
// Nothing here parses user input: the body arrives as already-escaped Typst
// content produced by markup.rs.

#let theme = (
  bg: rgb(sys.inputs.at("bg", default: "#ffffff")),
  surface: rgb(sys.inputs.at("surface", default: "#f6f7f9")),
  fg: rgb(sys.inputs.at("fg", default: "#0b0d12")),
  muted: rgb(sys.inputs.at("fgMuted", default: "#5b6472")),
  primary: rgb(sys.inputs.at("primary", default: "#4f46e5")),
  primaryFg: rgb(sys.inputs.at("primaryFg", default: "#ffffff")),
  border: rgb(sys.inputs.at("border", default: "#e4e7ec")),
)

#let meta = json(bytes(sys.inputs.at("meta", default: "{}")))
#let doc = json(bytes(sys.inputs.at("document", default: "{}")))

/// The coloured masthead: the organisation, the title, and the reference.
#let masthead(accent: theme.primary, eyebrow: "", title: "", subtitle: "") = {
  block(
    width: 100%,
    fill: accent,
    inset: (x: 18pt, y: 16pt),
    radius: 6pt,
    {
      if eyebrow != "" {
        text(size: 8pt, weight: "bold", fill: theme.primaryFg.transparentize(20%), upper(eyebrow))
        v(4pt, weak: true)
      }
      text(size: 19pt, weight: "bold", fill: theme.primaryFg, title)
      if subtitle != "" {
        v(3pt, weak: true)
        text(size: 9.5pt, fill: theme.primaryFg.transparentize(15%), subtitle)
      }
    },
  )
}

/// A label/value grid. Two columns on a page this width reads best.
#let field_grid(fields) = {
  if fields.len() == 0 { return }
  grid(
    columns: (1fr, 1fr),
    gutter: 0pt,
    ..fields.map(f => block(
      width: 100%,
      inset: (x: 10pt, y: 8pt),
      stroke: (bottom: 0.5pt + theme.border),
      {
        text(size: 7.5pt, weight: "bold", fill: theme.muted, upper(f.label))
        linebreak()
        text(size: 10pt, fill: theme.fg, if f.value == "" { "—" } else { f.value })
      },
    )),
  )
}

/// A section heading with a rule, used between the body blocks.
#let section(title) = {
  v(10pt)
  text(size: 11pt, weight: "bold", fill: theme.fg, title)
  v(3pt, weak: true)
  line(length: 100%, stroke: 0.75pt + theme.border)
  v(6pt, weak: true)
}

/// Checkbox list for subtasks.
///
/// The box is drawn rather than typed: U+2610/U+2611 are missing from most
/// text faces, so a glyph here renders as .notdef tofu. A rect always works,
/// whatever fonts the build happens to embed.
#let checkbox(done) = box(
  width: 8pt,
  height: 8pt,
  radius: 1.5pt,
  fill: if done { theme.primary } else { none },
  stroke: 1pt + if done { theme.primary } else { theme.muted },
  if done {
    // A tick drawn from two strokes, for the same reason.
    place(dx: 1.6pt, dy: 1.2pt, line(
      start: (0pt, 2.6pt),
      end: (1.8pt, 4.4pt),
      stroke: 1.2pt + theme.primaryFg,
    ))
    place(dx: 1.6pt, dy: 1.2pt, line(
      start: (1.8pt, 4.4pt),
      end: (5pt, 0.6pt),
      stroke: 1.2pt + theme.primaryFg,
    ))
  },
)

#let checklist(items) = {
  for item in items {
    block(
      width: 100%,
      inset: (y: 2.5pt),
      grid(
        columns: (14pt, 1fr),
        align(horizon)[#checkbox(item.done)],
        align(horizon)[#text(
          size: 10pt,
          fill: if item.done { theme.muted } else { theme.fg },
          if item.done { strike(item.title) } else { item.title },
        )],
      ),
    )
  }
}

/// A band of elevated values - a school's score and weight, and whatever later
/// variants choose to put here. Purely presentational: which values are worth
/// elevating is the caller's decision, not this service's.
#let highlight_band(items) = {
  if items.len() == 0 { return }
  block(
    width: 100%,
    inset: (x: 14pt, y: 11pt),
    fill: theme.surface,
    radius: 5pt,
    stroke: 0.5pt + theme.border,
    grid(
      columns: items.len() * (1fr,),
      gutter: 10pt,
      ..items.map(item => {
        text(size: 7.5pt, weight: "bold", fill: theme.muted, upper(item.label))
        linebreak()
        text(size: 15pt, weight: "bold", fill: theme.primary, if item.value == "" { "—" } else { item.value })
      }),
    ),
  )
}

/// A table of records - the todos in a project, and later a variant's own
/// collections. Columns that are empty for every row are dropped rather than
/// printed as a column of dashes.
#let record_table(items, headings: ()) = {
  if items.len() == 0 { return }

  // The caller may rename the columns - an evidence manifest is not a todo
  // list - but never reorder or add them: the row shape is fixed by the
  // contract, and a heading that moved would mislabel real data.
  let heading_for(index, fallback) = if headings.len() > index and headings.at(index) != "" {
    headings.at(index)
  } else {
    fallback
  }

  let has(key) = items.any(i => i.at(key, default: "") != "")
  let columns = (
    ("status", heading_for(1, "Status")),
    ("priority", heading_for(2, "Priority")),
    ("due", heading_for(3, "Due")),
  ).filter(c => has(c.at(0)))

  let head(label) = text(size: 7.5pt, weight: "bold", fill: theme.muted, upper(label))
  let cell(value) = text(size: 9.5pt, fill: theme.fg, if value == "" { "—" } else { value })

  table(
    columns: (1fr,) + columns.map(_ => auto),
    inset: (x: 8pt, y: 6pt),
    align: left + horizon,
    stroke: (x, y) => (bottom: 0.5pt + theme.border),
    fill: (x, y) => if y == 0 { theme.surface } else { none },
    head(heading_for(0, "Item")),
    ..columns.map(c => head(c.at(1))),
    ..items.map(item => (
      cell(item.at("title", default: "")),
      ..columns.map(c => cell(item.at(c.at(0), default: ""))),
    )).flatten(),
  )
}

/// Rounded chips for tags.
#let chips(items, fill: theme.surface, stroke_color: theme.border) = {
  if items.len() == 0 { return }
  box(inset: (y: 2pt))[#items.map(t => box(
    fill: fill,
    inset: (x: 6pt, y: 3pt),
    radius: 3pt,
    stroke: 0.5pt + stroke_color,
    text(size: 8pt, fill: theme.muted, t),
  )).join(h(4pt))]
}

/// A handling marking, printed at the top and bottom of every page.
///
/// Deliberately loud and deliberately dumb: this service does not know what the
/// words mean or whether they are warranted, only that the caller asked for
/// them on every page. The colour comes from the theme, not from the text - a
/// marking is not a severity scale.
#let banner_bar(label) = {
  if label == "" { return }
  block(
    width: 100%,
    fill: theme.primary,
    inset: (x: 8pt, y: 4pt),
    radius: 2pt,
    align(center, text(size: 8pt, weight: "bold", fill: theme.primaryFg, upper(label))),
  )
}

/// A standing notice, boxed and quiet. Not a banner: a banner says how the page
/// must be handled, a notice says what the page is - and is read once.
#let notice_box(body) = {
  if body == "" { return }
  block(
    width: 100%,
    inset: (x: 10pt, y: 8pt),
    fill: theme.surface,
    radius: 4pt,
    stroke: (left: 2pt + theme.primary, rest: 0.5pt + theme.border),
    text(size: 8pt, fill: theme.muted, body),
  )
}

/// The footer carries provenance: who generated it, when, and under what id.
#let page_footer() = {
  set text(size: 7.5pt, fill: theme.muted)
  grid(
    columns: (1fr, auto),
    align(left)[
      #meta.at("reference", default: "") ·
      generated #meta.at("generatedAt", default: "")
      #if meta.at("generatedBy", default: "") != "" [ by #meta.generatedBy ]
    ],
    align(right)[#context [#counter(page).display("1 of 1", both: true)]],
  )
}

/// Shared page setup, applied as a show rule.
///
/// It must take the rest of the document and return it: `#show: f` hands the
/// remaining content to `f`, so a version that ignored it would silently
/// render an empty page with only the footer on it.
#let setup(doc_title: "", banner: "", body) = {
  set document(title: doc_title, author: meta.at("generatedBy", default: ""))
  set page(
    paper: "a4",
    // A banner needs room of its own at the top; without one the margin is
    // unchanged, so General and School pages are byte-for-byte what they were.
    margin: (x: 18mm, top: if banner == "" { 16mm } else { 22mm }, bottom: 20mm),
    fill: theme.bg,
    header: if banner == "" { none } else { banner_bar(banner) },
    footer: {
      if banner != "" {
        banner_bar(banner)
        v(4pt, weak: true)
      }
      page_footer()
    },
  )
  set text(font: "Liberation Sans", size: 10pt, fill: theme.fg, lang: "en")
  set par(justify: false, leading: 0.62em, spacing: 0.9em)
  show heading: it => block(above: 12pt, below: 6pt)[
    #text(size: if it.level <= 2 { 12pt } else { 11pt }, weight: "bold", fill: theme.fg, it.body)
  ]
  show link: it => text(fill: theme.primary, underline(it))

  body
}
