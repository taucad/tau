// robust/exact/intpred.rs — Exact integer evaluation of the raw-f64
// predicates, the fast escalation tier between the float filters
// (robust/exact/filtered.rs) and the exact rational ground truth
// (robust/exact/predicates.rs).
//
// Every finite f64 is a dyadic rational m·2^e. Scaling all four inputs of a
// predicate *per coordinate axis* by a common power of two turns them into
// integers without changing the determinant's sign (the scale factors are
// positive and factor out of each column). The determinant is then evaluated
// in the narrowest integer width a static bit-length budget proves cannot
// overflow — i64, then i128, then Int — either way the sign is exact, with
// no rational normalization (gcds) anywhere. On the degenerate-heavy meshes
// that defeat the float filters (doubled surfaces, large flat regions) this
// tier is 10–50× cheaper than the rational fallback it replaces.
//
// The i64 tier exists mainly for wasm, where a 64×64→128 multiply lowers to a
// compiler-rt `__multi3` call while an i64 multiply is a single `i64.mul`.
// Every budget below is derived from worst-case magnitudes, not measured, and
// the tier declines (falls through to i128) the moment any operand exceeds it.

use super::backend::{Int, Signed, Zero};
use super::Sign;

/// Exact dyadic decomposition: returns (m, e) with v == m·2^e and trailing
/// zeros stripped from m (minimizing later shift widths). v must be finite.
#[inline]
fn decomp(v: f64) -> (i64, i32) {
    debug_assert!(v.is_finite());
    if v == 0.0 {
        return (0, 0);
    }
    let bits = v.to_bits();
    let biased = ((bits >> 52) & 0x7ff) as i32;
    let frac = bits & ((1u64 << 52) - 1);
    let (mut m, mut e) = if biased == 0 {
        (frac, -1074) // subnormal: no hidden bit
    } else {
        (frac | (1u64 << 52), biased - 1075)
    };
    let tz = m.trailing_zeros();
    m >>= tz;
    e += tz as i32;
    (if v < 0.0 { -(m as i64) } else { m as i64 }, e)
}

/// The four values of one coordinate axis as exactly scaled i128 integers,
/// or None when any scaled magnitude would exceed `budget` bits (the caller
/// then takes the Int path). Zeros scale to zero regardless of exponent.
#[inline]
fn scaled_i128<const N: usize>(vs: [f64; N], budget: u32) -> Option<[i128; N]> {
    let d = vs.map(decomp);
    let emin = d
        .iter()
        .filter(|(m, _)| *m != 0)
        .map(|(_, e)| *e)
        .min()
        .unwrap_or(0);
    let mut out = [0i128; N];
    for i in 0..N {
        let (m, e) = d[i];
        if m == 0 {
            continue;
        }
        let shift = (e - emin) as u32;
        let bits = 64 - m.unsigned_abs().leading_zeros() + shift;
        if bits > budget {
            return None;
        }
        out[i] = (m as i128) << shift;
    }
    Some(out)
}

/// The same per-axis scaling into i64, or None when any scaled magnitude
/// would exceed `budget` bits. Used by the i64 fast tier, which thereby avoids
/// touching 128-bit arithmetic at all (see `orient2d_i`).
#[inline]
fn scaled_i64<const N: usize>(vs: [f64; N], budget: u32) -> Option<[i64; N]> {
    debug_assert!(budget < 63);
    let d = vs.map(decomp);
    let emin = d
        .iter()
        .filter(|(m, _)| *m != 0)
        .map(|(_, e)| *e)
        .min()
        .unwrap_or(0);
    let mut out = [0i64; N];
    for i in 0..N {
        let (m, e) = d[i];
        if m == 0 {
            continue;
        }
        let shift = (e - emin) as u32;
        // `shift` is unbounded here, so test the bit length before shifting.
        let bits = 64 - m.unsigned_abs().leading_zeros() + shift;
        if bits > budget {
            return None;
        }
        out[i] = m << shift;
    }
    Some(out)
}

/// Per-thread count of predicate calls the i64 tier resolved, so tests can
/// prove their inputs actually reach that tier instead of silently checking
/// the i128 path twice. Thread-local (not atomic) to stay race-free while the
/// test harness runs tests in parallel; compiled out of non-test builds.
#[cfg(test)]
pub mod tier_stats {
    use std::cell::Cell;

