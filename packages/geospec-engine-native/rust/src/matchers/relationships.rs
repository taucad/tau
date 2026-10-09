//! Exact BRep spatial-relationship matcher family.

use std::rc::Rc;

use crate::analysis::node24_hypot3;
#[cfg(test)]
use crate::backend::brep::PointState;
use crate::{
    analysis::continuous::{self, InsertionRequest, Outcome},
    analysis::selection::{
        resolve_budgeted_with_brep, Cardinality, EcmaRegexEngine, EcmaRegexError, Entity,
        EntityFacts, Query, Selection, SelectionStatus, Selector, SelectorIndex, Stability,
        TextPattern,
    },
    backend::{
        brep::{Bounds, BrepEntity, BrepSubject, CylinderAxialExtent, NominalCylindricalBand},
        BackendError, BackendErrorKind,
    },
    codec::{encode, Json},
    prepared::{
        expected, finite, nonnegative, normalized_payload, AnalysisDemand,
        DEFAULT_ANGULAR_TOLERANCE_DEGREES, DEFAULT_LINEAR_TOLERANCE,
    },
    protocol::{array, field, invalid_claim, object, optional_field, require_fields},
    registry::Capability,
    result::{Diagnostic, Evaluation},
    subject::{backend_refusal, EvaluationContext},
    ProtocolError,
};

const BREP_SUGGESTION: &str =
    "Load the model as STEP (`loadModel({ file, format: \"step\" })`) so GeoSpec has exact BRep evidence.";

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum Kind {
    Contact,
    Clearance,
    Coaxial,
    Concentric,
    Coplanar,
    Parallel,
    Perpendicular,
    Angle,
    Containment,
    Insertion,
    Interference,
}

impl Kind {
    fn parse(value: &Json) -> Result<Self, ProtocolError> {
        let Json::String(value) = value else {
            return invalid_claim("relationship.kind must be a string.");
        };
        match value.as_str() {
            "contact" => Ok(Self::Contact),
            "clearance" => Ok(Self::Clearance),
            "coaxial" => Ok(Self::Coaxial),
            "concentric" => Ok(Self::Concentric),
            "coplanar" => Ok(Self::Coplanar),
            "parallel" => Ok(Self::Parallel),
            "perpendicular" => Ok(Self::Perpendicular),
            "angle" => Ok(Self::Angle),
            "containment" => Ok(Self::Containment),
            "insertion" => Ok(Self::Insertion),
            "interference" => Ok(Self::Interference),
            _ => invalid_claim(format!("Unknown spatial relationship kind '{value}'.")),
        }
    }
}

#[derive(Clone, Debug)]
struct Relationship {
    raw: Json,
    id: Option<String>,
    kind: Kind,
    subject_raw: Json,
    target_raw: Json,
    subject: Selector,
    target: Selector,
    tolerance: Option<f64>,
    angular_tolerance_degrees: Option<f64>,
    angle_degrees: Option<f64>,
    axis: Option<[f64; 3]>,
    min: Option<f64>,
    max: Option<f64>,
    min_volume: Option<f64>,
    max_volume: Option<f64>,
    resolved: Option<(Selection, Selection)>,
    resolved_bores: Option<(Vec<BoreEvidence>, Vec<BoreEvidence>)>,
}

#[derive(Clone, Debug)]
pub(crate) struct Prepared {
    relationships: Vec<Relationship>,
}

impl Prepared {
    fn normalized_expected(&self) -> Json {
        Json::object([(
            "relationships",
            Json::Array(
                self.relationships
                    .iter()
                    .map(normalized_relationship)
                    .collect(),
            ),
        )])
    }

    pub(crate) fn normalized_payload(&self) -> Json {
        normalized_payload(
            Capability::ToHaveSpatialRelationships,
            self.normalized_expected(),
        )
    }

    pub(crate) fn demand(&self) -> AnalysisDemand {
        AnalysisDemand {
            selectors: true,
            ..AnalysisDemand::default()
        }
    }

    /// Phase-one syntax validation. Lead invokes this for the whole batch before
    /// any selector resolution or proof query.
    pub(crate) fn validate_regexes(
        &self,
        engine: &dyn EcmaRegexEngine,
    ) -> Result<(), EcmaRegexError> {
        for relationship in &self.relationships {
            validate_selector_regexes(&relationship.subject, engine)?;
            validate_selector_regexes(&relationship.target, engine)?;
        }
        Ok(())
    }

    /// Phase-two resolution through the one shared selector implementation.
    pub(crate) fn resolve_selectors(
        &mut self,
        index: &SelectorIndex,
        engine: &dyn EcmaRegexEngine,
        brep: Option<&dyn BrepSubject>,
        budget: &crate::budget::Budget,
    ) {
        for relationship in &mut self.relationships {
            let resolved = (
                resolve_budgeted_with_brep(
                    &relationship.subject,
                    index,
                    engine,
                    brep,
                    Some(budget),
                ),
                resolve_budgeted_with_brep(&relationship.target, index, engine, brep, Some(budget)),
            );
            if budget.used() > budget.limit() {
                return;
            }
            let containment_bore = relationship.kind == Kind::Containment
                && resolved.1.entities.len() == 1
                && resolved.1.entities[0].facts.surface_type.as_deref() == Some("cylinder");
            let resolve_subject = containment_bore && resolved.0.entities.len() == 1;
            let resolve_target = containment_bore;
            relationship.resolved_bores = Some((
                resolve_bore_evidence(&resolved.0, brep, resolve_subject, budget),
                resolve_bore_evidence(&resolved.1, brep, resolve_target, budget),
            ));
            relationship.resolved = Some(resolved);
        }
    }
}

fn normalized_relationship(relationship: &Relationship) -> Json {
    let mut value = relationship.raw.clone();
    match relationship.kind {
        Kind::Contact => {
            set_number(
                &mut value,
                "tolerance",
                relationship.tolerance.unwrap_or(DEFAULT_LINEAR_TOLERANCE),
            );
            set_number(
                &mut value,
                "angularToleranceDegrees",
                relationship
                    .angular_tolerance_degrees
                    .unwrap_or(DEFAULT_ANGULAR_TOLERANCE_DEGREES),
            );
        }
        Kind::Clearance => {
            set_number(
                &mut value,
                "tolerance",
                relationship.tolerance.unwrap_or(0.0),
            );
        }
        Kind::Coaxial | Kind::Concentric | Kind::Coplanar => {
            set_number(
                &mut value,
                "tolerance",
                relationship.tolerance.unwrap_or(DEFAULT_LINEAR_TOLERANCE),
            );
            set_number(
                &mut value,
                "angularToleranceDegrees",
                relationship
                    .angular_tolerance_degrees
                    .unwrap_or(DEFAULT_ANGULAR_TOLERANCE_DEGREES),
            );
        }
        Kind::Parallel | Kind::Perpendicular | Kind::Angle => {
            let angle = if relationship.kind == Kind::Perpendicular {
                90.0
            } else {
                relationship.angle_degrees.unwrap_or(0.0)
            };
            set_number(&mut value, "angleDegrees", angle);
            set_number(
                &mut value,
                "angularToleranceDegrees",
                relationship
                    .angular_tolerance_degrees
                    .unwrap_or(DEFAULT_ANGULAR_TOLERANCE_DEGREES),
            );
        }
        Kind::Insertion => {
            set_number(&mut value, "min", relationship.min.unwrap_or(0.0));
        }
        Kind::Interference => {
            set_number(
                &mut value,
                "minVolume",
                relationship.min_volume.unwrap_or(0.0),
            );
            set_number(
                &mut value,
                "maxVolume",
                relationship.max_volume.unwrap_or(0.0),
            );
        }
        Kind::Containment => {}
    }
    value
}

fn set_number(value: &mut Json, name: &str, number: f64) {
    let Json::Object(fields) = value else {
        unreachable!("prepared relationship is an object")
    };
    if let Some((_, value)) = fields.iter_mut().find(|(key, _)| key == name) {
        *value = Json::Number(number);
    } else {
        fields.push((name.into(), Json::Number(number)));
    }
}

/// CONTACT01/EFFECTIVEDEFAULTS01 amend only these typed evidence copies.
/// Other canonical defaults and authored fields keep their original presence.
fn effective_relationship_copy(relationship: &Relationship) -> Json {
    let fields: &[&str] = match relationship.kind {
        Kind::Contact | Kind::Coaxial => &["angularToleranceDegrees"],
        Kind::Parallel | Kind::Perpendicular | Kind::Angle => {
            &["angleDegrees", "angularToleranceDegrees"]
        }
        _ => return relationship.raw.clone(),
    };
    let normalized = normalized_relationship(relationship);
    let mut value = relationship.raw.clone();
    for field in fields {
        let Some(Json::Number(number)) = json_field(&normalized, field) else {
            unreachable!("approved effective relationship default is numeric")
        };
        set_number(&mut value, field, number);
    }
    value
}

pub(crate) fn prepare(payload: &Json) -> Result<Prepared, ProtocolError> {
    let expected = expected(Capability::ToHaveSpatialRelationships, payload)?;
    let fields = object(&expected, "spatial relationships expectation")?;
    require_fields(
        fields,
        &["relationships"],
        &["relationships"],
        "spatial relationships expectation",
    )?;
    let rows = array(field(fields, "relationships")?, "relationships")?;
    let mut relationships = Vec::with_capacity(rows.len());
    for (index, raw) in rows.iter().enumerate() {
        relationships.push(parse_relationship(raw, index)?);
    }
    Ok(Prepared { relationships })
}

fn parse_relationship(value: &Json, index: usize) -> Result<Relationship, ProtocolError> {
    let label = format!("relationships[{index}]");
    let fields = object(value, &label)?;
    let allowed = [
        "id",
        "kind",
        "subject",
        "target",
        "tolerance",
        "angularToleranceDegrees",
        "angleDegrees",
        "axis",
        "min",
        "max",
        "minVolume",
        "maxVolume",
        "reason",
    ];
    require_fields(fields, &allowed, &["kind", "subject", "target"], &label)?;
    let id = optional_field(fields, "id")
        .map(|value| match value {
            Json::String(value) => Ok(value.clone()),
            _ => invalid_claim(format!("{label}.id must be a string.")),
        })
        .transpose()?;
    if let Some(Json::String(_)) | None = optional_field(fields, "reason") {
    } else {
        return invalid_claim(format!("{label}.reason must be a string."));
    }
    let parse_optional = |key: &str| {
        optional_field(fields, key)
            .map(|value| finite(value, &format!("{label}.{key}")))
            .transpose()
    };
    let tolerance = optional_field(fields, "tolerance")
        .map(|value| nonnegative(value, &format!("{label}.tolerance")))
        .transpose()?;
    let angular_tolerance_degrees = optional_field(fields, "angularToleranceDegrees")
        .map(|value| nonnegative(value, &format!("{label}.angularToleranceDegrees")))
        .transpose()?;
    let axis = optional_field(fields, "axis")
        .map(|value| vector(value, &format!("{label}.axis")))
        .transpose()?;
    Ok(Relationship {
        raw: value.clone(),
        id,
        kind: Kind::parse(field(fields, "kind")?)?,
        subject_raw: field(fields, "subject")?.clone(),
        target_raw: field(fields, "target")?.clone(),
        subject: parse_endpoint_selector(field(fields, "subject")?)?,
        target: parse_endpoint_selector(field(fields, "target")?)?,
        tolerance,
        angular_tolerance_degrees,
        angle_degrees: parse_optional("angleDegrees")?,
        axis,
        min: parse_optional("min")?,
        max: parse_optional("max")?,
        min_volume: parse_optional("minVolume")?,
        max_volume: parse_optional("maxVolume")?,
        resolved: None,
        resolved_bores: None,
    })
}

fn parse_endpoint_selector(value: &Json) -> Result<Selector, ProtocolError> {
    if let Json::Object(fields) = value {
        if matches!(optional_field(fields, "type"), Some(Json::String(kind)) if kind == "regexp") {
            return Ok(Selector::Occurrence {
                name: Some(TextPattern::parse(value, "relationship selector")?),
                path: None,
                expect: Cardinality::One,
            });
        }
    }
    Selector::parse(value)
}

