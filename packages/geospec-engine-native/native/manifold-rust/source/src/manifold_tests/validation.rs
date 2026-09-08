use super::*;
use std::collections::HashSet;

// ============================================================================
// Helper
// ============================================================================

fn num_unique(vals: &[u32]) -> usize {
    vals.iter().copied().collect::<HashSet<u32>>().len()
}

// ============================================================================
// C++ InvalidInput tests
// ============================================================================

/// C++ TEST(Manifold, InvalidInput1) — NaN vertex
#[test]
fn test_cpp_invalid_input1() {
    let mut gl = super::api::tet_gl();
    gl.vert_properties[2 * 5 + 1] = f32::NAN; // 5 props per vert
    let tet = Manifold::from_mesh_gl(&gl);
    assert!(tet.is_empty());
    assert_eq!(tet.status(), crate::types::Error::NonFiniteVertex);
}

/// C++ TEST(Manifold, InvalidInput2) — swapped tri indices → not manifold
#[test]
fn test_cpp_invalid_input2() {
    let mut gl = super::api::tet_gl();
    gl.tri_verts.swap(2 * 3 + 1, 2 * 3 + 2);
    let tet = Manifold::from_mesh_gl(&gl);
    assert!(tet.is_empty());
    assert_eq!(tet.status(), crate::types::Error::NotManifold);
}

/// C++ TEST(Manifold, InvalidInput3) — vertex index = -2 (wraps to huge u32)
#[test]
fn test_cpp_invalid_input3() {
    let mut gl = super::api::tet_gl();
    // C++ sets uint32_t to -2 which wraps; in Rust u32 wrapping: (-2i32 as u32)
    let bad_val = (-2i32) as u32;
    for v in gl.tri_verts.iter_mut() {
        if *v == 2 {
            *v = bad_val;
        }
    }
    let tet = Manifold::from_mesh_gl(&gl);
    assert!(tet.is_empty());
    assert_eq!(tet.status(), crate::types::Error::VertexOutOfBounds);
}

/// C++ TEST(Manifold, InvalidInput4) — vertex index = 4 (out of bounds) → not manifold
#[test]
fn test_cpp_invalid_input4() {
    let mut gl = super::api::tet_gl();
    for v in gl.tri_verts.iter_mut() {
        if *v == 2 {
            *v = 4;
        }
    }
    let tet = Manifold::from_mesh_gl(&gl);
    assert!(tet.is_empty());
    assert_eq!(tet.status(), crate::types::Error::NotManifold);
}

/// C++ TEST(Manifold, InvalidInput5) — merge index out of bounds
#[test]
fn test_cpp_invalid_input5() {
    let mut gl = super::api::tet_gl();
    let last = gl.merge_from_vert.len() - 1;
    gl.merge_from_vert[last] = 7;
    let tet = Manifold::from_mesh_gl(&gl);
    assert!(tet.is_empty());
    assert_eq!(tet.status(), crate::types::Error::MergeIndexOutOfBounds);
}

/// C++ TEST(Manifold, InvalidInput6) — tri_verts index out of bounds
#[test]
fn test_cpp_invalid_input6() {
    let mut gl = super::api::tet_gl();
    let last = gl.tri_verts.len() - 1;
    gl.tri_verts[last] = 7;
    let tet = Manifold::from_mesh_gl(&gl);
    assert!(tet.is_empty());
    assert_eq!(tet.status(), crate::types::Error::VertexOutOfBounds);
}

/// C++ TEST(Manifold, InvalidInput7) — run_index wrong length
#[test]
fn test_cpp_invalid_input7() {
    let mut gl = super::api::cube_uv();
    gl.run_index = vec![0, 1, gl.tri_verts.len() as u32];
    let m = Manifold::from_mesh_gl(&gl);
    assert!(m.is_empty());
    assert_eq!(m.status(), crate::types::Error::RunIndexWrongLength);
}

