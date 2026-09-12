# CONTEXT.md — Modern Todo

Working context for future changes. Verified against the source after the
single-app conversion and the feature/UI overhaul.

---

## 1. What this is

A personal todo application by Bilal Amjad (@thedevelop3r), MIT licensed, served
as **one Next.js project with a custom server**:

- **UI** — Next.js 14.0.4 App Router, React 18, TypeScript 5 (strict), Tailwind 3,
  Radix primitives, framer-motion, TanStack Query, Zustand, Recharts
- **API** — Express 4 + Mongoose 8 on MongoDB, JWT in an `HttpOnly` cookie, zod validation
- **One process, one port.** `server.js` prepares Next, mounts the Express app at
  `/api`, and hands every other request to the Next request handler.

```
node server.js
     │
     ├── /api/*   →  Express app (server/app.js)
     └── /*       →  Next.js handler (src/app/)
```

Single origin is load-bearing: **there is no CORS layer**, the session cookie is
same-site, and the browser calls the API with relative paths. Do not reintroduce
absolute API URLs.

A todo has: title, description, status, **priority, tags, subtasks, due date,
recurrence, pinned, archived, order, completedAt**, plus the rich-text halves
**titleHtml / descriptionHtml** and any **attachments**. Deleting one moves a copy to
**Trash** (recoverable, keeping its original `_id`); **archiving** is a separate,
non-destructive state.

---

## 2. Layout

```
server.js              custom server: dotenv → mongo connect → next.prepare() → express
server/                the API (CommonJS)
  app.js               Express sub-app mounted at /api
  db.config.js         DatabaseConnection wrapper around mongoose
  config/              storage.js - tiers, per-file caps, mime allowlist, file bit flags
                       variants.js - the application variants + their zod field schemas
  routes/              index.js, user.route.js, todo.route.js, trash.route.js, stats.route.js,
                       project.route.js, library.route.js, account.route.js, file.route.js,
                       pdf.routes.js (mounted onto both todo and project)
  controller/          User, Todo, Trash, Stats, Project, Activity, Library, Account, Security,
                       File, Storage, Pdf
  models/              User, Todo (exports shared `todoFields`), Trash, Project, Comment,
                       Activity, SavedView, Template, AuditLog, StoredFile, GeneratedPdf
  services/            storage-sweep.js (boot reconciliation), compression.js,
                       job-registry.js (in-memory upload progress),
                       pdf-service.js (spawns the renderer), pdf.client.js (talks to it)
  middleware/          auth, validate, rate-limit, checkin-logger, error-handler, not-found
  validation/schemas.js  zod schemas — the CJS mirror of src/lib/validation.ts
  utils/               api-error.js (ApiError), user.js (JWT+cookie), totp.js, csv.js,
                       fancy.js, tools.js, gridfs.js, file-type.js, objectid.js,
                       sanitize.js (the rich-text allowlist), rich-fields.js,
                       richtext-doc.js (sanitized HTML -> the renderer's node tree)
  wrapper/             async-trycatch.js
  __tests__/           helpers.js + api.test.js, rate-limit.test.js, structure.test.js,
                       library.test.js, account.test.js, platform.test.js
src/
  app/                 App Router pages (see §4)
  components/
    ui/                the design system — Button, Card, Input, Badge, Modal, Menu,
                       Toggle, Toast, Avatar, Feedback, Motion, ThemeToggle (+ index.ts barrel)
    layout/            Sidebar, Topbar, NotificationCentre, PublicShell
    todo/              TodoCard, TodoBits, FilterBar, BulkBar, TodoBoard,
                       TodoCalendar, TodoForm, Pagination, charts.tsx,
                       QuickAdd, QuickLook, FocusTimer, SortableTodoList,
                       TodoTable, BulkEditModal, SavedViews, ProjectPicker,
                       TodoDetailPanels, Heatmap, PdfPanel
    command/           CommandPalette, ShortcutsModal
    variant/           VariantFields (the one generic renderer), VariantIcon
  hooks/               useAuth, useTodos, useFilters, useKeyboard, useProjects,
                       useLibrary, useProductivity, useReminders, useListNavigation,
                       useFiles, useUploadProgress, usePdfs, useVariant
  lib/                 api.ts (typed client), utils.ts (cn + helpers), validation.ts,
                       date.ts, filters.ts (pure URL <-> filter), quickAdd.ts,
                       richtext.ts (pure helpers, covered by test:web),
                       variants.ts + variants.generated.ts (the registry)
  __tests__/           frontend tests, run by node --test (see Testing)
  providers/           QueryClient + next-themes + Tooltip + Toast
  app/manifest.ts      the PWA manifest (served at /manifest.webmanifest)
services/pdf/          the Rust renderer (Cargo, not npm) - see §3 "PDF rendering"
  src/                 main.rs (axum + auth), payload.rs (the request contract),
                       markup.rs (node tree -> Typst markup), render.rs (fonts, World, PDF)
  templates/           common.typ + one per variant (general, school,
                       law-enforcement, hospital, restaurant)
  fonts/               Liberation + DejaVu faces, embedded into the binary
shared/variants/       one JSON file per variant - the registry both runtimes read
scripts/               generate-icons.mjs - writes public/icon*.png|svg
public/sw.js           service worker: shell caching, never touches /api
  store/state.tsx      Zustand — UI state ONLY
  types/index.d.ts     ambient global types
```

Package manager is **npm** (`package-lock.json`). TS `target` is `es2017`.

### Scripts

