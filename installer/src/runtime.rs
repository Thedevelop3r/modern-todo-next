//! The programs Modern Todo runs on, downloaded into `runtime/`: Node.js,
//! MongoDB and the PDF renderer. Nothing is installed system-wide.

use std::fs::{self, File};
use std::io::{Read, Seek, Write};
use std::path::Path;
use std::process::Command;
use std::time::{Duration, Instant};

use flate2::read::GzDecoder;

use crate::net;
use crate::report::Reporter;
use crate::source::REPO;
use crate::state::{io_error, Install, State};

// ------------------------------------------------------------- Node.js ----

/// The major version the application declares in package.json `engines`.
pub const NODE_MAJOR: u32 = 24;
const NODE_SUFFIX: &str = if cfg!(windows) { "-win-x64.zip" } else { "-linux-x64.tar.gz" };

pub struct NodeRelease {
    pub version: String,
    file: String,
    sha256: String,
}

/// The newest Node.js of [`NODE_MAJOR`], from nodejs.org's checksum list.
pub fn latest_node() -> Result<NodeRelease, String> {
    let url = format!("https://nodejs.org/dist/latest-v{NODE_MAJOR}.x/SHASUMS256.txt");
    let sums = net::get_text(&url, "text/plain")?.ok_or("nodejs.org did not list any Node.js releases.")?;
    parse_node_sums(&sums).ok_or_else(|| format!("nodejs.org lists no Node.js {NODE_MAJOR} for this system."))
}

fn parse_node_sums(sums: &str) -> Option<NodeRelease> {
    sums.lines()
        .filter_map(|line| line.split_once(char::is_whitespace))
        .map(|(sha, file)| (sha, file.trim()))
        .find(|(_, file)| file.starts_with("node-v") && file.ends_with(NODE_SUFFIX))
        .map(|(sha, file)| NodeRelease {
            version: file["node-".len()..file.len() - NODE_SUFFIX.len()].to_owned(),
            file: file.to_owned(),
            sha256: sha.to_owned(),
        })
}

/// Only the `node` binary is kept: yarn is committed to the repository and
/// npm is never used.
pub fn install_node(
    install: &Install,
    st: &mut State,
    release: &NodeRelease,
    rep: &Reporter,
    step: usize,
) -> Result<(), String> {
    let runtime = install.runtime();
    fs::create_dir_all(&runtime).map_err(|e| io_error("create", &runtime, e))?;
    let archive = runtime.join(&release.file);
    let url = format!("https://nodejs.org/dist/{}/{}", release.version, release.file);
    net::download_file(&url, &archive, Some(&release.sha256), rep, step)?;

    rep.detail(step, "Unpacking…");
    rep.progress(step, None);
    let staging = runtime.join("node.new");
    let unpacked = (|| {
        reset_dir(&staging)?;
        let found = if cfg!(windows) {
            let file = File::open(&archive).map_err(|e| io_error("open", &archive, e))?;
            let select = |path: &str| (strip_first(path) == "node.exe").then(|| "node.exe".to_owned());
            extract_zip(file, &staging, select, rep, step)? > 0
        } else {
            extract_tar_gz(&archive, &staging.join("node"), |path| path == "bin/node")?
        };
        if !found {
            return Err("The Node.js download does not contain node.".to_owned());
        }
        swap_dir(&staging, &runtime.join("node"))
    })();
    let _ = fs::remove_file(&archive);
    unpacked?;

    st.node_version = Some(release.version.clone());
    install.save(st)
}

/// A command for a program that needs `node` on its PATH (yarn scripts do).
pub fn node(install: &Install) -> Command {
    let mut cmd = Command::new(install.node_exe());
    let mut paths = vec![install.node_exe().parent().expect("node is in a folder").to_path_buf()];
    if let Some(existing) = std::env::var_os("PATH") {
        paths.extend(std::env::split_paths(&existing));
    }
    if let Ok(joined) = std::env::join_paths(paths) {
        cmd.env("PATH", joined);
    }
    cmd
}

/// The application's own pinned Yarn release, run with the downloaded Node.
/// Its cache lives in `runtime/yarn`, so uninstalling removes it too.
pub fn yarn(install: &Install, args: &[&str]) -> Result<Command, String> {
    let source = install.source();
    let rc_path = source.join(".yarnrc.yml");
    let rc = fs::read_to_string(&rc_path).map_err(|e| io_error("read", &rc_path, e))?;
    let release = rc
        .lines()
        .find_map(|line| line.trim().strip_prefix("yarnPath:"))
        .map(|path| path.trim().trim_matches(['"', '\'']))
        .ok_or("The application does not pin a Yarn release (yarnPath in .yarnrc.yml).")?;

    let mut cmd = node(install);
    cmd.arg(source.join(release))
        .args(args)
        .current_dir(&source)
        .env("YARN_GLOBAL_FOLDER", install.runtime().join("yarn"))
        .env("YARN_ENABLE_TELEMETRY", "false")
        .env("YARN_ENABLE_PROGRESS_BARS", "false")
        .env("YARN_ENABLE_COLORS", "false")
        .env("YARN_ENABLE_HYPERLINKS", "false")
        .env("NEXT_TELEMETRY_DISABLED", "1")
        .env("FORCE_COLOR", "0");
    Ok(cmd)
}

