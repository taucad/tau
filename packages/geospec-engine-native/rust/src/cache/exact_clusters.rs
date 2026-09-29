//! A complete exact STEP cluster fact, never an assertion verdict.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

use crate::{
    analysis::{
        batch::ExactClusters,
        mesh::{
            exact::{charge, ChargeStage, ChargeStep, ChargeTrace},
            Aabb, ClusterReport, PrimitiveRecord,
        },
    },
    budget::{Budget, BudgetExceeded},
    cache::{EvidenceAddress, OverlapEvidenceCache},
    identity::sha256_hex,
    protocol::{CANONICAL_PROFILE, NUMERIC_PROFILE, PROTOCOL_VERSION, REGISTRY_VERSION},
    subject::Subject,
};

const FAMILY: &str = "native-exact-step-clusters-v1";
const CODEC: &str = "geospec-exact-clusters-json-v1";
const MAX_PAYLOAD_BYTES: usize = 16 * 1024 * 1024;
const MAX_ITEMS: usize = 65_536;
const MAX_STEPS: usize = 4 * 1024 * 1024 / std::mem::size_of::<ChargeStep>();

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Action<'a> {
    schema: &'static str,
    family: &'static str,
    codec: &'static str,
    protocol_version: u32,
    registry_version: u32,
    canonical_profile: &'static str,
    numeric_profile: &'static str,
    partition_profile: &'static str,
    charge_profile: &'static str,
    scope: &'static str,
    subject: serde_json::Value,
    producer: Producer<'a>,
    tolerance_bits: String,
}

