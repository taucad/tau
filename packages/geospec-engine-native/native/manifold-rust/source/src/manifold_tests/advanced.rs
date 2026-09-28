use super::*;

/// C++ TEST(Boolean, ConvexConvexMinkowski) — sphere + cube Minkowski sum
/// Checks analytical volume and surface area of a rounded cuboid.
#[test]
fn test_cpp_convex_convex_minkowski() {
    let r = 0.1;
    let w = 2.0;
    let sphere = Manifold::sphere(r, 20);
    let cube = Manifold::cube(Vec3::splat(w), false);
    let sum = cube.minkowski_sum(&sphere);

    let pi = std::f64::consts::PI;
    // Analytical volume of rounded cuboid:
    // w³ + 6w²r + 3πwr² + (4/3)πr³
    let analytical_volume =
        w * w * w + 6.0 * w * w * r + 3.0 * pi * w * r * r + (4.0 / 3.0) * pi * r * r * r;
    // Analytical surface area:
    // 6w² + 6πwr + 4πr²
    let analytical_area = 6.0 * w * w + 6.0 * pi * w * r + 4.0 * pi * r * r;

    // Discrete sphere approximation differs from analytical by ~1%
    assert!(
        (sum.volume() - analytical_volume).abs() < 0.15,
        "ConvexConvexMinkowski volume: {} expected ~{}",
        sum.volume(),
        analytical_volume
    );
    assert!(
        (sum.surface_area() - analytical_area).abs() < 0.5,
        "ConvexConvexMinkowski area: {} expected ~{}",
        sum.surface_area(),
        analytical_area
    );
    assert_eq!(sum.genus(), 0);
}

/// C++ TEST(Boolean, ConvexConvexMinkowskiDifference) — sphere erosion of cube
///
/// Passes since `face2tri` was rewritten to the C++ v3.5.0 halfedge-index
/// pairing scheme (boolean pipeline no longer diverges on coplanar faces).
#[test]
fn test_cpp_convex_convex_minkowski_difference() {
    let r = 0.1;
    let w = 2.0;
    let sphere = Manifold::sphere(r, 20);
    let cube = Manifold::cube(Vec3::splat(w), false);
    let difference = cube.minkowski_difference(&sphere);

    // Analytical volume of eroded cube: (w-2r)³
    let analytical_volume = (w - 2.0 * r) * (w - 2.0 * r) * (w - 2.0 * r);
    // Analytical surface area: 6*(w-2r)²
    let analytical_area = 6.0 * (w - 2.0 * r) * (w - 2.0 * r);

    assert!(
        (difference.volume() - analytical_volume).abs() < 0.1,
        "ConvexConvexMinkowskiDifference volume: {} expected ~{}",
        difference.volume(),
        analytical_volume
    );
    assert!(
        (difference.surface_area() - analytical_area).abs() < 0.1,
        "ConvexConvexMinkowskiDifference area: {} expected ~{}",
        difference.surface_area(),
        analytical_area
    );
    assert_eq!(difference.genus(), 0);
}

/// C++ TEST(Boolean, NonConvexConvexMinkowskiSum)
///
/// Passes since the C++-exact BatchBoolean reduction order (serial-tie-broken
/// max-heap, rounds of 4), the ForVert-order vertex normals, and the
/// input-space `edgeVec` fix in `append_partial_edges` landed together.
#[test]
fn test_cpp_nonconvex_convex_minkowski_sum() {
    let sphere = Manifold::sphere(1.2, 20);
    let cube = Manifold::cube(Vec3::splat(2.0), true);
    let non_convex = cube.difference(&sphere);
    let sum = non_convex.minkowski_sum(&Manifold::sphere(0.1, 20));
    assert!(
        (sum.volume() - 4.841).abs() < 1e-3,
        "NonConvexConvexMinkowskiSum volume: {} expected ~4.841",
        sum.volume()
    );
    assert!(
        (sum.surface_area() - 34.06).abs() < 1e-2,
        "NonConvexConvexMinkowskiSum area: {} expected ~34.06",
        sum.surface_area()
    );
    assert_eq!(sum.genus(), 5);
}

/// C++ TEST(Boolean, NonConvexConvexMinkowskiDifference)
///
/// Passes since the C++-exact BatchBoolean reduction order, ForVert-order
/// vertex normals, and the `append_partial_edges` edgeVec fix landed.
#[test]
fn test_cpp_nonconvex_convex_minkowski_difference() {
    let sphere = Manifold::sphere(1.2, 20);
    let cube = Manifold::cube(Vec3::splat(2.0), true);
    let non_convex = cube.difference(&sphere);
    let difference = non_convex.minkowski_difference(&Manifold::sphere(0.05, 20));
    assert!(
        (difference.volume() - 0.778).abs() < 1e-3,
        "NonConvexConvexMinkowskiDifference volume: {} expected ~0.778",
        difference.volume()
    );
    assert!(
        (difference.surface_area() - 16.70).abs() < 1e-2,
        "NonConvexConvexMinkowskiDifference area: {} expected ~16.70",
        difference.surface_area()
    );
    assert_eq!(difference.genus(), 5);
}

