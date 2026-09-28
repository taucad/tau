use std::{cell::Cell, rc::Rc};

use super::*;
use crate::{
    backend::{
        brep::{
            BrepEntity, CircularBoreInventory, EdgeTreatmentBoundaryUse, EdgeTreatmentCounts,
            EdgeTreatmentResidual, EdgeTreatmentRow, EdgeTreatmentSupport, FaceFacts, LocatedFace,
            PointState, ReportedFaces, ShapeFacts, TessellationProfile, ValidityFacts,
        },
        TriangleMesh,
    },
    budget::Budget,
    result::{finish, Evaluation, Polarity},
    subject::{EvaluationContext, Subject, SubjectFormat},
};

#[derive(Clone)]
struct EdgeTreatmentBrep {
    inventory: EdgeTreatmentInventory,
    shape: ShapeFacts,
    faces: Rc<[LocatedFace]>,
    reports: Rc<Cell<usize>>,
    counts: Rc<Cell<usize>>,
    classifications: Rc<Cell<usize>>,
}

impl EdgeTreatmentBrep {
    fn new(inventory: EdgeTreatmentInventory) -> Self {
        let faces: Rc<[LocatedFace]> = Rc::from(
            (0..inventory.counts.public_face_count)
                .map(|index| LocatedFace {
                    entity: BrepEntity::WholeFace(index + 1),
                    facts: FaceFacts {
                        index,
                        area: 1.0,
                        center_of_mass: [index as f64, 0.0, 0.0],
                        surface: SurfaceFacts::Plane {
                            origin: [index as f64, 0.0, 0.0],
                            normal: [0.0, 0.0, 1.0],
                        },
                    },
                    bounds: Bounds {
                        min: [index as f64, 0.0, 0.0],
                        max: [index as f64 + 1.0, 1.0, 1.0],
                    },
                    reversed: false,
                })
                .collect::<Vec<_>>(),
        );
        Self {
            inventory,
            shape: ShapeFacts {
                bounds: Bounds {
                    min: [0.0; 3],
                    max: [3.0, 1.0, 1.0],
                },
                volume: 1.0,
                surface_area: 1.0,
                center_of_mass: [0.0; 3],
                topology: TopologyCounts {
                    compounds: 1,
                    solids: 1,
                    shells: 1,
                    faces: 3,
                    wires: 3,
                    edges: 5,
                    vertices: 6,
                },
            },
            faces,
            reports: Rc::new(Cell::new(0)),
            counts: Rc::new(Cell::new(0)),
            classifications: Rc::new(Cell::new(0)),
        }
    }
}

impl BrepSubject for EdgeTreatmentBrep {
    fn circular_bores(&self, _: usize) -> Result<CircularBoreInventory, BackendError> {
        Ok(CircularBoreInventory {
            candidates: Vec::new(),
        })
    }

    fn edge_treatment_counts(&self) -> Result<EdgeTreatmentCounts, BackendError> {
        self.counts.set(self.counts.get() + 1);
        Ok(self.inventory.counts)
    }

    fn edge_treatments(&self, max_rows: usize) -> Result<EdgeTreatmentInventory, BackendError> {
        self.classifications.set(self.classifications.get() + 1);
        assert!(self.inventory.rows.len() <= max_rows);
        Ok(self.inventory.clone())
    }

    // `reports` counts the report facets demanded.
    fn reported_faces(&self, _: bool) -> Result<ReportedFaces, BackendError> {
        self.reports.set(self.reports.get() + 1);
        Ok(ReportedFaces {
            whole_faces: Rc::clone(&self.faces),
            occurrence_faces: Vec::new(),
        })
    }

    fn reported_shape(&self) -> Result<ShapeFacts, BackendError> {
        self.reports.set(self.reports.get() + 1);
        Ok(self.shape.clone())
    }

    fn reported_mesh(&self) -> Result<TriangleMesh, BackendError> {
        self.reports.set(self.reports.get() + 1);
        Ok(TriangleMesh {
            positions: Vec::new(),
            triangles: Vec::new(),
        })
    }