| Script | Command |
|---|---|
| `npm run dev` | `node server.js` (Next in dev mode behind the custom server) |
| `npm run build` | `next build` — type-checks and lints |
| `npm start` | production custom server (needs a prior build) |
| `npm test` | both suites: `test:api` then `test:web` |
| `npm run test:api` | `node --test "server/__tests__/**/*.test.js"` |
| `npm run test:web` | `node --test "src/__tests__/**/*.test.ts"` |
| `cargo test --manifest-path services/pdf/Cargo.toml` | the renderer's own tests (needs a Rust toolchain) |
| `npm run icons` | regenerate the PWA icons |
| `npm run themes` | expand `shared/themes.json` into `src/app/themes.css`, `src/lib/themes.generated.ts` and `shared/themes.generated.json` (the hex the PDF renderer reads) |
| `npm run variants` | expand `shared/variants/*.json` into `src/lib/variants.generated.ts` |
| `npm run fonts` | refresh `shared/google-fonts.json` from Google's public metadata |
| `npm run lint` | `next lint` |

---

## 3. The API (all under `/api`, all JSON)

`server/routes/index.js` mounts `/user` unauthenticated; `auth` guards `/todo`,
`/trash`, `/stats` and `/tags`.

| Method | Path | Notes |
|---|---|---|
| GET | `/api` | hello, for a quick "is it up" |
| GET | `/api/health` | version, uptime and the database state; 503 when disconnected |
| POST | `/api/user/register` | rate-limited, zod-validated |
| POST | `/api/user/login` | rate-limited; sets the `token` cookie; stamps `lastLoginAt` |
| POST | `/api/user/logout` | clears the cookie |
| GET | `/api/user/me` | current user (never includes the hash) |
| PUT | `/api/user/update` | name / status / avatar only |
| PUT | `/api/user/preferences` | theme, themeId, fontFamily, defaultView, pageSize, density, uiScale, applicationType |
| | *(todo, project and template writes also accept `variantData`; see Variants)* | |
| | *(todo, template and project writes also accept `titleHtml` / `descriptionHtml`)* | |
| PUT | `/api/user/password` | requires the current password |
| GET | `/api/fonts/search` | typeahead over the committed Google Fonts family list |
| GET | `/api/fonts/css` | one family's stylesheet, proxied and rewritten; a 400 means no such family |
| GET | `/api/fonts/file/:id` | one woff2, by an id the `css` route issued |
| GET | `/api/todo` | list — see query params below |
| POST | `/api/todo` | create |
| GET/PUT/DELETE | `/api/todo/:id` | read / update / delete-to-trash |
| POST | `/api/todo/:id/duplicate` | copy, reset to pending with subtasks uncheck |
| PATCH | `/api/todo/bulk` | `{ids, action, value}`; actions: status, priority, tag, untag, pin, unpin, archive, unarchive, delete |
| PUT | `/api/todo/reorder` | `{ids}` → writes `order` |
| GET | `/api/trash` | list |
| GET/PUT/DELETE | `/api/trash/:id` | read / recover / delete forever |
| DELETE | `/api/trash` | empty trash |
| GET | `/api/stats` | aggregation for the analytics page (`?days=7..90`) |
| GET | `/api/tags` | distinct tags with counts |
| GET | `/api/account/export/todos` | `?format=json\|csv`, sent as a file download |
| GET | `/api/account/export` | the whole account as one JSON file |
| POST | `/api/account/import` | `{format, data, dryRun, skipDuplicates}`; a dry run writes nothing |
| POST | `/api/account/sample-data` | seeds an **empty** account (409 otherwise) |
| GET/DELETE | `/api/account/sessions` | list; `DELETE /sessions/all` and `/sessions/:id` revoke |
| POST | `/api/account/2fa/setup\|enable\|disable` | TOTP setup, first-code enable, password-confirmed off |
| GET | `/api/account/audit` | the account's security log, paginated |
| DELETE | `/api/account` | erases everything; needs the password and `confirm: "DELETE"` |
| POST | `/api/files` | multipart upload; fields `scopeKind`, `scopeId`, `compress` |
| GET | `/api/files` | `?scopeKind=&scopeId=&kind=&page=&limit=` |
| GET | `/api/files/quota` | usage, tier and the per-file caps; self-heals a drifted counter |
| PUT | `/api/files/quota/tier` | change the plan (self-serve; no billing yet) |
| GET | `/api/files/:id` | metadata |
| GET/HEAD | `/api/files/:id/raw` | the bytes: Range-aware, ETag, `?download=1` forces attachment |
| GET | `/api/files/:id/activity` | the chain of custody for one file, newest first |
| GET | `/api/files/events` | SSE: live upload/compression progress for this account |
| DELETE | `/api/files/:id` | permanent; drops the GridFS bytes and credits the quota |
| GET | `/api/todo/:id/pdfs` | rendered versions, newest first, each with a `current` flag |
| POST | `/api/todo/:id/pdfs` | **202** + `{jobId, version}`; progress on `/api/files/events` |
| GET | `/api/todo/:id/pdfs/:pdfId` | the bytes, inline; `?download=1` forces the save dialog |
| DELETE | `/api/todo/:id/pdfs/:pdfId` | permanent, credits the quota, does not reuse the number |
| | *(`/api/project/:id/pdfs` is the same four routes over the same controller)* | |

**List query params** (`GET /api/todo`, validated by `listQuerySchema`):
`page`, `limit`, `q`, `status[]`, `priority[]`, `tags[]`,
`due=overdue|today|week|none`, `archived`, `pinned`, `sort`, `order`.
Lists accept comma-separated *or* repeated keys (`status=a,b` and `status=a&status=b`).

Two behaviours worth knowing before changing the controller:

- **`archived` defaults to `false`** — archived todos are hidden unless asked for.
- **Pinned todos sort first** in every view, whatever `sort`/`order` say. Priority
  sorting uses a computed numeric rank in an aggregation (`$switch`), because the
  enum would otherwise sort alphabetically.

### Sessions, tokens and 2FA

The JWT carries `{ _id, sid, tv }`: the session id and the account's token
version. `middleware/auth.js` rejects a token whose `tv` no longer matches the
user (a "sign out everywhere" bumps it) or whose `sid` is no longer in
`user.sessions` (a single device was revoked). **Mint tokens only through
`Tools.User.generateToken(user, sessionId)`** — a token without those claims does
not authenticate. Changing the password revokes every other session.

