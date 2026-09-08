// robust/tri_tri.rs — Exact triangle-triangle intersection for the robust
// boolean engine.
//
// Narrow phase behind the Collider broad phase: given one triangle from each
// operand mesh, classify their intersection exactly as nothing, a single
// point, a segment, or (for coplanar pairs) a convex overlap polygon. All
// vertex-vs-plane tests go through the filtered predicates in
// robust/exact/filtered.rs; every constructed point is exact rational
// (robust/exact/predicates.rs), so downstream arrangements
// (robust/arrangement.rs) never see rounded coordinates.
//
// Degenerate (zero-area) input triangles are the caller's responsibility to
// drop beforehand (paper §5 pre-processing); this file debug-asserts that.

use super::exact::backend::{rat_zero, Int, Signed};

use crate::linalg::Vec3;

use super::exact::approx::orient2d_a;
use super::exact::filtered::orient3d;
use super::exact::predicates::{
    homog2_of, line_line_intersect_2d, line_plane_intersect, orient2d_h, tri_normal_r,
    Homog2,
};
use super::exact::rational::{r2_eq, rat_to_f64, R2, R3};
use super::exact::Sign;

/// Exact intersection of two triangles.
#[derive(Clone, Debug, PartialEq)]
pub enum TriTriIsect {
    None,
    /// Single-point contact (vertex-on-face, vertex-on-edge, edge-through-
    /// edge, or interval intersection collapsing to one point).
    Point(R3),
    /// Proper crossing (or edge/vertex contact with positive length).
    Segment(R3, R3),
    /// Coplanar triangles overlapping with positive area. `polygon` is the
    /// convex overlap region (distinct vertices, no three collinear, no
    /// guaranteed winding); `same_orientation` is true when the two
    /// triangles' normals point the same way, false for opposite planes.
    Coplanar {
        polygon: Vec<R3>,
        same_orientation: bool,
    },
}

/// Dominant-axis choice for the paper's bijective drop-one-coordinate
/// projection: the axis of the exactly-largest |normal| component (ties
/// broken toward z, then y). The chosen component is guaranteed nonzero for
/// a non-degenerate triangle.
pub fn dominant_axis(n: &R3) -> usize {
    let ax = n.x.abs();
    let ay = n.y.abs();
    let az = n.z.abs();
    if az >= ax && az >= ay {
        2
    } else if ay >= ax {
        1
    } else {
        0
    }
}

// Re-exported for the existing call sites; the implementation lives with the
// other integer-only constructions in robust/exact/predicates.rs.
pub use super::exact::predicates::lift_to_plane;

/// Exit-path counters for perf analysis, printed under MANIFOLD_TIMING by
/// the self-cut loop. Relaxed atomics; negligible cost on the hot path.
pub mod stats {
    use std::sync::atomic::{AtomicU64, Ordering::Relaxed};

    pub static PLANE_REJECT: AtomicU64 = AtomicU64::new(0);
    pub static COPLANAR: AtomicU64 = AtomicU64::new(0);
    pub static COPLANAR_SAT: AtomicU64 = AtomicU64::new(0);
    pub static SAT_REJECT: AtomicU64 = AtomicU64::new(0);
    pub static INTERVAL: AtomicU64 = AtomicU64::new(0);
    pub static COPLANAR_NS: AtomicU64 = AtomicU64::new(0);
    /// Time spent in the exact coplanar clip proper, i.e. after the f64
    /// separating-edge pre-reject has failed. Broken out because the
    /// pre-reject and the clip differ by two orders of magnitude per pair.
    pub static COPLANAR_CLIP_NS: AtomicU64 = AtomicU64::new(0);
    pub static PLANE_NS: AtomicU64 = AtomicU64::new(0);
    pub static INTERVAL_NS: AtomicU64 = AtomicU64::new(0);

