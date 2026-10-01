//! Retained source records and thread-confined shared analysis.

use crate::protocol::{EvidenceProfile, Observations, WorkCounter};
use std::{
    cell::{Cell, OnceCell, RefCell},
    mem::size_of,
    rc::Rc,
};

use crate::{
    analysis::{
        batch::{BatchAnalysis, ExactClusters},
        continuous::{self, GridPlan, Topology},
        mesh::{
            analyze, analyze_indexed, exact::ChargeTrace, ClusterReport, ConnectedComponents,
            MeshAnalysis, MeshAnalysisRecord, Primitive,
        },
        selection::{build_report_index, SelectorIndex},
    },
    backend::{
        brep::{
            Bounds, BrepAdmissionFacts, BrepEntity, BrepSubject, CircularBoreDisposition,
            CircularBoreInventory, CircularBoreTermination, ContinuousWallDomain,
            ContinuousWallShape, DocumentRows, EdgeTreatmentCounts, EdgeTreatmentDisposition,
            EdgeTreatmentInventory, EdgeTreatmentKind, LocatedFace, NominalCylindricalBand,
            OccurrenceFacts, OperandMemo, RegularSolidContainment, ReportedFaces,
            SelectedContinuousDomain, ShapeFacts, ShapeParts, StepSubjectMetadata, SurfaceFacts,
            TessellationProfile, MAX_CIRCULAR_BORE_CANDIDATES, MAX_CIRCULAR_BORE_OWNED_BYTES,
        },
        csg_scope::CsgScope,
        BackendError, BackendErrorKind, TriangleMesh,
    },
    budget::Budget,
    codec::Json,
    identity::SubjectIdentity,
    registry::Capability,
    result::{Diagnostic, Evaluation, Polarity},
};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum SubjectFormat {
    MeshBufferV1,
    Glb,
    Gltf,
    Step,
    RationalPlate,
}

#[cfg(test)]
mod exact_candidate_control_tests {
    use super::*;
    use crate::{
        analysis::mesh::exact::{ChargeStage, ChargeStep},
        backend::brep::{BrepIdentityProfile, Charge, ComponentBodies, ValidityFacts},
        cache::{exact_clusters, ProducerIdentity},
        identity::SubjectIdentity,
        protocol::Engine,
    };

    struct EmptyBodies;

    impl ComponentBodies for EmptyBodies {
        fn bodies(&self) -> &[crate::backend::brep::ComponentBody] {
            &[]
        }
        fn faces_within(
            &self,
            _: usize,
            _: &[u32],
            _: usize,
            _: &[u32],
            _: f64,
            _: &mut Charge<'_>,
        ) -> Result<Option<bool>, BackendError> {
            unreachable!()
        }
        fn body_inside(
            &self,
            _: usize,
            _: usize,
            _: &mut Charge<'_>,
        ) -> Result<Option<crate::backend::brep::PointState>, BackendError> {
            unreachable!()
        }
        fn bodies_within(&self, _: usize, _: usize, _: f64) -> Result<bool, BackendError> {
            unreachable!()
        }
    }

    struct CountedBrep(Rc<Cell<u32>>, u64);

