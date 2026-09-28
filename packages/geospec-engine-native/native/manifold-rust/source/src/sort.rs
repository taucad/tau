// sort.rs — Phase 5: SortGeometry, Morton codes, vertex/face sorting
//
// Ports src/sort.cpp from the Manifold C++ library.
// The Collider is stubbed (Phase 10 will implement it fully).

use crate::linalg::Vec3;
use crate::types::{Box as BBox, Halfedge};
use crate::impl_mesh::ManifoldImpl;

// -----------------------------------------------------------------------
// Morton code (30-bit, 10 bits per axis)
// -----------------------------------------------------------------------

const K_NO_CODE: u32 = 0xFFFF_FFFFu32;

/// Spread the low 10 bits of v into bits 0,3,6,9,...,27 (every 3rd bit).
/// This is the inverse of the interleaving needed for a 3D Morton code.
#[inline]
fn spread_bits3(mut v: u32) -> u32 {
    v = 0xFF0000FFu32 & v.wrapping_mul(0x00010001u32);
    v = 0x0F00F00Fu32 & v.wrapping_mul(0x00000101u32);
    v = 0xC30C30C3u32 & v.wrapping_mul(0x00000011u32);
    v = 0x49249249u32 & v.wrapping_mul(0x00000005u32);
    v
}

/// Compute a 30-bit Morton code for a position within the given bounding box.
/// Returns K_NO_CODE for NaN positions (unreferenced vertices).
pub fn morton_code(position: Vec3, bbox: &BBox) -> u32 {
    if position.x.is_nan() {
        return K_NO_CODE;
    }
    morton_code_impl(position, bbox)
}

fn morton_code_impl(position: Vec3, bbox: &BBox) -> u32 {
    let range = bbox.max - bbox.min;
    let xyz = (position - bbox.min) / range;
    let x_f = (1024.0 * xyz.x).min(1023.0).max(0.0);
    let y_f = (1024.0 * xyz.y).min(1023.0).max(0.0);
    let z_f = (1024.0 * xyz.z).min(1023.0).max(0.0);
    let x = spread_bits3(x_f as u32);
    let y = spread_bits3(y_f as u32);
    let z = spread_bits3(z_f as u32);
    x * 4 + y * 2 + z
}

// -----------------------------------------------------------------------
// SortVerts
// -----------------------------------------------------------------------

/// Sorts vertices by their Morton code and removes NaN-flagged vertices.
/// Updates all halfedge vertex references accordingly.
pub fn sort_verts(mesh: &mut ManifoldImpl) {
    let num_vert = mesh.vert_pos.len();
    let bbox = mesh.bbox;

    // Compute Morton code for each vertex
    let vert_morton: Vec<u32> = mesh.vert_pos.iter()
        .map(|&p| morton_code(p, &bbox))
        .collect();

    // Build sorted index array
    let mut vert_new2old: Vec<i32> = (0..num_vert as i32).collect();
    vert_new2old.sort_by(|&a, &b| vert_morton[a as usize].cmp(&vert_morton[b as usize]));

    // Find how many survive (NaN verts get K_NO_CODE, sort to end)
    let new_num_vert = vert_new2old.partition_point(|&v| vert_morton[v as usize] < K_NO_CODE);
    let vert_new2old_trimmed = &vert_new2old[..new_num_vert];

    reindex_verts(mesh, vert_new2old_trimmed, num_vert);

    // Permute vert positions (only surviving verts)
    let old_pos = mesh.vert_pos.clone();
    mesh.vert_pos.resize(new_num_vert, Vec3::new(0.0, 0.0, 0.0));
    for (new_idx, &old_idx) in vert_new2old_trimmed.iter().enumerate() {
        mesh.vert_pos[new_idx] = old_pos[old_idx as usize];
    }

    // Permute vert normals if present
    if mesh.vert_normal.len() == num_vert {
        let old_n = mesh.vert_normal.clone();
        mesh.vert_normal.resize(new_num_vert, Vec3::new(0.0, 0.0, 0.0));
        for (new_idx, &old_idx) in vert_new2old_trimmed.iter().enumerate() {
            mesh.vert_normal[new_idx] = old_n[old_idx as usize];
        }
    }
}