fn vector(value: &Json, label: &str) -> Result<[f64; 3], ProtocolError> {
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

fn validate_pattern(
    pattern: Option<&TextPattern>,
    engine: &dyn EcmaRegexEngine,
) -> Result<(), EcmaRegexError> {
    pattern.map_or(Ok(()), |pattern| pattern.validate(engine))
}

fn validate_query_regexes(
    query: &Query,
    engine: &dyn EcmaRegexEngine,
) -> Result<(), EcmaRegexError> {
    if let Some(within) = &query.within {
        validate_selector_regexes(within, engine)?;
    }
    for child in query.all_of.iter().chain(&query.any_of) {
        validate_query_regexes(child, engine)?;
    }
    if let Some(child) = &query.not {
        validate_query_regexes(child, engine)?;
    }
    Ok(())
}

fn validate_selector_regexes(
    selector: &Selector,
    engine: &dyn EcmaRegexEngine,
) -> Result<(), EcmaRegexError> {
    match selector {
        Selector::Path(_) => Ok(()),
        Selector::Occurrence { name, path, .. } => {
            validate_pattern(name.as_ref(), engine)?;
            validate_pattern(path.as_ref(), engine)
        }
        Selector::Query { of, query, .. } => {
            validate_pattern(of.as_ref(), engine)?;
            validate_query_regexes(query, engine)
        }
        Selector::Named { of, .. } => validate_pattern(of.as_ref(), engine),
    }
}

#[derive(Clone)]
struct Endpoint {
    occurrence: Option<u32>,
    entity: BrepEntity,
    facts: EntityFacts,
    bore: BoreEvidence,
}

type BoreEvidence = Option<Result<BoreRegion, BackendError>>;

fn resolve_bore_evidence(
    selection: &Selection,
    brep: Option<&dyn BrepSubject>,
    required: bool,
    budget: &crate::budget::Budget,
) -> Vec<BoreEvidence> {
    selection
        .entities
        .iter()
        .map(|entity| {
            if !required || entity.facts.surface_type.as_deref() != Some("cylinder") {
                return None;
            }
            let Some(face) = entity.face else {
                return Some(Err(BackendError {
                    kind: BackendErrorKind::Unsupported,
                    message: "A bore relationship selected a cylinder without a BRep face.".into(),
                }));
            };
            let Some(brep) = brep else {
                return Some(Err(BackendError {
                    kind: BackendErrorKind::Unsupported,
                    message: "A bore relationship requires qualified trimmed-cylinder evidence."
                        .into(),
                }));
            };
            Some(
                budget
                    .charge(1)
                    .map_err(|error| BackendError {
                        kind: BackendErrorKind::BudgetExceeded {
                            limit: error.limit,
                            used: error.used,
                        },
                        message: "The trimmed-cylinder request exceeds the claim work-unit budget."
                            .into(),
                    })
                    .and_then(|()| brep.cylinder_axial_extent(face))
                    .and_then(qualified_bore_region),
            )
        })
        .collect()
}

fn qualified_bore_region(extent: CylinderAxialExtent) -> Result<BoreRegion, BackendError> {
    let axis_length = dot_length(extent.axis);
    if !extent.origin.into_iter().all(f64::is_finite)
        || !extent.axis.into_iter().all(f64::is_finite)
        || !extent.radius.is_finite()
        || extent.radius <= 0.0
        || !extent.from.is_finite()
        || !extent.to.is_finite()
        || extent.from >= extent.to
        || (axis_length - 1.0).abs() > 16.0 * f64::EPSILON
    {
        return Err(BackendError {
            kind: BackendErrorKind::ComputationFailed,
            message: "The BRep connector returned an invalid trimmed-cylinder extent.".into(),
        });
    }
    Ok(BoreRegion {
        origin: extent.origin,
        direction: extent.axis,
        radius: extent.radius,
        from: extent.from,
        to: extent.to,
    })
}

struct Proof {
    positive: bool,
    broad_phase: Json,
    final_evidence: Json,
    diagnostics: Vec<Diagnostic>,
}

fn clearance_byte_sum(values: impl IntoIterator<Item = u64>) -> u64 {
    values
        .into_iter()
        .try_fold(0u64, u64::checked_add)
        .unwrap_or(u64::MAX)
}

fn clearance_diagnostic_bytes(value: &Diagnostic) -> u64 {
    clearance_byte_sum([
        std::mem::size_of::<Diagnostic>() as u64,
        value.code.capacity() as u64,
        value.message.capacity() as u64,
        value
            .suggestion
            .as_ref()
            .map_or(0, |value| value.capacity() as u64),
        value.details.as_ref().map_or(0, super::json_owned_bytes),
        value.spatial.as_ref().map_or(0, super::json_owned_bytes),
    ])
}

// Reserve the caller's fixed wrappers and copied authored strings BEFORE
// queries/projection. Per relationship: 128 object/array slots cover final,
// broad phase, two selection projections, diagnostic and result envelopes;
// 2048 bytes cover their finite literal keys/messages. Dynamic authored values,
// entity strings and endpoint facts are added separately, with four live copies
// for row, diagnostic, normalized expectation and construction/finish overlap.
fn clearance_caller_reservation(prepared: &Prepared, context: &EvaluationContext<'_>) -> u64 {
    let slot = (std::mem::size_of::<(String, Json)>() + std::mem::size_of::<Json>()) as u64;
    let mut bytes = clearance_byte_sum([2048, 32 * slot, context.claim_id.len() as u64]);
    for relationship in &prepared.relationships {
        let mut row =
            clearance_byte_sum([128 * slot, 2048, super::json_owned_bytes(&relationship.raw)]);
        if let Some((subject, target)) = &relationship.resolved {
            for entity in subject.entities.iter().chain(&target.entities) {
                row = clearance_byte_sum([
                    row,
                    std::mem::size_of::<Endpoint>() as u64,
                    8 * slot,
                    entity.id.len() as u64,
                    entity
                        .occurrence_path
                        .as_ref()
                        .map_or(0, |value| value.len() as u64),
                    entity
                        .facts
                        .surface_type
                        .as_ref()
                        .map_or(0, |value| value.len() as u64),
                    entity
                        .facts
                        .product_name
                        .as_ref()
                        .map_or(0, |value| value.len() as u64),
                ]);
            }
        }
        // The fixed 128-slot/2048-literal allowance already covers all four
        // phases; multiply only the dynamic payload and endpoint storage.
        let dynamic = row.checked_sub(128 * slot + 2048).unwrap_or(u64::MAX);
        bytes = clearance_byte_sum([bytes, 128 * slot, 2048, dynamic, dynamic, dynamic, dynamic]);
    }
    bytes
}

fn clearance_live_rows(rows: &Vec<Json>, diagnostics: &Vec<Diagnostic>) -> u64 {
    clearance_byte_sum([
        (rows.capacity() * std::mem::size_of::<Json>()) as u64,
        (diagnostics.capacity() * std::mem::size_of::<Diagnostic>()) as u64,
        clearance_byte_sum(rows.iter().map(super::json_owned_bytes)),
        clearance_byte_sum(diagnostics.iter().map(clearance_diagnostic_bytes)),
    ])
}

fn clearance_quoted_bytes(value: &str) -> u64 {
    clearance_byte_sum(
        std::iter::once(2).chain(value.bytes().map(|byte| match byte {
            b'"' | b'\\' | b'\x08' | b'\x0c' | b'\n' | b'\r' | b'\t' => 2,
            0..=31 => 6,
            _ => 1,
        })),
    )
}

// No encoding/allocation is performed by this preflight. The first component
// bounds payload bytes (25 per finite binary64); the second covers every
// canonical object-sort pointer buffer, conservatively even across siblings.
fn clearance_encoding_bound(value: &Json) -> [u64; 2] {
    match value {
        Json::Null | Json::Bool(_) => [5, 0],
        Json::Number(_) => [25, 0],
        Json::String(value) => [clearance_quoted_bytes(value), 0],
        Json::Array(values) => values.iter().fold([2, 0], |[payload, scratch], value| {
            let [next, sort] = clearance_encoding_bound(value);
            [
                clearance_byte_sum([payload, 1, next]),
                clearance_byte_sum([scratch, sort]),
            ]
        }),
        Json::Object(fields) => fields
            .iter()
            .fold([2, 0], |[payload, scratch], (key, value)| {
                let [next, sort] = clearance_encoding_bound(value);
                [
                    clearance_byte_sum([payload, 2, clearance_quoted_bytes(key), next]),
                    clearance_byte_sum([
                        scratch,
                        std::mem::size_of::<&(String, Json)>() as u64,
                        sort,
                    ]),
                ]
            }),
    }
}

fn clearance_finish_reservation(
    prepared: &Prepared,
    context: &EvaluationContext<'_>,
    rows: &[Json],
    diagnostics: &[Diagnostic],
) -> u64 {
    // Outer result/family/polarity/negative-diagnostic literals are < 2048
    // encoded bytes. Each authored relationship occurs again in normalized
    // expected; measured values are copied once into the family measurement.
    let mut payload = clearance_byte_sum([2048, clearance_quoted_bytes(context.claim_id)]);
    let mut scratch = 0;
    let mut copies = 0;
    for value in prepared
        .relationships
        .iter()
        .map(|row| &row.raw)
        .chain(rows)
    {
        let [bytes, sort] = clearance_encoding_bound(value);
        payload = clearance_byte_sum([payload, bytes]);
        scratch = clearance_byte_sum([scratch, sort]);
    }
    for row in rows {
        if let Some(measured) =
            json_field_ref(row, "final").and_then(|value| json_field_ref(value, "measured"))
        {
            copies = clearance_byte_sum([copies, super::json_owned_bytes(measured)]);
            let [bytes, sort] = clearance_encoding_bound(measured);
            payload = clearance_byte_sum([payload, bytes]);
            scratch = clearance_byte_sum([scratch, sort]);
        }
    }
    for diagnostic in diagnostics {
        let owned = clearance_diagnostic_bytes(diagnostic);
        // finish may hold a selected diagnostic plus its to_json clone.
        copies = clearance_byte_sum([copies, owned, owned]);
        payload = clearance_byte_sum([
            payload,
            128,
            clearance_quoted_bytes(&diagnostic.code),
            clearance_quoted_bytes(&diagnostic.message),
            diagnostic
                .suggestion
                .as_deref()
                .map_or(0, clearance_quoted_bytes),
        ]);
        for value in diagnostic.details.iter().chain(&diagnostic.spatial) {
            let [bytes, sort] = clearance_encoding_bound(value);
            payload = clearance_byte_sum([payload, bytes]);
            scratch = clearance_byte_sum([scratch, sort]);
        }
    }
    // Vec's growing encoding capacity is at most twice this payload bound.
    clearance_byte_sum([copies, payload, payload, scratch])
}

pub(crate) fn evaluate(prepared: &Prepared, context: &mut EvaluationContext<'_>) -> Evaluation {
    if context.subject().brep.is_none() {
        return evaluate_mesh(prepared, context);
    }
    // F3: the BRep unit and the source; no report facet.
    if let Err(evaluation) = context.brep_gate() {
        return evaluation;
    }
    if context.subject().brep.is_none() {
        return missing_brep(
            "exact BRep evidence with an AP242 assembly structure",
            BREP_SUGGESTION,
        );
    }
    let mut selection_diagnostics = Vec::new();
    for (index, relationship) in prepared.relationships.iter().enumerate() {
        let Some((subject, target)) = &relationship.resolved else {
            return phase_two_refusal();
        };
        if subject.status != SelectionStatus::Resolved || target.status != SelectionStatus::Resolved
        {
            append_selection_diagnostics(
                &mut selection_diagnostics,
                index,
                relationship,
                subject,
                target,
            );
        }
    }
    if !selection_diagnostics.is_empty() {
        return Evaluation::Refused {
            diagnostics: selection_diagnostics,
        };
    }
    let analytic_claim = prepared
        .relationships
        .iter()
        .any(|r| is_nominal_analytic(r.kind) || r.kind == Kind::Interference);
    let analytic_caller = if analytic_claim {
        clearance_caller_reservation(prepared, context)
    } else {
        0
    };
    // Only selected-face routes use the 256 KiB cylindrical-band/finite-contact
    // capacity. Occurrence-to-occurrence contact, insertion and clearance use
    // the selected continuous-domain proofs and their continuous output bound.
    let band_claim = prepared.relationships.iter().any(|relationship| {
        let Some((subject, target)) = relationship.resolved.as_ref() else {
            return false;
        };
        let ([subject], [target]) = (subject.entities.as_slice(), target.entities.as_slice())
        else {
            return false;
        };
        matches!(
            (endpoint_entity(subject), endpoint_entity(target)),
            (Some(subject), Some(target)) if uses_band_route(relationship, subject, target)
        )
    });
    let caller_reservation = if band_claim {
        let bytes = clearance_caller_reservation(prepared, context);
        if let Err(error) = context.set_cylindrical_band_output_bytes(bytes) {
            return error;
        }
        bytes
    } else {
        0
    };
    let mut positive = true;
    let mut diagnostics = Vec::new();
    let mut rows = Vec::with_capacity(prepared.relationships.len());
    for (index, relationship) in prepared.relationships.iter().enumerate() {
        if analytic_claim {
            let box_pending = if relationship.kind == Kind::Interference {
                relationship
                    .resolved
                    .as_ref()
                    .and_then(|(a, b)| a.entities.len().checked_mul(b.entities.len()))
                    .and_then(|pairs| (pairs as u64).checked_add(1))
                    .and_then(|pairs| {
                        pairs.checked_mul(8 * continuous::BOX_INTERFERENCE_RESERVATION_BYTES as u64)
                    })
                    .unwrap_or(u64::MAX)
            } else {
                0
            };
            // Current arithmetic plus the proof, diagnostic projection (two
            // certificate copies), measured projection and encoding/copy growth.
            // Eight output slots bound these six live copies with Vec growth.
            // Prior rows and borrowed prepared/selection data are separate.
            if let Err(error) = context.check_continuous_output(clearance_byte_sum([
                analytic_caller,
                clearance_live_rows(&rows, &diagnostics),
                continuous::NOMINAL_ANALYTIC_RESERVATION_BYTES as u64,
                8 * continuous::NOMINAL_ANALYTIC_OUTPUT_BYTES as u64,
                box_pending,
            ])) {
                return error;
            }
        }
        if band_claim {
            if let Err(error) = context.set_cylindrical_band_output_bytes(clearance_byte_sum([
                caller_reservation,
                clearance_live_rows(&rows, &diagnostics),
            ])) {
                return error;
            }
        }
        let Some((subject_selection, target_selection)) = &relationship.resolved else {
            return phase_two_refusal();
        };
        let Some((subject_bores, target_bores)) = &relationship.resolved_bores else {
            return phase_two_refusal();
        };
        let subject = match endpoints(subject_selection, subject_bores, "subject") {
            Ok(value) => value,
            Err(evaluation) => return evaluation,
        };
        let target = match endpoints(target_selection, target_bores, "target") {
            Ok(value) => value,
            Err(evaluation) => return evaluation,
        };
        let proof = match prove(relationship, &subject, &target, context) {
            Ok(value) => value,
            Err(error) => {
                let mut evaluation = match error {
                    ProofError::Backend(error) => backend_refusal(error),
                    ProofError::Budget(value) | ProofError::Refused(value) => value,
                };
                if relationship.kind == Kind::Containment
                    || (band_claim && relationship.kind == Kind::Clearance)
                {
                    if let Evaluation::Refused { diagnostics } = &mut evaluation {
                        for diagnostic in diagnostics {
                            let details = diagnostic.details.get_or_insert_with(empty_object);
                            if let Json::Object(fields) = details {
                                fields.extend([
                                    (
                                        "relationship".into(),
                                        effective_relationship_copy(relationship),
                                    ),
                                    ("subject".into(), selection_json(subject_selection)),
                                    ("target".into(), selection_json(target_selection)),
                                ]);
                            }
                            diagnostic.suggestion.get_or_insert_with(|| {
                                if relationship.kind == Kind::Containment {
                                    "Use validated regular closed solids for set containment, or a qualified cylindrical bore for radial fit; inspect the reported source operands."
                                } else {
                                    "Inspect the selected source-face association and cylindrical-band profile; unsupported evidence is not a geometric mismatch."
                                }.into()
                            });
                        }
                    }
                }
                return evaluation;
            }
        };
        if band_claim {
            let proof_bytes = clearance_byte_sum([
                super::json_owned_bytes(&proof.broad_phase),
                super::json_owned_bytes(&proof.final_evidence),
                clearance_byte_sum(proof.diagnostics.iter().map(clearance_diagnostic_bytes)),
            ]);
            // Each projected diagnostic can clone both final evidence and its
            // witness array. Reserve those before constructing the projection.
            let projections = if is_compact_nominal_proof(&proof) {
                0 // Compact diagnostic refers to the single full result certificate.
            } else {
                proof_bytes
                    .checked_mul(proof.diagnostics.len() as u64)
                    .and_then(|bytes| bytes.checked_mul(2))
                    .unwrap_or(u64::MAX)
            };
            if let Err(error) = context.check_cylindrical_band_capacity(&[proof_bytes, projections])
            {
                return error;
            }
        }
        positive &= proof.positive;
        for diagnostic in &proof.diagnostics {
            diagnostics.push(project_relationship_diagnostic(
                index,
                relationship,
                subject_selection,
                target_selection,
                &proof,
                diagnostic,
            ));
        }
        rows.push(Json::object([
            ("relationship", effective_relationship_copy(relationship)),
            ("subject", selection_json(subject_selection)),
            ("target", selection_json(target_selection)),
            ("broadPhase", proof.broad_phase),
            ("final", proof.final_evidence),
        ]));
    }
    if band_claim {
        if let Err(error) = context
            .set_cylindrical_band_output_bytes(clearance_byte_sum([
                caller_reservation,
                clearance_live_rows(&rows, &diagnostics),
            ]))
            .and_then(|()| {
                context.check_cylindrical_band_capacity(&[clearance_finish_reservation(
                    prepared,
                    context,
                    &rows,
                    &diagnostics,
                )])
            })
        {
            return error;
        }
    }
    if analytic_claim {
        if let Err(error) = context.check_continuous_output(clearance_byte_sum([
            analytic_caller,
            clearance_live_rows(&rows, &diagnostics),
            clearance_finish_reservation(prepared, context, &rows, &diagnostics),
        ])) {
            return error;
        }
    }
    Evaluation::Geometric {
        positive_satisfied: positive,
        diagnostics,
        evidence: crate::result::family_evidence(
            &context.subject().content_hash,
            prepared.normalized_expected(),
            Json::Array(
                rows.iter()
                    .map(|row| {
                        let final_evidence =
                            json_field_ref(row, "final").expect("complete relationship proof");
                        json_field_ref(final_evidence, "measured")
                            .expect("complete relationship measurement")
                            .clone()
                    })
                    .collect(),
            ),
            Json::object([("relationships", Json::Array(rows))]),
        ),
        negated_diagnostic: None,
    }
}

fn evaluate_mesh(prepared: &Prepared, context: &mut EvaluationContext<'_>) -> Evaluation {
    use crate::analysis::continuous::exact;
    use num_traits::Zero;
    let owner = Rc::clone(&context.subjects[0]);
    let regions = match owner.material_regions(context.budget) {
        Ok(value) => value,
        Err(error) => return backend_refusal(error),
    };
    let mut rows = Vec::new();
    let mut diagnostics = Vec::new();
    let mut positive = true;
    let mut retained_output_bytes = 0u64;
    for (index, relationship) in prepared.relationships.iter().enumerate() {
        let Some((subject, target)) = &relationship.resolved else {
            return phase_two_refusal();
        };
        if subject.status != SelectionStatus::Resolved || target.status != SelectionStatus::Resolved
        {
            append_selection_diagnostics(&mut diagnostics, index, relationship, subject, target);
            return Evaluation::Refused { diagnostics };
        }
        if let Err(error) = context.check_continuous_output(
            retained_output_bytes.saturating_add(
                (subject.entities.len().saturating_add(target.entities.len()) as u64)
                    .saturating_mul(std::mem::size_of::<usize>() as u64),
            ),
        ) {
            return error;
        }
        let select = |selection: &Selection| -> Option<Vec<&crate::analysis::mesh::material::MaterialRegion>> {
            selection.entities.iter().map(|entity| {
                let key = entity.facts.material_region?;
                regions.iter().find(|region| (region.primitive, region.root) == key)
            }).collect()
        };
        let (Some(left), Some(right)) = (select(subject), select(target)) else {
            return relationship_unsupported("Selected mesh endpoints lack genuine material-region evidence.", "Select qualified mesh Bodies; analytic faces and occurrences require their original evidence.");
        };
        if !matches!(
            relationship.kind,
            Kind::Contact | Kind::Clearance | Kind::Containment | Kind::Interference
        ) {
            return relationship_unsupported(
                "This relationship requires analytic evidence absent from a mesh Body.",
                "Preserve the claim and provide the required analytic source evidence.",
            );
        }
        if matches!(relationship.kind, Kind::Contact | Kind::Clearance)
            && (left.len() != 1 || right.len() != 1)
        {
            return relationship_unsupported(
                "Mesh contact and clearance require one Body at each endpoint.",
                "Select one actual material root per endpoint.",
            );
        }
        let pair_count = left.len().saturating_mul(right.len()) as u64;
        retained_output_bytes = retained_output_bytes
            .saturating_add(pair_count.saturating_add(1).saturating_mul(64 * 1024))
            .saturating_add(super::json_owned_bytes(&relationship.raw).saturating_mul(3));
        let pending_bytes = retained_output_bytes.saturating_add(
            (left.capacity().saturating_add(right.capacity()) as u64)
                .saturating_mul(std::mem::size_of::<usize>() as u64),
        );
        if let Err(error) = context.check_continuous_output(pending_bytes) {
            return error;
        }
        let mut pairs = Vec::new();
        let mut relationship_positive = relationship.kind != Kind::Containment;
        for b in &right {
            let mut all_inside = true;
            for a in &left {
                if let Err(error) = charge(context, 8) {
                    return match error {
                        ProofError::Budget(value) | ProofError::Refused(value) => value,
                        ProofError::Backend(value) => backend_refusal(value),
                    };
                }
                let overlap = match owner.region_overlap(a, b, context.budget, pending_bytes) {
                    Ok(value) => value,
                    Err(error) => return backend_refusal(error),
                };
                let mut fields = vec![
                    (
                        "subject".into(),
                        Json::String(format!("body:mesh:{}:{}", a.primitive, a.root)),
                    ),
                    (
                        "target".into(),
                        Json::String(format!("body:mesh:{}:{}", b.primitive, b.root)),
                    ),
                    (
                        "intersectionNumerator".into(),
                        Json::String(overlap.numer().to_string()),
                    ),
                    (
                        "intersectionDenominator".into(),
                        Json::String(overlap.denom().to_string()),
                    ),
                ];
                let decision: Result<bool, BackendError> = (|| {
                    let arithmetic_error = |error: continuous::ContinuousError| BackendError {
                        kind: if error.kind == continuous::ContinuousErrorKind::InvalidInput {
                            BackendErrorKind::InvalidInput
                        } else {
                            BackendErrorKind::Unsupported
                        },
                        message: error.message,
                    };
                    let scalar = |value| exact::rational(value).map_err(arithmetic_error);
                    match relationship.kind {
                        Kind::Containment => {
                            let volume =
                                owner.region_overlap(a, a, context.budget, pending_bytes)?;
                            Ok(volume == overlap)
                        }
                        Kind::Interference => Ok(overlap
                            >= scalar(relationship.min_volume.unwrap_or(0.0))?
                            && overlap <= scalar(relationship.max_volume.unwrap_or(0.0))?),
                        Kind::Contact | Kind::Clearance => {
                            let (distance, witness) = owner.region_boundary_distance(
                                a,
                                b,
                                context.budget,
                                pending_bytes,
                            )?;
                            fields.push((
                                "distanceSquaredNumerator".into(),
                                Json::String(distance.numer().to_string()),
                            ));
                            fields.push((
                                "distanceSquaredDenominator".into(),
                                Json::String(distance.denom().to_string()),
                            ));
                            if let Some(point) = witness {
                                fields.push(("boundaryWitness".into(), point_json(point)));
                            }
                            let tolerance = scalar(relationship.tolerance.unwrap_or(
                                if relationship.kind == Kind::Contact {
                                    DEFAULT_LINEAR_TOLERANCE
                                } else {
                                    0.0
                                },
                            ))?;
                            let lower = if relationship.kind == Kind::Contact {
                                num_rational::BigRational::zero()
                            } else {
                                exact::subtract(
                                    &scalar(relationship.min.unwrap_or(0.0))?,
                                    &tolerance,
                                )
                                .map_err(arithmetic_error)?
                                .max(num_rational::BigRational::zero())
                            };
                            let lower_squared =
                                exact::multiply(&lower, &lower).map_err(arithmetic_error)?;
                            let upper = if relationship.kind == Kind::Contact {
                                Some(tolerance)
                            } else {
                                relationship
                                    .max
                                    .map(|maximum| {
                                        exact::add(&scalar(maximum)?, &tolerance)
                                            .map_err(arithmetic_error)
                                    })
                                    .transpose()?
                            };
                            let upper_ok = match upper {
                                Some(value) => {
                                    distance
                                        <= exact::multiply(&value, &value)
                                            .map_err(arithmetic_error)?
                                }
                                None => true,
                            };
                            Ok(overlap.is_zero() && distance >= lower_squared && upper_ok)
                        }
                        _ => unreachable!("supported mesh kinds checked"),
                    }
                })();
                let accepted = match decision {
                    Ok(value) => value,
                    Err(error) => return backend_refusal(error),
                };
                all_inside &= accepted;
                if relationship.kind != Kind::Containment {
                    relationship_positive &= accepted;
                }
                fields.push(("satisfied".into(), Json::Bool(accepted)));
                pairs.push(Json::Object(fields));
            }
            if relationship.kind == Kind::Containment {
                relationship_positive |= all_inside;
            }
        }
        positive &= relationship_positive;
        if !relationship_positive {
            diagnostics.push(mismatch(format!("{} violates qualified mesh material facts.",relationship_label(index,relationship)),"Repair the source geometry while preserving the authored parameters and tolerance.",None));
        }
        rows.push(Json::object([
            ("relationship", relationship.raw.clone()),
            ("pairs", Json::Array(pairs)),
        ]));
    }
    Evaluation::Geometric {
        positive_satisfied: positive,
        diagnostics,
        evidence: crate::result::family_evidence(
            &owner.content_hash,
            prepared.normalized_expected(),
            Json::Array(rows),
            Json::object([
                (
                    "representation",
                    Json::string("qualified-retained-mesh-material-regions"),
                ),
                ("sourceUncertainty", Json::string("unknown")),
            ]),
        ),
        negated_diagnostic: None,
    }
}

fn project_relationship_diagnostic(
    index: usize,
    relationship: &Relationship,
    subject: &Selection,
    target: &Selection,
    proof: &Proof,
    source: &Diagnostic,
) -> Diagnostic {
    let mut diagnostic = source.clone();
    diagnostic.message = format!(
        "{}: {}",
        relationship_label(index, relationship),
        source.message
    );
    if is_compact_nominal_proof(proof) {
        // The complete C1/C2/C3 or box insertion certificate occurs once in the relationship
        // result. Duplicating it in both diagnostic.final and witnesses would
        // defeat the bounded projection. Keep identities and measurements here
        // with an unambiguous index into that unchanged full evidence row.
        diagnostic.details = Some(Json::object([
            ("relationship", effective_relationship_copy(relationship)),
            ("subject", selection_json(subject)),
            ("target", selection_json(target)),
            (
                "measured",
                json_field(&proof.final_evidence, "measured").unwrap_or_else(empty_object),
            ),
            (
                "expected",
                json_field(&proof.final_evidence, "expected").unwrap_or_else(empty_object),
            ),
            (
                "evidence",
                Json::object([
                    (
                        "profile",
                        if matches!(json_field_ref(&proof.final_evidence,"method"), Some(Json::String(method)) if method=="exact-nominal-cylindrical-band-clearance")
                        {
                            Json::string("geospec-nominal-cylindrical-band-clearance-v1")
                        } else {
                            json_field(&proof.final_evidence, "method").unwrap_or(Json::Null)
                        },
                    ),
                    ("relationshipIndex", Json::Number(index as f64)),
                    (
                        "path",
                        Json::string("evidence.witnesses.relationships[relationshipIndex].final"),
                    ),
                ]),
            ),
        ]));
        return diagnostic;
    }
    diagnostic.details = Some(Json::object([
        ("relationship", effective_relationship_copy(relationship)),
        ("subject", selection_json(subject)),
        ("target", selection_json(target)),
        (
            "evidence",
            Json::object([
                ("broadPhase", proof.broad_phase.clone()),
                ("final", proof.final_evidence.clone()),
            ]),
        ),
        (
            "measured",
            json_field(&proof.final_evidence, "measured").unwrap_or_else(empty_object),
        ),
        (
            "expected",
            json_field(&proof.final_evidence, "expected").unwrap_or_else(empty_object),
        ),
        (
            "witnesses",
            json_field(&proof.final_evidence, "witnesses")
                .unwrap_or_else(|| Json::Array(Vec::new())),
        ),
    ]));
    diagnostic
}

fn is_compact_nominal_proof(proof: &Proof) -> bool {
    matches!(json_field_ref(&proof.final_evidence, "method"),
        Some(Json::String(method)) if matches!(method.as_str(), "exact-nominal-cylindrical-band-clearance" | "exact-nominal-finite-contact" | "exact-local-band-engagement" | "continuous-centerline"))
        && !is_box_contact_proof(proof)
}
/// Box-to-box contact carries one bounded box-clearance witness, so its
/// diagnostic keeps the full measured/witness/spatial shape like box clearance.
fn is_box_contact_proof(proof: &Proof) -> bool {
    let Some(Json::Array(witnesses)) = json_field_ref(&proof.final_evidence, "witnesses") else {
        return false;
    };
    matches!(witnesses.as_slice(), [witness]
        if matches!(json_field_ref(witness, "kind"), Some(Json::String(kind)) if kind == "nominal-box-clearance"))
}

fn endpoint_entity(entity: &Entity) -> Option<BrepEntity> {
    entity
        .face
        .or_else(|| entity.occurrence.map(BrepEntity::Occurrence))
}

/// Whether a single-pair contact/clearance/insertion row dispatches to a
/// selected-face proof that uses the 256 KiB cylindrical-band capacity. The
/// claim budget and the proof dispatch both use this, so they cannot drift.
fn uses_band_route(relationship: &Relationship, subject: BrepEntity, target: BrepEntity) -> bool {
    let face = |entity| matches!(entity, BrepEntity::Face { .. });
    match relationship.kind {
        Kind::Contact => !matches!(
            (subject, target),
            (BrepEntity::Occurrence(_), BrepEntity::Occurrence(_))
        ),
        Kind::Clearance => face(subject) || face(target),
        Kind::Insertion => relationship.axis.is_some() && face(subject) && face(target),
        _ => false,
    }
}

fn endpoints(
    selection: &Selection,
    bores: &[BoreEvidence],
    role: &str,
) -> Result<Vec<Endpoint>, Evaluation> {
    if selection.entities.len() != bores.len() {
        return Err(phase_two_refusal());
    }
    let mut endpoints = Vec::with_capacity(selection.entities.len());
    for (entity, bore) in selection.entities.iter().zip(bores) {
        let Some(brep_entity) = endpoint_entity(entity) else {
            return Err(relationship_unsupported(
                &format!("The relationship {role} resolved to '{}', which carries no occurrence this subject's STEP-XDE structure knows.", entity.id),
                "Re-export the artifact so selector facts and exact BRep operands come from the same STEP graph.",
            ));
        };
        endpoints.push(Endpoint {
            occurrence: entity.occurrence,
            entity: brep_entity,
            facts: entity.facts.clone(),
            bore: bore.clone(),
        });
    }
    if endpoints.is_empty() {
        return Err(relationship_unsupported(
            &format!("The relationship {role} resolved to no entities."),
            "Widen the selector or lower its cardinality expectation.",
        ));
    }
    Ok(endpoints)
}

enum ProofError {
    Backend(BackendError),
    Budget(Evaluation),
    Refused(Evaluation),
}

impl From<BackendError> for ProofError {
    fn from(value: BackendError) -> Self {
        Self::Backend(value)
    }
}

fn prove(
    relationship: &Relationship,
    subject: &[Endpoint],
    target: &[Endpoint],
    context: &mut EvaluationContext<'_>,
) -> Result<Proof, ProofError> {
    if is_nominal_analytic(relationship.kind) {
        charge(context, continuous::NOMINAL_ANALYTIC_UNITS)?;
        context
            .check_continuous_output(continuous::NOMINAL_ANALYTIC_RESERVATION_BYTES as u64)
            .map_err(ProofError::Refused)?;
    }
    match relationship.kind {
        Kind::Contact => prove_contact(relationship, subject, target, context),
        Kind::Clearance => prove_clearance(relationship, subject, target, context),
        Kind::Coaxial | Kind::Concentric => prove_coaxial(relationship, subject, target),
        Kind::Coplanar => prove_coplanar(relationship, subject, target),
        Kind::Parallel | Kind::Perpendicular | Kind::Angle => {
            prove_direction_angle(relationship, subject, target)
        }
        Kind::Containment => prove_containment(relationship, subject, target, context),
        Kind::Insertion => prove_continuous_insertion(relationship, subject, target, context),
        Kind::Interference => prove_interference(relationship, subject, target, context),
    }
}

fn is_nominal_analytic(kind: Kind) -> bool {
    matches!(
        kind,
        Kind::Coaxial
            | Kind::Concentric
            | Kind::Coplanar
            | Kind::Parallel
            | Kind::Perpendicular
            | Kind::Angle
    )
}

fn finite_face_identity(f: &crate::backend::brep::FiniteContactFace) -> Json {
    Json::object([
        ("origin", point_json(f.origin)),
        ("normal", point_json(f.normal)),
        ("wireCount", Json::Number(f.wire_count as f64)),
        ("edgeUseCount", Json::Number(f.edge_use_count as f64)),
        ("attachmentResidual", Json::Number(f.attachment_residual)),
        ("attachmentLimit", Json::Number(f.tolerance)),
        ("occurrence", Json::Number(f.occurrence as f64)),
        (
            "publicFaceOrdinal",
            Json::Number(f.public_face_ordinal as f64),
        ),
        (
            "privateQueryFace",
            Json::Number(f.private_query_face as f64),
        ),
        ("sourceFace", Json::Number(f.source_face_entity as f64)),
        (
            "sourceRoute",
            Json::Array(
                f.source_route[..f.source_route_count as usize]
                    .iter()
                    .map(|n| Json::Number(*n as f64))
                    .collect(),
            ),
        ),
        ("sourceSameSense", Json::Bool(f.source_same_sense == 1)),
        (
            "transferredReversed",
            Json::Bool(f.transferred_reversed == 1),
        ),
    ])
}
fn finite_contact_failure(reason: &str) -> ProofError {
    ProofError::Refused(relationship_unsupported(reason,
        "Use qualified finite nominal planes/circular boundaries or complete boxes; missing evidence cannot be inverted."))
}
fn contact_proof(
    positive: bool,
    measured: Json,
    witness: Json,
    center: Option<[f64; 3]>,
    relationship: &Relationship,
    subject: &[Endpoint],
    target: &[Endpoint],
) -> Proof {
    Proof {
        positive,
        broad_phase: broad_phase(
            subject,
            target,
            relationship.tolerance.unwrap_or(DEFAULT_LINEAR_TOLERANCE),
        ),
        final_evidence: final_json(
            "exact-nominal-finite-contact",
            measured,
            optional_numbers(&[
                ("tolerance", relationship.tolerance),
                (
                    "angularToleranceDegrees",
                    relationship.angular_tolerance_degrees,
                ),
            ]),
            vec![witness],
        ),
        diagnostics: if positive {
            vec![]
        } else {
            vec![mismatch(
            format!("Finite contact between '{}' and '{}' violates the exact seating or separation bound.",
                selector_label(&relationship.subject_raw),selector_label(&relationship.target_raw)),
            "Align opposing face normals and close the certified finite gap.",center)]
        },
    }
}
fn prove_contact(
    relationship: &Relationship,
    subject: &[Endpoint],
    target: &[Endpoint],
    context: &mut EvaluationContext<'_>,
) -> Result<Proof, ProofError> {
    let ([a], [b]) = (subject, target) else {
        return Err(finite_contact_failure(
            "Finite contact requires one resolved operand per endpoint.",
        ));
    };
    let tolerance = relationship.tolerance.unwrap_or(DEFAULT_LINEAR_TOLERANCE);
    charge(context, continuous::FINITE_CONTACT_UNITS)?;
    if !uses_band_route(relationship, a.entity, b.entity) {
        // Box-to-box contact is the continuous clearance proof; it never holds
        // finite-contact records, so it is bounded like nominal box clearance.
        let (BrepEntity::Occurrence(ai), BrepEntity::Occurrence(bi)) = (a.entity, b.entity) else {
            return Err(finite_contact_failure(
                "Box contact requires two complete occurrences.",
            ));
        };
        let da = context
            .selected_continuous_domain(ai)
            .map_err(ProofError::Refused)?;
        let db = context
            .selected_continuous_domain(bi)
            .map_err(ProofError::Refused)?;
        return match continuous::clearance(continuous::ClearanceRequest {
            subject: &da,
            target: &db,
            minimum: None,
            maximum: Some(tolerance),
            tolerance: 0.,
        }) {
            Outcome::Decided { positive, evidence } => {
                context
                    .check_continuous_output(evidence.owned_bytes() as u64)
                    .map_err(ProofError::Refused)?;
                Ok(contact_proof(
                    positive,
                    Json::object([("distance", Json::Number(evidence.distance))]),
                    Json::object([
                        ("kind", Json::string("nominal-box-clearance")),
                        ("value", evidence.to_json()),
                    ]),
                    Some(evidence.diagnostic_point),
                    relationship,
                    subject,
                    target,
                ))
            }
            Outcome::Unsupported { reason, .. } => Err(finite_contact_failure(&reason.message)),
        };
    }
    context
        .check_cylindrical_band_capacity(&[
            continuous::FINITE_CONTACT_RESERVATION_BYTES as u64,
            2 * continuous::FINITE_CONTACT_OUTPUT_BYTES as u64,
        ])
        .map_err(ProofError::Refused)?;
    let ao = a
        .facts
        .face_index
        .ok_or_else(|| finite_contact_failure("Contact source has no public face identity."))?;
    let af = context
        .finite_contact_face(a.entity, ao)
        .map_err(ProofError::Refused)?;
    // A target occurrence may contribute a real boundary face, never an
    // unrelated infinite support. Keep enumeration tied to its retained source
    // inventory, precharge all rows before testing, and bound it to 64 faces.
    let bundle = context.subject().report_faces(false)?.ok_or_else(|| {
        finite_contact_failure("Contact needs the actual located-face inventory.")
    })?;
    let mut targets = Vec::new();
    if let BrepEntity::Occurrence(occurrence) = b.entity {
        if af.kind != 1 {
            return Err(finite_contact_failure(
                "Only attached conical rims admit a face-to-occurrence contact witness.",
            ));
        }
        let faces = bundle
            .occurrence_faces
            .get(occurrence as usize)
            .ok_or_else(|| {
                finite_contact_failure("Target occurrence face inventory is missing.")
            })?;
        if faces.len() > 64 {
            return Err(finite_contact_failure(
                "Finite contact target inventory exceeds 64 faces.",
            ));
        }
        charge(context, faces.len() as u64)?;
        targets
            .try_reserve_exact(faces.len())
            .map_err(|_| finite_contact_failure("Contact target reservation failed."))?;
        for f in faces.iter() {
            if matches!(
                f.facts.surface,
                crate::backend::brep::SurfaceFacts::Cone { .. }
            ) {
                targets.push((f.entity, f.facts.index));
            }
        }
    } else {
        targets.push((
            b.entity,
            b.facts.face_index.ok_or_else(|| {
                finite_contact_failure("Contact target has no public face identity.")
            })?,
        ));
    }
    for (entity, ordinal) in targets {
        let bf = context
            .finite_contact_face(entity, ordinal)
            .map_err(ProofError::Refused)?;
        context
            .check_cylindrical_band_capacity(&[
                continuous::FINITE_CONTACT_RESERVATION_BYTES as u64,
                2 * continuous::FINITE_CONTACT_OUTPUT_BYTES as u64,
            ])
            .map_err(ProofError::Refused)?;
        match continuous::finite_contact(continuous::FiniteContactRequest {
            subject: &af,
            target: &bf,
            tolerance,
            angular_tolerance_degrees: relationship
                .angular_tolerance_degrees
                .unwrap_or(DEFAULT_ANGULAR_TOLERANCE_DEGREES),
        }) {
            Outcome::Decided { positive, evidence } => {
                let certificate = Json::object([
                    ("subjectSource", finite_face_identity(&af)),
                    ("targetSource", finite_face_identity(&bf)),
                    ("decision", evidence.to_json()),
                ]);
                return Ok(contact_proof(
                    positive,
                    empty_object(),
                    certificate,
                    None,
                    relationship,
                    subject,
                    target,
                ));
            }
            Outcome::Unsupported { reason, .. } => {
                if !matches!(b.entity, BrepEntity::Occurrence(_)) {
                    return Err(finite_contact_failure(&reason.message));
                }
            }
        }
    }
    Err(finite_contact_failure(
        "No attached circular witness was established on the selected target occurrence.",
    ))
}

/// Preserve the selector's public ordinal and its separately resolved private
/// query address. Neither ordinal arithmetic nor a whole-shape fallback can
/// recover an absent association.
fn cylindrical_band_face(endpoint: &Endpoint) -> Result<(BrepEntity, u32), ProofError> {
    let BrepEntity::Face { occurrence, face } = endpoint.entity else {
        return Err(ProofError::Refused(relationship_unsupported(
            "Nominal cylindrical-band clearance requires a selected occurrence face.",
            "Select the authored cylindrical face on each endpoint; whole-shape and nearest-face fallbacks are not qualified.",
        )));
    };
    let Some(public_face_ordinal) = endpoint.facts.face_index else {
        return Err(ProofError::Refused(relationship_unsupported(
            "The selected cylindrical face has no public face ordinal.",
            "Preserve the selector's public/private face association from the same STEP subject.",
        )));
    };
    if endpoint.occurrence != Some(occurrence) || face == 0 {
        return Err(ProofError::Refused(relationship_unsupported(
            "The selected cylindrical face has an inconsistent occurrence query address.",
            "Preserve the selector's public/private face association from the same STEP subject.",
        )));
    }
    Ok((endpoint.entity, public_face_ordinal))
}

fn selected_cylindrical_band_pair(
    subject: &Endpoint,
    target: &Endpoint,
    context: &mut EvaluationContext<'_>,
) -> Result<(Rc<NominalCylindricalBand>, Rc<NominalCylindricalBand>), ProofError> {
    // Validate both selector addresses before the first private query. Each
    // distinct demand then pays before querying; a repeated face shares only
    // this claim's already-paid record, including when it fills both roles.
    let (subject_face, subject_ordinal) = cylindrical_band_face(subject)?;
    let (target_face, target_ordinal) = cylindrical_band_face(target)?;
    let subject = context
        .nominal_cylindrical_band(subject_face, subject_ordinal)
        .map_err(ProofError::Refused)?;
    let target = context
        .nominal_cylindrical_band(target_face, target_ordinal)
        .map_err(ProofError::Refused)?;
    charge(context, continuous::CLEARANCE_PAIR_UNITS)?;
    Ok((subject, target))
}

fn prove_clearance(
    relationship: &Relationship,
    subject: &[Endpoint],
    target: &[Endpoint],
    context: &mut EvaluationContext<'_>,
) -> Result<Proof, ProofError> {
    let ([subject_endpoint], [target_endpoint]) = (subject, target) else {
        return Err(ProofError::Refused(nominal_box_clearance_refusal()));
    };
    if uses_band_route(
        relationship,
        subject_endpoint.entity,
        target_endpoint.entity,
    ) {
        return prove_cylindrical_band_clearance(relationship, subject, target, context);
    }
    let (BrepEntity::Occurrence(subject_id), BrepEntity::Occurrence(target_id)) =
        (subject_endpoint.entity, target_endpoint.entity)
    else {
        return Err(ProofError::Refused(nominal_box_clearance_refusal()));
    };
    let subject_domain = context
        .selected_continuous_domain(subject_id)
        .map_err(ProofError::Refused)?;
    let target_domain = context
        .selected_continuous_domain(target_id)
        .map_err(ProofError::Refused)?;
    charge(context, continuous::CLEARANCE_PAIR_UNITS)?;
    let band = relationship.tolerance.unwrap_or(0.0);
    let (positive, evidence) = match continuous::clearance(continuous::ClearanceRequest {
        subject: &subject_domain,
        target: &target_domain,
        minimum: relationship.min,
        maximum: relationship.max,
        tolerance: band,
    }) {
        Outcome::Decided { positive, evidence } => (positive, evidence),
        Outcome::Unsupported { reason, .. } => {
            return Err(ProofError::Refused(relationship_unsupported(
                &reason.message,
                "Use two qualified complete nominal box occurrences; general BRep clearance remains unqualified.",
            )))
        }
    };
    let typed_bytes = evidence.owned_bytes() as u64;
    context
        .check_continuous_output(typed_bytes)
        .map_err(ProofError::Refused)?;
    let expected = optional_numbers(&[
        ("min", relationship.min),
        ("max", relationship.max),
        ("tolerance", relationship.tolerance),
    ]);
    let final_evidence = final_json(
        "exact-nominal-box-clearance",
        Json::object([("distance", Json::Number(evidence.distance))]),
        expected.clone(),
        vec![Json::object([
            ("kind", Json::string("nominal-box-clearance")),
            ("value", evidence.to_json()),
        ])],
    );
    context
        .check_continuous_output(
            typed_bytes.saturating_add(super::json_owned_bytes(&final_evidence)),
        )
        .map_err(ProofError::Refused)?;
    let diagnostics = (!positive)
        .then(|| {
            let direction = if evidence.below_minimum {
                "too tight"
            } else {
                "too loose"
            };
            mismatch(
                format!(
                    "Clearance between '{}' and '{}' is {direction} for the declared band {}.",
                    selector_label(&relationship.subject_raw),
                    selector_label(&relationship.target_raw),
                    json_string(&expected)
                ),
                if evidence.below_minimum {
                    "Open the fit, or lower the declared minimum if the tighter clearance is intended."
                } else {
                    "Close the fit, or raise the declared maximum if the looser clearance is intended."
                },
                Some(evidence.diagnostic_point),
            )
        })
        .into_iter()
        .collect();
    let margin = relationship
        .max
        .map(|maximum| maximum + band)
        .filter(|value| value.is_finite())
        .unwrap_or(DEFAULT_LINEAR_TOLERANCE);
    Ok(Proof {
        positive,
        broad_phase: broad_phase(subject, target, margin),
        final_evidence,
        diagnostics,
    })
}

fn nominal_box_clearance_refusal() -> Evaluation {
    relationship_unsupported(
        "Clearance requires one qualified nominal box occurrence or selected cylindrical band on each endpoint.",
        "Select two complete nominal boxes or two qualified occurrence-local cylindrical faces; mixed-domain, edge and multi-endpoint clearance remains unqualified.",
    )
}

fn prove_cylindrical_band_clearance(
    relationship: &Relationship,
    subject: &[Endpoint],
    target: &[Endpoint],
    context: &mut EvaluationContext<'_>,
) -> Result<Proof, ProofError> {
    let ([a], [b]) = (subject, target) else {
        return Err(ProofError::Refused(nominal_box_clearance_refusal()));
    };
    let (a, b) = selected_cylindrical_band_pair(a, b, context)?;
    context
        .check_cylindrical_band_capacity(&[
            continuous::CYLINDRICAL_BAND_PREDICATE_RESERVATION_BYTES as u64,
        ])
        .map_err(ProofError::Refused)?;
    let band = relationship.tolerance.unwrap_or(0.0);
    let (positive, evidence) = match continuous::cylindrical_band_clearance(
        continuous::CylindricalBandClearanceRequest {
            subject: &a,
            target: &b,
            minimum: relationship.min,
            maximum: relationship.max,
            tolerance: band,
        },
    ) {
        Outcome::Decided { positive, evidence } => (positive, evidence),
        Outcome::Unsupported { reason, .. } => {
            return Err(ProofError::Refused(relationship_unsupported(
                &reason.message,
                "Use C1-qualified selected cylindrical bands within the exact predicate's declared frame and resource domain; no alternate-face or extrema fallback is used.",
            )))
        }
    };
    let typed_bytes = evidence.owned_bytes() as u64;
    if typed_bytes > continuous::CYLINDRICAL_BAND_EVIDENCE_RESERVATION_BYTES as u64
        || !evidence.distance.is_finite()
        || !evidence.diagnostic_point.into_iter().all(f64::is_finite)
    {
        return Err(ProofError::Refused(relationship_unsupported(
            "The cylindrical-band predicate returned evidence outside its frozen output contract.",
            "Inspect the predicate output contract; invalid evidence is not an invertible geometric result.",
        )));
    }
    // Invocation scratch has ended. The returned value replaces that charge;
    // its to_json clone reserves separately. Encoding starts only after the
    // typed value is dropped, and receives its own reservation below.
    context
        .check_cylindrical_band_capacity(&[
            typed_bytes,
            continuous::CYLINDRICAL_BAND_EVIDENCE_RESERVATION_BYTES as u64,
        ])
        .map_err(ProofError::Refused)?;
    let distance = evidence.distance;
    let below_minimum = evidence.below_minimum;
    let diagnostic_point = evidence.diagnostic_point;
    let raw_evidence = evidence.to_json();
    drop(evidence);
    let expected = optional_numbers(&[
        ("min", relationship.min),
        ("max", relationship.max),
        ("tolerance", relationship.tolerance),
    ]);
    let final_evidence = final_json(
        "exact-nominal-cylindrical-band-clearance",
        Json::object([("distance", Json::Number(distance))]),
        expected,
        vec![Json::object([
            ("kind", Json::string("nominal-cylindrical-band-clearance")),
            ("value", raw_evidence),
        ])],
    );
    context
        .check_cylindrical_band_capacity(&[
            super::json_owned_bytes(&final_evidence),
            continuous::CYLINDRICAL_BAND_ENCODING_RESERVATION_BYTES as u64,
        ])
        .map_err(ProofError::Refused)?;
    let diagnostics = (!positive).then(|| {
        let mut diagnostic = mismatch(
            if below_minimum {
                "Selected cylindrical-band clearance is below the declared inclusive band."
            } else {
                "Selected cylindrical-band clearance is above the declared inclusive band."
            }.into(),
            "Inspect the measured clearance and declared limits; the displayed source origin is diagnostic only, not a closest or intersection point.",
            Some(diagnostic_point),
        );
        if let Some(Json::Object(fields)) = &mut diagnostic.spatial {
            fields.push(("role".into(), Json::string("diagnostic-source-origin")));
        }
        diagnostic
    }).into_iter().collect();
    let margin = relationship
        .max
        .map(|value| value + band)
        .filter(|value| value.is_finite())
        .unwrap_or(DEFAULT_LINEAR_TOLERANCE);
    Ok(Proof {
        positive,
        broad_phase: broad_phase(subject, target, margin),
        final_evidence,
        diagnostics,
    })
}

fn prove_coaxial(
    relationship: &Relationship,
    subject: &[Endpoint],
    target: &[Endpoint],
) -> Result<Proof, ProofError> {
    prove_nominal_analytic(
        relationship,
        subject,
        target,
        continuous::AnalyticKind::Axis,
    )
}

fn prove_coplanar(
    relationship: &Relationship,
    subject: &[Endpoint],
    target: &[Endpoint],
) -> Result<Proof, ProofError> {
    prove_nominal_analytic(
        relationship,
        subject,
        target,
        continuous::AnalyticKind::Plane,
    )
}

fn prove_direction_angle(
    relationship: &Relationship,
    subject: &[Endpoint],
    target: &[Endpoint],
) -> Result<Proof, ProofError> {
    prove_nominal_analytic(
        relationship,
        subject,
        target,
        continuous::AnalyticKind::Direction,
    )
}

fn admitted_analytic_support(
    endpoint: &Endpoint,
) -> Result<continuous::NominalSupport, ProofError> {
    let support = endpoint.facts.nominal_support.ok_or_else(|| ProofError::Refused(relationship_unsupported(
        "The analytic endpoint has no associated placed raw support.",
        "Select an analytic face or its derived axis/plane from the same AP242 face inventory; labels and datum reporting facts are not support certificates.",
    )))?;
    let associated = support.entity == endpoint.entity
        && endpoint.facts.face_index == Some(support.public_ordinal)
        && match endpoint.entity {
            BrepEntity::Face { occurrence, .. } => endpoint.occurrence == Some(occurrence),
            BrepEntity::WholeFace(_) => endpoint.occurrence.is_none(),
            _ => false,
        };
    if !associated {
        return Err(ProofError::Refused(relationship_unsupported(
            "The raw analytic support has a mismatched occurrence or public/private face association.",
            "Preserve the selected face's public ordinal and private query address from the placed AP242 inventory.",
        )));
    }
    Ok(support)
}

fn nominal_support_json(s: continuous::NominalSupport) -> Json {
    let (occurrence, private) = match s.entity {
        BrepEntity::Face { occurrence, face } => (Json::Number(occurrence.into()), face),
        BrepEntity::WholeFace(face) => (Json::Null, face),
        _ => unreachable!("admitted support face"),
    };
    Json::object([
        (
            "kind",
            Json::string(match s.kind {
                continuous::SupportKind::Axis => "axis",
                continuous::SupportKind::Plane => "plane",
            }),
        ),
        ("occurrence", occurrence),
        ("publicFaceOrdinal", Json::Number(s.public_ordinal.into())),
        ("privateQueryFace", Json::Number(private.into())),
        ("origin", point_json(s.origin)),
        ("rawDirection", point_json(s.direction)),
    ])
}

fn prove_nominal_analytic(
    relationship: &Relationship,
    subject: &[Endpoint],
    target: &[Endpoint],
    kind: continuous::AnalyticKind,
) -> Result<Proof, ProofError> {
    let ([a], [b]) = (subject, target) else {
        return Err(ProofError::Refused(relationship_unsupported(
            "An analytic support relationship requires exactly one support per endpoint.",
            "Disambiguate each selector; no first-match support is silently selected.",
        )));
    };
    let a = admitted_analytic_support(a)?;
    let b = admitted_analytic_support(b)?;
    let tolerance = relationship.tolerance.unwrap_or(DEFAULT_LINEAR_TOLERANCE);
    let angular = relationship
        .angular_tolerance_degrees
        .unwrap_or(DEFAULT_ANGULAR_TOLERANCE_DEGREES);
    let expected_angle = if relationship.kind == Kind::Perpendicular {
        90.0
    } else if matches!(kind, continuous::AnalyticKind::Direction) {
        relationship.angle_degrees.unwrap_or(0.0)
    } else {
        0.0
    };
    let (positive, evidence) = match continuous::nominal_analytic(
        continuous::NominalAnalyticRequest {
            kind,
            subject: a,
            target: b,
            tolerance,
            angle_degrees: expected_angle,
            angular_tolerance_degrees: angular,
        },
    ) {
        Outcome::Decided { positive, evidence } => (positive, evidence),
        Outcome::Unsupported { reason, .. } => {
            let mut refusal = relationship_unsupported(&reason.message,
                "Inspect the raw AP242 support, exact arithmetic domain and authored limits; unresolved evidence cannot be inverted.");
            if reason.kind == continuous::ContinuousErrorKind::InvalidInput {
                if let Evaluation::Refused { diagnostics } = &mut refusal {
                    for diagnostic in diagnostics {
                        diagnostic.code = "GEOSPEC_INVALID_EVIDENCE".into();
                    }
                }
            }
            return Err(ProofError::Refused(refusal));
        }
    };
    // Legacy floating expressions remain diagnostic only. The exact predicate
    // above already decided; neither acos nor these display values select truth.
    let angle = folded_angle(a.direction, b.direction);
    let display = |value: f64| {
        if value.is_finite() {
            Json::Number(value)
        } else {
            Json::Null
        }
    };
    let mut measured = vec![("angle".into(), display(angle))];
    match kind {
        continuous::AnalyticKind::Axis => {
            let offset = subtract(b.origin, a.origin);
            let along = dot(offset, a.direction) / dot(a.direction, a.direction);
            measured.push((
                "radialOffset".into(),
                display(length(subtract(offset, scale(a.direction, along)))),
            ));
        }
        continuous::AnalyticKind::Plane => {
            measured.push((
                "offsetDelta".into(),
                evidence
                    .distance_squared
                    .as_ref()
                    .map_or(Json::Null, |d| display(d.display.sqrt())),
            ));
        }
        continuous::AnalyticKind::Direction => {
            measured.push(("deviation".into(), display((angle - expected_angle).abs())))
        }
    }
    measured.push(("displayRole".into(), Json::string("diagnostic-only")));
    let final_evidence = final_json(
        "exact-nominal-analytic-support",
        Json::Object(measured),
        Json::object([
            ("tolerance", Json::Number(tolerance)),
            ("angleDegrees", Json::Number(expected_angle)),
            ("angularToleranceDegrees", Json::Number(angular)),
        ]),
        vec![Json::object([
            ("kind", Json::string("nominal-analytic-support")),
            ("value", evidence.to_json()),
            ("subject", nominal_support_json(a)),
            ("target", nominal_support_json(b)),
        ])],
    );
    let diagnostics = (!positive).then(|| mismatch(
        format!("Associated AP242 nominal supports of '{}' and '{}' are outside the declared inclusive relationship limits.",selector_label(&relationship.subject_raw),selector_label(&relationship.target_raw)),
        "Inspect the exact support certificate and authored limits; displayed angles and distances are diagnostic only.",
        Some(a.origin),
    )).into_iter().collect();
    Ok(Proof {
        positive,
        broad_phase: broad_phase(subject, target, tolerance),
        final_evidence,
        diagnostics,
    })
}

fn prove_containment(
    relationship: &Relationship,
    subject: &[Endpoint],
    target: &[Endpoint],
    context: &mut EvaluationContext<'_>,
) -> Result<Proof, ProofError> {
    let broad = broad_phase(subject, target, DEFAULT_LINEAR_TOLERANCE);
    if target.len() == 1 {
        if let Some(bore) = bore_region(&target[0])? {
            return prove_containment_in_bore(relationship, subject, bore, broad);
        }
    }
    // W3-CONTAINMENT-SET-01: each target is tested against the complete group.
    // Retain only the best target's per-subject residuals and per-target counts,
    // not a quadratic matrix. Ties retain the first target in selection order.
    let mut best = Vec::new();
    let mut current = Vec::with_capacity(subject.len());
    let mut best_inside = 0;
    let mut best_target = 0;
    let mut targets = Vec::with_capacity(target.len());
    for (target_index, b) in target.iter().enumerate() {
        current.clear();
        let mut inside = 0;
        for (subject_index, a) in subject.iter().enumerate() {
            let value = context
                .regular_solid_containment(a.entity, b.entity)
                .map_err(|mut evaluation| {
                    if let Evaluation::Refused { diagnostics } = &mut evaluation {
                        for diagnostic in diagnostics {
                            let details = diagnostic.details.get_or_insert_with(empty_object);
                            if let Json::Object(fields) = details {
                                fields.extend([
                                    ("method".into(), Json::string("boolean-difference")),
                                    ("subjectIndex".into(), Json::Number(subject_index as f64)),
                                    ("targetIndex".into(), Json::Number(target_index as f64)),
                                ]);
                            }
                        }
                    }
                    ProofError::Refused(evaluation)
                })?;
            inside += usize::from(value.residual_solid_count == 0);
            current.push(value);
        }
        targets.push(Json::object([
            ("targetIndex", Json::Number(target_index as f64)),
            ("containedSubjects", Json::Number(inside as f64)),
            (
                "outsideSubjects",
                Json::Number((subject.len() - inside) as f64),
            ),
        ]));
        if target_index == 0 || inside > best_inside {
            best_inside = inside;
            best_target = target_index;
            std::mem::swap(&mut best, &mut current);
        }
    }
    drop(current);
    let outside = subject.len() - best_inside;
    let center = best
        .iter()
        .filter(|row| !row.contained)
        .find_map(|row| row.residual_center_of_mass);
    let residuals = best
        .iter()
        .enumerate()
        .map(|(index, row)| {
            Json::object([
                ("subjectIndex", Json::Number(index as f64)),
                ("contained", Json::Bool(row.contained)),
                (
                    "residualSolidCount",
                    Json::Number(f64::from(row.residual_solid_count)),
                ),
                ("residualVolume", Json::Number(row.residual_volume)),
                (
                    "residualBounds",
                    row.residual_bounds.map_or(Json::Null, |bounds| {
                        Json::object([
                            ("min", point_json(bounds.min)),
                            ("max", point_json(bounds.max)),
                        ])
                    }),
                ),
                (
                    "residualCenterOfMass",
                    row.residual_center_of_mass.map_or(Json::Null, point_json),
                ),
            ])
        })
        .collect();
    let final_evidence = final_json(
        "boolean-difference",
        Json::object([
            (
                "criterion",
                Json::string("one-single-target-contains-all-subjects"),
            ),
            ("ruling", Json::string("W3-CONTAINMENT-SET-01")),
            ("containedSubjects", Json::Number(best_inside as f64)),
            ("outsideSubjects", Json::Number(outside as f64)),
            ("targetIndex", Json::Number(best_target as f64)),
            ("subjects", Json::Number(subject.len() as f64)),
            ("targets", Json::Array(targets)),
            ("residuals", Json::Array(residuals)),
        ]),
        Json::object([("outsideSubjects", Json::Number(0.0))]),
        // A residual centroid need not belong to a concave/disconnected solid.
        // Keep it in measured diagnostics, never as a certified point witness.
        vec![],
    );
    let mut diagnostics: Vec<_> = (outside != 0).then(|| mismatch(
        format!("'{}' is not contained by any single target in '{}': {outside} of {} subjects leave solid residue against the best target (selection index {best_target}).", selector_label(&relationship.subject_raw), selector_label(&relationship.target_raw), subject.len()),
        "Re-position the reported subjects or repair the target's residual region; separate targets are not implicitly united.",
        center,
    )).into_iter().collect();
    for diagnostic in &mut diagnostics {
        if let Some(Json::Object(fields)) = &mut diagnostic.spatial {
            fields.push(("role".into(), Json::string("diagnostic-residual-centroid")));
        }
    }
    Ok(Proof {
        positive: outside == 0,
        broad_phase: broad,
        final_evidence,
        diagnostics,
    })
}

fn prove_containment_in_bore(
    relationship: &Relationship,
    subject: &[Endpoint],
    bore: BoreRegion,
    broad_phase: Json,
) -> Result<Proof, ProofError> {
    if subject.len() != 1 {
        return Err(ProofError::Refused(relationship_unsupported(
            "A bore-region containment claim needs exactly one subject operand.",
            "Select a single cylindrical face (or assert one relationship per face).",
        )));
    }
    let Some(fit) = measure_bore_fit(&subject[0], bore, DEFAULT_ANGULAR_TOLERANCE_DEGREES)? else {
        return Err(ProofError::Refused(relationship_unsupported(&format!("Containment in the bore '{}' needs a coaxial analytic cylinder on the subject: exact bore membership is radius-and-extent algebra, and neither a non-cylindrical face nor a skewed axis has one.", selector_label(&relationship.target_raw)), "Select a cylindrical subject face aligned with the bore, or assert containment against the occurrence solid instead.")));
    };
    let final_evidence = final_json(
        "analytic",
        Json::object([
            ("clearance", Json::Number(fit.clearance)),
            ("engagement", Json::Number(fit.engagement)),
            ("radialOffset", Json::Number(fit.offset)),
            ("angle", Json::Number(fit.angle)),
            (
                "criterion",
                Json::string("radial-fit-with-positive-engagement"),
            ),
            ("axialEnclosureRequired", Json::Bool(false)),
        ]),
        Json::object([
            ("clearance", Json::Number(0.0)),
            ("engagement", Json::Number(0.0)),
        ]),
        vec![point_witness(fit.witness)],
    );
    let positive = fit.clearance >= 0.0 && fit.engagement > 0.0;
    let diagnostics = (!positive).then(|| mismatch(if fit.engagement > 0.0 { format!("'{}' does not fit the bore '{}': it overruns the bore radius by {:.4} mm.", selector_label(&relationship.subject_raw), selector_label(&relationship.target_raw), -fit.clearance) } else { format!("'{}' never enters the bore '{}': the two axial extents do not overlap.", selector_label(&relationship.subject_raw), selector_label(&relationship.target_raw)) }, "Re-position the part along the bore axis, or assert the relationship against the bore the part actually engages.", Some(fit.witness))).into_iter().collect();
    Ok(Proof {
        positive,
        broad_phase,
        final_evidence,
        diagnostics,
    })
}

fn sampled_insertion_refusal() -> Evaluation {
    let mut diagnostic = Diagnostic::error("GEOSPEC_EVIDENCE_UNSUPPORTED",
        "The insertion profile has only 64-station sampled depth; continuous insertion depth is not qualified.");
    diagnostic.suggestion = Some("Use a relationship with qualified exact evidence, or provide a qualified continuous insertion profile.".into());
    diagnostic.details = Some(Json::object([
        ("matcher", Json::string("toHaveSpatialRelationships")),
        ("kind", Json::string("insertion")),
        ("profile", Json::string("geospec-insertion-sampled64-v1")),
        ("stations", Json::Number(64.0)),
        ("continuousDepthQualified", Json::Bool(false)),
    ]));
    Evaluation::Refused {
        diagnostics: vec![diagnostic],
    }
}

fn prove_local_band_engagement(
    relationship: &Relationship,
    subject: &[Endpoint],
    target: &[Endpoint],
    context: &mut EvaluationContext<'_>,
) -> Result<Proof, ProofError> {
    charge(context, continuous::FINITE_CONTACT_UNITS)?;
    let (a, b) = selected_cylindrical_band_pair(
        subject
            .first()
            .ok_or_else(|| finite_contact_failure("Missing engagement subject."))?,
        target
            .first()
            .ok_or_else(|| finite_contact_failure("Missing engagement target."))?,
        context,
    )?;
    let axis = relationship
        .axis
        .ok_or_else(|| finite_contact_failure("Local engagement requires the authored axis."))?;
    // C1 validation drops its certificate before engagement arithmetic starts.
    // The latter fits the nominal-analytic schedule (see band_engagement_inner).
    // Two output slots cover its three retained scalars plus the final JSON,
    // including both <=32-label source routes. They are not C1 certificates.
    // Context separately charges all retained records, selectors and prior rows.
    context
        .check_cylindrical_band_capacity(&[
            continuous::CYLINDRICAL_BAND_PREDICATE_RESERVATION_BYTES.max(
                continuous::NOMINAL_ANALYTIC_RESERVATION_BYTES
                    + 2 * continuous::NOMINAL_ANALYTIC_OUTPUT_BYTES,
            ) as u64,
        ])
        .map_err(ProofError::Refused)?;
    let (positive, evidence) =
        match continuous::band_engagement(continuous::BandEngagementRequest {
            subject: &a,
            target: &b,
            axis,
            minimum: relationship.min.unwrap_or(0.),
            maximum: relationship.max,
            tolerance: relationship.tolerance.unwrap_or(DEFAULT_LINEAR_TOLERANCE),
            angular_tolerance_degrees: relationship
                .angular_tolerance_degrees
                .unwrap_or(DEFAULT_ANGULAR_TOLERANCE_DEGREES),
        }) {
            Outcome::Decided { positive, evidence } => (positive, evidence),
            Outcome::Unsupported { reason, .. } => {
                return Err(finite_contact_failure(&reason.message))
            }
        };
    let source = |f: &crate::backend::brep::NominalCylindricalBand| {
        Json::object([
            ("occurrence", Json::Number(f.occurrence as f64)),
            (
                "publicFaceOrdinal",
                Json::Number(f.public_face_ordinal as f64),
            ),
            (
                "privateQueryFace",
                Json::Number(f.private_query_face as f64),
            ),
            ("sourceFace", Json::Number(f.source_face_entity as f64)),
            (
                "sourceRoute",
                Json::Array(
                    f.source_route[..f.source_route_count as usize]
                        .iter()
                        .map(|v| Json::Number(*v as f64))
                        .collect(),
                ),
            ),
            ("origin", point_json(f.origin)),
            ("axis", point_json(f.axis)),
            ("radius", Json::Number(f.radius)),
            ("from", Json::Number(f.from)),
            ("to", Json::Number(f.to)),
        ])
    };
    let final_evidence = final_json(
        "exact-local-band-engagement",
        Json::object([
            ("depth", Json::Number(evidence.depth.display)),
            ("displayRole", Json::string("diagnostic-only")),
        ]),
        optional_numbers(&[
            ("min", relationship.min),
            ("max", relationship.max),
            ("tolerance", relationship.tolerance),
        ]),
        vec![Json::object([
            ("subjectSource", source(&a)),
            ("targetSource", source(&b)),
            ("decision", evidence.to_json()),
        ])],
    );
    Ok(Proof {
        positive,
        broad_phase: broad_phase(
            subject,
            target,
            relationship.tolerance.unwrap_or(DEFAULT_LINEAR_TOLERANCE),
        ),
        final_evidence,
        diagnostics: if positive {
            vec![]
        } else {
            vec![mismatch(
            "The selected finite thread/bore axial engagement or radial fit is outside the authored band.".into(),
            "Adjust the selected thread/bore alignment, radial fit or insertion depth; this is not whole-part collision evidence.",None)]
        },
    })
}

fn prove_continuous_insertion(
    relationship: &Relationship,
    subject: &[Endpoint],
    target: &[Endpoint],
    context: &mut EvaluationContext<'_>,
) -> Result<Proof, ProofError> {
    let ([subject_endpoint], [target_endpoint], Some(axis)) = (subject, target, relationship.axis)
    else {
        return Err(ProofError::Refused(sampled_insertion_refusal()));
    };
    if uses_band_route(
        relationship,
        subject_endpoint.entity,
        target_endpoint.entity,
    ) {
        return prove_local_band_engagement(relationship, subject, target, context);
    }
    let (BrepEntity::Occurrence(subject_id), BrepEntity::Occurrence(target_id)) =
        (subject_endpoint.entity, target_endpoint.entity)
    else {
        return Err(ProofError::Refused(sampled_insertion_refusal()));
    };
    let subject_domain = context
        .selected_continuous_domain(subject_id)
        .map_err(ProofError::Refused)?;
    let target_domain = context
        .selected_continuous_domain(target_id)
        .map_err(ProofError::Refused)?;
    let units = continuous::insertion_units(if subject_id == target_id { 1 } else { 2 }).map_err(
        |error| {
            ProofError::Refused(relationship_unsupported(
                &error.message,
                "Use the declared finite nominal box insertion domain.",
            ))
        },
    )?;
    context.budget.charge(units).map_err(|error| {
        ProofError::Budget(Evaluation::budget_exceeded(context.capability, error))
    })?;
    let (positive, evidence) = match continuous::insertion(InsertionRequest {
        subject: &subject_domain,
        target: &target_domain,
        axis,
        minimum: relationship.min.unwrap_or(0.0),
        maximum: relationship.max,
    }) {
        Outcome::Decided { positive, evidence } => (positive, evidence),
        Outcome::Unsupported { reason, .. } => {
            return Err(ProofError::Refused(relationship_unsupported(
                &reason.message,
                "Use two qualified complete nominal boxes and an explicit Cartesian insertion axis.",
            )))
        }
    };
    let mut expected = Vec::new();
    if let Some(minimum) = relationship.min {
        expected.push(("min".into(), Json::Number(minimum)));
    }
    if let Some(maximum) = relationship.max {
        expected.push(("max".into(), Json::Number(maximum)));
    }
    let final_evidence = final_json(
        "continuous-centerline",
        Json::object([("depth", Json::Number(evidence.depth.display))]),
        Json::Object(expected),
        vec![Json::object([
            ("kind", Json::string("nominal-continuous-insertion")),
            ("value", evidence.to_json()),
        ])],
    );
    let diagnostics = (!positive)
        .then(|| {
            mismatch(
                format!(
                    "Insertion of '{}' into '{}' is outside the declared engagement band (exact depth {}/{} mm).",
                    selector_label(&relationship.subject_raw),
                    selector_label(&relationship.target_raw),
                    evidence.depth.numerator,
                    evidence.depth.denominator,
                ),
                "Seat the part deeper, or adjust the declared engagement band.",
                Some(evidence.centerline.each_ref().map(|value| value.display)),
            )
        })
        .into_iter()
        .collect();
    Ok(Proof {
        positive,
        broad_phase: broad_phase(subject, target, DEFAULT_LINEAR_TOLERANCE),
        final_evidence,
        diagnostics,
    })
}

fn prove_interference(
    relationship: &Relationship,
    subject: &[Endpoint],
    target: &[Endpoint],
    context: &mut EvaluationContext<'_>,
) -> Result<Proof, ProofError> {
    let pair_count = subject
        .len()
        .checked_mul(target.len())
        .ok_or_else(|| ProofError::Refused(box_interference_refusal()))?;
    let minimum = relationship.min_volume.unwrap_or(0.0);
    let maximum = relationship.max_volume.unwrap_or(0.0);
    let reservation = (pair_count as u64)
        .checked_add(1)
        .and_then(|n| n.checked_mul(8 * continuous::BOX_INTERFERENCE_RESERVATION_BYTES as u64))
        .unwrap_or(u64::MAX);
    // Reserve all pair certificates and later projection/encoding copies before
    // allocating their Vec or invoking a predicate. No general OCCT fallback.
    context
        .check_continuous_output(reservation)
        .map_err(ProofError::Refused)?;
    let mut pairs = Vec::with_capacity(pair_count);
    let mut best: Option<(bool, continuous::BoxInterferenceEvidence)> = None;
    let mut best_index = 0;
    for a in subject {
        let BrepEntity::Occurrence(a_id) = a.entity else {
            return Err(ProofError::Refused(box_interference_refusal()));
        };
        for b in target {
            let BrepEntity::Occurrence(b_id) = b.entity else {
                return Err(ProofError::Refused(box_interference_refusal()));
            };
            let a_domain = context
                .selected_continuous_domain(a_id)
                .map_err(ProofError::Refused)?;
            let b_domain = context
                .selected_continuous_domain(b_id)
                .map_err(ProofError::Refused)?;
            charge(context, 1)?;
            let (positive, evidence) = match continuous::box_interference(continuous::BoxInterferenceRequest {
                subject: &a_domain, target: &b_domain, minimum, maximum,
            }) {
                Outcome::Decided { positive, evidence } => (positive, evidence),
                Outcome::Unsupported { reason, .. } => return Err(ProofError::Refused(relationship_unsupported(
                    &reason.message, "Interference is qualified only for admitted complete nominal boxes; incomplete/non-box domains are noninvertible, without general Boolean fallback.",
                ))),
            };
            let greater = best
                .as_ref()
                .is_none_or(|(_, current)| evidence.greater_than(current));
            pairs.push(evidence.to_json());
            if greater {
                best_index = pairs.len() - 1;
                best = Some((positive, evidence));
            }
        }
    }
    let (positive, best) = best.ok_or_else(|| ProofError::Refused(box_interference_refusal()))?;
    let volume = best.volume.display;
    let centroid = best
        .center
        .as_ref()
        .map(|c| c.each_ref().map(|v| v.display));
    let final_evidence = final_json(
        "exact-nominal-box-interference",
        Json::object([
            ("volume", Json::Number(volume)),
            ("exactVolume", best.volume.to_json()),
            ("criterion", Json::string("maximum-selected-pair-volume")),
            ("maximumPairIndex", Json::Number(best_index as f64)),
            ("checkedPairs", Json::Number(pair_count as f64)),
        ]),
        Json::object([
            ("minVolume", Json::Number(minimum)),
            ("maxVolume", Json::Number(maximum)),
        ]),
        vec![Json::object([
            ("kind", Json::string("complete-box-intersections")),
            ("pairs", Json::Array(pairs)),
        ])],
    );
    let diagnostics=(!positive).then(||mismatch(
        format!("Maximum admitted box-pair intersection volume {volume} mm³ is outside the inclusive {minimum}–{maximum} mm³ allowance."),
        "Inspect the exact volume and complete source-box certificates; no numerical epsilon is applied.",
        centroid,
    )).into_iter().collect();
    Ok(Proof {
        positive,
        broad_phase: broad_phase(subject, target, DEFAULT_LINEAR_TOLERANCE),
        final_evidence,
        diagnostics,
    })
}

fn box_interference_refusal() -> Evaluation {
    relationship_unsupported(
        "Interference requires nonempty selections of connector-certified complete nominal box occurrences.",
        "Select complete admitted boxes; general solids and selected-face interference are not qualified by this exact-domain branch.",
    )
}

fn charge(context: &mut EvaluationContext<'_>, units: u64) -> Result<(), ProofError> {
    context.budget().charge(units).map_err(|error| {
        ProofError::Budget(Evaluation::budget_exceeded(
            Capability::ToHaveSpatialRelationships,
            error,
        ))
    })
}

#[derive(Clone, Copy, Debug)]
struct BoreRegion {
    origin: [f64; 3],
    direction: [f64; 3],
    radius: f64,
    from: f64,
    to: f64,
}
struct BoreFit {
    clearance: f64,
    engagement: f64,
    offset: f64,
    angle: f64,
    witness: [f64; 3],
}

fn bore_region(endpoint: &Endpoint) -> Result<Option<BoreRegion>, ProofError> {
    match &endpoint.bore {
        Some(Ok(bore)) => Ok(Some(*bore)),
        Some(Err(error)) => Err(ProofError::Backend(error.clone())),
        None => Ok(None),
    }
}

fn radial_offset(bore: BoreRegion, point: [f64; 3]) -> f64 {
    let delta = subtract(point, bore.origin);
    dot_length(subtract(
        delta,
        scale(bore.direction, dot(delta, bore.direction)),
    ))
}
fn measure_bore_fit(
    subject: &Endpoint,
    bore: BoreRegion,
    angular: f64,
) -> Result<Option<BoreFit>, ProofError> {
    let Some(subject_bore) = bore_region(subject)? else {
        return Ok(None);
    };
    // W3-CONTAINMENT-SET-01: angular tolerance is not a proof of constant
    // radial separation over finite skew axes. This first profile is parallel.
    if subject_bore.direction != bore.direction
        && subject_bore.direction != bore.direction.map(|coordinate| -coordinate)
    {
        return Ok(None);
    }
    let angle = dot(subject_bore.direction, bore.direction)
        .abs()
        .min(1.0)
        .acos()
        .to_degrees();
    if angle > angular {
        return Ok(None);
    }
    let offset = radial_offset(bore, subject_bore.origin);
    let base = dot(subtract(subject_bore.origin, bore.origin), bore.direction);
    let sign = if dot(subject_bore.direction, bore.direction) < 0.0 {
        -1.0
    } else {
        1.0
    };
    let ends = [
        base + sign * subject_bore.from,
        base + sign * subject_bore.to,
    ];
    let low = bore.from.max(ends[0].min(ends[1]));
    let high = bore.to.min(ends[0].max(ends[1]));
    let middle = (low + high) / 2.0;
    Ok(Some(BoreFit {
        clearance: bore.radius - (subject_bore.radius + offset),
        engagement: (high - low).max(0.0),
        offset,
        angle,
        witness: add(bore.origin, scale(bore.direction, middle)),
    }))
}

fn broad_phase(subject: &[Endpoint], target: &[Endpoint], margin: f64) -> Json {
    let (Some(a), Some(b)) = (union_bounds(subject), union_bounds(target)) else {
        return Json::object([
            ("method", Json::string("aabb")),
            ("candidate", Json::Bool(true)),
            (
                "detail",
                Json::string("no bounds on one endpoint; every pair stays a candidate"),
            ),
        ]);
    };
    let mut gap: f64 = 0.0;
    for axis in 0..3 {
        gap = gap.max((a.min[axis] - b.max[axis]).max(b.min[axis] - a.max[axis]));
    }
    Json::object([
        ("method", Json::string("aabb")),
        ("candidate", Json::Bool(gap <= margin)),
        (
            "detail",
            Json::String(format!(
                "bounds gap {gap:.4} mm against a {margin:.4} mm margin"
            )),
        ),
    ])
}

fn union_bounds(endpoints: &[Endpoint]) -> Option<Bounds> {
    endpoints
        .iter()
        .filter_map(|endpoint| endpoint.facts.bounds)
        .fold(None, |union, bounds| {
            Some(match union {
                None => bounds,
                Some(union) => Bounds {
                    min: std::array::from_fn(|axis| union.min[axis].min(bounds.min[axis])),
                    max: std::array::from_fn(|axis| union.max[axis].max(bounds.max[axis])),
                },
            })
        })
}
#[cfg(test)]
fn bounds_corners(bounds: Bounds) -> Vec<[f64; 3]> {
    let mut result = Vec::with_capacity(8);
    for x in [bounds.min[0], bounds.max[0]] {
        for y in [bounds.min[1], bounds.max[1]] {
            for z in [bounds.min[2], bounds.max[2]] {
                result.push([x, y, z]);
            }
        }
    }
    result
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
fn scale(a: [f64; 3], v: f64) -> [f64; 3] {
    [a[0] * v, a[1] * v, a[2] * v]
}
fn length(a: [f64; 3]) -> f64 {
    node24_hypot3(a)
}
fn dot_length(a: [f64; 3]) -> f64 {
    dot(a, a).sqrt()
}
#[cfg(test)]
fn unit(a: [f64; 3]) -> [f64; 3] {
    let length = length(a);
    if length == 0.0 {
        [0.0; 3]
    } else {
        [a[0] / length, a[1] / length, a[2] / length]
    }
}
fn folded_angle(a: [f64; 3], b: [f64; 3]) -> f64 {
    let lengths = length(a) * length(b);
    let cosine = if lengths == 0.0 {
        1.0
    } else {
        (dot(a, b).abs() / lengths).min(1.0)
    };
    relationship_degrees(cosine.acos())
}
fn relationship_degrees(radians: f64) -> f64 {
    // relationship-proofs.ts multiplies before dividing; selectors use 180 / PI.
    (radians * 180.0) / std::f64::consts::PI
}

fn final_json(method: &str, measured: Json, expected: Json, witnesses: Vec<Json>) -> Json {
    Json::object([
        ("method", Json::string(method)),
        ("measured", measured),
        ("expected", expected),
        ("witnesses", Json::Array(witnesses)),
    ])
}
fn point_json(point: [f64; 3]) -> Json {
    Json::Array(point.into_iter().map(Json::Number).collect())
}
fn point_witness(point: [f64; 3]) -> Json {
    Json::object([
        ("kind", Json::string("point")),
        ("value", point_json(point)),
    ])
}
fn optional_numbers(values: &[(&str, Option<f64>)]) -> Json {
    Json::Object(
        values
            .iter()
            .filter_map(|(key, value)| value.map(|value| ((*key).into(), Json::Number(value))))
            .collect(),
    )
}
fn empty_object() -> Json {
    Json::Object(Vec::new())
}
fn json_field_ref<'a>(value: &'a Json, key: &str) -> Option<&'a Json> {
    let Json::Object(fields) = value else {
        return None;
    };
    fields
        .iter()
        .find(|(name, _)| name == key)
        .map(|(_, value)| value)
}
fn json_field(value: &Json, key: &str) -> Option<Json> {
    json_field_ref(value, key).cloned()
}
fn json_string(value: &Json) -> String {
    String::from_utf8(encode(value).unwrap_or_default()).unwrap_or_default()
}
fn selector_label(value: &Json) -> String {
    match value {
        Json::String(value) => value.clone(),
        _ => json_string(value),
    }
}
fn relationship_label(index: usize, relationship: &Relationship) -> String {
    format!(
        "Spatial relationship {index}{} failed",
        relationship
            .id
            .as_ref()
            .map(|id| format!(" ({id})"))
            .unwrap_or_default()
    )
}

