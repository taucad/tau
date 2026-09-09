//! Safe, owned Rust adapter for the private OCCT bridge.

pub use geospec_engine_native_core::backend::brep::{
    Bounds, BrepAdmissionFacts, BrepConnector, BrepEntity, BrepSubject, CommonVolume,
    ContinuousWallDomain, ContinuousWallShape, CurveFacts, CylinderAttachmentProfile,
    CylinderAxialExtent, CylinderBoundaryOrientation, CylinderBoundarySide, CylinderBoundaryUse,
    CylinderPeriodicAttachment, CylinderVertex, DatumPlacementFacts, DocumentFacts, EdgeFacts,
    Extrema, FaceFacts, LocatedFace, OccurrenceFacts, PmiFacts, PmiKind, PointState, ProductFacts,
    RegularSolidContainment, ReportedBrepBundle, SelectedContinuousDomain, SemanticDatumFacts,
    ShapeFacts, SubshapeFacts, SubshapeType, SurfaceFacts, TessellationProfile, TopologyCounts,
    ValidityFacts, WallOptions, WallSupport, WallThickness, WallThicknessOutcome,
};
use geospec_engine_native_core::backend::{BackendError, BackendErrorKind, TriangleMesh};
use std::{
    cell::{OnceCell, RefCell},
    collections::{BTreeMap, HashMap},
    ffi::c_char,
    ptr::NonNull,
    rc::Rc,
};

#[derive(Clone, Copy, Debug, Default)]
pub struct OcctConnector;

/// Owns one retained XDE document. It is deliberately neither `Send` nor `Sync`.
pub struct Document {
    raw: NonNull<ffi::Document>,
    facts: OnceCell<Rc<DocumentFacts>>,
    whole_faces: OnceCell<Rc<[LocatedFace]>>,
    faces: RefCell<HashMap<u32, Rc<[LocatedFace]>>>,
    edges: RefCell<HashMap<u32, Rc<[EdgeFacts]>>>,
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
            facts: OnceCell::new(),
            whole_faces: OnceCell::new(),
            faces: RefCell::new(HashMap::new()),
            edges: RefCell::new(HashMap::new()),
            validity: OnceCell::new(),
            _single_threaded: std::marker::PhantomData,
        })
    }

    pub fn facts(&self) -> Result<Rc<DocumentFacts>, BackendError> {
        if let Some(facts) = self.facts.get() {
            return Ok(Rc::clone(facts));
        }
        let facts = Rc::new(unsafe { facts(self.raw.as_ptr(), false)? });
        let _ = self.facts.set(Rc::clone(&facts));
        Ok(facts)
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
            ingest_profile: "geospec-step-xde-report-v2",
            backend_profile: "occt-8.1.0-dev1-3d097a-report-v2",
        }
    }

    fn open_step(&self, bytes: &[u8]) -> Result<Box<dyn BrepSubject>, BackendError> {
        Ok(Box::new(Document::from_step(bytes)?))
    }
}

impl BrepSubject for Document {
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
            unsafe { ffi::geospec_occt_occurrence_face_count(self.raw.as_ptr(), occurrence) };
        let occurrence_edge_count =
            unsafe { ffi::geospec_occt_occurrence_edge_count(self.raw.as_ptr(), occurrence) };
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

    fn admission_facts(&self) -> Result<BrepAdmissionFacts, BackendError> {
        unsafe { admission_facts(self.raw.as_ptr()) }
    }