#[derive(Serialize)]
struct Producer<'a> {
    core: &'a str,
    brep: &'a str,
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct Payload {
    schema: String,
    family: String,
    codec: String,
    action_sha256: String,
    labels: Vec<String>,
    clusters: Vec<ClusterDto>,
    trace: Vec<StepDto>,
    units: String,
    stage_calls: [String; 6],
    stage_units: [String; 6],
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct ClusterDto {
    label: String,
    primitives: Vec<PrimitiveDto>,
    aabb: BoxDto,
    centroid: [f64; 3],
    total_vertices: u32,
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct PrimitiveDto {
    name: String,
    color: Option<String>,
    vertices: u32,
    aabb: BoxDto,
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct BoxDto {
    min: [f64; 3],
    max: [f64; 3],
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct StepDto {
    units: String,
    pair: Option<[usize; 2]>,
    stage: String,
}

pub(crate) struct Completed {
    pub(crate) clusters: Vec<ClusterReport>,
    pub(crate) labels: Vec<String>,
    pub(crate) trace: Vec<ChargeStep>,
}

pub(crate) fn replay(
    completed: &Completed,
    budget: &Budget,
    trace: &mut ChargeTrace,
) -> Result<(), (BudgetExceeded, Option<(usize, usize)>)> {
    for step in &completed.trace {
        charge(budget, step.units).map_err(|exceeded| (exceeded, step.pair))?;
        trace.record(*step);
    }
    Ok(())
}

pub(crate) fn address(subject: &Subject, tolerance: f64) -> Option<EvidenceAddress> {
    let producer = subject.producer_identity.as_ref()?;
    if producer.core.is_empty()
        || producer.brep.is_empty()
        || !tolerance.is_finite()
        || tolerance < 0.0
    {
        return None;
    }
    let subject_descriptor =
        serde_json::from_slice(&subject.identity_descriptor_bytes().ok()?).ok()?;
    let producer = Producer {
        core: &producer.core,
        brep: &producer.brep,
    };
    let action = Action {
        schema: "geospec-completed-fact-action-v1",
        family: FAMILY,
        codec: CODEC,
        protocol_version: PROTOCOL_VERSION as u32,
        registry_version: REGISTRY_VERSION as u32,
        canonical_profile: CANONICAL_PROFILE,
        numeric_profile: NUMERIC_PROFILE,
        partition_profile: "exact-step-clusters-v1",
        charge_profile: "exact-step-clusters-ordered-v1",
        scope: "all-admitted-face-owning-leaves",
        subject: subject_descriptor,
        producer,
        tolerance_bits: format!(
            "{:016x}",
            if tolerance == 0.0 {
                0
            } else {
                tolerance.to_bits()
            }
        ),
    };
    let action_bytes = crate::canonicalize(&serde_json::to_vec(&action).ok()?).ok()?;
    let producer_bytes = crate::canonicalize(&serde_json::to_vec(&action.producer).ok()?).ok()?;
    Some(EvidenceAddress {
        action_sha256: sha256_hex(&action_bytes),
        family: FAMILY,
        codec: CODEC,
        producer_profile_sha256: sha256_hex(&producer_bytes),
    })
}

pub(crate) fn load(
    store: &dyn OverlapEvidenceCache,
    address: &EvidenceAddress,
) -> Option<Completed> {
    let bytes = store.load(address)?;
    if bytes.len() > MAX_PAYLOAD_BYTES {
        return None;
    }
    if crate::canonicalize(&bytes).ok()? != bytes {
        return None;
    }
    let payload: Payload = serde_json::from_slice(&bytes).ok()?;
    if payload.schema != "geospec-completed-fact-v1"
        || payload.family != FAMILY
        || payload.codec != CODEC
        || payload.action_sha256 != address.action_sha256
        || payload.trace.len() > MAX_STEPS
        || payload.labels.len() > MAX_ITEMS
        || payload.clusters.len() > MAX_ITEMS
        || payload.clusters.len() > payload.labels.len()
        || payload
            .clusters
            .iter()
            .try_fold(0_usize, |count, cluster| {
                count.checked_add(cluster.primitives.len())
            })?
            > MAX_ITEMS
    {
        return None;
    }
    let units = parse_u64(&payload.units)?;
    let calls: Option<Vec<_>> = payload
        .stage_calls
        .iter()
        .map(|value| parse_u64(value))
        .collect();
    let stage_units: Option<Vec<_>> = payload
        .stage_units
        .iter()
        .map(|value| parse_u64(value))
        .collect();
    let mut counted_calls = [0_u64; 6];
    let mut counted_units = [0_u64; 6];
    let mut trace = Vec::with_capacity(payload.trace.len());
    for step in payload.trace {
        let stage = parse_stage(&step.stage)?;
        let index = stage_index(stage);
        let value = parse_u64(&step.units)?;
        let pair = step.pair.map(|[left, right]| (left, right));
        if pair.is_some_and(|(left, right)| {
            left >= payload.labels.len() || right >= payload.labels.len() || left == right
        }) {
            return None;
        }
        counted_calls[index] = counted_calls[index].checked_add(1)?;
        counted_units[index] = counted_units[index].checked_add(value)?;
        trace.push(ChargeStep {
            units: value,
            pair,
            stage,
        });
    }
    if counted_calls.as_slice() != calls?.as_slice()
        || counted_units.as_slice() != stage_units?.as_slice()
        || counted_units
            .iter()
            .try_fold(0_u64, |sum, value| sum.checked_add(*value))?
            != units
    {
        return None;
    }
    let clusters: Option<Vec<_>> = payload.clusters.into_iter().map(cluster_from_dto).collect();
    let clusters = clusters?;
    if !valid_scope(&payload.labels, &clusters) {
        return None;
    }
    Some(Completed {
        clusters,
        labels: payload.labels,
        trace,
    })
}

pub(crate) fn publish_if_cold(
    store: &dyn OverlapEvidenceCache,
    address: &EvidenceAddress,
    value: &ExactClusters,
    cold_built: bool,
) {
    if !cold_built
        || !value.trace_complete
        || value.trace.len() > MAX_STEPS
        || value.labels.len() > MAX_ITEMS
        || value.clusters.len() > MAX_ITEMS
        || payload_upper_bound(value).is_none_or(|bytes| bytes > MAX_PAYLOAD_BYTES)
    {
        return;
    }
    let payload = Payload {
        schema: "geospec-completed-fact-v1".into(),
        family: FAMILY.into(),
        codec: CODEC.into(),
        action_sha256: address.action_sha256.clone(),
        labels: value.labels.clone(),
        clusters: value.clusters.iter().map(cluster_to_dto).collect(),
        trace: value
            .trace
            .iter()
            .map(|step| StepDto {
                units: step.units.to_string(),
                pair: step.pair.map(|(left, right)| [left, right]),
                stage: stage_name(step.stage).into(),
            })
            .collect(),
        units: value.units.to_string(),
        stage_calls: value.stage_calls.map(|value| value.to_string()),
        stage_units: value.stage_units.map(|value| value.to_string()),
    };
    let Ok(bytes) = serde_json::to_vec(&payload) else {
        return;
    };
    let Ok(bytes) = crate::canonicalize(&bytes) else {
        return;
    };
    if bytes.len() > MAX_PAYLOAD_BYTES {
        return;
    }
    store.publish(address, &bytes);
}

/// Conservative JSON byte bound before any label, primitive or trace clone.
/// A rejected optional fact remains available through ordinary recomputation.
fn payload_upper_bound(value: &ExactClusters) -> Option<usize> {
    let mut bytes = 1024_usize;
    let mut items = 0_usize;
    for label in &value.labels {
        bytes = bytes.checked_add(escaped_string_bound(label)?.checked_add(16)?)?;
    }
    for cluster in &value.clusters {
        bytes = bytes.checked_add(escaped_string_bound(&cluster.label)?.checked_add(512)?)?;
        items = items.checked_add(cluster.primitives.len())?;
        if items > MAX_ITEMS {
            return None;
        }
        for part in &cluster.primitives {
            bytes = bytes.checked_add(escaped_string_bound(&part.name)?.checked_add(256)?)?;
            if let Some(color) = &part.color {
                bytes = bytes.checked_add(escaped_string_bound(color)?)?;
            }
        }
    }
    bytes.checked_add(value.trace.len().checked_mul(160)?)
}

fn escaped_string_bound(value: &str) -> Option<usize> {
    value.len().checked_mul(6)?.checked_add(2)
}

fn parse_u64(value: &str) -> Option<u64> {
    if value.is_empty()
        || (value.len() > 1 && value.starts_with('0'))
        || !value.bytes().all(|byte| byte.is_ascii_digit())
    {
        return None;
    }
    value.parse().ok()
}

fn stage_name(stage: ChargeStage) -> &'static str {
    match stage {
        ChargeStage::BodySetup => "body-setup",
        ChargeStage::Sweep => "sweep",
        ChargeStage::FaceBoxes => "face-boxes",
        ChargeStage::FaceDistance => "face-distance",
        ChargeStage::NestedClassify => "nested-classify",
        ChargeStage::WholeBodyDistance => "whole-body-distance",
    }
}

fn parse_stage(value: &str) -> Option<ChargeStage> {
    Some(match value {
        "body-setup" => ChargeStage::BodySetup,
        "sweep" => ChargeStage::Sweep,
        "face-boxes" => ChargeStage::FaceBoxes,
        "face-distance" => ChargeStage::FaceDistance,
        "nested-classify" => ChargeStage::NestedClassify,
        "whole-body-distance" => ChargeStage::WholeBodyDistance,
        _ => return None,
    })
}

fn stage_index(stage: ChargeStage) -> usize {
    match stage {
        ChargeStage::BodySetup => 0,
        ChargeStage::Sweep => 1,
        ChargeStage::FaceBoxes => 2,
        ChargeStage::FaceDistance => 3,
        ChargeStage::NestedClassify => 4,
        ChargeStage::WholeBodyDistance => 5,
    }
}

fn valid_box(bounds: &BoxDto) -> bool {
    (0..3).all(|axis| {
        bounds.min[axis].is_finite()
            && bounds.max[axis].is_finite()
            && bounds.min[axis] <= bounds.max[axis]
    })
}

fn cluster_from_dto(value: ClusterDto) -> Option<ClusterReport> {
    if !valid_box(&value.aabb)
        || (0..3).any(|axis| {
            !value.centroid[axis].is_finite()
                || value.centroid[axis] < value.aabb.min[axis]
                || value.centroid[axis] > value.aabb.max[axis]
        })
    {
        return None;
    }
    let primitives: Option<Vec<_>> = value
        .primitives
        .into_iter()
        .map(|part| {
            if !valid_box(&part.aabb) {
                return None;
            }
            Some(PrimitiveRecord {
                name: part.name,
                color: part.color,
                vertices: part.vertices,
                aabb: Aabb {
                    min: part.aabb.min,
                    max: part.aabb.max,
                },
            })
        })
        .collect();
    Some(ClusterReport {
        label: value.label,
        primitives: primitives?,
        aabb: Aabb {
            min: value.aabb.min,
            max: value.aabb.max,
        },
        centroid: value.centroid,
        total_vertices: value.total_vertices,
    })
}

fn valid_scope(labels: &[String], clusters: &[ClusterReport]) -> bool {
    let mut remaining = BTreeMap::<&str, usize>::new();
    for label in labels {
        *remaining.entry(label).or_default() += 1;
    }
    for cluster in clusters {
        if cluster.primitives.is_empty()
            || !cluster
                .primitives
                .iter()
                .any(|part| part.name == cluster.label)
            || cluster.total_vertices
                != cluster
                    .primitives
                    .iter()
                    .fold(0_u32, |sum, part| sum.saturating_add(part.vertices))
        {
            return false;
        }
        for part in &cluster.primitives {
            let Some(count) = remaining.get_mut(part.name.as_str()) else {
                return false;
            };
            if *count == 0 {
                return false;
            }
            *count -= 1;
            if (0..3).any(|axis| {
                part.aabb.min[axis] < cluster.aabb.min[axis]
                    || part.aabb.max[axis] > cluster.aabb.max[axis]
            }) {
                return false;
            }
        }
    }
    remaining.values().all(|count| *count == 0)
}

fn cluster_to_dto(value: &ClusterReport) -> ClusterDto {
    ClusterDto {
        label: value.label.clone(),
        primitives: value
            .primitives
            .iter()
            .map(|part| PrimitiveDto {
                name: part.name.clone(),
                color: part.color.clone(),
                vertices: part.vertices,
                aabb: BoxDto {
                    min: part.aabb.min,
                    max: part.aabb.max,
                },
            })
            .collect(),
        aabb: BoxDto {
            min: value.aabb.min,
            max: value.aabb.max,
        },
        centroid: value.centroid,
        total_vertices: value.total_vertices,
    }
}

#[cfg(test)]
mod tests {
    use std::cell::{Cell, RefCell};

    use super::*;

    #[derive(Default)]
    struct MemoryStore {
        bytes: RefCell<Option<Vec<u8>>>,
        writes: Cell<u32>,
    }

    impl OverlapEvidenceCache for MemoryStore {
        fn load(&self, _: &EvidenceAddress) -> Option<Vec<u8>> {
            self.bytes.borrow().clone()
        }

        fn publish(&self, _: &EvidenceAddress, payload: &[u8]) {
            *self.bytes.borrow_mut() = Some(payload.to_vec());
            self.writes.set(self.writes.get() + 1);
        }
    }

    fn address() -> EvidenceAddress {
        EvidenceAddress {
            action_sha256: "11".repeat(32),
            family: FAMILY,
            codec: CODEC,
            producer_profile_sha256: "22".repeat(32),
        }
    }

    fn completed() -> ExactClusters {
        ExactClusters {
            clusters: vec![ClusterReport {
                label: "body-a".into(),
                primitives: vec![
                    PrimitiveRecord {
                        name: "body-a".into(),
                        color: None,
                        vertices: 4,
                        aabb: Aabb {
                            min: [0.0; 3],
                            max: [0.5; 3],
                        },
                    },
                    PrimitiveRecord {
                        name: "body-b".into(),
                        color: None,
                        vertices: 4,
                        aabb: Aabb {
                            min: [0.5; 3],
                            max: [1.0; 3],
                        },
                    },
                ],
                aabb: Aabb {
                    min: [0.0; 3],
                    max: [1.0; 3],
                },
                centroid: [0.5; 3],
                total_vertices: 8,
            }],
            labels: vec!["body-a".into(), "body-b".into()],
            trace: vec![
                ChargeStep {
                    units: 1,
                    pair: None,
                    stage: ChargeStage::BodySetup,
                },
                ChargeStep {
                    units: 2,
                    pair: Some((0, 1)),
                    stage: ChargeStage::FaceDistance,
                },
            ],
            units: 3,
            trace_complete: true,
            stage_calls: [1, 0, 0, 1, 0, 0],
            stage_units: [1, 0, 0, 2, 0, 0],
        }
    }

    #[test]
    fn completed_fact_round_trips_and_rejects_changed_action_or_trace() {
        let store = MemoryStore::default();
        let address = address();
        publish_if_cold(&store, &address, &completed(), true);
        let loaded = load(&store, &address).unwrap();
        assert_eq!(loaded.clusters, completed().clusters);
        assert_eq!(loaded.labels, completed().labels);
        assert_eq!(loaded.trace, completed().trace);

        let mut changed = address.clone();
        changed.action_sha256 = "33".repeat(32);
        assert!(load(&store, &changed).is_none());

        let mut payload: serde_json::Value =
            serde_json::from_slice(&store.load(&address).unwrap()).unwrap();
        payload["trace"][1]["pair"] = serde_json::json!([0, 2]);
        store.publish(
            &address,
            &crate::canonicalize(&serde_json::to_vec(&payload).unwrap()).unwrap(),
        );
        assert!(load(&store, &address).is_none());
    }

    #[test]
    fn replay_preserves_each_budget_prefix_and_prior_spend() {
        let store = MemoryStore::default();
        let address = address();
        publish_if_cold(&store, &address, &completed(), true);
        let completed = load(&store, &address).unwrap();
        for (limit, prior, expected_used, refused_pair) in [
            (0, 0, 0, None),
            (1, 0, 1, Some((0, 1))),
            (2, 0, 1, Some((0, 1))),
            (3, 0, 3, None),
            (3, 1, 2, Some((0, 1))),
            (4, 1, 4, None),
        ] {
            let budget = Budget::new(limit);
            charge(&budget, prior).unwrap();
            let mut trace = ChargeTrace::default();
            let result = replay(&completed, &budget, &mut trace);
            assert_eq!(budget.used(), expected_used, "limit={limit}, prior={prior}");
            if limit == 0 {
                assert_eq!(result.unwrap_err().1, None);
            } else if let Some(pair) = refused_pair {
                assert_eq!(result.unwrap_err().1, Some(pair));
            } else {
                result.unwrap();
                assert_eq!(trace.steps, completed.trace);
            }
        }
    }

    #[test]
    fn resident_or_reopened_hit_does_not_republish() {
        let store = MemoryStore::default();
        let address = address();
        publish_if_cold(&store, &address, &completed(), true);
        assert_eq!(store.writes.get(), 1);
        let reopened = load(&store, &address).unwrap();
        assert_eq!(reopened.trace, completed().trace);
        publish_if_cold(&store, &address, &completed(), false);
        assert_eq!(store.writes.get(), 1);
    }

    #[test]
    fn oversized_optional_fact_is_rejected_before_publication() {
        let store = MemoryStore::default();
        let mut value = completed();
        value.labels[0] = "a".repeat(3 * 1024 * 1024);
        assert!(payload_upper_bound(&value).unwrap() > MAX_PAYLOAD_BYTES);
        publish_if_cold(&store, &address(), &value, true);
        assert_eq!(store.writes.get(), 0);
        assert!(store.load(&address()).is_none());
    }
}
