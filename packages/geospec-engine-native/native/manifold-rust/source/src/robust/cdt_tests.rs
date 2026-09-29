// robust/cdt_tests.rs — Unit tests for the exact constrained Delaunay
// triangulation (robust/cdt.rs): structural validity (area conservation,
// Euler characteristic, CCW orientation), the Delaunay property on
// unconstrained edges, constraint preservation, and randomized fuzzing.

use std::collections::{BTreeMap, BTreeSet};

use super::super::exact::backend::{rat_abs, rat_zero, Rational};

use crate::linalg::Vec2;

use super::super::exact::predicates::{incircle_r, orient2d_r};
use super::super::exact::rational::R2;
use super::super::exact::Sign;
use super::triangulate;

fn r2(x: f64, y: f64) -> R2 {
    R2::from_vec2(Vec2::new(x, y))
}

/// Twice the signed area, exact.
fn area2(a: &R2, b: &R2, c: &R2) -> Rational {
    b.sub(a).cross(&c.sub(a))
}

/// Full structural validation of a triangulation of `points` (corners first):
/// CCW triangles, exact area conservation, Euler characteristic V-E+T = 1,
/// every point used, constraints present, and local Delaunay on every
/// unconstrained internal edge.
fn validate(points: &[R2], constraints: &[(usize, usize)], tris: &[[usize; 3]]) {
    // CCW and area sum.
    let mut total = rat_zero();
    for t in tris {
        let a2 = area2(&points[t[0]], &points[t[1]], &points[t[2]]);
        assert_eq!(Sign::of_rat(&a2), Sign::Pos, "sub-triangle not CCW: {t:?}");
        total = total + a2;
    }
    let base = rat_abs(&area2(&points[0], &points[1], &points[2]));
    assert_eq!(total, base, "sub-triangle areas do not sum to the base area");

    // Edge set + Euler.
    let mut edges: BTreeSet<(usize, usize)> = BTreeSet::new();
    let mut used: BTreeSet<usize> = BTreeSet::new();
    for t in tris {
        for e in 0..3 {
            let (u, v) = (t[e], t[(e + 1) % 3]);
            edges.insert((u.min(v), u.max(v)));
            used.insert(u);
        }
    }
    assert_eq!(used.len(), points.len(), "not every point appears in the output");
    let euler = points.len() as i64 - edges.len() as i64 + tris.len() as i64;
    assert_eq!(euler, 1, "Euler characteristic violated");

    // Constraints preserved.
    for &(a, b) in constraints {
        assert!(
            edges.contains(&(a.min(b), a.max(b))),
            "constraint ({a},{b}) missing from output"
        );
    }

    // Local Delaunay on unconstrained internal edges: build edge → tris map.
    let con: BTreeSet<(usize, usize)> = constraints
        .iter()
        .map(|&(a, b)| (a.min(b), a.max(b)))
        .collect();
    let mut edge_tris: BTreeMap<(usize, usize), Vec<usize>> = BTreeMap::new();
    for (i, t) in tris.iter().enumerate() {
        for e in 0..3 {
            let (u, v) = (t[e], t[(e + 1) % 3]);
            edge_tris.entry((u.min(v), u.max(v))).or_default().push(i);
        }
    }
    for (edge, owners) in &edge_tris {
        assert!(owners.len() <= 2, "edge shared by {} triangles", owners.len());
        if owners.len() != 2 || con.contains(edge) {
            continue;
        }
        for (i, j) in [(0usize, 1usize), (1, 0)] {
            let t = &tris[owners[i]];
            let other = &tris[owners[j]];
            let d = other
                .iter()
                .copied()
                .find(|v| *v != edge.0 && *v != edge.1)
                .unwrap();
            assert_ne!(
                incircle_r(&points[t[0]], &points[t[1]], &points[t[2]], &points[d]),
                Sign::Pos,
                "unconstrained edge {edge:?} strictly violates Delaunay"
            );
        }
    }
}

#[test]
fn bare_triangle_passes_through() {
    let pts = vec![r2(0.0, 0.0), r2(4.0, 0.0), r2(0.0, 4.0)];
    let tris = triangulate(&pts, &[]);
    assert_eq!(tris.len(), 1);
    validate(&pts, &[], &tris);
}

