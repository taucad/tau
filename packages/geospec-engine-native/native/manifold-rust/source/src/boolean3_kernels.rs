// boolean3_kernels.rs — the geometric kernels of the boolean intersection
// algorithm: shadow predicates (shadow01), the edge-edge / vertex-face /
// edge-face kernels (kernel11, kernel02, kernel12), and the two broadphase
// drivers built on them (intersect12, winding03).
//
// Ports the kernel portion of src/boolean3.cpp. Extracted from boolean3.rs,
// which owns the Boolean3 constructor pipeline and the public boolean()
// entry points; ray_cast (boolean3.rs) also reuses kernel12. These are the
// ONLY places where floating-point operations occur in the boolean
// algorithm. They are carefully designed to minimize rounding error and to
// eliminate it at edge cases. The branch structure must exactly match the
// C++ to produce identical results.

use std::collections::HashSet;

use crate::cancel::{is_cancelled, CancelToken};
use crate::disjoint_sets::DisjointSets;
use crate::impl_mesh::ManifoldImpl;
use crate::linalg::{Vec2, Vec3, Vec4};
use crate::types::Box as BBox;

use super::Intersections;

#[inline]
fn with_sign(pos: bool, v: f64) -> f64 {
    if pos { v } else { -v }
}

/// Interpolate along edge (aL, aR) at x-coordinate `x`.
/// Returns (y, z) at the interpolated point.
/// Uses the closer endpoint as the base to minimize rounding error.
fn interpolate(a_l: Vec3, a_r: Vec3, x: f64) -> Vec2 {
    let dx_l = x - a_l.x;
    let dx_r = x - a_r.x;
    debug_assert!(
        dx_l * dx_r <= 0.0,
        "Boolean manifold error: not in domain"
    );
    let use_l = dx_l.abs() < dx_r.abs();
    let d_lr = a_r - a_l;
    let lambda = (if use_l { dx_l } else { dx_r }) / d_lr.x;
    if !lambda.is_finite() || !d_lr.y.is_finite() || !d_lr.z.is_finite() {
        return Vec2::new(a_l.y, a_l.z);
    }
    Vec2::new(
        lambda * d_lr.y + if use_l { a_l.y } else { a_r.y },
        lambda * d_lr.z + if use_l { a_l.z } else { a_r.z },
    )
}

/// Find the intersection of two edges projected onto the yz-plane, parameterized
/// by their y-coordinates. Returns (x, y, z_a, z_b) at the intersection.
fn intersect_edges(a_l: Vec3, a_r: Vec3, b_l: Vec3, b_r: Vec3) -> Vec4 {
    let dy_l = b_l.y - a_l.y;
    let dy_r = b_r.y - a_r.y;
    debug_assert!(
        dy_l * dy_r <= 0.0,
        "Boolean manifold error: no intersection"
    );
    let use_l = dy_l.abs() < dy_r.abs();
    let dx = a_r.x - a_l.x;
    let mut lambda = (if use_l { dy_l } else { dy_r }) / (dy_l - dy_r);
    if !lambda.is_finite() {
        lambda = 0.0;
    }
    let x = lambda * dx + if use_l { a_l.x } else { a_r.x };
    let a_dy = a_r.y - a_l.y;
    let b_dy = b_r.y - b_l.y;
    let use_a = a_dy.abs() < b_dy.abs();
    let y = lambda * (if use_a { a_dy } else { b_dy })
        + if use_l {
            if use_a { a_l.y } else { b_l.y }
        } else if use_a {
            a_r.y
        } else {
            b_r.y
        };
    let z = lambda * (a_r.z - a_l.z) + if use_l { a_l.z } else { a_r.z };
    let w = lambda * (b_r.z - b_l.z) + if use_l { b_l.z } else { b_r.z };
    Vec4::new(x, y, z, w)
}

/// Symbolic perturbation shadow predicate.
/// When p == q, the tie is broken by the sign of dir.
#[inline]
fn shadows(p: f64, q: f64, dir: f64) -> bool {
    if p == q { dir < 0.0 } else { p < q }
}

// ---------------------------------------------------------------------------
// Shadow01 — vertex-edge shadow test
// ---------------------------------------------------------------------------
// Tests whether vertex a0 of mesh A shadows edge b1 of mesh B.
// Returns (winding contribution, (y,z) interpolated position).

