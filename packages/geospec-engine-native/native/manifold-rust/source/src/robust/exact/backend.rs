// robust/exact/backend.rs — The single seam between the robust engine and its
// arbitrary-precision arithmetic library.
//
// Every module in src/robust that needs unbounded integers or rationals goes
// through the aliases and re-exports here; nothing else in the crate names
// `dashu_int` or `dashu_ratio` directly. Swapping the backend is therefore a
// change to this file alone, plus a re-verification of the backend-coupled
// hot spots inventoried below.
//
// The types are aliases, not newtypes, on purpose: the call sites use the
// backend's operator impls directly, and wrapping them would either hide those
// or require re-implementing several hundred trait impls with no behavioral
// gain. What the call sites must NOT use directly is any *constructor*,
// *accessor* or *trait method* whose name or shape is backend-specific — those
// go through the small helper layer at the bottom of this file (`rat_new`,
// `numer`/`denom`, `rat_is_zero`, `mul_int_uint`, `hash_rational`, …), which is
// the only code that has to change when the backend does.
//
// ─── Phase-2 checklist: backend-coupled hot spots ───────────────────────────
//
// These are the places whose *correctness* (not just compilation) depends on
// how the backend represents and normalizes values. A backend swap must
// re-verify each one.
//
//  1. `hash_rational` / `rat_eq` (below), backing `rational.rs`'s
//     `R2Key` / `R3Key`. Structural hashing that reaches into the backend's
//     representation: the sign, then the little-endian limbs of the
//     numerator magnitude, then the limbs of the denominator. A replacement
//     backend must expose an equivalent canonical limb/word view (or the
//     hash must be rewritten, e.g. over a byte serialization). Note the limb
//     count is not hashed; the `0xfeed` separator between numerator and
//     denominator is what keeps the stream unambiguous. Preserve that if the
//     limb width changes.
//
//  2. Canonicality invariant behind (1). `R2Key`/`R3Key` equality is
//     `rat_eq`, i.e. *field* equality (numer and denom compared
//     independently), which equals value equality only if every stored
//     rational is fully reduced with a positive denominator. Today that
//     holds because all stored rationals come from `rat_new` (gcd-reducing),
//     `rat_from_f64`, or the arithmetic operators — all of which
//     canonicalize. A replacement backend must auto-reduce in its equivalent
//     of `rat_new` and must normalize the sign onto the numerator, or (1)
//     breaks silently.
//
//  3. `predicates.rs` construction sites that rely on "exactly one gcd":
//     `line_plane_intersect`, `line_line_intersect_2d`, `lift_to_plane` and
//     `segment_param` each build every output coordinate with a single
//     `rat_new`, so the reduction cost is paid exactly once per coordinate.
//     The gcd is a measured hot spot; re-measure it on a swap.
//
//  4. `intpred.rs` `Int` fallback tier: `scaled_big` (exact dyadic scaling
//     via `Int::from(i64) << usize`) and `sign_big`. This is the unbounded
//     tier below i64/i128 and is where big-integer performance shows up on
//     degenerate meshes.
//
//  5. `rational.rs::rat_to_f64` — correctly rounded (nearest, ties to even)
//     rational -> f64. It works on the *unsigned magnitude* type through
//     `numer_mag`/`denom`, `uint_bits`, `uint_bit`, shifts by usize, `Ord`,
//     `/`, `-`, `*`, `+= u32` and `Uint::to_u64()`.
//     It must NOT be replaced by any backend-provided `to_f64()` without a
//     differential test — some backends' rational->float conversions are not
//     correctly rounded (num-rational's `ToPrimitive for Ratio` is not).
//     dashu's `RBig::to_f64` *is* correctly rounded and agrees with ours on
//     every f64 boundary category and on thousands of random multi-word
//     rationals (`tests::rat_to_f64_matches_the_backend_oracle`), but we keep
//     our own routine so a backend upgrade can never silently move an output
//     vertex; the backend's version stays wired up as the test oracle.
//     (`rat_to_f64` is the only rational->f64 rounding path in the engine.)
//
//  6. `predicates.rs::Homog2(pub Int, pub Int, pub Int)` — a homogeneous 2D
//     point holding backend integers directly, and the `[Int; 3]` normals
//     from `tri_normal_int` / `dot_point_raw` / `dot_diff_raw`, plus
//     `tri_tri.rs`'s `type Frac = (Int, Int)`. These are public-ish
//     API surfaces whose signatures change with the backend type. (They stay
//     inside the crate: the FFI and wasm layers only ever see opaque
//     handles and f64s.)
//
//  7. `rat_from_f64` (`rational.rs::rat`) must be exact for every finite f64
//     and must return `None` for NaN and infinity — the engine relies on the
//     panic path never triggering for finite input.

use std::borrow::Cow;

use dashu_int::ops::{BitTest, UnsignedAbs};

/// Unbounded signed integer. Magnitudes up to two [`dashu_int::Word`]s live
/// inline in the value, so the small integers that dominate the robust
/// engine's exact tier cost no allocation at all.
pub type Int = dashu_int::IBig;

/// Unsigned magnitude companion of [`Int`] (used by `rat_to_f64` and by the
/// rational denominators, which are always positive).
pub type Uint = dashu_int::UBig;

/// Exact rational, always stored fully reduced with the sign on the numerator.
/// `RBig` enforces that canonical form in its type (the non-reducing variant
/// is a separate type, `Relaxed`, which this crate never uses), which is what
/// makes the field-wise `rat_eq` / `hash_rational` below sound — see items (1)
/// and (2).
pub type Rational = dashu_ratio::RBig;