fn mismatch(message: String, suggestion: &str, center: Option<[f64; 3]>) -> Diagnostic {
    let mut diagnostic = Diagnostic::error("GEOSPEC_SPATIAL_RELATIONSHIP_MISMATCH", message);
    diagnostic.suggestion = Some(suggestion.into());
    diagnostic.spatial = center.map(|center| Json::object([("center", point_json(center))]));
    diagnostic
}
fn missing_brep(missing: &str, suggestion: &str) -> Evaluation {
    let mut diagnostic = Diagnostic::error(
        "GEOSPEC_EVIDENCE_UNSUPPORTED",
        format!("expectGeo(...).toHaveSpatialRelationships() needs {missing}, which this subject does not carry."),
    );
    diagnostic.suggestion = Some(suggestion.into());
    diagnostic.details = Some(Json::object([
        ("matcher", Json::string("toHaveSpatialRelationships")),
        ("missing", Json::string(missing)),
    ]));
    Evaluation::Refused {
        diagnostics: vec![diagnostic],
    }
}
fn phase_two_refusal() -> Evaluation {
    let mut diagnostic = Diagnostic::error(
        "GEOSPEC_BACKEND_FAILED",
        "GeoSpec matcher 'toHaveSpatialRelationships' reached evaluation before whole-batch phase-two selector resolution.",
    );
    diagnostic.suggestion = Some(
        "Resolve every relationship selector through the shared selector index before proof evaluation."
            .into(),
    );
    Evaluation::Refused {
        diagnostics: vec![diagnostic],
    }
}
fn relationship_unsupported(message: &str, suggestion: &str) -> Evaluation {
    let mut diagnostic = Diagnostic::error("GEOSPEC_SELECTOR_UNSUPPORTED_EVIDENCE", message);
    diagnostic.suggestion = Some(suggestion.into());
    Evaluation::Refused {
        diagnostics: vec![diagnostic],
    }
}

