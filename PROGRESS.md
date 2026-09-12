# PROGRESS — 50-feature program

**Compact resume file. Read this first after any session reset.**
Architecture lives in `CONTEXT.md`; this file is only *what is done and what is next*.

## How to resume

1. Read `CONTEXT.md` §2 (layout), §3 (API), §7 (conventions).
2. Find the first batch below that is not `DONE`.
3. Work batch by batch. After each batch: `npm run build` + `npm test`, then tick
   the boxes here, append to "Decisions", and update `CONTEXT.md` if the API or
   layout changed.
4. Keep this file compact — status and decisions only, never code.

## Verify commands

```bash
npm run build      # types + lint, 24 routes
npm run themes     # regenerate the theme CSS after editing shared/themes.json
npm test           # both suites: API then frontend
npm run test:api   # server/__tests__ (node --test, mongodb-memory-server)
npm run test:web   # src/__tests__ (node --test, node 24 strips the types)
npm run lint
```

---

## Status

| Batch | Theme | State |
|---|---|---|
| 1 | Structure: projects, dates, effort, comments, deps | **DONE** |
| 2 | Organisation: saved views, tags, reorder, templates | **DONE** |
| 3 | Views: today, upcoming, timeline, heatmap, table | **DONE** |
| 4 | Productivity: pomodoro, reminders, nav, undo | **DONE** |
| 5 | Data & account: export, import, sessions, 2FA | **DONE** |
| 6 | Platform: PWA, offline, a11y, health, FE tests | **DONE** |
| 7 | Personalisation: 50 themes, Google Fonts, text size | **DONE** |
| 8 | Storage foundations: GridFS, quotas, tiers, boot sweep | **DONE** |
| 9 | Files: upload, stream, Range, attachments, personal drive | **DONE** |
| 10 | Compression + live progress | **DONE** |
| 11 | Rich text (Tiptap + sanitized HTML) | **DONE** |
| 12 | Rust/Typst PDF service | **DONE** |
| 13 | PDF versioning + UI | **DONE** |
| 14 | Variant infrastructure + General | **DONE** |
| 15 | School | **DONE** |
| 16 | Law Enforcement | **DONE** |
| 17 | Hospital | **DONE** |
| 18 | Restaurant | **DONE** |

Features 1–20 shipped earlier; batches 1–7 added 21–70. Batches 8+ are the SaaS
phase: object storage, rich text, PDF export and application variants. The plan
lives at `~/.claude/plans/modern-to-do-next-the-wobbly-rain.md`.

---

## Batch 1 — Structure

- [x] 21. Projects (create, rename, colour, delete; todos belong to one)
- [x] 22. Project navigation in the sidebar + per-project filtering
- [x] 23. Start dates (with a "starts soon / not started" state)
- [x] 24. Effort estimates in points, with rollups per list and project
- [x] 25. Time tracking (start/stop timer, accumulated minutes)
- [x] 26. Comments thread on a todo
- [x] 27. Activity log per todo (auto-recorded field changes)
- [x] 28. Dependencies (blocked-by / blocks, with a cycle guard)

## Batch 2 — Organisation

- [x] 29. Saved views (named, persisted filter presets)
- [x] 30. Saved views pinned in the sidebar
- [x] 31. Tag manager (rename / merge / delete across every todo)
- [x] 32. Drag-to-reorder in list view (drives the existing reorder API)
- [x] 33. Bulk edit modal (several fields at once)
- [x] 34. Templates (save a todo as a template; create from one)
- [x] 35. Natural-language quick add (`pay rent tomorrow !high #home`)
- [x] 36. Duplicate detection when creating

## Batch 3 — Views

- [x] 37. Today / focus view
- [x] 38. Upcoming view grouped by day
- [x] 39. Timeline (week) view
- [x] 40. Completion heatmap
- [x] 41. Weekly review page
- [x] 42. Per-project analytics
- [x] 43. Print-friendly view
- [x] 44. Table view with sortable columns

## Batch 4 — Productivity

- [x] 45. Pomodoro focus timer
- [x] 46. Reminders + in-app notification centre
- [x] 47. Browser notifications (permission-gated)
- [x] 48. Recently viewed todos
- [x] 49. `j`/`k` list navigation, `x` to select
- [x] 50. Multi-level undo history
- [x] 51. Quick-look preview modal (space)
- [x] 52. Bulk move to project

## Batch 5 — Data & account

- [x] 53. Export todos as JSON
- [x] 54. Export todos as CSV
- [x] 55. Import JSON/CSV with a dry-run preview
- [x] 56. Full account data export
- [x] 57. Account deletion with confirmation
- [x] 58. Session list + revoke all (token versioning)
- [x] 59. Two-factor auth (TOTP)
- [x] 60. Account audit log
- [x] 61. Onboarding with sample data

## Batch 6 — Platform & quality

- [x] 62. PWA manifest, installable
- [x] 63. Offline detection banner
- [x] 64. `error.tsx` / `not-found.tsx` / `loading.tsx` boundaries
- [x] 65. Accessibility pass (skip link, aria-live, focus return)
- [x] 66. Structured request logging with request ids
- [x] 67. `/api/health` with version
- [x] 68. Rate-limit feedback surfaced in the UI
- [x] 69. Frontend test suite (first tests on `src/`)
- [x] 70. UI scale preference

## Batch 8 — Storage foundations

- [x] 71. `shared`-style storage config: tiers, per-kind caps, mime allowlist
- [x] 72. `StoredFile` model + the one GridFS bucket
- [x] 73. Race-free quota reserve / reconcile / release / recompute
- [x] 74. Boot sweep for interrupted uploads and orphaned chunks

