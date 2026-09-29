//! Complete AP242 whole-occurrence minimum. Its first OCCT solution is the
//! versioned witness profile; no threshold/proximity fact can inhabit it.

use crate::{
    budget::{Budget, BudgetExceeded},
    codec::Json,
    protocol::{array, field, invalid_claim, object, require_fields, string_field},
    registry::Capability,
    result::{Diagnostic, Evaluation},
    subject::{backend_refusal, EvaluationContext, Subject, SubjectFormat},
    ProtocolError,
};

pub(crate) struct PreparedMinimumDistance {
    pair: [String; 2],
    ordinals: Option<[u32; 2]>,
    selector_units: u64,
}

impl PreparedMinimumDistance {
    pub(crate) fn prepare(payload: &Json) -> Result<Self, ProtocolError> {
        let fields = object(payload, "minimumDistance payload")?;
        require_fields(fields, &["pair"], &["pair"], "minimumDistance payload")?;
        let pair = array(field(fields, "pair")?, "minimumDistance pair")?;
        if pair.len() != 2 {
            return invalid_claim("minimumDistance needs exactly two occurrence paths.");
        }
        let path = |value: &Json| -> Result<String, ProtocolError> {
            let fields = object(value, "minimumDistance occurrence")?;
            require_fields(
                fields,
                &["occurrencePath"],
                &["occurrencePath"],
                "minimumDistance occurrence",
            )?;
            let path = string_field(fields, "occurrencePath")?;
            if path.is_empty() {
                return invalid_claim("minimumDistance occurrence paths must be non-empty.");
            }
            Ok(path.into())
        };
        let paths = [path(&pair[0])?, path(&pair[1])?];
        if paths[0] == paths[1] {
            return invalid_claim("minimumDistance needs two distinct occurrence paths.");
        }
        Ok(Self {
            pair: paths,
            ordinals: None,
            selector_units: 0,
        })
    }

    pub(crate) fn normalized_payload(&self) -> Json {
        Json::object([(
            "pair",
            Json::Array(
                self.pair
                    .iter()
                    .map(|path| Json::object([("occurrencePath", Json::string(path))]))
                    .collect(),
            ),
        )])
    }

    pub(crate) fn resolve(&mut self, subject: &Subject, budget: &Budget) -> Result<(), Evaluation> {
        if subject.format != SubjectFormat::Step {
            return Err(refusal(
                "GEOSPEC_UNSUPPORTED_EVIDENCE",
                "minimumDistance requires an admitted AP242 BRep subject.",
            ));
        }
        let Some(facts) = subject.step_admission_facts.as_ref() else {
            return Err(refusal(
                "GEOSPEC_UNSUPPORTED_EVIDENCE",
                "minimumDistance requires parsed STEP admission facts.",
            ));
        };
        if !facts.all_source_length_contexts_mm {
            return Err(refusal(
                "GEOSPEC_UNSUPPORTED_EVIDENCE",
                "minimumDistance requires all parsed STEP length contexts in millimetres.",
            ));
        }
        // The admitted count bounds this source-structure transfer before the
        // transfer starts, including a setup unit for an empty subject.
        self.selector_units = (facts.occurrence_count as u64).saturating_add(1);
        budget
            .charge(self.selector_units)
            .map_err(|error| Evaluation::budget_exceeded(Capability::MinimumDistance, error))?;
        let metadata = subject.step_subject_metadata().map_err(backend_refusal)?;
        if !metadata
            .and_then(|value| value.schema.as_deref())
            .is_some_and(|schema| schema.to_ascii_uppercase().contains("AP242"))
        {
            return Err(refusal(
                "GEOSPEC_UNSUPPORTED_EVIDENCE",
                "minimumDistance requires AP242 source provenance.",
            ));
        }
        let Some(rows) = subject
            .source_occurrence_structure()
            .map_err(backend_refusal)?
        else {
            return Err(refusal(
                "GEOSPEC_UNSUPPORTED_EVIDENCE",
                "AP242 occurrence structure is unavailable.",
            ));
        };
        if rows.len() != facts.occurrence_count {
            return Err(refusal(
                "GEOSPEC_UNSUPPORTED_EVIDENCE",
                "AP242 occurrence metadata changed after admission.",
            ));
        }
        let resolve = |path: &str| {
            let mut matching = rows.iter().enumerate().filter(|(_, row)| row.path == path);
            let first = matching.next()?.0;
            matching.next().is_none().then_some(first as u32)
        };
        let (Some(a), Some(b)) = (resolve(&self.pair[0]), resolve(&self.pair[1])) else {
            return Err(refusal(
                "GEOSPEC_INVALID_SELECTION",
                "Select two distinct resolved AP242 occurrence paths.",
            ));
        };
        if a == b {
            return Err(refusal(
                "GEOSPEC_INVALID_SELECTION",
                "Select two distinct AP242 occurrences.",
            ));
        }
        self.ordinals = Some([a, b]);
        Ok(())
    }