    thread_local! {
        pub static I64_HITS: Cell<u64> = const { Cell::new(0) };
    }

    pub fn reset() {
        I64_HITS.with(|c| c.set(0));
    }

    pub fn i64_hits() -> u64 {
        I64_HITS.with(|c| c.get())
    }
}

#[inline]
fn note_i64() {
    #[cfg(test)]
    tier_stats::I64_HITS.with(|c| c.set(c.get() + 1));
}

/// True when |v| < 2^bits, i.e. v fits in `bits` magnitude bits.
#[inline]
fn fits(v: i128, bits: u32) -> bool {
    v.unsigned_abs() < (1u128 << bits)
}

/// Narrow three i128 values to i64, or None if any exceeds `bits` magnitude
/// bits. Declining is always safe: the caller stays on the i128 path.
#[inline]
fn narrow3(vs: [i128; 3], bits: u32) -> Option<[i64; 3]> {
    debug_assert!(bits < 63);
    if vs.iter().all(|v| fits(*v, bits)) {
        Some([vs[0] as i64, vs[1] as i64, vs[2] as i64])
    } else {
        None
    }
}

/// Same scaling with unbounded Int magnitudes. Public: the tri-tri
/// interval overlap (robust/tri_tri.rs) reuses it to compare interval
/// endpoints along the common plane-intersection line in pure integers.
pub fn scaled_big<const N: usize>(vs: [f64; N]) -> [Int; N] {
    let d = vs.map(decomp);
    let emin = d
        .iter()
        .filter(|(m, _)| *m != 0)
        .map(|(_, e)| *e)
        .min()
        .unwrap_or(0);
    d.map(|(m, e)| {
        if m == 0 {
            Int::zero()
        } else {
            Int::from(m) << (e - emin) as usize
        }
    })
}

#[inline]
fn sign_i64(v: i64) -> Sign {
    match v.cmp(&0) {
        std::cmp::Ordering::Less => Sign::Neg,
        std::cmp::Ordering::Equal => Sign::Zero,
        std::cmp::Ordering::Greater => Sign::Pos,
    }
}

#[inline]
fn sign_i128(v: i128) -> Sign {
    match v.cmp(&0) {
        std::cmp::Ordering::Less => Sign::Neg,
        std::cmp::Ordering::Equal => Sign::Zero,
        std::cmp::Ordering::Greater => Sign::Pos,
    }
}

fn sign_big(v: &Int) -> Sign {
    if v.is_zero() {
        Sign::Zero
    } else if v.is_negative() {
        Sign::Neg
    } else {
        Sign::Pos
    }
}

/// Exact sign of the orient2d determinant cross(b-a, c-a) on raw f64 points.
///
/// i64 budget 30: scaled values satisfy |v| ≤ 2^30−1, so each difference is
/// |d| ≤ 2^31−2, each product ≤ (2^31−2)^2 = 2^62 − 2^33 + 4, and the final
/// subtraction of two such products is bounded by
///   2·(2^62 − 2^33 + 4) = 2^63 − 2^34 + 8 < 2^63 − 1 = i64::MAX.
/// Budget 31 would not do: 2·(2^32−2)^2 = 2^65 − 2^36 + 8 overflows.
///
/// i128 budget: scaled values ≤ 61 bits ⇒ differences ≤ 62, products ≤ 124,
/// final subtraction ≤ 125 bits — safely inside i128.
pub fn orient2d_i(a: [f64; 2], b: [f64; 2], c: [f64; 2]) -> Sign {
    if let (Some([ax, bx, cx]), Some([ay, by, cy])) = (
        scaled_i64([a[0], b[0], c[0]], 30),
        scaled_i64([a[1], b[1], c[1]], 30),
    ) {
        note_i64();
        return sign_i64((bx - ax) * (cy - ay) - (by - ay) * (cx - ax));
    }
    let xs = scaled_i128([a[0], b[0], c[0]], 61);
    let ys = scaled_i128([a[1], b[1], c[1]], 61);
    if let (Some([ax, bx, cx]), Some([ay, by, cy])) = (xs, ys) {
        return sign_i128((bx - ax) * (cy - ay) - (by - ay) * (cx - ax));
    }
    let [ax, bx, cx] = scaled_big([a[0], b[0], c[0]]);
    let [ay, by, cy] = scaled_big([a[1], b[1], c[1]]);
    sign_big(&((&bx - &ax) * (&cy - &ay) - (&by - &ay) * (&cx - &ax)))
}

