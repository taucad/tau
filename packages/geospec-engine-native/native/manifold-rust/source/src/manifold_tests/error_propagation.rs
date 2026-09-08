// Tests ported from C++ TEST(Manifold, ErrorPropagation*) in manifold_test.cpp
// Verify that operations on an errored manifold propagate the error status.

use super::*;
use crate::types::Error;

/// Build a tetrahedron MeshGL with a NaN vertex property, giving NonFiniteVertex.
fn errored_tet() -> Manifold {
    let mut gl = super::api::tet_gl();
    // Set vertex 1's Z property to NaN (index 7 in 5-prop layout).
    gl.vert_properties[7] = f32::NAN;
    let m = Manifold::from_mesh_gl(&gl);
    assert_eq!(m.status(), Error::NonFiniteVertex,
        "Precondition: expected NonFiniteVertex");
    m
}

/// C++ TEST(Manifold, ErrorPropagationDecompose)
#[test]
fn test_cpp_error_propagation_decompose() {
    let errored = errored_tet();
    let parts = errored.decompose();
    assert_eq!(parts.len(), 1, "expected 1 part, got {}", parts.len());
    assert_eq!(parts[0].status(), Error::NonFiniteVertex);
}

/// C++ TEST(Manifold, ErrorPropagationHull)
#[test]
fn test_cpp_error_propagation_hull() {
    let errored = errored_tet();
    assert_eq!(errored.convex_hull().status(), Error::NonFiniteVertex);
}

/// C++ TEST(Manifold, ErrorPropagationHullMulti)
#[test]
fn test_cpp_error_propagation_hull_multi() {
    let errored = errored_tet();
    let good = Manifold::cube(Vec3::splat(1.0), false);
    assert_eq!(Manifold::hull_manifolds(&[good, errored]).status(),
        Error::NonFiniteVertex);
}

/// C++ TEST(Manifold, ErrorPropagationSetProperties)
#[test]
fn test_cpp_error_propagation_set_properties() {
    let errored = errored_tet();
    let out = errored.set_properties(1, |_, _, _| {});
    assert_eq!(out.status(), Error::NonFiniteVertex);
}

/// C++ TEST(Manifold, ErrorPropagationCalculateCurvature)
#[test]
fn test_cpp_error_propagation_calculate_curvature() {
    let errored = errored_tet();
    assert_eq!(errored.calculate_curvature(0, 1).status(), Error::NonFiniteVertex);
}

/// C++ TEST(Manifold, ErrorPropagationCalculateNormals)
#[test]
fn test_cpp_error_propagation_calculate_normals() {
    let errored = errored_tet();
    assert_eq!(errored.calculate_normals(0, 60.0).status(), Error::NonFiniteVertex);
}

/// C++ TEST(Manifold, ErrorPropagationSmoothByNormals)
#[test]
fn test_cpp_error_propagation_smooth_by_normals() {
    let errored = errored_tet();
    assert_eq!(errored.smooth_by_normals(0).status(), Error::NonFiniteVertex);
}

/// C++ TEST(Manifold, ErrorPropagationSmoothOut)
#[test]
fn test_cpp_error_propagation_smooth_out() {
    let errored = errored_tet();
    assert_eq!(errored.smooth_out(60.0, 0.0).status(), Error::NonFiniteVertex);
}

/// C++ TEST(Manifold, ErrorPropagationRefine)
#[test]
fn test_cpp_error_propagation_refine() {
    let errored = errored_tet();
    assert_eq!(errored.refine(2).status(), Error::NonFiniteVertex);
    assert_eq!(errored.refine_to_length(0.1).status(), Error::NonFiniteVertex);
    assert_eq!(errored.refine_to_tolerance(0.1).status(), Error::NonFiniteVertex);
}

/// C++ TEST(Manifold, ErrorPropagationSetTolerance)
#[test]
fn test_cpp_error_propagation_set_tolerance() {
    let errored = errored_tet();
    assert_eq!(errored.set_tolerance(0.1).status(), Error::NonFiniteVertex);
}

/// C++ TEST(Manifold, ErrorPropagationAsOriginal)
#[test]
fn test_cpp_error_propagation_as_original() {
    let errored = errored_tet();
    assert_eq!(errored.as_original().status(), Error::NonFiniteVertex);
}

/// C++ TEST(Manifold, ErrorPropagationWarp)
#[test]
fn test_cpp_error_propagation_warp() {
    let errored = errored_tet();
    assert_eq!(errored.warp(|_| {}).status(), Error::NonFiniteVertex);
    assert_eq!(errored.warp_batch(|_| {}).status(), Error::NonFiniteVertex);
}

/// C++ TEST(Manifold, ErrorPropagationSimplify)
#[test]
fn test_cpp_error_propagation_simplify() {
    let errored = errored_tet();
    assert_eq!(errored.simplify(0.0).status(), Error::NonFiniteVertex);
}

/// C++ TEST(Manifold, ErrorPropagationMinkowski) — added in v3.5.0 (#1659).
#[test]
fn test_cpp_error_propagation_minkowski() {
    let errored = errored_tet();
    let good = Manifold::cube(Vec3::splat(1.0), false);
    assert_eq!(errored.minkowski_sum(&good).status(), Error::NonFiniteVertex);
    assert_eq!(good.minkowski_sum(&errored).status(), Error::NonFiniteVertex);
    assert_eq!(errored.minkowski_difference(&good).status(), Error::NonFiniteVertex);
    assert_eq!(good.minkowski_difference(&errored).status(), Error::NonFiniteVertex);
}

/// C++ TEST(Manifold, ErrorPropagationSplitByPlane) — added in v3.5.0 (#1659).
#[test]
fn test_cpp_error_propagation_split_by_plane() {
    let errored = errored_tet();
    let (a, b) = errored.split_by_plane(Vec3::new(0.0, 0.0, 1.0), 0.0);
    assert_eq!(a.status(), Error::NonFiniteVertex);
    assert_eq!(b.status(), Error::NonFiniteVertex);
}

/// C++ TEST(Manifold, ErrorPropagationMirror) — added in v3.5.0 (#1659).
#[test]
fn test_cpp_error_propagation_mirror() {
    let errored = errored_tet();
    assert_eq!(errored.mirror(Vec3::new(1.0, 0.0, 0.0)).status(), Error::NonFiniteVertex);
    // Degenerate (zero-length) normal on errored input must still propagate.
    assert_eq!(errored.mirror(Vec3::new(0.0, 0.0, 0.0)).status(), Error::NonFiniteVertex);
}
