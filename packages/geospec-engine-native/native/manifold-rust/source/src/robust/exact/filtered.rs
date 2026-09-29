// robust/exact/filtered.rs — Float entry points for the exact predicates.
//
// Each predicate first evaluates the determinant in plain f64 together with
// a "permanent" (the same expression with every subtraction replaced by
// addition of absolute values). Shewchuk's static error-bound analysis
// ("Adaptive Precision Floating-Point Arithmetic and Fast Robust Geometric
// Predicates", 1997) shows the f64 sign is certain whenever
// |det| > errboundA * permanent; otherwise orient2d/orient3d escalate to the
// exact integer evaluation in robust/exact/intpred.rs (degenerate-heavy
// meshes make this tier hot) and incircle to the Rational evaluation in
// robust/exact/predicates.rs. Unlike Shewchuk we skip the adaptive
// intermediate stages — exact integer evaluation is cheap enough that
// simplicity wins.
//
// The classic bounds assume no underflow/overflow, so any permanent that is
// subnormal, zero, or non-finite also escalates to the exact path.

use crate::linalg::{Vec2, Vec3};

use super::predicates::incircle_r;
use super::rational::R2;
use super::Sign;

const EPS: f64 = f64::EPSILON * 0.5; // 2^-53, Shewchuk's machine epsilon
const CCW_ERRBOUND_A: f64 = (3.0 + 16.0 * EPS) * EPS;
const O3D_ERRBOUND_A: f64 = (7.0 + 56.0 * EPS) * EPS;
const ICC_ERRBOUND_A: f64 = (10.0 + 96.0 * EPS) * EPS;

/// True when the filter comparison itself is trustworthy: a normal, finite
/// permanent. Subnormal permanents can hide underflowed terms whose error is
/// not covered by the static bound; infinite ones mean the f64 det overflowed.
#[inline]
fn permanent_ok(permanent: f64) -> bool {
    permanent >= f64::MIN_POSITIVE && permanent.is_finite()
}

/// The float filter behind [`orient2d`]: `Some(sign)` when the static error
/// bound certifies the f64 determinant's sign, `None` when the caller must
/// escalate to the exact tier. Split out from `orient2d` so tests can measure
/// the filter's hit rate from return values on their own inputs, rather than
/// from process-global counters that concurrently running tests would pollute.
#[inline]
pub(super) fn orient2d_filter(a: Vec2, b: Vec2, c: Vec2) -> Option<Sign> {
    let detleft = (a.x - c.x) * (b.y - c.y);
    let detright = (a.y - c.y) * (b.x - c.x);
    let det = detleft - detright;
    let permanent = detleft.abs() + detright.abs();
    if permanent_ok(permanent) && det.abs() > CCW_ERRBOUND_A * permanent {
        return Some(Sign::of_f64(det));
    }
    None
}

/// Sign of cross(b-a, c-a); Pos ⇔ a,b,c counterclockwise. Exact.
pub fn orient2d(a: Vec2, b: Vec2, c: Vec2) -> Sign {
    if let Some(sign) = orient2d_filter(a, b, c) {
        return sign;
    }
    super::intpred::orient2d_i([a.x, a.y], [b.x, b.y], [c.x, c.y])
}

/// The float filter behind [`orient3d`]; see [`orient2d_filter`] for why it is
/// a separate, `Option`-returning function.
#[inline]
pub(super) fn orient3d_filter(a: Vec3, b: Vec3, c: Vec3, d: Vec3) -> Option<Sign> {
    let ux = b.x - a.x;
    let uy = b.y - a.y;
    let uz = b.z - a.z;
    let vx = c.x - a.x;
    let vy = c.y - a.y;
    let vz = c.z - a.z;
    let wx = d.x - a.x;
    let wy = d.y - a.y;
    let wz = d.z - a.z;

    let vywz = vy * wz;
    let vzwy = vz * wy;
    let vzwx = vz * wx;
    let vxwz = vx * wz;
    let vxwy = vx * wy;
    let vywx = vy * wx;

    let det = ux * (vywz - vzwy) + uy * (vzwx - vxwz) + uz * (vxwy - vywx);
    let permanent = (vywz.abs() + vzwy.abs()) * ux.abs()
        + (vzwx.abs() + vxwz.abs()) * uy.abs()
        + (vxwy.abs() + vywx.abs()) * uz.abs();
    if permanent_ok(permanent) && det.abs() > O3D_ERRBOUND_A * permanent {
        return Some(Sign::of_f64(det));
    }
    None
}

/// Sign of dot(cross(b-a, c-a), d-a); Pos ⇔ d on the CCW-normal side of
/// plane(a,b,c), Zero ⇔ coplanar. Exact.
pub fn orient3d(a: Vec3, b: Vec3, c: Vec3, d: Vec3) -> Sign {
    if let Some(sign) = orient3d_filter(a, b, c, d) {
        return sign;
    }
    super::intpred::orient3d_i(
        [a.x, a.y, a.z],
        [b.x, b.y, b.z],
        [c.x, c.y, c.z],
        [d.x, d.y, d.z],
    )
}

/// Incircle test; with a,b,c CCW: Pos ⇔ d strictly inside the circumcircle
/// of (a,b,c). Exact.
pub fn incircle(a: Vec2, b: Vec2, c: Vec2, d: Vec2) -> Sign {
    let adx = a.x - d.x;
    let ady = a.y - d.y;
    let bdx = b.x - d.x;
    let bdy = b.y - d.y;
    let cdx = c.x - d.x;
    let cdy = c.y - d.y;

    let bdxcdy = bdx * cdy;
    let cdxbdy = cdx * bdy;
    let alift = adx * adx + ady * ady;

    let cdxady = cdx * ady;
    let adxcdy = adx * cdy;
    let blift = bdx * bdx + bdy * bdy;

    let adxbdy = adx * bdy;
    let bdxady = bdx * ady;
    let clift = cdx * cdx + cdy * cdy;

    let det = alift * (bdxcdy - cdxbdy) + blift * (cdxady - adxcdy) + clift * (adxbdy - bdxady);
    let permanent = (bdxcdy.abs() + cdxbdy.abs()) * alift
        + (cdxady.abs() + adxcdy.abs()) * blift
        + (adxbdy.abs() + bdxady.abs()) * clift;
    if permanent_ok(permanent) && det.abs() > ICC_ERRBOUND_A * permanent {
        return Sign::of_f64(det);
    }
    incircle_r(
        &R2::from_vec2(a),
        &R2::from_vec2(b),
        &R2::from_vec2(c),
        &R2::from_vec2(d),
    )
}
