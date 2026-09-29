use std::{cell::Cell, rc::Rc};

use super::*;
use crate::backend::{
    brep::{
        BrepEntity, CircularBoreCandidate, CircularBoreEnd, CircularBoreTopology,
        CylinderAxialExtent, FaceFacts, LocatedFace, OccurrenceFacts, PointState, ShapeFacts,
        TessellationProfile, ValidityCheck,
    },
    TriangleMesh,
};
use crate::{
    budget::Budget,
    result::Evaluation,
    subject::{EvaluationContext, Subject, SubjectFormat},
};

fn bounds(min: [f64; 3], max: [f64; 3]) -> Bounds {
    Bounds { min, max }
}

fn face(
    index: u32,
    surface: SurfaceFacts,
    center: [f64; 3],
    bounds: Bounds,
    reversed: bool,
) -> LocatedFace {
    LocatedFace {
        entity: BrepEntity::WholeFace(index),
        facts: FaceFacts {
            index: index - 1,
            area: 20.0,
            center_of_mass: center,
            surface,
        },
        bounds,
        reversed,
    }
}

fn occurrence(index: u32, path: &str) -> OccurrenceFacts {
    OccurrenceFacts {
        name: path.into(),
        placement: [1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0],
        bounds: bounds([-10.0, -10.0, 0.0], [10.0, 10.0, 10.0]),
        path: path.into(),
        parent: None,
        product: 0,
        product_name: "bracket".into(),
        instance_name: Some(path.into()),
        ordinal_path: vec![index + 1],
        face_count: 1,
    }
}

/// The retained fixture's occurrences and whole-shape facts, which its report
/// facets serve (a millimetre source without rows).
#[derive(Clone)]
struct RetainedFacts {
    occurrences: Vec<OccurrenceFacts>,
    shape: ShapeFacts,
}

fn retained_facts() -> RetainedFacts {
    RetainedFacts {
        occurrences: vec![occurrence(0, "left"), occurrence(1, "right")],
        shape: ShapeFacts {
            bounds: bounds([-10.0, -10.0, 0.0], [10.0, 10.0, 10.0]),
            volume: 1_000.0,
            surface_area: 1_200.0,
            center_of_mass: [0.0, 0.0, 5.0],
            topology: TopologyCounts {
                compounds: 1,
                solids: 1,
                shells: 1,
                faces: 7,
                wires: 7,
                edges: 28,
                vertices: 16,
            },
        },
    }
}

fn retained_faces() -> Vec<LocatedFace> {
    let mut faces = vec![
        face(
            1,
            SurfaceFacts::Plane {
                origin: [0.0, 0.0, 10.0],
                normal: [0.0, 0.0, 1.0],
            },
            [0.0, 0.0, 10.0],
            bounds([-10.0, -10.0, 10.0], [10.0, 10.0, 10.0]),
            false,
        ),
        face(
            2,
            SurfaceFacts::Plane {
                origin: [9.0, 0.0, 9.0],
                normal: [
                    std::f64::consts::FRAC_1_SQRT_2,
                    0.0,
                    std::f64::consts::FRAC_1_SQRT_2,
                ],
            },
            [9.0, 0.0, 9.0],
            bounds([8.0, -10.0, 8.0], [10.0, 10.0, 10.0]),
            false,
        ),
        face(
            3,
            SurfaceFacts::Cylinder {
                origin: [0.0, 0.0, 0.0],
                axis: [0.0, 0.0, 1.0],
                radius: 0.5,
            },
            [0.0, 0.0, 5.0],
            bounds([-0.5, -0.5, 0.0], [0.5, 0.5, 10.0]),
            false,
        ),
    ];
    for (index, center) in [
        [5.0, 0.0, 5.0],
        [0.0, 5.0, 5.0],
        [-5.0, 0.0, 5.0],
        [0.0, -5.0, 5.0],
    ]
    .into_iter()
    .enumerate()
    {
        faces.push(face(
            index as u32 + 4,
            SurfaceFacts::Cylinder {
                origin: [center[0], center[1], 0.0],
                axis: [0.0, 0.0, 1.0],
                radius: 1.0,
            },
            center,
            bounds(
                [center[0] - 1.0, center[1] - 1.0, 0.0],
                [center[0] + 1.0, center[1] + 1.0, 10.0],
            ),
            true,
        ));
    }
    faces
}

struct RetainedBrep {
    facts: Rc<RetainedFacts>,
    faces: Rc<[LocatedFace]>,
    validity: Rc<ValidityFacts>,
    bore_queries: Rc<Cell<usize>>,
    report_calls: Rc<Cell<usize>>,
    fail_report: bool,
}

impl RetainedBrep {
    /// One report facet demand: counted, and refused under `fail_report`.
    fn report(&self) -> Result<(), BackendError> {
        self.report_calls.set(self.report_calls.get() + 1);
        if self.fail_report {
            return Err(BackendError {
                kind: BackendErrorKind::Unsupported,
                message: "deliberate report failure".into(),
            });
        }
        Ok(())
    }

    fn complete() -> Self {
        Self {
            facts: Rc::new(retained_facts()),
            faces: Rc::from(retained_faces()),
            bore_queries: Rc::new(Cell::new(0)),
            report_calls: Rc::new(Cell::new(0)),
            fail_report: false,
            validity: Rc::new(ValidityFacts {
                valid: true,
                checks: Some(vec![ValidityCheck {
                    shape: "whole".into(),
                    status: "valid".into(),
                }]),
                max_tolerance: Some(0.001),
                free_bounds: Some(0),
                small_edges: Some(Vec::new()),
                same_parameter: Some(true),
                closed_shells: Some(true),
                closed_solids: Some(true),
                solid_count: Some(1),
                invalid_solid_count: Some(0),
                open_edge_count: Some(0),
                nonmanifold_edge_count: None,
                closed_wires: Some(true),
                reason: None,
            }),
        }
    }
}

fn unused() -> BackendError {
    BackendError {
        kind: BackendErrorKind::Unsupported,
        message: "unused test operation".into(),
    }
}

impl BrepSubject for RetainedBrep {
    fn source_occurrences(&self) -> Result<Rc<[OccurrenceFacts]>, BackendError> {
        Ok(self.facts.occurrences.clone().into())
    }

    fn edge_treatment_counts(
        &self,
    ) -> Result<crate::backend::brep::EdgeTreatmentCounts, BackendError> {
        Ok(crate::backend::brep::EdgeTreatmentCounts {
            public_face_count: 0,
            candidate_edge_use_count: 0,
        })
    }

    fn edge_treatments(
        &self,
        _: usize,
    ) -> Result<crate::backend::brep::EdgeTreatmentInventory, BackendError> {
        Ok(crate::backend::brep::EdgeTreatmentInventory {
            counts: crate::backend::brep::EdgeTreatmentCounts {
                public_face_count: 0,
                candidate_edge_use_count: 0,
            },
            rows: Vec::new(),
        })
    }

