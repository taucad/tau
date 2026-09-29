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

// Phase 15: Subdivision — ported from C++ subdivision.cpp (811 lines)
//
// Implements the full subdivision system with:
// - Partition class with cached triangulations
// - Triangle and quad subdivision
// - Barycentric interpolation for vertices and properties
// - Edge-division-based refinement

#[path = "subdivision_partition.rs"]
mod subdivision_partition;
use subdivision_partition::{BaryIndices, Partition, next3};

use crate::impl_mesh::ManifoldImpl;
use crate::linalg::{BVec4, IVec3, IVec4, Mat3, Mat3x4, Vec3, Vec4};
use crate::types::{next_halfedge, Barycentric, Halfedge, TmpEdge, TriRef};

// ---------------------------------------------------------------------------
// CreateTmpEdges — port of C++ inline CreateTmpEdges()
// ---------------------------------------------------------------------------

fn create_tmp_edges(halfedge: &[Halfedge]) -> Vec<TmpEdge> {
    let mut edges: Vec<TmpEdge> = Vec::with_capacity(halfedge.len());
    for (idx, half) in halfedge.iter().enumerate() {
        if half.is_forward() {
            edges.push(TmpEdge::new(half.start_vert, half.end_vert, idx as i32));
        }
    }
    debug_assert!(
        edges.len() == halfedge.len() / 2,
        "Not oriented! edges={} halfedges={}",
        edges.len(),
        halfedge.len()
    );
    edges
}

// ---------------------------------------------------------------------------
// ManifoldImpl methods for subdivision
// ---------------------------------------------------------------------------

impl ManifoldImpl {
    /// Port of C++ Manifold::Impl::GetNeighbor(int tri)
    pub fn get_neighbor(&self, tri: i32) -> i32 {
        let mut neighbor: i32 = -1;
        for i in 0..3 {
            if self.is_marked_inside_quad((3 * tri + i) as usize) {
                neighbor = if neighbor == -1 { i } else { -2 };
            }
        }
        neighbor
    }

    /// Port of C++ Manifold::Impl::GetHalfedges(int tri)
    pub fn get_halfedges_quad(&self, tri: i32) -> IVec4 {
        let mut halfedges = IVec4::new(-1, -1, -1, -1);
        for i in 0..3 {
            halfedges[i] = 3 * tri + i as i32;
        }
        let neighbor = self.get_neighbor(tri);
        if neighbor >= 0 {
            // quad
            let pair = self.halfedge[(3 * tri + neighbor) as usize].paired_halfedge;
            if pair / 3 < tri {
                return IVec4::new(-1, -1, -1, -1); // only process lower tri index
            }
            halfedges[2] = next_halfedge(halfedges[neighbor as usize]);
            halfedges[3] = next_halfedge(halfedges[2]);
            halfedges[0] = next_halfedge(pair);
            halfedges[1] = next_halfedge(halfedges[0]);
        }
        halfedges
    }

    /// Port of C++ Manifold::Impl::GetIndices(int halfedge)
    fn get_indices(&self, halfedge: i32) -> BaryIndices {
        let mut tri = halfedge / 3;
        let mut idx = halfedge % 3;
        let neighbor = self.get_neighbor(tri);
        if idx == neighbor {
            return BaryIndices { tri: -1, start4: -1, end4: -1 };
        }

        if neighbor < 0 {
            // tri
            BaryIndices { tri, start4: idx, end4: next3(idx) }
        } else {
            // quad
            let pair = self.halfedge[(3 * tri + neighbor) as usize].paired_halfedge;
            if pair / 3 < tri {
                tri = pair / 3;
                idx = if next3(neighbor) == idx { 0 } else { 1 };
            } else {
                idx = if next3(neighbor) == idx { 2 } else { 3 };
            }
            BaryIndices { tri, start4: idx, end4: (idx + 1) % 4 }
        }
    }