fn append_selection_diagnostics(
    diagnostics: &mut Vec<Diagnostic>,
    index: usize,
    relationship: &Relationship,
    subject: &Selection,
    target: &Selection,
) {
    for (selection, role) in [(subject, "subject"), (target, "target")] {
        if selection.status == SelectionStatus::Resolved {
            continue;
        }
        for source in &selection.diagnostics {
            let mut diagnostic = source.clone();
            diagnostic.message = format!(
                "{}: the {role} selector did not resolve — {}",
                relationship_label(index, relationship),
                source.message
            );
            diagnostic.details = Some(Json::object([
                ("relationship", effective_relationship_copy(relationship)),
                ("subject", selection_json(subject)),
                ("target", selection_json(target)),
                (
                    "selector",
                    source.details.clone().unwrap_or_else(empty_object),
                ),
            ]));
            diagnostics.push(diagnostic);
        }
    }
}
fn selection_json(selection: &Selection) -> Json {
    Json::object([
        ("source", Json::string("step-xde")),
        (
            "status",
            Json::string(match selection.status {
                SelectionStatus::Resolved => "resolved",
                SelectionStatus::Unmatched => "unmatched",
                SelectionStatus::Ambiguous => "ambiguous",
                SelectionStatus::Unsupported => "unsupported",
            }),
        ),
        (
            "stability",
            Json::string(match selection.stability {
                Stability::Authored => "authored",
                Stability::DerivedQuery => "derived-query",
                Stability::DerivedProbe => "derived-probe",
                Stability::DerivedOrdinal => "derived-ordinal",
            }),
        ),
        (
            "entities",
            Json::Array(selection.entities.iter().map(entity_json).collect()),
        ),
    ])
}
fn entity_json(entity: &Entity) -> Json {
    let mut fields = vec![
        ("id".into(), Json::string(&entity.id)),
        (
            "entityType".into(),
            Json::string(match entity.entity_type {
                crate::analysis::selection::EntityType::Occurrence => "occurrence",
                crate::analysis::selection::EntityType::Body => "body",
                crate::analysis::selection::EntityType::Face => "face",
                crate::analysis::selection::EntityType::Axis => "axis",
                crate::analysis::selection::EntityType::Plane => "plane",
                crate::analysis::selection::EntityType::Datum => "datum",
                crate::analysis::selection::EntityType::Interface => "interface",
                crate::analysis::selection::EntityType::Group => "group",
            }),
        ),
    ];
    if let Some(path) = &entity.occurrence_path {
        fields.push(("occurrencePath".into(), Json::string(path)));
    }
    Json::Object(fields)
}

