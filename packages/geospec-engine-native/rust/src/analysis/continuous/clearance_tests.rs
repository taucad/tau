use crate::{
    backend::brep::{ContinuousWallDomain, ContinuousWallShape, SelectedContinuousDomain},
    codec::Json,
};
use num_rational::BigRational;

use super::{
    clearance::{clearance, ClearanceRequest, CLEARANCE_MAX_OWNED_BYTES},
    Outcome,
};

#[test]
fn exact_distance_and_signed_band_controls() {
    let subject = box_domain(1, [0.0, 0.0, 0.0], [1.0, 1.0, 1.0]);
    for (gap, minimum, maximum, squared) in [
        (2.0, Some(1.5), Some(2.5), "4"),
        (4.0, Some(3.5), Some(4.5), "16"),
    ] {
        let target = box_domain(2, [1.0 + gap, 0.0, 0.0], [2.0 + gap, 1.0, 1.0]);
        let (positive, evidence) = decided(ClearanceRequest {
            subject: &subject,
            target: &target,
            minimum,
            maximum,
            tolerance: 0.0,
        });
        assert!(positive);
        assert_eq!(evidence.distance, gap);
        assert_eq!(
            field(&evidence.to_json(), "squaredDistance"),
            &ratio(squared, "1")
        );
    }
    let four_mm = box_domain(2, [5.0, 0.0, 0.0], [6.0, 1.0, 1.0]);
    let (positive, evidence) = decided(ClearanceRequest {
        subject: &subject,
        target: &four_mm,
        minimum: Some(1.5),
        maximum: Some(2.5),
        tolerance: 0.0,
    });
    assert!(
        !positive,
        "the original 4 mm control is above its 1.5..2.5 band"
    );
    assert!(!evidence.below_minimum);

    let diagonal = box_domain(3, [4.0, 5.0, 0.0], [5.0, 6.0, 1.0]);
    let (positive, evidence) = decided(ClearanceRequest {
        subject: &subject,
        target: &diagonal,
        minimum: Some(5.0),
        maximum: Some(5.0),
        tolerance: 0.0,
    });
    assert!(positive, "inclusive exact 3-4-5 boundary");
    assert_eq!(evidence.distance, 5.0);
    assert_eq!(
        field(&evidence.to_json(), "squaredDistance"),
        &ratio("25", "1")
    );

    assert!(
        decided(ClearanceRequest {
            subject: &subject,
            target: &diagonal,
            minimum: None,
            maximum: None,
            tolerance: 0.0,
        })
        .0
    );
    assert!(
        decided(ClearanceRequest {
            subject: &subject,
            target: &diagonal,
            minimum: Some(1.0),
            maximum: None,
            tolerance: 2.0,
        })
        .0
    );
    let (positive, evidence) = decided(ClearanceRequest {
        subject: &subject,
        target: &diagonal,
        minimum: None,
        maximum: Some(-1.0),
        tolerance: 0.0,
    });
    assert!(
        !positive,
        "a negative effective maximum cannot contain D >= 0"
    );
    assert!(!evidence.below_minimum);
}

#[test]
fn deterministic_closed_set_witnesses() {
    let subject = box_domain(7, [0.0, 0.0, 0.0], [1.0, 1.0, 1.0]);
    for (target, point) in [
        (
            box_domain(8, [1.0, 0.0, 0.0], [2.0, 1.0, 1.0]),
            [1.0, 0.0, 0.0],
        ),
        (
            box_domain(9, [0.5, -1.0, 0.25], [2.0, 0.5, 2.0]),
            [0.5, 0.0, 0.25],
        ),
        (
            box_domain(10, [0.25, 0.25, 0.25], [0.75, 0.75, 0.75]),
            [0.25, 0.25, 0.25],
        ),
    ] {
        let (positive, evidence) = decided(ClearanceRequest {
            subject: &subject,
            target: &target,
            minimum: Some(0.0),
            maximum: Some(0.0),
            tolerance: 0.0,
        });
        assert!(positive);
        assert_eq!(evidence.distance.to_bits(), 0.0_f64.to_bits());
        assert_eq!(evidence.diagnostic_point, point);
        let expected = Json::Array(vec![point_json(point), point_json(point)]);
        assert_eq!(field(&evidence.to_json(), "closestPoints"), &expected);
    }

    let (positive, evidence) = decided(ClearanceRequest {
        subject: &subject,
        target: &subject,
        minimum: Some(0.0),
        maximum: Some(0.0),
        tolerance: 0.0,
    });
    assert!(
        positive,
        "one ordinary occurrence may fill both endpoint roles"
    );
    assert_eq!(evidence.diagnostic_point, [0.0, 0.0, 0.0]);
    let point = point_json([0.0, 0.0, 0.0]);
    assert_eq!(
        field(&evidence.to_json(), "closestPoints"),
        &Json::Array(vec![point.clone(), point])
    );
}

