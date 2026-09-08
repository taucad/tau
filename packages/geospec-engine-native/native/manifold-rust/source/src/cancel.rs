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

// cancel.rs — cooperative cancellation for the long-running kernel entry
// points (boolean, CSG tree evaluation).
//
// Port of the *cancellation* half of the C++ `ExecutionContext` mechanism. The
// progress-reporting half (donePhases / totalPhases / Progress()) is not
// ported: src/progress.rs provides progress reporting natively instead,
// reporting named phases plus an intra-phase fraction rather than the C++'s
// whole-pipeline phase count. Both are threaded through the kernel the same
// way — as an `Option<&_>` whose `None` path is the pre-existing code.
//
// What the C++ does (cpp-reference/manifold/src/execution_impl.h:81-114):
//   - `ExecutionContext::Impl` holds a single `std::atomic<bool> cancel`,
//     shared through a `shared_ptr` so copies of a context observe each other.
//   - `ExecutionContext::Cancel()` stores `true` with `memory_order_relaxed`
//     (execution_impl.cpp:91-93); cancel is advisory, so it needs no
//     synchronisation with the surrounding data.
//   - `IsCancelled(ctx)` (execution_impl.h:112-114) is the single canonical
//     reader. It returns `false` for a null ctx, which is how the "no
//     cancellation requested" path stays free: `ctx == nullptr` folds the
//     atomic load out of the loop entirely.
//   - Cancel is *sticky*: it is never reset, so once a context is cancelled
//     every later operation through it short-circuits
//     (execution_impl.cpp:30-33 explicitly preserves it across resets).
//   - The observable result of an interrupted operation is an *empty* manifold
//     whose status is `Manifold::Error::Cancelled` — the last enum value, added
//     at the end of the list (manifold.h:124-140). See `ADVANCE_PHASE_OR_RETURN`
//     (execution_impl.h:150-160) and `Boolean3::Result`'s `phase()` lambda
//     (boolean_result.cpp:758-770), both of which do `MakeEmpty(Cancelled)`.
//
// The Rust mirror of `ExecutionContext::Impl*` is `Option<&CancelToken>`:
// `None` is C++'s `nullptr` and costs nothing (no atomic is touched), `Some`
// carries an `Arc<AtomicBool>` that any number of threads may share.
//
// Where the checks live (mirroring the C++ sites named above):
//   csg_tree.rs           `to_leaf_node` (per stack step), `simple_boolean`
//                         (entry), `batch_boolean` (per round), `batch_union`
//                         (per chunk)          <- csg_tree.cpp:172/460/511/752
//   boolean3.rs           `boolean_with_token` (entry), `Boolean3::new_with_token`
//                         (four stage boundaries), plus intra-stage checks in
//                         `intersect12` / `winding03`
//                                              <- boolean3.cpp:380/437/456/472/
//                                                 480/530/536/552/558
//   boolean_result_       all eleven phase boundaries between the assembly
//     assemble.rs         stages, including the final one after SortGeometry
//                                              <- boolean_result.cpp:758-963
//   face_op.rs            `face2tri_ct` entry plus per-face triangulation
//                                              <- face_op.cpp:192/290
//
// The invariant those sites buy: **a cancelled token can never produce a
// NoError result.** Every stage of the boolean pipeline is bracketed by a
// check, so a cancel that lands inside a stage is always observed at the next
// boundary and converted to `Error::Cancelled` before the value escapes. It is
// not enough to check "often enough for good latency" — a missed *final* check
// would report success for an operation the caller cancelled.
//
// Deviations from the C++, all in the "checks fewer places" direction, none
// affecting the uncancelled result and none breaking the invariant above:
//   - Progress reporting (donePhases/totalPhases/Progress) is not ported.
//   - C++ threads ctx *into* `SortGeometry`, `ReorderHalfedges` and
//     `SimplifyTopology`; we only bracket them. The cost is latency (one run of
//     the trailing simplify + sort block), not a wrong status.
//   - C++ also threads ctx into the non-Boolean entry points (`FromMeshGL`,
//     `Smooth`, `LevelSet`, `Hull`, `Minkowski`, `Refine`). Here only the
//     boolean / CSG pipeline is cancellable at all; those entry points ignore
//     tokens rather than reporting a stale status, since they take none.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

/// A cheaply cloneable, thread-safe cancellation flag.
///
/// Clones share one flag (the C++ `ExecutionContext` pimpl semantics), so a
/// token handed to a worker thread can be cancelled from anywhere. Cancellation
/// is **sticky**: there is no way to un-cancel a token, matching C++, where the
/// flag is deliberately preserved across operation resets. Start a fresh token
/// for work that should be allowed to complete.
///
/// # Example
/// ```
/// use manifold_rust::cancel::CancelToken;
/// use manifold_rust::manifold::Manifold;
/// use manifold_rust::linalg::Vec3;
/// use manifold_rust::types::{Error, OpType};
///
/// let token = CancelToken::new();
/// token.cancel();
/// let a = Manifold::cube(Vec3::splat(1.0), true);
/// let b = Manifold::cube(Vec3::splat(1.0), true);
/// let result = a.boolean_with_token(&b, OpType::Add, Some(&token));
/// assert_eq!(result.status(), Error::Cancelled);
/// ```
#[derive(Clone, Debug, Default)]
pub struct CancelToken {
    flag: Arc<AtomicBool>,
}

impl CancelToken {
    /// A fresh, uncancelled token.
    pub fn new() -> Self {
        Self {
            flag: Arc::new(AtomicBool::new(false)),
        }
    }

    /// Request cancellation. Callable from any thread, including while another
    /// thread is inside an operation holding a clone of this token.
    ///
    /// `Relaxed` matches C++ `cancel.store(true, std::memory_order_relaxed)`:
    /// the flag is advisory and orders nothing else, and the readers only ever
    /// use the value to decide whether to stop early.
    pub fn cancel(&self) {
        self.flag.store(true, Ordering::Relaxed);
    }

    /// Whether cancellation has been requested.
    #[inline]
    pub fn is_cancelled(&self) -> bool {
        self.flag.load(Ordering::Relaxed)
    }
}

/// Canonical reader, mirroring C++ `IsCancelled(ExecutionContext::Impl*)`.
///
/// `None` (C++'s `nullptr` ctx) returns `false` without touching an atomic, so
/// the uncancellable path — every existing caller — reads exactly as it did
/// before this module existed.
#[inline]
pub fn is_cancelled(token: Option<&CancelToken>) -> bool {
    match token {
        Some(t) => t.is_cancelled(),
        None => false,
    }
}

#[cfg(test)]
#[path = "cancel_tests.rs"]
mod tests;
