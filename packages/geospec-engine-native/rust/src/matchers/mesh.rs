//! Source-backed scalar, bounds, topology and integrity mesh matchers.

use crate::{
    analysis::{
        interference::ComponentIdentity,
        mesh::{
            exact::{ask, exact_clusters, ExactError},
            nearest_cluster_gaps, Aabb, BoundingBox, ClusterGap, ClusterReport,
            ConnectedComponents, DegenerateTriangle, DuplicateFace, IrregularEdgeCluster,
            IrregularEdgeKind, IrregularEdgeSample, MeshAnalysis, MeshQuality, NonFiniteVertex,
            PrimitiveRecord, Watertight, WatertightPrimitiveBreakdown,
        },
    },
    backend::{
        brep::{ComponentBody, DocumentRows, OccurrenceFacts, SubshapeType},
        BackendError, BackendErrorKind,
    },
    codec::Json,
    prepared::{self, AnalysisDemand, NumericExpectation, DEFAULT_LINEAR_TOLERANCE},
    protocol::{field, invalid_claim, object, optional_field, require_fields},
    registry::Capability,
    result::{Diagnostic, Evaluation},
    subject::{backend_refusal, EvaluationContext, Subject, SubjectFormat},
    ProtocolError,
};
use std::{collections::HashMap, rc::Rc};

