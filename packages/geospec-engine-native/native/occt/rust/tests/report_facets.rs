//! Report facets. Whole-shape facts read the source and build no copy+mesh
//! generation (F1); each report mesh builds one for its call alone and drops
//! it after the soup (F9); face tables read the source and build none (F5).

use geospec_engine_native_occt::{
    Bounds, BrepSubject, Document, LocatedFace, ReportedFaces, ShapeFacts, ShapeParts,
    TopologyCounts,
};
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
fn facts_build_no_generation_and_each_report_mesh_builds_its_own() {
    for name in FIXTURES {
        let document = Document::from_step(&fixture(name)).unwrap();
        // Debug renders each f64 by its shortest round trip, keeping signed zeros.
        let shape = format!("{:?}", document.reported_shape().unwrap());
        assert_eq!(document.report_generation_builds(), 0, "{name}");
        let mesh = document.reported_mesh().unwrap();
        assert_eq!(document.report_generation_builds(), 1, "{name}");
        // Nothing is retained: the next mesh builds an equal generation.
        assert_eq!(document.reported_mesh().unwrap(), mesh, "{name}");
        assert_eq!(document.report_generation_builds(), 2, "{name}");
        // The facts never read a generation, before or after a mesh.
        assert_eq!(
            format!("{:?}", document.reported_shape().unwrap()),
            shape,
            "{name}"
        );
        assert_eq!(document.report_generation_builds(), 2, "{name}");
    }
}

#[test]
fn validity_closure_and_exact_bounds_read_the_source_without_a_generation() {
    // F1 x V1/V2 (W2-INT): the validity proof, the shell-closure facet, the
    // exact whole-shape and occurrence bounds and the face boxes all read the
    // admitted source shape; none builds or reads a copy+mesh generation.
    for name in FIXTURES {
        let document = Document::from_step(&fixture(name)).unwrap();
        let validity = document.validity().unwrap();
        let closure = document.closure(&mut |_| true).unwrap().unwrap();
        assert_eq!(validity.free_bounds, Some(closure.open_edges), "{name}");
        document.reported_shape_parts(ShapeParts::BOUNDS).unwrap();
        document.source_occurrences().unwrap();
        for face in 0..document.faces().unwrap().len() as u32 {
            document.face_optimal_bounds(face).unwrap();
        }
        assert_eq!(document.report_generation_builds(), 0, "{name}");
    }
}

/// `shape` with only `parts` measured: the others NaN, counts zero.
fn only(shape: &ShapeFacts, parts: ShapeParts) -> String {
    let nan = f64::NAN;
    let mut value = shape.clone();
    if !parts.contains(ShapeParts::VOLUME) {
        value.volume = nan;
        value.center_of_mass = [nan; 3];
    }
    if !parts.contains(ShapeParts::AREA) {
        value.surface_area = nan;
    }
    if !parts.contains(ShapeParts::BOUNDS) {
        value.bounds = Bounds {
            min: [nan; 3],
            max: [nan; 3],
        };
    }
    if !parts.contains(ShapeParts::COUNTS) {
        value.topology = TopologyCounts {
            compounds: 0,
            solids: 0,
            shells: 0,
            faces: 0,
            wires: 0,
            edges: 0,
            vertices: 0,
        };
    }
    format!("{value:?}")
}

#[test]
fn each_shape_part_is_measured_alone_with_the_bits_of_the_whole_facts() {
    let parts = [
        ShapeParts::VOLUME,
        ShapeParts::AREA,
        ShapeParts::BOUNDS,
        ShapeParts::COUNTS,
    ];
    for name in FIXTURES {
        let bytes = fixture(name);
        let all = Document::from_step(&bytes)
            .unwrap()
            .reported_shape()
            .unwrap();
        // In either order, each call carries exactly its parts, bit-equal.
        for order in [parts, [parts[3], parts[2], parts[1], parts[0]]] {
            let document = Document::from_step(&bytes).unwrap();
            for part in order {
                let measured = document.reported_shape_parts(part).unwrap();
                assert_eq!(format!("{measured:?}"), only(&all, part), "{name}");
            }
            assert_eq!(
                format!("{:?}", document.reported_shape().unwrap()),
                format!("{all:?}"),
                "{name}"
            );
            assert_eq!(document.report_generation_builds(), 0, "{name}");
        }
    }
}

#[test]
fn surface_area_reuses_a_repeated_rigid_solid_and_is_the_plain_integral_otherwise() {
    // S6 (ruling 26). Without a repeated solid TShape the area is the plain
    // whole-shape integral: the in-order sum of the face integrals. The
    // distance source places cubeA, cubeB, then cubeA again, so the third
    // rigid instance reuses the first one's per-solid area.
    for (name, repeated) in [
        ("two-cube-assembly.step", false),
        ("parallel-plane-distance-source.step", true),
    ] {
        let document = Document::from_step(&fixture(name)).unwrap();
        let area = document
            .reported_shape_parts(ShapeParts::AREA)
            .unwrap()
            .surface_area;
        let faces = document.reported_faces(true).unwrap().whole_faces;
        let sum = |faces: &[LocatedFace]| faces.iter().fold(0.0, |sum, face| sum + face.facts.area);
        let expected = if repeated {
            assert_eq!(faces.len(), 18, "{name}");
            let cube_a = sum(&faces[..6]);
            (cube_a + sum(&faces[6..12])) + cube_a
        } else {
            sum(&faces)
        };
        assert_eq!(area.to_bits(), expected.to_bits(), "{name}");
    }
}

#[test]
fn a_shell_definition_placed_twice_keeps_each_placement_in_the_report_soup() {
    // S5 (ruling 25): a leaf is any non-compound shape, so this open shell,
    // placed at the origin and 30 mm along x, takes the share copy: one mesh
    // of the definition, whose soup is re-placed per instance.
    let document = Document::from_step(&fixture("shared-shell-placements.step")).unwrap();
    let mesh = document.reported_mesh().unwrap();
    let corners = |triangles: &[[u32; 3]]| {
        triangles
            .iter()
            .flatten()
            .map(|&index| mesh.positions[index as usize])
            .collect::<Vec<_>>()
    };
    let (first, second) = mesh.triangles.split_at(mesh.triangles.len() / 2);
    let (first, second) = (corners(first), corners(second));
    assert!(!first.is_empty());
    assert_eq!(first.len(), second.len());
    for (left, right) in first.iter().zip(&second) {
        assert_eq!(
            [left[0] + 30.0, left[1], left[2]].map(f64::to_bits),
            right.map(f64::to_bits)
        );
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
