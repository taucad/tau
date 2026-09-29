// Copyright 2026 The Manifold Authors.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

// Deterministic trigonometric helpers.
//
// Adapted from FreeBSD msun implementations via musl libc sources.
// These produce bit-identical results across all platforms, unlike
// the platform-dependent std::f64::sin/cos/etc.
//
// Copyright (C) 1993 by Sun Microsystems, Inc. All rights reserved.
// Developed at SunPro/SunSoft, a Sun Microsystems, Inc. business.
// Permission to use, copy, modify, and distribute this software is freely
// granted, provided that this notice is preserved.

// ---------------------------------------------------------------------------
// Bit-manipulation helpers
// ---------------------------------------------------------------------------

#[inline]
fn high_word(x: f64) -> u32 {
    (x.to_bits() >> 32) as u32
}

#[inline]
fn low_word(x: f64) -> u32 {
    x.to_bits() as u32
}

/// Replace the lower 32 bits of `x` with `low`, preserving the upper 32 bits.
#[inline]
fn with_low_word(x: f64, low: u32) -> f64 {
    let u = (x.to_bits() & 0xffff_ffff_0000_0000) | (low as u64);
    f64::from_bits(u)
}

// ---------------------------------------------------------------------------
// Kernel functions (reduced-range polynomial approximations)
// ---------------------------------------------------------------------------

/// Kernel sin for |x| in [-pi/4, pi/4], y is the tail of x.
#[inline]
fn sin_kernel(x: f64, y: f64, iy: i32) -> f64 {
    const S1: f64 = -1.66666666666666324348e-01;
    const S2: f64 = 8.33333333332248946124e-03;
    const S3: f64 = -1.98412698298579493134e-04;
    const S4: f64 = 2.75573137070700676789e-06;
    const S5: f64 = -2.50507602534068634195e-08;
    const S6: f64 = 1.58969099521155010221e-10;

    let z = x * x;
    let w = z * z;
    let r = S2 + z * (S3 + z * S4) + z * w * (S5 + z * S6);
    let v = z * x;
    if iy == 0 {
        x + v * (S1 + z * r)
    } else {
        x - ((z * (0.5 * y - v * r) - y) - v * S1)
    }
}

/// Kernel cos for |x| in [-pi/4, pi/4], y is the tail of x.
#[inline]
fn cos_kernel(x: f64, y: f64) -> f64 {
    const C1: f64 = 4.16666666666666019037e-02;
    const C2: f64 = -1.38888888888741095749e-03;
    const C3: f64 = 2.48015872894767294178e-05;
    const C4: f64 = -2.75573143513906633035e-07;
    const C5: f64 = 2.08757232129817482790e-09;
    const C6: f64 = -1.13596475577881948265e-11;

    let z = x * x;
    let w = z * z;
    let r = z * (C1 + z * (C2 + z * C3)) + w * w * (C4 + z * (C5 + z * C6));
    let hz = 0.5 * z;
    let w1 = 1.0 - hz;
    w1 + (((1.0 - w1) - hz) + (z * r - x * y))
}

/// Kernel tan for |x| in [-pi/4, pi/4]. `odd` is 1 for computing -1/tan(x).
#[inline]
fn tan_kernel(mut x: f64, mut y: f64, odd: i32) -> f64 {
    const T: [f64; 13] = [
        3.33333333333334091986e-01,
        1.33333333333201242699e-01,
        5.39682539762260521377e-02,
        2.18694882948595424599e-02,
        8.86323982359930005737e-03,
        3.59207910759131235356e-03,
        1.45620945432529025516e-03,
        5.88041240820264096874e-04,
        2.46463134818469906812e-04,
        7.81794442939557092300e-05,
        7.14072491382608190305e-05,
        -1.85586374855275456654e-05,
        2.59073051863633712884e-05,
    ];
    const PIO4: f64 = 7.85398163397448278999e-01;
    const PIO4LO: f64 = 3.06161699786838301793e-17;

    let hx = high_word(x);
    let big = (hx & 0x7fff_ffff) >= 0x3FE5_9428; // |x| >= 0.6744
    let mut sign = false;
    if big {
        sign = (hx >> 31) != 0;
        if sign {
            x = -x;
            y = -y;
        }
        x = (PIO4 - x) + (PIO4LO - y);
        y = 0.0;
    }

    let z = x * x;
    let w = z * z;
    let r = T[1] + w * (T[3] + w * (T[5] + w * (T[7] + w * (T[9] + w * T[11]))));
    let v =
        z * (T[2] + w * (T[4] + w * (T[6] + w * (T[8] + w * (T[10] + w * T[12])))));
    let s = z * x;
    let rr = y + z * (s * (r + v) + y) + s * T[0];
    let ww = x + rr;
    if big {
        let s2 = 1.0 - 2.0 * (odd as f64);
        let vv = s2 - 2.0 * (x + (rr - ww * ww / (ww + s2)));
        return if sign { -vv } else { vv };
    }
    if odd == 0 {
        return ww;
    }
    // Compute -1/(x+r) with reduced cancellation error.
    let w0 = with_low_word(ww, 0);
    let vv = rr - (w0 - x);
    let aa = -1.0 / ww;
    let a0 = with_low_word(aa, 0);
    a0 + aa * (1.0 + a0 * w0 + a0 * vv)
}

