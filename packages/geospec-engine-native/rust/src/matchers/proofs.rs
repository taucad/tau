//! Component-interference, wall-thickness, and void-continuity matchers.

use std::collections::BTreeMap;

use crate::{
    analysis::{
        interference::{
            self, Analysis as OverlapAnalysis, ComponentIdentity, SelectedPair,
            DEFAULT_TOLERANCE_MM,
        },
        selection::{EcmaRegexEngine, EcmaRegexError, SelectorIndex, TextPattern},
        voids::{self, Claim as VoidClaim, Decision as VoidDecision},
    },
    backend::{
        brep::{Bounds, ContinuousWallDomain, ContinuousWallShape},
        BackendError, BackendErrorKind,
    },
    codec::Json,
    prepared::{
        expected, finite, nonnegative, normalized_payload, tolerance, AnalysisDemand,
        NumericExpectation, DEFAULT_LINEAR_TOLERANCE,
    },
    protocol::{array, field, invalid_claim, object, optional_field, require_fields},
    registry::Capability,
    result::{family_evidence, Diagnostic, Evaluation},
    subject::{backend_refusal, EvaluationContext},
    ProtocolError,
};

const BREP_SUGGESTION: &str =
    "Load the model as STEP (`loadModel({ file, format: \"step\" })`) so GeoSpec has exact BRep evidence.";
const VOID_REGION_PADDING_MM: f64 = 2.0;

#[derive(Clone, Debug)]
struct PairPattern {
    left: TextPattern,
    right: TextPattern,
}

#[derive(Clone, Debug)]
struct Allowance {
    pair: PairPattern,
    max_volume: Option<f64>,
}

#[derive(Clone, Debug)]
pub(crate) struct Interference {
    expected: Json,
    tolerance: f64,
    pairs: Option<Vec<PairPattern>>,
    allowances: Vec<Allowance>,
    selected_pairs: Option<Option<Vec<SelectedPair>>>,
    unmatched_pairs: Vec<usize>,
    allowance_by_pair: Option<BTreeMap<(u32, u32), usize>>,
}

#[derive(Clone, Debug)]
pub(crate) struct Wall {
    expected: Json,
    value: NumericExpectation,
    tolerance: f64,
}

#[derive(Clone, Debug)]
enum VoidWaypoint {
    Point([f64; 3]),
    Occurrence(String),
}

#[derive(Clone, Debug)]
pub(crate) struct Void {
    expected: Json,
    path: Vec<VoidWaypoint>,
    material: Option<Vec<String>>,
    min_cross_section: Option<f64>,
    isolated_from: Vec<[f64; 3]>,
    bounds: Option<Bounds>,
    resolved: Option<Result<VoidClaim, Vec<Diagnostic>>>,
}

#[derive(Clone, Debug)]
pub(crate) enum Prepared {
    ComponentInterference(Interference),
    MinimumWallThickness(Wall),
    VoidContinuity(Void),
}

impl Prepared {
    pub(crate) fn normalized_payload(&self) -> Json {
        normalized_payload(self.capability(), self.expected_json())
    }

    pub(crate) fn demand(&self) -> AnalysisDemand {
        match self {
            Self::ComponentInterference(_) => AnalysisDemand {
                mesh: true,
                brep: true,
                csg: true,
                ..AnalysisDemand::default()
            },
            Self::MinimumWallThickness(_) => AnalysisDemand {
                brep: true,
                wall: true,
                ..AnalysisDemand::default()
            },
            Self::VoidContinuity(_) => AnalysisDemand {
                brep: true,
                csg: true,
                ..AnalysisDemand::default()
            },
        }
    }

    pub(crate) fn validate_regexes(
        &self,
        engine: &dyn EcmaRegexEngine,
    ) -> Result<(), EcmaRegexError> {
        if let Self::ComponentInterference(value) = self {
            for pair in value
                .pairs
                .iter()
                .flatten()
                .chain(value.allowances.iter().map(|allowance| &allowance.pair))
            {
                pair.left.validate(engine)?;
                pair.right.validate(engine)?;
            }
        }
        Ok(())
    }

    /// Evaluate the Lead-owned overlap query through this family's typed,
    /// phase-two-resolved component selection.
    pub(crate) fn evaluate_as_overlap(&self, context: &mut EvaluationContext<'_>) -> Evaluation {
        let Self::ComponentInterference(value) = self else {
            return phase_two_refusal(Capability::AnalyzeMeshOverlap);
        };
        let Some(selected) = &value.selected_pairs else {
            return phase_two_refusal(Capability::AnalyzeMeshOverlap);
        };
        evaluate_overlap(value.tolerance, selected.as_deref(), context)
    }

    /// Expand pair patterns over retained component identities during Lead's
    /// phase-two barrier, before any CSG operation starts.
    pub(crate) fn resolve_component_patterns(
        &mut self,
        components: &[ComponentIdentity],
        engine: &dyn EcmaRegexEngine,
    ) -> Result<(), EcmaRegexError> {
        let Self::ComponentInterference(value) = self else {
            return Ok(());
        };
        let mut all_pairs = Vec::new();
        let mut matched_patterns = vec![false; value.pairs.as_ref().map_or(0, Vec::len)];
        let mut allowance_by_pair = BTreeMap::new();
        for left in 0..components.len() {
            for right in left + 1..components.len() {
                let left_component = &components[left];
                let right_component = &components[right];
                let selected = match &value.pairs {
                    None => true,
                    Some(patterns) => {
                        let mut matched = false;
                        for (index, pattern) in patterns.iter().enumerate() {
                            if pair_matches(
                                pattern,
                                &left_component.label,
                                &right_component.label,
                                engine,
                            )? {
                                matched = true;
                                matched_patterns[index] = true;
                            }
                        }
                        matched
                    }
                };
                if selected {
                    all_pairs.push(SelectedPair {
                        left: left_component.id,
                        right: right_component.id,
                        left_label: left_component.label.clone(),
                        right_label: right_component.label.clone(),
                    });
                }
                for (allowance_index, allowance) in value.allowances.iter().enumerate() {
                    if pair_matches(
                        &allowance.pair,
                        &left_component.label,
                        &right_component.label,
                        engine,
                    )? {
                        allowance_by_pair.insert(
                            (
                                left_component.id.min(right_component.id),
                                left_component.id.max(right_component.id),
                            ),
                            allowance_index,
                        );
                        break;
                    }
                }
            }
        }
        value.unmatched_pairs = matched_patterns
            .iter()
            .enumerate()
            .filter_map(|(index, matched)| (!matched).then_some(index))
            .collect();
        value.selected_pairs = Some(value.pairs.as_ref().map(|_| all_pairs));
        value.allowance_by_pair = Some(allowance_by_pair);
        Ok(())
    }