    fn circular_bores(&self, max_candidates: usize) -> Result<CircularBoreInventory, BackendError> {
        self.bore_queries.set(self.bore_queries.get() + 1);
        // Opaque authored connector outcomes for core contract tests only.
        // These synthetic faces do not constitute a kernel topology proof.
        let candidates: Vec<_> = self
            .faces
            .iter()
            .filter_map(|face| {
                if matches!(face.facts.surface, SurfaceFacts::Plane { .. }) {
                    return None;
                }
                let disposition = match face.facts.surface {
                    SurfaceFacts::Cylinder {
                        origin,
                        axis,
                        radius,
                    } if face.reversed => {
                        CircularBoreDisposition::Qualified(CircularBoreTopology {
                            owning_solid_ordinal: 0,
                            band: CylinderAxialExtent {
                                origin,
                                axis,
                                radius,
                                from: 0.0,
                                to: 10.0,
                            },
                            ends: [
                                CircularBoreEnd {
                                    owning_solid_edge_ordinal: 1,
                                    adjacent_public_face_ordinal: 0,
                                    termination: CircularBoreTermination::Mouth,
                                },
                                CircularBoreEnd {
                                    owning_solid_edge_ordinal: 2,
                                    adjacent_public_face_ordinal: 1,
                                    termination: CircularBoreTermination::Mouth,
                                },
                            ],
                            maximum_topology_tolerance_mm: 0.001,
                            interior_residual_solid_count: 0,
                        })
                    }
                    SurfaceFacts::Cylinder { .. } => {
                        CircularBoreDisposition::NonMember(CircularBoreNonMember::ExteriorCylinder)
                    }
                    _ => CircularBoreDisposition::Unqualified(
                        CircularBoreUnqualified::UnsupportedSurface,
                    ),
                };
                let BrepEntity::WholeFace(private_query_face) = face.entity else {
                    unreachable!()
                };
                Some(CircularBoreCandidate {
                    public_face_ordinal: face.facts.index,
                    private_query_face,
                    disposition,
                })
            })
            .collect();
        assert!(candidates.len() <= max_candidates);
        Ok(CircularBoreInventory { candidates })
    }

    fn reported_faces(&self, _: bool) -> Result<crate::backend::brep::ReportedFaces, BackendError> {
        self.report()?;
        Ok(crate::backend::brep::ReportedFaces {
            whole_faces: Rc::clone(&self.faces),
            occurrence_faces: (0..self.facts.occurrences.len())
                .map(|_| Rc::from(Vec::<LocatedFace>::new()))
                .collect(),
        })
    }

    fn reported_shape(&self) -> Result<ShapeFacts, BackendError> {
        self.report()?;
        Ok(self.facts.shape.clone())
    }

    // Its empty mesh is unused by these fact-only predicate/early-selection
    // controls.
    fn reported_mesh(&self) -> Result<TriangleMesh, BackendError> {
        self.report()?;
        Ok(TriangleMesh {
            positions: Vec::new(),
            triangles: Vec::new(),
        })
    }

    fn document_rows(&self) -> Result<crate::backend::brep::DocumentRows, BackendError> {
        self.report()?;
        Ok(crate::backend::brep::DocumentRows::default())
    }

    fn faces(&self) -> Result<Rc<[LocatedFace]>, BackendError> {
        Ok(self.faces.clone())
    }
    fn validity(&self) -> Result<Rc<ValidityFacts>, BackendError> {
        Ok(self.validity.clone())
    }
    fn classify_face_points(
        &self,
        _: BrepEntity,
        _: &[[f64; 3]],
        _: f64,
    ) -> Result<Vec<PointState>, BackendError> {
        Err(unused())
    }
    fn tessellate(
        &self,
        _: BrepEntity,
        _: TessellationProfile,
    ) -> Result<Rc<TriangleMesh>, BackendError> {
        Err(unused())
    }
}

fn retained_subject() -> Subject {
    // The pure typed test double has an explicit test profile/primary identity;
    // no STEP parser or native geometry qualification is claimed here.
    let identity = crate::identity::SubjectIdentity::step(
        b"typed-report-unit-control",
        "millimetre",
        1.0,
        crate::backend::brep::BrepIdentityProfile {
            ingest_profile: "typed-report-unit-v1",
            backend_profile: "typed-brep-unit-v1",
        },
        None,
    )
    .unwrap();
    let mut subject = Subject::new(
        identity.primary_hash().into(),
        SubjectFormat::Step,
        "mm".into(),
    );
    subject.step_admission_facts = Some(crate::backend::brep::BrepAdmissionFacts {
        source_length_unit: "millimetre".into(),
        source_unit_to_millimeters: 1.0,
        occurrence_count: 0,
        surfaceless_faces: 0,
        all_source_length_contexts_mm: true,
    });
    subject.semantic_identity.set(identity).unwrap();
    subject
}

#[test]
fn admitted_units_do_not_demand_a_failing_report() {
    let mut subject = retained_subject();
    let mut connector = RetainedBrep::complete();
    connector.fail_report = true;
    let calls = Rc::clone(&connector.report_calls);
    subject.brep = Some(Box::new(connector));
    let subjects = [Rc::new(subject)];

    for (expected, positive) in [("mm", true), ("cm", false)] {
        let prepared = Prepared::StepUnits(expected.into());
        let normalized = prepared.normalized_payload();
        let budget = Budget::new(1);
        let mut context = EvaluationContext::new(
            &subjects,
            Capability::ToHaveStepUnits,
            "units",
            &normalized,
            &budget,
            None,
        );
        let Evaluation::Geometric {
            positive_satisfied, ..
        } = evaluate(&prepared, &mut context)
        else {
            panic!("admitted units should produce a geometric verdict")
        };
        assert_eq!(positive_satisfied, positive);
        assert_eq!(budget.used(), 1);
        assert_eq!(calls.get(), 0);
    }
    let prepared = Prepared::StepUnits("mm".into());
    let normalized = prepared.normalized_payload();
    let budget = Budget::new(0);
    let mut context = EvaluationContext::new(
        &subjects,
        Capability::ToHaveStepUnits,
        "units-budget",
        &normalized,
        &budget,
        None,
    );
    assert!(matches!(
        evaluate(&prepared, &mut context),
        Evaluation::Refused { .. }
    ));
    assert_eq!(calls.get(), 0);
    assert_eq!(
        subjects[0].report_faces(false).unwrap_err().message,
        "deliberate report failure"
    );
    assert_eq!(calls.get(), 1);
}

#[test]
fn source_structure_claims_reuse_one_projection_without_building_a_failing_report() {
    let mut subject = retained_subject();
    let mut connector = RetainedBrep::complete();
    connector.fail_report = true;
    let calls = Rc::clone(&connector.report_calls);
    subject.brep = Some(Box::new(connector));
    let subjects = [Rc::new(subject)];
    let products = Prepared::ProductStructure(ProductStructure {
        names: vec!["left".into(), "right".into()],
        count: Some(NumericExpectation::Equal(2.0)),
    });
    let assembly = Prepared::AssemblyOccurrences(AssemblyOccurrences {
        occurrences: vec![OccurrenceRule {
            name: TextPattern::Exact("left".into()),
            count: Some(NumericExpectation::Equal(1.0)),
            bounds: None,
        }],
        unique_names: true,
        regex_unsupported: None,
    });
    for prepared in [&products, &assembly, &products] {
        let normalized = prepared.normalized_payload();
        let budget = Budget::new(1);
        let mut context = EvaluationContext::new(
            &subjects,
            prepared.capability(),
            "source-structure",
            &normalized,
            &budget,
            None,
        );
        assert!(matches!(
            evaluate(prepared, &mut context),
            Evaluation::Geometric {
                positive_satisfied: true,
                ..
            }
        ));
        assert_eq!(budget.used(), 1);
        assert_eq!(calls.get(), 0);
    }
    let normalized = products.normalized_payload();
    let budget = Budget::new(0);
    let mut context = EvaluationContext::new(
        &subjects,
        products.capability(),
        "source-structure",
        &normalized,
        &budget,
        None,
    );
    assert!(matches!(
        evaluate(&products, &mut context),
        Evaluation::Refused { .. }
    ));
    assert_eq!(calls.get(), 0);
}

fn payload(capability: Capability, expected: Json) -> Json {
    Json::object([
        ("kind", Json::string(capability.kind().unwrap())),
        ("expected", expected),
    ])
}

fn prepared(capability: Capability, expected: Json) -> Prepared {
    prepare(capability, &payload(capability, expected)).unwrap()
}

fn object_field<'a>(value: &'a Json, key: &str) -> Option<&'a Json> {
    match value {
        Json::Object(fields) => fields
            .iter()
            .find_map(|(name, value)| (name == key).then_some(value)),
        _ => None,
    }
}

fn array_values(value: &Json) -> &[Json] {
    match value {
        Json::Array(values) => values,
        _ => panic!("expected an array"),
    }
}