## Batch 9 — Files

- [x] 75. Streaming multipart upload (busboy, temp file, no buffering)
- [x] 76. Magic-byte type detection and filename sanitising
- [x] 77. Range-aware streaming download with ETag / 304 / 416
- [x] 78. Attachments on todos and projects; cascade deletes
- [x] 79. Personal drive page with a quota meter and tier picker
- [x] 80. Upload UI with byte-exact per-file progress

## Batch 10 — Compression and progress

- [x] 81. sharp / ffmpeg / qpdf compressors with runtime capability detection
- [x] 82. Transcode semaphore so ffmpeg cannot starve the rest of the container
- [x] 83. In-memory job registry with weighted three-phase progress
- [x] 84. SSE progress stream, one per tab, multiplexed by job id
- [x] 85. Client-named jobs, so a row follows its own progress from byte one
- [x] 86. Indeterminate `Progress` variant for tools that report nothing

## Batch 11 — Rich text

- [x] 87. Server-side sanitizer with a strict allowlist and validated styles
- [x] 88. `titleHtml` / `descriptionHtml` on Todo, Trash, Template, Project
- [x] 89. Plaintext mirrors derived in exactly one place (`applyRichText`)
- [x] 90. `description` limit raised 1500 -> 40000 on both sides
- [x] 91. Tiptap editor with `full` and `inline` toolbar profiles
- [x] 92. Rich rendering on the detail page and quick look; cards stay plaintext

## Batch 12 — Rust/Typst PDF service

- [x] 93. `services/pdf` — axum on loopback, constant-time key, body cap, timeout
- [x] 94. Embedded fonts + the Typst engine; `templates/common.typ` + `general.typ`
- [x] 95. `richtext-doc.js` — sanitized HTML into a closed node tree (no HTML in Rust)
- [x] 96. `pdf.client.js` — 20 s timeout, one connection retry, circuit breaker
- [x] 97. `pdf-service.js` — spawned as a child of `server.js`, backoff restarts
- [x] 98. Multi-stage Dockerfile, `shared/themes.generated.json`, split-out recipe

## Batch 13 — PDF versioning and UI

- [x] 99. `GeneratedPdf` model; one collection for todo and project versions
- [x] 100. Atomic version allocation via `pdfVersionSeq` + `$inc`
- [x] 101. `snapshotHash` behind an honest "up to date / changed since vN"
- [x] 102. The four endpoints, declared once and mounted on both routers
- [x] 103. `PdfPanel` - rows, preview, download, owner-only permanent delete
- [x] 104. `Project.organizationName`, printed on every variant's header

## Batch 14 — Variant infrastructure + General

- [x] 105. `shared/variants/*.json` + `server/config/variants.js` (CJS loader, zod builder)
- [x] 106. `src/lib/variants.ts` + `npm run variants`; `useVariant()` for the app
- [x] 107. Mixed `variantData`, written only as dot paths, validated per variant
- [x] 108. `VariantFields` - one generic renderer over seven field types
- [x] 109. Terminology and status labels from the registry, never hardcoded
- [x] 110. Application settings page + per-project `applicationType` override

## Batch 15 — School

- [x] 111. `school.json`: Assignment / Course / Subject, Submitted, 7 + 4 fields
- [x] 112. Variant pages by **kind** (`group`, `scoreboard`) on one generic route
- [x] 113. Courses and Gradebook, with weighted grades and a whole-set summary
- [x] 114. `school.typ` + a registry-declared `pdfHighlights` band
- [x] 115. Variant fields carried into every PDF, labelled and formatted
- [x] 116. Seed templates offered on the Templates page

## Batch 16 — Law Enforcement

- [x] 117. `law-enforcement.json`: Case / Operation, Open → Active → Closed, 7 + 4 fields
- [x] 118. Chain of custody on the append-only `Activity` model, keyed on file id
- [x] 119. `GET /api/files/:id/activity` + the Evidence page (`files` kind)
- [x] 120. `law-enforcement.typ`: handling banner on every page
- [x] 121. Evidence manifest with per-exhibit checksums, headings from the caller

## Batch 17 — Hospital

- [x] 122. `hospital.json`: Task / Ward / Protocol, triage, care type, due window
- [x] 123. Patient **reference**, never a name - and nowhere in the registry to put one
- [x] 124. A registry-declared standing notice, shown wherever the work is done
- [x] 125. `hospital.typ`: handling banner on every page, notice at the foot
- [x] 126. Wards and Shift handover, both the `group` kind on different fields

## Batch 18 — Restaurant

- [x] 127. `restaurant.json`: Prep / Station / Recipe, To prep → Prepping → Ready
- [x] 128. Par levels and counts, with a `stock` page kind for what is short
- [x] 129. Stations, Prep list and Orders
- [x] 130. `restaurant.typ`: prep sheet and supplier order sheet on one page
- [x] 131. Status and priority words in PDFs come from the variant, not a fixed map

---

## Decisions

*(Append one line per non-obvious choice, newest last.)*

- Program started from a clean tree at commit `517190e`, build green, 39 API tests passing.
- **B1**: `Todo.getTodos` uses an aggregation pipeline, and `$match` does NOT cast strings to
  ObjectId the way `find()` does. Any new id filter must go through `toObjectId()` in
  `Todo.controller.js`, or it silently matches nothing.
- **B1**: the ambient type `Comment` collides with the DOM's built-in `Comment`; the todo one is
  named `TodoComment`. Watch for the same trap with other DOM names (`Event`, `Range`, `Selection`).