/// Updates halfedge start/end vert indices from old→new index mapping.
/// `vert_new2old[new] = old` — we invert to get `vert_old2new[old] = new`.
pub fn reindex_verts(mesh: &mut ManifoldImpl, vert_new2old: &[i32], old_num_vert: usize) {
    let mut vert_old2new = vec![-1i32; old_num_vert];
    for (new_idx, &old_idx) in vert_new2old.iter().enumerate() {
        vert_old2new[old_idx as usize] = new_idx as i32;
    }
    let has_prop = mesh.num_prop > 0;
    for edge in mesh.halfedge.iter_mut() {
        if edge.start_vert < 0 {
            continue;
        }
        edge.start_vert = vert_old2new[edge.start_vert as usize];
        edge.end_vert = vert_old2new[edge.end_vert as usize];
        if !has_prop {
            edge.prop_vert = edge.start_vert;
        }
    }
}

// -----------------------------------------------------------------------
// GetFaceBoxMorton
// -----------------------------------------------------------------------

/// Computes per-face bounding boxes and Morton codes.
/// Faces with removed halfedges (pairedHalfedge < 0) get K_NO_CODE.
pub fn get_face_box_morton(mesh: &ManifoldImpl) -> (Vec<BBox>, Vec<u32>) {
    let num_tri = mesh.num_tri();
    let bbox = mesh.bbox;
    let mut face_box = vec![BBox::default(); num_tri];
    let mut face_morton = vec![0u32; num_tri];

    for face in 0..num_tri {
        if mesh.halfedge[3 * face].paired_halfedge < 0 {
            face_morton[face] = K_NO_CODE;
            continue;
        }
        let mut center = Vec3::new(0.0, 0.0, 0.0);
        for i in 0..3 {
            let pos = mesh.vert_pos[mesh.halfedge[3 * face + i].start_vert as usize];
            center = center + pos;
            face_box[face].union_point(pos);
        }
        center = center / 3.0;
        face_morton[face] = morton_code_impl(center, &bbox);
    }

    (face_box, face_morton)
}

// -----------------------------------------------------------------------
// SortFaces / GatherFaces
// -----------------------------------------------------------------------

/// Sorts faces by Morton code, removing faces flagged for removal (K_NO_CODE).
/// Updates `face_box` and `face_morton` in-place.
pub fn sort_faces(mesh: &mut ManifoldImpl, face_box: &mut Vec<BBox>, face_morton: &mut Vec<u32>) {
    let num_tri = face_box.len();
    let mut face_new2old: Vec<usize> = (0..num_tri).collect();

    // Stable sort by Morton code (removed tris get K_NO_CODE → sorted last)
    face_new2old.sort_by(|&a, &b| face_morton[a].cmp(&face_morton[b]));

    // Trim removed faces
    let new_num_tri = face_new2old.partition_point(|&f| face_morton[f] < K_NO_CODE);
    face_new2old.truncate(new_num_tri);

    // Permute face_morton and face_box to match new order
    let old_morton = face_morton.clone();
    let old_box = face_box.clone();
    face_morton.resize(new_num_tri, 0);
    face_box.resize(new_num_tri, BBox::default());
    for (new_f, &old_f) in face_new2old.iter().enumerate() {
        face_morton[new_f] = old_morton[old_f];
        face_box[new_f] = old_box[old_f];
    }

    gather_faces(mesh, &face_new2old);
}

