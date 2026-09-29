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

use crate::boolean3;
use crate::cross_section::CrossSection;
use crate::math;
use crate::impl_mesh::ManifoldImpl;
use crate::linalg::{mat4_to_mat3x4, normalize, scaling_matrix, translation_matrix, Mat3, Mat3x4, Vec3};
use crate::types::{Error, OpType, RayHit};

#[derive(Clone)]
pub struct Manifold {
    imp: ManifoldImpl,
}

impl Default for Manifold {
    fn default() -> Self {
        Self::new()
    }
}

impl Manifold {
    pub fn new() -> Self {
        Self { imp: ManifoldImpl::new() }
    }

    pub fn empty() -> Self {
        Self::new()
    }

    /// Create an empty manifold with a specific error status.
    pub fn make_empty(status: crate::types::Error) -> Self {
        let mut imp = ManifoldImpl::new();
        imp.make_empty(status);
        Self { imp }
    }

    pub fn from_impl(imp: ManifoldImpl) -> Self {
        Self { imp }
    }

    pub fn as_impl(&self) -> &ManifoldImpl {
        &self.imp
    }

    pub fn into_impl(self) -> ManifoldImpl {
        self.imp
    }

    pub fn num_vert(&self) -> usize { self.imp.num_vert() }
    pub fn num_tri(&self) -> usize { self.imp.num_tri() }
    pub fn num_edge(&self) -> usize { self.imp.num_edge() }
    pub fn num_prop(&self) -> usize { self.imp.num_prop }
    pub fn num_prop_vert(&self) -> usize { self.imp.num_prop_vert() }
    pub fn is_empty(&self) -> bool { self.imp.is_empty() }
    pub fn status(&self) -> Error { self.imp.status }
    pub fn volume(&self) -> f64 { self.imp.get_property(crate::properties::Property::Volume) }
    pub fn surface_area(&self) -> f64 { self.imp.get_property(crate::properties::Property::SurfaceArea) }
    pub fn matches_tri_normals(&self) -> bool { self.imp.matches_tri_normals() }
    pub fn num_degenerate_tris(&self) -> i32 { self.imp.num_degenerate_tris() }
    pub fn get_tolerance(&self) -> f64 { self.imp.tolerance }
    pub fn get_epsilon(&self) -> f64 { self.imp.epsilon }

    /// Port of C++ Manifold::Genus()
    pub fn genus(&self) -> i32 {
        let chi = self.num_vert() as i32 - self.imp.num_edge() as i32 + self.num_tri() as i32;
        1 - chi / 2
    }

    /// Port of C++ Manifold::OriginalID()
    pub fn original_id(&self) -> i32 {
        self.imp.mesh_relation.original_id
    }

    /// Soup impls (non-manifold geometry imported via
    /// [`Manifold::from_mesh_gl_robust`]) support only robust-engine
    /// booleans, transforms, bounding-box queries, hulls, and mesh export.
    /// Pairing-dependent operations call this and return an empty manifold
    /// with [`Error::NotManifold`] instead of walking incomplete halfedges.
    pub(crate) fn require_paired(&self) -> Option<Self> {
        if self.imp.is_soup {
            Some(Self::make_empty(Error::NotManifold))
        } else {
            None
        }
    }

    /// Port of C++ Manifold::AsOriginal()
    /// Removes all mesh relations and recreates as an original mesh.
    pub fn as_original(&self) -> Self {
        if let Some(e) = self.require_paired() { return e; }
        if self.is_empty() { return self.clone(); }
        let mut out = self.imp.clone();
        out.initialize_original();
        out.set_normals_and_coplanar();
        Self::from_impl(out)
    }

    /// Port of C++ Manifold::ReserveIDs()
    pub fn reserve_ids(n: u32) -> u32 {
        crate::impl_mesh::reserve_ids(n)
    }

    /// Port of C++ Manifold::SetTolerance()
    pub fn set_tolerance(&self, tolerance: f64) -> Self {
        if let Some(e) = self.require_paired() { return e; }
        if self.is_empty() { return self.clone(); }
        let mut out = self.imp.clone();
        // Matches C++ SetTolerance: operate on the `tolerance` field (which
        // drives coplanar grouping in mark_coplanar), not `epsilon`. When
        // raising tolerance, recompute coplanar groups *first* so the
        // colinear-edge collapse in simplify_topology can see the newly
        // co-planar regions, then simplify, then re-sort.
        if tolerance > out.tolerance {
            out.tolerance = tolerance;
            out.set_normals_and_coplanar();
            crate::edge_op::simplify_topology(&mut out, 0);
            out.sort_geometry();
            // Collapsed edges move geometry; the cloned verdict is stale.
            out.invalidate_self_intersects();
        } else {
            // Reducing tolerance: keep it at least epsilon.
            out.tolerance = out.epsilon.max(tolerance);
        }
        Self::from_impl(out)
    }

