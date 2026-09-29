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

// Phase 11: Boolean Result — face assembly from intersection data
//
// C++ source: src/boolean_result.cpp (889 lines)
//
// Takes intersection data from Boolean3 and assembles the output mesh faces.
// The algorithm:
// 1. Convert winding numbers to inclusion values based on operation type
// 2. Compute vertex remapping via exclusive scan (with absolute sum)
// 3. Create output vertices (retained + new intersection verts)
// 4. Build edge maps for partial and new edges
// 5. Size output (count sides per face, allocate halfedges)
// 6. Assemble edges (partial, new, whole)
// 7. Triangulate polygonal faces (Face2Tri)
// 8. Create properties via barycentric interpolation
// 9. Finalize: simplify topology, sort geometry

use std::collections::BTreeMap;

use crate::impl_mesh::ManifoldImpl;
use crate::linalg::{Vec3, dot};
use crate::types::{Halfedge, TriRef};

// ---------------------------------------------------------------------------
// EdgePos — position of a vertex along an edge for pairing
// ---------------------------------------------------------------------------

#[derive(Clone)]
pub(super) struct EdgePos {
    edge_pos: f64,
    vert: i32,
    collision_id: i32,
    is_start: bool,
}

impl EdgePos {
    fn sort_key(&self) -> (OrderedF64, i32) {
        (OrderedF64(self.edge_pos), self.collision_id)
    }
}

/// Wrapper for f64 that implements Ord (for sorting edge positions)
#[derive(Clone, Copy, PartialEq)]
struct OrderedF64(f64);

impl Eq for OrderedF64 {}

impl PartialOrd for OrderedF64 {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for OrderedF64 {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        self.0.partial_cmp(&other.0).unwrap_or(std::cmp::Ordering::Equal)
    }
}

// ---------------------------------------------------------------------------
// AbsSum — exclusive scan combiner
// ---------------------------------------------------------------------------

#[inline]
pub(super) fn abs_sum(a: i32, b: i32) -> i32 {
    a.abs() + b.abs()
}

/// Exclusive scan with abs_sum combiner. Output[i] = init + sum(|input[0..i]|).
pub(super) fn exclusive_scan_abs(input: &[i32], init: i32) -> Vec<i32> {
    let mut result = Vec::with_capacity(input.len());
    let mut acc = init;
    for &v in input {
        result.push(acc);
        acc = abs_sum(acc, v);
    }
    result
}

// ---------------------------------------------------------------------------
// SizeOutput — compute output face sizes and allocate halfedges
// ---------------------------------------------------------------------------

