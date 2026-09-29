use geospec_engine_native_core::{
    backend::{csg::*, BackendError, TriangleMesh},
    Engine, EngineConfig,
};
use geospec_engine_native_occt::{BrepEntity, BrepSubject, Document, OcctConnector};
use serde_json::{json, Value};
use std::path::PathBuf;

mod support;
use support::current_profile::{bind_claim, bind_ingest};

fn fixture_root() -> PathBuf {
    std::env::var_os("GEOSPEC_FINITE_CONTACT_INPUTS")
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/finite-contact")
        })
}

struct NoCsg;
impl CsgConnector for NoCsg {
    fn release(&mut self, _: SolidId) -> Result<(), BackendError> {
        panic!("unexpected CSG")
    }
    fn admit(&mut self, _: &TriangleMesh, _: &[[u32; 2]]) -> Result<SolidId, BackendError> {
        panic!("unexpected CSG")
    }
    fn boolean(&mut self, _: BooleanOp, _: &[SolidId]) -> Result<SolidId, BackendError> {
        panic!("unexpected CSG")
    }
    fn transform(&mut self, _: SolidId, _: [f64; 12]) -> Result<SolidId, BackendError> {
        panic!("unexpected CSG")
    }
    fn decompose(&mut self, _: SolidId) -> Result<Vec<SolidId>, BackendError> {
        panic!("unexpected CSG")
    }
    fn properties(&self, _: SolidId) -> Result<SolidProperties, BackendError> {
        panic!("unexpected CSG")
    }
    fn export(&self, _: SolidId) -> Result<MeshExport, BackendError> {
        panic!("unexpected CSG")
    }
    fn slice(&self, _: SolidId, _: f64) -> Result<Section, BackendError> {
        panic!("unexpected CSG")
    }
    fn section(&self, _: &[Vec<[f64; 2]>], _: FillRule) -> Result<Section, BackendError> {
        panic!("unexpected CSG")
    }
    fn section_boolean(
        &self,
        _: SectionOp,
        _: &Section,
        _: &Section,
    ) -> Result<Section, BackendError> {
        panic!("unexpected CSG")
    }
}
fn claim_result(json: &str) -> Value {
    let value: Value = serde_json::from_str(json).unwrap();
    let results = value["result"]["results"].as_array().unwrap();
    assert_eq!(results.len(), 1, "Expected one claim result: {value}");
    results[0].clone()
}