    /// Port of C++ Manifold::Simplify()
    pub fn simplify(&self, tolerance: f64) -> Self {
        if let Some(e) = self.require_paired() { return e; }
        if self.is_empty() { return self.clone(); }
        let mut out = self.imp.clone();
        // C++ uses tolerance_ (not epsilon_) throughout Simplify()
        let old_tolerance = out.tolerance;
        let mut tol = tolerance;
        if tol == 0.0 {
            tol = old_tolerance;
        }
        if tol > old_tolerance {
            out.tolerance = tol;
            out.set_normals_and_coplanar();
        }
        crate::edge_op::simplify_topology(&mut out, 0);
        out.sort_geometry();
        // Collapsed edges move geometry; the cloned verdict is stale.
        out.invalidate_self_intersects();
        out.tolerance = old_tolerance;
        Self::from_impl(out)
    }

    /// Port of C++ Manifold::WarpBatch()
    pub fn warp_batch<F: Fn(&mut [Vec3])>(&self, warp_fn: F) -> Self {
        if let Some(e) = self.require_paired() { return e; }
        if self.is_empty() {
            return self.clone();
        }
        let mut out = self.imp.clone();
        warp_fn(&mut out.vert_pos);
        // Arbitrary deformation: nothing about the old verdict survives.
        out.invalidate_self_intersects();
        out.calculate_bbox();
        out.sort_geometry();
        out.set_normals_and_coplanar();
        out.mesh_relation.original_id = -1;
        Self::from_impl(out)
    }

    pub fn translate(&self, v: Vec3) -> Self {
        let t = mat4_to_mat3x4(translation_matrix(v));
        Self::from_impl(self.imp.transform(&t))
    }

    /// Rotate by Euler angles in degrees: first about X, then Y, then Z.
    ///
    /// Port of C++ `CsgNode::Rotate` (csg_tree.cpp): degree-based `sind`/`cosd`
    /// axis matrices composed `rZ*rY*rX`. Quaternions (sin/cos of half-angles in
    /// radians) differ from this by ~1 ULP, which is enough to flip
    /// symbolic-perturbation ties in the boolean kernel on almost-coplanar
    /// inputs (see PORTING_PLAN.md, `almost_coplanar`).
    pub fn rotate(&self, x_degrees: f64, y_degrees: f64, z_degrees: f64) -> Self {
        use crate::types::{cosd, sind};
        let (sx, cx) = (sind(x_degrees), cosd(x_degrees));
        let (sy, cy) = (sind(y_degrees), cosd(y_degrees));
        let (sz, cz) = (sind(z_degrees), cosd(z_degrees));
        let rx = Mat3::from_cols(
            Vec3::new(1.0, 0.0, 0.0),
            Vec3::new(0.0, cx, sx),
            Vec3::new(0.0, -sx, cx),
        );
        let ry = Mat3::from_cols(
            Vec3::new(cy, 0.0, -sy),
            Vec3::new(0.0, 1.0, 0.0),
            Vec3::new(sy, 0.0, cy),
        );
        let rz = Mat3::from_cols(
            Vec3::new(cz, sz, 0.0),
            Vec3::new(-sz, cz, 0.0),
            Vec3::new(0.0, 0.0, 1.0),
        );
        let m = rz * ry * rx;
        let t = Mat3x4::from_cols(m.x, m.y, m.z, Vec3::new(0.0, 0.0, 0.0));
        Self::from_impl(self.imp.transform(&t))
    }

    pub fn scale(&self, v: Vec3) -> Self {
        let t = mat4_to_mat3x4(scaling_matrix(v));
        Self::from_impl(self.imp.transform(&t))
    }

    pub fn transform(&self, m: &Mat3x4) -> Self {
        Self::from_impl(self.imp.transform(m))
    }

