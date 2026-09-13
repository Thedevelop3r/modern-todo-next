//! The things the buttons do. Each job runs on its own thread and reports its
//! steps as it goes; every step is safe to run again, so a failed job is retried
//! from the start and skips what is already done.

use std::thread;
use std::time::Instant;

use crate::report::Reporter;
use crate::runtime::{self, MONGO_VERSION, PdfRelease};
use crate::source::{self, short};
use crate::state::{self, Install, State};
use crate::{cmd, platform, service};

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Job {
    Install,
    Open,
    Stop,
    Update,
    Uninstall,
}

#[derive(Clone, Debug, PartialEq)]
pub enum Outcome {
    Installed,
    Opened,
    Stopped,
    UpToDate,
    Updated,
    Uninstalled { delete_after_exit: bool },
}

impl Job {
    pub fn title(self) -> &'static str {
        match self {
            Job::Install => "Installing Modern Todo",
            Job::Open => "Opening Modern Todo",
            Job::Stop => "Closing the background application",
            Job::Update => "Updating Modern Todo",
            Job::Uninstall => "Uninstalling Modern Todo",
        }
    }

    pub fn steps(self) -> &'static [&'static str] {
        match self {
            Job::Install => &[
                "Prepare the installation folder",
                "Download Node.js",
                "Download the MongoDB database",
                "Download Modern Todo",
                "Configure the application",
                "Install packages",
                "Build the application",
                "Download the PDF renderer",
                "Create shortcuts",
            ],
            Job::Open => &["Start Modern Todo", "Wait for Modern Todo to answer", "Open your browser"],
            Job::Stop => &["Stop Modern Todo"],
            Job::Update => &[
                "Check for updates",
                "Close Modern Todo",
                "Download the new version",
                "Update Node.js and MongoDB",
                "Install packages",
                "Rebuild the application",
                "Update the PDF renderer",
                "Start Modern Todo again",
            ],
            Job::Uninstall => &["Stop Modern Todo", "Remove shortcuts", "Delete the application and its data"],
        }
    }
}

pub fn spawn(job: Job, install: Install, rep: Reporter) {
    thread::spawn(move || {
        let result = match job {
            Job::Install => install_app(&install, &rep),
            Job::Open => open(&install, &rep),
            Job::Stop => stop(&install, &rep),
            Job::Update => update(&install, &rep),
            Job::Uninstall => uninstall(&install, &rep),
        };
        rep.finish(result);
    });
}

#[derive(Clone, Debug, Default)]
pub struct Status {
    pub installed: bool,
    pub running: bool,
}

pub fn status(install: &Install) -> Status {
    Status { installed: install.load().installed, running: service::is_running(install) }
}

/// `None` when GitHub cannot be reached.
pub fn update_available(install: &Install) -> Option<bool> {
    let latest = source::latest_commit().ok()?;
    Some(install.load().commit.as_deref() != Some(latest.as_str()))
}

fn mongo_current(install: &Install, st: &State) -> bool {
    st.mongo_version.as_deref() == Some(MONGO_VERSION) && install.mongod_exe().is_file()
}

fn app_built(install: &Install, st: &State) -> bool {
    st.built_app_hash.is_some()
        && st.built_app_hash == st.source_app_hash
        && install.source().join(".next").join("BUILD_ID").is_file()
}

fn install_app(install: &Install, rep: &Reporter) -> Result<Outcome, String> {
    rep.begin(0);
    let mut st = install.load();
    install.save(&st)?;
    platform::copy_self_into(install)?;
    state::remember(install);
    rep.detail(0, install.root.display().to_string());
    rep.done(0);

    rep.begin(1);
    let node = runtime::latest_node()?;
    if st.node_version.as_deref() == Some(node.version.as_str()) && install.node_exe().is_file() {
        rep.skip(1, format!("Node.js {} is already here", node.version));
    } else {
        runtime::install_node(install, &mut st, &node, rep, 1)?;
        rep.detail(1, format!("Node.js {}", node.version));
        rep.done(1);
    }

    rep.begin(2);
    if mongo_current(install, &st) {
        rep.skip(2, format!("MongoDB {MONGO_VERSION} is already here"));
    } else {
        runtime::install_mongo(install, &mut st, rep, 2)?;
        rep.detail(2, format!("MongoDB {MONGO_VERSION}"));
        rep.done(2);
    }

    rep.begin(3);
    let commit = match st.commit.clone().filter(|_| install.source().join("package.json").is_file()) {
        Some(commit) => {
            rep.skip(3, format!("Version {} is already here", short(&commit)));
            commit
        }
        None => {
            rep.detail(3, "Finding the latest version…");
            let commit = source::latest_commit()?;
            download(install, &mut st, &commit, rep, 3)?;
            rep.detail(3, format!("Version {}", short(&commit)));
            rep.done(3);
            commit
        }
    };

    rep.begin(4);
    if install.source().join(".env").is_file() {
        rep.skip(4, "Already configured");
    } else {
        source::write_env(install)?;
        rep.detail(4, "Chose free ports and generated a database password and secret keys");
        rep.done(4);
    }

    if app_built(install, &st) {
        rep.skip(5, "Already installed");
        rep.skip(6, "Already built");
    } else {
        install_packages(install, rep, 5)?;
        build_app(install, &mut st, rep, 6)?;
    }

    let pdf = plan_pdf(install, &st, &commit);
    apply_pdf(install, &mut st, pdf, rep, 7)?;

    rep.begin(8);
    match platform::create_shortcuts(install, rep) {
        Ok(()) => rep.detail(8, if cfg!(windows) { "On the desktop and in the Start menu" } else { "In the applications menu" }),
        Err(e) => {
            rep.log(format!("Shortcuts were not created: {e}"));
            rep.detail(8, format!("Skipped - open {} from its folder instead", state::EXE_NAME));
        }
    }
    rep.done(8);

    st.installed = true;
    install.save(&st)?;
    Ok(Outcome::Installed)
}