- **B1**: deleting a project unassigns its todos (`projectId: null`) rather than cascading.
- **B1**: dependencies are guarded three ways - self-block, foreign todo, and cycle (BFS upward).
  A todo with open blockers cannot be set to `completed`.
- **B1**: only one timer runs per user; starting one banks any other. `timeSpent` is whole minutes.
- **B1 state**: 61 API tests passing, build + lint green, 14 routes.
- **B2**: saved views store the dashboard filter object verbatim and replay it through
  `serializeFilter` - so a saved view is just a URL. `page` is stripped before saving.
- **B2**: tag rename is two steps (pull the target where both exist, then `$set` via
  `arrayFilters`) because a single update cannot rename and de-duplicate at once.
- **B2**: the quick-add parser (`src/lib/quickAdd.ts`) leaves tokens it does not recognise
  in the title - never swallow unparsed text. `@Name` auto-creates a missing project.
- **B2**: drag-to-reorder writes `order` for the whole visible page; the dashboard switches
  `sort` to `order` after a drag, otherwise the new order would not be visible.
- **B2**: `BulkEditModal` applies each field as a separate bulk call in sequence, because the
  API takes one action per request.
- **B2 state**: 75 API tests passing, build + lint green, 16 routes.
- **B3**: `/api/stats` now takes `days` (7-366) and `projectId`; the projectId is cast with
  `toObjectId` for the same aggregation reason as B1.
- **B3**: heatmap is a SEQUENTIAL ramp (validated), index 0 is a neutral "nothing" cell, and
  the dark ramp runs bright = more so busy days do not sink into the surface.
- **B3**: the analytics page pulls 365 days once - the line chart slices the last 30, the
  heatmap uses all of it. One request, two resolutions.
- **B3**: `table` was added to the TodoView union - it must be listed in FOUR places:
  `src/types`, `server/validation/schemas.js` VIEWS, `User.model.js` enum, `src/lib/validation.ts`.
- **B3**: print rules live at the bottom of `globals.css`; `.print:hidden` hides screen chrome.
- **B3 state**: 75 API tests passing, build + lint green, 19 routes.
- **B4**: reminders are *derived*, never stored - anything overdue or due today that is
  not finished. The id is `kind:todoId:dueDay`, so moving a due date makes a dismissed
  reminder come back rather than staying silenced forever.
- **B4**: the undo stack lives in the Zustand store, not in a hook, because the pushers
  (the dashboard) and the readers (Ctrl+Z in `useKeyboard`, the notification centre) are
  in different trees. Entries hold closures, so a reload clears it - deliberate.
- **B4**: undoing a *bulk* action groups the selection by the value each todo had before
  and replays one bulk call per group; toggles (pin/archive/tag) use their inverse action.
- **B4**: `usePersistedIds` returns which ids were newly added, which is what stops a
  browser notification firing twice for the same reminder across re-renders.
- **B4**: `j`/`k`/`x`/`Space` live in `useListNavigation`, separate from the global
  `useKeyboardShortcuts`; Space and Enter defer to a focused button or link.
- **B4**: 52 (bulk move to project) already shipped in B2 - the API action, the bulk bar
  menu and the structure test were all in place; it was ticked, not rebuilt.
- **B4 state**: 75 API tests passing, build + lint green, 19 routes (batch 4 is frontend only).
- **B5**: the JWT now carries `sid` (session) and `tv` (token version) as well as `_id`.
  `auth` rejects a token whose `tv` is stale or whose `sid` is no longer on the user, so
  "revoke all" is a counter bump and "revoke one" is a pull from an array. Any new token
  must go through `Tools.User.generateToken(user, sessionId)` or it will not authenticate.
- **B5**: `SAFE_SELECT` in `User.controller.js` is the only shape a route may see - it
  excludes the password *and* every 2FA field. `toSafeJSON` reduces `twoFactor` to a flag.
- **B5**: TOTP is implemented in `server/utils/totp.js` on node's crypto (HMAC-SHA1,
  30s step, ±1 window) rather than a dependency. Recovery codes are stored as SHA-256
  hashes and are shown exactly once, on enable.
- **B5**: login has three outcomes, not two: bad credentials (400), a 200 carrying
  `{ twoFactorRequired: true }` and no cookie, and success. `useLogin` must not navigate
  on the middle one.
- **B5**: import is one endpoint used twice - `dryRun: true` (the default) reports and
  writes nothing, the same call with `dryRun: false` writes. Projects named in a file are
  matched by name and created when missing.
- **B5**: CSV is `server/utils/csv.js`, hand-rolled both ways; `tags` and `subtasks` are
  pipe-separated, and a subtask carries its state as `[x] ` / `[ ] `.
- **B5**: changing the password revokes every *other* session; deleting the account erases
  all seven collections plus the audit log, and needs the password and the literal DELETE.
- **B5 state**: 93 API tests passing, build + lint green, 21 routes.
- **B6**: the frontend suite runs on node's own runner - node 24 strips the types, so there
  is no jest/vitest and no build step. It needs two things: `allowImportingTsExtensions` in
  `tsconfig.json`, and imports written with an explicit `.ts` extension.
- **B6**: only *pure* modules can be tested that way (a `next/navigation` import does not
  resolve outside the bundler), which is why `parseFilter`/`serializeFilter` moved to
  `src/lib/filters.ts`; `useFilters` re-exports them so existing imports still work.
- **B6**: writing those tests found a real bug - `!urgentish` parsed as `!urgent` plus a
  stray "ish". The quick-add token regexes now end with a `(?=\s|$)` lookahead, so an
  over-long or unknown token is left in the title as documented in B2.
