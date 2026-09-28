// robust/exact/tests.rs — Unit tests for the exact-arithmetic layer:
// correctly rounded rational→f64 conversion, filtered predicates against
// their rational ground truth (random + adversarial near-degenerate inputs),
// exact constructions, and the filter hit-rate guarantee.

use super::backend::{rat_from_int, rat_new, Int, One};

use crate::linalg::{Vec2, Vec3};

use super::filtered::{self, incircle, orient2d, orient3d};
use super::predicates::{
    incircle_r, line_line_intersect_2d, line_plane_intersect, orient2d_r, orient3d_r,
    point_in_tri_2d, segment_param, tri_normal_r, TriLoc,
};
use super::rational::{rat, rat_to_f64, R2, R3};
use super::Sign;

/// Deterministic 64-bit LCG (Knuth MMIX constants) so tests need no rand dep
/// and reproduce exactly across runs and platforms.
struct Lcg(u64);

impl Lcg {
    fn new(seed: u64) -> Self {
        Lcg(seed)
    }
    fn next_u64(&mut self) -> u64 {
        self.0 = self
            .0
            .wrapping_mul(6364136223846793005)
            .wrapping_add(1442695040888963407);
        self.0
    }
    /// Uniform f64 in [-scale, scale) with plenty of low-bit entropy.
    fn next_f64(&mut self, scale: f64) -> f64 {
        let u = (self.next_u64() >> 11) as f64 / (1u64 << 53) as f64; // [0,1)
        (u * 2.0 - 1.0) * scale
    }
}

fn r2(x: f64, y: f64) -> R2 {
    R2::from_vec2(Vec2::new(x, y))
}

fn r3(x: f64, y: f64, z: f64) -> R3 {
    R3::from_vec3(Vec3::new(x, y, z))
}

// ─── rat / rat_to_f64 ────────────────────────────────────────────────────────

#[test]
fn round_trip_is_bit_exact() {
    // -0.0 is absent: rational zero is unsigned, so the sign bit of a
    // negative zero is (harmlessly) lost — asserted separately below.
    let values = [
        0.0,
        1.0,
        -1.0,
        0.1,
        -0.1,
        std::f64::consts::PI,
        1e300,
        -1e300,
        1e-300,
        f64::MAX,
        f64::MIN,
        f64::MIN_POSITIVE,          // smallest normal
        f64::MIN_POSITIVE / 4.0,    // subnormal
        5e-324,                     // smallest subnormal
        -5e-324,
        123456789.123456789,
    ];
    for &v in &values {
        let back = rat_to_f64(&rat(v));
        assert_eq!(back.to_bits(), v.to_bits(), "round trip failed for {v:e}");
    }
    assert_eq!(rat_to_f64(&rat(-0.0)), 0.0);
    // And a pseudo-random sweep across magnitudes.
    let mut rng = Lcg::new(0x9E3779B97F4A7C15);
    for i in 0..2000 {
        let scale = 10f64.powi((i % 61) - 30);
        let v = rng.next_f64(scale);
        let back = rat_to_f64(&rat(v));
        assert_eq!(back.to_bits(), v.to_bits(), "round trip failed for {v:e}");
    }
}

#[test]
fn rounding_is_nearest_ties_even() {
    let half_ulp = rat_new(1.into(), Int::one() << 53usize);
    // 1 + 2^-53 is exactly halfway between 1 and 1+2^-52; even mantissa wins → 1.
    let tie_down = rat(1.0) + &half_ulp;
    assert_eq!(rat_to_f64(&tie_down), 1.0);
    // 1 + 3·2^-53 is halfway between 1+2^-52 (odd mantissa) and 1+2^-51 (even) → up.
    let tie_up = rat(1.0) + &half_ulp * rat_from_int(3.into());
    assert_eq!(rat_to_f64(&tie_up), 1.0 + 2.0 * 2f64.powi(-52));
    // Just above/below the midpoint round to the nearer neighbor.
    let quarter_ulp = &half_ulp / rat_from_int(2.into());
    assert_eq!(rat_to_f64(&(rat(1.0) + &quarter_ulp)), 1.0);
    assert_eq!(
        rat_to_f64(&(rat(1.0) + &half_ulp + &quarter_ulp)),
        1.0 + 2f64.powi(-52)
    );
}