// ---------------------------------------------------------------------------
// Argument reduction: reduce x to y[0]+y[1] in [-pi/4, pi/4]
// ---------------------------------------------------------------------------

/// Reduce `x` modulo pi/2. Returns quadrant n and sets y[0], y[1] such that
/// x = n * pi/2 + y[0] + y[1] with |y[0]+y[1]| <= pi/4.
fn rem_pio2(x: f64) -> (i32, [f64; 2]) {
    const PIO2_1: f64 = 1.57079632673412561417e+00;
    const PIO2_1T: f64 = 6.07710050650619224932e-11;
    const HALF_PI: f64 = 1.57079632679489661923132169163975144;

    let ux = x.to_bits();
    let sign = (ux >> 63) != 0;
    let ix = ((ux >> 32) & 0x7fff_ffff) as u32;
    let mut y = [0.0f64; 2];

    if ix <= 0x400f_6a7a {
        // |x| ~<= 5pi/4
        if (ix & 0xf_ffff) != 0x9_21fb {
            // not near pi/2 multiples — try fast paths
            if ix <= 0x4002_d97c {
                // |x| ~<= 3pi/4
                if !sign {
                    let z = x - PIO2_1;
                    y[0] = z - PIO2_1T;
                    y[1] = (z - y[0]) - PIO2_1T;
                    return (1, y);
                }
                let z = x + PIO2_1;
                y[0] = z + PIO2_1T;
                y[1] = (z - y[0]) + PIO2_1T;
                return (-1, y);
            }
            if !sign {
                let z = x - 2.0 * PIO2_1;
                y[0] = z - 2.0 * PIO2_1T;
                y[1] = (z - y[0]) - 2.0 * PIO2_1T;
                return (2, y);
            }
            let z = x + 2.0 * PIO2_1;
            y[0] = z + 2.0 * PIO2_1T;
            y[1] = (z - y[0]) + 2.0 * PIO2_1T;
            return (-2, y);
        }
        // Fall through to "medium" path below
        return rem_pio2_medium(x, ix);
    }

    if ix <= 0x401c_463b {
        // |x| ~<= 9pi/4
        if ix <= 0x4015_fdbc {
            // |x| ~<= 7pi/4
            if ix == 0x4012_d97c {
                return rem_pio2_medium(x, ix);
            }
            if !sign {
                let z = x - 3.0 * PIO2_1;
                y[0] = z - 3.0 * PIO2_1T;
                y[1] = (z - y[0]) - 3.0 * PIO2_1T;
                return (3, y);
            }
            let z = x + 3.0 * PIO2_1;
            y[0] = z + 3.0 * PIO2_1T;
            y[1] = (z - y[0]) + 3.0 * PIO2_1T;
            return (-3, y);
        }
        if ix == 0x4019_21fb {
            return rem_pio2_medium(x, ix);
        }
        if !sign {
            let z = x - 4.0 * PIO2_1;
            y[0] = z - 4.0 * PIO2_1T;
            y[1] = (z - y[0]) - 4.0 * PIO2_1T;
            return (4, y);
        }
        let z = x + 4.0 * PIO2_1;
        y[0] = z + 4.0 * PIO2_1T;
        y[1] = (z - y[0]) + 4.0 * PIO2_1T;
        return (-4, y);
    }

    if ix < 0x4139_21fb {
        // |x| ~< 2^20*(pi/2), medium size
        return rem_pio2_medium(x, ix);
    }

    if ix >= 0x7ff0_0000 {
        // x is inf or NaN
        let v = x - x;
        y[0] = v;
        y[1] = v;
        return (0, y);
    }

    // Very large arguments: fall back to round-based reduction.
    // Rust doesn't have remquo in std, so we use the equivalent.
    let quotient = (x / HALF_PI).round();
    let q = quotient as i32;
    y[0] = x - quotient * HALF_PI;
    y[1] = 0.0;
    (q, y)
}