Two-factor is TOTP, implemented in `server/utils/totp.js` on node's `crypto`
(HMAC-SHA1, 30-second step, ±1 step of drift) — there is no dependency, and no QR
image: the setup screen shows the secret and the `otpauth://` URI. Recovery codes
are SHA-256 hashes and are returned in clear exactly once, when 2FA is enabled.
Login therefore has three outcomes: bad credentials (400), `200 { twoFactorRequired: true }`
with no cookie, and success.

### Models

- **User**: name, email (unique, lowercased), password (bcrypt via `pre("save")`),
  role, status, `avatar`,
  `preferences{theme,themeId,fontFamily,defaultView,pageSize,density,uiScale}`,
  `lastLoginAt`, `tokenVersion`, `sessions[]`, `twoFactor{}`. Methods:
  `comparePassword`, `toSafeJSON` (which reduces `twoFactor` to a flag).
  `SAFE_SELECT` in `User.controller.js` is the only projection a route may see:
  it drops the hash *and* every 2FA field.
- **AuditLog**: account-level security events (`login`, `password.changed`,
  `2fa.enabled`, `export.todos`, …). Written best-effort by
  `SecurityController.record` — a failed log never fails the action.
- **Todo**: the `todoFields` object is exported and **reused by Trash**, so a
  delete/recover round trip preserves everything. `pre("save")` keeps
  `completedAt` in step with `status`. Indexed on `{ownerId,archived,status}`,
  `{ownerId,dueDate}`, `{ownerId,pinned,order,createdAt}`, plus a text index.
- **Trash**: `todoFields` + `todoId` (the original id) + `deletedAt`.

### Requests, ids and logging

`middleware/checkin-logger.js` gives every request an id (`req.id`, echoed as
`X-Request-Id`, and reused if the caller sent one) and writes one line when the
response finishes: **JSON in production, a short human line in development,
nothing under test**. Error responses, the 404 and the 401 all carry
`requestId`, so a user's report can be matched to a log line. Passwords, codes
and import payloads are never logged.

### Errors and validation

`server/utils/api-error.js` provides `ApiError` with `badRequest/unauthorized/
forbidden/notFound/conflict/tooMany`. `error-handler.js` reads `statusCode` and
additionally translates Mongoose `ValidationError`, `CastError` (→ 400) and the
duplicate-key `11000` (→ 409). Validation is the `validate(schema, source)`
middleware; for `source: "query"` the parsed result lands on **`req.validatedQuery`**
(not `req.query`), because Express may expose `query` as a getter.

### Object storage

Files live in **one GridFS bucket** (`files`), addressed through the `StoredFile`
model - controllers never query `files.files` directly. `server/utils/gridfs.js`
holds the bucket as a lazy singleton keyed on the live connection, because
`db.config.js` reads env at load and the connection does not exist at require time.

Five things are load-bearing and easy to get wrong:

1. **Quota is one atomic update.** mongo:5.0.2 runs standalone, so there are no
   transactions. `StorageController.reserve` puts the quota comparison in the
   `$expr` *filter* of the same `findOneAndUpdate` that increments the counter,
   which is what stops two concurrent uploads both fitting in the same space.
   Reserve from `Content-Length`, reconcile to the real stored size, release on
   failure; `recompute` is the self-heal and `GET /api/files/quota` calls it when
   drift passes 1%.
2. **Type comes from the bytes.** `server/utils/file-type.js` sniffs magic bytes
   and rebuilds the extension from the detected mime. The client's `Content-Type`
   is never trusted, because these bytes are streamed back with an inline
   `Content-Disposition`.
3. **GridFS `end` is exclusive; HTTP Range `end` is inclusive.** The stream call
   is `openDownloadStream(id, { start, end: end + 1 })`. This exact off-by-one is
   what breaks video seeking in Safari.
4. **Delete GridFS bytes before the metadata row.** The reverse orphans chunks
   nothing can find and no quota credits back. The boot sweep in
   `server/services/storage-sweep.js` is the backstop, and also fails any upload
   left mid-flight by a restart - those cannot be resumed, so the UI offers Retry.
5. **Nothing is buffered.** busboy streams the part to a temp file under
   `UPLOAD_TMP_DIR`, which is then streamed into the bucket. Verified: a 250 MB
   upload grows RSS by about 26 MB.

`<video src="/api/files/:id/raw">` authenticates by itself - same origin,
`SameSite=Lax` cookie, subresource GET. **Never set `crossOrigin`**, which would
suppress the cookie. A 401 inside a media element appears as
`MEDIA_ERR_SRC_NOT_SUPPORTED` with no status, so `FilePreview` re-checks
`/api/user/me` on error rather than blaming the file.

Upload progress uses `XMLHttpRequest` (`api.upload()`), the only non-`fetch` call
in the client - `fetch` has no upload progress event.

### Compression and progress

An upload is **three weighted phases**: upload 0.35, compress 0.45, store 0.20
(0.7 / 0.3 when compression is declined). Upload and store are byte-exact for
every kind of file, so only the middle leg is ever uncertain:

| kind | tool | progress |
|---|---|---|
| video, audio | ffmpeg | **real** - `-progress pipe:1`, `out_time_us` over the probed duration |
| image | sharp | **none available** - reported as indeterminate with a stage label |
| document | qpdf | **none available** - same |

sharp and qpdf expose no progress hook whatsoever, so those report
`determinate: false` and the bar shows a sliding band rather than a fabricated
number. Both finish well inside a second at our caps.

Three rules the compressor keeps:

1. **It never fails an upload.** Any error stores the original instead.
2. **It never makes a file bigger.** A result larger than the input is discarded.
3. **The filename follows the bytes.** Re-encoding can change the container
   (png to webp), so the extension is rebuilt from the new mime.

