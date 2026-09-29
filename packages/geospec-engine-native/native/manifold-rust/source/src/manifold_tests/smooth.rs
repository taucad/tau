use super::*;
use crate::cross_section::CrossSection;
use crate::linalg::{dot, length};

/// C++ TEST(Smooth, Normals) — SmoothOut and SmoothByNormals produce same result
#[test]
fn test_cpp_smooth_normals() {
    // C++ uses SmoothOut() which defaults to (60, 0)
    let cylinder = Manifold::cylinder(10.0, 5.0, 5.0, 8);
    // C++ SmoothOut() defaults to (60, 0), CalculateNormals(0) defaults to (0, 60)
    let out = cylinder.clone().smooth_out(60.0, 0.0).refine_to_length(0.1);
    let by_normals = cylinder
        .calculate_normals(0, 60.0)
        .smooth_by_normals(0)
        .refine_to_length(0.1);
    assert!((out.volume() - by_normals.volume()).abs() < 1e-4,
        "Normals: vol {} vs {}", out.volume(), by_normals.volume());
    assert!((out.surface_area() - by_normals.surface_area()).abs() < 1e-4,
        "Normals: sa {} vs {}", out.surface_area(), by_normals.surface_area());
}

/// C++ TEST(Smooth, TruncatedCone) — smooth cylinder with different radii
#[test]
fn test_cpp_smooth_truncated_cone() {
    let cone = Manifold::cylinder(5.0, 10.0, 5.0, 12);
    // C++ v3.5.0: SmoothOut() defaults to (52.5, 0); CalculateNormals(0)
    // defaults to (0, 52.5). Values updated for the #1724/#1671 smoothing fixes.
    let smooth = cone.clone().smooth_out(52.5, 0.0).refine_to_length(0.5)
        .calculate_normals(0, 52.5);
    assert!((smooth.volume() - 1163.53).abs() < 0.01,
        "TruncatedCone vol={}", smooth.volume());
    assert!((smooth.surface_area() - 769.33).abs() < 0.01,
        "TruncatedCone sa={}", smooth.surface_area());

    let smooth1 = cone.clone().smooth_out(180.0, 1.0).refine_to_length(0.5);
    let smooth2 = cone.smooth_out(180.0, 0.0).refine_to_length(0.5);
    assert!((smooth2.volume() - smooth1.volume()).abs() < 0.01);
    assert!((smooth2.surface_area() - smooth1.surface_area()).abs() < 0.01);
}

/// C++ TEST(Smooth, Mirrored) — mirrored smooth tetrahedron
#[test]
fn test_cpp_smooth_mirrored() {
    let tet_gl = Manifold::tetrahedron().scale(Vec3::new(1.0, 2.0, 3.0)).get_mesh_gl(0);
    let smooth = Manifold::smooth(&tet_gl, &[]);
    let mirror = smooth.clone().scale(Vec3::new(-2.0, 2.0, 2.0)).refine(10);
    let scaled = smooth.refine(10).scale(Vec3::new(2.0, 2.0, 2.0));
    assert!((scaled.volume() - mirror.volume()).abs() < 0.1,
        "Mirrored vol: {} vs {}", scaled.volume(), mirror.volume());
    assert!((scaled.surface_area() - mirror.surface_area()).abs() < 0.1,
        "Mirrored sa: {} vs {}", scaled.surface_area(), mirror.surface_area());
}

/// C++ TEST(Smooth, Tetrahedron) — smooth tetrahedron with curvature check
#[test]
fn test_cpp_smooth_tetrahedron() {
    let tet = Manifold::tetrahedron();
    let smooth = Manifold::smooth(&tet.get_mesh_gl(0), &[]);
    let n = 100;
    let refined = smooth.refine(n);
    assert_eq!(refined.num_vert(), 2 * n as usize * n as usize + 2);
    assert_eq!(refined.num_tri(), 4 * n as usize * n as usize);
    assert!((refined.volume() - 17.0).abs() < 0.1, "vol={}", refined.volume());
    assert!((refined.surface_area() - 32.9).abs() < 0.1, "sa={}", refined.surface_area());
}