    /// W2.C-REQUIRED-PAIR-01: requested scope is not an optional allowance.
    pub(crate) fn required_pair_refusal(&self, capability: Capability) -> Option<Evaluation> {
        let Self::ComponentInterference(value) = self else {
            return None;
        };
        if value.unmatched_pairs.is_empty() {
            return None;
        }
        let pairs = value
            .pairs
            .as_ref()
            .expect("unmatched authored pairs exist");
        Some(Evaluation::Refused { diagnostics: value.unmatched_pairs.iter().map(|&index| {
            let mut diagnostic = Diagnostic::error("GEOSPEC_SELECTOR_UNMATCHED", format!("Requested component pair at index {index} did not match two distinct components."));
            diagnostic.details = Some(Json::object([
                ("matcher", Json::string(capability.name())),
                ("pairIndex", Json::Number(index as f64)),
                ("pair", Json::object([("left", pairs[index].left.to_json()), ("right", pairs[index].right.to_json())])),
            ]));
            diagnostic
        }).collect() })
    }

    /// Resolve exact occurrence names, waypoint centres, and derived region at
    /// the same phase-two barrier.
    pub(crate) fn resolve_void(&mut self, index: &SelectorIndex) {
        if let Self::VoidContinuity(value) = self {
            value.resolved = Some(resolve_void(value, index));
        }
    }

    const fn capability(&self) -> Capability {
        match self {
            Self::ComponentInterference(_) => Capability::ToHaveNoComponentInterference,
            Self::MinimumWallThickness(_) => Capability::ToHaveMinimumWallThickness,
            Self::VoidContinuity(_) => Capability::ToHaveVoidContinuity,
        }
    }

    fn expected_json(&self) -> Json {
        let mut expected = match self {
            Self::ComponentInterference(value) => value.expected.clone(),
            Self::MinimumWallThickness(value) => value.expected.clone(),
            Self::VoidContinuity(value) => value.expected.clone(),
        };
        match self {
            Self::ComponentInterference(value) => {
                set_field(&mut expected, "tolerance", Json::Number(value.tolerance));
            }
            Self::MinimumWallThickness(value) => {
                set_field(&mut expected, "tolerance", Json::Number(value.tolerance));
            }
            Self::VoidContinuity(value) => {
                set_field(
                    &mut expected,
                    "isolatedFrom",
                    Json::Array(
                        value
                            .isolated_from
                            .iter()
                            .copied()
                            .map(point_json)
                            .collect(),
                    ),
                );
            }
        }
        expected
    }
}

fn set_field(value: &mut Json, name: &str, replacement: Json) {
    let Json::Object(fields) = value else {
        unreachable!("prepared proof expectation is an object")
    };
    if let Some((_, value)) = fields.iter_mut().find(|(key, _)| key == name) {
        *value = replacement;
    } else {
        fields.push((name.into(), replacement));
    }
}

pub(crate) fn prepare(capability: Capability, payload: &Json) -> Result<Prepared, ProtocolError> {
    match capability {
        Capability::ToHaveNoComponentInterference => prepare_interference(payload),
        Capability::ToHaveMinimumWallThickness => prepare_wall(payload),
        Capability::ToHaveVoidContinuity => prepare_void(payload),
        _ => invalid_claim(format!(
            "Proof matcher preparation does not own '{}'.",
            capability.name()
        )),
    }
}

fn prepare_interference(payload: &Json) -> Result<Prepared, ProtocolError> {
    let expected = expected(Capability::ToHaveNoComponentInterference, payload)?;
    let fields = object(&expected, "component interference expectation")?;
    require_fields(
        fields,
        &["tolerance", "pairs", "allowances"],
        &[],
        "component interference expectation",
    )?;
    let pairs = optional_field(fields, "pairs")
        .map(|value| {
            array(value, "pairs")?
                .iter()
                .enumerate()
                .map(|(index, value)| parse_pair(value, &format!("pairs[{index}]")))
                .collect()
        })
        .transpose()?;
    let allowances = optional_field(fields, "allowances")
        .map(|value| {
            array(value, "allowances")?
                .iter()
                .enumerate()
                .map(|(index, value)| parse_allowance(value, index))
                .collect()
        })
        .transpose()?
        .unwrap_or_default();
    let tolerance = tolerance(fields, "tolerance", DEFAULT_TOLERANCE_MM)?;
    Ok(Prepared::ComponentInterference(Interference {
        expected,
        tolerance,
        pairs,
        allowances,
        selected_pairs: None,
        unmatched_pairs: Vec::new(),
        allowance_by_pair: None,
    }))
}

fn parse_pair(value: &Json, label: &str) -> Result<PairPattern, ProtocolError> {
    let fields = object(value, label)?;
    require_fields(fields, &["left", "right"], &["left", "right"], label)?;
    Ok(PairPattern {
        left: TextPattern::parse(field(fields, "left")?, &format!("{label}.left"))?,
        right: TextPattern::parse(field(fields, "right")?, &format!("{label}.right"))?,
    })
}

fn parse_allowance(value: &Json, index: usize) -> Result<Allowance, ProtocolError> {
    let label = format!("allowances[{index}]");
    let fields = object(value, &label)?;
    require_fields(
        fields,
        &["kind", "left", "right", "maxVolume", "reason"],
        &["left", "right", "reason"],
        &label,
    )?;
    if let Some(kind) = optional_field(fields, "kind") {
        if !matches!(kind, Json::String(value) if value == "intentionalInterference") {
            return invalid_claim(format!("{label}.kind must be 'intentionalInterference'."));
        }
    }
    if !matches!(field(fields, "reason")?, Json::String(_)) {
        return invalid_claim(format!("{label}.reason must be a string."));
    }
    Ok(Allowance {
        pair: PairPattern {
            left: TextPattern::parse(field(fields, "left")?, &format!("{label}.left"))?,
            right: TextPattern::parse(field(fields, "right")?, &format!("{label}.right"))?,
        },
        max_volume: optional_field(fields, "maxVolume")
            .map(|value| nonnegative(value, &format!("{label}.maxVolume")))
            .transpose()?,
    })
}

fn prepare_wall(payload: &Json) -> Result<Prepared, ProtocolError> {
    let expected = expected(Capability::ToHaveMinimumWallThickness, payload)?;
    let fields = object(&expected, "minimum wall thickness expectation")?;
    require_fields(
        fields,
        &["value", "tolerance"],
        &["value"],
        "minimum wall thickness expectation",
    )?;
    Ok(Prepared::MinimumWallThickness(Wall {
        value: NumericExpectation::parse(field(fields, "value")?)?,
        tolerance: tolerance(fields, "tolerance", DEFAULT_LINEAR_TOLERANCE)?,
        expected,
    }))
}

fn prepare_void(payload: &Json) -> Result<Prepared, ProtocolError> {
    let expected = expected(Capability::ToHaveVoidContinuity, payload)?;
    let fields = object(&expected, "void continuity expectation")?;
    require_fields(
        fields,
        &[
            "path",
            "material",
            "minCrossSection",
            "isolatedFrom",
            "bounds",
        ],
        &["path"],
        "void continuity expectation",
    )?;
    let path = array(field(fields, "path")?, "path")?
        .iter()
        .enumerate()
        .map(|(index, value)| parse_waypoint(value, &format!("path[{index}]")))
        .collect::<Result<Vec<_>, _>>()?;
    let material = optional_field(fields, "material")
        .map(|value| string_array(value, "material"))
        .transpose()?;
    let isolated_from = optional_field(fields, "isolatedFrom")
        .map(|value| {
            array(value, "isolatedFrom")?
                .iter()
                .enumerate()
                .map(|(index, value)| parse_point(value, &format!("isolatedFrom[{index}]")))
                .collect()
        })
        .transpose()?
        .unwrap_or_default();
    let bounds = optional_field(fields, "bounds")
        .map(parse_bounds)
        .transpose()?;
    let min_cross_section = optional_field(fields, "minCrossSection")
        .map(|value| nonnegative(value, "minCrossSection"))
        .transpose()?;
    Ok(Prepared::VoidContinuity(Void {
        expected,
        path,
        material,
        min_cross_section,
        isolated_from,
        bounds,
        resolved: None,
    }))
}

