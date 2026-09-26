//! PERF-DEMAND-01 report facets: mesh demands never wait on report facts.

use std::cell::Cell;

use super::*;
use crate::backend::brep::{
    BrepIdentityProfile, EdgeFacts, PointState, TopologyCounts, ValidityFacts,
};

#[derive(Default)]
struct Calls {
    combined: Cell<usize>,
    mesh: Cell<usize>,
    facts: Cell<usize>,
}

/// `facets == false` is a connector that only reports the combined bundle.
struct FacetBrep {
    facets: bool,
    fail_mesh: bool,
    fail_facts: bool,
    calls: Rc<Calls>,
}

fn bump(cell: &Cell<usize>) {
    cell.set(cell.get() + 1);
}

fn failure(fail: bool, facet: &str) -> Result<(), BackendError> {
    if fail {
        return Err(BackendError {
            kind: BackendErrorKind::Unsupported,
            message: format!("deliberate {facet} failure"),
        });
    }
    Ok(())
}

fn cube() -> Rc<TriangleMesh> {
    let positions = (0..8)
        .map(|corner| [0, 1, 2].map(|axis| f64::from((corner >> axis) & 1)))
        .collect();
    let triangles = vec![
        [0, 2, 1],
        [1, 2, 3],
        [4, 5, 6],
        [5, 7, 6],
        [0, 1, 4],
        [1, 5, 4],
        [2, 6, 3],
        [3, 6, 7],
        [0, 4, 2],
        [2, 4, 6],
        [1, 3, 5],
        [3, 7, 5],
    ];
    Rc::new(TriangleMesh {
        positions,
        triangles,
    })
}