    /// Port of C++ Manifold::Impl::FillRetainedVerts()
    fn fill_retained_verts(&self, vert_bary: &mut [Barycentric]) {
        let num_tri = self.halfedge.len() / 3;
        for tri in 0..num_tri {
            for i in 0..3 {
                let indices = self.get_indices((3 * tri + i) as i32);
                if indices.start4 < 0 {
                    continue; // skip quad interiors
                }
                let mut uvw = Vec4::splat(0.0);
                uvw[indices.start4 as usize] = 1.0;
                vert_bary[self.halfedge[3 * tri + i].start_vert as usize] = Barycentric {
                    tri: indices.tri,
                    uvw,
                };
            }
        }
    }

    /// Port of C++ Manifold::Impl::Subdivide()
    /// edgeDivisions: takes (edge_vec, tangent0, tangent1) → number of new vertices
    pub fn subdivide(
        &mut self,
        edge_divisions: &dyn Fn(Vec3, Vec4, Vec4) -> i32,
        keep_interior: bool,
    ) -> Vec<Barycentric> {
        let edges = create_tmp_edges(&self.halfedge);
        let num_vert = self.num_vert();
        let num_edge = edges.len();
        let num_tri = self.num_tri();

        // Build half2edge mapping
        let mut half2edge = vec![0i32; 2 * num_edge];
        for (edge, tmp) in edges.iter().enumerate() {
            let idx = tmp.halfedge_idx as usize;
            half2edge[idx] = edge as i32;
            half2edge[self.halfedge[idx].paired_halfedge as usize] = edge as i32;
        }

        // Get face halfedges for each triangle
        let face_halfedges: Vec<IVec4> = (0..num_tri)
            .map(|tri| self.get_halfedges_quad(tri as i32))
            .collect();

        // Compute edge divisions
        let mut edge_added = vec![0i32; num_edge];
        for i in 0..num_edge {
            let edge = &edges[i];
            let h_idx = edge.halfedge_idx as usize;
            if self.is_marked_inside_quad(h_idx) {
                edge_added[i] = 0;
                continue;
            }
            let vec = self.vert_pos[edge.first as usize] - self.vert_pos[edge.second as usize];
            let tangent0 = if self.halfedge_tangent.is_empty() {
                Vec4::splat(0.0)
            } else {
                self.halfedge_tangent[h_idx]
            };
            let tangent1 = if self.halfedge_tangent.is_empty() {
                Vec4::splat(0.0)
            } else {
                self.halfedge_tangent[self.halfedge[h_idx].paired_halfedge as usize]
            };
            edge_added[i] = edge_divisions(vec, tangent0, tangent1);
        }

        // Optional: add extra divisions to short edges for interior thickness
        if keep_interior {
            let orig_edge_added = edge_added.clone();
            for i in 0..num_edge {
                let edge = &edges[i];
                let h_idx = edge.halfedge_idx as usize;
                if self.is_marked_inside_quad(h_idx) {
                    continue;
                }

                let this_added = orig_edge_added[i];
                let added_fn = |mut h: i32| -> i32 {
                    let mut longest = 0;
                    let mut total = 0;
                    for _ in 0..3 {
                        let added = orig_edge_added[half2edge[h as usize] as usize];
                        longest = longest.max(added);
                        total += added;
                        h = next_halfedge(h);
                        if self.is_marked_inside_quad(h as usize) {
                            longest = 0;
                            total = 1;
                            break;
                        }
                    }
                    let min_extra = (longest as f64 * 0.2) as i32 + 1;
                    let extra = 2 * longest + min_extra - total;
                    if longest == 0 {
                        return 0;
                    }
                    if extra > 0 {
                        (extra * (longest - this_added)) / longest
                    } else {
                        0
                    }
                };

                let a1 = added_fn(h_idx as i32);
                let a2 = added_fn(self.halfedge[h_idx].paired_halfedge);
                edge_added[i] = orig_edge_added[i] + a1.max(a2);
            }
        }

        // Compute edge offsets (exclusive scan)
        let mut edge_offset = vec![0i32; num_edge];
        let mut acc = num_vert as i32;
        for i in 0..num_edge {
            edge_offset[i] = acc;
            acc += edge_added[i];
        }

        // Allocate vert_bary
        let total_edge_verts = acc - num_vert as i32;
        let mut vert_bary = vec![
            Barycentric {
                tri: 0,
                uvw: Vec4::splat(0.0)
            };
            acc as usize
        ];
        self.fill_retained_verts(&mut vert_bary);

        // Fill edge vertex barycentric coords
        for i in 0..num_edge {
            let n = edge_added[i];
            let offset = edge_offset[i];
            let indices = self.get_indices(edges[i].halfedge_idx);
            if indices.tri < 0 {
                continue; // inside quad
            }
            let frac = 1.0 / (n as f64 + 1.0);
            for j in 0..n {
                let mut uvw = Vec4::splat(0.0);
                uvw[indices.end4 as usize] = (j + 1) as f64 * frac;
                uvw[indices.start4 as usize] = 1.0 - uvw[indices.end4 as usize];
                vert_bary[(offset + j) as usize] = Barycentric { tri: indices.tri, uvw };
            }
        }

        // Generate partitions for each triangle
        let sub_tris: Vec<Partition> = (0..num_tri)
            .map(|tri| {
                let halfedges = face_halfedges[tri];
                let mut divisions = IVec4::default();
                for i in 0..4 {
                    if halfedges[i] >= 0 {
                        divisions[i] = edge_added[half2edge[halfedges[i] as usize] as usize] + 1;
                    }
                }
                Partition::get_partition(divisions)
            })
            .collect();

        // Compute triangle offsets (exclusive scan)
        let mut tri_offset = vec![0i32; num_tri];
        {
            let mut acc = 0i32;
            for tri in 0..num_tri {
                tri_offset[tri] = acc;
                acc += sub_tris[tri].tri_vert.len() as i32;
            }
        }

        // Compute interior vertex offsets (exclusive scan)
        let mut interior_offset = vec![0i32; num_tri];
        {
            let mut acc = vert_bary.len() as i32;
            for tri in 0..num_tri {
                interior_offset[tri] = acc;
                acc += sub_tris[tri].num_interior();
            }
        }

        // Allocate output arrays
        let total_new_tris = if num_tri > 0 {
            tri_offset[num_tri - 1] + sub_tris[num_tri - 1].tri_vert.len() as i32
        } else {
            0
        };
        let total_new_verts = if num_tri > 0 {
            interior_offset[num_tri - 1] + sub_tris[num_tri - 1].num_interior()
        } else {
            vert_bary.len() as i32
        };

        let mut tri_verts = vec![IVec3::default(); total_new_tris as usize];
        vert_bary.resize(
            total_new_verts as usize,
            Barycentric { tri: 0, uvw: Vec4::splat(0.0) },
        );
        let mut tri_ref_out = vec![TriRef::default(); total_new_tris as usize];
        let mut face_normal_out = vec![Vec3::splat(0.0); total_new_tris as usize];

        // Build new triangles
        for tri in 0..num_tri {
            let halfedges = face_halfedges[tri];
            if halfedges[0] < 0 {
                continue;
            }

            let mut tri3 = IVec4::default();
            let mut edge_offs = IVec4::default();
            let mut edge_fwd = BVec4::splat(false);
            for i in 0..4 {
                if halfedges[i] < 0 {
                    tri3[i] = -1;
                    continue;
                }
                let he = &self.halfedge[halfedges[i] as usize];
                tri3[i] = he.start_vert;
                edge_offs[i] = edge_offset[half2edge[halfedges[i] as usize] as usize];
                edge_fwd[i] = he.is_forward();
            }

            let new_tris = sub_tris[tri].reindex(
                tri3,
                edge_offs,
                edge_fwd,
                interior_offset[tri],
            );

            let start = tri_offset[tri] as usize;
            for (j, t) in new_tris.iter().enumerate() {
                tri_verts[start + j] = *t;
                tri_ref_out[start + j] = self.mesh_relation.tri_ref[tri];
                face_normal_out[start + j] = self.face_normal[tri];
            }

            // Map interior barycentric coordinates
            let idx = sub_tris[tri].idx;
            let v_idx = if halfedges[3] >= 0 || idx[1] == next3(idx[0]) {
                idx
            } else {
                IVec4::new(idx[2], idx[0], idx[1], idx[3])
            };
            let mut r_idx = IVec4::default();
            for i in 0..4 {
                r_idx[v_idx[i] as usize] = i as i32;
            }

            let sub_bary = &sub_tris[tri].vert_bary;
            let int_off = sub_tris[tri].interior_offset() as usize;
            for (j, bary) in sub_bary[int_off..].iter().enumerate() {
                vert_bary[interior_offset[tri] as usize + j] = Barycentric {
                    tri: tri as i32,
                    uvw: Vec4::new(
                        bary[r_idx[0] as usize],
                        bary[r_idx[1] as usize],
                        bary[r_idx[2] as usize],
                        bary[r_idx[3] as usize],
                    ),
                };
            }
        }

        self.mesh_relation.tri_ref = tri_ref_out;
        self.face_normal = face_normal_out;

        // Compute new vertex positions
        let mut new_vert_pos = vec![Vec3::splat(0.0); vert_bary.len()];
        for (vert, bary) in vert_bary.iter().enumerate() {
            let halfedges = face_halfedges[bary.tri as usize];
            if halfedges[3] < 0 {
                // triangle
                let tri_pos = Mat3::from_cols(
                    self.vert_pos[self.halfedge[halfedges[0] as usize].start_vert as usize],
                    self.vert_pos[self.halfedge[halfedges[1] as usize].start_vert as usize],
                    self.vert_pos[self.halfedge[halfedges[2] as usize].start_vert as usize],
                );
                new_vert_pos[vert] = tri_pos * bary.uvw.xyz();
            } else {
                // quad
                let quad_pos = Mat3x4::from_cols(
                    self.vert_pos[self.halfedge[halfedges[0] as usize].start_vert as usize],
                    self.vert_pos[self.halfedge[halfedges[1] as usize].start_vert as usize],
                    self.vert_pos[self.halfedge[halfedges[2] as usize].start_vert as usize],
                    self.vert_pos[self.halfedge[halfedges[3] as usize].start_vert as usize],
                );
                new_vert_pos[vert] = quad_pos * bary.uvw;
            }
        }
        self.vert_pos = new_vert_pos;

        // Handle properties
        if self.num_prop > 0 {
            let num_prop_vert = self.num_prop_vert();
            let added_verts = self.num_vert() - num_vert;
            let prop_offset = num_prop_vert as i32 - num_vert as i32;
            let num_prop = self.num_prop as usize;

            // Allocate new property array
            let mut prop =
                vec![0.0f64; num_prop * (num_prop_vert + added_verts + total_edge_verts as usize)];

            // Copy retained prop verts
            for (i, &v) in self.properties.iter().enumerate() {
                prop[i] = v;
            }

            // Copy interior prop verts and forward edge prop verts
            for i in 0..added_verts {
                let vert = num_prop_vert + i;
                let bary = &vert_bary[num_vert + i];
                let halfedges = face_halfedges[bary.tri as usize];

                for p in 0..num_prop {
                    if halfedges[3] < 0 {
                        // triangle
                        let mut tri_prop = Vec3::splat(0.0);
                        for k in 0..3 {
                            tri_prop[k] = self.properties
                                [self.halfedge[3 * bary.tri as usize + k].prop_vert as usize
                                    * num_prop
                                    + p];
                        }
                        prop[vert * num_prop + p] =
                            tri_prop.x * bary.uvw.x + tri_prop.y * bary.uvw.y + tri_prop.z * bary.uvw.z;
                    } else {
                        // quad
                        let mut quad_prop = Vec4::splat(0.0);
                        for k in 0..4 {
                            quad_prop[k] = self.properties
                                [self.halfedge[halfedges[k] as usize].prop_vert as usize
                                    * num_prop
                                    + p];
                        }
                        prop[vert * num_prop + p] = quad_prop.x * bary.uvw.x
                            + quad_prop.y * bary.uvw.y
                            + quad_prop.z * bary.uvw.z
                            + quad_prop.w * bary.uvw.w;
                    }
                }
            }

            // Copy backward edge prop verts
            for i in 0..num_edge {
                let n = edge_added[i];
                let offset = edge_offset[i] as usize + prop_offset as usize + added_verts;
                let frac = 1.0 / (n as f64 + 1.0);
                let halfedge_idx =
                    self.halfedge[edges[i].halfedge_idx as usize].paired_halfedge as usize;
                let prop0 = self.halfedge[halfedge_idx].prop_vert as usize;
                let prop1 =
                    self.halfedge[next_halfedge(halfedge_idx as i32) as usize].prop_vert as usize;
                for j in 0..n as usize {
                    for p in 0..num_prop {
                        let t = (j + 1) as f64 * frac;
                        prop[(offset + j) * num_prop + p] = self.properties[prop0 * num_prop + p]
                            + (self.properties[prop1 * num_prop + p]
                                - self.properties[prop0 * num_prop + p])
                                * t;
                    }
                }
            }

            // Build property triangles
            let mut tri_prop_out = vec![IVec3::default(); total_new_tris as usize];
            for tri in 0..num_tri {
                let halfedges = face_halfedges[tri];
                if halfedges[0] < 0 {
                    continue;
                }

                let mut tri3 = IVec4::default();
                let mut edge_offs = IVec4::default();
                let mut edge_fwd = BVec4::splat(true);
                for i in 0..4 {
                    if halfedges[i] < 0 {
                        tri3[i] = -1;
                        continue;
                    }
                    let he = &self.halfedge[halfedges[i] as usize];
                    tri3[i] = he.prop_vert;
                    edge_offs[i] = edge_offset[half2edge[halfedges[i] as usize] as usize];
                    if !he.is_forward() {
                        let paired = he.paired_halfedge;
                        if self.halfedge[paired as usize].prop_vert
                            != self.halfedge[next_halfedge(halfedges[i]) as usize].prop_vert
                            || self.halfedge[next_halfedge(paired) as usize].prop_vert
                                != he.prop_vert
                        {
                            // edge doesn't match, point to backward edge propverts
                            edge_offs[i] += added_verts as i32;
                        } else {
                            edge_fwd[i] = false;
                        }
                    }
                }

                // Add prop_offset to edge offsets
                let prop_edge_offs = IVec4::new(
                    edge_offs[0] + prop_offset,
                    edge_offs[1] + prop_offset,
                    edge_offs[2] + prop_offset,
                    edge_offs[3] + prop_offset,
                );

                let new_tris = sub_tris[tri].reindex(
                    tri3,
                    prop_edge_offs,
                    edge_fwd,
                    interior_offset[tri] + prop_offset,
                );

                let start = tri_offset[tri] as usize;
                for (j, t) in new_tris.iter().enumerate() {
                    tri_prop_out[start + j] = *t;
                }
            }

            self.properties = prop;
            self.create_halfedges(&tri_prop_out, &tri_verts);
        } else {
            self.create_halfedges(&tri_verts, &[]);
        }

        vert_bary
    }
}

/// Simple midpoint subdivision: each triangle is split into 4 by inserting
/// edge midpoints. This is a convenience wrapper that uses uniform n=2 divisions.
pub fn subdivide_impl(mesh: &ManifoldImpl, levels: usize) -> ManifoldImpl {
    if levels == 0 || mesh.is_empty() {
        return mesh.clone();
    }

    let mut current = mesh.clone();
    for _ in 0..levels {
        current.subdivide(&|_vec, _t0, _t1| 1, false);
        current.calculate_bbox();
        current.set_epsilon(-1.0, false);
    }

    current
}

#[cfg(test)]
#[path = "subdivision_tests.rs"]
mod tests;
