use std::rc::Rc;

use super::*;
use crate::backend::{
    brep::{
        BrepEntity, CommonVolume, EdgeFacts, Extrema, FaceFacts, LocatedFace, OccurrenceFacts,
        PointState, ProductFacts, ShapeFacts, TessellationProfile, ValidityCheck, WallOptions,
        WallThicknessOutcome,
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
            index,
            parameter_bounds: [0.0; 4],
            area: 20.0,
            center_of_mass: center,
            surface,
        },
        bounds,
        reversed,
        edge_indices: Vec::new(),
        shape_label: Some(format!("face-{index}")),
    }
}

fn occurrence(index: u32, path: &str) -> OccurrenceFacts {
    OccurrenceFacts {
        label: format!("occurrence-{index}"),
        product_label: "product-bracket".into(),
        name: path.into(),
        placement: [1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0],
        bounds: bounds([-10.0, -10.0, 0.0], [10.0, 10.0, 10.0]),
        path: path.into(),
        parent: None,
        product: 0,
        product_name: "bracket".into(),
        instance_name: Some(path.into()),
        ordinal_path: vec![index + 1],
    }
}

fn retained_facts() -> DocumentFacts {
    DocumentFacts {
        source_length_unit: "millimetre".into(),
        source_unit_to_millimeters: 1.0,
        products: vec![ProductFacts {
            label: "product-bracket".into(),
            name: "bracket".into(),
        }],
        occurrences: vec![occurrence(0, "left"), occurrence(1, "right")],
        shape: ShapeFacts {
            valid: true,
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
        faces: Vec::new(),
        pmi: Vec::new(),
        subshapes: Vec::new(),
        datum_placements: Vec::new(),
        semantic_datums: Vec::new(),
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
    facts: Rc<DocumentFacts>,
    faces: Rc<[LocatedFace]>,
    validity: Rc<ValidityFacts>,
}

impl RetainedBrep {
    fn complete() -> Self {
        Self {
            facts: Rc::new(retained_facts()),
            faces: Rc::from(retained_faces()),
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
    fn reported_facts_and_mesh(
        &self,
    ) -> Result<crate::backend::brep::ReportedBrepBundle, BackendError> {
        // This test double supplies the explicit coherent report seam. Its empty
        // mesh is unused by these fact-only predicate/early-selection controls.
        let facts = Rc::clone(&self.facts);
        let occurrence_faces = (0..facts.occurrences.len())
            .map(|_| Rc::from(Vec::<LocatedFace>::new()))
            .collect();
        Ok(crate::backend::brep::ReportedBrepBundle {
            facts,
            whole_faces: Rc::clone(&self.faces),
            occurrence_faces,
            mesh: Rc::new(TriangleMesh {
                positions: Vec::new(),
                triangles: Vec::new(),
            }),
        })
    }

    fn facts(&self) -> Result<Rc<DocumentFacts>, BackendError> {
        Ok(self.facts.clone())
    }
    fn faces(&self) -> Result<Rc<[LocatedFace]>, BackendError> {
        Ok(self.faces.clone())
    }
    fn occurrence_faces(&self, _: u32) -> Result<Rc<[LocatedFace]>, BackendError> {
        Ok(Rc::from(Vec::<LocatedFace>::new()))
    }
    fn occurrence_edges(&self, _: u32) -> Result<Rc<[EdgeFacts]>, BackendError> {
        Err(unused())
    }
    fn validity(&self) -> Result<Rc<ValidityFacts>, BackendError> {
        Ok(self.validity.clone())
    }
    fn extrema(&self, _: BrepEntity, _: BrepEntity) -> Result<Extrema, BackendError> {
        Err(unused())
    }
    fn classify_points(&self, _: u32, _: &[[f64; 3]]) -> Result<Vec<PointState>, BackendError> {
        Err(unused())
    }
    fn common_volume(&self, _: u32, _: u32) -> Result<CommonVolume, BackendError> {
        Err(unused())
    }
    fn classify_face_points(
        &self,
        _: BrepEntity,
        _: &[[f64; 3]],
        _: f64,
    ) -> Result<Vec<PointState>, BackendError> {
        Err(unused())
    }
    fn minimum_wall_thickness(
        &self,
        _: &WallOptions,
    ) -> Result<WallThicknessOutcome, BackendError> {
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
    let subject = Subject::new(
        identity.primary_hash().into(),
        SubjectFormat::Step,
        "mm".into(),
    );
    subject.semantic_identity.set(identity).unwrap();
    subject
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
        assert!(prepared.demand().brep);
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
        let mut budget = Budget::new(1);
        let mut context = EvaluationContext::new(
            &subjects,
            capability,
            "missing",
            &normalized,
            &mut budget,
            None,
        );
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
    let facts = brep.facts().unwrap();

    assert!(evaluate_units("mm", &facts).unwrap().positive);
    assert!(
        evaluate_products(
            &ProductStructure {
                names: vec!["left".into(), "right".into()],
                count: Some(NumericExpectation::Equal(2.0))
            },
            &facts,
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
            &facts,
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

    let features = derive_features(&brep, &facts, false).unwrap();
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
    assert!(
        expected_chamfer(&FeatureExpectation {
            value: 2.0,
            selection: None,
            tolerance: 0.02
        })(&features)
        .positive
    );
    assert!(
        expected_fillet(&FeatureExpectation {
            value: 0.5,
            selection: None,
            tolerance: 0.02
        })(&features)
        .positive
    );
}

#[test]
fn evaluation_context_drives_all_eleven_matcher_families_with_one_brep_unit() {
    let retained = RetainedBrep::complete();
    let source_evidence = brep_evidence(&retained, &retained.facts).unwrap();
    let mut subject = retained_subject();
    subject.brep = Some(Box::new(retained));
    let subjects = [Rc::new(subject)];

    for (capability, expected) in valid_expectations() {
        let prepared = prepared(capability, expected);
        let expected = prepared.expected_json();
        let normalized = prepared.normalized_payload();
        let mut budget = Budget::new(1);
        let mut context = EvaluationContext::new(
            &subjects,
            capability,
            "claim",
            &normalized,
            &mut budget,
            None,
        );
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
                    | Capability::ToHaveCircularHolePattern
                    | Capability::ToHaveChamferFeature
                    | Capability::ToHaveFilletFeature => {
                        let (key, match_count) = match capability {
                            Capability::ToHavePlanarFace => ("planarFaces", 1),
                            Capability::ToHaveCylindricalFace => ("cylindricalFaces", 4),
                            Capability::ToHaveCircularHole => ("circularHoles", 4),
                            Capability::ToHaveCircularHolePattern => ("circularHolePatterns", 1),
                            Capability::ToHaveChamferFeature => ("chamferFeatures", 1),
                            Capability::ToHaveFilletFeature => ("filletFeatures", 1),
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
            1,
            "{} charged the wrong work",
            capability.name()
        );
    }
}

#[test]
fn mismatch_diagnostics_retain_source_details_and_inventory() {
    let facts = retained_facts();
    let units = evaluate_units("in", &facts).unwrap();
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
    let outcome = evaluate_products(&products, &facts).unwrap();
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
    let features = derive_features(&brep, &brep.facts, false).unwrap();
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
    let mut budget = Budget::new(1);
    let mut context = EvaluationContext::new(
        &subjects,
        Capability::AnalyzeBrep,
        "analysis",
        &normalized,
        &mut budget,
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
        ("chamferFeatures", 1),
        ("filletFeatures", 1),
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
    assert_eq!(budget.used(), 1);
}

#[test]
fn analyze_brep_reports_the_source_unavailable_diagnostic() {
    let subjects = [Rc::new(Subject::new(
        "mesh-subject".into(),
        SubjectFormat::Glb,
        "mm".into(),
    ))];
    let normalized = Json::Null;
    let mut budget = Budget::new(1);
    let mut context = EvaluationContext::new(
        &subjects,
        Capability::AnalyzeBrep,
        "analysis",
        &normalized,
        &mut budget,
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
    let facts = brep.facts().unwrap();
    assert!(!evaluate_units("in", &facts).unwrap().positive);
    assert!(
        !evaluate_products(
            &ProductStructure {
                names: vec!["missing".into()],
                count: None,
            },
            &facts,
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
            &facts,
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

    let features = derive_features(&brep, &facts, false).unwrap();
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
    assert!(
        !expected_chamfer(&FeatureExpectation {
            value: 99.0,
            selection: None,
            tolerance: 0.02,
        })(&features)
        .positive
    );
    assert!(
        !expected_fillet(&FeatureExpectation {
            value: 99.0,
            selection: None,
            tolerance: 0.02,
        })(&features)
        .positive
    );
}

#[test]
fn numeric_matcher_boundaries_are_inclusive() {
    let brep = RetainedBrep::complete();
    let facts = brep.facts().unwrap();
    let features = derive_features(&brep, &facts, false).unwrap();
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
    let chamfer = features.chamfers[0].value;
    assert!(
        expected_chamfer(&FeatureExpectation {
            value: chamfer + 0.125,
            selection: None,
            tolerance: 0.125,
        })(&features)
        .positive
    );
    assert!(
        expected_fillet(&FeatureExpectation {
            value: 0.625,
            selection: None,
            tolerance: 0.125,
        })(&features)
        .positive
    );
}

#[test]
fn negative_measured_empty_and_missing_validity_are_distinct() {
    let mut brep = RetainedBrep::complete();
    brep.faces = Rc::from(Vec::<LocatedFace>::new());
    let features = derive_features(&brep, &brep.facts, false).unwrap();
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
    let features = derive_features(&brep, &brep.facts, false).unwrap();
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
        &facts,
    )
    .unwrap();
    assert!(result.positive);
    assert_eq!(result.witnesses, crate::codec::decode(br#"{"structure":[{"name":"left","path":"left","transform":[0,-1,0,3,1,0,0,-4,0,0,1,5,0,0,0,1]}],"missing":[]}"#).unwrap());
}
