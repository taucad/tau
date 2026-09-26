//! Binary admission and explicit entry configuration for the shared engine.
use crate::protocol::WorkCounter;
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, HashSet},
    rc::Rc,
};

use crate::{
    analysis::mesh::{decode_glb, decode_gltf},
    backend::{
        resources::{BinaryAdmissionLimits, ResourceBundle},
        AnalysisRetentionLimits, BackendError,
    },
    codec::{decode, encode, Json},
    identity::{GltfFormat, MeshFrame, SubjectIdentity},
    protocol::{
        array, field, logical_id, number_field, object, optional_field, require_fields,
        string_field, validate_content_hash, validate_versions,
    },
    subject::{subject_cache_key, Subject, SubjectFormat},
    Engine, ErrorKind, ProtocolError,
};

/// Named implementation-entry bounds, independent of the control JSON ceiling.
/// These values do not certify a production capacity or peak process RSS.
#[derive(Clone, Debug)]
pub struct EngineConfig {
    pub binary: BinaryAdmissionLimits,
    pub analysis: AnalysisRetentionLimits,
    pub max_retained_subjects: u32,
    /// Caller-inclusive allocation; internal multithreading remains disabled.
    pub execution_permits: u32,
}

impl EngineConfig {
    pub fn entry() -> Self {
        Self {
            binary: BinaryAdmissionLimits {
                profile_id: "geospec-entry-binary-v1".into(),
                max_subject_bytes: 64 * 1024 * 1024,
                max_resource_bytes: 64 * 1024 * 1024,
                max_total_binary_bytes: 128 * 1024 * 1024,
                max_vertices: 2_000_000,
                max_triangles: 4_000_000,
                max_occurrences: 65_536,
            },
            analysis: AnalysisRetentionLimits {
                max_mesh_bytes: 256 * 1024 * 1024,
                max_mesh_entries: 256,
                max_solid_entries: 256,
            },
            max_retained_subjects: 32,
            execution_permits: 1,
        }
    }

    /// Validate a host-supplied count before constructing an engine or opening a cache.
    pub fn with_execution_permits(mut self, permits: f64) -> Result<Self, &'static str> {
        let host_cap = std::thread::available_parallelism()
            .map(|count| count.get())
            .unwrap_or(1)
            .min(u32::MAX as usize);
        if !permits.is_finite()
            || permits.fract() != 0.0
            || !(1.0..=host_cap as f64).contains(&permits)
        {
            return Err("Execution permits must be a positive integer including the caller and within the host cap.");
        }
        self.execution_permits = permits as u32;
        Ok(self)
    }
}

fn invalid(message: impl Into<String>) -> ProtocolError {
    ProtocolError::new(ErrorKind::InvalidRequest, message)
}
fn limit(message: impl Into<String>) -> ProtocolError {
    ProtocolError::new(ErrorKind::LimitExceeded, message)
}
fn backend(error: BackendError) -> ProtocolError {
    // Backend failures during admission are input/operation errors, never a
    // successful geometric predicate. Family evaluation has its own mapper.
    ProtocolError::new(
        match error.kind {
            crate::backend::BackendErrorKind::InvalidInput => ErrorKind::InvalidRequest,
            crate::backend::BackendErrorKind::Unsupported => ErrorKind::UnsupportedCapability,
            crate::backend::BackendErrorKind::ComputationFailed => ErrorKind::BackendFailure,
            crate::backend::BackendErrorKind::BudgetExceeded { .. } => ErrorKind::BackendFailure,
        },
        error.to_string(),
    )
}
fn length(fields: &[(String, Json)], key: &str, actual: usize) -> Result<(), ProtocolError> {
    let value = number_field(fields, key)?;
    if value < 0.0
        || value.fract() != 0.0
        || value > 9_007_199_254_740_991.0
        || value != actual as f64
    {
        return Err(invalid(format!(
            "Declared {key} does not match the supplied binary length."
        )));
    }
    Ok(())
}
fn relative_resource(name: &str) -> bool {
    !name.is_empty()
        && !name.contains(['\\', ':', '\0'])
        && name.split('/').all(|part| !matches!(part, "" | "." | ".."))
}

