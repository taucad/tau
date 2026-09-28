// constructors.rs — Phase 6: Primitive and polygon constructors
//
// Ports src/constructors.cpp from the Manifold C++ library.
// Sphere() requires Subdivide() (Phase 15) and is omitted here.
// Cube, Tetrahedron, Octahedron are in impl_mesh.rs.

use crate::linalg::{Vec2, Vec3, IVec3, Mat3x4};
use crate::types::{
    Polygons, SimplePolygon, PolygonsIdx, SimplePolygonIdx, PolyVert,
    cosd, sind, Quality,
};
use crate::polygon::{triangulate_idx, triangulate};
use crate::impl_mesh::ManifoldImpl;

// -----------------------------------------------------------------------
// Extrude
// -----------------------------------------------------------------------

/// Extrudes a set of polygons along the Z axis.
///
/// - `cross_section`: non-overlapping polygons (each a `Vec<Vec2>`)
/// - `height`: Z extent (must be > 0)
/// - `n_divisions`: extra copies inserted vertically (≥ 0)
/// - `twist_degrees`: rotation applied to top cross-section
/// - `scale_top`: X/Y scaling applied to top cross-section; (0,0) = cone
pub fn extrude(
    cross_section: &Polygons,
    height: f64,
    n_divisions: i32,
    twist_degrees: f64,
    scale_top: Vec2,
) -> ManifoldImpl {
    if cross_section.is_empty() || height <= 0.0 {
        return ManifoldImpl::new();
    }

    let scale_top = Vec2::new(scale_top.x.max(0.0), scale_top.y.max(0.0));
    let n_div = n_divisions + 1; // total levels above bottom

    let mut vert_pos: Vec<Vec3> = Vec::new();
    let mut tri_verts: Vec<IVec3> = Vec::new();
    let is_cone = scale_top.x == 0.0 && scale_top.y == 0.0;

    // Count total cross-section vertices
    let n_cross: i32 = cross_section.iter().map(|p| p.len() as i32).sum();

    // Build indexed form for bottom triangulation
    let mut polygons_indexed: PolygonsIdx = Vec::new();
    let mut idx: i32 = 0;
    for poly in cross_section.iter() {
        let mut simple_indexed: SimplePolygonIdx = Vec::new();
        for &pv in poly.iter() {
            vert_pos.push(Vec3::new(pv.x, pv.y, 0.0));
            simple_indexed.push(PolyVert { pos: pv, idx });
            idx += 1;
        }
        polygons_indexed.push(simple_indexed);
    }

    // Build side walls: levels 1..=n_div
    for i in 1..=(n_div as usize) {
        let alpha = i as f64 / n_div as f64;
        let phi = alpha * twist_degrees;
        let scale = lerp2(Vec2::new(1.0, 1.0), scale_top, alpha);
        let cos_phi = cosd(phi);
        let sin_phi = sind(phi);

        // C++ builds transform = mat2(scale) * mat2(rotation) FIRST (entries
        // are products like sx*cos), then multiplies the vector — match that
        // association exactly.
        let t00 = scale.x * cos_phi; // col0.x
        let t01 = scale.y * sin_phi; // col0.y
        let t10 = scale.x * -sin_phi; // col1.x
        let t11 = scale.y * cos_phi; // col1.y

        let mut j: i32 = 0; // apex vertex index for cone top
        let mut poly_offset: i32 = 0; // offset within cross-section for this level
        for (pi, poly) in cross_section.iter().enumerate() {
            let poly_len = poly.len() as i32;
            for vert in 0..poly_len {
                let offset = poly_offset + n_cross * i as i32;
                let this_vert = vert + offset;
                let last_vert = (if vert == 0 { poly_len } else { vert }) - 1 + offset;
                if i == n_div as usize && is_cone {
                    // Connect to apex; apex index = n_cross * n_div + j
                    let apex = n_cross * n_div as i32 + j;
                    tri_verts.push(IVec3::new(
                        apex,
                        last_vert - n_cross,
                        this_vert - n_cross,
                    ));
                } else {
                    let pos2 = poly[vert as usize];
                    let px = t00 * pos2.x + t10 * pos2.y;
                    let py = t01 * pos2.x + t11 * pos2.y;
                    vert_pos.push(Vec3::new(px, py, height * alpha));
                    tri_verts.push(IVec3::new(this_vert, last_vert, this_vert - n_cross));
                    tri_verts.push(IVec3::new(last_vert, last_vert - n_cross, this_vert - n_cross));
                }
            }
            j += 1;
            poly_offset += poly_len;
            let _ = pi; // suppress unused warning
        }
    }

    // Add cone apex vertices (one per polygon)
    if is_cone {
        for _ in 0..cross_section.len() {
            vert_pos.push(Vec3::new(0.0, 0.0, height));
        }
    }

    // Triangulate bottom (winding reversed for outward normal) and top.
    // C++ calls TriangulateIdx with its DEFAULTS: epsilon=-1, allowConvex=true
    // (the convex fast path picks the alternating fan for e.g. circle caps).
    let top_tris = triangulate_idx(&polygons_indexed, -1.0, true);
    for tri in &top_tris {
        // Bottom: reverse winding for correct outward normal (points -Z)
        tri_verts.push(IVec3::new(tri.x, tri.z, tri.y));
        // Top: forward winding
        if !is_cone {
            tri_verts.push(IVec3::new(
                tri.x + n_cross * n_div as i32,
                tri.y + n_cross * n_div as i32,
                tri.z + n_cross * n_div as i32,
            ));
        }
    }

    let mut m = ManifoldImpl::new();
    m.vert_pos = vert_pos;
    m.create_halfedges(&tri_verts, &[]);
    m.initialize_original();
    m.calculate_bbox();
    m.set_epsilon(-1.0, false);
    m.sort_geometry();
    m.set_normals_and_coplanar();
    m
}

