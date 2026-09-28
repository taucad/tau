// robust/mod.rs — Robust boolean engine for general (possibly non-manifold)
// closed, orientable triangle meshes.
//
// Implements Barki, Guennebaud, Foufou 2015, "Exact, robust, and efficient
// regularized Booleans on general 3D meshes" (docs/Exact, robust, and
// efficient booleans.pdf). This engine is a parallel alternative to the
// ported exact pipeline in src/boolean3.rs: it requires inputs only to be
// geometrically closed and orientable (triangle soup is fine — connectivity
// is never trusted), at the cost of exact rational arithmetic on the hard
// predicate/construction cases.
//
// Selection between the two engines is via `types::BooleanEngine`
// (Exact | Robust | Auto); the exact engine remains the default and its
// behavior is byte-identical to before this module existed.
//
// Submodules (pipeline order):
//   exact              — rational points, filtered predicates, constructions
//   tri_tri            — exact triangle-triangle intersection (narrow phase)
//   arrangement        — per-triangle 2D arrangement of intersection prims
//   cdt                — exact constrained Delaunay triangulation
//   intersection_graph — broad phase, prim distribution, piece emission
//                        (split helpers: graph_types — edge keys, vertex
//                        interner, Piece/IntersectionGraph; graph_geom —
//                        boxes, clips, filtered on-segment tests;
//                        graph_self_cut — same-mesh narrow phase)
//   cells              — arrangement cell complex + winding propagation
//                        (cells_extract — containment predicate + boundary
//                        extraction, re-exported through `cells`)
//   ray_shoot          — exact winding numbers (residual component seeds)
//   soup               — triangle-soup import (closed/orientable validation)
//
// Classification follows the mesh-arrangement formulation (Zhou, Grinspun,
// Zorin, Jacobson 2016 — what libigl's mesh_boolean uses), which subsumes
// both the paper's local Prop 2/3 ring walk and the per-component winding
// queries this engine used before. The arrangement's cells carry a winding
// number per operand, propagated combinatorially from the unbounded cell, so
// adjacent regions cannot disagree; each operand's solid is {w ≥ 1} by
// default, so a negative winding (an inverted region of a self-intersecting
// scan) is never material. `types::WindingRule::Nonzero` switches that
// predicate to {w ≠ 0} per call, which keeps inside-out geometry solid; the
// winding numbers themselves never depend on the rule. The output keeps a
// wall exactly where the operation's predicate
// differs across it, wound from the cell labels rather than from the input
// face — which is what makes the result closed and consistently oriented no
// matter how the input was wound.
//
// The paper's explicit regularization pass — radial ring cancellation and
// coincident-piece binding — has no counterpart here: thin material cancels
// arithmetically in the winding sum, so there is nothing to discard up
// front.

pub mod arrangement;
pub mod assemble;
pub mod cdt;
pub mod cells;
pub mod cells_extract;
pub mod exact;
mod graph_geom;
mod graph_self_cut;
mod graph_types;
pub mod intersection_graph;
pub mod pairing;
pub mod ray_shoot;
pub mod repair;
pub mod soup;
pub mod tri_tri;

use crate::cancel::CancelToken;
use crate::impl_mesh::ManifoldImpl;
use crate::linalg::Vec3;
use crate::types::{Error, OpType, WindingRule};





fn is_cancelled(token: Option<&CancelToken>) -> bool {
    token.is_some_and(|t| t.is_cancelled())
}

fn cancelled_impl() -> ManifoldImpl {
    let mut out = ManifoldImpl::new();
    out.make_empty(Error::Cancelled);
    out
}

/// Can this operand be handed to a bbox-disjoint fast path verbatim — that
/// is, is its surface already exactly the boundary of the solid it denotes,
/// for either winding rule? Two conditions, both exact and both conservative:
///
///  * no self-intersections, so no piece of the surface is interior to its own
///    body (a doubled or crossing sheet has walls the pipeline dissolves);
///  * every shell wound the way its nesting demands
///    ([`repair::shells_well_nested`]), so no inverted body survives that
///    {w >= 1} would drop, and no nested outward shell hides a wall with
///    material on both sides.
///
/// A `false` verdict only costs the full pipeline on a disjoint pair, which
/// produces the same answer by construction — it just also classifies.
fn needs_no_classification(
    imp: &ManifoldImpl,
    tris: &[[Vec3; 3]],
    token: Option<&CancelToken>,
) -> bool {
    // Cheapest first, and usually already cached by `Auto`'s dispatch. A
    // cancelled scan answers "self-intersecting", which routes to the pipeline
    // and so reports `Error::Cancelled` rather than a bogus pass-through.
    !soup::has_self_intersections_with_token(imp, token) && repair::shells_well_nested(tris)
}

