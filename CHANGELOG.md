# Changelog

Every notable change to Modern Todo, newest first.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
the project uses [semantic versioning](https://semver.org/spec/v2.0.0.html).

---

## [2.0.0] — 2026-09-12

**A todo stops being a line of text and becomes a document.**

It can now carry files, formatted content, a branded printable record, and a
shape that fits the industry you work in. Four axes, sixty-one features, and one
rule that held throughout: *nothing existing was allowed to change for anyone who
does not use the new parts*.

### Object storage

- **Files on todos, projects and templates**, plus a personal drive per account.
  One GridFS bucket, addressed through a `StoredFile` record — quota, ownership
  and lifecycle live there, never in a raw bucket query.
- **Quotas and tiers** with a race-free reserve / reconcile / release cycle. The
  quota comparison lives in the `$expr` filter of the same update that increments
  the counter, so two concurrent uploads cannot both fit in the same space.
  `GET /api/files/quota` self-heals a counter that has drifted by more than 1%.
- **Streaming multipart upload** — nothing is buffered. A 250 MB upload grows the
  process by about 26 MB.
- **Type comes from the bytes**, never from the client's `Content-Type`: magic-byte
  sniffing, a filename rebuilt from the detected type, and an allowlist.
- **Range-aware downloads** with `ETag`, `304` and `416`, so a browser can seek a
  video that lives behind your session cookie.
- **A boot sweep** that finishes what a restart interrupted and reclaims orphaned
  chunks.

### Compression and live progress

- **Images, video, audio and documents are compressed on upload** by `sharp`,
  `ffmpeg` and `qpdf`, with the available encoders **probed at runtime** — a
  machine without `libx264` falls back rather than failing.
- Compression **never fails an upload and never makes a file larger**. When it
  does not apply, the reason is recorded (`tool missing`, `would have grown the
  file`, `failed`) instead of being silently indistinguishable from never running.
- **Byte-exact progress over one SSE stream per tab**, multiplexed by job id. The
  client names its own job, so a row follows its own progress from the first byte.
- Tools that report nothing (`sharp`, `qpdf`) show an **indeterminate** bar rather
  than an invented percentage.

### Rich text

- **Word-style formatting** on titles and descriptions — bold, italic, underline,
  colour, font, size, alignment, headings, lists, quotes, code and links —
  through a Tiptap editor.
- **Sanitised on the server, on write**, against a small fixed allowlist. `style`
  is permitted but every *value* is validated; a paste cannot borrow the app's own
  chrome to impersonate it.
- Plaintext mirrors are **derived in exactly one place**, which is what keeps
  search, CSV export and quick-add honest.
- Titles take **inline marks only** — a title renders inside one-line cells in the
  table view, the command palette and search results.

### PDF export

- **A Rust microservice** (Axum + Typst) renders branded PDFs on `127.0.0.1`,
  spawned as a child of the Node server. It holds no state, reads no database,
  accepts no URLs, and **never sees HTML** — the sanitised markup is converted to
  a closed node tree before it is sent.
- **Fonts are embedded in the binary**, so a PDF does not depend on what the host
  happens to have installed.
- **Versioned documents** per todo and project: `v1`, `v2`, `v3`, each stored like
  any other file, each carrying who generated it and how long it took. Version
  numbers are allocated atomically, and a deleted version never has its number
  reused.
- An honest **"up to date with the current todo" / "changed since v3"** hint,
  computed from a hash of the content that went into the render.
- The PDF **matches your theme**, in its light palette — a document is printed far
  more often than it is read on a screen.
- Preview, download and permanent delete from the record's own page.

### Application types

One account can run the app as **General, School, Law Enforcement, Hospital or
Restaurant**. Exactly three things vary — the words on screen, the extra fields a
record carries, and presentation. **No component branches on the type**: a new one
is a JSON file, not a patch across the codebase.

- **General** — the app as it always was. No new fields, no renaming, no new
  pages.
- **School** — Assignments, Courses and Subjects; *Not started → In progress →
  Submitted*; course, grade level, assignment type, weight, score and submission
  date; **Courses** and a weighted **Gradebook**. An unmarked assignment reads as
  no grade at all, never as zero.
- **Law Enforcement** — Cases and Operations; *Open → Active → Closed*; case
  number, classification, unit, officer, location and incident time; an
  **Evidence** page and a **chain of custody** on every stored file that outlives
  the file itself. PDFs carry a handling banner on every page and an evidence
  manifest with per-exhibit checksums.
- **Hospital** — Tasks, Wards and Protocols; patient **reference** (never a name),
  bed, triage, care type and due window; **Wards** and **Shift handover** pages.
  Ships a standing notice stating plainly that this is a task manager, not an EHR
  and not a medical device, and that file reads are not audited.
- **Restaurant** — Prep, Stations and Recipes; *To prep → Prepping → Ready*;
  station, shift, covers, supplier, par level, stock on hand and a ticked allergen
  list; **Stations**, **Prep list** and an **Orders** page showing only what is
  below par. A station's PDF prints its prep list and the order sheet that prep
  generates on one page.
- A **per-project override**, so one account can run a School course alongside a
  General project.
- **Switching type hides fields; it never deletes them.** Data from a type you are
  not using stays on the record and is listed on its detail page.

### Added

- `GET/POST /api/files`, `GET /api/files/:id/raw` (Range-aware), `DELETE
  /api/files/:id`, `GET /api/files/quota`, `PUT /api/files/quota/tier`.
- `GET /api/files/events` — live upload and compression progress (SSE).
- `GET /api/files/:id/activity` — one file's chain of custody.
- `GET/POST /api/todo/:id/pdfs`, `GET/DELETE /api/todo/:id/pdfs/:pdfId`, and the
  same four routes for projects.
- `applicationType` on account preferences and as a per-project override;
  `variantData` on todos, projects and templates.
- `organizationName` on a project, printed on every PDF it generates.
- A personal drive page, a files grid with previews, an application-type settings
  page, and a document-versions panel on every todo and project.
- `npm run variants` — expands `shared/variants/*.json` for the browser.

### Changed

- `description` may now hold 40,000 characters, up from 1,500 — real formatted
  prose exceeds the old limit routinely.
- `npm run themes` also emits `shared/themes.generated.json`, so the API and the
  Rust renderer can read the palettes they could not read from CSS.
- The Docker image is multi-stage: a Rust builder for the renderer, and `ffmpeg`
  and `qpdf` in the runtime image.
- Status and priority **words** in a PDF now come from the application type. A
  restaurant's "To prep" and a school's "Not started" are the same status.

### Fixed

- A stale `target/release` renderer beat a freshly built debug one, producing
  PDFs from an older set of templates with no error anywhere. The newest build now
  wins.
- A compressed file's extension is rebuilt from its new type, so a PNG stored as
  WebP is no longer mislabelled.
- Compression silently never applied, because the temp output file had no
  extension for `ffmpeg` to infer a container from.
- A zod failure inside a controller surfaced as a 500 rather than a 400 naming the
  offending field.

### Security

- Uploaded bytes are served with `default-src 'none'; sandbox` and
  `X-Content-Type-Options: nosniff`, and are never trusted to describe themselves.
- The PDF renderer binds loopback only, refuses to start without a 16-character
  key, and compares that key in constant time.
- Attachments are inlined into a render rather than linked, so the renderer never
  needs a credential and can never be turned into an SSRF surface.

---

## [1.0.0] — 2026-09-10

The first stable release: seventy features across a todo application that is one
Next.js project, pages and API served from a single port.

### Added

- **Core** — todos with due dates, five priorities, tags, subtasks, pinning,
  archiving, duplication and daily/weekly/monthly recurrence.
- **Find** — full-text search with highlighted matches, combined filters, sorting
  on five fields, and filter state in the URL so any view is a shareable link.
- **Act** — multi-select with bulk operations, optimistic updates with undo, and a
  trash with restore.
- **Structure** — projects, start dates, effort estimates, a per-todo timer,
  comments, an activity trail, and dependencies with cycle detection.
- **Reuse** — saved views, templates, a tag manager that renames and merges across
  every todo, and natural-language quick add.
- **See** — list, grid, drag-and-drop board, calendar and table views; today,
  upcoming, timeline and weekly-review pages; analytics with trends, a heatmap and
  a streak.
- **Productivity** — a pomodoro timer, reminders with an in-app notification
  centre, permission-gated browser notifications, recently viewed, `j`/`k`
  navigation, multi-level undo and a quick-look preview.
- **Data & account** — JSON and CSV export, import with a dry run, full account
  export, account deletion, per-device sessions, TOTP two-factor with recovery
  codes, an audit log and sample-data onboarding.
- **Personalisation** — 50 themes in light and dark, any Google Font by name
  (proxied, never linked), five text sizes and a compact mode.
- **Platform** — installable PWA, offline detection, error boundaries, an
  accessibility pass, structured request logging with request ids, `/api/health`
  and rate limiting surfaced in the UI.

[2.0.0]: https://github.com/Thedevelop3r/modern-todo/releases/tag/v2.0.0
[1.0.0]: https://github.com/Thedevelop3r/modern-todo/releases/tag/v1.0-stable
