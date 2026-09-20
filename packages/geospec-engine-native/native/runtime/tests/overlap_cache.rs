// Fixture helpers cube_buffer/document copied verbatim from retention.rs
// SHA-256 4a1f366592ed8159384c75cd6cff29711ae91b24ccbe9b2c2d156fb19fab57c7.
// The forwarding wrapper adds only an actual properties-request counter.
use geospec_engine_native_cache_host::AuthenticatedOverlapCache;
use geospec_engine_native_core::backend::{csg::*, BackendError, TriangleMesh};
use geospec_engine_native_csg::ManifoldCsgConnector;
use geospec_engine_native_occt::OcctConnector;
use geospec_engine_native_runtime::{producer_identity, Engine, EngineConfig};
use serde_json::{json, Value};
use std::{
    cell::Cell,
    fs,
    path::{Path, PathBuf},
    rc::Rc,
    time::{SystemTime, UNIX_EPOCH},
};

const EXPECTED_INTERSECTION_VOLUME: f64 = 0.5;
const MAIN_EVALUATIONS: usize = 1001;

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
struct Counts {
    calls: usize,
    admissions: usize,
    booleans: usize,
    properties: usize,
    created: usize,
    released: usize,
    live: usize,
    peak: usize,
}

impl Counts {
    fn json(self) -> Value {
        json!({
            "calls": self.calls,
            "admissions": self.admissions,
            "booleans": self.booleans,
            "properties": self.properties,
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
        self.update(|counts| counts.calls += 1);
        let result = self.inner.admit(mesh, merges);
        if result.is_ok() {
            self.update(|counts| counts.admissions += 1);
            self.created(1);
        }
        result
    }

    fn release(&mut self, id: SolidId) -> Result<(), BackendError> {
        self.update(|counts| counts.calls += 1);
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
        self.update(|counts| counts.calls += 1);
        let result = self.inner.boolean(op, ids);
        if result.is_ok() {
            self.created(1);
        }
        result
    }

    fn transform(&mut self, id: SolidId, m: [f64; 12]) -> Result<SolidId, BackendError> {
        self.update(|counts| counts.calls += 1);
        let result = self.inner.transform(id, m);
        if result.is_ok() {
            self.created(1);
        }
        result
    }

    fn decompose(&mut self, id: SolidId) -> Result<Vec<SolidId>, BackendError> {
        self.update(|counts| counts.calls += 1);
        let result = self.inner.decompose(id);
        if let Ok(ids) = &result {
            self.created(ids.len());
        }
        result
    }

    fn properties(&self, id: SolidId) -> Result<SolidProperties, BackendError> {
        self.update(|counts| {
            counts.calls += 1;
            counts.properties += 1;
        });
        self.inner.properties(id)
    }

    fn export(&self, id: SolidId) -> Result<MeshExport, BackendError> {
        self.update(|counts| counts.calls += 1);
        self.inner.export(id)
    }

    fn slice(&self, id: SolidId, z: f64) -> Result<Section, BackendError> {
        self.update(|counts| counts.calls += 1);
        self.inner.slice(id, z)
    }

    fn section(&self, p: &[Vec<[f64; 2]>], f: FillRule) -> Result<Section, BackendError> {
        self.update(|counts| counts.calls += 1);
        self.inner.section(p, f)
    }

    fn section_boolean(
        &self,
        op: SectionOp,
        a: &Section,
        b: &Section,
    ) -> Result<Section, BackendError> {
        self.update(|counts| counts.calls += 1);
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

fn counted_engine_with_cache(cache: Rc<AuthenticatedOverlapCache>) -> (Engine, Rc<Cell<Counts>>) {
    let counts = Rc::new(Cell::new(Counts::default()));
    let engine = Engine::with_backends_and_overlap_cache(
        EngineConfig::entry(),
        Box::new(OcctConnector),
        Box::new(CountedCsg {
            inner: ManifoldCsgConnector::new(),
            counts: Rc::clone(&counts),
        }),
        cache,
        producer_identity().expect("verified release producer profile"),
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

fn evidence_root() -> Option<PathBuf> {
    std::env::var_os("GEOSPEC_OVERLAP_CACHE_EVIDENCE_DIR").map(PathBuf::from)
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

fn primary() -> Vec<u8> {
    document(
        json!([
            {"mesh": 0, "name": "A"},
            {"mesh": 1, "name": "B", "translation": [0.5, 0, 0]}
        ]),
        json!([
            {"primitives": [{"attributes": {"POSITION": 0}, "indices": 1}]},
            {"primitives": [{"attributes": {"POSITION": 0}, "indices": 1}]}
        ]),
    )
}

fn request(
    subject: &str,
    capability: &str,
    payload: Value,
    polarity: &str,
    budget: u64,
    id: &str,
) -> Vec<u8> {
    serde_json::to_vec(&json!({
        "method": "submitClaims", "requestId": "query",
        "protocolVersion": 3, "registryVersion": 5, "canonicalProfile": "geospec-jcs-v1",
        "plan": {
            "subjects": [{"slot": "part", "subjectHash": subject}],
            "claims": [{
                "claimId": id, "capability": capability, "subjectSlots": ["part"],
                "payload": payload, "polarity": polarity, "workUnitBudget": budget
            }]
        }
    }))
    .unwrap()
}

fn query(subject: &str, payload: Value, budget: u64) -> Vec<u8> {
    request(
        subject,
        "analyzeMeshOverlap",
        payload,
        "positive",
        budget,
        "overlap",
    )
}

fn evaluate(
    engine: &mut Engine,
    counts: &Cell<Counts>,
    root: Option<&Path>,
    name: &str,
    request: &[u8],
) -> (Vec<u8>, Vec<u8>) {
    let plan = engine.canonical_plan(request).unwrap();
    write_evidence(root, &format!("raw/{name}-request.json"), request);
    write_evidence(root, &format!("raw/{name}-plan.json"), &plan);
    let result = engine.evaluate_plan(&plan).unwrap();
    write_evidence(root, &format!("raw/{name}-result.json"), &result);
    write_json(
        root,
        &format!("raw/{name}-counters.json"),
        &counts.get().json(),
    );
    (plan, result)
}

fn assert_computations(counts: Counts, computations: usize) {
    assert_eq!(
        counts,
        Counts {
            calls: 2 + 3 * computations,
            admissions: 2,
            booleans: computations,
            properties: computations,
            created: computations + 2,
            released: computations,
            live: 2,
            peak: 3,
        }
    );
}

fn query_volume(result: &[u8]) -> Value {
    let value: Value = serde_json::from_slice(result).unwrap();
    let row = &value["results"][0];
    assert_eq!(row["status"], "passed");
    assert_eq!(row["diagnostics"], json!([]));
    let evidence = &row["evidence"]["evidence"];
    assert_eq!(evidence["componentCount"], 2);
    assert_eq!(evidence["checkedPairs"], 1);
    let overlaps = evidence["overlaps"].as_array().unwrap();
    assert_eq!(overlaps.len(), 1);
    let overlap = &overlaps[0];
    assert_eq!(overlap["leftComponentId"], 0);
    assert_eq!(overlap["rightComponentId"], 1);
    assert_eq!(overlap["leftLabel"], "A#0");
    assert_eq!(overlap["rightLabel"], "B#0");
    assert!(overlap["intersectionVolume"].is_number());
    overlap["intersectionVolume"].clone()
}

#[test]
fn repeated_overlap_reuses_owned_results_with_identical_logical_requests() {
    let root = evidence_root();
    let root = root.as_deref();
    let primary = primary();
    let buffer = cube_buffer();
    write_evidence(root, "raw/primary.json", &primary);
    write_evidence(root, "raw/buffer.bin", &buffer);
    let (mut engine, counts) = counted_engine();
    let subject = ingest(&mut engine, primary, buffer);
    let request = query(&subject, json!({}), 180);
    let mut first = None;
    let mut observations = Vec::with_capacity(MAIN_EVALUATIONS);
    let mut counters = Vec::with_capacity(MAIN_EVALUATIONS);
    for index in 0..MAIN_EVALUATIONS {
        let observed = evaluate(
            &mut engine,
            &counts,
            root,
            &format!("main-{index:04}"),
            &request,
        );
        let volume = query_volume(&observed.1);
        observations.push(json!({"query": index + 1, "intersectionVolume": volume}));
        counters.push(json!({"query": index + 1, "counts": counts.get().json()}));
        if let Some(first) = &first {
            assert_eq!(&observed, first, "complete canonical plan/result bytes");
        } else {
            first = Some(observed);
        }
        assert_computations(counts.get(), 1);
    }
    write_json(root, "raw/main-counters.json", &Value::Array(counters));
    write_json(
        root,
        "raw/numeric-gate.json",
        &json!({
            "cacheChecksPassed": true,
            "expectedIntersectionVolume": EXPECTED_INTERSECTION_VOLUME,
            "numericAcceptance": "diagnostic-only-under-charter-A1-R2",
            "exactNumericChecksPassed": observations.iter().all(|row|
                row["intersectionVolume"] == EXPECTED_INTERSECTION_VOLUME),
            "observations": observations
        }),
    );
    // Charter A1-R2 retains the analytic 0.5 comparison above as diagnostic
    // evidence, not an exact-domain verdict for this approximate CSG query.
    // Cache acceptance remains exact complete plan/result bytes and counters;
    // independent numerical accuracy qualification is a separate obligation.
}

#[test]
fn authenticated_overlap_survives_reopen_and_replays_before_evidence() {
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let cache_root =
        std::env::temp_dir().join(format!("geospec-m4-overlap-{}-{nonce}", std::process::id()));
    let manifest_root = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let project_root = manifest_root.ancestors().nth(4).unwrap();

    let first_cache = Rc::new(AuthenticatedOverlapCache::open(&cache_root, project_root).unwrap());
    let (mut first_engine, first_counts) = counted_engine_with_cache(first_cache.clone());
    let subject = ingest(&mut first_engine, primary(), cube_buffer());
    let request = query(&subject, json!({}), 180);
    let first = evaluate(
        &mut first_engine,
        &first_counts,
        None,
        "persistent-first",
        &request,
    );
    query_volume(&first.1);
    assert_computations(first_counts.get(), 1);
    let first_flush = first_cache.flush();
    assert_eq!(first_cache.flush(), first_flush, "repeated flush result");
    drop(first_engine);
    drop(first_cache);

    let reopened_cache =
        Rc::new(AuthenticatedOverlapCache::open(&cache_root, project_root).unwrap());
    let (mut reopened_engine, reopened_counts) = counted_engine_with_cache(reopened_cache.clone());
    assert_eq!(
        ingest(&mut reopened_engine, primary(), cube_buffer()),
        subject
    );
    let refused = evaluate(
        &mut reopened_engine,
        &reopened_counts,
        None,
        "persistent-budget-refusal",
        &query(&subject, json!({}), 179),
    );
    assert_eq!(reopened_counts.get(), Counts::default());
    let refused: Value = serde_json::from_slice(&refused.1).unwrap();
    assert_eq!(refused["results"][0]["status"], "refused");
    assert!(refused["results"][0].get("evidence").is_none());

    let reopened = evaluate(
        &mut reopened_engine,
        &reopened_counts,
        None,
        "persistent-hit",
        &request,
    );
    assert_eq!(reopened, first, "persistent result and plan bytes");
    assert_eq!(reopened_counts.get(), Counts::default(), "zero CSG calls");
    assert!(reopened_cache.clear());
    drop(reopened_engine);
    drop(reopened_cache);

    let empty_cache = Rc::new(AuthenticatedOverlapCache::open(&cache_root, project_root).unwrap());
    let (mut cold_engine, cold_counts) = counted_engine_with_cache(empty_cache);
    assert_eq!(ingest(&mut cold_engine, primary(), cube_buffer()), subject);
    let cold = evaluate(
        &mut cold_engine,
        &cold_counts,
        None,
        "after-eviction",
        &request,
    );
    assert_eq!(cold, first);
    assert_computations(cold_counts.get(), 1);
    fs::remove_dir_all(cache_root).unwrap();
}

#[test]
fn authenticated_overlap_positive_reopen_matches_cold_bytes_and_accounting() {
    let evidence_root = evidence_root();
    let evidence_root = evidence_root.as_deref();
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let cache_root = std::env::temp_dir().join(format!(
        "geospec-m4-overlap-positive-{}-{nonce}",
        std::process::id()
    ));
    let manifest_root = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let project_root = manifest_root.ancestors().nth(4).unwrap();

    let cold_cache = Rc::new(AuthenticatedOverlapCache::open(&cache_root, project_root).unwrap());
    let (mut cold_engine, cold_counts) = counted_engine_with_cache(cold_cache.clone());
    let subject = ingest(&mut cold_engine, primary(), cube_buffer());
    let request = query(&subject, json!({}), 180);
    let cold = evaluate(
        &mut cold_engine,
        &cold_counts,
        evidence_root,
        "positive-cold",
        &request,
    );
    query_volume(&cold.1);
    assert_computations(cold_counts.get(), 1);
    let cold_flush = serde_json::from_slice::<Value>(&cold_cache.flush()).unwrap();
    assert_eq!(
        cold_flush,
        json!({
            "authenticationFailures": 0,
            "hits": 0,
            "ioFailures": 0,
            "misses": 1,
            "reads": 1,
            "rejectedWrites": 0,
            "sealed": true,
            "writes": 1
        })
    );
    write_json(evidence_root, "raw/positive-cold-flush.json", &cold_flush);
    drop(cold_engine);
    drop(cold_cache);

    let hit_cache = Rc::new(AuthenticatedOverlapCache::open(&cache_root, project_root).unwrap());
    let (mut hit_engine, hit_counts) = counted_engine_with_cache(hit_cache.clone());
    assert_eq!(ingest(&mut hit_engine, primary(), cube_buffer()), subject);
    let hit = evaluate(
        &mut hit_engine,
        &hit_counts,
        evidence_root,
        "positive-hit",
        &request,
    );
    assert_eq!(hit, cold, "canonical cold and persisted-hit bytes");
    assert_eq!(hit_counts.get(), Counts::default(), "zero hit CSG calls");
    let hit_flush = serde_json::from_slice::<Value>(&hit_cache.flush()).unwrap();
    assert_eq!(
        hit_flush,
        json!({
            "authenticationFailures": 0,
            "hits": 1,
            "ioFailures": 0,
            "misses": 0,
            "reads": 1,
            "rejectedWrites": 0,
            "sealed": true,
            "writes": 0
        })
    );
    write_json(evidence_root, "raw/positive-hit-flush.json", &hit_flush);
    drop(hit_engine);
    drop(hit_cache);
    fs::remove_dir_all(cache_root).unwrap();
}

// W2.C-CURRENT-PROFILE-CONFORMANCE-01: sampled glTF cannot certify the
// complete-material proof. Both polarities refuse without calling geometry;
// ancillary cache state must not change that result.
#[test]
fn sampled_proof_refuses_both_polarities_without_geometry() {
    let root = evidence_root();
    let root = root.as_deref();
    let allowance = |maximum: f64, reason: &str| {
        json!({
            "allowances": [{"left": "A#0", "right": "B#0", "maxVolume": maximum, "reason": reason}]
        })
    };
    let controls = [
        ("unallowed", json!({}), "This selected component pair has no bounded complete-material noninterference certificate."),
        ("allowed", allowance(0.5, "intentional overlap"), "Interference requires complete source-associated BRep materials."),
        ("limited", allowance(0.25, "limited overlap"), "Interference requires complete source-associated BRep materials."),
        ("reason", allowance(0.5, "different authored reason"), "Interference requires complete source-associated BRep materials."),
    ];
    for (name, expected, message) in controls {
        for polarity in ["positive", "negative"] {
            let (mut cold_engine, cold_counts) = counted_engine();
            let subject = ingest(&mut cold_engine, primary(), cube_buffer());
            let request = request(
                &subject,
                "toHaveNoComponentInterference",
                json!({"kind": "componentInterference", "expected": expected}),
                polarity,
                180,
                name,
            );
            let cold = evaluate(
                &mut cold_engine,
                &cold_counts,
                root,
                &format!("projection-{name}-{polarity}-cold"),
                &request,
            );
            assert_eq!(cold_counts.get(), Counts::default(), "no geometry calls");
            let result: Value = serde_json::from_slice(&cold.1).unwrap();
            assert_eq!(
                result,
                json!({
                    "numericProfile": "geospec-st-logical-requests-v3",
                    "results": [{"claimId": name, "status": "refused", "diagnostics": [{
                        "code": if name == "unallowed" { "GEOSPEC_EVIDENCE_UNSUPPORTED" } else { "GEOSPEC_UNSUPPORTED_EVIDENCE" }, "severity": "error", "message": message
                    }]}]
                })
            );
            let (mut warm_engine, warm_counts) = counted_engine();
            assert_eq!(ingest(&mut warm_engine, primary(), cube_buffer()), subject);
            let seed = evaluate(
                &mut warm_engine,
                &warm_counts,
                root,
                &format!("projection-{name}-{polarity}-seed"),
                &query(&subject, json!({}), 180),
            );
            query_volume(&seed.1);
            let before = warm_counts.get();
            let warm = evaluate(
                &mut warm_engine,
                &warm_counts,
                root,
                &format!("projection-{name}-{polarity}-warm"),
                &request,
            );
            assert_eq!(warm, cold, "complete cold/warm proof plan and result");
            assert_eq!(warm_counts.get(), before, "proof adds zero geometry calls");
            let resumed = evaluate(
                &mut warm_engine,
                &warm_counts,
                root,
                &format!("projection-{name}-{polarity}-back-to-query"),
                &query(&subject, json!({}), 180),
            );
            assert_eq!(resumed, seed, "proof refusal preserves ancillary cache");
            assert_eq!(warm_counts.get(), before);
        }
    }
}

#[test]
fn overlap_keys_reuse_and_invalidate_only_the_declared_inputs() {
    let root = evidence_root();
    let root = root.as_deref();
    let (mut engine, counts) = counted_engine();
    let subject = ingest(&mut engine, primary(), cube_buffer());
    let seed = evaluate(
        &mut engine,
        &counts,
        root,
        "key-seed",
        &query(&subject, json!({}), 180),
    );
    query_volume(&seed.1);
    assert_computations(counts.get(), 1);
    key_controls(root, &mut engine, &counts, &subject, &seed.1);
}

#[test]
fn overlap_logical_budgets_preserve_cold_warm_179_180_boundary() {
    let root = evidence_root();
    budget_controls(root.as_deref());
}

fn key_controls(
    root: Option<&Path>,
    engine: &mut Engine,
    counts: &Cell<Counts>,
    subject: &str,
    baseline: &[u8],
) {
    let selected = json!({"pairs": [{"left": "A#0", "right": "B#0"}]});
    let controls = [
        ("explicit-default", json!({"tolerance": 0.001}), 1),
        ("tolerance", json!({"tolerance": 0.002}), 2),
        ("tolerance-return", json!({}), 3),
        ("selected", selected, 4),
        // Pattern direction normalizes to the same ordered component pair.
        (
            "selected-reversed-pattern",
            json!({"pairs": [{"left": "B#0", "right": "A#0"}]}),
            4,
        ),
        ("empty-selection", json!({"pairs": []}), 4),
        ("none-selection-return", json!({}), 5),
    ];
    for (name, payload, computations) in controls {
        let request = query(subject, payload, 180);
        let cold = evaluate(engine, counts, root, &format!("key-{name}-first"), &request);
        let warm = evaluate(
            engine,
            counts,
            root,
            &format!("key-{name}-repeat"),
            &request,
        );
        assert_eq!(cold, warm);
        assert_computations(counts.get(), computations);
        let result: Value = serde_json::from_slice(&cold.1).unwrap();
        let evidence = &result["results"][0]["evidence"]["evidence"];
        if name == "empty-selection" {
            assert_eq!(result["results"][0]["status"], "passed");
            assert_eq!(evidence["selectedPairs"], json!([]));
            assert_eq!(evidence["checkedPairs"], 0);
            assert_eq!(evidence["overlaps"], json!([]));
        } else {
            query_volume(&cold.1);
        }
        if name.starts_with("selected") {
            assert_eq!(
                evidence["selectedPairs"],
                json!([{"leftLabel": "A#0", "rightLabel": "B#0"}])
            );
        }
        if matches!(
            name,
            "explicit-default" | "tolerance-return" | "none-selection-return"
        ) {
            assert_eq!(cold.1, baseline);
        }
        assert_eq!(
            evidence["tolerance"],
            if name == "tolerance" { 0.002 } else { 0.001 }
        );
    }
}

fn budget_controls(root: Option<&Path>) {
    // Authored input: outer V16+3*T24=88, each source 1+V8+3*T12=45.
    // Original request order [88,45,45,1,1], cumulative [88,133,178,179,180].
    const LIMITS: [u64; 11] = [87, 88, 89, 132, 133, 134, 177, 178, 179, 180, 181];
    let (mut warm_engine, warm_counts) = counted_engine();
    let subject = ingest(&mut warm_engine, primary(), cube_buffer());
    let seed = evaluate(
        &mut warm_engine,
        &warm_counts,
        root,
        "budget-seed",
        &query(&subject, json!({}), 180),
    );
    query_volume(&seed.1);
    for limit in LIMITS {
        let request = query(&subject, json!({}), limit);
        let warm = evaluate(
            &mut warm_engine,
            &warm_counts,
            root,
            &format!("budget-{limit}-warm"),
            &request,
        );
        assert_computations(warm_counts.get(), 1);
        let (mut cold_engine, cold_counts) = counted_engine();
        assert_eq!(ingest(&mut cold_engine, primary(), cube_buffer()), subject);
        let cold = evaluate(
            &mut cold_engine,
            &cold_counts,
            root,
            &format!("budget-{limit}-cold"),
            &request,
        );
        assert_eq!(cold, warm, "entire budget outcome at {limit}");
        let admissions = if limit < 133 {
            0
        } else if limit < 178 {
            1
        } else {
            2
        };
        let booleans = usize::from(limit >= 179);
        let properties = usize::from(limit >= 180);
        assert_eq!(
            cold_counts.get(),
            Counts {
                calls: admissions + 2 * booleans + properties,
                admissions,
                booleans,
                properties,
                created: admissions + booleans,
                released: booleans,
                live: admissions,
                peak: admissions + booleans,
            }
        );
        let result: Value = serde_json::from_slice(&cold.1).unwrap();
        if limit < 180 {
            let row = &result["results"][0];
            assert_eq!(row["status"], "refused");
            assert!(row.get("evidence").is_none());
            assert_eq!(row["diagnostics"][0]["code"], "MATCHER_TIMEOUT");
            let used = [88, 133, 178, 179, 180]
                .into_iter()
                .find(|used| *used > limit)
                .unwrap();
            assert_eq!(
                row["diagnostics"][0]["details"],
                json!({
                    "matcher": "analyzeMeshOverlap", "budget": limit, "unitsUsed": used, "unit": "work-units"
                })
            );
        } else {
            query_volume(&cold.1);
        }
    }
}
