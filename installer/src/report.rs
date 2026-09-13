//! How a background job tells the window what it is doing.

use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::mpsc::Sender;
use std::sync::Arc;

use crate::jobs::Outcome;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum StepState {
    Pending,
    Running,
    Done,
    Skipped,
    Failed,
}

pub enum Event {
    Step { index: usize, state: StepState },
    Detail { index: usize, text: String },
    /// `None` is "busy, but no idea how far along".
    Progress { index: usize, fraction: Option<f32> },
    Log(String),
    Finished(Result<Outcome, String>),
}

#[derive(Clone)]
pub struct Reporter {
    tx: Sender<Event>,
    repaint: Arc<dyn Fn() + Send + Sync>,
    current: Arc<AtomicUsize>,
}

impl Reporter {
    pub fn new(tx: Sender<Event>, repaint: Arc<dyn Fn() + Send + Sync>) -> Self {
        Self { tx, repaint, current: Arc::new(AtomicUsize::new(0)) }
    }

    fn send(&self, event: Event) {
        // The window may already be gone; nothing left to tell.
        let _ = self.tx.send(event);
        (self.repaint)();
    }

    pub fn log(&self, line: impl Into<String>) {
        self.send(Event::Log(line.into()));
    }

    pub fn begin(&self, index: usize) {
        self.current.store(index, Ordering::Relaxed);
        self.send(Event::Step { index, state: StepState::Running });
    }

    pub fn done(&self, index: usize) {
        self.send(Event::Progress { index, fraction: None });
        self.send(Event::Step { index, state: StepState::Done });
    }

    pub fn skip(&self, index: usize, why: impl Into<String>) {
        self.detail(index, why);
        self.send(Event::Step { index, state: StepState::Skipped });
    }

    pub fn detail(&self, index: usize, text: impl Into<String>) {
        self.send(Event::Detail { index, text: text.into() });
    }

    pub fn progress(&self, index: usize, fraction: Option<f32>) {
        self.send(Event::Progress { index, fraction });
    }

    pub fn finish(&self, result: Result<Outcome, String>) {
        if let Err(message) = &result {
            let index = self.current.load(Ordering::Relaxed);
            self.send(Event::Step { index, state: StepState::Failed });
            self.log(format!("ERROR: {message}"));
        }
        self.send(Event::Finished(result));
    }
}
