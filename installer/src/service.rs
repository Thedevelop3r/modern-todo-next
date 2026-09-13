//! Running Modern Todo in the background.
//!
//! `todo --serve <folder>` is a small supervisor, started detached from the
//! window so it keeps running after the window closes. It runs MongoDB and the
//! Node server - which starts the PDF renderer itself - restarts the server if
//! it crashes, and shuts both down cleanly when asked. The window talks to it
//! through files in `run/`:
//!
//! - `supervisor.lock` stays locked while it runs. The OS releases the lock
//!   however the process ends, so a held lock always means "running".
//! - `stop` asks it to shut down.
//! - `status.json` says what it is doing, and why it failed if it did.

use std::collections::HashMap;
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Seek, SeekFrom, Write};
use std::net::{Ipv4Addr, SocketAddr, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

use crate::report::Reporter;
use crate::state::{io_error, Install};
use crate::{cmd, runtime, source};

const DB_ADMIN_SCRIPT: &str = include_str!("db-admin.cjs");
const LOG_LIMIT: u64 = 10 * 1024 * 1024;

#[derive(Serialize, Deserialize, Default, Clone)]
pub struct Status {
    pub pid: u32,
    pub state: String,
    pub message: String,
}

fn lock_path(install: &Install) -> PathBuf {
    install.run_dir().join("supervisor.lock")
}

fn stop_path(install: &Install) -> PathBuf {
    install.run_dir().join("stop")
}

fn status_path(install: &Install) -> PathBuf {
    install.run_dir().join("status.json")
}

fn open_lock(install: &Install) -> std::io::Result<File> {
    OpenOptions::new().write(true).create(true).truncate(false).open(lock_path(install))
}

pub fn is_running(install: &Install) -> bool {
    let Ok(file) = open_lock(install) else { return false };
    match file.try_lock() {
        Ok(()) => {
            let _ = file.unlock();
            false
        }
        Err(fs::TryLockError::WouldBlock) => true,
        Err(fs::TryLockError::Error(_)) => false,
    }
}

fn read_status(install: &Install) -> Option<Status> {
    serde_json::from_str(&fs::read_to_string(status_path(install)).ok()?).ok()
}

// --------------------------------------------------- from the window ----

/// Starts the supervisor and returns once it holds its lock.
pub fn start(install: &Install, rep: &Reporter) -> Result<(), String> {
    if is_running(install) {
        return Ok(());
    }
    for dir in [install.run_dir(), install.logs()] {
        fs::create_dir_all(&dir).map_err(|e| io_error("create", &dir, e))?;
    }
    let _ = fs::remove_file(stop_path(install));
    let _ = fs::remove_file(status_path(install));

    let exe = install.manager_exe();
    rep.log(format!("> {} --serve {}", exe.display(), install.root.display()));
    spawn_detached(&exe, &install.root).map_err(|e| format!("Could not start Modern Todo in the background: {e}"))?;

    let started = Instant::now();
    while !is_running(install) {
        if let Some(status) = read_status(install).filter(|s| s.state == "failed") {
            tail_logs(install, rep);
            return Err(status.message);
        }
        if started.elapsed() > Duration::from_secs(20) {
            tail_logs(install, rep);
            return Err("Modern Todo did not start in the background.".into());
        }
        thread::sleep(Duration::from_millis(200));
    }
    Ok(())
}

#[cfg(windows)]
fn spawn_detached(exe: &Path, root: &Path) -> std::io::Result<()> {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    const CREATE_NEW_PROCESS_GROUP: u32 = 0x0000_0200;
    const CREATE_BREAKAWAY_FROM_JOB: u32 = 0x0100_0000;
    let command = |flags: u32| {
        let mut cmd = Command::new(exe);
        cmd.arg("--serve")
            .arg(root)
            .current_dir(root)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .creation_flags(flags);
        cmd
    };
    // Out of any job the window was started in (a terminal's, an IDE's), so
    // closing that does not take Modern Todo with it. Not every job allows it.
    command(CREATE_NO_WINDOW | CREATE_NEW_PROCESS_GROUP | CREATE_BREAKAWAY_FROM_JOB)
        .spawn()
        .or_else(|_| command(CREATE_NO_WINDOW | CREATE_NEW_PROCESS_GROUP).spawn())
        .map(drop)
}

#[cfg(unix)]
fn spawn_detached(exe: &Path, root: &Path) -> std::io::Result<()> {
    use std::os::unix::process::CommandExt;
    let mut child = Command::new(exe)
        .arg("--serve")
        .arg(root)
        .current_dir(root)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        // Its own process group: a Ctrl+C or closed terminal aimed at the
        // window does not reach it.
        .process_group(0)
        .spawn()?;
    // Reaped whenever it exits, instead of lingering as a zombie while the window is open.
    thread::spawn(move || child.wait());
    Ok(())
}

/// Asks the supervisor to stop and waits for it; ends it forcefully if it hangs.
pub fn stop(install: &Install, rep: &Reporter, step: usize) -> Result<(), String> {
    if !is_running(install) {
        return Ok(());
    }
    let stop = stop_path(install);
    File::create(&stop).map_err(|e| io_error("write", &stop, e))?;

    let started = Instant::now();
    while is_running(install) {
        if started.elapsed() > Duration::from_secs(90) {
            rep.log("Modern Todo did not stop in time; ending it forcefully.");
            if let Some(status) = read_status(install) {
                kill_tree(status.pid);
            }
            thread::sleep(Duration::from_secs(3));
            if is_running(install) {
                return Err("Modern Todo could not be stopped. Restart your computer and try again.".into());
            }
            break;
        }
        rep.detail(step, format!("Stopping… {}s", started.elapsed().as_secs()));
        thread::sleep(Duration::from_millis(300));
    }
    let _ = fs::remove_file(&stop);
    Ok(())
}

/// Waits until the server answers its health check. Returns the address to open.
pub fn wait_until_ready(install: &Install, rep: &Reporter, step: usize) -> Result<String, String> {
    let port = source::env_value(&install.source(), "PORT").unwrap_or_else(|| "3000".into());
    let health = format!("http://127.0.0.1:{port}/api/health");
    let agent: ureq::Agent =
        ureq::Agent::config_builder().timeout_global(Some(Duration::from_secs(3))).build().into();

    let started = Instant::now();
    loop {
        if agent.get(&health).call().is_ok() {
            return Ok(format!("http://localhost:{port}"));
        }
        let status = read_status(install);
        if let Some(failed) = status.as_ref().filter(|s| s.state == "failed") {
            tail_logs(install, rep);
            return Err(failed.message.clone());
        }
        if !is_running(install) {
            tail_logs(install, rep);
            return Err("Modern Todo stopped while it was starting. The details below may say why.".into());
        }
        if started.elapsed() > Duration::from_secs(180) {
            tail_logs(install, rep);
            return Err(format!("Modern Todo did not answer on port {port} within 3 minutes. The details below may say why."));
        }
        let phase = status.map(|s| s.message).filter(|m| !m.is_empty()).unwrap_or_else(|| "Starting the server".into());
        rep.detail(step, format!("{phase}… {}s", started.elapsed().as_secs()));
        thread::sleep(Duration::from_secs(1));
    }
}

/// The end of each log, for when something failed.
fn tail_logs(install: &Install, rep: &Reporter) {
    for (name, lines) in [("supervisor.log", 15), ("app.log", 40), ("mongod.out", 15)] {
        let Ok(text) = read_tail(&install.logs().join(name), 64 * 1024) else { continue };
        let tail: Vec<&str> = text.lines().rev().take(lines).collect();
        if tail.is_empty() {
            continue;
        }
        rep.log(format!("--- end of logs/{name} ---"));
        for line in tail.into_iter().rev() {
            rep.log(line);
        }
    }
}

fn read_tail(path: &Path, max: u64) -> std::io::Result<String> {
    let mut file = File::open(path)?;
    let len = file.metadata()?.len();
    file.seek(SeekFrom::Start(len.saturating_sub(max)))?;
    let mut buf = Vec::new();
    file.read_to_end(&mut buf)?;
    Ok(String::from_utf8_lossy(&buf).into_owned())
}

#[cfg(windows)]
fn kill_tree(pid: u32) {
    if pid == 0 {
        return;
    }
    let mut taskkill = Command::new("taskkill");
    taskkill.args(["/F", "/T", "/PID", &pid.to_string()]);
    let _ = cmd::capture(taskkill, Duration::from_secs(20));
}

#[cfg(unix)]
fn kill_tree(pid: u32) {
    // Never 0 or negative: kill(0) would signal this program's own group.
    if let Ok(pid) = i32::try_from(pid)
        && pid > 0
    {
        // Its children follow through PR_SET_PDEATHSIG.
        unsafe { libc::kill(pid, libc::SIGKILL) };
    }
}

// ------------------------------------------------------ the supervisor ----

/// `todo --serve <folder>`. Returns the process exit code.
pub fn serve(root: &Path) -> i32 {
    let install = Install::new(root);
    for dir in [install.run_dir(), install.logs()] {
        if fs::create_dir_all(&dir).is_err() {
            return 1;
        }
    }
    let Ok(lock) = open_lock(&install) else { return 1 };
    if lock.try_lock().is_err() {
        return 0; // Already running.
    }

    let mut supervisor = Supervisor::new(install);
    supervisor.log(&format!("supervisor started (pid {})", std::process::id()));
    let code = match supervisor.run() {
        Ok(()) => {
            let _ = fs::remove_file(status_path(&supervisor.install));
            supervisor.log("stopped");
            0
        }
        Err(message) => {
            supervisor.set("failed", &message);
            1
        }
    };
    drop(lock);
    code
}

struct Supervisor {
    install: Install,
    log: Option<File>,
    #[cfg(windows)]
    job: Option<job::Job>,
}

impl Supervisor {
    fn new(install: Install) -> Self {
        let log_path = install.logs().join("supervisor.log");
        rotate(&log_path);
        Self {
            log: OpenOptions::new().create(true).append(true).open(log_path).ok(),
            install,
            #[cfg(windows)]
            job: job::Job::new(),
        }
    }

    fn log(&mut self, message: &str) {
        if let Some(file) = &mut self.log {
            let _ = writeln!(file, "[{}] {message}", timestamp());
        }
    }

    fn set(&mut self, state: &str, message: &str) {
        let status = Status { pid: std::process::id(), state: state.into(), message: message.into() };
        let _ = fs::write(status_path(&self.install), serde_json::to_string(&status).expect("serializes"));
        self.log(&format!("{state}{}{message}", if message.is_empty() { "" } else { ": " }));
    }

    /// Anything still running from this installation's runtime/ when the
    /// supervisor starts was left behind by one that was killed. PDEATHSIG ends
    /// the database and the server, but not the renderer the server started,
    /// which would otherwise keep holding its port. Matching on the executable's
    /// path means no unrelated process can be caught, whatever its PID.
    /// (On Windows the job object already ends grandchildren too.)
    #[cfg(unix)]
    fn end_leftovers(&mut self) {
        let Ok(runtime) = fs::canonicalize(self.install.runtime()) else { return };
        let Ok(entries) = fs::read_dir("/proc") else { return };
        let mut ended = false;
        for entry in entries.flatten() {
            let Some(pid) = entry.file_name().to_str().and_then(|name| name.parse::<i32>().ok()) else { continue };
            let Ok(exe) = fs::read_link(entry.path().join("exe")) else { continue };
            if exe.starts_with(&runtime) {
                self.log(&format!("ending leftover process {pid} ({})", exe.display()));
                unsafe { libc::kill(pid, libc::SIGKILL) };
                ended = true;
            }
        }
        if ended {
            thread::sleep(Duration::from_millis(500));
        }
    }

    fn run(&mut self) -> Result<(), String> {
        #[cfg(unix)]
        self.end_leftovers();
        let env = source::read_env(&self.install.source());
        let port = |key: &str| {
            env.get(key).and_then(|v| v.parse::<u16>().ok()).ok_or_else(|| format!("{key} is missing from source/.env."))
        };
        let db_port = port("INSTALLER_DB_PORT")?;
        let app_port = port("PORT")?;
        for (p, what) in [(db_port, "the database"), (app_port, "Modern Todo")] {
            if !source::port_free(p) {
                return Err(format!(
                    "Port {p} is already used by another program, so {what} cannot start. Close that program and try again."
                ));
            }
        }

        self.set("starting", "Starting the database");
        let mut mongod = self.spawn_mongod(db_port)?;
        let address = SocketAddr::from((Ipv4Addr::LOCALHOST, db_port));
        let started = Instant::now();
        while TcpStream::connect_timeout(&address, Duration::from_millis(500)).is_err() {
            if let Ok(Some(status)) = mongod.try_wait() {
                return Err(format!("The database stopped while starting ({status}). See logs/mongod.log."));
            }
            if started.elapsed() > Duration::from_secs(90) {
                let _ = mongod.kill();
                return Err("The database did not start within 90 seconds. See logs/mongod.log.".into());
            }
            thread::sleep(Duration::from_millis(300));
        }

        self.set("starting", "Preparing the database");
        if let Err(e) = self.db_admin("create-user", &env) {
            self.stop_mongod(&mut mongod, &env);
            return Err(format!("The database could not be prepared: {e}"));
        }

        self.set("starting", "Starting the server");
        let mut app = match self.spawn_app() {
            Ok(app) => app,
            Err(e) => {
                self.stop_mongod(&mut mongod, &env);
                return Err(e);
            }
        };
        let mut app_started = Instant::now();
        let mut crashes = 0;
        self.set("running", "");

        let result = loop {
            thread::sleep(Duration::from_millis(500));
            if stop_path(&self.install).exists() {
                self.log("stop requested");
                break Ok(());
            }
            if let Ok(Some(status)) = mongod.try_wait() {
                break Err(format!("The database stopped unexpectedly ({status}). See logs/mongod.log."));
            }
            if let Ok(Some(status)) = app.try_wait() {
                if app_started.elapsed() > Duration::from_secs(120) {
                    crashes = 0;
                }
                crashes += 1;
                self.log(&format!("server exited ({status}), crash {crashes}"));
                if crashes > 3 {
                    break Err("The server keeps stopping. See logs/app.log.".into());
                }
                thread::sleep(Duration::from_secs(2));
                match self.spawn_app() {
                    Ok(child) => {
                        app = child;
                        app_started = Instant::now();
                    }
                    Err(e) => break Err(e),
                }
            }
        };

        self.set("stopping", "Stopping");
        self.stop_app(&mut app);
        self.stop_mongod(&mut mongod, &env);
        let _ = fs::remove_file(stop_path(&self.install));
        result
    }

    fn spawn(&mut self, mut cmd: Command, log_name: &str, what: &str) -> Result<Child, String> {
        let log_path = self.install.logs().join(log_name);
        rotate(&log_path);
        let out = OpenOptions::new().create(true).append(true).open(&log_path).map_err(|e| io_error("open", &log_path, e))?;
        let err = out.try_clone().map_err(|e| io_error("open", &log_path, e))?;
        cmd.stdin(Stdio::null()).stdout(out).stderr(err);
        cmd::hidden(&mut cmd);
        #[cfg(unix)]
        tie_to_parent(&mut cmd);

        let child = cmd.spawn().map_err(|e| format!("Could not start {what}: {e}"))?;
        #[cfg(windows)]
        if let Some(job) = &self.job {
            job.assign(&child);
        }
        self.log(&format!("started {what} (pid {})", child.id()));
        Ok(child)
    }

    fn spawn_mongod(&mut self, port: u16) -> Result<Child, String> {
        let db = self.install.data().join("db");
        fs::create_dir_all(&db).map_err(|e| io_error("create", &db, e))?;
        let mongod_log = self.install.logs().join("mongod.log");
        rotate(&mongod_log);

        let mut cmd = Command::new(self.install.mongod_exe());
        cmd.arg("--dbpath")
            .arg(&db)
            .args(["--port", &port.to_string(), "--bind_ip", "127.0.0.1", "--auth"])
            // WiredTiger takes half the RAM by default; a todo list needs a sliver.
            .args(["--wiredTigerCacheSizeGB", "0.25", "--setParameter", "diagnosticDataCollectionEnabled=false"])
            .arg("--logpath")
            .arg(&mongod_log)
            .arg("--logappend");
        // Required on Linux 6.19 and newer (SERVER-121912): hands rseq to glibc.
        #[cfg(unix)]
        cmd.env("GLIBC_TUNABLES", "glibc.pthread.rseq=1");
        self.spawn(cmd, "mongod.out", "the database")
    }

    fn spawn_app(&mut self) -> Result<Child, String> {
        let mut cmd = runtime::node(&self.install);
        cmd.arg("server.js").current_dir(self.install.source()).env("NODE_ENV", "production");
        // A group of its own, holding the renderer it spawns, so both can be
        // ended together.
        #[cfg(unix)]
        std::os::unix::process::CommandExt::process_group(&mut cmd, 0);
        self.spawn(cmd, "app.log", "the server")
    }

    fn stop_app(&mut self, app: &mut Child) {
        if !matches!(app.try_wait(), Ok(Some(_))) {
            #[cfg(unix)]
            {
                let pid = app.id() as i32;
                // server.js closes its connections and the renderer on SIGTERM.
                unsafe { libc::kill(pid, libc::SIGTERM) };
                wait_exit(app, Duration::from_secs(15));
                // Whatever is left in its group, the renderer included.
                unsafe { libc::kill(-pid, libc::SIGKILL) };
            }
            // Windows has no signal a windowless Node process can catch. Ending
            // it is safe: uploads interrupted this way are swept at the next start.
            #[cfg(windows)]
            kill_tree(app.id());
        }
        let _ = app.wait();
        self.log("server stopped");
    }

    #[cfg_attr(unix, allow(unused_variables))]
    fn stop_mongod(&mut self, mongod: &mut Child, env: &HashMap<String, String>) {
        if !matches!(mongod.try_wait(), Ok(Some(_))) {
            #[cfg(unix)]
            unsafe {
                libc::kill(mongod.id() as i32, libc::SIGTERM)
            };
            #[cfg(windows)]
            if let Err(e) = self.db_admin("shutdown", env) {
                self.log(&format!("clean database shutdown failed: {e}"));
            }
            if !wait_exit(mongod, Duration::from_secs(60)) {
                self.log("the database did not stop in time; ending it");
                let _ = mongod.kill();
            }
        }
        let _ = mongod.wait();
        self.log("database stopped");
    }

    fn db_admin(&mut self, action: &str, env: &HashMap<String, String>) -> Result<(), String> {
        let script = self.install.run_dir().join("db-admin.cjs");
        fs::write(&script, DB_ADMIN_SCRIPT).map_err(|e| io_error("write", &script, e))?;
        let get = |key: &str| env.get(key).cloned().unwrap_or_default();

        let mut cmd = runtime::node(&self.install);
        cmd.arg(&script)
            .arg(action)
            .current_dir(self.install.source())
            .env("DB_PORT", get("INSTALLER_DB_PORT"))
            .env("DB_USER", get("INSTALLER_DB_USER"))
            .env("DB_PASSWORD", get("INSTALLER_DB_PASSWORD"));
        let out = cmd::capture(cmd, Duration::from_secs(60)).ok_or("the database helper did not finish")?;
        let text = format!("{}{}", String::from_utf8_lossy(&out.stdout), String::from_utf8_lossy(&out.stderr));
        let text = text.trim().to_owned();
        self.log(&format!("db-admin {action}: {text}"));
        if out.status.success() { Ok(()) } else { Err(text) }
    }
}

fn wait_exit(child: &mut Child, limit: Duration) -> bool {
    let started = Instant::now();
    while started.elapsed() < limit {
        if matches!(child.try_wait(), Ok(Some(_))) {
            return true;
        }
        thread::sleep(Duration::from_millis(200));
    }
    false
}

/// Keeps one previous log beside the current one.
fn rotate(path: &Path) {
    if fs::metadata(path).is_ok_and(|m| m.len() > LOG_LIMIT) {
        let _ = fs::rename(path, path.with_extension("old.log"));
    }
}

fn timestamp() -> String {
    let secs = SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |d| d.as_secs());
    format!("{:02}:{:02}:{:02} UTC", (secs / 3600) % 24, (secs / 60) % 60, secs % 60)
}

