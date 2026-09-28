//! Positive-only source inventory on the existing ancillary operation path.

use crate::{
    analysis::parallel_plane_distance::inventory,
    backend::pmi::{PmiField, PmiFieldStatus},
    codec::Json,
    protocol::{invalid_claim, object, require_fields},
    registry::Capability,
    result::{Diagnostic, Evaluation},
    subject::{backend_refusal, EvaluationContext},
    ProtocolError,
};

pub(crate) struct PreparedPmi {
    max_records: usize,
    max_output_bytes: usize,
}

fn refusal(code: &str, message: impl Into<String>) -> Evaluation {
    Evaluation::Refused {
        diagnostics: vec![Diagnostic::error(code, message)],
    }
}

fn extraction_refusal(error: crate::analysis::parallel_plane_distance::F2Error) -> Evaluation {
    refusal(
        if error.code() == "resource-limit" {
            "GEOSPEC_RESOURCE_LIMIT"
        } else {
            "GEOSPEC_PMI_EXTRACTION_FAILED"
        },
        format!("{}: {error}", error.code()),
    )
}

impl PreparedPmi {
    pub(crate) fn prepare(payload: &Json) -> Result<Self, ProtocolError> {
        let mut result = Self {
            max_records: 1024,
            max_output_bytes: 1_048_576,
        };
        if *payload == Json::Null {
            return Ok(result);
        }
        let fields = object(payload, "queryPmi payload")?;
        require_fields(
            fields,
            &["maxRecords", "maxOutputBytes"],
            &[],
            "queryPmi payload",
        )?;
        for (key, value) in fields {
            let Json::Number(number) = value else {
                return invalid_claim("queryPmi limits must be positive integers.");
            };
            let maximum = if key == "maxRecords" { 1024 } else { 1_048_576 };
            if !number.is_finite()
                || *number < 1.0
                || number.fract() != 0.0
                || *number > maximum as f64
            {
                return invalid_claim("queryPmi limits exceed supported positive integer bounds.");
            }
            if key == "maxRecords" {
                result.max_records = *number as usize;
            } else {
                result.max_output_bytes = *number as usize;
            }
        }
        Ok(result)
    }

    pub(crate) fn normalized_payload(&self) -> Json {
        Json::object([
            ("maxRecords", Json::Number(self.max_records as f64)),
            ("maxOutputBytes", Json::Number(self.max_output_bytes as f64)),
        ])
    }

