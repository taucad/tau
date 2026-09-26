use geospec_engine_native_occt::{
    BrepEntity, BrepSubject, Document, PointState, SurfaceFacts, TessellationProfile, WallOptions,
    WallThicknessOutcome,
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

fn workspace_fixture(relative: &str) -> Vec<u8> {
    let workspace = std::env::var_os("GEOSPEC_ADAPTER_WORKSPACE")
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .ancestors()
                .nth(5)
                .expect("OCCT crate must remain below the workspace root")
                .to_path_buf()
        });
    std::fs::read(workspace.join(relative)).expect("workspace fixture must be readable")
}

fn close(actual: f64, expected: f64, tolerance: f64) {
    assert!(
        (actual - expected).abs() <= tolerance,
        "expected {expected} ± {tolerance}, got {actual}"
    );
}

#[test]
fn retained_box_exercises_whole_faces_trim_validity_wall_and_mesh_transfer() {
    let document = Document::from_step(&fixture("ap242-box.step")).unwrap();
    let facts = document.facts().unwrap();
    let faces = BrepSubject::faces(&document).unwrap();

    assert_eq!(facts.source_length_unit, "millimetre");
    assert_eq!(
        facts.source_unit_to_millimeters.to_bits(),
        1.0_f64.to_bits()
    );
    assert_eq!(faces.len(), 6);
    assert_eq!(
        faces
            .iter()
            .map(|face| (face.facts.index, face.facts.area.to_bits()))
            .collect::<Vec<_>>(),
        vec![
            (0, 0x4082_c000_0000_0000),
            (1, 0x4082_c000_0000_0000),
            (2, 0x4072_c000_0000_0000),
            (3, 0x4072_c000_0000_0000),
            (4, 0x4068_ffff_ffff_ffff),
            (5, 0x4068_ffff_ffff_ffff),
        ]
    );
    assert!(faces.iter().all(|face| {
        face.bounds.min.iter().all(|value| value.is_finite())
            && face.bounds.max.iter().all(|value| value.is_finite())
    }));

    let first = &faces[0];
    let SurfaceFacts::Plane { normal, .. } = first.facts.surface else {
        panic!("box face must be planar")
    };
    let center = first.facts.center_of_mass;
    let off_surface = [
        center[0] + normal[0] * 0.01,
        center[1] + normal[1] * 0.01,
        center[2] + normal[2] * 0.01,
    ];
    assert_eq!(
        document
            .classify_face_points(first.entity, &[center, off_surface], 1e-6)
            .unwrap(),
        vec![PointState::In, PointState::Out]
    );

    let validity = document.validity().unwrap();
    assert!(validity.valid);
    assert_eq!(validity.solid_count, Some(1));
    assert_eq!(validity.invalid_solid_count, Some(0));
    assert_eq!(validity.open_edge_count, Some(0));
    assert_eq!(validity.closed_solids, Some(true));

    let wall = document
        .minimum_wall_thickness(&WallOptions {
            work_unit_budget: 100_000,
            mesh_linear_tolerance_mm: 0.02,
            mesh_angular_tolerance_degrees: 0.5,
        })
        .unwrap();
    let WallThicknessOutcome::Measured(wall) = wall else {
        panic!("closed box must yield measured wall evidence")
    };
    assert_eq!(wall.value.to_bits(), 10.0_f64.to_bits());
    assert!(wall.point_a.is_some());
    assert!(wall.point_b.is_some());
    assert!(wall.support_a.as_ref().unwrap().face_index.is_some());
    assert!(wall.support_b.as_ref().unwrap().face_index.is_some());

    let profile = TessellationProfile {
        linear_deflection_mm: 0.1,
        angular_deflection_rad: 0.5,
    };
    let mesh = BrepSubject::tessellate(&document, BrepEntity::Whole, profile).unwrap();
    assert_eq!(mesh.positions.len(), 8);
    assert_eq!(mesh.triangles.len(), 12);

    let face_mesh = BrepSubject::tessellate(&document, first.entity, profile).unwrap();
    assert_ne!(mesh.triangles.len(), face_mesh.triangles.len());
}

