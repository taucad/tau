//! Retained source records and thread-confined shared analysis.

use std::{
    cell::{OnceCell, RefCell},
    mem::size_of,
    rc::Rc,
};

use crate::{
    analysis::{
        batch::BatchAnalysis,
        continuous::{self, GridPlan, Topology},
        mesh::{
            analyze, analyze_indexed, ConnectedComponents, MeshAnalysis, MeshAnalysisRecord,
            Primitive,
        },
        selection::{build_report_index, SelectorIndex},
    },
    backend::{
        brep::{
            Bounds, BrepEntity, BrepSubject, CircularBoreDisposition, CircularBoreInventory,
            CircularBoreTermination, ContinuousWallDomain, ContinuousWallShape, DocumentFacts,
            EdgeTreatmentCounts, EdgeTreatmentDisposition, EdgeTreatmentInventory,
            EdgeTreatmentKind, LocatedFace, NominalCylindricalBand, RegularSolidContainment,
            ReportedBrepBundle, SelectedContinuousDomain, StepSubjectMetadata, SurfaceFacts,
            TessellationProfile, MAX_CIRCULAR_BORE_CANDIDATES, MAX_CIRCULAR_BORE_OWNED_BYTES,
        },
        csg_scope::CsgScope,
        BackendError, BackendErrorKind, TriangleMesh,
    },
    budget::Budget,
    codec::Json,
    identity::SubjectIdentity,
    registry::Capability,
    result::{Diagnostic, Evaluation},
};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum SubjectFormat {
    MeshBufferV1,
    Glb,
    Gltf,
    Step,
    RationalPlate,
}

/// Internal retention namespace; public subject identities remain unchanged.
pub(crate) fn subject_cache_key(namespace: &str, identity: &str) -> String {
    format!(
        "{}:{namespace}:{identity}",
        crate::protocol::NUMERIC_PROFILE
    )
}

/// One immutable source/profile identity. Heavy facts remain explicitly lazy.
pub(crate) struct Subject {
    pub content_hash: String,
    /// Full-format descriptor digest, set once after verified admission.
    /// Raw GSM1 retains its separate original hash namespace.
    pub semantic_identity: OnceCell<SubjectIdentity>,
    pub format: SubjectFormat,
    pub source_unit: String,
    pub rational_plate: Option<crate::certificates::engine::RationalSubject>,
    pub parallel_plane: Option<crate::certificates::parallel_plane::SourceProof>,
    /// Original STEP bytes above the F2 source ceiling; never inferred from XDE doubles.
    pub pmi_source: Option<Vec<u8>>,
    pub display_name: String,
    pub diagnostics: Vec<Diagnostic>,
    pub retention_limits: crate::backend::AnalysisRetentionLimits,
    pub(crate) resident_overlaps:
        Option<Rc<RefCell<crate::analysis::interference::ResidentOverlaps>>>,
    pub(crate) overlap_cache: Option<crate::cache::SharedOverlapEvidenceCache>,
    pub(crate) producer_identity: Option<Rc<crate::cache::ProducerIdentity>>,
    overlap_components: OnceCell<Rc<crate::analysis::interference::PreparedComponents>>,
    component_labels: OnceCell<Rc<Vec<crate::analysis::interference::ComponentIdentity>>>,
    pub mesh_record: OnceCell<Rc<MeshAnalysisRecord>>,
    pub brep: Option<Box<dyn BrepSubject>>,
    mesh_analysis: OnceCell<Rc<MeshAnalysis>>,
    report_bundle: OnceCell<Rc<ReportedBrepBundle>>,
    report_bytes: OnceCell<u64>,
    circular_bores: OnceCell<Rc<CircularBoreInventory>>,
    edge_treatment_counts: OnceCell<EdgeTreatmentCounts>,
    edge_treatments: OnceCell<Rc<EdgeTreatmentInventory>>,
    step_metadata: OnceCell<StepSubjectMetadata>,
    continuous_wall: OnceCell<Rc<ContinuousWallDomain>>,
    selected_continuous: RefCell<[Option<Rc<SelectedContinuousDomain>>; 16]>,
    continuous_topology: RefCell<Option<RetainedContinuousTopology>>,
    pub binary_limits: crate::backend::resources::BinaryAdmissionLimits,
    selector_index: OnceCell<Rc<SelectorIndex>>,
    tessellations: RefCell<Vec<RetainedTessellation>>,
}

/// Only the core retains derived meshes; adapters return an owned transfer.
struct RetainedTessellation {
    entity: BrepEntity,
    linear_bits: u64,
    angular_bits: u64,
    mesh: Rc<TriangleMesh>,
    bytes: u64,
}

/// One successful topology demand per immutable subject/profile. Authored
/// material order remains part of the witness identity; no numeric/name alias.
#[derive(Clone, Copy, PartialEq, Eq)]
struct ContinuousTopologyKey {
    occurrences: [u32; 16],
    count: usize,
    region: [u64; 6],
}

struct RetainedContinuousTopology {
    key: ContinuousTopologyKey,
    value: Rc<Topology>,
}

impl RetainedContinuousTopology {
    fn owned_bytes(&self) -> u64 {
        (size_of::<Self>() + 2 * size_of::<usize>()) as u64 + self.value.owned_bytes() as u64
    }
}

impl Subject {
    pub(crate) fn new(content_hash: String, format: SubjectFormat, source_unit: String) -> Self {
        Self {
            content_hash,
            semantic_identity: OnceCell::new(),
            format,
            source_unit,
            rational_plate: None,
            parallel_plane: None,
            pmi_source: None,
            display_name: "step".into(),
            diagnostics: Vec::new(),
            retention_limits: crate::EngineConfig::entry().analysis,
            resident_overlaps: None,
            overlap_cache: None,
            producer_identity: None,
            overlap_components: OnceCell::new(),
            component_labels: OnceCell::new(),
            mesh_record: OnceCell::new(),
            brep: None,
            mesh_analysis: OnceCell::new(),
            report_bundle: OnceCell::new(),
            report_bytes: OnceCell::new(),
            circular_bores: OnceCell::new(),
            edge_treatment_counts: OnceCell::new(),
            edge_treatments: OnceCell::new(),
            step_metadata: OnceCell::new(),
            continuous_wall: OnceCell::new(),
            selected_continuous: RefCell::new(std::array::from_fn(|_| None)),
            continuous_topology: RefCell::new(None),
            binary_limits: crate::EngineConfig::entry().binary,
            selector_index: OnceCell::new(),
            tessellations: RefCell::new(Vec::new()),
        }
    }

    pub(crate) fn identity_descriptor_bytes(&self) -> Result<Vec<u8>, BackendError> {
        self.semantic_identity
            .get()
            .ok_or_else(|| BackendError {
                kind: BackendErrorKind::ComputationFailed,
                message: "Subject identity was not established before cache lookup.".into(),
            })?
            .descriptor_bytes()
    }

    /// One immutable derived mesh per entity and exact declared numeric profile.
    /// This accounts owned output allocations, not kernel/transient peak RSS.
    pub(crate) fn tessellate(
        &self,
        entity: BrepEntity,
        profile: TessellationProfile,
    ) -> Result<Rc<TriangleMesh>, BackendError> {
        self.cache_identity()?;
        if !profile.linear_deflection_mm.is_finite()
            || profile.linear_deflection_mm <= 0.0
            || !profile.angular_deflection_rad.is_finite()
            || profile.angular_deflection_rad <= 0.0
        {
            return Err(BackendError {
                kind: BackendErrorKind::InvalidInput,
                message: "Tessellation deflections must be positive and finite.".into(),
            });
        }
        let linear_bits = profile.linear_deflection_mm.to_bits();
        let angular_bits = profile.angular_deflection_rad.to_bits();
        {
            let retained = self.tessellations.borrow();
            if let Some(entry) = retained.iter().find(|entry| {
                entry.entity == entity
                    && entry.linear_bits == linear_bits
                    && entry.angular_bits == angular_bits
            }) {
                return Ok(Rc::clone(&entry.mesh));
            }
            let report_entry = u64::from(self.report_bundle.get().is_some());
            if retained.len() as u64 + report_entry
                >= u64::from(self.retention_limits.max_mesh_entries)
            {
                return Err(BackendError {
                    kind: BackendErrorKind::Unsupported,
                    message:
                        "Tessellation demands exceed the declared analysis retention entry limit."
                            .into(),
                });
            }
        }
        let brep = self.brep.as_deref().ok_or_else(|| BackendError {
            kind: BackendErrorKind::Unsupported,
            message: "The retained subject has no BRep tessellation connector.".into(),
        })?;
        let mesh = brep.tessellate(entity, profile)?;
        let bytes = (size_of::<TriangleMesh>() as u64)
            .saturating_add(
                (mesh.positions.capacity() as u64).saturating_mul(size_of::<[f64; 3]>() as u64),
            )
            .saturating_add(
                (mesh.triangles.capacity() as u64).saturating_mul(size_of::<[u32; 3]>() as u64),
            );
        let mut retained = self.tessellations.borrow_mut();
        let total = retained.iter().fold(
            bytes
                .saturating_add(self.report_bytes.get().copied().unwrap_or(0))
                .saturating_add(self.continuous_owned_bytes())
                .saturating_add(self.f2_owned_bytes())
                .saturating_add(self.circular_bore_owned_bytes())
                .saturating_add(self.edge_treatment_owned_bytes())
                .saturating_add(self.step_metadata_owned_bytes()),
            |sum, entry| sum.saturating_add(entry.bytes),
        );
        if total > self.retention_limits.max_mesh_bytes {
            return Err(BackendError {
                kind: BackendErrorKind::Unsupported,
                message: "Tessellations exceed the declared analysis retention byte limit.".into(),
            });
        }
        retained.push(RetainedTessellation {
            entity,
            linear_bits,
            angular_bits,
            mesh: Rc::clone(&mesh),
            bytes,
        });
        Ok(mesh)
    }

