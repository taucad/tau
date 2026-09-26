use geospec_engine_native_occt::{
    BrepConnector, BrepEntity, BrepSubject, Document, OcctConnector, SurfaceFacts,
    TessellationProfile,
};
use std::path::PathBuf;

const COARSE: TessellationProfile = TessellationProfile {
    linear_deflection_mm: 0.5,
    angular_deflection_rad: 0.8,
};
const FINE: TessellationProfile = TessellationProfile {
    linear_deflection_mm: 0.001,
    angular_deflection_rad: 0.05,
};
// V2 (ruling 4 (A)): the exact AddOptimal box of the source, without the
// 1e-7 shape tolerance the former report-copy `BRepBndLib::Add` box carried.
const SOURCE_REPORTED_WHOLE_MIN: [f64; 3] = [-5.0, -5.0, -5.0];
const SOURCE_REPORTED_WHOLE_MAX: [f64; 3] = [35.0, 5.0, 5.0];
const SOURCE_REPORTED_OCCURRENCE_BOUNDS: [([f64; 3], [f64; 3]); 2] = [
    ([-5.0, -5.0, -5.0], [5.0, 5.0, 5.0]),
    ([25.0, -5.0, -5.0], [35.0, 5.0, 5.0]),
];

fn fixture(name: &str) -> Vec<u8> {
    std::fs::read(
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("tests/fixtures")
            .join(name),
    )
    .expect("retained fixture must be readable")
}

fn fnv1a64(bytes: &[u8]) -> u64 {
    bytes.iter().fold(0xcbf2_9ce4_8422_2325, |hash, byte| {
        (hash ^ u64::from(*byte)).wrapping_mul(0x0000_0100_0000_01b3)
    })
}

fn mesh_hash(mesh: &geospec_engine_native_core::backend::TriangleMesh) -> u64 {
    let mut bytes = Vec::with_capacity(
        mesh.positions.len() * std::mem::size_of::<[f64; 3]>()
            + mesh.triangles.len() * std::mem::size_of::<[u32; 3]>(),
    );
    for point in &mesh.positions {
        for value in point {
            bytes.extend_from_slice(&value.to_bits().to_le_bytes());
        }
    }
    for triangle in &mesh.triangles {
        for value in triangle {
            bytes.extend_from_slice(&value.to_le_bytes());
        }
    }
    fnv1a64(&bytes)
}

/// Every report facet as Debug text (exact f64 values, NaN and signed zeros).
fn facets(document: &Document) -> String {
    format!(
        "{:?}\n{:?}\n{:?}\n{:?}",
        document.reported_shape().unwrap(),
        document.reported_faces(true).unwrap(),
        document.source_occurrences().unwrap(),
        document.reported_mesh().unwrap(),
    )
}

fn run_query_order(first: TessellationProfile, second: TessellationProfile, label: &str) {
    let document = Document::from_step(&fixture("two-cube-assembly.step")).unwrap();
    let nominal_occurrences = document.source_occurrences().unwrap();
    let nominal_faces = document.faces().unwrap();

    let first_mesh = BrepSubject::tessellate(&document, BrepEntity::Whole, first).unwrap();
    let first_hash = mesh_hash(&first_mesh);
    let shape = document.reported_shape().unwrap();
    let mesh = document.reported_mesh().unwrap();
    let second_mesh = BrepSubject::tessellate(&document, BrepEntity::Whole, second).unwrap();

    // Whole faces carry unmeasured (NaN) boxes (F6); Debug text compares them.
    assert_eq!(
        format!("{:?}", document.source_occurrences().unwrap()),
        format!("{nominal_occurrences:?}")
    );
    assert_eq!(
        format!("{:?}", document.faces().unwrap()),
        format!("{nominal_faces:?}")
    );
    // The two roots' source boxes span the nominal whole box.
    assert_eq!(
        nominal_occurrences[0].bounds.min.map(f64::to_bits),
        [(-5.0_f64).to_bits(); 3]
    );
    assert_eq!(
        nominal_occurrences[1].bounds.max.map(f64::to_bits),
        [35.0_f64.to_bits(), 5.0_f64.to_bits(), 5.0_f64.to_bits()]
    );
    assert_eq!(shape.bounds.min, SOURCE_REPORTED_WHOLE_MIN);
    assert_eq!(shape.bounds.max, SOURCE_REPORTED_WHOLE_MAX);
    assert_eq!(mesh.positions.len(), 72);
    assert_eq!(mesh.triangles.len(), 24);
    assert_eq!(
        mesh.triangles.first(),
        Some(&[0, 1, 2]),
        "reported mesh is source-order triangle soup"
    );
    assert_eq!(
        mesh.triangles.last(),
        Some(&[69, 70, 71]),
        "reported mesh is source-order triangle soup"
    );
    assert_eq!(first_mesh, second_mesh);

    eprintln!(
        "query-order={label} nominal-occurrences-fnv1a64={:016x} report-shape-fnv1a64={:016x} report-mesh-fnv1a64={:016x} query-mesh-fnv1a64={first_hash:016x}",
        fnv1a64(format!("{nominal_occurrences:?}").as_bytes()),
        fnv1a64(format!("{shape:?}").as_bytes()),
        mesh_hash(&mesh),
    );
}

