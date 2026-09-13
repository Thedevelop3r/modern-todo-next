//! The window.

use std::path::PathBuf;
use std::sync::mpsc::{self, Receiver};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use eframe::egui::{self, Align, Color32, Layout, RichText, Stroke, vec2};

use crate::jobs::{self, Job, Outcome, Status};
use crate::platform;
use crate::report::{Event, Reporter, StepState};
use crate::source;
use crate::state::{self, Install};

const ACCENT: Color32 = Color32::from_rgb(79, 70, 229);
const GOOD: Color32 = Color32::from_rgb(22, 163, 74);
const BAD: Color32 = Color32::from_rgb(220, 38, 38);
const WARN: Color32 = Color32::from_rgb(217, 119, 6);
const MAX_LOG_LINES: usize = 5000;

#[derive(Clone, Copy, PartialEq, Eq)]
enum Screen {
    Choose,
    Home,
    Job,
    ConfirmUninstall,
    Removed,
}

struct StepView {
    title: &'static str,
    state: StepState,
    detail: String,
    progress: Option<f32>,
    started: Option<Instant>,
}

struct Run {
    job: Job,
    steps: Vec<StepView>,
    log: Vec<String>,
    events: Receiver<Event>,
    result: Option<Result<Outcome, String>>,
}

enum Action {
    Start(Job),
    Home,
    Choose,
    Close,
}

pub struct App {
    install: Option<Install>,
    remembered: Option<Install>,
    path_text: String,
    screen: Screen,
    status: Option<Status>,
    status_rx: Option<Receiver<Status>>,
    update_available: Option<bool>,
    update_rx: Option<Receiver<Option<bool>>>,
    run: Option<Run>,
    understood: bool,
    close_blocked: bool,
    pending_delete: Arc<Mutex<Option<Install>>>,
}

impl App {
    pub fn new(pending_delete: Arc<Mutex<Option<Install>>>) -> Self {
        let this = state::this_install();
        let remembered = if this.is_none() { state::remembered() } else { None };
        Self {
            screen: if this.is_some() { Screen::Home } else { Screen::Choose },
            install: this,
            remembered,
            path_text: state::default_root().display().to_string(),
            status: None,
            status_rx: None,
            update_available: None,
            update_rx: None,
            run: None,
            understood: false,
            close_blocked: false,
            pending_delete,
        }
    }

    fn busy(&self) -> bool {
        self.run.as_ref().is_some_and(|run| run.result.is_none())
    }

    fn refresh(&mut self, ctx: &egui::Context) {
        let Some(install) = self.install.clone() else { return };
        self.status = None;

        let (tx, rx) = mpsc::channel();
        let (ctx2, install2) = (ctx.clone(), install.clone());
        thread::spawn(move || {
            let _ = tx.send(jobs::status(&install2));
            ctx2.request_repaint();
        });
        self.status_rx = Some(rx);

        if self.update_available.is_none() && self.update_rx.is_none() {
            let (tx, rx) = mpsc::channel();
            let ctx2 = ctx.clone();
            thread::spawn(move || {
                let _ = tx.send(jobs::update_available(&install));
                ctx2.request_repaint();
            });
            self.update_rx = Some(rx);
        }
    }

    fn start(&mut self, job: Job, ctx: &egui::Context) {
        let Some(install) = self.install.clone() else { return };
        let (tx, rx) = mpsc::channel();
        let ctx2 = ctx.clone();
        let rep = Reporter::new(tx, Arc::new(move || ctx2.request_repaint()));
        let steps = job
            .steps()
            .iter()
            .map(|title| StepView { title, state: StepState::Pending, detail: String::new(), progress: None, started: None })
            .collect();
        self.run = Some(Run { job, steps, log: Vec::new(), events: rx, result: None });
        self.screen = Screen::Job;
        self.close_blocked = false;
        jobs::spawn(job, install, rep);
    }