    fn document_rows(&self) -> Result<crate::backend::brep::DocumentRows, BackendError> {
        self.reports.set(self.reports.get() + 1);
        Ok(crate::backend::brep::DocumentRows::default())
    }

    // The source route; the report is demanded only for the face tables.
    fn source_occurrences(&self) -> Result<Rc<[OccurrenceFacts]>, BackendError> {
        Ok(Rc::from(Vec::new()))
    }

    fn faces(&self) -> Result<Rc<[LocatedFace]>, BackendError> {
        Ok(Rc::clone(&self.faces))
    }
    fn validity(&self) -> Result<Rc<ValidityFacts>, BackendError> {
        Ok(Rc::new(ValidityFacts {
            valid: true,
            checks: None,
            max_tolerance: None,
            free_bounds: None,
            small_edges: None,
            same_parameter: None,
            closed_shells: None,
            closed_solids: None,
            solid_count: None,
            invalid_solid_count: None,
            open_edge_count: None,
            nonmanifold_edge_count: None,
            closed_wires: None,
            reason: None,
        }))
    }
    fn classify_face_points(
        &self,
        _: BrepEntity,
        _: &[[f64; 3]],
        _: f64,
    ) -> Result<Vec<PointState>, BackendError> {
        Err(unused())
    }
    fn tessellate(
        &self,
        _: BrepEntity,
        _: TessellationProfile,
    ) -> Result<Rc<TriangleMesh>, BackendError> {
        Err(unused())
    }
}

fn unused() -> BackendError {
    BackendError {
        kind: BackendErrorKind::Unsupported,
        message: "unused test operation".into(),
    }
}

fn certificate(kind: EdgeTreatmentKind, metric_value_mm: f64) -> EdgeTreatmentCertificate {
    EdgeTreatmentCertificate {
        kind,
        metric_value_mm,
        surface: SurfaceFacts::Torus {
            center: [1.25, 2.5, 3.75],
            axis: [0.0, 0.0, 1.0],
            major_radius: 4.25,
            minor_radius: 2.0,
        },
        parameter_bounds: [0.125, 1.25, 2.5, 3.75],
        supports: [support(0, 1, false), support(1, 2, false)],
        boundary_uses: vec![EdgeTreatmentBoundaryUse {
            owning_solid_edge_ordinal: 5,
            wire_ordinal: 7,
            reversed: true,
            seam: false,
            role: EdgeTreatmentBoundaryRole::Rail1,
            curve: CurveFacts::Ellipse {
                center: [4.0, 5.0, 6.0],
                axis: [0.0, 1.0, 0.0],
                major_radius: 8.5,
                minor_radius: 4.5,
            },
            parameter_range: [0.25, 0.75],
            start: [1.0, 2.0, 3.0],
            end: [4.0, 5.0, 6.0],
            length_mm: 9.5,
            edge_tolerance_mm: 0.015,
            vertex_tolerances_mm: [0.01, 0.02],
        }],
        residuals: vec![EdgeTreatmentResidual {
            kind: EdgeTreatmentResidualKind::MaterialBranch,
            value_mm: 0.003,
            limit_mm: 0.02,
            scale_mm: 1.5,
        }],
        wire_count: 1,
        maximum_topology_tolerance_mm: 0.02,
        material_side: EdgeTreatmentMaterialSide::Concave,
        full_u: false,
        sweep_interval: [0.5, 1.5],
    }
}

fn support(
    public_face_ordinal: u32,
    private_query_face: u32,
    transferred_reversed: bool,
) -> EdgeTreatmentSupport {
    EdgeTreatmentSupport {
        public_face_ordinal,
        private_query_face,
        surface: SurfaceFacts::Plane {
            origin: [public_face_ordinal as f64, 0.0, 0.0],
            normal: [0.0, 0.0, 1.0],
        },
        parameter_bounds: [0.0, 1.0, 2.0, 3.0],
        transferred_reversed,
        maximum_topology_tolerance_mm: 0.01,
    }
}

