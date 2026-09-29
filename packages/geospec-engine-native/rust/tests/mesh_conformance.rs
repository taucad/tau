use geospec_engine_native_core::{
    canonicalize, process_request, sha256_hex, Engine, ProtocolError,
};
use serde_json::Value;

const FIXTURES: &str = include_str!("fixtures/mesh-entry.json");
const CURRENT: &str = include_str!("fixtures/current-profile-01/plan-corpus.json");
const CURRENT_SHA256: &str = "eb8b42f1591fd2bd695228cdaa3abc4108b411717c468a9e97b724654616221d";
const CURRENT_NUMERIC_PROFILE: &str =
    include_str!("fixtures/current-profile-v5/numeric-profile.txt");

fn fixtures() -> Value {
    serde_json::from_str(FIXTURES).expect("frozen fixture JSON")
}

fn current() -> Value {
    assert_eq!(sha256_hex(CURRENT), CURRENT_SHA256);
    serde_json::from_str(CURRENT).expect("explicit current-profile bindings")
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

fn binding<'a>(current: &'a Value, id: &str) -> &'a Value {
    current["records"]
        .as_array()
        .expect("record bindings")
        .iter()
        .find(|record| record["id"] == id)
        .unwrap_or_else(|| panic!("missing explicit binding {id}"))
}

fn assert_response(actual: Vec<u8>, expected: &str, name: &str) {
    // The frozen v3 corpus remains byte-pinned; only its envelope profile is
    // rebound for the independently versioned current producer.
    let expected = expected.replace("geospec-st-logical-requests-v3", CURRENT_NUMERIC_PROFILE);
    let decoded: Value = serde_json::from_slice(&actual).expect("normal JSON response");
    let expected_value: Value = serde_json::from_str(&expected).expect("declared response");
    assert_eq!(decoded, expected_value, "{name}: full decoded result");
    assert_eq!(actual, expected.as_bytes(), "{name}: canonical bytes");
}

fn assert_outcome(result: Result<Vec<u8>, ProtocolError>, expected: &Value, name: &str) {
    if let Some(bytes) = expected["expectedUtf8"].as_str() {
        assert_response(
            result.unwrap_or_else(|error| panic!("{name}: {error}")),
            bytes,
            name,
        );
    } else {
        let error = result.expect_err(name);
        let _: &dyn std::error::Error = &error;
        assert_eq!(error.code(), string(expected, "expectedCode"), "{name}");
        if let Some(message) = expected["expectedMessage"].as_str() {
            // This v3 string-axis control predates the typed numeric parser;
            // v5 keeps an exact error oracle without editing the frozen row.
            let message = if name == "string-axis" {
                "GeoSpec numeric expectation must be an object."
            } else {
                message
            };
            assert_eq!(error.to_string(), message, "{name}: exact message");
        } else {
            assert!(!error.to_string().is_empty(), "{name}: diagnostic message");
        }
    }
}

fn ingest(engine: &mut Engine, fixture: &Value, current: &Value) {
    let name = string(fixture, "name");
    let mesh = bytes(string(fixture, "hex"));
    assert_eq!(
        sha256_hex(&mesh),
        string(fixture, "hash"),
        "independent frozen binary identity"
    );
    let bound = binding(current, &format!("a2/ingest/{name}"));
    let request = string(bound, "effectiveInputUtf8").as_bytes();
    assert_eq!(sha256_hex(request), bound["effectiveInputSha256"]);
    assert_outcome(engine.ingest_mesh(request, &mesh), bound, name);
}

#[test]
fn ingests_exact_frozen_little_endian_mesh_bytes() {
    let manifest = fixtures();
    let current = current();
    for fixture in manifest["fixtures"].as_array().expect("fixtures") {
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
        ingest(&mut Engine::new(), fixture, &current);
    }
}

#[test]
fn evaluates_complete_current_bounds_evidence_diagnostics_polarity_and_budgets() {
    let manifest = fixtures();
    let current = current();
    let mut engine = Engine::new();
    for fixture in manifest["fixtures"].as_array().expect("fixtures") {
        ingest(&mut engine, fixture, &current);
    }
    for case in manifest["evaluations"].as_array().expect("evaluations") {
        let name = string(case, "name");
        let bound = binding(&current, &format!("a2/raw/{name}"));
        assert_outcome(
            engine.process_request(string(bound, "effectiveInputUtf8").as_bytes()),
            bound,
            name,
        );
    }
}

