//! Synthetic placed-face transport controls, not a replacement for original
//! 74-row AP242 admission. Expected math is frozen in the lane contract.
use super::*;
use crate::{
    analysis::selection::{face_entity, resolve, EntityType},
    backend::brep::{FaceFacts, LocatedFace, SurfaceFacts},
    budget::Budget,
    result::{finish, Polarity},
    subject::{Subject, SubjectFormat},
};

fn entity(origin: [f64; 3], direction: [f64; 3], plane: bool, reversed: bool) -> Entity {
    face_entity(
        "part",
        &[0],
        &LocatedFace {
            entity: BrepEntity::Face {
                occurrence: 0,
                face: 7,
            },
            facts: FaceFacts {
                index: 2,
                area: 1.,
                center_of_mass: origin,
                surface: if plane {
                    SurfaceFacts::Plane {
                        origin,
                        normal: direction,
                    }
                } else {
                    SurfaceFacts::Cylinder {
                        origin,
                        axis: direction,
                        radius: 1.,
                    }
                },
            },
            bounds: Bounds {
                min: [-1.; 3],
                max: [1.; 3],
            },
            reversed,
        },
    )
}
fn endpoint(entity: Entity) -> Endpoint {
    Endpoint {
        entity: entity.face.unwrap(),
        occurrence: entity.occurrence,
        facts: entity.facts,
        bore: None,
    }
}
fn relationship(kind: &str) -> Relationship {
    let mut r = parse_relationship(
        &Json::object([
            ("kind", Json::string(kind)),
            ("subject", Json::string("a")),
            ("target", Json::string("b")),
        ]),
        0,
    )
    .unwrap();
    r.tolerance = Some(0.);
    r.angular_tolerance_degrees = Some(0.);
    r
}
fn run(r: &Relationship, a: Endpoint, b: Endpoint, limit: u64, polarity: Polarity) -> (Json, u64) {
    let subjects = [Rc::new(Subject::new(
        "nominal-analytic-transport".into(),
        SubjectFormat::Step,
        "mm".into(),
    ))];
    let budget = Budget::new(limit);
    let normalized = Json::Null;
    let mut context = EvaluationContext::new(
        &subjects,
        Capability::ToHaveSpatialRelationships,
        "nominal-analytic",
        &normalized,
        &budget,
        None,
    );
    let evaluation = match prove(r, &[a], &[b], &mut context) {
        Ok(p) => Evaluation::Geometric {
            positive_satisfied: p.positive,
            diagnostics: p.diagnostics,
            evidence: p.final_evidence,
            negated_diagnostic: None,
        },
        Err(ProofError::Refused(e) | ProofError::Budget(e)) => e,
        Err(ProofError::Backend(e)) => backend_refusal(e),
    };
    (
        finish(
            "nominal-analytic",
            Capability::ToHaveSpatialRelationships,
            polarity,
            evaluation,
        )
        .unwrap(),
        budget.used(),
    )
}
fn status(j: &Json) -> &Json {
    json_field_ref(j, "status").unwrap()
}

#[test]
fn nominal_analytic_selector_derivation_keeps_private_address_and_raw_plane_origin() {
    for (kind, plane) in [(EntityType::Axis, false), (EntityType::Plane, true)] {
        let original = entity([10., 20., 0.25], [0., 0., 3.], plane, true);
        let index = SelectorIndex {
            faces: vec![original.clone()],
            ..SelectorIndex::default()
        };
        let selected = resolve(
            &Selector::Query {
                kind,
                of: None,
                query: Query::default(),
                expect: Cardinality::One,
            },
            &index,
            &crate::prepared::regexp::SelectorRegex::default(),
        );
        assert_eq!(selected.status, SelectionStatus::Resolved);
        assert_eq!(selected.entities[0].face, original.face);
        let support = selected.entities[0].facts.nominal_support.unwrap();
        assert_eq!(support.origin, [10., 20., 0.25]);
        assert_eq!(support.public_ordinal, 2);
        assert_eq!(
            support.entity,
            BrepEntity::Face {
                occurrence: 0,
                face: 7
            }
        );
        assert_eq!(
            support.direction,
            if plane { [0., 0., -3.] } else { [0., 0., 3.] }
        );
    }
}

