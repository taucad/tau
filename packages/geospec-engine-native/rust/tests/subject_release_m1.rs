use geospec_engine_native_core::Engine;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

fn mesh(seed: u32) -> Vec<u8> {
    let mut bytes = b"GSM1".to_vec();
    bytes.extend_from_slice(&3_u32.to_le_bytes());
    bytes.extend_from_slice(&1_u32.to_le_bytes());
    for point in [
        [seed as f64, 0.0, 0.0],
        [seed as f64 + 1.0, 0.0, 0.0],
        [seed as f64, 1.0, 0.0],
    ] {
        for coordinate in point {
            bytes.extend_from_slice(&coordinate.to_le_bytes());
        }
    }
    for index in [0_u32, 1, 2] {
        bytes.extend_from_slice(&index.to_le_bytes());
    }
    bytes
}

fn call(
    engine: &mut Engine,
    operation: fn(&mut Engine, &[u8]) -> Result<Vec<u8>, geospec_engine_native_core::ProtocolError>,
    request: Value,
) -> Value {
    serde_json::from_slice(&operation(engine, &serde_json::to_vec(&request).unwrap()).unwrap())
        .unwrap()
}

fn admit(engine: &mut Engine, seed: u32) -> String {
    let bytes = mesh(seed);
    let hash = format!("{:x}", Sha256::digest(&bytes));
    let request = serde_json::to_vec(&json!({
        "method": "ingestSubject",
        "requestId": format!("ingest-{seed}"),
        "protocolVersion": 3,
        "registryVersion": 5,
        "canonicalProfile": "geospec-jcs-v1",
        "contentHash": hash,
        "format": "mesh-buffer-v1",
        "frame": {"coordinateSystem": "z-up", "unit": "mm"}
    }))
    .unwrap();
    engine.ingest_mesh(&request, &bytes).unwrap();
    hash
}

fn handle(engine: &mut Engine, hash: &str, request_id: &str) -> Value {
    call(
        engine,
        |engine, request| engine.subject_handle(request),
        json!({
            "method": "subjectHandle",
            "requestId": request_id,
            "protocolVersion": 3,
            "registryVersion": 5,
            "canonicalProfile": "geospec-jcs-v1",
            "contentHash": hash
        }),
    )["result"]["subjectHandle"]
        .clone()
}

fn release(engine: &mut Engine, subject_handle: &Value, request_id: &str) -> bool {
    call(
        engine,
        Engine::release_subject,
        json!({
            "method": "releaseSubject",
            "requestId": request_id,
            "protocolVersion": 3,
            "registryVersion": 5,
            "canonicalProfile": "geospec-jcs-v1",
            "subjectHandle": subject_handle
        }),
    )["result"]["released"]
        .as_bool()
        .unwrap()
}

fn evaluate(engine: &Engine, hash: &str, claim_id: &str) {
    let response: Value = serde_json::from_slice(
        &engine
            .process_request(
                &serde_json::to_vec(&json!({
                    "method": "submitClaims",
                    "requestId": claim_id,
                    "protocolVersion": 3,
                    "registryVersion": 5,
                    "canonicalProfile": "geospec-jcs-v1",
                    "plan": {
                        "subjects": [{"slot": "subject", "contentHash": hash}],
                        "claims": [{
                            "claimId": claim_id,
                            "capability": "toHaveBoundingBox",
                            "subjectSlots": ["subject"],
                            "payload": {"kind": "boundingBox", "expected": {}},
                            "polarity": "positive",
                            "workUnitBudget": 3
                        }]
                    }
                }))
                .unwrap(),
            )
            .unwrap(),
    )
    .unwrap();
    assert_eq!(response["result"]["results"][0]["status"], "passed");
}

#[test]
fn releases_subjects_for_repeated_and_independent_healthy_sessions() {
    let mut engine = Engine::new();
    for seed in 0..40 {
        let hash = admit(&mut engine, seed);
        let first = handle(&mut engine, &hash, "handle-1");
        assert_eq!(first, handle(&mut engine, &hash, "handle-2"));
        evaluate(&engine, &hash, &format!("claim-{seed}"));
        assert!(release(&mut engine, &first, "release-1"));
        assert!(!release(&mut engine, &first, "release-2"));
    }

    let first_hash = admit(&mut engine, 100);
    let second_hash = admit(&mut engine, 101);
    let first = handle(&mut engine, &first_hash, "first");
    let second = handle(&mut engine, &second_hash, "second");
    assert!(release(&mut engine, &first, "release-first"));
    evaluate(&engine, &second_hash, "unaffected-second");
    assert!(release(&mut engine, &second, "release-second"));

    let old = handle_after_admit_and_release(&mut engine, 200);
    let hash = admit(&mut engine, 200);
    let new = handle(&mut engine, &hash, "new-generation");
    assert_ne!(old["generation"], new["generation"]);
    assert!(release(&mut engine, &new, "release-new-generation"));
}

fn handle_after_admit_and_release(engine: &mut Engine, seed: u32) -> Value {
    let hash = admit(engine, seed);
    let value = handle(engine, &hash, "old-generation");
    assert!(release(engine, &value, "release-old-generation"));
    value
}
