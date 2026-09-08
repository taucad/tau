// Copyright 2026 Lars Brubaker
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

// Phase 9: SVD — ported from cpp-reference/manifold/src/svd.h

use crate::linalg::{dot, Mat3, Vec3, Vec4};

const GAMMA: f64 = 5.82842712474619;
const C_STAR: f64 = 0.9238795325112867;
const S_STAR: f64 = 0.3826834323650898;
const SVD_EPSILON: f64 = 1e-6;
const JACOBI_STEPS: usize = 12;

#[inline]
fn cond_swap(c: bool, x: &mut f64, y: &mut f64) {
    if c {
        std::mem::swap(x, y);
    }
}

#[inline]
fn cond_neg_swap(c: bool, x: &mut f64, y: &mut f64) {
    if c {
        let z = -*x;
        *x = *y;
        *y = z;
    }
}

#[inline]
fn cond_neg_swap_vec3(c: bool, x: &mut Vec3, y: &mut Vec3) {
    cond_neg_swap(c, &mut x.x, &mut y.x);
    cond_neg_swap(c, &mut x.y, &mut y.y);
    cond_neg_swap(c, &mut x.z, &mut y.z);
}

#[derive(Clone, Copy, Debug)]
struct Symmetric3x3 {
    m_00: f64,
    m_10: f64,
    m_11: f64,
    m_20: f64,
    m_21: f64,
    m_22: f64,
}

impl From<Mat3> for Symmetric3x3 {
    fn from(m: Mat3) -> Self {
        Self {
            m_00: m[0][0],
            m_10: m[0][1],
            m_11: m[1][1],
            m_20: m[0][2],
            m_21: m[1][2],
            m_22: m[2][2],
        }
    }
}

#[derive(Clone, Copy, Debug)]
struct Givens {
    ch: f64,
    sh: f64,
}

#[derive(Clone, Copy, Debug)]
struct QR {
    q: Mat3,
    r: Mat3,
}

#[inline]
fn dist2(v: Vec3) -> f64 {
    dot(v, v)
}

fn approximate_givens_quaternion(a: Symmetric3x3) -> Givens {
    let g = Givens {
        ch: 2.0 * (a.m_00 - a.m_11),
        sh: a.m_10,
    };
    let mut b = GAMMA * g.sh * g.sh < g.ch * g.ch;
    // Per C++ #1681: use sqrt(a*a + b*b) instead of hypot. hypot is not
    // required to be correctly-rounded (IEEE 754 §9.2), so libms may round
    // it differently; *, +, and sqrt are correctly-rounded, giving bit-exact
    // cross-platform results inside SVD's iterative reductions.
    let w = 1.0 / (g.ch * g.ch + g.sh * g.sh).sqrt();
    if !w.is_finite() {
        b = false;
    }
    Givens {
        ch: if b { w * g.ch } else { C_STAR },
        sh: if b { w * g.sh } else { S_STAR },
    }
}

fn jacobi_conjugation(x: usize, y: usize, z: usize, s: &mut Symmetric3x3, q: &mut Vec4) {
    let mut g = approximate_givens_quaternion(*s);
    let scale = 1.0 / (g.ch * g.ch + g.sh * g.sh);
    let a = (g.ch * g.ch - g.sh * g.sh) * scale;
    let b = 2.0 * g.sh * g.ch * scale;
    let old = *s;

    s.m_00 = a * (a * old.m_00 + b * old.m_10) + b * (a * old.m_10 + b * old.m_11);
    s.m_10 = a * (-b * old.m_00 + a * old.m_10) + b * (-b * old.m_10 + a * old.m_11);
    s.m_11 = -b * (-b * old.m_00 + a * old.m_10) + a * (-b * old.m_10 + a * old.m_11);
    s.m_20 = a * old.m_20 + b * old.m_21;
    s.m_21 = -b * old.m_20 + a * old.m_21;
    s.m_22 = old.m_22;

    let tmp = Vec3::new(g.sh * q.x, g.sh * q.y, g.sh * q.z);
    g.sh *= q.w;
    q[z] = q[z] * g.ch + g.sh;
    q.w = q.w * g.ch - tmp[z];
    q[x] = q[x] * g.ch + tmp[y];
    q[y] = q[y] * g.ch - tmp[x];

    let permuted = Symmetric3x3 {
        m_00: s.m_11,
        m_10: s.m_21,
        m_11: s.m_22,
        m_20: s.m_10,
        m_21: s.m_20,
        m_22: s.m_00,
    };
    *s = permuted;
}