/// The `num_traits` items the exact-arithmetic call sites need on [`Int`] and
/// [`Uint`], re-exported so backend-dependent trait paths live in one place
/// too. (Nothing outside this file relies on these traits being implemented
/// for [`Rational`] — that is what the `rat_*` helpers below are for, since a
/// rational backend need not implement `num_traits` at all.)
pub use num_traits::{One, Signed, ToPrimitive, Zero};

// ─── Rational construction ───────────────────────────────────────────────────

/// `numer / denom`, fully reduced with the sign normalized onto the numerator.
/// This is the single gcd whose cost item (3) above accounts for.
///
/// Panics if `denom` is zero, like every backend's equivalent.
#[inline]
pub fn rat_new(numer: Int, denom: Int) -> Rational {
    Rational::from_parts_signed(numer, denom)
}

/// The integer `v` as a rational (denominator 1).
#[inline]
pub fn rat_from_int(v: Int) -> Rational {
    Rational::from(v)
}

/// Exact conversion of an f64; `None` for NaN and infinity. Every finite f64
/// is a dyadic rational, so no information is lost — see item (7).
#[inline]
pub fn rat_from_f64(v: f64) -> Option<Rational> {
    Rational::try_from(v).ok()
}

#[inline]
pub fn rat_zero() -> Rational {
    Rational::ZERO
}

#[inline]
pub fn rat_one() -> Rational {
    Rational::ONE
}

// ─── Rational inspection ─────────────────────────────────────────────────────

#[inline]
pub fn rat_is_zero(r: &Rational) -> bool {
    r.numerator().is_zero()
}

#[inline]
pub fn rat_is_negative(r: &Rational) -> bool {
    r.numerator().is_negative()
}

#[inline]
pub fn rat_is_positive(r: &Rational) -> bool {
    r.numerator().is_positive()
}

#[inline]
pub fn rat_abs(r: &Rational) -> Rational {
    if rat_is_negative(r) {
        -r
    } else {
        r.clone()
    }
}

/// Signed numerator of a canonical rational.
#[inline]
pub fn numer(r: &Rational) -> &Int {
    r.numerator()
}

/// Denominator of a canonical rational, always strictly positive — hence the
/// unsigned type, which is what the homogenizing predicates and `rat_to_f64`
/// both want.
#[inline]
pub fn denom(r: &Rational) -> &Uint {
    r.denominator()
}

/// Magnitude of the numerator. Returned as a `Cow` because some backends store
/// the sign inside the integer and cannot hand out a borrowed unsigned view.
#[inline]
pub fn numer_mag(r: &Rational) -> Cow<'_, Uint> {
    // dashu keeps the sign inside `IBig`, so the unsigned view is a copy of
    // the magnitude words (inline, hence allocation-free, for small values).
    Cow::Owned(r.numerator().unsigned_abs())
}

/// Field-wise equality of two *canonical* rationals — value equality without
/// the backend's general (unreduced-tolerant) comparison, which is most
/// expensive exactly when the values ARE equal. See item (2).
#[inline]
pub fn rat_eq(a: &Rational, b: &Rational) -> bool {
    // `RBig`'s own `PartialEq` is exactly this field comparison, because the
    // type guarantees the canonical form; no cross-multiplication involved.
    a == b
}

/// Structural hash of a canonical rational — see item (1).
pub fn hash_rational<H: std::hash::Hasher>(r: &Rational, state: &mut H) {
    use std::hash::Hash;
    // `as_sign_words`/`as_words` expose the normalized little-endian limbs
    // (no leading zero limb), so equal magnitudes always produce identical
    // streams. `Word` is target-width — u64 natively, u32 on wasm32 — so the
    // hash stream differs between targets. That is harmless: these hashes are
    // process-local (map probing only) and never reach the output, and the
    // maps that use them document their order-independence.
    let (_, words) = r.numerator().as_sign_words();
    rat_is_negative(r).hash(state);
    for d in words {
        d.hash(state);
    }
    0xfeed_u64.hash(state); // separator between numerator and denominator
    for d in r.denominator().as_words() {
        d.hash(state);
    }
}

// ─── Int / Uint bridging ─────────────────────────────────────────────────────
//
// Denominators are unsigned but the homogenized predicate coordinates are
// signed, so the two types meet in the homogenization helpers. Backends differ
// in which mixed-type operator impls they provide; these three helpers are the
// only places that need to know.

#[inline]
pub fn mul_int_uint(a: &Int, b: &Uint) -> Int {
    a * b
}

#[inline]
pub fn mul_uint(a: &Uint, b: &Uint) -> Uint {
    a * b
}

#[inline]
pub fn int_from_uint(v: Uint) -> Int {
    Int::from(v)
}

/// Magnitude of a signed integer, for the unsigned core of `rat_to_f64` and
/// its `int_ratio_to_f64` sibling.
#[inline]
pub fn int_mag(v: &Int) -> Uint {
    v.unsigned_abs()
}

/// Number of bits in the magnitude (0 for zero).
#[inline]
pub fn uint_bits(v: &Uint) -> u64 {
    BitTest::bit_len(v) as u64
}

/// Value of bit `n` (little-endian) of the magnitude.
#[inline]
pub fn uint_bit(v: &Uint, n: usize) -> bool {
    BitTest::bit(v, n)
}

/// The backend's own correctly rounded rational -> f64, used *only* as a test
/// oracle for `rational.rs::rat_to_f64` (see item (5) and
/// `tests::rat_to_f64_matches_the_backend_oracle`). The engine keeps its own
/// routine: it is the one that has been validated against the C++ reference,
/// and it must not silently change with a backend upgrade.
#[cfg(test)]
pub fn rat_to_f64_oracle(r: &Rational) -> f64 {
    r.to_f64().value()
}
