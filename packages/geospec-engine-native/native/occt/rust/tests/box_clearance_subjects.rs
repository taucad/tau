use geospec_engine_native_occt::{BrepSubject, ContinuousWallShape, Document};
use std::path::PathBuf;

#[test]
fn original_clearance_subjects_have_complete_located_box_domains() {
    for name in ["two-mm", "four-mm"] {
        let bytes = std::fs::read(
            PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("tests/fixtures/box-clearance")
                .join(format!("{name}.step")),
        )
        .expect("unchanged independently authored STEP bytes");
        let document = Document::from_step(&bytes).expect("ordinary original STEP admission");
        let facts = document.facts().expect("actual occurrence identities");
        eprintln!(
            "CLEARANCE_SUBJECT fixture={name} occurrences={:#?}",
            facts.occurrences
        );
        assert_eq!(facts.occurrences.len(), 2);
        for (ordinal, occurrence) in facts.occurrences.iter().enumerate() {
            let domain = document.selected_continuous_domain(ordinal as u32);
            eprintln!(
                "CLEARANCE_DOMAIN fixture={name} name={:?} ordinal={ordinal} result={domain:#?}",
                occurrence.name
            );
            let domain =
                domain.expect("original clearance operand must qualify without changing it");
            assert_eq!(domain.occurrence, ordinal as u32);
            assert!(matches!(
                domain.domain.domain,
                ContinuousWallShape::AxisAlignedBox { .. }
            ));
            assert_eq!(domain.domain_face_to_occurrence_face.len(), 6);
            assert_eq!(domain.domain_edge_to_occurrence_edge.len(), 12);
            let faces = document.occurrence_faces(ordinal as u32).unwrap();
            let edges = document.occurrence_edges(ordinal as u32).unwrap();
            assert_eq!(faces.len(), 6);
            assert_eq!(edges.len(), 12);
            for index in &domain.domain_face_to_occurrence_face {
                assert!(*index >= 1 && *index <= faces.len() as u32);
            }
            for index in &domain.domain_edge_to_occurrence_edge {
                assert!(*index >= 1 && *index <= edges.len() as u32);
            }
        }
    }
}