#[test]
fn retained_assembly_exercises_paths_transforms_topology_and_exact_queries() {
    let document = Document::from_step(&fixture("two-cube-assembly.step")).unwrap();
    let facts = document.facts().unwrap();

    assert_eq!(facts.occurrences.len(), 2);
    assert!(facts.occurrences.iter().all(|occurrence| {
        !occurrence.path.is_empty()
            && occurrence.parent.is_none()
            && (occurrence.product as usize) < facts.products.len()
            && !occurrence.product_name.is_empty()
            && occurrence.ordinal_path.len() == 1
    }));
    assert_eq!(
        facts.occurrences[0].placement[3].to_bits(),
        0.0_f64.to_bits()
    );
    assert_eq!(
        facts.occurrences[1].placement[3].to_bits(),
        30.0_f64.to_bits()
    );

    let faces = document.occurrence_faces(0).unwrap();
    let edges = document.occurrence_edges(0).unwrap();
    assert_eq!(faces.len(), 6);
    assert_eq!(edges.len(), 12);
    assert!(faces.iter().all(|face| {
        !face.edge_indices.is_empty()
            && face
                .edge_indices
                .iter()
                .all(|index| *index > 0 && *index as usize <= edges.len())
    }));
    assert!(edges.iter().all(|edge| edge.length > 0.0));
    let boundary_edge = &edges[(faces[0].edge_indices[0] - 1) as usize];
    assert_eq!(
        document
            .classify_face_points(faces[0].entity, &[boundary_edge.start], 1e-6)
            .unwrap(),
        vec![PointState::On]
    );

    let extrema = document
        .extrema(BrepEntity::Occurrence(0), BrepEntity::Occurrence(1))
        .unwrap();
    assert_eq!(extrema.distance.to_bits(), 20.0_f64.to_bits());
    close(extrema.point_a[0], 5.0, 1e-9);
    close(extrema.point_b[0], 25.0, 1e-9);

    assert_eq!(
        document
            .classify_points(0, &[[0.0, 0.0, 0.0], [5.0, 0.0, 0.0], [6.0, 0.0, 0.0]])
            .unwrap(),
        vec![PointState::In, PointState::On, PointState::Out]
    );
    let common = document.common_volume(0, 1).unwrap();
    assert_eq!(common.volume.to_bits(), 0.0_f64.to_bits());
    assert_eq!(common.centroid.map(f64::to_bits), [0, 0, 0]);

    let profile = TessellationProfile {
        linear_deflection_mm: 0.1,
        angular_deflection_rad: 0.5,
    };
    let mesh = BrepSubject::tessellate(&document, BrepEntity::Occurrence(0), profile).unwrap();
    assert_eq!(mesh.triangles.len(), 12);

    assert!(matches!(
        document
            .minimum_wall_thickness(&WallOptions {
                work_unit_budget: 1,
                mesh_linear_tolerance_mm: 0.02,
                mesh_angular_tolerance_degrees: 0.5,
            })
            .unwrap(),
        WallThicknessOutcome::BudgetExceeded {
            consumed: 1,
            limit: 1
        }
    ));
}

#[test]
fn retained_inch_fixture_preserves_source_units() {
    let document = Document::from_step(&fixture("inch-cube.step")).unwrap();
    let facts = document.facts().unwrap();
    assert_eq!(facts.source_length_unit, "INCH");
    assert_eq!(
        facts.source_unit_to_millimeters.to_bits(),
        25.4_f64.to_bits()
    );
    assert_eq!(facts.shape.bounds.min.map(f64::to_bits), [0, 0, 0]);
    assert_eq!(
        facts.shape.bounds.max.map(f64::to_bits),
        [25.4_f64.to_bits(); 3]
    );
}