fn shadow01(
    a0: usize,
    b1: usize,
    in_a: &ManifoldImpl,
    in_b: &ManifoldImpl,
    expand_p: bool,
    forward: bool,
) -> (i32, Vec2) {
    let b1s = in_b.halfedge[b1].start_vert as usize;
    let b1e = in_b.halfedge[b1].end_vert as usize;
    let a0x = in_a.vert_pos[a0].x;
    let b1sx = in_b.vert_pos[b1s].x;
    let b1ex = in_b.vert_pos[b1e].x;
    let a0xp = in_a.vert_normal[a0].x;
    let b1sxp = in_b.vert_normal[b1s].x;
    let b1exp = in_b.vert_normal[b1e].x;

    let mut s01 = if forward {
        shadows(a0x, b1ex, with_sign(expand_p, a0xp) - b1exp) as i32
            - shadows(a0x, b1sx, with_sign(expand_p, a0xp) - b1sxp) as i32
    } else {
        shadows(b1sx, a0x, with_sign(expand_p, b1sxp) - a0xp) as i32
            - shadows(b1ex, a0x, with_sign(expand_p, b1exp) - a0xp) as i32
    };

    let mut yz01 = Vec2::new(f64::NAN, f64::NAN);

    if s01 != 0 {
        yz01 = interpolate(in_b.vert_pos[b1s], in_b.vert_pos[b1e], in_a.vert_pos[a0].x);
        let b1pair = in_b.halfedge[b1].paired_halfedge as usize;
        let dir = in_b.face_normal[b1 / 3].y + in_b.face_normal[b1pair / 3].y;
        if forward {
            if !shadows(in_a.vert_pos[a0].y, yz01.x, -dir) {
                s01 = 0;
            }
        } else if !shadows(yz01.x, in_a.vert_pos[a0].y, with_sign(expand_p, dir)) {
            s01 = 0;
        }
    }
    (s01, yz01)
}

// ---------------------------------------------------------------------------
// Kernel11 — edge-edge intersection
// ---------------------------------------------------------------------------

fn kernel11(
    p1: usize,
    q1: usize,
    in_p: &ManifoldImpl,
    in_q: &ManifoldImpl,
    expand_p: bool,
) -> (i32, Vec4) {
    let xyzz11;
    let mut s11: i32 = 0;

    let mut k: usize = 0;
    let mut p_rl = [Vec3::splat(0.0); 2];
    let mut q_rl = [Vec3::splat(0.0); 2];
    let mut shadow_state = false;

    let p0 = [
        in_p.halfedge[p1].start_vert as usize,
        in_p.halfedge[p1].end_vert as usize,
    ];
    for i in 0..2 {
        let (s01, yz01) = shadow01(p0[i], q1, in_p, in_q, expand_p, true);
        if yz01.x.is_finite() {
            s11 += s01 * if i == 0 { -1 } else { 1 };
            if k < 2 && (k == 0 || (s01 != 0) != shadow_state) {
                shadow_state = s01 != 0;
                p_rl[k] = in_p.vert_pos[p0[i]];
                q_rl[k] = Vec3::new(p_rl[k].x, yz01.x, yz01.y);
                k += 1;
            }
        }
    }

    let q0 = [
        in_q.halfedge[q1].start_vert as usize,
        in_q.halfedge[q1].end_vert as usize,
    ];
    for i in 0..2 {
        let (s10, yz10) = shadow01(q0[i], p1, in_q, in_p, expand_p, false);
        if yz10.x.is_finite() {
            s11 += s10 * if i == 0 { -1 } else { 1 };
            if k < 2 && (k == 0 || (s10 != 0) != shadow_state) {
                shadow_state = s10 != 0;
                q_rl[k] = in_q.vert_pos[q0[i]];
                p_rl[k] = Vec3::new(q_rl[k].x, yz10.x, yz10.y);
                k += 1;
            }
        }
    }

    if s11 == 0 {
        xyzz11 = Vec4::splat(f64::NAN);
    } else {
        debug_assert_eq!(k, 2, "Boolean manifold error: s11");
        xyzz11 = intersect_edges(p_rl[0], p_rl[1], q_rl[0], q_rl[1]);

        let p1pair = in_p.halfedge[p1].paired_halfedge as usize;
        let dir_p = in_p.face_normal[p1 / 3].z + in_p.face_normal[p1pair / 3].z;
        let q1pair = in_q.halfedge[q1].paired_halfedge as usize;
        let dir_q = in_q.face_normal[q1 / 3].z + in_q.face_normal[q1pair / 3].z;
        if !shadows(xyzz11.z, xyzz11.w, with_sign(expand_p, dir_p) - dir_q) {
            s11 = 0;
        }
    }

    (s11, xyzz11)
}

