use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};

use crate::codec::{decode, encode, Json};
use crate::mesh::Mesh;
use crate::{ErrorKind, ProtocolError};

const PROTOCOL_VERSION: f64 = 3.0;
const REGISTRY_VERSION: f64 = 4.0;
const CANONICAL_PROFILE: &str = "geospec-jcs-v1";
const MAX_SAFE_INTEGER: f64 = 9_007_199_254_740_991.0;
const MAX_CLAIMS: usize = 4096;

const CAPABILITIES: [&str; 28] = [
    "toHaveBoundingBox",
    "toHaveConnectedComponents",
    "toBeWatertight",
    "toHaveNoComponentInterference",
    "toHaveAssemblyOccurrences",
    "toHaveSpatialRelationships",
    "toHaveMeshIntegrity",
    "toHaveNoDiagnostics",
    "toHaveSurfaceArea",
    "toHaveVolume",
    "toHaveMass",
    "toHaveCenterOfMass",
    "toBeValidBrep",
    "toHaveTopologyCounts",
    "toHaveStepUnits",
    "toHaveProductStructure",
    "toHavePlanarFace",
    "toHaveCylindricalFace",
    "toHaveCircularHole",
    "toHaveCircularHolePattern",
    "toHaveChamferFeature",
    "toHaveFilletFeature",
    "toHaveMinimumWallThickness",
    "toHaveVoidContinuity",
    "analyzeBrep",
    "analyzeMesh",
    "inspectGeometry",
    "analyzeMeshOverlap",
];

/// Experimental whole-subject mesh engine with owned, content-addressed subjects.
#[derive(Default)]
pub struct Engine {
    subjects: HashMap<String, Mesh>,
}

impl Engine {
    /// Creates an engine with no ingested subjects.
    pub fn new() -> Self {
        Self::default()
    }

    /// Admits exact mesh-buffer-v1 bytes in the whole-subject mm/z-up frame.
    pub fn ingest_mesh(&mut self, request: &[u8], mesh: &[u8]) -> Result<Vec<u8>, ProtocolError> {
        let value = decode(request)?;
        let request = object(&value, "ingestSubject request")?;
        let fields = [
            "method",
            "requestId",
            "protocolVersion",
            "registryVersion",
            "canonicalProfile",
            "contentHash",
            "format",
            "frame",
        ];
        require_fields(request, &fields, &fields, "ingestSubject request")?;
        if string_field(request, "method")? != "ingestSubject" {
            return invalid_request("Mesh admission requires method ingestSubject.");
        }
        validate_versions(request)?;
        let request_id = logical_id(request, "requestId")?;
        let format = string_field(request, "format")?;
        if format != "mesh-buffer-v1" {
            return Err(ProtocolError::new(
                ErrorKind::UnsupportedVersion,
                "Only mesh-buffer-v1 admission is supported.",
            ));
        }
        let frame = object(field(request, "frame")?, "frame")?;
        require_fields(
            frame,
            &["coordinateSystem", "unit"],
            &["coordinateSystem", "unit"],
            "frame",
        )?;
        if string_field(frame, "coordinateSystem")? != "z-up"
            || string_field(frame, "unit")? != "mm"
        {
            return invalid_request(
                "Mesh frame must be whole-subject millimetres with z-up coordinates.",
            );
        }
        let content_hash = string_field(request, "contentHash")?;
        validate_content_hash(content_hash)
            .map_err(|error| ProtocolError::new(ErrorKind::InvalidRequest, error.to_string()))?;
        let subject = Mesh::decode(mesh)?;
        let verified_hash = format!("{:x}", Sha256::digest(mesh));
        if content_hash != verified_hash {
            return invalid_request("Mesh contentHash does not match the exact supplied bytes.");
        }
        let response = encode(&Json::object([
            ("requestId", Json::string(request_id)),
            (
                "result",
                Json::object([(
                    "subject",
                    Json::object([
                        ("contentHash", Json::string(content_hash)),
                        ("format", Json::string(format)),
                    ]),
                )]),
            ),
        ]))?;
        self.subjects.insert(verified_hash, subject);
        Ok(response)
    }