// -----------------------------------------------------------------------
// Revolve
// -----------------------------------------------------------------------

/// Constructs a manifold by revolving polygons around the Y axis (becomes Z).
///
/// - `cross_section`: non-overlapping polygons (each a `Vec<Vec2>`)
/// - `circular_segments`: number of divisions around the circle (0 = auto)
/// - `revolve_degrees`: how many degrees to revolve (clamped to 360)
pub fn revolve(
    cross_section: &Polygons,
    circular_segments: i32,
    revolve_degrees: f64,
) -> ManifoldImpl {
    // Filter to positive-x portion only, clipping at axis
    let mut polygons: Polygons = Vec::new();
    let mut radius: f64 = 0.0;
    for poly in cross_section.iter() {
        let mut i = 0usize;
        while i < poly.len() && poly[i].x < 0.0 {
            i += 1;
        }
        if i == poly.len() {
            continue;
        }
        let mut clipped: SimplePolygon = Vec::new();
        let start = i;
        let poly_len = poly.len();
        loop {
            if poly[i].x >= 0.0 {
                clipped.push(poly[i]);
                radius = radius.max(poly[i].x);
            }
            let next = if i + 1 == poly_len { 0 } else { i + 1 };
            // Add axis-crossing interpolated point
            if (poly[next].x < 0.0) != (poly[i].x < 0.0) {
                let y = poly[next].y
                    - poly[next].x * (poly[i].y - poly[next].y)
                        / (poly[i].x - poly[next].x);
                clipped.push(Vec2::new(0.0, y));
            }
            i = next;
            if i == start {
                break;
            }
        }
        if !clipped.is_empty() {
            polygons.push(clipped);
        }
    }

    if polygons.is_empty() {
        return ManifoldImpl::new();
    }

    let revolve_degrees = revolve_degrees.min(360.0);
    let is_full_revolution = revolve_degrees == 360.0;

    let n_divisions = if circular_segments > 2 {
        circular_segments
    } else {
        let segs = Quality::get_circular_segments(radius);
        (segs as f64 * revolve_degrees / 360.0) as i32
    };
    let n_divisions = n_divisions.max(3);

    let mut vert_pos: Vec<Vec3> = Vec::new();
    let mut tri_verts: Vec<IVec3> = Vec::new();

    let mut start_poses: Vec<i32> = Vec::new();
    let mut end_poses: Vec<i32> = Vec::new();

    let d_phi = revolve_degrees / n_divisions as f64;
    // First and last slice are distinct if not a full revolution
    let n_slices = if is_full_revolution { n_divisions } else { n_divisions + 1 };

    for poly in polygons.iter() {
        let n_pos_verts: usize = poly.iter().filter(|p| p.x > 0.0).count();
        let n_axis_verts: usize = poly.iter().filter(|p| p.x == 0.0).count();
        let _ = n_axis_verts;

        let mut n_revolve_axis_verts: usize = 0;
        for pt in poly.iter() {
            if pt.x == 0.0 {
                n_revolve_axis_verts += 1;
            }
        }

        for poly_vert in 0..poly.len() {
            let start_pos_index = vert_pos.len() as i32;

            if !is_full_revolution {
                start_poses.push(start_pos_index);
            }

            let curr = poly[poly_vert];
            let prev = poly[if poly_vert == 0 { poly.len() - 1 } else { poly_vert - 1 }];

            // Index of the previous poly_vert's first position
            let prev_start_pos_index = start_pos_index
                + (if poly_vert == 0 {
                    (n_revolve_axis_verts + n_slices as usize * n_pos_verts) as i32
                } else {
                    0
                })
                + if prev.x == 0.0 { -1 } else { -(n_slices as i32) };

            for slice in 0..n_slices {
                let phi = slice as f64 * d_phi;
                // Only push a vertex when it's the first slice OR the vert is not on axis
                if slice == 0 || curr.x > 0.0 {
                    vert_pos.push(Vec3::new(
                        curr.x * cosd(phi),
                        curr.x * sind(phi),
                        curr.y,
                    ));
                }

                if is_full_revolution || slice > 0 {
                    let last_slice = if slice == 0 { n_divisions } else { slice } - 1;
                    if curr.x > 0.0 {
                        tri_verts.push(IVec3::new(
                            start_pos_index + slice as i32,
                            start_pos_index + last_slice as i32,
                            if prev.x == 0.0 {
                                prev_start_pos_index
                            } else {
                                prev_start_pos_index + last_slice as i32
                            },
                        ));
                    }
                    if prev.x > 0.0 {
                        tri_verts.push(IVec3::new(
                            prev_start_pos_index + last_slice as i32,
                            prev_start_pos_index + slice as i32,
                            if curr.x == 0.0 {
                                start_pos_index
                            } else {
                                start_pos_index + slice as i32
                            },
                        ));
                    }
                }
            }

            if !is_full_revolution {
                end_poses.push(vert_pos.len() as i32 - 1);
            }
        }
    }

    // Cap front and back for partial revolution
    if !is_full_revolution {
        let front_tris = triangulate(&polygons, -1.0, false);
        for t in &front_tris {
            tri_verts.push(IVec3::new(start_poses[t.x as usize], start_poses[t.y as usize], start_poses[t.z as usize]));
        }
        for t in &front_tris {
            tri_verts.push(IVec3::new(end_poses[t.z as usize], end_poses[t.y as usize], end_poses[t.x as usize]));
        }
    }

    let mut m = ManifoldImpl::new();
    m.vert_pos = vert_pos;
    m.create_halfedges(&tri_verts, &[]);
    m.initialize_original();
    m.calculate_bbox();
    m.set_epsilon(-1.0, false);
    m.sort_geometry();
    m.set_normals_and_coplanar();
    m
}

