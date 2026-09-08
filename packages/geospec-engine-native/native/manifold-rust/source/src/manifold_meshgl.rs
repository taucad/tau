// MeshGL conversion methods for Manifold
// Extracted from manifold.rs for file size management
//
// The import/export bodies are generic over the mesh precision and index
// types, mirroring the C++ `Impl::Impl(const MeshGLP<Precision, I>&)` and
// `GetMeshGLImpl<Precision, I>` templates: the f32/u32 instantiation narrows
// exactly where the C++ float instantiation does, and the f64/u64
// instantiation is lossless into and out of the f64 kernel.

use crate::impl_mesh::ManifoldImpl;
use crate::linalg::{IVec3, Mat3x4, Vec3};
use crate::types::{MeshGL, MeshGL64, MeshGLP, MeshIndex, MeshPrecision};
use super::Manifold;

/// How the import treats non-manifold connectivity.
#[derive(Clone, Copy, PartialEq, Eq)]
enum ImportMode {
    /// Reject with `Error::NotManifold` (existing behavior, byte-identical).
    Strict,
    /// Keep geometrically closed + orientable geometry as a triangle soup
    /// (`ManifoldImpl::is_soup`) for the robust boolean engine; reject only
    /// with `Error::NotClosed` when even that fails.
    AllowSoup,
}

impl Manifold {
    pub fn from_mesh_gl(mesh: &MeshGL) -> Self {
        Self::from_mesh_impl(mesh, ImportMode::Strict, false)
    }

    /// Import a double-precision mesh directly into the f64 kernel. Unlike
    /// [`Self::from_mesh_gl`], no narrowing occurs anywhere on this path:
    /// coordinates, run transforms, tangents, and tolerance are consumed at
    /// full f64 precision, matching C++ `Manifold(const MeshGL64&)`.
    /// Indices still truncate to 32 bits exactly as the C++ import's
    /// `uint32_t` casts do — the kernel indexes vertices with 32 bits.
    pub fn from_mesh_gl64(mesh: &MeshGL64) -> Self {
        Self::from_mesh_impl(mesh, ImportMode::Strict, false)
    }

    /// Import that accepts non-manifold geometry for the robust boolean
    /// engine. Manifold input behaves exactly like [`Self::from_mesh_gl`];
    /// non-manifold input is kept as a triangle soup (`status()` stays
    /// `NoError`) as long as it is geometrically closed and orientable,
    /// otherwise the result is empty with `Error::NotClosed`. Soup-backed
    /// manifolds support booleans via `BooleanEngine::Robust`/`Auto`,
    /// transforms, and mesh export; pairing-dependent operations return
    /// empty results with `Error::NotManifold`.
    pub fn from_mesh_gl_robust(mesh: &MeshGL) -> Self {
        Self::from_mesh_impl(mesh, ImportMode::AllowSoup, false)
    }

    /// Double-precision variant of [`Self::from_mesh_gl_robust`].
    pub fn from_mesh_gl64_robust(mesh: &MeshGL64) -> Self {
        Self::from_mesh_impl(mesh, ImportMode::AllowSoup, false)
    }

    /// [`Self::from_mesh_gl64_robust`] for meshes the robust boolean engine
    /// assembled itself (`robust::assemble`), which skip
    /// `edge_op::swap_degenerates`. See docs/CPP_DIVERGENCES.md entry 1: a
    /// boolean result legitimately contains coplanar antiparallel
    /// adjacencies, whose flood-filled face normals make the swap
    /// misclassify large valid triangles and physically move the surface.
    /// Every other import path — including user meshes coming in through
    /// [`Self::from_mesh_gl_robust`] — is unaffected.
    pub(crate) fn from_mesh_gl64_robust_assembled(mesh: &MeshGL64) -> Self {
        Self::from_mesh_impl(mesh, ImportMode::AllowSoup, true)
    }

