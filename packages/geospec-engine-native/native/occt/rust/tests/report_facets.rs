//! Report facets share one copy+mesh generation and equal the combined report.

use geospec_engine_native_occt::{BrepSubject, Document, ReportedBrepBundle};
use std::path::PathBuf;

fn fixture(name: &str) -> Vec<u8> {
    std::fs::read(
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("tests/fixtures")
            .join(name),
    )
    .expect("retained fixture must be readable")
}

/// Debug renders each f64 by its shortest round trip, keeping signed zeros.
fn render(report: &ReportedBrepBundle) -> String {
    format!(
        "{:?}\n{:?}\n{:?}\n{:?}",
        report.facts, report.whole_faces, report.occurrence_faces, report.mesh
    )
}

fn combined(bytes: &[u8]) -> String {
    let document = Document::from_step(bytes).unwrap();
    let report = render(&document.reported_facts_and_mesh().unwrap());
    assert_eq!(document.report_generation_builds(), 1);
    report
}

#[test]
fn facts_after_a_mesh_facet_reuse_its_generation_and_equal_the_combined_report() {
    for name in [
        "two-cube-assembly.step",
        "regular-solid-controls.step",
        "subject-and-cavity-target.step",
    ] {
        let bytes = fixture(name);
        let expected = combined(&bytes);
        let document = Document::from_step(&bytes).unwrap();
        let mesh = document.reported_mesh().unwrap().unwrap();
        assert_eq!(document.reported_mesh().unwrap().unwrap(), mesh, "{name}");
        let report = document.reported_facts(mesh).unwrap();
        assert_eq!(render(&report), expected, "{name}");
        assert_eq!(document.report_generation_builds(), 1, "{name}");

        // Facts were the generation's last consumer; a later mesh rebuilds it.
        assert_eq!(
            document.reported_mesh().unwrap().unwrap(),
            report.mesh,
            "{name}"
        );
        assert_eq!(document.report_generation_builds(), 2, "{name}");
    }
}

#[test]
fn a_boolean_between_facets_keeps_the_first_generation() {
    let bytes = fixture("two-cube-assembly.step");
    let expected = combined(&bytes);
    let document = Document::from_step(&bytes).unwrap();
    let mesh = document.reported_mesh().unwrap().unwrap();
    // This Common route may modify its source topology; the report generation
    // is an isolated copy taken at the first report demand, as before.
    document.common_volume(0, 1).unwrap();
    assert_eq!(render(&document.reported_facts(mesh).unwrap()), expected);
    assert_eq!(document.report_generation_builds(), 1);
}
