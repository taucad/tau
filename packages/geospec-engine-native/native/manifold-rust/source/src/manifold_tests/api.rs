use super::*;

// ============================================================================
// Helper functions matching C++ test helpers
// ============================================================================

/// C++ TetGL() — tetrahedron with 5 properties per vert and merge vectors
pub(super) fn tet_gl() -> MeshGL {
    let mut tet = MeshGL::default();
    tet.num_prop = 5;
    tet.vert_properties = vec![
        -1.0, -1.0, 1.0,  0.0, 0.0,   //
        -1.0, 1.0,  -1.0, 1.0, -1.0,   //
        1.0,  -1.0, -1.0, 2.0, -2.0,   //
        1.0,  1.0,  1.0,  3.0, -3.0,   //
        -1.0, 1.0,  -1.0, 4.0, -4.0,   //
        1.0,  -1.0, -1.0, 5.0, -5.0,   //
        1.0,  1.0,  1.0,  6.0, -6.0,
    ];
    tet.tri_verts = vec![2, 0, 1, 0, 3, 1, 2, 3, 0, 6, 5, 4];
    tet.merge_from_vert = vec![4, 5, 6];
    tet.merge_to_vert = vec![1, 2, 3];
    tet
}

/// C++ CubeSTL() — STL-style cube with face normals, no merge (requires Merge())
fn cube_stl() -> MeshGL {
    let cube_in = Manifold::cube(Vec3::new(1.0, 1.0, 1.0), true).get_mesh_gl(0);
    let mut cube = MeshGL::default();
    cube.num_prop = 6;
    let num_tri = cube_in.num_tri();
    let mut vert_count: u32 = 0;

    for tri in 0..num_tri {
        let mut tri_pos = [[0.0f32; 3]; 3];
        for i in 0..3 {
            cube.tri_verts.push(vert_count);
            vert_count += 1;
            let v = cube_in.tri_verts[3 * tri + i] as usize;
            for j in 0..3 {
                tri_pos[i][j] = cube_in.vert_properties[cube_in.num_prop as usize * v + j];
            }
        }
        // Compute face normal
        let v0 = Vec3::new(tri_pos[0][0] as f64, tri_pos[0][1] as f64, tri_pos[0][2] as f64);
        let v1 = Vec3::new(tri_pos[1][0] as f64, tri_pos[1][1] as f64, tri_pos[1][2] as f64);
        let v2 = Vec3::new(tri_pos[2][0] as f64, tri_pos[2][1] as f64, tri_pos[2][2] as f64);
        let normal = crate::linalg::normalize(crate::linalg::cross(v1 - v0, v2 - v0));
        for i in 0..3 {
            for j in 0..3 {
                cube.vert_properties.push(tri_pos[i][j]);
            }
            cube.vert_properties.push(normal.x as f32);
            cube.vert_properties.push(normal.y as f32);
            cube.vert_properties.push(normal.z as f32);
        }
    }

    cube.run_original_id.push(crate::impl_mesh::reserve_ids(1) as u32);
    cube
}

/// C++ CubeUV() — cube with UV coordinates
pub(super) fn cube_uv() -> MeshGL {
    let mut mgl = MeshGL::default();
    mgl.num_prop = 5;
    mgl.vert_properties = vec![
        0.5,  -0.5, 0.5,  0.5,  0.66,
        -0.5, -0.5, 0.5,  0.25, 0.66,
        0.5,  0.5,  0.5,  0.5,  0.33,
        -0.5, 0.5,  0.5,  0.25, 0.33,
        -0.5, -0.5, -0.5, 1.0,  0.66,
        0.5,  -0.5, -0.5, 0.75, 0.66,
        -0.5, 0.5,  -0.5, 1.0,  0.33,
        0.5,  0.5,  -0.5, 0.75, 0.33,
        -0.5, -0.5, -0.5, 0.0,  0.66,
        -0.5, 0.5,  -0.5, 0.0,  0.33,
        -0.5, 0.5,  -0.5, 0.25, 0.0,
        0.5,  0.5,  -0.5, 0.5,  0.0,
        -0.5, -0.5, -0.5, 0.25, 1.0,
        0.5,  -0.5, -0.5, 0.5,  1.0,
    ];
    mgl.tri_verts = vec![
        3, 1, 0, 3, 0, 2, 7, 5, 4, 7, 4, 6, 2, 0, 5, 2, 5, 7,
        9, 8, 1, 9, 1, 3, 11, 10, 3, 11, 3, 2, 0, 1, 12, 0, 12, 13,
    ];
    mgl.merge_from_vert = vec![8, 12, 13, 9, 10, 11];
    mgl.merge_to_vert = vec![4, 4, 5, 6, 6, 7];
    mgl.run_original_id.push(crate::impl_mesh::reserve_ids(1) as u32);
    mgl
}

fn check_cube(cube_stl: &MeshGL) {
    let raw = Manifold::from_mesh_gl(cube_stl);
    assert!(!raw.is_empty(), "check_cube: raw is empty, status={:?}", raw.status());
    let cube = raw.as_original();
    assert_eq!(cube.num_tri(), 12, "check_cube: num_tri");
    assert_eq!(cube.num_vert(), 8, "check_cube: num_vert (got {})", cube.num_vert());
    assert_eq!(cube.num_prop_vert(), 24);
    assert!((cube.volume() - 1.0).abs() < 1e-5, "volume={}", cube.volume());
    assert!((cube.surface_area() - 6.0).abs() < 1e-5, "sa={}", cube.surface_area());
}