#[test]
fn rejects_invalid_mesh_admission_with_current_profile_codes() {
    let manifest = fixtures();
    let current = current();
    for case in manifest["invalidIngest"]
        .as_array()
        .expect("invalid ingests")
    {
        let name = string(case, "name");
        let bound = binding(&current, &format!("a2/invalid-ingest/{name}"));
        assert_outcome(
            Engine::new().ingest_mesh(
                string(bound, "effectiveInputUtf8").as_bytes(),
                &bytes(string(case, "hex")),
            ),
            bound,
            name,
        );
    }
}

#[test]
fn covers_missing_content_current_vector_inputs_and_unsupported_routes() {
    let manifest = fixtures();
    let current = current();
    for case in manifest["invalidClaims"]
        .as_array()
        .expect("claim controls")
    {
        let name = string(case, "name");
        let mut engine = Engine::new();
        if case["ingest"] == true {
            ingest(
                &mut engine,
                fixture(&manifest, string(case, "fixture")),
                &current,
            );
        }
        let bound = binding(&current, &format!("a2/invalid-claim/{name}"));
        assert_outcome(
            engine.process_request(string(bound, "effectiveInputUtf8").as_bytes()),
            bound,
            name,
        );
    }
}

#[test]
fn advertises_the_complete_current_contract_through_both_entrypoints() {
    let current = current();
    let bound = binding(&current, "a1/raw/initialize");
    let request = string(bound, "effectiveInputUtf8").as_bytes();
    let mut expected: Value = serde_json::from_str(
        &string(bound, "expectedUtf8")
            .replace("geospec-st-logical-requests-v3", CURRENT_NUMERIC_PROFILE),
    )
    .expect("frozen initialize response");
    let capabilities = expected["result"]["capabilities"]
        .as_array_mut()
        .expect("frozen capabilities");
    assert_eq!(capabilities.last().unwrap()["name"], "queryPmi");
    capabilities.push(serde_json::json!({
        "name": "minimumDistance",
        "implementation": "implemented",
        "profile": "geospec-minimum-distance-v1",
        "qualification": "unqualified",
        "registryVersion": 5,
        "scope": "declared-subject-profile",
    }));
    let expected = canonicalize(&serde_json::to_vec(&expected).unwrap()).unwrap();
    let engine = Engine::new().process_request(request).expect("initialize");
    let free = process_request(request).expect("free initialize");
    assert_eq!(engine, expected, "Engine::initialize canonical bytes");
    assert_eq!(
        free, expected,
        "process_request::initialize canonical bytes"
    );
}

#[test]
fn retains_frozen_indexed_gsm1_measurements_and_polarities() {
    let manifest = fixtures();
    let current = current();
    let mut engine = Engine::new();
    for fixture in manifest["fixtures"].as_array().unwrap() {
        ingest(&mut engine, fixture, &current);
    }
    let mut compared = 0;
    for case in manifest["evaluations"].as_array().unwrap() {
        let expected: Value = serde_json::from_str(string(case, "expectedUtf8")).unwrap();
        let bound = binding(&current, &format!("a2/raw/{}", string(case, "name")));
        let mut request: Value = serde_json::from_str(string(bound, "effectiveInputUtf8")).unwrap();
        for claim in request["plan"]["claims"].as_array_mut().unwrap() {
            claim["workUnitBudget"] = Value::from(8_000_000);
        }
        let actual: Value = serde_json::from_slice(
            &engine
                .process_request(&serde_json::to_vec(&request).unwrap())
                .unwrap(),
        )
        .unwrap();
        let expected_rows = expected["result"]["results"].as_array().unwrap();
        let actual_rows = actual["result"]["results"].as_array().unwrap();
        for (expected, actual) in expected_rows.iter().zip(actual_rows) {
            if expected["evidence"]["measured"].is_null() {
                continue;
            }
            assert_eq!(
                actual["evidence"]["measured"], expected["evidence"]["measured"],
                "{}: complete measured bounds",
                case["name"]
            );
            assert_eq!(
                actual["status"], expected["status"],
                "{}: polarity",
                case["name"]
            );
            compared += 1;
        }
    }
    assert!(compared > 0);
}