Whenever compression is asked for but not applied, `compression.note` says why -
tool missing, would have grown, or failed. That field exists because a silent
fallback once hid a real bug: **the temp output file needs its container's
extension**, or ffmpeg fails with "Error opening output files".

Capabilities are **probed, never assumed** (`detect()` in
`server/services/compression.js`): an Ubuntu ffmpeg build may have no libx264,
and qpdf is frequently not installed at all.

Progress travels over **SSE, one stream per tab** (`GET /api/files/events`),
multiplexed by job id - not one stream per upload, because HTTP/1.1 allows six
connections per origin. The client names the job (`X-Job-Id`, a v4 UUID) so a row
can match its own events before the POST returns; fan-out is keyed by `ownerId`,
so an id can only ever address a job in the sender's own stream. Progress lives
in memory (`job-registry.js`) and only *state transitions* are persisted.

### Rich text

Title and description are each stored as **a pair**: sanitized HTML
(`titleHtml` / `descriptionHtml`) and a plaintext mirror (`title` /
`description`). Four rules hold the whole thing together:

1. **Sanitising happens on the server, on write** -
   `server/utils/sanitize.js`, a small fixed allowlist. The client never
   sanitises; a second copy would suggest the client's version counted. Nothing
   is rendered through `dangerouslySetInnerHTML` that did not come out of here.
2. **The mirror is derived in exactly one place** - `applyRichText` in
   `server/utils/rich-fields.js`. Every writer goes through it: the editor,
   quick-add, import, sample data, duplicate, templates, projects. The mirror is
   what the `{title, description}` text index, CSV export, quick-add and search
   highlighting read, so two independent derivations is how search quietly rots.
3. **When both halves are sent, the markup wins.** Otherwise a client could pair
   real HTML with a forged plaintext mirror and poison what search sees.
4. **A paragraph break is `\n\n`; a `<br>` is `\n`.** Collapsing both loses the
   structure on a round trip.

`style` is permitted but every *value* is validated - a hex or named colour, a
unit-bearing size, a plain family list, one of four alignments. The attribute
could not simply be banned, because the product calls for font, size and colour
controls and those cannot be expressed as fixed class names. `allowedClasses` is
limited to the four alignment classes, so a paste cannot borrow the app's own
chrome to impersonate it.

**Titles take inline marks only.** A title renders inside one-line cells in the
table view, command palette and search results, so headings, lists and alignment
are stripped and pasted block tags become spaces.

On the client, `src/components/ui/RichText.tsx` provides `RichTextEditor` (two
profiles, `full` and `inline`) and `RichTextView`. Tiptap v3 **bundles Underline
and Link inside StarterKit** and ships `Color`, `FontSize` and `FontFamily`
inside `@tiptap/extension-text-style` - installing those separately causes
duplicate-extension errors. The editor mounts client-only
(`immediatelyRender: false`), and toolbar buttons `preventDefault` on mousedown
or they steal the selection they are about to act on.

`src/components/todo/TodoCard.tsx` **still renders plaintext on purpose**: it
runs search highlighting through `splitHighlight`, which cannot operate on
markup. `displayHtml()` in `src/lib/richtext.ts` falls back to the mirror, so
records written before this feature still render.

### PDF rendering

`services/pdf/` is a Rust service (axum + `typst`/`typst-pdf` via `typst-as-lib`)
that turns a document into PDF bytes. It is the only part of the system not
written in JavaScript, and deliberately the dumbest: **no database, no
filesystem outside its own binary, no URLs.** Everything it needs arrives in one
JSON body, which is also why attachments are inlined rather than linked - handing
it a URL would mean minting a credential for it and turning it into an SSRF
surface.

**It never sees HTML.** `server/utils/richtext-doc.js` converts the sanitized
markup into a closed tree of blocks and runs (`paragraph`, `heading`, `list`,
`quote`, `code`; marks, colour, size, font, href) and the service deserialises
exactly that. The converter lives next to `sanitize.js` on purpose: the allowlist
that decides which tags can exist and the code that maps them cannot drift, and
no HTML parser - and therefore no attacker-controlled markup - runs inside the
renderer. An unrecognised node degrades to plain text rather than being dropped;
losing a user's words silently is worse than losing their formatting.

| Piece | Where |
|---|---|
| HTTP, `X-Internal-Key` (constant-time), 2 MB body cap, 20 s timeout | `src/main.rs` |
| The request contract, and every default it falls back to | `src/payload.rs` |
| Node tree → Typst markup, escaping and value validation | `src/markup.rs` |
| Fonts, the Typst engine, `POST /render` → bytes | `src/render.rs` |
| The page itself: header, meta grid, body, checklist, tags | `templates/*.typ` |

* **Binds `127.0.0.1:8787`**, even sharing a container. `PDF_SERVICE_HOST`
  exists for the one deployment where that is wrong - the service alone in its
  own container - and nowhere else. See
  `example-seperate-service-internal-network-only.txt`.
* **Fonts are embedded** (`include_bytes!`): a slim image has none, and a PDF
  whose text depends on what the host happens to have installed is not
  reproducible. `PDF_FONT_DIR` adds faces on top for wider coverage.
* **Rendering happens on `spawn_blocking`.** It is CPU-bound, and on the async
  runtime one large document would stall every request behind it.
* **The service refuses to start without a 16-character key.** Running open on
  loopback is still running open.
* **Node side** (`server/services/pdf.client.js`): 20 s timeout, **one retry on a
  connection error only** - a 4xx means the payload is wrong and will fail
  identically - and a circuit breaker that opens after 5 consecutive failures so
  a renderer that is down answers immediately instead of making every caller
  wait out a timeout. A 401 surfaces as "misconfigured", never as a client error.
* **The newest cargo build wins**, not release unconditionally: a stale
  `target/release` otherwise beats the debug build you just made, and the only
  symptom is a PDF quietly rendered by last build's templates. A configured
  `PDF_SERVICE_BIN` or an installed `/usr/local/bin` binary still wins outright.
