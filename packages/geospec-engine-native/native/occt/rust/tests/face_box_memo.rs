//! O3-02: one `AddOptimal` box per located face serves occurrence bounds
//! (F4) and the whole-face boxes read lazily (F6).

use geospec_engine_native_occt::{Bounds, BrepSubject, Document};
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
    for name in [
        "ap242-radius1-height10.step",
        "ap242-box.step",
        "two-cube-assembly.step",
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
        let shape = document.facts().unwrap().shape.bounds;
        assert_eq!(
            union(face_boxes(&document)),
            (shape.min, shape.max),
            "{name}"
        );
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

        // Roots cover the document: their union is the source shape box.
        let shape = occurrences_first.facts().unwrap().shape.bounds;
        let roots = occurrences.iter().filter(|row| row.parent.is_none());
        assert_eq!(
            union(roots.map(|row| row.bounds)),
            (shape.min, shape.max),
            "{name}"
        );
    }
}