// ---------------------------------------------------------------------------
// Kernel02 — vertex-face intersection
// ---------------------------------------------------------------------------

fn kernel02(
    a0: usize,
    b2: usize,
    in_a: &ManifoldImpl,
    in_b: &ManifoldImpl,
    expand_p: bool,
    forward: bool,
) -> (i32, f64) {
    let mut s02: i32 = 0;
    let z02: f64;

    let mut k: usize = 0;
    let mut yzz_rl = [Vec3::splat(0.0); 2];
    let mut shadow_state = false;

    for i in 0..3 {
        let b1 = 3 * b2 + i;
        let edge_b = in_b.halfedge[b1];
        let b1f = if edge_b.is_forward() {
            b1
        } else {
            edge_b.paired_halfedge as usize
        };

        let (s01, yz01) = shadow01(a0, b1f, in_a, in_b, expand_p, forward);
        if yz01.x.is_finite() {
            s02 += s01 * if forward == edge_b.is_forward() { -1 } else { 1 };
            if k < 2 && (k == 0 || (s01 != 0) != shadow_state) {
                shadow_state = s01 != 0;
                yzz_rl[k] = Vec3::new(yz01.x, yz01.y, yz01.y);
                k += 1;
            }
        }
    }

    if s02 == 0 {
        z02 = f64::NAN;
    } else {
        debug_assert_eq!(k, 2, "Boolean manifold error: s02");
        let vert_pos_a = in_a.vert_pos[a0];
        z02 = interpolate(yzz_rl[0], yzz_rl[1], vert_pos_a.y).y;
        if forward {
            if !shadows(vert_pos_a.z, z02, -in_b.face_normal[b2].z) {
                s02 = 0;
            }
        } else if !shadows(z02, vert_pos_a.z, with_sign(expand_p, in_b.face_normal[b2].z)) {
            s02 = 0;
        }
    }
    (s02, z02)
}

// ---------------------------------------------------------------------------
// Kernel12 — edge-face intersection
// ---------------------------------------------------------------------------

pub(super) fn kernel12(
    a1: usize,
    b2: usize,
    in_a: &ManifoldImpl,
    in_b: &ManifoldImpl,
    in_p: &ManifoldImpl,
    in_q: &ManifoldImpl,
    expand_p: bool,
    forward: bool,
) -> (i32, Vec3) {
    let mut x12: i32 = 0;
    let mut v12 = Vec3::splat(f64::NAN);

    let mut k: usize = 0;
    let mut xzy_lr0 = [Vec3::splat(0.0); 2];
    let mut xzy_lr1 = [Vec3::splat(0.0); 2];
    let mut shadow_state = false;

    let edge_a = in_a.halfedge[a1];

    for vert_a in [edge_a.start_vert as usize, edge_a.end_vert as usize] {
        let (s, z) = kernel02(vert_a, b2, in_a, in_b, expand_p, forward);
        if z.is_finite() {
            x12 += s * if (vert_a == edge_a.start_vert as usize) == forward { 1 } else { -1 };
            if k < 2 && (k == 0 || (s != 0) != shadow_state) {
                shadow_state = s != 0;
                let pos = in_a.vert_pos[vert_a];
                xzy_lr0[k] = Vec3::new(pos.x, pos.z, pos.y);
                xzy_lr1[k] = xzy_lr0[k];
                xzy_lr1[k].y = z;
                k += 1;
            }
        }
    }

    for i in 0..3 {
        let b1 = 3 * b2 + i;
        let edge_b = in_b.halfedge[b1];
        let b1f = if edge_b.is_forward() {
            b1
        } else {
            edge_b.paired_halfedge as usize
        };
        let (s, xyzz) = if forward {
            kernel11(a1, b1f, in_p, in_q, expand_p)
        } else {
            kernel11(b1f, a1, in_p, in_q, expand_p)
        };
        if xyzz.x.is_finite() {
            x12 -= s * if edge_b.is_forward() { 1 } else { -1 };
            if k < 2 && (k == 0 || (s != 0) != shadow_state) {
                shadow_state = s != 0;
                xzy_lr0[k] = Vec3::new(xyzz.x, xyzz.z, xyzz.y);
                xzy_lr1[k] = xzy_lr0[k];
                xzy_lr1[k].y = xyzz.w;
                if !forward {
                    let tmp = xzy_lr0[k].y;
                    xzy_lr0[k].y = xzy_lr1[k].y;
                    xzy_lr1[k].y = tmp;
                }
                k += 1;
            }
        }
    }

    if x12 == 0 {
        v12 = Vec3::splat(f64::NAN);
    } else {
        debug_assert_eq!(k, 2, "Boolean manifold error: v12");
        let xzyy = intersect_edges(xzy_lr0[0], xzy_lr0[1], xzy_lr1[0], xzy_lr1[1]);
        v12.x = xzyy.x;
        v12.y = xzyy.z;
        v12.z = xzyy.y;
    }
    (x12, v12)
}

