//! Retained mesh records and neutral selector analysis owned by the Rust core.

pub(crate) mod batch;
pub(crate) mod interference;
pub(crate) mod mesh;
pub(crate) mod selection;
pub(crate) mod voids;

// Adapted from V8 FastMathHypot (three arguments), Node v24.10.0
// commit 9b72b88f4c4565687e3a8c4d8e1232f63a501e15, deps/v8/src/builtins/math.tq.
// Copyright 2019 the V8 project authors. BSD-3-Clause; retain the V8 notice.
pub(crate) fn node24_hypot3([x, y, z]: [f64; 3]) -> f64 {
    let a = x.abs();
    let b = y.abs();
    let c = z.abs();
    if a.is_infinite() || b.is_infinite() || c.is_infinite() {
        return f64::INFINITY;
    }
    if a.is_nan() || b.is_nan() || c.is_nan() {
        return f64::NAN;
    }

    let max = a.max(b).max(c);
    if max == 0.0 {
        return 0.0;
    }

    let power_a = (a / max) * (a / max);
    let power_b = (b / max) * (b / max);
    let compensation = (power_a + power_b) - power_a - power_b;
    let power_c = (c / max) * (c / max) - compensation;
    (power_a + power_b + power_c).sqrt() * max
}
