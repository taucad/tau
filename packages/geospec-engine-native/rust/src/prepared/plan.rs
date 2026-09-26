//! Whole-plan preparation with separate syntax and selector barriers.
use crate::protocol::{Observations, WorkCounter};

use std::{
    collections::{HashMap, HashSet},
    rc::Rc,
};

use crate::{
    analysis::{batch::BatchAnalysis, selection::EcmaRegexError},
    ancillary::PreparedQuery,
    backend::{csg::CsgConnector, csg_scope::CsgScope, AnalysisRetentionLimits},
    budget::Budget,
    codec::Json,
    protocol::{
        array, as_invalid_claim, field, invalid_claim, logical_id, object, optional_field,
        require_fields, string_field, validate_budget,
    },
    registry::Capability,
    result::{self, Diagnostic, Evaluation, Polarity},
    subject::{subject_cache_key, Subject},
    ErrorKind, ProtocolError,
};

use super::{
    family::PreparedFamily, regexp::SelectorRegex, validate_query_polarity, AnalysisDemand,
};

enum Payload {
    Matcher(PreparedFamily),
    Query(PreparedQuery),
    RationalPlate,
    ParallelPlane,
}

impl Payload {
    fn normalized(&self) -> Json {
        match self {
            Self::Matcher(value) => value.normalized_payload(),
            Self::Query(value) => value.normalized_payload(),
            Self::RationalPlate => crate::certificates::engine::payload(),
            Self::ParallelPlane => crate::certificates::parallel_plane::payload(),
        }
    }
    fn demand(&self) -> AnalysisDemand {
        match self {
            Self::Matcher(value) => value.demand(),
            Self::Query(value) => value.demand(),
            Self::RationalPlate | Self::ParallelPlane => AnalysisDemand::default(),
        }
    }
}

struct Claim {
    id: String,
    capability: Capability,
    slot: String,
    key: String,
    polarity: Polarity,
    budget: u64,
    execution_budget: Budget,
    report_paid: bool,
    payload: Payload,
    refusal: Option<Evaluation>,
}

/// Produced without any access to a subject or connector.
pub(crate) struct PreparedPlan {
    subjects: Json,
    claims: Vec<Claim>,
    regex: SelectorRegex,
}

impl PreparedPlan {
    pub(crate) fn prepare(plan: &Json) -> Result<Self, ProtocolError> {
        Self::prepare_inner(plan).map_err(|error| {
            if error.kind == ErrorKind::InvalidRequest {
                as_invalid_claim(error)
            } else {
                error
            }
        })
    }