    pub fn snapshot_and_reset() -> String {
        let take = |a: &AtomicU64| a.swap(0, Relaxed);
        format!(
            "plane-reject {} ({:.3}s signs), coplanar {} (sat {}, {:.3}s of which clip {:.3}s), sat-reject {}, interval {} ({:.3}s)",
            take(&PLANE_REJECT),
            take(&PLANE_NS) as f64 * 1e-9,
            take(&COPLANAR),
            take(&COPLANAR_SAT),
            take(&COPLANAR_NS) as f64 * 1e-9,
            take(&COPLANAR_CLIP_NS) as f64 * 1e-9,
            take(&SAT_REJECT),
            take(&INTERVAL),
            take(&INTERVAL_NS) as f64 * 1e-9,
        )
    }
}

/// Exact intersection of triangles t1 and t2 (each three finite f64
/// vertices). Symmetric: swapping the arguments yields the same set.
pub fn tri_tri_intersect(t1: [Vec3; 3], t2: [Vec3; 3]) -> TriTriIsect {
    use std::sync::atomic::Ordering::Relaxed;
    let t_signs = crate::timing::Stopwatch::start();
    // Signs of t2's vertices against t1's plane.
    let s2 = [
        orient3d(t1[0], t1[1], t1[2], t2[0]),
        orient3d(t1[0], t1[1], t1[2], t2[1]),
        orient3d(t1[0], t1[1], t1[2], t2[2]),
    ];
    if all_same_strict(&s2) {
        stats::PLANE_REJECT.fetch_add(1, Relaxed);
        stats::PLANE_NS.fetch_add(t_signs.elapsed_ns(), Relaxed);
        return TriTriIsect::None;
    }
    if s2.iter().all(|s| *s == Sign::Zero) {
        stats::COPLANAR.fetch_add(1, Relaxed);
        let out = coplanar_overlap(t1, t2);
        stats::COPLANAR_NS.fetch_add(t_signs.elapsed_ns(), Relaxed);
        return out;
    }
    // Signs of t1's vertices against t2's plane.
    let s1 = [
        orient3d(t2[0], t2[1], t2[2], t1[0]),
        orient3d(t2[0], t2[1], t2[2], t1[1]),
        orient3d(t2[0], t2[1], t2[2], t1[2]),
    ];
    if all_same_strict(&s1) {
        stats::PLANE_REJECT.fetch_add(1, Relaxed);
        stats::PLANE_NS.fetch_add(t_signs.elapsed_ns(), Relaxed);
        return TriTriIsect::None;
    }
    stats::PLANE_NS.fetch_add(t_signs.elapsed_ns(), Relaxed);
    debug_assert!(
        !s1.iter().all(|s| *s == Sign::Zero),
        "t1 coplanar with t2's plane implies t2 coplanar with t1's — handled above"
    );

    // Both triangles straddle each other's plane, but most such box-pair
    // candidates still miss along the common line. A certified
    // separating-axis check on the raw f64 vertices skips the entire
    // rational interval construction for them.
    {
        let f1 = [
            [t1[0].x, t1[0].y, t1[0].z],
            [t1[1].x, t1[1].y, t1[1].z],
            [t1[2].x, t1[2].y, t1[2].z],
        ];
        let f2 = [
            [t2[0].x, t2[0].y, t2[0].z],
            [t2[1].x, t2[1].y, t2[1].z],
            [t2[2].x, t2[2].y, t2[2].z],
        ];
        if super::exact::approx::sat_edge_axes_disjoint(&f1, &f2) {
            stats::SAT_REJECT.fetch_add(1, Relaxed);
            return TriTriIsect::None;
        }
    }
    stats::INTERVAL.fetch_add(1, Relaxed);
    let t_interval = crate::timing::Stopwatch::start();

    // Both triangles meet the common line L of the two planes. Overlap the
    // two 1- or 2-point intervals along L entirely in scaled integer
    // arithmetic (no rational constructions, no gcds): per-axis power-of-two
    // scaling maps every vertex to an exact integer, and for points on L the
    // scaled-space parameter dir_s·x_s is a positive multiple of the true
    // parameter dir·x (x−y ∥ dir makes the difference d·|A·dir|²·λ for
    // x−y = λ·dir), so ordering — including its orientation — matches the
    // rational computation exactly. Endpoints stay symbolic; only the 1–2
    // points of the final answer are constructed rationally.
    let out = interval_overlap(t1, t2, &s1, &s2);
    stats::INTERVAL_NS.fetch_add(t_interval.elapsed_ns(), Relaxed);
    out
}

