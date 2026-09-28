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
fn memoized_containment_qualifies_each_occurrence_once_for_every_pair() {
    // Qualified boxes plus the open-shell control, whose refusal is memoized too.
    let document = fixture("regular-solid-controls.step");
    let count = document.source_occurrence_structure().unwrap().len();
    let entities = (0..count as u32)
        .map(BrepEntity::Occurrence)
        .chain([BrepEntity::Whole])
        .collect::<Vec<_>>();
    let pairs = entities
        .iter()
        .flat_map(|&subject| entities.iter().map(move |&target| (subject, target)))
        .collect::<Vec<_>>();
    let mut memo = document.operand_memo();
    let before = document.occurrence_qualifications();
    let memoized = pairs
        .iter()
        .map(|&(subject, target)| {
            format!(
                "{:?}",
                document.regular_solid_containment_memoized(subject, target, &mut memo)
            )
        })
        .collect::<Vec<_>>();
    // Every occurrence is a subject, so each is qualified on its first use and
    // every later use is a memo hit.
    assert_eq!(document.occurrence_qualifications() - before, count);
    for (&(subject, target), memoized) in pairs.iter().zip(&memoized) {
        assert_eq!(
            *memoized,
            format!("{:?}", document.regular_solid_containment(subject, target)),
            "{subject:?} in {target:?}"
        );
    }
}

#[test]
fn memoized_material_and_bore_queries_qualify_each_occurrence_once() {
    for name in [
        "component-interference/original.step",
        "nominal-bore-void/guide.step",
    ] {
        let document = fixture(name);
        let occurrences = document.reported_faces(false).unwrap().occurrence_faces;
        // Per-query answers, and how many occurrences reach qualification.
        let mut expected = Vec::new();
        let mut qualified = 0;
        for faces in &occurrences {
            let before = document.occurrence_qualifications();
            for face in faces.iter() {
                expected.push((
                    format!("{:?}", document.selected_interference_material(face.entity)),
                    format!("{:?}", document.selected_bore_void(face.entity)),
                ));
            }
            qualified += usize::from(document.occurrence_qualifications() > before);
        }
        assert!(qualified > 0, "{name} reaches no qualification");
        let mut memo = document.operand_memo();
        let before = document.occurrence_qualifications();
        let faces = occurrences.iter().flat_map(|faces| faces.iter());
        for (face, expected) in faces.zip(&expected) {
            let memoized = (
                format!(
                    "{:?}",
                    document.selected_interference_material_memoized(face.entity, &mut memo)
                ),
                format!(
                    "{:?}",
                    document.selected_bore_void_memoized(face.entity, &mut memo)
                ),
            );
            assert_eq!(memoized, *expected, "{name} {:?}", face.entity);
        }
        assert_eq!(
            document.occurrence_qualifications() - before,
            qualified,
            "{name}: one qualification per occurrence, then memo hits"
        );
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
