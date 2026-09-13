use geospec_engine_native_runtime::{create_engine, Engine, EngineConfig};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

const CONTRACT: &str = "geospec.pmi.parallel-plane-distance/v1";
const CAPABILITY: &str = "toSatisfyParallelPlaneDistance";

fn request(method: &str, id: &str) -> Value {
    json!({"method":method,"requestId":id,"protocolVersion":3,
        "registryVersion":4,"canonicalProfile":"geospec-jcs-v1"})
}

fn claim(id: &str, polarity: &str, budget: u64) -> Value {
    json!({"claimId":id,"capability":CAPABILITY,"subjectSlots":["part"],
        "payload":{"contract":CONTRACT},"polarity":polarity,"workUnitBudget":budget})
}

fn plan_request(hash: &Value, claims: Vec<Value>) -> Value {
    let mut value = request("submitClaims", "f2-engine");
    value["plan"] = json!({"subjects":[{"slot":"part","subjectHash":hash}],"claims":claims});
    value
}

fn admit(engine: &mut Engine, bytes: Vec<u8>) -> Value {
    let mut value = request("ingestSubject", "f2-admit");
    value["format"] = json!("step");
    value["frame"] = json!({"coordinateSystem":"z-up","sourceUnit":"auto","outputUnit":"mm"});
    value["ingestOptions"] = json!({"name":"f2-source"});
    value["primaryByteLength"] = json!(bytes.len());
    value["resources"] = json!([]);
    serde_json::from_slice(
        &engine
            .ingest_subject(&serde_json::to_vec(&value).unwrap(), bytes, vec![])
            .unwrap(),
    )
    .unwrap()
}

fn lifecycle(engine: &mut Engine, hash: &Value) -> Value {
    let mut handle_request = request("subjectHandle", "f2-handle");
    handle_request["subjectHash"] = hash.clone();
    let handle: Value = serde_json::from_slice(
        &engine
            .subject_handle(&serde_json::to_vec(&handle_request).unwrap())
            .unwrap(),
    )
    .unwrap();
    let mut release = request("releaseSubject", "f2-release");
    release["subjectHandle"] = handle["result"]["subjectHandle"].clone();
    serde_json::from_slice(
        &engine
            .release_subject(&serde_json::to_vec(&release).unwrap())
            .unwrap(),
    )
    .unwrap()
}

fn save(rows: &[Value]) {
    if let Some(path) = std::env::var_os("GEOSPEC_F2_ENGINE_EVIDENCE") {
        std::fs::write(path, serde_json::to_vec_pretty(rows).unwrap()).unwrap();
    }
}

#[test]
fn exact_source_planes_bind_runtime_polarity_budget_and_release() {
    let original =
        include_str!("../../occt/rust/tests/fixtures/parallel-plane-distance-source.step");
    let same = include_str!(
        "../../occt/rust/tests/fixtures/parallel-plane-distance-same-occurrence-source.step"
    );
    // Independent source geometry: 10 mm separation, squared distance 100.
    // The source band is 0.95..1.05 cm; lowering its upper end to 0.99 cm is false.
    let cases = [
        ("distinct-occurrences", original.to_owned(), Some(true)),
        ("same-occurrence", same.to_owned(), Some(true)),
        (
            "outside-band",
            original.replace("1.05),#405", "0.99),#405"),
            Some(false),
        ),
        (
            "nonparallel",
            original.replace(
                "#627=DIRECTION('',(0.,0.,1.));",
                "#627=DIRECTION('',(1.,0.,0.));",
            ),
            None,
        ),
        (
            "ordinary-box-no-pmi",
            include_str!("../../occt/rust/tests/fixtures/ap242-box.step").to_owned(),
            None,
        ),
    ];
    let mut rows = Vec::new();
    let mut checks = Vec::new();
    for (id, source, positive) in cases {
        let units = 1 + source.len() as u64 + 8192 + 2048 + 8192 + 2;
        let mut engine = create_engine(EngineConfig::entry());
        let admission = admit(&mut engine, source.as_bytes().to_vec());
        let hash = &admission["result"]["subject"]["subjectHash"];
        let authored = plan_request(
            hash,
            vec![
                claim("positive", "positive", units),
                claim("negative", "negative", units),
            ],
        );
        let mut cold = None;
        for temperature in ["cold", "warm"] {
            let plan = engine
                .canonical_plan(&serde_json::to_vec(&authored).unwrap())
                .unwrap();
            let result = engine.evaluate_plan(&plan).unwrap();
            let submit = engine
                .process_request(&serde_json::to_vec(&authored).unwrap())
                .unwrap();
            let result_json: Value = serde_json::from_slice(&result).unwrap();
            let submit_json: Value = serde_json::from_slice(&submit).unwrap();
            checks.push(submit_json["result"]["results"] == result_json["results"]);
            for (index, polarity) in [true, false].into_iter().enumerate() {
                let row = &result_json["results"][index];
                let expected = match positive {
                    Some(value) if value == polarity => "passed",
                    Some(_) => "failed",
                    None => "refused",
                };
                checks.push(row["status"] == expected);
                if let Some(value) = positive {
                    checks.push(row["evidence"]["measured"]["satisfiesSourceInterval"] == value);
                    checks.push(
                        row["evidence"]["witnesses"]["distanceSquaredMillimeters"]
                            == json!({"numerator":"100","denominator":"1"}),
                    );
                    checks.push(
                        row["evidence"]["planHash"] == format!("{:x}", Sha256::digest(&plan)),
                    );
                    checks.push(row["evidence"]["subjectHash"] == *hash);
                    checks.push(
                        row["evidence"]["witnesses"]["work"]
                            .get("projectedTemporaryPeakBytes")
                            .is_none(),
                    );
                } else {
                    checks.push(row["diagnostics"][0]["code"] == "GEOSPEC_CERTIFICATE_UNVERIFIED");
                }
            }
            let triple = [
                String::from_utf8(plan).unwrap(),
                String::from_utf8(result).unwrap(),
                String::from_utf8(submit).unwrap(),
            ];
            if let Some(previous) = &cold {
                checks.push(previous == &triple);
            } else {
                cold = Some(triple.clone());
            }
            rows.push(json!({"id":id,"temperature":temperature,"admission":admission,"authoredRequest":authored,
                "canonicalPlanUtf8":triple[0],"canonicalResultUtf8":triple[1],"submitUtf8":triple[2]}));
            save(&rows);
        }
        // Requested logical work is debited even after successful evidence retention.
        let low = plan_request(hash, vec![claim("one-short", "positive", units - 1)]);
        let low_plan = engine
            .canonical_plan(&serde_json::to_vec(&low).unwrap())
            .unwrap();
        let low_result: Value =
            serde_json::from_slice(&engine.evaluate_plan(&low_plan).unwrap()).unwrap();
        checks.push(low_result["results"][0]["status"] == "refused");
        checks.push(low_result["results"][0]["diagnostics"][0]["code"] == "MATCHER_TIMEOUT");
        checks.push(low_result["results"][0]["diagnostics"][0]["details"]["unitsUsed"] == units);
        let release = lifecycle(&mut engine, hash);
        checks.push(release["result"]["released"] == true);
        rows.push(json!({"id":id,"budgetOneShort":low_result,"release":release}));
        save(&rows);
    }
    assert!(
        checks.iter().all(|value| *value),
        "failed checks: {:?}; see complete saved rows",
        checks
            .iter()
            .enumerate()
            .filter(|(_, value)| !**value)
            .map(|(index, _)| index)
            .collect::<Vec<_>>()
    );
}