// ---------------------------------------------------------------------------
// Intersect12 — find all edge-face intersections using collider broadphase
// ---------------------------------------------------------------------------

/// `None` means `token` was cancelled part-way through; the partial results are
/// discarded, mirroring C++ `Intersect12` returning `Intersections{}` after its
/// post-`for_each` `IsCancelled` check (boolean3.cpp:380-381).
pub(super) fn intersect12(
    in_p: &ManifoldImpl,
    in_q: &ManifoldImpl,
    expand_p: bool,
    forward: bool,
    token: Option<&CancelToken>,
) -> Option<Intersections> {
    // a: edge mesh, b: face mesh
    let (a, b) = if forward { (in_p, in_q) } else { (in_q, in_p) };

    // Query b's cached face BVH (built in sort_geometry), as C++ queries
    // b.collider_ — rebuilding here dominated the intersection stage.
    let collider = &b.collider;

    let mut result = Intersections::default();

    // For each forward edge of a, query its bounding box against b's face BVH
    // and run kernel12 on each candidate. Per-edge work is independent and the
    // final stable sort below fully orders the unique (edge, face) pairs, so
    // the parallel path is bit-identical to the sequential one.
    let n = a.halfedge.len();
    let per_edge: Vec<Vec<([i32; 2], i32, Vec3)>> =
        crate::par::maybe_par_map_ct(n, 10_000, token, |query_idx| {
            let mut local: Vec<([i32; 2], i32, Vec3)> = Vec::new();
            if !a.halfedge[query_idx].is_forward() {
                return local;
            }
            let query = BBox::from_points(
                a.vert_pos[a.halfedge[query_idx].start_vert as usize],
                a.vert_pos[a.halfedge[query_idx].end_vert as usize],
            );
            collider.collisions_one(&query, query_idx, |query_idx, face_idx| {
                let (x, v) =
                    kernel12(query_idx, face_idx, a, b, in_p, in_q, expand_p, forward);
                if v.x.is_finite() {
                    let pair = if forward {
                        [query_idx as i32, face_idx as i32]
                    } else {
                        [face_idx as i32, query_idx as i32]
                    };
                    local.push((pair, x, v));
                }
            });
            local
        })?;
    for local in per_edge {
        for (pair, x, v) in local {
            result.p1q2.push(pair);
            result.x12.push(x);
            result.v12.push(v);
        }
    }

    // C++'s stated invariant is "every ctx-passing parallel op is followed by
    // IsCancelled to discard partial results" (boolean3.cpp:364). Honouring it
    // here also skips the sort below, which is the longest uninterruptible
    // stretch in this function.
    if is_cancelled(token) {
        return None;
    }

    // Sort by edge index for deterministic results
    let mut indices: Vec<usize> = (0..result.p1q2.len()).collect();
    let sort_idx = if forward { 0 } else { 1 };
    indices.sort_by(|&a, &b| {
        let pa = result.p1q2[a];
        let pb = result.p1q2[b];
        pa[sort_idx]
            .cmp(&pb[sort_idx])
            .then(pa[1 - sort_idx].cmp(&pb[1 - sort_idx]))
    });

    let old_p1q2 = result.p1q2.clone();
    let old_x12 = result.x12.clone();
    let old_v12 = result.v12.clone();
    for (new_i, &old_i) in indices.iter().enumerate() {
        result.p1q2[new_i] = old_p1q2[old_i];
        result.x12[new_i] = old_x12[old_i];
        result.v12[new_i] = old_v12[old_i];
    }

    Some(result)
}

// ---------------------------------------------------------------------------
// Winding03 — compute winding numbers via flood-fill
// ---------------------------------------------------------------------------
// Groups vertices into connected components along unbroken edges (edges not
// cut by any intersection). For each component, picks a representative vertex
// and computes its winding number via kernel02 against all overlapping faces
// of the other mesh. Then flood-fills that winding number to all vertices in
// the component.