#[cfg(test)]
#[path = "relationship_scalar_tests.rs"]
pub(crate) mod relationship_scalar_tests;

#[cfg(test)]
#[path = "../../tests/regular_set_containment.rs"]
mod regular_set_containment;

#[cfg(test)]
#[path = "../../tests/cylindrical_band_core.rs"]
mod cylindrical_band_core;

#[cfg(test)]
#[path = "../../tests/nominal_analytic_relationships.rs"]
mod nominal_analytic_relationships;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compact_projection_preserves_c1_and_box_insertion_profiles() {
        for (method, profile) in [
            (
                "exact-nominal-cylindrical-band-clearance",
                "geospec-nominal-cylindrical-band-clearance-v1",
            ),
            ("continuous-centerline", "continuous-centerline"),
        ] {
            let relationship = parse_relationship(
                &crate::codec::decode(br#"{"kind":"clearance","subject":"left","target":"right"}"#)
                    .unwrap(),
                0,
            )
            .unwrap();
            let selected = Selection {
                status: SelectionStatus::Resolved,
                entities: vec![],
                expected: crate::analysis::selection::Cardinality::One,
                stability: Stability::Authored,
                candidates: vec![],
                diagnostics: vec![],
            };
            let proof = Proof {
                positive: false,
                broad_phase: empty_object(),
                final_evidence: final_json(method, empty_object(), empty_object(), vec![]),
                diagnostics: vec![],
            };
            let source = Diagnostic::error(
                "GEOSPEC_SPATIAL_RELATIONSHIP_MISMATCH",
                "Existing C1 control.",
            );
            let diagnostic = project_relationship_diagnostic(
                0,
                &relationship,
                &selected,
                &selected,
                &proof,
                &source,
            );
            let actual: serde_json::Value =
                serde_json::from_slice(&crate::codec::encode(&diagnostic.to_json()).unwrap())
                    .unwrap();
            assert_eq!(actual["details"]["evidence"]["profile"], profile);
            assert_eq!(
                actual["details"]["evidence"]["path"],
                "evidence.witnesses.relationships[relationshipIndex].final"
            );
            assert!(actual["details"]["evidence"].get("final").is_none());
            assert!(actual["details"].get("witnesses").is_none());
        }
    }

