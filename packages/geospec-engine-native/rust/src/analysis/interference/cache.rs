use std::collections::BTreeSet;

use serde::{Deserialize, Serialize};

use crate::{
    backend::brep::Bounds,
    cache::{EvidenceAddress, OverlapEvidenceCache, ProducerIdentity},
    identity::sha256_hex,
    protocol::{CANONICAL_PROFILE, NUMERIC_PROFILE, PROTOCOL_VERSION, REGISTRY_VERSION},
    subject::Subject,
};

use super::{
    normalized_bits, CompletedOverlap, Component, ComponentEvidence, Overlap, OverlapRequest,
    SelectedPair, TESSELLATION_PROFILE,
};

const ACTION_SCHEMA: &str = "geospec-overlap-action-v1";
const FAMILY: &str = "native-b48-overlap-evidence-v1";
const CODEC: &str = "geospec-overlap-evidence-json-v1";
const PAYLOAD_SCHEMA: &str = "geospec-overlap-evidence-payload-v1";

pub(super) struct EvidenceContext<'a> {
    pub(super) subject: &'a Subject,
    pub(super) producer: &'a ProducerIdentity,
    pub(super) tolerance: f64,
    pub(super) selected: Option<&'a [SelectedPair]>,
    pub(super) components: &'a [Component],
    pub(super) candidates: &'a [(usize, usize)],
}

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
    tessellation_profile: TessellationIdentity,
    producer: Producer<'a>,
    subject: serde_json::Value,
    tolerance_bits: String,
    selected_pairs: Option<Vec<PairDto>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TessellationIdentity {
    linear_deflection_bits: String,
    angular_deflection_bits: String,
}

