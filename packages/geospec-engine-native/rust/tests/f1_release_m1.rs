//! Healthy public release returns the full verified F1 retention reservation.
use crate::Engine;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

#[test]
fn releases_verified_plate_capacity_in_healthy_sessions() {
    let input = std::fs::read(std::env::var_os("GEOSPEC_F1_BUDGET_CORPUS").unwrap()).unwrap();
    assert_eq!(
        format!("{:x}", Sha256::digest(&input)),
        std::env::var("GEOSPEC_F1_BUDGET_CORPUS_SHA256").unwrap()
    );
    let corpus: Value = serde_json::from_slice(&input).unwrap();
    let case = corpus["budgetCases"]
        .as_array()
        .unwrap()
        .iter()
        .find(|case| case["id"] == "f1-budget-58-positive")
        .unwrap();
    let primary = corpus["primaryUtf8"].as_str().unwrap().as_bytes();
    let request = corpus["ingestRequestUtf8"].as_str().unwrap().as_bytes();
    let plan = case["canonicalPlanUtf8"].as_str().unwrap().as_bytes();
    let expected = case["neutralResultUtf8"].as_str().unwrap().as_bytes();
    let mut engine = Engine::new();
    let mut observations = Vec::new();
    for cycle in 0..40 {
        let admission = engine
            .ingest_subject(request, primary.to_vec(), vec![])
            .unwrap();
        assert_eq!(
            admission,
            corpus["admissionUtf8"].as_str().unwrap().as_bytes()
        );
        let admission: Value = serde_json::from_slice(&admission).unwrap();
        let result = engine.evaluate_plan(plan).unwrap();
        assert_eq!(result, expected);
        let used = engine.plate_retention.used.get();
        assert!(used > 0);
        let handle: Value = serde_json::from_slice(
            &engine
                .subject_handle(
                    &serde_json::to_vec(&json!({
                        "method": "subjectHandle", "requestId": "handle", "protocolVersion": 3,
                        "registryVersion": 4, "canonicalProfile": "geospec-jcs-v1",
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
                        "registryVersion": 4, "canonicalProfile": "geospec-jcs-v1",
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
    let output = std::env::var_os("GEOSPEC_M1_F1_RELEASE_OUTPUT").unwrap();
    std::fs::write(output, serde_json::to_vec_pretty(&observations).unwrap()).unwrap();
}
