// Smoothing tangent methods — extracted from smoothing.rs
// Contains: vert_halfedge, sharpen_edges, sharpen_tangent, linearize_flat_tangents,
//           distribute_tangents, create_tangents_from_normals, create_tangents

use std::collections::BTreeMap;

use crate::impl_mesh::ManifoldImpl;
use crate::linalg::{cross, dot, normalize, Vec3, Vec4};
use crate::math;
use crate::types::{next_halfedge, prev_halfedge, radians, K_PI, K_TWO_PI, Smoothness};

use super::{vec3_from_vec4, safe_normalize, angle_between, circular_tangent, equal_normals, wrap, collect_vertex_cycle};

impl ManifoldImpl {
    pub fn vert_halfedge(&self) -> Vec<i32> {
        let mut vert_halfedge = vec![-1; self.num_vert()];
        for (idx, edge) in self.halfedge.iter().enumerate() {
            let start = edge.start_vert as usize;
            if vert_halfedge[start] < 0 {
                vert_halfedge[start] = idx as i32;
            }
        }
        vert_halfedge
    }

    pub fn sharpen_edges(&self, min_sharp_angle: f64, min_smoothness: f64) -> Vec<Smoothness> {
        let mut out = Vec::new();
        // Clamp to avoid float-noise false positives (matches C++ kMinSharpAngle)
        let min_radians = radians(min_sharp_angle.max(1e-4));
        for e in 0..self.halfedge.len() {
            if !self.halfedge[e].is_forward() {
                continue;
            }
            let pair = self.halfedge[e].paired_halfedge as usize;
            let d = dot(self.face_normal[e / 3], self.face_normal[pair / 3]).clamp(-1.0, 1.0);
            let dihedral = math::acos(d);
            if dihedral > min_radians {
                out.push(Smoothness { halfedge: e, smoothness: min_smoothness });
                out.push(Smoothness { halfedge: pair, smoothness: min_smoothness });
            }
        }
        out
    }

    pub fn sharpen_tangent(&mut self, halfedge: usize, smoothness: f64) {
        self.halfedge_tangent[halfedge] = Vec4::new(
            smoothness * self.halfedge_tangent[halfedge].x,
            smoothness * self.halfedge_tangent[halfedge].y,
            smoothness * self.halfedge_tangent[halfedge].z,
            if smoothness == 0.0 { 0.0 } else { self.halfedge_tangent[halfedge].w },
        );
    }

    pub fn linearize_flat_tangents(&mut self) {
        for halfedge in 0..self.halfedge_tangent.len() {
            if !self.halfedge[halfedge].is_forward() {
                continue;
            }
            let pair = self.halfedge[halfedge].paired_halfedge as usize;
            let tangent = self.halfedge_tangent[halfedge];
            let other = self.halfedge_tangent[pair];
            let flat = [tangent.w == 0.0, other.w == 0.0];
            if !flat[0] && !flat[1] {
                continue;
            }
            let edge_vec = self.vert_pos[self.halfedge[halfedge].end_vert as usize]
                - self.vert_pos[self.halfedge[halfedge].start_vert as usize];

            if flat[0] && flat[1] {
                self.halfedge_tangent[halfedge] = Vec4::new(edge_vec.x / 3.0, edge_vec.y / 3.0, edge_vec.z / 3.0, 1.0);
                self.halfedge_tangent[pair] = Vec4::new(-edge_vec.x / 3.0, -edge_vec.y / 3.0, -edge_vec.z / 3.0, 1.0);
            } else if flat[0] {
                let other_v = vec3_from_vec4(other);
                let v = (edge_vec + other_v) / 2.0;
                self.halfedge_tangent[halfedge] = Vec4::new(v.x, v.y, v.z, 1.0);
            } else {
                let tan_v = vec3_from_vec4(tangent);
                let v = (-edge_vec + tan_v) / 2.0;
                self.halfedge_tangent[pair] = Vec4::new(v.x, v.y, v.z, 1.0);
            }
        }
    }