// ------------------------------------------------------------- MongoDB ----

/// Pinned, with checksums: MongoDB's release feed is a 49 MB file, too big to
/// read on every update. Bump it together with the table below.
pub const MONGO_VERSION: &str = "8.0.32";

#[cfg(windows)]
const WINDOWS_MONGO: &str = "https://fastdl.mongodb.org/windows/mongodb-windows-x86_64-8.0.32.zip";

#[cfg_attr(windows, allow(dead_code))]
const LINUX_MONGO: [(&str, &str, &str); 4] = [
    (
        "ubuntu2404",
        "https://fastdl.mongodb.org/linux/mongodb-linux-x86_64-ubuntu2404-8.0.32.tgz",
        "b411be17c31ef249767ed91974d876e007c91afd5f45e1534057d247eada9f0d",
    ),
    (
        "ubuntu2204",
        "https://fastdl.mongodb.org/linux/mongodb-linux-x86_64-ubuntu2204-8.0.32.tgz",
        "41da8d92dde2896ebda278cf296ae86462da6b39eda81ce6ce4fb9ce819adb2e",
    ),
    (
        "ubuntu2004",
        "https://fastdl.mongodb.org/linux/mongodb-linux-x86_64-ubuntu2004-8.0.32.tgz",
        "db3533f4fdeeb9f590b2b4e8219007bc3d5ae65b5b5c843aecca3f730cf0eb41",
    ),
    (
        "debian12",
        "https://fastdl.mongodb.org/linux/mongodb-linux-x86_64-debian12-8.0.32.tgz",
        "b61cda162c6592347b7503c683145304f74c900b1c10a395520c7c24d3f8445c",
    ),
];

/// Which MongoDB Linux build suits this distribution, from /etc/os-release.
/// Ubuntu derivatives (Mint, Pop!_OS, Zorin) carry UBUNTU_CODENAME.
#[cfg_attr(windows, allow(dead_code))]
fn linux_target(os_release: &str) -> &'static str {
    let get = |key: &str| {
        os_release
            .lines()
            .find_map(|line| line.strip_prefix(key)?.strip_prefix('='))
            .map(|value| value.trim().trim_matches('"').to_owned())
            .unwrap_or_default()
    };
    let major = |version: &str| version.split('.').next().and_then(|n| n.parse::<u32>().ok()).unwrap_or(0);
    let (id, version, codename) = (get("ID"), get("VERSION_ID"), get("UBUNTU_CODENAME"));

    match codename.as_str() {
        "focal" => return "ubuntu2004",
        "jammy" => return "ubuntu2204",
        "" => {}
        _ => return "ubuntu2404",
    }
    match id.as_str() {
        "ubuntu" => match major(&version) {
            0..=21 => "ubuntu2004",
            22 | 23 => "ubuntu2204",
            _ => "ubuntu2404",
        },
        // Debian 11 shares Ubuntu 20.04's glibc and OpenSSL 1.1.
        "debian" if major(&version) == 11 => "ubuntu2004",
        _ if id == "debian" || get("ID_LIKE").contains("debian") => "debian12",
        _ => "ubuntu2204",
    }
}

pub fn install_mongo(install: &Install, st: &mut State, rep: &Reporter, step: usize) -> Result<(), String> {
    let runtime = install.runtime();
    fs::create_dir_all(&runtime).map_err(|e| io_error("create", &runtime, e))?;
    let staging = runtime.join("mongodb.new");
    reset_dir(&staging)?;
    rep.detail(step, format!("MongoDB {MONGO_VERSION}"));

    #[cfg(windows)]
    {
        // The zip is 800 MB, nearly all debug symbols. Only mongod.exe (and any
        // DLL beside it) is read out of it, a range request at a time.
        let reader = net::RangeReader::open(WINDOWS_MONGO)?;
        let select = |path: &str| {
            let (dir, file) = path.rsplit_once('/')?;
            (dir.ends_with("/bin") && (file == "mongod.exe" || file.ends_with(".dll"))).then(|| file.to_owned())
        };
        extract_zip(reader, &staging, select, rep, step)?;
    }
    #[cfg(unix)]
    {
        let target = linux_target(&fs::read_to_string("/etc/os-release").unwrap_or_default());
        let (_, url, sha) = LINUX_MONGO.iter().find(|(t, _, _)| *t == target).expect("every target has a build");
        rep.log(format!("MongoDB build for {target}"));
        let archive = runtime.join("mongodb.tgz");
        net::download_file(url, &archive, Some(sha), rep, step)?;
        rep.detail(step, "Unpacking…");
        rep.progress(step, None);
        let unpacked = extract_tar_gz(&archive, &staging.join("mongod"), |path| path == "bin/mongod");
        let _ = fs::remove_file(&archive);
        unpacked?;
    }

    if !staging.join(install.mongod_exe().file_name().expect("has a name")).is_file() {
        return Err("The MongoDB download does not contain mongod.".into());
    }
    swap_dir(&staging, &runtime.join("mongodb"))?;
    st.mongo_version = Some(MONGO_VERSION.to_owned());
    install.save(st)
}