/// Exact sign of the orient3d determinant dot(cross(b-a, c-a), d-a) on raw
/// f64 points.
///
/// i128 budget: scaled values ≤ 40 bits ⇒ differences ≤ 41, 2-products
/// ≤ 82, their difference ≤ 83, 3-products ≤ 124, 3-term sum ≤ 126 bits.
///
/// i64 tier, budget 20 on the *edge differences* rather than on the scaled
/// values: with D = 2^20−1 bounding each of u, v, w componentwise,
///   2-product        ≤ D²        = 2^40 − 2^21 + 1
///   2×2 minor        ≤ 2D²       = 2^41 − 2^22 + 2
///   minor × 3rd term ≤ 2D³
///   3-term sum       ≤ 6D³       = 6·1152918206075109375
///                                = 6917509236450656250 < 2^63 − 1
/// (partial sums are bounded by 4D³, so no intermediate overflows either).
/// Budget 21 fails: 6·(2^21−1)³ ≈ 5.5·10^19 ≫ i64::MAX.
///
/// The check is on the differences, not on the scaled values, deliberately:
/// the equivalent value budget is 19 bits (values ≤ 2^19−1 ⇒ differences
/// ≤ 2^20−2), which instrumentation on the 1075458 ∪ 91115 workload showed
/// never fires — real mesh coordinates carry ≥ 24-bit mantissas — whereas the
/// difference form fires on the calls where the four points are near each
/// other, which is the common geometric case.
pub fn orient3d_i(a: [f64; 3], b: [f64; 3], c: [f64; 3], d: [f64; 3]) -> Sign {
    let xs = scaled_i128([a[0], b[0], c[0], d[0]], 40);
    let ys = scaled_i128([a[1], b[1], c[1], d[1]], 40);
    let zs = scaled_i128([a[2], b[2], c[2], d[2]], 40);
    if let (Some([ax, bx, cx, dx]), Some([ay, by, cy, dy]), Some([az, bz, cz, dz])) = (xs, ys, zs) {
        let (ux, uy, uz) = (bx - ax, by - ay, bz - az);
        let (vx, vy, vz) = (cx - ax, cy - ay, cz - az);
        let (wx, wy, wz) = (dx - ax, dy - ay, dz - az);
        if let (Some([ux, uy, uz]), Some([vx, vy, vz]), Some([wx, wy, wz])) = (
            narrow3([ux, uy, uz], 20),
            narrow3([vx, vy, vz], 20),
            narrow3([wx, wy, wz], 20),
        ) {
            let det =
                ux * (vy * wz - vz * wy) + uy * (vz * wx - vx * wz) + uz * (vx * wy - vy * wx);
            note_i64();
            return sign_i64(det);
        }
        let det = ux * (vy * wz - vz * wy) + uy * (vz * wx - vx * wz) + uz * (vx * wy - vy * wx);
        return sign_i128(det);
    }
    let [ax, bx, cx, dx] = scaled_big([a[0], b[0], c[0], d[0]]);
    let [ay, by, cy, dy] = scaled_big([a[1], b[1], c[1], d[1]]);
    let [az, bz, cz, dz] = scaled_big([a[2], b[2], c[2], d[2]]);
    let (ux, uy, uz) = (&bx - &ax, &by - &ay, &bz - &az);
    let (vx, vy, vz) = (&cx - &ax, &cy - &ay, &cz - &az);
    let (wx, wy, wz) = (&dx - &ax, &dy - &ay, &dz - &az);
    let det = ux * (&vy * &wz - &vz * &wy) + uy * (&vz * &wx - &vx * &wz)
        + uz * (&vx * &wy - &vy * &wx);
    sign_big(&det)
}

#[cfg(test)]
mod tests {
    use super::super::predicates::{orient2d_r, orient3d_r};
    use super::super::rational::{R2, R3};
    use super::*;
    use crate::linalg::{Vec2, Vec3};

    fn o2_ref(a: [f64; 2], b: [f64; 2], c: [f64; 2]) -> Sign {
        orient2d_r(
            &R2::from_vec2(Vec2::new(a[0], a[1])),
            &R2::from_vec2(Vec2::new(b[0], b[1])),
            &R2::from_vec2(Vec2::new(c[0], c[1])),
        )
    }

