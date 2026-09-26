//! Safe, owned Rust adapter for the private OCCT bridge.

#[cfg(test)]
extern crate self as geospec_engine_native_occt;
#[cfg(test)]
#[path = "../tests/finite_contact_engagement.rs"]
mod finite_contact_engagement_tests;

pub use geospec_engine_native_core::backend::brep::{
    Bounds, BrepAdmissionFacts, BrepConnector, BrepEntity, BrepSubject, CircularBoreCandidate,
    CircularBoreDisposition, CircularBoreEnd, CircularBoreInventory, CircularBoreNonMember,
    CircularBoreTermination, CircularBoreTopology, CircularBoreUnqualified, ContinuousWallDomain,
    ContinuousWallShape, CurveFacts, CylinderAttachmentProfile, CylinderAxialExtent,
    CylinderBoundaryOrientation, CylinderBoundarySide, CylinderBoundaryUse,
    CylinderPeriodicAttachment, CylinderVertex, CylindricalBandBoundaryResidual,
    CylindricalBandProfile, CylindricalBandRim, DatumPlacementFacts, DocumentRows, EdgeFacts,
    EdgeTreatmentBoundaryRole, EdgeTreatmentBoundaryUse, EdgeTreatmentCertificate,
    EdgeTreatmentCounts, EdgeTreatmentDisposition, EdgeTreatmentInventory, EdgeTreatmentKind,
    EdgeTreatmentLabel, EdgeTreatmentMaterialSide, EdgeTreatmentReason, EdgeTreatmentResidual,
    EdgeTreatmentResidualKind, EdgeTreatmentRow, EdgeTreatmentSupport, FaceFacts,
    FiniteContactCircle, FiniteContactFace, LocatedFace, NominalCylindricalBand, OccurrenceFacts,
    OperandMemo, PointState, RegularSolidContainment, ReportedFaces, ResolvedSourceFace,
    SelectedBoreVoid, SelectedContinuousDomain, SemanticDatumFacts, ShapeFacts, ShapeParts,
    SourceFaceKey, StepSubjectMetadata, SubshapeFacts, SubshapeType, SurfaceFacts,
    TessellationProfile, TopologyCounts, ValidityFacts, MAX_CIRCULAR_BORE_CANDIDATES,
    MAX_CIRCULAR_BORE_OWNED_BYTES, MAX_EDGE_TREATMENT_BOUNDARY_USES,
    MAX_EDGE_TREATMENT_OWNED_BYTES, MAX_EDGE_TREATMENT_RESIDUALS, MAX_EDGE_TREATMENT_ROWS,
};
use geospec_engine_native_core::backend::pmi::{PmiFaceAssociation, PmiField, PmiFieldStatus};
use geospec_engine_native_core::backend::{BackendError, BackendErrorKind, TriangleMesh};
use std::{cell::OnceCell, ffi::c_char, ptr::NonNull, rc::Rc};

#[derive(Clone, Copy, Debug, Default)]
pub struct OcctConnector;

/// A caller-inclusive OCCT grant within one private library instance's pool.
/// The connector and every document opened by it stay on one owner thread.
pub struct ParallelOcctConnector {
    grant_width: u32,
    _single_threaded: std::marker::PhantomData<*mut ()>,
}

impl ParallelOcctConnector {
    /// # Safety
    /// The host must prove this statically linked OCCT closure is private to
    /// GeoSpec, that no other caller initialized or uses its default pool, and
    /// hold an exclusive caller-inclusive two-CPU permit for this connector and
    /// every document opened by it. Construct before any STEP/OCCT operation;
    /// keep all queries and document drops on the owning thread.
    pub unsafe fn new() -> Result<Self, BackendError> {
        unsafe { Self::with_grant(2, 2) }
    }

    /// Construct with an explicit per-query grant and first-init pool cap.
    /// A grant of one deliberately runs the selected inner operations serially.
    ///
    /// # Safety
    /// The host must prove private ownership of this OCCT closure before pool
    /// first initialization, exclude every other OCCT caller, and hold an
    /// exclusive caller-inclusive `grant_width` CPU permit until this connector
    /// and all its documents are dropped on their owner thread. An externally
    /// initialized pool of matching width does not prove ownership.
    pub unsafe fn with_grant(grant_width: u32, pool_cap: u32) -> Result<Self, BackendError> {
        if grant_width == 0 || grant_width > pool_cap {
            return Err(invalid_input(
                "OCCT grant must fit the caller-inclusive pool cap.",
            ));
        }
        let actual = configure_thread_pool_width(pool_cap)?;
        if actual != pool_cap {
            return Err(unsupported(
                "Dedicated OCCT pool cap did not match first initialization.",
            ));
        }
        Ok(Self {
            grant_width,
            _single_threaded: std::marker::PhantomData,
        })
    }
}

/// Fix the OCCT library instance's pool width before opening a document.
/// The caller counts toward `width`. Ordinary geometry calls remain serial.
pub fn configure_thread_pool_width(width: u32) -> Result<u32, BackendError> {
    let requested =
        i32::try_from(width).map_err(|_| invalid_input("OCCT pool width overflows."))?;
    let mut actual = 0;
    let mut error = ErrorBuffer::new();
    check(
        unsafe { ffi::geospec_occt_thread_pool_width(requested, &mut actual, error.raw()) },
        &error,
    )?;
    Ok(actual as u32)
}

/// Owns one retained XDE document. It is deliberately neither `Send` nor `Sync`.
pub struct Document {
    raw: NonNull<ffi::Document>,
    parallel_grant_width: Option<u32>,
    whole_faces: OnceCell<Rc<[LocatedFace]>>,
    validity: OnceCell<Rc<ValidityFacts>>,
    _single_threaded: std::marker::PhantomData<*mut ()>,
}

impl Document {
    pub fn from_step(bytes: &[u8]) -> Result<Self, BackendError> {
        if bytes.is_empty() {
            return Err(invalid_input("STEP input is empty."));
        }
        let mut raw = std::ptr::null_mut();
        let mut error = ErrorBuffer::new();
        let status = unsafe {
            ffi::geospec_occt_open_step(bytes.as_ptr(), bytes.len(), &mut raw, error.raw())
        };
        check(status, &error)?;
        let raw = NonNull::new(raw).ok_or_else(|| backend_error("OCCT returned no document."))?;
        Ok(Self {
            raw,
            parallel_grant_width: None,
            whole_faces: OnceCell::new(),
            validity: OnceCell::new(),
            _single_threaded: std::marker::PhantomData,
        })
    }

    /// Diagnostic count of report copy+mesh generations built for this document.
    pub fn report_generation_builds(&self) -> usize {
        unsafe { ffi::geospec_occt_report_generation_builds(self.raw.as_ptr()) }
    }

    /// Diagnostic count of admitted faces that carry a triangulation; 0 for a BRep.
    pub fn triangulated_faces(&self) -> usize {
        unsafe { ffi::geospec_occt_triangulated_face_count(self.raw.as_ptr()) }
    }

    /// Validity under a dedicated grant. The bridge reuses the admission proof
    /// or re-runs serially, so the returned flag is always false.
    ///
    /// # Safety
    /// The caller must prove this OCCT closure is private to GeoSpec, initialize
    /// its pool before any OCCT operation, and reserve the full caller-inclusive
    /// `grant_width` exclusively until this call returns. Keep this document on
    /// its owning thread.
    pub unsafe fn validity_dedicated(
        &self,
        grant_width: u32,
    ) -> Result<(ValidityFacts, bool), BackendError> {
        let grant_width =
            i32::try_from(grant_width).map_err(|_| invalid_input("OCCT grant overflows."))?;
        if grant_width < 1 {
            return Err(invalid_input("OCCT grant must include the caller."));
        }
        validity_with_control(self.raw.as_ptr(), grant_width)
    }

    /// # Safety
    /// The caller must own this private OCCT closure, initialize a pool cap
    /// at least `grant_width`, and reserve the caller-inclusive grant until
    /// the query returns.
    pub unsafe fn tessellate_dedicated(
        &self,
        entity: BrepEntity,
        profile: TessellationProfile,
        grant_width: u32,
    ) -> Result<(Rc<TriangleMesh>, bool), BackendError> {
        self.validate_entity(entity)?;
        validate_profile(profile)?;
        let (mesh, parallel) = tessellate_with_control(
            self.raw.as_ptr(),
            entity,
            profile,
            dedicated_width(grant_width)?,
        )?;
        Ok((Rc::new(mesh), parallel))
    }

    /// # Safety
    /// The caller must own this private OCCT closure, initialize a pool cap
    /// at least `grant_width`, and reserve the caller-inclusive grant until
    /// the query returns.
    pub unsafe fn regular_solid_containment_dedicated(
        &self,
        subject: BrepEntity,
        target: BrepEntity,
        grant_width: u32,
    ) -> Result<(RegularSolidContainment, bool), BackendError> {
        self.validate_entity(subject)?;
        self.validate_entity(target)?;
        regular_solid_containment_with_control(
            self.raw.as_ptr(),
            subject,
            target,
            std::ptr::null_mut(),
            dedicated_width(grant_width)?,
        )
    }

    /// # Safety
    /// The caller must own this private OCCT closure, initialize a pool cap
    /// at least `grant_width`, and reserve the caller-inclusive grant until
    /// the query returns.
    pub unsafe fn circular_bores_dedicated(
        &self,
        max_candidates: usize,
        grant_width: u32,
    ) -> Result<(CircularBoreInventory, bool), BackendError> {
        circular_bores_with_control(
            self.raw.as_ptr(),
            max_candidates,
            dedicated_width(grant_width)?,
        )
    }

    pub fn tessellate(
        &self,
        linear_deflection: f64,
        angular_deflection: f64,
    ) -> Result<Rc<TriangleMesh>, BackendError> {
        self.tessellate_entity(
            BrepEntity::Whole,
            TessellationProfile {
                linear_deflection_mm: linear_deflection,
                angular_deflection_rad: angular_deflection,
            },
        )
    }

    fn tessellate_entity(
        &self,
        entity: BrepEntity,
        profile: TessellationProfile,
    ) -> Result<Rc<TriangleMesh>, BackendError> {
        validate_profile(profile)?;
        Ok(Rc::new(unsafe {
            tessellate(self.raw.as_ptr(), entity, profile)?
        }))
    }
}

impl BrepConnector for OcctConnector {
    fn identity_profile(&self) -> geospec_engine_native_core::backend::brep::BrepIdentityProfile {
        geospec_engine_native_core::backend::brep::BrepIdentityProfile {
            // Wave 2 of the close-out (authored healing, ruling 1, and every
            // other ruled STEP contract change) is the v5 ingest profile.
            ingest_profile: "geospec-step-xde-report-authored-v5",
            backend_profile: "occt-8.1.0-dev1-3d097a-report-authored-v5",
        }
    }

    fn open_step(&self, bytes: &[u8]) -> Result<Box<dyn BrepSubject>, BackendError> {
        Ok(Box::new(Document::from_step(bytes)?))
    }
}

impl BrepConnector for ParallelOcctConnector {
    fn identity_profile(&self) -> geospec_engine_native_core::backend::brep::BrepIdentityProfile {
        OcctConnector.identity_profile()
    }

    fn open_step(&self, bytes: &[u8]) -> Result<Box<dyn BrepSubject>, BackendError> {
        let mut document = Document::from_step(bytes)?;
        document.parallel_grant_width = Some(self.grant_width);
        Ok(Box::new(document))
    }
}

impl BrepSubject for Document {
    fn pmi_source_faces(
        &self,
        source_face_id: u32,
    ) -> Result<PmiField<Vec<PmiFaceAssociation>>, BackendError> {
        if source_face_id == 0 {
            return Err(invalid_input("PMI source face ID must be positive."));
        }
        let mut output = vec![ffi::PmiSourceFace::default(); 4096];
        let mut count = 0;
        let mut status = 0;
        let mut error = ErrorBuffer::new();
        check(
            unsafe {
                ffi::geospec_occt_pmi_source_faces(
                    self.raw.as_ptr(),
                    source_face_id,
                    output.as_mut_ptr(),
                    output.len(),
                    &mut count,
                    &mut status,
                    error.raw(),
                )
            },
            &error,
        )?;
        if count > output.len() || !(0..=3).contains(&status) {
            return Err(backend_error(
                "Invalid PMI association transfer count/status.",
            ));
        }
        let mut associations = Vec::with_capacity(count);
        for row in &output[..count] {
            if row.route_count > 32 || row.occurrence < -1 {
                return Err(backend_error("Invalid PMI occurrence route."));
            }
            let occurrence = if row.occurrence < 0 {
                None
            } else {
                Some(
                    u32::try_from(row.occurrence)
                        .map_err(|_| backend_error("PMI occurrence overflow."))?,
                )
            };
            let face_count = unsafe {
                match occurrence {
                    Some(occurrence) => {
                        ffi::geospec_occt_occurrence_face_count(self.raw.as_ptr(), occurrence)
                    }
                    None => ffi::geospec_occt_face_count(self.raw.as_ptr()),
                }
            };
            if row.public_face_ordinal as usize >= face_count
                || occurrence.is_some() != (row.route_count > 0)
            {
                return Err(backend_error(
                    "PMI source association is outside its public scope.",
                ));
            }
            associations.push(PmiFaceAssociation {
                source_face_id,
                occurrence,
                public_face_ordinal: row.public_face_ordinal,
                occurrence_route: row.route[..row.route_count].to_vec(),
            });
        }
        let status = match status {
            0 => PmiFieldStatus::Supported,
            1 => PmiFieldStatus::Missing,
            2 => PmiFieldStatus::Ambiguous,
            _ => PmiFieldStatus::Unsupported,
        };
        Ok(PmiField { status, value: Some(associations), reason: (status != PmiFieldStatus::Supported).then(|| "Source face transfer is missing, ambiguous or unqualified; retained bindings are partial.".into()) })
    }
    fn continuous_wall_domain(
        &self,
        entity: BrepEntity,
    ) -> Result<ContinuousWallDomain, BackendError> {
        if entity != BrepEntity::Whole {
            return Err(BackendError {
                kind: BackendErrorKind::Unsupported,
                message: "Continuous wall qualification currently requires the whole subject."
                    .into(),
            });
        }
        let mut value = ffi::ContinuousWallDomain::default();
        let mut error = ErrorBuffer::new();
        check(
            unsafe {
                ffi::geospec_occt_continuous_wall(self.raw.as_ptr(), &mut value, error.raw())
            },
            &error,
        )?;
        continuous_wall_domain(value)
    }

    fn selected_continuous_domain(
        &self,
        occurrence: u32,
    ) -> Result<SelectedContinuousDomain, BackendError> {
        self.require_occurrence(occurrence)?;
        let mut value = ffi::SelectedContinuousDomain::default();
        let mut error = ErrorBuffer::new();
        check(
            unsafe {
                ffi::geospec_occt_selected_continuous_domain(
                    self.raw.as_ptr(),
                    occurrence,
                    &mut value,
                    error.raw(),
                )
            },
            &error,
        )?;
        if value.occurrence != occurrence || value.face_count > 6 || value.edge_count > 12 {
            return Err(backend_error(
                "OCCT returned invalid selected continuous transfer counts.",
            ));
        }
        let domain = continuous_wall_domain(value.domain)?;
        let face_count = value.face_count as usize;
        let edge_count = value.edge_count as usize;
        let expected_counts = match &domain.domain {
            ContinuousWallShape::AxisAlignedBox { .. } => (6, 12),
            ContinuousWallShape::RightCircularCylinder { .. } => (3, 3),
        };
        let occurrence_face_count =
            unsafe { ffi::geospec_occt_occurrence_query_face_count(self.raw.as_ptr(), occurrence) };
        let occurrence_edge_count = unsafe { edge_address_count(self.raw.as_ptr(), occurrence)? };
        if (face_count, edge_count) != expected_counts
            || !valid_association_map(&value.face_map[..face_count], occurrence_face_count)
            || !valid_association_map(&value.edge_map[..edge_count], occurrence_edge_count)
        {
            return Err(backend_error(
                "OCCT returned an invalid selected continuous association map.",
            ));
        }
        Ok(SelectedContinuousDomain {
            occurrence,
            domain,
            domain_face_to_occurrence_face: value.face_map[..face_count].to_vec(),
            domain_edge_to_occurrence_edge: value.edge_map[..edge_count].to_vec(),
        })
    }

    fn resolve_source_face(&self, key: &SourceFaceKey) -> Result<ResolvedSourceFace, BackendError> {
        if key.source_face_entity == 0 || key.occurrence_route.is_empty() {
            return Err(invalid_input(
                "Source face keys require a face and occurrence route.",
            ));
        }
        if key.occurrence_route.len() > 32 {
            return Err(invalid_input(
                "Source face occurrence routes are limited to 32 links.",
            ));
        }
        let mut value = ffi::ResolvedSourceFace::default();
        let mut error = ErrorBuffer::new();
        check(
            unsafe {
                ffi::geospec_occt_resolve_source_face(
                    self.raw.as_ptr(),
                    key.source_face_entity,
                    key.occurrence_route.as_ptr(),
                    key.occurrence_route.len(),
                    &mut value,
                    error.raw(),
                )
            },
            &error,
        )?;
        let occurrence_count = unsafe { ffi::geospec_occt_occurrence_count(self.raw.as_ptr()) };
        let public_count =
            unsafe { ffi::geospec_occt_occurrence_face_count(self.raw.as_ptr(), value.occurrence) };
        let private_count = unsafe {
            ffi::geospec_occt_occurrence_query_face_count(self.raw.as_ptr(), value.occurrence)
        };
        if value.occurrence as usize >= occurrence_count
            || value.public_face_ordinal as usize >= public_count
            || value.private_query_face == 0
            || value.private_query_face as usize > private_count
            || !matches!(value.source_same_sense, 0 | 1)
            || !matches!(value.transferred_reversed, 0 | 1)
        {
            return Err(backend_error(
                "OCCT returned an invalid source-face association.",
            ));
        }
        Ok(ResolvedSourceFace {
            key: key.clone(),
            occurrence: value.occurrence,
            public_face_ordinal: value.public_face_ordinal,
            private_query_face: value.private_query_face,
            source_same_sense: value.source_same_sense != 0,
            transferred_reversed: value.transferred_reversed != 0,
        })
    }

