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
recurrence, pinned, archived, order, completedAt**. Deleting one moves a copy to
**Trash** (recoverable, keeping its original `_id`); **archiving** is a separate,
non-destructive state.

---

## 2. Layout

```
server.js              custom server: dotenv → mongo connect → next.prepare() → express
server/                the API (CommonJS)
  app.js               Express sub-app mounted at /api
  db.config.js         DatabaseConnection wrapper around mongoose
  routes/              index.js, user.route.js, todo.route.js, trash.route.js, stats.route.js,
                       project.route.js, library.route.js, account.route.js
  controller/          User, Todo, Trash, Stats, Project, Activity, Library, Account, Security
  models/              User, Todo (exports shared `todoFields`), Trash, Project, Comment,
                       Activity, SavedView, Template, AuditLog
  middleware/          auth, validate, rate-limit, checkin-logger, error-handler, not-found
  validation/schemas.js  zod schemas — the CJS mirror of src/lib/validation.ts
  utils/               api-error.js (ApiError), user.js (JWT+cookie), totp.js, csv.js,
                       fancy.js, tools.js
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
                       TodoDetailPanels, Heatmap
    command/           CommandPalette, ShortcutsModal
  hooks/               useAuth, useTodos, useFilters, useKeyboard, useProjects,
                       useLibrary, useProductivity, useReminders, useListNavigation
  lib/                 api.ts (typed client), utils.ts (cn + helpers), validation.ts,
                       date.ts, filters.ts (pure URL <-> filter), quickAdd.ts
  __tests__/           frontend tests, run by node --test (see Testing)
  providers/           QueryClient + next-themes + Tooltip + Toast
  app/manifest.ts      the PWA manifest (served at /manifest.webmanifest)
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
| `npm run icons` | regenerate the PWA icons |
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
| PUT | `/api/user/preferences` | theme, defaultView, pageSize, density |
| PUT | `/api/user/password` | requires the current password |
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
  role, status, `avatar`, `preferences{theme,defaultView,pageSize,density}`,
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
| `/dashboard/settings` | profile, avatar, preferences, password |
| `/dashboard/settings/data` | export, import with a dry-run preview, sample data |
| `/dashboard/settings/security` | sessions, two-factor, audit log, account deletion |
| `/dashboard/today` | focus view: overdue, due today, pinned, plus the pomodoro |
| `/dashboard/upcoming` | the next weeks grouped by day |
| `/dashboard/review` | weekly review |
| `/dashboard/projects/[projectId]` | one project: its todos and analytics |
| `/dashboard/templates`, `/dashboard/tags` | template library, tag manager |

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
- **UI scale**: `preferences.uiScale` sets the root font size via `UiScaleEffect`.
  Every size in the app is rem-based, so text and spacing scale together.
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
