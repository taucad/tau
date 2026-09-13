use geospec_engine_native_occt::{BrepSubject, Document, SourceFaceKey};
use std::path::PathBuf;

fn fixture() -> Vec<u8> {
    std::fs::read(
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("tests/fixtures/parallel-plane-distance-source.step"),
    )
    .expect("F2 AP242 fixture")
}

fn same_occurrence_fixture() -> Vec<u8> {
    std::fs::read(
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("tests/fixtures/parallel-plane-distance-same-occurrence-source.step"),
    )
    .expect("same-occurrence F2 AP242 fixture")
}

#[test]
fn should_resolve_each_original_face_through_its_distinct_source_occurrence() {
    let document = Document::from_step(&fixture()).expect("OCCT imports the F2 fixture");
    let first = document
        .resolve_source_face(&SourceFaceKey {
            source_face_entity: 1110,
            occurrence_route: vec![600],
        })
        .expect("first forward source association");
    let second = document
        .resolve_source_face(&SourceFaceKey {
            source_face_entity: 1110,
            occurrence_route: vec![620],
        })
        .expect("second forward source association");

    assert_ne!(first.occurrence, second.occurrence);
    assert_eq!(first.key.occurrence_route, vec![600]);
    assert_eq!(second.key.occurrence_route, vec![620]);
    assert_eq!(first.key.source_face_entity, 1110);
    assert_eq!(second.key.source_face_entity, 1110);
    assert!(first.source_same_sense && second.source_same_sense);
    assert!(first.private_query_face > 0 && second.private_query_face > 0);
    let facts = document.facts().unwrap();
    assert_eq!(
        facts.occurrences[first.occurrence as usize].product_name,
        "cubeA"
    );
    assert_eq!(
        facts.occurrences[second.occurrence as usize].product_name,
        "cubeA"
    );
    assert_eq!(
        document.occurrence_faces(first.occurrence).unwrap()[first.public_face_ordinal as usize]
            .facts
            .index,
        first.public_face_ordinal
    );
}

#[test]
fn should_resolve_distinct_source_faces_in_one_occurrence() {
    let document =
        Document::from_step(&same_occurrence_fixture()).expect("OCCT imports same-occurrence F2");
    let first = document
        .resolve_source_face(&SourceFaceKey {
            source_face_entity: 1100,
            occurrence_route: vec![600],
        })
        .expect("first face association");
    let second = document
        .resolve_source_face(&SourceFaceKey {
            source_face_entity: 1110,
            occurrence_route: vec![600],
        })
        .expect("second face association");

    assert_eq!(first.occurrence, second.occurrence);
    assert_ne!(first.public_face_ordinal, second.public_face_ordinal);
    assert_ne!(first.private_query_face, second.private_query_face);
    assert!(!first.source_same_sense);
    assert!(second.source_same_sense);
    assert!(first.transferred_reversed);
    assert!(!second.transferred_reversed);
    assert_eq!(
        document.facts().unwrap().occurrences[first.occurrence as usize].product_name,
        "cubeA"
    );
}