    fn o3_ref(a: [f64; 3], b: [f64; 3], c: [f64; 3], d: [f64; 3]) -> Sign {
        orient3d_r(
            &R3::from_vec3(Vec3::new(a[0], a[1], a[2])),
            &R3::from_vec3(Vec3::new(b[0], b[1], b[2])),
            &R3::from_vec3(Vec3::new(c[0], c[1], c[2])),
            &R3::from_vec3(Vec3::new(d[0], d[1], d[2])),
        )
    }

    /// Deterministic LCG so failures reproduce.
    struct Rng(u64);
    impl Rng {
        fn next(&mut self) -> u64 {
            self.0 = self.0.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
            self.0
        }
        /// f64 in roughly [-2, 2] with f32-like granularity (the common case:
        /// coordinates originating from f32 MeshGL input).
        fn coord(&mut self) -> f64 {
            (self.next() as i32 as f64) * 2.0f64.powi(-30)
        }
        /// f64 with a wild exponent, exercising the Int path.
        fn wild(&mut self) -> f64 {
            let m = self.next() as i32 as f64;
            let e = (self.next() % 500) as i32 - 250;
            let v = m * 2.0f64.powi(e);
            if v.is_finite() { v } else { m }
        }
    }

    #[test]
    fn orient3d_i_matches_rational_generic() {
        let mut rng = Rng(0x5eed);
        for _ in 0..2000 {
            let p: Vec<[f64; 3]> = (0..4)
                .map(|_| [rng.coord(), rng.coord(), rng.coord()])
                .collect();
            assert_eq!(
                orient3d_i(p[0], p[1], p[2], p[3]),
                o3_ref(p[0], p[1], p[2], p[3])
            );
        }
    }

    #[test]
    fn orient3d_i_matches_rational_wild_exponents() {
        let mut rng = Rng(0xbad_cafe);
        for _ in 0..500 {
            let p: Vec<[f64; 3]> = (0..4)
                .map(|_| [rng.wild(), rng.wild(), rng.wild()])
                .collect();
            assert_eq!(
                orient3d_i(p[0], p[1], p[2], p[3]),
                o3_ref(p[0], p[1], p[2], p[3])
            );
        }
    }

    #[test]
    fn orient3d_i_exact_zeros() {
        let mut rng = Rng(0xc0_11a9e);
        for _ in 0..500 {
            // d on the lattice plane through a with directions (b-a), (c-a):
            // small dyadic combination keeps every coordinate exact.
            let a = [rng.coord(), rng.coord(), rng.coord()];
            let b = [rng.coord(), rng.coord(), rng.coord()];
            let c = [rng.coord(), rng.coord(), rng.coord()];
            let s = 0.25;
            let t = 0.5;
            let d = [
                a[0] + s * (b[0] - a[0]) + t * (c[0] - a[0]),
                a[1] + s * (b[1] - a[1]) + t * (c[1] - a[1]),
                a[2] + s * (b[2] - a[2]) + t * (c[2] - a[2]),
            ];
            // The combination is exact only when no rounding occurred; verify
            // against the rational reference either way.
            assert_eq!(orient3d_i(a, b, c, d), o3_ref(a, b, c, d));
        }
    }

    #[test]
    fn orient3d_i_degenerate_inputs() {
        let z = [0.0, -0.0, 0.0];
        let a = [1.0, 2.0, 3.0];
        assert_eq!(orient3d_i(z, z, a, a), Sign::Zero);
        assert_eq!(orient3d_i(a, a, a, a), Sign::Zero);
        let sub = [f64::MIN_POSITIVE / 4.0, 1e300, -1e-300];
        assert_eq!(orient3d_i(z, a, sub, sub), Sign::Zero);
        assert_eq!(
            orient3d_i(z, a, sub, [1.0, 1.0, 1.0]),
            o3_ref(z, a, sub, [1.0, 1.0, 1.0])
        );
    }

    #[test]
    fn orient2d_i_matches_rational() {
        let mut rng = Rng(0x2d2d);
        for _ in 0..2000 {
            let p: Vec<[f64; 2]> = (0..3).map(|_| [rng.coord(), rng.coord()]).collect();
            assert_eq!(orient2d_i(p[0], p[1], p[2]), o2_ref(p[0], p[1], p[2]));
        }
        for _ in 0..500 {
            let p: Vec<[f64; 2]> = (0..3).map(|_| [rng.wild(), rng.wild()]).collect();
            assert_eq!(orient2d_i(p[0], p[1], p[2]), o2_ref(p[0], p[1], p[2]));
        }
        // Exact collinear.
        assert_eq!(
            orient2d_i([0.0, 0.0], [1.0, 1.0], [0.5, 0.5]),
            Sign::Zero
        );
    }

