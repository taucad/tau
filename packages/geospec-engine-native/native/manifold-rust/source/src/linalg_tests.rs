    use super::*;

    const EPS: f64 = 1e-14;

    fn approx_eq(a: f64, b: f64) -> bool {
        (a - b).abs() < EPS
    }
    fn approx_eq3(a: Vec3, b: Vec3) -> bool {
        approx_eq(a.x, b.x) && approx_eq(a.y, b.y) && approx_eq(a.z, b.z)
    }
    fn approx_eq4(a: Vec4, b: Vec4) -> bool {
        approx_eq(a.x, b.x)
            && approx_eq(a.y, b.y)
            && approx_eq(a.z, b.z)
            && approx_eq(a.w, b.w)
    }

    // ── Vec2 ──────────────────────────────────────────────────────────────────

    #[test]
    fn test_vec2_new() {
        let v = Vec2::new(1.0, 2.0);
        assert_eq!(v.x, 1.0);
        assert_eq!(v.y, 2.0);
    }

    #[test]
    fn test_vec2_splat() {
        let v = Vec2::splat(3.0);
        assert_eq!(v, Vec2::new(3.0, 3.0));
    }

    #[test]
    fn test_vec2_ops() {
        let a = Vec2::new(1.0, 2.0);
        let b = Vec2::new(3.0, 4.0);
        assert_eq!(a + b, Vec2::new(4.0, 6.0));
        assert_eq!(b - a, Vec2::new(2.0, 2.0));
        assert_eq!(a * b, Vec2::new(3.0, 8.0)); // element-wise
        assert_eq!(a * 2.0, Vec2::new(2.0, 4.0));
        assert_eq!(2.0 * a, Vec2::new(2.0, 4.0));
        assert_eq!(-a, Vec2::new(-1.0, -2.0));
        assert_eq!(a / 2.0, Vec2::new(0.5, 1.0));
    }

    #[test]
    fn test_vec2_index() {
        let v = Vec2::new(5.0, 6.0);
        assert_eq!(v[0], 5.0);
        assert_eq!(v[1], 6.0);
    }

    #[test]
    fn test_vec2_ordering() {
        let a = Vec2::new(1.0, 2.0);
        let b = Vec2::new(1.0, 3.0);
        let c = Vec2::new(2.0, 0.0);
        assert!(a < b); // same x, y differs
        assert!(b < c); // x differs
        assert!(a == a);
    }

    #[test]
    fn test_cross2() {
        // cross({1,0}, {0,1}) = 1
        assert_eq!(cross2(Vec2::new(1.0, 0.0), Vec2::new(0.0, 1.0)), 1.0);
        // cross({1,0}, {1,0}) = 0
        assert_eq!(cross2(Vec2::new(1.0, 0.0), Vec2::new(1.0, 0.0)), 0.0);
    }

    #[test]
    fn test_dot2() {
        assert_eq!(dot2(Vec2::new(1.0, 2.0), Vec2::new(3.0, 4.0)), 11.0);
    }

    // ── Vec3 ──────────────────────────────────────────────────────────────────

    #[test]
    fn test_vec3_new() {
        let v = Vec3::new(1.0, 2.0, 3.0);
        assert_eq!(v.x, 1.0);
        assert_eq!(v.y, 2.0);
        assert_eq!(v.z, 3.0);
    }

    #[test]
    fn test_vec3_ops() {
        let a = Vec3::new(1.0, 2.0, 3.0);
        let b = Vec3::new(4.0, 5.0, 6.0);
        assert_eq!(a + b, Vec3::new(5.0, 7.0, 9.0));
        assert_eq!(b - a, Vec3::new(3.0, 3.0, 3.0));
        assert_eq!(a * 2.0, Vec3::new(2.0, 4.0, 6.0));
        assert_eq!(-a, Vec3::new(-1.0, -2.0, -3.0));
    }

    #[test]
    fn test_dot3() {
        assert_eq!(dot(Vec3::new(1.0, 2.0, 3.0), Vec3::new(4.0, 5.0, 6.0)), 32.0);
    }

    #[test]
    fn test_cross3() {
        let a = Vec3::new(1.0, 0.0, 0.0);
        let b = Vec3::new(0.0, 1.0, 0.0);
        let c = cross(a, b);
        assert_eq!(c, Vec3::new(0.0, 0.0, 1.0));

        let x = cross(Vec3::new(0.0, 1.0, 0.0), Vec3::new(0.0, 0.0, 1.0));
        assert_eq!(x, Vec3::new(1.0, 0.0, 0.0));
    }

    #[test]
    fn test_length3() {
        let v = Vec3::new(3.0, 4.0, 0.0);
        assert_eq!(length(v), 5.0);
        assert_eq!(length2(v), 25.0);
    }

    #[test]
    fn test_normalize3() {
        let v = Vec3::new(3.0, 0.0, 0.0);
        let n = normalize(v);
        assert!(approx_eq3(n, Vec3::new(1.0, 0.0, 0.0)));
        assert!(approx_eq(length(n), 1.0));
    }

    #[test]
    fn test_vec3_min_max() {
        let a = Vec3::new(1.0, 5.0, 3.0);
        let b = Vec3::new(4.0, 2.0, 6.0);
        assert_eq!(min3(a, b), Vec3::new(1.0, 2.0, 3.0));
        assert_eq!(max3(a, b), Vec3::new(4.0, 5.0, 6.0));
    }

    #[test]
    fn test_vec3_ordering_lex() {
        let a = Vec3::new(1.0, 2.0, 3.0);
        let b = Vec3::new(1.0, 2.0, 4.0);
        let c = Vec3::new(1.0, 3.0, 0.0);
        let d = Vec3::new(2.0, 0.0, 0.0);
        assert!(a < b);
        assert!(b < c);
        assert!(c < d);
    }

    // ── Vec4 / Quat ───────────────────────────────────────────────────────────

    #[test]
    fn test_vec4_new() {
        let v = Vec4::new(1.0, 2.0, 3.0, 4.0);
        assert_eq!(v.xyz(), Vec3::new(1.0, 2.0, 3.0));
        assert_eq!(v.w, 4.0);
    }

    #[test]
    fn test_dot4() {
        let a = Vec4::new(1.0, 2.0, 3.0, 4.0);
        let b = Vec4::new(1.0, 1.0, 1.0, 1.0);
        assert_eq!(dot4(a, b), 10.0);
    }

    #[test]
    fn test_qmul_identity() {
        let id = Quat::new(0.0, 0.0, 0.0, 1.0);
        let q = Quat::new(0.1, 0.2, 0.3, 0.9274);
        let result = qmul(id, q);
        assert!(approx_eq4(result, q));
    }

    #[test]
    fn test_qrot_identity() {
        let id = Quat::new(0.0, 0.0, 0.0, 1.0);
        let v = Vec3::new(1.0, 2.0, 3.0);
        let result = qrot(id, v);
        assert!(approx_eq3(result, v));
    }

    #[test]
    fn test_qrot_90_z() {
        // 90° rotation around Z: maps X→Y
        let q = rotation_quat_axis_angle(Vec3::new(0.0, 0.0, 1.0), std::f64::consts::FRAC_PI_2);
        let v = qrot(q, Vec3::new(1.0, 0.0, 0.0));
        assert!(approx_eq3(v, Vec3::new(0.0, 1.0, 0.0)));
    }

    #[test]
    fn test_qmat_identity() {
        let id = Quat::new(0.0, 0.0, 0.0, 1.0);
        let m = qmat(id);
        assert!(approx_eq3(m.x, Vec3::new(1.0, 0.0, 0.0)));
        assert!(approx_eq3(m.y, Vec3::new(0.0, 1.0, 0.0)));
        assert!(approx_eq3(m.z, Vec3::new(0.0, 0.0, 1.0)));
    }

    // ── Integer vectors ───────────────────────────────────────────────────────

    #[test]
    fn test_ivec3() {
        let v = IVec3::new(1, 2, 3);
        assert_eq!(v[0], 1);
        assert_eq!(v[1], 2);
        assert_eq!(v[2], 3);
    }

    #[test]
    fn test_ivec3_ord() {
        let a = IVec3::new(1, 2, 3);
        let b = IVec3::new(1, 2, 4);
        let c = IVec3::new(1, 3, 0);
        assert!(a < b);
        assert!(b < c);

        // sort stability
        let mut v = vec![c, a, b];
        v.sort();
        assert_eq!(v, vec![a, b, c]);
    }

    // ── Mat3 ──────────────────────────────────────────────────────────────────

    #[test]
    fn test_mat3_identity() {
        let m = Mat3::identity();
        let v = Vec3::new(1.0, 2.0, 3.0);
        assert_eq!(m * v, v);
    }

    #[test]
    fn test_mat3_mul_vec() {
        // Scale by 2
        let m = Mat3::from_cols(
            Vec3::new(2.0, 0.0, 0.0),
            Vec3::new(0.0, 2.0, 0.0),
            Vec3::new(0.0, 0.0, 2.0),
        );
        let v = Vec3::new(1.0, 2.0, 3.0);
        assert_eq!(m * v, Vec3::new(2.0, 4.0, 6.0));
    }

    #[test]
    fn test_mat3_transpose() {
        let m = Mat3::from_cols(
            Vec3::new(1.0, 2.0, 3.0),
            Vec3::new(4.0, 5.0, 6.0),
            Vec3::new(7.0, 8.0, 9.0),
        );
        let t = m.transpose();
        // row(0) of m = col(0) of t
        assert_eq!(t.x, Vec3::new(1.0, 4.0, 7.0));
        assert_eq!(t.y, Vec3::new(2.0, 5.0, 8.0));
        assert_eq!(t.z, Vec3::new(3.0, 6.0, 9.0));
    }

    #[test]
    fn test_mat3_determinant() {
        let m = Mat3::identity();
        assert_eq!(m.determinant(), 1.0);

        // det of [[1,2,3],[0,1,4],[5,6,0]] (col-major: cols are [1,0,5],[2,1,6],[3,4,0])
        let m2 = Mat3::from_cols(
            Vec3::new(1.0, 0.0, 5.0),
            Vec3::new(2.0, 1.0, 6.0),
            Vec3::new(3.0, 4.0, 0.0),
        );
        // det([[1,2,3],[0,1,4],[5,6,0]]) expanding along row 0:
        // = 1*(1*0-4*6) - 2*(0*0-4*5) + 3*(0*6-1*5) = -24+40-15 = 1
        assert_eq!(m2.determinant(), 1.0 * (1.0 * 0.0 - 4.0 * 6.0) - 2.0 * (0.0 * 0.0 - 4.0 * 5.0) + 3.0 * (0.0 * 6.0 - 1.0 * 5.0));
        assert_eq!(m2.determinant(), 1.0);
    }

    #[test]
    fn test_mat3_inverse() {
        let m = Mat3::from_cols(
            Vec3::new(2.0, 0.0, 0.0),
            Vec3::new(0.0, 3.0, 0.0),
            Vec3::new(0.0, 0.0, 4.0),
        );
        let inv = m.inverse();
        let product = m * inv;
        let id = Mat3::identity();
        for j in 0..3 {
            for i in 0..3 {
                assert!((product[j][i] - id[j][i]).abs() < EPS, "product[{j}][{i}] = {}", product[j][i]);
            }
        }
    }

    // ── Mat4 ──────────────────────────────────────────────────────────────────

    #[test]
    fn test_mat4_identity() {
        let m = Mat4::identity();
        let v = Vec4::new(1.0, 2.0, 3.0, 4.0);
        assert_eq!(m * v, v);
    }

    #[test]
    fn test_mat4_determinant_identity() {
        assert!((Mat4::identity().determinant() - 1.0).abs() < EPS);
    }

    #[test]
    fn test_mat4_inverse() {
        let m = translation_matrix(Vec3::new(1.0, 2.0, 3.0));
        let inv = m.inverse();
        let product = m * inv;
        let id = Mat4::identity();
        for j in 0..4 {
            for i in 0..4 {
                assert!((product[j][i] - id[j][i]).abs() < EPS);
            }
        }
    }

    // ── Mat3x4 ────────────────────────────────────────────────────────────────

    #[test]
    fn test_mat3x4_identity_transform() {
        let m = Mat3x4::identity();
        // Apply to homogeneous point (x,y,z,1)
        let p = Vec3::new(1.0, 2.0, 3.0);
        let hp = Vec4::new(p.x, p.y, p.z, 1.0);
        let result = m * hp;
        assert!(approx_eq3(result, p));
    }

    #[test]
    fn test_mat3x4_translation() {
        // Translation by (1,2,3)
        let t = Vec3::new(1.0, 2.0, 3.0);
        let m = Mat3x4::from_cols(
            Vec3::new(1.0, 0.0, 0.0),
            Vec3::new(0.0, 1.0, 0.0),
            Vec3::new(0.0, 0.0, 1.0),
            t,
        );
        let p = Vec4::new(0.0, 0.0, 0.0, 1.0);
        let result = m * p;
        assert!(approx_eq3(result, t));
    }

    // ── Factory functions ─────────────────────────────────────────────────────

    #[test]
    fn test_translation_matrix() {
        let t = Vec3::new(1.0, 2.0, 3.0);
        let m = translation_matrix(t);
        let p = Vec4::new(0.0, 0.0, 0.0, 1.0);
        let result = m * p;
        assert!(approx_eq4(result, Vec4::new(1.0, 2.0, 3.0, 1.0)));
    }

    #[test]
    fn test_scaling_matrix() {
        let s = Vec3::new(2.0, 3.0, 4.0);
        let m = scaling_matrix(s);
        let v = Vec4::new(1.0, 1.0, 1.0, 1.0);
        let result = m * v;
        assert!(approx_eq4(result, Vec4::new(2.0, 3.0, 4.0, 1.0)));
    }

    // ── Reductions ────────────────────────────────────────────────────────────

    #[test]
    fn test_minmax_elem() {
        let v = Vec3::new(3.0, 1.0, 2.0);
        assert_eq!(minelem3(v), 1.0);
        assert_eq!(maxelem3(v), 3.0);
        assert_eq!(argmin3(v), 1);
        assert_eq!(argmax3(v), 0);
    }

    // ── rotation_quat_vec ─────────────────────────────────────────────────────

    #[test]
    fn test_rotation_quat_vec_identity() {
        let q = rotation_quat_vec(Vec3::new(1.0, 0.0, 0.0), Vec3::new(1.0, 0.0, 0.0));
        // should be identity quaternion
        assert!(approx_eq4(q, Quat::new(0.0, 0.0, 0.0, 1.0)));
    }

    #[test]
    fn test_rotation_quat_vec_x_to_y() {
        let q = rotation_quat_vec(Vec3::new(1.0, 0.0, 0.0), Vec3::new(0.0, 1.0, 0.0));
        let v = qrot(q, Vec3::new(1.0, 0.0, 0.0));
        // Should rotate x→y
        assert!((v.x).abs() < 1e-10);
        assert!((v.y - 1.0).abs() < 1e-10);
        assert!((v.z).abs() < 1e-10);
    }
