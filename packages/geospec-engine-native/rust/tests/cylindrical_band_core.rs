//! Bounded transport/routing controls, not an independent kernel or math oracle.
//! The raw certificate below is copied from the original aabb-gap-false-positive
//! shaft.journal C1 query (cylindrical-band-query-a1/attempt-1/row-map.json, row 0).
//! Association corruptions in individual controls are mock transport faults only.

fn raw_certificate() -> NominalCylindricalBand {
    NominalCylindricalBand {
        axis: [0.0, -0.043619387365333794, 0.9990482215818579],
        boundary: [
            CylinderBoundaryUse {
                curve_range: [0.0, 6.283185307179586],
                edge_index: 1,
                orientation: CylinderBoundaryOrientation::Reversed,
                parameter_endpoints: [[0.0, 30.0], [6.283185307179586, 30.0]],
                pcurve_stored: true,
                side: CylinderBoundarySide::V1,
            },
            CylinderBoundaryUse {
                curve_range: [0.0, 30.0],
                edge_index: 2,
                orientation: CylinderBoundaryOrientation::Reversed,
                parameter_endpoints: [[0.0, 0.0], [0.0, 30.0]],
                pcurve_stored: true,
                side: CylinderBoundarySide::U0,
            },
            CylinderBoundaryUse {
                curve_range: [0.0, 6.283185307179586],
                edge_index: 3,
                orientation: CylinderBoundaryOrientation::Forward,
                parameter_endpoints: [[0.0, 0.0], [6.283185307179586, 0.0]],
                pcurve_stored: true,
                side: CylinderBoundarySide::V0,
            },
            CylinderBoundaryUse {
                curve_range: [0.0, 30.0],
                edge_index: 2,
                orientation: CylinderBoundaryOrientation::Forward,
                parameter_endpoints: [[6.28318530718, 0.0], [6.28318530718, 30.0]],
                pcurve_stored: true,
                side: CylinderBoundarySide::U1,
            },
        ],
        boundary_residuals: [
            CylindricalBandBoundaryResidual {
                curve_surface_mm: 0.0,
                limit_mm: 1e-7,
                parameter_coverage_mm: 1.0347278589506459e-11,
                vertex_attachment_mm: 5.995204332975845e-15,
            },
            CylindricalBandBoundaryResidual {
                curve_surface_mm: 6.112067691447681e-15,
                limit_mm: 1e-7,
                parameter_coverage_mm: 0.0,
                vertex_attachment_mm: 6.112067691447681e-15,
            },
            CylindricalBandBoundaryResidual {
                curve_surface_mm: 0.0,
                limit_mm: 1e-7,
                parameter_coverage_mm: 1.0347278589506459e-11,
                vertex_attachment_mm: 6.112067691447681e-15,
            },
            CylindricalBandBoundaryResidual {
                curve_surface_mm: 1.0347245958049033e-11,
                limit_mm: 1e-7,
                parameter_coverage_mm: 0.0,
                vertex_attachment_mm: 1.0347245958049033e-11,
            },
        ],
        edge_tolerances_mm: [1e-7, 1e-7, 1e-7],
        face_tolerance_mm: 1e-7,
        from: 0.0,
        occurrence: 1,
        origin: [0.0, 0.65429081048, 0.01427667627213],
        parameter_bounds: [0.0, 6.28318530718, 0.0, 30.0],
        period_residual_mm: 1.0347278589506459e-11,
        phase_x: [1.0, 0.0, 0.0],
        phase_y: [0.0, 0.9990482215818579, 0.043619387365333794],
        private_query_face: 1,
        profile: CylindricalBandProfile::NominalV1,
        public_face_ordinal: 0,
        radius: 25.0,
        rims: [
            CylindricalBandRim {
                axis: [0.0, -0.043619387365333794, 0.9990482215818579],
                center: [0.0, 0.65429081048, 0.01427667627213],
                curve_period: 6.283185307179586,
                curve_range: [0.0, 6.283185307179586],
                edge_index: 3,
                phase_x: [1.0, 0.0, 0.0],
                phase_y: [0.0, 0.9990482215818579, 0.043619387365333794],
                radius: 25.0,
                vertex_indices: [2, 2],
            },
            CylindricalBandRim {
                axis: [0.0, -0.043619387365333794, 0.9990482215818579],
                center: [0.0, -0.6542908104800138, 29.985723323727864],
                curve_period: 6.283185307179586,
                curve_range: [0.0, 6.283185307179586],
                edge_index: 1,
                phase_x: [1.0, 0.0, 0.0],
                phase_y: [0.0, 0.9990482215818579, 0.043619387365333794],
                radius: 25.0,
                vertex_indices: [1, 1],
            },
        ],
        seam_axis: [0.0, -0.043619387365333794, 0.9990482215818579],
        seam_curve_range: [0.0, 30.0],
        seam_edge_index: 2,
        seam_origin: [25.0, 0.6542908104799939, 0.014276676272129732],
        seam_vertex_indices: [2, 1],
        source_face_entity: 480,
        source_route: [
            585, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0,
        ],
        source_route_count: 1,
        source_same_sense: true,
        surface_period: 6.283185307179586,
        to: 30.0,
        transferred_reversed: false,
        vertex_tolerances_mm: [1e-7, 1e-7],
        vertices: [
            CylinderVertex {
                point: [25.0, -0.6542908104800198, 29.985723323727864],
                vertex_index: 1,
            },
            CylinderVertex {
                point: [25.0, 0.6542908104799939, 0.014276676272129732],
                vertex_index: 2,
            },
        ],
    }
}

