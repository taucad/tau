// types_meshgl.rs — MeshGLP: the GL-style interchange mesh representation.
//
// Ported from include/manifold/manifold.h (MeshGLP) and src/manifold.cpp
// (MeshGL::Merge, MeshGL::UpdateNormals). Extracted from types.rs, which
// re-exports MeshGLP / MeshGL / MeshGL64 so external paths
// (`crate::types::MeshGL`, ...) are unchanged. Meshes enter and leave the
// library in this form; impl_mesh.rs / manifold_meshgl.rs convert between it
// and the internal halfedge representation.

use crate::linalg::Vec3;
use crate::types::Box;

/// Precision parameter of a [`MeshGLP`] (`f32` or `f64`). Mirrors the
/// `Precision` template parameter of the C++ `MeshGLP`: conversions to and
/// from the kernel's internal `f64` happen through this trait, so the f32
/// instantiation narrows exactly where the C++ float instantiation does and
/// the f64 instantiation is lossless end to end.
pub trait MeshPrecision: Copy + Default {
    /// True for `f32`. The exported tolerance is floored at
    /// `f32::EPSILON * bbox.scale()` only for single precision, matching the
    /// `std::is_same<Precision, float>` checks in the C++ template.
    const IS_SINGLE: bool;
    fn to_f64(self) -> f64;
    fn from_f64(v: f64) -> Self;
}

impl MeshPrecision for f32 {
    const IS_SINGLE: bool = true;
    fn to_f64(self) -> f64 { self as f64 }
    fn from_f64(v: f64) -> Self { v as f32 }
}

impl MeshPrecision for f64 {
    const IS_SINGLE: bool = false;
    fn to_f64(self) -> f64 { self }
    fn from_f64(v: f64) -> Self { v }
}

/// Index parameter of a [`MeshGLP`] (`u32` or `u64`), mirroring the `I`
/// template parameter of the C++ `MeshGLP`. The kernel itself indexes with
/// 32 bits for both instantiations (as the C++ does — its import casts every
/// index to `uint32_t`), so `u64` indices wider than 32 bits truncate on
/// import exactly like the C++ `static_cast`.
pub trait MeshIndex: Copy + Default {
    fn to_u64(self) -> u64;
    fn from_usize(v: usize) -> Self;
    /// Conversion from the kernel's `int` indices on export. Matches C++
    /// integral conversion: bit-pattern for u32, sign-extension for u64.
    fn from_i32(v: i32) -> Self;
}

impl MeshIndex for u32 {
    fn to_u64(self) -> u64 { self as u64 }
    fn from_usize(v: usize) -> Self { v as u32 }
    fn from_i32(v: i32) -> Self { v as u32 }
}

impl MeshIndex for u64 {
    fn to_u64(self) -> u64 { self }
    fn from_usize(v: usize) -> Self { v as u64 }
    fn from_i32(v: i32) -> Self { v as i64 as u64 }
}

/// GL-style mesh representation. Generic over precision (f32/f64) and index type (u32/u64).
#[derive(Clone, Debug, Default)]
pub struct MeshGLP<P: Copy + Default, I: Copy + Default = u32> {
    /// Number of properties per vertex, always >= 3.
    pub num_prop: I,
    /// Flat interleaved vertex properties: [x, y, z, ...] × num_verts.
    pub vert_properties: Vec<P>,
    /// Triangle vertex indices, 3 per triangle (CCW from outside).
    pub tri_verts: Vec<I>,
    /// Optional: merge-from vertex indices.
    pub merge_from_vert: Vec<I>,
    /// Optional: merge-to vertex indices.
    pub merge_to_vert: Vec<I>,
    /// Optional: run start indices into triVerts.
    pub run_index: Vec<I>,
    /// Optional: original mesh ID per run.
    pub run_original_id: Vec<u32>,
    /// Optional: 3×4 column-major transform per run (12 elements each).
    pub run_transform: Vec<P>,
    /// Optional: source face ID per triangle.
    pub face_id: Vec<I>,
    /// Optional: halfedge tangent vectors (4 per halfedge).
    pub halfedge_tangent: Vec<P>,
    /// Optional: per-run flags; 1 = backside (normals need flipping).
    pub run_flags: Vec<u8>,
    /// Tolerance for mesh simplification.
    pub tolerance: P,
}

impl<P: MeshPrecision, I: MeshIndex> MeshGLP<P, I> {
    pub fn num_vert(&self) -> usize {
        if self.num_prop.to_u64() == 0 {
            0
        } else {
            self.vert_properties.len() / self.num_prop.to_u64() as usize
        }
    }

    pub fn num_tri(&self) -> usize {
        self.tri_verts.len() / 3
    }

    pub fn get_vert_pos(&self, v: usize) -> [P; 3] {
        let offset = v * self.num_prop.to_u64() as usize;
        [self.vert_properties[offset], self.vert_properties[offset + 1], self.vert_properties[offset + 2]]
    }

    pub fn get_tri_verts(&self, t: usize) -> [I; 3] {
        let offset = 3 * t;
        [self.tri_verts[offset], self.tri_verts[offset + 1], self.tri_verts[offset + 2]]
    }

