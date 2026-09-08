use std::error::Error;

use geospec_engine_native_core::{canonicalize, process_request, ProtocolError};
use serde_json::Value;

const CONTENT_HASH: &str = "0000000000000000000000000000000000000000000000000000000000000000";

const INITIALIZE_REQUEST: &[u8] = br#"{"method":"initialize","requestId":"r1","protocolVersion":3,"registryVersion":4,"canonicalProfile":"geospec-jcs-v1"}"#;
const CANONICAL_INITIALIZE_REQUEST: &[u8] = br#"{"canonicalProfile":"geospec-jcs-v1","method":"initialize","protocolVersion":3,"registryVersion":4,"requestId":"r1"}"#;
const INITIALIZE_RESPONSE: &[u8] = br#"{"requestId":"r1","result":{"canonicalProfile":"geospec-jcs-v1","capabilities":[],"protocolVersion":3,"qualification":"experimental","registryVersion":4}}"#;

const POSITIVE_PLAN: &[u8] = br#"{"subjects":[{"slot":"s1","contentHash":"0000000000000000000000000000000000000000000000000000000000000000"}],"claims":[{"claimId":"c1","capability":"analyzeMesh","subjectSlots":["s1"],"payload":null,"polarity":"positive","workUnitBudget":100}]}"#;
const CANONICAL_POSITIVE_PLAN: &[u8] = br#"{"claims":[{"capability":"analyzeMesh","claimId":"c1","payload":null,"polarity":"positive","subjectSlots":["s1"],"workUnitBudget":100}],"subjects":[{"contentHash":"0000000000000000000000000000000000000000000000000000000000000000","slot":"s1"}]}"#;
const POSITIVE_REQUEST: &[u8] = br#"{"method":"submitClaims","requestId":"r1","protocolVersion":3,"registryVersion":4,"canonicalProfile":"geospec-jcs-v1","plan":{"subjects":[{"slot":"s1","contentHash":"0000000000000000000000000000000000000000000000000000000000000000"}],"claims":[{"claimId":"c1","capability":"analyzeMesh","subjectSlots":["s1"],"payload":null,"polarity":"positive","workUnitBudget":100}]}}"#;
const POSITIVE_RESPONSE: &[u8] = br#"{"requestId":"r1","result":{"results":[{"claimId":"c1","diagnostics":[{"code":"GEOSPEC_CAPABILITY_UNAVAILABLE","details":{"capability":"analyzeMesh"},"message":"Capability is not implemented in this engine slice.","severity":"error"}],"status":"refused"}]}}"#;
const NEGATIVE_REQUEST: &[u8] = br#"{"method":"submitClaims","requestId":"r2","protocolVersion":3,"registryVersion":4,"canonicalProfile":"geospec-jcs-v1","plan":{"subjects":[{"slot":"s1","contentHash":"0000000000000000000000000000000000000000000000000000000000000000"}],"claims":[{"claimId":"c2","capability":"analyzeMesh","subjectSlots":["s1"],"payload":null,"polarity":"negative","workUnitBudget":100}]}}"#;
const NEGATIVE_RESPONSE: &[u8] = br#"{"requestId":"r2","result":{"results":[{"claimId":"c2","diagnostics":[{"code":"GEOSPEC_CAPABILITY_UNAVAILABLE","details":{"capability":"analyzeMesh"},"message":"Capability is not implemented in this engine slice.","severity":"error"}],"status":"refused"}]}}"#;

fn assert_canonical(input: &[u8], expected: &[u8]) {
    let actual = canonicalize(input).expect("input should canonicalize");
    assert_eq!(actual, expected);
    assert_eq!(
        canonicalize(&actual).expect("canonical bytes should round-trip"),
        expected
    );
}

fn assert_response(input: &[u8], expected: &[u8]) -> Value {
    let actual = process_request(input).expect("request should produce a response");
    assert_eq!(actual, expected);
    assert_eq!(
        canonicalize(&actual).expect("response should be canonical"),
        actual
    );
    serde_json::from_slice(&actual).expect("response should decode as normal JSON")
}

fn assert_typed_error(
    operation: fn(&[u8]) -> Result<Vec<u8>, ProtocolError>,
    input: &[u8],
    expected_code: &str,
) {
    let first = operation(input).expect_err("input should be rejected");
    let second = operation(input).expect_err("repeated input should be rejected");
    let _: &dyn Error = &first;
    assert_eq!(first.code(), expected_code);
    assert_eq!(first.code(), second.code());
    assert!(!first.to_string().is_empty());
}