    fn admission_facts(&self) -> Result<BrepAdmissionFacts, BackendError> {
        unsafe { admission_facts(self.raw.as_ptr()) }
    }

    fn step_subject_metadata(&self) -> Result<Option<StepSubjectMetadata>, BackendError> {
        unsafe { step_subject_metadata(self.raw.as_ptr()).map(Some) }
    }

    // SAFETY (granted documents): see the connector's lifetime permit contract.
    fn reported_mesh(&self) -> Result<TriangleMesh, BackendError> {
        unsafe { reported_mesh(self.raw.as_ptr(), self.parallel_grant_width) }
    }

    fn reported_shape(&self) -> Result<ShapeFacts, BackendError> {
        self.reported_shape_parts(ShapeParts::ALL)
    }

    // SAFETY (granted documents): see the connector's lifetime permit contract.
    fn reported_shape_parts(&self, parts: ShapeParts) -> Result<ShapeFacts, BackendError> {
        unsafe { reported_shape(self.raw.as_ptr(), parts, self.parallel_grant_width) }
    }

    fn reported_faces(&self, measured: bool) -> Result<ReportedFaces, BackendError> {
        unsafe { reported_faces(self.raw.as_ptr(), measured) }
    }

    fn document_rows(&self) -> Result<DocumentRows, BackendError> {
        unsafe { document_rows(self.raw.as_ptr()) }
    }

    fn face_optimal_bounds(&self, public_face: u32) -> Result<Bounds, BackendError> {
        unsafe { face_optimal_bounds(self.raw.as_ptr(), public_face) }
    }

    fn cylinder_axial_extent(&self, face: BrepEntity) -> Result<CylinderAxialExtent, BackendError> {
        self.validate_entity(face)?;
        if !matches!(face, BrepEntity::WholeFace(_) | BrepEntity::Face { .. }) {
            return Err(invalid_input(
                "A trimmed-cylinder query requires a face entity.",
            ));
        }
        unsafe { cylinder_axial_extent(self.raw.as_ptr(), face) }
    }

    fn finite_contact_face(&self, face: BrepEntity) -> Result<FiniteContactFace, BackendError> {
        self.validate_entity(face)?;
        let BrepEntity::Face {
            occurrence,
            face: query,
        } = face
        else {
            return Err(unsupported(
                "Finite contact requires an associated occurrence face.",
            ));
        };
        let mut value = FiniteContactFace::default();
        let mut error = ErrorBuffer::new();
        unsafe {
            check(
                ffi::geospec_occt_finite_contact_face_query(
                    self.raw.as_ptr(),
                    face.into(),
                    &mut value,
                    error.raw(),
                ),
                &error,
            )?;
        }
        if value.occurrence != occurrence
            || value.private_query_face != query
            || value.source_face_entity == 0
            || !(1..=32).contains(&value.source_route_count)
            || value.kind > 1
            || value.vertex_count > 8
            || value.circle_count > 8
        {
            return Err(backend_error(
                "Finite-contact source/shape transfer is inconsistent.",
            ));
        }
        Ok(value)
    }

    fn nominal_cylindrical_band(
        &self,
        face: BrepEntity,
    ) -> Result<NominalCylindricalBand, BackendError> {
        self.validate_entity(face)?;
        let BrepEntity::Face {
            occurrence,
            face: query_face,
        } = face
        else {
            return Err(if matches!(face, BrepEntity::WholeFace(_)) {
                unsupported("Nominal band requires a selected occurrence-face source route.")
            } else {
                invalid_input("A nominal cylindrical-band query requires a face entity.")
            });
        };
        let mut value = ffi::NominalCylindricalBand::default();
        let mut error = ErrorBuffer::new();
        unsafe {
            check(
                ffi::geospec_occt_nominal_cylindrical_band_query(
                    self.raw.as_ptr(),
                    face.into(),
                    &mut value,
                    error.raw(),
                ),
                &error,
            )?;
            if value.occurrence != occurrence
                || value.private_query_face != query_face
                || value.public_face_ordinal as usize
                    >= ffi::geospec_occt_occurrence_face_count(self.raw.as_ptr(), occurrence)
            {
                return Err(backend_error(
                    "OCCT nominal band has an inconsistent selected face association.",
                ));
            }
        }
        nominal_cylindrical_band(value)
    }

    fn selected_interference_material(
        &self,
        face: BrepEntity,
    ) -> Result<geospec_engine_native_core::backend::brep::SelectedInterferenceMaterial, BackendError>
    {
        self.selected_interference_material_memoized(face, &mut no_memo())
    }

    fn operand_memo(&self) -> OperandMemo {
        // SAFETY: the memo only compares this pointer; the context drops it
        // before the document, and a null memo re-qualifies per query.
        match NonNull::new(unsafe { ffi::geospec_occt_operand_memo_new(self.raw.as_ptr()) }) {
            Some(raw) => Box::new(OcctOperandMemo(raw)),
            None => no_memo(),
        }
    }

    fn selected_interference_material_memoized(
        &self,
        face: BrepEntity,
        memo: &mut OperandMemo,
    ) -> Result<geospec_engine_native_core::backend::brep::SelectedInterferenceMaterial, BackendError>
    {
        self.validate_entity(face)?;
        let BrepEntity::Face {
            occurrence,
            face: query_face,
        } = face
        else {
            return Err(unsupported(
                "Interference material requires an occurrence face.",
            ));
        };
        let mut band = ffi::NominalCylindricalBand::default();
        let mut kind = u32::MAX;
        let mut error = ErrorBuffer::new();
        unsafe {
            check(
                ffi::geospec_occt_selected_interference_material_query(
                    self.raw.as_ptr(),
                    face.into(),
                    memo_raw(memo),
                    &mut band,
                    &mut kind,
                    error.raw(),
                ),
                &error,
            )?;
        }
        let band = nominal_cylindrical_band(band)?;
        if band.occurrence != occurrence || band.private_query_face != query_face {
            return Err(backend_error(
                "Interference material source route disagrees with selection.",
            ));
        }
        use geospec_engine_native_core::backend::brep::SelectedInterferenceMaterial;
        match (kind, band.transferred_reversed) {
            (0, true) => Ok(SelectedInterferenceMaterial::BoreSlab(band)),
            (1, false) => Ok(SelectedInterferenceMaterial::FiniteCylinder(band)),
            _ => Err(backend_error(
                "Interference material kind/sense is invalid.",
            )),
        }
    }

    fn selected_bore_void(&self, face: BrepEntity) -> Result<SelectedBoreVoid, BackendError> {
        self.selected_bore_void_memoized(face, &mut no_memo())
    }

    fn selected_bore_void_memoized(
        &self,
        face: BrepEntity,
        memo: &mut OperandMemo,
    ) -> Result<SelectedBoreVoid, BackendError> {
        self.validate_entity(face)?;
        let BrepEntity::Face {
            occurrence,
            face: query_face,
        } = face
        else {
            return Err(unsupported("Selected bore requires an occurrence face."));
        };
        let mut band = ffi::NominalCylindricalBand::default();
        let mut clear = ffi::CircularBoreCandidate::default();
        let mut error = ErrorBuffer::new();
        unsafe {
            check(
                ffi::geospec_occt_selected_bore_void_query(
                    self.raw.as_ptr(),
                    face.into(),
                    memo_raw(memo),
                    &mut band,
                    &mut clear,
                    error.raw(),
                ),
                &error,
            )?;
        }
        let count =
            unsafe { ffi::geospec_occt_occurrence_face_count(self.raw.as_ptr(), occurrence) };
        let topology = circular_bore_topology(&clear, count)?;
        let band = nominal_cylindrical_band(band)?;
        if band.occurrence != occurrence
            || band.private_query_face != query_face
            || band.public_face_ordinal != clear.public_face_ordinal
            || clear.private_query_face != query_face
            || clear.disposition != 0
            || topology.owning_solid_ordinal != 0
            || !band.transferred_reversed
            || topology
                .ends
                .iter()
                .any(|e| e.termination != CircularBoreTermination::Mouth)
            || topology.band.origin != band.origin
            || topology.band.axis != band.axis
            || topology.band.radius != band.radius
            || topology.band.from != band.from
            || topology.band.to != band.to
        {
            return Err(backend_error(
                "Selected bore transfer has inconsistent scope or band.",
            ));
        }
        Ok(SelectedBoreVoid {
            band,
            ends: topology.ends,
            maximum_topology_tolerance_mm: topology.maximum_topology_tolerance_mm,
        })
    }

    fn circular_bores(&self, max_candidates: usize) -> Result<CircularBoreInventory, BackendError> {
        if let Some(width) = self.parallel_grant_width {
            // SAFETY: the unsafe connector constructor requires the exclusive
            // private-pool permit for every document query.
            let (facts, used_parallel) =
                unsafe { self.circular_bores_dedicated(max_candidates, width)? };
            require_grant_mode(width, used_parallel)?;
            return Ok(facts);
        }
        unsafe { circular_bores(self.raw.as_ptr(), max_candidates) }
    }

    fn edge_treatment_counts(&self) -> Result<EdgeTreatmentCounts, BackendError> {
        unsafe { edge_treatment_counts(self.raw.as_ptr()) }
    }

    fn edge_treatments(&self, max_rows: usize) -> Result<EdgeTreatmentInventory, BackendError> {
        unsafe { edge_treatments(self.raw.as_ptr(), max_rows) }
    }

    fn regular_solid_containment(
        &self,
        subject: BrepEntity,
        target: BrepEntity,
    ) -> Result<RegularSolidContainment, BackendError> {
        self.regular_solid_containment_memoized(subject, target, &mut no_memo())
    }

    fn regular_solid_containment_memoized(
        &self,
        subject: BrepEntity,
        target: BrepEntity,
        memo: &mut OperandMemo,
    ) -> Result<RegularSolidContainment, BackendError> {
        self.validate_entity(subject)?;
        self.validate_entity(target)?;
        let raw = self.raw.as_ptr();
        if let Some(width) = self.parallel_grant_width {
            // SAFETY: see the connector's lifetime permit contract.
            let (facts, used_parallel) = unsafe {
                regular_solid_containment_with_control(
                    raw,
                    subject,
                    target,
                    memo_raw(memo),
                    dedicated_width(width)?,
                )?
            };
            require_grant_mode(width, used_parallel)?;
            return Ok(facts);
        }
        Ok(unsafe {
            regular_solid_containment_with_control(raw, subject, target, memo_raw(memo), 0)?
        }
        .0)
    }

    fn source_occurrences(&self) -> Result<Rc<[OccurrenceFacts]>, BackendError> {
        let raw = self.raw.as_ptr();
        let product_count = unsafe { ffi::geospec_occt_product_count(raw) };
        Ok(unsafe { transfer_occurrences(raw, product_count, true)? }.into())
    }

    fn source_occurrence_structure(&self) -> Result<Rc<[OccurrenceFacts]>, BackendError> {
        let raw = self.raw.as_ptr();
        let product_count = unsafe { ffi::geospec_occt_product_count(raw) };
        Ok(unsafe { transfer_occurrences(raw, product_count, false)? }.into())
    }

    fn faces(&self) -> Result<Rc<[LocatedFace]>, BackendError> {
        if let Some(faces) = self.whole_faces.get() {
            return Ok(Rc::clone(faces));
        }
        let faces: Rc<[LocatedFace]> = unsafe { whole_faces(self.raw.as_ptr())? }.into();
        let _ = self.whole_faces.set(Rc::clone(&faces));
        Ok(faces)
    }

    fn validity(&self) -> Result<Rc<ValidityFacts>, BackendError> {
        if let Some(validity) = self.validity.get() {
            return Ok(Rc::clone(validity));
        }
        let validity = Rc::new(match self.parallel_grant_width {
            Some(width) => {
                // False here is the pinned bridge's reusable admission proof;
                // the connector constructor already checked the pool handshake.
                // SAFETY: see the connector's lifetime permit contract.
                unsafe { self.validity_dedicated(width)?.0 }
            }
            None => unsafe { validity(self.raw.as_ptr())? },
        });
        let _ = self.validity.set(Rc::clone(&validity));
        Ok(validity)
    }

    fn classify_face_points(
        &self,
        face: BrepEntity,
        points: &[[f64; 3]],
        tolerance_mm: f64,
    ) -> Result<Vec<PointState>, BackendError> {
        self.validate_entity(face)?;
        if !matches!(face, BrepEntity::WholeFace(_) | BrepEntity::Face { .. }) {
            return Err(invalid_input("Face classification requires a face entity."));
        }
        if !tolerance_mm.is_finite() || tolerance_mm <= 0.0 {
            return Err(invalid_input(
                "Face-classification tolerance must be positive and finite.",
            ));
        }
        unsafe { classify_face_points(self.raw.as_ptr(), face, points, tolerance_mm) }
    }

    fn tessellate(
        &self,
        entity: BrepEntity,
        profile: TessellationProfile,
    ) -> Result<Rc<TriangleMesh>, BackendError> {
        if let Some(width) = self.parallel_grant_width {
            // SAFETY: see the connector's lifetime permit contract.
            let (mesh, used_parallel) =
                unsafe { self.tessellate_dedicated(entity, profile, width)? };
            require_grant_mode(width, used_parallel)?;
            return Ok(mesh);
        }
        self.validate_entity(entity)?;
        self.tessellate_entity(entity, profile)
    }
}

impl Document {
    fn require_occurrence(&self, occurrence: u32) -> Result<(), BackendError> {
        // Count only: facts() would transfer every lazy source numeric.
        let count = unsafe { ffi::geospec_occt_occurrence_count(self.raw.as_ptr()) };
        if occurrence as usize >= count {
            return Err(invalid_input("Occurrence index is out of range."));
        }
        Ok(())
    }

    fn validate_entity(&self, entity: BrepEntity) -> Result<(), BackendError> {
        match entity {
            BrepEntity::Whole => Ok(()),
            BrepEntity::WholeFace(face) => {
                let count = unsafe { ffi::geospec_occt_query_face_count(self.raw.as_ptr()) };
                if face == 0 || face as usize > count {
                    return Err(invalid_input("Whole-shape face index is out of range."));
                }
                Ok(())
            }
            BrepEntity::Occurrence(occurrence) => self.require_occurrence(occurrence),
            BrepEntity::Face { occurrence, face } => {
                self.require_occurrence(occurrence)?;
                let count = unsafe {
                    ffi::geospec_occt_occurrence_query_face_count(self.raw.as_ptr(), occurrence)
                };
                if face == 0 || face as usize > count {
                    return Err(invalid_input("Face index is out of range."));
                }
                Ok(())
            }
        }
    }
}

impl Drop for Document {
    fn drop(&mut self) {
        unsafe { ffi::geospec_occt_release(self.raw.as_ptr()) };
    }
}

fn invalid_input(message: impl Into<String>) -> BackendError {
    BackendError {
        kind: BackendErrorKind::InvalidInput,
        message: message.into(),
    }
}

/// The bridge's claim-local operand memo (C7), released with its context.
struct OcctOperandMemo(NonNull<ffi::OperandMemo>);

impl Drop for OcctOperandMemo {
    fn drop(&mut self) {
        unsafe { ffi::geospec_occt_operand_memo_release(self.0.as_ptr()) }
    }
}

fn no_memo() -> OperandMemo {
    Box::new(())
}

/// The bridge memo inside a claim's memo, or null to re-qualify per query.
fn memo_raw(memo: &mut OperandMemo) -> *mut ffi::OperandMemo {
    memo.downcast_mut::<OcctOperandMemo>()
        .map_or(std::ptr::null_mut(), |memo| memo.0.as_ptr())
}

fn dedicated_width(width: u32) -> Result<i32, BackendError> {
    i32::try_from(width)
        .ok()
        .filter(|width| *width >= 1)
        .ok_or_else(|| invalid_input("Dedicated OCCT grant must include the caller."))
}

fn require_grant_mode(width: u32, used_parallel: bool) -> Result<(), BackendError> {
    if used_parallel == (width >= 2) {
        Ok(())
    } else {
        Err(unsupported(
            "Dedicated OCCT operation refused the requested grant mode.",
        ))
    }
}

fn backend_error(message: impl Into<String>) -> BackendError {
    BackendError {
        kind: BackendErrorKind::ComputationFailed,
        message: message.into(),
    }
}

fn unsupported(message: impl Into<String>) -> BackendError {
    BackendError {
        kind: BackendErrorKind::Unsupported,
        message: message.into(),
    }
}

fn ffi_bool(value: i32) -> Result<bool, BackendError> {
    match value {
        0 => Ok(false),
        1 => Ok(true),
        _ => Err(backend_error("OCCT returned an invalid boolean value.")),
    }
}

fn cylinder_boundary_use(
    value: ffi::CylinderBoundaryUse,
) -> Result<CylinderBoundaryUse, BackendError> {
    Ok(CylinderBoundaryUse {
        edge_index: value.edge_index,
        orientation: match value.orientation {
            0 => CylinderBoundaryOrientation::Forward,
            1 => CylinderBoundaryOrientation::Reversed,
            _ => {
                return Err(backend_error(
                    "OCCT returned an unknown boundary orientation.",
                ))
            }
        },
        side: match value.side {
            0 => CylinderBoundarySide::U0,
            1 => CylinderBoundarySide::U1,
            2 => CylinderBoundarySide::V0,
            3 => CylinderBoundarySide::V1,
            _ => {
                return Err(backend_error(
                    "OCCT returned an unknown cylinder boundary side.",
                ))
            }
        },
        curve_range: value.curve_range,
        pcurve_stored: ffi_bool(value.pcurve_stored)?,
        parameter_endpoints: value.parameter_endpoints,
    })
}