    impl BrepSubject for CountedBrep {
        fn classify_face_points(
            &self,
            _: BrepEntity,
            _: &[[f64; 3]],
            _: f64,
        ) -> Result<Vec<crate::backend::brep::PointState>, BackendError> {
            unreachable!()
        }
        fn tessellate(
            &self,
            _: BrepEntity,
            _: TessellationProfile,
        ) -> Result<Rc<TriangleMesh>, BackendError> {
            unreachable!()
        }
        fn faces(&self) -> Result<Rc<[LocatedFace]>, BackendError> {
            unreachable!()
        }
        fn validity(&self) -> Result<Rc<ValidityFacts>, BackendError> {
            unreachable!()
        }
        fn source_occurrences(&self) -> Result<Rc<[OccurrenceFacts]>, BackendError> {
            Ok(Rc::from([]))
        }
        fn component_bodies(
            &self,
            _: &[u32],
            charge: &mut Charge<'_>,
        ) -> Result<Option<Box<dyn ComponentBodies + '_>>, BackendError> {
            self.0.set(self.0.get() + 1);
            Ok(charge(self.1).then(|| Box::new(EmptyBodies) as Box<dyn ComponentBodies>))
        }
    }

    fn subject(calls: Rc<Cell<u32>>, retained: bool) -> Subject {
        subject_with_charge(calls, retained, 3)
    }

    fn subject_with_charge(calls: Rc<Cell<u32>>, retained: bool, charge: u64) -> Subject {
        let identity = SubjectIdentity::step(
            b"private-candidate-step",
            "millimetre",
            1.0,
            BrepIdentityProfile {
                ingest_profile: "candidate-test",
                backend_profile: "candidate-test",
            },
            None,
        )
        .unwrap();
        let mut subject = Subject::new(
            identity.primary_hash().into(),
            SubjectFormat::Step,
            "mm".into(),
        );
        subject.semantic_identity.set(identity).unwrap();
        subject.producer_identity = Some(Rc::new(ProducerIdentity {
            core: "core-v1".into(),
            csg: "csg-v1".into(),
            brep: "brep-v1".into(),
        }));
        subject.brep = Some(Box::new(CountedBrep(calls, charge)));
        if retained {
            assert!(subject
                .exact_components
                .set((0.01_f64.to_bits(), Rc::new(completed())))
                .is_ok());
        }
        subject
    }

    fn completed() -> ExactClusters {
        ExactClusters {
            clusters: vec![],
            labels: vec![],
            units: 3,
            trace: vec![ChargeStep {
                units: 3,
                pair: None,
                stage: ChargeStage::BodySetup,
            }
            .into()],
            trace_complete: true,
            stage_calls: [1, 0, 0, 0, 0, 0],
            stage_units: [3, 0, 0, 0, 0, 0],
        }
    }

    fn compare(engine: &Engine, candidate: serde_json::Value) -> serde_json::Value {
        compare_for(engine, &public_hash(engine), candidate)
    }

    fn compare_for(engine: &Engine, hash: &str, candidate: serde_json::Value) -> serde_json::Value {
        let control = serde_json::json!({"_tauNativeExactClusterCandidateV1": {
            "operation":"compare", "subjectHash":hash, "toleranceMm":0.01,
            "candidate":candidate,
        }});
        let bytes = crate::canonicalize(&serde_json::to_vec(&control).unwrap()).unwrap();
        serde_json::from_slice(
            &engine
                .process_exact_cluster_candidate_control(&bytes)
                .unwrap(),
        )
        .unwrap()
    }

    fn export(engine: &Engine) -> serde_json::Value {
        export_for(engine, &public_hash(engine))
    }

    fn export_for(engine: &Engine, hash: &str) -> serde_json::Value {
        let control = serde_json::json!({"_tauNativeExactClusterCandidateV1": {
            "operation":"export", "subjectHash":hash, "toleranceMm":0.01,
        }});
        let bytes = crate::canonicalize(&serde_json::to_vec(&control).unwrap()).unwrap();
        serde_json::from_slice(
            &engine
                .process_exact_cluster_candidate_control(&bytes)
                .unwrap(),
        )
        .unwrap()
    }

    fn public_hash(engine: &Engine) -> String {
        engine
            .subjects
            .values()
            .next()
            .unwrap()
            .semantic_identity
            .get()
            .unwrap()
            .hash()
            .into()
    }

    fn admit(engine: &mut Engine, subject: Subject) {
        let key = subject.cache_identity().unwrap();
        assert_ne!(key, subject.semantic_identity.get().unwrap().hash());
        engine.subjects.insert(key, Rc::new(subject));
    }

    #[test]
    fn private_compare_uses_owned_fact_or_recomputes_without_installing_foreign_fact() {
        let calls = Rc::new(Cell::new(0));
        let fresh = subject(Rc::clone(&calls), false);
        let bytes = exact_clusters::export_candidate(&fresh, 0.01, &completed()).unwrap();
        let candidate = serde_json::from_slice(&bytes).unwrap();
        let mut engine = Engine::new();
        admit(&mut engine, fresh);
        assert!(export(&engine)["candidate"].is_null());
        let first = compare(&engine, candidate);
        assert_eq!(first["matched"], true);
        assert_eq!(first["recomputedUnits"], "3");
        assert_eq!(calls.get(), 1);
        let mut tampered = first_candidate(&engine);
        tampered["payload"]["units"] = serde_json::json!("4");
        assert_eq!(compare(&engine, tampered)["matched"], false);
        assert_eq!(calls.get(), 2);
        // The foreign bytes did not populate the subject's exact slot.
        let second = compare(&engine, first_candidate(&engine));
        assert_eq!(second["matched"], true);
        assert_eq!(calls.get(), 3);

        let resident_calls = Rc::new(Cell::new(0));
        let resident = subject(Rc::clone(&resident_calls), true);
        let candidate = serde_json::from_slice(
            &exact_clusters::export_candidate(&resident, 0.01, &completed()).unwrap(),
        )
        .unwrap();
        admit(&mut engine, resident);
        assert_eq!(export(&engine)["candidate"], candidate);
        let response = compare(&engine, candidate);
        assert_eq!(response["matched"], true);
        assert_eq!(response["recomputedUnits"], "0");
        assert_eq!(
            compare(&engine, first_candidate(&engine))["recomputedUnits"],
            "0"
        );
        assert_eq!(resident_calls.get(), 0);
    }

    #[test]
    fn private_compare_refuses_over_budget_cold_recompute() {
        let calls = Rc::new(Cell::new(0));
        let fresh = subject_with_charge(Rc::clone(&calls), false, 8_000_001);
        let candidate = serde_json::from_slice(
            &exact_clusters::export_candidate(&fresh, 0.01, &completed()).unwrap(),
        )
        .unwrap();
        let mut engine = Engine::new();
        admit(&mut engine, fresh);
        let response = compare(&engine, candidate);
        assert_eq!(response["matched"], false);
        // A refused first charge does not count as accepted work.
        assert_eq!(response["recomputedUnits"], "0");
        assert_eq!(calls.get(), 1);
    }

    #[test]
    fn private_control_resolves_only_the_admitted_step_public_hash() {
        let calls = Rc::new(Cell::new(0));
        let resident = subject(Rc::clone(&calls), true);
        let content_hash = resident.content_hash.clone();
        let mut engine = Engine::new();
        admit(&mut engine, resident);
        let public = public_hash(&engine);
        let internal = engine.subjects.keys().next().unwrap().clone();
        assert_ne!(public, content_hash);
        let candidate = export(&engine)["candidate"].clone();
        assert_eq!(candidate["schema"], "geospec-exact-cluster-candidate-v1");
        assert_eq!(compare(&engine, candidate.clone())["matched"], true);
        assert_eq!(compare(&engine, candidate.clone())["recomputedUnits"], "0");
        for wrong in [&"0".repeat(64), &content_hash, &internal] {
            assert!(export_for(&engine, wrong)["candidate"].is_null());
            let result = compare_for(&engine, wrong, candidate.clone());
            assert_eq!(result["matched"], false);
            assert_eq!(result["recomputedUnits"], "0");
        }
        assert_eq!(calls.get(), 0);
    }

    #[test]
    fn private_compare_refuses_tampered_or_foreign_identity_before_geometry() {
        let calls = Rc::new(Cell::new(0));
        let fresh = subject(Rc::clone(&calls), false);
        let mut candidate: serde_json::Value = serde_json::from_slice(
            &exact_clusters::export_candidate(&fresh, 0.01, &completed()).unwrap(),
        )
        .unwrap();
        let mut engine = Engine::new();
        admit(&mut engine, fresh);

        candidate["address"]["producerProfileSha256"] = serde_json::json!("00".repeat(32));
        assert_eq!(compare(&engine, candidate.clone())["matched"], false);
        assert_eq!(calls.get(), 0);

        candidate["address"]["producerProfileSha256"] = serde_json::json!(
            exact_clusters::address(engine.subjects.values().next().unwrap(), 0.01)
                .unwrap()
                .producer_profile_sha256
        );
        candidate["action"]["toleranceBits"] = serde_json::json!("0000000000000000");
        assert_eq!(compare(&engine, candidate)["matched"], false);
        assert_eq!(calls.get(), 0);
    }

    #[test]
    fn private_control_refuses_oversize_input_before_parsing() {
        let engine = Engine::new();
        let oversized = vec![b' '; exact_clusters::MAX_CANDIDATE_BYTES + 1025];
        let error = engine
            .process_exact_cluster_candidate_control(&oversized)
            .unwrap_err();
        assert_eq!(error.kind, crate::ErrorKind::InvalidRequest);
    }

    #[test]
    fn ordinary_processor_refuses_private_control() {
        let engine = Engine::new();
        let control = serde_json::json!({"_tauNativeExactClusterCandidateV1": {
            "operation":"export", "subjectHash":"admitted", "toleranceMm":0.01,
        }});
        let bytes = crate::canonicalize(&serde_json::to_vec(&control).unwrap()).unwrap();
        assert!(engine.process_request(&bytes).is_err());
    }

    fn first_candidate(engine: &Engine) -> serde_json::Value {
        let subject = engine.subjects.values().next().unwrap();
        serde_json::from_slice(
            &exact_clusters::export_candidate(subject, 0.01, &completed()).unwrap(),
        )
        .unwrap()
    }
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
    pub(crate) observations: Rc<Observations>,
    pub content_hash: String,
    /// Full-format descriptor digest, set once after verified admission.
    /// Raw GSM1 retains its separate original hash namespace.
    pub semantic_identity: OnceCell<SubjectIdentity>,
    pub format: SubjectFormat,
    pub source_unit: String,
    /// Declared STEP source axis frame; non-STEP subjects stay z-up.
    pub(crate) step_source_frame: String,
    /// Verified source metadata from successful STEP admission, not report generation.
    pub(crate) step_admission_facts: Option<BrepAdmissionFacts>,
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
    /// S10: the work units of the exact leaf boxes, charged by every claim.
    overlap_box_units: OnceCell<u64>,
    component_labels: OnceCell<Rc<Vec<crate::analysis::interference::ComponentIdentity>>>,
    pub mesh_record: OnceCell<Rc<MeshAnalysisRecord>>,
    pub brep: Option<Box<dyn BrepSubject>>,
    mesh_analysis: OnceCell<Rc<MeshAnalysis>>,
    /// M2 exact STEP clusters at one tolerance (`BatchAnalysis::exact_clusters`):
    /// one result per subject, at most the analysis retention bytes, never read
    /// by a retention check (C8: bounded and excluded by design, as the mesh
    /// analysis's retained components are).
    exact_components: OnceCell<(u64, Rc<ExactClusters>)>,
    /// Accounted bytes of the report mesh, retained once as `mesh_record` (F9).
    report_mesh_bytes: OnceCell<u64>,
    /// Report facts facet: whole-shape facts on the source (F1), one cell per
    /// demanded `ShapeParts` set, indexed by its bits.
    report_shape: [OnceCell<ShapeFacts>; 16],
    /// C8: the last claim phase that demanded each `ShapeParts` set, indexed
    /// by its bits; never stamped reads `u64::MAX`.
    shape_demands: [Cell<u64>; 16],
    /// Report face tables (F5); a measured transfer replaces an address one.
    report_faces: RefCell<Option<RetainedReportFaces>>,
    /// Structure-only occurrences are replaced once bounds are demanded.
    source_occurrences: RefCell<Option<RetainedSourceOccurrences>>,
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
    /// C8 (ruling 12, §16): the current claim phase. A retention limit counts
    /// the facets this phase demanded (hit or build), never what earlier
    /// claims retained; a facet's cell holds the last phase that demanded it.
    demand_phase: Cell<u64>,
    facet_demands: [Cell<u64>; FACETS],
    selected_demands: [Cell<u64>; 16],
    material_transfer_bytes: Cell<u64>,
}

/// Retained singleton facets whose bytes count toward a phase's demand.
#[derive(Clone, Copy)]
enum Facet {
    ReportMesh,
    ReportFaces,
    SourceOccurrences,
    CircularBores,
    EdgeTreatmentCounts,
    EdgeTreatments,
    StepMetadata,
    ContinuousWall,
    ContinuousTopology,
    MeshMaterial,
    MeshSelector,
}

const FACETS: usize = Facet::MeshSelector as usize + 1;

