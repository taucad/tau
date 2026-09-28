// robust/tri_tri_tests.rs — Unit tests for exact triangle-triangle
// intersection (robust/tri_tri.rs): generic crossings, vertex/edge contact,
// coplanar overlaps of every dimension, slivers, and argument symmetry.

use crate::linalg::Vec3;

use super::super::exact::backend::rat_new;
use super::super::exact::rational::{rat, R3};
use super::{dominant_axis, lift_to_plane, tri_tri_intersect, TriTriIsect};
use crate::robust::exact::predicates::tri_normal_r;

fn v(x: f64, y: f64, z: f64) -> Vec3 {
    Vec3::new(x, y, z)
}

fn r3(x: f64, y: f64, z: f64) -> R3 {
    R3::from_vec3(v(x, y, z))
}

/// Segments and points compare as sets (segment endpoint order is arbitrary).
fn assert_same_isect(a: &TriTriIsect, b: &TriTriIsect) {
    use TriTriIsect::*;
    match (a, b) {
        (None, None) => {}
        (Point(p), Point(q)) => assert_eq!(p, q),
        (Segment(p0, p1), Segment(q0, q1)) => {
            assert!(
                (p0 == q0 && p1 == q1) || (p0 == q1 && p1 == q0),
                "segments differ: {p0:?}-{p1:?} vs {q0:?}-{q1:?}"
            );
        }
        (
            Coplanar {
                polygon: pa,
                same_orientation: sa,
            },
            Coplanar {
                polygon: pb,
                same_orientation: sb,
            },
        ) => {
            assert_eq!(sa, sb);
            assert_eq!(pa.len(), pb.len(), "polygon vertex counts differ");
            let mut sa: Vec<R3> = pa.clone();
            let mut sb: Vec<R3> = pb.clone();
            sa.sort();
            sb.sort();
            assert_eq!(sa, sb, "polygon vertex sets differ");
        }
        _ => panic!("intersection kinds differ: {a:?} vs {b:?}"),
    }
}

/// Run both argument orders and require identical results.
fn isect_sym(t1: [Vec3; 3], t2: [Vec3; 3]) -> TriTriIsect {
    let ab = tri_tri_intersect(t1, t2);
    let ba = tri_tri_intersect(t2, t1);
    assert_same_isect(&ab, &ba);
    ab
}

#[test]
fn disjoint_triangles() {
    // Parallel planes.
    let t1 = [v(0.0, 0.0, 0.0), v(1.0, 0.0, 0.0), v(0.0, 1.0, 0.0)];
    let t2 = [v(0.0, 0.0, 1.0), v(1.0, 0.0, 1.0), v(0.0, 1.0, 1.0)];
    assert_eq!(isect_sym(t1, t2), TriTriIsect::None);
    // Crossing planes but separated triangles.
    let t3 = [v(10.0, 10.0, -1.0), v(11.0, 10.0, 1.0), v(10.0, 11.0, 1.0)];
    assert_eq!(isect_sym(t1, t3), TriTriIsect::None);
    // Same plane, disjoint.
    let t4 = [v(5.0, 5.0, 0.0), v(6.0, 5.0, 0.0), v(5.0, 6.0, 0.0)];
    assert_eq!(isect_sym(t1, t4), TriTriIsect::None);
}

#[test]
fn generic_crossing_produces_segment() {
    // t2 is vertical, punching through the horizontal t1.
    let t1 = [v(0.0, 0.0, 0.0), v(4.0, 0.0, 0.0), v(0.0, 4.0, 0.0)];
    let t2 = [v(1.0, -1.0, -1.0), v(1.0, 3.0, -1.0), v(1.0, 1.0, 2.0)];
    // In plane x=1, t2's edges cross z=0 at y ∈ {1/3, 5/3}... computed exactly:
    // edge (1,-1,-1)→(1,1,2): z=0 at t=1/3 → y = -1 + 2*(1/3)*... let the
    // assertion below verify incidence instead of hand-derived numbers.
    match isect_sym(t1, t2) {
        TriTriIsect::Segment(p, q) => {
            assert_ne!(p, q);
            // Both endpoints on both planes: z = 0 and x = 1.
            for e in [&p, &q] {
                assert_eq!(e.z, rat(0.0));
                assert_eq!(e.x, rat(1.0));
            }
        }
        other => panic!("expected Segment, got {other:?}"),
    }
}

