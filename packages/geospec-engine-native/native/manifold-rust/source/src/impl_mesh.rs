// Phase 4: Mesh Data Structure — ported from src/impl.h, src/impl.cpp, src/properties.cpp
//
// This module implements the core ManifoldImpl struct: halfedge mesh representation,
// bounding box, epsilon, manifold checks, and shape constructors.
//
// Phases 5-9 will fill in SortGeometry, CleanupTopology, SetNormalsAndCoplanar, etc.

use std::sync::atomic::{AtomicU32, Ordering};
use crate::linalg::{Vec3, Vec4, Mat3x4, IVec3, normalize};
use crate::types::{
    Box as BBox, Error, Halfedge, MeshRelationD, Relation, TriRef, K_PRECISION,
};

// ---------------------------------------------------------------------------
// Global mesh ID counter (mirrors Manifold::Impl::meshIDCounter_)
// ---------------------------------------------------------------------------

static MESH_ID_COUNTER: AtomicU32 = AtomicU32::new(1);

pub fn reserve_ids(n: u32) -> u32 {
    MESH_ID_COUNTER.fetch_add(n, Ordering::Relaxed)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

pub const K_REMOVED_HALFEDGE: i32 = -2;

/// Next halfedge within the same triangle: 0→1→2→0.
#[inline]
pub fn next_halfedge(current: i32) -> i32 {
    let n = current + 1;
    if n % 3 == 0 { n - 3 } else { n }
}

#[inline]
pub fn next3(i: usize) -> usize {
    if i == 2 { 0 } else { i + 1 }
}

/// Safe normalize: returns zero vector if input is zero or non-finite.
fn safe_normalize(v: Vec3) -> Vec3 {
    let n = normalize(v);
    if n.x.is_finite() { n } else { Vec3::new(0.0, 0.0, 0.0) }
}

fn max_epsilon(min_epsilon: f64, bbox: &BBox) -> f64 {
    let epsilon = min_epsilon.max(K_PRECISION * bbox.scale());
    if epsilon.is_finite() { epsilon } else { -1.0 }
}

// ---------------------------------------------------------------------------
// ManifoldImpl — the core mesh representation
// ---------------------------------------------------------------------------

/// Internal halfedge mesh representation, mirroring `Manifold::Impl` in C++.
#[derive(Clone)]
pub struct ManifoldImpl {
    pub bbox: BBox,
    pub epsilon: f64,
    pub tolerance: f64,
    pub num_prop: usize,
    pub status: Error,
    pub vert_pos: Vec<Vec3>,
    pub halfedge: Vec<Halfedge>,
    pub properties: Vec<f64>,
    pub vert_normal: Vec<Vec3>,
    pub face_normal: Vec<Vec3>,
    pub halfedge_tangent: Vec<Vec4>,
    pub mesh_relation: MeshRelationD,
    /// Cached face BVH, built by sort_geometry and updated (not rebuilt) on
    /// transform — mirrors C++ Impl::collider_. Query sites (boolean kernels,
    /// ray cast, face merging, self-intersection) use this instead of
    /// rebuilding the tree per query.
    pub collider: crate::collider::Collider,
    /// True when this impl carries geometrically closed but topologically
    /// non-manifold "triangle soup" imported via `from_mesh_gl_robust`:
    /// halfedge pairing is incomplete (`paired_halfedge == -1` permitted).
    /// Only the robust boolean engine, transforms, bbox, and MeshGL export
    /// accept soup impls; pairing-dependent operations return an empty
    /// result with `Error::NotManifold`. Always false on the strict import
    /// path, so existing behavior is unchanged.
    pub is_soup: bool,
    /// Lazily-resolved verdict of `robust::soup::has_self_intersections` —
    /// whether this impl's own triangles genuinely intersect rather than
    /// merely sharing edges/vertices. Computed at most once per impl (the
    /// scan is a full BVH self-query) and consulted by `Auto` boolean
    /// dispatch, which must route geometrically self-intersecting operands
    /// to the robust engine even when their connectivity is manifold.
    ///
    /// `OnceLock`-backed so it can be filled through a shared `&ManifoldImpl`
    /// from rayon workers under the `parallel` feature. Crate-private
    /// deliberately: `Clone` copies the settled value, so **any** code that
    /// clones an impl and then edits its geometry in place must call
    /// [`ManifoldImpl::invalidate_self_intersects`]. Rebuilds that go through
    /// `create_halfedges` or `make_empty` are covered automatically.
    pub(crate) self_intersects: crate::robust::soup::SelfIntersectCache,
}

impl Default for ManifoldImpl {
    fn default() -> Self {
        ManifoldImpl {
            bbox: BBox::new(),
            epsilon: -1.0,
            tolerance: -1.0,
            num_prop: 0,
            status: Error::NoError,
            vert_pos: Vec::new(),
            halfedge: Vec::new(),
            properties: Vec::new(),
            vert_normal: Vec::new(),
            face_normal: Vec::new(),
            halfedge_tangent: Vec::new(),
            mesh_relation: MeshRelationD::new(),
            collider: crate::collider::Collider::default(),
            is_soup: false,
            self_intersects: Default::default(),
        }
    }
}

impl ManifoldImpl {
    pub fn new() -> Self {
        Self::default()
    }

    // -----------------------------------------------------------------------
    // Basic accessors
    // -----------------------------------------------------------------------

    pub fn num_vert(&self) -> usize {
        self.vert_pos.len()
    }

    pub fn num_halfedge(&self) -> usize {
        self.halfedge.len()
    }

    pub fn num_edge(&self) -> usize {
        self.halfedge.len() / 2
    }

    pub fn num_tri(&self) -> usize {
        self.halfedge.len() / 3
    }

    pub fn num_prop_vert(&self) -> usize {
        if self.num_prop == 0 {
            self.num_vert()
        } else {
            self.properties.len() / self.num_prop
        }
    }

    pub fn is_empty(&self) -> bool {
        self.num_tri() == 0
    }

    // -----------------------------------------------------------------------
    // MakeEmpty
    // -----------------------------------------------------------------------

    pub fn make_empty(&mut self, status: Error) {
        self.bbox = BBox::new();
        self.vert_pos.clear();
        self.halfedge.clear();
        self.vert_normal.clear();
        self.face_normal.clear();
        self.halfedge_tangent.clear();
        self.mesh_relation = MeshRelationD::new();
        self.collider = crate::collider::Collider::default();
        self.status = status;
        self.is_soup = false;
        // Geometry is gone; any cached self-intersection verdict is stale.
        self.invalidate_self_intersects();
    }

    /// Drop any cached self-intersection verdict. Must be called by every
    /// operation that edits `vert_pos` or `halfedge` in place on an impl it
    /// cloned (the cache is copied by `Clone`); rebuilds through
    /// `create_halfedges` and `make_empty` do it themselves.
    pub fn invalidate_self_intersects(&mut self) {
        self.self_intersects = Default::default();
    }

    // -----------------------------------------------------------------------
    // ForVert — iterate halfedges around a vertex
    // -----------------------------------------------------------------------

    /// Apply `func` to each halfedge index around the vertex starting from `halfedge_idx`.
    pub fn for_vert<F: FnMut(usize)>(&self, halfedge_idx: usize, mut func: F) {
        let mut current = halfedge_idx;
        loop {
            current = next_halfedge(self.halfedge[current].paired_halfedge) as usize;
            func(current);
            if current == halfedge_idx {
                break;
            }
        }
    }

    // -----------------------------------------------------------------------
    // CalculateBBox
    // -----------------------------------------------------------------------

    pub fn calculate_bbox(&mut self) {
        let mut bbox = BBox::new();
        for v in &self.vert_pos {
            if !v.x.is_nan() {
                bbox.union_point(*v);
            }
        }
        self.bbox = bbox;
        if !self.bbox.is_finite() {
            self.make_empty(Error::NoError);
        }
    }

    // -----------------------------------------------------------------------
    // SetEpsilon
    // -----------------------------------------------------------------------

    pub fn set_epsilon(&mut self, min_epsilon: f64, use_single: bool) {
        self.epsilon = max_epsilon(min_epsilon, &self.bbox);
        let mut min_tol = self.epsilon;
        if use_single {
            let float_eps = (f32::EPSILON as f64) * self.bbox.scale();
            min_tol = min_tol.max(float_eps);
        }
        self.tolerance = self.tolerance.max(min_tol);
    }

    // -----------------------------------------------------------------------
    // IsFinite
    // -----------------------------------------------------------------------

    pub fn is_finite(&self) -> bool {
        self.vert_pos.iter().all(|v| v.x.is_finite() && v.y.is_finite() && v.z.is_finite())
    }

    // -----------------------------------------------------------------------
    // IsManifold / Is2Manifold
    // -----------------------------------------------------------------------

    /// Check that the halfedge data structure is consistent (oriented even manifold).
    pub fn is_manifold(&self) -> bool {
        if self.halfedge.is_empty() {
            return true;
        }
        if self.halfedge.len() % 3 != 0 {
            return false;
        }
        for (edge, h) in self.halfedge.iter().enumerate() {
            // Valid removed halfedge
            if h.start_vert == -1 && h.end_vert == -1 && h.paired_halfedge == -1 {
                continue;
            }
            // Neighbors in same triangle must not be removed
            let n1 = next_halfedge(edge as i32) as usize;
            let n2 = next_halfedge(n1 as i32) as usize;
            if self.halfedge[n1].start_vert == -1 || self.halfedge[n2].start_vert == -1 {
                return false;
            }
            if h.paired_halfedge == -1 {
                return false;
            }
            let paired_idx = h.paired_halfedge as usize;
            let paired = &self.halfedge[paired_idx];
            if paired.paired_halfedge != edge as i32 {
                return false;
            }
            if h.start_vert == h.end_vert {
                return false;
            }
            if h.start_vert != paired.end_vert {
                return false;
            }
            if h.end_vert != paired.start_vert {
                return false;
            }
        }
        true
    }

    /// Check that the mesh is a 2-manifold (no duplicate edges).
    pub fn is_2_manifold(&self) -> bool {
        if self.halfedge.is_empty() {
            return true;
        }
        if !self.is_manifold() {
            return false;
        }
        // Sort halfedges and check for duplicates
        let mut sorted = self.halfedge.clone();
        sorted.sort_unstable();
        for i in 0..sorted.len().saturating_sub(1) {
            let h = &sorted[i];
            let h1 = &sorted[i + 1];
            // Skip removed halfedges
            if h.start_vert == -1 && h.end_vert == -1 && h.paired_halfedge == -1 {
                continue;
            }
            if h.start_vert == h1.start_vert && h.end_vert == h1.end_vert {
                return false; // Duplicate edge
            }
        }
        true
    }

    // -----------------------------------------------------------------------
    // CreateHalfedges
    // -----------------------------------------------------------------------

    /// Build the halfedge data structure from triangle lists.
    ///
    /// - `tri_prop`: property vertex indices per triangle (also geometry if `tri_vert` is empty)
    /// - `tri_vert`: geometry vertex indices per triangle (may be empty)
    ///
    /// When `tri_vert` is empty, `tri_prop` is used for both geometry and properties.
    /// When `tri_vert` is present, `tri_prop[i][j]` = `propVert`, `tri_vert[i][j]` = `startVert`.
    pub fn create_halfedges(&mut self, tri_prop: &[IVec3], tri_vert: &[IVec3]) {
        // The triangle set is being (re)built, so any earlier verdict about
        // self-intersection no longer describes this geometry.
        self.invalidate_self_intersects();
        let num_tri = tri_prop.len();
        if num_tri == 0 {
            self.halfedge.clear();
            return;
        }
        let num_halfedge = 3 * num_tri;
        let num_edge = num_halfedge / 2;

        self.halfedge.clear();
        self.halfedge.resize(num_halfedge, Halfedge {
            start_vert: -1,
            end_vert: -1,
            paired_halfedge: -1,
            prop_vert: -1,
        });

        let use_prop = tri_vert.is_empty();

        // Build halfedges and compute edge sort key
        // key = [forward_bit:1][min_vert:31][max_vert:32]
        // forward: v0 < v1 → bit=1; backward: v0 > v1 → bit=0
        // After sorting: backward halfedges first, then forward, both by (min,max)
        let mut edge_keys = vec![0u64; num_halfedge];

        for tri in 0..num_tri {
            for i in 0usize..3 {
                let j = next3(i);
                let e = 3 * tri + i;
                let v0 = if use_prop { tri_prop[tri][i] } else { tri_vert[tri][i] };
                let v1 = if use_prop { tri_prop[tri][j] } else { tri_vert[tri][j] };
                self.halfedge[e] = Halfedge {
                    start_vert: v0,
                    end_vert: v1,
                    paired_halfedge: -1,
                    prop_vert: tri_prop[tri][i],
                };
                let fwd = if v0 < v1 { 1u64 } else { 0u64 };
                let min_v = v0.min(v1) as u64;
                let max_v = v0.max(v1) as u64;
                edge_keys[e] = (fwd << 63) | (min_v << 32) | max_v;
            }
        }

        // Sort halfedge indices by edge key. C++ CreateHalfedges uses a
        // STABLE sort here (impl.cpp), and the #1687 fix ensures its parallel
        // stable_sort matches std::stable_sort. When two halfedges share an
        // edge key (duplicate directed edges in degenerate/intermediate
        // meshes) the tie must break on original halfedge-index order, so we
        // use a stable sort to stay bit-identical to C++.
        let mut ids: Vec<usize> = (0..num_halfedge).collect();
        ids.sort_by_key(|&i| edge_keys[i]);

        // ids[0..num_edge] = backward halfedges (startVert > endVert), sorted by (min,max)
        // ids[num_edge..] = forward halfedges (startVert < endVert), sorted by (min,max)

        // Sequential pairing with opposed-triangle detection
        let segment_end = num_edge;
        let mut consecutive_start = 0usize;

        for i in 0..num_edge {
            let pair0 = ids[i];
            let h0_sv = self.halfedge[pair0].start_vert;
            let h0_ev = self.halfedge[pair0].end_vert;

            let mut k = consecutive_start + num_edge;
            'inner: loop {
                if k >= segment_end + num_edge {
                    break 'inner;
                }
                let pair1 = ids[k];
                let h1_sv = self.halfedge[pair1].start_vert;
                let h1_ev = self.halfedge[pair1].end_vert;

                if h0_sv != h1_ev || h0_ev != h1_sv {
                    break 'inner; // Different edge direction — no match
                }

                if self.halfedge[pair1].paired_halfedge != K_REMOVED_HALFEDGE {
                    // Check for opposed triangle: same undirected edge, same third vertex
                    let next0 = next_halfedge(pair0 as i32) as usize;
                    let next1 = next_halfedge(pair1 as i32) as usize;
                    if self.halfedge[next0].end_vert == self.halfedge[next1].end_vert {
                        // Opposed triangles: mark both for removal.
                        // Reorder ids so the remaining valid forward halfedge (at i+num_edge)
                        // moves to position k, and pair1 (the opposed one) goes to i+num_edge.
                        // This matches C++ which does: ids[k] = ids[i+numEdge]; ids[i+numEdge] = pair1;
                        self.halfedge[pair0].paired_halfedge = K_REMOVED_HALFEDGE;
                        self.halfedge[pair1].paired_halfedge = K_REMOVED_HALFEDGE;
                        if i + num_edge != k {
                            ids.swap(k, i + num_edge);
                        }
                        break 'inner;
                    }
                }

                k += 1;
            }

            // Update consecutive_start for next iteration
            if i + 1 < segment_end {
                let next_sv = self.halfedge[ids[i + 1]].start_vert;
                let next_ev = self.halfedge[ids[i + 1]].end_vert;
                if next_sv != h0_sv || next_ev != h0_ev {
                    consecutive_start = i + 1;
                }
            }
        }

        // Final pairing pass
        for i in 0..num_edge {
            let pair0 = ids[i];
            let pair1 = ids[i + num_edge];
            if self.halfedge[pair0].paired_halfedge != K_REMOVED_HALFEDGE {
                self.halfedge[pair0].paired_halfedge = pair1 as i32;
                self.halfedge[pair1].paired_halfedge = pair0 as i32;
            } else {
                // Invalidate both (opposed triangles removed)
                self.halfedge[pair0] = Halfedge { start_vert: -1, end_vert: -1, paired_halfedge: -1, prop_vert: 0 };
                self.halfedge[pair1] = Halfedge { start_vert: -1, end_vert: -1, paired_halfedge: -1, prop_vert: 0 };
            }
        }
    }

    // -----------------------------------------------------------------------
    // InitializeOriginal
    // -----------------------------------------------------------------------

    /// Set up the mesh relation for a newly created original mesh.
    pub fn initialize_original(&mut self) {
        // Per C++ #1718: preserve the AND-across-old-Relations hasNormals state
        // so AsOriginal keeps the recording when it builds a fresh Relation.
        // Primitives start with an empty map → all_have_normals() is false.
        let had_normals = self.all_have_normals();
        let mesh_id = reserve_ids(1) as i32;
        self.mesh_relation.original_id = mesh_id;
        let num_tri = self.num_tri();
        self.mesh_relation.tri_ref.resize(num_tri, TriRef::default());
        for (tri, tri_ref) in self.mesh_relation.tri_ref.iter_mut().enumerate() {
            tri_ref.mesh_id = mesh_id;
            tri_ref.original_id = mesh_id;
            tri_ref.face_id = -1;
            tri_ref.coplanar_id = tri as i32;
        }
        self.mesh_relation.mesh_id_transform.clear();
        self.mesh_relation.mesh_id_transform.insert(mesh_id, Relation {
            original_id: mesh_id,
            transform: Mat3x4::identity(),
            back_side: false,
            has_normals: had_normals,
        });
    }

    /// True only when every meshID carries normals at slot 0..2 — the condition
    /// under which `get_mesh_gl(-1)` can safely auto-substitute that slot. A
    /// mixed Boolean output (some meshIDs with normals, some without) returns
    /// false; the output MeshGL's per-run bit 1 still marks the with-normals
    /// runs individually. AND semantics across meshIDs. Per C++ #1718.
    pub fn all_have_normals(&self) -> bool {
        let map = &self.mesh_relation.mesh_id_transform;
        !map.is_empty() && map.values().all(|m| m.has_normals)
    }

    /// True iff the meshID owning `tri` has hasNormals set. False when the
    /// meshID isn't in mesh_id_transform (treat as no-normals). Per C++ #1718.
    pub fn tri_has_normals(&self, tri: usize) -> bool {
        let mesh_id = self.mesh_relation.tri_ref[tri].mesh_id;
        self.mesh_relation
            .mesh_id_transform
            .get(&mesh_id)
            .map(|m| m.has_normals)
            .unwrap_or(false)
    }

    /// Eager-transform slot 0..2 of `properties` for propVerts whose meshID
    /// carries hasNormals. Used by both `transform` and `compose` so world-frame
    /// normals stay in sync with vert_pos / face_normal across any sequence of
    /// transforms (including mixed-input Boolean/Compose outputs where some
    /// meshIDs carry normals and others don't). Per C++ #1718.
    ///
    /// `properties` is laid out as `properties[(offset + prop) * stride + i]`,
    /// so callers can target an in-place properties_ vector (offset=0) or a
    /// per-node slice of a combined array (offset=propVertIndices,
    /// stride=numPropOut). Re-normalizes as it transforms so non-orthogonal
    /// transforms (scale) and upstream barycentric interpolation don't leave
    /// non-unit values that compound downstream.
    pub fn eager_transform_prop_normals(
        halfedge: &[crate::types::Halfedge],
        mesh_relation: &crate::types::MeshRelationD,
        normal_transform: crate::linalg::Mat3,
        properties: &mut [f64],
        num_prop_vert: usize,
        stride: usize,
        offset: usize,
    ) {
        // OR semantics (any meshID has normals), unlike all_have_normals():
        // mixed inputs still need the per-meshID iteration below to rotate the
        // with-normals subset.
        if !mesh_relation.mesh_id_transform.values().any(|m| m.has_normals) {
            return;
        }
        let tri_has_normals = |tri: usize| -> bool {
            let mid = mesh_relation.tri_ref[tri].mesh_id;
            mesh_relation
                .mesh_id_transform
                .get(&mid)
                .map(|m| m.has_normals)
                .unwrap_or(false)
        };
        let mut visited = vec![false; num_prop_vert];
        for e in 0..halfedge.len() {
            if !tri_has_normals(e / 3) {
                continue;
            }
            let prop = halfedge[e].prop_vert;
            if prop < 0 {
                continue;
            }
            let prop = prop as usize;
            if visited[prop] {
                continue;
            }
            visited[prop] = true;
            let base = (offset + prop) * stride;
            let n = Vec3::new(properties[base], properties[base + 1], properties[base + 2]);
            let nt = safe_normalize(normal_transform * n);
            properties[base] = nt.x;
            properties[base + 1] = nt.y;
            properties[base + 2] = nt.z;
        }
    }

    // -----------------------------------------------------------------------
    // IncrementMeshIDs — port of C++ Manifold::Impl::IncrementMeshIDs()
    // -----------------------------------------------------------------------

    /// Allocates fresh unique mesh IDs and remaps all triRef.meshID values.
    /// This ensures boolean results don't collide with source mesh IDs.
    pub fn increment_mesh_ids(&mut self) {
        use std::collections::{BTreeMap, HashMap};

        // Build old -> new ID mapping. Iteration order determines which old
        // ID gets which fresh ID, so it must be sorted like C++ std::map.
        let old_transforms: BTreeMap<i32, Relation> =
            std::mem::take(&mut self.mesh_relation.mesh_id_transform);
        let num_mesh_ids = old_transforms.len() as u32;
        if num_mesh_ids == 0 { return; }
        let mut next_mesh_id = reserve_ids(num_mesh_ids) as i32;
        let mut old2new: HashMap<i32, i32> = HashMap::new();
        for (old_id, relation) in old_transforms {
            old2new.insert(old_id, next_mesh_id);
            self.mesh_relation.mesh_id_transform.insert(next_mesh_id, relation);
            next_mesh_id += 1;
        }

        // Update all triRef.meshID
        for tri_ref in &mut self.mesh_relation.tri_ref {
            if let Some(&new_id) = old2new.get(&tri_ref.mesh_id) {
                tri_ref.mesh_id = new_id;
            }
        }
    }

    // -----------------------------------------------------------------------
    // DedupePropVerts — port of C++ Manifold::Impl::DedupePropVerts()
    // -----------------------------------------------------------------------

    /// Deduplicates property vertices that share identical property values
    /// across paired halfedges within the same mesh.
    pub fn dedupe_prop_verts(&mut self) {
        let num_prop = self.num_prop;
        if num_prop == 0 { return; }

        let n_edges = self.halfedge.len();
        // Collect (prop0, prop1) pairs for edges where properties match
        let mut vert2vert: Vec<(i32, i32)> = vec![(-1, -1); n_edges];
        for edge_idx in 0..n_edges {
            let edge = self.halfedge[edge_idx];
            if edge.paired_halfedge < 0 { continue; }
            let edge_face = edge_idx / 3;
            let pair_face = edge.paired_halfedge as usize / 3;

            if self.mesh_relation.tri_ref[edge_face].mesh_id
                != self.mesh_relation.tri_ref[pair_face].mesh_id
            {
                continue;
            }

            let prop0 = self.halfedge[edge_idx].prop_vert;
            let prop1 = self.halfedge[next_halfedge(edge.paired_halfedge) as usize].prop_vert;
            if prop0 < 0 || prop1 < 0 { continue; }

            let mut prop_equal = true;
            for p in 0..num_prop {
                let idx0 = num_prop * prop0 as usize + p;
                let idx1 = num_prop * prop1 as usize + p;
                if idx0 >= self.properties.len() || idx1 >= self.properties.len() {
                    prop_equal = false;
                    break;
                }
                if self.properties[idx0] != self.properties[idx1] {
                    prop_equal = false;
                    break;
                }
            }
            if prop_equal {
                vert2vert[edge_idx] = (prop0, prop1);
            }
        }

        // Use union-find to merge equivalent property vertices
        let num_prop_vert = self.num_prop_vert();
        let ds = crate::disjoint_sets::DisjointSets::new(num_prop_vert as u32);
        for &(a, b) in &vert2vert {
            if a >= 0 && b >= 0 {
                ds.unite(a as u32, b as u32);
            }
        }
        let mut vert_labels = Vec::new();
        let num_labels = ds.connected_components(&mut vert_labels);

        // Build label -> canonical vert mapping
        let mut label2vert = vec![0i32; num_labels as usize];
        for v in 0..num_prop_vert {
            label2vert[vert_labels[v] as usize] = v as i32;
        }

        // Remap all prop_vert indices
        for edge in &mut self.halfedge {
            if edge.prop_vert >= 0 && (edge.prop_vert as usize) < num_prop_vert {
                edge.prop_vert = label2vert[vert_labels[edge.prop_vert as usize] as usize];
            }
        }
    }

    // -----------------------------------------------------------------------
    // RemoveUnreferencedVerts
    // -----------------------------------------------------------------------

    /// Mark unreferenced vertices as NaN (to be cleaned up by later passes).
    pub fn remove_unreferenced_verts(&mut self) {
        let num_vert = self.num_vert();
        let mut keep = vec![false; num_vert];
        for h in &self.halfedge {
            if h.start_vert >= 0 {
                keep[h.start_vert as usize] = true;
            }
        }
        for (i, k) in keep.iter().enumerate() {
            if !k {
                self.vert_pos[i] = Vec3::new(f64::NAN, f64::NAN, f64::NAN);
            }
        }
    }

    // -----------------------------------------------------------------------
    // SetNormalsAndCoplanar (stub — implemented in Phase 9)
    // -----------------------------------------------------------------------

    /// Compute face normals, assign coplanar IDs, and calculate vertex normals.
    pub fn set_normals_and_coplanar(&mut self) {
        crate::face_op::set_normals_and_coplanar(self);
    }

    // -----------------------------------------------------------------------
    // SortGeometry (stub — implemented in Phase 5)
    // -----------------------------------------------------------------------

    /// Reorder mesh geometry for cache efficiency using Morton codes.
    pub fn sort_geometry(&mut self) {
        crate::sort::sort_geometry(self);
    }

    // -----------------------------------------------------------------------
    // Shape constructors
    // -----------------------------------------------------------------------

    pub fn tetrahedron(transform: &Mat3x4) -> Self {
        let vert_pos_raw: Vec<[f64; 3]> = vec![
            [-1.0, -1.0,  1.0],
            [-1.0,  1.0, -1.0],
            [ 1.0, -1.0, -1.0],
            [ 1.0,  1.0,  1.0],
        ];
        let tri_verts: Vec<IVec3> = vec![
            IVec3::new(2, 0, 1),
            IVec3::new(0, 3, 1),
            IVec3::new(2, 3, 0),
            IVec3::new(3, 2, 1),
        ];
        Self::from_shape(vert_pos_raw, tri_verts, transform)
    }

    pub fn cube(transform: &Mat3x4) -> Self {
        let vert_pos_raw: Vec<[f64; 3]> = vec![
            [0.0, 0.0, 0.0],
            [0.0, 0.0, 1.0],
            [0.0, 1.0, 0.0],
            [0.0, 1.0, 1.0],
            [1.0, 0.0, 0.0],
            [1.0, 0.0, 1.0],
            [1.0, 1.0, 0.0],
            [1.0, 1.0, 1.0],
        ];
        let tri_verts: Vec<IVec3> = vec![
            IVec3::new(1, 0, 4), IVec3::new(2, 4, 0),
            IVec3::new(1, 3, 0), IVec3::new(3, 1, 5),
            IVec3::new(3, 2, 0), IVec3::new(3, 7, 2),
            IVec3::new(5, 4, 6), IVec3::new(5, 1, 4),
            IVec3::new(6, 4, 2), IVec3::new(7, 6, 2),
            IVec3::new(7, 3, 5), IVec3::new(7, 5, 6),
        ];
        Self::from_shape(vert_pos_raw, tri_verts, transform)
    }

    pub fn octahedron(transform: &Mat3x4) -> Self {
        let vert_pos_raw: Vec<[f64; 3]> = vec![
            [ 1.0,  0.0,  0.0],
            [-1.0,  0.0,  0.0],
            [ 0.0,  1.0,  0.0],
            [ 0.0, -1.0,  0.0],
            [ 0.0,  0.0,  1.0],
            [ 0.0,  0.0, -1.0],
        ];
        let tri_verts: Vec<IVec3> = vec![
            IVec3::new(0, 2, 4), IVec3::new(1, 5, 3),
            IVec3::new(2, 1, 4), IVec3::new(3, 5, 0),
            IVec3::new(1, 3, 4), IVec3::new(0, 5, 2),
            IVec3::new(3, 0, 4), IVec3::new(2, 5, 1),
        ];
        Self::from_shape(vert_pos_raw, tri_verts, transform)
    }

    fn from_shape(vert_pos_raw: Vec<[f64; 3]>, tri_verts: Vec<IVec3>, transform: &Mat3x4) -> Self {
        use crate::linalg::Vec4;
        let mut m = Self::new();
        m.vert_pos = vert_pos_raw
            .iter()
            .map(|v| {
                let p = Vec3::new(v[0], v[1], v[2]);
                // Apply transform: m * vec4(p, 1)
                *transform * Vec4::new(p.x, p.y, p.z, 1.0)
            })
            .collect();

        m.create_halfedges(&tri_verts, &[]);
        m.initialize_original();
        m.calculate_bbox();
        m.set_epsilon(-1.0, false);
        m.sort_geometry();
        m.set_normals_and_coplanar();
        m
    }

    // -----------------------------------------------------------------------
    // Transform
    // -----------------------------------------------------------------------

    /// Apply affine transform, returning a new ManifoldImpl.
    pub fn transform(&self, t: &Mat3x4) -> Self {
        use crate::linalg::{Vec4, Mat3};
        let identity = Mat3x4::identity();
        if t == &identity {
            // Clone self — this is a simplified version (full version uses Collider)
            return self.shallow_clone();
        }

        let mut result = Self::new();
        if self.status != Error::NoError {
            result.status = self.status;
            return result;
        }

        result.mesh_relation = self.mesh_relation.clone();
        // Scale epsilon by spectral norm of transform, matching C++:
        // result.epsilon_ *= SpectralNorm(mat3(transform_));
        let m3_for_norm = Mat3::from_cols(
            Vec3::new(t.x.x, t.x.y, t.x.z),
            Vec3::new(t.y.x, t.y.y, t.y.z),
            Vec3::new(t.z.x, t.z.y, t.z.z),
        );
        result.epsilon = self.epsilon * crate::svd::spectral_norm(m3_for_norm);
        result.tolerance = self.tolerance;
        result.num_prop = self.num_prop;
        result.properties = self.properties.clone();
        result.bbox = self.bbox;
        result.halfedge = self.halfedge.clone();
        result.mesh_relation.original_id = -1;
        // Soup impls stay soups across transforms; every step below already
        // guards paired_halfedge < 0.
        result.is_soup = self.is_soup;
        // The self-intersection cache is deliberately *not* carried across:
        // transformed positions are rounded to f64, so an extreme scale can
        // collapse distinct vertices onto each other and create coincident
        // surface that the source mesh did not have. Re-running the detector
        // costs microseconds; propagating a stale `false` costs correctness.

        // Update mesh transforms
        for (_, rel) in result.mesh_relation.mesh_id_transform.iter_mut() {
            // rel.transform = t * Mat4(rel.transform) — combine transforms
            rel.transform = mat3x4_mul_mat3x4(t, &rel.transform);
        }

        // Transform vertex positions
        result.vert_pos = self.vert_pos.iter().map(|&v| {
            *t * Vec4::new(v.x, v.y, v.z, 1.0)
        }).collect();

        // Transform normals (using inverse-transpose of 3x3 part)
        let m3 = Mat3::from_cols(
            Vec3::new(t.x.x, t.x.y, t.x.z),
            Vec3::new(t.y.x, t.y.y, t.y.z),
            Vec3::new(t.z.x, t.z.y, t.z.z),
        );
        let normal_t = m3.inverse().transpose();

        result.face_normal = self.face_normal.iter().map(|&n| {
            safe_normalize(normal_t * n)
        }).collect();
        result.vert_normal = self.vert_normal.iter().map(|&n| {
            safe_normalize(normal_t * n)
        }).collect();

        // Per #1718: the properties clone above doesn't go through the vertPos /
        // faceNormal transform, so eager-transform slot 0..2 per-meshID to keep
        // recorded world-frame normals in sync. tri_ref / hasNormals flags are
        // identical in self and result; iterate by prop vert (winding flip
        // below only reorders halfedges, not prop assignments).
        if self.num_prop >= 3 {
            Self::eager_transform_prop_normals(
                &self.halfedge,
                &self.mesh_relation,
                normal_t,
                &mut result.properties,
                self.num_prop_vert(),
                self.num_prop,
                0,
            );
        }

        let invert = m3.determinant() < 0.0;

        // Transform tangents — C++ TransformTangents
        // Must happen BEFORE FlipTris (matches C++ order)
        if !self.halfedge_tangent.is_empty() {
            result.halfedge_tangent = vec![Vec4::new(0.0, 0.0, 0.0, 0.0); self.halfedge_tangent.len()];
            for edge_out in 0..self.halfedge_tangent.len() {
                let edge_in = if invert {
                    let tri = edge_out / 3;
                    let vert = 2 - (edge_out - 3 * tri);
                    let flipped = 3 * tri + vert;
                    self.halfedge[flipped].paired_halfedge as usize
                } else {
                    edge_out
                };
                let old_t = self.halfedge_tangent[edge_in];
                let xyz = m3 * Vec3::new(old_t.x, old_t.y, old_t.z);
                result.halfedge_tangent[edge_out] = Vec4::new(xyz.x, xyz.y, xyz.z, old_t.w);
            }
        }

        if invert {
            // Flip triangle winding — matches C++ FlipTris
            for tri in 0..result.num_tri() {
                // Swap first and third halfedge within tri
                result.halfedge.swap(3 * tri, 3 * tri + 2);
                // For each halfedge: swap startVert/endVert and remap pairedHalfedge
                for i in 0..3 {
                    let idx = 3 * tri + i;
                    let h = &mut result.halfedge[idx];
                    std::mem::swap(&mut h.start_vert, &mut h.end_vert);
                    // FlipHalfedge: within the paired tri, mirror the edge index
                    let paired = h.paired_halfedge;
                    if paired >= 0 {
                        let p = paired as usize;
                        let p_tri = p / 3;
                        let p_vert = 2 - (p - 3 * p_tri);
                        h.paired_halfedge = (3 * p_tri + p_vert) as i32;
                    }
                }
            }
        }

        result.calculate_bbox();
        result.set_epsilon(result.epsilon, false);

        // Keep the cached collider valid without a full rebuild, mirroring C++
        // Impl::Transform: an axis-aligned transform maps the existing tree's
        // boxes directly; otherwise recompute leaf boxes on the transformed
        // mesh and refit the same tree topology.
        // Soup impls never went through sort_geometry, which is where the
        // collider is built, so they carry a zero-leaf tree. There is no
        // topology to refit in that case — cloning the empty tree and
        // refitting it against real face boxes indexes out of bounds, and
        // update_boxes' debug_assert is compiled out in release. Leave the
        // default collider, exactly as the untransformed soup carried.
        if !result.is_empty() && self.collider.num_leaves() == self.num_tri() {
            if crate::collider::Collider::is_axis_aligned(t) {
                result.collider = self.collider.clone();
                result.collider.transform(t);
            } else {
                result.collider = self.collider.clone();
                let (face_box, _face_morton) = crate::sort::get_face_box_morton(&result);
                result.collider.update_boxes(face_box);
            }
        }
        result
    }

    /// Field-by-field copy used by the identity-transform fast path; the
    /// collider is copied as-is (C++ copies collider_ with the Impl).
    fn shallow_clone(&self) -> Self {
        ManifoldImpl {
            bbox: self.bbox,
            epsilon: self.epsilon,
            tolerance: self.tolerance,
            num_prop: self.num_prop,
            status: self.status,
            vert_pos: self.vert_pos.clone(),
            halfedge: self.halfedge.clone(),
            properties: self.properties.clone(),
            vert_normal: self.vert_normal.clone(),
            face_normal: self.face_normal.clone(),
            halfedge_tangent: self.halfedge_tangent.clone(),
            mesh_relation: self.mesh_relation.clone(),
            collider: self.collider.clone(),
            is_soup: self.is_soup,
            self_intersects: self.self_intersects.clone(),
        }
    }
}

