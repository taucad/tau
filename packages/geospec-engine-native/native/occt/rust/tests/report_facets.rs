//! Report facets. The mesh and whole-shape facts share one copy+mesh
//! generation, released once both have run (F9); face tables read the source
//! and build none (F5).

use geospec_engine_native_occt::{BrepSubject, Document, LocatedFace, ReportedFaces};
use std::path::PathBuf;

fn fixture(name: &str) -> Vec<u8> {
    std::fs::read(
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("tests/fixtures")
            .join(name),
    )
    .expect("retained fixture must be readable")
}

const FIXTURES: [&str; 3] = [
    "two-cube-assembly.step",
    "regular-solid-controls.step",
    "subject-and-cavity-target.step",
];

#[test]
fn mesh_and_shape_facets_share_one_generation_in_either_order() {
    for name in FIXTURES {
        let bytes = fixture(name);
        let combined = Document::from_step(&bytes).unwrap();
        let report = combined.reported_facts_and_mesh().unwrap();
        assert_eq!(combined.report_generation_builds(), 1, "{name}");
        // Debug renders each f64 by its shortest round trip, keeping signed zeros.
        let expected = format!("{:?}\n{:?}", report.mesh, report.facts.shape);

        for mesh_first in [true, false] {
            let document = Document::from_step(&bytes).unwrap();
            let (mesh, shape) = if mesh_first {
                let mesh = document.reported_mesh().unwrap();
                // The generation stays until its facts consumer has run too.
                assert_eq!(document.reported_mesh().unwrap(), mesh, "{name}");
                (mesh, document.reported_shape().unwrap())
            } else {
                let shape = document.reported_shape().unwrap();
                (document.reported_mesh().unwrap(), shape)
            };
            assert_eq!(format!("{mesh:?}\n{shape:?}"), expected, "{name}");
            assert_eq!(document.report_generation_builds(), 1, "{name}");
            // Both consumers ran, so the generation is gone; a later facet
            // rebuilds an equal one.
            assert_eq!(document.reported_mesh().unwrap(), mesh, "{name}");
            assert_eq!(document.report_generation_builds(), 2, "{name}");
        }
    }
}

fn rows(faces: &ReportedFaces) -> Vec<&LocatedFace> {
    faces
        .whole_faces
        .iter()
        .chain(faces.occurrence_faces.iter().flat_map(|table| table.iter()))
        .collect()
}

#[test]
fn face_tables_build_no_generation_and_measure_only_on_demand() {
    for name in FIXTURES {
        let document = Document::from_step(&fixture(name)).unwrap();
        let address = document.reported_faces(false).unwrap();
        let measured = document.reported_faces(true).unwrap();
        assert_eq!(document.report_generation_builds(), 0, "{name}");
        assert_eq!(
            address.occurrence_faces.len(),
            measured.occurrence_faces.len(),
            "{name}"
        );
        let (address, measured) = (rows(&address), rows(&measured));
        assert_eq!(address.len(), measured.len(), "{name}");
        for (address, measured) in address.into_iter().zip(measured) {
            // The address part is identical; only the measured part differs.
            assert_eq!(address.entity, measured.entity, "{name}");
            assert_eq!(address.reversed, measured.reversed, "{name}");
            assert_eq!(address.facts.index, measured.facts.index, "{name}");
            assert_eq!(address.facts.surface, measured.facts.surface, "{name}");
            assert!(address.facts.area.is_nan(), "{name}");
            assert!(address
                .facts
                .center_of_mass
                .iter()
                .chain(&address.bounds.min)
                .chain(&address.bounds.max)
                .all(|value| value.is_nan()));
            assert!(measured.facts.area.is_finite(), "{name}");
            assert!(measured
                .bounds
                .min
                .iter()
                .zip(&measured.bounds.max)
                .all(|(min, max)| min <= max));
        }
    }
}