fn valid_expectations() -> [(Capability, Json); 11] {
    [
        (
            Capability::ToHaveStepUnits,
            Json::object([("unit", Json::string("mm"))]),
        ),
        (
            Capability::ToHaveProductStructure,
            Json::object([
                (
                    "names",
                    Json::Array(vec![Json::string("left"), Json::string("right")]),
                ),
                ("count", Json::Number(2.0)),
            ]),
        ),
        (
            Capability::ToHaveAssemblyOccurrences,
            Json::object([(
                "occurrences",
                Json::Array(vec![Json::object([("name", Json::string("left"))])]),
            )]),
        ),
        (Capability::ToBeValidBrep, Json::Object(Vec::new())),
        (
            Capability::ToHaveTopologyCounts,
            Json::object([("faces", Json::Number(7.0))]),
        ),
        (
            Capability::ToHavePlanarFace,
            Json::object([
                (
                    "normal",
                    Json::Array(vec![
                        Json::Number(0.0),
                        Json::Number(0.0),
                        Json::Number(1.0),
                    ]),
                ),
                ("offset", Json::Number(10.0)),
            ]),
        ),
        (
            Capability::ToHaveCylindricalFace,
            Json::object([("radius", Json::Number(1.0)), ("axis", Json::string("z"))]),
        ),
        (
            Capability::ToHaveCircularHole,
            Json::object([("diameter", Json::Number(2.0))]),
        ),
        (
            Capability::ToHaveCircularHolePattern,
            Json::object([
                ("count", Json::Number(4.0)),
                ("holeDiameter", Json::Number(2.0)),
            ]),
        ),
        (
            Capability::ToHaveChamferFeature,
            Json::object([("distance", Json::Number(2.0))]),
        ),
        (
            Capability::ToHaveFilletFeature,
            Json::object([("radius", Json::Number(0.5))]),
        ),
    ]
}

#[test]
fn prepares_and_normalizes_all_eleven_matchers() {
    for (capability, expected) in valid_expectations() {
        let prepared = prepared(capability, expected);
        assert_eq!(prepared.capability(), capability);
        assert!(matches!(prepared.normalized_payload(), Json::Object(_)));
    }
}

#[test]
fn all_eleven_refuse_absent_brep_evidence_without_spending_work() {
    for (capability, expected) in valid_expectations() {
        let prepared = prepared(capability, expected);
        let normalized = prepared.normalized_payload();
        let subjects = [Rc::new(Subject::new(
            "missing-brep".into(),
            SubjectFormat::Step,
            "mm".into(),
        ))];
        let budget = Budget::new(1);
        let mut context =
            EvaluationContext::new(&subjects, capability, "missing", &normalized, &budget, None);
        match evaluate(&prepared, &mut context) {
            Evaluation::Refused { diagnostics } => {
                let facet = match capability {
                    Capability::ToBeValidBrep => Some("validity"),
                    Capability::ToHaveTopologyCounts => Some("topology-count"),
                    Capability::ToHavePlanarFace => Some("planar-face"),
                    Capability::ToHaveCylindricalFace => Some("cylindrical-face"),
                    Capability::ToHaveCircularHole => Some("circular-hole"),
                    Capability::ToHaveCircularHolePattern => Some("circular-hole-pattern"),
                    Capability::ToHaveChamferFeature => Some("chamfer-feature"),
                    Capability::ToHaveFilletFeature => Some("fillet-feature"),
                    _ => None,
                };
                let missing = facet.map_or_else(
                    || "exact BRep evidence".to_owned(),
                    |facet| format!("exact BRep {facet} evidence"),
                );
                assert_eq!(diagnostics.len(), 1);
                assert_eq!(diagnostics[0].code, "GEOSPEC_EVIDENCE_UNSUPPORTED");
                assert_eq!(
                    diagnostics[0].message,
                    format!(
                        "expectGeo(...).{}() needs {missing}, which this subject does not carry.",
                        capability.name()
                    )
                );
                assert_eq!(
                    diagnostics[0].details,
                    Some(Json::object([
                        ("matcher", Json::string(capability.name())),
                        ("missing", Json::string(&missing)),
                    ]))
                );
                assert_eq!(diagnostics[0].suggestion.as_deref(), Some(BREP_SUGGESTION));
            }
            _ => panic!("{} accepted absent BRep evidence", capability.name()),
        }
        drop(context);
        assert_eq!(budget.used(), 0);
    }
}

#[test]
fn rejects_malformed_expectations_for_all_eleven_matchers() {
    let rows = [
        (
            Capability::ToHaveStepUnits,
            Json::object([("unit", Json::string(""))]),
        ),
        (
            Capability::ToHaveProductStructure,
            Json::object([("names", Json::Number(1.0))]),
        ),
        (
            Capability::ToHaveAssemblyOccurrences,
            Json::Object(Vec::new()),
        ),
        (
            Capability::ToBeValidBrep,
            Json::object([("unknown", Json::Bool(true))]),
        ),
        (
            Capability::ToHaveTopologyCounts,
            Json::object([("tolerance", Json::Number(-1.0))]),
        ),
        (
            Capability::ToHavePlanarFace,
            Json::object([("normal", Json::Array(Vec::new()))]),
        ),
        (
            Capability::ToHaveCylindricalFace,
            Json::object([("radius", Json::Number(-1.0)), ("axis", Json::string("z"))]),
        ),
        (
            Capability::ToHaveCircularHole,
            Json::object([("diameter", Json::Number(-1.0))]),
        ),
        (
            Capability::ToHaveCircularHolePattern,
            Json::object([
                ("count", Json::Number(-1.0)),
                ("holeDiameter", Json::Number(2.0)),
            ]),
        ),
        (
            Capability::ToHaveChamferFeature,
            Json::object([("distance", Json::Number(-1.0))]),
        ),
        (
            Capability::ToHaveFilletFeature,
            Json::object([("radius", Json::Number(-1.0))]),
        ),
    ];
    for (capability, expected) in rows {
        assert!(
            prepare(capability, &payload(capability, expected)).is_err(),
            "{} accepted malformed input",
            capability.name()
        );
    }
}

#[test]
fn retained_neutral_facts_drive_all_eleven_positive_predicates() {
    let brep = RetainedBrep::complete();
    let facts = Rc::clone(&brep.facts);

    assert!(unit_outcome("mm", "millimetre", 1.0).positive);
    assert!(
        evaluate_products(
            &ProductStructure {
                names: vec!["left".into(), "right".into()],
                count: Some(NumericExpectation::Equal(2.0))
            },
            &facts.occurrences,
        )
        .unwrap()
        .positive
    );
    assert!(
        evaluate_occurrences(
            &AssemblyOccurrences {
                occurrences: vec![OccurrenceRule {
                    name: TextPattern::Exact("left".into()),
                    count: Some(NumericExpectation::Equal(1.0)),
                    bounds: None
                }],
                unique_names: true,
                regex_unsupported: None,
            },
            &facts.occurrences,
            &SelectorRegex::default(),
        )
        .unwrap()
        .positive
    );
    assert!(
        evaluate_validity(
            &ValidBrep {
                max_tolerance: Some(0.01),
                free_bounds: Some(NumericExpectation::Equal(0.0)),
                min_edge_length: Some(0.01),
                same_parameter: Some(true),
                closed_shells: Some(true),
                closed_wires: Some(true),
            },
            &brep.validity().unwrap()
        )
        .unwrap()
        .positive
    );
    assert!(
        evaluate_topology(
            &TopologyExpectation {
                values: [
                    Some(NumericExpectation::Equal(16.0)),
                    Some(NumericExpectation::Equal(28.0)),
                    Some(NumericExpectation::Equal(7.0)),
                    Some(NumericExpectation::Equal(7.0)),
                    Some(NumericExpectation::Equal(1.0)),
                    Some(NumericExpectation::Equal(1.0)),
                    Some(NumericExpectation::Equal(1.0))
                ],
                tolerance: 0.0,
            },
            facts.shape.topology
        )
        .unwrap()
        .positive
    );

    let mut features = derive_features(&brep).unwrap();
    populate_bores(&mut features, &brep, &brep.circular_bores(4096).unwrap()).unwrap();
    assert!(
        expected_planar(&PlanarExpectation {
            normal: [Some(0.0), Some(0.0), Some(1.0)],
            offset: 10.0,
            area: None,
            tolerance: 0.02
        })(&features)
        .positive
    );
    assert!(
        expected_cylinder(&CylindricalExpectation {
            radius: 1.0,
            axis: Axis::Z,
            tolerance: 0.02
        })(&features)
        .positive
    );
    assert!(
        expected_hole(&HoleExpectation {
            diameter: 2.0,
            through: Some(true),
            axis: Some(Axis::Z),
            center: None,
            tolerance: 0.02
        })(&features)
        .positive
    );
    assert!(
        expected_pattern(&PatternExpectation {
            count: 4,
            hole_diameter: 2.0,
            bolt_circle_diameter: Some(10.0),
            axis: Some(Axis::Z),
            center: Some([Some(0.0), Some(0.0), Some(5.0)]),
            tolerance: 0.02
        })(&features)
        .positive
    );
    // Edge treatments no longer derive membership from face/AABB heuristics;
    // typed-inventory predicates are covered by edge_treatment_core.rs.
}