/// Medium-range argument reduction for rem_pio2.
fn rem_pio2_medium(x: f64, ix: u32) -> (i32, [f64; 2]) {
    const TOINT: f64 = 1.5 / f64::EPSILON;
    const PIO4: f64 = 7.85398163397448278999e-01; // 0x1.921fb54442d18p-1
    const INVPIO2: f64 = 6.36619772367581382433e-01;
    const PIO2_1: f64 = 1.57079632673412561417e+00;
    const PIO2_1T: f64 = 6.07710050650619224932e-11;
    const PIO2_2: f64 = 6.07710050630396597660e-11;
    const PIO2_2T: f64 = 2.02226624879595063154e-21;
    const PIO2_3: f64 = 2.02226624871116645580e-21;
    const PIO2_3T: f64 = 8.47842766036889956997e-32;

    let mut y = [0.0f64; 2];
    let mut fn_ = x * INVPIO2 + TOINT - TOINT;
    let mut n = fn_ as i32;
    let mut r = x - fn_ * PIO2_1;
    let mut w = fn_ * PIO2_1T;

    if r - w < -PIO4 {
        n -= 1;
        fn_ -= 1.0;
        r = x - fn_ * PIO2_1;
        w = fn_ * PIO2_1T;
    } else if r - w > PIO4 {
        n += 1;
        fn_ += 1.0;
        r = x - fn_ * PIO2_1;
        w = fn_ * PIO2_1T;
    }

    y[0] = r - w;
    let uy0 = y[0].to_bits();
    let ey = ((uy0 >> 52) & 0x7ff) as i32;
    let ex = (ix >> 20) as i32;

    if ex - ey > 16 {
        let t = r;
        w = fn_ * PIO2_2;
        r = t - w;
        w = fn_ * PIO2_2T - ((t - r) - w);
        y[0] = r - w;
        let uy0_2 = y[0].to_bits();
        let ey2 = ((uy0_2 >> 52) & 0x7ff) as i32;
        if ex - ey2 > 49 {
            let t2 = r;
            w = fn_ * PIO2_3;
            r = t2 - w;
            w = fn_ * PIO2_3T - ((t2 - r) - w);
            y[0] = r - w;
        }
    }

    y[1] = (r - y[0]) - w;
    (n, y)
}

// ---------------------------------------------------------------------------
// Public trigonometric functions
// ---------------------------------------------------------------------------

/// Deterministic sine. Produces bit-identical results on all platforms.
pub fn sin(x: f64) -> f64 {
    let ix = ((x.to_bits() >> 32) & 0x7fff_ffff) as u32;
    if ix <= 0x3fe9_21fb {
        // |x| ~<= pi/4
        if ix < 0x3e50_0000 {
            return x; // |x| < 2^-26
        }
        return sin_kernel(x, 0.0, 0);
    }
    if ix >= 0x7ff0_0000 {
        return x - x; // NaN or Inf
    }
    let (n, y) = rem_pio2(x);
    match n & 3 {
        0 => sin_kernel(y[0], y[1], 1),
        1 => cos_kernel(y[0], y[1]),
        2 => -sin_kernel(y[0], y[1], 1),
        _ => -cos_kernel(y[0], y[1]),
    }
}

/// Deterministic cosine. Produces bit-identical results on all platforms.
pub fn cos(x: f64) -> f64 {
    let ix = ((x.to_bits() >> 32) & 0x7fff_ffff) as u32;
    if ix <= 0x3fe9_21fb {
        // |x| ~<= pi/4
        if ix < 0x3e46_a09e {
            return 1.0;
        }
        return cos_kernel(x, 0.0);
    }
    if ix >= 0x7ff0_0000 {
        return x - x; // NaN or Inf
    }
    let (n, y) = rem_pio2(x);
    match n & 3 {
        0 => cos_kernel(y[0], y[1]),
        1 => -sin_kernel(y[0], y[1], 1),
        2 => -cos_kernel(y[0], y[1]),
        _ => sin_kernel(y[0], y[1], 1),
    }
}