#[test]
fn streamed_compound_validation_preserves_original_and_meshed_facts() {
    let document = Document::from_step(&fixture("two-cube-assembly.step")).unwrap();
    let shape = document.reported_shape().unwrap();
    // Validity is the source proof; the report facts carry none (F2).
    assert!(document.validity().unwrap().valid);
    assert_eq!(shape.topology.solids, 2);
    assert_eq!(shape.topology.faces, 12);
    assert_eq!(shape.bounds.min, SOURCE_REPORTED_WHOLE_MIN);
    assert_eq!(shape.bounds.max, SOURCE_REPORTED_WHOLE_MAX);
    assert_eq!(document.reported_mesh().unwrap().triangles.len(), 24);
}

#[test]
fn original_validation_reuse_preserves_complete_facts_across_query_orders() {
    let bytes = fixture("two-cube-assembly.step");
    let expected = geospec_engine_native_core::backend::brep::ValidityFacts {
        valid: true,
        checks: None,
        max_tolerance: Some(1e-7),
        free_bounds: Some(0),
        small_edges: None,
        same_parameter: Some(true),
        closed_shells: Some(true),
        closed_solids: Some(true),
        solid_count: Some(2),
        invalid_solid_count: Some(0),
        open_edge_count: Some(0),
        closed_wires: Some(true),
        reason: None,
    };

    let direct = Document::from_step(&bytes).unwrap();
    let direct_validity = direct.validity().unwrap();

    let reported = Document::from_step(&bytes).unwrap();
    facets(&reported);
    BrepSubject::tessellate(&reported, BrepEntity::Whole, COARSE).unwrap();
    let reported_validity = reported.validity().unwrap();

    for actual in [direct_validity, reported_validity] {
        assert_eq!(actual.as_ref(), &expected);
        assert_eq!(
            actual.max_tolerance.map(f64::to_bits),
            Some(1e-7_f64.to_bits())
        );
    }
}

#[test]
fn fixed_report_bundle_preserves_nominal_queries_and_copy_history_entities() {
    let connector = OcctConnector;
    let identity = connector.identity_profile();
    assert_eq!(
        identity.ingest_profile,
        "geospec-step-xde-report-authored-v5"
    );
    assert_eq!(
        identity.backend_profile,
        "occt-8.1.0-dev1-3d097a-report-authored-v5"
    );

    let document = Document::from_step(&fixture("two-cube-assembly.step")).unwrap();
    let admission = document.admission_facts().unwrap();
    assert_eq!(admission.source_length_unit, "millimetre");
    assert_eq!(
        admission.source_unit_to_millimeters.to_bits(),
        1.0_f64.to_bits()
    );
    assert_eq!(admission.occurrence_count, 2);

    let first = facets(&document);
    assert_eq!(facets(&document), first);

    let shape = document.reported_shape().unwrap();
    let faces = document.reported_faces(true).unwrap();
    let occurrences = document.source_occurrences().unwrap();
    assert_eq!(shape.bounds.min, SOURCE_REPORTED_WHOLE_MIN);
    assert_eq!(shape.bounds.max, SOURCE_REPORTED_WHOLE_MAX);
    assert_eq!(faces.whole_faces.len(), 12);
    assert_eq!(faces.occurrence_faces.len(), 2);
    for (occurrence, ((expected_min, expected_max), faces)) in SOURCE_REPORTED_OCCURRENCE_BOUNDS
        .iter()
        .zip(faces.occurrence_faces.iter())
        .enumerate()
    {
        assert_eq!(occurrences[occurrence].bounds.min, *expected_min);
        assert_eq!(occurrences[occurrence].bounds.max, *expected_max);
        assert_eq!(faces.len(), 6);
        for (face, expected_index) in faces.iter().zip(1_u32..) {
            assert_eq!(
                face.entity,
                BrepEntity::Face {
                    occurrence: occurrence as u32,
                    face: expected_index,
                }
            );
            assert!(face
                .facts
                .center_of_mass
                .iter()
                .zip(face.bounds.min.iter().zip(face.bounds.max.iter()))
                .all(|(center, (min, max))| center >= min && center <= max));
        }
    }
    for (face, expected_index) in faces.whole_faces.iter().zip(1_u32..) {
        assert_eq!(face.entity, BrepEntity::WholeFace(expected_index));
    }

    eprintln!(
        "repeat-report facets-fnv1a64={:016x}",
        fnv1a64(first.as_bytes())
    );

    run_query_order(COARSE, FINE, "coarse-fine");
    run_query_order(FINE, COARSE, "fine-coarse");
}

