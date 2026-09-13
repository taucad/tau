use crate::backend::brep::{
    Bounds, ContinuousWallDomain, ContinuousWallShape, SelectedContinuousDomain,
};

use super::*;

#[test]
fn insertion_exact_depth_and_authored_band() {
    let subject = box_domain(1, [0.0, 0.0, 0.0], [10.0, 2.0, 2.0]);
    let target = box_domain(2, [2.0, 0.0, 0.0], [5.0, 2.0, 2.0]);
    assert_eq!(insertion_units(2).expect("bounded units"), 13);
    let exact = insertion(InsertionRequest {
        subject: &subject,
        target: &target,
        axis: [1.0, 0.0, 0.0],
        minimum: 3.0,
        maximum: Some(3.0),
    });
    let Outcome::Decided { positive, evidence } = exact else {
        panic!("exact box insertion should be decided");
    };
    assert!(positive);
    assert_eq!(
        (
            evidence.depth.numerator.as_str(),
            evidence.depth.denominator.as_str()
        ),
        ("3", "1")
    );
    assert_eq!(evidence.clip_events.len(), 2);
    assert!(matches!(evidence.to_json(), crate::codec::Json::Object(_)));

    let missed_band = insertion(InsertionRequest {
        subject: &subject,
        target: &target,
        axis: [1.0, 0.0, 0.0],
        minimum: 4.0,
        maximum: Some(6.0),
    });
    assert!(matches!(
        missed_band,
        Outcome::Decided {
            positive: false,
            ..
        }
    ));
}

#[test]
fn insertion_zero_tangent_and_closed_boundary_line() {
    let subject = box_domain(1, [0.0, 0.0, 0.0], [10.0, 2.0, 2.0]);
    let empty = box_domain(2, [2.0, 3.0, 0.0], [5.0, 4.0, 2.0]);
    let tangent = box_domain(3, [10.0, 0.0, 0.0], [11.0, 2.0, 2.0]);
    let boundary = box_domain(4, [2.0, 1.0, 0.0], [5.0, 3.0, 2.0]);

    for target in [&empty, &tangent] {
        let Outcome::Decided { positive, evidence } = insertion(InsertionRequest {
            subject: &subject,
            target,
            axis: [1.0, 0.0, 0.0],
            minimum: 0.0,
            maximum: Some(0.0),
        }) else {
            panic!("zero-depth box insertion should be decided");
        };
        assert!(positive);
        assert_eq!(evidence.depth.numerator, "0");
        assert_eq!(evidence.depth.display.to_bits(), 0.0_f64.to_bits());
    }

    let Outcome::Decided { positive, evidence } = insertion(InsertionRequest {
        subject: &subject,
        target: &boundary,
        axis: [1.0, 0.0, 0.0],
        minimum: 3.0,
        maximum: Some(3.0),
    }) else {
        panic!("boundary centerline should be admitted");
    };
    assert!(positive);
    assert_eq!(evidence.endpoint_convention, "closed-target-length");
}

#[test]
fn insertion_exact_comparison_precedes_tie_and_subnormal_display() {
    let subject = box_domain(1, [0.0, 0.0, 0.0], [2.0, 2.0, 2.0]);
    let tie_target = box_domain(
        2,
        [2.0_f64.powi(-53), 0.0, 0.0],
        [f64::from_bits(1.0_f64.to_bits() + 1), 2.0, 2.0],
    );
    let Outcome::Decided { positive, evidence } = insertion(InsertionRequest {
        subject: &subject,
        target: &tie_target,
        axis: [1.0, 0.0, 0.0],
        minimum: 0.0,
        maximum: Some(1.0),
    }) else {
        panic!("tie control should be decided");
    };
    assert!(!positive, "exact depth is greater than its rounded display");
    assert_eq!(evidence.depth.display, 1.0);
    assert_ne!(evidence.depth.denominator, "1");

    let least = f64::from_bits(1);
    let subnormal_target = box_domain(3, [0.0, 0.0, 0.0], [least, 2.0, 2.0]);
    let Outcome::Decided { positive, evidence } = insertion(InsertionRequest {
        subject: &subject,
        target: &subnormal_target,
        axis: [1.0, 0.0, 0.0],
        minimum: least,
        maximum: Some(least),
    }) else {
        panic!("subnormal control should be decided");
    };
    assert!(positive);
    assert_eq!(evidence.depth.display.to_bits(), least.to_bits());
}