#[test]
fn known_crossing_segment_values() {
    // t1 in z=0; t2 vertical wall x=1 with base straddling z=0 across y∈[0,2].
    let t1 = [v(0.0, 0.0, 0.0), v(4.0, 0.0, 0.0), v(0.0, 4.0, 0.0)];
    let t2 = [v(1.0, 0.0, -1.0), v(1.0, 2.0, -1.0), v(1.0, 1.0, 1.0)];
    // Edges cross z=0 at (1, 1/2, 0) and (1, 3/2, 0).
    let expect0 = R3::new(rat(1.0), rat_new(1.into(), 2.into()), rat(0.0));
    let expect1 = R3::new(rat(1.0), rat_new(3.into(), 2.into()), rat(0.0));
    match isect_sym(t1, t2) {
        TriTriIsect::Segment(p, q) => {
            let (lo, hi) = if p.y < q.y { (p, q) } else { (q, p) };
            assert_eq!(lo, expect0);
            assert_eq!(hi, expect1);
        }
        other => panic!("expected Segment, got {other:?}"),
    }
}

#[test]
fn vertex_touching_face_is_point() {
    let t1 = [v(0.0, 0.0, 0.0), v(4.0, 0.0, 0.0), v(0.0, 4.0, 0.0)];
    // Apex touches t1's interior from above; the rest stays strictly above.
    let t2 = [v(1.0, 1.0, 0.0), v(2.0, 1.0, 3.0), v(1.0, 2.0, 3.0)];
    assert_eq!(isect_sym(t1, t2), TriTriIsect::Point(r3(1.0, 1.0, 0.0)));
}

#[test]
fn vertex_touching_vertex_is_point() {
    let t1 = [v(0.0, 0.0, 0.0), v(4.0, 0.0, 0.0), v(0.0, 4.0, 0.0)];
    let t2 = [v(0.0, 0.0, 0.0), v(-2.0, -1.0, 3.0), v(-1.0, -2.0, 3.0)];
    assert_eq!(isect_sym(t1, t2), TriTriIsect::Point(r3(0.0, 0.0, 0.0)));
}

#[test]
fn edge_lying_in_plane_clipped_to_face() {
    // t2 has one full edge inside t1's plane, crossing t1's interior.
    let t1 = [v(0.0, 0.0, 0.0), v(4.0, 0.0, 0.0), v(0.0, 4.0, 0.0)];
    let t2 = [v(1.0, -1.0, 0.0), v(1.0, 5.0, 0.0), v(1.0, 1.0, 3.0)];
    // The in-plane edge runs y ∈ [-1, 5] at x=1; t1 limits it to y ∈ [0, 3].
    match isect_sym(t1, t2) {
        TriTriIsect::Segment(p, q) => {
            let (lo, hi) = if p.y < q.y { (p, q) } else { (q, p) };
            assert_eq!(lo, r3(1.0, 0.0, 0.0));
            assert_eq!(hi, r3(1.0, 3.0, 0.0));
        }
        other => panic!("expected Segment, got {other:?}"),
    }
}

#[test]
fn shared_edge_between_meshes_is_segment() {
    // Non-coplanar triangles sharing a full edge (the touching-cubes shape).
    let t1 = [v(0.0, 0.0, 0.0), v(2.0, 0.0, 0.0), v(0.0, 0.0, 2.0)];
    let t2 = [v(0.0, 0.0, 0.0), v(2.0, 0.0, 0.0), v(0.0, 3.0, 0.0)];
    match isect_sym(t1, t2) {
        TriTriIsect::Segment(p, q) => {
            let (lo, hi) = if p.x < q.x { (p, q) } else { (q, p) };
            assert_eq!(lo, r3(0.0, 0.0, 0.0));
            assert_eq!(hi, r3(2.0, 0.0, 0.0));
        }
        other => panic!("expected Segment, got {other:?}"),
    }
}

#[test]
fn coplanar_identical_triangles() {
    let t1 = [v(0.0, 0.0, 1.0), v(4.0, 0.0, 1.0), v(0.0, 4.0, 1.0)];
    match isect_sym(t1, t1) {
        TriTriIsect::Coplanar {
            polygon,
            same_orientation,
        } => {
            assert!(same_orientation);
            assert_eq!(polygon.len(), 3);
            let mut got = polygon;
            got.sort();
            let mut want = vec![r3(0.0, 0.0, 1.0), r3(4.0, 0.0, 1.0), r3(0.0, 4.0, 1.0)];
            want.sort();
            assert_eq!(got, want);
        }
        other => panic!("expected Coplanar, got {other:?}"),
    }
}

#[test]
fn coplanar_opposite_orientation_detected() {
    let t1 = [v(0.0, 0.0, 1.0), v(4.0, 0.0, 1.0), v(0.0, 4.0, 1.0)];
    let t2 = [v(0.0, 0.0, 1.0), v(0.0, 4.0, 1.0), v(4.0, 0.0, 1.0)]; // flipped
    match isect_sym(t1, t2) {
        TriTriIsect::Coplanar {
            same_orientation, ..
        } => assert!(!same_orientation),
        other => panic!("expected Coplanar, got {other:?}"),
    }
}

