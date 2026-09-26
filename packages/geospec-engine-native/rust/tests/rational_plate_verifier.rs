//! Independent ordinary controls frozen before verifier authoring/execution.
//! No producer, third-party oracle or corrupted-certificate controls are used.

use geospec_engine_native_core::certificates::{
    plate_contract::{
        Box3, MaterialWitnesses, PlaneLists, PlateAnalysis, PlateCandidate, PlateCertificate,
        PlateError, Point3, PredicateValues, RationalText, VerificationBinding,
        VerificationRequest, VerifiedPlate,
    },
    plate_syntax::PlateSource,
    plate_verifier::{verify, verify_geometry},
};
use serde_json::{json, Value};

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
fn current_registry_f1_plan_reaches_independent_verifier_after_fresh_admission() {
    use geospec_engine_native_core::{canonicalize, Engine};

    let controls = controls();
    let row = &controls["controls"][0];
    assert_eq!(row["id"], "target");
    let primary = row["primaryUtf8"].as_str().unwrap().as_bytes();
    assert_eq!(
        format!("{:x}", Sha256::digest(primary)),
        row["subjectContentHash"]
    );
    let expected = candidate(&row["analysis"]);
    assert_eq!(expected.predicates, [true; 4]);
    let source = PlateSource::decode(primary.to_vec()).unwrap();
    let definition = verifier_source_hash();
    let mut engine = Engine::new();
    // Only envelope metadata is current-profile authored; geometry stays frozen.
    let admission_request = json!({
        "canonicalProfile": "geospec-jcs-v1", "format": "rational-plate",
        "frame": {"coordinateSystem": "z-up", "outputUnit": "mm", "sourceUnit": "mm"},
        "ingestOptions": {}, "method": "ingestSubject",
        "primaryByteLength": primary.len(), "protocolVersion": 3, "registryVersion": 5,
        "requestId": "current-f1-admission", "resources": []
    });
    let admission: Value = serde_json::from_slice(
        &engine
            .ingest_subject(
                &serde_json::to_vec(&admission_request).unwrap(),
                primary,
                vec![],
            )
            .unwrap(),
    )
    .unwrap();
    let subject_hash = admission["result"]["subject"]["subjectHash"]
        .as_str()
        .unwrap();
    let original: Value =
        serde_json::from_str(row["plans"][0]["canonicalPlanUtf8"].as_str().unwrap()).unwrap();
    let mut request = json!({
        "canonicalProfile": "geospec-jcs-v1", "protocolVersion": 3, "registryVersion": 5,
        "method": "submitClaims", "requestId": "current-f1", "plan": original["plan"]
    });
    request["plan"]["subjects"][0]["subjectHash"] = json!(subject_hash);
    assert_eq!(request["plan"]["claims"], original["plan"]["claims"]);
    let canonical = engine
        .canonical_plan(&serde_json::to_vec(&request).unwrap())
        .unwrap();
    let current: Value = serde_json::from_slice(&canonical).unwrap();
    assert_eq!(current["registryVersion"], 5);
    assert_eq!(current["numericProfile"], NUMERIC_PROFILE);
    let mut observations = Vec::new();
    for registry in [5, 4] {
        let mut plan = current.clone();
        plan["registryVersion"] = json!(registry);
        let bytes = canonicalize(&serde_json::to_vec(&plan).unwrap()).unwrap();
        let binding = VerificationBinding {
            subject_content_hash: format!("{:x}", Sha256::digest(primary)),
            subject_hash: subject_hash.into(),
            plan_hash: format!("{:x}", Sha256::digest(&bytes)),
            verifier_source_hash: definition.clone(),
        };
        let result = verify(
            VerificationRequest {
                source: &source,
                canonical_plan: &bytes,
                claim_id: row["plans"][0]["claimId"].as_str().unwrap(),
                subject_slot: "plate",
                expected_subject_hash: subject_hash,
                expected_verifier_source_hash: &definition,
            },
            PlateCandidate {
                binding: &binding,
                analysis: &expected,
            },
        );
        let public = engine.evaluate_plan(&bytes);
        observations.push(json!({
            "registryVersion": registry, "canonicalPlanUtf8": String::from_utf8(bytes).unwrap(),
            "independentVerifier": outcome(&result, &expected),
            "publicResult": match public {
                Ok(bytes) => serde_json::from_slice::<Value>(&bytes).unwrap(),
                Err(error) => json!({"errorCode": error.code(), "message": error.to_string()}),
            }
        }));
    }
    let report = json!({"admissionRequest": admission_request, "admission": admission,
        "primarySha256": row["subjectContentHash"], "claimsUnchanged": true,
        "expectedPredicates": row["analysis"]["predicates"], "observations": observations});
    println!("{report}");
    if let Some(output) = std::env::var_os("GEOSPEC_CURRENT_PROFILE_GAP_OUTPUT") {
        std::fs::write(output, serde_json::to_vec_pretty(&report).unwrap()).unwrap();
    }
    assert_eq!(
        report["observations"][0]["independentVerifier"]["verified"], true,
        "An admitted registry5/v3 F1 plan must reach its independent verifier"
    );
    assert_eq!(
        report["observations"][0]["publicResult"]["results"][0]["status"], "passed",
        "The same current registry5/v3 plan must pass the public engine"
    );
    assert_eq!(
        report["observations"][1]["independentVerifier"]["verified"], false,
        "The independent verifier must reject the old registry4 envelope"
    );
    assert_eq!(
        report["observations"][1]["publicResult"]["errorCode"],
        "unsupported-version"
    );
    assert_eq!(
        report["observations"][1]["publicResult"]["message"],
        "GeoSpec registry version 4 is incompatible with version 5."
    );
}