#[test]
fn rounding_handles_overflow_and_subnormals() {
    // 2 * MAX overflows to infinity; MAX itself survives.
    let two_max = rat(f64::MAX) * rat_from_int(2.into());
    assert_eq!(rat_to_f64(&two_max), f64::INFINITY);
    assert_eq!(rat_to_f64(&(-two_max)), f64::NEG_INFINITY);
    // Half the smallest subnormal is a tie with 0 → even → 0.
    let min_sub = rat(5e-324);
    let half_min = &min_sub / rat_from_int(2.into());
    assert_eq!(rat_to_f64(&half_min), 0.0);
    // Three quarters of the smallest subnormal rounds up to it.
    let three_q = &min_sub * rat_new(3.into(), 4.into());
    assert_eq!(rat_to_f64(&three_q).to_bits(), 5e-324f64.to_bits());
    // A value between two subnormals rounds to the nearer one.
    let sub = f64::MIN_POSITIVE / 8.0; // subnormal with headroom
    let next = f64::from_bits(sub.to_bits() + 1);
    let mid_plus = (rat(sub) + rat(next)) * rat_new(1.into(), 2.into())
        + rat_new(1.into(), Int::one() << 2000usize);
    assert_eq!(rat_to_f64(&mid_plus).to_bits(), next.to_bits());
}

/// `rat_to_f64` is hand-rolled (backend.rs item 5) rather than delegated to
/// the backend's own conversion, so that a backend upgrade can never silently
/// change output vertices. This pins the two together: every f64 boundary
/// category plus thousands of random rationals with multi-word numerators and
/// denominators must round identically, bit for bit. A failure here means the
/// backend changed its rounding — investigate before touching either side.
#[test]
fn rat_to_f64_matches_the_backend_oracle() {
    use super::backend::rat_to_f64_oracle;

    let check = |r: &super::backend::Rational, what: &str| {
        let ours = rat_to_f64(r);
        let theirs = rat_to_f64_oracle(r);
        assert_eq!(
            ours.to_bits(),
            theirs.to_bits(),
            "{what}: ours {ours:e} ({:#x}) vs backend {theirs:e} ({:#x})",
            ours.to_bits(),
            theirs.to_bits()
        );
    };

    // Every representable power of two, subnormals included, and their
    // negations and halves (the halves of the smallest are underflow ties).
    for e in -1074i64..=1023 {
        let p = if e >= 0 {
            rat_from_int(Int::one() << e as usize)
        } else {
            rat_new(Int::one(), Int::one() << (-e) as usize)
        };
        check(&p, &format!("2^{e}"));
        check(&-&p, &format!("-2^{e}"));
        check(&(&p / rat_from_int(2.into())), &format!("2^{e}/2"));
        check(&(&p * rat_new(3.into(), 2.into())), &format!("3*2^{e}/2"));
    }

    // Signed zero, exact f64 values across all classes, and their neighbors.
    let flats = [
        0.0,
        -0.0,
        1.0,
        -1.0,
        0.1,
        std::f64::consts::PI,
        f64::MAX,
        f64::MIN,
        f64::MIN_POSITIVE,
        f64::MIN_POSITIVE / 4.0,
        5e-324,
        -5e-324,
        1e300,
        1e-300,
    ];
    for &v in &flats {
        check(&rat(v), &format!("exact {v:e}"));
    }

    // Ties at 1, at the subnormal boundary, and at the overflow boundary.
    let half_ulp = rat_new(1.into(), Int::one() << 53usize);
    check(&(rat(1.0) + &half_ulp), "tie at 1 (down)");
    check(&(rat(1.0) + &half_ulp * rat_from_int(3.into())), "tie at 1 (up)");
    check(&(rat(5e-324) / rat_from_int(2.into())), "underflow tie (+)");
    check(&(rat(-5e-324) / rat_from_int(2.into())), "underflow tie (-)");
    check(
        &(rat(5e-324) * rat_new(1.into(), 4.into())),
        "quarter subnormal (+)",
    );
    check(
        &(rat(-5e-324) * rat_new(1.into(), 4.into())),
        "quarter subnormal (-)",
    );
    // 2^1024 is the overflow threshold; MAX + half an ulp is the tie onto it.
    let two_1024 = rat_from_int(Int::one() << 1024usize);
    check(&two_1024, "2^1024");
    check(&-&two_1024, "-2^1024");
    let max_half_ulp = rat_from_int(Int::one() << 970usize);
    check(&(rat(f64::MAX) + &max_half_ulp), "MAX + ulp/2 (tie up)");
    check(
        &(rat(f64::MAX) + &max_half_ulp - rat_new(1.into(), Int::one() << 64usize)),
        "just below the overflow tie",
    );

    // Random rationals with multi-word numerators and denominators, scaled
    // across the whole exponent range so subnormal, normal and overflow
    // rounding all get exercised.
    let mut rng = Lcg::new(0xC0FFEE_1234_5678);
    let big = |rng: &mut Lcg, words: usize| -> Int {
        let mut v = Int::from(0u32);
        for _ in 0..words {
            v = (v << 64usize) + Int::from(rng.next_u64());
        }
        v
    };
    for i in 0..4000 {
        let nw = (rng.next_u64() % 4 + 1) as usize;
        let dw = (rng.next_u64() % 4 + 1) as usize;
        let mut n = big(&mut rng, nw);
        let mut d = big(&mut rng, dw);
        if d.is_zero() {
            d = Int::one();
        }
        if rng.next_u64() & 1 == 0 {
            n = -n;
        }
        // Shift the value into a random binade, both directions.
        let shift = (rng.next_u64() % 1300) as usize;
        if rng.next_u64() & 1 == 0 {
            n <<= shift;
        } else {
            d <<= shift;
        }
        check(&rat_new(n, d), &format!("random #{i}"));
    }
}

