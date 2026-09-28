// manifold_smooth.rs — smoothing and refinement methods on Manifold:
// normal calculation, tangent creation (Smooth/SmoothOut/SmoothByNormals)
// and the Refine family that subdivides toward the smooth surface.
//
// Extracted from manifold.rs for file size management; a child module of
// `manifold` so these methods keep access to the private `imp` field and
// callers keep the same `m.refine(...)` paths. Ports the corresponding
// methods of C++ Manifold (smoothing.cpp, subdivision.cpp via
// Impl::Subdivide, interp_tri for tangent interpolation).

use crate::linalg::Vec3;
use crate::types::MeshGL;
use super::Manifold;

impl Manifold {
    /// Port of C++ Manifold::CalculateNormals()
    /// Fills in vertex properties for normals. Edges sharper than
    /// min_sharp_angle (degrees) get separate normals on each side.
    pub fn calculate_normals(&self, normal_idx: usize, min_sharp_angle: f64) -> Self {
        if let Some(e) = self.require_paired() { return e; }
        if self.is_empty() { return self.clone(); }
        let mut out = self.imp.clone();
        out.set_normals(normal_idx as i32, min_sharp_angle);
        // Per #1718: record per-meshID hasNormals so get_mesh_gl(-1) can
        // auto-substitute slot 0 on export. Restricted to the standard slot —
        // a non-zero slot would be ambiguous when round-tripping through MeshGL.
        if normal_idx == 0 {
            for rel in out.mesh_relation.mesh_id_transform.values_mut() {
                rel.has_normals = true;
            }
        }
        Self::from_impl(out)
    }

    /// Port of C++ Manifold::Smooth(MeshGL, sharpenedEdges)
    /// Constructs a smooth version of the input mesh by creating tangents.
    /// The actual triangle resolution is unchanged; use Refine() to
    /// interpolate to a higher-resolution curve.
    pub fn smooth(mesh_gl: &MeshGL, sharpened_edges: &[crate::types::Smoothness]) -> Self {
        use crate::types::Smoothness;

        // Assign sequential faceIDs if not present
        let mut mesh_tmp = mesh_gl.clone();
        let num_tri = mesh_tmp.num_tri();
        mesh_tmp.face_id.resize(num_tri, 0);
        for i in 0..num_tri {
            mesh_tmp.face_id[i] = i as u32;
        }

        let mut m = Self::from_mesh_gl(&mesh_tmp);
        if m.is_empty() {
            return m;
        }

        // UpdateSharpenedEdges + CreateTangents
        let sharpened: Vec<Smoothness> = sharpened_edges.to_vec();
        let updated = m.imp.update_sharpened_edges(&sharpened);
        m.imp.create_tangents(updated);

        // Restore original faceIDs
        let num_tri_impl = m.imp.num_tri();
        for i in 0..num_tri_impl {
            if i < m.imp.mesh_relation.tri_ref.len() {
                let face_id = m.imp.mesh_relation.tri_ref[i].face_id;
                if mesh_gl.face_id.len() == num_tri && face_id >= 0 && (face_id as usize) < num_tri {
                    m.imp.mesh_relation.tri_ref[i].face_id = mesh_gl.face_id[face_id as usize] as i32;
                } else {
                    m.imp.mesh_relation.tri_ref[i].face_id = -1;
                }
            }
        }

        m
    }

    pub fn smooth_out(&self, min_sharp_angle: f64, min_smoothness: f64) -> Self {
        if let Some(e) = self.require_paired() { return e; }
        if self.is_empty() { return self.clone(); }
        let mut out = self.imp.clone();
        // Per C++ #1724 (Fix CalculateNormals): SmoothOut is now self-consistent —
        // it always derives tangents from SharpenEdges, regardless of
        // min_smoothness. The old min_smoothness==0 path (SetNormals +
        // CreateTangentsFromNormals + property restore) was removed.
        let sharpened = out.sharpen_edges(min_sharp_angle, min_smoothness);
        out.create_tangents(sharpened);
        Self::from_impl(out)
    }

    pub fn smooth_by_normals(&self, normal_idx: usize) -> Self {
        if let Some(e) = self.require_paired() { return e; }
        if self.is_empty() { return self.clone(); }
        let mut out = self.imp.clone();
        out.create_tangents_from_normals(normal_idx);
        Self::from_impl(out)
    }

    /// Port of C++ Manifold::Refine(int n)
    /// Splits every edge into n pieces, sub-triangulating each face.
    pub fn refine(&self, n: i32) -> Self {
        if let Some(e) = self.require_paired() { return e; }
        if n <= 1 || self.imp.is_empty() {
            return self.clone();
        }
        let mut out = self.imp.clone();
        if !out.valid_tangents() {
            out.make_empty(crate::types::Error::InvalidTangents);
            return Self::from_impl(out);
        }
        let old = out.clone();
        let had_tangents = out.halfedge_tangent.len() == out.halfedge.len();
        let vert_bary = out.subdivide(&|_vec, _t0, _t1| n - 1, false);
        if had_tangents && !vert_bary.is_empty() {
            crate::interp_tri::interp_tri(&mut out.vert_pos, &vert_bary, &old);
        }
        out.halfedge_tangent.clear();
        out.calculate_bbox();
        out.set_epsilon(-1.0, false);
        out.sort_geometry();
        if had_tangents {
            out.set_normals_and_coplanar();
        } else {
            crate::face_op::calculate_vert_normals(&mut out);
        }
        out.mesh_relation.original_id = -1;
        Self::from_impl(out)
    }