/// Counts sides per face and allocates output halfedges.
/// Returns (face_edge, face_pq2r).
pub(super) fn size_output(
    out_r: &mut ManifoldImpl,
    in_p: &ManifoldImpl,
    in_q: &ManifoldImpl,
    i03: &[i32],
    i30: &[i32],
    i12: &[i32],
    i21: &[i32],
    p1q2: &[[i32; 2]],
    p2q1: &[[i32; 2]],
    invert_q: bool,
) -> (Vec<i32>, Vec<i32>) {
    let num_tri_p = in_p.num_tri();
    let num_tri_q = in_q.num_tri();
    let mut sides_per_face = vec![0i32; num_tri_p + num_tri_q];

    // Count retained vertex contributions
    for face in 0..num_tri_p {
        for j in 0..3 {
            let v = in_p.halfedge[3 * face + j].start_vert as usize;
            sides_per_face[face] += i03[v].abs();
        }
    }
    for face in 0..num_tri_q {
        for j in 0..3 {
            let v = in_q.halfedge[3 * face + j].start_vert as usize;
            sides_per_face[num_tri_p + face] += i30[v].abs();
        }
    }

    // Count new intersection vertex contributions
    for (idx, pair) in p1q2.iter().enumerate() {
        let edge_p = pair[0] as usize;
        let face_q = pair[1] as usize;
        let inclusion = i12[idx].abs();
        sides_per_face[num_tri_p + face_q] += inclusion;
        let half = in_p.halfedge[edge_p];
        sides_per_face[edge_p / 3] += inclusion;
        sides_per_face[half.paired_halfedge as usize / 3] += inclusion;
    }
    for (idx, pair) in p2q1.iter().enumerate() {
        let face_p = pair[0] as usize;
        let edge_q = pair[1] as usize;
        let inclusion = i21[idx].abs();
        sides_per_face[face_p] += inclusion;
        let half = in_q.halfedge[edge_q];
        sides_per_face[num_tri_p + edge_q / 3] += inclusion;
        sides_per_face[num_tri_p + half.paired_halfedge as usize / 3] += inclusion;
    }

    // Build face_pq2r: maps input face → output face index
    let mut face_pq2r = vec![0i32; num_tri_p + num_tri_q];
    let mut count = 0i32;
    for i in 0..sides_per_face.len() {
        face_pq2r[i] = count;
        if sides_per_face[i] > 0 {
            count += 1;
        }
    }
    let num_face_r = count as usize;

    // Build face normals for output
    out_r.face_normal.resize(num_face_r, Vec3::splat(0.0));
    let mut out_idx = 0;
    for i in 0..num_tri_p {
        if sides_per_face[i] > 0 {
            out_r.face_normal[out_idx] = in_p.face_normal[i];
            out_idx += 1;
        }
    }
    for i in 0..num_tri_q {
        if sides_per_face[num_tri_p + i] > 0 {
            let normal = in_q.face_normal[i];
            out_r.face_normal[out_idx] = if invert_q {
                Vec3::new(-normal.x, -normal.y, -normal.z)
            } else {
                normal
            };
            out_idx += 1;
        }
    }

    // Build face_edge: cumulative edge counts for each output face
    let active_sides: Vec<i32> = sides_per_face.iter().filter(|&&s| s > 0).copied().collect();
    let mut face_edge = vec![0i32; active_sides.len() + 1];
    for (i, &s) in active_sides.iter().enumerate() {
        face_edge[i + 1] = face_edge[i] + s;
    }
    let num_halfedge = *face_edge.last().unwrap() as usize;
    out_r.halfedge.resize(
        num_halfedge,
        Halfedge {
            start_vert: -1,
            end_vert: -1,
            paired_halfedge: -1,
            prop_vert: -1,
        },
    );

    (face_edge, face_pq2r)
}

// ---------------------------------------------------------------------------
// AddNewEdgeVerts — populate edge maps with intersection vertices
// ---------------------------------------------------------------------------

pub(super) fn add_new_edge_verts(
    edges_p: &mut BTreeMap<i32, Vec<EdgePos>>,
    edges_new: &mut BTreeMap<(i32, i32), Vec<EdgePos>>,
    p1q2: &[[i32; 2]],
    i12: &[i32],
    v12r: &[i32],
    halfedge_p: &[Halfedge],
    forward: bool,
    offset: usize,
) {
    for i in 0..p1q2.len() {
        let edge_p = p1q2[i][if forward { 0 } else { 1 }];
        let face_q = p1q2[i][if forward { 1 } else { 0 }];
        let vert = v12r[i];
        let inclusion = i12[i];

        let halfedge = halfedge_p[edge_p as usize];
        let mut key_right = (halfedge.paired_halfedge / 3, face_q);
        if !forward {
            key_right = (key_right.1, key_right.0);
        }
        let mut key_left = (edge_p / 3, face_q);
        if !forward {
            key_left = (key_left.1, key_left.0);
        }

        let direction = inclusion < 0;
        let collision_id = (i + offset) as i32;

        // C++ captures all three is_start values at array creation time:
        // edgesP: direction
        // edgesNew[keyRight]: direction ^ !forward
        // edgesNew[keyLeft]: direction ^ forward
        let dir_p = direction;
        let dir_right = direction ^ !forward;
        let dir_left = direction ^ forward;

        // Add to edge P's map
        let ep = edges_p.entry(edge_p).or_default();
        for j in 0..inclusion.abs() {
            ep.push(EdgePos {
                edge_pos: 0.0,
                vert: vert + j,
                collision_id,
                is_start: dir_p,
            });
        }

        // Add to right new edge
        let er = edges_new.entry(key_right).or_default();
        for j in 0..inclusion.abs() {
            er.push(EdgePos {
                edge_pos: 0.0,
                vert: vert + j,
                collision_id,
                is_start: dir_right,
            });
        }

        // Add to left new edge
        let el = edges_new.entry(key_left).or_default();
        for j in 0..inclusion.abs() {
            el.push(EdgePos {
                edge_pos: 0.0,
                vert: vert + j,
                collision_id,
                is_start: dir_left,
            });
        }
    }
}