    fn prepare_inner(plan: &Json) -> Result<Self, ProtocolError> {
        let fields = object(plan, "plan")?;
        require_fields(
            fields,
            &["subjects", "claims"],
            &["subjects", "claims"],
            "plan",
        )?;
        let subjects = field(fields, "subjects")?;
        let mut bindings = HashMap::new();
        for value in array(subjects, "plan.subjects")? {
            let fields = object(value, "plan subject")?;
            require_fields(
                fields,
                &["slot", "contentHash", "subjectHash"],
                &["slot"],
                "plan subject",
            )?;
            let slot = logical_id(fields, "slot")?;
            let identity_field = match (
                optional_field(fields, "contentHash"),
                optional_field(fields, "subjectHash"),
            ) {
                (Some(_), None) => "contentHash",
                (None, Some(_)) => "subjectHash",
                _ => {
                    return invalid_claim(
                        "Plan subjects require exactly one of contentHash or subjectHash.",
                    )
                }
            };
            let hash = string_field(fields, identity_field)?;
            if hash.len() != 64
                || !hash
                    .bytes()
                    .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
            {
                return invalid_claim(format!(
                    "GeoSpec subject {identity_field} must be 64 lowercase hexadecimal characters."
                ));
            }
            let namespace = if identity_field == "contentHash" {
                "mesh-f32-bounds-v1"
            } else {
                "geospec-subject-v1"
            };
            if bindings
                .insert(slot, subject_cache_key(namespace, hash))
                .is_some()
            {
                return invalid_claim(format!(
                    "GeoSpec plan contains duplicate subject slot '{slot}'."
                ));
            }
        }
        let authored = array(field(fields, "claims")?, "plan.claims")?;
        if authored.len() > 4096 {
            return Err(ProtocolError::new(
                ErrorKind::LimitExceeded,
                "GeoSpec plan contains more than 4096 claims.",
            ));
        }
        let regex = SelectorRegex::default();
        let mut ids = HashSet::new();
        let mut claims = Vec::with_capacity(authored.len());
        for value in authored {
            let fields = object(value, "claim")?;
            require_fields(
                fields,
                &[
                    "claimId",
                    "capability",
                    "subjectSlots",
                    "payload",
                    "polarity",
                    "workUnitBudget",
                ],
                &[
                    "claimId",
                    "capability",
                    "subjectSlots",
                    "polarity",
                    "workUnitBudget",
                ],
                "claim",
            )?;
            let id = logical_id(fields, "claimId")?;
            if !ids.insert(id) {
                return invalid_claim(format!("GeoSpec plan contains duplicate claim ID '{id}'."));
            }
            let name = string_field(fields, "capability")?;
            let capability = Capability::from_name(name).ok_or_else(|| {
                ProtocolError::new(
                    ErrorKind::UnknownCapability,
                    format!("GeoSpec capability '{name}' is not in registry 4."),
                )
            })?;
            let slots = array(field(fields, "subjectSlots")?, "claim.subjectSlots")?;
            let [Json::String(slot)] = slots else {
                return invalid_claim(format!(
                    "{name} requires exactly one existing subject slot."
                ));
            };
            let key = bindings.get(slot.as_str()).ok_or_else(|| {
                ProtocolError::new(
                    ErrorKind::InvalidClaim,
                    format!("GeoSpec claim '{id}' references unresolved subject slot '{slot}'."),
                )
            })?;
            let polarity = match string_field(fields, "polarity")? {
                "positive" => Polarity::Positive,
                "negative" => Polarity::Negative,
                _ => {
                    return invalid_claim(
                        "GeoSpec claim polarity must be 'positive' or 'negative'.",
                    )
                }
            };
            validate_query_polarity(capability, polarity)?;
            let budget = field(fields, "workUnitBudget")?;
            validate_budget(budget)?;
            let Json::Number(budget) = budget else {
                unreachable!("validated numeric budget")
            };
            let supplied = optional_field(fields, "payload").unwrap_or(&Json::Null);
            let payload = if capability == Capability::ToSatisfyRationalPlate {
                crate::certificates::engine::prepare(supplied)?;
                Payload::RationalPlate
            } else if capability == Capability::ToSatisfyParallelPlaneDistance {
                crate::certificates::parallel_plane::prepare(supplied)?;
                Payload::ParallelPlane
            } else if capability.kind().is_some() {
                Payload::Matcher(PreparedFamily::prepare(capability, supplied)?)
            } else {
                Payload::Query(PreparedQuery::prepare(capability, supplied)?)
            };
            let regex_result = match &payload {
                Payload::Matcher(value) => value.validate_regexes(&regex),
                Payload::Query(value) => value.validate_regexes(&regex),
                Payload::RationalPlate | Payload::ParallelPlane => Ok(()),
            };
            let refusal = match regex_result {
                Ok(()) => None,
                Err(EcmaRegexError::InvalidSyntax(message)) => return invalid_claim(message),
                Err(EcmaRegexError::Unsupported(message)) => Some(Evaluation::Refused {
                    diagnostics: vec![Diagnostic::error("GEOSPEC_UNSUPPORTED_SELECTOR", message)],
                }),
            };
            claims.push(Claim {
                id: id.into(),
                capability,
                slot: slot.clone(),
                key: key.clone(),
                polarity,
                budget: *budget as u64,
                execution_budget: Budget::new(*budget as u64),
                report_paid: false,
                payload,
                refusal,
            });
        }
        Ok(Self {
            subjects: subjects.clone(),
            claims,
            regex,
        })
    }

    pub(crate) fn normalized_plan(&self) -> Json {
        Json::object([
            ("subjects", self.subjects.clone()),
            (
                "claims",
                Json::Array(
                    self.claims
                        .iter()
                        .map(|claim| {
                            Json::object([
                                ("claimId", Json::string(&claim.id)),
                                ("capability", Json::string(claim.capability.name())),
                                ("subjectSlots", Json::Array(vec![Json::string(&claim.slot)])),
                                ("payload", claim.payload.normalized()),
                                ("polarity", Json::string(claim.polarity.as_str())),
                                ("workUnitBudget", Json::Number(claim.budget as f64)),
                            ])
                        })
                        .collect(),
                ),
            ),
        ])
    }