/// Only the core retains derived meshes; adapters return an owned transfer.
struct RetainedTessellation {
    entity: BrepEntity,
    linear_bits: u64,
    angular_bits: u64,
    mesh: Rc<TriangleMesh>,
    bytes: u64,
    /// The last claim phase that demanded this mesh (C8).
    demand: Cell<u64>,
}

struct RetainedReportFaces {
    faces: Rc<ReportedFaces>,
    /// False for address tables, whose integrals and boxes are unmeasured.
    measured: bool,
    bytes: u64,
}

struct RetainedSourceOccurrences {
    facts: Rc<[OccurrenceFacts]>,
    /// False for the structure route, whose `bounds` are unmeasured.
    bounds: bool,
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
            observations: Rc::default(),
            content_hash,
            semantic_identity: OnceCell::new(),
            format,
            source_unit,
            step_source_frame: "z-up".into(),
            step_admission_facts: None,
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
            overlap_box_units: OnceCell::new(),
            component_labels: OnceCell::new(),
            mesh_record: OnceCell::new(),
            brep: None,
            mesh_analysis: OnceCell::new(),
            exact_components: OnceCell::new(),
            report_mesh_bytes: OnceCell::new(),
            report_shape: std::array::from_fn(|_| OnceCell::new()),
            shape_demands: std::array::from_fn(|_| Cell::new(u64::MAX)),
            report_faces: RefCell::new(None),
            source_occurrences: RefCell::new(None),
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
            demand_phase: Cell::new(0),
            facet_demands: std::array::from_fn(|_| Cell::new(0)),
            selected_demands: std::array::from_fn(|_| Cell::new(0)),
            material_transfer_bytes: Cell::new(0),
        }
    }

    /// Start a claim phase (C8): later limit checks count only what this phase
    /// demands. Phase 0, before any plan, counts every retained facet.
    pub(crate) fn begin_demand_phase(&self) {
        self.demand_phase.set(self.demand_phase.get() + 1);
        self.material_transfer_bytes.set(0);
    }

    fn demand(&self, facet: Facet) {
        self.facet_demands[facet as usize].set(self.demand_phase.get());
    }

    fn demanded(&self, facet: Facet) -> bool {
        self.facet_demands[facet as usize].get() == self.demand_phase.get()
    }

    /// The report facets this phase demanded: the mesh and face tables when
    /// demanded, and one facts cell per part set the phase demanded that no
    /// earlier set of the phase covers, whichever retained cell answered it
    /// (never what earlier claims' part sets left retained).
    fn demanded_report_bytes(&self) -> u64 {
        let mesh = self.report_mesh_bytes.get().copied().unwrap_or(0);
        let faces = self
            .report_faces
            .borrow()
            .as_ref()
            .map_or(0, |value| value.bytes);
        let phase = self.demand_phase.get();
        let shape = self
            .shape_demands
            .iter()
            .filter(|demand| demand.get() == phase)
            .count() as u64
            * size_of::<ShapeFacts>() as u64;
        [(Facet::ReportMesh, mesh), (Facet::ReportFaces, faces)]
            .into_iter()
            .filter(|(facet, _)| self.demanded(*facet))
            .fold(shape, |sum, (_, bytes)| sum.saturating_add(bytes))
    }

    fn demanded_tessellations(&self) -> (u64, u64) {
        let phase = self.demand_phase.get();
        self.tessellations
            .borrow()
            .iter()
            .filter(|entry| entry.demand.get() == phase)
            .fold((0, 0), |(count, bytes), entry| {
                (count + 1, bytes.saturating_add(entry.bytes))
            })
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

    pub(crate) fn completed_exact_clusters(&self, tolerance: f64) -> Option<&ExactClusters> {
        let bits = if tolerance == 0.0 {
            0
        } else {
            tolerance.to_bits()
        };
        self.exact_components
            .get()
            .filter(|(key, value)| *key == bits && value.trace_complete)
            .map(|(_, value)| value.as_ref())
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
                entry.demand.set(self.demand_phase.get());
                return Ok(Rc::clone(&entry.mesh));
            }
        }
        let report_entry =
            u64::from(self.report_mesh_bytes.get().is_some() && self.demanded(Facet::ReportMesh));
        if self.demanded_tessellations().0 + report_entry
            >= u64::from(self.retention_limits.max_mesh_entries)
        {
            return Err(BackendError {
                kind: BackendErrorKind::Unsupported,
                message: "Tessellation demands exceed the declared analysis retention entry limit."
                    .into(),
            });
        }
        let brep = self.brep.as_deref().ok_or_else(|| BackendError {
            kind: BackendErrorKind::Unsupported,
            message: "The retained subject has no BRep tessellation connector.".into(),
        })?;
        self.observations.add(WorkCounter::Tessellations, 1);
        let mesh = brep.tessellate(entity, profile)?;
        let bytes = (size_of::<TriangleMesh>() as u64)
            .saturating_add(
                (mesh.positions.capacity() as u64).saturating_mul(size_of::<[f64; 3]>() as u64),
            )
            .saturating_add(
                (mesh.triangles.capacity() as u64).saturating_mul(size_of::<[u32; 3]>() as u64),
            );
        let total = bytes
            .saturating_add(self.demanded_tessellations().1)
            .saturating_add(self.demanded_report_bytes())
            .saturating_add(self.continuous_owned_bytes())
            .saturating_add(self.f2_owned_bytes())
            .saturating_add(self.circular_bore_owned_bytes())
            .saturating_add(self.edge_treatment_owned_bytes())
            .saturating_add(self.step_metadata_owned_bytes())
            .saturating_add(self.source_occurrence_owned_bytes());
        if total > self.retention_limits.max_mesh_bytes {
            return Err(BackendError {
                kind: BackendErrorKind::Unsupported,
                message: "Tessellations exceed the declared analysis retention byte limit.".into(),
            });
        }
        let phase = self.demand_phase.get();
        let mut retained = self.tessellations.borrow_mut();
        // Physical retention only (C8): meshes this phase does not hold give way,
        // oldest first. ponytail: singleton facets are never evicted, so the
        // physical bound is the limits plus the singletons; evict them too if
        // resident memory ever matters more than their reuse.
        let report_entry = u64::from(self.report_mesh_bytes.get().is_some());
        let mut held = retained
            .iter()
            .fold(bytes, |sum, entry| sum.saturating_add(entry.bytes));
        while retained.len() as u64 + 1 + report_entry
            > u64::from(self.retention_limits.max_mesh_entries)
            || held > self.retention_limits.max_mesh_bytes
        {
            let Some(index) = retained
                .iter()
                .position(|entry| entry.demand.get() != phase)
            else {
                break;
            };
            held -= retained.remove(index).bytes;
        }
        retained.push(RetainedTessellation {
            entity,
            linear_bits,
            angular_bits,
            mesh: Rc::clone(&mesh),
            bytes,
            demand: Cell::new(phase),
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

    /// S10: M2's face-box price of the exact leaf boxes, from structure, so a
    /// claim charges it before `overlap_components` measures them.
    pub(crate) fn overlap_box_units(&self) -> Result<u64, BackendError> {
        if let Some(units) = self.overlap_box_units.get() {
            return Ok(*units);
        }
        let units = crate::analysis::interference::box_units(self)?;
        let _ = self.overlap_box_units.set(units);
        Ok(units)
    }

    pub(crate) fn overlap_components(
        &self,
    ) -> Result<Rc<crate::analysis::interference::PreparedComponents>, BackendError> {
        self.cache_identity()?;
        if let Some(value) = self.overlap_components.get() {
            self.observations.add(WorkCounter::DerivedHits, 1);
            return Ok(Rc::clone(value));
        }
        let value = Rc::new(crate::analysis::interference::prepare_components(self)?);
        self.observations.add(WorkCounter::ComponentBuilds, 1);
        let _ = self.overlap_components.set(Rc::clone(&value));
        Ok(value)
    }

    pub(crate) fn material_regions(
        &self,
        budget: &Budget,
    ) -> Result<Rc<Vec<crate::analysis::mesh::material::MaterialRegion>>, BackendError> {
        self.mark_material_demand();
        let regions = crate::analysis::interference::material_regions(self, budget)?;
        self.material_transfer_bytes
            .set(self.material_transfer_bytes.get().max(
                crate::analysis::interference::material_region_live_bytes(self, &regions)?,
            ));
        Ok(regions)
    }

    pub(crate) fn mark_material_demand(&self) {
        self.demand(Facet::MeshMaterial);
    }

    pub(crate) fn demanded_material_bytes(&self) -> u64 {
        let material = if self.demanded(Facet::MeshMaterial) {
            self.material_transfer_bytes.get().max(
                self.overlap_components.get().map_or(0, |owner| {
                    crate::analysis::interference::material_owned_bytes(owner)
                }),
            )
        } else {
            0
        };
        let index = if self.demanded(Facet::MeshSelector) {
            self.selector_index.get().map_or(0, |index| {
                crate::analysis::selection::mesh_index_owned_bytes(index)
            })
        } else {
            0
        };
        material.saturating_add(index)
    }

    pub(crate) fn region_boundary_distance(
        &self,
        left: &crate::analysis::mesh::material::MaterialRegion,
        right: &crate::analysis::mesh::material::MaterialRegion,
        budget: &Budget,
        pending_bytes: u64,
    ) -> Result<(num_rational::BigRational, Option<[f64; 3]>), BackendError> {
        self.mark_material_demand();
        if self
            .retention_limits
            .max_mesh_bytes
            .saturating_sub(self.demanded_material_bytes())
            .saturating_sub(pending_bytes)
            < 640 * 1024
        {
            return Err(BackendError {
                kind: BackendErrorKind::Unsupported,
                message: "Material boundary workspace exceeds the declared analysis byte limit."
                    .into(),
            });
        }
        let record = self.mesh_record().ok_or_else(|| BackendError {
            kind: BackendErrorKind::Unsupported,
            message: "Material boundary evidence is absent.".into(),
        })?;
        crate::analysis::mesh::material::region_boundary_distance(record, left, right, budget)
    }

    pub(crate) fn region_overlap(
        &self,
        left: &crate::analysis::mesh::material::MaterialRegion,
        right: &crate::analysis::mesh::material::MaterialRegion,
        budget: &Budget,
        pending_bytes: u64,
    ) -> Result<num_rational::BigRational, BackendError> {
        self.mark_material_demand();
        if self
            .retention_limits
            .max_mesh_bytes
            .saturating_sub(self.demanded_material_bytes())
            .saturating_sub(pending_bytes)
            < crate::analysis::mesh::material_intersection::WORKSPACE_BYTES
        {
            return Err(BackendError {
                kind: BackendErrorKind::Unsupported,
                message:
                    "Material intersection workspace exceeds the declared analysis byte limit."
                        .into(),
            });
        }
        crate::analysis::interference::region_overlap(self, left, right, budget, pending_bytes)
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

    /// The report mesh facet alone, retained once as the analysis record (F9):
    /// its vectors move into the record after the finite f32 check. A report
    /// facts failure cannot refuse mesh claims.
    pub(crate) fn report_mesh(&self) -> Result<(), BackendError> {
        self.demand(Facet::ReportMesh);
        let Some(brep) = &self.brep else {
            return Ok(());
        };
        self.cache_identity()?;
        if self.report_mesh_bytes.get().is_some() {
            self.observations.add(WorkCounter::DerivedHits, 1);
            return Ok(());
        }
        let mesh = brep.reported_mesh()?;
        let count = mesh.triangles.len();
        let vertices = count.checked_mul(3).ok_or_else(report_limit)?;
        if count as u64 > u64::from(self.binary_limits.max_triangles)
            || vertices as u64 > u64::from(self.binary_limits.max_vertices)
        {
            return Err(report_limit());
        }
        let occurrences = self
            .step_admission_facts
            .as_ref()
            .map_or(0, |facts| facts.occurrence_count);
        if occurrences as u64 > u64::from(self.binary_limits.max_occurrences) {
            return Err(report_limit());
        }
        // Accounted as the f32 soup record alone: 88 B per triangle (ruling 14).
        let bytes = (vertices as u64)
            .saturating_mul(24)
            .saturating_add((count as u64).saturating_mul(16))
            .saturating_add(size_of::<MeshAnalysisRecord>() as u64)
            .saturating_add(size_of::<Primitive>() as u64)
            .saturating_add(self.display_name.len() as u64 + 2);
        if self.demanded_tessellations().0 >= u64::from(self.retention_limits.max_mesh_entries) {
            return Err(report_limit());
        }
        self.check_f2_pending(bytes)?;
        let record = report_mesh_record(mesh, &self.display_name)?;
        // Publish only after the transfer, validation and accounting succeed.
        let _ = self.mesh_record.set(Rc::new(record));
        let _ = self.report_mesh_bytes.set(bytes);
        self.observations.add(WorkCounter::MeshRecords, 1);
        Ok(())
    }

    /// The report facts facet measuring `parts` (F1): whole-shape facts of the
    /// source shape, with no copy or mesh, so the report-mesh limits never
    /// refuse it. A retained cell covering `parts` answers; only the requested
    /// parts may be read.
    pub(crate) fn report_shape(
        &self,
        parts: ShapeParts,
    ) -> Result<Option<&ShapeFacts>, BackendError> {
        let Some(brep) = &self.brep else {
            return Ok(None);
        };
        self.cache_identity()?;
        let wanted = usize::from(parts.bits());
        let phase = self.demand_phase.get();
        if let Some(bits) = (wanted..self.report_shape.len())
            .find(|bits| bits & wanted == wanted && self.report_shape[*bits].get().is_some())
        {
            // C8 (ruling 12): the phase accounts the set it demanded, so an
            // earlier claim's retained cell never changes its bytes.
            let covered = (wanted..self.shape_demands.len())
                .any(|bits| bits & wanted == wanted && self.shape_demands[bits].get() == phase);
            if !covered {
                self.check_f2_pending(size_of::<ShapeFacts>() as u64)?;
                self.shape_demands[wanted].set(phase);
            }
            self.observations.add(WorkCounter::DerivedHits, 1);
            return Ok(self.report_shape[bits].get());
        }
        let shape = brep.reported_shape_parts(parts)?;
        self.check_f2_pending(size_of::<ShapeFacts>() as u64)?;
        self.observations.add(WorkCounter::ReportBuilds, 1);
        self.shape_demands[wanted].set(phase);
        Ok(Some(self.report_shape[wanted].get_or_init(|| shape)))
    }

    /// Report face tables (F5): the address part (entity, index, orientation,
    /// surface) unless `measured` also asks for integrals and selector boxes.
    pub(crate) fn report_faces(
        &self,
        measured: bool,
    ) -> Result<Option<Rc<ReportedFaces>>, BackendError> {
        self.demand(Facet::ReportFaces);
        let Some(brep) = &self.brep else {
            return Ok(None);
        };
        self.cache_identity()?;
        if let Some(retained) = self.report_faces.borrow().as_ref() {
            if retained.measured || !measured {
                self.observations.add(WorkCounter::DerivedHits, 1);
                return Ok(Some(Rc::clone(&retained.faces)));
            }
        }
        let faces = brep.reported_faces(measured)?;
        if faces.occurrence_faces.len() as u64 > u64::from(self.binary_limits.max_occurrences) {
            return Err(report_limit());
        }
        let bytes = report_faces_bytes(&faces);
        // A measured transfer replaces, not adds to, retained address tables.
        let retained = self
            .report_faces
            .borrow()
            .as_ref()
            .map_or(0, |value| value.bytes);
        self.check_f2_pending(bytes.saturating_sub(retained))?;
        let faces = Rc::new(faces);
        *self.report_faces.borrow_mut() = Some(RetainedReportFaces {
            faces: Rc::clone(&faces),
            measured,
            bytes,
        });
        self.observations.add(WorkCounter::ReportBuilds, 1);
        Ok(Some(faces))
    }

    /// Every retained report facet, demanded this phase or not (physical).
    #[cfg(test)]
    fn retained_report_bytes(&self) -> u64 {
        let shape = self
            .report_shape
            .iter()
            .filter(|cell| cell.get().is_some())
            .count() as u64
            * size_of::<ShapeFacts>() as u64;
        self.report_mesh_bytes
            .get()
            .copied()
            .unwrap_or(0)
            .saturating_add(shape)
            .saturating_add(
                self.report_faces
                    .borrow()
                    .as_ref()
                    .map_or(0, |value| value.bytes),
            )
    }

    pub(crate) fn source_occurrences(&self) -> Result<Option<Rc<[OccurrenceFacts]>>, BackendError> {
        self.retained_source_occurrences(true)
    }

    /// Source occurrences whose `bounds` must not be read.
    pub(crate) fn source_occurrence_structure(
        &self,
    ) -> Result<Option<Rc<[OccurrenceFacts]>>, BackendError> {
        self.retained_source_occurrences(false)
    }

    fn retained_source_occurrences(
        &self,
        bounds: bool,
    ) -> Result<Option<Rc<[OccurrenceFacts]>>, BackendError> {
        self.demand(Facet::SourceOccurrences);
        let Some(brep) = self.brep.as_deref() else {
            return Ok(None);
        };
        if let Some(retained) = self.source_occurrences.borrow().as_ref() {
            if retained.bounds || !bounds {
                return Ok(Some(Rc::clone(&retained.facts)));
            }
        }
        let facts = if bounds {
            brep.source_occurrences()?
        } else {
            brep.source_occurrence_structure()?
        };
        if facts.len() as u64 > u64::from(self.binary_limits.max_occurrences) {
            return Err(report_limit());
        }
        let bytes = (size_of::<RetainedSourceOccurrences>() as u64)
            .saturating_add(
                (facts.len() as u64).saturating_mul(size_of::<OccurrenceFacts>() as u64),
            )
            .saturating_add(facts.iter().fold(0_u64, |sum, occurrence| {
                sum.saturating_add(occurrence.name.capacity() as u64)
                    .saturating_add(occurrence.path.capacity() as u64)
                    .saturating_add(occurrence.product_name.capacity() as u64)
                    .saturating_add(
                        occurrence
                            .instance_name
                            .as_ref()
                            .map_or(0, |name| name.capacity()) as u64,
                    )
                    .saturating_add(
                        (occurrence.ordinal_path.capacity() as u64)
                            .saturating_mul(size_of::<u32>() as u64),
                    )
            }));
        // A bounded transfer replaces, not adds to, a retained structure transfer.
        self.check_f2_pending(bytes.saturating_sub(self.source_occurrence_owned_bytes()))?;
        *self.source_occurrences.borrow_mut() = Some(RetainedSourceOccurrences {
            facts: Rc::clone(&facts),
            bounds,
            bytes,
        });
        Ok(Some(facts))
    }

    fn source_occurrence_owned_bytes(&self) -> u64 {
        if !self.demanded(Facet::SourceOccurrences) {
            return 0;
        }
        self.source_occurrences
            .borrow()
            .as_ref()
            .map_or(0, |value| value.bytes)
    }

    /// Success-only inventory for this immutable subject/profile. The context
    /// owns the request debit; a warm result never removes that debit.
    fn circular_bores(
        &self,
        faces: &[LocatedFace],
        solid_count: usize,
        edge_count: usize,
    ) -> Result<Rc<CircularBoreInventory>, BackendError> {
        self.demand(Facet::CircularBores);
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
        if !self.demanded(Facet::CircularBores) {
            return 0;
        }
        self.circular_bores.get().map_or(0, |value| {
            value
                .owned_bytes()
                .saturating_add((2 * size_of::<usize>()) as u64)
        })
    }

    /// Lightweight counts are cached only after their complete scope agrees
    /// with the address tables. Geometry classification remains lazy.
    fn edge_treatment_counts(
        &self,
        faces: &ReportedFaces,
    ) -> Result<EdgeTreatmentCounts, BackendError> {
        self.demand(Facet::EdgeTreatmentCounts);
        self.cache_identity()?;
        if let Some(value) = self.edge_treatment_counts.get() {
            return Ok(*value);
        }
        let brep = self
            .brep
            .as_deref()
            .ok_or_else(edge_treatment_unavailable)?;
        let value = brep.edge_treatment_counts()?;
        let face_count = public_face_count(faces)?;
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
        occurrences: &[OccurrenceFacts],
        faces: &ReportedFaces,
    ) -> Result<Rc<EdgeTreatmentInventory>, BackendError> {
        self.demand(Facet::EdgeTreatments);
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
        validate_edge_treatments(&value, counts, occurrences, faces)?;
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
            .filter(|_| self.demanded(Facet::EdgeTreatmentCounts))
            .map_or(0, |_| size_of::<EdgeTreatmentCounts>() as u64);
        let inventory = self
            .edge_treatments
            .get()
            .filter(|_| self.demanded(Facet::EdgeTreatments));
        counts.saturating_add(inventory.map_or(0, |value| {
            value
                .owned_bytes()
                .saturating_add((2 * size_of::<usize>()) as u64)
        }))
    }

    /// Ruling 32: the refusal of an exact claim on a STEP subject whose
    /// admission counted faces with no surface (tessellated-only products
    /// under the `OnNoBRep` read profile). One named refusal for every exact
    /// claim, decided from the admission count, never per facet.
    /// ponytail: subject-wide; scope it to the claim's occurrences if a
    /// mixed BRep and tessellated document becomes a live case.
    pub(crate) fn tessellated_only_refusal(&self, capability: Capability) -> Option<Evaluation> {
        if self.format == SubjectFormat::Step
            && self.step_source_frame == "y-up"
            && capability != Capability::MinimumDistance
        {
            return Some(Evaluation::Refused {
                diagnostics: vec![Diagnostic::error(
                    "GEOSPEC_UNSUPPORTED_EVIDENCE",
                    "This y-up STEP subject currently supports only minimumDistance; other operations require canonicalized native geometry.",
                )],
            });
        }
        let faces = self.step_admission_facts.as_ref()?.surfaceless_faces;
        if faces == 0 || !capability.is_exact() {
            return None;
        }
        let mut diagnostic = Diagnostic::error(
            "GEOSPEC_EVIDENCE_UNSUPPORTED",
            format!(
                "GeoSpec matcher '{}' needs exact BRep geometry, but the loaded subject does not provide it: {faces} of its faces have no surface (tessellated-only product geometry).",
                capability.name()
            ),
        );
        diagnostic.suggestion = Some(
            "Export the model with exact BRep faces, or load its tessellation as a mesh subject such as GLB for mesh-grade claims."
                .into(),
        );
        diagnostic.details = Some(Json::object([
            ("matcher", Json::string(capability.name())),
            ("missing", Json::string("exact BRep geometry")),
            ("surfacelessFaces", Json::Number(faces as f64)),
        ]));
        Some(Evaluation::Refused {
            diagnostics: vec![diagnostic],
        })
    }

    pub(crate) fn step_subject_metadata(
        &self,
    ) -> Result<Option<&StepSubjectMetadata>, BackendError> {
        if self.format != SubjectFormat::Step {
            return Ok(None);
        }
        self.demand(Facet::StepMetadata);
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
        let total = bytes
            .saturating_add(self.demanded_report_bytes())
            .saturating_add(self.continuous_owned_bytes())
            .saturating_add(self.f2_owned_bytes())
            .saturating_add(self.circular_bore_owned_bytes())
            .saturating_add(self.edge_treatment_owned_bytes())
            .saturating_add(self.demanded_tessellations().1);
        if total > self.retention_limits.max_mesh_bytes {
            return Err(report_limit());
        }
        let _ = self.step_metadata.set(metadata);
        Ok(self.step_metadata.get())
    }

    /// One fixed-profile owned certificate. The caller charges the logical
    /// request before this lookup, so retained and fresh results cost equally.
    pub(crate) fn continuous_wall_domain(&self) -> Result<Rc<ContinuousWallDomain>, BackendError> {
        self.demand(Facet::ContinuousWall);
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
        let retained = bytes
            .saturating_add(self.demanded_report_bytes())
            .saturating_add(self.selected_continuous_bytes())
            .saturating_add(self.f2_owned_bytes())
            .saturating_add(self.circular_bore_owned_bytes())
            .saturating_add(self.edge_treatment_owned_bytes())
            .saturating_add(self.step_metadata_owned_bytes())
            .saturating_add(self.source_occurrence_owned_bytes())
            .saturating_add(self.demanded_tessellations().1);
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
        if let Some((index, value)) = self
            .selected_continuous
            .borrow()
            .iter()
            .enumerate()
            .find_map(|(index, cell)| {
                cell.as_ref()
                    .filter(|value| value.occurrence == occurrence)
                    .map(|value| (index, Rc::clone(value)))
            })
        {
            self.selected_demands[index].set(self.demand_phase.get());
            return Ok(value);
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
        let total = continuous
            .saturating_add(self.demanded_material_bytes())
            .saturating_add(self.demanded_report_bytes())
            .saturating_add(self.f2_owned_bytes())
            .saturating_add(self.circular_bore_owned_bytes())
            .saturating_add(self.edge_treatment_owned_bytes())
            .saturating_add(self.step_metadata_owned_bytes())
            .saturating_add(self.source_occurrence_owned_bytes())
            .saturating_add(self.demanded_tessellations().1);
        if continuous > 32 * 1024 * 1024 || total > self.retention_limits.max_mesh_bytes {
            return Err(report_limit());
        }
        let value = Rc::new(value);
        if let Some((index, cell)) = self
            .selected_continuous
            .borrow_mut()
            .iter_mut()
            .enumerate()
            .find(|(_, cell)| cell.is_none())
        {
            *cell = Some(Rc::clone(&value));
            self.selected_demands[index].set(self.demand_phase.get());
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
        let total = continuous
            .saturating_add(self.demanded_material_bytes())
            .saturating_add(self.demanded_report_bytes())
            .saturating_add(self.f2_owned_bytes())
            .saturating_add(self.circular_bore_owned_bytes())
            .saturating_add(self.edge_treatment_owned_bytes())
            .saturating_add(self.step_metadata_owned_bytes())
            .saturating_add(self.source_occurrence_owned_bytes())
            .saturating_add(self.demanded_tessellations().1);
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
            .filter(|_| self.demanded(Facet::StepMetadata))
            .map_or(0, step_metadata_owned_bytes)
    }

    pub(crate) fn check_f2_pending(&self, pending: u64) -> Result<(), BackendError> {
        let total = pending
            .saturating_add(self.f2_owned_bytes())
            .saturating_add(self.circular_bore_owned_bytes())
            .saturating_add(self.edge_treatment_owned_bytes())
            .saturating_add(self.continuous_owned_bytes())
            .saturating_add(self.demanded_report_bytes())
            .saturating_add(self.step_metadata_owned_bytes())
            .saturating_add(self.source_occurrence_owned_bytes())
            .saturating_add(self.demanded_tessellations().1);
        if total > self.retention_limits.max_mesh_bytes {
            return Err(report_limit());
        }
        Ok(())
    }

    fn selected_continuous_bytes(&self) -> u64 {
        let phase = self.demand_phase.get();
        self.selected_continuous
            .borrow()
            .iter()
            .zip(&self.selected_demands)
            .filter(|(_, demand)| demand.get() == phase)
            .filter_map(|(cell, _)| cell.as_ref())
            .fold(
                size_of::<[Option<Rc<SelectedContinuousDomain>>; 16]>() as u64,
                |sum, value| sum.saturating_add(selected_continuous_owned_bytes(value)),
            )
    }

    fn continuous_owned_bytes(&self) -> u64 {
        let whole = if self.continuous_wall.get().is_some() && self.demanded(Facet::ContinuousWall)
        {
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
                    .filter(|_| self.demanded(Facet::ContinuousTopology))
                    .map_or(0, RetainedContinuousTopology::owned_bytes),
            )
    }

    /// One index for the immutable retained BRep, shared by every prepared claim.
    /// The batch invokes this only after all claim syntax has been validated.
    fn check_mesh_index_capacity(
        &self,
        index: &SelectorIndex,
        live: u64,
    ) -> Result<(), BackendError> {
        if live.saturating_add(crate::analysis::selection::mesh_index_owned_bytes(index))
            > self.retention_limits.max_mesh_bytes
        {
            return Err(BackendError {
                kind: BackendErrorKind::Unsupported,
                message: "Material selector metadata exceeds the declared analysis byte limit."
                    .into(),
            });
        }
        Ok(())
    }

    pub(crate) fn selector_index(
        &self,
        budget: &Budget,
    ) -> Result<Option<Rc<SelectorIndex>>, BackendError> {
        if self.brep.is_none() {
            self.demand(Facet::MeshSelector);
            let regions = self.material_regions(budget)?;
            crate::analysis::mesh::exact::charge(
                budget,
                crate::analysis::selection::mesh_index_units(&regions),
            )
            .map_err(|error| BackendError {
                kind: BackendErrorKind::BudgetExceeded {
                    limit: error.limit,
                    used: error.used,
                },
                message: "Mesh selector metadata work exceeds the declared budget.".into(),
            })?;
            let live = crate::analysis::interference::material_region_live_bytes(self, &regions)?;
            if let Some(value) = self.selector_index.get() {
                self.check_mesh_index_capacity(value, live)?;
                self.observations.add(WorkCounter::DerivedHits, 1);
                return Ok(Some(Rc::clone(value)));
            }
            let value = Rc::new(crate::analysis::selection::build_mesh_index(
                &regions,
                budget,
                self.retention_limits.max_mesh_bytes.saturating_sub(live),
            )?);
            self.check_mesh_index_capacity(&value, live)?;
            self.observations.add(WorkCounter::SelectorBuilds, 1);
            let _ = self.selector_index.set(Rc::clone(&value));
            return Ok(Some(value));
        }
        self.cache_identity()?;
        if let Some(value) = self.selector_index.get() {
            self.observations.add(WorkCounter::DerivedHits, 1);
            return Ok(Some(Rc::clone(value)));
        }
        // F8: the index reads facets, never the report mesh. Only an
        // occurrence-free document reads the whole-shape report bounds.
        let brep = self.brep.as_deref().expect("checked above");
        let occurrences = self.source_occurrences()?.expect("BRep source occurrences");
        let faces = self.report_faces(true)?.expect("BRep report faces");
        let rows = brep.document_rows()?;
        let whole_bounds = if occurrences.is_empty() {
            self.report_shape(ShapeParts::BOUNDS)?
                .map(|shape| shape.bounds)
        } else {
            None
        };
        let value = Rc::new(build_report_index(
            &occurrences,
            whole_bounds,
            &rows,
            &faces.whole_faces,
            &faces.occurrence_faces,
        )?);
        self.observations.add(WorkCounter::SelectorBuilds, 1);
        let _ = self.selector_index.set(Rc::clone(&value));
        Ok(Some(value))
    }

    /// The caller charges deterministic requested work before this lookup.
    pub(crate) fn mesh_analysis(&self) -> Result<Rc<MeshAnalysis>, BackendError> {
        if let Some(analysis) = self.mesh_analysis.get() {
            self.observations.add(WorkCounter::DerivedHits, 1);
            return Ok(Rc::clone(analysis));
        }
        let record = self.mesh_record.get().ok_or_else(|| BackendError {
            kind: BackendErrorKind::Unsupported,
            message: "The retained subject has no materialized mesh analysis record.".into(),
        })?;
        let analysis = Rc::new(if self.format == SubjectFormat::MeshBufferV1 {
            analyze_indexed(record)
        } else {
            analyze(record)
        });
        // ST owner execution has no intervening concurrent materialization.
        self.observations.add(WorkCounter::MeshBuilds, 1);
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

/// Public faces in the edge-treatment scope: the whole faces of an
/// occurrence-free document, else every occurrence's faces.
fn public_face_count(faces: &ReportedFaces) -> Result<usize, BackendError> {
    if faces.occurrence_faces.is_empty() {
        return Ok(faces.whole_faces.len());
    }
    faces
        .occurrence_faces
        .iter()
        .try_fold(0_usize, |sum, faces| {
            sum.checked_add(faces.len()).ok_or_else(report_limit)
        })
}

fn validate_edge_treatments(
    value: &EdgeTreatmentInventory,
    counts: EdgeTreatmentCounts,
    occurrences: &[OccurrenceFacts],
    faces: &ReportedFaces,
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
    if occurrences.is_empty() {
        validate_scope(None, "", &faces.whole_faces)?;
    } else {
        if faces.occurrence_faces.len() != occurrences.len() {
            return Err(edge_treatment_invalid());
        }
        for (index, (occurrence, faces)) in
            occurrences.iter().zip(&faces.occurrence_faces).enumerate()
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

/// The whole-shape fact parts each claim reads (F1): a scalar claim measures
/// its own integral and never the exact bounds. Any other capability, including
/// `analyzeBrep`, reads them all.
fn shape_parts(capability: Capability) -> ShapeParts {
    match capability {
        Capability::ToHaveVolume | Capability::ToHaveMass | Capability::ToHaveCenterOfMass => {
            ShapeParts::VOLUME
        }
        Capability::ToHaveSurfaceArea => ShapeParts::AREA,
        Capability::ToHaveBoundingBox => ShapeParts::BOUNDS,
        Capability::ToHaveTopologyCounts => ShapeParts::COUNTS,
        _ => ShapeParts::ALL,
    }
}

fn report_limit() -> BackendError {
    BackendError {
        kind: BackendErrorKind::Unsupported,
        message: "The report bundle exceeds the declared binary or retained derived-data limits."
            .into(),
    }
}

fn vector_bytes<T>(value: &Vec<T>) -> u64 {
    (value.capacity() as u64).saturating_mul(size_of::<T>() as u64)
}

fn located_faces_bytes(value: &[LocatedFace]) -> u64 {
    (std::mem::size_of_val(value) + 2 * size_of::<usize>()) as u64
}

/// Conservative logical payload accounting (including Vec/String capacity).
/// Allocator metadata, original kernel storage and temporary kernel work are
/// separate peak measurements, not covered by this core-owned payload ceiling.
fn report_faces_bytes(value: &ReportedFaces) -> u64 {
    let mut bytes = (size_of::<ReportedFaces>() + 2 * size_of::<usize>()) as u64;
    bytes = bytes
        .saturating_add(located_faces_bytes(&value.whole_faces))
        .saturating_add(vector_bytes(&value.occurrence_faces));
    for faces in &value.occurrence_faces {
        bytes = bytes.saturating_add(located_faces_bytes(faces));
    }
    bytes
}

/// The source-compatible f32 triangle soup of a report mesh (F9). A mesh
/// already in soup layout (the OCCT report) moves its vectors; any other is
/// expanded. Every position is checked to be a finite f32.
fn report_mesh_record(
    mesh: TriangleMesh,
    display_name: &str,
) -> Result<MeshAnalysisRecord, BackendError> {
    let count = mesh.triangles.len();
    let vertices = count * 3;
    let soup = mesh.positions.len() == vertices
        && mesh
            .triangles
            .iter()
            .zip(0_u32..)
            .all(|(triangle, index)| *triangle == [3 * index, 3 * index + 1, 3 * index + 2]);
    let mut positions = if soup {
        mesh.positions
    } else {
        let mut positions = Vec::with_capacity(vertices);
        for triangle in &mesh.triangles {
            for index in triangle {
                let point = mesh
                    .positions
                    .get(*index as usize)
                    .ok_or_else(|| BackendError {
                        kind: BackendErrorKind::ComputationFailed,
                        message: "Report mesh index is outside its position buffer.".into(),
                    })?;
                positions.push(*point);
            }
        }
        positions
    };
    for point in &mut positions {
        *point = point.map(|value| f64::from(value as f32));
        if !point.iter().all(|value| value.is_finite()) {
            return Err(BackendError {
                kind: BackendErrorKind::ComputationFailed,
                message: "Report mesh cannot be represented by its declared finite f32 profile."
                    .into(),
            });
        }
    }
    let triangles = if soup {
        mesh.triangles
    } else {
        (0..count as u32)
            .map(|index| [3 * index, 3 * index + 1, 3 * index + 2])
            .collect()
    };
    Ok(MeshAnalysisRecord {
        positions,
        triangles,
        triangle_primitives: vec![0; count],
        primitives: vec![Primitive {
            name: format!("{display_name}#0"),
            vertex_start: 0,
            vertex_count: vertices as u32,
        }],
    })
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
    /// The primary BRep's claim-local operand memo (C7), made on first use.
    operand_memo: Option<OperandMemo>,
    polarity: Polarity,
    evidence_profile: EvidenceProfile,
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
            operand_memo: None,
            polarity: Polarity::Positive,
            evidence_profile: EvidenceProfile::Complete,
        }
    }

    pub(crate) fn operand_memo(&mut self, brep: &dyn BrepSubject) -> &mut OperandMemo {
        self.operand_memo.get_or_insert_with(|| brep.operand_memo())
    }

    pub(crate) fn with_report_paid(mut self, paid: bool) -> Self {
        self.brep_charged = paid;
        self
    }

    pub(crate) fn with_batch(mut self, batch: &'a BatchAnalysis) -> Self {
        self.batch = Some(batch);
        self
    }

    pub(crate) fn with_polarity(mut self, polarity: Polarity) -> Self {
        self.polarity = polarity;
        self
    }

    /// H9: `result::finish` drops every error diagnostic of a negated
    /// geometric result, so families build failure detail only when positive.
    pub(crate) fn wants_failure_detail(&self) -> bool {
        self.polarity == Polarity::Positive
    }

    pub(crate) fn with_evidence_profile(mut self, profile: EvidenceProfile) -> Self {
        self.evidence_profile = profile;
        self
    }

    /// The plan's product-selected evidence profile (PERF-OUTPUT-01).
    pub(crate) fn bounded_evidence(&self) -> bool {
        self.evidence_profile == EvidenceProfile::Bounded
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
            .connected_components(
                &identity,
                tolerance_mm,
                &analysis,
                self.budget,
                &self.subject().exact_components,
            )
            .map_err(backend_refusal)
    }

    pub(crate) fn mesh_component_clusters(
        &mut self,
        tolerance_mm: f64,
    ) -> Result<Vec<ClusterReport>, Evaluation> {
        let analysis = self.mesh_analysis()?;
        let bytes = self.subject().retention_limits.max_mesh_bytes;
        self.exact_clusters(
            tolerance_mm,
            |trace| {
                analysis
                    .component_clusters_traced(tolerance_mm, self.budget, bytes, trace)
                    .map(|clusters| (clusters, Vec::new()))
                    .map_err(backend_refusal)
            },
            |error, _, _| Evaluation::budget_exceeded(self.capability, error),
        )
        .map(|value| value.clusters.clone())
    }

    /// M2 exact STEP clusters through the plan's batch, which retains them on
    /// the subject; a context without a batch builds them each time.
    pub(crate) fn exact_clusters(
        &self,
        tolerance_mm: f64,
        build: impl FnOnce(&mut ChargeTrace) -> Result<(Vec<ClusterReport>, Vec<String>), Evaluation>,
        on_exceeded: impl Fn(
            crate::budget::BudgetExceeded,
            Option<(usize, usize)>,
            &[String],
        ) -> Evaluation,
    ) -> Result<Rc<ExactClusters>, Evaluation> {
        match self.batch {
            Some(batch) => batch.exact_clusters(
                &self.subject().exact_components,
                tolerance_mm,
                self.budget,
                build,
                on_exceeded,
            ),
            None => {
                let mut trace = ChargeTrace::disabled();
                build(&mut trace).map(|(clusters, labels)| {
                    Rc::new(ExactClusters {
                        clusters,
                        units: 0,
                        labels,
                        trace: trace.steps,
                        trace_complete: trace.complete,
                        stage_calls: trace.stage_calls,
                        stage_units: trace.stage_units,
                    })
                })
            }
        }
    }

    /// The complete profile's STEP components under the batch's retained-byte
    /// accounting, the mesh route's (W2-COMP open issue 4).
    pub(crate) fn step_components(
        &self,
        tolerance_mm: f64,
        clusters: &ExactClusters,
    ) -> Result<Rc<ConnectedComponents>, Evaluation> {
        let batch = self.batch.ok_or_else(|| {
            backend_refusal(BackendError {
                kind: BackendErrorKind::ComputationFailed,
                message: "Connected-component evaluation requires a complete prepared batch."
                    .into(),
            })
        })?;
        let identity = self.subject().cache_identity().map_err(backend_refusal)?;
        batch
            .step_components(&identity, tolerance_mm, clusters)
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
            self.charge_brep_demand()?;
            self.subject().report_mesh().map_err(backend_refusal)?;
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

    /// Subshape names and datums (F8), transferred per demand and not retained.
    pub(crate) fn document_rows(&mut self) -> Result<Option<DocumentRows>, Evaluation> {
        self.charge_brep_demand()?;
        self.subject()
            .brep
            .as_deref()
            .map(BrepSubject::document_rows)
            .transpose()
            .map_err(backend_refusal)
    }

    /// A gate (F3): the single BRep unit and the connector, no report facet.
    pub(crate) fn brep_gate(&mut self) -> Result<Option<&'a dyn BrepSubject>, Evaluation> {
        self.charge_brep_demand()?;
        Ok(self.subject().brep.as_deref())
    }

    /// The report facts facet alone: the whole-shape facts this claim reads.
    pub(crate) fn brep_shape(&mut self) -> Result<Option<&'a ShapeFacts>, Evaluation> {
        self.brep_shape_parts(shape_parts(self.capability))
    }

    fn brep_shape_parts(
        &mut self,
        parts: ShapeParts,
    ) -> Result<Option<&'a ShapeFacts>, Evaluation> {
        self.charge_brep_demand()?;
        self.subject().report_shape(parts).map_err(backend_refusal)
    }

    /// F12: `analyzeBrep` meets the edge-treatment face-count limit from the
    /// address tables, before validity and bores, with the same refusal.
    pub(crate) fn edge_treatment_face_limit(&mut self) -> Result<(), Evaluation> {
        self.charge_brep_demand()?;
        let Some(faces) = self
            .subject()
            .report_faces(false)
            .map_err(backend_refusal)?
        else {
            return Ok(());
        };
        if public_face_count(&faces).map_err(backend_refusal)? > MAX_EDGE_TREATMENT_ROWS {
            return Err(backend_refusal(report_limit()));
        }
        Ok(())
    }

    pub(crate) fn source_occurrences(
        &mut self,
    ) -> Result<Option<Rc<[OccurrenceFacts]>>, Evaluation> {
        self.charge_brep_demand()?;
        self.subject().source_occurrences().map_err(backend_refusal)
    }

    pub(crate) fn source_occurrence_structure(
        &mut self,
    ) -> Result<Option<Rc<[OccurrenceFacts]>>, Evaluation> {
        self.charge_brep_demand()?;
        self.subject()
            .source_occurrence_structure()
            .map_err(backend_refusal)
    }

    pub(crate) fn step_units_facts(&mut self) -> Result<Option<&BrepAdmissionFacts>, Evaluation> {
        self.charge_brep_demand()?;
        if self.subject().brep.is_none() {
            return Ok(None);
        }
        self.subject()
            .step_admission_facts
            .as_ref()
            .map(Some)
            .ok_or_else(|| {
                backend_refusal(BackendError {
                    kind: BackendErrorKind::Unsupported,
                    message: "The STEP subject has no verified admission facts for units.".into(),
                })
            })
    }

    fn charge_brep_demand(&mut self) -> Result<(), Evaluation> {
        if !self.brep_charged && self.subject().brep.is_some() {
            self.budget
                .charge(1)
                .map_err(|error| Evaluation::budget_exceeded(self.capability, error))?;
            self.brep_charged = true;
        }
        Ok(())
    }

    pub(crate) fn circular_bores(&mut self) -> Result<Rc<CircularBoreInventory>, Evaluation> {
        let unavailable = || {
            backend_refusal(BackendError {
                kind: BackendErrorKind::Unsupported,
                message: "Circular-bore topology requires retained BRep faces.".into(),
            })
        };
        let topology = self
            .brep_shape_parts(ShapeParts::COUNTS)?
            .ok_or_else(unavailable)?
            .topology;
        let subject = self.subject();
        let faces = subject
            .report_faces(false)
            .map_err(backend_refusal)?
            .ok_or_else(unavailable)?;
        let count = faces
            .whole_faces
            .iter()
            .filter(|face| !matches!(face.facts.surface, SurfaceFacts::Plane { .. }))
            .count();
        self.budget
            .charge(1_u64.saturating_add(count as u64))
            .map_err(|error| Evaluation::budget_exceeded(self.capability, error))?;
        subject
            .circular_bores(&faces.whole_faces, topology.solids, topology.edges)
            .map_err(backend_refusal)
    }

    /// Complete-material queries are uncached and fully precharged, including
    /// source association scans and refused candidates.
    pub(crate) fn interference_materials(
        &mut self,
        occurrence: u32,
    ) -> Result<Vec<crate::backend::brep::SelectedInterferenceMaterial>, Evaluation> {
        let topology = self
            .brep_shape_parts(ShapeParts::COUNTS)?
            .map(|shape| shape.topology);
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
            record.primitives.len() >= 2
                && crate::analysis::interference::build_component_labels(subject)
                    .is_ok_and(|v| v.len() >= 2)
        }) {
            return Err(refusal());
        }
        let topology = topology.ok_or_else(refusal)?;
        let tables = subject
            .report_faces(false)
            .map_err(backend_refusal)?
            .ok_or_else(refusal)?;
        let faces = tables
            .occurrence_faces
            .get(occurrence as usize)
            .ok_or_else(refusal)?;
        if faces.len() > 4096 || topology.edges > 16384 || topology.vertices > 16384 {
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
            .saturating_mul(tables.whole_faces.len() as u64 + 1)
            .saturating_add(16384);
        let mut result = Vec::new();
        for face in candidates {
            self.budget
                .charge(work)
                .map_err(|e| Evaluation::budget_exceeded(self.capability, e))?;
            let memo = self.operand_memo(brep);
            let material = match brep.selected_interference_material_memoized(face.entity, memo) {
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
        self.charge_brep_demand()?;
        let subject = self.subject();
        let tables = subject
            .report_faces(false)
            .map_err(backend_refusal)?
            .ok_or_else(|| {
                backend_refusal(BackendError {
                    kind: BackendErrorKind::Unsupported,
                    message: "Selected bore void requires a BRep report.".into(),
                })
            })?;
        let faces = tables
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
            let memo = self.operand_memo(brep);
            let value = match brep.selected_bore_void_memoized(face.entity, memo) {
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
        // A gate (F3): the BRep unit, never the report.
        self.charge_brep_demand()?;
        self.budget
            .charge(1)
            .map_err(|error| Evaluation::budget_exceeded(self.capability, error))?;
        let brep = self.subject().brep.as_deref().ok_or_else(|| {
            backend_refusal(BackendError {
                kind: BackendErrorKind::Unsupported,
                message: "Regular-solid containment requires BRep evidence.".into(),
            })
        })?;
        let memo = self.operand_memo(brep);
        let value = brep
            .regular_solid_containment_memoized(subject, target, memo)
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
        let tables = self
            .subject()
            .report_faces(false)
            .map_err(backend_refusal)?
            .ok_or_else(|| {
                cylindrical_band_refusal(
                    "Finite contact requires a retained located-face inventory.",
                )
            })?;
        let selected = tables
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
        let tables = self
            .subject()
            .report_faces(false)
            .map_err(backend_refusal)?
            .ok_or_else(|| {
                cylindrical_band_refusal(
                    "Cylindrical-band clearance needs retained occurrence-face evidence.",
                )
            })?;
        let selected = tables.occurrence_faces.get(occurrence as usize)
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
        self.charge_brep_demand()?;
        self.budget
            .charge(1)
            .map_err(|error| Evaluation::budget_exceeded(self.capability, error))?;
        let subject = self.subject();
        let faces = subject
            .report_faces(false)
            .map_err(backend_refusal)?
            .ok_or_else(|| backend_refusal(edge_treatment_unavailable()))?;
        let occurrences = subject
            .source_occurrence_structure()
            .map_err(backend_refusal)?
            .ok_or_else(|| backend_refusal(edge_treatment_unavailable()))?;
        let counts = subject
            .edge_treatment_counts(&faces)
            .map_err(backend_refusal)?;
        self.budget
            .charge(
                u64::from(counts.public_face_count) + u64::from(counts.candidate_edge_use_count),
            )
            .map_err(|error| Evaluation::budget_exceeded(self.capability, error))?;
        subject
            .edge_treatments(counts, &occurrences, &faces)
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
            self.subject().demand(Facet::ContinuousTopology);
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
        self.subject().demand(Facet::ContinuousTopology);
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

#[cfg(test)]
#[path = "../tests/retention_history.rs"]
mod retention_history_tests;

#[cfg(test)]
#[path = "../tests/report_facets_core.rs"]
mod report_facets_core;