fn download(install: &Install, st: &mut State, commit: &str, rep: &Reporter, step: usize) -> Result<(), String> {
    let hash = source::replace_source(install, commit, rep, step)?;
    st.commit = Some(commit.to_owned());
    st.source_app_hash = Some(hash);
    install.save(st)
}

fn install_packages(install: &Install, rep: &Reporter, step: usize) -> Result<(), String> {
    rep.begin(step);
    rep.detail(step, "Downloading the application's packages - this takes a few minutes");
    let cmd = runtime::yarn(install, &["install", "--immutable"])?;
    cmd::stream(cmd, rep).map_err(|e| format!("The application's packages could not be installed. {e}"))?;
    rep.detail(step, "Installed");
    rep.done(step);
    Ok(())
}

fn build_app(install: &Install, st: &mut State, rep: &Reporter, step: usize) -> Result<(), String> {
    rep.begin(step);
    rep.detail(step, "Building - this takes a few minutes");
    let started = Instant::now();
    let mut cmd = runtime::yarn(install, &["build"])?;
    cmd.env("NODE_ENV", "production");
    cmd::stream(cmd, rep).map_err(|e| format!("The application could not be built. {e}"))?;
    st.built_app_hash = st.source_app_hash.clone();
    install.save(st)?;
    let secs = started.elapsed().as_secs();
    rep.detail(step, format!("Built in {}:{:02}", secs / 60, secs % 60));
    rep.done(step);
    Ok(())
}