#[test]
fn evaluation_context_drives_all_eleven_matcher_families_with_one_brep_unit() {
    let retained = RetainedBrep::complete();
    let empty_edge_treatments = crate::backend::brep::EdgeTreatmentInventory {
        counts: crate::backend::brep::EdgeTreatmentCounts {
            public_face_count: 0,
            candidate_edge_use_count: 0,
        },
        rows: Vec::new(),
    };
    let source_evidence = brep_evidence(
        &retained,
        &retained.facts.shape,
        &retained.circular_bores(4096).unwrap(),
        &empty_edge_treatments,
    )
    .unwrap();
    let mut subject = retained_subject();
    subject.brep = Some(Box::new(retained));
    let subjects = [Rc::new(subject)];

    for (capability, expected) in valid_expectations().into_iter().filter(|(capability, _)| {
        !matches!(
            capability,
            Capability::ToHaveChamferFeature | Capability::ToHaveFilletFeature
        )
    }) {
        let prepared = prepared(capability, expected);
        let expected = prepared.expected_json();
        let normalized = prepared.normalized_payload();
        let expected_units = if matches!(
            capability,
            Capability::ToHaveCircularHole | Capability::ToHaveCircularHolePattern
        ) {
            7
        } else {
            1
        };
        let budget = Budget::new(expected_units);
        let mut context =
            EvaluationContext::new(&subjects, capability, "claim", &normalized, &budget, None);
        match evaluate(&prepared, &mut context) {
            Evaluation::Geometric {
                positive_satisfied,
                diagnostics,
                evidence,
                ..
            } => {
                assert!(
                    positive_satisfied,
                    "{} was not satisfied",
                    capability.name()
                );
                assert!(
                    diagnostics.is_empty(),
                    "{} emitted diagnostics",
                    capability.name()
                );
                assert_eq!(
                    object_field(&evidence, "profile"),
                    Some(&Json::string("geospec-original24-v1"))
                );
                assert_eq!(
                    object_field(&evidence, "subjectContentHash"),
                    Some(&Json::string(
                        "d9cf85d4ab748d2b7b168a487393e71bce21cdedb34a8402cbd9414c63b3ae69"
                    ))
                );
                assert_eq!(
                    object_field(&evidence, "normalizedExpected"),
                    Some(&expected)
                );
                assert!(object_field(&evidence, "expected").is_none());
                let measured = object_field(&evidence, "measured").unwrap();
                let witnesses = object_field(&evidence, "witnesses").unwrap();
                let measurement_contract = object_field(witnesses, "measurementContract");
                if matches!(
                    capability,
                    Capability::ToHavePlanarFace
                        | Capability::ToHaveCylindricalFace
                        | Capability::ToHaveCircularHole
                ) {
                    let contract = measurement_contract.unwrap();
                    assert_eq!(
                        object_field(contract, "profile"),
                        Some(&Json::string("geospec-feature-metric-nominal-v1"))
                    );
                    assert_eq!(
                        object_field(contract, "errorEnclosure"),
                        Some(&Json::Bool(false))
                    );
                    assert_eq!(
                        object_field(contract, "axisLabels").is_some(),
                        capability != Capability::ToHavePlanarFace
                    );
                } else {
                    assert!(measurement_contract.is_none());
                }
                match capability {
                    Capability::ToHaveStepUnits => {
                        assert_eq!(measured, &Json::string("mm"));
                        assert_eq!(
                            witnesses,
                            &Json::object([("sourceUnitToMillimeters", Json::Number(1.0),)])
                        );
                    }
                    Capability::ToHaveProductStructure => {
                        assert_eq!(
                            measured,
                            &Json::object([
                                (
                                    "names",
                                    Json::Array(vec![Json::string("left"), Json::string("right"),]),
                                ),
                                ("productCount", Json::Number(2.0)),
                            ])
                        );
                        assert_eq!(
                            witnesses,
                            &Json::object([
                                (
                                    "structure",
                                    Json::Array(vec![
                                        Json::object([
                                            ("name", Json::string("left")),
                                            ("path", Json::string("left")),
                                            (
                                                "transform",
                                                Json::Array(
                                                    [
                                                        1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0,
                                                        0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0
                                                    ]
                                                    .into_iter()
                                                    .map(Json::Number)
                                                    .collect()
                                                )
                                            )
                                        ]),
                                        Json::object([
                                            ("name", Json::string("right")),
                                            ("path", Json::string("right")),
                                            (
                                                "transform",
                                                Json::Array(
                                                    [
                                                        1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0,
                                                        0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0
                                                    ]
                                                    .into_iter()
                                                    .map(Json::Number)
                                                    .collect()
                                                )
                                            )
                                        ]),
                                    ]),
                                ),
                                ("missing", Json::Array(Vec::new())),
                            ])
                        );
                    }
                    Capability::ToHaveAssemblyOccurrences => {
                        assert_eq!(
                            measured,
                            &Json::object([("occurrenceCount", Json::Number(2.0))])
                        );
                        assert_eq!(
                            witnesses,
                            &Json::object([
                                (
                                    "inventory",
                                    Json::Array(vec![
                                        Json::object([
                                            ("name", Json::string("left")),
                                            (
                                                "bounds",
                                                bounds_json(bounds(
                                                    [-10.0, -10.0, 0.0],
                                                    [10.0, 10.0, 10.0],
                                                )),
                                            ),
                                        ]),
                                        Json::object([
                                            ("name", Json::string("right")),
                                            (
                                                "bounds",
                                                bounds_json(bounds(
                                                    [-10.0, -10.0, 0.0],
                                                    [10.0, 10.0, 10.0],
                                                )),
                                            ),
                                        ]),
                                    ]),
                                ),
                                ("failures", Json::Array(Vec::new())),
                            ])
                        );
                    }
                    Capability::ToBeValidBrep => {
                        assert_eq!(
                            measured,
                            object_field(&source_evidence, "validity").unwrap()
                        );
                        assert_eq!(
                            witnesses,
                            &Json::object([("failures", Json::Array(Vec::new()))])
                        );
                    }
                    Capability::ToHaveTopologyCounts => {
                        assert_eq!(
                            measured,
                            object_field(&source_evidence, "topologyCounts").unwrap()
                        );
                        assert_eq!(
                            witnesses,
                            &Json::object([("failures", Json::Array(Vec::new()))])
                        );
                    }
                    Capability::ToHavePlanarFace
                    | Capability::ToHaveCylindricalFace
                    | Capability::ToHaveCircularHole
                    | Capability::ToHaveCircularHolePattern => {
                        let (key, match_count) = match capability {
                            Capability::ToHavePlanarFace => ("planarFaces", 1),
                            Capability::ToHaveCylindricalFace => ("cylindricalFaces", 4),
                            Capability::ToHaveCircularHole => ("circularHoles", 4),
                            Capability::ToHaveCircularHolePattern => ("circularHolePatterns", 1),
                            _ => unreachable!(),
                        };
                        assert_eq!(
                            measured,
                            &Json::object([("matchCount", Json::Number(match_count as f64),)])
                        );
                        let inventory = object_field(witnesses, key).unwrap();
                        assert_eq!(inventory, object_field(&source_evidence, key).unwrap());
                        let matches = array_values(object_field(witnesses, "matches").unwrap());
                        assert_eq!(matches.len(), match_count);
                        assert!(matches
                            .iter()
                            .all(|matched| array_values(inventory).contains(matched)));
                        if capability == Capability::ToHavePlanarFace {
                            assert_eq!(
                                &array_values(inventory)[0],
                                &Json::object([
                                    ("normal", point_json([0.0, 0.0, 1.0])),
                                    ("offset", Json::Number(10.0)),
                                    ("area", Json::Number(20.0)),
                                    ("center", point_json([0.0, 0.0, 10.0])),
                                ])
                            );
                        }
                    }
                    _ => unreachable!(),
                }
            }
            _ => panic!("{} did not produce geometric evidence", capability.name()),
        }
        drop(context);
        assert_eq!(
            budget.used(),
            expected_units,
            "{} charged the wrong work",
            capability.name()
        );
    }
}

