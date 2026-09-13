//! The application's source: downloading it from GitHub, telling whether the
//! application changed, and generating its `.env`.
//!
//! GitHub's tarballs are used rather than git, so nothing has to be installed
//! first.

use std::collections::HashMap;
use std::fs::{self, File};
use std::net::{Ipv4Addr, SocketAddr, TcpListener, TcpStream};
use std::path::{Component, Path, PathBuf};
use std::time::Duration;

use flate2::read::GzDecoder;
use sha2::{Digest, Sha256};

use crate::net;
use crate::report::Reporter;
use crate::state::{io_error, Install, STATE_FILE};

pub const REPO: &str = "Thedevelop3r/modern-todo-next";
pub const BRANCH: &str = "main";
pub const DB_USER: &str = "modern-todo";

/// Carried from the old source folder into the new one on every update.
const KEEP_FILES: [&str; 2] = [".env", STATE_FILE];
/// Moved rather than copied: yarn and Next reuse them and redo only what changed.
const KEEP_DIRS: [&str; 2] = ["node_modules", ".next"];

pub fn short(commit: &str) -> &str {
    &commit[..commit.len().min(7)]
}

pub fn latest_commit() -> Result<String, String> {
    let url = format!("https://api.github.com/repos/{REPO}/commits/{BRANCH}");
    let sha = net::get_text(&url, "application/vnd.github.sha")?
        .ok_or("The application's repository was not found on GitHub.")?
        .trim()
        .to_owned();
    if sha.len() == 40 && sha.bytes().all(|b| b.is_ascii_hexdigit()) {
        Ok(sha)
    } else {
        Err(format!("GitHub answered with something that is not a commit: {sha:.80}"))
    }
}

/// Downloads `commit` and swaps it in for `source/`, keeping `.env`, the state
/// file and the build folders. Returns the new source's application hash.
pub fn replace_source(install: &Install, commit: &str, rep: &Reporter, step: usize) -> Result<String, String> {
    let root = &install.root;
    let source = install.source();
    let archive = root.join("download.tar.gz");
    let fresh = root.join("source.new");
    let old = root.join("source.old");

    let url = format!("https://codeload.github.com/{REPO}/tar.gz/{commit}");
    net::download_file(&url, &archive, None, rep, step)?;

    rep.detail(step, "Unpacking…");
    rep.progress(step, None);
    let unpacked = extract(&archive, &fresh, rep);
    let _ = fs::remove_file(&archive);
    unpacked?;
    if !fresh.join("package.json").is_file() {
        return Err("The downloaded files do not contain the application.".into());
    }

    let hash = tree_hash(&fresh, is_app_file)?;

    let locked = |e: std::io::Error| {
        format!("Could not replace the source folder ({e}). Close any window or program that has it open and try again.")
    };
    for name in KEEP_FILES {
        let from = source.join(name);
        if from.is_file() {
            fs::copy(&from, fresh.join(name)).map_err(|e| io_error("copy", &from, e))?;
        }
    }
    for name in KEEP_DIRS {
        let from = source.join(name);
        if from.is_dir() {
            fs::rename(&from, fresh.join(name)).map_err(locked)?;
        }
    }
    if old.exists() {
        fs::remove_dir_all(&old).map_err(|e| io_error("remove", &old, e))?;
    }
    if source.exists() {
        fs::rename(&source, &old).map_err(locked)?;
    }
    if let Err(e) = fs::rename(&fresh, &source) {
        let _ = fs::rename(&old, &source);
        return Err(locked(e));
    }
    let _ = fs::remove_dir_all(&old);
    Ok(hash)
}

