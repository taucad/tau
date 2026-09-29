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

// Phase 9: smoothing/tangent generation — ported from cpp-reference/manifold/src/smoothing.cpp

use std::collections::HashMap;

use crate::impl_mesh::ManifoldImpl;
use crate::linalg::{cross, dot, length, Mat3, Vec3, Vec4};
use crate::math;
use crate::types::{K_PI, K_TWO_PI, Smoothness, TriRef};

/// Minimum sharp angle in degrees, below which edges are considered coplanar.
/// Floating point noise in the dihedral angle computation can reach ~1e-6
/// degrees for nearly-parallel face normals; this threshold must exceed that.
const K_MIN_SHARP_ANGLE: f64 = 1e-4;

#[inline]
pub(super) fn vec3_from_vec4(v: Vec4) -> Vec3 {
    Vec3::new(v.x, v.y, v.z)
}

#[inline]
pub(super) fn safe_normalize(v: Vec3) -> Vec3 {
    let len2 = dot(v, v);
    if len2 <= 0.0 || !len2.is_finite() {
        Vec3::new(0.0, 0.0, 0.0)
    } else {
        v / len2.sqrt()
    }
}

pub(super) fn wrap(radians: f64) -> f64 {
    if radians < -K_PI {
        radians + K_TWO_PI
    } else if radians > K_PI {
        radians - K_TWO_PI
    } else {
        radians
    }
}

pub(super) fn angle_between(a: Vec3, b: Vec3) -> f64 {
    let d = dot(a, b);
    if d >= 1.0 {
        0.0
    } else if d <= -1.0 {
        K_PI
    } else {
        math::acos(d)
    }
}

/// Two normals are considered equal when their normalized dot product exceeds
/// 0.9999 (~0.81°). Per C++ #1671 this tolerance replaces the old exact /
/// `kPrecision`-squared comparisons in the tangent-generation code.
pub(super) fn equal_normals(a: Vec3, b: Vec3) -> bool {
    dot(safe_normalize(a), safe_normalize(b)) > 0.9999
}

pub fn circular_tangent(tangent: Vec3, edge_vec: Vec3) -> Vec4 {
    let dir = safe_normalize(tangent);
    let weight = 0.5f64.max(dot(dir, safe_normalize(edge_vec)));
    let bz2 = Vec4::new(
        dir.x * 0.5 * length(edge_vec),
        dir.y * 0.5 * length(edge_vec),
        dir.z * 0.5 * length(edge_vec),
        weight,
    );
    let bz3 = Vec4::new(
        bz2.x * (2.0 / 3.0),
        bz2.y * (2.0 / 3.0),
        bz2.z * (2.0 / 3.0),
        1.0 + (bz2.w - 1.0) * (2.0 / 3.0),
    );
    Vec4::new(bz3.x / bz3.w, bz3.y / bz3.w, bz3.z / bz3.w, bz3.w)
}

pub(super) fn collect_vertex_cycle(mesh: &ManifoldImpl, start: usize) -> Vec<usize> {
    let mut cycle = Vec::new();
    let mut current = start;
    loop {
        cycle.push(current);
        let paired = mesh.halfedge[current].paired_halfedge;
        if paired < 0 {
            break;
        }
        current = crate::impl_mesh::next_halfedge(paired) as usize;
        if current == start {
            break;
        }
    }
    cycle
}

impl ManifoldImpl {
    pub fn get_normal(&self, halfedge: usize, normal_idx: usize) -> Vec3 {
        let prop = self.halfedge[halfedge].prop_vert as usize;
        let base = prop * self.num_prop + normal_idx;
        let normal = Vec3::new(
            self.properties[base],
            self.properties[base + 1],
            self.properties[base + 2],
        );
        // Per #1718: hasNormals=true means CalculateNormals (or a flagged
        // round-trip) wrote world-frame values, kept world-frame through
        // Transform/Compose — return them directly. Without the flag, treat
        // the slot as per-mesh frame and re-rotate to world (legacy contract
        // for hand-built MeshGL inputs that don't set the bit).
        let mesh_id = self.mesh_relation.tri_ref[halfedge / 3].mesh_id;
        match self.mesh_relation.mesh_id_transform.get(&mesh_id) {
            Some(rel) if !rel.has_normals => rel.get_normal_transform() * normal,
            _ => normal,
        }
    }