#[test]
fn mismatch_diagnostics_retain_source_details_and_inventory() {
    let facts = retained_facts();
    let units = unit_outcome("in", "millimetre", 1.0);
    assert_eq!(
        units.diagnostics[0].details,
        Some(Json::object([
            ("matcher", Json::string("toHaveStepUnits")),
            ("measured", Json::string("mm")),
            ("expected", Json::string("in")),
        ]))
    );

    let products = ProductStructure {
        names: vec!["missing".into()],
        count: Some(NumericExpectation::Equal(1.0)),
    };
    let outcome = evaluate_products(&products, &facts.occurrences).unwrap();
    assert_eq!(
        outcome.diagnostics[0].details,
        Some(Json::object([
            ("matcher", Json::string("toHaveProductStructure")),
            ("missing", Json::Array(vec![Json::string("missing")]),),
            ("productCount", Json::Number(2.0)),
            ("expected", products.to_json()),
        ]))
    );

    let brep = RetainedBrep::complete();
    let mut features = derive_features(&brep).unwrap();
    populate_bores(&mut features, &brep, &brep.circular_bores(4096).unwrap()).unwrap();
    let expected = PlanarExpectation {
        normal: [Some(0.0), Some(0.0), Some(1.0)],
        offset: 99.0,
        area: None,
        tolerance: 0.02,
    };
    let outcome = expected_planar(&expected)(&features);
    assert_eq!(outcome.diagnostics[0].code, "GEOSPEC_FEATURE_MISMATCH");
    assert_eq!(
        outcome.diagnostics[0].message,
        "No planar face matches normal [0, 0, 1] at offset 99 within 0.02 mm."
    );
    assert_eq!(
        outcome.diagnostics[0].suggestion.as_deref(),
        Some(
            "Check the declared normal/offset against the exported frame, or widen the tolerance."
        )
    );
    assert_eq!(
        outcome.diagnostics[0].details,
        Some(Json::object([
            ("matcher", Json::string("toHavePlanarFace")),
            ("expected", expected.to_json()),
            (
                "planarFaces",
                Json::Array(features.planar.iter().map(planar_json).collect()),
            ),
        ]))
    );
    assert!(outcome.diagnostics[0].spatial.is_none());
}

#[test]
fn analyze_brep_projects_all_available_source_evidence() {
    let mut subject = retained_subject();
    subject.brep = Some(Box::new(RetainedBrep::complete()));
    let subjects = [Rc::new(subject)];
    let normalized = Json::Null;
    let budget = Budget::new(8);
    let mut context = EvaluationContext::new(
        &subjects,
        Capability::AnalyzeBrep,
        "analysis",
        &normalized,
        &budget,
        None,
    );
    let (value, diagnostics) = match evaluate_brep(&mut context) {
        Evaluation::Ancillary {
            success: true,
            value,
            diagnostics,
        } => (value, diagnostics),
        _ => panic!("analyzeBrep did not return successful ancillary evidence"),
    };
    assert!(diagnostics.is_empty());
    assert_eq!(object_field(&value, "success"), Some(&Json::Bool(true)));
    let brep = object_field(&value, "brep").expect("brep projection");
    let keys = match brep {
        Json::Object(fields) => fields
            .iter()
            .map(|(key, _)| key.as_str())
            .collect::<Vec<_>>(),
        _ => panic!("brep projection is not an object"),
    };
    assert_eq!(
        keys,
        vec![
            "validity",
            "topologyCounts",
            "boundingBox",
            "massProperties",
            "planarFaces",
            "cylindricalFaces",
            "circularHoles",
            "circularHolePatterns",
            "circularBoreTopology",
            "edgeTreatmentTopology",
            "chamferFeatures",
            "filletFeatures",
        ]
    );
    assert_eq!(
        object_field(object_field(brep, "validity").unwrap(), "checks"),
        Some(&Json::Array(vec![Json::object([
            ("shape", Json::string("whole")),
            ("status", Json::string("valid")),
        ])]))
    );
    assert_eq!(
        object_field(object_field(brep, "boundingBox").unwrap(), "size"),
        Some(&point_json([20.0, 20.0, 10.0]))
    );
    assert_eq!(
        object_field(
            object_field(brep, "massProperties").unwrap(),
            "centerOfMass"
        ),
        Some(&point_json([0.0, 0.0, 5.0]))
    );
    for (key, count) in [
        ("planarFaces", 2),
        ("cylindricalFaces", 5),
        ("circularHoles", 4),
        ("circularHolePatterns", 1),
        ("chamferFeatures", 0),
        ("filletFeatures", 0),
    ] {
        assert_eq!(
            object_field(brep, key),
            object_field(brep, key)
                .filter(|value| { matches!(value, Json::Array(values) if values.len() == count) }),
            "{key} did not preserve its measured rows"
        );
    }
    assert!(object_field(brep, "minimumWallThickness").is_none());
    drop(context);
    assert_eq!(budget.used(), 8);
}

#[test]
fn analyze_brep_reports_the_source_unavailable_diagnostic() {
    let subjects = [Rc::new(Subject::new(
        "mesh-subject".into(),
        SubjectFormat::Glb,
        "mm".into(),
    ))];
    let normalized = Json::Null;
    let budget = Budget::new(1);
    let mut context = EvaluationContext::new(
        &subjects,
        Capability::AnalyzeBrep,
        "analysis",
        &normalized,
        &budget,
        None,
    );
    match evaluate_brep(&mut context) {
        Evaluation::Ancillary {
            success: false,
            value,
            diagnostics,
        } => {
            assert_eq!(value, Json::object([("success", Json::Bool(false))]));
            assert_eq!(diagnostics.len(), 1);
            assert_eq!(diagnostics[0].code, "GEOSPEC_BREP_EVIDENCE_UNAVAILABLE");
            assert_eq!(
                diagnostics[0].message,
                "The ingested subject carries no BRep evidence."
            );
            assert_eq!(
                diagnostics[0].suggestion.as_deref(),
                Some("Ingest STEP/AP242 evidence before requesting BRep analysis.")
            );
        }
        _ => panic!("missing BRep evidence did not return the source diagnostic"),
    }
    drop(context);
    assert_eq!(budget.used(), 0);
}