    struct TrimControl {
        calls: std::cell::Cell<u32>,
        bands: Vec<crate::backend::brep::NominalCylindricalBand>,
    }

    impl BrepSubject for TrimControl {
        fn cylinder_axial_extent(
            &self,
            _: BrepEntity,
        ) -> Result<CylinderAxialExtent, BackendError> {
            self.calls.set(self.calls.get() + 1);
            Ok(CylinderAxialExtent {
                origin: [0.0; 3],
                axis: [0.0, 0.0, 1.0],
                radius: 1.0,
                from: 0.0,
                to: 10.0,
            })
        }
        fn nominal_cylindrical_band(
            &self,
            face: BrepEntity,
        ) -> Result<crate::backend::brep::NominalCylindricalBand, BackendError> {
            self.calls.set(self.calls.get() + 1);
            Ok(self
                .bands
                .iter()
                .find(|b| {
                    face == BrepEntity::Face {
                        occurrence: b.occurrence,
                        face: b.private_query_face,
                    }
                })
                .unwrap()
                .clone())
        }
        fn source_occurrences(
            &self,
        ) -> Result<std::rc::Rc<[crate::backend::brep::OccurrenceFacts]>, BackendError> {
            use crate::backend::brep::*;
            Ok(std::rc::Rc::from([OccurrenceFacts {
                name: "housing".into(),
                placement: [1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0],
                bounds: Bounds {
                    min: [-40.0; 3],
                    max: [40.0; 3],
                },
                path: "housing".into(),
                parent: None,
                product: 0,
                product_name: "core-product".into(),
                instance_name: None,
                ordinal_path: vec![1],
                face_count: 1,
            }]))
        }
        fn reported_shape(&self) -> Result<crate::backend::brep::ShapeFacts, BackendError> {
            use crate::backend::brep::*;
            Ok(ShapeFacts {
                bounds: Bounds {
                    min: [-40.0; 3],
                    max: [40.0; 3],
                },
                volume: 1.0,
                surface_area: 1.0,
                center_of_mass: [0.0; 3],
                topology: TopologyCounts {
                    compounds: 0,
                    solids: 1,
                    shells: 1,
                    faces: 3,
                    wires: 3,
                    edges: 3,
                    vertices: 2,
                },
            })
        }
        fn reported_faces(
            &self,
            _: bool,
        ) -> Result<crate::backend::brep::ReportedFaces, BackendError> {
            use crate::backend::brep::*;
            use std::rc::Rc;
            Ok(ReportedFaces {
                whole_faces: Rc::from([]),
                occurrence_faces: vec![self
                    .bands
                    .iter()
                    .map(|b| LocatedFace {
                        entity: BrepEntity::Face {
                            occurrence: b.occurrence,
                            face: b.private_query_face,
                        },
                        facts: FaceFacts {
                            index: b.public_face_ordinal,
                            area: 1.,
                            center_of_mass: b.origin,
                            surface: SurfaceFacts::Cylinder {
                                origin: b.origin,
                                axis: b.axis,
                                radius: b.radius,
                            },
                        },
                        bounds: Bounds {
                            min: [-40.; 3],
                            max: [40.; 3],
                        },
                        reversed: false,
                    })
                    .collect::<Vec<_>>()
                    .into()],
            })
        }
        fn document_rows(&self) -> Result<crate::backend::brep::DocumentRows, BackendError> {
            Ok(crate::backend::brep::DocumentRows::default())
        }
        fn reported_mesh(&self) -> Result<crate::backend::TriangleMesh, BackendError> {
            Ok(crate::backend::TriangleMesh {
                positions: vec![],
                triangles: vec![],
            })
        }

