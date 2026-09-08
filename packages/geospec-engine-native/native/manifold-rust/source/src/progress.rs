// Copyright 2026 Lars Brubaker
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

// progress.rs — optional, throttled progress reporting for the long-running
// boolean pipelines.
//
// This is the sibling of `cancel.rs`: both are threaded through the kernel as
// an `Option<&_>` so that the "nobody is watching" path — every pre-existing
// caller — is byte-for-byte the code that ran before the feature existed.
// `None` touches no atomic and takes no lock; the branch folds out of the
// hot loops entirely because the *decision* is made once per phase, at the
// call site of a map, not per element.
//
// The C++ reference has an equivalent (`ExecutionContext`'s donePhases /
// totalPhases / Progress()), which `cancel.rs` deliberately did not port. This
// module is not a port of it: the C++ counts whole pipeline phases, while the
// robust engine's phases are wildly unequal in cost, so we report a *named*
// phase plus an intra-phase fraction instead. Nothing here can change a
// computed value — the reporter is write-only from the kernel's point of view.
//
// Who reports what:
//   robust/intersection_graph.rs  NarrowPhase, SelfIntersections,
//                                 CandidatePoints, Registries, Arrangements
//   robust/cells.rs               Cells (per arrangement edge)
//   robust/mod.rs                 Winding, Assemble (phase transitions only)
//   boolean3.rs                   ExactBoolean (one indeterminate phase; the
//                                 exact engine's internals are not
//                                 instrumented, so its timing stays exactly
//                                 what it was)
//
// Threading model: the callback is invoked under a `Mutex`, so it is never
// re-entered concurrently even when the `parallel` feature has rayon workers
// driving `advance`. It *can* be invoked from a worker thread rather than the
// caller's; consumers that need a specific thread must marshal themselves.

use std::sync::atomic::{AtomicU32, AtomicU64, Ordering};
use std::sync::Mutex;

/// Coarse pipeline stages, in the order the robust engine runs them.
///
/// Ids are part of the FFI surface (`manifold_rs_progress_phase_name`), so new
/// phases are appended rather than inserted.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Phase {
    NarrowPhase = 0,
    SelfIntersections = 1,
    CandidatePoints = 2,
    Registries = 3,
    Arrangements = 4,
    Cells = 5,
    Winding = 6,
    Assemble = 7,
    /// The exact engine, reported as one indeterminate phase.
    ExactBoolean = 8,
}

impl Phase {
    pub const ALL: [Phase; 9] = [
        Phase::NarrowPhase,
        Phase::SelfIntersections,
        Phase::CandidatePoints,
        Phase::Registries,
        Phase::Arrangements,
        Phase::Cells,
        Phase::Winding,
        Phase::Assemble,
        Phase::ExactBoolean,
    ];

    /// Stable display name. `&'static str` so a reporter callback never has to
    /// allocate to forward it.
    pub fn name(self) -> &'static str {
        match self {
            Phase::NarrowPhase => "narrow phase",
            Phase::SelfIntersections => "self intersections",
            Phase::CandidatePoints => "candidate points",
            Phase::Registries => "registries",
            Phase::Arrangements => "arrangements",
            Phase::Cells => "cells",
            Phase::Winding => "winding",
            Phase::Assemble => "assemble",
            Phase::ExactBoolean => "exact boolean",
        }
    }

    pub fn id(self) -> u32 {
        self as u32
    }

    pub fn from_id(id: u32) -> Option<Phase> {
        Phase::ALL.get(id as usize).copied()
    }
}

/// The kernel-facing callback: the phase entered (carry both its stable id and
/// its display name) plus either a fraction in `[0, 1]` for a determinate bar,
/// or `None` when the phase has no meaningful total.
///
/// `Send + Sync` because rayon workers may drive it under the `parallel`
/// feature. WASM consumers whose callback is a `JsValue` (not `Send`) route
/// through a thread-local instead of relaxing this bound — see
/// `demo/wasm/src/progress.rs`.
type Callback = Box<dyn Fn(Phase, Option<f64>) + Send + Sync>;

/// How many callbacks a determinate phase emits, at most. Chosen so the
/// per-item cost stays a relaxed `fetch_add` plus one compare against a cached
/// threshold: the lock and the callback itself are amortized over
/// `total / 100` items.
const REPORTS_PER_PHASE: u64 = 100;

/// A throttled sink for pipeline progress.
///
/// Pass `Some(&reporter)` to a `*_with_progress` entry point; the reporter may
/// be shared across threads and outlive the call.
///
/// # Example
/// ```
/// use manifold_rust::progress::ProgressReporter;
/// use manifold_rust::manifold::Manifold;
/// use manifold_rust::linalg::Vec3;
/// use manifold_rust::types::{BooleanEngine, OpType};
/// use std::sync::{Arc, Mutex};
///
/// let seen = Arc::new(Mutex::new(Vec::new()));
/// let sink = Arc::clone(&seen);
/// let reporter = ProgressReporter::new(move |phase, fraction| {
///     sink.lock().unwrap().push((phase.name(), fraction));
/// });
///
/// let a = Manifold::cube(Vec3::splat(1.0), true);
/// let b = Manifold::sphere(0.6, 16);
/// let out = a.boolean_with_engine_and_progress(
///     &b, OpType::Add, BooleanEngine::Robust, None, Some(&reporter),
/// );
/// assert!(out.volume() > 0.0);
/// assert!(!seen.lock().unwrap().is_empty());
/// ```
pub struct ProgressReporter {
    callback: Mutex<Callback>,
    /// Current phase id, as `Phase::id()`.
    phase: AtomicU32,
    /// Items completed in the current phase.
    done: AtomicU64,
    /// Items the current phase expects; 0 means "indeterminate".
    total: AtomicU64,
    /// `done` value at which the next callback fires.
    next: AtomicU64,
    /// Items between callbacks.
    step: AtomicU64,
}