#[test]
fn retained_ap242_fixture_preserves_analytic_and_semantic_facts() {
    let document = Document::from_step(&fixture("nist-pmi-bspline.step")).unwrap();
    let facts = document.facts().unwrap();

    assert_eq!(facts.faces.len(), 156);
    assert_eq!(
        facts
            .faces
            .iter()
            .filter(|face| matches!(face.surface, SurfaceFacts::Bspline { .. }))
            .count(),
        4
    );
    let mut datum_labels = facts
        .semantic_datums
        .iter()
        .map(|datum| datum.label.as_str())
        .collect::<Vec<_>>();
    datum_labels.sort_unstable();
    datum_labels.dedup();
    assert_eq!(datum_labels, vec!["A", "B", "C", "D"]);
    assert!(
        facts
            .semantic_datums
            .iter()
            .any(|datum| datum.label == "A" && !datum.face_indices.is_empty()),
        "semantic rows: {:#?}",
        facts.semantic_datums
    );
    assert!(facts.datum_placements.is_empty());
}

#[test]
fn retained_tessellation_profiles_are_independent_of_request_order() {
    let coarse = TessellationProfile {
        linear_deflection_mm: 1.0,
        angular_deflection_rad: 1.0,
    };
    let fine = TessellationProfile {
        linear_deflection_mm: 0.05,
        angular_deflection_rad: 0.1,
    };

    let coarse_first = Document::from_step(&fixture("nist-pmi-bspline.step")).unwrap();
    let coarse_a = BrepSubject::tessellate(&coarse_first, BrepEntity::Whole, coarse).unwrap();
    let fine_a = BrepSubject::tessellate(&coarse_first, BrepEntity::Whole, fine).unwrap();

    let fine_first = Document::from_step(&fixture("nist-pmi-bspline.step")).unwrap();
    let fine_b = BrepSubject::tessellate(&fine_first, BrepEntity::Whole, fine).unwrap();
    let coarse_b = BrepSubject::tessellate(&fine_first, BrepEntity::Whole, coarse).unwrap();

    assert_eq!(coarse_a.as_ref(), coarse_b.as_ref());
    assert_eq!(fine_a.as_ref(), fine_b.as_ref());
    assert!(fine_a.triangles.len() > coarse_a.triangles.len());
}

#[test]
fn retained_transformed_ap242_occurrence_locates_named_face_and_datum() {
    let document = Document::from_step(&workspace_fixture(
        "packages/geospec-engine/fixtures/selector/second-producer-transformed/model.step",
    ))
    .unwrap();
    let facts = document.facts().unwrap();

    let datum = facts
        .datum_placements
        .iter()
        .find(|datum| datum.occurrence_path == "cubeB" && datum.name == "frame")
        .expect("independently declared cubeB.frame datum must be retained");
    assert_eq!(datum.origin.map(f64::to_bits), [30.0_f64.to_bits(), 0, 0]);
    assert_eq!(datum.x_axis.map(f64::to_bits), [0, 1.0_f64.to_bits(), 0]);
    assert_eq!(datum.z_axis.map(f64::to_bits), [0, 0, 1.0_f64.to_bits()]);

    let subshape = facts
        .subshapes
        .iter()
        .find(|shape| shape.occurrence_path == "cubeB" && shape.name == "face.b")
        .expect("independently declared cubeB.face.b subshape must be retained");
    let occurrence = subshape
        .occurrence
        .expect("cubeB face must retain its occurrence association");
    let face_index = subshape
        .face_index
        .expect("cubeB face must retain its zero-based public face ordinal");
    let face = document
        .occurrence_faces(occurrence)
        .unwrap()
        .iter()
        .find(|face| face.facts.index == face_index)
        .cloned()
        .expect("named face index must resolve in the located occurrence");
    let SurfaceFacts::Plane { origin, normal } = face.facts.surface else {
        panic!("cubeB.face.b must retain planar support")
    };
    let offset = origin[0] * normal[0] + origin[1] * normal[1] + origin[2] * normal[2];
    assert_eq!(normal.map(f64::to_bits), [0, 1.0_f64.to_bits(), 0]);
    close(offset, 5.0, 1e-6);
    close(face.facts.area, 100.0, 1e-6);
    for (actual, expected) in face.facts.center_of_mass.into_iter().zip([30.0, 5.0, 0.0]) {
        close(actual, expected, 1e-6);
    }
}