#[test]
fn nominal_analytic_matcher_families_use_exact_truth_and_refuse_bad_association_under_both_polarities(
) {
    for (kind, plane) in [
        ("coaxial", false),
        ("concentric", false),
        ("coplanar", true),
        ("parallel", false),
        ("perpendicular", false),
        ("angle", false),
    ] {
        let r = relationship(kind);
        let b = if kind == "perpendicular" {
            [1., 0., 0.]
        } else {
            [0., 0., -7.]
        };
        for (polarity, want) in [
            (Polarity::Positive, "passed"),
            (Polarity::Negative, "failed"),
        ] {
            let (result, units) = run(
                &r,
                endpoint(entity([0.; 3], [0., 0., 3.], plane, false)),
                endpoint(entity([0.; 3], b, plane, false)),
                256,
                polarity,
            );
            assert_eq!(status(&result), &Json::string(want));
            assert_eq!(units, 256);
            let encoded = encode(&result).unwrap();
            assert!(String::from_utf8(encoded)
                .unwrap()
                .contains("exact-nominal-analytic-support"));
            for corruption in 0..4 {
                let mut a = endpoint(entity([0.; 3], [0., 0., 3.], plane, false));
                match corruption {
                    0 => a.facts.face_index = Some(7),
                    1 => a.occurrence = Some(1),
                    2 => {
                        a.entity = BrepEntity::Face {
                            occurrence: 0,
                            face: 2,
                        }
                    }
                    _ => a.facts.nominal_support = None,
                }
                let (result, _) = run(
                    &r,
                    a,
                    endpoint(entity([0.; 3], b, plane, false)),
                    256,
                    polarity,
                );
                assert_eq!(status(&result), &Json::string("refused"));
            }
        }
    }
}

#[test]
fn nominal_analytic_invalid_vectors_budget_and_recorded_angle_amendment() {
    for polarity in [Polarity::Positive, Polarity::Negative] {
        for direction in [[0.; 3], [f64::NAN, 0., 1.]] {
            let (result, _) = run(
                &relationship("parallel"),
                endpoint(entity([0.; 3], direction, false, false)),
                endpoint(entity([0.; 3], [0., 0., 1.], false, false)),
                256,
                polarity,
            );
            assert_eq!(status(&result), &Json::string("refused"));
            assert!(String::from_utf8(encode(&result).unwrap())
                .unwrap()
                .contains("GEOSPEC_INVALID_EVIDENCE"));
        }
        let (result, units) = run(
            &relationship("parallel"),
            endpoint(entity([0.; 3], [0., 0., 1.], false, false)),
            endpoint(entity([0.; 3], [0., 0., 1.], false, false)),
            255,
            polarity,
        );
        assert_eq!(status(&result), &Json::string("refused"));
        assert_eq!(units, 256);
    }
    let mut r = relationship("angle");
    r.angle_degrees = Some(60.);
    r.angular_tolerance_degrees = Some(1e-12);
    let observations = [
        ([0.5, 0.8660254037844386, 0.], true),
        ([0.50000000000019, 0.866025403784329, 0.], false),
    ]
    .into_iter()
    .flat_map(|(direction, pass)| {
        [Polarity::Positive, Polarity::Negative].map(|polarity| {
            let (result, _) = run(
                &r,
                endpoint(entity([0.; 3], [1., 0., 0.], false, false)),
                endpoint(entity([0.; 3], direction, false, false)),
                256,
                polarity,
            );
            let expected = if pass == (polarity == Polarity::Positive) {
                "passed"
            } else {
                "failed"
            };
            (expected, result)
        })
    })
    .collect::<Vec<_>>();
    for (expected, result) in &observations {
        println!(
            "Q2-M3-AP242-ANGLE-OPERAND-01 expected={expected} {}",
            String::from_utf8(encode(result).unwrap()).unwrap()
        );
    }
    for (expected, result) in observations {
        assert_eq!(status(&result), &Json::string(expected));
    }
}