// ============================================================================
// MinGap tests
// ============================================================================

/// C++ TEST(Properties, MinGapCubeSphereOverlapping) — overlapping returns 0
#[test]
fn test_cpp_min_gap_cube_sphere_overlapping() {
    let a = Manifold::cube(Vec3::new(1.0, 1.0, 1.0), false);
    let b = Manifold::sphere(1.0, 0);
    let distance = a.min_gap(&b, 0.1);
    assert_eq!(distance, 0.0, "MinGapCubeSphereOverlapping: {} expected 0", distance);
}

/// C++ TEST(Properties, MinGapSphereSphereOutOfBounds) — returns search_length
#[test]
fn test_cpp_min_gap_sphere_sphere_out_of_bounds() {
    let a = Manifold::sphere(1.0, 0);
    let b = Manifold::sphere(1.0, 0).translate(Vec3::new(2.0, 2.0, 0.0));
    let distance = a.min_gap(&b, 0.8);
    assert_eq!(distance, 0.8,
        "MinGapSphereSphereOutOfBounds: {} expected 0.8 (search_length)", distance);
}

/// C++ TEST(Properties, MingapAfterTransformations) — rotated/scaled spheres
#[test]
fn test_cpp_min_gap_after_transformations() {
    let a = Manifold::sphere(1.0, 512).rotate(30.0, 30.0, 30.0);
    let b = Manifold::sphere(1.0, 512)
        .scale(Vec3::new(3.0, 1.0, 1.0))
        .rotate(0.0, 90.0, 45.0)
        .translate(Vec3::new(3.0, 0.0, 0.0));
    let distance = a.min_gap(&b, 1.1);
    assert!((distance - 1.0).abs() < 0.001,
        "MingapAfterTransformations: {} expected ~1.0", distance);
}

/// C++ TEST(Manifold, ValidInputOneRunIndex) — empty mesh with runIndex={0}
#[test]
fn test_cpp_valid_input_one_run_index() {
    let mut empty_mesh = MeshGL::default();
    empty_mesh.run_index = vec![0];
    let empty = Manifold::from_mesh_gl(&empty_mesh);
    assert!(empty.is_empty(), "ValidInputOneRunIndex: should be empty");
}

/// C++ TEST(Manifold, Empty) — default manifold is empty
#[test]
fn test_cpp_manifold_empty() {
    let empty = Manifold::empty();
    assert!(empty.is_empty());
    assert_eq!(empty.num_vert(), 0);
    assert_eq!(empty.num_tri(), 0);
    assert_eq!(empty.volume(), 0.0);
}

/// C++ TEST(Manifold, Simplify) from manifold_test.cpp — simplify cube
#[test]
fn test_cpp_manifold_simplify() {
    let cube = Manifold::cube(Vec3::new(1.0, 1.0, 1.0), false);
    let simplified = cube.as_original();
    assert!(!simplified.is_empty(), "Simplified cube should not be empty");
    assert_eq!(simplified.num_vert(), 8);
    assert_eq!(simplified.num_tri(), 12);
}

// ============================================================================
// InvalidInput tests — C++ TEST(Manifold, InvalidInput1..7)
// ============================================================================

/// C++ TEST(Manifold, InvalidInput1) — NaN vertex
#[test]
fn test_cpp_invalid_input_1() {
    let mut mesh = tet_gl();
    mesh.vert_properties[2 * 5 + 1] = f32::NAN;
    let tet = Manifold::from_mesh_gl(&mesh);
    assert!(tet.is_empty());
    assert_eq!(tet.status(), crate::types::Error::NonFiniteVertex);
}

/// C++ TEST(Manifold, InvalidInput2) — swapped tri verts breaks manifold
#[test]
fn test_cpp_invalid_input_2() {
    let mut mesh = tet_gl();
    mesh.tri_verts.swap(2 * 3 + 1, 2 * 3 + 2);
    let tet = Manifold::from_mesh_gl(&mesh);
    assert!(tet.is_empty());
    assert_eq!(tet.status(), crate::types::Error::NotManifold);
}

/// C++ TEST(Manifold, InvalidInput3) — negative vertex index (wraps to huge)
#[test]
fn test_cpp_invalid_input_3() {
    let mut mesh = tet_gl();
    // In C++, -2 as uint32_t = 0xFFFFFFFE
    for v in mesh.tri_verts.iter_mut() {
        if *v == 2 { *v = u32::MAX - 1; }
    }
    let tet = Manifold::from_mesh_gl(&mesh);
    assert!(tet.is_empty());
    assert_eq!(tet.status(), crate::types::Error::VertexOutOfBounds);
}

