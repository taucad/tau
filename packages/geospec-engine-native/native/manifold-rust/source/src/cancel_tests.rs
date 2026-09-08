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

// Tests for the cancellation mechanism (src/cancel.rs) and its threading
// through the boolean / CSG-tree pipeline. The C++ counterparts live in
// cpp-reference/manifold/test/context_test.cpp.

use super::CancelToken;
use crate::csg_tree::CsgNode;
use crate::linalg::Vec3;
use crate::manifold::Manifold;
use crate::types::{Error, OpType};
use std::time::{Duration, Instant};

/// Two heavily overlapping spheres: the same shape C++
/// `ExecutionContextCancelMidBoolean` uses, sized so a single boolean is slow
/// enough to be interrupted mid-flight.
fn slow_pair() -> (Manifold, Manifold) {
    let a = Manifold::sphere(1.0, 256);
    let b = Manifold::sphere(1.0, 256).translate(Vec3::new(0.5, 0.0, 0.0));
    (a, b)
}

#[test]
fn token_starts_uncancelled_and_cancel_is_observable_through_clones() {
    let token = CancelToken::new();
    assert!(!token.is_cancelled());

    // Clones share one flag, matching the C++ ExecutionContext pimpl.
    let clone = token.clone();
    assert!(!clone.is_cancelled());
    token.cancel();
    assert!(token.is_cancelled());
    assert!(clone.is_cancelled(), "clones must share the flag");

    // Cancel is sticky: there is deliberately no way to clear it.
    token.cancel();
    assert!(token.is_cancelled());
}

#[test]
fn no_token_path_is_unchanged() {
    // The whole point of the additive design: passing None must produce the
    // byte-identical result of the pre-existing entry point.
    let (a, b) = (
        Manifold::cube(Vec3::splat(1.0), true),
        Manifold::sphere(0.6, 32),
    );
    let plain = a.boolean(&b, OpType::Subtract);
    let with_none = a.boolean_with_token(&b, OpType::Subtract, None);

    assert_eq!(plain.status(), Error::NoError);
    assert_eq!(with_none.status(), Error::NoError);
    let (m0, m1) = (plain.get_mesh_gl(-1), with_none.get_mesh_gl(-1));
    assert_eq!(m0.vert_properties, m1.vert_properties);
    assert_eq!(m0.tri_verts, m1.tri_verts);
}

#[test]
fn pre_cancelled_token_returns_cancelled_promptly() {
    let token = CancelToken::new();
    token.cancel();

    // A genuinely expensive operation: with the entry gate it must return
    // without doing any of the work.
    let (a, b) = slow_pair();
    let uncancelled = {
        let start = Instant::now();
        let result = a.boolean_with_token(&b, OpType::Add, None);
        assert_eq!(result.status(), Error::NoError);
        start.elapsed()
    };

    let start = Instant::now();
    let result = a.boolean_with_token(&b, OpType::Add, Some(&token));
    let cancelled_elapsed = start.elapsed();

    assert_eq!(result.status(), Error::Cancelled);
    assert!(result.is_empty(), "a cancelled result must be empty");
    assert!(
        cancelled_elapsed * 4 < uncancelled,
        "pre-cancelled boolean took {cancelled_elapsed:?}, uncancelled takes {uncancelled:?}"
    );
}

#[test]
fn pre_cancelled_token_short_circuits_csg_tree_evaluation() {
    let token = CancelToken::new();
    token.cancel();

    let leaves: Vec<CsgNode> = (0..8)
        .map(|i| {
            CsgNode::leaf(
                Manifold::sphere(1.0, 64)
                    .translate(Vec3::new(i as f64 * 0.3, 0.0, 0.0))
                    .as_impl()
                    .clone(),
            )
        })
        .collect();
    let tree = CsgNode::op_n(OpType::Add, leaves);

    let result = tree.evaluate_with_token(Some(&token));
    assert_eq!(result.status, Error::Cancelled);
    assert_eq!(result.num_tri(), 0);
}

