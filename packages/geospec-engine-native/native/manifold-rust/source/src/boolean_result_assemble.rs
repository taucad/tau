// Boolean result assembly — extracted from boolean_result.rs
// Contains update_reference, create_properties, and boolean_result entry point

use std::collections::BTreeMap;

use crate::boolean3::Boolean3;
use crate::cancel::{is_cancelled, CancelToken};
use crate::edge_op::simplify_topology;
use crate::face_op::{face2tri_ct, get_barycentric, reorder_halfedges};
use crate::impl_mesh::{reserve_ids, ManifoldImpl};
use crate::linalg::Vec3;
use crate::types::{OpType, TriRef};

use super::{EdgePos, abs_sum, exclusive_scan_abs,
            size_output, add_new_edge_verts, append_partial_edges,
            append_new_edges, append_whole_edges};

// ---------------------------------------------------------------------------
// UpdateReference -- map tri refs from input meshes to output
// ---------------------------------------------------------------------------

pub(super) fn update_reference(out_r: &mut ManifoldImpl, in_p: &ManifoldImpl, in_q: &ManifoldImpl, invert_q: bool) {
    let offset_q = reserve_ids(in_q.mesh_relation.mesh_id_transform.len() as u32) as i32;

    for tri_ref in out_r.mesh_relation.tri_ref.iter_mut() {
        let tri = tri_ref.face_id;
        let pq = tri_ref.mesh_id == 0;
        if pq {
            if (tri as usize) < in_p.mesh_relation.tri_ref.len() {
                *tri_ref = in_p.mesh_relation.tri_ref[tri as usize];
            }
        } else {
            if (tri as usize) < in_q.mesh_relation.tri_ref.len() {
                *tri_ref = in_q.mesh_relation.tri_ref[tri as usize];
                tri_ref.mesh_id += offset_q;
            }
        }
    }

    for (&k, v) in &in_p.mesh_relation.mesh_id_transform {
        out_r.mesh_relation.mesh_id_transform.insert(k, v.clone());
    }
    for (&k, v) in &in_q.mesh_relation.mesh_id_transform {
        let mut rel = v.clone();
        rel.back_side ^= invert_q;
        out_r.mesh_relation.mesh_id_transform.insert(k + offset_q, rel);
    }
}

// ---------------------------------------------------------------------------
// CreateProperties -- barycentric interpolation of properties
// ---------------------------------------------------------------------------