/// Reorders halfedges (and related arrays) according to face_new2old permutation.
pub fn gather_faces(mesh: &mut ManifoldImpl, face_new2old: &[usize]) {
    let num_tri = face_new2old.len();
    let old_num_tri = mesh.num_tri();

    // Permute tri_ref if present
    if mesh.mesh_relation.tri_ref.len() == old_num_tri {
        let old_tri_ref = mesh.mesh_relation.tri_ref.clone();
        mesh.mesh_relation.tri_ref.resize(num_tri, Default::default());
        for (new_f, &old_f) in face_new2old.iter().enumerate() {
            mesh.mesh_relation.tri_ref[new_f] = old_tri_ref[old_f];
        }
    }

    // Permute face normals if present
    if mesh.face_normal.len() == old_num_tri {
        let old_normals = mesh.face_normal.clone();
        mesh.face_normal.resize(num_tri, Vec3::new(0.0, 0.0, 0.0));
        for (new_f, &old_f) in face_new2old.iter().enumerate() {
            mesh.face_normal[new_f] = old_normals[old_f];
        }
    }

    // Build faceOld2New for pairedHalfedge remapping
    let mut face_old2new = vec![-1i32; old_num_tri];
    for (new_f, &old_f) in face_new2old.iter().enumerate() {
        face_old2new[old_f] = new_f as i32;
    }

    // Gather halfedges from old layout into new
    let old_halfedge = mesh.halfedge.clone();
    let old_tangent = mesh.halfedge_tangent.clone();
    let has_tangent = !old_tangent.is_empty();

    mesh.halfedge.resize(3 * num_tri, Halfedge::default());
    if has_tangent {
        mesh.halfedge_tangent.resize(3 * num_tri, Default::default());
    }

    for new_face in 0..num_tri {
        let old_face = face_new2old[new_face];
        for i in 0..3 {
            let old_edge_idx = 3 * old_face + i;
            let new_edge_idx = 3 * new_face + i;
            let mut edge = old_halfedge[old_edge_idx];
            // Remap pairedHalfedge
            if edge.paired_halfedge >= 0 {
                let paired_old_face = (edge.paired_halfedge / 3) as usize;
                let offset = edge.paired_halfedge % 3;
                edge.paired_halfedge = 3 * face_old2new[paired_old_face] + offset;
            }
            mesh.halfedge[new_edge_idx] = edge;
            if has_tangent {
                mesh.halfedge_tangent[new_edge_idx] = old_tangent[old_edge_idx];
            }
        }
    }
}

// -----------------------------------------------------------------------
// CompactProps
// -----------------------------------------------------------------------

/// Removes unreferenced property vertices and reindexes propVerts.
pub fn compact_props(mesh: &mut ManifoldImpl) {
    if mesh.num_prop == 0 {
        return;
    }
    let num_prop = mesh.num_prop;
    let num_prop_verts = mesh.properties.len() / num_prop;

    // Mark which prop verts are referenced
    let mut keep = vec![false; num_prop_verts];
    for edge in &mesh.halfedge {
        if edge.prop_vert >= 0 && (edge.prop_vert as usize) < num_prop_verts {
            keep[edge.prop_vert as usize] = true;
        }
    }

    // Build prefix sum for old→new mapping
    let mut prop_old2new = vec![0i32; num_prop_verts + 1];
    for i in 0..num_prop_verts {
        prop_old2new[i + 1] = prop_old2new[i] + if keep[i] { 1 } else { 0 };
    }
    let new_num_prop_verts = prop_old2new[num_prop_verts] as usize;

    // Compact properties array
    let old_prop = mesh.properties.clone();
    mesh.properties.resize(num_prop * new_num_prop_verts, 0.0);
    for old_idx in 0..num_prop_verts {
        if !keep[old_idx] {
            continue;
        }
        let new_idx = prop_old2new[old_idx] as usize;
        for p in 0..num_prop {
            mesh.properties[new_idx * num_prop + p] = old_prop[old_idx * num_prop + p];
        }
    }

    // Remap propVert indices in halfedges
    for edge in mesh.halfedge.iter_mut() {
        if edge.prop_vert >= 0 {
            edge.prop_vert = prop_old2new[edge.prop_vert as usize];
        }
    }
}

// -----------------------------------------------------------------------
// SortGeometry — main entry point
// -----------------------------------------------------------------------

/// Sorts vertices and faces by Morton code, removes flagged-for-deletion
/// elements, and compacts property arrays. Should be called after
/// `create_halfedges()` to finalize the mesh topology.
///
/// Note: Collider construction is done in Phase 10.
pub fn sort_geometry(mesh: &mut ManifoldImpl) {
    if mesh.halfedge.is_empty() {
        mesh.collider = crate::collider::Collider::default();
        return;
    }
    sort_verts(mesh);
    let (mut face_box, mut face_morton) = get_face_box_morton(mesh);
    sort_faces(mesh, &mut face_box, &mut face_morton);
    if mesh.halfedge.is_empty() {
        mesh.collider = crate::collider::Collider::default();
        return;
    }
    // Cache the face BVH on the mesh (C++ builds collider_ here in
    // SortGeometry); query sites reuse it instead of rebuilding per query.
    mesh.collider = crate::collider::Collider::new(face_box, face_morton);
    compact_props(mesh);

    debug_assert!(
        mesh.halfedge.len() % 6 == 0,
        "Not an even number of halfedges after sorting (expected multiple of 6, got {})",
        mesh.halfedge.len()
    );
}

