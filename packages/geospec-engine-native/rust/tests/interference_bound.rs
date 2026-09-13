use super::*;
use crate::backend::brep::*;
// Preserve the recorded OCCT periods and independently rounded trim bounds;
// these binary64 source values are test evidence, not mathematical TAU.
#[allow(clippy::approx_constant)]
fn cartesian_certificate() -> NominalCylindricalBand {
    NominalCylindricalBand {
        axis: [0.0, 0.0, 1.0],
        boundary: [
            CylinderBoundaryUse {
                curve_range: [0.0, 6.283185307179586],
                edge_index: 1,
                orientation: CylinderBoundaryOrientation::Reversed,
                parameter_endpoints: [[0.0, 30.0], [6.283185307179586, 30.0]],
                pcurve_stored: true,
                side: CylinderBoundarySide::V1,
            },
            CylinderBoundaryUse {
                curve_range: [0.0, 30.0],
                edge_index: 2,
                orientation: CylinderBoundaryOrientation::Reversed,
                parameter_endpoints: [[0.0, 0.0], [0.0, 30.0]],
                pcurve_stored: true,
                side: CylinderBoundarySide::U0,
            },
            CylinderBoundaryUse {
                curve_range: [0.0, 6.283185307179586],
                edge_index: 3,
                orientation: CylinderBoundaryOrientation::Forward,
                parameter_endpoints: [[0.0, 0.0], [6.283185307179586, 0.0]],
                pcurve_stored: true,
                side: CylinderBoundarySide::V0,
            },
            CylinderBoundaryUse {
                curve_range: [0.0, 30.0],
                edge_index: 2,
                orientation: CylinderBoundaryOrientation::Forward,
                parameter_endpoints: [[6.28318530718, 0.0], [6.28318530718, 30.0]],
                pcurve_stored: true,
                side: CylinderBoundarySide::U1,
            },
        ],
        boundary_residuals: [
            CylindricalBandBoundaryResidual {
                curve_surface_mm: 0.0,
                limit_mm: 1e-7,
                parameter_coverage_mm: 1.0347278589506459e-11,
                vertex_attachment_mm: 6.123233995737e-15,
            },
            CylindricalBandBoundaryResidual {
                curve_surface_mm: 6.123233995737e-15,
                limit_mm: 1e-7,
                parameter_coverage_mm: 0.0,
                vertex_attachment_mm: 6.123233995737e-15,
            },
            CylindricalBandBoundaryResidual {
                curve_surface_mm: 0.0,
                limit_mm: 1e-7,
                parameter_coverage_mm: 1.0347278589506459e-11,
                vertex_attachment_mm: 6.123233995737e-15,
            },
            CylindricalBandBoundaryResidual {
                curve_surface_mm: 1.0347278589506459e-11,
                limit_mm: 1e-7,
                parameter_coverage_mm: 0.0,
                vertex_attachment_mm: 1.0347278589506459e-11,
            },
        ],
        edge_tolerances_mm: [1e-7, 1e-7, 1e-7],
        face_tolerance_mm: 1e-7,
        from: 0.0,
        occurrence: 1,
        origin: [0.0, 0.0, 0.0],
        parameter_bounds: [0.0, 6.28318530718, 0.0, 30.0],
        period_residual_mm: 1.0347278589506459e-11,
        phase_x: [1.0, 0.0, 0.0],
        phase_y: [0.0, 1.0, 0.0],
        private_query_face: 1,
        profile: CylindricalBandProfile::NominalV1,
        public_face_ordinal: 0,
        radius: 25.0,
        rims: [
            CylindricalBandRim {
                axis: [0.0, 0.0, 1.0],
                center: [0.0, 0.0, 0.0],
                curve_period: 6.283185307179586,
                curve_range: [0.0, 6.283185307179586],
                edge_index: 3,
                phase_x: [1.0, 0.0, 0.0],
                phase_y: [0.0, 1.0, 0.0],
                radius: 25.0,
                vertex_indices: [2, 2],
            },
            CylindricalBandRim {
                axis: [0.0, 0.0, 1.0],
                center: [0.0, 0.0, 30.0],
                curve_period: 6.283185307179586,
                curve_range: [0.0, 6.283185307179586],
                edge_index: 1,
                phase_x: [1.0, 0.0, 0.0],
                phase_y: [0.0, 1.0, 0.0],
                radius: 25.0,
                vertex_indices: [1, 1],
            },
        ],
        seam_axis: [0.0, 0.0, 1.0],
        seam_curve_range: [0.0, 30.0],
        seam_edge_index: 2,
        seam_origin: [25.0, -6.123233995737e-15, 0.0],
        seam_vertex_indices: [2, 1],
        source_face_entity: 480,
        source_route: [
            585, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0,
        ],
        source_route_count: 1,
        source_same_sense: true,
        surface_period: 6.283185307179586,
        to: 30.0,
        transferred_reversed: false,
        vertex_tolerances_mm: [1e-7, 1e-7],
        vertices: [
            CylinderVertex {
                point: [25.0, -6.123233995737e-15, 30.0],
                vertex_index: 1,
            },
            CylinderVertex {
                point: [25.0, -6.123233995737e-15, 0.0],
                vertex_index: 2,
            },
        ],
    }
}

fn operands() -> (NominalCylindricalBand, NominalCylindricalBand) {
    let mut bore = cartesian_certificate();
    bore.radius = 25.04;
    bore.origin = [0.; 3];
    bore.transferred_reversed = true;
    let mut shaft = cartesian_certificate();
    shaft.origin = [0., 0.65429081048, 0.01427667627213];
    shaft.axis = [0., -0.043619387365333794, 0.9990482215818579];
    (bore, shaft)
}
#[test]
fn interference_bound_independent_fraction_oracle_and_threshold() {
    let (h, s) = operands();
    let value = bound(&h, &s, 381., &Budget::new(8_000_000))
        .unwrap_or_else(|_| panic!("original bound refused"));
    assert_eq!(value.panels, 2048);
    // Independent Fraction/isqrt oracle used 80-bit roots. Production uses
    // 96-bit roots and must lie below that independently certified upper.
    assert!(value.upper.display > 380.97 && value.upper.display < 380.972697644);
    let json: serde_json::Value =
        serde_json::from_slice(&crate::codec::encode(&value.to_json()).unwrap()).unwrap();
    assert_eq!(json["lower"], 0.);
    assert!(matches!(
        bound(&h, &s, 380.85, &Budget::new(40_000_000)),
        Err(Error::Domain(_))
    ));
}
#[test]
fn interference_bound_budget_and_domain_are_not_negative_verdicts() {
    let (h, mut s) = operands();
    assert!(matches!(
        bound(&h, &s, 381., &Budget::new(1)),
        Err(Error::Budget(_))
    ));
    s.origin[0] = 0.01;
    assert!(matches!(
        bound(&h, &s, 381., &Budget::new(8_000_000)),
        Err(Error::Domain(_))
    ));
    let (h, mut s) = operands();
    s.to = 31.;
    assert!(matches!(
        bound(&h, &s, 381., &Budget::new(8_000_000)),
        Err(Error::Domain(_))
    ));
}
#[test]
fn interference_bound_directed_roots_enclose_non_squares() {
    for value in [0., 0.1, 2., 625., 1e-100, 1e100] {
        let v = q(value).unwrap();
        let (l, h) = root(&v).unwrap();
        assert!(square(&l).unwrap() <= v && square(&h).unwrap() >= v);
    }
}