#[test]
fn curved_profile_order_preserves_fixed_report_and_nominal_queries() {
    let bytes = fixture("ap242-radius1-height10.step");
    let baseline = Document::from_step(&bytes).unwrap();
    let nominal_faces = baseline.faces().unwrap();
    let fixed = facets(&baseline);
    let fixed_mesh = baseline.reported_mesh().unwrap();
    for (label, first, second) in [("coarse-fine", COARSE, FINE), ("fine-coarse", FINE, COARSE)] {
        let document = Document::from_step(&bytes).unwrap();
        let first_mesh = BrepSubject::tessellate(&document, BrepEntity::Whole, first).unwrap();
        let report_between = facets(&document);
        let second_mesh = BrepSubject::tessellate(&document, BrepEntity::Whole, second).unwrap();
        assert_ne!(
            first_mesh.triangles.len(),
            second_mesh.triangles.len(),
            "curved profiles must exercise distinct triangulations"
        );
        assert_ne!(mesh_hash(&first_mesh), mesh_hash(&second_mesh));
        let report_after = facets(&document);
        for report in [&report_between, &report_after] {
            assert_eq!(report, &fixed);
        }
        assert_eq!(
            format!("{:?}", document.faces().unwrap()),
            format!("{nominal_faces:?}")
        );
        eprintln!("curved-order={label} first-triangles={} second-triangles={} fixed-report-triangles={} fixed-report-fnv={:016x}", first_mesh.triangles.len(), second_mesh.triangles.len(), fixed_mesh.triangles.len(), mesh_hash(&fixed_mesh));
    }
}

#[test]
fn reported_faces_preserve_oriented_surfaces_and_analytic_cap_bounds() {
    let document = Document::from_step(&fixture("two-cube-assembly.step")).unwrap();
    let nominal = document.faces().unwrap();
    let report = document.reported_faces(true).unwrap();
    assert!(nominal.iter().any(|face| face.reversed));
    assert_eq!(nominal.len(), report.whole_faces.len());
    for (source, reported) in nominal.iter().zip(report.whole_faces.iter()) {
        assert_eq!(reported.facts.index, source.facts.index);
        assert_eq!(reported.reversed, source.reversed);
        assert_eq!(reported.facts.surface, source.facts.surface);
    }
    for faces in &report.occurrence_faces {
        let mut directions = [[false; 2]; 3];
        for face in faces.iter() {
            let SurfaceFacts::Plane { normal, .. } = &face.facts.surface else {
                panic!("cube faces must remain planar");
            };
            let normal = normal.map(|value| if face.reversed { -value } else { value });
            let axis = normal.iter().position(|value| value.abs() == 1.0).unwrap();
            assert!(normal
                .iter()
                .enumerate()
                .all(|(index, value)| index == axis || *value == 0.0));
            directions[axis][usize::from(normal[axis] > 0.0)] = true;
        }
        assert_eq!(directions, [[true; 2]; 3]);
    }

    let rod = Document::from_step(&fixture("ap242-radius1-height10.step")).unwrap();
    let report = rod.reported_faces(true).unwrap();
    let cap = report
        .whole_faces
        .iter()
        .find(|face| {
            matches!(face.facts.surface, SurfaceFacts::Plane { .. })
                && face.facts.center_of_mass[2] == 0.0
        })
        .expect("radius-one rod has a planar cap at z=0");
    assert_eq!(cap.bounds.min[2], -1e-7);
    assert_eq!(cap.bounds.max[2], 1e-7);
}

#[test]
fn should_retain_step_reader_metadata_from_the_original_input() {
    let bytes = fixture("two-cube-assembly.step");
    let document = Document::from_step(&bytes).unwrap();
    let metadata = document.step_subject_metadata().unwrap().unwrap();
    assert_eq!(metadata.source_byte_length, bytes.len());
    assert_eq!(
        metadata.schema.as_deref(),
        Some("AP242_MANAGED_MODEL_BASED_3D_ENGINEERING_MIM_LF { 1 0 10303 442 3 1 4 }")
    );
    assert_eq!(metadata.free_shape_count, 0);
    assert!(metadata.native_read_stream);
    assert_eq!(document.step_subject_metadata().unwrap().unwrap(), metadata);
    eprintln!("step-reader-metadata={metadata:?}");
}
