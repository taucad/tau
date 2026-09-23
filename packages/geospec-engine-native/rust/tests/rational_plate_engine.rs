//! Engine-only consumer of independently frozen complete F1 wire expectations.
//! This module is registered through the existing rational_plate_producer test
//! crate to avoid an incidental change to the verifier's Cargo source closure.

use geospec_engine_native_core::{canonicalize, Engine, ProtocolError};
use serde::Deserialize;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{fs, path::Path};

const CORPUS_SHA256: &str = "b1b605506f72304ccec2484506a39786f203d89e793eaab5e0125d246388d5a3";
const VERIFIER_SOURCE_HASH: &str =
    "79cf6bca840e45dd5703b6892e5c5a75e27e2ec67ff61d03703d602c41fb6ed4";

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Corpus {
    authority: String,
    verifier_source_hash: String,
    cases: Vec<Case>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Case {
    id: String,
    primary_utf8: String,
    primary_sha256: String,
    ingest_request_utf8: String,
    admission_utf8: String,
    submit_request_utf8: String,
    canonical_plan_utf8: String,
    neutral_result_utf8: String,
    submit_response_utf8: String,
}

fn sha256(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn verifier_source_hash() -> String {
    let value = std::env::var("GEOSPEC_F1_VERIFIER_SOURCE_HASH")
        .unwrap_or_else(|_| VERIFIER_SOURCE_HASH.into());
    assert_eq!(value, VERIFIER_SOURCE_HASH, "stale verifier source binding");
    value
}

fn current_request(value: &str) -> String {
    let mut value: Value = serde_json::from_str(value).unwrap();
    value["registryVersion"] = json!(5);
    serde_json::to_string(&value).unwrap()
}

fn current_plan(value: &str) -> String {
    let mut value: Value = serde_json::from_str(value).unwrap();
    value["registryVersion"] = json!(5);
    value["numericProfile"] = json!("geospec-st-prototypes-v4");
    String::from_utf8(canonicalize(&serde_json::to_vec(&value).unwrap()).unwrap()).unwrap()
}

fn current_result(value: &str, plan: &str) -> String {
    let mut value: Value = serde_json::from_str(value).unwrap();
    let result = if value.get("result").is_some() {
        &mut value["result"]
    } else {
        &mut value
    };
    result["numericProfile"] = json!("geospec-st-prototypes-v4");
    let plan_hash = sha256(plan.as_bytes());
    let verifier_source_hash = verifier_source_hash();
    for row in result["results"].as_array_mut().unwrap() {
        if row["evidence"].is_object() {
            row["evidence"]["planHash"] = json!(plan_hash);
            row["evidence"]["verifierSourceHash"] = json!(verifier_source_hash);
        }
    }
    String::from_utf8(canonicalize(&serde_json::to_vec(&value).unwrap()).unwrap()).unwrap()
}

fn observe(result: Result<Vec<u8>, ProtocolError>, expected: &str) -> Value {
    match result {
        Ok(bytes) => json!({
            "passed": bytes == expected.as_bytes(),
            "actualSha256": sha256(&bytes),
            "actualUtf8": String::from_utf8(bytes).unwrap(),
            "expectedUtf8": expected,
        }),
        Err(error) => json!({
            "passed": false, "actualErrorCode": error.code(),
            "actualErrorMessage": error.to_string(), "expectedUtf8": expected,
        }),
    }
}

#[test]
fn rational_plate_engine_matches_frozen_fullwire_cold_and_warm() {
    let bytes = std::env::var_os("GEOSPEC_F1_ENGINE_CORPUS").map_or_else(
        || include_bytes!("fixtures/portable-controls/f1-engine-fullwire.json").to_vec(),
        |path| fs::read(path).unwrap(),
    );
    let expected_hash =
        std::env::var("GEOSPEC_F1_ENGINE_CORPUS_SHA256").unwrap_or_else(|_| CORPUS_SHA256.into());
    assert_eq!(expected_hash, CORPUS_SHA256, "stale control hash binding");
    assert_eq!(sha256(&bytes), CORPUS_SHA256);
    let corpus: Corpus = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(corpus.cases.len(), 12);
    assert!(!corpus.authority.is_empty());
    assert_eq!(
        corpus.verifier_source_hash,
        "cbf1df63a329f71fdc772938eb3a8a16f42d52983f82ccaf6966ea4182f4542c"
    );
    let mut records = Vec::new();
    for case in corpus.cases {
        assert_eq!(sha256(case.primary_utf8.as_bytes()), case.primary_sha256);
        let ingest_request = current_request(&case.ingest_request_utf8);
        let submit_request = current_request(&case.submit_request_utf8);
        let canonical_plan = current_plan(&case.canonical_plan_utf8);
        let neutral_result = current_result(&case.neutral_result_utf8, &canonical_plan);
        let submit_response = current_result(&case.submit_response_utf8, &canonical_plan);
        // Separate engines make each public evaluation route cold once, then
        // warm. No geometry/certificate projection is implemented by this test.
        for route in ["neutral", "submit"] {
            let mut engine = Engine::new();
            let admission = observe(
                engine.ingest_subject(
                    ingest_request.as_bytes(),
                    case.primary_utf8.as_bytes().to_vec(),
                    Vec::new(),
                ),
                &case.admission_utf8,
            );
            let canonical = observe(
                engine.canonical_plan(submit_request.as_bytes()),
                &canonical_plan,
            );
            for phase in ["cold", "warm"] {
                let result = if route == "neutral" {
                    observe(
                        engine.evaluate_plan(canonical_plan.as_bytes()),
                        &neutral_result,
                    )
                } else {
                    observe(
                        engine.process_request(submit_request.as_bytes()),
                        &submit_response,
                    )
                };
                let passed = [&admission, &canonical, &result]
                    .iter()
                    .all(|value| value["passed"] == true);
                records.push(json!({
                    "id": case.id, "route": route, "phase": phase,
                    "passed": passed, "admission": admission,
                    "canonical": canonical, "result": result,
                }));
            }
        }
    }
    let passed = records.iter().all(|row| row["passed"] == true);
    let report = json!({
        "authority": corpus.authority, "corpusSha256": CORPUS_SHA256,
        "verifierSourceHash": corpus.verifier_source_hash,
        "recordCount": records.len(), "passed": passed, "records": records,
        "scope": "Complete ordinary engine bytes only; no cache counter, whole-batch cost, target-matrix or held-test qualification.",
    });
    if let Some(evidence) = std::env::var_os("GEOSPEC_F1_ENGINE_EVIDENCE_DIR") {
        fs::create_dir_all(&evidence).unwrap();
        let output = Path::new(&evidence).join("fullwire-cold-warm.json");
        assert!(!output.exists(), "Use a fresh attempt directory");
        fs::write(output, serde_json::to_vec_pretty(&report).unwrap()).unwrap();
    }
    println!("{report}");
    assert!(
        passed,
        "Full mismatches were saved before this aggregate assertion"
    );
}
