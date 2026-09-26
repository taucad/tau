//! M6 (PERF-OUTPUT-01): the product-selected bounded evidence profile of the
//! mesh family, and its plan option. The complete profile's bytes are pinned
//! by `matcher_mesh::projected_mesh_family_results_keep_their_bytes`.
use std::rc::Rc;

use super::*;
use crate::{
    analysis::{
        batch::BatchAnalysis,
        mesh::{MeshAnalysisRecord, Primitive},
    },
    backend::AnalysisRetentionLimits,
    budget::Budget,
    codec::{decode, encode},
    prepared::plan::PreparedPlan,
    protocol::EvidenceProfile,
    subject::{EvaluationContext, Subject, SubjectFormat},
};

fn payload(kind: &str, expected: Json) -> Json {
    Json::object([("kind", Json::string(kind)), ("expected", expected)])
}

/// A unit box at `x`, as primitive `name` starting at `start`.
fn cube(record: &mut MeshAnalysisRecord, x: f64, name: &str) {
    let start = record.positions.len() as u32;
    for corner in 0..8_u32 {
        record.positions.push([
            x + f64::from(corner & 1),
            f64::from((corner >> 1) & 1),
            f64::from((corner >> 2) & 1),
        ]);
    }
    let primitive = record.primitives.len() as u32;
    for triangle in [
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
    ] {
        record.triangles.push(triangle.map(|index| index + start));
        record.triangle_primitives.push(primitive);
    }
    record.primitives.push(Primitive {
        name: name.into(),
        vertex_start: start,
        vertex_count: 8,
    });
}

fn cubes(offsets: &[f64]) -> MeshAnalysisRecord {
    let mut record = MeshAnalysisRecord {
        positions: Vec::new(),
        triangles: Vec::new(),
        triangle_primitives: Vec::new(),
        primitives: Vec::new(),
    };
    for (index, x) in offsets.iter().enumerate() {
        cube(&mut record, *x, &format!("part{index}#0"));
    }
    record
}

fn limits(max_mesh_bytes: u64) -> AnalysisRetentionLimits {
    AnalysisRetentionLimits {
        max_mesh_bytes,
        max_mesh_entries: 1,
        max_solid_entries: 0,
    }
}

/// One claim's finished result under `profile`.
fn run(
    record: MeshAnalysisRecord,
    capability: Capability,
    payload: Json,
    profile: EvidenceProfile,
    max_mesh_bytes: u64,
) -> Json {
    let prepared = prepare(capability, &payload).unwrap();
    let subject = Subject::new("m6".into(), SubjectFormat::MeshBufferV1, "mm".into());
    subject.mesh_record.set(Rc::new(record)).unwrap();
    let subjects = [Rc::new(subject)];
    let batch = BatchAnalysis::new(
        prepared
            .demand()
            .connected_components_tolerance_bits
            .map(|bits| (subjects[0].cache_identity().unwrap(), bits)),
        limits(max_mesh_bytes),
    )
    .unwrap();
    let normalized = prepared.normalized_payload();
    let budget = Budget::new(10_000_000);
    let mut context =
        EvaluationContext::new(&subjects, capability, "m6", &normalized, &budget, None)
            .with_batch(&batch)
            .with_evidence_profile(profile);
    let evaluation = evaluate(&prepared, &mut context);
    crate::result::finish(
        "m6",
        capability,
        crate::result::Polarity::Positive,
        evaluation,
    )
    .unwrap()
}

fn get<'a>(value: &'a Json, path: &[&str]) -> Option<&'a Json> {
    path.iter().try_fold(value, |value, key| match value {
        Json::Object(fields) => fields
            .iter()
            .find(|(name, _)| name == key)
            .map(|(_, value)| value),
        _ => None,
    })
}

fn length(value: &Json, path: &[&str]) -> Option<usize> {
    match get(value, path)? {
        Json::Array(values) => Some(values.len()),
        _ => None,
    }
}

fn components(count: f64) -> Json {
    payload(
        "connectedComponents",
        Json::object([
            ("count", Json::Number(count)),
            ("toleranceMm", Json::Number(0.0)),
        ]),
    )
}