#[test]
fn cw_corner_order_is_normalized() {
    let pts = vec![r2(0.0, 0.0), r2(0.0, 4.0), r2(4.0, 0.0)]; // CW
    let tris = triangulate(&pts, &[]);
    assert_eq!(tris.len(), 1);
    validate(&pts, &[], &tris);
}

#[test]
fn interior_point_splits_into_three() {
    let pts = vec![r2(0.0, 0.0), r2(4.0, 0.0), r2(0.0, 4.0), r2(1.0, 1.0)];
    let tris = triangulate(&pts, &[]);
    assert_eq!(tris.len(), 3);
    validate(&pts, &[], &tris);
}

#[test]
fn point_on_hull_edge_splits_into_two() {
    let pts = vec![r2(0.0, 0.0), r2(4.0, 0.0), r2(0.0, 4.0), r2(2.0, 0.0)];
    let tris = triangulate(&pts, &[]);
    assert_eq!(tris.len(), 2);
    validate(&pts, &[], &tris);
}

#[test]
fn point_on_interior_edge_splits_both_sides() {
    // Interior point first creates internal edges; a second point on one of
    // them must split both adjacent triangles.
    let pts = vec![
        r2(0.0, 0.0),
        r2(8.0, 0.0),
        r2(0.0, 8.0),
        r2(2.0, 2.0),
        r2(1.0, 1.0), // on segment (0,0)-(2,2), an internal edge of the split
    ];
    let tris = triangulate(&pts, &[]);
    validate(&pts, &[], &tris);
}

#[test]
fn constraint_forces_non_delaunay_diagonal() {
    // Two interior points forming a quad with the corners where Delaunay
    // prefers one diagonal; constrain the other and verify it survives.
    let pts = vec![
        r2(0.0, 0.0),
        r2(10.0, 0.0),
        r2(0.0, 10.0),
        r2(3.0, 1.0),
        r2(1.0, 3.0),
    ];
    let con = [(3usize, 4usize)];
    let tris = triangulate(&pts, &con);
    validate(&pts, &con, &tris);
}

#[test]
fn constraint_chain_of_collinear_points() {
    // A polyline of collinear points across the triangle, each sub-segment
    // constrained (as the arrangement emits them).
    let pts = vec![
        r2(0.0, 0.0),
        r2(8.0, 0.0),
        r2(0.0, 8.0),
        r2(1.0, 1.0),
        r2(2.0, 2.0),
        r2(3.0, 3.0),
    ];
    let con = [(3usize, 4usize), (4, 5)];
    let tris = triangulate(&pts, &con);
    validate(&pts, &con, &tris);
}

#[test]
fn crossing_star_constraints_split_at_center() {
    // Two constraint chains through a shared center point (as the
    // arrangement produces for crossing intersection segments).
    let pts = vec![
        r2(0.0, 0.0),
        r2(12.0, 0.0),
        r2(0.0, 12.0),
        r2(2.0, 2.0), // center
        r2(1.0, 2.0),
        r2(3.0, 2.0),
        r2(2.0, 1.0),
        r2(2.0, 3.0),
    ];
    let con = [(4usize, 3usize), (3, 5), (6, 3), (3, 7)];
    let tris = triangulate(&pts, &con);
    validate(&pts, &con, &tris);
}

#[test]
fn fuzz_random_interior_points() {
    // Deterministic LCG; integer-coordinate points inside the triangle
    // x,y >= 1, x+y <= 62 of base triangle (0,0),(64,0),(0,64).
    let mut state = 0x853C49E6748FEA9Bu64;
    let mut next = move || {
        state = state
            .wrapping_mul(6364136223846793005)
            .wrapping_add(1442695040888963407);
        state
    };
    for round in 0..30 {
        let mut pts = vec![r2(0.0, 0.0), r2(64.0, 0.0), r2(0.0, 64.0)];
        let mut seen: BTreeSet<(u64, u64)> = BTreeSet::new();
        let n = 3 + (next() % 40) as usize;
        while seen.len() < n {
            let x = 1 + next() % 60;
            let y = 1 + next() % (62 - x.min(60));
            if x + y <= 62 {
                seen.insert((x, y));
            }
        }
        for &(x, y) in &seen {
            pts.push(r2(x as f64, y as f64));
        }
        let tris = triangulate(&pts, &[]);
        validate(&pts, &[], &tris);
        assert_eq!(tris.len(), 2 * seen.len() + 1, "round {round}: T = 2*interior + 1");
    }
}

