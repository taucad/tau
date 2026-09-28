// robust/exact/mod.rs — Exact geometric arithmetic for the robust boolean
// engine (src/robust).
//
// Layered design:
//   backend.rs    — the single seam to the bignum library (dashu): the
//                   `Int`/`Uint`/`Rational` type aliases, the trait
//                   re-exports and the small helper layer every other module
//                   uses instead of naming the backend crates.
//   rational.rs   — Rational point types (R2/R3) and correctly rounded
//                   rational→f64 conversion.
//   predicates.rs — fully exact predicates and geometric constructions on
//                   rational points; ground truth for everything.
//   filtered.rs   — f64 entry points with Shewchuk-style static error-bound
//                   filters that escalate to predicates.rs only when the
//                   float computation cannot certify a sign.
//
// The exact boolean pipeline (src/boolean3.rs) never calls into this module.

pub mod approx;
pub mod backend;
pub mod filtered;
pub mod intpred;
pub mod predicates;
pub mod rational;

#[cfg(test)]
mod tests;

use backend::{rat_is_negative, rat_is_positive, Rational};

/// Sign of an exactly evaluated quantity. The whole robust pipeline reasons
/// in terms of signs; magnitudes only matter inside constructions.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum Sign {
    Neg,
    Zero,
    Pos,
}

impl Sign {
    /// Sign of a finite f64 (`-0.0` is `Zero`). Only meaningful when the
    /// value is known to carry the correct sign of the exact quantity.
    #[inline]
    pub fn of_f64(v: f64) -> Sign {
        if v > 0.0 {
            Sign::Pos
        } else if v < 0.0 {
            Sign::Neg
        } else {
            Sign::Zero
        }
    }

    #[inline]
    pub fn of_rat(r: &Rational) -> Sign {
        if rat_is_positive(r) {
            Sign::Pos
        } else if rat_is_negative(r) {
            Sign::Neg
        } else {
            Sign::Zero
        }
    }

    /// The opposite sign (`Zero` stays `Zero`).
    #[inline]
    pub fn flip(self) -> Sign {
        match self {
            Sign::Neg => Sign::Pos,
            Sign::Zero => Sign::Zero,
            Sign::Pos => Sign::Neg,
        }
    }

    #[inline]
    pub fn as_i32(self) -> i32 {
        match self {
            Sign::Neg => -1,
            Sign::Zero => 0,
            Sign::Pos => 1,
        }
    }

    #[inline]
    pub fn is_zero(self) -> bool {
        self == Sign::Zero
    }
}
