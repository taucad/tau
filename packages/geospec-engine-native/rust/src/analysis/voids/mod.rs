//! Exact CSG, decomposition, winding-number, and section void proof.

pub(crate) mod nominal_bore;

use crate::{
    backend::{
        brep::{Bounds, BrepEntity, TessellationProfile},
        csg::{BooleanOp, Section, SectionComponent, SolidId},
        csg_scope::CsgScope,
        BackendError, BackendErrorKind, TriangleMesh,
    },
    codec::Json,
    result::Diagnostic,
    subject::Subject,
};

pub(crate) const TESSELLATION_PROFILE: TessellationProfile = TessellationProfile {
    linear_deflection_mm: 0.02,
    angular_deflection_rad: 15.0_f64.to_radians(),
};
const SECTION_SPACING_MM: f64 = 2.0;
const OPEN_RESIDUAL_LIMIT: f64 = 0.25;

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct Claim {
    pub waypoints: Vec<[f64; 3]>,
    pub materials: Vec<u32>,
    pub material_paths: Vec<String>,
    pub region: Bounds,
    pub isolated_from: Vec<[f64; 3]>,
    pub min_cross_section: Option<f64>,
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct Reading {
    pub point: [f64; 3],
    pub signature: String,
    pub open: bool,
    pub residual: f64,
    pub winding_numbers: Vec<f64>,
    pub shell_membership: Vec<i64>,
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct MaterialEvidence {
    pub occurrence: u32,
    pub path: String,
    pub bounds: Bounds,
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct SectionStation {
    pub segment_index: usize,
    pub step_index: usize,
    pub step_count: usize,
    pub fraction: f64,
    pub center: [f64; 3],
    pub transformed_point: [f64; 3],
    pub section: Section,
    pub member_component: Option<usize>,
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct Bottleneck {
    pub area: f64,
    pub center: [f64; 3],
    pub station_index: usize,
    pub member_component: usize,
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct Evidence {
    pub region: Bounds,
    pub materials: Vec<MaterialEvidence>,
    pub shell_count: usize,
    pub materials_strictly_interior: bool,
    pub materials_pairwise_aabb_disjoint: bool,
    pub waypoint_readings: Vec<Reading>,
    pub isolation_readings: Vec<Reading>,
    pub section_stations: Vec<SectionStation>,
    pub bottleneck: Option<Bottleneck>,
}

pub(crate) enum Decision {
    Decided {
        positive: bool,
        evidence: Evidence,
        diagnostics: Vec<Diagnostic>,
    },
    Refused {
        evidence: Option<Evidence>,
        diagnostics: Vec<Diagnostic>,
    },
}

pub(crate) fn prove(
    claim: &Claim,
    subject: &Subject,
    csg: &mut CsgScope<'_>,
) -> Result<Decision, BackendError> {
    let Some(_) = subject.brep.as_deref() else {
        return Ok(Decision::Refused {
            evidence: None,
            diagnostics: unsupported(
                "The topological void engine needs per-occurrence tessellation, which this subject does not provide.",
                "Load the subject through loadStep so the native STEP read can provide occurrence tessellation.",
                None,
            ),
        });
    };
    let mut material_solids = Vec::with_capacity(claim.materials.len());
    let mut material_bounds = Vec::with_capacity(claim.materials.len());
    let mut materials = Vec::with_capacity(claim.materials.len());
    for (position, occurrence) in claim.materials.iter().copied().enumerate() {
        // The retained AP242 subject owns this profile-keyed tessellation. It is
        // requested once here and never round-trips through a host object.
        csg.charge(1)?;
        let mesh = subject.tessellate(BrepEntity::Occurrence(occurrence), TESSELLATION_PROFILE)?;
        if mesh.triangles.is_empty() {
            return Ok(Decision::Refused {
                evidence: None,
                diagnostics: unsupported(
                    &format!(
                        "The topological void engine could not build a closed solid for material occurrence '{}'.",
                        claim.material_paths[position]
                    ),
                    "Repair or re-export the part so its tessellation is a closed oriented surface.",
                    Some(Json::object([(
                        "occurrence",
                        Json::string(&claim.material_paths[position]),
                    )])),
                ),
            });
        }
        let bounds = mesh_bounds(&mesh);
        material_bounds.push(bounds);
        materials.push(MaterialEvidence {
            occurrence,
            path: claim.material_paths[position].clone(),
            bounds,
        });
        match csg.admit(&mesh, &[]) {
            Ok(solid) => material_solids.push(solid),
            Err(error) if error.kind == BackendErrorKind::InvalidInput => {
                return Ok(Decision::Refused {
                    evidence: None,
                    diagnostics: unsupported(
                        &format!(
                            "The topological void engine could not build a closed solid for material occurrence '{}'.",
                            claim.material_paths[position]
                        ),
                        "Repair or re-export the part so its tessellation is a closed oriented surface.",
                        Some(Json::object([
                            ("backendReason", Json::string(&error.message)),
                            (
                                "occurrence",
                                Json::string(&claim.material_paths[position]),
                            ),
                        ])),
                    ),
                })
            }
            Err(error) => return Err(error),
        }
    }
    let interior = material_bounds
        .iter()
        .all(|bounds| strictly_inside(*bounds, claim.region));
    let disjoint = pairwise_aabb_disjoint(&material_bounds);
    let region = csg.admit(&box_mesh(claim.region), &[])?;
    let union = if material_solids.len() == 1 {
        material_solids[0]
    } else {
        csg.boolean(BooleanOp::Union, &material_solids)?
    };
    let void = csg.boolean(BooleanOp::Difference, &[region, union])?;
    if csg.properties(void)?.is_empty {
        return Ok(Decision::Refused {
            evidence: None,
            diagnostics: unsupported(
                "The topological void engine found no void at all: the material fills the region.",
                "Widen `bounds`, or narrow the material set to the occurrences that actually bound the void.",
                None,
            ),
        });
    }
    let decomposed = csg.decompose(void)?;
    let mut shells = Vec::with_capacity(decomposed.len());
    for solid in decomposed {
        let mesh = csg.export(solid)?.mesh;
        csg.charge(
            (mesh.positions.len() as u64)
                .saturating_add((mesh.triangles.len() as u64).saturating_mul(3)),
        )?;
        shells.push(mesh);
    }
    let waypoint_readings: Vec<_> = claim
        .waypoints
        .iter()
        .copied()
        .map(|point| {
            csg.charge(1)?;
            Ok(shell_reading(&shells, point))
        })
        .collect::<Result<_, BackendError>>()?;
    let mut evidence = Evidence {
        region: claim.region,
        materials,
        shell_count: shells.len(),
        materials_strictly_interior: interior,
        materials_pairwise_aabb_disjoint: disjoint,
        waypoint_readings,
        isolation_readings: Vec::new(),
        section_stations: Vec::new(),
        bottleneck: None,
    };
    for (index, reading) in evidence.waypoint_readings.iter().enumerate() {
        if reading.residual > OPEN_RESIDUAL_LIMIT {
            return Ok(Decision::Refused {
                evidence: Some(evidence.clone()),
                diagnostics: unsupported(
                    &format!(
                        "Void waypoint {index} at [{}] sits on a void boundary, so no side can be named.",
                        joined_point(reading.point)
                    ),
                    "Move the waypoint clear of the material surface.",
                    Some(Json::object([("waypoint", point_json(reading.point))])),
                ),
            });
        }
        if !reading.open {
            return Ok(Decision::Decided {
                positive: false,
                evidence: evidence.clone(),
                diagnostics: mismatch(
                    format!(
                        "Void waypoint {index} at [{}] is inside material, not in the void.",
                        joined_point(reading.point)
                    ),
                    "Move the waypoint into the cavity, or correct the material set.",
                    Some(reading.point),
                    Json::object([("waypoint", point_json(reading.point))]),
                ),
            });
        }
    }
    let first_signature = evidence.waypoint_readings[0].signature.clone();
    for (index, reading) in evidence.waypoint_readings.iter().enumerate() {
        if reading.signature != first_signature {
            return Ok(Decision::Decided {
                positive: false,
                evidence: evidence.clone(),
                diagnostics: mismatch(
                    format!(
                        "The void path is broken: waypoint {index} at [{}] lies in a different void body from waypoint 0.",
                        joined_point(reading.point)
                    ),
                    "Open the passage between the waypoints, or assert the two voids separately.",
                    Some(reading.point),
                    Json::object([("waypoint", point_json(reading.point))]),
                ),
            });
        }
    }
    for probe in claim.isolated_from.iter().copied() {
        csg.charge(1)?;
        let reading = shell_reading(&shells, probe);
        evidence.isolation_readings.push(reading.clone());
        if reading.residual > OPEN_RESIDUAL_LIMIT || !reading.open {
            return Ok(Decision::Refused {
                evidence: Some(evidence),
                diagnostics: unsupported(
                    &format!(
                        "The isolation probe [{}] is not in the void, so isolation from it would hold vacuously.",
                        joined_point(probe)
                    ),
                    "Place the isolation probe in the space that must stay unreachable.",
                    Some(Json::object([("probe", point_json(probe))])),
                ),
            });
        }
        if reading.signature == first_signature {
            return Ok(Decision::Decided {
                positive: false,
                evidence,
                diagnostics: mismatch(
                    format!(
                        "Void isolation breached: [{}] is reachable from the declared path void.",
                        joined_point(probe)
                    ),
                    "Seal the passage, or drop the isolation claim.",
                    Some(probe),
                    Json::object([("probe", point_json(probe))]),
                ),
            });
        }
    }
    if let Some(minimum) = claim.min_cross_section {
        let lumen = lumen_bottleneck(csg, void, &claim.waypoints)?;
        evidence.section_stations = lumen.stations;
        let Some(bottleneck) = lumen.bottleneck else {
            return Ok(Decision::Refused {
                evidence: Some(evidence),
                diagnostics: unsupported(
                    "The topological void engine could not section the lumen along the declared path.",
                    "Move the waypoints inside the passage being measured.",
                    None,
                ),
            });
        };
        let area = bottleneck.area;
        let center = bottleneck.center;
        evidence.bottleneck = Some(bottleneck);
        if area < minimum {
            return Ok(Decision::Decided {
                positive: false,
                evidence,
                diagnostics: mismatch(
                    format!(
                        "The void lumen narrows to {area:.3} mm², below the declared {minimum} mm² minimum cross-section."
                    ),
                    "Open the throat, or lower the declared minimum cross-section.",
                    Some(center),
                    Json::object([
                        ("measuredCrossSection", Json::Number(area)),
                        ("minCrossSection", Json::Number(minimum)),
                    ]),
                ),
            });
        }
    }
    Ok(Decision::Decided {
        positive: true,
        evidence,
        diagnostics: Vec::new(),
    })
}

struct LumenAnalysis {
    bottleneck: Option<Bottleneck>,
    stations: Vec<SectionStation>,
}

fn lumen_bottleneck(
    csg: &mut CsgScope<'_>,
    solid: SolidId,
    waypoints: &[[f64; 3]],
) -> Result<LumenAnalysis, BackendError> {
    let mut best = None;
    let mut stations = Vec::new();
    for (segment_index, segment) in waypoints.windows(2).enumerate() {
        let from = segment[0];
        let to = segment[1];
        let delta = subtract(to, from);
        let length = vector_length(delta);
        if length == 0.0 {
            continue;
        }
        let matrix = rotation_to_z(scale(delta, 1.0 / length));
        let rotated = csg.transform(solid, matrix)?;
        let steps = (length / SECTION_SPACING_MM).ceil().max(1.0) as usize;
        for step in 0..=steps {
            let t = step as f64 / steps as f64;
            let center = add(from, scale(delta, t));
            let station = apply_affine(matrix, center);
            let section = csg.slice(rotated, station[2])?;
            let member_component = section
                .components
                .iter()
                .position(|piece| point_in_component([station[0], station[1]], piece));
            let station_index = stations.len();
            if let Some(member_component) = member_component {
                let area = section.components[member_component].signed_area.abs();
                if best
                    .as_ref()
                    .is_none_or(|best: &Bottleneck| area < best.area)
                {
                    best = Some(Bottleneck {
                        area,
                        center,
                        station_index,
                        member_component,
                    });
                }
            }
            stations.push(SectionStation {
                segment_index,
                step_index: step,
                step_count: steps,
                fraction: t,
                center,
                transformed_point: station,
                section,
                member_component,
            });
        }
    }
    Ok(LumenAnalysis {
        bottleneck: best,
        stations,
    })
}

fn point_in_component(point: [f64; 2], component: &SectionComponent) -> bool {
    let mut inside = point_in_polygon(point, &component.outer);
    for hole in &component.holes {
        if point_in_polygon(point, hole) {
            inside = !inside;
        }
    }
    inside
}

fn point_in_polygon(point: [f64; 2], contour: &[[f64; 2]]) -> bool {
    let mut inside = false;
    if contour.is_empty() {
        return false;
    }
    let mut previous = contour.len() - 1;
    for index in 0..contour.len() {
        let a = contour[index];
        let b = contour[previous];
        if (a[1] > point[1]) != (b[1] > point[1])
            && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]
        {
            inside = !inside;
        }
        previous = index;
    }
    inside
}

fn shell_reading(shells: &[TriangleMesh], point: [f64; 3]) -> Reading {
    let mut winding_numbers = Vec::with_capacity(shells.len());
    let mut shell_membership = Vec::with_capacity(shells.len());
    let mut sum = 0.0;
    for shell in shells {
        let winding = generalized_winding_number(shell, point);
        sum += winding;
        winding_numbers.push(winding);
        shell_membership.push(winding.round() as i64);
    }
    Reading {
        point,
        signature: shell_membership
            .iter()
            .map(|value| value.to_string())
            .collect::<Vec<_>>()
            .join(","),
        open: sum.round() >= 1.0,
        residual: (sum - sum.round()).abs(),
        winding_numbers,
        shell_membership,
    }
}

fn generalized_winding_number(mesh: &TriangleMesh, point: [f64; 3]) -> f64 {
    let mut solid_angle = 0.0;
    for triangle in &mesh.triangles {
        let a = subtract(mesh.positions[triangle[0] as usize], point);
        let b = subtract(mesh.positions[triangle[1] as usize], point);
        let c = subtract(mesh.positions[triangle[2] as usize], point);
        let numerator = determinant(a, b, c);
        let denominator = vector_length(a) * vector_length(b) * vector_length(c)
            + dot(a, b) * vector_length(c)
            + dot(b, c) * vector_length(a)
            + dot(c, a) * vector_length(b);
        solid_angle += 2.0 * numerator.atan2(denominator);
    }
    solid_angle / (4.0 * std::f64::consts::PI)
}

fn box_mesh(bounds: Bounds) -> TriangleMesh {
    let [x0, y0, z0] = bounds.min;
    let [x1, y1, z1] = bounds.max;
    TriangleMesh {
        positions: vec![
            [x0, y0, z0],
            [x1, y0, z0],
            [x1, y1, z0],
            [x0, y1, z0],
            [x0, y0, z1],
            [x1, y0, z1],
            [x1, y1, z1],
            [x0, y1, z1],
        ],
        triangles: vec![
            [0, 2, 1],
            [0, 3, 2],
            [4, 5, 6],
            [4, 6, 7],
            [0, 1, 5],
            [0, 5, 4],
            [3, 7, 6],
            [3, 6, 2],
            [0, 4, 7],
            [0, 7, 3],
            [1, 2, 6],
            [1, 6, 5],
        ],
    }
}

fn mesh_bounds(mesh: &TriangleMesh) -> Bounds {
    let mut min = [f64::INFINITY; 3];
    let mut max = [f64::NEG_INFINITY; 3];
    for point in &mesh.positions {
        for axis in 0..3 {
            min[axis] = min[axis].min(point[axis]);
            max[axis] = max[axis].max(point[axis]);
        }
    }
    Bounds { min, max }
}

fn strictly_inside(inner: Bounds, outer: Bounds) -> bool {
    (0..3).all(|axis| inner.min[axis] > outer.min[axis] && inner.max[axis] < outer.max[axis])
}

fn pairwise_aabb_disjoint(bounds: &[Bounds]) -> bool {
    for left in 0..bounds.len() {
        for right in left + 1..bounds.len() {
            if (0..3).all(|axis| {
                bounds[left].max[axis] > bounds[right].min[axis]
                    && bounds[right].max[axis] > bounds[left].min[axis]
            }) {
                return false;
            }
        }
    }
    true
}

fn rotation_to_z(direction: [f64; 3]) -> [f64; 12] {
    let d = normalized(direction);
    if d[2] < -1.0 + 1e-9 {
        return [1.0, 0.0, 0.0, 0.0, 0.0, -1.0, 0.0, 0.0, 0.0, 0.0, -1.0, 0.0];
    }
    let vx = d[1];
    let vy = -d[0];
    let c = d[2];
    let k = 1.0 / (1.0 + c);
    [
        1.0 - k * vy * vy,
        k * vx * vy,
        vy,
        0.0,
        k * vx * vy,
        1.0 - k * vx * vx,
        -vx,
        0.0,
        -vy,
        vx,
        1.0 - k * (vx * vx + vy * vy),
        0.0,
    ]
}

fn apply_affine(matrix: [f64; 12], point: [f64; 3]) -> [f64; 3] {
    [
        matrix[0] * point[0] + matrix[1] * point[1] + matrix[2] * point[2] + matrix[3],
        matrix[4] * point[0] + matrix[5] * point[1] + matrix[6] * point[2] + matrix[7],
        matrix[8] * point[0] + matrix[9] * point[1] + matrix[10] * point[2] + matrix[11],
    ]
}

fn determinant(a: [f64; 3], b: [f64; 3], c: [f64; 3]) -> f64 {
    a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0])
        + a[2] * (b[0] * c[1] - b[1] * c[0])
}
fn dot(a: [f64; 3], b: [f64; 3]) -> f64 {
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}
fn add(a: [f64; 3], b: [f64; 3]) -> [f64; 3] {
    [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}
fn subtract(a: [f64; 3], b: [f64; 3]) -> [f64; 3] {
    [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}
fn scale(a: [f64; 3], value: f64) -> [f64; 3] {
    [a[0] * value, a[1] * value, a[2] * value]
}
fn vector_length(a: [f64; 3]) -> f64 {
    dot(a, a).sqrt()
}
fn normalized(a: [f64; 3]) -> [f64; 3] {
    let length = vector_length(a);
    if length == 0.0 {
        [0.0, 0.0, 1.0]
    } else {
        scale(a, 1.0 / length)
    }
}

fn point_json(point: [f64; 3]) -> Json {
    Json::Array(point.into_iter().map(Json::Number).collect())
}
fn joined_point(point: [f64; 3]) -> String {
    point
        .into_iter()
        .map(|value| ryu_js::Buffer::new().format_finite(value).to_owned())
        .collect::<Vec<_>>()
        .join(", ")
}
fn unsupported(message: &str, suggestion: &str, details: Option<Json>) -> Vec<Diagnostic> {
    let mut diagnostic = Diagnostic::error("GEOSPEC_VOID_CONTINUITY_UNSUPPORTED", message);
    diagnostic.suggestion = Some(suggestion.into());
    diagnostic.details = details;
    vec![diagnostic]
}
fn mismatch(
    message: String,
    suggestion: &str,
    center: Option<[f64; 3]>,
    details: Json,
) -> Vec<Diagnostic> {
    let mut diagnostic = Diagnostic::error("GEOSPEC_VOID_CONTINUITY_MISMATCH", message);
    diagnostic.suggestion = Some(suggestion.into());
    diagnostic.spatial = center.map(|center| Json::object([("center", point_json(center))]));
    let mut fields = vec![("engine".into(), Json::string("topological"))];
    if let Json::Object(mut rest) = details {
        fields.append(&mut rest);
    }
    diagnostic.details = Some(Json::Object(fields));
    vec![diagnostic]
}

pub(crate) fn evidence_json(evidence: &Evidence) -> Json {
    let mut fields = vec![
        ("engine".into(), Json::string("topological")),
        (
            "tessellationLinearDeflectionMm".into(),
            Json::Number(TESSELLATION_PROFILE.linear_deflection_mm),
        ),
        (
            "tessellationAngularDeflectionRadians".into(),
            Json::Number(TESSELLATION_PROFILE.angular_deflection_rad),
        ),
        ("region".into(), bounds_json(evidence.region)),
        (
            "materials".into(),
            Json::Array(evidence.materials.iter().map(material_json).collect()),
        ),
        (
            "shellCount".into(),
            Json::Number(evidence.shell_count as f64),
        ),
        (
            "broadPhase".into(),
            Json::object([
                (
                    "materialsStrictlyInterior",
                    Json::Bool(evidence.materials_strictly_interior),
                ),
                (
                    "materialsPairwiseAabbDisjoint",
                    Json::Bool(evidence.materials_pairwise_aabb_disjoint),
                ),
            ]),
        ),
        (
            "waypoints".into(),
            Json::Array(
                evidence
                    .waypoint_readings
                    .iter()
                    .map(reading_json)
                    .collect(),
            ),
        ),
        (
            "isolatedFrom".into(),
            Json::Array(
                evidence
                    .isolation_readings
                    .iter()
                    .map(reading_json)
                    .collect(),
            ),
        ),
    ];
    if !evidence.section_stations.is_empty() {
        fields.push((
            "sectionStations".into(),
            Json::Array(
                evidence
                    .section_stations
                    .iter()
                    .map(section_station_json)
                    .collect(),
            ),
        ));
    }
    if let Some(bottleneck) = &evidence.bottleneck {
        fields.push((
            "bottleneck".into(),
            Json::object([
                ("area", Json::Number(bottleneck.area)),
                ("center", point_json(bottleneck.center)),
                (
                    "stationIndex",
                    Json::Number(bottleneck.station_index as f64),
                ),
                (
                    "memberComponentIndex",
                    Json::Number(bottleneck.member_component as f64),
                ),
            ]),
        ));
    }
    Json::Object(fields)
}

fn material_json(material: &MaterialEvidence) -> Json {
    Json::object([
        ("occurrence", Json::Number(material.occurrence as f64)),
        ("path", Json::string(&material.path)),
        ("bounds", bounds_json(material.bounds)),
    ])
}

fn reading_json(reading: &Reading) -> Json {
    Json::object([
        ("point", point_json(reading.point)),
        ("signature", Json::string(&reading.signature)),
        ("open", Json::Bool(reading.open)),
        ("residual", Json::Number(reading.residual)),
        (
            "windingNumbers",
            Json::Array(
                reading
                    .winding_numbers
                    .iter()
                    .copied()
                    .map(Json::Number)
                    .collect(),
            ),
        ),
        (
            "shellMembership",
            Json::Array(
                reading
                    .shell_membership
                    .iter()
                    .map(|value| Json::Number(*value as f64))
                    .collect(),
            ),
        ),
    ])
}

fn section_station_json(station: &SectionStation) -> Json {
    Json::object([
        ("segmentIndex", Json::Number(station.segment_index as f64)),
        ("stepIndex", Json::Number(station.step_index as f64)),
        ("stepCount", Json::Number(station.step_count as f64)),
        ("fraction", Json::Number(station.fraction)),
        ("center", point_json(station.center)),
        ("transformedPoint", point_json(station.transformed_point)),
        ("section", section_json(&station.section)),
        (
            "memberComponentIndex",
            station
                .member_component
                .map_or(Json::Null, |value| Json::Number(value as f64)),
        ),
    ])
}

fn section_json(section: &Section) -> Json {
    Json::object([
        (
            "contours",
            Json::Array(
                section
                    .contours
                    .iter()
                    .map(|contour| Json::Array(contour.iter().copied().map(point2_json).collect()))
                    .collect(),
            ),
        ),
        ("signedArea", Json::Number(section.signed_area)),
        (
            "components",
            Json::Array(section.components.iter().map(component_json).collect()),
        ),
    ])
}

fn component_json(component: &SectionComponent) -> Json {
    Json::object([
        (
            "outer",
            Json::Array(component.outer.iter().copied().map(point2_json).collect()),
        ),
        (
            "holes",
            Json::Array(
                component
                    .holes
                    .iter()
                    .map(|hole| Json::Array(hole.iter().copied().map(point2_json).collect()))
                    .collect(),
            ),
        ),
        ("signedArea", Json::Number(component.signed_area)),
    ])
}

fn point2_json(point: [f64; 2]) -> Json {
    Json::Array(point.into_iter().map(Json::Number).collect())
}

fn bounds_json(bounds: Bounds) -> Json {
    Json::object([
        ("min", point_json(bounds.min)),
        ("max", point_json(bounds.max)),
    ])
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rotation_maps_direction_to_z() {
        let direction = normalized([1.0, 2.0, 3.0]);
        let mapped = apply_affine(rotation_to_z(direction), direction);
        assert!(mapped[0].abs() < 1e-12);
        assert!(mapped[1].abs() < 1e-12);
        assert!((mapped[2] - 1.0).abs() < 1e-12);
    }
    #[test]
    fn cube_has_outward_winding() {
        let mesh = box_mesh(Bounds {
            min: [0.0; 3],
            max: [1.0; 3],
        });
        assert!((generalized_winding_number(&mesh, [0.5; 3]) - 1.0).abs() < 1e-12);
    }
}
