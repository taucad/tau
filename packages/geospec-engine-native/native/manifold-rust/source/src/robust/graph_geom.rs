// robust/graph_geom.rs — Geometric helpers of the intersection-graph build:
// triangle boxes and degeneracy, the filtered point-on-segment test used by
// the split registries, and the exact coplanar clip/containment tests used by
// the cross-copy step.
//
// Split out of robust/intersection_graph.rs (its only caller besides
// robust/graph_self_cut.rs and robust/soup.rs, which reach `tri_box` /
// `is_degenerate` through the `intersection_graph` re-exports). The exact
// predicates themselves live in robust/exact/{approx,predicates}.rs.

use super::exact::backend::{rat_is_zero, rat_zero, rat_one, Rational};

use crate::linalg::Vec3;
use crate::types::Box;

use super::exact::rational::R3;

pub(super) fn tri_box(t: &[Vec3; 3]) -> Box {
    let mut b = Box::from_points(t[0], t[1]);
    b.union_point(t[2]);
    b
}

pub(super) fn is_degenerate(t: &[Vec3; 3]) -> bool {
    // Certified-nonzero f64 cross first (magnitude-permanent bound, matching
    // exact/approx.rs conventions); only near-degenerate triangles pay for
    // the rational cross.
    const EPS: f64 = f64::EPSILON * 0.5;
    let u = t[1] - t[0];
    let v = t[2] - t[0];
    let n = crate::linalg::cross(u, v);
    let m = |k: usize| t[0][k].abs() + t[1][k].abs() + t[2][k].abs();
    let (mx, my, mz) = (m(0), m(1), m(2));
    if n.x.abs() > 16.0 * EPS * my * mz
        || n.y.abs() > 16.0 * EPS * mz * mx
        || n.z.abs() > 16.0 * EPS * mx * my
    {
        return false;
    }
    use super::exact::predicates::tri_normal_r;
    tri_normal_r(
        &R3::from_vec3(t[0]),
        &R3::from_vec3(t[1]),
        &R3::from_vec3(t[2]),
    )
    .is_zero()
}

/// Exact: p collinear with (a,b) and within the closed segment.
pub(super) fn point_on_segment(p: &R3, a: &R3, b: &R3) -> bool {
    super::exact::predicates::point_on_segment_r(p, a, b)
}

/// Correctly rounded f64 approximation of an exact point (relative error
/// ≤ ε per coordinate) for the semi-static prefilters in exact/approx.rs.
pub(super) fn approx3(p: &R3) -> [f64; 3] {
    use super::exact::rational::rat_to_f64;
    [rat_to_f64(&p.x), rat_to_f64(&p.y), rat_to_f64(&p.z)]
}

/// Filtered point-on-segment: the approx prefilter rejects the generic case
/// without touching the bignum tier; only near-incidences run the exact test.
/// Conservative 3D box `[min; 3], [max; 3]` around a segment's exact
/// endpoints from their correctly rounded approximations, inflated past
/// rounding error — a point exactly on the segment is never rejected by
/// testing its approximation against this box. Mirrors the 2D prefilter in
/// robust/arrangement.rs; the registry sweeps in the build pipeline were
/// quadratic in exact comparisons without it.
#[inline]
pub(super) fn seg_box3(a: [f64; 3], b: [f64; 3]) -> [[f64; 3]; 2] {
    let pad = |x: f64| x.abs() * 1e-15 + f64::MIN_POSITIVE;
    let mut lo = [0.0; 3];
    let mut hi = [0.0; 3];
    for k in 0..3 {
        let (l, h) = (a[k].min(b[k]), a[k].max(b[k]));
        lo[k] = l - pad(l);
        hi[k] = h + pad(h);
    }
    [lo, hi]
}

#[inline]
pub(super) fn box3_contains(b: &[[f64; 3]; 2], p: [f64; 3]) -> bool {
    (0..3).all(|k| p[k] >= b[0][k] && p[k] <= b[1][k])
}

pub(super) fn point_on_segment_f(
    p_approx: [f64; 3],
    p: &R3,
    a_approx: [f64; 3],
    a: &R3,
    b_approx: [f64; 3],
    b: &R3,
) -> bool {
    match super::exact::approx::not_on_segment_a(p_approx, a_approx, b_approx) {
        Some(false) => false,
        _ => point_on_segment(p, a, b),
    }
}

/// Clip segment (a,b) to a convex coplanar polygon (2D test via projection
/// on the polygon's own plane). Returns a positive-length sub-segment or
/// None. Used to cross-copy primitives into coplanar overlap regions.
pub(super) fn clip_segment_to_polygon(a: &R3, b: &R3, poly: &[R3]) -> Option<(R3, R3)> {
    use super::exact::predicates::{orient2d_r, tri_normal_r};
    use super::exact::rational::R2;
    use super::exact::Sign;
    use super::tri_tri::dominant_axis;

    debug_assert!(poly.len() >= 3);
    let n = tri_normal_r(&poly[0], &poly[1], &poly[2]);
    let axis = dominant_axis(&n);
    let mut pts2: Vec<R2> = poly.iter().map(|p| p.project_drop(axis)).collect();
    if orient2d_r(&pts2[0], &pts2[1], &pts2[2]) == Sign::Neg {
        pts2.reverse();
    }
    let a2 = a.project_drop(axis);
    let b2 = b.project_drop(axis);
    let dir = b2.sub(&a2);

    // Parametric clip of [0,1] against each CCW edge halfplane.
    let mut t0 = rat_zero();
    let mut t1 = rat_one();
    for i in 0..pts2.len() {
        let e0 = &pts2[i];
        let e1 = &pts2[(i + 1) % pts2.len()];
        let edge = e1.sub(e0);
        // Signed distance numerators of a2 + t*dir against the edge line:
        // f(t) = cross(edge, a2 + t*dir - e0) = fa + t * fd.
        let fa = edge.cross(&a2.sub(e0));
        let fd = edge.cross(&dir);
        if rat_is_zero(&fd) {
            if fa < rat_zero() {
                return None; // parallel and strictly outside
            }
            continue;
        }
        let t_hit = -&fa / &fd;
        if fd > rat_zero() {
            // entering: f grows with t → require t >= t_hit
            if t_hit > t0 {
                t0 = t_hit;
            }
        } else if t_hit < t1 {
            t1 = t_hit;
        }
        if t0 >= t1 {
            return None;
        }
    }
    if t0 >= t1 {
        return None;
    }
    let seg = |t: &Rational| a.add(&b.sub(a).scale(t));
    Some((seg(&t0), seg(&t1)))
}

/// Exact point-in-convex-polygon test for a point on the polygon's plane.
pub(super) fn point_in_polygon_coplanar(p: &R3, poly: &[R3]) -> bool {
    use super::exact::predicates::{orient2d_r, tri_normal_r};
    use super::exact::Sign;
    use super::tri_tri::dominant_axis;

    let n = tri_normal_r(&poly[0], &poly[1], &poly[2]);
    let axis = dominant_axis(&n);
    let mut pts2: Vec<_> = poly.iter().map(|q| q.project_drop(axis)).collect();
    if orient2d_r(&pts2[0], &pts2[1], &pts2[2]) == Sign::Neg {
        pts2.reverse();
    }
    let p2 = p.project_drop(axis);
    for i in 0..pts2.len() {
        if orient2d_r(&pts2[i], &pts2[(i + 1) % pts2.len()], &p2) == Sign::Neg {
            return false;
        }
    }
    true
}
