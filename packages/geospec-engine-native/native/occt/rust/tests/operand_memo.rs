//! C7: a claim-local operand memo qualifies each occurrence once and changes
//! no result, refusals included.

use geospec_engine_native_core::backend::BackendErrorKind;
use geospec_engine_native_occt::{BrepEntity, BrepSubject, Document};
use std::path::PathBuf;

fn fixture(name: &str) -> Document {
    let bytes = std::fs::read(
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("tests/fixtures")
            .join(name),
    )
    .expect("retained fixture must be readable");
    Document::from_step(&bytes).unwrap()
}

#[test]
fn memoized_containment_matches_per_query_qualification_for_every_pair() {
    // Qualified boxes plus the open-shell control, whose refusal is memoized too.
    let document = fixture("regular-solid-controls.step");
    let count = document.source_occurrence_structure().unwrap().len() as u32;
    let mut memo = document.operand_memo();
    let entities = (0..count)
        .map(BrepEntity::Occurrence)
        .chain([BrepEntity::Whole])
        .collect::<Vec<_>>();
    for &subject in &entities {
        for &target in &entities {
            assert_eq!(
                format!(
                    "{:?}",
                    document.regular_solid_containment_memoized(subject, target, &mut memo)
                ),
                format!("{:?}", document.regular_solid_containment(subject, target)),
                "{subject:?} in {target:?}"
            );
        }
    }
}

#[test]
fn memoized_material_and_bore_queries_match_per_query_qualification() {
    for name in [
        "component-interference/original.step",
        "nominal-bore-void/guide.step",
    ] {
        let document = fixture(name);
        let mut memo = document.operand_memo();
        for faces in document.reported_faces(false).unwrap().occurrence_faces {
            for face in faces.iter() {
                assert_eq!(
                    format!(
                        "{:?}",
                        document.selected_interference_material_memoized(face.entity, &mut memo)
                    ),
                    format!("{:?}", document.selected_interference_material(face.entity)),
                    "{name} {:?}",
                    face.entity
                );
                assert_eq!(
                    format!(
                        "{:?}",
                        document.selected_bore_void_memoized(face.entity, &mut memo)
                    ),
                    format!("{:?}", document.selected_bore_void(face.entity)),
                    "{name} {:?}",
                    face.entity
                );
            }
        }
    }
}

#[test]
fn a_memo_from_another_document_is_refused() {
    let first = fixture("regular-solid-controls.step");
    let second = fixture("regular-solid-controls.step");
    let mut memo = first.operand_memo();
    let error = second
        .regular_solid_containment_memoized(
            BrepEntity::Occurrence(0),
            BrepEntity::Occurrence(1),
            &mut memo,
        )
        .unwrap_err();
    assert_eq!(error.kind, BackendErrorKind::InvalidInput);
    assert_eq!(error.message, "Operand memo belongs to another document.");
}