    /// Negotiates capabilities or evaluates claims against this engine's subjects.
    pub fn process_request(&self, request: &[u8]) -> Result<Vec<u8>, ProtocolError> {
        process(self, decode(request)?)
    }
    /// Normalizes the supported early claim plan without executing geometry.
    pub fn canonical_plan(&self, request: &[u8]) -> Result<Vec<u8>, ProtocolError> {
        let value = decode(request)?;
        let request = object(&value, "submitClaims request")?;
        let (_, plan) = submit_request(request)?;
        encode(&canonical_plan_value(plan)?)
    }

    /// Evaluates a neutral early plan and returns results without transport IDs.
    pub fn evaluate_plan(&self, plan: &[u8]) -> Result<Vec<u8>, ProtocolError> {
        let value = decode(plan)?;
        let envelope = object(&value, "canonical plan")?;
        let fields = [
            "protocolVersion",
            "registryVersion",
            "canonicalProfile",
            "numericProfile",
            "plan",
        ];
        require_fields(envelope, &fields, &fields, "canonical plan")?;
        validate_versions(envelope)?;
        if string_field(envelope, "numericProfile")? != "mesh-f32-bounds-v1" {
            return Err(ProtocolError::new(
                ErrorKind::UnsupportedVersion,
                "Unsupported canonical plan numeric profile.",
            ));
        }
        let normalized = canonical_plan_value(field(envelope, "plan")?)?;
        let normalized = object(&normalized, "canonical plan")?;
        let prepared = prepare_claims(Some(self), field(normalized, "plan")?)?;
        encode(&evaluate_claims(prepared)?)
    }
}

fn process(engine: &Engine, request: Json) -> Result<Vec<u8>, ProtocolError> {
    let request = object(&request, "request")?;
    let method = string_field(request, "method")?;
    match method {
        "initialize" => initialize(request),
        "submitClaims" => submit_claims(engine, request),
        _ => Err(ProtocolError::new(
            ErrorKind::InvalidRequest,
            format!("GeoSpec method '{method}' is not supported by this engine slice."),
        )),
    }
}

fn initialize(request: &[(String, Json)]) -> Result<Vec<u8>, ProtocolError> {
    require_fields(
        request,
        &[
            "method",
            "requestId",
            "protocolVersion",
            "registryVersion",
            "canonicalProfile",
        ],
        &[
            "method",
            "requestId",
            "protocolVersion",
            "registryVersion",
            "canonicalProfile",
        ],
        "initialize request",
    )?;
    validate_versions(request)?;
    let request_id = logical_id(request, "requestId")?;
    encode(&Json::Object(vec![
        ("requestId".into(), Json::String(request_id.into())),
        (
            "result".into(),
            Json::Object(vec![
                ("protocolVersion".into(), Json::Number(PROTOCOL_VERSION)),
                ("registryVersion".into(), Json::Number(REGISTRY_VERSION)),
                (
                    "canonicalProfile".into(),
                    Json::String(CANONICAL_PROFILE.into()),
                ),
                ("qualification".into(), Json::String("experimental".into())),
                (
                    "capabilities".into(),
                    Json::Array(vec![Json::object([
                        ("name", Json::string(CAPABILITIES[0])),
                        ("registryVersion", Json::Number(REGISTRY_VERSION)),
                        ("scope", Json::string("mesh-buffer-whole-subject")),
                    ])]),
                ),
            ]),
        ),
    ]))
}

fn submit_request(request: &[(String, Json)]) -> Result<(&str, &Json), ProtocolError> {
    require_fields(
        request,
        &[
            "method",
            "requestId",
            "protocolVersion",
            "registryVersion",
            "canonicalProfile",
            "plan",
        ],
        &[
            "method",
            "requestId",
            "protocolVersion",
            "registryVersion",
            "canonicalProfile",
            "plan",
        ],
        "submitClaims request",
    )?;
    if string_field(request, "method")? != "submitClaims" {
        return invalid_request("Canonical plans require method submitClaims.");
    }
    validate_versions(request)?;
    let request_id = logical_id(request, "requestId")?;
    Ok((request_id, field(request, "plan")?))
}