fn mesh_closure_key(
    format: &str,
    source_unit: &str,
    primary_hash: &str,
    primary_len: usize,
    bundle: &ResourceBundle,
) -> (String, BTreeMap<String, String>) {
    fn part(hash: &mut Sha256, bytes: &[u8]) {
        hash.update((bytes.len() as u64).to_le_bytes());
        hash.update(bytes);
    }
    let mut hash = Sha256::new();
    part(&mut hash, b"geospec-mesh-closure-v1");
    part(&mut hash, format.as_bytes());
    part(&mut hash, source_unit.as_bytes());
    part(&mut hash, primary_hash.as_bytes());
    hash.update((primary_len as u64).to_le_bytes());
    let mut resource_hashes = BTreeMap::new();
    for (name, bytes) in &bundle.entries {
        let resource_hash = crate::identity::digest(bytes);
        part(&mut hash, name.as_bytes());
        part(&mut hash, resource_hash.as_bytes());
        hash.update((bytes.len() as u64).to_le_bytes());
        resource_hashes.insert(name.clone(), resource_hash);
    }
    (format!("{:x}", hash.finalize()), resource_hashes)
}

fn decimal_u64(value: &str, name: &str) -> Result<u64, ProtocolError> {
    let parsed = value
        .parse::<u64>()
        .map_err(|_| invalid(format!("Subject handle {name} must be a decimal u64.")))?;
    if parsed == 0 || parsed.to_string() != value {
        return Err(invalid(format!(
            "Subject handle {name} must be a canonical positive decimal u64."
        )));
    }
    Ok(parsed)
}

fn subject_key(fields: &[(String, Json)]) -> Result<(String, &'static str, &str), ProtocolError> {
    let (field, identity, prefix) = match (
        optional_field(fields, "subjectHash"),
        optional_field(fields, "contentHash"),
    ) {
        (Some(Json::String(identity)), None) => {
            ("subjectHash", identity.as_str(), "geospec-subject-v1")
        }
        (None, Some(Json::String(identity))) => {
            ("contentHash", identity.as_str(), "mesh-f32-bounds-v1")
        }
        (Some(_), None) => return Err(invalid("Subject handle subjectHash must be a string.")),
        (None, Some(_)) => return Err(invalid("Subject handle contentHash must be a string.")),
        _ => {
            return Err(invalid(
                "Subject handle requires exactly one of subjectHash or contentHash.",
            ))
        }
    };
    validate_content_hash(identity).map_err(|error| invalid(error.to_string()))?;
    Ok((subject_cache_key(prefix, identity), field, identity))
}

