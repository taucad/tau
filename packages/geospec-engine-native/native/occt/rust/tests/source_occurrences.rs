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
    let report = document.reported_facts_and_mesh().unwrap();
    assert_eq!(report.facts.occurrences.len(), source.len());
    let expected_bounds = [
        ([-5.0, -5.0, -5.0], [5.0, 5.0, 5.0]),
        ([25.0, -5.0, -5.0], [35.0, 5.0, 5.0]),
    ];
    for (index, (source_row, report_row)) in source
        .iter()
        .zip(report.facts.occurrences.iter())
        .enumerate()
    {
        assert_eq!(source_row.path, report_row.path);
        assert_eq!(source_row.ordinal_path, report_row.ordinal_path);
        assert_eq!(source_row.parent, report_row.parent);
        assert_eq!(source_row.product, report_row.product);
        assert_eq!(
            source_row.placement.map(f64::to_bits),
            report_row.placement.map(f64::to_bits)
        );
        assert_eq!(source_row.bounds.min, expected_bounds[index].0);
        assert_eq!(source_row.bounds.max, expected_bounds[index].1);
        assert_eq!(report_row.bounds.min, expected_bounds[index].0);
        assert_eq!(report_row.bounds.max, expected_bounds[index].1);
    }
    // The occurrence boxes happen to match bit-for-bit here; the whole-shape
    // report box has its separate tolerance expansion.
    assert_ne!(source[0].bounds.min, report.facts.shape.bounds.min);
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
