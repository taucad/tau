// robust/exact/predicates.rs — Fully exact predicates and geometric
// constructions on rational points. Ground truth for the robust boolean
// engine: robust/exact/filtered.rs escalates here whenever its float
// filters cannot certify a sign, and the intersection code builds all new
// vertices through the constructions at the bottom of this file.
//
// Orientation conventions (documented once, used everywhere in src/robust):
//   orient2d(a,b,c)   = sign of cross(b-a, c-a); Pos = a,b,c counterclockwise.
//   orient3d(a,b,c,d) = sign of dot(cross(b-a, c-a), d-a); Pos = d on the
//                       side of plane(a,b,c) that its CCW normal points to.
//   incircle(a,b,c,d) with a,b,c CCW: Pos = d strictly inside the circle
//                       through a,b,c. (For CW a,b,c the sign flips.)

use super::backend::{
    denom, int_from_uint, mul_int_uint, mul_uint, numer, rat_is_zero, rat_new, Int, Rational,
    Signed,
};

use super::rational::{R2, R3};
use super::Sign;

// ─── Exact predicates ────────────────────────────────────────────────────────
//
// Predicate signs are computed in pure Int arithmetic: each point is
// homogenized once ((x, y) = (X/W, Y/W) with W > 0 — the backend keeps
// denominators positive), and the determinant is scaled through by positive
// denominator products, which preserves its sign. This avoids Rational's
// gcd normalization on every intermediate operation — the dominant cost of
// the original rational formulation (the CDT's incircle calls on constructed
// intersection points made it ~80% of robust-boolean wall time).

/// (X, Y, W): x = X/W, y = Y/W with W > 0.
#[inline]
fn homog2(p: &R2) -> (Int, Int, Int) {
    let (xn, xd) = (numer(&p.x), denom(&p.x));
    let (yn, yd) = (numer(&p.y), denom(&p.y));
    (
        mul_int_uint(xn, yd),
        mul_int_uint(yn, xd),
        int_from_uint(mul_uint(xd, yd)),
    )
}

/// (X, Y, Z, W): coordinates over one positive common denominator.
#[inline]
fn homog3(p: &R3) -> (Int, Int, Int, Int) {
    let (xn, xd) = (numer(&p.x), denom(&p.x));
    let (yn, yd) = (numer(&p.y), denom(&p.y));
    let (zn, zd) = (numer(&p.z), denom(&p.z));
    let yz = mul_uint(yd, zd);
    (
        mul_int_uint(xn, &yz),
        mul_int_uint(yn, &mul_uint(xd, zd)),
        mul_int_uint(zn, &mul_uint(xd, yd)),
        int_from_uint(mul_uint(xd, &yz)),
    )
}

/// Cached homogenization of a 2D point: (X, Y, W), x = X/W, W > 0. Hot
/// loops that test one point against many (the arrangement's segment sweep)
/// homogenize each point once and reuse it across every predicate call.
#[derive(Clone, Debug)]
pub struct Homog2(pub Int, pub Int, pub Int);

pub fn homog2_of(p: &R2) -> Homog2 {
    let (x, y, w) = homog2(p);
    Homog2(x, y, w)
}

/// `orient2d_r` over pre-homogenized points — identical sign, no repeated
/// denominator work.
pub fn orient2d_h(a: &Homog2, b: &Homog2, c: &Homog2) -> Sign {
    let ux = &b.0 * &a.2 - &a.0 * &b.2;
    let uy = &b.1 * &a.2 - &a.1 * &b.2;
    let vx = &c.0 * &a.2 - &a.0 * &c.2;
    let vy = &c.1 * &a.2 - &a.1 * &c.2;
    sign_of_int(&(ux * vy - uy * vx))
}

