//! A complete-material enclosure, never an overlap estimate.
//! Only an upper bound on cylinder \ bore inside the certified slab is used:
//! removals from the housing cannot invalidate [0,U].
use super::{exact, ContinuousError, ExactScalar};
use crate::{
    backend::brep::NominalCylindricalBand,
    budget::{Budget, BudgetExceeded},
    codec::Json,
};
use num_bigint::BigInt;
use num_rational::BigRational as R;
use num_traits::{One, Signed, Zero};

// Streamed endpoint sums: <=128 retained rational slots (2048 bits each),
// <=64 guarded arithmetic scratch slots (8192 bits each), source/output JSON.
pub(crate) const RESERVATION_BYTES: usize = 512 * 1024;
pub(crate) enum Error {
    Domain(ContinuousError),
    Budget(BudgetExceeded),
}
impl From<ContinuousError> for Error {
    fn from(value: ContinuousError) -> Self {
        Self::Domain(value)
    }
}
pub(crate) struct Bound {
    pub upper: ExactScalar,
    pub panels: usize,
}
impl Bound {
    pub(crate) fn to_json(&self) -> Json {
        Json::object([
            (
                "profile",
                Json::string("nominal-bore-slab-material-upper-v1"),
            ),
            ("assurance", Json::string("inclusive-directed-upper-bound")),
            ("volumeUnit", Json::string("mm^3")),
            ("lower", Json::Number(0.0)),
            ("upper", self.upper.to_json()),
            ("panels", Json::Number(self.panels as f64)),
            (
                "lowerMeaning",
                Json::string("nonnegative actual material volume; no envelope lower claim"),
            ),
        ])
    }
}
fn store(value: R) -> Result<R, ContinuousError> {
    if value.numer().bits() > 2048 || value.denom().bits() > 2048 {
        return Err(ContinuousError::arithmetic(
            "Bore-slab bound exceeds its 2048-bit retained-slot guard.",
        ));
    }
    Ok(value)
}
fn add(a: &R, b: &R) -> Result<R, ContinuousError> {
    store(exact::add(a, b)?)
}
fn sub(a: &R, b: &R) -> Result<R, ContinuousError> {
    store(exact::subtract(a, b)?)
}
fn mul(a: &R, b: &R) -> Result<R, ContinuousError> {
    store(exact::multiply(a, b)?)
}
fn div(a: &R, b: &R) -> Result<R, ContinuousError> {
    store(exact::divide(a, b)?)
}
fn q(x: f64) -> Result<R, ContinuousError> {
    store(exact::rational(x)?)
}
fn square(x: &R) -> Result<R, ContinuousError> {
    mul(x, x)
}
fn no() -> ContinuousError {
    ContinuousError::unsupported(
        "Complete materials are outside the bounded two-lobe monotone bore-slab domain.",
    )
}

// Fixed precision is a directed enclosure, not a tolerance. The integer sqrt
// is certified by both exact square comparisons; input/allocation sizes are
// guarded before shifting. Roots are charged in the caller's bounded work.
fn root(value: &R) -> Result<(R, R), ContinuousError> {
    if value.is_negative() {
        return Err(no());
    }
    store(value.clone())?;
    let scale = BigInt::one() << 96_usize;
    let scaled = (value.numer() << 192_usize) / value.denom();
    let n = scaled.sqrt();
    let lo = R::new(n.clone(), scale.clone());
    let hi = R::new(n + 1, scale);
    if square(&lo)? > *value || square(&hi)? < *value {
        return Err(no());
    }
    Ok((store(lo)?, store(hi)?))
}

