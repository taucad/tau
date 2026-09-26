//! Healthy public release returns the full verified F1 retention reservation.
use crate::{canonicalize, Engine};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

const CORPUS_SHA256: &str = "c46c089b0d5097e862e606ed2866dea53dd25a6df207c044c3172d6dc9e100c4";
const VERIFIER_SOURCE_HASH: &str =
    include_str!("fixtures/current-profile-v5/verifier-source-hash.txt");
const NUMERIC_PROFILE: &str = include_str!("fixtures/current-profile-v5/numeric-profile.txt");

fn verifier_source_hash() -> String {
    let value = std::env::var("GEOSPEC_F1_VERIFIER_SOURCE_HASH")
        .unwrap_or_else(|_| VERIFIER_SOURCE_HASH.into());
    assert_eq!(value, VERIFIER_SOURCE_HASH, "stale verifier source binding");
    value
}

#[test]
fn releases_verified_plate_capacity_in_healthy_sessions() {
    let input = std::env::var_os("GEOSPEC_F1_BUDGET_CORPUS").map_or_else(
        || include_bytes!("fixtures/portable-controls/f1-budget-batch.json").to_vec(),
        |path| std::fs::read(path).unwrap(),
    );
    let expected_hash =
        std::env::var("GEOSPEC_F1_BUDGET_CORPUS_SHA256").unwrap_or_else(|_| CORPUS_SHA256.into());
    assert_eq!(expected_hash, CORPUS_SHA256, "stale control hash binding");
    assert_eq!(format!("{:x}", Sha256::digest(&input)), CORPUS_SHA256);
    let corpus: Value = serde_json::from_slice(&input).unwrap();
    let case = corpus["budgetCases"]
        .as_array()
        .unwrap()
        .iter()
        .find(|case| case["id"] == "f1-budget-58-positive")
        .unwrap();
    let primary = corpus["primaryUtf8"].as_str().unwrap().as_bytes();
    let mut request: Value =
        serde_json::from_str(corpus["ingestRequestUtf8"].as_str().unwrap()).unwrap();
    request["registryVersion"] = json!(5);
    let request = serde_json::to_vec(&request).unwrap();
    let mut plan: Value =
        serde_json::from_str(case["canonicalPlanUtf8"].as_str().unwrap()).unwrap();
    plan["registryVersion"] = json!(5);
    plan["numericProfile"] = json!(NUMERIC_PROFILE);
    let plan = canonicalize(&serde_json::to_vec(&plan).unwrap()).unwrap();
    let mut expected: Value =
        serde_json::from_str(case["neutralResultUtf8"].as_str().unwrap()).unwrap();
    expected["numericProfile"] = json!(NUMERIC_PROFILE);
    expected["results"][0]["evidence"]["planHash"] = json!(format!("{:x}", Sha256::digest(&plan)));
    expected["results"][0]["evidence"]["verifierSourceHash"] = json!(verifier_source_hash());
    let expected = canonicalize(&serde_json::to_vec(&expected).unwrap()).unwrap();
    let mut engine = Engine::new();
    let mut observations = Vec::new();
    for cycle in 0..40 {
        let admission = engine.ingest_subject(&request, primary, vec![]).unwrap();
        assert_eq!(
            admission,
            corpus["admissionUtf8"].as_str().unwrap().as_bytes()
        );
        let admission: Value = serde_json::from_slice(&admission).unwrap();
        let result = engine.evaluate_plan(&plan).unwrap();
        assert_eq!(result, expected);
        let used = engine.plate_retention.used.get();
        assert!(used > 0);
        let handle: Value = serde_json::from_slice(
            &engine
                .subject_handle(
                    &serde_json::to_vec(&json!({
                        "method": "subjectHandle", "requestId": "handle", "protocolVersion": 3,
                        "registryVersion": 5, "canonicalProfile": "geospec-jcs-v1",
                        "subjectHash": admission["result"]["subject"]["subjectHash"]
                    }))
                    .unwrap(),
                )
                .unwrap(),
        )
        .unwrap();
        let released: Value = serde_json::from_slice(
            &engine
                .release_subject(
                    &serde_json::to_vec(&json!({
                        "method": "releaseSubject", "requestId": "release", "protocolVersion": 3,
                        "registryVersion": 5, "canonicalProfile": "geospec-jcs-v1",
                        "subjectHandle": handle["result"]["subjectHandle"]
                    }))
                    .unwrap(),
                )
                .unwrap(),
        )
        .unwrap();
        assert_eq!(released["result"]["released"], true);
        assert!(engine.subjects.is_empty());
        assert_eq!(engine.plate_retention.used.get(), 0);
        observations.push(
            json!({"cycle": cycle, "verifiedBytes": used, "afterReleaseBytes": 0,
            "canonicalResultUtf8": String::from_utf8(result).unwrap()}),
        );
    }
    if let Some(output) = std::env::var_os("GEOSPEC_M1_F1_RELEASE_OUTPUT") {
        std::fs::write(output, serde_json::to_vec_pretty(&observations).unwrap()).unwrap();
    }
}