/// `incircle_r` over pre-homogenized points — identical sign (same row
/// scaling argument), computed without re-clearing any denominators.
pub fn incircle_h(a: &Homog2, b: &Homog2, c: &Homog2, d: &Homog2) -> Sign {
    let row = |p: &Homog2| -> (Int, Int, Int) {
        let nx = &p.0 * &d.2 - &d.0 * &p.2;
        let ny = &p.1 * &d.2 - &d.1 * &p.2;
        let s = &p.2 * &d.2;
        let lift = &nx * &nx + &ny * &ny;
        (nx * &s, ny * &s, lift)
    };
    let (ux, uy, ul) = row(a);
    let (vx, vy, vl) = row(b);
    let (wx, wy, wl) = row(c);
    let det = ul * (&vx * &wy - &vy * &wx)
        + vl * (&wx * &uy - &wy * &ux)
        + wl * (&ux * &vy - &uy * &vx);
    sign_of_int(&det)
}

/// `point_in_tri_2d` over pre-homogenized points.
pub fn point_in_tri_2d_h(p: &Homog2, a: &Homog2, b: &Homog2, c: &Homog2) -> TriLoc {
    let orient = orient2d_h(a, b, c);
    if orient == Sign::Zero {
        return TriLoc::Outside;
    }
    let normalize = |s: Sign| if orient == Sign::Pos { s } else { s.flip() };
    let s0 = normalize(orient2d_h(a, b, p));
    let s1 = normalize(orient2d_h(b, c, p));
    let s2 = normalize(orient2d_h(c, a, p));
    if s0 == Sign::Neg || s1 == Sign::Neg || s2 == Sign::Neg {
        return TriLoc::Outside;
    }
    match (s0 == Sign::Zero, s1 == Sign::Zero, s2 == Sign::Zero) {
        (false, false, false) => TriLoc::Inside,
        (true, false, false) => TriLoc::OnEdge(0),
        (false, true, false) => TriLoc::OnEdge(1),
        (false, false, true) => TriLoc::OnEdge(2),
        (true, false, true) => TriLoc::OnVertex(0),
        (true, true, false) => TriLoc::OnVertex(1),
        (false, true, true) => TriLoc::OnVertex(2),
        (true, true, true) => TriLoc::Outside,
    }
}

#[inline]
fn sign_of_int(v: &Int) -> Sign {
    if v.is_positive() {
        Sign::Pos
    } else if v.is_negative() {
        Sign::Neg
    } else {
        Sign::Zero
    }
}

/// Sign of cross(b-a, c-a). Pos ⇔ a,b,c wind counterclockwise.
pub fn orient2d_r(a: &R2, b: &R2, c: &R2) -> Sign {
    let (ax, ay, aw) = homog2(a);
    let (bx, by, bw) = homog2(b);
    let (cx, cy, cw) = homog2(c);
    // det(b-a, c-a) · Wa²WbWc = (BxWa−AxWb)(CyWa−AyWc) − (ByWa−AyWb)(CxWa−AxWc)
    let ux = &bx * &aw - &ax * &bw;
    let uy = &by * &aw - &ay * &bw;
    let vx = &cx * &aw - &ax * &cw;
    let vy = &cy * &aw - &ay * &cw;
    sign_of_int(&(ux * vy - uy * vx))
}

/// Sign of dot(cross(b-a, c-a), d-a). Pos ⇔ d lies on the CCW-normal side
/// of the plane through a, b, c; Zero ⇔ the four points are coplanar.
pub fn orient3d_r(a: &R3, b: &R3, c: &R3, d: &R3) -> Sign {
    let (ax, ay, az, aw) = homog3(a);
    let (bx, by, bz, bw) = homog3(b);
    let (cx, cy, cz, cw) = homog3(c);
    let (dx, dy, dz, dw) = homog3(d);
    // Each difference row is scaled by the positive factor Wa·W_row; the
    // triple product then carries a positive overall scale.
    let ux = &bx * &aw - &ax * &bw;
    let uy = &by * &aw - &ay * &bw;
    let uz = &bz * &aw - &az * &bw;
    let vx = &cx * &aw - &ax * &cw;
    let vy = &cy * &aw - &ay * &cw;
    let vz = &cz * &aw - &az * &cw;
    let wx = &dx * &aw - &ax * &dw;
    let wy = &dy * &aw - &ay * &dw;
    let wz = &dz * &aw - &az * &dw;
    let det = (&uy * &vz - &uz * &vy) * wx
        + (&uz * &vx - &ux * &vz) * wy
        + (&ux * &vy - &uy * &vx) * wz;
    sign_of_int(&det)
}