fn parse_waypoint(value: &Json, label: &str) -> Result<VoidWaypoint, ProtocolError> {
    if matches!(value, Json::Array(_)) {
        return parse_point(value, label).map(VoidWaypoint::Point);
    }
    let fields = object(value, label)?;
    require_fields(fields, &["occurrence"], &["occurrence"], label)?;
    let Json::String(path) = field(fields, "occurrence")? else {
        return invalid_claim(format!("{label}.occurrence must be a string."));
    };
    Ok(VoidWaypoint::Occurrence(path.clone()))
}

fn parse_point(value: &Json, label: &str) -> Result<[f64; 3], ProtocolError> {
    let values = array(value, label)?;
    if values.len() != 3 {
        return invalid_claim(format!("{label} must be a length-three array."));
    }
    Ok([
        finite(&values[0], label)?,
        finite(&values[1], label)?,
        finite(&values[2], label)?,
    ])
}

fn parse_bounds(value: &Json) -> Result<Bounds, ProtocolError> {
    let fields = object(value, "bounds")?;
    require_fields(fields, &["min", "max"], &["min", "max"], "bounds")?;
    let bounds = Bounds {
        min: parse_point(field(fields, "min")?, "bounds.min")?,
        max: parse_point(field(fields, "max")?, "bounds.max")?,
    };
    if (0..3).any(|axis| bounds.min[axis] > bounds.max[axis]) {
        return invalid_claim("bounds.min must not exceed bounds.max.");
    }
    Ok(bounds)
}

fn string_array(value: &Json, label: &str) -> Result<Vec<String>, ProtocolError> {
    array(value, label)?
        .iter()
        .map(|value| match value {
            Json::String(value) => Ok(value.clone()),
            _ => invalid_claim(format!("{label} entries must be strings.")),
        })
        .collect()
}

fn pair_matches(
    pair: &PairPattern,
    left: &str,
    right: &str,
    engine: &dyn EcmaRegexEngine,
) -> Result<bool, EcmaRegexError> {
    Ok(
        (pair.left.matches(left, Some(engine))? && pair.right.matches(right, Some(engine))?)
            || (pair.left.matches(right, Some(engine))?
                && pair.right.matches(left, Some(engine))?),
    )
}

pub(crate) fn evaluate(prepared: &Prepared, context: &mut EvaluationContext<'_>) -> Evaluation {
    match prepared {
        Prepared::ComponentInterference(value) => evaluate_interference(value, context),
        Prepared::MinimumWallThickness(value) => evaluate_wall(value, context),
        Prepared::VoidContinuity(value) => evaluate_void(value, context),
    }
}

fn evaluate_interference(
    prepared: &Interference,
    context: &mut EvaluationContext<'_>,
) -> Evaluation {
    let Some(selected) = &prepared.selected_pairs else {
        return phase_two_refusal(Capability::ToHaveNoComponentInterference);
    };
    let Some(allowance_by_pair) = &prepared.allowance_by_pair else {
        return phase_two_refusal(Capability::ToHaveNoComponentInterference);
    };
    let normalized_expected = normalized_expected(context);
    if let Err(evaluation) = charge_overlap_mesh_base(context) {
        return evaluation;
    }
    let subject = std::rc::Rc::clone(&context.subjects[0]);
    let Some(csg) = context.csg.as_mut() else {
        return csg_refusal(Capability::ToHaveNoComponentInterference);
    };
    let analysis =
        match interference::analyze_overlap(&subject, csg, prepared.tolerance, selected.as_deref())
        {
            Ok(value) => value,
            Err(error) => return backend_refusal(error),
        };
    let OverlapAnalysis::Complete(evidence) = analysis else {
        let OverlapAnalysis::Refused(diagnostics) = analysis else {
            unreachable!()
        };
        return Evaluation::Refused { diagnostics };
    };
    let unexplained: Vec<_> = evidence
        .overlaps
        .iter()
        .filter(|overlap| {
            let key = (
                overlap.left_component_id.min(overlap.right_component_id),
                overlap.left_component_id.max(overlap.right_component_id),
            );
            allowance_by_pair.get(&key).is_none_or(|index| {
                prepared.allowances[*index]
                    .max_volume
                    .is_some_and(|maximum| overlap.intersection_volume > maximum)
            })
        })
        .cloned()
        .collect();
    let positive = unexplained.is_empty();
    let diagnostics = if positive {
        Vec::new()
    } else {
        let mut diagnostic = Diagnostic::error(
            "GEOSPEC_COMPONENT_INTERFERENCE_DETECTED",
            format!(
                "Unclassified component interference detected between {} component pair(s): {}.",
                unexplained.len(),
                unexplained
                    .iter()
                    .map(|overlap| format!(
                        "{}/{} ({} mm³)",
                        overlap.left_label,
                        overlap.right_label,
                        ryu_js::Buffer::new().format_finite(overlap.intersection_volume)
                    ))
                    .collect::<Vec<_>>()
                    .join(", ")
            ),
        );
        diagnostic.suggestion = Some("Fix the assembly so the parts no longer share solid volume, or declare the overlap as an `allowances` entry with its reason and maximum volume.".into());
        diagnostic.spatial = unexplained
            .first()
            .and_then(|overlap| overlap.witness_point)
            .map(|center| Json::object([("center", point_json(center))]));
        diagnostic.details = Some(Json::object([
            ("matcher", Json::string("toHaveNoComponentInterference")),
            (
                "overlaps",
                Json::Array(unexplained.iter().map(interference::overlap_json).collect()),
            ),
            ("checkedPairs", Json::Number(evidence.checked_pairs as f64)),
            ("tolerance", Json::Number(evidence.tolerance)),
        ]));
        vec![diagnostic]
    };
    Evaluation::Geometric {
        positive_satisfied: positive,
        diagnostics,
        evidence: family_evidence(
            &subject.content_hash,
            normalized_expected.clone(),
            interference::measured_json(&evidence),
            interference::witnesses_json(
                &evidence,
                &unexplained,
                expected_member(&normalized_expected, "allowances", Json::Array(Vec::new())),
            ),
        ),
        negated_diagnostic: None,
    }
}