// ---------------------------------------------------------------------------
// PairUp — pair start/end vertices to form halfedges
// ---------------------------------------------------------------------------

/// Port of C++ `std::partition` (Hoare two-pointer, bidirectional form used by
/// MSVC and libstdc++): elements satisfying `pred` end up first. UNSTABLE — the
/// swap pattern determines the relative order of fully-tied `EdgePos` entries
/// (identical edgePos AND collisionId, e.g. duplicated retained verts on
/// coincident geometry), which the subsequent stable sorts preserve. That order
/// decides how degenerate edges pair up, so it must match C++ exactly.
fn cpp_partition<T, P: Fn(&T) -> bool>(v: &mut [T], pred: P) -> usize {
    let mut first = 0usize;
    let mut last = v.len();
    loop {
        loop {
            if first == last {
                return first;
            }
            if !pred(&v[first]) {
                break;
            }
            first += 1;
        }
        loop {
            last -= 1;
            if first == last {
                return first;
            }
            if pred(&v[last]) {
                break;
            }
        }
        v.swap(first, last);
        first += 1;
    }
}

fn pair_up<F: FnMut(Halfedge)>(edge_pos: &mut Vec<EdgePos>, mut f: F) {
    assert!(
        edge_pos.len() % 2 == 0,
        "Non-manifold edge! Not an even number of points. Got {} points: starts={}, ends={}",
        edge_pos.len(),
        edge_pos.iter().filter(|e| e.is_start).count(),
        edge_pos.iter().filter(|e| !e.is_start).count(),
    );
    let n_edges = edge_pos.len() / 2;

    // C++ PairUp: unstable partition (starts first), then stable_sort each
    // half, then pair edgePos[i] with edgePos[i + nEdges].
    let middle = cpp_partition(edge_pos, |e| e.is_start);
    debug_assert_eq!(middle, n_edges, "Non-manifold edge!");
    edge_pos[..n_edges].sort_by_key(|e| e.sort_key());
    edge_pos[n_edges..].sort_by_key(|e| e.sort_key());

    for i in 0..n_edges {
        f(Halfedge {
            start_vert: edge_pos[i].vert,
            end_vert: edge_pos[i + n_edges].vert,
            paired_halfedge: -1,
            prop_vert: -1,
        });
    }
}

// ---------------------------------------------------------------------------
// AppendPartialEdges — edges of P/Q that have intersections
// ---------------------------------------------------------------------------

