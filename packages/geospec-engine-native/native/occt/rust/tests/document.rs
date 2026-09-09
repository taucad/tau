use geospec_engine_native_core::backend::BackendErrorKind;
use geospec_engine_native_occt::{Document, PmiKind, SurfaceFacts, TopologyCounts};
use std::path::PathBuf;

// Preserve the six original fixture expectations. The later compounds field
// has no independent expectation in these historical fixture controls.
fn legacy_topology_counts(value: TopologyCounts) -> [usize; 6] {
    [
        value.solids,
        value.shells,
        value.faces,
        value.wires,
        value.edges,
        value.vertices,
    ]
}

fn fixture(name: &str) -> Vec<u8> {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures")
        .join(name);
    std::fs::read(path).expect("retained fixture must be readable")
}

fn close(actual: f64, expected: f64, tolerance: f64) {
    assert!(
        (actual - expected).abs() <= tolerance,
        "expected {expected} ± {tolerance}, got {actual}"
    );
}

fn close3(actual: [f64; 3], expected: [f64; 3], tolerance: f64) {
    for index in 0..3 {
        close(actual[index], expected[index], tolerance);
    }
}

#[test]
fn ap242_box_retains_shape_face_and_mesh_facts() {
    let document = Document::from_step(&fixture("ap242-box.step")).unwrap();
    let facts = document.facts().unwrap();

    assert_eq!(facts.source_length_unit, "millimetre");
    close(facts.source_unit_to_millimeters, 1.0, 1e-12);
    assert!(facts.shape.valid);
    assert!(facts
        .products
        .iter()
        .any(|product| product.name == "COMPOUND"));
    close(facts.shape.volume, 6_000.0, 1e-8);
    close(facts.shape.surface_area, 2_200.0, 1e-8);
    close3(facts.shape.bounds.min, [-5.0, -10.0, -15.0], 1e-8);
    close3(facts.shape.bounds.max, [5.0, 10.0, 15.0], 1e-8);
    close3(facts.shape.center_of_mass, [0.0, 0.0, 0.0], 1e-8);
    assert_eq!(
        legacy_topology_counts(facts.shape.topology),
        [1, 1, 6, 6, 12, 8]
    );
    assert_eq!(facts.faces.len(), 6);
    assert_eq!(
        facts
            .faces
            .iter()
            .map(|face| face.index)
            .collect::<Vec<_>>(),
        vec![1, 2, 3, 4, 5, 6]
    );
    assert!(facts
        .faces
        .iter()
        .all(|face| matches!(&face.surface, SurfaceFacts::Plane { .. })));
    // GNE-OCCT-FACE-ORACLE-01: independent STEPControl_Reader / TopExp unique
    // faces / BRepGProp::SurfaceProperties(false, false), frozen before candidate
    // inspection. This exact runtime-byte oracle replaces the mistaken ideal
    // 200.0 predicate; its failure and the rejected fitted tolerance stay in the
    // implementation run evidence. The analytic checks below remain unchanged.
    // OCCT pin: 3d097a0328e71b826377d4814ab05ec3c3d23871
    // Fixture SHA256: 9d3db06c9381009ceeb4c82742f662becbdfce3d3d2084e46e195901d8b3b9bf
    // Raw query SHA256: f8a814833cd6f9365fa46f0ad4f574f73bf10640101dbe966ca349c8a7f276d7
    // Freeze SHA256: 4fcc2801d218bb949545ff87f501e0605daf8fd3915f0f9fd55ef29a1898ec3a
    let expected_face_areas = vec![
        (1, 0x4082_c000_0000_0000_u64),
        (2, 0x4082_c000_0000_0000),
        (3, 0x4072_c000_0000_0000),
        (4, 0x4072_c000_0000_0000),
        (5, 0x4068_ffff_ffff_ffff),
        (6, 0x4068_ffff_ffff_ffff),
    ];
    assert_eq!(
        facts
            .faces
            .iter()
            .map(|face| (face.index, face.area.to_bits()))
            .collect::<Vec<_>>(),
        expected_face_areas
    );
    for face in &facts.faces {
        assert!(face.parameter_bounds.iter().all(|value| value.is_finite()));
        if let SurfaceFacts::Plane { normal, .. } = &face.surface {
            close(
                normal.iter().map(|value| value * value).sum::<f64>(),
                1.0,
                1e-12,
            );
        }
    }
    close(
        facts.faces.iter().map(|face| face.area).sum(),
        2_200.0,
        1e-8,
    );
    assert!(facts.pmi.is_empty());
    assert!(facts.occurrences.is_empty());

    let mesh = document.tessellate(0.1, 0.5).unwrap();
    assert_eq!(mesh.positions.len(), 8);
    assert_eq!(mesh.triangles.len(), 12);
    let mesh_min = [
        mesh.positions
            .iter()
            .map(|point| point[0])
            .reduce(f64::min)
            .unwrap(),
        mesh.positions
            .iter()
            .map(|point| point[1])
            .reduce(f64::min)
            .unwrap(),
        mesh.positions
            .iter()
            .map(|point| point[2])
            .reduce(f64::min)
            .unwrap(),
    ];
    let mesh_max = [
        mesh.positions
            .iter()
            .map(|point| point[0])
            .reduce(f64::max)
            .unwrap(),
        mesh.positions
            .iter()
            .map(|point| point[1])
            .reduce(f64::max)
            .unwrap(),
        mesh.positions
            .iter()
            .map(|point| point[2])
            .reduce(f64::max)
            .unwrap(),
    ];
    close3(mesh_min, facts.shape.bounds.min, 1e-8);
    close3(mesh_max, facts.shape.bounds.max, 1e-8);
    assert!(mesh
        .triangles
        .iter()
        .flatten()
        .all(|index| (*index as usize) < mesh.positions.len()));
}

