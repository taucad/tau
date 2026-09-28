use super::*;

#[test]
fn test_radians_degrees() {
    assert!((radians(180.0) - K_PI).abs() < 1e-15);
    assert!((degrees(K_PI) - 180.0).abs() < 1e-12);
    assert!((radians(90.0) - K_HALF_PI).abs() < 1e-15);
}

#[test]
fn test_smoothstep() {
    assert_eq!(smoothstep(0.0, 1.0, 0.0), 0.0);
    assert_eq!(smoothstep(0.0, 1.0, 1.0), 1.0);
    let mid = smoothstep(0.0, 1.0, 0.5);
    assert!((mid - 0.5).abs() < 1e-15);
}

#[test]
fn test_sind_cosd() {
    assert!((sind(0.0)).abs() < 1e-15);
    assert!((sind(90.0) - 1.0).abs() < 1e-15);
    assert!((sind(180.0)).abs() < 1e-15);
    assert!((sind(270.0) + 1.0).abs() < 1e-15);
    assert!((sind(360.0)).abs() < 1e-15);
    assert!((cosd(0.0) - 1.0).abs() < 1e-15);
    assert!((cosd(90.0)).abs() < 1e-15);
    assert!((cosd(180.0) + 1.0).abs() < 1e-15);
}

#[test]
fn test_box_default() {
    let b = Box::new();
    assert!(b.min.x.is_infinite() && b.min.x > 0.0);
    assert!(b.max.x.is_infinite() && b.max.x < 0.0);
}

#[test]
fn test_box_from_points() {
    let b = Box::from_points(
        Vec3::new(1.0, 2.0, 3.0),
        Vec3::new(-1.0, -2.0, -3.0),
    );
    assert_eq!(b.min, Vec3::new(-1.0, -2.0, -3.0));
    assert_eq!(b.max, Vec3::new(1.0, 2.0, 3.0));
}

#[test]
fn test_box_size_center() {
    let b = Box::from_points(Vec3::new(0.0, 0.0, 0.0), Vec3::new(2.0, 4.0, 6.0));
    assert_eq!(b.size(), Vec3::new(2.0, 4.0, 6.0));
    assert_eq!(b.center(), Vec3::new(1.0, 2.0, 3.0));
}

#[test]
fn test_box_scale() {
    let b = Box::from_points(Vec3::new(-3.0, -1.0, -1.0), Vec3::new(2.0, 1.0, 1.0));
    assert_eq!(b.scale(), 3.0);
}

#[test]
fn test_box_contains() {
    let b = Box::from_points(Vec3::new(0.0, 0.0, 0.0), Vec3::new(1.0, 1.0, 1.0));
    assert!(b.contains_point(Vec3::new(0.5, 0.5, 0.5)));
    assert!(b.contains_point(Vec3::new(0.0, 0.0, 0.0)));
    assert!(!b.contains_point(Vec3::new(1.5, 0.5, 0.5)));
}

#[test]
fn test_box_union() {
    let mut b = Box::from_points(Vec3::new(0.0, 0.0, 0.0), Vec3::new(1.0, 1.0, 1.0));
    b.union_point(Vec3::new(2.0, 2.0, 2.0));
    assert_eq!(b.max, Vec3::new(2.0, 2.0, 2.0));
}

#[test]
fn test_box_overlap() {
    let a = Box::from_points(Vec3::new(0.0, 0.0, 0.0), Vec3::new(1.0, 1.0, 1.0));
    let b = Box::from_points(Vec3::new(0.5, 0.5, 0.5), Vec3::new(1.5, 1.5, 1.5));
    let c = Box::from_points(Vec3::new(2.0, 2.0, 2.0), Vec3::new(3.0, 3.0, 3.0));
    assert!(a.does_overlap_box(&b));
    assert!(!a.does_overlap_box(&c));
}

#[test]
fn test_rect_basic() {
    let r = Rect::from_points(Vec2::new(0.0, 0.0), Vec2::new(3.0, 4.0));
    assert_eq!(r.size(), Vec2::new(3.0, 4.0));
    assert!((r.area() - 12.0).abs() < 1e-15);
    assert_eq!(r.center(), Vec2::new(1.5, 2.0));
}

#[test]
fn test_next_halfedge() {
    assert_eq!(next_halfedge(0), 1);
    assert_eq!(next_halfedge(1), 2);
    assert_eq!(next_halfedge(2), 0);
    assert_eq!(next_halfedge(3), 4);
    assert_eq!(next_halfedge(5), 3);
}

#[test]
fn test_halfedge_forward() {
    let h = Halfedge { start_vert: 1, end_vert: 3, paired_halfedge: 0, prop_vert: 0 };
    assert!(h.is_forward());
    let h2 = Halfedge { start_vert: 3, end_vert: 1, paired_halfedge: 0, prop_vert: 0 };
    assert!(!h2.is_forward());
}

#[test]
fn test_tri_ref_same_face() {
    let a = TriRef { mesh_id: 1, original_id: 2, face_id: 3, coplanar_id: 4 };
    let b = TriRef { mesh_id: 1, original_id: 99, face_id: 3, coplanar_id: 4 };
    assert!(a.same_face(&b));
    let c = TriRef { mesh_id: 1, original_id: 2, face_id: 99, coplanar_id: 4 };
    assert!(!a.same_face(&c));
}

#[test]
fn test_tmp_edge_ordering() {
    // Verify min/max normalization
    let e1 = TmpEdge::new(5, 2, 0);
    assert_eq!(e1.first, 2);
    assert_eq!(e1.second, 5);
    // Ordering: only first/second matter for Ord, not halfedge_idx
    let e2 = TmpEdge::new(2, 5, 1);
    assert_eq!(e1.cmp(&e2), std::cmp::Ordering::Equal);
    // e1 < e3
    let e3 = TmpEdge::new(3, 5, 0);
    assert!(e1 < e3);
}

#[test]
fn test_quality_segments() {
    Quality::reset_to_defaults();
    // C++ formula: min(360/angle, 2πr/length) + 3, rounded down to multiple of 4
    // For radius=1.0: min(36, 6) + 3 = 9, rounded down = 8
    let n = Quality::get_circular_segments(1.0);
    assert_eq!(n, 8);
    assert_eq!(n % 4, 0);
    // For radius=50: min(36, 314) + 3 = 39, rounded down = 36
    let n50 = Quality::get_circular_segments(50.0);
    assert_eq!(n50, 36);
}

#[test]
fn test_error_display() {
    assert_eq!(Error::NoError.to_str(), "No Error");
    assert_eq!(Error::NotManifold.to_str(), "Not Manifold");
}