fn inventory(
    label: EdgeTreatmentLabel,
    chamfer: EdgeTreatmentDisposition,
    fillet: EdgeTreatmentDisposition,
) -> EdgeTreatmentInventory {
    let nonmember = EdgeTreatmentDisposition::NonMember(EdgeTreatmentReason::OutsideTopology);
    EdgeTreatmentInventory {
        counts: EdgeTreatmentCounts {
            public_face_count: 3,
            candidate_edge_use_count: 5,
        },
        rows: vec![
            row(
                0,
                EdgeTreatmentLabel::Absent,
                nonmember.clone(),
                nonmember.clone(),
            ),
            row(
                1,
                EdgeTreatmentLabel::Absent,
                nonmember.clone(),
                nonmember.clone(),
            ),
            row(2, label, chamfer, fillet),
        ],
    }
}

fn row(
    public_face_ordinal: u32,
    label: EdgeTreatmentLabel,
    chamfer: EdgeTreatmentDisposition,
    fillet: EdgeTreatmentDisposition,
) -> EdgeTreatmentRow {
    EdgeTreatmentRow {
        occurrence: None,
        occurrence_path: String::new(),
        public_face_ordinal,
        private_query_face: public_face_ordinal + 1,
        owning_solid_ordinal: Some(0),
        source_face_key: Some(format!("face-{public_face_ordinal}")),
        source_same_sense: Some(true),
        transferred_reversed: false,
        label,
        chamfer,
        fillet,
    }
}

fn prepared_feature(chamfer: bool, value: f64, selection: Option<&str>) -> Prepared {
    let capability = if chamfer {
        Capability::ToHaveChamferFeature
    } else {
        Capability::ToHaveFilletFeature
    };
    let mut fields = vec![
        (
            if chamfer { "distance" } else { "radius" }.into(),
            Json::Number(value),
        ),
        ("tolerance".into(), Json::Number(0.125)),
    ];
    if let Some(selection) = selection {
        fields.push(("selection".into(), Json::string(selection)));
    }
    prepare(
        capability,
        &Json::object([
            ("kind", Json::string(capability.kind().unwrap())),
            ("expected", Json::Object(fields)),
        ]),
    )
    .unwrap()
}

fn subject(brep: EdgeTreatmentBrep) -> Rc<Subject> {
    let identity = crate::identity::SubjectIdentity::step(
        b"edge-treatment-core-control",
        "millimetre",
        1.0,
        crate::backend::brep::BrepIdentityProfile {
            ingest_profile: "typed-edge-treatment-test-v1",
            backend_profile: "typed-edge-treatment-test-v1",
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
    subject.brep = Some(Box::new(brep));
    Rc::new(subject)
}

fn evaluate_subject(prepared: &Prepared, subject: &Rc<Subject>, limit: u64) -> (Evaluation, u64) {
    let subjects = [Rc::clone(subject)];
    let normalized = prepared.normalized_payload();
    let budget = Budget::new(limit);
    let mut context = EvaluationContext::new(
        &subjects,
        prepared.capability(),
        "edge-treatment",
        &normalized,
        &budget,
        None,
    );
    let evaluation = evaluate(prepared, &mut context);
    drop(context);
    (evaluation, budget.used())
}

fn json_field<'a>(value: &'a Json, key: &str) -> &'a Json {
    let Json::Object(fields) = value else {
        panic!("expected object")
    };
    fields
        .iter()
        .find_map(|(name, value)| (name == key).then_some(value))
        .unwrap_or_else(|| panic!("missing {key}"))
}