// Untouched original shaft-bore-radial-positive shaft.journal certificate.
fn cartesian_certificate() -> NominalCylindricalBand {
    NominalCylindricalBand {
        axis: [0.0, 0.0, 1.0],
        boundary: [
            CylinderBoundaryUse {
                curve_range: [0.0, 6.283185307179586],
                edge_index: 1,
                orientation: CylinderBoundaryOrientation::Reversed,
                parameter_endpoints: [[0.0, 30.0], [6.283185307179586, 30.0]],
                pcurve_stored: true,
                side: CylinderBoundarySide::V1,
            },
            CylinderBoundaryUse {
                curve_range: [0.0, 30.0],
                edge_index: 2,
                orientation: CylinderBoundaryOrientation::Reversed,
                parameter_endpoints: [[0.0, 0.0], [0.0, 30.0]],
                pcurve_stored: true,
                side: CylinderBoundarySide::U0,
            },
            CylinderBoundaryUse {
                curve_range: [0.0, 6.283185307179586],
                edge_index: 3,
                orientation: CylinderBoundaryOrientation::Forward,
                parameter_endpoints: [[0.0, 0.0], [6.283185307179586, 0.0]],
                pcurve_stored: true,
                side: CylinderBoundarySide::V0,
            },
            CylinderBoundaryUse {
                curve_range: [0.0, 30.0],
                edge_index: 2,
                orientation: CylinderBoundaryOrientation::Forward,
                parameter_endpoints: [[6.28318530718, 0.0], [6.28318530718, 30.0]],
                pcurve_stored: true,
                side: CylinderBoundarySide::U1,
            },
        ],
        boundary_residuals: [
            CylindricalBandBoundaryResidual {
                curve_surface_mm: 0.0,
                limit_mm: 1e-7,
                parameter_coverage_mm: 1.0347278589506459e-11,
                vertex_attachment_mm: 6.123233995737e-15,
            },
            CylindricalBandBoundaryResidual {
                curve_surface_mm: 6.123233995737e-15,
                limit_mm: 1e-7,
                parameter_coverage_mm: 0.0,
                vertex_attachment_mm: 6.123233995737e-15,
            },
            CylindricalBandBoundaryResidual {
                curve_surface_mm: 0.0,
                limit_mm: 1e-7,
                parameter_coverage_mm: 1.0347278589506459e-11,
                vertex_attachment_mm: 6.123233995737e-15,
            },
            CylindricalBandBoundaryResidual {
                curve_surface_mm: 1.0347278589506459e-11,
                limit_mm: 1e-7,
                parameter_coverage_mm: 0.0,
                vertex_attachment_mm: 1.0347278589506459e-11,
            },
        ],
        edge_tolerances_mm: [1e-7, 1e-7, 1e-7],
        face_tolerance_mm: 1e-7,
        from: 0.0,
        occurrence: 1,
        origin: [0.0, 0.0, 0.0],
        parameter_bounds: [0.0, 6.28318530718, 0.0, 30.0],
        period_residual_mm: 1.0347278589506459e-11,
        phase_x: [1.0, 0.0, 0.0],
        phase_y: [0.0, 1.0, 0.0],
        private_query_face: 1,
        profile: CylindricalBandProfile::NominalV1,
        public_face_ordinal: 0,
        radius: 25.0,
        rims: [
            CylindricalBandRim {
                axis: [0.0, 0.0, 1.0],
                center: [0.0, 0.0, 0.0],
                curve_period: 6.283185307179586,
                curve_range: [0.0, 6.283185307179586],
                edge_index: 3,
                phase_x: [1.0, 0.0, 0.0],
                phase_y: [0.0, 1.0, 0.0],
                radius: 25.0,
                vertex_indices: [2, 2],
            },
            CylindricalBandRim {
                axis: [0.0, 0.0, 1.0],
                center: [0.0, 0.0, 30.0],
                curve_period: 6.283185307179586,
                curve_range: [0.0, 6.283185307179586],
                edge_index: 1,
                phase_x: [1.0, 0.0, 0.0],
                phase_y: [0.0, 1.0, 0.0],
                radius: 25.0,
                vertex_indices: [1, 1],
            },
        ],
        seam_axis: [0.0, 0.0, 1.0],
        seam_curve_range: [0.0, 30.0],
        seam_edge_index: 2,
        seam_origin: [25.0, -6.123233995737e-15, 0.0],
        seam_vertex_indices: [2, 1],
        source_face_entity: 480,
        source_route: [
            585, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0,
        ],
        source_route_count: 1,
        source_same_sense: true,
        surface_period: 6.283185307179586,
        to: 30.0,
        transferred_reversed: false,
        vertex_tolerances_mm: [1e-7, 1e-7],
        vertices: [
            CylinderVertex {
                point: [25.0, -6.123233995737e-15, 30.0],
                vertex_index: 1,
            },
            CylinderVertex {
                point: [25.0, -6.123233995737e-15, 0.0],
                vertex_index: 2,
            },
        ],
    }
}