const AXES: [&str; 3] = ["x", "y", "z"];
const BOUNDS_FIELDS: [&str; 4] = ["min", "max", "size", "center"];
const MAX_SAFE_INTEGER: f64 = 9_007_199_254_740_991.0;
type BoundNumbers = [Option<f64>; 3];
type BoundRanges = [Option<NumericExpectation>; 3];

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct ScalarExpectation {
    value: NumericExpectation,
    tolerance: f64,
    density: Option<f64>,
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
struct CountRule {
    count: Option<u64>,
    max_count: Option<u64>,
    area_tolerance: Option<f64>,
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct IntegrityExpectation {
    finite_positions: Option<bool>,
    degenerate_triangles: Option<CountRule>,
    duplicate_faces: Option<CountRule>,
    watertight: Option<bool>,
    triangle_count: Option<NumericExpectation>,
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) enum Prepared {
    BoundingBox {
        declared: [BoundNumbers; 4],
        ranges: Box<[BoundRanges; 4]>,
        tolerance: f64,
        authored_expected: Json,
    },
    ConnectedComponents {
        count: u64,
        tolerance_mm: f64,
    },
    Watertight,
    MeshIntegrity(IntegrityExpectation),
    SurfaceArea(ScalarExpectation),
    Volume(ScalarExpectation),
    Mass(ScalarExpectation),
    CenterOfMass {
        point: [Option<f64>; 3],
        tolerance: f64,
    },
}

pub(crate) fn prepare(capability: Capability, payload: &Json) -> Result<Prepared, ProtocolError> {
    let expected = prepared::expected(capability, payload)?;
    match capability {
        Capability::ToHaveBoundingBox => prepare_bounding_box(&expected),
        Capability::ToHaveConnectedComponents => prepare_components(&expected),
        Capability::ToBeWatertight => Ok(Prepared::Watertight),
        Capability::ToHaveMeshIntegrity => prepare_integrity(&expected),
        Capability::ToHaveSurfaceArea => {
            Ok(Prepared::SurfaceArea(prepare_scalar(&expected, false)?))
        }
        Capability::ToHaveVolume => Ok(Prepared::Volume(prepare_scalar(&expected, false)?)),
        Capability::ToHaveMass => Ok(Prepared::Mass(prepare_scalar(&expected, true)?)),
        Capability::ToHaveCenterOfMass => prepare_center(&expected),
        _ => {
            invalid_claim("Mesh matcher preparation received a capability owned by another family.")
        }
    }
}

fn prepare_bounding_box(expected: &Json) -> Result<Prepared, ProtocolError> {
    let fields = object(expected, "bounding-box expected")?;
    require_fields(
        fields,
        &["min", "max", "size", "center", "tolerance"],
        &[],
        "bounding-box expected",
    )?;
    let mut declared = [[None; 3]; 4];
    let mut ranges = Box::new(std::array::from_fn(|_| std::array::from_fn(|_| None)));
    for (index, name) in BOUNDS_FIELDS.iter().enumerate() {
        if let Some(value) = optional_field(fields, name) {
            (declared[index], ranges[index]) = axes(value, "bounding-box axes")?;
        }
    }
    Ok(Prepared::BoundingBox {
        authored_expected: expected.clone(),
        declared,
        ranges,
        tolerance: prepared::tolerance(fields, "tolerance", DEFAULT_LINEAR_TOLERANCE)?,
    })
}

fn prepare_components(expected: &Json) -> Result<Prepared, ProtocolError> {
    let fields = object(expected, "connected-components expected")?;
    require_fields(
        fields,
        &["count", "tolerance", "toleranceMm"],
        &["count"],
        "connected-components expected",
    )?;
    let count = integer(field(fields, "count")?, "connected-components count")?;
    let tolerance_mm = if let Some(value) = optional_field(fields, "toleranceMm") {
        prepared::nonnegative(value, "toleranceMm")?
    } else {
        prepared::tolerance(fields, "tolerance", DEFAULT_LINEAR_TOLERANCE)?
    };
    Ok(Prepared::ConnectedComponents {
        count,
        tolerance_mm,
    })
}

fn prepare_integrity(expected: &Json) -> Result<Prepared, ProtocolError> {
    let fields = object(expected, "mesh-integrity expected")?;
    require_fields(
        fields,
        &[
            "finitePositions",
            "degenerateTriangles",
            "duplicateFaces",
            "watertight",
            "triangleCount",
        ],
        &[],
        "mesh-integrity expected",
    )?;
    let finite_positions = optional_field(fields, "finitePositions")
        .map(|value| boolean(value, "finitePositions"))
        .transpose()?;
    let watertight = optional_field(fields, "watertight")
        .map(|value| boolean(value, "watertight"))
        .transpose()?;
    let degenerate_triangles = optional_field(fields, "degenerateTriangles")
        .map(|value| count_rule(value, true, "degenerateTriangles"))
        .transpose()?;
    let duplicate_faces = optional_field(fields, "duplicateFaces")
        .map(|value| count_rule(value, false, "duplicateFaces"))
        .transpose()?;
    let triangle_count = optional_field(fields, "triangleCount")
        .map(NumericExpectation::parse)
        .transpose()?;
    Ok(Prepared::MeshIntegrity(IntegrityExpectation {
        finite_positions,
        degenerate_triangles,
        duplicate_faces,
        watertight,
        triangle_count,
    }))
}

fn count_rule(value: &Json, area: bool, label: &str) -> Result<CountRule, ProtocolError> {
    let fields = object(value, label)?;
    let allowed = if area {
        &["count", "maxCount", "areaTolerance"][..]
    } else {
        &["count", "maxCount"][..]
    };
    require_fields(fields, allowed, &[], label)?;
    Ok(CountRule {
        count: optional_field(fields, "count")
            .map(|value| integer(value, "count"))
            .transpose()?,
        max_count: optional_field(fields, "maxCount")
            .map(|value| integer(value, "maxCount"))
            .transpose()?,
        area_tolerance: optional_field(fields, "areaTolerance")
            .map(|value| prepared::nonnegative(value, "areaTolerance"))
            .transpose()?,
    })
}

fn prepare_scalar(expected: &Json, density: bool) -> Result<ScalarExpectation, ProtocolError> {
    let fields = object(expected, "scalar expected")?;
    let allowed = if density {
        &["value", "tolerance", "density"][..]
    } else {
        &["value", "tolerance"][..]
    };
    require_fields(fields, allowed, &["value"], "scalar expected")?;
    Ok(ScalarExpectation {
        value: NumericExpectation::parse(field(fields, "value")?)?,
        tolerance: prepared::tolerance(fields, "tolerance", DEFAULT_LINEAR_TOLERANCE)?,
        density: optional_field(fields, "density")
            .map(|value| prepared::nonnegative(value, "density"))
            .transpose()?,
    })
}

fn prepare_center(expected: &Json) -> Result<Prepared, ProtocolError> {
    let fields = object(expected, "center-of-mass expected")?;
    require_fields(
        fields,
        &["point", "tolerance"],
        &["point"],
        "center-of-mass expected",
    )?;
    Ok(Prepared::CenterOfMass {
        point: prepared::point(field(fields, "point")?)?,
        tolerance: prepared::tolerance(fields, "tolerance", DEFAULT_LINEAR_TOLERANCE)?,
    })
}

fn axes(value: &Json, label: &str) -> Result<(BoundNumbers, BoundRanges), ProtocolError> {
    let mut declared = [None; 3];
    let mut ranges = std::array::from_fn(|_| None);
    match value {
        Json::Array(values) if values.len() == 3 => {
            for (index, value) in values.iter().enumerate() {
                declared[index] = Some(prepared::finite(value, label)?);
            }
        }
        Json::Object(fields) => {
            require_fields(fields, &AXES, &[], label)?;
            for (index, axis) in AXES.iter().enumerate() {
                let Some(value) = optional_field(fields, axis) else {
                    continue;
                };
                match NumericExpectation::parse(value)? {
                    NumericExpectation::Equal(value) => declared[index] = Some(value),
                    expectation => ranges[index] = Some(expectation),
                }
            }
        }
        _ => {
            return invalid_claim(
                "Bounding-box fields require axis objects or length-three arrays.",
            );
        }
    }
    Ok((declared, ranges))
}

fn boolean(value: &Json, label: &str) -> Result<bool, ProtocolError> {
    match value {
        Json::Bool(value) => Ok(*value),
        _ => invalid_claim(format!("{label} must be boolean.")),
    }
}

fn integer(value: &Json, label: &str) -> Result<u64, ProtocolError> {
    let value = prepared::nonnegative(value, label)?;
    if value.fract() != 0.0 || value > MAX_SAFE_INTEGER {
        return invalid_claim(format!("{label} must be a nonnegative safe integer."));
    }
    Ok(value as u64)
}

impl Prepared {
    fn capability(&self) -> Capability {
        match self {
            Self::BoundingBox { .. } => Capability::ToHaveBoundingBox,
            Self::ConnectedComponents { .. } => Capability::ToHaveConnectedComponents,
            Self::Watertight => Capability::ToBeWatertight,
            Self::MeshIntegrity(_) => Capability::ToHaveMeshIntegrity,
            Self::SurfaceArea(_) => Capability::ToHaveSurfaceArea,
            Self::Volume(_) => Capability::ToHaveVolume,
            Self::Mass(_) => Capability::ToHaveMass,
            Self::CenterOfMass { .. } => Capability::ToHaveCenterOfMass,
        }
    }

    fn expected(&self) -> Json {
        match self {
            Self::BoundingBox {
                declared,
                ranges,
                tolerance,
                ..
            } => {
                let mut fields = Vec::new();
                for (index, name) in BOUNDS_FIELDS.iter().enumerate() {
                    if declared[index].iter().any(Option::is_some)
                        || ranges[index].iter().any(Option::is_some)
                    {
                        fields.push((
                            (*name).into(),
                            optional_bounds_point(&declared[index], &ranges[index]),
                        ));
                    }
                }
                fields.push(("tolerance".into(), Json::Number(*tolerance)));
                Json::Object(fields)
            }
            Self::ConnectedComponents {
                count,
                tolerance_mm,
            } => Json::object([
                ("count", Json::Number(*count as f64)),
                ("toleranceMm", Json::Number(*tolerance_mm)),
            ]),
            Self::Watertight => Json::Bool(true),
            Self::MeshIntegrity(value) => integrity_json(value),
            Self::SurfaceArea(value) | Self::Volume(value) | Self::Mass(value) => {
                scalar_json(value)
            }
            Self::CenterOfMass { point, tolerance } => Json::object([
                ("point", crate::prepared::normalized_point(*point)),
                ("tolerance", Json::Number(*tolerance)),
            ]),
        }
    }

    pub(crate) fn normalized_payload(&self) -> Json {
        prepared::normalized_payload(self.capability(), self.expected())
    }

    pub(crate) fn demand(&self) -> AnalysisDemand {
        match self {
            Self::BoundingBox { .. }
            | Self::SurfaceArea(_)
            | Self::Volume(_)
            | Self::Mass(_)
            | Self::CenterOfMass { .. }
            | Self::Watertight
            | Self::MeshIntegrity(_) => AnalysisDemand::default(),
            Self::ConnectedComponents { tolerance_mm, .. } => AnalysisDemand {
                connected_components_tolerance_bits: Some(normalized_bits(*tolerance_mm)),
                ..AnalysisDemand::default()
            },
        }
    }
}

fn normalized_bits(value: f64) -> u64 {
    if value == 0.0 {
        0
    } else {
        value.to_bits()
    }
}

fn scalar_json(value: &ScalarExpectation) -> Json {
    let mut fields = vec![
        ("value".into(), value.value.to_json()),
        ("tolerance".into(), Json::Number(value.tolerance)),
    ];
    if let Some(density) = value.density {
        fields.push(("density".into(), Json::Number(density)));
    }
    Json::Object(fields)
}

fn integrity_json(value: &IntegrityExpectation) -> Json {
    let mut fields = Vec::new();
    if let Some(expected) = value.finite_positions {
        fields.push(("finitePositions".into(), Json::Bool(expected)));
    }
    if let Some(rule) = value.degenerate_triangles {
        fields.push(("degenerateTriangles".into(), count_rule_json(rule, true)));
    }
    if let Some(rule) = value.duplicate_faces {
        fields.push(("duplicateFaces".into(), count_rule_json(rule, false)));
    }
    if let Some(expected) = value.watertight {
        fields.push(("watertight".into(), Json::Bool(expected)));
    }
    if let Some(expected) = &value.triangle_count {
        fields.push(("triangleCount".into(), expected.to_json()));
    }
    Json::Object(fields)
}

fn count_rule_json(rule: CountRule, area: bool) -> Json {
    let mut fields = Vec::new();
    if let Some(value) = rule.count {
        fields.push(("count".into(), Json::Number(value as f64)));
    }
    if let Some(value) = rule.max_count {
        fields.push(("maxCount".into(), Json::Number(value as f64)));
    }
    if area {
        if let Some(value) = rule.area_tolerance {
            fields.push(("areaTolerance".into(), Json::Number(value)));
        }
    }
    Json::Object(fields)
}

pub(crate) fn evaluate(prepared: &Prepared, context: &mut EvaluationContext<'_>) -> Evaluation {
    // MESH-ON-BREP-01 (ruling 2): a BRep subject answers closure from exact
    // topology, and its integrity claims never tessellate.
    if context.subject().brep.is_some() {
        match prepared {
            Prepared::Watertight => return evaluate_exact_watertight(context),
            Prepared::MeshIntegrity(expected) => {
                return evaluate_exact_integrity(expected, context)
            }
            _ => {}
        }
    }
    let bounded = context.bounded_evidence();
    let evaluation = evaluate_family(prepared, context);
    if matches!(prepared, Prepared::BoundingBox { .. })
        && context.subject().format == crate::subject::SubjectFormat::MeshBufferV1
        && context.subject().brep.is_none()
    {
        return evaluation;
    }
    let Evaluation::Geometric {
        positive_satisfied,
        diagnostics,
        mut evidence,
        negated_diagnostic,
    } = evaluation
    else {
        return evaluation;
    };
    // Each field is taken once, so the projection moves rather than clones.
    let mut raw_measured = take_field(&mut evidence, "measured");
    let (measured, witnesses) = match prepared {
        Prepared::BoundingBox { .. } => (
            raw_measured,
            selected_fields(
                &mut evidence,
                &["source", "primitives", "axisFailures", "tolerance"],
            ),
        ),
        Prepared::ConnectedComponents { .. } => {
            let mut witnesses = vec![
                (
                    "toleranceMm".into(),
                    take_field(&mut evidence, "toleranceMm"),
                ),
                ("clusters".into(), take_field(&mut raw_measured, "clusters")),
            ];
            // Absent only on a bounded-profile success.
            if let Some(gaps) = take_optional(&mut raw_measured, "gaps") {
                witnesses.push(("gaps".into(), gaps));
            }
            (
                selected_fields(&mut raw_measured, &["count"]),
                Json::Object(witnesses),
            )
        }
        Prepared::Watertight => {
            let measured = selected_fields(
                &mut raw_measured,
                &[
                    "watertight",
                    "irregularEdges",
                    "openBoundaryEdges",
                    "nonManifoldEdges",
                    "totalEdges",
                    "irregularEdgeFraction",
                ],
            );
            let mut witnesses = selected_fields(
                &mut raw_measured,
                &[
                    "irregularEdgeKindCounts",
                    "irregularEdgeClusters",
                    "perPrimitive",
                ],
            );
            // PERF-OUTPUT-01: a closed mesh's per-primitive rows are all zero.
            if bounded && positive_satisfied {
                take_optional(&mut witnesses, "perPrimitive");
            }
            (measured, witnesses)
        }
        Prepared::MeshIntegrity(_) => {
            let nonfinite = take_field(&mut raw_measured, "nonFiniteVertices");
            let degenerate = take_field(&mut raw_measured, "degenerateTriangles");
            // Absent only under the bounded profile without a declared rule.
            let duplicate = take_optional(&mut raw_measured, "duplicateFaces");
            let count = |value: &Json| match value {
                Json::Array(values) => Json::Number(values.len() as f64),
                _ => unreachable!("owned list"),
            };
            let mut measured = vec![
                (
                    "triangleCount".into(),
                    take_field(&mut raw_measured, "triangleCount"),
                ),
                ("nonFiniteVertexCount".into(), count(&nonfinite)),
                ("degenerateTriangleCount".into(), count(&degenerate)),
            ];
            let mut witnesses = vec![
                ("failures".into(), take_field(&mut evidence, "failures")),
                ("nonFiniteVertices".into(), nonfinite),
                ("degenerateTriangles".into(), degenerate),
            ];
            if let Some(duplicate) = duplicate {
                measured.push(("duplicateFaceCount".into(), count(&duplicate)));
                witnesses.push(("duplicateFaces".into(), duplicate));
            }
            if let Some(mut value) = take_optional(&mut evidence, "watertight") {
                measured.push(("watertight".into(), take_field(&mut value, "watertight")));
            }
            (Json::Object(measured), Json::Object(witnesses))
        }
        Prepared::SurfaceArea(_) | Prepared::Volume(_) | Prepared::Mass(_) => {
            let mut witnesses = match selected_fields(&mut evidence, &["source", "tolerance"]) {
                Json::Object(values) => values,
                _ => unreachable!(),
            };
            for name in ["density", "volume", "signedVolume"] {
                if let Some(value) = take_optional(&mut evidence, name) {
                    witnesses.push((name.into(), value));
                }
            }
            (raw_measured, Json::Object(witnesses))
        }
        Prepared::CenterOfMass { .. } => (
            raw_measured,
            Json::object([
                ("source", take_field(&mut evidence, "source")),
                ("tolerance", take_field(&mut evidence, "tolerance")),
                ("failures", take_field(&mut evidence, "axisFailures")),
            ]),
        ),
    };
    Evaluation::Geometric {
        positive_satisfied,
        diagnostics,
        negated_diagnostic,
        evidence: crate::result::family_evidence(
            &context.subject().content_hash,
            prepared.expected(),
            measured,
            witnesses,
        ),
    }
}

/// Moves one field out of an owned evidence object.
fn take_optional(value: &mut Json, key: &str) -> Option<Json> {
    let Json::Object(fields) = value else {
        unreachable!("owned family evidence object")
    };
    let index = fields.iter().position(|(candidate, _)| candidate == key)?;
    Some(fields.swap_remove(index).1)
}

fn take_field(value: &mut Json, key: &str) -> Json {
    take_optional(value, key).expect("owned measured evidence field")
}

fn selected_fields(value: &mut Json, keys: &[&str]) -> Json {
    Json::Object(
        keys.iter()
            .map(|key| ((*key).to_owned(), take_field(value, key)))
            .collect(),
    )
}

fn evaluate_family(prepared: &Prepared, context: &mut EvaluationContext<'_>) -> Evaluation {
    match prepared {
        Prepared::BoundingBox {
            declared,
            ranges,
            tolerance,
            authored_expected,
        } => evaluate_bounds(declared, ranges, *tolerance, authored_expected, context),
        Prepared::ConnectedComponents {
            count,
            tolerance_mm,
        } => evaluate_components(*count, *tolerance_mm, context),
        Prepared::Watertight => evaluate_watertight(context),
        Prepared::MeshIntegrity(expected) => evaluate_integrity(expected, context),
        Prepared::SurfaceArea(expected) => {
            evaluate_scalar("Surface area", expected, ScalarKind::SurfaceArea, context)
        }
        Prepared::Volume(expected) => {
            evaluate_scalar("Volume", expected, ScalarKind::Volume, context)
        }
        Prepared::Mass(expected) => evaluate_scalar("Mass", expected, ScalarKind::Mass, context),
        Prepared::CenterOfMass { point, tolerance } => evaluate_center(*point, *tolerance, context),
    }
}

fn subject_meta(context: &EvaluationContext<'_>) -> (String, Vec<Diagnostic>) {
    (
        context.subject().content_hash.clone(),
        context.subject().diagnostics.clone(),
    )
}

fn geometric(satisfied: bool, diagnostics: Vec<Diagnostic>, evidence: Json) -> Evaluation {
    Evaluation::Geometric {
        positive_satisfied: satisfied,
        diagnostics,
        evidence,
        negated_diagnostic: None,
    }
}

#[cfg(test)]
thread_local! {
    /// Entries into `mismatch`, the failure-diagnostic builder (H9 test hook).
    static MISMATCH_BUILDS: std::cell::Cell<usize> = const { std::cell::Cell::new(0) };
}

fn mismatch(
    diagnostics: &mut Vec<Diagnostic>,
    code: &str,
    message: String,
    suggestion: &str,
    details: Json,
    spatial: Option<Json>,
) {
    #[cfg(test)]
    MISMATCH_BUILDS.with(|builds| builds.set(builds.get() + 1));
    let mut diagnostic = Diagnostic::error(code, message);
    diagnostic.suggestion = Some(suggestion.into());
    diagnostic.details = Some(details);
    diagnostic.spatial = spatial;
    diagnostics.push(diagnostic);
}

fn evaluate_bounds(
    declared: &[BoundNumbers; 4],
    ranges: &[BoundRanges; 4],
    tolerance: f64,
    authored_expected: &Json,
    context: &mut EvaluationContext<'_>,
) -> Evaluation {
    let (hash, mut diagnostics) = subject_meta(context);
    let gsm1 = context.subject().format == crate::subject::SubjectFormat::MeshBufferV1
        && context.subject().brep.is_none();
    if gsm1 {
        let required = context
            .subject()
            .mesh_record()
            .map_or(0, |record| record.triangles.len() * 3)
            + declared
                .iter()
                .flatten()
                .filter(|axis| axis.is_some())
                .count()
            + ranges
                .iter()
                .flatten()
                .filter(|axis| axis.is_some())
                .count();
        if context.budget().charge(required as u64).is_err() {
            let mut diagnostic = Diagnostic::error(
                "MATCHER_TIMEOUT",
                "Bounding-box work exceeds the declared work-unit budget.",
            );
            diagnostic.details = Some(Json::object([
                ("requiredWorkUnits", Json::Number(required as f64)),
                (
                    "workUnitBudget",
                    Json::Number(context.budget().limit() as f64),
                ),
            ]));
            return Evaluation::Refused {
                diagnostics: vec![diagnostic],
            };
        }
    }
    let (bounds, primitives, source) = match context.brep_shape() {
        Err(result) => return result,
        Ok(Some(shape)) => {
            let min = shape.bounds.min;
            let max = shape.bounds.max;
            let size = std::array::from_fn(|axis| max[axis] - min[axis]);
            let center = std::array::from_fn(|axis| (min[axis] + max[axis]) / 2.0);
            ([min, max, size, center], Json::Array(Vec::new()), "brep")
        }
        Ok(None) => {
            let analysis = match if gsm1 {
                context
                    .subject()
                    .mesh_analysis()
                    .map_err(crate::subject::backend_refusal)
            } else {
                context.mesh_analysis()
            } {
                Ok(value) => value,
                Err(result) => return result,
            };
            let bounding_box = analysis.bounding_box();
            let BoundingBox {
                size,
                center,
                primitives,
            } = bounding_box.as_ref();
            let min = std::array::from_fn(|axis| center[axis] - size[axis] / 2.0);
            let max = std::array::from_fn(|axis| center[axis] + size[axis] / 2.0);
            (
                [min, max, *size, *center],
                Json::Array(primitives.iter().map(primitive_json).collect()),
                "mesh",
            )
        }
    };
    let mut failures = Vec::new();
    let mut names = Vec::new();
    for field_index in 0..BOUNDS_FIELDS.len() {
        for (axis, axis_name) in AXES.iter().enumerate() {
            let actual = bounds[field_index][axis];
            let (failed, expected) = if let Some(expected) = declared[field_index][axis] {
                (
                    outside_tolerance(actual, expected, tolerance),
                    Json::Number(expected),
                )
            } else if let Some(expected) = &ranges[field_index][axis] {
                (!expected.holds(actual, tolerance), expected.to_json())
            } else {
                continue;
            };
            if failed {
                failures.push(Json::object([
                    ("axis", Json::string(axis_name)),
                    ("expected", expected),
                    ("actual", finite_or_string(actual)),
                    ("field", Json::string(BOUNDS_FIELDS[field_index])),
                ]));
                names.push(format!("{}.{}", BOUNDS_FIELDS[field_index], axis_name));
            }
        }
    }
    let measured = bounds_json(bounds);
    if !failures.is_empty() && context.wants_failure_detail() {
        mismatch(
            &mut diagnostics,
            "GEOSPEC_BOUNDING_BOX_MISMATCH",
            format!(
                "Bounding box is off the declared bounds on {} (tolerance {}).",
                names.join(", "),
                number(tolerance)
            ),
            "Correct the model dimensions, or widen the declared bounding-box tolerance.",
            Json::object([
                ("matcher", Json::string("toHaveBoundingBox")),
                ("measured", measured.clone()),
                ("axisFailures", Json::Array(failures.clone())),
                ("tolerance", Json::Number(tolerance)),
                ("evidence", Json::string(source)),
            ]),
            Some(Json::object([
                ("min", point_json(bounds[0])),
                ("max", point_json(bounds[1])),
                ("center", point_json(bounds[3])),
            ])),
        );
    }
    let normalized_expected = Prepared::BoundingBox {
        declared: *declared,
        ranges: Box::new((*ranges).clone()),
        tolerance,
        authored_expected: authored_expected.clone(),
    }
    .expected();
    let mut fields = vec![
        ("profile".into(), Json::string("mesh-bounds-v1")),
        ("source".into(), Json::string(source)),
        ("scope".into(), Json::string("whole-subject")),
        ("subjectContentHash".into(), Json::string(&hash)),
        ("measured".into(), measured.clone()),
        (
            "expected".into(),
            if gsm1 {
                authored_expected.clone()
            } else {
                normalized_expected
            },
        ),
        ("tolerance".into(), Json::Number(tolerance)),
        ("axisFailures".into(), Json::Array(failures.clone())),
    ];
    if !gsm1 {
        fields.push(("primitives".into(), primitives));
    }
    let negated_diagnostic = gsm1.then(|| {
        let mut diagnostic = Diagnostic::error(
            "GEOSPEC_NEGATED_BOUNDING_BOX_MATCH",
            "Bounding box satisfies the declared bounds, but the claim requires it not to.",
        );
        diagnostic.suggestion = Some(
            "Correct the model dimensions, or revise the negated bounding-box requirement.".into(),
        );
        diagnostic.spatial = Some(Json::object([
            ("min", point_json(bounds[0])),
            ("max", point_json(bounds[1])),
            ("center", point_json(bounds[3])),
        ]));
        diagnostic.details = Some(Json::object([
            ("matcher", Json::string("toHaveBoundingBox")),
            ("measured", measured),
            ("tolerance", Json::Number(tolerance)),
            ("evidence", Json::string(source)),
            ("polarity", Json::string("negative")),
        ]));
        Box::new(diagnostic)
    });
    Evaluation::Geometric {
        positive_satisfied: failures.is_empty(),
        diagnostics,
        evidence: Json::Object(fields),
        negated_diagnostic,
    }
}

fn evaluate_components(
    expected_count: u64,
    tolerance_mm: f64,
    context: &mut EvaluationContext<'_>,
) -> Evaluation {
    let (hash, mut diagnostics) = subject_meta(context);
    let bounded = context.bounded_evidence();
    let brep = context.subject().brep.is_some();
    let analysis = if !brep && !bounded {
        match context.connected_components(tolerance_mm) {
            Ok(value) => value,
            Err(result) => return result,
        }
    } else {
        let clusters = if brep {
            step_component_clusters(tolerance_mm, context)
        } else {
            context
                .mesh_analysis()
                .map(|analysis| analysis.component_clusters(tolerance_mm))
        };
        let clusters = match clusters {
            Ok(value) => value,
            Err(result) => return result,
        };
        if bounded {
            // PERF-OUTPUT-01: no pairwise gaps on success, nearest ones on failure.
            let count = clusters.len() as u32;
            let gaps = if u64::from(count) == expected_count {
                Vec::new()
            } else {
                match nearest_cluster_gaps(&clusters, context.budget()) {
                    Ok(gaps) => gaps,
                    Err(error) => {
                        return Evaluation::budget_exceeded(
                            Capability::ToHaveConnectedComponents,
                            error,
                        )
                    }
                }
            };
            Rc::new(ConnectedComponents {
                count,
                clusters,
                gaps,
            })
        } else {
            // The complete profile's C(C-1)/2 STEP gaps are refused past the
            // declared retention bytes before any exists, as the batch floor
            // refuses mesh gaps; that floor is never below this one.
            let count = clusters.len() as u64;
            let pairs = count.saturating_mul(count.saturating_sub(1)) / 2;
            if pairs.saturating_mul(std::mem::size_of::<ClusterGap>() as u64)
                > context.subject().retention_limits.max_mesh_bytes
            {
                return backend_refusal(BackendError {
                    kind: BackendErrorKind::Unsupported,
                    message:
                        "Connected-component results exceed the declared analysis retention byte limit."
                            .into(),
                });
            }
            Rc::new(ConnectedComponents::from_clusters(clusters))
        }
    };
    let satisfied = u64::from(analysis.count) == expected_count;
    if !satisfied {
        mismatch(
            &mut diagnostics,
            "GEOSPEC_CONNECTED_COMPONENTS_MISMATCH",
            format!(
                "The subject has {} spatially disjoint components at a {} mm tolerance, not the declared {}.",
                analysis.count,
                number(tolerance_mm),
                expected_count
            ),
            "Join or separate the parts, or loosen `toleranceMm` so intentionally close components collapse into one.",
            Json::object([
                ("matcher", Json::string("toHaveConnectedComponents")),
                ("expected", Json::Number(expected_count as f64)),
                ("got", Json::Number(f64::from(analysis.count))),
                ("toleranceMm", Json::Number(tolerance_mm)),
                ("clusters", clusters_json(&analysis)),
                ("gaps", gaps_json(&analysis)),
            ]),
            None,
        );
    }
    geometric(
        satisfied,
        diagnostics,
        Json::object([
            ("profile", Json::string("mesh-components-v1")),
            ("source", Json::string(if brep { "brep" } else { "mesh" })),
            ("subjectContentHash", Json::string(&hash)),
            ("expected", Json::Number(expected_count as f64)),
            ("toleranceMm", Json::Number(tolerance_mm)),
            (
                "measured",
                connected_json(&analysis, !bounded || !satisfied),
            ),
        ]),
    )
}

/// M2: STEP clusters from the retained BRep's bodies, never a tessellation.
/// Bodies belong to leaf occurrences (none names another as parent, C2's
/// rule), labelled through the component partition, or to the whole shape.
fn step_component_clusters(
    tolerance_mm: f64,
    context: &mut EvaluationContext<'_>,
) -> Result<Vec<ClusterReport>, Evaluation> {
    let brep = context.brep_gate()?.ok_or_else(|| {
        backend_refusal(BackendError {
            kind: BackendErrorKind::Unsupported,
            message: "Exact connected components require a retained BRep.".into(),
        })
    })?;
    let occurrences = context.source_occurrence_structure()?.unwrap_or_default();
    let mut parents = vec![false; occurrences.len()];
    for occurrence in occurrences.iter() {
        if let Some(parent) = occurrence
            .parent
            .and_then(|value| parents.get_mut(value as usize))
        {
            *parent = true;
        }
    }
    let leaves: Vec<u32> = (0..occurrences.len() as u32)
        .filter(|&index| !parents[index as usize])
        .collect();
    let identities = crate::analysis::interference::component_labels(context.subject())
        .map_err(backend_refusal)?;
    let refusal = |error: ExactError, labels: &[String]| match error {
        ExactError::Backend(error) => backend_refusal(error),
        ExactError::Budget { exceeded, pair } => {
            let mut refusal =
                Evaluation::budget_exceeded(Capability::ToHaveConnectedComponents, exceeded);
            // Ruling 28: a narrow-phase refusal names the pair whose charge crossed.
            if let (Some((left, right)), Evaluation::Refused { diagnostics }) = (pair, &mut refusal)
            {
                if let Some(Json::Object(fields)) = &mut diagnostics[0].details {
                    fields.push((
                        "pair".into(),
                        Json::Array(vec![
                            Json::string(&labels[left]),
                            Json::string(&labels[right]),
                        ]),
                    ));
                }
            }
            refusal
        }
    };
    let bodies = ask(context.budget(), None, |charge| {
        brep.component_bodies(&leaves, charge)
    })
    .map_err(|error| refusal(error, &[]))?;
    let labels = body_labels(bodies.bodies(), &identities);
    exact_clusters(bodies.as_ref(), &labels, tolerance_mm, context.budget())
        .map_err(|error| refusal(error, &labels))
}

/// A body is named by its component label, or `step` for a whole-shape
/// body; several bodies of one owner take `#<ordinal>` in body order.
fn body_labels(bodies: &[ComponentBody], identities: &[ComponentIdentity]) -> Vec<String> {
    let names: HashMap<u32, &str> = identities
        .iter()
        .map(|identity| (identity.id, identity.label.as_str()))
        .collect();
    let mut totals: HashMap<Option<u32>, u32> = HashMap::new();
    for body in bodies {
        *totals.entry(body.occurrence).or_insert(0) += 1;
    }
    let mut ordinals: HashMap<Option<u32>, u32> = HashMap::new();
    bodies
        .iter()
        .map(|body| {
            let base = match body.occurrence {
                Some(index) => names.get(&index).map_or_else(
                    || format!("step-occurrence-{index}"),
                    |label| (*label).to_owned(),
                ),
                None => "step".to_owned(),
            };
            if totals[&body.occurrence] < 2 {
                return base;
            }
            let ordinal = ordinals.entry(body.occurrence).or_insert(0);
            let label = format!("{base}#{ordinal}");
            *ordinal += 1;
            label
        })
        .collect()
}

fn evaluate_watertight(context: &mut EvaluationContext<'_>) -> Evaluation {
    let (hash, mut diagnostics) = subject_meta(context);
    let analysis = match context.mesh_analysis() {
        Ok(value) => value,
        Err(result) => return result,
    };
    let measured = analysis.watertight();
    if !measured.watertight && context.wants_failure_detail() {
        mismatch(
            &mut diagnostics,
            "GEOSPEC_WATERTIGHT_MISMATCH",
            format!(
                "The mesh has {} irregular edges ({} open, {} non-manifold), so it is not a closed manifold surface.",
                measured.irregular_edges,
                measured.open_boundary_edges,
                measured.non_manifold_edges
            ),
            "Close the open boundaries and remove the over-adjacent faces, then re-export.",
            watertight_details(&measured),
            None,
        );
    }
    geometric(
        measured.watertight,
        diagnostics,
        Json::object([
            ("profile", Json::string("mesh-watertight-v1")),
            ("source", Json::string("mesh")),
            ("subjectContentHash", Json::string(&hash)),
            ("expected", Json::Bool(true)),
            ("measured", watertight_json(&measured)),
        ]),
    )
}

fn evaluate_integrity(
    expected: &IntegrityExpectation,
    context: &mut EvaluationContext<'_>,
) -> Evaluation {
    let mut diagnostics = context.subject().diagnostics.clone();
    // PERF-OUTPUT-01: the bounded profile finds duplicate faces only when declared.
    let duplicates = !context.bounded_evidence() || expected.duplicate_faces.is_some();
    let analysis = match context.mesh_analysis() {
        Ok(value) => value,
        Err(result) => return result,
    };
    let quality = analysis.mesh_quality();
    let mut failures = Vec::new();
    if expected.finite_positions == Some(true) && !quality.non_finite_vertices.is_empty() {
        failures.push(format!(
            "{} non-finite vertex positions",
            quality.non_finite_vertices.len()
        ));
    }
    if let Some(rule) = expected.degenerate_triangles {
        let count = quality
            .degenerate_triangles
            .iter()
            .filter(|triangle| rule.area_tolerance.is_none_or(|area| triangle.area <= area))
            .count() as u64;
        count_failures(&mut failures, count, rule, "degenerate triangles");
    }
    if let Some(rule) = expected.duplicate_faces {
        let duplicate_faces = quality.duplicate_faces();
        count_failures(
            &mut failures,
            duplicate_faces.len() as u64,
            rule,
            "duplicate faces",
        );
    }
    let watertight = if expected.watertight.is_some() {
        Some(analysis.watertight())
    } else {
        None
    };
    if let (Some(declared), Some(measured)) = (expected.watertight, watertight.as_ref()) {
        if measured.watertight != declared {
            failures.push(format!(
                "watertight is {}, not the declared {}",
                measured.watertight, declared
            ));
        }
    }
    if let Some(declared) = &expected.triangle_count {
        if !declared.holds(f64::from(quality.triangle_count), 0.0) {
            failures.push(format!(
                "{} triangles, which does not satisfy {}",
                quality.triangle_count,
                declared.describe()
            ));
        }
    }
    if !failures.is_empty() {
        mismatch(
            &mut diagnostics,
            "GEOSPEC_MESH_INTEGRITY_MISMATCH",
            format!(
                "Mesh evidence is not trustworthy for downstream checks: {}.",
                failures.join("; ")
            ),
            "Re-tessellate the model (or repair it) until the mesh evidence is clean.",
            integrity_details(&quality, &failures, duplicates),
            None,
        );
    }
    // Only the fields `evaluate` projects: no per-triangle rows, and the
    // watertight verdict without its edge detail.
    let mut measured = vec![
        (
            "triangleCount".into(),
            Json::Number(f64::from(quality.triangle_count)),
        ),
        ("nonFiniteVertices".into(), nonfinite_list(&quality)),
        ("degenerateTriangles".into(), degenerate_list(&quality)),
    ];
    if duplicates {
        measured.push(("duplicateFaces".into(), duplicate_list(&quality)));
    }
    let mut evidence = vec![
        ("measured", Json::Object(measured)),
        (
            "failures",
            Json::Array(failures.iter().map(|value| Json::string(value)).collect()),
        ),
    ];
    if let Some(watertight) = watertight.as_ref() {
        evidence.push((
            "watertight",
            Json::object([("watertight", Json::Bool(watertight.watertight))]),
        ));
    }
    geometric(
        failures.is_empty(),
        diagnostics,
        Json::Object(
            evidence
                .into_iter()
                .map(|(key, value)| (key.into(), value))
                .collect(),
        ),
    )
}

fn count_failures(failures: &mut Vec<String>, count: u64, rule: CountRule, label: &str) {
    if let Some(expected) = rule.count {
        if count != expected {
            failures.push(format!("{count} {label}, not the declared {expected}"));
        }
    }
    if let Some(maximum) = rule.max_count {
        if count > maximum {
            failures.push(format!(
                "{count} {label}, above the declared maximum {maximum}"
            ));
        }
    }
}

/// V1: the exact shell-closure facet (the single BRep unit, no tessellation):
/// the verdict, its measured fields and each failing shell with the paths of
/// the leaf occurrences that hold it.
struct ExactClosure {
    watertight: bool,
    open_edges: u32,
    nonmanifold_edges: u32,
    measured: Json,
    failing_shells: Vec<Json>,
}

fn exact_closure(context: &mut EvaluationContext<'_>) -> Result<ExactClosure, Evaluation> {
    let brep = context
        .brep_gate()?
        .expect("the exact closure route serves BRep subjects only");
    let closure = brep.closure().map_err(backend_refusal)?;
    let occurrences = if closure
        .failing
        .iter()
        .any(|group| !group.occurrences.is_empty())
    {
        context.source_occurrence_structure()?
    } else {
        None
    };
    let path = |ordinal: &u32| {
        occurrences
            .as_deref()
            .and_then(|all| all.get(*ordinal as usize))
            .map_or(Json::Null, |occurrence| Json::string(&occurrence.path))
    };
    let failing_shells = closure
        .failing
        .iter()
        .map(|group| {
            let samples = group.samples.iter().map(|sample| {
                Json::object([
                    (
                        "kind",
                        Json::string(if sample.face_uses >= 3 {
                            "non-manifold"
                        } else {
                            "open-boundary"
                        }),
                    ),
                    ("faceUses", Json::Number(f64::from(sample.face_uses))),
                    ("start", point_json(sample.start)),
                    ("end", point_json(sample.end)),
                    ("center", point_json(sample.center)),
                ])
            });
            Json::object([
                (
                    "kind",
                    Json::string(if group.free_faces {
                        "free-faces"
                    } else {
                        "shell"
                    }),
                ),
                (
                    "occurrences",
                    Json::Array(group.occurrences.iter().map(path).collect()),
                ),
                (
                    "openBoundaryEdges",
                    Json::Number(f64::from(group.open_edges)),
                ),
                (
                    "nonManifoldEdges",
                    Json::Number(f64::from(group.nonmanifold_edges)),
                ),
                ("samples", Json::Array(samples.collect())),
            ])
        })
        .collect();
    let watertight = closure.open_edges == 0 && closure.nonmanifold_edges == 0;
    Ok(ExactClosure {
        watertight,
        open_edges: closure.open_edges,
        nonmanifold_edges: closure.nonmanifold_edges,
        measured: Json::object([
            ("watertight", Json::Bool(watertight)),
            (
                "openBoundaryEdges",
                Json::Number(f64::from(closure.open_edges)),
            ),
            (
                "nonManifoldEdges",
                Json::Number(f64::from(closure.nonmanifold_edges)),
            ),
            ("shells", Json::Number(f64::from(closure.shells))),
            ("freeFaces", Json::Number(f64::from(closure.free_faces))),
        ]),
        failing_shells,
    })
}

fn evaluate_exact_watertight(context: &mut EvaluationContext<'_>) -> Evaluation {
    let (hash, mut diagnostics) = subject_meta(context);
    let closure = match exact_closure(context) {
        Ok(value) => value,
        Err(result) => return result,
    };
    if !closure.watertight && context.wants_failure_detail() {
        let Json::Object(mut details) = closure.measured.clone() else {
            unreachable!("owned closure evidence")
        };
        details.push((
            "failingShells".into(),
            Json::Array(closure.failing_shells.clone()),
        ));
        details.push(("matcher".into(), Json::string("toBeWatertight")));
        mismatch(
            &mut diagnostics,
            "GEOSPEC_WATERTIGHT_MISMATCH",
            format!(
                "The exact BRep topology has {} open-boundary and {} non-manifold edges in {} failing shells, so it is not a closed manifold surface.",
                closure.open_edges,
                closure.nonmanifold_edges,
                closure.failing_shells.len()
            ),
            "Close the open shells and remove the over-shared edges at the reported samples in the named occurrences, then re-export.",
            Json::Object(details),
            None,
        );
    }
    Evaluation::Geometric {
        positive_satisfied: closure.watertight,
        diagnostics,
        negated_diagnostic: None,
        evidence: crate::result::family_evidence(
            &hash,
            Prepared::Watertight.expected(),
            closure.measured,
            Json::object([("failingShells", Json::Array(closure.failing_shells))]),
        ),
    }
}

/// M1 (ruling 2): STEP integrity answers only `watertight`, from the exact
/// closure; the mesh-only options would measure GeoSpec's own tessellation.
fn evaluate_exact_integrity(
    expected: &IntegrityExpectation,
    context: &mut EvaluationContext<'_>,
) -> Evaluation {
    let mesh_only = [
        (expected.finite_positions.is_some(), "finitePositions"),
        (
            expected.degenerate_triangles.is_some(),
            "degenerateTriangles",
        ),
        (expected.duplicate_faces.is_some(), "duplicateFaces"),
        (expected.triangle_count.is_some(), "triangleCount"),
    ]
    .into_iter()
    .filter_map(|(declared, name)| declared.then_some(name))
    .collect::<Vec<_>>();
    if !mesh_only.is_empty() {
        let mut diagnostic = Diagnostic::error(
            "GEOSPEC_UNSUPPORTED_EVIDENCE",
            format!(
                "Exact BRep integrity answers only `watertight`; {} would measure GeoSpec's own tessellation, not the subject.",
                mesh_only.join(", ")
            ),
        );
        diagnostic.suggestion = Some(
            "Assert `watertight` on the STEP subject, and assert mesh-only integrity on a rendered mesh subject such as GLB."
                .into(),
        );
        diagnostic.details = Some(Json::object([
            ("matcher", Json::string("toHaveMeshIntegrity")),
            (
                "unsupported",
                Json::Array(mesh_only.iter().map(|name| Json::string(name)).collect()),
            ),
        ]));
        return Evaluation::Refused {
            diagnostics: vec![diagnostic],
        };
    }
    let (hash, mut diagnostics) = subject_meta(context);
    let mut measured = Vec::new();
    let mut witnesses = Vec::new();
    let mut failures = Vec::new();
    if let Some(declared) = expected.watertight {
        let closure = match exact_closure(context) {
            Ok(value) => value,
            Err(result) => return result,
        };
        if closure.watertight != declared {
            failures.push(format!(
                "watertight is {}, not the declared {declared}",
                closure.watertight
            ));
        }
        measured.push(("watertight".into(), Json::Bool(closure.watertight)));
        witnesses.push(("failingShells".into(), Json::Array(closure.failing_shells)));
    }
    let failure_list = Json::Array(failures.iter().map(|value| Json::string(value)).collect());
    if !failures.is_empty() && context.wants_failure_detail() {
        let mut details = witnesses.clone();
        details.push(("failures".into(), failure_list.clone()));
        details.push(("matcher".into(), Json::string("toHaveMeshIntegrity")));
        mismatch(
            &mut diagnostics,
            "GEOSPEC_MESH_INTEGRITY_MISMATCH",
            format!(
                "Exact BRep evidence does not satisfy the declared integrity: {}.",
                failures.join("; ")
            ),
            "Close the open shells and remove the over-shared edges at the reported samples, then re-export.",
            Json::Object(details),
            None,
        );
    }
    witnesses.push(("failures".into(), failure_list));
    Evaluation::Geometric {
        positive_satisfied: failures.is_empty(),
        diagnostics,
        negated_diagnostic: None,
        evidence: crate::result::family_evidence(
            &hash,
            integrity_json(expected),
            Json::Object(measured),
            Json::Object(witnesses),
        ),
    }
}

#[derive(Clone, Copy)]
enum ScalarKind {
    SurfaceArea,
    Volume,
    Mass,
}

fn evaluate_scalar(
    quantity: &str,
    expected: &ScalarExpectation,
    kind: ScalarKind,
    context: &mut EvaluationContext<'_>,
) -> Evaluation {
    let (hash, mut diagnostics) = subject_meta(context);
    let (measured, source, volume, signed_volume) = match context.brep_shape() {
        Err(result) => return result,
        Ok(Some(shape)) => {
            let value = match kind {
                ScalarKind::SurfaceArea => Some(shape.surface_area),
                ScalarKind::Volume => Some(shape.volume),
                ScalarKind::Mass => expected.density.map(|density| shape.volume * density),
            };
            (value, "brep", shape.volume, None)
        }
        Ok(None) => {
            let analysis = match context.mesh_analysis() {
                Ok(value) => value,
                Err(result) => return result,
            };
            let quality = analysis.mesh_quality();
            let value = match kind {
                ScalarKind::SurfaceArea => Some(quality.surface_area),
                ScalarKind::Volume => Some(quality.signed_volume.abs()),
                ScalarKind::Mass => expected
                    .density
                    .map(|density| quality.signed_volume.abs() * density),
            };
            (
                value,
                "mesh",
                quality.signed_volume.abs(),
                Some(quality.signed_volume),
            )
        }
    };
    let Some(measured) = measured else {
        let mut diagnostic = Diagnostic::error(
            "GEOSPEC_EVIDENCE_UNSUPPORTED",
            "GeoSpec matcher 'toHaveMass' needs an exact mass, or a declared `density` to derive one from the volume, but the loaded subject does not provide it.",
        );
        diagnostic.suggestion = Some(
            "Declare `density` on the expectation, or load a subject whose kernel reports mass properties."
                .into(),
        );
        diagnostic.details = Some(Json::object([
            ("matcher", Json::string("toHaveMass")),
            (
                "missing",
                Json::string(
                    "an exact mass, or a declared `density` to derive one from the volume",
                ),
            ),
        ]));
        diagnostics.push(diagnostic);
        return Evaluation::Refused { diagnostics };
    };
    let satisfied = expected.value.holds(measured, expected.tolerance);
    if !satisfied && context.wants_failure_detail() {
        mismatch(
            &mut diagnostics,
            "GEOSPEC_MEASUREMENT_MISMATCH",
            format!(
                "{quantity} is {} ({source} evidence), which does not satisfy {} within {}.",
                number(measured),
                expected.value.describe(),
                number(expected.tolerance)
            ),
            &format!(
                "Correct the model, or widen the declared {} expectation.",
                quantity.to_lowercase()
            ),
            Json::object([
                ("matcher", Json::string(kind.matcher())),
                ("measured", finite_or_string(measured)),
                ("expected", expected.value.to_json()),
                ("tolerance", Json::Number(expected.tolerance)),
                ("evidence", Json::string(source)),
            ]),
            None,
        );
    }
    let mut evidence = vec![
        ("profile", Json::string("mesh-scalar-v1")),
        ("source", Json::string(source)),
        ("subjectContentHash", Json::string(&hash)),
        ("quantity", Json::string(quantity)),
        ("measured", finite_or_string(measured)),
        ("expected", expected.value.to_json()),
        ("tolerance", Json::Number(expected.tolerance)),
    ];
    if matches!(kind, ScalarKind::Mass) {
        if let Some(density) = expected.density {
            evidence.push(("density", Json::Number(density)));
            evidence.push(("volume", finite_or_string(volume)));
        }
    }
    if matches!(kind, ScalarKind::Volume) {
        if let Some(signed) = signed_volume {
            evidence.push(("signedVolume", finite_or_string(signed)));
        }
    }
    geometric(
        satisfied,
        diagnostics,
        Json::Object(
            evidence
                .into_iter()
                .map(|(key, value)| (key.into(), value))
                .collect(),
        ),
    )
}

impl ScalarKind {
    fn matcher(self) -> &'static str {
        match self {
            Self::SurfaceArea => "toHaveSurfaceArea",
            Self::Volume => "toHaveVolume",
            Self::Mass => "toHaveMass",
        }
    }
}

fn evaluate_center(
    expected: [Option<f64>; 3],
    tolerance: f64,
    context: &mut EvaluationContext<'_>,
) -> Evaluation {
    let (hash, mut diagnostics) = subject_meta(context);
    let (measured, source) = match context.brep_shape() {
        Err(result) => return result,
        // As a zero signed mesh volume has none: the bridge measures no centre
        // of mass for a massless shape (|volume| <= epsilon).
        Ok(Some(shape)) => (
            (shape.volume.abs() > f64::EPSILON).then_some(shape.center_of_mass),
            "brep",
        ),
        Ok(None) => {
            let analysis = match context.mesh_analysis() {
                Ok(value) => value,
                Err(result) => return result,
            };
            (analysis.mesh_quality().center_of_mass, "mesh")
        }
    };
    let Some(measured) = measured else {
        let mut diagnostic = Diagnostic::error(
            "GEOSPEC_EVIDENCE_UNSUPPORTED",
            "GeoSpec matcher 'toHaveCenterOfMass' needs a centre of mass (the subject is not a closed solid), but the loaded subject does not provide it.",
        );
        diagnostic.suggestion = Some(
            "Load STEP/BRep evidence or enable the native geometric proof backend for this matcher."
                .into(),
        );
        diagnostics.push(diagnostic);
        return Evaluation::Refused { diagnostics };
    };
    let failures = point_failures(measured, expected, tolerance);
    if !failures.is_empty() && context.wants_failure_detail() {
        mismatch(
            &mut diagnostics,
            "GEOSPEC_MEASUREMENT_MISMATCH",
            format!(
                "Centre of mass is [{}, {}, {}], off the declared point on {} by more than {}.",
                number(measured[0]),
                number(measured[1]),
                number(measured[2]),
                failures
                    .iter()
                    .filter_map(|failure| match failure {
                        Json::Object(fields) => optional_field(fields, "axis"),
                        _ => None,
                    })
                    .filter_map(|axis| match axis {
                        Json::String(value) => Some(value.as_str()),
                        _ => None,
                    })
                    .collect::<Vec<_>>()
                    .join("/"),
                number(tolerance)
            ),
            "Correct the model, or widen the declared centre-of-mass tolerance.",
            Json::object([
                ("matcher", Json::string("toHaveCenterOfMass")),
                ("measured", point_json(measured)),
                ("failures", Json::Array(failures.clone())),
                ("tolerance", Json::Number(tolerance)),
            ]),
            Some(Json::object([("center", point_json(measured))])),
        );
    }
    geometric(
        failures.is_empty(),
        diagnostics,
        Json::object([
            ("profile", Json::string("mesh-center-of-mass-v1")),
            ("source", Json::string(source)),
            ("subjectContentHash", Json::string(&hash)),
            ("measured", point_json(measured)),
            ("expected", optional_point(expected)),
            ("tolerance", Json::Number(tolerance)),
            ("axisFailures", Json::Array(failures)),
        ]),
    )
}

pub(crate) fn analyze_mesh(context: &mut EvaluationContext<'_>) -> Evaluation {
    let analysis = match context.mesh_analysis() {
        Ok(value) => value,
        Err(result) => return result,
    };
    // F8: occurrences with bounds and the document rows; no report facts.
    let facts = if context.subject().format == SubjectFormat::Step {
        let occurrences = match context.source_occurrences() {
            Ok(value) => value,
            Err(result) => return result,
        };
        let rows = match context.document_rows() {
            Ok(value) => value,
            Err(result) => return result,
        };
        occurrences.zip(rows)
    } else {
        None
    };
    let facts = facts
        .as_ref()
        .map(|(occurrences, rows)| (occurrences.as_ref(), rows));
    let subject = match analysis_subject_json(context.subject(), &analysis, facts) {
        Ok(value) => value,
        Err(error) => return backend_refusal(error),
    };
    Evaluation::Ancillary {
        success: true,
        value: Json::object([
            ("success", Json::Bool(true)),
            ("subject", subject),
            ("stats", analysis_json(&analysis)),
            ("diagnostics", Json::Array(Vec::new())),
        ]),
        diagnostics: Vec::new(),
    }
}

fn analysis_subject_json(
    subject: &Subject,
    analysis: &MeshAnalysis,
    facts: Option<(&[OccurrenceFacts], &DocumentRows)>,
) -> Result<Json, BackendError> {
    let format = match subject.format {
        SubjectFormat::MeshBufferV1 | SubjectFormat::Step => "mesh-buffer",
        SubjectFormat::Glb => "glb",
        SubjectFormat::Gltf => "gltf",
        SubjectFormat::RationalPlate => {
            return Err(BackendError {
                kind: BackendErrorKind::Unsupported,
                message: "The rational certificate subject has no public mesh format.".into(),
            });
        }
    };
    let step = if subject.format == SubjectFormat::Step {
        let metadata = subject
            .step_subject_metadata()?
            .ok_or_else(|| BackendError {
                kind: BackendErrorKind::Unsupported,
                message: "The STEP connector has no source-backed subject metadata.".into(),
            })?;
        if !metadata.native_read_stream {
            return Err(BackendError {
                kind: BackendErrorKind::Unsupported,
                message: "The STEP connector did not establish native stream ingestion.".into(),
            });
        }
        let (occurrences, rows) = facts.ok_or_else(|| BackendError {
            kind: BackendErrorKind::Unsupported,
            message: "The STEP subject has no source-backed report metadata.".into(),
        })?;
        Some(step_subject_json(metadata, occurrences, rows))
    } else {
        None
    };
    let mut fields = vec![
        ("kind".into(), Json::string("geometry-subject")),
        (
            "mesh".into(),
            Json::object([
                ("format", Json::string(format)),
                (
                    "stats",
                    Json::object([
                        (
                            "vertexCount",
                            Json::Number(f64::from(analysis.vertex_count)),
                        ),
                        ("meshCount", Json::Number(f64::from(analysis.mesh_count))),
                        (
                            "triangleCount",
                            Json::Number(f64::from(analysis.triangle_count)),
                        ),
                    ]),
                ),
            ]),
        ),
        (
            "capabilities".into(),
            subject_capabilities(subject.format == SubjectFormat::Step),
        ),
        (
            "diagnostics".into(),
            Json::Array(
                subject
                    .diagnostics
                    .iter()
                    .map(Diagnostic::to_json)
                    .collect(),
            ),
        ),
    ];
    if let Some(step) = step {
        fields.push(("step".into(), step));
    }
    Ok(Json::Object(fields))
}

fn subject_capabilities(step: bool) -> Json {
    let mut values = Vec::new();
    if step {
        for feature in ["schema", "units", "product-structure", "reader-provenance"] {
            values.push(capability_json("step", feature));
        }
        for feature in [
            "validity",
            "topology-counts",
            "bounding-box",
            "mass-properties",
            "planar-faces",
            "cylindrical-faces",
            "circular-holes",
            "circular-hole-patterns",
            "chamfer-features",
            "fillet-features",
            "wall-thickness",
        ] {
            values.push(capability_json("brep", feature));
        }
    }
    for feature in [
        "triangles",
        "bounding-box",
        "connected-components",
        "watertightness",
        "surface-area",
        "volume",
        "center-of-mass",
        "distance",
        "component-overlap",
    ] {
        values.push(capability_json("mesh", feature));
    }
    Json::Array(values)
}

fn capability_json(kind: &str, feature: &str) -> Json {
    Json::object([
        ("kind", Json::string(kind)),
        ("feature", Json::string(feature)),
    ])
}

fn step_subject_json(
    metadata: &crate::backend::brep::StepSubjectMetadata,
    occurrences: &[OccurrenceFacts],
    rows: &DocumentRows,
) -> Json {
    let mut fields = Vec::new();
    if let Some(schema) = &metadata.schema {
        fields.push(("schema".into(), Json::string(schema)));
    }
    fields.extend([
        // The applied profile admits output millimeters only. The original
        // source unit remains bound separately in the semantic descriptor.
        ("unit".into(), Json::string("mm")),
        (
            "productStructure".into(),
            Json::Array(
                occurrences
                    .iter()
                    .map(|occurrence| {
                        Json::object([
                            ("name", Json::string(&occurrence.path)),
                            ("path", Json::string(&occurrence.path)),
                            ("transform", transform_json(occurrence)),
                        ])
                    })
                    .collect(),
            ),
        ),
        (
            "readStrategy".into(),
            Json::object([
                ("strategy", Json::string("native-stream")),
                ("inputKind", Json::string("bytes")),
                (
                    "bytesRead",
                    Json::Number(metadata.source_byte_length as f64),
                ),
                ("nativeReadStream", Json::Bool(true)),
                ("copiedToEmscriptenFs", Json::Bool(false)),
            ]),
        ),
        ("capabilities".into(), step_capabilities()),
        ("xde".into(), xde_json(metadata, occurrences, rows)),
    ]);
    Json::Object(fields)
}

fn step_capabilities() -> Json {
    Json::Array(vec![
        Json::object([
            ("feature", Json::string("product-structure")),
            ("supported", Json::Bool(true)),
        ]),
        Json::object([
            ("feature", Json::string("color")),
            ("supported", Json::Bool(false)),
        ]),
        Json::object([
            ("feature", Json::string("material")),
            ("supported", Json::Bool(false)),
        ]),
        Json::object([
            ("feature", Json::string("geometric-tolerance")),
            ("supported", Json::Bool(false)),
            (
                "reason",
                Json::string("GeoSpec P0 reports unsupported AP242 PMI/GD&T evidence explicitly."),
            ),
        ]),
    ])
}

fn xde_json(
    metadata: &crate::backend::brep::StepSubjectMetadata,
    occurrences: &[OccurrenceFacts],
    rows: &DocumentRows,
) -> Json {
    Json::object([
        (
            "occurrences",
            Json::Array(occurrences.iter().map(occurrence_json).collect()),
        ),
        (
            "subshapeNames",
            Json::Array(
                rows.subshapes
                    .iter()
                    .map(|row| {
                        Json::object([
                            ("occurrencePath", Json::string(&row.occurrence_path)),
                            ("name", Json::string(&row.name)),
                            (
                                "shapeType",
                                Json::string(match row.shape_type {
                                    SubshapeType::Face => "face",
                                    SubshapeType::Edge => "edge",
                                    SubshapeType::Vertex => "vertex",
                                    SubshapeType::Solid => "solid",
                                }),
                            ),
                            (
                                "faceIndex",
                                Json::Number(row.face_index.map_or(-1.0, f64::from)),
                            ),
                        ])
                    })
                    .collect(),
            ),
        ),
        (
            "datumPlacements",
            Json::Array(
                rows.datum_placements
                    .iter()
                    .map(|row| {
                        Json::object([
                            ("occurrencePath", Json::string(&row.occurrence_path)),
                            ("name", Json::string(&row.name)),
                            ("origin", point_json(row.origin)),
                            ("xAxis", point_json(row.x_axis)),
                            ("zAxis", point_json(row.z_axis)),
                        ])
                    })
                    .collect(),
            ),
        ),
        (
            "semanticDatums",
            Json::Array(
                rows.semantic_datums
                    .iter()
                    .map(|row| {
                        let mut fields = vec![
                            ("occurrencePath".into(), Json::string(&row.occurrence_path)),
                            ("label".into(), Json::string(&row.label)),
                            (
                                "faceIndexes".into(),
                                Json::Array(
                                    row.face_indices
                                        .iter()
                                        .map(|value| Json::Number(f64::from(*value)))
                                        .collect(),
                                ),
                            ),
                        ];
                        if let Some(name) = &row.feature_name {
                            fields.push(("featureName".into(), Json::string(name)));
                        }
                        Json::Object(fields)
                    })
                    .collect(),
            ),
        ),
        (
            "freeShapeCount",
            Json::Number(metadata.free_shape_count as f64),
        ),
    ])
}

fn occurrence_json(occurrence: &OccurrenceFacts) -> Json {
    let mut fields = vec![
        ("path".into(), Json::string(&occurrence.path)),
        ("productName".into(), Json::string(&occurrence.product_name)),
        ("transform".into(), transform_json(occurrence)),
        (
            "shapeIndex".into(),
            Json::Number(f64::from(occurrence.product)),
        ),
        (
            "bounds".into(),
            Json::object([
                ("min", point_json(occurrence.bounds.min)),
                ("max", point_json(occurrence.bounds.max)),
            ]),
        ),
    ];
    if let Some(name) = &occurrence.instance_name {
        fields.push(("instanceName".into(), Json::string(name)));
    }
    Json::Object(fields)
}

fn transform_json(occurrence: &OccurrenceFacts) -> Json {
    Json::Array(
        occurrence
            .placement
            .into_iter()
            .chain([0.0, 0.0, 0.0, 1.0])
            .map(Json::Number)
            .collect(),
    )
}

fn point_failures(measured: [f64; 3], expected: [Option<f64>; 3], tolerance: f64) -> Vec<Json> {
    (0..3)
        .filter_map(|axis| {
            let expected = expected[axis]?;
            outside_tolerance(measured[axis], expected, tolerance).then(|| {
                Json::object([
                    ("axis", Json::string(AXES[axis])),
                    ("expected", Json::Number(expected)),
                    ("actual", finite_or_string(measured[axis])),
                ])
            })
        })
        .collect()
}

fn optional_point(point: [Option<f64>; 3]) -> Json {
    Json::Object(
        AXES.into_iter()
            .zip(point)
            .filter_map(|(axis, value)| value.map(|value| (axis.into(), Json::Number(value))))
            .collect(),
    )
}

fn optional_bounds_point(declared: &BoundNumbers, ranges: &BoundRanges) -> Json {
    Json::Object(
        AXES.into_iter()
            .enumerate()
            .filter_map(|(index, axis)| {
                declared[index]
                    .map(Json::Number)
                    .or_else(|| ranges[index].as_ref().map(NumericExpectation::to_json))
                    .map(|value| (axis.into(), value))
            })
            .collect(),
    )
}

fn outside_tolerance(actual: f64, expected: f64, tolerance: f64) -> bool {
    (actual - expected)
        .abs()
        .partial_cmp(&tolerance)
        .is_none_or(std::cmp::Ordering::is_gt)
}

fn point_json(point: [f64; 3]) -> Json {
    Json::Array(point.into_iter().map(finite_or_string).collect())
}

fn bounds_json(bounds: [[f64; 3]; 4]) -> Json {
    Json::object([
        ("min", point_json(bounds[0])),
        ("max", point_json(bounds[1])),
        ("size", point_json(bounds[2])),
        ("center", point_json(bounds[3])),
    ])
}

fn aabb_json(value: Aabb) -> Json {
    Json::object([
        ("min", point_json(value.min)),
        ("max", point_json(value.max)),
    ])
}

fn primitive_json(value: &PrimitiveRecord) -> Json {
    let mut fields = vec![
        ("name".into(), Json::string(&value.name)),
        ("vertices".into(), Json::Number(f64::from(value.vertices))),
        ("aabb".into(), aabb_json(value.aabb)),
    ];
    if let Some(color) = &value.color {
        fields.push(("color".into(), Json::string(color)));
    }
    Json::Object(fields)
}

fn connected_json(value: &ConnectedComponents, gaps: bool) -> Json {
    let mut fields = vec![
        ("count".into(), Json::Number(f64::from(value.count))),
        ("clusters".into(), clusters_json(value)),
    ];
    if gaps {
        fields.push(("gaps".into(), gaps_json(value)));
    }
    Json::Object(fields)
}

fn clusters_json(value: &ConnectedComponents) -> Json {
    Json::Array(value.clusters.iter().map(cluster_json).collect())
}

fn cluster_json(value: &ClusterReport) -> Json {
    Json::object([
        ("label", Json::string(&value.label)),
        (
            "primitives",
            Json::Array(value.primitives.iter().map(primitive_json).collect()),
        ),
        ("aabb", aabb_json(value.aabb)),
        ("centroid", point_json(value.centroid)),
        (
            "totalVertices",
            Json::Number(f64::from(value.total_vertices)),
        ),
    ])
}

fn gaps_json(value: &ConnectedComponents) -> Json {
    Json::Array(value.gaps.iter().map(gap_json).collect())
}

fn gap_json(value: &ClusterGap) -> Json {
    Json::object([
        ("fromLabel", Json::string(&value.from_label)),
        ("toLabel", Json::string(&value.to_label)),
        ("axis", Json::string(&value.axis.to_string())),
        ("gapMm", Json::Number(value.gap_mm)),
        ("fromPrimitive", Json::string(&value.from_primitive)),
        ("toPrimitive", Json::string(&value.to_primitive)),
    ])
}

fn watertight_json(value: &Watertight) -> Json {
    Json::object([
        ("watertight", Json::Bool(value.watertight)),
        (
            "irregularEdges",
            Json::Number(f64::from(value.irregular_edges)),
        ),
        (
            "openBoundaryEdges",
            Json::Number(f64::from(value.open_boundary_edges)),
        ),
        (
            "nonManifoldEdges",
            Json::Number(f64::from(value.non_manifold_edges)),
        ),
        (
            "irregularEdgeKindCounts",
            Json::object([
                (
                    "openBoundary",
                    Json::Number(f64::from(value.irregular_edge_kind_counts.open_boundary)),
                ),
                (
                    "nonManifold",
                    Json::Number(f64::from(value.irregular_edge_kind_counts.non_manifold)),
                ),
            ]),
        ),
        (
            "irregularEdgeClusters",
            Json::Array(
                value
                    .irregular_edge_clusters
                    .iter()
                    .map(irregular_cluster_json)
                    .collect(),
            ),
        ),
        ("totalEdges", Json::Number(f64::from(value.total_edges))),
        (
            "irregularEdgeFraction",
            Json::Number(value.irregular_edge_fraction),
        ),
        (
            "perPrimitive",
            Json::Array(value.per_primitive.iter().map(breakdown_json).collect()),
        ),
    ])
}

fn watertight_details(value: &Watertight) -> Json {
    let Json::Object(mut fields) = watertight_json(value) else {
        unreachable!("owned watertight evidence")
    };
    fields.push(("matcher".into(), Json::string("toBeWatertight")));
    Json::Object(fields)
}

fn irregular_cluster_json(value: &IrregularEdgeCluster) -> Json {
    Json::object([
        (
            "kind",
            Json::string(match value.kind {
                IrregularEdgeKind::OpenBoundary => "open-boundary",
                IrregularEdgeKind::NonManifold => "non-manifold",
            }),
        ),
        ("edgeCount", Json::Number(f64::from(value.edge_count))),
        (
            "aabb",
            Json::object([
                ("min", point_json(value.aabb.min)),
                ("max", point_json(value.aabb.max)),
                ("center", point_json(value.center)),
            ]),
        ),
        (
            "samples",
            Json::Array(value.samples.iter().map(irregular_sample_json).collect()),
        ),
    ])
}

fn irregular_sample_json(value: &IrregularEdgeSample) -> Json {
    let mut fields = vec![
        ("start".into(), point_json(value.start)),
        ("end".into(), point_json(value.end)),
        ("center".into(), point_json(value.center)),
        (
            "incidentTriangleCount".into(),
            Json::Number(f64::from(value.incident_triangle_count)),
        ),
        (
            "primitives".into(),
            Json::Array(
                value
                    .primitives
                    .iter()
                    .map(|item| Json::string(item))
                    .collect(),
            ),
        ),
    ];
    if let Some(color) = &value.color {
        fields.push(("color".into(), Json::string(color)));
    }
    Json::Object(fields)
}

fn breakdown_json(value: &WatertightPrimitiveBreakdown) -> Json {
    Json::object([
        ("name", Json::string(&value.name)),
        (
            "boundaryEdges",
            Json::Number(f64::from(value.boundary_edges)),
        ),
        ("loopCentroid", point_json(value.loop_centroid)),
    ])
}

/// The complete `analyzeMesh` quality, including its per-triangle rows.
fn quality_json(value: &MeshQuality) -> Json {
    let mut fields = vec![
        (
            "triangleCount".into(),
            Json::Number(f64::from(value.triangle_count)),
        ),
        ("nonFiniteVertices".into(), nonfinite_list(value)),
        ("degenerateTriangles".into(), degenerate_list(value)),
        (
            "triangles".into(),
            Json::Array(
                value
                    .triangles()
                    .map(|triangle| {
                        Json::object([
                            ("primitive", Json::string(&triangle.primitive)),
                            (
                                "triangleIndex",
                                Json::Number(f64::from(triangle.triangle_index)),
                            ),
                            ("a", point_json(triangle.a)),
                            ("b", point_json(triangle.b)),
                            ("c", point_json(triangle.c)),
                            ("center", point_json(triangle.center)),
                            ("area", finite_or_string(triangle.area)),
                        ])
                    })
                    .collect(),
            ),
        ),
        ("surfaceArea".into(), finite_or_string(value.surface_area)),
        ("signedVolume".into(), finite_or_string(value.signed_volume)),
        ("duplicateFaces".into(), duplicate_list(value)),
    ];
    if let Some(center) = value.center_of_mass {
        fields.push(("centerOfMass".into(), point_json(center)));
    }
    Json::Object(fields)
}

fn nonfinite_list(value: &MeshQuality) -> Json {
    Json::Array(
        value
            .non_finite_vertices
            .iter()
            .map(nonfinite_json)
            .collect(),
    )
}

fn degenerate_list(value: &MeshQuality) -> Json {
    Json::Array(
        value
            .degenerate_triangles
            .iter()
            .map(degenerate_json)
            .collect(),
    )
}

fn duplicate_list(value: &MeshQuality) -> Json {
    Json::Array(value.duplicate_faces().iter().map(duplicate_json).collect())
}

fn nonfinite_json(value: &NonFiniteVertex) -> Json {
    Json::object([
        ("primitive", Json::string(&value.primitive)),
        ("vertexIndex", Json::Number(f64::from(value.vertex_index))),
        (
            "position",
            Json::Array(value.position.into_iter().map(finite_or_string).collect()),
        ),
    ])
}

fn nonfinite_diagnostic_json(value: &NonFiniteVertex) -> Json {
    Json::object([
        ("primitive", Json::string(&value.primitive)),
        ("vertexIndex", Json::Number(f64::from(value.vertex_index))),
        (
            "position",
            Json::Array(
                value
                    .position
                    .into_iter()
                    .map(|coordinate| Json::string(&number(coordinate)))
                    .collect(),
            ),
        ),
    ])
}

fn degenerate_json(value: &DegenerateTriangle) -> Json {
    Json::object([
        ("primitive", Json::string(&value.primitive)),
        (
            "triangleIndex",
            Json::Number(f64::from(value.triangle_index)),
        ),
        ("area", finite_or_string(value.area)),
        ("center", point_json(value.center)),
    ])
}

fn duplicate_json(value: &DuplicateFace) -> Json {
    Json::object([
        ("primitive", Json::string(&value.primitive)),
        (
            "triangleIndex",
            Json::Number(f64::from(value.triangle_index)),
        ),
        (
            "firstTriangleIndex",
            Json::Number(f64::from(value.first_triangle_index)),
        ),
    ])
}

fn integrity_details(quality: &MeshQuality, failures: &[String], duplicates: bool) -> Json {
    let mut details = vec![
        ("matcher".into(), Json::string("toHaveMeshIntegrity")),
        (
            "failures".into(),
            Json::Array(failures.iter().map(|value| Json::string(value)).collect()),
        ),
        (
            "triangleCount".into(),
            Json::Number(f64::from(quality.triangle_count)),
        ),
        (
            "nonFiniteVertices".into(),
            Json::Array(
                quality
                    .non_finite_vertices
                    .iter()
                    .take(4)
                    .map(nonfinite_diagnostic_json)
                    .collect(),
            ),
        ),
        (
            "degenerateTriangles".into(),
            Json::Array(
                quality
                    .degenerate_triangles
                    .iter()
                    .take(4)
                    .map(degenerate_json)
                    .collect(),
            ),
        ),
    ];
    if duplicates {
        details.push((
            "duplicateFaces".into(),
            Json::Array(
                quality
                    .duplicate_faces()
                    .iter()
                    .take(4)
                    .map(|face| {
                        let mut value = match duplicate_json(face) {
                            Json::Object(fields) => fields,
                            _ => unreachable!(),
                        };
                        if let Some(center) = quality.triangle_center(face.triangle_index) {
                            value.push(("center".into(), point_json(center)));
                        }
                        Json::Object(value)
                    })
                    .collect(),
            ),
        ));
    }
    Json::Object(details)
}

fn analysis_json(value: &MeshAnalysis) -> Json {
    let quality = value.mesh_quality();
    let watertight = value.watertight();
    let bounding_box = value.bounding_box();
    Json::object([
        ("vertexCount", Json::Number(f64::from(value.vertex_count))),
        ("meshCount", Json::Number(f64::from(value.mesh_count))),
        (
            "triangleCount",
            Json::Number(f64::from(value.triangle_count)),
        ),
        ("meshQuality", quality_json(&quality)),
        ("watertight", Json::Bool(watertight.watertight)),
        (
            "boundingBox",
            Json::object([
                ("size", point_json(bounding_box.size)),
                ("center", point_json(bounding_box.center)),
                (
                    "primitives",
                    Json::Array(bounding_box.primitives.iter().map(primitive_json).collect()),
                ),
            ]),
        ),
    ])
}

fn finite_or_string(value: f64) -> Json {
    if value.is_finite() {
        Json::Number(value)
    } else {
        Json::string(&value.to_string())
    }
}

fn number(value: f64) -> String {
    if value.is_finite() {
        ryu_js::Buffer::new().format_finite(value).to_owned()
    } else if value.is_nan() {
        "NaN".into()
    } else if value.is_sign_negative() {
        "-Infinity".into()
    } else {
        "Infinity".into()
    }
}

#[cfg(test)]
mod preparation_tests {
    use super::*;

    fn payload(kind: &str, expected: Json) -> Json {
        Json::object([("kind", Json::string(kind)), ("expected", expected)])
    }

    #[test]
    fn normalizes_bounds_axes_and_source_default_tolerance() {
        let prepared = prepare(
            Capability::ToHaveBoundingBox,
            &payload(
                "boundingBox",
                Json::object([(
                    "min",
                    Json::Array(vec![
                        Json::Number(1.0),
                        Json::Number(2.0),
                        Json::Number(3.0),
                    ]),
                )]),
            ),
        )
        .unwrap();
        assert_eq!(
            prepared.normalized_payload(),
            Json::object([
                ("kind", Json::string("boundingBox")),
                (
                    "expected",
                    Json::object([
                        (
                            "min",
                            Json::object([
                                ("x", Json::Number(1.0)),
                                ("y", Json::Number(2.0)),
                                ("z", Json::Number(3.0)),
                            ]),
                        ),
                        ("tolerance", Json::Number(DEFAULT_LINEAR_TOLERANCE)),
                    ]),
                ),
            ])
        );
    }

    #[test]
    fn declares_exact_component_tolerance_bits() {
        let prepared = prepare(
            Capability::ToHaveConnectedComponents,
            &payload(
                "connectedComponents",
                Json::object([
                    ("count", Json::Number(2.0)),
                    ("toleranceMm", Json::Number(-0.0)),
                ]),
            ),
        )
        .unwrap();
        assert_eq!(
            prepared.demand().connected_components_tolerance_bits,
            Some(0)
        );
    }

    #[test]
    fn accepts_missing_density_for_runtime_refusal_but_rejects_negative_density() {
        assert!(prepare(
            Capability::ToHaveMass,
            &payload("mass", Json::object([("value", Json::Number(1.0))])),
        )
        .is_ok());
        assert!(prepare(
            Capability::ToHaveMass,
            &payload(
                "mass",
                Json::object([
                    ("value", Json::Number(1.0)),
                    ("density", Json::Number(-1.0)),
                ]),
            ),
        )
        .is_err());
    }
}

#[cfg(test)]
#[path = "../../tests/matcher_mesh.rs"]
mod tests;

#[cfg(test)]
#[path = "../../tests/matcher_components.rs"]
mod components_tests;

#[cfg(test)]
#[path = "../../tests/current_bounds.rs"]
mod current_bounds;
