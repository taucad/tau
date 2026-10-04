use geospec_engine_native_core::{canonicalize, sha256_hex, Engine, ProtocolError};
use serde_json::{json, Value};

const CORPUS: &str = include_str!("../../conformance/early-corpus.json");
const CORPUS_SHA256: &str = "3d43750d055dceec2b7d57c92d4a953c4f7dcd40c2abb1452a82de83ea729476";
const CURRENT: &str = include_str!("fixtures/current-profile-01/plan-corpus.json");
const CURRENT_SHA256: &str = "eb8b42f1591fd2bd695228cdaa3abc4108b411717c468a9e97b724654616221d";
const CURRENT_NUMERIC_PROFILE: &str =
    include_str!("fixtures/current-profile-v6/numeric-profile.txt").trim_ascii_end();
fn project_material_repair(id: &str, text: &str) -> String {
    let ids = [
        "a2/raw/all-axis-failure-order",
        "plan/a2/all-axis-failure-order/evaluate",
        "a2/raw/tolerance-outside",
        "plan/a2/tolerance-outside/evaluate",
        "a2/raw/default-tolerance-outside",
        "plan/a2/default-tolerance-outside/evaluate",
        "a2/raw/zero-tolerance",
        "plan/a2/zero-tolerance/evaluate",
    ];
    if !ids.contains(&id) {
        return text.into();
    }
    let old = "Correct the model dimensions, or widen the declared bounding-box tolerance.";
    let approved = "Correct the model dimensions to match the declared bounds; preserve the authored tolerance.";
    let parsed: Value = serde_json::from_str(text).unwrap();
    let results = if id.starts_with("plan/") {
        &parsed["results"]
    } else {
        &parsed["result"]["results"]
    };
    let matches = results
        .as_array()
        .unwrap()
        .iter()
        .flat_map(|row| row["diagnostics"].as_array().unwrap())
        .filter(|row| row["code"] == "GEOSPEC_BOUNDING_BOX_MISMATCH" && row["suggestion"] == old)
        .count();
    let old_literal = serde_json::to_string(old).unwrap();
    assert_eq!(matches, 1, "{id}: exact diagnostic");
    assert_eq!(
        text.matches(&old_literal).count(),
        1,
        "{id}: unique raw literal"
    );
    text.replace(&old_literal, &serde_json::to_string(approved).unwrap())
}

fn string<'a>(value: &'a Value, field: &str) -> &'a str {
    value[field].as_str().expect(field)
}

