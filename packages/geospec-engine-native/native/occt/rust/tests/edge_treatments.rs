use geospec_engine_native_core::backend::brep::{
    BrepEntity, BrepSubject, CurveFacts, DocumentFacts, EdgeTreatmentBoundaryRole as Role,
    EdgeTreatmentCertificate, EdgeTreatmentCounts, EdgeTreatmentDisposition as Disposition,
    EdgeTreatmentInventory, EdgeTreatmentKind, EdgeTreatmentKind::*, EdgeTreatmentLabel,
    EdgeTreatmentMaterialSide, EdgeTreatmentResidualKind as Residual, LocatedFace,
    ResolvedSourceFace, SourceFaceKey, SurfaceFacts,
};
use geospec_engine_native_occt::Document;
use std::{collections::BTreeSet, path::PathBuf, rc::Rc};

// Frozen from independent AP242 source and fixture observations, before query execution.
// This is nominal imported-geometry accuracy, not a recognition or matcher tolerance.
const ACCURACY_MM: f64 = 1.0e-7;
struct Occurrence {
    name: &'static str,
    route: u32,
    source_faces: &'static [(u32, bool)],
    placement: [f64; 12],
    member: bool,
}
struct Case {
    file: &'static str,
    root: &'static str,
    kind: Option<EdgeTreatmentKind>,
    occurrences: &'static [Occurrence],
    uses: u32,
}
const CASES: &[Case] = &[
    Case {
        file: "01-planar-chamfer.step",
        root: "m3-edge-planar-chamfer",
        kind: Some(PlanarChamfer),
        occurrences: &[Occurrence {
            name: "planar-chamfer-part",
            route: 450,
            source_faces: &[
                (35, false),
                (155, false),
                (231, false),
                (307, false),
                (378, false),
                (425, false),
                (433, true),
            ],
            placement: [1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0],
            member: true,
        }],
        uses: 30,
    },
    Case {
        file: "02-cylindrical-fillet.step",
        root: "m3-edge-cylindrical-fillet",
        kind: Some(CylindricalFillet),
        occurrences: &[Occurrence {
            name: "cylindrical-fillet-part",
            route: 452,
            source_faces: &[
                (35, false),
                (155, false),
                (231, true),
                (309, false),
                (380, false),
                (427, false),
                (435, true),
            ],
            placement: [1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0],
            member: true,
        }],
        uses: 30,
    },
    Case {
        file: "03-conical-chamfer.step",
        root: "m3-edge-conical-chamfer",
        kind: Some(ConicalChamfer),
        occurrences: &[Occurrence {
            name: "conical-chamfer-part",
            route: 195,
            source_faces: &[(35, false), (72, true), (127, true), (182, true)],
            placement: [1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0],
            member: true,
        }],
        uses: 10,
    },
    Case {
        file: "04-toroidal-fillet.step",
        root: "m3-edge-toroidal-fillet",
        kind: Some(ToroidalFillet),
        occurrences: &[Occurrence {
            name: "toroidal-fillet-part",
            route: 196,
            source_faces: &[(35, false), (72, true), (127, true), (183, true)],
            placement: [1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0],
            member: true,
        }],
        uses: 10,
    },
    Case {
        file: "05-plain-box.step",
        root: "m3-edge-plain-box",
        kind: None,
        occurrences: &[Occurrence {
            name: "plain-box-part",
            route: 372,
            source_faces: &[
                (35, false),
                (155, true),
                (255, false),
                (302, true),
                (349, false),
                (356, true),
            ],
            placement: [1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0],
            member: false,
        }],
        uses: 24,
    },
    Case {
        file: "06-full-cylinder.step",
        root: "m3-edge-full-cylinder",
        kind: None,
        occurrences: &[Occurrence {
            name: "full-cylinder-part",
            route: 140,
            source_faces: &[(35, true), (123, true), (127, false)],
            placement: [1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0],
            member: false,
        }],
        uses: 6,
    },
    Case {
        file: "07-rotated-planar-chamfer.step",
        root: "m3-edge-rotated-planar-chamfer",
        kind: Some(PlanarChamfer),
        occurrences: &[Occurrence {
            name: "rotated-planar-chamfer-part",
            route: 450,
            source_faces: &[
                (35, false),
                (155, false),
                (231, false),
                (307, false),
                (378, false),
                (425, false),
                (433, true),
            ],
            placement: [
                0.6, -0.8, 0.0, 20.0, 0.8, 0.6, 0.0, 30.0, 0.0, 0.0, 1.0, 40.0,
            ],
            member: true,
        }],
        uses: 30,
    },
    Case {
        file: "08-rotated-plain-box.step",
        root: "m3-edge-rotated-plain-box",
        kind: None,
        occurrences: &[Occurrence {
            name: "rotated-plain-box-part",
            route: 372,
            source_faces: &[
                (35, false),
                (155, true),
                (255, false),
                (302, true),
                (349, false),
                (356, true),
            ],
            placement: [
                0.6, -0.8, 0.0, 20.0, 0.8, 0.6, 0.0, 30.0, 0.0, 0.0, 1.0, 40.0,
            ],
            member: false,
        }],
        uses: 24,
    },
    Case {
        file: "09-unrelated-planar-assembly.step",
        root: "m3-edge-unrelated-planar-assembly",
        kind: Some(PlanarChamfer),
        occurrences: &[
            Occurrence {
                name: "planar-chamfer-part",
                route: 454,
                source_faces: &[
                    (39, false),
                    (159, false),
                    (235, false),
                    (311, false),
                    (382, false),
                    (429, false),
                    (437, true),
                ],
                placement: [1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0],
                member: true,
            },
            Occurrence {
                name: "unrelated-box",
                route: 803,
                source_faces: &[
                    (466, false),
                    (586, true),
                    (686, false),
                    (733, true),
                    (780, false),
                    (787, true),
                ],
                placement: [1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0],
                member: false,
            },
        ],
        uses: 54,
    },
    Case {
        file: "10-unrelated-cylinder-assembly.step",
        root: "m3-edge-unrelated-cylinder-assembly",
        kind: None,
        occurrences: &[
            Occurrence {
                name: "full-cylinder-part",
                route: 144,
                source_faces: &[(39, true), (127, true), (131, false)],
                placement: [1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0],
                member: false,
            },
            Occurrence {
                name: "unrelated-box",
                route: 493,
                source_faces: &[
                    (156, false),
                    (276, true),
                    (376, false),
                    (423, true),
                    (470, false),
                    (477, true),
                ],
                placement: [1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0],
                member: false,
            },
        ],
        uses: 30,
    },
    Case {
        file: "11-shared-fillet-instances.step",
        root: "m3-edge-shared-fillet-instances",
        kind: Some(CylindricalFillet),
        occurrences: &[
            Occurrence {
                name: "fillet-instance-a",
                route: 456,
                source_faces: &[
                    (39, false),
                    (159, false),
                    (235, true),
                    (313, false),
                    (384, false),
                    (431, false),
                    (439, true),
                ],
                placement: [1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0],
                member: true,
            },
            Occurrence {
                name: "fillet-instance-b",
                route: 462,
                source_faces: &[
                    (39, false),
                    (159, false),
                    (235, true),
                    (313, false),
                    (384, false),
                    (431, false),
                    (439, true),
                ],
                placement: [1.0, 0.0, 0.0, 30.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0],
                member: true,
            },
        ],
        uses: 60,
    },
];

