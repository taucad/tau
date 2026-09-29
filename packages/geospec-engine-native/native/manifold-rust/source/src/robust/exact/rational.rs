// robust/exact/rational.rs — Exact rational points and correctly rounded
// rational→f64 conversion for the robust boolean engine.
//
// Input mesh vertices are finite f64 and convert to Rational exactly
// (`rat`, `R3::from_vec3`). Constructed points — plane/segment intersections
// built in robust/exact/predicates.rs — stay rational through the whole
// pipeline; only output assembly rounds them back, via `rat_to_f64`, which
// rounds to the *nearest* f64 (ties to even, subnormals and overflow
// handled). That single-rounding guarantee is what lets the robust engine's
// output vertices agree with the exact engine's to the last ulp on
// intersection points, and bit-for-bit on pass-through input vertices.

use super::backend::{
    self, denom, int_mag, numer_mag, rat_from_f64, rat_is_negative, rat_is_zero, Int, Rational,
    Signed, ToPrimitive, Uint,
};

use crate::linalg::{Vec2, Vec3};

/// Exact conversion of a finite f64. Every finite f64 is a dyadic rational,
/// so this never loses information.
///
/// Panics on NaN/infinity — mesh import rejects non-finite vertices
/// (`Error::NonFiniteVertex`) long before the robust engine runs, so a
/// non-finite value here is an internal logic error, not bad user input.
#[inline]
pub fn rat(v: f64) -> Rational {
    rat_from_f64(v).expect("robust engine: coordinate must be finite")
}

/// 2^e as f64, exact for the full representable range -1074..=1023
/// (subnormal powers of two included). Built by bit manipulation so no
/// intermediate rounding can occur.
#[inline]
fn pow2(e: i64) -> f64 {
    debug_assert!((-1074..=1023).contains(&e), "pow2 exponent out of range: {e}");
    if e >= -1022 {
        f64::from_bits(((e + 1023) as u64) << 52)
    } else {
        f64::from_bits(1u64 << (e + 1074))
    }
}

/// Round a rational to the nearest f64, ties to even — the correctly rounded
/// result, identical to rounding the exact real value once. Values beyond
/// f64 range become ±infinity; values below half the smallest subnormal
/// become (signed) zero.
pub fn rat_to_f64(r: &Rational) -> f64 {
    if rat_is_zero(r) {
        return 0.0;
    }
    let n_mag = numer_mag(r);
    mag_ratio_to_f64(n_mag.as_ref(), denom(r), rat_is_negative(r)).0
}

/// Correctly rounded f64 of the exact value `numer / denom`, built straight
/// from big integers — no `Rational`, hence no gcd reduction. Also reports
/// whether the conversion was EXACT (the returned f64 equals `numer/denom`
/// with no rounding at all).
///
/// The rounding core is shared with [`rat_to_f64`] and is value-based, not
/// representation-based: it derives the binary exponent from bit lengths and
/// rounds with one exact integer division, so an unreduced fraction and its
/// reduced form produce the identical f64. That is what makes this a drop-in
/// replacement for "subtract exactly in `Rational`, then round" — the two
/// paths round the same exact value and are therefore bit-identical.
///
/// `denom` must be nonzero.
pub fn int_ratio_to_f64(numer: &Int, denom: &Int) -> (f64, bool) {
    debug_assert!(!denom.is_zero(), "int_ratio_to_f64: zero denominator");
    if numer.is_zero() {
        // Exact: the value is zero, and +0.0 is what `rat_to_f64` returns for
        // a zero rational whatever the denominator's sign.
        return (0.0, true);
    }
    let neg = numer.is_negative() != denom.is_negative();
    mag_ratio_to_f64(&int_mag(numer), &int_mag(denom), neg)
}