fn continuous_wall_domain(
    value: ffi::ContinuousWallDomain,
) -> Result<ContinuousWallDomain, BackendError> {
    let domain = match value.kind {
        0 => ContinuousWallShape::AxisAlignedBox {
            corners: value.corners,
            face_indices: value.face_indices,
            face_corner_indices: value.face_corner_indices,
            outward_normals: value.outward_normals,
            opposite_face_pairs: value.opposite_face_pairs,
            edge_lengths: value.edge_lengths,
        },
        1 => {
            let [boundary0, boundary1, boundary2, boundary3] = value.lateral_boundary;
            ContinuousWallShape::RightCircularCylinder {
                origin: value.origin,
                axis: value.axis,
                radius: value.radius,
                from: value.from,
                to: value.to,
                lateral_face: value.lateral_face,
                cap_faces: value.cap_faces,
                lateral_parameter_bounds: value.lateral_parameter_bounds,
                rim_centers: value.rim_centers,
                rim_radii: value.rim_radii,
                rim_edge_indices: value.rim_edge_indices,
                seam_edge_index: value.seam_edge_index,
                periodic_attachment: CylinderPeriodicAttachment {
                    profile: match value.attachment_profile {
                        0 => CylinderAttachmentProfile::PhaseZeroV1,
                        _ => {
                            return Err(backend_error(
                                "OCCT returned an unknown cylinder attachment profile.",
                            ))
                        }
                    },
                    phase_x: value.phase_x,
                    phase_y: value.phase_y,
                    surface_period: value.surface_period,
                    rim_curve_ranges: value.rim_curve_ranges,
                    rim_curve_periods: value.rim_curve_periods,
                    cap_pcurve_ranges: value.cap_pcurve_ranges,
                    cap_pcurve_periods: value.cap_pcurve_periods,
                    cap_pcurve_stored: [
                        ffi_bool(value.cap_pcurve_stored[0])?,
                        ffi_bool(value.cap_pcurve_stored[1])?,
                    ],
                    seam_curve_range: value.seam_curve_range,
                    lateral_boundary: [
                        cylinder_boundary_use(boundary0)?,
                        cylinder_boundary_use(boundary1)?,
                        cylinder_boundary_use(boundary2)?,
                        cylinder_boundary_use(boundary3)?,
                    ],
                    vertices: value.vertices.map(|vertex| CylinderVertex {
                        vertex_index: vertex.vertex_index,
                        point: vertex.point,
                    }),
                    seam_vertex_indices: value.seam_vertex_indices,
                    rim_vertex_indices: value.rim_vertex_indices,
                },
            }
        }
        _ => {
            return Err(backend_error(
                "OCCT returned an unknown continuous wall domain.",
            ))
        }
    };
    Ok(ContinuousWallDomain {
        maximum_topology_tolerance_mm: value.maximum_topology_tolerance_mm,
        domain,
    })
}

fn valid_association_map(values: &[u32], count: usize) -> bool {
    values.len() == count
        && values.iter().enumerate().all(|(index, value)| {
            *value != 0 && (*value as usize) <= count && !values[..index].contains(value)
        })
}

fn validate_profile(profile: TessellationProfile) -> Result<(), BackendError> {
    if !profile.linear_deflection_mm.is_finite()
        || profile.linear_deflection_mm <= 0.0
        || !profile.angular_deflection_rad.is_finite()
        || profile.angular_deflection_rad <= 0.0
    {
        return Err(invalid_input(
            "Tessellation deflections must be positive and finite.",
        ));
    }
    Ok(())
}

struct ErrorBuffer {
    bytes: Vec<u8>,
    raw: ffi::StringBuffer,
}

impl ErrorBuffer {
    fn new() -> Self {
        let mut bytes = vec![0; 512];
        let raw = ffi::StringBuffer {
            data: bytes.as_mut_ptr().cast(),
            capacity: bytes.len(),
            length: 0,
        };
        Self { bytes, raw }
    }

    fn raw(&mut self) -> *mut ffi::StringBuffer {
        self.raw.length = 0;
        &mut self.raw
    }

    fn message(&self) -> String {
        let length = self.raw.length.min(self.bytes.len());
        String::from_utf8_lossy(&self.bytes[..length]).into_owned()
    }
}

fn check(status: i32, error: &ErrorBuffer) -> Result<(), BackendError> {
    if status == ffi::OK {
        return Ok(());
    }
    let message = error.message();
    Err(BackendError {
        kind: match status {
            ffi::INVALID_ARGUMENT | ffi::READ_FAILED | ffi::TRANSFER_FAILED | ffi::NO_SHAPE => {
                BackendErrorKind::InvalidInput
            }
            ffi::UNSUPPORTED => BackendErrorKind::Unsupported,
            _ => BackendErrorKind::ComputationFailed,
        },
        message: if message.is_empty() {
            format!("OCCT bridge failed with status {status}.")
        } else {
            message
        },
    })
}

unsafe fn copied_string(
    mut call: impl FnMut(*mut ffi::StringBuffer, *mut ffi::StringBuffer) -> i32,
) -> Result<String, BackendError> {
    let mut size = ffi::StringBuffer {
        data: std::ptr::null_mut(),
        capacity: 0,
        length: 0,
    };
    let mut error = ErrorBuffer::new();
    let status = call(&mut size, error.raw());
    if status != ffi::BUFFER_TOO_SMALL && status != ffi::OK {
        check(status, &error)?;
    }
    // Empty output is complete after the sizing call; do not repeat its computation.
    if size.length == 0 {
        return Ok(String::new());
    }
    let mut bytes = vec![0u8; size.length.saturating_add(1)];
    let mut output = ffi::StringBuffer {
        data: bytes.as_mut_ptr().cast(),
        capacity: bytes.len(),
        length: 0,
    };
    check(call(&mut output, error.raw()), &error)?;
    bytes.truncate(output.length);
    String::from_utf8(bytes).map_err(|_| backend_error("OCCT returned non-UTF-8 text."))
}

// Validity usually returns a short fixed reason. Retain exact-size retry for
// future arbitrary-length messages without recomputing the common case.
unsafe fn copied_string_small(
    mut call: impl FnMut(*mut ffi::StringBuffer, *mut ffi::StringBuffer) -> i32,
) -> Result<String, BackendError> {
    let mut bytes = [0u8; 64];
    let mut output = ffi::StringBuffer {
        data: bytes.as_mut_ptr().cast(),
        capacity: bytes.len(),
        length: 0,
    };
    let mut error = ErrorBuffer::new();
    let status = call(&mut output, error.raw());
    if status == ffi::BUFFER_TOO_SMALL {
        let capacity = output
            .length
            .checked_add(1)
            .ok_or_else(|| backend_error("OCCT validity reason size overflowed."))?;
        let mut larger = vec![0u8; capacity];
        output.data = larger.as_mut_ptr().cast();
        output.capacity = larger.len();
        output.length = 0;
        check(call(&mut output, error.raw()), &error)?;
        larger.truncate(output.length);
        return String::from_utf8(larger)
            .map_err(|_| backend_error("OCCT returned non-UTF-8 text."));
    }
    check(status, &error)?;
    String::from_utf8(bytes[..output.length].to_vec())
        .map_err(|_| backend_error("OCCT returned non-UTF-8 text."))
}

#[cfg(test)]
mod copied_string_tests {
    use super::{copied_string, copied_string_small, ffi};

    #[test]
    fn short_nonempty_validity_reason_keeps_scalar_payload_after_one_call() {
        let expected = b"invalid-solid";
        let mut calls = 0;
        let mut scalar_payload = 0;
        let text = unsafe {
            copied_string_small(|output, _error| {
                calls += 1;
                scalar_payload = 4096;
                let output = &mut *output;
                assert!(output.capacity > expected.len());
                output.length = expected.len();
                std::ptr::copy_nonoverlapping(
                    expected.as_ptr(),
                    output.data.cast(),
                    expected.len(),
                );
                ffi::OK
            })
        }
        .unwrap();
        assert_eq!(text.as_bytes(), expected);
        assert_eq!(calls, 1);
        assert_eq!(scalar_payload, 4096);
    }

    #[test]
    fn long_validity_reason_retries_with_exact_capacity() {
        let expected = vec![b'x'; 128];
        let mut calls = 0;
        let text = unsafe {
            copied_string_small(|output, _error| {
                calls += 1;
                let output = &mut *output;
                output.length = expected.len();
                if output.capacity <= expected.len() {
                    return ffi::BUFFER_TOO_SMALL;
                }
                assert_eq!(output.capacity, expected.len() + 1);
                std::ptr::copy_nonoverlapping(
                    expected.as_ptr(),
                    output.data.cast(),
                    expected.len(),
                );
                ffi::OK
            })
        }
        .unwrap();
        assert_eq!(text.as_bytes(), expected);
        assert_eq!(calls, 2);
    }

    #[test]
    fn empty_text_keeps_scalar_payload_after_one_call() {
        for status in [ffi::BUFFER_TOO_SMALL, ffi::OK] {
            let mut calls = 0;
            let mut scalar_payload = 0;
            let text = unsafe {
                copied_string(|output, _error| {
                    calls += 1;
                    scalar_payload = 4096;
                    let output = &mut *output;
                    assert!(output.data.is_null());
                    assert_eq!(output.capacity, 0);
                    output.length = 0;
                    status
                })
            }
            .unwrap();
            assert_eq!(text, "");
            assert_eq!(calls, 1);
            assert_eq!(scalar_payload, 4096);
        }
    }

    #[test]
    fn nonempty_text_keeps_exact_payload_after_two_calls() {
        let expected = "part-0000: μm".as_bytes();
        let mut calls = 0;
        let mut scalar_payload = 0;
        let text = unsafe {
            copied_string(|output, _error| {
                calls += 1;
                scalar_payload = 4096;
                let output = &mut *output;
                output.length = expected.len();
                if output.data.is_null() {
                    assert_eq!(output.capacity, 0);
                    return ffi::BUFFER_TOO_SMALL;
                }
                assert_eq!(output.capacity, expected.len() + 1);
                std::ptr::copy_nonoverlapping(
                    expected.as_ptr(),
                    output.data.cast::<u8>(),
                    expected.len(),
                );
                *output.data.add(expected.len()) = 0;
                ffi::OK
            })
        }
        .unwrap();
        assert_eq!(text.as_bytes(), expected);
        assert_eq!(calls, 2);
        assert_eq!(scalar_payload, 4096);
    }
}

unsafe fn copied_string_bounded(
    owned_bytes: &mut u64,
    mut call: impl FnMut(*mut ffi::StringBuffer, *mut ffi::StringBuffer) -> i32,
) -> Result<String, BackendError> {
    let mut size = ffi::StringBuffer {
        data: std::ptr::null_mut(),
        capacity: 0,
        length: 0,
    };
    let mut error = ErrorBuffer::new();
    let status = call(&mut size, error.raw());
    if status != ffi::BUFFER_TOO_SMALL && status != ffi::OK {
        check(status, &error)?;
    }
    let capacity = size
        .length
        .checked_add(1)
        .ok_or_else(|| backend_error("OCCT edge-treatment text size overflowed."))?;
    let mut bytes = edge_treatment_vec::<u8>(capacity, owned_bytes)?;
    bytes.resize(capacity, 0);
    let mut output = ffi::StringBuffer {
        data: bytes.as_mut_ptr().cast(),
        capacity: bytes.len(),
        length: 0,
    };
    check(call(&mut output, error.raw()), &error)?;
    if output.length != size.length {
        return Err(backend_error(
            "OCCT edge-treatment text changed during transfer.",
        ));
    }
    bytes.truncate(output.length);
    String::from_utf8(bytes).map_err(|_| backend_error("OCCT returned non-UTF-8 text."))
}

fn edge_treatment_charge(bytes: usize, owned: &mut u64) -> Result<(), BackendError> {
    let next = owned
        .checked_add(bytes as u64)
        .ok_or_else(|| backend_error("OCCT edge-treatment byte count overflowed."))?;
    if next > MAX_EDGE_TREATMENT_OWNED_BYTES {
        return Err(unsupported(
            "OCCT edge-treatment transfer exceeds one mebibyte.",
        ));
    }
    *owned = next;
    Ok(())
}

fn edge_treatment_vec<T>(count: usize, owned: &mut u64) -> Result<Vec<T>, BackendError> {
    let before = *owned;
    edge_treatment_charge(
        checked_transfer_bytes(count, std::mem::size_of::<T>())?,
        owned,
    )?;
    let mut values = Vec::new();
    values
        .try_reserve_exact(count)
        .map_err(|_| backend_error("OCCT edge-treatment allocation failed."))?;
    *owned = before;
    edge_treatment_charge(
        checked_transfer_bytes(values.capacity(), std::mem::size_of::<T>())?,
        owned,
    )?;
    Ok(values)
}

unsafe fn admission_facts(raw: *const ffi::Document) -> Result<BrepAdmissionFacts, BackendError> {
    let mut source_unit_to_millimeters = 0.0;
    let mut occurrence_count = 0;
    let source_length_unit = copied_string(|unit, error| {
        ffi::geospec_occt_admission_facts(
            raw,
            &mut source_unit_to_millimeters,
            &mut occurrence_count,
            unit,
            error,
        )
    })?;
    Ok(BrepAdmissionFacts {
        source_length_unit,
        source_unit_to_millimeters,
        occurrence_count,
    })
}

unsafe fn step_subject_metadata(
    raw: *const ffi::Document,
) -> Result<StepSubjectMetadata, BackendError> {
    let mut source_byte_length = 0;
    let mut free_shape_count = 0;
    let schema = copied_string(|schema, error| {
        ffi::geospec_occt_step_subject_metadata(
            raw,
            &mut source_byte_length,
            &mut free_shape_count,
            schema,
            error,
        )
    })?;
    Ok(StepSubjectMetadata {
        schema: (!schema.is_empty()).then_some(schema),
        source_byte_length,
        free_shape_count,
        native_read_stream: true,
    })
}

struct ReportTransfer(*const ffi::Document);

impl Drop for ReportTransfer {
    fn drop(&mut self) {
        unsafe { ffi::geospec_occt_report_discard(self.0) };
    }
}

struct CircularBoreTransfer(*const ffi::Document);

impl Drop for CircularBoreTransfer {
    fn drop(&mut self) {
        unsafe { ffi::geospec_occt_circular_bores_discard(self.0) };
    }
}

struct EdgeTreatmentTransfer(*const ffi::Document);

impl Drop for EdgeTreatmentTransfer {
    fn drop(&mut self) {
        unsafe { ffi::geospec_occt_edge_treatments_discard(self.0) };
    }
}

fn checked_transfer_bytes(count: usize, width: usize) -> Result<usize, BackendError> {
    count
        .checked_mul(width)
        .ok_or_else(|| backend_error("OCCT report transfer byte count exceeds addressable memory."))
}

fn validate_report_sizes(sizes: &ffi::ReportSizes, facets: u32) -> Result<(), BackendError> {
    let has_facts = facets & ffi::REPORT_SHAPE != 0;
    let has_mesh = facets & ffi::REPORT_MESH != 0;
    let has_faces = facets & ffi::REPORT_FACES != 0;
    let expected = [
        (
            sizes.shape_bytes,
            if has_facts {
                std::mem::size_of::<ffi::ShapeFacts>()
            } else {
                0
            },
        ),
        (
            sizes.whole_face_bytes,
            checked_transfer_bytes(
                sizes.whole_face_count,
                std::mem::size_of::<ffi::LocatedFaceFacts>(),
            )?,
        ),
        (
            sizes.occurrence_face_bytes,
            checked_transfer_bytes(
                sizes.occurrence_face_count,
                std::mem::size_of::<ffi::LocatedFaceFacts>(),
            )?,
        ),
        (
            sizes.position_bytes,
            checked_transfer_bytes(sizes.position_count, std::mem::size_of::<[f64; 3]>())?,
        ),
        (
            sizes.triangle_bytes,
            checked_transfer_bytes(sizes.triangle_count, std::mem::size_of::<[u32; 3]>())?,
        ),
    ];
    let absent_facet_counts = (!has_faces
        && (sizes.occurrence_count | sizes.whole_face_count | sizes.occurrence_face_count) != 0)
        || (!has_mesh && (sizes.position_count | sizes.triangle_count) != 0);
    if absent_facet_counts || expected.iter().any(|(actual, expected)| actual != expected) {
        return Err(backend_error(
            "OCCT report transfer byte components do not match their declared counts.",
        ));
    }
    expected
        .iter()
        .try_fold(0usize, |total, (bytes, _)| total.checked_add(*bytes))
        .ok_or_else(|| backend_error("OCCT report transfer total exceeds addressable memory."))?;
    Ok(())
}

/// Prepares `facets` into the bridge transfer slot; the guard discards it.
/// A granted document meshes a new report generation under its grant.
unsafe fn prepare_report(
    raw: *const ffi::Document,
    facets: u32,
    grant: Option<u32>,
) -> Result<(ffi::ReportSizes, ReportTransfer), BackendError> {
    let grant_width = grant.map_or(Ok(0), dedicated_width)?;
    let mut sizes = ffi::ReportSizes::default();
    let mut used_parallel = 0;
    let mut error = ErrorBuffer::new();
    check(
        ffi::geospec_occt_report_prepare_dedicated(
            raw,
            facets,
            grant_width,
            &mut used_parallel,
            &mut sizes,
            error.raw(),
        ),
        &error,
    )?;
    let transfer = ReportTransfer(raw);
    if let Some(width) = grant {
        require_grant_mode(width, used_parallel != 0)?;
    }
    validate_report_sizes(&sizes, facets)?;
    Ok((sizes, transfer))
}

