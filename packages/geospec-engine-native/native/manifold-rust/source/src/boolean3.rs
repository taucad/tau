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

// Phase 11: Boolean Operations (Core)
//
// C++ sources: src/boolean3.cpp (531 lines), src/boolean_result.cpp (889 lines)
//
// This module implements the edge-face intersection detection algorithm from
// boolean3.cpp. The result is consumed by boolean_result.rs to assemble the
// output mesh.
//
// Key notation (from the C++ source):
// - P and Q are the two input manifolds, R is the output
// - Dimensions: vert=0, edge=1, face=2, solid=3
// - X = winding-number quantity, S = "shadow" subset of X
// - p1q2 = edges of P intersecting faces of Q
// - x12 = winding contribution at each intersection
// - v12 = 3D position of each intersection vertex

use crate::cancel::{is_cancelled, CancelToken};
use crate::impl_mesh::ManifoldImpl;
use crate::linalg::{dot, IVec3, Vec3};
use crate::types::{Box as BBox, Error, Halfedge, OpType, RayHit, TriRef};

// The floating-point kernels (shadow01, kernel11/02/12) and the broadphase
// drivers (intersect12, winding03) live in boolean3_kernels.rs.
#[path = "boolean3_kernels.rs"]
mod boolean3_kernels;
use boolean3_kernels::{intersect12, kernel12, winding03};

// ---------------------------------------------------------------------------
// Intersections — sparse intersection data between two meshes
// ---------------------------------------------------------------------------

/// Stores the intersections of edges of one mesh with faces of the other.
/// In forward mode: edges of P with faces of Q.
/// In reverse mode: edges of Q with faces of P.
#[derive(Clone, Default)]
pub struct Intersections {
    /// Pairs [edge_idx, face_idx] — in forward mode [p1, q2], reverse [q1, p2]
    pub p1q2: Vec<[i32; 2]>,
    /// Winding number contribution at each intersection
    pub x12: Vec<i32>,
    /// 3D position of each intersection vertex
    pub v12: Vec<Vec3>,
}

// ---------------------------------------------------------------------------
// Boolean3 — the core intersection computation
// ---------------------------------------------------------------------------

/// Computes all edge-face intersections and winding numbers between two meshes.
pub struct Boolean3 {
    pub xv12: Intersections,
    pub xv21: Intersections,
    pub w03: Vec<i32>,
    pub w30: Vec<i32>,
    pub expand_p: bool,
    pub valid: bool,
}


// ---------------------------------------------------------------------------
// Boolean3 constructor
// ---------------------------------------------------------------------------

impl Boolean3 {
    /// Compute all intersections between meshes inP and inQ for the given op.
    pub fn new(in_p: &ManifoldImpl, in_q: &ManifoldImpl, op: OpType) -> Self {
        match Self::new_with_token(in_p, in_q, op, None) {
            Some(b3) => b3,
            // Unreachable: `is_cancelled(None)` is always false, so none of the
            // cancellation arms below can be taken. The debug assert makes a
            // future refactor that breaks that reasoning fail loudly in tests,
            // while release stays total — degrading to an invalid
            // (empty-result) Boolean3 rather than panicking in production.
            None => {
                debug_assert!(
                    false,
                    "Boolean3::new_with_token returned None for a None token; \
                     only a cancelled token can produce None"
                );
                Boolean3 {
                    xv12: Intersections::default(),
                    xv21: Intersections::default(),
                    w03: Vec::new(),
                    w30: Vec::new(),
                    expand_p: op == OpType::Add,
                    valid: false,
                }
            }
        }
    }

