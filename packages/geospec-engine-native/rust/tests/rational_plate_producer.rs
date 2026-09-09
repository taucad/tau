//! Ordinary admitted subjects only. Expectations were declared in the producer
//! lane before authoring; these tests do not import a verifier or candidate data.

use geospec_engine_native_core::certificates::plate_contract::{
    Box3, MaterialWitnesses, PlaneLists, PlateAnalysis, PlateCertificate, Point3, PredicateValues,
    RationalText, RawPlate,
};
use geospec_engine_native_core::certificates::rational_plate::{admit, produce};

#[test]
fn exact_target_preserves_source_order_and_complete_certificate() {
    let mut raw = target();
    // Equivalent geometry retains its actual source order independently of planes.
    raw.windows.reverse();
    check(raw, target_analysis());
}

#[test]
fn mirrored_windows_fail_both_empty_region_predicates() {
    let mut raw = target();
    raw.windows = vec![
        through_window(["3/2", "15/2"], ["5/2", "17/2"]),
        through_window(["15/2", "3/2"], ["17/2", "5/2"]),
    ];
    let mut expected = target_analysis();
    expected.predicates = [true, true, false, false];
    expected.measured.material_in_a = rational("2/1");
    expected.measured.material_in_b = rational("2/1");
    expected.certificate.occupied_cells = occupied(25, &[8, 16]);
    expected.certificate.material_witnesses = MaterialWitnesses {
        a: Some(point(["2/1", "2/1", "1/1"])),
        b: Some(point(["8/1", "8/1", "1/1"])),
    };
    check(raw, expected);
}

#[test]
fn wider_equal_volume_plate_fails_only_bounds() {
    let mut raw = target();
    raw.plate.max = point(["11/1", "100/11", "2/1"]);
    let mut expected = target_analysis();
    expected.measured.bounds = bounds(["0/1", "0/1", "0/1"], ["11/1", "100/11", "2/1"]);
    expected.predicates = [false, true, true, true];
    expected.certificate.planes.x = plane(&["0/1", "3/2", "5/2", "15/2", "17/2", "11/1"]);
    expected.certificate.planes.y = plane(&["0/1", "3/2", "5/2", "15/2", "17/2", "100/11"]);
    // 11 * (100/11) * 2 - 2 - 2 = 196 exactly.
    check(raw, expected);
}

#[test]
fn extra_separated_window_is_admitted_and_fails_only_volume() {
    let mut raw = target();
    raw.windows
        .push(through_window(["4/1", "4/1"], ["5/1", "5/1"]));
    let mut expected = target_analysis();
    expected.window_count = 3;
    expected.cell_count = 49;
    expected.predicates = [true, false, true, true];
    expected.measured.material_volume = rational("194/1");
    expected.certificate.planes.x =
        plane(&["0/1", "3/2", "5/2", "4/1", "5/1", "15/2", "17/2", "10/1"]);
    expected.certificate.planes.y = expected.certificate.planes.x.clone();
    expected.certificate.occupied_cells = occupied(49, &[8, 24, 40]);
    check(raw, expected);
}

#[test]
fn moved_a_fails_only_a_emptiness() {
    let mut raw = target();
    raw.windows[0] = through_window(["7/2", "3/2"], ["9/2", "5/2"]);
    let mut expected = target_analysis();
    expected.cell_count = 35;
    expected.predicates = [true, true, false, true];
    expected.measured.material_in_a = rational("2/1");
    expected.certificate.planes.x =
        plane(&["0/1", "3/2", "5/2", "7/2", "9/2", "15/2", "17/2", "10/1"]);
    expected.certificate.occupied_cells = occupied(35, &[16, 28]);
    expected.certificate.material_witnesses.a = Some(point(["2/1", "2/1", "1/1"]));
    check(raw, expected);
}

#[test]
fn moved_b_fails_only_b_emptiness() {
    let mut raw = target();
    raw.windows[1] = through_window(["11/2", "15/2"], ["13/2", "17/2"]);
    let mut expected = target_analysis();
    expected.cell_count = 35;
    expected.predicates = [true, true, true, false];
    expected.measured.material_in_b = rational("2/1");
    expected.certificate.planes.x =
        plane(&["0/1", "3/2", "5/2", "11/2", "13/2", "15/2", "17/2", "10/1"]);
    expected.certificate.occupied_cells = occupied(35, &[6, 18]);
    expected.certificate.material_witnesses.b = Some(point(["8/1", "8/1", "1/1"]));
    check(raw, expected);
}

fn check(raw: RawPlate, expected: PlateAnalysis) {
    let original = raw.clone();
    let admitted = admit(&raw).expect("The predeclared ordinary subject is in domain D.");
    assert_eq!(admitted.raw, original);
    assert_eq!(admitted.cell_count, expected.cell_count);
    assert_eq!(admitted.planes, expected.certificate.planes);
    let before = admitted.clone();
    let actual =
        produce(&admitted).expect("The admitted ordinary subject has a complete analysis.");
    assert_eq!(actual, expected);
    assert_eq!(admitted, before);
    assert_eq!(raw, original);
}

fn target() -> RawPlate {
    RawPlate {
        plate: bounds(["0/1", "0/1", "0/1"], ["10/1", "10/1", "2/1"]),
        windows: vec![
            through_window(["3/2", "3/2"], ["5/2", "5/2"]),
            through_window(["15/2", "15/2"], ["17/2", "17/2"]),
        ],
    }
}

fn target_analysis() -> PlateAnalysis {
    PlateAnalysis {
        window_count: 2,
        cell_count: 25,
        measured: PredicateValues {
            bounds: bounds(["0/1", "0/1", "0/1"], ["10/1", "10/1", "2/1"]),
            material_volume: rational("196/1"),
            material_in_a: rational("0/1"),
            material_in_b: rational("0/1"),
        },
        predicates: [true, true, true, true],
        certificate: PlateCertificate {
            planes: PlaneLists {
                x: plane(&["0/1", "3/2", "5/2", "15/2", "17/2", "10/1"]),
                y: plane(&["0/1", "3/2", "5/2", "15/2", "17/2", "10/1"]),
                z: plane(&["0/1", "2/1"]),
            },
            occupied_cells: occupied(25, &[6, 18]),
            material_witnesses: MaterialWitnesses { a: None, b: None },
        },
    }
}

fn through_window(min: [&str; 2], max: [&str; 2]) -> Box3 {
    bounds([min[0], min[1], "0/1"], [max[0], max[1], "2/1"])
}

fn bounds(min: [&str; 3], max: [&str; 3]) -> Box3 {
    Box3 {
        min: point(min),
        max: point(max),
    }
}

fn rational(value: &str) -> RationalText {
    RationalText(value.into())
}

fn point(values: [&str; 3]) -> Point3 {
    values.map(rational)
}

fn plane(values: &[&str]) -> Vec<RationalText> {
    values.iter().map(|value| rational(value)).collect()
}

fn occupied(count: u32, excluded: &[u32]) -> Vec<u32> {
    (0..count).filter(|cell| !excluded.contains(cell)).collect()
}

#[path = "rational_plate_engine.rs"]
mod engine_integration;