- **B6**: the PWA icons are generated, not hand-drawn - `npm run icons` writes the PNGs
  with a hand-rolled encoder (zlib + CRC), so there is no image dependency.
- **B6**: the service worker never touches `/api` - stale todos would be worse than none.
  It caches hashed build assets first-hand and falls back to the last copy of a page.
- **B6**: every request now carries an id (`X-Request-Id`, `req.id`), echoed in error
  bodies. Logs are JSON in production, a short line in development, silent under test.
- **B6**: `uiScale` sets the root font size, which works because every size in the UI is
  rem-based. Like `table` in B3 it had to be added in four places (model enum, server zod,
  `src/lib/validation.ts`, `src/types`).
- **B6 state**: 97 API tests + 23 frontend tests passing, build + lint green, 22 routes.
- **B7**: a theme is only a different set of the existing semantic tokens, so **no component
  changed**. `shared/themes.json` holds 50 seeds (20 men, 20 women, 10 other);
  `npm run themes` expands them into `src/app/themes.css` and `src/lib/themes.generated.ts`.
  Never hand-edit either.
- **B7**: colours are built in OKLCH, so one lightness ramp works across every hue, and the
  generator **fails the build** on a contrast miss rather than shipping an unreadable theme.
  Verified by deliberately crushing a seed's `--fg`. `primary` walks its lightness until it
  can hold a button label — a fixed value cannot, because a mid green is too light for white
  text and too dark for black.
- **B7**: theme and light/dark stay **orthogonal** — every theme has both modes, so
  `ThemeToggle` and the command palette entries were untouched. Dark surfaces carry 2.4x the
  neutral chroma of light ones, or the tint is invisible against a near-black.
- **B7**: fixed a latent bug — `preferences.theme` was written but never read back, so the
  mode never actually followed a user between devices. `ThemeEffect` now applies it once on
  load.
- **B7**: fonts are **proxied, not linked**. The CSP (`font-src 'self'`) forbids the browser
  from reaching Google, so the API fetches the stylesheet, rewrites every gstatic URL to
  `/api/fonts/file/<id>` and serves the woff2. The CSP stays shut and the service worker
  caches fonts for offline use for free.
- **B7**: `/api/fonts/file/:id` takes an **opaque id, never a URL** — ids exist only after
  parsing a stylesheet Google sent us, which is what closes the SSRF. Tested.
- **B7**: the bundled family list is a convenience, not a gate: a typed name that is not in
  it is still validated against Google and applied, which is what the user asked for.
- **B7**: chart *chrome* (grid, axis, surface) now reads the live tokens, but the
  categorical/ordinal/status data colours are unchanged — they encode meaning and must not
  become decorative per theme.
- **B7**: creating a template is a page (`/dashboard/templates/new`), not a dialog, matching
  `/dashboard/create-todo` — the form was too long for a modal on a phone.
- **B7 state**: 107 API tests + 29 frontend tests passing, build + lint green, 24 routes.
  One pre-existing frontend failure remains in `quickAdd.test.ts` ("tomorrow" relative due
  date) — it fails on a clean tree too and is unrelated to this batch.
- **B8**: quota is a single conditional `findOneAndUpdate` - the `$expr` comparison sits in the
  *filter* of the update that increments, so mongo applies it atomically. This is deliberate:
  mongo:5.0.2 runs standalone here, `session.withTransaction()` throws, and a read-then-write
  would let two concurrent uploads both see room only one of them has. Tested with 10 racing
  claims against a 1 GB quota - exactly 6 of 10 x 150 MB are granted.
- **B8**: the GridFS bucket cannot be a module-level constant - `db.config.js` reads env at load
  and the connection does not exist at require time. `server/utils/gridfs.js` caches it against
  the live `connection.db`, so the test harness's connect/disconnect cycle gets a fresh bucket.
- **B8**: reserve uses the declared `Content-Length`, then reconciles to the real stored size.
  A crash in between inflates the counter forever, so `StorageController.recompute` exists and
  `GET /api/files/quota` self-heals when drift passes 1% of the quota.
- **B8**: an interrupted upload cannot be resumed - the HTTP body died with the process. The boot
  sweep in `server.js` marks them failed, drops their chunks (invisible and unbilled otherwise)
  and recomputes the affected owners.
- **B9**: **always delete GridFS bytes before the `StoredFile` row.** The reverse orphans chunks
  that no query in the app can reach.
- **B9**: `kind` comes from a magic-byte sniff, never from the client's `Content-Type`. A stored
  file is streamed back with an inline `Content-Disposition`, so a `.mp4` that is really HTML
  would run script on our own origin. `server/utils/file-type.js` also rebuilds the extension
  from the detected mime, so the name can never disagree with the bytes.
- **B9**: **GridFS `end` is exclusive, HTTP Range `end` is inclusive** - `openDownloadStream(id,
  {start, end: end + 1})`. Getting this wrong breaks video seeking in Safari specifically.
  Covered by a test asserting the exact slice.
- **B9**: the raw route sets `Cache-Control: private` (authorized bytes must never reach a shared
  cache) and its own `Content-Security-Policy: default-src 'none'; sandbox`, overriding helmet
  for that one route.
- **B9**: `<video src="/api/files/:id/raw">` authenticates on its own - same origin, `SameSite=Lax`
  cookie, subresource GET. Never add `crossOrigin`, which would suppress the cookie. A 401 in a
  media element surfaces as "unsupported source" with no status, so `FilePreview` re-checks
  `/api/user/me` on error and says the session expired instead of blaming the file.