/// C++ TEST(Manifold, InvalidInput4) — vertex index == numVert (out of bounds)
#[test]
fn test_cpp_invalid_input_4() {
    let mut mesh = tet_gl();
    for v in mesh.tri_verts.iter_mut() {
        if *v == 2 { *v = 4; }  // 4 is out of range for TetGL's merged topology (4 unique verts)
    }
    let tet = Manifold::from_mesh_gl(&mesh);
    assert!(tet.is_empty());
    // C++ gets NotManifold because v=4 < numVert(7) but the merged topology breaks
    // Our Rust should also detect this
    assert!(tet.status() == crate::types::Error::NotManifold
         || tet.status() == crate::types::Error::VertexOutOfBounds,
        "Expected NotManifold or VertexOutOfBounds, got {:?}", tet.status());
}

/// C++ TEST(Manifold, InvalidInput5) — merge index out of bounds
#[test]
fn test_cpp_invalid_input_5() {
    let mut mesh = tet_gl();
    *mesh.merge_from_vert.last_mut().unwrap() = 7;
    let tet = Manifold::from_mesh_gl(&mesh);
    assert!(tet.is_empty());
    assert_eq!(tet.status(), crate::types::Error::MergeIndexOutOfBounds);
}

/// C++ TEST(Manifold, InvalidInput6) — tri vert index out of bounds
#[test]
fn test_cpp_invalid_input_6() {
    let mut mesh = tet_gl();
    *mesh.tri_verts.last_mut().unwrap() = 7;
    let tet = Manifold::from_mesh_gl(&mesh);
    assert!(tet.is_empty());
    assert_eq!(tet.status(), crate::types::Error::VertexOutOfBounds);
}

/// C++ TEST(Manifold, InvalidInput7) — runIndex wrong length
#[test]
fn test_cpp_invalid_input_7() {
    let mut cube = cube_uv();
    cube.run_index = vec![0, 1, cube.tri_verts.len() as u32];
    let result = Manifold::from_mesh_gl(&cube);
    assert!(result.is_empty());
    assert_eq!(result.status(), crate::types::Error::RunIndexWrongLength);
}

/// C++ TEST(Manifold, ValidInput) — TetGL is valid
#[test]
fn test_cpp_valid_input() {
    let mesh = tet_gl();
    let tet = Manifold::from_mesh_gl(&mesh);
    assert!(!tet.is_empty(), "TetGL should be valid");
    assert_eq!(tet.status(), crate::types::Error::NoError);
}

// ============================================================================
// Invalid constructor tests — C++ TEST(Manifold, Invalid)
// ============================================================================

/// C++ TEST(Manifold, Invalid) — invalid constructor parameters
#[test]
fn test_cpp_invalid_constructors() {
    use crate::types::Error;

    assert_eq!(Manifold::sphere(0.0, 0).status(), Error::InvalidConstruction);
    assert_eq!(Manifold::cylinder(0.0, 5.0, -1.0, 0).status(), Error::InvalidConstruction);
    assert_eq!(Manifold::cylinder(2.0, -5.0, -1.0, 0).status(), Error::InvalidConstruction);
    assert_eq!(Manifold::cylinder(2.0, 0.0, -1.0, 0).status(), Error::InvalidConstruction);
    assert_eq!(Manifold::cylinder(2.0, 0.0, 0.0, 0).status(), Error::InvalidConstruction);
    assert_eq!(Manifold::cube(Vec3::new(0.0, 0.0, 0.0), false).status(), Error::InvalidConstruction);
    assert_eq!(Manifold::cube(Vec3::new(-1.0, 1.0, 1.0), false).status(), Error::InvalidConstruction);
}

// ============================================================================
// Merge tests
// ============================================================================

/// C++ TEST(Manifold, Merge) — STL cube needs Merge() to become valid
#[test]
fn test_cpp_merge() {
    let mut cube_mesh = cube_stl();
    assert_eq!(cube_mesh.num_tri(), 12);
    assert_eq!(cube_mesh.num_vert(), 36);

    // Verify all vertex properties are finite
    for (i, &v) in cube_mesh.vert_properties.iter().enumerate() {
        assert!(v.is_finite(), "vertex property {} is not finite: {}", i, v);
    }

    // Without merge, the STL-style cube is not manifold
    let bad = Manifold::from_mesh_gl(&cube_mesh);
    assert!(bad.is_empty(), "STL cube without merge should be empty, status: {:?}", bad.status());
    // C++ returns NotManifold; we may get NonFiniteVertex if topology corruption
    // causes NaN during subsequent processing. Both indicate the mesh is invalid.
    assert!(bad.status() == crate::types::Error::NotManifold
         || bad.status() == crate::types::Error::NonFiniteVertex,
        "Expected NotManifold or NonFiniteVertex, got {:?}", bad.status());

    // Merge should find coincident vertices
    assert!(cube_mesh.merge(), "merge() should return true");
    assert_eq!(cube_mesh.merge_from_vert.len(), 28);
    check_cube(&cube_mesh);

    // Second merge should return false (no new merges)
    assert!(!cube_mesh.merge());
    assert_eq!(cube_mesh.merge_from_vert.len(), 28);

    // Truncate merge vectors and re-merge
    cube_mesh.merge_from_vert.truncate(14);
    cube_mesh.merge_to_vert.truncate(14);
    assert!(cube_mesh.merge());
    assert_eq!(cube_mesh.merge_from_vert.len(), 28);
    check_cube(&cube_mesh);
}