// -----------------------------------------------------------------------
// Cylinder
// -----------------------------------------------------------------------

/// Constructs a cylinder (or frustum/cone) by extruding a circle polygon.
///
/// - `height`: Z extent (must be > 0)
/// - `radius_low`: radius at bottom (must be ≥ 0)
/// - `radius_high`: radius at top (< 0 means same as low). If both radii
///   are 0 the result is empty.
/// - `circular_segments`: number of sides (0 = auto from Quality)
/// - `center`: if true, center vertically on the origin
pub fn cylinder(
    height: f64,
    radius_low: f64,
    radius_high: f64,
    circular_segments: i32,
    center: bool,
) -> ManifoldImpl {
    if height <= 0.0 || radius_low < 0.0 {
        return ManifoldImpl::new();
    }
    if radius_low == 0.0 {
        if radius_high <= 0.0 {
            return ManifoldImpl::new();
        }
        // Cone with apex at bottom: C++ builds the centered apex-at-top cone,
        // Mirrors over z, Translates, and finishes with AsOriginal. Mirror and
        // Translate are lazy CSG transforms that compose into ONE
        // Impl::Transform application (which also flips triangle winding for
        // the negative-determinant mirror) — replicate that exactly.
        let cone = cylinder(height, radius_high, 0.0, circular_segments, true);
        let translate_z = if center { 0.0 } else { height / 2.0 };
        let m = Mat3x4::from_cols(
            Vec3::new(1.0, 0.0, 0.0),
            Vec3::new(0.0, 1.0, 0.0),
            Vec3::new(0.0, 0.0, -1.0),
            Vec3::new(0.0, 0.0, translate_z),
        );
        let mut cone = cone.transform(&m);
        // AsOriginal
        cone.initialize_original();
        crate::face_op::set_normals_and_coplanar(&mut cone);
        return cone;
    }

    let scale = if radius_high >= 0.0 { radius_high / radius_low } else { 1.0 };
    let radius = radius_low.max(if radius_high >= 0.0 { radius_high } else { 0.0 });
    let n = if circular_segments > 2 {
        circular_segments
    } else {
        Quality::get_circular_segments(radius)
    };

    let d_phi = 360.0 / n as f64;
    let mut circle: SimplePolygon = Vec::with_capacity(n as usize);
    for i in 0..n {
        circle.push(Vec2::new(
            radius_low * cosd(d_phi * i as f64),
            radius_low * sind(d_phi * i as f64),
        ));
    }

    let mut m = extrude(
        &vec![circle],
        height,
        0,
        0.0,
        Vec2::new(scale, scale),
    );

    if center {
        for v in m.vert_pos.iter_mut() {
            v.z -= height / 2.0;
        }
        m.calculate_bbox();
    }
    m
}

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