/// If the supervisor dies without stopping its children (killed, crashed), the
/// kernel ends them too rather than leaving an orphaned database behind.
#[cfg(unix)]
fn tie_to_parent(cmd: &mut Command) {
    use std::os::unix::process::CommandExt;
    unsafe {
        cmd.pre_exec(|| {
            libc::prctl(libc::PR_SET_PDEATHSIG, libc::SIGKILL);
            Ok(())
        });
    }
}

/// The Windows equivalent of PR_SET_PDEATHSIG: every child goes into a job
/// that ends its processes when its last handle closes - which the OS does
/// when the supervisor exits, however it exits.
#[cfg(windows)]
mod job {
    use std::os::windows::io::AsRawHandle;
    use std::process::Child;

    use windows_sys::Win32::Foundation::HANDLE;
    use windows_sys::Win32::System::JobObjects::{
        AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation, SetInformationJobObject,
        JOBOBJECT_EXTENDED_LIMIT_INFORMATION, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    };

    pub struct Job(HANDLE);

    impl Job {
        pub fn new() -> Option<Self> {
            unsafe {
                let handle = CreateJobObjectW(std::ptr::null(), std::ptr::null());
                if handle.is_null() {
                    return None;
                }
                let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
                info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
                let ok = SetInformationJobObject(
                    handle,
                    JobObjectExtendedLimitInformation,
                    (&raw const info).cast(),
                    std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
                );
                // The handle is deliberately never closed: closing it is the kill switch.
                (ok != 0).then_some(Self(handle))
            }
        }

        pub fn assign(&self, child: &Child) {
            unsafe { AssignProcessToJobObject(self.0, child.as_raw_handle() as HANDLE) };
        }
    }
}
