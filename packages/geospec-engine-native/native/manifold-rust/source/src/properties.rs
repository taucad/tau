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

// Phase 8: Properties — ported from src/properties.cpp
//
// Mesh property calculations: volume, surface area, curvature, convexity,
// triangle validation, and degenerate detection.

use crate::face_op::get_axis_aligned_projection;
use crate::impl_mesh::ManifoldImpl;
use crate::linalg::{cross, dot, length, IVec3, Vec3};
use crate::math;
use crate::polygon::ccw;
use crate::types::K_TWO_PI;

/// Which scalar property to compute over the mesh.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Property {
    SurfaceArea,
    Volume,
}

impl ManifoldImpl {
    /// Compute a global scalar property (volume or surface area) using Kahan
    /// summation for numerical stability.
    pub fn get_property(&self, prop: Property) -> f64 {
        if self.is_empty() {
            return 0.0;
        }

        let mut value: f64 = 0.0;
        let mut compensation: f64 = 0.0;

        for tri in 0..self.num_tri() {
            let sv = self.halfedge[3 * tri].start_vert;
            if sv < 0 {
                continue;
            }
            let v0 = self.vert_pos[sv as usize];
            let v1 = self.vert_pos[self.halfedge[3 * tri + 1].start_vert as usize];
            let v2 = self.vert_pos[self.halfedge[3 * tri + 2].start_vert as usize];

            let value1 = match prop {
                Property::Volume => {
                    let cross_p = cross(v1 - v0, v2 - v0);
                    dot(cross_p, v0) / 6.0
                }
                Property::SurfaceArea => {
                    length(cross(v1 - v0, v2 - v0)) / 2.0
                }
            };

            let t = value + value1;
            compensation += (value - t) + value1;
            value = t;
        }
        value + compensation
    }

    /// Returns true if all triangles are CCW relative to their face normals.
    pub fn matches_tri_normals(&self) -> bool {
        if self.halfedge.is_empty() || self.face_normal.len() != self.num_tri() {
            return true;
        }
        for face in 0..self.num_tri() {
            if self.halfedge[3 * face].paired_halfedge < 0 {
                continue;
            }

            let projection = get_axis_aligned_projection(self.face_normal[face]);
            let mut v = [crate::linalg::Vec2::new(0.0, 0.0); 3];
            let mut max_d = f64::NEG_INFINITY;
            let mut min_d = f64::INFINITY;
            let mut any_non_finite = false;

            for i in 0..3 {
                let p = self.vert_pos[self.halfedge[3 * face + i].start_vert as usize];
                v[i] = projection.apply(p);
                let d = dot(p, self.face_normal[face]);
                if !d.is_finite() {
                    any_non_finite = true;
                    break;
                }
                max_d = max_d.max(d);
                min_d = min_d.min(d);
            }

            if any_non_finite {
                continue;
            }
            if max_d - min_d > 2.0 * self.tolerance {
                return false;
            }

            let winding = ccw(v[0], v[1], v[2], self.epsilon * 2.0);
            if winding < 0 {
                return false;
            }
        }
        true
    }

    /// Returns the number of triangles that are colinear within epsilon.
    pub fn num_degenerate_tris(&self) -> i32 {
        if self.halfedge.is_empty() || self.face_normal.len() != self.num_tri() {
            return 0;
        }
        let mut count = 0i32;
        for face in 0..self.num_tri() {
            if self.halfedge[3 * face].paired_halfedge < 0 {
                count += 1;
                continue;
            }

            let projection = get_axis_aligned_projection(self.face_normal[face]);
            let mut v = [crate::linalg::Vec2::new(0.0, 0.0); 3];
            for i in 0..3 {
                v[i] = projection.apply(
                    self.vert_pos[self.halfedge[3 * face + i].start_vert as usize],
                );
            }

            // Per #1671: degeneracy is judged within tolerance_, not epsilon_.
            let winding = ccw(v[0], v[1], v[2], self.tolerance / 2.0);
            if winding == 0 {
                count += 1;
            }
        }
        count
    }

