//! Engine-only consumer of independently frozen complete F1 wire expectations.
//! This module is registered through the existing rational_plate_producer test
//! crate to avoid an incidental change to the verifier's Cargo source closure.

use geospec_engine_native_core::{Engine, ProtocolError};
use serde::Deserialize;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{fs, path::Path};

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
    let input = std::env::var_os("GEOSPEC_F1_ENGINE_CORPUS")
        .expect("Principal-approved fullwire consumer corpus must be supplied");
    let expected_hash = std::env::var("GEOSPEC_F1_ENGINE_CORPUS_SHA256")
        .expect("Lead must supply the independently reviewed consumer corpus hash");
    let evidence = std::env::var_os("GEOSPEC_F1_ENGINE_EVIDENCE_DIR")
        .expect("Lead must supply a fresh evidence directory");
    let bytes = fs::read(input).unwrap();
    assert_eq!(sha256(&bytes), expected_hash);
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
        // Separate engines make each public evaluation route cold once, then
        // warm. No geometry/certificate projection is implemented by this test.
        for route in ["neutral", "submit"] {
            let mut engine = Engine::new();
            let admission = observe(
                engine.ingest_subject(
                    case.ingest_request_utf8.as_bytes(),
                    case.primary_utf8.as_bytes().to_vec(),
                    Vec::new(),
                ),
                &case.admission_utf8,
            );
            let canonical = observe(
                engine.canonical_plan(case.submit_request_utf8.as_bytes()),
                &case.canonical_plan_utf8,
            );
            for phase in ["cold", "warm"] {
                let result = if route == "neutral" {
                    observe(
                        engine.evaluate_plan(case.canonical_plan_utf8.as_bytes()),
                        &case.neutral_result_utf8,
                    )
                } else {
                    observe(
                        engine.process_request(case.submit_request_utf8.as_bytes()),
                        &case.submit_response_utf8,
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
        "authority": corpus.authority, "corpusSha256": expected_hash,
        "verifierSourceHash": corpus.verifier_source_hash,
        "recordCount": records.len(), "passed": passed, "records": records,
        "scope": "Complete ordinary engine bytes only; no cache counter, whole-batch cost, target-matrix or held-test qualification.",
    });
    fs::create_dir_all(&evidence).unwrap();
    let output = Path::new(&evidence).join("fullwire-cold-warm.json");
    assert!(!output.exists(), "Use a fresh attempt directory");
    fs::write(output, serde_json::to_vec_pretty(&report).unwrap()).unwrap();
    println!("{report}");
    assert!(
        passed,
        "Full mismatches were saved before this aggregate assertion"
    );
}