#[test]
fn retained_neutral_facts_drive_all_eleven_negative_predicates() {
    let brep = RetainedBrep::complete();
    let facts = Rc::clone(&brep.facts);
    assert!(!unit_outcome("in", "millimetre", 1.0).positive);
    assert!(
        !evaluate_products(
            &ProductStructure {
                names: vec!["missing".into()],
                count: None,
            },
            &facts.occurrences,
        )
        .unwrap()
        .positive
    );
    assert!(
        !evaluate_occurrences(
            &AssemblyOccurrences {
                occurrences: vec![OccurrenceRule {
                    name: TextPattern::Exact("missing".into()),
                    count: None,
                    bounds: None,
                }],
                unique_names: false,
                regex_unsupported: None,
            },
            &facts.occurrences,
            &SelectorRegex::default(),
        )
        .unwrap()
        .positive
    );
    let mut invalid = (*brep.validity).clone();
    invalid.valid = false;
    invalid.reason = Some("open shell".into());
    assert!(
        !evaluate_validity(
            &ValidBrep {
                max_tolerance: None,
                free_bounds: None,
                min_edge_length: None,
                same_parameter: None,
                closed_shells: None,
                closed_wires: None,
            },
            &invalid,
        )
        .unwrap()
        .positive
    );
    assert!(
        !evaluate_topology(
            &TopologyExpectation {
                values: std::array::from_fn(|index| {
                    (index == 3).then_some(NumericExpectation::Equal(8.0))
                }),
                tolerance: 0.0,
            },
            facts.shape.topology,
        )
        .unwrap()
        .positive
    );

    let mut features = derive_features(&brep).unwrap();
    populate_bores(&mut features, &brep, &brep.circular_bores(4096).unwrap()).unwrap();
    assert!(
        !expected_planar(&PlanarExpectation {
            normal: [Some(0.0), Some(0.0), Some(1.0)],
            offset: 99.0,
            area: None,
            tolerance: 0.02,
        })(&features)
        .positive
    );
    assert!(
        !expected_cylinder(&CylindricalExpectation {
            radius: 99.0,
            axis: Axis::Z,
            tolerance: 0.02,
        })(&features)
        .positive
    );
    assert!(
        !expected_hole(&HoleExpectation {
            diameter: 99.0,
            through: None,
            axis: None,
            center: None,
            tolerance: 0.02,
        })(&features)
        .positive
    );
    assert!(
        !expected_pattern(&PatternExpectation {
            count: 5,
            hole_diameter: 2.0,
            bolt_circle_diameter: None,
            axis: None,
            center: None,
            tolerance: 0.02,
        })(&features)
        .positive
    );
    // Edge-treatment mismatch semantics are exercised against typed
    // dispositions in edge_treatment_core.rs.
}

#[test]
fn numeric_matcher_boundaries_are_inclusive() {
    let brep = RetainedBrep::complete();
    let facts = Rc::clone(&brep.facts);
    let mut features = derive_features(&brep).unwrap();
    populate_bores(&mut features, &brep, &brep.circular_bores(4096).unwrap()).unwrap();
    assert!(
        evaluate_topology(
            &TopologyExpectation {
                values: std::array::from_fn(|index| {
                    (index == 3).then_some(NumericExpectation::Equal(8.0))
                }),
                tolerance: 1.0,
            },
            facts.shape.topology,
        )
        .unwrap()
        .positive
    );
    assert!(
        expected_planar(&PlanarExpectation {
            normal: [Some(0.0), Some(0.0), Some(1.0)],
            offset: 10.125,
            area: None,
            tolerance: 0.125,
        })(&features)
        .positive
    );
    assert!(
        expected_cylinder(&CylindricalExpectation {
            radius: 1.125,
            axis: Axis::Z,
            tolerance: 0.125,
        })(&features)
        .positive
    );
    assert!(
        expected_hole(&HoleExpectation {
            diameter: 2.125,
            through: Some(true),
            axis: Some(Axis::Z),
            center: None,
            tolerance: 0.125,
        })(&features)
        .positive
    );
    assert!(
        expected_pattern(&PatternExpectation {
            count: 4,
            hole_diameter: 2.125,
            bolt_circle_diameter: Some(10.125),
            axis: Some(Axis::Z),
            center: None,
            tolerance: 0.125,
        })(&features)
        .positive
    );
}

#[test]
fn negative_measured_empty_and_missing_validity_are_distinct() {
    let mut brep = RetainedBrep::complete();
    brep.faces = Rc::from(Vec::<LocatedFace>::new());
    let mut features = derive_features(&brep).unwrap();
    populate_bores(&mut features, &brep, &brep.circular_bores(4096).unwrap()).unwrap();
    let measured_empty = expected_hole(&HoleExpectation {
        diameter: 2.0,
        through: None,
        axis: None,
        center: None,
        tolerance: 0.02,
    })(&features);
    assert!(!measured_empty.positive);
    assert_eq!(
        measured_empty.diagnostics[0].code,
        "GEOSPEC_FEATURE_MISMATCH"
    );

    let missing = ValidityFacts {
        small_edges: None,
        ..(*brep.validity).clone()
    };
    let outcome = match evaluate_validity(
        &ValidBrep {
            max_tolerance: None,
            free_bounds: None,
            min_edge_length: Some(0.1),
            same_parameter: None,
            closed_shells: None,
            closed_wires: None,
        },
        &missing,
    ) {
        Ok(_) => panic!("missing small-edge evidence must not become a measured-empty result"),
        Err(error) => error,
    };
    assert_eq!(outcome.kind, BackendErrorKind::Unsupported);
}

#[test]
fn point_normalization_failure_details_use_the_canonical_expectation() {
    let brep = RetainedBrep::complete();
    let mut features = derive_features(&brep).unwrap();
    populate_bores(&mut features, &brep, &brep.circular_bores(4096).unwrap()).unwrap();
    for (capability, raw, point_key) in [
        (
            Capability::ToHavePlanarFace,
            r#"{"normal":[1,2,3],"offset":99}"#,
            "normal",
        ),
        (
            Capability::ToHaveCircularHole,
            r#"{"diameter":99,"center":[1,2,3]}"#,
            "center",
        ),
        (
            Capability::ToHaveCircularHolePattern,
            r#"{"count":99,"holeDiameter":99,"center":[1,2,3]}"#,
            "center",
        ),
    ] {
        let vector = crate::codec::decode(raw.as_bytes()).unwrap();
        let mut axis = vector.clone();
        let Json::Object(fields) = &mut axis else {
            unreachable!()
        };
        fields
            .iter_mut()
            .find(|(key, _)| key == point_key)
            .unwrap()
            .1 = Json::object([
            ("x", Json::Number(1.0)),
            ("y", Json::Number(2.0)),
            ("z", Json::Number(3.0)),
        ]);
        let mut results = Vec::new();
        for authored in [vector, axis] {
            let prepared = prepared(capability, authored);
            let normalized = prepared.normalized_payload();
            let outcome = match &prepared {
                Prepared::PlanarFace(value) => expected_planar(value)(&features),
                Prepared::CircularHole(value) => expected_hole(value)(&features),
                Prepared::CircularHolePattern(value) => expected_pattern(value)(&features),
                _ => unreachable!(),
            };
            assert_eq!(outcome.diagnostics.len(), 1);
            let details = outcome.diagnostics[0].details.as_ref().unwrap();
            let copied = object_field(details, "expected").unwrap();
            assert_eq!(
                object_field(copied, point_key),
                Some(&point_json([1.0, 2.0, 3.0]))
            );
            assert_eq!(Some(copied), object_field(&normalized, "expected"));
            results.push(crate::codec::encode(&outcome.diagnostics[0].to_json()).unwrap());
        }
        assert_eq!(
            results[0], results[1],
            "complete failing diagnostic {capability:?}"
        );
    }
}

