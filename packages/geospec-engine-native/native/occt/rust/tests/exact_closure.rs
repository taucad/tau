//! V1/M1 end to end: STEP `toBeWatertight` and `toHaveMeshIntegrity` answer
//! from the exact shell-closure facet (one BRep unit, no tessellation; naming
//! failing groups costs a unit per group and per occurrence, R4-2), and STEP
//! integrity refuses the mesh-only options. Expected counts are O2's
//! independent v1 probe rows (2026-09-26 OCCT substrate run). Ruling 32:
//! tessellated-only products (faces with no surface) refuse every exact
//! claim, and the facet never proves a faceless or edgeless subject closed.
use geospec_engine_native_core::backend::{csg::*, BackendError, TriangleMesh};
use geospec_engine_native_core::{Engine, EngineConfig};
use geospec_engine_native_occt::{BrepSubject, Document, OcctConnector};
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

fn fixture(name: &str) -> Vec<u8> {
    std::fs::read(
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("tests/fixtures")
            .join(name),
    )
    .expect("retained fixture must be readable")
}

fn admitted(name: &str) -> (Engine, String) {
    let source = fixture(name);
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
    claim_with(engine, hash, capability, payload, "positive", 8_000_000)
}

fn claim_with(
    engine: &Engine,
    hash: &str,
    capability: &str,
    payload: Value,
    polarity: &str,
    budget: u64,
) -> (Value, Value) {
    let request = serde_json::to_vec(&json!({
        "method": "submitClaims", "requestId": "closure-query", "protocolVersion": 3,
        "registryVersion": 5, "canonicalProfile": "geospec-jcs-v1",
        "plan": {"subjects": [{"slot": "subject", "subjectHash": hash}], "claims": [{
            "claimId": "c", "capability": capability, "subjectSlots": ["subject"],
            "payload": payload, "polarity": polarity, "workUnitBudget": budget
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
/// BRep unit plus the failing groups' naming (or nothing when it refuses first).
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
        assert_exact_work(name, &observations, &closure_charge(name, failing));
    }
}

/// The BRep unit, plus a unit per failing group and per occurrence when a
/// group fails and its leaf occurrences are named (R4-2).
fn closure_charge(name: &str, failing: usize) -> String {
    let occurrences = Document::from_step(&fixture(name))
        .unwrap()
        .source_occurrence_structure()
        .unwrap()
        .len();
    (1 + if failing == 0 {
        0
    } else {
        failing + occurrences
    })
    .to_string()
}

#[test]
fn naming_failing_groups_is_charged_before_it_runs_warm_or_cold() {
    // R4-2 (rulings 23 and 28): one pass over the occurrences names every
    // failing group's leaves. It is charged before it runs, so a budget one
    // short refuses cold and warm alike, and the exact budget answers.
    let name = "regular-solid-controls.step";
    let payload = json!({"kind": "watertight", "expected": true});
    let units: u64 = closure_charge(name, 1).parse().unwrap();
    let (engine, hash) = admitted(name);
    let (result, observations) = claim_with(
        &engine,
        &hash,
        "toBeWatertight",
        payload.clone(),
        "positive",
        units - 1,
    );
    assert_eq!(result["status"], "refused", "{result}");
    let diagnostic = &result["diagnostics"][0];
    assert_eq!(diagnostic["code"], "MATCHER_TIMEOUT", "{result}");
    assert_eq!(diagnostic["details"]["unitsUsed"], units, "{result}");
    assert_exact_work(name, &observations, "1");
    let (result, _) = claim_with(&engine, &hash, "toBeWatertight", payload, "positive", units);
    assert_eq!(result["status"], "failed", "{result}");
    let rows = result["evidence"]["witnesses"]["failingShells"]
        .as_array()
        .unwrap();
    assert_eq!(rows.len(), 1, "{result}");
    assert!(!rows[0]["occurrences"].as_array().unwrap().is_empty());
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
        assert_exact_work(
            name,
            &observations,
            &closure_charge(name, usize::from(open)),
        );
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

/// Every capability that measures the admitted faces or edges, with a valid
/// payload (the bench authority cases' shapes).
fn exact_claims() -> Vec<(&'static str, Value)> {
    vec![
        (
            "toHaveBoundingBox",
            json!({"kind": "boundingBox", "expected": {"size": [10, 20, 30], "tolerance": 0.001}}),
        ),
        (
            "toHaveConnectedComponents",
            json!({"kind": "connectedComponents", "expected": {"count": 1, "toleranceMm": 0.001}}),
        ),
        (
            "toBeWatertight",
            json!({"kind": "watertight", "expected": true}),
        ),
        (
            "toHaveNoComponentInterference",
            json!({"kind": "componentInterference", "expected": {}}),
        ),
        (
            "toHaveAssemblyOccurrences",
            json!({"kind": "assemblyOccurrences", "expected": {"occurrences": [{"count": 1, "name": "Product 1"}]}}),
        ),
        (
            "toHaveSpatialRelationships",
            json!({"kind": "spatialRelationships", "expected": {"relationships": [{"kind": "clearance", "max": 0.3, "min": 0.1, "subject": "bolt.shank", "target": "plate.hole", "tolerance": 0.001}]}}),
        ),
        (
            "toHaveMeshIntegrity",
            json!({"kind": "meshIntegrity", "expected": {}}),
        ),
        (
            "toHaveSurfaceArea",
            json!({"kind": "surfaceArea", "expected": {"value": 2200, "tolerance": 0.001}}),
        ),
        (
            "toHaveVolume",
            json!({"kind": "volume", "expected": {"value": 6000, "tolerance": 0.001}}),
        ),
        (
            "toHaveMass",
            json!({"kind": "mass", "expected": {"density": 1, "value": 6000, "tolerance": 0.001}}),
        ),
        (
            "toHaveCenterOfMass",
            json!({"kind": "centerOfMass", "expected": {"point": [5, 10, 15], "tolerance": 0.001}}),
        ),
        (
            "toBeValidBrep",
            json!({"kind": "validBrep", "expected": {}}),
        ),
        (
            "toHaveTopologyCounts",
            json!({"kind": "topologyCounts", "expected": {}}),
        ),
        (
            "toHavePlanarFace",
            json!({"kind": "planarFace", "expected": {"normal": [0, 0, 1], "offset": 0}}),
        ),
        (
            "toHaveCylindricalFace",
            json!({"kind": "cylindricalFace", "expected": {"axis": "z", "radius": 1}}),
        ),
        (
            "toHaveCircularHole",
            json!({"kind": "circularHole", "expected": {"axis": "z", "diameter": 1}}),
        ),
        (
            "toHaveCircularHolePattern",
            json!({"kind": "circularHolePattern", "expected": {"count": 1, "holeDiameter": 1}}),
        ),
        (
            "toHaveChamferFeature",
            json!({"kind": "chamferFeature", "expected": {"distance": 1}}),
        ),
        (
            "toHaveFilletFeature",
            json!({"kind": "filletFeature", "expected": {"radius": 1}}),
        ),
        (
            "toHaveMinimumWallThickness",
            json!({"kind": "minimumWallThickness", "expected": {"value": {"greaterThanOrEqual": 5}}}),
        ),
        (
            "toHaveVoidContinuity",
            json!({"kind": "voidContinuity", "expected": {"material": ["guide"], "minCrossSection": 1, "path": [[0, 0, 3], [0, 0, 42]]}}),
        ),
        (
            "toSatisfyParallelPlaneDistance",
            json!({"contract": "geospec.pmi.parallel-plane-distance/v1"}),
        ),
        ("analyzeBrep", Value::Null),
        ("inspectGeometry", json!({"selectors": ["housing.bore"]})),
        ("analyzeMeshOverlap", json!({"tolerance": 0.001})),
    ]
}

#[test]
fn tessellated_only_products_refuse_every_exact_claim_before_any_work() {
    // Ruling 32: faces with no surface (a TESSELLATED_SOLID read under
    // OnNoBRep) carry no exact geometry. Head measured volume on the file's
    // triangles as "brep", passed the open box as watertight and counted zero
    // components; every exact claim now refuses with one named refusal.
    for (name, surfaceless) in [
        ("read-profile/tess-only-open.step", 5),
        ("read-profile/tess-only-closed.step", 6),
        ("read-profile/box-tessellated-only.step", 6),
    ] {
        let document = Document::from_step(&fixture(name)).unwrap();
        assert_eq!(
            document.admission_facts().unwrap().surfaceless_faces,
            surfaceless
        );
        for (capability, payload) in exact_claims() {
            let (engine, hash) = admitted(name);
            let (result, observations) = claim(&engine, &hash, capability, payload);
            assert_eq!(result["status"], "refused", "{name} {capability}: {result}");
            assert!(result.get("evidence").is_none(), "{name} {capability}");
            let diagnostics = result["diagnostics"].as_array().unwrap();
            assert_eq!(diagnostics.len(), 1, "{name} {capability}: {result}");
            assert_eq!(diagnostics[0]["code"], "GEOSPEC_EVIDENCE_UNSUPPORTED");
            assert_eq!(
                diagnostics[0]["details"],
                json!({
                    "matcher": capability, "missing": "exact BRep geometry",
                    "surfacelessFaces": surfaceless
                }),
                "{name} {capability}"
            );
            assert_exact_work(&format!("{name} {capability}"), &observations, "0");
        }
        // Units, product structure and subject diagnostics read no face.
        let (engine, hash) = admitted(name);
        for (capability, payload) in [
            (
                "toHaveStepUnits",
                json!({"kind": "stepUnits", "expected": {"unit": "mm"}}),
            ),
            (
                "toHaveProductStructure",
                json!({"kind": "productStructure", "expected": {"count": 0}}),
            ),
            (
                "toHaveNoDiagnostics",
                json!({"kind": "noDiagnostics", "expected": {}}),
            ),
        ] {
            let (result, _) = claim(&engine, &hash, capability, payload);
            assert_eq!(result["status"], "passed", "{name} {capability}: {result}");
        }
    }
    // A BRep read beside its linked tessellation keeps exact faces only.
    let document =
        Document::from_step(&fixture("read-profile/box-brep-plus-tessellation.step")).unwrap();
    assert_eq!(document.admission_facts().unwrap().surfaceless_faces, 0);
}

#[test]
fn the_facet_never_proves_a_faceless_or_edgeless_group_closed() {
    // A shell whose faces have no counted edge use proves nothing closed.
    let document = Document::from_step(&fixture("read-profile/tess-only-closed.step")).unwrap();
    let closure = BrepSubject::closure(&document, &mut |_| true)
        .unwrap()
        .unwrap();
    assert_eq!(
        (
            closure.shells,
            closure.free_faces,
            closure.open_edges,
            closure.nonmanifold_edges
        ),
        (1, 0, 0, 0)
    );
    assert_eq!(closure.failing.len(), 1);
    let group = &closure.failing[0];
    assert!(!group.free_faces && group.samples.is_empty());
    assert_eq!((group.open_edges, group.nonmanifold_edges), (0, 0));
    assert_eq!(
        BrepSubject::validity(&document).unwrap().closed_shells,
        Some(false)
    );

    // A product with an edge and no face encloses nothing: W2B's mesh route
    // failed it (no welded edge), and the exact route fails it again.
    let name = "read-profile/wireframe-only.step";
    let document = Document::from_step(&fixture(name)).unwrap();
    assert_eq!(document.admission_facts().unwrap().surfaceless_faces, 0);
    let closure = BrepSubject::closure(&document, &mut |_| true)
        .unwrap()
        .unwrap();
    assert_eq!((closure.shells, closure.free_faces), (0, 0));
    assert!(closure.failing.is_empty());
    let (engine, hash) = admitted(name);
    let (result, observations) = claim(
        &engine,
        &hash,
        "toBeWatertight",
        json!({"kind": "watertight", "expected": true}),
    );
    assert_eq!(result["status"], "failed", "{result}");
    assert_eq!(
        result["evidence"]["measured"],
        json!({"watertight": false, "openBoundaryEdges": 0, "nonManifoldEdges": 0, "shells": 0, "freeFaces": 0})
    );
    assert_eq!(result["evidence"]["witnesses"]["failingShells"], json!([]));
    let diagnostic = &result["diagnostics"][0];
    assert_eq!(diagnostic["code"], "GEOSPEC_WATERTIGHT_MISMATCH");
    assert_eq!(
        diagnostic["message"],
        "The exact BRep topology has no face, so it encloses no closed manifold surface."
    );
    assert_exact_work(name, &observations, "1");
    let (result, _) = claim_with(
        &engine,
        &hash,
        "toBeWatertight",
        json!({"kind": "watertight", "expected": true}),
        "negative",
        8_000_000,
    );
    assert_eq!(result["status"], "passed", "{result}");
    let (result, _) = claim(
        &engine,
        &hash,
        "toHaveMeshIntegrity",
        json!({"kind": "meshIntegrity", "expected": {"watertight": true}}),
    );
    assert_eq!(result["status"], "failed", "{result}");
    assert_eq!(result["evidence"]["measured"], json!({"watertight": false}));
}
