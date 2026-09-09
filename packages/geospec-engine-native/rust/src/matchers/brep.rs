//! STEP/XDE and exact BRep matcher family.

use std::collections::HashSet;

use crate::{
    analysis::selection::{EcmaRegexEngine, EcmaRegexError, TextPattern},
    backend::{
        brep::{Bounds, BrepSubject, DocumentFacts, SurfaceFacts, TopologyCounts, ValidityFacts},
        BackendError, BackendErrorKind,
    },
    codec::Json,
    prepared::{
        expected, finite, nonnegative, normalized_payload, normalized_point, point,
        regexp::SelectorRegex, tolerance, AnalysisDemand, NumericExpectation,
        DEFAULT_LINEAR_TOLERANCE,
    },
    protocol::{array, field, invalid_claim, object, optional_field, require_fields},
    registry::Capability,
    result::{family_evidence, Diagnostic, Evaluation},
    subject::EvaluationContext,
    ProtocolError,
};

const BREP_SUGGESTION: &str =
    "Load the model as STEP (`loadModel({ file, format: \"step\" })`) so GeoSpec has exact BRep evidence.";
const PAD_SEPARATION_GAP: f64 = 20.0;
const MAX_PART_OCCURRENCES: usize = 8;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum Axis {
    X,
    Y,
    Z,
}

impl Axis {
    fn parse(value: &Json, label: &str) -> Result<Self, ProtocolError> {
        match value {
            Json::String(value) if value == "x" => Ok(Self::X),
            Json::String(value) if value == "y" => Ok(Self::Y),
            Json::String(value) if value == "z" => Ok(Self::Z),
            _ => invalid_claim(format!("{label} must be x, y, or z.")),
        }
    }

    const fn index(self) -> usize {
        match self {
            Self::X => 0,
            Self::Y => 1,
            Self::Z => 2,
        }
    }