/// `int_ratio_to_f64` shares `rat_to_f64`'s rounding core but skips the gcd
/// that building a `Rational` would pay. It must therefore agree with
/// `rat_to_f64` on the same value — including when the (numerator,
/// denominator) pair handed to it is UNREDUCED, which is the whole point:
/// robust/arrangement.rs feeds it raw homogeneous cross products.
#[test]
fn int_ratio_to_f64_agrees_with_rat_to_f64() {
    use super::rational::int_ratio_to_f64;

    let check = |n: &Int, d: &Int, what: &str| {
        let (ours, exact) = int_ratio_to_f64(n, d);
        let theirs = rat_to_f64(&rat_new(n.clone(), d.clone()));
        assert_eq!(
            ours.to_bits(),
            theirs.to_bits(),
            "{what}: int path {ours:e} vs rational path {theirs:e}"
        );
        // The exactness flag must mean what it says: the f64 round-trips to
        // the original value.
        if exact {
            assert!(ours.is_finite(), "{what}: exact but not finite");
            assert_eq!(
                rat(ours),
                rat_new(n.clone(), d.clone()),
                "{what}: flagged exact but {ours:e} != n/d"
            );
        }
    };

    // Zero numerator with every denominator sign, and the sign rules.
    for d in [1i64, -1, 7, -7] {
        let (v, e) = int_ratio_to_f64(&Int::from(0), &Int::from(d));
        assert_eq!(v.to_bits(), 0.0f64.to_bits(), "0/{d} must be +0.0");
        assert!(e, "0/{d} is exact");
    }
    for (n, d) in [(1i64, 2i64), (-1, 2), (1, -2), (-1, -2), (3, 4), (-7, 8)] {
        check(&Int::from(n), &Int::from(d), &format!("{n}/{d}"));
    }

    // Unreduced pairs must round exactly like their reduced form.
    for k in [2i64, 3, 5, 1 << 20, 1 << 40] {
        check(&Int::from(3 * k), &Int::from(4 * k), &format!("3k/4k k={k}"));
        check(&Int::from(-3 * k), &Int::from(4 * k), &format!("-3k/4k k={k}"));
    }

    // Inexact values: 1/3 rounds, and must not be flagged exact.
    let (third, third_exact) = int_ratio_to_f64(&Int::from(1), &Int::from(3));
    assert_eq!(third, 1.0f64 / 3.0);
    assert!(!third_exact, "1/3 is not representable");
    // 2^-1074 is exact; half of it underflows to a tie with zero.
    let (sub, sub_exact) = int_ratio_to_f64(&Int::one(), &(Int::one() << 1074usize));
    assert_eq!(sub, 5e-324);
    assert!(sub_exact);
    let (under, under_exact) = int_ratio_to_f64(&Int::one(), &(Int::one() << 1075usize));
    assert_eq!(under, 0.0);
    assert!(!under_exact, "underflow is never exact");
    // Overflow in both signs, never exact.
    let (over, over_exact) = int_ratio_to_f64(&(Int::one() << 1024usize), &Int::one());
    assert_eq!(over, f64::INFINITY);
    assert!(!over_exact);
    let (nover, _) = int_ratio_to_f64(&-(Int::one() << 1024usize), &Int::one());
    assert_eq!(nover, f64::NEG_INFINITY);

    // Huge multi-word magnitudes across the exponent range, both signs, with
    // deliberately unreduced pairs (a shared random factor on both sides).
    let mut rng = Lcg::new(0x5EED_F00D_2024);
    let big = |rng: &mut Lcg, words: usize| -> Int {
        let mut v = Int::from(0u32);
        for _ in 0..words {
            v = (v << 64usize) + Int::from(rng.next_u64());
        }
        v
    };
    for i in 0..4000 {
        let nw = (rng.next_u64() % 4 + 1) as usize;
        let dw = (rng.next_u64() % 4 + 1) as usize;
        let mut n = big(&mut rng, nw);
        let mut d = big(&mut rng, dw);
        if d.is_zero() {
            d = Int::one();
        }
        if rng.next_u64() & 1 == 0 {
            n = -n;
        }
        if rng.next_u64() & 1 == 0 {
            d = -d;
        }
        let shift = (rng.next_u64() % 1300) as usize;
        if rng.next_u64() & 1 == 0 {
            n <<= shift;
        } else {
            d <<= shift;
        }
        // Common factor: same value, different representation.
        let f = Int::from(rng.next_u64() | 1);
        check(&n, &d, &format!("random #{i}"));
        check(&(&n * &f), &(&d * &f), &format!("random #{i} unreduced"));
    }
}