/// C++ TEST(Manifold, Invalid) — invalid constructor parameters
#[test]
fn test_cpp_invalid() {
    let invalid = crate::types::Error::InvalidConstruction;

    assert_eq!(Manifold::sphere(0.0, 0).status(), invalid, "Sphere(0)");
    assert_eq!(Manifold::cylinder(0.0, 5.0, -1.0, 0).status(), invalid, "Cylinder(0,5)");
    assert_eq!(Manifold::cylinder(2.0, -5.0, -1.0, 0).status(), invalid, "Cylinder(2,-5)");
    assert_eq!(Manifold::cylinder(2.0, 0.0, -1.0, 0).status(), invalid, "Cylinder(2,0)");
    assert_eq!(Manifold::cylinder(2.0, 0.0, 0.0, 0).status(), invalid, "Cylinder(2,0,0)");
    assert_eq!(Manifold::cube(Vec3::new(0.0, 0.0, 0.0), false).status(), invalid, "Cube(0)");
    assert_eq!(Manifold::cube(Vec3::new(-1.0, 1.0, 1.0), false).status(), invalid, "Cube(-1,1,1)");

    // Extrude with zero height
    let circ = CrossSection::circle(10.0, 0);
    assert_eq!(Manifold::extrude(&circ.to_polygons(), 0.0, 0, 0.0, Vec2::new(1.0, 1.0)).status(), invalid, "Extrude(h=0)");

    // Extrude with empty cross-section (negative radius → empty)
    let empty_circ = CrossSection::circle(-2.0, 0);
    assert_eq!(Manifold::extrude(&empty_circ.to_polygons(), 10.0, 0, 0.0, Vec2::new(1.0, 1.0)).status(), invalid, "Extrude(empty)");

    // Revolve with empty cross-section
    let empty_sq = CrossSection::square(0.0);
    assert_eq!(Manifold::revolve(&empty_sq.to_polygons(), 0, 360.0).status(), invalid, "Revolve(empty)");
}

/// C++ TEST(Manifold, FaceIDRoundTrip) — custom face IDs preserved
#[test]
fn test_cpp_face_id_round_trip() {
    let cube = Manifold::cube(Vec3::splat(1.0), false);
    assert!(cube.original_id() >= 0);
    let mut in_gl = cube.get_mesh_gl(0);
    assert_eq!(num_unique(&in_gl.face_id), 6, "Cube should have 6 unique face IDs");

    // Set custom face IDs: first 6 tris = face 3, last 6 tris = face 5
    in_gl.face_id = vec![3, 3, 3, 3, 3, 3, 5, 5, 5, 5, 5, 5];

    let cube2 = Manifold::from_mesh_gl(&in_gl);
    let out_gl = cube2.get_mesh_gl(0);
    assert_eq!(num_unique(&out_gl.face_id), 2, "Should have 2 unique face IDs after round-trip");
}

/// C++ TEST(Manifold, MeshGLRoundTrip) — cylinder round-trip preserves originalID
#[test]
fn test_cpp_manifold_meshgl_round_trip() {
    let cylinder = Manifold::cylinder(2.0, 1.0, -1.0, 0);
    assert!(cylinder.original_id() >= 0);
    let in_gl = cylinder.get_mesh_gl(0);
    let cylinder2 = Manifold::from_mesh_gl(&in_gl);
    let out_gl = cylinder2.get_mesh_gl(0);

    assert_eq!(in_gl.run_original_id.len(), 1);
    assert_eq!(out_gl.run_original_id.len(), 1);
    assert_eq!(out_gl.run_original_id[0], in_gl.run_original_id[0]);
}

// ============================================================================
// C++ Boolean tests: edge/corner/coplanar/perturb
// ============================================================================

// TreeTransforms already ported in advanced.rs

/// C++ TEST(Boolean, Perturb) — self-subtraction of tetrahedron
#[test]
fn test_cpp_perturb() {
    let mut tmp = MeshGL::default();
    tmp.num_prop = 3;
    tmp.vert_properties = vec![
        0.0, 0.0, 0.0,
        0.0, 1.0, 0.0,
        1.0, 0.0, 0.0,
        0.0, 0.0, 1.0,
    ];
    tmp.tri_verts = vec![
        2, 0, 1,
        0, 3, 1,
        2, 3, 0,
        3, 2, 1,
    ];
    let corner = Manifold::from_mesh_gl(&tmp);
    assert!(!corner.is_empty(), "corner tet should be valid");

    let empty = corner.clone() - corner;
    assert!(empty.is_empty(), "self-subtraction should be empty");
    assert!((empty.volume()).abs() < 1e-10, "volume={}", empty.volume());
    assert!((empty.surface_area()).abs() < 1e-10, "sa={}", empty.surface_area());
}

