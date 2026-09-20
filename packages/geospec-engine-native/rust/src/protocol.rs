pub(crate) const NUMERIC_PROFILE: &str = "geospec-st-logical-requests-v3";

use crate::{
    backend::{brep::BrepConnector, csg::CsgConnector},
    prepared::plan::PreparedPlan,
    runtime::EngineConfig,
    subject::{Subject, SubjectFormat},
};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::{cell::RefCell, rc::Rc};

use crate::codec::{decode, encode, Json};
use crate::mesh::Mesh;
use crate::{ErrorKind, ProtocolError};

pub(crate) const PROTOCOL_VERSION: f64 = 3.0;
pub(crate) const REGISTRY_VERSION: f64 = 5.0;
pub(crate) const CANONICAL_PROFILE: &str = "geospec-jcs-v1";
const MAX_SAFE_INTEGER: f64 = 9_007_199_254_740_991.0;

use crate::registry::CAPABILITIES;

static NEXT_ENGINE_OWNER: AtomicU64 = AtomicU64::new(1);

fn next_engine_owner() -> u64 {
    NEXT_ENGINE_OWNER
        .fetch_update(Ordering::Relaxed, Ordering::Relaxed, |owner| {
            owner.checked_add(1)
        })
        .expect("GeoSpec Engine owner counter exhausted")
}

/// Experimental thread-confined engine with owned subjects and neutral connectors.
pub struct Engine {
    pub(crate) subjects: HashMap<String, Rc<Subject>>,
    pub(crate) subject_generations: HashMap<String, u64>,
    pub(crate) owner: u64,
    pub(crate) next_generation: u64,
    pub(crate) config: EngineConfig,
    pub(crate) plate_retention: Rc<crate::certificates::engine::Retention>,
    pub(crate) brep: Option<Box<dyn BrepConnector>>,
    pub(crate) csg: RefCell<Option<Box<dyn CsgConnector>>>,
    pub(crate) retained_solids: RefCell<crate::backend::csg_scope::RetainedSolids>,
    pub(crate) resident_overlaps: Rc<RefCell<crate::analysis::interference::ResidentOverlaps>>,
    pub(crate) overlap_cache: Option<crate::cache::SharedOverlapEvidenceCache>,
    pub(crate) producer_identity: Option<Rc<crate::cache::ProducerIdentity>>,
}

impl Default for Engine {
    fn default() -> Self {
        let config = EngineConfig::entry();
        Self {
            subjects: HashMap::new(),
            subject_generations: HashMap::new(),
            owner: next_engine_owner(),
            next_generation: 0,
            resident_overlaps: Rc::new(RefCell::new(
                crate::analysis::interference::ResidentOverlaps::new(
                    config.analysis.max_mesh_bytes,
                ),
            )),
            plate_retention: Rc::new(crate::certificates::engine::Retention::new(
                config.analysis.max_mesh_bytes,
            )),
            brep: None,
            csg: RefCell::new(None),
            retained_solids: RefCell::new(crate::backend::csg_scope::RetainedSolids::new(
                config.analysis.max_solid_entries,
            )),
            overlap_cache: None,
            producer_identity: None,
            config,
        }
    }
}

impl Engine {
    /// Creates an engine with no ingested subjects.
    pub fn new() -> Self {
        Self::default()
    }

    /// Composes the same engine with thread-confined neutral backend connectors.
    pub fn with_backends(
        config: EngineConfig,
        brep: Box<dyn BrepConnector>,
        csg: Box<dyn CsgConnector>,
    ) -> Self {
        let retained_solids = RefCell::new(crate::backend::csg_scope::RetainedSolids::new(
            config.analysis.max_solid_entries,
        ));
        Self {
            resident_overlaps: Rc::new(RefCell::new(
                crate::analysis::interference::ResidentOverlaps::new(
                    config.analysis.max_mesh_bytes,
                ),
            )),
            plate_retention: Rc::new(crate::certificates::engine::Retention::new(
                config.analysis.max_mesh_bytes,
            )),
            config,
            retained_solids,
            brep: Some(brep),
            csg: RefCell::new(Some(csg)),
            subjects: HashMap::new(),
            subject_generations: HashMap::new(),
            owner: next_engine_owner(),
            next_generation: 0,
            overlap_cache: None,
            producer_identity: None,
        }
    }

    /// Composes the native engine with one optional host-owned overlap cache.
    pub fn with_backends_and_overlap_cache(
        config: EngineConfig,
        brep: Box<dyn BrepConnector>,
        csg: Box<dyn CsgConnector>,
        cache: crate::cache::SharedOverlapEvidenceCache,
        producer_identity: crate::cache::ProducerIdentity,
    ) -> Self {
        let mut engine = Self::with_backends(config, brep, csg);
        engine.overlap_cache = Some(cache);
        engine.producer_identity = Some(Rc::new(producer_identity));
        engine
    }

