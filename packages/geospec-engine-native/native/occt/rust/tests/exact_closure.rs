//! V1/M1 end to end: STEP `toBeWatertight` and `toHaveMeshIntegrity` answer
//! from the exact shell-closure facet (one BRep unit, no tessellation), and
//! STEP integrity refuses the mesh-only options. Expected counts are O2's
//! independent v1 probe rows (2026-09-26 OCCT substrate run).
use geospec_engine_native_core::backend::{csg::*, BackendError, TriangleMesh};
use geospec_engine_native_core::{Engine, EngineConfig};
use geospec_engine_native_occt::OcctConnector;
use serde_json::{json, Value};
use std::path::PathBuf;

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

/// (fixture, open-boundary edges, non-manifold edges, shells, failing shells)
const CLOSURE: [(&str, u64, u64, u64, usize); 6] = [
    ("ap242-box.step", 0, 0, 1, 0),
    ("two-cube-assembly.step", 0, 0, 2, 0),
    ("component-interference/original.step", 0, 0, 2, 0),
    ("component-interference/broken-shell.step", 2, 0, 1, 1),
    ("component-interference/missing-cap.step", 2, 0, 1, 1),
    ("regular-solid-controls.step", 4, 0, 6, 1),
];

const MESH_ONLY: [&str; 4] = [
    "finitePositions",
    "degenerateTriangles",
    "duplicateFaces",
    "triangleCount",
];

fn admitted(name: &str) -> (Engine, String) {
    let source = std::fs::read(
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("tests/fixtures")
            .join(name),
    )
    .expect("retained fixture must be readable");
    let mut engine = Engine::with_backends(
        EngineConfig::entry(),
        Box::new(OcctConnector),
        Box::new(NoCsg),
    );
    let ingest = serde_json::to_vec(&json!({
        "method": "ingestSubject", "requestId": "closure", "protocolVersion": 3,
        "registryVersion": 5, "canonicalProfile": "geospec-jcs-v1", "format": "step",
        "frame": {"coordinateSystem": "z-up", "sourceUnit": "auto", "outputUnit": "mm"},
        "ingestOptions": {}, "primaryByteLength": source.len(), "resources": []
    }))
    .unwrap();
    let admission: Value =
        serde_json::from_slice(&engine.ingest_subject(&ingest, &source, vec![]).unwrap()).unwrap();
    let hash = admission["result"]["subject"]["subjectHash"]
        .as_str()
        .unwrap_or_else(|| panic!("{name} must admit: {admission}"))
        .to_owned();
    (engine, hash)
}

/// One positive claim, cold and warm; the result and the observations after it.
fn claim(engine: &Engine, hash: &str, capability: &str, payload: Value) -> (Value, Value) {
    let request = serde_json::to_vec(&json!({
        "method": "submitClaims", "requestId": "closure-query", "protocolVersion": 3,
        "registryVersion": 5, "canonicalProfile": "geospec-jcs-v1",
        "plan": {"subjects": [{"slot": "subject", "subjectHash": hash}], "claims": [{
            "claimId": "c", "capability": capability, "subjectSlots": ["subject"],
            "payload": payload, "polarity": "positive", "workUnitBudget": 8000000
        }]}
    }))
    .unwrap();
    let cold = engine.process_request(&request).unwrap();
    let observations: Value = serde_json::from_slice(&engine.observations()).unwrap();
    assert_eq!(
        cold,
        engine.process_request(&request).unwrap(),
        "cold/warm exact canonical equality"
    );
    let envelope: Value = serde_json::from_slice(&cold).unwrap();
    (envelope["result"]["results"][0].clone(), observations)
}

/// The exact route never builds a report mesh or tessellates, and charges the
/// single BRep unit (or nothing when it refuses first).
fn assert_exact_work(name: &str, observations: &Value, charged: &str) {
    for counter in ["meshRecords", "reportBuilds", "tessellations"] {
        assert_eq!(
            observations["physical"][counter], "0",
            "{name}: {counter} in {observations}"
        );
    }
    assert_eq!(
        observations["logical"]["chargedUnits"], charged,
        "{name}: {observations}"
    );
}

