//! Pure, deterministic selector parsing and resolution over retained neutral facts.

use std::{
    cell::OnceCell,
    collections::{HashMap, HashSet},
};

use super::node24_hypot3;
use crate::{
    backend::{
        brep::{
            Bounds, BrepEntity, BrepSubject, DocumentRows, LocatedFace, OccurrenceFacts,
            PointState, SubshapeType, SurfaceFacts,
        },
        BackendError, BackendErrorKind,
    },
    budget::Budget,
    codec::{compare_utf16, Json},
    prepared::{finite, DEFAULT_ANGULAR_TOLERANCE_DEGREES, DEFAULT_LINEAR_TOLERANCE},
    protocol::{field, invalid_claim, object, optional_field, require_fields},
    result::{Diagnostic, Severity},
    ProtocolError,
};

const NEAR_MISS_LIMIT: usize = 3;

#[derive(Clone, Debug)]
pub(crate) enum TextPattern {
    Exact(String),
    Regex { pattern: String, flags: String },
}

/// Exact ECMAScript regular-expression service owned by the shared engine.
///
/// Each `test` call starts with `lastIndex = 0` and resets it afterwards, as
/// the TypeScript selector engine does. Implementations must preserve UTF-16,
/// `u`/non-`u`, sticky, lookaround, and backreference semantics.
pub(crate) trait EcmaRegexEngine {
    fn validate(&self, pattern: &str, flags: &str) -> Result<(), EcmaRegexError>;
    fn test(&self, pattern: &str, flags: &str, value: &str) -> Result<bool, EcmaRegexError>;
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) enum EcmaRegexError {
    InvalidSyntax(String),
    Unsupported(String),
}

impl EcmaRegexError {
    fn message(&self) -> &str {
        match self {
            Self::InvalidSyntax(message) | Self::Unsupported(message) => message,
        }
    }
}

impl PartialEq for TextPattern {
    fn eq(&self, other: &Self) -> bool {
        match (self, other) {
            (Self::Exact(left), Self::Exact(right)) => left == right,
            (
                Self::Regex {
                    pattern: left,
                    flags: left_flags,
                },
                Self::Regex {
                    pattern: right,
                    flags: right_flags,
                },
            ) => left == right && left_flags == right_flags,
            _ => false,
        }
    }
}

impl TextPattern {
    pub(crate) fn parse(value: &Json, label: &str) -> Result<Self, ProtocolError> {
        if let Json::String(value) = value {
            return Ok(Self::Exact(value.clone()));
        }
        let fields = object(value, label)?;
        require_fields(
            fields,
            &["type", "pattern", "flags"],
            &["type", "pattern", "flags"],
            label,
        )?;
        if !matches!(field(fields, "type")?, Json::String(value) if value == "regexp") {
            return invalid_claim(format!("{label}.type must be 'regexp'."));
        }
        let Json::String(pattern) = field(fields, "pattern")? else {
            return invalid_claim(format!("{label}.pattern must be a string."));
        };
        let Json::String(flags) = field(fields, "flags")? else {
            return invalid_claim(format!("{label}.flags must be a string."));
        };
        let parsed = Self::Regex {
            pattern: pattern.clone(),
            flags: flags.clone(),
        };
        Ok(parsed)
    }

    pub(crate) fn validate(&self, engine: &dyn EcmaRegexEngine) -> Result<(), EcmaRegexError> {
        let Self::Regex { pattern, flags } = self else {
            return Ok(());
        };
        engine.validate(pattern, flags)
    }

    pub(crate) fn matches(
        &self,
        value: &str,
        engine: Option<&dyn EcmaRegexEngine>,
    ) -> Result<bool, EcmaRegexError> {
        match self {
            Self::Exact(expected) => Ok(expected == value),
            Self::Regex { pattern, flags } => engine
                .ok_or_else(|| {
                    EcmaRegexError::Unsupported(
                        "Exact ECMAScript regular-expression evaluation is unavailable.".into(),
                    )
                })?
                .test(pattern, flags, value),
        }
    }

    pub(crate) fn to_json(&self) -> Json {
        match self {
            Self::Exact(value) => Json::String(value.clone()),
            Self::Regex { pattern, flags } => Json::object([
                ("type", Json::string("regexp")),
                ("pattern", Json::String(pattern.clone())),
                ("flags", Json::String(flags.clone())),
            ]),
        }
    }

