use serde::Deserialize;
use serde_json::Value;

const CURRENT_REGISTRY_VERSION: u64 = 5;
const FROZEN_REGISTRY_VERSION: u64 = 4;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Envelope {
    method: String,
    protocol_version: u64,
    registry_version: u64,
    canonical_profile: String,
}

#[derive(Deserialize)]
struct ClaimPlan {
    plan: Subjects,
}

#[derive(Deserialize)]
struct Subjects {
    subjects: Vec<Subject>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Subject {
    subject_hash: String,
}

#[derive(Deserialize)]
struct Admission {
    result: AdmissionResult,
}

#[derive(Deserialize)]
struct AdmissionResult {
    subject: Subject,
}

pub struct BoundRequest {
    pub json: String,
    pub original_subject_hash: String,
    pub effective_subject_hash: String,
}

fn bind_envelope(value: &mut Value, method: &str) {
    let envelope: Envelope = serde_json::from_value(value.clone()).unwrap();
    assert_eq!(envelope.method, method);
    assert_eq!(envelope.protocol_version, 3);
    assert_eq!(envelope.registry_version, FROZEN_REGISTRY_VERSION);
    assert_eq!(envelope.canonical_profile, "geospec-jcs-v1");
    value["registryVersion"] = CURRENT_REGISTRY_VERSION.into();
}

pub fn bind_ingest(original: &[u8]) -> Vec<u8> {
    let mut value: Value = serde_json::from_slice(original).unwrap();
    bind_envelope(&mut value, "ingestSubject");
    serde_json::to_vec(&value).unwrap()
}

pub fn bind_claim(original: &str, admission: &[u8]) -> BoundRequest {
    let mut value: Value = serde_json::from_str(original).unwrap();
    bind_envelope(&mut value, "submitClaims");
    let request: ClaimPlan = serde_json::from_value(value.clone()).unwrap();
    assert_eq!(request.plan.subjects.len(), 1);
    let original_subject_hash = request.plan.subjects[0].subject_hash.clone();
    let effective_subject_hash = serde_json::from_slice::<Admission>(admission)
        .unwrap()
        .result
        .subject
        .subject_hash;
    value["plan"]["subjects"][0]["subjectHash"] = effective_subject_hash.clone().into();
    BoundRequest {
        json: serde_json::to_string(&value).unwrap(),
        original_subject_hash,
        effective_subject_hash,
    }
}