#[test]
fn bounded_components_keep_clusters_and_drop_gaps_only_on_success() {
    let offsets = [0.0, 2.0, 5.0];
    let complete = run(
        cubes(&offsets),
        Capability::ToHaveConnectedComponents,
        components(3.0),
        EvidenceProfile::Complete,
        1_000_000,
    );
    let bounded = run(
        cubes(&offsets),
        Capability::ToHaveConnectedComponents,
        components(3.0),
        EvidenceProfile::Bounded,
        1_000_000,
    );
    assert_eq!(get(&bounded, &["status"]), Some(&Json::string("passed")));
    assert_eq!(
        length(&complete, &["evidence", "witnesses", "gaps"]),
        Some(3)
    );
    assert_eq!(get(&bounded, &["evidence", "witnesses", "gaps"]), None);
    assert_eq!(
        encode(get(&bounded, &["evidence", "witnesses", "clusters"]).unwrap()).unwrap(),
        encode(get(&complete, &["evidence", "witnesses", "clusters"]).unwrap()).unwrap()
    );

    // A failure emits each cluster's nearest neighbour: 0-1 and 1-2 here.
    let failed = run(
        cubes(&offsets),
        Capability::ToHaveConnectedComponents,
        components(1.0),
        EvidenceProfile::Bounded,
        1_000_000,
    );
    assert_eq!(get(&failed, &["status"]), Some(&Json::string("failed")));
    let gaps = get(&failed, &["evidence", "witnesses", "gaps"]).unwrap();
    let Json::Array(gaps) = gaps else {
        panic!("gaps")
    };
    let labels: Vec<_> = gaps
        .iter()
        .map(|gap| {
            let text = |key| match get(gap, &[key]) {
                Some(Json::String(value)) => value.clone(),
                _ => panic!("gap label"),
            };
            (text("fromLabel"), text("toLabel"))
        })
        .collect();
    assert_eq!(
        labels,
        [
            ("part0".into(), "part1".into()),
            ("part1".into(), "part2".into())
        ]
    );
    let Some(Json::Array(diagnostics)) = get(&failed, &["diagnostics"]) else {
        panic!("diagnostics")
    };
    assert_eq!(
        encode(get(&diagnostics[0], &["details", "gaps"]).unwrap()).unwrap(),
        encode(&Json::Array(gaps.clone())).unwrap()
    );
}

#[test]
fn bounded_components_answer_where_complete_gaps_exceed_retention() {
    let offsets: Vec<f64> = (0..400).map(|index| f64::from(index) * 2.0).collect();
    let complete = run(
        cubes(&offsets),
        Capability::ToHaveConnectedComponents,
        components(400.0),
        EvidenceProfile::Complete,
        1_000_000,
    );
    assert_eq!(get(&complete, &["status"]), Some(&Json::string("refused")));
    let bounded = run(
        cubes(&offsets),
        Capability::ToHaveConnectedComponents,
        components(400.0),
        EvidenceProfile::Bounded,
        1_000_000,
    );
    assert_eq!(get(&bounded, &["status"]), Some(&Json::string("passed")));
    assert_eq!(
        length(&bounded, &["evidence", "witnesses", "clusters"]),
        Some(400)
    );
}

#[test]
fn nearest_gaps_are_each_clusters_first_minimum_of_the_complete_list() {
    // Deterministic scatter: overlapping, touching and distant clusters.
    let mut seed = 0x2545_f491_4f6c_dd1d_u64;
    let mut next = move || {
        seed ^= seed << 13;
        seed ^= seed >> 7;
        seed ^= seed << 17;
        (seed % 1000) as f64 / 100.0
    };
    for size in [1_usize, 2, 3, 17, 60] {
        let clusters: Vec<ClusterReport> = (0..size)
            .map(|index| {
                let primitives: Vec<PrimitiveRecord> = (0..1 + index % 3)
                    .map(|part| {
                        let min = [next(), next(), next()];
                        PrimitiveRecord {
                            name: format!("c{index}p{part}"),
                            color: None,
                            vertices: 3,
                            aabb: Aabb {
                                min,
                                max: min.map(|value| value + 0.5),
                            },
                        }
                    })
                    .collect();
                ClusterReport {
                    label: format!("c{index}"),
                    aabb: primitives[0].aabb,
                    centroid: [0.0; 3],
                    total_vertices: 3,
                    primitives,
                }
            })
            .collect();
        let complete = ConnectedComponents::from_clusters(clusters.clone()).gaps;
        let index = |label: &str| label[1..].parse::<usize>().unwrap();
        let mut nearest: Vec<Option<(f64, usize)>> = vec![None; size];
        for gap in &complete {
            let (from, to) = (index(&gap.from_label), index(&gap.to_label));
            for (current, other) in [(from, to), (to, from)] {
                if nearest[current].is_none_or(|(best, best_index)| {
                    gap.gap_mm.total_cmp(&best).then(other.cmp(&best_index))
                        == std::cmp::Ordering::Less
                }) {
                    nearest[current] = Some((gap.gap_mm, other));
                }
            }
        }
        let mut pairs: Vec<_> = nearest
            .iter()
            .enumerate()
            .filter_map(|(current, best)| {
                best.map(|(_, other)| (current.min(other), current.max(other)))
            })
            .collect();
        pairs.sort_unstable();
        pairs.dedup();
        let expected: Vec<ClusterGap> = complete
            .iter()
            .filter(|gap| pairs.contains(&(index(&gap.from_label), index(&gap.to_label))))
            .cloned()
            .collect();
        let actual = nearest_cluster_gaps(&clusters);
        assert_eq!(actual, expected, "size {size}");
        assert!(actual.len() < size.max(1));
    }
}