#[test]
fn qualified_member_decides_among_unknowns_and_result_owner_applies_both_polarities() {
    for (chamfer, kind) in [
        (true, EdgeTreatmentKind::PlanarChamfer),
        (false, EdgeTreatmentKind::CylindricalFillet),
    ] {
        let unknown = EdgeTreatmentDisposition::Unqualified(EdgeTreatmentReason::UnsupportedTrim);
        let qualified = EdgeTreatmentDisposition::Qualified(Box::new(certificate(kind, 2.0)));
        let inventory = if chamfer {
            let mut inventory = inventory(
                EdgeTreatmentLabel::Unique("edge-A".into()),
                qualified,
                unknown,
            );
            inventory.rows[0].chamfer =
                EdgeTreatmentDisposition::Unqualified(EdgeTreatmentReason::UnsupportedSurface);
            inventory
        } else {
            let mut inventory = inventory(
                EdgeTreatmentLabel::Unique("edge-A".into()),
                unknown,
                qualified,
            );
            inventory.rows[0].fillet =
                EdgeTreatmentDisposition::Unqualified(EdgeTreatmentReason::UnsupportedSurface);
            inventory
        };
        let prepared = prepared_feature(chamfer, 2.125, Some("edge-A"));
        let subject = subject(EdgeTreatmentBrep::new(inventory));
        for polarity in [Polarity::Positive, Polarity::Negative] {
            let (evaluation, used) = evaluate_subject(&prepared, &subject, 10);
            assert_eq!(used, 10);
            let result = finish(
                "edge-treatment",
                prepared.capability(),
                polarity,
                evaluation,
            )
            .unwrap();
            assert_eq!(
                json_field(&result, "status"),
                &Json::string(if polarity == Polarity::Positive {
                    "passed"
                } else {
                    "failed"
                })
            );
        }
    }
}

#[test]
fn unresolved_membership_or_required_label_refuses_without_turning_unknown_into_absence() {
    let cases = [
        inventory(
            EdgeTreatmentLabel::Unique("edge-A".into()),
            EdgeTreatmentDisposition::Unqualified(EdgeTreatmentReason::UnsupportedTrim),
            EdgeTreatmentDisposition::NonMember(EdgeTreatmentReason::OutsideTopology),
        ),
        inventory(
            EdgeTreatmentLabel::Absent,
            EdgeTreatmentDisposition::Qualified(Box::new(certificate(
                EdgeTreatmentKind::PlanarChamfer,
                2.0,
            ))),
            EdgeTreatmentDisposition::NonMember(EdgeTreatmentReason::OutsideTopology),
        ),
        inventory(
            EdgeTreatmentLabel::Ambiguous,
            EdgeTreatmentDisposition::Qualified(Box::new(certificate(
                EdgeTreatmentKind::PlanarChamfer,
                2.0,
            ))),
            EdgeTreatmentDisposition::NonMember(EdgeTreatmentReason::OutsideTopology),
        ),
    ];
    for inventory in cases {
        let prepared = prepared_feature(true, 2.0, Some("edge-A"));
        let subject = subject(EdgeTreatmentBrep::new(inventory));
        for polarity in [Polarity::Positive, Polarity::Negative] {
            let (evaluation, _) = evaluate_subject(&prepared, &subject, 10);
            let result = finish(
                "edge-treatment",
                prepared.capability(),
                polarity,
                evaluation,
            )
            .unwrap();
            assert_eq!(json_field(&result, "status"), &Json::string("refused"));
        }
    }
}

#[test]
fn complete_nonmembership_and_complete_label_mismatch_are_geometric_false() {
    let cases = [
        (
            inventory(
                EdgeTreatmentLabel::Unique("edge-A".into()),
                EdgeTreatmentDisposition::NonMember(EdgeTreatmentReason::OutsideTopology),
                EdgeTreatmentDisposition::NonMember(EdgeTreatmentReason::OutsideTopology),
            ),
            None,
            "geometricMismatch",
        ),
        (
            inventory(
                EdgeTreatmentLabel::Unique("edge-B".into()),
                EdgeTreatmentDisposition::Qualified(Box::new(certificate(
                    EdgeTreatmentKind::PlanarChamfer,
                    2.0,
                ))),
                EdgeTreatmentDisposition::NonMember(EdgeTreatmentReason::OutsideTopology),
            ),
            Some("edge-A"),
            "selectorMismatch",
        ),
    ];
    for (inventory, selection, mismatch_kind) in cases {
        let prepared = prepared_feature(true, 2.0, selection);
        let subject = subject(EdgeTreatmentBrep::new(inventory));
        let (evaluation, _) = evaluate_subject(&prepared, &subject, 10);
        let Evaluation::Geometric {
            positive_satisfied,
            diagnostics,
            evidence,
            ..
        } = evaluation
        else {
            panic!("complete evidence did not produce a geometric result")
        };
        assert!(!positive_satisfied);
        assert_eq!(diagnostics[0].code, "GEOSPEC_FEATURE_MISMATCH");
        assert_eq!(
            json_field(diagnostics[0].details.as_ref().unwrap(), "mismatchKind"),
            &Json::string(mismatch_kind)
        );
        assert_eq!(
            json_field(json_field(&evidence, "witnesses"), "measurementContract").clone(),
            feature_measurement_contract(false)
        );
    }
}