/// `±n/d` from unsigned magnitudes (`n`, `d` both nonzero), correctly rounded
/// to nearest with ties to even, plus an exactness flag. Values beyond f64
/// range become ±infinity; values below half the smallest subnormal become
/// (signed) zero. Both of those, and every rounding, report `false`.
fn mag_ratio_to_f64(n: &Uint, d: &Uint, neg: bool) -> (f64, bool) {
    // Exact floor exponent e: 2^e <= n/d < 2^(e+1).
    let mut e = backend::uint_bits(n) as i64 - backend::uint_bits(d) as i64;
    let ge = if e >= 0 {
        *n >= (d << e as usize)
    } else {
        (n << (-e) as usize) >= *d
    };
    if !ge {
        e -= 1;
    }
    if e > 1023 {
        return (if neg { f64::NEG_INFINITY } else { f64::INFINITY }, false);
    }

    // Position of the result's least significant bit. Normal numbers carry
    // 53 bits ending at e-52; subnormals are cut off at 2^-1074.
    let lsb = (e - 52).max(-1074);

    // m = round_nearest_even((n/d) / 2^lsb), computed with one exact
    // integer division plus a remainder comparison.
    let (num, den) = if lsb >= 0 {
        (n.clone(), d << lsb as usize)
    } else {
        (n << (-lsb) as usize, d.clone())
    };
    let q = &num / &den;
    let rem = &num - &q * &den;
    // `q` is the truncation of the value to a multiple of 2^lsb, so a zero
    // remainder means the value IS such a multiple: no rounding happens below
    // (both increments require a nonzero remainder) and the result is exact.
    let exact = rem.is_zero();
    let mut m = q;
    let twice_rem = &rem << 1usize;
    match twice_rem.cmp(&den) {
        std::cmp::Ordering::Greater => m += 1u32,
        std::cmp::Ordering::Equal => {
            if backend::uint_bit(&m, 0) {
                m += 1u32;
            }
        }
        std::cmp::Ordering::Less => {}
    }

    if m.is_zero() {
        // `n`/`d` are nonzero, so a zero mantissa means the value underflowed
        // to (signed) zero — never exact.
        return (if neg { -0.0 } else { 0.0 }, false);
    }
    // Rounding up may have crossed into the next binade (m = 2^53) or past
    // the largest finite value (2^1024 -> infinity).
    if backend::uint_bits(&m) as i64 - 1 + lsb > 1023 {
        return (if neg { f64::NEG_INFINITY } else { f64::INFINITY }, false);
    }
    // m <= 2^53, so both the u64 and the f64 conversion are exact, and
    // m * 2^lsb is representable by construction — the multiply is exact.
    let val = m.to_u64().expect("mantissa fits in u64") as f64 * pow2(lsb);
    (if neg { -val } else { val }, exact)
}

// ─── R2 — exact 2D point/vector ─────────────────────────────────────────────

/// Exact 2D point (or vector). Derived `Ord` is lexicographic, which the
/// arrangement code uses for exact point dedup in BTree maps.
#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct R2 {
    pub x: Rational,
    pub y: Rational,
}

impl R2 {
    #[inline]
    pub fn new(x: Rational, y: Rational) -> Self {
        Self { x, y }
    }

    #[inline]
    pub fn from_vec2(v: Vec2) -> Self {
        Self::new(rat(v.x), rat(v.y))
    }

    pub fn to_vec2_rounded(&self) -> Vec2 {
        Vec2::new(rat_to_f64(&self.x), rat_to_f64(&self.y))
    }

    pub fn sub(&self, o: &R2) -> R2 {
        R2::new(&self.x - &o.x, &self.y - &o.y)
    }

    pub fn add(&self, o: &R2) -> R2 {
        R2::new(&self.x + &o.x, &self.y + &o.y)
    }

    pub fn scale(&self, s: &Rational) -> R2 {
        R2::new(&self.x * s, &self.y * s)
    }

    pub fn dot(&self, o: &R2) -> Rational {
        &self.x * &o.x + &self.y * &o.y
    }

    /// 2D cross product (z of the 3D cross of the embedded vectors).
    pub fn cross(&self, o: &R2) -> Rational {
        &self.x * &o.y - &self.y * &o.x
    }

    pub fn is_zero(&self) -> bool {
        rat_is_zero(&self.x) && rat_is_zero(&self.y)
    }
}

// ─── R3 — exact 3D point/vector ─────────────────────────────────────────────

/// Exact 3D point (or vector). Derived `Ord` is lexicographic (x, y, z) for
/// exact vertex welding in output assembly.
#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct R3 {
    pub x: Rational,
    pub y: Rational,
    pub z: Rational,
}

impl R3 {
    #[inline]
    pub fn new(x: Rational, y: Rational, z: Rational) -> Self {
        Self { x, y, z }
    }

    #[inline]
    pub fn from_vec3(v: Vec3) -> Self {
        Self::new(rat(v.x), rat(v.y), rat(v.z))
    }

    pub fn to_vec3_rounded(&self) -> Vec3 {
        Vec3::new(rat_to_f64(&self.x), rat_to_f64(&self.y), rat_to_f64(&self.z))
    }