/// C++ TEST(Smooth, Csaszar) — smooth Csaszar polyhedron
#[test]
fn test_cpp_smooth_csaszar() {
    let csaszar = csaszar_gl();
    let smooth = Manifold::smooth(&csaszar, &[]);
    let refined = smooth.refine(100);
    assert_eq!(refined.num_vert(), 70000);
    assert_eq!(refined.num_tri(), 140000);
    assert!((refined.volume() - 78760.0).abs() < 10.0, "vol={}", refined.volume());
    assert!((refined.surface_area() - 11935.0).abs() < 10.0, "sa={}", refined.surface_area());
}

/// C++ TEST(Smooth, Manual) — manually adjusted tangent weights
#[test]
fn test_cpp_smooth_manual() {
    let oct = Manifold::sphere(1.0, 4).get_mesh_gl(0);
    let smooth_m = Manifold::smooth(&oct, &[]);
    let mut smooth_gl = smooth_m.get_mesh_gl(0);
    if smooth_gl.halfedge_tangent.len() > 4 * 22 + 3 {
        smooth_gl.halfedge_tangent[4 * 6 + 3] = 0.0;
        smooth_gl.halfedge_tangent[4 * 22 + 3] = 0.0;
        smooth_gl.halfedge_tangent[4 * 16 + 3] = 0.0;
        smooth_gl.halfedge_tangent[4 * 18 + 3] = 0.0;
    }
    let interp = Manifold::from_mesh_gl(&smooth_gl).refine(100);
    assert_eq!(interp.num_vert(), 40002);
    assert_eq!(interp.num_tri(), 80000);
    assert!((interp.volume() - 3.74).abs() < 0.01, "vol={}", interp.volume());
    assert!((interp.surface_area() - 11.78).abs() < 0.01, "sa={}", interp.surface_area());
}

/// C++ TEST(Smooth, RefineQuads) — smooth cylinder with position-color properties
#[test]
fn test_cpp_smooth_refine_quads() {
    // C++ uses SmoothOut() which defaults to (60, 0)
    let cylinder = with_position_colors(&Manifold::cylinder(2.0, 1.0, -1.0, 12))
        .smooth_out(60.0, 0.0)
        .refine_to_length(0.05);
    assert_eq!(cylinder.num_tri(), 17044, "RefineQuads tris={}", cylinder.num_tri());
    let pi = std::f64::consts::PI;
    assert!((cylinder.volume() - 2.0 * pi).abs() < 0.003,
        "RefineQuads vol={}", cylinder.volume());
    assert!((cylinder.surface_area() - 6.0 * pi).abs() < 0.004,
        "RefineQuads sa={}", cylinder.surface_area());
}

/// C++ TEST(Smooth, Precision) — tolerance-based refinement precision
#[test]
fn test_cpp_smooth_precision() {
    let tolerance = 0.001;
    let radius = 10.0;
    let height = 10.0;
    let cylinder = Manifold::cylinder(height, radius, radius, 8);
    // C++ uses SmoothOut() which defaults to (60, 0)
    let smoothed = cylinder.smooth_out(60.0, 0.0).refine_to_tolerance(tolerance);
    assert_eq!(smoothed.num_tri(), 7984, "Precision tris={}", smoothed.num_tri());
}

/// C++ TEST(Smooth, ToLength) — smooth cone with RefineToLength and curvature check
#[test]
fn test_cpp_smooth_to_length() {
    let circle = CrossSection::circle(10.0, 10).translate(Vec2::new(10.0, 0.0));
    let polygons = circle.to_polygons();
    let cone = Manifold::extrude(&polygons, 2.0, 0, 0.0, Vec2::new(0.0, 0.0));
    let cone = cone.union(&cone.scale(Vec3::new(1.0, 1.0, -5.0)));
    let smooth = cone.as_original().simplify(0.0).smooth_out(180.0, 0.0).refine_to_length(0.1);

    let (num_tri, num_vert) = (smooth.num_tri(), smooth.num_vert());
    assert_eq!(num_tri, 170496, "ToLength tris={}", num_tri);
    assert_eq!(num_vert, 85250, "ToLength verts={}", num_vert);
    assert!((smooth.volume() - 4570.0).abs() < 1.0, "ToLength vol={}", smooth.volume());
    assert!((smooth.surface_area() - 1348.0).abs() < 1.0, "ToLength sa={}", smooth.surface_area());

    let out = smooth.calculate_curvature(-1, 0).get_mesh_gl(0);
    let num_prop = out.num_prop as usize;
    let mut max_mean_curvature: f32 = 0.0;
    let mut i = 3;
    while i < out.vert_properties.len() {
        max_mean_curvature = max_mean_curvature.max(out.vert_properties[i].abs());
        i += num_prop;
    }
    assert!((max_mean_curvature - 1.63).abs() < 0.01,
        "ToLength maxMeanCurvature={}", max_mean_curvature);
}