unsafe fn reported_mesh(
    raw: *const ffi::Document,
    grant: Option<u32>,
) -> Result<TriangleMesh, BackendError> {
    let (sizes, _transfer) = prepare_report(raw, ffi::REPORT_MESH, grant)?;
    report_mesh(raw, &sizes)
}

/// Whole-shape facts of the admitted source measuring `parts` (F1; the others
/// come back unmeasured). Only BOUNDS takes the grant, for V2's per-face box
/// pass; the integrals and counts are serial plain calls.
unsafe fn reported_shape(
    raw: *const ffi::Document,
    parts: ShapeParts,
    grant: Option<u32>,
) -> Result<ShapeFacts, BackendError> {
    let facets = [
        (ShapeParts::VOLUME, ffi::REPORT_VOLUME),
        (ShapeParts::AREA, ffi::REPORT_AREA),
        (ShapeParts::BOUNDS, ffi::REPORT_BOUNDS),
        (ShapeParts::COUNTS, ffi::REPORT_COUNTS),
    ]
    .into_iter()
    .filter(|(part, _)| parts.contains(*part))
    .fold(0, |facets, (_, bit)| facets | bit);
    let grant = grant.filter(|_| parts.contains(ShapeParts::BOUNDS));
    let (_sizes, _transfer) = prepare_report(raw, facets, grant)?;
    let mut shape = ffi::ShapeFacts::default();
    let mut error = ErrorBuffer::new();
    check(
        ffi::geospec_occt_report_shape_facts(raw, &mut shape, error.raw()),
        &error,
    )?;
    Ok(shape.into())
}

/// Face tables from the source public faces; no generation and no grant.
/// Address-only tables mark the integrals and boxes unmeasured (NaN).
unsafe fn reported_faces(
    raw: *const ffi::Document,
    measured: bool,
) -> Result<ReportedFaces, BackendError> {
    let facets = if measured {
        ffi::REPORT_FACES | ffi::REPORT_FACE_MEASURES
    } else {
        ffi::REPORT_FACES
    };
    let (sizes, _transfer) = prepare_report(raw, facets, None)?;
    let located = |value: ffi::LocatedFaceFacts, entity: BrepEntity| {
        let mut facts: FaceFacts = value.face.try_into()?;
        let mut bounds: Bounds = value.bounds.into();
        if !measured {
            facts.area = f64::NAN;
            facts.center_of_mass = [f64::NAN; 3];
            bounds = Bounds {
                min: [f64::NAN; 3],
                max: [f64::NAN; 3],
            };
        }
        Ok::<_, BackendError>(LocatedFace {
            entity,
            facts,
            bounds,
            reversed: value.reversed != 0,
        })
    };
    let mut whole_faces = Vec::new();
    whole_faces
        .try_reserve_exact(sizes.whole_face_count)
        .map_err(|_| backend_error("OCCT report face allocation failed."))?;
    for index in 0..sizes.whole_face_count {
        let mut value = ffi::LocatedFaceFacts::default();
        let mut error = ErrorBuffer::new();
        check(
            ffi::geospec_occt_report_face(raw, index, &mut value, error.raw()),
            &error,
        )?;
        let entity = BrepEntity::WholeFace(qualified_query_index(value.face.query_index)?);
        whole_faces.push(located(value, entity)?);
    }
    let mut occurrence_faces = Vec::with_capacity(sizes.occurrence_count);
    let mut occurrence_face_count = 0usize;
    for occurrence in 0..sizes.occurrence_count {
        let occurrence = u32::try_from(occurrence)
            .map_err(|_| backend_error("OCCT report occurrence count exceeds indexed range."))?;
        let count = ffi::geospec_occt_report_occurrence_face_count(raw, occurrence);
        occurrence_face_count = occurrence_face_count
            .checked_add(count)
            .ok_or_else(|| backend_error("OCCT occurrence-face report count overflowed."))?;
        if occurrence_face_count > sizes.occurrence_face_count {
            break;
        }
        let mut faces = Vec::with_capacity(count);
        for index in 0..count {
            let mut value = ffi::LocatedFaceFacts::default();
            let mut error = ErrorBuffer::new();
            check(
                ffi::geospec_occt_report_occurrence_face(
                    raw,
                    occurrence,
                    index,
                    &mut value,
                    error.raw(),
                ),
                &error,
            )?;
            let entity = BrepEntity::Face {
                occurrence,
                face: qualified_query_index(value.face.query_index)?,
            };
            faces.push(located(value, entity)?);
        }
        occurrence_faces.push(Rc::<[LocatedFace]>::from(faces));
    }
    if occurrence_face_count != sizes.occurrence_face_count {
        return Err(backend_error(
            "OCCT occurrence-face report count changed during the owned transfer.",
        ));
    }
    Ok(ReportedFaces {
        whole_faces: whole_faces.into(),
        occurrence_faces,
    })
}

/// `with_bounds == false` never computes source occurrence bounds; the
/// transferred `bounds` are then NaN and must not be read. `name` is left
/// empty (F10: no reader).
unsafe fn transfer_occurrences(
    raw: *const ffi::Document,
    product_count: usize,
    with_bounds: bool,
) -> Result<Vec<OccurrenceFacts>, BackendError> {
    let occurrence_count = ffi::geospec_occt_occurrence_count(raw);
    u32::try_from(occurrence_count)
        .map_err(|_| backend_error("OCCT source occurrence count exceeds indexed range."))?;
    u32::try_from(product_count)
        .map_err(|_| backend_error("OCCT source product count exceeds indexed range."))?;
    checked_transfer_bytes(occurrence_count, std::mem::size_of::<OccurrenceFacts>())?;
    let mut occurrences = Vec::new();
    occurrences
        .try_reserve_exact(occurrence_count)
        .map_err(|_| backend_error("OCCT source occurrence allocation failed."))?;
    let occurrence = if with_bounds {
        ffi::geospec_occt_occurrence
    } else {
        ffi::geospec_occt_occurrence_structure
    };
    for index in 0..occurrence_count {
        let mut output = ffi::OccurrenceFacts::default();
        let mut error = ErrorBuffer::new();
        check(
            occurrence(
                raw,
                index,
                &mut output,
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                error.raw(),
            ),
            &error,
        )?;
        if !with_bounds {
            output.bounds = ffi::Bounds {
                min: [f64::NAN; 3],
                max: [f64::NAN; 3],
            };
        }
        if output.placement.iter().any(|value| !value.is_finite())
            || (with_bounds
                && (output.bounds.min.iter().any(|value| !value.is_finite())
                    || output.bounds.max.iter().any(|value| !value.is_finite())
                    || (0..3).any(|axis| output.bounds.min[axis] > output.bounds.max[axis])))
        {
            return Err(backend_error(
                "OCCT source occurrence placement/bounds are not finite and ordered.",
            ));
        }
        let parent = if output.parent < 0 {
            if output.parent != -1 {
                return Err(backend_error("OCCT source occurrence parent is invalid."));
            }
            None
        } else {
            let parent = usize::try_from(output.parent)
                .map_err(|_| backend_error("OCCT source occurrence parent overflows."))?;
            if parent >= occurrence_count {
                return Err(backend_error(
                    "OCCT source occurrence parent is out of range.",
                ));
            }
            Some(parent as u32)
        };
        if output.product as usize >= product_count {
            return Err(backend_error(
                "OCCT source occurrence product is out of range.",
            ));
        }
        if output.ordinal_count > occurrence_count {
            return Err(backend_error(
                "OCCT source occurrence ordinal path is too long.",
            ));
        }
        checked_transfer_bytes(output.ordinal_count, std::mem::size_of::<u32>())?;
        let mut ordinal_path = Vec::new();
        ordinal_path
            .try_reserve_exact(output.ordinal_count)
            .map_err(|_| backend_error("OCCT source ordinal allocation failed."))?;
        for ordinal_index in 0..output.ordinal_count {
            let mut ordinal = 0;
            let mut error = ErrorBuffer::new();
            check(
                ffi::geospec_occt_occurrence_ordinal(
                    raw,
                    index,
                    ordinal_index,
                    &mut ordinal,
                    error.raw(),
                ),
                &error,
            )?;
            ordinal_path.push(ordinal);
        }
        occurrences.push(OccurrenceFacts {
            name: String::new(),
            placement: output.placement,
            bounds: output.bounds.into(),
            path: copied_string(|path, error| {
                ffi::geospec_occt_occurrence_identity(
                    raw,
                    index,
                    path,
                    std::ptr::null_mut(),
                    std::ptr::null_mut(),
                    error,
                )
            })?,
            parent,
            product: output.product,
            product_name: copied_string(|product_name, error| {
                ffi::geospec_occt_occurrence_identity(
                    raw,
                    index,
                    std::ptr::null_mut(),
                    product_name,
                    std::ptr::null_mut(),
                    error,
                )
            })?,
            instance_name: {
                let value = copied_string(|instance_name, error| {
                    ffi::geospec_occt_occurrence_identity(
                        raw,
                        index,
                        std::ptr::null_mut(),
                        std::ptr::null_mut(),
                        instance_name,
                        error,
                    )
                })?;
                (!value.is_empty()).then_some(value)
            },
            ordinal_path,
        });
    }
    if ffi::geospec_occt_occurrence_count(raw) != occurrence_count
        || ffi::geospec_occt_product_count(raw) != product_count
    {
        return Err(backend_error(
            "OCCT source occurrence/product count changed during transfer.",
        ));
    }
    Ok(occurrences)
}

/// Subshape names and datums, read from admission; no report and no mesh.
unsafe fn document_rows(raw: *const ffi::Document) -> Result<DocumentRows, BackendError> {
    let subshape_count = ffi::geospec_occt_subshape_count(raw);
    let mut subshapes = Vec::with_capacity(subshape_count);
    for index in 0..subshape_count {
        let mut output = ffi::SubshapeFacts::default();
        let occurrence_path = copied_string(|path, error| {
            ffi::geospec_occt_subshape(
                raw,
                index,
                &mut output,
                path,
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                error,
            )
        })?;
        let name = copied_string(|name, error| {
            ffi::geospec_occt_subshape(
                raw,
                index,
                &mut output,
                std::ptr::null_mut(),
                name,
                std::ptr::null_mut(),
                error,
            )
        })?;
        let shape_label = copied_string(|label, error| {
            ffi::geospec_occt_subshape(
                raw,
                index,
                &mut output,
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                label,
                error,
            )
        })?;
        subshapes.push(SubshapeFacts {
            occurrence: (output.occurrence >= 0).then_some(output.occurrence as u32),
            occurrence_path,
            name,
            shape_type: match output.shape_type {
                0 => SubshapeType::Face,
                1 => SubshapeType::Edge,
                2 => SubshapeType::Vertex,
                3 => SubshapeType::Solid,
                _ => return Err(backend_error("OCCT returned an unknown subshape type.")),
            },
            face_index: (output.has_face_index != 0).then_some(output.face_index),
            shape_label: (!shape_label.is_empty()).then_some(shape_label),
        });
    }

    let semantic_datum_count = ffi::geospec_occt_semantic_datum_count(raw);
    let mut semantic_datums = Vec::with_capacity(semantic_datum_count);
    for index in 0..semantic_datum_count {
        let mut output = ffi::SemanticDatumFacts::default();
        let occurrence_path = copied_string(|path, error| {
            ffi::geospec_occt_semantic_datum(
                raw,
                index,
                &mut output,
                path,
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                error,
            )
        })?;
        let label = copied_string(|label, error| {
            ffi::geospec_occt_semantic_datum(
                raw,
                index,
                &mut output,
                std::ptr::null_mut(),
                label,
                std::ptr::null_mut(),
                error,
            )
        })?;
        let feature_name = copied_string(|feature, error| {
            ffi::geospec_occt_semantic_datum(
                raw,
                index,
                &mut output,
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                feature,
                error,
            )
        })?;
        let mut face_indices = Vec::with_capacity(output.face_count);
        for face_index in 0..output.face_count {
            let mut face = 0;
            let mut error = ErrorBuffer::new();
            check(
                ffi::geospec_occt_semantic_datum_face(
                    raw,
                    index,
                    face_index,
                    &mut face,
                    error.raw(),
                ),
                &error,
            )?;
            face_indices.push(face);
        }
        semantic_datums.push(SemanticDatumFacts {
            occurrence: (output.occurrence >= 0).then_some(output.occurrence as u32),
            occurrence_path,
            label,
            feature_name: (!feature_name.is_empty()).then_some(feature_name),
            face_indices,
        });
    }

    let datum_placement_count = ffi::geospec_occt_datum_placement_count(raw);
    let mut datum_placements = Vec::with_capacity(datum_placement_count);
    for index in 0..datum_placement_count {
        let mut output = ffi::DatumPlacementFacts::default();
        let occurrence_path = copied_string(|path, error| {
            ffi::geospec_occt_datum_placement(
                raw,
                index,
                &mut output,
                path,
                std::ptr::null_mut(),
                error,
            )
        })?;
        let name = copied_string(|name, error| {
            ffi::geospec_occt_datum_placement(
                raw,
                index,
                &mut output,
                std::ptr::null_mut(),
                name,
                error,
            )
        })?;
        datum_placements.push(DatumPlacementFacts {
            occurrence: (output.occurrence >= 0).then_some(output.occurrence as u32),
            occurrence_path,
            name,
            origin: output.origin,
            x_axis: output.x_axis,
            z_axis: output.z_axis,
        });
    }

    Ok(DocumentRows {
        subshapes,
        datum_placements,
        semantic_datums,
    })
}

/// Source whole faces without their `AddOptimal` boxes (F6: NaN here;
/// `face_optimal_bounds` measures the faces whose box is read).
unsafe fn whole_faces(raw: *const ffi::Document) -> Result<Vec<LocatedFace>, BackendError> {
    let count = ffi::geospec_occt_face_count(raw);
    let mut result = Vec::with_capacity(count);
    for index in 0..count {
        let mut face = ffi::FaceFacts::default();
        let mut reversed = 0;
        let mut error = ErrorBuffer::new();
        check(
            ffi::geospec_occt_face(raw, index, &mut face, error.raw()),
            &error,
        )?;
        check(
            ffi::geospec_occt_face_location(
                raw,
                index,
                std::ptr::null_mut(),
                &mut reversed,
                error.raw(),
            ),
            &error,
        )?;
        result.push(LocatedFace {
            entity: BrepEntity::WholeFace(qualified_query_index(face.query_index)?),
            facts: face.try_into()?,
            bounds: Bounds {
                min: [f64::NAN; 3],
                max: [f64::NAN; 3],
            },
            reversed: reversed != 0,
        });
    }
    Ok(result)
}

unsafe fn face_optimal_bounds(
    raw: *const ffi::Document,
    public_face: u32,
) -> Result<Bounds, BackendError> {
    let mut bounds = ffi::Bounds::default();
    let mut reversed = 0;
    let mut error = ErrorBuffer::new();
    check(
        ffi::geospec_occt_face_location(
            raw,
            public_face as usize,
            &mut bounds,
            &mut reversed,
            error.raw(),
        ),
        &error,
    )?;
    Ok(bounds.into())
}

fn qualified_query_index(index: u32) -> Result<u32, BackendError> {
    if index == 0 {
        return Err(unsupported(
            "Public face traversal has no unique located, oriented private query association.",
        ));
    }
    Ok(index)
}

// The first edge demand maps the occurrence's edge addresses, which can fail.
unsafe fn edge_address_count(
    raw: *const ffi::Document,
    occurrence: u32,
) -> Result<usize, BackendError> {
    let mut count = 0;
    let mut error = ErrorBuffer::new();
    check(
        ffi::geospec_occt_occurrence_edge_count(raw, occurrence, &mut count, error.raw()),
        &error,
    )?;
    Ok(count)
}

unsafe fn validity(raw: *const ffi::Document) -> Result<ValidityFacts, BackendError> {
    Ok(validity_with_control(raw, 0)?.0)
}

unsafe fn validity_with_control(
    raw: *const ffi::Document,
    grant_width: i32,
) -> Result<(ValidityFacts, bool), BackendError> {
    let mut value = ffi::ValidityFacts::default();
    let mut used_parallel = 0;
    let reason = copied_string_small(|reason, error| {
        ffi::geospec_occt_validity_dedicated(
            raw,
            grant_width,
            &mut used_parallel,
            &mut value,
            reason,
            error,
        )
    })?;
    Ok((
        ValidityFacts {
            valid: value.valid != 0,
            checks: None,
            max_tolerance: Some(value.max_tolerance),
            free_bounds: Some(value.free_bounds),
            small_edges: None,
            same_parameter: Some(value.same_parameter != 0),
            closed_shells: Some(value.closed_shells != 0),
            closed_solids: Some(value.closed_solids != 0),
            solid_count: Some(value.solid_count),
            invalid_solid_count: Some(value.invalid_solid_count),
            open_edge_count: Some(value.open_edge_count),
            closed_wires: Some(value.closed_wires != 0),
            reason: (!reason.is_empty()).then_some(reason),
        },
        used_parallel != 0,
    ))
}

unsafe fn classify_face_points(
    raw: *const ffi::Document,
    face: BrepEntity,
    points: &[[f64; 3]],
    tolerance: f64,
) -> Result<Vec<PointState>, BackendError> {
    let flat = points.iter().flatten().copied().collect::<Vec<_>>();
    let mut states = vec![0; points.len()];
    let mut error = ErrorBuffer::new();
    check(
        ffi::geospec_occt_classify_face_points(
            raw,
            face.into(),
            flat.as_ptr(),
            points.len(),
            tolerance,
            states.as_mut_ptr(),
            states.len(),
            error.raw(),
        ),
        &error,
    )?;
    states.into_iter().map(point_state).collect()
}