// Untouched aabb-gap-false-positive housing.bore certificate (row 0 target).
fn target_certificate() -> NominalCylindricalBand {
    NominalCylindricalBand {
        axis: [0.0, 0.0, 1.0],
        boundary: [
            CylinderBoundaryUse {
                curve_range: [0.0, 6.283185307179586],
                edge_index: 1,
                orientation: CylinderBoundaryOrientation::Forward,
                parameter_endpoints: [[0.0, 30.0], [6.283185307179586, 30.0]],
                pcurve_stored: true,
                side: CylinderBoundarySide::V1,
            },
            CylinderBoundaryUse {
                curve_range: [0.0, 30.0],
                edge_index: 2,
                orientation: CylinderBoundaryOrientation::Reversed,
                parameter_endpoints: [[6.28318530718, 0.0], [6.28318530718, 30.0]],
                pcurve_stored: true,
                side: CylinderBoundarySide::U1,
            },
            CylinderBoundaryUse {
                curve_range: [0.0, 6.283185307179586],
                edge_index: 3,
                orientation: CylinderBoundaryOrientation::Reversed,
                parameter_endpoints: [[0.0, 0.0], [6.283185307179586, 0.0]],
                pcurve_stored: true,
                side: CylinderBoundarySide::V0,
            },
            CylinderBoundaryUse {
                curve_range: [0.0, 30.0],
                edge_index: 2,
                orientation: CylinderBoundaryOrientation::Forward,
                parameter_endpoints: [[0.0, 0.0], [0.0, 30.0]],
                pcurve_stored: true,
                side: CylinderBoundarySide::U0,
            },
        ],
        boundary_residuals: [
            CylindricalBandBoundaryResidual {
                curve_surface_mm: 0.0,
                limit_mm: 1e-7,
                parameter_coverage_mm: 1.0363834235249669e-11,
                vertex_attachment_mm: 6.13303117013e-15,
            },
            CylindricalBandBoundaryResidual {
                curve_surface_mm: 1.036383423524967e-11,
                limit_mm: 1e-7,
                parameter_coverage_mm: 0.0,
                vertex_attachment_mm: 1.036383423524967e-11,
            },
            CylindricalBandBoundaryResidual {
                curve_surface_mm: 0.0,
                limit_mm: 1e-7,
                parameter_coverage_mm: 1.0363834235249669e-11,
                vertex_attachment_mm: 6.13303117013e-15,
            },
            CylindricalBandBoundaryResidual {
                curve_surface_mm: 6.13303117013e-15,
                limit_mm: 1e-7,
                parameter_coverage_mm: 0.0,
                vertex_attachment_mm: 6.13303117013e-15,
            },
        ],
        edge_tolerances_mm: [1e-7, 1e-7, 1e-7],
        face_tolerance_mm: 1e-7,
        from: 0.0,
        occurrence: 0,
        origin: [0.0, 0.0, 0.0],
        parameter_bounds: [0.0, 6.28318530718, 0.0, 30.0],
        period_residual_mm: 1.0363834235249669e-11,
        phase_x: [1.0, 0.0, 0.0],
        phase_y: [0.0, 1.0, 0.0],
        private_query_face: 7,
        profile: CylindricalBandProfile::NominalV1,
        public_face_ordinal: 6,
        radius: 25.04,
        rims: [
            CylindricalBandRim {
                axis: [0.0, 0.0, 1.0],
                center: [0.0, 0.0, 0.0],
                curve_period: 6.283185307179586,
                curve_range: [0.0, 6.283185307179586],
                edge_index: 3,
                phase_x: [1.0, 0.0, 0.0],
                phase_y: [0.0, 1.0, 0.0],
                radius: 25.04,
                vertex_indices: [2, 2],
            },
            CylindricalBandRim {
                axis: [0.0, 0.0, 1.0],
                center: [0.0, 0.0, 30.0],
                curve_period: 6.283185307179586,
                curve_range: [0.0, 6.283185307179586],
                edge_index: 1,
                phase_x: [1.0, 0.0, 0.0],
                phase_y: [0.0, 1.0, 0.0],
                radius: 25.04,
                vertex_indices: [1, 1],
            },
        ],
        seam_axis: [0.0, 0.0, 1.0],
        seam_curve_range: [0.0, 30.0],
        seam_edge_index: 2,
        seam_origin: [25.04, -6.13303117013e-15, 0.0],
        seam_vertex_indices: [2, 1],
        source_face_entity: 432,
        source_route: [
            468, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0,
        ],
        source_route_count: 1,
        source_same_sense: false,
        surface_period: 6.283185307179586,
        to: 30.0,
        transferred_reversed: true,
        vertex_tolerances_mm: [1e-7, 1e-7],
        vertices: [
            CylinderVertex {
                point: [25.04, -6.13303117013e-15, 30.0],
                vertex_index: 1,
            },
            CylinderVertex {
                point: [25.04, -6.13303117013e-15, 0.0],
                vertex_index: 2,
            },
        ],
    }
}

use super::*;
use crate::{
    backend::{brep::*, TriangleMesh},
    budget::Budget,
    result::{finish, Polarity},
    subject::{Subject, SubjectFormat},
};
use std::{cell::RefCell, rc::Rc};

#[derive(Clone)]
struct Control {
    reported: NominalCylindricalBand,
    additional: Option<NominalCylindricalBand>,
    answer: Result<NominalCylindricalBand, BackendError>,
    calls: Rc<RefCell<Vec<BrepEntity>>>,
}

impl BrepSubject for Control {
    fn nominal_cylindrical_band(
        &self,
        face: BrepEntity,
    ) -> Result<NominalCylindricalBand, BackendError> {
        self.calls.borrow_mut().push(face);
        if let Some(value) = self
            .additional
            .as_ref()
            .filter(|value| address(value) == face)
        {
            return Ok(value.clone());
        }
        self.answer.clone()
    }

