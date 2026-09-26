use std::rc::Rc;

use super::*;
use crate::{
    analysis::{
        batch::BatchAnalysis,
        mesh::{MeshAnalysisRecord, Primitive},
    },
    backend::{
        brep::{
            Bounds, BrepEntity, BrepSubject, CommonVolume, DocumentFacts, EdgeFacts, Extrema,
            LocatedFace, PointState, ShapeFacts, TessellationProfile, TopologyCounts,
            ValidityFacts, WallOptions, WallThicknessOutcome,
        },
        AnalysisRetentionLimits, BackendError, TriangleMesh,
    },
    budget::Budget,
    result::Evaluation,
    subject::{EvaluationContext, Subject, SubjectFormat},
};

struct FactsOnlyBrep(Rc<DocumentFacts>);

impl BrepSubject for FactsOnlyBrep {
    fn reported_facts_and_mesh(
        &self,
    ) -> Result<crate::backend::brep::ReportedBrepBundle, BackendError> {
        // This test double supplies the explicit coherent report seam. Its empty
        // mesh is unused by these fact-only predicate/early-selection controls.
        let facts = Rc::clone(&self.0);
        let occurrence_faces = (0..facts.occurrences.len())
            .map(|_| Rc::from(Vec::<LocatedFace>::new()))
            .collect();
        Ok(crate::backend::brep::ReportedBrepBundle {
            facts,
            whole_faces: Rc::from(Vec::<LocatedFace>::new()),
            occurrence_faces,
            mesh: Rc::new(TriangleMesh {
                positions: Vec::new(),
                triangles: Vec::new(),
            }),
        })
    }

    fn facts(&self) -> Result<Rc<DocumentFacts>, BackendError> {
        Ok(Rc::clone(&self.0))
    }

    fn faces(&self) -> Result<Rc<[LocatedFace]>, BackendError> {
        unreachable!()
    }

    fn occurrence_faces(&self, _: u32) -> Result<Rc<[LocatedFace]>, BackendError> {
        unreachable!()
    }

    fn occurrence_edges(&self, _: u32) -> Result<Rc<[EdgeFacts]>, BackendError> {
        unreachable!()
    }

    fn validity(&self) -> Result<Rc<ValidityFacts>, BackendError> {
        unreachable!()
    }

    fn extrema(&self, _: BrepEntity, _: BrepEntity) -> Result<Extrema, BackendError> {
        unreachable!()
    }

    fn classify_points(&self, _: u32, _: &[[f64; 3]]) -> Result<Vec<PointState>, BackendError> {
        unreachable!()
    }

    fn common_volume(&self, _: u32, _: u32) -> Result<CommonVolume, BackendError> {
        unreachable!()
    }

    fn classify_face_points(
        &self,
        _: BrepEntity,
        _: &[[f64; 3]],
        _: f64,
    ) -> Result<Vec<PointState>, BackendError> {
        unreachable!()
    }

    fn minimum_wall_thickness(
        &self,
        _: &WallOptions,
    ) -> Result<WallThicknessOutcome, BackendError> {
        unreachable!()
    }

    fn tessellate(
        &self,
        _: BrepEntity,
        _: TessellationProfile,
    ) -> Result<Rc<TriangleMesh>, BackendError> {
        unreachable!()
    }
}

fn payload(kind: &str, expected: Json) -> Json {
    Json::object([("kind", Json::string(kind)), ("expected", expected)])
}

fn box_record(offset: f64) -> MeshAnalysisRecord {
    let positions = vec![
        [offset, 0.0, 0.0],
        [offset + 1.0, 0.0, 0.0],
        [offset + 1.0, 1.0, 0.0],
        [offset, 1.0, 0.0],
        [offset, 0.0, 1.0],
        [offset + 1.0, 0.0, 1.0],
        [offset + 1.0, 1.0, 1.0],
        [offset, 1.0, 1.0],
    ];
    let triangles = vec![
        [0, 2, 1],
        [0, 3, 2],
        [4, 5, 6],
        [4, 6, 7],
        [0, 1, 5],
        [0, 5, 4],
        [3, 7, 6],
        [3, 6, 2],
        [0, 4, 7],
        [0, 7, 3],
        [1, 2, 6],
        [1, 6, 5],
    ];
    MeshAnalysisRecord {
        positions,
        triangle_primitives: vec![0; triangles.len()],
        triangles,
        primitives: vec![Primitive {
            name: "asymmetric#0".into(),
            vertex_start: 0,
            vertex_count: 8,
        }],
    }
}