unsafe fn regular_solid_containment_with_control(
    raw: *const ffi::Document,
    subject: BrepEntity,
    target: BrepEntity,
    memo: *mut ffi::OperandMemo,
    grant_width: i32,
) -> Result<(RegularSolidContainment, bool), BackendError> {
    let mut value = ffi::RegularSolidContainment::default();
    let mut used_parallel = 0;
    let mut error = ErrorBuffer::new();
    check(
        ffi::geospec_occt_regular_solid_containment_dedicated(
            raw,
            subject.into(),
            target.into(),
            memo,
            grant_width,
            &mut used_parallel,
            &mut value,
            error.raw(),
        ),
        &error,
    )?;
    Ok((
        RegularSolidContainment {
            contained: value.contained != 0,
            residual_solid_count: value.residual_solid_count,
            residual_volume: value.residual_volume,
            residual_bounds: (value.has_residual_bounds != 0).then(|| value.residual_bounds.into()),
            residual_center_of_mass: (value.has_residual_center_of_mass != 0)
                .then_some(value.residual_center_of_mass),
        },
        used_parallel != 0,
    ))
}

unsafe fn cylinder_axial_extent(
    raw: *const ffi::Document,
    face: BrepEntity,
) -> Result<CylinderAxialExtent, BackendError> {
    let mut value = ffi::CylinderAxialExtent::default();
    let mut error = ErrorBuffer::new();
    check(
        ffi::geospec_occt_cylinder_axial_extent(raw, face.into(), &mut value, error.raw()),
        &error,
    )?;
    Ok(CylinderAxialExtent {
        origin: value.origin,
        axis: value.axis,
        radius: value.radius,
        from: value.from,
        to: value.to,
    })
}

fn nominal_cylindrical_band(
    value: ffi::NominalCylindricalBand,
) -> Result<NominalCylindricalBand, BackendError> {
    let invalid =
        || backend_error("OCCT returned an invalid nominal cylindrical-band certificate.");
    let finite = |values: &[f64]| values.iter().all(|v| v.is_finite());
    let direction = |values: &[f64; 3]| finite(values) && values.iter().any(|v| *v != 0.0);
    let residual = |v: f64, limit: f64| v.is_finite() && v >= 0.0 && v <= limit;
    if value.profile != 0
        || value.source_face_entity == 0
        || value.private_query_face == 0
        || !(1..=32).contains(&value.source_route_count)
        || value.source_route[..value.source_route_count as usize].contains(&0)
        || value.source_route[value.source_route_count as usize..]
            .iter()
            .any(|v| *v != 0)
        || !finite(&value.origin)
        || !direction(&value.axis)
        || !direction(&value.phase_x)
        || !direction(&value.phase_y)
        || !value.radius.is_finite()
        || value.radius <= 0.0
        || !finite(&value.parameter_bounds)
        || value.parameter_bounds[0] >= value.parameter_bounds[1]
        || value.from != value.parameter_bounds[2]
        || value.to != value.parameter_bounds[3]
        || value.from >= value.to
        || !(value.to - value.from).is_finite()
        || !value.surface_period.is_finite()
        || value.surface_period <= 0.0
        || !value.face_tolerance_mm.is_finite()
        || value.face_tolerance_mm < 0.0
        || !residual(value.period_residual_mm, value.face_tolerance_mm)
        || !finite(&value.seam_origin)
        || !direction(&value.seam_axis)
        || !finite(&value.seam_curve_range)
        || value.seam_curve_range[0] >= value.seam_curve_range[1]
        || !(1..=3).contains(&value.seam_edge_index)
        || value
            .seam_vertex_indices
            .iter()
            .any(|v| !(1..=2).contains(v))
        || value.seam_vertex_indices[0] == value.seam_vertex_indices[1]
        || value
            .edge_tolerances_mm
            .iter()
            .chain(value.vertex_tolerances_mm.iter())
            .any(|v| !v.is_finite() || *v < 0.0)
    {
        return Err(invalid());
    }
    for (index, vertex) in value.vertices.iter().enumerate() {
        if vertex.vertex_index != index as u32 + 1 || !finite(&vertex.point) {
            return Err(invalid());
        }
    }
    for rim in &value.rims {
        if !(1..=3).contains(&rim.edge_index)
            || rim.edge_index == value.seam_edge_index
            || !finite(&rim.center)
            || !direction(&rim.axis)
            || !direction(&rim.phase_x)
            || !direction(&rim.phase_y)
            || !rim.radius.is_finite()
            || rim.radius <= 0.0
            || !finite(&rim.curve_range)
            || rim.curve_range[0] >= rim.curve_range[1]
            || !rim.curve_period.is_finite()
            || rim.curve_period <= 0.0
            || !(1..=2).contains(&rim.vertex_indices[0])
            || rim.vertex_indices[0] != rim.vertex_indices[1]
        {
            return Err(invalid());
        }
    }
    if value.rims[0].edge_index == value.rims[1].edge_index
        || value.rims[0].vertex_indices[0] == value.rims[1].vertex_indices[0]
    {
        return Err(invalid());
    }
    let mut sides = [false; 4];
    let mut seam_direction = 0;
    for (boundary, measured) in value.boundary.iter().zip(&value.boundary_residuals) {
        if !(0..=3).contains(&boundary.side)
            || !(0..=1).contains(&boundary.orientation)
            || boundary.pcurve_stored != 1
            || !finite(&boundary.curve_range)
            || boundary.curve_range[0] >= boundary.curve_range[1]
            || boundary.parameter_endpoints.iter().any(|v| !finite(v))
            || !measured.limit_mm.is_finite()
            || measured.limit_mm < 0.0
            || !residual(measured.parameter_coverage_mm, measured.limit_mm)
            || !residual(measured.curve_surface_mm, measured.limit_mm)
            || !residual(measured.vertex_attachment_mm, measured.limit_mm)
        {
            return Err(invalid());
        }
        let side = boundary.side as usize;
        if std::mem::replace(&mut sides[side], true) {
            return Err(invalid());
        }
        let (edge, vertices, range) = if side < 2 {
            seam_direction += if boundary.orientation == 0 { 1 } else { -1 };
            (
                value.seam_edge_index,
                value.seam_vertex_indices,
                value.seam_curve_range,
            )
        } else {
            let rim = &value.rims[side - 2];
            (rim.edge_index, rim.vertex_indices, rim.curve_range)
        };
        let limit = value
            .face_tolerance_mm
            .max(value.edge_tolerances_mm[edge as usize - 1])
            .max(value.vertex_tolerances_mm[vertices[0] as usize - 1])
            .max(value.vertex_tolerances_mm[vertices[1] as usize - 1]);
        if boundary.edge_index != edge
            || boundary.curve_range != range
            || measured.limit_mm != limit
        {
            return Err(invalid());
        }
    }
    if seam_direction != 0 || sides.contains(&false) {
        return Err(invalid());
    }
    Ok(NominalCylindricalBand {
        profile: CylindricalBandProfile::NominalV1,
        occurrence: value.occurrence,
        public_face_ordinal: value.public_face_ordinal,
        private_query_face: value.private_query_face,
        source_face_entity: value.source_face_entity,
        source_route_count: value.source_route_count,
        source_route: value.source_route,
        source_same_sense: ffi_bool(value.source_same_sense)?,
        transferred_reversed: ffi_bool(value.transferred_reversed)?,
        origin: value.origin,
        axis: value.axis,
        phase_x: value.phase_x,
        phase_y: value.phase_y,
        radius: value.radius,
        from: value.from,
        to: value.to,
        parameter_bounds: value.parameter_bounds,
        surface_period: value.surface_period,
        rims: value.rims.map(|rim| CylindricalBandRim {
            edge_index: rim.edge_index,
            center: rim.center,
            axis: rim.axis,
            phase_x: rim.phase_x,
            phase_y: rim.phase_y,
            radius: rim.radius,
            curve_range: rim.curve_range,
            curve_period: rim.curve_period,
            vertex_indices: rim.vertex_indices,
        }),
        seam_edge_index: value.seam_edge_index,
        seam_origin: value.seam_origin,
        seam_axis: value.seam_axis,
        seam_curve_range: value.seam_curve_range,
        seam_vertex_indices: value.seam_vertex_indices,
        boundary: [
            cylinder_boundary_use(value.boundary[0])?,
            cylinder_boundary_use(value.boundary[1])?,
            cylinder_boundary_use(value.boundary[2])?,
            cylinder_boundary_use(value.boundary[3])?,
        ],
        vertices: value.vertices.map(|v| CylinderVertex {
            vertex_index: v.vertex_index,
            point: v.point,
        }),
        face_tolerance_mm: value.face_tolerance_mm,
        edge_tolerances_mm: value.edge_tolerances_mm,
        vertex_tolerances_mm: value.vertex_tolerances_mm,
        period_residual_mm: value.period_residual_mm,
        boundary_residuals: value
            .boundary_residuals
            .map(|r| CylindricalBandBoundaryResidual {
                parameter_coverage_mm: r.parameter_coverage_mm,
                curve_surface_mm: r.curve_surface_mm,
                vertex_attachment_mm: r.vertex_attachment_mm,
                limit_mm: r.limit_mm,
            }),
    })
}

fn circular_bore_termination(value: i32) -> Result<CircularBoreTermination, BackendError> {
    match value {
        0 => Ok(CircularBoreTermination::Mouth),
        1 => Ok(CircularBoreTermination::PlanarDiskBottom),
        _ => Err(backend_error(
            "OCCT returned an unknown circular bore termination.",
        )),
    }
}

fn circular_bore_end(
    value: ffi::CircularBoreEnd,
    public_face_count: usize,
) -> Result<CircularBoreEnd, BackendError> {
    if value.owning_solid_edge_ordinal == 0
        || value.adjacent_public_face_ordinal as usize >= public_face_count
    {
        return Err(backend_error(
            "OCCT returned an invalid circular bore end association.",
        ));
    }
    Ok(CircularBoreEnd {
        owning_solid_edge_ordinal: value.owning_solid_edge_ordinal,
        adjacent_public_face_ordinal: value.adjacent_public_face_ordinal,
        termination: circular_bore_termination(value.termination)?,
    })
}

fn circular_bore_topology(
    value: &ffi::CircularBoreCandidate,
    public_face_count: usize,
) -> Result<CircularBoreTopology, BackendError> {
    let band_values = value.band.origin.into_iter().chain(value.band.axis).chain([
        value.band.radius,
        value.band.from,
        value.band.to,
    ]);
    if band_values.into_iter().any(|number| !number.is_finite())
        || value.band.radius <= 0.0
        || value.band.from >= value.band.to
        || !value.maximum_topology_tolerance_mm.is_finite()
        || value.maximum_topology_tolerance_mm < 0.0
        || value.interior_residual_solid_count != 0
    {
        return Err(backend_error(
            "OCCT returned invalid qualified circular bore topology.",
        ));
    }
    Ok(CircularBoreTopology {
        owning_solid_ordinal: value.owning_solid_ordinal,
        band: CylinderAxialExtent {
            origin: value.band.origin,
            axis: value.band.axis,
            radius: value.band.radius,
            from: value.band.from,
            to: value.band.to,
        },
        ends: [
            circular_bore_end(value.ends[0], public_face_count)?,
            circular_bore_end(value.ends[1], public_face_count)?,
        ],
        maximum_topology_tolerance_mm: value.maximum_topology_tolerance_mm,
        interior_residual_solid_count: value.interior_residual_solid_count,
    })
}

fn circular_bore_disposition(
    value: &ffi::CircularBoreCandidate,
    public_face_count: usize,
) -> Result<CircularBoreDisposition, BackendError> {
    match value.disposition {
        0 if value.reason == 0 => Ok(CircularBoreDisposition::Qualified(circular_bore_topology(
            value,
            public_face_count,
        )?)),
        0 => Err(backend_error(
            "OCCT returned an unknown qualified circular bore reason.",
        )),
        1 => Ok(CircularBoreDisposition::NonMember(match value.reason {
            0 => CircularBoreNonMember::ExteriorCylinder,
            1 => CircularBoreNonMember::SealedCavity,
            2 => CircularBoreNonMember::ObstructedInterior,
            _ => {
                return Err(backend_error(
                    "OCCT returned an unknown circular bore nonmembership reason.",
                ));
            }
        })),
        2 => Ok(CircularBoreDisposition::Unqualified(match value.reason {
            0 => CircularBoreUnqualified::UnsupportedSurface,
            1 => CircularBoreUnqualified::UnsupportedOrientation,
            2 => CircularBoreUnqualified::AmbiguousOwnership,
            3 => CircularBoreUnqualified::InvalidSolid,
            4 => CircularBoreUnqualified::IncompleteBand,
            5 => CircularBoreUnqualified::UnsupportedTermination,
            6 => CircularBoreUnqualified::AmbiguousAssociation,
            _ => {
                return Err(backend_error(
                    "OCCT returned an unknown circular bore qualification reason.",
                ));
            }
        })),
        _ => Err(backend_error(
            "OCCT returned an unknown circular bore disposition.",
        )),
    }
}

unsafe fn circular_bores(
    raw: *const ffi::Document,
    max_candidates: usize,
) -> Result<CircularBoreInventory, BackendError> {
    Ok(circular_bores_with_control(raw, max_candidates, 0)?.0)
}

unsafe fn circular_bores_with_control(
    raw: *const ffi::Document,
    max_candidates: usize,
    grant_width: i32,
) -> Result<(CircularBoreInventory, bool), BackendError> {
    let limit = max_candidates.min(MAX_CIRCULAR_BORE_CANDIDATES);
    let mut count = 0usize;
    let mut used_parallel = 0;
    let mut error = ErrorBuffer::new();
    check(
        ffi::geospec_occt_circular_bores_prepare_dedicated(
            raw,
            limit,
            std::mem::size_of::<CircularBoreCandidate>(),
            std::mem::size_of::<CircularBoreInventory>(),
            grant_width,
            &mut used_parallel,
            &mut count,
            error.raw(),
        ),
        &error,
    )?;
    let _transfer = CircularBoreTransfer(raw);
    if count > limit {
        return Err(backend_error(
            "OCCT circular bore count exceeds the requested bound.",
        ));
    }
    let simultaneous_bytes = std::mem::size_of::<CircularBoreInventory>()
        .checked_add(checked_transfer_bytes(
            count,
            std::mem::size_of::<CircularBoreCandidate>(),
        )?)
        .and_then(|bytes| {
            bytes.checked_add(count.checked_mul(std::mem::size_of::<ffi::CircularBoreCandidate>())?)
        })
        .ok_or_else(|| backend_error("OCCT circular bore transfer byte count overflowed."))?;
    if simultaneous_bytes as u64 > MAX_CIRCULAR_BORE_OWNED_BYTES {
        return Err(backend_error(
            "OCCT circular bore transfer exceeds one mebibyte.",
        ));
    }

    let public_face_count = ffi::geospec_occt_face_count(raw);
    let private_face_count = ffi::geospec_occt_query_face_count(raw);
    let mut candidates = Vec::with_capacity(count);
    let mut previous_public_ordinal = None;
    for index in 0..count {
        let mut value = ffi::CircularBoreCandidate::default();
        check(
            ffi::geospec_occt_circular_bore(raw, index, &mut value, error.raw()),
            &error,
        )?;
        if value.public_face_ordinal as usize >= public_face_count
            || value.private_query_face as usize > private_face_count
            || previous_public_ordinal.is_some_and(|previous| value.public_face_ordinal <= previous)
        {
            return Err(backend_error(
                "OCCT returned an invalid circular bore public order.",
            ));
        }
        previous_public_ordinal = Some(value.public_face_ordinal);
        candidates.push(CircularBoreCandidate {
            public_face_ordinal: value.public_face_ordinal,
            private_query_face: value.private_query_face,
            disposition: circular_bore_disposition(&value, public_face_count)?,
        });
    }
    let inventory = CircularBoreInventory { candidates };
    if inventory.owned_bytes() > MAX_CIRCULAR_BORE_OWNED_BYTES {
        return Err(backend_error(
            "OCCT returned an oversized circular bore inventory.",
        ));
    }
    Ok((inventory, used_parallel != 0))
}

fn edge_treatment_reason(value: i32) -> Result<EdgeTreatmentReason, BackendError> {
    Ok(match value {
        0 => EdgeTreatmentReason::UnsupportedSurface,
        1 => EdgeTreatmentReason::UnsupportedTrim,
        2 => EdgeTreatmentReason::UnsupportedOrientation,
        3 => EdgeTreatmentReason::AmbiguousOwnership,
        4 => EdgeTreatmentReason::InvalidSolid,
        5 => EdgeTreatmentReason::AmbiguousAssociation,
        6 => EdgeTreatmentReason::IncompleteBoundary,
        7 => EdgeTreatmentReason::DegenerateSupport,
        8 => EdgeTreatmentReason::OutsideTopology,
        9 => EdgeTreatmentReason::OutsideMaterialBranch,
        10 => EdgeTreatmentReason::NonTangentSupport,
        11 => EdgeTreatmentReason::UnequalOffsets,
        _ => {
            return Err(backend_error(
                "OCCT returned an unknown edge-treatment reason.",
            ))
        }
    })
}

fn edge_treatment_boundary_role(value: i32) -> Result<EdgeTreatmentBoundaryRole, BackendError> {
    Ok(match value {
        0 => EdgeTreatmentBoundaryRole::Rail0,
        1 => EdgeTreatmentBoundaryRole::Rail1,
        2 => EdgeTreatmentBoundaryRole::End,
        3 => EdgeTreatmentBoundaryRole::Seam,
        _ => return Err(backend_error("OCCT returned an unknown boundary-use role.")),
    })
}

