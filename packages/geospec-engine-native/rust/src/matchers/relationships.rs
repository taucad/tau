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
            brep: true,
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
    if let Err(evaluation) = context.brep_facts() {
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
    let analytic_claim = prepared.relationships.iter().any(|r| is_nominal_analytic(r.kind) || r.kind == Kind::Interference);
    let analytic_caller = if analytic_claim { clearance_caller_reservation(prepared, context) } else { 0 };
    let band_claim = prepared.relationships.iter().any(|relationship| {
        relationship.kind == Kind::Clearance
            && relationship
                .resolved
                .as_ref()
                .is_some_and(|(subject, target)| {
                    subject
                        .entities
                        .iter()
                        .chain(&target.entities)
                        .any(|entity| matches!(entity.face, Some(BrepEntity::Face { .. })))
                })
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
                relationship.resolved.as_ref().and_then(|(a,b)| a.entities.len().checked_mul(b.entities.len()))
                    .and_then(|pairs| (pairs as u64).checked_add(1))
                    .and_then(|pairs| pairs.checked_mul(8 * continuous::BOX_INTERFERENCE_RESERVATION_BYTES as u64))
                    .unwrap_or(u64::MAX)
            } else { 0 };
            // Current arithmetic plus the proof, diagnostic projection (two
            // certificate copies), measured projection and encoding/copy growth.
            // Eight output slots bound these six live copies with Vec growth.
            // Prior rows and borrowed prepared/selection data are separate.
            if let Err(error) = context.check_continuous_output(clearance_byte_sum([
                analytic_caller, clearance_live_rows(&rows, &diagnostics),
                continuous::NOMINAL_ANALYTIC_RESERVATION_BYTES as u64,
                8 * continuous::NOMINAL_ANALYTIC_OUTPUT_BYTES as u64,
                box_pending,
            ])) { return error; }
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
            let projections = if is_cylindrical_band_proof(&proof) {
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
            analytic_caller, clearance_live_rows(&rows, &diagnostics),
            clearance_finish_reservation(prepared, context, &rows, &diagnostics),
        ])) { return error; }
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
    if is_cylindrical_band_proof(proof) {
        // The complete C1/C2/C3 certificate occurs once in the relationship
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
                        Json::string("geospec-nominal-cylindrical-band-clearance-v1"),
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

fn is_cylindrical_band_proof(proof: &Proof) -> bool {
    matches!(json_field_ref(&proof.final_evidence, "method"),
        Some(Json::String(method)) if method == "exact-nominal-cylindrical-band-clearance")
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
        let brep_entity = entity
            .face
            .or_else(|| entity.occurrence.map(BrepEntity::Occurrence));
        let Some(brep_entity) = brep_entity else {
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
        context.check_continuous_output(continuous::NOMINAL_ANALYTIC_RESERVATION_BYTES as u64)
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
    matches!(kind, Kind::Coaxial | Kind::Concentric | Kind::Coplanar | Kind::Parallel | Kind::Perpendicular | Kind::Angle)
}

fn prove_contact(
    relationship: &Relationship,
    subject: &[Endpoint],
    target: &[Endpoint],
    context: &mut EvaluationContext<'_>,
) -> Result<Proof, ProofError> {
    let tolerance = relationship.tolerance.unwrap_or(DEFAULT_LINEAR_TOLERANCE);
    let broad = broad_phase(subject, target, tolerance);
    if let Some(proof) = planar_contact_seating(relationship, subject, target, broad.clone())? {
        return Ok(proof);
    }
    let Some(extrema) = nearest_extrema(subject, target, context)? else {
        return Err(ProofError::Refused(relationship_unsupported(
            "The exact OCCT extrema computation for contact did not converge.",
            "Repair or re-export the geometry: an exact minimum-distance proof needs valid BRep faces on both endpoints.",
        )));
    };
    let final_evidence = final_json(
        "extrema",
        Json::object([("distance", Json::Number(extrema.distance))]),
        Json::object([("tolerance", Json::Number(tolerance))]),
        vec![
            point_witness(extrema.point_a),
            point_witness(extrema.point_b),
        ],
    );
    let positive = extrema.distance <= tolerance;
    let diagnostics = (!positive)
        .then(|| mismatch(
            format!(
                "Contact between '{}' and '{}' measured {:.4} mm, over the {tolerance} mm tolerance.",
                selector_label(&relationship.subject_raw),
                selector_label(&relationship.target_raw),
                extrema.distance
            ),
            "Close the joint, or widen the contact tolerance if the stand-off is intended.",
            Some(midpoint(extrema.point_a, extrema.point_b)),
        ))
        .into_iter()
        .collect();
    Ok(Proof {
        positive,
        broad_phase: broad,
        final_evidence,
        diagnostics,
    })
}

fn planar_contact_seating(
    relationship: &Relationship,
    subject: &[Endpoint],
    target: &[Endpoint],
    broad_phase: Json,
) -> Result<Option<Proof>, ProofError> {
    if subject.len() != 1 || target.len() != 1 {
        return Ok(None);
    }
    let a = &subject[0].facts;
    let b = &target[0].facts;
    if a.surface_type.as_deref() != Some("plane") || b.surface_type.as_deref() != Some("plane") {
        return Ok(None);
    }
    let (
        Some(a_normal),
        Some(b_normal),
        Some(centroid),
        Some(bounds),
        Some(area),
        Some(target_offset),
    ) = (a.normal, b.normal, a.centroid, a.bounds, a.area, b.offset)
    else {
        return Err(ProofError::Refused(relationship_unsupported(
            "A planar face contact needs a positive-area subject face with analytic centroid, bounds, normal and target-plane offset.",
            "Re-export the STEP artifact with complete analytic face facts before asserting face contact.",
        )));
    };
    if area <= 0.0 {
        return Err(ProofError::Refused(relationship_unsupported(
            "A planar face contact needs a positive-area subject face with analytic centroid, bounds, normal and target-plane offset.",
            "Re-export the STEP artifact with complete analytic face facts before asserting face contact.",
        )));
    }
    let subject_normal = unit(a_normal);
    let target_normal = unit(b_normal);
    let cosine = dot(subject_normal, target_normal).clamp(-1.0, 1.0);
    let normal_angle = relationship_degrees((-cosine).acos());
    let tangent = (1.0 - cosine * cosine).max(0.0).sqrt();
    let radius = bounds_corners(bounds)
        .into_iter()
        .map(|corner| distance(corner, centroid))
        .fold(0.0, f64::max);
    let centroid_separation = (dot(target_normal, centroid) - target_offset).abs();
    let max_separation_bound = centroid_separation + radius * tangent;
    let tolerance = relationship.tolerance.unwrap_or(DEFAULT_LINEAR_TOLERANCE);
    let angular = relationship
        .angular_tolerance_degrees
        .unwrap_or(DEFAULT_ANGULAR_TOLERANCE_DEGREES);
    if normal_angle <= angular
        && (centroid_separation > tolerance || max_separation_bound <= tolerance)
    {
        return Ok(None);
    }
    let final_evidence = final_json(
        "analytic",
        Json::object([
            ("distance", Json::Number(centroid_separation)),
            ("maxSeparationBound", Json::Number(max_separation_bound)),
            ("normalAngle", Json::Number(normal_angle)),
            ("faceArea", Json::Number(area)),
        ]),
        Json::object([
            ("tolerance", Json::Number(tolerance)),
            ("angularToleranceDegrees", Json::Number(angular)),
        ]),
        vec![
            plane_witness(
                subject_normal,
                a.offset.unwrap_or(dot(subject_normal, centroid)),
            ),
            plane_witness(target_normal, target_offset),
        ],
    );
    Ok(Some(Proof {
        positive: false,
        broad_phase,
        final_evidence,
        diagnostics: vec![mismatch(
            format!(
                "Planar contact between '{}' and '{}' has {:.4}° normal-opposition error and a {:.4} mm full-face separation bound, outside the {angular}° / {tolerance} mm seating band.",
                selector_label(&relationship.subject_raw), selector_label(&relationship.target_raw), normal_angle, max_separation_bound
            ),
            "Align the face normals and seat the full interface; a single near-zero edge witness is not face contact.",
            Some(centroid),
        )],
    }))
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
    if matches!(subject_endpoint.entity, BrepEntity::Face { .. })
        || matches!(target_endpoint.entity, BrepEntity::Face { .. })
    {
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

fn prove_coaxial(relationship: &Relationship, subject: &[Endpoint], target: &[Endpoint]) -> Result<Proof, ProofError> {
    prove_nominal_analytic(relationship, subject, target, continuous::AnalyticKind::Axis)
}

fn prove_coplanar(relationship: &Relationship, subject: &[Endpoint], target: &[Endpoint]) -> Result<Proof, ProofError> {
    prove_nominal_analytic(relationship, subject, target, continuous::AnalyticKind::Plane)
}

fn prove_direction_angle(relationship: &Relationship, subject: &[Endpoint], target: &[Endpoint]) -> Result<Proof, ProofError> {
    prove_nominal_analytic(relationship, subject, target, continuous::AnalyticKind::Direction)
}

fn admitted_analytic_support(endpoint: &Endpoint) -> Result<continuous::NominalSupport, ProofError> {
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
        ("kind", Json::string(match s.kind { continuous::SupportKind::Axis => "axis", continuous::SupportKind::Plane => "plane" })),
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
    let angular = relationship.angular_tolerance_degrees.unwrap_or(DEFAULT_ANGULAR_TOLERANCE_DEGREES);
    let expected_angle = if relationship.kind == Kind::Perpendicular { 90.0 }
        else if matches!(kind, continuous::AnalyticKind::Direction) { relationship.angle_degrees.unwrap_or(0.0) }
        else { 0.0 };
    let (positive, evidence) = match continuous::nominal_analytic(continuous::NominalAnalyticRequest {
        kind, subject: a, target: b, tolerance, angle_degrees: expected_angle, angular_tolerance_degrees: angular,
    }) {
        Outcome::Decided { positive, evidence } => (positive, evidence),
        Outcome::Unsupported { reason, .. } => {
            let mut refusal = relationship_unsupported(&reason.message,
                "Inspect the raw AP242 support, exact arithmetic domain and authored limits; unresolved evidence cannot be inverted.");
            if reason.kind == continuous::ContinuousErrorKind::InvalidInput {
                if let Evaluation::Refused { diagnostics } = &mut refusal {
                    for diagnostic in diagnostics { diagnostic.code = "GEOSPEC_INVALID_EVIDENCE".into(); }
                }
            }
            return Err(ProofError::Refused(refusal));
        }
    };
    // Legacy floating expressions remain diagnostic only. The exact predicate
    // above already decided; neither acos nor these display values select truth.
    let angle = folded_angle(a.direction, b.direction);
    let display = |value: f64| if value.is_finite() { Json::Number(value) } else { Json::Null };
    let mut measured = vec![("angle".into(), display(angle))];
    match kind {
        continuous::AnalyticKind::Axis => {
            let offset = subtract(b.origin,a.origin);
            let along = dot(offset,a.direction)/dot(a.direction,a.direction);
            measured.push(("radialOffset".into(),display(length(subtract(offset,scale(a.direction,along))))));
        }
        continuous::AnalyticKind::Plane => {
            measured.push(("offsetDelta".into(),evidence.distance_squared.as_ref().map_or(Json::Null, |d| display(d.display.sqrt()))));
        }
        continuous::AnalyticKind::Direction => measured.push(("deviation".into(),display((angle-expected_angle).abs()))),
    }
    measured.push(("displayRole".into(),Json::string("diagnostic-only")));
    let final_evidence = final_json(
        "exact-nominal-analytic-support",
        Json::Object(measured),
        Json::object([("tolerance",Json::Number(tolerance)),("angleDegrees",Json::Number(expected_angle)),("angularToleranceDegrees",Json::Number(angular))]),
        vec![Json::object([
            ("kind",Json::string("nominal-analytic-support")),
            ("value",evidence.to_json()),
            ("subject",nominal_support_json(a)),
            ("target",nominal_support_json(b)),
        ])],
    );
    let diagnostics = (!positive).then(|| mismatch(
        format!("Associated AP242 nominal supports of '{}' and '{}' are outside the declared inclusive relationship limits.",selector_label(&relationship.subject_raw),selector_label(&relationship.target_raw)),
        "Inspect the exact support certificate and authored limits; displayed angles and distances are diagnostic only.",
        Some(a.origin),
    )).into_iter().collect();
    Ok(Proof { positive, broad_phase:broad_phase(subject,target,tolerance), final_evidence, diagnostics })
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
    relationship: &Relationship, subject: &[Endpoint], target: &[Endpoint],
    context: &mut EvaluationContext<'_>,
) -> Result<Proof, ProofError> {
    let pair_count = subject.len().checked_mul(target.len()).ok_or_else(|| ProofError::Refused(box_interference_refusal()))?;
    let minimum = relationship.min_volume.unwrap_or(0.0);
    let maximum = relationship.max_volume.unwrap_or(0.0);
    let reservation = (pair_count as u64).checked_add(1)
        .and_then(|n| n.checked_mul(8 * continuous::BOX_INTERFERENCE_RESERVATION_BYTES as u64))
        .unwrap_or(u64::MAX);
    // Reserve all pair certificates and later projection/encoding copies before
    // allocating their Vec or invoking a predicate. No general OCCT fallback.
    context.check_continuous_output(reservation).map_err(ProofError::Refused)?;
    let mut pairs = Vec::with_capacity(pair_count);
    let mut best: Option<(bool, continuous::BoxInterferenceEvidence)> = None;
    let mut best_index = 0;
    for a in subject {
        let BrepEntity::Occurrence(a_id) = a.entity else { return Err(ProofError::Refused(box_interference_refusal())); };
        for b in target {
            let BrepEntity::Occurrence(b_id) = b.entity else { return Err(ProofError::Refused(box_interference_refusal())); };
            let a_domain = context.selected_continuous_domain(a_id).map_err(ProofError::Refused)?;
            let b_domain = context.selected_continuous_domain(b_id).map_err(ProofError::Refused)?;
            charge(context, 1)?;
            let (positive, evidence) = match continuous::box_interference(continuous::BoxInterferenceRequest {
                subject: &a_domain, target: &b_domain, minimum, maximum,
            }) {
                Outcome::Decided { positive, evidence } => (positive, evidence),
                Outcome::Unsupported { reason, .. } => return Err(ProofError::Refused(relationship_unsupported(
                    &reason.message, "Interference is qualified only for admitted complete nominal boxes; incomplete/non-box domains are noninvertible, without general Boolean fallback.",
                ))),
            };
            let greater = best.as_ref().is_none_or(|(_,current)| evidence.greater_than(current));
            pairs.push(evidence.to_json());
            if greater { best_index=pairs.len()-1; best=Some((positive,evidence)); }
        }
    }
    let (positive,best)=best.ok_or_else(||ProofError::Refused(box_interference_refusal()))?;
    let volume=best.volume.display;
    let centroid=best.center.as_ref().map(|c|c.each_ref().map(|v|v.display));
    let final_evidence=final_json(
        "exact-nominal-box-interference",
        Json::object([
            ("volume",Json::Number(volume)), ("exactVolume",best.volume.to_json()),
            ("criterion",Json::string("maximum-selected-pair-volume")),
            ("maximumPairIndex",Json::Number(best_index as f64)),
            ("checkedPairs",Json::Number(pair_count as f64)),
        ]),
        Json::object([("minVolume",Json::Number(minimum)),("maxVolume",Json::Number(maximum))]),
        vec![Json::object([("kind",Json::string("complete-box-intersections")),("pairs",Json::Array(pairs))])],
    );
    let diagnostics=(!positive).then(||mismatch(
        format!("Maximum admitted box-pair intersection volume {volume} mm³ is outside the inclusive {minimum}–{maximum} mm³ allowance."),
        "Inspect the exact volume and complete source-box certificates; no numerical epsilon is applied.",
        centroid,
    )).into_iter().collect();
    Ok(Proof {positive,broad_phase:broad_phase(subject,target,DEFAULT_LINEAR_TOLERANCE),final_evidence,diagnostics})
}

fn box_interference_refusal() -> Evaluation {
    relationship_unsupported(
        "Interference requires nonempty selections of connector-certified complete nominal box occurrences.",
        "Select complete admitted boxes; general solids and selected-face interference are not qualified by this exact-domain branch.",
    )
}

fn nearest_extrema(
    subject: &[Endpoint],
    target: &[Endpoint],
    context: &mut EvaluationContext<'_>,
) -> Result<Option<crate::backend::brep::Extrema>, ProofError> {
    let mut best = None;
    for a in subject {
        for b in target {
            charge(context, 1)?;
            let measured = brep(context)?.extrema(a.entity, b.entity)?;
            if best
                .as_ref()
                .is_none_or(|best: &crate::backend::brep::Extrema| {
                    measured.distance < best.distance
                })
            {
                best = Some(measured);
            }
        }
    }
    Ok(best)
}

fn charge(context: &mut EvaluationContext<'_>, units: u64) -> Result<(), ProofError> {
    context.budget().charge(units).map_err(|error| {
        ProofError::Budget(Evaluation::budget_exceeded(
            Capability::ToHaveSpatialRelationships,
            error,
        ))
    })
}

fn brep<'a>(context: &'a EvaluationContext<'_>) -> Result<&'a dyn BrepSubject, ProofError> {
    context.subject().brep.as_deref().ok_or_else(|| {
        ProofError::Refused(missing_brep(
            "exact BRep evidence with an AP242 assembly structure",
            BREP_SUGGESTION,
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
fn axis_of(facts: &EntityFacts) -> Option<([f64; 3], [f64; 3])> {
    Some((
        facts.axis_origin.or(facts.origin)?,
        facts.axis_direction.or(facts.z_axis)?,
    ))
}
fn direction_of(facts: &EntityFacts) -> Option<[f64; 3]> {
    facts.axis_direction.or(facts.normal).or(facts.z_axis)
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
fn distance(a: [f64; 3], b: [f64; 3]) -> f64 {
    length(subtract(a, b))
}
fn unit(a: [f64; 3]) -> [f64; 3] {
    let length = length(a);
    if length == 0.0 {
        [0.0; 3]
    } else {
        [a[0] / length, a[1] / length, a[2] / length]
    }
}
fn midpoint(a: [f64; 3], b: [f64; 3]) -> [f64; 3] {
    scale(add(a, b), 0.5)
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
fn axis_witness(origin: [f64; 3], direction: [f64; 3]) -> Json {
    let mut value = origin.to_vec();
    value.extend(direction);
    Json::object([
        ("kind", Json::string("axis")),
        (
            "value",
            Json::Array(value.into_iter().map(Json::Number).collect()),
        ),
    ])
}
fn plane_witness(normal: [f64; 3], offset: f64) -> Json {
    let mut value = normal.to_vec();
    value.push(offset);
    Json::object([
        ("kind", Json::string("plane")),
        (
            "value",
            Json::Array(value.into_iter().map(Json::Number).collect()),
        ),
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

    struct TrimControl(std::cell::Cell<u32>);

    impl BrepSubject for TrimControl {
        fn cylinder_axial_extent(
            &self,
            _: BrepEntity,
        ) -> Result<CylinderAxialExtent, BackendError> {
            self.0.set(self.0.get() + 1);
            Ok(CylinderAxialExtent {
                origin: [0.0; 3],
                axis: [0.0, 0.0, 1.0],
                radius: 1.0,
                from: 0.0,
                to: 10.0,
            })
        }
        fn facts(&self) -> Result<std::rc::Rc<crate::backend::brep::DocumentFacts>, BackendError> {
            unreachable!("only trim query belongs to this control")
        }
        fn faces(&self) -> Result<std::rc::Rc<[crate::backend::brep::LocatedFace]>, BackendError> {
            unreachable!("only trim query belongs to this control")
        }
        fn occurrence_faces(
            &self,
            _: u32,
        ) -> Result<std::rc::Rc<[crate::backend::brep::LocatedFace]>, BackendError> {
            unreachable!("only trim query belongs to this control")
        }
        fn occurrence_edges(
            &self,
            _: u32,
        ) -> Result<std::rc::Rc<[crate::backend::brep::EdgeFacts]>, BackendError> {
            unreachable!("only trim query belongs to this control")
        }
        fn validity(
            &self,
        ) -> Result<std::rc::Rc<crate::backend::brep::ValidityFacts>, BackendError> {
            unreachable!("only trim query belongs to this control")
        }
        fn extrema(
            &self,
            _: BrepEntity,
            _: BrepEntity,
        ) -> Result<crate::backend::brep::Extrema, BackendError> {
            unreachable!("only trim query belongs to this control")
        }
        fn classify_points(&self, _: u32, _: &[[f64; 3]]) -> Result<Vec<PointState>, BackendError> {
            unreachable!("only trim query belongs to this control")
        }
        fn common_volume(
            &self,
            _: u32,
            _: u32,
        ) -> Result<crate::backend::brep::CommonVolume, BackendError> {
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
        fn minimum_wall_thickness(
            &self,
            _: &crate::backend::brep::WallOptions,
        ) -> Result<crate::backend::brep::WallThicknessOutcome, BackendError> {
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

    #[test]
    fn required_trim_requests_charge_before_query_at_two_and_three_units() {
        let brep = TrimControl(std::cell::Cell::new(0));
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
                let before = brep.0.get();
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
                        brep.0.get() - before,
                        1,
                        "rejected demand never queries the connector"
                    );
                } else {
                    let region = right[0].as_ref().unwrap().as_ref().unwrap();
                    assert_eq!((region.from, region.to), (0.0, 10.0));
                    assert_eq!(brep.0.get() - before, 2);
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