// ---------------------------------------------------------------------------
// Transform helpers
// ---------------------------------------------------------------------------

/// Multiply two Mat3x4 transforms as affine matrices (t1 * t2 = (t1 * to_mat4(t2)).
/// Result is t1 applied after t2.
fn mat3x4_mul_mat3x4(t1: &Mat3x4, t2: &Mat3x4) -> Mat3x4 {
    use crate::linalg::Vec4;
    // Column vectors of t2 (as Vec4 with w=0 for rotation cols, w=1 for translation)
    let c0 = *t1 * Vec4::new(t2.x.x, t2.x.y, t2.x.z, 0.0);
    let c1 = *t1 * Vec4::new(t2.y.x, t2.y.y, t2.y.z, 0.0);
    let c2 = *t1 * Vec4::new(t2.z.x, t2.z.y, t2.z.z, 0.0);
    let c3 = *t1 * Vec4::new(t2.w.x, t2.w.y, t2.w.z, 1.0);
    Mat3x4 { x: c0, y: c1, z: c2, w: c3 }
}

// ---------------------------------------------------------------------------
// Mat3 for normal transform (we need inverse + transpose from linalg)
// ---------------------------------------------------------------------------

// These are already in linalg.rs but we need to use them here.
// The Mat3 methods: inverse(), transpose(), determinant()

// ---------------------------------------------------------------------------
#[cfg(test)]
#[path = "impl_mesh_tests.rs"]
mod tests;