    /// Mirror this manifold over the plane defined by the given normal vector.
    /// If the normal is zero-length, returns an empty manifold.
    pub fn mirror(&self, normal: Vec3) -> Self {
        // Per C++ #1659: propagate an errored input even on the degenerate
        // (zero-length normal) path, which otherwise returns an empty manifold.
        if self.imp.status != Error::NoError {
            return self.clone();
        }
        let len = (normal.x * normal.x + normal.y * normal.y + normal.z * normal.z).sqrt();
        if len == 0.0 {
            return Self::empty();
        }
        let n = Vec3::new(normal.x / len, normal.y / len, normal.z / len);
        // Householder reflection: M = I - 2*n*n^T
        let m = Mat3x4::from_cols(
            Vec3::new(1.0 - 2.0 * n.x * n.x, -2.0 * n.x * n.y, -2.0 * n.x * n.z),
            Vec3::new(-2.0 * n.y * n.x, 1.0 - 2.0 * n.y * n.y, -2.0 * n.y * n.z),
            Vec3::new(-2.0 * n.z * n.x, -2.0 * n.z * n.y, 1.0 - 2.0 * n.z * n.z),
            Vec3::new(0.0, 0.0, 0.0),
        );
        Self::from_impl(self.imp.transform(&m))
    }

    /// Warp the mesh by applying a function to each vertex position.
    /// Does not check for self-intersection.
    pub fn warp<F: Fn(&mut Vec3)>(&self, warp_fn: F) -> Self {
        if let Some(e) = self.require_paired() { return e; }
        if self.is_empty() {
            return self.clone();
        }
        let mut out = self.imp.clone();
        for v in out.vert_pos.iter_mut() {
            warp_fn(v);
        }
        // Arbitrary deformation: nothing about the old verdict survives.
        out.invalidate_self_intersects();
        out.calculate_bbox();
        out.sort_geometry();
        out.set_normals_and_coplanar();
        out.mesh_relation.original_id = -1;
        Self::from_impl(out)
    }

    /// Get the bounding box of this manifold.
    pub fn bounding_box(&self) -> crate::types::Box {
        crate::types::Box {
            min: self.imp.bbox.min,
            max: self.imp.bbox.max,
        }
    }

    /// Split this manifold into two using a cutter manifold.
    /// Returns (intersection, difference).
    pub fn split(&self, cutter: &Self) -> (Self, Self) {
        let intersection = self.intersection(cutter);
        let difference = self.difference(cutter);
        (intersection, difference)
    }

    /// Split this manifold by a plane defined by a normal and offset from origin.
    /// Returns (in direction of normal, opposite direction).
    pub fn split_by_plane(&self, normal: Vec3, origin_offset: f64) -> (Self, Self) {
        // Per C++ #1659: errored manifolds are empty, so the is_empty()
        // early-return below would silently drop their status — guard first.
        if self.imp.status != Error::NoError {
            return (self.clone(), self.clone());
        }
        if self.is_empty() {
            return (Self::empty(), Self::empty());
        }
        let halfspace = Self::halfspace(&self.imp.bbox, normal, origin_offset);
        self.split(&halfspace)
    }

    /// Trim this manifold by a half-space, keeping only the part in the direction
    /// of the normal vector.
    pub fn trim_by_plane(&self, normal: Vec3, origin_offset: f64) -> Self {
        if self.is_empty() {
            return Self::empty();
        }
        let halfspace = Self::halfspace(&self.imp.bbox, normal, origin_offset);
        self.intersection(&halfspace)
    }

    /// Slice this manifold at the given Z height, returning the cross-section
    /// as a CrossSection. The reference CrossSection-returning slice performs
    /// a Positive-fill union of the internal polygon loops.
    pub fn slice(&self, height: f64) -> CrossSection {
        if self.imp.is_soup || self.is_empty() {
            return CrossSection::new(vec![]);
        }
        let polys = self.imp.slice(height);
        CrossSection::from_polygons_with_fill_rule(polys, crate::cross_section::FillRule::Positive)
    }

    /// Project this manifold onto the XY plane, returning the silhouette
    /// as a CrossSection. Mirrors C++ `Manifold::Project`.
    pub fn project(&self) -> CrossSection {
        if self.imp.is_soup || self.is_empty() {
            return CrossSection::new(vec![]);
        }
        let polys = self.imp.project();
        CrossSection::from_polygons_fill(polys)
    }

