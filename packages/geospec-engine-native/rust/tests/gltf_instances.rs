use geospec_engine_native_core::Engine;
use serde_json::{json, Value};

const EXPECTED_INTERSECTION_VOLUME: f64 = 0.5;

fn cube_buffer() -> Vec<u8> {
    let vertices: [[f32; 3]; 8] = [
        [0.0, 0.0, 0.0],
        [1.0, 0.0, 0.0],
        [1.0, 1.0, 0.0],
        [0.0, 1.0, 0.0],
        [0.0, 0.0, 1.0],
        [1.0, 0.0, 1.0],
        [1.0, 1.0, 1.0],
        [0.0, 1.0, 1.0],
    ];
    let triangles: [[u16; 3]; 12] = [
        [0, 2, 1],
        [0, 3, 2],
        [4, 5, 6],
        [4, 6, 7],
        [0, 1, 5],
        [0, 5, 4],
        [1, 2, 6],
        [1, 6, 5],
        [2, 3, 7],
        [2, 7, 6],
        [3, 0, 4],
        [3, 4, 7],
    ];
    let mut bytes = vertices
        .into_iter()
        .flatten()
        .flat_map(f32::to_le_bytes)
        .collect::<Vec<_>>();
    bytes.extend(triangles.into_iter().flatten().flat_map(u16::to_le_bytes));
    bytes
}

fn document(nodes: Value, meshes: Value) -> Vec<u8> {
    serde_json::to_vec(&json!({
        "asset": {"version": "2.0"},
        "scene": 0,
        "scenes": [{"nodes": (0..nodes.as_array().unwrap().len()).collect::<Vec<_>>() }],
        "nodes": nodes,
        "meshes": meshes,
        "buffers": [{"uri": "mesh.bin", "byteLength": 168}],
        "bufferViews": [
            {"buffer": 0, "byteOffset": 0, "byteLength": 96},
            {"buffer": 0, "byteOffset": 96, "byteLength": 72}
        ],
        "accessors": [
            {"bufferView": 0, "componentType": 5126, "count": 8, "type": "VEC3", "min": [0, 0, 0], "max": [1, 1, 1]},
            {"bufferView": 1, "componentType": 5123, "count": 36, "type": "SCALAR"},
            {"bufferView": 1, "componentType": 5123, "count": 2, "type": "SCALAR"}
        ]
    }))
    .unwrap()
}

fn ingest(engine: &mut Engine, primary: Vec<u8>, buffer: Vec<u8>) -> String {
    let request = json!({
        "method": "ingestSubject",
        "requestId": "admit",
        "protocolVersion": 3,
        "registryVersion": 5,
        "canonicalProfile": "geospec-jcs-v1",
        "format": "gltf",
        "frame": {"coordinateSystem": "z-up", "sourceUnit": "mm", "outputUnit": "mm"},
        "ingestOptions": {},
        "primaryByteLength": primary.len(),
        "resources": [{"name": "mesh.bin", "byteLength": buffer.len()}]
    });
    let response: Value = serde_json::from_slice(
        &engine
            .ingest_subject(
                &serde_json::to_vec(&request).unwrap(),
                primary,
                vec![buffer],
            )
            .unwrap(),
    )
    .unwrap();
    response["result"]["subject"]["subjectHash"]
        .as_str()
        .unwrap()
        .into()
}

#[test]
fn repeated_mesh_closure_reuses_decode_but_changed_resource_does_not() {
    let primary = document(
        json!([{"mesh": 0, "name": "A"}]),
        json!([{"primitives": [{"attributes": {"POSITION": 0}, "indices": 1}]}]),
    );
    let buffer = cube_buffer();
    let mut engine = Engine::new();
    let first = ingest(&mut engine, primary.clone(), buffer.clone());
    assert_eq!(first, ingest(&mut engine, primary.clone(), buffer.clone()));
    let observations: Value = serde_json::from_slice(&engine.observations()).unwrap();
    assert_eq!(observations["physical"]["admissions"], "2");
    assert_eq!(observations["physical"]["parses"], "1");
    assert_eq!(observations["physical"]["meshRecords"], "1");

    let mut changed = buffer;
    changed[0..4].copy_from_slice(&0.25_f32.to_le_bytes());
    assert_ne!(first, ingest(&mut engine, primary, changed));
    let observations: Value = serde_json::from_slice(&engine.observations()).unwrap();
    assert_eq!(observations["physical"]["parses"], "2");
}

fn claim(engine: &Engine, subject_hash: &str, capability: &str, payload: Value) -> Value {
    let request = json!({
        "method": "submitClaims",
        "requestId": "query",
        "protocolVersion": 3,
        "registryVersion": 5,
        "canonicalProfile": "geospec-jcs-v1",
        "plan": {
            "subjects": [{"slot": "part", "subjectHash": subject_hash}],
            "claims": [{
                "claimId": "control",
                "capability": capability,
                "subjectSlots": ["part"],
                "payload": payload,
                "polarity": "positive",
                "workUnitBudget": 8_000_000
            }]
        }
    });
    serde_json::from_slice(
        &engine
            .process_request(&serde_json::to_vec(&request).unwrap())
            .unwrap(),
    )
    .unwrap()
}

