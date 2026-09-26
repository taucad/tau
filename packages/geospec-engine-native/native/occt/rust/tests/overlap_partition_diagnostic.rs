//! A one-occurrence STEP subject cannot be partitioned for overlap. The
//! diagnostic keeps R10's `primitiveCount` (the report mesh's one primitive)
//! although overlap no longer builds that mesh to charge it (ruling 11), so
//! the count cannot depend on whether an earlier claim built the report.

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

#[test]
fn one_occurrence_overlap_reports_the_report_mesh_primitive_count_first() {
    let source = include_bytes!("fixtures/ap242-box.step");
    let mut engine = Engine::with_backends(
        EngineConfig::entry(),
        Box::new(OcctConnector),
        Box::new(NoCsg),
    );
    let ingest = serde_json::to_vec(&json!({
        "method": "ingestSubject", "requestId": "box", "protocolVersion": 3,
        "registryVersion": 5, "canonicalProfile": "geospec-jcs-v1", "format": "step",
        "frame": {"coordinateSystem": "z-up", "sourceUnit": "auto", "outputUnit": "mm"},
        "ingestOptions": {}, "primaryByteLength": source.len(), "resources": []
    }))
    .unwrap();
    let admission: Value = serde_json::from_slice(
        &engine
            .ingest_subject(&ingest, source.to_vec(), vec![])
            .unwrap(),
    )
    .unwrap();
    // Overlap is the first claim on this subject: nothing built the report.
    let request = serde_json::to_vec(&json!({
        "method": "submitClaims", "requestId": "overlap", "protocolVersion": 3,
        "registryVersion": 5, "canonicalProfile": "geospec-jcs-v1",
        "plan": {"subjects": [{"slot": "part",
            "subjectHash": admission["result"]["subject"]["subjectHash"]}], "claims": [{
            "claimId": "overlap", "capability": "analyzeMeshOverlap", "subjectSlots": ["part"],
            "payload": {"tolerance": 0.001}, "polarity": "positive", "workUnitBudget": 8000000
        }]}
    }))
    .unwrap();
    let response: Value =
        serde_json::from_slice(&engine.process_request(&request).unwrap()).unwrap();
    let claim = &response["result"]["results"][0];
    assert_eq!(claim["status"], "failed", "{response}");
    assert_eq!(
        claim["diagnostics"][0]["code"],
        "GEOSPEC_COMPONENT_PARTITION_INCONCLUSIVE"
    );
    assert_eq!(
        claim["diagnostics"][0]["details"],
        json!({"primitiveCount": 1})
    );
}