/// C++ TEST(Smooth, Torus) — manually-smoothed torus with CircularTangent
#[test]
fn test_cpp_smooth_torus() {
    let circle = CrossSection::circle(1.0, 8).translate(Vec2::new(2.0, 0.0));
    let polygons = circle.to_polygons();
    let mut torus_mesh = Manifold::revolve(&polygons, 6, 360.0).get_mesh_gl64(0);
    let num_tri = torus_mesh.num_tri();

    // Set toroidal halfedge tangents (CircularTangent for each halfedge)
    torus_mesh.halfedge_tangent.resize(4 * 3 * num_tri, 0.0);
    for tri in 0..num_tri {
        let tri_verts = torus_mesh.get_tri_verts(tri);
        for i in 0..3usize {
            let vi = tri_verts[i] as usize;
            let vi1 = tri_verts[(i + 1) % 3] as usize;
            let vp = torus_mesh.get_vert_pos(vi);
            let vp1 = torus_mesh.get_vert_pos(vi1);
            let v = Vec3::new(vp[0], vp[1], vp[2]);
            let v1 = Vec3::new(vp1[0], vp1[1], vp1[2]);
            let edge = v1 - v;
            let tangent = if edge.z == 0.0 {
                // Horizontal edge — tangent is circumferential
                let mut tan = Vec3::new(v.y, -v.x, 0.0);
                if dot(tan, edge) < 0.0 { tan = -tan; }
                circular_tangent(tan, edge)
            } else {
                let det = v.x * edge.y - v.y * edge.x; // 2D determinant of xy parts
                if det.abs() < 1e-5 {
                    // Vertical edge — tangent is poloidal
                    let theta = v.z.asin();
                    let xy = Vec2::new(v.x, v.y);
                    let r = (xy.x * xy.x + xy.y * xy.y).sqrt();
                    let scale = v.z * if r > 2.0 { -1.0 } else { 1.0 };
                    let xy_tan = if r > 0.0 { Vec2::new(xy.x / r * scale, xy.y / r * scale) } else { Vec2::new(0.0, 0.0) };
                    let mut tan = Vec3::new(xy_tan.x, xy_tan.y, theta.cos());
                    if dot(tan, edge) < 0.0 { tan = -tan; }
                    circular_tangent(tan, edge)
                } else {
                    // Diagonal edge — no smooth tangent
                    [0.0, 0.0, 0.0, -1.0]
                }
            };
            let e = 3 * tri + i;
            for j in 0..4 {
                torus_mesh.halfedge_tangent[4 * e + j] = tangent[j];
            }
        }
    }

    let smooth = Manifold::from_mesh_gl64(&torus_mesh)
        .refine_to_length(0.1)
        .calculate_curvature(-1, 0)
        .calculate_normals(1, 60.0);
    // C++ uses GetMeshGL() (= -1, no normal processing): slot 0 here is mean
    // curvature, and CalculateNormals(1) at a non-standard slot is not recorded,
    // so nothing is auto-substituted.
    let out = smooth.get_mesh_gl(-1);
    let num_prop = out.num_prop as usize;

    // Each vertex has 7 properties: xyz (pos), mean-curvature, normal (3)
    let mut max_mean_curvature: f32 = 0.0;
    let mut i = 0;
    while i + num_prop <= out.vert_properties.len() {
        let x = out.vert_properties[i] as f64;
        let y = out.vert_properties[i + 1] as f64;
        let z = out.vert_properties[i + 2] as f64;
        let v = Vec3::new(x, y, z);
        // Project to nearest torus centerline (circle of radius 2 in xy-plane)
        let mut p = Vec3::new(x, y, 0.0);
        let plen = (p.x * p.x + p.y * p.y).sqrt();
        if plen > 1e-10 {
            p = p * (2.0 / plen);
        }
        let r = length(v - p);
        assert!((r - 1.0).abs() < 0.006, "Torus vertex r={} (expected 1.0)", r);
        max_mean_curvature = max_mean_curvature.max(out.vert_properties[i + 3].abs());
        i += num_prop;
    }
    assert!((max_mean_curvature - 1.63).abs() < 0.01,
        "Torus maxMeanCurvature={}", max_mean_curvature);
}