    /// [`Boolean3::new`] with cooperative cancellation. `None` means `token`
    /// was cancelled; no usable intersection data was produced.
    ///
    /// The check placement mirrors C++ `Boolean3::Boolean3`
    /// (boolean3.cpp:497-560): one phase-boundary check before launching each
    /// of the four heavy stages, plus the intra-stage checks that
    /// [`intersect12`] and [`winding03`] carry.
    pub fn new_with_token(
        in_p: &ManifoldImpl,
        in_q: &ManifoldImpl,
        op: OpType,
        token: Option<&CancelToken>,
    ) -> Option<Self> {
        let expand_p = op == OpType::Add;

        if in_p.is_empty() || in_q.is_empty() || !in_p.bbox.does_overlap_box(&in_q.bbox) {
            return Some(Boolean3 {
                xv12: Intersections::default(),
                xv21: Intersections::default(),
                w03: vec![0; in_p.num_vert()],
                w30: vec![0; in_q.num_vert()],
                expand_p,
                valid: true,
            });
        }

        // Level 3: find all edge-face intersections in both directions
        let t_total = crate::timing::start();
        let t = crate::timing::start();
        // Phase-boundary fast-path: skip launching the next stage if cancel
        // fired between stages (C++ boolean3.cpp:530/536/552/558).
        if is_cancelled(token) {
            return None;
        }
        let xv12 = intersect12(in_p, in_q, expand_p, true, token)?;
        crate::timing::print("  Intersect12 P->Q", t);
        let t = crate::timing::start();
        if is_cancelled(token) {
            return None;
        }
        let xv21 = intersect12(in_p, in_q, expand_p, false, token)?;
        crate::timing::print("  Intersect12 Q->P", t);

        if xv12.x12.len() > i32::MAX as usize || xv21.x12.len() > i32::MAX as usize {
            return Some(Boolean3 {
                xv12: Intersections::default(),
                xv21: Intersections::default(),
                w03: Vec::new(),
                w30: Vec::new(),
                expand_p,
                valid: false,
            });
        }

        // Compute winding numbers via flood fill
        let t = crate::timing::start();
        if is_cancelled(token) {
            return None;
        }
        let w03 = winding03(in_p, in_q, &xv12.p1q2, expand_p, true, token)?;
        crate::timing::print("  Winding03 P", t);
        let t = crate::timing::start();
        if is_cancelled(token) {
            return None;
        }
        let w30 = winding03(in_p, in_q, &xv21.p1q2, expand_p, false, token)?;
        crate::timing::print("  Winding03 Q", t);
        crate::timing::print("Intersections (total)", t_total);

        Some(Boolean3 {
            xv12,
            xv21,
            w03,
            w30,
            expand_p,
            valid: true,
        })
    }
}

// ---------------------------------------------------------------------------
// compose_meshes — concatenate disjoint meshes (unchanged from before)
// ---------------------------------------------------------------------------

fn extract_tri_vert(mesh: &ManifoldImpl) -> Vec<IVec3> {
    (0..mesh.num_tri())
        .map(|tri| {
            IVec3::new(
                mesh.halfedge[3 * tri].start_vert,
                mesh.halfedge[3 * tri + 1].start_vert,
                mesh.halfedge[3 * tri + 2].start_vert,
            )
        })
        .collect()
}

fn extract_tri_prop(mesh: &ManifoldImpl) -> Vec<IVec3> {
    (0..mesh.num_tri())
        .map(|tri| {
            IVec3::new(
                mesh.halfedge[3 * tri].prop_vert,
                mesh.halfedge[3 * tri + 1].prop_vert,
                mesh.halfedge[3 * tri + 2].prop_vert,
            )
        })
        .collect()
}

fn property_row(mesh: &ManifoldImpl, row: usize, width: usize) -> Vec<f64> {
    if mesh.num_prop == 0 {
        vec![0.0; width]
    } else {
        let mut out = vec![0.0; width];
        let src = &mesh.properties[row * mesh.num_prop..(row + 1) * mesh.num_prop];
        out[..src.len()].copy_from_slice(src);
        out
    }
}