    pub fn distribute_tangents(&mut self, fixed_halfedges: &[bool]) {
        for halfedge in 0..fixed_halfedges.len() {
            // Per #1671: skip non-fixed and inside-quad seeds outright (the old
            // code re-seeded inside-quad halfedges to their neighbor).
            if !fixed_halfedges[halfedge] || self.is_marked_inside_quad(halfedge) {
                continue;
            }

            let start = halfedge;

            let mut normal = Vec3::new(0.0, 0.0, 0.0);
            let mut current_angle = Vec::new();
            let mut desired_angle = Vec::new();

            let approx_normal = self.vert_normal[self.halfedge[start].start_vert as usize];
            let center = self.vert_pos[self.halfedge[start].start_vert as usize];
            let mut last_edge_vec =
                safe_normalize(self.vert_pos[self.halfedge[start].end_vert as usize] - center);
            let first_tangent = safe_normalize(vec3_from_vec4(self.halfedge_tangent[start]));
            let mut last_tangent = first_tangent;
            let mut current = start;
            let mut guard = 0usize;

            loop {
                guard += 1;
                if guard > self.halfedge.len() + 1 {
                    break;
                }
                current = crate::impl_mesh::next_halfedge(self.halfedge[current].paired_halfedge) as usize;
                if self.is_marked_inside_quad(current) {
                    if current == start {
                        break;
                    }
                    continue;
                }
                let this_edge_vec =
                    safe_normalize(self.vert_pos[self.halfedge[current].end_vert as usize] - center);
                let this_tangent = safe_normalize(vec3_from_vec4(self.halfedge_tangent[current]));
                normal = normal + cross(this_tangent, last_tangent);

                let cumulative = angle_between(this_edge_vec, last_edge_vec)
                    + desired_angle.last().copied().unwrap_or(0.0);
                desired_angle.push(cumulative);

                if current == start {
                    current_angle.push(K_TWO_PI);
                } else {
                    let mut angle = angle_between(this_tangent, first_tangent);
                    if dot(approx_normal, cross(this_tangent, first_tangent)) < 0.0 {
                        angle = K_TWO_PI - angle;
                    }
                    current_angle.push(angle);
                }

                last_edge_vec = this_edge_vec;
                last_tangent = this_tangent;
                if fixed_halfedges[current] {
                    break;
                }
            }

            if current_angle.len() == 1 || dot(normal, normal) == 0.0 {
                continue;
            }

            let scale = current_angle.last().copied().unwrap_or(K_TWO_PI)
                / desired_angle.last().copied().unwrap_or(K_TWO_PI);
            let mut offset = 0.0;
            if current == start {
                for i in 0..current_angle.len() {
                    offset += wrap(current_angle[i] - scale * desired_angle[i]);
                }
                offset /= current_angle.len() as f64;
            }

            current = start;
            let axis = safe_normalize(normal);
            let mut i = 0usize;
            let mut guard = 0usize;
            loop {
                guard += 1;
                if guard > self.halfedge.len() + 1 {
                    break;
                }
                current = crate::impl_mesh::next_halfedge(self.halfedge[current].paired_halfedge) as usize;
                // Per #1671: stop before processing a *different* fixed halfedge
                // (the terminating fixed edge is no longer rotated here).
                if current != start && fixed_halfedges[current] {
                    break;
                }
                if self.is_marked_inside_quad(current) {
                    if current == start {
                        break;
                    }
                    continue;
                }
                desired_angle[i] *= scale;
                let last_angle = if i > 0 { desired_angle[i - 1] } else { 0.0 };
                if desired_angle[i] - last_angle > K_PI {
                    desired_angle[i] = last_angle + K_PI;
                } else if i + 1 < desired_angle.len() && scale * desired_angle[i + 1] - desired_angle[i] > K_PI {
                    desired_angle[i] = scale * desired_angle[i + 1] - K_PI;
                }

                let angle = current_angle[i] - desired_angle[i] - offset;
                let tangent = vec3_from_vec4(self.halfedge_tangent[current]);
                let q = crate::linalg::rotation_quat_axis_angle(axis, angle);
                let rotated = crate::linalg::qrot(q, tangent);
                self.halfedge_tangent[current] = Vec4::new(
                    rotated.x,
                    rotated.y,
                    rotated.z,
                    self.halfedge_tangent[current].w,
                );
                i += 1;
                if fixed_halfedges[current] {
                    break;
                }
            }
        }
    }