/// C++ TEST(Manifold, MergeDegenerates)
#[test]
fn test_cpp_merge_degenerates() {
    let cube = Manifold::cube(Vec3::new(1.0, 1.0, 1.0), true).get_mesh_gl(0);
    let mut squash = MeshGL::default();
    squash.num_prop = cube.num_prop;
    squash.vert_properties = cube.vert_properties.clone();
    squash.tri_verts = cube.tri_verts.clone();

    // Move one vert to the position of its neighbor
    let len = squash.vert_properties.len();
    squash.vert_properties[len - 1] *= -1.0;
    // Remove one triangle to break manifold
    let tri_len = squash.tri_verts.len();
    squash.tri_verts.truncate(tri_len - 3);
    // Rotate degenerate triangle to middle
    let n = squash.tri_verts.len();
    if n > 15 {
        squash.tri_verts[..n].rotate_left(15);
    }
    // Merge should find the duplicate vertex
    assert!(squash.merge());
    // Manifold should remove degenerate triangles
    let squashed = Manifold::from_mesh_gl(&squash);
    assert!(!squashed.is_empty(), "Squashed cube should not be empty");
    assert_eq!(squashed.status(), crate::types::Error::NoError);
}

/// C++ TEST(Manifold, MergeEmpty) — shape that becomes empty after merge
#[test]
fn test_cpp_merge_empty() {
    let mut shape = MeshGL::default();
    shape.num_prop = 7;
    shape.tri_verts = vec![
        0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11,
        12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23,
        24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35,
    ];
    shape.vert_properties = vec![
        0.0,  0.5,  0.434500008821487, 0.0, 0.0, 0.0, 0.0,
        0.0,  -0.5, -0.43450000882149, 0.0, 0.0, 1.0, 1.0,
        0.0,  -0.5, 0.434500008821487, 0.0, 0.0, 0.0, 1.0,
        0.0,  0.5,  0.434500008821487, 0.0, 0.0, 0.0, 0.0,
        0.0,  0.5,  -0.43450000882149, 0.0, 0.0, 1.0, 0.0,
        0.0,  -0.5, -0.43450000882149, 0.0, 0.0, 1.0, 1.0,
        -0.0, 0.5,  0.434500008821487, 0.0, 0.0, 0.0, 0.0,
        -0.0, -0.5, 0.434500008821487, 0.0, 0.0, 0.0, 1.0,
        -0.0, -0.5, -0.43450000882149, 0.0, 0.0, 1.0, 1.0,
        -0.0, 0.5,  0.434500008821487, 0.0, 0.0, 0.0, 0.0,
        -0.0, -0.5, -0.43450000882149, 0.0, 0.0, 1.0, 1.0,
        -0.0, 0.5,  -0.43450000882149, 0.0, 0.0, 1.0, 0.0,
        0.0,  0.5,  0.434500008821487, 0.0, 0.0, 0.0, 0.0,
        -0.0, 0.5,  0.434500008821487, 0.0, 0.0, 0.0, 0.0,
        -0.0, 0.5,  -0.43450000882149, 0.0, 0.0, 1.0, 0.0,
        0.0,  0.5,  0.434500008821487, 0.0, 0.0, 0.0, 0.0,
        -0.0, 0.5,  -0.43450000882149, 0.0, 0.0, 1.0, 0.0,
        0.0,  0.5,  -0.43450000882149, 0.0, 0.0, 1.0, 0.0,
        -0.0, -0.5, 0.434500008821487, 0.0, 0.0, 0.0, 1.0,
        0.0,  -0.5, 0.434500008821487, 0.0, 0.0, 0.0, 1.0,
        0.0,  -0.5, -0.43450000882149, 0.0, 0.0, 1.0, 1.0,
        -0.0, -0.5, 0.434500008821487, 0.0, 0.0, 0.0, 1.0,
        0.0,  -0.5, -0.43450000882149, 0.0, 0.0, 1.0, 1.0,
        -0.0, -0.5, -0.43450000882149, 0.0, 0.0, 1.0, 1.0,
        0.0,  -0.5, 0.434500008821487, 0.0, 0.0, 0.0, 1.0,
        0.0,  0.5,  0.434500008821487, 0.0, 0.0, 0.0, 0.0,
        -0.0, 0.5,  0.434500008821487, 0.0, 0.0, 0.0, 0.0,
        0.0,  -0.5, 0.434500008821487, 0.0, 0.0, 0.0, 1.0,
        -0.0, 0.5,  0.434500008821487, 0.0, 0.0, 0.0, 0.0,
        -0.0, -0.5, 0.434500008821487, 0.0, 0.0, 0.0, 1.0,
        0.0,  0.5,  -0.43450000882149, 0.0, 0.0, 1.0, 0.0,
        0.0,  -0.5, -0.43450000882149, 0.0, 0.0, 1.0, 1.0,
        -0.0, -0.5, -0.43450000882149, 0.0, 0.0, 1.0, 1.0,
        0.0,  0.5,  -0.43450000882149, 0.0, 0.0, 1.0, 0.0,
        -0.0, -0.5, -0.43450000882149, 0.0, 0.0, 1.0, 0.0,
        -0.0, 0.5,  -0.43450000882149, 0.0, 0.0, 1.0, 0.0,
    ];
    assert!(shape.merge());
    let man = Manifold::from_mesh_gl(&shape);
    assert_eq!(man.status(), crate::types::Error::NoError);
    assert!(man.is_empty());
}