// -----------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::linalg::Mat3x4;
    use crate::impl_mesh::ManifoldImpl;

    #[test]
    fn test_spread_bits3() {
        // SpreadBits3(0b1111111111) should interleave into alternating positions
        // Values verified against C++ constexpr evaluation
        assert_eq!(spread_bits3(0), 0);
        assert_eq!(spread_bits3(1), 1);
        // Each bit of the input lands 3 positions apart in the output
        assert_eq!(spread_bits3(0b10), 0b1000);
        assert_eq!(spread_bits3(0b11), 0b1001);
        assert_eq!(spread_bits3(0b100), 0b1000000);
    }

    #[test]
    fn test_morton_code_basic() {
        let bbox = BBox {
            min: Vec3::new(0.0, 0.0, 0.0),
            max: Vec3::new(1.0, 1.0, 1.0),
        };
        // Origin → all zeros → code 0
        let code_origin = morton_code(Vec3::new(0.0, 0.0, 0.0), &bbox);
        assert_eq!(code_origin, 0);

        // NaN → K_NO_CODE
        let code_nan = morton_code(Vec3::new(f64::NAN, 0.0, 0.0), &bbox);
        assert_eq!(code_nan, K_NO_CODE);

        // Center of cube should be a positive code less than K_NO_CODE
        let code_center = morton_code(Vec3::new(0.5, 0.5, 0.5), &bbox);
        assert!(code_center > 0 && code_center < K_NO_CODE);
    }

    #[test]
    fn test_morton_code_ordering() {
        // Points closer together should (generally) have closer Morton codes.
        // More specifically: points sorted by Morton code produce a Z-curve traversal.
        let bbox = BBox {
            min: Vec3::new(0.0, 0.0, 0.0),
            max: Vec3::new(8.0, 8.0, 8.0),
        };
        let p0 = morton_code(Vec3::new(0.0, 0.0, 0.0), &bbox);
        let p1 = morton_code(Vec3::new(1.0, 0.0, 0.0), &bbox);
        let p2 = morton_code(Vec3::new(2.0, 0.0, 0.0), &bbox);
        // These should be strictly increasing along x with y=z=0
        assert!(p0 < p1);
        assert!(p1 < p2);
    }

    #[test]
    fn test_sort_geometry_tetrahedron() {
        let mut m = ManifoldImpl::tetrahedron(&Mat3x4::identity());
        // Should have 4 vertices and 12 halfedges (4 triangles) before sort
        assert_eq!(m.vert_pos.len(), 4);
        assert_eq!(m.halfedge.len(), 12);
        sort_geometry(&mut m);
        // Sort shouldn't remove any valid verts/faces
        assert_eq!(m.vert_pos.len(), 4);
        assert_eq!(m.halfedge.len(), 12);
    }

    #[test]
    fn test_sort_geometry_cube() {
        let mut m = ManifoldImpl::cube(&Mat3x4::identity());
        let vert_count = m.vert_pos.len();
        let halfedge_count = m.halfedge.len();
        sort_geometry(&mut m);
        assert_eq!(m.vert_pos.len(), vert_count);
        assert_eq!(m.halfedge.len(), halfedge_count);
        // After sort, paired halfedges should still be valid
        for (i, edge) in m.halfedge.iter().enumerate() {
            assert!(edge.paired_halfedge >= 0,
                "halfedge {} has invalid paired_halfedge {}", i, edge.paired_halfedge);
            let paired = &m.halfedge[edge.paired_halfedge as usize];
            assert_eq!(paired.paired_halfedge, i as i32,
                "halfedge {} paired -> {} but paired doesn't point back", i, edge.paired_halfedge);
        }
    }

    #[test]
    fn test_reindex_verts_identity() {
        let mut m = ManifoldImpl::tetrahedron(&Mat3x4::identity());
        let n = m.vert_pos.len();
        // Identity permutation should not change anything
        let identity: Vec<i32> = (0..n as i32).collect();
        let before: Vec<_> = m.halfedge.iter().map(|e| (e.start_vert, e.end_vert)).collect();
        reindex_verts(&mut m, &identity, n);
        let after: Vec<_> = m.halfedge.iter().map(|e| (e.start_vert, e.end_vert)).collect();
        assert_eq!(before, after);
    }

    #[test]
    fn test_sort_faces_manifold_preserved() {
        // After sort_geometry, mesh must still be 2-manifold
        let mut m = ManifoldImpl::cube(&Mat3x4::identity());
        sort_geometry(&mut m);
        assert!(m.is_2_manifold());
    }
}
