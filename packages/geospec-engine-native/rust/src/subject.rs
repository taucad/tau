//! Retained source records and thread-confined shared analysis.

use std::{
    cell::{OnceCell, RefCell},
    mem::size_of,
    rc::Rc,
};

use crate::{
    analysis::{
        batch::BatchAnalysis,
        mesh::{
            analyze, analyze_indexed, ConnectedComponents, MeshAnalysis, MeshAnalysisRecord,
            Primitive,
        },
        selection::{build_report_index, SelectorIndex},
    },
    backend::{
        brep::{
            BrepEntity, BrepSubject, ContinuousWallDomain, DocumentFacts, ReportedBrepBundle,
            TessellationProfile,
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

/// One immutable source/profile identity. Heavy facts remain explicitly lazy.
pub(crate) struct Subject {
    pub content_hash: String,
    /// Full-format descriptor digest, set once after verified admission.
    /// Raw GSM1 retains its separate original hash namespace.
    pub semantic_identity: OnceCell<SubjectIdentity>,
    pub format: SubjectFormat,
    pub source_unit: String,
    pub rational_plate: Option<crate::certificates::engine::RationalSubject>,
    pub display_name: String,
    pub diagnostics: Vec<Diagnostic>,
    pub retention_limits: crate::backend::AnalysisRetentionLimits,
    overlap_components: OnceCell<Rc<crate::analysis::interference::PreparedComponents>>,
    component_labels: OnceCell<Rc<Vec<crate::analysis::interference::ComponentIdentity>>>,
    pub mesh_record: OnceCell<Rc<MeshAnalysisRecord>>,
    pub brep: Option<Box<dyn BrepSubject>>,
    mesh_analysis: OnceCell<Rc<MeshAnalysis>>,
    report_bundle: OnceCell<Rc<ReportedBrepBundle>>,
    report_bytes: OnceCell<u64>,
    continuous_wall: OnceCell<Rc<ContinuousWallDomain>>,
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

impl Subject {
    pub(crate) fn new(content_hash: String, format: SubjectFormat, source_unit: String) -> Self {
        Self {
            content_hash,
            semantic_identity: OnceCell::new(),
            format,
            source_unit,
            rational_plate: None,
            display_name: "step".into(),
            diagnostics: Vec::new(),
            retention_limits: crate::EngineConfig::entry().analysis,
            overlap_components: OnceCell::new(),
            component_labels: OnceCell::new(),
            mesh_record: OnceCell::new(),
            brep: None,
            mesh_analysis: OnceCell::new(),
            report_bundle: OnceCell::new(),
            report_bytes: OnceCell::new(),
            continuous_wall: OnceCell::new(),
            binary_limits: crate::EngineConfig::entry().binary,
            selector_index: OnceCell::new(),
            tessellations: RefCell::new(Vec::new()),
        }
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
                .saturating_add(self.continuous_wall_bytes()),
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
            return Ok(format!("geospec-subject-v1:{}", identity.hash()));
        }
        if self.format == SubjectFormat::MeshBufferV1 {
            return Ok(format!("mesh-f32-bounds-v1:{}", self.content_hash));
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
            .saturating_add(self.continuous_wall_bytes())
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
            bytes.saturating_add(self.report_bytes.get().copied().unwrap_or(0)),
            |sum, entry| sum.saturating_add(entry.bytes),
        );
        if retained > self.retention_limits.max_mesh_bytes {
            return Err(report_limit());
        }
        let value = Rc::new(brep.continuous_wall_domain(BrepEntity::Whole)?);
        let _ = self.continuous_wall.set(Rc::clone(&value));
        Ok(value)
    }

    fn continuous_wall_bytes(&self) -> u64 {
        if self.continuous_wall.get().is_some() {
            continuous_wall_owned_bytes()
        } else {
            0
        }
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

fn continuous_wall_owned_bytes() -> u64 {
    (size_of::<ContinuousWallDomain>() + 2 * size_of::<usize>()) as u64
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

    pub(crate) fn primary(&self) -> Option<&Subject> {
        self.subjects.first().map(Rc::as_ref)
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
