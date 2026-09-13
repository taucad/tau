use super::*;

fn support(origin: [f64; 3], direction: [f64; 3], kind: SupportKind) -> NominalSupport {
    NominalSupport {
        entity: BrepEntity::Face {
            occurrence: 0,
            face: 7,
        },
        public_ordinal: 2,
        kind,
        origin,
        direction,
    }
}
fn request(kind: AnalyticKind, a: [f64; 3], b: [f64; 3]) -> NominalAnalyticRequest {
    let k = if matches!(kind, AnalyticKind::Plane) {
        SupportKind::Plane
    } else {
        SupportKind::Axis
    };
    NominalAnalyticRequest {
        kind,
        subject: support([0.; 3], a, k),
        target: support([0.; 3], b, k),
        tolerance: 0.,
        angle_degrees: 0.,
        angular_tolerance_degrees: 0.,
    }
}
fn decision(r: NominalAnalyticRequest) -> bool {
    match nominal_analytic(r) {
        Outcome::Decided { positive, .. } => positive,
        o => panic!("expected decided control: {o:?}"),
    }
}

#[test]
fn exact_axis_radial_signed_normalization_and_inclusive_limits() {
    for factor in [1., -7., 0.125] {
        let mut r = request(AnalyticKind::Axis, [0., 0., factor], [0., 0., -3.]);
        r.target.origin = [3., 4., 127.];
        r.tolerance = 5.;
        assert!(decision(r));
        let mut r = request(AnalyticKind::Axis, [0., 0., factor], [0., 0., 3.]);
        r.target.origin = [3., 4., 127.];
        r.tolerance = 4.999;
        assert!(!decision(r));
        let mut r = request(AnalyticKind::Axis, [0., 0., factor], [0., 0., 3.]);
        r.target.origin = [0., 0., 127.];
        assert!(decision(r));
    }
}

#[test]
fn raw_parallel_planes_ignore_tangential_origin_and_rounded_offsets() {
    let mut r = request(AnalyticKind::Plane, [0., 0., 3.], [0., 0., -7.]);
    r.target.origin = [100., -8., 0.];
    assert!(decision(r));
    let mut r = request(AnalyticKind::Plane, [0., 0., 3.], [0., 0., -7.]);
    r.target.origin = [100., -8., 0.25];
    r.tolerance = 0.25;
    assert!(decision(r));
    let mut r = request(AnalyticKind::Plane, [0., 0., 3.], [0., 0., -7.]);
    r.target.origin = [100., -8., 0.25];
    r.tolerance = 0.249;
    assert!(!decision(r));
    assert!(!decision(request(
        AnalyticKind::Plane,
        [0., 0., 1.],
        [0., 1., 1.]
    )));
    let mut r = request(AnalyticKind::Plane, [0., 0., 1.], [0., 1., 1.]);
    r.angular_tolerance_degrees = 90.;
    assert!(matches!(
        nominal_analytic(r),
        Outcome::Unsupported {
            reason: ContinuousError {
                kind: super::super::ContinuousErrorKind::UnsupportedDomain,
                ..
            },
            ..
        }
    ));
}

#[test]
fn folded_angle_endpoints_special_equalities_and_non_endpoint_enclosures() {
    assert!(decision(request(
        AnalyticKind::Direction,
        [2., 0., 0.],
        [-7., 0., 0.]
    )));
    for (a, b, angle) in [
        ([1., 0., 0.], [0., 7., 0.], 90.),
        ([1., 0., 0.], [1., 1., 0.], 45.),
    ] {
        let mut r = request(AnalyticKind::Direction, a, b);
        r.angle_degrees = angle;
        assert!(decision(r));
    }
    for e in [0., 90.] {
        let mut r = request(AnalyticKind::Direction, [1., 0., 0.], [1., 1., 0.]);
        r.angle_degrees = e;
        r.angular_tolerance_degrees = 0.1;
        assert!(!decision(r));
    }
    let mut r = request(AnalyticKind::Direction, [1., 0., 0.], [1., 0., 0.]);
    r.angle_degrees = -1.;
    assert!(!decision(r));
    let mut r = request(AnalyticKind::Direction, [1., 0., 0.], [1., 0., 0.]);
    r.angle_degrees = -1.;
    r.angular_tolerance_degrees = 1.;
    assert!(decision(r));
    // The mathematical special cases test equality without binary sqrt(3).
    assert!(in_angle_band(
        &Rat::new(1.into(), 4.into()),
        &rat(60.).unwrap(),
        &rat(60.).unwrap()
    )
    .unwrap());
    assert!(in_angle_band(
        &Rat::new(3.into(), 4.into()),
        &rat(30.).unwrap(),
        &rat(30.).unwrap()
    )
    .unwrap());
}

#[test]
fn actual_sixty_degree_construction_and_import_are_different_operands() {
    let observations = [
        ([0.5, 0.8660254037844386, 0.], true),
        ([0.50000000000019, 0.866025403784329, 0.], false),
    ]
    .map(|(axis, expected)| {
        let mut r = request(AnalyticKind::Direction, [1., 0., 0.], axis);
        r.angle_degrees = 60.;
        r.angular_tolerance_degrees = 1e-12;
        (axis, expected, nominal_analytic(r))
    });
    for row in &observations {
        println!("nominal-angle-operand {row:?}");
    }
    for (_, expected, outcome) in observations {
        assert!(matches!(outcome,Outcome::Decided {positive,..} if positive==expected));
    }
}

#[test]
fn directed_brackets_and_arithmetic_limits_are_not_tolerance_fits() {
    let s = BigInt::one() << 128;
    let (lo, hi) = pi_scaled(&s);
    // Independent classical rational pi bounds; no library trig is the oracle.
    assert!(&lo * BigInt::from(106) > &s * BigInt::from(333));
    assert!(&hi * BigInt::from(113) < &s * BigInt::from(355));
    assert!(&hi - &lo <= BigInt::from(572));
    for angle in [0.1, 15., 29., 46., 89.9] {
        let (lo, hi) = cosine_squared(&rat(angle).unwrap()).unwrap();
        assert!(lo >= Rat::zero() && hi <= Rat::one() && lo <= hi);
        assert!(&hi - &lo < Rat::new(1.into(), BigInt::one() << 110));
    }
    let too_large = Rat::from_integer(BigInt::one() << 2048);
    assert!(matches!(
        stored(too_large),
        Err(ContinuousError {
            kind: super::super::ContinuousErrorKind::ResourceLimit,
            ..
        })
    ));
    assert!(NOMINAL_ANALYTIC_RESERVATION_BYTES < 256 * 1024);
}

#[test]
fn invalid_and_unresolved_inputs_never_become_geometric_false() {
    for direction in [[0.; 3], [f64::NAN, 0., 1.], [f64::INFINITY, 0., 1.]] {
        let outcome = nominal_analytic(request(AnalyticKind::Direction, direction, [1., 0., 0.]));
        assert!(matches!(
            outcome,
            Outcome::Unsupported {
                reason: ContinuousError {
                    kind: super::super::ContinuousErrorKind::InvalidInput,
                    ..
                },
                ..
            }
        ));
    }
    let mut r = request(AnalyticKind::Axis, [0., 0., 1.], [0., 0., 1.]);
    r.tolerance = -1.;
    assert!(matches!(nominal_analytic(r), Outcome::Unsupported { .. }));
    let (lo, hi) = cosine_squared(&rat(17.).unwrap()).unwrap();
    let midpoint = exact::midpoint(&lo, &hi).unwrap();
    assert!(in_angle_band(&midpoint, &rat(17.).unwrap(), &rat(17.).unwrap()).is_err());
}