fn bundle(mesh: Rc<TriangleMesh>) -> ReportedBrepBundle {
    ReportedBrepBundle {
        facts: Rc::new(DocumentFacts {
            source_length_unit: "millimetre".into(),
            source_unit_to_millimeters: 1.0,
            products: Vec::new(),
            occurrences: Vec::new(),
            shape: crate::backend::brep::ShapeFacts {
                valid: true,
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
            faces: Vec::new(),
            pmi: Vec::new(),
            subshapes: Vec::new(),
            datum_placements: Vec::new(),
            semantic_datums: Vec::new(),
        }),
        whole_faces: Rc::from(Vec::new()),
        occurrence_faces: Vec::new(),
        mesh,
    }
}

impl BrepSubject for FacetBrep {
    fn reported_facts_and_mesh(&self) -> Result<ReportedBrepBundle, BackendError> {
        bump(&self.calls.combined);
        failure(self.fail_mesh, "mesh")?;
        failure(self.fail_facts, "facts")?;
        Ok(bundle(cube()))
    }

    fn reported_mesh(&self) -> Result<Option<Rc<TriangleMesh>>, BackendError> {
        if !self.facets {
            return Ok(None);
        }
        bump(&self.calls.mesh);
        failure(self.fail_mesh, "mesh")?;
        Ok(Some(cube()))
    }

    fn reported_facts(&self, mesh: Rc<TriangleMesh>) -> Result<ReportedBrepBundle, BackendError> {
        bump(&self.calls.facts);
        failure(self.fail_facts, "facts")?;
        Ok(bundle(mesh))
    }

    fn facts(&self) -> Result<Rc<DocumentFacts>, BackendError> {
        unreachable!()
    }
    fn faces(&self) -> Result<Rc<[LocatedFace]>, BackendError> {
        unreachable!()
    }
    fn occurrence_faces(&self, _: u32) -> Result<Rc<[LocatedFace]>, BackendError> {
        unreachable!()
    }
    fn occurrence_edges(&self, _: u32) -> Result<Rc<[EdgeFacts]>, BackendError> {
        unreachable!()
    }
    fn validity(&self) -> Result<Rc<ValidityFacts>, BackendError> {
        unreachable!()
    }
    fn classify_face_points(
        &self,
        _: BrepEntity,
        _: &[[f64; 3]],
        _: f64,
    ) -> Result<Vec<PointState>, BackendError> {
        unreachable!()
    }
    fn tessellate(
        &self,
        _: BrepEntity,
        _: TessellationProfile,
    ) -> Result<Rc<TriangleMesh>, BackendError> {
        unreachable!()
    }
}

fn subject(brep: FacetBrep) -> Rc<Subject> {
    let identity = SubjectIdentity::step(
        b"report-facet-unit-control",
        "millimetre",
        1.0,
        BrepIdentityProfile {
            ingest_profile: "typed-report-unit-v1",
            backend_profile: "typed-brep-unit-v1",
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

/// One claim on a fresh context: the charged units and the refusal message.
fn claim(subjects: &[Rc<Subject>], mesh: bool) -> (u64, Option<String>) {
    let budget = Budget::new(10_000);
    let expected = Json::Null;
    let mut context = EvaluationContext::new(
        subjects,
        Capability::ToBeWatertight,
        "facet",
        &expected,
        &budget,
        None,
    );
    let result = if mesh {
        context.charge_mesh_demand()
    } else {
        context.brep_facts().map(drop)
    };
    let refusal = match result {
        Ok(()) => None,
        Err(Evaluation::Refused { diagnostics }) => Some(diagnostics[0].message.clone()),
        Err(_) => panic!("report demands refuse, never evaluate"),
    };
    (budget.used(), refusal)
}

/// Runs [mesh, facts] or [facts, mesh] claims and returns both outcomes in
/// [mesh, facts] order.
fn run(brep: FacetBrep, mesh_first: bool) -> ([(u64, Option<String>); 2], Rc<Subject>) {
    let subjects = [subject(brep)];
    let first = claim(&subjects, mesh_first);
    let second = claim(&subjects, !mesh_first);
    let outcomes = if mesh_first {
        [first, second]
    } else {
        [second, first]
    };
    let [subject] = subjects;
    (outcomes, subject)
}

fn brep(facets: bool, fail_mesh: bool, fail_facts: bool) -> (FacetBrep, Rc<Calls>) {
    let calls = Rc::new(Calls::default());
    let brep = FacetBrep {
        facets,
        fail_mesh,
        fail_facts,
        calls: Rc::clone(&calls),
    };
    (brep, calls)
}

// One brep unit, then 36 soup positions plus 3 per triangle.
const MESH_UNITS: u64 = 1 + 36 + 36;

#[test]
fn facts_failure_no_longer_refuses_mesh_claims_in_either_order() {
    let facts_refusal = Some("deliberate facts failure".to_owned());
    for mesh_first in [true, false] {
        let (facets, _) = brep(true, false, true);
        let (outcomes, subject) = run(facets, mesh_first);
        assert_eq!(outcomes, [(MESH_UNITS, None), (1, facts_refusal.clone())]);
        assert!(subject.mesh_record().is_some());

        // A connector with only the combined report keeps the prior coupling.
        let (combined, _) = brep(false, false, true);
        let (outcomes, subject) = run(combined, mesh_first);
        assert_eq!(
            outcomes,
            [(1, facts_refusal.clone()), (1, facts_refusal.clone())]
        );
        assert!(subject.mesh_record().is_none());
    }
}

#[test]
fn mesh_failure_refuses_both_facets_in_either_order() {
    let refusal = Some("deliberate mesh failure".to_owned());
    for (facets, mesh_first) in [(true, true), (true, false), (false, true)] {
        let (brep, _) = brep(facets, true, false);
        let (outcomes, subject) = run(brep, mesh_first);
        assert_eq!(outcomes, [(1, refusal.clone()), (1, refusal.clone())]);
        assert!(subject.mesh_record().is_none());
    }
}

#[test]
fn facets_charge_and_retain_like_the_combined_report_with_one_build_each() {
    let (combined, calls) = brep(false, false, false);
    let (expected, subject) = run(combined, true);
    assert_eq!(expected, [(MESH_UNITS, None), (1, None)]);
    let expected_bytes = subject.retained_report_bytes();
    assert!(expected_bytes > 0);
    assert_eq!(calls.combined.get(), 1);

    // Mesh first reports the facets separately; facts first reports both at once.
    for (mesh_first, facet_calls) in [(true, [0, 1, 1]), (false, [1, 0, 0])] {
        let (facets, calls) = brep(true, false, false);
        let (outcomes, subject) = run(facets, mesh_first);
        assert_eq!(outcomes, expected);
        assert_eq!(subject.retained_report_bytes(), expected_bytes);
        let subjects = [subject];
        assert_eq!(claim(&subjects, true), (MESH_UNITS, None));
        assert_eq!(claim(&subjects, false), (1, None));
        assert_eq!(
            [&calls.combined, &calls.mesh, &calls.facts].map(Cell::get),
            facet_calls
        );
    }
}