impl Engine {
    /// Borrows the primary bytes and copies them only when the subject retains
    /// its source; owns resource buffers. Geometry never enters JSON.
    pub fn ingest_subject(
        &mut self,
        request: &[u8],
        primary: &[u8],
        resources: Vec<Vec<u8>>,
    ) -> Result<Vec<u8>, ProtocolError> {
        let value = decode(request)?;
        let fields = object(&value, "ingestSubject request")?;
        let names = [
            "method",
            "requestId",
            "protocolVersion",
            "registryVersion",
            "canonicalProfile",
            "format",
            "frame",
            "ingestOptions",
            "primaryByteLength",
            "resources",
        ];
        require_fields(fields, &names, &names, "ingestSubject request")?;
        validate_versions(fields)?;
        if string_field(fields, "method")? != "ingestSubject" {
            return Err(invalid(
                "Binary subject admission requires method ingestSubject.",
            ));
        }
        let request_id = logical_id(fields, "requestId")?;
        let format = string_field(fields, "format")?;
        length(fields, "primaryByteLength", primary.len())?;
        if primary.len() as u64 > self.config.binary.max_subject_bytes {
            return Err(limit(
                "Primary geometry exceeds the configured binary subject limit.",
            ));
        }
        let metadata = array(field(fields, "resources")?, "resources")?;
        if metadata.len() != resources.len() {
            return Err(invalid(
                "Resource metadata and binary buffer counts differ.",
            ));
        }
        let mut names = HashSet::new();
        let mut total = primary.len() as u64;
        // Validate the whole binary closure before moving buffers into the map,
        // decoding primary data, or calling a retained backend.
        for (metadata, bytes) in metadata.iter().zip(&resources) {
            let fields = object(metadata, "resource metadata")?;
            require_fields(
                fields,
                &["name", "byteLength"],
                &["name", "byteLength"],
                "resource metadata",
            )?;
            let name = string_field(fields, "name")?;
            if !relative_resource(name) || !names.insert(name) {
                return Err(invalid(
                    "Resource names must be unique normalized relative paths.",
                ));
            }
            length(fields, "byteLength", bytes.len())?;
            if bytes.len() as u64 > self.config.binary.max_resource_bytes {
                return Err(limit(
                    "Geometry resource exceeds the configured binary resource limit.",
                ));
            }
            total = total
                .checked_add(bytes.len() as u64)
                .ok_or_else(|| limit("Binary closure length overflow."))?;
        }
        if total > self.config.binary.max_total_binary_bytes {
            return Err(limit(
                "Binary closure exceeds the configured total binary limit.",
            ));
        }
        let frame = object(field(fields, "frame")?, "frame")?;
        require_fields(
            frame,
            &["coordinateSystem", "sourceUnit", "outputUnit"],
            &["coordinateSystem", "sourceUnit", "outputUnit"],
            "frame",
        )?;
        let options = object(field(fields, "ingestOptions")?, "ingestOptions")?;
        require_fields(
            options,
            if format == "step" { &["name"] } else { &[] },
            &[],
            "ingestOptions",
        )?;
        let step_name = if optional_field(options, "name").is_some() {
            Some(string_field(options, "name")?)
        } else {
            None
        };
        let response = |identity: &SubjectIdentity| {
            encode(&Json::object([
                ("requestId", Json::string(request_id)),
                (
                    "result",
                    Json::object([(
                        "subject",
                        Json::object([
                            ("subjectHash", Json::string(identity.hash())),
                            ("format", Json::string(format)),
                            ("descriptor", identity.descriptor().clone()),
                        ]),
                    )]),
                ),
            ]))
        };
        let mut bundle = ResourceBundle::default();
        for (metadata, bytes) in metadata.iter().zip(resources) {
            let name = string_field(object(metadata, "resource metadata")?, "name")?;
            bundle.entries.insert(name.into(), bytes);
        }
        let mut pending_mesh_index = None;
        let retained = match format {
            "rational-plate" => {
                if !bundle.entries.is_empty()
                    || string_field(frame, "coordinateSystem")? != "z-up"
                    || string_field(frame, "sourceUnit")? != "mm"
                    || string_field(frame, "outputUnit")? != "mm"
                {
                    return Err(invalid("Rational plate entry requires z-up/mm, unchanged coordinates and no resources."));
                }
                self.observations.add(WorkCounter::Parses, 1);
                let source =
                    crate::certificates::plate_syntax::PlateSource::decode(primary.to_vec())
                        .map_err(|error| invalid(error.to_string()))?;
                self.observations.add(WorkCounter::IdentityBuilds, 1);
                let identity = SubjectIdentity::rational_plate(&source).map_err(backend)?;
                let mut retained = Subject::new(
                    identity.primary_hash().to_owned(),
                    SubjectFormat::RationalPlate,
                    "mm".into(),
                );
                let _ = retained.semantic_identity.set(identity);
                retained.rational_plate = Some(
                    crate::certificates::engine::RationalSubject::new(source)
                        .map_err(|error| limit(error.to_string()))?,
                );
                retained
            }
            "gltf" | "glb" => {
                let applied = MeshFrame::new(
                    string_field(frame, "coordinateSystem")?,
                    string_field(frame, "sourceUnit")?,
                    string_field(frame, "outputUnit")?,
                )
                .map_err(backend)?;
                let primary_hash = crate::identity::digest(primary);
                let (closure_key, resource_hashes) = mesh_closure_key(
                    format,
                    string_field(frame, "sourceUnit")?,
                    &primary_hash,
                    primary.len(),
                    &bundle,
                );
                if let Some(subject) = self
                    .mesh_sources
                    .get(&closure_key)
                    .and_then(|key| self.subjects.get(key))
                {
                    let record = subject.mesh_record.get().expect("admitted mesh record");
                    if record.positions.len() as u64 > u64::from(self.config.binary.max_vertices)
                        || record.triangles.len() as u64
                            > u64::from(self.config.binary.max_triangles)
                    {
                        return Err(limit(
                            "Decoded mesh exceeds configured vertex or triangle limits.",
                        ));
                    }
                    let identity = subject.semantic_identity.get().expect("admitted identity");
                    let response = response(identity)?;
                    self.observations.add(WorkCounter::Admissions, 1);
                    return Ok(response);
                }
                self.observations.add(WorkCounter::Parses, 1);
                let decoded = if format == "gltf" {
                    decode_gltf(primary, &bundle, applied.uniform_scale())
                } else {
                    decode_glb(primary, &bundle, applied.uniform_scale())
                }
                .map_err(|error| invalid(error.to_string()))?;
                if decoded.record.positions.len() as u64
                    > u64::from(self.config.binary.max_vertices)
                    || decoded.record.triangles.len() as u64
                        > u64::from(self.config.binary.max_triangles)
                {
                    return Err(limit(
                        "Decoded mesh exceeds configured vertex or triangle limits.",
                    ));
                }
                self.observations.add(WorkCounter::IdentityBuilds, 1);
                let identity = SubjectIdentity::gltf_prehashed(
                    primary_hash,
                    primary.len(),
                    &bundle,
                    &resource_hashes,
                    &decoded.consumed_resources,
                    if format == "gltf" {
                        GltfFormat::Json
                    } else {
                        GltfFormat::Binary
                    },
                    applied,
                )
                .map_err(backend)?;
                let retained = Subject::new(
                    identity.primary_hash().to_owned(),
                    if format == "gltf" {
                        SubjectFormat::Gltf
                    } else {
                        SubjectFormat::Glb
                    },
                    string_field(frame, "outputUnit")?.into(),
                );
                let _ = retained.semantic_identity.set(identity);
                self.observations.add(WorkCounter::MeshRecords, 1);
                let _ = retained.mesh_record.set(Rc::new(decoded.record));
                // Index only a new semantic subject. Varying irrelevant resources
                // cannot create unbounded aliases for one retained subject.
                let subject_key = retained.cache_identity().map_err(backend)?;
                if !self.subjects.contains_key(&subject_key) {
                    pending_mesh_index = Some((closure_key, subject_key));
                }
                retained
            }
            "step" => {
                if !bundle.entries.is_empty() {
                    return Err(invalid(
                        "Byte-only STEP admission does not support external resources.",
                    ));
                }
                if string_field(frame, "coordinateSystem")? != "z-up"
                    || string_field(frame, "sourceUnit")? != "auto"
                    || string_field(frame, "outputUnit")? != "mm"
                {
                    return Err(invalid(
                        "STEP entry requires z-up, sourceUnit auto and outputUnit mm.",
                    ));
                }
                let connector = self
                    .brep
                    .as_ref()
                    .ok_or_else(|| invalid("This engine composition has no BRep connector."))?;
                let profile = connector.identity_profile();
                let primary_hash = crate::identity::digest(primary);
                for key in self.step_sources.get(&primary_hash).into_iter().flatten() {
                    let Some(subject) = self.subjects.get(key) else {
                        continue;
                    };
                    if subject.pmi_source_bytes() != Some(primary) {
                        continue;
                    }
                    let identity = subject.semantic_identity.get().expect("admitted identity");
                    let descriptor = object(identity.descriptor(), "retained descriptor")?;
                    if field(descriptor, "ingestOptions")?
                        == &Json::Object(
                            step_name
                                .map(|name| vec![("name".into(), Json::string(name))])
                                .unwrap_or_default(),
                        )
                        && string_field(descriptor, "ingestProfile")? == profile.ingest_profile
                        && string_field(descriptor, "backendProfile")? == profile.backend_profile
                    {
                        let response = response(identity)?;
                        self.observations.add(WorkCounter::Admissions, 1);
                        return Ok(response);
                    }
                }
                self.observations.add(WorkCounter::Parses, 1);
                let document = connector.open_step(primary).map_err(backend)?;
                let facts = document.admission_facts().map_err(backend)?;
                if facts.occurrence_count as u64 > u64::from(self.config.binary.max_occurrences) {
                    return Err(limit(
                        "STEP document exceeds the configured occurrence limit.",
                    ));
                }
                self.observations.add(WorkCounter::IdentityBuilds, 1);
                let identity = SubjectIdentity::step_prehashed(
                    primary_hash,
                    primary.len(),
                    &facts.source_length_unit,
                    facts.source_unit_to_millimeters,
                    profile,
                    step_name,
                )
                .map_err(backend)?;
                let mut retained = Subject::new(
                    identity.primary_hash().to_owned(),
                    SubjectFormat::Step,
                    "mm".into(),
                );
                retained.step_admission_facts = Some(facts);
                let _ = retained.semantic_identity.set(identity);
                retained.display_name = step_name.unwrap_or("step").into();
                retained.brep = Some(document);
                // Hash and kernel admission read the borrowed bytes; a retained
                // source is the one copy, at exactly its length.
                if primary.len() <= crate::certificates::parallel_plane::MAX_SOURCE_BYTES
                    && primary.len() as u64 <= self.config.analysis.max_mesh_bytes
                {
                    retained.parallel_plane = Some(
                        crate::certificates::parallel_plane::SourceProof::new(primary.to_vec()),
                    );
                } else if primary.len()
                    <= crate::analysis::parallel_plane_distance::inventory::MAX_SOURCE_BYTES
                    && primary.len() as u64 <= self.config.analysis.max_mesh_bytes
                {
                    retained.pmi_source = Some(primary.to_vec());
                }
                retained
            }
            _ => {
                return Err(invalid(format!(
                    "Unsupported binary subject format '{format}'."
                )))
            }
        };
        let identity = retained
            .semantic_identity
            .get()
            .expect("Full-format admission constructs identity");
        let response = response(identity)?;
        self.admit_retained(retained)?;
        if let Some((closure_key, subject_key)) = pending_mesh_index {
            self.mesh_sources.insert(closure_key, subject_key);
        }
        Ok(response)
    }