/// Incircle test. With a,b,c counterclockwise: Pos ⇔ d strictly inside the
/// circumcircle of (a,b,c). Computed as the standard 3×3 determinant of
/// coordinates lifted onto the paraboloid, with rows differenced against d.
pub fn incircle_r(a: &R2, b: &R2, c: &R2, d: &R2) -> Sign {
    let (dx, dy, dw) = homog2(d);
    // Row i (i = a,b,c): (xi−xd, yi−yd) over the positive denominator WiWd.
    // Scaling row i by (WiWd)² keeps the lift column polynomial:
    //   Ui = (XiWd−XdWi)·WiWd,  Vi = (YiWd−YdWi)·WiWd,
    //   Li = (XiWd−XdWi)² + (YiWd−YdWi)².
    let row = |p: &R2| -> (Int, Int, Int) {
        let (px, py, pw) = homog2(p);
        let nx = &px * &dw - &dx * &pw;
        let ny = &py * &dw - &dy * &pw;
        let s = pw * &dw;
        let lift = &nx * &nx + &ny * &ny;
        (nx * &s, ny * &s, lift)
    };
    let (ux, uy, ul) = row(a);
    let (vx, vy, vl) = row(b);
    let (wx, wy, wl) = row(c);
    let det = ul * (&vx * &wy - &vy * &wx)
        + vl * (&wx * &uy - &wy * &ux)
        + wl * (&ux * &vy - &uy * &vx);
    sign_of_int(&det)
}

/// Exact: p collinear with (a,b) and within the closed segment [a,b].
/// Same integer-only strategy as the sign predicates above — the registry
/// sweeps in robust/intersection_graph.rs call this in a tight loop.
pub fn point_on_segment_r(p: &R3, a: &R3, b: &R3) -> bool {
    let (px, py, pz, pw) = homog3(p);
    let (ax, ay, az, aw) = homog3(a);
    let (bx, by, bz, bw) = homog3(b);
    // ap scaled by the positive PwAw; d = b−a scaled by the positive AwBw.
    let apx = &px * &aw - &ax * &pw;
    let apy = &py * &aw - &ay * &pw;
    let apz = &pz * &aw - &az * &pw;
    let dx = &bx * &aw - &ax * &bw;
    let dy = &by * &aw - &ay * &bw;
    let dz = &bz * &aw - &az * &bw;
    // Collinearity: cross(ap, d) = 0 (positive scales cannot zero a component).
    if !(&apy * &dz - &apz * &dy).is_zero()
        || !(&apz * &dx - &apx * &dz).is_zero()
        || !(&apx * &dy - &apy * &dx).is_zero()
    {
        return false;
    }
    // 0 ≤ ap·d and ap·d ≤ d·d, cleared of their (positive) denominators:
    //   ap·d = S1 / (PwAw·AwBw),  d·d = S2 / (AwBw)²
    //   S1 ≥ 0   and   S1·AwBw ≤ S2·PwAw.
    let s1 = &apx * &dx + &apy * &dy + &apz * &dz;
    if s1.is_negative() {
        return false;
    }
    let s2 = &dx * &dx + &dy * &dy + &dz * &dz;
    s1 * (&aw * &bw) <= s2 * (pw * aw)
}