    pub(crate) fn component_labels(
        &self,
    ) -> Result<Rc<Vec<crate::analysis::interference::ComponentIdentity>>, BackendError> {
        self.cache_identity()?;
        if let Some(value) = self.component_labels.get() {
            return Ok(Rc::clone(value));
        }
        let labels = Rc::new(crate::analysis::interference::build_component_labels(self)?);
        let _ = self.component_labels.set(Rc::clone(&labels));
        Ok(labels)
    }

    pub(crate) fn overlap_components(
        &self,
    ) -> Result<Rc<crate::analysis::interference::PreparedComponents>, BackendError> {
        self.cache_identity()?;
        if let Some(value) = self.overlap_components.get() {
            return Ok(Rc::clone(value));
        }
        let value = Rc::new(crate::analysis::interference::prepare_components(self)?);
        let _ = self.overlap_components.set(Rc::clone(&value));
        Ok(value)
    }

    #[cfg(test)]
    pub(crate) fn mesh_analysis_is_cached(&self) -> bool {
        self.mesh_analysis.get().is_some()
    }

    pub(crate) fn mesh_record(&self) -> Option<&MeshAnalysisRecord> {
        self.mesh_record.get().map(Rc::as_ref)
    }

    pub(crate) fn cache_identity(&self) -> Result<String, BackendError> {
        if let Some(identity) = self.semantic_identity.get() {
            return Ok(subject_cache_key("geospec-subject-v1", identity.hash()));
        }
        if self.format == SubjectFormat::MeshBufferV1 {
            return Ok(subject_cache_key("mesh-f32-bounds-v1", &self.content_hash));
        }
        Err(BackendError {
            kind: BackendErrorKind::ComputationFailed,
            message: "Full-format subject lacks its verified semantic descriptor identity.".into(),
        })
    }

    pub(crate) fn report_bundle(&self) -> Result<Option<Rc<ReportedBrepBundle>>, BackendError> {
        let Some(brep) = &self.brep else {
            return Ok(None);
        };
        self.cache_identity()?;
        if let Some(value) = self.report_bundle.get() {
            return Ok(Some(Rc::clone(value)));
        }
        let bundle = brep.reported_facts_and_mesh()?;
        let count = bundle.mesh.triangles.len();
        let vertices = count.checked_mul(3).ok_or_else(report_limit)?;
        if count as u64 > u64::from(self.binary_limits.max_triangles)
            || vertices as u64 > u64::from(self.binary_limits.max_vertices)
            || bundle.facts.occurrences.len() as u64 > u64::from(self.binary_limits.max_occurrences)
            || bundle.occurrence_faces.len() != bundle.facts.occurrences.len()
        {
            return Err(report_limit());
        }
        // Account the source-compatible f32 soup projection before allocating it.
        let projection_bytes = (vertices as u64)
            .saturating_mul(24)
            .saturating_add((count as u64).saturating_mul(16))
            .saturating_add(size_of::<MeshAnalysisRecord>() as u64)
            .saturating_add(size_of::<Primitive>() as u64)
            .saturating_add(self.display_name.len() as u64 + 2);
        let bytes = report_owned_bytes(&bundle).saturating_add(projection_bytes);
        if self.tessellations.borrow().len() as u64
            >= u64::from(self.retention_limits.max_mesh_entries)
        {
            return Err(report_limit());
        }
        let existing = self
            .tessellations
            .borrow()
            .iter()
            .fold(0_u64, |sum, entry| sum.saturating_add(entry.bytes));
        if bytes
            .saturating_add(existing)
            .saturating_add(self.continuous_owned_bytes())
            .saturating_add(self.f2_owned_bytes())
            .saturating_add(self.circular_bore_owned_bytes())
            .saturating_add(self.edge_treatment_owned_bytes())
            .saturating_add(self.step_metadata_owned_bytes())
            > self.retention_limits.max_mesh_bytes
        {
            return Err(report_limit());
        }
        let mut positions = Vec::with_capacity(vertices);
        let mut triangles = Vec::with_capacity(count);
        for triangle in &bundle.mesh.triangles {
            let base = positions.len() as u32;
            for index in triangle {
                let point =
                    bundle
                        .mesh
                        .positions
                        .get(*index as usize)
                        .ok_or_else(|| BackendError {
                            kind: BackendErrorKind::ComputationFailed,
                            message: "Report mesh index is outside its position buffer.".into(),
                        })?;
                let point = point.map(|value| f64::from(value as f32));
                if !point.into_iter().all(f64::is_finite) {
                    return Err(BackendError {
                        kind: BackendErrorKind::ComputationFailed,
                        message:
                            "Report mesh cannot be represented by its declared finite f32 profile."
                                .into(),
                    });
                }
                positions.push(point);
            }
            triangles.push([base, base + 1, base + 2]);
        }
        let record = MeshAnalysisRecord {
            positions,
            triangles,
            triangle_primitives: vec![0; count],
            primitives: vec![Primitive {
                name: format!("{}#0", self.display_name),
                vertex_start: 0,
                vertex_count: vertices as u32,
            }],
        };
        let bundle = Rc::new(bundle);
        // Publish only after all transfers, validation and accounting succeed.
        let _ = self.mesh_record.set(Rc::new(record));
        let _ = self.report_bytes.set(bytes);
        let _ = self.report_bundle.set(Rc::clone(&bundle));
        Ok(Some(bundle))
    }

    pub(crate) fn brep_facts(&self) -> Result<Option<Rc<DocumentFacts>>, BackendError> {
        Ok(self.report_bundle()?.map(|bundle| Rc::clone(&bundle.facts)))
    }

    /// Success-only inventory for this immutable subject/profile. The context
    /// owns the request debit; a warm result never removes that debit.
    fn circular_bores(
        &self,
        faces: &[LocatedFace],
        solid_count: usize,
        edge_count: usize,
    ) -> Result<Rc<CircularBoreInventory>, BackendError> {
        self.cache_identity()?;
        if let Some(value) = self.circular_bores.get() {
            return Ok(Rc::clone(value));
        }
        let count = faces
            .iter()
            .filter(|face| !matches!(face.facts.surface, SurfaceFacts::Plane { .. }))
            .count();
        if count > MAX_CIRCULAR_BORE_CANDIDATES {
            return Err(report_limit());
        }
        let brep = self.brep.as_deref().ok_or_else(|| BackendError {
            kind: BackendErrorKind::Unsupported,
            message: "The retained subject has no circular-bore topology connector.".into(),
        })?;
        let pending_rust = (size_of::<CircularBoreInventory>() + 2 * size_of::<usize>()) as u64
            + (count as u64)
                .saturating_mul(size_of::<crate::backend::brep::CircularBoreCandidate>() as u64);
        // The adapter's bounded transfer may coexist with the receiving Rust
        // vector. Reserve its full declared ceiling, then check actual Rust
        // capacity after transfer. Kernel Boolean scratch is a separate limit.
        self.check_f2_pending(pending_rust.saturating_add(MAX_CIRCULAR_BORE_OWNED_BYTES))?;
        let value = brep.circular_bores(count)?;
        validate_bore_inventory(&value, faces, solid_count, edge_count)?;
        let bytes = value
            .owned_bytes()
            .saturating_add((2 * size_of::<usize>()) as u64);
        // Include the pending transfer before publishing it. No second copy is
        // retained in the adapter; Rc references share this one inventory.
        if bytes > MAX_CIRCULAR_BORE_OWNED_BYTES {
            return Err(report_limit());
        }
        self.check_f2_pending(bytes)?;
        let value = Rc::new(value);
        let _ = self.circular_bores.set(Rc::clone(&value));
        Ok(value)
    }

    fn circular_bore_owned_bytes(&self) -> u64 {
        self.circular_bores.get().map_or(0, |value| {
            value
                .owned_bytes()
                .saturating_add((2 * size_of::<usize>()) as u64)
        })
    }

