//! Bounded core/transport controls, not kernel geometry certification.

use super::*;
use crate::{
    backend::{brep::*, TriangleMesh},
    budget::Budget,
    result::{finish, Polarity},
    subject::{Subject, SubjectFormat},
};
use std::{cell::RefCell, rc::Rc};

#[derive(Clone)]
struct Control {
    // Target-major results; no geometry algorithm or candidate-derived oracle.
    outcomes: Vec<Vec<Result<RegularSolidContainment, BackendError>>>,
    calls: Rc<RefCell<Vec<(BrepEntity, BrepEntity)>>>,
}

impl BrepSubject for Control {
    fn regular_solid_containment(
        &self,
        a: BrepEntity,
        b: BrepEntity,
    ) -> Result<RegularSolidContainment, BackendError> {
        self.calls.borrow_mut().push((a, b));
        let (BrepEntity::Occurrence(a), BrepEntity::Occurrence(b)) = (a, b) else {
            panic!("expected occurrence operands")
        };
        self.outcomes[(b - 10) as usize][a as usize].clone()
    }
    fn reported_facts_and_mesh(&self) -> Result<ReportedBrepBundle, BackendError> {
        Ok(ReportedBrepBundle {
            facts: Rc::new(DocumentFacts {
                source_length_unit: "millimetre".into(),
                source_unit_to_millimeters: 1.0,
                occurrences: vec![],
                subshapes: vec![],
                datum_placements: vec![],
                semantic_datums: vec![],
                shape: ShapeFacts {
                    bounds: Bounds {
                        min: [0.0; 3],
                        max: [1.0; 3],
                    },
                    volume: 1.0,
                    surface_area: 6.0,
                    center_of_mass: [0.5; 3],
                    topology: TopologyCounts {
                        compounds: 0,
                        solids: 1,
                        shells: 1,
                        faces: 6,
                        wires: 6,
                        edges: 12,
                        vertices: 8,
                    },
                },
            }),
            whole_faces: Rc::from([]),
            occurrence_faces: vec![],
            mesh: Rc::new(TriangleMesh {
                positions: vec![],
                triangles: vec![],
            }),
        })
    }
    fn faces(&self) -> Result<Rc<[LocatedFace]>, BackendError> {
        unreachable!("no face query")
    }
    fn validity(&self) -> Result<Rc<ValidityFacts>, BackendError> {
        unreachable!("query validates its own operands")
    }
    fn classify_face_points(
        &self,
        _: BrepEntity,
        _: &[[f64; 3]],
        _: f64,
    ) -> Result<Vec<PointState>, BackendError> {
        unreachable!("no sampled containment")
    }
    fn tessellate(
        &self,
        _: BrepEntity,
        _: TessellationProfile,
    ) -> Result<Rc<TriangleMesh>, BackendError> {
        unreachable!("no tessellation substitute")
    }
}

fn empty() -> Result<RegularSolidContainment, BackendError> {
    Ok(RegularSolidContainment {
        contained: true,
        residual_solid_count: 0,
        residual_volume: 0.0,
        residual_bounds: None,
        residual_center_of_mass: None,
    })
}

fn residue(volume: f64) -> Result<RegularSolidContainment, BackendError> {
    Ok(RegularSolidContainment {
        contained: false,
        residual_solid_count: 1,
        residual_volume: volume,
        residual_bounds: Some(Bounds {
            min: [2.0; 3],
            max: [3.0; 3],
        }),
        residual_center_of_mass: Some([2.5; 3]),
    })
}

fn control(
    outcomes: Vec<Vec<Result<RegularSolidContainment, BackendError>>>,
) -> (Rc<Subject>, Control) {
    let control = Control {
        outcomes,
        calls: Rc::new(RefCell::new(vec![])),
    };
    let identity = crate::identity::SubjectIdentity::step(
        b"regular-set-core-control",
        "millimetre",
        1.0,
        BrepIdentityProfile {
            ingest_profile: "core-control",
            backend_profile: "core-control",
        },
        None,
    )
    .unwrap();
    let mut subject = Subject::new(
        identity.primary_hash().into(),
        SubjectFormat::Step,
        "mm".into(),
    );
    subject.semantic_identity.set(identity).unwrap();
    subject.brep = Some(Box::new(control.clone()));
    (Rc::new(subject), control)
}

fn selection(indices: &[u32]) -> Selection {
    Selection {
        status: SelectionStatus::Resolved,
        expected: Cardinality::Many,
        stability: Stability::Authored,
        candidates: vec![],
        diagnostics: vec![],
        entities: indices
            .iter()
            .map(|&index| Entity {
                id: format!("source-{index}"),
                entity_type: crate::analysis::selection::EntityType::Occurrence,
                occurrence_path: Some(format!("/assembly/part-{index}")),
                occurrence: Some(index),
                face: None,
                facts: EntityFacts {
                    bounds: Some(Bounds {
                        min: [0.0; 3],
                        max: [1.0; 3],
                    }),
                    ..EntityFacts::default()
                },
                topology_ref: None,
            })
            .collect(),
    }
}

