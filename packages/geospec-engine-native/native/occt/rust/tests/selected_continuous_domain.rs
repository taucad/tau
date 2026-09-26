use geospec_engine_native_core::backend::BackendErrorKind;
use geospec_engine_native_occt::{
    BrepEntity, BrepSubject, ContinuousWallDomain, ContinuousWallShape, Document,
    SelectedContinuousDomain,
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

fn selected_box(occurrence: u32, min_x: f64, max_x: f64) -> SelectedContinuousDomain {
    SelectedContinuousDomain {
        occurrence,
        domain: ContinuousWallDomain {
            maximum_topology_tolerance_mm: 1e-7,
            domain: ContinuousWallShape::AxisAlignedBox {
                corners: [
                    [min_x, -5.0, -5.0],
                    [min_x, -5.0, 5.0],
                    [min_x, 5.0, -5.0],
                    [min_x, 5.0, 5.0],
                    [max_x, -5.0, -5.0],
                    [max_x, -5.0, 5.0],
                    [max_x, 5.0, -5.0],
                    [max_x, 5.0, 5.0],
                ],
                face_indices: [1, 2, 3, 4, 5, 6],
                face_corner_indices: [
                    [0, 2, 6, 4],
                    [1, 5, 7, 3],
                    [0, 4, 5, 1],
                    [4, 6, 7, 5],
                    [2, 3, 7, 6],
                    [0, 1, 3, 2],
                ],
                outward_normals: [
                    [0.0, 0.0, -1.0],
                    [0.0, 0.0, 1.0],
                    [0.0, -1.0, 0.0],
                    [1.0, 0.0, 0.0],
                    [0.0, 1.0, 0.0],
                    [-1.0, 0.0, 0.0],
                ],
                opposite_face_pairs: [[6, 4], [3, 5], [1, 2]],
                edge_lengths: [10.0, 10.0, 10.0],
            },
        },
        domain_face_to_occurrence_face: vec![1, 2, 3, 4, 5, 6],
        domain_edge_to_occurrence_edge: vec![1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    }
}

fn selected_in_order(order: [u32; 2]) -> [SelectedContinuousDomain; 2] {
    let document = Document::from_step(&fixture("two-cube-assembly.step")).unwrap();
    let mut selected = order.map(|occurrence| {
        let actual = document.selected_continuous_domain(occurrence).unwrap();
        let expected = match occurrence {
            0 => selected_box(0, -5.0, 5.0),
            1 => selected_box(1, 25.0, 35.0),
            _ => unreachable!(),
        };
        eprintln!("SELECTED_CONTINUOUS order={order:?} occurrence={occurrence} actual={actual:#?}");
        assert_eq!(actual, expected);
        actual
    });
    selected.sort_by_key(|value| value.occurrence);
    selected
}

#[test]
fn selected_located_box_domains_preserve_complete_associations_and_query_order() {
    assert_eq!(selected_in_order([0, 1]), selected_in_order([1, 0]));
}

#[test]
fn selected_queries_preserve_whole_box_and_rod_disposition() {
    let box_document = Document::from_step(&fixture("ap242-box.step")).unwrap();
    let box_actual = box_document
        .continuous_wall_domain(BrepEntity::Whole)
        .unwrap();
    eprintln!("WHOLE_BOX actual={box_actual:#?}");
    assert_eq!(
        box_actual,
        ContinuousWallDomain {
            maximum_topology_tolerance_mm: 1e-7,
            domain: ContinuousWallShape::AxisAlignedBox {
                corners: [
                    [-5.0, -10.0, -15.0],
                    [-5.0, -10.0, 15.0],
                    [-5.0, 10.0, -15.0],
                    [-5.0, 10.0, 15.0],
                    [5.0, -10.0, -15.0],
                    [5.0, -10.0, 15.0],
                    [5.0, 10.0, -15.0],
                    [5.0, 10.0, 15.0],
                ],
                face_indices: [1, 2, 3, 4, 5, 6],
                face_corner_indices: [
                    [0, 1, 3, 2],
                    [4, 6, 7, 5],
                    [0, 4, 5, 1],
                    [2, 3, 7, 6],
                    [0, 2, 6, 4],
                    [1, 5, 7, 3],
                ],
                outward_normals: [
                    [-1.0, 0.0, 0.0],
                    [1.0, 0.0, 0.0],
                    [0.0, -1.0, 0.0],
                    [0.0, 1.0, 0.0],
                    [0.0, 0.0, -1.0],
                    [0.0, 0.0, 1.0],
                ],
                opposite_face_pairs: [[1, 2], [3, 4], [5, 6]],
                edge_lengths: [10.0, 20.0, 30.0],
            },
        }
    );

    let rod_document = Document::from_step(&fixture("ap242-radius1-height10.step")).unwrap();
    let error = rod_document
        .continuous_wall_domain(BrepEntity::Whole)
        .unwrap_err();
    eprintln!("WHOLE_ROD error={error:#?}");
    assert_eq!(error.kind, BackendErrorKind::Unsupported);
    assert_eq!(
        error.message,
        "Continuous cylinder requires a finite increasing axial interval and an exact full analytic U period."
    );
}