fn edge_treatment_residual_kind(value: i32) -> Result<EdgeTreatmentResidualKind, BackendError> {
    Ok(match value {
        0 => EdgeTreatmentResidualKind::RailCoincidence,
        1 => EdgeTreatmentResidualKind::AxisCoincidence,
        2 => EdgeTreatmentResidualKind::ParallelDirection,
        3 => EdgeTreatmentResidualKind::TangentDirection,
        4 => EdgeTreatmentResidualKind::EqualOffsets,
        5 => EdgeTreatmentResidualKind::RailStation,
        6 => EdgeTreatmentResidualKind::MaterialBranch,
        _ => return Err(backend_error("OCCT returned an unknown residual kind.")),
    })
}

fn finite(values: &[f64]) -> bool {
    values.iter().all(|value| value.is_finite())
}

/// The analytic surface and its parameter bounds, which `FaceFacts` no
/// longer carries (F10).
fn edge_treatment_surface(value: ffi::FaceFacts) -> Result<(SurfaceFacts, [f64; 4]), BackendError> {
    if !finite(&value.parameter_bounds)
        || !finite(&value.origin)
        || !finite(&value.direction)
        || !finite(&[value.radius, value.secondary_radius, value.semi_angle])
        || value.parameter_bounds[0] >= value.parameter_bounds[1]
        || value.parameter_bounds[2] >= value.parameter_bounds[3]
        || !matches!(value.surface_type, 0 | 1 | 2 | 4)
        || value.direction.iter().all(|component| *component == 0.0)
    {
        return Err(backend_error(
            "OCCT returned invalid analytic edge-treatment geometry.",
        ));
    }
    let face: FaceFacts = value.try_into()?;
    Ok((face.surface, value.parameter_bounds))
}

fn edge_treatment_support(
    value: ffi::EdgeTreatmentSupport,
    public_face_count: usize,
    private_face_count: usize,
) -> Result<EdgeTreatmentSupport, BackendError> {
    if value.public_face_ordinal as usize >= public_face_count
        || value.private_query_face == 0
        || value.private_query_face as usize > private_face_count
        || !matches!(value.transferred_reversed, 0 | 1)
        || !value.maximum_topology_tolerance_mm.is_finite()
        || value.maximum_topology_tolerance_mm < 0.0
    {
        return Err(backend_error(
            "OCCT returned an invalid edge-treatment support.",
        ));
    }
    let (surface, parameter_bounds) = edge_treatment_surface(value.surface)?;
    if !finite(&parameter_bounds) {
        return Err(backend_error(
            "OCCT returned non-finite edge-treatment support bounds.",
        ));
    }
    Ok(EdgeTreatmentSupport {
        public_face_ordinal: value.public_face_ordinal,
        private_query_face: value.private_query_face,
        parameter_bounds,
        surface,
        transferred_reversed: value.transferred_reversed != 0,
        maximum_topology_tolerance_mm: value.maximum_topology_tolerance_mm,
    })
}

unsafe fn edge_treatment_certificate(
    raw: *const ffi::Document,
    row: usize,
    feature: i32,
    public_face_count: usize,
    private_face_count: usize,
    owned_bytes: &mut u64,
    error: &mut ErrorBuffer,
) -> Result<EdgeTreatmentCertificate, BackendError> {
    let mut value = ffi::EdgeTreatmentCertificate::default();
    check(
        ffi::geospec_occt_edge_treatment_certificate_get(
            raw,
            row,
            feature,
            &mut value,
            error.raw(),
        ),
        error,
    )?;
    if value.boundary_use_count > MAX_EDGE_TREATMENT_BOUNDARY_USES
        || value.residual_count > MAX_EDGE_TREATMENT_RESIDUALS
        || value.boundary_use_count == 0
        || value.residual_count == 0
        || value.wire_count == 0
        || !value.metric_value_mm.is_finite()
        || value.metric_value_mm <= 0.0
        || !value.maximum_topology_tolerance_mm.is_finite()
        || value.maximum_topology_tolerance_mm < 0.0
        || !finite(&value.sweep_interval)
    {
        return Err(backend_error(
            "OCCT returned an invalid edge-treatment certificate.",
        ));
    }
    edge_treatment_charge(std::mem::size_of::<EdgeTreatmentCertificate>(), owned_bytes)?;
    let (surface, parameter_bounds) = edge_treatment_surface(value.surface)?;
    if !finite(&parameter_bounds) {
        return Err(backend_error(
            "OCCT returned non-finite edge-treatment parameter bounds.",
        ));
    }
    let kind = match value.kind {
        0 => EdgeTreatmentKind::PlanarChamfer,
        1 => EdgeTreatmentKind::ConicalChamfer,
        2 => EdgeTreatmentKind::CylindricalFillet,
        3 => EdgeTreatmentKind::ToroidalFillet,
        _ => {
            return Err(backend_error(
                "OCCT returned an unknown edge-treatment kind.",
            ))
        }
    };
    let material_side = match value.material_side {
        0 => EdgeTreatmentMaterialSide::Convex,
        1 => EdgeTreatmentMaterialSide::Concave,
        _ => return Err(backend_error("OCCT returned an unknown material side.")),
    };
    let full_u = ffi_bool(value.full_u)?;
    if (feature == 0)
        != matches!(
            kind,
            EdgeTreatmentKind::PlanarChamfer | EdgeTreatmentKind::ConicalChamfer
        )
        || value.surface.surface_type
            != match kind {
                EdgeTreatmentKind::PlanarChamfer => 0,
                EdgeTreatmentKind::ConicalChamfer => 2,
                EdgeTreatmentKind::CylindricalFillet => 1,
                EdgeTreatmentKind::ToroidalFillet => 4,
            }
        || value.sweep_interval[0] >= value.sweep_interval[1]
    {
        return Err(backend_error(
            "OCCT returned an inconsistent edge-treatment family.",
        ));
    }
    let supports = [
        edge_treatment_support(value.supports[0], public_face_count, private_face_count)?,
        edge_treatment_support(value.supports[1], public_face_count, private_face_count)?,
    ];
    let mut boundary_uses = edge_treatment_vec(value.boundary_use_count, owned_bytes)?;
    for index in 0..value.boundary_use_count {
        let mut boundary = ffi::EdgeTreatmentBoundaryUse::default();
        check(
            ffi::geospec_occt_edge_treatment_boundary_use_get(
                raw,
                row,
                feature,
                index,
                &mut boundary,
                error.raw(),
            ),
            error,
        )?;
        if boundary.owning_solid_edge_ordinal == 0
            || boundary.wire_ordinal >= value.wire_count
            || !matches!(boundary.reversed, 0 | 1)
            || !matches!(boundary.seam, 0 | 1)
            || !finite(&boundary.parameter_range)
            || boundary.parameter_range[0] > boundary.parameter_range[1]
            || !finite(&boundary.start)
            || !finite(&boundary.end)
            || !boundary.edge_tolerance_mm.is_finite()
            || boundary.edge_tolerance_mm < 0.0
            || !finite(&boundary.vertex_tolerances_mm)
            || boundary
                .vertex_tolerances_mm
                .iter()
                .any(|value| *value < 0.0)
        {
            return Err(backend_error(
                "OCCT returned an invalid edge-treatment boundary use.",
            ));
        }
        let edge: EdgeFacts = boundary.curve.try_into()?;
        if !edge.length.is_finite()
            || edge.length <= 0.0
            || !finite(&boundary.curve.origin)
            || !finite(&boundary.curve.direction)
            || !finite(&[boundary.curve.radius, boundary.curve.secondary_radius])
        {
            return Err(backend_error(
                "OCCT returned an invalid edge-treatment boundary length.",
            ));
        }
        boundary_uses.push(EdgeTreatmentBoundaryUse {
            owning_solid_edge_ordinal: boundary.owning_solid_edge_ordinal,
            wire_ordinal: boundary.wire_ordinal,
            reversed: boundary.reversed != 0,
            seam: boundary.seam != 0,
            role: edge_treatment_boundary_role(boundary.role)?,
            curve: edge.curve,
            parameter_range: boundary.parameter_range,
            start: boundary.start,
            end: boundary.end,
            length_mm: edge.length,
            edge_tolerance_mm: boundary.edge_tolerance_mm,
            vertex_tolerances_mm: boundary.vertex_tolerances_mm,
        });
    }
    let mut residuals = edge_treatment_vec(value.residual_count, owned_bytes)?;
    for index in 0..value.residual_count {
        let mut residual = ffi::EdgeTreatmentResidual::default();
        check(
            ffi::geospec_occt_edge_treatment_residual_get(
                raw,
                row,
                feature,
                index,
                &mut residual,
                error.raw(),
            ),
            error,
        )?;
        if !finite(&[residual.value_mm, residual.limit_mm, residual.scale_mm])
            || residual.value_mm < 0.0
            || residual.limit_mm < 0.0
            || residual.value_mm > residual.limit_mm
            || residual.scale_mm <= 0.0
        {
            return Err(backend_error(
                "OCCT returned an invalid edge-treatment residual.",
            ));
        }
        residuals.push(EdgeTreatmentResidual {
            kind: edge_treatment_residual_kind(residual.kind)?,
            value_mm: residual.value_mm,
            limit_mm: residual.limit_mm,
            scale_mm: residual.scale_mm,
        });
    }
    Ok(EdgeTreatmentCertificate {
        kind,
        metric_value_mm: value.metric_value_mm,
        surface,
        parameter_bounds,
        supports,
        boundary_uses,
        residuals,
        wire_count: value.wire_count,
        maximum_topology_tolerance_mm: value.maximum_topology_tolerance_mm,
        material_side,
        full_u,
        sweep_interval: value.sweep_interval,
    })
}

struct EdgeTreatmentDispositionContext<'a> {
    raw: *const ffi::Document,
    row: usize,
    public_face_count: usize,
    private_face_count: usize,
    owned_bytes: &'a mut u64,
    error: &'a mut ErrorBuffer,
}

unsafe fn edge_treatment_disposition(
    context: &mut EdgeTreatmentDispositionContext<'_>,
    feature: i32,
    disposition: i32,
    reason: i32,
) -> Result<EdgeTreatmentDisposition, BackendError> {
    match disposition {
        0 if reason == 0 => Ok(EdgeTreatmentDisposition::Qualified(Box::new(
            edge_treatment_certificate(
                context.raw,
                context.row,
                feature,
                context.public_face_count,
                context.private_face_count,
                context.owned_bytes,
                context.error,
            )?,
        ))),
        0 => Err(backend_error(
            "OCCT returned an unknown qualified edge-treatment reason.",
        )),
        1 => Ok(EdgeTreatmentDisposition::NonMember(edge_treatment_reason(
            reason,
        )?)),
        2 => Ok(EdgeTreatmentDisposition::Unqualified(
            edge_treatment_reason(reason)?,
        )),
        _ => Err(backend_error(
            "OCCT returned an unknown edge-treatment disposition.",
        )),
    }
}

unsafe fn edge_treatment_counts(
    raw: *const ffi::Document,
) -> Result<EdgeTreatmentCounts, BackendError> {
    let mut value = ffi::EdgeTreatmentCounts::default();
    let mut error = ErrorBuffer::new();
    check(
        ffi::geospec_occt_edge_treatment_counts_get(raw, &mut value, error.raw()),
        &error,
    )?;
    Ok(EdgeTreatmentCounts {
        public_face_count: value.public_face_count,
        candidate_edge_use_count: value.candidate_edge_use_count,
    })
}

unsafe fn edge_treatments(
    raw: *const ffi::Document,
    max_rows: usize,
) -> Result<EdgeTreatmentInventory, BackendError> {
    let limit = max_rows.min(MAX_EDGE_TREATMENT_ROWS);
    let mut counts = ffi::EdgeTreatmentCounts::default();
    let mut native_bytes = 0usize;
    let mut error = ErrorBuffer::new();
    check(
        ffi::geospec_occt_edge_treatments_prepare(
            raw,
            limit,
            &mut counts,
            &mut native_bytes,
            error.raw(),
        ),
        &error,
    )?;
    let _transfer = EdgeTreatmentTransfer(raw);
    let row_count = counts.public_face_count as usize;
    if row_count > limit || native_bytes as u64 > MAX_EDGE_TREATMENT_OWNED_BYTES {
        return Err(unsupported(
            "OCCT edge-treatment transfer exceeds its requested bounds.",
        ));
    }
    let mut owned_bytes = native_bytes as u64;
    edge_treatment_charge(
        std::mem::size_of::<EdgeTreatmentInventory>(),
        &mut owned_bytes,
    )?;
    let mut rows = edge_treatment_vec(row_count, &mut owned_bytes)?;

    let occurrence_count = ffi::geospec_occt_occurrence_count(raw);
    let expected_public_faces = if occurrence_count == 0 {
        ffi::geospec_occt_face_count(raw)
    } else {
        let mut total = 0usize;
        for occurrence in 0..occurrence_count {
            total = total
                .checked_add(ffi::geospec_occt_occurrence_face_count(
                    raw,
                    occurrence as u32,
                ))
                .ok_or_else(|| backend_error("OCCT public face count overflowed."))?;
        }
        total
    };
    if expected_public_faces != row_count {
        return Err(backend_error(
            "OCCT edge-treatment counts disagree with public topology.",
        ));
    }
    let mut expected_occurrence = None;
    for occurrence in 0..occurrence_count {
        if ffi::geospec_occt_occurrence_face_count(raw, occurrence as u32) != 0 {
            expected_occurrence = Some(occurrence as u32);
            break;
        }
    }
    let mut expected_ordinal = 0u32;
    for index in 0..row_count {
        let mut value = ffi::EdgeTreatmentRow::default();
        check(
            ffi::geospec_occt_edge_treatment(
                raw,
                index,
                &mut value,
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                error.raw(),
            ),
            &error,
        )?;
        let occurrence = match value.has_occurrence {
            0 => None,
            1 => Some(value.occurrence),
            _ => return Err(backend_error("OCCT returned an invalid occurrence marker.")),
        };
        if occurrence != expected_occurrence || value.public_face_ordinal != expected_ordinal {
            return Err(backend_error(
                "OCCT returned an invalid edge-treatment public order.",
            ));
        }
        let public_face_count = occurrence.map_or_else(
            || ffi::geospec_occt_face_count(raw),
            |occurrence| ffi::geospec_occt_occurrence_face_count(raw, occurrence),
        );
        let private_face_count = occurrence.map_or_else(
            || ffi::geospec_occt_query_face_count(raw),
            |occurrence| ffi::geospec_occt_occurrence_query_face_count(raw, occurrence),
        );
        if value.private_query_face == 0
            || value.private_query_face as usize > private_face_count
            || !matches!(value.has_owning_solid_ordinal, 0 | 1)
            || !matches!(value.has_source_face_key, 0 | 1)
            || !matches!(value.has_source_same_sense, 0 | 1)
            || !matches!(value.source_same_sense, 0 | 1)
            || !matches!(value.transferred_reversed, 0 | 1)
            || value.has_source_face_key != value.has_source_same_sense
        {
            return Err(backend_error(
                "OCCT returned an invalid edge-treatment row.",
            ));
        }
        let occurrence_path = copied_string_bounded(&mut owned_bytes, |path, error| {
            ffi::geospec_occt_edge_treatment(
                raw,
                index,
                &mut value,
                path,
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                error,
            )
        })?;
        let source_face_key = copied_string_bounded(&mut owned_bytes, |source, error| {
            ffi::geospec_occt_edge_treatment(
                raw,
                index,
                &mut value,
                std::ptr::null_mut(),
                source,
                std::ptr::null_mut(),
                error,
            )
        })?;
        let label = copied_string_bounded(&mut owned_bytes, |label, error| {
            ffi::geospec_occt_edge_treatment(
                raw,
                index,
                &mut value,
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                label,
                error,
            )
        })?;
        if (occurrence.is_none() && !occurrence_path.is_empty())
            || (value.has_source_face_key == 0) != source_face_key.is_empty()
        {
            return Err(backend_error(
                "OCCT returned inconsistent edge-treatment source text.",
            ));
        }
        let label = match value.label {
            0 if !label.is_empty() => EdgeTreatmentLabel::Unique(label),
            1 if label.is_empty() => EdgeTreatmentLabel::Absent,
            2 if label.is_empty() => EdgeTreatmentLabel::Ambiguous,
            _ => {
                return Err(backend_error(
                    "OCCT returned an invalid edge-treatment label.",
                ))
            }
        };
        let mut disposition_context = EdgeTreatmentDispositionContext {
            raw,
            row: index,
            public_face_count,
            private_face_count,
            owned_bytes: &mut owned_bytes,
            error: &mut error,
        };
        let chamfer = edge_treatment_disposition(
            &mut disposition_context,
            0,
            value.chamfer_disposition,
            value.chamfer_reason,
        )?;
        let fillet = edge_treatment_disposition(
            &mut disposition_context,
            1,
            value.fillet_disposition,
            value.fillet_reason,
        )?;
        rows.push(EdgeTreatmentRow {
            occurrence,
            occurrence_path,
            public_face_ordinal: value.public_face_ordinal,
            private_query_face: value.private_query_face,
            owning_solid_ordinal: (value.has_owning_solid_ordinal != 0)
                .then_some(value.owning_solid_ordinal),
            source_face_key: (value.has_source_face_key != 0).then_some(source_face_key),
            source_same_sense: (value.has_source_same_sense != 0)
                .then_some(value.source_same_sense != 0),
            transferred_reversed: value.transferred_reversed != 0,
            label,
            chamfer,
            fillet,
        });
        expected_ordinal += 1;
        if expected_ordinal as usize == public_face_count {
            let mut next = expected_occurrence.map_or(occurrence_count, |value| value as usize + 1);
            expected_occurrence = None;
            while next < occurrence_count {
                if ffi::geospec_occt_occurrence_face_count(raw, next as u32) != 0 {
                    expected_occurrence = Some(next as u32);
                    break;
                }
                next += 1;
            }
            expected_ordinal = 0;
        }
    }
    if expected_occurrence.is_some() || expected_ordinal != 0 {
        return Err(backend_error(
            "OCCT edge-treatment row count changed during transfer.",
        ));
    }
    let inventory = EdgeTreatmentInventory {
        counts: EdgeTreatmentCounts {
            public_face_count: counts.public_face_count,
            candidate_edge_use_count: counts.candidate_edge_use_count,
        },
        rows,
    };
    if native_bytes as u64 + inventory.owned_bytes() > MAX_EDGE_TREATMENT_OWNED_BYTES {
        return Err(unsupported(
            "OCCT edge-treatment transfer exceeds one mebibyte.",
        ));
    }
    Ok(inventory)
}