#[test]
fn projection_preserves_equal_occurrences_and_every_nested_certificate_field() {
    let mut preserved = certificate(EdgeTreatmentKind::ToroidalFillet, 2.0);
    preserved.supports[1].transferred_reversed = true;
    let qualified = EdgeTreatmentDisposition::Qualified(Box::new(preserved));
    let mut first = row(
        0,
        EdgeTreatmentLabel::Unique("left/edge".into()),
        EdgeTreatmentDisposition::NonMember(EdgeTreatmentReason::OutsideTopology),
        qualified.clone(),
    );
    first.occurrence = Some(0);
    first.occurrence_path = "left".into();
    let mut second = first.clone();
    second.occurrence = Some(9);
    second.occurrence_path = "later".into();
    second.public_face_ordinal = 7;
    second.private_query_face = 8;
    let inventory = EdgeTreatmentInventory {
        counts: EdgeTreatmentCounts {
            public_face_count: 2,
            candidate_edge_use_count: 2,
        },
        rows: vec![first, second],
    };
    let projected = edge_treatment_inventory_json(&inventory);
    let Json::Array(rows) = json_field(&projected, "rows") else {
        panic!("rows are not an array")
    };
    assert_eq!(rows.len(), 2);
    assert_eq!(json_field(&rows[0], "occurrence"), &Json::Number(0.0));
    assert_eq!(json_field(&rows[1], "occurrence"), &Json::Number(9.0));
    let certificate = json_field(json_field(&rows[0], "fillet"), "certificate");
    assert_eq!(
        json_field(certificate, "kind"),
        &Json::string("toroidalFillet")
    );
    assert_eq!(json_field(certificate, "metricValueMm"), &Json::Number(2.0));
    assert_eq!(
        json_field(certificate, "parameterBounds"),
        &numbers_json([0.125, 1.25, 2.5, 3.75])
    );
    assert_eq!(json_field(certificate, "wireCount"), &Json::Number(1.0));
    assert_eq!(
        json_field(certificate, "maximumTopologyToleranceMm"),
        &Json::Number(0.02)
    );
    assert_eq!(
        json_field(certificate, "materialSide"),
        &Json::string("concave")
    );
    assert_eq!(json_field(certificate, "fullU"), &Json::Bool(false));
    assert_eq!(
        json_field(certificate, "sweepInterval"),
        &numbers_json([0.5, 1.5])
    );
    let Json::Array(supports) = json_field(certificate, "supports") else {
        panic!("supports are not an array")
    };
    assert_eq!(
        json_field(&supports[1], "transferredReversed"),
        &Json::Bool(true)
    );
    let Json::Array(boundary_uses) = json_field(certificate, "boundaryUses") else {
        panic!("boundary uses are not an array")
    };
    assert_eq!(
        json_field(&boundary_uses[0], "role"),
        &Json::string("rail1")
    );
    assert_eq!(
        json_field(&boundary_uses[0], "lengthMm"),
        &Json::Number(9.5)
    );
    assert_eq!(
        json_field(json_field(&boundary_uses[0], "curve"), "kind"),
        &Json::string("ellipse")
    );
    let Json::Array(residuals) = json_field(certificate, "residuals") else {
        panic!("residuals are not an array")
    };
    assert_eq!(
        json_field(&residuals[0], "kind"),
        &Json::string("materialBranch")
    );
    assert_eq!(json_field(&residuals[0], "scaleMm"), &Json::Number(1.5));
    // Independently authored full record: dropping any nested field fails.
    let expected = crate::codec::decode(br#"{
        "kind":"toroidalFillet","metricValueMm":2,
        "surface":{"kind":"torus","center":[1.25,2.5,3.75],"axis":[0,0,1],"majorRadius":4.25,"minorRadius":2},
        "parameterBounds":[0.125,1.25,2.5,3.75],
        "supports":[
            {"publicFaceOrdinal":0,"privateQueryFace":1,"surface":{"kind":"plane","origin":[0,0,0],"normal":[0,0,1]},"parameterBounds":[0,1,2,3],"transferredReversed":false,"maximumTopologyToleranceMm":0.01},
            {"publicFaceOrdinal":1,"privateQueryFace":2,"surface":{"kind":"plane","origin":[1,0,0],"normal":[0,0,1]},"parameterBounds":[0,1,2,3],"transferredReversed":true,"maximumTopologyToleranceMm":0.01}
        ],
        "boundaryUses":[{"owningSolidEdgeOrdinal":5,"wireOrdinal":7,"reversed":true,"seam":false,"role":"rail1","curve":{"kind":"ellipse","center":[4,5,6],"axis":[0,1,0],"majorRadius":8.5,"minorRadius":4.5},"parameterRange":[0.25,0.75],"start":[1,2,3],"end":[4,5,6],"lengthMm":9.5,"edgeToleranceMm":0.015,"vertexTolerancesMm":[0.01,0.02]}],
        "residuals":[{"kind":"materialBranch","valueMm":0.003,"limitMm":0.02,"scaleMm":1.5}],
        "wireCount":1,"maximumTopologyToleranceMm":0.02,"materialSide":"concave","fullU":false,"sweepInterval":[0.5,1.5]
    }"#).unwrap();
    assert_eq!(
        crate::codec::encode(certificate),
        crate::codec::encode(&expected)
    );
}