/// Robust boolean of two impls (manifold or soup). Same observable contract
/// as `boolean3::boolean_with_token`: intersect exactly, arrange +
/// retriangulate, build the arrangement's cell complex, propagate winding
/// numbers, and keep the walls the operation's predicate separates.
///
/// Every operation is one predicate on a cell's winding vector, so `Subtract`
/// needs no operand flip — it is simply "inside P and not inside Q".
pub fn boolean(
    a: &ManifoldImpl,
    b: &ManifoldImpl,
    op: OpType,
    token: Option<&CancelToken>,
) -> ManifoldImpl {
    boolean_with_progress(a, b, op, token, None)
}

/// [`boolean`] with optional progress reporting (see [`crate::progress`]).
/// `None` is exactly [`boolean`] — the fast paths below are not instrumented
/// at all, since they return before any measurable work happens.
pub fn boolean_with_progress(
    a: &ManifoldImpl,
    b: &ManifoldImpl,
    op: OpType,
    token: Option<&CancelToken>,
    progress: Option<&crate::progress::ProgressReporter>,
) -> ManifoldImpl {
    boolean_with_rule(a, b, op, WindingRule::Positive, token, progress)
}

/// [`boolean_with_progress`] with an explicit winding rule.
///
/// The rule only reinterprets the arrangement's cell labels
/// ([`cells::in_result`]); intersection, arrangement, cell complex, and
/// winding propagation are all rule-independent, so
/// [`WindingRule::Positive`] here is byte-for-byte the historical pipeline.
///
/// The bbox-disjoint fast paths do not consult the rule at all — they never
/// classify anything, they concatenate or return an operand. They therefore
/// run only when every operand they *keep* is provably already the boundary
/// of its own solid ([`needs_no_classification`]): both operands for the
/// union, operand A alone for the difference (B is discarded whatever it is
/// wound like). Otherwise they fall through to the full pipeline, which finds
/// no cross intersections but still classifies each operand — so an inverted
/// body is dropped under [`WindingRule::Positive`] and rewound to positive
/// material under [`WindingRule::Nonzero`], exactly as it would be if the
/// boxes overlapped. Disjoint `Intersect` needs no gate: nothing can be
/// shared, whatever the winding.
///
/// The empty-operand fast paths above still return the other operand
/// unclassified, keeping the historical pass-through of inverted geometry —
/// they have no two-operand pipeline to fall through to.
pub fn boolean_with_rule(
    a: &ManifoldImpl,
    b: &ManifoldImpl,
    op: OpType,
    rule: WindingRule,
    token: Option<&CancelToken>,
    progress: Option<&crate::progress::ProgressReporter>,
) -> ManifoldImpl {
    use crate::progress::{begin_phase, Phase};
    if is_cancelled(token) {
        return cancelled_impl();
    }
    // Fast paths mirror the exact engine's observable behavior.
    if a.is_empty() {
        return match op {
            OpType::Add => b.clone(),
            OpType::Intersect | OpType::Subtract => ManifoldImpl::new(),
        };
    }
    if b.is_empty() {
        return match op {
            OpType::Add | OpType::Subtract => a.clone(),
            OpType::Intersect => ManifoldImpl::new(),
        };
    }
    let p_tris = soup::impl_to_tris(a);
    let q_tris = soup::impl_to_tris(b);
    let p_props = soup::impl_to_corner_props(a);
    let q_props = soup::impl_to_corner_props(b);

    if !a.bbox.does_overlap_box(&b.bbox) {
        // Only the operands a fast path actually *keeps* need vetting: the
        // union keeps both, the difference keeps only A.
        let a_clean = || needs_no_classification(a, &p_tris, token);
        let b_clean = || needs_no_classification(b, &q_tris, token);
        match op {
            OpType::Add if a_clean() && b_clean() => {
                // Disjoint union: concatenate the soups and re-import. The
                // property context tags the two halves so each keeps its own
                // interpolated properties.
                let mut tris = p_tris.clone();
                tris.extend(q_tris.iter().cloned());
                let mut interner = intersection_graph::VertInterner::default();
                let pieces: Vec<intersection_graph::Piece> = tris
                    .iter()
                    .enumerate()
                    .map(|(i, t)| intersection_graph::Piece {
                        mesh: if i < p_tris.len() { 0 } else { 1 },
                        tri: if i < p_tris.len() { i } else { i - p_tris.len() },
                        vi: [
                            interner.intern_f64(t[0]),
                            interner.intern_f64(t[1]),
                            interner.intern_f64(t[2]),
                        ],
                    })
                    .collect();
                let ctx = assemble::PropCtx {
                    num_prop: [a.num_prop, b.num_prop],
                    tris: [&p_tris, &q_tris],
                    props: [&p_props, &q_props],
                };
                let props = (ctx.out_num_prop() > 0).then_some(&ctx);
                return assemble::assemble(
                    &pieces,
                    &interner.verts,
                    &interner.verts_f64,
                    |_| true,
                    props,
                )
                .into_impl();
            }
            OpType::Intersect => return ManifoldImpl::new(),
            OpType::Subtract if a_clean() => return a.clone(),
            // A kept operand needs classification: fall through to the full
            // pipeline, which handles disjoint inputs fine (it simply finds no
            // cross intersections).
            OpType::Add | OpType::Subtract => {}
        }
    }

    // Subtraction needs no operand flip: the cell predicate expresses it
    // directly as "inside P and not inside Q", so both operands keep their
    // own winding and their corner properties stay in their original order.
    let Some(graph) =
        intersection_graph::build_graph_with_progress(&p_tris, &q_tris, token, progress)
    else {
        return cancelled_impl();
    };
    let t_cells = crate::timing::start();
    let Some(complex) = cells::build_cells_with_progress(&graph, token, progress) else {
        return cancelled_impl();
    };
    crate::timing::print("robust: cell complex", t_cells);

    // One exact query anchors each connected component; the rest of its
    // cells follow combinatorially. Winding and assembly report as phase
    // transitions only: neither has a work total the caller could see a
    // fraction of without instrumenting the exact ray queries themselves.
    begin_phase(progress, Phase::Winding, 0);
    let t_winding = crate::timing::start();
    let wind = cells::windings(&graph, &complex, [&p_tris, &q_tris]);
    crate::timing::print("robust: winding propagation", t_winding);
    if is_cancelled(token) {
        return cancelled_impl();
    }

    // Boundary of the result, wound from the cell labels.
    begin_phase(progress, Phase::Assemble, 0);
    let pieces = cells::extract(&graph, &complex, &wind, op, rule);
    let ctx = assemble::PropCtx {
        num_prop: [a.num_prop, b.num_prop],
        tris: [&p_tris, &q_tris],
        props: [&p_props, &q_props],
    };
    let props = (ctx.out_num_prop() > 0).then_some(&ctx);
    let t_asm = crate::timing::start();
    let out = assemble::assemble(&pieces, &graph.verts, &graph.verts_f64, |_| true, props);
    crate::timing::print("robust: assemble+import", t_asm);
    out.into_impl()
}

