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

//! InterpTri — smooth surface interpolation using rational Bezier patches.
//!
//! Port of the `InterpTri` struct from C++ `smoothing.cpp`.
//! This applies tangent-based Bezier interpolation to subdivision vertices,
//! producing smooth curved surfaces instead of flat linear interpolation.

use crate::impl_mesh::ManifoldImpl;
use crate::linalg::{
    cross, dot, qconj, qrot, qxdir, rotation_quat_mat, Mat3, Vec3, Vec4,
};
use crate::types::Barycentric;

/// Next index in a triangle (0→1→2→0)
fn next3(i: i32) -> i32 {
    if i == 2 { 0 } else { i + 1 }
}

const K_PRECISION: f64 = 1e-12;

/// Homogeneous coordinate conversion for Vec4 (w already set)
fn homogeneous_4(v: Vec4) -> Vec4 {
    Vec4::new(v.x * v.w, v.y * v.w, v.z * v.w, v.w)
}

/// Homogeneous coordinate conversion for Vec3 (w = 1)
fn homogeneous_3(v: Vec3) -> Vec4 {
    Vec4::new(v.x, v.y, v.z, 1.0)
}

/// Normalize from homogeneous coordinates back to Vec3
fn hnormalize(v: Vec4) -> Vec3 {
    if v.w == 0.0 {
        Vec3::new(v.x, v.y, v.z)
    } else {
        Vec3::new(v.x / v.w, v.y / v.w, v.z / v.w)
    }
}

// NOTE: C++ `InterpTri::Scale` (smoothing.cpp) is not ported: it is defined but
// never called in the upstream reference either.

/// Bezier control point from a position and tangent
fn bezier(point: Vec3, tangent: Vec4) -> Vec4 {
    homogeneous_4(Vec4::new(
        point.x + tangent.x,
        point.y + tangent.y,
        point.z + tangent.z,
        tangent.w,
    ))
}

fn lerp4(a: Vec4, b: Vec4, t: f64) -> Vec4 {
    Vec4::new(
        a.x + (b.x - a.x) * t,
        a.y + (b.y - a.y) * t,
        a.z + (b.z - a.z) * t,
        a.w + (b.w - a.w) * t,
    )
}

/// Evaluate cubic Bezier at parameter x, returning two control points
/// for the resulting linear segment (used for further Bezier evaluation).
/// Returns (left, right) Vec4 pair.
fn cubic_bezier_2_linear(p0: Vec4, p1: Vec4, p2: Vec4, p3: Vec4, x: f64) -> [Vec4; 2] {
    let p12 = lerp4(p1, p2, x);
    let left = lerp4(lerp4(p0, p1, x), p12, x);
    let right = lerp4(p12, lerp4(p2, p3, x), x);
    [left, right]
}

/// Get point on the Bezier segment defined by two control points
fn bezier_point(points: &[Vec4; 2], x: f64) -> Vec3 {
    hnormalize(lerp4(points[0], points[1], x))
}

/// Get tangent direction at the Bezier segment
fn bezier_tangent(points: &[Vec4; 2]) -> Vec3 {
    safe_normalize(hnormalize(points[1]) - hnormalize(points[0]))
}

fn safe_normalize(v: Vec3) -> Vec3 {
    let len = (v.x * v.x + v.y * v.y + v.z * v.z).sqrt();
    if len < 1e-30 {
        Vec3::new(0.0, 0.0, 0.0)
    } else {
        Vec3::new(v.x / len, v.y / len, v.z / len)
    }
}

/// Rotate vector v from quaternion start's frame to end's frame
fn rotate_from_to(v: Vec3, start: Vec4, end: Vec4) -> Vec3 {
    qrot(end, qrot(qconj(start), v))
}