    /// Lightweight counts are cached only after their complete scope agrees
    /// with the already charged report. Geometry classification remains lazy.
    fn edge_treatment_counts(
        &self,
        bundle: &ReportedBrepBundle,
    ) -> Result<EdgeTreatmentCounts, BackendError> {
        self.cache_identity()?;
        if let Some(value) = self.edge_treatment_counts.get() {
            return Ok(*value);
        }
        let brep = self
            .brep
            .as_deref()
            .ok_or_else(edge_treatment_unavailable)?;
        let value = brep.edge_treatment_counts()?;
        let face_count = if bundle.facts.occurrences.is_empty() {
            bundle.whole_faces.len()
        } else {
            bundle
                .occurrence_faces
                .iter()
                .try_fold(0_usize, |sum, faces| {
                    sum.checked_add(faces.len()).ok_or_else(report_limit)
                })?
        };
        if face_count != value.public_face_count as usize {
            return Err(edge_treatment_invalid());
        }
        if face_count > MAX_EDGE_TREATMENT_ROWS {
            return Err(report_limit());
        }
        self.check_f2_pending(size_of::<EdgeTreatmentCounts>() as u64)?;
        let _ = self.edge_treatment_counts.set(value);
        Ok(value)
    }

    /// The caller debits F+U before either a hit or a new bounded transfer.
    /// The adapter releases scratch during transfer; Subject owns the only
    /// successful retained inventory, with no arbitrary profile-key growth.
    fn edge_treatments(
        &self,
        counts: EdgeTreatmentCounts,
        bundle: &ReportedBrepBundle,
    ) -> Result<Rc<EdgeTreatmentInventory>, BackendError> {
        self.cache_identity()?;
        if let Some(value) = self.edge_treatments.get() {
            return Ok(Rc::clone(value));
        }
        let brep = self
            .brep
            .as_deref()
            .ok_or_else(edge_treatment_unavailable)?;
        // Reserve the declared combined adapter/Rust transfer ceiling before
        // starting it, including the later Rc allocation. This conservatively
        // refuses when a configured lower aggregate ceiling cannot fit it.
        self.check_f2_pending(
            MAX_EDGE_TREATMENT_OWNED_BYTES.saturating_add((2 * size_of::<usize>()) as u64),
        )?;
        let value = brep.edge_treatments(counts.public_face_count as usize)?;
        validate_edge_treatments(&value, counts, bundle)?;
        let bytes = value
            .owned_bytes()
            .saturating_add((2 * size_of::<usize>()) as u64);
        if bytes > MAX_EDGE_TREATMENT_OWNED_BYTES {
            return Err(report_limit());
        }
        self.check_f2_pending(bytes)?;
        let value = Rc::new(value);
        let _ = self.edge_treatments.set(Rc::clone(&value));
        Ok(value)
    }

    fn edge_treatment_owned_bytes(&self) -> u64 {
        let counts = self
            .edge_treatment_counts
            .get()
            .map_or(0, |_| size_of::<EdgeTreatmentCounts>() as u64);
        counts.saturating_add(self.edge_treatments.get().map_or(0, |value| {
            value
                .owned_bytes()
                .saturating_add((2 * size_of::<usize>()) as u64)
        }))
    }

    pub(crate) fn step_subject_metadata(
        &self,
    ) -> Result<Option<&StepSubjectMetadata>, BackendError> {
        if self.format != SubjectFormat::Step {
            return Ok(None);
        }
        if let Some(value) = self.step_metadata.get() {
            return Ok(Some(value));
        }
        self.cache_identity()?;
        let Some(metadata) = self
            .brep
            .as_deref()
            .ok_or_else(|| BackendError {
                kind: BackendErrorKind::Unsupported,
                message: "The retained STEP subject has no BRep metadata connector.".into(),
            })?
            .step_subject_metadata()?
        else {
            return Ok(None);
        };
        if metadata.source_byte_length as u64 > self.binary_limits.max_subject_bytes
            || metadata.free_shape_count as u64 > u64::from(self.binary_limits.max_occurrences)
            || metadata
                .schema
                .as_ref()
                .is_some_and(|schema| schema.len() > 4 * 1024)
        {
            return Err(report_limit());
        }
        let bytes = step_metadata_owned_bytes(&metadata);
        let total = self.tessellations.borrow().iter().fold(
            bytes
                .saturating_add(self.report_bytes.get().copied().unwrap_or(0))
                .saturating_add(self.continuous_owned_bytes())
                .saturating_add(self.f2_owned_bytes())
                .saturating_add(self.circular_bore_owned_bytes())
                .saturating_add(self.edge_treatment_owned_bytes()),
            |sum, entry| sum.saturating_add(entry.bytes),
        );
        if total > self.retention_limits.max_mesh_bytes {
            return Err(report_limit());
        }
        let _ = self.step_metadata.set(metadata);
        Ok(self.step_metadata.get())
    }

    /// One fixed-profile owned certificate. The caller charges the logical
    /// request before this lookup, so retained and fresh results cost equally.
    pub(crate) fn continuous_wall_domain(&self) -> Result<Rc<ContinuousWallDomain>, BackendError> {
        self.cache_identity()?;
        if let Some(value) = self.continuous_wall.get() {
            return Ok(Rc::clone(value));
        }
        let brep = self.brep.as_deref().ok_or_else(|| BackendError {
            kind: BackendErrorKind::Unsupported,
            message: "The retained subject has no BRep continuous wall connector.".into(),
        })?;
        // The certificate is fixed-size, with no hidden vector or profile-key
        // growth. Include its Rc counters in the shared derived-data ceiling.
        let bytes = continuous_wall_owned_bytes();
        let retained = self.tessellations.borrow().iter().fold(
            bytes
                .saturating_add(self.report_bytes.get().copied().unwrap_or(0))
                .saturating_add(self.selected_continuous_bytes())
                .saturating_add(self.f2_owned_bytes())
                .saturating_add(self.circular_bore_owned_bytes())
                .saturating_add(self.edge_treatment_owned_bytes())
                .saturating_add(self.step_metadata_owned_bytes()),
            |sum, entry| sum.saturating_add(entry.bytes),
        );
        if retained > self.retention_limits.max_mesh_bytes {
            return Err(report_limit());
        }
        let value = Rc::new(brep.continuous_wall_domain(BrepEntity::Whole)?);
        let _ = self.continuous_wall.set(Rc::clone(&value));
        Ok(value)
    }

    /// The caller charges one logical request per distinct occurrence before
    /// every lookup. Only successful associated certificates are retained.
    pub(crate) fn selected_continuous_domain(
        &self,
        occurrence: u32,
    ) -> Result<Rc<SelectedContinuousDomain>, BackendError> {
        self.cache_identity()?;
        if let Some(value) = self
            .selected_continuous
            .borrow()
            .iter()
            .flatten()
            .find(|value| value.occurrence == occurrence)
        {
            return Ok(Rc::clone(value));
        }
        let brep = self.brep.as_deref().ok_or_else(|| BackendError {
            kind: BackendErrorKind::Unsupported,
            message: "The retained subject has no selected continuous domain connector.".into(),
        })?;
        let value = brep.selected_continuous_domain(occurrence)?;
        let (faces, edges) = match &value.domain.domain {
            ContinuousWallShape::AxisAlignedBox { .. } => (6, 12),
            ContinuousWallShape::RightCircularCylinder { .. } => (3, 3),
        };
        if value.occurrence != occurrence
            || !complete_query_map(&value.domain_face_to_occurrence_face, faces)
            || !complete_query_map(&value.domain_edge_to_occurrence_edge, edges)
        {
            return Err(BackendError {
                kind: BackendErrorKind::ComputationFailed,
                message: "Selected continuous domain association is inconsistent.".into(),
            });
        }
        // The transferred result is pending owned output even when all sixteen
        // retained cells are occupied. Count actual vector capacities, not just
        // certificate cardinalities, before publishing or retaining that output.
        let bytes = selected_continuous_owned_bytes(&value);
        let continuous = self.continuous_owned_bytes().saturating_add(bytes);
        let total = self.tessellations.borrow().iter().fold(
            continuous
                .saturating_add(self.report_bytes.get().copied().unwrap_or(0))
                .saturating_add(self.f2_owned_bytes())
                .saturating_add(self.circular_bore_owned_bytes())
                .saturating_add(self.edge_treatment_owned_bytes())
                .saturating_add(self.step_metadata_owned_bytes()),
            |sum, entry| sum.saturating_add(entry.bytes),
        );
        if continuous > 32 * 1024 * 1024 || total > self.retention_limits.max_mesh_bytes {
            return Err(report_limit());
        }
        let value = Rc::new(value);
        if let Some(cell) = self
            .selected_continuous
            .borrow_mut()
            .iter_mut()
            .find(|cell| cell.is_none())
        {
            *cell = Some(Rc::clone(&value));
        }
        Ok(value)
    }

    fn check_selected_transfers(
        &self,
        transfers: &[Rc<SelectedContinuousDomain>],
        reference_capacity: usize,
    ) -> Result<(), BackendError> {
        self.check_continuous_pending(transfers, reference_capacity, 0)
    }