/// `None` means `token` was cancelled part-way through; the partial winding
/// numbers are discarded, mirroring C++ `Winding03` returning `Vec<int>{}` at
/// each of its `IsCancelled` checks (boolean3.cpp:437, 456, 472, 480).
pub(super) fn winding03(
    in_p: &ManifoldImpl,
    in_q: &ManifoldImpl,
    p1q2: &[[i32; 2]],
    expand_p: bool,
    forward: bool,
    token: Option<&CancelToken>,
) -> Option<Vec<i32>> {
    let (a, b) = if forward { (in_p, in_q) } else { (in_q, in_p) };
    let sort_idx = if forward { 0 } else { 1 };

    // Build union-find: unite vertices along unbroken edges. This loop is the
    // Rust counterpart of the ctx-passing `for_each` at boolean3.cpp:425, so it
    // gets the same bounded-latency check — but on a chunk boundary rather than
    // per element, because the body is a cheap binary search and `unite`.
    let u_a = DisjointSets::new(a.vert_pos.len() as u32);
    // Hoisted so the uncancellable path pays one predictable branch per edge
    // instead of a modulo: C++ gets the same effect from `ctx == nullptr`
    // folding the check out of the loop entirely (parallel.h:427-430).
    let cancellable = token.is_some();
    for edge in 0..a.halfedge.len() {
        // C++ `for_each` checks every kSeqCancelChunk (= 1024) elements on the
        // sequential branch (parallel.h:424); same constant, same reason.
        if cancellable && edge % 1024 == 0 && is_cancelled(token) {
            return None;
        }
        let he = &a.halfedge[edge];
        if !he.is_forward() {
            continue;
        }
        // Check if this edge is broken (has an intersection)
        let is_broken = p1q2
            .binary_search_by(|pair| pair[sort_idx].cmp(&(edge as i32)))
            .is_ok();
        if !is_broken {
            u_a.unite(he.start_vert as u32, he.end_vert as u32);
        }
    }

    // Post-loop check, matching C++ boolean3.cpp:437.
    if is_cancelled(token) {
        return None;
    }

    // Find unique component representatives
    let mut components = HashSet::new();
    for v in 0..a.vert_pos.len() {
        components.insert(u_a.find(v as u32));
    }
    let verts: Vec<usize> = components.into_iter().map(|v| v as usize).collect();

    // Post-scan check, matching C++ boolean3.cpp:456.
    if is_cancelled(token) {
        return None;
    }

    // Query b's cached face BVH (built in sort_geometry), as C++ queries
    // b.collider_.
    let collider = &b.collider;

    // For each representative vertex, compute winding number via kernel02
    let mut w03 = vec![0i32; a.vert_pos.len()];

    // Use BVH for winding number queries.
    // The winding number shoots a Z-ray, so we need XY overlap with infinite Z.
    // Build query boxes with the vertex XY position and infinite Z extent.
    let query_boxes: Vec<(usize, BBox)> = verts.iter().map(|&vi| {
        let pt = a.vert_pos[vi];
        let qbox = BBox::from_points(
            Vec3::new(pt.x, pt.y, f64::NEG_INFINITY),
            Vec3::new(pt.x, pt.y, f64::INFINITY),
        );
        (vi, qbox)
    }).collect();

    // For each representative vert, query the BVH and sum kernel02 winding
    // contributions. The sums are integers, so accumulation order is
    // irrelevant and the per-vert work can run in parallel bit-exactly.
    let sums: Vec<(usize, i32)> =
        crate::par::maybe_par_map_ct(query_boxes.len(), 1_000, token, |qi| {
            let (vi, ref qbox) = query_boxes[qi];
            let mut sum = 0i32;
            collider.collisions_one(qbox, 0, |_qi, face_idx| {
                let (s02, z02) = kernel02(vi, face_idx, a, b, expand_p, forward);
                if z02.is_finite() {
                    sum += s02 * if forward { 1 } else { -1 };
                }
            });
            (vi, sum)
        })?;
    for (vi, sum) in sums {
        w03[vi] += sum;
    }

    // Flood fill: propagate representative's winding number to all component members
    for i in 0..w03.len() {
        let root = u_a.find(i as u32) as usize;
        if root != i {
            w03[i] = w03[root];
        }
    }

    Some(w03)
}