/// Concatenate multiple disjoint meshes into one. This is a genuine utility
/// used by both boolean operations and CSG compose. It does NOT perform any
/// boolean intersection — the meshes must be non-overlapping for correct results.
pub fn compose_meshes(meshes: &[ManifoldImpl]) -> ManifoldImpl {
    if meshes.is_empty() {
        return ManifoldImpl::new();
    }
    if meshes.len() == 1 {
        return meshes[0].clone();
    }
    // Soup inputs (robust non-manifold import) cannot go through
    // create_halfedges' strict pairing below; concatenate them geometrically
    // instead. Mesh relations are not preserved on this path — soups carry
    // none that survive a boolean anyway.
    if meshes.iter().any(|m| m.is_soup) {
        let mut tris = Vec::new();
        for m in meshes {
            tris.extend(crate::robust::soup::impl_to_tris(m));
        }
        return crate::robust::assemble_all(&tris);
    }

    let num_prop = meshes.iter().map(|m| m.num_prop).max().unwrap_or(0);
    let mut vert_pos = Vec::new();
    let mut properties = Vec::new();
    let mut tri_vert = Vec::new();
    let mut tri_prop = Vec::new();
    let mut vert_offset = 0i32;
    let mut prop_offset = 0i32;

    for mesh in meshes {
        vert_pos.extend_from_slice(&mesh.vert_pos);

        let old_tri_vert = extract_tri_vert(mesh);
        let old_tri_prop = extract_tri_prop(mesh);
        tri_vert.extend(old_tri_vert.into_iter().map(|t| {
            IVec3::new(t.x + vert_offset, t.y + vert_offset, t.z + vert_offset)
        }));
        tri_prop.extend(old_tri_prop.into_iter().map(|t| {
            IVec3::new(t.x + prop_offset, t.y + prop_offset, t.z + prop_offset)
        }));

        if num_prop > 0 {
            let prop_rows = mesh.num_prop_vert();
            for row in 0..prop_rows {
                properties.extend(property_row(mesh, row, num_prop));
            }
            prop_offset += prop_rows as i32;
        } else {
            prop_offset += mesh.num_prop_vert() as i32;
        }
        vert_offset += mesh.num_vert() as i32;
    }

    // Concatenate tri_refs and merge mesh_id_transforms from all input meshes.
    // Each mesh's coplanar_id is a triangle-local group index, so offset by tri_offset.
    let mut all_tri_refs: Vec<TriRef> = Vec::new();
    let mut merged_transforms = std::collections::BTreeMap::new();
    let mut tri_offset = 0i32;
    for mesh in meshes {
        let mesh_tri_count = mesh.num_tri() as i32;
        for tri_ref in &mesh.mesh_relation.tri_ref {
            all_tri_refs.push(TriRef {
                mesh_id: tri_ref.mesh_id,
                original_id: tri_ref.original_id,
                face_id: tri_ref.face_id,
                coplanar_id: tri_ref.coplanar_id + tri_offset,
            });
        }
        for (id, rel) in &mesh.mesh_relation.mesh_id_transform {
            merged_transforms.insert(*id, rel.clone());
        }
        tri_offset += mesh_tri_count;
    }

    let mut out = ManifoldImpl::new();
    out.vert_pos = vert_pos;
    out.num_prop = num_prop;
    out.properties = properties;
    out.create_halfedges(&tri_prop, &tri_vert);
    // Preserve tri_refs and transforms from input meshes instead of
    // calling initialize_original(), which would lose mesh transform data.
    out.mesh_relation.tri_ref = all_tri_refs;
    out.mesh_relation.mesh_id_transform = merged_transforms;
    out.mesh_relation.original_id = -1;
    out.calculate_bbox();
    out.set_epsilon(-1.0, false);
    // required to remove parts that are smaller than the tolerance (matches C++)
    crate::edge_op::remove_degenerates(&mut out, 0);
    out.sort_geometry();
    out.increment_mesh_ids();
    out.set_normals_and_coplanar();
    out
}

// ---------------------------------------------------------------------------
// boolean — public entry point
// ---------------------------------------------------------------------------

/// Perform a 3D boolean operation on two manifold meshes.
///
/// For overlapping meshes, uses the full Boolean3 intersection algorithm.
/// For disjoint meshes, uses fast-path shortcuts.
pub fn boolean(mesh_a: &ManifoldImpl, mesh_b: &ManifoldImpl, op: OpType) -> ManifoldImpl {
    boolean_with_token(mesh_a, mesh_b, op, None)
}

/// [`boolean`] with cooperative cancellation.
///
/// A cancelled operation yields an empty mesh whose `status` is
/// [`Error::Cancelled`], matching what C++ produces via `MakeEmpty(Cancelled)`
/// at every checkpoint (execution_impl.h:150-160, boolean_result.cpp:758-770).
pub fn boolean_with_token(
    mesh_a: &ManifoldImpl,
    mesh_b: &ManifoldImpl,
    op: OpType,
    token: Option<&CancelToken>,
) -> ManifoldImpl {
    // Entry gate: a token cancelled before the call wins over every fast path
    // below, including the empty-input ones. C++ does the same at its outermost
    // gates (csg_tree.cpp:172, execution_impl.cpp's static factories), so an
    // already-cancelled context never reports NoError.
    if is_cancelled(token) {
        return cancelled_impl();
    }
    // The exact engine's kernels assume complete halfedge pairing; soup
    // impls (robust import of non-manifold geometry) must use the robust
    // engine instead. Unreachable for all pre-existing callers: is_soup is
    // false everywhere outside the from_mesh_gl_robust path.
    if mesh_a.is_soup || mesh_b.is_soup {
        let mut out = ManifoldImpl::new();
        out.make_empty(Error::NotManifold);
        return out;
    }
    if mesh_a.is_empty() {
        return match op {
            OpType::Add => mesh_b.clone(),
            OpType::Intersect => ManifoldImpl::new(),
            OpType::Subtract => ManifoldImpl::new(),
        };
    }
    if mesh_b.is_empty() {
        return match op {
            OpType::Add | OpType::Subtract => mesh_a.clone(),
            OpType::Intersect => ManifoldImpl::new(),
        };
    }

    if !mesh_a.bbox.does_overlap_box(&mesh_b.bbox) {
        // Non-overlapping fast paths. For Subtract, we still run through the full
        // boolean_result to preserve both meshes' run metadata (C++ behavior).
        match op {
            OpType::Add => return compose_meshes(&[mesh_a.clone(), mesh_b.clone()]),
            OpType::Intersect => return ManifoldImpl::new(),
            OpType::Subtract => {} // fall through to full boolean
        }
    }

    // Full boolean — compute intersections
    let Some(bool3) = Boolean3::new_with_token(mesh_a, mesh_b, op, token) else {
        return cancelled_impl();
    };
    if !bool3.valid {
        return ManifoldImpl::new();
    }

    crate::boolean_result::boolean_result_with_token(mesh_a, mesh_b, op, &bool3, token)
}