    pub(crate) fn resolve(
        mut self,
        subjects: &HashMap<String, Rc<Subject>>,
        limits: AnalysisRetentionLimits,
    ) -> Result<ResolvedPlan, ProtocolError> {
        // F1 binds the complete normalized envelope, shared by every claim.
        // Existing plans avoid this allocation when no certificate needs it.
        let canonical_plan_hash = if self.claims.iter().any(|claim| {
            matches!(
                claim.payload,
                Payload::RationalPlate | Payload::ParallelPlane
            )
        }) {
            let bytes = crate::codec::encode(&crate::protocol::canonical_plan_envelope(
                self.normalized_plan(),
            ))?;
            crate::identity::sha256_hex(&bytes)
        } else {
            String::new()
        };
        // Bind every subject before reading even the first selector index.
        let retained = self
            .claims
            .iter()
            .map(|claim| {
                let subject = subjects.get(&claim.key).ok_or_else(|| {
                    ProtocolError::new(
                        ErrorKind::InvalidClaim,
                        format!(
                            "Subject for slot '{}' must first be ingested into this Engine.",
                            claim.slot
                        ),
                    )
                })?;
                if subject.cache_identity().map_err(|error| {
                    ProtocolError::new(ErrorKind::InvalidClaim, error.to_string())
                })? != claim.key
                {
                    return invalid_claim(
                        "Retained subject identity does not match the canonical plan binding.",
                    );
                }
                Ok(Rc::clone(subject))
            })
            .collect::<Result<Vec<_>, _>>()?;
        let batch = BatchAnalysis::new(
            self.claims.iter().filter_map(|claim| {
                claim
                    .payload
                    .demand()
                    .connected_components_tolerance_bits
                    .map(|bits| (claim.key.clone(), bits))
            }),
            limits,
        )?;
        for (claim, subject) in self.claims.iter_mut().zip(&retained) {
            if claim.refusal.is_some() {
                continue;
            }
            // C8: each claim phase is accounted alone, whatever earlier claims retained.
            subject.begin_demand_phase();
            let demand = claim.payload.demand();
            if subject.brep.is_some() && (demand.selectors || demand.csg) {
                if let Err(error) = claim.execution_budget.charge(1) {
                    claim.refusal = Some(Evaluation::budget_exceeded(claim.capability, error));
                    continue;
                }
                claim.report_paid = true;
            }
            let result = match &mut claim.payload {
                Payload::RationalPlate | Payload::ParallelPlane => Ok(()),
                Payload::Matcher(value) => {
                    value.resolve_selectors(subject, &self.regex, &claim.execution_budget)
                }
                Payload::Query(value) => {
                    value.resolve_selectors(subject, &self.regex, &claim.execution_budget)
                }
            };
            if claim.execution_budget.used() > claim.execution_budget.limit() {
                claim.refusal = Some(Evaluation::budget_exceeded(
                    claim.capability,
                    crate::budget::BudgetExceeded {
                        limit: claim.execution_budget.limit(),
                        used: claim.execution_budget.used(),
                    },
                ));
            } else if let Err(refusal) = result {
                claim.refusal = Some(refusal);
            }
        }
        Ok(ResolvedPlan {
            observations: None,
            canonical_plan_hash,
            claims: self.claims,
            retained,
            batch,
        })
    }
}

/// Construction requires both complete barriers; only this state can evaluate.
pub(crate) struct ResolvedPlan {
    observations: Option<Rc<Observations>>,
    canonical_plan_hash: String,
    claims: Vec<Claim>,
    retained: Vec<Rc<Subject>>,
    batch: BatchAnalysis,
}

impl ResolvedPlan {
    pub(crate) fn with_observations(mut self, observations: Rc<Observations>) -> Self {
        self.batch.observations = Some(Rc::clone(&observations));
        self.observations = Some(observations);
        self
    }

    pub(crate) fn evaluate(
        self,
        connector: Option<&mut dyn CsgConnector>,
    ) -> Result<Json, ProtocolError> {
        self.evaluate_inner(connector, None)
    }