    pub(crate) fn evaluate_prepared(&self, plan: PreparedPlan) -> Result<Json, ProtocolError> {
        let resolved = plan.resolve(&self.subjects, self.config.analysis)?;
        let mut connector = self.csg.borrow_mut();
        match connector.as_mut() {
            Some(connector) => resolved.evaluate_with_retained(
                Some(connector.as_mut()),
                &mut self.retained_solids.borrow_mut(),
            ),
            None => resolved.evaluate(None),
        }
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
        let retained = Subject::new(
            verified_hash.clone(),
            SubjectFormat::MeshBufferV1,
            "mm".into(),
        );
        let _ = retained.mesh_record.set(Rc::new(subject.analysis_record()));
        self.admit_retained(retained)?;
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
        if string_field(envelope, "numericProfile")? != NUMERIC_PROFILE {
            return Err(ProtocolError::new(
                ErrorKind::UnsupportedVersion,
                "Unsupported canonical plan numeric profile.",
            ));
        }
        let prepared = PreparedPlan::prepare(field(envelope, "plan")?)?;
        encode(&self.evaluate_prepared(prepared)?)
    }
}

impl Drop for Engine {
    fn drop(&mut self) {
        if let Some(connector) = self.csg.get_mut().as_deref_mut() {
            let _ = self.retained_solids.get_mut().release_all(connector);
        }
    }
}

fn process(engine: &Engine, request: Json) -> Result<Vec<u8>, ProtocolError> {
    let request = object(&request, "request")?;
    let method = string_field(request, "method")?;
    match method {
        "initialize" => initialize(engine, request),
        "submitClaims" => submit_claims(engine, request),
        _ => Err(ProtocolError::new(
            ErrorKind::InvalidRequest,
            format!("GeoSpec method '{method}' is not supported by this engine slice."),
        )),
    }
}

fn configuration(engine: &Engine) -> Json {
    let binary = &engine.config.binary;
    let analysis = &engine.config.analysis;
    Json::object([
        (
            "configurationProfile",
            Json::string("geospec-entry-config-v1"),
        ),
        ("defaultWorkUnitBudget", Json::Number(8_000_000.0)),
        ("productionCapacityQualified", Json::Bool(false)),
        (
            "maxRetainedSubjects",
            Json::Number(f64::from(engine.config.max_retained_subjects)),
        ),
        (
            "binaryAdmissionLimits",
            Json::object([
                ("profileId", Json::string(&binary.profile_id)),
                (
                    "maxSubjectBytes",
                    Json::Number(binary.max_subject_bytes as f64),
                ),
                (
                    "maxResourceBytes",
                    Json::Number(binary.max_resource_bytes as f64),
                ),
                (
                    "maxTotalBinaryBytes",
                    Json::Number(binary.max_total_binary_bytes as f64),
                ),
                ("maxVertices", Json::Number(f64::from(binary.max_vertices))),
                (
                    "maxTriangles",
                    Json::Number(f64::from(binary.max_triangles)),
                ),
                (
                    "maxOccurrences",
                    Json::Number(f64::from(binary.max_occurrences)),
                ),
            ]),
        ),
        (
            "analysisRetentionLimits",
            Json::object([
                ("maxMeshBytes", Json::Number(analysis.max_mesh_bytes as f64)),
                (
                    "maxMeshEntries",
                    Json::Number(f64::from(analysis.max_mesh_entries)),
                ),
                (
                    "maxSolidEntries",
                    Json::Number(f64::from(analysis.max_solid_entries)),
                ),
            ]),
        ),
        (
            "backends",
            Json::object([
                ("brep", Json::Bool(engine.brep.is_some())),
                ("csg", Json::Bool(engine.csg.borrow().is_some())),
            ]),
        ),
    ])
}

