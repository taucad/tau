use geospec_engine_native_occt::{BrepEntity, BrepSubject, Document, SurfaceFacts};
use std::path::PathBuf;

use geospec_engine_native_core::{
    backend::{csg::*, BackendError, TriangleMesh},
    Engine, EngineConfig,
};
use geospec_engine_native_occt::OcctConnector;
use serde_json::Value;

mod support;
use support::current_profile::{bind_claim, bind_ingest};

const QUALIFIED: &str = include_str!("fixtures/current-profile-01/qualified-results.json");
const CURRENT_NUMERIC_PROFILE: &str =
    include_str!("../../../../rust/tests/fixtures/current-profile-v6/numeric-profile.txt").trim_ascii_end();

fn qualified_record(index: usize) -> Value {
    let fixture: Value = serde_json::from_str(QUALIFIED).unwrap();
    assert_eq!(
        fixture["authority"]["adoptedRuling"],
        "W2.C-CURRENT-PROFILE-CONFORMANCE-01"
    );
    fixture["records"]
        .as_array()
        .unwrap()
        .iter()
        .find(|record| record["id"] == format!("selected-bore-void/{index}"))
        .unwrap()
        .clone()
}

fn claim_result(json: &str) -> Value {
    let value: Value = serde_json::from_str(json).unwrap();
    let results = value["result"]["results"].as_array().unwrap();
    assert_eq!(results.len(), 1, "Expected one claim result: {value}");
    results[0].clone()
}

fn assert_refused(json: &str, code: &str) {
    let claim = claim_result(json);
    assert_eq!(claim["status"], "refused", "{json}");
    assert!(
        claim["diagnostics"]
            .as_array()
            .unwrap()
            .iter()
            .any(|d| d["code"] == code),
        "{json}"
    );
}

// The nominal proof must never silently route to tessellated CSG/winding.
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

#[test]
fn selected_bore_void_original_four_requests_and_budget_refusal() {
    for i in 0..4 {
        let mut engine = Engine::with_backends(
            EngineConfig::entry(),
            Box::new(OcctConnector),
            Box::new(NoCsg),
        );
        let bytes = std::fs::read(input().join("guide.step")).unwrap();
        let frozen_ingest = std::fs::read(input().join(format!("{i}.ingest.json"))).unwrap();
        let admission = engine
            .ingest_subject(&bind_ingest(&frozen_ingest), &bytes, vec![])
            .unwrap();
        eprintln!(
            "BORE_VOID_ADMISSION {i} {}",
            String::from_utf8_lossy(&admission)
        );
        let frozen_request =
            std::fs::read_to_string(input().join(format!("{i}.request.json"))).unwrap();
        let bound = bind_claim(&frozen_request, &admission);
        eprintln!(
            "BORE_VOID_SUBJECT_BINDING {i} original={} effective={}",
            bound.original_subject_hash, bound.effective_subject_hash
        );
        let request = bound.json;
        let declared = qualified_record(i);
        assert_eq!(
            declared["originalRequestPath"],
            format!("native/occt/rust/tests/fixtures/nominal-bore-void/{i}.request.json")
        );
        assert_eq!(
            request,
            declared["effectiveRequestUtf8"].as_str().unwrap(),
            "derived request must match the predeclared registry/subject-only binding"
        );
        assert_eq!(
            bound.effective_subject_hash,
            declared["effectiveSubjectHash"]
        );
        let submitted: Value = serde_json::from_str(&request).unwrap();
        let claims = submitted["plan"]["claims"].as_array().unwrap();
        assert_eq!(claims.len(), 1);
        let polarity = claims[0]["polarity"].as_str().unwrap();
        assert!(matches!(polarity, "positive" | "negative"));
        let negative = polarity == "negative";
        let result =
            String::from_utf8(engine.process_request(request.as_bytes()).unwrap()).unwrap();
        eprintln!("BORE_VOID_ORIGINAL {i} {result}");
        // Keep the frozen snapshot; project only its serialized numeric profile.
        let expected = declared["expectedResponseUtf8"].as_str().unwrap().replace(
            "\"numericProfile\":\"geospec-st-logical-requests-v3\"",
            &format!("\"numericProfile\":\"{CURRENT_NUMERIC_PROFILE}\""),
        );
        assert_eq!(
            result, expected,
            "complete candidate-derived regression snapshot; independent semantic review is separate"
        );
        let claim = claim_result(&result);
        assert_eq!(claim["claimId"], claims[0]["claimId"]);
        assert_eq!(
            claim["status"],
            if negative { "failed" } else { "passed" },
            "{result}"
        );
        let measured = &claim["evidence"]["measured"];
        assert_eq!(measured["globalMinimumClaimed"], false);
        assert_eq!(measured["scope"], "complete-single-selected-material-solid");
        assert_eq!(
            measured["uniformSectionAreaLowerBound"]["construction"],
            "axis-centered-inscribed-square-side-radius"
        );
        // Separate controls; original request files/bytes remain untouched.
        for (kind, mutated, code) in [
            (
                "budget",
                request.replace("\"workUnitBudget\":8000000", "\"workUnitBudget\":1"),
                "MATCHER_TIMEOUT",
            ),
            (
                "material",
                request.replace("\"material\":[\"guide\"]", "\"material\":[\"valve\"]"),
                "GEOSPEC_VOID_CONTINUITY_UNSUPPORTED",
            ),
        ] {
            assert_ne!(mutated, request);
            let result =
                String::from_utf8(engine.process_request(mutated.as_bytes()).unwrap()).unwrap();
            eprintln!("BORE_VOID_CONTROL {i} {kind} {result}");
            assert_refused(&result, code);
        }
        if claims[0]["payload"]["expected"]["minCrossSection"] == 1 {
            let high = request.replace("\"minCrossSection\":1", "\"minCrossSection\":100");
            let result =
                String::from_utf8(engine.process_request(high.as_bytes()).unwrap()).unwrap();
            eprintln!("BORE_VOID_CONTROL {i} high {result}");
            assert_refused(&result, "GEOSPEC_VOID_CONTINUITY_UNSUPPORTED");
        }
    }
}

