use super::*;
use crate::linalg::Mat3x4;

#[test]
fn test_circular_tangent_is_finite() {
    let t = circular_tangent(Vec3::new(0.0, 1.0, 0.0), Vec3::new(1.0, 0.0, 0.0));
    assert!(t.x.is_finite());
    assert!(t.y.is_finite());
    assert!(t.z.is_finite());
    assert!(t.w.is_finite());
    assert!(t.w > 0.0);
}

#[test]
fn test_sharpen_edges_cube() {
    let m = ManifoldImpl::cube(&Mat3x4::identity());
    let edges = m.sharpen_edges(45.0, 0.0);
    assert_eq!(edges.len(), 24);
}

#[test]
fn test_create_tangents_cube() {
    let mut m = ManifoldImpl::cube(&Mat3x4::identity());
    let sharp = m.sharpen_edges(45.0, 0.0);
    m.create_tangents(sharp);
    assert_eq!(m.halfedge_tangent.len(), m.num_halfedge());
    assert!(m.halfedge_tangent.iter().all(|t| t.x.is_finite() && t.y.is_finite() && t.z.is_finite() && t.w.is_finite()));
    assert!(m.halfedge_tangent.iter().any(|t| t.w < 0.0));
}

#[test]
fn test_create_tangents_from_normals_cube() {
    let mut m = ManifoldImpl::cube(&Mat3x4::identity());
    m.num_prop = 3;
    m.properties = m
        .vert_normal
        .iter()
        .flat_map(|n| [n.x, n.y, n.z])
        .collect();
    m.create_tangents_from_normals(0);
    assert_eq!(m.halfedge_tangent.len(), m.num_halfedge());
    assert!(m.halfedge_tangent.iter().all(|t| t.w.is_finite()));
}