/// The soundness claim behind the arrangement's gcd-free translated filter
/// inputs: computing the translated coordinate from homogeneous cross products
/// and rounding once produces the BIT-IDENTICAL f64 to subtracting exactly in
/// `Rational` and rounding that. Both round the same exact value, and
/// correctly rounded conversion is a function of the value alone.
#[test]
fn homogeneous_translation_rounds_identically_to_rational_subtraction() {
    use super::backend::{denom, int_from_uint, mul_int_uint, mul_uint, numer};
    use super::predicates::homog2_of;
    use super::rational::int_ratio_to_f64;

    let mut rng = Lcg::new(0xA11CE_777);
    let coord = |rng: &mut Lcg| -> super::backend::Rational {
        // A mix of plain f64 coordinates (exact dyadics, like mesh vertices)
        // and constructed fractions with large numerators and denominators,
        // like intersection points.
        match rng.next_u64() % 3 {
            // Far-from-origin dyadics, the case the translation lever targets.
            0 => rat(((rng.next_u64() % (1 << 40)) as f64) * 0.5 - 5.0e11),
            1 => rat((rng.next_u64() % 2_000_000) as f64 * 1e-3 - 1000.0),
            _ => {
                let n = Int::from(rng.next_u64()) * Int::from(rng.next_u64() | 1);
                let d = Int::from(rng.next_u64() | 1) + Int::one();
                rat_new(if rng.next_u64() & 1 == 0 { -n } else { n }, d)
            }
        }
    };

    for i in 0..3000 {
        let o = R2::new(coord(&mut rng), coord(&mut rng));
        let p = R2::new(coord(&mut rng), coord(&mut rng));
        // Exactly robust/arrangement.rs's `translated_coord`: the unreduced
        // fraction (pn·od − on·pd) / (pd·od), no Rational anywhere. Also
        // checked through the homogeneous form, which is the same value with
        // wider operands.
        let coord = |pc: &super::backend::Rational, oc: &super::backend::Rational| -> f64 {
            let (pn, pd) = (numer(pc), denom(pc));
            let (on, od) = (numer(oc), denom(oc));
            let num = mul_int_uint(pn, od) - mul_int_uint(on, pd);
            let den = int_from_uint(mul_uint(pd, od));
            int_ratio_to_f64(&num, &den).0
        };
        let (hx, hy) = (coord(&p.x, &o.x), coord(&p.y, &o.y));
        let (ho, hp) = (homog2_of(&o), homog2_of(&p));
        let hden = &hp.2 * &ho.2;
        let (gx, _) = int_ratio_to_f64(&(&hp.0 * &ho.2 - &ho.0 * &hp.2), &hden);
        let (gy, _) = int_ratio_to_f64(&(&hp.1 * &ho.2 - &ho.1 * &hp.2), &hden);
        assert_eq!(gx.to_bits(), hx.to_bits(), "#{i} x: homogeneous form differs");
        assert_eq!(gy.to_bits(), hy.to_bits(), "#{i} y: homogeneous form differs");
        // Reference: exact rational subtraction, then one rounding.
        let t = p.sub(&o);
        let (rx, ry) = (rat_to_f64(&t.x), rat_to_f64(&t.y));
        assert_eq!(hx.to_bits(), rx.to_bits(), "#{i} x: {hx:e} vs {rx:e}");
        assert_eq!(hy.to_bits(), ry.to_bits(), "#{i} y: {hy:e} vs {ry:e}");
    }
}