/// Slerp between two unit quaternions. longWay reverses the short/long path.
fn slerp(x: Vec4, y: Vec4, a: f64, long_way: bool) -> Vec4 {
    let mut z = y;
    let mut cos_theta = x.x * y.x + x.y * y.y + x.z * y.z + x.w * y.w;

    // Take the long way around the sphere only when requested
    if (cos_theta < 0.0) != long_way {
        z = Vec4::new(-y.x, -y.y, -y.z, -y.w);
        cos_theta = -cos_theta;
    }

    if cos_theta.abs() > 1.0 - f64::EPSILON {
        // Nearly identical: use linear interpolation for stability
        lerp4(x, z, a)
    } else {
        let angle = cos_theta.acos();
        let sin_angle = angle.sin();
        let s0 = ((1.0 - a) * angle).sin() / sin_angle;
        let s1 = (a * angle).sin() / sin_angle;
        Vec4::new(
            s0 * x.x + s1 * z.x,
            s0 * x.y + s1 * z.y,
            s0 * x.z + s1 * z.z,
            s0 * x.w + s1 * z.w,
        )
    }
}

/// Returns a normalized vector orthogonal to `reference`, in the plane of
/// `reference` and `input`. Falls back to `alt_in` if input is colinear with ref.
fn orthogonal_to(input: Vec3, alt_in: Vec3, reference: Vec3) -> Vec3 {
    let mut out = input - reference * dot(input, reference);
    if dot(out, out) < K_PRECISION * dot(input, input) {
        out = alt_in - reference * dot(alt_in, reference);
    }
    safe_normalize(out)
}

/// Quaternion multiplication
fn qmul(a: Vec4, b: Vec4) -> Vec4 {
    Vec4::new(
        a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
        a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
        a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
        a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
    )
}

/// Build a rotation quaternion that maps the x-axis to the given direction
fn rotation_quat_xdir_to(orig: Vec3, dest: Vec3) -> Vec4 {
    // Rotation from orig to dest (both should be unit vectors)
    let d = dot(orig, dest);
    if d >= 1.0 - 1e-12 {
        return Vec4::new(0.0, 0.0, 0.0, 1.0); // identity
    }
    if d <= -1.0 + 1e-12 {
        // 180 degree rotation — pick an orthogonal axis
        let axis = if orig.x.abs() < 0.9 {
            safe_normalize(cross(orig, Vec3::new(1.0, 0.0, 0.0)))
        } else {
            safe_normalize(cross(orig, Vec3::new(0.0, 1.0, 0.0)))
        };
        return Vec4::new(axis.x, axis.y, axis.z, 0.0);
    }
    let c = cross(orig, dest);
    let w = 1.0 + d;
    let len = (c.x * c.x + c.y * c.y + c.z * c.z + w * w).sqrt();
    Vec4::new(c.x / len, c.y / len, c.z / len, w / len)
}

/// Bezier2Bezier: compute a point and tangent along a cross-curve Bezier
fn bezier2bezier(
    corners: [Vec3; 2],
    tangents_x: [Vec4; 2],
    tangents_y: [Vec4; 2],
    x: f64,
    anchor: Vec3,
) -> [Vec4; 2] {
    let bez = cubic_bezier_2_linear(
        homogeneous_3(corners[0]),
        bezier(corners[0], tangents_x[0]),
        bezier(corners[1], tangents_x[1]),
        homogeneous_3(corners[1]),
        x,
    );
    let end = bezier_point(&bez, x);
    let tangent = bezier_tangent(&bez);

    let n_tangents_x = [
        safe_normalize(Vec3::new(tangents_x[0].x, tangents_x[0].y, tangents_x[0].z)),
        safe_normalize(Vec3::new(-tangents_x[1].x, -tangents_x[1].y, -tangents_x[1].z)),
    ];
    let bi_tangents = [
        orthogonal_to(
            Vec3::new(tangents_y[0].x, tangents_y[0].y, tangents_y[0].z),
            anchor - corners[0],
            n_tangents_x[0],
        ),
        orthogonal_to(
            Vec3::new(tangents_y[1].x, tangents_y[1].y, tangents_y[1].z),
            anchor - corners[1],
            n_tangents_x[1],
        ),
    ];

    let q0 = rotation_quat_mat(Mat3::from_cols(
        n_tangents_x[0],
        bi_tangents[0],
        cross(n_tangents_x[0], bi_tangents[0]),
    ));
    let q1 = rotation_quat_mat(Mat3::from_cols(
        n_tangents_x[1],
        bi_tangents[1],
        cross(n_tangents_x[1], bi_tangents[1]),
    ));

    let edge = corners[1] - corners[0];
    let long_way = dot(n_tangents_x[0], edge) + dot(n_tangents_x[1], edge) < 0.0;
    let q_tmp = slerp(q0, q1, x, long_way);
    let q = qmul(rotation_quat_xdir_to(qxdir(q_tmp), tangent), q_tmp);

    let delta = {
        let r0 = rotate_from_to(
            Vec3::new(tangents_y[0].x, tangents_y[0].y, tangents_y[0].z),
            q0,
            q,
        );
        let r1 = rotate_from_to(
            Vec3::new(tangents_y[1].x, tangents_y[1].y, tangents_y[1].z),
            q1,
            q,
        );
        Vec3::new(
            r0.x + (r1.x - r0.x) * x,
            r0.y + (r1.y - r0.y) * x,
            r0.z + (r1.z - r0.z) * x,
        )
    };
    let delta_w = tangents_y[0].w + (tangents_y[1].w - tangents_y[0].w) * x;

    [homogeneous_3(end), Vec4::new(delta.x, delta.y, delta.z, delta_w)]
}

