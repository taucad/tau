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
    let faces = BrepSubject::faces(document).unwrap();
    let boxes: Vec<_> = (0..faces.len() as u32)
        .map(|face| document.face_optimal_bounds(face).unwrap())
        .collect();
    format!(
        "{:?}\n{faces:?}\n{boxes:?}\n",
        document.source_occurrences().unwrap()
    )
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

        // The report facts read the source (F1) and fill the face-box memo
        // (V2) with the same boxes; the report mesh reads no source slot.
        let report_first = Document::from_step(&bytes).unwrap();
        report_first.reported_shape().unwrap();
        report_first.reported_mesh().unwrap();
        assert_eq!(source_numerics(&report_first), expected, "{name}");
        assert_eq!(validity(&report_first), expected_validity, "{name}");
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
            document.source_occurrences().unwrap_err(),
            BackendError {
                kind: BackendErrorKind::ComputationFailed,
                message: "Shape has no finite bounds.".into(),
            }
        );
    }
}
