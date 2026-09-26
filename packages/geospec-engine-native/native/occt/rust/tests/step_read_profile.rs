//! The STEP admission profile on substrate lane O1's reader controls: the
//! pinned read parameters (`DESTEP_Parameters`), whose reader defaults would
//! move exact evidence, and the authored healing profile.

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

// Exact admitted evidence. Debug text distinguishes every finite f64.
fn evidence(bytes: &[u8]) -> String {
    let document = Document::from_step(bytes).unwrap();
    format!(
        "{:?}\n{:?}",
        BrepSubject::validity(&document).unwrap(),
        BrepSubject::faces(&document).unwrap()
    )
}

#[test]
fn should_keep_linked_file_tessellation_off_exact_faces() {
    // The reader default (On, and equally Off) puts the file's mesh on all six
    // exact faces; OnNoBRep keeps it off, and the exact evidence is the BRep's.
    let tessellated = fixture("read-profile/box-brep-plus-tessellation.step");
    let document = Document::from_step(&tessellated).unwrap();
    assert_eq!(BrepSubject::faces(&document).unwrap().len(), 6);
    assert_eq!(document.triangulated_faces(), 0);
    assert_eq!(
        evidence(&tessellated),
        evidence(&fixture("read-profile/box-brep-only.step"))
    );
}

#[test]
fn should_read_inputs_without_length_uncertainty_at_the_pinned_precision() {
    // One line lies 5e-4 mm off its vertices. At ReadPrecisionVal 1e-3 the
    // vertices absorb the offset; the reader default 1e-4 would move the line.
    let document =
        Document::from_step(&fixture("read-profile/box-line-offset-no-uncertainty.step")).unwrap();
    let tolerance = BrepSubject::validity(&document)
        .unwrap()
        .max_tolerance
        .unwrap();
    assert!((4e-4..1e-3).contains(&tolerance), "{tolerance}");

    // Clean geometry admits exactly as it does with the file's 1e-7 uncertainty.
    for (stripped, original) in [
        (
            "read-profile/ap242-radius1-height10-no-uncertainty.step",
            "ap242-radius1-height10.step",
        ),
        (
            "read-profile/06-full-cylinder-no-uncertainty.step",
            "edge-treatments/06-full-cylinder.step",
        ),
    ] {
        assert_eq!(
            evidence(&fixture(stripped)),
            evidence(&fixture(original)),
            "{stripped}"
        );
    }
}

#[test]
fn should_admit_a_solid_with_an_open_shell_as_the_invalid_solid_it_is() {
    // OCCT's default healing demotes this solid to a valid open shell. The
    // authored profile keeps the solid, so validity reports the open shell.
    let document =
        Document::from_step(&fixture("component-interference/broken-shell.step")).unwrap();
    let validity = BrepSubject::validity(&document).unwrap();
    assert_eq!(validity.solid_count, Some(1));
    assert!(!validity.valid);
}