    pub fn tangent_from_normal(&self, normal: Vec3, halfedge: usize) -> Vec4 {
        let edge = self.halfedge[halfedge];
        let edge_vec = self.vert_pos[edge.end_vert as usize] - self.vert_pos[edge.start_vert as usize];
        let edge_normal =
            self.face_normal[halfedge / 3] + self.face_normal[edge.paired_halfedge as usize / 3];
        // Per C++ #1671 (More smoothing fixes): pick the bi-tangent from the
        // edge pseudo-normal or the supplied normal depending on their
        // relative orientation, then cross with the normal. This is more
        // numerically robust than the old single cross-of-cross form.
        let bi_tangent = if dot(normal, edge_normal) < 0.0 {
            cross(edge_normal, edge_vec)
        } else {
            cross(normal, edge_vec)
        };
        circular_tangent(cross(bi_tangent, normal), edge_vec)
    }

    pub fn is_inside_quad(&self, halfedge: usize) -> bool {
        if !self.halfedge_tangent.is_empty() {
            return self.halfedge_tangent[halfedge].w < 0.0;
        }
        let tri = halfedge / 3;
        let ref_tri = self.mesh_relation.tri_ref[tri];
        let pair = self.halfedge[halfedge].paired_halfedge as usize;
        let pair_tri = pair / 3;
        let pair_ref = self.mesh_relation.tri_ref[pair_tri];
        if !ref_tri.same_face(&pair_ref) {
            return false;
        }

        let same_face = |edge_idx: usize, reference: TriRef| -> bool {
            let pair = self.halfedge[edge_idx].paired_halfedge as usize / 3;
            reference.same_face(&self.mesh_relation.tri_ref[pair])
        };

        let mut neighbor = crate::impl_mesh::next_halfedge(halfedge as i32) as usize;
        if same_face(neighbor, ref_tri) {
            return false;
        }
        neighbor = crate::impl_mesh::next_halfedge(neighbor as i32) as usize;
        if same_face(neighbor, ref_tri) {
            return false;
        }
        neighbor = crate::impl_mesh::next_halfedge(pair as i32) as usize;
        if same_face(neighbor, pair_ref) {
            return false;
        }
        neighbor = crate::impl_mesh::next_halfedge(neighbor as i32) as usize;
        if same_face(neighbor, pair_ref) {
            return false;
        }
        true
    }

    pub fn is_marked_inside_quad(&self, halfedge: usize) -> bool {
        // Check for kInsideQuad == -1.0 exactly (distinct from kMissingNormal == -3.0)
        !self.halfedge_tangent.is_empty() && self.halfedge_tangent[halfedge].w == -1.0
    }

    pub fn update_sharpened_edges(&self, sharpened_edges: &[Smoothness]) -> Vec<Smoothness> {
        let mut old_halfedge_to_new = HashMap::new();
        for tri in 0..self.num_tri() {
            let old_tri = self.mesh_relation.tri_ref[tri].face_id;
            for i in 0..3 {
                old_halfedge_to_new.insert((3 * old_tri + i as i32) as usize, 3 * tri + i);
            }
        }
        let mut out = sharpened_edges.to_vec();
        for edge in &mut out {
            if let Some(&new_edge) = old_halfedge_to_new.get(&edge.halfedge) {
                edge.halfedge = new_edge;
            }
        }
        out
    }

    pub fn flat_faces(&self) -> Vec<bool> {
        let num_tri = self.num_tri();
        let mut tri_is_flat_face = vec![false; num_tri];
        for tri in 0..num_tri {
            let reference = self.mesh_relation.tri_ref[tri];
            let mut face_neighbors = 0;
            let mut face_tris = [-1; 3];
            for j in 0..3 {
                let neighbor_tri = self.halfedge[3 * tri + j].paired_halfedge as usize / 3;
                let j_ref = self.mesh_relation.tri_ref[neighbor_tri];
                if j_ref.same_face(&reference) {
                    face_neighbors += 1;
                    face_tris[j] = neighbor_tri as i32;
                }
            }
            if face_neighbors > 1 {
                tri_is_flat_face[tri] = true;
                for j in 0..3 {
                    if face_tris[j] >= 0 {
                        tri_is_flat_face[face_tris[j] as usize] = true;
                    }
                }
            }
        }
        tri_is_flat_face
    }

