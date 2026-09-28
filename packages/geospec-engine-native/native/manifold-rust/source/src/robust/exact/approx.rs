// robust/exact/approx.rs — Semi-static float filters over approximate
// coordinates of exact points ("indirect predicates" in the sense of
// Attene 2020, the engine room of interactive exact mesh booleans).
//
// Every point the robust pipeline touches is either an input point (exact
// f64) or a constructed rational whose f64 approximation we obtain by one
// correct rounding (robust/exact/rational.rs::rat_to_f64) — so every
// approximate coordinate x̃ satisfies x̃ = x·(1+δ) with |δ| ≤ ε = 2⁻⁵³.
// A predicate can therefore run entirely in f64 on the approximations and
// certify its sign with a magnitude-based error bound; only near-degenerate
// configurations escalate to the exact Int evaluations in predicates.rs.
//
// The bounds here are deliberately conservative (they cover both the
// float-evaluation roundoff and the input perturbation, with slack): an
// over-tight constant would be a soundness bug, an over-loose one only costs
// extra escalations exactly where the exact path was needed anyway. Unlike
// the classic Shewchuk filters in filtered.rs, the "permanents" below use
// coordinate magnitudes rather than formed differences — input perturbation
// error scales with |a|+|c|, not |a−c|, under cancellation.

use super::Sign;

const EPS: f64 = f64::EPSILON * 0.5; // 2⁻⁵³

/// Conservative certified-sign helper: `det` was computed in f64 from
/// ε-perturbed inputs; `bound` ≥ the true error. Returns None when the sign
/// cannot be certified (including any non-finite intermediate).
#[inline]
fn certify(det: f64, bound: f64) -> Option<Sign> {
    if !det.is_finite() || !bound.is_finite() {
        return None;
    }
    if det > bound {
        Some(Sign::Pos)
    } else if det < -bound {
        Some(Sign::Neg)
    } else {
        None
    }
}

/// Filtered orient2d over approximate coordinates: sign of
/// cross(b−a, c−a), or None when uncertain.
///
/// Error analysis (conservative): with per-coordinate relative error ≤ ε and
/// ≤ 3 roundings per product term after differencing, the total error is
/// < 8ε·P where P = (|ax|+|bx|+|cx|)·(|ay|+|by|+|cy|) bounds every term's
/// magnitude sum. We use 16ε·P for slack.
#[inline]
pub fn orient2d_a(a: [f64; 2], b: [f64; 2], c: [f64; 2]) -> Option<Sign> {
    let det = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    let px = a[0].abs() + b[0].abs() + c[0].abs();
    let py = a[1].abs() + b[1].abs() + c[1].abs();
    certify(det, 16.0 * EPS * px * py)
}

/// Filtered incircle over approximate coordinates (a,b,c CCW ⇒ Pos = d
/// strictly inside), or None when uncertain. Conservative bound 64ε·P with P
/// the product of per-axis magnitude sums times the lift magnitude sum.
#[inline]
pub fn incircle_a(a: [f64; 2], b: [f64; 2], c: [f64; 2], d: [f64; 2]) -> Option<Sign> {
    let adx = a[0] - d[0];
    let ady = a[1] - d[1];
    let bdx = b[0] - d[0];
    let bdy = b[1] - d[1];
    let cdx = c[0] - d[0];
    let cdy = c[1] - d[1];
    let alift = adx * adx + ady * ady;
    let blift = bdx * bdx + bdy * bdy;
    let clift = cdx * cdx + cdy * cdy;
    let det = alift * (bdx * cdy - cdx * bdy)
        + blift * (cdx * ady - adx * cdy)
        + clift * (adx * bdy - bdx * ady);

    // Magnitude-based permanent: differences bounded by |p|+|d| sums.
    let mx = a[0].abs().max(b[0].abs()).max(c[0].abs()) + d[0].abs();
    let my = a[1].abs().max(b[1].abs()).max(c[1].abs()) + d[1].abs();
    let lift = mx * mx + my * my;
    certify(det, 64.0 * EPS * lift * mx * my)
}