    fn check_continuous_pending(
        &self,
        transfers: &[Rc<SelectedContinuousDomain>],
        reference_capacity: usize,
        extra_bytes: u64,
    ) -> Result<(), BackendError> {
        let retained = self.selected_continuous.borrow();
        let pending = transfers.iter().fold(
            (reference_capacity as u64)
                .saturating_mul(size_of::<Rc<SelectedContinuousDomain>>() as u64),
            |sum, value| {
                if retained
                    .iter()
                    .flatten()
                    .any(|cached| Rc::ptr_eq(cached, value))
                {
                    sum
                } else {
                    sum.saturating_add(selected_continuous_owned_bytes(value))
                }
            },
        );
        let continuous = self
            .continuous_owned_bytes()
            .saturating_add(pending)
            .saturating_add(extra_bytes);
        let total = self.tessellations.borrow().iter().fold(
            continuous
                .saturating_add(self.report_bytes.get().copied().unwrap_or(0))
                .saturating_add(self.f2_owned_bytes())
                .saturating_add(self.circular_bore_owned_bytes())
                .saturating_add(self.edge_treatment_owned_bytes())
                .saturating_add(self.step_metadata_owned_bytes()),
            |sum, entry| sum.saturating_add(entry.bytes),
        );
        if continuous > 32 * 1024 * 1024 || total > self.retention_limits.max_mesh_bytes {
            return Err(report_limit());
        }
        Ok(())
    }

    fn f2_owned_bytes(&self) -> u64 {
        self.parallel_plane
            .as_ref()
            .map_or(0, |value| value.owned_bytes())
            .saturating_add(
                self.pmi_source
                    .as_ref()
                    .map_or(0, |source| source.capacity() as u64),
            )
    }

    pub(crate) fn pmi_source_bytes(&self) -> Option<&[u8]> {
        self.parallel_plane
            .as_ref()
            .map(|source| source.source_bytes())
            .or(self.pmi_source.as_deref())
    }

    fn step_metadata_owned_bytes(&self) -> u64 {
        self.step_metadata
            .get()
            .map_or(0, step_metadata_owned_bytes)
    }

    pub(crate) fn check_f2_pending(&self, pending: u64) -> Result<(), BackendError> {
        let total = self.tessellations.borrow().iter().fold(
            pending
                .saturating_add(self.f2_owned_bytes())
                .saturating_add(self.circular_bore_owned_bytes())
                .saturating_add(self.edge_treatment_owned_bytes())
                .saturating_add(self.continuous_owned_bytes())
                .saturating_add(self.report_bytes.get().copied().unwrap_or(0))
                .saturating_add(self.step_metadata_owned_bytes()),
            |sum, entry| sum.saturating_add(entry.bytes),
        );
        if total > self.retention_limits.max_mesh_bytes {
            return Err(report_limit());
        }
        Ok(())
    }

    fn selected_continuous_bytes(&self) -> u64 {
        self.selected_continuous.borrow().iter().flatten().fold(
            size_of::<[Option<Rc<SelectedContinuousDomain>>; 16]>() as u64,
            |sum, value| sum.saturating_add(selected_continuous_owned_bytes(value)),
        )
    }

    fn continuous_owned_bytes(&self) -> u64 {
        let whole = if self.continuous_wall.get().is_some() {
            continuous_wall_owned_bytes()
        } else {
            0
        };
        whole
            .saturating_add(self.selected_continuous_bytes())
            .saturating_add(
                self.continuous_topology
                    .borrow()
                    .as_ref()
                    .map_or(0, RetainedContinuousTopology::owned_bytes),
            )
    }

    /// One index for the immutable retained BRep, shared by every prepared claim.
    /// The batch invokes this only after all claim syntax has been validated.
    pub(crate) fn selector_index(&self) -> Result<Option<Rc<SelectorIndex>>, BackendError> {
        if self.brep.is_none() {
            return Ok(None);
        }
        self.cache_identity()?;
        if let Some(value) = self.selector_index.get() {
            return Ok(Some(Rc::clone(value)));
        }
        let bundle = self.report_bundle()?.ok_or_else(|| BackendError {
            kind: BackendErrorKind::ComputationFailed,
            message: "Retained BRep is missing its report bundle.".into(),
        })?;
        let value = Rc::new(build_report_index(
            &bundle.facts,
            &bundle.whole_faces,
            &bundle.occurrence_faces,
        )?);
        let _ = self.selector_index.set(Rc::clone(&value));
        Ok(Some(value))
    }

    /// The caller charges deterministic requested work before this lookup.
    pub(crate) fn mesh_analysis(&self) -> Result<Rc<MeshAnalysis>, BackendError> {
        if let Some(analysis) = self.mesh_analysis.get() {
            return Ok(Rc::clone(analysis));
        }
        let record = self.mesh_record.get().ok_or_else(|| BackendError {
            kind: BackendErrorKind::Unsupported,
            message: "The retained subject has no materialized mesh analysis record.".into(),
        })?;
        let analysis = Rc::new(if self.format == SubjectFormat::MeshBufferV1 {
            analyze_indexed(record)?
        } else {
            analyze(record)?
        });
        // ST owner execution has no intervening concurrent materialization.
        let _ = self.mesh_analysis.set(Rc::clone(&analysis));
        Ok(analysis)
    }
}

const MAX_EDGE_TREATMENT_ROWS: usize = 4096;
const MAX_EDGE_TREATMENT_OWNED_BYTES: u64 = 1024 * 1024;

fn edge_treatment_unavailable() -> BackendError {
    BackendError {
        kind: BackendErrorKind::Unsupported,
        message: "The retained subject has no owning-solid edge-treatment connector.".into(),
    }
}

fn edge_treatment_invalid() -> BackendError {
    BackendError {
        kind: BackendErrorKind::ComputationFailed,
        message: "Edge-treatment inventory has incomplete or inconsistent scoped associations."
            .into(),
    }
}

fn validate_edge_treatments(
    value: &EdgeTreatmentInventory,
    counts: EdgeTreatmentCounts,
    bundle: &ReportedBrepBundle,
) -> Result<(), BackendError> {
    if value.counts != counts
        || value.rows.len() != counts.public_face_count as usize
        || value.rows.len() > MAX_EDGE_TREATMENT_ROWS
    {
        return Err(edge_treatment_invalid());
    }
    let mut rows = value.rows.iter();
    let mut validate_scope = |occurrence: Option<u32>, path: &str, faces: &[LocatedFace]| {
        for face in faces {
            let row = rows.next().ok_or_else(edge_treatment_invalid)?;
            let private = match (occurrence, face.entity) {
                (None, BrepEntity::WholeFace(index)) => index,
                (
                    Some(occurrence),
                    BrepEntity::Face {
                        occurrence: actual,
                        face,
                    },
                ) if occurrence == actual => face,
                _ => return Err(edge_treatment_invalid()),
            };
            if row.occurrence != occurrence
                || row.occurrence_path != path
                || row.public_face_ordinal != face.facts.index
                || row.private_query_face != private
                || private == 0
                || row.transferred_reversed != face.reversed
            {
                return Err(edge_treatment_invalid());
            }
            for (is_chamfer, disposition) in [(true, &row.chamfer), (false, &row.fillet)] {
                let EdgeTreatmentDisposition::Qualified(certificate) = disposition else {
                    continue;
                };
                if row.owning_solid_ordinal.is_none()
                    || is_chamfer
                        != matches!(
                            certificate.kind,
                            EdgeTreatmentKind::PlanarChamfer | EdgeTreatmentKind::ConicalChamfer
                        )
                    || !certificate.metric_value_mm.is_finite()
                    || certificate.metric_value_mm <= 0.0
                    || certificate.boundary_uses.len() > 8
                    || certificate.boundary_uses.is_empty()
                    || certificate.residuals.len() > 16
                    || certificate.residuals.is_empty()
                    || certificate.wire_count == 0
                {
                    return Err(edge_treatment_invalid());
                }
                for support in &certificate.supports {
                    let actual = faces
                        .get(support.public_face_ordinal as usize)
                        .ok_or_else(edge_treatment_invalid)?;
                    let expected = match occurrence {
                        Some(occurrence) => BrepEntity::Face {
                            occurrence,
                            face: support.private_query_face,
                        },
                        None => BrepEntity::WholeFace(support.private_query_face),
                    };
                    if support.public_face_ordinal == row.public_face_ordinal
                        || support.private_query_face == 0
                        || actual.facts.index != support.public_face_ordinal
                        || actual.entity != expected
                        || actual.reversed != support.transferred_reversed
                    {
                        return Err(edge_treatment_invalid());
                    }
                }
                if certificate.supports[0].public_face_ordinal
                    == certificate.supports[1].public_face_ordinal
                {
                    return Err(edge_treatment_invalid());
                }
            }
        }
        Ok(())
    };
    if bundle.facts.occurrences.is_empty() {
        validate_scope(None, "", &bundle.whole_faces)?;
    } else {
        if bundle.occurrence_faces.len() != bundle.facts.occurrences.len() {
            return Err(edge_treatment_invalid());
        }
        for (index, (occurrence, faces)) in bundle
            .facts
            .occurrences
            .iter()
            .zip(&bundle.occurrence_faces)
            .enumerate()
        {
            validate_scope(Some(index as u32), &occurrence.path, faces)?;
        }
    }
    if rows.next().is_some() {
        return Err(edge_treatment_invalid());
    }
    Ok(())
}