    /// Apply batch boolean operations on a list of manifolds.
    pub fn batch_boolean(manifolds: &[Self], op: OpType) -> Self {
        if manifolds.is_empty() {
            return Self::empty();
        }
        let mut result = manifolds[0].clone();
        for m in &manifolds[1..] {
            result = result.boolean(m, op);
        }
        result
    }

    /// Internal helper: create a halfspace (large cube) for plane splitting.
    fn halfspace(bbox: &crate::types::Box, normal: Vec3, origin_offset: f64) -> Self {
        let n = normalize(normal);
        let cutter = Self::cube(Vec3::splat(2.0), true).translate(Vec3::new(1.0, 0.0, 0.0));
        let center = bbox.center();
        let size_len = (bbox.size().x * bbox.size().x + bbox.size().y * bbox.size().y + bbox.size().z * bbox.size().z).sqrt();
        let dist = ((center.x - n.x * origin_offset).powi(2)
            + (center.y - n.y * origin_offset).powi(2)
            + (center.z - n.z * origin_offset).powi(2)).sqrt()
            + 0.5 * size_len;
        let cutter = cutter.scale(Vec3::splat(dist)).translate(Vec3::new(origin_offset, 0.0, 0.0));
        let y_deg = -math::asin(n.z).to_degrees();
        let z_deg = math::atan2(n.y, n.x).to_degrees();
        cutter.rotate(0.0, y_deg, z_deg)
    }

    pub fn boolean(&self, other: &Self, op: OpType) -> Self {
        self.boolean_with_engine(other, op, crate::types::BooleanConfig::default_engine())
    }

    /// True when two of this mesh's own triangles genuinely intersect —
    /// they cross, they overlap, or they are coincident surface — rather
    /// than merely sharing edges and vertices as every closed mesh does.
    ///
    /// Topologically manifold meshes can still be self-intersecting; those
    /// inputs break the exact boolean engine's assumptions, so
    /// [`crate::types::BooleanEngine::Auto`] routes them to the robust
    /// engine. A mesh carrying non-finite positions (e.g. after a warp to
    /// NaN) answers `true`, that being the safe verdict for geometry no
    /// exact predicate can evaluate.
    ///
    /// The scan is a BVH self-query with an exact narrow phase; the verdict
    /// is cached on the impl, so repeat queries (and the booleans that
    /// consult it) are free until the geometry changes.
    pub fn has_self_intersections(&self) -> bool {
        crate::robust::soup::has_self_intersections(&self.imp)
    }

    /// Repair the winding of inside-out shells so every body reads as solid
    /// material under the robust engine's {winding >= 1} semantics.
    ///
    /// Connected shells whose exact winding shows them inverted relative to
    /// their nesting are rewound: outermost shells end up winding +1 and
    /// cavity shells stay (or become) correctly inward-wound — legitimate
    /// voids are preserved, unlike a blanket flip of negative-signed-volume
    /// shells. Coincident/doubled sheets are deliberately left untouched;
    /// the robust boolean's winding-stack arithmetic already handles them.
    ///
    /// Works standalone (no boolean required) on both manifold and
    /// soup-backed impls; positions, properties, and mesh relations are
    /// untouched, only triangle winding changes. Returns `self` unchanged
    /// when nothing needs flipping.
    pub fn repair_orientation(&self) -> Self {
        if self.is_empty() {
            return self.clone();
        }
        let tris = crate::robust::soup::impl_to_tris(&self.imp);
        let plan = crate::robust::repair::plan_repair(&tris);
        if plan.is_noop() {
            return self.clone();
        }
        let mut out = self.imp.clone();
        crate::robust::repair::apply_flips(&mut out, &plan.flip);
        // Winding-only edit, but it rewrites halfedges in place; re-deriving
        // the verdict keeps the invalidate-on-in-place-edit rule absolute.
        out.invalidate_self_intersects();
        Self::from_impl(out)
    }

    /// [`Manifold::boolean`] with an explicit engine choice, overriding the
    /// process-global default set via
    /// [`crate::types::BooleanConfig::set_default_engine`].
    pub fn boolean_with_engine(
        &self,
        other: &Self,
        op: OpType,
        engine: crate::types::BooleanEngine,
    ) -> Self {
        Self::from_impl(boolean3::boolean_dispatch(&self.imp, &other.imp, op, engine, None))
    }