* **Lifecycle**: `server/services/pdf-service.js` spawns the binary as a child of
  `server.js` with exponential-backoff restarts, and `shutdown()` kills it. No
  supervisord, no tini - `server.js` already owns the process tree.
  `PDF_SERVICE_SPAWN=0` plus `PDF_SERVICE_URL` *is* the split-it-out switch.
* The theme travels as resolved hex, from `shared/themes.generated.json` - the
  reason `npm run themes` now emits JSON as well as CSS and TS. Neither CJS Node
  nor Rust can read the TS module. A PDF always takes the **light** half of the
  palette: it is printed far more often than it is read on a screen.

### PDF versions

A generated PDF is **two records**: the bytes, stored through the same GridFS
path as any upload - so a generated file counts against the quota, streams with
Range and is deleted the same way - and a `GeneratedPdf` row carrying the
version number, the variant, who generated it, how long it took and what it was
rendered from. They are created and deleted together; a version pointing at
bytes that are gone is worse than no version at all. One collection serves both
todos and projects (`subject: {kind, refId}`), and `server/routes/pdf.routes.js`
declares the four endpoints once and mounts them on both routers.

* **Version numbers come from `$inc`, never from a count.** `pdfVersionSeq` on
  Todo and Project is allocated with
  `findOneAndUpdate({_id, ownerId}, {$inc: {pdfVersionSeq: 1}})` *before* the
  render. Counting existing rows hands two clicks a moment apart the same
  number. A deleted version does not lower the sequence either: v4 stays taken
  once v4 is gone, so a file already in someone's downloads folder is never
  ambiguous.
* **`snapshotHash` is a sha256 of the content that went into the render** -
  document, theme and template, with the timestamp, version and request id left
  out, or every render would differ from every other one. It is what lets the
  list say "Up to date with the current todo" or "The todo has changed since
  v3" honestly, rather than comparing timestamps and guessing.
* **The filename convention** sorts naturally in a downloads folder, says what
  it came from, is unambiguous across versions and carries no more of the record
  than its title:
  `TODO-6f3a1b-v03-20260912-1430-quarterly-safety-review.pdf` (projects use
  `PROJ-`). The six-hex stem is the same "Reference" the detail page lets the
  user copy.
* **POST answers 202**, not the PDF. A render takes the better part of a second
  and the client already watches `/api/files/events` for uploads, so the job id
  goes back immediately and the bar follows the same stream. Ownership is still
  checked inside the request, so a subject that is not yours is a 404 rather
  than a 202 and a silent failure. The job's legs are `render` (indeterminate -
  typst compiles or it does not) then `store`.
* **A failed render leaves nothing behind**: no version row, no `StoredFile`, no
  quota charge - only the burned version number, which is the cheap half.
* **Versions are never auto-pruned.** Keeping ten is the owner's call and so is
  losing one, which is why the delete dialog says plainly that it is permanent
  and does not go to Trash.
* Cascades run through `FileController.destroyScope`, which deletes the version
  rows alongside the bytes it is already removing - one place, so a future
  cascade cannot forget them.
* `Project.organizationName` is a real top-level field rather than a
  variant-specific one, because every variant's header prints it.

### Variants

One account runs the app as **General, School, Law Enforcement, Hospital or
Restaurant**. Exactly three things vary: the words on screen, the extra fields a
record carries, and presentation (icon, PDF template, seed templates).

**The central rule: no component branches on the variant id.** Components ask
the registry what things are called and which fields exist and render
generically. The moment a variant needs a component change, the registry is
wrong - extend the registry instead. That rule is what keeps a new variant a
JSON file rather than a patch across the codebase.

The registry is `shared/variants/*.json`, read by `server/config/variants.js`
directly and by the browser through `src/lib/variants.generated.ts`
(`npm run variants`). The generated step exists for the same reason the themes
have one: `src/lib/variants.ts` is covered by `npm run test:web`, which runs on
node's type stripping with no bundler, where a JSON import would not resolve.

* **Extra fields live in a Mixed `variantData` map**, keyed by variant id, not
  in five typed sub-schemas. Forty schema paths would be cast by Mongoose on
  every read of every todo, and each new variant field would be a migration.
  The registry owns the shape; zod validates it on the way in.
* **Additivity is guaranteed by the write path, not by the schema.** Always
  write dot paths - `$set: {"variantData.school.course": "Physics"}`. Never
  `todo.variantData = {…}`: a whole-object assign is exactly what drops
  `hospital`, and because Mixed does not track nested mutation it is also the
  only form Mongoose persists without `markModified`. The one exception is an
  **insert**, which has nothing to merge with. A test asserts both halves.
* Mongoose minimizes empty objects away, so `variantData` is **absent**, not
  `{}`, on a record that never carried extras. Every reader optional-chains it.
* **The controller is the only layer that knows which variant is in force** -
  project override first, then `user.preferences.applicationType`. It validates
  the incoming sub-object against that variant's fields and flattens it. A
  payload naming a different variant is a 400, not a merge.
* Field `type` is a **closed set of seven** - `string | text | number | date |
  enum | boolean | checklist` - which is what keeps `VariantFields` a `switch`
  over seven ui primitives. A type that is not in the set needs an eighth case,
  never a branch on the variant.
* Field schemas are built **lazily and cached against the field array itself**,
  so a registry edited in place rebuilds. That is how the tests cover field
  validation before any variant declares fields.
* A zod failure inside the controller is translated to a **400 naming the
  field's label**. It has to be: `validate()` is the only middleware that knows
  about zod, so a raw throw here would surface as a 500 - which is exactly what
  the first live test of a populated variant found.
* **Switching variants writes nothing.** Fields of the variant you leave are
  hidden, never deleted, and the detail page lists them in a collapsed "Fields
  from School" panel - visible proof nothing was lost.
* **`STATUS_DOT` and the chart palettes do not vary.** Colour encodes meaning
  across every variant (see §Charts); only the words change.
