// Tests ported from C++ TEST(Manifold, RayCast*) in manifold_test.cpp
// These test the Manifold::ray_cast(origin, endpoint) → Vec<RayHit> API.

use super::*;

/// C++ TEST(Manifold, RayCastHitCube) — ray through center along Z
#[test]
fn test_cpp_ray_cast_hit_cube() {
    let cube = Manifold::cube(Vec3::splat(1.0), true);
    let hits = cube.ray_cast(Vec3::new(0.0, 0.0, -5.0), Vec3::new(0.0, 0.0, 5.0));
    assert_eq!(hits.len(), 2, "expected 2 hits, got {}", hits.len());
    // hits are sorted by distance; first hit is closer to origin
    assert!(hits[0].distance < hits[1].distance);
    assert!((hits[0].position.z - (-0.5)).abs() < 1e-5,
        "hit[0].z = {}, expected -0.5", hits[0].position.z);
    assert!((hits[1].position.z - 0.5).abs() < 1e-5,
        "hit[1].z = {}, expected 0.5", hits[1].position.z);
    assert!((hits[0].normal.z - (-1.0)).abs() < 1e-5,
        "hit[0].normal.z = {}, expected -1", hits[0].normal.z);
    assert!((hits[1].normal.z - 1.0).abs() < 1e-5,
        "hit[1].normal.z = {}, expected 1", hits[1].normal.z);
}

/// C++ TEST(Manifold, RayCastMiss) — ray that misses the cube
#[test]
fn test_cpp_ray_cast_miss() {
    let cube = Manifold::cube(Vec3::splat(1.0), true);
    let hits = cube.ray_cast(Vec3::new(10.0, 10.0, -5.0), Vec3::new(10.0, 10.0, 5.0));
    assert_eq!(hits.len(), 0, "expected 0 hits, got {}", hits.len());
}

/// C++ TEST(Manifold, RayCastDiagonal) — diagonal ray (not axis-aligned)
#[test]
fn test_cpp_ray_cast_diagonal() {
    let cube = Manifold::cube(Vec3::splat(1.0), true);
    let hits = cube.ray_cast(Vec3::new(-5.0, -5.0, -5.0), Vec3::new(5.0, 5.0, 5.0));
    assert_eq!(hits.len(), 2, "expected 2 hits, got {}", hits.len());
    assert!((hits[0].position.z - (-0.5)).abs() < 1e-4,
        "hit[0].z = {}, expected -0.5", hits[0].position.z);
}

/// C++ TEST(Manifold, RayCastBehindOrigin) — ray pointing away from cube
#[test]
fn test_cpp_ray_cast_behind_origin() {
    let cube = Manifold::cube(Vec3::splat(1.0), true);
    // endpoint is further in the +Z direction than origin, but both are outside cube
    let hits = cube.ray_cast(Vec3::new(0.0, 0.0, 5.0), Vec3::new(0.0, 0.0, 10.0));
    assert_eq!(hits.len(), 0, "expected 0 hits, got {}", hits.len());
}

/// C++ TEST(Manifold, RayCastSphere) — ray through sphere
#[test]
fn test_cpp_ray_cast_sphere() {
    let sphere = Manifold::sphere(1.0, 128);
    let hits = sphere.ray_cast(Vec3::new(0.0, 0.0, -5.0), Vec3::new(0.0, 0.0, 5.0));
    assert_eq!(hits.len(), 2, "expected 2 hits through sphere, got {}", hits.len());
    // Hit point should be approximately on the unit sphere
    let p = hits[0].position;
    let r = (p.x * p.x + p.y * p.y + p.z * p.z).sqrt();
    assert!((r - 1.0).abs() < 1e-3, "hit[0] radius = {}, expected ≈1.0", r);

    // Ray that misses
    let miss = sphere.ray_cast(Vec3::new(2.0, 2.0, -5.0), Vec3::new(2.0, 2.0, 5.0));
    assert_eq!(miss.len(), 0, "expected 0 hits (miss), got {}", miss.len());
}