fn jacobi_eigen_analysis(s: Symmetric3x3) -> Mat3 {
    let mut s = s;
    let mut q = Vec4::new(0.0, 0.0, 0.0, 1.0);
    for _ in 0..JACOBI_STEPS {
        jacobi_conjugation(0, 1, 2, &mut s, &mut q);
        jacobi_conjugation(1, 2, 0, &mut s, &mut q);
        jacobi_conjugation(2, 0, 1, &mut s, &mut q);
    }

    Mat3::from_cols(
        Vec3::new(
            1.0 - 2.0 * (q.y * q.y + q.z * q.z),
            2.0 * (q.x * q.y - q.w * q.z),
            2.0 * (q.x * q.z + q.w * q.y),
        ),
        Vec3::new(
            2.0 * (q.x * q.y + q.w * q.z),
            1.0 - 2.0 * (q.x * q.x + q.z * q.z),
            2.0 * (q.y * q.z - q.w * q.x),
        ),
        Vec3::new(
            2.0 * (q.x * q.z - q.w * q.y),
            2.0 * (q.y * q.z + q.w * q.x),
            1.0 - 2.0 * (q.x * q.x + q.y * q.y),
        ),
    )
}

fn sort_singular_values(b: &mut Mat3, v: &mut Mat3) {
    let mut rho1 = dist2(b.x);
    let mut rho2 = dist2(b.y);
    let mut rho3 = dist2(b.z);

    let c = rho1 < rho2;
    cond_neg_swap_vec3(c, &mut b.x, &mut b.y);
    cond_neg_swap_vec3(c, &mut v.x, &mut v.y);
    cond_swap(c, &mut rho1, &mut rho2);

    let c = rho1 < rho3;
    cond_neg_swap_vec3(c, &mut b.x, &mut b.z);
    cond_neg_swap_vec3(c, &mut v.x, &mut v.z);
    cond_swap(c, &mut rho1, &mut rho3);

    let c = rho2 < rho3;
    cond_neg_swap_vec3(c, &mut b.y, &mut b.z);
    cond_neg_swap_vec3(c, &mut v.y, &mut v.z);
    cond_swap(c, &mut rho2, &mut rho3);
}

fn qr_givens_quaternion(a1: f64, a2: f64) -> Givens {
    // Per C++ #1681: sqrt(a*a + b*b) instead of hypot for cross-platform
    // bit-exactness (see approximate_givens_quaternion).
    let rho = (a1 * a1 + a2 * a2).sqrt();
    let mut g = Givens {
        ch: a1.abs() + rho.max(SVD_EPSILON),
        sh: if rho > SVD_EPSILON { a2 } else { 0.0 },
    };
    let b = a1 < 0.0;
    cond_swap(b, &mut g.sh, &mut g.ch);
    // Per C++ #1681: use sqrt(a*a + b*b) instead of hypot. hypot is not
    // required to be correctly-rounded (IEEE 754 §9.2), so libms may round
    // it differently; *, +, and sqrt are correctly-rounded, giving bit-exact
    // cross-platform results inside SVD's iterative reductions.
    let w = 1.0 / (g.ch * g.ch + g.sh * g.sh).sqrt();
    g.ch *= w;
    g.sh *= w;
    g
}

fn qr_decomposition(b: &mut Mat3) -> QR {
    let mut q = Mat3::default();
    let mut r = Mat3::default();

    let g1 = qr_givens_quaternion(b[0][0], b[0][1]);
    let mut a = -2.0 * g1.sh * g1.sh + 1.0;
    let mut bb = 2.0 * g1.ch * g1.sh;

    r[0][0] = a * b[0][0] + bb * b[0][1];
    r[1][0] = a * b[1][0] + bb * b[1][1];
    r[2][0] = a * b[2][0] + bb * b[2][1];
    r[0][1] = -bb * b[0][0] + a * b[0][1];
    r[1][1] = -bb * b[1][0] + a * b[1][1];
    r[2][1] = -bb * b[2][0] + a * b[2][1];
    r[0][2] = b[0][2];
    r[1][2] = b[1][2];
    r[2][2] = b[2][2];

    let g2 = qr_givens_quaternion(r[0][0], r[0][2]);
    a = -2.0 * g2.sh * g2.sh + 1.0;
    bb = 2.0 * g2.ch * g2.sh;

    b[0][0] = a * r[0][0] + bb * r[0][2];
    b[1][0] = a * r[1][0] + bb * r[1][2];
    b[2][0] = a * r[2][0] + bb * r[2][2];
    b[0][1] = r[0][1];
    b[1][1] = r[1][1];
    b[2][1] = r[2][1];
    b[0][2] = -bb * r[0][0] + a * r[0][2];
    b[1][2] = -bb * r[1][0] + a * r[1][2];
    b[2][2] = -bb * r[2][0] + a * r[2][2];

    let g3 = qr_givens_quaternion(b[1][1], b[1][2]);
    a = -2.0 * g3.sh * g3.sh + 1.0;
    bb = 2.0 * g3.ch * g3.sh;

    r[0][0] = b[0][0];
    r[1][0] = b[1][0];
    r[2][0] = b[2][0];
    r[0][1] = a * b[0][1] + bb * b[0][2];
    r[1][1] = a * b[1][1] + bb * b[1][2];
    r[2][1] = a * b[2][1] + bb * b[2][2];
    r[0][2] = -bb * b[0][1] + a * b[0][2];
    r[1][2] = -bb * b[1][1] + a * b[1][2];
    r[2][2] = -bb * b[2][1] + a * b[2][2];

    let sh12 = 2.0 * (g1.sh * g1.sh - 0.5);
    let sh22 = 2.0 * (g2.sh * g2.sh - 0.5);
    let sh32 = 2.0 * (g3.sh * g3.sh - 0.5);

    q[0][0] = sh12 * sh22;
    q[1][0] = 4.0 * g2.ch * g3.ch * sh12 * g2.sh * g3.sh + 2.0 * g1.ch * g1.sh * sh32;
    q[2][0] = 4.0 * g1.ch * g3.ch * g1.sh * g3.sh - 2.0 * g2.ch * sh12 * g2.sh * sh32;

    q[0][1] = -2.0 * g1.ch * g1.sh * sh22;
    q[1][1] = -8.0 * g1.ch * g2.ch * g3.ch * g1.sh * g2.sh * g3.sh + sh12 * sh32;
    q[2][1] =
        -2.0 * g3.ch * g3.sh + 4.0 * g1.sh * (g3.ch * g1.sh * g3.sh + g1.ch * g2.ch * g2.sh * sh32);

    q[0][2] = 2.0 * g2.ch * g2.sh;
    q[1][2] = -2.0 * g3.ch * sh22 * g3.sh;
    q[2][2] = sh22 * sh32;

    QR { q, r }
}