    // ---- i64 tier ----

    #[test]
    fn scaled_i64_budget_boundary() {
        // 2^30-1 is the largest magnitude a 30-bit budget admits; 2^30 is the
        // first that must decline.
        // (1.0 anchors the scale at 2^0; without it a lone power of two would
        // rescale to its odd mantissa and always fit.)
        let max = (1i64 << 30) - 1;
        assert_eq!(scaled_i64([max as f64, 1.0], 30), Some([max, 1]));
        assert_eq!(scaled_i64([(1i64 << 30) as f64, 1.0], 30), None);
        // The budget applies after per-axis rescaling: 1.0 and 2^-30 share the
        // scale 2^-30, so 1.0 becomes 2^30 and must decline.
        assert_eq!(scaled_i64([1.0, 2.0f64.powi(-30)], 30), None);
        assert_eq!(
            scaled_i64([1.0, 2.0f64.powi(-29)], 30),
            Some([1 << 29, 1])
        );
        // Zeros never constrain the scale, and negatives keep their sign.
        assert_eq!(scaled_i64([0.0, -3.0, 1e300], 30), None);
        assert_eq!(scaled_i64([0.0, -3.0, 6.0], 30), Some([0, -3, 6]));
        // Subnormals decompose exactly too.
        assert_eq!(scaled_i64([f64::MIN_POSITIVE / 2.0, 0.0], 30), Some([1, 0]));
    }

    /// Both predicates at the exact worst case their budget admits: the i64
    /// tier must accept it and still produce the right sign.
    #[test]
    fn i64_tier_worst_case_magnitudes() {
        // orient2d: values ±(2^30-1) ⇒ |det| = 2·(2^31-2)^2 at the extreme.
        let m = ((1i64 << 30) - 1) as f64;
        let a = [-m, m];
        let b = [m, -m];
        let c = [-m, -m];
        assert_eq!(orient2d_i(a, b, c), o2_ref(a, b, c));
        assert_ne!(orient2d_i(a, b, c), Sign::Zero);
        assert!(scaled_i64([a[0], b[0], c[0]], 30).is_some());
        // Just over the 30-bit budget the i64 tier must decline and the i128
        // tier must give the identical answer. (2^30+1, not 2^30: a lone power
        // of two would rescale to 1 and stay inside the budget.)
        let m2 = ((1i64 << 30) + 1) as f64;
        let a2 = [-m2, m2];
        let b2 = [m2, -m2];
        let c2 = [-m2, -m2];
        assert_eq!(scaled_i64([a2[0], b2[0], c2[0]], 30), None);
        assert_eq!(orient2d_i(a2, b2, c2), o2_ref(a2, b2, c2));
        assert_eq!(orient2d_i(a2, b2, c2), orient2d_i(a, b, c));

        // orient3d: differences of ±(2^20-1) around the origin.
        let d = ((1i64 << 20) - 1) as f64;
        let p = [0.0, 0.0, 0.0];
        let q = [d, -d, d];
        let r = [-d, d, d];
        let s = [d, d, -d];
        assert_eq!(orient3d_i(p, q, r, s), o3_ref(p, q, r, s));
        assert_ne!(orient3d_i(p, q, r, s), Sign::Zero);
        assert!(narrow3([d as i128, -(d as i128), d as i128], 20).is_some());
        // One unit more: differences of 2^20+1 exceed the budget, so the tier
        // declines, i128 takes over, and the sign is unchanged (the whole
        // configuration is just scaled by a positive factor).
        let e = ((1i64 << 20) + 1) as f64;
        let q2 = [e, -e, e];
        let r2 = [-e, e, e];
        let s2 = [e, e, -e];
        let ei = (1i128 << 20) + 1;
        assert_eq!(narrow3([ei, -ei, ei], 20), None);
        assert_eq!(orient3d_i(p, q2, r2, s2), o3_ref(p, q2, r2, s2));
        assert_eq!(orient3d_i(p, q2, r2, s2), orient3d_i(p, q, r, s));
    }