// -------------------------------------------------------- PDF renderer ----

// Compiling the renderer takes a Rust toolchain and a long time, so it is built
// on GitHub instead (.github/workflows/pdf-renderer.yml) whenever services/pdf
// changes, into a release tagged `pdf-<first 12 of its git tree id>`. The tree
// id changes exactly when something under services/pdf does.

pub const PDF_ASSET: &str =
    if cfg!(windows) { "modern-todo-pdf-windows-x64.exe" } else { "modern-todo-pdf-linux-x64" };

pub struct PdfRelease {
    pub tree: String,
    url: String,
}

pub fn pdf_tree(commit: &str) -> Result<String, String> {
    let url = format!("https://api.github.com/repos/{REPO}/contents/services?ref={commit}");
    let listing = net::get_json(&url)?.ok_or("This version has no services folder.")?;
    listing
        .as_array()
        .and_then(|entries| entries.iter().find(|entry| entry["name"] == "pdf"))
        .and_then(|entry| entry["sha"].as_str())
        .map(|sha| sha[..sha.len().min(12)].to_owned())
        .ok_or_else(|| "This version has no services/pdf folder.".into())
}

fn asset_url(release: &serde_json::Value) -> Option<String> {
    release["assets"]
        .as_array()?
        .iter()
        .find(|asset| asset["name"] == PDF_ASSET)?["browser_download_url"]
        .as_str()
        .map(str::to_owned)
}

/// The build of exactly this tree, if it has been published.
pub fn pdf_release_for(tree: &str) -> Result<Option<PdfRelease>, String> {
    let url = format!("https://api.github.com/repos/{REPO}/releases/tags/pdf-{tree}");
    Ok(net::get_json(&url)?
        .and_then(|release| asset_url(&release))
        .map(|url| PdfRelease { tree: tree.to_owned(), url }))
}

/// The most recently published build of any tree.
pub fn latest_pdf_release() -> Result<Option<PdfRelease>, String> {
    let url = format!("https://api.github.com/repos/{REPO}/releases?per_page=100");
    let releases = net::get_json(&url)?.unwrap_or_default();
    Ok(releases.as_array().into_iter().flatten().find_map(|release| {
        let tree = release["tag_name"].as_str()?.strip_prefix("pdf-")?;
        Some(PdfRelease { tree: tree.to_owned(), url: asset_url(release)? })
    }))
}

pub fn install_pdf(
    install: &Install,
    st: &mut State,
    release: &PdfRelease,
    rep: &Reporter,
    step: usize,
) -> Result<(), String> {
    let exe = install.pdf_exe();
    let dir = exe.parent().expect("in a folder");
    fs::create_dir_all(dir).map_err(|e| io_error("create", dir, e))?;
    let download = exe.with_extension("download");
    net::download_file(&release.url, &download, None, rep, step)?;
    make_executable(&download)?;
    fs::rename(&download, &exe)
        .map_err(|e| format!("Could not replace the PDF renderer ({e}). Close Modern Todo and try again."))?;
    st.pdf_tree = Some(release.tree.clone());
    install.save(st)
}

// ------------------------------------------------------------ archives ----

/// `a/b/c` -> `b/c`: release archives wrap everything in one folder.
fn strip_first(path: &str) -> &str {
    path.split_once('/').map_or("", |(_, rest)| rest)
}

fn reset_dir(dir: &Path) -> Result<(), String> {
    if dir.exists() {
        fs::remove_dir_all(dir).map_err(|e| io_error("remove", dir, e))?;
    }
    fs::create_dir_all(dir).map_err(|e| io_error("create", dir, e))
}

fn swap_dir(staging: &Path, target: &Path) -> Result<(), String> {
    if target.exists() {
        fs::remove_dir_all(target)
            .map_err(|e| format!("Could not replace {} ({e}). Close Modern Todo and try again.", target.display()))?;
    }
    fs::rename(staging, target).map_err(|e| io_error("move", staging, e))
}