    /// [`Manifold::boolean_with_engine`] with cooperative cancellation.
    pub fn boolean_with_engine_and_token(
        &self,
        other: &Self,
        op: OpType,
        engine: crate::types::BooleanEngine,
        token: Option<&crate::cancel::CancelToken>,
    ) -> Self {
        Self::from_impl(boolean3::boolean_dispatch(&self.imp, &other.imp, op, engine, token))
    }

    /// [`Manifold::boolean_with_engine_and_token`] that also reports coarse
    /// pipeline progress.
    ///
    /// Cancellation and progress travel together because callers that want one
    /// almost always want the other (a UI showing a progress bar next to a
    /// cancel button); pass `None` for either independently. `None` progress is
    /// byte-for-byte the un-instrumented path — see [`crate::progress`] for the
    /// phases reported and the throttling contract.
    pub fn boolean_with_engine_and_progress(
        &self,
        other: &Self,
        op: OpType,
        engine: crate::types::BooleanEngine,
        token: Option<&crate::cancel::CancelToken>,
        progress: Option<&crate::progress::ProgressReporter>,
    ) -> Self {
        Self::from_impl(boolean3::boolean_dispatch_with_progress(
            &self.imp, &other.imp, op, engine, token, progress,
        ))
    }

    /// [`Manifold::boolean_with_engine`] with an explicit winding rule.
    ///
    /// [`crate::types::WindingRule::Nonzero`] treats inside-out geometry as
    /// solid (`w != 0` rather than `w >= 1`), which keeps the inverted regions
    /// of inconsistently wound scans instead of dropping them. The rule is a
    /// robust-engine semantic: the exact engine ignores it, and `Auto` routes
    /// to the robust engine whenever the rule is `Nonzero` (see
    /// [`crate::boolean3::boolean_dispatch_full`]).
    pub fn boolean_with_engine_and_rule(
        &self,
        other: &Self,
        op: OpType,
        engine: crate::types::BooleanEngine,
        rule: crate::types::WindingRule,
    ) -> Self {
        self.boolean_with_engine_rule_and_progress(other, op, engine, rule, None, None)
    }

    /// The full per-call boolean path: engine, winding rule, cancellation, and
    /// progress. Every other boolean entry point on `Manifold` is this one with
    /// defaults filled in.
    pub fn boolean_with_engine_rule_and_progress(
        &self,
        other: &Self,
        op: OpType,
        engine: crate::types::BooleanEngine,
        rule: crate::types::WindingRule,
        token: Option<&crate::cancel::CancelToken>,
        progress: Option<&crate::progress::ProgressReporter>,
    ) -> Self {
        Self::from_impl(boolean3::boolean_dispatch_full(
            &self.imp, &other.imp, op, engine, rule, token, progress,
        ))
    }

    /// [`Manifold::batch_boolean`] with an explicit engine choice (pairwise
    /// left fold, like `batch_boolean`).
    pub fn batch_boolean_with_engine(
        manifolds: &[Self],
        op: OpType,
        engine: crate::types::BooleanEngine,
    ) -> Self {
        if manifolds.is_empty() {
            return Self::empty();
        }
        let mut result = manifolds[0].clone();
        for m in &manifolds[1..] {
            result = result.boolean_with_engine(m, op, engine);
        }
        result
    }

    pub fn union_with_engine(&self, other: &Self, engine: crate::types::BooleanEngine) -> Self {
        self.boolean_with_engine(other, OpType::Add, engine)
    }

    pub fn difference_with_engine(&self, other: &Self, engine: crate::types::BooleanEngine) -> Self {
        self.boolean_with_engine(other, OpType::Subtract, engine)
    }

    pub fn intersection_with_engine(&self, other: &Self, engine: crate::types::BooleanEngine) -> Self {
        self.boolean_with_engine(other, OpType::Intersect, engine)
    }

    /// [`Manifold::boolean`] with cooperative cancellation.
    ///
    /// Pass `None` for the uncancellable behaviour of [`Manifold::boolean`] —
    /// that path is unchanged and touches no atomics. With `Some(token)`, a
    /// cancel requested from any thread (before or during the call) makes this
    /// return an empty manifold whose [`Manifold::status`] is
    /// [`Error::Cancelled`], mirroring the C++ `ExecutionContext` contract.
    pub fn boolean_with_token(
        &self,
        other: &Self,
        op: OpType,
        token: Option<&crate::cancel::CancelToken>,
    ) -> Self {
        Self::from_impl(boolean3::boolean_with_token(&self.imp, &other.imp, op, token))
    }

