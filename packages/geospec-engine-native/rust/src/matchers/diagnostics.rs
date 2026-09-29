//! Source diagnostic filtering over an admitted subject; no geometry query.

use crate::{
    codec::Json,
    prepared::{self, AnalysisDemand},
    protocol::{array, invalid_claim, object, optional_field, require_fields},
    registry::Capability,
    result::{Diagnostic, Evaluation, Severity},
    subject::EvaluationContext,
    ProtocolError,
};

pub(crate) struct Prepared {
    severities: Vec<Severity>,
}

pub(crate) fn prepare(capability: Capability, payload: &Json) -> Result<Prepared, ProtocolError> {
    if capability != Capability::ToHaveNoDiagnostics {
        return invalid_claim("Diagnostic preparation requires toHaveNoDiagnostics.");
    }
    let expected = prepared::expected(capability, payload)?;
    let empty = Json::object([]);
    let fields = object(
        if expected == Json::Null {
            &empty
        } else {
            &expected
        },
        "noDiagnostics expected",
    )?;
    require_fields(fields, &["severities"], &[], "noDiagnostics expected")?;
    let mut severities = Vec::new();
    if let Some(value) = optional_field(fields, "severities") {
        for value in array(value, "noDiagnostics severities")? {
            let severity = match value {
                Json::String(value) if value == "error" => Severity::Error,
                Json::String(value) if value == "warning" => Severity::Warning,
                Json::String(value) if value == "info" => Severity::Info,
                _ => {
                    return invalid_claim(
                        "noDiagnostics severities must contain error, warning, or info.",
                    )
                }
            };
            // JavaScript Set semantics: preserve first occurrence order.
            if !severities.contains(&severity) {
                severities.push(severity);
            }
        }
    } else {
        severities.extend([Severity::Error, Severity::Warning]);
    }
    Ok(Prepared { severities })
}

impl Prepared {
    fn expected(&self) -> Json {
        Json::object([(
            "severities",
            Json::Array(
                self.severities
                    .iter()
                    .map(|value| Json::string(severity_name(*value)))
                    .collect(),
            ),
        )])
    }

    pub(crate) fn normalized_payload(&self) -> Json {
        prepared::normalized_payload(Capability::ToHaveNoDiagnostics, self.expected())
    }

    pub(crate) fn demand(&self) -> AnalysisDemand {
        AnalysisDemand::default()
    }
}

fn severity_name(severity: Severity) -> &'static str {
    match severity {
        Severity::Error => "error",
        Severity::Warning => "warning",
        Severity::Info => "info",
    }
}

pub(crate) fn evaluate(prepared: &Prepared, context: &mut EvaluationContext<'_>) -> Evaluation {
    let subject = context.subject();
    let forbidden: Vec<_> = subject
        .diagnostics
        .iter()
        .filter(|item| prepared.severities.contains(&item.severity))
        .collect();
    let mut diagnostics = Vec::new();
    if !forbidden.is_empty() {
        let summary = forbidden
            .iter()
            .map(|item| format!("{} ({})", item.code, severity_name(item.severity)))
            .collect::<Vec<_>>()
            .join(", ");
        let mut diagnostic = Diagnostic::error(
            "GEOSPEC_DIAGNOSTICS_PRESENT",
            format!(
                "The subject carries {} forbidden diagnostic{}: {summary}.",
                forbidden.len(),
                if forbidden.len() == 1 { "" } else { "s" }
            ),
        );
        diagnostic.suggestion = Some("Fix the model source or its kernel/export path until these diagnostics are no longer emitted.".into());
        diagnostic.details = Some(Json::object([
            ("matcher", Json::string("toHaveNoDiagnostics")),
            (
                "severities",
                Json::Array(
                    prepared
                        .severities
                        .iter()
                        .map(|value| Json::string(severity_name(*value)))
                        .collect(),
                ),
            ),
            (
                "diagnostics",
                Json::Array(forbidden.iter().map(|item| item.to_json()).collect()),
            ),
        ]));
        diagnostics.push(diagnostic);
    }
    Evaluation::Geometric {
        positive_satisfied: forbidden.is_empty(),
        diagnostics,
        evidence: crate::result::family_evidence(
            &subject.content_hash,
            prepared.expected(),
            Json::object([
                (
                    "diagnosticCount",
                    Json::Number(subject.diagnostics.len() as f64),
                ),
                ("forbiddenCount", Json::Number(forbidden.len() as f64)),
            ]),
            Json::object([
                (
                    "severities",
                    Json::Array(
                        prepared
                            .severities
                            .iter()
                            .map(|value| Json::string(severity_name(*value)))
                            .collect(),
                    ),
                ),
                (
                    "diagnostics",
                    Json::Array(
                        subject
                            .diagnostics
                            .iter()
                            .map(Diagnostic::to_json)
                            .collect(),
                    ),
                ),
                (
                    "forbidden",
                    Json::Array(forbidden.iter().map(|value| value.to_json()).collect()),
                ),
            ]),
        ),
        negated_diagnostic: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn authored_severities_follow_source_set_order_and_defaults() {
        let defaults = prepare(
            Capability::ToHaveNoDiagnostics,
            &Json::object([("kind", Json::string("noDiagnostics"))]),
        )
        .unwrap();
        assert_eq!(defaults.severities, [Severity::Error, Severity::Warning]);
        let declared = prepare(
            Capability::ToHaveNoDiagnostics,
            &Json::object([
                ("kind", Json::string("noDiagnostics")),
                (
                    "expected",
                    Json::object([(
                        "severities",
                        Json::Array(vec![
                            Json::string("info"),
                            Json::string("warning"),
                            Json::string("info"),
                        ]),
                    )]),
                ),
            ]),
        )
        .unwrap();
        assert_eq!(declared.severities, [Severity::Info, Severity::Warning]);
    }
}