/// Lead-owned ancillary envelope calls this reusable exact analysis body.
pub(crate) fn evaluate_overlap(
    tolerance: f64,
    selected: Option<&[SelectedPair]>,
    context: &mut EvaluationContext<'_>,
) -> Evaluation {
    if let Err(evaluation) = charge_overlap_mesh_base(context) {
        return evaluation;
    }
    let subject = std::rc::Rc::clone(&context.subjects[0]);
    let Some(csg) = context.csg.as_mut() else {
        return csg_refusal(Capability::AnalyzeMeshOverlap);
    };
    match interference::analyze_overlap(&subject, csg, tolerance, selected) {
        Ok(OverlapAnalysis::Complete(evidence)) => Evaluation::Ancillary {
            success: true,
            value: Json::object([
                ("success", Json::Bool(true)),
                ("evidence", interference::evidence_json(&evidence)),
                ("diagnostics", Json::Array(Vec::new())),
            ]),
            diagnostics: Vec::new(),
        },
        Ok(OverlapAnalysis::Refused(diagnostics)) => Evaluation::Ancillary {
            success: false,
            value: Json::object([
                ("success", Json::Bool(false)),
                (
                    "diagnostics",
                    Json::Array(diagnostics.iter().map(Diagnostic::to_json).collect()),
                ),
            ]),
            diagnostics,
        },
        Err(error) => backend_refusal(error),
    }
}

fn evaluate_wall(prepared: &Wall, context: &mut EvaluationContext<'_>) -> Evaluation {
    match context.brep_facts() {
        Ok(Some(_)) => {}
        Ok(None) => {
            return brep_refusal(
                Capability::ToHaveMinimumWallThickness,
                "exact BRep evidence",
            )
        }
        Err(refusal) => return refusal,
    }
    if let Err(error) = context.budget().charge(1) {
        return Evaluation::budget_exceeded(Capability::ToHaveMinimumWallThickness, error);
    }
    let subject = std::rc::Rc::clone(&context.subjects[0]);
    let certificate = match subject.continuous_wall_domain() {
        Ok(value) => value,
        Err(error) if error.kind == BackendErrorKind::Unsupported => {
            return continuous_wall_unsupported()
        }
        Err(error) => return backend_refusal(error),
    };
    let proof = match continuous_wall_proof(&certificate) {
        Ok(value) => value,
        Err(error) => return backend_refusal(error),
    };
    let domain_certificate = match continuous_wall_domain_json(&certificate) {
        Ok(value) => value,
        Err(error) => return backend_refusal(error),
    };
    let normalized_expected = normalized_expected(context);
    let measured = Json::object([
        ("value", Json::Number(proof.value)),
        (
            "criterion",
            Json::string("minimum-antiparallel-smooth-support-material-chord-v1"),
        ),
        ("domain", Json::string(proof.domain)),
        (
            "maximumTopologyToleranceMm",
            Json::Number(certificate.maximum_topology_tolerance_mm),
        ),
    ]);
    let positive = prepared.value.holds(proof.value, prepared.tolerance);
    let diagnostics = if positive {
        Vec::new()
    } else {
        let mut diagnostic = Diagnostic::error(
            "GEOSPEC_FEATURE_MISMATCH",
            format!(
                "The minimum wall thickness is {} mm, which does not satisfy {}.",
                ryu_js::Buffer::new().format_finite(proof.value),
                prepared.value.describe()
            ),
        );
        diagnostic.suggestion =
            Some("Thicken the thinnest wall, or lower the declared minimum.".into());
        diagnostic.details = Some(Json::object([
            ("matcher", Json::string("toHaveMinimumWallThickness")),
            ("measured", measured.clone()),
            ("expected", normalized_expected.clone()),
        ]));
        vec![diagnostic]
    };
    Evaluation::Geometric {
        positive_satisfied: positive,
        diagnostics,
        evidence: family_evidence(
            &subject.content_hash,
            normalized_expected,
            measured,
            Json::object([
                ("domainCertificate", domain_certificate),
                ("attainingSupports", proof.attaining_supports),
                (
                    "materialInterval",
                    Json::object([
                        ("from", Json::Number(0.0)),
                        ("to", Json::Number(1.0)),
                        ("method", Json::string("validated-convex-domain")),
                    ]),
                ),
                ("formula", proof.formula),
            ]),
        ),
        negated_diagnostic: None,
    }
}

struct ContinuousWallProof {
    value: f64,
    domain: &'static str,
    attaining_supports: Json,
    formula: Json,
}

fn continuous_wall_proof(
    certificate: &ContinuousWallDomain,
) -> Result<ContinuousWallProof, BackendError> {
    match &certificate.domain {
        ContinuousWallShape::AxisAlignedBox {
            corners,
            face_indices,
            face_corner_indices,
            opposite_face_pairs,
            edge_lengths,
            ..
        } => {
            if !edge_lengths
                .iter()
                .all(|value| value.is_finite() && *value > 0.0)
            {
                return Err(continuous_wall_computation_failed());
            }
            let mut axis = 0;
            for candidate in 1..3 {
                if edge_lengths[candidate] < edge_lengths[axis] {
                    axis = candidate;
                }
            }
            let [face_a, face_b] = opposite_face_pairs[axis];
            let point_a =
                continuous_wall_face_center(corners, face_indices, face_corner_indices, face_a)?;
            let point_b =
                continuous_wall_face_center(corners, face_indices, face_corner_indices, face_b)?;
            let mut normal_a = [0.0; 3];
            normal_a[axis] = -1.0;
            let mut normal_b = [0.0; 3];
            normal_b[axis] = 1.0;
            Ok(ContinuousWallProof {
                value: edge_lengths[axis],
                domain: "axis-aligned-box",
                attaining_supports: attaining_supports(
                    point_a, point_b, normal_a, normal_b, face_a, face_b,
                ),
                formula: Json::object([
                    ("kind", Json::string("minimum-edge-length")),
                    (
                        "operands",
                        Json::Array(edge_lengths.iter().copied().map(Json::Number).collect()),
                    ),
                ]),
            })
        }
        ContinuousWallShape::RightCircularCylinder {
            origin,
            axis,
            radius,
            from,
            to,
            lateral_face,
            cap_faces,
            ..
        } => {
            let height = to - from;
            let diameter = 2.0 * radius;
            if !height.is_finite() || height <= 0.0 || !diameter.is_finite() || diameter <= 0.0 {
                return Err(continuous_wall_computation_failed());
            }
            let (point_a, point_b, normal_a, normal_b, face_a, face_b) = if height <= diameter {
                (
                    add(*origin, scale(*axis, *from)),
                    add(*origin, scale(*axis, *to)),
                    scale(*axis, -1.0),
                    *axis,
                    cap_faces[0],
                    cap_faces[1],
                )
            } else {
                let cartesian = [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]];
                let mut basis = 0;
                for candidate in 1..3 {
                    if dot(cartesian[candidate], *axis).abs() < dot(cartesian[basis], *axis).abs() {
                        basis = candidate;
                    }
                }
                let projection =
                    subtract(cartesian[basis], scale(*axis, dot(cartesian[basis], *axis)));
                let length = dot(projection, projection).sqrt();
                if !length.is_finite() || length <= 0.0 {
                    return Err(continuous_wall_computation_failed());
                }
                let unit = scale(projection, 1.0 / length);
                let center = add(*origin, scale(*axis, (*from + *to) / 2.0));
                (
                    subtract(center, scale(unit, *radius)),
                    add(center, scale(unit, *radius)),
                    scale(unit, -1.0),
                    unit,
                    *lateral_face,
                    *lateral_face,
                )
            };
            if ![point_a, point_b, normal_a, normal_b]
                .into_iter()
                .flatten()
                .all(f64::is_finite)
            {
                return Err(continuous_wall_computation_failed());
            }
            Ok(ContinuousWallProof {
                value: height.min(diameter),
                domain: "right-circular-cylinder",
                attaining_supports: attaining_supports(
                    point_a, point_b, normal_a, normal_b, face_a, face_b,
                ),
                formula: Json::object([
                    ("kind", Json::string("minimum-height-diameter")),
                    (
                        "operands",
                        Json::Array(vec![Json::Number(height), Json::Number(diameter)]),
                    ),
                ]),
            })
        }
    }
}