    pub fn get_tangent(&self, h: usize) -> [P; 4] {
        let offset = 4 * h;
        [
            self.halfedge_tangent[offset],
            self.halfedge_tangent[offset + 1],
            self.halfedge_tangent[offset + 2],
            self.halfedge_tangent[offset + 3],
        ]
    }
}

impl MeshGLP<f32, u32> {
    /// Merges coincident vertices based on position within tolerance.
    /// Uses BVH collision detection to find open edges, then groups
    /// coincident vertices via union-find. Returns true if new merges
    /// were found, false if the mesh was already fully merged.
    pub fn merge(&mut self) -> bool {
        use crate::collider::Collider;
        use crate::disjoint_sets::DisjointSets;
        use crate::sort::morton_code;
        use std::collections::BTreeSet;

        let num_vert = self.num_vert();
        let num_tri = self.num_tri();

        // Build initial merge map from existing merge vectors
        let mut merge_map: Vec<usize> = (0..num_vert).collect();
        for i in 0..self.merge_from_vert.len() {
            merge_map[self.merge_from_vert[i] as usize] = self.merge_to_vert[i] as usize;
        }

        // Find open (non-manifold) edges
        let next = [1usize, 2, 0];
        let mut open_edges: BTreeSet<(usize, usize)> = BTreeSet::new();
        for tri in 0..num_tri {
            for i in 0..3 {
                let a = merge_map[self.tri_verts[3 * tri + next[i]] as usize];
                let b = merge_map[self.tri_verts[3 * tri + i] as usize];
                let edge = (a, b);
                // Look for the reverse edge
                let rev = (b, a);
                if open_edges.contains(&rev) {
                    open_edges.remove(&rev);
                } else {
                    open_edges.insert(edge);
                }
            }
        }

        if open_edges.is_empty() {
            return false;
        }

        // Collect unique open vertices — only the START vertex of each open
        // halfedge, matching C++ which stores (start,end) and takes edge.first=start.
        // Our BTreeSet stores (end,start) so we take edge.1 (= b = start vertex).
        let open_verts: Vec<usize> = {
            let mut vset = std::collections::BTreeSet::new();
            for (_a, b) in &open_edges {
                vset.insert(*b);
            }
            vset.into_iter().collect()
        };
        let num_open = open_verts.len();

        // Compute bounding box
        let mut bbox = Box::default();
        for v in 0..num_vert {
            let pos = self.get_vert_pos(v);
            let p = Vec3::new(pos[0] as f64, pos[1] as f64, pos[2] as f64);
            bbox.union_point(p);
        }

        let tolerance = f64::max(
            self.tolerance as f64,
            f32::EPSILON as f64 * bbox.scale(),
        );

        // Build BVH boxes and morton codes for open vertices
        let mut vert_box: Vec<Box> = Vec::with_capacity(num_open);
        let mut vert_morton: Vec<u32> = Vec::with_capacity(num_open);
        for &v in &open_verts {
            let pos = self.get_vert_pos(v);
            let center = Vec3::new(pos[0] as f64, pos[1] as f64, pos[2] as f64);
            let half_tol = tolerance / 2.0;
            let bx = Box::from_points(
                center - Vec3::new(half_tol, half_tol, half_tol),
                center + Vec3::new(half_tol, half_tol, half_tol),
            );
            vert_box.push(bx);
            vert_morton.push(morton_code(center, &bbox));
        }

        // Sort by morton code
        let mut order: Vec<usize> = (0..num_open).collect();
        order.sort_by_key(|&i| vert_morton[i]);

        let sorted_box: Vec<Box> = order.iter().map(|&i| vert_box[i]).collect();
        let sorted_morton: Vec<u32> = order.iter().map(|&i| vert_morton[i]).collect();
        let sorted_verts: Vec<usize> = order.iter().map(|&i| open_verts[i]).collect();

        // Build collider and find coincident vertex pairs
        let collider = Collider::new(sorted_box.clone(), sorted_morton);
        let uf = DisjointSets::new(num_vert as u32);

        collider.collisions_with_boxes(&sorted_box, false, |a, b| {
            uf.unite(sorted_verts[a] as u32, sorted_verts[b] as u32);
        });

        // Also merge from existing merge vectors
        for i in 0..self.merge_from_vert.len() {
            uf.unite(self.merge_from_vert[i], self.merge_to_vert[i]);
        }

        // Rebuild merge vectors
        self.merge_from_vert.clear();
        self.merge_to_vert.clear();
        for v in 0..num_vert {
            let merge_to = uf.find(v as u32) as usize;
            if merge_to != v {
                self.merge_from_vert.push(v as u32);
                self.merge_to_vert.push(merge_to as u32);
            }
        }

        true
    }

    /// True if triangle run `run` is on the backside (e.g. from a subtraction).
    /// run_flags is a bitmask (#1718): bit 0 = backside. Informational only —
    /// the framework already orients stored normals on the standard flow.
    pub fn backside(&self, run: usize) -> bool {
        run < self.run_flags.len() && (self.run_flags[run] & 1) != 0
    }