#[test]
fn inch_cube_preserves_declared_units_and_converted_geometry() {
    let document = Document::from_step(&fixture("inch-cube.step")).unwrap();
    let facts = document.facts().unwrap();

    assert_eq!(facts.source_length_unit, "INCH");
    close(facts.source_unit_to_millimeters, 25.4, 1e-12);
    assert!(facts.shape.valid);
    close(facts.shape.volume, 25.4_f64.powi(3), 1e-8);
    close(facts.shape.surface_area, 6.0 * 25.4_f64.powi(2), 1e-8);
    close3(facts.shape.bounds.min, [0.0, 0.0, 0.0], 1e-8);
    close3(facts.shape.bounds.max, [25.4, 25.4, 25.4], 1e-8);
    close3(facts.shape.center_of_mass, [12.7, 12.7, 12.7], 1e-8);
    assert_eq!(
        legacy_topology_counts(facts.shape.topology),
        [1, 1, 6, 6, 12, 8]
    );
    assert_eq!(facts.faces.len(), 6);
    assert!(facts
        .faces
        .iter()
        .all(|face| matches!(&face.surface, SurfaceFacts::Plane { .. })));
    assert_eq!(document.tessellate(0.1, 0.5).unwrap().triangles.len(), 12);
}

#[test]
fn assembly_retains_occurrence_references_composed_placements_and_bounds() {
    let document = Document::from_step(&fixture("two-cube-assembly.step")).unwrap();
    let facts = document.facts().unwrap();

    assert_eq!(facts.source_length_unit, "millimetre");
    assert!(facts.shape.valid);
    close(facts.shape.volume, 2_000.0, 1e-8);
    close(facts.shape.surface_area, 1_200.0, 1e-8);
    close3(facts.shape.bounds.min, [-5.0, -5.0, -5.0], 1e-8);
    close3(facts.shape.bounds.max, [35.0, 5.0, 5.0], 1e-8);
    close3(facts.shape.center_of_mass, [15.0, 0.0, 0.0], 1e-8);
    assert_eq!(
        legacy_topology_counts(facts.shape.topology),
        [2, 2, 12, 12, 24, 16]
    );
    assert_eq!(facts.occurrences.len(), 2);
    assert!(facts.occurrences.iter().all(|occurrence| facts
        .products
        .iter()
        .any(|product| product.label == occurrence.product_label)));
    assert_eq!(
        facts
            .occurrences
            .iter()
            .map(|value| (value.label.as_str(), value.product_label.as_str()))
            .collect::<Vec<_>>(),
        vec![("0:1:1:1:1", "0:1:1:2"), ("0:1:1:1:2", "0:1:1:3")]
    );
    close3(
        [
            facts.occurrences[0].placement[3],
            facts.occurrences[0].placement[7],
            facts.occurrences[0].placement[11],
        ],
        [0.0, 0.0, 0.0],
        1e-12,
    );
    close3(
        [
            facts.occurrences[1].placement[3],
            facts.occurrences[1].placement[7],
            facts.occurrences[1].placement[11],
        ],
        [30.0, 0.0, 0.0],
        1e-12,
    );
    close3(facts.occurrences[0].bounds.min, [-5.0, -5.0, -5.0], 1e-8);
    close3(facts.occurrences[0].bounds.max, [5.0, 5.0, 5.0], 1e-8);
    close3(facts.occurrences[1].bounds.min, [25.0, -5.0, -5.0], 1e-8);
    close3(facts.occurrences[1].bounds.max, [35.0, 5.0, 5.0], 1e-8);
    close(
        facts.occurrences[1].bounds.min[0] - facts.occurrences[0].bounds.max[0],
        20.0,
        1e-8,
    );
    assert_eq!(document.tessellate(0.1, 0.5).unwrap().triangles.len(), 24);
}