    pub(crate) fn evaluate(&self, context: &mut EvaluationContext<'_>) -> Evaluation {
        let subject = context.subject();
        let source = subject.pmi_source_bytes();
        // Source bytes are immutable admission storage. Charge before parsing,
        // querying the retained transfer or checking any retention cell.
        if let Err(error) = context
            .budget()
            .charge(1 + source.map_or(0, |bytes| bytes.len() as u64))
        {
            return Evaluation::budget_exceeded(Capability::QueryPmi, error);
        }
        let Some(source) = source else {
            return refusal(
                "GEOSPEC_EVIDENCE_UNSUPPORTED",
                "queryPmi requires retained STEP source within the8MiB source limit.",
            );
        };
        let Some(backend) = subject.brep.as_deref() else {
            return refusal(
                "GEOSPEC_EVIDENCE_UNSUPPORTED",
                "queryPmi requires a retained STEP transfer.",
            );
        };
        // Requested-payload reservation, not an allocator/RSS security bound:
        // lexer nodes/reverse edges + retained records + serde/encoding copy +
        // bounded adapter association transfer. No persistent inventory cache.
        let Some(reservation) = source
            .len()
            .checked_mul(128)
            .and_then(|bytes| bytes.checked_add(self.max_output_bytes * 3 + 32 * 1_048_576))
        else {
            return refusal(
                "GEOSPEC_RESOURCE_LIMIT",
                "PMI inventory reservation overflow.",
            );
        };
        if let Err(error) = subject.check_f2_pending(reservation as u64) {
            return backend_refusal(error);
        }
        let mut inventory = match inventory::parse_with_output_limit(
            source,
            self.max_records,
            self.max_output_bytes,
        ) {
            Ok(value) => value,
            Err(error) => return extraction_refusal(error),
        };
        let mut association_bytes = 0usize;
        for record in &mut inventory.records {
            for reference in record.first.iter_mut().chain(&mut record.second) {
                if matches!(
                    reference.requested_route.status,
                    PmiFieldStatus::Invalid | PmiFieldStatus::Ambiguous
                ) {
                    reference.associations = PmiField::unavailable(
                        reference.requested_route.status,
                        "Source occurrence route is not uniquely valid.",
                    );
                    continue;
                }
                let mut associations = Vec::new();
                let mut unavailable = match reference.associations.status {
                    PmiFieldStatus::Invalid
                    | PmiFieldStatus::Ambiguous
                    | PmiFieldStatus::Unsupported => Some((
                        reference.associations.status,
                        reference.associations.reason.clone().unwrap_or_default(),
                    )),
                    _ => None,
                };
                for source_id in &reference.source_item_ids {
                    if let Err(error) = context.budget().charge(1) {
                        return Evaluation::budget_exceeded(Capability::QueryPmi, error);
                    }
                    let result = match backend.pmi_source_faces(*source_id) {
                        Ok(value) => value,
                        Err(error) => return backend_refusal(error),
                    };
                    if result.status != PmiFieldStatus::Supported && unavailable.is_none() {
                        unavailable =
                            Some((result.status, result.reason.clone().unwrap_or_default()));
                    }
                    if let Some(values) = result.value {
                        // The bridge returns at most4096 bounded routes per call.
                        // Cap aggregate caller retention before appending a group;
                        // repeated source references cannot multiply it unboundedly.
                        let bytes = match serde_json::to_vec(&values) {
                            Ok(value) => value.len(),
                            Err(error) => {
                                return refusal("GEOSPEC_PMI_EXTRACTION_FAILED", error.to_string())
                            }
                        };
                        let Some(total) = association_bytes.checked_add(bytes) else {
                            return refusal(
                                "GEOSPEC_RESOURCE_LIMIT",
                                "PMI association accounting overflow.",
                            );
                        };
                        if total > self.max_output_bytes {
                            return refusal(
                                "GEOSPEC_RESOURCE_LIMIT",
                                "PMI association content exceeds maxOutputBytes.",
                            );
                        }
                        association_bytes = total;
                        associations.extend(values.into_iter().filter(|value| {
                            reference
                                .requested_route
                                .value
                                .as_ref()
                                .is_none_or(|route| *route == value.occurrence_route)
                        }));
                    }
                }
                reference.associations = if let Some((status, reason)) = unavailable {
                    // Partial qualified identities remain visible alongside the
                    // explicit incomplete binding status.
                    PmiField {
                        status,
                        value: Some(associations),
                        reason: Some(reason),
                    }
                } else if associations.is_empty() {
                    PmiField::unavailable(
                        PmiFieldStatus::Missing,
                        "No matching forward-transferred source face.",
                    )
                } else {
                    PmiField::supported(associations)
                };
            }
        }
        let bytes = match serde_json::to_vec(&inventory) {
            Ok(value) => value,
            Err(error) => return refusal("GEOSPEC_PMI_EXTRACTION_FAILED", error.to_string()),
        };
        let value = match crate::codec::decode(&bytes) {
            Ok(value) => value,
            Err(error) => return refusal("GEOSPEC_PMI_EXTRACTION_FAILED", error.to_string()),
        };
        let Some(identity) = subject.semantic_identity.get() else {
            return refusal(
                "GEOSPEC_PMI_EXTRACTION_FAILED",
                "Inventory subject has no verified source/profile identity.",
            );
        };
        let provenance = identity.descriptor().clone();
        let value = Json::object([
            ("inventory", value),
            ("subjectHash", Json::string(identity.hash())),
            ("provenance", provenance),
        ]);
        let encoded = match crate::codec::encode(&value) {
            Ok(value) => value,
            Err(error) => return refusal("GEOSPEC_PMI_EXTRACTION_FAILED", error.to_string()),
        };
        if encoded.len() > self.max_output_bytes {
            return refusal(
                "GEOSPEC_RESOURCE_LIMIT",
                "PMI inventory exceeds maxOutputBytes; no truncated inventory is returned.",
            );
        }
        Evaluation::Ancillary {
            success: true,
            value,
            diagnostics: Vec::new(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pmi_inventory_parser_resource_error_maps_to_query_refusal() {
        let items = (20..29)
            .map(|id| format!("#{id}"))
            .collect::<Vec<_>>()
            .join(",");
        let values = (20..29)
            .map(|id| format!("#{id}=LENGTH_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.),#40);"))
            .collect::<String>();
        let source = format!("ISO-10303-21;HEADER;FILE_SCHEMA(('AP242'));ENDSEC;DATA;#1=DIMENSIONAL_LOCATION('d','',$,$);#2=DIMENSIONAL_CHARACTERISTIC_REPRESENTATION(#1,#3);#3=SHAPE_DIMENSION_REPRESENTATION('',({items}),#99);{values}#40=(LENGTH_UNIT()NAMED_UNIT(*)SI_UNIT(.MILLI.,.METRE.));ENDSEC;END-ISO-10303-21;");
        let error = inventory::parse(source.as_bytes(), 1024).unwrap_err();
        let Evaluation::Refused { diagnostics } = extraction_refusal(error) else {
            panic!("A hard parser limit must not return partial ancillary success");
        };
        assert_eq!(diagnostics.len(), 1);
        assert_eq!(diagnostics[0].code, "GEOSPEC_RESOURCE_LIMIT");
        assert_eq!(diagnostics[0].severity, crate::result::Severity::Error);
    }
}