    fn from_mesh_impl<P: MeshPrecision, I: MeshIndex>(
        mesh: &MeshGLP<P, I>,
        mode: ImportMode,
        skip_swap: bool,
    ) -> Self {
    let num_vert = mesh.num_vert() as u32;
    let num_tri = mesh.num_tri();

    // Validation checks matching C++ Impl::Impl(const MeshGLP&)
    if num_vert == 0 && num_tri == 0 {
        return Self::make_empty(crate::types::Error::NoError);
    }
    if num_vert < 4 || num_tri < 4 {
        return Self::make_empty(match mode {
            ImportMode::Strict => crate::types::Error::NotManifold,
            ImportMode::AllowSoup => crate::types::Error::NotClosed,
        });
    }
    if mesh.num_prop.to_u64() < 3 {
        return Self::make_empty(crate::types::Error::MissingPositionProperties);
    }
    if mesh.merge_from_vert.len() != mesh.merge_to_vert.len() {
        return Self::make_empty(crate::types::Error::MergeVectorsDifferentLengths);
    }
    if !mesh.run_transform.is_empty()
        && 12 * mesh.run_original_id.len() != mesh.run_transform.len()
    {
        return Self::make_empty(crate::types::Error::TransformWrongLength);
    }
    if !mesh.run_original_id.is_empty()
        && !mesh.run_index.is_empty()
        && mesh.run_original_id.len() + 1 != mesh.run_index.len()
        && mesh.run_original_id.len() != mesh.run_index.len()
    {
        return Self::make_empty(crate::types::Error::RunIndexWrongLength);
    }
    if !mesh.face_id.is_empty() && mesh.face_id.len() != num_tri {
        return Self::make_empty(crate::types::Error::FaceIdWrongLength);
    }
    if !mesh.vert_properties.iter().all(|x| x.to_f64().is_finite()) {
        return Self::make_empty(crate::types::Error::NonFiniteVertex);
    }
    if !mesh.run_transform.iter().all(|x| x.to_f64().is_finite()) {
        return Self::make_empty(crate::types::Error::InvalidConstruction);
    }
    if !mesh.halfedge_tangent.iter().all(|x| x.to_f64().is_finite()) {
        return Self::make_empty(crate::types::Error::InvalidConstruction);
    }

    // Check merge indices are in bounds. Like the C++ import, u64 indices are
    // first truncated to u32 (the kernel's index width).
    for i in 0..mesh.merge_from_vert.len() {
        if mesh.merge_from_vert[i].to_u64() as u32 >= num_vert
            || mesh.merge_to_vert[i].to_u64() as u32 >= num_vert
        {
            return Self::make_empty(crate::types::Error::MergeIndexOutOfBounds);
        }
    }

    // Check tri_verts are in bounds
    for &v in &mesh.tri_verts {
        if v.to_u64() as u32 >= num_vert {
            return Self::make_empty(crate::types::Error::VertexOutOfBounds);
        }
    }

    let mut imp = ManifoldImpl::new();
    let num_prop = mesh.num_prop.to_u64() as usize;
    imp.num_prop = num_prop.saturating_sub(3);

    imp.vert_pos = (0..mesh.num_vert())
        .map(|i| {
            let p = mesh.get_vert_pos(i);
            Vec3::new(p[0].to_f64(), p[1].to_f64(), p[2].to_f64())
        })
        .collect();

    if imp.num_prop > 0 {
        imp.properties = (0..mesh.num_vert())
            .flat_map(|i| {
                let offset = i * num_prop;
                mesh.vert_properties[offset + 3..offset + num_prop]
                    .iter()
                    .map(|&v| v.to_f64())
                    .collect::<Vec<_>>()
            })
            .collect();
    }

    // Build prop2vert mapping from merge vectors
    let has_merges = !mesh.merge_from_vert.is_empty();
    let needs_prop_map = imp.num_prop > 0 && has_merges;
    let prop2vert: Vec<i32> = if has_merges {
        let mut p2v: Vec<i32> = (0..num_vert as i32).collect();
        for i in 0..mesh.merge_from_vert.len() {
            p2v[mesh.merge_from_vert[i].to_u64() as u32 as usize] =
                mesh.merge_to_vert[i].to_u64() as u32 as i32;
        }
        p2v
    } else {
        vec![]
    };

    // Set up mesh relations from runOriginalID (matches C++ MeshGL constructor)
    let run_index: Vec<usize> = if mesh.run_index.is_empty() {
        vec![0, 3 * num_tri]
    } else {
        let mut ri: Vec<usize> = mesh.run_index.iter().map(|&v| v.to_u64() as usize).collect();
        if ri.len() == mesh.run_original_id.len() {
            ri.push(3 * num_tri);
        } else if ri.len() == 1 {
            ri.push(3 * num_tri);
        }
        ri
    };
    let mut run_original_id: Vec<u32> = mesh.run_original_id.clone();
    let num_runs = run_original_id.len().max(1);
    let start_id = crate::impl_mesh::reserve_ids(num_runs as u32) as i32;
    if run_original_id.is_empty() {
        run_original_id.push(start_id as u32);
    }

    // Build tri_ref for all input tris
    let mut all_tri_ref: Vec<crate::types::TriRef> = vec![crate::types::TriRef::default(); num_tri];
    for (i, &orig_id) in run_original_id.iter().enumerate() {
        let mesh_id = start_id + i as i32;
        let run_start = if i < run_index.len() { run_index[i] / 3 } else { num_tri };
        let run_end = if i + 1 < run_index.len() { run_index[i + 1] / 3 } else { num_tri };
        for tri in run_start..run_end {
            if tri < all_tri_ref.len() {
                all_tri_ref[tri].mesh_id = mesh_id;
                all_tri_ref[tri].original_id = orig_id as i32;
                all_tri_ref[tri].face_id = if !mesh.face_id.is_empty() && tri < mesh.face_id.len() {
                    mesh.face_id[tri].to_u64() as i32
                } else {
                    -1
                };
                all_tri_ref[tri].coplanar_id = tri as i32;
            }
        }
        let transform = if mesh.run_transform.len() >= (i + 1) * 12 {
            let m = &mesh.run_transform[i * 12..i * 12 + 12];
            Mat3x4::from_cols(
                Vec3::new(m[0].to_f64(), m[1].to_f64(), m[2].to_f64()),
                Vec3::new(m[3].to_f64(), m[4].to_f64(), m[5].to_f64()),
                Vec3::new(m[6].to_f64(), m[7].to_f64(), m[8].to_f64()),
                Vec3::new(m[9].to_f64(), m[10].to_f64(), m[11].to_f64()),
            )
        } else {
            Mat3x4::identity()
        };
        // run_flags is a bitmask (#1718): bit 0 = backside, bit 1 = hasNormals.
        let flags = if i < mesh.run_flags.len() { mesh.run_flags[i] } else { 0 };
        let back_side = (flags & 1) != 0;
        // Defensively require >= 3 extra props so a caller setting the bit on a
        // too-small MeshGL doesn't make us read past the slot 0..2 bounds.
        let run_has_normals = (flags & 2) != 0 && imp.num_prop >= 3;
        imp.mesh_relation.mesh_id_transform.insert(mesh_id, crate::types::Relation {
            original_id: orig_id as i32,
            transform,
            back_side,
            has_normals: run_has_normals,
        });
    }

    // Build triangles, filtering out degenerates from merges
    let mut tri_prop: Vec<IVec3> = Vec::with_capacity(num_tri);
    let mut tri_vert: Vec<IVec3> = Vec::new();
    if needs_prop_map {
        tri_vert.reserve(num_tri);
    }
    imp.mesh_relation.tri_ref.clear();
    imp.mesh_relation.tri_ref.reserve(num_tri);

    for i in 0..num_tri {
        let t = mesh.get_tri_verts(i);
        // Indices truncate to u32 like the C++ import's uint32_t casts; the
        // bounds check above already ran on the truncated values.
        let t = [
            t[0].to_u64() as u32,
            t[1].to_u64() as u32,
            t[2].to_u64() as u32,
        ];
        let tri_p = IVec3::new(t[0] as i32, t[1] as i32, t[2] as i32);
        let tri_v = if prop2vert.is_empty() {
            tri_p
        } else {
            IVec3::new(
                prop2vert[t[0] as usize],
                prop2vert[t[1] as usize],
                prop2vert[t[2] as usize],
            )
        };

        // Skip degenerate triangles (where merged verts collapse)
        if tri_v.x != tri_v.y && tri_v.y != tri_v.z && tri_v.z != tri_v.x {
            if needs_prop_map {
                tri_prop.push(tri_p);
                tri_vert.push(tri_v);
            } else {
                tri_prop.push(tri_v);
            }
            imp.mesh_relation.tri_ref.push(all_tri_ref[i]);
        }
    }

    imp.create_halfedges(&tri_prop, &tri_vert);

    // Import halfedge tangents from MeshGL (flat f32 array, 4 per halfedge)
    if !mesh.halfedge_tangent.is_empty() {
        let n_tangents = mesh.halfedge_tangent.len() / 4;
        imp.halfedge_tangent.resize(
            n_tangents,
            crate::linalg::Vec4::new(0.0, 0.0, 0.0, 0.0),
        );
        for i in 0..n_tangents {
            imp.halfedge_tangent[i] = crate::linalg::Vec4::new(
                mesh.halfedge_tangent[4 * i].to_f64(),
                mesh.halfedge_tangent[4 * i + 1].to_f64(),
                mesh.halfedge_tangent[4 * i + 2].to_f64(),
                mesh.halfedge_tangent[4 * i + 3].to_f64(),
            );
        }
    }

    if !imp.is_manifold() {
        match mode {
            ImportMode::Strict => {
                return Self::make_empty(crate::types::Error::NotManifold);
            }
            ImportMode::AllowSoup => {
                // Keep the geometry as a validated triangle soup: unpaired
                // halfedges allowed, no pairing-dependent pipeline steps.
                return match crate::robust::soup::soupify(&mut imp, &tri_prop, &tri_vert) {
                    Ok(()) => {
                        imp.mesh_relation.original_id = -1;
                        imp.calculate_bbox();
                        imp.set_epsilon(mesh.tolerance.to_f64(), false);
                        Self { imp }
                    }
                    Err(e) => Self::make_empty(e),
                };
            }
        }
    }

    // A Manifold created from input mesh is never an original
    imp.mesh_relation.original_id = -1;

    // C++ pipeline: DedupePropVerts, SetNormalsAndCoplanar,
    // RemoveDegenerates, RemoveUnreferencedVerts, SortGeometry
    // Note: CleanupTopology omitted — it would fix opposite-face meshes but
    // conflicts with is_manifold check ordering.
    imp.dedupe_prop_verts();
    imp.calculate_bbox();
    // The frozen MeshGL float intake retains binary32 precision as tolerance.
    // This is distinct from epsilon, which bounds short-edge collapse.
    imp.set_epsilon(mesh.tolerance.to_f64(), P::IS_SINGLE);
    imp.set_normals_and_coplanar();
    if skip_swap {
        // remove_degenerates without its swap_degenerates stage; see
        // docs/CPP_DIVERGENCES.md entry 1.
        crate::edge_op::cleanup_topology(&mut imp);
        crate::edge_op::collapse_short_edges(&mut imp, 0);
        crate::face_op::calculate_vert_normals(&mut imp);
    } else {
        crate::edge_op::remove_degenerates(&mut imp, 0);
    }
    imp.remove_unreferenced_verts();
    imp.sort_geometry();
    Self { imp }
}

pub fn get_mesh_gl(&self, normal_idx: i32) -> MeshGL {
    self.get_mesh_gl_impl(normal_idx)
}

/// Export a double-precision mesh straight from the f64 kernel. Unlike
/// [`Self::get_mesh_gl`], nothing narrows on this path — coordinates,
/// tangents, transforms, and tolerance come out at full f64 precision — and
/// the tolerance is *not* floored at `f32::EPSILON * bbox.scale()`, matching
/// C++ `GetMeshGL64` vs `GetMeshGL`.
pub fn get_mesh_gl64(&self, normal_idx: i32) -> MeshGL64 {
    self.get_mesh_gl_impl(normal_idx)
}

fn get_mesh_gl_impl<P: MeshPrecision, I: MeshIndex>(&self, normal_idx: i32) -> MeshGLP<P, I> {
    // Per #1718: GetMeshGL(-1) auto-substitutes slot 0 when CalculateNormals
    // recorded world-frame normals on every meshID. A non-negative idx is the
    // legacy interface; >= 0 means "interpret this extra-prop slot as normals
    // and normalize it on export (transforming legacy per-mesh-frame runs)".
    let mut normal_idx = normal_idx;
    if normal_idx < 0 && self.imp.all_have_normals() {
        normal_idx = 0;
    }
    let extra_prop = self.imp.num_prop;
    let update_normals = normal_idx >= 0 && (normal_idx as usize) + 3 <= extra_prop;
    let mut out = MeshGLP::<P, I>::default();
    let num_tri = self.imp.num_tri();
    out.num_prop = I::from_usize(3 + extra_prop);
    // C++: for float output only, floor tolerance at float_epsilon *
    // bBox.Scale() to avoid catastrophic cancellation in RelatedGL checks.
    // The f64 output exports the kernel tolerance unchanged.
    let mut tolerance = self.imp.tolerance;
    if P::IS_SINGLE {
        tolerance = tolerance.max((f32::EPSILON as f64) * self.imp.bbox.scale());
    }
    out.tolerance = P::from_f64(tolerance);

    if !self.imp.halfedge_tangent.is_empty() {
        for t in &self.imp.halfedge_tangent {
            out.halfedge_tangent.extend([
                P::from_f64(t.x),
                P::from_f64(t.y),
                P::from_f64(t.z),
                P::from_f64(t.w),
            ]);
        }
    }

    // Sort triangles by (originalID, meshID) for run grouping
    let is_original = self.imp.mesh_relation.original_id >= 0;
    let tri_ref = &self.imp.mesh_relation.tri_ref;
    let mut tri_new2old: Vec<usize> = (0..num_tri).collect();
    if !is_original && !tri_ref.is_empty() {
        tri_new2old.sort_by(|&a, &b| {
            let ra = &tri_ref[a];
            let rb = &tri_ref[b];
            ra.original_id.cmp(&rb.original_id)
                .then(ra.mesh_id.cmp(&rb.mesh_id))
        });
    }

    out.tri_verts.resize(3 * num_tri, I::default());
    out.face_id.resize(num_tri, I::default());
    let mut mesh_id_transform = self.imp.mesh_relation.mesh_id_transform.clone();
    let mut last_mesh_id = -1i32;
    // run index that each output triangle belongs to (for per-vertex normal
    // export below). -1 until the first run is pushed.
    let mut tri_run = vec![0usize; num_tri];
    let mut current_run: i32 = -1;

    // run_flags layout (#1718): bit 0 = backside, bit 1 = hasNormals (slot 0..2
    // of the extra properties is world-frame normals; consumers skip
    // re-applying run_transform to it).
    let run_flags_for = |rel: &crate::types::Relation| -> u8 {
        (if rel.back_side { 1u8 } else { 0 }) | (if rel.has_normals { 2u8 } else { 0 })
    };

    for new_tri in 0..num_tri {
        let old_tri = tri_new2old[new_tri];
        if old_tri < tri_ref.len() {
            let r = &tri_ref[old_tri];
            out.face_id[new_tri] =
                I::from_i32(if r.face_id >= 0 { r.face_id } else { r.coplanar_id });
        }
        for i in 0..3 {
            let he = &self.imp.halfedge[3 * old_tri + i];
            // First pass: set to geometric vertex (startVert). When numProp > 0,
            // a second pass below will replace these with property-vertex indices.
            out.tri_verts[3 * new_tri + i] = I::from_i32(he.start_vert);
        }
        let mesh_id = if old_tri < tri_ref.len() { tri_ref[old_tri].mesh_id } else { 0 };
        if mesh_id != last_mesh_id {
            let rel = mesh_id_transform.remove(&mesh_id).unwrap_or_default();
            out.run_index.push(I::from_usize(3 * new_tri));
            out.run_original_id.push(rel.original_id.max(0) as u32);
            out.run_flags.push(run_flags_for(&rel));
            // C++: runTransform only emitted for non-original manifolds
            if !is_original {
                for col in 0..4 {
                    for row in 0..3 {
                        out.run_transform.push(P::from_f64(rel.transform[col][row]));
                    }
                }
            }
            last_mesh_id = mesh_id;
            current_run += 1;
        }
        tri_run[new_tri] = current_run.max(0) as usize;
    }
    // Add runs for originals that contributed no tris
    for (_id, rel) in &mesh_id_transform {
        out.run_index.push(I::from_usize(3 * num_tri));
        out.run_original_id.push(rel.original_id.max(0) as u32);
        out.run_flags.push(run_flags_for(rel));
        if !is_original {
            for col in 0..4 {
                for row in 0..3 {
                    out.run_transform.push(P::from_f64(rel.transform[col][row]));
                }
            }
        }
    }
    out.run_index.push(I::from_usize(3 * num_tri));

    let num_geom_vert = self.imp.num_vert();
    let num_prop = self.imp.num_prop;
    let total_prop = 3 + num_prop; // xyz + extra

    if num_prop == 0 {
        // No extra properties: positions only, indexed by geometric vertex
        out.vert_properties.resize(3 * num_geom_vert, P::default());
        for i in 0..num_geom_vert {
            let v = self.imp.vert_pos[i];
            out.vert_properties[3 * i] = P::from_f64(v.x);
            out.vert_properties[3 * i + 1] = P::from_f64(v.y);
            out.vert_properties[3 * i + 2] = P::from_f64(v.z);
        }
        return out;
    }

    // When properties exist: deduplicate (start_vert, prop_vert) pairs, matching
    // C++ GetMeshGLImpl. Each unique (vert, prop) pair gets its own slot in
    // vert_properties. Merge vectors record which slots share the same geometry.
    //
    // C++: vertPropPair[vert] = list of {prop, idx}; vert2idx[vert] = first idx
    let mut vert2idx = vec![-1i32; num_geom_vert];
    let mut vert_prop_pairs: Vec<Vec<(i32, u32)>> = vec![vec![]; num_geom_vert];

    for new_tri in 0..num_tri {
        let old_tri = tri_new2old[new_tri];
        for i in 0..3 {
            let he = &self.imp.halfedge[3 * old_tri + i];
            if he.start_vert < 0 { continue; }
            let vert = he.start_vert as usize;
            let prop = he.prop_vert;

            // Look for existing (vert, prop) pair
            let pairs = &vert_prop_pairs[vert];
            let mut found_idx: Option<u32> = None;
            for &(p, idx) in pairs {
                if p == prop {
                    found_idx = Some(idx);
                    break;
                }
            }

            let idx = if let Some(idx) = found_idx {
                idx
            } else {
                let idx = (out.vert_properties.len() / total_prop) as u32;
                // Write position
                let pos = self.imp.vert_pos[vert];
                out.vert_properties.push(P::from_f64(pos.x));
                out.vert_properties.push(P::from_f64(pos.y));
                out.vert_properties.push(P::from_f64(pos.z));
                // Write extra properties (zeros if prop_vert is invalid)
                if prop >= 0 {
                    let base = prop as usize * num_prop;
                    for p in 0..num_prop {
                        out.vert_properties.push(P::from_f64(self.imp.properties[base + p]));
                    }
                } else {
                    for _ in 0..num_prop { out.vert_properties.push(P::default()); }
                }

                // Per #1718: normalize the requested normal slot on export. Runs
                // that already carry world-frame normals (hasNormals bit) just
                // get normalized; legacy runs without the bit are interpreted as
                // per-mesh-frame and rotated to world via the inverse-frame
                // transform first.
                if update_normals {
                    let ni = normal_idx as usize;
                    let off = out.vert_properties.len() - num_prop + ni;
                    // Read back the just-written values: in the f32
                    // instantiation this round-trips through f32 exactly as
                    // the C++ float template does before normalizing.
                    let mut n = Vec3::new(
                        out.vert_properties[off].to_f64(),
                        out.vert_properties[off + 1].to_f64(),
                        out.vert_properties[off + 2].to_f64(),
                    );
                    let run = tri_run[new_tri];
                    let run_has_n = !is_original && (out.run_flags[run] & 2) != 0;
                    if !is_original && !run_has_n {
                        n = normal_transform_for_run(&out.run_transform, run, out.run_flags[run]) * n;
                    }
                    n = crate::smoothing::safe_normalize(n);
                    out.vert_properties[off] = P::from_f64(n.x);
                    out.vert_properties[off + 1] = P::from_f64(n.y);
                    out.vert_properties[off + 2] = P::from_f64(n.z);
                }

                vert_prop_pairs[vert].push((prop, idx));

                // First slot for this geometric vertex is the canonical merge target.
                // Additional slots get merge entries so from_mesh_gl knows they
                // are coincident with the first slot.
                if vert2idx[vert] == -1 {
                    vert2idx[vert] = idx as i32;
                } else {
                    out.merge_from_vert.push(I::from_usize(idx as usize));
                    out.merge_to_vert.push(I::from_i32(vert2idx[vert]));
                }
                idx
            };

            out.tri_verts[3 * new_tri + i] = I::from_usize(idx as usize);
        }
    }
    out
}

/// Write the manifold to a Wavefront OBJ-format string.
/// Mirrors C++ `Manifold::WriteOBJ`, using 19-digit fixed precision and
/// sorting faces for deterministic output. Also emits `# tolerance` and
/// `# epsilon` comment metadata.
pub fn write_obj(&self) -> String {
    let mesh = self.get_mesh_gl64(-1);
    let epsilon = self.imp.epsilon;
    let mut out = String::new();
    out.push_str("# ======= begin mesh ======\n");
    out.push_str(&format!("# tolerance = {:.19}\n", mesh.tolerance));
    out.push_str(&format!("# epsilon = {:.19}\n", epsilon));
    let num_prop = mesh.num_prop as usize;
    for i in 0..mesh.num_vert() {
        let offset = i * num_prop;
        out.push_str(&format!(
            "v {:.19} {:.19} {:.19}\n",
            mesh.vert_properties[offset],
            mesh.vert_properties[offset + 1],
            mesh.vert_properties[offset + 2]
        ));
    }
    let mut tris: Vec<[u64; 3]> = (0..mesh.num_tri())
        .map(|i| [
            mesh.tri_verts[3 * i] + 1,
            mesh.tri_verts[3 * i + 1] + 1,
            mesh.tri_verts[3 * i + 2] + 1,
        ])
        .collect();
    tris.sort();
    for t in &tris {
        out.push_str(&format!("f {} {} {}\n", t[0], t[1], t[2]));
    }
    out.push_str("# ======== end mesh =======\n");
    out
}

/// Read a manifold from a Wavefront OBJ-format string. Recognizes the
/// `# tolerance` and `# epsilon` comment metadata emitted by `write_obj`.
pub fn read_obj(source: &str) -> Self {
    let mut mesh = MeshGL64 {
        num_prop: 3,
        ..Default::default()
    };
    let mut epsilon: Option<f64> = None;
    for line in source.lines() {
        let trimmed = line.trim_end_matches(|c: char| c == '\r' || c == '\n');
        if let Some(rest) = trimmed.strip_prefix("# tolerance = ") {
            if let Ok(v) = rest.trim().parse::<f64>() { mesh.tolerance = v; }
        } else if let Some(rest) = trimmed.strip_prefix("# epsilon = ") {
            if let Ok(v) = rest.trim().parse::<f64>() { epsilon = Some(v); }
        } else if let Some(rest) = trimmed.strip_prefix("v ") {
            let parts: Vec<&str> = rest.split_whitespace().collect();
            if parts.len() >= 3 {
                if let (Ok(x), Ok(y), Ok(z)) = (
                    parts[0].parse::<f64>(),
                    parts[1].parse::<f64>(),
                    parts[2].parse::<f64>(),
                ) {
                    mesh.vert_properties.push(x);
                    mesh.vert_properties.push(y);
                    mesh.vert_properties.push(z);
                }
            }
        } else if let Some(rest) = trimmed.strip_prefix("f ") {
            let parts: Vec<&str> = rest.split_whitespace().collect();
            if parts.len() >= 3 {
                let parse_vert = |s: &str| -> Option<u64> {
                    // OBJ face entries may be "v", "v/vt", or "v/vt/vn"
                    let first = s.split('/').next()?;
                    first.parse::<u64>().ok().map(|n| n - 1)
                };
                if let (Some(a), Some(b), Some(c)) = (
                    parse_vert(parts[0]),
                    parse_vert(parts[1]),
                    parse_vert(parts[2]),
                ) {
                    mesh.tri_verts.push(a);
                    mesh.tri_verts.push(b);
                    mesh.tri_verts.push(c);
                }
            }
        }
    }
    let mut m = Self::from_mesh_gl64(&mesh);
    if let Some(e) = epsilon { m.apply_epsilon(e); }
    m
}

fn apply_epsilon(&mut self, epsilon: f64) {
    self.imp.set_epsilon(epsilon, false);
}
} // impl Manifold

/// Per-run normal transform for the legacy export path (slot interpreted as
/// per-mesh-frame normals on a run without the hasNormals bit). Reconstructs
/// `NormalTransform(runTransform) * (backside ? -1 : 1)` from the flat
/// column-major run_transform buffer. Matches C++ GetMeshGLImpl. (#1718)
fn normal_transform_for_run<P: MeshPrecision>(
    run_transform: &[P],
    run: usize,
    flags: u8,
) -> crate::linalg::Mat3 {
    use crate::linalg::{Mat3, Vec3};
    let b = 12 * run;
    // run_transform[b + 3*col + row] = transform[col][row]; cols 0..2 = 3x3 part.
    let col = |j: usize| {
        Vec3::new(
            run_transform[b + 3 * j].to_f64(),
            run_transform[b + 3 * j + 1].to_f64(),
            run_transform[b + 3 * j + 2].to_f64(),
        )
    };
    let m3 = Mat3::from_cols(col(0), col(1), col(2));
    let sign = if (flags & 1) != 0 { -1.0 } else { 1.0 };
    // NormalTransform(M) = inverse(transpose(M)).
    m3.transpose().inverse() * sign
}
