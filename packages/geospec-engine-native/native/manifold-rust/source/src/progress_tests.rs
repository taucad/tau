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

// Tests for progress.rs: the throttle's own arithmetic, and the two
// contracts a consumer relies on — phases arrive in pipeline order with
// fractions in [0, 1], and instrumenting a boolean cannot change its result.

use std::sync::{Arc, Mutex};

use super::*;
use crate::linalg::Vec3;
use crate::manifold::Manifold;
use crate::types::{BooleanEngine, MeshGL, OpType};

/// One reported update, reduced to what the assertions look at.
type Event = (&'static str, Option<f64>);

/// Collects every callback a run emits.
#[derive(Default)]
struct Sink {
    events: Arc<Mutex<Vec<Event>>>,
}

impl Sink {
    fn reporter(&self) -> ProgressReporter {
        let events = Arc::clone(&self.events);
        ProgressReporter::new(move |phase: Phase, fraction| {
            events
                .lock()
                .expect("sink poisoned")
                .push((phase.name(), fraction));
        })
    }

    fn events(&self) -> Vec<Event> {
        self.events.lock().expect("sink poisoned").clone()
    }
}

/// Phase id of a reported name, for the monotonicity check.
fn phase_id(name: &str) -> u32 {
    Phase::ALL
        .iter()
        .find(|p| p.name() == name)
        .unwrap_or_else(|| panic!("unknown phase name {name:?}"))
        .id()
}

fn cube(offset: f64) -> Manifold {
    Manifold::cube(Vec3::splat(1.0), true).translate(Vec3::new(offset, 0.0, 0.0))
}

/// A sphere with a doubled shell: self-intersecting, so it exercises every
/// robust phase rather than the trivial disjoint fast paths.
fn spheres() -> (Manifold, Manifold) {
    (
        Manifold::sphere(1.0, 24),
        Manifold::sphere(0.8, 24).translate(Vec3::new(0.4, 0.1, 0.2)),
    )
}

#[test]
fn begin_phase_always_reports_and_names_the_phase() {
    let sink = Sink::default();
    let r = sink.reporter();
    r.begin_phase(Phase::NarrowPhase, 10);
    r.begin_phase(Phase::Winding, 0);
    assert_eq!(
        sink.events(),
        vec![("narrow phase", Some(0.0)), ("winding", None)]
    );
}

#[test]
fn advance_is_throttled_and_fractions_stay_in_range() {
    let sink = Sink::default();
    let r = sink.reporter();
    // 1000 items / 100 reports = one callback per 10 items.
    r.begin_phase(Phase::Arrangements, 1000);
    for _ in 0..1000 {
        r.advance(1);
    }
    let events = sink.events();
    // The begin plus one per step; nothing like 1000 callbacks.
    assert_eq!(events.len(), 101, "expected begin + 100 throttled reports");
    for (name, fraction) in &events {
        assert_eq!(*name, "arrangements");
        let f = fraction.expect("a phase with a total reports a fraction");
        assert!((0.0..=1.0).contains(&f), "fraction {f} out of range");
    }
    assert_eq!(events.last().unwrap().1, Some(1.0));
}

#[test]
fn an_indeterminate_phase_never_reports_a_fraction() {
    let sink = Sink::default();
    let r = sink.reporter();
    r.begin_phase(Phase::Winding, 0);
    for _ in 0..10_000 {
        r.advance(1);
    }
    assert_eq!(sink.events(), vec![("winding", None)]);
}

#[test]
fn phase_ids_round_trip() {
    for p in Phase::ALL {
        assert_eq!(Phase::from_id(p.id()), Some(p));
    }
    assert_eq!(Phase::from_id(Phase::ALL.len() as u32), None);
}

#[test]
fn robust_boolean_reports_monotonic_phases_with_valid_fractions() {
    let (a, b) = spheres();
    let sink = Sink::default();
    let reporter = sink.reporter();
    let out = a.boolean_with_engine_and_progress(
        &b,
        OpType::Add,
        BooleanEngine::Robust,
        None,
        Some(&reporter),
    );
    assert!(out.volume() > 0.0);

    let events = sink.events();
    assert!(!events.is_empty(), "a robust boolean must report something");
    let mut last = 0u32;
    let mut seen = Vec::new();
    for (name, fraction) in &events {
        let id = phase_id(name);
        assert!(
            id >= last,
            "phase {name:?} ({id}) went backwards from {last}"
        );
        if id != last || seen.is_empty() {
            seen.push(*name);
        }
        last = id;
        if let Some(f) = fraction {
            assert!((0.0..=1.0).contains(f), "fraction {f} out of range");
        }
    }
    // Every robust phase should appear for an input that actually intersects.
    for expected in [
        "narrow phase",
        "self intersections",
        "candidate points",
        "registries",
        "arrangements",
        "cells",
        "winding",
        "assemble",
    ] {
        assert!(seen.contains(&expected), "phase {expected:?} never reported (saw {seen:?})");
    }
}

/// The whole point of the "reporting cannot perturb the computation" rule.
#[test]
fn a_reporter_does_not_change_the_result() {
    let mesh = |m: &Manifold| -> MeshGL { m.get_mesh_gl(-1) };
    let (a, b) = spheres();
    for op in [OpType::Add, OpType::Subtract, OpType::Intersect] {
        for engine in [BooleanEngine::Exact, BooleanEngine::Robust, BooleanEngine::Auto] {
            let plain = a.boolean_with_engine(&b, op, engine);
            let sink = Sink::default();
            let reporter = sink.reporter();
            let watched =
                a.boolean_with_engine_and_progress(&b, op, engine, None, Some(&reporter));
            let (p, w) = (mesh(&plain), mesh(&watched));
            assert_eq!(p.tri_verts, w.tri_verts, "{op:?}/{engine:?} topology changed");
            assert_eq!(
                p.vert_properties, w.vert_properties,
                "{op:?}/{engine:?} positions changed"
            );
            assert_eq!(plain.status(), watched.status());
            assert!(!sink.events().is_empty(), "{engine:?} reported nothing");
        }
    }
}

/// Overhead fixture, not an assertion: wall time of the same robust boolean
/// with no reporter, with a no-op reporter, and with a counting one.
///
/// Ignored because it is a measurement, not a pass/fail property — a loaded
/// CI box would make any threshold flaky. Run it deliberately:
///
/// ```text
/// cargo test --release --lib progress::tests::reporter_overhead -- --ignored --nocapture
/// cargo test --release --lib --features parallel \
///     progress::tests::reporter_overhead -- --ignored --nocapture
/// ```
#[test]
#[ignore = "measurement fixture; run explicitly with --ignored --nocapture"]
fn reporter_overhead() {
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::time::Instant;

    let a = Manifold::sphere(1.0, 96);
    let b = Manifold::sphere(0.8, 96).translate(Vec3::new(0.4, 0.1, 0.2));
    const RUNS: u32 = 9;

    let once = |reporter: Option<&ProgressReporter>| {
        let start = Instant::now();
        let out = a.boolean_with_engine_and_progress(
            &b,
            OpType::Add,
            BooleanEngine::Robust,
            None,
            reporter,
        );
        assert!(out.num_tri() > 0);
        start.elapsed().as_secs_f64()
    };

    let noop = ProgressReporter::new(|_, _| {});
    let calls = Arc::new(AtomicU64::new(0));
    let counter = Arc::clone(&calls);
    let counting = ProgressReporter::new(move |_, _| {
        counter.fetch_add(1, Ordering::Relaxed);
    });

    // Warm up, then interleave the three variants round-robin: machine drift
    // (turbo, other load) then hits all three equally instead of whichever
    // block ran during it, which is what made a blocked layout unusable here.
    once(None);
    let (mut none, mut with_noop, mut with_counting) = (0.0, 0.0, 0.0);
    for _ in 0..RUNS {
        none += once(None);
        with_noop += once(Some(&noop));
        with_counting += once(Some(&counting));
    }
    let (none, with_noop, with_counting) = (
        none / f64::from(RUNS),
        with_noop / f64::from(RUNS),
        with_counting / f64::from(RUNS),
    );

    println!(
        "reporter overhead: none {none:.4}s, no-op reporter {with_noop:.4}s \
         ({:+.2}%), counting reporter {with_counting:.4}s ({:+.2}%), \
         {} callbacks per run",
        100.0 * (with_noop - none) / none,
        100.0 * (with_counting - none) / none,
        calls.load(Ordering::Relaxed) / u64::from(RUNS),
    );
}

/// Coarse cubes take the same instrumented path, and the exact engine's single
/// phase is enough to drive an indeterminate UI.
#[test]
fn the_exact_engine_reports_one_indeterminate_phase() {
    let sink = Sink::default();
    let reporter = sink.reporter();
    let out = cube(0.0).boolean_with_engine_and_progress(
        &cube(0.5),
        OpType::Add,
        BooleanEngine::Exact,
        None,
        Some(&reporter),
    );
    assert!(out.volume() > 0.0);
    assert_eq!(sink.events(), vec![("exact boolean", None)]);
}