/// Full 2D Bezier surface evaluation
fn bezier_2d(
    corners: [Vec3; 4],
    tangents_x: [Vec4; 4],
    tangents_y: [Vec4; 4],
    x: f64,
    y: f64,
    centroid: Vec3,
) -> Vec3 {
    let bez0 = bezier2bezier(
        [corners[0], corners[1]],
        [tangents_x[0], tangents_x[1]],
        [tangents_y[0], tangents_y[1]],
        x,
        centroid,
    );
    let bez1 = bezier2bezier(
        [corners[2], corners[3]],
        [tangents_x[2], tangents_x[3]],
        [tangents_y[2], tangents_y[3]],
        1.0 - x,
        centroid,
    );

    let bez = cubic_bezier_2_linear(
        bez0[0],
        bezier(hnormalize(bez0[0]), bez0[1]),
        bezier(hnormalize(bez1[0]), bez1[1]),
        bez1[0],
        y,
    );
    bezier_point(&bez, y)
}

/// Apply smooth Bezier interpolation to all subdivision vertices.
///
/// Port of C++ `InterpTri::operator()(int vert)`.
/// This repositions each vertex based on its barycentric coordinates and the
/// halfedge tangent vectors from the original mesh, producing a smooth surface.
pub fn interp_tri(
    vert_pos: &mut [Vec3],
    vert_bary: &[Barycentric],
    old: &ManifoldImpl,
) {
    let num_vert = vert_pos.len().min(vert_bary.len());
    for vert in 0..num_vert {
        let tri = vert_bary[vert].tri;
        if tri < 0 || tri as usize >= old.halfedge.len() / 3 {
            continue;
        }
        let uvw = vert_bary[vert].uvw;

        let halfedges_ivec = old.get_halfedges_quad(tri);
        let halfedges = [halfedges_ivec[0], halfedges_ivec[1], halfedges_ivec[2], halfedges_ivec[3]];
        let corners = [
            old.vert_pos[old.halfedge[halfedges[0] as usize].start_vert as usize],
            old.vert_pos[old.halfedge[halfedges[1] as usize].start_vert as usize],
            old.vert_pos[old.halfedge[halfedges[2] as usize].start_vert as usize],
            if halfedges[3] < 0 {
                Vec3::new(0.0, 0.0, 0.0)
            } else {
                old.vert_pos[old.halfedge[halfedges[3] as usize].start_vert as usize]
            },
        ];

        // If vertex is exactly at a corner, use the corner position
        let mut is_corner = false;
        for i in 0..4 {
            if uvw[i] == 1.0 {
                vert_pos[vert] = corners[i];
                is_corner = true;
                break;
            }
        }
        if is_corner {
            continue;
        }

        let mut pos_h = Vec4::new(0.0, 0.0, 0.0, 0.0);

        if halfedges[3] < 0 {
            // Triangle case
            let tangent_r = [
                old.halfedge_tangent[halfedges[0] as usize],
                old.halfedge_tangent[halfedges[1] as usize],
                old.halfedge_tangent[halfedges[2] as usize],
            ];
            let tangent_l = [
                old.halfedge_tangent
                    [old.halfedge[halfedges[2] as usize].paired_halfedge as usize],
                old.halfedge_tangent
                    [old.halfedge[halfedges[0] as usize].paired_halfedge as usize],
                old.halfedge_tangent
                    [old.halfedge[halfedges[1] as usize].paired_halfedge as usize],
            ];
            let centroid = Vec3::new(
                (corners[0].x + corners[1].x + corners[2].x) / 3.0,
                (corners[0].y + corners[1].y + corners[2].y) / 3.0,
                (corners[0].z + corners[1].z + corners[2].z) / 3.0,
            );

            for i in 0..3 {
                let j = next3(i as i32) as usize;
                let k = ((i + 2) % 3) as usize; // Prev3(i)
                let x = uvw[k] / (1.0 - uvw[i]);

                let bez = bezier2bezier(
                    [corners[j], corners[k]],
                    [tangent_r[j], tangent_l[k]],
                    [tangent_l[j], tangent_r[k]],
                    x,
                    centroid,
                );

                let bez1 = cubic_bezier_2_linear(
                    bez[0],
                    bezier(hnormalize(bez[0]), bez[1]),
                    bezier(corners[i], lerp4(tangent_r[i], tangent_l[i], x)),
                    homogeneous_3(corners[i]),
                    uvw[i],
                );
                let p = bezier_point(&bez1, uvw[i]);
                let weight = uvw[j] * uvw[k];
                pos_h = pos_h + homogeneous_4(Vec4::new(p.x, p.y, p.z, weight));
            }
        } else {
            // Quad case
            let tangents_x = [
                old.halfedge_tangent[halfedges[0] as usize],
                old.halfedge_tangent
                    [old.halfedge[halfedges[0] as usize].paired_halfedge as usize],
                old.halfedge_tangent[halfedges[2] as usize],
                old.halfedge_tangent
                    [old.halfedge[halfedges[2] as usize].paired_halfedge as usize],
            ];
            let tangents_y = [
                old.halfedge_tangent
                    [old.halfedge[halfedges[3] as usize].paired_halfedge as usize],
                old.halfedge_tangent[halfedges[1] as usize],
                old.halfedge_tangent
                    [old.halfedge[halfedges[1] as usize].paired_halfedge as usize],
                old.halfedge_tangent[halfedges[3] as usize],
            ];
            let centroid = Vec3::new(
                (corners[0].x + corners[1].x + corners[2].x + corners[3].x) * 0.25,
                (corners[0].y + corners[1].y + corners[2].y + corners[3].y) * 0.25,
                (corners[0].z + corners[1].z + corners[2].z + corners[3].z) * 0.25,
            );
            let x = uvw[1] + uvw[2];
            let y = uvw[2] + uvw[3];
            let p_x = bezier_2d(corners, tangents_x, tangents_y, x, y, centroid);
            let p_y = bezier_2d(
                [corners[1], corners[2], corners[3], corners[0]],
                [tangents_y[1], tangents_y[2], tangents_y[3], tangents_y[0]],
                [tangents_x[1], tangents_x[2], tangents_x[3], tangents_x[0]],
                y,
                1.0 - x,
                centroid,
            );
            pos_h = pos_h + homogeneous_4(Vec4::new(p_x.x, p_x.y, p_x.z, x * (1.0 - x)));
            pos_h = pos_h + homogeneous_4(Vec4::new(p_y.x, p_y.y, p_y.z, y * (1.0 - y)));
        }

        let pos = hnormalize(pos_h);
        // Guard against NaN/inf from degenerate Bezier weights (matches C++ la::isfinite check)
        vert_pos[vert] = if pos.x.is_finite() && pos.y.is_finite() && pos.z.is_finite() {
            pos
        } else {
            corners[0]
        };
    }
}
