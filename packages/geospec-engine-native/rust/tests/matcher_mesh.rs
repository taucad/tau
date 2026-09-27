use std::rc::Rc;

use super::*;
use crate::{
    analysis::{
        batch::BatchAnalysis,
        mesh::{MeshAnalysisRecord, Primitive},
    },
    backend::{
        brep::{
            Bounds, BrepEntity, BrepSubject, Charge, ClosureFacts, ClosureGroup, DocumentRows,
            LocatedFace, OccurrenceFacts, PointState, ReportedFaces, ShapeFacts,
            TessellationProfile, TopologyCounts, ValidityFacts,
        },
        AnalysisRetentionLimits, BackendError, TriangleMesh,
    },
    budget::Budget,
    result::Evaluation,
    subject::{EvaluationContext, Subject, SubjectFormat},
};

/// Whole-shape facts of an occurrence-free document; its empty mesh is unused
/// by these fact-only predicate/early-selection controls.
struct FactsOnlyBrep(ShapeFacts);

impl BrepSubject for FactsOnlyBrep {
    fn reported_shape(&self) -> Result<ShapeFacts, BackendError> {
        Ok(self.0.clone())
    }

    fn reported_mesh(&self) -> Result<TriangleMesh, BackendError> {
        Ok(TriangleMesh {
            positions: Vec::new(),
            triangles: Vec::new(),
        })
    }

    fn reported_faces(&self, _: bool) -> Result<ReportedFaces, BackendError> {
        Ok(ReportedFaces {
            whole_faces: Rc::from(Vec::<LocatedFace>::new()),
            occurrence_faces: Vec::new(),
        })
    }

    fn source_occurrences(&self) -> Result<Rc<[OccurrenceFacts]>, BackendError> {
        Ok(Rc::from(Vec::new()))
    }

    fn document_rows(&self) -> Result<DocumentRows, BackendError> {
        Ok(DocumentRows::default())
    }

    fn faces(&self) -> Result<Rc<[LocatedFace]>, BackendError> {
        unreachable!()
    }

    fn validity(&self) -> Result<Rc<ValidityFacts>, BackendError> {
        unreachable!()
    }

    /// One open shell: the exact watertight and integrity routes fail.
    fn closure(&self, _: &mut Charge<'_>) -> Result<Option<Rc<ClosureFacts>>, BackendError> {
        Ok(Some(Rc::new(ClosureFacts {
            shells: 1,
            free_faces: 0,
            open_edges: 1,
            nonmanifold_edges: 0,
            failing: vec![ClosureGroup {
                free_faces: false,
                open_edges: 1,
                nonmanifold_edges: 0,
                occurrences: Vec::new(),
                samples: Vec::new(),
            }],
        })))
    }