#[test]
fn analysis_preserves_partial_inventory_shared_with_assertions() {
    let retained = inventory(
        EdgeTreatmentLabel::Absent,
        EdgeTreatmentDisposition::Qualified(Box::new(certificate(
            EdgeTreatmentKind::PlanarChamfer,
            2.0,
        ))),
        EdgeTreatmentDisposition::Unqualified(EdgeTreatmentReason::UnsupportedTrim),
    );
    let expected_topology = edge_treatment_inventory_json(&retained);
    let brep = EdgeTreatmentBrep::new(retained);
    let classifications = Rc::clone(&brep.classifications);
    let retained_subject = subject(brep);
    let subjects = [Rc::clone(&retained_subject)];
    let normalized = Json::Null;
    let budget = Budget::new(11);
    let mut context = EvaluationContext::new(
        &subjects,
        Capability::AnalyzeBrep,
        "analysis",
        &normalized,
        &budget,
        None,
    );
    let Evaluation::Ancillary {
        success,
        value,
        diagnostics,
    } = evaluate_brep(&mut context)
    else {
        panic!("partial analysis must retain its evidence")
    };
    assert!(success);
    assert_eq!(budget.used(), 11);
    assert_eq!(diagnostics.len(), 1);
    assert_eq!(diagnostics[0].code, "GEOSPEC_UNSUPPORTED_EVIDENCE");
    assert_eq!(diagnostics[0].severity, Severity::Warning);
    assert_eq!(
        json_field(&value, "diagnostics"),
        &Json::Array(vec![diagnostics[0].to_json()])
    );
    let report = json_field(&value, "brep");
    assert_eq!(
        json_field(report, "edgeTreatmentTopology"),
        &expected_topology
    );
    let Json::Array(features) = json_field(report, "chamferFeatures") else {
        panic!("feature summaries")
    };
    assert_eq!(features.len(), 1);
    assert_eq!(json_field(&features[0], "distance"), &Json::Number(2.0));
    assert_eq!(
        json_field(report, "filletFeatures"),
        &Json::Array(Vec::new())
    );
    let (evaluation, _) =
        evaluate_subject(&prepared_feature(true, 2.0, None), &retained_subject, 10);
    let Evaluation::Geometric {
        positive_satisfied,
        evidence,
        ..
    } = evaluation
    else {
        panic!("qualified existential member")
    };
    assert!(positive_satisfied);
    assert_eq!(
        json_field(json_field(&evidence, "witnesses"), "edgeTreatmentTopology"),
        &expected_topology
    );
    assert_eq!(classifications.get(), 1);
}