    /// Returns true if the manifold is genus 0 and contains no concave edges.
    pub fn is_convex(&self) -> bool {
        let chi = self.num_vert() as i64 - self.num_edge() as i64 + self.num_tri() as i64;
        let genus = 1 - chi / 2;
        if genus != 0 {
            return false;
        }

        let nb_edges = self.halfedge.len();
        for idx in 0..nb_edges {
            let edge = &self.halfedge[idx];
            if !edge.is_forward() {
                continue;
            }

            let normal0 = self.face_normal[idx / 3];
            let normal1 = self.face_normal[edge.paired_halfedge as usize / 3];

            if normal0 == normal1 {
                continue;
            }

            let edge_vec =
                self.vert_pos[edge.end_vert as usize] - self.vert_pos[edge.start_vert as usize];
            let convex = dot(edge_vec, cross(normal0, normal1)) > 0.0;
            if !convex {
                return false;
            }
        }
        true
    }

    /// Compute Gaussian and/or mean curvature per vertex, storing results
    /// into the property channels at the given indices. Pass -1 to skip.
    pub fn calculate_curvature(&mut self, gaussian_idx: i32, mean_idx: i32) {
        if self.is_empty() {
            return;
        }
        if gaussian_idx < 0 && mean_idx < 0 {
            return;
        }

        let num_vert = self.num_vert();
        let mut mean_curvature = vec![0.0f64; num_vert];
        let mut gaussian_curvature = vec![K_TWO_PI; num_vert];
        let mut area = vec![0.0f64; num_vert];
        let mut degree = vec![0.0f64; num_vert];

        for tri in 0..self.num_tri() {
            let mut edge_dirs = [Vec3::new(0.0, 0.0, 0.0); 3];
            let mut edge_length = [0.0f64; 3];

            for i in 0..3 {
                let start_vert = self.halfedge[3 * tri + i].start_vert as usize;
                let end_vert = self.halfedge[3 * tri + i].end_vert as usize;
                edge_dirs[i] = self.vert_pos[end_vert] - self.vert_pos[start_vert];
                edge_length[i] = length(edge_dirs[i]);
                if edge_length[i] > 0.0 {
                    edge_dirs[i] = edge_dirs[i] / edge_length[i];
                }

                let neighbor_tri = self.halfedge[3 * tri + i].paired_halfedge as usize / 3;
                let dihedral = 0.25
                    * edge_length[i]
                    * math::asin(dot(
                        cross(self.face_normal[tri], self.face_normal[neighbor_tri]),
                        edge_dirs[i],
                    ));
                mean_curvature[start_vert] += dihedral;
                mean_curvature[end_vert] += dihedral;
                degree[start_vert] += 1.0;
            }

            let phi0 = math::acos(-dot(edge_dirs[2], edge_dirs[0]));
            let phi1 = math::acos(-dot(edge_dirs[0], edge_dirs[1]));
            let phi2 = std::f64::consts::PI - phi0 - phi1;
            let area3 = edge_length[0] * edge_length[1] * length(cross(edge_dirs[0], edge_dirs[1]))
                / 6.0;

            let phi = [phi0, phi1, phi2];
            for i in 0..3 {
                let vert = self.halfedge[3 * tri + i].start_vert as usize;
                gaussian_curvature[vert] -= phi[i];
                area[vert] += area3;
            }
        }

        for vert in 0..num_vert {
            let factor = degree[vert] / (6.0 * area[vert]);
            mean_curvature[vert] *= factor;
            gaussian_curvature[vert] *= factor;
        }

        let old_num_prop = self.num_prop;
        let num_prop = old_num_prop
            .max(if gaussian_idx >= 0 { gaussian_idx as usize + 1 } else { 0 })
            .max(if mean_idx >= 0 { mean_idx as usize + 1 } else { 0 });

        let old_properties = self.properties.clone();
        let num_prop_vert = self.num_prop_vert();
        self.properties = vec![0.0f64; num_prop * num_prop_vert];
        self.num_prop = num_prop;

        let mut visited = vec![false; num_prop_vert];

        for tri in 0..self.num_tri() {
            for i in 0..3 {
                let edge = &self.halfedge[3 * tri + i];
                let vert = edge.start_vert as usize;
                let prop_vert = edge.prop_vert as usize;

                if visited[prop_vert] {
                    continue;
                }
                visited[prop_vert] = true;

                for p in 0..old_num_prop {
                    self.properties[num_prop * prop_vert + p] =
                        old_properties[old_num_prop * prop_vert + p];
                }

                if gaussian_idx >= 0 {
                    self.properties[num_prop * prop_vert + gaussian_idx as usize] =
                        gaussian_curvature[vert];
                }
                if mean_idx >= 0 {
                    self.properties[num_prop * prop_vert + mean_idx as usize] =
                        mean_curvature[vert];
                }
            }
        }
    }