fn extract(archive: &Path, dest: &Path, rep: &Reporter) -> Result<(), String> {
    if dest.exists() {
        fs::remove_dir_all(dest).map_err(|e| io_error("remove", dest, e))?;
    }
    fs::create_dir_all(dest).map_err(|e| io_error("create", dest, e))?;

    let damaged = |e: std::io::Error| format!("The download is damaged ({e}). Try again.");
    let file = File::open(archive).map_err(|e| io_error("open", archive, e))?;
    let mut tar = tar::Archive::new(GzDecoder::new(file));

    for entry in tar.entries().map_err(damaged)? {
        let mut entry = entry.map_err(damaged)?;
        let path = entry.path().map_err(damaged)?.into_owned();
        // GitHub wraps everything in a `<repo>-<commit>/` folder.
        let relative: PathBuf = path.components().skip(1).collect();
        if relative.as_os_str().is_empty() {
            continue;
        }
        if !relative.components().all(|c| matches!(c, Component::Normal(_))) {
            return Err(format!("The download contains an unsafe path: {}", path.display()));
        }
        let target = dest.join(&relative);
        match entry.header().entry_type() {
            tar::EntryType::Directory => {
                fs::create_dir_all(&target).map_err(|e| io_error("create", &target, e))?;
            }
            tar::EntryType::Regular | tar::EntryType::Continuous => {
                if let Some(parent) = target.parent() {
                    fs::create_dir_all(parent).map_err(|e| io_error("create", parent, e))?;
                }
                entry.unpack(&target).map_err(damaged)?;
            }
            other => rep.log(format!("Skipped {} ({other:?})", relative.display())),
        }
    }
    Ok(())
}

/// Files the application build depends on. The PDF renderer is prebuilt on
/// GitHub and tracked separately; docs and CI changes rebuild nothing.
fn is_app_file(path: &str) -> bool {
    !path.starts_with("services/")
        && !path.starts_with("installer/")
        && !path.starts_with(".github/")
        && !path.ends_with(".md")
}

pub fn tree_hash(root: &Path, include: fn(&str) -> bool) -> Result<String, String> {
    let mut files = Vec::new();
    collect(root, root, &mut files)?;
    files.sort();

    let mut hasher = Sha256::new();
    for relative in files.iter().filter(|f| include(f)) {
        let path = root.join(relative);
        let bytes = fs::read(&path).map_err(|e| io_error("read", &path, e))?;
        hasher.update(relative.as_bytes());
        hasher.update([0]);
        hasher.update((bytes.len() as u64).to_le_bytes());
        hasher.update(&bytes);
    }
    Ok(hasher.finalize().iter().map(|b| format!("{b:02x}")).collect())
}

fn collect(root: &Path, dir: &Path, out: &mut Vec<String>) -> Result<(), String> {
    for entry in fs::read_dir(dir).map_err(|e| io_error("read", dir, e))? {
        let entry = entry.map_err(|e| io_error("read", dir, e))?;
        let path = entry.path();
        let kind = entry.file_type().map_err(|e| io_error("read", &path, e))?;
        if kind.is_dir() {
            collect(root, &path, out)?;
        } else if kind.is_file() {
            let relative = path.strip_prefix(root).expect("walked from root");
            let parts: Vec<_> = relative.components().map(|c| c.as_os_str().to_string_lossy()).collect();
            out.push(parts.join("/"));
        }
    }
    Ok(())
}

fn key_of(line: &str) -> Option<&str> {
    let line = line.trim_start();
    if line.starts_with('#') {
        return None;
    }
    line.split_once('=').map(|(key, _)| key.trim())
}

pub fn read_env(source: &Path) -> HashMap<String, String> {
    fs::read_to_string(source.join(".env"))
        .unwrap_or_default()
        .lines()
        .filter_map(|line| {
            let key = key_of(line)?;
            let (_, value) = line.split_once('=')?;
            Some((key.to_owned(), value.trim().to_owned()))
        })
        .collect()
}

pub fn env_value(source: &Path, key: &str) -> Option<String> {
    read_env(source).remove(key)
}