/// (a−o)·u as an unreduced fraction (numerator, positive denominator) —
/// integer-only, no gcd normalization. For sign tests and cross-multiplied
/// comparisons (e.g. the radial ring sort in robust/classify.rs) the
/// unreduced form is exactly as good as the canonical one and much cheaper
/// to produce.
pub fn dot_diff_raw(a: &R3, o: &R3, u: &R3) -> (Int, Int) {
    let (ax, ay, az, aw) = homog3(a);
    let (ox, oy, oz, ow) = homog3(o);
    let (ux, uy, uz, uw) = homog3(u);
    // (a−o) scaled by the positive AwOw; dot with u adds a Uw denominator.
    let num = (&ax * &ow - &ox * &aw) * ux
        + (&ay * &ow - &oy * &aw) * uy
        + (&az * &ow - &oz * &aw) * uz;
    (num, aw * ow * uw)
}

/// Triangle normal as a denominator-cleared integer vector: cross(b−a, c−a)
/// scaled by the positive Aw²BwCw. Direction (and zero-ness) match
/// `tri_normal_r`; use where only the normal's direction matters.
pub fn tri_normal_int(a: &R3, b: &R3, c: &R3) -> [Int; 3] {
    let (ax, ay, az, aw) = homog3(a);
    let (bx, by, bz, bw) = homog3(b);
    let (cx, cy, cz, cw) = homog3(c);
    let ux = &bx * &aw - &ax * &bw;
    let uy = &by * &aw - &ay * &bw;
    let uz = &bz * &aw - &az * &bw;
    let vx = &cx * &aw - &ax * &cw;
    let vy = &cy * &aw - &ay * &cw;
    let vz = &cz * &aw - &az * &cw;
    [
        &uy * &vz - &uz * &vy,
        &uz * &vx - &ux * &vz,
        &ux * &vy - &uy * &vx,
    ]
}

/// d·p as an unreduced fraction (numerator, positive denominator), for an
/// integer direction `d` and rational point `p`. Comparable across points by
/// cross-multiplication — the segment-interval overlap in robust/tri_tri.rs
/// orders plane-crossing points along the intersection line with this.
pub fn dot_point_raw(d: &[Int; 3], p: &R3) -> (Int, Int) {
    let (px, py, pz, pw) = homog3(p);
    (&d[0] * &px + &d[1] * &py + &d[2] * &pz, pw)
}

/// Unnormalized CCW normal of triangle (a,b,c): cross(b-a, c-a). Zero vector
/// ⇔ the triangle is degenerate.
pub fn tri_normal_r(a: &R3, b: &R3, c: &R3) -> R3 {
    b.sub(a).cross(&c.sub(a))
}

/// Where a point lies relative to a non-degenerate triangle, in 2D.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TriLoc {
    Inside,
    /// On the open edge i, where edge i runs from vertex i to vertex i+1 (mod 3).
    OnEdge(u8),
    /// Coincident with vertex i.
    OnVertex(u8),
    Outside,
}

/// Locate point p relative to triangle (a,b,c). Works for either winding;
/// a degenerate (zero-area) triangle reports every point as Outside, which
/// is consistent with the pipeline dropping degenerate triangles up front.
pub fn point_in_tri_2d(p: &R2, a: &R2, b: &R2, c: &R2) -> TriLoc {
    let orient = orient2d_r(a, b, c);
    if orient == Sign::Zero {
        return TriLoc::Outside;
    }
    // Normalize so the triangle reads as CCW.
    let normalize = |s: Sign| if orient == Sign::Pos { s } else { s.flip() };
    let s0 = normalize(orient2d_r(a, b, p)); // edge 0: a→b
    let s1 = normalize(orient2d_r(b, c, p)); // edge 1: b→c
    let s2 = normalize(orient2d_r(c, a, p)); // edge 2: c→a
    if s0 == Sign::Neg || s1 == Sign::Neg || s2 == Sign::Neg {
        return TriLoc::Outside;
    }
    match (s0 == Sign::Zero, s1 == Sign::Zero, s2 == Sign::Zero) {
        (false, false, false) => TriLoc::Inside,
        (true, false, false) => TriLoc::OnEdge(0),
        (false, true, false) => TriLoc::OnEdge(1),
        (false, false, true) => TriLoc::OnEdge(2),
        (true, false, true) => TriLoc::OnVertex(0),  // a: on edges c→a and a→b
        (true, true, false) => TriLoc::OnVertex(1),  // b
        (false, true, true) => TriLoc::OnVertex(2),  // c
        (true, true, true) => TriLoc::Outside,       // impossible for orient != 0
    }
}

