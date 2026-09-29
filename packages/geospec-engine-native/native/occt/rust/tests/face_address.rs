use geospec_engine_native_occt::{
    BrepEntity, BrepSubject, ContinuousWallShape, Document, PointState, SurfaceFacts,
};
use std::path::PathBuf;

fn fixture(name: &str) -> Vec<u8> {
    std::fs::read(
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("tests/fixtures")
            .join(name),
    )
    .expect("preserved AP242 fixture")
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

fn private_face(entity: BrepEntity) -> u32 {
    match entity {
        BrepEntity::WholeFace(face) | BrepEntity::Face { face, .. } => face,
        _ => panic!("located face must retain a private query address"),
    }
}

fn addresses(faces: &[geospec_engine_native_occt::LocatedFace]) -> Vec<(u32, u32)> {
    faces
        .iter()
        .map(|face| (face.facts.index, private_face(face.entity)))
        .collect()
}

fn close(actual: f64, expected: f64) {
    assert!((actual - expected).abs() <= 1e-6, "{actual} != {expected}");
}

fn surface(face: &geospec_engine_native_occt::LocatedFace) -> &'static str {
    match &face.facts.surface {
        SurfaceFacts::Plane { .. } => "plane",
        SurfaceFacts::Cylinder { .. } => "cylinder",
        SurfaceFacts::Cone { .. } => "cone",
        SurfaceFacts::Sphere { .. } => "sphere",
        SurfaceFacts::Torus { .. } => "torus",
        SurfaceFacts::Bezier { .. } => "bezier",
        SurfaceFacts::Bspline { .. } => "bspline",
        SurfaceFacts::Revolution => "revolution",
        SurfaceFacts::Extrusion => "extrusion",
        SurfaceFacts::Offset => "offset",
        SurfaceFacts::Other => "other",
    }
}

fn observe(source: &str, document: &Document) {
    let occurrences = document.source_occurrence_structure().unwrap();
    if occurrences.is_empty() {
        for (source_order, face) in document.faces().unwrap().iter().enumerate() {
            eprintln!(
                "FACE_ADDRESS source={source} occurrence=whole sourceOrder={source_order} public={} private={} surface={} reversed={}",
                face.facts.index,
                private_face(face.entity),
                surface(face),
                face.reversed,
            );
        }
        return;
    }
    let faces = document.reported_faces(false).unwrap().occurrence_faces;
    for (row, faces) in occurrences.iter().zip(faces) {
        for (source_order, face) in faces.iter().enumerate() {
            eprintln!(
                "FACE_ADDRESS source={source} occurrence={} sourceOrder={source_order} public={} private={} surface={} reversed={}",
                row.path,
                face.facts.index,
                private_face(face.entity),
                surface(face),
                face.reversed,
            );
        }
    }
}

#[test]
fn public_axis_ordinal_is_separate_from_its_private_query_address() {
    let document = Document::from_step(&fixture("ap242-radius1-height10.step")).unwrap();
    observe("ap242-radius1-height10.step", &document);

    let faces = document.faces().unwrap();
    let axis = faces
        .iter()
        .find(|face| matches!(&face.facts.surface, SurfaceFacts::Cylinder { .. }))
        .expect("retained rod must expose its cylindrical face");
    assert_eq!(axis.facts.index, 0);
    assert_eq!(axis.entity, BrepEntity::WholeFace(1));
    let extent = document.cylinder_axial_extent(axis.entity).unwrap();
    assert_eq!(extent.origin, [0.0, 0.0, 0.0]);
    assert_eq!(extent.axis, [0.0, 0.0, 1.0]);
    assert_eq!(extent.radius, 1.0);
    assert!((extent.from - 0.0).abs() <= 1e-12);
    assert!((extent.to - 10.0).abs() <= 1e-12);
    assert_eq!(
        faces
            .iter()
            .map(|face| face.facts.index)
            .collect::<Vec<_>>(),
        (0..faces.len() as u32).collect::<Vec<_>>()
    );
}

#[test]
fn report_copy_preserves_public_order_and_private_selected_domain_addresses() {
    let document = Document::from_step(&fixture("two-cube-assembly.step")).unwrap();
    observe("two-cube-assembly.step", &document);

    let whole = document.faces().unwrap();
    let report = document.reported_faces(true).unwrap();
    assert_eq!(addresses(&whole), addresses(&report.whole_faces));
    assert_eq!(report.occurrence_faces.len(), 2);
    for (occurrence, faces) in report.occurrence_faces.iter().enumerate() {
        assert_eq!(
            faces
                .iter()
                .map(|face| face.facts.index)
                .collect::<Vec<_>>(),
            (0..faces.len() as u32).collect::<Vec<_>>()
        );

        let selected = document
            .selected_continuous_domain(occurrence as u32)
            .unwrap();
        eprintln!(
            "FACE_CERTIFICATE source=two-cube-assembly.step occurrence={occurrence} privateFaces={:?} privateEdges={:?}",
            selected.domain_face_to_occurrence_face,
            selected.domain_edge_to_occurrence_edge,
        );
        assert_eq!(
            selected.domain_face_to_occurrence_face,
            vec![1, 2, 3, 4, 5, 6]
        );
        assert_eq!(
            selected.domain_edge_to_occurrence_edge,
            vec![1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
        );
        assert!(matches!(
            selected.domain.domain,
            ContinuousWallShape::AxisAlignedBox { .. }
        ));
    }
}

#[test]
fn named_interface_joins_the_actual_located_public_face() {
    let document = Document::from_step(&workspace_fixture(
        "packages/geospec-engine/fixtures/selector/second-producer-transformed/model.step",
    ))
    .unwrap();
    observe("selector/second-producer-transformed/model.step", &document);

    let rows = document.document_rows().unwrap();
    let subshape = rows
        .subshapes
        .iter()
        .find(|shape| shape.occurrence_path == "cubeB" && shape.name == "face.b")
        .expect("cubeB.face.b must retain its authored association");
    let occurrence = subshape.occurrence.unwrap();
    let public = subshape.face_index.unwrap();
    let faces = document.reported_faces(true).unwrap().occurrence_faces;
    let face = faces[occurrence as usize]
        .iter()
        .find(|face| face.facts.index == public)
        .expect("authored public index must resolve to its located face");
    let SurfaceFacts::Plane { origin, normal } = &face.facts.surface else {
        panic!("cubeB.face.b must retain planar support")
    };
    assert_eq!(normal.map(f64::to_bits), [0, 1.0_f64.to_bits(), 0]);
    close(
        origin[0] * normal[0] + origin[1] * normal[1] + origin[2] * normal[2],
        5.0,
    );
    for (actual, expected) in face.facts.center_of_mass.into_iter().zip([30.0, 5.0, 0.0]) {
        close(actual, expected);
    }
    assert_eq!(
        document
            .classify_face_points(face.entity, &[[30.0, 5.0, 0.0]], 1e-6)
            .unwrap(),
        vec![PointState::In]
    );
}