    /// Checks that all indices in the given triVerts array are within the
    /// bounds of vert_pos.
    pub fn is_index_in_bounds(&self, tri_verts: &[IVec3]) -> bool {
        if tri_verts.is_empty() {
            return true;
        }
        let num_vert = self.num_vert() as i32;
        for tri in tri_verts {
            let min_v = tri.x.min(tri.y).min(tri.z);
            let max_v = tri.x.max(tri.y).max(tri.z);
            if min_v < 0 || max_v >= num_vert {
                return false;
            }
        }
        true
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::linalg::Mat3x4;

    #[test]
    fn test_tetrahedron_volume() {
        let m = ManifoldImpl::tetrahedron(&Mat3x4::identity());
        let vol = m.get_property(Property::Volume);
        // Regular tetrahedron with edge length 2*sqrt(2), vertices at distance
        // sqrt(3) from origin. Volume = 8/3.
        assert!(
            (vol.abs() - 8.0 / 3.0).abs() < 1e-10,
            "Expected volume ~2.6667, got {}",
            vol
        );
    }

    #[test]
    fn test_cube_volume() {
        let m = ManifoldImpl::cube(&Mat3x4::identity());
        let vol = m.get_property(Property::Volume);
        assert!(
            (vol.abs() - 1.0).abs() < 1e-10,
            "Expected unit cube volume = 1.0, got {}",
            vol
        );
    }

    #[test]
    fn test_cube_surface_area() {
        let m = ManifoldImpl::cube(&Mat3x4::identity());
        let area = m.get_property(Property::SurfaceArea);
        assert!(
            (area - 6.0).abs() < 1e-10,
            "Expected unit cube surface area = 6.0, got {}",
            area
        );
    }

    #[test]
    fn test_octahedron_volume() {
        let m = ManifoldImpl::octahedron(&Mat3x4::identity());
        let vol = m.get_property(Property::Volume);
        // Regular octahedron with vertices at ±1 on each axis: volume = 4/3
        assert!(
            (vol.abs() - 4.0 / 3.0).abs() < 1e-10,
            "Expected octahedron volume ~1.3333, got {}",
            vol
        );
    }

    #[test]
    fn test_octahedron_surface_area() {
        let m = ManifoldImpl::octahedron(&Mat3x4::identity());
        let area = m.get_property(Property::SurfaceArea);
        // 8 equilateral triangles with edge length sqrt(2), each area = sqrt(3)/2
        // Total = 8 * sqrt(3)/2 ≈ 6.9282
        let expected = 4.0 * 3.0_f64.sqrt();
        assert!(
            (area - expected).abs() < 1e-10,
            "Expected octahedron surface area ~{}, got {}",
            expected,
            area
        );
    }

    #[test]
    fn test_empty_mesh_properties() {
        let m = ManifoldImpl::new();
        assert_eq!(m.get_property(Property::Volume), 0.0);
        assert_eq!(m.get_property(Property::SurfaceArea), 0.0);
    }

    #[test]
    fn test_matches_tri_normals_cube() {
        let m = ManifoldImpl::cube(&Mat3x4::identity());
        assert!(
            m.matches_tri_normals(),
            "Cube should have CCW triangles matching normals"
        );
    }

    #[test]
    fn test_matches_tri_normals_tetrahedron() {
        let m = ManifoldImpl::tetrahedron(&Mat3x4::identity());
        assert!(
            m.matches_tri_normals(),
            "Tetrahedron should have CCW triangles matching normals"
        );
    }

    #[test]
    fn test_num_degenerate_tris_cube() {
        let m = ManifoldImpl::cube(&Mat3x4::identity());
        assert_eq!(
            m.num_degenerate_tris(),
            0,
            "Cube should have no degenerate triangles"
        );
    }

    #[test]
    fn test_num_degenerate_tris_tetrahedron() {
        let m = ManifoldImpl::tetrahedron(&Mat3x4::identity());
        assert_eq!(
            m.num_degenerate_tris(),
            0,
            "Tetrahedron should have no degenerate triangles"
        );
    }

    #[test]
    fn test_is_convex_cube() {
        let m = ManifoldImpl::cube(&Mat3x4::identity());
        assert!(m.is_convex(), "Unit cube should be convex");
    }

    #[test]
    fn test_is_convex_tetrahedron() {
        let m = ManifoldImpl::tetrahedron(&Mat3x4::identity());
        assert!(m.is_convex(), "Tetrahedron should be convex");
    }

    #[test]
    fn test_is_convex_octahedron() {
        let m = ManifoldImpl::octahedron(&Mat3x4::identity());
        assert!(m.is_convex(), "Octahedron should be convex");
    }

    #[test]
    fn test_is_index_in_bounds() {
        let m = ManifoldImpl::cube(&Mat3x4::identity());
        let valid = vec![IVec3::new(0, 1, 2), IVec3::new(3, 4, 5)];
        assert!(m.is_index_in_bounds(&valid));

        let invalid = vec![IVec3::new(0, 1, 100)];
        assert!(!m.is_index_in_bounds(&invalid));

        let negative = vec![IVec3::new(-1, 0, 1)];
        assert!(!m.is_index_in_bounds(&negative));

        assert!(m.is_index_in_bounds(&[]));
    }

    #[test]
    fn test_calculate_curvature_cube() {
        let mut m = ManifoldImpl::cube(&Mat3x4::identity());
        m.calculate_curvature(0, 1);
        assert_eq!(m.num_prop, 2);
        assert!(!m.properties.is_empty(), "Properties should be populated");
    }

    #[test]
    fn test_calculate_curvature_skip_both() {
        let mut m = ManifoldImpl::cube(&Mat3x4::identity());
        let old_props = m.properties.clone();
        let old_num_prop = m.num_prop;
        m.calculate_curvature(-1, -1);
        assert_eq!(m.num_prop, old_num_prop);
        assert_eq!(m.properties, old_props);
    }

    #[test]
    fn test_scaled_cube_volume() {
        use crate::linalg::{mat4_to_mat3x4, scaling_matrix};
        let scale = Vec3::new(2.0, 3.0, 4.0);
        let t = mat4_to_mat3x4(scaling_matrix(scale));
        let m = ManifoldImpl::cube(&t);
        let vol = m.get_property(Property::Volume);
        assert!(
            (vol.abs() - 24.0).abs() < 1e-10,
            "Expected 2×3×4 cube volume = 24.0, got {}",
            vol
        );
    }

    #[test]
    fn test_scaled_cube_surface_area() {
        use crate::linalg::{mat4_to_mat3x4, scaling_matrix};
        let scale = Vec3::new(2.0, 3.0, 4.0);
        let t = mat4_to_mat3x4(scaling_matrix(scale));
        let m = ManifoldImpl::cube(&t);
        let area = m.get_property(Property::SurfaceArea);
        // 2(2*3 + 2*4 + 3*4) = 2(6+8+12) = 52
        assert!(
            (area - 52.0).abs() < 1e-10,
            "Expected 2×3×4 cube surface area = 52.0, got {}",
            area
        );
    }
}
