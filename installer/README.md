# Modern Todo installer

A small desktop program that installs Modern Todo on a Windows or Linux computer
and then manages it. It installs nothing system-wide and needs no administrator
rights. No Docker is involved. The user needs no terminal, git, Node or Rust.

- **Windows:** `installer.exe`
- **Linux (Debian/Ubuntu):** `installer.deb`, which adds *Modern Todo Installer* to the applications menu

## What ends up on disk

The user picks a folder, for example `D:\todoapp`:

```text
D:\todoapp\
  todo.exe        opens, updates, closes and uninstalls Modern Todo
  source\         the application and its build; replaced on update
  runtime\        Node.js, MongoDB (mongod only) and the PDF renderer
  data\           the database
  logs\           app.log, mongod.log, supervisor.log
  run\            the background process's lock and status
```

After installing, the downloaded installer can be deleted.

## Install

1. Copy itself into the folder as `todo.exe` (`todo` on Linux).
2. Download Node.js: the newest 24.x from nodejs.org, checked against `SHASUMS256.txt`.
   Only the `node` binary is kept.
3. Download MongoDB 8.0.32 (pinned, SHA-256 checked on Linux).
   - Windows: MongoDB's zip is 800 MB, almost all debug symbols. `mongod.exe` is read
     out of it with HTTP range requests (`net::RangeReader`) instead.
   - Linux: the build matching `/etc/os-release` (Ubuntu 20.04/22.04/24.04 or Debian 12).
4. Download the `main` branch from GitHub into `source/`, as a tarball, so git is not needed.
5. Write `source/.env` from `.env.example`. It gets:
   - free local ports: app from 3000, database from 27117, renderer from 8787
   - a random database password, JWT secret and PDF key
   - `LISTEN_HOST=127.0.0.1`, so the app is not reachable from the network
6. `yarn install --immutable` and `yarn build`, using the repository's pinned Yarn and
   the downloaded Node. The Yarn cache goes in `runtime/yarn`.
7. Download the prebuilt PDF renderer (see below).
8. Add a desktop and Start menu shortcut (Windows) or an applications-menu entry (Linux).

Every step shows its progress and output in the window, and each step can be run again
safely. **Try again** or **Finish installation** carries on where it stopped.

## Running in the background

**Open** starts `todo --serve <folder>`, detached from the window. It then waits for
`/api/health`, opens `http://localhost:3000` (or the chosen port) and closes the window.

The supervisor:

- starts `mongod` on 127.0.0.1 with authentication and a 250 MB cache limit. On first
  start it creates the application's database user through MongoDB's localhost exception,
  using `src/db-admin.cjs` and the app's own driver.
- starts `node server.js`. The server starts the PDF renderer itself
  (`PDF_SERVICE_SPAWN=1`, `PDF_SERVICE_BIN`).
- restarts the server if it crashes, and gives up after repeated crashes.
- holds `run/supervisor.lock` while it runs. The OS releases the lock when the process
  ends, so the window uses it to tell whether Modern Todo is running.
- shuts down in order when `run/stop` appears: the server first, then the database
  (SIGTERM on Linux, a `shutdown` command on Windows).
- if it is killed, the OS ends its children too (`PR_SET_PDEATHSIG` on Linux, a
  kill-on-close job object on Windows), so no database is left running. On Linux the
  renderer, a grandchild, can survive that. The next supervisor start ends any
  process still running a program from this installation's `runtime/`.

**Close background application** creates `run/stop` and waits. Nothing keeps running
afterwards.

## Update

Update compares with GitHub and nodejs.org, and does only what changed:

- **A new commit on `main`:** download it into `source/`. `.env`, `node_modules` and
  `.next` are carried over, so yarn and Next only redo what changed.
- **Application files changed** (anything outside `services/`, `installer/`, `.github/`
  and `*.md`): `yarn install` and `yarn build`.
- **`services/pdf` changed:** download that renderer build. It is never compiled locally.
- **A new Node.js 24.x, or a new pinned MongoDB:** replace it.

If Modern Todo was running, it is stopped for the update and started again afterwards.

## PDF renderer builds

`.github/workflows/pdf-renderer.yml` runs on pushes to `main` that touch `services/pdf`.
It builds the renderer for Windows (static C runtime) and Linux and publishes a release
tagged `pdf-<first 12 characters of git rev-parse HEAD:services/pdf>`. That tree id
changes exactly when the renderer's files do. The installer asks GitHub for the tree id
at the commit it installs and downloads the matching release.

- **The release is not published yet** (the workflow is still running): an existing
  renderer is kept. A first install takes the newest published renderer.
- **No release exists at all:** everything but PDF export works.

## Uninstall

Uninstall warns that every todo will be deleted and asks the user to make a backup. The
user must tick a box before continuing. It then stops Modern Todo, removes the shortcuts
and deletes `source`, `runtime`, `data`, `logs`, `run` and `todo.exe`. The folder itself is
removed only if nothing else is left in it.

## Building

```sh
cd installer
cargo test -- --include-ignored     # the ignored tests use the network

# Linux binary and .deb
cargo build --release
cargo install cargo-deb   # once
cargo deb --output installer.deb

# Windows .exe, cross-compiled from Linux (needs mingw-w64)
rustup target add x86_64-pc-windows-gnu
cargo build --release --target x86_64-pc-windows-gnu
```

`.github/workflows/installer.yml` builds both on native runners. Push an
`installer-v*` tag to attach them to a GitHub release.

Jobs can run without the window, printing their progress. This is useful for testing
and troubleshooting:

```sh
todo --job install ~/ModernTodo     # also open, stop, update, uninstall
```

## Notes

- Only changes merged into `main` reach users (`src/source.rs`).
- `todo.exe` does not update itself. Running a newer installer and choosing the same
  folder replaces it.
- ffmpeg and qpdf are not downloaded. The app works without them; uploads just are not
  compressed.
- The Docker setup in the repository root is unchanged and remains the way to self-host
  on a server.
