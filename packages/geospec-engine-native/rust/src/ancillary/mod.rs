//! Engine-owned observation operations; positive-only query polarity.

pub(crate) mod inspection;
mod minimum_distance;
pub(crate) mod pmi;

use crate::{
    analysis::selection::{EcmaRegexEngine, EcmaRegexError},
    codec::Json,
    matchers::{brep, mesh},
    prepared::{family::PreparedFamily, AnalysisDemand},
    protocol::{invalid_claim, object, require_fields},
    registry::Capability,
    result::Evaluation,
    subject::{backend_refusal, EvaluationContext, Subject},
    ProtocolError,
};
use inspection::PreparedInspection;

// Preserve inline prepared payloads; boxing adds a per-query allocation and
// changes retained-request layout solely to equalize variant sizes.
#[allow(clippy::large_enum_variant)]
pub(crate) enum PreparedQuery {
    Mesh,
    Brep,
    Pmi(pmi::PreparedPmi),
    Inspection(PreparedInspection),
    Overlap(PreparedFamily),
    MinimumDistance(minimum_distance::PreparedMinimumDistance),
}

impl PreparedQuery {
    pub(crate) fn prepare(capability: Capability, payload: &Json) -> Result<Self, ProtocolError> {
        match capability {
            Capability::MinimumDistance => {
                minimum_distance::PreparedMinimumDistance::prepare(payload)
                    .map(Self::MinimumDistance)
            }
            Capability::QueryPmi => pmi::PreparedPmi::prepare(payload).map(Self::Pmi),
            Capability::AnalyzeMesh | Capability::AnalyzeBrep => {
                if *payload != Json::Null {
                    return invalid_claim(format!(
                        "{} payload must be null or omitted.",
                        capability.name()
                    ));
                }
                Ok(if capability == Capability::AnalyzeMesh {
                    Self::Mesh
                } else {
                    Self::Brep
                })
            }
            Capability::InspectGeometry => {
                PreparedInspection::prepare(payload).map(Self::Inspection)
            }
            Capability::AnalyzeMeshOverlap => {
                let fields = object(payload, "analyzeMeshOverlap payload")?;
                require_fields(
                    fields,
                    &["tolerance", "pairs"],
                    &[],
                    "analyzeMeshOverlap payload",
                )?;
                let capability = Capability::ToHaveNoComponentInterference;
                let lowered = Json::object([
                    (
                        "kind",
                        Json::string(capability.kind().expect("matcher has a kind")),
                    ),
                    ("expected", payload.clone()),
                ]);
                PreparedFamily::prepare(capability, &lowered).map(Self::Overlap)
            }
            _ => invalid_claim("Query preparation requires an ancillary capability."),
        }
    }

    pub(crate) fn normalized_payload(&self) -> Json {
        match self {
            Self::Pmi(value) => value.normalized_payload(),
            Self::Mesh | Self::Brep => Json::Null,
            Self::Inspection(value) => value.normalized_payload(),
            Self::Overlap(value) => {
                let Json::Object(fields) = value.normalized_payload() else {
                    unreachable!("typed matcher payload is an object")
                };
                fields
                    .into_iter()
                    .find_map(|(key, value)| (key == "expected").then_some(value))
                    .expect("typed matcher payload has expected")
            }
            Self::MinimumDistance(value) => value.normalized_payload(),
        }
    }

    pub(crate) fn demand(&self) -> AnalysisDemand {
        match self {
            Self::Pmi(_) | Self::Mesh | Self::Brep => AnalysisDemand::default(),
            Self::Inspection(_) => AnalysisDemand {
                selectors: true,
                ..AnalysisDemand::default()
            },
            Self::Overlap(value) => value.demand(),
            Self::MinimumDistance(_) => AnalysisDemand::default(),
        }
    }

    pub(crate) fn validate_regexes(
        &self,
        regex: &dyn EcmaRegexEngine,
    ) -> Result<(), EcmaRegexError> {
        match self {
            Self::Inspection(value) => value.validate_regexes(regex),
            Self::Overlap(value) => value.validate_regexes(regex),
            Self::Mesh | Self::Brep | Self::Pmi(_) | Self::MinimumDistance(_) => Ok(()),
        }
    }

