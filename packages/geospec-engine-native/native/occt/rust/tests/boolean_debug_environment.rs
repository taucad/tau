//! OCCT reads `CSF_DEBUG_BOP` inside every Boolean and, when it is non-empty,
//! checks the arguments and writes BREP files. GeoSpec refuses at both of its
//! Boolean sites instead of running that environment-dependent path (§16).
//! The variable is process-global, so this file is its own test binary.

use geospec_engine_native_core::backend::BackendErrorKind;
use geospec_engine_native_occt::{BrepEntity, BrepSubject, Document};
use std::path::PathBuf;

fn fixture(name: &str) -> Document {
    let bytes = std::fs::read(
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("tests/fixtures")
            .join(name),
    )
    .unwrap();
    Document::from_step(&bytes).unwrap()
}

#[test]
fn boolean_sites_refuse_a_nonempty_csf_debug_bop() {
    // The obstructed bore is the fixture whose clearance only the Common decides.
    let bores = fixture("circular-bores/08-obstructed-through.step");
    let solid = fixture("ap242-box.step");

    std::env::set_var("CSF_DEBUG_BOP", ""); // empty is off, as in OCCT
    assert!(bores.circular_bores(4096).is_ok());
    assert!(solid
        .regular_solid_containment(BrepEntity::Whole, BrepEntity::Whole)
        .is_ok());

    // A Boolean that ran anyway would dump its operands here, not in the tree.
    std::env::set_var("CSF_DEBUG_BOP", env!("CARGO_TARGET_TMPDIR"));
    for error in [
        bores.circular_bores(4096).unwrap_err(),
        solid
            .regular_solid_containment(BrepEntity::Whole, BrepEntity::Whole)
            .unwrap_err(),
    ] {
        assert_eq!(error.kind, BackendErrorKind::Unsupported);
        assert_eq!(
            error.message,
            "CSF_DEBUG_BOP is set; GeoSpec does not run OCCT Booleans that check and dump their arguments."
        );
    }
    std::env::remove_var("CSF_DEBUG_BOP");
}
