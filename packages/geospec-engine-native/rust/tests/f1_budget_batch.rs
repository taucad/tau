//! Owner-private ordinary controls for F1 logical budgets and complete batches.

use super::*;
use crate::{Engine, ProtocolError};
use serde::Deserialize;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{fs, path::Path};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Corpus {
    status: String,
    basis_corpus_sha256: String,
    primary_utf8: String,
    primary_sha256: String,
    ingest_request_utf8: String,
    admission_utf8: String,
    budget_cases: Vec<BudgetCase>,
    batches: Vec<BatchCase>,
    late_invalid: LateInvalid,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct BudgetCase {
    id: String,
    budget: u64,
    expected_units_used: u64,
    expected_published_after_cold: bool,
    submit_request_utf8: String,
    canonical_plan_utf8: String,
    neutral_result_utf8: String,
    submit_response_utf8: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct BatchCase {
    id: String,
    submit_request_utf8: String,
    canonical_plan_utf8: String,
    neutral_result_utf8: String,
    submit_response_utf8: String,
    expected_units_per_claim: u64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LateInvalid {
    submit_request_utf8: String,
    expected_error_code: String,
    expected_error_message: String,
    expected_geometry_cell_published: bool,
    expected_retained_growth_after_admission: usize,
}

#[derive(Clone, Copy)]
struct PlateState {
    published: bool,
    owned_bytes: usize,
    retention_used: usize,
    identity: Option<*const PlateAnalysis>,
}

fn sha256(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn load_corpus() -> (Corpus, String) {
    let input = std::env::var_os("GEOSPEC_F1_BUDGET_CORPUS")
        .expect("Lead must supply the Principal-approved F1 budget/batch corpus");
    let expected_hash = std::env::var("GEOSPEC_F1_BUDGET_CORPUS_SHA256")
        .expect("Lead must supply the independently reviewed F1 budget/batch corpus hash");
    let bytes = fs::read(input).unwrap();
    assert_eq!(sha256(&bytes), expected_hash);
    let corpus: Corpus = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(sha256(corpus.primary_utf8.as_bytes()), corpus.primary_sha256);
    assert_eq!(corpus.budget_cases.len(), 16);
    assert_eq!(corpus.batches.len(), 2);
    (corpus, expected_hash)
}

fn observe(result: Result<Vec<u8>, ProtocolError>, expected: &str) -> Value {
    let expected_sha256 = sha256(expected.as_bytes());
    match result {
        Ok(bytes) => json!({
            "passed": bytes == expected.as_bytes(),
            "actualSha256": sha256(&bytes),
            "actualUtf8": String::from_utf8(bytes).unwrap(),
            "expectedSha256": expected_sha256,
        }),
        Err(error) => json!({
            "passed": false,
            "actualErrorCode": error.code(),
            "actualErrorMessage": error.to_string(),
            "expectedSha256": expected_sha256,
        }),
    }
}

fn observe_error(result: Result<Vec<u8>, ProtocolError>, code: &str, message: &str) -> Value {
    match result {
        Ok(bytes) => json!({
            "passed": false,
            "actualSha256": sha256(&bytes),
            "actualUtf8": String::from_utf8(bytes).unwrap(),
            "expectedCode": code,
            "expectedMessageSha256": sha256(message.as_bytes()),
        }),
        Err(error) => json!({
            "passed": error.code() == code && error.to_string() == message,
            "actualErrorCode": error.code(),
            "actualErrorMessage": error.to_string(),
            "expectedCode": code,
            "expectedMessageSha256": sha256(message.as_bytes()),
        }),
    }
}

fn admit(engine: &mut Engine, corpus: &Corpus) -> Value {
    observe(
        engine.ingest_subject(
            corpus.ingest_request_utf8.as_bytes(),
            corpus.primary_utf8.as_bytes().to_vec(),
            Vec::new(),
        ),
        &corpus.admission_utf8,
    )
}

fn rational_subject(engine: &Engine) -> Option<&RationalSubject> {
    engine
        .subjects
        .values()
        .find_map(|subject| subject.rational_plate.as_ref())
}

fn plate_state(engine: &Engine) -> PlateState {
    let plate = rational_subject(engine);
    PlateState {
        published: plate.is_some_and(|value| value.verified.get().is_some()),
        owned_bytes: plate.map_or(0, |value| value.bytes.get()),
        retention_used: engine.plate_retention.used.get(),
        identity: plate.and_then(|value| value.verified.get().map(std::ptr::from_ref)),
    }
}

fn state_json(state: PlateState) -> Value {
    json!({
        "published": state.published,
        "ownedBytes": state.owned_bytes,
        "retentionUsed": state.retention_used,
    })
}

fn unchanged_cell(before: PlateState, after: PlateState) -> bool {
    before.published
        && after.published
        && before.owned_bytes == after.owned_bytes
        && before.retention_used == after.retention_used
        && before.identity == after.identity
}

fn save_evidence(name: &str, report: &Value) {
    let directory = std::env::var_os("GEOSPEC_F1_BUDGET_EVIDENCE_DIR")
        .expect("Lead must supply a fresh F1 budget/batch evidence directory");
    fs::create_dir_all(&directory).unwrap();
    let output = Path::new(&directory).join(name);
    let file = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(output)
        .expect("Use a fresh evidence attempt directory");
    serde_json::to_writer_pretty(file, report).unwrap();
}

#[test]
fn f1_budget_boundaries_match_cold_and_warm() {
    let (corpus, corpus_sha256) = load_corpus();
    let warm_case = corpus
        .budget_cases
        .iter()
        .find(|case| case.id == "f1-budget-58-positive")
        .unwrap();
    let mut public_records = Vec::new();
    let mut direct_records = Vec::new();

    for case in &corpus.budget_cases {
        for route in ["neutral", "submit"] {
            for phase in ["cold", "warm"] {
                let mut engine = Engine::new();
                let admission = admit(&mut engine, &corpus);
                let prewarm = if phase == "warm" {
                    observe(
                        engine.process_request(warm_case.submit_request_utf8.as_bytes()),
                        &warm_case.submit_response_utf8,
                    )
                } else {
                    json!({"passed": true, "skipped": true})
                };
                let before = plate_state(&engine);
                let canonical = observe(
                    engine.canonical_plan(case.submit_request_utf8.as_bytes()),
                    &case.canonical_plan_utf8,
                );
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
                let after = plate_state(&engine);
                let state_passed = if phase == "warm" {
                    unchanged_cell(before, after)
                } else if case.expected_published_after_cold {
                    !before.published
                        && after.published
                        && after.owned_bytes > before.owned_bytes
                        && after.retention_used > before.retention_used
                } else {
                    !before.published
                        && !after.published
                        && before.owned_bytes == after.owned_bytes
                        && before.retention_used == after.retention_used
                };
                let passed = admission["passed"] == true
                    && prewarm["passed"] == true
                    && canonical["passed"] == true
                    && result["passed"] == true
                    && state_passed;
                public_records.push(json!({
                    "id": case.id,
                    "budget": case.budget,
                    "route": route,
                    "phase": phase,
                    "passed": passed,
                    "admission": admission,
                    "prewarm": prewarm,
                    "canonical": canonical,
                    "result": result,
                    "statePassed": state_passed,
                    "before": state_json(before),
                    "after": state_json(after),
                }));
            }
        }

        for phase in ["cold", "warm"] {
            let mut engine = Engine::new();
            let admission = admit(&mut engine, &corpus);
            let prewarm = if phase == "warm" {
                observe(
                    engine.process_request(warm_case.submit_request_utf8.as_bytes()),
                    &warm_case.submit_response_utf8,
                )
            } else {
                json!({"passed": true, "skipped": true})
            };
            let before = plate_state(&engine);
            let budget = Budget::new(case.budget);
            let outcome = match rational_subject(&engine)
                .expect("admitted F1 subject")
                .geometry(&budget)
            {
                Ok(_) => "completed",
                Err(_) => "refused",
            };
            let after = plate_state(&engine);
            let expected_completed = case.expected_published_after_cold;
            let state_passed = if phase == "warm" {
                unchanged_cell(before, after)
            } else if expected_completed {
                !before.published && after.published
            } else {
                !before.published
                    && !after.published
                    && before.owned_bytes == after.owned_bytes
                    && before.retention_used == after.retention_used
            };
            let passed = admission["passed"] == true
                && prewarm["passed"] == true
                && budget.used() == case.expected_units_used
                && (outcome == "completed") == expected_completed
                && state_passed;
            direct_records.push(json!({
                "id": case.id,
                "budget": case.budget,
                "phase": phase,
                "passed": passed,
                "expectedUnitsUsed": case.expected_units_used,
                "actualUnitsUsed": budget.used(),
                "outcome": outcome,
                "admission": admission,
                "prewarm": prewarm,
                "statePassed": state_passed,
                "before": state_json(before),
                "after": state_json(after),
            }));
        }
    }

    let passed = public_records.iter().all(|row| row["passed"] == true)
        && direct_records.iter().all(|row| row["passed"] == true);
    let report = json!({
        "test": "f1_budget_boundaries_match_cold_and_warm",
        "status": corpus.status,
        "basisCorpusSha256": corpus.basis_corpus_sha256,
        "corpusSha256": corpus_sha256,
        "publicRecordCount": public_records.len(),
        "directRecordCount": direct_records.len(),
        "passed": passed,
        "publicRecords": public_records,
        "directBudgetRecords": direct_records,
    });
    save_evidence("f1-budget-boundaries.json", &report);
    assert!(passed, "Complete budget observations were saved before assertion");
}

#[test]
fn f1_batch_bindings_are_fresh_per_plan_and_claim() {
    let (corpus, corpus_sha256) = load_corpus();
    let warm_case = corpus
        .budget_cases
        .iter()
        .find(|case| case.id == "f1-budget-58-positive")
        .unwrap();
    let mut records = Vec::new();

    for batch in &corpus.batches {
        for route in ["neutral", "submit"] {
            for phase in ["cold", "warm"] {
                let mut engine = Engine::new();
                let admission = admit(&mut engine, &corpus);
                let prewarm = if phase == "warm" {
                    observe(
                        engine.process_request(warm_case.submit_request_utf8.as_bytes()),
                        &warm_case.submit_response_utf8,
                    )
                } else {
                    json!({"passed": true, "skipped": true})
                };
                let before = plate_state(&engine);
                let canonical = observe(
                    engine.canonical_plan(batch.submit_request_utf8.as_bytes()),
                    &batch.canonical_plan_utf8,
                );
                let result = if route == "neutral" {
                    observe(
                        engine.evaluate_plan(batch.canonical_plan_utf8.as_bytes()),
                        &batch.neutral_result_utf8,
                    )
                } else {
                    observe(
                        engine.process_request(batch.submit_request_utf8.as_bytes()),
                        &batch.submit_response_utf8,
                    )
                };
                let after = plate_state(&engine);
                let state_passed = if phase == "warm" {
                    unchanged_cell(before, after)
                } else {
                    !before.published
                        && after.published
                        && after.owned_bytes > before.owned_bytes
                        && after.retention_used > before.retention_used
                };
                let passed = admission["passed"] == true
                    && prewarm["passed"] == true
                    && canonical["passed"] == true
                    && result["passed"] == true
                    && batch.expected_units_per_claim == 58
                    && state_passed;
                records.push(json!({
                    "id": batch.id,
                    "route": route,
                    "phase": phase,
                    "expectedUnitsPerClaim": batch.expected_units_per_claim,
                    "passed": passed,
                    "admission": admission,
                    "prewarm": prewarm,
                    "canonical": canonical,
                    "result": result,
                    "statePassed": state_passed,
                    "before": state_json(before),
                    "after": state_json(after),
                }));
            }
        }
    }

    let mut shared = Engine::new();
    let shared_admission = admit(&mut shared, &corpus);
    let first = &corpus.batches[0];
    let first_result = observe(
        shared.process_request(first.submit_request_utf8.as_bytes()),
        &first.submit_response_utf8,
    );
    let first_state = plate_state(&shared);
    let second = &corpus.batches[1];
    let second_result = observe(
        shared.process_request(second.submit_request_utf8.as_bytes()),
        &second.submit_response_utf8,
    );
    let second_state = plate_state(&shared);
    let shared_passed = shared_admission["passed"] == true
        && first_result["passed"] == true
        && second_result["passed"] == true
        && unchanged_cell(first_state, second_state);
    let shared_observation = json!({
        "passed": shared_passed,
        "admission": shared_admission,
        "firstBatch": first.id,
        "firstResult": first_result,
        "firstState": state_json(first_state),
        "secondBatch": second.id,
        "secondResult": second_result,
        "secondState": state_json(second_state),
        "sameTypedGeometryIdentity": first_state.identity == second_state.identity,
        "stableAccountedBytes": first_state.owned_bytes == second_state.owned_bytes
            && first_state.retention_used == second_state.retention_used,
    });
    let passed = records.iter().all(|row| row["passed"] == true) && shared_passed;
    let report = json!({
        "test": "f1_batch_bindings_are_fresh_per_plan_and_claim",
        "status": corpus.status,
        "corpusSha256": corpus_sha256,
        "recordCount": records.len(),
        "passed": passed,
        "records": records,
        "sharedTargetObservation": shared_observation,
    });
    save_evidence("f1-batch-bindings.json", &report);
    assert!(passed, "Complete batch observations were saved before assertion");
}

#[test]
fn f1_late_negative_query_prevents_geometry_evaluation() {
    let (corpus, corpus_sha256) = load_corpus();
    let mut engine = Engine::new();
    let admission = admit(&mut engine, &corpus);
    let before = plate_state(&engine);
    let result = observe_error(
        engine.process_request(corpus.late_invalid.submit_request_utf8.as_bytes()),
        &corpus.late_invalid.expected_error_code,
        &corpus.late_invalid.expected_error_message,
    );
    let after = plate_state(&engine);
    let retained_growth = after.retention_used.saturating_sub(before.retention_used);
    let owned_growth = after.owned_bytes.saturating_sub(before.owned_bytes);
    let passed = admission["passed"] == true
        && result["passed"] == true
        && before.published == corpus.late_invalid.expected_geometry_cell_published
        && after.published == corpus.late_invalid.expected_geometry_cell_published
        && retained_growth == corpus.late_invalid.expected_retained_growth_after_admission
        && owned_growth == corpus.late_invalid.expected_retained_growth_after_admission;
    let report = json!({
        "test": "f1_late_negative_query_prevents_geometry_evaluation",
        "status": corpus.status,
        "corpusSha256": corpus_sha256,
        "passed": passed,
        "admission": admission,
        "result": result,
        "before": state_json(before),
        "after": state_json(after),
        "retainedGrowthAfterAdmission": retained_growth,
        "ownedGrowthAfterAdmission": owned_growth,
    });
    save_evidence("f1-late-negative-query.json", &report);
    assert!(passed, "Complete barrier observations were saved before assertion");
}