fn continuous_wall_face_center(
    corners: &[[f64; 3]; 8],
    face_indices: &[u32; 6],
    face_corner_indices: &[[u32; 4]; 6],
    face: u32,
) -> Result<[f64; 3], BackendError> {
    let index = face_indices
        .iter()
        .position(|candidate| *candidate == face)
        .ok_or_else(continuous_wall_computation_failed)?;
    let mut center = [0.0; 3];
    for corner in face_corner_indices[index] {
        let point = corners
            .get(corner as usize)
            .ok_or_else(continuous_wall_computation_failed)?;
        for axis in 0..3 {
            center[axis] += point[axis];
        }
    }
    center = center.map(|value| value / 4.0);
    if center.into_iter().all(f64::is_finite) {
        Ok(center)
    } else {
        Err(continuous_wall_computation_failed())
    }
}

fn attaining_supports(
    point_a: [f64; 3],
    point_b: [f64; 3],
    normal_a: [f64; 3],
    normal_b: [f64; 3],
    face_a: u32,
    face_b: u32,
) -> Json {
    Json::object([
        ("pointA", point_json(point_a)),
        ("pointB", point_json(point_b)),
        ("normalA", point_json(normal_a)),
        ("normalB", point_json(normal_b)),
        ("faceA", Json::Number(face_a as f64)),
        ("faceB", Json::Number(face_b as f64)),
    ])
}

fn continuous_wall_domain_json(certificate: &ContinuousWallDomain) -> Result<Json, BackendError> {
    let number = |value: f64| {
        if value.is_finite() {
            Ok(Json::Number(value))
        } else {
            Err(continuous_wall_computation_failed())
        }
    };
    let numbers = |values: &[f64]| {
        values
            .iter()
            .copied()
            .map(number)
            .collect::<Result<Vec<_>, _>>()
            .map(Json::Array)
    };
    let points = |values: &[[f64; 3]]| {
        values
            .iter()
            .map(|point| numbers(point))
            .collect::<Result<Vec<_>, _>>()
            .map(Json::Array)
    };
    let indices = |values: &[u32]| {
        Json::Array(
            values
                .iter()
                .map(|value| Json::Number(f64::from(*value)))
                .collect(),
        )
    };
    let domain = match &certificate.domain {
        ContinuousWallShape::AxisAlignedBox {
            corners,
            face_indices,
            face_corner_indices,
            outward_normals,
            opposite_face_pairs,
            edge_lengths,
        } => Json::object([
            ("kind", Json::string("axis-aligned-box")),
            ("corners", points(corners)?),
            ("faceIndices", indices(face_indices)),
            (
                "faceCornerIndices",
                Json::Array(face_corner_indices.iter().map(|row| indices(row)).collect()),
            ),
            ("outwardNormals", points(outward_normals)?),
            (
                "oppositeFacePairs",
                Json::Array(opposite_face_pairs.iter().map(|row| indices(row)).collect()),
            ),
            ("edgeLengths", numbers(edge_lengths)?),
        ]),
        ContinuousWallShape::RightCircularCylinder {
            origin,
            axis,
            radius,
            from,
            to,
            lateral_face,
            cap_faces,
            lateral_parameter_bounds,
            rim_centers,
            rim_radii,
            rim_edge_indices,
            seam_edge_index,
            periodic_attachment,
        } => Json::object([
            ("kind", Json::string("right-circular-cylinder")),
            ("origin", numbers(origin)?),
            ("axis", numbers(axis)?),
            ("radius", number(*radius)?),
            ("from", number(*from)?),
            ("to", number(*to)?),
            ("lateralFace", Json::Number(f64::from(*lateral_face))),
            ("capFaces", indices(cap_faces)),
            ("lateralParameterBounds", numbers(lateral_parameter_bounds)?),
            ("rimCenters", points(rim_centers)?),
            ("rimRadii", numbers(rim_radii)?),
            ("rimEdgeIndices", indices(rim_edge_indices)),
            ("seamEdgeIndex", Json::Number(f64::from(*seam_edge_index))),
            ("periodicAttachment", {
                use crate::backend::brep::{
                    CylinderAttachmentProfile, CylinderBoundaryOrientation, CylinderBoundarySide,
                };
                let value = periodic_attachment;
                Json::object([
                    (
                        "profile",
                        Json::string(match value.profile {
                            CylinderAttachmentProfile::PhaseZeroV1 => {
                                "geospec-cylinder-phase-zero-attachment-v1"
                            }
                        }),
                    ),
                    ("phaseX", numbers(&value.phase_x)?),
                    ("phaseY", numbers(&value.phase_y)?),
                    ("surfacePeriod", number(value.surface_period)?),
                    (
                        "rimCurveRanges",
                        Json::Array(
                            value
                                .rim_curve_ranges
                                .iter()
                                .map(|row| numbers(row))
                                .collect::<Result<Vec<_>, _>>()?,
                        ),
                    ),
                    ("rimCurvePeriods", numbers(&value.rim_curve_periods)?),
                    (
                        "capPcurveRanges",
                        Json::Array(
                            value
                                .cap_pcurve_ranges
                                .iter()
                                .map(|row| numbers(row))
                                .collect::<Result<Vec<_>, _>>()?,
                        ),
                    ),
                    ("capPcurvePeriods", numbers(&value.cap_pcurve_periods)?),
                    (
                        "capPcurveStored",
                        Json::Array(
                            value
                                .cap_pcurve_stored
                                .iter()
                                .copied()
                                .map(Json::Bool)
                                .collect(),
                        ),
                    ),
                    ("seamCurveRange", numbers(&value.seam_curve_range)?),
                    (
                        "lateralBoundary",
                        Json::Array(
                            value
                                .lateral_boundary
                                .iter()
                                .map(|row| {
                                    Ok(Json::object([
                                        ("edgeIndex", Json::Number(f64::from(row.edge_index))),
                                        (
                                            "orientation",
                                            Json::string(match row.orientation {
                                                CylinderBoundaryOrientation::Forward => "forward",
                                                CylinderBoundaryOrientation::Reversed => "reversed",
                                            }),
                                        ),
                                        (
                                            "side",
                                            Json::string(match row.side {
                                                CylinderBoundarySide::U0 => "u0",
                                                CylinderBoundarySide::U1 => "u1",
                                                CylinderBoundarySide::V0 => "v0",
                                                CylinderBoundarySide::V1 => "v1",
                                            }),
                                        ),
                                        ("curveRange", numbers(&row.curve_range)?),
                                        ("pcurveStored", Json::Bool(row.pcurve_stored)),
                                        (
                                            "parameterEndpoints",
                                            Json::Array(
                                                row.parameter_endpoints
                                                    .iter()
                                                    .map(|point| numbers(point))
                                                    .collect::<Result<Vec<_>, BackendError>>()?,
                                            ),
                                        ),
                                    ]))
                                })
                                .collect::<Result<Vec<_>, BackendError>>()?,
                        ),
                    ),
                    (
                        "vertices",
                        Json::Array(
                            value
                                .vertices
                                .iter()
                                .map(|vertex| {
                                    Ok(Json::object([
                                        (
                                            "vertexIndex",
                                            Json::Number(f64::from(vertex.vertex_index)),
                                        ),
                                        ("point", numbers(&vertex.point)?),
                                    ]))
                                })
                                .collect::<Result<Vec<_>, BackendError>>()?,
                        ),
                    ),
                    ("seamVertexIndices", indices(&value.seam_vertex_indices)),
                    (
                        "rimVertexIndices",
                        Json::Array(
                            value
                                .rim_vertex_indices
                                .iter()
                                .map(|row| indices(row))
                                .collect(),
                        ),
                    ),
                ])
            }),
        ]),
    };
    Ok(Json::object([
        (
            "maximumTopologyToleranceMm",
            number(certificate.maximum_topology_tolerance_mm)?,
        ),
        ("domain", domain),
    ]))
}