fn validate_bore_inventory(
    value: &CircularBoreInventory,
    faces: &[LocatedFace],
    solid_count: usize,
    edge_count: usize,
) -> Result<(), BackendError> {
    let invalid = || BackendError {
        kind: BackendErrorKind::ComputationFailed,
        message: "Circular-bore topology transfer has incomplete or inconsistent associations."
            .into(),
    };
    let candidates = faces
        .iter()
        .filter(|face| !matches!(face.facts.surface, SurfaceFacts::Plane { .. }));
    if value.candidates.len() > MAX_CIRCULAR_BORE_CANDIDATES
        || value.candidates.len() != candidates.clone().count()
    {
        return Err(invalid());
    }
    for (actual, expected) in value.candidates.iter().zip(candidates) {
        if actual.public_face_ordinal != expected.facts.index
            || expected.entity != BrepEntity::WholeFace(actual.private_query_face)
            || actual.private_query_face == 0
        {
            return Err(invalid());
        }
        let CircularBoreDisposition::Qualified(topology) = &actual.disposition else {
            continue;
        };
        let band = &topology.band;
        if topology.owning_solid_ordinal as usize >= solid_count
            || !matches!(expected.facts.surface, SurfaceFacts::Cylinder { .. })
            || !expected.reversed
            || !band.origin.into_iter().all(f64::is_finite)
            || !band.axis.into_iter().all(f64::is_finite)
            || !band.axis.into_iter().any(|component| component != 0.0)
            || !band.radius.is_finite()
            || band.radius <= 0.0
            || !band.from.is_finite()
            || !band.to.is_finite()
            || band.from >= band.to
            || !topology.maximum_topology_tolerance_mm.is_finite()
            || topology.maximum_topology_tolerance_mm < 0.0
            || topology.interior_residual_solid_count != 0
            || !topology
                .ends
                .iter()
                .any(|end| end.termination == CircularBoreTermination::Mouth)
            || topology.ends[0].owning_solid_edge_ordinal
                == topology.ends[1].owning_solid_edge_ordinal
            || topology.ends[0].adjacent_public_face_ordinal
                == topology.ends[1].adjacent_public_face_ordinal
        {
            return Err(invalid());
        }
        for end in topology.ends {
            let adjacent = faces
                .get(end.adjacent_public_face_ordinal as usize)
                .ok_or_else(invalid)?;
            if end.owning_solid_edge_ordinal == 0
                || end.owning_solid_edge_ordinal as usize > edge_count
                || adjacent.facts.index != end.adjacent_public_face_ordinal
                || !matches!(adjacent.facts.surface, SurfaceFacts::Plane { .. })
            {
                return Err(invalid());
            }
        }
    }
    Ok(())
}

fn continuous_wall_owned_bytes() -> u64 {
    (size_of::<ContinuousWallDomain>() + 2 * size_of::<usize>()) as u64
}

fn selected_continuous_owned_bytes(value: &SelectedContinuousDomain) -> u64 {
    (size_of::<SelectedContinuousDomain>() + 2 * size_of::<usize>()) as u64
        + (value.domain_face_to_occurrence_face.capacity() as u64)
            .saturating_mul(size_of::<u32>() as u64)
        + (value.domain_edge_to_occurrence_edge.capacity() as u64)
            .saturating_mul(size_of::<u32>() as u64)
}

fn step_metadata_owned_bytes(value: &StepSubjectMetadata) -> u64 {
    size_of::<StepSubjectMetadata>() as u64
        + value.schema.as_ref().map_or(0, |schema| schema.capacity()) as u64
}

fn complete_query_map(values: &[u32], count: usize) -> bool {
    values.len() == count
        && (1..=count as u32)
            .all(|index| values.iter().filter(|value| **value == index).count() == 1)
}

fn report_limit() -> BackendError {
    BackendError {
        kind: BackendErrorKind::Unsupported,
        message: "The report bundle exceeds the declared binary or retained derived-data limits."
            .into(),
    }
}

/// Conservative logical payload accounting (including Vec/String capacity).
/// Allocator metadata, original kernel storage and temporary kernel work are
/// separate peak measurements, not covered by this core-owned payload ceiling.
fn report_owned_bytes(bundle: &ReportedBrepBundle) -> u64 {
    fn vector<T>(value: &Vec<T>) -> u64 {
        (value.capacity() as u64).saturating_mul(size_of::<T>() as u64)
    }
    fn text(value: &String) -> u64 {
        value.capacity() as u64
    }
    fn optional_text(value: &Option<String>) -> u64 {
        value.as_ref().map_or(0, text)
    }
    fn faces(value: &[crate::backend::brep::LocatedFace]) -> u64 {
        value.iter().fold(
            (std::mem::size_of_val(value) + 2 * size_of::<usize>()) as u64,
            |sum, face| {
                sum.saturating_add(vector(&face.edge_indices))
                    .saturating_add(optional_text(&face.shape_label))
            },
        )
    }
    let facts = &bundle.facts;
    let mut bytes = (size_of::<ReportedBrepBundle>()
        + size_of::<DocumentFacts>()
        + 6 * size_of::<usize>()) as u64;
    bytes = bytes.saturating_add(text(&facts.source_length_unit));
    bytes = bytes.saturating_add(vector(&facts.products));
    for value in &facts.products {
        bytes = bytes
            .saturating_add(text(&value.label))
            .saturating_add(text(&value.name));
    }
    bytes = bytes.saturating_add(vector(&facts.occurrences));
    for value in &facts.occurrences {
        for value in [
            &value.label,
            &value.product_label,
            &value.name,
            &value.path,
            &value.product_name,
        ] {
            bytes = bytes.saturating_add(text(value));
        }
        bytes = bytes
            .saturating_add(optional_text(&value.instance_name))
            .saturating_add(vector(&value.ordinal_path));
    }
    bytes = bytes
        .saturating_add(vector(&facts.faces))
        .saturating_add(vector(&facts.pmi));
    for value in &facts.pmi {
        bytes = bytes
            .saturating_add(text(&value.label))
            .saturating_add(text(&value.name))
            .saturating_add(vector(&value.shape_labels));
        for label in &value.shape_labels {
            bytes = bytes.saturating_add(text(label));
        }
    }
    bytes = bytes.saturating_add(vector(&facts.subshapes));
    for value in &facts.subshapes {
        bytes = bytes
            .saturating_add(text(&value.occurrence_path))
            .saturating_add(text(&value.name))
            .saturating_add(optional_text(&value.shape_label));
    }
    bytes = bytes.saturating_add(vector(&facts.datum_placements));
    for value in &facts.datum_placements {
        bytes = bytes
            .saturating_add(text(&value.occurrence_path))
            .saturating_add(text(&value.name));
    }
    bytes = bytes.saturating_add(vector(&facts.semantic_datums));
    for value in &facts.semantic_datums {
        bytes = bytes
            .saturating_add(text(&value.occurrence_path))
            .saturating_add(text(&value.label))
            .saturating_add(optional_text(&value.feature_name))
            .saturating_add(vector(&value.face_indices));
    }
    bytes = bytes
        .saturating_add(faces(&bundle.whole_faces))
        .saturating_add(vector(&bundle.occurrence_faces));
    for value in &bundle.occurrence_faces {
        bytes = bytes.saturating_add(faces(value));
    }
    bytes
        .saturating_add(size_of::<TriangleMesh>() as u64)
        .saturating_add(vector(&bundle.mesh.positions))
        .saturating_add(vector(&bundle.mesh.triangles))
}

/// Families receive resolved subjects and a charged scope, never host objects.
pub(crate) struct EvaluationContext<'a> {
    pub subjects: &'a [Rc<Subject>],
    pub capability: Capability,
    pub claim_id: &'a str,
    pub normalized_expected: &'a Json,
    pub budget: &'a Budget,
    pub csg: Option<CsgScope<'a>>,
    mesh_charged: bool,
    brep_charged: bool,
    selected_domains: Vec<Rc<SelectedContinuousDomain>>,
    cylindrical_bands: Vec<Rc<NominalCylindricalBand>>,
    finite_contact_faces: Vec<Rc<crate::backend::brep::FiniteContactFace>>,
    cylindrical_band_output_bytes: u64,
    batch: Option<&'a BatchAnalysis>,
}

impl<'a> EvaluationContext<'a> {
    pub(crate) fn new(
        subjects: &'a [Rc<Subject>],
        capability: Capability,
        claim_id: &'a str,
        normalized_expected: &'a Json,
        budget: &'a Budget,
        csg: Option<CsgScope<'a>>,
    ) -> Self {
        Self {
            subjects,
            capability,
            claim_id,
            normalized_expected,
            budget,
            csg,
            mesh_charged: false,
            brep_charged: false,
            selected_domains: Vec::new(),
            cylindrical_bands: Vec::new(),
            finite_contact_faces: Vec::new(),
            cylindrical_band_output_bytes: 0,
            batch: None,
        }
    }

    pub(crate) fn with_report_paid(mut self, paid: bool) -> Self {
        self.brep_charged = paid;
        self
    }

    pub(crate) fn with_batch(mut self, batch: &'a BatchAnalysis) -> Self {
        self.batch = Some(batch);
        self
    }

    pub(crate) fn connected_components(
        &mut self,
        tolerance_mm: f64,
    ) -> Result<Rc<ConnectedComponents>, Evaluation> {
        let batch = self.batch.ok_or_else(|| {
            backend_refusal(BackendError {
                kind: BackendErrorKind::ComputationFailed,
                message: "Connected-component evaluation requires a complete prepared batch."
                    .into(),
            })
        })?;
        let identity = self.subject().cache_identity().map_err(backend_refusal)?;
        let analysis = self.mesh_analysis()?;
        batch
            .connected_components(&identity, tolerance_mm, &analysis)
            .map_err(backend_refusal)
    }

