use super::*;
use crate::linalg::Vec3;

#[test]
fn test_convex_hull_tetrahedron() {
    let pts = vec![
        Vec3::new(0.0, 0.0, 0.0),
        Vec3::new(1.0, 0.0, 0.0),
        Vec3::new(0.0, 1.0, 0.0),
        Vec3::new(0.0, 0.0, 1.0),
    ];
    let hull = convex_hull(&pts);
    assert_eq!(hull.num_vert(), 4);
    assert_eq!(hull.num_tri(), 4);
}

#[test]
fn test_convex_hull_cube_points() {
    let pts = vec![
        Vec3::new(0.0, 0.0, 0.0),
        Vec3::new(1.0, 0.0, 0.0),
        Vec3::new(0.0, 1.0, 0.0),
        Vec3::new(0.0, 0.0, 1.0),
        Vec3::new(1.0, 1.0, 0.0),
        Vec3::new(1.0, 0.0, 1.0),
        Vec3::new(0.0, 1.0, 1.0),
        Vec3::new(1.0, 1.0, 1.0),
    ];
    let hull = convex_hull(&pts);
    assert_eq!(hull.num_vert(), 8);
    assert_eq!(hull.num_tri(), 12);
}

#[test]
fn test_convex_hull_empty() {
    let hull = convex_hull(&[]);
    assert!(hull.is_empty());
}

#[test]
fn test_convex_hull_single_point() {
    let hull = convex_hull(&[Vec3::new(1.0, 2.0, 3.0)]);
    // Degenerate: should produce something (possibly degenerate mesh)
    // Just check it doesn't panic
    let _ = hull.num_tri();
}

#[test]
fn test_convex_hull_two_points() {
    let hull = convex_hull(&[
        Vec3::new(0.0, 0.0, 0.0),
        Vec3::new(1.0, 0.0, 0.0),
    ]);
    let _ = hull.num_tri();
}

#[test]
fn test_convex_hull_coplanar_points() {
    let pts = vec![
        Vec3::new(0.0, 0.0, 0.0),
        Vec3::new(1.0, 0.0, 0.0),
        Vec3::new(1.0, 1.0, 0.0),
        Vec3::new(0.0, 1.0, 0.0),
        Vec3::new(0.5, 0.5, 0.0),
    ];
    let hull = convex_hull(&pts);
    // Planar case -- should still produce a valid mesh
    assert!(hull.num_tri() > 0);
}

#[test]
fn test_convex_hull_sphere_points() {
    // Generate points on a sphere
    let mut pts = Vec::new();
    let n = 20;
    for i in 0..n {
        let phi = std::f64::consts::PI * (i as f64) / (n as f64 - 1.0);
        for j in 0..n {
            let theta = 2.0 * std::f64::consts::PI * (j as f64) / n as f64;
            pts.push(Vec3::new(
                phi.sin() * theta.cos(),
                phi.sin() * theta.sin(),
                phi.cos(),
            ));
        }
    }
    let hull = convex_hull(&pts);
    assert!(hull.num_tri() > 0);
    // All vertices should be at distance ~1 from origin
    for v in &hull.vert_pos {
        let r = (v.x * v.x + v.y * v.y + v.z * v.z).sqrt();
        assert!((r - 1.0).abs() < 0.01, "vertex not on unit sphere: r={}", r);
    }
}

#[test]
fn test_convex_hull_interior_points_excluded() {
    // Cube corners + interior point
    let pts = vec![
        Vec3::new(0.0, 0.0, 0.0),
        Vec3::new(1.0, 0.0, 0.0),
        Vec3::new(0.0, 1.0, 0.0),
        Vec3::new(0.0, 0.0, 1.0),
        Vec3::new(1.0, 1.0, 0.0),
        Vec3::new(1.0, 0.0, 1.0),
        Vec3::new(0.0, 1.0, 1.0),
        Vec3::new(1.0, 1.0, 1.0),
        Vec3::new(0.5, 0.5, 0.5), // interior point
    ];
    let hull = convex_hull(&pts);
    assert_eq!(hull.num_vert(), 8); // interior point should be excluded
    assert_eq!(hull.num_tri(), 12);
}

#[test]
fn test_convex_hull_is_convex() {
    let pts = vec![
        Vec3::new(0.0, 0.0, 0.0),
        Vec3::new(1.0, 0.0, 0.0),
        Vec3::new(0.0, 1.0, 0.0),
        Vec3::new(0.0, 0.0, 1.0),
        Vec3::new(1.0, 1.0, 0.0),
        Vec3::new(1.0, 0.0, 1.0),
        Vec3::new(0.0, 1.0, 1.0),
        Vec3::new(1.0, 1.0, 1.0),
    ];
    let hull = convex_hull(&pts);
    assert!(hull.is_convex());
}