/// Deterministic tangent. Produces bit-identical results on all platforms.
pub fn tan(x: f64) -> f64 {
    let ix = high_word(x) & 0x7fff_ffff;
    if ix <= 0x3fe9_21fb {
        // |x| ~<= pi/4
        if ix < 0x3e40_0000 {
            return x;
        }
        return tan_kernel(x, 0.0, 0);
    }
    if ix >= 0x7ff0_0000 {
        return x - x; // NaN or Inf
    }
    let (n, y) = rem_pio2(x);
    tan_kernel(y[0], y[1], n & 1)
}

/// Deterministic arccosine. Produces bit-identical results on all platforms.
pub fn acos(x: f64) -> f64 {
    const PIO2_HI: f64 = 1.57079632679489655800e+00;
    const PIO2_LO: f64 = 6.12323399573676603587e-17;
    const PS0: f64 = 1.66666666666666657415e-01;
    const PS1: f64 = -3.25565818622400915405e-01;
    const PS2: f64 = 2.01212532134862925881e-01;
    const PS3: f64 = -4.00555345006794114027e-02;
    const PS4: f64 = 7.91534994289814532176e-04;
    const PS5: f64 = 3.47933107596021167570e-05;
    const QS1: f64 = -2.40339491173441421878e+00;
    const QS2: f64 = 2.02094576023350569471e+00;
    const QS3: f64 = -6.88283971605453293030e-01;
    const QS4: f64 = 7.70381505559019352791e-02;

    #[inline]
    fn r(z: f64) -> f64 {
        let p = z * (PS0 + z * (PS1 + z * (PS2 + z * (PS3 + z * (PS4 + z * PS5)))));
        let q = 1.0 + z * (QS1 + z * (QS2 + z * (QS3 + z * QS4)));
        p / q
    }

    let xx = x.to_bits();
    let hx = (xx >> 32) as u32;
    let ix = hx & 0x7fff_ffff;

    if ix >= 0x3ff0_0000 {
        let lx = xx as u32;
        if (ix.wrapping_sub(0x3ff0_0000) | lx) == 0 {
            if (hx >> 31) != 0 {
                return 2.0 * PIO2_HI + f64::from_bits(0x3987_0000_0000_0000); // 0x1p-120
            }
            return 0.0;
        }
        return 0.0 / (x - x); // |x| > 1: NaN
    }

    if ix < 0x3fe0_0000 {
        // |x| < 0.5
        if ix <= 0x3c60_0000 {
            return PIO2_HI + f64::from_bits(0x3987_0000_0000_0000);
        }
        return PIO2_HI - (x - (PIO2_LO - x * r(x * x)));
    }

    if (hx >> 31) != 0 {
        // x < -0.5
        let z = (1.0 + x) * 0.5;
        let s = z.sqrt();
        let w = r(z) * s - PIO2_LO;
        return 2.0 * (PIO2_HI - (s + w));
    }

    // x >= 0.5
    let z = (1.0 - x) * 0.5;
    let s = z.sqrt();
    let df = f64::from_bits(s.to_bits() & 0xffff_ffff_0000_0000);
    let c = (z - df * df) / (s + df);
    let w = r(z) * s + c;
    2.0 * (df + w)
}

/// Deterministic arcsine. Produces bit-identical results on all platforms.
pub fn asin(x: f64) -> f64 {
    const HALF_PI: f64 = 1.57079632679489661923132169163975144;
    if !x.is_finite() || x < -1.0 || x > 1.0 {
        return f64::NAN;
    }
    if x == 1.0 {
        return HALF_PI;
    }
    if x == -1.0 {
        return -HALF_PI;
    }
    HALF_PI - acos(x)
}

