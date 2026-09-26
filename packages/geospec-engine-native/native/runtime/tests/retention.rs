use geospec_engine_native_core::backend::{csg::*, BackendError, TriangleMesh};
use geospec_engine_native_csg::ManifoldCsgConnector;
use geospec_engine_native_occt::OcctConnector;
use geospec_engine_native_runtime::{Engine, EngineConfig};
use serde_json::{json, Value};
use std::{
    cell::Cell,
    fs,
    path::{Path, PathBuf},
    rc::Rc,
};

// Shipped Manifold WASM and repaired Rust Manifold agree on this exact bit pattern.
const EXPECTED_INTERSECTION_VOLUME: f64 = f64::from_bits(0x3fdf_ffff_ffff_ffff);
const MAIN_EVALUATIONS: usize = 1001;

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
struct Counts {
    admissions: usize,
    booleans: usize,
    created: usize,
    released: usize,
    live: usize,
    peak: usize,
}

impl Counts {
    fn json(self, query: usize) -> Value {
        json!({
            "query": query,
            "admissions": self.admissions,
            "booleans": self.booleans,
            "created": self.created,
            "released": self.released,
            "live": self.live,
            "peak": self.peak,
        })
    }
}

struct CountedCsg {
    inner: ManifoldCsgConnector,
    counts: Rc<Cell<Counts>>,
}

impl CountedCsg {
    fn update(&self, change: impl FnOnce(&mut Counts)) {
        let mut counts = self.counts.get();
        change(&mut counts);
        self.counts.set(counts);
    }

    fn created(&self, count: usize) {
        self.update(|counts| {
            counts.created += count;
            counts.live += count;
            counts.peak = counts.peak.max(counts.live);
        });
    }
}

impl CsgConnector for CountedCsg {
    fn admit(&mut self, mesh: &TriangleMesh, merges: &[[u32; 2]]) -> Result<SolidId, BackendError> {
        let result = self.inner.admit(mesh, merges);
        if result.is_ok() {
            self.update(|counts| counts.admissions += 1);
            self.created(1);
        }
        result
    }

    fn release(&mut self, id: SolidId) -> Result<(), BackendError> {
        let result = self.inner.release(id);
        if result.is_ok() {
            self.update(|counts| {
                counts.released += 1;
                counts.live -= 1;
            });
        }
        result
    }

    fn boolean(&mut self, op: BooleanOp, ids: &[SolidId]) -> Result<SolidId, BackendError> {
        self.update(|counts| counts.booleans += 1);
        let result = self.inner.boolean(op, ids);
        if result.is_ok() {
            self.created(1);
        }
        result
    }

    fn transform(&mut self, id: SolidId, m: [f64; 12]) -> Result<SolidId, BackendError> {
        let result = self.inner.transform(id, m);
        if result.is_ok() {
            self.created(1);
        }
        result
    }

    fn decompose(&mut self, id: SolidId) -> Result<Vec<SolidId>, BackendError> {
        let result = self.inner.decompose(id);
        if let Ok(ids) = &result {
            self.created(ids.len());
        }
        result
    }

    fn properties(&self, id: SolidId) -> Result<SolidProperties, BackendError> {
        self.inner.properties(id)
    }

    fn export(&self, id: SolidId) -> Result<MeshExport, BackendError> {
        self.inner.export(id)
    }

    fn slice(&self, id: SolidId, z: f64) -> Result<Section, BackendError> {
        self.inner.slice(id, z)
    }

    fn section(&self, p: &[Vec<[f64; 2]>], f: FillRule) -> Result<Section, BackendError> {
        self.inner.section(p, f)
    }

    fn section_boolean(
        &self,
        op: SectionOp,
        a: &Section,
        b: &Section,
    ) -> Result<Section, BackendError> {
        self.inner.section_boolean(op, a, b)
    }
}