#[test]
fn nominal_filters_preserve_zero_tolerance_and_inclusive_authored_boundary() {
    for (chamfer, kind) in [
        (true, EdgeTreatmentKind::ConicalChamfer),
        (false, EdgeTreatmentKind::ToroidalFillet),
    ] {
        let nonmember = EdgeTreatmentDisposition::NonMember(EdgeTreatmentReason::OutsideTopology);
        let qualified = EdgeTreatmentDisposition::Qualified(Box::new(certificate(kind, 2.0)));
        let retained = if chamfer {
            inventory(EdgeTreatmentLabel::Absent, qualified, nonmember)
        } else {
            inventory(EdgeTreatmentLabel::Absent, nonmember, qualified)
        };
        let retained_subject = subject(EdgeTreatmentBrep::new(retained));
        let adjacent = f64::from_bits(2.0_f64.to_bits() + 1);
        for (value, tolerance, positive) in [
            (adjacent, 0.0, false),
            (adjacent, adjacent - 2.0, true),
            (2.125, 0.125, true),
        ] {
            let expectation = FeatureExpectation {
                value,
                tolerance,
                selection: None,
            };
            let prepared = if chamfer {
                Prepared::ChamferFeature(expectation)
            } else {
                Prepared::FilletFeature(expectation)
            };
            for polarity in [Polarity::Positive, Polarity::Negative] {
                let (evaluation, _) = evaluate_subject(&prepared, &retained_subject, 10);
                let result =
                    finish("nominal", prepared.capability(), polarity, evaluation).unwrap();
                assert_eq!(
                    json_field(&result, "status"),
                    &Json::string(if positive == (polarity == Polarity::Positive) {
                        "passed"
                    } else {
                        "failed"
                    })
                );
                assert_eq!(
                    json_field(json_field(&result, "evidence"), "normalizedExpected"),
                    &prepared.expected_json()
                );
            }
        }
    }
}

#[test]
fn cold_and_warm_claims_replay_logical_debits_but_share_successful_source_calls() {
    let retained_inventory = inventory(
        EdgeTreatmentLabel::Unique("edge-A".into()),
        EdgeTreatmentDisposition::Qualified(Box::new(certificate(
            EdgeTreatmentKind::PlanarChamfer,
            2.0,
        ))),
        EdgeTreatmentDisposition::NonMember(EdgeTreatmentReason::OutsideTopology),
    );
    let brep = EdgeTreatmentBrep::new(retained_inventory);
    let counters = (
        Rc::clone(&brep.reports),
        Rc::clone(&brep.counts),
        Rc::clone(&brep.classifications),
    );
    let retained_subject = subject(brep);
    let prepared = prepared_feature(true, 2.0, None);
    for _ in 0..2 {
        let (evaluation, used) = evaluate_subject(&prepared, &retained_subject, 10);
        assert!(matches!(
            evaluation,
            Evaluation::Geometric {
                positive_satisfied: true,
                ..
            }
        ));
        assert_eq!(used, 10);
    }
    assert_eq!(counters.0.get(), 1);
    assert_eq!(counters.1.get(), 1);
    assert_eq!(counters.2.get(), 1);

    let brep = EdgeTreatmentBrep::new(inventory(
        EdgeTreatmentLabel::Unique("edge-A".into()),
        EdgeTreatmentDisposition::Qualified(Box::new(certificate(
            EdgeTreatmentKind::PlanarChamfer,
            2.0,
        ))),
        EdgeTreatmentDisposition::NonMember(EdgeTreatmentReason::OutsideTopology),
    ));
    let classifications = Rc::clone(&brep.classifications);
    let subject = subject(brep);
    let (evaluation, used) = evaluate_subject(&prepared, &subject, 2);
    assert!(matches!(evaluation, Evaluation::Refused { .. }));
    assert_eq!(used, 10);
    assert_eq!(classifications.get(), 0);
}