    pub(crate) fn evaluate_with_retained(
        self,
        connector: Option<&mut dyn CsgConnector>,
        retained: &mut crate::backend::csg_scope::RetainedSolids,
    ) -> Result<Json, ProtocolError> {
        self.evaluate_inner(connector, Some(retained))
    }

    fn evaluate_inner(
        self,
        mut connector: Option<&mut dyn CsgConnector>,
        mut retained: Option<&mut crate::backend::csg_scope::RetainedSolids>,
    ) -> Result<Json, ProtocolError> {
        let mut results = Vec::with_capacity(self.claims.len());
        for (claim, subject) in self.claims.into_iter().zip(self.retained) {
            let budget = claim.execution_budget;
            let evaluation = if let Some(refusal) = claim.refusal {
                refusal
            } else {
                subject.begin_demand_phase();
                let payload = claim.payload.normalized();
                let subjects = [subject];
                let scope = if claim.payload.demand().csg {
                    connector.as_mut().map(|connector| {
                        match retained.as_deref_mut() {
                            Some(cache) => CsgScope::with_retained(&mut **connector, cache),
                            None => CsgScope::new(&mut **connector),
                        }
                        .with_budget(&budget)
                        .with_observations(self.observations.clone())
                    })
                } else {
                    None
                };
                let mut context = crate::subject::EvaluationContext::new(
                    &subjects,
                    claim.capability,
                    &claim.id,
                    &payload,
                    &budget,
                    scope,
                )
                .with_batch(&self.batch)
                .with_report_paid(claim.report_paid);
                let value = match claim.payload {
                    Payload::Matcher(value) => value.evaluate(&mut context),
                    Payload::Query(value) => value.evaluate(&mut context),
                    Payload::ParallelPlane => match context.subject().parallel_plane.as_ref() {
                        Some(proof) => {
                            proof.evaluate(context.subject(), &self.canonical_plan_hash, &budget)
                        }
                        None => {
                            crate::certificates::parallel_plane::outside_domain_request(&budget)
                        }
                    },
                    Payload::RationalPlate => match context.subject().rational_plate.as_ref() {
                        Some(plate) => plate.evaluate(
                            context
                                .subject()
                                .semantic_identity
                                .get()
                                .expect("admitted rational identity")
                                .hash(),
                            &self.canonical_plan_hash,
                            &budget,
                        ),
                        None => crate::certificates::engine::outside_domain(),
                    },
                };
                if budget.used() > budget.limit() {
                    Evaluation::budget_exceeded(
                        claim.capability,
                        crate::budget::BudgetExceeded {
                            limit: budget.limit(),
                            used: budget.used(),
                        },
                    )
                } else {
                    value
                }
            };
            if let Some(observations) = &self.observations {
                observations.add(WorkCounter::ChargedUnits, budget.used());
                observations.add(WorkCounter::Claims, 1);
            }
            results.push(result::finish(
                &claim.id,
                claim.capability,
                claim.polarity,
                evaluation,
            )?);
        }
        if let Some(observations) = &self.observations {
            observations.add(WorkCounter::Evaluations, 1);
        }
        Ok(Json::object([
            (
                "numericProfile",
                Json::string(crate::protocol::NUMERIC_PROFILE),
            ),
            ("results", Json::Array(results)),
        ]))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        analysis::mesh::decode_gltf,
        backend::resources::ResourceBundle,
        codec::{decode, encode},
        identity::{GltfFormat, MeshFrame, SubjectIdentity},
        subject::SubjectFormat,
    };
    use serde_json::{json, Value};

    fn plan_json(value: Value) -> Json {
        decode(&serde_json::to_vec(&value).unwrap()).unwrap()
    }

    fn claim(id: &str, capability: &str, polarity: &str, payload: Value) -> Value {
        json!({"claimId":id,"capability":capability,"subjectSlots":["part"],"polarity":polarity,"payload":payload,"workUnitBudget":10000})
    }