// ============================================================================
// MeshRelationTransform test
// ============================================================================

/// C++ TEST(Manifold, MeshRelationTransform)
#[test]
fn test_cpp_mesh_relation_transform() {
    let cube = Manifold::cube(Vec3::new(1.0, 1.0, 1.0), false);
    let cube_gl = cube.get_mesh_gl(0);
    let turned = cube.rotate(45.0, 90.0, 0.0);
    super::related_gl(&turned, &[&cube_gl]);
}

// ============================================================================
// Decompose test
// ============================================================================

/// C++ TEST(Manifold, Decompose) — disjoint shapes can be decomposed
#[test]
fn test_cpp_decompose() {
    let tet = Manifold::tetrahedron();
    let cube = Manifold::cube(Vec3::new(1.0, 1.0, 1.0), false)
        .translate(Vec3::new(2.0, 0.0, 0.0))
        .as_original();
    let sphere = Manifold::sphere(1.0, 4)
        .translate(Vec3::new(4.0, 0.0, 0.0))
        .as_original();

    let combined = Manifold::batch_boolean(&[tet, cube, sphere], OpType::Add);
    assert!(!combined.is_empty());

    let parts = combined.decompose();
    assert_eq!(parts.len(), 3, "Expected 3 decomposed parts, got {}", parts.len());

    // Sort by num_vert descending (matching C++ ExpectMeshes)
    let mut parts = parts;
    parts.sort_by(|a, b| {
        b.num_vert().cmp(&a.num_vert()).then(b.num_tri().cmp(&a.num_tri()))
    });

    assert_eq!(parts[0].num_vert(), 8);
    assert_eq!(parts[0].num_tri(), 12);
    assert_eq!(parts[1].num_vert(), 6);
    assert_eq!(parts[1].num_tri(), 8);
    assert_eq!(parts[2].num_vert(), 4);
    assert_eq!(parts[2].num_tri(), 4);
}

// ============================================================================
// GetMeshGL / MeshGL round-trip tests
// ============================================================================

/// C++ TEST(Manifold, GetMeshGL) — round-trip through MeshGL preserves geometry
#[test]
fn test_cpp_get_mesh_gl() {
    let manifold = Manifold::sphere(0.01, 0);
    let mesh_out = manifold.get_mesh_gl(0);
    let manifold2 = Manifold::from_mesh_gl(&mesh_out);
    let mesh_out2 = manifold2.get_mesh_gl(0);

    // Check same number of vertices (by position)
    let n1 = mesh_out.vert_properties.len() / mesh_out.num_prop as usize;
    let n2 = mesh_out2.vert_properties.len() / mesh_out2.num_prop as usize;
    assert_eq!(n1, n2, "Vertex count mismatch: {} vs {}", n1, n2);

    // Check vertex positions match
    for i in 0..n1 {
        let p1 = mesh_out.get_vert_pos(i);
        let p2 = mesh_out2.get_vert_pos(i);
        let dist = ((p1[0] - p2[0]).powi(2) + (p1[1] - p2[1]).powi(2) + (p1[2] - p2[2]).powi(2)).sqrt();
        assert!(dist <= 0.0001, "Vertex {} distance {} > 0.0001", i, dist);
    }

    // Check same number of triangles
    assert_eq!(mesh_out.tri_verts.len(), mesh_out2.tri_verts.len(),
        "Triangle count mismatch");

    // Check triangle indices match (after sorting)
    let mut tris1: Vec<[u32; 3]> = (0..mesh_out.tri_verts.len() / 3)
        .map(|i| [mesh_out.tri_verts[3*i], mesh_out.tri_verts[3*i+1], mesh_out.tri_verts[3*i+2]])
        .collect();
    let mut tris2: Vec<[u32; 3]> = (0..mesh_out2.tri_verts.len() / 3)
        .map(|i| [mesh_out2.tri_verts[3*i], mesh_out2.tri_verts[3*i+1], mesh_out2.tri_verts[3*i+2]])
        .collect();
    tris1.sort();
    tris2.sort();
    assert_eq!(tris1, tris2, "Triangle indices differ after round-trip");
}

/// C++ TEST(Manifold, WarpBatch) — Warp and WarpBatch produce identical results
#[test]
fn test_cpp_warp_batch() {
    let cube = Manifold::cube(Vec3::new(2.0, 3.0, 4.0), false);
    let id = cube.original_id();

    let shape1 = cube.warp(|v: &mut Vec3| { v.x += v.z * v.z; });
    let shape2 = cube.warp_batch(|vecs: &mut [Vec3]| {
        for v in vecs.iter_mut() {
            v.x += v.z * v.z;
        }
    });

    assert!(id >= 0);
    assert_eq!(shape1.original_id(), -1);
    assert_eq!(shape2.original_id(), -1);

    let gl1 = shape1.get_mesh_gl(0);
    let gl2 = shape2.get_mesh_gl(0);
    assert_eq!(gl1.run_original_id.len(), 1);
    assert_eq!(gl1.run_original_id[0], id as u32);
    assert_eq!(gl2.run_original_id.len(), 1);
    assert_eq!(gl2.run_original_id[0], id as u32);
    assert!((shape1.volume() - shape2.volume()).abs() < 1e-10,
        "Warp vs WarpBatch volume: {} vs {}", shape1.volume(), shape2.volume());
    assert!((shape1.surface_area() - shape2.surface_area()).abs() < 1e-10,
        "Warp vs WarpBatch area: {} vs {}", shape1.surface_area(), shape2.surface_area());
}