    /// Port of C++ Manifold::RefineToLength(double length)
    pub fn refine_to_length(&self, length: f64) -> Self {
        if let Some(e) = self.require_paired() { return e; }
        let length = length.abs();
        if length == 0.0 || self.imp.is_empty() {
            return self.clone();
        }
        let mut out = self.imp.clone();
        if !out.valid_tangents() {
            out.make_empty(crate::types::Error::InvalidTangents);
            return Self::from_impl(out);
        }
        let old = out.clone();
        let had_tangents = out.halfedge_tangent.len() == out.halfedge.len();
        let vert_bary = out.subdivide(
            &|edge_vec, _t0, _t1| {
                let edge_len = (edge_vec.x * edge_vec.x + edge_vec.y * edge_vec.y
                    + edge_vec.z * edge_vec.z)
                    .sqrt();
                // C++: static_cast<int>(la::length(edge) / length) — truncation
                (edge_len / length) as i32
            },
            false,
        );
        if had_tangents && !vert_bary.is_empty() {
            crate::interp_tri::interp_tri(&mut out.vert_pos, &vert_bary, &old);
        }
        out.halfedge_tangent.clear();
        out.calculate_bbox();
        out.set_epsilon(-1.0, false);
        out.sort_geometry();
        if had_tangents {
            out.set_normals_and_coplanar();
        } else {
            crate::face_op::calculate_vert_normals(&mut out);
        }
        out.mesh_relation.original_id = -1;
        Self::from_impl(out)
    }

    /// Port of C++ Manifold::RefineToTolerance(double tolerance)
    pub fn refine_to_tolerance(&self, tolerance: f64) -> Self {
        if let Some(e) = self.require_paired() { return e; }
        let tolerance = tolerance.abs();
        if tolerance == 0.0 || self.imp.is_empty() {
            return self.clone();
        }
        // C++ only refines when tangents are present
        let mut out = self.imp.clone();
        let had_tangents = out.halfedge_tangent.len() == out.halfedge.len();
        if !had_tangents {
            return self.clone();
        }
        if !out.valid_tangents() {
            out.make_empty(crate::types::Error::InvalidTangents);
            return Self::from_impl(out);
        }
        let old = out.clone();
        let vert_bary = out.subdivide(
            &|edge_vec, tangent0, tangent1| {
                let edge_len = (edge_vec.x * edge_vec.x + edge_vec.y * edge_vec.y
                    + edge_vec.z * edge_vec.z)
                    .sqrt();
                if edge_len == 0.0 {
                    return 0;
                }
                let edge_norm = Vec3::new(
                    edge_vec.x / edge_len,
                    edge_vec.y / edge_len,
                    edge_vec.z / edge_len,
                );
                let t_start = Vec3::new(tangent0.x, tangent0.y, tangent0.z);
                let t_end = Vec3::new(tangent1.x, tangent1.y, tangent1.z);
                // Perpendicular to edge
                let dot_s = edge_norm.x * t_start.x + edge_norm.y * t_start.y
                    + edge_norm.z * t_start.z;
                let start = Vec3::new(
                    t_start.x - edge_norm.x * dot_s,
                    t_start.y - edge_norm.y * dot_s,
                    t_start.z - edge_norm.z * dot_s,
                );
                let dot_e = edge_norm.x * t_end.x + edge_norm.y * t_end.y
                    + edge_norm.z * t_end.z;
                let end = Vec3::new(
                    t_end.x - edge_norm.x * dot_e,
                    t_end.y - edge_norm.y * dot_e,
                    t_end.z - edge_norm.z * dot_e,
                );
                // Circular arc result plus heuristic term for non-circular curves
                let len_start = (start.x * start.x + start.y * start.y
                    + start.z * start.z)
                    .sqrt();
                let len_end =
                    (end.x * end.x + end.y * end.y + end.z * end.z).sqrt();
                let diff = Vec3::new(
                    start.x - end.x,
                    start.y - end.y,
                    start.z - end.z,
                );
                let len_diff =
                    (diff.x * diff.x + diff.y * diff.y + diff.z * diff.z)
                        .sqrt();
                let d = 0.5 * (len_start + len_end) + len_diff;
                (3.0 * d / (4.0 * tolerance)).sqrt() as i32
            },
            true,
        );
        if had_tangents && !vert_bary.is_empty() {
            crate::interp_tri::interp_tri(&mut out.vert_pos, &vert_bary, &old);
        }
        out.halfedge_tangent.clear();
        out.calculate_bbox();
        out.set_epsilon(-1.0, false);
        out.sort_geometry();
        if had_tangents {
            out.set_normals_and_coplanar();
        } else {
            crate::face_op::calculate_vert_normals(&mut out);
        }
        out.mesh_relation.original_id = -1;
        Self::from_impl(out)
    }
}