// ─── Tight filters for EXACTLY representable inputs ─────────────────────────
//
// The filters above must cover input perturbation: an approximate coordinate
// x̃ = x(1+δ) carries an error proportional to |x|, so a determinant of points
// clustered far from the origin is swamped by a bound built from absolute
// coordinate magnitudes — every such call escalates even though the float
// arithmetic itself is nearly exact. When all inputs are exactly representable
// f64 (mesh vertices, and constructed rationals whose rounding happened to be
// exact) there is NO input error, so the only error is the arithmetic
// roundoff of the predicate's own evaluation, and a Shewchuk-style permanent
// built from the COMPUTED differences is sound and vastly tighter: for points
// clustered within h of each other at distance M from the origin, the incircle
// bound shrinks from O(M⁴) to O(h⁴).
//
// These may only be called when the exact value of every input coordinate
// equals the f64 passed in. They are otherwise unsound.

/// Filtered orient2d for EXACTLY representable f64 inputs.
///
/// Error derivation. Write L = fl(fl(ax−cx)·fl(by−cy)) and
/// R = fl(fl(ay−cy)·fl(bx−cx)); det = fl(L−R). Inputs are exact, so each
/// difference is the exact difference times (1+e), |e| ≤ ε, and each product
/// adds one more rounding: L = L*(1+e)³ with L* the exact product, likewise R.
/// Hence |L−L*| ≤ γ₃|L| and |R−R*| ≤ γ₃|R| with γ₃ = 3ε/(1−3ε). The final
/// subtraction contributes ε|L−R|. Since |L*−R*| is what we want the sign of,
/// |det − (L*−R*)| ≤ (γ₃(|L|+|R|))(1+ε) + ε(|L|+|R|) < 4.1ε·(|L|+|R|)
/// for ε = 2⁻⁵³. We use 8ε for slack (this also absorbs the rounding of the
/// permanent's own additions).
#[inline]
pub fn orient2d_a_exact(a: [f64; 2], b: [f64; 2], c: [f64; 2]) -> Option<Sign> {
    let left = (a[0] - c[0]) * (b[1] - c[1]);
    let right = (a[1] - c[1]) * (b[0] - c[0]);
    let det = left - right;
    let permanent = left.abs() + right.abs();
    certify(det, 8.0 * EPS * permanent)
}

/// Filtered incircle for EXACTLY representable f64 inputs (a,b,c CCW ⇒
/// Pos = d strictly inside), or None when uncertain.
///
/// Error derivation. All six differences adx…cdy are exact differences times
/// (1+e), |e| ≤ ε. Then:
///   * each cross product (e.g. bdx·cdy) is its exact counterpart times
///     (1+e)³, i.e. relative error ≤ γ₃ ≈ 3ε;
///   * each lift alift = fl(fl(adx²)+fl(ady²)) sums two NON-NEGATIVE terms of
///     relative error ≤ γ₃ each, so its relative error is ≤ γ₄ ≈ 4ε (no
///     cancellation);
///   * each 2×2 minor fl(P₁−P₂) has ABSOLUTE error ≤ γ₄·(|P₁|+|P₂|) — the
///     γ₃ relative errors of the two products plus the subtraction's own ε,
///     all measured against S = |P₁|+|P₂| ≥ |P₁−P₂|;
///   * the term fl(alift·minor) then deviates from the exact
///     alift*·minor* by at most alift·(γ₄|minor| + γ₄S) + ε|alift·minor|
///     ≤ (2γ₄ + ε + O(ε²))·alift·S < 9.1ε·alift·S;
///   * the two final additions add ≤ γ₂ ≈ 2ε times the sum of the three
///     terms' magnitudes, each of which is ≤ alift·S for its own group.
/// Total: |det − det*| < 11.2ε·permanent, permanent = Σ liftᵢ·Sᵢ. We use 16ε,
/// which also covers the (relative-ε) error of the computed permanent itself.
#[inline]
pub fn incircle_a_exact(a: [f64; 2], b: [f64; 2], c: [f64; 2], d: [f64; 2]) -> Option<Sign> {
    let adx = a[0] - d[0];
    let ady = a[1] - d[1];
    let bdx = b[0] - d[0];
    let bdy = b[1] - d[1];
    let cdx = c[0] - d[0];
    let cdy = c[1] - d[1];

    let bdxcdy = bdx * cdy;
    let cdxbdy = cdx * bdy;
    let cdxady = cdx * ady;
    let adxcdy = adx * cdy;
    let adxbdy = adx * bdy;
    let bdxady = bdx * ady;

    let alift = adx * adx + ady * ady;
    let blift = bdx * bdx + bdy * bdy;
    let clift = cdx * cdx + cdy * cdy;

    let det = alift * (bdxcdy - cdxbdy) + blift * (cdxady - adxcdy) + clift * (adxbdy - bdxady);
    let permanent = (bdxcdy.abs() + cdxbdy.abs()) * alift
        + (cdxady.abs() + adxcdy.abs()) * blift
        + (adxbdy.abs() + bdxady.abs()) * clift;
    certify(det, 16.0 * EPS * permanent)
}

