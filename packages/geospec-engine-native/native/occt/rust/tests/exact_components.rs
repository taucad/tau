//! M2 (rulings 5 and 28): STEP connected components answer from the retained
//! BRep's exact distances, not from a tessellation's box overlaps.
use std::path::PathBuf;

use geospec_engine_native_core::{
    backend::{csg::*, BackendError, TriangleMesh},
    Engine, EngineConfig,
};
use geospec_engine_native_occt::{
    BrepConnector, BrepSubject, Document, OcctConnector, ParallelOcctConnector,
};
use serde_json::{json, Value};

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

fn workspace(relative: &str) -> Vec<u8> {
    let root = std::env::var_os("GEOSPEC_ADAPTER_WORKSPACE")
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .ancestors()
                .nth(5)
                .expect("OCCT crate must remain below the workspace root")
                .to_path_buf()
        });
    std::fs::read(root.join(relative)).expect("workspace fixture must be readable")
}

/// One toHaveConnectedComponents result at 0.001 mm on a fresh engine.
fn components(
    connector: Box<dyn BrepConnector>,
    source: &[u8],
    count: u64,
    budget: u64,
    bounded: bool,
) -> Value {
    charged_components(connector, source, count, budget, bounded).0
}

/// The result and the work units its claim charged.
fn charged_components(
    connector: Box<dyn BrepConnector>,
    source: &[u8],
    count: u64,
    budget: u64,
    bounded: bool,
) -> (Value, u64) {
    let mut engine = Engine::with_backends(EngineConfig::entry(), connector, Box::new(NoCsg));
    let ingest = serde_json::to_vec(&json!({
        "method": "ingestSubject", "requestId": "cc", "protocolVersion": 3,
        "registryVersion": 5, "canonicalProfile": "geospec-jcs-v1", "format": "step",
        "frame": {"coordinateSystem": "z-up", "sourceUnit": "auto", "outputUnit": "mm"},
        "ingestOptions": {}, "primaryByteLength": source.len(), "resources": []
    }))
    .unwrap();
    let admission: Value =
        serde_json::from_slice(&engine.ingest_subject(&ingest, source, vec![]).unwrap()).unwrap();
    let mut plan = json!({
        "subjects": [{"slot": "part",
            "subjectHash": admission["result"]["subject"]["subjectHash"]}],
        "claims": [{
            "claimId": "cc", "capability": "toHaveConnectedComponents", "subjectSlots": ["part"],
            "payload": {"kind": "connectedComponents",
                "expected": {"count": count, "toleranceMm": 0.001}},
            "polarity": "positive", "workUnitBudget": budget
        }]
    });
    if bounded {
        plan["evidenceProfile"] = json!("bounded");
    }
    let request = serde_json::to_vec(&json!({
        "method": "submitClaims", "requestId": "cc", "protocolVersion": 3,
        "registryVersion": 5, "canonicalProfile": "geospec-jcs-v1", "plan": plan
    }))
    .unwrap();
    let response: Value =
        serde_json::from_slice(&engine.process_request(&request).unwrap()).unwrap();
    let observations: Value = serde_json::from_slice(&engine.observations()).unwrap();
    let charged = observations["logical"]["chargedUnits"]
        .as_str()
        .unwrap()
        .parse()
        .unwrap();
    (response["result"]["results"][0].clone(), charged)
}

const DESIGNED: [(&str, u64); 9] = [
    ("clearance/bolt-clearance-hole-positive", 2),
    ("clearance/shaft-bore-radial-positive", 2),
    ("clearance/shaft-bore-too-loose-negative", 2),
    ("clearance/shaft-bore-too-tight-negative", 2),
    ("clearance/piston-bore-skirt-positive", 2),
    ("containment/filter-inside-housing-positive", 2),
    ("containment/aabb-inside-false-positive", 2),
    ("containment/pin-through-boss-positive", 4),
    ("containment/pin-partial-insertion-negative", 4),
];

#[test]
fn designed_clearance_fixtures_count_their_disjoint_bodies() {
    for (fixture, count) in DESIGNED {
        let source = workspace(&format!(
            "packages/geospec-engine/fixtures/{fixture}/model.step"
        ));
        let result = components(Box::new(OcctConnector), &source, count, 8_000_000, false);
        assert_eq!(result["status"], "passed", "{fixture}: {result}");
        assert_eq!(result["evidence"]["measured"]["count"], count, "{fixture}");
        assert_eq!(
            result["evidence"]["witnesses"]["clusters"]
                .as_array()
                .unwrap()
                .len() as u64,
            count
        );
    }
}

#[test]
fn a_granted_whole_body_distance_keeps_the_serial_verdicts() {
    // SAFETY: this test binary owns its OCCT closure; every test here uses
    // the same caller-inclusive two-CPU grant and runs on one thread.
    for (fixture, count) in DESIGNED {
        let source = workspace(&format!(
            "packages/geospec-engine/fixtures/{fixture}/model.step"
        ));
        let connector = unsafe { ParallelOcctConnector::new().unwrap() };
        let result = components(Box::new(connector), &source, count, 8_000_000, false);
        assert_eq!(result["status"], "passed", "{fixture}: {result}");
    }
}