/// C++ TEST(Boolean, EdgeUnion) — cubes touching at edge remain separate
#[test]
fn test_cpp_edge_union() {
    let mut cubes = Manifold::cube(Vec3::splat(1.0), false);
    cubes = cubes + Manifold::cube(Vec3::splat(1.0), false).translate(Vec3::new(1.0, 1.0, 0.0));
    // Two separate cubes touching at edge — should remain 2 components
    assert_eq!(cubes.num_vert(), 16, "EdgeUnion: 2×8 verts");
    assert_eq!(cubes.num_tri(), 24, "EdgeUnion: 2×12 tris");
    assert!((cubes.volume() - 2.0).abs() < 1e-5);
}

// CornerUnion already ported in advanced.rs

/// C++ TEST(Boolean, AlmostCoplanar) — union of nearly-coplanar tetrahedra
///
/// Passes since `Manifold::rotate` was ported to the C++ matrix construction
/// (bit-exact rotation matrices via a local remquo-sind) and `face2tri` was
/// rewritten to the C++ v3.5.0 halfedge-index pairing scheme (robust to the
/// exactly-coplanar faces the corrected rotation produces).
#[test]
fn test_cpp_almost_coplanar() {
    let tet = Manifold::tetrahedron();
    let result = tet.clone()
        + tet.clone().rotate(0.001, -0.08472872823860228, 0.055910459615905288)
        + tet;
    assert_eq!(result.num_vert(), 20, "AlmostCoplanar: expected 20 verts, got {}", result.num_vert());
    assert_eq!(result.num_tri(), 36, "AlmostCoplanar: expected 36 tris, got {}", result.num_tri());
}

/// C++ TEST(Boolean, Coplanar) — cylinder difference with coplanar faces
#[test]
fn test_cpp_coplanar() {
    let cylinder = Manifold::cylinder(1.0, 1.0, -1.0, 0);
    let cylinder2 = cylinder.clone().scale(Vec3::new(0.8, 0.8, 1.0)).rotate(0.0, 0.0, 185.0);
    let out = cylinder - cylinder2;
    assert_eq!(out.status(), crate::types::Error::NoError);
    assert_eq!(out.genus(), 1, "Coplanar: genus should be 1, got {}", out.genus());
    assert_eq!(out.num_degenerate_tris(), 0, "No degenerate tris");
}

/// C++ TEST(Boolean, MeshGLRoundTrip) — boolean result round-trips through MeshGL
#[test]
fn test_cpp_boolean_meshgl_round_trip() {
    let cube = Manifold::cube(Vec3::splat(2.0), false);
    assert!(cube.original_id() >= 0);
    let original = cube.get_mesh_gl(0);

    let result = cube.clone() + cube.translate(Vec3::new(1.0, 1.0, 0.0));
    assert!(result.original_id() < 0);
    assert_eq!(result.num_vert(), 18, "BoolMeshGL: expected 18 verts, got {}", result.num_vert());
    assert_eq!(result.num_tri(), 32, "BoolMeshGL: expected 32 tris, got {}", result.num_tri());
    super::related_gl(&result, &[&original]);

    let in_gl = result.get_mesh_gl(0);
    assert_eq!(in_gl.run_original_id.len(), 2);

    let result2 = Manifold::from_mesh_gl(&in_gl);
    assert!(result2.original_id() < 0);
    assert_eq!(result2.num_vert(), 18, "BoolMeshGL rt: expected 18 verts, got {}", result2.num_vert());
    assert_eq!(result2.num_tri(), 32, "BoolMeshGL rt: expected 32 tris, got {}", result2.num_tri());
    super::related_gl(&result2, &[&original]);

    let out_gl = result2.get_mesh_gl(0);
    assert_eq!(out_gl.run_original_id.len(), 2);
}

// ============================================================================
// C++ Manifold constructor & geometry tests
// ============================================================================

/// C++ TEST(Manifold, Sphere) — sphere triangle count with n=25
#[test]
fn test_cpp_sphere_tri_count_n25() {
    let n = 25;
    let sphere = Manifold::sphere(1.0, 4 * n);
    assert_eq!(sphere.num_tri(), (n * n * 8) as usize,
        "Sphere tri count: expected {}, got {}", n * n * 8, sphere.num_tri());
}

// MeshID test already ported in advanced.rs as test_cpp_manifold_mesh_id

/// C++ TEST(Manifold, Slice) — slice cube at z=0 and z=1
#[test]
fn test_cpp_slice() {
    let cube = Manifold::cube(Vec3::splat(1.0), false);
    let bottom = cube.slice(0.0);
    let top = cube.slice(1.0);
    assert!((bottom.area() - 1.0).abs() < 1e-10,
        "Slice at z=0 area={}, expected 1.0", bottom.area());
    assert!((top.area()).abs() < 1e-10,
        "Slice at z=1 area={}, expected 0.0", top.area());
}