    fn reported_facts_and_mesh(&self) -> Result<ReportedBrepBundle, BackendError> {
        let mut occurrence_faces: Vec<Rc<[LocatedFace]>> =
            vec![Rc::from([]); self.reported.occurrence as usize + 1];
        for band in std::iter::once(&self.reported).chain(&self.additional) {
            let selected = LocatedFace {
                entity: address(band),
                facts: FaceFacts {
                    index: band.public_face_ordinal,
                    parameter_bounds: band.parameter_bounds,
                    area: 1.0,
                    center_of_mass: band.origin,
                    surface: SurfaceFacts::Cylinder {
                        origin: band.origin,
                        axis: band.axis,
                        radius: band.radius,
                    },
                },
                bounds: Bounds {
                    min: [-40.0; 3],
                    max: [40.0; 3],
                },
                reversed: band.transferred_reversed,
                edge_indices: vec![1, 2, 3],
                shape_label: Some("0:1:1:3:1".into()),
            };
            // Unselected ordinal slots are report-only scaffolding; the selected
            // slot retains the exact public ordinal/private address from C1.
            let mut faces = vec![selected.clone(); band.public_face_ordinal as usize + 1];
            for (index, face) in faces.iter_mut().enumerate() {
                face.facts.index = index as u32;
                if index != band.public_face_ordinal as usize {
                    face.entity = BrepEntity::Face {
                        occurrence: band.occurrence,
                        face: index as u32 + 1,
                    };
                }
            }
            occurrence_faces[band.occurrence as usize] = Rc::from(faces);
        }
        Ok(ReportedBrepBundle {
            facts: self.facts()?,
            whole_faces: Rc::from([]),
            occurrence_faces,
            mesh: Rc::new(TriangleMesh {
                positions: vec![],
                triangles: vec![],
            }),
        })
    }

    fn facts(&self) -> Result<Rc<DocumentFacts>, BackendError> {
        Ok(Rc::new(DocumentFacts {
            source_length_unit: "millimetre".into(),
            source_unit_to_millimeters: 1.0,
            products: vec![],
            occurrences: (0..=self.reported.occurrence)
                .map(|index| OccurrenceFacts {
                    label: format!("occurrence-{index}"),
                    product_label: "core-product".into(),
                    name: if index == 1 { "shaft" } else { "housing" }.into(),
                    placement: [1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0],
                    bounds: Bounds {
                        min: [-40.0; 3],
                        max: [40.0; 3],
                    },
                    path: if index == 1 { "shaft" } else { "housing" }.into(),
                    parent: None,
                    product: 0,
                    product_name: "core-product".into(),
                    instance_name: None,
                    ordinal_path: vec![index + 1],
                })
                .collect(),
            faces: vec![],
            pmi: vec![],
            subshapes: vec![],
            datum_placements: vec![],
            semantic_datums: vec![],
            shape: ShapeFacts {
                valid: true,
                bounds: Bounds {
                    min: [-40.0; 3],
                    max: [40.0; 3],
                },
                volume: 1.0,
                surface_area: 1.0,
                center_of_mass: [0.0; 3],
                topology: TopologyCounts {
                    compounds: 0,
                    solids: 1,
                    shells: 1,
                    faces: 3,
                    wires: 3,
                    edges: 3,
                    vertices: 2,
                },
            },
        }))
    }

    fn faces(&self) -> Result<Rc<[LocatedFace]>, BackendError> {
        unreachable!("no whole-face fallback")
    }
    fn occurrence_faces(&self, _: u32) -> Result<Rc<[LocatedFace]>, BackendError> {
        unreachable!("reuse retained report")
    }
    fn occurrence_edges(&self, _: u32) -> Result<Rc<[EdgeFacts]>, BackendError> {
        unreachable!("no edge query")
    }
    fn validity(&self) -> Result<Rc<ValidityFacts>, BackendError> {
        unreachable!("C1 admission owns validity")
    }
    fn extrema(&self, _: BrepEntity, _: BrepEntity) -> Result<Extrema, BackendError> {
        unreachable!("no extrema fallback")
    }
    fn classify_points(&self, _: u32, _: &[[f64; 3]]) -> Result<Vec<PointState>, BackendError> {
        unreachable!("no point classifier")
    }
    fn classify_face_points(
        &self,
        _: BrepEntity,
        _: &[[f64; 3]],
        _: f64,
    ) -> Result<Vec<PointState>, BackendError> {
        unreachable!("no point classifier")
    }
    fn common_volume(&self, _: u32, _: u32) -> Result<CommonVolume, BackendError> {
        unreachable!("no solid fallback")
    }
    fn minimum_wall_thickness(
        &self,
        _: &WallOptions,
    ) -> Result<WallThicknessOutcome, BackendError> {
        unreachable!("no wall fallback")
    }
    fn tessellate(
        &self,
        _: BrepEntity,
        _: TessellationProfile,
    ) -> Result<Rc<TriangleMesh>, BackendError> {
        unreachable!("no mesh fallback")
    }
}

fn address(band: &NominalCylindricalBand) -> BrepEntity {
    BrepEntity::Face {
        occurrence: band.occurrence,
        face: band.private_query_face,
    }
}

fn control(
    band: NominalCylindricalBand,
    answer: Result<NominalCylindricalBand, BackendError>,
) -> (Rc<Subject>, Control) {
    let control = Control {
        reported: band,
        additional: None,
        answer,
        calls: Rc::new(RefCell::new(vec![])),
    };
    let subject = subject_with(&control);
    (subject, control)
}