- **B9**: upload progress uses `XMLHttpRequest`, not `fetch` - fetch has no upload progress event.
  `api.upload()` in `src/lib/api.ts` is the only non-fetch call in the client.
- **B9**: `helpers.reset()` now clears *every* collection rather than the ones with a model -
  GridFS creates `files.files`/`files.chunks` on first use and leftover chunks leaked between tests.
- **B9**: a todo's attachments survive the trash and die with the permanent delete, matching how
  the todo itself behaves. Deleting a project drops only the project's own files; its todos and
  their files live on, consistent with B1's no-cascade decision.
- **B9 state**: 154 API tests + 29 frontend tests passing, build + lint clean, 26 routes.
  Verified against a real running server: a 250 MB upload moved through with RSS rising ~26 MB
  (228 -> 254 MB peak), and a real mp4 round-tripped byte-identical with a correct 206 slice.
- **B9 note**: this machine's ffmpeg 8.1 has **no libx264** (only `mpeg4` and the `h264_v4l2m2m`
  hardware wrapper). Debian's ffmpeg package in the container does ship it, so the B10 video
  profile must pick an available encoder at runtime rather than assuming libx264.
- **B10**: progress is **three weighted phases** - upload 0.35, compress 0.45, store 0.20, and
  0.7/0.3 when compression is off. Upload and store are byte-exact for every kind of file, so
  only the middle leg ever has to be vague.
- **B10**: ffmpeg gives genuine progress (`-progress pipe:1`, `out_time_us` over the probed
  duration). **sharp and qpdf expose no progress hook at all**, so those report
  `determinate: false` and the bar shows a sliding band with a stage label. Inventing a
  percentage there would be a lie, and both finish in under a second at our size caps.
- **B10**: compression capabilities are **probed at runtime, never assumed**. This machine's
  ffmpeg 8.1 has no libx264, so the video profile falls back mpeg4, and qpdf is absent
  entirely. `detect()` picks the best available encoder and the PDF compressor degrades to
  storing the original.
- **B10**: **the temp output file needs its container's extension.** ffmpeg infers the format
  from it and fails with "Error opening output files: Invalid argument" without one - which
  showed up as compression silently never applying. Each compressor now declares its
  `outputMime` and the extension comes from that. Regression test covers it.
- **B10**: a compression that does not apply records **why** in `compression.note` (tool
  missing / would have grown the file / failed). Silently falling back was indistinguishable
  from compression never having been asked for, which is what hid the bug above.
- **B10**: compression never fails an upload and never makes a file larger - on any error, or
  any result bigger than the input, the original is stored instead.
- **B10**: re-encoding can change the container (png to webp, wav to ogg), so the **filename
  extension is rebuilt from the new mime**. The stored name always matches the stored bytes.
- **B10**: **one SSE stream per tab**, multiplexed by job id - not one per upload. HTTP/1.1
  allows six connections per origin, so a stream each would let a few concurrent uploads
  starve the rest of the app. `Cache-Control: no-transform` and `X-Accel-Buffering: no` matter
  as much as `no-cache`: a proxy that compresses the stream would buffer it and the bar would
  jump 0 to 100.
- **B10**: the **client names the job** (`X-Job-Id`, a v4 UUID) so a row can match its own
  progress events before the POST returns. The id only ever addresses a job inside that user's
  own stream - fan-out is keyed by `ownerId` - so it can never reach another account.
- **B10**: progress lives in memory only; a job that writes 4 Hz updates to mongo would be
  pointless traffic. Only state transitions persist, onto `StoredFile.state`.
- **B10**: `MAX_CONCURRENT_TRANSCODES=2` and `-threads 2`: ffmpeg would otherwise starve Node,
  Next and (later) the PDF service inside one container.
- **B10 state**: 169 API tests passing (1 skipped where qpdf is absent) + 29 frontend, build
  and lint clean. Verified live: a 4.95 MB video compressed to 3.75 MB over 19 real
  determinate progress events, and a PNG to WebP with the compress leg correctly reporting
  indeterminate.
- **B11**: `server/utils/sanitize.js` is the **only** thing between a paste and
  `dangerouslySetInnerHTML`. Sanitising happens on the **server, on write** - the client never
  sanitises, because a second copy would imply the client's version mattered.
- **B11**: `style` is allowed but every *value* is validated (hex or named colour, a unit-bearing
  size, a plain family list, one of four alignments). Banning the attribute would have been
  simpler, but the product asks for font, size and colour, and those cannot be class names.
  `url()`, `position`, `behavior` and anything else are dropped.
- **B11**: `allowedClasses` is limited to the four alignment classes. Without that, a paste could
  carry `bg-primary fixed inset-0` and borrow the app's own chrome to impersonate it.
- **B11**: **`applyRichText` in `server/utils/rich-fields.js` is the single derivation point.**
  Every writer goes through it - editor, quick-add, import, sample data, duplicate, templates,
  projects. Two call sites deriving the mirror independently is how the text index quietly rots.
- **B11**: when both halves are sent, **the markup wins**. Otherwise a client could send real
  HTML with a forged plaintext mirror and poison what search and CSV export see.
- **B11**: a **paragraph break is `\n\n` and a `<br>` is `\n`** in the mirror. Collapsing both to
  one newline made `textToHtml(htmlToText(x))` lose the paragraph structure - caught by a
  round-trip test, fixed in `htmlToText`.
- **B11**: titles get **inline marks only** - no headings, lists or alignment - because a title
  renders inside one-line cells in the table view, command palette and search results. Block
  tags in a pasted title are flattened to **spaces**, both opening and closing: replacing only
  the closing tag still let "</h1><p>para" collapse into "...para".