    pub fn sub(&self, o: &R3) -> R3 {
        R3::new(&self.x - &o.x, &self.y - &o.y, &self.z - &o.z)
    }

    pub fn add(&self, o: &R3) -> R3 {
        R3::new(&self.x + &o.x, &self.y + &o.y, &self.z + &o.z)
    }

    pub fn scale(&self, s: &Rational) -> R3 {
        R3::new(&self.x * s, &self.y * s, &self.z * s)
    }

    pub fn dot(&self, o: &R3) -> Rational {
        &self.x * &o.x + &self.y * &o.y + &self.z * &o.z
    }

    pub fn cross(&self, o: &R3) -> R3 {
        R3::new(
            &self.y * &o.z - &self.z * &o.y,
            &self.z * &o.x - &self.x * &o.z,
            &self.x * &o.y - &self.y * &o.x,
        )
    }

    pub fn is_zero(&self) -> bool {
        rat_is_zero(&self.x) && rat_is_zero(&self.y) && rat_is_zero(&self.z)
    }

    /// Drop the coordinate at `axis` (0=x, 1=y, 2=z), keeping the other two
    /// in cyclic order — the paper's bijective dominant-axis projection used
    /// to embed per-triangle 2D arrangements.
    pub fn project_drop(&self, axis: usize) -> R2 {
        match axis {
            0 => R2::new(self.y.clone(), self.z.clone()),
            1 => R2::new(self.z.clone(), self.x.clone()),
            2 => R2::new(self.x.clone(), self.y.clone()),
            _ => unreachable!("axis must be 0, 1, or 2"),
        }
    }
}

// ─── Cheap exact hash keys ───────────────────────────────────────────────────
//
// A general-purpose rational Hash/Eq must stay consistent for UNREDUCED
// ratios, which costs at least a cross-multiplication (and, in some
// libraries, a Euclidean recursion). Every rational this pipeline stores is canonical —
// built by rat_new, the arithmetic operators, or rat_from_f64, all of which
// reduce — so field identity IS value identity, and hashing the raw sign/limb
// data is both exact and division-free. The wrappers below are drop-in
// hash-map keys that are 1–2 orders of magnitude cheaper than hashing R2/R3
// directly. See backend.rs items (1) and (2).

use backend::{hash_rational as hash_rat, rat_eq as rat_fields_eq};

/// Hash-map key wrapper around a canonical R2.
#[derive(Clone, Debug)]
pub struct R2Key(pub R2);

impl PartialEq for R2Key {
    #[inline]
    fn eq(&self, other: &Self) -> bool {
        rat_fields_eq(&self.0.x, &other.0.x) && rat_fields_eq(&self.0.y, &other.0.y)
    }
}
impl Eq for R2Key {}
impl std::hash::Hash for R2Key {
    fn hash<H: std::hash::Hasher>(&self, state: &mut H) {
        hash_rat(&self.0.x, state);
        hash_rat(&self.0.y, state);
    }
}

/// Hash-map key wrapper around a canonical R3.
#[derive(Clone, Debug)]
pub struct R3Key(pub R3);

impl PartialEq for R3Key {
    #[inline]
    fn eq(&self, other: &Self) -> bool {
        rat_fields_eq(&self.0.x, &other.0.x)
            && rat_fields_eq(&self.0.y, &other.0.y)
            && rat_fields_eq(&self.0.z, &other.0.z)
    }
}
impl Eq for R3Key {}
impl std::hash::Hash for R3Key {
    fn hash<H: std::hash::Hasher>(&self, state: &mut H) {
        hash_rat(&self.0.x, state);
        hash_rat(&self.0.y, state);
        hash_rat(&self.0.z, state);
    }
}

/// Field-wise equality of canonical R2 values — see [`r3_eq`].
#[inline]
pub fn r2_eq(a: &R2, b: &R2) -> bool {
    rat_fields_eq(&a.x, &b.x) && rat_fields_eq(&a.y, &b.y)
}

/// Field-wise equality of canonical R3 values — value equality without
/// the backend's general comparison (which is most expensive exactly when
/// the values ARE equal).
#[inline]
pub fn r3_eq(a: &R3, b: &R3) -> bool {
    rat_fields_eq(&a.x, &b.x) && rat_fields_eq(&a.y, &b.y) && rat_fields_eq(&a.z, &b.z)
}