/// C++ TEST(Manifold, SliceEmptyObject) — slice empty manifold doesn't crash
#[test]
fn test_cpp_slice_empty_object() {
    let empty = Manifold::new();
    assert!(empty.is_empty());
    let _bottom = empty.slice(0.0);
    // Just verify it doesn't crash
}

/// C++ TEST(Manifold, Project) — project 3D mesh to 2D cross-section
#[test]
fn test_cpp_project() {
    let mut input = MeshGL::default();
    input.num_prop = 3;
    input.vert_properties = vec![
        0.0, 0.0, 0.0,
        -2.0, -0.7, -0.1,
        -2.0, -0.7, 0.0,
        -1.9, -0.7, -0.1,
        -1.9, -0.6901, -0.1,
        -1.9, -0.7, 0.0,
        -1.9, -0.6901, 0.0,
        -2.0, -1.0, 3.0,
        -1.9, -1.0, 3.0,
        -2.0, -1.0, 4.0,
        -1.9, -1.0, 4.0,
        -1.9, -0.6901, 3.0,
        -1.9, -0.6901, 4.0,
        -1.7, -0.6901, 3.0,
        -1.7, -0.6901, 3.2,
        -2.0, 0.0, -0.1,
        -2.0, 0.0, 0.0,
        -2.0, 0.0, 3.0,
        -2.0, 0.0, 4.0,
        -1.7, 0.0, 3.0,
        -1.7, 0.0, 3.2,
        -1.0, -0.6901, -0.1,
        -1.0, -0.6901, 0.0,
        -1.0, -0.6901, 3.2,
        -1.0, -0.6901, 4.0,
        -1.0, 0.0, -0.1,
        -1.0, 0.0, 0.0,
        -1.0, 0.0, 3.2,
        -1.0, 0.0, 4.0,
    ];
    input.tri_verts = vec![
        1, 3, 2, 1, 4, 3, 2, 3, 5, 5, 6, 2, 3, 4, 6, 5, 3, 6,
        6, 4, 21, 26, 22, 25, 21, 25, 22, 25, 15, 26, 26, 6, 22,
        21, 4, 25, 21, 22, 6, 16, 26, 15, 16, 6, 26, 4, 15, 25,
        15, 1, 16, 16, 2, 6, 4, 1, 15, 1, 2, 16, 12, 14, 23,
        12, 13, 14, 12, 11, 13, 18, 9, 12, 11, 7, 17, 7, 9, 18,
        17, 7, 18, 13, 11, 19, 17, 18, 20, 19, 11, 17, 19, 17, 20,
        14, 13, 20, 18, 12, 24, 20, 13, 19, 20, 18, 27, 12, 10, 11,
        24, 12, 23, 9, 10, 12, 9, 8, 10, 8, 11, 10, 8, 7, 11,
        8, 9, 7, 14, 20, 27, 24, 28, 18, 27, 18, 28, 23, 14, 27,
        24, 23, 28, 28, 23, 27,
    ];
    let m = Manifold::from_mesh_gl(&input);
    let projected = m.project();
    assert!((projected.area() - 0.72).abs() < 0.01,
        "Project area={}, expected 0.72", projected.area());
}

// ============================================================================
// C++ OBJ-based boolean regression tests
// ============================================================================

/// C++ TEST(BooleanComplex, CraycloudBool)
#[test]
fn test_cpp_craycloud_bool() {
    let m1 = super::read_test_obj("Cray_left.obj");
    let m2 = super::read_test_obj("Cray_right.obj");
    let res = m1 - m2;
    assert_eq!(res.status(), crate::types::Error::NoError);
    assert!(!res.is_empty(), "CraycloudBool result should not be empty");
    let simplified = res.as_original().simplify(0.0);
    assert!(simplified.is_empty(), "CraycloudBool simplified should be empty");
}

/// C++ TEST(BooleanComplex, GenericTwinBooleanTest7081)
#[test]
#[ignore = "Slow in debug only — passes in release (~18s; C++ takes ~50s). No longer hangs \
            after the RecursiveEdgeSwap FormLoop / edge<0 fix in edge_op.rs. Kept ignored \
            for debug-suite speed, like sdf_blobs/hull_sphere."]