struct PreparedClaim<'a> {
    claim: &'a [(String, Json)],
    claim_id: &'a str,
    capability: &'a str,
    hash: Option<&'a str>,
    mesh: Option<&'a Mesh>,
    bounds: Option<crate::bounding_box::Prepared>,
}

fn prepare_claims<'a>(
    engine: Option<&'a Engine>,
    plan: &'a Json,
) -> Result<Vec<PreparedClaim<'a>>, ProtocolError> {
    let plan = object(plan, "plan")?;
    require_fields(
        plan,
        &["subjects", "claims"],
        &["subjects", "claims"],
        "plan",
    )?;

    let subject_values = array(field(plan, "subjects")?, "plan.subjects")?;
    let mut subjects = HashMap::new();
    for subject in subject_values {
        let subject = object(subject, "plan subject").map_err(as_invalid_claim)?;
        require_fields(
            subject,
            &["slot", "contentHash"],
            &["slot", "contentHash"],
            "plan subject",
        )
        .map_err(as_invalid_claim)?;
        let slot = logical_id(subject, "slot").map_err(as_invalid_claim)?;
        let hash = string_field(subject, "contentHash").map_err(as_invalid_claim)?;
        if subjects.insert(slot, hash).is_some() {
            return Err(ProtocolError::new(
                ErrorKind::InvalidClaim,
                format!("GeoSpec plan contains duplicate subject slot '{slot}'."),
            ));
        }
        validate_content_hash(hash)?;
    }

    let claim_values = array(field(plan, "claims")?, "plan.claims")?;
    if claim_values.len() > MAX_CLAIMS {
        return Err(ProtocolError::new(
            ErrorKind::LimitExceeded,
            "GeoSpec plan contains more than 4096 claims.",
        ));
    }
    let mut claim_ids = HashSet::new();
    let mut prepared = Vec::with_capacity(claim_values.len());
    for claim in claim_values {
        let claim = object(claim, "claim").map_err(as_invalid_claim)?;
        require_fields(
            claim,
            &[
                "claimId",
                "capability",
                "subjectSlots",
                "payload",
                "polarity",
                "workUnitBudget",
            ],
            &[
                "claimId",
                "capability",
                "subjectSlots",
                "polarity",
                "workUnitBudget",
            ],
            "claim",
        )
        .map_err(as_invalid_claim)?;
        let claim_id = logical_id(claim, "claimId").map_err(as_invalid_claim)?;
        if !claim_ids.insert(claim_id) {
            return Err(ProtocolError::new(
                ErrorKind::InvalidClaim,
                format!("GeoSpec plan contains duplicate claim ID '{claim_id}'."),
            ));
        }
        let capability = string_field(claim, "capability").map_err(as_invalid_claim)?;
        if !CAPABILITIES.contains(&capability) {
            return Err(ProtocolError::new(
                ErrorKind::UnknownCapability,
                format!("GeoSpec capability '{capability}' is not in registry 4."),
            ));
        }
        let subject_slots = string_array(
            field(claim, "subjectSlots").map_err(as_invalid_claim)?,
            "claim.subjectSlots",
        )
        .map_err(as_invalid_claim)?;
        for slot in &subject_slots {
            if !subjects.contains_key(slot.as_str()) {
                return Err(ProtocolError::new(
                    ErrorKind::InvalidClaim,
                    format!(
                        "GeoSpec claim '{claim_id}' references unresolved subject slot '{slot}'."
                    ),
                ));
            }
        }
        let polarity = string_field(claim, "polarity").map_err(as_invalid_claim)?;
        if !matches!(polarity, "positive" | "negative") {
            return invalid_claim("GeoSpec claim polarity must be 'positive' or 'negative'.");
        }
        validate_budget(field(claim, "workUnitBudget").map_err(as_invalid_claim)?)?;

        if capability == "analyzeMesh" {
            if subject_slots.len() != 1 {
                return invalid_claim("analyzeMesh requires exactly one existing subject slot.");
            }
            if !matches!(optional_field(claim, "payload"), None | Some(Json::Null)) {
                return invalid_claim("analyzeMesh payload must be null or omitted.");
            }
        }

        let (hash, mesh, bounds) = if capability == CAPABILITIES[0] {
            if subject_slots.len() != 1 {
                return invalid_claim(
                    "toHaveBoundingBox requires exactly one existing subject slot.",
                );
            }
            let hash = subjects[subject_slots[0].as_str()];
            let mesh = if let Some(engine) = engine {
                Some(engine.subjects.get(hash).ok_or_else(|| {
                    ProtocolError::new(
                        ErrorKind::InvalidClaim,
                        "Bounding-box subject content must first be ingested into this Engine.",
                    )
                })?)
            } else {
                None
            };
            let bounds = crate::bounding_box::prepare(claim).map_err(as_invalid_claim)?;
            (Some(hash), mesh, Some(bounds))
        } else {
            (None, None, None)
        };
        prepared.push(PreparedClaim {
            claim,
            claim_id,
            capability,
            hash,
            mesh,
            bounds,
        });
    }
    Ok(prepared)
}

