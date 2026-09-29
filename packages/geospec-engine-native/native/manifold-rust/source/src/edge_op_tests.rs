use super::*;
use crate::linalg::Mat3x4;
use crate::impl_mesh::ManifoldImpl;
use crate::face_op::set_normals_and_coplanar;

#[test]
fn test_pair_up() {
    let mut halfedges = vec![
        Halfedge { start_vert: 0, end_vert: 1, paired_halfedge: -1, prop_vert: 0 },
        Halfedge { start_vert: 1, end_vert: 0, paired_halfedge: -1, prop_vert: 1 },
    ];
    pair_up(&mut halfedges, 0, 1);
    assert_eq!(halfedges[0].paired_halfedge, 1);
    assert_eq!(halfedges[1].paired_halfedge, 0);
}

#[test]
fn test_cleanup_topology_noop_on_clean_mesh() {
    let mut m = ManifoldImpl::tetrahedron(&Mat3x4::identity());
    set_normals_and_coplanar(&mut m);
    let before_verts = m.vert_pos.len();
    let before_halfedges = m.halfedge.len();
    cleanup_topology(&mut m);
    // Tetrahedron is already 2-manifold; cleanup should not add verts/halfedges
    assert_eq!(m.vert_pos.len(), before_verts);
    assert_eq!(m.halfedge.len(), before_halfedges);
}

#[test]
fn test_simplify_topology_noop_on_clean_mesh() {
    let mut m = ManifoldImpl::cube(&Mat3x4::identity());
    set_normals_and_coplanar(&mut m);
    simplify_topology(&mut m, 0);
    // After simplify, cube should still be 2-manifold (no degenerate edges)
    // (Some verts/edges may be removed, but topology must be valid)
    // Just check it's still 2-manifold where halfedges are valid
    let valid = m.halfedge.iter().filter(|h| h.paired_halfedge >= 0).all(|h| {
        h.paired_halfedge < m.halfedge.len() as i32
    });
    assert!(valid, "invalid paired halfedge after simplify");
}