    pub fn vert_flat_face(&self, flat_faces: &[bool]) -> Vec<i32> {
        let mut vert_flat_face = vec![-1; self.num_vert()];
        let mut vert_ref = vec![TriRef::default(); self.num_vert()];
        for tri in 0..self.num_tri() {
            if flat_faces[tri] {
                for j in 0..3 {
                    let vert = self.halfedge[3 * tri + j].start_vert as usize;
                    if vert_ref[vert].same_face(&self.mesh_relation.tri_ref[tri]) {
                        continue;
                    }
                    vert_ref[vert] = self.mesh_relation.tri_ref[tri];
                    vert_flat_face[vert] = if vert_flat_face[vert] == -1 { tri as i32 } else { -2 };
                }
            }
        }
        vert_flat_face
    }

    /// Port of C++ Manifold::Impl::SetNormals()
    /// Fills in vertex properties with unshared normals across edges bent
    /// more than minSharpAngle (in degrees).
    pub fn set_normals(&mut self, normal_idx: i32, min_sharp_angle: f64) {
        if self.is_empty() || normal_idx < 0 {
            return;
        }
        // Clamp to avoid treating nearly-coplanar faces as sharp due to
        // floating point noise in the dihedral computation (~1e-6 degrees).
        let min_sharp_angle = min_sharp_angle.max(K_MIN_SHARP_ANGLE);
        let normal_idx = normal_idx as usize;

        let old_num_prop = self.num_prop;

        // Count sharp edges per vertex. Per C++ #1724 (Fix CalculateNormals),
        // SetNormals no longer special-cases flat faces — an edge is sharp iff
        // its dihedral exceeds min_sharp_angle. `angle_between` matches C++'s
        // AngleBetween helper (acos with ±1 clamping), the #1634 form.
        let mut vert_num_sharp = vec![0i32; self.num_vert()];
        for e in 0..self.halfedge.len() {
            if !self.halfedge[e].is_forward() {
                continue;
            }
            let pair = self.halfedge[e].paired_halfedge as usize;
            let tri1 = e / 3;
            let tri2 = pair / 3;
            let dihedral =
                angle_between(self.face_normal[tri1], self.face_normal[tri2]).to_degrees();
            if dihedral > min_sharp_angle {
                vert_num_sharp[self.halfedge[e].start_vert as usize] += 1;
                vert_num_sharp[self.halfedge[e].end_vert as usize] += 1;
            }
        }

        // Expand properties to accommodate normals.
        // orig_props: old data at old stride (old_num_prop per vert)
        // new_properties: output buffer at new stride (num_prop per vert)
        let num_prop = old_num_prop.max(normal_idx + 3);
        let num_prop_vert = self.num_prop_vert();
        let orig_props = std::mem::take(&mut self.properties); // compact original
        let mut new_properties = vec![0.0f64; num_prop * num_prop_vert];

        self.num_prop = num_prop;

        // Save old prop assignments and reset
        let old_halfedge_prop: Vec<i32> = self.halfedge.iter().map(|h| h.prop_vert).collect();
        for h in self.halfedge.iter_mut() {
            h.prop_vert = -1;
        }

        // Build per-mesh-id inverse normal transform cache.
        // Matches C++ SetNormals which applies GetInverseNormalTransform() to each vertex's normal
        // before writing to properties, so that GetNormal (which applies GetNormalTransform()) can
        // correctly reconstruct the world-space normal.
        let mut mesh_id_to_inv_transform: HashMap<i32, Mat3> = HashMap::new();

        let num_edge = self.halfedge.len();
        for start_edge in 0..num_edge {
            if self.halfedge[start_edge].prop_vert >= 0 {
                continue;
            }
            let vert = self.halfedge[start_edge].start_vert as usize;

            // Look up the inverse normal transform for this vertex's mesh.
            let mesh_id = self.mesh_relation.tri_ref[start_edge / 3].mesh_id;
            let inv_transform = *mesh_id_to_inv_transform.entry(mesh_id).or_insert_with(|| {
                self.mesh_relation
                    .mesh_id_transform
                    .get(&mesh_id)
                    .map(|rel| rel.get_inverse_normal_transform())
                    .unwrap_or_else(Mat3::identity)
            });

            if vert_num_sharp[vert] < 2 {
                // Vertex has single normal. Per #1724 this is always the vertex
                // pseudo-normal (no flat-face substitution).
                let world_normal = self.vert_normal[vert];
                // Per #1718: slot 0 (standard) stores world-frame directly — the
                // eager-transform contract keeps it in sync with vert_pos /
                // face_normal. Legacy non-zero idx stores per-mesh frame, which
                // get_mesh_gl's run transform recovers to world on export.
                let normal = if normal_idx == 0 {
                    world_normal
                } else {
                    inv_transform * world_normal
                };

                let mut last_prop: i32 = -1;
                // ForVert traversal
                let mut current = start_edge;
                loop {
                    let prop = old_halfedge_prop[current];
                    self.halfedge[current].prop_vert = prop;
                    if prop != last_prop {
                        last_prop = prop;
                        // Copy old properties using old stride, write into new stride
                        let dst_start = (prop as usize) * num_prop;
                        let src_start = (prop as usize) * old_num_prop;
                        for p in 0..old_num_prop.min(num_prop) {
                            if src_start + p < orig_props.len() {
                                new_properties[dst_start + p] = orig_props[src_start + p];
                            }
                        }
                        // Set normal
                        new_properties[prop as usize * num_prop + normal_idx] = normal.x;
                        new_properties[prop as usize * num_prop + normal_idx + 1] = normal.y;
                        new_properties[prop as usize * num_prop + normal_idx + 2] = normal.z;
                    }
                    current = crate::types::next_halfedge(
                        self.halfedge[current].paired_halfedge,
                    ) as usize;
                    if current == start_edge {
                        break;
                    }
                }
            } else {
                // Vertex has multiple normals
                let center_pos = self.vert_pos[vert];
                let mut group: Vec<usize> = Vec::new();
                let mut normals: Vec<Vec3> = Vec::new();

                // Find a sharp edge to start on
                let mut current = start_edge;
                let mut prev_face = current / 3;
                loop {
                    let next = crate::types::next_halfedge(
                        self.halfedge[current].paired_halfedge,
                    ) as usize;
                    let face = next / 3;
                    let dihedral =
                        angle_between(self.face_normal[face], self.face_normal[prev_face])
                            .to_degrees();
                    if dihedral > min_sharp_angle {
                        break;
                    }
                    current = next;
                    prev_face = face;
                    if current == start_edge {
                        break;
                    }
                }

                let end_edge = current;

                // Calculate pseudo-normals between each sharp edge.
                // Mirrors C++ ForVert<FaceEdge>(endEdge, transform, binaryOp):
                //   here = transform(endEdge); current = endEdge;
                //   do { next = transform(NextHalfedge(current.paired));
                //        binaryOp(current, here, next); here = next; current = next_halfedge;
                //   } while (current != endEdge);
                // normals starts EMPTY — first sharp edge creates group 0.
                // Per #1724 the edge vector is simply the normalized direction
                // from the center vertex to the far end of the halfedge; the
                // old quad/flair-out tangent logic was removed.
                let get_edge_vec = |he: usize| -> Vec3 {
                    let end_v = self.halfedge[he].end_vert as usize;
                    safe_normalize(self.vert_pos[end_v] - center_pos)
                };

                let mut here_face = end_edge / 3;
                let mut here_ev = get_edge_vec(end_edge);
                current = end_edge;
                loop {
                    let next_he = crate::types::next_halfedge(
                        self.halfedge[current].paired_halfedge,
                    ) as usize;
                    let next_face = next_he / 3;
                    let mut next_ev = get_edge_vec(next_he);

                    // Check for sharp edge between here and next.
                    let dihedral =
                        angle_between(self.face_normal[here_face], self.face_normal[next_face])
                            .to_degrees();
                    if dihedral > min_sharp_angle {
                        normals.push(Vec3::splat(0.0));
                    }
                    group.push(normals.len() - 1);

                    // Accumulate angle-weighted normal (C++: cross(next.edgeVec, here.edgeVec)).
                    if next_ev.x.is_finite() {
                        let c = cross(next_ev, here_ev);
                        let angle = angle_between(here_ev, next_ev);
                        *normals.last_mut().unwrap() =
                            *normals.last().unwrap() + safe_normalize(c) * angle;
                    } else {
                        next_ev = here_ev;
                    }

                    here_face = next_face;
                    here_ev = next_ev;
                    current = next_he;
                    if current == end_edge {
                        break;
                    }
                }

                // Per #1724: transform into the storage frame first, then
                // normalize. Per #1718: only the legacy non-zero idx applies the
                // inv_transform; slot 0 stores world-frame directly.
                for n in normals.iter_mut() {
                    *n = if normal_idx == 0 {
                        safe_normalize(*n)
                    } else {
                        safe_normalize(inv_transform * *n)
                    };
                }

                // Assign property vertices.
                // Mirrors C++ ForVert(endEdge, func) which advances BEFORE visiting:
                //   do { current = NextHalfedge(paired); func(current); } while (current != endEdge)
                // So endEdge itself is visited LAST (gets group[N-1]), not first.
                let mut last_group: usize = 0;
                let mut last_prop: i32 = -1;
                let mut new_prop: i32 = -1;
                let mut idx = 0usize;
                current = crate::types::next_halfedge(
                    self.halfedge[end_edge].paired_halfedge,
                ) as usize;
                loop {
                    let prop = old_halfedge_prop[current];
                    let g = if idx < group.len() { group[idx] } else { 0 };

                    if g != last_group && g != 0 && prop == last_prop {
                        // Split property vertex
                        last_group = g;
                        new_prop = (new_properties.len() / num_prop) as i32;
                        new_properties.resize(new_properties.len() + num_prop, 0.0);
                        let src_start = (prop as usize) * old_num_prop;
                        for p in 0..old_num_prop.min(num_prop) {
                            if src_start + p < orig_props.len() {
                                new_properties[new_prop as usize * num_prop + p] = orig_props[src_start + p];
                            }
                        }
                        if g < normals.len() {
                            new_properties[new_prop as usize * num_prop + normal_idx] = normals[g].x;
                            new_properties[new_prop as usize * num_prop + normal_idx + 1] = normals[g].y;
                            new_properties[new_prop as usize * num_prop + normal_idx + 2] = normals[g].z;
                        }
                    } else if prop != last_prop {
                        // Update property vertex
                        last_prop = prop;
                        new_prop = prop;
                        let dst_start = (prop as usize) * num_prop;
                        let src_start = (prop as usize) * old_num_prop;
                        for p in 0..old_num_prop.min(num_prop) {
                            if src_start + p < orig_props.len() {
                                new_properties[dst_start + p] = orig_props[src_start + p];
                            }
                        }
                        if g < normals.len() {
                            new_properties[prop as usize * num_prop + normal_idx] = normals[g].x;
                            new_properties[prop as usize * num_prop + normal_idx + 1] = normals[g].y;
                            new_properties[prop as usize * num_prop + normal_idx + 2] = normals[g].z;
                        }
                    }

                    self.halfedge[current].prop_vert = new_prop;
                    idx += 1;

                    let next_current = crate::types::next_halfedge(
                        self.halfedge[current].paired_halfedge,
                    ) as usize;
                    // Stop after visiting end_edge (C++ stops when current == halfedge)
                    if current == end_edge {
                        break;
                    }
                    current = next_current;
                }
            }
        }

        self.properties = new_properties;
    }
}

// Tangent-related methods (vert_halfedge, sharpen_edges, sharpen_tangent,
// linearize_flat_tangents, distribute_tangents, create_tangents_from_normals,
// create_tangents) extracted to smoothing_tangents.rs
#[path = "smoothing_tangents.rs"]
mod smoothing_tangents;

#[cfg(test)]
#[path = "smoothing_tests.rs"]
mod tests;
