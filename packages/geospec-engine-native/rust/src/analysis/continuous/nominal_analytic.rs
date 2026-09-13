//! Decisions on associated placed AP242 nominal supports, not exact-real
//! surfaces or source-construction intentions. No displayed acos decides truth.

use num_bigint::BigInt;
use num_integer::Integer;
use num_rational::BigRational as Rat;
use num_traits::{One, Signed, Zero};

use super::{exact, ContinuousError, ExactScalar, Outcome};
use crate::{backend::brep::BrepEntity, codec::Json};

pub(crate) const NOMINAL_ANALYTIC_PROFILE: &str = "geospec-ap242-nominal-analytic-v1";
const STORED_BITS: u64 = 2048;
const FIXED_BITS: usize = 128;
/// Pre-call requested capacity, excluding borrowed selectors/prior results and
/// caller JSON projection/encoding. The fixed schedule retains at most 40
/// rational slots (12 coordinates, 6 deltas, 8 Gram/distance/limit values and
/// 14 nested temporaries), each two normalized 2048-bit integers. At most 32
/// temporary BigInt buffers of 8192 bits cover one guarded operation, including
/// num-rational 0.4.2 normalization and num-bigint 0.4.6 multiply/divide/GCD.
/// Operations here stay below 4098 bits; the 8192-bit temporary capacity is
/// conservative headroom, not permission to grow retained slots. The angular
/// loops use <=24 integer slots below 262 bits, inside the same reservation.
/// Output construction retains <=4 ExactScalars (two <=617-digit integers each)
/// plus <=32 small JSON nodes/keys. No recursive or unbounded work is used.
/// These dependency-pinned requested capacities are not allocator/RSS bounds.
pub(crate) const NOMINAL_ANALYTIC_RESERVATION_BYTES: usize = 40
    * (std::mem::size_of::<Rat>() + 2 * 256)
    + 32 * (std::mem::size_of::<BigInt>() + 1024)
    + 4 * (std::mem::size_of::<ExactScalar>() + 2 * 1024)
    + 32 * (std::mem::size_of::<Json>() + 128);
/// Fixed upper logical debit, independent of predicate result/cache warmth:
/// <=2*(33+11+25)=138 series iterations (including remainders), with
/// the remaining debit covering the fixed support/comparison schedule.
pub(crate) const NOMINAL_ANALYTIC_UNITS: u64 = 256;
/// One complete final certificate: <=128 JSON nodes/key slots, <=64 bytes per
/// fixed key/scalar display, plus eight <=1024-byte exact integer strings.
pub(crate) const NOMINAL_ANALYTIC_OUTPUT_BYTES: usize =
    128 * (std::mem::size_of::<Json>() + std::mem::size_of::<String>() + 64) + 8 * 1024;

#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) enum SupportKind {
    Axis,
    Plane,
}

/// Constructed only from the shared located-face inventory. Public ordinal is
/// deliberately distinct from the private query index in `entity`.
#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct NominalSupport {
    pub entity: BrepEntity,
    pub public_ordinal: u32,
    pub kind: SupportKind,
    pub origin: [f64; 3],
    pub direction: [f64; 3],
}

#[derive(Clone, Copy)]
pub(crate) enum AnalyticKind {
    Axis,
    Plane,
    Direction,
}

pub(crate) struct NominalAnalyticRequest {
    pub kind: AnalyticKind,
    pub subject: NominalSupport,
    pub target: NominalSupport,
    pub tolerance: f64,
    pub angle_degrees: f64,
    pub angular_tolerance_degrees: f64,
}

#[derive(Debug)]
pub(crate) struct NominalAnalyticEvidence {
    pub cosine_squared: ExactScalar,
    pub distance_squared: Option<ExactScalar>,
    pub lower_degrees: ExactScalar,
    pub upper_degrees: ExactScalar,
}

impl NominalAnalyticEvidence {
    pub(crate) fn to_json(&self) -> Json {
        Json::object([
            ("profile", Json::string(NOMINAL_ANALYTIC_PROFILE)),
            (
                "operand",
                Json::string("associated-placed-ap242-raw-support"),
            ),
            ("cosineSquared", self.cosine_squared.to_json()),
            (
                "distanceSquared",
                self.distance_squared
                    .as_ref()
                    .map_or(Json::Null, ExactScalar::to_json),
            ),
            ("lowerDegrees", self.lower_degrees.to_json()),
            ("upperDegrees", self.upper_degrees.to_json()),
            (
                "angularAlgorithm",
                Json::string("exact-special-angles-or-directed-machin32-10-cos24-fixed128"),
            ),
            ("distanceUnit", Json::string("mm^2")),
            ("displayRole", Json::string("diagnostic-only")),
        ])
    }
}