// The adapter supplies a complete source-box certificate; all other kernel
// calls panic so error-triggered Boolean/extrema fallback cannot hide here.
struct BoxControl {
    bad: bool,
}
impl BrepSubject for BoxControl {
    fn selected_continuous_domain(
        &self,
        id: u32,
    ) -> Result<crate::backend::brep::SelectedContinuousDomain, BackendError> {
        if self.bad {
            return Err(BackendError {
                kind: BackendErrorKind::Unsupported,
                message: "incomplete source box".into(),
            });
        }
        Ok(match id {
            0 => continuous::nominal_analytic_box_control(id, [0.; 3], [10.; 3]),
            1 => continuous::nominal_analytic_box_control(id, [8., 0., 0.], [12., 10., 10.]),
            3 => continuous::nominal_analytic_box_control(id, [12., 0., 0.], [20., 10., 10.]),
            _ => continuous::nominal_analytic_box_control(id, [9., 0., 0.], [12., 10., 10.]),
        })
    }
    fn faces(&self) -> Result<Rc<[LocatedFace]>, BackendError> {
        unreachable!()
    }
    fn validity(&self) -> Result<Rc<crate::backend::brep::ValidityFacts>, BackendError> {
        unreachable!()
    }
    fn classify_face_points(
        &self,
        _: BrepEntity,
        _: &[[f64; 3]],
        _: f64,
    ) -> Result<Vec<crate::backend::brep::PointState>, BackendError> {
        unreachable!()
    }
    fn tessellate(
        &self,
        _: BrepEntity,
        _: crate::backend::brep::TessellationProfile,
    ) -> Result<Rc<crate::backend::TriangleMesh>, BackendError> {
        unreachable!()
    }
}
fn occurrence(id: u32) -> Endpoint {
    Endpoint {
        entity: BrepEntity::Occurrence(id),
        occurrence: Some(id),
        facts: EntityFacts::default(),
        bore: None,
    }
}
#[test]
fn nominal_analytic_box_route_uses_max_pair_and_never_falls_back_after_bad_admission() {
    for bad in [false, true] {
        for polarity in [Polarity::Positive, Polarity::Negative] {
            let mut subject =
                Subject::new("box-transport".into(), SubjectFormat::Step, "mm".into());
            // Cache identity is part of the transport setup, not box geometry.
            let identity = crate::identity::SubjectIdentity::step(
                b"nominal-box-transport-control",
                "millimetre",
                1.0,
                crate::backend::brep::BrepIdentityProfile {
                    ingest_profile: "core-control",
                    backend_profile: "core-control",
                },
                None,
            )
            .unwrap();
            subject.content_hash = identity.primary_hash().into();
            subject.semantic_identity.set(identity).unwrap();
            subject.brep = Some(Box::new(BoxControl { bad }));
            let subjects = [Rc::new(subject)];
            let budget = Budget::new(20);
            let normalized = Json::Null;
            let mut context = EvaluationContext::new(
                &subjects,
                Capability::ToHaveSpatialRelationships,
                "boxes",
                &normalized,
                &budget,
                None,
            );
            let mut r = relationship("interference");
            r.min_volume = Some(200.);
            r.max_volume = Some(200.);
            let evaluation = match prove_interference(
                &r,
                &[occurrence(0)],
                &[occurrence(2), occurrence(1)],
                &mut context,
            ) {
                Ok(p) => {
                    assert_eq!(
                        json_field_ref(&p.final_evidence, "method"),
                        Some(&Json::string("exact-nominal-box-interference"))
                    );
                    let measured = json_field_ref(&p.final_evidence, "measured").unwrap();
                    assert_eq!(
                        json_field_ref(measured, "volume"),
                        Some(&Json::Number(200.))
                    );
                    assert_eq!(
                        json_field_ref(measured, "maximumPairIndex"),
                        Some(&Json::Number(1.))
                    );
                    Evaluation::Geometric {
                        positive_satisfied: p.positive,
                        diagnostics: p.diagnostics,
                        evidence: p.final_evidence,
                        negated_diagnostic: None,
                    }
                }
                Err(ProofError::Refused(e) | ProofError::Budget(e)) => e,
                Err(ProofError::Backend(e)) => backend_refusal(e),
            };
            let result = finish(
                "boxes",
                Capability::ToHaveSpatialRelationships,
                polarity,
                evaluation,
            )
            .unwrap();
            assert_eq!(
                status(&result),
                &Json::string(if bad {
                    "refused"
                } else if polarity == Polarity::Positive {
                    "passed"
                } else {
                    "failed"
                })
            );
            assert_eq!(budget.used(), if bad { 1 } else { 5 });
        }
    }
}