// C++ TEST(Smooth, SineSurface) was removed in v3.5.0 (#1724, "Fix
// CalculateNormals"): SmoothOut became self-consistent and the test's
// SmoothByNormals/SmoothOut equivalence assertions no longer applied, so
// upstream deleted it. Removed here to match.

/// C++ TEST(Smooth, SDF) — gyroid SDF with smooth normals
#[test]
fn test_cpp_smooth_sdf() {
    let r = 10.0;
    let extra = 2.0;

    let gyroid = Manifold::level_set(
        move |p: Vec3| {
            let g = p.x.cos() * p.y.sin() + p.y.cos() * p.z.sin() + p.z.cos() * p.x.sin();
            let dist = (p.x * p.x + p.y * p.y + p.z * p.z).sqrt();
            let d = (r - dist).min(0.0);
            g - d * d / 2.0
        },
        crate::types::Box {
            min: Vec3::splat(-r - extra),
            max: Vec3::splat(r + extra),
        },
        0.5,
    );

    assert!(gyroid.num_tri() < 76000, "SDF gyroid tris={}", gyroid.num_tri());
}

// ============================================================================
// Helpers
// ============================================================================

/// C++ CircularTangent() — quadratic bezier tangent for circular interpolation
fn circular_tangent(tangent: Vec3, edge_vec: Vec3) -> [f64; 4] {
    let dir = {
        let len = length(tangent);
        if len > 0.0 { tangent * (1.0 / len) } else { tangent }
    };
    let edge_len = length(edge_vec);
    let mut weight = dot(dir, edge_vec * (1.0 / edge_len)).abs();
    if weight == 0.0 { weight = 1.0; }
    // Quadratic weighted bezier for circular interpolation
    let bz2_xyz = dir * (edge_len / (2.0 * weight));
    let bz2 = [bz2_xyz.x * weight, bz2_xyz.y * weight, bz2_xyz.z * weight, weight];
    // Equivalent cubic weighted bezier: lerp(identity, bz2, 2/3)
    let t = 2.0 / 3.0;
    let bz3 = [
        (1.0 - t) * 0.0 + t * bz2[0],
        (1.0 - t) * 0.0 + t * bz2[1],
        (1.0 - t) * 0.0 + t * bz2[2],
        (1.0 - t) * 1.0 + t * bz2[3],
    ];
    // Convert from homogeneous to geometric form
    let w = bz3[3];
    [bz3[0] / w, bz3[1] / w, bz3[2] / w, w]
}

/// C++ Csaszar() — Csaszar polyhedron MeshGL
pub(super) fn csaszar_gl() -> MeshGL {
    let mut gl = MeshGL::default();
    gl.num_prop = 3;
    gl.vert_properties = vec![
        -20.0, -20.0, -10.0,
        -20.0,  20.0, -15.0,
         -5.0,  -8.0,   8.0,
          0.0,   0.0,  30.0,
          5.0,   8.0,   8.0,
         20.0, -20.0, -15.0,
         20.0,  20.0, -10.0,
    ];
    gl.tri_verts = vec![
        1, 3, 6, 1, 6, 5, 2, 5, 6, 0, 2, 6, 0, 6, 4, 3, 4, 6,
        1, 2, 3, 1, 4, 2, 1, 0, 4, 1, 5, 0, 3, 5, 4, 0, 5, 3,
        0, 3, 2, 2, 4, 5,
    ];
    gl.run_original_id = vec![crate::impl_mesh::reserve_ids(1) as u32];
    gl
}

/// C++ TEST(Smooth, MissingNormals) — smooth with zero-length normals at boolean boundary
#[test]
fn test_cpp_smooth_missing_normals() {
    let tet_norm = Manifold::tetrahedron().calculate_normals(0, 60.0);
    let diff = tet_norm.difference(&Manifold::tetrahedron().translate(Vec3::new(0.5, 0.5, 0.5)));
    let out = diff.smooth_by_normals(0).refine(10);
    assert!((out.volume() - 2.46).abs() < 0.01,
        "MissingNormals vol={}", out.volume());
    assert!((out.surface_area() - 12.45).abs() < 0.01,
        "MissingNormals sa={}", out.surface_area());
}