type Observed<T> = Result<T, String>;
#[derive(Debug)]
struct Observation {
    facts: Observed<Rc<DocumentFacts>>,
    faces: Vec<Observed<Rc<[LocatedFace]>>>,
    sources: Vec<Vec<Observed<ResolvedSourceFace>>>,
    counts: Observed<EdgeTreatmentCounts>,
    inventory: Observed<EdgeTreatmentInventory>,
}

fn observe(case: &Case) -> Observed<Observation> {
    let bytes = std::fs::read(
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("tests/fixtures/edge-treatments")
            .join(case.file),
    )
    .map_err(|error| format!("fixture: {error}"))?;
    let document = Document::from_step(&bytes).map_err(|error| format!("admission: {error:?}"))?;
    // Independent calls: a counts/facts/source-association error does not suppress the inventory.
    let counts = document
        .edge_treatment_counts()
        .map_err(|error| format!("counts: {error:?}"));
    let inventory = document
        .edge_treatments(
            case.occurrences
                .iter()
                .map(|occurrence| occurrence.source_faces.len())
                .sum(),
        )
        .map_err(|error| format!("inventory: {error:?}"));
    let facts = document
        .facts()
        .map_err(|error| format!("facts: {error:?}"));
    let faces = case
        .occurrences
        .iter()
        .enumerate()
        .map(|(index, _)| {
            document
                .occurrence_faces(index as u32)
                .map_err(|error| format!("faces: {error:?}"))
        })
        .collect();
    let sources = case
        .occurrences
        .iter()
        .map(|occurrence| {
            occurrence
                .source_faces
                .iter()
                .map(|(entity, _)| {
                    document
                        .resolve_source_face(&SourceFaceKey {
                            source_face_entity: *entity,
                            occurrence_route: vec![occurrence.route],
                        })
                        .map_err(|error| format!("source #{entity}: {error:?}"))
                })
                .collect()
        })
        .collect();
    Ok(Observation {
        facts,
        faces,
        sources,
        counts,
        inventory,
    })
}