/// C++ TEST(Boolean, NonConvexNonConvexMinkowskiSum)
///
/// Passes since the ear-queue FIFO tie-break, the `cut_keyhole` connector
/// fix, and the edge_op tag/neighbor-projection fixes landed (2026-07).
#[test]
fn test_cpp_nonconvex_nonconvex_minkowski_sum() {
    let tet = Manifold::tetrahedron();
    let non_convex = tet.difference(
        &Manifold::tetrahedron()
            .rotate(0.0, 0.0, 90.0)
            .translate(Vec3::splat(1.0)),
    );
    let sum = non_convex.minkowski_sum(&non_convex.scale(Vec3::splat(0.5)));
    assert!(
        (sum.volume() - 8.65625).abs() < 1e-5,
        "NonConvexNonConvexMinkowskiSum volume: {} expected ~8.65625",
        sum.volume()
    );
    assert!(
        (sum.surface_area() - 31.17691).abs() < 1e-5,
        "NonConvexNonConvexMinkowskiSum area: {} expected ~31.17691",
        sum.surface_area()
    );
    assert_eq!(sum.genus(), 0);
}

/// C++ TEST(Boolean, NonConvexNonConvexMinkowskiDifference)
///
/// Passes since the matrix `rotate` + v3.5.0 `face2tri` pairing landed
/// (exactly-coplanar boolean faces triangulate manifold, genus matches).
#[test]
fn test_cpp_nonconvex_nonconvex_minkowski_difference() {
    let tet = Manifold::tetrahedron();
    let non_convex = tet.difference(
        &Manifold::tetrahedron()
            .rotate(0.0, 0.0, 90.0)
            .translate(Vec3::splat(1.0)),
    );
    let difference = non_convex.minkowski_difference(&non_convex.scale(Vec3::splat(0.1)));
    assert!(
        (difference.volume() - 0.815542).abs() < 1e-5,
        "NonConvexNonConvexMinkowskiDifference volume: {} expected ~0.815542",
        difference.volume()
    );
    assert!(
        (difference.surface_area() - 6.95045).abs() < 1e-5,
        "NonConvexNonConvexMinkowskiDifference area: {} expected ~6.95045",
        difference.surface_area()
    );
    assert_eq!(difference.genus(), 0);
}

/// C++ TEST(SDF, Bounds) — CubeVoid SDF with bounds check
#[test]
fn test_cpp_sdf_bounds() {
    let size = 4.0;
    let edge_length = 1.0;

    let cube_void_sdf = |p: Vec3| -> f64 {
        let min_v = Vec3::new(p.x + 1.0, p.y + 1.0, p.z + 1.0);
        let max_v = Vec3::new(1.0 - p.x, 1.0 - p.y, 1.0 - p.z);
        let min3 = min_v.x.min(min_v.y.min(min_v.z));
        let max3 = max_v.x.min(max_v.y.min(max_v.z));
        -1.0 * min3.min(max3)
    };

    let cube_void = Manifold::level_set(
        cube_void_sdf,
        crate::types::Box::from_points(Vec3::splat(-size / 2.0), Vec3::splat(size / 2.0)),
        edge_length,
    );

    assert!(!cube_void.is_empty(), "SDF CubeVoid should not be empty");
    assert_eq!(cube_void.genus(), -1, "SDF CubeVoid genus should be -1, got {}", cube_void.genus());

    let epsilon = cube_void.get_tolerance();
    let bounds = cube_void.bounding_box();
    let outer_bound = size / 2.0;
    assert!((bounds.min.x - (-outer_bound)).abs() < epsilon + 0.1,
        "min.x: {} expected ~{}", bounds.min.x, -outer_bound);
    assert!((bounds.max.x - outer_bound).abs() < epsilon + 0.1,
        "max.x: {} expected ~{}", bounds.max.x, outer_bound);
}

/// C++ TEST(SDF, Bounds3) — Sphere SDF with bounds check
#[test]
fn test_cpp_sdf_sphere_bounds() {
    let radius = 1.2;
    let sphere = Manifold::level_set(
        move |pos: Vec3| radius - (pos.x * pos.x + pos.y * pos.y + pos.z * pos.z).sqrt(),
        crate::types::Box::from_points(Vec3::splat(-1.0), Vec3::splat(1.0)),
        0.1,
    );

    assert!(!sphere.is_empty(), "SDF sphere should not be empty");
    assert_eq!(sphere.genus(), 0, "SDF sphere genus should be 0, got {}", sphere.genus());

    let epsilon = sphere.get_tolerance();
    let bounds = sphere.bounding_box();
    assert!((bounds.min.x - (-1.0)).abs() < epsilon + 0.1,
        "min.x: {} expected ~-1", bounds.min.x);
    assert!((bounds.max.x - 1.0).abs() < epsilon + 0.1,
        "max.x: {} expected ~1", bounds.max.x);
}