    /// Returns stable session metadata for one admitted semantic subject.
    pub fn subject_handle(&self, request: &[u8]) -> Result<Vec<u8>, ProtocolError> {
        let value = decode(request)?;
        let fields = object(&value, "subjectHandle request")?;
        let allowed = [
            "method",
            "requestId",
            "protocolVersion",
            "registryVersion",
            "canonicalProfile",
            "subjectHash",
            "contentHash",
        ];
        let required = [
            "method",
            "requestId",
            "protocolVersion",
            "registryVersion",
            "canonicalProfile",
        ];
        require_fields(fields, &allowed, &required, "subjectHandle request")?;
        validate_versions(fields)?;
        if string_field(fields, "method")? != "subjectHandle" {
            return Err(invalid(
                "Subject handle acquisition requires method subjectHandle.",
            ));
        }
        let request_id = logical_id(fields, "requestId")?;
        let (key, identity_field, identity) = subject_key(fields)?;
        if !self.subjects.contains_key(&key) {
            return Err(invalid(
                "Subject handle identity is not admitted in this Engine.",
            ));
        }
        let generation = self.subject_generations.get(&key).ok_or_else(|| {
            ProtocolError::new(
                ErrorKind::BackendFailure,
                "Admitted subject has no lifecycle generation.",
            )
        })?;
        encode(&Json::object([
            ("requestId", Json::string(request_id)),
            (
                "result",
                Json::object([(
                    "subjectHandle",
                    Json::object([
                        ("owner", Json::string(&self.owner.to_string())),
                        ("generation", Json::string(&generation.to_string())),
                        (identity_field, Json::string(identity)),
                    ]),
                )]),
            ),
        ]))
    }

