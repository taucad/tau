use super::*;
use crate::linalg::Vec2;
use crate::types::PolyVert;

fn make_poly(coords: &[(f64, f64)]) -> SimplePolygonIdx {
    coords
        .iter()
        .enumerate()
        .map(|(i, &(x, y))| PolyVert { pos: Vec2::new(x, y), idx: i as i32 })
        .collect()
}

#[test]
fn test_ccw_basic() {
    // CCW triangle
    assert_eq!(ccw(Vec2::new(0.0, 0.0), Vec2::new(1.0, 0.0), Vec2::new(0.5, 1.0), 1e-10), 1);
    // CW triangle
    assert_eq!(ccw(Vec2::new(0.0, 0.0), Vec2::new(0.5, 1.0), Vec2::new(1.0, 0.0), 1e-10), -1);
    // Colinear
    assert_eq!(ccw(Vec2::new(0.0, 0.0), Vec2::new(1.0, 0.0), Vec2::new(2.0, 0.0), 1e-10), 0);
}

#[test]
fn test_triangle_ccw() {
    let poly = vec![make_poly(&[(0.0, 0.0), (1.0, 0.0), (0.5, 1.0)])];
    let tris = triangulate_idx(&poly, 1e-10, true);
    assert_eq!(tris.len(), 1);
    assert_eq!(tris[0], IVec3Out::new(0, 1, 2));
}

#[test]
fn test_square_ccw() {
    // Unit square, CCW
    let poly = vec![make_poly(&[(0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0)])];
    let tris = triangulate_idx(&poly, 1e-10, true);
    assert_eq!(tris.len(), 2);
    // Total triangles should cover the whole square
    for tri in &tris {
        assert!(tri.x >= 0 && tri.x < 4);
        assert!(tri.y >= 0 && tri.y < 4);
        assert!(tri.z >= 0 && tri.z < 4);
    }
}

#[test]
fn test_pentagon_ccw() {
    use std::f64::consts::PI;
    let n = 5usize;
    let coords: Vec<(f64, f64)> = (0..n)
        .map(|i| {
            let a = 2.0 * PI * i as f64 / n as f64;
            (a.cos(), a.sin())
        })
        .collect();
    let poly = vec![make_poly(&coords)];
    let tris = triangulate_idx(&poly, 1e-10, false);
    assert_eq!(tris.len(), n - 2);
}

#[test]
fn test_convex_fast_path() {
    use std::f64::consts::PI;
    let n = 8usize;
    let coords: Vec<(f64, f64)> = (0..n)
        .map(|i| {
            let a = 2.0 * PI * i as f64 / n as f64;
            (a.cos(), a.sin())
        })
        .collect();
    let poly = vec![make_poly(&coords)];
    // is_convex should return true -> triangulate_convex used
    assert!(is_convex(&poly, 1e-10));
    let tris = triangulate_idx(&poly, 1e-10, true);
    assert_eq!(tris.len(), n - 2);
}

#[test]
fn test_triangulate_unindexed() {
    let poly = vec![vec![
        Vec2::new(0.0, 0.0),
        Vec2::new(1.0, 0.0),
        Vec2::new(1.0, 1.0),
        Vec2::new(0.0, 1.0),
    ]];
    let tris = triangulate(&poly, 1e-10, true);
    assert_eq!(tris.len(), 2);
}

#[test]
fn test_kd_tree_query() {
    let mut points: Vec<PolyVert> = (0..20)
        .map(|i| PolyVert {
            pos: Vec2::new(i as f64, (i % 5) as f64),
            idx: i,
        })
        .collect();
    build_two_d_tree(&mut points);

    let query_rect = Rect::from_points(Vec2::new(3.0, 0.0), Vec2::new(8.0, 3.0));
    let mut found = Vec::new();
    query_two_d_tree(&points, query_rect, |p| found.push(p.idx));
    // Points with x in [3,8] and y in [0,3]
    found.sort();
    // i=3: x=3, y=3 yes; i=4: x=4, y=4 no; i=5: x=5, y=0 yes; i=6: x=6, y=1 yes;
    // i=7: x=7, y=2 yes; i=8: x=8, y=3 yes
    // (y = i%5: 3->3, 5->0, 6->1, 7->2, 8->3)
    assert!(found.contains(&3));
    assert!(found.contains(&5));
    assert!(found.contains(&6));
    assert!(found.contains(&7));
    assert!(found.contains(&8));
    assert!(!found.contains(&4)); // y=4 outside
}