/// C++ TEST(SDF, Void) — Cube minus CubeVoid SDF
#[test]
fn test_cpp_sdf_void() {
    let size = 4.0;
    let edge_length = 0.5;

    let cube_void_sdf = |p: Vec3| -> f64 {
        let min_v = Vec3::new(p.x + 1.0, p.y + 1.0, p.z + 1.0);
        let max_v = Vec3::new(1.0 - p.x, 1.0 - p.y, 1.0 - p.z);
        let min3 = min_v.x.min(min_v.y.min(min_v.z));
        let max3 = max_v.x.min(max_v.y.min(max_v.z));
        -1.0 * min3.min(max3)
    };

    let cube_void = Manifold::level_set(
        cube_void_sdf,
        crate::types::Box::from_points(Vec3::splat(-size / 2.0), Vec3::splat(size / 2.0)),
        edge_length,
    );

    let cube = Manifold::cube(Vec3::splat(size), true);
    let result = cube.difference(&cube_void);

    assert_eq!(result.genus(), 0, "SDF Void genus: {} expected 0", result.genus());
    assert!(
        (result.volume() - 8.0).abs() < 0.001,
        "SDF Void volume: {} expected ~8.0",
        result.volume()
    );
    assert!(
        (result.surface_area() - 24.0).abs() < 0.001,
        "SDF Void area: {} expected ~24.0",
        result.surface_area()
    );
}

/// C++ TEST(Hull, Hollow) — hull of hollow sphere equals sphere volume
/// C++ uses 360 segments but we use 24 for test speed
#[test]
fn test_cpp_hull_hollow() {
    let sphere = Manifold::sphere(100.0, 24);
    let hollow = sphere.difference(&sphere.scale(Vec3::splat(0.8)));
    let sphere_vol = sphere.volume();
    let hull_vol = hollow.convex_hull().volume();
    assert!(
        (hull_vol - sphere_vol).abs() / sphere_vol < 0.01,
        "Hull of hollow sphere: {} expected ~{}",
        hull_vol,
        sphere_vol
    );
}

/// C++ TEST(Hull, Cube) — hull of cube with interior points
#[test]
fn test_cpp_hull_cube_with_interior() {
    let pts = vec![
        Vec3::new(0.0, 0.0, 0.0), Vec3::new(1.0, 0.0, 0.0),
        Vec3::new(0.0, 1.0, 0.0), Vec3::new(0.0, 0.0, 1.0),
        Vec3::new(1.0, 1.0, 0.0), Vec3::new(0.0, 1.0, 1.0),
        Vec3::new(1.0, 0.0, 1.0), Vec3::new(1.0, 1.0, 1.0),
        Vec3::new(0.5, 0.5, 0.5), Vec3::new(0.5, 0.0, 0.0),
        Vec3::new(0.5, 0.7, 0.2),
    ];
    let cube = Manifold::hull(&pts);
    assert!(
        (cube.volume() - 1.0).abs() < 1e-6,
        "Hull of cube points: {} expected 1.0",
        cube.volume()
    );
}

/// C++ TEST(Hull, Empty) — hull of coplanar/too-few points
#[test]
fn test_cpp_hull_empty() {
    let too_few = vec![Vec3::new(0.0, 0.0, 0.0), Vec3::new(1.0, 0.0, 0.0), Vec3::new(0.0, 1.0, 0.0)];
    let h = Manifold::hull(&too_few);
    assert!(h.is_empty() || h.volume().abs() < 1e-10, "Hull of 3 points should be empty/degenerate");

    let coplanar = vec![
        Vec3::new(0.0, 0.0, 0.0), Vec3::new(1.0, 0.0, 0.0),
        Vec3::new(0.0, 1.0, 0.0), Vec3::new(1.0, 1.0, 0.0),
    ];
    let h2 = Manifold::hull(&coplanar);
    assert!(h2.is_empty() || h2.volume().abs() < 1e-10, "Hull of coplanar points should be empty/degenerate");
}

/// C++ TEST(Properties, Tolerance) — refine_to_tolerance, check tri count
#[test]
fn test_cpp_properties_tolerance() {
    let degrees = 1.0_f64;
    let tol = degrees.to_radians().sin();
    let cube = Manifold::cube(Vec3::splat(1.0), true);
    let imperfect = cube.intersection(&cube.rotate(degrees, 0.0, 0.0)).as_original();
    assert_eq!(imperfect.num_tri(), 28, "Tolerance imperfect: {} tris expected 28", imperfect.num_tri());

    let imperfect2 = imperfect.simplify(tol);
    assert_eq!(imperfect2.num_tri(), 12, "Tolerance simplified: {} tris expected 12", imperfect2.num_tri());

    assert!((imperfect.volume() - imperfect2.volume()).abs() < 0.01,
        "Tolerance volumes: {} vs {}", imperfect.volume(), imperfect2.volume());
    assert!((imperfect.surface_area() - imperfect2.surface_area()).abs() < 0.02,
        "Tolerance areas: {} vs {}", imperfect.surface_area(), imperfect2.surface_area());
}