/// Symbolic interval endpoint on the common line L: an original vertex
/// exactly on the other plane, or a strictly straddling edge's crossing.
#[derive(Clone, Copy)]
enum EndPt {
    /// (which_tri: 0|1, vertex index)
    Vert(u8, u8),
    /// (which_tri: 0|1, edge start index i — the edge runs i → (i+1)%3)
    Cross(u8, u8),
}

fn interval_overlap(t1: [Vec3; 3], t2: [Vec3; 3], s1: &[Sign; 3], s2: &[Sign; 3]) -> TriTriIsect {
    // Fast path: when a triangle has exactly one vertex ON the other's plane
    // and its remaining vertices strictly on one side, its interval on the
    // common line L is that single vertex. Two degenerate intervals overlap
    // iff the vertices coincide — original f64 vertices are equal as
    // rationals iff equal as f64, so no arithmetic at all. This is the
    // dominant configuration on touching sheets (vertex-to-vertex contacts).
    let degenerate_at = |s: &[Sign; 3]| -> Option<usize> {
        (0..3).find(|&i| {
            s[i] == Sign::Zero
                && s[(i + 1) % 3] != Sign::Zero
                && s[(i + 1) % 3] == s[(i + 2) % 3]
        })
    };
    if let (Some(i), Some(j)) = (degenerate_at(s1), degenerate_at(s2)) {
        // Ties prefer t1's endpoint, matching the general path's lo pick.
        return if t1[i] == t2[j] {
            TriTriIsect::Point(R3::from_vec3(t1[i]))
        } else {
            TriTriIsect::None
        };
    }

    // Scaled integer coordinates; one common scale per axis across BOTH
    // triangles so cross-triangle parameter comparisons share a basis.
    let sx = super::exact::intpred::scaled_big([
        t1[0].x, t1[1].x, t1[2].x, t2[0].x, t2[1].x, t2[2].x,
    ]);
    let sy = super::exact::intpred::scaled_big([
        t1[0].y, t1[1].y, t1[2].y, t2[0].y, t2[1].y, t2[2].y,
    ]);
    let sz = super::exact::intpred::scaled_big([
        t1[0].z, t1[1].z, t1[2].z, t2[0].z, t2[1].z, t2[2].z,
    ]);
    let v = |k: usize| [&sx[k], &sy[k], &sz[k]];
    let sub = |a: [&Int; 3], b: [&Int; 3]| [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    let cross = |a: &[Int; 3], b: &[Int; 3]| {
        [
            &a[1] * &b[2] - &a[2] * &b[1],
            &a[2] * &b[0] - &a[0] * &b[2],
            &a[0] * &b[1] - &a[1] * &b[0],
        ]
    };
    let dot = |a: &[Int; 3], b: [&Int; 3]| &a[0] * b[0] + &a[1] * b[1] + &a[2] * b[2];

    let n1 = cross(&sub(v(1), v(0)), &sub(v(2), v(0)));
    let n2 = cross(&sub(v(4), v(3)), &sub(v(5), v(3)));
    let dir = cross(&n1, &n2);
    debug_assert!(
        dir.iter().any(|c| !c.is_zero()),
        "non-coplanar intersecting planes"
    );

    // Parameters dir·v and signed heights against the other triangle's
    // plane, computed lazily: a typical call touches 2–4 of the six
    // vertices, and every skipped dot product is three skipped Int
    // multiplications. Height signs replicate s1/s2 exactly.
    let du = |k: usize| dot(&dir, v(k));
    let h = |k: usize, n: &[Int; 3], origin: usize| dot(n, v(k)) - dot(n, v(origin));
    #[cfg(debug_assertions)]
    for i in 0..3 {
        debug_assert_eq!(int_sign(&h(i, &n2, 3)), s1[i], "scaled height disagrees with s1");
        debug_assert_eq!(int_sign(&h(3 + i, &n1, 0)), s2[i], "scaled height disagrees with s2");
    }

    // The ≤2 endpoints of one triangle's crossing with the other's plane, as
    // (unreduced parameter fraction, symbolic point), in the same
    // enumeration order as the rational implementation used (vertices in
    // index order, then edges (0,1), (1,2), (2,0)) so ties break alike.
    let endpoints = |which: u8, s: &[Sign; 3]| -> Vec<(Frac, EndPt)> {
        let base = if which == 0 { 0 } else { 3 };
        let (n, origin) = if which == 0 { (&n2, 3) } else { (&n1, 0) };
        let mut pts = Vec::with_capacity(2);
        for i in 0..3 {
            if s[i] == Sign::Zero {
                pts.push((
                    (du(base + i), Int::from(1)),
                    EndPt::Vert(which, i as u8),
                ));
            }
        }
        for i in 0..3 {
            let j = (i + 1) % 3;
            if s[i] != Sign::Zero && s[j] != Sign::Zero && s[i] != s[j] {
                // x = u + h_u/(h_u−h_v)·(v−u) ⇒
                // dir·x = [(h_u−h_v)·du_u + h_u·(du_v−du_u)] / (h_u−h_v).
                let hu = h(base + i, n, origin);
                let hv = h(base + j, n, origin);
                let du_u = du(base + i);
                let du_v = du(base + j);
                let mut den = &hu - &hv;
                let mut num = &den * &du_u + &hu * (&du_v - &du_u);
                if den.is_negative() {
                    den = -den;
                    num = -num;
                }
                pts.push(((num, den), EndPt::Cross(which, i as u8)));
            }
        }
        debug_assert!(!pts.is_empty() && pts.len() <= 2);
        pts
    };
    let pts1 = endpoints(0, s1);
    let pts2 = endpoints(1, s2);

    // Per-triangle interval, first-encountered point winning ties (matching
    // the old interval_along).
    let minmax = |pts: Vec<(Frac, EndPt)>| -> ((Frac, EndPt), (Frac, EndPt)) {
        let mut lo = pts[0].clone();
        let mut hi = pts[0].clone();
        for p in &pts[1..] {
            if cmp_frac(&p.0, &lo.0) == std::cmp::Ordering::Less {
                lo = p.clone();
            }
            if cmp_frac(&p.0, &hi.0) == std::cmp::Ordering::Greater {
                hi = p.clone();
            }
        }
        (lo, hi)
    };
    let i1 = minmax(pts1);
    let i2 = minmax(pts2);
    let (lo, lo_pt) = if cmp_frac(&i1.0 .0, &i2.0 .0) != std::cmp::Ordering::Less { i1.0 } else { i2.0 };
    let (hi, hi_pt) = if cmp_frac(&i1.1 .0, &i2.1 .0) != std::cmp::Ordering::Greater { i1.1 } else { i2.1 };

    match cmp_frac(&lo, &hi) {
        std::cmp::Ordering::Greater => TriTriIsect::None,
        std::cmp::Ordering::Equal => TriTriIsect::Point(build_endpoint(lo_pt, &t1, &t2)),
        std::cmp::Ordering::Less => TriTriIsect::Segment(
            build_endpoint(lo_pt, &t1, &t2),
            build_endpoint(hi_pt, &t1, &t2),
        ),
    }
}

#[cfg(debug_assertions)]
fn int_sign(v: &Int) -> Sign {
    if v.is_zero() {
        Sign::Zero
    } else if v.is_negative() {
        Sign::Neg
    } else {
        Sign::Pos
    }
}

/// Materialize a symbolic interval endpoint as the exact rational point the
/// fully rational implementation would have produced.
fn build_endpoint(e: EndPt, t1: &[Vec3; 3], t2: &[Vec3; 3]) -> R3 {
    let tri = |which: u8| if which == 0 { t1 } else { t2 };
    match e {
        EndPt::Vert(w, i) => R3::from_vec3(tri(w)[i as usize]),
        EndPt::Cross(w, i) => {
            let own = tri(w);
            let other = tri(1 - w);
            let a = R3::from_vec3(own[i as usize]);
            let b = R3::from_vec3(own[(i as usize + 1) % 3]);
            let p: [R3; 3] = [
                R3::from_vec3(other[0]),
                R3::from_vec3(other[1]),
                R3::from_vec3(other[2]),
            ];
            line_plane_intersect(&a, &b, &p[0], &p[1], &p[2])
                .expect("strictly straddling edge cannot be parallel to the plane")
        }
    }
}

/// Unreduced fraction with positive denominator.
type Frac = (Int, Int);

fn cmp_frac(a: &Frac, b: &Frac) -> std::cmp::Ordering {
    // Denominators positive → cross-multiplication preserves order.
    (&a.0 * &b.1).cmp(&(&b.0 * &a.1))
}

fn all_same_strict(s: &[Sign; 3]) -> bool {
    s[0] != Sign::Zero && s[0] == s[1] && s[1] == s[2]
}

// ─── Coplanar overlap ────────────────────────────────────────────────────────

/// Certified separating-edge pre-reject for coplanar pairs, on the raw f64
/// projection dropping coordinate `axis`. Sound for ANY choice of axis: a
/// projection is linear, so a shared 3D point would project into both
/// projected triangles — strict 2D separation therefore proves 3D
/// disjointness even when the projection degenerates the triangles. Signs
/// come from the exact filtered orient2d, so a `true` answer is certain.
fn coplanar_separated_2d(t1: [Vec3; 3], t2: [Vec3; 3], axis: usize) -> bool {
    use super::exact::filtered::orient2d;
    // Same cyclic drop-axis convention as R3::project_drop.
    let proj = |v: Vec3| match axis {
        0 => crate::linalg::Vec2::new(v.y, v.z),
        1 => crate::linalg::Vec2::new(v.z, v.x),
        _ => crate::linalg::Vec2::new(v.x, v.y),
    };
    let p1 = t1.map(proj);
    let p2 = t2.map(proj);
    let separates = |tri: &[crate::linalg::Vec2; 3], other: &[crate::linalg::Vec2; 3]| {
        (0..3).any(|i| {
            let a = tri[i];
            let b = tri[(i + 1) % 3];
            let s_ref = orient2d(a, b, tri[(i + 2) % 3]);
            s_ref != Sign::Zero
                && other.iter().all(|&q| {
                    let s = orient2d(a, b, q);
                    s != Sign::Zero && s != s_ref
                })
        })
    };
    separates(&p1, &p2) || separates(&p2, &p1)
}

/// Intersection of two coplanar triangles: Sutherland–Hodgman clip of t2
/// against t1 in the exact 2D projection, classified by the dimension of the
/// result (empty / point / segment / convex polygon).
fn coplanar_overlap(t1: [Vec3; 3], t2: [Vec3; 3]) -> TriTriIsect {
    {
        let n = crate::linalg::cross(t1[1] - t1[0], t1[2] - t1[0]);
        let (ax, ay, az) = (n.x.abs(), n.y.abs(), n.z.abs());
        let axis = if az >= ax && az >= ay { 2 } else if ay >= ax { 1 } else { 0 };
        if coplanar_separated_2d(t1, t2, axis) {
            stats::COPLANAR_SAT.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
            return TriTriIsect::None;
        }
    }
    let t_clip = crate::timing::Stopwatch::start();
    let out = coplanar_clip(t1, t2);
    stats::COPLANAR_CLIP_NS.fetch_add(t_clip.elapsed_ns(), std::sync::atomic::Ordering::Relaxed);
    out
}

/// A clip vertex carried with the two auxiliary forms the sign tests want:
/// the homogenized integer triple (exact fallback) and the correctly rounded
/// f64 approximation (semi-static filter). Both are pure functions of `r`, so
/// nothing here changes which points the clip produces — only how many Int
/// operations decide the signs along the way. Building them once per vertex
/// replaces the three homogenizations `orient2d_r` did on *every* call.
#[derive(Clone)]
struct ClipPt {
    r: R2,
    a: [f64; 2],
    /// Homogenized lazily: coplanar overlaps are degeneracy-rich, so the f64
    /// filter fails often enough to be worth caching, but plenty of vertices
    /// never need the exact form at all.
    h: std::cell::OnceCell<Homog2>,
}

impl ClipPt {
    fn new(r: R2) -> Self {
        let a = [rat_to_f64(&r.x), rat_to_f64(&r.y)];
        ClipPt {
            r,
            a,
            h: std::cell::OnceCell::new(),
        }
    }

    fn h(&self) -> &Homog2 {
        self.h.get_or_init(|| homog2_of(&self.r))
    }
}

/// Filtered orient2d over clip vertices: certified f64 sign when the
/// semi-static bound allows, exact homogeneous sign otherwise. Identical
/// result to `orient2d_r` by construction.
#[inline]
fn o2p(a: &ClipPt, b: &ClipPt, c: &ClipPt) -> Sign {
    orient2d_a(a.a, b.a, c.a).unwrap_or_else(|| orient2d_h(a.h(), b.h(), c.h()))
}

/// Field-wise equality of two canonical projected points — same answer as
/// `R2: PartialEq` (see the canonicality argument in exact/rational.rs)
/// without the backend's general (unreduced-tolerant) comparison.
#[inline]
fn clip_pt_eq(a: &ClipPt, b: &ClipPt) -> bool {
    r2_eq(&a.r, &b.r)
}

/// The exact part of [`coplanar_overlap`]: Sutherland–Hodgman clip in the
/// rational 2D projection, once the f64 pre-reject has failed.
fn coplanar_clip(t1: [Vec3; 3], t2: [Vec3; 3]) -> TriTriIsect {
    let r1: [R3; 3] = [
        R3::from_vec3(t1[0]),
        R3::from_vec3(t1[1]),
        R3::from_vec3(t1[2]),
    ];
    let r2: [R3; 3] = [
        R3::from_vec3(t2[0]),
        R3::from_vec3(t2[1]),
        R3::from_vec3(t2[2]),
    ];
    let n1 = tri_normal_r(&r1[0], &r1[1], &r1[2]);
    debug_assert!(!n1.is_zero(), "degenerate input triangle");

    let axis = dominant_axis(&n1);
    let mut clip: Vec<ClipPt> = r1
        .iter()
        .map(|p| ClipPt::new(p.project_drop(axis)))
        .collect();
    // Normalize the clip triangle to CCW in projection space.
    if o2p(&clip[0], &clip[1], &clip[2]) == Sign::Neg {
        clip.swap(1, 2);
    }
    let mut subject: Vec<ClipPt> = r2
        .iter()
        .map(|p| ClipPt::new(p.project_drop(axis)))
        .collect();
    if o2p(&subject[0], &subject[1], &subject[2]) == Sign::Neg {
        subject.swap(1, 2);
    }

    // Clip `subject` against each closed halfplane left of the CCW clip edges.
    let mut poly = subject;
    for i in 0..3 {
        if poly.is_empty() {
            break;
        }
        let (c0, c1) = (&clip[i], &clip[(i + 1) % 3]);
        let mut out: Vec<ClipPt> = Vec::with_capacity(poly.len() + 2);
        // Each vertex's side is needed twice (as `e` then as `s`); computing
        // it once per vertex halves the sign tests.
        let sides: Vec<bool> = poly.iter().map(|p| o2p(c0, c1, p) != Sign::Neg).collect();
        for k in 0..poly.len() {
            let kn = (k + 1) % poly.len();
            let (s, e) = (&poly[k], &poly[kn]);
            match (sides[k], sides[kn]) {
                // Pass-through vertices are cloned, not rebuilt: the cached
                // approximation (and homogenization, if already forced) is
                // valid for the identical point.
                (true, true) => out.push(e.clone()),
                (true, false) => {
                    let x = line_line_intersect_2d(&c0.r, &c1.r, &s.r, &e.r)
                        .expect("strictly crossing edge is not parallel to clip line");
                    out.push(ClipPt::new(x));
                }
                (false, true) => {
                    let x = line_line_intersect_2d(&c0.r, &c1.r, &s.r, &e.r)
                        .expect("strictly crossing edge is not parallel to clip line");
                    out.push(ClipPt::new(x));
                    out.push(e.clone());
                }
                (false, false) => {}
            }
        }
        poly = out;
    }

    // Canonicalize: drop consecutive duplicates (exact equality) and
    // collinear intermediate vertices.
    let poly = canonical_polygon(poly);
    match poly.len() {
        0 => TriTriIsect::None,
        1 => TriTriIsect::Point(lift_to_plane(&poly[0].r, axis, &r1[0], &n1)),
        2 => TriTriIsect::Segment(
            lift_to_plane(&poly[0].r, axis, &r1[0], &n1),
            lift_to_plane(&poly[1].r, axis, &r1[0], &n1),
        ),
        // `same_orientation` costs a rational cross product and a dot, and
        // only the polygon case consumes it — so it is computed here rather
        // than up front, where the (far more common) empty/point/segment
        // exits would pay for it too.
        _ => {
            let n2 = tri_normal_r(&r2[0], &r2[1], &r2[2]);
            debug_assert!(!n2.is_zero(), "degenerate input triangle");
            let same_orientation = match Sign::of_rat(&n1.dot(&n2)) {
                Sign::Pos => true,
                Sign::Neg => false,
                Sign::Zero => unreachable!("coplanar triangles have parallel normals"),
            };
            TriTriIsect::Coplanar {
                polygon: poly
                    .iter()
                    .map(|p| lift_to_plane(&p.r, axis, &r1[0], &n1))
                    .collect(),
                same_orientation,
            }
        }
    }
}

/// Remove exact duplicates and collinear intermediate vertices from a closed
/// polygon; a fully collinear result collapses to its two extreme points, a
/// single repeated point to one point.
fn canonical_polygon(poly: Vec<ClipPt>) -> Vec<ClipPt> {
    // Dedup (cyclic).
    let mut pts: Vec<ClipPt> = Vec::with_capacity(poly.len());
    for p in poly {
        if pts.last().map_or(true, |last| !clip_pt_eq(last, &p)) {
            pts.push(p);
        }
    }
    while pts.len() > 1 && clip_pt_eq(&pts[0], &pts[pts.len() - 1]) {
        pts.pop();
    }
    if pts.len() <= 2 {
        return pts;
    }
    // Fully collinear (possible when the overlap is a shared edge segment
    // that SH clipping walked over several vertices): keep the two extremes.
    let all_collinear = (0..pts.len()).all(|i| {
        let a = &pts[i];
        let b = &pts[(i + 1) % pts.len()];
        let c = &pts[(i + 2) % pts.len()];
        o2p(a, b, c) == Sign::Zero
    });
    if all_collinear {
        // Order along the dominant direction of the point spread. Rare exit
        // (a degenerate, zero-area overlap), so it stays fully rational.
        let dir = pts
            .iter()
            .skip(1)
            .map(|p| p.r.sub(&pts[0].r))
            .find(|d| !d.is_zero())
            .expect("at least two distinct points");
        let param = |p: &R2| p.sub(&pts[0].r).dot(&dir);
        let (mut lo, mut hi) = (0usize, 0usize);
        let (mut lo_t, mut hi_t) = (rat_zero(), rat_zero());
        for (i, p) in pts.iter().enumerate() {
            let t = param(&p.r);
            if t < lo_t {
                lo_t = t.clone();
                lo = i;
            }
            if t > hi_t {
                hi_t = t;
                hi = i;
            }
        }
        if clip_pt_eq(&pts[lo], &pts[hi]) {
            return vec![pts[lo].clone()];
        }
        return vec![pts[lo].clone(), pts[hi].clone()];
    }
    // Drop collinear intermediate vertices.
    let n = pts.len();
    let keep: Vec<ClipPt> = (0..n)
        .filter(|&i| {
            let prev = &pts[(i + n - 1) % n];
            let next = &pts[(i + 1) % n];
            o2p(prev, &pts[i], next) != Sign::Zero
        })
        .map(|i| pts[i].clone())
        .collect();
    keep
}

#[cfg(test)]
#[path = "tri_tri_tests.rs"]
mod tests;