impl std::fmt::Debug for ProgressReporter {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ProgressReporter")
            .field("phase", &Phase::from_id(self.phase.load(Ordering::Relaxed)))
            .field("done", &self.done.load(Ordering::Relaxed))
            .field("total", &self.total.load(Ordering::Relaxed))
            .finish()
    }
}

impl ProgressReporter {
    pub fn new<F>(callback: F) -> Self
    where
        F: Fn(Phase, Option<f64>) + Send + Sync + 'static,
    {
        Self {
            callback: Mutex::new(Box::new(callback)),
            phase: AtomicU32::new(Phase::NarrowPhase.id()),
            done: AtomicU64::new(0),
            total: AtomicU64::new(0),
            next: AtomicU64::new(u64::MAX),
            step: AtomicU64::new(u64::MAX),
        }
    }

    /// Enter `phase`, expecting `total` work items (`0` = no total known, which
    /// reports as an indeterminate phase). Always emits a callback, so a phase
    /// transition is never throttled away.
    pub fn begin_phase(&self, phase: Phase, total: u64) {
        let step = (total / REPORTS_PER_PHASE).max(1);
        self.phase.store(phase.id(), Ordering::Relaxed);
        self.total.store(total, Ordering::Relaxed);
        self.done.store(0, Ordering::Relaxed);
        self.step.store(step, Ordering::Relaxed);
        self.next
            .store(if total == 0 { u64::MAX } else { step }, Ordering::Relaxed);
        self.emit(phase, if total == 0 { None } else { Some(0.0) });
    }

    /// Record `n` completed work items in the current phase, emitting a
    /// callback only when the throttle threshold is crossed.
    ///
    /// Safe to call from several threads at once; the counter is atomic and the
    /// callback is serialized. Under contention two threads can both cross the
    /// threshold and both report, which is harmless — this is a UI hint, not a
    /// ledger.
    #[inline]
    pub fn advance(&self, n: u64) {
        let done = self.done.fetch_add(n, Ordering::Relaxed) + n;
        if done < self.next.load(Ordering::Relaxed) {
            return;
        }
        self.report_at(done);
    }

    /// Cold half of [`advance`], kept out of line so the common case is a
    /// fetch-add and a compare.
    #[cold]
    fn report_at(&self, done: u64) {
        let step = self.step.load(Ordering::Relaxed);
        self.next.store(done.saturating_add(step), Ordering::Relaxed);
        let total = self.total.load(Ordering::Relaxed);
        let Some(phase) = Phase::from_id(self.phase.load(Ordering::Relaxed)) else {
            return;
        };
        let fraction = if total == 0 {
            None
        } else {
            Some((done as f64 / total as f64).clamp(0.0, 1.0))
        };
        self.emit(phase, fraction);
    }

    /// Invoke the callback. A poisoned mutex (a previous callback panicked) is
    /// deliberately ignored rather than propagated: a broken progress sink must
    /// not take down a geometry operation.
    fn emit(&self, phase: Phase, fraction: Option<f64>) {
        if let Ok(cb) = self.callback.lock() {
            cb(phase, fraction);
        }
    }
}

/// `Option`-aware [`ProgressReporter::begin_phase`], mirroring how
/// [`crate::cancel::is_cancelled`] handles the absent case.
#[inline]
pub fn begin_phase(progress: Option<&ProgressReporter>, phase: Phase, total: u64) {
    if let Some(p) = progress {
        p.begin_phase(phase, total);
    }
}

/// [`crate::par::maybe_par_map_ct`] that also counts completed items into
/// `progress`.
///
/// With `progress == None` this *is* `maybe_par_map_ct` — the same closure, no
/// wrapper — so the uninstrumented path keeps its exact codegen. With a
/// reporter the only added work per item is one relaxed `fetch_add`; results
/// are still collected in index order, so the output is bit-identical either
/// way.
#[cfg(feature = "parallel")]
pub fn maybe_par_map_ct_progress<T, F>(
    n: usize,
    threshold: usize,
    token: Option<&crate::cancel::CancelToken>,
    progress: Option<&ProgressReporter>,
    f: F,
) -> Option<Vec<T>>
where
    T: Send,
    F: Fn(usize) -> T + Sync + Send,
{
    match progress {
        None => crate::par::maybe_par_map_ct(n, threshold, token, f),
        Some(p) => crate::par::maybe_par_map_ct(n, threshold, token, |i| {
            let out = f(i);
            p.advance(1);
            out
        }),
    }
}

/// Sequential fallback: identical output to the parallel version.
#[cfg(not(feature = "parallel"))]
pub fn maybe_par_map_ct_progress<T, F>(
    n: usize,
    threshold: usize,
    token: Option<&crate::cancel::CancelToken>,
    progress: Option<&ProgressReporter>,
    f: F,
) -> Option<Vec<T>>
where
    F: Fn(usize) -> T,
{
    match progress {
        None => crate::par::maybe_par_map_ct(n, threshold, token, f),
        Some(p) => crate::par::maybe_par_map_ct(n, threshold, token, |i| {
            let out = f(i);
            p.advance(1);
            out
        }),
    }
}

#[cfg(test)]
#[path = "progress_tests.rs"]
mod tests;
