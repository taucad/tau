//! Source inspection projection; selectors are resolved at the batch barrier.

use crate::{
    analysis::selection::{
        resolve_budgeted_with_brep, EcmaRegexEngine, EcmaRegexError, Entity, Selection, Selector,
        SelectorIndex,
    },
    backend::brep::{Bounds, BrepSubject},
    codec::Json,
    protocol::{array, field, invalid_claim, object, optional_field, require_fields},
    result::{Diagnostic, Evaluation, Severity},
    ProtocolError,
};

pub(crate) struct PreparedInspection {
    normalized: Json,
    authored: Vec<Json>,
    selectors: Vec<Selector>,
    resolved: Option<Option<Vec<Selection>>>,
}

impl PreparedInspection {
    pub(crate) fn prepare(payload: &Json) -> Result<Self, ProtocolError> {
        let fields = object(payload, "inspectGeometry payload")?;
        require_fields(
            fields,
            &["selectors", "evidence"],
            &["selectors"],
            "inspectGeometry payload",
        )?;
        let authored = array(field(fields, "selectors")?, "inspectGeometry selectors")?.to_vec();
        let selectors = authored
            .iter()
            .map(Selector::parse)
            .collect::<Result<_, _>>()?;
        if let Some(evidence) = optional_field(fields, "evidence") {
            for value in array(evidence, "inspectGeometry evidence")? {
                if !matches!(value, Json::String(value) if matches!(value.as_str(), "bounds" | "facts" | "frames"))
                {
                    return invalid_claim(
                        "inspectGeometry evidence must contain bounds, facts, or frames.",
                    );
                }
            }
        }
        // The source accepts these evidence hints without suppressing measured fields.
        Ok(Self {
            normalized: payload.clone(),
            authored,
            selectors,
            resolved: None,
        })
    }

    pub(crate) fn normalized_payload(&self) -> Json {
        self.normalized.clone()
    }

    pub(crate) fn validate_regexes(
        &self,
        regex: &dyn EcmaRegexEngine,
    ) -> Result<(), EcmaRegexError> {
        for selector in &self.selectors {
            selector.validate_regexes(regex)?;
        }
        Ok(())
    }

    pub(crate) fn resolve(
        &mut self,
        index: Option<&SelectorIndex>,
        regex: &dyn EcmaRegexEngine,
        brep: Option<&dyn BrepSubject>,
        budget: &crate::budget::Budget,
    ) {
        self.resolved = Some(index.map(|index| {
            self.selectors
                .iter()
                .map(|selector| {
                    resolve_budgeted_with_brep(selector, index, regex, brep, Some(budget))
                })
                .collect()
        }));
    }

    pub(crate) fn evaluate(&self) -> Evaluation {
        let Some(resolved) = &self.resolved else {
            return Evaluation::Refused {
                diagnostics: vec![Diagnostic::error(
                    "GEOSPEC_PREPARATION_INCOMPLETE",
                    "Inspection requires complete-batch selector preparation.",
                )],
            };
        };
        let mut diagnostics = Vec::new();
        let selections = if let Some(resolved) = resolved {
            self.authored
                .iter()
                .zip(resolved)
                .map(|(authored, selection)| {
                    diagnostics.extend(selection.diagnostics.iter().cloned());
                    Json::object([
                        ("selector", authored.clone()),
                        (
                            "matches",
                            Json::Array(
                                selection
                                    .entities
                                    .iter()
                                    .filter_map(inspection_entity)
                                    .collect(),
                            ),
                        ),
                    ])
                })
                .collect()
        } else {
            let mut diagnostic = Diagnostic::error(
                "GEOSPEC_EVIDENCE_UNSUPPORTED",
                "inspectGeometry() needs an AP242 selector index, which this subject does not carry: only STEP-loaded subjects can be inspected by selector.",
            );
            diagnostic.suggestion =
                Some("Load the model as STEP so GeoSpec builds the selector index.".into());
            diagnostic.details = Some(Json::object([(
                "selectors",
                Json::Array(self.authored.clone()),
            )]));
            diagnostics.push(diagnostic);
            self.authored
                .iter()
                .map(|selector| {
                    Json::object([
                        ("selector", selector.clone()),
                        ("matches", Json::Array(Vec::new())),
                    ])
                })
                .collect()
        };
        Evaluation::Ancillary {
            success: !diagnostics
                .iter()
                .any(|diagnostic| diagnostic.severity == Severity::Error),
            value: Json::object([
                ("selections", Json::Array(selections)),
                (
                    "diagnostics",
                    Json::Array(diagnostics.iter().map(Diagnostic::to_json).collect()),
                ),
            ]),
            diagnostics,
        }
    }
}

fn inspection_entity(entity: &Entity) -> Option<Json> {
    let facts = &entity.facts;
    let bounds = facts.bounds;
    let mut fields;
    if let Some(direction) = facts.axis_direction {
        fields = vec![
            ("kind".into(), Json::string("axis")),
            ("name".into(), Json::string(&entity.id)),
            ("direction".into(), point(direction)),
            ("source".into(), Json::string("selector")),
        ];
        if let Some(bounds) = bounds {
            fields.push(("center".into(), point(centre(entity, bounds))));
        }
        if let Some(radius) = facts.radius {
            fields.push(("radius".into(), Json::Number(radius)));
        }
    } else if let Some(normal) = facts.normal {
        fields = vec![
            ("kind".into(), Json::string("plane")),
            ("name".into(), Json::string(&entity.id)),
            ("normal".into(), point(normal)),
            ("source".into(), Json::string("selector")),
        ];
        if let Some(offset) = facts.offset {
            fields.push(("offset".into(), Json::Number(offset)));
        }
    } else {
        let bounds = bounds?;
        fields = vec![
            ("kind".into(), Json::string("occurrence")),
            (
                "name".into(),
                Json::string(entity.occurrence_path.as_deref().unwrap_or(&entity.id)),
            ),
            ("center".into(), point(centre(entity, bounds))),
            (
                "source".into(),
                Json::string(if entity.facts.material_region.is_some() {
                    "mesh"
                } else {
                    "step"
                }),
            ),
        ];
    }
    if let Some(bounds) = bounds {
        fields.push((
            "bounds".into(),
            Json::object([("min", point(bounds.min)), ("max", point(bounds.max))]),
        ));
    }
    Some(Json::Object(fields))
}

fn centre(entity: &Entity, bounds: Bounds) -> [f64; 3] {
    entity
        .facts
        .centroid
        .unwrap_or_else(|| std::array::from_fn(|axis| (bounds.min[axis] + bounds.max[axis]) / 2.0))
}

fn point(value: [f64; 3]) -> Json {
    Json::Array(value.into_iter().map(Json::Number).collect())
}