// ─── Predicates: filtered vs exact ground truth ──────────────────────────────

#[test]
fn orient2d_matches_exact_on_random_input() {
    let mut rng = Lcg::new(42);
    for _ in 0..5000 {
        let (a, b, c) = (
            Vec2::new(rng.next_f64(100.0), rng.next_f64(100.0)),
            Vec2::new(rng.next_f64(100.0), rng.next_f64(100.0)),
            Vec2::new(rng.next_f64(100.0), rng.next_f64(100.0)),
        );
        let exact = orient2d_r(&R2::from_vec2(a), &R2::from_vec2(b), &R2::from_vec2(c));
        assert_eq!(orient2d(a, b, c), exact, "a={a:?} b={b:?} c={c:?}");
    }
}

#[test]
fn orient2d_adversarial_near_collinear() {
    // Shewchuk's classic torture grid: points ulp-perturbed around the line
    // y = x, where naive float evaluation gets the sign wrong.
    let base = 12.0;
    for i in 0..32 {
        for j in 0..32 {
            let a = Vec2::new(base + (i as f64) * 2f64.powi(-52), base + (j as f64) * 2f64.powi(-52));
            let b = Vec2::new(24.0, 24.0);
            let c = Vec2::new(48.0, 48.0);
            let exact = orient2d_r(&R2::from_vec2(a), &R2::from_vec2(b), &R2::from_vec2(c));
            assert_eq!(orient2d(a, b, c), exact, "i={i} j={j}");
        }
    }
    // Exactly collinear must report Zero.
    assert_eq!(
        orient2d(Vec2::new(0.0, 0.0), Vec2::new(1.0, 1.0), Vec2::new(3.0, 3.0)),
        Sign::Zero
    );
}

#[test]
fn orient3d_matches_exact_on_random_input() {
    let mut rng = Lcg::new(7);
    for _ in 0..5000 {
        let p = |rng: &mut Lcg| {
            Vec3::new(rng.next_f64(50.0), rng.next_f64(50.0), rng.next_f64(50.0))
        };
        let (a, b, c, d) = (p(&mut rng), p(&mut rng), p(&mut rng), p(&mut rng));
        let exact = orient3d_r(
            &R3::from_vec3(a),
            &R3::from_vec3(b),
            &R3::from_vec3(c),
            &R3::from_vec3(d),
        );
        assert_eq!(orient3d(a, b, c, d), exact);
    }
}

#[test]
fn orient3d_adversarial_near_coplanar() {
    // d ulp-perturbed off the plane z = x + y; every perturbation direction
    // must be classified correctly, and the on-plane point must be Zero.
    let a = Vec3::new(0.0, 0.0, 0.0);
    let b = Vec3::new(1.0, 0.0, 1.0);
    let c = Vec3::new(0.0, 1.0, 1.0);
    for i in -16i32..=16 {
        let z = 7.0 + (i as f64) * 2f64.powi(-50);
        let d = Vec3::new(3.0, 4.0, z);
        let exact = orient3d_r(
            &R3::from_vec3(a),
            &R3::from_vec3(b),
            &R3::from_vec3(c),
            &R3::from_vec3(d),
        );
        assert_eq!(orient3d(a, b, c, d), exact, "i={i}");
        if i == 0 {
            assert_eq!(exact, Sign::Zero);
        }
    }
}

