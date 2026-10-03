//! `Engine::evaluate_claim` returns, in one call, exactly the bytes of the two-call client flow:
//! `canonical_plan`, `canonicalize` of the plan's claim and `evaluate_plan` of that plan.

use geospec_engine_native_core::{canonicalize, Engine, ProtocolError};
use serde_json::Value;

const CORPUS: &str = include_str!("../../conformance/early-corpus.json");
const CURRENT: &str = include_str!("fixtures/current-profile-01/plan-corpus.json");
const CURRENT_NUMERIC_PROFILE: &str =
    include_str!("fixtures/current-profile-v6/numeric-profile.txt").trim_ascii_end();

fn bytes(hex: &str) -> Vec<u8> {
    (0..hex.len())
        .step_by(2)
        .map(|offset| u8::from_str_radix(&hex[offset..offset + 2], 16).expect("hex byte"))
        .collect()
}

fn error(result: Result<Vec<u8>, ProtocolError>) -> Result<Vec<u8>, (String, String)> {
    result.map_err(|error| (error.code().to_owned(), error.to_string()))
}

/// The two-call flow the clients ran before `evaluate_claim`, framed like `evaluate_claim`.
fn two_calls(engine: &Engine, request: &[u8]) -> Result<Vec<u8>, (String, String)> {
    let plan = error(engine.canonical_plan(request))?;
    let parsed: Value = serde_json::from_slice(&plan).expect("canonical plan JSON");
    let claims = parsed["plan"]["claims"].as_array().expect("plan claims");
    if claims.len() != 1 {
        return Err((
            "invalid-request".to_owned(),
            "evaluateClaim requires exactly one claim.".to_owned(),
        ));
    }
    let claim = canonicalize(&serde_json::to_vec(&claims[0]).expect("claim JSON")).expect("claim");
    let result = error(engine.evaluate_plan(&plan))?;
    let mut frame = Vec::new();
    frame.extend_from_slice(&u32::try_from(plan.len()).unwrap().to_le_bytes());
    frame.extend_from_slice(&u32::try_from(claim.len()).unwrap().to_le_bytes());
    for part in [plan, claim, result] {
        frame.extend_from_slice(&part);
    }
    Ok(frame)
}

/// Fresh engine with every corpus mesh admitted, so every plan subject resolves.
fn engine(meshes: &[Value], bindings: &[Value]) -> Engine {
    let mut engine = Engine::new();
    for (mesh, bound) in meshes.iter().zip(bindings) {
        let request = bound["effectiveRequestUtf8"]
            .as_str()
            .expect("mesh request");
        let data = bytes(mesh["meshHex"].as_str().expect("mesh bytes"));
        engine
            .ingest_mesh(request.as_bytes(), &data)
            .expect("mesh admission");
    }
    engine
}

#[test]
fn one_call_returns_the_two_call_plan_claim_and_result_bytes_for_every_claim_request() {
    let corpus: Value = serde_json::from_str(CORPUS).expect("frozen corpus");
    let current: Value = serde_json::from_str(CURRENT).expect("current bindings");
    let meshes = corpus["meshes"].as_array().expect("meshes");
    let mesh_bindings = current["meshes"].as_array().expect("mesh bindings");
    let (mut compared, mut evaluated, mut refused) = (0, 0, 0);
    for binding in current["records"].as_array().expect("records") {
        let Some(text) = binding["effectiveInputUtf8"].as_str() else {
            continue;
        };
        let request = text.replace("geospec-st-logical-requests-v3", CURRENT_NUMERIC_PROFILE);
        if !request.contains(r#""submitClaims""#) {
            continue;
        }
        let one = error(engine(meshes, mesh_bindings).evaluate_claim(request.as_bytes()));
        let two = two_calls(&engine(meshes, mesh_bindings), request.as_bytes());
        assert_eq!(one, two, "{}", binding["id"]);
        compared += 1;
        match one {
            Ok(_) => evaluated += 1,
            Err(_) => refused += 1,
        }
    }
    // Both outcomes are exercised: evaluated claims and identical refusals.
    assert!(
        evaluated > 0 && refused > 0,
        "{compared} {evaluated} {refused}"
    );
}

#[test]
fn refuses_a_valid_plan_without_exactly_one_claim() {
    let corpus: Value = serde_json::from_str(CORPUS).expect("frozen corpus");
    let current: Value = serde_json::from_str(CURRENT).expect("current bindings");
    let meshes = corpus["meshes"].as_array().expect("meshes");
    let mesh_bindings = current["meshes"].as_array().expect("mesh bindings");
    let engine = engine(meshes, mesh_bindings);
    let request: Value = current["records"]
        .as_array()
        .expect("records")
        .iter()
        .filter_map(|binding| binding["effectiveInputUtf8"].as_str())
        .map(|text| text.replace("geospec-st-logical-requests-v3", CURRENT_NUMERIC_PROFILE))
        .find(|text| {
            text.contains(r#""submitClaims""#) && engine.evaluate_claim(text.as_bytes()).is_ok()
        })
        .map(|text| serde_json::from_str(&text).expect("request JSON"))
        .expect("an evaluable one-claim request");
    let claim = request["plan"]["claims"][0].clone();
    let mut second = claim.clone();
    second["claimId"] = Value::String(format!("{}-second", claim["claimId"].as_str().unwrap()));
    let mut two = request.clone();
    two["plan"]["claims"] = Value::Array(vec![claim, second]);
    let two = serde_json::to_vec(&two).unwrap();
    assert!(
        engine.canonical_plan(&two).is_ok(),
        "the two-claim plan is valid"
    );
    assert_eq!(
        error(engine.evaluate_claim(&two)),
        Err((
            "invalid-request".to_owned(),
            "evaluateClaim requires exactly one claim.".to_owned()
        ))
    );
}