    fn pump(&mut self, ctx: &egui::Context) {
        if let Some(status) = self.status_rx.as_ref().and_then(|rx| rx.try_recv().ok()) {
            self.status = Some(status);
            self.status_rx = None;
        }
        if let Some(available) = self.update_rx.as_ref().and_then(|rx| rx.try_recv().ok()) {
            self.update_available = available;
            self.update_rx = None;
        }

        let mut finished = None;
        if let Some(run) = &mut self.run {
            while let Ok(event) = run.events.try_recv() {
                match event {
                    Event::Step { index, state } => {
                        if let Some(step) = run.steps.get_mut(index) {
                            if state == StepState::Running {
                                step.started = Some(Instant::now());
                            }
                            step.state = state;
                        }
                    }
                    Event::Detail { index, text } => {
                        if let Some(step) = run.steps.get_mut(index) {
                            step.detail = text;
                        }
                    }
                    Event::Progress { index, fraction } => {
                        if let Some(step) = run.steps.get_mut(index) {
                            step.progress = fraction;
                        }
                    }
                    Event::Log(line) => {
                        run.log.push(line);
                        if run.log.len() > MAX_LOG_LINES {
                            run.log.drain(..run.log.len() - MAX_LOG_LINES);
                        }
                    }
                    Event::Finished(result) => {
                        finished = Some(result.clone());
                        run.result = Some(result);
                    }
                }
            }
        }

        match finished {
            Some(Ok(Outcome::Opened)) => ctx.send_viewport_cmd(egui::ViewportCommand::Close),
            Some(Ok(Outcome::Stopped)) => {
                self.screen = Screen::Home;
                self.refresh(ctx);
            }
            Some(Ok(Outcome::Uninstalled { delete_after_exit })) => {
                if delete_after_exit {
                    *self.pending_delete.lock().expect("not poisoned") = self.install.clone();
                }
                self.remembered = None;
                self.screen = Screen::Removed;
            }
            Some(Ok(Outcome::Installed | Outcome::Updated | Outcome::UpToDate)) => self.update_available = Some(false),
            _ => {}
        }
    }

    fn apply(&mut self, action: Action, ctx: &egui::Context) {
        match action {
            Action::Start(job) => self.start(job, ctx),
            Action::Home => {
                self.screen = Screen::Home;
                self.refresh(ctx);
            }
            Action::Choose => self.screen = Screen::Choose,
            Action::Close => ctx.send_viewport_cmd(egui::ViewportCommand::Close),
        }
    }

    // ------------------------------------------------------------ screens ----

    fn header(&self, ui: &mut egui::Ui) {
        ui.horizontal(|ui| {
            let (rect, _) = ui.allocate_exact_size(vec2(36.0, 36.0), egui::Sense::hover());
            let painter = ui.painter();
            painter.rect_filled(rect, 9.0, ACCENT);
            let c = rect.center();
            let tick = Stroke::new(3.0, Color32::WHITE);
            painter.line_segment([c + vec2(-8.0, 0.0), c + vec2(-2.5, 5.5)], tick);
            painter.line_segment([c + vec2(-2.5, 5.5), c + vec2(8.5, -6.0)], tick);

            ui.vertical(|ui| {
                ui.label(RichText::new("Modern Todo").size(20.0).strong());
                let subtitle = match &self.install {
                    Some(install) if self.screen != Screen::Choose => install.root.display().to_string(),
                    _ => "Installer".to_owned(),
                };
                ui.label(RichText::new(subtitle).weak());
            });
        });
        ui.add_space(4.0);
        ui.separator();
        ui.add_space(8.0);
    }

    fn choose(&mut self, ui: &mut egui::Ui) -> Option<Action> {
        let mut action = None;

        if let Some(existing) = self.remembered.clone() {
            card(ui, None, |ui| {
                ui.label(RichText::new("Modern Todo is already installed").strong());
                ui.label(existing.root.display().to_string());
                ui.add_space(4.0);
                if ui.button("Manage that installation").clicked() {
                    self.install = Some(existing);
                    action = Some(Action::Home);
                }
            });
            ui.add_space(12.0);
        }

        ui.label(RichText::new("Install Modern Todo").size(17.0).strong());
        ui.label(
            "This downloads everything Modern Todo needs - Node.js, a MongoDB database and the \
             application - into one folder and builds it there. Nothing else on your computer is \
             changed and no administrator rights are needed. It needs about 2 GB of space and takes \
             5 to 15 minutes; keep this window open until it finishes.",
        );
        ui.add_space(12.0);

        ui.label(RichText::new("Install location").strong());
        ui.horizontal(|ui| {
            let width = (ui.available_width() - 90.0).max(120.0);
            ui.add(egui::TextEdit::singleline(&mut self.path_text).desired_width(width));
            if ui.button("Browse…").clicked() {
                let mut dialog = rfd::FileDialog::new().set_title("Choose where to install Modern Todo");
                let current = PathBuf::from(self.path_text.trim());
                if let Some(start) = current.ancestors().find(|p| p.is_dir()) {
                    dialog = dialog.set_directory(start);
                }
                if let Some(folder) = dialog.pick_folder() {
                    self.path_text = folder.display().to_string();
                }
            }
        });

        let path = PathBuf::from(self.path_text.trim());
        ui.label(
            RichText::new(format!("This folder will hold {} and a \"source\" folder.", state::EXE_NAME)).weak(),
        );
        let problem = location_problem(&path);
        match &problem {
            Some(problem) => {
                ui.colored_label(BAD, *problem);
            }
            None if !Install::new(&path).exists() && path.read_dir().is_ok_and(|mut d| d.next().is_some()) => {
                ui.colored_label(WARN, "This folder is not empty. Modern Todo will be added next to what is there.");
            }
            None => {}
        }

        ui.add_space(16.0);
        if big_button(ui, "Install", true, problem.is_none()).clicked() {
            self.install = Some(Install::new(path));
            action = Some(Action::Start(Job::Install));
        }
        action
    }