#[test]
fn finite_display_and_owned_evidence() {
    let subject = box_domain(1, [0.0, 0.0, 0.0], [1.0, 1.0, 1.0]);
    let target = box_domain(2, [1e200, 0.0, 0.0], [1.5e200, 1.0, 1.0]);
    let (positive, evidence) = decided(ClearanceRequest {
        subject: &subject,
        target: &target,
        minimum: None,
        maximum: None,
        tolerance: 0.0,
    });
    assert!(positive);
    assert!(evidence.distance.is_finite());
    assert!(evidence
        .diagnostic_point
        .iter()
        .all(|value| value.is_finite()));
    assert!(evidence.owned_bytes() <= CLEARANCE_MAX_OWNED_BYTES);

    let Json::Object(fields) = evidence.to_json() else {
        panic!("clearance witness must be an object");
    };
    let keys: Vec<_> = fields.iter().map(|(key, _)| key.as_str()).collect();
    assert_eq!(
        keys,
        [
            "profile",
            "representation",
            "assurance",
            "subject",
            "target",
            "closestPoints",
            "squaredDistance",
            "comparison",
            "endpointConvention",
        ]
    );
}

fn decided(request: ClearanceRequest<'_>) -> (bool, super::clearance::ClearanceEvidence) {
    let Outcome::Decided { positive, evidence } = clearance(request) else {
        panic!("qualified complete boxes should decide clearance");
    };
    (positive, evidence)
}

fn field<'a>(value: &'a Json, key: &str) -> &'a Json {
    let Json::Object(fields) = value else {
        panic!("expected object")
    };
    fields
        .iter()
        .find_map(|(name, value)| (name == key).then_some(value))
        .unwrap_or_else(|| panic!("missing {key}"))
}

fn ratio(numerator: &str, denominator: &str) -> Json {
    Json::object([
        ("denominator", Json::string(denominator)),
        ("numerator", Json::string(numerator)),
    ])
}

fn point_json(point: [f64; 3]) -> Json {
    Json::Array(point.into_iter().map(scalar_json).collect())
}

fn scalar_json(display: f64) -> Json {
    let value = BigRational::from_float(display).expect("finite dyadic test coordinate");
    Json::object([
        ("denominator", Json::string(&value.denom().to_string())),
        ("display", Json::Number(display)),
        ("numerator", Json::string(&value.numer().to_string())),
    ])
}

fn box_domain(occurrence: u32, minimum: [f64; 3], maximum: [f64; 3]) -> SelectedContinuousDomain {
    SelectedContinuousDomain {
        occurrence,
        domain: ContinuousWallDomain {
            maximum_topology_tolerance_mm: 0.0,
            domain: ContinuousWallShape::AxisAlignedBox {
                corners: [
                    [minimum[0], minimum[1], minimum[2]],
                    [minimum[0], minimum[1], maximum[2]],
                    [minimum[0], maximum[1], minimum[2]],
                    [minimum[0], maximum[1], maximum[2]],
                    [maximum[0], minimum[1], minimum[2]],
                    [maximum[0], minimum[1], maximum[2]],
                    [maximum[0], maximum[1], minimum[2]],
                    [maximum[0], maximum[1], maximum[2]],
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
                edge_lengths: [
                    maximum[0] - minimum[0],
                    maximum[1] - minimum[1],
                    maximum[2] - minimum[2],
                ],
            },
        },
        domain_face_to_occurrence_face: (1..=6).collect(),
        domain_edge_to_occurrence_edge: (1..=12).collect(),
    }
}