    pub fn create_tangents_from_normals(&mut self, normal_idx: usize) {
        if self.is_empty() {
            return;
        }
        // special flags for tangent.w (matches C++ kInsideQuad/kMissingNormal)
        const K_INSIDE_QUAD: f64 = -1.0;
        const K_MISSING_NORMAL: f64 = -3.0;

        let num_vert = self.num_vert();
        let num_halfedge = self.halfedge.len();
        let mut tangent = vec![Vec4::new(0.0, 0.0, 0.0, 0.0); num_halfedge];
        let mut fixed_halfedge = vec![false; num_halfedge];
        let vert_halfedge = self.vert_halfedge();

        for &e in vert_halfedge.iter().take(num_vert) {
            if e < 0 {
                continue;
            }
            let e = e as usize;
            let cycle = collect_vertex_cycle(self, e);
            let mut face_edges = [-1isize, -1isize];
            let mut start_halfedge: isize = -1;
            let mut last_normal = Vec3::new(0.0, 0.0, 0.0);

            for idx in 0..cycle.len() {
                let halfedge = cycle[idx];
                let next_he = cycle[(idx + 1) % cycle.len()];
                let here_normal = self.get_normal(halfedge, normal_idx);
                let next_normal = self.get_normal(next_he, normal_idx);
                // Per #1671: a halfedge is flat when its normal matches the face
                // normal within the EqualNormals tolerance (was kPrecision-squared).
                let here_is_flat = equal_normals(here_normal, self.face_normal[halfedge / 3]);
                let next_is_flat = equal_normals(next_normal, self.face_normal[next_he / 3]);

                // Start with flag clear
                tangent[halfedge].w = 1.0;

                if here_is_flat != next_is_flat {
                    // Record halfedges bordering a single flat face
                    if face_edges[0] == -1 {
                        face_edges[0] = halfedge as isize;
                    } else if face_edges[1] == -1 {
                        face_edges[1] = halfedge as isize;
                    } else {
                        face_edges[0] = -2;
                    }
                }

                let here_zero = here_normal == Vec3::new(0.0, 0.0, 0.0);
                let next_zero = next_normal == Vec3::new(0.0, 0.0, 0.0);

                if here_zero || next_zero {
                    if !here_zero {
                        // next missing — record the last good normal
                        last_normal = here_normal;
                    } else if !next_zero {
                        // here missing, next present — record start of missing segment
                        if start_halfedge < 0 {
                            start_halfedge = halfedge as isize;
                        }
                    } else {
                        // both missing
                        if start_halfedge < 0 {
                            start_halfedge = -2;
                        }
                    }
                    tangent[halfedge] = Vec4::new(last_normal.x, last_normal.y, last_normal.z, K_MISSING_NORMAL);
                }

                if self.is_inside_quad(halfedge) {
                    tangent[halfedge] = Vec4::new(last_normal.x, last_normal.y, last_normal.z, K_INSIDE_QUAD);
                }

                if tangent[halfedge].w < 0.0 {
                    continue;
                }

                let different_normals = !equal_normals(next_normal, here_normal);
                if different_normals {
                    fixed_halfedge[halfedge] = true;
                    face_edges[0] = -2; // override flat face logic when multiple normals present
                }

                tangent[halfedge] = if different_normals {
                    let edge_vec = self.vert_pos[self.halfedge[halfedge].end_vert as usize]
                        - self.vert_pos[self.halfedge[halfedge].start_vert as usize];
                    let dir = cross(here_normal, next_normal);
                    let signed_dir = if dot(dir, edge_vec) < 0.0 { -dir } else { dir };
                    circular_tangent(signed_dir, edge_vec)
                } else {
                    self.tangent_from_normal(here_normal, halfedge)
                };
            }

            // All normals missing: use vertex pseudonormal
            let last_zero = last_normal == Vec3::new(0.0, 0.0, 0.0);
            if start_halfedge != -1 && last_zero {
                let vert = self.halfedge[e].start_vert as usize;
                let normal = self.vert_normal[vert];
                for &halfedge in &cycle {
                    if tangent[halfedge].w != K_INSIDE_QUAD {
                        tangent[halfedge] = self.tangent_from_normal(normal, halfedge);
                    }
                }
                continue;
            }

            // Some normals missing: orbit backwards from start_halfedge to fill in
            if start_halfedge >= 0 {
                let start = start_halfedge as usize;
                // prevNormal = GetNormal(NextHalfedge(paired(start)), normalIdx)
                let paired_start = self.halfedge[start].paired_halfedge as usize;
                let next_of_paired = next_halfedge(paired_start as i32) as usize;
                let mut prev_norm = self.get_normal(next_of_paired, normal_idx);

                let mut current = start;
                loop {
                    if tangent[current].w == K_MISSING_NORMAL {
                        let stored = Vec3::new(tangent[current].x, tangent[current].y, tangent[current].z);
                        let next_norm = if stored == Vec3::new(0.0, 0.0, 0.0) {
                            last_normal
                        } else {
                            stored
                        };

                        tangent[current] = if equal_normals(prev_norm, next_norm) {
                            self.tangent_from_normal(prev_norm, current)
                        } else {
                            let dir = cross(prev_norm, next_norm);
                            let edge_vec = self.vert_pos[self.halfedge[current].end_vert as usize]
                                - self.vert_pos[self.halfedge[current].start_vert as usize];
                            let signed_dir = if dot(dir, edge_vec) < 0.0 { -dir } else { dir };
                            circular_tangent(signed_dir, edge_vec)
                        };
                    }

                    let current_normal = self.get_normal(current, normal_idx);
                    if current_normal != Vec3::new(0.0, 0.0, 0.0) {
                        prev_norm = current_normal;
                    }
                    // advance backward: paired(PrevHalfedge(current))
                    let prev_he = prev_halfedge(current as i32) as usize;
                    current = self.halfedge[prev_he].paired_halfedge as usize;
                    if current == start {
                        break;
                    }
                }
            }

            if face_edges[0] >= 0 && face_edges[1] >= 0 {
                let f0 = face_edges[0] as usize;
                let f1 = face_edges[1] as usize;
                let edge0 = self.vert_pos[self.halfedge[f0].end_vert as usize]
                    - self.vert_pos[self.halfedge[f0].start_vert as usize];
                let edge1 = self.vert_pos[self.halfedge[f1].end_vert as usize]
                    - self.vert_pos[self.halfedge[f1].start_vert as usize];
                let new_tangent = normalize(edge0) - normalize(edge1);
                tangent[f0] = circular_tangent(new_tangent, edge0);
                tangent[f1] = circular_tangent(-new_tangent, edge1);
                // Fix these tangents to keep them aligned to the edges
                fixed_halfedge[f0] = true;
                fixed_halfedge[f1] = true;
            }
        }

        self.halfedge_tangent = tangent;
        self.distribute_tangents(&fixed_halfedge);
    }