pub(crate) fn nominal_analytic(
    request: NominalAnalyticRequest,
) -> Outcome<NominalAnalyticEvidence> {
    match evaluate(request) {
        Ok((positive, evidence)) => Outcome::Decided { positive, evidence },
        Err(reason) => Outcome::Unsupported {
            reason,
            evidence: None,
        },
    }
}

fn stored(value: Rat) -> Result<Rat, ContinuousError> {
    if value.numer().bits() > STORED_BITS || value.denom().bits() > STORED_BITS {
        return Err(ContinuousError::resource(
            "Nominal analytic retained arithmetic exceeds 2048 bits.",
        ));
    }
    // Clone normalized limbs, not a preceding operation's unreduced capacity.
    Ok(value.clone())
}
fn rat(v: f64) -> Result<Rat, ContinuousError> {
    stored(exact::rational(v)?)
}
fn add(a: &Rat, b: &Rat) -> Result<Rat, ContinuousError> {
    stored(exact::add(a, b)?)
}
fn sub(a: &Rat, b: &Rat) -> Result<Rat, ContinuousError> {
    stored(exact::subtract(a, b)?)
}
fn mul(a: &Rat, b: &Rat) -> Result<Rat, ContinuousError> {
    stored(exact::multiply(a, b)?)
}
fn div(a: &Rat, b: &Rat) -> Result<Rat, ContinuousError> {
    stored(exact::divide(a, b)?)
}
fn square(a: &Rat) -> Result<Rat, ContinuousError> {
    mul(a, a)
}
fn vector(v: [f64; 3]) -> Result<[Rat; 3], ContinuousError> {
    Ok([rat(v[0])?, rat(v[1])?, rat(v[2])?])
}
fn dot(a: &[Rat; 3], b: &[Rat; 3]) -> Result<Rat, ContinuousError> {
    let mut sum = Rat::zero();
    for i in 0..3 {
        sum = add(&sum, &mul(&a[i], &b[i])?)?;
    }
    Ok(sum)
}

fn evaluate(r: NominalAnalyticRequest) -> Result<(bool, NominalAnalyticEvidence), ContinuousError> {
    let tolerance = rat(r.tolerance)?;
    let angle = rat(r.angle_degrees)?;
    let angular = rat(r.angular_tolerance_degrees)?;
    if tolerance.is_negative() || angular.is_negative() {
        return Err(ContinuousError::invalid(
            "Nominal analytic tolerances must be nonnegative.",
        ));
    }
    let a = vector(r.subject.direction)?;
    let b = vector(r.target.direction)?;
    let ao = vector(r.subject.origin)?;
    let bo = vector(r.target.origin)?;
    let aa = dot(&a, &a)?;
    let bb = dot(&b, &b)?;
    if aa.is_zero() || bb.is_zero() {
        return Err(ContinuousError::invalid(
            "Nominal analytic directions must be nonzero.",
        ));
    }
    let ab = dot(&a, &b)?;
    let q = div(&square(&ab)?, &mul(&aa, &bb)?)?;
    let lo = sub(&angle, &angular)?.max(Rat::zero());
    let hi = add(&angle, &angular)?.min(Rat::from_integer(90.into()));
    let angular_pass = if lo > hi {
        false
    } else {
        in_angle_band(&q, &lo, &hi)?
    };
    let mut distance = None;
    let positive = match r.kind {
        AnalyticKind::Direction => angular_pass,
        AnalyticKind::Axis | AnalyticKind::Plane => {
            let required = if matches!(r.kind, AnalyticKind::Axis) {
                SupportKind::Axis
            } else {
                SupportKind::Plane
            };
            if r.subject.kind != required || r.target.kind != required {
                return Err(ContinuousError::unsupported(
                    "The selected raw support kind does not match the analytic relationship.",
                ));
            }
            if matches!(r.kind, AnalyticKind::Plane) && q != Rat::one() {
                if angular_pass {
                    return Err(ContinuousError::unsupported(
                        "Nonparallel coplanar distance has no adopted nominal metric.",
                    ));
                }
                false
            } else {
                let w = [
                    sub(&bo[0], &ao[0])?,
                    sub(&bo[1], &ao[1])?,
                    sub(&bo[2], &ao[2])?,
                ];
                let axial = div(&square(&dot(&w, &a)?)?, &aa)?;
                let d = if matches!(r.kind, AnalyticKind::Axis) {
                    sub(&dot(&w, &w)?, &axial)?
                } else {
                    axial
                };
                let inside = d <= square(&tolerance)?;
                distance = Some(exact::scalar(&d)?);
                angular_pass && inside
            }
        }
    };
    Ok((
        positive,
        NominalAnalyticEvidence {
            cosine_squared: exact::scalar(&q)?,
            distance_squared: distance,
            lower_degrees: exact::scalar(&lo)?,
            upper_degrees: exact::scalar(&hi)?,
        },
    ))
}