    const fn as_str(self) -> &'static str {
        match self {
            Self::X => "x",
            Self::Y => "y",
            Self::Z => "z",
        }
    }

    fn dominant(direction: [f64; 3]) -> Self {
        let [x, y, z] = direction.map(f64::abs);
        if x >= y && x >= z {
            Self::X
        } else if y >= z {
            Self::Y
        } else {
            Self::Z
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct ProductStructure {
    names: Vec<String>,
    count: Option<NumericExpectation>,
}

#[derive(Clone, Debug, PartialEq)]
struct OccurrenceBounds {
    within: Option<TextPattern>,
    min: Option<[Option<f64>; 3]>,
    max: Option<[Option<f64>; 3]>,
    center: Option<[Option<f64>; 3]>,
    tolerance: f64,
}

#[derive(Clone, Debug, PartialEq)]
struct OccurrenceRule {
    name: TextPattern,
    count: Option<NumericExpectation>,
    bounds: Option<OccurrenceBounds>,
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct AssemblyOccurrences {
    occurrences: Vec<OccurrenceRule>,
    unique_names: bool,
    regex_unsupported: Option<String>,
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct ValidBrep {
    max_tolerance: Option<f64>,
    free_bounds: Option<NumericExpectation>,
    min_edge_length: Option<f64>,
    same_parameter: Option<bool>,
    closed_shells: Option<bool>,
    closed_wires: Option<bool>,
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct TopologyExpectation {
    values: [Option<NumericExpectation>; 7],
    tolerance: f64,
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct PlanarExpectation {
    normal: [Option<f64>; 3],
    offset: f64,
    area: Option<NumericExpectation>,
    tolerance: f64,
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct CylindricalExpectation {
    radius: f64,
    axis: Axis,
    tolerance: f64,
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct HoleExpectation {
    diameter: f64,
    through: Option<bool>,
    axis: Option<Axis>,
    center: Option<[Option<f64>; 3]>,
    tolerance: f64,
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct PatternExpectation {
    count: usize,
    hole_diameter: f64,
    bolt_circle_diameter: Option<f64>,
    axis: Option<Axis>,
    center: Option<[Option<f64>; 3]>,
    tolerance: f64,
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct FeatureExpectation {
    value: f64,
    selection: Option<String>,
    tolerance: f64,
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) enum Prepared {
    StepUnits(String),
    ProductStructure(ProductStructure),
    AssemblyOccurrences(AssemblyOccurrences),
    ValidBrep(ValidBrep),
    TopologyCounts(Box<TopologyExpectation>),
    PlanarFace(PlanarExpectation),
    CylindricalFace(CylindricalExpectation),
    CircularHole(HoleExpectation),
    CircularHolePattern(PatternExpectation),
    ChamferFeature(FeatureExpectation),
    FilletFeature(FeatureExpectation),
}

impl Prepared {
    pub(crate) fn normalized_payload(&self) -> Json {
        normalized_payload(self.capability(), self.expected_json())
    }

    pub(crate) fn demand(&self) -> AnalysisDemand {
        AnalysisDemand {
            brep: true,
            ..AnalysisDemand::default()
        }
    }

    pub(crate) fn validate_regexes(
        &self,
        engine: &dyn EcmaRegexEngine,
    ) -> Result<(), EcmaRegexError> {
        if let Self::AssemblyOccurrences(expected) = self {
            for rule in &expected.occurrences {
                rule.name.validate(engine)?;
                if let Some(within) = rule
                    .bounds
                    .as_ref()
                    .and_then(|bounds| bounds.within.as_ref())
                {
                    within.validate(engine)?;
                }
            }
        }
        Ok(())
    }

    const fn capability(&self) -> Capability {
        match self {
            Self::StepUnits(_) => Capability::ToHaveStepUnits,
            Self::ProductStructure(_) => Capability::ToHaveProductStructure,
            Self::AssemblyOccurrences(_) => Capability::ToHaveAssemblyOccurrences,
            Self::ValidBrep(_) => Capability::ToBeValidBrep,
            Self::TopologyCounts(_) => Capability::ToHaveTopologyCounts,
            Self::PlanarFace(_) => Capability::ToHavePlanarFace,
            Self::CylindricalFace(_) => Capability::ToHaveCylindricalFace,
            Self::CircularHole(_) => Capability::ToHaveCircularHole,
            Self::CircularHolePattern(_) => Capability::ToHaveCircularHolePattern,
            Self::ChamferFeature(_) => Capability::ToHaveChamferFeature,
            Self::FilletFeature(_) => Capability::ToHaveFilletFeature,
        }
    }

    fn expected_json(&self) -> Json {
        match self {
            Self::StepUnits(unit) => Json::object([("unit", Json::string(unit))]),
            Self::ProductStructure(value) => value.to_json(),
            Self::AssemblyOccurrences(value) => Json::Object(vec![
                (
                    "occurrences".into(),
                    Json::Array(
                        value
                            .occurrences
                            .iter()
                            .map(OccurrenceRule::to_json)
                            .collect(),
                    ),
                ),
                ("uniqueNames".into(), Json::Bool(value.unique_names)),
            ]),
            Self::ValidBrep(value) => value.to_json(),
            Self::TopologyCounts(value) => value.to_json(),
            Self::PlanarFace(value) => value.to_json(),
            Self::CylindricalFace(value) => value.to_json(),
            Self::CircularHole(value) => value.to_json(),
            Self::CircularHolePattern(value) => value.to_json(),
            Self::ChamferFeature(value) => value.to_json("distance"),
            Self::FilletFeature(value) => value.to_json("radius"),
        }
    }
}

pub(crate) fn prepare(capability: Capability, payload: &Json) -> Result<Prepared, ProtocolError> {
    let value = expected(capability, payload)?;
    match capability {
        Capability::ToHaveStepUnits => parse_step_units(&value),
        Capability::ToHaveProductStructure => parse_product_structure(&value),
        Capability::ToHaveAssemblyOccurrences => parse_assembly_occurrences(&value),
        Capability::ToBeValidBrep => parse_valid_brep(&value),
        Capability::ToHaveTopologyCounts => parse_topology_counts(&value),
        Capability::ToHavePlanarFace => parse_planar_face(&value),
        Capability::ToHaveCylindricalFace => parse_cylindrical_face(&value),
        Capability::ToHaveCircularHole => parse_circular_hole(&value),
        Capability::ToHaveCircularHolePattern => parse_circular_hole_pattern(&value),
        Capability::ToHaveChamferFeature => parse_feature(&value, true),
        Capability::ToHaveFilletFeature => parse_feature(&value, false),
        _ => invalid_claim(format!(
            "{} is not a BRep-family capability.",
            capability.name()
        )),
    }
}

fn parse_step_units(value: &Json) -> Result<Prepared, ProtocolError> {
    let fields = object(value, "STEP-unit expectation")?;
    require_fields(fields, &["unit"], &["unit"], "STEP-unit expectation")?;
    let Json::String(unit) = field(fields, "unit")? else {
        return invalid_claim("STEP unit must be a string.");
    };
    if unit.is_empty() {
        return invalid_claim("STEP unit must not be empty.");
    }
    Ok(Prepared::StepUnits(unit.clone()))
}

fn parse_product_structure(value: &Json) -> Result<Prepared, ProtocolError> {
    let fields = object(value, "product-structure expectation")?;
    require_fields(
        fields,
        &["names", "count"],
        &[],
        "product-structure expectation",
    )?;
    let names = match optional_field(fields, "names") {
        None => Vec::new(),
        Some(value) => array(value, "product names")?
            .iter()
            .map(|value| match value {
                Json::String(value) => Ok(value.clone()),
                _ => invalid_claim("Product names must be strings."),
            })
            .collect::<Result<Vec<_>, _>>()?,
    };
    let count = optional_field(fields, "count")
        .map(NumericExpectation::parse)
        .transpose()?;
    Ok(Prepared::ProductStructure(ProductStructure {
        names,
        count,
    }))
}

fn parse_assembly_occurrences(value: &Json) -> Result<Prepared, ProtocolError> {
    let fields = object(value, "assembly-occurrence expectation")?;
    require_fields(
        fields,
        &["occurrences", "uniqueNames"],
        &["occurrences"],
        "assembly-occurrence expectation",
    )?;
    let mut occurrences = Vec::new();
    for (index, value) in array(field(fields, "occurrences")?, "occurrences")?
        .iter()
        .enumerate()
    {
        let label = format!("occurrences[{index}]");
        let rule = object(value, &label)?;
        require_fields(rule, &["name", "count", "bounds"], &["name"], &label)?;
        occurrences.push(OccurrenceRule {
            name: TextPattern::parse(field(rule, "name")?, &format!("{label}.name"))?,
            count: optional_field(rule, "count")
                .map(NumericExpectation::parse)
                .transpose()?,
            bounds: optional_field(rule, "bounds")
                .map(parse_occurrence_bounds)
                .transpose()?,
        });
    }
    let unique_names = optional_bool(fields, "uniqueNames")?.unwrap_or(false);
    let regex = SelectorRegex::default();
    let mut regex_unsupported = None;
    for rule in &occurrences {
        match rule.name.validate(&regex) {
            Ok(()) => {}
            Err(EcmaRegexError::InvalidSyntax(message)) => {
                return Err(ProtocolError::new(crate::ErrorKind::InvalidClaim, message));
            }
            Err(EcmaRegexError::Unsupported(message)) => {
                regex_unsupported.get_or_insert(message);
            }
        }
        if let Some(within) = rule
            .bounds
            .as_ref()
            .and_then(|bounds| bounds.within.as_ref())
        {
            match within.validate(&regex) {
                Ok(()) => {}
                Err(EcmaRegexError::InvalidSyntax(message)) => {
                    return Err(ProtocolError::new(crate::ErrorKind::InvalidClaim, message));
                }
                Err(EcmaRegexError::Unsupported(message)) => {
                    regex_unsupported.get_or_insert(message);
                }
            }
        }
    }
    Ok(Prepared::AssemblyOccurrences(AssemblyOccurrences {
        occurrences,
        unique_names,
        regex_unsupported,
    }))
}

fn parse_occurrence_bounds(value: &Json) -> Result<OccurrenceBounds, ProtocolError> {
    let fields = object(value, "occurrence bounds")?;
    require_fields(
        fields,
        &["within", "min", "max", "center", "tolerance"],
        &[],
        "occurrence bounds",
    )?;
    Ok(OccurrenceBounds {
        within: optional_field(fields, "within")
            .map(|value| TextPattern::parse(value, "occurrence bounds.within"))
            .transpose()?,
        min: optional_field(fields, "min").map(point).transpose()?,
        max: optional_field(fields, "max").map(point).transpose()?,
        center: optional_field(fields, "center").map(point).transpose()?,
        tolerance: tolerance(fields, "tolerance", DEFAULT_LINEAR_TOLERANCE)?,
    })
}

fn parse_valid_brep(value: &Json) -> Result<Prepared, ProtocolError> {
    let fields = object(value, "valid-BRep expectation")?;
    require_fields(
        fields,
        &[
            "maxTolerance",
            "freeBounds",
            "minEdgeLength",
            "sameParameter",
            "closedShells",
            "closedWires",
        ],
        &[],
        "valid-BRep expectation",
    )?;
    let free_bounds = if let Some(value) = optional_field(fields, "freeBounds") {
        let value = object(value, "freeBounds")?;
        require_fields(value, &["count"], &[], "freeBounds")?;
        optional_field(value, "count")
            .map(NumericExpectation::parse)
            .transpose()?
    } else {
        None
    };
    Ok(Prepared::ValidBrep(ValidBrep {
        max_tolerance: optional_field(fields, "maxTolerance")
            .map(|value| nonnegative(value, "maxTolerance"))
            .transpose()?,
        free_bounds,
        min_edge_length: optional_field(fields, "minEdgeLength")
            .map(|value| nonnegative(value, "minEdgeLength"))
            .transpose()?,
        same_parameter: optional_bool(fields, "sameParameter")?,
        closed_shells: optional_bool(fields, "closedShells")?,
        closed_wires: optional_bool(fields, "closedWires")?,
    }))
}

const TOPOLOGY_KEYS: [&str; 7] = [
    "vertices",
    "edges",
    "wires",
    "faces",
    "shells",
    "solids",
    "compounds",
];

fn parse_topology_counts(value: &Json) -> Result<Prepared, ProtocolError> {
    let fields = object(value, "topology-count expectation")?;
    let mut allowed = TOPOLOGY_KEYS.to_vec();
    allowed.push("tolerance");
    require_fields(fields, &allowed, &[], "topology-count expectation")?;
    let mut values: [Option<NumericExpectation>; 7] = std::array::from_fn(|_| None);
    for (index, key) in TOPOLOGY_KEYS.iter().enumerate() {
        values[index] = optional_field(fields, key)
            .map(NumericExpectation::parse)
            .transpose()?;
    }
    Ok(Prepared::TopologyCounts(Box::new(TopologyExpectation {
        values,
        tolerance: tolerance(fields, "tolerance", 0.0)?,
    })))
}

fn parse_planar_face(value: &Json) -> Result<Prepared, ProtocolError> {
    let fields = object(value, "planar-face expectation")?;
    require_fields(
        fields,
        &["normal", "offset", "area", "tolerance"],
        &["normal", "offset"],
        "planar-face expectation",
    )?;
    Ok(Prepared::PlanarFace(PlanarExpectation {
        normal: point(field(fields, "normal")?)?,
        offset: finite(field(fields, "offset")?, "offset")?,
        area: optional_field(fields, "area")
            .map(NumericExpectation::parse)
            .transpose()?,
        tolerance: tolerance(fields, "tolerance", DEFAULT_LINEAR_TOLERANCE)?,
    }))
}

fn parse_cylindrical_face(value: &Json) -> Result<Prepared, ProtocolError> {
    let fields = object(value, "cylindrical-face expectation")?;
    require_fields(
        fields,
        &["radius", "axis", "tolerance"],
        &["radius", "axis"],
        "cylindrical-face expectation",
    )?;
    Ok(Prepared::CylindricalFace(CylindricalExpectation {
        radius: nonnegative(field(fields, "radius")?, "radius")?,
        axis: Axis::parse(field(fields, "axis")?, "axis")?,
        tolerance: tolerance(fields, "tolerance", DEFAULT_LINEAR_TOLERANCE)?,
    }))
}

fn parse_circular_hole(value: &Json) -> Result<Prepared, ProtocolError> {
    let fields = object(value, "circular-hole expectation")?;
    require_fields(
        fields,
        &["diameter", "through", "axis", "center", "tolerance"],
        &["diameter"],
        "circular-hole expectation",
    )?;
    Ok(Prepared::CircularHole(HoleExpectation {
        diameter: nonnegative(field(fields, "diameter")?, "diameter")?,
        through: optional_bool(fields, "through")?,
        axis: optional_field(fields, "axis")
            .map(|value| Axis::parse(value, "axis"))
            .transpose()?,
        center: optional_field(fields, "center").map(point).transpose()?,
        tolerance: tolerance(fields, "tolerance", DEFAULT_LINEAR_TOLERANCE)?,
    }))
}

fn parse_circular_hole_pattern(value: &Json) -> Result<Prepared, ProtocolError> {
    let fields = object(value, "circular-hole-pattern expectation")?;
    require_fields(
        fields,
        &[
            "count",
            "holeDiameter",
            "boltCircleDiameter",
            "axis",
            "center",
            "tolerance",
        ],
        &["count", "holeDiameter"],
        "circular-hole-pattern expectation",
    )?;
    Ok(Prepared::CircularHolePattern(PatternExpectation {
        count: count(field(fields, "count")?, "count")?,
        hole_diameter: nonnegative(field(fields, "holeDiameter")?, "holeDiameter")?,
        bolt_circle_diameter: optional_field(fields, "boltCircleDiameter")
            .map(|value| nonnegative(value, "boltCircleDiameter"))
            .transpose()?,
        axis: optional_field(fields, "axis")
            .map(|value| Axis::parse(value, "axis"))
            .transpose()?,
        center: optional_field(fields, "center").map(point).transpose()?,
        tolerance: tolerance(fields, "tolerance", DEFAULT_LINEAR_TOLERANCE)?,
    }))
}

fn parse_feature(value: &Json, chamfer: bool) -> Result<Prepared, ProtocolError> {
    let label = if chamfer { "chamfer" } else { "fillet" };
    let key = if chamfer { "distance" } else { "radius" };
    let fields = object(value, &format!("{label}-feature expectation"))?;
    require_fields(
        fields,
        &[key, "selection", "tolerance"],
        &[key],
        &format!("{label}-feature expectation"),
    )?;
    let selection = optional_field(fields, "selection")
        .map(|value| match value {
            Json::String(value) => Ok(value.clone()),
            _ => invalid_claim("Feature selection must be a string."),
        })
        .transpose()?;
    let expectation = FeatureExpectation {
        value: nonnegative(field(fields, key)?, key)?,
        selection,
        tolerance: tolerance(fields, "tolerance", DEFAULT_LINEAR_TOLERANCE)?,
    };
    Ok(if chamfer {
        Prepared::ChamferFeature(expectation)
    } else {
        Prepared::FilletFeature(expectation)
    })
}

fn optional_bool(fields: &[(String, Json)], key: &str) -> Result<Option<bool>, ProtocolError> {
    optional_field(fields, key)
        .map(|value| match value {
            Json::Bool(value) => Ok(*value),
            _ => invalid_claim(format!("{key} must be boolean.")),
        })
        .transpose()
}

fn count(value: &Json, label: &str) -> Result<usize, ProtocolError> {
    let value = finite(value, label)?;
    if value < 0.0 || value.fract() != 0.0 || value > usize::MAX as f64 {
        invalid_claim(format!("{label} must be a nonnegative integer."))
    } else {
        Ok(value as usize)
    }
}

impl OccurrenceRule {
    fn to_json(&self) -> Json {
        let mut fields = vec![("name".into(), self.name.to_json())];
        if let Some(count) = &self.count {
            fields.push(("count".into(), count.to_json()));
        }
        if let Some(bounds) = &self.bounds {
            fields.push(("bounds".into(), bounds.to_json()));
        }
        Json::Object(fields)
    }
}

impl ProductStructure {
    fn to_json(&self) -> Json {
        let mut fields = Vec::new();
        if !self.names.is_empty() {
            fields.push((
                "names".into(),
                Json::Array(self.names.iter().map(|name| Json::string(name)).collect()),
            ));
        }
        if let Some(count) = &self.count {
            fields.push(("count".into(), count.to_json()));
        }
        Json::Object(fields)
    }
}

impl OccurrenceBounds {
    fn to_json(&self) -> Json {
        let mut fields = Vec::new();
        if let Some(value) = &self.within {
            fields.push(("within".into(), value.to_json()));
        }
        for (key, value) in [
            ("min", self.min),
            ("max", self.max),
            ("center", self.center),
        ] {
            if let Some(value) = value {
                fields.push((key.into(), normalized_point(value)));
            }
        }
        fields.push(("tolerance".into(), Json::Number(self.tolerance)));
        Json::Object(fields)
    }
}

impl ValidBrep {
    fn to_json(&self) -> Json {
        let mut fields = Vec::new();
        if let Some(value) = self.max_tolerance {
            fields.push(("maxTolerance".into(), Json::Number(value)));
        }
        if let Some(value) = &self.free_bounds {
            fields.push((
                "freeBounds".into(),
                Json::object([("count", value.to_json())]),
            ));
        }
        if let Some(value) = self.min_edge_length {
            fields.push(("minEdgeLength".into(), Json::Number(value)));
        }
        for (key, value) in [
            ("sameParameter", self.same_parameter),
            ("closedShells", self.closed_shells),
            ("closedWires", self.closed_wires),
        ] {
            if let Some(value) = value {
                fields.push((key.into(), Json::Bool(value)));
            }
        }
        Json::Object(fields)
    }
}

impl TopologyExpectation {
    fn to_json(&self) -> Json {
        let mut fields = Vec::new();
        for (key, value) in TOPOLOGY_KEYS.iter().zip(&self.values) {
            if let Some(value) = value {
                fields.push(((*key).into(), value.to_json()));
            }
        }
        fields.push(("tolerance".into(), Json::Number(self.tolerance)));
        Json::Object(fields)
    }
}

impl PlanarExpectation {
    fn to_json(&self) -> Json {
        let mut fields = vec![
            ("normal".into(), normalized_point(self.normal)),
            ("offset".into(), Json::Number(self.offset)),
            ("tolerance".into(), Json::Number(self.tolerance)),
        ];
        if let Some(area) = &self.area {
            fields.push(("area".into(), area.to_json()));
        }
        Json::Object(fields)
    }
}

impl CylindricalExpectation {
    fn to_json(&self) -> Json {
        Json::object([
            ("axis", Json::string(self.axis.as_str())),
            ("radius", Json::Number(self.radius)),
            ("tolerance", Json::Number(self.tolerance)),
        ])
    }
}

impl HoleExpectation {
    fn to_json(&self) -> Json {
        let mut fields = vec![
            ("diameter".into(), Json::Number(self.diameter)),
            ("tolerance".into(), Json::Number(self.tolerance)),
        ];
        if let Some(value) = self.through {
            fields.push(("through".into(), Json::Bool(value)));
        }
        if let Some(value) = self.axis {
            fields.push(("axis".into(), Json::string(value.as_str())));
        }
        if let Some(value) = self.center {
            fields.push(("center".into(), normalized_point(value)));
        }
        Json::Object(fields)
    }
}

impl PatternExpectation {
    fn to_json(&self) -> Json {
        let mut fields = vec![
            ("count".into(), Json::Number(self.count as f64)),
            ("holeDiameter".into(), Json::Number(self.hole_diameter)),
            ("tolerance".into(), Json::Number(self.tolerance)),
        ];
        if let Some(value) = self.bolt_circle_diameter {
            fields.push(("boltCircleDiameter".into(), Json::Number(value)));
        }
        if let Some(value) = self.axis {
            fields.push(("axis".into(), Json::string(value.as_str())));
        }
        if let Some(value) = self.center {
            fields.push(("center".into(), normalized_point(value)));
        }
        Json::Object(fields)
    }
}

impl FeatureExpectation {
    fn to_json(&self, key: &str) -> Json {
        let mut fields = vec![
            (key.into(), Json::Number(self.value)),
            ("tolerance".into(), Json::Number(self.tolerance)),
        ];
        if let Some(value) = &self.selection {
            fields.push(("selection".into(), Json::string(value)));
        }
        Json::Object(fields)
    }
}

// Facet names come from brep-matchers.ts's brepMatcher declarations.
fn missing_brep_evidence(prepared: &Prepared) -> &'static str {
    match prepared {
        Prepared::ValidBrep(_) => "exact BRep validity evidence",
        Prepared::TopologyCounts(_) => "exact BRep topology-count evidence",
        Prepared::PlanarFace(_) => "exact BRep planar-face evidence",
        Prepared::CylindricalFace(_) => "exact BRep cylindrical-face evidence",
        Prepared::CircularHole(_) => "exact BRep circular-hole evidence",
        Prepared::CircularHolePattern(_) => "exact BRep circular-hole-pattern evidence",
        Prepared::ChamferFeature(_) => "exact BRep chamfer-feature evidence",
        Prepared::FilletFeature(_) => "exact BRep fillet-feature evidence",
        _ => "exact BRep evidence",
    }
}

pub(crate) fn evaluate(prepared: &Prepared, context: &mut EvaluationContext<'_>) -> Evaluation {
    let facts = match context.brep_facts() {
        Ok(Some(value)) => value,
        Ok(None) => {
            return refused(
                prepared.capability(),
                missing_brep_evidence(prepared),
                BREP_SUGGESTION,
            )
        }
        Err(evaluation) => return evaluation,
    };
    let subject = context.subject();
    let Some(brep) = subject.brep.as_deref() else {
        return refused(
            prepared.capability(),
            missing_brep_evidence(prepared),
            BREP_SUGGESTION,
        );
    };
    let outcome = match prepared {
        Prepared::StepUnits(expected) => evaluate_units(expected, &facts),
        Prepared::ProductStructure(expected) => evaluate_products(expected, &facts),
        Prepared::AssemblyOccurrences(expected) => {
            if let Some(message) = &expected.regex_unsupported {
                return refused(
                    prepared.capability(),
                    &format!("faithful ECMAScript regular-expression support ({message})"),
                    "Use an exact string selector or a profile that qualifies this ECMAScript feature.",
                );
            }
            evaluate_occurrences(expected, &facts, &SelectorRegex::default())
        }
        Prepared::ValidBrep(expected) => match brep.validity() {
            Ok(value) => evaluate_validity(expected, &value),
            Err(error) => return backend_refused(prepared.capability(), error),
        },
        Prepared::TopologyCounts(expected) => evaluate_topology(expected, facts.shape.topology),
        Prepared::PlanarFace(expected) => {
            evaluate_features(prepared, expected_planar(expected), brep, &facts)
        }
        Prepared::CylindricalFace(expected) => {
            evaluate_features(prepared, expected_cylinder(expected), brep, &facts)
        }
        Prepared::CircularHole(expected) => {
            evaluate_features(prepared, expected_hole(expected), brep, &facts)
        }
        Prepared::CircularHolePattern(expected) => {
            evaluate_features(prepared, expected_pattern(expected), brep, &facts)
        }
        Prepared::ChamferFeature(expected) => {
            evaluate_features(prepared, expected_chamfer(expected), brep, &facts)
        }
        Prepared::FilletFeature(expected) => {
            evaluate_features(prepared, expected_fillet(expected), brep, &facts)
        }
    };
    match outcome {
        Ok(outcome) => geometric(prepared, subject.content_hash.as_str(), outcome),
        Err(error) => backend_refused(prepared.capability(), error),
    }
}

/// Project retained neutral facts into the public source-shaped BRep evidence.
///
/// The projection deliberately omits evidence that was not measured. In
/// particular, minimum wall thickness remains owned by its proof lane.
pub(crate) fn brep_evidence(
    brep: &dyn BrepSubject,
    facts: &DocumentFacts,
) -> Result<Json, BackendError> {
    let validity = brep.validity()?;
    let features = derive_features(brep, facts, true)?;
    let bounds = facts.shape.bounds;
    let size = std::array::from_fn(|axis| bounds.max[axis] - bounds.min[axis]);
    let center = std::array::from_fn(|axis| (bounds.min[axis] + bounds.max[axis]) / 2.0);
    Ok(Json::object([
        ("validity", validity_json(&validity)),
        ("topologyCounts", topology_json(facts.shape.topology)),
        (
            "boundingBox",
            Json::object([
                ("min", point_json(bounds.min)),
                ("max", point_json(bounds.max)),
                ("size", point_json(size)),
                ("center", point_json(center)),
            ]),
        ),
        (
            "massProperties",
            Json::object([
                ("surfaceArea", Json::Number(facts.shape.surface_area)),
                ("volume", Json::Number(facts.shape.volume)),
                ("centerOfMass", point_json(facts.shape.center_of_mass)),
            ]),
        ),
        (
            "planarFaces",
            Json::Array(features.planar.iter().map(planar_json).collect()),
        ),
        (
            "cylindricalFaces",
            Json::Array(features.cylinders.iter().map(cylinder_json).collect()),
        ),
        (
            "circularHoles",
            Json::Array(features.holes.iter().map(hole_json).collect()),
        ),
        (
            "circularHolePatterns",
            Json::Array(features.patterns.iter().map(pattern_json).collect()),
        ),
        (
            "chamferFeatures",
            Json::Array(
                features
                    .chamfers
                    .iter()
                    .map(|feature| feature_json(feature, true))
                    .collect(),
            ),
        ),
        (
            "filletFeatures",
            Json::Array(
                features
                    .fillets
                    .iter()
                    .map(|feature| feature_json(feature, false))
                    .collect(),
            ),
        ),
    ]))
}

/// Reusable operation evaluator for Lead-owned `analyzeBrep` dispatch.
pub(crate) fn evaluate_brep(context: &mut EvaluationContext<'_>) -> Evaluation {
    let facts = match context.brep_facts() {
        Ok(Some(value)) => value,
        Ok(None) => return brep_evidence_unavailable(),
        Err(evaluation) => return evaluation,
    };
    let Some(brep) = context.subject().brep.as_deref() else {
        return brep_evidence_unavailable();
    };
    match brep_evidence(brep, &facts) {
        Ok(brep) => Evaluation::Ancillary {
            success: true,
            value: Json::object([
                ("success", Json::Bool(true)),
                ("brep", brep),
                ("diagnostics", Json::Array(Vec::new())),
            ]),
            diagnostics: Vec::new(),
        },
        Err(error) => {
            let mut diagnostic = Diagnostic::error(
                match error.kind {
                    BackendErrorKind::InvalidInput => "GEOSPEC_INVALID_EVIDENCE",
                    BackendErrorKind::Unsupported => "GEOSPEC_UNSUPPORTED_EVIDENCE",
                    BackendErrorKind::ComputationFailed => "GEOSPEC_BACKEND_FAILED",
                    BackendErrorKind::BudgetExceeded { .. } => "MATCHER_TIMEOUT",
                },
                error.message,
            );
            diagnostic.suggestion = Some(
                "Re-ingest the STEP/AP242 subject so its exact BRep facets can be measured.".into(),
            );
            Evaluation::Ancillary {
                success: false,
                value: Json::object([("success", Json::Bool(false))]),
                diagnostics: vec![diagnostic],
            }
        }
    }
}

fn brep_evidence_unavailable() -> Evaluation {
    let mut diagnostic = Diagnostic::error(
        "GEOSPEC_BREP_EVIDENCE_UNAVAILABLE",
        "The ingested subject carries no BRep evidence.",
    );
    diagnostic.suggestion =
        Some("Ingest STEP/AP242 evidence before requesting BRep analysis.".into());
    Evaluation::Ancillary {
        success: false,
        value: Json::object([("success", Json::Bool(false))]),
        diagnostics: vec![diagnostic],
    }
}

struct MatchOutcome {
    positive: bool,
    measured: Json,
    witnesses: Json,
    diagnostics: Vec<Diagnostic>,
}

fn geometric(prepared: &Prepared, content_hash: &str, outcome: MatchOutcome) -> Evaluation {
    Evaluation::Geometric {
        positive_satisfied: outcome.positive,
        diagnostics: outcome.diagnostics,
        evidence: family_evidence(
            content_hash,
            prepared.expected_json(),
            outcome.measured,
            outcome.witnesses,
        ),
        negated_diagnostic: None,
    }
}

fn evaluate_units(expected: &str, facts: &DocumentFacts) -> Result<MatchOutcome, BackendError> {
    let measured = normalize_unit(&facts.source_length_unit, facts.source_unit_to_millimeters);
    let positive = measured == expected;
    let diagnostics = if positive {
        Vec::new()
    } else {
        vec![feature_mismatch(
            "toHaveStepUnits",
            format!("The STEP file declares '{measured}', not the expected '{expected}'."),
            "Re-export with the declared unit, or correct the expectation.",
            Json::object([
                ("measured", Json::string(&measured)),
                ("expected", Json::string(expected)),
            ]),
        )]
    };
    Ok(MatchOutcome {
        positive,
        measured: Json::string(&measured),
        witnesses: Json::object([(
            "sourceUnitToMillimeters",
            Json::Number(facts.source_unit_to_millimeters),
        )]),
        diagnostics,
    })
}

fn normalize_unit(name: &str, scale: f64) -> String {
    let lower = name.trim().to_ascii_lowercase();
    for (factor, unit) in [
        (1.0, "mm"),
        (10.0, "cm"),
        (1000.0, "m"),
        (25.4, "in"),
        (304.8, "ft"),
    ] {
        if (scale - factor).abs() <= factor.abs().max(1.0) * 1e-12 {
            return unit.into();
        }
    }
    match lower.as_str() {
        "millimetre" | "millimeter" | "millimetres" | "millimeters" => "mm".into(),
        "centimetre" | "centimeter" | "centimetres" | "centimeters" => "cm".into(),
        "metre" | "meter" | "metres" | "meters" => "m".into(),
        "inch" | "inches" => "in".into(),
        "foot" | "feet" => "ft".into(),
        _ => name.into(),
    }
}

fn evaluate_products(
    expected: &ProductStructure,
    facts: &DocumentFacts,
) -> Result<MatchOutcome, BackendError> {
    let names: Vec<_> = facts
        .occurrences
        .iter()
        .map(|occurrence| occurrence.path.clone())
        .collect();
    let available: HashSet<_> = names.iter().map(String::as_str).collect();
    let missing: Vec<_> = expected
        .names
        .iter()
        .filter(|name| !available.contains(name.as_str()))
        .cloned()
        .collect();
    let count_holds = expected
        .count
        .as_ref()
        .is_none_or(|value| value.holds(names.len() as f64, 0.0));
    let positive = missing.is_empty() && count_holds;
    let measured = Json::object([
        ("names", strings_json(&names)),
        ("productCount", Json::Number(names.len() as f64)),
    ]);
    let structure = Json::Array(
        facts
            .occurrences
            .iter()
            .map(|occurrence| {
                Json::object([
                    ("name", Json::string(&occurrence.path)),
                    ("path", Json::string(&occurrence.path)),
                    (
                        "transform",
                        Json::Array(
                            occurrence
                                .placement
                                .iter()
                                .copied()
                                .chain([0.0, 0.0, 0.0, 1.0])
                                .map(Json::Number)
                                .collect(),
                        ),
                    ),
                ])
            })
            .collect(),
    );
    let diagnostics = if positive {
        Vec::new()
    } else {
        let mut messages = Vec::new();
        if !missing.is_empty() {
            messages.push(format!(
                "{} declared product(s) are absent: {}",
                missing.len(),
                missing
                    .iter()
                    .take(8)
                    .cloned()
                    .collect::<Vec<_>>()
                    .join(", ")
            ));
        }
        if !count_holds {
            messages.push(format!(
                "the file carries {} products, which does not satisfy {}",
                names.len(),
                expected.count.as_ref().unwrap().describe()
            ));
        }
        vec![feature_mismatch(
            "toHaveProductStructure",
            messages.join("; "),
            "Re-export the assembly with every declared product present, or correct the census.",
            Json::object([
                ("missing", strings_json(&missing)),
                ("productCount", Json::Number(names.len() as f64)),
                ("expected", expected.to_json()),
            ]),
        )]
    };
    Ok(MatchOutcome {
        positive,
        measured,
        witnesses: Json::object([
            ("structure", structure),
            ("missing", strings_json(&missing)),
        ]),
        diagnostics,
    })
}

fn evaluate_occurrences(
    expected: &AssemblyOccurrences,
    facts: &DocumentFacts,
    regex: &dyn EcmaRegexEngine,
) -> Result<MatchOutcome, BackendError> {
    if facts.occurrences.is_empty() {
        return Err(BackendError {
            kind: BackendErrorKind::Unsupported,
            message: "The retained STEP document carries no measured assembly occurrences.".into(),
        });
    }
    let mut failures = Vec::new();
    for rule in &expected.occurrences {
        let mut matches = Vec::new();
        for occurrence in &facts.occurrences {
            let matched = rule
                .name
                .matches(&occurrence.path, Some(regex))
                .map_err(regex_backend_error)?;
            if matched {
                matches.push(occurrence);
            }
        }
        if let Some(count) = &rule.count {
            if !count.holds(matches.len() as f64, 0.0) {
                failures.push(format!(
                    "'{}' matched {} occurrence(s), which does not satisfy {}",
                    rule.name.describe(),
                    matches.len(),
                    count.describe()
                ));
                continue;
            }
        }
        if matches.is_empty() {
            failures.push(format!("'{}' matched no occurrence", rule.name.describe()));
            continue;
        }
        if let Some(bounds) = &rule.bounds {
            compare_occurrence_bounds(&mut failures, &rule.name, matches[0].bounds, bounds);
        }
    }
    if expected.unique_names {
        let mut seen = HashSet::new();
        for occurrence in &facts.occurrences {
            if !seen.insert(occurrence.path.as_str()) {
                failures.push(format!(
                    "occurrence name '{}' is not unique",
                    occurrence.path
                ));
            }
        }
    }
    let positive = failures.is_empty();
    let measured = Json::object([(
        "occurrenceCount",
        Json::Number(facts.occurrences.len() as f64),
    )]);
    let inventory = Json::Array(
        facts
            .occurrences
            .iter()
            .map(|value| {
                Json::object([
                    ("name", Json::string(&value.path)),
                    ("bounds", bounds_json(value.bounds)),
                ])
            })
            .collect(),
    );
    let diagnostics = if positive {
        Vec::new()
    } else {
        let shown = failures
            .iter()
            .take(8)
            .cloned()
            .collect::<Vec<_>>()
            .join("; ");
        let more = if failures.len() > 8 {
            format!(" (+{} more)", failures.len() - 8)
        } else {
            String::new()
        };
        vec![feature_mismatch(
            "toHaveAssemblyOccurrences",
            format!("Assembly occurrence rules failed: {shown}{more}."),
            "Re-export the assembly with the declared occurrences, or correct the census.",
            Json::object([
                ("failures", strings_json(&failures)),
                (
                    "occurrenceCount",
                    Json::Number(facts.occurrences.len() as f64),
                ),
            ]),
        )]
    };
    Ok(MatchOutcome {
        positive,
        measured,
        witnesses: Json::object([
            ("inventory", inventory),
            ("failures", strings_json(&failures)),
        ]),
        diagnostics,
    })
}

fn regex_backend_error(error: EcmaRegexError) -> BackendError {
    let (kind, message) = match error {
        EcmaRegexError::InvalidSyntax(message) => (BackendErrorKind::InvalidInput, message),
        EcmaRegexError::Unsupported(message) => (BackendErrorKind::Unsupported, message),
    };
    BackendError {
        kind,
        message: format!("ECMAScript regular-expression evaluation is unsupported: {message}"),
    }
}

fn compare_occurrence_bounds(
    failures: &mut Vec<String>,
    name: &TextPattern,
    measured: Bounds,
    expected: &OccurrenceBounds,
) {
    let center = std::array::from_fn(|axis| (measured.min[axis] + measured.max[axis]) / 2.0);
    for (field, actual, declared) in [
        ("min", measured.min, expected.min),
        ("max", measured.max, expected.max),
        ("center", center, expected.center),
    ] {
        let Some(declared) = declared else { continue };
        for (axis, expected_value) in declared.into_iter().enumerate() {
            if let Some(expected_value) = expected_value {
                if (actual[axis] - expected_value).abs() > expected.tolerance {
                    failures.push(format!(
                        "'{}' {field}.{} is {}, not {} (±{})",
                        name.describe(),
                        ["x", "y", "z"][axis],
                        number(actual[axis]),
                        number(expected_value),
                        number(expected.tolerance)
                    ));
                }
            }
        }
    }
}

fn evaluate_validity(
    expected: &ValidBrep,
    validity: &ValidityFacts,
) -> Result<MatchOutcome, BackendError> {
    let missing = [
        (
            expected.max_tolerance.is_some() && validity.max_tolerance.is_none(),
            "maximum tolerance",
        ),
        (
            expected.free_bounds.is_some() && validity.free_bounds.is_none(),
            "free-bound count",
        ),
        (
            expected.min_edge_length.is_some() && validity.small_edges.is_none(),
            "small-edge census",
        ),
        (
            expected.same_parameter.is_some() && validity.same_parameter.is_none(),
            "same-parameter state",
        ),
        (
            expected.closed_shells.is_some() && validity.closed_shells.is_none(),
            "closed-shell state",
        ),
        (
            expected.closed_wires.is_some() && validity.closed_wires.is_none(),
            "closed-wire state",
        ),
    ]
    .into_iter()
    .filter_map(|(missing, label)| missing.then_some(label))
    .collect::<Vec<_>>();
    if !missing.is_empty() {
        return Err(BackendError {
            kind: BackendErrorKind::Unsupported,
            message: format!("The validity facet did not measure {}.", missing.join(", ")),
        });
    }
    let mut failures = Vec::new();
    if !validity.valid {
        failures.push(match &validity.reason {
            Some(reason) => format!("the kernel reports the shape invalid ({reason})"),
            None => "the kernel reports the shape invalid".into(),
        });
    }
    if let (Some(expected), Some(actual)) = (expected.max_tolerance, validity.max_tolerance) {
        if actual > expected {
            failures.push(format!(
                "maximum tolerance {} exceeds the declared {}",
                number(actual),
                number(expected)
            ));
        }
    }
    if let Some(expected) = &expected.free_bounds {
        let actual = validity.free_bounds.expect("required field checked above") as f64;
        if !expected.holds(actual, 0.0) {
            failures.push(format!(
                "{} free bounds, which does not satisfy {}",
                number(actual),
                expected.describe()
            ));
        }
    }
    if let Some(minimum) = expected.min_edge_length {
        let short = validity
            .small_edges
            .as_deref()
            .expect("required field checked above")
            .iter()
            .filter(|edge| edge.length < minimum)
            .count();
        if short > 0 {
            failures.push(format!(
                "{short} edges shorter than the declared {} mm",
                number(minimum)
            ));
        }
    }
    for (label, declared, actual) in [
        (
            "same-parameter",
            expected.same_parameter,
            validity.same_parameter,
        ),
        (
            "closed shells",
            expected.closed_shells,
            validity.closed_shells,
        ),
        ("closed wires", expected.closed_wires, validity.closed_wires),
    ] {
        if let (Some(declared), Some(actual)) = (declared, actual) {
            if declared != actual {
                failures.push(format!("{label} is {actual}, not the declared {declared}"));
            }
        }
    }
    let positive = failures.is_empty();
    let measured = validity_json(validity);
    let diagnostics = if positive {
        Vec::new()
    } else {
        vec![feature_mismatch(
            "toBeValidBrep",
            format!("Exact BRep validity failed: {}.", failures.join("; ")),
            "Repair the model in the CAD kernel (heal faces, close shells) and re-export.",
            Json::object([
                ("failures", strings_json(&failures)),
                ("validity", measured.clone()),
            ]),
        )]
    };
    Ok(MatchOutcome {
        positive,
        measured,
        witnesses: Json::object([("failures", strings_json(&failures))]),
        diagnostics,
    })
}

fn evaluate_topology(
    expected: &TopologyExpectation,
    counts: TopologyCounts,
) -> Result<MatchOutcome, BackendError> {
    let actual = [
        counts.vertices,
        counts.edges,
        counts.wires,
        counts.faces,
        counts.shells,
        counts.solids,
        counts.compounds,
    ];
    let mut failures = Vec::new();
    for ((key, declared), actual) in TOPOLOGY_KEYS.iter().zip(&expected.values).zip(actual) {
        if declared
            .as_ref()
            .is_some_and(|declared| !declared.holds(actual as f64, expected.tolerance))
        {
            failures.push(format!(
                "{key}: {actual} does not satisfy {}",
                declared.as_ref().unwrap().describe()
            ));
        }
    }
    let positive = failures.is_empty();
    let measured = topology_json(counts);
    let diagnostics = if positive {
        Vec::new()
    } else {
        vec![feature_mismatch(
            "toHaveTopologyCounts",
            format!(
                "Exact topology counts do not match: {}.",
                failures.join("; ")
            ),
            "Correct the model, or widen the declared topology-count expectation.",
            Json::object([
                ("failures", strings_json(&failures)),
                ("counts", measured.clone()),
            ]),
        )]
    };
    Ok(MatchOutcome {
        positive,
        measured,
        witnesses: Json::object([("failures", strings_json(&failures))]),
        diagnostics,
    })
}

#[derive(Clone)]
struct PlanarFace {
    normal: [f64; 3],
    offset: f64,
    area: f64,
    center: [f64; 3],
}

#[derive(Clone)]
struct CylinderFace {
    radius: f64,
    axis: Axis,
    center: [f64; 3],
    axis_min: f64,
    axis_max: f64,
    reversed: bool,
}

#[derive(Clone)]
struct Hole {
    diameter: f64,
    through: bool,
    axis: Axis,
    center: [f64; 3],
    axis_min: f64,
    axis_max: f64,
}

#[derive(Clone)]
struct HolePattern {
    count: usize,
    hole_diameter: f64,
    bolt_circle_diameter: f64,
    axis: Axis,
    center: [f64; 3],
}

#[derive(Clone)]
struct Feature {
    value: f64,
    selection: Option<String>,
}

struct Features {
    planar: Vec<PlanarFace>,
    cylinders: Vec<CylinderFace>,
    holes: Vec<Hole>,
    patterns: Vec<HolePattern>,
    chamfers: Vec<Feature>,
    fillets: Vec<Feature>,
}

type FeatureDecision = Box<dyn FnOnce(&Features) -> MatchOutcome>;

fn evaluate_features(
    prepared: &Prepared,
    decide: FeatureDecision,
    brep: &dyn BrepSubject,
    facts: &DocumentFacts,
) -> Result<MatchOutcome, BackendError> {
    derive_features(brep, facts, matches!(prepared, Prepared::ChamferFeature(_)))
        .map(|features| decide(&features))
}

fn derive_features(
    brep: &dyn BrepSubject,
    facts: &DocumentFacts,
    include_revolved_chamfers: bool,
) -> Result<Features, BackendError> {
    let whole_faces = brep.faces()?;
    let mut planar = Vec::new();
    let mut cylinders = Vec::new();
    let mut chamfers = Vec::new();
    let mut fillets = Vec::new();
    let extent = std::array::from_fn::<_, 3, _>(|axis| {
        facts.shape.bounds.max[axis] - facts.shape.bounds.min[axis]
    });
    let min_extent = extent.into_iter().fold(f64::INFINITY, f64::min);
    for face in whole_faces.iter() {
        match &face.facts.surface {
            SurfaceFacts::Plane { origin, normal } => {
                let normal = if face.reversed {
                    [-normal[0], -normal[1], -normal[2]]
                } else {
                    *normal
                };
                let row = PlanarFace {
                    normal,
                    offset: dot(normal, *origin),
                    area: face.facts.area,
                    center: face.facts.center_of_mass,
                };
                if !axis_aligned(normal) {
                    let distance = estimate_chamfer(&row, facts.shape.bounds);
                    if distance > 1e-6 {
                        chamfers.push(Feature {
                            value: distance,
                            selection: None,
                        });
                    }
                }
                planar.push(row);
            }
            SurfaceFacts::Cylinder { axis, radius, .. } => {
                let principal = Axis::dominant(*axis);
                let row = CylinderFace {
                    radius: *radius,
                    axis: principal,
                    center: face.facts.center_of_mass,
                    axis_min: face.bounds.min[principal.index()],
                    axis_max: face.bounds.max[principal.index()],
                    reversed: face.reversed,
                };
                if !face.reversed && *radius > 0.0 && *radius < min_extent / 2.0 {
                    fillets.push(Feature {
                        value: *radius,
                        selection: None,
                    });
                }
                cylinders.push(row);
            }
            _ => {}
        }
    }

    if include_revolved_chamfers {
        let mut revolved_seen = Vec::new();
        for occurrence in 0..facts.occurrences.len().min(MAX_PART_OCCURRENCES) {
            let faces = brep.occurrence_faces(occurrence as u32)?;
            for face in faces.iter() {
                if let SurfaceFacts::Cone { axis, .. } = &face.facts.surface {
                    let principal = Axis::dominant(*axis);
                    let span = std::array::from_fn::<_, 3, _>(|axis| {
                        face.bounds.max[axis] - face.bounds.min[axis]
                    });
                    let axial = span[principal.index()];
                    let radial = span
                        .into_iter()
                        .enumerate()
                        .filter(|(axis, _)| *axis != principal.index())
                        .map(|(_, value)| value)
                        .fold(0.0_f64, f64::max)
                        / 2.0;
                    if axial > 0.0 && axial <= radial && axial <= PAD_SEPARATION_GAP {
                        let distance = round3(axial);
                        if !revolved_seen.contains(&distance.to_bits()) {
                            revolved_seen.push(distance.to_bits());
                            chamfers.push(Feature {
                                value: distance,
                                selection: Some(format!(
                                    "revolved chamfer (axis {})",
                                    principal.as_str()
                                )),
                            });
                        }
                    }
                }
            }
        }
    }
    let holes: Vec<_> = cylinders
        .iter()
        .filter(|face| face.reversed)
        .map(|face| Hole {
            diameter: face.radius * 2.0,
            through: face.axis_min <= facts.shape.bounds.min[face.axis.index()] + 0.1
                && face.axis_max >= facts.shape.bounds.max[face.axis.index()] - 0.1,
            axis: face.axis,
            center: face.center,
            axis_min: face.axis_min,
            axis_max: face.axis_max,
        })
        .collect();
    let patterns = derive_patterns(&holes);
    Ok(Features {
        planar,
        cylinders,
        holes,
        patterns,
        chamfers,
        fillets,
    })
}

fn expected_planar(expected: &PlanarExpectation) -> FeatureDecision {
    let expected = expected.clone();
    Box::new(move |features| {
        let matches = features
            .planar
            .iter()
            .filter(|face| {
                let flip = expected.normal.iter().enumerate().all(|(axis, value)| {
                    value.is_none_or(|value| {
                        (-face.normal[axis] - value).abs() <= expected.tolerance
                    })
                });
                let sign = if flip { -1.0 } else { 1.0 };
                expected.normal.iter().enumerate().all(|(axis, value)| {
                    value.is_none_or(|value| {
                        (sign * face.normal[axis] - value).abs() <= expected.tolerance
                    })
                }) && (sign * face.offset - expected.offset).abs() <= expected.tolerance
                    && expected
                        .area
                        .as_ref()
                        .is_none_or(|area| area.holds(face.area, expected.tolerance))
            })
            .map(planar_json)
            .collect::<Vec<_>>();
        feature_outcome(
            "toHavePlanarFace",
            format!(
                "No planar face matches normal [{}] at offset {} within {} mm.",
                expected
                    .normal
                    .iter()
                    .map(|value| value.map(number).unwrap_or_default())
                    .collect::<Vec<_>>()
                    .join(", "),
                number(expected.offset),
                number(expected.tolerance)
            ),
            "Check the declared normal/offset against the exported frame, or widen the tolerance.",
            "planarFaces",
            Json::Array(features.planar.iter().map(planar_json).collect()),
            matches,
            expected.to_json(),
        )
    })
}

fn expected_cylinder(expected: &CylindricalExpectation) -> FeatureDecision {
    let expected = expected.clone();
    Box::new(move |features| {
        let matches = features
            .cylinders
            .iter()
            .filter(|face| {
                face.axis == expected.axis
                    && (face.radius - expected.radius).abs() <= expected.tolerance
            })
            .map(cylinder_json)
            .collect::<Vec<_>>();
        feature_outcome(
            "toHaveCylindricalFace",
            format!(
                "No cylindrical face has radius {} on the {} axis within {} mm.",
                number(expected.radius),
                expected.axis.as_str(),
                number(expected.tolerance)
            ),
            "Check the declared radius/axis against the export, or widen the tolerance.",
            "cylindricalFaces",
            Json::Array(features.cylinders.iter().map(cylinder_json).collect()),
            matches,
            expected.to_json(),
        )
    })
}

fn expected_hole(expected: &HoleExpectation) -> FeatureDecision {
    let expected = expected.clone();
    Box::new(move |features| {
        let matches = features
            .holes
            .iter()
            .filter(|hole| {
                (hole.diameter - expected.diameter).abs() <= expected.tolerance
                    && expected.through.is_none_or(|value| value == hole.through)
                    && expected.axis.is_none_or(|value| value == hole.axis)
                    && expected
                        .center
                        .is_none_or(|center| point_holds(hole.center, center, expected.tolerance))
            })
            .map(hole_json)
            .collect::<Vec<_>>();
        feature_outcome(
            "toHaveCircularHole",
            format!(
                "No circular hole matches diameter {} within {} mm.",
                number(expected.diameter), number(expected.tolerance)
            ),
            "Check the declared diameter/axis/through-ness against the export, or widen the tolerance.",
            "circularHoles",
            Json::Array(features.holes.iter().map(hole_json).collect()),
            matches,
            expected.to_json(),
        )
    })
}

fn expected_pattern(expected: &PatternExpectation) -> FeatureDecision {
    let expected = expected.clone();
    Box::new(move |features| {
        let matches = features
            .patterns
            .iter()
            .filter(|pattern| {
                pattern.count == expected.count
                    && (pattern.hole_diameter - expected.hole_diameter).abs() <= expected.tolerance
                    && expected.bolt_circle_diameter.is_none_or(|value| {
                        (pattern.bolt_circle_diameter - value).abs() <= expected.tolerance
                    })
                    && expected.axis.is_none_or(|value| value == pattern.axis)
                    && expected.center.is_none_or(|center| {
                        point_holds(pattern.center, center, expected.tolerance)
                    })
            })
            .map(pattern_json)
            .collect::<Vec<_>>();
        feature_outcome(
            "toHaveCircularHolePattern",
            format!(
                "No circular-hole pattern has {} holes of diameter {} within {} mm.",
                expected.count, number(expected.hole_diameter), number(expected.tolerance)
            ),
            "Check the declared count/diameter/bolt circle against the export, or widen the tolerance — a pattern splits when consecutive holes sit further apart than the pad separation gap.",
            "circularHolePatterns",
            Json::Array(features.patterns.iter().map(pattern_json).collect()),
            matches,
            expected.to_json(),
        )
    })
}

fn expected_chamfer(expected: &FeatureExpectation) -> FeatureDecision {
    expected_feature(expected, true)
}

fn expected_fillet(expected: &FeatureExpectation) -> FeatureDecision {
    expected_feature(expected, false)
}

fn expected_feature(expected: &FeatureExpectation, chamfer: bool) -> FeatureDecision {
    let expected = expected.clone();
    Box::new(move |features| {
        let rows = if chamfer {
            &features.chamfers
        } else {
            &features.fillets
        };
        let matches = rows
            .iter()
            .filter(|feature| {
                (feature.value - expected.value).abs() <= expected.tolerance
                    && expected
                        .selection
                        .as_ref()
                        .is_none_or(|selection| feature.selection.as_ref() == Some(selection))
            })
            .map(|row| feature_json(row, chamfer))
            .collect::<Vec<_>>();
        let (matcher, noun, key, suggestion) = if chamfer {
            (
                "toHaveChamferFeature",
                "chamfer",
                "chamferFeatures",
                "Check the declared chamfer distance against the export, or widen the tolerance.",
            )
        } else {
            (
                "toHaveFilletFeature",
                "fillet",
                "filletFeatures",
                "Check the declared fillet radius against the export, or widen the tolerance.",
            )
        };
        feature_outcome(
            matcher,
            format!(
                "No {noun} feature has {} {} within {} mm.",
                if chamfer { "distance" } else { "radius" },
                number(expected.value),
                number(expected.tolerance)
            ),
            suggestion,
            key,
            Json::Array(rows.iter().map(|row| feature_json(row, chamfer)).collect()),
            matches,
            expected.to_json(if chamfer { "distance" } else { "radius" }),
        )
    })
}

fn feature_outcome(
    matcher: &str,
    message: String,
    suggestion: &str,
    key: &str,
    inventory: Json,
    matches: Vec<Json>,
    expected: Json,
) -> MatchOutcome {
    let positive = !matches.is_empty();
    let diagnostics = if positive {
        Vec::new()
    } else {
        vec![feature_mismatch(
            matcher,
            message,
            suggestion,
            Json::object([("expected", expected), (key, inventory.clone())]),
        )]
    };
    MatchOutcome {
        positive,
        measured: Json::object([("matchCount", Json::Number(matches.len() as f64))]),
        witnesses: Json::object([(key, inventory), ("matches", Json::Array(matches))]),
        diagnostics,
    }
}

fn derive_patterns(holes: &[Hole]) -> Vec<HolePattern> {
    let mut groups: Vec<(Axis, f64, bool, Vec<Hole>)> = Vec::new();
    for hole in holes {
        let diameter = round3(hole.diameter);
        if let Some((_, _, _, values)) = groups.iter_mut().find(|(axis, value, through, _)| {
            *axis == hole.axis && value.to_bits() == diameter.to_bits() && *through == hole.through
        }) {
            values.push(hole.clone());
        } else {
            groups.push((hole.axis, diameter, hole.through, vec![hole.clone()]));
        }
    }
    let mut patterns = Vec::new();
    for (axis, _, _, mut group) in groups {
        group.sort_by(|left, right| {
            left.center[axis.index()].total_cmp(&right.center[axis.index()])
        });
        let mut pads: Vec<Vec<Hole>> = Vec::new();
        for hole in group {
            let new_pad = pads
                .last()
                .and_then(|pad| pad.last())
                .is_none_or(|previous| {
                    hole.center[axis.index()] - previous.center[axis.index()] > PAD_SEPARATION_GAP
                });
            if new_pad {
                pads.push(vec![hole]);
            } else {
                pads.last_mut().unwrap().push(hole);
            }
        }
        for pad in pads.into_iter().filter(|pad| pad.len() >= 2) {
            let center = std::array::from_fn(|component| {
                pad.iter().map(|hole| hole.center[component]).sum::<f64>() / pad.len() as f64
            });
            let radial_sum: f64 = pad
                .iter()
                .map(|hole| {
                    let values: Vec<_> = (0..3)
                        .filter(|component| *component != axis.index())
                        .map(|component| hole.center[component] - center[component])
                        .collect();
                    values[0].hypot(values[1])
                })
                .sum();
            patterns.push(HolePattern {
                count: pad.len(),
                hole_diameter: pad[0].diameter,
                bolt_circle_diameter: 2.0 * radial_sum / pad.len() as f64,
                axis,
                center,
            });
        }
    }
    patterns
}

fn axis_aligned(normal: [f64; 3]) -> bool {
    normal
        .into_iter()
        .filter(|value| value.abs() > 1e-4)
        .count()
        <= 1
}

fn estimate_chamfer(face: &PlanarFace, bounds: Bounds) -> f64 {
    let mut extreme_offset = 0.0;
    let mut max_normal = 0.0_f64;
    let mut active_axes = 0;
    for axis in 0..3 {
        let value = face.normal[axis];
        if value.abs() < 1e-4 {
            continue;
        }
        active_axes += 1;
        max_normal = max_normal.max(value.abs());
        extreme_offset += value
            * if value >= 0.0 {
                bounds.max[axis]
            } else {
                bounds.min[axis]
            };
    }
    if active_axes < 2 || max_normal <= 0.0 {
        0.0
    } else {
        (extreme_offset - face.offset).abs() / max_normal
    }
}

fn point_holds(measured: [f64; 3], expected: [Option<f64>; 3], tolerance: f64) -> bool {
    expected
        .into_iter()
        .enumerate()
        .all(|(axis, value)| value.is_none_or(|value| (measured[axis] - value).abs() <= tolerance))
}

fn dot(left: [f64; 3], right: [f64; 3]) -> f64 {
    left[0] * right[0] + left[1] * right[1] + left[2] * right[2]
}

fn round3(value: f64) -> f64 {
    (value * 1000.0).round() / 1000.0
}

fn feature_mismatch(matcher: &str, message: String, suggestion: &str, details: Json) -> Diagnostic {
    let mut diagnostic = Diagnostic::error("GEOSPEC_FEATURE_MISMATCH", message);
    diagnostic.suggestion = Some(suggestion.into());
    let mut values = vec![("matcher".into(), Json::string(matcher))];
    if let Json::Object(details) = details {
        values.extend(details);
    }
    diagnostic.details = Some(Json::Object(values));
    diagnostic
}

fn refused(capability: Capability, missing: &str, suggestion: &str) -> Evaluation {
    let mut diagnostic = Diagnostic::error(
        "GEOSPEC_EVIDENCE_UNSUPPORTED",
        format!(
            "expectGeo(...).{}() needs {missing}, which this subject does not carry.",
            capability.name()
        ),
    );
    diagnostic.suggestion = Some(suggestion.into());
    diagnostic.details = Some(Json::object([
        ("matcher", Json::string(capability.name())),
        ("missing", Json::string(missing)),
    ]));
    Evaluation::Refused {
        diagnostics: vec![diagnostic],
    }
}

fn backend_refused(capability: Capability, error: BackendError) -> Evaluation {
    refused(
        capability,
        &format!("exact BRep evidence ({})", error.message),
        BREP_SUGGESTION,
    )
}

fn number(value: f64) -> String {
    ryu_js::Buffer::new().format_finite(value).to_owned()
}

fn strings_json(values: &[String]) -> Json {
    Json::Array(values.iter().map(|value| Json::string(value)).collect())
}

fn point_json(value: [f64; 3]) -> Json {
    Json::Array(value.into_iter().map(Json::Number).collect())
}

fn bounds_json(value: Bounds) -> Json {
    Json::object([
        ("min", point_json(value.min)),
        ("max", point_json(value.max)),
    ])
}

fn topology_json(value: TopologyCounts) -> Json {
    Json::object([
        ("vertices", Json::Number(value.vertices as f64)),
        ("edges", Json::Number(value.edges as f64)),
        ("wires", Json::Number(value.wires as f64)),
        ("faces", Json::Number(value.faces as f64)),
        ("shells", Json::Number(value.shells as f64)),
        ("solids", Json::Number(value.solids as f64)),
        ("compounds", Json::Number(value.compounds as f64)),
    ])
}

fn validity_json(value: &ValidityFacts) -> Json {
    let mut fields = vec![("valid".into(), Json::Bool(value.valid))];
    if let Some(value) = &value.checks {
        fields.push((
            "checks".into(),
            Json::Array(
                value
                    .iter()
                    .map(|check| {
                        Json::object([
                            ("shape", Json::string(&check.shape)),
                            ("status", Json::string(&check.status)),
                        ])
                    })
                    .collect(),
            ),
        ));
    }
    if let Some(value) = value.max_tolerance {
        fields.push(("maxTolerance".into(), Json::Number(value)));
    }
    if let Some(value) = value.free_bounds {
        fields.push((
            "freeBounds".into(),
            Json::object([("count", Json::Number(value as f64))]),
        ));
    }
    if let Some(value) = &value.small_edges {
        fields.push((
            "smallEdges".into(),
            Json::Array(
                value
                    .iter()
                    .map(|edge| {
                        let mut fields = vec![("length".into(), Json::Number(edge.length))];
                        if let Some(value) = &edge.shape {
                            fields.push(("shape".into(), Json::string(value)));
                        }
                        if let Some(value) = edge.location {
                            fields.push(("location".into(), point_json(value)));
                        }
                        Json::Object(fields)
                    })
                    .collect(),
            ),
        ));
    }
    for (key, value) in [
        ("sameParameter", value.same_parameter),
        ("closedShells", value.closed_shells),
        ("closedSolids", value.closed_solids),
        ("closedWires", value.closed_wires),
    ] {
        if let Some(value) = value {
            fields.push((key.into(), Json::Bool(value)));
        }
    }
    for (key, value) in [
        ("solidCount", value.solid_count),
        ("invalidSolidCount", value.invalid_solid_count),
        ("openEdgeCount", value.open_edge_count),
    ] {
        if let Some(value) = value {
            fields.push((key.into(), Json::Number(value as f64)));
        }
    }
    if let Some(value) = &value.reason {
        fields.push(("reason".into(), Json::string(value)));
    }
    Json::Object(fields)
}

fn planar_json(value: &PlanarFace) -> Json {
    Json::object([
        ("normal", point_json(value.normal)),
        ("offset", Json::Number(value.offset)),
        ("area", Json::Number(value.area)),
        ("center", point_json(value.center)),
    ])
}

fn cylinder_json(value: &CylinderFace) -> Json {
    Json::object([
        ("radius", Json::Number(value.radius)),
        ("axis", Json::string(value.axis.as_str())),
        ("center", point_json(value.center)),
        (
            "axisRange",
            Json::object([
                ("min", Json::Number(value.axis_min)),
                ("max", Json::Number(value.axis_max)),
            ]),
        ),
    ])
}

fn hole_json(value: &Hole) -> Json {
    Json::object([
        ("diameter", Json::Number(value.diameter)),
        ("through", Json::Bool(value.through)),
        ("axis", Json::string(value.axis.as_str())),
        ("center", point_json(value.center)),
        (
            "axisRange",
            Json::object([
                ("min", Json::Number(value.axis_min)),
                ("max", Json::Number(value.axis_max)),
            ]),
        ),
    ])
}

fn pattern_json(value: &HolePattern) -> Json {
    Json::object([
        ("count", Json::Number(value.count as f64)),
        ("holeDiameter", Json::Number(value.hole_diameter)),
        (
            "boltCircleDiameter",
            Json::Number(value.bolt_circle_diameter),
        ),
        ("axis", Json::string(value.axis.as_str())),
        ("center", point_json(value.center)),
    ])
}

fn feature_json(value: &Feature, chamfer: bool) -> Json {
    let mut fields = vec![(
        if chamfer { "distance" } else { "radius" }.into(),
        Json::Number(value.value),
    )];
    if let Some(value) = &value.selection {
        fields.push(("selection".into(), Json::string(value)));
    }
    Json::Object(fields)
}

#[cfg(test)]
#[path = "../../tests/matcher_brep.rs"]
mod tests;
