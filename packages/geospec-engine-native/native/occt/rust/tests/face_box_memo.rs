//! O3-02: one `AddOptimal` box per located face serves occurrence bounds
//! (F4), the whole-face boxes read lazily (F6) and the whole-shape bounds (V2).

use geospec_engine_native_occt::{Bounds, BrepSubject, Document, ShapeParts};
use std::path::PathBuf;

fn fixture(name: &str) -> Vec<u8> {
    std::fs::read(
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("tests/fixtures")
            .join(name),
    )
    .expect("retained fixture must be readable")
}

fn union(boxes: impl IntoIterator<Item = Bounds>) -> ([f64; 3], [f64; 3]) {
    boxes.into_iter().fold(
        ([f64::INFINITY; 3], [f64::NEG_INFINITY; 3]),
        |(min, max), value| {
            (
                std::array::from_fn(|axis| min[axis].min(value.min[axis])),
                std::array::from_fn(|axis| max[axis].max(value.max[axis])),
            )
        },
    )
}

fn face_boxes(document: &Document) -> Vec<Bounds> {
    (0..document.faces().unwrap().len() as u32)
        .map(|face| document.face_optimal_bounds(face).unwrap())
        .collect()
}

#[test]
fn whole_face_boxes_are_read_lazily_and_fold_to_the_shape_box() {
    // Solids without free edges or vertices: AddOptimal folds exactly these
    // per-face boxes into the source shape box.
    for (name, shape) in [
        (
            "ap242-radius1-height10.step",
            ([-1.0, -1.0, 0.0], [1.0, 1.0, 10.0]),
        ),
        ("ap242-box.step", ([-5.0, -10.0, -15.0], [5.0, 10.0, 15.0])),
        (
            "two-cube-assembly.step",
            ([-5.0, -5.0, -5.0], [35.0, 5.0, 5.0]),
        ),
    ] {
        let document = Document::from_step(&fixture(name)).unwrap();
        assert!(
            document.faces().unwrap().iter().all(|face| face
                .bounds
                .min
                .iter()
                .chain(&face.bounds.max)
                .all(|value| value.is_nan())),
            "{name}: whole faces carry no box until one is read"
        );
        assert_eq!(union(face_boxes(&document)), shape, "{name}");
    }
}

#[test]
fn occurrence_and_face_boxes_are_bit_equal_in_either_demand_order() {
    // The distance source places one cube definition twice: equal TShapes at
    // different locations must keep separate memo entries.
    for name in [
        "two-cube-assembly.step",
        "parallel-plane-distance-source.step",
        "finite-contact/assets/4cfa4bc016587e62cc1d8e7a3910498e790b3798bfb0c0e0278954ae05765233.step",
    ] {
        let bytes = fixture(name);
        let occurrences_first = Document::from_step(&bytes).unwrap();
        let occurrences = occurrences_first.source_occurrences().unwrap();
        // Debug text keeps exact f64 values, signed zero included.
        let expected = format!("{occurrences:?}\n{:?}", face_boxes(&occurrences_first));

        let faces_first = Document::from_step(&bytes).unwrap();
        let boxes = face_boxes(&faces_first);
        let actual = format!("{:?}\n{boxes:?}", faces_first.source_occurrences().unwrap());
        assert_eq!(actual, expected, "{name}");

        // Roots cover the document: their union is the whole-face box fold.
        let roots = occurrences.iter().filter(|row| row.parent.is_none());
        assert_eq!(
            union(roots.map(|row| row.bounds)),
            union(face_boxes(&occurrences_first)),
            "{name}"
        );
    }
}

#[test]
fn free_edges_and_vertices_fold_into_the_whole_shape_and_occurrence_boxes() {
    // AddOptimal folds the face boxes, then the edges outside faces, then the
    // vertices outside edges. The fixture: 20 BSpline spheres of radius 1
    // centred on x = 0, 3, ..., 57, a free edge (-2,-6,1)-(4,-3,9) and a
    // free vertex (-5,4,-3). The expected bits are BRepBndLib::AddOptimal of
    // the admitted shape itself, captured by the W2-BOUNDS probe (memo and
    // direct bit-equal); the edge sets min y and max z, the vertex min x,
    // max y and min z.
    let min = [-5.0_f64, -6.0, -3.0].map(f64::to_bits);
    let max = [
        0x404d_0000_00d6_bf96,
        4.0_f64.to_bits(),
        0x4022_0000_0000_0021,
    ];
    let bytes = fixture("bounds-free-edges.step");
    let document = Document::from_step(&bytes).unwrap();
    let whole = document
        .reported_shape_parts(ShapeParts::BOUNDS)
        .unwrap()
        .bounds;
    assert_eq!(whole.min.map(f64::to_bits), min);
    assert_eq!(whole.max.map(f64::to_bits), max);

    // Occurrences first: the edge and vertex occurrences take the same fold,
    // and the roots cover the document.
    let document = Document::from_step(&bytes).unwrap();
    let occurrences = document.source_occurrences().unwrap();
    let roots = occurrences.iter().filter(|row| row.parent.is_none());
    let (union_min, union_max) = union(roots.map(|row| row.bounds));
    assert_eq!(union_min.map(f64::to_bits), min);
    assert_eq!(union_max.map(f64::to_bits), max);
    let whole = document
        .reported_shape_parts(ShapeParts::BOUNDS)
        .unwrap()
        .bounds;
    assert_eq!(whole.min.map(f64::to_bits), min);
    assert_eq!(whole.max.map(f64::to_bits), max);
}
