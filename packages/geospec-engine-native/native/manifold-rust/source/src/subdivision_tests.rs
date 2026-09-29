use super::*;
use crate::linalg::Mat3x4;

#[test]
fn test_subdivide_cube_once() {
    let cube = ManifoldImpl::cube(&Mat3x4::identity());
    let sub = subdivide_impl(&cube, 1);
    assert_eq!(sub.num_tri(), cube.num_tri() * 4);
    assert!(sub.num_vert() > cube.num_vert());
}

#[test]
fn test_partition_single_triangle() {
    // Simplest case: 1 division per edge = no subdivision
    let part = Partition::get_partition(IVec4::new(1, 1, 1, 0));
    assert_eq!(part.tri_vert.len(), 1);
    assert_eq!(part.vert_bary.len(), 3);
}

#[test]
fn test_partition_two_divisions() {
    // 2 divisions on each edge of a triangle
    let part = Partition::get_partition(IVec4::new(2, 2, 2, 0));
    assert_eq!(part.tri_vert.len(), 4); // 4 sub-triangles
}

#[test]
fn test_subdivide_edge_divisions() {
    // Test that the full Subdivide method works with edge_divisions callback
    let mut cube = ManifoldImpl::cube(&Mat3x4::identity());
    let _vert_bary = cube.subdivide(&|_vec, _t0, _t1| 1, false);
    assert_eq!(cube.num_tri(), 12 * 4); // each of 12 tris becomes 4
}

#[test]
fn test_create_tmp_edges() {
    let cube = ManifoldImpl::cube(&Mat3x4::identity());
    let edges = create_tmp_edges(&cube.halfedge);
    // A cube has 12 triangles = 36 halfedges = 18 edges
    assert_eq!(edges.len(), cube.halfedge.len() / 2);
}

#[test]
fn test_partition_asymmetric() {
    // Asymmetric divisions: 3,2,1
    let part = Partition::get_partition(IVec4::new(3, 2, 1, 0));
    assert!(part.tri_vert.len() > 1);
    // All barycentric coordinates should sum to 1
    for bary in &part.vert_bary {
        let sum = bary.x + bary.y + bary.z + bary.w;
        assert!(
            (sum - 1.0).abs() < 1e-10,
            "Barycentric coords should sum to 1, got {}",
            sum
        );
    }
}

#[test]
fn test_subdivide_preserves_manifold() {
    let cube = ManifoldImpl::cube(&Mat3x4::identity());
    let sub = subdivide_impl(&cube, 1);
    // Every halfedge should have a valid pair
    for (i, he) in sub.halfedge.iter().enumerate() {
        assert!(
            he.paired_halfedge >= 0,
            "Halfedge {} has no pair",
            i
        );
        let pair = he.paired_halfedge as usize;
        assert!(
            pair < sub.halfedge.len(),
            "Halfedge {} pair {} out of range",
            i,
            pair
        );
    }
}