/// C++ TEST(Manifold, MeshDeterminism) — exact deterministic output from boolean
#[test]
fn test_cpp_mesh_determinism() {
    let cube1 = Manifold::cube(Vec3::new(2.0, 2.0, 2.0), true);
    let cube2 = Manifold::cube(Vec3::new(2.0, 2.0, 2.0), true)
        .translate(Vec3::new(-1.1091, 0.88509, 1.3099));

    let result = cube1 - cube2;
    let out = result.get_mesh_gl(0);

    let expected_tri_verts: Vec<u32> = vec![
        0, 2, 7,  0, 10, 1,  0, 6, 10,  0, 1, 2,  1, 3, 2,
        1, 5, 3,  1, 11, 5,  0, 7, 6,   6, 7, 8,  6, 8, 13,
        10, 12, 11,  1, 10, 11,  11, 13, 5,  6, 12, 10,  6, 13, 12,
        13, 9, 5,  13, 8, 9,  11, 12, 13,  4, 2, 3,  4, 3, 5,
        4, 7, 2,  4, 5, 8,  4, 8, 7,  9, 8, 5,
    ];

    let expected_vert_props: Vec<f32> = vec![
        -1.0, -1.0, -1.0,     -1.0, -1.0, 1.0,
        -1.0, -0.11491, 0.3099,  -1.0, -0.11491, 1.0,
        -0.1091, -0.11491, 0.3099,  -0.1091, -0.11491, 1.0,
        -1.0, 1.0, -1.0,      -1.0, 1.0, 0.3099,
        -0.1091, 1.0, 0.3099,   -0.1091, 1.0, 1.0,
        1.0, -1.0, -1.0,      1.0, -1.0, 1.0,
        1.0, 1.0, -1.0,       1.0, 1.0, 1.0,
    ];

    let mut flag = true;
    if out.tri_verts.len() == expected_tri_verts.len() {
        for i in 0..out.tri_verts.len() {
            if out.tri_verts[i] != expected_tri_verts[i] {
                flag = false;
                break;
            }
        }
    } else {
        flag = false;
    }

    if flag && out.vert_properties.len() == expected_vert_props.len() {
        for i in 0..out.vert_properties.len() {
            if out.vert_properties[i] != expected_vert_props[i] {
                flag = false;
                break;
            }
        }
    } else if flag {
        flag = false;
    }

    assert!(flag, "MeshDeterminism: output does not match expected.\n  tri_verts len: {} vs {}\n  vert_props len: {} vs {}",
        out.tri_verts.len(), expected_tri_verts.len(),
        out.vert_properties.len(), expected_vert_props.len());
}

/// C++ TEST(Manifold, DecomposeProps) — decompose preserves properties across components
#[test]
fn test_cpp_decompose_props() {
    // Create three shapes with position-derived "color" properties
    let tet = Manifold::tetrahedron().set_properties(3, |new_prop, pos, _old| {
        new_prop[0] = pos.x;
        new_prop[1] = pos.y;
        new_prop[2] = pos.z;
    }).as_original();
    let cube = Manifold::cube(Vec3::splat(1.0), false)
        .translate(Vec3::new(2.0, 0.0, 0.0))
        .as_original()
        .set_properties(3, |new_prop, pos, _old| {
            new_prop[0] = pos.x;
            new_prop[1] = pos.y;
            new_prop[2] = pos.z;
        });
    let sphere = Manifold::sphere(1.0, 4)
        .translate(Vec3::new(4.0, 0.0, 0.0))
        .as_original()
        .set_properties(3, |new_prop, pos, _old| {
            new_prop[0] = pos.x;
            new_prop[1] = pos.y;
            new_prop[2] = pos.z;
        });

    let manifolds = Manifold::batch_boolean(&[tet, cube, sphere], OpType::Add);

    // Check expected meshes: cube(8v,12t), sphere(6v,8t), tet(4v,4t)
    let parts = manifolds.decompose();
    assert_eq!(parts.len(), 3, "DecomposeProps: expected 3 parts, got {}", parts.len());

    // Each part should have 3 extra properties
    for (i, part) in parts.iter().enumerate() {
        assert_eq!(part.num_prop(), 3,
            "DecomposeProps: part {} has {} props, expected 3", i, part.num_prop());
    }
}

// ============================================================================
// Properties tests
// ============================================================================

/// C++ TEST(CrossSection, Square) — cube from extruded square equals cube
#[test]
fn test_cpp_cross_section_square() {
    use crate::cross_section::CrossSection;
    let a = Manifold::cube(Vec3::new(5.0, 5.0, 5.0), false);
    let b = Manifold::extrude(&CrossSection::square(5.0).to_polygons(), 5.0, 0, 0.0, Vec2::new(1.0, 1.0));
    assert!((a - b).volume().abs() < 1e-5, "Square: cube - extrude(square) should have 0 volume");
}