#[test]
fn interfering_bodies_stay_one_component() {
    let source = std::fs::read(
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("tests/fixtures/component-interference/original.step"),
    )
    .unwrap();
    let result = components(Box::new(OcctConnector), &source, 1, 8_000_000, false);
    assert_eq!(result["status"], "passed", "{result}");
}

#[test]
fn every_native_step_is_charged_before_it_runs() {
    let source = workspace(
        "packages/geospec-engine/fixtures/containment/pin-through-boss-positive/model.step",
    );
    let refusal = |budget: u64| {
        let result = components(Box::new(OcctConnector), &source, 4, budget, false);
        assert_eq!(result["status"], "refused", "{result}");
        let details = result["diagnostics"][0]["details"].clone();
        assert_eq!(result["diagnostics"][0]["code"], "MATCHER_TIMEOUT");
        assert_eq!(details["budget"], budget);
        details
    };
    // One unit pays the BRep gate, so the face boxes' charge crosses before
    // any box is measured, and names no pair.
    let setup = refusal(1);
    assert!(setup.get("pair").is_none(), "{setup}");
    let boxes = setup["unitsUsed"].as_u64().unwrap();
    assert!(boxes > 1, "{setup}");
    // With exactly the gate and the boxes, the first pair's charge crosses.
    let pair = refusal(boxes);
    let names = pair["pair"].as_array().unwrap();
    assert_eq!(names.len(), 2);
    assert!(names.iter().all(Value::is_string), "{pair}");
    assert!(pair["unitsUsed"].as_u64().unwrap() > boxes);
    // The answer charges its exact total: one unit less refuses.
    let (result, charged) =
        charged_components(Box::new(OcctConnector), &source, 4, 8_000_000, false);
    assert_eq!(result["status"], "passed", "{result}");
    let (again, _) = charged_components(Box::new(OcctConnector), &source, 4, charged, false);
    assert_eq!(again["status"], "passed", "{again}");
    assert!(refusal(charged - 1)["unitsUsed"].as_u64().unwrap() > charged - 1);
}

#[test]
fn many_occurrences_answer_from_the_broad_phase_alone() {
    let source =
        workspace("packages/geospec-engine-native/bench/fixtures/performance-lab/generated/many-occurrences-4096.step");
    // The BRep gate and the face boxes are the only units: no pair reaches
    // the narrow phase.
    let setup = components(Box::new(OcctConnector), &source, 4096, 1, true);
    assert_eq!(
        setup["diagnostics"][0]["code"], "MATCHER_TIMEOUT",
        "{setup}"
    );
    let budget = setup["diagnostics"][0]["details"]["unitsUsed"]
        .as_u64()
        .unwrap();
    let bounded = components(Box::new(OcctConnector), &source, 4096, budget, true);
    assert_eq!(bounded["status"], "passed", "{bounded}");
    assert_eq!(bounded["evidence"]["measured"]["count"], 4096);
    assert!(bounded["evidence"]["witnesses"].get("gaps").is_none());
    // The complete profile's 8,386,560 gaps stay refused by retention.
    let complete = components(Box::new(OcctConnector), &source, 4096, budget, false);
    assert_eq!(complete["status"], "refused", "{complete}");
    assert_eq!(
        complete["diagnostics"][0]["code"],
        "GEOSPEC_UNSUPPORTED_EVIDENCE"
    );
}

#[test]
fn leaf_bodies_are_solids_with_their_exact_occurrence_boxes() {
    let document = Document::from_step(
        &std::fs::read(
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/two-cube-assembly.step"),
        )
        .unwrap(),
    )
    .unwrap();
    let occurrences = document.source_occurrences().unwrap();
    let leaves: Vec<u32> = (0..occurrences.len() as u32)
        .filter(|index| occurrences.iter().all(|value| value.parent != Some(*index)))
        .collect();
    assert_eq!(leaves.len(), 2);
    // The twelve planar faces' boxes are charged once, before any is measured.
    let mut charges = Vec::new();
    assert!(document
        .component_bodies(&leaves, &mut |units| {
            charges.push(units);
            false
        })
        .unwrap()
        .is_none());
    assert_eq!(charges, [12]);
    let bodies = document
        .component_bodies(&leaves, &mut |_| true)
        .unwrap()
        .unwrap();
    assert_eq!(bodies.bodies().len(), 2);
    for (body, leaf) in bodies.bodies().iter().zip(&leaves) {
        assert_eq!(body.occurrence, Some(*leaf));
        assert!(body.solid);
        assert_eq!((body.faces.len(), body.vertices), (6, 8));
        let exact = occurrences[*leaf as usize].bounds;
        for axis in 0..3 {
            assert_eq!(body.bounds.min[axis].to_bits(), exact.min[axis].to_bits());
            assert_eq!(body.bounds.max[axis].to_bits(), exact.max[axis].to_bits());
        }
    }
    let whole = document
        .component_bodies(&[], &mut |_| true)
        .unwrap()
        .unwrap();
    assert_eq!(whole.bodies().len(), 2);
    assert!(document
        .component_bodies(&[u32::MAX], &mut |_| true)
        .is_err());
}