#[test]
fn orient3d_sign_convention() {
    // CCW base triangle in z=0 viewed from +z; d above the plane → Pos.
    let a = Vec3::new(0.0, 0.0, 0.0);
    let b = Vec3::new(1.0, 0.0, 0.0);
    let c = Vec3::new(0.0, 1.0, 0.0);
    assert_eq!(orient3d(a, b, c, Vec3::new(0.2, 0.2, 1.0)), Sign::Pos);
    assert_eq!(orient3d(a, b, c, Vec3::new(0.2, 0.2, -1.0)), Sign::Neg);
}

#[test]
fn incircle_matches_exact_and_handles_cocircular() {
    let mut rng = Lcg::new(1234);
    for _ in 0..3000 {
        let p = |rng: &mut Lcg| Vec2::new(rng.next_f64(10.0), rng.next_f64(10.0));
        let (a, b, c, d) = (p(&mut rng), p(&mut rng), p(&mut rng), p(&mut rng));
        let exact = incircle_r(
            &R2::from_vec2(a),
            &R2::from_vec2(b),
            &R2::from_vec2(c),
            &R2::from_vec2(d),
        );
        assert_eq!(incircle(a, b, c, d), exact);
    }
    // Four exactly cocircular points (x² + y² = 25) → Zero regardless of filter.
    let a = Vec2::new(3.0, 4.0);
    let b = Vec2::new(5.0, 0.0);
    let c = Vec2::new(-3.0, -4.0);
    let d = Vec2::new(-5.0, 0.0);
    assert_eq!(incircle(a, b, c, d), Sign::Zero);
    // Strictly inside / outside for the same CCW circle.
    assert_eq!(incircle(a, b, c, Vec2::new(0.0, 0.0)), Sign::Neg); // a,b,c is CW here
    let (a2, b2, c2) = (b, a, c); // flip to CCW
    assert_eq!(orient2d(a2, b2, c2), Sign::Pos);
    assert_eq!(incircle(a2, b2, c2, Vec2::new(0.0, 0.0)), Sign::Pos);
    assert_eq!(incircle(a2, b2, c2, Vec2::new(100.0, 0.0)), Sign::Neg);
}

#[test]
fn filter_hit_rate_is_high_on_generic_input() {
    // Measured from this test's own calls only: the filter helpers return
    // `None` exactly when the public predicates would escalate to the exact
    // tier. (An earlier version read process-global counters, which other
    // tests running concurrently in the same process polluted.)
    let (mut fast, mut exact) = (0u64, 0u64);
    let mut tally = |filtered_sign: Option<Sign>, exact_sign: Sign| {
        match filtered_sign {
            // A resolved filter must agree with the predicate's final answer.
            Some(s) => {
                assert_eq!(s, exact_sign);
                fast += 1;
            }
            None => exact += 1,
        }
    };
    let mut rng = Lcg::new(99);
    for _ in 0..10000 {
        let p = |rng: &mut Lcg| {
            Vec3::new(rng.next_f64(50.0), rng.next_f64(50.0), rng.next_f64(50.0))
        };
        let (a, b, c, d) = (p(&mut rng), p(&mut rng), p(&mut rng), p(&mut rng));
        tally(filtered::orient3d_filter(a, b, c, d), orient3d(a, b, c, d));
        let (a2, b2, c2) = (
            Vec2::new(a.x, a.y),
            Vec2::new(b.x, b.y),
            Vec2::new(c.x, c.y),
        );
        tally(filtered::orient2d_filter(a2, b2, c2), orient2d(a2, b2, c2));
    }
    let rate = fast as f64 / (fast + exact) as f64;
    assert!(
        rate > 0.99,
        "float filter resolved only {rate:.4} of generic predicates (fast={fast}, exact={exact})"
    );
}

// ─── Constructions ───────────────────────────────────────────────────────────

#[test]
fn line_plane_intersect_lands_on_plane_and_segment() {
    // Plane z = 1 (triangle in that plane), segment from below to above.
    let a = r3(0.0, 0.0, 1.0);
    let b = r3(4.0, 0.0, 1.0);
    let c = r3(0.0, 4.0, 1.0);
    let p = r3(1.0, 1.0, 0.0);
    let q = r3(1.0, 1.0, 3.0);
    let x = line_plane_intersect(&p, &q, &a, &b, &c).expect("not parallel");
    assert_eq!(x, r3(1.0, 1.0, 1.0));
    // Exactly on the plane: orient3d of the four points is Zero.
    assert_eq!(orient3d_r(&a, &b, &c, &x), Sign::Zero);
    // Parameter is exactly 1/3.
    assert_eq!(
        segment_param(&p, &q, &x),
        rat_new(1.into(), 3.into())
    );
    // Parallel segment → None.
    let p2 = r3(0.0, 0.0, 2.0);
    let q2 = r3(1.0, 1.0, 2.0);
    assert!(line_plane_intersect(&p2, &q2, &a, &b, &c).is_none());
}