    pub fn union(&self, other: &Self) -> Self {
        self.boolean(other, OpType::Add)
    }

    pub fn difference(&self, other: &Self) -> Self {
        self.boolean(other, OpType::Subtract)
    }

    pub fn intersection(&self, other: &Self) -> Self {
        self.boolean(other, OpType::Intersect)
    }

    pub fn calculate_curvature(&self, gaussian_idx: i32, mean_idx: i32) -> Self {
        if let Some(e) = self.require_paired() { return e; }
        if self.is_empty() { return self.clone(); }
        let mut out = self.imp.clone();
        out.calculate_curvature(gaussian_idx, mean_idx);
        Self::from_impl(out)
    }

    /// Set per-vertex properties via a callback function.
    /// `num_prop` is the new number of properties per vertex (>= 0).
    /// `prop_func` receives `(new_prop_slice, position, old_prop_slice)` for each vertex.
    /// The callback writes into `new_prop_slice` (length `num_prop`).
    pub fn set_properties<F>(&self, num_prop: usize, prop_func: F) -> Self
    where
        F: Fn(&mut [f64], Vec3, &[f64]),
    {
        if let Some(e) = self.require_paired() { return e; }
        if self.is_empty() { return self.clone(); }
        let mut out = self.imp.clone();
        let old_num_prop = out.num_prop;
        let old_properties = out.properties.clone();

        if num_prop == 0 {
            out.properties.clear();
        } else {
            let num_prop_vert = out.num_prop_vert();
            out.properties = vec![0.0; num_prop * num_prop_vert];
            let num_tri = out.num_tri();
            for tri in 0..num_tri {
                for i in 0..3 {
                    let edge = out.halfedge[3 * tri + i];
                    let vert = edge.start_vert as usize;
                    let prop_vert = edge.prop_vert as usize;
                    let pos = out.vert_pos[vert];
                    let old_slice = if old_num_prop > 0 && prop_vert * old_num_prop < old_properties.len() {
                        &old_properties[old_num_prop * prop_vert..old_num_prop * prop_vert + old_num_prop]
                    } else {
                        &[]
                    };
                    prop_func(
                        &mut out.properties[num_prop * prop_vert..num_prop * prop_vert + num_prop],
                        pos,
                        old_slice,
                    );
                }
            }
        }

        out.num_prop = num_prop;
        Self::from_impl(out)
    }


    pub fn compose(parts: &[Self]) -> Self {
        let impls: Vec<_> = parts.iter().map(|m| m.imp.clone()).collect();
        Self::from_impl(boolean3::compose_meshes(&impls))
    }

    pub fn decompose(&self) -> Vec<Self> {
        use crate::disjoint_sets::DisjointSets;

        if let Some(e) = self.require_paired() {
            return vec![e];
        }
        let num_vert = self.imp.num_vert();
        if num_vert == 0 {
            // Propagate error status: errored manifolds decompose to [self]
            if self.imp.status != Error::NoError {
                return vec![self.clone()];
            }
            return vec![];
        }

        let uf = DisjointSets::new(num_vert as u32);
        for he in &self.imp.halfedge {
            if he.is_forward() {
                uf.unite(he.start_vert as u32, he.end_vert as u32);
            }
        }

        let mut component_indices = vec![0i32; num_vert];
        let num_components = uf.connected_components(&mut component_indices);

        if num_components <= 1 {
            return vec![self.clone()];
        }

        let num_tri = self.imp.num_tri();
        let mut meshes = Vec::new();

        for comp in 0..num_components {
            let mut imp = ManifoldImpl::new();
            imp.tolerance = self.imp.tolerance;

            // Collect vertices belonging to this component
            let vert_new2old: Vec<i32> = (0..num_vert as i32)
                .filter(|&v| component_indices[v as usize] == comp)
                .collect();
            let n_vert = vert_new2old.len();
            if n_vert == 0 { continue; }

            imp.vert_pos = vert_new2old.iter().map(|&v| self.imp.vert_pos[v as usize]).collect();
            if !self.imp.vert_normal.is_empty() {
                imp.vert_normal = vert_new2old.iter()
                    .map(|&v| self.imp.vert_normal[v as usize]).collect();
            }

            // Collect faces belonging to this component
            let face_new2old: Vec<usize> = (0..num_tri)
                .filter(|&f| {
                    let sv = self.imp.halfedge[3 * f].start_vert;
                    sv >= 0 && component_indices[sv as usize] == comp
                })
                .collect();

            if face_new2old.is_empty() { continue; }

            // Copy full data from original, then gather_faces will filter
            imp.halfedge = self.imp.halfedge.clone();
            imp.face_normal = self.imp.face_normal.clone();
            imp.halfedge_tangent = self.imp.halfedge_tangent.clone();
            imp.num_prop = self.imp.num_prop;
            imp.properties = self.imp.properties.clone();
            imp.mesh_relation = self.imp.mesh_relation.clone();

            crate::sort::gather_faces(&mut imp, &face_new2old);
            crate::sort::reindex_verts(&mut imp, &vert_new2old, self.imp.num_vert());
            imp.calculate_bbox();
            imp.sort_geometry();

            meshes.push(Self::from_impl(imp));
        }

        meshes
    }