    fn home(&mut self, ui: &mut egui::Ui, ctx: &egui::Context) -> Option<Action> {
        let Some(status) = self.status.clone() else {
            if self.status_rx.is_none() {
                self.refresh(ctx);
            }
            ui.add_space(48.0);
            ui.vertical_centered(|ui| {
                ui.add(egui::Spinner::new().size(28.0));
                ui.label("Checking Modern Todo…");
            });
            return None;
        };
        let mut action = None;

        let (color, text) = if !status.installed {
            (WARN, "The installation has not finished")
        } else if status.running {
            (GOOD, "Running in the background")
        } else {
            (ui.visuals().weak_text_color(), "Not running")
        };
        ui.horizontal(|ui| {
            let (rect, _) = ui.allocate_exact_size(vec2(12.0, 12.0), egui::Sense::hover());
            ui.painter().circle_filled(rect.center(), 5.0, color);
            ui.label(RichText::new(text).size(15.0));
        });
        ui.add_space(16.0);

        if !status.installed {
            ui.label("The last installation stopped before it was done. It continues where it left off.");
            ui.add_space(8.0);
            if big_button(ui, "Finish installation", true, true).clicked() {
                action = Some(Action::Start(Job::Install));
            }
        } else if status.running {
            if big_button(ui, "Close background application", true, true).clicked() {
                action = Some(Action::Start(Job::Stop));
            }
        } else if big_button(ui, "Open Modern Todo", true, true).clicked() {
            action = Some(Action::Start(Job::Open));
        }

        if status.installed {
            ui.add_space(4.0);
            let label = if self.update_available == Some(true) { "Update - a new version is available" } else { "Update" };
            if big_button(ui, label, false, true).clicked() {
                action = Some(Action::Start(Job::Update));
            }
        }

        if status.running {
            ui.add_space(8.0);
            ui.vertical_centered(|ui| {
                if ui.link("Open it in the browser").clicked() {
                    let port = self
                        .install
                        .as_ref()
                        .and_then(|i| source::env_value(&i.source(), "PORT"))
                        .unwrap_or_else(|| "3000".into());
                    let _ = platform::open_url(&format!("http://localhost:{port}"));
                }
            });
        }

        ui.with_layout(Layout::bottom_up(Align::Min), |ui| {
            ui.horizontal(|ui| {
                if ui.button("Uninstall…").clicked() {
                    self.understood = false;
                    self.screen = Screen::ConfirmUninstall;
                }
                if ui.button("Refresh").clicked() {
                    self.refresh(ctx);
                }
            });
        });
        action
    }

    fn confirm_uninstall(&mut self, ui: &mut egui::Ui) -> Option<Action> {
        let mut action = None;
        ui.label(RichText::new("Uninstall Modern Todo?").size(17.0).strong());
        ui.add_space(8.0);

        card(ui, Some(BAD), |ui| {
            ui.label(RichText::new("Your data will be permanently deleted").strong().color(BAD));
            ui.label(
                "Every todo, note, file and account is stored in the application's database, and \
                 uninstalling deletes that database. This cannot be undone.",
            );
            ui.add_space(4.0);
            ui.label(
                RichText::new(
                    "Before you continue, open Modern Todo and make a backup of anything you want to keep.",
                )
                .strong(),
            );
        });
        ui.add_space(8.0);

        ui.label("This removes:");
        for item in [
            "the database with all of your todos",
            "the application, Node.js and MongoDB it downloaded",
            "the program itself and its shortcuts",
        ] {
            ui.label(format!("   •  {item}"));
        }
        ui.add_space(12.0);

        ui.checkbox(&mut self.understood, "I understand that my data will be lost");
        ui.add_space(12.0);

        ui.horizontal(|ui| {
            if ui.add_sized([120.0, 36.0], egui::Button::new("Cancel")).clicked() {
                action = Some(Action::Home);
            }
            let uninstall = egui::Button::new(RichText::new("Uninstall anyway").color(Color32::WHITE)).fill(BAD);
            if ui.add_enabled(self.understood, uninstall.min_size(vec2(160.0, 36.0))).clicked() {
                action = Some(Action::Start(Job::Uninstall));
            }
        });
        action
    }