#[test]
fn void_constant_channel_has_exact_area_four_and_checked_units() {
    let (materials, region) = channel();
    let plan = GridPlan::new(&materials, region).expect("valid channel plan");
    assert_eq!(plan.grid_units().expect("bounded units"), 67);
    let projected = plan
        .projected_owned_build_bytes()
        .expect("bounded build projection");
    let topology = plan.build().expect("valid channel topology");
    assert_eq!(topology.point_units(2, 0).expect("bounded units"), 18);
    assert_eq!(topology.section_units(2, 0).expect("bounded units"), 28);
    assert!(topology.owned_bytes() < MAX_OWNED_BYTES);
    assert!(projected >= topology.owned_bytes());

    let waypoints = [[0.5, 2.0, 2.0], [3.5, 2.0, 2.0]];
    let Outcome::Decided {
        positive,
        evidence: points,
    } = topology.evaluate_points(PointRequest {
        waypoints: &waypoints,
        isolated_from: &[],
    })
    else {
        panic!("channel point stage should be decided");
    };
    assert!(positive);
    let Outcome::Decided { positive, evidence } = topology.evaluate_section(SectionRequest {
        waypoints: &waypoints,
        axis: [1.0, 0.0, 0.0],
        minimum: 4.0,
        points: &points,
    }) else {
        panic!("channel section should be decided");
    };
    assert!(positive);
    assert_eq!(
        (
            evidence.minimum_area.numerator.as_str(),
            evidence.minimum_area.denominator.as_str()
        ),
        ("4", "1")
    );
    assert!(matches!(points.to_json(), crate::codec::Json::Object(_)));
    assert!(matches!(evidence.to_json(), crate::codec::Json::Object(_)));
}

#[test]
fn void_narrow_waist_finds_exact_quarter_area() {
    let (mut materials, region) = channel();
    materials.extend([
        box_domain(5, [1.5, 1.0, 1.0], [2.5, 1.75, 3.0]),
        box_domain(6, [1.5, 2.25, 1.0], [2.5, 3.0, 3.0]),
        box_domain(7, [1.5, 1.75, 1.0], [2.5, 2.25, 1.75]),
        box_domain(8, [1.5, 1.75, 2.25], [2.5, 2.25, 3.0]),
    ]);
    let topology = GridPlan::new(&materials, region)
        .expect("valid waist plan")
        .build()
        .expect("valid waist topology");
    let waypoints = [[0.5, 2.0, 2.0], [3.5, 2.0, 2.0]];
    let Outcome::Decided {
        positive: true,
        evidence: points,
    } = topology.evaluate_points(PointRequest {
        waypoints: &waypoints,
        isolated_from: &[],
    })
    else {
        panic!("waist point stage should pass");
    };
    let Outcome::Decided { positive, evidence } = topology.evaluate_section(SectionRequest {
        waypoints: &waypoints,
        axis: [1.0, 0.0, 0.0],
        minimum: 0.25,
        points: &points,
    }) else {
        panic!("waist section should be decided");
    };
    assert!(positive);
    assert_eq!(
        (
            evidence.minimum_area.numerator.as_str(),
            evidence.minimum_area.denominator.as_str()
        ),
        ("1", "4")
    );
}