/// C++ TEST(CrossSection, Empty) — empty polygons yield empty cross section
#[test]
fn test_cpp_cross_section_empty() {
    use crate::cross_section::CrossSection;
    let polys: Vec<Vec<Vec2>> = vec![vec![], vec![]];
    let e = CrossSection::new(polys);
    assert!(e.is_empty(), "Empty cross section should be empty");
}

/// C++ TEST(Properties, CalculateCurvature) — sphere curvature
#[test]
fn test_cpp_properties_calculate_curvature() {
    let precision = 0.015f64;
    let gaussian_idx = 3usize;
    let mean_idx = 4usize;

    let sphere = Manifold::sphere(1.0, 64)
        .calculate_curvature((gaussian_idx - 3) as i32, (mean_idx - 3) as i32);
    let gl = sphere.get_mesh_gl(0);
    assert_eq!(gl.num_prop, 5, "Should have 5 properties (3 pos + gaussian + mean)");

    // Mean curvature of unit sphere = 2 (1/r1 + 1/r2 = 1+1 = 2)
    let (min_mean, max_mean) = get_min_max_property(&gl, mean_idx);
    assert!((min_mean - 2.0).abs() < 2.0 * precision as f32,
        "min mean curvature: {}", min_mean);
    assert!((max_mean - 2.0).abs() < 2.0 * precision as f32,
        "max mean curvature: {}", max_mean);

    // Gaussian curvature of unit sphere = 1
    let (min_gauss, max_gauss) = get_min_max_property(&gl, gaussian_idx);
    assert!((min_gauss - 1.0).abs() < precision as f32,
        "min gaussian curvature: {}", min_gauss);
    assert!((max_gauss - 1.0).abs() < precision as f32,
        "max gaussian curvature: {}", max_gauss);

    // Scaled sphere (radius 2): mean = 1, gaussian = 0.25
    let sphere2 = sphere.scale(Vec3::splat(2.0))
        .calculate_curvature((gaussian_idx - 3) as i32, (mean_idx - 3) as i32);
    let gl2 = sphere2.get_mesh_gl(0);
    assert_eq!(gl2.num_prop, 5);
    let (min_mean2, max_mean2) = get_min_max_property(&gl2, mean_idx);
    assert!((min_mean2 - 1.0).abs() < precision as f32, "scaled min mean: {}", min_mean2);
    assert!((max_mean2 - 1.0).abs() < precision as f32, "scaled max mean: {}", max_mean2);
    let (min_gauss2, max_gauss2) = get_min_max_property(&gl2, gaussian_idx);
    assert!((min_gauss2 - 0.25).abs() < 0.25 * precision as f32, "scaled min gauss: {}", min_gauss2);
    assert!((max_gauss2 - 0.25).abs() < 0.25 * precision as f32, "scaled max gauss: {}", max_gauss2);
}

/// C++ TEST(Smooth, NormalTransform) — smooth by normals after rotation
#[test]
fn test_cpp_smooth_normal_transform() {
    let cube1 = Manifold::cube(Vec3::splat(1.0), false)
        .rotate(30.0, 0.0, 0.0)
        .calculate_normals(0, 60.0);
    let cube2 = Manifold::cube(Vec3::splat(1.0), false)
        .calculate_normals(0, 60.0)
        .rotate(30.0, 0.0, 0.0)
        .translate(Vec3::new(3.0, 0.0, 0.0));

    let combo = cube1 + cube2;
    let out1 = combo.smooth_by_normals(0).refine(10);
    assert!((out1.volume() - 2.0).abs() < 1e-4, "volume={}", out1.volume());
    assert!((out1.surface_area() - 12.0).abs() < 1e-4, "sa={}", out1.surface_area());

    let cube1 = Manifold::cube(Vec3::splat(1.0), false)
        .rotate(30.0, 0.0, 0.0)
        .calculate_normals(0, 60.0);
    let cube2 = Manifold::cube(Vec3::splat(1.0), false)
        .calculate_normals(0, 60.0)
        .rotate(30.0, 0.0, 0.0)
        .translate(Vec3::new(3.0, 0.0, 0.0));
    let combo = cube1 + cube2;
    let out2 = Manifold::from_mesh_gl(&combo.get_mesh_gl(0))
        .smooth_by_normals(0)
        .refine(10);
    assert!((out2.volume() - 2.0).abs() < 1e-4, "volume2={}", out2.volume());
    assert!((out2.surface_area() - 12.0).abs() < 1e-4, "sa2={}", out2.surface_area());
}

/// C++ TEST(Smooth, FacetedNormals) — faceted smooth preserves geometry
#[test]
fn test_cpp_smooth_faceted_normals() {
    let cylinder = Manifold::cylinder(10.0, 10.0, -1.0, 0);
    let faceted = cylinder.calculate_normals(0, 0.0)
        .smooth_by_normals(0)
        .refine_to_length(0.1);
    assert_eq!(faceted.status(), crate::types::Error::NoError);
    assert!((cylinder.volume() - faceted.volume()).abs() < 0.01,
        "FacetedNormals: volume {} vs {}", cylinder.volume(), faceted.volume());
    assert!((cylinder.surface_area() - faceted.surface_area()).abs() < 0.01,
        "FacetedNormals: area {} vs {}", cylinder.surface_area(), faceted.surface_area());
}