    /// Compute the minimum gap between two manifolds within search_length.
    /// Returns search_length if no closer points found within that range.
    pub fn min_gap(&self, other: &Self, search_length: f64) -> f64 {
        self.imp.min_gap(&other.imp, search_length)
    }

    /// Cast a ray segment from `origin` to `endpoint`, returning all triangle
    /// intersections sorted by parametric distance along the segment.
    /// Mirrors C++ `Manifold::RayCast(vec3, vec3)`.
    pub fn ray_cast(&self, origin: Vec3, endpoint: Vec3) -> Vec<RayHit> {
        crate::boolean3::ray_cast(&self.imp, origin, endpoint)
    }
}

// Operator overloads: + for union, - for difference, ^ for intersection
// Matches C++ operator+(Manifold), operator-(Manifold), operator^(Manifold)

impl std::ops::Add for Manifold {
    type Output = Self;
    fn add(self, rhs: Self) -> Self { self.union(&rhs) }
}

impl std::ops::Add<&Manifold> for Manifold {
    type Output = Self;
    fn add(self, rhs: &Self) -> Self { self.union(rhs) }
}

impl std::ops::Add<&Manifold> for &Manifold {
    type Output = Manifold;
    fn add(self, rhs: &Manifold) -> Manifold { self.union(rhs) }
}

impl std::ops::AddAssign for Manifold {
    fn add_assign(&mut self, rhs: Self) { *self = self.union(&rhs); }
}

impl std::ops::AddAssign<&Manifold> for Manifold {
    fn add_assign(&mut self, rhs: &Self) { *self = self.union(rhs); }
}

impl std::ops::Sub for Manifold {
    type Output = Self;
    fn sub(self, rhs: Self) -> Self { self.difference(&rhs) }
}

impl std::ops::Sub<&Manifold> for Manifold {
    type Output = Self;
    fn sub(self, rhs: &Self) -> Self { self.difference(rhs) }
}

impl std::ops::Sub<&Manifold> for &Manifold {
    type Output = Manifold;
    fn sub(self, rhs: &Manifold) -> Manifold { self.difference(rhs) }
}

impl std::ops::SubAssign for Manifold {
    fn sub_assign(&mut self, rhs: Self) { *self = self.difference(&rhs); }
}

impl std::ops::SubAssign<&Manifold> for Manifold {
    fn sub_assign(&mut self, rhs: &Self) { *self = self.difference(rhs); }
}

impl std::ops::BitXor for Manifold {
    type Output = Self;
    fn bitxor(self, rhs: Self) -> Self { self.intersection(&rhs) }
}

impl std::ops::BitXor<&Manifold> for Manifold {
    type Output = Self;
    fn bitxor(self, rhs: &Self) -> Self { self.intersection(rhs) }
}

impl std::ops::BitXor<&Manifold> for &Manifold {
    type Output = Manifold;
    fn bitxor(self, rhs: &Manifold) -> Manifold { self.intersection(rhs) }
}

impl std::ops::BitXorAssign for Manifold {
    fn bitxor_assign(&mut self, rhs: Self) { *self = self.intersection(&rhs); }
}

impl std::ops::BitXorAssign<&Manifold> for Manifold {
    fn bitxor_assign(&mut self, rhs: &Self) { *self = self.intersection(rhs); }
}

#[path = "manifold_meshgl.rs"]
mod meshgl;

#[path = "manifold_shape.rs"]
mod shape;

#[path = "manifold_smooth.rs"]
mod smooth;

#[cfg(test)]
#[path = "manifold_tests/mod.rs"]
mod tests;