    /// The tier boundary must be invisible: sweeping magnitudes across it, the
    /// integer predicates must agree with the exact rational reference at every
    /// step (this is what catches an off-by-one in the budget derivation).
    #[test]
    fn i64_tier_boundary_sweep_matches_rational() {
        let mut rng = Rng(0x64_64_64);
        for k in 28..=32 {
            let scale = 2.0f64.powi(k);
            for _ in 0..400 {
                // Integer-valued coordinates straddling the 2^30 / 2^20 marks.
                let g = |r: &mut Rng| ((r.next() % (1u64 << 21)) as f64) * (scale / 2097152.0);
                let p2: Vec<[f64; 2]> = (0..3).map(|_| [g(&mut rng), g(&mut rng)]).collect();
                assert_eq!(
                    orient2d_i(p2[0], p2[1], p2[2]),
                    o2_ref(p2[0], p2[1], p2[2]),
                    "orient2d at 2^{k}"
                );
                let p3: Vec<[f64; 3]> = (0..4)
                    .map(|_| [g(&mut rng), g(&mut rng), g(&mut rng)])
                    .collect();
                assert_eq!(
                    orient3d_i(p3[0], p3[1], p3[2], p3[3]),
                    o3_ref(p3[0], p3[1], p3[2], p3[3]),
                    "orient3d at 2^{k}"
                );
            }
        }
    }

    /// Clustered points: the orient3d i64 tier keys on edge *differences*, so
    /// large absolute coordinates with small offsets must still be exact.
    #[test]
    fn i64_tier_clustered_points_matches_rational() {
        tier_stats::reset();
        let mut rng = Rng(0xc1_05_7e);
        for _ in 0..2000 {
            // A cluster whose offsets live on the same 2^-25 lattice as the
            // base, so the common scale is 2^-25 and only the spread (< 2^20
            // lattice steps) decides whether the i64 tier applies.
            let lat = 2.0f64.powi(-25);
            let base = [
                (rng.next() % (1u64 << 26)) as f64 * lat,
                (rng.next() % (1u64 << 26)) as f64 * lat,
                (rng.next() % (1u64 << 26)) as f64 * lat,
            ];
            let off = |r: &mut Rng| (r.next() % (1u64 << 19)) as f64 * lat;
            let p: Vec<[f64; 3]> = (0..4)
                .map(|_| {
                    [
                        base[0] + off(&mut rng),
                        base[1] + off(&mut rng),
                        base[2] + off(&mut rng),
                    ]
                })
                .collect();
            assert_eq!(
                orient3d_i(p[0], p[1], p[2], p[3]),
                o3_ref(p[0], p[1], p[2], p[3])
            );
        }
        assert!(
            tier_stats::i64_hits() > 1000,
            "clustered inputs bypassed the i64 tier ({} hits)",
            tier_stats::i64_hits()
        );
    }

    /// The i64 tier must agree with the Int/Rational ground truth on
    /// bulk random input that lands squarely inside its budget.
    #[test]
    fn i64_tier_bulk_matches_rational() {
        tier_stats::reset();
        let mut rng = Rng(0x1_64_7e_12);
        // 30-bit integer-valued coordinates: exactly the orient2d budget.
        let g30 = |r: &mut Rng| ((r.next() % (1u64 << 30)) as i64 - (1 << 29)) as f64;
        for _ in 0..3000 {
            let p: Vec<[f64; 2]> = (0..3).map(|_| [g30(&mut rng), g30(&mut rng)]).collect();
            assert_eq!(orient2d_i(p[0], p[1], p[2]), o2_ref(p[0], p[1], p[2]));
        }
        let hits2d = tier_stats::i64_hits();
        assert!(hits2d > 2500, "orient2d i64 tier fired only {hits2d} times");

        // 20-bit integer-valued coordinates: exactly the orient3d budget.
        let g20 = |r: &mut Rng| ((r.next() % (1u64 << 20)) as i64 - (1 << 19)) as f64;
        for _ in 0..3000 {
            let p: Vec<[f64; 3]> = (0..4)
                .map(|_| [g20(&mut rng), g20(&mut rng), g20(&mut rng)])
                .collect();
            assert_eq!(
                orient3d_i(p[0], p[1], p[2], p[3]),
                o3_ref(p[0], p[1], p[2], p[3])
            );
        }
        let hits3d = tier_stats::i64_hits() - hits2d;
        assert!(hits3d > 2500, "orient3d i64 tier fired only {hits3d} times");
    }
}
