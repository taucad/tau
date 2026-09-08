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

// Port of quickhull.cpp + quickhull.h -- 3D convex hull using QuickHull algorithm.
//
// Derived from the public domain work of Antti Kuukka at
// https://github.com/akuukka/quickhull

use crate::impl_mesh::ManifoldImpl;
use crate::linalg::{dot, normalize, Vec3};

#[path = "quickhull_algo.rs"]
mod quickhull_algo;
use quickhull_algo::QuickHull;

const DEFAULT_EPS: f64 = 0.0000001;

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

#[inline]
fn squared_distance(p1: Vec3, p2: Vec3) -> f64 {
    dot(p1 - p2, p1 - p2)
}

#[inline]
fn squared_distance_point_ray(p: Vec3, ray_s: Vec3, ray_v: Vec3, v_inv_len_sq: f64) -> f64 {
    let s = p - ray_s;
    let t = dot(s, ray_v);
    dot(s, s) - t * t * v_inv_len_sq
}

#[inline]
fn triangle_normal(a: Vec3, b: Vec3, c: Vec3) -> Vec3 {
    let x = a.x - c.x;
    let y = a.y - c.y;
    let z = a.z - c.z;
    let rhsx = b.x - c.x;
    let rhsy = b.y - c.y;
    let rhsz = b.z - c.z;
    let px = y * rhsz - z * rhsy;
    let py = z * rhsx - x * rhsz;
    let pz = x * rhsy - y * rhsx;
    normalize(Vec3::new(px, py, pz))
}

// ---------------------------------------------------------------------------
// Plane
// ---------------------------------------------------------------------------

#[derive(Clone, Debug)]
struct Plane {
    n: Vec3,
    d: f64,
    sqr_n_length: f64,
}

impl Plane {
    fn new(n: Vec3, point: Vec3) -> Self {
        Self {
            d: dot(-n, point),
            sqr_n_length: dot(n, n),
            n,
        }
    }

    fn default() -> Self {
        Self { n: Vec3::new(0.0, 0.0, 0.0), d: 0.0, sqr_n_length: 0.0 }
    }

    #[inline]
    fn is_point_on_positive_side(&self, q: Vec3) -> bool {
        dot(self.n, q) + self.d >= 0.0
    }
}

#[inline]
fn signed_distance_to_plane(v: Vec3, p: &Plane) -> f64 {
    dot(p.n, v) + p.d
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/// Compute the convex hull of a set of 3D points, returning a ManifoldImpl.
pub fn convex_hull(points: &[Vec3]) -> ManifoldImpl {
    if points.is_empty() {
        return ManifoldImpl::new();
    }

    let qh = QuickHull::new(points);
    let (halfedges, vertices) = qh.build_mesh(DEFAULT_EPS);

    if halfedges.is_empty() {
        return ManifoldImpl::new();
    }

    let mut imp = ManifoldImpl::new();
    imp.halfedge = halfedges;
    imp.vert_pos = vertices;
    imp.calculate_bbox();
    imp.set_epsilon(-1.0, false);
    imp.initialize_original();
    imp.sort_geometry();
    imp.set_normals_and_coplanar();
    imp
}

#[cfg(test)]
#[path = "quickhull_tests.rs"]
mod tests;