* Icons resolve through a **static record** in `VariantIcon.tsx` - never a
  dynamic import and never a constructed class name.

**Pages are declared by kind, never by component.** A variant's `pages[]` entry
names a `kind` - `group` (one card per distinct value of a field) or
`scoreboard` (`group` plus the weighted mark) - and one route,
`/dashboard/v/[pageId]`, renders all of them, parameterised by field keys from
the same registry. A variant that needs a genuinely new shape adds a *kind*;
Law Enforcement's Cases and Restaurant's Stations are already `group` with a
different key.

`pdfHighlights[]` names the fields the PDF prints as a band rather than in the
grid, in the order the band should read. Everything else a variant declares -
fields, terms, labels, seed templates - is carried into the PDF by the
controller, already labelled and formatted (an enum prints its label, a
checklist "2 of 5 done"), so the renderer still knows nothing about courses or
wards.

**All five variants are populated.** General adds no fields, renames nothing and
declares no pages, so an account that never touches this setting sees the app it
always had. General adds no fields, renames nothing
and declares no pages, so existing accounts see no change.

Four page kinds cover all five variants: `group` (one card per distinct value of
a field), `scoreboard` (`group` plus a weighted mark), `files` (stored files with
their chain of custody) and `stock` (`group`, narrowed to what is below its par
level). Status and priority **words** in a PDF come from the registry too - a
restaurant's "To prep" and a school's "Not started" are the same status, and a
fixed vocabulary in the renderer would undo the whole registry.

A variant may also declare a `notice` - a standing statement shown wherever its
work is done and printed at the foot of its documents. Hospital's says plainly
that the app is **not an EHR and not a medical device**, that a patient
*reference* belongs in it rather than a name, and that **file reads are not
audited** - the app has no read trail, which is a scoped decision rather than an
oversight. Both halves are pinned by tests, including one asserting the registry
offers no field matching name/dob/diagnosis.

A variant may also declare `pdfBannerField` - the field whose value is printed
on every page as a handling marking - and the `files` page kind, which lists
stored files with their **chain of custody**. That trail is the existing
append-only `Activity` model, written for every variant on every file store and
delete and matched on `meta.fileId`, so **it outlives the file**: a deletion is
the entry that matters most. `GET /api/files/:id/activity` serves it.

Two things the gradebook maths gets right on purpose, both tested: an **unmarked
assignment is not a zero** (`percent` is `null` when nothing is back, and a
score with no maximum is not a mark), and weights are used where they exist and
evenly otherwise, so a half-weighted course still gets an honest number.

---

## 4. Frontend

### Pages

| Route | Purpose |
|---|---|
| `/` | landing page (hero, feature grid, product preview) |
| `/learn-more` | full feature catalogue |
| `/login`, `/register` | auth, with a password-strength meter on register |
| `/dashboard` | the todo list — 4 views, filters, bulk actions |
| `/dashboard/create-todo` | new todo (accepts `?due=YYYY-MM-DD` from the calendar) |
| `/dashboard/edit-todo/[todoId]` | editor |
| `/dashboard/todo/[todoId]` | detail view with inline subtask toggling |
| `/dashboard/archive` | archived todos |
| `/dashboard/trash` | trash, restore, empty |
| `/dashboard/analytics` | stat tiles + charts |
| `/dashboard/settings` | profile, avatar, default view, page size, password |
| `/dashboard/settings/appearance` | the 50-theme gallery, font picker, text size, density |
| `/dashboard/settings/data` | export, import with a dry-run preview, sample data |
| `/dashboard/settings/security` | sessions, two-factor, audit log, account deletion |
| `/dashboard/today` | focus view: overdue, due today, pinned, plus the pomodoro |
| `/dashboard/upcoming` | the next weeks grouped by day |
| `/dashboard/review` | weekly review |
| `/dashboard/projects/[projectId]` | one project: its todos and analytics |
| `/dashboard/files` | the personal drive: quota meter, tier picker, upload, browse |
| `/dashboard/templates`, `/dashboard/tags` | template library, tag manager |
| `/dashboard/templates/new` | new template — a page, not a dialog, like `/dashboard/create-todo` |

### Data layer

**TanStack Query owns all server data.** `src/lib/api.ts` is the only place that
calls `fetch`; `src/hooks/useTodos.ts` and `useAuth.ts` wrap it. `useUpdateTodo`
and `useDeleteTodo` are **optimistic** (`onMutate` patches every cached list page,
`onError` rolls back) — that is what makes status toggles, pinning and delete-undo
feel instant.

**Zustand (`src/store/state.tsx`) holds UI state only**: view mode, selection,
sidebar/mobile-nav/palette/shortcuts flags, and the **undo stack**. Do not put
server data back in it — the old store kept a second copy of the todos and it
drifted.

**Undo** is a stack of `{label, undo}` closures, capped at 10. The dashboard
pushes an entry after every reversible action (status, pin, archive, delete,
bulk); `Ctrl/Cmd+Z` in `useKeyboardShortcuts` pops the top one, and the
notification centre lists the rest with a per-entry Undo button. The closures
are memory-only, so a reload empties the stack.

**Browser-local state** lives in `src/hooks/useProductivity.ts` (localStorage,
wrapped so it never throws): the pomodoro deadline, recently viewed todos, and
the capped id sets that keep a reminder dismissed and stop a browser
notification firing twice. **Reminders themselves are derived**
(`src/hooks/useReminders.ts`), not stored: overdue or due-today todos that are
not finished, keyed `kind:todoId:dueDay`.

**Filter state lives in the URL** (`src/hooks/useFilters.ts`). `parseFilter` /
`serializeFilter` round-trip it; only non-default values are written. Any filter
change resets to page 1.

### Keyboard

Two layers, deliberately separate:

- `useKeyboardShortcuts` (mounted once in the dashboard layout) — global keys:
  `Cmd+K`, `n`, `/`, `?`, `g`+letter navigation, `Esc`, and `Ctrl/Cmd+Z` for undo.