#[test]
fn canonicalizes_the_frozen_gne_canon_01_vectors() {
    assert_canonical(
        br#"{"z":-0,"sub":5e-324,"boundary":1e-7,"safe":9007199254740991}"#,
        br#"{"boundary":1e-7,"safe":9007199254740991,"sub":5e-324,"z":0}"#,
    );
    assert_canonical(
        "{\"￰\":2,\"𐀀\":1,\"😀\":\"ok\"}".as_bytes(),
        "{\"𐀀\":1,\"😀\":\"ok\",\"￰\":2}".as_bytes(),
    );
    assert_canonical(
        br#"{"measurementSubnormal":5e-324,"measurementIntegral":1e20,"measurementExponent":1e21}"#,
        br#"{"measurementExponent":1e+21,"measurementIntegral":100000000000000000000,"measurementSubnormal":5e-324}"#,
    );
}

#[test]
fn rejects_duplicate_keys_malformed_utf8_and_unpaired_surrogates() {
    assert_typed_error(canonicalize, br#"{"a":1,"a":2}"#, "duplicate-key");
    assert_typed_error(
        canonicalize,
        &[0x7b, 0x22, 0x73, 0x22, 0x3a, 0x22, 0xc3, 0x28, 0x22, 0x7d],
        "invalid-utf8",
    );
    assert_typed_error(canonicalize, br#"{"s":"\ud800"}"#, "invalid-json");
    assert_typed_error(canonicalize, br#"{"n":NaN}"#, "invalid-json");
    assert_typed_error(canonicalize, br#"{"n":1e400}"#, "invalid-number");
}

#[test]
fn enforces_the_frozen_container_depth_rule() {
    let depth_64 = format!("{}0{}", "[".repeat(64), "]".repeat(64));
    let depth_65 = format!("{}0{}", "[".repeat(65), "]".repeat(65));

    assert_canonical(depth_64.as_bytes(), depth_64.as_bytes());
    assert_typed_error(canonicalize, depth_65.as_bytes(), "limit-exceeded");
}

#[test]
fn initializes_with_exact_canonical_request_and_response_bytes() {
    assert_canonical(INITIALIZE_REQUEST, CANONICAL_INITIALIZE_REQUEST);
    let response = assert_response(INITIALIZE_REQUEST, INITIALIZE_RESPONSE);

    assert_eq!(response["requestId"], "r1");
    assert_eq!(response["result"]["protocolVersion"], 3);
    assert_eq!(response["result"]["registryVersion"], 4);
    assert_eq!(response["result"]["canonicalProfile"], "geospec-jcs-v1");
    assert_eq!(response["result"]["qualification"], "experimental");
    assert_eq!(
        response["result"]["capabilities"].as_array().map(Vec::len),
        Some(0)
    );
}

#[test]
fn refuses_positive_and_negative_analyze_mesh_claims_with_exact_diagnostics() {
    assert_eq!(CONTENT_HASH.len(), 64);
    assert_canonical(POSITIVE_PLAN, CANONICAL_POSITIVE_PLAN);

    for (request, expected, request_id, claim_id) in [
        (POSITIVE_REQUEST, POSITIVE_RESPONSE, "r1", "c1"),
        (NEGATIVE_REQUEST, NEGATIVE_RESPONSE, "r2", "c2"),
    ] {
        let response = assert_response(request, expected);
        let result = &response["result"]["results"][0];
        assert_eq!(response["requestId"], request_id);
        assert_eq!(result["claimId"], claim_id);
        assert_eq!(result["status"], "refused");
        assert_eq!(
            result["diagnostics"][0]["code"],
            "GEOSPEC_CAPABILITY_UNAVAILABLE"
        );
        assert_eq!(result["diagnostics"][0]["severity"], "error");
        assert_eq!(
            result["diagnostics"][0]["details"]["capability"],
            "analyzeMesh"
        );
    }
}

#[test]
fn applies_the_null_payload_default_and_accepts_the_maximum_exact_budget() {
    let omitted = br#"{"method":"submitClaims","requestId":"r3","protocolVersion":3,"registryVersion":4,"canonicalProfile":"geospec-jcs-v1","plan":{"subjects":[{"slot":"s1","contentHash":"0000000000000000000000000000000000000000000000000000000000000000"}],"claims":[{"claimId":"c3","capability":"analyzeMesh","subjectSlots":["s1"],"polarity":"positive","workUnitBudget":100}]}}"#;
    let explicit_null = br#"{"method":"submitClaims","requestId":"r3","protocolVersion":3,"registryVersion":4,"canonicalProfile":"geospec-jcs-v1","plan":{"subjects":[{"slot":"s1","contentHash":"0000000000000000000000000000000000000000000000000000000000000000"}],"claims":[{"claimId":"c3","capability":"analyzeMesh","subjectSlots":["s1"],"payload":null,"polarity":"positive","workUnitBudget":100}]}}"#;
    let maximum_budget = br#"{"method":"submitClaims","requestId":"r1","protocolVersion":3,"registryVersion":4,"canonicalProfile":"geospec-jcs-v1","plan":{"subjects":[{"slot":"s1","contentHash":"0000000000000000000000000000000000000000000000000000000000000000"}],"claims":[{"claimId":"c1","capability":"analyzeMesh","subjectSlots":["s1"],"payload":null,"polarity":"positive","workUnitBudget":9007199254740991}]}}"#;

    assert_eq!(
        process_request(omitted).expect("omitted payload should default to null"),
        process_request(explicit_null).expect("explicit null should be accepted")
    );
    assert_eq!(
        process_request(maximum_budget).expect("maximum exact budget should be valid"),
        POSITIVE_RESPONSE
    );
}

#[test]
fn rejects_invalid_versions_profiles_claim_links_and_budgets() {
    let invalid_requests: &[(&[u8], &str)] = &[
        (
            br#"{"method":"initialize","requestId":"r1","protocolVersion":2,"registryVersion":4,"canonicalProfile":"geospec-jcs-v1"}"#,
            "unsupported-version",
        ),
        (
            br#"{"method":"initialize","requestId":"r1","protocolVersion":3,"registryVersion":3,"canonicalProfile":"geospec-jcs-v1"}"#,
            "unsupported-version",
        ),
        (
            br#"{"method":"initialize","requestId":"r1","protocolVersion":3,"registryVersion":4,"canonicalProfile":"legacy-v2-registry-v3"}"#,
            "unsupported-version",
        ),
        (
            br#"{"method":"initialize","requestId":"r1","protocolVersion":3,"registryVersion":4,"canonicalProfile":"geospec-jcs-v1","extra":true}"#,
            "invalid-request",
        ),
        (
            br#"{"method":"submitClaims","requestId":"r1","protocolVersion":3,"registryVersion":4,"canonicalProfile":"geospec-jcs-v1","plan":{"subjects":[{"slot":"s1","contentHash":"0000000000000000000000000000000000000000000000000000000000000000"}],"claims":[{"claimId":"c1","capability":"unknownCapability","subjectSlots":["s1"],"payload":null,"polarity":"positive","workUnitBudget":100}]}}"#,
            "unknown-capability",
        ),
        (
            br#"{"method":"submitClaims","requestId":"r1","protocolVersion":3,"registryVersion":4,"canonicalProfile":"geospec-jcs-v1","plan":{"subjects":[{"slot":"s1","contentHash":"0000000000000000000000000000000000000000000000000000000000000000"}],"claims":[{"claimId":"c1","capability":"analyzeMesh","subjectSlots":["missing"],"payload":null,"polarity":"positive","workUnitBudget":100}]}}"#,
            "invalid-claim",
        ),
        (
            br#"{"method":"submitClaims","requestId":"r1","protocolVersion":3,"registryVersion":4,"canonicalProfile":"geospec-jcs-v1","plan":{"subjects":[{"slot":"s1","contentHash":"0000000000000000000000000000000000000000000000000000000000000000"}],"claims":[{"claimId":"","capability":"analyzeMesh","subjectSlots":["s1"],"payload":null,"polarity":"positive","workUnitBudget":100}]}}"#,
            "invalid-claim",
        ),
        (
            br#"{"method":"submitClaims","requestId":"r1","protocolVersion":3,"registryVersion":4,"canonicalProfile":"geospec-jcs-v1","plan":{"subjects":[{"slot":"s1","contentHash":"0000000000000000000000000000000000000000000000000000000000000000"}],"claims":[{"claimId":"c1","capability":"analyzeMesh","subjectSlots":[],"payload":null,"polarity":"positive","workUnitBudget":100}]}}"#,
            "invalid-claim",
        ),
        (
            br#"{"method":"submitClaims","requestId":"r1","protocolVersion":3,"registryVersion":4,"canonicalProfile":"geospec-jcs-v1","plan":{"subjects":[{"slot":"s1","contentHash":"0000000000000000000000000000000000000000000000000000000000000000"}],"claims":[{"claimId":"c1","capability":"analyzeMesh","subjectSlots":["s1"],"payload":{},"polarity":"positive","workUnitBudget":100}]}}"#,
            "invalid-claim",
        ),
        (
            br#"{"method":"submitClaims","requestId":"r1","protocolVersion":3,"registryVersion":4,"canonicalProfile":"geospec-jcs-v1","plan":{"subjects":[{"slot":"s1","contentHash":"0000000000000000000000000000000000000000000000000000000000000000"}],"claims":[{"claimId":"c1","capability":"analyzeMesh","subjectSlots":["s1"],"payload":null,"polarity":"sideways","workUnitBudget":100}]}}"#,
            "invalid-claim",
        ),
        (
            br#"{"method":"submitClaims","requestId":"r1","protocolVersion":3,"registryVersion":4,"canonicalProfile":"geospec-jcs-v1","plan":{"subjects":[{"slot":"s1","contentHash":"0000000000000000000000000000000000000000000000000000000000000000"}],"claims":[{"claimId":"c1","capability":"analyzeMesh","subjectSlots":["s1"],"payload":null,"polarity":"positive","workUnitBudget":0}]}}"#,
            "invalid-claim",
        ),
        (
            br#"{"method":"submitClaims","requestId":"r1","protocolVersion":3,"registryVersion":4,"canonicalProfile":"geospec-jcs-v1","plan":{"subjects":[{"slot":"s1","contentHash":"0000000000000000000000000000000000000000000000000000000000000000"}],"claims":[{"claimId":"c1","capability":"analyzeMesh","subjectSlots":["s1"],"payload":null,"polarity":"positive","workUnitBudget":1.5}]}}"#,
            "invalid-claim",
        ),
        (
            br#"{"method":"submitClaims","requestId":"r1","protocolVersion":3,"registryVersion":4,"canonicalProfile":"geospec-jcs-v1","plan":{"subjects":[{"slot":"s1","contentHash":"0000000000000000000000000000000000000000000000000000000000000000"}],"claims":[{"claimId":"c1","capability":"analyzeMesh","subjectSlots":["s1"],"payload":null,"polarity":"positive","workUnitBudget":9007199254740992}]}}"#,
            "invalid-claim",
        ),
        (
            br#"{"method":"submitClaims","requestId":"r1","protocolVersion":3,"registryVersion":4,"canonicalProfile":"geospec-jcs-v1","plan":{"subjects":[{"slot":"s1","contentHash":"0000000000000000000000000000000000000000000000000000000000000000"}],"claims":[{"claimId":"c1","capability":"analyzeMesh","subjectSlots":["s1"],"payload":null,"polarity":"positive","workUnitBudget":100},{"claimId":"c1","capability":"analyzeMesh","subjectSlots":["s1"],"payload":null,"polarity":"positive","workUnitBudget":100}]}}"#,
            "invalid-claim",
        ),
    ];

    for (request, code) in invalid_requests {
        assert_typed_error(process_request, request, code);
    }
}

#[test]
fn preserves_distinct_claims_and_authored_result_order() {
    let request = br#"{"method":"submitClaims","requestId":"ordered","protocolVersion":3,"registryVersion":4,"canonicalProfile":"geospec-jcs-v1","plan":{"subjects":[{"slot":"s1","contentHash":"0000000000000000000000000000000000000000000000000000000000000000"}],"claims":[{"claimId":"c2","capability":"analyzeMesh","subjectSlots":["s1"],"payload":null,"polarity":"positive","workUnitBudget":100},{"claimId":"c1","capability":"analyzeMesh","subjectSlots":["s1"],"payload":null,"polarity":"positive","workUnitBudget":100}]}}"#;
    let expected = br#"{"requestId":"ordered","result":{"results":[{"claimId":"c2","diagnostics":[{"code":"GEOSPEC_CAPABILITY_UNAVAILABLE","details":{"capability":"analyzeMesh"},"message":"Capability is not implemented in this engine slice.","severity":"error"}],"status":"refused"},{"claimId":"c1","diagnostics":[{"code":"GEOSPEC_CAPABILITY_UNAVAILABLE","details":{"capability":"analyzeMesh"},"message":"Capability is not implemented in this engine slice.","severity":"error"}],"status":"refused"}]}}"#;

    let response = assert_response(request, expected);
    let results = response["result"]["results"]
        .as_array()
        .expect("results should be an array");
    assert_eq!(results.len(), 2);
    assert_eq!(results[0]["claimId"], "c2");
    assert_eq!(results[1]["claimId"], "c1");
}

#[test]
fn refuses_other_recognized_execution_capabilities_without_advertising_them() {
    let request = br#"{"method":"submitClaims","requestId":"brep","protocolVersion":3,"registryVersion":4,"canonicalProfile":"geospec-jcs-v1","plan":{"subjects":[{"slot":"s1","contentHash":"0000000000000000000000000000000000000000000000000000000000000000"}],"claims":[{"claimId":"c1","capability":"analyzeBrep","subjectSlots":["s1"],"payload":null,"polarity":"positive","workUnitBudget":100}]}}"#;
    let expected = br#"{"requestId":"brep","result":{"results":[{"claimId":"c1","diagnostics":[{"code":"GEOSPEC_CAPABILITY_UNAVAILABLE","details":{"capability":"analyzeBrep"},"message":"Capability is not implemented in this engine slice.","severity":"error"}],"status":"refused"}]}}"#;

    let response = assert_response(request, expected);
    assert_eq!(response["result"]["results"][0]["status"], "refused");
}
