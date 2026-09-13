//! Running external programs: streamed into the log, or captured quietly.

use std::io::{BufRead, BufReader, Read};
use std::process::{Command, Output, Stdio};
use std::thread;
use std::time::{Duration, Instant};

use crate::report::Reporter;

/// The installer is a GUI program on Windows, so every console program it
/// starts would otherwise flash a black window.
pub fn hidden(cmd: &mut Command) -> &mut Command {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}

pub fn describe(cmd: &Command) -> String {
    let mut text = cmd.get_program().to_string_lossy().into_owned();
    for arg in cmd.get_args() {
        let arg = arg.to_string_lossy();
        if arg.contains(' ') {
            text.push_str(&format!(" \"{arg}\""));
        } else {
            text.push(' ');
            text.push_str(&arg);
        }
    }
    text
}

/// Runs to completion, sending every line of output to the log.
pub fn stream(mut cmd: Command, rep: &Reporter) -> Result<(), String> {
    let label = describe(&cmd);
    rep.log(format!("> {label}"));
    hidden(&mut cmd);
    cmd.stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped());

    let mut child = cmd.spawn().map_err(|e| format!("Could not start {label}: {e}"))?;
    let stdout = child.stdout.take().expect("stdout is piped");
    let stderr = child.stderr.take().expect("stderr is piped");
    let (r1, r2) = (rep.clone(), rep.clone());
    let out = thread::spawn(move || pump(stdout, &r1));
    let err = thread::spawn(move || pump(stderr, &r2));

    let status = child.wait().map_err(|e| format!("{label} did not finish: {e}"))?;
    let _ = out.join();
    let _ = err.join();

    if status.success() {
        Ok(())
    } else {
        Err(format!("This command failed ({status}): {label}"))
    }
}

fn pump(source: impl Read, rep: &Reporter) {
    for chunk in BufReader::new(source).split(b'\n') {
        let Ok(bytes) = chunk else { break };
        let line = String::from_utf8_lossy(&bytes);
        // Progress bars redraw with \r; only the last redraw is worth keeping.
        let line = line.trim_end_matches('\r');
        let line = line.rsplit('\r').next().unwrap_or(line);
        if !line.trim().is_empty() {
            rep.log(line);
        }
    }
}

/// Runs quietly and returns what it printed, or `None` if it could not start
/// or took longer than `limit` (a wedged Docker can hang `docker info`).
pub fn capture(mut cmd: Command, limit: Duration) -> Option<Output> {
    hidden(&mut cmd);
    cmd.stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped());
    let mut child = cmd.spawn().ok()?;

    let mut stdout = child.stdout.take()?;
    let mut stderr = child.stderr.take()?;
    let out = thread::spawn(move || {
        let mut buf = Vec::new();
        let _ = stdout.read_to_end(&mut buf);
        buf
    });
    let err = thread::spawn(move || {
        let mut buf = Vec::new();
        let _ = stderr.read_to_end(&mut buf);
        buf
    });

    let deadline = Instant::now() + limit;
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) if Instant::now() < deadline => thread::sleep(Duration::from_millis(50)),
            _ => {
                let _ = child.kill();
                let _ = child.wait();
                return None;
            }
        }
    };
    Some(Output { status, stdout: out.join().ok()?, stderr: err.join().ok()? })
}
