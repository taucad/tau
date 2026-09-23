use geospec_engine_native_core::{canonicalize, Engine};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{collections::BTreeMap, fs, path::Path};

// Independent oracle; Lead supplies an exact copy when registering this target.
const CONTROLS_SHA256: &str = "7cf3e4674e827c0baa8edc5546d8adca8d6eaabd7a32597be55385af95eb13a9";

fn sha256(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn current_request(value: &str) -> Vec<u8> {
    let mut value: Value = serde_json::from_str(value).unwrap();
    value["registryVersion"] = json!(5);
    serde_json::to_vec(&value).unwrap()
}

fn current_plan(value: &str) -> Vec<u8> {
    let mut value: Value = serde_json::from_str(value).unwrap();
    value["registryVersion"] = json!(5);
    value["numericProfile"] = json!("geospec-st-prototypes-v4");
    canonicalize(&serde_json::to_vec(&value).unwrap()).unwrap()
}

#[test]
fn portable_control_copies_match_recorded_origins_and_hashes() {
    let manifest: Value =
        serde_json::from_slice(include_bytes!("fixtures/portable-controls/origins.json")).unwrap();
    let copies = manifest["copies"].as_array().unwrap();
    let bytes: BTreeMap<&str, &[u8]> = BTreeMap::from([
        (
            "effective-defaults.json",
            include_bytes!("fixtures/portable-controls/effective-defaults.json").as_slice(),
        ),
        (
            "f1-budget-batch.json",
            include_bytes!("fixtures/portable-controls/f1-budget-batch.json").as_slice(),
        ),
        (
            "f1-engine-fullwire.json",
            include_bytes!("fixtures/portable-controls/f1-engine-fullwire.json").as_slice(),
        ),
        (
            "f1-verifier-controls.json",
            include_bytes!("fixtures/portable-controls/f1-verifier-controls.json").as_slice(),
        ),
        (
            "relationship-scalars.json",
            include_bytes!("fixtures/portable-controls/relationship-scalars.json").as_slice(),
        ),
    ]);
    assert_eq!(manifest["schemaVersion"], 1);
    assert_eq!(copies.len(), bytes.len());
    for copy in copies {
        let path = copy["path"].as_str().unwrap();
        let origin = copy["origin"].as_str().unwrap();
        assert!(origin.starts_with("docs/research/artifacts/geospec-native-engine-charter/"));
        assert_eq!(sha256(bytes[path]), copy["sha256"]);
    }
}

#[test]
fn effective_defaults_match_all_32_authorized_canonical_controls() {
    let controls = std::env::var_os("GEOSPEC_EFFECTIVE_DEFAULTS_CONTROLS").map_or_else(
        || include_bytes!("fixtures/portable-controls/effective-defaults.json").to_vec(),
        |path| fs::read(path).unwrap(),
    );
    assert_eq!(sha256(&controls), CONTROLS_SHA256);
    let corpus: Value = serde_json::from_slice(&controls).unwrap();
    let controls = corpus["controls"].as_array().unwrap();
    let pairs = corpus["pairChecks"].as_array().unwrap();
    assert_eq!(controls.len(), 32);
    assert_eq!(pairs.len(), 20);
    let engine = Engine::new();
    let mut actual_plans = BTreeMap::new();
    let mut outcomes = Vec::with_capacity(controls.len());
    for control in controls {
        let id = control["id"].as_str().unwrap();
        let frozen_request = control["authoredRequestJson"].as_str().unwrap();
        let frozen_expected = control["canonicalPlanUtf8"].as_str().unwrap();
        assert_eq!(
            sha256(frozen_request.as_bytes()),
            control["hashes"]["authoredRequestJson"]["sha256"]
        );
        assert_eq!(
            sha256(frozen_expected.as_bytes()),
            control["hashes"]["canonicalPlanUtf8"]["sha256"]
        );
        let request = current_request(frozen_request);
        let expected = current_plan(frozen_expected);
        // Canonical preparation validates syntax only: no subject ingestion,
        // geometry evaluation, OCCT/Manifold composition or selector execution.
        let outcome = match engine.canonical_plan(&request) {
            Ok(actual) => {
                let passed = actual == expected;
                let actual_sha256 = sha256(&actual);
                let actual_utf8 = String::from_utf8(actual.clone()).unwrap();
                assert!(actual_plans.insert(id.to_owned(), actual).is_none());
                json!({
                    "id": id, "passed": passed, "authoredRequestJson": String::from_utf8(request).unwrap(),
                    "actualCanonicalPlanUtf8": actual_utf8, "actualSha256": actual_sha256,
                    "expectedCanonicalPlanUtf8": String::from_utf8(expected.clone()).unwrap(),
                    "frozenExpectedSha256": control["hashes"]["canonicalPlanUtf8"]["sha256"]
                })
            }
            Err(error) => json!({
                "id": id, "passed": false, "authoredRequestJson": String::from_utf8(request).unwrap(),
                "actualErrorCode": error.code(), "actualErrorMessage": error.to_string(),
                "expectedCanonicalPlanUtf8": String::from_utf8(expected).unwrap()
            }),
        };
        outcomes.push(outcome);
    }
    let pair_outcomes: Vec<_> = pairs.iter().map(|pair| {
        let left = actual_plans.get(pair["left"].as_str().unwrap());
        let right = actual_plans.get(pair["right"].as_str().unwrap());
        let passed = match (left, right, pair["relation"].as_str().unwrap()) {
            (Some(left), Some(right), "equal") => left == right,
            (Some(left), Some(right), "different") => left != right,
            _ => false,
        };
        json!({"left": pair["left"], "right": pair["right"], "relation": pair["relation"], "passed": passed})
    }).collect();
    let passed = outcomes
        .iter()
        .chain(&pair_outcomes)
        .all(|row| row["passed"] == true);
    let report = json!({
        "controlsSha256": CONTROLS_SHA256, "controlCount": controls.len(),
        "pairCount": pairs.len(), "passed": passed,
        "outcomes": outcomes, "pairOutcomes": pair_outcomes
    });
    if let Some(root) = std::env::var_os("GEOSPEC_EFFECTIVE_DEFAULTS_EVIDENCE_DIR") {
        fs::create_dir_all(&root).unwrap();
        fs::write(
            Path::new(&root).join("canonical-controls.json"),
            serde_json::to_vec_pretty(&report).unwrap(),
        )
        .unwrap();
    }
    assert!(passed, "{report}");
}