    pub(crate) fn describe(&self) -> String {
        match self {
            Self::Exact(value) => value.clone(),
            Self::Regex { pattern, flags } => format!("/{pattern}/{flags}"),
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) enum Cardinality {
    One,
    Many,
    Exactly(usize),
    AtLeast(usize),
}

impl Cardinality {
    fn parse(value: Option<&Json>, default: Self) -> Result<Self, ProtocolError> {
        let Some(value) = value else {
            return Ok(default);
        };
        match value {
            Json::String(value) if value == "one" => Ok(Self::One),
            Json::String(value) if value == "many" => Ok(Self::Many),
            Json::Object(fields) => {
                require_fields(fields, &["exactly", "atLeast"], &[], "selector cardinality")?;
                if fields.len() != 1 {
                    return invalid_claim(
                        "Selector cardinality requires exactly one of exactly or atLeast.",
                    );
                }
                let (key, value) = &fields[0];
                let count = finite(value, key)?;
                if count < 0.0 || count.fract() != 0.0 || count > usize::MAX as f64 {
                    return invalid_claim(format!(
                        "Selector cardinality {key} must be a nonnegative integer."
                    ));
                }
                match key.as_str() {
                    "exactly" => Ok(Self::Exactly(count as usize)),
                    "atLeast" => Ok(Self::AtLeast(count as usize)),
                    _ => invalid_claim("Unknown selector cardinality."),
                }
            }
            _ => invalid_claim("Selector cardinality must be one, many, {exactly}, or {atLeast}."),
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) enum NumericRange {
    Near(f64),
    Range { min: Option<f64>, max: Option<f64> },
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct DirectionPredicate {
    pub direction: [f64; 3],
    pub angular_tolerance_degrees: Option<f64>,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub(crate) struct Query {
    pub surface_type: Option<String>,
    pub normal: Option<DirectionPredicate>,
    pub axis: Option<DirectionPredicate>,
    pub radius: Option<NumericRange>,
    pub area: Option<NumericRange>,
    pub offset: Option<NumericRange>,
    pub near: Option<[Option<f64>; 3]>,
    pub near_tolerance: Option<f64>,
    pub contains_point: Option<[f64; 3]>,
    pub nearest_to: Option<[f64; 3]>,
    pub hit_by_ray: Option<([f64; 3], [f64; 3])>,
    pub within: Option<Box<Selector>>,
    pub order_by: Option<String>,
    pub along: Option<[f64; 3]>,
    pub pick: Option<Pick>,
    pub all_of: Vec<Query>,
    pub any_of: Vec<Query>,
    pub not: Option<Box<Query>>,
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) enum Pick {
    First,
    Last,
    Index(i64),
}

#[derive(Clone, Debug, PartialEq)]
// Keep parsed queries inline: boxing each query adds a heap allocation to
// selector preparation and cloning without changing the selection work.
#[allow(clippy::large_enum_variant)]
pub(crate) enum Selector {
    Path(String),
    Occurrence {
        name: Option<TextPattern>,
        path: Option<TextPattern>,
        expect: Cardinality,
    },
    Query {
        kind: EntityType,
        of: Option<TextPattern>,
        query: Query,
        expect: Cardinality,
    },
    Named {
        kind: EntityType,
        name: String,
        of: Option<TextPattern>,
        expect: Cardinality,
    },
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum EntityType {
    Occurrence,
    Body,
    Face,
    Axis,
    Plane,
    Datum,
    Interface,
    Group,
}

impl EntityType {
    fn parse(value: &str) -> Option<Self> {
        Some(match value {
            "occurrence" => Self::Occurrence,
            "body" => Self::Body,
            "face" => Self::Face,
            "axis" => Self::Axis,
            "plane" => Self::Plane,
            "datum" => Self::Datum,
            "interface" => Self::Interface,
            "group" => Self::Group,
            _ => return None,
        })
    }
    fn as_str(self) -> &'static str {
        match self {
            Self::Occurrence => "occurrence",
            Self::Body => "body",
            Self::Face => "face",
            Self::Axis => "axis",
            Self::Plane => "plane",
            Self::Datum => "datum",
            Self::Interface => "interface",
            Self::Group => "group",
        }
    }
}

fn vector(value: &Json, label: &str) -> Result<[f64; 3], ProtocolError> {
    let Json::Array(values) = value else {
        return invalid_claim(format!("{label} must be a length-three array."));
    };
    if values.len() != 3 {
        return invalid_claim(format!("{label} must be a length-three array."));
    }
    Ok([
        finite(&values[0], label)?,
        finite(&values[1], label)?,
        finite(&values[2], label)?,
    ])
}

fn range(value: &Json, label: &str) -> Result<NumericRange, ProtocolError> {
    if matches!(value, Json::Number(_)) {
        return Ok(NumericRange::Near(finite(value, label)?));
    }
    let fields = object(value, label)?;
    require_fields(fields, &["min", "max"], &[], label)?;
    let min = optional_field(fields, "min")
        .map(|value| finite(value, label))
        .transpose()?;
    let max = optional_field(fields, "max")
        .map(|value| finite(value, label))
        .transpose()?;
    if min.is_some_and(|min| max.is_some_and(|max| min > max)) {
        return invalid_claim(format!("{label}.min must not exceed {label}.max."));
    }
    Ok(NumericRange::Range { min, max })
}

fn direction(value: &Json, label: &str) -> Result<DirectionPredicate, ProtocolError> {
    let fields = object(value, label)?;
    require_fields(
        fields,
        &["direction", "angularToleranceDegrees"],
        &["direction"],
        label,
    )?;
    let tolerance = optional_field(fields, "angularToleranceDegrees")
        .map(|value| finite(value, label))
        .transpose()?;
    if tolerance.is_some_and(|value| value < 0.0) {
        return invalid_claim(format!("{label} tolerance must be nonnegative."));
    }
    let direction = vector(field(fields, "direction")?, label)?;
    if normalize(direction).is_none() {
        return invalid_claim(format!("{label}.direction must be nonzero."));
    }
    Ok(DirectionPredicate {
        direction,
        angular_tolerance_degrees: tolerance,
    })
}

fn parse_query(value: &Json, depth: usize) -> Result<Query, ProtocolError> {
    if depth > 32 {
        return invalid_claim("Selector query nesting exceeds 32 levels.");
    }
    let fields = object(value, "selector query")?;
    let allowed = [
        "surfaceType",
        "normal",
        "axis",
        "radius",
        "area",
        "offset",
        "near",
        "containsPoint",
        "nearestTo",
        "hitByRay",
        "within",
        "orderBy",
        "along",
        "pick",
        "allOf",
        "anyOf",
        "not",
    ];
    require_fields(fields, &allowed, &[], "selector query")?;
    let mut query = Query {
        surface_type: optional_field(fields, "surfaceType")
            .map(|value| match value {
                Json::String(value)
                    if matches!(
                        value.as_str(),
                        "plane" | "cylinder" | "cone" | "sphere" | "torus" | "bspline" | "other"
                    ) =>
                {
                    Ok(value.clone())
                }
                Json::String(value) => {
                    invalid_claim(format!("Unknown selector surfaceType '{value}'."))
                }
                _ => invalid_claim("surfaceType must be a string."),
            })
            .transpose()?,
        normal: optional_field(fields, "normal")
            .map(|value| direction(value, "normal"))
            .transpose()?,
        axis: optional_field(fields, "axis")
            .map(|value| direction(value, "axis"))
            .transpose()?,
        radius: optional_field(fields, "radius")
            .map(|value| range(value, "radius"))
            .transpose()?,
        area: optional_field(fields, "area")
            .map(|value| range(value, "area"))
            .transpose()?,
        offset: optional_field(fields, "offset")
            .map(|value| range(value, "offset"))
            .transpose()?,
        ..Query::default()
    };
    if let Some(value) = optional_field(fields, "near") {
        let near = object(value, "near")?;
        require_fields(near, &["x", "y", "z", "tolerance"], &[], "near")?;
        query.near = Some(
            ["x", "y", "z"]
                .map(|key| {
                    optional_field(near, key)
                        .map(|value| finite(value, key))
                        .transpose()
                })
                .into_iter()
                .collect::<Result<Vec<_>, _>>()?
                .try_into()
                .unwrap(),
        );
        query.near_tolerance = optional_field(near, "tolerance")
            .map(|value| finite(value, "near.tolerance"))
            .transpose()?;
        if query.near_tolerance.is_some_and(|value| value < 0.0) {
            return invalid_claim("near.tolerance must be nonnegative.");
        }
    }
    query.contains_point = optional_field(fields, "containsPoint")
        .map(|value| vector(value, "containsPoint"))
        .transpose()?;
    query.nearest_to = optional_field(fields, "nearestTo")
        .map(|value| vector(value, "nearestTo"))
        .transpose()?;
    if let Some(value) = optional_field(fields, "hitByRay") {
        let ray = object(value, "hitByRay")?;
        require_fields(
            ray,
            &["origin", "direction"],
            &["origin", "direction"],
            "hitByRay",
        )?;
        let origin = vector(field(ray, "origin")?, "hitByRay.origin")?;
        let direction = vector(field(ray, "direction")?, "hitByRay.direction")?;
        if normalize(direction).is_none() {
            return invalid_claim("hitByRay.direction must be nonzero.");
        }
        query.hit_by_ray = Some((origin, direction));
    }
    query.within = optional_field(fields, "within")
        .map(Selector::parse)
        .transpose()?
        .map(Box::new);
    query.order_by = optional_field(fields, "orderBy")
        .map(|value| match value {
            Json::String(value) if matches!(value.as_str(), "area" | "radius" | "offsetAlong") => {
                Ok(value.clone())
            }
            Json::String(value) => invalid_claim(format!("Unknown orderBy value '{value}'.")),
            _ => invalid_claim("orderBy must be a string."),
        })
        .transpose()?;
    query.along = optional_field(fields, "along")
        .map(|value| vector(value, "along"))
        .transpose()?;
    if query
        .along
        .is_some_and(|direction| normalize(direction).is_none())
    {
        return invalid_claim("along must be nonzero.");
    }
    query.pick = optional_field(fields, "pick")
        .map(|value| match value {
            Json::String(value) if value == "first" => Ok(Pick::First),
            Json::String(value) if value == "last" => Ok(Pick::Last),
            Json::Number(value)
                if value.is_finite()
                    && value.fract() == 0.0
                    && *value >= i64::MIN as f64
                    && *value <= i64::MAX as f64 =>
            {
                Ok(Pick::Index(*value as i64))
            }
            _ => invalid_claim("pick must be first, last, or an integer."),
        })
        .transpose()?;
    for (key, target) in [("allOf", &mut query.all_of), ("anyOf", &mut query.any_of)] {
        if let Some(Json::Array(values)) = optional_field(fields, key) {
            for value in values {
                target.push(parse_query(value, depth + 1)?);
            }
        } else if optional_field(fields, key).is_some() {
            return invalid_claim(format!("{key} must be an array."));
        }
    }
    query.not = optional_field(fields, "not")
        .map(|value| parse_query(value, depth + 1))
        .transpose()?
        .map(Box::new);
    Ok(query)
}

impl Selector {
    pub(crate) fn parse(value: &Json) -> Result<Self, ProtocolError> {
        if let Json::String(path) = value {
            return Ok(Self::Path(path.clone()));
        }
        let fields = object(value, "selector")?;
        let Json::String(kind_name) = field(fields, "kind")? else {
            return invalid_claim("selector.kind must be a string.");
        };
        let Some(kind) = EntityType::parse(kind_name) else {
            return invalid_claim(format!("Unknown selector kind '{kind_name}'."));
        };
        match kind {
            EntityType::Occurrence => {
                require_fields(
                    fields,
                    &["kind", "name", "path", "expect"],
                    &["kind"],
                    "occurrence selector",
                )?;
                Ok(Self::Occurrence {
                    name: optional_field(fields, "name")
                        .map(|value| TextPattern::parse(value, "selector.name"))
                        .transpose()?,
                    path: optional_field(fields, "path")
                        .map(|value| TextPattern::parse(value, "selector.path"))
                        .transpose()?,
                    expect: Cardinality::parse(optional_field(fields, "expect"), Cardinality::One)?,
                })
            }
            EntityType::Body | EntityType::Face | EntityType::Axis | EntityType::Plane => {
                require_fields(
                    fields,
                    &["kind", "of", "query", "expect"],
                    &["kind"],
                    "query selector",
                )?;
                let query = optional_field(fields, "query")
                    .map(|value| parse_query(value, 0))
                    .transpose()?
                    .unwrap_or_default();
                validate_query_kind(kind, &query)?;
                Ok(Self::Query {
                    kind,
                    of: optional_field(fields, "of")
                        .map(|value| TextPattern::parse(value, "selector.of"))
                        .transpose()?,
                    query,
                    expect: Cardinality::parse(optional_field(fields, "expect"), Cardinality::One)?,
                })
            }
            EntityType::Datum | EntityType::Interface | EntityType::Group => {
                require_fields(
                    fields,
                    &["kind", "name", "of", "expect"],
                    &["kind", "name"],
                    "named selector",
                )?;
                let Json::String(name) = field(fields, "name")? else {
                    return invalid_claim("selector.name must be a string.");
                };
                Ok(Self::Named {
                    kind,
                    name: name.clone(),
                    of: optional_field(fields, "of")
                        .map(|value| TextPattern::parse(value, "selector.of"))
                        .transpose()?,
                    expect: Cardinality::parse(
                        optional_field(fields, "expect"),
                        if kind == EntityType::Group {
                            Cardinality::Many
                        } else {
                            Cardinality::One
                        },
                    )?,
                })
            }
        }
    }

    pub(crate) fn validate_regexes(
        &self,
        engine: &dyn EcmaRegexEngine,
    ) -> Result<(), EcmaRegexError> {
        match self {
            Self::Path(_) => Ok(()),
            Self::Occurrence { name, path, .. } => {
                if let Some(value) = name {
                    value.validate(engine)?;
                }
                if let Some(value) = path {
                    value.validate(engine)?;
                }
                Ok(())
            }
            Self::Query { of, query, .. } => {
                if let Some(value) = of {
                    value.validate(engine)?;
                }
                validate_query_regexes(query, engine)
            }
            Self::Named { of, .. } => match of {
                Some(value) => value.validate(engine),
                None => Ok(()),
            },
        }
    }
}

fn validate_query_regexes(
    query: &Query,
    engine: &dyn EcmaRegexEngine,
) -> Result<(), EcmaRegexError> {
    if let Some(within) = &query.within {
        within.validate_regexes(engine)?;
    }
    for sub in query.all_of.iter().chain(&query.any_of) {
        validate_query_regexes(sub, engine)?;
    }
    if let Some(sub) = &query.not {
        validate_query_regexes(sub, engine)?;
    }
    Ok(())
}

fn validate_query_kind(kind: EntityType, query: &Query) -> Result<(), ProtocolError> {
    let unsupported = match kind {
        EntityType::Face => None,
        EntityType::Axis if query.surface_type.is_some() => Some("surfaceType"),
        EntityType::Axis if query.normal.is_some() => Some("normal"),
        EntityType::Axis if query.area.is_some() => Some("area"),
        EntityType::Axis if query.offset.is_some() => Some("offset"),
        EntityType::Axis if query.hit_by_ray.is_some() => Some("hitByRay"),
        EntityType::Plane if query.surface_type.is_some() => Some("surfaceType"),
        EntityType::Plane if query.axis.is_some() => Some("axis"),
        EntityType::Plane if query.radius.is_some() => Some("radius"),
        EntityType::Plane if query.hit_by_ray.is_some() => Some("hitByRay"),
        EntityType::Body if query.surface_type.is_some() => Some("surfaceType"),
        EntityType::Body if query.normal.is_some() => Some("normal"),
        EntityType::Body if query.axis.is_some() => Some("axis"),
        EntityType::Body if query.radius.is_some() => Some("radius"),
        EntityType::Body if query.offset.is_some() => Some("offset"),
        EntityType::Body if query.contains_point.is_some() => Some("containsPoint"),
        EntityType::Body if query.hit_by_ray.is_some() => Some("hitByRay"),
        _ => None,
    };
    if let Some(field) = unsupported {
        return invalid_claim(format!(
            "{field} is not valid for a {} selector query.",
            kind.as_str()
        ));
    }
    let valid_order = matches!(
        (kind, query.order_by.as_deref()),
        (_, None)
            | (EntityType::Face, Some("area" | "radius" | "offsetAlong"))
            | (EntityType::Axis, Some("radius" | "offsetAlong"))
            | (
                EntityType::Plane | EntityType::Body,
                Some("area" | "offsetAlong")
            )
    );
    if !valid_order {
        return invalid_claim(format!(
            "orderBy '{}' is not valid for a {} selector query.",
            query.order_by.as_deref().unwrap_or_default(),
            kind.as_str()
        ));
    }
    if query.along.is_some() && query.order_by.as_deref() != Some("offsetAlong") {
        return invalid_claim("along requires orderBy 'offsetAlong'.");
    }
    for sub in query.all_of.iter().chain(&query.any_of) {
        validate_query_kind(kind, sub)?;
    }
    if let Some(sub) = &query.not {
        validate_query_kind(kind, sub)?;
    }
    Ok(())
}

#[derive(Clone, Debug, Default, PartialEq)]
pub(crate) struct EntityFacts {
    /// Typed raw support and address from the same placed face inventory.
    /// Never reconstructed from a rounded plane offset or a selector label.
    pub nominal_support: Option<super::continuous::NominalSupport>,
    pub surface_type: Option<String>,
    pub normal: Option<[f64; 3]>,
    pub offset: Option<f64>,
    pub axis_origin: Option<[f64; 3]>,
    pub axis_direction: Option<[f64; 3]>,
    pub radius: Option<f64>,
    pub area: Option<f64>,
    pub centroid: Option<[f64; 3]>,
    pub bounds: Option<Bounds>,
    pub origin: Option<[f64; 3]>,
    pub x_axis: Option<[f64; 3]>,
    pub z_axis: Option<[f64; 3]>,
    pub transform: Option<[f64; 12]>,
    pub product_name: Option<String>,
    pub face_index: Option<u32>,
    pub member_count: Option<usize>,
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct Entity {
    pub id: String,
    pub entity_type: EntityType,
    pub occurrence_path: Option<String>,
    pub occurrence: Option<u32>,
    pub face: Option<BrepEntity>,
    pub facts: EntityFacts,
    pub topology_ref: Option<String>,
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct OccurrenceRow {
    pub path: String,
    pub product_name: String,
    pub instance_name: Option<String>,
    pub transform: [f64; 12],
    pub occurrence: u32,
    pub ordinal_path: Vec<u32>,
    pub bounds: Option<Bounds>,
    /// The enclosing assembly occurrence; `of` and `within` scope descendants.
    pub parent: Option<u32>,
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct NamedRow {
    pub full_name: String,
    pub name: String,
    pub occurrence_path: String,
    pub entity: Entity,
    pub dangling: bool,
    pub dangling_face_index: Option<u32>,
    pub members: Vec<Entity>,
    pub member_indices: Vec<u32>,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub(crate) struct SelectorIndex {
    pub occurrences: Vec<OccurrenceRow>,
    pub faces: Vec<Entity>,
    pub bodies: Vec<Entity>,
    pub interfaces: Vec<NamedRow>,
    pub datums: Vec<NamedRow>,
    pub groups: Vec<NamedRow>,
    pub diagnostics: Vec<Diagnostic>,
    /// Axis and plane query pools derived from `faces` on their first query
    /// (C11); `faces` must not change after either is built.
    pub axes: OnceCell<Vec<Entity>>,
    pub planes: OnceCell<Vec<Entity>>,
}

#[cfg(test)]
pub(crate) fn build_index(
    facts: &crate::backend::brep::DocumentFacts,
    brep: &dyn BrepSubject,
) -> Result<SelectorIndex, BackendError> {
    let whole = brep.faces()?;
    // Each occurrence re-addresses the probe's whole faces.
    let occurrences = (0..facts.occurrences.len() as u32)
        .map(|occurrence| {
            whole
                .iter()
                .cloned()
                .map(|mut face| {
                    face.entity = BrepEntity::Face {
                        occurrence,
                        face: face.facts.index,
                    };
                    face
                })
                .collect::<Vec<_>>()
                .into()
        })
        .collect::<Vec<_>>();
    let rows = DocumentRows {
        subshapes: facts.subshapes.clone(),
        datum_placements: facts.datum_placements.clone(),
        semantic_datums: facts.semantic_datums.clone(),
    };
    build_report_index(
        &facts.occurrences,
        Some(facts.shape.bounds),
        &rows,
        &whole,
        &occurrences,
    )
}

/// The selector index from the facts facets (F8): source occurrences with
/// bounds, report face tables with measures, document rows and, for an
/// occurrence-free document only, the whole-shape report bounds.
pub(crate) fn build_report_index(
    source_occurrences: &[OccurrenceFacts],
    whole_bounds: Option<Bounds>,
    rows: &DocumentRows,
    whole_faces: &[LocatedFace],
    occurrence_faces: &[std::rc::Rc<[LocatedFace]>],
) -> Result<SelectorIndex, BackendError> {
    if occurrence_faces.len() != source_occurrences.len() {
        return Err(BackendError {
            kind: BackendErrorKind::ComputationFailed,
            message: "Report occurrence face mapping is incomplete.".into(),
        });
    }
    let occurrences: Vec<_> = source_occurrences
        .iter()
        .enumerate()
        .map(|(occurrence, row)| OccurrenceRow {
            path: row.path.clone(),
            product_name: row.product_name.clone(),
            instance_name: row.instance_name.clone(),
            transform: row.placement,
            occurrence: occurrence as u32,
            ordinal_path: row.ordinal_path.clone(),
            bounds: Some(row.bounds),
            parent: row.parent,
        })
        .collect();
    // C2 (ruling 6): a parent is structure, not a body; its leaves own the faces.
    let mut parents = vec![false; occurrences.len()];
    for row in &occurrences {
        if let Some(slot) = row
            .parent
            .and_then(|parent| parents.get_mut(parent as usize))
        {
            *slot = true;
        }
    }
    let mut faces = Vec::new();
    let mut bodies = Vec::new();
    if occurrences.is_empty() {
        let mut located = whole_faces.to_vec();
        located.sort_by_key(|face| face.facts.index);
        faces.extend(located.iter().map(whole_face_entity));
        let area: f64 = faces.iter().filter_map(|entity| entity.facts.area).sum();
        let centroid = (area > 0.0).then(|| {
            std::array::from_fn(|axis| {
                faces
                    .iter()
                    .filter_map(|entity| {
                        Some(entity.facts.centroid?[axis] * entity.facts.area? / area)
                    })
                    .sum()
            })
        });
        bodies.push(Entity {
            id: "body:whole".into(),
            entity_type: EntityType::Body,
            occurrence_path: None,
            occurrence: None,
            face: Some(BrepEntity::Whole),
            facts: EntityFacts {
                area: Some(area),
                centroid,
                bounds: whole_bounds,
                ..EntityFacts::default()
            },
            topology_ref: None,
        });
    }
    for row in &occurrences {
        if parents[row.occurrence as usize] {
            continue;
        }
        let mut located = occurrence_faces[row.occurrence as usize].to_vec();
        located.sort_by_key(|face| face.facts.index);
        let start = faces.len();
        faces.extend(
            located
                .iter()
                .map(|face| face_entity(&row.path, &row.ordinal_path, face)),
        );
        let occurrence_faces = &faces[start..];
        let area: f64 = occurrence_faces
            .iter()
            .filter_map(|entity| entity.facts.area)
            .sum();
        let centroid = (area > 0.0).then(|| {
            std::array::from_fn(|axis| {
                occurrence_faces
                    .iter()
                    .filter_map(|entity| {
                        Some(entity.facts.centroid?[axis] * entity.facts.area? / area)
                    })
                    .sum()
            })
        });
        bodies.push(Entity {
            id: format!("body:{}", row.path),
            entity_type: EntityType::Body,
            occurrence_path: Some(row.path.clone()),
            occurrence: Some(row.occurrence),
            face: None,
            facts: EntityFacts {
                area: Some(area),
                centroid,
                bounds: row.bounds,
                ..EntityFacts::default()
            },
            topology_ref: None,
        });
    }

    let mut diagnostics = Vec::new();
    let mut interfaces = Vec::new();
    for row in &rows.subshapes {
        if row.shape_type != SubshapeType::Face {
            diagnostics.push(informational_diagnostic(
                "GEOSPEC_SELECTOR_UNSUPPORTED_EVIDENCE",
                format!(
                    "Subshape name '{}' on '{}' has shape type '{}'; V1 interfaces are faces only.",
                    row.name,
                    row.occurrence_path,
                    subshape_name(row.shape_type)
                ),
                "Edge/vertex/solid interfaces are deferred; author a face, axis, or datum interface instead.",
                Severity::Info,
            ));
            continue;
        }
        let full_name = compose_name(&row.occurrence_path, &row.name);
        let face = row.face_index.and_then(|face_index| {
            faces.iter().find(|entity| {
                entity.occurrence_path.as_deref() == Some(row.occurrence_path.as_str())
                    && entity.facts.face_index == Some(face_index)
            })
        });
        let dangling = face.is_none();
        if dangling {
            diagnostics.push(informational_diagnostic(
                "GEOSPEC_SELECTOR_UNSUPPORTED_EVIDENCE",
                format!(
                    "Authored interface '{full_name}' names faceIndex {}, which no longer exists in the geometry.",
                    row.face_index.map_or_else(|| "unknown".into(), |value| value.to_string())
                ),
                "Re-export the artifact so authored interface names are re-evaluated against the current shape.",
                Severity::Warning,
            ));
        }
        let mut entity = face.cloned().unwrap_or_else(|| Entity {
            id: format!("interface:{full_name}"),
            entity_type: EntityType::Interface,
            occurrence_path: Some(row.occurrence_path.clone()),
            occurrence: row.occurrence,
            face: None,
            facts: EntityFacts {
                face_index: row.face_index,
                ..EntityFacts::default()
            },
            topology_ref: None,
        });
        // Authored interface identity is independent of its underlying face
        // address (selector/resolve.ts interfaceEntity).
        entity.id = format!("interface:{full_name}");
        interfaces.push(NamedRow {
            full_name,
            name: row.name.clone(),
            occurrence_path: row.occurrence_path.clone(),
            entity,
            dangling,
            dangling_face_index: dangling.then_some(row.face_index).flatten(),
            members: Vec::new(),
            member_indices: Vec::new(),
        });
    }

    let mut datums = Vec::new();
    for row in &rows.datum_placements {
        let full_name = compose_name(&row.occurrence_path, &row.name);
        datums.push(named_datum(
            full_name,
            row.name.clone(),
            row.occurrence_path.clone(),
            row.occurrence,
            row.origin,
            row.x_axis,
            row.z_axis,
        ));
    }
    for row in &rows.semantic_datums {
        let full_name = compose_name(&row.occurrence_path, &row.label);
        let face = row.face_indices.first().and_then(|index| {
            faces.iter().find(|entity| {
                entity.occurrence_path.as_deref() == Some(row.occurrence_path.as_str())
                    && entity.facts.face_index == Some(*index)
            })
        });
        let frame = face.and_then(semantic_frame);
        if let Some((origin, x_axis, z_axis)) = frame {
            datums.push(named_datum(
                full_name,
                row.label.clone(),
                row.occurrence_path.clone(),
                row.occurrence,
                origin,
                x_axis,
                z_axis,
            ));
        } else {
            diagnostics.push(informational_diagnostic(
                "GEOSPEC_SELECTOR_UNSUPPORTED_EVIDENCE",
                format!(
                    "Semantic datum '{full_name}' has no analytic face attachment to derive a frame from."
                ),
                "Point/line datum targets and non-analytic datum features carry no frame; match on face or interface evidence instead.",
                Severity::Info,
            ));
        }
    }

    let groups = build_groups(&interfaces);
    Ok(SelectorIndex {
        occurrences,
        faces,
        bodies,
        interfaces,
        datums,
        groups,
        diagnostics,
        ..SelectorIndex::default()
    })
}

fn subshape_name(value: SubshapeType) -> &'static str {
    match value {
        SubshapeType::Face => "face",
        SubshapeType::Edge => "edge",
        SubshapeType::Vertex => "vertex",
        SubshapeType::Solid => "solid",
    }
}

fn informational_diagnostic(
    code: &str,
    message: String,
    suggestion: &str,
    severity: Severity,
) -> Diagnostic {
    let mut diagnostic = Diagnostic::error(code, message);
    diagnostic.severity = severity;
    diagnostic.suggestion = Some(suggestion.into());
    diagnostic
}

fn compose_name(occurrence_path: &str, name: &str) -> String {
    if occurrence_path.is_empty() {
        name.into()
    } else {
        format!("{occurrence_path}.{name}")
    }
}

fn named_datum(
    full_name: String,
    name: String,
    occurrence_path: String,
    occurrence: Option<u32>,
    origin: [f64; 3],
    x_axis: [f64; 3],
    z_axis: [f64; 3],
) -> NamedRow {
    NamedRow {
        entity: Entity {
            id: format!("datum:{full_name}"),
            entity_type: EntityType::Datum,
            occurrence_path: Some(occurrence_path.clone()),
            occurrence,
            face: None,
            facts: EntityFacts {
                origin: Some(origin),
                x_axis: Some(x_axis),
                z_axis: Some(z_axis),
                ..EntityFacts::default()
            },
            topology_ref: None,
        },
        full_name,
        name,
        occurrence_path,
        dangling: false,
        dangling_face_index: None,
        members: Vec::new(),
        member_indices: Vec::new(),
    }
}

fn semantic_frame(entity: &Entity) -> Option<([f64; 3], [f64; 3], [f64; 3])> {
    match entity.facts.surface_type.as_deref() {
        Some("plane") => {
            let z_axis = entity.facts.normal?;
            Some((
                entity.facts.centroid?,
                complete_frame_axis_x(z_axis)?,
                z_axis,
            ))
        }
        Some("cylinder" | "cone") => {
            let z_axis = entity.facts.axis_direction?;
            Some((
                entity.facts.axis_origin?,
                complete_frame_axis_x(z_axis)?,
                z_axis,
            ))
        }
        _ => None,
    }
}

fn complete_frame_axis_x(z_axis: [f64; 3]) -> Option<[f64; 3]> {
    let mut best = [1.0, 0.0, 0.0];
    let mut alignment = f64::INFINITY;
    for candidate in [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]] {
        let value = dot(candidate, z_axis).abs();
        if value < alignment - 1e-12 {
            alignment = value;
            best = candidate;
        }
    }
    let projection = dot(best, z_axis);
    let projected = [
        best[0] - projection * z_axis[0],
        best[1] - projection * z_axis[1],
        best[2] - projection * z_axis[2],
    ];
    let magnitude = length(projected);
    // index-builder.ts receives unit z and divides the projected components.
    Some(if magnitude > 1e-12 {
        projected.map(|coordinate| coordinate / magnitude)
    } else {
        [1.0, 0.0, 0.0]
    })
}

fn group_member(name: &str) -> Option<(&str, u32)> {
    let open = name.rfind('[')?;
    if !name.ends_with(']') {
        return None;
    }
    let prefix = &name[..open];
    let index = name[open + 1..name.len() - 1].parse::<u32>().ok()?;
    (!prefix.is_empty() && index > 0).then_some((prefix, index))
}

fn build_groups(interfaces: &[NamedRow]) -> Vec<NamedRow> {
    type IndexedGroup = (String, String, String, Vec<(u32, Entity)>);
    let mut groups: Vec<IndexedGroup> = Vec::new();
    for row in interfaces {
        let Some((prefix, index)) = group_member(&row.name) else {
            continue;
        };
        if let Some((_, _, _, members)) = groups
            .iter_mut()
            .find(|(_, name, path, _)| name == prefix && path == &row.occurrence_path)
        {
            members.push((index, row.entity.clone()));
        } else {
            groups.push((
                compose_name(&row.occurrence_path, prefix),
                prefix.into(),
                row.occurrence_path.clone(),
                vec![(index, row.entity.clone())],
            ));
        }
    }
    let mut rows: Vec<_> = groups
        .into_iter()
        .map(|(full_name, name, occurrence_path, mut members)| {
            members.sort_by_key(|(index, _)| *index);
            let member_indices = members.iter().map(|(index, _)| *index).collect();
            let members: Vec<_> = members.into_iter().map(|(_, entity)| entity).collect();
            NamedRow {
                entity: Entity {
                    id: format!("group:{full_name}"),
                    entity_type: EntityType::Group,
                    occurrence_path: Some(occurrence_path.clone()),
                    occurrence: members.first().and_then(|entity| entity.occurrence),
                    face: None,
                    facts: EntityFacts {
                        member_count: Some(members.len()),
                        ..EntityFacts::default()
                    },
                    topology_ref: None,
                },
                full_name,
                name,
                occurrence_path,
                dangling: false,
                dangling_face_index: None,
                members,
                member_indices,
            }
        })
        .collect();
    rows.sort_by(|left, right| compare_utf16(&left.full_name, &right.full_name));
    rows
}

pub(crate) fn face_entity(path: &str, ordinal: &[u32], face: &LocatedFace) -> Entity {
    let (surface_type, normal, axis_origin, axis_direction, radius, offset) =
        match &face.facts.surface {
            SurfaceFacts::Plane { origin, normal } => {
                let normal = if face.reversed {
                    [-normal[0], -normal[1], -normal[2]]
                } else {
                    *normal
                };
                (
                    "plane",
                    Some(normal),
                    None,
                    None,
                    None,
                    Some(dot(normal, *origin)),
                )
            }
            SurfaceFacts::Cylinder {
                origin,
                axis,
                radius,
            } => (
                "cylinder",
                None,
                Some(*origin),
                Some(*axis),
                Some(*radius),
                None,
            ),
            SurfaceFacts::Cone {
                origin,
                axis,
                reference_radius,
                ..
            } => (
                "cone",
                None,
                Some(*origin),
                Some(*axis),
                Some(*reference_radius),
                None,
            ),
            SurfaceFacts::Sphere { .. } => ("sphere", None, None, None, None, None),
            SurfaceFacts::Torus { .. } => ("torus", None, None, None, None, None),
            SurfaceFacts::Bspline { .. } => ("bspline", None, None, None, None, None),
            _ => ("other", None, None, None, None, None),
        };
    Entity {
        id: format!("face:{path}#{}", face.facts.index),
        entity_type: EntityType::Face,
        occurrence_path: Some(path.into()),
        occurrence: match face.entity {
            BrepEntity::Face { occurrence, .. } => Some(occurrence),
            _ => None,
        },
        face: Some(face.entity),
        topology_ref: Some(format!(
            "#o{}.f{}",
            ordinal
                .iter()
                .map(u32::to_string)
                .collect::<Vec<_>>()
                .join("."),
            face.facts.index
        )),
        facts: EntityFacts {
            nominal_support: match &face.facts.surface {
                SurfaceFacts::Plane { origin, normal } => Some(super::continuous::NominalSupport {
                    entity: face.entity,
                    public_ordinal: face.facts.index,
                    kind: super::continuous::SupportKind::Plane,
                    origin: *origin,
                    direction: if face.reversed {
                        normal.map(|v| -v)
                    } else {
                        *normal
                    },
                }),
                SurfaceFacts::Cylinder { origin, axis, .. }
                | SurfaceFacts::Cone { origin, axis, .. } => {
                    Some(super::continuous::NominalSupport {
                        entity: face.entity,
                        public_ordinal: face.facts.index,
                        kind: super::continuous::SupportKind::Axis,
                        origin: *origin,
                        direction: *axis,
                    })
                }
                _ => None,
            },
            surface_type: Some(surface_type.into()),
            normal,
            offset,
            axis_origin,
            axis_direction,
            radius,
            area: Some(face.facts.area),
            centroid: Some(face.facts.center_of_mass),
            bounds: Some(face.bounds),
            face_index: Some(face.facts.index),
            ..EntityFacts::default()
        },
    }
}

fn whole_face_entity(face: &LocatedFace) -> Entity {
    let mut entity = face_entity("whole", &[], face);
    entity.id = format!("face:whole#{}", face.facts.index);
    entity.occurrence_path = None;
    entity.occurrence = None;
    entity.topology_ref = None;
    entity
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum SelectionStatus {
    Resolved,
    Unmatched,
    Ambiguous,
    Unsupported,
}
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum Stability {
    Authored,
    DerivedQuery,
    DerivedProbe,
    DerivedOrdinal,
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct Selection {
    pub status: SelectionStatus,
    pub entities: Vec<Entity>,
    pub expected: Cardinality,
    pub stability: Stability,
    pub candidates: Vec<Entity>,
    pub diagnostics: Vec<Diagnostic>,
}

fn dot(a: [f64; 3], b: [f64; 3]) -> f64 {
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}
fn subtract(a: [f64; 3], b: [f64; 3]) -> [f64; 3] {
    [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}
fn length(a: [f64; 3]) -> f64 {
    node24_hypot3(a)
}
fn normalize(a: [f64; 3]) -> Option<[f64; 3]> {
    let n = length(a);
    (n > 0.0).then(|| {
        let reciprocal = 1.0 / n;
        a.map(|coordinate| coordinate * reciprocal)
    })
}
fn angle(a: [f64; 3], b: [f64; 3], axis: bool) -> Option<f64> {
    let value =
        dot(normalize(a)?, normalize(b)?).clamp(-1.0, 1.0).acos() * (180.0 / std::f64::consts::PI);
    Some(if axis {
        value.min(180.0 - value)
    } else {
        value
    })
}
fn distance(a: [f64; 3], b: [f64; 3]) -> f64 {
    length(subtract(a, b))
}
fn range_matches(range: &NumericRange, value: Option<f64>) -> bool {
    let Some(value) = value else { return false };
    match range {
        NumericRange::Near(expected) => (value - expected).abs() <= DEFAULT_LINEAR_TOLERANCE,
        NumericRange::Range { min, max } => {
            min.is_none_or(|min| value >= min) && max.is_none_or(|max| value <= max)
        }
    }
}
fn occurrence_matches(
    row: &OccurrenceRow,
    pattern: &TextPattern,
    engine: &dyn EcmaRegexEngine,
) -> Result<bool, EcmaRegexError> {
    Ok(pattern.matches(&row.path, Some(engine))?
        || pattern.matches(&row.product_name, Some(engine))?
        || match &row.instance_name {
            Some(name) => pattern.matches(name, Some(engine))?,
            None => false,
        })
}

fn predicate_failure(
    query: &Query,
    entity: &Entity,
    brep: Option<&dyn BrepSubject>,
    budget: Option<&Budget>,
) -> Result<Option<String>, BackendError> {
    let facts = &entity.facts;
    if query
        .surface_type
        .as_ref()
        .is_some_and(|value| facts.surface_type.as_ref() != Some(value))
    {
        return Ok(Some("surfaceType".into()));
    }
    for (name, predicate, observed, axis) in [
        ("normal", query.normal.as_ref(), facts.normal, false),
        ("axis", query.axis.as_ref(), facts.axis_direction, true),
    ] {
        if let Some(predicate) = predicate {
            let Some(observed) = observed else {
                return Ok(Some(name.into()));
            };
            if angle(observed, predicate.direction, axis).is_none_or(|value| {
                value
                    > predicate
                        .angular_tolerance_degrees
                        .unwrap_or(DEFAULT_ANGULAR_TOLERANCE_DEGREES)
            }) {
                return Ok(Some(name.into()));
            }
        }
    }
    for (name, range, value) in [
        ("radius", query.radius.as_ref(), facts.radius),
        ("area", query.area.as_ref(), facts.area),
        ("offset", query.offset.as_ref(), facts.offset),
    ] {
        if range.is_some_and(|range| !range_matches(range, value)) {
            return Ok(Some(name.into()));
        }
    }
    if let Some(near) = query.near {
        let Some(centroid) = facts.centroid else {
            return Ok(Some("near".into()));
        };
        let tolerance = query.near_tolerance.unwrap_or(DEFAULT_LINEAR_TOLERANCE);
        if near.iter().enumerate().any(|(axis, value)| {
            value.is_some_and(|value| (centroid[axis] - value).abs() > tolerance)
        }) {
            return Ok(Some("near".into()));
        }
    }
    if let Some(point) = query.contains_point {
        if !classify_face_point(entity, point, brep, budget)? {
            return Ok(Some("containsPoint".into()));
        }
    }
    for sub in &query.all_of {
        if let Some(failure) = predicate_failure(sub, entity, brep, budget)? {
            return Ok(Some(format!("allOf.{failure}")));
        }
    }
    if !query.any_of.is_empty() {
        let mut matched = false;
        for sub in &query.any_of {
            if predicate_failure(sub, entity, brep, budget)?.is_none() {
                matched = true;
                break;
            }
        }
        if !matched {
            return Ok(Some("anyOf".into()));
        }
    }
    if let Some(sub) = &query.not {
        if predicate_failure(sub, entity, brep, budget)?.is_none() {
            return Ok(Some("not".into()));
        }
    }
    Ok(None)
}

fn charge_selector_points(budget: Option<&Budget>, points: u64) -> Result<(), BackendError> {
    if let Some(budget) = budget {
        budget.charge(points).map_err(|error| BackendError {
            kind: BackendErrorKind::BudgetExceeded {
                limit: error.limit,
                used: error.used,
            },
            message: "The selector exhausted its logical point-query budget.".into(),
        })?;
    }
    Ok(())
}

fn classify_face_point(
    entity: &Entity,
    point: [f64; 3],
    brep: Option<&dyn BrepSubject>,
    budget: Option<&Budget>,
) -> Result<bool, BackendError> {
    let Some(brep) = brep else {
        return Err(BackendError {
            kind: BackendErrorKind::Unsupported,
            message: "Exact trimmed-face membership is unavailable for this selector probe.".into(),
        });
    };
    let Some(face) = entity.face else {
        return Err(BackendError {
            kind: BackendErrorKind::Unsupported,
            message: format!(
                "Selector candidate '{}' has no retained face identity.",
                entity.id
            ),
        });
    };
    charge_selector_points(budget, 1)?;
    let states = brep.classify_face_points(face, &[point], DEFAULT_LINEAR_TOLERANCE)?;
    match states.as_slice() {
        [PointState::In | PointState::On] => Ok(true),
        [PointState::Out] => Ok(false),
        _ => Err(BackendError {
            kind: BackendErrorKind::ComputationFailed,
            message: format!(
                "Exact face classifier returned {} states for one selector point.",
                states.len()
            ),
        }),
    }
}

fn point_on_ray(origin: [f64; 3], direction: [f64; 3], parameter: f64) -> [f64; 3] {
    std::array::from_fn(|axis| origin[axis] + parameter * direction[axis])
}

fn ray_parameters(entity: &Entity, origin: [f64; 3], direction: [f64; 3]) -> Option<Vec<f64>> {
    match entity.facts.surface_type.as_deref()? {
        "plane" => {
            let normal = entity.facts.normal?;
            let offset = entity.facts.offset?;
            let denominator = dot(normal, direction);
            if denominator.abs() < 1e-9 {
                return Some(Vec::new());
            }
            let parameter = (offset - dot(normal, origin)) / denominator;
            Some(
                (parameter >= -DEFAULT_LINEAR_TOLERANCE)
                    .then_some(parameter)
                    .into_iter()
                    .collect(),
            )
        }
        "cylinder" => {
            let axis_origin = entity.facts.axis_origin?;
            let axis = normalize(entity.facts.axis_direction?)?;
            let radius = entity.facts.radius?;
            let origin_offset = subtract(origin, axis_origin);
            let origin_perpendicular = subtract(
                origin_offset,
                std::array::from_fn(|component| axis[component] * dot(origin_offset, axis)),
            );
            let direction_perpendicular = subtract(
                direction,
                std::array::from_fn(|component| axis[component] * dot(direction, axis)),
            );
            let a = dot(direction_perpendicular, direction_perpendicular);
            if a < 1e-9 {
                return Some(Vec::new());
            }
            let b = 2.0 * dot(origin_perpendicular, direction_perpendicular);
            let c = dot(origin_perpendicular, origin_perpendicular) - radius * radius;
            let discriminant = b * b - 4.0 * a * c;
            if discriminant < 0.0 {
                return Some(Vec::new());
            }
            let root = discriminant.sqrt();
            let mut values = [(-b - root) / (2.0 * a), (-b + root) / (2.0 * a)]
                .into_iter()
                .filter(|value| *value >= -DEFAULT_LINEAR_TOLERANCE)
                .collect::<Vec<_>>();
            values.sort_by(f64::total_cmp);
            values.dedup_by(|left, right| left.to_bits() == right.to_bits());
            Some(values)
        }
        _ => None,
    }
}

// A probe transfers at most one entity. Keep that bounded return inline rather
// than allocating a box for every successful ray hit.
#[allow(clippy::large_enum_variant)]
enum RayProbeOutcome {
    Hit(Entity),
    None,
    Unsupported(Vec<String>),
}

fn apply_ray_probe(
    matches: Vec<Entity>,
    origin: [f64; 3],
    direction: [f64; 3],
    brep: Option<&dyn BrepSubject>,
    budget: Option<&Budget>,
) -> Result<RayProbeOutcome, BackendError> {
    let Some(brep) = brep else {
        return Err(BackendError {
            kind: BackendErrorKind::Unsupported,
            message: "Exact trimmed-face membership is unavailable for hitByRay.".into(),
        });
    };
    let mut hits = Vec::new();
    let mut unevaluable = Vec::new();
    for entity in matches {
        let Some(parameters) = ray_parameters(&entity, origin, direction) else {
            unevaluable.push(entity.id.clone());
            continue;
        };
        let Some(face) = entity.face else {
            unevaluable.push(entity.id.clone());
            continue;
        };
        let points = parameters
            .iter()
            .map(|parameter| point_on_ray(origin, direction, *parameter))
            .collect::<Vec<_>>();
        if points.is_empty() {
            continue;
        }
        charge_selector_points(budget, points.len() as u64)?;
        let states = brep.classify_face_points(face, &points, DEFAULT_LINEAR_TOLERANCE)?;
        if states.len() != points.len() {
            return Err(BackendError {
                kind: BackendErrorKind::ComputationFailed,
                message: format!(
                    "Exact face classifier returned {} states for {} ray candidates on '{}'.",
                    states.len(),
                    points.len(),
                    entity.id
                ),
            });
        }
        if let Some(parameter) =
            parameters
                .into_iter()
                .zip(states)
                .find_map(|(parameter, state)| {
                    matches!(state, PointState::In | PointState::On).then_some(parameter)
                })
        {
            hits.push((parameter, entity));
        }
    }
    if !unevaluable.is_empty() {
        return Ok(RayProbeOutcome::Unsupported(unevaluable));
    }
    hits.sort_by(|left, right| {
        left.0
            .total_cmp(&right.0)
            .then_with(|| compare_utf16(&left.1.id, &right.1.id))
    });
    Ok(match hits.into_iter().next() {
        Some((_, entity)) => RayProbeOutcome::Hit(entity),
        None => RayProbeOutcome::None,
    })
}

fn diagnostic(code: &str, message: String, suggestion: &str) -> Diagnostic {
    let mut value = Diagnostic::error(code, message);
    value.suggestion = Some(suggestion.into());
    value
}
fn failed(
    status: SelectionStatus,
    expected: Cardinality,
    stability: Stability,
    candidates: Vec<Entity>,
    message: String,
    suggestion: &str,
) -> Selection {
    Selection {
        status,
        entities: vec![],
        expected,
        stability,
        candidates,
        diagnostics: vec![diagnostic(
            match status {
                SelectionStatus::Unmatched => "GEOSPEC_SELECTOR_UNMATCHED",
                SelectionStatus::Ambiguous => "GEOSPEC_SELECTOR_AMBIGUOUS",
                _ => "GEOSPEC_SELECTOR_UNSUPPORTED_EVIDENCE",
            },
            message,
            suggestion,
        )],
    }
}
fn cardinality(
    matches: Vec<Entity>,
    expected: Cardinality,
    stability: Stability,
    near: Vec<Entity>,
) -> Selection {
    let valid = match expected {
        Cardinality::One => matches.len() == 1,
        Cardinality::Many => !matches.is_empty(),
        Cardinality::Exactly(n) => matches.len() == n,
        Cardinality::AtLeast(n) => matches.len() >= n,
    };
    if valid {
        return Selection {
            status: SelectionStatus::Resolved,
            entities: matches,
            expected,
            stability,
            candidates: vec![],
            diagnostics: vec![],
        };
    }
    let status = if expected == Cardinality::One && matches.len() > 1 {
        SelectionStatus::Ambiguous
    } else {
        SelectionStatus::Unmatched
    };
    let candidates = if matches.is_empty() { near } else { matches };
    failed(
        status,
        expected,
        stability,
        candidates,
        "Selector cardinality did not match the retained entities.".into(),
        "Inspect the ranked candidates and add or correct a disambiguating predicate.",
    )
}

/// The entities a query ranges over, borrowed from the index; the axis and
/// plane views are built once per index.
fn query_pool(kind: EntityType, index: &SelectorIndex) -> &[Entity] {
    match kind {
        EntityType::Body => &index.bodies,
        EntityType::Axis => index.axes.get_or_init(|| {
            index
                .faces
                .iter()
                .filter(|entity| {
                    entity.facts.axis_direction.is_some()
                        && matches!(
                            entity.facts.surface_type.as_deref(),
                            Some("cylinder" | "cone")
                        )
                })
                .map(|entity| {
                    let mut value = entity.clone();
                    value.entity_type = EntityType::Axis;
                    // resolve.ts faceEntity uses the indexed faceIndex, not an axis ordinal.
                    value.id = match (entity.occurrence_path.as_deref(), entity.facts.face_index) {
                        (Some(path), Some(face_index)) => format!("axis:{path}#{face_index}"),
                        _ => entity.id.replacen("face:", "axis:", 1),
                    };
                    value
                })
                .collect()
        }),
        EntityType::Plane => index.planes.get_or_init(|| {
            index
                .faces
                .iter()
                .filter(|entity| entity.facts.surface_type.as_deref() == Some("plane"))
                .map(|entity| {
                    let mut value = entity.clone();
                    value.entity_type = EntityType::Plane;
                    value.id = value.id.replacen("face:", "plane:", 1);
                    value
                })
                .collect()
        }),
        _ => &index.faces,
    }
}

#[cfg(test)]
pub(crate) fn resolve(
    selector: &Selector,
    index: &SelectorIndex,
    regex: &dyn EcmaRegexEngine,
) -> Selection {
    resolve_with_brep(selector, index, regex, None)
}

#[cfg(test)]
pub(crate) fn resolve_with_brep(
    selector: &Selector,
    index: &SelectorIndex,
    regex: &dyn EcmaRegexEngine,
    brep: Option<&dyn BrepSubject>,
) -> Selection {
    resolve_budgeted_with_brep(selector, index, regex, brep, None)
}

pub(crate) fn resolve_budgeted_with_brep(
    selector: &Selector,
    index: &SelectorIndex,
    regex: &dyn EcmaRegexEngine,
    brep: Option<&dyn BrepSubject>,
    budget: Option<&Budget>,
) -> Selection {
    match selector {
        Selector::Occurrence { name, path, expect } => {
            let mut matches = Vec::new();
            for row in &index.occurrences {
                let name_matches = match name {
                    Some(value) => occurrence_matches(row, value, regex),
                    None => Ok(true),
                };
                let path_matches = match path {
                    Some(value) => value.matches(&row.path, Some(regex)),
                    None => Ok(true),
                };
                match (name_matches, path_matches) {
                    (Ok(true), Ok(true)) => matches.push(occurrence_entity(row)),
                    (Err(error), _) | (_, Err(error)) => {
                        return regex_unsupported(expect.clone(), error)
                    }
                    _ => {}
                }
            }
            cardinality(
                matches,
                expect.clone(),
                Stability::Authored,
                index
                    .occurrences
                    .iter()
                    .take(NEAR_MISS_LIMIT)
                    .map(occurrence_entity)
                    .collect(),
            )
        }
        Selector::Query {
            kind,
            of,
            query,
            expect,
        } => {
            let within = query
                .within
                .as_ref()
                .map(|within| resolve_budgeted_with_brep(within, index, regex, brep, budget));
            if within
                .as_ref()
                .is_some_and(|selection| selection.status != SelectionStatus::Resolved)
            {
                return within.unwrap();
            }
            let allowed: Option<HashSet<_>> = within.map(|selection| {
                selection
                    .entities
                    .into_iter()
                    .filter_map(|entity| entity.occurrence_path)
                    .collect()
            });
            let occurrences: HashMap<_, _> = if of.is_some() || allowed.is_some() {
                // The former linear find selected the first row for duplicate paths.
                index
                    .occurrences
                    .iter()
                    .rev()
                    .map(|row| (row.path.as_str(), row))
                    .collect()
            } else {
                HashMap::new()
            };
            // Ruling 6: parents own no faces or bodies, so `of` and `within`
            // also scope an entity through each enclosing assembly occurrence.
            let lineage = |path: &str| {
                std::iter::successors(occurrences.get(path).copied(), |row| {
                    row.parent
                        .and_then(|parent| index.occurrences.get(parent as usize))
                })
            };
            let mut scoped = HashMap::<u32, bool>::new();
            let mut evaluated = Vec::new();
            for entity in query_pool(*kind, index) {
                let in_scope = match (of, entity.occurrence_path.as_deref()) {
                    (Some(scope), Some(path)) => {
                        let mut matched = false;
                        for row in lineage(path) {
                            let value = match scoped.get(&row.occurrence) {
                                Some(value) => *value,
                                None => match occurrence_matches(row, scope, regex) {
                                    Ok(value) => *scoped.entry(row.occurrence).or_insert(value),
                                    Err(error) => return regex_unsupported(expect.clone(), error),
                                },
                            };
                            if value {
                                matched = true;
                                break;
                            }
                        }
                        matched
                    }
                    (Some(_), None) => false,
                    (None, _) => true,
                };
                let in_within = allowed.as_ref().is_none_or(|paths| {
                    entity.occurrence_path.as_deref().is_some_and(|path| {
                        paths.contains(path) || lineage(path).any(|row| paths.contains(&row.path))
                    })
                });
                if in_scope && in_within {
                    let failure = match predicate_failure(query, entity, brep, budget) {
                        Ok(value) => value,
                        Err(error) => return probe_unsupported(expect.clone(), error),
                    };
                    evaluated.push((entity, failure));
                }
            }
            let mut matches: Vec<_> = evaluated
                .iter()
                .filter(|(_, failure)| failure.is_none())
                .map(|(entity, _)| (*entity).clone())
                .collect();
            if let Some((origin, direction)) = query.hit_by_ray {
                matches = match apply_ray_probe(matches, origin, direction, brep, budget) {
                    Ok(RayProbeOutcome::Hit(entity)) => vec![entity],
                    Ok(RayProbeOutcome::None) => Vec::new(),
                    Ok(RayProbeOutcome::Unsupported(unevaluable)) => {
                        return failed(
                            SelectionStatus::Unsupported,
                            expect.clone(),
                            Stability::DerivedProbe,
                            vec![],
                            format!(
                                "hitByRay supports exact trimmed plane and cylinder faces; {} candidate(s) cannot be evaluated: {}.",
                                unevaluable.len(),
                                unevaluable.join(", ")
                            ),
                            "Narrow the query so only retained analytic faces remain, or select the face by authored name.",
                        )
                    }
                    Err(error) => return probe_unsupported(expect.clone(), error),
                };
            }
            if let Some(point) = query.nearest_to {
                let mut ranked: Vec<_> = matches
                    .into_iter()
                    .filter_map(|entity| {
                        entity
                            .facts
                            .centroid
                            .map(|center| (distance(center, point), entity))
                    })
                    .collect();
                ranked.sort_by(|a, b| {
                    a.0.total_cmp(&b.0)
                        .then_with(|| compare_utf16(&a.1.id, &b.1.id))
                });
                if ranked.len() > 1 && (ranked[1].0 - ranked[0].0) <= DEFAULT_LINEAR_TOLERANCE {
                    let best = ranked[0].0;
                    return failed(
                        SelectionStatus::Ambiguous,
                        expect.clone(),
                        Stability::DerivedProbe,
                        ranked
                            .into_iter()
                            .take_while(|entry| (entry.0 - best) <= DEFAULT_LINEAR_TOLERANCE)
                            .map(|entry| entry.1)
                            .collect(),
                        "nearestTo probe found equidistant candidates; refusing to auto-pick."
                            .into(),
                        "Move the probe closer or add a disambiguating predicate.",
                    );
                }
                matches = ranked.into_iter().take(1).map(|entry| entry.1).collect()
            }
            if query.order_by.is_some() || query.pick.is_some() {
                matches.sort_by(|a, b| {
                    order_value(a, query)
                        .total_cmp(&order_value(b, query))
                        .then_with(|| compare_utf16(&a.id, &b.id))
                });
                if let Some(pick) = &query.pick {
                    matches = match pick {
                        Pick::First => matches.into_iter().take(1).collect(),
                        Pick::Last => matches.into_iter().rev().take(1).collect(),
                        Pick::Index(index_value) => {
                            let position = if *index_value >= 0 {
                                *index_value as usize
                            } else {
                                matches
                                    .len()
                                    .saturating_sub(index_value.unsigned_abs() as usize)
                            };
                            matches.into_iter().nth(position).into_iter().collect()
                        }
                    }
                }
            }
            let near = evaluated
                .drain(..)
                .filter(|(_, failure)| failure.is_some())
                .take(NEAR_MISS_LIMIT)
                .map(|entry| entry.0.clone())
                .collect();
            cardinality(
                matches,
                expect.clone(),
                if query.nearest_to.is_some() {
                    Stability::DerivedProbe
                } else {
                    Stability::DerivedQuery
                },
                near,
            )
        }
        Selector::Named {
            kind,
            name,
            of,
            expect,
        } => {
            let rows = match kind {
                EntityType::Interface => &index.interfaces,
                EntityType::Datum => &index.datums,
                _ => &index.groups,
            };
            let mut matched_rows = Vec::new();
            for row in rows {
                let scoped = match of {
                    Some(scope) => {
                        // Ruling 6: `of` names the row's occurrence or an
                        // enclosing assembly occurrence (parents own no faces).
                        let mut current = index
                            .occurrences
                            .iter()
                            .find(|occurrence| occurrence.path == row.occurrence_path);
                        let mut matched = false;
                        while let Some(occurrence) = current {
                            match occurrence_matches(occurrence, scope, regex) {
                                Ok(true) => {
                                    matched = true;
                                    break;
                                }
                                Ok(false) => {}
                                Err(error) => return regex_unsupported(expect.clone(), error),
                            }
                            current = occurrence
                                .parent
                                .and_then(|parent| index.occurrences.get(parent as usize));
                        }
                        matched && row.name == *name
                    }
                    None => row.full_name == *name,
                };
                if scoped {
                    matched_rows.push(row);
                }
            }
            match kind {
                EntityType::Interface => {
                    resolve_interface_rows(matched_rows, expect.clone(), index, name)
                }
                EntityType::Group => resolve_group_rows(matched_rows, expect.clone(), index, name),
                _ => cardinality(
                    matched_rows
                        .into_iter()
                        .map(|row| row.entity.clone())
                        .collect(),
                    expect.clone(),
                    Stability::Authored,
                    rows.iter()
                        .take(NEAR_MISS_LIMIT)
                        .map(|row| row.entity.clone())
                        .collect(),
                ),
            }
        }
        Selector::Path(path) => resolve_path(path, index),
    }
}

fn regex_unsupported(expected: Cardinality, error: EcmaRegexError) -> Selection {
    failed(
        SelectionStatus::Unsupported,
        expected,
        Stability::Authored,
        vec![],
        format!("ECMAScript regular-expression evaluation is unsupported: {}", error.message()),
        "Use an exact string selector or an engine profile with complete ECMAScript RegExp support.",
    )
}

fn probe_unsupported(expected: Cardinality, error: BackendError) -> Selection {
    failed(
        SelectionStatus::Unsupported,
        expected,
        Stability::DerivedProbe,
        vec![],
        format!(
            "Exact selector probe evidence is unavailable: {}",
            error.message
        ),
        "Use authored names or a BRep connector that implements exact trimmed-face classification.",
    )
}

fn occurrence_entity(row: &OccurrenceRow) -> Entity {
    Entity {
        id: format!("occurrence:{}", row.path),
        entity_type: EntityType::Occurrence,
        occurrence_path: Some(row.path.clone()),
        occurrence: Some(row.occurrence),
        face: None,
        topology_ref: Some(format!(
            "#o{}",
            row.ordinal_path
                .iter()
                .map(u32::to_string)
                .collect::<Vec<_>>()
                .join(".")
        )),
        facts: EntityFacts {
            transform: Some(row.transform),
            product_name: Some(row.product_name.clone()),
            bounds: row.bounds,
            ..EntityFacts::default()
        },
    }
}
fn order_value(entity: &Entity, query: &Query) -> f64 {
    match query.order_by.as_deref() {
        Some("radius") => entity.facts.radius.unwrap_or(f64::INFINITY),
        Some("offsetAlong") => entity
            .facts
            .centroid
            .map(|point| {
                dot(
                    point,
                    normalize(query.along.unwrap_or([0.0, 0.0, 1.0])).unwrap_or([0.0, 0.0, 1.0]),
                )
            })
            .unwrap_or(f64::INFINITY),
        _ => entity.facts.area.unwrap_or(f64::INFINITY),
    }
}

fn resolve_interface_rows(
    rows: Vec<&NamedRow>,
    expected: Cardinality,
    index: &SelectorIndex,
    requested_name: &str,
) -> Selection {
    if let Some(row) = rows.iter().find(|row| row.dangling) {
        return failed(
            SelectionStatus::Unsupported,
            expected,
            Stability::Authored,
            rows.iter().map(|row| row.entity.clone()).collect(),
            format!(
                "Authored interface '{}' references missing faceIndex {}.",
                row.full_name,
                row.dangling_face_index
                    .map_or_else(|| "unknown".into(), |value| value.to_string())
            ),
            "Re-export the artifact so authored names resolve against the live shape.",
        );
    }
    if rows.is_empty() && index.interfaces.is_empty() {
        return failed(
            SelectionStatus::Unsupported,
            expected,
            Stability::Authored,
            vec![],
            "The artifact carries no authored interface names; interface selectors cannot resolve."
                .into(),
            "Author the interface and re-export, or use an exact derived query selector.",
        );
    }
    cardinality(
        rows.into_iter().map(|row| row.entity.clone()).collect(),
        expected,
        Stability::Authored,
        index
            .interfaces
            .iter()
            .filter(|row| row.name == requested_name || row.full_name.contains(requested_name))
            .take(NEAR_MISS_LIMIT)
            .map(|row| row.entity.clone())
            .collect(),
    )
}

fn resolve_group_rows(
    rows: Vec<&NamedRow>,
    expected: Cardinality,
    index: &SelectorIndex,
    requested_name: &str,
) -> Selection {
    if rows.len() > 1 {
        return failed(
            SelectionStatus::Ambiguous,
            expected,
            Stability::Authored,
            rows.iter().map(|row| row.entity.clone()).collect(),
            format!(
                "Group name '{requested_name}' matches {} groups across occurrences.",
                rows.len()
            ),
            "Scope the group selector with 'of' or use the full composed name.",
        );
    }
    let Some(row) = rows.first() else {
        return failed(
            SelectionStatus::Unmatched,
            expected,
            Stability::Authored,
            index
                .groups
                .iter()
                .take(NEAR_MISS_LIMIT)
                .map(|row| row.entity.clone())
                .collect(),
            format!("No authored group named '{requested_name}' exists in the artifact."),
            "Groups are derived from indexed member names; check the authored member names.",
        );
    };
    cardinality(
        row.members.clone(),
        expected,
        Stability::Authored,
        Vec::new(),
    )
}

fn resolve_path(path: &str, index: &SelectorIndex) -> Selection {
    if let Some(reference) = path.strip_prefix("#o") {
        let mut parts = reference.split(".f");
        let ordinal = parts.next().unwrap_or_default();
        let face = parts.next();
        if parts.next().is_some() {
            return failed(
                SelectionStatus::Unmatched,
                Cardinality::One,
                Stability::DerivedOrdinal,
                vec![],
                format!("'{path}' is not a valid snapshot topology ref."),
                "Use a topologyRef reported by the current artifact.",
            );
        }
        if let Some(row) = index.occurrences.iter().find(|row| {
            row.ordinal_path
                .iter()
                .map(u32::to_string)
                .collect::<Vec<_>>()
                .join(".")
                == ordinal
        }) {
            if let Some(face) = face.and_then(|value| value.parse::<u32>().ok()) {
                let matched = index
                    .faces
                    .iter()
                    .filter(|entity| {
                        entity.occurrence == Some(row.occurrence)
                            && entity.facts.face_index == Some(face)
                    })
                    .cloned()
                    .collect();
                return cardinality(matched, Cardinality::One, Stability::DerivedOrdinal, vec![]);
            }
            return cardinality(
                vec![occurrence_entity(row)],
                Cardinality::One,
                Stability::DerivedOrdinal,
                vec![],
            );
        }
        return failed(
            SelectionStatus::Unmatched,
            Cardinality::One,
            Stability::DerivedOrdinal,
            vec![],
            format!("Snapshot ref '{path}' does not exist."),
            "Re-inspect the current artifact.",
        );
    }
    if !valid_selector_path(path) {
        return failed(
            SelectionStatus::Unmatched,
            Cardinality::One,
            Stability::Authored,
            vec![],
            format!("'{path}' is not a conforming selector path."),
            "Use dot-joined profile names with optional 1-based indices.",
        );
    }
    let wildcard_position = path.split('.').position(|segment| segment.ends_with("[*]"));
    let segment_count = path.split('.').count();
    if wildcard_position.is_some_and(|position| position + 1 != segment_count) {
        return failed(
            SelectionStatus::Unmatched,
            Cardinality::One,
            Stability::Authored,
            vec![],
            format!("'{path}' places the '[*]' wildcard on a non-final segment."),
            "The wildcard denotes group members and is only valid on the final segment.",
        );
    }
    if wildcard_position.is_some() {
        let group_name = path.strip_suffix("[*]").unwrap();
        return resolve_group_rows(
            index
                .groups
                .iter()
                .filter(|row| row.full_name == group_name)
                .collect(),
            Cardinality::Many,
            index,
            group_name,
        );
    }
    if let Some(row) = index.occurrences.iter().find(|row| row.path == path) {
        return cardinality(
            vec![occurrence_entity(row)],
            Cardinality::One,
            Stability::Authored,
            vec![],
        );
    }
    let interfaces = index
        .interfaces
        .iter()
        .filter(|row| row.full_name == path)
        .collect::<Vec<_>>();
    if !interfaces.is_empty() {
        return resolve_interface_rows(interfaces, Cardinality::One, index, path);
    }
    let groups = index
        .groups
        .iter()
        .filter(|row| row.full_name == path)
        .collect::<Vec<_>>();
    if !groups.is_empty() {
        return resolve_group_rows(groups, Cardinality::Many, index, path);
    }
    let datums = index
        .datums
        .iter()
        .filter(|row| row.full_name == path)
        .map(|row| row.entity.clone())
        .collect::<Vec<_>>();
    if !datums.is_empty() {
        return cardinality(datums, Cardinality::One, Stability::Authored, Vec::new());
    }
    let matches: Vec<Entity> = index
        .occurrences
        .iter()
        .filter(|row| {
            row.path == path
                || row.product_name == path
                || row.instance_name.as_deref() == Some(path)
        })
        .map(occurrence_entity)
        .collect();
    if !matches.is_empty() {
        return cardinality(matches, Cardinality::One, Stability::Authored, vec![]);
    }
    resolve_interface_rows(Vec::new(), Cardinality::One, index, path)
}

fn valid_selector_path(path: &str) -> bool {
    if path.is_empty() {
        return false;
    }
    path.split('.').all(|segment| {
        let base = segment.split('[').next().unwrap_or_default();
        !base.is_empty()
            && base.as_bytes()[0].is_ascii_alphabetic()
            && base.bytes().all(|byte| byte.is_ascii_alphanumeric())
            && (segment == base
                || segment.strip_prefix(base).is_some_and(|suffix| {
                    suffix == "[*]"
                        || (suffix.starts_with('[')
                            && suffix.ends_with(']')
                            && suffix[1..suffix.len() - 1]
                                .parse::<u32>()
                                .is_ok_and(|value| value > 0))
                }))
    })
}

#[cfg(test)]
mod tests {
    use std::rc::Rc;

    use super::*;
    use crate::backend::{
        brep::{
            DocumentFacts, FaceFacts, PointState, ShapeFacts, TessellationProfile, TopologyCounts,
            ValidityFacts,
        },
        TriangleMesh,
    };

    #[test]
    fn selector_scalar_orders_match_frozen_node24() {
        use crate::matchers::relationships::relationship_scalar_tests::{
            finish, observe, oracle, vector,
        };
        let oracle = oracle();
        let mut rows = Vec::new();
        for row in oracle["vectors"].as_array().unwrap() {
            let id = row["id"].as_str().unwrap();
            let a = vector(&row["a"]);
            let b = vector(&row["b"]);
            let expected = &row["expected"];
            let unit_a = normalize(a).unwrap();
            let unit_b = normalize(b).unwrap();
            for (key, actual) in [
                ("lengthA", length(a)),
                ("lengthB", length(b)),
                ("selectorCosine", dot(unit_a, unit_b).clamp(-1.0, 1.0)),
                ("directed", angle(a, b, false).unwrap()),
                ("axis", angle(a, b, true).unwrap()),
            ] {
                observe(&mut rows, id, key, &[actual], &expected[key]);
            }
            observe(
                &mut rows,
                id,
                "normalizeA",
                &unit_a,
                &expected["normalizeA"],
            );
            observe(
                &mut rows,
                id,
                "normalizeB",
                &unit_b,
                &expected["normalizeB"],
            );
            observe(
                &mut rows,
                id,
                "sourceCosine.directed",
                &[expected["selectorCosine"]["value"].as_f64().unwrap().acos()
                    * (180.0 / std::f64::consts::PI)],
                &expected["directed"],
            );
        }
        for (index, row) in oracle["frames"].as_array().unwrap().iter().enumerate() {
            let x = complete_frame_axis_x(vector(&row["z"])).unwrap();
            observe(
                &mut rows,
                &format!("frame-{index}"),
                "x",
                &x,
                &row["expected"]["x"],
            );
        }
        finish("selector-scalar-orders", rows);
    }

    #[test]
    fn axis_inventory_ids_preserve_face_addresses_and_picks() {
        use crate::matchers::relationships::relationship_scalar_tests::{finish, oracle};
        use serde_json::json;
        let oracle = oracle();
        let mut index = SelectorIndex::default();
        for (occurrence, path) in ["subject", "target"].into_iter().enumerate() {
            for (face_index, surface) in ["cylinder", "plane", "cone"].into_iter().enumerate() {
                let face_index = face_index as u32;
                index.faces.push(Entity {
                    id: format!("face:{path}#{face_index}"),
                    entity_type: EntityType::Face,
                    occurrence_path: Some(path.into()),
                    occurrence: Some(occurrence as u32),
                    face: Some(BrepEntity::Face {
                        occurrence: occurrence as u32,
                        face: face_index,
                    }),
                    topology_ref: Some(format!("#o{occurrence}.f{face_index}")),
                    facts: EntityFacts {
                        surface_type: Some(surface.into()),
                        face_index: Some(face_index),
                        axis_direction: (surface != "plane").then_some([0.0, 0.0, 1.0]),
                        radius: (surface != "plane")
                            .then_some(1.0 + (face_index / 2) as f64 + (occurrence * 3) as f64),
                        ..EntityFacts::default()
                    },
                });
            }
        }
        let original = index.faces.clone();
        let pool = query_pool(EntityType::Axis, &index);
        let mut observations = Vec::new();
        for (position, original_position) in [0, 2, 3, 5].into_iter().enumerate() {
            let actual = &pool[position];
            let original = &original[original_position];
            let expected = &oracle["selection"]["pool"][position];
            let passed = actual.id == expected["id"].as_str().unwrap()
                && actual.entity_type == EntityType::Axis
                && actual.occurrence_path == original.occurrence_path
                && actual.occurrence == original.occurrence
                && actual.face == original.face
                && actual.facts == original.facts
                && actual.topology_ref == original.topology_ref;
            observations.push(json!({"operation":"axis pool","id":actual.id,
                "occurrence":actual.occurrence,"face":format!("{:?}",actual.face),
                "topologyRef":actual.topology_ref,"expectedId":expected["id"],"passed":passed}));
        }
        for (pick, key, original_position) in [(1, "positivePick1", 2), (-1, "negativePick1", 5)] {
            let selected = resolve(
                &Selector::Query {
                    kind: EntityType::Axis,
                    of: None,
                    query: Query {
                        order_by: Some("radius".into()),
                        pick: Some(Pick::Index(pick)),
                        ..Query::default()
                    },
                    expect: Cardinality::One,
                },
                &index,
                &TestRegex,
            );
            let actual = &selected.entities[0];
            let expected = &oracle["selection"][key];
            let passed = selected.status == SelectionStatus::Resolved
                && selected.entities.len() == 1
                && actual.id == expected["id"].as_str().unwrap()
                && actual.face == original[original_position].face
                && actual.occurrence == original[original_position].occurrence
                && actual.occurrence_path == original[original_position].occurrence_path
                && actual.topology_ref == original[original_position].topology_ref;
            observations.push(json!({"operation":"radius pick","pick":pick,"id":actual.id,
                "face":format!("{:?}",actual.face),"occurrence":actual.occurrence,
                "topologyRef":actual.topology_ref,"expectedId":expected["id"],"passed":passed}));
        }
        observations
            .push(json!({"operation":"face inventory unchanged","passed":index.faces==original}));
        // C11: the pools borrow the index; the axis view is built once.
        assert!(std::ptr::eq(query_pool(EntityType::Axis, &index), pool));
        assert!(std::ptr::eq(
            query_pool(EntityType::Face, &index),
            index.faces.as_slice()
        ));
        let mut duplicated = SelectorIndex {
            faces: index.faces.clone(),
            ..SelectorIndex::default()
        };
        duplicated.faces.push(index.faces[0].clone());
        let duplicates = query_pool(EntityType::Axis, &duplicated);
        let ids: Vec<_> = duplicates.iter().map(|entity| entity.id.as_str()).collect();
        let expected: Vec<_> = oracle["selection"]["duplicateIds"]
            .as_array()
            .unwrap()
            .iter()
            .map(|id| id.as_str().unwrap())
            .collect();
        observations.push(json!({"operation":"duplicates retain order and address","ids":ids,"expectedIds":expected,
            "passed":ids==expected && duplicates.last().unwrap()==&pool[0]}));
        finish("axis-inventory-ids", observations);
    }

    struct TestRegex;

    impl EcmaRegexEngine for TestRegex {
        fn validate(&self, pattern: &str, _: &str) -> Result<(), EcmaRegexError> {
            match pattern {
                "(" => Err(EcmaRegexError::InvalidSyntax("unterminated group".into())),
                "v-only" => Err(EcmaRegexError::Unsupported("v flag profile".into())),
                _ => Ok(()),
            }
        }

        fn test(&self, pattern: &str, _: &str, value: &str) -> Result<bool, EcmaRegexError> {
            Ok(pattern == value)
        }
    }

    #[test]
    fn query_path_lookup_matches_linear_selection_with_duplicate_paths() {
        let mut index = SelectorIndex::default();
        for number in 0..32 {
            let path = format!("part{number}");
            index.occurrences.push(OccurrenceRow {
                path: path.clone(),
                product_name: if number == 31 { "first" } else { "other" }.into(),
                instance_name: None,
                transform: [0.0; 12],
                occurrence: number,
                ordinal_path: vec![number],
                bounds: None,
                parent: None,
            });
            for face in 0..4 {
                let mut entity = plane(&format!("face:{path}#{face}"), face, [0.0; 3]);
                entity.occurrence_path = Some(path.clone());
                entity.facts.area = Some(if face == 3 { 2.0 } else { 1.0 });
                index.faces.push(entity);
            }
        }
        let mut duplicate = index.occurrences[31].clone();
        duplicate.product_name = "second".into();
        index.occurrences.push(duplicate);

        let within = Selector::Occurrence {
            name: None,
            path: Some(TextPattern::Exact("part31".into())),
            expect: Cardinality::Many,
        };
        let allowed: Vec<_> = resolve(&within, &index, &TestRegex)
            .entities
            .into_iter()
            .filter_map(|entity| entity.occurrence_path)
            .collect();
        let mut visits = 0;
        for (scope, expected_status) in [
            ("first", SelectionStatus::Resolved),
            ("second", SelectionStatus::Unmatched),
        ] {
            let query = Query {
                within: Some(Box::new(within.clone())),
                area: Some(NumericRange::Near(1.0)),
                ..Query::default()
            };
            let selector = Selector::Query {
                kind: EntityType::Face,
                of: Some(TextPattern::Exact(scope.into())),
                query: query.clone(),
                expect: Cardinality::Exactly(3),
            };
            let mut matches = Vec::new();
            let mut near = Vec::new();
            for entity in &index.faces {
                let row = index.occurrences.iter().find(|row| {
                    visits += 1;
                    entity.occurrence_path.as_deref() == Some(row.path.as_str())
                });
                if row.is_some_and(|row| {
                    occurrence_matches(row, &TextPattern::Exact(scope.into()), &TestRegex).unwrap()
                }) && allowed.contains(entity.occurrence_path.as_ref().unwrap())
                {
                    if predicate_failure(&query, entity, None, None)
                        .unwrap()
                        .is_none()
                    {
                        matches.push(entity.clone());
                    } else {
                        near.push(entity.clone());
                    }
                }
            }
            let former = cardinality(
                matches,
                Cardinality::Exactly(3),
                Stability::DerivedQuery,
                near,
            );
            let current = resolve(&selector, &index, &TestRegex);
            assert_eq!(current.status, expected_status);
            assert_eq!(current, former);
        }
        assert_eq!(visits, 4_224);
    }

    #[test]
    fn of_and_within_reach_leaf_faces_through_assembly_ancestors() {
        // Ruling 6: the assembly `asm` owns no faces; its leaves own them.
        let mut index = SelectorIndex::default();
        for (number, path, parent) in [
            (0, "asm", None),
            (1, "asm/a", Some(0)),
            (2, "asm/b", Some(0)),
            (3, "loose", None),
        ] {
            index.occurrences.push(OccurrenceRow {
                path: path.into(),
                product_name: path.into(),
                instance_name: None,
                transform: [0.0; 12],
                occurrence: number,
                ordinal_path: vec![number],
                bounds: None,
                parent,
            });
            for face in (number != 0).then_some(0..2).into_iter().flatten() {
                let mut entity = plane(&format!("face:{path}#{face}"), face, [0.0; 3]);
                entity.occurrence_path = Some(path.into());
                index.faces.push(entity);
            }
        }
        let ids = |of: Option<&str>, within: Option<&str>| -> Vec<String> {
            let selector = Selector::Query {
                kind: EntityType::Face,
                of: of.map(|value| TextPattern::Exact(value.into())),
                query: Query {
                    within: within.map(|value| {
                        Box::new(Selector::Occurrence {
                            name: None,
                            path: Some(TextPattern::Exact(value.into())),
                            expect: Cardinality::One,
                        })
                    }),
                    ..Query::default()
                },
                expect: Cardinality::Many,
            };
            resolve(&selector, &index, &TestRegex)
                .entities
                .into_iter()
                .map(|entity| entity.id)
                .collect()
        };
        let assembly = [
            "face:asm/a#0",
            "face:asm/a#1",
            "face:asm/b#0",
            "face:asm/b#1",
        ];
        assert_eq!(ids(Some("asm"), None), assembly);
        assert_eq!(ids(None, Some("asm")), assembly);
        // A leaf scope is unchanged: its own faces only.
        assert_eq!(ids(Some("asm/a"), None), ["face:asm/a#0", "face:asm/a#1"]);
        assert_eq!(ids(None, Some("asm/b")), ["face:asm/b#0", "face:asm/b#1"]);
        assert_eq!(ids(Some("loose"), Some("asm")), Vec::<String>::new());

        // A named datum on a leaf resolves through its assembly scope too.
        index.datums.push(named_datum(
            "asm/a.A".into(),
            "A".into(),
            "asm/a".into(),
            Some(1),
            [0.0; 3],
            [1.0, 0.0, 0.0],
            [0.0, 0.0, 1.0],
        ));
        let datum = |of: &str| {
            resolve(
                &Selector::Named {
                    kind: EntityType::Datum,
                    name: "A".into(),
                    of: Some(TextPattern::Exact(of.into())),
                    expect: Cardinality::One,
                },
                &index,
                &TestRegex,
            )
            .entities
            .into_iter()
            .map(|entity| entity.id)
            .collect::<Vec<_>>()
        };
        assert_eq!(datum("asm"), ["datum:asm/a.A"]);
        assert_eq!(datum("asm/a"), ["datum:asm/a.A"]);
        assert_eq!(datum("loose"), Vec::<String>::new());
    }

    struct ProbeBrep;

    fn unused() -> BackendError {
        BackendError {
            kind: BackendErrorKind::Unsupported,
            message: "unused test operation".into(),
        }
    }

    impl BrepSubject for ProbeBrep {
        fn faces(&self) -> Result<Rc<[LocatedFace]>, BackendError> {
            Ok(Rc::from(vec![LocatedFace {
                entity: BrepEntity::WholeFace(1),
                facts: FaceFacts {
                    index: 1,
                    area: 4.0,
                    center_of_mass: [0.0, 0.0, 0.0],
                    surface: SurfaceFacts::Plane {
                        origin: [0.0, 0.0, 0.0],
                        normal: [0.0, 0.0, 1.0],
                    },
                },
                bounds: Bounds {
                    min: [-1.0, -1.0, 0.0],
                    max: [1.0, 1.0, 0.0],
                },
                reversed: false,
            }]))
        }
        fn validity(&self) -> Result<Rc<ValidityFacts>, BackendError> {
            Err(unused())
        }
        fn classify_face_points(
            &self,
            face: BrepEntity,
            points: &[[f64; 3]],
            _: f64,
        ) -> Result<Vec<PointState>, BackendError> {
            Ok(points
                .iter()
                .map(|point| match face {
                    BrepEntity::WholeFace(1)
                        if point[0].abs() <= 1.0
                            && point[1].abs() <= 1.0
                            && point[2].abs() <= DEFAULT_LINEAR_TOLERANCE =>
                    {
                        PointState::On
                    }
                    BrepEntity::WholeFace(2)
                        if (point[0] - 5.0).abs() <= 1.0
                            && point[1].abs() <= 1.0
                            && point[2].abs() <= DEFAULT_LINEAR_TOLERANCE =>
                    {
                        PointState::In
                    }
                    BrepEntity::WholeFace(index) if index >= 10 => PointState::On,
                    _ => PointState::Out,
                })
                .collect())
        }
        fn tessellate(
            &self,
            _: BrepEntity,
            _: TessellationProfile,
        ) -> Result<Rc<TriangleMesh>, BackendError> {
            Err(unused())
        }
    }

    fn plane(id: &str, face: u32, center: [f64; 3]) -> Entity {
        Entity {
            id: id.into(),
            entity_type: EntityType::Face,
            occurrence_path: Some("part".into()),
            occurrence: None,
            face: Some(BrepEntity::WholeFace(face)),
            facts: EntityFacts {
                surface_type: Some("plane".into()),
                normal: Some([0.0, 0.0, 1.0]),
                offset: Some(0.0),
                area: Some(1.0),
                centroid: Some(center),
                bounds: Some(Bounds {
                    min: [-100.0, -100.0, 0.0],
                    max: [100.0, 100.0, 0.0],
                }),
                ..EntityFacts::default()
            },
            topology_ref: Some(format!("#o1.f{face}")),
        }
    }

    fn flat_facts() -> DocumentFacts {
        DocumentFacts {
            source_length_unit: "millimetre".into(),
            source_unit_to_millimeters: 1.0,
            occurrences: Vec::new(),
            shape: ShapeFacts {
                bounds: Bounds {
                    min: [-1.0, -1.0, 0.0],
                    max: [1.0, 1.0, 0.0],
                },
                volume: 0.0,
                surface_area: 4.0,
                center_of_mass: [0.0, 0.0, 0.0],
                topology: TopologyCounts {
                    compounds: 0,
                    solids: 0,
                    shells: 0,
                    faces: 1,
                    wires: 1,
                    edges: 4,
                    vertices: 4,
                },
            },
            subshapes: Vec::new(),
            datum_placements: Vec::new(),
            semantic_datums: Vec::new(),
        }
    }
    #[test]
    fn exact_patterns_match_and_regex_wire_round_trips_without_substitution() {
        assert!(TextPattern::parse(&Json::String("bolt".into()), "name")
            .unwrap()
            .matches("bolt", None)
            .unwrap());
        let regex = TextPattern::parse(
            &Json::object([
                ("type", Json::string("regexp")),
                ("pattern", Json::string("^(c)(A)\\1$")),
                ("flags", Json::string("iu")),
            ]),
            "name",
        )
        .unwrap();
        assert_eq!(
            regex.to_json(),
            Json::object([
                ("type", Json::string("regexp")),
                ("pattern", Json::string("^(c)(A)\\1$")),
                ("flags", Json::string("iu"))
            ])
        );
    }
    #[test]
    fn path_grammar_rejects_zero_indices_and_nonfinal_junk() {
        assert!(valid_selector_path("head.bore[*]"));
        assert!(!valid_selector_path("head.bore[0]"));
        assert!(!valid_selector_path("9head"));
    }

    #[test]
    fn parser_rejects_invalid_ranges_vectors_fields_and_pick_values() {
        let query = |value| {
            Selector::parse(&Json::object([
                ("kind", Json::string("face")),
                ("query", value),
            ]))
        };
        assert!(query(Json::object([(
            "area",
            Json::object([("min", Json::Number(2.0)), ("max", Json::Number(1.0))]),
        )]))
        .is_err());
        assert!(query(Json::object([(
            "normal",
            Json::object([(
                "direction",
                Json::Array(vec![
                    Json::Number(0.0),
                    Json::Number(0.0),
                    Json::Number(0.0)
                ]),
            )]),
        )]))
        .is_err());
        assert!(Selector::parse(&Json::object([
            ("kind", Json::string("body")),
            ("query", Json::object([("radius", Json::Number(1.0))])),
        ]))
        .is_err());
        assert!(query(Json::object([("pick", Json::Number(f64::INFINITY))])).is_err());
    }

    #[test]
    fn recursive_regex_validation_preserves_invalid_and_unsupported_kinds() {
        let invalid = Selector::Occurrence {
            name: Some(TextPattern::Regex {
                pattern: "(".into(),
                flags: "u".into(),
            }),
            path: None,
            expect: Cardinality::One,
        };
        assert!(matches!(
            invalid.validate_regexes(&TestRegex),
            Err(EcmaRegexError::InvalidSyntax(_))
        ));
        let unsupported = Selector::Query {
            kind: EntityType::Face,
            of: None,
            query: Query {
                within: Some(Box::new(Selector::Occurrence {
                    name: Some(TextPattern::Regex {
                        pattern: "v-only".into(),
                        flags: "v".into(),
                    }),
                    path: None,
                    expect: Cardinality::One,
                })),
                ..Query::default()
            },
            expect: Cardinality::One,
        };
        assert!(matches!(
            unsupported.validate_regexes(&TestRegex),
            Err(EcmaRegexError::Unsupported(_))
        ));
    }

    #[test]
    fn contains_point_uses_trimmed_face_classification() {
        let index = SelectorIndex {
            faces: vec![plane("face:wide-support", 1, [0.0, 0.0, 0.0])],
            ..SelectorIndex::default()
        };
        let selector = |point| Selector::Query {
            kind: EntityType::Face,
            of: None,
            query: Query {
                contains_point: Some(point),
                ..Query::default()
            },
            expect: Cardinality::One,
        };
        assert_eq!(
            resolve_with_brep(
                &selector([0.0, 0.0, 0.0]),
                &index,
                &TestRegex,
                Some(&ProbeBrep)
            )
            .status,
            SelectionStatus::Resolved
        );
        let outside_trim = resolve_with_brep(
            &selector([5.0, 0.0, 0.0]),
            &index,
            &TestRegex,
            Some(&ProbeBrep),
        );
        assert_eq!(outside_trim.status, SelectionStatus::Unmatched);
        assert_eq!(outside_trim.candidates[0].id, "face:wide-support");
    }

    #[test]
    fn ray_probe_classifies_analytic_intersections_against_each_trim() {
        let index = SelectorIndex {
            faces: vec![
                plane("face:outside-trim", 1, [0.0, 0.0, 0.0]),
                plane("face:inside-trim", 2, [5.0, 0.0, 0.0]),
            ],
            ..SelectorIndex::default()
        };
        let selection = resolve_with_brep(
            &Selector::Query {
                kind: EntityType::Face,
                of: None,
                query: Query {
                    hit_by_ray: Some(([5.0, 0.0, 1.0], [0.0, 0.0, -1.0])),
                    ..Query::default()
                },
                expect: Cardinality::One,
            },
            &index,
            &TestRegex,
            Some(&ProbeBrep),
        );
        assert_eq!(selection.status, SelectionStatus::Resolved);
        assert_eq!(selection.entities[0].id, "face:inside-trim");
    }

    #[test]
    fn utf16_tie_order_controls_full_candidate_and_pick_results() {
        let labels = ["a", "A", "á", "ä", "Z", "Ω", "\u{e000}", "😀", "𐀀"];
        let faces = labels
            .into_iter()
            .enumerate()
            .map(|(index, label)| plane(label, index as u32 + 10, [0.0, 0.0, 0.0]))
            .collect();
        let index = SelectorIndex {
            faces,
            ..SelectorIndex::default()
        };
        let base = Query {
            order_by: Some("area".into()),
            ..Query::default()
        };
        let all = resolve_with_brep(
            &Selector::Query {
                kind: EntityType::Face,
                of: None,
                query: base.clone(),
                expect: Cardinality::Many,
            },
            &index,
            &TestRegex,
            Some(&ProbeBrep),
        );
        assert_eq!(
            all.entities
                .iter()
                .map(|entity| entity.id.as_str())
                .collect::<Vec<_>>(),
            ["A", "Z", "a", "á", "ä", "Ω", "𐀀", "😀", "\u{e000}"]
        );
        let picked = resolve_with_brep(
            &Selector::Query {
                kind: EntityType::Face,
                of: None,
                query: Query {
                    pick: Some(Pick::Index(2)),
                    ..base
                },
                expect: Cardinality::One,
            },
            &index,
            &TestRegex,
            Some(&ProbeBrep),
        );
        assert_eq!(picked.entities[0].id, "a");

        let nearest = resolve_with_brep(
            &Selector::Query {
                kind: EntityType::Face,
                of: None,
                query: Query {
                    nearest_to: Some([0.0, 0.0, 0.0]),
                    ..Query::default()
                },
                expect: Cardinality::One,
            },
            &index,
            &TestRegex,
            Some(&ProbeBrep),
        );
        assert_eq!(nearest.status, SelectionStatus::Ambiguous);
        assert_eq!(
            nearest
                .candidates
                .iter()
                .map(|entity| entity.id.as_str())
                .collect::<Vec<_>>(),
            ["A", "Z", "a", "á", "ä", "Ω", "𐀀", "😀", "\u{e000}"]
        );
    }

    #[test]
    fn authored_paths_reject_nonfinal_wildcards_and_return_group_members() {
        let member = plane("face:member", 1, [0.0, 0.0, 0.0]);
        let group = NamedRow {
            full_name: "head.bore".into(),
            name: "bore".into(),
            occurrence_path: "head".into(),
            entity: Entity {
                id: "group:head.bore".into(),
                entity_type: EntityType::Group,
                occurrence_path: Some("head".into()),
                occurrence: None,
                face: None,
                facts: EntityFacts {
                    member_count: Some(1),
                    ..EntityFacts::default()
                },
                topology_ref: None,
            },
            dangling: false,
            dangling_face_index: None,
            members: vec![member.clone()],
            member_indices: vec![1],
        };
        let index = SelectorIndex {
            groups: vec![group],
            ..SelectorIndex::default()
        };
        assert_eq!(
            resolve_path("head[*].bore", &index).status,
            SelectionStatus::Unmatched
        );
        let selection = resolve_path("head.bore[*]", &index);
        assert_eq!(selection.status, SelectionStatus::Resolved);
        assert_eq!(selection.entities, vec![member]);
    }

    #[test]
    fn authored_interface_keeps_its_name_and_original_face_query_address() {
        let mut facts = flat_facts();
        // This ordinary occurrence uses ProbeBrep's located face fixture.
        facts
            .occurrences
            .push(crate::backend::brep::OccurrenceFacts {
                name: "part".into(),
                placement: [1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0],
                bounds: facts.shape.bounds,
                path: "part".into(),
                parent: None,
                product: 0,
                product_name: "part".into(),
                instance_name: None,
                ordinal_path: vec![0],
                face_count: 1,
            });
        facts.subshapes.push(crate::backend::brep::SubshapeFacts {
            occurrence: Some(0),
            occurrence_path: "part".into(),
            name: "seat".into(),
            shape_type: SubshapeType::Face,
            face_index: Some(1),
            shape_label: None,
        });
        let index = build_index(&facts, &ProbeBrep).unwrap();
        let row = &index.interfaces[0];
        assert!(!row.dangling);
        assert_eq!(row.entity.id, "interface:part.seat");
        assert_eq!(row.entity.entity_type, EntityType::Face);
        assert_eq!(row.entity.face, index.faces[0].face);
        assert_eq!(row.entity.facts, index.faces[0].facts);
        assert_eq!(row.entity.topology_ref, index.faces[0].topology_ref);
    }

    #[test]
    fn flat_step_index_uses_whole_shape_faces_without_occurrence_zero() {
        let index = build_index(&flat_facts(), &ProbeBrep).unwrap();
        assert_eq!(index.faces.len(), 1);
        assert_eq!(index.faces[0].id, "face:whole#1");
        assert_eq!(index.faces[0].occurrence, None);
        assert_eq!(index.faces[0].occurrence_path, None);
        assert_eq!(index.faces[0].face, Some(BrepEntity::WholeFace(1)));
        assert_eq!(index.bodies[0].id, "body:whole");
        assert_eq!(index.bodies[0].face, Some(BrepEntity::Whole));
    }
}