#[test]
fn empty_input_fast_paths_still_honour_a_pre_cancelled_token() {
    // C++ ExecutionContextFromMeshGL.CancelBeforeEmptyInputWinsOverNoError:
    // cancel must beat the fast paths that would otherwise report NoError.
    let token = CancelToken::new();
    token.cancel();
    let empty = Manifold::empty();
    let cube = Manifold::cube(Vec3::splat(1.0), true);

    assert_eq!(
        empty.boolean_with_token(&cube, OpType::Add, Some(&token)).status(),
        Error::Cancelled
    );
    assert_eq!(
        cube.boolean_with_token(&empty, OpType::Add, Some(&token)).status(),
        Error::Cancelled
    );
}

#[test]
fn cancel_from_another_thread_interrupts_a_boolean_in_flight() {
    let (a, b) = slow_pair();

    // Measure the uncancelled duration in-test so the assertion is relative:
    // an absolute millisecond threshold would be a machine-speed lottery.
    let start = Instant::now();
    let baseline = a.boolean_with_token(&b, OpType::Add, None);
    let uncancelled = start.elapsed();
    assert_eq!(baseline.status(), Error::NoError);
    assert!(
        uncancelled > Duration::from_millis(20),
        "test input is too fast ({uncancelled:?}) to be a meaningful cancel target"
    );

    let token = CancelToken::new();
    let worker_token = token.clone();
    // Inputs are built up front and the worker times only the boolean itself,
    // so the comparison is like-for-like with `uncancelled`. The handshake
    // pins the start: the main thread does not begin its delay until the
    // worker is at the call, so we are cancelling work in flight rather than
    // racing the thread spawn.
    let (started_tx, started_rx) = std::sync::mpsc::channel();
    let worker = std::thread::spawn(move || {
        started_tx.send(()).expect("main thread went away");
        let start = Instant::now();
        let status = a
            .boolean_with_token(&b, OpType::Add, Some(&worker_token))
            .status();
        (status, start.elapsed())
    });
    started_rx.recv().expect("worker never started");

    // A small fraction of the runtime: long enough to be inside the kernel,
    // short enough that the measured elapsed is dominated by cancel latency
    // rather than by the delay itself. Scaling it off `uncancelled` keeps the
    // proportions stable on a loaded machine, where both numbers inflate.
    std::thread::sleep((uncancelled / 16).max(Duration::from_millis(1)));
    token.cancel();
    let (status, cancelled_elapsed) = worker.join().expect("worker panicked");

    assert_eq!(status, Error::Cancelled);
    // Cancellation is cooperative, so the bound is "returned in a small
    // fraction of the full runtime", not "returned instantly". Measured
    // latency is a few ms against a ~50ms operation; half the runtime is a
    // deliberately loose ceiling that still fails if cancel is being ignored
    // until the operation finishes on its own.
    assert!(
        cancelled_elapsed * 2 < uncancelled,
        "cancelled boolean took {cancelled_elapsed:?}, which is not well under \
         the uncancelled {uncancelled:?}"
    );
}

#[test]
fn a_used_then_cancelled_token_does_not_affect_later_ops_with_a_fresh_token() {
    // C++ ExecutionContextFreshContextEscapesCancel.
    let a = Manifold::cube(Vec3::splat(1.0), true);
    let b = Manifold::sphere(0.6, 32);

    let used = CancelToken::new();
    let first = a.boolean_with_token(&b, OpType::Subtract, Some(&used));
    assert_eq!(first.status(), Error::NoError);

    // Cancelling after the fact must not retroactively change anything...
    used.cancel();
    assert_eq!(first.status(), Error::NoError);

    // ...and a fresh token evaluates normally, producing the same geometry as
    // the completed run *and* as the untokened path. That last comparison is
    // the load-bearing one: a live token routes through a structurally
    // different collect inside `maybe_par_map_ct`, so "a token that is never
    // cancelled changes nothing" has to be asserted, not assumed.
    let fresh = CancelToken::new();
    let second = a.boolean_with_token(&b, OpType::Subtract, Some(&fresh));
    assert_eq!(second.status(), Error::NoError);
    assert!(!fresh.is_cancelled());
    let untokened = a.boolean_with_token(&b, OpType::Subtract, None);
    let (m_first, m_second, m_none) = (
        first.get_mesh_gl(-1),
        second.get_mesh_gl(-1),
        untokened.get_mesh_gl(-1),
    );
    assert_eq!(m_first.tri_verts, m_second.tri_verts);
    assert_eq!(m_second.tri_verts, m_none.tri_verts);
    assert_eq!(m_second.vert_properties, m_none.vert_properties);

    // The stale token is still cancelled and still bites when it is used.
    assert_eq!(
        a.boolean_with_token(&b, OpType::Subtract, Some(&used)).status(),
        Error::Cancelled
    );
}

