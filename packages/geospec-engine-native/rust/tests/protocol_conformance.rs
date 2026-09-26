use std::error::Error;

use geospec_engine_native_core::{
    canonicalize, process_request, sha256_hex, Engine, ProtocolError,
};
use serde_json::Value;

const CURRENT: &str = include_str!("fixtures/current-profile-01/plan-corpus.json");
const CURRENT_SHA256: &str = "eb8b42f1591fd2bd695228cdaa3abc4108b411717c468a9e97b724654616221d";
const CURRENT_NUMERIC_PROFILE: &str =
    include_str!("fixtures/current-profile-v5/numeric-profile.txt");

fn current() -> Value {
    assert_eq!(sha256_hex(CURRENT), CURRENT_SHA256);
    serde_json::from_str(CURRENT).expect("explicit current-profile bindings")
}

fn binding<'a>(current: &'a Value, id: &str) -> &'a Value {
    current["records"]
        .as_array()
        .expect("record bindings")
        .iter()
        .find(|record| record["id"] == id)
        .unwrap_or_else(|| panic!("missing explicit binding {id}"))
}

fn input(binding: &Value) -> Vec<u8> {
    if let Some(value) = binding["effectiveInputUtf8"].as_str() {
        value.as_bytes().to_vec()
    } else {
        let hex = binding["effectiveInputHex"].as_str().expect("bound input");
        (0..hex.len())
            .step_by(2)
            .map(|index| u8::from_str_radix(&hex[index..index + 2], 16).unwrap())
            .collect()
    }
}

fn assert_exact(
    actual: Result<Vec<u8>, ProtocolError>,
    expected: &Value,
    name: &str,
) -> Option<Value> {
    if let Some(bytes) = expected["expectedUtf8"].as_str() {
        let actual = actual.unwrap_or_else(|error| panic!("{name}: {error}"));
        let bytes = bytes.replace("geospec-st-logical-requests-v3", CURRENT_NUMERIC_PROFILE);
        assert_eq!(actual, bytes.as_bytes(), "{name}: canonical bytes");
        assert_eq!(canonicalize(&actual).unwrap(), actual, "{name}: canonical");
        Some(serde_json::from_slice(&actual).unwrap())
    } else {
        let first = actual.expect_err(name);
        let _: &dyn Error = &first;
        assert_eq!(first.code(), expected["expectedCode"].as_str().unwrap());
        if let Some(message) = expected["expectedMessage"].as_str() {
            assert_eq!(first.to_string(), message, "{name}: exact message");
        } else {
            assert!(!first.to_string().is_empty(), "{name}: diagnostic message");
        }
        None
    }
}

fn engine_with_admitted_mesh(current: &Value) -> Engine {
    let manifest: Value = serde_json::from_str(include_str!("fixtures/mesh-entry.json")).unwrap();
    let mesh_binding = &current["meshes"][0];
    let fixture = manifest["fixtures"]
        .as_array()
        .unwrap()
        .iter()
        .find(|fixture| fixture["hash"] == mesh_binding["meshContentHash"])
        .expect("bound mesh fixture");
    let hex = fixture["hex"].as_str().unwrap();
    let mesh: Vec<u8> = (0..hex.len())
        .step_by(2)
        .map(|index| u8::from_str_radix(&hex[index..index + 2], 16).unwrap())
        .collect();
    assert_eq!(sha256_hex(&mesh), mesh_binding["meshContentHash"]);
    let request = mesh_binding["effectiveRequestUtf8"].as_str().unwrap();
    assert_eq!(sha256_hex(request), mesh_binding["effectiveRequestSha256"]);
    let mut engine = Engine::new();
    assert_exact(
        engine.ingest_mesh(request.as_bytes(), &mesh),
        mesh_binding,
        "current mesh admission",
    );
    engine
}

#[test]
fn canonicalizes_and_rejects_the_frozen_codec_vectors_without_reserializing_inputs() {
    let current = current();
    for id in [
        "a1/codec/numbers",
        "a1/codec/utf16",
        "a1/codec/number-thresholds",
        "a1/codec/depth64",
        "a1/codec/initialize",
        "a1/codec/plan",
    ] {
        let bound = binding(&current, id);
        let input = input(bound);
        assert_eq!(sha256_hex(&input), bound["effectiveInputSha256"]);
        assert_exact(canonicalize(&input), bound, id);
    }
    for id in [
        "ordinary/duplicate/canonicalize",
        "ordinary/nonutf8/canonicalize",
        "ordinary/surrogate/canonicalize",
        "ordinary/nan/canonicalize",
        "ordinary/depth65/canonicalize",
    ] {
        let bound = binding(&current, id);
        assert_exact(canonicalize(&input(bound)), bound, id);
    }
    let overflow = br#"{"n":1e400}"#;
    let error = canonicalize(overflow).expect_err("overflow must be rejected");
    assert_eq!(error.code(), "invalid-number");
}

#[test]
fn reports_the_complete_current_initialize_contract_through_both_entrypoints() {
    let current = current();
    let bound = binding(&current, "a1/raw/initialize");
    let request = input(bound);
    let engine = Engine::new().process_request(&request);
    let free = process_request(&request);
    let engine = assert_exact(engine, bound, "Engine::initialize").unwrap();
    let free = assert_exact(free, bound, "process_request::initialize").unwrap();
    assert_eq!(engine, free);
    assert_eq!(
        engine["result"]["capabilities"].as_array().unwrap().len(),
        31
    );
}

#[test]
fn covers_current_analyze_mesh_payload_budget_order_and_ancillary_polarity() {
    let current = current();
    let engine = engine_with_admitted_mesh(&current);
    for id in [
        "a1/raw/positive",
        "a1/raw/maximum-budget",
        "a1/raw/omitted",
        "a1/raw/null",
        "a1/raw/order",
        "a1/raw/negative",
    ] {
        let bound = binding(&current, id);
        let response = assert_exact(engine.process_request(&input(bound)), bound, id);
        if let Some(response) = response {
            let results = response["result"]["results"].as_array().unwrap();
            assert!(!results.is_empty(), "{id}: complete results");
            if id == "a1/raw/order" {
                assert_eq!(results[0]["claimId"], "c2");
                assert_eq!(results[1]["claimId"], "c1");
            }
        }
    }
}

#[test]
fn covers_current_brep_unavailability_after_mesh_admission() {
    let current = current();
    let engine = engine_with_admitted_mesh(&current);
    let bound = binding(&current, "a1/raw/brep");
    let response = assert_exact(engine.process_request(&input(bound)), bound, "a1/raw/brep")
        .expect("BRep unavailability is a claim result");
    assert_eq!(
        response["result"]["results"][0]["diagnostics"][0]["code"],
        "GEOSPEC_BREP_EVIDENCE_UNAVAILABLE"
    );
}

#[test]
fn rejects_invalid_versions_profiles_claim_links_and_budgets_exactly() {
    let current = current();
    for number in 1..=14 {
        let id = format!("a1/invalid/{number}");
        let bound = binding(&current, &id);
        let request = input(bound);
        assert_eq!(sha256_hex(&request), bound["effectiveInputSha256"]);
        assert_exact(process_request(&request), bound, &id);
    }
    let old = binding(&current, "a1/invalid/2");
    let request = input(old);
    assert_eq!(
        request,
        old["effectiveInputUtf8"].as_str().unwrap().as_bytes()
    );
    let error = process_request(&request).unwrap_err();
    assert_eq!(
        error.to_string(),
        "GeoSpec registry version 3 is incompatible with version 5."
    );
}