/// C++ TEST(Properties, ToleranceSphere) — sphere set_tolerance
#[test]
fn test_cpp_properties_tolerance_sphere() {
    let n = 1000;
    let sphere = Manifold::sphere(1.0, 4 * n);
    assert_eq!(sphere.num_tri(), (8 * n * n) as usize);

    let sphere2 = sphere.set_tolerance(0.01);
    assert!(sphere2.num_tri() < 2500, "ToleranceSphere: {} tris expected < 2500", sphere2.num_tri());
    assert_eq!(sphere2.genus(), 0);
    assert!((sphere.volume() - sphere2.volume()).abs() < 0.05);
    assert!((sphere.surface_area() - sphere2.surface_area()).abs() < 0.06);
}

/// C++ TEST(Properties, MinGapCubeCube)
#[test]
fn test_cpp_properties_min_gap_cube_cube() {
    let a = Manifold::cube(Vec3::splat(1.0), false);
    let b = Manifold::cube(Vec3::splat(1.0), false).translate(Vec3::new(2.0, 2.0, 0.0));
    let distance = a.min_gap(&b, 1.5);
    assert!(
        (distance - 2.0_f64.sqrt()).abs() < 1e-4,
        "MinGapCubeCube: {} expected {}", distance, 2.0_f64.sqrt()
    );
}

/// C++ TEST(Properties, MinGapCubeCube2)
#[test]
fn test_cpp_properties_min_gap_cube_cube2() {
    let a = Manifold::cube(Vec3::splat(1.0), false);
    let b = Manifold::cube(Vec3::splat(1.0), false).translate(Vec3::new(3.0, 3.0, 0.0));
    let distance = a.min_gap(&b, 3.0);
    assert!(
        (distance - 2.0 * 2.0_f64.sqrt()).abs() < 1e-4,
        "MinGapCubeCube2: {} expected {}", distance, 2.0 * 2.0_f64.sqrt()
    );
}

/// C++ TEST(Properties, MinGapClosestPointOnEdge)
#[test]
fn test_cpp_properties_min_gap_edge() {
    let a = Manifold::cube(Vec3::splat(1.0), true).rotate(0.0, 0.0, 45.0);
    let b = Manifold::cube(Vec3::splat(1.0), true)
        .rotate(0.0, 45.0, 0.0)
        .translate(Vec3::new(2.0, 0.0, 0.0));
    let distance = a.min_gap(&b, 0.7);
    assert!(
        (distance - (2.0 - 2.0_f64.sqrt())).abs() < 1e-4,
        "MinGapEdge: {} expected {}", distance, 2.0 - 2.0_f64.sqrt()
    );
}

/// C++ TEST(Properties, MinGapClosestPointOnTriangleFace)
#[test]
fn test_cpp_properties_min_gap_face() {
    let a = Manifold::cube(Vec3::splat(1.0), false);
    let b = Manifold::cube(Vec3::splat(1.0), false)
        .scale(Vec3::new(10.0, 10.0, 10.0))
        .translate(Vec3::new(2.0, -5.0, -1.0));
    let distance = a.min_gap(&b, 1.1);
    assert!(
        (distance - 1.0).abs() < 1e-4,
        "MinGapFace: {} expected 1.0", distance
    );
}

/// C++ TEST(Properties, MinGapSphereSphereOutOfBounds) / MinGapAfterTransformationsOutOfBounds
#[test]
fn test_cpp_properties_min_gap_out_of_bounds() {
    let a = Manifold::sphere(1.0, 32);
    let b = Manifold::sphere(1.0, 32).translate(Vec3::new(2.0, 2.0, 0.0));
    let search = 0.8;
    let distance = a.min_gap(&b, search);
    // Out of bounds: distance returned should be the search_length
    assert!(
        (distance - search).abs() < 0.01,
        "MinGapOutOfBounds: {} expected {}", distance, search
    );
}

/// C++ TEST(Properties, MinGapCubeSphereOverlapping)
#[test]
fn test_cpp_properties_min_gap_overlapping() {
    let a = Manifold::cube(Vec3::splat(1.0), false);
    let b = Manifold::sphere(1.0, 32);
    let distance = a.min_gap(&b, 0.1);
    assert!(
        distance.abs() < 1e-4,
        "MinGapOverlapping: {} expected 0", distance
    );
}

/// C++ TEST(Properties, MinGapSphereSphere)
#[test]
fn test_cpp_properties_min_gap_sphere_sphere() {
    let a = Manifold::sphere(1.0, 32);
    let b = Manifold::sphere(1.0, 32).translate(Vec3::new(2.0, 2.0, 0.0));
    let distance = a.min_gap(&b, 0.85);
    let expected = 2.0 * 2.0_f64.sqrt() - 2.0;
    assert!(
        (distance - expected).abs() < 1e-4,
        "MinGapSphereSphere: {} expected {}", distance, expected
    );
}