- `useListNavigation` (used by the dashboard list and grid) — a cursor over the
  visible todos: `j`/`k` move, `x` selects, `Enter` opens, `Space` quick-looks.
  The active card is found through `data-todo-id`, and `Space`/`Enter` defer to a
  focused button or link. `SHORTCUTS` in `useKeyboard.ts` is what the help modal
  renders — add new keys there too.

### Platform

- **PWA**: `src/app/manifest.ts` plus `public/sw.js`, registered in production
  only by `ServiceWorkerRegistration`. The worker caches the shell and hashed
  build assets and **never touches `/api`** — a stale todo list would be worse
  than an honest failure. Icons are generated by `npm run icons`.
- **Offline**: `useOnlineStatus` drives `OfflineBanner` under the topbar; it is a
  live region, and says "you appear to be offline" because `navigator.onLine` is
  only a hint.
- **Boundaries**: `error.tsx` / `not-found.tsx` / `loading.tsx` at the app root,
  and `error.tsx` / `loading.tsx` again under `/dashboard` so a failed page keeps
  its navigation. Both error pages show Next's `digest` as a reference.
- **Accessibility**: a skip link is the first tab stop on every page and targets
  `#main` (present in the dashboard layout and `PublicShell`); toasts sit in a
  polite live region; nav links carry `aria-current="page"`; Radix returns focus
  when a dialog closes.
- **UI scale**: `preferences.uiScale` sets the root font size via `UiScaleEffect`
  (five steps, 13–20px). Every size in the app is rem-based, so text and spacing
  scale together.
- **Rate limits**: only `/user/login` and `/user/register` are limited. A 429
  carries `Retry-After`, `ApiError` exposes it as `retryAfter`/`isRateLimited`,
  and `RateLimitNotice` counts it down on both auth forms.

### Theming

Semantic CSS variables in `src/app/globals.css` (light on `:root`, dark on
`.dark`), mapped into Tailwind by `tailwind.config.ts` via
`rgb(var(--token) / <alpha-value>)`. `darkMode: "class"`, driven by `next-themes`.

**Components must use token classes** (`bg-surface`, `text-fg-muted`,
`border-border`), never raw palette colours, and never a **dynamically built class
name** — Tailwind's scanner cannot see `` `bg-status-${x}` ``. Use the static maps
in `src/lib/utils.ts` (`STATUS_DOT`, `PRIORITY_LABEL`, `tagColor`).

**The 50 themes.** A theme is only a different set of values for those same
tokens, which is why none of the above had to change. `shared/themes.json` holds
one compact *seed* per theme (three hues, two chroma amounts, a default font, a
collection of `men` / `women` / `other`); `scripts/generate-themes.mjs` expands
each into a light and a dark block —

```css
[data-theme="rose-quartz"]      { --bg: …; --primary: …; }
.dark[data-theme="rose-quartz"] { --bg: …; --primary: …; }
```

— in the generated `src/app/themes.css`, plus the typed catalogue in
`src/lib/themes.generated.ts`. **Never edit either by hand; run `npm run themes`.**
`globals.css` keeps its own `:root`/`.dark` blocks as the fallback for when no
`data-theme` is set (the signed-out pages).

Colours are computed in OKLCH so one lightness ramp reads the same across every
hue, and the generator **fails the build** if a theme misses its contrast floors
(fg/bg 7:1, fg-muted/surface 4.5:1, primary-fg/primary 4.5:1). Status and
priority hues are fixed across all 50 — they encode meaning and must not become
decorative.

Theme and light/dark are **orthogonal**: `preferences.themeId` picks the palette,
`preferences.theme` (next-themes) picks the mode, and every theme has both.
`ThemeEffect`/`FontEffect` in `src/components/layout/ThemeVars.tsx` apply them,
alongside `UiScaleEffect`, from the dashboard layout. A small inline script in
`src/app/layout.tsx` restores both from `localStorage` before first paint, the
way next-themes does for the mode — the account stays the source of truth.

### Fonts

`--font-sans` / `--font-mono` are variables too, so a font change is one write.
Inter and JetBrains Mono are self-hosted by `next/font`; **any other family comes
from Google Fonts through our own API**, never from the browser.

The CSP in `next.config.js` also carries `media-src 'self' blob:` (stored video
and audio), `object-src 'none'` (a stored PDF is previewed in an `<iframe>`, never
an `<object>`), and `frame-src`/`worker-src` with `blob:`.

That indirection is not optional: `next.config.js` sets `font-src 'self' data:`
and `style-src 'self'`, so the browser cannot reach `fonts.googleapis.com` or
`fonts.gstatic.com` at all. `server/controller/Font.controller.js` fetches the
`css2` stylesheet, rewrites every `gstatic` URL to `/api/fonts/file/<id>`, and
serves the woff2 itself. The CSP stays shut, `public/sw.js` caches the files like
any same-origin GET (so a chosen font survives offline), and no user's browser
talks to Google.

`/api/fonts/file/:id` takes an **opaque id, never a URL** — ids are minted only
while parsing a stylesheet Google sent us, which is what keeps the endpoint from
being an SSRF. `shared/google-fonts.json` (`npm run fonts`) backs the typeahead;
a name that is not in it is still accepted and checked against Google directly.

### Charts

`src/components/todo/charts.tsx` holds the palette and the shared tooltip/legend.
The colours are **not arbitrary** — they were validated with the data-viz
validator against this app's own surfaces (`#ffffff` / `#151a26`):

- **created vs completed** — categorical slots 1–2; passes every check in both modes.
- **priority** — a single-hue *ordinal* blue ramp, because priority is ordered;
  a categorical rainbow here would be wrong.
- **status** — the reserved status palette, matching the badges used everywhere
  else in the app. Its yellow is below 3:1 on the light surface by design, so
  every status chart **must** ship visible labels and counts (the relief rule).
  `ChartLegend` is what satisfies that — do not replace it with colour-only chips.