    /// Preparation guarantees a primary subject before family evaluation.
    pub(crate) fn subject(&self) -> &'a Subject {
        self.subjects
            .first()
            .expect("prepared claim has a primary subject")
            .as_ref()
    }

    pub(crate) fn budget(&self) -> &Budget {
        self.budget
    }

    pub(crate) fn charge_mesh_demand(&mut self) -> Result<(), Evaluation> {
        if self.subject().brep.is_some() {
            self.brep_facts()?;
        }
        if !self.mesh_charged {
            if let Some(record) = self.subject().mesh_record() {
                let units = (record.positions.len() as u64)
                    .saturating_add((record.triangles.len() as u64).saturating_mul(3));
                self.budget
                    .charge(units)
                    .map_err(|error| Evaluation::budget_exceeded(self.capability, error))?;
            }
            self.mesh_charged = true;
        }
        Ok(())
    }

    pub(crate) fn mesh_analysis(&mut self) -> Result<Rc<MeshAnalysis>, Evaluation> {
        self.charge_mesh_demand()?;
        self.subject().mesh_analysis().map_err(backend_refusal)
    }

    pub(crate) fn brep_facts(&mut self) -> Result<Option<Rc<DocumentFacts>>, Evaluation> {
        if !self.brep_charged && self.subject().brep.is_some() {
            self.budget
                .charge(1)
                .map_err(|error| Evaluation::budget_exceeded(self.capability, error))?;
            self.brep_charged = true;
        }
        self.subject().brep_facts().map_err(backend_refusal)
    }

    pub(crate) fn circular_bores(&mut self) -> Result<Rc<CircularBoreInventory>, Evaluation> {
        self.brep_facts()?;
        let subject = self.subject();
        let bundle = subject
            .report_bundle()
            .map_err(backend_refusal)?
            .ok_or_else(|| {
                backend_refusal(BackendError {
                    kind: BackendErrorKind::Unsupported,
                    message: "Circular-bore topology requires retained BRep faces.".into(),
                })
            })?;
        let count = bundle
            .whole_faces
            .iter()
            .filter(|face| !matches!(face.facts.surface, SurfaceFacts::Plane { .. }))
            .count();
        self.budget
            .charge(1_u64.saturating_add(count as u64))
            .map_err(|error| Evaluation::budget_exceeded(self.capability, error))?;
        subject
            .circular_bores(
                &bundle.whole_faces,
                bundle.facts.shape.topology.solids,
                bundle.facts.shape.topology.edges,
            )
            .map_err(backend_refusal)
    }

    /// Complete-material queries are uncached and fully precharged, including
    /// source association scans and refused candidates.
    pub(crate) fn interference_materials(
        &mut self,
        occurrence: u32,
    ) -> Result<Vec<crate::backend::brep::SelectedInterferenceMaterial>, Evaluation> {
        self.brep_facts()?;
        let subject = self.subject();
        let refusal = || {
            backend_refusal(BackendError {
                kind: BackendErrorKind::Unsupported,
                message: "Interference requires complete source-associated BRep materials.".into(),
            })
        };
        // Named primary meshes are a different component partition. Never
        // reinterpret their integer IDs as occurrence selectors.
        if subject.mesh_record().is_some_and(|record| {
            crate::analysis::interference::build_component_labels(subject)
                .is_ok_and(|v| v.len() >= 2)
                && record.primitives.len() >= 2
        }) {
            return Err(refusal());
        }
        let bundle = subject
            .report_bundle()
            .map_err(backend_refusal)?
            .ok_or_else(refusal)?;
        let faces = bundle
            .occurrence_faces
            .get(occurrence as usize)
            .ok_or_else(refusal)?;
        if faces.len() > 4096
            || bundle.facts.shape.topology.edges > 16384
            || bundle.facts.shape.topology.vertices > 16384
        {
            return Err(refusal());
        }
        self.check_continuous_output(1024 * 1024)?;
        let candidates: Vec<_> = faces
            .iter()
            .filter(|face| matches!(face.facts.surface, SurfaceFacts::Cylinder { .. }))
            .take(17)
            .collect();
        if candidates.len() > 16 {
            return Err(refusal());
        }
        let brep = subject.brep.as_deref().ok_or_else(refusal)?;
        let work = (faces.len() as u64 + 1)
            .saturating_mul(bundle.whole_faces.len() as u64 + 1)
            .saturating_add(16384);
        let mut result = Vec::new();
        for face in candidates {
            self.budget
                .charge(work)
                .map_err(|e| Evaluation::budget_exceeded(self.capability, e))?;
            let material = match brep.selected_interference_material(face.entity) {
                Ok(value) => value,
                Err(error) if error.kind == BackendErrorKind::Unsupported => continue,
                Err(error) => return Err(backend_refusal(error)),
            };
            use crate::backend::brep::SelectedInterferenceMaterial::*;
            let band = match &material {
                BoreSlab(band) | FiniteCylinder(band) => band,
            };
            if band.source_route_count == 0
                || band.source_route_count > 32
                || band.source_face_entity == 0
                || band.occurrence != occurrence
                || band.public_face_ordinal != face.facts.index
                || face.entity
                    != (BrepEntity::Face {
                        occurrence,
                        face: band.private_query_face,
                    })
            {
                return Err(backend_refusal(BackendError {
                    kind: BackendErrorKind::ComputationFailed,
                    message: "Interference material association changed during transfer.".into(),
                }));
            }
            result.push(material);
        }
        Ok(result)
    }

    /// Uncached complete-selected-material bore demands. Charge all local
    /// inventory work before each adapter call, including refused candidates.
    pub(crate) fn selected_bore_voids(
        &mut self,
        occurrence: u32,
    ) -> Result<Vec<crate::backend::brep::SelectedBoreVoid>, Evaluation> {
        self.brep_facts()?;
        let subject = self.subject();
        let bundle = subject
            .report_bundle()
            .map_err(backend_refusal)?
            .ok_or_else(|| {
                backend_refusal(BackendError {
                    kind: BackendErrorKind::Unsupported,
                    message: "Selected bore void requires a BRep report.".into(),
                })
            })?;
        let faces = bundle
            .occurrence_faces
            .get(occurrence as usize)
            .ok_or_else(|| {
                backend_refusal(BackendError {
                    kind: BackendErrorKind::Unsupported,
                    message: "Selected material occurrence is missing.".into(),
                })
            })?;
        if faces.len() > 4096 {
            return Err(backend_refusal(BackendError {
                kind: BackendErrorKind::Unsupported,
                message: "Selected bore void exceeds its 4096-face/16-bore domain.".into(),
            }));
        }
        self.check_continuous_output(256 * 1024)?;
        let candidates: Vec<_> = faces
            .iter()
            .filter(|face| {
                face.reversed && matches!(face.facts.surface, SurfaceFacts::Cylinder { .. })
            })
            .take(17)
            .collect();
        if candidates.len() > 16 {
            return Err(backend_refusal(BackendError {
                kind: BackendErrorKind::Unsupported,
                message: "Selected bore void exceeds its 16-bore domain.".into(),
            }));
        }
        let work = 1 + faces
            .iter()
            .filter(|face| !matches!(face.facts.surface, SurfaceFacts::Plane { .. }))
            .count() as u64;
        let brep = subject.brep.as_deref().ok_or_else(|| {
            backend_refusal(BackendError {
                kind: BackendErrorKind::Unsupported,
                message: "Selected material has no BRep.".into(),
            })
        })?;
        let mut result = Vec::new();
        for face in candidates {
            self.budget
                .charge(work)
                .map_err(|e| Evaluation::budget_exceeded(self.capability, e))?;
            let value = match brep.selected_bore_void(face.entity) {
                Ok(value) => value,
                Err(error) if error.kind == BackendErrorKind::Unsupported => continue,
                Err(error) => return Err(backend_refusal(error)),
            };
            if value.band.occurrence != occurrence
                || value.band.public_face_ordinal != face.facts.index
                || face.entity
                    != (BrepEntity::Face {
                        occurrence,
                        face: value.band.private_query_face,
                    })
            {
                return Err(backend_refusal(BackendError {
                    kind: BackendErrorKind::ComputationFailed,
                    message: "Selected bore certificate does not bind the requested material face."
                        .into(),
                }));
            }
            result.push(value);
        }
        Ok(result)
    }

    /// One requested regular-solid difference, charged before any connector
    /// query or connector-owned lookup. No core result cache is introduced.
    pub(crate) fn regular_solid_containment(
        &mut self,
        subject: BrepEntity,
        target: BrepEntity,
    ) -> Result<RegularSolidContainment, Evaluation> {
        self.brep_facts()?;
        self.budget
            .charge(1)
            .map_err(|error| Evaluation::budget_exceeded(self.capability, error))?;
        let brep = self.subject().brep.as_deref().ok_or_else(|| {
            backend_refusal(BackendError {
                kind: BackendErrorKind::Unsupported,
                message: "Regular-solid containment requires BRep evidence.".into(),
            })
        })?;
        let value = brep
            .regular_solid_containment(subject, target)
            .map_err(backend_refusal)?;
        // Topology is authoritative. Volume and location are diagnostics, not
        // an epsilon-based emptiness test. Reject inconsistent transport facts.
        let empty = value.residual_solid_count == 0;
        if value.contained != empty
            || !value.residual_volume.is_finite()
            || if empty {
                value.residual_volume != 0.0
                    || value.residual_bounds.is_some()
                    || value.residual_center_of_mass.is_some()
            } else {
                value.residual_volume <= 0.0
            }
            || value.residual_bounds.is_some_and(|bounds| {
                (0..3).any(|axis| {
                    !bounds.min[axis].is_finite()
                        || !bounds.max[axis].is_finite()
                        || bounds.min[axis] > bounds.max[axis]
                })
            })
            || value
                .residual_center_of_mass
                .is_some_and(|point| !point.into_iter().all(f64::is_finite))
        {
            return Err(backend_refusal(BackendError {
                kind: BackendErrorKind::ComputationFailed,
                message: "The BRep connector returned inconsistent regular-solid residual facts."
                    .into(),
            }));
        }
        Ok(value)
    }

    /// Claim-local distinct-face demand. An entry can exist only after its
    /// debit and validated query succeed; reusing that paid demand is not a
    /// persistent cache hit. A new demand is charged before report/query lookup.
    pub(crate) fn finite_contact_face(
        &mut self,
        entity: BrepEntity,
        ordinal: u32,
    ) -> Result<Rc<crate::backend::brep::FiniteContactFace>, Evaluation> {
        use crate::backend::brep::FiniteContactFace;
        let BrepEntity::Face { occurrence, face } = entity else {
            return Err(cylindrical_band_refusal(
                "Finite contact requires an occurrence-local face.",
            ));
        };
        if let Some(v) = self
            .finite_contact_faces
            .iter()
            .find(|v| v.occurrence == occurrence && v.private_query_face == face)
        {
            if v.public_face_ordinal != ordinal {
                return Err(cylindrical_band_refusal(
                    "Finite contact public/private association changed.",
                ));
            }
            return Ok(Rc::clone(v));
        }
        self.budget
            .charge(1)
            .map_err(|e| Evaluation::budget_exceeded(self.capability, e))?;
        // One ABI record, Rust return/copy and retained Rc; the bounded C++
        // topology traversal has <=24 uses. OCCT internal machine allocations
        // remain part of connector admission, not this requested-payload bound.
        self.check_cylindrical_band_capacity(&[
            (4 * size_of::<FiniteContactFace>() + 2 * size_of::<usize>()) as u64,
            ((self.finite_contact_faces.capacity() + 1) * size_of::<Rc<FiniteContactFace>>())
                as u64,
        ])?;
        self.finite_contact_faces
            .try_reserve_exact(1)
            .map_err(|_| cylindrical_band_refusal("Finite contact record reservation failed."))?;
        let bundle = self
            .subject()
            .report_bundle()
            .map_err(backend_refusal)?
            .ok_or_else(|| {
                cylindrical_band_refusal(
                    "Finite contact requires a retained located-face inventory.",
                )
            })?;
        let selected = bundle
            .occurrence_faces
            .get(occurrence as usize)
            .and_then(|faces| faces.get(ordinal as usize))
            .filter(|s| s.entity == entity && s.facts.index == ordinal)
            .ok_or_else(|| {
                cylindrical_band_refusal("Finite contact selected face is not source-associated.")
            })?;
        let value = self
            .subject()
            .brep
            .as_deref()
            .ok_or_else(|| cylindrical_band_refusal("Finite contact requires BRep evidence."))?
            .finite_contact_face(entity)
            .map_err(backend_refusal)?;
        if value.occurrence != occurrence
            || value.private_query_face != face
            || value.public_face_ordinal != ordinal
            || value.transferred_reversed != u32::from(selected.reversed)
        {
            return Err(cylindrical_band_refusal(
                "Finite contact returned a different selected operand.",
            ));
        }
        let value = Rc::new(value);
        self.finite_contact_faces.push(Rc::clone(&value));
        Ok(value)
    }

    pub(crate) fn nominal_cylindrical_band(
        &mut self,
        entity: BrepEntity,
        public_face_ordinal: u32,
    ) -> Result<Rc<NominalCylindricalBand>, Evaluation> {
        let BrepEntity::Face { occurrence, face } = entity else {
            return Err(cylindrical_band_refusal(
                "Cylindrical-band clearance requires a selected occurrence face.",
            ));
        };
        if face == 0 {
            return Err(cylindrical_band_refusal(
                "Cylindrical-band clearance requires a one-based private query face.",
            ));
        }
        if let Some(value) = self
            .cylindrical_bands
            .iter()
            .find(|value| value.occurrence == occurrence && value.private_query_face == face)
        {
            if value.public_face_ordinal != public_face_ordinal {
                return Err(cylindrical_band_refusal(
                    "A repeated private face has a different public association.",
                ));
            }
            return Ok(Rc::clone(value));
        }
        self.budget
            .charge(1)
            .map_err(|error| Evaluation::budget_exceeded(self.capability, error))?;
        // Fixed C1 result plus Rc allocation, ABI/Rust transfer and possible
        // Vec growth. Account capacity, including allocator over-reservation.
        let record = (size_of::<NominalCylindricalBand>() + 2 * size_of::<usize>()) as u64;
        // The frozen adapter has one fixed ABI record, conversion arrays and
        // one Rust return value. Two Rust pairs conservatively cover those
        // payloads, including the ABI's wider enum/bool slots and padding.
        // Compiler machine frames and kernel work are outside this contract.
        let transfer = 2 * continuous::CYLINDRICAL_BAND_INPUT_PAIR_BYTES as u64;
        // During growth the old pointer buffer may coexist with the new one.
        self.check_cylindrical_band_capacity(&[
            record,
            transfer,
            ((self.cylindrical_bands.capacity() + 1) * size_of::<Rc<NominalCylindricalBand>>())
                as u64,
        ])?;
        self.cylindrical_bands.try_reserve_exact(1).map_err(|_| {
            cylindrical_band_refusal("Cylindrical-band claim-local retention allocation failed.")
        })?;
        self.check_cylindrical_band_capacity(&[record, transfer])?;
        let bundle = self
            .subject()
            .report_bundle()
            .map_err(backend_refusal)?
            .ok_or_else(|| {
                cylindrical_band_refusal(
                    "Cylindrical-band clearance needs retained occurrence-face evidence.",
                )
            })?;
        let selected = bundle.occurrence_faces.get(occurrence as usize)
            .and_then(|faces| faces.get(public_face_ordinal as usize))
            .filter(|selected| selected.facts.index == public_face_ordinal && selected.entity == entity)
            .ok_or_else(|| cylindrical_band_refusal("The selected public face does not map to its private occurrence query address."))?;
        let brep = self.subject().brep.as_deref().ok_or_else(|| {
            cylindrical_band_refusal("Cylindrical-band clearance requires BRep evidence.")
        })?;
        let value = brep
            .nominal_cylindrical_band(entity)
            .map_err(backend_refusal)?;
        if value.occurrence != occurrence
            || value.public_face_ordinal != public_face_ordinal
            || value.private_query_face != face
            || value.transferred_reversed != selected.reversed
            || value.source_face_entity == 0
            || !(1..=value.source_route.len() as u32).contains(&value.source_route_count)
            || value.source_route[..value.source_route_count as usize].contains(&0)
            || value.source_route[value.source_route_count as usize..]
                .iter()
                .any(|label| *label != 0)
        {
            return Err(cylindrical_band_refusal(
                "C1 returned a mismatched or incomplete source-face association.",
            ));
        }
        let value = Rc::new(value);
        self.cylindrical_bands.push(Rc::clone(&value));
        Ok(value)
    }

    /// Additional requested payload capacity, not allocator/RSS or machine
    /// stack accounting. The shared report/kernel storage is already admitted.
    /// Count ALL retained C1 records, not merely the current borrowed pair.
    pub(crate) fn check_cylindrical_band_capacity(
        &self,
        pending: &[u64],
    ) -> Result<(), Evaluation> {
        let other_domains = self.selected_domains.iter().fold(
            (self.selected_domains.capacity() as u64)
                .checked_mul(size_of::<Rc<SelectedContinuousDomain>>() as u64),
            |total, domain| {
                total.and_then(|bytes| {
                    bytes
                        .checked_add(
                            (size_of::<SelectedContinuousDomain>() + 2 * size_of::<usize>()) as u64,
                        )?
                        .checked_add(
                            (domain.domain_face_to_occurrence_face.capacity() as u64)
                                .checked_mul(size_of::<u32>() as u64)?,
                        )?
                        .checked_add(
                            (domain.domain_edge_to_occurrence_edge.capacity() as u64)
                                .checked_mul(size_of::<u32>() as u64)?,
                        )
                })
            },
        );
        let records = (self.cylindrical_bands.len() as u64)
            .checked_mul((size_of::<NominalCylindricalBand>() + 2 * size_of::<usize>()) as u64);
        let retained = (self.cylindrical_bands.capacity() as u64)
            .checked_mul(size_of::<Rc<NominalCylindricalBand>>() as u64)
            .and_then(|pointers| pointers.checked_add(records?))
            .and_then(|bytes| {
                bytes.checked_add(size_of::<Vec<Rc<NominalCylindricalBand>>>() as u64)
            })
            .and_then(|bytes| bytes.checked_add(self.cylindrical_band_output_bytes));
        let requested = retained
            .and_then(|bytes| {
                bytes.checked_add(
                    (self.finite_contact_faces.capacity()
                        * size_of::<Rc<crate::backend::brep::FiniteContactFace>>()
                        + self.finite_contact_faces.len()
                            * (size_of::<crate::backend::brep::FiniteContactFace>()
                                + 2 * size_of::<usize>())) as u64,
                )
            })
            .and_then(|bytes| bytes.checked_add(other_domains?))
            .and_then(|retained| {
                pending
                    .iter()
                    .try_fold(retained, |total, value| total.checked_add(*value))
            });
        if requested.is_none_or(|requested| requested > 256 * 1024) {
            return Err(cylindrical_band_refusal(
                "Simultaneous cylindrical-band clearance capacity exceeds 256 KiB.",
            ));
        }
        Ok(())
    }

    /// Replace the previous live caller charge as proofs move into result
    /// rows. Predicate scratch is a call-local pending reservation, never a
    /// retained charge that leaks into the next phase or the next claim.
    pub(crate) fn set_cylindrical_band_output_bytes(
        &mut self,
        bytes: u64,
    ) -> Result<(), Evaluation> {
        self.cylindrical_band_output_bytes = bytes;
        self.check_cylindrical_band_capacity(&[])
    }

    /// One inventory request plus F+U logical work before counts/result lookup.
    /// Report demand is shared with other family needs in this claim. Repeated
    /// claims replay these debits even though they share one successful result.
    pub(crate) fn edge_treatments(&mut self) -> Result<Rc<EdgeTreatmentInventory>, Evaluation> {
        self.brep_facts()?;
        self.budget
            .charge(1)
            .map_err(|error| Evaluation::budget_exceeded(self.capability, error))?;
        let subject = self.subject();
        let bundle = subject
            .report_bundle()
            .map_err(backend_refusal)?
            .ok_or_else(|| backend_refusal(edge_treatment_unavailable()))?;
        let counts = subject
            .edge_treatment_counts(&bundle)
            .map_err(backend_refusal)?;
        self.budget
            .charge(
                u64::from(counts.public_face_count) + u64::from(counts.candidate_edge_use_count),
            )
            .map_err(|error| Evaluation::budget_exceeded(self.capability, error))?;
        subject
            .edge_treatments(counts, &bundle)
            .map_err(backend_refusal)
    }

    /// One domain request per distinct primary-subject occurrence in this
    /// claim. Record the debit only after it succeeds, before retained lookup.
    pub(crate) fn selected_continuous_domain(
        &mut self,
        occurrence: u32,
    ) -> Result<Rc<SelectedContinuousDomain>, Evaluation> {
        if let Some(value) = self
            .selected_domains
            .iter()
            .find(|value| value.occurrence == occurrence)
        {
            return Ok(Rc::clone(value));
        }
        self.budget
            .charge(1)
            .map_err(|error| Evaluation::budget_exceeded(self.capability, error))?;
        let value = self
            .subject()
            .selected_continuous_domain(occurrence)
            .map_err(backend_refusal)?;
        self.selected_domains.push(Rc::clone(&value));
        // A claim may use entirely different occurrences after the subject's
        // sixteen retained cells fill. Hold and count every live transfer until
        // this ST evaluation ends; repeated roles reuse the same owned record.
        self.subject()
            .check_selected_transfers(&self.selected_domains, self.selected_domains.capacity())
            .map_err(backend_refusal)?;
        Ok(value)
    }
    /// Grid debit is calculated from the same bounded plan on cold and warm
    /// calls, before inspecting the retained topology cell. No Boolean or flood
    /// fill runs on a hit. A miss evicts the previous cell before construction.
    pub(crate) fn continuous_topology(
        &mut self,
        occurrences: &[u32],
        region: Bounds,
    ) -> Result<Rc<Topology>, Evaluation> {
        let mut key = ContinuousTopologyKey {
            occurrences: [0; 16],
            count: 0,
            region: [
                region.min[0],
                region.min[1],
                region.min[2],
                region.max[0],
                region.max[1],
                region.max[2],
            ]
            .map(|value| if value == 0.0 { 0 } else { value.to_bits() }),
        };
        for &occurrence in occurrences {
            if key.occurrences[..key.count].contains(&occurrence) {
                continue;
            }
            if key.count == key.occurrences.len() {
                return Err(continuous_refusal(continuous::ContinuousError::unsupported(
                    "The nominal continuous void profile accepts at most 16 distinct materials.",
                )));
            }
            key.occurrences[key.count] = occurrence;
            key.count += 1;
        }
        let mut materials = Vec::with_capacity(key.count);
        for &occurrence in &key.occurrences[..key.count] {
            materials.push((*self.selected_continuous_domain(occurrence)?).clone());
        }
        let material_bytes = (materials.capacity() * size_of::<SelectedContinuousDomain>()) as u64
            + materials
                .iter()
                .map(|value| {
                    ((value.domain_face_to_occurrence_face.capacity()
                        + value.domain_edge_to_occurrence_edge.capacity())
                        * size_of::<u32>()) as u64
                })
                .sum::<u64>();
        let plan = GridPlan::new(&materials, region).map_err(continuous_refusal)?;
        self.check_continuous_output(material_bytes.saturating_add(plan.owned_bytes() as u64))?;
        let units = plan.grid_units().map_err(continuous_refusal)?;
        self.budget
            .charge(units)
            .map_err(|error| Evaluation::budget_exceeded(self.capability, error))?;
        if let Some(value) = self
            .subject()
            .continuous_topology
            .borrow()
            .as_ref()
            .filter(|cell| cell.key == key)
        {
            return Ok(Rc::clone(&value.value));
        }
        self.subject().continuous_topology.borrow_mut().take();
        let build_bytes = plan
            .projected_owned_build_bytes()
            .map_err(continuous_refusal)?;
        self.check_continuous_output(material_bytes.saturating_add(build_bytes as u64))?;
        drop(materials);
        let value = Rc::new(plan.build().map_err(continuous_refusal)?);
        let cell = RetainedContinuousTopology {
            key,
            value: Rc::clone(&value),
        };
        self.check_continuous_output(cell.owned_bytes())?;
        *self.subject().continuous_topology.borrow_mut() = Some(cell);
        Ok(value)
    }

    /// Count typed and projected witness output while the current claim still
    /// holds uncached selected transfers. This is owned payload, not RSS.
    pub(crate) fn check_continuous_output(&self, bytes: u64) -> Result<(), Evaluation> {
        self.subject()
            .check_continuous_pending(
                &self.selected_domains,
                self.selected_domains.capacity(),
                bytes,
            )
            .map_err(backend_refusal)
    }
}