- **B11**: pasted `<b>`/`<i>` are normalised to `<strong>`/`<em>` rather than stripped, so a
  paste from elsewhere keeps its formatting.
- **B11**: `description` maxlength went 1500 -> 40000 in `Todo.model.js`, `Template.model.js` and
  **both** zod mirrors. Plaintext derived from a real formatted document exceeds 1500 constantly,
  and the mirror write would have failed validation on update.
- **B11**: **`TodoCard` deliberately still renders plaintext** - it runs search highlighting
  through `splitHighlight`, which cannot operate on markup. `RichTextView` is for the detail
  page and quick look only.
- **B11**: `displayHtml()` falls back to the plaintext mirror when the markup is empty, so todos
  written before this batch - and anything from quick-add or import - still render.
- **B11**: Tiptap v3 **bundles Underline and Link inside StarterKit**, and ships `Color`,
  `FontSize` and `FontFamily` inside `@tiptap/extension-text-style`. Installing those separately
  causes duplicate-extension errors; the four redundant packages were removed.
- **B11**: the editor mounts client-only (`immediatelyRender: false`) - a server pass produces
  markup React then disagrees with. Toolbar buttons use `onMouseDown={preventDefault}` or they
  steal focus and lose the selection they are about to act on.
- **B11**: the editor's font list is deliberately **system families only**. A free-text family
  would be loaded from Google, and the CSP forbids the browser from reaching Google directly -
  the account-level picker exists precisely because it proxies through `/api/fonts`.
- **B11 state**: 192 API tests + 38 frontend tests passing, build and lint clean. Verified live:
  a todo carrying `<script>`, `onerror` and a `javascript:` link stored none of them, kept its
  headings, list, inline colour and real link, and was still found by a search on a word that
  only appears inside the formatting.
- **B12**: the renderer **never sees HTML**. `server/utils/richtext-doc.js` converts sanitized
  markup into a closed tree of blocks and runs, and `payload.rs` deserialises exactly that.
  The converter sits next to `sanitize.js` so the allowlist and the mapping cannot drift, and
  no HTML parser - therefore no attacker-controlled markup - runs inside the service.
- **B12**: an unrecognised node degrades to plain text rather than being dropped. Losing a
  user's formatting is a bug; losing their words is a different kind of bug.
- **B12**: `typst-as-lib` rather than a hand-rolled `World`. The plan flagged the `World` trait
  as the program's largest unknown; the crate pre-implements it, and the time went into the
  templates instead.
- **B12**: **fonts are embedded via `include_bytes!`** - a slim image has none, and a PDF whose
  text depends on what the host happens to have installed is not reproducible. DejaVuSans rides
  along as the wide-coverage fallback so non-Latin text is not a row of .notdef boxes;
  `PDF_FONT_DIR` adds faces on top without touching the guaranteed baseline.
- **B12**: rendering runs on `spawn_blocking`. It is CPU-bound, and on the async runtime one
  large document would stall every other request behind it.
- **B12**: the service **exits at boot without a 16-character key**. Running open on loopback
  is still running open, and a service that starts anyway is the one you forget about.
- **B12**: the client retries **only a connection error, exactly once** - a 4xx means the payload
  is wrong and would fail identically - and the breaker opens after 5 consecutive failures so a
  renderer that is down answers immediately instead of making every caller wait out 20 seconds.
  A 401 surfaces as "misconfigured", never as the caller's fault.
- **B12**: `PDF_SERVICE_HOST` was added during this batch. `127.0.0.1` is right in the shared
  container and wrong in a container of its own, where loopback admits nobody at all - without
  it the documented split-out recipe would not have worked.
- **B12**: the Dockerfile builds deps against a stub `main.rs` first, so a source change does not
  recompile typst. It also installs ffmpeg and qpdf, which the image had been missing since B10.
- **B12 state**: 201 API tests passing (1 skipped where qpdf is absent) + 38 frontend + 7 Rust,
  build and lint clean. Verified live: a real todo with headings, an ordered list, a quote, a
  code block, Typst metacharacters and a coloured title rendered to a 38 KB PDF in 710 ms, and
  the same request without the key got a bare 401.
- **B13**: a generated PDF is **two records** - a `StoredFile` (so it counts against the quota,
  streams with Range and deletes like anything else) and a `GeneratedPdf` row holding the
  version. They are written and deleted together; a version pointing at bytes that are gone is
  worse than no version at all.
- **B13**: one collection serves todos and projects (`subject: {kind, refId}`) and
  `server/routes/pdf.routes.js` declares the four endpoints once and mounts them twice. The
  plan named the model `TodoPdf`; two near-identical models - and eight copied handlers - is
  how the two quietly drift apart, so it is `GeneratedPdf` instead.
- **B13**: **`$inc` on `pdfVersionSeq`, never `count() + 1`.** Covered by a test that fires
  three renders at once and asserts 1, 2, 3. Deleting a version does not lower the sequence
  either - v4 stays taken once v4 is gone, so a file already downloaded is never ambiguous.
- **B13**: `snapshotHash` hashes the **content only** - document, theme, template - with the
  timestamp, version and request id left out. Hashing the whole payload would make every render
  differ from every other one and the "up to date" hint pure noise.
- **B13**: **POST answers 202 with the job id.** A render takes most of a second and the client
  already watches `/api/files/events`; holding the request open buys nothing. Ownership is still
  checked *inside* the request, so a stranger gets a 404 rather than a 202 and silence - and
  does not burn a version number, which is asserted.