#[test]
fn bounded_watertight_drops_per_primitive_rows_only_when_closed() {
    let closed = |profile| {
        run(
            cubes(&[0.0]),
            Capability::ToBeWatertight,
            payload("watertight", Json::Bool(true)),
            profile,
            1_000_000,
        )
    };
    assert!(get(
        &closed(EvidenceProfile::Complete),
        &["evidence", "witnesses", "perPrimitive"]
    )
    .is_some());
    assert!(get(
        &closed(EvidenceProfile::Bounded),
        &["evidence", "witnesses", "perPrimitive"]
    )
    .is_none());
    let mut open = cubes(&[0.0]);
    open.triangles.pop();
    open.triangle_primitives.pop();
    let open = run(
        open,
        Capability::ToBeWatertight,
        payload("watertight", Json::Bool(true)),
        EvidenceProfile::Bounded,
        1_000_000,
    );
    assert_eq!(get(&open, &["status"]), Some(&Json::string("failed")));
    assert!(get(&open, &["evidence", "witnesses", "perPrimitive"]).is_some());
}

#[test]
fn bounded_integrity_finds_duplicate_faces_only_when_declared() {
    let mut duplicated = cubes(&[0.0]);
    duplicated.triangles.push([2, 1, 0]);
    duplicated.triangle_primitives.push(0);
    let integrity = |expected: Json, profile| {
        run(
            duplicated.clone(),
            Capability::ToHaveMeshIntegrity,
            payload("meshIntegrity", expected),
            profile,
            1_000_000,
        )
    };
    let finite = || Json::object([("triangleCount", Json::Number(12.0))]);
    let complete = integrity(finite(), EvidenceProfile::Complete);
    assert_eq!(
        get(&complete, &["evidence", "measured", "duplicateFaceCount"]),
        Some(&Json::Number(1.0))
    );
    let bounded = integrity(finite(), EvidenceProfile::Bounded);
    assert_eq!(
        get(&bounded, &["evidence", "measured", "duplicateFaceCount"]),
        None
    );
    assert_eq!(
        get(&bounded, &["evidence", "witnesses", "duplicateFaces"]),
        None
    );
    let Some(Json::Array(diagnostics)) = get(&bounded, &["diagnostics"]) else {
        panic!("diagnostics")
    };
    assert_eq!(get(&diagnostics[0], &["details", "duplicateFaces"]), None);
    let declared = integrity(
        Json::object([(
            "duplicateFaces",
            Json::object([("maxCount", Json::Number(0.0))]),
        )]),
        EvidenceProfile::Bounded,
    );
    assert_eq!(
        get(&declared, &["evidence", "measured", "duplicateFaceCount"]),
        Some(&Json::Number(1.0))
    );
    assert_eq!(
        length(&declared, &["evidence", "witnesses", "duplicateFaces"]),
        Some(1)
    );
}

#[test]
fn plans_name_only_the_bounded_evidence_profile() {
    let plan = |profile: Option<&str>| {
        let mut text = String::from(
            r#"{"subjects":[{"slot":"part","contentHash":"0000000000000000000000000000000000000000000000000000000000000000"}],"claims":[{"claimId":"c","capability":"toBeWatertight","subjectSlots":["part"],"payload":{"kind":"watertight","expected":true},"polarity":"positive","workUnitBudget":10}]"#,
        );
        if let Some(profile) = profile {
            text.push_str(&format!(r#","evidenceProfile":"{profile}""#));
        }
        text.push('}');
        PreparedPlan::prepare(&decode(text.as_bytes()).unwrap())
            .map(|plan| String::from_utf8(encode(&plan.normalized_plan()).unwrap()).unwrap())
    };
    let default = plan(None).unwrap();
    assert!(!default.contains("evidenceProfile"));
    assert_eq!(plan(Some("complete")).unwrap(), default);
    assert!(plan(Some("bounded"))
        .unwrap()
        .contains(r#""evidenceProfile":"bounded""#));
    assert!(plan(Some("partial")).is_err());
}