#[test]
fn nist_document_retains_bspline_and_exact_pmi_association_inventory() {
    let document = Document::from_step(&fixture("nist-pmi-bspline.step")).unwrap();
    let facts = document.facts().unwrap();

    assert!(facts.shape.valid);
    assert_eq!(facts.shape.topology.faces, 156);
    assert_eq!(facts.faces.len(), 156);
    assert_eq!(
        facts
            .faces
            .iter()
            .filter(|face| matches!(&face.surface, SurfaceFacts::Bspline { .. }))
            .count(),
        4
    );
    for face in facts
        .faces
        .iter()
        .filter(|face| matches!(&face.surface, SurfaceFacts::Bspline { .. }))
    {
        match &face.surface {
            SurfaceFacts::Bspline {
                u_degree,
                v_degree,
                u_poles,
                v_poles,
                u_knots,
                v_knots,
                ..
            } => {
                assert!(*u_degree > 0 && *v_degree > 0);
                assert!(u_poles > u_degree && v_poles > v_degree);
                assert!(*u_knots > 1 && *v_knots > 1);
            }
            _ => unreachable!(),
        }
    }
    assert_eq!(
        facts
            .pmi
            .iter()
            .filter(|value| value.kind == PmiKind::Dimension)
            .count(),
        28
    );
    assert_eq!(
        facts
            .pmi
            .iter()
            .filter(|value| value.kind == PmiKind::GeometricTolerance)
            .count(),
        10
    );
    assert_eq!(
        facts
            .pmi
            .iter()
            .filter(|value| value.kind == PmiKind::Datum)
            .count(),
        11
    );
    assert_eq!(
        facts
            .pmi
            .iter()
            .map(|value| value.shape_labels.len())
            .sum::<usize>(),
        50
    );

    let dimension_labels = (1..=28)
        .map(|value| format!("0:1:4:{value}"))
        .collect::<Vec<_>>();
    assert_eq!(
        facts.pmi[..28]
            .iter()
            .map(|value| value.label.clone())
            .collect::<Vec<_>>(),
        dimension_labels
    );
    assert_eq!(
        facts.pmi[28..38]
            .iter()
            .map(|value| value.label.as_str())
            .collect::<Vec<_>>(),
        [
            "0:1:4:29", "0:1:4:32", "0:1:4:35", "0:1:4:38", "0:1:4:40", "0:1:4:42", "0:1:4:43",
            "0:1:4:45", "0:1:4:46", "0:1:4:48"
        ]
    );
    assert_eq!(
        facts.pmi[38..]
            .iter()
            .map(|value| value.label.as_str())
            .collect::<Vec<_>>(),
        [
            "0:1:4:30", "0:1:4:31", "0:1:4:33", "0:1:4:34", "0:1:4:36", "0:1:4:37", "0:1:4:39",
            "0:1:4:41", "0:1:4:44", "0:1:4:47", "0:1:4:49"
        ]
    );

    let associated = facts
        .pmi
        .iter()
        .filter(|value| !value.shape_labels.is_empty())
        .map(|value| {
            (
                value.label.as_str(),
                value
                    .shape_labels
                    .iter()
                    .map(String::as_str)
                    .collect::<Vec<_>>(),
            )
        })
        .collect::<Vec<_>>();
    assert_eq!(associated, expected_pmi_associations());
    assert_eq!(
        document.tessellate(0.1, 0.5).unwrap().triangles.len(),
        14_212
    );
}