If you add a series or change a colour, re-run the validator rather than eyeballing it.

---

## 5. Configuration

Copy `.env.example` to `.env`. Read by the application:

| Variable | Used by | Default |
|---|---|---|
| `MONGO_URL` | `server/db.config.js` | none — required |
| `JWT_SECRET` | `server/utils/user.js`, `middleware/auth.js` | none — required |
| `PORT` / `HOSTNAME` | `server.js` | 3000 / localhost |
| `NODE_ENV` | `server.js`, cookie `Secure` flag, logger | dev unless `production` |
| `DISABLE_RATE_LIMIT`, `RATE_LIMIT_MAX` | `middleware/rate-limit.js` | off / 10 & 20 |
| `MONGO_TEST_URL` | `__tests__/helpers.js` | falls back to mongodb-memory-server |
| `UPLOAD_TMP_DIR` | `services/storage-sweep.js` | `$TMPDIR/modern-todo-uploads` - needs a volume |
| `PDF_SERVICE_KEY` | both sides of the renderer | none — no key, no rendering |
| `PDF_SERVICE_SPAWN` | `services/pdf-service.js` | on; `0` to run the renderer separately |
| `PDF_SERVICE_URL` | `services/pdf.client.js` | `http://127.0.0.1:8787` |
| `PDF_SERVICE_BIN` | `services/pdf-service.js` | the cargo build, then `/usr/local/bin` |
| `PDF_SERVICE_HOST` / `PDF_SERVICE_PORT` | the renderer | `127.0.0.1` / `8787` |
| `PDF_FONT_DIR` | the renderer | unset — embedded faces only |
| `PDF_TIMEOUT_MS` | `services/pdf.client.js` | 20000 |

`dotenv` is loaded at the top of `server.js` before anything reads `process.env`;
`db.config.js` destructures env at module load, so that ordering matters.

---

## 6. State of the code

Everything in the previous version's "known issues" list has been fixed:
pagination totals are now owner-scoped, `destroy` 404s instead of crashing,
`recover` restores the original `_id`, `getTodos` no longer swallows errors,
`errorHandler` has real status codes, secrets are no longer logged, and the
broken `utils/math.js` is gone.

Remaining, deliberate limitations:

1. **Auth is still a single 1-day token, with no refresh** — but it is now
   revocable: sessions are tracked per device and `tokenVersion` invalidates
   every token at once. `Secure` is set in production.
2. **No email flows** — no verification, no password reset. Losing both the
   authenticator and the recovery codes means losing the account. The footer no
   longer links to a `/forgot-password` page that does not exist.
3. **Route protection is client-side** (`src/app/dashboard/layout.tsx` renders a
   spinner until `/me` resolves, then redirects). There is no Next middleware, so
   the dashboard HTML shell is served to anonymous users — it contains no data.
4. **Reorder is drag-and-drop in the list view** (`SortableTodoList`); the board
   still drags between *columns* (status), not within one.
5. **Recurrence spawns on completion**, not on a schedule — there is no cron. A
   daily todo completed once a week produces one occurrence, not seven.
6. **`role: admin` is unused.** `getAllUsers` exists on the controller but no
   route exposes it, and nothing checks the role.
8. **2FA setup shows the secret, not a QR code** — there is no QR library, so the
   authenticator is fed the `otpauth://` URI or the base32 secret by hand.
9. **The service worker caches the shell only.** The app is installable and a
   reload works offline, but nothing queues writes for later — an edit made
   offline fails, and says so.
7. **Subtasks have no drag handle behaviour** — the `GripVertical` icon in
   `TodoForm` is decorative.

### Testing

`npm run test:api` runs 97 tests on Node's built-in runner against
`mongodb-memory-server` (it downloads a `mongod` binary on first run; set
`MONGO_TEST_URL` to use a real database instead). Coverage: auth, ownership
isolation between two users, search/filter/sort, pagination totals, bulk ops,
trash round-trip, recurrence, stats, preferences, password change, rate limiting,
projects, dependencies, comments, the library (views/templates/tags), and — in
`account.test.js` — export in both formats, import (dry run and real), sessions and
revocation, TOTP login including a recovery code, the audit log and account deletion.
`npm run test:web` runs 23 tests over `src/`, also on node's runner: node 24
strips the types, so there is no test framework and no build step. Two things
make it work — `allowImportingTsExtensions` in `tsconfig.json`, and imports
written with an explicit `.ts` extension. Only **pure** modules can be tested
this way (`next/navigation` does not resolve outside the bundler), which is why
the filter helpers live in `src/lib/filters.ts`. Anything needing a DOM is still
covered only by `next build`.

---

## 7. Conventions

- **API**: handlers are wrapped in `asyncTryCatchWrapper`; throw `ApiError` rather
  than returning error shapes; controllers hold all Mongoose access; every query
  is scoped by `ownerId`. Routes with a literal segment that could look like an id
  (`/bulk`, `/reorder`, the trash `DELETE /`) **must be declared before `/:id`**.
- **Validation**: add the rule to `server/validation/schemas.js` *and*
  `src/lib/validation.ts` so both sides agree.
- **Frontend**: network calls go in `src/lib/api.ts`; data access goes through a
  hook in `src/hooks/`; UI state goes in the Zustand store; shared types are
  ambient globals in `src/types/index.d.ts` (no import needed).
- **Components**: compose from `src/components/ui`; use `cn()` for conditional
  classes; keep motion behind `prefers-reduced-motion` (globals.css already
  neutralises durations globally). `Modal` caps itself to the viewport
  (`max-h-[calc(100dvh-2rem)]`) and scrolls its **body** between a fixed header
  and footer - put long content straight in rather than adding a second
  scroller, and never give a dialog its own height.
- **Adding API routes**: prefer `server/routes/`. Express is mounted first, so a
  Next Route Handler under `src/app/api/` would be shadowed.
