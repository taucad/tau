// manifold_shape.rs — shape-producing constructors on Manifold: primitives
// (tetrahedron, cube, cylinder, sphere, extrude, revolve), convex hulls,
// SDF level sets, Minkowski sums and 2D cross-section helpers.
//
// Extracted from manifold.rs for file size management; a child module of
// `manifold` so these methods keep access to the private `imp` field and
// callers keep the same `Manifold::cube(...)` paths. Ports the corresponding
// static constructors of C++ Manifold (constructors.cpp, sdf.cpp,
// quickhull.cpp, minkowski.cpp).

use crate::constructors;
use crate::cross_section::CrossSection;
use crate::impl_mesh::ManifoldImpl;
use crate::linalg::{mat4_to_mat3x4, normalize, scaling_matrix, translation_matrix, Mat3x4, Vec2, Vec3};
use crate::math;
use crate::minkowski;
use crate::quickhull;
use crate::sdf;
use crate::types::{Error, Polygons};
use super::Manifold;

impl Manifold {
    pub fn tetrahedron() -> Self {
        Self::from_impl(ManifoldImpl::tetrahedron(&Mat3x4::identity()))
    }

    pub fn cube(size: Vec3, center: bool) -> Self {
        if size.x < 0.0 || size.y < 0.0 || size.z < 0.0
            || crate::linalg::length(size) == 0.0
        {
            return Self::make_empty(crate::types::Error::InvalidConstruction);
        }
        let translation = if center {
            translation_matrix(-size * 0.5)
        } else {
            translation_matrix(Vec3::new(0.0, 0.0, 0.0))
        };
        let transform = mat4_to_mat3x4(translation * scaling_matrix(size));
        Self::from_impl(ManifoldImpl::cube(&transform))
    }

    pub fn cylinder(height: f64, radius_low: f64, radius_high: f64, circular_segments: i32) -> Self {
        Self::cylinder_centered(height, radius_low, radius_high, circular_segments, false)
    }

    pub fn cylinder_centered(height: f64, radius_low: f64, radius_high: f64, circular_segments: i32, center: bool) -> Self {
        if height <= 0.0 || radius_low < 0.0 {
            return Self::make_empty(crate::types::Error::InvalidConstruction);
        }
        if radius_low == 0.0 && radius_high <= 0.0 {
            return Self::make_empty(crate::types::Error::InvalidConstruction);
        }
        Self::from_impl(constructors::cylinder(
            height,
            radius_low,
            radius_high,
            circular_segments,
            center,
        ))
    }

    pub fn sphere(radius: f64, circular_segments: i32) -> Self {
        if radius <= 0.0 {
            return Self::make_empty(crate::types::Error::InvalidConstruction);
        }
        const K_HALF_PI: f64 = std::f64::consts::FRAC_PI_2;

        // Build unit octahedron and subdivide each edge into exactly n parts in
        // one pass (n^2 tris per original face), matching C++:
        //   n = (circularSegments + 3) / 4   (or Quality-based when unspecified)
        //   Subdivide([n](...) { return n - 1; })
        // n-1 is the number of *added* verts per edge. Using the n-way Subdivide
        // (not binary midpoint splits) gives exact non-power-of-2 counts, e.g.
        // Sphere(_, 25) -> 8 * 25^2 = 5000 tris rather than 8 * 32^2 = 8192.
        let identity = mat4_to_mat3x4(scaling_matrix(Vec3::splat(1.0)));
        let mut mesh = ManifoldImpl::octahedron(&identity);
        let n = if circular_segments > 0 {
            (circular_segments + 3) / 4
        } else {
            crate::types::Quality::get_circular_segments(radius) / 4
        };
        if n > 1 {
            mesh.subdivide(&|_, _, _| n - 1, false);
        }

        // Map subdivided octahedron vertices onto the sphere surface
        // (matches C++: v = cos(π/2 * (1 - v)); v = radius * normalize(v))
        for v in mesh.vert_pos.iter_mut() {
            let mapped = Vec3::new(
                math::cos(K_HALF_PI * (1.0 - v.x)),
                math::cos(K_HALF_PI * (1.0 - v.y)),
                math::cos(K_HALF_PI * (1.0 - v.z)),
            );
            let n = normalize(mapped);
            *v = if n.x.is_nan() { Vec3::splat(0.0) } else { Vec3::new(n.x * radius, n.y * radius, n.z * radius) };
        }

        // Rebuild mesh metadata after vertex positions changed
        mesh.calculate_bbox();
        mesh.set_epsilon(-1.0, false);
        mesh.sort_geometry();
        mesh.set_normals_and_coplanar();

        Self::from_impl(mesh)
    }