fn near(a: f64, b: f64) -> bool {
    a.is_finite() && b.is_finite() && (a - b).abs() <= ACCURACY_MM
}
fn point_near(a: [f64; 3], b: [f64; 3]) -> bool {
    a.into_iter().zip(b).all(|(a, b)| near(a, b))
}
fn placed(point: [f64; 3], m: &[f64; 12]) -> [f64; 3] {
    std::array::from_fn(|i| {
        m[4 * i] * point[0] + m[4 * i + 1] * point[1] + m[4 * i + 2] * point[2] + m[4 * i + 3]
    })
}
fn surface_finite(surface: &SurfaceFacts) -> bool {
    match surface {
        SurfaceFacts::Plane { origin, normal } => {
            origin.iter().chain(normal).all(|x| x.is_finite())
        }
        SurfaceFacts::Cylinder {
            origin,
            axis,
            radius,
        } => {
            origin.iter().chain(axis).all(|x| x.is_finite()) && radius.is_finite() && *radius > 0.0
        }
        SurfaceFacts::Cone {
            origin,
            axis,
            reference_radius,
            semi_angle,
        } => {
            origin.iter().chain(axis).all(|x| x.is_finite())
                && reference_radius.is_finite()
                && *reference_radius > 0.0
                && semi_angle.is_finite()
        }
        SurfaceFacts::Torus {
            center,
            axis,
            major_radius,
            minor_radius,
        } => {
            center.iter().chain(axis).all(|x| x.is_finite())
                && major_radius.is_finite()
                && minor_radius.is_finite()
                && *major_radius > 0.0
                && *minor_radius > 0.0
        }
        _ => false,
    }
}
struct Checks {
    context: String,
    failures: Vec<String>,
}
impl Checks {
    fn require(&mut self, condition: bool, message: &str) {
        if !condition {
            self.failures.push(format!("{}: {message}", self.context));
        }
    }
    fn result<'a, T>(&mut self, result: &'a Observed<T>) -> Option<&'a T> {
        match result {
            Ok(value) => Some(value),
            Err(error) => {
                self.failures.push(format!("{}: {error}", self.context));
                None
            }
        }
    }
}