#[test]
fn coplanar_partial_overlap_is_convex_polygon() {
    // Two right triangles in z=0 overlapping in a square-ish quad.
    let t1 = [v(0.0, 0.0, 0.0), v(4.0, 0.0, 0.0), v(0.0, 4.0, 0.0)];
    let t2 = [v(1.0, 1.0, 0.0), v(5.0, 1.0, 0.0), v(1.0, 5.0, 0.0)];
    match isect_sym(t1, t2) {
        TriTriIsect::Coplanar {
            polygon,
            same_orientation,
        } => {
            assert!(same_orientation);
            // Overlap is the triangle (1,1),(2,1)... worked out: the region
            // {x>=1, y>=1, x+y<=4} — a triangle with vertices (1,1),(3,1),(1,3).
            let mut got = polygon;
            got.sort();
            let mut want = vec![r3(1.0, 1.0, 0.0), r3(3.0, 1.0, 0.0), r3(1.0, 3.0, 0.0)];
            want.sort();
            assert_eq!(got, want);
        }
        other => panic!("expected Coplanar, got {other:?}"),
    }
}

#[test]
fn coplanar_hexagonal_overlap() {
    // Star-of-David configuration: two opposite equilateral-ish triangles
    // with a hexagonal intersection (6 vertices after canonicalization).
    let t1 = [v(0.0, 0.0, 0.0), v(6.0, 0.0, 0.0), v(3.0, 6.0, 0.0)];
    let t2 = [v(0.0, 4.0, 0.0), v(6.0, 4.0, 0.0), v(3.0, -2.0, 0.0)];
    match isect_sym(t1, t2) {
        TriTriIsect::Coplanar { polygon, .. } => assert_eq!(polygon.len(), 6),
        other => panic!("expected Coplanar, got {other:?}"),
    }
}

#[test]
fn coplanar_shared_edge_only_is_segment() {
    // Same plane, sharing exactly one edge, interiors disjoint.
    let t1 = [v(0.0, 0.0, 0.0), v(4.0, 0.0, 0.0), v(0.0, 4.0, 0.0)];
    let t2 = [v(0.0, 0.0, 0.0), v(4.0, 0.0, 0.0), v(2.0, -4.0, 0.0)];
    match isect_sym(t1, t2) {
        TriTriIsect::Segment(p, q) => {
            let (lo, hi) = if p.x < q.x { (p, q) } else { (q, p) };
            assert_eq!(lo, r3(0.0, 0.0, 0.0));
            assert_eq!(hi, r3(4.0, 0.0, 0.0));
        }
        other => panic!("expected Segment, got {other:?}"),
    }
}

#[test]
fn coplanar_vertex_touch_is_point() {
    let t1 = [v(0.0, 0.0, 0.0), v(4.0, 0.0, 0.0), v(0.0, 4.0, 0.0)];
    let t2 = [v(4.0, 0.0, 0.0), v(8.0, 0.0, 0.0), v(4.0, -4.0, 0.0)];
    // They share only the vertex (4,0,0): t2 lies in x>=4, y<=0.
    assert_eq!(isect_sym(t1, t2), TriTriIsect::Point(r3(4.0, 0.0, 0.0)));
}

#[test]
fn sliver_crossing_stays_exact() {
    // A long, ulp-thin sliver crossing a big triangle: predicates must not
    // lose the crossing to rounding.
    let eps = 2f64.powi(-40);
    let t1 = [v(-10.0, -10.0, 0.0), v(10.0, -10.0, 0.0), v(0.0, 10.0, 0.0)];
    let t2 = [
        v(-5.0, 0.0, -eps),
        v(5.0, 0.0, -eps),
        v(0.0, eps, 2.0 * eps),
    ];
    match isect_sym(t1, t2) {
        TriTriIsect::Segment(p, q) => assert_ne!(p, q),
        other => panic!("expected Segment, got {other:?}"),
    }
}

#[test]
fn dominant_axis_and_lift_round_trip() {
    let a = r3(0.1, 0.2, 0.3);
    let b = r3(1.7, -0.4, 0.9);
    let c = r3(-0.6, 1.1, 2.2);
    let n = tri_normal_r(&a, &b, &c);
    let axis = dominant_axis(&n);
    for p in [&a, &b, &c] {
        let lifted = lift_to_plane(&p.project_drop(axis), axis, &a, &n);
        assert_eq!(&lifted, p);
    }
}
