use geospec_engine_native_core::backend::BackendErrorKind;
use geospec_engine_native_occt::{BrepEntity, BrepSubject, Document, RegularSolidContainment};
use std::path::PathBuf;

const VOLUME_TOLERANCE: f64 = 1e-9;
const LOCATION_TOLERANCE: f64 = 1e-9;

fn local_fixture(name: &str) -> Vec<u8> {
    std::fs::read(
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("tests/fixtures")
            .join(name),
    )
    .expect("retained fixture must be readable")
}

fn occurrence(document: &Document, name: &str) -> BrepEntity {
    let facts = document.facts().unwrap();
    let index = facts
        .occurrences
        .iter()
        .position(|row| {
            row.name == name
                || row.product_name == name
                || row.instance_name.as_deref() == Some(name)
                || row.path == name
        })
        .unwrap_or_else(|| {
            panic!(
                "missing occurrence {name}; observed: {:#?}",
                facts.occurrences
            )
        });
    BrepEntity::Occurrence(index as u32)
}

fn assert_close(actual: f64, expected: f64, tolerance: f64) {
    assert!(
        (actual - expected).abs() <= tolerance,
        "expected {expected} ± {tolerance}, got {actual}"
    );
}

fn assert_point(actual: [f64; 3], expected: [f64; 3]) {
    for (actual, expected) in actual.into_iter().zip(expected) {
        assert_close(actual, expected, LOCATION_TOLERANCE);
    }
}

fn assert_empty(result: &RegularSolidContainment) {
    assert!(result.contained);
    assert_eq!(result.residual_solid_count, 0);
    assert_eq!(result.residual_volume.to_bits(), 0.0_f64.to_bits());
    assert_eq!(result.residual_bounds, None);
    assert_eq!(result.residual_center_of_mass, None);
}

#[test]
fn integer_box_controls_use_residual_solid_topology() {
    let document = Document::from_step(&local_fixture("regular-solid-controls.step")).unwrap();
    let target = occurrence(&document, "target");

    for name in ["interior", "boundary-touching", "coincident"] {
        let result = document
            .regular_solid_containment(occurrence(&document, name), target)
            .unwrap();
        eprintln!("{name}: {result:#?}");
        assert_empty(&result);
    }

    let protruding = document
        .regular_solid_containment(occurrence(&document, "protruding"), target)
        .unwrap();
    eprintln!("protruding: {protruding:#?}");
    assert!(!protruding.contained);
    assert_eq!(protruding.residual_solid_count, 1);
    assert_close(protruding.residual_volume, 1.0, VOLUME_TOLERANCE);
    let bounds = protruding.residual_bounds.unwrap();
    assert_point(bounds.min, [10.0, 2.0, 2.0]);
    assert_point(bounds.max, [11.0, 3.0, 3.0]);
    assert_point(
        protruding.residual_center_of_mass.unwrap(),
        [10.5, 2.5, 2.5],
    );
}

#[test]
fn qualified_ap242_cavity_preserves_the_nonempty_residual() {
    let document = Document::from_step(&local_fixture("subject-and-cavity-target.step")).unwrap();
    let result = document
        .regular_solid_containment(
            occurrence(&document, "subject"),
            occurrence(&document, "target"),
        )
        .unwrap();
    eprintln!("missed-cavity: {result:#?}");

    assert!(!result.contained);
    assert_eq!(result.residual_solid_count, 1);
    assert_close(result.residual_volume, 1.0, VOLUME_TOLERANCE);
    let bounds = result.residual_bounds.unwrap();
    assert_point(bounds.min, [2.0, 2.0, 2.0]);
    assert_point(bounds.max, [3.0, 3.0, 3.0]);
    assert_point(result.residual_center_of_mass.unwrap(), [2.5, 2.5, 2.5]);
}

#[test]
fn whole_solid_is_supported_and_lower_dimensional_operands_are_refused() {
    let whole = Document::from_step(&local_fixture("ap242-box.step")).unwrap();
    let result = whole
        .regular_solid_containment(BrepEntity::Whole, BrepEntity::Whole)
        .unwrap();
    eprintln!("whole-coincident: {result:#?}");
    assert_empty(&result);

    let face_error = whole
        .regular_solid_containment(BrepEntity::WholeFace(1), BrepEntity::Whole)
        .unwrap_err();
    eprintln!("unsupported-face: {face_error:#?}");
    assert_eq!(face_error.kind, BackendErrorKind::Unsupported);

    let controls = Document::from_step(&local_fixture("regular-solid-controls.step")).unwrap();
    let shell_error = controls
        .regular_solid_containment(
            occurrence(&controls, "open-shell"),
            occurrence(&controls, "target"),
        )
        .unwrap_err();
    eprintln!("unsupported-open-shell-subject: {shell_error:#?}");
    assert_eq!(shell_error.kind, BackendErrorKind::Unsupported);
    let shell_target_error = controls
        .regular_solid_containment(
            occurrence(&controls, "interior"),
            occurrence(&controls, "open-shell"),
        )
        .unwrap_err();
    eprintln!("unsupported-open-shell-target: {shell_target_error:#?}");
    assert_eq!(shell_target_error.kind, BackendErrorKind::Unsupported);
}