fn evaluate_claims(prepared: Vec<PreparedClaim<'_>>) -> Result<Json, ProtocolError> {
    let mut results = Vec::with_capacity(prepared.len());
    for claim in prepared {
        if let (Some(mesh), Some(hash), Some(bounds)) = (claim.mesh, claim.hash, claim.bounds) {
            results.push(
                crate::bounding_box::evaluate(mesh, hash, claim.claim, &bounds)
                    .map_err(as_invalid_claim)?,
            );
        } else {
            results.push(refused_result(claim.claim_id, claim.capability));
        }
    }
    Ok(Json::object([("results", Json::Array(results))]))
}

fn submit_claims(engine: &Engine, request: &[(String, Json)]) -> Result<Vec<u8>, ProtocolError> {
    let (request_id, plan) = submit_request(request)?;
    let prepared = prepare_claims(Some(engine), plan)?;
    let result = evaluate_claims(prepared)?;
    encode(&Json::object([
        ("requestId", Json::string(request_id)),
        ("result", result),
    ]))
}

fn canonical_plan_value(plan: &Json) -> Result<Json, ProtocolError> {
    let prepared = prepare_claims(None, plan)?;
    let mut claims = Vec::with_capacity(prepared.len());
    for claim in prepared {
        let payload = if let Some(bounds) = claim.bounds {
            bounds.normalized_payload()
        } else if claim.capability == "analyzeMesh" {
            Json::Null
        } else {
            return Err(ProtocolError::new(
                ErrorKind::UnsupportedNormalization,
                format!(
                    "Canonical plan normalization is unavailable for capability '{}'.",
                    claim.capability
                ),
            ));
        };
        let mut fields = claim.claim.to_vec();
        fields.retain(|(key, _)| key != "payload");
        fields.push(("payload".into(), payload));
        claims.push(Json::Object(fields));
    }
    let subjects = field(object(plan, "plan")?, "subjects")?.clone();
    Ok(Json::object([
        ("protocolVersion", Json::Number(PROTOCOL_VERSION)),
        ("registryVersion", Json::Number(REGISTRY_VERSION)),
        ("canonicalProfile", Json::string(CANONICAL_PROFILE)),
        ("numericProfile", Json::string("mesh-f32-bounds-v1")),
        (
            "plan",
            Json::object([("subjects", subjects), ("claims", Json::Array(claims))]),
        ),
    ]))
}

fn refused_result(claim_id: &str, capability: &str) -> Json {
    Json::Object(vec![
        ("claimId".into(), Json::String(claim_id.into())),
        ("status".into(), Json::String("refused".into())),
        (
            "diagnostics".into(),
            Json::Array(vec![Json::Object(vec![
                (
                    "code".into(),
                    Json::String("GEOSPEC_CAPABILITY_UNAVAILABLE".into()),
                ),
                ("severity".into(), Json::String("error".into())),
                (
                    "message".into(),
                    Json::String("Capability is not implemented in this engine slice.".into()),
                ),
                (
                    "details".into(),
                    Json::Object(vec![("capability".into(), Json::String(capability.into()))]),
                ),
            ])]),
        ),
    ])
}