#[test]
fn truncated_step_is_a_typed_admission_failure() {
    let error = match Document::from_step(&fixture("truncated.step")) {
        Ok(_) => panic!("truncated STEP must be rejected"),
        Err(error) => error,
    };
    assert_eq!(error.kind, BackendErrorKind::InvalidInput);
    assert_eq!(error.message, "STEP read failed.");
}

#[test]
fn external_step_resource_is_refused_before_transfer() {
    let error = match Document::from_step(&fixture("external-reference.step")) {
        Ok(_) => panic!("STEP external resource must be rejected"),
        Err(error) => error,
    };
    assert_eq!(error.kind, BackendErrorKind::Unsupported);
    assert_eq!(
        error.message,
        "STEP external file references are unsupported by byte-only admission."
    );
}

fn expected_pmi_associations() -> Vec<(&'static str, Vec<&'static str>)> {
    // Frozen independently by the accepted S3 OCCT dev1 probe before this adapter existed.
    vec![
        ("0:1:4:1", vec!["0:1:1:1:7"]),
        ("0:1:4:2", vec!["0:1:1:1:9"]),
        ("0:1:4:3", vec!["0:1:1:1:12"]),
        ("0:1:4:4", vec!["0:1:1:1:13"]),
        ("0:1:4:5", vec!["0:1:1:1:14"]),
        ("0:1:4:6", vec!["0:1:1:1:15"]),
        ("0:1:4:7", vec!["0:1:1:1:12"]),
        ("0:1:4:8", vec!["0:1:1:1:16"]),
        ("0:1:4:9", vec!["0:1:1:1:3"]),
        ("0:1:4:10", vec!["0:1:1:1:17"]),
        ("0:1:4:11", vec!["0:1:1:1:18"]),
        ("0:1:4:12", vec!["0:1:1:1:19"]),
        ("0:1:4:13", vec!["0:1:1:1:20"]),
        ("0:1:4:14", vec!["0:1:1:1:21"]),
        ("0:1:4:15", vec!["0:1:1:1:22"]),
        ("0:1:4:16", vec!["0:1:1:1:5"]),
        ("0:1:4:17", vec!["0:1:1:1:11"]),
        ("0:1:4:18", vec!["0:1:1:1:13"]),
        ("0:1:4:19", vec!["0:1:1:1:5"]),
        ("0:1:4:20", vec!["0:1:1:1:10"]),
        ("0:1:4:23", vec!["0:1:1:1:14"]),
        ("0:1:4:24", vec!["0:1:1:1:23", "0:1:1:1:22"]),
        ("0:1:4:25", vec!["0:1:1:1:4", "0:1:1:1:5"]),
        ("0:1:4:26", vec!["0:1:1:1:10", "0:1:1:1:11"]),
        ("0:1:4:27", vec!["0:1:1:1:7", "0:1:1:1:5"]),
        ("0:1:4:28", vec!["0:1:1:1:10", "0:1:1:1:10"]),
        ("0:1:4:29", vec!["0:1:1:1:19"]),
        ("0:1:4:32", vec!["0:1:1:1:20"]),
        ("0:1:4:35", vec!["0:1:1:1:21"]),
        ("0:1:4:38", vec!["0:1:1:1:17"]),
        ("0:1:4:40", vec!["0:1:1:1:18"]),
        ("0:1:4:42", vec!["0:1:1:1:3"]),
        ("0:1:4:43", vec!["0:1:1:1:16"]),
        ("0:1:4:45", vec!["0:1:1:1:12"]),
        ("0:1:4:46", vec!["0:1:1:1:14"]),
        ("0:1:4:48", vec!["0:1:1:1:15"]),
        ("0:1:4:30", vec!["0:1:1:1:12"]),
        ("0:1:4:31", vec!["0:1:1:1:14"]),
        ("0:1:4:33", vec!["0:1:1:1:12"]),
        ("0:1:4:34", vec!["0:1:1:1:14"]),
        ("0:1:4:36", vec!["0:1:1:1:12"]),
        ("0:1:4:37", vec!["0:1:1:1:14"]),
        ("0:1:4:44", vec!["0:1:1:1:12"]),
        ("0:1:4:47", vec!["0:1:1:1:12"]),
        ("0:1:4:49", vec!["0:1:1:1:14"]),
    ]
}