#[test]
fn line_plane_intersect_is_exact_on_awkward_fractions() {
    // A skew plane and a segment whose crossing has no finite binary
    // representation; verify the exact incidence property instead of floats.
    let a = r3(0.1, 0.2, 0.3);
    let b = r3(1.7, -0.4, 0.9);
    let c = r3(-0.6, 1.1, 2.2);
    let p = r3(0.3, 0.3, -5.0);
    let q = r3(0.4, 0.5, 7.0);
    let x = line_plane_intersect(&p, &q, &a, &b, &c).expect("not parallel");
    assert_eq!(orient3d_r(&a, &b, &c, &x), Sign::Zero);
    // x is on the line p→q: (x-p) × (q-p) = 0.
    let n = x.sub(&p).cross(&q.sub(&p));
    assert!(n.is_zero());
}

#[test]
fn line_line_intersect_2d_crossing_diagonals() {
    let x = line_line_intersect_2d(&r2(0.0, 0.0), &r2(1.0, 1.0), &r2(1.0, 0.0), &r2(0.0, 1.0))
        .expect("not parallel");
    assert_eq!(x, r2(0.5, 0.5));
    // Parallel and collinear both report None.
    assert!(
        line_line_intersect_2d(&r2(0.0, 0.0), &r2(1.0, 0.0), &r2(0.0, 1.0), &r2(1.0, 1.0))
            .is_none()
    );
    assert!(
        line_line_intersect_2d(&r2(0.0, 0.0), &r2(1.0, 0.0), &r2(2.0, 0.0), &r2(3.0, 0.0))
            .is_none()
    );
}

#[test]
fn point_in_tri_2d_classifies_all_regions() {
    let a = r2(0.0, 0.0);
    let b = r2(4.0, 0.0);
    let c = r2(0.0, 4.0);
    assert_eq!(point_in_tri_2d(&r2(1.0, 1.0), &a, &b, &c), TriLoc::Inside);
    assert_eq!(point_in_tri_2d(&r2(2.0, 0.0), &a, &b, &c), TriLoc::OnEdge(0));
    assert_eq!(point_in_tri_2d(&r2(2.0, 2.0), &a, &b, &c), TriLoc::OnEdge(1));
    assert_eq!(point_in_tri_2d(&r2(0.0, 1.0), &a, &b, &c), TriLoc::OnEdge(2));
    assert_eq!(point_in_tri_2d(&a, &a, &b, &c), TriLoc::OnVertex(0));
    assert_eq!(point_in_tri_2d(&b, &a, &b, &c), TriLoc::OnVertex(1));
    assert_eq!(point_in_tri_2d(&c, &a, &b, &c), TriLoc::OnVertex(2));
    assert_eq!(point_in_tri_2d(&r2(3.0, 3.0), &a, &b, &c), TriLoc::Outside);
    assert_eq!(point_in_tri_2d(&r2(-0.1, 1.0), &a, &b, &c), TriLoc::Outside);
    // Same answers with clockwise winding.
    assert_eq!(point_in_tri_2d(&r2(1.0, 1.0), &a, &c, &b), TriLoc::Inside);
    assert_eq!(point_in_tri_2d(&r2(2.0, 0.0), &a, &c, &b), TriLoc::OnEdge(2));
    // Degenerate triangle: everything is Outside.
    let d = r2(8.0, 0.0);
    assert_eq!(point_in_tri_2d(&r2(1.0, 0.0), &a, &b, &d), TriLoc::Outside);
}

#[test]
fn tri_normal_r_matches_orientation() {
    let n = tri_normal_r(&r3(0.0, 0.0, 0.0), &r3(1.0, 0.0, 0.0), &r3(0.0, 1.0, 0.0));
    assert_eq!(n, r3(0.0, 0.0, 1.0));
    // Degenerate triangle → zero normal.
    let z = tri_normal_r(&r3(0.0, 0.0, 0.0), &r3(1.0, 1.0, 1.0), &r3(2.0, 2.0, 2.0));
    assert!(z.is_zero());
}