/// Import a raw triangle list as a boolean result (used by
/// `boolean3::compose_meshes` when any input is a soup; positions only —
/// the property-aware disjoint-union path in `boolean` builds its own
/// tagged pieces).
pub(crate) fn assemble_all(tris: &[[Vec3; 3]]) -> ManifoldImpl {
    let mut interner = intersection_graph::VertInterner::default();
    let pieces: Vec<intersection_graph::Piece> = tris
        .iter()
        .enumerate()
        .map(|(i, t)| intersection_graph::Piece {
            mesh: 0,
            tri: i,
            vi: [
                interner.intern_f64(t[0]),
                interner.intern_f64(t[1]),
                interner.intern_f64(t[2]),
            ],
        })
        .collect();
    assemble::assemble(&pieces, &interner.verts, &interner.verts_f64, |_| true, None).into_impl()
}

#[cfg(test)]
#[path = "engine_tests.rs"]
mod engine_tests;

#[cfg(test)]
#[path = "cross_validation_tests.rs"]
mod cross_validation_tests;

#[cfg(test)]
#[path = "nonmanifold_tests.rs"]
mod nonmanifold_tests;

#[cfg(test)]
#[path = "property_tests.rs"]
mod property_tests;

#[cfg(test)]
#[path = "thingi_tests.rs"]
mod thingi_tests;
