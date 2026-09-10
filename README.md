# Modern Todo

Written by [Bilal Amjad](https://github.com/Thedevelop3r).

A personal todo application — **one Next.js project**. The UI is Next.js 14 (App
Router, TypeScript, Tailwind) and the REST API is Express + Mongoose, both served
from a single custom server on a single port.

### Home
![Home](project-screenshots/home.png)

### Dashboard
![Dashboard](project-screenshots/dashboard.png)

### Profile
![Dashboard](project-screenshots/profile.png)

## Features

**Organise** — due dates with overdue/today/soon badges · five priority levels ·
free-form tags with autocomplete · subtask checklists with progress · pinning ·
archive · duplicate · recurring todos (daily/weekly/monthly)

**Find** — full-text search across titles, descriptions and tags with highlighted
matches · combined status/priority/tag/due filters · sorting on five fields ·
filters live in the URL, so any view is a shareable link

**Act** — multi-select with bulk status, priority, tag, pin, archive and delete ·
optimistic updates with undo · trash with restore · empty trash

**Structure** — projects with their own todos and analytics · start dates and
effort estimates · a built-in timer per todo · comments · an activity trail ·
dependencies, with cycle detection and blocked todos that cannot be completed

**Reuse** — saved views · templates (create one from scratch or from an existing
todo) · a tag manager that renames, merges and deletes across every todo

**See** — list, grid, drag-and-drop board, month calendar and table views ·
today, upcoming and weekly-review pages · analytics with completion trends,
status and priority breakdowns, top tags, a contribution heatmap and a daily
streak

**Make it yours** — **50 colour themes** in three collections (men, women and
other), each with a light *and* a dark version · **any Google Font by name**,
fetched through the app itself · five text sizes · compact mode. See
[Theming and fonts](#theming-and-fonts).

**Control** — `Ctrl/Cmd+K` command palette · keyboard shortcuts (`n`, `/`, `g d`,
`?`) · installable as a PWA, and a reload works offline · a skip link, live
regions and focus management throughout

**Account** — change password with a strength meter · avatar picker ·
two-factor authentication with recovery codes · per-device sessions you can
revoke · an audit log · export and import (JSON or CSV, with a dry run) ·
rate-limited sign-in · validation shared between client and server

## Architecture

```
node server.js
     │
     ├── /api/*   →  Express app (server/)      — auth, todos, projects, account, fonts
     └── /*       →  Next.js handler (src/app/) — pages, assets, HMR
```

Pages and API share an origin, so there is no CORS layer and the JWT session
cookie is a plain same-site `HttpOnly` cookie. The browser calls the API with
relative paths — nothing has a hardcoded host or port.

## Layout

```
server.js              custom server: connects to MongoDB, prepares Next, mounts Express at /api
server/                the API
  app.js               Express sub-app (helmet, cookies, parsing, logging, errors)
  routes/              user, todo, trash, stats, project, library, account, font
  controller/          all Mongoose access
  models/              User, Todo, Trash, Project, Comment, Activity, SavedView,
                       Template, AuditLog
  middleware/          auth, validate, rate-limit, logger, error handler
  validation/          zod schemas — the CommonJS mirror of src/lib/validation.ts
  __tests__/           API test suite
src/
  app/                 pages
  app/themes.css       generated — the 50 palettes (never edit by hand)
  components/ui/       the design system
  components/todo/     cards, board, calendar, filters, charts
  hooks/               data + filter + keyboard hooks
  lib/                 api client, helpers, validation, dates, the theme catalogue
shared/                data both halves read: themes.json, google-fonts.json
scripts/               generators for the icons, the themes and the font list
```

## Theming and fonts

### 50 themes

Every colour in the app is a semantic CSS variable — `--bg`, `--surface`,
`--primary`, `--fg-muted` and so on — mapped into Tailwind as
`rgb(var(--token) / <alpha-value>)`. A theme is nothing more than a different set
of values for those same variables, which is why adding fifty of them changed no
component at all.

`shared/themes.json` holds one compact **seed** per theme (three hues, two chroma
amounts, a default font and a collection). `npm run themes` expands each seed into
a light and a dark block:

```css
[data-theme="rose-quartz"]      { --bg: 255 248 251; --primary: 168 56 118; … }
.dark[data-theme="rose-quartz"] { --bg:  21  7  14; --primary: 234 136 184; … }
```

Colours are computed in **OKLCH**, so one lightness ramp reads the same across
every hue, and the generator **fails the build** if a theme misses its contrast
floors (7:1 for body text, 4.5:1 for muted text and button labels). An
unreadable theme cannot ship. Status and priority hues are deliberately fixed
across all fifty — red, amber and green identify state on every badge in the app,
and a theme must not turn an encoding into decoration.

Theme and light/dark are **orthogonal**: the theme picks the personality, the
topbar toggle picks the mode, and every theme has both. Pick one under
**Settings → Appearance**.

> `src/app/themes.css` and `src/lib/themes.generated.ts` are generated. Edit
> `shared/themes.json` and run `npm run themes` instead.

### Any Google Font, by name

Type a family name in **Settings → Appearance** and it is applied. Suggestions
come from a committed list of every Google family, but the field is not limited
to it — any correctly spelled name is checked against Google and used.

Fonts are **proxied, not linked**. The app's Content-Security-Policy is
`font-src 'self'`, so the browser cannot reach `fonts.googleapis.com` or
`fonts.gstatic.com` at all. Instead the API fetches the stylesheet, rewrites every
font URL to one of its own, and serves the files itself:

```
browser → GET /api/fonts/css?family=Sora
            → server fetches fonts.googleapis.com
            → rewrites gstatic URLs to /api/fonts/file/<id>
browser → GET /api/fonts/file/<id>
            → server fetches and caches the woff2
```

Three things follow: the CSP stays shut, the service worker caches the files like
any other same-origin request so a chosen font still works offline, and no user's
browser ever makes a request to Google. `/api/fonts/file/:id` takes an opaque id
rather than a URL — ids exist only after parsing a stylesheet Google sent us,
which is what keeps the endpoint from being turned into a proxy for anything else.

Inter and JetBrains Mono are self-hosted by `next/font` and remain the defaults.

## Requirements

- Node.js 24+
- MongoDB (or Docker, which brings one up for you)

## Setup

```bash
cp .env.example .env      # then edit MONGO_URL and JWT_SECRET
npm install
```

`bcrypt` compiles a native addon; if your package manager blocks install scripts,
run `npm rebuild bcrypt` after approving it.

## Usage

```bash
# development (hot reload)
npm run dev

# production
npm run build
npm start

# tests — the API suite, then the frontend one
npm test
npm run test:api
npm run test:web

# lint
npm run lint

# regenerate the theme CSS after editing shared/themes.json
npm run themes

# refresh the bundled Google Fonts family list
npm run fonts
```

The whole application — pages and API — is then on `http://localhost:3000`
(set `PORT` to change it).

## Docker & compose

```bash
# builds the app image and starts MongoDB alongside it
docker compose up --build

# compose watch mode
docker compose watch
```

## Tests

`npm test` runs both suites on Node's built-in test runner — no jest, no vitest
and no build step, because Node 24 strips the types itself.

The API suite runs against an in-memory MongoDB and covers auth, per-user
isolation, filtering, sorting, pagination, bulk operations, the trash round trip,
recurrence, projects, comments, dependencies, timers, export/import, 2FA, the
font proxy, stats and rate limiting. The frontend suite covers the pure modules:
helpers, dates, quick-add parsing, filter serialisation, validation and the theme
catalogue.

```bash
npm test                                   # downloads a mongod binary on first run
MONGO_TEST_URL=mongodb://localhost:27017/todo-test npm test   # or use your own
```

## API

All routes are under `/api`. `/api/user/register` and `/api/user/login` are
public; everything else requires the session cookie (or an
`Authorization: Bearer <token>` header).

| Method | Path | Description |
|---|---|---|
| GET | `/api` | health check |
| POST | `/api/user/register` | create an account |
| POST | `/api/user/login` | sign in, sets the `token` cookie |
| POST | `/api/user/logout` | clears the cookie |
| GET | `/api/user/me` | current user |
| PUT | `/api/user/update` | update name / status / avatar |
| PUT | `/api/user/preferences` | theme, theme id, font, default view, page size, density, text size |
| PUT | `/api/user/password` | change password |
| GET | `/api/todo` | list — supports `page`, `limit`, `q`, `status`, `priority`, `tags`, `due`, `archived`, `pinned`, `sort`, `order` |
| POST | `/api/todo` | create |
| GET | `/api/todo/:id` | read one |
| PUT | `/api/todo/:id` | update |
| DELETE | `/api/todo/:id` | delete, moving a copy to trash |
| POST | `/api/todo/:id/duplicate` | duplicate |
| PATCH | `/api/todo/bulk` | bulk status/priority/tag/pin/archive/delete |
| PUT | `/api/todo/reorder` | persist manual order |
| GET | `/api/trash` | list trashed todos |
| PUT | `/api/trash/:id` | restore |
| DELETE | `/api/trash/:id` | delete permanently |
| DELETE | `/api/trash` | empty trash |
| GET | `/api/stats` | analytics aggregation |
| GET | `/api/tags` | tags with usage counts |
| GET/POST | `/api/project` | list / create projects (also `/:id`, `/reorder`) |
| GET/POST | `/api/todo/:id/comments` | read and add comments (edit and delete via `/api/todo/comments/:commentId`) |
| GET | `/api/todo/:id/activity` | the change trail for one todo |
| POST | `/api/todo/:id/timer/start` | start / stop a timer (`/stop`) |
| GET/POST | `/api/view` | saved views (also `/:id`) |
| GET/POST | `/api/template` | templates, plus `/from-todo` and `/:id/use` |
| PUT | `/api/tags/rename` | rename, `/merge`, or `DELETE /api/tags/:tag` |
| GET | `/api/account/export` | export the account; `/export/todos` for JSON or CSV |
| POST | `/api/account/import` | import todos, with a dry-run mode |
| GET | `/api/account/sessions` | signed-in devices; `DELETE` one or `/all` |
| POST | `/api/account/2fa/setup` | two-factor: `/enable`, `/disable` |
| GET | `/api/account/audit` | account security events |
| GET | `/api/fonts/search` | Google Fonts typeahead |
| GET | `/api/fonts/css` | a family's stylesheet, proxied and rewritten |
| GET | `/api/fonts/file/:id` | one font file, by an id the `css` route issued |

## License

[MIT](https://choosealicense.com/licenses/mit/)

## Permission

You are free to use this code for your own projects, modify it, or publish it
anywhere. Please give me credit if you use it. (@Thedevelop3r), thanks.