fn cube_buffer() -> Vec<u8> {
    let vertices: [[f32; 3]; 8] = [
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

fn counted_engine() -> (Engine, Rc<Cell<Counts>>) {
    let counts = Rc::new(Cell::new(Counts::default()));
    let engine = Engine::with_backends(
        EngineConfig::entry(),
        Box::new(OcctConnector),
        Box::new(CountedCsg {
            inner: ManifoldCsgConnector::new(),
            counts: Rc::clone(&counts),
        }),
    );
    (engine, counts)
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

fn claim_request(subject_hash: &str, payload: Value) -> Vec<u8> {
    serde_json::to_vec(&json!({
        "method": "submitClaims",
        "requestId": "query",
        "protocolVersion": 3,
        "registryVersion": 5,
        "canonicalProfile": "geospec-jcs-v1",
        "plan": {
            "subjects": [{"slot": "part", "subjectHash": subject_hash}],
            "claims": [{
                "claimId": "overlap",
                "capability": "analyzeMeshOverlap",
                "subjectSlots": ["part"],
                "payload": payload,
                "polarity": "positive",
                "workUnitBudget": 8_000_000
            }]
        }
    }))
    .unwrap()
}

fn assert_overlap(result: &[u8], expected: [(u64, &str); 2], selected: Option<[&str; 2]>) -> Value {
    let result: Value = serde_json::from_slice(result).unwrap();
    assert_eq!(result["results"][0]["status"], "passed", "{result}");
    let evidence = &result["results"][0]["evidence"]["evidence"];
    assert_eq!(evidence["componentCount"], 2);
    assert_eq!(evidence["checkedPairs"], 1);
    let overlap = &evidence["overlaps"][0];
    assert_eq!(overlap["leftComponentId"], expected[0].0);
    assert_eq!(overlap["leftLabel"], expected[0].1);
    assert_eq!(overlap["rightComponentId"], expected[1].0);
    assert_eq!(overlap["rightLabel"], expected[1].1);
    assert!(overlap["intersectionVolume"].is_number());
    if let Some([left, right]) = selected {
        assert_eq!(
            evidence["selectedPairs"],
            json!([{"leftLabel": left, "rightLabel": right}])
        );
    }
    overlap["intersectionVolume"].clone()
}

fn evidence_root() -> Option<PathBuf> {
    std::env::var_os("GEOSPEC_RETENTION_EVIDENCE_DIR").map(PathBuf::from)
}

fn write_evidence(root: Option<&Path>, name: &str, bytes: &[u8]) {
    if let Some(root) = root {
        let path = root.join(name);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, bytes).unwrap();
    }
}

fn write_json(root: Option<&Path>, name: &str, value: &Value) {
    write_evidence(root, name, &serde_json::to_vec_pretty(value).unwrap());
}

fn assert_counts(counts: Counts) {
    assert_eq!(
        counts,
        Counts {
            admissions: 2,
            booleans: 1,
            created: 3,
            released: 1,
            live: 2,
            peak: 3,
        }
    );
}

#[test]
fn repeated_overlap_queries_reuse_the_two_real_source_operands() {
    let root = evidence_root();
    let primary = document(
        json!([
            {"mesh": 0, "name": "A"},
            {"mesh": 1, "name": "B", "translation": [0.5, 0, 0]}
        ]),
        json!([
            {"primitives": [{"attributes": {"POSITION": 0}, "indices": 1}]},
            {"primitives": [{"attributes": {"POSITION": 0}, "indices": 1}]}
        ]),
    );
    let buffer = cube_buffer();
    write_evidence(root.as_deref(), "raw/main-primary-a2.json", &primary);
    write_evidence(root.as_deref(), "raw/main-buffer-a2.bin", &buffer);
    let (mut engine, counts) = counted_engine();
    let subject_hash = ingest(&mut engine, primary, buffer);
    let request = claim_request(&subject_hash, json!({}));
    let plan = engine.canonical_plan(&request).unwrap();
    write_evidence(root.as_deref(), "raw/main-request-a2.json", &request);
    write_evidence(root.as_deref(), "raw/main-first-plan-a2.json", &plan);

    let mut first = None;
    let mut counter_records = Vec::with_capacity(MAIN_EVALUATIONS);
    let mut numeric_records = Vec::with_capacity(MAIN_EVALUATIONS + 6);
    for query in 0..MAIN_EVALUATIONS {
        let reconstructed = engine.canonical_plan(&request).unwrap();
        assert_eq!(reconstructed, plan);
        let result = engine.evaluate_plan(&reconstructed).unwrap();
        let observed = counts.get();
        write_evidence(
            root.as_deref(),
            &format!("raw/main-result-a2-{query:04}.json"),
            &result,
        );
        write_json(
            root.as_deref(),
            &format!("raw/main-counter-a2-{query:04}.json"),
            &observed.json(query + 1),
        );
        let volume = assert_overlap(&result, [(0, "A#0"), (1, "B#0")], None);
        numeric_records.push(json!({
            "case": "distinct-meshes", "query": query + 1, "intersectionVolume": volume
        }));
        if let Some(first) = &first {
            assert_eq!(&result, first);
        } else {
            first = Some(result.clone());
        }
        assert_counts(observed);
        counter_records.push(observed.json(query + 1));
        if query + 1 == MAIN_EVALUATIONS {
            write_evidence(root.as_deref(), "raw/main-last-result-a2.json", &result);
            write_evidence(
                root.as_deref(),
                "raw/main-last-plan-a2.json",
                &reconstructed,
            );
        }
    }

    let first = first.unwrap();
    write_evidence(root.as_deref(), "raw/main-first-result-a2.json", &first);
    write_json(
        root.as_deref(),
        "raw/main-counters-a2.json",
        &Value::Array(counter_records),
    );
    numeric_records.extend(instance_identity_controls_retain_real_operands_cold_and_warm());
    assert_eq!(numeric_records.len(), MAIN_EVALUATIONS + 6);
    write_json(
        root.as_deref(),
        "raw/numeric-observations-a2.json",
        &json!({
            "retentionChecksPassed": true,
            "exactNumericChecksPassed": numeric_records.iter().all(|row|
                row["intersectionVolume"] == EXPECTED_INTERSECTION_VOLUME),
            "expectedIntersectionVolume": EXPECTED_INTERSECTION_VOLUME,
            "observations": numeric_records
        }),
    );
    // All independent healthy controls and their evidence precede this gate.
    for observation in numeric_records {
        assert_eq!(
            observation["intersectionVolume"], EXPECTED_INTERSECTION_VOLUME,
            "{observation}"
        );
    }
}

fn instance_identity_controls_retain_real_operands_cold_and_warm() -> Vec<Value> {
    let root = evidence_root();
    let mut numeric_records = Vec::with_capacity(6);
    let cases = [
        (
            "shared-mesh",
            document(
                json!([
                    {"mesh": 0, "name": "A"},
                    {"mesh": 0, "name": "B", "translation": [0.5, 0, 0]}
                ]),
                json!([{"primitives": [{"attributes": {"POSITION": 0}, "indices": 1}]}]),
            ),
            [(0, "A#0"), (1, "B#0")],
            ["A#0", "B#0"],
        ),
        (
            "same-display-name",
            document(
                json!([
                    {"mesh": 0, "name": "A"},
                    {"mesh": 0, "name": "A", "translation": [0.5, 0, 0]}
                ]),
                json!([{"primitives": [{"attributes": {"POSITION": 0}, "indices": 1}]}]),
            ),
            [(0, "A#0"), (1, "A#0")],
            ["A#0", "A#0"],
        ),
        (
            "empty-primitive-gap",
            document(
                json!([
                    {"mesh": 0, "name": "empty"},
                    {"mesh": 1, "name": "A"},
                    {"mesh": 1, "name": "B", "translation": [0.5, 0, 0]}
                ]),
                json!([
                    {"primitives": [{"attributes": {"POSITION": 0}, "indices": 2}]},
                    {"primitives": [{"attributes": {"POSITION": 0}, "indices": 1}]}
                ]),
            ),
            [(1, "A#0"), (2, "B#0")],
            ["A#0", "B#0"],
        ),
    ];

    for (name, primary, expected, selected) in cases {
        let buffer = cube_buffer();
        write_evidence(
            root.as_deref(),
            &format!("raw/{name}-primary-a2.json"),
            &primary,
        );
        write_evidence(
            root.as_deref(),
            &format!("raw/{name}-buffer-a2.bin"),
            &buffer,
        );
        let (mut engine, counts) = counted_engine();
        let subject_hash = ingest(&mut engine, primary, buffer);
        let request = claim_request(
            &subject_hash,
            json!({"pairs": [{"left": selected[0], "right": selected[1]}]}),
        );
        let plan = engine.canonical_plan(&request).unwrap();
        write_evidence(
            root.as_deref(),
            &format!("raw/{name}-request-a2.json"),
            &request,
        );
        write_evidence(root.as_deref(), &format!("raw/{name}-plan-a2.json"), &plan);
        let mut records = Vec::with_capacity(2);
        let mut cold = None;
        for query in 0..2 {
            let reconstructed = engine.canonical_plan(&request).unwrap();
            assert_eq!(reconstructed, plan);
            let result = engine.evaluate_plan(&reconstructed).unwrap();
            let observed = counts.get();
            write_evidence(
                root.as_deref(),
                &format!("raw/{name}-result-a2-{query}.json"),
                &result,
            );
            write_json(
                root.as_deref(),
                &format!("raw/{name}-counter-a2-{query}.json"),
                &observed.json(query + 1),
            );
            let volume = assert_overlap(&result, expected, Some(selected));
            numeric_records.push(json!({
                "case": name, "query": query + 1, "intersectionVolume": volume
            }));
            if let Some(cold) = &cold {
                assert_eq!(&result, cold);
            } else {
                cold = Some(result.clone());
            }
            assert_counts(observed);
            records.push(observed.json(query + 1));
        }
        write_json(
            root.as_deref(),
            &format!("raw/{name}-counters-a2.json"),
            &Value::Array(records),
        );
    }
    numeric_records
}