fn add(left: [f64; 3], right: [f64; 3]) -> [f64; 3] {
    std::array::from_fn(|axis| left[axis] + right[axis])
}

fn subtract(left: [f64; 3], right: [f64; 3]) -> [f64; 3] {
    std::array::from_fn(|axis| left[axis] - right[axis])
}

fn scale(value: [f64; 3], factor: f64) -> [f64; 3] {
    value.map(|component| component * factor)
}

fn dot(left: [f64; 3], right: [f64; 3]) -> f64 {
    left.into_iter()
        .zip(right)
        .map(|(left, right)| left * right)
        .sum()
}

fn continuous_wall_computation_failed() -> BackendError {
    BackendError {
        kind: BackendErrorKind::ComputationFailed,
        message: "The continuous wall certificate produced invalid derived algebra.".into(),
    }
}

fn continuous_wall_unsupported() -> Evaluation {
    let mut diagnostic = Diagnostic::error(
        "GEOSPEC_EVIDENCE_UNSUPPORTED",
        "The subject is outside the qualified continuous wall-thickness domains.",
    );
    diagnostic.suggestion = Some(
        "Use a complete validated box or cylinder supported by the declared continuous wall profile."
            .into(),
    );
    diagnostic.details = Some(Json::object([
        ("matcher", Json::string("toHaveMinimumWallThickness")),
        ("profile", Json::string("geospec-wall-convex-analytic-v1")),
        ("continuousMinimumQualified", Json::Bool(false)),
    ]));
    Evaluation::Refused {
        diagnostics: vec![diagnostic],
    }
}

fn evaluate_void(prepared: &Void, context: &mut EvaluationContext<'_>) -> Evaluation {
    let Some(resolved) = &prepared.resolved else {
        return phase_two_refusal(Capability::ToHaveVoidContinuity);
    };
    let claim = match resolved {
        Ok(value) => value,
        Err(diagnostics) => {
            return Evaluation::Refused {
                diagnostics: diagnostics.clone(),
            }
        }
    };
    if prepared.min_cross_section.is_some() {
        let mut diagnostic = Diagnostic::error(
            "GEOSPEC_EVIDENCE_UNSUPPORTED",
            "The void profile samples cross-sections; a continuous minimum cross-section is not qualified.",
        );
        diagnostic.suggestion = Some(
            "Use a qualified continuous section proof for the declared geometry representation."
                .into(),
        );
        diagnostic.details = Some(Json::object([
            ("matcher", Json::string("toHaveVoidContinuity")),
            ("profile", Json::string("geospec-void-sampled-sections-v1")),
            ("continuousMinimumQualified", Json::Bool(false)),
        ]));
        return Evaluation::Refused {
            diagnostics: vec![diagnostic],
        };
    }
    let normalized_expected = normalized_expected(context);
    let subject = std::rc::Rc::clone(&context.subjects[0]);
    let Some(csg) = context.csg.as_mut() else {
        return csg_refusal(Capability::ToHaveVoidContinuity);
    };
    match voids::prove(claim, &subject, csg) {
        Ok(VoidDecision::Decided {
            positive,
            evidence,
            diagnostics,
        }) => {
            let proof = voids::evidence_json(&evidence);
            Evaluation::Geometric {
                positive_satisfied: positive,
                diagnostics,
                evidence: family_evidence(
                    &subject.content_hash,
                    normalized_expected,
                    proof.clone(),
                    Json::object([("proof", proof)]),
                ),
                negated_diagnostic: None,
            }
        }
        Ok(VoidDecision::Refused {
            evidence,
            diagnostics,
        }) => {
            let diagnostics = diagnostics
                .into_iter()
                .map(|mut diagnostic| {
                    if let Some(evidence) = &evidence {
                        let mut details = vec![("evidence".into(), voids::evidence_json(evidence))];
                        if let Some(Json::Object(mut existing)) = diagnostic.details.take() {
                            details.append(&mut existing);
                        }
                        diagnostic.details = Some(Json::Object(details));
                    }
                    diagnostic
                })
                .collect();
            Evaluation::Refused { diagnostics }
        }
        Err(error) => backend_refusal(error),
    }
}

fn charge_overlap_mesh_base(context: &mut EvaluationContext<'_>) -> Result<(), Evaluation> {
    context.charge_mesh_demand()
}

fn normalized_expected(context: &EvaluationContext<'_>) -> Json {
    expected_member(context.normalized_expected, "expected", Json::Null)
}

fn expected_member(expected: &Json, key: &str, fallback: Json) -> Json {
    let Json::Object(fields) = expected else {
        return fallback;
    };
    fields
        .iter()
        .find_map(|(name, value)| (name == key).then(|| value.clone()))
        .unwrap_or(fallback)
}

