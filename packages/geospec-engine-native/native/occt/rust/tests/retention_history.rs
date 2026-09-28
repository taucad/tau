//! C8 (ruling 12, §16): a claim's retention verdict counts only what that
//! claim demands, so the same claim answers with the same bytes cold and
//! after claims that retained other facets of the subject.

use geospec_engine_native_core::backend::{csg::*, BackendError, TriangleMesh};
use geospec_engine_native_core::{Engine, EngineConfig};
use geospec_engine_native_occt::OcctConnector;
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

const SOURCE: &[u8] = include_bytes!("fixtures/two-cube-assembly.step");

/// Each claim as its own request, in order, on one engine whose analysis
/// retention limit is `limit` bytes.
fn run(limit: u64, claims: &[(&str, Value)]) -> Vec<Value> {
    let mut config = EngineConfig::entry();
    config.analysis.max_mesh_bytes = limit;
    let mut engine = Engine::with_backends(config, Box::new(OcctConnector), Box::new(NoCsg));
    let ingest = serde_json::to_vec(&json!({
        "method": "ingestSubject", "requestId": "subject", "protocolVersion": 3,
        "registryVersion": 5, "canonicalProfile": "geospec-jcs-v1", "format": "step",
        "frame": {"coordinateSystem": "z-up", "sourceUnit": "auto", "outputUnit": "mm"},
        "ingestOptions": {}, "primaryByteLength": SOURCE.len(), "resources": []
    }))
    .unwrap();
    let admission: Value =
        serde_json::from_slice(&engine.ingest_subject(&ingest, SOURCE, vec![]).unwrap()).unwrap();
    let subject = &admission["result"]["subject"]["subjectHash"];
    claims
        .iter()
        .map(|(capability, payload)| {
            let request = serde_json::to_vec(&json!({
                "method": "submitClaims", "requestId": "claim", "protocolVersion": 3,
                "registryVersion": 5, "canonicalProfile": "geospec-jcs-v1",
                "plan": {"subjects": [{"slot": "part", "subjectHash": subject}], "claims": [{
                    "claimId": "claim", "capability": capability, "subjectSlots": ["part"],
                    "payload": payload, "polarity": "positive", "workUnitBudget": 8_000_000
                }]}
            }))
            .unwrap();
            let response: Value =
                serde_json::from_slice(&engine.process_request(&request).unwrap()).unwrap();
            response["result"]["results"][0].clone()
        })
        .collect()
}

/// The least limit at which `claim` passes cold. Below the source length the
/// engine retains no source bytes, so the answer is monotone in the limit.
fn least_limit(claim: &(&str, Value)) -> u64 {
    let (mut low, mut high) = (1, SOURCE.len() as u64 - 1);
    assert_eq!(run(high, &[claim.clone()])[0]["status"], "passed");
    while low < high {
        let middle = (low + high) / 2;
        if run(middle, &[claim.clone()])[0]["status"] == "passed" {
            high = middle;
        } else {
            low = middle + 1;
        }
    }
    low
}

#[test]
fn a_claim_answers_the_same_cold_and_after_a_retaining_claim() {
    let faces = (
        "inspectGeometry",
        json!({"selectors": [{"kind": "face", "expect": "many"}]}),
    );
    let mesh = ("analyzeMesh", Value::Null);
    // Each claim fits alone; before C8 the second refused on the first's facets.
    let limit = least_limit(&faces).max(least_limit(&mesh));
    for (first, second) in [(&faces, &mesh), (&mesh, &faces)] {
        let cold = run(limit, &[second.clone()]);
        let after = run(limit, &[first.clone(), second.clone()]);
        assert_eq!(after[0]["status"], "passed", "{}", after[0]);
        assert_eq!(after[1], cold[0]);
        assert_eq!(cold[0]["status"], "passed");
    }
}