#[test]
fn step_watertight_answers_from_the_exact_closure_facet() {
    for (name, open, nonmanifold, shells, failing) in CLOSURE {
        let (engine, hash) = admitted(name);
        let (result, observations) = claim(
            &engine,
            &hash,
            "toBeWatertight",
            json!({"kind": "watertight", "expected": true}),
        );
        let watertight = open == 0 && nonmanifold == 0;
        assert_eq!(
            result["status"],
            if watertight { "passed" } else { "failed" },
            "{name}: {result}"
        );
        let evidence = &result["evidence"];
        assert_eq!(evidence["profile"], "geospec-original24-v1");
        assert_eq!(evidence["normalizedExpected"], true);
        assert_eq!(
            evidence["measured"],
            json!({
                "watertight": watertight, "openBoundaryEdges": open,
                "nonManifoldEdges": nonmanifold, "shells": shells, "freeFaces": 0
            }),
            "{name}"
        );
        let rows = evidence["witnesses"]["failingShells"].as_array().unwrap();
        assert_eq!(rows.len(), failing, "{name}: {rows:?}");
        for row in rows {
            assert_eq!(row["kind"], "shell", "{name}");
            assert_eq!(row["openBoundaryEdges"], open, "{name}");
            let samples = row["samples"].as_array().unwrap();
            assert_eq!(samples.len() as u64, open.min(4), "{name}");
            for sample in samples {
                assert_eq!(sample["kind"], "open-boundary", "{name}");
                assert_eq!(sample["faceUses"], 1, "{name}");
                assert_eq!(sample["center"].as_array().unwrap().len(), 3, "{name}");
            }
            let occurrences = row["occurrences"].as_array().unwrap();
            assert!(
                !occurrences.is_empty() && occurrences.iter().all(Value::is_string),
                "{name}: a failing shell names its leaf occurrences: {row}"
            );
        }
        if watertight {
            assert!(
                result["diagnostics"].as_array().unwrap().is_empty(),
                "{name}"
            );
        } else {
            let diagnostic = &result["diagnostics"][0];
            assert_eq!(diagnostic["code"], "GEOSPEC_WATERTIGHT_MISMATCH", "{name}");
            assert_eq!(
                diagnostic["details"]["failingShells"],
                json!(rows),
                "{name}"
            );
        }
        assert_exact_work(name, &observations, "1");
    }
}

#[test]
fn step_integrity_refuses_mesh_only_options_before_any_work() {
    let (engine, hash) = admitted("component-interference/original.step");
    // The m3 authority payload: every option, declared as the mesh route passed it.
    let (result, observations) = claim(
        &engine,
        &hash,
        "toHaveMeshIntegrity",
        json!({"kind": "meshIntegrity", "expected": {
            "degenerateTriangles": {"maxCount": 0}, "duplicateFaces": {"maxCount": 0},
            "finitePositions": true, "triangleCount": 1276, "watertight": true
        }}),
    );
    assert_eq!(result["status"], "refused", "{result}");
    assert!(result.get("evidence").is_none());
    let diagnostic = &result["diagnostics"][0];
    assert_eq!(diagnostic["code"], "GEOSPEC_UNSUPPORTED_EVIDENCE");
    assert_eq!(
        diagnostic["details"],
        json!({"matcher": "toHaveMeshIntegrity", "unsupported": MESH_ONLY})
    );
    assert_exact_work("mesh-only refusal", &observations, "0");
    // Each option refuses on its own.
    for (option, value) in [
        ("finitePositions", json!(true)),
        ("degenerateTriangles", json!({"maxCount": 0})),
        ("duplicateFaces", json!({"maxCount": 0})),
        ("triangleCount", json!(12)),
    ] {
        let (result, _) = claim(
            &engine,
            &hash,
            "toHaveMeshIntegrity",
            json!({"kind": "meshIntegrity", "expected": {option: value}}),
        );
        assert_eq!(result["status"], "refused", "{option}: {result}");
        assert_eq!(
            result["diagnostics"][0]["details"]["unsupported"],
            json!([option])
        );
    }
}

#[test]
fn step_integrity_watertight_routes_to_the_exact_closure_facet() {
    for (name, status, open) in [
        ("ap242-box.step", "passed", false),
        ("component-interference/broken-shell.step", "failed", true),
    ] {
        let (engine, hash) = admitted(name);
        let (result, observations) = claim(
            &engine,
            &hash,
            "toHaveMeshIntegrity",
            json!({"kind": "meshIntegrity", "expected": {"watertight": true}}),
        );
        assert_eq!(result["status"], status, "{name}: {result}");
        assert_eq!(
            result["evidence"]["measured"],
            json!({"watertight": !open}),
            "{name}"
        );
        assert_eq!(
            result["evidence"]["witnesses"]["failingShells"]
                .as_array()
                .unwrap()
                .len(),
            usize::from(open),
            "{name}"
        );
        if open {
            let diagnostic = &result["diagnostics"][0];
            assert_eq!(diagnostic["code"], "GEOSPEC_MESH_INTEGRITY_MISMATCH");
            assert_eq!(
                diagnostic["details"]["failures"],
                json!(["watertight is false, not the declared true"])
            );
        }
        assert_exact_work(name, &observations, "1");
    }
    // Nothing declared: vacuous, and no work at all.
    let (engine, hash) = admitted("ap242-box.step");
    let (result, observations) = claim(
        &engine,
        &hash,
        "toHaveMeshIntegrity",
        json!({"kind": "meshIntegrity", "expected": {}}),
    );
    assert_eq!(result["status"], "passed", "{result}");
    assert_eq!(result["evidence"]["measured"], json!({}));
    assert_exact_work("vacuous integrity", &observations, "0");
}

#[test]
fn step_validity_reads_the_closure_facet() {
    for (name, open, ..) in CLOSURE {
        let (engine, hash) = admitted(name);
        let (result, _) = claim(
            &engine,
            &hash,
            "toBeValidBrep",
            json!({"kind": "validBrep", "expected": {}}),
        );
        let measured = &result["evidence"]["measured"];
        assert_eq!(measured["freeBounds"]["count"], open, "{name}: {result}");
        assert_eq!(measured["nonManifoldEdgeCount"], 0, "{name}");
        if open != 0 {
            assert_eq!(measured["closedShells"], false, "{name}");
        }
    }
}
