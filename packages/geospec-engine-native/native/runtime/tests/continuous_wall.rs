use geospec_engine_native_runtime::{create_engine, EngineConfig};
use serde_json::{json, Value};

const CURRENT_PROFILE: &str =
    include_str!("../../../rust/tests/fixtures/current-profile-v6/numeric-profile.txt").trim_ascii_end();

fn current(value: &str) -> String {
    value
        .replace("\"registryVersion\":4", "\"registryVersion\":5")
        .replace("geospec-st-logical-requests-v2", CURRENT_PROFILE)
}

#[test]
fn six_independent_box_rows_match_complete_runtime_bytes_cold_and_warm() {
    let oracle: Value = serde_json::from_str(include_str!(
        "../../../conformance/continuous-wall-box-a3.json"
    ))
    .unwrap();
    let mut outcomes = Vec::new();
    for row in oracle["rows"].as_array().unwrap() {
        let mut engine = create_engine(EngineConfig::entry()).unwrap();
        let admission = engine
            .ingest_subject(
                current(oracle["subject"]["ingestRequestUtf8"].as_str().unwrap()).as_bytes(),
                include_bytes!("../../occt/rust/tests/fixtures/ap242-box.step"),
                vec![],
            )
            .unwrap();
        let admitted: Value = serde_json::from_slice(&admission).unwrap();
        assert_eq!(
            admitted["result"]["subject"]["subjectHash"],
            oracle["subject"]["subjectHash"]
        );
        for temperature in ["cold", "warm"] {
            let request = current(row["authoredRequestUtf8"].as_str().unwrap());
            let request = request.as_bytes();
            let plan = engine.canonical_plan(request).unwrap();
            let result = engine.evaluate_plan(&plan).unwrap();
            let submit = engine.process_request(request).unwrap();
            let actual = [
                String::from_utf8(plan).unwrap(),
                String::from_utf8(result).unwrap(),
                String::from_utf8(submit).unwrap(),
            ];
            let passed = actual[0] == current(row["canonicalPlanUtf8"].as_str().unwrap())
                && actual[1] == current(row["evaluatePlanResultUtf8"].as_str().unwrap())
                && actual[2] == current(row["submitClaimsResultUtf8"].as_str().unwrap());
            outcomes.push(json!({"id":row["id"],"temperature":temperature,"passed":passed,
                "admissionUtf8":String::from_utf8_lossy(&admission),
                "canonicalPlanUtf8":actual[0],"evaluatePlanResultUtf8":actual[1],"submitClaimsResultUtf8":actual[2]}));
        }
    }
    if let Some(path) = std::env::var_os("GEOSPEC_BOX_EVIDENCE") {
        std::fs::write(path, serde_json::to_vec_pretty(&outcomes).unwrap()).unwrap();
    }
    assert!(
        outcomes.iter().all(|row| row["passed"] == true),
        "{}",
        serde_json::to_string_pretty(&outcomes).unwrap()
    );
}