pub(super) fn create_properties(out_r: &mut ManifoldImpl, in_p: &ManifoldImpl, in_q: &ManifoldImpl, invert_q: bool) {
    let num_prop_p = in_p.num_prop;
    let num_prop_q = in_q.num_prop;
    let num_prop = num_prop_p.max(num_prop_q);
    out_r.num_prop = num_prop;
    if num_prop == 0 {
        return;
    }

    let num_tri = out_r.num_tri();

    // Compute barycentric coordinates for each output halfedge
    let mut bary = vec![Vec3::splat(0.0); out_r.halfedge.len()];
    for tri in 0..num_tri {
        let ref_pq = out_r.mesh_relation.tri_ref[tri];
        if out_r.halfedge[3 * tri].start_vert < 0 {
            continue;
        }

        let tri_pq = ref_pq.face_id as usize;
        let pq = ref_pq.mesh_id == 0;
        let vert_pos = if pq { &in_p.vert_pos } else { &in_q.vert_pos };
        let halfedge = if pq { &in_p.halfedge } else { &in_q.halfedge };

        if 3 * tri_pq + 2 >= halfedge.len() {
            continue;
        }

        let tri_pos = [
            vert_pos[halfedge[3 * tri_pq].start_vert as usize],
            vert_pos[halfedge[3 * tri_pq + 1].start_vert as usize],
            vert_pos[halfedge[3 * tri_pq + 2].start_vert as usize],
        ];

        for i in 0..3 {
            let vert = out_r.halfedge[3 * tri + i].start_vert;
            if vert >= 0 && (vert as usize) < out_r.vert_pos.len() {
                bary[3 * tri + i] = get_barycentric(out_r.vert_pos[vert as usize], tri_pos, out_r.epsilon);
            }
        }
    }

    // Build properties with deduplication (matches C++ CreateProperties)
    out_r.properties.clear();
    out_r.properties.reserve(out_r.num_vert() * num_prop);
    let mut idx = 0i32;

    // Property vertex deduplication structures
    let id_miss_prop = out_r.num_vert() as i32;
    // propIdx: indexed by output vertex; bins hold ([pq, key_z, key_w], prop_idx)
    let mut prop_idx: Vec<Vec<([i32; 3], i32)>> = vec![Vec::new(); out_r.num_vert() + 1];
    // propMissIdx: [0] for mesh Q, [1] for mesh P -- indexed by source propVert
    let mut prop_miss_idx: [Vec<i32>; 2] = [
        vec![-1i32; in_q.num_prop_vert()],
        vec![-1i32; in_p.num_prop_vert()],
    ];

    #[inline]
    fn next3(i: usize) -> usize { (i + 1) % 3 }
    #[inline]
    fn prev3(i: usize) -> usize { (i + 2) % 3 }

    for tri in 0..num_tri {
        if out_r.halfedge[3 * tri].start_vert < 0 {
            continue;
        }
        let ref_pq = out_r.mesh_relation.tri_ref[tri];
        let pq = ref_pq.mesh_id == 0;
        let pq_flag: i32 = if pq { 0 } else { 1 };
        let old_num_prop = if pq { num_prop_p } else { num_prop_q };
        let properties = if pq { &in_p.properties } else { &in_q.properties };
        let halfedge = if pq { &in_p.halfedge } else { &in_q.halfedge };

        // Per #1718: for Subtract, Q's triangles are flipped in the result, so
        // Q's world-frame vertex normals (slot 0..2 when hasNormals) need a
        // sign flip to point outward from the result's solid (into the cavity).
        // Check is per-source-triangle — in_q may itself be a mixed Boolean
        // result with only some meshIDs carrying normals.
        let negate_normals = !pq
            && invert_q
            && old_num_prop >= 3
            && in_q.tri_has_normals(ref_pq.face_id as usize);

        for i in 0..3 {
            let vert = out_r.halfedge[3 * tri + i].start_vert;
            let uvw = bary[3 * tri + i];

            // Build dedup key: [pq_flag, vert_key, key_z, key_w]
            let mut key = [pq_flag, id_miss_prop, -1i32, -1i32];
            if old_num_prop > 0 && 3 * ref_pq.face_id as usize + 2 < halfedge.len() {
                let mut edge: i32 = -2;
                for j in 0..3usize {
                    if uvw[j] == 1.0 {
                        // On a retained vertex
                        key[2] = halfedge[3 * ref_pq.face_id as usize + j].prop_vert;
                        edge = -1;
                        break;
                    }
                    if uvw[j] == 0.0 {
                        edge = j as i32;
                    }
                }
                if edge >= 0 {
                    // On an edge: both prop verts must match
                    let p0 = halfedge[3 * ref_pq.face_id as usize + next3(edge as usize)].prop_vert;
                    let p1 = halfedge[3 * ref_pq.face_id as usize + prev3(edge as usize)].prop_vert;
                    key[1] = vert;
                    key[2] = p0.min(p1);
                    key[3] = p0.max(p1);
                } else if edge == -2 {
                    // Interior point
                    key[1] = vert;
                }
            }

            // Attempt dedup lookup
            let mut found = false;
            if key[1] == id_miss_prop && key[2] >= 0 {
                // Vertex case: use propMissIdx
                let pq_idx = key[0] as usize;
                let prop_key = key[2] as usize;
                if pq_idx < 2 && prop_key < prop_miss_idx[pq_idx].len() {
                    let entry = prop_miss_idx[pq_idx][prop_key];
                    if entry >= 0 {
                        out_r.halfedge[3 * tri + i].prop_vert = entry;
                        found = true;
                    } else {
                        prop_miss_idx[pq_idx][prop_key] = idx;
                    }
                }
            } else {
                // Edge/interior case: use propIdx
                let bin_idx = key[1] as usize;
                if bin_idx < prop_idx.len() {
                    let search_key = [key[0], key[2], key[3]];
                    if let Some(entry) = prop_idx[bin_idx].iter().find(|(k, _)| *k == search_key) {
                        out_r.halfedge[3 * tri + i].prop_vert = entry.1;
                        found = true;
                    } else {
                        prop_idx[bin_idx].push((search_key, idx));
                    }
                }
            }

            if found {
                continue;
            }

            // No dedup match -- assign new property vertex and interpolate
            out_r.halfedge[3 * tri + i].prop_vert = idx;
            idx += 1;

            for p in 0..num_prop {
                if p < old_num_prop && 3 * ref_pq.face_id as usize + 2 < halfedge.len() {
                    let mut old_props = [0.0f64; 3];
                    for j in 0..3 {
                        let prop_vert = halfedge[3 * ref_pq.face_id as usize + j].prop_vert;
                        if prop_vert >= 0 {
                            let prop_idx_val = old_num_prop * prop_vert as usize + p;
                            if prop_idx_val < properties.len() {
                                old_props[j] = properties[prop_idx_val];
                            }
                        }
                    }
                    let mut val = uvw.x * old_props[0] + uvw.y * old_props[1] + uvw.z * old_props[2];
                    if negate_normals && p < 3 {
                        val = -val;
                    }
                    out_r.properties.push(val);
                } else {
                    out_r.properties.push(0.0);
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// boolean_result -- the main entry point
// ---------------------------------------------------------------------------

/// Assemble the output mesh from Boolean3 intersection data.
///
/// This is the Rust port of `Boolean3::Result()` from `boolean_result.cpp`.
pub fn boolean_result(
    in_p: &ManifoldImpl,
    in_q: &ManifoldImpl,
    op: OpType,
    bool3: &Boolean3,
) -> ManifoldImpl {
    boolean_result_with_token(in_p, in_q, op, bool3, None)
}

/// [`boolean_result`] with cooperative cancellation, returning an empty mesh
/// with `Error::Cancelled` if `token` fires.
///
/// Check placement mirrors the `phase()` sites of C++ `Boolean3::Result`
/// (boolean_result.cpp:758-963): one at every boundary between the assembly
/// stages, each of which does `MakeEmpty(Cancelled); return`. Partial output is
/// intentionally discarded rather than published.
pub fn boolean_result_with_token(
    in_p: &ManifoldImpl,
    in_q: &ManifoldImpl,
    op: OpType,
    bool3: &Boolean3,
    token: Option<&CancelToken>,
) -> ManifoldImpl {
    debug_assert!(
        bool3.expand_p == (op == OpType::Add),
        "Result op type not compatible with constructor op type."
    );

    let c1 = if op == OpType::Intersect { 0 } else { 1 };
    let c2 = if op == OpType::Add { 1 } else { 0 };
    let c3 = if op == OpType::Intersect { 1 } else { -1 };

    // Early returns for empty inputs (matches C++ boolean_result.cpp lines 680-690)
    if in_p.is_empty() {
        if !in_q.is_empty() && op == OpType::Add {
            return in_q.clone();
        }
        return ManifoldImpl::new();
    } else if in_q.is_empty() {
        if op == OpType::Intersect {
            return ManifoldImpl::new();
        }
        return in_p.clone();
    }

    // Check for valid (overflow) result
    if !bool3.valid {
        return ManifoldImpl::new();
    }

    let invert_q = op == OpType::Subtract;

    // Phase 1 (C++ boolean_result.cpp:776): the trivial early returns above run
    // first, exactly as in C++, where the IsEmpty fast-paths precede the first
    // phase() site.
    if is_cancelled(token) {
        return crate::boolean3::cancelled_impl();
    }

    // Timing boundaries mirror the C++ MANIFOLD_TIMING stages (Assembly /
    // Triangulation / Simplification / Sorting) for side-by-side comparison.
    let t_assembly = crate::timing::start();

    // Convert winding numbers to inclusion values
    let i12: Vec<i32> = bool3.xv12.x12.iter().map(|&v| c3 * v).collect();
    let i21: Vec<i32> = bool3.xv21.x12.iter().map(|&v| c3 * v).collect();
    let i03: Vec<i32> = bool3.w03.iter().map(|&v| c1 + c3 * v).collect();
    let i30: Vec<i32> = bool3.w30.iter().map(|&v| c2 + c3 * v).collect();

    // Vertex remapping via exclusive scan with abs_sum
    let vp2r = exclusive_scan_abs(&i03, 0);
    let num_vert_r = if let Some(&last) = i03.last() {
        abs_sum(*vp2r.last().unwrap_or(&0), last)
    } else {
        0
    };
    let n_pv = num_vert_r;

    let vq2r = exclusive_scan_abs(&i30, num_vert_r);
    let num_vert_r = if let Some(&last) = i30.last() {
        abs_sum(*vq2r.last().unwrap_or(&num_vert_r), last)
    } else {
        num_vert_r
    };
    let n_qv = num_vert_r - n_pv;

    let v12r = if !bool3.xv12.v12.is_empty() {
        exclusive_scan_abs(&i12, num_vert_r)
    } else {
        Vec::new()
    };
    let num_vert_r = if !i12.is_empty() {
        abs_sum(*v12r.last().unwrap_or(&num_vert_r), *i12.last().unwrap())
    } else {
        num_vert_r
    };
    let n12 = num_vert_r - n_pv - n_qv;

    let v21r = if !bool3.xv21.v12.is_empty() {
        exclusive_scan_abs(&i21, num_vert_r)
    } else {
        Vec::new()
    };
    let num_vert_r = if !i21.is_empty() {
        abs_sum(*v21r.last().unwrap_or(&num_vert_r), *i21.last().unwrap())
    } else {
        num_vert_r
    };
    let _n21 = num_vert_r - n_pv - n_qv - n12;

    // Create the output Manifold
    let mut out_r = ManifoldImpl::new();
    if num_vert_r == 0 {
        return out_r;
    }

    out_r.epsilon = in_p.epsilon.max(in_q.epsilon);
    out_r.tolerance = in_p.tolerance.max(in_q.tolerance);

    // Allocate and populate output vertices
    out_r.vert_pos.resize(num_vert_r as usize, Vec3::splat(0.0));

    // DuplicateVerts: retained vertices from P
    for vert in 0..in_p.num_vert() {
        let n = i03[vert].abs();
        for i in 0..n {
            out_r.vert_pos[(vp2r[vert] + i) as usize] = in_p.vert_pos[vert];
        }
    }
    // Retained vertices from Q
    for vert in 0..in_q.num_vert() {
        let n = i30[vert].abs();
        for i in 0..n {
            out_r.vert_pos[(vq2r[vert] + i) as usize] = in_q.vert_pos[vert];
        }
    }
    // New vertices from P edges -> Q faces
    for vert in 0..i12.len() {
        let n = i12[vert].abs();
        for i in 0..n {
            out_r.vert_pos[(v12r[vert] + i) as usize] = bool3.xv12.v12[vert];
        }
    }
    // New vertices from Q edges -> P faces
    for vert in 0..i21.len() {
        let n = i21[vert].abs();
        for i in 0..n {
            out_r.vert_pos[(v21r[vert] + i) as usize] = bool3.xv21.v12[vert];
        }
    }

    // Phase 2 (C++ boolean_result.cpp:847): after DuplicateVerts.
    if is_cancelled(token) {
        return crate::boolean3::cancelled_impl();
    }

    // Build edge maps
    let mut edges_p: BTreeMap<i32, Vec<EdgePos>> = BTreeMap::new();
    let mut edges_q: BTreeMap<i32, Vec<EdgePos>> = BTreeMap::new();
    let mut edges_new: BTreeMap<(i32, i32), Vec<EdgePos>> = BTreeMap::new();

    add_new_edge_verts(
        &mut edges_p,
        &mut edges_new,
        &bool3.xv12.p1q2,
        &i12,
        &v12r,
        &in_p.halfedge,
        true,
        0,
    );
    add_new_edge_verts(
        &mut edges_q,
        &mut edges_new,
        &bool3.xv21.p1q2,
        &i21,
        &v21r,
        &in_q.halfedge,
        false,
        bool3.xv12.p1q2.len(),
    );

    // C++ clears v12R/v21R here (after AddNewEdgeVerts); drop the counterparts
    // so the large scans don't ride through the rest of the pipeline.
    drop(v12r);
    drop(v21r);

    // Phase 3 (C++ boolean_result.cpp:869): after AddNewEdgeVerts.
    if is_cancelled(token) {
        return crate::boolean3::cancelled_impl();
    }

    // Size output
    let (face_edge, face_pq2r) = size_output(
        &mut out_r,
        in_p,
        in_q,
        &i03,
        &i30,
        &i12,
        &i21,
        &bool3.xv12.p1q2,
        &bool3.xv21.p1q2,
        invert_q,
    );

    // C++ clears i12/i21 after SizeOutput.
    drop(i12);
    drop(i21);

    // Phase 4 (C++ boolean_result.cpp:880): after SizeOutput.
    if is_cancelled(token) {
        return crate::boolean3::cancelled_impl();
    }

    // Assemble edges
    let mut face_ptr_r = face_edge.clone();
    let mut whole_halfedge_p = vec![true; in_p.halfedge.len()];
    let mut whole_halfedge_q = vec![true; in_q.halfedge.len()];
    let mut halfedge_ref = vec![
        TriRef {
            mesh_id: 0,
            original_id: -1,
            face_id: -1,
            coplanar_id: -1,
        };
        2 * out_r.num_edge()
    ];

    append_partial_edges(
        &mut out_r,
        &mut whole_halfedge_p,
        &mut face_ptr_r,
        &mut edges_p,
        &mut halfedge_ref,
        in_p,
        &i03,
        &vp2r,
        &face_pq2r[..in_p.num_tri()],
        true,
    );
    append_partial_edges(
        &mut out_r,
        &mut whole_halfedge_q,
        &mut face_ptr_r,
        &mut edges_q,
        &mut halfedge_ref,
        in_q,
        &i30,
        &vq2r,
        &face_pq2r[in_p.num_tri()..],
        false,
    );
    // C++ clears edgesP/edgesQ after AppendPartialEdges.
    drop(edges_p);
    drop(edges_q);

    // Phase 5 (C++ boolean_result.cpp:905): after AppendPartialEdges.
    if is_cancelled(token) {
        return crate::boolean3::cancelled_impl();
    }

    append_new_edges(
        &mut out_r,
        &mut face_ptr_r,
        &mut edges_new,
        &mut halfedge_ref,
        &face_pq2r,
        in_p.num_tri(),
    );
    // C++ clears edgesNew after AppendNewEdges.
    drop(edges_new);

    // Phase 6 (C++ boolean_result.cpp:912): after AppendNewEdges.
    if is_cancelled(token) {
        return crate::boolean3::cancelled_impl();
    }

    append_whole_edges(
        &mut out_r,
        &mut face_ptr_r,
        &mut halfedge_ref,
        in_p,
        &whole_halfedge_p,
        &i03,
        &vp2r,
        &face_pq2r[..in_p.num_tri()],
        true,
    );
    append_whole_edges(
        &mut out_r,
        &mut face_ptr_r,
        &mut halfedge_ref,
        in_q,
        &whole_halfedge_q,
        &i30,
        &vq2r,
        &face_pq2r[in_p.num_tri()..],
        false,
    );

    // C++ clears wholeHalfedgeP/Q, vP2R/vQ2R and friends after
    // AppendWholeEdges; nothing below needs these.
    drop(whole_halfedge_p);
    drop(whole_halfedge_q);
    drop(face_ptr_r);
    drop(face_pq2r);
    drop(vp2r);
    drop(vq2r);
    drop(i03);
    drop(i30);

    crate::timing::print("Assembly", t_assembly);

    // Phase 7 (C++ boolean_result.cpp:922): after AppendWholeEdges.
    if is_cancelled(token) {
        return crate::boolean3::cancelled_impl();
    }

    // Triangulate polygonal faces (allowConvex=false per C++ boolean_result.cpp)
    let t = crate::timing::start();
    if !face2tri_ct(&mut out_r, &face_edge, &halfedge_ref, false, token) {
        return crate::boolean3::cancelled_impl();
    }
    reorder_halfedges(&mut out_r);
    // C++ clears faceEdge after Face2Tri; halfedgeRef is likewise done.
    drop(face_edge);
    drop(halfedge_ref);
    crate::timing::print("Triangulation", t);

    // Phase 8 (C++ boolean_result.cpp:941): after Face2Tri + ReorderHalfedges.
    if is_cancelled(token) {
        return crate::boolean3::cancelled_impl();
    }

    let t = crate::timing::start();
    // Create properties via barycentric interpolation
    create_properties(&mut out_r, in_p, in_q, invert_q);

    // Phase 9 (C++ boolean_result.cpp:948): after CreateProperties.
    if is_cancelled(token) {
        return crate::boolean3::cancelled_impl();
    }

    // Update references
    update_reference(&mut out_r, in_p, in_q, invert_q);

    // Phase 10 (C++ boolean_result.cpp:951): after UpdateReference.
    if is_cancelled(token) {
        return crate::boolean3::cancelled_impl();
    }

    // Simplify topology
    simplify_topology(&mut out_r, (n_pv + n_qv) as i32);
    out_r.remove_unreferenced_verts();
    crate::timing::print("Simplification", t);

    // Finalize
    let t = crate::timing::start();
    out_r.calculate_bbox();
    out_r.sort_geometry();
    out_r.increment_mesh_ids();
    crate::timing::print("Sorting", t);

    // Phase 11 (C++ boolean_result.cpp:963): after SortGeometry. Without this
    // the whole trailing block above would be a hole in the contract — a cancel
    // landing in SimplifyTopology or SortGeometry would return a *complete*
    // mesh with status NoError, which is worse than a latency cost: the caller
    // would be told the operation it cancelled had succeeded. It matters most
    // on the shortest path through the kernel, a two-operand batch_boolean,
    // where `simple_boolean` runs once with no enclosing per-round re-check to
    // catch the cancel afterwards.
    //
    // C++ additionally threads ctx *into* SortGeometry; we only bracket it, so
    // the residual cost here is latency (one run of simplify + sort), not a
    // wrong status.
    if is_cancelled(token) {
        return crate::boolean3::cancelled_impl();
    }

    out_r
}