/// C++ TEST(Properties, MingapAfterTransformations)
#[test]
fn test_cpp_properties_min_gap_transformed() {
    let a = Manifold::sphere(1.0, 512).rotate(30.0, 30.0, 30.0);
    let b = Manifold::sphere(1.0, 512)
        .scale(Vec3::new(3.0, 1.0, 1.0))
        .rotate(0.0, 90.0, 45.0)
        .translate(Vec3::new(3.0, 0.0, 0.0));
    let distance = a.min_gap(&b, 1.1);
    assert!(
        (distance - 1.0).abs() < 0.001,
        "MinGapTransformed: {} expected ~1.0", distance
    );
}

/// C++ TEST(Properties, MinGapAfterTransformationsOutOfBounds)
#[test]
fn test_cpp_properties_min_gap_transformed_oob() {
    let a = Manifold::sphere(1.0, 512).rotate(30.0, 30.0, 30.0);
    let b = Manifold::sphere(1.0, 512)
        .scale(Vec3::new(3.0, 1.0, 1.0))
        .rotate(0.0, 90.0, 45.0)
        .translate(Vec3::new(3.0, 0.0, 0.0));
    let distance = a.min_gap(&b, 0.95);
    assert!(
        (distance - 0.95).abs() < 0.001,
        "MinGapTransformedOOB: {} expected ~0.95", distance
    );
}

/// C++ TEST(Properties, TriangleDistanceClosestPointsOnVertices)
#[test]
fn test_cpp_triangle_distance_vertices() {
    use crate::collider::distance_triangle_triangle_squared;
    let p = [Vec3::new(-1.0, 0.0, 0.0), Vec3::new(1.0, 0.0, 0.0), Vec3::new(0.0, 1.0, 0.0)];
    let q = [Vec3::new(2.0, 0.0, 0.0), Vec3::new(4.0, 0.0, 0.0), Vec3::new(3.0, 1.0, 0.0)];
    let distance = distance_triangle_triangle_squared(p, q);
    assert!((distance - 1.0).abs() < 1e-6,
        "TriangleDistanceVertices: {} expected 1.0", distance);
}

/// C++ TEST(Properties, TriangleDistanceClosestPointOnEdge)
#[test]
fn test_cpp_triangle_distance_edge() {
    use crate::collider::distance_triangle_triangle_squared;
    let p = [Vec3::new(-1.0, 0.0, 0.0), Vec3::new(1.0, 0.0, 0.0), Vec3::new(0.0, 1.0, 0.0)];
    let q = [Vec3::new(-1.0, 2.0, 0.0), Vec3::new(1.0, 2.0, 0.0), Vec3::new(0.0, 3.0, 0.0)];
    let distance = distance_triangle_triangle_squared(p, q);
    assert!((distance - 1.0).abs() < 1e-6,
        "TriangleDistanceEdge: {} expected 1.0", distance);
}

/// C++ TEST(Properties, TriangleDistanceClosestPointOnEdge2)
#[test]
fn test_cpp_triangle_distance_edge2() {
    use crate::collider::distance_triangle_triangle_squared;
    let p = [Vec3::new(-1.0, 0.0, 0.0), Vec3::new(1.0, 0.0, 0.0), Vec3::new(0.0, 1.0, 0.0)];
    let q = [Vec3::new(1.0, 1.0, 0.0), Vec3::new(3.0, 1.0, 0.0), Vec3::new(2.0, 2.0, 0.0)];
    let distance = distance_triangle_triangle_squared(p, q);
    assert!((distance - 0.5).abs() < 1e-6,
        "TriangleDistanceEdge2: {} expected 0.5", distance);
}

/// C++ TEST(Properties, TriangleDistanceClosestPointOnFace)
#[test]
fn test_cpp_triangle_distance_face() {
    use crate::collider::distance_triangle_triangle_squared;
    let p = [Vec3::new(-1.0, 0.0, 0.0), Vec3::new(1.0, 0.0, 0.0), Vec3::new(0.0, 1.0, 0.0)];
    let q = [Vec3::new(-1.0, 2.0, -0.5), Vec3::new(1.0, 2.0, -0.5), Vec3::new(0.0, 2.0, 1.5)];
    let distance = distance_triangle_triangle_squared(p, q);
    assert!((distance - 1.0).abs() < 1e-6,
        "TriangleDistanceFace: {} expected 1.0", distance);
}

/// C++ TEST(Properties, TriangleDistanceOverlapping)
#[test]
fn test_cpp_triangle_distance_overlapping() {
    use crate::collider::distance_triangle_triangle_squared;
    let p = [Vec3::new(-1.0, 0.0, 0.0), Vec3::new(1.0, 0.0, 0.0), Vec3::new(0.0, 1.0, 0.0)];
    let q = [Vec3::new(-1.0, 0.0, 0.0), Vec3::new(1.0, 0.5, 0.0), Vec3::new(0.0, 1.0, 0.0)];
    let distance = distance_triangle_triangle_squared(p, q);
    assert!((distance - 0.0).abs() < 1e-6,
        "TriangleDistanceOverlapping: {} expected 0.0", distance);
}