fn subject(record: MeshAnalysisRecord) -> Rc<Subject> {
    let subject = Subject::new(
        "mesh-a1-functional".into(),
        SubjectFormat::MeshBufferV1,
        "mm".into(),
    );
    subject.mesh_record.set(Rc::new(record)).unwrap();
    Rc::new(subject)
}

fn subject_with_brep(record: MeshAnalysisRecord) -> Rc<Subject> {
    let mut subject = Subject::new(
        "mesh-a1-brep-precedence".into(),
        SubjectFormat::MeshBufferV1,
        "mm".into(),
    );
    subject.mesh_record.set(Rc::new(record)).unwrap();
    subject.brep = Some(Box::new(FactsOnlyBrep(Rc::new(DocumentFacts {
        source_length_unit: "millimetre".into(),
        source_unit_to_millimeters: 1.0,
        products: Vec::new(),
        occurrences: Vec::new(),
        shape: ShapeFacts {
            valid: true,
            bounds: Bounds {
                min: [-3.0, -2.0, -1.0],
                max: [7.0, 8.0, 9.0],
            },
            volume: 50.0,
            surface_area: 100.0,
            center_of_mass: [2.0, 3.0, 4.0],
            topology: TopologyCounts {
                compounds: 1,
                solids: 1,
                shells: 1,
                faces: 6,
                wires: 6,
                edges: 12,
                vertices: 8,
            },
        },
        faces: Vec::new(),
        subshapes: Vec::new(),
        datum_placements: Vec::new(),
        semantic_datums: Vec::new(),
    }))));
    Rc::new(subject)
}

fn assert_positive(
    prepared: &Prepared,
    subjects: &[Rc<Subject>],
    batch: Option<&BatchAnalysis>,
) -> u64 {
    let normalized = prepared.normalized_payload();
    let budget = Budget::new(10_000);
    {
        let context = EvaluationContext::new(
            subjects,
            prepared.capability(),
            "mesh-a1",
            &normalized,
            &budget,
            None,
        );
        let mut context = if let Some(batch) = batch {
            context.with_batch(batch)
        } else {
            context
        };
        match evaluate(prepared, &mut context) {
            Evaluation::Geometric {
                positive_satisfied,
                evidence,
                ..
            } => {
                assert!(positive_satisfied, "{evidence:?}");
                assert!(matches!(evidence, Json::Object(_)));
            }
            _ => panic!("mesh matcher did not return geometric evidence"),
        }
    }
    budget.used()
}

#[test]
fn evaluates_all_eight_mesh_matchers_with_full_positive_evidence() {
    let subject = subject(box_record(3.0));
    let subjects = [subject];
    let rows = [
        (
            Capability::ToHaveBoundingBox,
            payload(
                "boundingBox",
                Json::object([
                    (
                        "size",
                        Json::object([
                            ("x", Json::Number(1.0)),
                            ("y", Json::Number(1.0)),
                            ("z", Json::Number(1.0)),
                        ]),
                    ),
                    (
                        "center",
                        Json::object([
                            ("x", Json::Number(3.5)),
                            ("y", Json::Number(0.5)),
                            ("z", Json::Number(0.5)),
                        ]),
                    ),
                ]),
            ),
        ),
        (
            Capability::ToBeWatertight,
            payload("watertight", Json::Bool(true)),
        ),
        (
            Capability::ToHaveMeshIntegrity,
            payload(
                "meshIntegrity",
                Json::object([
                    ("finitePositions", Json::Bool(true)),
                    (
                        "degenerateTriangles",
                        Json::object([("maxCount", Json::Number(0.0))]),
                    ),
                    (
                        "duplicateFaces",
                        Json::object([("maxCount", Json::Number(0.0))]),
                    ),
                    ("watertight", Json::Bool(true)),
                    ("triangleCount", Json::Number(12.0)),
                ]),
            ),
        ),
        (
            Capability::ToHaveSurfaceArea,
            payload("surfaceArea", Json::object([("value", Json::Number(6.0))])),
        ),
        (
            Capability::ToHaveVolume,
            payload("volume", Json::object([("value", Json::Number(1.0))])),
        ),
        (
            Capability::ToHaveMass,
            payload(
                "mass",
                Json::object([("value", Json::Number(2.0)), ("density", Json::Number(2.0))]),
            ),
        ),
        (
            Capability::ToHaveCenterOfMass,
            payload(
                "centerOfMass",
                Json::object([(
                    "point",
                    Json::Array(vec![
                        Json::Number(3.5),
                        Json::Number(0.5),
                        Json::Number(0.5),
                    ]),
                )]),
            ),
        ),
    ];
    for (capability, payload) in rows {
        let prepared = prepare(capability, &payload).unwrap();
        // This fixture is GSM1: its frozen bbox schedule is 12*3 indexed
        // visits + 6 declared axes; the other new families use meshBase=8+36.
        let required = if capability == Capability::ToHaveBoundingBox {
            42
        } else {
            44
        };
        assert_eq!(assert_positive(&prepared, &subjects, None), required);
    }

    let prepared = prepare(
        Capability::ToHaveConnectedComponents,
        &payload(
            "connectedComponents",
            Json::object([
                ("count", Json::Number(1.0)),
                ("toleranceMm", Json::Number(0.0)),
            ]),
        ),
    )
    .unwrap();
    let identity = subjects[0].cache_identity().unwrap();
    let batch = BatchAnalysis::new(
        [(identity, 0)],
        AnalysisRetentionLimits {
            max_mesh_bytes: 1_000_000,
            max_mesh_entries: 1,
            max_solid_entries: 0,
        },
    )
    .unwrap();
    assert_eq!(assert_positive(&prepared, &subjects, Some(&batch)), 44);
}

