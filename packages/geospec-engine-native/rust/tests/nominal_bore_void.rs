//! Semantic arithmetic controls. The certificate helper is frozen C1 transport
//! evidence reused from cylindrical_band_core.rs, not a new kernel oracle.
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

fn certificate() -> SelectedBoreVoid {
    let mut band = cartesian_certificate();
    band.occurrence = 0;
    band.origin = [0.0; 3];
    band.axis = [0.0, 0.0, 1.0];
    band.radius = 4.03;
    band.from = 0.0;
    band.to = 45.0;
    band.transferred_reversed = true;
    SelectedBoreVoid {
        band,
        maximum_topology_tolerance_mm: 1e-7,
        ends: std::array::from_fn(|i| CircularBoreEnd {
            owning_solid_edge_ordinal: i as u32 + 1,
            adjacent_public_face_ordinal: i as u32,
            termination: CircularBoreTermination::Mouth,
        }),
    }
}
fn claim() -> Claim {
    Claim {
        materials: vec![0],
        material_paths: vec!["guide".into()],
        waypoints: vec![[0.0, 0.0, 3.0], [0.0, 0.0, 42.0]],
        region: Bounds {
            min: [-12.0, -12.0, -2.0],
            max: [12.0, 12.0, 47.0],
        },
        isolated_from: vec![],
        min_cross_section: None,
    }
}
#[test]
fn nominal_bore_void_positive_path_and_uniform_bound() {
    let b = certificate();
    let mut c = claim();
    let proof = prove(&c, &b).unwrap();
    assert!(format!("{proof:?}").contains("globalMinimumClaimed"));
    c.min_cross_section = Some(1.0);
    assert!(prove(&c, &b).is_ok());
    c.min_cross_section = Some(100.0);
    assert!(prove(&c, &b).is_err());
    c.min_cross_section = None;
    c.waypoints.reverse();
    assert!(prove(&c, &b).is_ok());
}
#[test]
fn nominal_bore_void_rejects_unproved_constraints_and_scope() {
    let b = certificate();
    let mut c = claim();
    c.materials = vec![1];
    assert!(prove(&c, &b).is_err());
    c = claim();
    c.materials.push(1);
    assert!(prove(&c, &b).is_err());
    c = claim();
    c.isolated_from.push([11.0, 0.0, 4.0]);
    assert!(prove(&c, &b).is_err());
    c = claim();
    c.waypoints[0][0] = 1.0;
    assert!(prove(&c, &b).is_err());
    c = claim();
    c.waypoints[0][2] = 0.0;
    assert!(prove(&c, &b).is_err());
    c = claim();
    c.region.max[0] = 1.0;
    assert!(prove(&c, &b).is_err());
    let mut b = b;
    b.ends[0].termination = CircularBoreTermination::PlanarDiskBottom;
    assert!(prove(&claim(), &b).is_err());
}