/// Route a boolean to the requested engine (`types::BooleanEngine`).
///
/// `Auto` is clean-by-default: it picks the faster `Exact` engine only when
/// correctness is not at risk — i.e. when **both** operands are topologically
/// manifold (not soup) **and** free of self-intersection — no two of an
/// operand's own triangles crossing, overlapping, or coinciding. Either
/// condition failing routes the pair to `Robust`, because the exact engine's
/// kernels assume complete halfedge pairing and a non-self-intersecting
/// surface; on self-intersecting-but-manifold inputs it silently
/// mis-integrates the result (e.g. Thingi10K #92068's triple-wound
/// concentric shells).
///
/// The self-intersection test is cached per impl (see
/// [`crate::robust::soup::has_self_intersections`]), so an operand pays for
/// the scan at most once. `Exact` with a soup operand yields an empty result
/// with `Error::NotManifold` (the guard inside [`boolean_with_token`]); no
/// panic-catching is involved anywhere — dispatch is input-based only.
pub fn boolean_dispatch(
    mesh_a: &ManifoldImpl,
    mesh_b: &ManifoldImpl,
    op: OpType,
    engine: crate::types::BooleanEngine,
    token: Option<&CancelToken>,
) -> ManifoldImpl {
    boolean_dispatch_with_progress(mesh_a, mesh_b, op, engine, token, None)
}

/// [`boolean_dispatch`] with optional progress reporting (see
/// [`crate::progress`]).
///
/// The robust engine reports its pipeline phases; the exact engine reports a
/// single indeterminate `ExactBoolean` phase and is otherwise untouched, so
/// its timing and results are exactly what they were. `None` is byte-for-byte
/// [`boolean_dispatch`].
pub fn boolean_dispatch_with_progress(
    mesh_a: &ManifoldImpl,
    mesh_b: &ManifoldImpl,
    op: OpType,
    engine: crate::types::BooleanEngine,
    token: Option<&CancelToken>,
    progress: Option<&crate::progress::ProgressReporter>,
) -> ManifoldImpl {
    boolean_dispatch_full(
        mesh_a,
        mesh_b,
        op,
        engine,
        crate::types::WindingRule::Positive,
        token,
        progress,
    )
}

/// [`boolean_dispatch_with_progress`] with an explicit winding rule.
///
/// Winding rules are a robust-engine semantic: the exact engine has no cell
/// labels to reinterpret and **ignores** `rule` entirely. Because of that,
/// `Auto` with [`WindingRule::Nonzero`] resolves to `Robust` even for two
/// clean manifold operands — nonzero semantics can only be honored there, and
/// silently answering with positive-rule geometry would be worse than paying
/// for the robust pipeline. An explicit `Exact` still runs the exact engine,
/// rule and all, so a caller who pinned the engine gets exactly what it asked
/// for.
///
/// [`WindingRule::Positive`] is byte-for-byte
/// [`boolean_dispatch_with_progress`], including `Auto`'s resolution.
pub fn boolean_dispatch_full(
    mesh_a: &ManifoldImpl,
    mesh_b: &ManifoldImpl,
    op: OpType,
    engine: crate::types::BooleanEngine,
    rule: crate::types::WindingRule,
    token: Option<&CancelToken>,
    progress: Option<&crate::progress::ProgressReporter>,
) -> ManifoldImpl {
    use crate::types::BooleanEngine as E;
    use crate::types::WindingRule;
    let resolved = match engine {
        E::Auto => {
            use crate::robust::soup::has_self_intersections_with_token as self_isect;
            if rule == WindingRule::Nonzero
                || mesh_a.is_soup
                || mesh_b.is_soup
                || self_isect(mesh_a, token)
                || self_isect(mesh_b, token)
            {
                E::Robust
            } else {
                E::Exact
            }
        }
        other => other,
    };
    match resolved {
        E::Exact | E::Auto => {
            crate::progress::begin_phase(progress, crate::progress::Phase::ExactBoolean, 0);
            boolean_with_token(mesh_a, mesh_b, op, token)
        }
        E::Robust => {
            crate::robust::boolean_with_rule(mesh_a, mesh_b, op, rule, token, progress)
        }
    }
}