unsafe fn report_mesh(
    raw: *const ffi::Document,
    sizes: &ffi::ReportSizes,
) -> Result<TriangleMesh, BackendError> {
    let mut positions: Vec<[f64; 3]> = Vec::new();
    let mut triangles: Vec<[u32; 3]> = Vec::new();
    positions
        .try_reserve_exact(sizes.position_count)
        .map_err(|_| backend_error("Cannot allocate OCCT report positions."))?;
    triangles
        .try_reserve_exact(sizes.triangle_count)
        .map_err(|_| backend_error("Cannot allocate OCCT report triangles."))?;
    positions.resize(sizes.position_count, [0.0; 3]);
    triangles.resize(sizes.triangle_count, [0; 3]);

    let mut position_count = 0;
    let mut triangle_count = 0;
    let mut error = ErrorBuffer::new();
    check(
        ffi::geospec_occt_report_mesh(
            raw,
            positions.as_mut_ptr().cast::<f64>(),
            positions.len(),
            triangles.as_mut_ptr().cast::<u32>(),
            triangles.len(),
            &mut position_count,
            &mut triangle_count,
            error.raw(),
        ),
        &error,
    )?;
    if (position_count, triangle_count) != (sizes.position_count, sizes.triangle_count) {
        return Err(backend_error(
            "OCCT report mesh counts changed during the owned transfer.",
        ));
    }
    Ok(TriangleMesh {
        positions,
        triangles,
    })
}

unsafe fn tessellate(
    raw: *const ffi::Document,
    entity: BrepEntity,
    profile: TessellationProfile,
) -> Result<TriangleMesh, BackendError> {
    Ok(tessellate_with_control(raw, entity, profile, 0)?.0)
}

unsafe fn tessellate_with_control(
    raw: *const ffi::Document,
    entity: BrepEntity,
    profile: TessellationProfile,
    grant_width: i32,
) -> Result<(TriangleMesh, bool), BackendError> {
    let mut position_count = 0;
    let mut triangle_count = 0;
    let mut used_parallel = 0;
    let mut error = ErrorBuffer::new();
    check(
        ffi::geospec_occt_tessellate_dedicated(
            raw,
            entity.into(),
            profile.linear_deflection_mm,
            profile.angular_deflection_rad,
            grant_width,
            &mut used_parallel,
            std::ptr::null_mut(),
            0,
            std::ptr::null_mut(),
            0,
            &mut position_count,
            &mut triangle_count,
            error.raw(),
        ),
        &error,
    )?;
    // Rust arrays have contiguous scalar layout. Fill the final owned arrays
    // directly, without retaining scalar vectors and copying them afterward.
    let mut positions: Vec<[f64; 3]> = Vec::new();
    let mut triangles: Vec<[u32; 3]> = Vec::new();
    let position_bytes = position_count.checked_mul(std::mem::size_of::<[f64; 3]>());
    let triangle_bytes = triangle_count.checked_mul(std::mem::size_of::<[u32; 3]>());
    let output_bytes = position_bytes.and_then(|a| triangle_bytes.and_then(|b| a.checked_add(b)));
    if output_bytes.is_none() {
        return Err(backend_error(
            "OCCT tessellation output byte count exceeds addressable memory.",
        ));
    }
    positions
        .try_reserve_exact(position_count)
        .map_err(|_| backend_error("Cannot allocate OCCT tessellation positions."))?;
    triangles
        .try_reserve_exact(triangle_count)
        .map_err(|_| backend_error("Cannot allocate OCCT tessellation triangles."))?;
    positions.resize(position_count, [0.0; 3]);
    triangles.resize(triangle_count, [0; 3]);
    let expected_counts = (position_count, triangle_count);
    let parallel_during_meshing = used_parallel != 0;
    check(
        ffi::geospec_occt_tessellate_dedicated(
            raw,
            entity.into(),
            profile.linear_deflection_mm,
            profile.angular_deflection_rad,
            grant_width,
            &mut used_parallel,
            positions.as_mut_ptr().cast::<f64>(),
            position_count,
            triangles.as_mut_ptr().cast::<u32>(),
            triangle_count,
            &mut position_count,
            &mut triangle_count,
            error.raw(),
        ),
        &error,
    )?;
    if expected_counts != (position_count, triangle_count) {
        return Err(backend_error(
            "OCCT tessellation counts changed during the owned transfer.",
        ));
    }
    Ok((
        TriangleMesh {
            positions,
            triangles,
        },
        parallel_during_meshing,
    ))
}

impl From<ffi::Bounds> for Bounds {
    fn from(value: ffi::Bounds) -> Self {
        Self {
            min: value.min,
            max: value.max,
        }
    }
}

impl From<ffi::ShapeFacts> for ShapeFacts {
    fn from(value: ffi::ShapeFacts) -> Self {
        Self {
            bounds: value.bounds.into(),
            volume: value.volume,
            surface_area: value.surface_area,
            center_of_mass: value.center_of_mass,
            topology: TopologyCounts {
                compounds: value.compounds,
                solids: value.solids,
                shells: value.shells,
                faces: value.faces,
                wires: value.wires,
                edges: value.edges,
                vertices: value.vertices,
            },
        }
    }
}

impl From<BrepEntity> for ffi::Entity {
    fn from(value: BrepEntity) -> Self {
        match value {
            BrepEntity::Whole => Self {
                kind: 0,
                occurrence: 0,
                face: 0,
            },
            BrepEntity::WholeFace(face) => Self {
                kind: 3,
                occurrence: 0,
                face,
            },
            BrepEntity::Occurrence(occurrence) => Self {
                kind: 1,
                occurrence,
                face: 0,
            },
            BrepEntity::Face { occurrence, face } => Self {
                kind: 2,
                occurrence,
                face,
            },
        }
    }
}

impl TryFrom<ffi::EdgeFacts> for EdgeFacts {
    type Error = BackendError;

    fn try_from(value: ffi::EdgeFacts) -> Result<Self, Self::Error> {
        let curve = match value.curve_type {
            0 => CurveFacts::Line {
                origin: value.origin,
                direction: value.direction,
            },
            1 => CurveFacts::Circle {
                center: value.origin,
                axis: value.direction,
                radius: value.radius,
            },
            2 => CurveFacts::Ellipse {
                center: value.origin,
                axis: value.direction,
                major_radius: value.radius,
                minor_radius: value.secondary_radius,
            },
            3 => CurveFacts::Bspline,
            4 => CurveFacts::Other,
            _ => return Err(backend_error("OCCT returned an unknown curve type.")),
        };
        Ok(Self {
            index: value.index,
            length: value.length,
            bounds: value.bounds.into(),
            start: value.start,
            end: value.end,
            curve,
        })
    }
}

fn point_state(value: i32) -> Result<PointState, BackendError> {
    match value {
        0 => Ok(PointState::In),
        1 => Ok(PointState::On),
        2 => Ok(PointState::Out),
        _ => Err(backend_error("OCCT returned an unknown point state.")),
    }
}

impl TryFrom<ffi::FaceFacts> for FaceFacts {
    type Error = BackendError;

    fn try_from(value: ffi::FaceFacts) -> Result<Self, Self::Error> {
        let surface = match value.surface_type {
            0 => SurfaceFacts::Plane {
                origin: value.origin,
                normal: value.direction,
            },
            1 => SurfaceFacts::Cylinder {
                origin: value.origin,
                axis: value.direction,
                radius: value.radius,
            },
            2 => SurfaceFacts::Cone {
                origin: value.origin,
                axis: value.direction,
                reference_radius: value.radius,
                semi_angle: value.semi_angle,
            },
            3 => SurfaceFacts::Sphere {
                center: value.origin,
                radius: value.radius,
            },
            4 => SurfaceFacts::Torus {
                center: value.origin,
                axis: value.direction,
                major_radius: value.radius,
                minor_radius: value.secondary_radius,
            },
            5 => SurfaceFacts::Bezier {
                u_degree: value.u_degree,
                v_degree: value.v_degree,
                u_poles: value.u_poles,
                v_poles: value.v_poles,
            },
            6 => SurfaceFacts::Bspline {
                u_degree: value.u_degree,
                v_degree: value.v_degree,
                u_poles: value.u_poles,
                v_poles: value.v_poles,
                u_knots: value.u_knots,
                v_knots: value.v_knots,
                u_rational: value.u_rational != 0,
                v_rational: value.v_rational != 0,
            },
            7 => SurfaceFacts::Revolution,
            8 => SurfaceFacts::Extrusion,
            9 => SurfaceFacts::Offset,
            10 => SurfaceFacts::Other,
            _ => return Err(backend_error("OCCT returned an unknown surface type.")),
        };
        Ok(Self {
            index: value.index,
            area: value.area,
            center_of_mass: value.center_of_mass,
            surface,
        })
    }
}

mod ffi {
    use super::c_char;

    pub const OK: i32 = 0;
    pub const INVALID_ARGUMENT: i32 = 1;
    pub const READ_FAILED: i32 = 2;
    pub const TRANSFER_FAILED: i32 = 3;
    pub const NO_SHAPE: i32 = 4;
    pub const BUFFER_TOO_SMALL: i32 = 6;
    pub const UNSUPPORTED: i32 = 7;
    pub const REPORT_MESH: u32 = 1;
    pub const REPORT_VOLUME: u32 = 2;
    pub const REPORT_FACES: u32 = 4;
    pub const REPORT_FACE_MEASURES: u32 = 8;
    pub const REPORT_AREA: u32 = 16;
    pub const REPORT_BOUNDS: u32 = 32;
    pub const REPORT_COUNTS: u32 = 64;
    pub const REPORT_SHAPE: u32 = REPORT_VOLUME | REPORT_AREA | REPORT_BOUNDS | REPORT_COUNTS;

    #[repr(C)]
    pub struct Document {
        _private: [u8; 0],
    }

    #[repr(C)]
    pub struct OperandMemo {
        _private: [u8; 0],
    }

    #[repr(C)]
    pub struct StringBuffer {
        pub data: *mut c_char,
        pub capacity: usize,
        pub length: usize,
    }

    #[derive(Clone, Copy, Default)]
    #[repr(C)]
    pub struct Bounds {
        pub min: [f64; 3],
        pub max: [f64; 3],
    }

    #[derive(Clone, Copy, Default)]
    #[repr(C)]
    pub struct ShapeFacts {
        pub bounds: Bounds,
        pub volume: f64,
        pub surface_area: f64,
        pub center_of_mass: [f64; 3],
        pub compounds: usize,
        pub solids: usize,
        pub shells: usize,
        pub faces: usize,
        pub wires: usize,
        pub edges: usize,
        pub vertices: usize,
    }

    #[derive(Clone, Copy, Default)]
    #[repr(C)]
    pub struct OccurrenceFacts {
        pub placement: [f64; 12],
        pub bounds: Bounds,
        pub parent: i64,
        pub product: u32,
        pub ordinal_count: usize,
    }

    #[derive(Clone, Copy, Default)]
    #[repr(C)]
    pub struct FaceFacts {
        pub index: u32,
        pub query_index: u32,
        pub surface_type: i32,
        pub parameter_bounds: [f64; 4],
        pub area: f64,
        pub center_of_mass: [f64; 3],
        pub origin: [f64; 3],
        pub direction: [f64; 3],
        pub radius: f64,
        pub secondary_radius: f64,
        pub semi_angle: f64,
        pub u_degree: u32,
        pub v_degree: u32,
        pub u_poles: u32,
        pub v_poles: u32,
        pub u_knots: u32,
        pub v_knots: u32,
        pub u_rational: i32,
        pub v_rational: i32,
    }

    #[derive(Clone, Copy, Default)]
    #[repr(C)]
    pub struct SubshapeFacts {
        pub occurrence: i64,
        pub shape_type: i32,
        pub face_index: u32,
        pub has_face_index: i32,
    }

    #[derive(Clone, Copy, Default)]
    #[repr(C)]
    pub struct SemanticDatumFacts {
        pub occurrence: i64,
        pub face_count: usize,
    }

    #[derive(Clone, Copy, Default)]
    #[repr(C)]
    pub struct DatumPlacementFacts {
        pub occurrence: i64,
        pub origin: [f64; 3],
        pub x_axis: [f64; 3],
        pub z_axis: [f64; 3],
    }

    #[derive(Clone, Copy, Default)]
    #[repr(C)]
    pub struct Entity {
        pub kind: i32,
        pub occurrence: u32,
        pub face: u32,
    }

    #[derive(Clone, Copy, Default)]
    #[repr(C)]
    pub struct LocatedFaceFacts {
        pub face: FaceFacts,
        pub bounds: Bounds,
        pub reversed: i32,
    }

    #[derive(Clone, Copy, Default)]
    #[repr(C)]
    pub struct EdgeFacts {
        pub index: u32,
        pub curve_type: i32,
        pub length: f64,
        pub bounds: Bounds,
        pub start: [f64; 3],
        pub end: [f64; 3],
        pub origin: [f64; 3],
        pub direction: [f64; 3],
        pub radius: f64,
        pub secondary_radius: f64,
    }

    #[derive(Clone, Copy, Default)]
    #[repr(C)]
    pub struct ValidityFacts {
        pub valid: i32,
        pub max_tolerance: f64,
        pub free_bounds: u32,
        pub same_parameter: i32,
        pub closed_shells: i32,
        pub closed_solids: i32,
        pub solid_count: u32,
        pub invalid_solid_count: u32,
        pub open_edge_count: u32,
        pub closed_wires: i32,
    }

    #[derive(Clone, Copy, Default)]
    #[repr(C)]
    pub struct RegularSolidContainment {
        pub contained: i32,
        pub residual_solid_count: u32,
        pub residual_volume: f64,
        pub has_residual_bounds: i32,
        pub residual_bounds: Bounds,
        pub has_residual_center_of_mass: i32,
        pub residual_center_of_mass: [f64; 3],
    }

    #[derive(Clone, Copy, Default)]
    #[repr(C)]
    pub struct CylinderAxialExtent {
        pub origin: [f64; 3],
        pub axis: [f64; 3],
        pub radius: f64,
        pub from: f64,
        pub to: f64,
    }

    #[derive(Clone, Copy, Default)]
    #[repr(C)]
    pub struct CircularBoreEnd {
        pub owning_solid_edge_ordinal: u32,
        pub adjacent_public_face_ordinal: u32,
        pub termination: i32,
    }

    #[derive(Clone, Copy, Default)]
    #[repr(C)]
    pub struct CircularBoreCandidate {
        pub public_face_ordinal: u32,
        pub private_query_face: u32,
        pub disposition: i32,
        pub reason: i32,
        pub owning_solid_ordinal: u32,
        pub band: CylinderAxialExtent,
        pub ends: [CircularBoreEnd; 2],
        pub maximum_topology_tolerance_mm: f64,
        pub interior_residual_solid_count: u32,
    }

    #[derive(Clone, Copy, Default)]
    #[repr(C)]
    pub struct EdgeTreatmentCounts {
        pub public_face_count: u32,
        pub candidate_edge_use_count: u32,
    }

    #[derive(Clone, Copy, Default)]
    #[repr(C)]
    pub struct EdgeTreatmentSupport {
        pub public_face_ordinal: u32,
        pub private_query_face: u32,
        pub surface: FaceFacts,
        pub transferred_reversed: i32,
        pub maximum_topology_tolerance_mm: f64,
    }

    #[derive(Clone, Copy, Default)]
    #[repr(C)]
    pub struct EdgeTreatmentBoundaryUse {
        pub owning_solid_edge_ordinal: u32,
        pub wire_ordinal: u32,
        pub reversed: i32,
        pub seam: i32,
        pub role: i32,
        pub curve: EdgeFacts,
        pub parameter_range: [f64; 2],
        pub start: [f64; 3],
        pub end: [f64; 3],
        pub edge_tolerance_mm: f64,
        pub vertex_tolerances_mm: [f64; 2],
    }

    #[derive(Clone, Copy, Default)]
    #[repr(C)]
    pub struct EdgeTreatmentResidual {
        pub kind: i32,
        pub value_mm: f64,
        pub limit_mm: f64,
        pub scale_mm: f64,
    }

    #[derive(Clone, Copy, Default)]
    #[repr(C)]
    pub struct EdgeTreatmentCertificate {
        pub kind: i32,
        pub metric_value_mm: f64,
        pub surface: FaceFacts,
        pub supports: [EdgeTreatmentSupport; 2],
        pub boundary_use_count: usize,
        pub residual_count: usize,
        pub wire_count: u32,
        pub maximum_topology_tolerance_mm: f64,
        pub material_side: i32,
        pub full_u: i32,
        pub sweep_interval: [f64; 2],
    }

