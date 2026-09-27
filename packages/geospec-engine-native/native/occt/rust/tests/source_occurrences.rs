use geospec_engine_native_occt::{BrepSubject, Document};

#[test]
fn should_transfer_ordered_source_occurrences_without_report_preparation() {
    let document = Document::from_step(include_bytes!("fixtures/two-cube-assembly.step")).unwrap();
    let source = BrepSubject::source_occurrences(&document).unwrap();
    assert_eq!(source.len(), 2);
    assert_eq!(
        source
            .iter()
            .map(|row| row.path.as_str())
            .collect::<Vec<_>>(),
        ["cubeA", "cubeB"]
    );
    assert_eq!(source[0].ordinal_path, [1]);
    assert_eq!(source[1].ordinal_path, [2]);
    assert!(source.iter().all(|row| row.parent.is_none()));
    assert!(source.iter().all(|row| {
        row.placement.iter().all(|value| value.is_finite())
            && row.bounds.min.iter().all(|value| value.is_finite())
            && row.bounds.max.iter().all(|value| value.is_finite())
    }));

    // F10: source rows leave the unread XDE name empty.
    assert!(source.iter().all(|row| row.name.is_empty()));
    let expected_bounds = [
        ([-5.0, -5.0, -5.0], [5.0, 5.0, 5.0]),
        ([25.0, -5.0, -5.0], [35.0, 5.0, 5.0]),
    ];
    for (row, (min, max)) in source.iter().zip(expected_bounds) {
        assert_eq!(row.bounds.min, min);
        assert_eq!(row.bounds.max, max);
    }
    // V2: the whole-shape report box is the same exact AddOptimal fold, so it
    // is the union of the root occurrence boxes.
    let shape = document.reported_shape().unwrap();
    assert_eq!(shape.bounds.min, source[0].bounds.min);
    assert_eq!(shape.bounds.max, source[1].bounds.max);
}

#[test]
fn should_transfer_occurrence_structure_without_bounds() {
    let document = Document::from_step(include_bytes!("fixtures/two-cube-assembly.step")).unwrap();
    let structure = BrepSubject::source_occurrence_structure(&document).unwrap();
    let source = BrepSubject::source_occurrences(&document).unwrap();
    assert_eq!(structure.len(), source.len());
    for (structure_row, source_row) in structure.iter().zip(source.iter()) {
        assert!(structure_row
            .bounds
            .min
            .iter()
            .chain(&structure_row.bounds.max)
            .all(|value| value.is_nan()));
        let mut row = structure_row.clone();
        row.bounds = source_row.bounds;
        // Debug text keeps exact f64 values, signed zero included.
        assert_eq!(format!("{row:?}"), format!("{source_row:?}"));
    }
}