    pub(crate) fn resolve_selectors(
        &mut self,
        subject: &Subject,
        regex: &dyn EcmaRegexEngine,
        budget: &crate::budget::Budget,
    ) -> Result<(), Evaluation> {
        match self {
            Self::MinimumDistance(value) => value.resolve(subject, budget),
            Self::Inspection(value) => {
                let index = subject.selector_index(budget).map_err(backend_refusal)?;
                value.resolve(index.as_deref(), regex, subject.brep.as_deref(), budget);
                Ok(())
            }
            Self::Overlap(PreparedFamily::Proofs(value)) => {
                let labels = crate::analysis::interference::component_labels(subject)
                    .map_err(backend_refusal)?;
                value
                    .resolve_component_patterns(&labels, regex)
                    .map_err(crate::prepared::family::regex_refusal)?;
                match value.required_pair_refusal(Capability::ToHaveNoComponentInterference) {
                    Some(refusal) => Err(refusal),
                    None => Ok(()),
                }
            }
            Self::Overlap(_) => unreachable!("overlap query uses proof preparation"),
            Self::Mesh | Self::Brep | Self::Pmi(_) => Ok(()),
        }
    }

    pub(crate) fn evaluate(&self, context: &mut EvaluationContext<'_>) -> Evaluation {
        match self {
            Self::MinimumDistance(value) => value.evaluate(context),
            Self::Pmi(value) => value.evaluate(context),
            Self::Mesh => mesh::analyze_mesh(context),
            Self::Brep => brep::evaluate_brep(context),
            Self::Inspection(value) => value.evaluate(),
            Self::Overlap(PreparedFamily::Proofs(value)) => value.evaluate_as_overlap(context),
            Self::Overlap(_) => unreachable!("overlap query uses the typed overlap preparation"),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        analysis::mesh::{MeshAnalysisRecord, Primitive},
        budget::Budget,
        prepared::regexp::SelectorRegex,
        result::{finish, Polarity},
        subject::SubjectFormat,
    };
    use std::rc::Rc;

    #[test]
    fn overlap_query_preserves_required_pair_diagnostic_context() {
        // Ordinary named admission facts suffice for phase-two selection. No
        // geometry predicate or backend call occurs for the unmatched pair.
        let subject = Subject::new("0".repeat(64), SubjectFormat::MeshBufferV1, "mm".into());
        subject
            .mesh_record
            .set(Rc::new(MeshAnalysisRecord {
                positions: vec![[0.0, 0.0, 0.0], [1.0, 0.0, 0.0], [0.0, 1.0, 0.0]],
                triangles: vec![[0, 1, 2], [0, 1, 2]],
                triangle_primitives: vec![0, 1],
                primitives: ["A", "B"]
                    .into_iter()
                    .map(|name| Primitive {
                        name: name.into(),
                        vertex_start: 0,
                        vertex_count: 3,
                    })
                    .collect(),
            }))
            .unwrap();
        let payload =
            crate::codec::decode(br#"{"pairs":[{"left":"A","right":"absent"}]}"#).unwrap();
        let mut query = PreparedQuery::prepare(Capability::AnalyzeMeshOverlap, &payload).unwrap();
        let refusal = match query.resolve_selectors(
            &subject,
            &SelectorRegex::default(),
            &Budget::new(1000),
        ) {
            Err(refusal) => refusal,
            Ok(()) => panic!("a required unmatched pair must refuse before computation"),
        };
        let result = finish(
            "required-pair",
            Capability::AnalyzeMeshOverlap,
            Polarity::Positive,
            refusal,
        )
        .unwrap();
        // REQUIRED-PAIR-01 source-family diagnostic, reused by the query.
        let expected = br#"{"claimId":"required-pair","diagnostics":[{"code":"GEOSPEC_SELECTOR_UNMATCHED","details":{"matcher":"toHaveNoComponentInterference","pair":{"left":"A","right":"absent"},"pairIndex":0},"message":"Requested component pair at index 0 did not match two distinct components.","severity":"error"}],"status":"refused"}"#;
        assert_eq!(
            String::from_utf8(crate::codec::encode(&result).unwrap()).unwrap(),
            std::str::from_utf8(expected).unwrap()
        );
    }
}