- **B13**: the job registry grew a `phases` argument rather than a second registry. PDF work is
  `render` (indeterminate - typst reports nothing) then the same `store` leg an upload uses.
- **B13**: a failed render leaves **no version row, no StoredFile and no quota charge** - only
  the burned number. Verified by stubbing the renderer to throw.
- **B13**: version rows are cascaded inside `FileController.destroyScope`, next to the bytes
  they point at, rather than at each cascade site - a new cascade cannot forget them there.
- **B13**: the renderer's payload gained an `items` table (`record_table` in `common.typ`), so a
  project PDF lists its todos. Columns empty for every row are dropped rather than printed as a
  column of dashes.
- **B13**: a PDF always takes the **light** half of the palette. It is printed far more often
  than it is read on a screen, and a dark theme burns a page of toner.
- **B13 state**: 213 API tests passing (1 skipped where qpdf is absent) + 38 frontend + 7 Rust,
  build and lint clean. Verified live: a project with three todos rendered a 30 KB PDF carrying
  its organisation letterhead, the todo table with its Due column, the rich-text description and
  a provenance footer; the same render round-trips through the API in the integration test.
- **B14**: the registry is `shared/variants/*.json`, read by the API directly and by the browser
  through a generated TS module (`npm run variants`). The generated step is not ceremony:
  `src/lib/variants.ts` is covered by `test:web`, which runs on node's type stripping with no
  bundler, and a JSON import would not resolve there. Same arrangement as the themes.
- **B14**: **no component branches on the variant id.** Components ask for a label or a field
  list; `STATUS_LABEL`/`PRIORITY_LABEL` imports were replaced by `useVariant()` in every
  consumer. `STATUS_DOT` and the chart palettes deliberately did **not** change - colour encodes
  meaning across all five variants.
- **B14**: extra fields are a **Mixed `variantData` map**, not five typed sub-schemas: forty
  schema paths would be cast on every read of every todo, and each new field would be a
  migration.
- **B14**: **additivity comes from the write path, not the schema.** Dot paths only
  (`variantData.school.course`); a whole-object assign both drops the other variants' data and
  is the form Mongoose will not persist for a Mixed path. The insert is the one exception - it
  has nothing to merge with. A test asserts both halves, including the clobber.
- **B14**: Mongoose minimizes empty objects, so `variantData` is **absent** rather than `{}` on
  a record that never carried extras. Every reader optional-chains it; a test pins it.
- **B14**: field `type` is a **closed set of seven**, which is what keeps `VariantFields` a
  switch over existing ui primitives rather than a branch on the variant.
- **B14**: field schemas are built **lazily, cached against the field array itself**. That is
  what lets the tests populate a variant in place and cover field validation before any variant
  declares fields - otherwise none of this machinery would be tested until batch 15.
- **B14**: a zod failure inside the controller had to be translated to a **400 naming the
  field's label**. `validate()` is the only middleware that knows zod, so the raw throw
  surfaced as a 500 - found by the first live test of a populated variant, not by the unit
  tests.
- **B14**: **switching variants writes nothing.** The fields of the variant you leave stay on
  the record and are listed in a collapsed "Fields from School" panel on the detail page, which
  is the visible proof. Asserted by a test that compares `updatedAt` either side of a switch.
- **B14**: a template carries `variantData` in both directions - snapshot and instantiate - so a
  template of a School todo is not worth nothing.
- **B14 state**: 226 API tests passing (1 skipped where qpdf is absent) + 45 frontend + 7 Rust,
  build and lint clean. General adds no fields and renames nothing, so existing accounts see no
  change - the whole pre-existing suite passes untouched. Verified live with a temporarily
  populated School variant: all six field types round-tripped through the API, a bad enum,
  number and date each answered 400, one field updated left the rest of the sub-object alone,
  and switching to Hospital kept the School data and refused to write over it.
- **B15**: pages are declared by **kind**, not by component. `group` lists one card per distinct
  value of a field; `scoreboard` adds the weighted mark. One route (`/dashboard/v/[pageId]`)
  renders both, parameterised by field keys from the registry - so Law Enforcement's Cases and
  Restaurant's Stations are already the `group` kind with a different key, and the moment a
  variant wants something genuinely new it adds a *kind*.
- **B15**: **an unmarked assignment is not a zero.** `scoreSummary` returns `percent: null` when
  nothing is back, and a score with no maximum is not a mark at all - 42 out of nothing is not a
  percentage. Both are tested, because a gradebook that reports 0% for work not yet marked is
  worse than one that reports nothing.
- **B15**: weights are used where they exist and evenly otherwise, so a course that weights half
  its work still gets an honest number rather than none.
- **B15**: which fields the PDF elevates is **declared in the registry** (`pdfHighlights`), and
  the band prints them in the registry's order - the band is a sentence ("42 out of 50, worth
  15%") and the variant is what knows how it reads. A blank highlight still prints: an unmarked
  score is information. A blank grid field is noise and is dropped.
- **B15**: `school.typ` puts the mark band directly under the masthead and moves the course into
  the eyebrow. An assignment is read for its mark; General's order would bury it.
- **B15**: variant fields reach the PDF already labelled and formatted by the controller - an
  enum prints its label, a date its formatted form, a checklist "2 of 5 done". The renderer
  still knows nothing about courses or wards.
- **B15**: `binaryPath()` now prefers the **newest** cargo build rather than release
  unconditionally. A stale `target/release` beat the fresh debug build and rendered an
  end-to-end test's PDF with last build's templates - a 12 KB document with nothing on it but a
  footer, and no error anywhere. Found only by reading the rendered text.