#[test]
fn a_live_token_produces_identical_geometry_above_the_parallel_thresholds() {
    // `maybe_par_map_ct` does NOT reuse `maybe_par_map` when a token is
    // present: it runs an unindexed `map(Option<T>) -> collect::<Option<Vec>>`
    // where the untokened path runs an indexed `map -> collect::<Vec>`. Under
    // `--features parallel` those are different rayon pipelines, and the port's
    // cardinal rule is exact numerical match — order preservation across that
    // switch is a rayon guarantee we should be pinning, not trusting.
    //
    // Small inputs stay sequential and would never exercise it, so this uses
    // meshes comfortably past both `crate::par` thresholds used in the boolean:
    // 10_000 in intersect12 (over halfedges) and 512 in face2tri (over faces).
    let a = Manifold::sphere(1.0, 128);
    let b = Manifold::sphere(1.0, 128).translate(Vec3::new(0.5, 0.0, 0.0));
    assert!(
        a.as_impl().halfedge.len() > 10_000,
        "input must cross the intersect12 parallel threshold, got {} halfedges",
        a.as_impl().halfedge.len()
    );

    let live = CancelToken::new();
    let tokened = a.boolean_with_token(&b, OpType::Add, Some(&live));
    let untokened = a.boolean_with_token(&b, OpType::Add, None);
    assert_eq!(tokened.status(), Error::NoError);
    assert_eq!(untokened.status(), Error::NoError);
    assert!(!live.is_cancelled());

    let (mt, mu) = (tokened.get_mesh_gl(-1), untokened.get_mesh_gl(-1));
    assert!(mt.tri_verts.len() > 30_000, "result should be substantial");
    assert_eq!(mt.num_prop, mu.num_prop);
    assert_eq!(mt.vert_properties, mu.vert_properties);
    assert_eq!(mt.tri_verts, mu.tri_verts);
    assert_eq!(mt.run_index, mu.run_index);
    assert_eq!(mt.face_id, mu.face_id);

    // The other op types take different branches through boolean_result.
    for op in [OpType::Subtract, OpType::Intersect] {
        let with = a.boolean_with_token(&b, op, Some(&live));
        let without = a.boolean_with_token(&b, op, None);
        assert_eq!(with.status(), Error::NoError, "{op:?}");
        assert_eq!(
            with.get_mesh_gl(-1).vert_properties,
            without.get_mesh_gl(-1).vert_properties,
            "{op:?} vertex positions diverged between the tokened and \
             untokened parallel paths"
        );
        assert_eq!(
            with.get_mesh_gl(-1).tri_verts,
            without.get_mesh_gl(-1).tri_verts,
            "{op:?} triangle order diverged between the tokened and \
             untokened parallel paths"
        );
    }
}

#[test]
fn cancelled_status_survives_the_csg_tree_root() {
    // A cancelled leaf must not be silently absorbed as "empty geometry" by
    // the enclosing tree: the root's status has to stay Cancelled.
    let token = CancelToken::new();
    token.cancel();
    let a = Manifold::cube(Vec3::splat(1.0), true);
    let b = Manifold::cube(Vec3::splat(1.0), true).translate(Vec3::new(0.5, 0.0, 0.0));
    let tree = CsgNode::op(
        OpType::Subtract,
        CsgNode::leaf(a.as_impl().clone()),
        CsgNode::leaf(b.as_impl().clone()),
    );
    assert_eq!(tree.evaluate_with_token(Some(&token)).status, Error::Cancelled);
    // Same tree, no token: unaffected.
    assert_eq!(tree.evaluate().status, Error::NoError);
}