enum PdfPlan {
    Current,
    Install(PdfRelease, &'static str),
    /// The matching build is not published yet; the installed one stays.
    Pending,
    Unavailable(String),
}

fn plan_pdf(install: &Install, st: &State, commit: &str) -> PdfPlan {
    let have = install.pdf_exe().is_file();
    let tree = match runtime::pdf_tree(commit) {
        Ok(tree) => tree,
        Err(e) => return PdfPlan::Unavailable(e),
    };
    if have && st.pdf_tree.as_deref() == Some(tree.as_str()) {
        return PdfPlan::Current;
    }
    match runtime::pdf_release_for(&tree) {
        Ok(Some(release)) => PdfPlan::Install(release, "Installed"),
        Ok(None) if have => PdfPlan::Pending,
        // A first install takes the newest published build rather than none.
        Ok(None) => match runtime::latest_pdf_release() {
            Ok(Some(release)) => PdfPlan::Install(release, "Installed the most recent published renderer"),
            Ok(None) => PdfPlan::Unavailable("no renderer has been published on GitHub yet".into()),
            Err(e) => PdfPlan::Unavailable(e),
        },
        Err(e) => PdfPlan::Unavailable(e),
    }
}

/// PDF export is optional, so nothing here fails the job except a broken download.
fn apply_pdf(install: &Install, st: &mut State, plan: PdfPlan, rep: &Reporter, step: usize) -> Result<(), String> {
    rep.begin(step);
    match plan {
        PdfPlan::Current => rep.skip(step, "Already up to date"),
        PdfPlan::Pending => {
            rep.skip(step, "A newer renderer is still being built on GitHub - the current one is kept. Update again later.")
        }
        PdfPlan::Unavailable(why) => {
            rep.log(format!("PDF renderer: {why}"));
            rep.skip(
                step,
                if install.pdf_exe().is_file() {
                    "Could not check for a new renderer - the current one is kept"
                } else {
                    "Not available yet - everything except PDF export works"
                },
            );
        }
        PdfPlan::Install(release, note) => {
            runtime::install_pdf(install, st, &release, rep, step)?;
            rep.detail(step, note);
            rep.done(step);
        }
    }
    Ok(())
}

fn open(install: &Install, rep: &Reporter) -> Result<Outcome, String> {
    rep.begin(0);
    if service::is_running(install) {
        rep.skip(0, "Already running");
    } else {
        service::start(install, rep)?;
        rep.done(0);
    }

    rep.begin(1);
    let url = service::wait_until_ready(install, rep, 1)?;
    rep.done(1);

    rep.begin(2);
    platform::open_url(&url)?;
    rep.detail(2, url);
    rep.done(2);
    Ok(Outcome::Opened)
}

fn stop(install: &Install, rep: &Reporter) -> Result<Outcome, String> {
    rep.begin(0);
    if service::is_running(install) {
        service::stop(install, rep, 0)?;
        rep.detail(0, "Stopped - it no longer uses any memory");
        rep.done(0);
    } else {
        rep.skip(0, "Modern Todo is not running");
    }
    Ok(Outcome::Stopped)
}

fn update(install: &Install, rep: &Reporter) -> Result<Outcome, String> {
    let mut st = install.load();

    rep.begin(0);
    rep.detail(0, "Checking GitHub and nodejs.org…");
    let latest = source::latest_commit()?;
    let node = runtime::latest_node()?;
    let new_version = st.commit.as_deref() != Some(latest.as_str()) || !install.source().join("package.json").is_file();
    let node_changed = st.node_version.as_deref() != Some(node.version.as_str()) || !install.node_exe().is_file();
    let mongo_changed = !mongo_current(install, &st);
    let pdf = plan_pdf(install, &st, &latest);
    let pdf_changed = matches!(pdf, PdfPlan::Install(..));
    let build_pending = !app_built(install, &st);

    if !(new_version || node_changed || mongo_changed || pdf_changed || build_pending) {
        let note = if matches!(pdf, PdfPlan::Pending) { " - a new PDF renderer is still being prepared" } else { "" };
        rep.detail(0, format!("You have the latest version ({}){note}", short(&latest)));
        rep.done(0);
        for step in 1..Job::Update.steps().len() {
            rep.skip(step, "Nothing to do");
        }
        return Ok(Outcome::UpToDate);
    }
    rep.detail(
        0,
        if new_version { format!("Version {} is available", short(&latest)) } else { "Updating what Modern Todo runs on".into() },
    );
    rep.done(0);

    rep.begin(1);
    let was_running = service::is_running(install);
    if was_running {
        service::stop(install, rep, 1)?;
        rep.detail(1, "Closed for the update");
        rep.done(1);
    } else {
        rep.skip(1, "Not running");
    }

    rep.begin(2);
    if new_version {
        download(install, &mut st, &latest, rep, 2)?;
        rep.detail(2, format!("Version {}", short(&latest)));
        rep.done(2);
    } else {
        rep.skip(2, "Already downloaded");
    }

    rep.begin(3);
    if node_changed || mongo_changed {
        if node_changed {
            runtime::install_node(install, &mut st, &node, rep, 3)?;
        }
        if mongo_changed {
            runtime::install_mongo(install, &mut st, rep, 3)?;
        }
        rep.detail(3, format!("Node.js {} and MongoDB {MONGO_VERSION}", node.version));
        rep.done(3);
    } else {
        rep.skip(3, "Already up to date");
    }

    // The application changes often and is rebuilt whenever its files did.
    // The PDF renderer is prebuilt on GitHub and only downloaded again when
    // services/pdf changed.
    if app_built(install, &st) {
        rep.skip(4, "No changes to the application");
        rep.skip(5, "No changes to the application");
    } else {
        install_packages(install, rep, 4)?;
        build_app(install, &mut st, rep, 5)?;
    }

    apply_pdf(install, &mut st, pdf, rep, 6)?;

    rep.begin(7);
    if was_running {
        service::start(install, rep)?;
        service::wait_until_ready(install, rep, 7)?;
        rep.detail(7, "Running");
        rep.done(7);
    } else {
        rep.skip(7, "Not running - the new version starts next time you open it");
    }
    Ok(Outcome::Updated)
}

fn uninstall(install: &Install, rep: &Reporter) -> Result<Outcome, String> {
    rep.begin(0);
    if service::is_running(install) {
        service::stop(install, rep, 0)?;
        rep.done(0);
    } else {
        rep.skip(0, "Not running");
    }

    rep.begin(1);
    platform::remove_shortcuts();
    rep.done(1);

    rep.begin(2);
    state::forget();
    let delete_after_exit = platform::delete_files(install)?;
    rep.done(2);
    Ok(Outcome::Uninstalled { delete_after_exit })
}