    /// Releases one generation-checked subject and all subject-owned retention.
    pub fn release_subject(&mut self, request: &[u8]) -> Result<Vec<u8>, ProtocolError> {
        let value = decode(request)?;
        let fields = object(&value, "releaseSubject request")?;
        let names = [
            "method",
            "requestId",
            "protocolVersion",
            "registryVersion",
            "canonicalProfile",
            "subjectHandle",
        ];
        require_fields(fields, &names, &names, "releaseSubject request")?;
        validate_versions(fields)?;
        if string_field(fields, "method")? != "releaseSubject" {
            return Err(invalid("Subject release requires method releaseSubject."));
        }
        let request_id = logical_id(fields, "requestId")?;
        let handle = object(field(fields, "subjectHandle")?, "subjectHandle")?;
        require_fields(
            handle,
            &["owner", "generation", "subjectHash", "contentHash"],
            &["owner", "generation"],
            "subjectHandle",
        )?;
        let owner = decimal_u64(string_field(handle, "owner")?, "owner")?;
        if owner != self.owner {
            return Err(invalid(
                "Subject handle belongs to a different Engine owner.",
            ));
        }
        let generation = decimal_u64(string_field(handle, "generation")?, "generation")?;
        let (key, _, _) = subject_key(handle)?;
        let Some(current) = self.subject_generations.get(&key).copied() else {
            return encode(&Json::object([
                ("requestId", Json::string(request_id)),
                ("result", Json::object([("released", Json::Bool(false))])),
            ]));
        };
        if current != generation {
            return Err(invalid(
                "Subject handle generation does not match the admitted subject.",
            ));
        }
        let mut connector = self.csg.borrow_mut();
        if let Some(connector) = connector.as_mut() {
            self.retained_solids
                .borrow_mut()
                .release_subject(&key, connector.as_mut())
                .map_err(|error| {
                    ProtocolError::new(ErrorKind::BackendFailure, error.to_string())
                })?;
        }
        if let Some(subject) = self.subjects.get(&key) {
            if subject.format == SubjectFormat::Step && subject.pmi_source_bytes().is_some() {
                let primary_hash = subject.content_hash.clone();
                if let Some(keys) = self.step_sources.get_mut(&primary_hash) {
                    keys.retain(|candidate| candidate != &key);
                    if keys.is_empty() {
                        self.step_sources.remove(&primary_hash);
                    }
                }
            }
        }
        self.subjects.remove(&key);
        self.mesh_sources
            .retain(|_, subject_key| subject_key != &key);
        self.resident_overlaps.borrow_mut().prune();
        self.subject_generations.remove(&key);
        encode(&Json::object([
            ("requestId", Json::string(request_id)),
            ("result", Json::object([("released", Json::Bool(true))])),
        ]))
    }