use sha2::{Digest, Sha256};

fn controls() -> Value {
    let bytes = std::env::var_os("GEOSPEC_F1_VERIFIER_CONTROLS").map_or_else(
        || include_bytes!("fixtures/portable-controls/f1-verifier-controls.json").to_vec(),
        |path| std::fs::read(path).unwrap(),
    );
    assert_eq!(
        format!("{:x}", Sha256::digest(&bytes)),
        "ac9c8237b8b46bf3af12cfb3db8761eef29c30bfe67ab5e5fb589c7c047f5e84"
    );
    serde_json::from_slice(&bytes).unwrap()
}

fn point(value: &Value) -> Point3 {
    std::array::from_fn(|axis| RationalText(value[axis].as_str().unwrap().into()))
}

fn box_value(value: &Value) -> Box3 {
    Box3 {
        min: point(&value["min"]),
        max: point(&value["max"]),
    }
}

fn candidate(value: &Value) -> PlateAnalysis {
    let measured = &value["measured"];
    let certificate = &value["certificate"];
    let plane = |axis: &str| {
        certificate["planes"][axis]
            .as_array()
            .unwrap()
            .iter()
            .map(|value| RationalText(value.as_str().unwrap().into()))
            .collect()
    };
    let witness = |key: &str| {
        let value = &certificate["materialWitnesses"][key];
        (!value.is_null()).then(|| point(value))
    };
    PlateAnalysis {
        window_count: value["windowCount"].as_u64().unwrap().try_into().unwrap(),
        cell_count: value["cellCount"].as_u64().unwrap().try_into().unwrap(),
        measured: PredicateValues {
            bounds: box_value(&measured["bounds"]),
            material_volume: RationalText(measured["materialVolume"].as_str().unwrap().into()),
            material_in_a: RationalText(measured["materialInA"].as_str().unwrap().into()),
            material_in_b: RationalText(measured["materialInB"].as_str().unwrap().into()),
        },
        predicates: std::array::from_fn(|i| value["predicates"][i].as_bool().unwrap()),
        certificate: PlateCertificate {
            planes: PlaneLists {
                x: plane("x"),
                y: plane("y"),
                z: plane("z"),
            },
            occupied_cells: certificate["occupiedCells"]
                .as_array()
                .unwrap()
                .iter()
                .map(|value| value.as_u64().unwrap().try_into().unwrap())
                .collect(),
            material_witnesses: MaterialWitnesses {
                a: witness("a"),
                b: witness("b"),
            },
        },
    }
}

fn outcome(result: &Result<VerifiedPlate, PlateError>, expected: &PlateAnalysis) -> Value {
    match result {
        Ok(value) => json!({"verified":true,"predicates":value.predicates,
            "measured":{"bounds":{"min":value.measured.bounds.min.each_ref().map(|v|&v.0),
                "max":value.measured.bounds.max.each_ref().map(|v|&v.0)},
                "materialVolume":value.measured.material_volume.0,
                "materialInA":value.measured.material_in_a.0,"materialInB":value.measured.material_in_b.0},
            "passed":value.measured==expected.measured && value.predicates==expected.predicates}),
        Err(error) => {
            json!({"verified":false,"errorKind":format!("{:?}",error.kind),"message":error.message,"passed":false})
        }
    }
}