pub(super) fn append_partial_edges(
    out_r: &mut ManifoldImpl,
    whole_halfedge_p: &mut Vec<bool>,
    face_ptr_r: &mut Vec<i32>,
    edges_p: &mut BTreeMap<i32, Vec<EdgePos>>,
    halfedge_ref: &mut Vec<TriRef>,
    in_p: &ManifoldImpl,
    i03: &[i32],
    vp2r: &[i32],
    face_p2r: &[i32],
    forward: bool,
) {
    for (&edge_p, edge_pos_p) in edges_p.iter_mut() {
        edge_pos_p.sort_by_key(|e| e.sort_key());

        let halfedge = in_p.halfedge[edge_p as usize];
        whole_halfedge_p[edge_p as usize] = false;
        whole_halfedge_p[halfedge.paired_halfedge as usize] = false;

        let v_start = halfedge.start_vert as usize;
        let v_end = halfedge.end_vert as usize;

        // C++ computes edgeVec from the INPUT mesh positions — the output
        // slots at vp2r[v] hold this vertex's position only when it is
        // retained (i03 != 0), so projecting along an output-derived vector
        // would use garbage for non-retained endpoints.
        let edge_vec = in_p.vert_pos[v_end] - in_p.vert_pos[v_start];

        // Fill in edge positions of existing intersection verts
        for edge in edge_pos_p.iter_mut() {
            edge.edge_pos = dot(out_r.vert_pos[edge.vert as usize], edge_vec);
        }

        // Add start vertex (only retained verts — inclusion != 0 — have
        // valid output positions at vp2r)
        let inclusion = i03[v_start];
        if inclusion != 0 {
            let start_pos = dot(out_r.vert_pos[vp2r[v_start] as usize], edge_vec);
            for j in 0..inclusion.abs() {
                edge_pos_p.push(EdgePos {
                    edge_pos: start_pos,
                    vert: vp2r[v_start] + j,
                    collision_id: i32::MAX,
                    is_start: inclusion > 0,
                });
            }
        }

        // Add end vertex
        let inclusion = i03[v_end];
        if inclusion != 0 {
            let end_pos = dot(out_r.vert_pos[vp2r[v_end] as usize], edge_vec);
            for j in 0..inclusion.abs() {
                edge_pos_p.push(EdgePos {
                    edge_pos: end_pos,
                    vert: vp2r[v_end] + j,
                    collision_id: i32::MAX,
                    is_start: inclusion < 0,
                });
            }
        }

        // Pair up and add halfedges to result
        let face_left_p = edge_p as usize / 3;
        let face_left = face_p2r[face_left_p];
        let face_right_p = halfedge.paired_halfedge as usize / 3;
        let face_right = face_p2r[face_right_p];

        let forward_ref = TriRef {
            mesh_id: if forward { 0 } else { 1 },
            original_id: -1,
            face_id: face_left_p as i32,
            coplanar_id: -1,
        };
        let backward_ref = TriRef {
            mesh_id: if forward { 0 } else { 1 },
            original_id: -1,
            face_id: face_right_p as i32,
            coplanar_id: -1,
        };

        pair_up(edge_pos_p, |mut e| {
            let forward_edge = face_ptr_r[face_left as usize];
            face_ptr_r[face_left as usize] += 1;
            let backward_edge = face_ptr_r[face_right as usize];
            face_ptr_r[face_right as usize] += 1;

            e.paired_halfedge = backward_edge;
            out_r.halfedge[forward_edge as usize] = e;
            halfedge_ref[forward_edge as usize] = forward_ref;

            let rev = Halfedge {
                start_vert: e.end_vert,
                end_vert: e.start_vert,
                paired_halfedge: forward_edge,
                prop_vert: -1,
            };
            out_r.halfedge[backward_edge as usize] = rev;
            halfedge_ref[backward_edge as usize] = backward_ref;
        });
    }
}

// ---------------------------------------------------------------------------
// AppendNewEdges — edges formed at face-face intersections
// ---------------------------------------------------------------------------

pub(super) fn append_new_edges(
    out_r: &mut ManifoldImpl,
    face_ptr_r: &mut Vec<i32>,
    edges_new: &mut BTreeMap<(i32, i32), Vec<EdgePos>>,
    halfedge_ref: &mut Vec<TriRef>,
    face_pq2r: &[i32],
    num_face_p: usize,
) {
    for (&(face_p, face_q), edge_pos) in edges_new.iter_mut() {
        edge_pos.sort_by_key(|e| e.sort_key());

        // Compute bounding box to find longest dimension
        let mut min = Vec3::splat(f64::INFINITY);
        let mut max = Vec3::splat(f64::NEG_INFINITY);
        for edge in edge_pos.iter() {
            let p = out_r.vert_pos[edge.vert as usize];
            min.x = min.x.min(p.x);
            min.y = min.y.min(p.y);
            min.z = min.z.min(p.z);
            max.x = max.x.max(p.x);
            max.y = max.y.max(p.y);
            max.z = max.z.max(p.z);
        }
        let size = max - min;
        // Order points along longest dimension
        let dim = if size.x > size.y && size.x > size.z {
            0
        } else if size.y > size.z {
            1
        } else {
            2
        };

        for edge in edge_pos.iter_mut() {
            let p = out_r.vert_pos[edge.vert as usize];
            edge.edge_pos = match dim {
                0 => p.x,
                1 => p.y,
                _ => p.z,
            };
        }

        let face_left = face_pq2r[face_p as usize];
        let face_right = face_pq2r[num_face_p + face_q as usize];
        let forward_ref = TriRef {
            mesh_id: 0,
            original_id: -1,
            face_id: face_p,
            coplanar_id: -1,
        };
        let backward_ref = TriRef {
            mesh_id: 1,
            original_id: -1,
            face_id: face_q,
            coplanar_id: -1,
        };

        pair_up(edge_pos, |mut e| {
            let forward_edge = face_ptr_r[face_left as usize];
            face_ptr_r[face_left as usize] += 1;
            let backward_edge = face_ptr_r[face_right as usize];
            face_ptr_r[face_right as usize] += 1;

            e.paired_halfedge = backward_edge;
            out_r.halfedge[forward_edge as usize] = e;
            halfedge_ref[forward_edge as usize] = forward_ref;

            let rev = Halfedge {
                start_vert: e.end_vert,
                end_vert: e.start_vert,
                paired_halfedge: forward_edge,
                prop_vert: -1,
            };
            out_r.halfedge[backward_edge as usize] = rev;
            halfedge_ref[backward_edge as usize] = backward_ref;
        });
    }
}

