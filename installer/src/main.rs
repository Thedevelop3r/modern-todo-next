//! Modern Todo's installer and, once copied into the installation folder as
//! `todo` / `todo.exe`, its controller: open, update, close and uninstall.
//!
//! One binary plays every part:
//!
//! - no arguments: the window. A copy that finds `source/.installer-state.json`
//!   next to itself manages that installation; anything else is the installer.
//! - `--serve <folder>`: the background supervisor the window starts (service.rs).
//! - `--job <install|open|stop|update|uninstall> <folder>`: a job without the
//!   window, printing its progress - for testing and troubleshooting.

// A GUI program on Windows: no console window behind it.
#![cfg_attr(windows, windows_subsystem = "windows")]

mod app;
mod cmd;
mod jobs;
mod net;
mod platform;
mod report;
mod runtime;
mod service;
mod source;
mod state;

use std::path::Path;
use std::sync::mpsc;
use std::sync::{Arc, Mutex};

use eframe::egui;

use crate::jobs::{Job, Outcome};
use crate::report::{Event, Reporter};
use crate::state::Install;

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let code = match args.first().map(String::as_str) {
        Some("--serve") => match args.get(1) {
            Some(root) => service::serve(Path::new(root)),
            None => 2,
        },
        Some("--job") => headless(&args[1..]),
        _ => window(),
    };
    std::process::exit(code);
}

fn window() -> i32 {
    let pending_delete = Arc::new(Mutex::new(None));
    let app = app::App::new(pending_delete.clone());

    let options = eframe::NativeOptions {
        viewport: egui::ViewportBuilder::default()
            .with_title("Modern Todo")
            .with_app_id("modern-todo")
            .with_inner_size([600.0, 720.0])
            .with_min_inner_size([440.0, 480.0]),
        ..Default::default()
    };

    let result = eframe::run_native(
        "Modern Todo",
        options,
        Box::new(move |cc| {
            cc.egui_ctx.all_styles_mut(|style| {
                style.spacing.item_spacing = egui::vec2(8.0, 6.0);
                style.spacing.button_padding = egui::vec2(12.0, 6.0);
            });
            Ok(Box::new(app))
        }),
    );

    // After the window is gone, so todo.exe is no longer running when it is deleted.
    if let Some(install) = pending_delete.lock().expect("not poisoned").take() {
        platform::delete_after_exit(&install);
    }
    i32::from(result.is_err())
}

fn headless(args: &[String]) -> i32 {
    let usage = "usage: todo --job <install|open|stop|update|uninstall> <folder>";
    let (Some(name), Some(root)) = (args.first(), args.get(1)) else {
        eprintln!("{usage}");
        return 2;
    };
    let job = match name.as_str() {
        "install" => Job::Install,
        "open" => Job::Open,
        "stop" => Job::Stop,
        "update" => Job::Update,
        "uninstall" => Job::Uninstall,
        _ => {
            eprintln!("{usage}");
            return 2;
        }
    };
    let install = Install::new(std::path::absolute(root).unwrap_or_else(|_| root.into()));

    let (tx, rx) = mpsc::channel();
    jobs::spawn(job, install.clone(), Reporter::new(tx, Arc::new(|| {})));
    let steps = job.steps();
    let mut last_detail = String::new();

    for event in rx {
        match event {
            Event::Step { index, state } => println!("[{}] {state:?}", steps[index]),
            Event::Detail { index, text } => {
                // Progress counters change several times a second.
                let noisy = text.starts_with("Downloaded") || text.contains('…');
                if !noisy && text != last_detail {
                    println!("[{}] {text}", steps[index]);
                }
                last_detail = text;
            }
            Event::Progress { .. } => {}
            Event::Log(line) => println!("    {line}"),
            Event::Finished(Ok(outcome)) => {
                println!("finished: {outcome:?}");
                if outcome == (Outcome::Uninstalled { delete_after_exit: true }) {
                    platform::delete_after_exit(&install);
                }
                return 0;
            }
            Event::Finished(Err(message)) => {
                eprintln!("failed: {message}");
                return 1;
            }
        }
    }
    1
}