    /// Returns true if halfedge tangents form a valid quad/triangle arrangement.
    /// Checks that kInsideQuad (-1.0) markers are consistent: paired halfedges
    /// must agree, and marked halfedges cannot be adjacent within a triangle.
    pub fn valid_tangents(&self) -> bool {
        if self.halfedge_tangent.len() != self.halfedge.len() {
            return true; // no tangents means nothing to validate
        }
        let num_halfedge = self.halfedge.len();
        for edge_idx in 0..num_halfedge {
            let in_quad = self.is_marked_inside_quad(edge_idx);
            let pair = self.halfedge[edge_idx].paired_halfedge as usize;
            if in_quad != self.is_marked_inside_quad(pair) {
                return false;
            }
            if !in_quad {
                continue;
            }
            // A kInsideQuad halfedge cannot have adjacent kInsideQuad halfedges
            let next_e = next_halfedge(edge_idx as i32) as usize;
            let prev_e = prev_halfedge(edge_idx as i32) as usize;
            let pair_next = next_halfedge(pair as i32) as usize;
            let pair_prev = prev_halfedge(pair as i32) as usize;
            if self.is_marked_inside_quad(next_e)
                || self.is_marked_inside_quad(prev_e)
                || self.is_marked_inside_quad(pair_next)
                || self.is_marked_inside_quad(pair_prev)
            {
                return false;
            }
        }
        true
    }