        fn faces(&self) -> Result<std::rc::Rc<[crate::backend::brep::LocatedFace]>, BackendError> {
            unreachable!("only trim query belongs to this control")
        }
        fn validity(
            &self,
        ) -> Result<std::rc::Rc<crate::backend::brep::ValidityFacts>, BackendError> {
            unreachable!("only trim query belongs to this control")
        }
        fn classify_face_points(
            &self,
            _: BrepEntity,
            _: &[[f64; 3]],
            _: f64,
        ) -> Result<Vec<PointState>, BackendError> {
            unreachable!("only trim query belongs to this control")
        }
        fn tessellate(
            &self,
            _: BrepEntity,
            _: crate::backend::brep::TessellationProfile,
        ) -> Result<std::rc::Rc<crate::backend::TriangleMesh>, BackendError> {
            unreachable!("only trim query belongs to this control")
        }
    }

    fn engagement_band(
        radius: f64,
        axis: [f64; 3],
        origin: [f64; 3],
        interval: [f64; 2],
    ) -> crate::backend::brep::NominalCylindricalBand {
        use crate::backend::brep::*;
        NominalCylindricalBand {
            profile: CylindricalBandProfile::NominalV1,
            occurrence: 0,
            public_face_ordinal: 0,
            private_query_face: 1,
            source_face_entity: 100,
            source_route_count: 1,
            source_route: std::array::from_fn(|i| if i == 0 { 200 } else { 0 }),
            source_same_sense: true,
            transferred_reversed: false,
            origin,
            axis,
            phase_x: [1.0, 0.0, 0.0],
            phase_y: [0.0, 1.0, 0.0],
            radius,
            from: interval[0],
            to: interval[1],
            parameter_bounds: [0.0, std::f64::consts::TAU, interval[0], interval[1]],
            surface_period: std::f64::consts::TAU,
            rims: std::array::from_fn(|i| CylindricalBandRim {
                edge_index: i as u32 + 1,
                center: origin,
                axis,
                phase_x: [1.0, 0.0, 0.0],
                phase_y: [0.0, 1.0, 0.0],
                radius,
                curve_range: [0.0, std::f64::consts::TAU],
                curve_period: std::f64::consts::TAU,
                vertex_indices: [i as u32 + 1; 2],
            }),
            seam_edge_index: 3,
            seam_origin: origin,
            seam_axis: axis,
            seam_curve_range: interval,
            seam_vertex_indices: [1, 2],
            boundary: std::array::from_fn(|i| CylinderBoundaryUse {
                edge_index: [3, 3, 1, 2][i],
                orientation: if i % 2 == 0 {
                    CylinderBoundaryOrientation::Forward
                } else {
                    CylinderBoundaryOrientation::Reversed
                },
                side: [
                    CylinderBoundarySide::U0,
                    CylinderBoundarySide::U1,
                    CylinderBoundarySide::V0,
                    CylinderBoundarySide::V1,
                ][i],
                curve_range: interval,
                pcurve_stored: true,
                parameter_endpoints: [[0.0, 0.0]; 2],
            }),
            vertices: std::array::from_fn(|i| CylinderVertex {
                vertex_index: i as u32 + 1,
                point: origin,
            }),
            face_tolerance_mm: 1e-7,
            edge_tolerances_mm: [1e-7; 3],
            vertex_tolerances_mm: [1e-7; 2],
            period_residual_mm: 0.0,
            boundary_residuals: [CylindricalBandBoundaryResidual {
                parameter_coverage_mm: 0.0,
                curve_surface_mm: 0.0,
                vertex_attachment_mm: 0.0,
                limit_mm: 1e-7,
            }; 4],
        }
    }