fn validate_versions(request: &[(String, Json)]) -> Result<(), ProtocolError> {
    let protocol = number_field(request, "protocolVersion")?;
    if protocol != PROTOCOL_VERSION {
        return Err(ProtocolError::new(
            ErrorKind::UnsupportedVersion,
            format!("GeoSpec protocol version {protocol} is incompatible with version 3."),
        ));
    }
    let registry = number_field(request, "registryVersion")?;
    if registry != REGISTRY_VERSION {
        return Err(ProtocolError::new(
            ErrorKind::UnsupportedVersion,
            format!("GeoSpec registry version {registry} is incompatible with version 4."),
        ));
    }
    let profile = string_field(request, "canonicalProfile")?;
    if profile != CANONICAL_PROFILE {
        return Err(ProtocolError::new(
            ErrorKind::UnsupportedVersion,
            format!("GeoSpec canonical profile '{profile}' is not supported."),
        ));
    }
    Ok(())
}

fn validate_content_hash(value: &str) -> Result<(), ProtocolError> {
    if value.len() == 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    {
        Ok(())
    } else {
        invalid_claim("GeoSpec subject contentHash must be 64 lowercase hexadecimal characters.")
    }
}

fn validate_budget(value: &Json) -> Result<(), ProtocolError> {
    let Json::Number(value) = value else {
        return Err(ProtocolError::new(
            ErrorKind::InvalidClaim,
            "GeoSpec workUnitBudget must be a positive exact safe integer.",
        ));
    };
    if value.fract() == 0.0 && (1.0..=MAX_SAFE_INTEGER).contains(value) {
        Ok(())
    } else {
        Err(ProtocolError::new(
            ErrorKind::InvalidClaim,
            "GeoSpec workUnitBudget must be a positive exact safe integer.",
        ))
    }
}

pub(crate) fn require_fields(
    object: &[(String, Json)],
    allowed: &[&str],
    required: &[&str],
    name: &str,
) -> Result<(), ProtocolError> {
    if let Some((key, _)) = object
        .iter()
        .find(|(key, _)| !allowed.contains(&key.as_str()))
    {
        return invalid_request(format!("GeoSpec {name} contains unknown field '{key}'."));
    }
    if let Some(key) = required
        .iter()
        .find(|key| optional_field(object, key).is_none())
    {
        return invalid_request(format!("GeoSpec {name} is missing required field '{key}'."));
    }
    Ok(())
}

pub(crate) fn object<'a>(
    value: &'a Json,
    name: &str,
) -> Result<&'a [(String, Json)], ProtocolError> {
    match value {
        Json::Object(value) => Ok(value),
        _ => invalid_request(format!("GeoSpec {name} must be an object.")),
    }
}

pub(crate) fn array<'a>(value: &'a Json, name: &str) -> Result<&'a [Json], ProtocolError> {
    match value {
        Json::Array(value) => Ok(value),
        _ => invalid_request(format!("GeoSpec {name} must be an array.")),
    }
}

pub(crate) fn field<'a>(
    object: &'a [(String, Json)],
    key: &str,
) -> Result<&'a Json, ProtocolError> {
    optional_field(object, key).ok_or_else(|| {
        ProtocolError::new(
            ErrorKind::InvalidRequest,
            format!("GeoSpec field '{key}' is required."),
        )
    })
}

pub(crate) fn optional_field<'a>(object: &'a [(String, Json)], key: &str) -> Option<&'a Json> {
    object
        .iter()
        .find(|(candidate, _)| candidate == key)
        .map(|(_, value)| value)
}

pub(crate) fn string_field<'a>(
    object: &'a [(String, Json)],
    key: &str,
) -> Result<&'a str, ProtocolError> {
    match field(object, key)? {
        Json::String(value) => Ok(value),
        _ => invalid_request(format!("GeoSpec field '{key}' must be a string.")),
    }
}

fn logical_id<'a>(object: &'a [(String, Json)], key: &str) -> Result<&'a str, ProtocolError> {
    let value = string_field(object, key)?;
    if value.is_empty() {
        invalid_request(format!("GeoSpec field '{key}' must not be empty."))
    } else {
        Ok(value)
    }
}

