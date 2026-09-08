# CONTEXT.md — Modern Todo (single Next.js project)

Working context for future changes and upgrades. Verified against the source
after the merge of the former `modern-todo-frontend-nodejs` and
`modern-todo-backend-nodejs` directories into one Next.js application.

---

## 1. What this is

A personal todo application by Bilal Amjad (@thedevelop3r), MIT licensed, served
as **one Next.js project with a custom server**:

- **UI** — Next.js 14.0.4 App Router, React 18, TypeScript 5 (strict), Tailwind 3, Zustand 4
- **API** — Express 4 + Mongoose 8 on MongoDB, JWT in an `HttpOnly` cookie
- **One process, one port.** `server.js` prepares Next, mounts the Express app at
  `/api`, and hands every other request to the Next request handler.

Domain model: a user owns **Todos**; deleting a Todo moves a copy into **Trash**,
from which it can be recovered or permanently destroyed.

```
node server.js
     │
     ├── /api/*   →  Express app (server/app.js)
     └── /*       →  Next.js handler (src/app/)
```

The single-origin setup is the load-bearing consequence of the merge: **there is
no CORS layer**, the session cookie is same-site, and the browser calls the API
with relative paths. Do not reintroduce absolute API URLs.

---

## 2. Layout

```
server.js              custom server: dotenv → mongo connect → next.prepare() → express
server/                the API (CommonJS)
  app.js               Express sub-app mounted at /api; helmet, cookie-parser,
                       json/urlencoded parsing, request logger, error handler, 404
  db.config.js         DatabaseConnection class wrapping mongoose.connect(MONGO_URL)
  routes/              index.js (mounts), user.route.js, todo.route.js, trash.route.js
  controller/          User.controller.js, Todo.controller.js, Trash.controller.js
  models/              User.model.js, Todo.model.js, Trash.model.js
  middleware/          auth.js, checkin-logger.js, error-handler.js, not-found.js
  wrapper/             async-trycatch.js (wraps handlers, forwards errors to next())
  utils/               tools.js (barrel: User/Math/Fancy), user.js (JWT+cookie), math.js, fancy.js
src/                   the Next.js app
  app/
    layout.tsx                       root layout: <Header/> {children} <Footer/>
    page.tsx                         marketing landing page
    globals.css
    _document.tsx                    DEAD FILE — Pages-Router leftover, unused by App Router
    login/page.tsx                   POST /api/user/login, then push("/dashboard")
    register/page.tsx                POST /api/user/register, then push("/login")
    learn-more/page.tsx              STUB — renders the text "Learn More"
    dashboard/
      layout.tsx                     client-side auth gate: GET /api/user/me, loads todos, else push("/login")
      page.tsx                       todo list, refresh/reset, delete, pagination
      create-todo/page.tsx
      edit-todo/[todoId]/page.tsx
      todo/[todoId]/page.tsx
      trash/page.tsx                 recover / permanently delete
      profile/[profileId]/page.tsx   inline edit of name and status
  components/
    Header.tsx, Footer.tsx           switch on pathname: General* vs Dashboard* variants
    General/GeneralHeader.tsx, GeneralFooter.tsx
    Dashboard/DashboardHeader.tsx, DashboardFooter.tsx, Sidebar.tsx, Pagination.tsx
    Modals/CreateTodo.tsx            UNUSED — bare class names with no CSS backing them
  store/state.tsx                    Zustand store
  types/index.d.ts                   ambient globals: User, Todo, Todos, TodoMeta, TodoFilter, StoreState
  utils/index.tsx                    fetch wrappers, withQuery helper, capitalizers, STATUS_MAP
  utils/api_endpoint.js              relative /api paths
  utils/static.json                  nav link tables
  assets/avatar/Men.svg, Women.svg
public/                next/vercel svgs
project-screenshots/   README images
Dockerfile, compose.yaml, .env.example, .dockerignore, .gitignore
next.config.js, tsconfig.json, tailwind.config.ts, postcss.config.js
```

Package manager is **npm** (`package-lock.json`). The old `yarn.lock` was removed
so there is exactly one lockfile.

### Scripts

| Script | Command | Notes |
|---|---|---|
| `npm run dev` | `node server.js` | Next in dev mode (HMR) behind the custom server |
| `npm run build` | `next build` | type-checks and lints as part of the build |
| `npm start` | `cross-env NODE_ENV=production node server.js` | requires a prior `build` |
| `npm run lint` | `next lint` | |

There are still **no tests and no CI**.

---

## 3. The API (all under `/api`)

