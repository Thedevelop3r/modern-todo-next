//! What differs between Windows and Linux outside of Docker: shortcuts, the
//! browser, and deleting a program that is still running.

use std::fs;
use std::path::{Path, PathBuf};

use crate::report::Reporter;
use crate::state::{io_error, Install};

pub fn open_url(url: &str) -> Result<(), String> {
    open::that_detached(url).map_err(|e| format!("Could not open your browser ({e}). Go to {url} yourself."))
}

fn same_file(a: &Path, b: &Path) -> bool {
    match (fs::canonicalize(a), fs::canonicalize(b)) {
        (Ok(a), Ok(b)) => a == b,
        _ => false,
    }
}

fn running_exe() -> Option<PathBuf> {
    std::env::current_exe().ok()
}

/// Puts this program into the installation folder as its manager.
pub fn copy_self_into(install: &Install) -> Result<(), String> {
    let exe = running_exe().ok_or("Could not find this program's own file.")?;
    let dest = install.manager_exe();
    if same_file(&exe, &dest) {
        return Ok(());
    }
    fs::create_dir_all(&install.root).map_err(|e| io_error("create", &install.root, e))?;
    fs::copy(&exe, &dest).map_err(|e| {
        format!("Could not copy this program to {} ({e}). If Modern Todo is open, close it and try again.", dest.display())
    })?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&dest, fs::Permissions::from_mode(0o755)).map_err(|e| io_error("update", &dest, e))?;
    }
    Ok(())
}

#[cfg(windows)]
fn shortcut_paths() -> Vec<PathBuf> {
    let mut paths = Vec::new();
    if let Some(desktop) = dirs::desktop_dir() {
        paths.push(desktop.join("Modern Todo.lnk"));
    }
    if let Some(roaming) = dirs::data_dir() {
        paths.push(roaming.join(r"Microsoft\Windows\Start Menu\Programs\Modern Todo.lnk"));
    }
    paths
}

#[cfg(unix)]
fn shortcut_paths() -> Vec<PathBuf> {
    dirs::data_dir().map(|d| d.join("applications").join("modern-todo.desktop")).into_iter().collect()
}

/// A desktop and Start menu shortcut on Windows, an application menu entry on Linux.
#[cfg(windows)]
pub fn create_shortcuts(install: &Install, rep: &Reporter) -> Result<(), String> {
    use std::process::Command;
    let quote = |p: &Path| format!("'{}'", p.to_string_lossy().replace('\'', "''"));
    let mut script = String::from("$ErrorActionPreference = 'Stop'; $shell = New-Object -ComObject WScript.Shell; ");
    for link in shortcut_paths() {
        script.push_str(&format!(
            "$s = $shell.CreateShortcut({}); $s.TargetPath = {}; $s.WorkingDirectory = {}; \
             $s.Description = 'Open, update or close Modern Todo'; $s.Save(); ",
            quote(&link),
            quote(&install.manager_exe()),
            quote(&install.root),
        ));
    }
    let mut ps = Command::new("powershell.exe");
    ps.args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", &script]);
    crate::cmd::stream(ps, rep)
}

#[cfg(unix)]
pub fn create_shortcuts(install: &Install, rep: &Reporter) -> Result<(), String> {
    let entry = format!(
        "[Desktop Entry]\nType=Application\nName=Modern Todo\nComment=Open, update or close Modern Todo\n\
         Exec=\"{}\"\nPath={}\nIcon={}\nTerminal=false\nCategories=Office;\n",
        install.manager_exe().display(),
        install.root.display(),
        install.source().join("public").join("icon.svg").display(),
    );
    for path in shortcut_paths() {
        if let Some(dir) = path.parent() {
            fs::create_dir_all(dir).map_err(|e| io_error("create", dir, e))?;
        }
        fs::write(&path, &entry).map_err(|e| io_error("write", &path, e))?;
        rep.log(format!("Created {}", path.display()));
    }
    Ok(())
}

pub fn remove_shortcuts() {
    for path in shortcut_paths() {
        let _ = fs::remove_file(path);
    }
}

/// Deletes the application, its data, its runtime and the manager. Returns true
/// when the manager is this very program on Windows, which cannot delete a
/// running .exe - see [`delete_after_exit`].
pub fn delete_files(install: &Install) -> Result<bool, String> {
    for dir in [install.source(), install.data(), install.runtime(), install.logs(), install.run_dir()] {
        if dir.exists() {
            fs::remove_dir_all(&dir).map_err(|e| {
                format!("Could not delete {} ({e}). Close any window that has it open and try again.", dir.display())
            })?;
        }
    }
    for leftover in ["source.new", "source.old", "download.tar.gz"] {
        let path = install.root.join(leftover);
        let _ = if path.is_dir() { fs::remove_dir_all(&path) } else { fs::remove_file(&path) };
    }

    let exe = install.manager_exe();
    let is_running = running_exe().is_some_and(|running| same_file(&running, &exe));
    if cfg!(windows) && is_running {
        return Ok(true);
    }
    if exe.exists() {
        fs::remove_file(&exe).map_err(|e| io_error("delete", &exe, e))?;
    }
    // Only if nothing else is in it: the user may have picked a folder of their own.
    let _ = fs::remove_dir(&install.root);
    Ok(false)
}

/// Waits for this process to exit, then deletes todo.exe and its folder (if empty).
#[cfg(windows)]
pub fn delete_after_exit(install: &Install) {
    use std::os::windows::process::CommandExt;
    use std::process::Command;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let script = format!(
        "/C ping 127.0.0.1 -n 3 > NUL & del /F /Q \"{}\" & rmdir \"{}\"",
        install.manager_exe().display(),
        install.root.display(),
    );
    let _ = Command::new("cmd.exe")
        .raw_arg(script)
        .current_dir(std::env::temp_dir())
        .creation_flags(CREATE_NO_WINDOW)
        .spawn();
}

#[cfg(unix)]
pub fn delete_after_exit(_install: &Install) {}