    pub(crate) fn evaluate(&self, context: &mut EvaluationContext<'_>) -> Evaluation {
        let subject = context.subject();
        let Some([a, b]) = self.ordinals else {
            return refusal(
                "GEOSPEC_INVALID_SELECTION",
                "AP242 occurrence paths were not resolved.",
            );
        };
        let Some(brep) = subject.brep.as_deref() else {
            return refusal(
                "GEOSPEC_UNSUPPORTED_EVIDENCE",
                "AP242 BRep evidence is unavailable.",
            );
        };
        let mut extrema_trace = Vec::with_capacity(2);
        let mut charge = |units| {
            extrema_trace.push(units);
            context.budget().charge(units).is_ok()
        };
        let result = match brep.occurrence_minimum_distance(a, b, &mut charge) {
            Ok(Some(value)) => value,
            Ok(None) => {
                return Evaluation::budget_exceeded(
                    Capability::MinimumDistance,
                    BudgetExceeded {
                        limit: context.budget().limit(),
                        used: context.budget().used(),
                    },
                )
            }
            Err(error) => return backend_refusal(error),
        };
        let point = |[x, y, z]: [f64; 3]| -> Json {
            let canonical = if subject.step_source_frame == "y-up" {
                [x, -z, y]
            } else {
                [x, y, z]
            };
            Json::Array(canonical.into_iter().map(Json::Number).collect())
        };
        let hash = match subject.semantic_identity.get() {
            Some(identity) => identity.hash(),
            None => {
                return refusal(
                    "GEOSPEC_UNSUPPORTED_EVIDENCE",
                    "AP242 subject identity is unavailable.",
                )
            }
        };
        Evaluation::Ancillary {
            success: true,
            value: Json::object([
                ("profile", Json::string("geospec-minimum-distance-v1")),
                ("sourceFrame", Json::string(&subject.step_source_frame)),
                (
                    "fact",
                    Json::object([
                        ("source", Json::string("ap242")),
                        ("assurance", Json::string("exact-brep")),
                        ("unit", Json::string("mm")),
                        ("coordinateSystem", Json::string("z-up")),
                        ("subjectHash", Json::string(hash)),
                        (
                            "algorithmProfile",
                            Json::string("geospec-minimum-distance-v1"),
                        ),
                        (
                            "occurrences",
                            Json::Array(self.pair.iter().map(|path| Json::string(path)).collect()),
                        ),
                        ("distance", Json::Number(result.distance)),
                        (
                            "points",
                            Json::Array(vec![point(result.point_a), point(result.point_b)]),
                        ),
                    ]),
                ),
                (
                    "workTrace",
                    Json::Array(
                        std::iter::once(self.selector_units)
                            .chain(extrema_trace)
                            .map(|units| Json::Number(units as f64))
                            .collect(),
                    ),
                ),
            ]),
            diagnostics: Vec::new(),
        }
    }
}