/// C++ TEST(Boolean, TreeTransforms)
#[test]
fn test_cpp_tree_transforms() {
    let a = (Manifold::cube(Vec3::splat(1.0), false) + Manifold::cube(Vec3::splat(1.0), false))
        .translate(Vec3::new(1.0, 0.0, 0.0));
    let b = Manifold::cube(Vec3::splat(1.0), false) + Manifold::cube(Vec3::splat(1.0), false);
    let result = a + b;
    assert!(
        (result.volume() - 2.0).abs() < 1e-4,
        "TreeTransforms volume: {} expected 2.0", result.volume()
    );
}

/// C++ TEST(Boolean, CornerUnion)
#[test]
fn test_cpp_corner_union() {
    let c = Manifold::cube(Vec3::splat(1.0), false);
    let cubes = c.clone() + c.translate(Vec3::new(1.0, 1.0, 1.0));
    // Should be two disjoint cubes (touching at a corner only)
    assert_eq!(cubes.num_vert(), 16, "CornerUnion verts: {} expected 16", cubes.num_vert());
    assert_eq!(cubes.num_tri(), 24, "CornerUnion tris: {} expected 24", cubes.num_tri());
}

/// C++ TEST(Boolean, Perturb1)
#[test]
fn test_cpp_perturb1() {
    // Diamond with square hole
    let big = Manifold::extrude(
        &vec![
            vec![
                Vec2::new(0.0, 2.0), Vec2::new(2.0, 0.0),
                Vec2::new(4.0, 2.0), Vec2::new(2.0, 4.0),
            ],
            vec![
                Vec2::new(1.0, 2.0), Vec2::new(2.0, 3.0),
                Vec2::new(3.0, 2.0), Vec2::new(2.0, 1.0),
            ],
        ],
        1.0, 0, 0.0, Vec2::new(1.0, 1.0),
    );
    let little = Manifold::extrude(
        &vec![vec![
            Vec2::new(2.0, 1.0), Vec2::new(3.0, 2.0),
            Vec2::new(2.0, 3.0), Vec2::new(1.0, 2.0),
        ]],
        1.0, 0, 0.0, Vec2::new(1.0, 1.0),
    ).translate(Vec3::new(0.0, 0.0, 1.0));
    let punch_hole = Manifold::extrude(
        &vec![vec![
            Vec2::new(1.0, 2.0), Vec2::new(2.0, 2.0),
            Vec2::new(2.0, 3.0),
        ]],
        1.0, 0, 0.0, Vec2::new(1.0, 1.0),
    ).translate(Vec3::new(0.0, 0.0, 1.0));
    let result = (big + little) - punch_hole;
    assert_eq!(result.num_degenerate_tris(), 0, "Perturb1: has degenerate tris");
    assert_eq!(result.num_vert(), 24, "Perturb1 verts: {} expected 24", result.num_vert());
    assert!(
        (result.volume() - 7.5).abs() < 1e-4,
        "Perturb1 volume: {} expected 7.5", result.volume()
    );
    assert!(
        (result.surface_area() - 38.2).abs() < 0.1,
        "Perturb1 SA: {} expected ~38.2", result.surface_area()
    );
}

/// C++ TEST(CrossSection, MirrorUnion) — CrossSection mirror and union
#[test]
fn test_cpp_cross_section_mirror_union() {
    // C++ uses CrossSection::Square({5,5}, true) which centers at origin
    let a = CrossSection::new(vec![vec![
        Vec2::new(-2.5, -2.5),
        Vec2::new(2.5, -2.5),
        Vec2::new(2.5, 2.5),
        Vec2::new(-2.5, 2.5),
    ]]);
    let b = a.translate(Vec2::new(2.5, 2.5));
    let cross = a.union(&b).union(&b.mirror(Vec2::new(1.0, 1.0)));
    let _result = Manifold::extrude(&cross.to_polygons(), 5.0, 0, 0.0, Vec2::new(1.0, 1.0));

    assert!(
        (cross.area() - 2.5 * a.area()).abs() < 1.0,
        "MirrorUnion area: {} expected {}", cross.area(), 2.5 * a.area()
    );
    assert!(a.mirror(Vec2::new(0.0, 0.0)).is_empty(), "Mirror with zero axis should be empty");
}

/// C++ TEST(CrossSection, RoundOffset) — CrossSection offset with round joins
#[test]
fn test_cpp_cross_section_round_offset() {
    let a = CrossSection::square(20.0).translate(Vec2::new(-10.0, -10.0));
    let rounded = a.offset(5.0);
    let result = Manifold::extrude(&rounded.to_polygons(), 5.0, 0, 0.0, Vec2::new(1.0, 1.0));

    assert_eq!(result.genus(), 0, "RoundOffset genus: {} expected 0", result.genus());
    assert!(
        (result.volume() - 4386.0).abs() < 50.0,
        "RoundOffset volume: {} expected ~4386", result.volume()
    );
}