    pub fn extrude(cross_section: &Polygons, height: f64, n_divisions: i32, twist_degrees: f64, scale_top: Vec2) -> Self {
        if cross_section.is_empty() || height <= 0.0 {
            return Self::make_empty(crate::types::Error::InvalidConstruction);
        }
        Self::from_impl(constructors::extrude(cross_section, height, n_divisions, twist_degrees, scale_top))
    }

    pub fn revolve(cross_section: &Polygons, circular_segments: i32, revolve_degrees: f64) -> Self {
        if cross_section.is_empty() {
            return Self::make_empty(crate::types::Error::InvalidConstruction);
        }
        Self::from_impl(constructors::revolve(cross_section, circular_segments, revolve_degrees))
    }

    pub fn level_set<F: Fn(Vec3) -> f64 + Sync>(sdf_fn: F, bounds: crate::types::Box, edge_length: f64) -> Self {
        Self::from_impl(sdf::level_set(sdf_fn, bounds, edge_length, 0.0, -1.0))
    }

    pub fn level_set_with_level<F: Fn(Vec3) -> f64 + Sync>(sdf_fn: F, bounds: crate::types::Box, edge_length: f64, level: f64) -> Self {
        Self::from_impl(sdf::level_set(sdf_fn, bounds, edge_length, level, -1.0))
    }

    /// Full-parameter LevelSet matching C++ `Manifold::LevelSet(sdf, bounds,
    /// edgeLength, level, tolerance)`. Positive `tolerance` refines each
    /// crossing vertex to within that distance of the true surface.
    pub fn level_set_with_tolerance<F: Fn(Vec3) -> f64 + Sync>(
        sdf_fn: F,
        bounds: crate::types::Box,
        edge_length: f64,
        level: f64,
        tolerance: f64,
    ) -> Self {
        Self::from_impl(sdf::level_set(sdf_fn, bounds, edge_length, level, tolerance))
    }

    pub fn hull(points: &[Vec3]) -> Self {
        Self::from_impl(quickhull::convex_hull(points))
    }

    /// Compute the convex hull of this manifold's vertices.
    pub fn convex_hull(&self) -> Self {
        if self.is_empty() { return self.clone(); }
        Self::from_impl(quickhull::convex_hull(&self.imp.vert_pos))
    }

    /// Compute the convex hull of multiple manifolds' combined vertices.
    /// If any manifold is errored, propagates its error status.
    pub fn hull_manifolds(manifolds: &[Self]) -> Self {
        // Propagate any error from inputs
        for m in manifolds {
            if m.imp.status != Error::NoError {
                return m.clone();
            }
        }
        let all_verts: Vec<Vec3> = manifolds
            .iter()
            .flat_map(|m| m.imp.vert_pos.iter().copied())
            .collect();
        Self::from_impl(quickhull::convex_hull(&all_verts))
    }

    pub fn minkowski_sum(&self, other: &Self) -> Self {
        if let Some(e) = self.require_paired() { return e; }
        if let Some(e) = other.require_paired() { return e; }
        // Per C++ #1659: propagate errored input status before computing.
        if self.imp.status != Error::NoError { return self.clone(); }
        if other.imp.status != Error::NoError { return other.clone(); }
        Self::from_impl(minkowski::minkowski_sum(&self.imp, &other.imp))
    }

    pub fn minkowski_difference(&self, other: &Self) -> Self {
        if let Some(e) = self.require_paired() { return e; }
        if let Some(e) = other.require_paired() { return e; }
        if self.imp.status != Error::NoError { return self.clone(); }
        if other.imp.status != Error::NoError { return other.clone(); }
        Self::from_impl(minkowski::minkowski_difference(&self.imp, &other.imp))
    }

    pub fn cross_section_square(size: f64) -> CrossSection {
        CrossSection::square(size)
    }

    pub fn cross_section_circle(radius: f64, segments: i32) -> CrossSection {
        CrossSection::circle(radius, segments)
    }
}