/// Filtered orient3d over approximate coordinates: sign of
/// dot(cross(b−a, c−a), d−a), or None when uncertain. Conservative 32ε·P.
#[inline]
pub fn orient3d_a(a: [f64; 3], b: [f64; 3], c: [f64; 3], d: [f64; 3]) -> Option<Sign> {
    let ux = b[0] - a[0];
    let uy = b[1] - a[1];
    let uz = b[2] - a[2];
    let vx = c[0] - a[0];
    let vy = c[1] - a[1];
    let vz = c[2] - a[2];
    let wx = d[0] - a[0];
    let wy = d[1] - a[1];
    let wz = d[2] - a[2];
    let det = (uy * vz - uz * vy) * wx + (uz * vx - ux * vz) * wy + (ux * vy - uy * vx) * wz;
    let px = a[0].abs() + b[0].abs() + c[0].abs() + d[0].abs();
    let py = a[1].abs() + b[1].abs() + c[1].abs() + d[1].abs();
    let pz = a[2].abs() + b[2].abs() + c[2].abs() + d[2].abs();
    // Every det term is a product of one coordinate-difference per axis.
    let p = py * pz * px;
    certify(det, 32.0 * EPS * p)
}

/// Filtered collinear-and-within-segment prefilter for
/// `predicates::point_on_segment_r`: `Some(false)` when p is certifiably NOT
/// on segment [a,b] (the overwhelmingly common case in the registry sweeps),
/// `None` when the exact test must decide. Never returns `Some(true)` — a
/// certified "on" would need exact zero detection.
#[inline]
pub fn not_on_segment_a(p: [f64; 3], a: [f64; 3], b: [f64; 3]) -> Option<bool> {
    let apx = p[0] - a[0];
    let apy = p[1] - a[1];
    let apz = p[2] - a[2];
    let dx = b[0] - a[0];
    let dy = b[1] - a[1];
    let dz = b[2] - a[2];
    // Cross-product components with magnitude-permanent bounds per component.
    let px = p[0].abs() + a[0].abs() + b[0].abs();
    let py = p[1].abs() + a[1].abs() + b[1].abs();
    let pz = p[2].abs() + a[2].abs() + b[2].abs();
    let cx = apy * dz - apz * dy;
    let cy = apz * dx - apx * dz;
    let cz = apx * dy - apy * dx;
    if cx.abs() > 16.0 * EPS * py * pz
        || cy.abs() > 16.0 * EPS * pz * px
        || cz.abs() > 16.0 * EPS * px * py
    {
        return Some(false); // certifiably off the line
    }
    // Certifiably outside the parameter range?
    let s1 = apx * dx + apy * dy + apz * dz;
    let s2 = dx * dx + dy * dy + dz * dz;
    let pd = px * px + py * py + pz * pz; // ≥ every dot magnitude here
    let dot_err = 16.0 * EPS * pd;
    if s1 < -dot_err || s1 > s2 + 2.0 * dot_err {
        return Some(false);
    }
    None
}