/// The observable result of an interrupted operation: an empty mesh carrying
/// [`Error::Cancelled`]. Mirrors C++ `MakeEmpty(Manifold::Error::Cancelled)`.
pub(crate) fn cancelled_impl() -> ManifoldImpl {
    let mut out = ManifoldImpl::new();
    out.make_empty(Error::Cancelled);
    out
}

/// Cast a ray segment from `origin` to `endpoint` against `mesh`, returning
/// all triangle intersections sorted by parametric distance.
///
/// Mirrors C++ `Manifold::Impl::RayCast(vec3, vec3)` in boolean3.cpp.
/// Builds a degenerate single-edge Impl representing the ray, then uses
/// Kernel12 (edge-face intersection) with the mesh BVH to find hits.
pub fn ray_cast(mesh: &ManifoldImpl, origin: Vec3, endpoint: Vec3) -> Vec<RayHit> {
    if mesh.is_empty() {
        return vec![];
    }
    let dir = endpoint - origin;
    if dot(dir, dir) == 0.0 {
        return vec![];
    }

    // Build a minimal single-edge Impl representing the ray segment.
    // halfedge[0]: forward (0→1), halfedge[1]: backward (1→0).
    let mut ray_impl = ManifoldImpl::new();
    ray_impl.vert_pos = vec![origin, endpoint];
    ray_impl.vert_normal = vec![Vec3::splat(0.0), Vec3::splat(0.0)];
    ray_impl.halfedge = vec![
        Halfedge { start_vert: 0, end_vert: 1, paired_halfedge: 1, prop_vert: 0 },
        Halfedge { start_vert: 1, end_vert: 0, paired_halfedge: 0, prop_vert: 0 },
    ];
    ray_impl.face_normal = vec![Vec3::splat(0.0)];

    // Query the mesh's cached face BVH (C++ RayCast uses collider_).
    let collider = &mesh.collider;

    // Ray AABB for BVH query.
    let ray_box = BBox::from_points(
        Vec3::new(origin.x.min(endpoint.x), origin.y.min(endpoint.y), origin.z.min(endpoint.z)),
        Vec3::new(origin.x.max(endpoint.x), origin.y.max(endpoint.y), origin.z.max(endpoint.z)),
    );

    // Determine which component axis is largest for stable t computation.
    let abs_dir = Vec3::new(dir.x.abs(), dir.y.abs(), dir.z.abs());
    let t_axis = if abs_dir.x > abs_dir.y && abs_dir.x > abs_dir.z {
        0usize
    } else if abs_dir.y > abs_dir.z {
        1
    } else {
        2
    };

    let mut hits: Vec<RayHit> = Vec::new();

    // Query BVH with ray AABB and test each candidate triangle.
    collider.collisions_with_boxes(std::slice::from_ref(&ray_box), false, |_qi, tri| {
        // halfedge 0 (forward) vs triangle tri; expand_p=false, forward=true.
        let (s, v) = kernel12(0, tri, &ray_impl, mesh, &ray_impl, mesh, false, true);
        if s != 0 && v.x.is_finite() {
            // Compute parametric t along the ray.
            let origin_t = [origin.x, origin.y, origin.z][t_axis];
            let dir_t = [dir.x, dir.y, dir.z][t_axis];
            let v_t = [v.x, v.y, v.z][t_axis];
            let t = (v_t - origin_t) / dir_t;
            if t >= 0.0 && t <= 1.0 {
                hits.push(RayHit {
                    face_id: tri as u64,
                    distance: t,
                    position: v,
                    normal: mesh.face_normal[tri],
                });
            }
        }
    });

    hits.sort_by(|a, b| a.distance.partial_cmp(&b.distance).unwrap_or(std::cmp::Ordering::Equal));
    hits
}

#[cfg(test)]
#[path = "boolean3_tests.rs"]
mod tests;