#[test]
fn component_tolerances_are_separate_and_cold_warm_charges_are_identical() {
    let mut record = box_record(0.0);
    let right = box_record(2.0);
    let vertex_start = record.positions.len() as u32;
    record.positions.extend(right.positions);
    record.triangles.extend(
        right
            .triangles
            .into_iter()
            .map(|triangle| triangle.map(|index| index + vertex_start)),
    );
    record.triangle_primitives.extend(vec![1; 12]);
    record.primitives.push(Primitive {
        name: "right#0".into(),
        vertex_start,
        vertex_count: 8,
    });
    let subject = subject(record);
    let subjects = [subject];
    let identity = subjects[0].cache_identity().unwrap();
    let batch = BatchAnalysis::new(
        [
            (identity.clone(), 0.0_f64.to_bits()),
            (identity, 1.0_f64.to_bits()),
        ],
        AnalysisRetentionLimits {
            max_mesh_bytes: 1_000_000,
            max_mesh_entries: 2,
            max_solid_entries: 0,
        },
    )
    .unwrap();
    let separated = prepare(
        Capability::ToHaveConnectedComponents,
        &payload(
            "connectedComponents",
            Json::object([
                ("count", Json::Number(2.0)),
                ("toleranceMm", Json::Number(0.0)),
            ]),
        ),
    )
    .unwrap();
    let joined = prepare(
        Capability::ToHaveConnectedComponents,
        &payload(
            "connectedComponents",
            Json::object([
                ("count", Json::Number(1.0)),
                ("toleranceMm", Json::Number(1.0)),
            ]),
        ),
    )
    .unwrap();

    assert_eq!(assert_positive(&separated, &subjects, Some(&batch)), 88);
    assert_eq!(assert_positive(&joined, &subjects, Some(&batch)), 88);
    assert_eq!(assert_positive(&separated, &subjects, Some(&batch)), 88);
    assert_eq!(assert_positive(&joined, &subjects, Some(&batch)), 88);
}

#[test]
fn scalar_bounds_and_center_use_brep_facts_before_mesh_facets() {
    let subjects = [subject_with_brep(box_record(3.0))];
    let rows = [
        (
            Capability::ToHaveBoundingBox,
            payload(
                "boundingBox",
                Json::object([(
                    "center",
                    Json::object([
                        ("x", Json::Number(2.0)),
                        ("y", Json::Number(3.0)),
                        ("z", Json::Number(4.0)),
                    ]),
                )]),
            ),
        ),
        (
            Capability::ToHaveSurfaceArea,
            payload(
                "surfaceArea",
                Json::object([("value", Json::Number(100.0))]),
            ),
        ),
        (
            Capability::ToHaveVolume,
            payload("volume", Json::object([("value", Json::Number(50.0))])),
        ),
        (
            Capability::ToHaveMass,
            payload(
                "mass",
                Json::object([
                    ("value", Json::Number(100.0)),
                    ("density", Json::Number(2.0)),
                ]),
            ),
        ),
        (
            Capability::ToHaveCenterOfMass,
            payload(
                "centerOfMass",
                Json::object([(
                    "point",
                    Json::Array(vec![
                        Json::Number(2.0),
                        Json::Number(3.0),
                        Json::Number(4.0),
                    ]),
                )]),
            ),
        ),
    ];
    for (capability, payload) in rows {
        let prepared = prepare(capability, &payload).unwrap();
        assert_eq!(assert_positive(&prepared, &subjects, None), 1);
    }
}

