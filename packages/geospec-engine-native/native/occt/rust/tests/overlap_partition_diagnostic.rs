//! STEP overlap (S10, INTERFERENCE-EXACT-01) is the exact Common of each
//! candidate pair of leaf occurrences: no tessellation and no CSG connector.
//! Its partition count comes from structure (C3), never from a report mesh.

use geospec_engine_native_core::backend::{csg::*, BackendError, TriangleMesh};
use geospec_engine_native_core::{Engine, EngineConfig};
use geospec_engine_native_occt::{BrepSubject, Document, OcctConnector};
use serde_json::{json, Value};

struct NoCsg;
impl CsgConnector for NoCsg {
    fn release(&mut self, _: SolidId) -> Result<(), BackendError> {
        panic!("unexpected CSG")
    }
    fn admit(&mut self, _: &TriangleMesh, _: &[[u32; 2]]) -> Result<SolidId, BackendError> {
        panic!("unexpected CSG")
    }
    fn boolean(&mut self, _: BooleanOp, _: &[SolidId]) -> Result<SolidId, BackendError> {
        panic!("unexpected CSG")
    }
    fn transform(&mut self, _: SolidId, _: [f64; 12]) -> Result<SolidId, BackendError> {
        panic!("unexpected CSG")
    }
    fn decompose(&mut self, _: SolidId) -> Result<Vec<SolidId>, BackendError> {
        panic!("unexpected CSG")
    }
    fn properties(&self, _: SolidId) -> Result<SolidProperties, BackendError> {
        panic!("unexpected CSG")
    }
    fn export(&self, _: SolidId) -> Result<MeshExport, BackendError> {
        panic!("unexpected CSG")
    }
    fn slice(&self, _: SolidId, _: f64) -> Result<Section, BackendError> {
        panic!("unexpected CSG")
    }
    fn section(&self, _: &[Vec<[f64; 2]>], _: FillRule) -> Result<Section, BackendError> {
        panic!("unexpected CSG")
    }
    fn section_boolean(
        &self,
        _: SectionOp,
        _: &Section,
        _: &Section,
    ) -> Result<Section, BackendError> {
        panic!("unexpected CSG")
    }
}

const BUDGET: u64 = 8_000_000;

fn engine() -> Engine {
    Engine::with_backends(
        EngineConfig::entry(),
        Box::new(OcctConnector),
        Box::new(NoCsg),
    )
}

fn ingest(engine: &mut Engine, source: &[u8]) -> Value {
    let ingest = serde_json::to_vec(&json!({
        "method": "ingestSubject", "requestId": "subject", "protocolVersion": 3,
        "registryVersion": 5, "canonicalProfile": "geospec-jcs-v1", "format": "step",
        "frame": {"coordinateSystem": "z-up", "sourceUnit": "auto", "outputUnit": "mm"},
        "ingestOptions": {}, "primaryByteLength": source.len(), "resources": []
    }))
    .unwrap();
    let admission: Value =
        serde_json::from_slice(&engine.ingest_subject(&ingest, source, vec![]).unwrap()).unwrap();
    admission["result"]["subject"]["subjectHash"].clone()
}

fn overlap(engine: &mut Engine, subject: &Value, budget: u64) -> Value {
    let request = serde_json::to_vec(&json!({
        "method": "submitClaims", "requestId": "overlap", "protocolVersion": 3,
        "registryVersion": 5, "canonicalProfile": "geospec-jcs-v1",
        "plan": {"subjects": [{"slot": "part", "subjectHash": subject}], "claims": [{
            "claimId": "overlap", "capability": "analyzeMeshOverlap", "subjectSlots": ["part"],
            "payload": {"tolerance": 0.001}, "polarity": "positive", "workUnitBudget": budget
        }]}
    }))
    .unwrap();
    let response: Value =
        serde_json::from_slice(&engine.process_request(&request).unwrap()).unwrap();
    response["result"]["results"][0].clone()
}

