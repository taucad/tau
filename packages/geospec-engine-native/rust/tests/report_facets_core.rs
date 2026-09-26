//! PERF-DEMAND-01 report facets: mesh demands never wait on report facts,
//! facts demands never wait on the report mesh (F1), and the report mesh is
//! retained once, as the analysis record (F9).

use std::cell::Cell;

use super::*;
use crate::backend::brep::{
    BrepIdentityProfile, PointState, ReportedFaces, TopologyCounts, ValidityFacts,
};

#[derive(Default)]
struct Calls {
    mesh: Cell<usize>,
    facts: Cell<usize>,
    faces: Cell<usize>,
}

struct FacetBrep {
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

fn shape() -> ShapeFacts {
    ShapeFacts {
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
    }
}

impl BrepSubject for FacetBrep {
    fn step_subject_metadata(
        &self,
    ) -> Result<Option<crate::backend::brep::StepSubjectMetadata>, BackendError> {
        Ok(Some(crate::backend::brep::StepSubjectMetadata {
            schema: None,
            source_byte_length: 0,
            free_shape_count: 0,
            native_read_stream: true,
        }))
    }

    fn reported_mesh(&self) -> Result<TriangleMesh, BackendError> {
        bump(&self.calls.mesh);
        failure(self.fail_mesh, "mesh")?;
        Ok(cube().as_ref().clone())
    }

    // F1: the facts read the source, so no mesh failure reaches them.
    fn reported_shape(&self) -> Result<ShapeFacts, BackendError> {
        bump(&self.calls.facts);
        failure(self.fail_facts, "facts")?;
        Ok(shape())
    }

    // Face tables read the source: no generation, so no mesh failure.
    fn reported_faces(&self, _: bool) -> Result<ReportedFaces, BackendError> {
        bump(&self.calls.faces);
        Ok(ReportedFaces {
            whole_faces: Rc::from(Vec::new()),
            occurrence_faces: Vec::new(),
        })
    }

    fn source_occurrences(
        &self,
    ) -> Result<Rc<[crate::backend::brep::OccurrenceFacts]>, BackendError> {
        Ok(Rc::from(Vec::new()))
    }

    fn document_rows(&self) -> Result<crate::backend::brep::DocumentRows, BackendError> {
        Ok(crate::backend::brep::DocumentRows::default())
    }

