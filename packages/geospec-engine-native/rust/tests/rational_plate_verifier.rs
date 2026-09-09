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
use sha2::{Digest, Sha256};

fn controls() -> Value {
    let path = std::env::var_os("GEOSPEC_F1_VERIFIER_CONTROLS")
        .expect("Lead must provide the frozen independent F1 verifier controls copy");
    let bytes = std::fs::read(path).unwrap();
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
    let passed = rows.iter().all(|row| row["outcome"]["passed"] == true);
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
    let definition = std::env::var("GEOSPEC_F1_VERIFIER_SOURCE_HASH")
        .expect("Lead must supply the actual reviewed verifier definition digest");
    let controls = controls();
    let mut rows = Vec::new();
    for row in controls["controls"].as_array().unwrap() {
        let expected = candidate(&row["analysis"]);
        let source = PlateSource::decode(row["primaryUtf8"].as_str().unwrap().as_bytes().to_vec());
        for plan in row["plans"].as_array().unwrap() {
            let binding = VerificationBinding {
                subject_content_hash: row["subjectContentHash"].as_str().unwrap().into(),
                subject_hash: row["subjectHash"].as_str().unwrap().into(),
                plan_hash: plan["planHash"].as_str().unwrap().into(),
                verifier_source_hash: definition.clone(),
            };
            let result = match &source {
                Ok(source) => verify(
                    VerificationRequest {
                        source,
                        canonical_plan: plan["canonicalPlanUtf8"].as_str().unwrap().as_bytes(),
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
            rows.push(json!({"id":row["id"],"claimId":plan["claimId"],"polarity":plan["polarity"],
                "planHash":binding.plan_hash,"subjectContentHash":binding.subject_content_hash,
                "subjectHash":binding.subject_hash,"verifierSourceHash":definition,
                "expectedPredicates":row["analysis"]["predicates"],"outcome":outcome(&result,&expected)}));
        }
    }
    finish("ordinary-full-envelope-both-polarities", rows);
}