fn input() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/nominal-bore-void")
}

#[test]
fn selected_bore_void_actual_guide_and_wrong_face() {
    let document =
        Document::from_step(&std::fs::read(input().join("guide.step")).unwrap()).unwrap();
    let occurrences = document.source_occurrence_structure().unwrap();
    let occurrence_faces = document.reported_faces(false).unwrap().occurrence_faces;
    let occurrence = occurrences.iter().position(|o| o.path == "guide").unwrap() as u32;
    let faces = &occurrence_faces[occurrence as usize];
    let face = faces
        .iter()
        .find(|f| f.reversed && matches!(f.facts.surface, SurfaceFacts::Cylinder { .. }))
        .unwrap();
    let bore = document.selected_bore_void(face.entity).unwrap();
    eprintln!("SELECTED_BORE_VOID {bore:#?}");
    assert_eq!(bore.band.occurrence, occurrence);
    assert_eq!(bore.band.radius, 4.03);
    assert_eq!([bore.band.from, bore.band.to], [0.0, 45.0]);
    assert!(document
        .selected_bore_void(BrepEntity::WholeFace(1))
        .is_err());
    let valve = occurrences.iter().position(|o| o.path == "valve").unwrap();
    for face in occurrence_faces[valve].iter() {
        assert!(document.selected_bore_void(face.entity).is_err());
    }
    for face in faces
        .iter()
        .filter(|f| !matches!(f.facts.surface, SurfaceFacts::Cylinder { .. }))
    {
        assert!(document.selected_bore_void(face.entity).is_err());
    }
}

#[test]
fn selected_bore_void_rejects_obstruction_and_extra_selected_solid() {
    for name in ["obstructed.step", "extra-solid.step"] {
        let document = Document::from_step(&std::fs::read(input().join(name)).unwrap()).unwrap();
        let occurrence_faces = document.reported_faces(false).unwrap().occurrence_faces;
        assert_eq!(
            occurrence_faces.len(),
            1,
            "{name}: one selected material scope"
        );
        let faces = &occurrence_faces[0];
        let cylinders: Vec<_> = faces
            .iter()
            .filter(|f| f.reversed && matches!(f.facts.surface, SurfaceFacts::Cylinder { .. }))
            .collect();
        assert!(!cylinders.is_empty());
        for face in cylinders {
            let result = document.selected_bore_void(face.entity);
            eprintln!("SELECTED_BORE_VOID_NEGATIVE {name} {result:?}");
            assert!(
                result.is_err(),
                "{name} must not qualify the local owner alone"
            );
        }
    }
}
