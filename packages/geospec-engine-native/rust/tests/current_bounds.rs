use crate::{sha256_hex, Engine};
use serde_json::{json, Value};

fn admitted_triangle() -> (Engine, String) {
    let positions: [[f64; 3]; 3] = [[10.0, 10.0, 0.0], [246.0, 10.0, 0.0], [10.0, 246.0, 32.0]];
    let mut mesh = b"GSM1".to_vec();
    mesh.extend_from_slice(&3_u32.to_le_bytes());
    mesh.extend_from_slice(&1_u32.to_le_bytes());
    for point in positions {
        for coordinate in point {
            mesh.extend_from_slice(&coordinate.to_le_bytes());
        }
    }
    for index in [0_u32, 1, 2] {
        mesh.extend_from_slice(&index.to_le_bytes());
    }

    let content_hash = sha256_hex(&mesh);
    let request = json!({
        "method": "ingestSubject",
        "requestId": "current-bounds-ingest",
        "protocolVersion": 3,
        "registryVersion": 5,
        "canonicalProfile": "geospec-jcs-v1",
        "contentHash": content_hash,
        "format": "mesh-buffer-v1",
        "frame": { "coordinateSystem": "z-up", "unit": "mm" }
    });
    let mut engine = Engine::new();
    engine
        .ingest_mesh(&serde_json::to_vec(&request).unwrap(), &mesh)
        .unwrap();
    (engine, content_hash)
}

fn bounds_request(content_hash: &str, expected: Value) -> Value {
    json!({
        "method": "submitClaims",
        "requestId": "current-bounds",
        "protocolVersion": 3,
        "registryVersion": 5,
        "canonicalProfile": "geospec-jcs-v1",
        "plan": {
            "subjects": [{ "slot": "subject", "contentHash": content_hash }],
            "claims": [{
                "claimId": "bounds",
                "capability": "toHaveBoundingBox",
                "subjectSlots": ["subject"],
                "payload": { "kind": "boundingBox", "expected": expected },
                "polarity": "positive",
                "workUnitBudget": 100
            }]
        }
    })
}

#[test]
fn current_bounds_accepts_numeric_ranges_on_every_bounding_field() {
    let (engine, content_hash) = admitted_triangle();
    let expected = json!({
        "min": {
            "x": { "greaterThanOrEqual": 10 },
            "z": { "greaterThanOrEqual": 0 }
        },
        "max": {
            "x": { "lessThanOrEqual": 246 },
            "y": { "lessThanOrEqual": 246 }
        },
        "size": {
            "x": { "value": 236 },
            "y": { "greaterThan": 235, "lessThan": 237 }
        },
        "center": {
            "x": { "value": 128 },
            "z": { "greaterThan": 15, "lessThanOrEqual": 16 }
        },
        "tolerance": 0.001
    });
    let request = bounds_request(&content_hash, expected.clone());

    let canonical: Value = serde_json::from_slice(
        &engine
            .canonical_plan(&serde_json::to_vec(&request).unwrap())
            .unwrap(),
    )
    .unwrap();
    assert_eq!(
        canonical["plan"]["claims"][0]["payload"]["expected"],
        expected
    );

    let response: Value = serde_json::from_slice(
        &engine
            .process_request(&serde_json::to_vec(&request).unwrap())
            .unwrap(),
    )
    .unwrap();
    assert_eq!(response["result"]["results"][0]["status"], "passed");
    assert_eq!(
        response["result"]["results"][0]["evidence"]["expected"],
        expected
    );
}

#[test]
fn current_bounds_keeps_range_limits_exact_when_equality_tolerance_is_large() {
    let (engine, content_hash) = admitted_triangle();
    let expected = json!({
        "max": { "x": { "lessThanOrEqual": 245.9 } },
        "tolerance": 100
    });
    let request = bounds_request(&content_hash, expected);
    let response: Value = serde_json::from_slice(
        &engine
            .process_request(&serde_json::to_vec(&request).unwrap())
            .unwrap(),
    )
    .unwrap();
    let result = &response["result"]["results"][0];

    assert_eq!(result["status"], "failed");
    assert_eq!(
        result["diagnostics"][0]["details"]["axisFailures"],
        json!([{
            "axis": "x",
            "expected": { "lessThanOrEqual": 245.9 },
            "actual": 246,
            "field": "max"
        }])
    );
}
