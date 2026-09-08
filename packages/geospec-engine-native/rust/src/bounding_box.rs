use crate::codec::{encode, Json};
use crate::mesh::Mesh;
use crate::protocol::{
    array, field, invalid_claim, number_field, object, optional_field, require_fields, string_field,
};
use crate::ProtocolError;

const FIELDS: [&str; 4] = ["min", "max", "size", "center"];
const AXES: [&str; 3] = ["x", "y", "z"];

pub(crate) fn evaluate(
    mesh: &Mesh,
    hash: &str,
    claim: &[(String, Json)],
) -> Result<Json, ProtocolError> {
    let payload = object(field(claim, "payload")?, "bounding-box payload")?;
    require_fields(
        payload,
        &["kind", "expected", "arguments"],
        &["kind", "expected"],
        "bounding-box payload",
    )?;
    if string_field(payload, "kind")? != "boundingBox" {
        return invalid_claim("toHaveBoundingBox requires kind boundingBox.");
    }
    let expected_value = field(payload, "expected")?;
    let expected = object(expected_value, "bounding-box expected")?;
    require_fields(
        expected,
        &["min", "max", "size", "center", "tolerance"],
        &[],
        "bounding-box expected",
    )?;
    if let Some(arguments) = optional_field(payload, "arguments") {
        let arguments = array(arguments, "bounding-box arguments")?;
        let lowered = match arguments {
            [] => expected_value.clone(),
            [first] => first.clone(),
            [min, max] => Json::object([("min", min.clone()), ("max", max.clone())]),
            _ => return invalid_claim("Bounding-box arguments must contain at most two values."),
        };
        // Canonical comparison gives JSON object equality independent of key order.
        if encode(&lowered)? != encode(expected_value)? {
            return invalid_claim(
                "Bounding-box arguments must lower to the supplied expected value.",
            );
        }
    }
    let tolerance = match optional_field(expected, "tolerance") {
        None => 0.02,
        Some(Json::Number(value)) if value.is_finite() && *value >= 0.0 => *value,
        _ => return invalid_claim("Bounding-box tolerance must be a finite nonnegative number."),
    };
    let mut declared = [[None; 3]; 4];
    for (index, name) in FIELDS.iter().enumerate() {
        if let Some(value) = optional_field(expected, name) {
            declared[index] = declared_axes(value, index < 2)?;
        }
    }
    let work = mesh.indices.len()
        + declared
            .iter()
            .flatten()
            .filter(|axis| axis.is_some())
            .count();
    let budget = number_field(claim, "workUnitBudget")?;
    let claim_id = string_field(claim, "claimId")?;
    if (work as f64) > budget {
        return Ok(Json::object([
            ("claimId", Json::string(claim_id)),
            ("status", Json::string("refused")),
            (
                "diagnostics",
                Json::Array(vec![Json::object([
                    ("code", Json::string("MATCHER_TIMEOUT")),
                    ("severity", Json::string("error")),
                    (
                        "message",
                        Json::string("Bounding-box work exceeds the declared work-unit budget."),
                    ),
                    (
                        "details",
                        Json::object([
                            ("requiredWorkUnits", Json::Number(work as f64)),
                            ("workUnitBudget", Json::Number(budget)),
                        ]),
                    ),
                ])]),
            ),
        ]));
    }

    let bounds = mesh.bounds();
    let measured = Json::object(std::array::from_fn::<_, 4, _>(|index| {
        (FIELDS[index], point(bounds[index]))
    }));
    let mut failures = Vec::new();
    let mut failed_names = Vec::new();
    for (field_index, axes) in declared.iter().enumerate() {
        for (axis, expected) in axes.iter().enumerate() {
            if let Some(expected) = expected {
                let actual = bounds[field_index][axis];
                if (actual - expected).abs() > tolerance {
                    failures.push(Json::object([
                        ("axis", Json::string(AXES[axis])),
                        ("expected", Json::Number(*expected)),
                        ("actual", Json::Number(actual)),
                        ("field", Json::string(FIELDS[field_index])),
                    ]));
                    failed_names.push(format!("{}.{}", FIELDS[field_index], AXES[axis]));
                }
            }
        }
    }
    let positive_satisfied = failures.is_empty();
    let polarity = string_field(claim, "polarity")?;
    let passed = positive_satisfied == (polarity == "positive");
    let evidence = Json::object([
        ("profile", Json::string("mesh-bounds-v1")),
        ("source", Json::string("mesh")),
        ("scope", Json::string("whole-subject")),
        ("subjectContentHash", Json::string(hash)),
        ("polarity", Json::string(polarity)),
        ("measured", measured.clone()),
        ("expected", expected_value.clone()),
        ("tolerance", Json::Number(tolerance)),
        ("positiveSatisfied", Json::Bool(positive_satisfied)),
        ("axisFailures", Json::Array(failures.clone())),
    ]);
    let diagnostics = if passed {
        Vec::new()
    } else {
        let mut details = vec![
            ("matcher".into(), Json::string("toHaveBoundingBox")),
            ("measured".into(), measured),
            ("tolerance".into(), Json::Number(tolerance)),
            ("evidence".into(), Json::string("mesh")),
        ];
        let (code, message, suggestion) = if polarity == "positive" {
            details.push(("axisFailures".into(), Json::Array(failures)));
            (
                "GEOSPEC_BOUNDING_BOX_MISMATCH",
                format!(
                    "Bounding box is off the declared bounds on {} (tolerance {}).",
                    failed_names.join(", "),
                    ryu_js::Buffer::new().format_finite(tolerance)
                ),
                "Correct the model dimensions, or widen the declared bounding-box tolerance.",
            )
        } else {
            details.push(("polarity".into(), Json::string("negative")));
            (
                "GEOSPEC_NEGATED_BOUNDING_BOX_MATCH",
                "Bounding box satisfies the declared bounds, but the claim requires it not to."
                    .into(),
                "Correct the model dimensions, or revise the negated bounding-box requirement.",
            )
        };
        vec![Json::object([
            ("code", Json::string(code)),
            ("severity", Json::string("error")),
            ("message", Json::String(message)),
            ("suggestion", Json::string(suggestion)),
            (
                "spatial",
                Json::object([
                    ("min", point(bounds[0])),
                    ("max", point(bounds[1])),
                    ("center", point(bounds[3])),
                ]),
            ),
            ("details", Json::Object(details)),
        ])]
    };
    Ok(Json::object([
        ("claimId", Json::string(claim_id)),
        (
            "status",
            Json::string(if passed { "passed" } else { "failed" }),
        ),
        ("diagnostics", Json::Array(diagnostics)),
        ("evidence", evidence),
    ]))
}

fn declared_axes(value: &Json, allow_array: bool) -> Result<[Option<f64>; 3], ProtocolError> {
    let mut axes = [None; 3];
    match value {
        Json::Array(values) if allow_array && values.len() == 3 => {
            for (axis, value) in values.iter().enumerate() {
                axes[axis] = Some(finite_number(value)?);
            }
        }
        Json::Object(fields) => {
            require_fields(fields, &AXES, &[], "bounding-box axes")?;
            for (axis, name) in AXES.iter().enumerate() {
                if let Some(value) = optional_field(fields, name) {
                    axes[axis] = Some(finite_number(value)?);
                }
            }
        }
        _ => {
            return invalid_claim(
                "Bounding-box fields require axis objects, or length-three arrays for min/max.",
            )
        }
    }
    Ok(axes)
}

fn finite_number(value: &Json) -> Result<f64, ProtocolError> {
    match value {
        Json::Number(value) if value.is_finite() => Ok(*value),
        _ => invalid_claim("Bounding-box expected axes must be finite numbers."),
    }
}

fn point(point: [f64; 3]) -> Json {
    Json::Array(point.into_iter().map(Json::Number).collect())
}