fn lerp2(a: Vec2, b: Vec2, t: f64) -> Vec2 {
    Vec2::new(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t)
}

// -----------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::linalg::Vec2;

    fn unit_square() -> Polygons {
        vec![vec![
            Vec2::new(0.0, 0.0),
            Vec2::new(1.0, 0.0),
            Vec2::new(1.0, 1.0),
            Vec2::new(0.0, 1.0),
        ]]
    }

    #[test]
    fn test_extrude_box() {
        let m = extrude(&unit_square(), 1.0, 0, 0.0, Vec2::new(1.0, 1.0));
        // A unit cube extruded from a unit square: 8 verts, 12 triangles
        assert!(m.is_2_manifold(), "extruded box is not 2-manifold");
        // bbox should span [0,1]^3
        assert!((m.bbox.min.z).abs() < 1e-10);
        assert!((m.bbox.max.z - 1.0).abs() < 1e-10);
    }

    #[test]
    fn test_extrude_cone() {
        let m = extrude(&unit_square(), 1.0, 0, 0.0, Vec2::new(0.0, 0.0));
        assert!(m.is_2_manifold(), "extruded cone is not 2-manifold");
        assert!((m.bbox.max.z - 1.0).abs() < 1e-10);
    }

    #[test]
    fn test_extrude_twist() {
        let m = extrude(&unit_square(), 1.0, 4, 90.0, Vec2::new(1.0, 1.0));
        assert!(m.is_2_manifold(), "twisted extrude is not 2-manifold");
    }

    #[test]
    fn test_revolve_full() {
        // Revolve a square around Y axis → torus-ish solid ring
        let poly: SimplePolygon = vec![
            Vec2::new(1.0, 0.0),
            Vec2::new(2.0, 0.0),
            Vec2::new(2.0, 1.0),
            Vec2::new(1.0, 1.0),
        ];
        let m = revolve(&vec![poly], 8, 360.0);
        assert!(m.is_2_manifold(), "full revolve is not 2-manifold");
    }

    #[test]
    fn test_revolve_partial() {
        let poly: SimplePolygon = vec![
            Vec2::new(1.0, 0.0),
            Vec2::new(2.0, 0.0),
            Vec2::new(2.0, 1.0),
            Vec2::new(1.0, 1.0),
        ];
        let m = revolve(&vec![poly], 8, 180.0);
        assert!(m.is_2_manifold(), "partial revolve is not 2-manifold");
    }

    #[test]
    fn test_cylinder_basic() {
        let m = cylinder(1.0, 1.0, 1.0, 8, false);
        assert!(m.is_2_manifold(), "cylinder is not 2-manifold");
        assert!((m.bbox.max.z - 1.0).abs() < 1e-10);
        assert!(m.bbox.min.z.abs() < 1e-10);
    }

    #[test]
    fn test_cylinder_centered() {
        let m = cylinder(2.0, 1.0, 1.0, 8, true);
        assert!(m.is_2_manifold(), "centered cylinder is not 2-manifold");
        assert!((m.bbox.min.z + 1.0).abs() < 1e-10);
        assert!((m.bbox.max.z - 1.0).abs() < 1e-10);
    }

    #[test]
    fn test_cylinder_cone() {
        // Cone: radius_high = 0
        let m = cylinder(1.0, 1.0, 0.0, 8, false);
        assert!(m.is_2_manifold(), "cone cylinder is not 2-manifold");
    }

    #[test]
    fn test_extrude_empty_invalid() {
        let m = extrude(&vec![], 1.0, 0, 0.0, Vec2::new(1.0, 1.0));
        assert_eq!(m.num_tri(), 0);

        let m2 = extrude(&unit_square(), -1.0, 0, 0.0, Vec2::new(1.0, 1.0));
        assert_eq!(m2.num_tri(), 0);
    }
}
