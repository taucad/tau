use geospec_engine_native_core::backend::pmi::PmiFieldStatus;
use geospec_engine_native_core::backend::{csg::*, BackendError, TriangleMesh};
use geospec_engine_native_core::{Engine, EngineConfig};
use geospec_engine_native_occt::OcctConnector;
use geospec_engine_native_occt::{BrepSubject, Document};
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

fn inventory_claim(envelope: &Value) -> &Value {
    assert_eq!(envelope["requestId"], "pmi-query");
    assert_eq!(
        envelope["result"]["numericProfile"],
        include_str!("../../../../rust/tests/fixtures/current-profile-v6/numeric-profile.txt").trim_ascii_end()
    );
    let claims = envelope["result"]["results"]
        .as_array()
        .expect("claim results array");
    assert_eq!(claims.len(), 1);
    let selected = claims
        .iter()
        .filter(|claim| claim["claimId"] == "inventory")
        .collect::<Vec<_>>();
    assert_eq!(selected.len(), 1, "exactly the requested inventory claim");
    selected[0]
}

fn assert_refusal(claim: &Value, code: &str) -> Value {
    assert_eq!(claim["status"], "refused");
    assert!(
        claim.get("evidence").is_none(),
        "refusal must not carry a successful inventory"
    );
    let diagnostics = claim["diagnostics"]
        .as_array()
        .expect("structured diagnostics");
    assert_eq!(diagnostics.len(), 1);
    assert_eq!(diagnostics[0]["code"], code);
    assert_eq!(diagnostics[0]["severity"], "error");
    diagnostics[0].clone()
}