/// The two-cube assembly with cube B placed at `x` (30 in the fixture). `open`
/// drops one of cube B's faces; `nested` makes the assembly the only child of
/// a `top` product, so its occurrence is a parent (C2: structure only).
fn two_cubes(x: f64, open: bool, nested: bool) -> Vec<u8> {
    let mut text = String::from_utf8(include_bytes!("fixtures/two-cube-assembly.step").to_vec())
        .unwrap()
        .replace(
            "#615=CARTESIAN_POINT('',(30.,0.,0.));",
            &format!("#615=CARTESIAN_POINT('',({x:?},0.,0.));"),
        );
    if open {
        text = text.replace(
            "(#2100,#2110,#2120,#2130,#2140,#2150)",
            "(#2100,#2110,#2120,#2130,#2140)",
        );
    }
    if nested {
        let end = text.rfind("ENDSEC;").unwrap();
        text.insert_str(
            end,
            "#800=PRODUCT('top','top','',(#3));\n\
             #801=PRODUCT_DEFINITION_FORMATION('','',#800);\n\
             #802=PRODUCT_DEFINITION('','',#801,#6);\n\
             #803=PRODUCT_DEFINITION_SHAPE('','',#802);\n\
             #804=SHAPE_DEFINITION_REPRESENTATION(#803,#805);\n\
             #805=SHAPE_REPRESENTATION('top',(#806),#400);\n\
             #806=AXIS2_PLACEMENT_3D('',#507,#508,#509);\n\
             #810=NEXT_ASSEMBLY_USAGE_OCCURRENCE('NAUO3','sub','sub',#802,#502,'');\n\
             #811=PRODUCT_DEFINITION_SHAPE('Placement','Placement of sub',#810);\n\
             #812=CONTEXT_DEPENDENT_SHAPE_REPRESENTATION(#813,#811);\n\
             #813=(REPRESENTATION_RELATIONSHIP('','',#505,#805) \
             REPRESENTATION_RELATIONSHIP_WITH_TRANSFORMATION(#814) SHAPE_REPRESENTATION_RELATIONSHIP());\n\
             #814=ITEM_DEFINED_TRANSFORMATION('','',#506,#806);\n",
        );
    }
    text.into_bytes()
}

#[test]
fn one_occurrence_overlap_reports_one_structural_component() {
    let mut engine = engine();
    let subject = ingest(&mut engine, include_bytes!("fixtures/ap242-box.step"));
    let claim = overlap(&mut engine, &subject, BUDGET);
    assert_eq!(claim["status"], "failed", "{claim}");
    assert_eq!(
        claim["diagnostics"][0]["code"],
        "GEOSPEC_COMPONENT_PARTITION_INCONCLUSIVE"
    );
    assert_eq!(
        claim["diagnostics"][0]["details"],
        json!({"primitiveCount": 1})
    );
}

#[test]
fn a_nested_parent_is_structure_and_its_leaves_own_every_face() {
    let document = Document::from_step(&two_cubes(5.0, false, true)).unwrap();
    let occurrences = BrepSubject::source_occurrences(&document).unwrap();
    assert_eq!(
        occurrences
            .iter()
            .map(|row| (row.parent, row.face_count))
            .collect::<Vec<_>>(),
        [(None, 0), (Some(0), 6), (Some(0), 6)]
    );
    // O1-8: the leaf face uses are the whole public faces, with no duplicates.
    assert_eq!(BrepSubject::faces(&document).unwrap().len(), 12);
}

#[test]
fn step_overlap_is_the_exact_common_of_leaf_pairs() {
    let mut engine = engine();
    // Cube B at x = 5 overlaps cube A in [0, 5] x [-5, 5] x [-5, 5]: 500 mm^3.
    for nested in [false, true] {
        let subject = ingest(&mut engine, &two_cubes(5.0, false, nested));
        let claim = overlap(&mut engine, &subject, BUDGET);
        assert_eq!(claim["status"], "passed", "{claim}");
        let evidence = &claim["evidence"]["evidence"];
        assert_eq!(evidence["profile"], "INTERFERENCE-EXACT-01");
        assert_eq!(evidence["componentSource"], "leaf-occurrences");
        // A nested parent is structure, not a third component (C2).
        assert_eq!(evidence["componentCount"], 2, "{evidence}");
        assert_eq!(evidence["checkedPairs"], 1);
        let overlaps = evidence["overlaps"].as_array().unwrap();
        assert_eq!(overlaps.len(), 1);
        let volume = overlaps[0]["intersectionVolume"].as_f64().unwrap();
        assert!((volume - 500.0).abs() < 1e-6, "{volume}");
        assert_eq!(overlaps[0]["penetration"], "exact-positive-residual-volume");
        assert!(overlaps[0]["leftLabel"]
            .as_str()
            .unwrap()
            .ends_with("cubeA"));
        assert!(overlaps[0]["rightLabel"]
            .as_str()
            .unwrap()
            .ends_with("cubeB"));
        let point = overlaps[0]["diagnosticPoint"].as_array().unwrap();
        assert!((point[0].as_f64().unwrap() - 2.5).abs() < 1e-6, "{point:?}");
    }
}