#[test]
fn occurrence_contact_is_not_charged_to_a_full_cylindrical_band_capacity() {
    let mut subject = Subject::new("box-contact".into(), SubjectFormat::Step, "mm".into());
    let identity = crate::identity::SubjectIdentity::step(
        b"nominal-box-contact-control",
        "millimetre",
        1.0,
        crate::backend::brep::BrepIdentityProfile {
            ingest_profile: "core-control",
            backend_profile: "core-control",
        },
        None,
    )
    .unwrap();
    subject.content_hash = identity.primary_hash().into();
    subject.semantic_identity.set(identity).unwrap();
    subject.brep = Some(Box::new(BoxControl { bad: false }));
    let subjects = [Rc::new(subject)];
    let budget = Budget::new(1_000_000);
    let normalized = Json::Null;
    let mut context = EvaluationContext::new(
        &subjects,
        Capability::ToHaveSpatialRelationships,
        "box-contact",
        &normalized,
        &budget,
        None,
    );
    // Earlier band rows own exactly the whole 256 KiB band capacity.
    let header = std::mem::size_of::<Vec<Rc<crate::backend::brep::NominalCylindricalBand>>>();
    assert!(context
        .set_cylindrical_band_output_bytes((256 * 1024 - header) as u64)
        .is_ok());
    let r = relationship("contact");
    // Box-to-box contact proof bytes belong to the continuous output bound.
    let Ok(proof) = prove_contact(&r, &[occurrence(0)], &[occurrence(1)], &mut context) else {
        panic!("box contact must not be refused by cylindrical-band capacity");
    };
    assert_eq!(
        json_field_ref(&proof.final_evidence, "method"),
        Some(&Json::string("exact-nominal-finite-contact"))
    );
    // A separated box contact reports the measured gap, its witness and a
    // spatial center like box clearance, not the compact face-contact shape.
    let Ok(proof) = prove_contact(&r, &[occurrence(0)], &[occurrence(3)], &mut context) else {
        panic!("separated box contact must be decided");
    };
    assert!(!proof.positive);
    let selected = Selection {
        status: SelectionStatus::Resolved,
        entities: vec![],
        expected: crate::analysis::selection::Cardinality::One,
        stability: Stability::Authored,
        candidates: vec![],
        diagnostics: vec![],
    };
    let diagnostic =
        project_relationship_diagnostic(0, &r, &selected, &selected, &proof, &proof.diagnostics[0]);
    let actual: serde_json::Value =
        serde_json::from_slice(&crate::codec::encode(&diagnostic.to_json()).unwrap()).unwrap();
    assert_eq!(actual["code"], "GEOSPEC_SPATIAL_RELATIONSHIP_MISMATCH");
    assert_eq!(
        actual["spatial"]["center"].as_array().map(Vec::len),
        Some(3)
    );
    assert_eq!(actual["spatial"].as_object().map(|o| o.len()), Some(1));
    assert_eq!(actual["details"]["measured"]["distance"].as_f64(), Some(2.));
    assert_eq!(
        actual["details"]["witnesses"][0]["kind"],
        "nominal-box-clearance"
    );
    // A selected-face contact still needs band capacity, and is refused first.
    let face = endpoint(entity([0.; 3], [0., 0., 1.], true, false));
    let Err(ProofError::Refused(Evaluation::Refused { diagnostics })) =
        prove_contact(&r, &[face.clone()], &[face], &mut context)
    else {
        panic!("an oversized band claim must be refused");
    };
    assert_eq!(
        diagnostics[0].message,
        "Simultaneous cylindrical-band clearance capacity exceeds 256 KiB."
    );
}