fn resolve_void(prepared: &Void, index: &SelectorIndex) -> Result<VoidClaim, Vec<Diagnostic>> {
    if prepared.path.is_empty() {
        return Err(void_unsupported(
            "A void-continuity claim needs at least one path waypoint.",
            "Declare `path` with the subject-frame points (or occurrences) known to lie in the void.",
            None,
        ));
    }
    if prepared.material.is_none() && prepared.bounds.is_none() {
        return Err(void_unsupported(
            "A void-continuity claim needs a material set or explicit bounds: with neither, the void has no boundary and no region to prove it in.",
            "Declare `material` with the occurrences that bound the void, or `bounds` with the region to prove it in.",
            None,
        ));
    }
    let material_paths = prepared.material.clone().unwrap_or_else(|| {
        index
            .occurrences
            .iter()
            .map(|row| row.path.clone())
            .collect()
    });
    let mut materials = Vec::with_capacity(material_paths.len());
    for path in &material_paths {
        let Some(row) = index.occurrences.iter().find(|row| &row.path == path) else {
            return Err(void_unsupported(
                &format!("The void claim names material occurrence '{path}', which this subject's STEP-XDE structure does not contain."),
                "Name occurrences exactly as the assembly exports them, or drop the material entry.",
                Some(Json::object([("occurrence", Json::string(path))])),
            ));
        };
        materials.push(row.occurrence);
    }
    if materials.is_empty() {
        return Err(void_unsupported(
            "The void claim resolved to an empty material set, so nothing bounds the void.",
            "Name at least one occurrence in `material`.",
            None,
        ));
    }
    let mut waypoints = Vec::with_capacity(prepared.path.len());
    for waypoint in &prepared.path {
        match waypoint {
            VoidWaypoint::Point(point) => waypoints.push(*point),
            VoidWaypoint::Occurrence(path) => {
                let Some(bounds) = index
                    .occurrences
                    .iter()
                    .find(|row| &row.path == path)
                    .and_then(|row| row.bounds)
                else {
                    return Err(void_unsupported(
                        &format!("The void claim's waypoint occurrence '{path}' has no exact bounds in this subject."),
                        "Use an explicit [x, y, z] waypoint, or name an occurrence the STEP export carries faces for.",
                        Some(Json::object([("occurrence", Json::string(path))])),
                    ));
                };
                waypoints.push(bounds_center(bounds));
            }
        }
    }
    let region = match prepared.bounds {
        Some(value) => value,
        None => {
            let mut union = None;
            for path in &material_paths {
                if let Some(bounds) = index
                    .occurrences
                    .iter()
                    .find(|row| &row.path == path)
                    .and_then(|row| row.bounds)
                {
                    union = Some(union_bounds(union, bounds));
                }
            }
            let Some(union) = union else {
                return Err(void_unsupported(
                    "The void claim declared no bounds and its material occurrences carry no exact bounds to derive them from.",
                    "Declare `bounds` explicitly.",
                    None,
                ));
            };
            Bounds {
                min: union.min.map(|value| value - VOID_REGION_PADDING_MM),
                max: union.max.map(|value| value + VOID_REGION_PADDING_MM),
            }
        }
    };
    for point in waypoints.iter().chain(&prepared.isolated_from) {
        if !contains(region, *point) {
            return Err(void_unsupported(
                &format!("The void claim's point [{}] lies outside the proven region, so no engine can decide it.", joined_point(*point)),
                "Widen `bounds`, or move the waypoint inside the region the material set spans.",
                Some(Json::object([
                    ("point", point_json(*point)),
                    ("region", bounds_json(region)),
                ])),
            ));
        }
    }
    Ok(VoidClaim {
        waypoints,
        materials,
        material_paths,
        region,
        isolated_from: prepared.isolated_from.clone(),
        min_cross_section: prepared.min_cross_section,
    })
}

fn phase_two_refusal(capability: Capability) -> Evaluation {
    let mut diagnostic = Diagnostic::error(
        "GEOSPEC_BACKEND_FAILED",
        format!(
            "GeoSpec matcher '{}' reached evaluation before whole-batch phase-two resolution.",
            capability.name()
        ),
    );
    diagnostic.suggestion = Some(
        "Resolve all retained selector and occurrence facts after whole-batch validation and before proof calls."
            .into(),
    );
    Evaluation::Refused {
        diagnostics: vec![diagnostic],
    }
}

fn csg_refusal(capability: Capability) -> Evaluation {
    let mut diagnostic = Diagnostic::error(
        "GEOSPEC_UNSUPPORTED_EVIDENCE",
        format!(
            "GeoSpec matcher '{}' requires a qualified exact CSG connector.",
            capability.name()
        ),
    );
    diagnostic.suggestion = Some(
        "Use a native build whose operation-specific Manifold qualification covers this proof."
            .into(),
    );
    Evaluation::Refused {
        diagnostics: vec![diagnostic],
    }
}

fn brep_refusal(capability: Capability, missing: &str) -> Evaluation {
    let mut diagnostic = Diagnostic::error(
        "GEOSPEC_EVIDENCE_UNSUPPORTED",
        format!(
            "GeoSpec matcher '{}' requires {missing}.",
            capability.name()
        ),
    );
    diagnostic.suggestion = Some(BREP_SUGGESTION.into());
    Evaluation::Refused {
        diagnostics: vec![diagnostic],
    }
}

fn void_unsupported(message: &str, suggestion: &str, details: Option<Json>) -> Vec<Diagnostic> {
    let mut diagnostic = Diagnostic::error("GEOSPEC_VOID_CONTINUITY_UNSUPPORTED", message);
    diagnostic.suggestion = Some(suggestion.into());
    diagnostic.details = details;
    vec![diagnostic]
}

fn contains(bounds: Bounds, point: [f64; 3]) -> bool {
    (0..3).all(|axis| point[axis] >= bounds.min[axis] && point[axis] <= bounds.max[axis])
}
fn bounds_center(bounds: Bounds) -> [f64; 3] {
    std::array::from_fn(|axis| (bounds.min[axis] + bounds.max[axis]) / 2.0)
}
fn union_bounds(left: Option<Bounds>, right: Bounds) -> Bounds {
    left.map_or(right, |left| Bounds {
        min: std::array::from_fn(|axis| left.min[axis].min(right.min[axis])),
        max: std::array::from_fn(|axis| left.max[axis].max(right.max[axis])),
    })
}
fn point_json(point: [f64; 3]) -> Json {
    Json::Array(point.into_iter().map(Json::Number).collect())
}
fn bounds_json(bounds: Bounds) -> Json {
    Json::object([
        ("min", point_json(bounds.min)),
        ("max", point_json(bounds.max)),
    ])
}
fn joined_point(point: [f64; 3]) -> String {
    point
        .into_iter()
        .map(|value| ryu_js::Buffer::new().format_finite(value).to_owned())
        .collect::<Vec<_>>()
        .join(", ")
}

#[cfg(test)]
mod tests {
    use super::*;

    struct NoRegex;

    impl EcmaRegexEngine for NoRegex {
        fn validate(&self, _: &str, _: &str) -> Result<(), EcmaRegexError> {
            unreachable!()
        }

        fn test(&self, _: &str, _: &str, _: &str) -> Result<bool, EcmaRegexError> {
            unreachable!()
        }
    }

    fn identities(values: &[(u32, &str)]) -> Vec<ComponentIdentity> {
        values
            .iter()
            .map(|&(id, label)| ComponentIdentity {
                id,
                label: label.into(),
            })
            .collect()
    }

    #[test]
    fn sparse_component_ids_reach_selected_pairs_and_allowances() {
        let pair = PairPattern {
            left: TextPattern::Exact("A".into()),
            right: TextPattern::Exact("B".into()),
        };
        let mut prepared = Prepared::ComponentInterference(Interference {
            expected: Json::Object(Vec::new()),
            tolerance: DEFAULT_TOLERANCE_MM,
            pairs: Some(vec![pair.clone()]),
            allowances: vec![Allowance {
                pair,
                max_volume: Some(0.5),
            }],
            selected_pairs: None,
            unmatched_pairs: Vec::new(),
            allowance_by_pair: None,
        });
        prepared
            .resolve_component_patterns(&identities(&[(1, "A"), (2, "B")]), &NoRegex)
            .unwrap();
        let Prepared::ComponentInterference(prepared) = prepared else {
            unreachable!()
        };
        let pair = &prepared.selected_pairs.unwrap().unwrap()[0];
        assert_eq!((pair.left, pair.right), (1, 2));
        assert_eq!(prepared.allowance_by_pair.unwrap().get(&(1, 2)), Some(&0));
    }