#[test]
fn pmi_inventory_actual_query_cold_warm_budget_polarity_and_output_refusal() {
    let source = include_bytes!("fixtures/parallel-plane-distance-source.step");
    let mut engine = Engine::with_backends(
        EngineConfig::entry(),
        Box::new(OcctConnector),
        Box::new(NoCsg),
    );
    let ingest = serde_json::to_vec(&json!({
        "method": "ingestSubject", "requestId": "pmi", "protocolVersion": 3,
        "registryVersion": 5, "canonicalProfile": "geospec-jcs-v1", "format": "step",
        "frame": {"coordinateSystem": "z-up", "sourceUnit": "auto", "outputUnit": "mm"},
        "ingestOptions": {}, "primaryByteLength": source.len(), "resources": []
    }))
    .unwrap();
    let admission: Value =
        serde_json::from_slice(&engine.ingest_subject(&ingest, source, vec![]).unwrap()).unwrap();
    assert_eq!(admission["requestId"], "pmi");
    let subject = &admission["result"]["subject"];
    assert_eq!(subject["format"], "step");
    let hash = subject["subjectHash"]
        .as_str()
        .expect("semantic subject hash");
    assert_eq!(hash.len(), 64);
    assert!(hash
        .bytes()
        .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase()));
    let request = json!({
        "method": "submitClaims", "requestId": "pmi-query", "protocolVersion": 3,
        "registryVersion": 5, "canonicalProfile": "geospec-jcs-v1",
        "plan": {"subjects": [{"slot": "part", "subjectHash": hash}], "claims": [{
            "claimId": "inventory", "capability": "queryPmi", "subjectSlots": ["part"],
            "payload": null, "polarity": "positive", "workUnitBudget": 8000000
        }]}
    });
    let request_bytes = serde_json::to_vec(&request).unwrap();
    let first = engine.process_request(&request_bytes).unwrap();
    let second = engine.process_request(&request_bytes).unwrap();
    assert_eq!(first, second, "cold/warm exact canonical equality");
    let envelope: Value = serde_json::from_slice(&first).unwrap();
    let claim = inventory_claim(&envelope);
    assert_eq!(claim["status"], "passed");
    assert_eq!(claim["diagnostics"], json!([]));
    let evidence = &claim["evidence"];
    assert_eq!(evidence["subjectHash"], hash);
    assert_eq!(evidence["provenance"], subject["descriptor"]);
    let inventory = &evidence["inventory"];
    assert_eq!(inventory["contract"], "geospec.pmi.inventory/v1");
    assert_eq!(inventory["status"], "semantic");
    assert_eq!(inventory["editionValidation"], "not-validated");
    let records = inventory["records"]
        .as_array()
        .expect("source record array");
    assert_eq!(
        records.len(),
        1,
        "unchanged Tau fixture has one dimensional record"
    );
    let selected = records
        .iter()
        .filter(|record| record["sourceId"] == 710)
        .collect::<Vec<_>>();
    assert_eq!(selected.len(), 1);
    let record = selected[0];
    assert_eq!(record["kind"], "DIMENSIONAL_LOCATION");
    assert_eq!(record["family"], "dimension");
    assert_eq!(record["channel"], "semantic");
    // Frozen independent Part21/Fraction/forward-transfer authority, not
    // candidate output: role600 maps to occurrence0, role620 to occurrence2.
    for (role, aspect, usage, route, occurrence) in
        [("first", 700, 701, 600, 0), ("second", 702, 703, 620, 2)]
    {
        assert_eq!(
            record[role],
            json!([{
                "sourceAspectId": aspect, "sourceUsageIds": [usage], "sourceItemIds": [1110],
                "requestedRoute": {"status": "supported", "value": [route], "reason": null},
                "associations": {"status": "supported", "reason": null, "value": [{
                    "sourceFaceId": 1110, "occurrenceRoute": [route], "occurrence": occurrence,
                    "publicFaceOrdinal": 1
                }]}
            }])
        );
    }
    assert_eq!(
        record["limits"],
        json!({"status": "supported", "reason": null, "value": {
            "basis": "authored-limits", "lowerMillimetres": "19/2", "upperMillimetres": "21/2"
        }})
    );
    assert_eq!(record["numbers"]["status"], "supported");
    assert_eq!(record["numbers"]["reason"], Value::Null);
    let numbers = record["numbers"]["value"].as_array().unwrap();
    assert_eq!(numbers.len(), 2);
    for (number, (id, text, value)) in numbers
        .iter()
        .zip([(713, "0.95", "19/2"), (714, "1.05", "21/2")])
    {
        assert_eq!(number["sourceId"], id);
        assert_eq!(number["authoredText"], text);
        assert_eq!(number["unitId"], 405);
        assert_eq!(number["millimetres"], value);
    }
    for (budget, status) in [
        (source.len() as u64, "refused"),
        (source.len() as u64 + 2, "refused"),
        (source.len() as u64 + 3, "passed"),
    ] {
        let mut bounded_request = request.clone();
        bounded_request["plan"]["claims"][0]["workUnitBudget"] = json!(budget);
        let result: Value = serde_json::from_slice(
            &engine
                .process_request(&serde_json::to_vec(&bounded_request).unwrap())
                .unwrap(),
        )
        .unwrap();
        let bounded_claim = inventory_claim(&result);
        assert_eq!(bounded_claim["status"], status);
        if status == "refused" {
            let diagnostic = assert_refusal(bounded_claim, "MATCHER_TIMEOUT");
            assert_eq!(
                diagnostic["details"],
                json!({
                    "matcher": "queryPmi", "budget": budget, "unitsUsed": budget + 1, "unit": "work-units"
                })
            );
        } else {
            assert_eq!(
                bounded_claim, claim,
                "exact-boundary budget preserves complete inventory"
            );
        }
    }
    let mut negative = request.clone();
    negative["plan"]["claims"][0]["polarity"] = json!("negative");
    let error = engine
        .process_request(&serde_json::to_vec(&negative).unwrap())
        .unwrap_err();
    assert_eq!(error.code(), "invalid-claim");
    assert_eq!(
        error.to_string(),
        "Ancillary capability 'queryPmi' requires positive polarity."
    );
    let mut malformed = request.clone();
    malformed["plan"]["claims"][0]["payload"] = json!({"unknown": 1});
    let error = engine
        .process_request(&serde_json::to_vec(&malformed).unwrap())
        .unwrap_err();
    // PreparedPlan converts payload validation errors to the claim boundary.
    assert_eq!(error.code(), "invalid-claim");
    assert_eq!(
        error.to_string(),
        "GeoSpec queryPmi payload contains unknown field 'unknown'."
    );
    let mut limited_request = request.clone();
    limited_request["plan"]["claims"][0]["payload"] = json!({"maxOutputBytes": 1});
    let limited: Value = serde_json::from_slice(
        &engine
            .process_request(&serde_json::to_vec(&limited_request).unwrap())
            .unwrap(),
    )
    .unwrap();
    assert_refusal(inventory_claim(&limited), "GEOSPEC_RESOURCE_LIMIT");
    let handle_request = serde_json::to_vec(&json!({
        "method": "subjectHandle", "requestId": "handle-pmi", "protocolVersion": 3,
        "registryVersion": 5, "canonicalProfile": "geospec-jcs-v1", "subjectHash": hash
    }))
    .unwrap();
    let handle_response: Value =
        serde_json::from_slice(&engine.subject_handle(&handle_request).unwrap()).unwrap();
    assert_eq!(handle_response["requestId"], "handle-pmi");
    let handle = &handle_response["result"]["subjectHandle"];
    assert_eq!(handle["subjectHash"], hash);
    assert_eq!(handle.as_object().unwrap().len(), 3);
    let owner = handle["owner"].as_str().unwrap().parse::<u64>().unwrap();
    let generation = handle["generation"]
        .as_str()
        .unwrap()
        .parse::<u64>()
        .unwrap();
    assert!(owner > 0 && generation > 0);
    let release = serde_json::to_vec(&json!({
        "method": "releaseSubject", "requestId": "release-pmi", "protocolVersion": 3,
        "registryVersion": 5, "canonicalProfile": "geospec-jcs-v1", "subjectHandle": handle
    }))
    .unwrap();
    let released: Value =
        serde_json::from_slice(&engine.release_subject(&release).unwrap()).unwrap();
    assert_eq!(
        released,
        json!({"requestId": "release-pmi", "result": {"released": true}})
    );
    let error = engine.process_request(&request_bytes).unwrap_err();
    assert_eq!(error.code(), "invalid-claim");
    assert_eq!(
        error.to_string(),
        "Subject for slot 'part' must first be ingested into this Engine."
    );
    let readmission: Value =
        serde_json::from_slice(&engine.ingest_subject(&ingest, source, vec![]).unwrap()).unwrap();
    assert_eq!(readmission, admission);
    let renewed: Value =
        serde_json::from_slice(&engine.subject_handle(&handle_request).unwrap()).unwrap();
    assert_eq!(renewed["requestId"], "handle-pmi");
    let renewed_handle = &renewed["result"]["subjectHandle"];
    assert_eq!(renewed_handle["owner"], handle["owner"]);
    assert_eq!(renewed_handle["subjectHash"], hash);
    assert!(
        renewed_handle["generation"]
            .as_str()
            .unwrap()
            .parse::<u64>()
            .unwrap()
            > generation
    );
    assert_eq!(engine.process_request(&request_bytes).unwrap(), first);
}

