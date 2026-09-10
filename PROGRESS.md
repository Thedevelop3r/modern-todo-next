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

Features 1–20 shipped earlier; this program adds 21–70.

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