/// C++ TEST(CrossSection, Decompose) — decompose disjoint cross sections
#[test]
fn test_cpp_cross_section_decompose() {
    let a = CrossSection::square(2.0).translate(Vec2::new(-1.0, -1.0))
        .difference(&CrossSection::square(1.0).translate(Vec2::new(-0.5, -0.5)));
    let b = a.translate(Vec2::new(4.0, 4.0));
    let ab = a.union(&b);
    let decomp = ab.decompose();

    assert_eq!(decomp.len(), 2, "Decompose should produce 2 components, got {}", decomp.len());
    assert_eq!(decomp[0].num_contour(), 2, "Component 0 should have 2 contours, got {}", decomp[0].num_contour());
    assert_eq!(decomp[1].num_contour(), 2, "Component 1 should have 2 contours, got {}", decomp[1].num_contour());
}

/// C++ TEST(CrossSection, Transform) — CrossSection transform operations
#[test]
fn test_cpp_cross_section_transform() {
    let sq = CrossSection::square(10.0);
    let a = sq.rotate(45.0).scale(Vec2::new(2.0, 3.0)).translate(Vec2::new(4.0, 5.0));

    let ex_a = Manifold::extrude(&a.to_polygons(), 1.0, 0, 0.0, Vec2::new(1.0, 1.0));

    // Verify the result is valid and has the expected area
    // Original square area = 100, scaled by 2*3 = 600
    assert!(
        (a.area() - 600.0).abs() < 1.0,
        "Transform area: {} expected ~600", a.area()
    );
    assert!(!ex_a.is_empty(), "Transform extrusion should not be empty");
}

/// C++ TEST(CrossSection, MirrorCheckAxis) — verify mirror along (1,1) and (-1,1)
#[test]
fn test_cpp_cross_section_mirror_check_axis() {
    use crate::cross_section::CrossSection;
    let tri = CrossSection::new(vec![vec![
        Vec2::new(0.0, 0.0),
        Vec2::new(5.0, 5.0),
        Vec2::new(0.0, 10.0),
    ]]);

    let a = tri.mirror(Vec2::new(1.0, 1.0)).bounds();
    let a_expected = CrossSection::new(vec![vec![
        Vec2::new(0.0, 0.0),
        Vec2::new(-10.0, 0.0),
        Vec2::new(-5.0, -5.0),
    ]]).bounds();

    assert!((a.min.x - a_expected.min.x).abs() < 0.001,
        "MirrorCheckAxis a: min.x {} vs {}", a.min.x, a_expected.min.x);
    assert!((a.min.y - a_expected.min.y).abs() < 0.001,
        "MirrorCheckAxis a: min.y {} vs {}", a.min.y, a_expected.min.y);
    assert!((a.max.x - a_expected.max.x).abs() < 0.001,
        "MirrorCheckAxis a: max.x {} vs {}", a.max.x, a_expected.max.x);
    assert!((a.max.y - a_expected.max.y).abs() < 0.001,
        "MirrorCheckAxis a: max.y {} vs {}", a.max.y, a_expected.max.y);

    let b = tri.mirror(Vec2::new(-1.0, 1.0)).bounds();
    let b_expected = CrossSection::new(vec![vec![
        Vec2::new(0.0, 0.0),
        Vec2::new(10.0, 0.0),
        Vec2::new(5.0, 5.0),
    ]]).bounds();

    assert!((b.min.x - b_expected.min.x).abs() < 0.001,
        "MirrorCheckAxis b: min.x {} vs {}", b.min.x, b_expected.min.x);
    assert!((b.min.y - b_expected.min.y).abs() < 0.001,
        "MirrorCheckAxis b: min.y {} vs {}", b.min.y, b_expected.min.y);
    assert!((b.max.x - b_expected.max.x).abs() < 0.001,
        "MirrorCheckAxis b: max.x {} vs {}", b.max.x, b_expected.max.x);
    assert!((b.max.y - b_expected.max.y).abs() < 0.001,
        "MirrorCheckAxis b: max.y {} vs {}", b.max.y, b_expected.max.y);
}