#[test]
fn claim_status_ignores_nested_statuses_and_rebinds_only_subject_slot() {
    let response = r#"{"result":{"results":[{"status":"refused","diagnostics":[{"status":"passed"}],"evidence":{"status":"failed"}}]}}"#;
    assert_eq!(claim_result(response)["status"], "refused");
    let request = r#"{"canonicalProfile":"geospec-jcs-v1","method":"submitClaims","plan":{"subjects":[{"slot":"subject","subjectHash":"old"}],"claims":[{"payload":{"subjectHash":"old"}}]},"protocolVersion":3,"registryVersion":4,"requestId":"control"}"#;
    let admission = r#"{"result":{"subject":{"subjectHash":"new"}},"subjectHash":"decoy"}"#;
    let bound = bind_claim(request, admission.as_bytes());
    let rebound: Value = serde_json::from_str(&bound.json).unwrap();
    assert_eq!(bound.original_subject_hash, "old");
    assert_eq!(bound.effective_subject_hash, "new");
    assert_eq!(rebound["registryVersion"], 5);
    assert_eq!(rebound["plan"]["subjects"][0]["subjectHash"], "new");
    assert_eq!(
        rebound["plan"]["claims"][0]["payload"]["subjectHash"],
        "old"
    );
}
#[test]
fn finite_contact_local_engagement_negative_and_budget_controls() {
    let input = fixture_root();
    let table = std::fs::read_to_string(input.join("original44.tsv")).unwrap();
    let row = table
        .lines()
        .find(|l| l.contains("spark-plug-thread-positive/manifest.json#relationships[0]/positive"))
        .unwrap();
    let f: Vec<_> = row.splitn(5, '\t').collect();
    let mut engine = Engine::with_backends(
        EngineConfig::entry(),
        Box::new(OcctConnector),
        Box::new(NoCsg),
    );
    let admitted = String::from_utf8(
        engine
            .ingest_subject(
                &bind_ingest(f[3].as_bytes()),
                &std::fs::read(input.join(f[2])).unwrap(),
                vec![],
            )
            .unwrap(),
    )
    .unwrap();
    let bound = bind_claim(f[4], admitted.as_bytes());
    eprintln!(
        "FINITE_ENGAGEMENT_SUBJECT_BINDING original={} effective={}",
        bound.original_subject_hash, bound.effective_subject_hash
    );
    let original = bound.json;
    // Separate requests, not edits to the original table/fixtures. Opposite
    // radial fit reverses the two genuinely admitted faces, not their labels
    // inside any candidate algorithm.
    let radial = original
        .replace(
            "\"subject\":\"plug.thread\"",
            "\"subject\":\"head.plugBore\"",
        )
        .replace("\"target\":\"head.plugBore\"", "\"target\":\"plug.thread\"");
    let cases = [
        (
            "too-shallow",
            original.replace("\"min\":14.5", "\"min\":17"),
            "failed",
        ),
        (
            "too-deep",
            original.replace("\"max\":19", "\"max\":15"),
            "failed",
        ),
        ("radial-misfit", radial, "failed"),
        (
            "zero-axis",
            original.replace("\"axis\":[0,0,-1]", "\"axis\":[0,0,0]"),
            "refused",
        ),
        (
            "budget",
            original.replace("\"workUnitBudget\":8000000", "\"workUnitBudget\":1"),
            "refused",
        ),
    ];
    let mut outcomes = Vec::new();
    for (name, request, expected) in cases {
        assert_ne!(request, original);
        let result = engine
            .process_request(request.as_bytes())
            .map(|v| String::from_utf8(v).unwrap());
        eprintln!("FINITE_ENGAGEMENT_CONTROL {name} expected={expected} {result:?}");
        outcomes.push((name, expected, result));
    }
    for (name, expected, result) in outcomes {
        // Invalid zero direction may be refused by request admission rather
        // than yielding a proof. Neither path produces an invertible result.
        if name == "zero-axis" {
            if let Err(error) = &result {
                assert!(
                    matches!(
                        error.code(),
                        "invalid-claim" | "invalid-request" | "invalid-number"
                    ),
                    "{error}"
                );
                continue;
            }
        }
        let result = result.unwrap();
        let claim = claim_result(&result);
        assert_eq!(claim["status"], expected, "{name}: {result}");
        if name == "budget" {
            assert!(claim["diagnostics"]
                .as_array()
                .unwrap()
                .iter()
                .any(|d| d["code"] == "MATCHER_TIMEOUT"));
        }
        if expected == "failed" {
            assert_eq!(
                claim["evidence"]["witnesses"]["relationships"][0]["final"]["method"],
                "exact-local-band-engagement"
            );
        }
    }
}
#[test]
fn finite_contact_adapter_boundary_receipts() {
    let input = fixture_root();
    let table = std::fs::read_to_string(input.join("original44.tsv")).unwrap();
    let mut observed = Vec::new();
    for name in [
        "contact/flange-face-positive/",
        "contact/plug-seat-positive/",
        "contact/valve-seat-cone-positive/",
    ] {
        let row = table.lines().find(|line| line.contains(name)).unwrap();
        let fields: Vec<_> = row.splitn(5, '\t').collect();
        let document = Document::from_step(&std::fs::read(input.join(fields[2])).unwrap()).unwrap();
        for faces in document.reported_faces(false).unwrap().occurrence_faces {
            for face in faces.iter() {
                if matches!(
                    face.facts.surface,
                    geospec_engine_native_occt::SurfaceFacts::Plane { .. }
                        | geospec_engine_native_occt::SurfaceFacts::Cone { .. }
                ) {
                    let result = document.finite_contact_face(face.entity);
                    eprintln!("FINITE_CONTACT_BOUNDARY {name} {result:#?}");
                    observed.push((face.entity, face.facts.index, result));
                }
            }
        }
    }
    assert!(observed
        .iter()
        .any(|(_, _, r)| r.as_ref().is_ok_and(|f| f.kind == 1 && f.circle_count == 2)));
    assert!(observed.iter().any(|(_, _, r)| r
        .as_ref()
        .is_ok_and(|f| f.kind == 0 && f.vertex_count == 0 && f.circle_count == 2)));
    assert!(observed
        .iter()
        .any(|(_, _, r)| r.as_ref().is_ok_and(|f| f.vertex_count == 4)));
    for (entity, ordinal, result) in observed {
        if let Ok(face) = result {
            assert_eq!(face.public_face_ordinal, ordinal);
            assert_eq!(
                entity,
                BrepEntity::Face {
                    occurrence: face.occurrence,
                    face: face.private_query_face
                }
            );
            assert_ne!(face.source_face_entity, 0);
            assert!(
                face.attachment_residual.is_finite() && face.attachment_residual <= face.tolerance
            );
            for i in 0..face.vertex_count as usize {
                let line = face.lines[i];
                assert_ne!(line.edge_index, 0);
                assert_eq!(
                    line.end_vertex,
                    face.lines[(i + 1) % face.vertex_count as usize].start_vertex
                );
                assert!(line.range[0] < line.range[1]);
                assert!(
                    line.attachment_residual
                        <= line
                            .edge_tolerance
                            .max(line.vertex_tolerances[0])
                            .max(line.vertex_tolerances[1])
                            .max(face.face_tolerance)
                );
            }
            for circle in &face.circles[..face.circle_count as usize] {
                assert!(
                    circle.radius > 0.
                        && circle.range[0] < circle.range[1]
                        && circle.attachment_residual <= circle.tolerance
                );
            }
        }
    }
}
#[test]
fn finite_contact_engagement_original44_capture_before_assertions() {
    let input = fixture_root();
    let table = std::fs::read_to_string(input.join("original44.tsv")).unwrap();
    let mut observations = Vec::new();
    for (index, line) in table.lines().enumerate() {
        let f: Vec<_> = line.splitn(5, '\t').collect();
        let id = f[0];
        let expected = f[1];
        let observed = std::panic::catch_unwind(std::panic::AssertUnwindSafe(
            || -> Result<String, String> {
                let bytes = std::fs::read(input.join(f[2])).map_err(|e| e.to_string())?;
                if index == 0 {
                    let doc = Document::from_step(&bytes).map_err(|e| format!("{e:?}"))?;
                    let wrong = doc.finite_contact_face(BrepEntity::WholeFace(1));
                    eprintln!("FINITE_CONTACT_CONTROL whole-face {wrong:?}");
                    if wrong.is_ok() {
                        return Err(
                            "WholeFace incorrectly admitted without occurrence route".into()
                        );
                    }
                }
                let mut engine = Engine::with_backends(
                    EngineConfig::entry(),
                    Box::new(OcctConnector),
                    Box::new(NoCsg),
                );
                let admission = String::from_utf8(
                    engine
                        .ingest_subject(&bind_ingest(f[3].as_bytes()), &bytes, vec![])
                        .map_err(|e| e.to_string())?,
                )
                .map_err(|e| e.to_string())?;
                eprintln!("FINITE_CONTACT_ADMISSION {index} {admission}");
                let bound = bind_claim(f[4], admission.as_bytes());
                eprintln!(
                    "FINITE_CONTACT_SUBJECT_BINDING {index} original={} effective={}",
                    bound.original_subject_hash, bound.effective_subject_hash
                );
                let effective = bound.json;
                eprintln!("FINITE_CONTACT_REQUEST {index} {effective}");
                String::from_utf8(
                    engine
                        .process_request(effective.as_bytes())
                        .map_err(|e| e.to_string())?,
                )
                .map_err(|e| e.to_string())
            },
        ))
        .unwrap_or_else(|_| {
            Err("Candidate panicked; remaining original rows are still captured.".into())
        });
        eprintln!("FINITE_CONTACT_OBSERVATION {index} {id} expected={expected} {observed:?}");
        observations.push((id.to_owned(), expected.to_owned(), observed));
    }
    // All original requests have run and every admission/result has been
    // emitted before any assertion can erase the remaining outcomes.
    assert_eq!(observations.len(), 44);
    let failures: Vec<_> = observations
        .iter()
        .filter(|(_, expected, result)| {
            result
                .as_ref()
                .map_or(true, |r| claim_result(r)["status"] != expected.as_str())
        })
        .collect();
    for (id, _, result) in &observations {
        if let Ok(result) = result {
            let claim = claim_result(result);
            if matches!(claim["status"].as_str(), Some("passed" | "failed")) {
                let relationships = claim["evidence"]["witnesses"]["relationships"]
                    .as_array()
                    .unwrap();
                assert_eq!(relationships.len(), 1);
                let final_evidence = &relationships[0]["final"];
                assert!(matches!(
                    final_evidence["method"].as_str(),
                    Some("exact-nominal-finite-contact" | "exact-local-band-engagement")
                ));
                if id.contains("spark-plug-thread-positive") && id.contains("relationships[0]") {
                    assert_eq!(
                        final_evidence["witnesses"][0]["decision"]["depth"],
                        json!({"denominator":"1","display":16,"numerator":"16"}),
                        "Exact local engagement must remain sixteen: {result}"
                    );
                }
            }
        }
    }
    assert!(
        failures.is_empty(),
        "original finite contact/engagement failures: {failures:#?}"
    );
}