// ─── Exact constructions ─────────────────────────────────────────────────────

/// Intersection of the line through p,q with the plane of triangle (a,b,c).
///
/// Returns None when the segment direction is parallel to the plane (no
/// unique intersection point — the coplanar-overlap machinery handles that
/// case separately). The caller decides whether the parameter t lies inside
/// [0,1]; use the orient3d signs of p and q for that, not float comparisons.
pub fn line_plane_intersect(p: &R3, q: &R3, a: &R3, b: &R3, c: &R3) -> Option<R3> {
    // Integer-only formulation (same exact point as the rational one): the
    // plane normal enters both numerator and denominator of t, so any
    // positive common scale on it cancels — compute it as an integer cross
    // of denominator-cleared edge vectors and never normalize intermediates.
    // Each output coordinate reduces exactly once in rat_new.
    let (px, py, pz, pw) = homog3(p);
    let (qx, qy, qz, qw) = homog3(q);
    let (ax, ay, az, aw) = homog3(a);
    let (bx, by, bz, bw) = homog3(b);
    let (cx, cy, cz, cw) = homog3(c);

    // (b−a)·AwBw and (c−a)·AwCw; their cross is the normal up to Aw²BwCw > 0.
    let ux = &bx * &aw - &ax * &bw;
    let uy = &by * &aw - &ay * &bw;
    let uz = &bz * &aw - &az * &bw;
    let vx = &cx * &aw - &ax * &cw;
    let vy = &cy * &aw - &ay * &cw;
    let vz = &cz * &aw - &az * &cw;
    let nx = &uy * &vz - &uz * &vy;
    let ny = &uz * &vx - &ux * &vz;
    let nz = &ux * &vy - &uy * &vx;

    // dir = q−p scaled by PwQw; e = a−p scaled by PwAw.
    let dx = &qx * &pw - &px * &qw;
    let dy = &qy * &pw - &py * &qw;
    let dz = &qz * &pw - &pz * &qw;
    let n_dot_d = &nx * &dx + &ny * &dy + &nz * &dz;
    if n_dot_d.is_zero() {
        return None;
    }
    let ex = &ax * &pw - &px * &aw;
    let ey = &ay * &pw - &py * &aw;
    let ez = &az * &pw - &pz * &aw;
    let n_dot_e = &nx * &ex + &ny * &ey + &nz * &ez;

    // t = (n·e)·Qw / (Aw·(n·d));  x_i = (P_i·Qw·T_d + D_i·T_n) / (Pw·Qw·T_d)
    let t_n = &n_dot_e * &qw;
    let t_d = &aw * &n_dot_d;
    let den = &pw * &qw * &t_d;
    let coord = |pi: &Int, di: &Int| -> Rational {
        rat_new(pi * &qw * &t_d + di * &t_n, den.clone())
    };
    Some(R3::new(coord(&px, &dx), coord(&py, &dy), coord(&pz, &dz)))
}