#[test]
fn coincident_face_contact_has_zero_exact_volume() {
    let mut engine = engine();
    let subject = ingest(&mut engine, &two_cubes(10.0, false, false));
    let claim = overlap(&mut engine, &subject, BUDGET);
    assert_eq!(claim["status"], "passed", "{claim}");
    assert_eq!(claim["evidence"]["evidence"]["checkedPairs"], 1);
    assert_eq!(claim["evidence"]["evidence"]["overlaps"], json!([]));
}

#[test]
fn an_invalid_component_refuses_only_as_a_candidate() {
    let mut engine = engine();
    let subject = ingest(&mut engine, &two_cubes(5.0, true, false));
    let claim = overlap(&mut engine, &subject, BUDGET);
    assert_eq!(claim["status"], "failed", "{claim}");
    assert_eq!(
        claim["diagnostics"][0]["code"],
        "GEOSPEC_EXACT_COMPONENT_INVALID"
    );
    assert_eq!(claim["diagnostics"][0]["details"]["label"], "cubeB");

    // Ruling 10: far from cube A, the open cube B is no candidate.
    let subject = ingest(&mut engine, &two_cubes(30.0, true, false));
    let claim = overlap(&mut engine, &subject, BUDGET);
    assert_eq!(claim["status"], "passed", "{claim}");
    assert_eq!(claim["evidence"]["evidence"]["componentCount"], 2);
    assert_eq!(claim["evidence"]["evidence"]["checkedPairs"], 0);
}

#[test]
fn pair_budget_refusal_names_the_pair_and_is_history_independent() {
    let source = two_cubes(5.0, false, false);
    let mut cold = engine();
    let subject = ingest(&mut cold, &source);
    // Too small for the pair's counted work: the refusal names the pair.
    let probe = overlap(&mut cold, &subject, 4);
    assert_eq!(probe["status"], "refused", "{probe}");
    let details = &probe["diagnostics"][0]["details"];
    assert_eq!(probe["diagnostics"][0]["code"], "MATCHER_TIMEOUT");
    assert_eq!(details["pair"]["leftLabel"], "cubeA");
    assert_eq!(details["pair"]["rightLabel"], "cubeB");
    let work = details["pairWork"].as_u64().unwrap();
    let needed = details["unitsUsed"].as_u64().unwrap();
    assert!(work > 1 && needed > work, "{details}");

    let mut cold = engine();
    let subject = ingest(&mut cold, &source);
    let refused_cold = overlap(&mut cold, &subject, needed - 1);
    assert_eq!(refused_cold["diagnostics"][0]["details"]["pairWork"], work);
    let mut cold = engine();
    let subject = ingest(&mut cold, &source);
    let passed_cold = overlap(&mut cold, &subject, needed);
    assert_eq!(passed_cold["status"], "passed", "{passed_cold}");

    // After a completed claim retains the overlap, the same budgets replay
    // the same work and give the same bytes (§16).
    let mut warm = engine();
    let subject = ingest(&mut warm, &source);
    assert_eq!(overlap(&mut warm, &subject, BUDGET)["status"], "passed");
    assert_eq!(overlap(&mut warm, &subject, needed - 1), refused_cold);
    assert_eq!(overlap(&mut warm, &subject, needed), passed_cold);
    let observations: Value = serde_json::from_slice(&warm.observations()).unwrap();
    // One build; the refused replay stops before its hit is counted.
    assert_eq!(
        observations["physical"]["overlapBuilds"], "1",
        "{observations}"
    );
    assert_eq!(observations["physical"]["overlapResidentHits"], "1");
}