    pub fn create_tangents(&mut self, mut sharpened_edges: Vec<Smoothness>) {
        if self.is_empty() {
            return;
        }
        let num_halfedge = self.halfedge.len();
        let vert_halfedge = self.vert_halfedge();
        let tri_is_flat_face = self.flat_faces();
        let vert_flat_face = self.vert_flat_face(&tri_is_flat_face);
        let mut vert_normal = self.vert_normal.clone();
        for v in 0..self.num_vert() {
            if vert_flat_face[v] >= 0 {
                vert_normal[v] = self.face_normal[vert_flat_face[v] as usize];
            }
        }

        let mut tangent = vec![Vec4::new(0.0, 0.0, 0.0, 0.0); num_halfedge];
        let mut fixed_halfedge = vec![false; num_halfedge];
        for (edge_idx, tan) in tangent.iter_mut().enumerate() {
            *tan = if self.is_inside_quad(edge_idx) {
                Vec4::new(0.0, 0.0, 0.0, -1.0)
            } else {
                self.tangent_from_normal(vert_normal[self.halfedge[edge_idx].start_vert as usize], edge_idx)
            };
        }
        self.halfedge_tangent = tangent;

        for tri in 0..self.num_tri() {
            if !tri_is_flat_face[tri] {
                continue;
            }
            for j in 0..3 {
                let tri2 = self.halfedge[3 * tri + j].paired_halfedge as usize / 3;
                if !tri_is_flat_face[tri2]
                    || !self.mesh_relation.tri_ref[tri].same_face(&self.mesh_relation.tri_ref[tri2])
                {
                    sharpened_edges.push(Smoothness { halfedge: 3 * tri + j, smoothness: 0.0 });
                }
            }
        }

        type Pair = (Smoothness, Smoothness);
        let mut edges: BTreeMap<usize, Pair> = BTreeMap::new();
        for edge in sharpened_edges {
            if edge.smoothness >= 1.0 {
                continue;
            }
            let forward = self.halfedge[edge.halfedge].is_forward();
            let pair = self.halfedge[edge.halfedge].paired_halfedge as usize;
            let idx = if forward { edge.halfedge } else { pair };
            edges.entry(idx)
                .and_modify(|existing| {
                    let e = if forward { &mut existing.0 } else { &mut existing.1 };
                    e.smoothness = e.smoothness.min(edge.smoothness);
                })
                .or_insert_with(|| {
                    let mut pair_entry = (edge, Smoothness { halfedge: pair, smoothness: 1.0 });
                    if !forward {
                        pair_entry = (pair_entry.1, pair_entry.0);
                    }
                    pair_entry
                });
        }

        let mut vert_tangents: BTreeMap<usize, Vec<Pair>> = BTreeMap::new();
        for edge in edges.values() {
            vert_tangents
                .entry(self.halfedge[edge.0.halfedge].start_vert as usize)
                .or_default()
                .push(*edge);
            vert_tangents
                .entry(self.halfedge[edge.1.halfedge].start_vert as usize)
                .or_default()
                .push((edge.1, edge.0));
        }

        for v in 0..self.num_vert() {
            let Some(vert) = vert_tangents.get(&v) else {
                if vert_halfedge[v] >= 0 {
                    fixed_halfedge[vert_halfedge[v] as usize] = true;
                }
                continue;
            };

            if vert.len() == 1 {
                continue;
            }
            if vert.len() == 2 {
                let first = vert[0].0.halfedge;
                let second = vert[1].0.halfedge;
                fixed_halfedge[first] = true;
                fixed_halfedge[second] = true;
                let new_tangent =
                    normalize(vec3_from_vec4(self.halfedge_tangent[first]) - vec3_from_vec4(self.halfedge_tangent[second]));
                let pos = self.vert_pos[self.halfedge[first].start_vert as usize];
                self.halfedge_tangent[first] =
                    circular_tangent(new_tangent, self.vert_pos[self.halfedge[first].end_vert as usize] - pos);
                self.halfedge_tangent[second] =
                    circular_tangent(-new_tangent, self.vert_pos[self.halfedge[second].end_vert as usize] - pos);

                let mut smoothness = (vert[0].1.smoothness + vert[1].0.smoothness) / 2.0;
                for current in collect_vertex_cycle(self, first) {
                    if current == second {
                        smoothness = (vert[1].1.smoothness + vert[0].0.smoothness) / 2.0;
                    } else if current != first && !self.is_marked_inside_quad(current) {
                        self.sharpen_tangent(current, smoothness);
                    }
                }
            } else {
                let mut smoothness = 0.0;
                let mut denom = 0.0;
                for pair in vert {
                    smoothness += pair.0.smoothness + pair.1.smoothness;
                    denom += if pair.0.smoothness == 0.0 { 0.0 } else { 1.0 };
                    denom += if pair.1.smoothness == 0.0 { 0.0 } else { 1.0 };
                }
                if denom > 0.0 {
                    smoothness /= denom;
                }

                for current in collect_vertex_cycle(self, vert[0].0.halfedge) {
                    if !self.is_marked_inside_quad(current) {
                        let pair = self.halfedge[current].paired_halfedge as usize;
                        let s = if tri_is_flat_face[current / 3] || tri_is_flat_face[pair / 3] {
                            0.0
                        } else {
                            smoothness
                        };
                        self.sharpen_tangent(current, s);
                    }
                }
            }
        }

        self.linearize_flat_tangents();
        self.distribute_tangents(&fixed_halfedge);
    }
}