pub(crate) fn bound(
    bore: &NominalCylindricalBand,
    shaft: &NominalCylindricalBand,
    maximum: f64,
    budget: &Budget,
) -> Result<Bound, Error> {
    budget.charge(4096).map_err(Error::Budget)?;
    let maximum = q(maximum)?;
    if maximum.is_negative() {
        return Err(no().into());
    }
    let z = (0..3)
        .find(|&i| bore.axis[i] == 1.0 && (0..3).all(|k| k == i || bore.axis[k] == 0.0))
        .ok_or_else(no)?;
    let y = (0..3)
        .find(|&i| i != z && shaft.axis[i] != 0.0)
        .ok_or_else(no)?;
    let x = 3 - z - y;
    if shaft.axis[x] != 0.0
        || shaft.axis[z] <= 0.0
        || shaft.origin[x] != bore.origin[x]
        || !bore.transferred_reversed
        || shaft.transferred_reversed
    {
        return Err(no().into());
    }
    let two = q(2.0)?;
    let r = q(shaft.radius)?;
    let radius = q(bore.radius)?;
    let h = div(&sub(&q(shaft.to)?, &q(shaft.from)?)?, &two)?;
    let height = div(&sub(&q(bore.to)?, &q(bore.from)?)?, &two)?;
    if r <= R::zero() || radius <= r || h <= R::zero() || h != height {
        return Err(no().into());
    }
    let ay = q(shaft.axis[y])?;
    let az = q(shaft.axis[z])?;
    let (nl, nh) = root(&add(&square(&ay)?, &square(&az)?)?)?;
    if nl <= R::zero() {
        return Err(no().into());
    }
    let sl = div(&ay.abs(), &nh)?;
    let sh = div(&ay.abs(), &nl)?;
    let cl = div(&az, &nh)?;
    let ch = div(&az, &nl)?;
    let mid = div(&add(&q(shaft.from)?, &q(shaft.to)?)?, &two)?;
    let bm = div(&add(&q(bore.from)?, &q(bore.to)?)?, &two)?;
    // Keep the imported offset. Interval multiplication handles either sign
    // of the axial midpoint and raw tilt; only its conservative magnitude
    // enters the symmetric two-lobe upper enclosure.
    let offset = |coordinate: usize, low: &R, high: &R| -> Result<R, ContinuousError> {
        let a = mul(low, &mid)?;
        let b = mul(high, &mid)?;
        let base = sub(&q(shaft.origin[coordinate])?, &q(bore.origin[coordinate])?)?;
        let base = if coordinate == z {
            sub(&base, &bm)?
        } else {
            base
        };
        Ok(add(&base, &a)?.abs().max(add(&base, &b)?.abs()))
    };
    let yl = div(&ay, &nh)?;
    let yh = div(&ay, &nl)?;
    let ey = offset(y, &yl, &yh)?;
    let ez = offset(z, &cl, &ch)?;
    let r2 = square(&r)?;
    let radius2 = square(&radius)?;
    let (bmin, _) = root(&sub(&radius2, &r2)?)?;
    let margin = sub(&bmin, &ey)?;
    // Necessary sufficient-domain guards establish the same two triangular
    // section lobes throughout x in [0,r], including both end-cap clips.
    if margin <= mul(&sh, &h)?
        || add(
            &sub(&mul(&sl, &margin)?, &h)?,
            &sub(&mul(&cl, &height)?, &mul(&ch, &ez)?)?,
        )? < R::zero()
        || add(&sub(&r, &mul(&cl, &radius)?)?, &mul(&ch, &ey)?)? > mul(&sl, &sub(&height, &ez)?)?
        || mul(&square(&cl)?, &radius2)? <= r2
    {
        return Err(no().into());
    }
    let denominator = mul(&sl, &cl)?;
    // Level 2p's even left endpoints are level p's points (equal exact
    // rationals), so each refinement adds only its odd points to the carried
    // sum: the same order-free exact sum with half the certified roots.
    let mut sum = R::zero();
    for (level, panels) in [256_usize, 512, 1024, 2048, 4096, 8192]
        .into_iter()
        .enumerate()
    {
        // Includes two <=2240-bit integer roots and <=32 guarded rational
        // operations per endpoint; no data-dependent uncharged refinement.
        budget
            .charge((panels as u64) * 1024)
            .map_err(Error::Budget)?;
        let width = div(&r, &R::from_integer(BigInt::from(panels)))?;
        let (first, step) = if level == 0 { (0, 1) } else { (1, 2) };
        for i in (first..panels).step_by(step) {
            let at = mul(&width, &R::from_integer(BigInt::from(i)))?;
            let at2 = square(&at)?;
            let (_, w) = root(&sub(&r2, &at2)?)?;
            let (b, _) = root(&sub(&radius2, &at2)?)?;
            let g = sub(&add(&add(&mul(&ch, &w)?, &mul(&sh, &h)?)?, &ey)?, &b)?.max(R::zero());
            sum = add(&sum, &square(&g)?)?;
        }
        let upper = div(&mul(&mul(&two, &width)?, &sum)?, &denominator)?;
        if upper <= maximum {
            return Ok(Bound {
                upper: exact::scalar(&upper)?,
                panels,
            });
        }
    }
    Err(ContinuousError::unsupported("Certified material upper bound does not establish the requested allowance within bounded refinement.").into())
}

#[cfg(test)]
#[path = "../../../tests/interference_bound.rs"]
mod interference_bound_tests;