pub fn port_free(port: u16) -> bool {
    let address = SocketAddr::from((Ipv4Addr::LOCALHOST, port));
    TcpListener::bind(address).is_ok() && TcpStream::connect_timeout(&address, Duration::from_millis(200)).is_err()
}

fn free_port(preferred: u16) -> u16 {
    (preferred..preferred.saturating_add(100)).find(|&port| port_free(port)).unwrap_or(preferred)
}

/// `.env.example` with production settings, free local ports and freshly
/// generated secrets. The `INSTALLER_*` keys are read only by this program.
pub fn write_env(install: &Install) -> Result<(), String> {
    let source = install.source();
    let example_path = source.join(".env.example");
    let example = fs::read_to_string(&example_path).map_err(|e| io_error("read", &example_path, e))?;

    // Letters and digits only, so the password needs no escaping inside MONGO_URL.
    let db_password = random_token(32)?;
    let db_port = free_port(27117);
    let app_port = free_port(3000);
    let pdf_port = free_port(8787);

    let values: Vec<(&str, String)> = vec![
        ("NODE_ENV", "production".into()),
        ("PORT", app_port.to_string()),
        // Only this computer can reach it - not the rest of the network.
        ("LISTEN_HOST", "127.0.0.1".into()),
        ("MONGO_URL", format!("mongodb://{DB_USER}:{db_password}@127.0.0.1:{db_port}/moderntodo?authSource=admin")),
        ("JWT_SECRET", random_token(64)?),
        ("PDF_SERVICE_KEY", random_token(48)?),
        // The server starts the renderer itself, from runtime/pdf.
        ("PDF_SERVICE_SPAWN", "1".into()),
        ("PDF_SERVICE_BIN", install.pdf_exe().display().to_string()),
        ("PDF_SERVICE_PORT", pdf_port.to_string()),
        ("PDF_SERVICE_URL", format!("http://127.0.0.1:{pdf_port}")),
        ("INSTALLER_DB_PORT", db_port.to_string()),
        ("INSTALLER_DB_USER", DB_USER.into()),
        ("INSTALLER_DB_PASSWORD", db_password),
    ];
    let mut used = vec![false; values.len()];

    let mut out = String::from(
        "# Written by the Modern Todo installer from .env.example, with local ports and fresh secrets.\n\
         # Keep it: the database password is here, and updates carry this file forward.\n\n",
    );
    for line in example.lines() {
        match key_of(line).and_then(|key| values.iter().position(|(k, _)| *k == key)) {
            Some(i) => {
                used[i] = true;
                out.push_str(&format!("{}={}\n", values[i].0, values[i].1));
            }
            None => {
                out.push_str(line);
                out.push('\n');
            }
        }
    }
    out.push_str("\n# ---- Installer ----\n");
    for (i, (key, value)) in values.iter().enumerate() {
        if !used[i] {
            out.push_str(&format!("{key}={value}\n"));
        }
    }

    let env = source.join(".env");
    fs::write(&env, out).map_err(|e| io_error("write", &env, e))
}