fn subject_with(control: &Control) -> Rc<Subject> {
    let identity = crate::identity::SubjectIdentity::step(
        b"cylindrical-band-core-transport-control",
        "millimetre",
        1.0,
        BrepIdentityProfile {
            ingest_profile: "core-control",
            backend_profile: "core-control",
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
    subject.brep = Some(Box::new(control.clone()));
    Rc::new(subject)
}

fn with_context<T>(
    subject: &Rc<Subject>,
    limit: u64,
    action: impl FnOnce(&mut EvaluationContext<'_>) -> T,
) -> (T, u64) {
    let subjects = [Rc::clone(subject)];
    let normalized = Json::Null;
    let budget = Budget::new(limit);
    let mut context = EvaluationContext::new(
        &subjects,
        Capability::ToHaveSpatialRelationships,
        "cylindrical-band-core",
        &normalized,
        &budget,
        None,
    );
    let value = action(&mut context);
    (value, budget.used())
}

fn endpoint(band: &NominalCylindricalBand) -> Endpoint {
    Endpoint {
        occurrence: Some(band.occurrence),
        entity: address(band),
        bore: None,
        facts: EntityFacts {
            face_index: Some(band.public_face_ordinal),
            surface_type: Some("cylinder".into()),
            ..EntityFacts::default()
        },
    }
}

fn prepared(band: &NominalCylindricalBand, minimum: f64, count: usize) -> Prepared {
    let selection = Selection {
        status: SelectionStatus::Resolved,
        expected: Cardinality::One,
        stability: Stability::Authored,
        candidates: vec![],
        diagnostics: vec![],
        entities: vec![Entity {
            id: "interface:shaft.journal".into(),
            entity_type: crate::analysis::selection::EntityType::Face,
            occurrence_path: Some("shaft".into()),
            occurrence: Some(band.occurrence),
            face: Some(address(band)),
            facts: endpoint(band).facts,
            topology_ref: None,
        }],
    };
    let mut relationship = parse_relationship(
        &Json::object([
            ("kind", Json::string("clearance")),
            ("subject", Json::string("shaft.journal")),
            ("target", Json::string("shaft.journal")),
            ("min", Json::Number(minimum)),
        ]),
        0,
    )
    .unwrap();
    relationship.resolved = Some((selection.clone(), selection));
    relationship.resolved_bores = Some((vec![None], vec![None]));
    Prepared {
        relationships: vec![relationship; count],
    }
}

fn run(
    prepared: &Prepared,
    subject: &Rc<Subject>,
    limit: u64,
    polarity: Polarity,
) -> (serde_json::Value, u64) {
    let subjects = [Rc::clone(subject)];
    let normalized = prepared.normalized_payload();
    let budget = Budget::new(limit);
    let mut context = EvaluationContext::new(
        &subjects,
        Capability::ToHaveSpatialRelationships,
        "cylindrical-band-core",
        &normalized,
        &budget,
        None,
    );
    let result = finish(
        "cylindrical-band-core",
        Capability::ToHaveSpatialRelationships,
        polarity,
        evaluate(prepared, &mut context),
    )
    .unwrap();
    (
        serde_json::from_slice(&encode(&result).unwrap()).unwrap(),
        budget.used(),
    )
}

fn refused(evaluation: Evaluation, polarity: Polarity) -> serde_json::Value {
    let result = finish(
        "cylindrical-band-core",
        Capability::ToHaveSpatialRelationships,
        polarity,
        evaluation,
    )
    .unwrap();
    let json: serde_json::Value = serde_json::from_slice(&encode(&result).unwrap()).unwrap();
    assert_eq!(json["status"], "refused");
    json
}

fn assert_exact_json_numbers(actual: &serde_json::Value, expected: &serde_json::Value) {
    use serde_json::Value;
    match (actual, expected) {
        (Value::Number(a), Value::Number(b)) => {
            // Canonical JSON's `0` and serde's `0.0` are the same binary64;
            // all bits, including nonzero residuals, must remain identical.
            assert_eq!(a.as_f64().unwrap().to_bits(), b.as_f64().unwrap().to_bits());
        }
        (Value::Array(a), Value::Array(b)) => {
            assert_eq!(a.len(), b.len());
            for (a, b) in a.iter().zip(b) {
                assert_exact_json_numbers(a, b);
            }
        }
        (Value::Object(a), Value::Object(b)) => {
            assert_eq!(a.keys().collect::<Vec<_>>(), b.keys().collect::<Vec<_>>());
            for (key, value) in a {
                assert_exact_json_numbers(value, &b[key]);
            }
        }
        _ => assert_eq!(actual, expected),
    }
}

#[test]
fn selected_public_ordinal_is_not_the_private_query_address() {
    let mut band = raw_certificate();
    // Deliberately non-arithmetic mapping: geometry remains the raw C1 record.
    band.private_query_face = 7;
    let (subject, mock) = control(band.clone(), Ok(band.clone()));
    let ((value, route), used) = with_context(&subject, 2, |context| {
        assert!(context.brep_facts().is_ok());
        let route = cylindrical_band_face(&endpoint(&band)).ok().unwrap();
        (
            context
                .nominal_cylindrical_band(route.0, route.1)
                .ok()
                .unwrap(),
            route,
        )
    });
    assert_eq!(
        route,
        (
            BrepEntity::Face {
                occurrence: 1,
                face: 7
            },
            0
        )
    );
    assert_eq!(*value, band);
    assert_eq!(mock.calls.borrow().as_slice(), &[route.0]);
    assert_eq!(used, 2);
}

#[test]
fn distinct_face_reuse_is_claim_local_and_cold_warm_charges_match() {
    let band = raw_certificate();
    let (subject, mock) = control(band.clone(), Ok(band.clone()));
    for _ in 0..2 {
        let (_, used) = with_context(&subject, 2, |context| {
            assert!(context.brep_facts().is_ok());
            let a = context
                .nominal_cylindrical_band(address(&band), 0)
                .ok()
                .unwrap();
            let b = context
                .nominal_cylindrical_band(address(&band), 0)
                .ok()
                .unwrap();
            assert!(Rc::ptr_eq(&a, &b));
            assert_eq!(*a, band);
        });
        assert_eq!(used, 2);
    }
    assert_eq!(
        mock.calls.borrow().as_slice(),
        &[address(&band), address(&band)]
    );
}

#[test]
fn distinct_face_budget_precedes_query_and_never_inverts() {
    let band = raw_certificate();
    let (subject, mock) = control(band.clone(), Ok(band.clone()));
    for polarity in [Polarity::Positive, Polarity::Negative] {
        let (error, used) = with_context(&subject, 1, |context| {
            assert!(context.brep_facts().is_ok());
            context
                .nominal_cylindrical_band(address(&band), 0)
                .err()
                .unwrap()
        });
        let result = refused(error, polarity);
        assert_eq!(result["diagnostics"][0]["code"], "MATCHER_TIMEOUT");
        assert_eq!(used, 2);
    }
    assert!(mock.calls.borrow().is_empty());
}

#[test]
fn each_pair_pays_even_when_both_roles_reuse_one_face() {
    let band = raw_certificate();
    let (subject, mock) = control(band.clone(), Ok(band.clone()));
    for _ in 0..2 {
        let (_, used) = with_context(&subject, 4, |context| {
            assert!(context.brep_facts().is_ok());
            for _ in 0..2 {
                let (a, b) =
                    selected_cylindrical_band_pair(&endpoint(&band), &endpoint(&band), context)
                        .ok()
                        .unwrap();
                assert!(Rc::ptr_eq(&a, &b));
            }
        });
        assert_eq!(used, 4); // Report + one face + two pairs, cold and warm.
    }
    assert_eq!(mock.calls.borrow().len(), 2);
    for polarity in [Polarity::Positive, Polarity::Negative] {
        let (error, used) = with_context(&subject, 2, |context| {
            assert!(context.brep_facts().is_ok());
            selected_cylindrical_band_pair(&endpoint(&band), &endpoint(&band), context)
                .err()
                .unwrap()
        });
        let ProofError::Budget(error) = error else {
            panic!("pair budget must stop before the predicate")
        };
        let result = refused(error, polarity);
        assert_eq!(result["diagnostics"][0]["code"], "MATCHER_TIMEOUT");
        assert_eq!(used, 3);
    }
    assert_eq!(mock.calls.borrow().len(), 4);
}

#[test]
fn missing_or_mismatched_selector_associations_have_no_fallback() {
    let band = raw_certificate();
    let mut missing = endpoint(&band);
    missing.facts.face_index = None;
    assert!(cylindrical_band_face(&missing).is_err());
    let mut mismatched = endpoint(&band);
    mismatched.occurrence = Some(0);
    assert!(cylindrical_band_face(&mismatched).is_err());
    let mut whole = endpoint(&band);
    whole.entity = BrepEntity::Whole;
    assert!(cylindrical_band_face(&whole).is_err());
    let (subject, mock) = control(band.clone(), Ok(band.clone()));
    let (error, used) = with_context(&subject, 2, |context| {
        assert!(context.brep_facts().is_ok());
        context
            .nominal_cylindrical_band(address(&band), 1)
            .err()
            .unwrap()
    });
    refused(error, Polarity::Negative);
    assert_eq!(used, 2);
    assert!(mock.calls.borrow().is_empty());
}

#[test]
fn backend_association_failures_and_unsupported_are_noninvertible() {
    let band = raw_certificate();
    for polarity in [Polarity::Positive, Polarity::Negative] {
        for field in 0..9 {
            let mut wrong = band.clone();
            match field {
                0 => wrong.occurrence += 1,
                1 => wrong.public_face_ordinal += 1,
                2 => wrong.private_query_face += 1,
                3 => wrong.transferred_reversed = !wrong.transferred_reversed,
                4 => wrong.source_face_entity = 0,
                5 => wrong.source_route_count = 33,
                6 => wrong.source_route_count = 0,
                7 => wrong.source_route[0] = 0,
                _ => wrong.source_route[1] = 99,
            }
            let (subject, mock) = control(band.clone(), Ok(wrong));
            let (error, used) = with_context(&subject, 2, |context| {
                assert!(context.brep_facts().is_ok());
                context
                    .nominal_cylindrical_band(address(&band), 0)
                    .err()
                    .unwrap()
            });
            refused(error, polarity);
            assert_eq!(used, 2);
            assert_eq!(mock.calls.borrow().len(), 1);
        }
        let (subject, _) = control(
            band.clone(),
            Err(BackendError {
                kind: BackendErrorKind::Unsupported,
                message: "C1 attachment is unqualified".into(),
            }),
        );
        let (error, _) = with_context(&subject, 2, |context| {
            assert!(context.brep_facts().is_ok());
            context
                .nominal_cylindrical_band(address(&band), 0)
                .err()
                .unwrap()
        });
        refused(error, polarity);
    }
}

#[test]
fn clearance_capacity_counts_record_allocation_and_pointer_buffer() {
    let band = raw_certificate();
    let (subject, _) = control(band.clone(), Ok(band.clone()));
    with_context(&subject, 2, |context| {
        assert!(context.brep_facts().is_ok());
        assert!(context
            .check_cylindrical_band_capacity(&[256 * 1024])
            .is_err());
        let empty = std::mem::size_of::<Vec<Rc<NominalCylindricalBand>>>() as u64;
        assert!(context
            .check_cylindrical_band_capacity(&[256 * 1024 - empty])
            .is_ok());
        let value = context
            .nominal_cylindrical_band(address(&band), 0)
            .ok()
            .unwrap();
        let one = empty
            + (std::mem::size_of_val(&*value)
                + 2 * std::mem::size_of::<usize>()
                + std::mem::size_of_val(&value)) as u64;
        assert!(context
            .check_cylindrical_band_capacity(&[256 * 1024 - one + 1])
            .is_err());
    });
}

#[test]
fn exported_pre_call_reservation_counts_prior_live_and_checks_overflow() {
    let band = raw_certificate();
    let (subject, mock) = control(band.clone(), Ok(band.clone()));
    with_context(&subject, 2, |context| {
        assert!(context.brep_facts().is_ok());
        assert!(context.nominal_cylindrical_band(address(&band), 0).is_ok());
        let reservation = continuous::CYLINDRICAL_BAND_PREDICATE_RESERVATION_BYTES as u64;
        assert!(context
            .set_cylindrical_band_output_bytes(256 * 1024 - reservation)
            .is_ok());
        // Borrowed arguments do not erase their caller-owned allocation.
        assert!(context
            .check_cylindrical_band_capacity(&[reservation])
            .is_err());
        assert!(context
            .check_cylindrical_band_capacity(&[u64::MAX, 1])
            .is_err());
        assert!(context.set_cylindrical_band_output_bytes(0).is_ok());
        assert!(context
            .check_cylindrical_band_capacity(&[reservation])
            .is_ok());
    });
    assert_eq!(mock.calls.borrow().len(), 1);
    let (_, used) = with_context(&subject, 2, |context| {
        assert!(context.brep_facts().is_ok());
        let header = std::mem::size_of::<Vec<Rc<NominalCylindricalBand>>>() as u64;
        assert!(context
            .set_cylindrical_band_output_bytes(256 * 1024 - header)
            .is_ok());
        assert!(context.nominal_cylindrical_band(address(&band), 0).is_err());
    });
    assert_eq!(used, 2);
    assert_eq!(mock.calls.borrow().len(), 1); // Capacity refusal preceded C1.
}

#[test]
fn face_route_preserves_raw_certificate_and_cold_warm_public_result() {
    let band = cartesian_certificate();
    let (subject, mock) = control(band.clone(), Ok(band.clone()));
    let prepared = prepared(&band, 0.0, 1);
    let cold = run(&prepared, &subject, 3, Polarity::Positive);
    let warm = run(&prepared, &subject, 3, Polarity::Positive);
    assert_eq!(cold, warm);
    assert_eq!(cold.0["status"], "passed");
    assert_eq!(cold.1, 3);
    assert_eq!(
        mock.calls.borrow().as_slice(),
        &[address(&band), address(&band)]
    );
    let row = &cold.0["evidence"]["witnesses"]["relationships"][0];
    assert_eq!(
        row["final"]["method"],
        "exact-nominal-cylindrical-band-clearance"
    );
    assert_eq!(
        row["subject"]["entities"][0]["id"],
        "interface:shaft.journal"
    );
    assert_eq!(row["subject"]["entities"][0]["occurrencePath"], "shaft");
    let evidence = &row["final"]["witnesses"][0]["value"];
    let mut expected = serde_json::to_value(&band).unwrap();
    // C1's fixed transfer padding is not a route label. Public projection
    // preserves the active ordered route, whose length carries its count.
    expected.as_object_mut().unwrap().remove("sourceRouteCount");
    expected["sourceRoute"] =
        serde_json::json!(&band.source_route[..band.source_route_count as usize]);
    assert_exact_json_numbers(&evidence["subject"], &expected);
    assert_exact_json_numbers(&evidence["target"], &expected);
    assert_eq!(
        evidence["diagnosticPointRole"],
        "source-origin-not-intersection-witness"
    );
    assert_eq!(
        evidence["endpointConvention"],
        "closed-lateral-band-including-rim-circles-no-cap-disks"
    );
}

#[test]
fn both_polarities_keep_origin_diagnostic_not_a_geometric_point_witness() {
    let band = cartesian_certificate();
    let (subject, _) = control(band.clone(), Ok(band.clone()));
    for (minimum, polarity, status) in [
        (0.0, Polarity::Positive, "passed"),
        (0.0, Polarity::Negative, "failed"),
        (1.0, Polarity::Positive, "failed"),
        (1.0, Polarity::Negative, "passed"),
    ] {
        // Identity clearance is a transport/core control, not a C2/C3 oracle.
        let (result, used) = run(&prepared(&band, minimum, 1), &subject, 3, polarity);
        assert_eq!(result["status"], status, "{result}");
        assert_eq!(used, 3);
        if minimum == 1.0 && polarity == Polarity::Positive {
            assert_eq!(
                result["diagnostics"][0]["spatial"]["role"],
                "diagnostic-source-origin"
            );
            assert_exact_json_numbers(
                &result["diagnostics"][0]["spatial"]["center"],
                &serde_json::json!(band.origin),
            );
        }
        let witnesses = result["evidence"]["witnesses"]["relationships"][0]["final"]["witnesses"]
            .as_array()
            .unwrap();
        assert!(witnesses.iter().all(|value| value["kind"] != "point"));
    }
}

#[test]
fn routed_budget_nonfinite_and_backend_refusals_never_invert() {
    let band = raw_certificate();
    for polarity in [Polarity::Positive, Polarity::Negative] {
        for (limit, expected_calls, used) in [(0, 0, 1), (1, 0, 2), (2, 1, 3)] {
            let (subject, mock) = control(band.clone(), Ok(band.clone()));
            let (result, actual_used) = run(&prepared(&band, 0.0, 1), &subject, limit, polarity);
            assert_eq!(result["status"], "refused");
            assert_eq!(result["diagnostics"][0]["code"], "MATCHER_TIMEOUT");
            assert_eq!(actual_used, used);
            assert_eq!(mock.calls.borrow().len(), expected_calls);
        }
        let mut invalid = band.clone();
        invalid.radius = f64::NAN;
        let (subject, _) = control(band.clone(), Ok(invalid));
        let (result, used) = run(&prepared(&band, 0.0, 1), &subject, 3, polarity);
        assert_eq!(result["status"], "refused");
        assert_eq!(used, 3);
        assert_eq!(
            result["diagnostics"][0]["details"]["subject"]["entities"][0]["id"],
            "interface:shaft.journal"
        );
    }
}

#[test]
fn repeated_relationships_reuse_faces_but_charge_pairs_and_retain_prior_rows() {
    let band = cartesian_certificate();
    let (subject, mock) = control(band.clone(), Ok(band.clone()));
    let (result, used) = run(&prepared(&band, 0.0, 2), &subject, 4, Polarity::Positive);
    assert_eq!(result["status"], "passed", "{result}");
    assert_eq!(
        result["evidence"]["witnesses"]["relationships"]
            .as_array()
            .unwrap()
            .len(),
        2
    );
    assert_eq!(used, 4);
    assert_eq!(mock.calls.borrow().len(), 1);
}

#[test]
fn encoding_preflight_covers_escaping_sort_pointers_and_growing_output() {
    let value = Json::object([
        ("quoted\"key", Json::string("\u{0001}\n\\\"日")),
        (
            "numbers",
            Json::Array(vec![
                Json::Number(f64::MAX),
                Json::Number(f64::MIN_POSITIVE),
                Json::Number(-0.0),
            ]),
        ),
    ]);
    let [payload, sort] = clearance_encoding_bound(&value);
    let encoded = encode(&value).unwrap();
    assert!(encoded.len() as u64 <= payload);
    assert!(encoded.capacity() as u64 <= 2 * payload);
    assert_eq!(sort, 2 * std::mem::size_of::<&(String, Json)>() as u64);
}

#[test]
fn tilted_self_target_remains_explicitly_unsupported_in_both_polarities() {
    let band = raw_certificate();
    let (subject, mock) = control(band.clone(), Ok(band.clone()));
    for polarity in [Polarity::Positive, Polarity::Negative] {
        let (result, used) = run(&prepared(&band, 0.0, 1), &subject, 3, polarity);
        assert_eq!(result["status"], "refused");
        assert_eq!(
            result["diagnostics"][0]["message"],
            "Band intersection requires an exact Cartesian target axis."
        );
        assert_eq!(used, 3);
    }
    assert_eq!(mock.calls.borrow().len(), 2);
}

#[test]
fn original_two_face_intent_routes_exact_addresses_and_preserves_both_certificates() {
    let a = raw_certificate();
    let b = target_certificate();
    let mock = Control {
        reported: a.clone(),
        additional: Some(b.clone()),
        answer: Ok(a.clone()),
        calls: Rc::new(RefCell::new(vec![])),
    };
    let subject = subject_with(&mock);
    let mut claim = prepared(&a, 0.02, 1);
    let (source_selection, mut target_selection) = claim.relationships[0].resolved.take().unwrap();
    let target = &mut target_selection.entities[0];
    target.id = "interface:housing.bore".into();
    target.occurrence_path = Some("housing".into());
    target.occurrence = Some(b.occurrence);
    target.face = Some(address(&b));
    target.facts = endpoint(&b).facts;
    // Exact unchanged original aabb-gap-false-positive relationship intent.
    let mut relationship = parse_relationship(
        &Json::object([
            ("kind", Json::string("clearance")),
            ("subject", Json::string("shaft.journal")),
            ("target", Json::string("housing.bore")),
            ("min", Json::Number(0.02)),
            ("max", Json::Number(0.06)),
            ("tolerance", Json::Number(0.001)),
        ]),
        0,
    )
    .unwrap();
    relationship.resolved = Some((source_selection, target_selection));
    relationship.resolved_bores = Some((vec![None], vec![None]));
    claim.relationships[0] = relationship;
    for (polarity, status) in [
        (Polarity::Positive, "failed"),
        (Polarity::Negative, "passed"),
    ] {
        let (result, used) = run(&claim, &subject, 4, polarity);
        assert_eq!(result["status"], status, "{result}");
        assert_eq!(used, 4);
        let row = &result["evidence"]["witnesses"]["relationships"][0];
        assert_eq!(row["target"]["entities"][0]["id"], "interface:housing.bore");
        for (key, band) in [("subject", &a), ("target", &b)] {
            let mut expected = serde_json::to_value(band).unwrap();
            expected.as_object_mut().unwrap().remove("sourceRouteCount");
            expected["sourceRoute"] =
                serde_json::json!(&band.source_route[..band.source_route_count as usize]);
            assert_exact_json_numbers(&row["final"]["witnesses"][0]["value"][key], &expected);
        }
    }
    assert_eq!(
        mock.calls.borrow().as_slice(),
        &[address(&a), address(&b), address(&a), address(&b)]
    );
    for (limit, calls, used) in [(2, 1, 3), (3, 2, 4)] {
        mock.calls.borrow_mut().clear();
        let (result, actual_used) = run(&claim, &subject, limit, Polarity::Negative);
        assert_eq!(result["status"], "refused");
        assert_eq!(actual_used, used);
        assert_eq!(mock.calls.borrow().len(), calls);
    }
}
