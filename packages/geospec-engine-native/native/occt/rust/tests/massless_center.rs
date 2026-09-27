//! A massless STEP subject has no centre of mass. The bridge measures none
//! when |volume| <= epsilon, so the B-rep route of `toHaveCenterOfMass`
//! refuses as the mesh route refuses a zero signed volume (ruling 9).
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

const TWO_CUBES: &str = include_str!("fixtures/two-cube-assembly.step");

/// W2-BOUNDS' by-trace input (`all-empty-components.step` up to its header):
/// both cube representations lose their solid and cubeA its face aspect, so
/// the admitted shape has no solid, no face and no finite box.
fn all_empty_components() -> String {
    let mut source = TWO_CUBES.to_owned();
    for (from, to) in [
        (
            "#10=ADVANCED_BREP_SHAPE_REPRESENTATION('cubeA',(#111,#513),#400);",
            "#10=ADVANCED_BREP_SHAPE_REPRESENTATION('cubeA',(#513),#400);",
        ),
        (
            "#2010=ADVANCED_BREP_SHAPE_REPRESENTATION('cubeB',(#211,#2513),#400);",
            "#2010=SHAPE_REPRESENTATION('cubeB',(#2513),#400);",
        ),
        ("#700=SHAPE_ASPECT('face.a','',#8,.T.);\n", ""),
        (
            "#701=GEOMETRIC_ITEM_SPECIFIC_USAGE('','',#700,#10,(#1110));\n",
            "",
        ),
    ] {
        assert_eq!(source.matches(from).count(), 1, "{from}");
        source = source.replace(from, to);
    }
    source
}

/// One `capability` claim on a fresh engine that admitted `source`.
fn claim(source: &[u8], capability: &str, payload: Value) -> Value {
    let mut engine = Engine::with_backends(
        EngineConfig::entry(),
        Box::new(OcctConnector),
        Box::new(NoCsg),
    );
    let ingest = serde_json::to_vec(&json!({
        "method": "ingestSubject", "requestId": "subject", "protocolVersion": 3,
        "registryVersion": 5, "canonicalProfile": "geospec-jcs-v1", "format": "step",
        "frame": {"coordinateSystem": "z-up", "sourceUnit": "auto", "outputUnit": "mm"},
        "ingestOptions": {}, "primaryByteLength": source.len(), "resources": []
    }))
    .unwrap();
    let admission: Value =
        serde_json::from_slice(&engine.ingest_subject(&ingest, source, vec![]).unwrap()).unwrap();
    let subject = &admission["result"]["subject"]["subjectHash"];
    assert!(subject.is_string(), "{admission}");
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
}

fn center(point: [f64; 3]) -> Value {
    json!({"kind": "centerOfMass", "expected": {"point": point, "tolerance": 0}})
}

#[test]
fn a_massless_step_subject_refuses_the_center_of_mass_as_a_mesh_does() {
    let empty = all_empty_components();
    // The volume is measured (zero), so the refusal is the matcher's, not F1's.
    let volume = claim(
        empty.as_bytes(),
        "toHaveVolume",
        json!({"kind": "volume", "expected": {"value": 0, "tolerance": 0}}),
    );
    assert_eq!(volume["status"], "passed", "{volume}");
    // Before: passed at the origin the bridge leaves unmeasured.
    let result = claim(empty.as_bytes(), "toHaveCenterOfMass", center([0.0; 3]));
    assert_eq!(result["status"], "refused", "{result}");
    let diagnostic = &result["diagnostics"][0];
    assert_eq!(diagnostic["code"], "GEOSPEC_EVIDENCE_UNSUPPORTED");
    assert_eq!(
        diagnostic["message"],
        "GeoSpec matcher 'toHaveCenterOfMass' needs a centre of mass (the subject is not a closed solid), but the loaded subject does not provide it."
    );
    // A subject with mass still answers from its measured centre.
    let control = claim(TWO_CUBES.as_bytes(), "toHaveCenterOfMass", center([0.0; 3]));
    assert_eq!(control["status"], "failed", "{control}");
}