    fn classify_face_points(
        &self,
        _: BrepEntity,
        _: &[[f64; 3]],
        _: f64,
    ) -> Result<Vec<PointState>, BackendError> {
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
    subject.brep = Some(Box::new(FactsOnlyBrep(ShapeFacts {
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
    })));
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
fn scalar_bounds_and_center_use_the_report_shape_before_mesh_facets() {
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

/// Canonical claim results for every projected mesh family on crafted subjects
/// whose integrity lists, watertight clusters and components are all non-empty.
/// Pinned from M0 (446ff8ba0): the projection must move, not change, fields.
#[test]
fn projected_mesh_family_results_keep_their_bytes() {
    // A closed box, a disjoint fin and a fan with a duplicate, a degenerate
    // triangle and a non-finite corner.
    let mut flawed = box_record(0.0);
    flawed.positions.extend([
        [5.0, 0.0, 0.0],
        [6.0, 0.0, 0.0],
        [5.0, 1.0, 0.0],
        [f64::INFINITY, 0.0, 0.0],
    ]);
    flawed
        .triangles
        .extend([[8, 9, 10], [10, 9, 8], [8, 8, 9], [11, 9, 10]]);
    flawed.triangle_primitives.extend([1; 4]);
    flawed.primitives.push(Primitive {
        name: "fan#0".into(),
        vertex_start: 8,
        vertex_count: 4,
    });
    // Two boxes and an open fin: finite, so every family can answer.
    let mut parts = box_record(0.0);
    let right = box_record(2.0);
    parts.positions.extend(right.positions);
    parts.triangles.extend(
        right
            .triangles
            .into_iter()
            .map(|triangle| triangle.map(|index| index + 8)),
    );
    parts.triangle_primitives.extend([1; 12]);
    parts.primitives.push(Primitive {
        name: "right#0".into(),
        vertex_start: 8,
        vertex_count: 8,
    });
    parts
        .positions
        .extend([[9.0, 0.0, 0.0], [10.0, 0.0, 0.0], [9.0, 1.0, 0.5]]);
    parts.triangles.push([16, 17, 18]);
    parts.triangle_primitives.push(2);
    parts.primitives.push(Primitive {
        name: "fin#0".into(),
        vertex_start: 16,
        vertex_count: 3,
    });

    let integrity_all = Json::object([
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
        ("triangleCount", Json::Number(16.0)),
    ]);
    let rows = [
        (
            flawed,
            Capability::ToHaveMeshIntegrity,
            payload("meshIntegrity", integrity_all.clone()),
        ),
        (
            parts.clone(),
            Capability::ToHaveMeshIntegrity,
            payload("meshIntegrity", integrity_all),
        ),
        (
            parts.clone(),
            Capability::ToHaveMeshIntegrity,
            payload(
                "meshIntegrity",
                Json::object([("finitePositions", Json::Bool(true))]),
            ),
        ),
        (
            parts.clone(),
            Capability::ToBeWatertight,
            payload("watertight", Json::Bool(true)),
        ),
        (
            parts.clone(),
            Capability::ToHaveConnectedComponents,
            payload(
                "connectedComponents",
                Json::object([
                    ("count", Json::Number(2.0)),
                    ("toleranceMm", Json::Number(0.0)),
                ]),
            ),
        ),
        (
            parts.clone(),
            Capability::ToHaveVolume,
            payload("volume", Json::object([("value", Json::Number(3.0))])),
        ),
        (
            parts.clone(),
            Capability::ToHaveMass,
            payload(
                "mass",
                Json::object([("value", Json::Number(1.0)), ("density", Json::Number(2.0))]),
            ),
        ),
        (
            parts.clone(),
            Capability::ToHaveSurfaceArea,
            payload("surfaceArea", Json::object([("value", Json::Number(12.5))])),
        ),
        (
            parts,
            Capability::ToHaveCenterOfMass,
            payload(
                "centerOfMass",
                Json::object([(
                    "point",
                    Json::Array(vec![
                        Json::Number(0.0),
                        Json::Number(0.0),
                        Json::Number(0.0),
                    ]),
                )]),
            ),
        ),
    ];
    let mut actual = Vec::new();
    for (record, capability, payload) in rows {
        let prepared = prepare(capability, &payload).unwrap();
        let subjects = [subject(record)];
        let batch = BatchAnalysis::new(
            prepared
                .demand()
                .connected_components_tolerance_bits
                .map(|bits| (subjects[0].cache_identity().unwrap(), bits)),
            AnalysisRetentionLimits {
                max_mesh_bytes: 1_000_000,
                max_mesh_entries: 1,
                max_solid_entries: 0,
            },
        )
        .unwrap();
        let normalized = prepared.normalized_payload();
        let budget = Budget::new(10_000);
        let mut context =
            EvaluationContext::new(&subjects, capability, "pin", &normalized, &budget, None)
                .with_batch(&batch);
        let evaluation = evaluate(&prepared, &mut context);
        let result = crate::result::finish(
            "pin",
            capability,
            crate::result::Polarity::Positive,
            evaluation,
        )
        .unwrap();
        let bytes = crate::codec::encode(&result).unwrap();
        actual.push(crate::sha256_hex(bytes));
    }
    assert_eq!(
        actual,
        [
            "49a73b4ba21e56b8cc755028b3ef81ce829a365522219da2706b23b974f9d66b",
            "6b6ea29d7cc0c8df55f01df07fb61d85e97ad9fd5aea9c202bd2388800a10414",
            "f9342c063b8512ac79f7e4241fafe76d0ca3e8c313ed9ff2ce722bbc00583146",
            "068054b2ffdcb2e3269d1549e725f5cc1ce0f717f5be07e3c6fe73ed2f049b3d",
            "1a0d03d9de132def3069f578e48aa032bbc3fe2b10e78f313938b300b43eb973",
            "a8e4c26aecdc3370d3f385b5bbb3e315eb6862762df11715a25fc273f165b731",
            "c0160f0160e7000b68a84dcfe0e9f44a4eec98040802774c0b42dcf83a1f4904",
            "564e601511264fd3a665dd981fd6255b45acf5c1571b21573ace7816fe9fe3be",
            "3b4421ea05f1226057d5f86a734ab2035d0a5cca6bd9bfd398b808df9ca00e68",
        ]
    );
}

#[test]
fn negated_claims_skip_the_failure_diagnostics_that_finish_drops() {
    // H9: finish() keeps no error diagnostic of a negated geometric result, so
    // the family no longer builds one; the result bytes are those it had when
    // it built the diagnostic for either polarity.
    let mut open = box_record(0.0);
    open.positions
        .extend([[9.0, 0.0, 0.0], [10.0, 0.0, 0.0], [9.0, 1.0, 0.5]]);
    open.triangles.push([8, 9, 10]);
    open.triangle_primitives.push(1);
    open.primitives.push(Primitive {
        name: "fin#0".into(),
        vertex_start: 8,
        vertex_count: 3,
    });
    let origin = Json::Array(vec![Json::Number(0.0); 3]);
    let unit = Json::object([
        ("x", Json::Number(1.0)),
        ("y", Json::Number(1.0)),
        ("z", Json::Number(1.0)),
    ]);
    // The exact rows read the BRep's closure facet (MESH-ON-BREP-01).
    let exact = [Capability::ToBeWatertight, Capability::ToHaveMeshIntegrity];
    for (capability, payload) in [
        (
            Capability::ToBeWatertight,
            payload("watertight", Json::Bool(true)),
        ),
        (
            Capability::ToHaveBoundingBox,
            payload("boundingBox", Json::object([("size", unit)])),
        ),
        (
            Capability::ToHaveVolume,
            payload("volume", Json::object([("value", Json::Number(3.0))])),
        ),
        (
            Capability::ToHaveCenterOfMass,
            payload("centerOfMass", Json::object([("point", origin.clone())])),
        ),
        (
            Capability::ToHaveConnectedComponents,
            payload(
                "connectedComponents",
                Json::object([
                    ("count", Json::Number(1.0)),
                    ("toleranceMm", Json::Number(0.0)),
                ]),
            ),
        ),
        (
            Capability::ToHaveMeshIntegrity,
            payload(
                "meshIntegrity",
                Json::object([("watertight", Json::Bool(true))]),
            ),
        ),
    ] {
        let prepared = prepare(capability, &payload).unwrap();
        let normalized = prepared.normalized_payload();
        let negated = |subjects: &[Rc<Subject>], context_polarity| {
            let batch = BatchAnalysis::new(
                prepared
                    .demand()
                    .connected_components_tolerance_bits
                    .map(|bits| (subjects[0].cache_identity().unwrap(), bits)),
                AnalysisRetentionLimits {
                    max_mesh_bytes: 1_000_000,
                    max_mesh_entries: 1,
                    max_solid_entries: 0,
                },
            )
            .unwrap();
            let budget = Budget::new(10_000);
            let mut context =
                EvaluationContext::new(subjects, capability, "not", &normalized, &budget, None)
                    .with_batch(&batch)
                    .with_polarity(context_polarity);
            let before = MISMATCH_BUILDS.with(std::cell::Cell::get);
            let evaluation = evaluate(&prepared, &mut context);
            let builds = MISMATCH_BUILDS.with(std::cell::Cell::get) - before;
            let result = crate::result::finish(
                "not",
                capability,
                crate::result::Polarity::Negative,
                evaluation,
            )
            .unwrap();
            (crate::codec::encode(&result).unwrap(), builds)
        };
        let mut rows = vec![[subject(open.clone())]];
        if exact.contains(&capability) {
            rows.push([subject_with_brep(open.clone())]);
        }
        for subjects in rows {
            let route = if subjects[0].brep.is_some() {
                "exact"
            } else {
                "mesh"
            };
            let (before, built) = negated(&subjects, crate::result::Polarity::Positive);
            let (after, skipped) = negated(&subjects, crate::result::Polarity::Negative);
            assert_eq!((built, skipped), (1, 0), "{} {route}", capability.name());
            assert_eq!(after, before, "{} {route}", capability.name());
        }
    }
}