/// Certified separating-axis disjointness for two triangles with EXACT f64
/// vertices (mesh input triangles — no input perturbation, only evaluation
/// roundoff). Returns true only when some edge-pair cross axis provably
/// separates the triangles; the face-plane axes are the caller's sign gates.
/// Division-free: every projection is a degree-3 polynomial with a
/// magnitude-permanent error bound (conservative 64ε).
///
/// A `false` says nothing (the triangles may or may not intersect); a `true`
/// certifies empty intersection, letting narrow phases skip all exact work
/// for the both-straddle-but-miss pairs that otherwise pay full rational
/// interval construction.
pub fn sat_edge_axes_disjoint(t1: &[[f64; 3]; 3], t2: &[[f64; 3]; 3]) -> bool {
    #[inline]
    fn sub(a: &[f64; 3], b: &[f64; 3]) -> [f64; 3] {
        [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
    }
    #[inline]
    fn mag_sum(a: &[f64; 3], b: &[f64; 3]) -> [f64; 3] {
        [
            a[0].abs() + b[0].abs(),
            a[1].abs() + b[1].abs(),
            a[2].abs() + b[2].abs(),
        ]
    }
    // Magnitude bound of every vertex coordinate, per axis.
    let mut m = [0.0f64; 3];
    for t in [t1, t2] {
        for v in t {
            for k in 0..3 {
                m[k] = m[k].max(v[k].abs());
            }
        }
    }
    for i in 0..3 {
        let e1 = sub(&t1[(i + 1) % 3], &t1[i]);
        let me1 = mag_sum(&t1[(i + 1) % 3], &t1[i]);
        for j in 0..3 {
            let e2 = sub(&t2[(j + 1) % 3], &t2[j]);
            let me2 = mag_sum(&t2[(j + 1) % 3], &t2[j]);
            let axis = [
                e1[1] * e2[2] - e1[2] * e2[1],
                e1[2] * e2[0] - e1[0] * e2[2],
                e1[0] * e2[1] - e1[1] * e2[0],
            ];
            // Component-wise magnitude bound of the (computed) axis.
            let ma = [
                me1[1] * me2[2] + me1[2] * me2[1],
                me1[2] * me2[0] + me1[0] * me2[2],
                me1[0] * me2[1] + me1[1] * me2[0],
            ];
            // Projection error bound: dot of a degree-2 axis with degree-1
            // coordinates; 64ε·Σ|axis_k|·(2·m_k) is conservative for every
            // rounding along the way.
            let bound = 64.0 * EPS * (ma[0] * (2.0 * m[0]) + ma[1] * (2.0 * m[1]) + ma[2] * (2.0 * m[2]));
            if !bound.is_finite() {
                continue;
            }
            let proj = |t: &[[f64; 3]; 3]| -> (f64, f64) {
                let mut lo = f64::INFINITY;
                let mut hi = f64::NEG_INFINITY;
                for v in t {
                    let p = axis[0] * v[0] + axis[1] * v[1] + axis[2] * v[2];
                    lo = lo.min(p);
                    hi = hi.max(p);
                }
                (lo, hi)
            };
            let (lo1, hi1) = proj(t1);
            let (lo2, hi2) = proj(t2);
            if lo1 > hi2 + bound || lo2 > hi1 + bound {
                return true;
            }
        }
    }
    false
}

#[cfg(test)]
mod tests {
    use super::super::predicates::{incircle_r, orient2d_r, orient3d_r, point_on_segment_r};
    use super::super::rational::{rat_to_f64, R2, R3};
    use super::*;
    use crate::linalg::{Vec2, Vec3};
    use super::super::backend::{rat_from_f64, rat_new, Int};

    struct Lcg(u64);
    impl Lcg {
        fn next_f64(&mut self, scale: f64) -> f64 {
            self.0 = self
                .0
                .wrapping_mul(6364136223846793005)
                .wrapping_add(1442695040888963407);
            ((self.0 >> 11) as f64 / (1u64 << 53) as f64 * 2.0 - 1.0) * scale
        }
    }

    fn approx2(p: &R2) -> [f64; 2] {
        [rat_to_f64(&p.x), rat_to_f64(&p.y)]
    }
    fn approx3(p: &R3) -> [f64; 3] {
        [rat_to_f64(&p.x), rat_to_f64(&p.y), rat_to_f64(&p.z)]
    }

    /// A rational point near (x,y) with a huge denominator — its rounding is
    /// a genuine ε-perturbation, exercising the indirect-point case.
    fn wobble2(x: f64, y: f64, k: i64) -> R2 {
        let tiny = rat_new(k.into(), Int::from(3u8).pow(40));
        R2::new(
            rat_from_f64(x).unwrap() + &tiny,
            rat_from_f64(y).unwrap() - &tiny,
        )
    }

    #[test]
    fn certified_signs_agree_with_exact() {
        let mut rng = Lcg(0xFEEDFACE);
        let mut certified = 0usize;
        for i in 0..4000 {
            let pts: Vec<R2> = (0..4)
                .map(|j| wobble2(rng.next_f64(50.0), rng.next_f64(50.0), (i * 4 + j) as i64))
                .collect();
            let ap: Vec<[f64; 2]> = pts.iter().map(approx2).collect();
            if let Some(s) = orient2d_a(ap[0], ap[1], ap[2]) {
                assert_eq!(s, orient2d_r(&pts[0], &pts[1], &pts[2]), "orient2d #{i}");
                certified += 1;
            }
            if let Some(s) = incircle_a(ap[0], ap[1], ap[2], ap[3]) {
                assert_eq!(
                    s,
                    incircle_r(&pts[0], &pts[1], &pts[2], &pts[3]),
                    "incircle #{i}"
                );
            }
        }
        assert!(
            certified > 3900,
            "filter should certify generic input ({certified}/4000)"
        );
    }

    // ─── Exact-input filters ────────────────────────────────────────────────

    /// Exact f64 → exact rational (the filters' precondition holds by
    /// construction: the point IS its own approximation).
    fn ex2(p: [f64; 2]) -> R2 {
        R2::new(rat_from_f64(p[0]).unwrap(), rat_from_f64(p[1]).unwrap())
    }

    /// Iteration count for the differential sweeps; raise via
    /// `MANIFOLD_FILTER_STRESS=2000000` to run the multi-million-case version.
    fn stress_n(default: usize) -> usize {
        std::env::var("MANIFOLD_FILTER_STRESS")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(default)
    }

    /// A point at `base + k·ulp` on both axes: consecutive f64 values around a
    /// far-from-origin center, so the coordinates are exact by construction
    /// while the differences are as tiny as f64 allows. This is the clustered
    /// arrangement geometry that makes the magnitude-based filter useless.
    fn clustered(base: [f64; 2], ulp: f64, k: [i64; 2]) -> [f64; 2] {
        [base[0] + k[0] as f64 * ulp, base[1] + k[1] as f64 * ulp]
    }

    #[test]
    fn exact_filters_never_miscertify() {
        let mut rng = Lcg(0x5EED_1234);
        // (base, ulp, spread) regimes: origin-local, far-and-clustered
        // (coordinates ~1e6 with spacing at the 2⁻³² ulp ≈ 2.3e-10), and
        // far-and-wide.
        let regimes: [([f64; 2], f64, i64); 4] = [
            ([0.0, 0.0], 1.0, 1 << 20),
            ([1.0e6, -2.0e6], 2f64.powi(-32), 1000),
            ([1.0e6, -2.0e6], 2f64.powi(-32), 4),
            ([12345.0, 6789.0], 2f64.powi(-20), 1 << 16),
        ];
        let n = stress_n(20_000);
        let mut tight_certified = 0usize;
        let mut loose_certified = 0usize;
        for (ri, &(base, ulp, spread)) in regimes.iter().enumerate() {
            for _ in 0..n {
                let mut kk = || (rng.next_f64(1.0) * spread as f64) as i64;
                let p: Vec<[f64; 2]> = (0..4)
                    .map(|_| clustered(base, ulp, [kk(), kk()]))
                    .collect();
                let r: Vec<R2> = p.iter().map(|q| ex2(*q)).collect();
                // Coincident points make the predicates degenerate; skip.
                if (0..4).any(|i| (i + 1..4).any(|j| p[i] == p[j])) {
                    continue;
                }
                let truth = incircle_r(&r[0], &r[1], &r[2], &r[3]);
                if let Some(s) = incircle_a_exact(p[0], p[1], p[2], p[3]) {
                    assert_eq!(s, truth, "incircle_a_exact regime {ri} {p:?}");
                    tight_certified += 1;
                }
                if incircle_a(p[0], p[1], p[2], p[3]).is_some() {
                    loose_certified += 1;
                }
                let otruth = orient2d_r(&r[0], &r[1], &r[2]);
                if let Some(s) = orient2d_a_exact(p[0], p[1], p[2]) {
                    assert_eq!(s, otruth, "orient2d_a_exact regime {ri} {p:?}");
                }
            }
        }
        // The whole point of the tight filter: it certifies the clustered
        // far-from-origin cases the magnitude filter cannot.
        assert!(
            tight_certified > loose_certified * 2,
            "tight filter should dominate ({tight_certified} vs {loose_certified})"
        );
    }

    /// Integer points on the circle of radius 65 centered at the origin —
    /// 65 = 5·13 has two distinct Pythagorean representations, giving eight
    /// lattice points per quadrant-pair. Every coordinate is a small integer,
    /// so all four inputs are exact and the true incircle sign is Zero.
    const CIRCLE65: [[i64; 2]; 8] = [
        [65, 0], [63, 16], [60, 25], [52, 39], [39, 52], [25, 60], [16, 63], [0, 65],
    ];

    /// A filter must NEVER certify a nonzero sign for exactly cocircular
    /// points.
    #[test]
    fn exact_incircle_declines_on_true_cocircular() {
        let pts: Vec<[f64; 2]> = CIRCLE65
            .iter()
            .map(|&[x, y]| [x as f64, y as f64])
            .collect();
        let mut seen = 0usize;
        for i in 0..pts.len() {
            for j in 0..pts.len() {
                for k in 0..pts.len() {
                    for l in 0..pts.len() {
                        if i == j || i == k || i == l || j == k || j == l || k == l {
                            continue;
                        }
                        let (a, b, c, d) = (pts[i], pts[j], pts[k], pts[l]);
                        let truth = incircle_r(&ex2(a), &ex2(b), &ex2(c), &ex2(d));
                        assert_eq!(truth, Sign::Zero, "test setup: not cocircular");
                        assert_eq!(
                            incircle_a_exact(a, b, c, d),
                            None,
                            "certified a sign for cocircular points {a:?} {b:?} {c:?} {d:?}"
                        );
                        seen += 1;
                    }
                }
            }
        }
        assert!(seen > 1000, "expected a full permutation sweep ({seen})");
    }

    /// Threshold sweep: walk `d` away from an exactly cocircular position in
    /// steps of 2⁻⁴⁰ (exact: |coords| < 2¹³, so 53 bits still cover them) and
    /// check the whole transition. Certified signs must always match the exact
    /// predicate; the exact-zero crossing must be declined; and far enough out
    /// the filter must certify, or it would be useless.
    #[test]
    fn exact_incircle_threshold_sweep() {
        let step = 2f64.powi(-40);
        let f = |v: [i64; 2]| [v[0] as f64, v[1] as f64];
        let (a, b, c) = (f(CIRCLE65[0]), f(CIRCLE65[3]), f(CIRCLE65[6]));
        let base = f(CIRCLE65[5]);
        let mut declined_at_zero = false;
        for mag in 0..=24 {
            for sign in [-1i64, 1] {
                let k = sign * (1i64 << mag) * if mag == 0 { 0 } else { 1 };
                let d = [base[0], base[1] + k as f64 * step];
                let truth = incircle_r(&ex2(a), &ex2(b), &ex2(c), &ex2(d));
                match incircle_a_exact(a, b, c, d) {
                    Some(s) => assert_eq!(s, truth, "k={k} d={d:?}"),
                    None => {
                        if truth == Sign::Zero {
                            declined_at_zero = true;
                        }
                    }
                }
                if truth == Sign::Zero {
                    assert_eq!(incircle_a_exact(a, b, c, d), None, "cocircular k={k}");
                }
                // Well past the bound (|det| ≈ 10³·|k|·2⁻⁴⁰ vs a bound of
                // ~7e-8) the filter must decide.
                if mag >= 12 {
                    assert!(
                        incircle_a_exact(a, b, c, d).is_some(),
                        "filter failed to certify a clearly nonzero case k={k}"
                    );
                }
            }
        }
        assert!(declined_at_zero, "the cocircular case must be declined");
    }

    /// Random near-degenerate quadruples built by placing `d` at ±few ulp from
    /// a genuinely cocircular position on an integer-coordinate circle.
    #[test]
    fn exact_incircle_adversarial_near_cocircular() {
        let mut rng = Lcg(0xC0FFEE_11);
        for _ in 0..stress_n(5_000) {
            let pick = |rng: &mut Lcg| {
                let i = ((rng.next_f64(1.0).abs() * 8.0) as usize).min(7);
                CIRCLE65[i]
            };
            let (mut p, mut q, mut r, mut s) =
                (pick(&mut rng), pick(&mut rng), pick(&mut rng), pick(&mut rng));
            // Distinct picks only.
            if p == q || p == r || p == s || q == r || q == s || r == s {
                continue;
            }
            // Sign flips keep them on the same circle (radius 65).
            for v in [&mut p, &mut q, &mut r, &mut s] {
                if rng.next_f64(1.0) < 0.0 {
                    v[0] = -v[0];
                }
                if rng.next_f64(1.0) < 0.0 {
                    v[1] = -v[1];
                }
            }
            let f = |v: [i64; 2]| [v[0] as f64, v[1] as f64];
            let (a, b, c) = (f(p), f(q), f(r));
            let nudge = (rng.next_f64(1.0) * 4.0) as i64;
            let d = [f(s)[0], f(s)[1] + nudge as f64 * f64::EPSILON * 64.0];
            let (ra, rb, rc, rd) = (ex2(a), ex2(b), ex2(c), ex2(d));
            if a == b || a == c || a == d || b == c || b == d || c == d {
                continue;
            }
            let truth = incircle_r(&ra, &rb, &rc, &rd);
            if let Some(sgn) = incircle_a_exact(a, b, c, d) {
                assert_eq!(sgn, truth, "{a:?} {b:?} {c:?} {d:?}");
            }
            if let Some(sgn) = orient2d_a_exact(a, b, c) {
                assert_eq!(sgn, orient2d_r(&ra, &rb, &rc));
            }
        }
    }

    #[test]
    fn orient3d_filter_agrees_with_exact() {
        let mut rng = Lcg(0xDEADBEA7);
        for i in 0..3000 {
            let p: Vec<R3> = (0..4)
                .map(|_| {
                    R3::from_vec3(Vec3::new(
                        rng.next_f64(20.0),
                        rng.next_f64(20.0),
                        rng.next_f64(20.0),
                    ))
                })
                .collect();
            let ap: Vec<[f64; 3]> = p.iter().map(approx3).collect();
            if let Some(s) = orient3d_a(ap[0], ap[1], ap[2], ap[3]) {
                assert_eq!(s, orient3d_r(&p[0], &p[1], &p[2], &p[3]), "orient3d #{i}");
            }
        }
    }

    #[test]
    fn near_degenerate_defers_to_exact() {
        // Points a hair off a line: the filter must return None (uncertain),
        // never a wrong certified sign.
        let a = Vec2::new(12.0, 12.0);
        let b = Vec2::new(24.0, 24.0);
        for i in -8i64..=8 {
            let c = wobble2(48.0, 48.0, i);
            let ra = R2::from_vec2(a);
            let rb = R2::from_vec2(b);
            let ac = approx2(&c);
            match orient2d_a([a.x, a.y], [b.x, b.y], ac) {
                Some(s) => assert_eq!(s, orient2d_r(&ra, &rb, &c), "i={i}"),
                None => {} // escalation is the correct answer here
            }
        }
    }

    #[test]
    fn not_on_segment_prefilter_is_sound() {
        let mut rng = Lcg(0xBAD5EED);
        let a = R3::from_vec3(Vec3::new(0.0, 0.0, 0.0));
        let b = R3::from_vec3(Vec3::new(10.0, 4.0, 2.0));
        let (aa, ab) = (approx3(&a), approx3(&b));
        let mut rejected = 0usize;
        for i in 0..4000 {
            let p = R3::new(
                rat_from_f64(rng.next_f64(12.0)).unwrap(),
                rat_from_f64(rng.next_f64(12.0)).unwrap(),
                rat_from_f64(rng.next_f64(12.0)).unwrap(),
            );
            let exact = point_on_segment_r(&p, &a, &b);
            match not_on_segment_a(approx3(&p), aa, ab) {
                Some(false) => {
                    assert!(!exact, "prefilter wrongly rejected an on-segment point #{i}");
                    rejected += 1;
                }
                Some(true) => unreachable!(),
                None => {}
            }
        }
        assert!(rejected > 3900, "prefilter should reject generic points ({rejected}/4000)");
        // And points genuinely on the segment always defer or agree.
        for k in 1..20 {
            let t = rat_new(k.into(), 21.into());
            let on = a.add(&b.sub(&a).scale(&t));
            assert!(point_on_segment_r(&on, &a, &b));
            assert_ne!(
                not_on_segment_a(approx3(&on), aa, ab),
                Some(false),
                "k={k}"
            );
        }
    }
}
