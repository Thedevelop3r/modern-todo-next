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
  routes/              index.js, user.route.js, todo.route.js, trash.route.js, stats.route.js
  controller/          User, Todo, Trash, Stats
  models/              User, Todo (exports shared `todoFields`), Trash
  middleware/          auth, validate, rate-limit, checkin-logger, error-handler, not-found
  validation/schemas.js  zod schemas — the CJS mirror of src/lib/validation.ts
  utils/               api-error.js (ApiError), user.js (JWT+cookie), fancy.js, tools.js
  wrapper/             async-trycatch.js
  __tests__/           helpers.js + api.test.js (39 tests) + rate-limit.test.js
src/
  app/                 App Router pages (see §4)
  components/
    ui/                the design system — Button, Card, Input, Badge, Modal, Menu,
                       Toggle, Toast, Avatar, Feedback, Motion, ThemeToggle (+ index.ts barrel)
    layout/            Sidebar, Topbar, PublicShell
    todo/              TodoCard, TodoBits, FilterBar, BulkBar, TodoBoard,
                       TodoCalendar, TodoForm, Pagination, charts.tsx
    command/           CommandPalette, ShortcutsModal
  hooks/               useAuth, useTodos, useFilters, useKeyboard
  lib/                 api.ts (typed client), utils.ts (cn + helpers), validation.ts, date.ts
  providers/           QueryClient + next-themes + Tooltip + Toast
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
| `npm test` | `node --test "server/__tests__/**/*.test.js"` |
| `npm run lint` | `next lint` |

---

## 3. The API (all under `/api`, all JSON)

`server/routes/index.js` mounts `/user` unauthenticated; `auth` guards `/todo`,
`/trash`, `/stats` and `/tags`.

| Method | Path | Notes |
|---|---|---|
| GET | `/api` | health check |
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

**List query params** (`GET /api/todo`, validated by `listQuerySchema`):
`page`, `limit`, `q`, `status[]`, `priority[]`, `tags[]`,
`due=overdue|today|week|none`, `archived`, `pinned`, `sort`, `order`.
Lists accept comma-separated *or* repeated keys (`status=a,b` and `status=a&status=b`).

Two behaviours worth knowing before changing the controller:

- **`archived` defaults to `false`** — archived todos are hidden unless asked for.
- **Pinned todos sort first** in every view, whatever `sort`/`order` say. Priority
  sorting uses a computed numeric rank in an aggregation (`$switch`), because the
  enum would otherwise sort alphabetically.

### Models

- **User**: name, email (unique, lowercased), password (bcrypt via `pre("save")`),
  role, status, `avatar`, `preferences{theme,defaultView,pageSize,density}`,
  `lastLoginAt`. Methods: `comparePassword`, `toSafeJSON`.
- **Todo**: the `todoFields` object is exported and **reused by Trash**, so a
  delete/recover round trip preserves everything. `pre("save")` keeps
  `completedAt` in step with `status`. Indexed on `{ownerId,archived,status}`,
  `{ownerId,dueDate}`, `{ownerId,pinned,order,createdAt}`, plus a text index.
- **Trash**: `todoFields` + `todoId` (the original id) + `deletedAt`.

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

### Data layer

**TanStack Query owns all server data.** `src/lib/api.ts` is the only place that
calls `fetch`; `src/hooks/useTodos.ts` and `useAuth.ts` wrap it. `useUpdateTodo`
and `useDeleteTodo` are **optimistic** (`onMutate` patches every cached list page,
`onError` rolls back) — that is what makes status toggles, pinning and delete-undo
feel instant.

**Zustand (`src/store/state.tsx`) holds UI state only**: view mode, selection,
sidebar/mobile-nav/palette/shortcuts flags. Do not put server data back in it —
the old store kept a second copy of the todos and it drifted.

**Filter state lives in the URL** (`src/hooks/useFilters.ts`). `parseFilter` /
`serializeFilter` round-trip it; only non-default values are written. Any filter
change resets to page 1.

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

1. **Auth is single-token** — 1 day, no refresh, no server-side invalidation on
   logout (the cookie is cleared client-side). `Secure` is set in production.
2. **No email flows** — no verification, no password reset. The footer no longer
   links to a `/forgot-password` page that does not exist.
3. **Route protection is client-side** (`src/app/dashboard/layout.tsx` renders a
   spinner until `/me` resolves, then redirects). There is no Next middleware, so
   the dashboard HTML shell is served to anonymous users — it contains no data.
4. **Reorder is API-only.** `PUT /api/todo/reorder` and the `order` field work and
   are tested, but no view drags to reorder yet; the board drags between
   *columns* (status), not within one.
5. **Recurrence spawns on completion**, not on a schedule — there is no cron. A
   daily todo completed once a week produces one occurrence, not seven.
6. **`role: admin` is unused.** `getAllUsers` exists on the controller but no
   route exposes it, and nothing checks the role.
7. **Subtasks have no drag handle behaviour** — the `GripVertical` icon in
   `TodoForm` is decorative.

### Testing

`npm test` runs 39 tests on Node's built-in runner against
`mongodb-memory-server` (it downloads a `mongod` binary on first run; set
`MONGO_TEST_URL` to use a real database instead). Coverage: auth, ownership
isolation between two users, search/filter/sort, pagination totals, bulk ops,
trash round-trip, recurrence, stats, preferences, password change, rate limiting.
There is still **no frontend test suite** — `next build` (types + lint) is the
only automated check on `src/`.

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
  neutralises durations globally).
- **Adding API routes**: prefer `server/routes/`. Express is mounted first, so a
  Next Route Handler under `src/app/api/` would be shadowed.