    #[test]
    fn local_band_engagement_preserves_depth_polarities_and_warm_work() {
        use crate::{
            budget::Budget,
            identity::SubjectIdentity,
            registry::Capability,
            result::Polarity,
            subject::{Subject, SubjectFormat},
        };
        use std::rc::Rc;
        // Principal R5 source construction: plug radius 5.95, z=8..24;
        // bore radius 6, z=0..24. Common span is exactly 16, below min 17.
        // These mock admitted bands test core routing, not OCCT admission.
        let a = engagement_band(5.95, [0., 0., 1.], [0.; 3], [8., 24.]);
        let mut b = engagement_band(6., [0., 0., 1.], [0.; 3], [0., 24.]);
        b.public_face_ordinal = 1;
        b.private_query_face = 2;
        let selected = |band: &crate::backend::brep::NominalCylindricalBand| Selection {
            status: SelectionStatus::Resolved,
            expected: Cardinality::One,
            stability: Stability::Authored,
            candidates: vec![],
            diagnostics: vec![],
            entities: vec![Entity {
                id: format!("face-{}", band.private_query_face),
                entity_type: crate::analysis::selection::EntityType::Face,
                occurrence_path: None,
                occurrence: Some(0),
                face: Some(BrepEntity::Face {
                    occurrence: 0,
                    face: band.private_query_face,
                }),
                facts: EntityFacts {
                    surface_type: Some("cylinder".into()),
                    face_index: Some(band.public_face_ordinal),
                    ..EntityFacts::default()
                },
                topology_ref: None,
            }],
        };
        let mut relationship = parse_relationship(
            &crate::codec::decode(
                br#"{"kind":"insertion","subject":"plug","target":"bore","axis":[0,0,1],"min":17}"#,
            )
            .unwrap(),
            0,
        )
        .unwrap();
        relationship.resolved = Some((selected(&a), selected(&b)));
        relationship.resolved_bores = Some((vec![None], vec![None]));
        let prepared = Prepared {
            relationships: vec![relationship],
        };
        let identity = SubjectIdentity::step(
            b"local-band-core-control",
            "millimetre",
            1.,
            crate::backend::brep::BrepIdentityProfile {
                ingest_profile: "core-control",
                backend_profile: "core-control",
            },
            None,
        )
        .unwrap();
        let mut subject = Subject::new(
            identity.primary_hash().into(),
            SubjectFormat::Step,
            "mm".into(),
        );
        subject.semantic_identity.set(identity).unwrap();
        subject.brep = Some(Box::new(TrimControl {
            calls: std::cell::Cell::new(0),
            bands: vec![a, b],
        }));
        let subjects = [Rc::new(subject)];
        let payload = prepared.normalized_payload();
        for _warm in [false, true] {
            for (polarity, expected) in [
                (Polarity::Positive, "failed"),
                (Polarity::Negative, "passed"),
            ] {
                // 1 report + 2 faces + 1 pair + unchanged 32768 predicate debit.
                for limit in [32772, 32771] {
                    let budget = Budget::new(limit);
                    let mut context = EvaluationContext::new(
                        &subjects,
                        Capability::ToHaveSpatialRelationships,
                        "engagement",
                        &payload,
                        &budget,
                        None,
                    );
                    let result = crate::result::finish(
                        "engagement",
                        Capability::ToHaveSpatialRelationships,
                        polarity,
                        evaluate(&prepared, &mut context),
                    )
                    .unwrap();
                    let result: serde_json::Value =
                        serde_json::from_slice(&crate::codec::encode(&result).unwrap()).unwrap();
                    assert_eq!(budget.used(), 32772);
                    if limit == 32771 {
                        assert_eq!(result["status"], "refused");
                        assert_eq!(result["diagnostics"][0]["code"], "MATCHER_TIMEOUT");
                    } else {
                        assert_eq!(result["status"], expected, "{result}");
                        let decision = &result["evidence"]["witnesses"]["relationships"][0]
                            ["final"]["witnesses"][0]["decision"];
                        assert_eq!(decision["depth"]["numerator"], "16");
                        assert_eq!(decision["depth"]["denominator"], "1");
                    }
                }
            }
        }
        // An earlier row may retain 128 KiB while this fixed-size pair is
        // evaluated. Its charge stays separate from the sequential scratch.
        for (prior_bytes, fits) in [(128 * 1024, true), (200 * 1024, false)] {
            let budget = Budget::new(32772);
            let mut context = EvaluationContext::new(
                &subjects,
                Capability::ToHaveSpatialRelationships,
                "engagement",
                &payload,
                &budget,
                None,
            );
            assert!(context.brep_gate().is_ok());
            assert!(context
                .set_cylindrical_band_output_bytes(prior_bytes)
                .is_ok());
            let relationship = &prepared.relationships[0];
            let (a, b) = relationship.resolved.as_ref().unwrap();
            let a = endpoints(a, &[None], "subject").ok().unwrap();
            let b = endpoints(b, &[None], "target").ok().unwrap();
            let proof = prove_continuous_insertion(relationship, &a, &b, &mut context);
            assert_eq!(budget.used(), 32772);
            if fits {
                let proof = proof
                    .ok()
                    .expect("128 KiB prior output plus local engagement fits");
                assert!(!proof.positive);
            } else {
                assert!(
                    matches!(proof, Err(ProofError::Refused(_))),
                    "caller charges must still enforce 256 KiB"
                );
            }
        }
    }

    #[test]
    fn required_trim_requests_charge_before_query_at_two_and_three_units() {
        let brep = TrimControl {
            calls: std::cell::Cell::new(0),
            bands: vec![],
        };
        let selection = Selection {
            status: SelectionStatus::Resolved,
            entities: vec![Entity {
                id: "cylinder".into(),
                entity_type: crate::analysis::selection::EntityType::Face,
                occurrence_path: None,
                occurrence: None,
                face: Some(BrepEntity::WholeFace(0)),
                facts: EntityFacts {
                    surface_type: Some("cylinder".into()),
                    ..EntityFacts::default()
                },
                topology_ref: None,
            }],
            expected: Cardinality::One,
            stability: Stability::Authored,
            candidates: vec![],
            diagnostics: vec![],
        };
        for _ in 0..2 {
            for limit in [2, 3] {
                let budget = crate::budget::Budget::new(limit);
                budget.charge(1).unwrap(); // Required logical report request.
                let before = brep.calls.get();
                let left = resolve_bore_evidence(&selection, Some(&brep), true, &budget);
                let right = resolve_bore_evidence(&selection, Some(&brep), true, &budget);
                assert!(left[0].as_ref().unwrap().is_ok());
                assert_eq!(budget.used(), 3);
                if limit == 2 {
                    assert_eq!(
                        right[0].as_ref().unwrap().as_ref().unwrap_err().kind,
                        BackendErrorKind::BudgetExceeded { limit: 2, used: 3 }
                    );
                    assert_eq!(
                        brep.calls.get() - before,
                        1,
                        "rejected demand never queries the connector"
                    );
                } else {
                    let region = right[0].as_ref().unwrap().as_ref().unwrap();
                    assert_eq!((region.from, region.to), (0.0, 10.0));
                    assert_eq!(brep.calls.get() - before, 2);
                }
            }
        }
        let budget = crate::budget::Budget::new(0);
        assert!(resolve_bore_evidence(&selection, Some(&brep), false, &budget)[0].is_none());
        assert_eq!(budget.used(), 0, "nonbore claims have no trim demand");
    }

    fn bore_endpoint(
        extent: Result<CylinderAxialExtent, BackendError>,
        bounds: Bounds,
    ) -> Endpoint {
        Endpoint {
            occurrence: None,
            entity: BrepEntity::WholeFace(1),
            facts: EntityFacts {
                surface_type: Some("cylinder".into()),
                bounds: Some(bounds),
                ..EntityFacts::default()
            },
            bore: Some(extent.and_then(qualified_bore_region)),
        }
    }

    #[test]
    fn normalized_relationships_include_every_effective_finite_default() {
        let rows = [
            "contact",
            "clearance",
            "coaxial",
            "concentric",
            "coplanar",
            "parallel",
            "perpendicular",
            "angle",
            "containment",
            "insertion",
            "interference",
        ]
        .into_iter()
        .map(|kind| {
            Json::object([
                ("kind", Json::string(kind)),
                ("subject", Json::string("a")),
                ("target", Json::string("b")),
            ])
        })
        .collect();
        let payload = Json::object([
            ("kind", Json::string("spatialRelationships")),
            (
                "expected",
                Json::object([("relationships", Json::Array(rows))]),
            ),
        ]);
        let normalized = prepare(&payload).unwrap().normalized_payload();
        let fields = object(&normalized, "payload").unwrap();
        let expected = object(field(fields, "expected").unwrap(), "expected").unwrap();
        let rows = array(field(expected, "relationships").unwrap(), "rows").unwrap();

        assert_eq!(
            optional_field(object(&rows[0], "contact").unwrap(), "tolerance"),
            Some(&Json::Number(0.02))
        );
        assert_eq!(
            optional_field(object(&rows[1], "clearance").unwrap(), "tolerance"),
            Some(&Json::Number(0.0))
        );
        assert_eq!(
            optional_field(object(&rows[5], "parallel").unwrap(), "angleDegrees"),
            Some(&Json::Number(0.0))
        );
        assert_eq!(
            optional_field(object(&rows[6], "perpendicular").unwrap(), "angleDegrees"),
            Some(&Json::Number(90.0))
        );
        assert_eq!(
            optional_field(object(&rows[8], "containment").unwrap(), "tolerance"),
            None
        );
        assert_eq!(
            optional_field(object(&rows[9], "insertion").unwrap(), "min"),
            Some(&Json::Number(0.0))
        );
        assert_eq!(
            optional_field(object(&rows[10], "interference").unwrap(), "maxVolume"),
            Some(&Json::Number(0.0))
        );
    }

    #[test]
    fn effective_defaults_typed_copies_and_diagnostics_preserve_source_fields() {
        use serde_json::{json, Value};
        let decode =
            |value: &Value| crate::codec::decode(&serde_json::to_vec(value).unwrap()).unwrap();
        let value = |input: &Json| {
            serde_json::from_slice::<Value>(&crate::codec::encode(input).unwrap()).unwrap()
        };
        let canonical = |input: &Value| value(&decode(input));
        let mut outcomes = Vec::new();
        for kind in ["contact", "coaxial", "parallel", "perpendicular", "angle"] {
            for explicit in [false, true] {
                let mut authored = json!({
                    "id": "ordinary", "kind": kind, "subject": "left", "target": "right",
                    "reason": "retain authored reason"
                });
                if explicit {
                    authored["angularToleranceDegrees"] = json!(1.0);
                    authored["angleDegrees"] = json!(15.0);
                    authored["tolerance"] = json!(0.125);
                }
                let relationship = parse_relationship(&decode(&authored), 2).unwrap();
                let mut expected_copy = authored.clone();
                expected_copy["angularToleranceDegrees"] = json!(if explicit { 1.0 } else { 0.5 });
                if matches!(kind, "parallel" | "perpendicular" | "angle") {
                    expected_copy["angleDegrees"] = json!(if kind == "perpendicular" {
                        90.0
                    } else if explicit {
                        15.0
                    } else {
                        0.0
                    });
                }
                let mut expected_normalized = expected_copy.clone();
                if matches!(kind, "contact" | "coaxial") && !explicit {
                    expected_normalized["tolerance"] = json!(0.02);
                }
                let selection = Selection {
                    status: SelectionStatus::Resolved,
                    entities: Vec::new(),
                    expected: crate::analysis::selection::Cardinality::One,
                    stability: Stability::Authored,
                    candidates: Vec::new(),
                    diagnostics: Vec::new(),
                };
                let final_record = json!({
                    "method": "ordinary-projection-control",
                    "measured": {"angleDegrees": 12.5},
                    "expected": {"angleDegrees": 15.0},
                    "witnesses": [{"point": [1.0, 2.0, 3.0]}],
                    "relationship": {"kind": "coaxial"},
                    "authoredRequestJson": "{\"kind\":\"perpendicular\",\"angleDegrees\":15}"
                });
                let broad_phase = json!({"candidateCount": 1});
                let proof = Proof {
                    positive: false,
                    broad_phase: decode(&broad_phase),
                    final_evidence: decode(&final_record),
                    diagnostics: Vec::new(),
                };
                let mut source = Diagnostic::error(
                    "GEOSPEC_SPATIAL_RELATIONSHIP_MISMATCH",
                    "Source measurement differs.",
                );
                source.suggestion = Some("Retain this source suggestion.".into());
                source.spatial = Some(decode(&json!({"center": [1.0, 2.0, 3.0]})));
                let source_before = source.clone();
                let diagnostic = project_relationship_diagnostic(
                    2,
                    &relationship,
                    &selection,
                    &selection,
                    &proof,
                    &source,
                );
                let selected = json!({
                    "source": "step-xde", "status": "resolved",
                    "stability": "authored", "entities": []
                });
                let expected_diagnostic = json!({
                    "code": "GEOSPEC_SPATIAL_RELATIONSHIP_MISMATCH",
                    "severity": "error",
                    "message": "Spatial relationship 2 (ordinary) failed: Source measurement differs.",
                    "suggestion": "Retain this source suggestion.",
                    "spatial": {"center": [1.0, 2.0, 3.0]},
                    "details": {
                        "relationship": expected_copy,
                        "subject": selected, "target": selected,
                        "evidence": {"broadPhase": broad_phase, "final": final_record},
                        "measured": {"angleDegrees": 12.5},
                        "expected": {"angleDegrees": 15.0},
                        "witnesses": [{"point": [1.0, 2.0, 3.0]}]
                    }
                });
                let copy = value(&effective_relationship_copy(&relationship));
                let normalized = value(&normalized_relationship(&relationship));
                let actual_diagnostic = value(&diagnostic.to_json());
                let passed = copy == canonical(&expected_copy)
                    && normalized == canonical(&expected_normalized)
                    && actual_diagnostic == canonical(&expected_diagnostic)
                    && value(&relationship.raw) == canonical(&authored)
                    && value(&proof.final_evidence) == canonical(&final_record)
                    && source == source_before;
                outcomes.push(json!({
                    "kind": kind, "explicit": explicit, "authored": authored,
                    "copy": copy, "expectedCopy": expected_copy,
                    "normalized": normalized, "expectedNormalized": expected_normalized,
                    "diagnostic": actual_diagnostic, "expectedDiagnostic": expected_diagnostic,
                    "passed": passed
                }));
            }
        }
        for kind in [
            "clearance",
            "concentric",
            "coplanar",
            "containment",
            "insertion",
            "interference",
        ] {
            let authored = json!({"kind": kind, "subject": "left", "target": "right"});
            let relationship = parse_relationship(&decode(&authored), 0).unwrap();
            let copy = value(&effective_relationship_copy(&relationship));
            outcomes.push(json!({"kind": kind, "authored": authored, "copy": copy, "passed": copy == canonical(&authored)}));
        }
        let passed = outcomes.iter().all(|row| row["passed"] == true);
        let report =
            json!({"controlCount": outcomes.len(), "passed": passed, "outcomes": outcomes});
        if let Some(root) = std::env::var_os("GEOSPEC_EFFECTIVE_DEFAULTS_EVIDENCE_DIR") {
            std::fs::create_dir_all(&root).unwrap();
            std::fs::write(
                std::path::Path::new(&root).join("typed-projections.json"),
                serde_json::to_vec_pretty(&report).unwrap(),
            )
            .unwrap();
        }
        assert!(passed, "{report}");
    }
    #[test]
    fn folded_angles_ignore_orientation() {
        assert_eq!(folded_angle([1.0, 0.0, 0.0], [-1.0, 0.0, 0.0]), 0.0);
        assert_eq!(folded_angle([1.0, 0.0, 0.0], [0.0, 1.0, 0.0]), 90.0);
    }
    #[test]
    fn aabb_corners_have_source_order() {
        let corners = bounds_corners(Bounds {
            min: [0.0, 1.0, 2.0],
            max: [3.0, 4.0, 5.0],
        });
        assert_eq!(corners[0], [0.0, 1.0, 2.0]);
        assert_eq!(corners[7], [3.0, 4.0, 5.0]);
    }

    #[test]
    fn rotated_bore_fit_uses_trimmed_extent_instead_of_projected_aabb() {
        let bounds = Bounds {
            min: [-0.8, -0.6, -1.0],
            max: [6.8, 8.6, 1.0],
        };
        let extent = CylinderAxialExtent {
            origin: [0.0, 0.0, 0.0],
            axis: [0.6, 0.8, 0.0],
            radius: 1.0,
            from: 0.0,
            to: 10.0,
        };
        let subject = bore_endpoint(Ok(extent), bounds);
        let bore = qualified_bore_region(extent).unwrap();
        let fit = match measure_bore_fit(&subject, bore, 0.1) {
            Ok(Some(fit)) => fit,
            _ => panic!("qualified coaxial cylinders must produce a fit"),
        };
        assert_eq!(fit.engagement, 10.0);
        assert_ne!(fit.engagement, 298.0 / 25.0);
    }

    #[test]
    fn reversed_bore_axis_preserves_the_physical_interval() {
        let bounds = Bounds {
            min: [-0.8, -0.6, -1.0],
            max: [6.8, 8.6, 1.0],
        };
        let target = qualified_bore_region(CylinderAxialExtent {
            origin: [0.0, 0.0, 0.0],
            axis: [0.6, 0.8, 0.0],
            radius: 1.0,
            from: 0.0,
            to: 10.0,
        })
        .unwrap();
        let subject = bore_endpoint(
            Ok(CylinderAxialExtent {
                origin: [6.0, 8.0, 0.0],
                axis: [-0.6, -0.8, 0.0],
                radius: 1.0,
                from: 0.0,
                to: 10.0,
            }),
            bounds,
        );
        let fit = match measure_bore_fit(&subject, target, 0.1) {
            Ok(Some(fit)) => fit,
            _ => panic!("opposite axis orientation must preserve engagement"),
        };
        assert_eq!(fit.engagement, 10.0);
    }

    #[test]
    fn unavailable_trimmed_extent_is_noninvertible_backend_refusal() {
        let endpoint = bore_endpoint(
            Err(BackendError {
                kind: BackendErrorKind::Unsupported,
                message: "partial cylindrical band".into(),
            }),
            Bounds {
                min: [-1.0; 3],
                max: [1.0; 3],
            },
        );
        match bore_region(&endpoint) {
            Err(ProofError::Backend(error)) => {
                assert_eq!(error.kind, BackendErrorKind::Unsupported);
                assert_eq!(error.message, "partial cylindrical band");
            }
            _ => panic!("unsupported trim evidence must not become a predicate result"),
        }
    }
}
