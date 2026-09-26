use geospec_engine_native_core::backend::BackendErrorKind;
use geospec_engine_native_occt::{Document, SurfaceFacts, TopologyCounts};
use std::path::PathBuf;

// The bridge reports TopExp_Explorer traversal multiplicities. Each closed box
// has six one-wire faces, four edge uses per face, and two endpoint uses per
// edge use. Historical unique-entity evidence was 12 edges and 8 vertices per
// box; those counts describe a different topology profile.
fn topology_multiplicities(value: TopologyCounts) -> [usize; 6] {
    [
        value.solids,
        value.shells,
        value.faces,
        value.wires,
        value.edges,
        value.vertices,
    ]
}

fn box_topology_multiplicities(boxes: usize) -> [usize; 6] {
    let faces = boxes * 6;
    let edge_uses = faces * 4;
    [boxes, boxes, faces, faces, edge_uses, edge_uses * 2]
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
        topology_multiplicities(facts.shape.topology),
        box_topology_multiplicities(1)
    );
    assert_eq!(facts.faces.len(), 6);
    assert_eq!(
        facts
            .faces
            .iter()
            .map(|face| face.index)
            .collect::<Vec<_>>(),
        vec![0, 1, 2, 3, 4, 5]
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
        (0, 0x4082_c000_0000_0000_u64),
        (1, 0x4082_c000_0000_0000),
        (2, 0x4072_c000_0000_0000),
        (3, 0x4072_c000_0000_0000),
        (4, 0x4068_ffff_ffff_ffff),
        (5, 0x4068_ffff_ffff_ffff),
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
        topology_multiplicities(facts.shape.topology),
        box_topology_multiplicities(1)
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
        topology_multiplicities(facts.shape.topology),
        box_topology_multiplicities(2)
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
fn nist_document_retains_bspline_faces() {
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
