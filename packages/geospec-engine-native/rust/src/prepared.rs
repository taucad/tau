//! Source-backed authored call lowering and common typed expectations.

pub(crate) mod family;
pub(crate) mod plan;
pub(crate) mod regexp;

use crate::{
    codec::{encode, Json},
    protocol::{array, invalid_claim, object, optional_field, require_fields, string_field},
    registry::{Capability, ExpectedShape},
    ProtocolError,
};

pub(crate) const DEFAULT_LINEAR_TOLERANCE: f64 = 0.02;
pub(crate) const DEFAULT_ANGULAR_TOLERANCE_DEGREES: f64 = 0.5;

/// Ancillary operations return observations rather than negatable predicates.
pub(crate) fn validate_query_polarity(
    capability: Capability,
    polarity: crate::result::Polarity,
) -> Result<(), ProtocolError> {
    if capability.is_query() && polarity == crate::result::Polarity::Negative {
        return invalid_claim(format!(
            "Ancillary capability '{}' requires positive polarity.",
            capability.name()
        ));
    }
    Ok(())
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub(crate) struct AnalysisDemand {
    pub mesh: bool,
    pub connected_components_tolerance_bits: Option<u64>,
    pub brep: bool,
    pub selectors: bool,
    pub csg: bool,
    pub wall: bool,
}

/// Check one supplied payload and lower authored arguments without geometry.
pub(crate) fn expected(capability: Capability, payload: &Json) -> Result<Json, ProtocolError> {
    let payload = object(payload, "matcher payload")?;
    require_fields(
        payload,
        &["kind", "expected", "arguments"],
        &["kind"],
        "matcher payload",
    )?;
    if Some(string_field(payload, "kind")?) != capability.kind() {
        return invalid_claim(format!(
            "{} requires kind {}.",
            capability.name(),
            capability.kind().unwrap_or("ancillary")
        ));
    }
    let authored = optional_field(payload, "expected");
    let arguments = optional_field(payload, "arguments")
        .map(|value| array(value, "matcher arguments"))
        .transpose()?;
    let from_arguments = if let Some(arguments) =
        arguments.filter(|arguments| !arguments.is_empty())
    {
        Some(match capability.expected_shape() {
            ExpectedShape::Bounds => match arguments {
                [first] => first.clone(),
                [min, max] => Json::object([("min", min.clone()), ("max", max.clone())]),
                _ => {
                    return invalid_claim("Bounding-box arguments must contain at most two values.")
                }
            },
            ExpectedShape::True => {
                return invalid_claim(format!("{} takes no arguments.", capability.name()))
            }
            ExpectedShape::First | ExpectedShape::FirstOrEmpty => match arguments {
                [first] => first.clone(),
                _ => {
                    return invalid_claim(format!(
                        "{} requires at most one argument.",
                        capability.name()
                    ))
                }
            },
        })
    } else {
        None
    };
    if let (Some(authored), Some(lowered)) = (authored, from_arguments.as_ref()) {
        if encode(authored)? != encode(lowered)? {
            return invalid_claim(format!(
                "{} arguments must lower to the supplied expected value.",
                capability.name()
            ));
        }
    }
    let value = from_arguments.or_else(|| authored.cloned());
    match (capability.expected_shape(), value) {
        (ExpectedShape::True, None | Some(Json::Bool(true))) => Ok(Json::Bool(true)),
        (ExpectedShape::True, _) => {
            invalid_claim(format!("{} expected must be true.", capability.name()))
        }
        (ExpectedShape::FirstOrEmpty, None | Some(Json::Null)) => Ok(Json::Object(Vec::new())),
        (_, Some(value)) => Ok(value),
        (_, None) => invalid_claim(format!("{} requires an expected value.", capability.name())),
    }
}

pub(crate) fn normalized_payload(capability: Capability, expected: Json) -> Json {
    Json::object([
        (
            "kind",
            Json::string(capability.kind().unwrap_or("ancillary")),
        ),
        ("expected", expected),
    ])
}

pub(crate) fn finite(value: &Json, label: &str) -> Result<f64, ProtocolError> {
    match value {
        Json::Number(number) if number.is_finite() => Ok(*number),
        _ => invalid_claim(format!("{label} must be a finite number.")),
    }
}

pub(crate) fn nonnegative(value: &Json, label: &str) -> Result<f64, ProtocolError> {
    let number = finite(value, label)?;
    if number < 0.0 {
        invalid_claim(format!("{label} must be nonnegative."))
    } else {
        Ok(number)
    }
}

pub(crate) fn tolerance(
    fields: &[(String, Json)],
    key: &str,
    default: f64,
) -> Result<f64, ProtocolError> {
    optional_field(fields, key).map_or(Ok(default), |value| nonnegative(value, key))
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) enum NumericExpectation {
    Equal(f64),
    Conditions {
        value: Option<f64>,
        greater_than: Option<f64>,
        greater_than_or_equal: Option<f64>,
        less_than: Option<f64>,
        less_than_or_equal: Option<f64>,
    },
}

impl NumericExpectation {
    pub(crate) fn parse(value: &Json) -> Result<Self, ProtocolError> {
        if matches!(value, Json::Number(_)) {
            return Ok(Self::Equal(finite(value, "numeric expectation")?));
        }
        let fields = object(value, "numeric expectation")?;
        let names = [
            "value",
            "greaterThan",
            "greaterThanOrEqual",
            "lessThan",
            "lessThanOrEqual",
        ];
        require_fields(fields, &names, &[], "numeric expectation")?;
        let mut values = [None; 5];
        for (index, key) in names.iter().enumerate() {
            values[index] = optional_field(fields, key)
                .map(|value| finite(value, key))
                .transpose()?;
        }
        Ok(Self::Conditions {
            value: values[0],
            greater_than: values[1],
            greater_than_or_equal: values[2],
            less_than: values[3],
            less_than_or_equal: values[4],
        })
    }

    pub(crate) fn holds(&self, measured: f64, tolerance: f64) -> bool {
        if !measured.is_finite() {
            return false;
        }
        match self {
            Self::Equal(value) => (measured - value).abs() <= tolerance,
            Self::Conditions {
                value,
                greater_than,
                greater_than_or_equal,
                less_than,
                less_than_or_equal,
            } => {
                value.is_none_or(|value| (measured - value).abs() <= tolerance)
                    && greater_than.is_none_or(|value| measured > value)
                    && greater_than_or_equal.is_none_or(|value| measured >= value)
                    && less_than.is_none_or(|value| measured < value)
                    && less_than_or_equal.is_none_or(|value| measured <= value)
            }
        }
    }

    pub(crate) fn to_json(&self) -> Json {
        match self {
            Self::Equal(value) => Json::Number(*value),
            Self::Conditions {
                value,
                greater_than,
                greater_than_or_equal,
                less_than,
                less_than_or_equal,
            } => Json::Object(
                [
                    ("value", value),
                    ("greaterThan", greater_than),
                    ("greaterThanOrEqual", greater_than_or_equal),
                    ("lessThan", less_than),
                    ("lessThanOrEqual", less_than_or_equal),
                ]
                .into_iter()
                .filter_map(|(key, value)| value.map(|number| (key.into(), Json::Number(number))))
                .collect(),
            ),
        }
    }

    pub(crate) fn describe(&self) -> String {
        let number = |value: f64| ryu_js::Buffer::new().format_finite(value).to_owned();
        match self {
            Self::Equal(value) => number(*value),
            Self::Conditions {
                value,
                greater_than,
                greater_than_or_equal,
                less_than,
                less_than_or_equal,
            } => {
                let parts: Vec<_> = [
                    ("", value),
                    ("> ", greater_than),
                    (">= ", greater_than_or_equal),
                    ("< ", less_than),
                    ("<= ", less_than_or_equal),
                ]
                .into_iter()
                .filter_map(|(prefix, value)| {
                    value.map(|value| format!("{prefix}{}", number(value)))
                })
                .collect();
                if parts.is_empty() {
                    "any value".into()
                } else {
                    parts.join(" and ")
                }
            }
        }
    }
}

/// Missing axes are unconstrained; arrays must be exact triples.
pub(crate) fn point(value: &Json) -> Result<[Option<f64>; 3], ProtocolError> {
    let mut point = [None; 3];
    match value {
        Json::Array(values) if values.len() == 3 => {
            for (axis, value) in values.iter().enumerate() {
                point[axis] = Some(finite(value, "point axis")?);
            }
        }
        Json::Object(fields) => {
            require_fields(fields, &["x", "y", "z"], &[], "point")?;
            for (axis, name) in ["x", "y", "z"].iter().enumerate() {
                point[axis] = optional_field(fields, name)
                    .map(|value| finite(value, "point axis"))
                    .transpose()?;
            }
        }
        _ => return invalid_claim("Point requires a length-three array or an axis object."),
    }
    Ok(point)
}

/// Canonical typed expectation point; bbox retains its separate axis-object contract.
pub(crate) fn normalized_point(value: [Option<f64>; 3]) -> Json {
    if let [Some(x), Some(y), Some(z)] = value {
        Json::Array(vec![Json::Number(x), Json::Number(y), Json::Number(z)])
    } else {
        Json::Object(
            ["x", "y", "z"]
                .into_iter()
                .zip(value)
                .filter_map(|(key, value)| value.map(|value| (key.into(), Json::Number(value))))
                .collect(),
        )
    }
}

#[cfg(test)]
mod point_normalization_tests {
    use serde_json::{json, Value};

    // POINT-NORMALIZATION-01: authored forms are predeclared here; no geometry
    // or candidate output supplies the expected canonical point representation.
    #[test]
    fn point_normalization_seven_fields_preserve_shapes_and_presence() {
        let cases = [
            (
                "toHaveCenterOfMass",
                "centerOfMass",
                json!({"point": null}),
                "/point",
                false,
            ),
            (
                "toHavePlanarFace",
                "planarFace",
                json!({"normal": null, "offset": 9}),
                "/normal",
                false,
            ),
            (
                "toHaveCircularHole",
                "circularHole",
                json!({"diameter": 2, "center": null}),
                "/center",
                true,
            ),
            (
                "toHaveCircularHolePattern",
                "circularHolePattern",
                json!({"count": 4, "holeDiameter": 2, "center": null}),
                "/center",
                true,
            ),
            (
                "toHaveAssemblyOccurrences",
                "assemblyOccurrences",
                json!({"occurrences":[{"name":"left", "bounds":{"min":null}}]}),
                "/occurrences/0/bounds/min",
                true,
            ),
            (
                "toHaveAssemblyOccurrences",
                "assemblyOccurrences",
                json!({"occurrences":[{"name":"left", "bounds":{"max":null}}]}),
                "/occurrences/0/bounds/max",
                true,
            ),
            (
                "toHaveAssemblyOccurrences",
                "assemblyOccurrences",
                json!({"occurrences":[{"name":"left", "bounds":{"center":null}}]}),
                "/occurrences/0/bounds/center",
                true,
            ),
        ];
        let canonical = |capability: &str, kind: &str, expected: Value, polarity: &str| {
            crate::Engine::new().canonical_plan(&serde_json::to_vec(&json!({
                "method":"submitClaims", "requestId":"point-control", "protocolVersion":3,
                "registryVersion":5, "canonicalProfile":"geospec-jcs-v1",
                "plan":{"subjects":[{"slot":"subject", "subjectHash":"0".repeat(64)}],
                    "claims":[{"claimId":"point-control", "capability":capability,
                        "subjectSlots":["subject"], "polarity":polarity, "workUnitBudget":100,
                        "payload":{"kind":kind,"expected":expected}}]}
            })).unwrap()).unwrap()
        };
        for (capability, kind, template, path, optional) in cases {
            for polarity in ["positive", "negative"] {
                let mut full_vector = template.clone();
                *full_vector.pointer_mut(path).unwrap() = json!([1, 2, 3]);
                let mut full_axis = template.clone();
                *full_axis.pointer_mut(path).unwrap() = json!({"x":1,"y":2,"z":3});
                let bytes = canonical(capability, kind, full_vector, polarity);
                assert_eq!(
                    bytes,
                    canonical(capability, kind, full_axis, polarity),
                    "{capability} {path}"
                );
                let full: Value = serde_json::from_slice(&bytes).unwrap();
                let output_path = format!("/plan/claims/0/payload/expected{path}");
                assert_eq!(full.pointer(&output_path), Some(&json!([1, 2, 3])));
                for point in [json!({"x":1,"z":3}), json!({})] {
                    let mut authored = template.clone();
                    *authored.pointer_mut(path).unwrap() = point.clone();
                    let bytes = canonical(capability, kind, authored, polarity);
                    let normalized: Value = serde_json::from_slice(&bytes).unwrap();
                    assert_eq!(normalized.pointer(&output_path), Some(&point));
                    if optional && point == json!({}) {
                        let mut omitted = template.clone();
                        let (parent, key) = path.rsplit_once('/').unwrap();
                        omitted
                            .pointer_mut(parent)
                            .unwrap()
                            .as_object_mut()
                            .unwrap()
                            .remove(key);
                        assert_ne!(
                            bytes,
                            canonical(capability, kind, omitted, polarity),
                            "empty remains present: {path}"
                        );
                    }
                }
            }
        }
        for field in ["min", "max", "size", "center"] {
            let bytes = canonical(
                "toHaveBoundingBox",
                "boundingBox",
                json!({field:[1,2,3]}),
                "positive",
            );
            let value: Value = serde_json::from_slice(&bytes).unwrap();
            assert_eq!(
                value["plan"]["claims"][0]["payload"]["expected"][field],
                json!({"x":1,"y":2,"z":3})
            );
        }
    }
}