fn make_executable(path: &Path) -> Result<(), String> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(0o755)).map_err(|e| io_error("update", path, e))?;
    }
    let _ = path;
    Ok(())
}

/// Extracts the single file `select` accepts (by its path inside the archive,
/// minus the top folder) to `dest`. Returns whether it was found.
fn extract_tar_gz(archive: &Path, dest: &Path, select: impl Fn(&str) -> bool) -> Result<bool, String> {
    let damaged = |e: std::io::Error| format!("The download is damaged ({e}). Try again.");
    let file = File::open(archive).map_err(|e| io_error("open", archive, e))?;
    let mut tar = tar::Archive::new(GzDecoder::new(file));
    for entry in tar.entries().map_err(damaged)? {
        let mut entry = entry.map_err(damaged)?;
        let path = entry.path().map_err(damaged)?.to_string_lossy().replace('\\', "/");
        if !select(strip_first(&path)) {
            continue;
        }
        let mut out = File::create(dest).map_err(|e| io_error("create", dest, e))?;
        std::io::copy(&mut entry, &mut out).map_err(damaged)?;
        make_executable(dest)?;
        return Ok(true);
    }
    Ok(false)
}

/// Extracts every entry `select` gives a file name for into `dest_dir`.
fn extract_zip<R: Read + Seek>(
    reader: R,
    dest_dir: &Path,
    select: impl Fn(&str) -> Option<String>,
    rep: &Reporter,
    step: usize,
) -> Result<usize, String> {
    let mut zip = zip::ZipArchive::new(reader).map_err(|e| format!("Could not read the download ({e}). Try again."))?;
    let wanted: Vec<(String, String)> =
        zip.file_names().filter_map(|name| select(name).map(|out| (name.to_owned(), out))).collect();

    for (name, out_name) in &wanted {
        let mut entry = zip.by_name(name).map_err(|e| format!("Could not read {name} from the download ({e})."))?;
        let total = entry.size();
        let out_path = dest_dir.join(out_name);
        let mut out = File::create(&out_path).map_err(|e| io_error("create", &out_path, e))?;

        let mut buf = vec![0u8; 256 * 1024];
        let (mut done, mut last) = (0u64, Instant::now());
        loop {
            let n = entry.read(&mut buf).map_err(|e| format!("The download was interrupted ({e}). Try again."))?;
            if n == 0 {
                break;
            }
            out.write_all(&buf[..n]).map_err(|e| io_error("write", &out_path, e))?;
            done += n as u64;
            if last.elapsed() >= Duration::from_millis(200) {
                last = Instant::now();
                net::report(rep, step, &format!("Downloading {out_name}:"), done, Some(total));
            }
        }
        make_executable(&out_path)?;
        rep.log(format!("Extracted {out_name} ({})", net::mb(done)));
    }
    Ok(wanted.len())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn node_release_is_read_from_the_checksum_list() {
        let sums = "aaa  node-v24.21.0-headers.tar.gz\n\
                    6e1d  node-v24.21.0-linux-x64.tar.gz\n\
                    158f  node-v24.21.0-win-x64.zip\n";
        let release = parse_node_sums(sums).unwrap();
        assert_eq!(release.version, "v24.21.0");
        assert_eq!(release.sha256, if cfg!(windows) { "158f" } else { "6e1d" });
    }

    #[test]
    fn distributions_map_to_mongodb_builds() {
        assert_eq!(linux_target("ID=ubuntu\nVERSION_ID=\"24.04\"\nUBUNTU_CODENAME=noble"), "ubuntu2404");
        assert_eq!(linux_target("ID=ubuntu\nVERSION_ID=\"22.04\""), "ubuntu2204");
        assert_eq!(linux_target("ID=linuxmint\nID_LIKE=\"ubuntu debian\"\nUBUNTU_CODENAME=jammy"), "ubuntu2204");
        assert_eq!(linux_target("ID=debian\nVERSION_ID=\"12\""), "debian12");
        assert_eq!(linux_target("ID=debian\nVERSION_ID=\"11\""), "ubuntu2004");
        assert_eq!(linux_target("ID=ubuntu\nVERSION_ID=\"26.04\"\nUBUNTU_CODENAME=resolute"), "ubuntu2404");
        assert_eq!(strip_first("node-v24/bin/node"), "bin/node");
    }

    #[test]
    #[ignore = "needs the network"]
    fn finds_the_current_node_and_pdf_tree() {
        assert!(latest_node().unwrap().version.starts_with("v24."));
        let commit = crate::source::latest_commit().unwrap();
        assert_eq!(pdf_tree(&commit).unwrap().len(), 12);
    }
}