fn random_token(len: usize) -> Result<String, String> {
    const ALPHABET: &[u8; 62] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let mut out = String::with_capacity(len);
    while out.len() < len {
        let mut buf = [0u8; 64];
        getrandom::fill(&mut buf).map_err(|e| format!("Could not generate a secret key: {e}"))?;
        // 248 is the largest multiple of 62 that fits a byte: no modulo bias.
        for byte in buf.into_iter().filter(|&b| b < 248) {
            if out.len() < len {
                out.push(ALPHABET[(byte % 62) as usize] as char);
            }
        }
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::mpsc;
    use std::sync::Arc;

    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("modern-todo-installer-test-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn only_application_files_count() {
        assert!(!is_app_file("services/pdf/src/main.rs"));
        assert!(!is_app_file("installer/src/main.rs"));
        assert!(!is_app_file(".github/workflows/installer.yml"));
        assert!(!is_app_file("README.md"));
        assert!(is_app_file("src/app/page.tsx"));
        assert!(is_app_file("yarn.lock"));
    }

    #[test]
    fn hash_follows_content_of_included_files_only() {
        let dir = scratch("hash");
        fs::create_dir_all(dir.join("services/pdf")).unwrap();
        fs::write(dir.join("server.js"), "a").unwrap();
        fs::write(dir.join("services/pdf/main.rs"), "b").unwrap();
        let app = tree_hash(&dir, is_app_file).unwrap();

        fs::write(dir.join("services/pdf/main.rs"), "changed").unwrap();
        assert_eq!(tree_hash(&dir, is_app_file).unwrap(), app);
        fs::write(dir.join("server.js"), "changed").unwrap();
        assert_ne!(tree_hash(&dir, is_app_file).unwrap(), app);
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn env_gets_local_settings_and_fresh_secrets() {
        let root = scratch("env");
        let install = Install::new(&root);
        fs::create_dir_all(install.source()).unwrap();
        fs::write(
            install.source().join(".env.example"),
            "NODE_ENV=development\nPORT=3000\n# MONGO_URL=mongodb://localhost\nMONGO_URL=x\nJWT_SECRET=change-me\n",
        )
        .unwrap();
        write_env(&install).unwrap();

        let env = read_env(&install.source());
        assert_eq!(env["NODE_ENV"], "production");
        assert_eq!(env["LISTEN_HOST"], "127.0.0.1");
        assert_eq!(env["PDF_SERVICE_SPAWN"], "1");
        assert_eq!(env["PDF_SERVICE_BIN"], install.pdf_exe().display().to_string());
        assert_eq!(env["PDF_SERVICE_URL"], format!("http://127.0.0.1:{}", env["PDF_SERVICE_PORT"]));
        assert_eq!(env["JWT_SECRET"].len(), 64);
        assert!(env["PDF_SERVICE_KEY"].chars().all(|c| c.is_ascii_alphanumeric()));
        assert_eq!(
            env["MONGO_URL"],
            format!(
                "mongodb://modern-todo:{}@127.0.0.1:{}/moderntodo?authSource=admin",
                env["INSTALLER_DB_PASSWORD"], env["INSTALLER_DB_PORT"]
            )
        );
        let text = fs::read_to_string(install.source().join(".env")).unwrap();
        assert!(text.contains("# MONGO_URL=mongodb://localhost"));
        assert_eq!(text.matches("PORT=").count(), 3, "PORT, PDF_SERVICE_PORT and INSTALLER_DB_PORT once each");
        fs::remove_dir_all(root).unwrap();
    }

    /// Downloads the real repository: `cargo test -- --ignored`.
    #[test]
    #[ignore = "needs the network"]
    fn downloads_and_swaps_in_the_latest_source() {
        let root = scratch("download");
        let install = Install::new(&root);
        let source = install.source();
        fs::create_dir_all(source.join("node_modules/pkg")).unwrap();
        fs::write(source.join(".env"), "KEEP=me\n").unwrap();
        fs::write(source.join("stale.txt"), "old version").unwrap();

        let (tx, _rx) = mpsc::channel();
        let rep = Reporter::new(tx, Arc::new(|| {}));
        let commit = latest_commit().unwrap();
        let hash = replace_source(&install, &commit, &rep, 0).unwrap();

        assert!(source.join("package.json").is_file());
        assert!(source.join("node_modules/pkg").is_dir());
        assert_eq!(fs::read_to_string(source.join(".env")).unwrap(), "KEEP=me\n");
        assert!(!source.join("stale.txt").exists());
        assert!(!root.join("source.new").exists() && !root.join("source.old").exists());
        fs::remove_dir_all(source.join("node_modules")).unwrap();
        fs::remove_file(source.join(".env")).unwrap();
        assert_eq!(hash, tree_hash(&source, is_app_file).unwrap());
        fs::remove_dir_all(root).unwrap();
    }
}