fn certificate(
    check: &mut Checks,
    value: &EdgeTreatmentCertificate,
    kind: EdgeTreatmentKind,
    occurrence: &Occurrence,
    faces: &[LocatedFace],
) {
    let revolved = matches!(kind, ConicalChamfer | ToroidalFillet);
    let fillet = matches!(kind, CylindricalFillet | ToroidalFillet);
    check.require(
        value.kind == kind,
        "qualified family differs from frozen intent",
    );
    check.require(
        near(
            value.metric_value_mm,
            if kind == CylindricalFillet { 2.0 } else { 1.0 },
        ),
        "nominal metric exceeds independent 1e-7 mm accuracy",
    );
    check.require(
        value.material_side == EdgeTreatmentMaterialSide::Convex,
        "material-side branch must be convex",
    );
    check.require(
        value.wire_count == 1 && value.boundary_uses.len() == 4,
        "one complete four-use outer wire required",
    );
    check.require(value.full_u == revolved, "full-u branch differs");
    check.require(
        value
            .parameter_bounds
            .iter()
            .chain(&value.sweep_interval)
            .all(|x| x.is_finite())
            && value.sweep_interval[1] > value.sweep_interval[0],
        "finite nondegenerate trim/sweep required",
    );
    check.require(
        near(value.maximum_topology_tolerance_mm, ACCURACY_MM)
            && value.maximum_topology_tolerance_mm > 0.0,
        "topology tolerance differs",
    );
    check.require(
        surface_finite(&value.surface),
        "analytic surface must have finite parameters",
    );
    if let Some(face) = faces.get(2) {
        check.require(
            value.surface == face.facts.surface
                && value.parameter_bounds == face.facts.parameter_bounds,
            "certificate surface/trim must join the actual public face",
        );
    }
    let nominal_surface = match (&value.surface, kind) {
        (SurfaceFacts::Plane { origin, .. }, PlanarChamfer) => {
            point_near(*origin, placed([10.0, 11.0, 0.0], &occurrence.placement))
        }
        (SurfaceFacts::Cylinder { origin, radius, .. }, CylindricalFillet) => {
            near(*radius, 2.0)
                && point_near(*origin, placed([8.0, 10.0, 0.0], &occurrence.placement))
        }
        (
            SurfaceFacts::Cone {
                origin,
                reference_radius,
                semi_angle,
                ..
            },
            ConicalChamfer,
        ) => {
            point_near(*origin, [0.0, 0.0, 9.0])
                && near(*reference_radius, 5.0)
                && near((semi_angle.tan() - 1.0) * reference_radius, 0.0)
        }
        (
            SurfaceFacts::Torus {
                center,
                major_radius,
                minor_radius,
                ..
            },
            ToroidalFillet,
        ) => {
            point_near(*center, [0.0, 0.0, 9.0])
                && near(*major_radius, 4.0)
                && near(*minor_radius, 1.0)
        }
        _ => false,
    };
    check.require(
        nominal_surface,
        "analytic stored surface differs from independent construction",
    );
    for (index, support) in value.supports.iter().enumerate() {
        let ordinal = [1, 3][index];
        check.require(
            support.public_face_ordinal == ordinal && support.private_query_face == ordinal + 1,
            "support public/private rail ordering differs",
        );
        check.require(
            surface_finite(&support.surface)
                && support.parameter_bounds.iter().all(|x| x.is_finite())
                && support.maximum_topology_tolerance_mm > 0.0
                && support.maximum_topology_tolerance_mm <= ACCURACY_MM,
            "support premises must be finite and source-bounded",
        );
        if let Some(face) = faces.get(ordinal as usize) {
            check.require(
                support.surface == face.facts.surface
                    && support.parameter_bounds == face.facts.parameter_bounds
                    && support.transferred_reversed == face.reversed,
                "support must join its actual placed face",
            );
        }
        check.require(if revolved && index == 0 {
            matches!(support.surface, SurfaceFacts::Cylinder { radius, .. } if near(radius, 5.0))
        } else { matches!(support.surface, SurfaceFacts::Plane { .. }) }, "support family differs");
    }
    let (ids, roles, reversed, lengths) = match kind {
        PlanarChamfer => (
            [5, 9, 8, 7],
            [Role::Rail0, Role::End, Role::Rail1, Role::End],
            [true, false, false, true],
            [14.0, 2.0_f64.sqrt(), 14.0, 2.0_f64.sqrt()],
        ),
        CylindricalFillet => (
            [7, 8, 9, 5],
            [Role::End, Role::Rail1, Role::End, Role::Rail0],
            [false, false, true, true],
            [std::f64::consts::PI, 14.0, std::f64::consts::PI, 14.0],
        ),
        ConicalChamfer => (
            [2, 3, 4, 3],
            [Role::Rail0, Role::Seam, Role::Rail1, Role::Seam],
            [false, false, true, true],
            [
                10.0 * std::f64::consts::PI,
                2.0_f64.sqrt(),
                8.0 * std::f64::consts::PI,
                2.0_f64.sqrt(),
            ],
        ),
        ToroidalFillet => (
            [2, 3, 4, 3],
            [Role::Rail0, Role::Seam, Role::Rail1, Role::Seam],
            [false, false, true, true],
            [
                10.0 * std::f64::consts::PI,
                std::f64::consts::FRAC_PI_2,
                8.0 * std::f64::consts::PI,
                std::f64::consts::FRAC_PI_2,
            ],
        ),
    };
    for (index, boundary) in value.boundary_uses.iter().take(4).enumerate() {
        check.require(
            boundary.owning_solid_edge_ordinal == ids[index] + 1
                && boundary.wire_ordinal == 0
                && boundary.role == roles[index]
                && boundary.reversed == reversed[index]
                && boundary.seam == (roles[index] == Role::Seam),
            "ordered boundary identity/orientation/role differs; seam uses cannot be deduplicated",
        );
        check.require(
            near(boundary.length_mm, lengths[index]) && boundary.length_mm > 0.0,
            "boundary length differs from analytic line/circle length",
        );
        check.require(
            boundary
                .start
                .iter()
                .chain(&boundary.end)
                .chain(&boundary.parameter_range)
                .all(|x| x.is_finite())
                && boundary.parameter_range[1] > boundary.parameter_range[0],
            "boundary coordinates/ranges must be finite and nondegenerate",
        );
        check.require(
            [
                boundary.edge_tolerance_mm,
                boundary.vertex_tolerances_mm[0],
                boundary.vertex_tolerances_mm[1],
            ]
            .iter()
            .all(|x| x.is_finite() && *x >= 0.0 && *x <= ACCURACY_MM),
            "boundary tolerances exceed source premises",
        );
        let rail = match boundary.role {
            Role::Rail0 => Some(0),
            Role::Rail1 => Some(1),
            _ => None,
        };
        if let Some(rail) = rail {
            if revolved {
                check.require(matches!(boundary.curve, CurveFacts::Circle { center, radius, .. }
                    if point_near(center, [0.0,0.0,9.0+rail as f64]) && near(radius,5.0-rail as f64)),
                    "circular rail radius/station differs");
                check.require(
                    point_near(boundary.start, boundary.end),
                    "circular rail must close",
                );
            } else {
                let xy = if fillet {
                    [[10.0, 10.0], [8.0, 12.0]]
                } else {
                    [[10.0, 11.0], [9.0, 12.0]]
                }[rail];
                let a = placed([xy[0], xy[1], 0.0], &occurrence.placement);
                let b = placed([xy[0], xy[1], 14.0], &occurrence.placement);
                check.require(
                    matches!(boundary.curve, CurveFacts::Line { .. })
                        && ((point_near(boundary.start, a) && point_near(boundary.end, b))
                            || (point_near(boundary.start, b) && point_near(boundary.end, a))),
                    "placed longitudinal rail endpoints differ from frozen construction",
                );
            }
        }
        check.require(
            match &boundary.curve {
                CurveFacts::Line { origin, direction } => {
                    origin.iter().chain(direction).all(|x| x.is_finite())
                }
                CurveFacts::Circle {
                    center,
                    axis,
                    radius,
                } => {
                    center.iter().chain(axis).all(|x| x.is_finite())
                        && radius.is_finite()
                        && *radius > 0.0
                }
                _ => false,
            },
            "complete analytic boundary curve required",
        );
    }
    check.require(
        !value.residuals.is_empty() && value.residuals.len() <= 16,
        "bounded complete residual evidence required",
    );
    // Principal residual-evidence-review-a1: coincidence has family-specific premises.
    if kind == ConicalChamfer {
        check.require(
            value.residuals.iter().map(|r| r.kind).eq([
                Residual::AxisCoincidence,
                Residual::ParallelDirection,
                Residual::ParallelDirection,
                Residual::ParallelDirection,
                Residual::RailStation, // Plane-support rail.
                Residual::RailStation, // Cylinder-support rail.
                Residual::EqualOffsets,
                Residual::MaterialBranch,
                Residual::RailStation, // Complete trim, one row per ordered use.
                Residual::RailStation,
                Residual::RailStation,
                Residual::RailStation,
            ]),
            "conical axis/directions/support stations/offset/material/four-use trim premises differ",
        );
    } else {
        check.require(
            value
                .residuals
                .iter()
                .any(|r| r.kind == Residual::RailCoincidence),
            "required rail coincidence residual is absent",
        );
    }
    for required in [
        Residual::MaterialBranch,
        if fillet {
            Residual::TangentDirection
        } else {
            Residual::EqualOffsets
        },
    ] {
        check.require(
            value.residuals.iter().any(|r| r.kind == required),
            "required geometric premise residual is absent",
        );
    }
    if kind == ToroidalFillet {
        check.require(
            value.residuals.iter().take(4).map(|r| r.kind).eq([
                Residual::AxisCoincidence,
                Residual::ParallelDirection,
                Residual::ParallelDirection,
                Residual::RailStation, // The angular quarter-sweep, not a dimensional station.
            ]) && value
                .residuals
                .iter()
                .filter(|r| r.kind == Residual::RailStation)
                .count()
                == 7,
            "toroidal sweep/two-support/four-trim station premises differ",
        );
        if let Some(sweep) = value.residuals.get(3) {
            let rail_scale = value
                .boundary_uses
                .iter()
                .filter(|boundary| matches!(boundary.role, Role::Rail0 | Role::Rail1))
                .map(|boundary| boundary.length_mm)
                .fold(f64::INFINITY, f64::min);
            let expected = ((value.parameter_bounds[3] - value.parameter_bounds[2])
                - std::f64::consts::FRAC_PI_2)
                .abs()
                * rail_scale;
            check.require(
                sweep.scale_mm == rail_scale && near(sweep.value_mm, expected)
                    && value.sweep_interval == [value.parameter_bounds[2], value.parameter_bounds[3]],
                "toroidal angular station must retain actual quarter-sweep formula and minimum rail scale",
            );
        }
    }
    for (index, residual) in value.residuals.iter().enumerate() {
        check.require(
            residual.value_mm.is_finite()
                && residual.value_mm >= 0.0
                && residual.limit_mm.is_finite()
                && residual.limit_mm >= 0.0
                && residual.limit_mm <= value.maximum_topology_tolerance_mm
                && residual.value_mm <= residual.limit_mm
                && residual.scale_mm.is_finite()
                && residual.scale_mm > 0.0,
            "residual must satisfy its finite declared topology premise",
        );
        let angular_torus_station =
            kind == ToroidalFillet && index == 3 && residual.kind == Residual::RailStation;
        if !angular_torus_station
            && !matches!(
                residual.kind,
                Residual::ParallelDirection | Residual::TangentDirection | Residual::MaterialBranch
            )
        {
            check.require(
                residual.scale_mm == 1.0,
                "dimensional residual must retain unit scale",
            );
        }
    }
}