/// Deterministic arctangent. Produces bit-identical results on all platforms.
pub fn atan(x: f64) -> f64 {
    const ATANHI: [f64; 4] = [
        4.63647609000806093515e-01,
        7.85398163397448278999e-01,
        9.82793723247329054082e-01,
        1.57079632679489655800e+00,
    ];
    const ATANLO: [f64; 4] = [
        2.26987774529616870924e-17,
        3.06161699786838301793e-17,
        1.39033110312309984516e-17,
        6.12323399573676603587e-17,
    ];
    const AT: [f64; 11] = [
        3.33333333333329318027e-01,
        -1.99999999998764832476e-01,
        1.42857142725034663711e-01,
        -1.11111104054623557880e-01,
        9.09088713343650656196e-02,
        -7.69187620504482999495e-02,
        6.66107313738753120669e-02,
        -5.83357013379057348645e-02,
        4.97687799461593236017e-02,
        -3.65315727442169155270e-02,
        1.62858201153657823623e-02,
    ];

    let mut ix = high_word(x);
    let sign = ix >> 31;
    ix &= 0x7fff_ffff;

    if ix >= 0x4410_0000 {
        // |x| >= 2^66
        if x.is_nan() {
            return x;
        }
        let z = ATANHI[3] + f64::from_bits(0x3987_0000_0000_0000); // 0x1p-120
        return if sign != 0 { -z } else { z };
    }

    let mut x = x;
    let id: i32;
    if ix < 0x3fdc_0000 {
        // |x| < 0.4375
        if ix < 0x3e40_0000 {
            return x; // |x| < 2^-27
        }
        id = -1;
    } else {
        x = x.abs();
        if ix < 0x3ff3_0000 {
            // |x| < 1.1875
            if ix < 0x3fe6_0000 {
                // 7/16 <= |x| < 11/16
                id = 0;
                x = (2.0 * x - 1.0) / (2.0 + x);
            } else {
                // 11/16 <= |x| < 19/16
                id = 1;
                x = (x - 1.0) / (x + 1.0);
            }
        } else if ix < 0x4003_8000 {
            // |x| < 2.4375
            id = 2;
            x = (x - 1.5) / (1.0 + 1.5 * x);
        } else {
            // 2.4375 <= |x| < 2^66
            id = 3;
            x = -1.0 / x;
        }
    }

    let z = x * x;
    let w = z * z;
    let s1 = z * (AT[0] + w * (AT[2] + w * (AT[4] + w * (AT[6] + w * (AT[8] + w * AT[10])))));
    let s2 = w * (AT[1] + w * (AT[3] + w * (AT[5] + w * (AT[7] + w * AT[9]))));

    if id < 0 {
        return x - x * (s1 + s2);
    }
    let zz =
        ATANHI[id as usize] - (x * (s1 + s2) - ATANLO[id as usize] - x);
    if sign != 0 {
        -zz
    } else {
        zz
    }
}