    #[derive(Clone, Copy, Default)]
    #[repr(C)]
    pub struct EdgeTreatmentRow {
        pub has_occurrence: i32,
        pub occurrence: u32,
        pub public_face_ordinal: u32,
        pub private_query_face: u32,
        pub has_owning_solid_ordinal: i32,
        pub owning_solid_ordinal: u32,
        pub has_source_face_key: i32,
        pub has_source_same_sense: i32,
        pub source_same_sense: i32,
        pub transferred_reversed: i32,
        pub label: i32,
        pub chamfer_disposition: i32,
        pub chamfer_reason: i32,
        pub fillet_disposition: i32,
        pub fillet_reason: i32,
    }

    #[derive(Clone, Copy, Default)]
    #[repr(C)]
    pub struct ReportSizes {
        pub occurrence_count: usize,
        pub whole_face_count: usize,
        pub occurrence_face_count: usize,
        pub position_count: usize,
        pub triangle_count: usize,
        pub shape_bytes: usize,
        pub whole_face_bytes: usize,
        pub occurrence_face_bytes: usize,
        pub position_bytes: usize,
        pub triangle_bytes: usize,
    }

    #[derive(Clone, Copy, Default)]
    #[repr(C)]
    pub struct CylinderBoundaryUse {
        pub edge_index: u32,
        pub orientation: i32,
        pub side: i32,
        pub curve_range: [f64; 2],
        pub pcurve_stored: i32,
        pub parameter_endpoints: [[f64; 2]; 2],
    }

    #[derive(Clone, Copy, Default)]
    #[repr(C)]
    pub struct CylinderVertex {
        pub vertex_index: u32,
        pub point: [f64; 3],
    }

    #[derive(Clone, Copy, Default)]
    #[repr(C)]
    pub struct CylindricalBandRim {
        pub edge_index: u32,
        pub center: [f64; 3],
        pub axis: [f64; 3],
        pub phase_x: [f64; 3],
        pub phase_y: [f64; 3],
        pub radius: f64,
        pub curve_range: [f64; 2],
        pub curve_period: f64,
        pub vertex_indices: [u32; 2],
    }

    #[derive(Clone, Copy, Default)]
    #[repr(C)]
    pub struct CylindricalBandBoundaryResidual {
        pub parameter_coverage_mm: f64,
        pub curve_surface_mm: f64,
        pub vertex_attachment_mm: f64,
        pub limit_mm: f64,
    }

    #[derive(Clone, Copy, Default)]
    #[repr(C)]
    pub struct NominalCylindricalBand {
        pub profile: i32,
        pub occurrence: u32,
        pub public_face_ordinal: u32,
        pub private_query_face: u32,
        pub source_face_entity: u32,
        pub source_route_count: u32,
        pub source_route: [u32; 32],
        pub source_same_sense: i32,
        pub transferred_reversed: i32,
        pub origin: [f64; 3],
        pub axis: [f64; 3],
        pub phase_x: [f64; 3],
        pub phase_y: [f64; 3],
        pub radius: f64,
        pub from: f64,
        pub to: f64,
        pub parameter_bounds: [f64; 4],
        pub surface_period: f64,
        pub rims: [CylindricalBandRim; 2],
        pub seam_edge_index: u32,
        pub seam_origin: [f64; 3],
        pub seam_axis: [f64; 3],
        pub seam_curve_range: [f64; 2],
        pub seam_vertex_indices: [u32; 2],
        pub boundary: [CylinderBoundaryUse; 4],
        pub vertices: [CylinderVertex; 2],
        pub face_tolerance_mm: f64,
        pub edge_tolerances_mm: [f64; 3],
        pub vertex_tolerances_mm: [f64; 2],
        pub period_residual_mm: f64,
        pub boundary_residuals: [CylindricalBandBoundaryResidual; 4],
    }

    #[derive(Clone, Copy, Default)]
    #[repr(C)]
    pub struct ContinuousWallDomain {
        pub kind: i32,
        pub maximum_topology_tolerance_mm: f64,
        pub corners: [[f64; 3]; 8],
        pub face_indices: [u32; 6],
        pub face_corner_indices: [[u32; 4]; 6],
        pub outward_normals: [[f64; 3]; 6],
        pub opposite_face_pairs: [[u32; 2]; 3],
        pub edge_lengths: [f64; 3],
        pub origin: [f64; 3],
        pub axis: [f64; 3],
        pub radius: f64,
        pub from: f64,
        pub to: f64,
        pub lateral_face: u32,
        pub cap_faces: [u32; 2],
        pub lateral_parameter_bounds: [f64; 4],
        pub rim_centers: [[f64; 3]; 2],
        pub rim_radii: [f64; 2],
        pub rim_edge_indices: [u32; 2],
        pub seam_edge_index: u32,
        pub attachment_profile: i32,
        pub phase_x: [f64; 3],
        pub phase_y: [f64; 3],
        pub surface_period: f64,
        pub rim_curve_ranges: [[f64; 2]; 2],
        pub rim_curve_periods: [f64; 2],
        pub cap_pcurve_ranges: [[f64; 2]; 2],
        pub cap_pcurve_periods: [f64; 2],
        pub cap_pcurve_stored: [i32; 2],
        pub seam_curve_range: [f64; 2],
        pub lateral_boundary: [CylinderBoundaryUse; 4],
        pub vertices: [CylinderVertex; 2],
        pub seam_vertex_indices: [u32; 2],
        pub rim_vertex_indices: [[u32; 2]; 2],
    }

    #[derive(Clone, Copy, Default)]
    #[repr(C)]
    pub struct SelectedContinuousDomain {
        pub occurrence: u32,
        pub domain: ContinuousWallDomain,
        pub face_count: u32,
        pub face_map: [u32; 6],
        pub edge_count: u32,
        pub edge_map: [u32; 12],
    }

    #[derive(Clone, Copy, Default)]
    #[repr(C)]
    pub struct ResolvedSourceFace {
        pub occurrence: u32,
        pub public_face_ordinal: u32,
        pub private_query_face: u32,
        pub source_same_sense: i32,
        pub transferred_reversed: i32,
    }

    #[derive(Clone, Copy, Default)]
    #[repr(C)]
    pub struct PmiSourceFace {
        pub occurrence: i64,
        pub public_face_ordinal: u32,
        pub route: [u32; 32],
        pub route_count: usize,
    }

    unsafe extern "C" {
        pub fn geospec_occt_selected_interference_material_query(
            document: *const Document,
            face: Entity,
            memo: *mut OperandMemo,
            band: *mut NominalCylindricalBand,
            kind: *mut u32,
            error: *mut StringBuffer,
        ) -> i32;
        pub fn geospec_occt_pmi_source_faces(
            document: *const Document,
            source_face_id: u32,
            output: *mut PmiSourceFace,
            capacity: usize,
            count: *mut usize,
            status: *mut i32,
            error: *mut StringBuffer,
        ) -> i32;
        pub fn geospec_occt_selected_bore_void_query(
            document: *const Document,
            face: Entity,
            memo: *mut OperandMemo,
            band: *mut NominalCylindricalBand,
            clear: *mut CircularBoreCandidate,
            error: *mut StringBuffer,
        ) -> i32;
        pub fn geospec_occt_finite_contact_face_query(
            document: *const Document,
            face: Entity,
            output: *mut super::FiniteContactFace,
            error: *mut StringBuffer,
        ) -> i32;
        pub fn geospec_occt_nominal_cylindrical_band_query(
            document: *const Document,
            face: Entity,
            output: *mut NominalCylindricalBand,
            error: *mut StringBuffer,
        ) -> i32;

        pub fn geospec_occt_continuous_wall(
            document: *const Document,
            output: *mut ContinuousWallDomain,
            error: *mut StringBuffer,
        ) -> i32;
        pub fn geospec_occt_selected_continuous_domain(
            document: *const Document,
            occurrence: u32,
            output: *mut SelectedContinuousDomain,
            error: *mut StringBuffer,
        ) -> i32;
        pub fn geospec_occt_resolve_source_face(
            document: *const Document,
            source_face_entity: u32,
            occurrence_route: *const u32,
            occurrence_route_count: usize,
            output: *mut ResolvedSourceFace,
            error: *mut StringBuffer,
        ) -> i32;
        pub fn geospec_occt_open_step(
            bytes: *const u8,
            length: usize,
            out: *mut *mut Document,
            error: *mut StringBuffer,
        ) -> i32;
        pub fn geospec_occt_thread_pool_width(
            requested: i32,
            actual: *mut i32,
            error: *mut StringBuffer,
        ) -> i32;
        pub fn geospec_occt_release(document: *mut Document);
        pub fn geospec_occt_triangulated_face_count(document: *const Document) -> usize;
        pub fn geospec_occt_admission_facts(
            document: *const Document,
            unit_scale: *mut f64,
            occurrence_count: *mut usize,
            unit: *mut StringBuffer,
            error: *mut StringBuffer,
        ) -> i32;
        pub fn geospec_occt_step_subject_metadata(
            document: *const Document,
            source_byte_length: *mut usize,
            free_shape_count: *mut usize,
            schema: *mut StringBuffer,
            error: *mut StringBuffer,
        ) -> i32;
        pub fn geospec_occt_report_prepare_dedicated(
            document: *const Document,
            facets: u32,
            grant_width: i32,
            used_parallel: *mut i32,
            sizes: *mut ReportSizes,
            error: *mut StringBuffer,
        ) -> i32;
        pub fn geospec_occt_report_generation_builds(document: *const Document) -> usize;
        pub fn geospec_occt_report_discard(document: *const Document);
        pub fn geospec_occt_report_shape_facts(
            document: *const Document,
            shape: *mut ShapeFacts,
            error: *mut StringBuffer,
        ) -> i32;
        pub fn geospec_occt_report_face(
            document: *const Document,
            index: usize,
            facts: *mut LocatedFaceFacts,
            error: *mut StringBuffer,
        ) -> i32;
        pub fn geospec_occt_report_occurrence_face_count(
            document: *const Document,
            occurrence: u32,
        ) -> usize;
        pub fn geospec_occt_report_occurrence_face(
            document: *const Document,
            occurrence: u32,
            index: usize,
            facts: *mut LocatedFaceFacts,
            error: *mut StringBuffer,
        ) -> i32;
        pub fn geospec_occt_report_mesh(
            document: *const Document,
            positions: *mut f64,
            position_capacity: usize,
            triangles: *mut u32,
            triangle_capacity: usize,
            position_count: *mut usize,
            triangle_count: *mut usize,
            error: *mut StringBuffer,
        ) -> i32;
        pub fn geospec_occt_product_count(document: *const Document) -> usize;
        pub fn geospec_occt_occurrence_count(document: *const Document) -> usize;
        pub fn geospec_occt_occurrence(
            document: *const Document,
            index: usize,
            facts: *mut OccurrenceFacts,
            label: *mut StringBuffer,
            product: *mut StringBuffer,
            name: *mut StringBuffer,
            error: *mut StringBuffer,
        ) -> i32;
        pub fn geospec_occt_occurrence_structure(
            document: *const Document,
            index: usize,
            facts: *mut OccurrenceFacts,
            label: *mut StringBuffer,
            product: *mut StringBuffer,
            name: *mut StringBuffer,
            error: *mut StringBuffer,
        ) -> i32;
        pub fn geospec_occt_occurrence_identity(
            document: *const Document,
            index: usize,
            path: *mut StringBuffer,
            product_name: *mut StringBuffer,
            instance_name: *mut StringBuffer,
            error: *mut StringBuffer,
        ) -> i32;
        pub fn geospec_occt_occurrence_ordinal(
            document: *const Document,
            index: usize,
            ordinal_index: usize,
            ordinal: *mut u32,
            error: *mut StringBuffer,
        ) -> i32;
        pub fn geospec_occt_face_count(document: *const Document) -> usize;
        pub fn geospec_occt_query_face_count(document: *const Document) -> usize;
        pub fn geospec_occt_face(
            document: *const Document,
            index: usize,
            facts: *mut FaceFacts,
            error: *mut StringBuffer,
        ) -> i32;
        pub fn geospec_occt_face_location(
            document: *const Document,
            index: usize,
            bounds: *mut Bounds,
            reversed: *mut i32,
            error: *mut StringBuffer,
        ) -> i32;
        pub fn geospec_occt_subshape_count(document: *const Document) -> usize;
        pub fn geospec_occt_subshape(
            document: *const Document,
            index: usize,
            facts: *mut SubshapeFacts,
            occurrence_path: *mut StringBuffer,
            name: *mut StringBuffer,
            shape_label: *mut StringBuffer,
            error: *mut StringBuffer,
        ) -> i32;
        pub fn geospec_occt_semantic_datum_count(document: *const Document) -> usize;
        pub fn geospec_occt_semantic_datum(
            document: *const Document,
            index: usize,
            facts: *mut SemanticDatumFacts,
            occurrence_path: *mut StringBuffer,
            label: *mut StringBuffer,
            feature_name: *mut StringBuffer,
            error: *mut StringBuffer,
        ) -> i32;
        pub fn geospec_occt_semantic_datum_face(
            document: *const Document,
            index: usize,
            face_index: usize,
            face: *mut u32,
            error: *mut StringBuffer,
        ) -> i32;
        pub fn geospec_occt_datum_placement_count(document: *const Document) -> usize;
        pub fn geospec_occt_datum_placement(
            document: *const Document,
            index: usize,
            facts: *mut DatumPlacementFacts,
            occurrence_path: *mut StringBuffer,
            name: *mut StringBuffer,
            error: *mut StringBuffer,
        ) -> i32;
        pub fn geospec_occt_occurrence_face_count(
            document: *const Document,
            occurrence: u32,
        ) -> usize;
        pub fn geospec_occt_occurrence_query_face_count(
            document: *const Document,
            occurrence: u32,
        ) -> usize;
        pub fn geospec_occt_occurrence_edge_count(
            document: *const Document,
            occurrence: u32,
            count: *mut usize,
            error: *mut StringBuffer,
        ) -> i32;
        pub fn geospec_occt_validity_dedicated(
            document: *const Document,
            grant_width: i32,
            used_parallel: *mut i32,
            facts: *mut ValidityFacts,
            reason: *mut StringBuffer,
            error: *mut StringBuffer,
        ) -> i32;
        pub fn geospec_occt_cylinder_axial_extent(
            document: *const Document,
            face: Entity,
            extent: *mut CylinderAxialExtent,
            error: *mut StringBuffer,
        ) -> i32;
        pub fn geospec_occt_circular_bores_prepare_dedicated(
            document: *const Document,
            max_candidates: usize,
            retained_candidate_size: usize,
            retained_inventory_size: usize,
            grant_width: i32,
            used_parallel: *mut i32,
            count: *mut usize,
            error: *mut StringBuffer,
        ) -> i32;
        pub fn geospec_occt_circular_bore(
            document: *const Document,
            index: usize,
            candidate: *mut CircularBoreCandidate,
            error: *mut StringBuffer,
        ) -> i32;
        pub fn geospec_occt_circular_bores_discard(document: *const Document);
        pub fn geospec_occt_edge_treatment_counts_get(
            document: *const Document,
            counts: *mut EdgeTreatmentCounts,
            error: *mut StringBuffer,
        ) -> i32;
        pub fn geospec_occt_edge_treatments_prepare(
            document: *const Document,
            max_rows: usize,
            counts: *mut EdgeTreatmentCounts,
            transfer_bytes: *mut usize,
            error: *mut StringBuffer,
        ) -> i32;
        pub fn geospec_occt_edge_treatment(
            document: *const Document,
            row: usize,
            output: *mut EdgeTreatmentRow,
            occurrence_path: *mut StringBuffer,
            source_face_key: *mut StringBuffer,
            label: *mut StringBuffer,
            error: *mut StringBuffer,
        ) -> i32;
        pub fn geospec_occt_edge_treatment_certificate_get(
            document: *const Document,
            row: usize,
            feature: i32,
            output: *mut EdgeTreatmentCertificate,
            error: *mut StringBuffer,
        ) -> i32;
        pub fn geospec_occt_edge_treatment_boundary_use_get(
            document: *const Document,
            row: usize,
            feature: i32,
            boundary_use: usize,
            output: *mut EdgeTreatmentBoundaryUse,
            error: *mut StringBuffer,
        ) -> i32;
        pub fn geospec_occt_edge_treatment_residual_get(
            document: *const Document,
            row: usize,
            feature: i32,
            residual: usize,
            output: *mut EdgeTreatmentResidual,
            error: *mut StringBuffer,
        ) -> i32;
        pub fn geospec_occt_edge_treatments_discard(document: *const Document);
        pub fn geospec_occt_classify_face_points(
            document: *const Document,
            face: Entity,
            points: *const f64,
            point_count: usize,
            tolerance: f64,
            states: *mut i32,
            state_capacity: usize,
            error: *mut StringBuffer,
        ) -> i32;
        pub fn geospec_occt_operand_memo_new(document: *const Document) -> *mut OperandMemo;
        pub fn geospec_occt_operand_memo_release(memo: *mut OperandMemo);
        pub fn geospec_occt_regular_solid_containment_dedicated(
            document: *const Document,
            subject: Entity,
            target: Entity,
            memo: *mut OperandMemo,
            grant_width: i32,
            used_parallel: *mut i32,
            result: *mut RegularSolidContainment,
            error: *mut StringBuffer,
        ) -> i32;
        pub fn geospec_occt_tessellate_dedicated(
            document: *const Document,
            entity: Entity,
            linear: f64,
            angular: f64,
            grant_width: i32,
            used_parallel: *mut i32,
            positions: *mut f64,
            position_capacity: usize,
            triangles: *mut u32,
            triangle_capacity: usize,
            position_count: *mut usize,
            triangle_count: *mut usize,
            error: *mut StringBuffer,
        ) -> i32;
    }
}