    /// True if the first three extra-property channels (slots 3, 4, 5) of run
    /// `run` carry world-frame vertex normals (set by `CalculateNormals(0)`,
    /// round-tripped via run_flags bit 1, #1718). Consumers should treat the
    /// slot as normals and skip re-applying run_transform to it.
    pub fn has_normals(&self, run: usize) -> bool {
        run < self.run_flags.len() && (self.run_flags[run] & 2) != 0
    }

    /// Applies run transforms to normals stored at `normal_idx` in each vertex's properties,
    /// then clears run_transform and run_flags. Matches C++ MeshGL::UpdateNormals(normalIdx).
    ///
    /// The normal transform is the inverse-transpose of the 3×3 rotation part of the run
    /// transform. For backside runs (run_flags bit 0 set), normals are additionally negated.
    pub fn update_normals(&mut self, normal_idx: usize) {
        if normal_idx < 3 || normal_idx + 3 > self.num_prop as usize {
            return;
        }
        let num_vert = self.num_vert();
        let num_run = self.run_original_id.len();
        let np = self.num_prop as usize;
        let mut vert_updated = vec![false; num_vert];

        for run in 0..num_run {
            // Build the 3x3 normal transform from the column-major 3x4 run transform
            let offset = 12 * run;
            let has_transform = offset + 12 <= self.run_transform.len();

            // Extract mat3 (upper-left 3x3 of the 3x4 transform)
            let (m00, m01, m02,
                 m10, m11, m12,
                 m20, m21, m22) = if has_transform {
                let t = &self.run_transform[offset..offset + 12];
                // Column-major: col0=[t0,t1,t2], col1=[t3,t4,t5], col2=[t6,t7,t8]
                (t[0] as f64, t[3] as f64, t[6] as f64,
                 t[1] as f64, t[4] as f64, t[7] as f64,
                 t[2] as f64, t[5] as f64, t[8] as f64)
            } else {
                (1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0)
            };

            // Normal transform = inverse(transpose(M)) = (M^T)^{-1}
            // For a rotation matrix R: (R^T)^{-1} = R itself.
            // For a general transform with scale s: det = s^3, inv_trans = M / s^2.
            // We compute full adjugate/determinant to match C++ la::inverse(la::transpose(M)).
            let det = m00*(m11*m22 - m12*m21) - m01*(m10*m22 - m12*m20) + m02*(m10*m21 - m11*m20);
            let (n00, n01, n02, n10, n11, n12, n20, n21, n22) = if det.abs() < 1e-30 {
                (1.0f64, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0)
            } else {
                let inv = 1.0 / det;
                // Adjugate of transpose(M) = transpose of adjugate(M)
                let a00 = (m11*m22 - m12*m21) * inv;
                let a01 = (m02*m21 - m01*m22) * inv;
                let a02 = (m01*m12 - m02*m11) * inv;
                let a10 = (m12*m20 - m10*m22) * inv;
                let a11 = (m00*m22 - m02*m20) * inv;
                let a12 = (m02*m10 - m00*m12) * inv;
                let a20 = (m10*m21 - m11*m20) * inv;
                let a21 = (m01*m20 - m00*m21) * inv;
                let a22 = (m00*m11 - m01*m10) * inv;
                (a00, a01, a02, a10, a11, a12, a20, a21, a22)
            };

            let sign = if self.backside(run) { -1.0f64 } else { 1.0 };

            // Determine run's vertex range
            let start = if run < self.run_index.len() { self.run_index[run] as usize } else { 0 };
            let end = if run + 1 < self.run_index.len() { self.run_index[run + 1] as usize } else { self.tri_verts.len() };

            for idx in (start..end).step_by(1) {
                let vert = self.tri_verts[idx] as usize;
                if vert >= num_vert || vert_updated[vert] { continue; }
                vert_updated[vert] = true;
                let prop_start = vert * np + normal_idx;
                let nx = self.vert_properties[prop_start] as f64;
                let ny = self.vert_properties[prop_start + 1] as f64;
                let nz = self.vert_properties[prop_start + 2] as f64;
                // Apply normal transform
                let tx = n00*nx + n01*ny + n02*nz;
                let ty = n10*nx + n11*ny + n12*nz;
                let tz = n20*nx + n21*ny + n22*nz;
                // SafeNormalize
                let len = (tx*tx + ty*ty + tz*tz).sqrt();
                let (tx, ty, tz) = if len > 0.0 {
                    (sign * tx / len, sign * ty / len, sign * tz / len)
                } else {
                    (0.0, 0.0, 0.0)
                };
                self.vert_properties[prop_start] = tx as f32;
                self.vert_properties[prop_start + 1] = ty as f32;
                self.vert_properties[prop_start + 2] = tz as f32;
            }
        }
        self.run_transform.clear();
        self.run_flags.clear();
    }
}

/// Single-precision mesh (standard for graphics).
pub type MeshGL = MeshGLP<f32, u32>;

/// Double-precision, 64-bit index mesh (for huge meshes).
pub type MeshGL64 = MeshGLP<f64, u64>;
