# Changelog

Every notable change to Modern Todo, newest first.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
the project uses [semantic versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

**Storage tiers come from the server.** The Files page renders every plan and
per-file tier `GET /api/files/quota` sends, so a tier is added or resized in
`server/config/storage.js` alone. There are more of both.

### Added

- **More storage tiers:** 250 GB, 500 GB and 1 TB plans, and a **Premium**
  per-file tier above Extended — 4 GB videos, 3 GB PDFs, and 100 MB images and
  audio.

### Changed

- **`GET /api/files/quota` also returns `perFileTiers`** — every per-file tier
  with its `label` and `caps` — alongside `tiers`. Per-file tiers are defined as
  one labelled table (`PER_FILE_TIERS` in `server/config/storage.js`); the
  frontend's tier types are plain strings, so a tier added on the server needs
  no client change.
- **The Files page lists the tiers the server defines.** The per-file picker
  was two hardcoded options with stale sizes, and the read-only view guessed the
  tier's name from its id. Both now render from `GET /api/files/quota`, show every
  per-kind limit the account is held to, keep a tier the server no longer offers
  visible, and confirm a change once the server has applied it.

### Fixed

- **A Standard account's video between 50 and 100 MB is no longer refused.** The
  upload was streamed against the tier's *document* cap rather than its largest
  cap, so a video the plan allowed was cut off mid-stream. The error now names
  the limit it hit.

---

## [2.1.0] — 2026-09-13

**A correctness and hardening release.** No new features: a review of the whole
tree ahead of this version turned up twenty-two findings, and this release is all
of them. Four were reproduced by execution before being fixed, and each now has a
regression test naming the bug it prevents.

Nothing changes for anyone using the application normally, with three exceptions
worth knowing about, listed under *Changed* below.

**Docker now runs three containers from three images** — the Next.js app, the
Rust PDF renderer and MongoDB. The renderer's compile no longer holds up the
application: the app and database build and start on their own, and the
renderer joins whenever its build finishes. The app container is strictly the
production server, and its image went from 4.05 GB to 1.66 GB. See *Changed —
deployment* and *Upgrading*.

**The project moves from npm to Yarn 4**, pinned in the repository, with install
scripts off for every dependency. See *Changed — package manager*.

### Fixed — data integrity

- **PDF compression no longer stores a truncated file.** Every external tool was
  capped at ten seconds, so `qpdf` on a large PDF was killed part-way through
  writing its output — and the partial file was then accepted, because the code
  checked only that an output file existed and was smaller than the input. A
  300 MB PDF was stored as 1.4 MB of fragment, checksummed as authoritative, with
  the original deleted. `qpdf` now runs without a timeout (the concurrency
  semaphore bounds the load instead), its exit code is honoured — 0, or 3 for
  warnings — and the output must end with a `%%EOF` trailer before it is allowed
  to replace the original. A result under 2% of the input is discarded as
  implausible whatever the tool claims.
- **Bulk actions can no longer write past the schema enums.** `value` was
  unvalidated and `updateMany` does not run validators, so
  `{ action: "status", value: "anything" }` answered 200 and stored it — making
  the record invisible to every status filter and crashing the board view, which
  indexes a fixed map by status. The bulk schema is now a discriminated union
  that ties each value to the field it lands in, the write runs validators, and
  the board falls back rather than throwing on an unknown value.
- **A todo can no longer be filed under another account's project.** `update`
  checked ownership; `create` and the `project` bulk action did not, and both
  persisted a stranger's `projectId`. No data ever leaked — every read is scoped
  by owner — but the dangling cross-tenant reference is gone.
- **Boolean flags sent as strings are read correctly.** `z.coerce.boolean()` is
  JavaScript truthiness, so `dryRun: "false"` arrived as `true`: an import asked
  to run silently previewed instead, and a request to skip the duplicate check
  ran it. Both flags now accept a boolean or an explicit `"true"`/`"false"`.
- **Rich text is capped before sanitising, not after.** Sanitising grows markup —
  every link gains `rel` and `target` — so a document near the limit could be cut
  through a tag and stored as broken HTML.
- **Uploads survive a temp-directory sweep.** The scratch directory was created
  once at boot; a tmp reaper removing it left every upload failing with ENOENT
  until a restart.

### Fixed — security

- **Proxy trust is now declared, not guessed.** Without it `req.ip` was the
  socket address, so behind a reverse proxy every client shared one rate-limit
  bucket — ten failed logins from anyone locked out everybody. `TRUST_PROXY_HOPS`
  states how many proxies are in front; `X-Forwarded-For` is no longer read by
  hand anywhere, which also stops a client forging the address recorded in the
  audit log and the session list.
- **Zero known vulnerabilities in the dependency tree**, down from eleven (two
  critical). Next.js 14.0.4 carried two critical advisories with no fix anywhere
  in the 14.x line, including unauthenticated RCE in the image optimizer that
  this application's use of `next/image` exposed — so Next moves to 15.5.25 and
  React to 19. `bcrypt` moves to 6, which drops the `node-pre-gyp` and `tar`
  chain entirely; `qs` and `postcss` are pinned to their patched lines.
- **The container no longer runs as root.** It also builds from the lockfile
  (`yarn install --immutable`), prunes devDependencies out of the runtime image, declares a
  `HEALTHCHECK` against `/api/health`, and runs `node` as PID 1 so a signal
  reaches the shutdown handlers directly and a clean stop exits 0.
- **The Docker build context drops from ~560 MB to ~6 MB.** `.dockerignore` did
  not exclude `services/pdf/target`, so several gigabytes of Rust build
  artifacts were uploaded to the daemon on every build and then discarded — the
  pdf-builder stage compiles its own. Caches, `*.tsbuildinfo` and the docs are
  excluded too.
- **MongoDB moves to the 8.0 LTS line and off the host network.** 5.0.2 was an
  end-of-life release from 2021; publishing port 27017 exposed the database to
  anything that could reach the host, when only the application ever talks to it.
  Compose now waits for a database that answers rather than a container that
  started.
- **`GLIBC_TUNABLES=glibc.pthread.rseq=1` on the database service**, required to
  run MongoDB 8.0 on Linux kernel 6.19 or newer (SERVER-121912). The image
  otherwise leaves rseq management to tcmalloc, whose implementation violates the
  rseq ABI; kernel 6.19 refactored rseq and broke that path, so mongod refuses to
  start rather than crash later. Setting the tunable hands rseq to glibc, which is
  the compliant path — MongoDB's own guard accepts it rather than being bypassed.
  Without it, `mongo:8.0` crash-loops on a current kernel.
- **Storage plans are no longer self-serve.** Any account could grant itself the
  largest quota and per-file cap in one request. Off unless
  `ALLOW_SELF_SERVE_TIERS=true`, and the quota endpoint reports which, so the UI
  shows the current plan as text instead of a control that would be refused.
- **The server refuses to start without a real `JWT_SECRET`** — under 32
  characters, or still the `change-me` placeholder, is now a startup failure
  rather than a deployment signing tokens anyone can forge.
- **Image decoding is bounded** at 50 MP. A few hundred kilobytes of crafted PNG
  decodes to gigabytes of bitmap at the library default, in the same process that
  serves the pages and hosts the PDF renderer.
- **CSV exports cannot smuggle a spreadsheet formula.** A cell opening with `=`,
  `+`, `-` or `@` is prefixed, and the importer strips that prefix back off, so an
  export still round-trips through it unchanged.
- **Turning two-factor authentication on now asks for the password**, as turning
  it off always did — otherwise a borrowed session could bind its own
  authenticator to the account and take the owner's recovery path with it.
- **Two unbounded per-account resources are capped**: progress streams
  (eight per account), and a supplied upload job id that collides with a live job
  is declined rather than replacing its registry entry and orphaning the child
  process behind it.
- **The editor's link dialog rejects any scheme but http, https and mailto.** The
  server always stripped the rest on save; now a `javascript:` URL is never live
  in the editor either.

### Fixed — interface

- **A long description no longer pushes the sidebar off the screen.** Two causes:
  nothing let an unbreakable token wrap, and the form's flexible grid column had
  no floor, so `1fr` — whose minimum is its content's min-content width — grew
  past the viewport. Rich text now wraps (code blocks keep their own horizontal
  scroll) and the three two-column layouts use `minmax(0,1fr)`.
- **Long titles wrap** in cards, board cards and dialog headings, and a board
  column can no longer be widened by one of them.
- **Board and calendar say when they are showing only part of the set.** Both ask
  for the whole set, but the API caps a page at 100, so beyond that they silently
  showed a fraction.
- **Undo after a large bulk delete works.** It searched only the newest 100 trash
  rows while the bulk endpoint accepts 200 ids, so it could report "nothing left
  to restore" for todos sitting in the trash intact.
- Two effects that read state they excluded from their dependencies now derive it
  inside the setter instead, removing both lint exceptions.

### Fixed — deployment

- **The app container no longer crash-loops with `cross-env: not found`.** It
  started through `npm run start`, which needs `cross-env` — a devDependency the
  image had just pruned. It now runs `node server.js` directly, so signals reach
  the shutdown handlers too.
- **The container no longer runs the Next dev server.** Compose passed
  `NODE_ENV` through from `.env`, overriding the image's own default, so an
  `.env` set up for host development made the container compile pages on request
  and serve the session cookie without its `Secure` flag. Compose now pins
  `NODE_ENV=production` for the app, and the image bakes it in.

### Changed

- **`POST /api/todo` and `PATCH /api/todo/bulk` now answer 400** where they
  previously answered 200: a status or priority outside the enums, and a
  `projectId` the caller does not own. The application's own client always sent
  valid values; a script might not have.
- **`POST /api/account/import` with `dryRun: "false"` now actually imports.**
  Previously it silently previewed. Check nothing relies on the old behaviour.
- **`POST /api/account/2fa/enable` now requires `password`** alongside `code`.

### Changed — configuration

- `NODE_ENV` is documented in `.env.example` as load-bearing rather than
  cosmetic: `server.js` starts Next in dev mode whenever it is not
  `production`. `.env` sets it for host runs only; the container is always
  production (see *Fixed — deployment*).
- The deprecated `useNewUrlParser` and `useUnifiedTopology` connection options
  are gone. Both have been no-ops since driver 4.0 and throw in the next major.

### Changed — deployment

- **The PDF renderer runs in its own container.** `services/pdf/Dockerfile`
  builds it from its own context, and compose runs it as the `pdf` service on
  port 8787 of an internal network. The app reaches it at `http://pdf:8787` with
  `PDF_SERVICE_SPAWN=0`; the child-process mode remains for `yarn dev`.
- **The app does not wait for the renderer.** There is no `depends_on: pdf`.
  Until the renderer is listening, PDF export answers 503 and everything else
  works.
- **The app image is a production build only.** The root `Dockerfile` has no
  Rust stage and is multi-stage: dependencies, `next build`, then a runtime with
  just `ffmpeg`, `qpdf`, production `node_modules`, `server/`, `shared/`,
  `public/` and `.next`. Sources, devDependencies, the webpack cache, the tests
  and the 212 MB test `mongod` that `mongodb-memory-server` left in
  `node_modules/.cache` all stay in the build stage.
- **MongoDB and the renderer are on an `internal` network**, with no published
  ports and no outbound route. The app joins that network and a normal one for
  its published port.
- **The app's code is read-only to the process.** Files are root-owned and only
  `.next` belongs to `node`, set with `COPY --chown` instead of a `chown -R`
  over all of `/app`, which duplicated `node_modules` into another layer.
- `.dockerignore` excludes `services/` (the renderer builds from its own
  context) and the Docker, compose and documentation files, so editing any of
  them no longer reruns `next build`.

### Changed — package manager

- **Yarn 4 replaces npm.** `.yarn/releases/yarn-4.18.0.cjs` is committed and
  `.yarnrc.yml` points `yarnPath` at it, so a global Yarn 1, Corepack's `yarn`
  and the Yarn bundled in the node image all run the same release. `yarn.lock`
  replaces `package-lock.json`, and `package.json` records
  `"packageManager": "yarn@4.18.0"`.
- **`nodeLinker: node-modules`.** Dependencies install into a plain
  `node_modules`; Plug'n'Play breaks Next.js and the native modules.
- **No dependency runs install scripts** (`enableScripts: false`), replacing
  npm's `allowScripts` allowlist with a stricter rule. `bcrypt` and `sharp` load
  their bundled prebuilt binaries without one; `mongodb-memory-server` downloads
  its `mongod` on the first `yarn test` instead of at install.
- **`overrides` became `resolutions`**, pinning `qs` (`^6.16.0`) and `postcss`
  (`^8.5.26`) above what `express` and `next` ask for.
- **The lockfile was migrated, not re-resolved.** 699 of the 716 package versions
  npm had installed are unchanged. 17 moved to newer patch or minor releases
  within their existing ranges — among direct dependencies, `express` 4.22.1 →
  4.22.2, `lucide-react` 1.42.0 → 1.45.0, `tailwind-merge` 3.6.0 → 3.7.0, `zod`
  4.5.4 → 4.6.4 and `autoprefixer` 10.5.4 → 10.6.0.
- The Docker build installs with `yarn install --immutable` and drops
  devDependencies with `yarn workspaces focus --all --production`.
- Every command in the documentation and in code comments is `yarn <script>`;
  `yarn test` runs `yarn test:api && yarn test:web`.

### Added

- `TRUST_PROXY_HOPS` and `ALLOW_SELF_SERVE_TIERS` environment variables, both
  documented in `.env.example`.
- `selfServeTiers` on `GET /api/files/quota`.
- A `HEALTHCHECK` on the application image and a healthcheck on the database
  service, with the application waiting for the latter.
- `scripts/docker-up.sh` builds the renderer in the background, starts MongoDB
  and the app as soon as their images are ready, then starts the renderer.
- The renderer container has a healthcheck on `GET /health`, runs as a non-root
  user on a read-only filesystem with `no-new-privileges`, and receives only
  `PDF_SERVICE_KEY` — never the database or JWT secrets.
- The renderer image stops on `SIGINT`. Its graceful shutdown listens for ctrl-c
  only, so as PID 1 it would ignore `SIGTERM` and every stop would wait out the
  kill timeout.

### Removed

- Compose watch mode (`develop.watch`), `tty` and `stdin_open` on the app. They
  belong to a development container; for hot reload, run `yarn dev` on the
  host.
- `server/__tests__/regressions.test.js` — one test per finding above.

### Upgrading

1. Set `JWT_SECRET` to at least 32 random characters, or the server will not
   start. Changing it signs every existing session out.
2. Set `TRUST_PROXY_HOPS` to the number of reverse proxies in front of the app.
   Leave it at 0 when it is reached directly.
3. MongoDB 5.0 data files cannot be read by 8.0, and there is no in-place jump
   across three majors. Either `mongodump` from 5.0 and restore into a fresh
   volume, or — in development — start clean. The compose file uses a new volume
   name (`mongo_data`), so an older volume stays untouched as a rollback. Note
   that this cuts both ways: 8.0 cannot read data files written by 8.2 or newer
   either, so do not point it at a volume some newer image has already used.
4. PDFs stored by an earlier version may already be truncated; this release
   prevents new ones but cannot repair them. Files whose bytes do not end in
   `%%EOF` need re-uploading.
5. Run `Storage.recompute()` (or open the Files page, which self-heals on drift)
   for any account that uploaded a truncated PDF.
6. Set `PDF_SERVICE_KEY` in `.env` to at least 16 characters, or the `pdf`
   container exits at boot. `PDF_SERVICE_SPAWN` and `PDF_SERVICE_URL` in `.env`
   are ignored under compose, which sets both for the app.
7. Start with `./scripts/docker-up.sh`, or `docker compose up -d --build`.
   Compose recreates MongoDB on the new internal network; the `mongo_data`
   volume is kept.
8. The app image no longer contains the renderer. Running it alone with
   `docker run` means no PDF export until a `pdf` container is reachable.
9. `docker compose watch` no longer applies. Rebuild the app after a code change
   with `docker compose up -d --build app`.
10. Switch to Yarn: delete `node_modules`, then run `yarn install`. Any `yarn`
    works — the pinned 4.18.0 takes over. Use `yarn <script>` where you used
    `npm run <script>`, and do not commit a `package-lock.json` back.

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

[Unreleased]: https://github.com/Thedevelop3r/modern-todo-next/compare/v2.1.0...HEAD
[2.1.0]: https://github.com/Thedevelop3r/modern-todo-next/releases/tag/v2.1.0
[2.0.0]: https://github.com/Thedevelop3r/modern-todo-next/releases/tag/v2.0.0
[1.0.0]: https://github.com/Thedevelop3r/modern-todo-next/releases/tag/v1.0-stable