#[derive(Clone, Copy, Debug)]
pub struct SVDSet {
    pub u: Mat3,
    pub s: Mat3,
    pub v: Mat3,
}

pub fn svd(a: Mat3) -> SVDSet {
    let mut v = jacobi_eigen_analysis(Symmetric3x3::from(a.transpose() * a));
    let mut b = a * v;
    sort_singular_values(&mut b, &mut v);
    let qr = qr_decomposition(&mut b);
    SVDSet {
        u: qr.q,
        s: qr.r,
        v,
    }
}

pub fn spectral_norm(a: Mat3) -> f64 {
    let usv = svd(a);
    usv.s[0][0]
}

#[cfg(test)]
mod tests {
    use super::*;

    fn approx_eq(a: f64, b: f64) -> bool {
        (a - b).abs() < 1e-8
    }

    fn approx_vec3(a: Vec3, b: Vec3) -> bool {
        approx_eq(a.x, b.x) && approx_eq(a.y, b.y) && approx_eq(a.z, b.z)
    }

    #[test]
    fn test_svd_identity() {
        let out = svd(Mat3::identity());
        assert!(approx_vec3(out.s.x, Vec3::new(1.0, 0.0, 0.0)));
        assert!(approx_vec3(out.s.y, Vec3::new(0.0, 1.0, 0.0)));
        assert!(approx_vec3(out.s.z, Vec3::new(0.0, 0.0, 1.0)));
    }

    #[test]
    fn test_svd_diagonal() {
        let a = Mat3::from_cols(
            Vec3::new(3.0, 0.0, 0.0),
            Vec3::new(0.0, 2.0, 0.0),
            Vec3::new(0.0, 0.0, 1.0),
        );
        let out = svd(a);
        assert!(approx_eq(out.s[0][0], 3.0));
        assert!(approx_eq(out.s[1][1], 2.0));
        assert!(approx_eq(out.s[2][2], 1.0));
    }

    #[test]
    fn test_svd_reconstruction() {
        let a = Mat3::from_cols(
            Vec3::new(1.0, 2.0, 3.0),
            Vec3::new(0.5, -1.0, 4.0),
            Vec3::new(-2.0, 0.25, 1.5),
        );
        let out = svd(a);
        let reconstructed = out.u * out.s * out.v.transpose();
        for col in 0..3 {
            for row in 0..3 {
                assert!(
                    approx_eq(reconstructed[col][row], a[col][row]),
                    "mismatch at ({}, {}): {} vs {}",
                    col,
                    row,
                    reconstructed[col][row],
                    a[col][row]
                );
            }
        }
    }

    #[test]
    fn test_spectral_norm() {
        let a = Mat3::from_cols(
            Vec3::new(4.0, 0.0, 0.0),
            Vec3::new(0.0, 2.0, 0.0),
            Vec3::new(0.0, 0.0, 1.0),
        );
        assert!(approx_eq(spectral_norm(a), 4.0));
    }

    #[test]
    fn test_singular_values_sorted() {
        let a = Mat3::from_cols(
            Vec3::new(1.0, 0.0, 0.0),
            Vec3::new(0.0, 5.0, 0.0),
            Vec3::new(0.0, 0.0, 3.0),
        );
        let out = svd(a);
        assert!(out.s[0][0].abs() >= out.s[1][1].abs());
        assert!(out.s[1][1].abs() >= out.s[2][2].abs());
    }
}
