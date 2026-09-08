use geospec_engine_native_core::{process_request, Engine, ProtocolError};
use serde_json::Value;
use sha2::{Digest, Sha256};

// Frozen independently before candidate inspection; no candidate-generated oracle.
const FIXTURES: &str = include_str!("fixtures/mesh-entry.json");

fn fixtures() -> Value {
    serde_json::from_str(FIXTURES).expect("frozen fixture JSON")
}

fn string<'a>(value: &'a Value, field: &str) -> &'a str {
    value[field].as_str().expect(field)
}

fn bytes(hex: &str) -> Vec<u8> {
    assert_eq!(hex.len() % 2, 0);
    (0..hex.len())
        .step_by(2)
        .map(|index| u8::from_str_radix(&hex[index..index + 2], 16).expect("fixture byte"))
        .collect()
}

fn fixture<'a>(manifest: &'a Value, name: &str) -> &'a Value {
    manifest["fixtures"]
        .as_array()
        .expect("fixtures")
        .iter()
        .find(|fixture| fixture["name"] == name)
        .expect("named fixture")
}

fn assert_response(actual: Vec<u8>, expected: &str, name: &str) {
    let decoded: Value = serde_json::from_slice(&actual).expect("normal JSON response");
    let expected_value: Value = serde_json::from_str(expected).expect("frozen response");
    assert_eq!(decoded, expected_value, "{name}: full decoded result");
    assert_eq!(actual, expected.as_bytes(), "{name}: canonical bytes");
}

fn assert_error(result: Result<Vec<u8>, ProtocolError>, code: &str, name: &str) {
    let error = result.expect_err(name);
    let _: &dyn std::error::Error = &error;
    assert_eq!(error.code(), code, "{name}");
    assert!(!error.to_string().is_empty(), "{name}: diagnostic message");
}

fn ingest(engine: &mut Engine, fixture: &Value) {
    let mesh = bytes(string(fixture, "hex"));
    assert_eq!(
        format!("{:x}", Sha256::digest(&mesh)),
        string(fixture, "hash"),
        "independent frozen binary identity"
    );
    assert_response(
        engine
            .ingest_mesh(string(fixture, "ingestRequestUtf8").as_bytes(), &mesh)
            .expect("valid mesh admission"),
        string(fixture, "ingestExpectedUtf8"),
        string(fixture, "name"),
    );
}

#[test]
fn ingests_exact_frozen_little_endian_mesh_bytes() {
    let manifest = fixtures();
    for fixture in manifest["fixtures"].as_array().expect("fixtures") {
        // Repack normal coordinates with Rust stdlib to verify the actual binary
        // profile independently of the candidate's decoder and frozen Node packer.
        if let Some(positions) = fixture["positions"].as_array() {
            let indices = fixture["indices"].as_array().expect("indices");
            let mut packed = b"GSM1".to_vec();
            packed.extend_from_slice(&(positions.len() as u32 / 3).to_le_bytes());
            packed.extend_from_slice(&(indices.len() as u32 / 3).to_le_bytes());
            for position in positions {
                packed.extend_from_slice(&position.as_f64().expect("coordinate").to_le_bytes());
            }
            for index in indices {
                packed.extend_from_slice(&(index.as_u64().expect("index") as u32).to_le_bytes());
            }
            assert_eq!(packed, bytes(string(fixture, "hex")), "{}", fixture["name"]);
        }
        ingest(&mut Engine::new(), fixture);
    }
}

#[test]
fn evaluates_complete_frozen_bounds_evidence_diagnostics_polarity_and_budgets() {
    let manifest = fixtures();
    let mut engine = Engine::new();
    for fixture in manifest["fixtures"].as_array().expect("fixtures") {
        ingest(&mut engine, fixture);
    }
    for case in manifest["evaluations"].as_array().expect("evaluations") {
        let name = string(case, "name");
        assert_response(
            engine
                .process_request(string(case, "requestUtf8").as_bytes())
                .unwrap_or_else(|error| panic!("{name}: {}: {error}", error.code())),
            string(case, "expectedUtf8"),
            name,
        );
    }
}

#[test]
fn rejects_invalid_mesh_admission_with_frozen_codes() {
    let manifest = fixtures();
    for case in manifest["invalidIngest"]
        .as_array()
        .expect("invalid ingests")
    {
        assert_error(
            Engine::new().ingest_mesh(
                string(case, "requestUtf8").as_bytes(),
                &bytes(string(case, "hex")),
            ),
            string(case, "expectedCode"),
            string(case, "name"),
        );
    }
}

#[test]
fn rejects_missing_content_invalid_expectations_and_unsupported_routes() {
    let manifest = fixtures();
    for case in manifest["invalidClaims"]
        .as_array()
        .expect("invalid claims")
    {
        let mut engine = Engine::new();
        if case["ingest"] == true {
            ingest(&mut engine, fixture(&manifest, string(case, "fixture")));
        }
        assert_error(
            engine.process_request(string(case, "requestUtf8").as_bytes()),
            string(case, "expectedCode"),
            string(case, "name"),
        );
    }
}

#[test]
fn advertises_the_same_bounded_experimental_capability_through_both_entrypoints() {
    let manifest = fixtures();
    let request = br#"{"method":"initialize","requestId":"r1","protocolVersion":3,"registryVersion":4,"canonicalProfile":"geospec-jcs-v1"}"#;
    let expected = string(&manifest["a1Compatibility"], "initializeExpectedUtf8");
    assert_response(
        Engine::new().process_request(request).expect("initialize"),
        expected,
        "Engine initialize",
    );
    assert_response(
        process_request(request).expect("free initialize"),
        expected,
        "free initialize",
    );
}
