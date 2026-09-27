use std::{cell::Cell, rc::Rc};

use geospec_engine_native_core::{
    backend::{
        brep::{
            Bounds, BrepAdmissionFacts, BrepConnector, BrepEntity, BrepIdentityProfile,
            BrepSubject, DocumentRows, LocatedFace, OccurrenceFacts, PointState, ReportedFaces,
            ShapeFacts, StepSubjectMetadata, TessellationProfile, TopologyCounts, ValidityFacts,
        },
        csg::{
            BooleanOp, CsgConnector, FillRule, MeshExport, Section, SectionOp, SolidId,
            SolidProperties,
        },
        BackendError, TriangleMesh,
    },
    Engine, EngineConfig,
};
use serde_json::{json, Value};

fn unsupported() -> BackendError {
    unreachable!("projection-only mock does not call geometry operations")
}

#[derive(Default)]
struct ProjectionBrepConnector {
    opens: Rc<Cell<u32>>,
    alternate_profile: Rc<Cell<bool>>,
}

impl BrepConnector for ProjectionBrepConnector {
    fn identity_profile(&self) -> BrepIdentityProfile {
        BrepIdentityProfile {
            ingest_profile: "projection-test-step-v1",
            backend_profile: if self.alternate_profile.get() {
                "projection-test-brep-v2"
            } else {
                "projection-test-brep-v1"
            },
        }
    }

    fn open_step(&self, _: &[u8]) -> Result<Box<dyn BrepSubject>, BackendError> {
        self.opens.set(self.opens.get() + 1);
        Ok(Box::new(ProjectionBrep))
    }
}

struct ProjectionBrep;

impl BrepSubject for ProjectionBrep {
    fn step_subject_metadata(&self) -> Result<Option<StepSubjectMetadata>, BackendError> {
        Ok(Some(StepSubjectMetadata {
            schema: Some("AP242".into()),
            source_byte_length: b"projection-only STEP mock".len(),
            free_shape_count: 0,
            native_read_stream: true,
        }))
    }