fn initialize(engine: &Engine, request: &[(String, Json)]) -> Result<Vec<u8>, ProtocolError> {
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
                ("numericProfile".into(), Json::string(NUMERIC_PROFILE)),
                ("qualification".into(), Json::String("experimental".into())),
                ("configuration".into(), configuration(engine)),
                (
                    "capabilities".into(),
                    Json::Array(
                        CAPABILITIES
                            .iter()
                            .map(|name| {
                                let mut entry = Json::object([
                                    ("name", Json::string(name)),
                                    ("registryVersion", Json::Number(REGISTRY_VERSION)),
                                    ("scope", Json::string("declared-subject-profile")),
                                    ("implementation", Json::string("partial")),
                                    ("qualification", Json::string("unqualified")),
                                ]);
                                if *name == "toSatisfyRationalPlate" {
                                    if let Json::Object(fields) = &mut entry {
                                        fields.push((
                                            "profile".into(),
                                            crate::certificates::engine::profile(),
                                        ));
                                    }
                                }
                                if *name == "toSatisfyParallelPlaneDistance" {
                                    if let Json::Object(fields) = &mut entry {
                                        fields.push((
                                            "profile".into(),
                                            crate::certificates::parallel_plane::profile(),
                                        ));
                                    }
                                }
                                entry
                            })
                            .collect(),
                    ),
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

fn submit_claims(engine: &Engine, request: &[(String, Json)]) -> Result<Vec<u8>, ProtocolError> {
    let (request_id, plan) = submit_request(request)?;
    let result = engine.evaluate_prepared(PreparedPlan::prepare(plan)?)?;
    encode(&Json::object([
        ("requestId", Json::string(request_id)),
        ("result", result),
    ]))
}

fn canonical_plan_value(plan: &Json) -> Result<Json, ProtocolError> {
    let prepared = PreparedPlan::prepare(plan)?;
    Ok(canonical_plan_envelope(prepared.normalized_plan()))
}

pub(crate) fn canonical_plan_envelope(plan: Json) -> Json {
    Json::object([
        ("protocolVersion", Json::Number(PROTOCOL_VERSION)),
        ("registryVersion", Json::Number(REGISTRY_VERSION)),
        ("canonicalProfile", Json::string(CANONICAL_PROFILE)),
        ("numericProfile", Json::string(NUMERIC_PROFILE)),
        ("plan", plan),
    ])
}

pub(crate) fn validate_versions(request: &[(String, Json)]) -> Result<(), ProtocolError> {
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
            format!(
                "GeoSpec registry version {registry} is incompatible with version {REGISTRY_VERSION}."
            ),
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

pub(crate) fn validate_content_hash(value: &str) -> Result<(), ProtocolError> {
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

pub(crate) fn validate_budget(value: &Json) -> Result<(), ProtocolError> {
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

pub(crate) fn logical_id<'a>(
    object: &'a [(String, Json)],
    key: &str,
) -> Result<&'a str, ProtocolError> {
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

fn invalid_request<T>(message: impl Into<String>) -> Result<T, ProtocolError> {
    Err(ProtocolError::new(ErrorKind::InvalidRequest, message))
}

pub(crate) fn invalid_claim<T>(message: impl Into<String>) -> Result<T, ProtocolError> {
    Err(ProtocolError::new(ErrorKind::InvalidClaim, message))
}

pub(crate) fn as_invalid_claim(error: ProtocolError) -> ProtocolError {
    ProtocolError::new(ErrorKind::InvalidClaim, error.to_string())
}

#[cfg(test)]
mod batch_tests {
    use super::*;
    use serde_json::{json, Value};

    fn fixture(hash: &str) -> (Engine, Rc<Subject>) {
        let engine = Engine::new();
        let retained = Subject::new(hash.into(), SubjectFormat::MeshBufferV1, "mm".into());
        let mesh = Mesh {
            positions: vec![[0.0, 0.0, 0.0], [3.0, 0.0, 0.0], [0.0, 2.0, 1.0]],
            indices: vec![0, 1, 2],
        };
        let _ = retained.mesh_record.set(Rc::new(mesh.analysis_record()));
        let retained = Rc::new(retained);
        let mut engine = engine;
        engine
            .subjects
            .insert(retained.cache_identity().unwrap(), Rc::clone(&retained));
        (engine, retained)
    }

    #[test]
    fn validates_the_complete_batch_before_computing_any_bounds() {
        let hash = "0".repeat(64);
        let (engine, retained) = fixture(&hash);
        let claim = json!({"claimId":"first","capability":"toHaveBoundingBox","subjectSlots":["part"],"polarity":"positive","workUnitBudget":100,"payload":{"kind":"boundingBox","expected":{"size":{"x":3}}}});
        let request = json!({"method":"submitClaims","requestId":"transport","protocolVersion":3,"registryVersion":5,"canonicalProfile":"geospec-jcs-v1","plan":{"subjects":[{"slot":"part","contentHash":hash}],"claims":[claim]}});
        let plan = engine
            .canonical_plan(&serde_json::to_vec(&request).unwrap())
            .unwrap();
        assert!(!retained.mesh_analysis_is_cached());
        let result: Value = serde_json::from_slice(&engine.evaluate_plan(&plan).unwrap()).unwrap();
        assert_eq!(result["results"][0]["status"], "passed");
        assert!(retained.mesh_analysis_is_cached());
        for variant in ["payload", "subject", "budget"] {
            let (engine, retained) = fixture(&hash);
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
            assert_eq!(
                engine
                    .process_request(&serde_json::to_vec(&request).unwrap())
                    .unwrap_err()
                    .code(),
                "invalid-claim",
                "{variant}"
            );
            assert_eq!(
                engine
                    .evaluate_plan(&serde_json::to_vec(&neutral).unwrap())
                    .unwrap_err()
                    .code(),
                "invalid-claim",
                "{variant}"
            );
            assert!(!retained.mesh_analysis_is_cached(), "{variant}");
        }
    }
}