fn finish(name: &str, rows: Vec<Value>) {
    let passed = rows.iter().all(|row| {
        row["outcome"]["passed"] == true && row["tamperRejected"].as_bool().unwrap_or(true)
    });
    let report = json!({"test":name,"count":rows.len(),"passed":passed,"observations":rows});
    println!("{report}");
    if let Some(root) = std::env::var_os("GEOSPEC_F1_VERIFIER_EVIDENCE_DIR") {
        std::fs::create_dir_all(&root).unwrap();
        std::fs::write(
            std::path::Path::new(&root).join(format!("{name}.json")),
            serde_json::to_vec_pretty(&report).unwrap(),
        )
        .unwrap();
    }
    assert!(
        passed,
        "{name}: independent full-predicate verifier controls failed; observations preserved"
    );
}

#[test]
fn ordinary_geometry_controls_verify_all_four_predicates() {
    let controls = controls();
    let mut rows = Vec::new();
    for row in controls["controls"].as_array().unwrap() {
        let expected = candidate(&row["analysis"]);
        let source = PlateSource::decode(row["primaryUtf8"].as_str().unwrap().as_bytes().to_vec());
        let result = source.and_then(|source| verify_geometry(&source, &expected));
        rows.push(json!({"id":row["id"],"expected":row["analysis"]["measured"],
            "expectedPredicates":row["analysis"]["predicates"],"outcome":outcome(&result,&expected)}));
    }
    finish("ordinary-geometry-all-four", rows);
}

#[test]
fn ordinary_bound_plans_verify_full_envelope_for_both_polarities() {
    // This trusted definition binding is supplied from the actual reviewed
    // definition closure. It is not a guessed binary hash or execution receipt.
    let definition = verifier_source_hash();
    let controls = controls();
    let mut rows = Vec::new();
    for row in controls["controls"].as_array().unwrap() {
        let expected = candidate(&row["analysis"]);
        let source = PlateSource::decode(row["primaryUtf8"].as_str().unwrap().as_bytes().to_vec());
        for plan in row["plans"].as_array().unwrap() {
            let mut current: Value =
                serde_json::from_str(plan["canonicalPlanUtf8"].as_str().unwrap()).unwrap();
            current["registryVersion"] = json!(5);
            current["numericProfile"] = json!(NUMERIC_PROFILE);
            let current =
                geospec_engine_native_core::canonicalize(&serde_json::to_vec(&current).unwrap())
                    .unwrap();
            let binding = VerificationBinding {
                subject_content_hash: row["subjectContentHash"].as_str().unwrap().into(),
                subject_hash: row["subjectHash"].as_str().unwrap().into(),
                plan_hash: format!("{:x}", Sha256::digest(&current)),
                verifier_source_hash: definition.clone(),
            };
            let result = match &source {
                Ok(source) => verify(
                    VerificationRequest {
                        source,
                        canonical_plan: &current,
                        claim_id: plan["claimId"].as_str().unwrap(),
                        subject_slot: plan["subjectSlot"].as_str().unwrap(),
                        expected_subject_hash: row["subjectHash"].as_str().unwrap(),
                        expected_verifier_source_hash: &definition,
                    },
                    PlateCandidate {
                        binding: &binding,
                        analysis: &expected,
                    },
                ),
                Err(error) => Err(error.clone()),
            };
            let tampered_binding = VerificationBinding {
                plan_hash: "0".repeat(64),
                ..binding.clone()
            };
            let tampered = match &source {
                Ok(source) => verify(
                    VerificationRequest {
                        source,
                        canonical_plan: &current,
                        claim_id: plan["claimId"].as_str().unwrap(),
                        subject_slot: plan["subjectSlot"].as_str().unwrap(),
                        expected_subject_hash: row["subjectHash"].as_str().unwrap(),
                        expected_verifier_source_hash: &definition,
                    },
                    PlateCandidate {
                        binding: &tampered_binding,
                        analysis: &expected,
                    },
                ),
                Err(error) => Err(error.clone()),
            };
            rows.push(json!({"id":row["id"],"claimId":plan["claimId"],"polarity":plan["polarity"],
                "planHash":binding.plan_hash,"subjectContentHash":binding.subject_content_hash,
                "subjectHash":binding.subject_hash,"verifierSourceHash":definition,
                "tamperRejected": matches!(tampered, Err(PlateError { kind: geospec_engine_native_core::certificates::plate_contract::PlateErrorKind::Unverified, .. })),
                "expectedPredicates":row["analysis"]["predicates"],"outcome":outcome(&result,&expected)}));
        }
    }
    finish("ordinary-full-envelope-both-polarities", rows);
}