/// C++ TEST(Smooth, MissingNormalsCone) — smooth cone with missing normals at cut
#[test]
fn test_cpp_smooth_missing_normals_cone() {
    let cone = Manifold::cylinder(10.0, 10.0, 0.0, 5).calculate_normals(0, 60.0);
    let cube = Manifold::cube(Vec3::splat(10.0), true).translate(Vec3::new(0.0, 0.0, 10.0));
    let diff = cone.difference(&cube);
    let out = diff.smooth_by_normals(0).refine(20);
    assert!((out.volume() - 1009.0).abs() < 1.0,
        "MissingNormalsCone vol={}", out.volume());
    assert!((out.surface_area() - 736.0).abs() < 1.0,
        "MissingNormalsCone sa={}", out.surface_area());
}

/// C++ TEST(Smooth, InvalidTangents) — corrupted w=-1 tangents → InvalidTangents error
#[test]
fn test_cpp_smooth_invalid_tangents() {
    use crate::types::Error;
    let cube = Manifold::cube(Vec3::splat(1.0), false).smooth_out(180.0, 0.0);
    let with_tangents = cube.get_mesh_gl(0);
    let size_halfedges = with_tangents.halfedge_tangent.len();
    // Mark second half of tangents as kInsideQuad (-1), which is invalid
    let mut mesh = with_tangents;
    let mut i = (size_halfedges / 8) * 4 + 3;
    while i < size_halfedges {
        mesh.halfedge_tangent[i] = -1.0;
        i += 4;
    }
    let cube2 = Manifold::from_mesh_gl(&mesh);
    let smooth = cube2.refine(10);
    assert_eq!(smooth.status(), Error::InvalidTangents,
        "Expected InvalidTangents, got {:?}", smooth.status());
}

/// C++ TEST(Manifold, MeshRelationRefine) — position colors preserved after RefineToLength
#[test]
fn test_cpp_mesh_relation_refine() {
    let csaszar_manifold = Manifold::from_mesh_gl(&csaszar_gl());
    let csaszar = with_position_colors(&csaszar_manifold).as_original();
    let in_gl = csaszar.get_mesh_gl(0);

    super::related_gl(&csaszar, &[&in_gl]);

    // Check mesh sizes after refine to length 1
    let refined = csaszar.refine_to_length(1.0);
    assert!(!refined.is_empty(), "MeshRelationRefine: result is empty");
    assert!(refined.matches_tri_normals(), "MeshRelationRefine: normals don't match tris");
    assert_eq!(refined.num_vert(), 9019,
        "MeshRelationRefine: expected 9019 verts, got {}", refined.num_vert());
    assert_eq!(refined.num_tri(), 18038,
        "MeshRelationRefine: expected 18038 tris, got {}", refined.num_tri());
    assert_eq!(refined.num_prop(), 3,
        "MeshRelationRefine: expected num_prop=3, got {}", refined.num_prop());
    super::related_gl(&refined, &[&in_gl]);
}

/// C++ TEST(Manifold, MeshRelationRefinePrecision) — smooth mesh with RefineToTolerance
#[test]
fn test_cpp_mesh_relation_refine_precision() {
    let csaszar_manifold = Manifold::from_mesh_gl(&csaszar_gl());
    let in_gl = with_position_colors(&csaszar_manifold).get_mesh_gl(0);
    let id = in_gl.run_original_id[0];
    let csaszar = Manifold::smooth(&in_gl, &[]);

    let refined = csaszar.refine_to_tolerance(0.05);
    assert!(!refined.is_empty(), "MeshRelationRefinePrecision: result is empty");
    assert!(refined.matches_tri_normals(), "MeshRelationRefinePrecision: normals don't match tris");
    // C++ v3.5.0 expects {{2343, 4686, 3}} after the #1724/#1671 smoothing fixes.
    assert_eq!(refined.num_vert(), 2343,
        "MeshRelationRefinePrecision: expected 2343 verts, got {}", refined.num_vert());
    assert_eq!(refined.num_tri(), 4686,
        "MeshRelationRefinePrecision: expected 4686 tris, got {}", refined.num_tri());
    assert_eq!(refined.num_prop(), 3,
        "MeshRelationRefinePrecision: expected num_prop=3, got {}", refined.num_prop());
    // Verify the run original ID is preserved
    let out_gl = refined.get_mesh_gl(0);
    assert_eq!(out_gl.run_original_id.len(), 1);
    assert_eq!(out_gl.run_original_id[0], id,
        "MeshRelationRefinePrecision: original ID not preserved");
}