fn in_angle_band(q: &Rat, lo: &Rat, hi: &Rat) -> Result<bool, ContinuousError> {
    let lower = cosine_squared(hi)?;
    let upper = cosine_squared(lo)?;
    if q < &lower.0 || q > &upper.1 {
        return Ok(false);
    }
    if q >= &lower.1 && q <= &upper.0 {
        return Ok(true);
    }
    Err(ContinuousError::unsupported(
        "The exact squared cosine overlaps a directed angular boundary enclosure.",
    ))
}

fn cosine_squared(degrees: &Rat) -> Result<(Rat, Rat), ContinuousError> {
    for (angle, numerator, denominator) in
        [(0, 1, 1), (30, 3, 4), (45, 1, 2), (60, 1, 4), (90, 0, 1)]
    {
        if degrees == &Rat::from_integer(angle.into()) {
            let q = Rat::new(numerator.into(), denominator.into());
            return Ok((q.clone(), q));
        }
    }
    let s = BigInt::one() << FIXED_BITS;
    let (p_lo, p_hi) = pi_scaled(&s);
    let d = Rat::from_integer(180.into());
    let x_lo = div(&mul(degrees, &Rat::from_integer(p_lo))?, &d)?;
    let x_hi = div(&mul(degrees, &Rat::from_integer(p_hi))?, &d)?;
    let x_lo = x_lo.numer().div_floor(x_lo.denom());
    let x_hi = x_hi.numer().div_ceil(x_hi.denom());
    // 0<=x<=pi/2: operands <2^130, products <2^260. These
    // integer-only operations have a fixed, input-independent allocation bound.
    let z_lo = (&x_lo * &x_lo).div_floor(&s);
    let z_hi = (&x_hi * &x_hi).div_ceil(&s);
    let (mut t_lo, mut t_hi) = (s.clone(), s.clone());
    let (mut c_lo, mut c_hi) = (s.clone(), s.clone());
    for k in 1..=25 {
        let denom = &s * BigInt::from((2 * k - 1) * 2 * k);
        t_lo = (&t_lo * &z_lo).div_floor(&denom);
        t_hi = (&t_hi * &z_hi).div_ceil(&denom);
        if k == 25 {
            c_lo -= t_hi;
            break;
        }
        if k % 2 == 0 {
            c_lo += &t_lo;
            c_hi += &t_hi;
        } else {
            c_lo -= &t_hi;
            c_hi -= &t_lo;
        }
    }
    c_lo = c_lo.max(BigInt::zero()).min(s.clone());
    c_hi = c_hi.max(BigInt::zero()).min(s.clone());
    Ok((
        Rat::new((&c_lo * &c_lo).div_floor(&s), s.clone()),
        Rat::new((&c_hi * &c_hi).div_ceil(&s), s),
    ))
}

/// Alternating atan series, with directed integer rounding at scale 2^128.
/// 5^65*65 and 239^21*21 exceed 2^128; their next terms are
/// nevertheless included by a rounded bound rather than assumed zero.
fn atan_scaled(s: &BigInt, inverse: u32, terms: u32) -> (BigInt, BigInt) {
    let base = BigInt::from(inverse);
    let squared = &base * &base;
    let mut power = base;
    let (mut lo, mut hi) = (BigInt::zero(), BigInt::zero());
    for k in 0..=terms {
        let denom = &power * BigInt::from(2 * k + 1);
        let floor = s.div_floor(&denom);
        let ceil = s.div_ceil(&denom);
        if k == terms {
            if k % 2 == 0 {
                hi += ceil;
            } else {
                lo -= ceil;
            }
            break;
        }
        if k % 2 == 0 {
            lo += floor;
            hi += ceil;
        } else {
            lo -= ceil;
            hi -= floor;
        }
        power *= &squared;
    }
    (lo, hi)
}
fn pi_scaled(s: &BigInt) -> (BigInt, BigInt) {
    let (a, b) = atan_scaled(s, 5, 32);
    let (c, d) = atan_scaled(s, 239, 10);
    (16 * a - 4 * d, 16 * b - 4 * c)
}

#[cfg(test)]
#[path = "nominal_analytic_tests.rs"]
mod nominal_analytic_tests;