/// Intersection point of the 2D lines through (a,b) and (c,d). None when the
/// lines are parallel (including collinear — overlap is handled by the
/// caller's collinear branch).
pub fn line_line_intersect_2d(a: &R2, b: &R2, c: &R2, d: &R2) -> Option<R2> {
    // Integer-only (same exact point as the rational formulation): with
    // homogenized points, x = a + t·(b−a) where
    //   t = N·Bw / (Dn·Cw),
    //   N  = cross(c−a, d−c)·AwCw·CwDw,   Dn = cross(b−a, d−c)·AwBw·CwDw,
    // and each output coordinate reduces exactly once in rat_new.
    let (ax, ay, aw) = homog2(a);
    let (bx, by, bw) = homog2(b);
    let (cx, cy, cw) = homog2(c);
    let (dx, dy, dw) = homog2(d);

    let abx = &bx * &aw - &ax * &bw;
    let aby = &by * &aw - &ay * &bw;
    let cdx = &dx * &cw - &cx * &dw;
    let cdy = &dy * &cw - &cy * &dw;
    let dn = &abx * &cdy - &aby * &cdx;
    if dn.is_zero() {
        return None;
    }
    let cax = &cx * &aw - &ax * &cw;
    let cay = &cy * &aw - &ay * &cw;
    let n = &cax * &cdy - &cay * &cdx;

    // x_i = (A_i·Dn·Cw + N·ab_i) / (Aw·Cw·Dn)
    let den = &aw * &cw * &dn;
    let dn_cw = &dn * &cw;
    let x = rat_new(&ax * &dn_cw + &n * &abx, den.clone());
    let y = rat_new(&ay * &dn_cw + &n * &aby, den);
    Some(R2::new(x, y))
}

/// Inverse of `R3::project_drop`: rebuild the dropped coordinate from the
/// plane through `a` with (unnormalized, rational) normal `n`, whose `axis`
/// component must be nonzero. Integer-only: the reconstructed coordinate is
/// one `rat_new` (a single gcd); the carried coordinates are clones
/// of the projection's already-canonical rationals.
pub fn lift_to_plane(p: &R2, axis: usize, a: &R3, n: &R3) -> R3 {
    let (nx, ny, nz, nw) = homog3(n);
    let (ax, ay, az, aw) = homog3(a);
    let (px, py, pw) = homog2(p);
    // S = (n·a)·NwAw; dropped = (n·a − n_i·p_i − n_j·p_j) / n_k
    //   = (S·Pw − Aw·(N_i·P_i + N_j·P_j)) / (Aw·Pw·N_k).
    let s = &nx * &ax + &ny * &ay + &nz * &az;
    let rebuild = |ni: &Int, nj: &Int, nk: &Int| -> Rational {
        rat_new(
            &s * &pw - &aw * (ni * &px + nj * &py),
            &aw * &pw * nk,
        )
    };
    let _ = nw; // cancels: both S and the subtracted terms carry 1/Nw
    match axis {
        0 => {
            let x = rebuild(&ny, &nz, &nx);
            R3::new(x, p.x.clone(), p.y.clone())
        }
        1 => {
            let y = rebuild(&nz, &nx, &ny);
            R3::new(p.y.clone(), y, p.x.clone())
        }
        2 => {
            let z = rebuild(&nx, &ny, &nz);
            R3::new(p.x.clone(), p.y.clone(), z)
        }
        _ => unreachable!("axis must be 0, 1, or 2"),
    }
}

/// Parameter of point x on segment (p,q) along the dominant axis of the
/// segment direction — exact, in [0,1] iff x lies within the segment. The
/// caller guarantees x is on the line through p and q and p != q.
pub fn segment_param(p: &R3, q: &R3, x: &R3) -> Rational {
    let d = q.sub(p);
    let (num, den) = if !rat_is_zero(&d.x) {
        (&x.x - &p.x, d.x)
    } else if !rat_is_zero(&d.y) {
        (&x.y - &p.y, d.y)
    } else {
        (&x.z - &p.z, d.z)
    };
    debug_assert!(!rat_is_zero(&den), "segment_param requires p != q");
    num / den
}
