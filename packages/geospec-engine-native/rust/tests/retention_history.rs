//! C8 (ruling 12, §16): a retention verdict counts what the current claim
//! phase demands, hit or build, never what earlier claims retained.

use super::*;
use crate::backend::{
    brep::{BrepIdentityProfile, PointState, TopologyCounts, ValidityFacts},
    AnalysisRetentionLimits,
};

const PROFILE: TessellationProfile = TessellationProfile {
    linear_deflection_mm: 0.01,
    angular_deflection_rad: 0.25,
};

/// The report mesh and every occurrence mesh are one unit cube.
struct Cubes;

fn cube() -> TriangleMesh {
    TriangleMesh {
        positions: (0..8)
            .map(|corner| [0, 1, 2].map(|axis| f64::from((corner >> axis) & 1)))
            .collect(),
        triangles: vec![
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
        ],
    }
}

impl BrepSubject for Cubes {
    fn reported_mesh(&self) -> Result<TriangleMesh, BackendError> {
        Ok(cube())
    }
    fn reported_shape(&self) -> Result<ShapeFacts, BackendError> {
        Ok(ShapeFacts {
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
        })
    }
    fn tessellate(
        &self,
        _: BrepEntity,
        _: TessellationProfile,
    ) -> Result<Rc<TriangleMesh>, BackendError> {
        Ok(Rc::new(cube()))
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
}

fn subject(max_mesh_bytes: u64, max_mesh_entries: u32) -> Subject {
    let identity = SubjectIdentity::step(
        b"retention-history-unit-control",
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
    subject.brep = Some(Box::new(Cubes));
    subject.retention_limits = AnalysisRetentionLimits {
        max_mesh_bytes,
        max_mesh_entries,
        max_solid_entries: 256,
    };
    subject
}

/// One claim phase: the report mesh when `report`, then each occurrence's
/// mesh in order. The first refusal ends the phase.
fn phase(subject: &Subject, report: bool, occurrences: &[u32]) -> Result<(), String> {
    subject.begin_demand_phase();
    if report {
        subject.report_mesh().map_err(|error| error.message)?;
    }
    for &occurrence in occurrences {
        subject
            .tessellate(BrepEntity::Occurrence(occurrence), PROFILE)
            .map_err(|error| error.message)?;
    }
    Ok(())
}

#[test]
fn a_claim_phase_verdict_is_the_same_cold_and_after_retaining_claims() {
    let probe = subject(u64::MAX, u32::MAX);
    phase(&probe, true, &[0]).unwrap();
    let report = *probe.report_mesh_bytes.get().unwrap();
    let mesh = probe.tessellations.borrow()[0].bytes;

    // Every phase also counts the fixed continuous-cell table.
    let fixed = probe.continuous_owned_bytes();

    // Bytes: the claim's two meshes fit; earlier retention beside them would not.
    let limit = (2 * mesh).max(report) + fixed;
    for retained in [(true, &[][..]), (false, &[5, 6][..])] {
        let cold = subject(limit, 256);
        let warm = subject(limit, 256);
        phase(&warm, retained.0, retained.1).unwrap();
        assert_eq!(phase(&warm, false, &[0, 1]), phase(&cold, false, &[0, 1]));
        assert_eq!(phase(&cold, false, &[0, 1]), Ok(()));
    }

    // Entries: the report mesh and other claims' meshes are not this claim's.
    for retained in [(true, &[][..]), (false, &[5][..])] {
        let cold = subject(u64::MAX, 2);
        let warm = subject(u64::MAX, 2);
        phase(&warm, retained.0, retained.1).unwrap();
        assert_eq!(phase(&warm, false, &[0, 1]), Ok(()));
        assert_eq!(phase(&cold, false, &[0, 1]), Ok(()));
    }
}

#[test]
fn a_claim_phase_refuses_on_its_own_demand_hits_included() {
    let refusal: Result<(), String> =
        Err("Tessellation demands exceed the declared analysis retention entry limit.".into());
    let cold = subject(u64::MAX, 2);
    // N = max meshes are accepted; the next distinct demand is refused.
    assert_eq!(phase(&cold, false, &[0, 1]), Ok(()));
    assert_eq!(phase(&cold, false, &[0, 1, 2]), refusal);
    // A retained mesh this phase reuses still counts as its demand.
    let warm = subject(u64::MAX, 2);
    phase(&warm, false, &[0]).unwrap();
    assert_eq!(phase(&warm, false, &[0, 1, 0, 2]), refusal);
    // The report mesh counts only when this phase demands it.
    let report = subject(u64::MAX, 2);
    assert_eq!(phase(&report, true, &[0, 1]), refusal);
}

#[test]
fn a_claim_phase_counts_only_the_facts_cells_it_demands() {
    // F1 x C8: one facts cell per demanded part set, each counted only in the
    // phases that hit or build it, never because an earlier claim kept it.
    let probe = subject(u64::MAX, u32::MAX);
    phase(&probe, false, &[0]).unwrap();
    let mesh = probe.tessellations.borrow()[0].bytes;
    let fixed = probe.continuous_owned_bytes();
    let cell = size_of::<ShapeFacts>() as u64;
    let claim = |subject: &Subject| {
        subject.begin_demand_phase();
        subject
            .report_shape(ShapeParts::VOLUME)
            .map_err(|error| error.message)?;
        subject
            .tessellate(BrepEntity::Occurrence(0), PROFILE)
            .map(drop)
            .map_err(|error| error.message)
    };
    // Room for the claim's one cell and one mesh, not for other part sets.
    let cold = subject(mesh + cell + fixed, 256);
    let warm = subject(mesh + cell + fixed, 256);
    for parts in [ShapeParts::BOUNDS, ShapeParts::COUNTS, ShapeParts::AREA] {
        warm.begin_demand_phase();
        warm.report_shape(parts).unwrap();
    }
    assert_eq!(claim(&warm), claim(&cold));
    assert_eq!(claim(&cold), Ok(()));
    assert_eq!(warm.demanded_report_bytes(), cell);
}