`server/routes/index.js` mounts `/user` unauthenticated and applies the `auth`
middleware to the whole `/todo` and `/trash` routers.

| Method | Path | Auth | Handler |
|---|---|---|---|
| GET | `/api` | no | health check `{ message: "Hello World!" }` |
| POST | `/api/user/register` | no | `User.create`, returns user |
| POST | `/api/user/login` | no | verify password, sign JWT, set `token` cookie |
| GET | `/api/user/me` | yes | returns `req.user` |
| PUT | `/api/user/update` | yes | updates **name and status only** |
| POST | `/api/user/logout` | no* | clears cookie (*reads cookie, 400 if absent) |
| GET | `/api/todo?page=&limit=` | yes | list own todos + `meta` |
| GET | `/api/todo/:id` | yes | own todo or 404 |
| POST | `/api/todo` | yes | create (ownerId forced from token) |
| PUT | `/api/todo/:id` | yes | update title/description/status only |
| DELETE | `/api/todo/:id` | yes | delete todo **and copy it into Trash** |
| GET | `/api/trash?page=&limit=` | yes | list own trash + `meta` |
| GET | `/api/trash/:id` | yes | one trash item |
| PUT | `/api/trash/:id` | yes | recover: delete from Trash, re-create as Todo |
| DELETE | `/api/trash/:id` | yes | permanent delete |

An admin-only `GET /api/user/all` exists in the controller (`getAllUsers`) but the
route is commented out. There is **no role enforcement anywhere** despite the
`role: admin|user` field.

### Models

- **User**: `name`, `email` (unique, required), `password` (min 6, required,
  bcrypt-hashed in a `pre("save")` hook), `role` `admin|user` (default `user`),
  `status` `active|inactive` (default `active`), timestamps. Instance method
  `comparePassword`.
- **Todo**: `title` (required, ≤100), `description` (≤1500), `ownerId` → User
  (required), `status` `pending|progress|completed` (default `pending`), timestamps.
- **Trash**: same as Todo plus `todoId` → Todo (required).

`Todo` and `Trash` declare `createdAt`/`updatedAt` fields *and* pass
`{ timestamps: true }` — redundant but harmless.

### Auth

`server/middleware/auth.js` accepts either an `Authorization: Bearer <token>`
header or the `token` cookie, verifies it with `JWT_SECRET`, loads the user via
the **static** `UserController.verifyUser(id)`, and attaches it as `req.user`.
Tokens are signed in `server/utils/user.js` with `{ _id }`, `expiresIn: "1d"`.
The cookie is set twice (via `res.cookie` and a manual `Set-Cookie` header):
`HttpOnly`, `SameSite=Lax`, `Path=/`, 24h — **no `Secure` flag**.

Mixed export style, worth knowing: `UserController` is exported as the **class**
(instantiated in `user.route.js`), while `TodoController` and `TrashController`
are exported as **singleton instances**.

---

## 4. Frontend notes

- Every page that touches state or the browser is `"use client"`. There is **no
  Next.js middleware and no server-side auth check** — route protection is the
  `useEffect` in `src/app/dashboard/layout.tsx`, so protected pages flash before
  redirecting.
- All network calls live in `src/utils/index.tsx`, use
  `credentials: "include"`, and hit relative paths from
  `src/utils/api_endpoint.js`. List endpoints build their query string through
  the local `withQuery()` helper — `new URL()` cannot be used on a relative path.
- **Zustand store** (`src/store/state.tsx`): `user`, `todos`, `trash`, plus
  `todoPagination`/`todoMeta` and `trashPagination`/`trashMeta` (both default
  `page:1, limit:10`). Actions: `updateUser`, `updateTodos`, `updateTodoMeta`,
  `updatePagination`, `updateTrash`, `updateTrashPagination`.
  `updateTodos`/`updateTrash` sort by `createdAt` desc client-side. State is
  **not persisted** — a refresh re-fetches via the dashboard layout.
- `next.config.js` sets a hand-written security header set. The CSP is now
  `'self'`-only (still with `unsafe-inline`/`unsafe-eval`, which Next needs)
  because there is no second origin to allow.
- `tsconfig.json`: `strict: true`, path alias `@/* → ./src/*`. Only `.ts`/`.tsx`
  are included, so the CommonJS files under `server/` are not type-checked.

---

## 5. Configuration

Copy `.env.example` to `.env`. Variables the **application actually reads**:

| Variable | Used by | Default |
|---|---|---|
| `MONGO_URL` | `server/db.config.js` | none — required |
| `JWT_SECRET` | `server/utils/user.js`, `server/middleware/auth.js` | none — required |
| `PORT` | `server.js` | `3000` |
| `HOSTNAME` | `server.js` | `localhost` |
| `NODE_ENV` | `server.js` (dev vs production Next) | dev unless `production` |

`.env.example` also carries `MONGO_INITDB_*` and `MONGODB_*_PORT`, which only
docker compose consumes. `.env` is git-ignored.

Env loading is `require("dotenv").config()` at the top of `server.js`, before
anything reads `process.env` — `server/db.config.js` destructures env at module
load, so that ordering matters if you restructure the boot path.

---

## 6. Known issues (unchanged by the merge — read before changing anything)

These are pre-existing defects that the conversion deliberately left alone.

1. **Pagination totals ignore ownership.** In both `Todo.controller.js` and
   `Trash.controller.js`, `meta.totalRecords`/`totalPages` come from
   `countDocuments()` with **no `ownerId` filter** — counts are global across all
   users while `data` is correctly scoped. Wrong as soon as there are two users.
2. **`TodoController.destroy` crashes on a missing todo.** It does
   `Trash.create({ ...deletedTodo._doc, ... })` *before* the route's null check,
   so deleting a non-existent or foreign id throws a `TypeError` → 500, not 404.
3. **Trash recover reuses the wrong `_id`.** `TrashController.recover` spreads the
   trash document's `_doc` (including its `_id`) into `Todo.create`, so the
   restored todo takes the *trash record's* id, not the original todo's, and the
   preserved `todoId` field is silently dropped (not in the Todo schema).
4. **`server/utils/math.js` is broken.** It declares `const Math = {}`, shadowing
   the global `Math`, so `Math.random()` calls `Math.floor` on an empty object →
   `TypeError`. Harmless only because nothing calls it. Do not use `Tools.Math`.
5. **`getTodos` swallows errors** with `return err` inside its try/catch, so a DB
   failure returns an `Error` where `{ data, meta }` is expected.
6. **`error-handler.js` reads `err.statusCode`**, which nothing ever sets — every
   error becomes a 500 with the raw message.
7. **Auth is single-token**: 1 day, no refresh, no server-side invalidation on
   logout, and the cookie has no `Secure` flag (add it behind TLS).
8. **Dead ends in the UI.** `learn-more` is a stub; the footer and login page link
   to `/privacy-policy`, `/terms-of-service`, `/contact-us`, `/services` and
   `/forgot-password`, **none of which exist** → 404. `src/app/_document.tsx` and
   `src/components/Modals/CreateTodo.tsx` are unused dead files.
9. **UX uses `alert()`** for login/register/validation failures. No toast or
   error-state system exists.
10. **`server/middleware/auth.js` and `checkin-logger.js` log every request**
    verbosely to stdout. Token *values* are no longer printed, but the noise
    should be put behind a log level before production.
11. **No tests, no CI.** `next build` (which type-checks and lints) is the only
    automated check.

---

## 7. Conventions to follow when extending

- **API**: every route handler is wrapped in `asyncTryCatchWrapper` so errors
  reach `errorHandler`; controllers hold all Mongoose access; new modules are
  exported through the `index.js` barrel in their folder. Ownership is always
  enforced by querying `{ _id, ownerId: req.user._id }` — keep that pattern.
  Paths declared in `server/` are relative to the `/api` mount point.
- **Middleware placement**: anything registered in `server/app.js` applies only to
  API requests. Middleware that must also see page requests belongs in
  `server.js` before the `/api` mount — be deliberate about which you want.
- **Frontend**: pages touching state or the browser are `"use client"`; network
  calls belong in `src/utils/index.tsx`; paths belong in
  `src/utils/api_endpoint.js` and stay relative; shared types are **ambient
  globals** in `src/types/index.d.ts` (no import, no export); styling is Tailwind
  utility classes inline, no CSS modules.
- **Adding API routes**: prefer the Express side under `server/routes/` for
  consistency. If you ever add Next.js Route Handlers under `src/app/api/`, note
  that Express is mounted first and would shadow them.

---

## 8. Author's own TODOs left in the code

- `Todo.controller.js` / `Trash.controller.js`: "TODO: 1 Apply sorting and filters".
- `src/app/dashboard/page.tsx`: "TODO: 1. add pagination, 2. add filter —
  acc-decend client-server, 3. add search == pending" (pagination is done; sorting
  and search are not).
- The landing page advertises "line items, costs analysis" — not built.
