use geospec_engine_native_core::backend::BackendErrorKind;
use geospec_engine_native_occt::{BrepEntity, BrepSubject, ContinuousWallShape, Document};
use std::path::PathBuf;

fn fixture(name: &str) -> Vec<u8> {
    std::fs::read(
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("tests/fixtures")
            .join(name),
    )
    .expect("preserved AP242 fixture")
}

#[test]
fn retained_box_certificate_is_unchanged() {
    let document = Document::from_step(&fixture("ap242-box.step")).unwrap();
    let before = document.facts().unwrap();
    let domain = document.continuous_wall_domain(BrepEntity::Whole).unwrap();
    let ContinuousWallShape::AxisAlignedBox {
        corners,
        face_indices,
        edge_lengths,
        ..
    } = domain.domain
    else {
        panic!("retained box must remain an axis-aligned box")
    };
    assert_eq!(
        corners,
        [
            [-5.0, -10.0, -15.0],
            [-5.0, -10.0, 15.0],
            [-5.0, 10.0, -15.0],
            [-5.0, 10.0, 15.0],
            [5.0, -10.0, -15.0],
            [5.0, -10.0, 15.0],
            [5.0, 10.0, -15.0],
            [5.0, 10.0, 15.0],
        ]
    );
    assert_eq!(face_indices, [1, 2, 3, 4, 5, 6]);
    assert_eq!(edge_lengths, [10.0, 20.0, 30.0]);
    assert_eq!(before.as_ref(), document.facts().unwrap().as_ref());
}

#[test]
fn retained_rod_remains_unsupported() {
    let document = Document::from_step(&fixture("ap242-radius1-height10.step")).unwrap();
    let before = document.facts().unwrap();
    let error = document
        .continuous_wall_domain(BrepEntity::Whole)
        .unwrap_err();
    assert_eq!(error.kind, BackendErrorKind::Unsupported);
    assert_eq!(
        error.message,
        "Continuous cylinder requires a finite increasing axial interval and an exact full analytic U period."
    );
    assert_eq!(before.as_ref(), document.facts().unwrap().as_ref());
}