#[test]
fn product_structure_preserves_path_and_row_major_placement_witness() {
    // XdeOccurrence.transform is 4x4 row-major; neutral placement is its first
    // three rows (OCCT gp_Trsf::Value row/column). No geometry is recomputed.
    let mut facts = retained_facts();
    facts.occurrences.truncate(1);
    facts.occurrences[0].placement = [0.0, -1.0, 0.0, 3.0, 1.0, 0.0, 0.0, -4.0, 0.0, 0.0, 1.0, 5.0];
    let result = evaluate_products(
        &ProductStructure {
            names: vec!["left".into()],
            count: Some(NumericExpectation::Equal(1.0)),
        },
        &facts.occurrences,
    )
    .unwrap();
    assert!(result.positive);
    assert_eq!(result.witnesses, crate::codec::decode(br#"{"structure":[{"name":"left","path":"left","transform":[0,-1,0,3,1,0,0,-4,0,0,1,5,0,0,0,1]}],"missing":[]}"#).unwrap());
}

#[test]
fn nominal_feature_metrics_preserve_authored_thresholds_without_enclosures() {
    let brep = RetainedBrep::complete();
    let mut features = derive_features(&brep).unwrap();
    populate_bores(&mut features, &brep, &brep.circular_bores(4096).unwrap()).unwrap();
    let next_radius = f64::from_bits(1.0_f64.to_bits() + 1);
    let mut cylinder = CylindricalExpectation {
        radius: next_radius,
        axis: Axis::Z,
        tolerance: 0.0,
    };
    let red = expected_cylinder(&cylinder)(&features);
    assert!(!red.positive);
    assert_eq!(red.diagnostics.len(), 1);
    assert_eq!(
        object_field(red.diagnostics[0].details.as_ref().unwrap(), "expected"),
        Some(&cylinder.to_json())
    );
    let contract = object_field(&red.witnesses, "measurementContract").unwrap();
    assert_eq!(
        object_field(contract, "zeroTolerance"),
        Some(&Json::string("nominal-equality"))
    );
    assert_eq!(
        object_field(contract, "errorEnclosure"),
        Some(&Json::Bool(false))
    );
    cylinder.tolerance = next_radius - 1.0;
    assert!(expected_cylinder(&cylinder)(&features).positive);
    cylinder.radius = 1.0;
    cylinder.tolerance = 0.0;
    assert!(expected_cylinder(&cylinder)(&features).positive);

    let mut planar = PlanarExpectation {
        normal: [Some(0.0), Some(0.0), Some(1.0)],
        offset: 10.0,
        area: Some(NumericExpectation::Conditions {
            value: None,
            greater_than: Some(20.0),
            greater_than_or_equal: None,
            less_than: None,
            less_than_or_equal: None,
        }),
        tolerance: 0.25,
    };
    assert!(!expected_planar(&planar)(&features).positive);
    planar.area = Some(NumericExpectation::Conditions {
        value: None,
        greater_than: None,
        greater_than_or_equal: Some(20.0),
        less_than: None,
        less_than_or_equal: Some(20.0),
    });
    assert!(expected_planar(&planar)(&features).positive);
    let next_diameter = f64::from_bits(2.0_f64.to_bits() + 1);
    let mut hole = HoleExpectation {
        diameter: next_diameter,
        through: None,
        axis: None,
        center: None,
        tolerance: 0.0,
    };
    assert!(!expected_hole(&hole)(&features).positive);
    hole.tolerance = next_diameter - 2.0;
    assert!(expected_hole(&hole)(&features).positive);
}

#[test]
fn nominal_axis_label_does_not_assert_exact_alignment() {
    let mut brep = RetainedBrep::complete();
    let cylinder = Rc::make_mut(&mut brep.faces)
        .iter_mut()
        .find(|face| {
            matches!(
                face.facts.surface,
                SurfaceFacts::Cylinder { radius: 0.5, .. }
            )
        })
        .unwrap();
    if let SurfaceFacts::Cylinder { axis, .. } = &mut cylinder.facts.surface {
        *axis = [0.6, 0.0, 0.8];
    }
    let mut features = derive_features(&brep).unwrap();
    populate_bores(&mut features, &brep, &brep.circular_bores(4096).unwrap()).unwrap();
    let outcome = expected_cylinder(&CylindricalExpectation {
        radius: 0.5,
        axis: Axis::Z,
        tolerance: 0.0,
    })(&features);
    assert!(outcome.positive);
    assert_eq!(
        object_field(
            object_field(&outcome.witnesses, "measurementContract").unwrap(),
            "axisLabels"
        ),
        Some(&Json::string("dominant-component-not-exact-alignment"))
    );
    assert_eq!(Axis::dominant([1.0, -1.0, 1.0]), Axis::X);
    assert_eq!(Axis::dominant([0.0, -1.0, 1.0]), Axis::Y);
}

#[test]
fn bore_inventory_reuses_success_with_identical_cold_warm_debits() {
    let retained = RetainedBrep::complete();
    let queries = Rc::clone(&retained.bore_queries);
    let mut subject = retained_subject();
    subject.brep = Some(Box::new(retained));
    let subjects = [Rc::new(subject)];
    let prepared = prepared(
        Capability::ToHaveCircularHole,
        Json::object([
            ("diameter", Json::Number(2.0)),
            ("through", Json::Bool(true)),
        ]),
    );
    let normalized = prepared.normalized_payload();
    let mut first = None;
    for limit in [6, 7, 7, 6] {
        let budget = Budget::new(limit);
        let mut context = EvaluationContext::new(
            &subjects,
            Capability::ToHaveCircularHole,
            "bore",
            &normalized,
            &budget,
            None,
        );
        let value = crate::result::finish(
            "bore",
            Capability::ToHaveCircularHole,
            crate::result::Polarity::Positive,
            evaluate(&prepared, &mut context),
        )
        .unwrap();
        assert_eq!(budget.used(), 7);
        if limit == 6 {
            assert_eq!(
                object_field(&value, "status"),
                Some(&Json::string("refused"))
            );
            let diagnostic = &array_values(object_field(&value, "diagnostics").unwrap())[0];
            assert_eq!(
                object_field(diagnostic, "code"),
                Some(&Json::string("MATCHER_TIMEOUT"))
            );
        } else {
            assert_eq!(
                object_field(&value, "status"),
                Some(&Json::string("passed"))
            );
            if let Some(first) = &first {
                assert_eq!(&value, first);
            } else {
                first = Some(value);
            }
        }
        assert_eq!(queries.get(), usize::from(first.is_some()));
    }
}

#[test]
fn bore_unknowns_preserve_existential_witness_and_refuse_absence_or_pattern() {
    let mut retained = RetainedBrep::complete();
    // An ordinary unsupported curved surface is a candidate, not an omitted
    // hole. This tests propagation of a typed connector disposition only.
    Rc::make_mut(&mut retained.faces)[2].facts.surface = SurfaceFacts::Sphere {
        center: [0.0, 0.0, 5.0],
        radius: 0.5,
    };
    let mut subject = retained_subject();
    subject.brep = Some(Box::new(retained));
    let subjects = [Rc::new(subject)];
    for (capability, expected, positive_status, negative_status) in [
        (
            Capability::ToHaveCircularHole,
            Json::object([("diameter", Json::Number(2.0))]),
            "passed",
            "failed",
        ),
        (
            Capability::ToHaveCircularHole,
            Json::object([("diameter", Json::Number(99.0))]),
            "refused",
            "refused",
        ),
        (
            Capability::ToHaveCircularHolePattern,
            Json::object([
                ("count", Json::Number(4.0)),
                ("holeDiameter", Json::Number(2.0)),
            ]),
            "refused",
            "refused",
        ),
    ] {
        let prepared = prepared(capability, expected);
        let normalized = prepared.normalized_payload();
        for (polarity, status) in [
            (crate::result::Polarity::Positive, positive_status),
            (crate::result::Polarity::Negative, negative_status),
        ] {
            let budget = Budget::new(7);
            let mut context =
                EvaluationContext::new(&subjects, capability, "bore", &normalized, &budget, None);
            let value = crate::result::finish(
                "bore",
                capability,
                polarity,
                evaluate(&prepared, &mut context),
            )
            .unwrap();
            assert_eq!(object_field(&value, "status"), Some(&Json::string(status)));
            assert_eq!(budget.used(), 7);
            if status == "refused" {
                let diagnostic = &array_values(object_field(&value, "diagnostics").unwrap())[0];
                let topology = object_field(
                    object_field(diagnostic, "details").unwrap(),
                    "circularBoreTopology",
                )
                .unwrap();
                assert_eq!(object_field(topology, "complete"), Some(&Json::Bool(false)));
                assert_eq!(
                    array_values(object_field(topology, "candidates").unwrap()).len(),
                    5
                );
            }
        }
    }
}

#[test]
fn analyze_brep_exposes_partial_bore_inventory_without_fabricated_pattern() {
    let mut retained = RetainedBrep::complete();
    Rc::make_mut(&mut retained.faces)[2].facts.surface = SurfaceFacts::Sphere {
        center: [0.0, 0.0, 5.0],
        radius: 0.5,
    };
    let mut subject = retained_subject();
    subject.brep = Some(Box::new(retained));
    let subjects = [Rc::new(subject)];
    let normalized = Json::Null;
    let budget = Budget::new(8);
    let mut context = EvaluationContext::new(
        &subjects,
        Capability::AnalyzeBrep,
        "analyze",
        &normalized,
        &budget,
        None,
    );
    let Evaluation::Ancillary {
        success,
        value,
        diagnostics,
    } = evaluate_brep(&mut context)
    else {
        panic!("expected partial ancillary report")
    };
    assert!(success);
    assert_eq!(diagnostics.len(), 1);
    assert_eq!(diagnostics[0].severity, Severity::Warning);
    assert_eq!(
        object_field(&value, "diagnostics"),
        Some(&Json::Array(vec![diagnostics[0].to_json()]))
    );
    let brep = object_field(&value, "brep").unwrap();
    assert_eq!(
        array_values(object_field(brep, "circularHoles").unwrap()).len(),
        4
    );
    assert!(array_values(object_field(brep, "circularHolePatterns").unwrap()).is_empty());
    assert_eq!(
        object_field(
            object_field(brep, "circularBoreTopology").unwrap(),
            "complete"
        ),
        Some(&Json::Bool(false))
    );
}

#[test]
fn gate_claims_read_the_source_without_any_report_facet() {
    // F3: validity and feature claims charge the BRep unit and read the
    // source; a failing report cannot refuse them, and none is built.
    let mut subject = retained_subject();
    let mut connector = RetainedBrep::complete();
    connector.fail_report = true;
    let calls = Rc::clone(&connector.report_calls);
    subject.brep = Some(Box::new(connector));
    let subjects = [Rc::new(subject)];
    for (capability, expected) in valid_expectations().into_iter().filter(|(capability, _)| {
        matches!(
            capability,
            Capability::ToBeValidBrep
                | Capability::ToHavePlanarFace
                | Capability::ToHaveCylindricalFace
        )
    }) {
        let prepared = prepared(capability, expected);
        let normalized = prepared.normalized_payload();
        let budget = Budget::new(1);
        let mut context =
            EvaluationContext::new(&subjects, capability, "gate", &normalized, &budget, None);
        assert!(
            matches!(
                evaluate(&prepared, &mut context),
                Evaluation::Geometric {
                    positive_satisfied: true,
                    ..
                }
            ),
            "{} did not read the source",
            capability.name()
        );
        drop(context);
        assert_eq!(budget.used(), 1, "{}", capability.name());
    }
    assert_eq!(calls.get(), 0);
    assert!(subjects[0].mesh_record().is_none());
}

#[test]
fn analyze_brep_meets_the_edge_treatment_face_limit_before_report_facts_and_bores() {
    // F12: 4,097 whole faces of an occurrence-free document exceed the
    // edge-treatment rows; the same refusal now comes before any other work.
    let mut connector = RetainedBrep::complete();
    let template = connector.faces[0].clone();
    connector.faces = (1..=4097)
        .map(|index| {
            let mut face = template.clone();
            face.entity = BrepEntity::WholeFace(index);
            face.facts.index = index - 1;
            face
        })
        .collect::<Vec<_>>()
        .into();
    connector.facts = Rc::new(RetainedFacts {
        occurrences: Vec::new(),
        ..retained_facts()
    });
    let queries = Rc::clone(&connector.bore_queries);
    let mut subject = retained_subject();
    subject.brep = Some(Box::new(connector));
    let subjects = [Rc::new(subject)];
    let normalized = Json::Null;
    let budget = Budget::new(8);
    let mut context = EvaluationContext::new(
        &subjects,
        Capability::AnalyzeBrep,
        "analyze",
        &normalized,
        &budget,
        None,
    );
    let Evaluation::Refused { diagnostics } = evaluate_brep(&mut context) else {
        panic!("an oversized edge-treatment scope must refuse")
    };
    assert_eq!(diagnostics.len(), 1);
    assert_eq!(diagnostics[0].code, "GEOSPEC_UNSUPPORTED_EVIDENCE");
    assert_eq!(
        diagnostics[0].message,
        "The report bundle exceeds the declared binary or retained derived-data limits."
    );
    drop(context);
    assert_eq!(budget.used(), 1);
    assert_eq!(queries.get(), 0);
    assert!(subjects[0].mesh_record().is_none());
}

#[test]
fn bounded_circular_hole_stops_at_the_first_matching_bore() {
    let mut subject = retained_subject();
    subject.brep = Some(Box::new(RetainedBrep::complete()));
    let subjects = [Rc::new(subject)];
    let hole = |diameter: f64, profile| {
        let prepared = prepared(
            Capability::ToHaveCircularHole,
            Json::object([
                ("diameter", Json::Number(diameter)),
                ("through", Json::Bool(true)),
            ]),
        );
        let normalized = prepared.normalized_payload();
        let budget = Budget::new(1_000);
        let mut context = EvaluationContext::new(
            &subjects,
            Capability::ToHaveCircularHole,
            "claim",
            &normalized,
            &budget,
            None,
        )
        .with_evidence_profile(profile);
        match evaluate(&prepared, &mut context) {
            Evaluation::Geometric {
                positive_satisfied,
                diagnostics,
                evidence,
                ..
            } => (positive_satisfied, diagnostics, evidence),
            _ => panic!("a retained BRep evaluates the hole claim"),
        }
    };
    // Four qualified 2 mm through bores follow a 1 mm exterior cylinder.
    let (satisfied, _, complete) = hole(2.0, crate::protocol::EvidenceProfile::Complete);
    assert!(satisfied);
    let complete = object_field(&complete, "witnesses").unwrap();
    assert_eq!(
        array_values(object_field(complete, "circularHoles").unwrap()).len(),
        4
    );
    assert_eq!(
        array_values(object_field(complete, "matches").unwrap()).len(),
        4
    );
    let (satisfied, _, bounded) = hole(2.0, crate::protocol::EvidenceProfile::Bounded);
    assert!(satisfied);
    assert_eq!(
        object_field(object_field(&bounded, "measured").unwrap(), "matchCount"),
        Some(&Json::Number(1.0))
    );
    let bounded = object_field(&bounded, "witnesses").unwrap();
    assert!(object_field(bounded, "circularHoles").is_none());
    assert_eq!(
        array_values(object_field(bounded, "matches").unwrap()),
        &array_values(object_field(complete, "matches").unwrap())[..1]
    );
    let topology = object_field(bounded, "circularBoreTopology").unwrap();
    assert!(object_field(topology, "complete").is_none());
    let candidates = array_values(object_field(topology, "candidates").unwrap());
    let first_qualified = array_values(
        object_field(
            object_field(complete, "circularBoreTopology").unwrap(),
            "candidates",
        )
        .unwrap(),
    )
    .iter()
    .find(|candidate| object_field(candidate, "status") == Some(&Json::string("qualified")))
    .unwrap();
    assert_eq!(candidates, std::slice::from_ref(first_qualified));
    // Without a match the bounded profile keeps the complete evidence.
    assert_eq!(
        hole(3.0, crate::protocol::EvidenceProfile::Bounded),
        hole(3.0, crate::protocol::EvidenceProfile::Complete)
    );
}