/// Deterministic atan2. Produces bit-identical results on all platforms.
pub fn atan2(y: f64, x: f64) -> f64 {
    const PI: f64 = 3.1415926535897931160E+00;
    const PI_LO: f64 = 1.2246467991473531772E-16;

    if x.is_nan() || y.is_nan() {
        return x + y;
    }

    let mut ix = high_word(x);
    let mut iy = high_word(y);
    let lx = low_word(x);
    let ly = low_word(y);

    if (ix.wrapping_sub(0x3ff0_0000) | lx) == 0 {
        return atan(y); // x = 1.0
    }

    let m = ((iy >> 31) & 1) | ((ix >> 30) & 2);
    ix &= 0x7fff_ffff;
    iy &= 0x7fff_ffff;

    if (iy | ly) == 0 {
        // y = 0
        return match m {
            0 | 1 => y,
            2 => PI,
            _ => -PI,
        };
    }
    if (ix | lx) == 0 {
        // x = 0
        return if (m & 1) != 0 { -PI / 2.0 } else { PI / 2.0 };
    }

    if ix == 0x7ff0_0000 {
        // x is inf
        if iy == 0x7ff0_0000 {
            // y is also inf
            return match m {
                0 => PI / 4.0,
                1 => -PI / 4.0,
                2 => 3.0 * PI / 4.0,
                _ => -3.0 * PI / 4.0,
            };
        }
        return match m {
            0 => 0.0,
            1 => -0.0,
            2 => PI,
            _ => -PI,
        };
    }

    if ix + (64 << 20) < iy || iy == 0x7ff0_0000 {
        // |y/x| > 2^64
        return if (m & 1) != 0 { -PI / 2.0 } else { PI / 2.0 };
    }

    let z;
    if (m & 2) != 0 && iy + (64 << 20) < ix {
        z = 0.0; // |y/x| < 2^-64 and x < 0
    } else {
        z = atan((y / x).abs());
    }

    match m {
        0 => z,
        1 => -z,
        2 => PI - (z - PI_LO),
        _ => (z - PI_LO) - PI,
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    const PI: f64 = std::f64::consts::PI;
    const FRAC_PI_2: f64 = std::f64::consts::FRAC_PI_2;
    const FRAC_PI_4: f64 = std::f64::consts::FRAC_PI_4;

    #[test]
    fn test_sin_basic() {
        assert_eq!(sin(0.0), 0.0);
        assert!((sin(FRAC_PI_2) - 1.0).abs() < 1e-15);
        assert!((sin(PI)).abs() < 1e-15);
        assert!((sin(-FRAC_PI_2) + 1.0).abs() < 1e-15);
    }

    #[test]
    fn test_cos_basic() {
        assert_eq!(cos(0.0), 1.0);
        assert!((cos(FRAC_PI_2)).abs() < 1e-15);
        assert!((cos(PI) + 1.0).abs() < 1e-15);
    }

    #[test]
    fn test_tan_basic() {
        assert_eq!(tan(0.0), 0.0);
        assert!((tan(FRAC_PI_4) - 1.0).abs() < 1e-15);
    }

    #[test]
    fn test_acos_basic() {
        assert_eq!(acos(1.0), 0.0);
        assert!((acos(0.0) - FRAC_PI_2).abs() < 1e-15);
        assert!((acos(-1.0) - PI).abs() < 1e-15);
    }

    #[test]
    fn test_asin_basic() {
        assert_eq!(asin(0.0), 0.0);
        assert!((asin(1.0) - FRAC_PI_2).abs() < 1e-15);
    }

    #[test]
    fn test_atan_basic() {
        assert_eq!(atan(0.0), 0.0);
        assert!((atan(1.0) - FRAC_PI_4).abs() < 1e-15);
    }

    #[test]
    fn test_atan2_basic() {
        assert!((atan2(1.0, 1.0) - FRAC_PI_4).abs() < 1e-15);
        assert!((atan2(0.0, 1.0)).abs() < 1e-15);
        assert!((atan2(1.0, 0.0) - FRAC_PI_2).abs() < 1e-15);
    }

    /// Compare our deterministic trig functions against Rust std for a range of values.
    /// They should agree to within a few ULP for normal inputs.
    #[test]
    fn test_agreement_with_std() {
        let test_values: Vec<f64> = (-100..=100)
            .map(|i| i as f64 * 0.1)
            .collect();

        for &v in &test_values {
            let our_sin = sin(v);
            let std_sin = v.sin();
            assert!(
                (our_sin - std_sin).abs() < 1e-12,
                "sin({v}): ours={our_sin}, std={std_sin}"
            );

            let our_cos = cos(v);
            let std_cos = v.cos();
            assert!(
                (our_cos - std_cos).abs() < 1e-12,
                "cos({v}): ours={our_cos}, std={std_cos}"
            );

            let our_tan = tan(v);
            let std_tan = v.tan();
            // tan can be very large near asymptotes; only check moderate values
            if std_tan.abs() < 1e6 {
                assert!(
                    (our_tan - std_tan).abs() < 1e-10,
                    "tan({v}): ours={our_tan}, std={std_tan}"
                );
            }
        }
    }

    #[test]
    fn test_acos_agreement_with_std() {
        for i in -100..=100 {
            let v = i as f64 * 0.01; // range [-1, 1]
            let our = acos(v);
            let std_val = v.acos();
            assert!(
                (our - std_val).abs() < 1e-14,
                "acos({v}): ours={our}, std={std_val}"
            );
        }
    }

    #[test]
    fn test_atan_agreement_with_std() {
        let test_values: Vec<f64> = (-100..=100)
            .map(|i| i as f64 * 0.1)
            .collect();
        for &v in &test_values {
            let our = atan(v);
            let std_val = v.atan();
            assert!(
                (our - std_val).abs() < 1e-14,
                "atan({v}): ours={our}, std={std_val}"
            );
        }
    }

    #[test]
    fn test_atan2_agreement_with_std() {
        let vals = [-10.0, -1.0, -0.1, 0.0, 0.1, 1.0, 10.0];
        for &y in &vals {
            for &x in &vals {
                if x == 0.0 && y == 0.0 {
                    continue;
                }
                let our = atan2(y, x);
                let std_val = y.atan2(x);
                assert!(
                    (our - std_val).abs() < 1e-14,
                    "atan2({y}, {x}): ours={our}, std={std_val}"
                );
            }
        }
    }

    #[test]
    fn test_special_values() {
        // NaN propagation
        assert!(sin(f64::NAN).is_nan());
        assert!(cos(f64::NAN).is_nan());
        assert!(tan(f64::NAN).is_nan());

        // Infinity -> NaN
        assert!(sin(f64::INFINITY).is_nan());
        assert!(cos(f64::INFINITY).is_nan());
        assert!(tan(f64::INFINITY).is_nan());
    }
}