#[test]
fn pmi_inventory_forward_transfer_preserves_same_source_distinct_occurrences() {
    let source = include_bytes!("fixtures/parallel-plane-distance-source.step");
    let document = Document::from_step(source).unwrap();
    let inventory = document.pmi_source_faces(1110).unwrap();
    assert_eq!(inventory.status, PmiFieldStatus::Supported);
    let values = inventory.value.unwrap();
    assert_eq!(values.len(), 2);
    assert_eq!(values[0].occurrence_route, [600]);
    assert_eq!(values[1].occurrence_route, [620]);
    assert_eq!(values[0].occurrence, Some(0));
    // Pre-existing independent forward-transfer mapping: route620 is index2;
    // intervening assembly occurrence1 is not another selected source face.
    assert_eq!(values[1].occurrence, Some(2));
    assert_eq!(values[0].public_face_ordinal, 1);
    assert_eq!(values[1].public_face_ordinal, 1);
    assert_eq!(
        document.pmi_source_faces(999999).unwrap().status,
        PmiFieldStatus::Missing
    );
    assert!(document.pmi_source_faces(0).is_err());
}

#[test]
fn pmi_inventory_same_occurrence_distinct_faces_and_role_groups() {
    let document = Document::from_step(include_bytes!(
        "fixtures/parallel-plane-distance-same-occurrence-source.step"
    ))
    .unwrap();
    let first = document.pmi_source_faces(1100).unwrap().value.unwrap();
    let second = document.pmi_source_faces(1110).unwrap().value.unwrap();
    assert_eq!(first[0].occurrence, second[0].occurrence);
    assert_ne!(first[0].public_face_ordinal, second[0].public_face_ordinal);
}