- **B15 state**: 235 API tests passing (1 skipped where qpdf is absent) + 55 frontend + 7 Rust,
  build and lint clean. Verified live end to end: a School account's assignment rendered through
  the API to a 29 KB PDF carrying the Fairview High / Physics eyebrow, the 42 / 50 / 15 mark
  band, the course and assignment-type grid, and the brief - and the project's PDF recorded
  `variant: "school"` too.
- **B16**: the chain of custody is the **existing `Activity` model**, not a new collection. It
  is already append-only and never edited, which is the only property a custody trail needs.
  Rows are matched on `meta.fileId`, so **the trail outlives the file** - a deletion is the most
  important entry in it, and a trail that vanished with the bytes would be worthless. Tested.
- **B16**: custody events are recorded for **every** variant, not only this one. A per-variant
  write path would mean the trail only exists when someone remembered to turn it on.
- **B16**: Evidence is a page **kind** (`files`), not a page component - the same machinery
  School's Courses uses, pointed at the file list instead. Each kind now renders from its own
  body so a files page does not fetch a hundred todos it never shows.
- **B16**: the **banner is a field the registry points at** (`pdfBannerField`), not a special
  case in the renderer. `banner_bar` is deliberately dumb: it does not know what the words mean
  or whether they are warranted, only that the caller asked for them on every page. Its colour
  comes from the theme - a handling marking is not a severity scale.
- **B16**: a banner widens the top margin; without one the page is byte-for-byte what it was, so
  General and School documents are unchanged.
- **B16**: manifest **column headings come from the caller** but the row shape does not. A
  heading that could move would mislabel real data, so `record_table` renames columns and never
  reorders them.
- **B16**: the manifest lists `source: "upload"` files only - a previous version of the very
  document being rendered is a generated file in the same scope, and is not an exhibit. Tested.
- **B16**: a manifest row carries the **first twelve hex of the sha256** the file was stored
  under. A full digest does not fit a printed column, and twelve characters is plenty to check a
  sheet against the bytes years later.
- **B16 state**: 244 API tests passing (1 skipped where qpdf is absent) + 60 frontend + 7 Rust,
  build and lint clean. Verified live end to end: a sensitive case rendered to a 35 KB PDF with
  OFFICIAL — SENSITIVE at the head and foot of the page, the case number / classification /
  incident band, the narrative, and a two-row evidence manifest with real checksums.
- **B17**: the plan's two deliberate constraints are both **pinned by tests**, not left to
  good intentions. The notice says this is not an EHR and not a medical device, and it says
  **file reads are not audited** - the app has no read trail, that is a scoped decision, and the
  people using it are told rather than left to assume otherwise.
- **B17**: the notice is **registry data** (`variant.notice`), rendered by one component placed
  on the variant pages and the settings card. A notice that lived inside a page component is a
  notice that would be missed on the next page someone adds.
- **B17**: `patientRef` is a *reference*, and a test asserts the registry offers **no** field
  matching name/dob/diagnosis. The cheapest way to avoid holding identifiers you should not hold
  is to have nowhere to put them.
- **B17**: Wards and Shift handover are both the **`group` kind** pointed at different fields -
  no new machinery at all, which is the point of declaring pages by kind.
- **B17**: `notice_box` is deliberately not a banner. A banner says how the page must be
  handled and prints on every page; a notice says what the page *is* and is read once, at the
  foot.
- **B17 state**: 250 API tests passing (1 skipped where qpdf is absent) + 64 frontend + 7 Rust,
  build and lint clean. Verified live end to end: a ward task rendered to a 32 KB handover sheet
  with CONFIDENTIAL — PATIENT IDENTIFIABLE at head and foot, the reference / triage / window
  band, the ward and bed grid, and the standing notice boxed at the bottom of the page.
- **B18**: a record with **no par level is not stock** and never reaches an order sheet -
  treating a missing par as zero would put every ordinary task on it. A missing *count* is zero,
  though: nothing on hand is exactly the case an order sheet exists for. Both tested on both
  sides.
- **B18**: the order sheet is a **second table** (`document.secondary`), not a swap - a station
  prints its prep and the order that prep generates on one page, because a kitchen has no time
  to open two documents.
- **B18**: allergens are a **checklist**, not free text. Ticking a closed list is what makes the
  printed sheet trustworthy, and the type already existed.
- **B18**: the last variant leak, found by reading a live sheet: PDFs printed a **fixed status
  vocabulary** ("Not started") whatever the variant. Status and priority words now come from the
  registry like everything else, and a project's grid calls its records what the variant calls
  them. Pinned by a test asserting a restaurant's sheet says "To prep".
- **B18**: four page kinds now cover all five variants - `group`, `scoreboard`, `files`,
  `stock` - and every variant's pages are declared in JSON. No component branches on a variant
  id anywhere in the codebase.
- **B18 state**: 257 API tests passing (1 skipped where qpdf is absent) + 70 frontend + 7 Rust,
  build and lint clean. Verified live end to end: a station rendered to a 33 KB sheet carrying
  the prep list in the kitchen's own vocabulary and an order sheet listing exactly the two items
  below par, worst shortfall first.

---

## The program is complete

All 18 batches are DONE: features 1-20 shipped before this program, 21-70 across batches 1-7,
and 71-131 across the SaaS phase. The final gate: **257 API tests + 70 frontend + 7 Rust**, one
skipped where `qpdf` is absent from this machine, `npm run build` and `npm run lint` clean, and
every variant verified by rendering a real document through the API and reading the text back
out of the PDF.