    // Already-declared mock facts only; this test does not exercise mesh or
    // kernel geometry.
    fn reported_shape(&self) -> Result<ShapeFacts, BackendError> {
        Ok(ShapeFacts {
            bounds: Bounds {
                min: [0.0; 3],
                max: [1.0; 3],
            },
            volume: 1.0,
            surface_area: 6.0,
            center_of_mass: [0.5; 3],
            topology: TopologyCounts {
                compounds: 1,
                solids: 1,
                shells: 1,
                faces: 6,
                wires: 6,
                edges: 12,
                vertices: 8,
            },
        })
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

    fn admission_facts(&self) -> Result<BrepAdmissionFacts, BackendError> {
        Ok(BrepAdmissionFacts {
            source_length_unit: "millimetre".into(),
            source_unit_to_millimeters: 1.0,
            occurrence_count: 0,
            surfaceless_faces: 0,
        })
    }

    fn faces(&self) -> Result<Rc<[LocatedFace]>, BackendError> {
        Err(unsupported())
    }
    fn validity(&self) -> Result<Rc<ValidityFacts>, BackendError> {
        Ok(Rc::new(ValidityFacts {
            valid: true,
            checks: None,
            max_tolerance: None,
            free_bounds: None,
            small_edges: None,
            same_parameter: None,
            closed_shells: None,
            closed_solids: Some(true),
            solid_count: Some(1),
            invalid_solid_count: Some(0),
            open_edge_count: Some(0),
            nonmanifold_edge_count: None,
            closed_wires: None,
            reason: None,
        }))
    }
    fn classify_face_points(
        &self,
        _: BrepEntity,
        _: &[[f64; 3]],
        _: f64,
    ) -> Result<Vec<PointState>, BackendError> {
        Err(unsupported())
    }
    fn tessellate(
        &self,
        _: BrepEntity,
        _: TessellationProfile,
    ) -> Result<Rc<TriangleMesh>, BackendError> {
        Err(unsupported())
    }
}

struct UnusedCsg;

impl CsgConnector for UnusedCsg {
    fn release(&mut self, _: SolidId) -> Result<(), BackendError> {
        Err(unsupported())
    }
    fn admit(&mut self, _: &TriangleMesh, _: &[[u32; 2]]) -> Result<SolidId, BackendError> {
        Err(unsupported())
    }
    fn boolean(&mut self, _: BooleanOp, _: &[SolidId]) -> Result<SolidId, BackendError> {
        Err(unsupported())
    }
    fn transform(&mut self, _: SolidId, _: [f64; 12]) -> Result<SolidId, BackendError> {
        Err(unsupported())
    }
    fn decompose(&mut self, _: SolidId) -> Result<Vec<SolidId>, BackendError> {
        Err(unsupported())
    }
    fn properties(&self, _: SolidId) -> Result<SolidProperties, BackendError> {
        Err(unsupported())
    }
    fn export(&self, _: SolidId) -> Result<MeshExport, BackendError> {
        Err(unsupported())
    }
    fn slice(&self, _: SolidId, _: f64) -> Result<Section, BackendError> {
        Err(unsupported())
    }
    fn section(&self, _: &[Vec<[f64; 2]>], _: FillRule) -> Result<Section, BackendError> {
        Err(unsupported())
    }
    fn section_boolean(
        &self,
        _: SectionOp,
        _: &Section,
        _: &Section,
    ) -> Result<Section, BackendError> {
        Err(unsupported())
    }
}

fn claim(engine: &Engine, subject: Value, capability: &str, payload: Value) -> Value {
    let request = json!({
        "method": "submitClaims",
        "requestId": "projection",
        "protocolVersion": 3,
        "registryVersion": 5,
        "canonicalProfile": "geospec-jcs-v1",
        "plan": {
            "subjects": [subject],
            "claims": [{
                "claimId": "projection",
                "capability": capability,
                "subjectSlots": ["subject"],
                "payload": payload,
                "polarity": "positive",
                "workUnitBudget": 8_000_000
            }]
        }
    });
    serde_json::from_slice(
        &engine
            .process_request(&serde_json::to_vec(&request).unwrap())
            .unwrap(),
    )
    .unwrap()
}

fn step_request(bytes: &[u8], name: Option<&str>) -> Vec<u8> {
    serde_json::to_vec(&json!({
        "method": "ingestSubject", "requestId": "step",
        "protocolVersion": 3, "registryVersion": 5,
        "canonicalProfile": "geospec-jcs-v1", "format": "step",
        "frame": {"coordinateSystem": "z-up", "sourceUnit": "auto", "outputUnit": "mm"},
        "ingestOptions": name.map_or_else(|| json!({}), |name| json!({"name": name})),
        "primaryByteLength": bytes.len(), "resources": []
    }))
    .unwrap()
}

#[test]
fn should_skip_step_open_only_for_exact_retained_source_options_and_profile() {
    let opens = Rc::new(Cell::new(0));
    let alternate_profile = Rc::new(Cell::new(false));
    let mut engine = Engine::with_backends(
        EngineConfig::entry(),
        Box::new(ProjectionBrepConnector {
            opens: Rc::clone(&opens),
            alternate_profile: Rc::clone(&alternate_profile),
        }),
        Box::new(UnusedCsg),
    );
    let bytes = b"raw STEP A";
    let first = engine
        .ingest_subject(&step_request(bytes, None), bytes, vec![])
        .unwrap();
    let repeat = engine
        .ingest_subject(&step_request(bytes, None), bytes, vec![])
        .unwrap();
    assert_eq!(first, repeat);
    assert_eq!(opens.get(), 1);

    let mut invalid: Value = serde_json::from_slice(&step_request(bytes, None)).unwrap();
    invalid["frame"]["outputUnit"] = json!("m");
    assert_eq!(
        engine
            .ingest_subject(&serde_json::to_vec(&invalid).unwrap(), bytes, vec![])
            .unwrap_err()
            .code(),
        "invalid-request"
    );
    assert_eq!(opens.get(), 1);

    let changed_bytes = engine
        .ingest_subject(&step_request(b"raw STEP B", None), b"raw STEP B", vec![])
        .unwrap();
    let named = engine
        .ingest_subject(&step_request(bytes, Some("named")), bytes, vec![])
        .unwrap();
    alternate_profile.set(true);
    let changed_profile = engine
        .ingest_subject(&step_request(bytes, None), bytes, vec![])
        .unwrap();
    assert_ne!(first, changed_bytes);
    assert_ne!(first, named);
    assert_ne!(first, changed_profile);
    assert_eq!(opens.get(), 4);
    let observations: Value = serde_json::from_slice(&engine.observations()).unwrap();
    assert_eq!(observations["physical"]["admissions"], "5");
    assert_eq!(observations["physical"]["parses"], "4");
    assert_eq!(observations["physical"]["identityBuilds"], "4");
    assert_eq!(observations["copies"]["inputCopies"], "0");

    let mut limits = EngineConfig::entry();
    limits.analysis.max_mesh_bytes = 0;
    let mut uncached = Engine::with_backends(
        limits,
        Box::new(ProjectionBrepConnector {
            opens: Rc::clone(&opens),
            alternate_profile,
        }),
        Box::new(UnusedCsg),
    );
    let request = step_request(bytes, None);
    let unretained = uncached.ingest_subject(&request, bytes, vec![]).unwrap();
    // Ruling 15: digest, length and descriptor reuse a subject whose source was not retained.
    assert_eq!(
        unretained,
        uncached.ingest_subject(&request, bytes, vec![]).unwrap()
    );
    assert_eq!(opens.get(), 5);
    release_admitted(&mut uncached, &unretained);
    assert_eq!(
        unretained,
        uncached.ingest_subject(&request, bytes, vec![]).unwrap()
    );
    assert_eq!(opens.get(), 6);
}

fn release_admitted(engine: &mut Engine, admission: &[u8]) {
    let admission: Value = serde_json::from_slice(admission).unwrap();
    let handle: Value = serde_json::from_slice(
        &engine
            .subject_handle(
                &serde_json::to_vec(&json!({
                    "method": "subjectHandle", "requestId": "handle", "protocolVersion": 3,
                    "registryVersion": 5, "canonicalProfile": "geospec-jcs-v1",
                    "subjectHash": admission["result"]["subject"]["subjectHash"]
                }))
                .unwrap(),
            )
            .unwrap(),
    )
    .unwrap();
    let released: Value = serde_json::from_slice(
        &engine
            .release_subject(
                &serde_json::to_vec(&json!({
                    "method": "releaseSubject", "requestId": "release", "protocolVersion": 3,
                    "registryVersion": 5, "canonicalProfile": "geospec-jcs-v1",
                    "subjectHandle": handle["result"]["subjectHandle"]
                }))
                .unwrap(),
            )
            .unwrap(),
    )
    .unwrap();
    assert_eq!(released["result"]["released"], true);
}

#[test]
fn should_release_step_source_lookup_with_its_subject_generation() {
    let opens = Rc::new(Cell::new(0));
    let mut engine = Engine::with_backends(
        EngineConfig::entry(),
        Box::new(ProjectionBrepConnector {
            opens: Rc::clone(&opens),
            alternate_profile: Rc::new(Cell::new(false)),
        }),
        Box::new(UnusedCsg),
    );
    for seed in 0..40 {
        let bytes = format!("raw STEP source {seed}").into_bytes();
        let request = step_request(&bytes, None);
        let admission = engine.ingest_subject(&request, &bytes, vec![]).unwrap();
        assert_eq!(
            admission,
            engine.ingest_subject(&request, &bytes, vec![]).unwrap()
        );
        let admission: Value = serde_json::from_slice(&admission).unwrap();
        let handle_request = serde_json::to_vec(&json!({
            "method": "subjectHandle", "requestId": "handle", "protocolVersion": 3,
            "registryVersion": 5, "canonicalProfile": "geospec-jcs-v1",
            "subjectHash": admission["result"]["subject"]["subjectHash"]
        }))
        .unwrap();
        let handle: Value =
            serde_json::from_slice(&engine.subject_handle(&handle_request).unwrap()).unwrap();
        let released: Value = serde_json::from_slice(
            &engine
                .release_subject(
                    &serde_json::to_vec(&json!({
                        "method": "releaseSubject", "requestId": "release", "protocolVersion": 3,
                        "registryVersion": 5, "canonicalProfile": "geospec-jcs-v1",
                        "subjectHandle": handle["result"]["subjectHandle"]
                    }))
                    .unwrap(),
                )
                .unwrap(),
        )
        .unwrap();
        assert_eq!(released["result"]["released"], true);
        assert_eq!(
            engine.subject_handle(&handle_request).unwrap_err().code(),
            "invalid-request"
        );
    }
    assert_eq!(opens.get(), 40);
}

#[test]
fn should_project_analyze_mesh_stats_into_the_source_operation_envelope() {
    let manifest: Value = serde_json::from_str(include_str!("fixtures/mesh-entry.json")).unwrap();
    let fixture = &manifest["fixtures"][0];
    let hex = fixture["hex"].as_str().unwrap();
    let bytes = (0..hex.len())
        .step_by(2)
        .map(|index| u8::from_str_radix(&hex[index..index + 2], 16).unwrap())
        .collect::<Vec<_>>();
    let mut engine = Engine::new();
    let mut ingest_request: Value =
        serde_json::from_str(fixture["ingestRequestUtf8"].as_str().unwrap()).unwrap();
    ingest_request["registryVersion"] = json!(5);
    engine
        .ingest_mesh(&serde_json::to_vec(&ingest_request).unwrap(), &bytes)
        .unwrap();

    let response = claim(
        &engine,
        json!({"slot": "subject", "contentHash": fixture["hash"]}),
        "analyzeMesh",
        Value::Null,
    );
    let evidence = &response["result"]["results"][0]["evidence"];
    assert_eq!(evidence["success"], true);
    assert_eq!(evidence["subject"]["kind"], "geometry-subject");
    assert_eq!(evidence["subject"]["mesh"]["format"], "mesh-buffer");
    assert_eq!(evidence["subject"]["diagnostics"], json!([]));
    assert!(evidence["subject"].get("step").is_none());
    assert_eq!(
        evidence["subject"]["mesh"]["stats"]["vertexCount"],
        evidence["stats"]["vertexCount"]
    );
    assert_eq!(evidence["diagnostics"], json!([]));
    assert!(evidence["stats"].get("meshQuality").is_some());
    assert!(evidence["stats"].get("boundingBox").is_some());
    assert!(evidence["stats"].get("watertightAnalysis").is_none());
    assert!(evidence.get("meshQuality").is_none());
}

#[test]
fn should_refuse_requested_validity_measurements_that_are_absent() {
    let mut engine = Engine::with_backends(
        EngineConfig::entry(),
        Box::new(ProjectionBrepConnector::default()),
        Box::new(UnusedCsg),
    );
    let bytes = b"projection-only STEP mock".to_vec();
    let request = json!({
        "method": "ingestSubject",
        "requestId": "admit",
        "protocolVersion": 3,
        "registryVersion": 5,
        "canonicalProfile": "geospec-jcs-v1",
        "format": "step",
        "frame": {"coordinateSystem": "z-up", "sourceUnit": "auto", "outputUnit": "mm"},
        "ingestOptions": {},
        "primaryByteLength": bytes.len(),
        "resources": []
    });
    let admitted: Value = serde_json::from_slice(
        &engine
            .ingest_subject(&serde_json::to_vec(&request).unwrap(), &bytes, Vec::new())
            .unwrap(),
    )
    .unwrap();
    let subject = admitted["result"]["subject"]["subjectHash"]
        .as_str()
        .unwrap();
    let analyzed = claim(
        &engine,
        json!({"slot": "subject", "subjectHash": subject}),
        "analyzeMesh",
        Value::Null,
    );
    let evidence = &analyzed["result"]["results"][0]["evidence"];
    assert_eq!(analyzed["result"]["results"][0]["status"], "passed");
    assert_eq!(evidence["subject"]["step"]["unit"], "mm");
    assert_eq!(evidence["subject"]["step"]["schema"], "AP242");
    assert_eq!(evidence["subject"]["step"]["productStructure"], json!([]));
    assert_eq!(
        evidence["subject"]["step"]["readStrategy"],
        json!({
            "strategy": "native-stream", "inputKind": "bytes",
            "bytesRead": b"projection-only STEP mock".len(),
            "nativeReadStream": true, "copiedToEmscriptenFs": false
        })
    );
    assert_eq!(evidence["subject"]["step"]["xde"]["freeShapeCount"], 0);
    assert!(evidence["subject"]["step"]["xde"]
        .get("datumSystems")
        .is_none());
    let response = claim(
        &engine,
        json!({"slot": "subject", "subjectHash": subject}),
        "toBeValidBrep",
        json!({
            "kind": "validBrep",
            "expected": {
                "maxTolerance": 1,
                "freeBounds": {"count": 0},
                "minEdgeLength": 1,
                "sameParameter": true,
                "closedShells": true,
                "closedWires": true
            }
        }),
    );
    let result = &response["result"]["results"][0];
    assert_eq!(result["status"], "refused");
    assert_eq!(
        result["diagnostics"][0]["code"],
        "GEOSPEC_EVIDENCE_UNSUPPORTED"
    );
    assert_eq!(result["diagnostics"][0]["message"], "expectGeo(...).toBeValidBrep() needs exact BRep evidence (The validity facet did not measure maximum tolerance, free-bound count, small-edge census, same-parameter state, closed-shell state, closed-wire state.), which this subject does not carry.");
}