#[derive(Serialize)]
struct Producer<'a> {
    core: &'a str,
    csg: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    brep: Option<&'a str>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct PairDto {
    left: u32,
    right: u32,
    left_label: String,
    right_label: String,
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct Payload {
    schema: String,
    family: String,
    codec: String,
    action_sha256: String,
    evidence: EvidenceDto,
    trace: Vec<RequestDto>,
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct EvidenceDto {
    component_count: usize,
    components: Vec<ComponentDto>,
    selected_pairs: Option<Vec<PairDto>>,
    checked_pairs: usize,
    tolerance_bits: String,
    overlaps: Vec<OverlapDto>,
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct ComponentDto {
    id: u32,
    label: String,
    min: [f64; 3],
    max: [f64; 3],
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct OverlapDto {
    left_component_id: u32,
    right_component_id: u32,
    left_label: String,
    right_label: String,
    intersection_volume: f64,
    witness_point: Option<[f64; 3]>,
}

#[derive(Deserialize, Serialize)]
#[serde(tag = "kind", rename_all = "kebab-case", deny_unknown_fields)]
enum RequestDto {
    Source { component: u32, units: String },
    Boolean,
    Properties,
}

pub(super) fn load(
    context: &EvidenceContext<'_>,
    store: &dyn OverlapEvidenceCache,
) -> Option<CompletedOverlap> {
    let address = address(
        context.subject,
        context.producer,
        context.tolerance,
        context.selected,
    )?;
    let payload = store.load(&address)?;
    if crate::canonicalize(&payload).ok()? != payload {
        return None;
    }
    let payload: Payload = serde_json::from_slice(&payload).ok()?;
    let completed = validate_payload(
        &address,
        context.tolerance,
        context.selected,
        context.components,
        context.candidates,
        payload,
    )?;
    Some(completed)
}

pub(super) fn publish(
    context: &EvidenceContext<'_>,
    completed: &CompletedOverlap,
    store: &dyn OverlapEvidenceCache,
) {
    let Some(address) = address(
        context.subject,
        context.producer,
        context.tolerance,
        context.selected,
    ) else {
        return;
    };
    if expected_trace(context.components, context.candidates) != completed.requests {
        return;
    }
    let payload = Payload {
        schema: PAYLOAD_SCHEMA.into(),
        family: FAMILY.into(),
        codec: CODEC.into(),
        action_sha256: address.action_sha256.clone(),
        evidence: evidence_to_dto(completed),
        trace: completed.requests.iter().map(request_to_dto).collect(),
    };
    let Ok(json) = serde_json::to_vec(&payload) else {
        return;
    };
    let Ok(canonical) = crate::canonicalize(&json) else {
        return;
    };
    store.publish(&address, &canonical);
}

fn address(
    subject: &Subject,
    producer: &ProducerIdentity,
    tolerance: f64,
    selected: Option<&[SelectedPair]>,
) -> Option<EvidenceAddress> {
    let descriptor: serde_json::Value =
        serde_json::from_slice(&subject.identity_descriptor_bytes().ok()?).ok()?;
    let action = Action {
        schema: ACTION_SCHEMA,
        family: FAMILY,
        codec: CODEC,
        protocol_version: PROTOCOL_VERSION as u32,
        registry_version: REGISTRY_VERSION as u32,
        canonical_profile: CANONICAL_PROFILE,
        numeric_profile: NUMERIC_PROFILE,
        partition_profile: "overlap-partition-v1",
        tessellation_profile: TessellationIdentity {
            linear_deflection_bits: bits(TESSELLATION_PROFILE.linear_deflection_mm),
            angular_deflection_bits: bits(TESSELLATION_PROFILE.angular_deflection_rad),
        },
        producer: Producer {
            core: &producer.core,
            csg: &producer.csg,
            brep: subject.brep.is_some().then_some(producer.brep.as_str()),
        },
        subject: descriptor,
        tolerance_bits: bits(tolerance),
        selected_pairs: selected.map(|pairs| pairs.iter().map(pair_to_dto).collect()),
    };
    let bytes = crate::canonicalize(&serde_json::to_vec(&action).ok()?).ok()?;
    let action_sha256 = sha256_hex(&bytes);
    let producer_bytes = crate::canonicalize(&serde_json::to_vec(&action.producer).ok()?).ok()?;
    Some(EvidenceAddress {
        action_sha256,
        family: FAMILY,
        codec: CODEC,
        producer_profile_sha256: sha256_hex(&producer_bytes),
    })
}

fn validate_payload(
    address: &EvidenceAddress,
    tolerance: f64,
    selected: Option<&[SelectedPair]>,
    components: &[Component],
    candidates: &[(usize, usize)],
    payload: Payload,
) -> Option<CompletedOverlap> {
    if payload.schema != PAYLOAD_SCHEMA
        || payload.family != FAMILY
        || payload.codec != CODEC
        || payload.action_sha256 != address.action_sha256
        || payload.evidence.component_count != components.len()
        || payload.evidence.checked_pairs != candidates.len()
        || payload.evidence.tolerance_bits != bits(tolerance)
        || payload.evidence.selected_pairs
            != selected.map(|pairs| pairs.iter().map(pair_to_dto).collect())
        || payload.evidence.components.len() != components.len()
        || payload.evidence.overlaps.len() > candidates.len()
    {
        return None;
    }
    for (actual, expected) in payload.evidence.components.iter().zip(components) {
        if actual.id != expected.id
            || actual.label != expected.label
            || actual.min != expected.bounds.min
            || actual.max != expected.bounds.max
        {
            return None;
        }
    }
    let requests: Option<Vec<_>> = payload.trace.iter().map(request_from_dto).collect();
    let requests = requests?;
    if requests != expected_trace(components, candidates) {
        return None;
    }
    let candidate_ids: BTreeSet<_> = candidates
        .iter()
        .map(|(left, right)| (components[*left].id, components[*right].id))
        .collect();
    let epsilon = tolerance.powi(3).max(1e-12);
    let mut seen = BTreeSet::new();
    let mut overlaps = Vec::with_capacity(payload.evidence.overlaps.len());
    for value in payload.evidence.overlaps {
        let key = (value.left_component_id, value.right_component_id);
        let left = components.iter().find(|component| component.id == key.0)?;
        let right = components.iter().find(|component| component.id == key.1)?;
        if !candidate_ids.contains(&key)
            || !seen.insert(key)
            || value.left_label != left.label
            || value.right_label != right.label
            || !value.intersection_volume.is_finite()
            || value.intersection_volume <= epsilon
            || value
                .witness_point
                .is_some_and(|point| point.iter().any(|coordinate| !coordinate.is_finite()))
        {
            return None;
        }
        overlaps.push(Overlap {
            left_component_id: value.left_component_id,
            right_component_id: value.right_component_id,
            left_label: value.left_label,
            right_label: value.right_label,
            intersection_volume: value.intersection_volume,
            witness_point: value.witness_point,
        });
    }
    Some(CompletedOverlap {
        evidence: super::Evidence {
            exact: false,
            component_count: components.len(),
            components: payload
                .evidence
                .components
                .into_iter()
                .map(|value| ComponentEvidence {
                    id: value.id,
                    label: value.label,
                    bounds: Bounds {
                        min: value.min,
                        max: value.max,
                    },
                })
                .collect(),
            selected_pairs: selected.map(|pairs| pairs.to_vec()),
            checked_pairs: candidates.len(),
            tolerance,
            overlaps,
        },
        requests,
    })
}

fn expected_trace(components: &[Component], candidates: &[(usize, usize)]) -> Vec<OverlapRequest> {
    let mut admitted = BTreeSet::new();
    let mut trace = Vec::new();
    for (left, right) in candidates {
        for component in [&components[*left], &components[*right]] {
            if admitted.insert(component.id) {
                trace.push(OverlapRequest::Source {
                    component: component.id,
                    units: crate::backend::csg_scope::CsgScope::mesh_cost(component.mesh()),
                });
            }
        }
        trace.push(OverlapRequest::Boolean);
        trace.push(OverlapRequest::Properties);
    }
    trace
}

fn evidence_to_dto(completed: &CompletedOverlap) -> EvidenceDto {
    EvidenceDto {
        component_count: completed.evidence.component_count,
        components: completed
            .evidence
            .components
            .iter()
            .map(|value| ComponentDto {
                id: value.id,
                label: value.label.clone(),
                min: value.bounds.min,
                max: value.bounds.max,
            })
            .collect(),
        selected_pairs: completed
            .evidence
            .selected_pairs
            .as_deref()
            .map(|pairs| pairs.iter().map(pair_to_dto).collect()),
        checked_pairs: completed.evidence.checked_pairs,
        tolerance_bits: bits(completed.evidence.tolerance),
        overlaps: completed
            .evidence
            .overlaps
            .iter()
            .map(|value| OverlapDto {
                left_component_id: value.left_component_id,
                right_component_id: value.right_component_id,
                left_label: value.left_label.clone(),
                right_label: value.right_label.clone(),
                intersection_volume: value.intersection_volume,
                witness_point: value.witness_point,
            })
            .collect(),
    }
}

fn pair_to_dto(value: &SelectedPair) -> PairDto {
    PairDto {
        left: value.left,
        right: value.right,
        left_label: value.left_label.clone(),
        right_label: value.right_label.clone(),
    }
}

fn request_to_dto(value: &OverlapRequest) -> RequestDto {
    match value {
        OverlapRequest::Source { component, units } => RequestDto::Source {
            component: *component,
            units: units.to_string(),
        },
        OverlapRequest::Boolean => RequestDto::Boolean,
        OverlapRequest::Properties => RequestDto::Properties,
        OverlapRequest::Pair { .. } => unreachable!("publish admits only the Manifold trace"),
    }
}

fn request_from_dto(value: &RequestDto) -> Option<OverlapRequest> {
    Some(match value {
        RequestDto::Source { component, units } => OverlapRequest::Source {
            component: *component,
            units: units.parse().ok()?,
        },
        RequestDto::Boolean => OverlapRequest::Boolean,
        RequestDto::Properties => OverlapRequest::Properties,
    })
}

fn bits(value: f64) -> String {
    format!("{:016x}", normalized_bits(value))
}