fn test_cpp_generic_twin_7081() {
    let m1 = super::read_test_obj("Generic_Twin_7081.1.t0_left.obj");
    let m2 = super::read_test_obj("Generic_Twin_7081.1.t0_right.obj");
    let res = m1 + m2;
    let _gl = res.get_mesh_gl(0); // C++ test: just checks this doesn't crash
}

/// C++ TEST(BooleanComplex, GenericTwinBooleanTest7863)
#[test]
fn test_cpp_generic_twin_7863() {
    let m1 = super::read_test_obj("Generic_Twin_7863.1.t0_left.obj");
    let m2 = super::read_test_obj("Generic_Twin_7863.1.t0_right.obj");
    let res = m1 + m2;
    let _gl = res.get_mesh_gl(0);
}

/// C++ TEST(BooleanComplex, Havocglass8Bool)
#[test]
fn test_cpp_havocglass8_bool() {
    let m1 = super::read_test_obj("Havocglass8_left.obj");
    let m2 = super::read_test_obj("Havocglass8_right.obj");
    let res = m1 - m2;
    assert_eq!(res.status(), crate::types::Error::NoError);
}

/// C++ TEST(BooleanComplex, HullMask)
#[test]
fn test_cpp_hull_mask() {
    let body = super::read_test_obj("hull-body.obj");
    let mask = super::read_test_obj("hull-mask.obj");
    let res = body - mask;
    assert_eq!(res.status(), crate::types::Error::NoError);
    assert!(!res.is_empty());
}

/// C++ TEST(BooleanComplex, SelfIntersect) — tests with self-intersecting OBJ inputs
#[test]
fn test_cpp_self_intersect() {
    let a = super::read_test_obj("self_intersectA.obj");
    let b = super::read_test_obj("self_intersectB.obj");
    let res = a - b;
    assert_eq!(res.status(), crate::types::Error::NoError);
}

/// C++ TEST(Manifold, Warp2) — extrude + warp + batch boolean
#[test]
fn test_cpp_warp2() {
    let circle = CrossSection::circle(5.0, 20).translate(Vec2::new(10.0, 10.0));
    let pi = std::f64::consts::PI;

    let shape = Manifold::extrude(&circle.to_polygons(), 2.0, 10, 0.0, Vec2::new(1.0, 1.0))
        .warp(|v| {
            let n_segments = 10;
            let angle_step = 2.0 / 3.0 * pi / n_segments as f64;
            let z_index = n_segments as f64 - 1.0 - v.z.round();
            let angle = z_index * angle_step;
            let new_z = v.y;
            let new_y = v.x * angle.sin();
            let new_x = v.x * angle.cos();
            *v = Vec3::new(new_x, new_y, new_z);
        });

    let simplified = Manifold::batch_boolean(&[shape.clone()], crate::types::OpType::Add);
    assert!((shape.volume() - simplified.volume()).abs() < 0.0001,
        "Warp2: volumes differ {} vs {}", shape.volume(), simplified.volume());
    assert!((shape.surface_area() - simplified.surface_area()).abs() < 0.0001,
        "Warp2: areas differ");
    assert!((shape.volume() - 321.0).abs() < 1.0,
        "Warp2: volume={}, expected ~321", shape.volume());
}

/// C++ TEST(Boolean, Precision2) — intersection at precision boundary
#[test]
fn test_cpp_boolean_precision2() {
    let k_precision: f64 = 1e-12;
    let scale = 1000.0f64;
    let cube = Manifold::cube(Vec3::splat(scale), false);
    let distance = scale * (1.0 - k_precision / 2.0);

    // Overlap = scale - distance = scale * kPrecision / 2 = 5e-10 < epsilon (1e-9) → empty
    let cube2 = cube.translate(Vec3::splat(-distance));
    assert!(cube.intersection(&cube2).is_empty(),
        "Precision2: intersection below epsilon should be empty");

    // Add kPrecision * scale ≈ 1e-9 more overlap → now above epsilon → not empty
    let cube2 = cube2.translate(Vec3::splat(scale * k_precision));
    assert!(!cube.intersection(&cube2).is_empty(),
        "Precision2: intersection above epsilon should not be empty");
}