fn analyze(engine: &Engine, subject_hash: &str) -> Value {
    claim(engine, subject_hash, "analyzeMesh", Value::Null)["result"]["results"][0]["evidence"]
        ["stats"]
        .clone()
}

fn assert_pair_reaches_csg(engine: &Engine, subject_hash: &str, left: &str, right: &str) {
    let result = claim(
        engine,
        subject_hash,
        "analyzeMeshOverlap",
        json!({"pairs": [{"left": left, "right": right}]}),
    );
    let result = &result["result"]["results"][0];
    assert_eq!(result["status"], "refused");
    assert_eq!(
        result["diagnostics"][0]["code"], "GEOSPEC_UNSUPPORTED_EVIDENCE",
        "the pair must resolve before this core-only control reaches the missing CSG connector"
    );
}

#[test]
fn should_preserve_two_instances_of_one_shared_mesh() {
    let primary = document(
        json!([
            {"mesh": 0, "name": "A"},
            {"mesh": 0, "name": "B", "translation": [0.5, 0, 0]}
        ]),
        json!([{"primitives": [{"attributes": {"POSITION": 0}, "indices": 1}]}]),
    );
    let mut engine = Engine::new();
    let subject_hash = ingest(&mut engine, primary, cube_buffer());
    let analysis = analyze(&engine, &subject_hash);
    let primitives = analysis["boundingBox"]["primitives"].as_array().unwrap();

    assert_eq!(
        analysis["meshCount"], 2,
        "the Manifold integration control expects intersection volume {EXPECTED_INTERSECTION_VOLUME}"
    );
    assert_eq!(analysis["triangleCount"], 24);
    assert_eq!(primitives[0]["name"], "A#0");
    assert_eq!(primitives[1]["name"], "B#0");
    assert_eq!(primitives[0]["aabb"]["min"], json!([0, 0, 0]));
    assert_eq!(primitives[1]["aabb"]["max"], json!([1.5, 1, 1]));
    assert_pair_reaches_csg(&engine, &subject_hash, "A#0", "B#0");
}

#[test]
fn should_keep_same_display_name_instances_distinct() {
    let primary = document(
        json!([
            {"mesh": 0, "name": "A"},
            {"mesh": 0, "name": "A", "translation": [0.5, 0, 0]}
        ]),
        json!([{"primitives": [{"attributes": {"POSITION": 0}, "indices": 1}]}]),
    );
    let mut engine = Engine::new();
    let subject_hash = ingest(&mut engine, primary, cube_buffer());
    let analysis = analyze(&engine, &subject_hash);
    let primitives = analysis["boundingBox"]["primitives"].as_array().unwrap();

    assert_eq!(
        analysis["meshCount"], 2,
        "the Manifold integration control expects intersection volume {EXPECTED_INTERSECTION_VOLUME}"
    );
    assert_eq!(primitives[0]["name"], "A#0");
    assert_eq!(primitives[1]["name"], "A#0");
    assert_eq!(primitives[0]["aabb"]["min"], json!([0, 0, 0]));
    assert_eq!(primitives[1]["aabb"]["min"], json!([0.5, 0, 0]));
    assert_pair_reaches_csg(&engine, &subject_hash, "A#0", "A#0");
}

#[test]
fn should_preserve_ids_after_an_empty_primitive_gap() {
    let primary = document(
        json!([
            {"mesh": 0, "name": "empty"},
            {"mesh": 1, "name": "A"},
            {"mesh": 1, "name": "B", "translation": [0.5, 0, 0]}
        ]),
        json!([
            {"primitives": [{"attributes": {"POSITION": 0}, "indices": 2}]},
            {"primitives": [{"attributes": {"POSITION": 0}, "indices": 1}]}
        ]),
    );
    let mut engine = Engine::new();
    let subject_hash = ingest(&mut engine, primary, cube_buffer());
    let analysis = analyze(&engine, &subject_hash);
    let primitives = analysis["boundingBox"]["primitives"].as_array().unwrap();

    assert_eq!(analysis["meshCount"], 3);
    assert_eq!(analysis["triangleCount"], 24);
    assert_eq!(
        primitives
            .iter()
            .map(|primitive| primitive["name"].as_str().unwrap())
            .collect::<Vec<_>>(),
        ["empty#0", "A#0", "B#0"]
    );
    assert_eq!(primitives[1]["aabb"]["min"], json!([0, 0, 0]));
    assert_eq!(primitives[2]["aabb"]["min"], json!([0.5, 0, 0]));
    assert_pair_reaches_csg(&engine, &subject_hash, "A#0", "B#0");
}