// ---------------------------------------------------------------------------
// AppendWholeEdges — edges with no intersections (fully retained)
// ---------------------------------------------------------------------------

pub(super) fn append_whole_edges(
    out_r: &mut ManifoldImpl,
    face_ptr_r: &mut Vec<i32>,
    halfedge_ref: &mut Vec<TriRef>,
    in_p: &ManifoldImpl,
    whole_halfedge_p: &[bool],
    i03: &[i32],
    vp2r: &[i32],
    face_p2r: &[i32],
    forward: bool,
) {
    for idx in 0..in_p.halfedge.len() {
        if !whole_halfedge_p[idx] {
            continue;
        }
        let mut halfedge = in_p.halfedge[idx];
        if !halfedge.is_forward() {
            continue;
        }

        let inclusion = i03[halfedge.start_vert as usize];
        if inclusion == 0 {
            continue;
        }
        if inclusion < 0 {
            // Reverse the halfedge
            std::mem::swap(&mut halfedge.start_vert, &mut halfedge.end_vert);
        }
        halfedge.start_vert = vp2r[halfedge.start_vert as usize];
        halfedge.end_vert = vp2r[halfedge.end_vert as usize];

        let face_left_p = idx / 3;
        let new_face = face_p2r[face_left_p];
        let face_right_p = halfedge.paired_halfedge as usize / 3;
        let face_right = face_p2r[face_right_p];

        let forward_ref = TriRef {
            mesh_id: if forward { 0 } else { 1 },
            original_id: -1,
            face_id: face_left_p as i32,
            coplanar_id: -1,
        };
        let backward_ref = TriRef {
            mesh_id: if forward { 0 } else { 1 },
            original_id: -1,
            face_id: face_right_p as i32,
            coplanar_id: -1,
        };

        for i in 0..inclusion.abs() {
            let forward_edge = face_ptr_r[new_face as usize];
            face_ptr_r[new_face as usize] += 1;
            let backward_edge = face_ptr_r[face_right as usize];
            face_ptr_r[face_right as usize] += 1;

            let he = Halfedge {
                start_vert: halfedge.start_vert + i,
                end_vert: halfedge.end_vert + i,
                paired_halfedge: backward_edge,
                prop_vert: -1,
            };
            out_r.halfedge[forward_edge as usize] = he;
            halfedge_ref[forward_edge as usize] = forward_ref;

            let rev = Halfedge {
                start_vert: halfedge.end_vert + i,
                end_vert: halfedge.start_vert + i,
                paired_halfedge: forward_edge,
                prop_vert: -1,
            };
            out_r.halfedge[backward_edge as usize] = rev;
            halfedge_ref[backward_edge as usize] = backward_ref;
        }
    }
}

// Sub-module: update_reference, create_properties, boolean_result entry point
#[path = "boolean_result_assemble.rs"]
mod boolean_result_assemble;
pub use boolean_result_assemble::{boolean_result, boolean_result_with_token};