/// C++ TEST(Boolean, TreeTransforms) — transforms are correctly applied through union trees.
/// Two cubes overlapping → union volume = 2.
#[test]
fn test_cpp_tree_transforms() {
    let a = (Manifold::cube(Vec3::splat(1.0), false)
        .union(&Manifold::cube(Vec3::splat(1.0), false)))
        .translate(Vec3::new(1.0, 0.0, 0.0));
    let b = Manifold::cube(Vec3::splat(1.0), false)
        .union(&Manifold::cube(Vec3::splat(1.0), false));
    let vol = a.union(&b).volume();
    assert!((vol - 2.0).abs() < 1e-5, "TreeTransforms: volume={:.6}, expected 2.0", vol);
}

/// C++ TEST(Boolean, Normals) — boolean result with normals validated via RelatedGL with checkNormals.
/// Uses CubeSTL (6 props per vert: xyz+normal) and sphere with CalculateNormals, then checks
/// the boolean result has valid unit normals pointing in the correct direction.
#[test]
fn test_cpp_boolean_normals() {
    let mut cube_gl = super::cube_stl();
    cube_gl.merge();
    let cube = Manifold::from_mesh_gl(&cube_gl);
    let sphere = Manifold::sphere(60.0, 0).calculate_normals(0, 60.0);
    let sphere_gl = sphere.get_mesh_gl(0);

    let result = cube.scale(Vec3::splat(100.0))
        .difference(
            &sphere.rotate(180.0, 0.0, 0.0)
                .difference(&sphere.scale(Vec3::splat(0.5)).rotate(90.0, 0.0, 0.0).translate(Vec3::new(40.0, 40.0, 40.0)))
        );

    super::related_gl_check_normals(&result, &[&cube_gl, &sphere_gl]);

    // Round-trip: export, clear merge verts, re-merge, re-import, check again
    let mut output = result.get_mesh_gl(0);
    output.merge_from_vert.clear();
    output.merge_to_vert.clear();
    output.merge();
    let round_trip = Manifold::from_mesh_gl(&output);
    super::related_gl_check_normals(&round_trip, &[&cube_gl, &sphere_gl]);
}

/// C++ TEST(Boolean, EmptyOriginal) — tet minus non-intersecting cube
/// Verifies run metadata: 2 runs (tet with tris, cube with 0 tris),
/// and that the cube's run transform preserves the translation.
#[test]
fn test_cpp_empty_original() {
    let cube = Manifold::cube(Vec3::splat(1.0), false);
    let tet = Manifold::tetrahedron();
    let result = tet.difference(&cube.translate(Vec3::new(3.0, 4.0, 5.0)));
    let mesh = result.get_mesh_gl(0);

    assert_eq!(mesh.run_index.len(), 3,
        "EmptyOriginal: expected 3 run_index entries, got {}", mesh.run_index.len());
    assert_eq!(mesh.run_index[0], 0, "EmptyOriginal: first run starts at 0");
    assert_eq!(mesh.run_index[1], mesh.tri_verts.len() as u32,
        "EmptyOriginal: tet run ends at all tris");
    assert_eq!(mesh.run_index[2], mesh.tri_verts.len() as u32,
        "EmptyOriginal: cube run is empty");
    assert_eq!(mesh.run_original_id.len(), 2,
        "EmptyOriginal: expected 2 run_original_ids, got {}", mesh.run_original_id.len());
    assert_eq!(mesh.run_original_id[0], tet.original_id() as u32,
        "EmptyOriginal: first run is tet");
    assert_eq!(mesh.run_original_id[1], cube.original_id() as u32,
        "EmptyOriginal: second run is cube");
    assert_eq!(mesh.run_transform.len(), 24,
        "EmptyOriginal: expected 24 transform elements, got {}", mesh.run_transform.len());
    // Tet transform: identity — translation at column 3 (indices 9,10,11) = 0,0,0
    assert!((mesh.run_transform[9] - 0.0f32).abs() < 1e-5, "EmptyOriginal: tet tx=0");
    assert!((mesh.run_transform[10] - 0.0f32).abs() < 1e-5, "EmptyOriginal: tet ty=0");
    assert!((mesh.run_transform[11] - 0.0f32).abs() < 1e-5, "EmptyOriginal: tet tz=0");
    // Cube transform: translated by (3,4,5) — indices 21,22,23
    assert!((mesh.run_transform[12 + 9] - 3.0f32).abs() < 1e-4, "EmptyOriginal: cube tx=3");
    assert!((mesh.run_transform[12 + 10] - 4.0f32).abs() < 1e-4, "EmptyOriginal: cube ty=4");
    assert!((mesh.run_transform[12 + 11] - 5.0f32).abs() < 1e-4, "EmptyOriginal: cube tz=5");
}