/// C++ TEST(Smooth, Sphere) — smoothed sphere vertices stay near radius 1
#[test]
fn test_cpp_smooth_sphere() {
    let ns = [4i32, 8, 16, 32, 64];
    // Tests vertex precision of interpolation. Refine(6) makes a center point,
    // which is the worst case for deviation from the unit sphere.
    let precisions = [0.04_f64, 0.003, 0.003, 0.0005, 0.00006];
    for (i, &n) in ns.iter().enumerate() {
        let sphere = Manifold::sphere(1.0, n);
        let smoothed = Manifold::smooth(&sphere.get_mesh_gl(0), &[]).refine(6);
        let mesh = smoothed.get_mesh_gl64(0);
        let num_vert = mesh.num_vert();
        let mut max_r2 = 0.0_f64;
        let mut min_r2 = 2.0_f64;
        for v in 0..num_vert {
            let p = mesh.get_vert_pos(v);
            let r2 = p[0] * p[0] + p[1] * p[1] + p[2] * p[2];
            if r2 > max_r2 { max_r2 = r2; }
            if r2 < min_r2 { min_r2 = r2; }
        }
        let prec = precisions[i];
        assert!((min_r2.sqrt() - 1.0).abs() < prec,
            "Sphere n={n}: min_r={:.6} expected ≈1.0 within {prec}", min_r2.sqrt());
        assert!((max_r2.sqrt() - 1.0).abs() < prec,
            "Sphere n={n}: max_r={:.6} expected ≈1.0 within {prec}", max_r2.sqrt());
    }
}

/// C++ TEST(Smooth, Fillet) — smoke test: Simplify+SmoothByNormals must not crash
#[test]
fn test_cpp_smooth_fillet() {
    let depth = 3.0_f64;
    let cylinder = Manifold::cylinder(40.0, 10.0, 10.0, 6).calculate_normals(0, 80.0);
    let slice = cylinder.slice(0.0);
    let section = CrossSection::new(slice.to_polygons()).simplify(1e-6);
    let chamfer = Manifold::extrude(
        &section.to_polygons(), depth, 0, 0.0, crate::linalg::Vec2::new(1.2, 1.3),
    ).mirror(Vec3::new(0.0, 0.0, 1.0));
    let base = Manifold::cube(Vec3::splat(40.0), true)
        .translate(Vec3::new(0.0, 0.0, -20.0 - depth + 0.001))
        .calculate_normals(0, 60.0);
    let chamfered = (cylinder + chamfer).difference(&base);
    let fillet = chamfered.simplify(0.01).smooth_by_normals(0).refine(10);
    assert_eq!(fillet.status(), crate::types::Error::NoError,
        "Fillet status={:?}", fillet.status());
}

/// C++ TEST(Manifold, MeshRelation) — gyroid with position colors, RelatedGL after simplify
#[test]
fn test_cpp_mesh_relation() {
    let gyroid = super::with_position_colors(&super::gyroid());
    let gyroid_gl = gyroid.get_mesh_gl(0);
    let simplified = gyroid.simplify(0.0);
    super::related_gl(&simplified, &[&gyroid_gl]);
}

/// C++ WithPositionColors() — set properties to normalized position
fn with_position_colors(m: &Manifold) -> Manifold {
    let bbox = m.bounding_box();
    let size = Vec3::new(
        bbox.max.x - bbox.min.x,
        bbox.max.y - bbox.min.y,
        bbox.max.z - bbox.min.z,
    );
    m.set_properties(3, move |prop: &mut [f64], pos: Vec3, _old: &[f64]| {
        prop[0] = if size.x > 0.0 { (pos.x - bbox.min.x) / size.x } else { 0.0 };
        prop[1] = if size.y > 0.0 { (pos.y - bbox.min.y) / size.y } else { 0.0 };
        prop[2] = if size.z > 0.0 { (pos.z - bbox.min.z) / size.z } else { 0.0 };
    })
}