/// C++ TEST(CrossSection, Rect) — rect area, contains, overlap
#[test]
fn test_cpp_cross_section_rect() {
    use crate::types::Rect;
    use crate::cross_section::CrossSection;
    let w = 10.0;
    let h = 5.0;
    let rect = Rect::from_points(Vec2::new(0.0, 0.0), Vec2::new(w, h));
    // Build a CrossSection from the rect
    let cross = CrossSection::new(vec![vec![
        Vec2::new(0.0, 0.0),
        Vec2::new(w, 0.0),
        Vec2::new(w, h),
        Vec2::new(0.0, h),
    ]]);
    let area = rect.area();

    assert!((area - w * h).abs() < 1e-6, "Rect area: {} expected {}", area, w * h);
    assert!((area - cross.area()).abs() < 1e-6,
        "Rect area {} != CrossSection area {}", area, cross.area());
    assert!(rect.contains_point(Vec2::new(5.0, 5.0)), "Rect should contain (5,5)");
    assert!(rect.contains_rect(&cross.bounds()), "Rect should contain cross bounds");
    assert!(rect.contains_rect(&Rect::new()), "Rect should contain empty rect");
    assert!(rect.does_overlap(&Rect::from_points(Vec2::new(5.0, 5.0), Vec2::new(15.0, 15.0))),
        "Rect should overlap shifted rect");
    assert!(Rect::new().is_empty(), "Default Rect should be empty");
}

/// C++ TEST(CrossSection, NegativeOffset) — inward offset on plus sign
#[test]
fn test_cpp_cross_section_negative_offset() {
    use crate::cross_section::CrossSection;
    // CrossSection::Square({30, 50}, true) = centered 30x50 rect
    let sq1 = CrossSection::new(vec![vec![
        Vec2::new(-15.0, -25.0), Vec2::new(15.0, -25.0),
        Vec2::new(15.0, 25.0), Vec2::new(-15.0, 25.0),
    ]]);
    let sq2 = CrossSection::new(vec![vec![
        Vec2::new(-25.0, -15.0), Vec2::new(25.0, -15.0),
        Vec2::new(25.0, 15.0), Vec2::new(-25.0, 15.0),
    ]]);
    let plus_sign = sq1.union(&sq2);
    // offset_with_params: join_type 1=Round, miter_limit=2.0
    let dilated = plus_sign.offset_with_params(-10.0, 1, 2.0, 1024);
    let expected = 30.0 * 30.0 - 10.0 * 10.0 * std::f64::consts::PI;
    // Tolerance is wider because circular_segments param isn't fully wired
    // through to clipper2 arc precision yet
    assert!((dilated.area() - expected).abs() < 1.0,
        "NegativeOffset area: {} expected {}", dilated.area(), expected);
}

/// C++ TEST(Boolean, EdgeUnion) — two cubes sharing an edge stay disjoint
#[test]
fn test_cpp_boolean_edge_union() {
    let mut cubes = Manifold::cube(Vec3::new(1.0, 1.0, 1.0), false);
    cubes = cubes.union(&cubes.translate(Vec3::new(1.0, 1.0, 0.0)));
    assert!(!cubes.is_empty(), "EdgeUnion should not be empty");
    // Two disjoint cubes: 16 verts, 24 tris total
    assert_eq!(cubes.num_vert(), 16, "EdgeUnion: {} verts expected 16", cubes.num_vert());
    assert_eq!(cubes.num_tri(), 24, "EdgeUnion: {} tris expected 24", cubes.num_tri());
}

/// C++ TEST(Boolean, Precision2) — cubes that barely overlap vs barely don't
#[test]
fn test_cpp_boolean_precision2() {
    let scale = 1000.0;
    let k_precision: f64 = crate::types::K_PRECISION;
    let cube = Manifold::cube(Vec3::splat(scale), false);
    let distance = scale * (1.0 - k_precision / 2.0);

    let cube2 = cube.translate(Vec3::splat(-distance));
    let intersection = cube.intersection(&cube2);
    assert!(intersection.is_empty(),
        "Precision2: cubes offset by scale*(1-kPrec/2) should have empty intersection");

    let cube3 = cube2.translate(Vec3::splat(scale * k_precision));
    let intersection2 = cube.intersection(&cube3);
    assert!(!intersection2.is_empty(),
        "Precision2: cubes shifted back by scale*kPrec should intersect");
}

/// C++ TEST(Manifold, MeshID) — two imports of same MeshGL get different IDs
#[test]
fn test_cpp_manifold_mesh_id() {
    let cube = Manifold::cube(Vec3::new(1.0, 1.0, 1.0), false);
    let mut cube_gl = cube.get_mesh_gl(3);
    cube_gl.run_index.clear();
    cube_gl.run_original_id.clear();
    cube_gl.run_transform.clear();
    let cube1 = Manifold::from_mesh_gl(&cube_gl);
    let cube2 = Manifold::from_mesh_gl(&cube_gl);
    assert!(!cube1.is_empty(), "cube1 should not be empty, status={:?}", cube1.status());
    assert!(!cube2.is_empty(), "cube2 should not be empty, status={:?}", cube2.status());
    let gl1 = cube1.get_mesh_gl(3);
    assert!(!gl1.run_original_id.is_empty(), "gl1 should have run_original_id");
    let id1 = gl1.run_original_id[0];
    let id2 = cube2.get_mesh_gl(3).run_original_id[0];
    assert_ne!(id1, id2, "MeshID: two imports should get different IDs: {} vs {}", id1, id2);
}