pub(crate) fn backend_refusal(error: BackendError) -> Evaluation {
    Evaluation::Refused {
        diagnostics: vec![Diagnostic::error(
            match error.kind {
                BackendErrorKind::InvalidInput => "GEOSPEC_INVALID_EVIDENCE",
                BackendErrorKind::Unsupported => "GEOSPEC_UNSUPPORTED_EVIDENCE",
                BackendErrorKind::ComputationFailed => "GEOSPEC_BACKEND_FAILED",
                BackendErrorKind::BudgetExceeded { .. } => "MATCHER_TIMEOUT",
            },
            error.message,
        )],
    }
}

fn cylindrical_band_refusal(message: &str) -> Evaluation {
    let mut diagnostic = Diagnostic::error("GEOSPEC_EVIDENCE_UNSUPPORTED", message);
    diagnostic.suggestion = Some(
        "Select qualified occurrence-local cylindrical faces and keep the simultaneous clearance evidence within 256 KiB; no whole-shape or nearest-face fallback is used.".into(),
    );
    diagnostic.details = Some(Json::object([
        (
            "profile",
            Json::string("geospec-nominal-cylindrical-band-clearance-v1"),
        ),
        ("capacityBytes", Json::Number(256.0 * 1024.0)),
    ]));
    Evaluation::Refused {
        diagnostics: vec![diagnostic],
    }
}

/// Preserve inability to establish the declared domain as noninvertible.
pub(crate) fn continuous_refusal(error: continuous::ContinuousError) -> Evaluation {
    let code = match error.kind {
        continuous::ContinuousErrorKind::InvalidInput => "GEOSPEC_INVALID_EVIDENCE",
        continuous::ContinuousErrorKind::UnsupportedDomain => "GEOSPEC_EVIDENCE_UNSUPPORTED",
        continuous::ContinuousErrorKind::ArithmeticLimit
        | continuous::ContinuousErrorKind::ResourceLimit => "GEOSPEC_UNSUPPORTED_EVIDENCE",
    };
    Evaluation::Refused {
        diagnostics: vec![Diagnostic::error(code, error.message)],
    }
}