#[test]
fn should_qualify_four_edge_treatment_families_and_preserve_all_occurrence_evidence() {
    // Collect and print all eleven ordinary cells BEFORE assertions.
    let observations: Vec<_> = CASES
        .iter()
        .map(|case| {
            let observation = observe(case);
            eprintln!(
                "EDGE_TREATMENTS fixture={} observation={observation:#?}",
                case.file
            );
            observation
        })
        .collect();
    let mut check = Checks {
        context: String::new(),
        failures: Vec::new(),
    };
    for (case, observation) in CASES.iter().zip(&observations) {
        check.context = case.file.into();
        let Some(observation) = check.result(observation) else {
            continue;
        };
        let expected_faces: usize = case.occurrences.iter().map(|o| o.source_faces.len()).sum();
        let expected_counts = EdgeTreatmentCounts {
            public_face_count: expected_faces as u32,
            candidate_edge_use_count: case.uses,
        };
        if let Some(counts) = check.result(&observation.counts) {
            check.require(
                *counts == expected_counts,
                "counts must include all faces and repeated oriented seam uses",
            );
        }
        if let Some(facts) = check.result(&observation.facts) {
            check.require(
                facts.source_unit_to_millimeters == 1.0 && facts.shape.valid,
                "valid millimeter source admission required",
            );
            check.require(
                facts.occurrences.len() == case.occurrences.len(),
                "occurrence count differs",
            );
            check.require(
                facts
                    .products
                    .iter()
                    .any(|product| product.name == case.root),
                "original root product identity differs",
            );
            for (actual, expected) in facts.occurrences.iter().zip(case.occurrences) {
                check.require(
                    actual.path == expected.name,
                    "source occurrence path differs",
                );
                check.require(
                    actual
                        .placement
                        .iter()
                        .zip(expected.placement)
                        .all(|(a, b)| near(*a, b)),
                    "rigid occurrence placement differs",
                );
            }
            if case.file == "11-shared-fillet-instances.step" && facts.occurrences.len() == 2 {
                check.require(
                    facts.occurrences[0].product == facts.occurrences[1].product
                        && facts.occurrences[0].label != facts.occurrences[1].label,
                    "two actual occurrences must share one source product definition",
                );
            }
        }
        let Some(inventory) = check.result(&observation.inventory) else {
            continue;
        };
        check.require(
            inventory.counts == expected_counts && inventory.rows.len() == expected_faces,
            "inventory must contain exactly one row per scoped face",
        );
        check.require(
            inventory.owned_bytes() <= 1024 * 1024,
            "owned Rust inventory exceeds transfer ceiling",
        );
        let mut offset = 0;
        let mut source_keys = BTreeSet::new();
        let mut members = 0;
        for (occurrence_index, expected) in case.occurrences.iter().enumerate() {
            let faces = check.result(&observation.faces[occurrence_index]);
            if let Some(faces) = faces {
                check.require(
                    faces.len() == expected.source_faces.len(),
                    "complete public face enumeration differs",
                );
            }
            for (ordinal, (_, same_sense)) in expected.source_faces.iter().enumerate() {
                check.context =
                    format!("{} occurrence={occurrence_index} face={ordinal}", case.file);
                let Some(row) = inventory.rows.get(offset + ordinal) else {
                    continue;
                };
                check.require(
                    row.occurrence == Some(occurrence_index as u32)
                        && row.occurrence_path == expected.name
                        && row.public_face_ordinal == ordinal as u32
                        && row.private_query_face == ordinal as u32 + 1
                        && row.owning_solid_ordinal == Some(0),
                    "row scope/public/private/owner join differs",
                );
                check.require(
                    row.source_same_sense == Some(*same_sense)
                        && row.transferred_reversed != *same_sense,
                    "source same-sense or placed orientation differs",
                );
                check.require(
                    row.label == EdgeTreatmentLabel::Absent,
                    "absent source label must not be synthesized",
                );
                check.require(
                    row.source_face_key
                        .as_ref()
                        .is_some_and(|key| !key.is_empty() && source_keys.insert(key.clone())),
                    "complete occurrence-distinct source keys required",
                );
                if let Some(source) = check.result(&observation.sources[occurrence_index][ordinal])
                {
                    check.require(
                        source.occurrence == occurrence_index as u32
                            && source.public_face_ordinal == row.public_face_ordinal
                            && source.private_query_face == row.private_query_face
                            && source.source_same_sense == *same_sense
                            && source.transferred_reversed == row.transferred_reversed,
                        "independent Part21 source route must resolve to this row",
                    );
                }
                if let Some(face) = faces.and_then(|f| f.get(ordinal)) {
                    check.require(
                        face.entity
                            == BrepEntity::Face {
                                occurrence: occurrence_index as u32,
                                face: row.private_query_face,
                            }
                            && face.facts.index == row.public_face_ordinal
                            && face.reversed == row.transferred_reversed,
                        "row must join the public located face",
                    );
                }
                for (is_fillet, disposition) in [(false, &row.chamfer), (true, &row.fillet)] {
                    let wanted = case.kind.filter(|kind| {
                        expected.member
                            && ordinal == 2
                            && is_fillet == matches!(kind, CylindricalFillet | ToroidalFillet)
                    });
                    match (wanted,disposition) {
                        (Some(kind),Disposition::Qualified(value)) => {
                            members += 1;
                            if let Some(faces) = faces { certificate(&mut check,value,kind,expected,faces); }
                        }
                        (None,Disposition::NonMember(_)) => {}
                        _ => check.failures.push(format!("{}: expected {wanted:?}, actual {disposition:?}; refusal is outstanding capability",
                            check.context)),
                    }
                }
            }
            offset += expected.source_faces.len();
        }
        check.require(
            members == case.occurrences.iter().filter(|o| o.member).count(),
            "all qualified occurrence members must survive equal-metric/source-definition sharing",
        );
    }
    assert!(check.failures.is_empty(), "{}", check.failures.join("\n"));
}