    fn reported_facts_and_mesh(&self) -> Result<ReportedBrepBundle, BackendError> {
        unsafe { reported_facts_and_mesh(self.raw.as_ptr()) }
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

    fn regular_solid_containment(
        &self,
        subject: BrepEntity,
        target: BrepEntity,
    ) -> Result<RegularSolidContainment, BackendError> {
        self.validate_entity(subject)?;
        self.validate_entity(target)?;
        unsafe { regular_solid_containment(self.raw.as_ptr(), subject, target) }
    }

    fn facts(&self) -> Result<Rc<DocumentFacts>, BackendError> {
        Document::facts(self)
    }

    fn faces(&self) -> Result<Rc<[LocatedFace]>, BackendError> {
        if let Some(faces) = self.whole_faces.get() {
            return Ok(Rc::clone(faces));
        }
        let faces: Rc<[LocatedFace]> = unsafe { whole_faces(self.raw.as_ptr(), false)? }.into();
        let _ = self.whole_faces.set(Rc::clone(&faces));
        Ok(faces)
    }

    fn occurrence_faces(&self, occurrence: u32) -> Result<Rc<[LocatedFace]>, BackendError> {
        if let Some(faces) = self.faces.borrow().get(&occurrence) {
            return Ok(Rc::clone(faces));
        }
        self.require_occurrence(occurrence)?;
        let faces: Rc<[LocatedFace]> =
            unsafe { occurrence_faces(self.raw.as_ptr(), occurrence, false)? }.into();
        self.faces
            .borrow_mut()
            .insert(occurrence, Rc::clone(&faces));
        Ok(faces)
    }

    fn occurrence_edges(&self, occurrence: u32) -> Result<Rc<[EdgeFacts]>, BackendError> {
        if let Some(edges) = self.edges.borrow().get(&occurrence) {
            return Ok(Rc::clone(edges));
        }
        self.require_occurrence(occurrence)?;
        let edges: Rc<[EdgeFacts]> =
            unsafe { occurrence_edges(self.raw.as_ptr(), occurrence)? }.into();
        self.edges
            .borrow_mut()
            .insert(occurrence, Rc::clone(&edges));
        Ok(edges)
    }

    fn validity(&self) -> Result<Rc<ValidityFacts>, BackendError> {
        if let Some(validity) = self.validity.get() {
            return Ok(Rc::clone(validity));
        }
        let validity = Rc::new(unsafe { validity(self.raw.as_ptr())? });
        let _ = self.validity.set(Rc::clone(&validity));
        Ok(validity)
    }

    fn extrema(&self, a: BrepEntity, b: BrepEntity) -> Result<Extrema, BackendError> {
        self.validate_entity(a)?;
        self.validate_entity(b)?;
        unsafe { extrema(self.raw.as_ptr(), a, b) }
    }

    fn classify_points(
        &self,
        occurrence: u32,
        points: &[[f64; 3]],
    ) -> Result<Vec<PointState>, BackendError> {
        self.require_occurrence(occurrence)?;
        unsafe { classify_points(self.raw.as_ptr(), occurrence, points) }
    }

    fn common_volume(&self, a: u32, b: u32) -> Result<CommonVolume, BackendError> {
        self.require_occurrence(a)?;
        self.require_occurrence(b)?;
        unsafe { common_volume(self.raw.as_ptr(), a, b) }
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

    fn minimum_wall_thickness(
        &self,
        options: &WallOptions,
    ) -> Result<WallThicknessOutcome, BackendError> {
        unsafe { minimum_wall_thickness(self.raw.as_ptr(), options) }
    }

    fn tessellate(
        &self,
        entity: BrepEntity,
        profile: TessellationProfile,
    ) -> Result<Rc<TriangleMesh>, BackendError> {
        self.validate_entity(entity)?;
        self.tessellate_entity(entity, profile)
    }
}

impl Document {
    fn require_occurrence(&self, occurrence: u32) -> Result<(), BackendError> {
        if occurrence as usize >= self.facts()?.occurrences.len() {
            return Err(invalid_input("Occurrence index is out of range."));
        }
        Ok(())
    }

    fn validate_entity(&self, entity: BrepEntity) -> Result<(), BackendError> {
        match entity {
            BrepEntity::Whole => Ok(()),
            BrepEntity::WholeFace(face) => {
                if face == 0 || face as usize > self.faces()?.len() {
                    return Err(invalid_input("Whole-shape face index is out of range."));
                }
                Ok(())
            }
            BrepEntity::Occurrence(occurrence) => self.require_occurrence(occurrence),
            BrepEntity::Face { occurrence, face } => {
                self.require_occurrence(occurrence)?;
                if face == 0 || face as usize > self.occurrence_faces(occurrence)?.len() {
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

fn backend_error(message: impl Into<String>) -> BackendError {
    BackendError {
        kind: BackendErrorKind::ComputationFailed,
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

struct ReportTransfer(*const ffi::Document);

impl Drop for ReportTransfer {
    fn drop(&mut self) {
        unsafe { ffi::geospec_occt_report_discard(self.0) };
    }
}

fn checked_transfer_bytes(count: usize, width: usize) -> Result<usize, BackendError> {
    count
        .checked_mul(width)
        .ok_or_else(|| backend_error("OCCT report transfer byte count exceeds addressable memory."))
}

fn validate_report_sizes(sizes: &ffi::ReportSizes) -> Result<(), BackendError> {
    let expected = [
        (sizes.shape_bytes, std::mem::size_of::<ffi::ShapeFacts>()),
        (
            sizes.occurrence_bytes,
            checked_transfer_bytes(
                sizes.occurrence_count,
                std::mem::size_of::<ffi::OccurrenceFacts>(),
            )?,
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
    if expected.iter().any(|(actual, expected)| actual != expected) {
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

unsafe fn reported_facts_and_mesh(
    raw: *const ffi::Document,
) -> Result<ReportedBrepBundle, BackendError> {
    let mut sizes = ffi::ReportSizes::default();
    let mut error = ErrorBuffer::new();
    check(
        ffi::geospec_occt_report_prepare(raw, &mut sizes, error.raw()),
        &error,
    )?;
    let _transfer = ReportTransfer(raw);
    validate_report_sizes(&sizes)?;

    let facts = Rc::new(facts(raw, true)?);
    if facts.occurrences.len() != sizes.occurrence_count
        || facts.faces.len() != sizes.whole_face_count
    {
        return Err(backend_error(
            "OCCT report fact counts changed during the owned transfer.",
        ));
    }
    let whole_faces: Rc<[LocatedFace]> = whole_faces(raw, true)?.into();
    if whole_faces.len() != sizes.whole_face_count {
        return Err(backend_error(
            "OCCT whole-face report count changed during the owned transfer.",
        ));
    }
    let mut report_occurrence_faces = Vec::with_capacity(sizes.occurrence_count);
    let mut occurrence_face_count = 0usize;
    for occurrence in 0..sizes.occurrence_count {
        let faces: Rc<[LocatedFace]> = occurrence_faces(raw, occurrence as u32, true)?.into();
        occurrence_face_count = occurrence_face_count
            .checked_add(faces.len())
            .ok_or_else(|| backend_error("OCCT occurrence-face report count overflowed."))?;
        report_occurrence_faces.push(faces);
    }
    if occurrence_face_count != sizes.occurrence_face_count {
        return Err(backend_error(
            "OCCT occurrence-face report count changed during the owned transfer.",
        ));
    }
    let mesh = Rc::new(report_mesh(raw, &sizes)?);
    Ok(ReportedBrepBundle {
        facts,
        whole_faces,
        occurrence_faces: report_occurrence_faces,
        mesh,
    })
}

unsafe fn facts(raw: *const ffi::Document, reported: bool) -> Result<DocumentFacts, BackendError> {
    let mut shape = ffi::ShapeFacts::default();
    let mut unit_scale = 0.0;
    let source_length_unit = copied_string(|unit, error| {
        if reported {
            ffi::geospec_occt_report_document_facts(raw, &mut shape, &mut unit_scale, unit, error)
        } else {
            ffi::geospec_occt_document_facts(raw, &mut shape, &mut unit_scale, unit, error)
        }
    })?;

    let product_count = ffi::geospec_occt_product_count(raw);
    let mut products = Vec::with_capacity(product_count);
    for index in 0..product_count {
        let label = copied_string(|label, error| {
            ffi::geospec_occt_product(raw, index, label, std::ptr::null_mut(), error)
        })?;
        let name = copied_string(|name, error| {
            ffi::geospec_occt_product(raw, index, std::ptr::null_mut(), name, error)
        })?;
        products.push(ProductFacts { label, name });
    }

    let occurrence_count = ffi::geospec_occt_occurrence_count(raw);
    let mut occurrences = Vec::with_capacity(occurrence_count);
    for index in 0..occurrence_count {
        let mut output = ffi::OccurrenceFacts::default();
        let label = copied_string(|label, error| {
            if reported {
                ffi::geospec_occt_report_occurrence(
                    raw,
                    index,
                    &mut output,
                    label,
                    std::ptr::null_mut(),
                    std::ptr::null_mut(),
                    error,
                )
            } else {
                ffi::geospec_occt_occurrence(
                    raw,
                    index,
                    &mut output,
                    label,
                    std::ptr::null_mut(),
                    std::ptr::null_mut(),
                    error,
                )
            }
        })?;
        let product_label = copied_string(|product, error| {
            if reported {
                ffi::geospec_occt_report_occurrence(
                    raw,
                    index,
                    &mut output,
                    std::ptr::null_mut(),
                    product,
                    std::ptr::null_mut(),
                    error,
                )
            } else {
                ffi::geospec_occt_occurrence(
                    raw,
                    index,
                    &mut output,
                    std::ptr::null_mut(),
                    product,
                    std::ptr::null_mut(),
                    error,
                )
            }
        })?;
        let name = copied_string(|name, error| {
            if reported {
                ffi::geospec_occt_report_occurrence(
                    raw,
                    index,
                    &mut output,
                    std::ptr::null_mut(),
                    std::ptr::null_mut(),
                    name,
                    error,
                )
            } else {
                ffi::geospec_occt_occurrence(
                    raw,
                    index,
                    &mut output,
                    std::ptr::null_mut(),
                    std::ptr::null_mut(),
                    name,
                    error,
                )
            }
        })?;
        occurrences.push(OccurrenceFacts {
            label,
            product_label,
            name,
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
            parent: (output.parent >= 0).then_some(output.parent as u32),
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
            ordinal_path: (0..output.ordinal_count)
                .map(|ordinal_index| {
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
                    Ok(ordinal)
                })
                .collect::<Result<Vec<_>, BackendError>>()?,
        });
    }

    let face_count = ffi::geospec_occt_face_count(raw);
    let mut faces = Vec::with_capacity(face_count);
    for index in 0..face_count {
        let mut output = ffi::FaceFacts::default();
        let mut error = ErrorBuffer::new();
        if reported {
            let mut located = ffi::LocatedFaceFacts::default();
            check(
                ffi::geospec_occt_report_face(raw, index, &mut located, error.raw()),
                &error,
            )?;
            output = located.face;
        } else {
            check(
                ffi::geospec_occt_face(raw, index, &mut output, error.raw()),
                &error,
            )?;
        }
        faces.push(output.try_into()?);
    }

    let pmi_count = ffi::geospec_occt_pmi_count(raw);
    let mut pmi = Vec::with_capacity(pmi_count);
    for index in 0..pmi_count {
        let mut output = ffi::PmiFacts::default();
        let label = copied_string(|label, error| {
            ffi::geospec_occt_pmi(raw, index, &mut output, label, std::ptr::null_mut(), error)
        })?;
        let name = copied_string(|name, error| {
            ffi::geospec_occt_pmi(raw, index, &mut output, std::ptr::null_mut(), name, error)
        })?;
        let mut shape_labels = Vec::with_capacity(output.association_count);
        for association in 0..output.association_count {
            shape_labels.push(copied_string(|label, error| {
                ffi::geospec_occt_pmi_association(raw, index, association, label, error)
            })?);
        }
        pmi.push(PmiFacts {
            label,
            name,
            kind: pmi_kind(output.kind)?,
            shape_labels,
        });
    }

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

    Ok(DocumentFacts {
        source_length_unit,
        source_unit_to_millimeters: unit_scale,
        products,
        occurrences,
        shape: shape.into(),
        faces,
        pmi,
        subshapes,
        datum_placements,
        semantic_datums,
    })
}

unsafe fn occurrence_faces(
    raw: *const ffi::Document,
    occurrence: u32,
    reported: bool,
) -> Result<Vec<LocatedFace>, BackendError> {
    let count = if reported {
        ffi::geospec_occt_report_occurrence_face_count(raw, occurrence)
    } else {
        ffi::geospec_occt_occurrence_face_count(raw, occurrence)
    };
    let mut result = Vec::with_capacity(count);
    for index in 0..count {
        let mut value = ffi::LocatedFaceFacts::default();
        let mut error = ErrorBuffer::new();
        check(
            if reported {
                ffi::geospec_occt_report_occurrence_face(
                    raw,
                    occurrence,
                    index,
                    &mut value,
                    error.raw(),
                )
            } else {
                ffi::geospec_occt_occurrence_face(raw, occurrence, index, &mut value, error.raw())
            },
            &error,
        )?;
        let mut edge_indices = Vec::with_capacity(value.edge_count);
        for edge_index in 0..value.edge_count {
            let mut edge = 0;
            check(
                ffi::geospec_occt_occurrence_face_edge(
                    raw,
                    occurrence,
                    index,
                    edge_index,
                    &mut edge,
                    error.raw(),
                ),
                &error,
            )?;
            edge_indices.push(edge);
        }
        let shape_label = copied_string(|label, error| {
            ffi::geospec_occt_occurrence_face_label(raw, occurrence, index, label, error)
        })?;
        result.push(LocatedFace {
            entity: BrepEntity::Face {
                occurrence,
                face: value.face.index,
            },
            facts: value.face.try_into()?,
            bounds: value.bounds.into(),
            reversed: value.reversed != 0,
            edge_indices,
            shape_label: (!shape_label.is_empty()).then_some(shape_label),
        });
    }
    Ok(result)
}

unsafe fn whole_faces(
    raw: *const ffi::Document,
    reported: bool,
) -> Result<Vec<LocatedFace>, BackendError> {
    let count = ffi::geospec_occt_face_count(raw);
    let mut result = Vec::with_capacity(count);
    for index in 0..count {
        let mut face = ffi::FaceFacts::default();
        let mut bounds = ffi::Bounds::default();
        let mut reversed = 0;
        let mut error = ErrorBuffer::new();
        if reported {
            let mut located = ffi::LocatedFaceFacts::default();
            check(
                ffi::geospec_occt_report_face(raw, index, &mut located, error.raw()),
                &error,
            )?;
            face = located.face;
            bounds = located.bounds;
            reversed = located.reversed;
        } else {
            check(
                ffi::geospec_occt_face(raw, index, &mut face, error.raw()),
                &error,
            )?;
            check(
                ffi::geospec_occt_face_location(
                    raw,
                    index,
                    &mut bounds,
                    &mut reversed,
                    error.raw(),
                ),
                &error,
            )?;
        }
        let shape_label =
            copied_string(|label, error| ffi::geospec_occt_face_label(raw, index, label, error))?;
        result.push(LocatedFace {
            entity: BrepEntity::WholeFace(face.index),
            facts: face.try_into()?,
            bounds: bounds.into(),
            reversed: reversed != 0,
            edge_indices: Vec::new(),
            shape_label: (!shape_label.is_empty()).then_some(shape_label),
        });
    }
    Ok(result)
}

unsafe fn occurrence_edges(
    raw: *const ffi::Document,
    occurrence: u32,
) -> Result<Vec<EdgeFacts>, BackendError> {
    let count = ffi::geospec_occt_occurrence_edge_count(raw, occurrence);
    let mut result = Vec::with_capacity(count);
    for index in 0..count {
        let mut value = ffi::EdgeFacts::default();
        let mut error = ErrorBuffer::new();
        check(
            ffi::geospec_occt_occurrence_edge(raw, occurrence, index, &mut value, error.raw()),
            &error,
        )?;
        result.push(value.try_into()?);
    }
    Ok(result)
}

unsafe fn validity(raw: *const ffi::Document) -> Result<ValidityFacts, BackendError> {
    let mut value = ffi::ValidityFacts::default();
    let reason =
        copied_string(|reason, error| ffi::geospec_occt_validity(raw, &mut value, reason, error))?;
    Ok(ValidityFacts {
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
    })
}

unsafe fn extrema(
    raw: *const ffi::Document,
    a: BrepEntity,
    b: BrepEntity,
) -> Result<Extrema, BackendError> {
    let mut value = ffi::Extrema::default();
    let mut error = ErrorBuffer::new();
    check(
        ffi::geospec_occt_extrema(raw, a.into(), b.into(), &mut value, error.raw()),
        &error,
    )?;
    Ok(Extrema {
        distance: value.distance,
        point_a: value.point_a,
        point_b: value.point_b,
    })
}

unsafe fn classify_points(
    raw: *const ffi::Document,
    occurrence: u32,
    points: &[[f64; 3]],
) -> Result<Vec<PointState>, BackendError> {
    let flat = points.iter().flatten().copied().collect::<Vec<_>>();
    let mut states = vec![0; points.len()];
    let mut error = ErrorBuffer::new();
    check(
        ffi::geospec_occt_classify_points(
            raw,
            occurrence,
            flat.as_ptr(),
            points.len(),
            states.as_mut_ptr(),
            states.len(),
            error.raw(),
        ),
        &error,
    )?;
    states.into_iter().map(point_state).collect()
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

unsafe fn common_volume(
    raw: *const ffi::Document,
    a: u32,
    b: u32,
) -> Result<CommonVolume, BackendError> {
    let mut value = ffi::CommonVolume::default();
    let mut error = ErrorBuffer::new();
    check(
        ffi::geospec_occt_common_volume(raw, a, b, &mut value, error.raw()),
        &error,
    )?;
    Ok(CommonVolume {
        volume: value.volume,
        centroid: value.centroid,
    })
}

unsafe fn regular_solid_containment(
    raw: *const ffi::Document,
    subject: BrepEntity,
    target: BrepEntity,
) -> Result<RegularSolidContainment, BackendError> {
    let mut value = ffi::RegularSolidContainment::default();
    let mut error = ErrorBuffer::new();
    check(
        ffi::geospec_occt_regular_solid_containment(
            raw,
            subject.into(),
            target.into(),
            &mut value,
            error.raw(),
        ),
        &error,
    )?;
    Ok(RegularSolidContainment {
        contained: value.contained != 0,
        residual_solid_count: value.residual_solid_count,
        residual_volume: value.residual_volume,
        residual_bounds: (value.has_residual_bounds != 0).then(|| value.residual_bounds.into()),
        residual_center_of_mass: (value.has_residual_center_of_mass != 0)
            .then_some(value.residual_center_of_mass),
    })
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

fn rejection_counts(value: &ffi::WallResult) -> BTreeMap<String, u32> {
    let mut result = BTreeMap::new();
    for (name, count) in [
        ("checkedPairs", value.checked_pairs),
        ("extremaFailed", value.extrema_failed),
        ("zeroLength", value.zero_length),
        ("noMaterialInterval", value.no_material_interval),
    ] {
        if count != 0 {
            result.insert(name.to_owned(), count);
        }
    }
    result
}

unsafe fn minimum_wall_thickness(
    raw: *const ffi::Document,
    options: &WallOptions,
) -> Result<WallThicknessOutcome, BackendError> {
    let input = ffi::WallOptions {
        work_unit_budget: options.work_unit_budget,
        mesh_linear_tolerance_mm: options.mesh_linear_tolerance_mm,
        mesh_angular_tolerance_degrees: options.mesh_angular_tolerance_degrees,
    };
    let mut value = ffi::WallResult::default();
    let mut error = ErrorBuffer::new();
    check(
        ffi::geospec_occt_minimum_wall_thickness(raw, &input, &mut value, error.raw()),
        &error,
    )?;
    let rejections = rejection_counts(&value);
    match value.outcome {
        0 => Ok(WallThicknessOutcome::Measured(WallThickness {
            consumed: value.consumed,
            value: value.value,
            location: Some(value.location),
            point_a: Some(value.point_a),
            point_b: Some(value.point_b),
            solid_index: Some(value.solid_index),
            tie_count: Some(value.tie_count),
            algorithm: "occt-exact-face-extrema-material-interval".to_owned(),
            tolerance: 1e-6,
            support_a: Some(WallSupport {
                face_index: Some(value.face_a + 1),
                surface_type: surface_name(value.surface_a),
                support_type: support_name(value.support_a),
            }),
            support_b: Some(WallSupport {
                face_index: Some(value.face_b + 1),
                surface_type: surface_name(value.surface_b),
                support_type: support_name(value.support_b),
            }),
            rejections,
        })),
        1 => Ok(WallThicknessOutcome::Empty {
            consumed: value.consumed,
            rejections,
        }),
        2 => Ok(WallThicknessOutcome::BudgetExceeded {
            consumed: value.consumed,
            limit: value.limit,
        }),
        _ => Err(backend_error("OCCT returned an unknown wall outcome.")),
    }
}

fn surface_name(value: i32) -> Option<String> {
    Some(
        match value {
            0 => "plane",
            1 => "cylinder",
            2 => "cone",
            3 => "sphere",
            4 => "torus",
            5 => "bezier",
            6 => "bspline",
            7 => "revolution",
            8 => "extrusion",
            9 => "offset",
            10 => "other",
            _ => return None,
        }
        .to_owned(),
    )
}

fn support_name(value: i32) -> Option<String> {
    Some(
        match value {
            0 => "vertex",
            1 => "edge",
            2 => "face",
            3 => "unknown",
            _ => return None,
        }
        .to_owned(),
    )
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
    let mut position_count = 0;
    let mut triangle_count = 0;
    let mut error = ErrorBuffer::new();
    check(
        ffi::geospec_occt_tessellate(
            raw,
            entity.into(),
            profile.linear_deflection_mm,
            profile.angular_deflection_rad,
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
    check(
        ffi::geospec_occt_tessellate(
            raw,
            entity.into(),
            profile.linear_deflection_mm,
            profile.angular_deflection_rad,
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
    Ok(TriangleMesh {
        positions,
        triangles,
    })
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
            valid: value.valid != 0,
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
            parameter_bounds: value.parameter_bounds,
            area: value.area,
            center_of_mass: value.center_of_mass,
            surface,
        })
    }
}

fn pmi_kind(value: i32) -> Result<PmiKind, BackendError> {
    match value {
        0 => Ok(PmiKind::Dimension),
        1 => Ok(PmiKind::GeometricTolerance),
        2 => Ok(PmiKind::Datum),
        _ => Err(backend_error("OCCT returned an unknown PMI kind.")),
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

    #[repr(C)]
    pub struct Document {
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
        pub valid: i32,
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
    pub struct PmiFacts {
        pub kind: i32,
        pub association_count: usize,
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
        pub edge_count: usize,
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
    pub struct Extrema {
        pub distance: f64,
        pub point_a: [f64; 3],
        pub point_b: [f64; 3],
    }

    #[derive(Clone, Copy, Default)]
    #[repr(C)]
    pub struct CommonVolume {
        pub volume: f64,
        pub centroid: [f64; 3],
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
    pub struct WallOptions {
        pub work_unit_budget: u64,
        pub mesh_linear_tolerance_mm: f64,
        pub mesh_angular_tolerance_degrees: f64,
    }

    #[derive(Clone, Copy, Default)]
    #[repr(C)]
    pub struct WallResult {
        pub outcome: i32,
        pub consumed: u64,
        pub limit: u64,
        pub value: f64,
        pub location: [f64; 3],
        pub point_a: [f64; 3],
        pub point_b: [f64; 3],
        pub solid_index: u32,
        pub tie_count: u32,
        pub face_a: u32,
        pub face_b: u32,
        pub surface_a: i32,
        pub surface_b: i32,
        pub support_a: i32,
        pub support_b: i32,
        pub checked_pairs: u32,
        pub extrema_failed: u32,
        pub zero_length: u32,
        pub no_material_interval: u32,
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
        pub occurrence_bytes: usize,
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

    unsafe extern "C" {
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
        pub fn geospec_occt_open_step(
            bytes: *const u8,
            length: usize,
            out: *mut *mut Document,
            error: *mut StringBuffer,
        ) -> i32;
        pub fn geospec_occt_release(document: *mut Document);
        pub fn geospec_occt_document_facts(
            document: *const Document,
            shape: *mut ShapeFacts,
            unit_scale: *mut f64,
            unit: *mut StringBuffer,
            error: *mut StringBuffer,
        ) -> i32;
        pub fn geospec_occt_admission_facts(
            document: *const Document,
            unit_scale: *mut f64,
            occurrence_count: *mut usize,
            unit: *mut StringBuffer,
            error: *mut StringBuffer,
        ) -> i32;
        pub fn geospec_occt_report_prepare(
            document: *const Document,
            sizes: *mut ReportSizes,
            error: *mut StringBuffer,
        ) -> i32;
        pub fn geospec_occt_report_discard(document: *const Document);
        pub fn geospec_occt_report_document_facts(
            document: *const Document,
            shape: *mut ShapeFacts,
            unit_scale: *mut f64,
            unit: *mut StringBuffer,
            error: *mut StringBuffer,
        ) -> i32;
        pub fn geospec_occt_report_occurrence(
            document: *const Document,
            index: usize,
            facts: *mut OccurrenceFacts,
            label: *mut StringBuffer,
            product: *mut StringBuffer,
            name: *mut StringBuffer,
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
        pub fn geospec_occt_product(
            document: *const Document,
            index: usize,
            label: *mut StringBuffer,
            name: *mut StringBuffer,
            error: *mut StringBuffer,
        ) -> i32;
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
        pub fn geospec_occt_face_label(
            document: *const Document,
            index: usize,
            shape_label: *mut StringBuffer,
            error: *mut StringBuffer,
        ) -> i32;
        pub fn geospec_occt_pmi_count(document: *const Document) -> usize;
        pub fn geospec_occt_pmi(
            document: *const Document,
            index: usize,
            facts: *mut PmiFacts,
            label: *mut StringBuffer,
            name: *mut StringBuffer,
            error: *mut StringBuffer,
        ) -> i32;
        pub fn geospec_occt_pmi_association(
            document: *const Document,
            index: usize,
            association: usize,
            label: *mut StringBuffer,
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
        pub fn geospec_occt_occurrence_face(
            document: *const Document,
            occurrence: u32,
            index: usize,
            facts: *mut LocatedFaceFacts,
            error: *mut StringBuffer,
        ) -> i32;
        pub fn geospec_occt_occurrence_face_label(
            document: *const Document,
            occurrence: u32,
            index: usize,
            shape_label: *mut StringBuffer,
            error: *mut StringBuffer,
        ) -> i32;
        pub fn geospec_occt_occurrence_face_edge(
            document: *const Document,
            occurrence: u32,
            face_index: usize,
            edge_index: usize,
            edge: *mut u32,
            error: *mut StringBuffer,
        ) -> i32;
        pub fn geospec_occt_occurrence_edge_count(
            document: *const Document,
            occurrence: u32,
        ) -> usize;
        pub fn geospec_occt_occurrence_edge(
            document: *const Document,
            occurrence: u32,
            index: usize,
            facts: *mut EdgeFacts,
            error: *mut StringBuffer,
        ) -> i32;
        pub fn geospec_occt_validity(
            document: *const Document,
            facts: *mut ValidityFacts,
            reason: *mut StringBuffer,
            error: *mut StringBuffer,
        ) -> i32;
        pub fn geospec_occt_extrema(
            document: *const Document,
            a: Entity,
            b: Entity,
            extrema: *mut Extrema,
            error: *mut StringBuffer,
        ) -> i32;
        pub fn geospec_occt_cylinder_axial_extent(
            document: *const Document,
            face: Entity,
            extent: *mut CylinderAxialExtent,
            error: *mut StringBuffer,
        ) -> i32;
        pub fn geospec_occt_classify_points(
            document: *const Document,
            occurrence: u32,
            points: *const f64,
            point_count: usize,
            states: *mut i32,
            state_capacity: usize,
            error: *mut StringBuffer,
        ) -> i32;
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
        pub fn geospec_occt_common_volume(
            document: *const Document,
            occurrence_a: u32,
            occurrence_b: u32,
            common: *mut CommonVolume,
            error: *mut StringBuffer,
        ) -> i32;
        pub fn geospec_occt_regular_solid_containment(
            document: *const Document,
            subject: Entity,
            target: Entity,
            result: *mut RegularSolidContainment,
            error: *mut StringBuffer,
        ) -> i32;
        pub fn geospec_occt_minimum_wall_thickness(
            document: *const Document,
            options: *const WallOptions,
            wall: *mut WallResult,
            error: *mut StringBuffer,
        ) -> i32;
        pub fn geospec_occt_tessellate(
            document: *const Document,
            entity: Entity,
            linear: f64,
            angular: f64,
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