fn prepared(subjects: &[u32], targets: &[u32]) -> Prepared {
    let mut relationship = parse_relationship(
        &Json::object([
            ("kind", Json::string("containment")),
            ("subject", Json::string("subjects")),
            ("target", Json::string("targets")),
        ]),
        0,
    )
    .unwrap();
    relationship.resolved = Some((selection(subjects), selection(targets)));
    relationship.resolved_bores = Some((vec![None; subjects.len()], vec![None; targets.len()]));
    Prepared {
        relationships: vec![relationship],
    }
}

fn run(
    prepared: &Prepared,
    subject: &Rc<Subject>,
    limit: u64,
    polarity: Polarity,
) -> (serde_json::Value, u64) {
    let subjects = [Rc::clone(subject)];
    let normalized = prepared.normalized_payload();
    let budget = Budget::new(limit);
    let mut context = EvaluationContext::new(
        &subjects,
        Capability::ToHaveSpatialRelationships,
        "regular-set",
        &normalized,
        &budget,
        None,
    );
    let result = finish(
        "regular-set",
        Capability::ToHaveSpatialRelationships,
        polarity,
        evaluate(prepared, &mut context),
    )
    .unwrap();
    (
        serde_json::from_slice(&encode(&result).unwrap()).unwrap(),
        budget.used(),
    )
}

#[test]
fn inside_boundary_and_coincident_transport_results_use_empty_topology_in_both_polarities() {
    let (subject, calls) = control(vec![vec![empty(), empty(), empty()]]);
    let claim = prepared(&[0, 1, 2], &[10]);
    for (polarity, expected) in [
        (Polarity::Positive, "passed"),
        (Polarity::Negative, "failed"),
    ] {
        let (result, used) = run(&claim, &subject, 4, polarity);
        assert_eq!(result["status"], expected);
        let (warm, warm_used) = run(&claim, &subject, 4, polarity);
        assert_eq!(
            result, warm,
            "whole core report is cache-history independent"
        );
        assert_eq!(warm_used, used);
        assert_eq!(
            used, 4,
            "one report plus three requested differences, cold or warm"
        );
    }
    assert_eq!(calls.calls.borrow().len(), 12, "no new result cache");
}

#[test]
fn nonempty_residue_fails_even_with_tiny_volume_and_identical_diagnostic_aabbs() {
    for volume in [1.0, 1e-30] {
        let (subject, _) = control(vec![vec![residue(volume)]]);
        let claim = prepared(&[0], &[10]);
        for (polarity, expected) in [
            (Polarity::Positive, "failed"),
            (Polarity::Negative, "passed"),
        ] {
            let (result, used) = run(&claim, &subject, 2, polarity);
            assert_eq!(result["status"], expected);
            assert_eq!(used, 2);
            let row = &result["evidence"]["witnesses"]["relationships"][0];
            assert_eq!(row["final"]["method"], "boolean-difference");
            assert_eq!(row["final"]["witnesses"], serde_json::json!([]));
            assert_eq!(row["subject"]["entities"][0]["id"], "source-0");
            assert_eq!(row["target"]["entities"][0]["id"], "source-10");
            assert_eq!(
                row["final"]["measured"]["residuals"][0]["residualSolidCount"],
                1
            );
            assert_eq!(
                row["final"]["measured"]["residuals"][0]["residualVolume"],
                volume
            );
            if polarity == Polarity::Positive {
                assert_eq!(
                    result["diagnostics"][0]["code"],
                    "GEOSPEC_SPATIAL_RELATIONSHIP_MISMATCH"
                );
                assert_eq!(
                    result["diagnostics"][0]["spatial"]["center"],
                    serde_json::json!([2.5, 2.5, 2.5])
                );
                assert_eq!(
                    result["diagnostics"][0]["spatial"]["role"],
                    "diagnostic-residual-centroid"
                );
            }
        }
    }
}

#[test]
fn split_targets_do_not_form_a_union_and_ties_keep_first_selected_target() {
    let (subject, calls) = control(vec![
        vec![empty(), residue(1.0)],
        vec![residue(1.0), empty()],
    ]);
    for targets in [[10, 11], [11, 10]] {
        for (polarity, expected) in [
            (Polarity::Positive, "failed"),
            (Polarity::Negative, "passed"),
        ] {
            calls.calls.borrow_mut().clear();
            let (result, used) = run(&prepared(&[1, 0], &targets), &subject, 5, polarity);
            assert_eq!(result["status"], expected);
            assert_eq!(used, 5);
            assert_eq!(
                *calls.calls.borrow(),
                targets
                    .into_iter()
                    .flat_map(
                        |b| [1, 0].map(|a| (BrepEntity::Occurrence(a), BrepEntity::Occurrence(b)))
                    )
                    .collect::<Vec<_>>()
            );
            assert_eq!(result["evidence"]["measured"][0]["targetIndex"], 0);
        }
    }
}