    #[test]
    fn should_reject_late_invalid_claim_before_subject_access_and_preserve_query_ruling() {
        let subject = json!({"slot":"part","subjectHash":"a".repeat(64)});
        let first = claim(
            "first",
            "toHaveSurfaceArea",
            "positive",
            json!({"kind":"surfaceArea","expected":{"value":4}}),
        );
        let invalid = claim(
            "late",
            "toHaveSurfaceArea",
            "positive",
            json!({"kind":"surfaceArea","expected":{"value":"wrong"}}),
        );
        let error = PreparedPlan::prepare(&plan_json(
            json!({"subjects":[subject.clone()],"claims":[first,invalid]}),
        ))
        .err()
        .unwrap();
        assert_eq!(error.code(), "invalid-claim");
        let negative = claim("query", "analyzeMesh", "negative", Value::Null);
        let error = PreparedPlan::prepare(&plan_json(
            json!({"subjects":[subject],"claims":[negative]}),
        ))
        .err()
        .unwrap();
        assert_eq!(error.code(), "invalid-claim");
        assert_eq!(
            error.to_string(),
            "Ancillary capability 'analyzeMesh' requires positive polarity."
        );
    }

    #[test]
    fn should_keep_resource_versions_and_scales_distinct_across_reconstructed_and_warm_plans() {
        let fixture: Value = serde_json::from_str(include_str!(
            "../../../conformance/subject-identity-instance-v2-controls.json"
        ))
        .unwrap();
        let rows = fixture["rows"].as_array().unwrap();
        // These analytic areas and descriptor hashes predate candidate comparison.
        for order in [[0, 2, 0, 2, 1, 3], [2, 0, 2, 0, 3, 1]] {
            let mut subjects = HashMap::new();
            for row in rows {
                let primary = fixture["primaryUtf8"].as_str().unwrap().as_bytes();
                let hex = row["resourceHex"].as_str().unwrap();
                let bytes = (0..hex.len())
                    .step_by(2)
                    .map(|i| u8::from_str_radix(&hex[i..i + 2], 16).unwrap())
                    .collect();
                let mut bundle = ResourceBundle::default();
                bundle.entries.insert("mesh.bin".into(), bytes);
                bundle.entries.insert("unused.bin".into(), vec![1, 2, 3]);
                let source_unit = if row["id"].as_str().unwrap().ends_with("scale10") {
                    "cm"
                } else {
                    "mm"
                };
                let frame = MeshFrame::new("z-up", source_unit, "mm").unwrap();
                let mesh = decode_gltf(primary, &bundle, frame.uniform_scale()).unwrap();
                let identity = SubjectIdentity::gltf(
                    primary,
                    &bundle,
                    &mesh.consumed_resources,
                    GltfFormat::Json,
                    frame,
                )
                .unwrap();
                assert_eq!(identity.hash(), row["subjectHash"].as_str().unwrap());
                let subject = Subject::new(
                    "9e6002828c855b60b8acab3fcb553f25a2a5f4c4dec50e90388de8aeb223cc60".into(),
                    SubjectFormat::Gltf,
                    "mm".into(),
                );
                subject.semantic_identity.set(identity).unwrap();
                subject.mesh_record.set(Rc::new(mesh.record)).unwrap();
                subjects.insert(subject.cache_identity().unwrap(), Rc::new(subject));
            }
            let mut prior_bytes = HashMap::new();
            for index in order {
                let row = &rows[index];
                let plan = plan_json(json!({
                    "subjects":[{"slot":"part","subjectHash":row["subjectHash"]}],
                    "claims":[claim("area", "toHaveSurfaceArea", "positive", json!({"kind":"surfaceArea","expected":{"value":row["expectedSurfaceArea"],"tolerance":0}}))],
                }));
                let prepared = PreparedPlan::prepare(&plan).unwrap();
                let normalized = encode(&prepared.normalized_plan()).unwrap();
                assert!(String::from_utf8(normalized)
                    .unwrap()
                    .contains(row["subjectHash"].as_str().unwrap()));
                // Fixture-local retention only; this does not set a production profile.
                let limits = AnalysisRetentionLimits {
                    max_mesh_bytes: 1024 * 1024,
                    max_mesh_entries: 8,
                    max_solid_entries: 0,
                };
                let actual = encode(
                    &prepared
                        .resolve(&subjects, limits)
                        .unwrap()
                        .evaluate(None)
                        .unwrap(),
                )
                .unwrap();
                let value: Value = serde_json::from_slice(&actual).unwrap();
                assert_eq!(value["results"][0]["status"], "passed");
                assert_eq!(
                    value["results"][0]["evidence"]["measured"],
                    row["expectedSurfaceArea"]
                );
                if let Some(previous) = prior_bytes.insert(index, actual.clone()) {
                    assert_eq!(previous, actual);
                }
            }
        }
    }
}
