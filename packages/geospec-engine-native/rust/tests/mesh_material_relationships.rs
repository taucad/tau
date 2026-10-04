//! Public-shaped retained mesh Body controls, not AP242/analytic evidence.
use geospec_engine_native_core::Engine;
use serde_json::{json, Value};

fn cubes(nodes: Value) -> (Engine, String) {
    shells(nodes, &[(0.0, 1.0, false)])
}

fn shells(nodes: Value, boxes: &[(f32, f32, bool)]) -> (Engine, String) {
    let positions: [[f32; 3]; 8] = [
        [0., 0., 0.],
        [1., 0., 0.],
        [1., 1., 0.],
        [0., 1., 0.],
        [0., 0., 1.],
        [1., 0., 1.],
        [1., 1., 1.],
        [0., 1., 1.],
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
    let mut buffer = Vec::new();
    for &(min, max, _) in boxes {
        buffer.extend(
            positions
                .into_iter()
                .flatten()
                .map(|value| min + value * (max - min))
                .flat_map(f32::to_le_bytes),
        );
    }
    let position_bytes = buffer.len();
    for (index, &(_, _, inward)) in boxes.iter().enumerate() {
        for triangle in triangles {
            let mut triangle = triangle.map(|vertex| vertex + (index as u16) * 8);
            if inward {
                triangle.swap(1, 2);
            }
            buffer.extend(triangle.into_iter().flat_map(u16::to_le_bytes));
        }
    }
    let min = boxes
        .iter()
        .map(|value| value.0)
        .fold(f32::INFINITY, f32::min);
    let max = boxes
        .iter()
        .map(|value| value.1)
        .fold(f32::NEG_INFINITY, f32::max);
    let document = serde_json::to_vec(&json!({"asset":{"version":"2.0"},"scene":0,"scenes":[{"nodes":(0..nodes.as_array().unwrap().len()).collect::<Vec<_>>()}],"nodes":nodes,"meshes":[{"primitives":[{"attributes":{"POSITION":0},"indices":1}]}],"buffers":[{"uri":"cube.bin","byteLength":buffer.len()}],"bufferViews":[{"buffer":0,"byteOffset":0,"byteLength":position_bytes},{"buffer":0,"byteOffset":position_bytes,"byteLength":buffer.len()-position_bytes}],"accessors":[{"bufferView":0,"componentType":5126,"count":boxes.len()*8,"type":"VEC3","min":[min,min,min],"max":[max,max,max]},{"bufferView":1,"componentType":5123,"count":boxes.len()*36,"type":"SCALAR"}]})).unwrap();
    let mut engine = Engine::new();
    let request = json!({"method":"ingestSubject","requestId":"admit","protocolVersion":3,"registryVersion":5,"canonicalProfile":"geospec-jcs-v1","format":"gltf","frame":{"coordinateSystem":"z-up","sourceUnit":"mm","outputUnit":"mm"},"ingestOptions":{},"primaryByteLength":document.len(),"resources":[{"name":"cube.bin","byteLength":buffer.len()}]});
    let response: Value = serde_json::from_slice(
        &engine
            .ingest_subject(
                &serde_json::to_vec(&request).unwrap(),
                &document,
                vec![buffer],
            )
            .unwrap(),
    )
    .unwrap();
    (
        engine,
        response["result"]["subject"]["subjectHash"]
            .as_str()
            .unwrap()
            .into(),
    )
}

#[test]
fn body_roots_include_cavities_but_not_disconnected_roots_or_islands() {
    for (boxes, count) in [
        (vec![(0.0, 1.0, false), (3.0, 4.0, false)], 2),
        (vec![(-3.0, 3.0, false), (-2.0, 2.0, true)], 1),
        (
            vec![(-3.0, 3.0, false), (-2.0, 2.0, true), (-1.0, 1.0, false)],
            2,
        ),
    ] {
        let (engine, hash) = shells(json!([{"mesh":0,"name":"roots"}]), &boxes);
        let result = claim(
            &engine,
            &hash,
            "inspectGeometry",
            json!({"selectors":[{"kind":"body","of":"roots#0","expect":"many"}]}),
            "positive",
        );
        assert_eq!(
            result["result"]["results"][0]["status"], "passed",
            "{result}"
        );
        assert_eq!(
            result["result"]["results"][0]["evidence"]["selections"][0]["matches"]
                .as_array()
                .unwrap()
                .len(),
            count,
            "{result}"
        );
    }
}

#[test]
fn unsupported_recursive_mesh_measure_queries_do_not_invert_missing_facts() {
    let (engine, hash) = cubes(json!([{"mesh":0,"name":"part"}]));
    for query in [
        json!({"area":1}),
        json!({"orderBy":"area"}),
        json!({"not":{"area":1}}),
        json!({"anyOf":[{}, {"area":1}]}),
        json!({"allOf":[{"area":1}]}),
    ] {
        let result = claim(
            &engine,
            &hash,
            "inspectGeometry",
            json!({"selectors":[{"kind":"body","of":"part#0","query":query}]}),
            "positive",
        );
        assert_eq!(
            result["result"]["results"][0]["status"], "failed",
            "{result}"
        );
        assert_eq!(
            result["result"]["results"][0]["evidence"]["selections"][0]["matches"],
            json!([]),
            "{result}"
        );
    }
}

#[test]
fn selected_cavity_island_has_clearance_but_is_not_inside_housing_material() {
    let (engine, hash) = shells(
        json!([{"mesh":0,"name":"housing"}]),
        &[(-3., 3., false), (-2., 2., true), (-1., 1., false)],
    );
    for (kind, extra, status) in [
        ("containment", json!({}), "failed"),
        (
            "clearance",
            json!({"min":1,"max":1,"tolerance":0}),
            "passed",
        ),
        ("contact", json!({"tolerance":0}), "failed"),
    ] {
        let mut relation = json!({"kind":kind,"subject":{"kind":"body","of":"housing#0","query":{"pick":"last"}},"target":{"kind":"body","of":"housing#0","query":{"pick":"first"}}});
        relation
            .as_object_mut()
            .unwrap()
            .extend(extra.as_object().unwrap().clone());
        let result = claim(
            &engine,
            &hash,
            "toHaveSpatialRelationships",
            json!({"relationships":[relation]}),
            "positive",
        );
        assert_eq!(
            result["result"]["results"][0]["status"], status,
            "{kind}: {result}"
        );
    }
}

#[test]
fn containment_does_not_union_targets_that_individually_cover_separate_bodies() {
    let (engine, hash) = cubes(
        json!([{"mesh":0,"name":"subject"},{"mesh":0,"name":"subject","translation":[3,0,0]},{"mesh":0,"name":"target"},{"mesh":0,"name":"target","translation":[3,0,0]}]),
    );
    let result = claim(
        &engine,
        &hash,
        "toHaveSpatialRelationships",
        json!({"relationships":[{"kind":"containment","subject":{"kind":"body","of":"subject#0","expect":"many"},"target":{"kind":"body","of":"target#0","expect":"many"}}]}),
        "positive",
    );
    assert_eq!(
        result["result"]["results"][0]["status"], "failed",
        "{result}"
    );
}

fn claim(engine: &Engine, hash: &str, capability: &str, payload: Value, polarity: &str) -> Value {
    let payload = if capability == "toHaveSpatialRelationships" {
        json!({"kind":"spatialRelationships","expected":payload})
    } else {
        payload
    };
    let request = json!({"method":"submitClaims","requestId":"claim","protocolVersion":3,"registryVersion":5,"canonicalProfile":"geospec-jcs-v1","plan":{"subjects":[{"slot":"part","subjectHash":hash}],"claims":[{"claimId":"claim","capability":capability,"subjectSlots":["part"],"payload":payload,"polarity":polarity,"workUnitBudget":8_000_000}]}});
    serde_json::from_slice(
        &engine
            .process_request(&serde_json::to_vec(&request).unwrap())
            .unwrap(),
    )
    .unwrap()
}

#[test]
fn mesh_body_inspection_reports_mesh_not_step_and_duplicate_labels_remain_ambiguous() {
    let (engine, hash) = cubes(json!([{"mesh":0,"name":"part"}]));
    let result = claim(
        &engine,
        &hash,
        "inspectGeometry",
        json!({"selectors":[{"kind":"body","of":"part#0"}]}),
        "positive",
    );
    assert_eq!(
        result["result"]["results"][0]["status"], "passed",
        "{result}"
    );
    assert_eq!(
        result["result"]["results"][0]["evidence"]["selections"][0]["matches"][0]["source"], "mesh",
        "{result}"
    );
    let (engine, hash) =
        cubes(json!([{"mesh":0,"name":"part"},{"mesh":0,"name":"part","translation":[3,0,0]}]));
    for polarity in ["positive", "negative"] {
        let result = claim(
            &engine,
            &hash,
            "toHaveSpatialRelationships",
            json!({"relationships":[{"kind":"contact","subject":{"kind":"body","of":"part#0"},"target":{"kind":"body","of":"part#0"},"tolerance":0}]}),
            polarity,
        );
        assert_ne!(
            result["result"]["results"][0]["status"], "passed",
            "{result}"
        );
    }
}

#[test]
fn body_contact_clearance_and_overlap_use_material_not_boxes() {
    for (shift, kind, extra, status) in [
        (1.0, "contact", json!({"tolerance":0}), "passed"),
        (0.5, "contact", json!({"tolerance":0}), "failed"),
        (
            2.0,
            "clearance",
            json!({"min":1,"max":1,"tolerance":0}),
            "passed",
        ),
        (
            0.5,
            "interference",
            json!({"minVolume":0.5,"maxVolume":0.5}),
            "passed",
        ),
        (
            1.0 - 2f64.powi(-44),
            "contact",
            json!({"tolerance":0}),
            "failed",
        ),
    ] {
        let (engine, hash) = cubes(
            json!([{"mesh":0,"name":"left"},{"mesh":0,"name":"right","translation":[shift,0,0]}]),
        );
        let mut relation = json!({"kind":kind,"subject":{"kind":"body","of":"left#0"},"target":{"kind":"body","of":"right#0"}});
        relation
            .as_object_mut()
            .unwrap()
            .extend(extra.as_object().unwrap().clone());
        let result = claim(
            &engine,
            &hash,
            "toHaveSpatialRelationships",
            json!({"relationships":[relation]}),
            "positive",
        );
        assert_eq!(
            result["result"]["results"][0]["status"], status,
            "{kind}/{shift}: {result}"
        );
    }
}

#[test]
fn missing_mesh_analytic_evidence_refuses_both_polarities() {
    let (engine, hash) = cubes(json!([{"mesh":0,"name":"part"}]));
    for polarity in ["positive", "negative"] {
        let result = claim(
            &engine,
            &hash,
            "toHaveSpatialRelationships",
            json!({"relationships":[{"kind":"contact","subject":{"kind":"face","of":"part#0"},"target":{"kind":"body","of":"part#0"}}]}),
            polarity,
        );
        assert_eq!(
            result["result"]["results"][0]["status"], "refused",
            "{result}"
        );
    }
}