pub(crate) fn number_field(object: &[(String, Json)], key: &str) -> Result<f64, ProtocolError> {
    match field(object, key)? {
        Json::Number(value) => Ok(*value),
        _ => invalid_request(format!("GeoSpec field '{key}' must be a number.")),
    }
}

fn string_array(value: &Json, name: &str) -> Result<Vec<String>, ProtocolError> {
    array(value, name)?
        .iter()
        .map(|value| match value {
            Json::String(value) if !value.is_empty() => Ok(value.clone()),
            _ => invalid_request(format!("GeoSpec {name} must contain non-empty strings.")),
        })
        .collect()
}

fn invalid_request<T>(message: impl Into<String>) -> Result<T, ProtocolError> {
    Err(ProtocolError::new(ErrorKind::InvalidRequest, message))
}

pub(crate) fn invalid_claim<T>(message: impl Into<String>) -> Result<T, ProtocolError> {
    Err(ProtocolError::new(ErrorKind::InvalidClaim, message))
}

fn as_invalid_claim(error: ProtocolError) -> ProtocolError {
    ProtocolError::new(ErrorKind::InvalidClaim, error.to_string())
}

#[cfg(test)]
mod batch_tests {
    use super::Engine;
    use crate::mesh::{Mesh, BOUNDS_CALLS};
    use serde_json::{json, Value};

    #[test]
    fn validates_the_complete_batch_before_computing_any_bounds() {
        let hash = "0".repeat(64);
        let mut engine = Engine::new();
        engine.subjects.insert(
            hash.clone(),
            Mesh {
                positions: vec![[0.0, 0.0, 0.0], [3.0, 0.0, 0.0], [0.0, 2.0, 1.0]],
                indices: vec![0, 1, 2],
            },
        );
        let claim = json!({
            "claimId": "first", "capability": "toHaveBoundingBox",
            "subjectSlots": ["part"], "polarity": "positive", "workUnitBudget": 10,
            "payload": { "kind": "boundingBox", "expected": { "size": {"x": 3} } }
        });
        let request = json!({
            "method": "submitClaims", "requestId": "transport",
            "protocolVersion": 3, "registryVersion": 4, "canonicalProfile": "geospec-jcs-v1",
            "plan": {"subjects": [{"slot": "part", "contentHash": hash}], "claims": [claim]}
        });
        BOUNDS_CALLS.with(|count| count.set(0));
        let encoded = serde_json::to_vec(&request).unwrap();
        let plan = engine.canonical_plan(&encoded).unwrap();
        assert_eq!(BOUNDS_CALLS.with(|count| count.get()), 0);
        let result: Value = serde_json::from_slice(&engine.evaluate_plan(&plan).unwrap()).unwrap();
        assert_eq!(result["results"][0]["status"], "passed");
        assert_eq!(BOUNDS_CALLS.with(|count| count.get()), 1);

        for variant in ["payload", "subject", "budget"] {
            let mut request = request.clone();
            let mut later = claim.clone();
            later["claimId"] = json!("later");
            match variant {
                "payload" => later["payload"]["expected"]["tolerance"] = Value::Null,
                "subject" => later["subjectSlots"] = json!(["missing"]),
                _ => later["workUnitBudget"] = json!(0),
            }
            request["plan"]["claims"]
                .as_array_mut()
                .unwrap()
                .push(later.clone());
            let mut neutral: Value = serde_json::from_slice(&plan).unwrap();
            neutral["plan"]["claims"]
                .as_array_mut()
                .unwrap()
                .push(later);
            BOUNDS_CALLS.with(|count| count.set(0));
            let raw = engine
                .process_request(&serde_json::to_vec(&request).unwrap())
                .unwrap_err();
            assert_eq!(raw.code(), "invalid-claim", "{variant}");
            let normalized = engine
                .evaluate_plan(&serde_json::to_vec(&neutral).unwrap())
                .unwrap_err();
            assert_eq!(normalized.code(), "invalid-claim", "{variant}");
            assert_eq!(BOUNDS_CALLS.with(|count| count.get()), 0, "{variant}");
        }
    }
}