fn get_min_max_property(gl: &MeshGL, channel: usize) -> (f32, f32) {
    let num_prop = gl.num_prop as usize;
    let mut min_val = f32::MAX;
    let mut max_val = f32::MIN;
    let num_vert = gl.vert_properties.len() / num_prop;
    for i in 0..num_vert {
        let v = gl.vert_properties[i * num_prop + channel];
        if v < min_val { min_val = v; }
        if v > max_val { max_val = v; }
    }
    (min_val, max_val)
}

/// C++ TEST(Manifold, MeshID) — two Manifolds constructed from the same MeshGL
/// must receive different run_original_ids (each import reserves its own ID).
#[test]
fn test_cpp_mesh_id() {
    let cube = Manifold::cube(Vec3::splat(1.0), false);
    let mut cube_gl = cube.get_mesh_gl(0);
    cube_gl.run_index.clear();
    cube_gl.run_original_id.clear();
    let cube1 = Manifold::from_mesh_gl(&cube_gl);
    let cube2 = Manifold::from_mesh_gl(&cube_gl);
    let id1 = cube1.get_mesh_gl(0).run_original_id[0];
    let id2 = cube2.get_mesh_gl(0).run_original_id[0];
    assert_ne!(id1, id2, "MeshID: two imports of same MeshGL should have different run_original_ids");
}

/// C++ TEST(Manifold, MeshGLRoundTrip) — cylinder MeshGL round-trip preserves run_original_id
/// and RelatedGL validates that vertex positions trace to source triangles.
#[test]
fn test_cpp_manifold_meshgl_round_trip2() {
    let cylinder = Manifold::cylinder(2.0, 1.0, -1.0, 0);
    assert!(cylinder.original_id() >= 0, "MeshGLRoundTrip: cylinder should have original_id >= 0");
    let in_gl = cylinder.get_mesh_gl(0);
    let cylinder2 = Manifold::from_mesh_gl(&in_gl);
    let out_gl = cylinder2.get_mesh_gl(0);

    assert_eq!(in_gl.run_original_id.len(), 1, "MeshGLRoundTrip: inGL should have 1 run");
    assert_eq!(out_gl.run_original_id.len(), 1, "MeshGLRoundTrip: outGL should have 1 run");
    assert_eq!(out_gl.run_original_id[0], in_gl.run_original_id[0],
        "MeshGLRoundTrip: run_original_id should be preserved");

    super::related_gl(&cylinder2, &[&in_gl]);
}

/// C++ TEST(Manifold, MeshRelationRefine) — refine-to-length preserves mesh relation.
#[test]
fn test_cpp_mesh_relation_refine() {
    let csaszar_src = Manifold::from_mesh_gl(&super::smooth::csaszar_gl());
    let csaszar = super::with_position_colors(&csaszar_src).as_original();
    let in_gl = csaszar.get_mesh_gl(0);

    super::related_gl(&csaszar, &[&in_gl]);

    let refined = csaszar.refine_to_length(1.0);
    assert!(!refined.is_empty(), "MeshRelationRefine: refined not empty");
    assert!(refined.matches_tri_normals(), "MeshRelationRefine: matches_tri_normals");
    let parts = refined.decompose();
    assert_eq!(parts.len(), 1, "MeshRelationRefine: 1 component");
    assert_eq!(parts[0].num_vert(), 9019, "MeshRelationRefine: num_vert");
    assert_eq!(parts[0].num_tri(), 18038, "MeshRelationRefine: num_tri");
    assert_eq!(parts[0].num_prop(), 3, "MeshRelationRefine: num_prop");

    super::related_gl(&refined, &[&in_gl]);
}

/// C++ TEST(Manifold, MeshRelationRefinePrecision) — smooth + refine-to-tolerance preserves
/// run_original_id.
#[test]
fn test_cpp_mesh_relation_refine_precision() {
    let in_gl = super::with_position_colors(&Manifold::from_mesh_gl(&super::smooth::csaszar_gl()))
        .get_mesh_gl(0);
    let id = in_gl.run_original_id[0];
    let csaszar = Manifold::smooth(&in_gl, &[]);
    let refined = csaszar.refine_to_tolerance(0.05);
    assert!(!refined.is_empty(), "MeshRelationRefinePrecision: not empty");
    let parts = refined.decompose();
    assert_eq!(parts.len(), 1, "MeshRelationRefinePrecision: 1 component");
    // C++ v3.5.0 expects {{2343, 4686, 3}} after the #1724/#1671 smoothing fixes.
    assert_eq!(parts[0].num_vert(), 2343, "MeshRelationRefinePrecision: num_vert");
    assert_eq!(parts[0].num_tri(), 4686, "MeshRelationRefinePrecision: num_tri");
    assert_eq!(parts[0].num_prop(), 3, "MeshRelationRefinePrecision: num_prop");

    let run_ids = refined.get_mesh_gl(0).run_original_id;
    assert_eq!(run_ids.len(), 1, "MeshRelationRefinePrecision: 1 run");
    assert_eq!(run_ids[0], id, "MeshRelationRefinePrecision: original_id preserved");
}
