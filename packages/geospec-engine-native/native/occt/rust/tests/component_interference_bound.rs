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
    include_str!("../../../../rust/tests/fixtures/current-profile-v5/numeric-profile.txt");

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
        .find(|record| record["id"] == format!("component-interference/{index}"))
        .unwrap()
        .clone()
}

fn claim_result(json: &str) -> Value {
    let value: Value = serde_json::from_str(json).unwrap();
    let results = value["result"]["results"].as_array().unwrap();
    assert_eq!(results.len(), 1, "Expected one claim result: {value}");
    results[0].clone()
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

fn input() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/component-interference")
}
#[test]
fn component_interference_bound_actual_source_admission() {
    use geospec_engine_native_core::backend::brep::SelectedInterferenceMaterial::*;
    let document =
        Document::from_step(&std::fs::read(input().join("original.step")).unwrap()).unwrap();
    assert_eq!(document.source_occurrence_structure().unwrap().len(), 2);
    let faces = document.reported_faces(false).unwrap().occurrence_faces;
    for (occurrence, source, private, public) in [(0, 432, 7, 6), (1, 480, 1, 0)] {
        let selected = BrepEntity::Face {
            occurrence,
            face: private,
        };
        let certificate = document.selected_interference_material(selected).unwrap();
        eprintln!("COMPONENT_MATERIAL {certificate:#?}");
        let band = match certificate {
            BoreSlab(band) => {
                assert_eq!(occurrence, 0);
                band
            }
            FiniteCylinder(band) => {
                assert_eq!(occurrence, 1);
                band
            }
        };
        assert_eq!(band.source_face_entity, source);
        assert_eq!(band.public_face_ordinal, public);
        assert_eq!(band.occurrence, occurrence);
        assert_eq!([band.from, band.to], [0., 30.]);
        for face in faces[occurrence as usize].iter() {
            if face.entity != selected {
                assert!(document
                    .selected_interference_material(face.entity)
                    .is_err());
            }
        }
    }
    for face in [
        BrepEntity::WholeFace(7),
        BrepEntity::Face {
            occurrence: 0,
            face: 1,
        },
        BrepEntity::Face {
            occurrence: 5,
            face: 1,
        },
    ] {
        assert!(document.selected_interference_material(face).is_err());
    }
}
#[test]
fn component_interference_bound_original_both_polarities_no_csg() {
    for i in 0..2 {
        let mut engine = Engine::with_backends(
            EngineConfig::entry(),
            Box::new(OcctConnector),
            Box::new(NoCsg),
        );
        let frozen_ingest = std::fs::read(input().join("original.ingest.json")).unwrap();
        let source = std::fs::read(input().join("original.step")).unwrap();
        if i == 0 {
            let error = engine
                .ingest_subject(&frozen_ingest, &source, vec![])
                .unwrap_err();
            assert_eq!(error.code(), "unsupported-version");
        }
        let admission = engine
            .ingest_subject(&bind_ingest(&frozen_ingest), &source, vec![])
            .unwrap();
        eprintln!(
            "COMPONENT_ADMISSION {i} {}",
            String::from_utf8_lossy(&admission)
        );
        let frozen_request =
            std::fs::read_to_string(input().join(format!("{i}.request.json"))).unwrap();
        if i == 0 {
            let error = engine
                .process_request(frozen_request.as_bytes())
                .unwrap_err();
            assert_eq!(error.code(), "unsupported-version");
        }
        let bound = bind_claim(&frozen_request, &admission);
        eprintln!(
            "COMPONENT_SUBJECT_BINDING original={} effective={}",
            bound.original_subject_hash, bound.effective_subject_hash
        );
        let request = bound.json;
        let declared = qualified_record(i);
        assert_eq!(
            declared["originalRequestPath"],
            format!("native/occt/rust/tests/fixtures/component-interference/{i}.request.json")
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
        let result =
            String::from_utf8(engine.process_request(request.as_bytes()).unwrap()).unwrap();
        eprintln!("COMPONENT_ORIGINAL {i} {result}");
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
        assert_eq!(
            claim["status"],
            if i == 0 { "passed" } else { "failed" },
            "{result}"
        );
        let pairs = claim["evidence"]["measured"]["pairs"].as_array().unwrap();
        assert_eq!(pairs.len(), 1);
        assert_eq!(
            pairs[0]["bound"]["profile"],
            "nominal-bore-slab-material-upper-v1"
        );
        assert_eq!(pairs[0]["bound"]["lower"], 0);
        for (kind, changed) in [
            (
                "budget",
                request.replace("\"workUnitBudget\":8000000", "\"workUnitBudget\":1"),
            ),
            (
                "threshold",
                request.replace("\"maxVolume\":381", "\"maxVolume\":380.85"),
            ),
        ] {
            assert_ne!(changed, request);
            let result =
                String::from_utf8(engine.process_request(changed.as_bytes()).unwrap()).unwrap();
            eprintln!("COMPONENT_CONTROL {i} {kind} {result}");
            let claim = claim_result(&result);
            assert_eq!(claim["status"], "refused", "{result}");
            if kind == "budget" {
                assert!(
                    claim["diagnostics"]
                        .as_array()
                        .unwrap()
                        .iter()
                        .any(|d| d["code"] == "MATCHER_TIMEOUT"),
                    "{result}"
                );
            }
        }
    }
}
#[test]
fn component_interference_bound_rejects_incomplete_material_controls() {
    for name in [
        "obstructed.step",
        "extra-solid.step",
        "extra-height.step",
        "missing-cap.step",
        "broken-shell.step",
    ] {
        let document = Document::from_step(&std::fs::read(input().join(name)).unwrap()).unwrap();
        let mut tested = 0;
        for faces in document.reported_faces(false).unwrap().occurrence_faces {
            for face in faces.iter() {
                if !matches!(face.facts.surface, SurfaceFacts::Cylinder { .. }) {
                    continue;
                }
                tested += 1;
                let result = document.selected_interference_material(face.entity);
                eprintln!("COMPONENT_MATERIAL_CONTROL {name} {result:?}");
                assert!(result.is_err(), "{name} accepted");
            }
        }
        assert!(
            tested > 0,
            "{name} must actually select cylinder candidates"
        );
    }
    assert!(Document::from_step(b"ISO-10303-21; broken input").is_err());
}