    fn job(&mut self, ui: &mut egui::Ui) -> Option<Action> {
        let Some(run) = &self.run else { return Some(Action::Home) };
        let mut action = None;

        ui.label(RichText::new(run.job.title()).size(17.0).strong());
        ui.add_space(8.0);

        for step in &run.steps {
            ui.horizontal(|ui| {
                step_icon(ui, step.state);
                let title = RichText::new(step.title);
                ui.label(match step.state {
                    StepState::Running => title.strong(),
                    StepState::Pending => title.weak(),
                    _ => title,
                });
                if let (StepState::Running, Some(started)) = (step.state, step.started) {
                    ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                        ui.label(RichText::new(clock(started.elapsed())).weak().monospace());
                    });
                }
            });
            if step.state != StepState::Pending && !step.detail.is_empty() {
                ui.horizontal(|ui| {
                    ui.add_space(26.0);
                    ui.label(RichText::new(&step.detail).small().weak());
                });
            }
            if let (StepState::Running, Some(fraction)) = (step.state, step.progress) {
                ui.horizontal(|ui| {
                    ui.add_space(26.0);
                    ui.add(egui::ProgressBar::new(fraction).desired_height(6.0));
                });
            }
        }
        ui.add_space(10.0);

        let can_continue = self.install.as_ref().is_some_and(Install::exists);
        match &run.result {
            None if self.close_blocked => {
                ui.colored_label(WARN, "Please keep this window open until this finishes.");
            }
            None => {}
            Some(Ok(outcome)) => {
                let message = match outcome {
                    Outcome::Installed => format!(
                        "Modern Todo is installed. From now on use the shortcut or {} in its folder - you can \
                         delete the installer you downloaded.",
                        state::EXE_NAME
                    ),
                    Outcome::Updated => "Modern Todo has been updated.".to_owned(),
                    Outcome::UpToDate => "You already have the latest version.".to_owned(),
                    _ => "Done.".to_owned(),
                };
                card(ui, Some(GOOD), |ui| {
                    ui.label(RichText::new(message).color(GOOD));
                });
                ui.add_space(6.0);
                if big_button(ui, "Continue", true, true).clicked() {
                    action = Some(Action::Home);
                }
            }
            Some(Err(message)) => {
                card(ui, Some(BAD), |ui| {
                    ui.label(RichText::new("Something went wrong").strong().color(BAD));
                    ui.label(message);
                });
                ui.add_space(6.0);
                ui.horizontal(|ui| {
                    let retry = egui::Button::new(RichText::new("Try again").color(Color32::WHITE)).fill(ACCENT);
                    if ui.add(retry.min_size(vec2(120.0, 34.0))).clicked() {
                        action = Some(Action::Start(run.job));
                    }
                    if ui.add(egui::Button::new("Back").min_size(vec2(90.0, 34.0))).clicked() {
                        action = Some(if can_continue { Action::Home } else { Action::Choose });
                    }
                });
            }
        }
        ui.add_space(6.0);

        egui::CollapsingHeader::new("Details").default_open(true).show(ui, |ui| {
            let row_height = ui.text_style_height(&egui::TextStyle::Monospace);
            egui::Frame::new().fill(ui.visuals().extreme_bg_color).corner_radius(6.0).inner_margin(6.0).show(ui, |ui| {
                egui::ScrollArea::both().stick_to_bottom(true).auto_shrink([false, false]).show_rows(
                    ui,
                    row_height,
                    run.log.len(),
                    |ui, rows| {
                        for line in &run.log[rows] {
                            ui.add(
                                egui::Label::new(RichText::new(line).monospace())
                                    .wrap_mode(egui::TextWrapMode::Extend),
                            );
                        }
                    },
                );
            });
        });
        action
    }

    fn removed(&self, ui: &mut egui::Ui) -> Option<Action> {
        let mut action = None;
        ui.add_space(24.0);
        ui.label(RichText::new("Modern Todo has been removed").size(17.0).strong());
        ui.add_space(6.0);
        ui.label(
            "Everything it downloaded is gone. Nothing else on this computer was changed.",
        );
        ui.add_space(16.0);
        if big_button(ui, "Close", true, true).clicked() {
            action = Some(Action::Close);
        }
        action
    }
}

