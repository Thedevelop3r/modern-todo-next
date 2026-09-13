//! Where an installation lives and what the installer remembers about it.
//!
//! ```text
//! <root>/                     the folder the user picked
//!   todo(.exe)                this program, copied in
//!   source/                   the application, replaced on every update
//!     .env                    generated settings and secrets, carried across updates
//!     .installer-state.json   the State below, carried across updates
//!   runtime/                  Node.js, MongoDB and the PDF renderer
//!   data/                     the database
//!   logs/                     what the database and the server print
//!   run/                      the background process's lock and status
//! ```

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

pub const STATE_FILE: &str = ".installer-state.json";
pub const EXE_NAME: &str = if cfg!(windows) { "todo.exe" } else { "todo" };
const EXE_SUFFIX: &str = if cfg!(windows) { ".exe" } else { "" };

#[derive(Serialize, Deserialize, Default, Clone, Debug)]
#[serde(default)]
pub struct State {
    /// Every installation step has succeeded at least once.
    pub installed: bool,
    /// The commit `source/` was downloaded from.
    pub commit: Option<String>,
    /// Content hash of the downloaded application source.
    pub source_app_hash: Option<String>,
    /// The source hash the current build was made from. Differs from the above
    /// when the app changed - or when a build failed half way through.
    pub built_app_hash: Option<String>,
    pub node_version: Option<String>,
    pub mongo_version: Option<String>,
    /// The `services/pdf` tree the installed renderer was built from.
    pub pdf_tree: Option<String>,
}

#[derive(Clone, Debug)]
pub struct Install {
    pub root: PathBuf,
}

impl Install {
    pub fn new(root: impl Into<PathBuf>) -> Self {
        Self { root: root.into() }
    }

    pub fn source(&self) -> PathBuf {
        self.root.join("source")
    }

    pub fn state_path(&self) -> PathBuf {
        self.source().join(STATE_FILE)
    }

    pub fn manager_exe(&self) -> PathBuf {
        self.root.join(EXE_NAME)
    }

    pub fn runtime(&self) -> PathBuf {
        self.root.join("runtime")
    }

    pub fn data(&self) -> PathBuf {
        self.root.join("data")
    }

    pub fn logs(&self) -> PathBuf {
        self.root.join("logs")
    }

    pub fn run_dir(&self) -> PathBuf {
        self.root.join("run")
    }

    pub fn node_exe(&self) -> PathBuf {
        self.runtime().join("node").join(format!("node{EXE_SUFFIX}"))
    }

    pub fn mongod_exe(&self) -> PathBuf {
        self.runtime().join("mongodb").join(format!("mongod{EXE_SUFFIX}"))
    }

    pub fn pdf_exe(&self) -> PathBuf {
        self.runtime().join("pdf").join(format!("modern-todo-pdf{EXE_SUFFIX}"))
    }

    /// Something was installed here, finished or not.
    pub fn exists(&self) -> bool {
        self.state_path().is_file()
    }

    pub fn load(&self) -> State {
        fs::read_to_string(self.state_path())
            .ok()
            .and_then(|text| serde_json::from_str(&text).ok())
            .unwrap_or_default()
    }

    pub fn save(&self, state: &State) -> Result<(), String> {
        fs::create_dir_all(self.source()).map_err(|e| io_error("create", &self.source(), e))?;
        let text = serde_json::to_string_pretty(state).expect("state serializes");
        fs::write(self.state_path(), text).map_err(|e| io_error("write", &self.state_path(), e))
    }
}

pub fn io_error(action: &str, path: &Path, error: std::io::Error) -> String {
    format!("Could not {action} {}: {error}", path.display())
}

pub fn default_root() -> PathBuf {
    dirs::home_dir().unwrap_or_else(|| PathBuf::from(".")).join("ModernTodo")
}

/// This program, when it is the copy inside an installation folder.
pub fn this_install() -> Option<Install> {
    let exe = std::env::current_exe().ok()?;
    let install = Install::new(exe.parent()?);
    install.exists().then_some(install)
}

// The downloaded installer knows nothing about the folder it installed into,
// so the location is also recorded per user. Running the installer again then
// offers to manage that installation instead of starting over.

#[derive(Serialize, Deserialize)]
struct Remembered {
    root: PathBuf,
}

fn remembered_path() -> Option<PathBuf> {
    Some(dirs::config_dir()?.join("modern-todo").join("installation.json"))
}

pub fn remembered() -> Option<Install> {
    let text = fs::read_to_string(remembered_path()?).ok()?;
    let Remembered { root } = serde_json::from_str(&text).ok()?;
    let install = Install::new(root);
    install.exists().then_some(install)
}

pub fn remember(install: &Install) {
    let Some(path) = remembered_path() else { return };
    if let Some(dir) = path.parent() {
        let _ = fs::create_dir_all(dir);
    }
    let text = serde_json::to_string(&Remembered { root: install.root.clone() }).expect("serializes");
    let _ = fs::write(path, text);
}

pub fn forget() {
    if let Some(path) = remembered_path() {
        let _ = fs::remove_file(&path);
        if let Some(dir) = path.parent() {
            let _ = fs::remove_dir(dir);
        }
    }
}
