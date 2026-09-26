use geospec_engine_native_core::backend::{BackendError, BackendErrorKind};
use geospec_engine_native_occt::{BrepSubject, Document};
use std::path::PathBuf;

fn fixture(name: &str) -> Vec<u8> {
    std::fs::read(
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("tests/fixtures")
            .join(name),
    )
    .expect("retained fixture must be readable")
}

// Every source numeric the adapter transfers. Debug text distinguishes every
// finite f64, including signed zero.
fn source_numerics(document: &Document) -> String {
    let facts = document.facts().unwrap();
    let mut text = format!("{facts:?}\n{:?}\n", BrepSubject::faces(document).unwrap());
    for occurrence in 0..facts.occurrences.len() as u32 {
        text += &format!(
            "{:?}\n{:?}\n",
            document.occurrence_faces(occurrence).unwrap(),
            document.occurrence_edges(occurrence).unwrap()
        );
    }
    text
}

fn validity(document: &Document) -> String {
    format!("{:?}", BrepSubject::validity(document).unwrap())
}

#[test]
fn source_numerics_and_validity_do_not_depend_on_demand_order() {
    for name in [
        "two-cube-assembly.step",
        "ap242-radius1-height10.step",
        "regular-solid-controls.step",
        "circular-bores/03-sealed-cavity.step",
        "component-interference/broken-shell.step",
    ] {
        let bytes = fixture(name);
        let facts_first = Document::from_step(&bytes).unwrap();
        let expected = source_numerics(&facts_first);
        // Validity reuses the proof held by the filled source shape facts.
        let expected_validity = validity(&facts_first);

        // Validity comes first, so it fills only the source validity proof.
        let validity_first = Document::from_step(&bytes).unwrap();
        assert_eq!(validity(&validity_first), expected_validity, "{name}");
        assert_eq!(source_numerics(&validity_first), expected, "{name}");

        // The copied report generation never fills or reads source slots.
        let report_first = Document::from_step(&bytes).unwrap();
        report_first.reported_facts_and_mesh().unwrap();
        assert_eq!(source_numerics(&report_first), expected, "{name}");
        assert_eq!(validity(&report_first), expected_validity, "{name}");
    }
}

#[test]
fn common_volume_completes_original_source_numerics_before_boolean() {
    for name in [
        "two-cube-assembly.step",
        "component-interference/original.step",
    ] {
        let bytes = fixture(name);
        let eager = Document::from_step(&bytes).unwrap();
        let expected = source_numerics(&eager);
        let expected_common = format!("{:?}", eager.common_volume(0, 1).unwrap());

        let boolean_first = Document::from_step(&bytes).unwrap();
        let common = format!("{:?}", boolean_first.common_volume(0, 1).unwrap());
        assert_eq!(common, expected_common, "{name}");
        assert_eq!(source_numerics(&boolean_first), expected, "{name}");
        // Both documents validate their current shapes after the Boolean.
        assert_eq!(validity(&boolean_first), validity(&eager), "{name}");
    }
}

#[test]
fn numeric_failure_refuses_at_first_demand_not_admission() {
    // cubeB keeps its product and placement but loses its solid, so XDE
    // admits an occurrence whose optimal bounds are void.
    let bytes = String::from_utf8(fixture("two-cube-assembly.step"))
        .unwrap()
        .replace(
            "#2010=ADVANCED_BREP_SHAPE_REPRESENTATION('cubeB',(#211,#2513),#400);",
            "#2010=SHAPE_REPRESENTATION('cubeB',(#2513),#400);",
        );
    let document = Document::from_step(bytes.as_bytes()).unwrap();
    assert_eq!(document.admission_facts().unwrap().occurrence_count, 2);
    for _ in 0..2 {
        // A failed fill stores nothing; a retry fails the same way.
        assert_eq!(
            document.facts().unwrap_err(),
            BackendError {
                kind: BackendErrorKind::ComputationFailed,
                message: "Shape has no finite bounds.".into(),
            }
        );
    }
}