    #[test]
    fn duplicate_display_labels_expand_to_distinct_component_ids() {
        let mut prepared = prepare(
            Capability::ToHaveNoComponentInterference,
            &Json::object([
                ("kind", Json::string("componentInterference")),
                (
                    "expected",
                    Json::object([(
                        "pairs",
                        Json::Array(vec![Json::object([
                            ("left", Json::string("A")),
                            ("right", Json::string("A")),
                        ])]),
                    )]),
                ),
            ]),
        )
        .unwrap();
        prepared
            .resolve_component_patterns(&identities(&[(4, "A"), (9, "A")]), &NoRegex)
            .unwrap();
        let Prepared::ComponentInterference(prepared) = prepared else {
            unreachable!()
        };
        let pair = &prepared.selected_pairs.unwrap().unwrap()[0];
        assert_eq!((pair.left, pair.right), (4, 9));
        assert!(prepared.unmatched_pairs.is_empty());
    }

    #[test]
    fn allowance_optional_tag_preserves_authored_presence() {
        for tag in [None, Some("intentionalInterference")] {
            let mut allowance = serde_json::json!({
                "left": "A", "right": "B", "maxVolume": 0.5, "reason": "declared fit"
            });
            if let Some(tag) = tag {
                allowance["kind"] = serde_json::json!(tag);
            }
            let payload = crate::codec::decode(
                serde_json::json!({"kind":"componentInterference","expected":{"allowances":[allowance.clone()]}})
                    .to_string().as_bytes(),
            ).unwrap();
            let prepared = prepare(Capability::ToHaveNoComponentInterference, &payload).unwrap();
            let normalized = prepared.normalized_payload();
            let fields = object(&normalized, "payload").unwrap();
            let fields = object(field(fields, "expected").unwrap(), "expected").unwrap();
            let expected_allowances =
                crate::codec::decode(serde_json::json!([allowance]).to_string().as_bytes())
                    .unwrap();
            assert_eq!(field(fields, "allowances").unwrap(), &expected_allowances);
            let Prepared::ComponentInterference(value) = prepared else {
                unreachable!()
            };
            assert_eq!(value.allowances.len(), 1);
            assert_eq!(value.allowances[0].max_volume, Some(0.5));
        }
    }

    #[test]
    fn normalized_proofs_include_effective_defaults() {
        let interference = prepare(
            Capability::ToHaveNoComponentInterference,
            &Json::object([
                ("kind", Json::string("componentInterference")),
                ("expected", Json::Object(Vec::new())),
            ]),
        )
        .unwrap()
        .normalized_payload();
        let wall = prepare(
            Capability::ToHaveMinimumWallThickness,
            &Json::object([
                ("kind", Json::string("minimumWallThickness")),
                ("expected", Json::object([("value", Json::Number(1.0))])),
            ]),
        )
        .unwrap()
        .normalized_payload();
        let void = prepare(
            Capability::ToHaveVoidContinuity,
            &Json::object([
                ("kind", Json::string("voidContinuity")),
                (
                    "expected",
                    Json::object([
                        ("path", Json::Array(vec![point_json([0.0, 0.0, 0.0])])),
                        (
                            "bounds",
                            Json::object([
                                ("min", point_json([-1.0, -1.0, -1.0])),
                                ("max", point_json([1.0, 1.0, 1.0])),
                            ]),
                        ),
                    ]),
                ),
            ]),
        )
        .unwrap()
        .normalized_payload();

        fn expected_fields(payload: &Json) -> &[(String, Json)] {
            let payload = object(payload, "payload").unwrap();
            object(field(payload, "expected").unwrap(), "expected").unwrap()
        }
        assert_eq!(
            optional_field(expected_fields(&interference), "tolerance"),
            Some(&Json::Number(DEFAULT_TOLERANCE_MM))
        );
        assert_eq!(
            optional_field(expected_fields(&wall), "tolerance"),
            Some(&Json::Number(DEFAULT_LINEAR_TOLERANCE))
        );
        assert_eq!(
            optional_field(expected_fields(&void), "isolatedFrom"),
            Some(&Json::Array(Vec::new()))
        );
    }

    #[test]
    fn void_region_is_closed() {
        let bounds = Bounds {
            min: [0.0; 3],
            max: [1.0; 3],
        };
        assert!(contains(bounds, [0.0, 0.5, 1.0]));
        assert!(!contains(bounds, [-f64::EPSILON, 0.5, 1.0]));
    }
    #[test]
    fn required_pair_refusals_match_predeclared_full_bytes_for_both_polarities() {
        let controls: serde_json::Value = serde_json::from_str(include_str!(
            "../../../conformance/required-pair-controls.json"
        ))
        .unwrap();
        for row in controls["rows"].as_array().unwrap() {
            let payload = crate::codec::decode(serde_json::json!({"kind":"componentInterference","expected":{"pairs":row["pairs"]}}).to_string().as_bytes()).unwrap();
            let mut prepared =
                prepare(Capability::ToHaveNoComponentInterference, &payload).unwrap();
            prepared
                .resolve_component_patterns(&identities(&[(0, "A"), (1, "B")]), &NoRegex)
                .unwrap();
            let refusal = prepared
                .required_pair_refusal(Capability::ToHaveNoComponentInterference)
                .unwrap();
            let polarity = if row["polarity"] == "positive" {
                crate::result::Polarity::Positive
            } else {
                crate::result::Polarity::Negative
            };
            let result = crate::result::finish(
                "required-pair",
                Capability::ToHaveNoComponentInterference,
                polarity,
                refusal,
            )
            .unwrap();
            assert_eq!(
                crate::codec::encode(&result).unwrap(),
                row["expectedCanonicalResultUtf8"]
                    .as_str()
                    .unwrap()
                    .as_bytes()
            );
        }
    }

    #[test]
    fn required_pairs_are_individual_and_allowances_remain_optional() {
        for (expected, unmatched) in [
            (
                serde_json::json!({"pairs":[{"left":"A","right":"B"},{"left":"A","right":"absent"}]}),
                vec![1],
            ),
            (
                serde_json::json!({"pairs":[{"left":"A","right":"A"}]}),
                vec![0],
            ),
            (serde_json::json!({"pairs":[]}), vec![]),
            (
                serde_json::json!({"allowances":[{"kind":"intentionalInterference","left":"absent","right":"B","reason":"optional fixture"}]}),
                vec![],
            ),
        ] {
            let payload = crate::codec::decode(
                serde_json::json!({"kind":"componentInterference","expected":expected})
                    .to_string()
                    .as_bytes(),
            )
            .unwrap();
            let mut prepared =
                prepare(Capability::ToHaveNoComponentInterference, &payload).unwrap();
            prepared
                .resolve_component_patterns(&identities(&[(0, "A"), (1, "B")]), &NoRegex)
                .unwrap();
            let Prepared::ComponentInterference(value) = prepared else {
                unreachable!()
            };
            assert_eq!(value.unmatched_pairs, unmatched);
        }
    }
}