    pub(crate) fn admit_retained(&mut self, mut retained: Subject) -> Result<(), ProtocolError> {
        retained.observations = Rc::clone(&self.observations);
        self.observations.add(WorkCounter::Admissions, 1);
        retained.retention_limits = self.config.analysis;
        retained.binary_limits = self.config.binary.clone();
        retained.resident_overlaps = Some(self.resident_overlaps.clone());
        retained.overlap_cache.clone_from(&self.overlap_cache);
        retained
            .producer_identity
            .clone_from(&self.producer_identity);
        let key = retained.cache_identity().map_err(backend)?;
        if self.subjects.contains_key(&key) {
            return Ok(());
        }
        if self.subjects.len() as u64 >= u64::from(self.config.max_retained_subjects) {
            return Err(limit(
                "Engine exceeds the configured retained subject count.",
            ));
        }
        let generation = self
            .next_generation
            .checked_add(1)
            .ok_or_else(|| limit("Engine subject generation counter exhausted."))?;
        if let Some(plate) = &retained.rational_plate {
            let metadata_bytes = std::mem::size_of::<Subject>()
                + 2 * std::mem::size_of::<usize>()
                + key.capacity()
                + retained.content_hash.capacity()
                + retained.source_unit.capacity()
                + retained.display_name.capacity()
                + retained
                    .semantic_identity
                    .get()
                    .expect("rational identity")
                    .owned_bytes();
            plate
                .attach(&self.plate_retention, metadata_bytes)
                .map_err(|error| limit(error.to_string()))?;
        }
        self.next_generation = generation;
        self.subject_generations.insert(key.clone(), generation);
        if retained.format == SubjectFormat::Step && retained.pmi_source_bytes().is_some() {
            self.step_sources
                .entry(retained.content_hash.clone())
                .or_default()
                .push(key.clone());
        }
        self.subjects.insert(key, Rc::new(retained));
        Ok(())
    }
}
impl Engine {
    /// Configure the standalone core-only binding without changing its serial execution.
    pub fn with_execution_permits(permits: f64) -> Result<Self, &'static str> {
        let config = EngineConfig::entry().with_execution_permits(permits)?;
        let mut engine = Self::new();
        engine.config = config;
        Ok(engine)
    }
}
#[cfg(test)]
mod execution_permit_tests {
    use super::EngineConfig;

    #[test]
    fn validates_caller_inclusive_execution_permits() {
        let host_cap = std::thread::available_parallelism()
            .map(|count| count.get())
            .unwrap_or(1)
            .min(u32::MAX as usize);
        assert_eq!(EngineConfig::entry().execution_permits, 1);
        assert_eq!(
            EngineConfig::entry()
                .with_execution_permits(host_cap as f64)
                .unwrap()
                .execution_permits,
            host_cap as u32
        );
        for invalid in [
            0.0,
            -1.0,
            1.5,
            f64::NAN,
            f64::INFINITY,
            host_cap as f64 + 1.0,
        ] {
            assert!(EngineConfig::entry()
                .with_execution_permits(invalid)
                .is_err());
        }
    }
}
