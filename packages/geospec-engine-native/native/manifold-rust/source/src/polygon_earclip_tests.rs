use super::*;

fn contour(coords: &[(f64, f64)], first_idx: i32) -> Vec<PolyVert> {
    coords
        .iter()
        .enumerate()
        .map(|(offset, &(x, y))| PolyVert {
            pos: Vec2::new(x, y),
            idx: first_idx + offset as i32,
        })
        .collect()
}

#[test]
fn orders_holes_rightmost_first_for_keyholing() {
    let polygons = vec![
        contour(&[(0.0, 0.0), (12.0, 0.0), (12.0, 10.0), (0.0, 10.0)], 0),
        contour(&[(1.0, 2.0), (1.0, 4.0), (3.0, 4.0), (3.0, 2.0)], 4),
        contour(&[(4.0, 2.0), (4.0, 4.0), (6.0, 4.0), (6.0, 2.0)], 8),
        contour(
            &[(8.0, 2.0), (8.0, 4.0), (10.0, 4.0), (10.0, 2.0)],
            12,
        ),
    ];

    let ear_clip = EarClip::new(&polygons, 1.0e-10);
    let hole_xs = ear_clip
        .holes
        .iter()
        .map(|&hole| ear_clip.polygon[hole].pos.x)
        .collect::<Vec<_>>();

    assert_eq!(hole_xs, vec![10.0, 6.0, 3.0]);
}

/// End-to-end companion to `orders_holes_rightmost_first_for_keyholing`:
/// with holes keyholed in contour order the bridges cross, producing
/// inverted triangles. Verifies the triangulation itself is valid.
#[test]
fn multi_hole_triangulation_has_no_inverted_triangles() {
    let polygons = vec![
        contour(&[(0.0, 0.0), (12.0, 0.0), (12.0, 10.0), (0.0, 10.0)], 0),
        contour(&[(1.0, 2.0), (1.0, 4.0), (3.0, 4.0), (3.0, 2.0)], 4),
        contour(&[(4.0, 2.0), (4.0, 4.0), (6.0, 4.0), (6.0, 2.0)], 8),
        contour(
            &[(8.0, 2.0), (8.0, 4.0), (10.0, 4.0), (10.0, 2.0)],
            12,
        ),
    ];
    let verts: Vec<Vec2> = polygons.iter().flatten().map(|v| v.pos).collect();

    let (triangles, _eps) = EarClip::new(&polygons, -1.0).triangulate();

    // Outer 12x10 rectangle minus three 2x2 holes.
    let expected_area = 12.0 * 10.0 - 3.0 * 4.0;
    let mut total_area = 0.0;
    for tri in &triangles {
        let (a, b, c) = (
            verts[tri.x as usize],
            verts[tri.y as usize],
            verts[tri.z as usize],
        );
        let area = 0.5 * determinant2x2(b - a, c - a);
        assert!(
            area > 0.0,
            "inverted or degenerate triangle {:?} (area {})",
            tri,
            area
        );
        total_area += area;
    }
    assert!(
        (total_area - expected_area).abs() < 1e-9,
        "triangulation area {} != expected {}",
        total_area,
        expected_area
    );
}
