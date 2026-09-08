use geospec_engine_native_core::{canonicalize, Engine, ProtocolError};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

// Independent literals frozen before this candidate was read or executed.
const CORPUS: &str = include_str!("../../conformance/early-corpus.json");
const CORPUS_SHA256: &str = "3d43750d055dceec2b7d57c92d4a953c4f7dcd40c2abb1452a82de83ea729476";

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

fn compare(actual: Result<Vec<u8>, ProtocolError>, expected: &Value) -> Value {
    match actual {
        Ok(actual) => {
            let decoded = serde_json::from_slice::<Value>(&actual).ok();
            let expected_bytes = expected["expectedUtf8"].as_str();
            let expected_json = expected_bytes.and_then(|s| serde_json::from_str::<Value>(s).ok());
            let passed = expected_bytes.is_some_and(|s| actual == s.as_bytes())
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
            json!({
                "passed": expected["expectedCode"].as_str() == Some(error.code())
                    && !message.is_empty(),
                "actualCode": error.code(),
                "actualMessage": message,
                "expectedCode": expected["expectedCode"],
                "expectedUtf8": expected["expectedUtf8"],
            })
        }
    }
}

#[test]
fn matches_every_frozen_early_host_record_through_public_byte_operations() {
    assert_eq!(format!("{:x}", Sha256::digest(CORPUS)), CORPUS_SHA256);
    let corpus: Value = serde_json::from_str(CORPUS).expect("independent frozen corpus");
    assert_eq!(corpus["schemaVersion"], 1);
    let meshes = corpus["meshes"].as_array().expect("meshes");
    let records = corpus["records"].as_array().expect("records");
    let mut outcomes = Vec::with_capacity(records.len());
    let mut failures = Vec::new();

    for record in records {
        let id = string(record, "id");
        let mut engine = Engine::new();
        let mut admissions = Vec::new();
        for mesh_id in record["ingest"].as_array().expect("ingest IDs") {
            let mesh = meshes
                .iter()
                .find(|m| m["id"] == *mesh_id)
                .expect("mesh ID");
            let data = bytes(string(mesh, "meshHex"));
            assert_eq!(format!("{:x}", Sha256::digest(&data)), mesh["contentHash"]);
            let admission = compare(
                engine.ingest_mesh(string(mesh, "requestUtf8").as_bytes(), &data),
                mesh,
            );
            if admission["passed"] != true {
                failures.push(format!("{id}: admission {mesh_id}: {admission}"));
            }
            admissions.push(json!({"meshId": mesh_id, "comparison": admission}));
        }

        let input = if let Some(input) = record["inputUtf8"].as_str() {
            input.as_bytes().to_vec()
        } else {
            bytes(string(record, "inputHex"))
        };
        let actual = match string(record, "operation") {
            "canonicalize" => canonicalize(&input),
            "ingestMesh" => engine.ingest_mesh(&input, &bytes(string(record, "meshHex"))),
            "processRequest" => engine.process_request(&input),
            "canonicalPlan" => engine.canonical_plan(&input),
            "evaluatePlan" => engine.evaluate_plan(&input),
            other => panic!("unknown frozen operation: {other}"),
        };
        let comparison = compare(actual, record);
        if comparison["passed"] != true {
            failures.push(format!("{id}: {comparison}"));
        }
        outcomes.push(json!({
            "id": id,
            "operation": record["operation"],
            "admissions": admissions,
            "comparison": comparison,
        }));
    }

    // Optional retained evidence stays in the caller's explicitly assigned lane.
    if let Some(path) = std::env::var_os("GEOSPEC_CONFORMANCE_EVIDENCE") {
        std::fs::write(
            path,
            serde_json::to_vec_pretty(&json!({
                "corpusSha256": CORPUS_SHA256,
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