#[test]
fn later_single_target_can_contain_the_whole_group_in_either_selection_order() {
    let (subject, _) = control(vec![vec![empty(), residue(1.0)], vec![empty(), empty()]]);
    for (targets, best) in [([10, 11], 1), ([11, 10], 0)] {
        for (polarity, expected) in [
            (Polarity::Positive, "passed"),
            (Polarity::Negative, "failed"),
        ] {
            let (result, used) = run(&prepared(&[0, 1], &targets), &subject, 5, polarity);
            assert_eq!(result["status"], expected);
            assert_eq!(used, 5);
            assert_eq!(result["evidence"]["measured"][0]["targetIndex"], best);
        }
    }
}

#[test]
fn budget_rejection_precedes_each_query_on_cold_and_warm_subjects() {
    let (subject, calls) = control(vec![vec![empty(), empty()], vec![empty(), empty()]]);
    let claim = prepared(&[0, 1], &[10, 11]);
    for _ in 0..2 {
        for limit in 0..5 {
            for polarity in [Polarity::Positive, Polarity::Negative] {
                calls.calls.borrow_mut().clear();
                let (result, used) = run(&claim, &subject, limit, polarity);
                assert_eq!(result["status"], "refused");
                assert_eq!(result["diagnostics"][0]["code"], "MATCHER_TIMEOUT");
                assert_eq!(used, limit + 1);
                assert_eq!(calls.calls.borrow().len(), limit.saturating_sub(1) as usize);
            }
        }
    }
}

#[test]
fn unsupported_and_failed_transport_results_cannot_be_inverted_or_hidden_by_another_target() {
    for kind in [
        BackendErrorKind::Unsupported,
        BackendErrorKind::ComputationFailed,
    ] {
        let code = if kind == BackendErrorKind::Unsupported {
            "GEOSPEC_UNSUPPORTED_EVIDENCE"
        } else {
            "GEOSPEC_BACKEND_FAILED"
        };
        let (subject, calls) = control(vec![
            vec![empty()],
            vec![Err(BackendError {
                kind,
                message: "ordinary unavailable regular-solid evidence".into(),
            })],
        ]);
        for targets in [[10, 11], [11, 10]] {
            for polarity in [Polarity::Positive, Polarity::Negative] {
                calls.calls.borrow_mut().clear();
                let (result, used) = run(&prepared(&[0], &targets), &subject, 3, polarity);
                assert_eq!(result["status"], "refused");
                assert_eq!(result["diagnostics"][0]["code"], code);
                assert_eq!(
                    result["diagnostics"][0]["message"],
                    "ordinary unavailable regular-solid evidence"
                );
                assert_eq!(used as usize, 1 + calls.calls.borrow().len());
                let details = &result["diagnostics"][0]["details"];
                assert_eq!(details["method"], "boolean-difference");
                assert_eq!(details["subjectIndex"], 0);
                assert_eq!(details["targetIndex"], if targets[0] == 10 { 1 } else { 0 });
                assert_eq!(
                    details["subject"]["entities"][0]["occurrencePath"],
                    "/assembly/part-0"
                );
                assert_eq!(
                    details["target"]["entities"][1]["id"],
                    format!("source-{}", targets[1])
                );
            }
        }
    }
}

#[test]
fn bore_branch_retains_long_pin_radial_fit_without_regular_set_queries() {
    let (subject, calls) = control(vec![]);
    let mut claim = prepared(&[0], &[10]);
    let band = |from, to| {
        Some(Ok(BoreRegion {
            origin: [0.0; 3],
            direction: [0.0, 0.0, 1.0],
            radius: 2.0,
            from,
            to,
        }))
    };
    claim.relationships[0].resolved_bores =
        Some((vec![band(-32.0, 32.0)], vec![band(-30.0, -14.0)]));
    for (polarity, expected) in [
        (Polarity::Positive, "passed"),
        (Polarity::Negative, "failed"),
    ] {
        let (result, used) = run(&claim, &subject, 1, polarity);
        assert_eq!(result["status"], expected);
        assert_eq!(
            used, 1,
            "already prepared bore extents need no regular-set difference"
        );
        assert_eq!(
            result["evidence"]["measured"][0]["criterion"],
            "radial-fit-with-positive-engagement"
        );
        assert_eq!(
            result["evidence"]["measured"][0]["axialEnclosureRequired"],
            false
        );
        assert_eq!(result["evidence"]["measured"][0]["engagement"], 16.0);
    }
    assert!(calls.calls.borrow().is_empty());
}