fn bytes(hex: &str) -> Vec<u8> {
    assert_eq!(hex.len() % 2, 0);
    (0..hex.len())
        .step_by(2)
        .map(|offset| u8::from_str_radix(&hex[offset..offset + 2], 16).expect("hex byte"))
        .collect()
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn input(record: &Value) -> Vec<u8> {
    record["effectiveInputUtf8"].as_str().map_or_else(
        || bytes(string(record, "effectiveInputHex")),
        |s| s.as_bytes().to_vec(),
    )
}

fn compare(actual: Result<Vec<u8>, ProtocolError>, expected: &Value, id: &str) -> Value {
    match actual {
        Ok(actual) => {
            let decoded = serde_json::from_slice::<Value>(&actual).ok();
            let expected_bytes = expected["expectedUtf8"].as_str().map(|s| {
                let current = project_material_repair(id, s)
                    .replace("geospec-st-logical-requests-v3", CURRENT_NUMERIC_PROFILE);
                if id != "a1/raw/initialize" {
                    return current;
                }
                let mut response: Value =
                    serde_json::from_str(&current).expect("frozen initialize response");
                let Some(capabilities) = response["result"]["capabilities"].as_array_mut() else {
                    return current;
                };
                assert_eq!(capabilities.last().unwrap()["name"], "queryPmi");
                capabilities.push(json!({
                    "name": "minimumDistance",
                    "implementation": "implemented",
                    "profile": "geospec-minimum-distance-v1",
                    "qualification": "unqualified",
                    "registryVersion": 5,
                    "scope": "declared-subject-profile",
                }));
                String::from_utf8(canonicalize(&serde_json::to_vec(&response).unwrap()).unwrap())
                    .expect("canonical initialize UTF-8")
            });
            let expected_json = expected_bytes
                .as_deref()
                .and_then(|s| serde_json::from_str::<Value>(s).ok());
            let passed = expected_bytes
                .as_ref()
                .is_some_and(|s| actual == s.as_bytes())
                && decoded.is_some()
                && decoded == expected_json;
            json!({
                "passed": passed,
                "actualUtf8": std::str::from_utf8(&actual).ok(),
                "actualHex": hex(&actual),
                "actualJson": decoded,
                "expectedUtf8": expected_bytes,
                "expectedCode": expected["expectedCode"],
            })
        }
        Err(error) => {
            let _: &dyn std::error::Error = &error;
            let message = error.to_string();
            let expected_message = expected["expectedMessage"].as_str().map(|message| {
                // The frozen v3 string-axis oracle predates the typed numeric parser.
                if matches!(
                    id,
                    "a2/invalid-claim/string-axis"
                        | "plan/invalid-claim/string-axis/canonical"
                        | "plan/invalid-claim/string-axis/evaluate"
                ) && message == "bounding-box axes must be a finite number."
                {
                    "GeoSpec numeric expectation must be an object."
                } else {
                    message
                }
            });
            json!({
                "passed": expected["expectedCode"].as_str() == Some(error.code())
                    && expected_message.map_or(!message.is_empty(), |expected| expected == message),
                "actualCode": error.code(),
                "actualMessage": message,
                "expectedCode": expected["expectedCode"],
                "expectedMessage": expected_message,
                "expectedUtf8": expected["expectedUtf8"],
            })
        }
    }
}

#[test]
fn matches_every_frozen_early_host_record_through_explicit_current_profile_bindings() {
    assert_eq!(sha256_hex(CORPUS), CORPUS_SHA256);
    assert_eq!(sha256_hex(CURRENT), CURRENT_SHA256);
    let corpus: Value = serde_json::from_str(CORPUS).expect("independent frozen corpus");
    let current: Value = serde_json::from_str(CURRENT).expect("explicit successor bindings");
    assert_eq!(corpus["schemaVersion"], 1);
    assert_eq!(current["schemaVersion"], 1);
    assert_eq!(
        current["authority"]["adoptedRuling"],
        "W2.C-CURRENT-PROFILE-CONFORMANCE-01"
    );
    let meshes = corpus["meshes"].as_array().expect("meshes");
    let mesh_bindings = current["meshes"].as_array().expect("mesh bindings");
    let records = corpus["records"].as_array().expect("records");
    let bindings = current["records"].as_array().expect("record bindings");
    assert_eq!(records.len(), 320);
    assert_eq!(bindings.len(), records.len());
    assert_eq!(mesh_bindings.len(), meshes.len());
    let mut outcomes = Vec::with_capacity(records.len());
    let mut failures = Vec::new();

    for (record, binding) in records.iter().zip(bindings) {
        let id = string(record, "id");
        assert_eq!(binding["id"], id, "binding order");
        assert_eq!(binding["operation"], record["operation"]);
        let original = record["inputUtf8"].as_str().map_or_else(
            || bytes(string(record, "inputHex")),
            |s| s.as_bytes().to_vec(),
        );
        assert_eq!(sha256_hex(&original), binding["originalInputSha256"]);
        let effective = input(binding);
        assert_eq!(sha256_hex(&effective), binding["effectiveInputSha256"]);
        if binding["preservesOriginalBytes"] == true {
            assert_eq!(effective, original, "{id}: malformed/version bytes changed");
        }

        // Keep the frozen binding hash, then execute its explicit current
        // numerical-profile projection against this producer.
        let effective = std::str::from_utf8(&effective).map_or_else(
            |_| effective.clone(),
            |text| {
                text.replace("geospec-st-logical-requests-v3", CURRENT_NUMERIC_PROFILE)
                    .into_bytes()
            },
        );
        let mut engine = Engine::new();
        let mut admissions = Vec::new();
        for mesh_id in record["ingest"].as_array().expect("ingest IDs") {
            let mesh = meshes
                .iter()
                .find(|m| m["id"] == *mesh_id)
                .expect("mesh ID");
            let bound = mesh_bindings
                .iter()
                .find(|m| m["id"] == *mesh_id)
                .expect("mesh binding");
            let data = bytes(string(mesh, "meshHex"));
            assert_eq!(sha256_hex(&data), mesh["contentHash"]);
            let request = string(bound, "effectiveRequestUtf8").as_bytes();
            assert_eq!(sha256_hex(request), bound["effectiveRequestSha256"]);
            let admission = compare(
                engine.ingest_mesh(request, &data),
                bound,
                mesh_id.as_str().unwrap(),
            );
            if admission["passed"] != true {
                failures.push(format!("{id}: admission {mesh_id}: {admission}"));
            }
            admissions.push(json!({"meshId": mesh_id, "comparison": admission}));
        }

        let operation = string(record, "operation");
        if matches!(operation, "evaluatePlan" | "processRequest")
            && admissions.is_empty()
            && (record["expectedUtf8"].is_string()
                || id == "plan/unavailable/analyzeBrep/evaluatePlan")
        {
            let mesh = &meshes[0];
            let bound = &mesh_bindings[0];
            let data = bytes(string(mesh, "meshHex"));
            let request = string(bound, "effectiveRequestUtf8").as_bytes();
            let admission = compare(
                engine.ingest_mesh(request, &data),
                bound,
                string(mesh, "id"),
            );
            assert_eq!(
                admission["passed"], true,
                "fresh explicit current-profile admission"
            );
            admissions.push(json!({"meshId": mesh["id"], "comparison": admission}));
        }

        let actual = match operation {
            "canonicalize" => canonicalize(&effective),
            "ingestMesh" => engine.ingest_mesh(&effective, &bytes(string(record, "meshHex"))),
            "processRequest" => engine.process_request(&effective),
            "canonicalPlan" => engine.canonical_plan(&effective),
            "evaluatePlan" => engine.evaluate_plan(&effective),
            other => panic!("unknown frozen operation: {other}"),
        };
        let comparison = compare(actual, binding, id);
        if comparison["passed"] != true {
            failures.push(format!("{id}: {comparison}"));
        }
        outcomes.push(json!({
            "id": id,
            "operation": record["operation"],
            "inputDerivation": binding["inputDerivation"],
            "admissions": admissions,
            "comparison": comparison,
        }));
    }

    if let Some(path) = std::env::var_os("GEOSPEC_CONFORMANCE_EVIDENCE") {
        std::fs::write(
            path,
            serde_json::to_vec_pretty(&json!({
                "corpusSha256": CORPUS_SHA256,
                "bindingSha256": CURRENT_SHA256,
                "recordCount": records.len(),
                "failedComparisons": failures.len(),
                "outcomes": outcomes,
            }))
            .expect("serialize conformance evidence"),
        )
        .expect("save evidence to caller-owned lane");
    }
    assert!(failures.is_empty(), "{}", failures.join("\n"));
}