#[test]
fn fuzz_random_constraints() {
    // Random interior points plus non-crossing constraints built from a
    // random walk (consecutive pairs share endpoints only).
    let mut state = 0xDA3E39CB94B95BDBu64;
    let mut next = move || {
        state = state
            .wrapping_mul(6364136223846793005)
            .wrapping_add(1442695040888963407);
        state
    };
    for _round in 0..20 {
        let mut pts = vec![r2(0.0, 0.0), r2(64.0, 0.0), r2(0.0, 64.0)];
        let mut seen: BTreeSet<(u64, u64)> = BTreeSet::new();
        while seen.len() < 12 {
            let x = 1 + next() % 60;
            let y = 1 + next() % (62 - x.min(60));
            if x + y <= 62 {
                seen.insert((x, y));
            }
        }
        for &(x, y) in &seen {
            pts.push(r2(x as f64, y as f64));
        }
        // One constraint between a random pair, provided no other point lies
        // strictly inside the segment and it stays inside the triangle hull
        // (always true for interior endpoints).
        let mut con: Vec<(usize, usize)> = Vec::new();
        'outer: for _ in 0..8 {
            let a = 3 + (next() % (pts.len() as u64 - 3)) as usize;
            let b = 3 + (next() % (pts.len() as u64 - 3)) as usize;
            if a == b {
                continue;
            }
            // Reject if any point lies strictly inside segment (a,b) or an
            // existing constraint properly crosses it — mirrors the
            // arrangement's preconditions.
            for (i, p) in pts.iter().enumerate() {
                if i == a || i == b {
                    continue;
                }
                if orient2d_r(&pts[a], &pts[b], p) == Sign::Zero {
                    let d = pts[b].sub(&pts[a]);
                    let t = p.sub(&pts[a]).dot(&d);
                    if t > rat_zero() && t < d.dot(&d) {
                        continue 'outer;
                    }
                }
            }
            for &(c, d) in &con {
                let s1 = orient2d_r(&pts[a], &pts[b], &pts[c]);
                let s2 = orient2d_r(&pts[a], &pts[b], &pts[d]);
                let s3 = orient2d_r(&pts[c], &pts[d], &pts[a]);
                let s4 = orient2d_r(&pts[c], &pts[d], &pts[b]);
                if s1 != Sign::Zero && s2 != Sign::Zero && s1 != s2
                    && s3 != Sign::Zero && s4 != Sign::Zero && s3 != s4
                {
                    continue 'outer;
                }
            }
            con.push((a, b));
        }
        let tris = triangulate(&pts, &con);
        validate(&pts, &con, &tris);
    }
}

/// `is_exact` gates the exact-input filters, so it must never call an
/// inexactly-rounded rational exact. Checked against the correctly rounded
/// conversion in both directions: every accepted value round-trips, and the
/// values it rejects are only ever a lost optimization.
#[test]
fn is_exact_only_accepts_values_that_round_trip() {
    use super::super::exact::backend::{rat_eq, rat_from_f64, rat_new, Int};
    use super::super::exact::rational::rat_to_f64;
    use super::is_exact;

    let mut accepted = 0usize;
    let mut lcg = 0x1234_5678_9abc_def0u64;
    let mut next = || {
        lcg = lcg
            .wrapping_mul(6364136223846793005)
            .wrapping_add(1442695040888963407);
        lcg
    };
    for i in 0..20_000u64 {
        // A mix of exact f64s, integer ratios (mostly non-dyadic), and
        // deliberately huge-denominator constructions.
        let r: Rational = match i % 4 {
            0 => rat_from_f64(f64::from_bits(next() | (1 << 52)) % 1e6).unwrap_or_default(),
            1 => rat_new(
                Int::from((next() % 100_000) as i64),
                Int::from((next() % 100_000 + 1) as i64),
            ),
            2 => rat_new(Int::from((next() % 1000) as i64), Int::from(3u8).pow(40)),
            _ => rat_from_f64(((next() % 2000) as f64 - 1000.0) / 64.0).unwrap(),
        };
        let f = rat_to_f64(&r);
        if is_exact(&r) {
            accepted += 1;
            assert!(
                f.is_finite() && rat_eq(&rat_from_f64(f).unwrap(), &r),
                "is_exact accepted a value that does not round-trip: {r:?}"
            );
        }
    }
    assert!(accepted > 5_000, "test should exercise the accept path ({accepted})");
}