    fn faces(&self) -> Result<Rc<[LocatedFace]>, BackendError> {
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
    Rc::new(step_subject(brep))
}

fn step_subject(brep: FacetBrep) -> Subject {
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
    subject
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
        context.brep_shape().map(drop)
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

fn brep(fail_mesh: bool, fail_facts: bool) -> (FacetBrep, Rc<Calls>) {
    let calls = Rc::new(Calls::default());
    let brep = FacetBrep {
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
        let (facets, _) = brep(false, true);
        let (outcomes, subject) = run(facets, mesh_first);
        assert_eq!(outcomes, [(MESH_UNITS, None), (1, facts_refusal.clone())]);
        assert!(subject.mesh_record().is_some());
    }
}

#[test]
fn mesh_failure_no_longer_refuses_facts_claims_in_either_order() {
    // F1: the facts come from the source shape, not the copy+mesh generation.
    let refusal = Some("deliberate mesh failure".to_owned());
    for mesh_first in [true, false] {
        let (brep, _) = brep(true, false);
        let (outcomes, subject) = run(brep, mesh_first);
        assert_eq!(outcomes, [(1, refusal.clone()), (1, None)]);
        assert!(subject.mesh_record().is_none());
    }
}

#[test]
fn facts_claims_answer_over_the_report_mesh_limits_that_refuse_mesh_claims() {
    // F1 under ruling 9: the report-mesh limits bound the mesh facet alone.
    let limit = "The report bundle exceeds the declared binary or retained derived-data limits.";
    let (brep, calls) = brep(false, false);
    let mut subject = step_subject(brep);
    // The cube soup has 12 triangles.
    subject.binary_limits.max_triangles = 11;
    let subjects = [Rc::new(subject)];
    for capability in [
        Capability::ToHaveVolume,
        Capability::ToHaveTopologyCounts,
        Capability::ToHaveBoundingBox,
    ] {
        let budget = Budget::new(10_000);
        let expected = Json::Null;
        let mut context =
            EvaluationContext::new(&subjects, capability, "facts", &expected, &budget, None);
        assert_eq!(context.brep_shape().ok().flatten(), Some(&shape()));
    }
    assert_eq!(claim(&subjects, true), (1, Some(limit.to_owned())));
    let budget = Budget::new(10_000);
    let expected = Json::Null;
    let mut context = EvaluationContext::new(
        &subjects,
        Capability::AnalyzeMesh,
        "mesh",
        &expected,
        &budget,
        None,
    );
    match crate::matchers::mesh::analyze_mesh(&mut context) {
        Evaluation::Refused { diagnostics } => assert_eq!(diagnostics[0].message, limit),
        _ => panic!("analyzeMesh must refuse over the report-mesh limits"),
    }
    assert!(subjects[0].mesh_record().is_none());
    // One facts cell per demanded part set; the mesh is built twice, refused.
    assert_eq!([&calls.mesh, &calls.facts].map(Cell::get), [2, 3]);
}

#[test]
fn facts_demands_build_no_mesh_record_and_each_facet_builds_once() {
    {
        let (brep, calls) = brep(false, false);
        let subjects = [subject(brep)];
        assert_eq!(claim(&subjects, false), (1, None));
        assert!(subjects[0].mesh_record().is_none());
        let facts_bytes = subjects[0].retained_report_bytes();
        assert_eq!(claim(&subjects, true), (MESH_UNITS, None));
        assert_eq!(claim(&subjects, false), (1, None));
        assert_eq!(claim(&subjects, true), (MESH_UNITS, None));
        // The record alone is charged: 88 B per triangle (ruling 14).
        let record = (12 * 88
            + size_of::<MeshAnalysisRecord>()
            + size_of::<Primitive>()
            + subjects[0].display_name.len()
            + 2) as u64;
        assert_eq!(subjects[0].retained_report_bytes(), facts_bytes + record);
        assert_eq!([&calls.mesh, &calls.facts].map(Cell::get), [1, 1]);
    }
}

#[test]
fn a_report_soup_moves_into_its_record_and_other_meshes_expand() {
    let soup = TriangleMesh {
        positions: vec![[0.0, 0.0, 0.0], [1.0, 0.0, 0.0], [0.0, 1.0, 0.0]],
        triangles: vec![[0, 1, 2]],
    };
    let buffer = soup.positions.as_ptr();
    let record = report_mesh_record(soup, "soup").unwrap();
    assert_eq!(record.positions.as_ptr(), buffer);
    assert_eq!(record.triangles, vec![[0, 1, 2]]);

    let indexed = cube().as_ref().clone();
    let expanded = indexed
        .triangles
        .iter()
        .flat_map(|triangle| triangle.map(|index| indexed.positions[index as usize]))
        .collect::<Vec<_>>();
    let record = report_mesh_record(indexed, "cube").unwrap();
    assert_eq!(record.positions, expanded);
    assert_eq!(record.triangles[11], [33, 34, 35]);
    assert_eq!(record.primitives[0].vertex_count, 36);

    let unrepresentable = TriangleMesh {
        positions: vec![[1e300, 0.0, 0.0], [1.0, 0.0, 0.0], [0.0, 1.0, 0.0]],
        triangles: vec![[0, 1, 2]],
    };
    assert_eq!(
        report_mesh_record(unrepresentable, "far")
            .unwrap_err()
            .message,
        "Report mesh cannot be represented by its declared finite f32 profile."
    );
}

#[test]
fn the_selector_index_reads_facts_facets_without_the_report_mesh() {
    // F8: face tables, occurrences and rows, plus the whole-shape facts of an
    // occurrence-free document; a failing report mesh cannot refuse it.
    let (brep, calls) = brep(true, false);
    let subjects = [subject(brep)];
    assert!(subjects[0].selector_index().unwrap().is_some());
    assert!(subjects[0].mesh_record().is_none());
    assert_eq!(
        [&calls.mesh, &calls.facts, &calls.faces].map(Cell::get),
        [0, 1, 1]
    );
}

#[test]
fn step_analyze_mesh_reads_occurrences_and_rows_without_the_report_facts() {
    // F8: a failing report facts facet cannot refuse analyzeMesh on STEP.
    let (brep, calls) = brep(false, true);
    let subjects = [subject(brep)];
    let budget = Budget::new(10_000);
    let expected = Json::Null;
    let mut context = EvaluationContext::new(
        &subjects,
        Capability::AnalyzeMesh,
        "mesh",
        &expected,
        &budget,
        None,
    );
    let evaluation = crate::matchers::mesh::analyze_mesh(&mut context);
    assert!(matches!(
        evaluation,
        Evaluation::Ancillary { success: true, .. }
    ));
    assert_eq!([&calls.mesh, &calls.facts].map(Cell::get), [1, 0]);
}

#[test]
fn a_measured_face_table_replaces_the_address_table() {
    let (brep, calls) = brep(true, true);
    let subjects = [subject(brep)];
    let subject = &subjects[0];
    subject.report_faces(false).unwrap();
    subject.report_faces(false).unwrap();
    let address = subject.retained_report_bytes();
    subject.report_faces(true).unwrap();
    // A measured table serves both demands and is retained alone.
    subject.report_faces(false).unwrap();
    subject.report_faces(true).unwrap();
    assert_eq!(calls.faces.get(), 2);
    assert_eq!(subject.retained_report_bytes(), address);
}
