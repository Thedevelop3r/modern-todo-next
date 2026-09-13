//! HTTP: downloads, small API requests, and reading files out of a remote zip
//! without downloading the whole archive.

use std::fs::File;
use std::io::{self, Read, Seek, SeekFrom, Write};
use std::path::Path;
use std::time::{Duration, Instant};

use sha2::{Digest, Sha256};

use crate::report::Reporter;
use crate::state::io_error;

pub fn agent() -> ureq::Agent {
    ureq::Agent::config_builder()
        .timeout_connect(Some(Duration::from_secs(20)))
        .user_agent("modern-todo-installer")
        .build()
        .into()
}

fn host(url: &str) -> &str {
    url.split("://").nth(1).and_then(|rest| rest.split('/').next()).unwrap_or(url)
}

fn request_error(url: &str, error: ureq::Error) -> String {
    match error {
        ureq::Error::StatusCode(403 | 429) if host(url).ends_with("github.com") => {
            "GitHub's hourly limit on update checks was reached. Try again in an hour.".into()
        }
        other => format!("Could not reach {} ({other}). Check your internet connection and try again.", host(url)),
    }
}

/// The body of a GET, or `None` for a 404.
pub fn get_text(url: &str, accept: &str) -> Result<Option<String>, String> {
    match agent().get(url).header("Accept", accept).call() {
        Ok(mut response) => response.body_mut().read_to_string().map(Some).map_err(|e| request_error(url, e)),
        Err(ureq::Error::StatusCode(404)) => Ok(None),
        Err(e) => Err(request_error(url, e)),
    }
}

pub fn get_json(url: &str) -> Result<Option<serde_json::Value>, String> {
    let Some(text) = get_text(url, "application/vnd.github+json")? else { return Ok(None) };
    serde_json::from_str(&text).map(Some).map_err(|e| format!("Unexpected answer from {}: {e}", host(url)))
}

pub fn mb(bytes: u64) -> String {
    format!("{:.1} MB", bytes as f64 / 1_048_576.0)
}

/// Downloads to `dest`, checking the SHA-256 when one is given.
pub fn download_file(url: &str, dest: &Path, sha256: Option<&str>, rep: &Reporter, step: usize) -> Result<(), String> {
    rep.log(format!("Downloading {url}"));
    let response = agent().get(url).call().map_err(|e| request_error(url, e))?;
    let total = response.body().content_length().filter(|&t| t > 0);
    let mut reader = response.into_body().into_reader();
    let mut file = File::create(dest).map_err(|e| io_error("create", dest, e))?;
    let mut hasher = Sha256::new();

    let mut buf = vec![0u8; 256 * 1024];
    let mut done = 0u64;
    let mut last = Instant::now();
    loop {
        let n = reader.read(&mut buf).map_err(|e| format!("The download from {} was interrupted ({e}).", host(url)))?;
        if n == 0 {
            break;
        }
        file.write_all(&buf[..n]).map_err(|e| io_error("write", dest, e))?;
        hasher.update(&buf[..n]);
        done += n as u64;
        if last.elapsed() >= Duration::from_millis(200) {
            last = Instant::now();
            report(rep, step, "Downloaded", done, total);
        }
    }
    file.flush().map_err(|e| io_error("write", dest, e))?;
    report(rep, step, "Downloaded", done, total);

    if let Some(expected) = sha256 {
        let actual: String = hasher.finalize().iter().map(|b| format!("{b:02x}")).collect();
        if !actual.eq_ignore_ascii_case(expected) {
            drop(file);
            let _ = std::fs::remove_file(dest);
            return Err(format!("The download from {} is damaged (checksum mismatch). Try again.", host(url)));
        }
    }
    rep.log(format!("Downloaded {}", mb(done)));
    Ok(())
}

pub fn report(rep: &Reporter, step: usize, verb: &str, done: u64, total: Option<u64>) {
    match total {
        Some(total) => {
            rep.progress(step, Some(done as f32 / total as f32));
            rep.detail(step, format!("{verb} {} of {}", mb(done), mb(total)));
        }
        None => rep.detail(step, format!("{verb} {}", mb(done))),
    }
}

/// A remote file read through HTTP range requests, fetched a chunk at a time
/// as it is read. A zip keeps its index at the end, so one file can be pulled
/// out of a large archive without downloading the rest. Only Windows needs it:
/// MongoDB's Linux archives are small.
#[cfg_attr(unix, allow(dead_code))]
pub struct RangeReader {
    agent: ureq::Agent,
    url: String,
    len: u64,
    pos: u64,
    buf: Vec<u8>,
    buf_start: u64,
}

#[cfg_attr(unix, allow(dead_code))]
const CHUNK: u64 = 8 * 1024 * 1024;

#[cfg_attr(unix, allow(dead_code))]
impl RangeReader {
    pub fn open(url: &str) -> Result<Self, String> {
        let agent = agent();
        let response = agent.get(url).header("Range", "bytes=0-0").call().map_err(|e| request_error(url, e))?;
        let len = response
            .headers()
            .get("content-range")
            .and_then(|v| v.to_str().ok())
            .and_then(|range| range.rsplit('/').next())
            .and_then(|total| total.parse().ok())
            .ok_or_else(|| format!("{} does not support partial downloads.", host(url)))?;
        Ok(Self { agent, url: url.to_owned(), len, pos: 0, buf: Vec::new(), buf_start: 0 })
    }

    fn fill(&mut self) -> io::Result<()> {
        let end = (self.pos + CHUNK).min(self.len) - 1;
        let mut response = self
            .agent
            .get(&self.url)
            .header("Range", format!("bytes={}-{end}", self.pos))
            .call()
            .map_err(io::Error::other)?;
        if response.status().as_u16() != 206 {
            return Err(io::Error::other("the server ignored the requested range"));
        }
        self.buf = response.body_mut().with_config().limit(CHUNK + 1).read_to_vec().map_err(io::Error::other)?;
        self.buf_start = self.pos;
        if self.buf.is_empty() {
            return Err(io::ErrorKind::UnexpectedEof.into());
        }
        Ok(())
    }
}

impl Read for RangeReader {
    fn read(&mut self, out: &mut [u8]) -> io::Result<usize> {
        if self.pos >= self.len || out.is_empty() {
            return Ok(0);
        }
        let buffered = self.pos >= self.buf_start && self.pos < self.buf_start + self.buf.len() as u64;
        if !buffered {
            self.fill()?;
        }
        let offset = (self.pos - self.buf_start) as usize;
        let n = out.len().min(self.buf.len() - offset);
        out[..n].copy_from_slice(&self.buf[offset..offset + n]);
        self.pos += n as u64;
        Ok(n)
    }
}

impl Seek for RangeReader {
    fn seek(&mut self, from: SeekFrom) -> io::Result<u64> {
        let target = match from {
            SeekFrom::Start(n) => i128::from(n),
            SeekFrom::End(n) => i128::from(self.len) + i128::from(n),
            SeekFrom::Current(n) => i128::from(self.pos) + i128::from(n),
        };
        self.pos = u64::try_from(target).map_err(|_| io::Error::from(io::ErrorKind::InvalidInput))?;
        Ok(self.pos)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[ignore = "needs the network"]
    fn reads_one_file_out_of_a_remote_zip() {
        let reader =
            RangeReader::open("https://fastdl.mongodb.org/windows/mongodb-windows-x86_64-8.0.32.zip").unwrap();
        let zip = zip::ZipArchive::new(reader).unwrap();
        assert!(zip.file_names().any(|name| name.ends_with("/bin/mongod.exe")));
    }
}
