//! Exact source proof for the bounded parallel-plane distance profile.

use crate::{
    backend::brep::{ResolvedSourceFace, SourceFaceKey},
    codec::Json,
};
use num_bigint::BigInt;
use num_integer::Integer;
use num_rational::BigRational;
use num_traits::{One, Signed, Zero};
use std::{
    collections::{HashMap, HashSet},
    fmt,
    mem::size_of,
};

const MAX_SOURCE: usize = 1_048_576;
const MAX_RECORDS: usize = 8_192;
const MAX_RECORD: usize = 65_536;
const MAX_LIST: usize = 32;
const MAX_DEPTH: usize = 32;
const MAX_ROUTE: usize = 32;
const MAX_EDGES: usize = 8;
const MAX_DECIMALS: u64 = 2_048;
const MAX_RATIONAL_OPS: u64 = 8_192;
const MAX_BITS: u64 = 12_416;
const MAX_RETAINED: usize = 32 * 1024 * 1024;
const DECLARATION_NAME: &str = "geospec.pmi.parallel-plane-distance/v1";

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) struct SourceSpan {
    pub start: usize,
    pub end: usize,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct SourceNumber {
    pub span: SourceSpan,
    pub spelling: String,
    pub millimeters: BigRational,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct SourceLexeme {
    pub span: SourceSpan,
    pub spelling: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct WorkCounts {
    pub lexical_bytes: u64,
    pub records: u64,
    pub list_items: u64,
    pub decimals: u64,
    pub rational_operations: u64,
    pub projected_temporary_peak_bytes: usize,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) enum F2Error {
    InvalidInput(String),
    UnsupportedSource(String),
    UnsupportedDomain(String),
    ResourceLimit(String),
}

impl F2Error {
    pub(crate) const fn code(&self) -> &'static str {
        match self {
            Self::InvalidInput(_) => "invalid-input",
            Self::UnsupportedSource(_) => "unsupported-source",
            Self::UnsupportedDomain(_) => "unsupported-domain",
            Self::ResourceLimit(_) => "resource-limit",
        }
    }
}

impl fmt::Display for F2Error {
    fn fmt(&self, out: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidInput(message)
            | Self::UnsupportedSource(message)
            | Self::UnsupportedDomain(message)
            | Self::ResourceLimit(message) => out.write_str(message),
        }
    }
}

impl std::error::Error for F2Error {}

#[derive(Clone, Debug, Eq, PartialEq)]
struct ExactPlane {
    normal: [BigInt; 3],
    offset_mm: BigRational,
    point_mm: [BigRational; 3],
    source_same_sense: bool,
    outer_bound_orientation: bool,
    oriented_edge_orientations: Vec<bool>,
    edge_same_sense: Vec<bool>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct ExactPlacement {
    rotation: [[i8; 3]; 3],
    translation_mm: [BigRational; 3],
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct Role {
    name: &'static str,
    key: SourceFaceKey,
    plane: ExactPlane,
    placement: ExactPlacement,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct AdmittedDimension {
    declaration: u32,
    roles: [Role; 2],
    lower: SourceNumber,
    upper: SourceNumber,
    bound_unit_entity: u32,
    bound_unit_to_mm: BigRational,
    distance_squared_mm: BigRational,
    geometric_pass: bool,
    work: WorkCounts,
    source_numbers: Vec<SourceLexeme>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct AssociationWitness {
    pub role: &'static str,
    pub source_face_entity: u32,
    pub occurrence_route: Vec<u32>,
    pub occurrence: u32,
    pub public_face_ordinal: u32,
    pub source_same_sense: bool,
    pub transferred_reversed: bool,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct F2Evidence {
    pub geometric_pass: bool,
    declaration: u32,
    roles: [Role; 2],
    lower: SourceNumber,
    upper: SourceNumber,
    bound_unit_entity: u32,
    bound_unit_to_mm: BigRational,
    distance_squared_mm: BigRational,
    associations: [AssociationWitness; 2],
    work: WorkCounts,
    source_numbers: Vec<SourceLexeme>,
}

impl AdmittedDimension {
    pub(crate) fn source_keys(&self) -> [SourceFaceKey; 2] {
        [self.roles[0].key.clone(), self.roles[1].key.clone()]
    }

    pub(crate) fn evaluate(
        &self,
        associations: &[ResolvedSourceFace; 2],
    ) -> Result<F2Evidence, F2Error> {
        let witnesses = std::array::from_fn(|index| AssociationWitness {
            role: self.roles[index].name,
            source_face_entity: associations[index].key.source_face_entity,
            occurrence_route: associations[index].key.occurrence_route.clone(),
            occurrence: associations[index].occurrence,
            public_face_ordinal: associations[index].public_face_ordinal,
            source_same_sense: associations[index].source_same_sense,
            transferred_reversed: associations[index].transferred_reversed,
        });
        for index in 0..2 {
            if associations[index].key != self.roles[index].key {
                return Err(F2Error::UnsupportedSource(format!(
                    "{} association does not match its source key.",
                    self.roles[index].name
                )));
            }
            if associations[index].source_same_sense != self.roles[index].plane.source_same_sense {
                return Err(F2Error::UnsupportedSource(format!(
                    "{} association disagrees with ADVANCED_FACE.same_sense.",
                    self.roles[index].name
                )));
            }
        }
        let same_route =
            associations[0].key.occurrence_route == associations[1].key.occurrence_route;
        let same_occurrence = associations[0].occurrence == associations[1].occurrence;
        if same_route != same_occurrence {
            return Err(F2Error::UnsupportedSource(
                if same_route {
                    "The same source route resolved to different occurrences."
                } else {
                    "Distinct source routes resolved to the same occurrence."
                }
                .into(),
            ));
        }
        if same_occurrence
            && associations[0].key.source_face_entity != associations[1].key.source_face_entity
            && (associations[0].public_face_ordinal == associations[1].public_face_ordinal
                || associations[0].private_query_face == associations[1].private_query_face)
        {
            return Err(F2Error::UnsupportedSource(
                "Distinct source faces resolved to the same occurrence face.".into(),
            ));
        }
        let mut evidence = F2Evidence {
            geometric_pass: self.geometric_pass,
            declaration: self.declaration,
            roles: self.roles.clone(),
            lower: self.lower.clone(),
            upper: self.upper.clone(),
            bound_unit_entity: self.bound_unit_entity,
            bound_unit_to_mm: self.bound_unit_to_mm.clone(),
            distance_squared_mm: self.distance_squared_mm.clone(),
            associations: witnesses,
            work: self.work.clone(),
            source_numbers: self.source_numbers.clone(),
        };
        evidence.work.projected_temporary_peak_bytes = self.work.projected_temporary_peak_bytes;
        if evidence.owned_bytes() > MAX_RETAINED {
            return Err(F2Error::ResourceLimit("F2 evidence exceeds 32 MiB.".into()));
        }
        Ok(evidence)
    }

    pub(crate) fn owned_bytes(&self) -> usize {
        size_of::<Self>()
            + self.roles.iter().map(role_bytes).sum::<usize>()
            + number_bytes(&self.lower)
            + number_bytes(&self.upper)
            + ratio_bytes(&self.bound_unit_to_mm)
            + ratio_bytes(&self.distance_squared_mm)
            + self
                .source_numbers
                .iter()
                .map(|value| value.spelling.capacity())
                .sum::<usize>()
            + self.source_numbers.capacity() * size_of::<SourceLexeme>()
    }

    pub(crate) fn work_counts(&self) -> WorkCounts {
        self.work.clone()
    }
}

impl F2Evidence {
    pub(crate) fn to_json(&self) -> Json {
        let roles: Vec<Json> = self
            .roles
            .iter()
            .enumerate()
            .map(|(index, role)| {
                Json::object([
                    ("role", Json::string(role.name)),
                    ("sourceFaceEntity", number(role.key.source_face_entity)),
                    (
                        "occurrenceRoute",
                        Json::Array(
                            role.key
                                .occurrence_route
                                .iter()
                                .copied()
                                .map(number)
                                .collect(),
                        ),
                    ),
                    ("plane", plane_json(&role.plane)),
                    ("placement", placement_json(&role.placement)),
                    (
                        "association",
                        Json::object([
                            ("occurrence", number(self.associations[index].occurrence)),
                            (
                                "publicFaceOrdinal",
                                number(self.associations[index].public_face_ordinal),
                            ),
                            (
                                "sourceSameSense",
                                Json::Bool(self.associations[index].source_same_sense),
                            ),
                            (
                                "transferredReversed",
                                Json::Bool(self.associations[index].transferred_reversed),
                            ),
                        ]),
                    ),
                ])
            })
            .collect();
        Json::object([
            ("profile", Json::string(DECLARATION_NAME)),
            ("declaration", number(self.declaration)),
            ("geometricPass", Json::Bool(self.geometric_pass)),
            ("roles", Json::Array(roles)),
            (
                "band",
                Json::object([
                    ("unitEntity", number(self.bound_unit_entity)),
                    ("unitToMillimeters", ratio_json(&self.bound_unit_to_mm)),
                    ("lower", number_json(&self.lower)),
                    ("upper", number_json(&self.upper)),
                ]),
            ),
            (
                "distanceSquaredMillimeters",
                ratio_json(&self.distance_squared_mm),
            ),
            (
                "sourceNumbers",
                Json::Array(
                    self.source_numbers
                        .iter()
                        .map(|value| {
                            Json::object([
                                (
                                    "span",
                                    Json::object([
                                        ("start", number(value.span.start as u64)),
                                        ("end", number(value.span.end as u64)),
                                    ]),
                                ),
                                ("spelling", Json::String(value.spelling.clone())),
                            ])
                        })
                        .collect(),
                ),
            ),
            (
                "work",
                Json::object([
                    ("lexicalBytes", number(self.work.lexical_bytes)),
                    ("records", number(self.work.records)),
                    ("listItems", number(self.work.list_items)),
                    ("decimals", number(self.work.decimals)),
                    ("rationalOperations", number(self.work.rational_operations)),
                    (
                        "projectedTemporaryPeakBytes",
                        number(self.work.projected_temporary_peak_bytes as u64),
                    ),
                ]),
            ),
        ])
    }

    pub(crate) fn owned_bytes(&self) -> usize {
        size_of::<Self>()
            + self.roles.iter().map(role_bytes).sum::<usize>()
            + self
                .associations
                .iter()
                .map(|a| a.occurrence_route.capacity() * size_of::<u32>())
                .sum::<usize>()
            + number_bytes(&self.lower)
            + number_bytes(&self.upper)
            + ratio_bytes(&self.bound_unit_to_mm)
            + ratio_bytes(&self.distance_squared_mm)
            + self
                .source_numbers
                .iter()
                .map(|value| value.spelling.capacity())
                .sum::<usize>()
            + self.source_numbers.capacity() * size_of::<SourceLexeme>()
    }

    pub(crate) fn work_counts(&self) -> WorkCounts {
        self.work.clone()
    }
}

fn role_bytes(role: &Role) -> usize {
    role.key.occurrence_route.capacity() * size_of::<u32>()
        + ratio_bytes(&role.plane.offset_mm)
        + role.plane.point_mm.iter().map(ratio_bytes).sum::<usize>()
        + role.plane.normal.iter().map(bigint_bytes).sum::<usize>()
        + role.plane.oriented_edge_orientations.capacity()
        + role.plane.edge_same_sense.capacity()
        + role
            .placement
            .translation_mm
            .iter()
            .map(ratio_bytes)
            .sum::<usize>()
}

fn number_bytes(value: &SourceNumber) -> usize {
    value.spelling.capacity() + ratio_bytes(&value.millimeters)
}
fn bigint_bytes(value: &BigInt) -> usize {
    ((value.bits() + 7) / 8) as usize
}
fn ratio_bytes(value: &BigRational) -> usize {
    size_of::<BigRational>() + bigint_bytes(value.numer()) + bigint_bytes(value.denom())
}
fn ratio_json(value: &BigRational) -> Json {
    Json::object([
        ("numerator", Json::String(value.numer().to_string())),
        ("denominator", Json::String(value.denom().to_string())),
    ])
}
fn number_json(value: &SourceNumber) -> Json {
    Json::object([
        (
            "span",
            Json::object([
                ("start", number(value.span.start as u64)),
                ("end", number(value.span.end as u64)),
            ]),
        ),
        ("spelling", Json::String(value.spelling.clone())),
        ("millimeters", ratio_json(&value.millimeters)),
    ])
}
fn plane_json(value: &ExactPlane) -> Json {
    Json::object([
        (
            "normal",
            Json::Array(
                value
                    .normal
                    .iter()
                    .map(|item| Json::String(item.to_string()))
                    .collect(),
            ),
        ),
        ("offsetMillimeters", ratio_json(&value.offset_mm)),
        (
            "pointMillimeters",
            Json::Array(value.point_mm.iter().map(ratio_json).collect()),
        ),
        ("sourceSameSense", Json::Bool(value.source_same_sense)),
        (
            "outerBoundOrientation",
            Json::Bool(value.outer_bound_orientation),
        ),
        (
            "orientedEdgeOrientations",
            Json::Array(
                value
                    .oriented_edge_orientations
                    .iter()
                    .copied()
                    .map(Json::Bool)
                    .collect(),
            ),
        ),
        (
            "edgeSameSense",
            Json::Array(
                value
                    .edge_same_sense
                    .iter()
                    .copied()
                    .map(Json::Bool)
                    .collect(),
            ),
        ),
    ])
}
fn placement_json(value: &ExactPlacement) -> Json {
    Json::object([
        (
            "rotation",
            Json::Array(
                value
                    .rotation
                    .iter()
                    .map(|row| {
                        Json::Array(row.iter().map(|item| Json::Number(*item as f64)).collect())
                    })
                    .collect(),
            ),
        ),
        (
            "translationMillimeters",
            Json::Array(value.translation_mm.iter().map(ratio_json).collect()),
        ),
    ])
}
fn number(value: impl Into<u64>) -> Json {
    Json::Number(value.into() as f64)
}

#[derive(Clone, Debug)]
struct Record {
    components: Vec<Entity>,
}
#[derive(Clone, Debug)]
struct Entity {
    name: String,
    args: Vec<Node>,
}
#[derive(Clone, Debug)]
enum Node {
    Ref(u32),
    Str(SourceSpan),
    Enum(SourceSpan),
    Number(SourceSpan),
    List(Vec<Node>),
    Typed(String, Vec<Node>),
    Omitted,
    Derived,
}

struct Graph<'a> {
    source: &'a [u8],
    records: HashMap<u32, Record>,
    reverse: HashMap<u32, Vec<u32>>,
    work: WorkCounts,
    arithmetic: Arithmetic,
    source_numbers: Vec<SourceLexeme>,
}

#[derive(Default)]
struct Arithmetic {
    operations: u64,
}

pub(crate) fn admit(source: &[u8], declaration: Option<u32>) -> Result<AdmittedDimension, F2Error> {
    let mut graph = Graph::parse(source)?;
    let declaration = graph.declaration(declaration)?;
    let dimension = graph.entity(declaration, "DIMENSIONAL_LOCATION")?.clone();
    if dimension.args.len() != 4 || graph.string(&dimension.args[0])? != DECLARATION_NAME {
        return Err(unsupported(
            "The selected dimension does not match the F2 declaration profile.",
        ));
    }
    let aspect_ids = [
        graph.reference(&dimension.args[2])?,
        graph.reference(&dimension.args[3])?,
    ];
    let (lower, upper, unit) = graph.bounds(declaration)?;
    let mut roles = [
        graph.role("first", aspect_ids[0])?,
        graph.role("second", aspect_ids[1])?,
    ];
    if roles[0].key == roles[1].key {
        return Err(unsupported(
            "The F2 roles must identify distinct source faces or occurrence routes.",
        ));
    }
    for role in &mut roles {
        role.plane = transform_plane(&role.plane, &role.placement, &mut graph.arithmetic)?;
    }
    if roles[0].plane.normal != roles[1].plane.normal {
        return Err(F2Error::UnsupportedDomain(
            "The selected source planes are not parallel.".into(),
        ));
    }
    let delta = sub(
        &roles[1].plane.offset_mm,
        &roles[0].plane.offset_mm,
        &mut graph.arithmetic,
    )?;
    let numerator = square(&delta, &mut graph.arithmetic)?;
    let norm_squared =
        roles[0]
            .plane
            .normal
            .iter()
            .try_fold(BigInt::zero(), |sum, component| {
                let term = mul_bigint(component, component)?;
                add_bigint(&sum, &term)
            })?;
    let distance_squared_mm = div_integer(&numerator, &norm_squared, &mut graph.arithmetic)?;
    let lower_squared = square(&lower.millimeters, &mut graph.arithmetic)?;
    let upper_squared = square(&upper.millimeters, &mut graph.arithmetic)?;
    let geometric_pass =
        compare_ratio(&lower_squared, &distance_squared_mm, &mut graph.arithmetic)?
            != std::cmp::Ordering::Greater
            && compare_ratio(&distance_squared_mm, &upper_squared, &mut graph.arithmetic)?
                != std::cmp::Ordering::Greater;
    graph
        .source_numbers
        .sort_by_key(|value| (value.span.start, value.span.end));
    graph
        .source_numbers
        .dedup_by_key(|value| (value.span.start, value.span.end));
    graph.work.rational_operations = graph.arithmetic.operations;
    graph.work.projected_temporary_peak_bytes = parser_heap_bytes(&graph)
        .saturating_add(source.len().saturating_mul(size_of::<SourceSpan>()))
        .saturating_add(256 * 1024);
    let admitted = AdmittedDimension {
        declaration,
        roles,
        lower,
        upper,
        bound_unit_entity: unit.0,
        bound_unit_to_mm: unit.1,
        distance_squared_mm,
        geometric_pass,
        work: graph.work,
        source_numbers: graph.source_numbers,
    };
    if admitted.owned_bytes() > MAX_RETAINED {
        return Err(limit("F2 retained data exceeds 32 MiB."));
    }
    Ok(admitted)
}

impl<'a> Graph<'a> {
    fn parse(source: &'a [u8]) -> Result<Self, F2Error> {
        if source.is_empty() {
            return Err(F2Error::InvalidInput("STEP input is empty.".into()));
        }
        if source.len() > MAX_SOURCE {
            return Err(limit("STEP input exceeds 1 MiB."));
        }
        std::str::from_utf8(source)
            .map_err(|_| F2Error::InvalidInput("STEP input is not UTF-8.".into()))?;
        let spans = record_spans(source)?;
        let mut records = HashMap::with_capacity(spans.len());
        let mut list_items = 0u64;
        for span in spans {
            let (id, record) = Cursor::new(source, span, &mut list_items).record()?;
            if records.insert(id, record).is_some() {
                return Err(unsupported("STEP entity labels must be unique."));
            }
        }
        let mut reverse: HashMap<u32, Vec<u32>> = HashMap::new();
        for (&id, record) in &records {
            let mut refs = Vec::new();
            for component in &record.components {
                collect_refs(&component.args, &mut refs);
            }
            refs.sort_unstable();
            refs.dedup();
            for target in refs {
                reverse.entry(target).or_default().push(id);
            }
        }
        Ok(Self {
            source,
            work: WorkCounts {
                lexical_bytes: source.len() as u64,
                records: records.len() as u64,
                list_items,
                decimals: 0,
                rational_operations: 0,
                projected_temporary_peak_bytes: 0,
            },
            records,
            reverse,
            arithmetic: Arithmetic::default(),
            source_numbers: Vec::new(),
        })
    }

    fn declaration(&self, selected: Option<u32>) -> Result<u32, F2Error> {
        if let Some(id) = selected {
            let entity = self.entity(id, "DIMENSIONAL_LOCATION")?;
            if entity
                .args
                .first()
                .map(|n| self.string(n))
                .transpose()?
                .as_deref()
                == Some(DECLARATION_NAME)
            {
                return Ok(id);
            }
            return Err(unsupported(
                "The selected declaration has the wrong profile name.",
            ));
        }
        let mut matches = self.records.iter().filter_map(|(&id, record)| {
            let entity = record.components.first()?;
            (record.components.len() == 1
                && entity.name == "DIMENSIONAL_LOCATION"
                && entity
                    .args
                    .first()
                    .is_some_and(|n| self.string(n).ok().as_deref() == Some(DECLARATION_NAME)))
            .then_some(id)
        });
        let id = matches
            .next()
            .ok_or_else(|| unsupported("No F2 source declaration exists."))?;
        if matches.next().is_some() {
            return Err(unsupported("More than one F2 source declaration exists."));
        }
        Ok(id)
    }

    fn record(&self, id: u32) -> Result<&Record, F2Error> {
        self.records
            .get(&id)
            .ok_or_else(|| unsupported(format!("STEP entity #{id} is missing.")))
    }
    fn entity(&self, id: u32, name: &str) -> Result<&Entity, F2Error> {
        let record = self.record(id)?;
        if record.components.len() != 1 || record.components[0].name != name {
            return Err(unsupported(format!("STEP entity #{id} must be {name}.")));
        }
        Ok(&record.components[0])
    }
    fn component<'b>(&self, record: &'b Record, name: &str) -> Result<&'b Entity, F2Error> {
        let mut matches = record
            .components
            .iter()
            .filter(|entity| entity.name == name);
        let entity = matches
            .next()
            .ok_or_else(|| unsupported(format!("Complex entity must contain {name}.")))?;
        if matches.next().is_some() {
            return Err(unsupported(format!(
                "Complex entity contains duplicate {name}."
            )));
        }
        Ok(entity)
    }
    fn reference(&self, node: &Node) -> Result<u32, F2Error> {
        if let Node::Ref(id) = node {
            Ok(*id)
        } else {
            Err(unsupported("Expected a scalar entity reference."))
        }
    }
    fn list<'b>(&self, node: &'b Node) -> Result<&'b [Node], F2Error> {
        if let Node::List(items) = node {
            Ok(items)
        } else {
            Err(unsupported("Expected an explicit list."))
        }
    }
    fn string(&self, node: &Node) -> Result<String, F2Error> {
        let Node::Str(span) = node else {
            return Err(unsupported("Expected a STEP string."));
        };
        let text = std::str::from_utf8(&self.source[span.start + 1..span.end - 1])
            .expect("validated UTF-8");
        Ok(text.replace("''", "'"))
    }
    fn boolean(&self, node: &Node) -> Result<bool, F2Error> {
        let Node::Enum(span) = node else {
            return Err(unsupported("Expected .T. or .F.."));
        };
        match &self.source[span.start..span.end] {
            b".T." => Ok(true),
            b".F." => Ok(false),
            _ => Err(unsupported("Expected .T. or .F..")),
        }
    }

    fn bounds(
        &mut self,
        declaration: u32,
    ) -> Result<(SourceNumber, SourceNumber, (u32, BigRational)), F2Error> {
        let refs = self.reverse.get(&declaration).cloned().unwrap_or_default();
        let matches: Vec<u32> = refs
            .into_iter()
            .filter(|id| {
                self.entity(*id, "DIMENSIONAL_CHARACTERISTIC_REPRESENTATION")
                    .is_ok()
            })
            .collect();
        if matches.len() != 1 {
            return Err(unsupported(
                "Dimension must have exactly one characteristic representation.",
            ));
        }
        let link = self
            .entity(matches[0], "DIMENSIONAL_CHARACTERISTIC_REPRESENTATION")?
            .clone();
        if link.args.len() != 2 || self.reference(&link.args[0])? != declaration {
            return Err(unsupported("Malformed characteristic representation."));
        }
        let representation_id = self.reference(&link.args[1])?;
        let representation = self
            .entity(representation_id, "SHAPE_DIMENSION_REPRESENTATION")?
            .clone();
        if representation.args.len() != 3 {
            return Err(unsupported("Malformed shape dimension representation."));
        }
        let items = self.list(&representation.args[1])?.to_vec();
        if items.len() != 2 {
            return Err(unsupported(
                "F2 requires exactly lower and upper bound items.",
            ));
        }
        let lower = self.bound_item(self.reference(&items[0])?, "lower limit")?;
        let upper = self.bound_item(self.reference(&items[1])?, "upper limit")?;
        if lower.1 != upper.1 {
            return Err(unsupported("F2 bounds must use the same SI unit entity."));
        }
        let scale = self.unit_scale(lower.1)?;
        let mut lower_number = self.decimal(lower.0, &scale)?;
        let mut upper_number = self.decimal(upper.0, &scale)?;
        lower_number.millimeters = mul(&lower_number.millimeters, &scale, &mut self.arithmetic)?;
        upper_number.millimeters = mul(&upper_number.millimeters, &scale, &mut self.arithmetic)?;
        if lower_number.millimeters.is_negative()
            || upper_number.millimeters <= lower_number.millimeters
            || upper_number.millimeters.is_zero()
        {
            return Err(unsupported("F2 requires 0 <= lower < upper."));
        }
        Ok((lower_number, upper_number, (lower.1, scale)))
    }

    fn bound_item(&self, id: u32, expected_name: &str) -> Result<(SourceSpan, u32), F2Error> {
        let record = self.record(id)?;
        if record.components.len() != 4 {
            return Err(unsupported(
                "F2 bound item must use the four-component complex form.",
            ));
        }
        for name in ["LENGTH_MEASURE_WITH_UNIT", "MEASURE_REPRESENTATION_ITEM"] {
            self.component(record, name)?;
        }
        let measure = self.component(record, "MEASURE_WITH_UNIT")?;
        let item = self.component(record, "REPRESENTATION_ITEM")?;
        if measure.args.len() != 2
            || item.args.len() != 1
            || self.string(&item.args[0])? != expected_name
        {
            return Err(unsupported("F2 bound item name or arity is unsupported."));
        }
        let Node::Typed(kind, values) = &measure.args[0] else {
            return Err(unsupported("Bound must be a typed LENGTH_MEASURE."));
        };
        if kind != "LENGTH_MEASURE" || values.len() != 1 {
            return Err(unsupported("Bound must be a scalar LENGTH_MEASURE."));
        }
        let Node::Number(span) = values[0] else {
            return Err(unsupported("Bound must contain an exact decimal."));
        };
        Ok((span, self.reference(&measure.args[1])?))
    }

    fn unit_scale(&self, id: u32) -> Result<BigRational, F2Error> {
        let record = self.record(id)?;
        for name in ["LENGTH_UNIT", "NAMED_UNIT"] {
            self.component(record, name)?;
        }
        let si = self.component(record, "SI_UNIT")?;
        if si.args.len() != 2 {
            return Err(unsupported("Malformed direct SI length unit."));
        }
        let metre = matches!(&si.args[1], Node::Enum(span) if &self.source[span.start..span.end] == b".METRE.");
        if !metre {
            return Err(unsupported(
                "Only direct SI metre length units are supported.",
            ));
        }
        match &si.args[0] {
            Node::Omitted => Ok(BigRational::from_integer(1000.into())),
            Node::Enum(span) if &self.source[span.start..span.end] == b".MILLI." => {
                Ok(BigRational::one())
            }
            Node::Enum(span) if &self.source[span.start..span.end] == b".CENTI." => {
                Ok(BigRational::from_integer(10.into()))
            }
            _ => Err(unsupported(
                "Only metre, centimetre and millimetre SI units are supported.",
            )),
        }
    }

    fn representation_unit(&self, id: u32) -> Result<BigRational, F2Error> {
        let representation = self
            .record(id)?
            .components
            .first()
            .ok_or_else(|| unsupported("Representation is missing."))?;
        if representation.args.len() != 3 {
            return Err(unsupported("Malformed geometry representation."));
        }
        let context = self.record(self.reference(&representation.args[2])?)?;
        let units = self.component(context, "GLOBAL_UNIT_ASSIGNED_CONTEXT")?;
        if units.args.len() != 1 {
            return Err(unsupported("Malformed representation unit context."));
        }
        let mut length = Vec::new();
        for unit in self.list(&units.args[0])? {
            let id = self.reference(unit)?;
            if self
                .record(id)?
                .components
                .iter()
                .any(|part| part.name == "LENGTH_UNIT")
            {
                length.push(id);
            }
        }
        if length.len() != 1 {
            return Err(unsupported(
                "Representation must have exactly one direct SI length unit.",
            ));
        }
        self.unit_scale(length[0])
    }

    fn decimal(&mut self, span: SourceSpan, _scale: &BigRational) -> Result<SourceNumber, F2Error> {
        self.work.decimals += 1;
        if self.work.decimals > MAX_DECIMALS {
            return Err(limit("Exact decimal construction limit exceeded."));
        }
        let spelling = std::str::from_utf8(&self.source[span.start..span.end])
            .expect("validated UTF-8")
            .to_owned();
        let value = parse_decimal(&spelling)?;
        self.source_numbers.push(SourceLexeme {
            span,
            spelling: spelling.clone(),
        });
        Ok(SourceNumber {
            span,
            spelling,
            millimeters: value,
        })
    }

    fn role(&mut self, name: &'static str, aspect_id: u32) -> Result<Role, F2Error> {
        let aspect = self.entity(aspect_id, "SHAPE_ASPECT")?.clone();
        if aspect.args.len() != 4 {
            return Err(unsupported("Malformed role SHAPE_ASPECT."));
        }
        let occurrence_pds = self.reference(&aspect.args[2])?;
        let pds = self
            .entity(occurrence_pds, "PRODUCT_DEFINITION_SHAPE")?
            .clone();
        if pds.args.len() != 3 {
            return Err(unsupported(
                "Malformed occurrence PRODUCT_DEFINITION_SHAPE.",
            ));
        }
        let nauo = self.reference(&pds.args[2])?;
        self.entity(nauo, "NEXT_ASSEMBLY_USAGE_OCCURRENCE")?;
        let refs = self.reverse.get(&aspect_id).cloned().unwrap_or_default();
        let usages: Vec<u32> = refs
            .into_iter()
            .filter(|id| self.entity(*id, "GEOMETRIC_ITEM_SPECIFIC_USAGE").is_ok())
            .collect();
        if usages.len() != 1 {
            return Err(unsupported("Each F2 role requires exactly one GISU."));
        }
        let usage = self
            .entity(usages[0], "GEOMETRIC_ITEM_SPECIFIC_USAGE")?
            .clone();
        if usage.args.len() != 5 || self.reference(&usage.args[2])? != aspect_id {
            return Err(unsupported("Malformed F2 GISU."));
        }
        let child_representation = self.reference(&usage.args[3])?;
        let face = self.reference(&usage.args[4])?;
        self.entity(face, "ADVANCED_FACE")?;
        if !self.reachable(child_representation, face)? {
            return Err(unsupported(
                "GISU face is outside the child representation BRep closure.",
            ));
        }
        let (route, placement) = self.occurrence_route(nauo, child_representation)?;
        let scale = self.representation_unit(child_representation)?;
        let plane = self.face_plane(face, &scale)?;
        Ok(Role {
            name,
            key: SourceFaceKey {
                source_face_entity: face,
                occurrence_route: route,
            },
            plane,
            placement,
        })
    }

    fn reachable(&self, representation: u32, target: u32) -> Result<bool, F2Error> {
        let mut pending = vec![representation];
        let mut visited = HashSet::new();
        while let Some(id) = pending.pop() {
            if id == target {
                return Ok(true);
            }
            if !visited.insert(id) {
                continue;
            }
            if visited.len() > MAX_RECORDS {
                return Err(limit("Representation closure exceeds record limit."));
            }
            if let Some(record) = self.records.get(&id) {
                for component in &record.components {
                    collect_refs(&component.args, &mut pending);
                }
            }
        }
        Ok(false)
    }

    fn occurrence_route(
        &mut self,
        leaf: u32,
        child_representation: u32,
    ) -> Result<(Vec<u32>, ExactPlacement), F2Error> {
        let mut reverse_route = Vec::new();
        let mut current = leaf;
        let mut expected_child = child_representation;
        let mut placement = ExactPlacement::identity();
        loop {
            if reverse_route.len() >= MAX_ROUTE {
                return Err(limit("Occurrence route exceeds 32 links."));
            }
            let link = self.occurrence_link(current, expected_child)?;
            placement = compose(&link.placement, &placement, &mut self.arithmetic)?;
            reverse_route.push(current);
            let parents: Vec<u32> = self
                .records
                .iter()
                .filter_map(|(&id, record)| {
                    let entity = (record.components.len() == 1
                        && record.components[0].name == "NEXT_ASSEMBLY_USAGE_OCCURRENCE")
                        .then_some(&record.components[0])?;
                    (entity.args.len() == 6
                        && self.reference(&entity.args[4]).ok() == Some(link.parent_product))
                    .then_some(id)
                })
                .collect();
            match parents.as_slice() {
                [] => break,
                [parent] => {
                    current = *parent;
                    expected_child = link.parent_representation;
                }
                _ => return Err(unsupported("Occurrence ancestry is ambiguous.")),
            }
        }
        reverse_route.reverse();
        Ok((reverse_route, placement))
    }

    fn occurrence_link(
        &mut self,
        nauo_id: u32,
        expected_child: u32,
    ) -> Result<OccurrenceLink, F2Error> {
        let nauo = self
            .entity(nauo_id, "NEXT_ASSEMBLY_USAGE_OCCURRENCE")?
            .clone();
        if nauo.args.len() != 6 {
            return Err(unsupported("Malformed NEXT_ASSEMBLY_USAGE_OCCURRENCE."));
        }
        let parent_product = self.reference(&nauo.args[3])?;
        let child_product = self.reference(&nauo.args[4])?;
        let pds_ids: Vec<u32> = self
            .reverse
            .get(&nauo_id)
            .cloned()
            .unwrap_or_default()
            .into_iter()
            .filter(|id| self.entity(*id, "PRODUCT_DEFINITION_SHAPE").is_ok())
            .collect();
        if pds_ids.len() != 1 {
            return Err(unsupported(
                "NAUO must have exactly one occurrence PRODUCT_DEFINITION_SHAPE.",
            ));
        }
        let cdsr_ids: Vec<u32> = self
            .reverse
            .get(&pds_ids[0])
            .cloned()
            .unwrap_or_default()
            .into_iter()
            .filter(|id| {
                self.entity(*id, "CONTEXT_DEPENDENT_SHAPE_REPRESENTATION")
                    .is_ok()
            })
            .collect();
        if cdsr_ids.len() != 1 {
            return Err(unsupported(
                "Occurrence must have exactly one context-dependent representation.",
            ));
        }
        let cdsr = self
            .entity(cdsr_ids[0], "CONTEXT_DEPENDENT_SHAPE_REPRESENTATION")?
            .clone();
        if cdsr.args.len() != 2 || self.reference(&cdsr.args[1])? != pds_ids[0] {
            return Err(unsupported("Malformed context-dependent representation."));
        }
        let relationship = self.record(self.reference(&cdsr.args[0])?)?.clone();
        for name in [
            "REPRESENTATION_RELATIONSHIP_WITH_TRANSFORMATION",
            "SHAPE_REPRESENTATION_RELATIONSHIP",
        ] {
            self.component(&relationship, name)?;
        }
        let rel = self.component(&relationship, "REPRESENTATION_RELATIONSHIP")?;
        let transformed = self.component(
            &relationship,
            "REPRESENTATION_RELATIONSHIP_WITH_TRANSFORMATION",
        )?;
        if rel.args.len() != 4 || transformed.args.len() != 1 {
            return Err(unsupported("Malformed representation relationship."));
        }
        let child_representation = self.reference(&rel.args[2])?;
        let parent_representation = self.reference(&rel.args[3])?;
        if child_representation != expected_child {
            return Err(unsupported(
                "Occurrence relationship child representation disagrees with GISU.",
            ));
        }
        if self.representation_product(child_representation)? != child_product
            || self.representation_product(parent_representation)? != parent_product
        {
            return Err(unsupported(
                "Occurrence product definitions disagree with the representation relationship.",
            ));
        }
        let transform = self
            .entity(
                self.reference(&transformed.args[0])?,
                "ITEM_DEFINED_TRANSFORMATION",
            )?
            .clone();
        if transform.args.len() != 4 {
            return Err(unsupported("Malformed item-defined transformation."));
        }
        let child_placement = self.reference(&transform.args[2])?;
        let parent_placement = self.reference(&transform.args[3])?;
        self.require_rep_item(child_representation, child_placement)?;
        self.require_rep_item(parent_representation, parent_placement)?;
        let child_scale = self.representation_unit(child_representation)?;
        let parent_scale = self.representation_unit(parent_representation)?;
        let child_frame = self.signed_frame(child_placement, &child_scale)?;
        let parent_frame = self.signed_frame(parent_placement, &parent_scale)?;
        Ok(OccurrenceLink {
            parent_product,
            parent_representation,
            placement: between(&child_frame, &parent_frame, &mut self.arithmetic)?,
        })
    }

    fn representation_product(&self, representation: u32) -> Result<u32, F2Error> {
        let links: Vec<u32> = self
            .reverse
            .get(&representation)
            .cloned()
            .unwrap_or_default()
            .into_iter()
            .filter(|id| self.entity(*id, "SHAPE_DEFINITION_REPRESENTATION").is_ok())
            .collect();
        if links.len() != 1 {
            return Err(unsupported(
                "Representation must have exactly one shape-definition relationship.",
            ));
        }
        let link = self.entity(links[0], "SHAPE_DEFINITION_REPRESENTATION")?;
        if link.args.len() != 2 || self.reference(&link.args[1])? != representation {
            return Err(unsupported("Malformed shape-definition relationship."));
        }
        let pds = self.entity(self.reference(&link.args[0])?, "PRODUCT_DEFINITION_SHAPE")?;
        if pds.args.len() != 3 {
            return Err(unsupported("Malformed product-definition shape."));
        }
        self.reference(&pds.args[2])
    }

    fn require_rep_item(&self, representation: u32, item: u32) -> Result<(), F2Error> {
        let entity = self
            .record(representation)?
            .components
            .first()
            .ok_or_else(|| unsupported("Representation is missing."))?;
        if entity.args.len() != 3
            || !self
                .list(&entity.args[1])?
                .iter()
                .any(|node| self.reference(node).ok() == Some(item))
        {
            return Err(unsupported(
                "Transformation placement is not an item of its representation.",
            ));
        }
        Ok(())
    }

    fn signed_frame(&mut self, placement: u32, scale: &BigRational) -> Result<Frame, F2Error> {
        let entity = self.entity(placement, "AXIS2_PLACEMENT_3D")?.clone();
        if entity.args.len() != 4 {
            return Err(unsupported(
                "Occurrence placement must have explicit axis and reference direction.",
            ));
        }
        let origin = self.point(self.reference(&entity.args[1])?, scale)?;
        let z = signed_axis(&self.direction(self.reference(&entity.args[2])?)?)?;
        let x = signed_axis(&self.direction(self.reference(&entity.args[3])?)?)?;
        if dot_i8(x, z) != 0 {
            return Err(unsupported(
                "Occurrence placement axes must be distinct signed axes.",
            ));
        }
        let y = cross_i8(z, x);
        Ok(Frame {
            basis: columns(x, y, z),
            origin,
        })
    }

    fn point(&mut self, id: u32, scale: &BigRational) -> Result<[BigRational; 3], F2Error> {
        let point = self.entity(id, "CARTESIAN_POINT")?.clone();
        if point.args.len() != 2 {
            return Err(unsupported("Malformed CARTESIAN_POINT."));
        }
        let values = self.list(&point.args[1])?.to_vec();
        if values.len() != 3 {
            return Err(unsupported("F2 requires three-dimensional points."));
        }
        let mut output = [
            BigRational::zero(),
            BigRational::zero(),
            BigRational::zero(),
        ];
        for index in 0..3 {
            let Node::Number(span) = values[index] else {
                return Err(unsupported("Point coordinates must be exact decimals."));
            };
            let number = self.decimal(span, scale)?;
            output[index] = mul(&number.millimeters, scale, &mut self.arithmetic)?;
        }
        Ok(output)
    }

    fn direction(&mut self, id: u32) -> Result<[BigRational; 3], F2Error> {
        let direction = self.entity(id, "DIRECTION")?.clone();
        if direction.args.len() != 2 {
            return Err(unsupported("Malformed DIRECTION."));
        }
        let values = self.list(&direction.args[1])?.to_vec();
        if values.len() != 3 {
            return Err(unsupported("F2 requires three-dimensional directions."));
        }
        let mut output = [
            BigRational::zero(),
            BigRational::zero(),
            BigRational::zero(),
        ];
        for index in 0..3 {
            let Node::Number(span) = values[index] else {
                return Err(unsupported("Direction ratios must be exact decimals."));
            };
            output[index] = self.decimal(span, &BigRational::one())?.millimeters;
        }
        if output.iter().all(BigRational::is_zero) {
            return Err(unsupported("Direction must be nonzero."));
        }
        Ok(output)
    }

    fn face_plane(&mut self, face_id: u32, scale: &BigRational) -> Result<ExactPlane, F2Error> {
        let face = self.entity(face_id, "ADVANCED_FACE")?.clone();
        if face.args.len() != 4 {
            return Err(unsupported("Malformed ADVANCED_FACE."));
        }
        let bounds = self.list(&face.args[1])?.to_vec();
        if bounds.len() != 1 {
            return Err(F2Error::UnsupportedDomain(
                "F2 face must have exactly one outer bound.".into(),
            ));
        }
        let bound = self
            .entity(self.reference(&bounds[0])?, "FACE_OUTER_BOUND")?
            .clone();
        if bound.args.len() != 3 {
            return Err(unsupported("Malformed FACE_OUTER_BOUND."));
        }
        let outer_bound_orientation = self.boolean(&bound.args[2])?;
        let plane = self
            .entity(self.reference(&face.args[2])?, "PLANE")?
            .clone();
        if plane.args.len() != 2 {
            return Err(unsupported("Malformed PLANE."));
        }
        let placement = self
            .entity(self.reference(&plane.args[1])?, "AXIS2_PLACEMENT_3D")?
            .clone();
        if placement.args.len() != 4 {
            return Err(unsupported(
                "Plane placement must have explicit directions.",
            ));
        }
        let point = self.point(self.reference(&placement.args[1])?, scale)?;
        let normal = self.direction(self.reference(&placement.args[2])?)?;
        let reference = self.direction(self.reference(&placement.args[3])?)?;
        if cross(&normal, &reference, &mut self.arithmetic)?
            .iter()
            .all(BigRational::is_zero)
        {
            return Err(F2Error::UnsupportedDomain(
                "Plane directions are parallel.".into(),
            ));
        }
        let loop_entity = self
            .entity(self.reference(&bound.args[1])?, "EDGE_LOOP")?
            .clone();
        if loop_entity.args.len() != 2 {
            return Err(unsupported("Malformed EDGE_LOOP."));
        }
        let edge_nodes = self.list(&loop_entity.args[1])?.to_vec();
        if !(3..=MAX_EDGES).contains(&edge_nodes.len()) {
            return Err(F2Error::UnsupportedDomain(
                "F2 face requires 3-8 straight edges.".into(),
            ));
        }
        let mut edge_ids = HashSet::new();
        let mut curves = HashSet::new();
        let mut vertices = Vec::new();
        let mut points = Vec::new();
        let mut oriented = Vec::new();
        let mut same_sense = Vec::new();
        for edge_node in edge_nodes {
            let oriented_id = self.reference(&edge_node)?;
            if !edge_ids.insert(oriented_id) {
                return Err(F2Error::UnsupportedDomain(
                    "Oriented edges must be distinct.".into(),
                ));
            }
            let oriented_edge = self.entity(oriented_id, "ORIENTED_EDGE")?.clone();
            if oriented_edge.args.len() != 5 {
                return Err(unsupported("Malformed ORIENTED_EDGE."));
            }
            if !matches!(oriented_edge.args[1], Node::Derived)
                || !matches!(oriented_edge.args[2], Node::Derived)
            {
                return Err(unsupported(
                    "F2 oriented-edge endpoints must be inherited from the edge curve.",
                ));
            }
            let forward = self.boolean(&oriented_edge.args[4])?;
            let curve_id = self.reference(&oriented_edge.args[3])?;
            if !curves.insert(curve_id) {
                return Err(F2Error::UnsupportedDomain(
                    "Edge curves must be distinct.".into(),
                ));
            }
            let edge = self.entity(curve_id, "EDGE_CURVE")?.clone();
            if edge.args.len() != 5 {
                return Err(unsupported("Malformed EDGE_CURVE."));
            }
            let mut ends = [
                self.reference(&edge.args[1])?,
                self.reference(&edge.args[2])?,
            ];
            if !forward {
                ends.swap(0, 1);
            }
            let start = self.vertex(ends[0], scale)?;
            let end = self.vertex(ends[1], scale)?;
            self.line_incidence(self.reference(&edge.args[3])?, &start, &end, scale)?;
            vertices.push(ends[0]);
            points.push(start);
            points.push(end);
            oriented.push(forward);
            same_sense.push(self.boolean(&edge.args[4])?);
        }
        for index in 0..vertices.len() {
            if points[index * 2 + 1] != points[((index + 1) % vertices.len()) * 2] {
                return Err(F2Error::UnsupportedDomain(
                    "Trim edges do not form an exact directed cycle.".into(),
                ));
            }
        }
        if vertices.iter().collect::<HashSet<_>>().len() != vertices.len() {
            return Err(F2Error::UnsupportedDomain(
                "Trim vertices must be distinct.".into(),
            ));
        }
        let polygon: Vec<[BigRational; 3]> =
            (0..vertices.len()).map(|i| points[i * 2].clone()).collect();
        for vertex in &polygon {
            let delta = sub_vec(vertex, &point, &mut self.arithmetic)?;
            if !dot(&normal, &delta, &mut self.arithmetic)?.is_zero() {
                return Err(F2Error::UnsupportedDomain(
                    "Trimmed face is nonplanar.".into(),
                ));
            }
        }
        qualify_polygon(&polygon, &normal, &mut self.arithmetic)?;
        let (primitive, offset) = canonical_plane(&normal, &point, &mut self.arithmetic)?;
        Ok(ExactPlane {
            normal: primitive,
            offset_mm: offset,
            point_mm: point,
            source_same_sense: self.boolean(&face.args[3])?,
            outer_bound_orientation,
            oriented_edge_orientations: oriented,
            edge_same_sense: same_sense,
        })
    }

    fn vertex(&mut self, id: u32, scale: &BigRational) -> Result<[BigRational; 3], F2Error> {
        let vertex = self.entity(id, "VERTEX_POINT")?.clone();
        if vertex.args.len() != 2 {
            return Err(unsupported("Malformed VERTEX_POINT."));
        }
        self.point(self.reference(&vertex.args[1])?, scale)
    }

    fn line_incidence(
        &mut self,
        id: u32,
        start: &[BigRational; 3],
        end: &[BigRational; 3],
        scale: &BigRational,
    ) -> Result<(), F2Error> {
        let line = self.entity(id, "LINE")?.clone();
        if line.args.len() != 3 {
            return Err(F2Error::UnsupportedDomain(
                "F2 trim geometry must be LINE.".into(),
            ));
        }
        let origin = self.point(self.reference(&line.args[1])?, scale)?;
        let vector = self
            .entity(self.reference(&line.args[2])?, "VECTOR")?
            .clone();
        if vector.args.len() != 3 {
            return Err(unsupported("Malformed VECTOR."));
        }
        let direction = self.direction(self.reference(&vector.args[1])?)?;
        let Node::Number(magnitude_span) = &vector.args[2] else {
            return Err(unsupported(
                "LINE vector magnitude must be an exact decimal.",
            ));
        };
        if !self
            .decimal(*magnitude_span, &BigRational::one())?
            .millimeters
            .is_positive()
        {
            return Err(F2Error::UnsupportedDomain(
                "LINE vector magnitude must be positive.".into(),
            ));
        }
        for point in [start, end] {
            if !cross(
                &sub_vec(point, &origin, &mut self.arithmetic)?,
                &direction,
                &mut self.arithmetic,
            )?
            .iter()
            .all(BigRational::is_zero)
            {
                return Err(F2Error::UnsupportedDomain(
                    "Trim endpoint is not incident on its source LINE.".into(),
                ));
            }
        }
        Ok(())
    }
}

struct OccurrenceLink {
    parent_product: u32,
    parent_representation: u32,
    placement: ExactPlacement,
}
struct Frame {
    basis: [[i8; 3]; 3],
    origin: [BigRational; 3],
}

impl ExactPlacement {
    fn identity() -> Self {
        Self {
            rotation: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
            translation_mm: std::array::from_fn(|_| BigRational::zero()),
        }
    }
}

fn between(
    child: &Frame,
    parent: &Frame,
    arithmetic: &mut Arithmetic,
) -> Result<ExactPlacement, F2Error> {
    let rotation = mul_matrix(parent.basis, transpose(child.basis));
    let rotated_child = apply_i8(rotation, &child.origin, arithmetic)?;
    Ok(ExactPlacement {
        rotation,
        translation_mm: sub_vec(&parent.origin, &rotated_child, arithmetic)?,
    })
}
fn compose(
    outer: &ExactPlacement,
    inner: &ExactPlacement,
    arithmetic: &mut Arithmetic,
) -> Result<ExactPlacement, F2Error> {
    let rotation = mul_matrix(outer.rotation, inner.rotation);
    let translated = apply_i8(outer.rotation, &inner.translation_mm, arithmetic)?;
    Ok(ExactPlacement {
        rotation,
        translation_mm: add_vec(&translated, &outer.translation_mm, arithmetic)?,
    })
}
fn transform_plane(
    plane: &ExactPlane,
    placement: &ExactPlacement,
    arithmetic: &mut Arithmetic,
) -> Result<ExactPlane, F2Error> {
    let rational_normal = plane.normal.clone().map(BigRational::from_integer);
    let normal = apply_i8(placement.rotation, &rational_normal, arithmetic)?;
    let point = add_vec(
        &apply_i8(placement.rotation, &plane.point_mm, arithmetic)?,
        &placement.translation_mm,
        arithmetic,
    )?;
    let (primitive, offset) = canonical_plane(&normal, &point, arithmetic)?;
    let mut result = plane.clone();
    result.normal = primitive;
    result.offset_mm = offset;
    result.point_mm = point;
    Ok(result)
}

fn signed_axis(value: &[BigRational; 3]) -> Result<[i8; 3], F2Error> {
    let mut result = [0; 3];
    let mut found = false;
    for i in 0..3 {
        if value[i].is_zero() {
            continue;
        }
        if found || value[i].abs() != BigRational::one() {
            return Err(unsupported(
                "Occurrence directions must be signed unit axes.",
            ));
        }
        result[i] = if value[i].is_positive() { 1 } else { -1 };
        found = true;
    }
    if !found {
        return Err(unsupported("Occurrence direction is zero."));
    }
    Ok(result)
}
fn dot_i8(a: [i8; 3], b: [i8; 3]) -> i8 {
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}
fn cross_i8(a: [i8; 3], b: [i8; 3]) -> [i8; 3] {
    [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    ]
}
fn columns(x: [i8; 3], y: [i8; 3], z: [i8; 3]) -> [[i8; 3]; 3] {
    [[x[0], y[0], z[0]], [x[1], y[1], z[1]], [x[2], y[2], z[2]]]
}
fn transpose(a: [[i8; 3]; 3]) -> [[i8; 3]; 3] {
    std::array::from_fn(|i| std::array::from_fn(|j| a[j][i]))
}
fn mul_matrix(a: [[i8; 3]; 3], b: [[i8; 3]; 3]) -> [[i8; 3]; 3] {
    std::array::from_fn(|i| std::array::from_fn(|j| (0..3).map(|k| a[i][k] * b[k][j]).sum()))
}

fn qualify_polygon(
    points: &[[BigRational; 3]],
    normal: &[BigRational; 3],
    arithmetic: &mut Arithmetic,
) -> Result<(), F2Error> {
    let drop = normal
        .iter()
        .position(|v| !v.is_zero())
        .ok_or_else(|| unsupported("Plane normal is zero."))?;
    let project = |p: &[BigRational; 3]| -> [BigRational; 2] {
        match drop {
            0 => [p[1].clone(), p[2].clone()],
            1 => [p[0].clone(), p[2].clone()],
            _ => [p[0].clone(), p[1].clone()],
        }
    };
    let planar: Vec<_> = points.iter().map(project).collect();
    let mut sign = None;
    for i in 0..planar.len() {
        let a = &planar[i];
        let b = &planar[(i + 1) % planar.len()];
        let c = &planar[(i + 2) % planar.len()];
        let turn = orient2(a, b, c, arithmetic)?;
        if turn.is_zero() {
            return Err(F2Error::UnsupportedDomain(
                "Trim polygon has zero area or a collinear turn.".into(),
            ));
        }
        let current = turn.is_positive();
        if sign.replace(current).is_some_and(|old| old != current) {
            return Err(F2Error::UnsupportedDomain(
                "Trim polygon is not strictly convex.".into(),
            ));
        }
    }
    for i in 0..planar.len() {
        for j in i + 1..planar.len() {
            if j == i + 1 || (i == 0 && j + 1 == planar.len()) {
                continue;
            }
            if segments_intersect(
                &planar[i],
                &planar[(i + 1) % planar.len()],
                &planar[j],
                &planar[(j + 1) % planar.len()],
                arithmetic,
            )? {
                return Err(F2Error::UnsupportedDomain(
                    "Trim polygon self-intersects.".into(),
                ));
            }
        }
    }
    Ok(())
}
fn orient2(
    a: &[BigRational; 2],
    b: &[BigRational; 2],
    c: &[BigRational; 2],
    arithmetic: &mut Arithmetic,
) -> Result<BigRational, F2Error> {
    let abx = sub(&b[0], &a[0], arithmetic)?;
    let aby = sub(&b[1], &a[1], arithmetic)?;
    let acx = sub(&c[0], &a[0], arithmetic)?;
    let acy = sub(&c[1], &a[1], arithmetic)?;
    sub(
        &mul(&abx, &acy, arithmetic)?,
        &mul(&aby, &acx, arithmetic)?,
        arithmetic,
    )
}
fn segments_intersect(
    a: &[BigRational; 2],
    b: &[BigRational; 2],
    c: &[BigRational; 2],
    d: &[BigRational; 2],
    arithmetic: &mut Arithmetic,
) -> Result<bool, F2Error> {
    let o1 = orient2(a, b, c, arithmetic)?;
    let o2 = orient2(a, b, d, arithmetic)?;
    let o3 = orient2(c, d, a, arithmetic)?;
    let o4 = orient2(c, d, b, arithmetic)?;
    Ok(!o1.is_zero()
        && !o2.is_zero()
        && !o3.is_zero()
        && !o4.is_zero()
        && o1.is_positive() != o2.is_positive()
        && o3.is_positive() != o4.is_positive())
}

fn canonical_plane(
    normal: &[BigRational; 3],
    point: &[BigRational; 3],
    arithmetic: &mut Arithmetic,
) -> Result<([BigInt; 3], BigRational), F2Error> {
    let mut lcm = BigInt::one();
    for value in normal {
        let gcd = lcm.gcd(value.denom());
        lcm = mul_bigint(&(&lcm / &gcd), value.denom())?;
    }
    let mut integer: [BigInt; 3] = std::array::from_fn(|_| BigInt::zero());
    for i in 0..3 {
        integer[i] = mul_bigint(normal[i].numer(), &(&lcm / normal[i].denom()))?;
    }
    let gcd = integer.iter().fold(BigInt::zero(), |g, v| g.gcd(v));
    if gcd.is_zero() {
        return Err(unsupported("Plane normal is zero."));
    }
    for value in &mut integer {
        *value = checked_bigint(&*value / &gcd)?;
    }
    if integer
        .iter()
        .find(|v| !v.is_zero())
        .is_some_and(BigInt::is_negative)
    {
        for value in &mut integer {
            *value = -value.clone();
        }
    }
    let rational = integer.clone().map(BigRational::from_integer);
    let offset = dot(&rational, point, arithmetic)?;
    Ok((integer, offset))
}
fn add_vec(
    a: &[BigRational; 3],
    b: &[BigRational; 3],
    arithmetic: &mut Arithmetic,
) -> Result<[BigRational; 3], F2Error> {
    let mut out = std::array::from_fn(|_| BigRational::zero());
    for i in 0..3 {
        out[i] = add(&a[i], &b[i], arithmetic)?;
    }
    Ok(out)
}
fn sub_vec(
    a: &[BigRational; 3],
    b: &[BigRational; 3],
    arithmetic: &mut Arithmetic,
) -> Result<[BigRational; 3], F2Error> {
    let mut out = std::array::from_fn(|_| BigRational::zero());
    for i in 0..3 {
        out[i] = sub(&a[i], &b[i], arithmetic)?;
    }
    Ok(out)
}
fn apply_i8(
    matrix: [[i8; 3]; 3],
    value: &[BigRational; 3],
    arithmetic: &mut Arithmetic,
) -> Result<[BigRational; 3], F2Error> {
    let mut out = std::array::from_fn(|_| BigRational::zero());
    for i in 0..3 {
        for j in 0..3 {
            if matrix[i][j] != 0 {
                let term = if matrix[i][j] > 0 {
                    value[j].clone()
                } else {
                    -value[j].clone()
                };
                out[i] = add(&out[i], &term, arithmetic)?;
            }
        }
    }
    Ok(out)
}
fn cross(
    a: &[BigRational; 3],
    b: &[BigRational; 3],
    arithmetic: &mut Arithmetic,
) -> Result<[BigRational; 3], F2Error> {
    Ok([
        sub(
            &mul(&a[1], &b[2], arithmetic)?,
            &mul(&a[2], &b[1], arithmetic)?,
            arithmetic,
        )?,
        sub(
            &mul(&a[2], &b[0], arithmetic)?,
            &mul(&a[0], &b[2], arithmetic)?,
            arithmetic,
        )?,
        sub(
            &mul(&a[0], &b[1], arithmetic)?,
            &mul(&a[1], &b[0], arithmetic)?,
            arithmetic,
        )?,
    ])
}
fn dot(
    a: &[BigRational; 3],
    b: &[BigRational; 3],
    arithmetic: &mut Arithmetic,
) -> Result<BigRational, F2Error> {
    let mut sum = BigRational::zero();
    for i in 0..3 {
        sum = add(&sum, &mul(&a[i], &b[i], arithmetic)?, arithmetic)?;
    }
    Ok(sum)
}

fn charged(arithmetic: &mut Arithmetic) -> Result<(), F2Error> {
    arithmetic.operations += 1;
    if arithmetic.operations > MAX_RATIONAL_OPS {
        Err(limit("Checked rational-operation limit exceeded."))
    } else {
        Ok(())
    }
}
fn checked_bigint(value: BigInt) -> Result<BigInt, F2Error> {
    if value.bits() > MAX_BITS {
        Err(limit("Exact integer exceeds 12,416 bits."))
    } else {
        Ok(value)
    }
}
fn add_bigint(a: &BigInt, b: &BigInt) -> Result<BigInt, F2Error> {
    if a.bits().max(b.bits()).saturating_add(1) > MAX_BITS {
        return Err(limit("Exact integer sum exceeds 12,416 bits."));
    }
    checked_bigint(a + b)
}
fn checked_ratio(n: BigInt, d: BigInt) -> Result<BigRational, F2Error> {
    let n = checked_bigint(n)?;
    let d = checked_bigint(d)?;
    if d.is_zero() {
        return Err(unsupported("Exact division by zero."));
    }
    let value = BigRational::new(n, d);
    checked_bigint(value.numer().clone())?;
    checked_bigint(value.denom().clone())?;
    Ok(value)
}
fn add(
    a: &BigRational,
    b: &BigRational,
    arithmetic: &mut Arithmetic,
) -> Result<BigRational, F2Error> {
    charged(arithmetic)?;
    let g = a.denom().gcd(b.denom());
    let af = b.denom() / &g;
    let bf = a.denom() / &g;
    let left = mul_bigint(a.numer(), &af)?;
    let right = mul_bigint(b.numer(), &bf)?;
    let n = add_bigint(&left, &right)?;
    let d = mul_bigint(a.denom(), &af)?;
    checked_ratio(n, d)
}
fn sub(
    a: &BigRational,
    b: &BigRational,
    arithmetic: &mut Arithmetic,
) -> Result<BigRational, F2Error> {
    let neg = checked_ratio(-b.numer().clone(), b.denom().clone())?;
    add(a, &neg, arithmetic)
}
fn mul(
    a: &BigRational,
    b: &BigRational,
    arithmetic: &mut Arithmetic,
) -> Result<BigRational, F2Error> {
    charged(arithmetic)?;
    let g1 = a.numer().gcd(b.denom());
    let g2 = b.numer().gcd(a.denom());
    checked_ratio(
        mul_bigint(&(a.numer() / &g1), &(b.numer() / &g2))?,
        mul_bigint(&(a.denom() / &g2), &(b.denom() / &g1))?,
    )
}
fn square(a: &BigRational, arithmetic: &mut Arithmetic) -> Result<BigRational, F2Error> {
    mul(a, a, arithmetic)
}
fn div_integer(
    a: &BigRational,
    b: &BigInt,
    arithmetic: &mut Arithmetic,
) -> Result<BigRational, F2Error> {
    charged(arithmetic)?;
    checked_ratio(a.numer().clone(), mul_bigint(a.denom(), b)?)
}
fn mul_bigint(a: &BigInt, b: &BigInt) -> Result<BigInt, F2Error> {
    if !a.is_zero() && !b.is_zero() && a.bits().saturating_add(b.bits()) > MAX_BITS {
        return Err(limit("Exact integer product exceeds 12,416 bits."));
    }
    checked_bigint(a * b)
}
fn compare_ratio(
    a: &BigRational,
    b: &BigRational,
    arithmetic: &mut Arithmetic,
) -> Result<std::cmp::Ordering, F2Error> {
    charged(arithmetic)?;
    let left = mul_bigint(a.numer(), b.denom())?;
    let right = mul_bigint(b.numer(), a.denom())?;
    Ok(left.cmp(&right))
}

fn parse_decimal(text: &str) -> Result<BigRational, F2Error> {
    let (mantissa, exponent) = text
        .split_once(['E', 'e'])
        .map_or((text, "0"), |(a, b)| (a, b));
    let exponent: i32 = exponent
        .parse()
        .map_err(|_| unsupported("Decimal exponent is invalid."))?;
    if exponent.unsigned_abs() > 308 {
        return Err(limit("Decimal exponent exceeds 308."));
    }
    let negative = mantissa.starts_with('-');
    let unsigned = mantissa.trim_start_matches(['+', '-']);
    let digits = unsigned.chars().filter(|c| c.is_ascii_digit()).count();
    if digits == 0
        || digits > 64
        || unsigned.chars().filter(|c| *c == '.').count() > 1
        || !unsigned.chars().all(|c| c.is_ascii_digit() || c == '.')
    {
        return Err(limit("Decimal mantissa must contain at most 64 digits."));
    }
    let fraction = unsigned.split_once('.').map_or(0, |(_, f)| f.len()) as i32;
    let raw: String = unsigned.chars().filter(|c| c.is_ascii_digit()).collect();
    let mut n = raw
        .parse::<BigInt>()
        .map_err(|_| unsupported("Decimal mantissa is invalid."))?;
    if negative {
        n = -n;
    }
    let scale = exponent - fraction;
    if scale >= 0 {
        let factor = BigInt::from(10u8).pow(scale as u32);
        checked_ratio(mul_bigint(&n, &factor)?, BigInt::one())
    } else {
        checked_ratio(
            n,
            checked_bigint(BigInt::from(10u8).pow(scale.unsigned_abs()))?,
        )
    }
}

fn parser_heap_bytes(graph: &Graph<'_>) -> usize {
    let records = graph
        .records
        .values()
        .map(|record| {
            record.components.capacity() * size_of::<Entity>()
                + record
                    .components
                    .iter()
                    .map(|entity| entity.name.capacity() + nodes_heap_bytes(&entity.args))
                    .sum::<usize>()
        })
        .sum::<usize>();
    let reverse = graph
        .reverse
        .values()
        .map(|values| values.capacity() * size_of::<u32>())
        .sum::<usize>();
    graph.records.capacity() * (size_of::<u32>() + size_of::<Record>() + 32)
        + graph.reverse.capacity() * (size_of::<u32>() + size_of::<Vec<u32>>() + 32)
        + records
        + reverse
        + graph
            .source_numbers
            .iter()
            .map(|value| value.spelling.capacity())
            .sum::<usize>()
}

fn nodes_heap_bytes(nodes: &Vec<Node>) -> usize {
    nodes.capacity() * size_of::<Node>()
        + nodes
            .iter()
            .map(|node| match node {
                Node::List(values) => nodes_heap_bytes(values),
                Node::Typed(name, values) => name.capacity() + nodes_heap_bytes(values),
                _ => 0,
            })
            .sum::<usize>()
}

fn collect_refs(nodes: &[Node], output: &mut Vec<u32>) {
    for node in nodes {
        match node {
            Node::Ref(id) => output.push(*id),
            Node::List(items) | Node::Typed(_, items) => collect_refs(items, output),
            _ => {}
        }
    }
}

fn record_spans(source: &[u8]) -> Result<Vec<SourceSpan>, F2Error> {
    let mut spans = Vec::new();
    let mut start = None;
    let mut string = false;
    let mut comment = false;
    let mut i = 0;
    while i < source.len() {
        if comment {
            if source.get(i..i + 2) == Some(b"*/") {
                comment = false;
                i += 2;
            } else {
                i += 1;
            }
            continue;
        }
        if string {
            if source[i] == b'\'' {
                if source.get(i + 1) == Some(&b'\'') {
                    i += 2;
                } else {
                    string = false;
                    i += 1;
                }
            } else {
                i += 1;
            }
            continue;
        }
        if source.get(i..i + 2) == Some(b"/*") {
            comment = true;
            i += 2;
            continue;
        }
        if source[i] == b'\'' {
            string = true;
            i += 1;
            continue;
        }
        if start.is_none() && source[i] == b'#' {
            start = Some(i);
        }
        if source[i] == b';' {
            if let Some(begin) = start.take() {
                if i + 1 - begin > MAX_RECORD {
                    return Err(limit("STEP record exceeds 64 KiB."));
                }
                spans.push(SourceSpan {
                    start: begin,
                    end: i + 1,
                });
                if spans.len() > MAX_RECORDS {
                    return Err(limit("STEP input exceeds 8,192 entity records."));
                }
            }
        }
        i += 1;
    }
    if string || comment || start.is_some() {
        return Err(F2Error::InvalidInput(
            "STEP input has an unterminated token or record.".into(),
        ));
    }
    Ok(spans)
}

struct Cursor<'a, 'b> {
    source: &'a [u8],
    pos: usize,
    end: usize,
    list_items: &'b mut u64,
}
impl<'a, 'b> Cursor<'a, 'b> {
    fn new(source: &'a [u8], span: SourceSpan, list_items: &'b mut u64) -> Self {
        Self {
            source,
            pos: span.start,
            end: span.end,
            list_items,
        }
    }
    fn record(mut self) -> Result<(u32, Record), F2Error> {
        self.byte(b'#')?;
        let id = self.uint()?;
        self.ws()?;
        self.byte(b'=')?;
        self.ws()?;
        let components = if self.peek() == Some(b'(') {
            self.pos += 1;
            let mut out = Vec::new();
            loop {
                self.ws()?;
                if self.peek() == Some(b')') {
                    self.pos += 1;
                    break;
                }
                out.push(self.entity()?);
                if out.len() > MAX_LIST {
                    return Err(limit("Complex entity exceeds 32 components."));
                }
            }
            out
        } else {
            vec![self.entity()?]
        };
        self.ws()?;
        self.byte(b';')?;
        self.ws()?;
        if self.pos != self.end {
            return Err(unsupported("Unexpected bytes after STEP record."));
        }
        Ok((id, Record { components }))
    }
    fn entity(&mut self) -> Result<Entity, F2Error> {
        let name = self.ident()?;
        self.ws()?;
        self.byte(b'(')?;
        let args = self.nodes(1)?;
        Ok(Entity { name, args })
    }
    fn nodes(&mut self, depth: usize) -> Result<Vec<Node>, F2Error> {
        if depth > MAX_DEPTH {
            return Err(limit("STEP nesting exceeds 32."));
        }
        let mut out = Vec::new();
        self.ws()?;
        if self.peek() == Some(b')') {
            self.pos += 1;
            return Ok(out);
        }
        loop {
            out.push(self.node(depth)?);
            *self.list_items += 1;
            if out.len() > MAX_LIST {
                return Err(limit("STEP list exceeds 32 items."));
            }
            self.ws()?;
            match self.peek() {
                Some(b',') => {
                    self.pos += 1;
                    self.ws()?
                }
                Some(b')') => {
                    self.pos += 1;
                    break;
                }
                _ => return Err(unsupported("Malformed STEP argument list.")),
            }
        }
        Ok(out)
    }
    fn node(&mut self, depth: usize) -> Result<Node, F2Error> {
        self.ws()?;
        match self.peek() {
            Some(b'#') => {
                self.pos += 1;
                Ok(Node::Ref(self.uint()?))
            }
            Some(b'\'') => Ok(Node::Str(self.quoted()?)),
            Some(b'.') => Ok(Node::Enum(self.dotted()?)),
            Some(b'$') => {
                self.pos += 1;
                Ok(Node::Omitted)
            }
            Some(b'*') => {
                self.pos += 1;
                Ok(Node::Derived)
            }
            Some(b'(') => {
                self.pos += 1;
                Ok(Node::List(self.nodes(depth + 1)?))
            }
            Some(b'+') | Some(b'-') | Some(b'0'..=b'9') => Ok(Node::Number(self.number()?)),
            Some(b'A'..=b'Z') | Some(b'a'..=b'z') | Some(b'_') => {
                let name = self.ident()?;
                self.ws()?;
                self.byte(b'(')?;
                Ok(Node::Typed(name, self.nodes(depth + 1)?))
            }
            _ => Err(unsupported("Unsupported STEP value token.")),
        }
    }
    fn ws(&mut self) -> Result<(), F2Error> {
        loop {
            while self.peek().is_some_and(|byte| byte.is_ascii_whitespace()) {
                self.pos += 1;
            }
            if self.source.get(self.pos..self.pos + 2) == Some(b"/*") {
                let Some(offset) = self.source[self.pos + 2..self.end]
                    .windows(2)
                    .position(|w| w == b"*/")
                else {
                    return Err(F2Error::InvalidInput("Unterminated STEP comment.".into()));
                };
                self.pos += offset + 4;
            } else {
                break;
            }
        }
        Ok(())
    }
    fn ident(&mut self) -> Result<String, F2Error> {
        let start = self.pos;
        while self
            .peek()
            .is_some_and(|b| b.is_ascii_alphanumeric() || b == b'_')
        {
            self.pos += 1;
        }
        if self.pos == start {
            return Err(unsupported("Expected STEP identifier."));
        }
        Ok(std::str::from_utf8(&self.source[start..self.pos])
            .expect("validated UTF-8")
            .to_ascii_uppercase())
    }
    fn uint(&mut self) -> Result<u32, F2Error> {
        let start = self.pos;
        while self.peek().is_some_and(|b| b.is_ascii_digit()) {
            self.pos += 1;
        }
        if self.pos == start {
            return Err(unsupported("Expected STEP entity number."));
        }
        std::str::from_utf8(&self.source[start..self.pos])
            .unwrap()
            .parse()
            .map_err(|_| limit("STEP entity number exceeds u32."))
    }
    fn quoted(&mut self) -> Result<SourceSpan, F2Error> {
        let start = self.pos;
        self.pos += 1;
        loop {
            match self.peek() {
                Some(b'\'') if self.source.get(self.pos + 1) == Some(&b'\'') => self.pos += 2,
                Some(b'\'') => {
                    self.pos += 1;
                    return Ok(SourceSpan {
                        start,
                        end: self.pos,
                    });
                }
                Some(_) => self.pos += 1,
                None => return Err(F2Error::InvalidInput("Unterminated STEP string.".into())),
            }
        }
    }
    fn dotted(&mut self) -> Result<SourceSpan, F2Error> {
        let start = self.pos;
        self.pos += 1;
        while self
            .peek()
            .is_some_and(|b| b.is_ascii_alphanumeric() || b == b'_')
        {
            self.pos += 1;
        }
        self.byte(b'.')?;
        Ok(SourceSpan {
            start,
            end: self.pos,
        })
    }
    fn number(&mut self) -> Result<SourceSpan, F2Error> {
        let start = self.pos;
        if matches!(self.peek(), Some(b'+') | Some(b'-')) {
            self.pos += 1;
        }
        while self.peek().is_some_and(|b| b.is_ascii_digit()) {
            self.pos += 1;
        }
        if self.peek() == Some(b'.') {
            self.pos += 1;
            while self.peek().is_some_and(|b| b.is_ascii_digit()) {
                self.pos += 1;
            }
        }
        if matches!(self.peek(), Some(b'E') | Some(b'e')) {
            self.pos += 1;
            if matches!(self.peek(), Some(b'+') | Some(b'-')) {
                self.pos += 1;
            }
            let e = self.pos;
            while self.peek().is_some_and(|b| b.is_ascii_digit()) {
                self.pos += 1;
            }
            if self.pos == e {
                return Err(unsupported("Decimal exponent has no digits."));
            }
        }
        Ok(SourceSpan {
            start,
            end: self.pos,
        })
    }
    fn byte(&mut self, expected: u8) -> Result<(), F2Error> {
        if self.peek() == Some(expected) {
            self.pos += 1;
            Ok(())
        } else {
            Err(unsupported("Malformed STEP record punctuation."))
        }
    }
    fn peek(&self) -> Option<u8> {
        (self.pos < self.end).then(|| self.source[self.pos])
    }
}

fn unsupported(message: impl Into<String>) -> F2Error {
    F2Error::UnsupportedSource(message.into())
}
fn limit(message: impl Into<String>) -> F2Error {
    F2Error::ResourceLimit(message.into())
}