fn refusal(code: &str, message: &str) -> Evaluation {
    Evaluation::Refused {
        diagnostics: vec![Diagnostic::error(code, message)],
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        backend::brep::{BrepAdmissionFacts, BrepIdentityProfile},
        identity::SubjectIdentity,
    };

    #[test]
    fn source_frame_is_bound_without_changing_z_up_identity() {
        let profile = BrepIdentityProfile {
            ingest_profile: "ingest",
            backend_profile: "backend",
        };
        let old = SubjectIdentity::step(b"AP242", "mm", 1.0, profile, None).unwrap();
        let z = SubjectIdentity::step_prehashed(
            crate::identity::sha256_hex(b"AP242"),
            5,
            "mm",
            1.0,
            profile,
            None,
            "z-up",
        )
        .unwrap();
        let y = SubjectIdentity::step_prehashed(
            crate::identity::sha256_hex(b"AP242"),
            5,
            "mm",
            1.0,
            profile,
            None,
            "y-up",
        )
        .unwrap();
        assert_eq!(old.hash(), z.hash());
        assert_ne!(z.hash(), y.hash());
        assert!(
            String::from_utf8(crate::codec::encode(y.descriptor()).unwrap())
                .unwrap()
                .contains("\"outputCoordinateSystem\":\"z-up\"")
        );
    }

    #[test]
    fn y_up_subject_refuses_other_capabilities_before_evidence() {
        let mut subject = Subject::new("0".repeat(64), SubjectFormat::Step, "mm".into());
        subject.step_source_frame = "y-up".into();
        assert!(matches!(
            subject.tessellated_only_refusal(Capability::AnalyzeBrep),
            Some(Evaluation::Refused { .. })
        ));
        assert!(subject
            .tessellated_only_refusal(Capability::MinimumDistance)
            .is_none());
    }

    #[test]
    fn minimum_payload_requires_two_distinct_paths() {
        for payload in [
            r#"{"pair":[{"occurrencePath":"A"}]}"#,
            r#"{"pair":[{"occurrencePath":"A"},{"occurrencePath":"A"}]}"#,
            r#"{"pair":[{"occurrencePath":"A"},{"occurrencePath":""}]}"#,
        ] {
            assert!(PreparedMinimumDistance::prepare(
                &crate::codec::decode(payload.as_bytes()).unwrap()
            )
            .is_err());
        }
    }

    #[test]
    fn mixed_unit_contexts_refuse_before_selection_or_geometry() {
        let mut subject = Subject::new("0".repeat(64), SubjectFormat::Step, "mm".into());
        subject.step_admission_facts = Some(BrepAdmissionFacts {
            source_length_unit: "MM".into(),
            source_unit_to_millimeters: 1.0,
            occurrence_count: 2,
            surfaceless_faces: 0,
            all_source_length_contexts_mm: false,
        });
        let payload =
            crate::codec::decode(br#"{"pair":[{"occurrencePath":"A"},{"occurrencePath":"B"}]}"#)
                .unwrap();
        let mut query = PreparedMinimumDistance::prepare(&payload).unwrap();
        let budget = Budget::new(100);
        assert!(matches!(
            query.resolve(&subject, &budget),
            Err(Evaluation::Refused { .. })
        ));
        assert_eq!(budget.used(), 0);
    }

    #[test]
    fn source_structure_is_precharged_from_admitted_count() {
        let mut subject = Subject::new("0".repeat(64), SubjectFormat::Step, "mm".into());
        subject.step_admission_facts = Some(BrepAdmissionFacts {
            source_length_unit: "MM".into(),
            source_unit_to_millimeters: 1.0,
            occurrence_count: 2,
            surfaceless_faces: 0,
            all_source_length_contexts_mm: true,
        });
        let payload =
            crate::codec::decode(br#"{"pair":[{"occurrencePath":"A"},{"occurrencePath":"B"}]}"#)
                .unwrap();
        let mut query = PreparedMinimumDistance::prepare(&payload).unwrap();
        let budget = Budget::new(2);
        assert!(matches!(
            query.resolve(&subject, &budget),
            Err(Evaluation::Refused { .. })
        ));
        assert_eq!(budget.used(), 3);
    }
}