#[test]
fn mass_without_density_refuses_instead_of_reusing_volume_as_mass() {
    let subjects = [subject(box_record(3.0))];
    let prepared = prepare(
        Capability::ToHaveMass,
        &payload("mass", Json::object([("value", Json::Number(1.0))])),
    )
    .unwrap();
    let normalized = prepared.normalized_payload();
    let budget = Budget::new(100);
    let mut context = EvaluationContext::new(
        &subjects,
        Capability::ToHaveMass,
        "no-density",
        &normalized,
        &budget,
        None,
    );
    match evaluate(&prepared, &mut context) {
        Evaluation::Refused { diagnostics } => {
            assert_eq!(diagnostics.len(), 1);
            assert_eq!(diagnostics[0].code, "GEOSPEC_EVIDENCE_UNSUPPORTED");
        }
        _ => panic!("mass without density did not refuse"),
    }
}

#[test]
fn all_four_bounding_fields_accept_runtime_vector_and_partial_axis_forms() {
    for name in ["min", "max", "size", "center"] {
        let vector = Json::Array(vec![
            Json::Number(1.0),
            Json::Number(2.0),
            Json::Number(3.0),
        ]);
        let axis = Json::object([
            ("x", Json::Number(1.0)),
            ("y", Json::Number(2.0)),
            ("z", Json::Number(3.0)),
        ]);
        let vector_prepared = prepare_bounding_box(&Json::object([(name, vector)])).unwrap();
        let axis_prepared = prepare_bounding_box(&Json::object([(name, axis)])).unwrap();
        let (Prepared::BoundingBox { declared: a, .. }, Prepared::BoundingBox { declared: b, .. }) =
            (vector_prepared, axis_prepared)
        else {
            panic!("bounding preparation")
        };
        assert_eq!(a, b);
        assert_eq!(
            a[BOUNDS_FIELDS
                .iter()
                .position(|field| *field == name)
                .unwrap()],
            [Some(1.0), Some(2.0), Some(3.0)]
        );
    }
}

#[test]
fn point_normalization_center_diagnostic_keeps_source_schema_and_actual_numbers() {
    // B27's ideal .5 expectation is preserved in Lead evidence. This control
    // compares authored representations and schema, not ideal arithmetic.
    let subjects = [subject(box_record(0.0))];
    let mut rows = Vec::new();
    for point in [
        Json::Array(vec![
            Json::Number(2.0),
            Json::Number(2.0),
            Json::Number(2.0),
        ]),
        Json::object([
            ("x", Json::Number(2.0)),
            ("y", Json::Number(2.0)),
            ("z", Json::Number(2.0)),
        ]),
    ] {
        let prepared = prepare(
            Capability::ToHaveCenterOfMass,
            &payload(
                "centerOfMass",
                Json::object([("point", point), ("tolerance", Json::Number(0.0))]),
            ),
        )
        .unwrap();
        let normalized = prepared.normalized_payload();
        let budget = Budget::new(100);
        let mut context = EvaluationContext::new(
            &subjects,
            Capability::ToHaveCenterOfMass,
            "center-source",
            &normalized,
            &budget,
            None,
        );
        let Evaluation::Geometric {
            positive_satisfied,
            diagnostics,
            ..
        } = evaluate(&prepared, &mut context)
        else {
            panic!("closed unit cube provides center of mass")
        };
        assert!(!positive_satisfied);
        assert_eq!(diagnostics.len(), 1);
        let actual = crate::codec::encode(&diagnostics[0].to_json()).unwrap();
        let row: serde_json::Value = serde_json::from_slice(&actual).unwrap();
        assert_eq!(row["code"], "GEOSPEC_MEASUREMENT_MISMATCH");
        let mut keys: Vec<_> = row["details"]
            .as_object()
            .unwrap()
            .keys()
            .map(String::as_str)
            .collect();
        keys.sort_unstable();
        assert_eq!(keys, ["failures", "matcher", "measured", "tolerance"]);
        assert_eq!(row["details"]["matcher"], "toHaveCenterOfMass");
        assert_eq!(row["details"]["tolerance"], 0);
        assert_eq!(row["spatial"]["center"], row["details"]["measured"]);
        for (axis, name) in ["x", "y", "z"].into_iter().enumerate() {
            assert_eq!(row["details"]["failures"][axis]["axis"], name);
            assert_eq!(row["details"]["failures"][axis]["expected"], 2);
            assert_eq!(
                row["details"]["failures"][axis]["actual"],
                row["details"]["measured"][axis]
            );
        }
        println!("center source actual: {}", String::from_utf8_lossy(&actual));
        rows.push((crate::codec::encode(&normalized).unwrap(), actual));
    }
    assert_eq!(rows[0], rows[1]);
}