#[test]
fn void_preserves_point_connectivity_and_isolation_precedence() {
    let (materials, region) = channel();
    let topology = GridPlan::new(&materials, region).unwrap().build().unwrap();
    let material_waypoints = [[0.5, 0.5, 2.0], [3.5, 2.0, 2.0]];
    assert!(matches!(
        topology.evaluate_points(PointRequest {
            waypoints: &material_waypoints,
            isolated_from: &[]
        }),
        Outcome::Decided {
            positive: false,
            ..
        }
    ));
    let boundary_waypoints = [[0.5, 1.0, 2.0], [3.5, 2.0, 2.0]];
    assert!(matches!(
        topology.evaluate_points(PointRequest {
            waypoints: &boundary_waypoints,
            isolated_from: &[]
        }),
        Outcome::Unsupported {
            reason: ContinuousError {
                kind: ContinuousErrorKind::UnsupportedDomain,
                ..
            },
            ..
        }
    ));
    let fluid_waypoints = [[0.5, 2.0, 2.0], [3.5, 2.0, 2.0]];
    assert!(matches!(
        topology.evaluate_points(PointRequest {
            waypoints: &fluid_waypoints,
            isolated_from: &[[2.0, 2.0, 2.0]]
        }),
        Outcome::Decided {
            positive: false,
            ..
        }
    ));
    assert!(matches!(
        topology.evaluate_points(PointRequest {
            waypoints: &fluid_waypoints,
            isolated_from: &[[5.0, 2.0, 2.0]]
        }),
        Outcome::Unsupported { .. }
    ));
}

#[test]
fn void_disconnected_path_is_geometric_false() {
    let (mut materials, region) = channel();
    materials.push(box_domain(5, [1.5, 1.0, 1.0], [2.5, 3.0, 3.0]));
    let topology = GridPlan::new(&materials, region).unwrap().build().unwrap();
    let waypoints = [[0.5, 2.0, 2.0], [3.5, 2.0, 2.0]];
    assert!(matches!(
        topology.evaluate_points(PointRequest {
            waypoints: &waypoints,
            isolated_from: &[]
        }),
        Outcome::Decided {
            positive: false,
            ..
        }
    ));
}

#[test]
fn void_section_rejects_a_bypass_component() {
    let (mut materials, region) = channel();
    materials.push(box_domain(5, [1.5, 1.0, 1.0], [2.5, 1.5, 1.5]));
    let topology = GridPlan::new(&materials, region).unwrap().build().unwrap();
    let waypoints = [[0.5, 2.0, 2.0], [3.5, 2.0, 2.0]];
    let Outcome::Decided {
        positive: true,
        evidence: points,
    } = topology.evaluate_points(PointRequest {
        waypoints: &waypoints,
        isolated_from: &[],
    })
    else {
        panic!("bypass endpoints should share a component");
    };
    assert!(matches!(
        topology.evaluate_section(SectionRequest {
            waypoints: &waypoints,
            axis: [1.0, 0.0, 0.0],
            minimum: 0.0,
            points: &points,
        }),
        Outcome::Unsupported { .. }
    ));

    let (mut shifted_materials, shifted_region) = channel();
    shifted_materials.push(box_domain(6, [1.5, 2.5, 1.0], [2.5, 3.0, 3.0]));
    let shifted = GridPlan::new(&shifted_materials, shifted_region)
        .unwrap()
        .build()
        .unwrap();
    let shifted_waypoints = [[0.5, 1.5, 2.0], [3.5, 1.5, 2.0]];
    let Outcome::Decided {
        positive: true,
        evidence: shifted_points,
    } = shifted.evaluate_points(PointRequest {
        waypoints: &shifted_waypoints,
        isolated_from: &[],
    })
    else {
        panic!("shifted nested rectangles should remain connected");
    };
    assert!(matches!(
        shifted.evaluate_section(SectionRequest {
            waypoints: &shifted_waypoints,
            axis: [1.0, 0.0, 0.0],
            minimum: 0.0,
            points: &shifted_points,
        }),
        Outcome::Unsupported { .. }
    ));
}

fn channel() -> (Vec<SelectedContinuousDomain>, Bounds) {
    (
        vec![
            box_domain(1, [0.0, 0.0, 0.0], [4.0, 1.0, 4.0]),
            box_domain(2, [0.0, 3.0, 0.0], [4.0, 4.0, 4.0]),
            box_domain(3, [0.0, 1.0, 0.0], [4.0, 3.0, 1.0]),
            box_domain(4, [0.0, 1.0, 3.0], [4.0, 3.0, 4.0]),
        ],
        Bounds {
            min: [0.0, 0.0, 0.0],
            max: [4.0, 4.0, 4.0],
        },
    )
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
