use geospec_engine_native_runtime::{create_engine, Engine, EngineConfig};
use serde_json::{json, Value};

fn ingest(
    engine: &mut Engine,
    bytes: Vec<u8>,
    buffers: Vec<Vec<u8>>,
    format: &str,
    source: &str,
) -> Value {
    let request = json!({"method":"ingestSubject","requestId":"admit","protocolVersion":3,"registryVersion":4,"canonicalProfile":"geospec-jcs-v1","format":format,"frame":{"coordinateSystem":"z-up","sourceUnit":source,"outputUnit":"mm"},"ingestOptions":{},"primaryByteLength":bytes.len(),"resources":buffers.iter().map(|b|json!({"name":"mesh.bin","byteLength":b.len()})).collect::<Vec<_>>()});
    serde_json::from_slice(
        &engine
            .ingest_subject(&serde_json::to_vec(&request).unwrap(), bytes, buffers)
            .unwrap(),
    )
    .unwrap()
}
fn evaluate(engine: &Engine, hash: &str, capability: &str, payload: Value) -> Value {
    let request = json!({"method":"submitClaims","requestId":"evaluate","protocolVersion":3,"registryVersion":4,"canonicalProfile":"geospec-jcs-v1","plan":{"subjects":[{"slot":"part","subjectHash":hash}],"claims":[{"claimId":"measure","capability":capability,"subjectSlots":["part"],"payload":payload,"polarity":"positive","workUnitBudget":1000000}]}});
    let plan = engine
        .canonical_plan(&serde_json::to_vec(&request).unwrap())
        .unwrap();
    serde_json::from_slice(&engine.evaluate_plan(&plan).unwrap()).unwrap()
}

#[test]
fn external_resource_identity_and_real_step_share_the_composed_engine() {
    let fixture: Value = serde_json::from_str(include_str!(
        "../../../conformance/subject-identity-instance-v2-controls.json"
    ))
    .unwrap();
    let mut engine = create_engine(EngineConfig::entry());
    for row in fixture["rows"].as_array().unwrap() {
        let hex = row["resourceHex"].as_str().unwrap();
        let bytes = (0..hex.len())
            .step_by(2)
            .map(|i| u8::from_str_radix(&hex[i..i + 2], 16).unwrap())
            .collect();
        let source = if row["id"].as_str().unwrap().ends_with("scale10") {
            "cm"
        } else {
            "mm"
        };
        let result = ingest(
            &mut engine,
            fixture["primaryUtf8"].as_str().unwrap().as_bytes().to_vec(),
            vec![bytes],
            "gltf",
            source,
        );
        assert_eq!(
            result["result"]["subject"]["subjectHash"],
            row["subjectHash"]
        );
        let expected = if row["id"].as_str().unwrap().starts_with("A") {
            4.0
        } else {
            1.0
        } * if source == "cm" { 100.0 } else { 1.0 };
        let result = evaluate(
            &engine,
            row["subjectHash"].as_str().unwrap(),
            "toHaveSurfaceArea",
            json!({"kind":"surfaceArea","expected":{"value":expected}}),
        );
        assert_eq!(result["results"][0]["status"], "passed", "{result}");
    }
    let step = include_bytes!("../../occt/rust/tests/fixtures/ap242-box.step").to_vec();
    let admitted = ingest(&mut engine, step, vec![], "step", "auto");
    let result = evaluate(
        &engine,
        admitted["result"]["subject"]["subjectHash"]
            .as_str()
            .unwrap(),
        "toHaveVolume",
        json!({"kind":"volume","expected":{"value":6000.0}}),
    );
    assert_eq!(result["results"][0]["status"], "passed", "{result}");
}