impl eframe::App for App {
    fn ui(&mut self, ui: &mut egui::Ui, _frame: &mut eframe::Frame) {
        let ctx = ui.ctx().clone();
        self.pump(&ctx);

        // Closing mid-job would orphan a build or leave a half-swapped
        // source folder behind, so the window stays until the job is done.
        if self.busy() && ctx.input(|i| i.viewport().close_requested()) {
            ctx.send_viewport_cmd(egui::ViewportCommand::CancelClose);
            self.close_blocked = true;
        }

        let action = egui::CentralPanel::default()
            .frame(egui::Frame::central_panel(ui.style()).inner_margin(20.0))
            .show(ui, |ui| {
                self.header(ui);
                match self.screen {
                    Screen::Choose => self.choose(ui),
                    Screen::Home => self.home(ui, &ctx),
                    Screen::Job => self.job(ui),
                    Screen::ConfirmUninstall => self.confirm_uninstall(ui),
                    Screen::Removed => self.removed(ui),
                }
            })
            .inner;
        if let Some(action) = action {
            self.apply(action, &ctx);
        }

        if self.busy() {
            // Keeps the step timers ticking between events.
            ctx.request_repaint_after(Duration::from_millis(500));
        }
    }
}

fn location_problem(path: &std::path::Path) -> Option<&'static str> {
    if path.as_os_str().is_empty() {
        Some("Choose a folder.")
    } else if !path.is_absolute() {
        Some(if cfg!(windows) { "Use a full path, like D:\\todoapp" } else { "Use a full path, like /home/you/todoapp" })
    } else if path.is_file() {
        Some("That is a file, not a folder.")
    } else {
        None
    }
}

fn big_button(ui: &mut egui::Ui, text: &str, primary: bool, enabled: bool) -> egui::Response {
    let label = RichText::new(text).size(15.0);
    let button = if primary {
        egui::Button::new(label.color(Color32::WHITE)).fill(ACCENT)
    } else {
        egui::Button::new(label)
    };
    let button = button.corner_radius(8.0).min_size(vec2(ui.available_width(), 44.0));
    ui.add_enabled(enabled, button)
}

fn card<R>(ui: &mut egui::Ui, tint: Option<Color32>, content: impl FnOnce(&mut egui::Ui) -> R) -> R {
    let (fill, stroke) = match tint {
        Some(color) => (color.gamma_multiply(0.10), Stroke::new(1.0, color.gamma_multiply(0.5))),
        None => (ui.visuals().faint_bg_color, ui.visuals().widgets.noninteractive.bg_stroke),
    };
    egui::Frame::new()
        .fill(fill)
        .stroke(stroke)
        .corner_radius(8.0)
        .inner_margin(12.0)
        .show(ui, |ui| {
            ui.set_width(ui.available_width());
            content(ui)
        })
        .inner
}

fn step_icon(ui: &mut egui::Ui, state: StepState) {
    let size = vec2(18.0, 18.0);
    if state == StepState::Running {
        ui.add_sized(size, egui::Spinner::new().size(14.0));
        return;
    }
    let weak = ui.visuals().weak_text_color();
    let (rect, _) = ui.allocate_exact_size(size, egui::Sense::hover());
    let painter = ui.painter();
    let c = rect.center();
    let white = Stroke::new(1.8, Color32::WHITE);
    match state {
        StepState::Pending => {
            painter.circle_stroke(c, 7.0, Stroke::new(1.5, weak));
        }
        StepState::Done => {
            painter.circle_filled(c, 8.0, GOOD);
            painter.line_segment([c + vec2(-3.5, 0.0), c + vec2(-1.0, 2.5)], white);
            painter.line_segment([c + vec2(-1.0, 2.5), c + vec2(3.5, -2.5)], white);
        }
        StepState::Skipped => {
            painter.circle_stroke(c, 7.0, Stroke::new(1.5, weak));
            painter.line_segment([c + vec2(-3.0, 0.0), c + vec2(3.0, 0.0)], Stroke::new(1.5, weak));
        }
        StepState::Failed => {
            painter.circle_filled(c, 8.0, BAD);
            painter.line_segment([c + vec2(-3.0, -3.0), c + vec2(3.0, 3.0)], white);
            painter.line_segment([c + vec2(-3.0, 3.0), c + vec2(3.0, -3.0)], white);
        }
        StepState::Running => unreachable!(),
    }
}

fn clock(elapsed: Duration) -> String {
    let secs = elapsed.as_secs();
    format!("{}:{:02}", secs / 60, secs % 60)
}