/// C++ TEST(Manifold, RayCastTwoCubes) — ray through two separated cubes
#[test]
fn test_cpp_ray_cast_two_cubes() {
    let c1 = Manifold::cube(Vec3::splat(1.0), true);
    let c2 = Manifold::cube(Vec3::splat(1.0), true).translate(Vec3::new(0.0, 0.0, 5.0));
    let both = c1 + c2;
    let hits = both.ray_cast(Vec3::new(0.0, 0.0, -5.0), Vec3::new(0.0, 0.0, 10.0));
    assert_eq!(hits.len(), 4, "expected 4 hits through two cubes, got {}", hits.len());
    assert!((hits[0].position.z - (-0.5)).abs() < 1e-4,
        "hits[0].z = {}", hits[0].position.z);
    assert!((hits[1].position.z - 0.5).abs() < 1e-4,
        "hits[1].z = {}", hits[1].position.z);
    assert!((hits[2].position.z - 4.5).abs() < 1e-4,
        "hits[2].z = {}", hits[2].position.z);
    assert!((hits[3].position.z - 5.5).abs() < 1e-4,
        "hits[3].z = {}", hits[3].position.z);
}

/// C++ TEST(Manifold, RayCastEmpty) — ray against empty manifold
#[test]
fn test_cpp_ray_cast_empty() {
    let empty = Manifold::default();
    let hits = empty.ray_cast(Vec3::new(0.0, 0.0, -5.0), Vec3::new(0.0, 0.0, 5.0));
    assert_eq!(hits.len(), 0, "expected 0 hits against empty, got {}", hits.len());
}

/// C++ TEST(Manifold, RayCastAlongX) — axis-aligned ray along X
#[test]
fn test_cpp_ray_cast_along_x() {
    let cube = Manifold::cube(Vec3::splat(1.0), true);
    let hits = cube.ray_cast(Vec3::new(-5.0, 0.0, 0.0), Vec3::new(5.0, 0.0, 0.0));
    assert_eq!(hits.len(), 2, "expected 2 hits along X, got {}", hits.len());
    assert!((hits[0].position.x - (-0.5)).abs() < 1e-5,
        "hits[0].x = {}", hits[0].position.x);
}

/// C++ TEST(Manifold, RayCastAlongY) — axis-aligned ray along Y
#[test]
fn test_cpp_ray_cast_along_y() {
    let cube = Manifold::cube(Vec3::splat(1.0), true);
    let hits = cube.ray_cast(Vec3::new(0.0, -5.0, 0.0), Vec3::new(0.0, 5.0, 0.0));
    assert_eq!(hits.len(), 2, "expected 2 hits along Y, got {}", hits.len());
    assert!((hits[0].position.y - (-0.5)).abs() < 1e-5,
        "hits[0].y = {}", hits[0].position.y);
}

/// C++ TEST(Manifold, RayCastZeroLength) — zero-length ray returns no hits
#[test]
fn test_cpp_ray_cast_zero_length() {
    let cube = Manifold::cube(Vec3::splat(1.0), true);
    let hits = cube.ray_cast(Vec3::new(0.0, 0.0, 0.0), Vec3::new(0.0, 0.0, 0.0));
    assert_eq!(hits.len(), 0, "expected 0 hits for zero-length ray");
}

/// C++ TEST(Manifold, RayCastWatertightVertex) — ray exactly through a vertex
/// Symbolic perturbation should give exactly 2 hits.
#[test]
fn test_cpp_ray_cast_watertight_vertex() {
    let cube = Manifold::cube(Vec3::splat(1.0), true);
    let hits = cube.ray_cast(Vec3::new(0.5, 0.5, -5.0), Vec3::new(0.5, 0.5, 5.0));
    assert_eq!(hits.len(), 2, "expected 2 hits through vertex, got {}", hits.len());
    assert!((hits[0].position.z - (-0.5)).abs() < 1e-5,
        "hits[0].z = {}", hits[0].position.z);
}

/// C++ TEST(Manifold, RayCastSilhouetteEdge) — ray at silhouette edge
/// Must return 0 or 2 hits (never 1, preserves watertightness).
#[test]
fn test_cpp_ray_cast_silhouette_edge() {
    let cube = Manifold::cube(Vec3::splat(1.0), true);
    let hits = cube.ray_cast(Vec3::new(0.5, 0.0, -5.0), Vec3::new(0.5, 0.0, 5.0));
    assert!(hits.len() == 0 || hits.len() == 2,
        "expected 0 or 2 hits at silhouette edge, got {}", hits.len());
}
