//! Applied subject identity. This module hashes bytes; it performs no resource I/O.

use sha2::{Digest, Sha256};
use std::collections::BTreeMap;

use crate::{
    backend::{resources::ResourceBundle, BackendError, BackendErrorKind},
    codec::{self, Json},
};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum Unit {
    Millimetres,
    Centimetres,
    Metres,
    Inches,
    Feet,
}

impl Unit {
    pub(crate) fn parse(value: &str) -> Result<Self, BackendError> {
        match value {
            "mm" => Ok(Self::Millimetres),
            "cm" => Ok(Self::Centimetres),
            "m" => Ok(Self::Metres),
            "in" => Ok(Self::Inches),
            "ft" => Ok(Self::Feet),
            _ => Err(invalid(format!("Unknown geometry unit '{value}'."))),
        }
    }

    pub(crate) const fn name(self) -> &'static str {
        match self {
            Self::Millimetres => "mm",
            Self::Centimetres => "cm",
            Self::Metres => "m",
            Self::Inches => "in",
            Self::Feet => "ft",
        }
    }

    const fn metres(self) -> f64 {
        match self {
            Self::Millimetres => 0.001,
            Self::Centimetres => 0.01,
            Self::Metres => 1.0,
            Self::Inches => 0.0254,
            Self::Feet => 0.3048,
        }
    }
}

/// Only an unchanged z-up frame is implemented. Scale is the decoder's scale.
#[derive(Clone, Copy, Debug)]
pub(crate) struct MeshFrame {
    source: Unit,
    output: Unit,
}

impl MeshFrame {
    pub(crate) fn new(
        coordinate_system: &str,
        source: &str,
        output: &str,
    ) -> Result<Self, BackendError> {
        let source = Unit::parse(source)?;
        let output = Unit::parse(output)?;
        match coordinate_system {
            "z-up" if output == Unit::Millimetres => Ok(Self { source, output }),
            "z-up" => Err(BackendError {
                kind: BackendErrorKind::Unsupported,
                message: "The applied mesh profile requires outputUnit mm.".into(),
            }),
            "y-up" => Err(BackendError {
                kind: BackendErrorKind::Unsupported,
                message: "The applied mesh profile does not implement a y-up axis transform."
                    .into(),
            }),
            _ => Err(invalid(format!(
                "Unknown coordinate system '{coordinate_system}'."
            ))),
        }
    }

    pub(crate) fn uniform_scale(self) -> f64 {
        self.source.metres() / self.output.metres()
    }

    fn json(self) -> Json {
        Json::object([
            ("coordinateSystem", Json::string("z-up")),
            ("sourceUnit", Json::string(self.source.name())),
            ("outputUnit", Json::string(self.output.name())),
            ("uniformScale", Json::Number(self.uniform_scale())),
        ])
    }
}

#[derive(Clone, Copy, Debug)]
pub(crate) enum GltfFormat {
    Json,
    Binary,
}

/// The digest and descriptor cannot be set independently by a host.
#[derive(Clone, Debug)]
pub(crate) struct SubjectIdentity {
    hash: String,
    descriptor: Json,
}

impl SubjectIdentity {
    /// Retained identity payload, counting actual Vec/String capacities.
    pub(crate) fn owned_bytes(&self) -> usize {
        fn heap(value: &Json) -> usize {
            match value {
                Json::String(value) => value.capacity(),
                Json::Array(values) => {
                    values.capacity() * std::mem::size_of::<Json>()
                        + values.iter().map(heap).sum::<usize>()
                }
                Json::Object(fields) => {
                    fields.capacity() * std::mem::size_of::<(String, Json)>()
                        + fields
                            .iter()
                            .map(|(key, value)| key.capacity() + heap(value))
                            .sum::<usize>()
                }
                _ => 0,
            }
        }
        std::mem::size_of::<Self>() + self.hash.capacity() + heap(&self.descriptor)
    }

    /// Binds the original syntax owner without hashing its primary bytes again.
    /// Geometry admission is separate; this descriptor does not assert P1–P4.
    pub(crate) fn rational_plate(
        source: &crate::certificates::plate_syntax::PlateSource,
    ) -> Result<Self, BackendError> {
        use crate::certificates::plate_contract::{BACKEND_PROFILE, INGEST_PROFILE};

        let descriptor = Json::object([
            ("schema", Json::string("geospec-subject-v1")),
            (
                "primary",
                Json::object([
                    ("sha256", Json::string(source.primary_hash())),
                    ("byteLength", byte_length(source.primary_bytes())?),
                ]),
            ),
            ("resources", Json::Array(Vec::new())),
            ("format", Json::string("rational-plate")),
            (
                "frame",
                Json::object([
                    ("coordinateSystem", Json::string("z-up")),
                    ("sourceUnit", Json::string("mm")),
                    ("outputUnit", Json::string("mm")),
                    ("uniformScale", Json::Number(1.0)),
                ]),
            ),
            ("ingestOptions", Json::Object(Vec::new())),
            ("ingestProfile", Json::string(INGEST_PROFILE)),
            ("backendProfile", Json::string(BACKEND_PROFILE)),
        ]);
        let canonical = codec::encode(&descriptor).map_err(|error| invalid(error.to_string()))?;
        Ok(Self {
            hash: digest(&canonical),
            descriptor,
        })
    }

    /// Call after decoding, with the exact resources the decoder consumed.
    /// Profile literals are composition-owned, never supplied in a host request.
    #[cfg(test)]
    pub(crate) fn gltf(
        primary: &[u8],
        resources: &ResourceBundle,
        consumed: &[String],
        format: GltfFormat,
        frame: MeshFrame,
    ) -> Result<Self, BackendError> {
        let resource_hashes = resources
            .entries
            .iter()
            .map(|(name, bytes)| (name.clone(), digest(bytes)))
            .collect();
        Self::gltf_prehashed(
            digest(primary),
            primary.len(),
            resources,
            &resource_hashes,
            consumed,
            format,
            frame,
        )
    }

    pub(crate) fn gltf_prehashed(
        primary_hash: String,
        primary_len: usize,
        resources: &ResourceBundle,
        resource_hashes: &BTreeMap<String, String>,
        consumed: &[String],
        format: GltfFormat,
        frame: MeshFrame,
    ) -> Result<Self, BackendError> {
        let mut names: Vec<_> = consumed.iter().map(String::as_str).collect();
        names.sort_by(|left, right| codec::compare_utf16(left, right));
        names.dedup();
        let mut resource_facts = Vec::with_capacity(names.len());
        for name in names {
            let bytes = resources.entries.get(name).ok_or_else(|| {
                invalid(format!("Consumed geometry resource '{name}' is absent."))
            })?;
            resource_facts.push(Json::object([
                ("name", Json::string(name)),
                (
                    "sha256",
                    Json::string(
                        resource_hashes
                            .get(name)
                            .expect("ingress hashed every validated resource"),
                    ),
                ),
                ("byteLength", byte_length(bytes)?),
            ]));
        }
        let descriptor = Json::object([
            ("schema", Json::string("geospec-subject-v1")),
            (
                "primary",
                Json::object([
                    ("sha256", Json::String(primary_hash)),
                    ("byteLength", byte_length_for_len(primary_len)?),
                ]),
            ),
            ("resources", Json::Array(resource_facts)),
            (
                "format",
                Json::string(match format {
                    GltfFormat::Json => "gltf",
                    GltfFormat::Binary => "glb",
                }),
            ),
            ("frame", frame.json()),
            ("ingestOptions", Json::Object(Vec::new())),
            (
                "ingestProfile",
                Json::string("geospec-gltf-f64-instance-v2"),
            ),
            ("backendProfile", Json::string("portable-gltf-1.4.1-v1")),
        ]);
        let canonical = codec::encode(&descriptor).map_err(|error| invalid(error.to_string()))?;
        Ok(Self {
            hash: digest(&canonical),
            descriptor,
        })
    }

    #[cfg(test)]
    pub(crate) fn step(
        primary: &[u8],
        source_unit: &str,
        scale: f64,
        profile: crate::backend::brep::BrepIdentityProfile,
        name: Option<&str>,
    ) -> Result<Self, BackendError> {
        Self::step_prehashed(
            digest(primary),
            primary.len(),
            source_unit,
            scale,
            profile,
            name,
        )
    }

    /// Reuse the engine's digest after exact source lookup; callers derive it
    /// from the borrowed input bytes, never from host-supplied metadata.
    pub(crate) fn step_prehashed(
        primary_hash: String,
        primary_len: usize,
        source_unit: &str,
        scale: f64,
        profile: crate::backend::brep::BrepIdentityProfile,
        name: Option<&str>,
    ) -> Result<Self, BackendError> {
        if !scale.is_finite() || scale <= 0.0 {
            return Err(invalid("STEP source unit scale is invalid."));
        }
        let descriptor = Json::object([
            ("schema", Json::string("geospec-subject-v1")),
            (
                "primary",
                Json::object([
                    ("sha256", Json::String(primary_hash)),
                    ("byteLength", byte_length_for_len(primary_len)?),
                ]),
            ),
            ("resources", Json::Array(Vec::new())),
            ("format", Json::string("step")),
            (
                "frame",
                Json::object([
                    ("coordinateSystem", Json::string("z-up")),
                    ("sourceUnit", Json::string(source_unit)),
                    ("outputUnit", Json::string("mm")),
                    ("uniformScale", Json::Number(scale)),
                ]),
            ),
            (
                "ingestOptions",
                Json::Object(
                    name.map(|name| vec![("name".into(), Json::string(name))])
                        .unwrap_or_default(),
                ),
            ),
            ("ingestProfile", Json::string(profile.ingest_profile)),
            ("backendProfile", Json::string(profile.backend_profile)),
        ]);
        let canonical = codec::encode(&descriptor).map_err(|error| invalid(error.to_string()))?;
        Ok(Self {
            hash: digest(&canonical),
            descriptor,
        })
    }

    pub(crate) fn primary_hash(&self) -> &str {
        let Json::Object(descriptor) = &self.descriptor else {
            unreachable!()
        };
        let Json::Object(primary) = &descriptor
            .iter()
            .find(|(name, _)| name == "primary")
            .expect("owned primary descriptor")
            .1
        else {
            unreachable!()
        };
        let Json::String(hash) = &primary
            .iter()
            .find(|(name, _)| name == "sha256")
            .expect("owned primary digest")
            .1
        else {
            unreachable!()
        };
        hash
    }

    pub(crate) fn hash(&self) -> &str {
        &self.hash
    }

    pub(crate) fn descriptor(&self) -> &Json {
        &self.descriptor
    }

    pub(crate) fn descriptor_bytes(&self) -> Result<Vec<u8>, BackendError> {
        codec::encode(&self.descriptor).map_err(|error| invalid(error.to_string()))
    }

    #[cfg(test)]
    pub(crate) fn plan_subject(&self, slot: &str) -> Json {
        Json::object([
            ("slot", Json::string(slot)),
            ("subjectHash", Json::string(&self.hash)),
        ])
    }
}

pub(crate) fn digest(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn byte_length(bytes: &[u8]) -> Result<Json, BackendError> {
    byte_length_for_len(bytes.len())
}

fn byte_length_for_len(len: usize) -> Result<Json, BackendError> {
    // Wire representability, not a production binary admission ceiling.
    if len as u128 > 9_007_199_254_740_991 {
        return Err(invalid(
            "Geometry byte length is not an exact JSON integer.",
        ));
    }
    Ok(Json::Number(len as f64))
}

fn invalid(message: impl Into<String>) -> BackendError {
    BackendError {
        kind: BackendErrorKind::InvalidInput,
        message: message.into(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn should_bind_rational_primary_to_adopted_complete_descriptor() {
        // Exact B57 r2 source-authored descriptor/primary, accepted before this code.
        // This tests identity only, not geometric admission or a predicate verdict.
        let primary = br#"{"frame":"artifact-xyz","plate":{"max":["10/1","10/1","2/1"],"min":["0/1","0/1","0/1"]},"schema":"geospec.rational-orthogonal-plate/v1","unit":"mm","windows":[{"max":["5/2","5/2","2/1"],"min":["3/2","3/2","0/1"]},{"max":["17/2","17/2","2/1"],"min":["15/2","15/2","0/1"]}]}"#;
        let source =
            crate::certificates::plate_syntax::PlateSource::decode(primary.to_vec()).unwrap();
        let identity = SubjectIdentity::rational_plate(&source).unwrap();
        assert_eq!(source.primary_bytes(), primary);
        assert_eq!(
            source.primary_hash(),
            "e8f81bc96be92adb804d4805d95226654813c819d5e2e5689b4076072c115e29"
        );
        assert_eq!(identity.primary_hash(), source.primary_hash());
        assert_eq!(
            identity.hash(),
            "3419006b2f24e82260808012e5692df6f5e2fceadc5f41a11c44aa0a87fbf736"
        );
        assert_eq!(
            codec::encode(identity.descriptor()).unwrap(),
            br#"{"backendProfile":"portable-rational-plate-v1","format":"rational-plate","frame":{"coordinateSystem":"z-up","outputUnit":"mm","sourceUnit":"mm","uniformScale":1},"ingestOptions":{},"ingestProfile":"geospec-rational-orthogonal-plate-v1","primary":{"byteLength":272,"sha256":"e8f81bc96be92adb804d4805d95226654813c819d5e2e5689b4076072c115e29"},"resources":[],"schema":"geospec-subject-v1"}"#
        );
    }

    #[test]
    fn should_bind_consumed_resources_and_applied_scale_to_independent_plan_bytes() {
        let fixture: serde_json::Value = serde_json::from_str(include_str!(
            "../../conformance/subject-identity-instance-v2-controls.json"
        ))
        .unwrap();
        let primary = fixture["primaryUtf8"].as_str().unwrap().as_bytes();
        for row in fixture["rows"].as_array().unwrap() {
            let hex = row["resourceHex"].as_str().unwrap();
            let bytes = (0..hex.len())
                .step_by(2)
                .map(|index| u8::from_str_radix(&hex[index..index + 2], 16).unwrap())
                .collect();
            let mut resources = ResourceBundle::default();
            resources.entries.insert("mesh.bin".into(), bytes);
            // Unconsumed resources must not silently enter the subject binding.
            resources.entries.insert("unused.bin".into(), vec![1, 2, 3]);
            let source = if row["id"].as_str().unwrap().ends_with("scale10") {
                "cm"
            } else {
                "mm"
            };
            let identity = SubjectIdentity::gltf(
                primary,
                &resources,
                &["mesh.bin".into(), "mesh.bin".into()],
                GltfFormat::Json,
                MeshFrame::new("z-up", source, "mm").unwrap(),
            )
            .unwrap();
            assert_eq!(identity.hash(), row["subjectHash"].as_str().unwrap());
            assert_eq!(
                codec::encode(identity.descriptor()).unwrap(),
                row["descriptorUtf8"].as_str().unwrap().as_bytes()
            );
            assert_eq!(
                codec::encode(&identity.plan_subject("part")).unwrap(),
                row["planSubjectUtf8"].as_str().unwrap().as_bytes()
            );
        }
    }

    #[test]
    fn should_preserve_unit_and_axis_precedence_before_non_mm_refusal() {
        for output in ["cm", "m", "in", "ft"] {
            let error = MeshFrame::new("z-up", "mm", output).unwrap_err();
            assert_eq!(error.kind, BackendErrorKind::Unsupported);
            assert_eq!(
                error.message,
                "The applied mesh profile requires outputUnit mm."
            );
        }
        assert_eq!(
            MeshFrame::new("y-up", "mm", "cm").unwrap_err().message,
            "The applied mesh profile does not implement a y-up axis transform."
        );
        assert_eq!(
            MeshFrame::new("unknown", "mm", "cm").unwrap_err().message,
            "Unknown coordinate system 'unknown'."
        );
        assert_eq!(
            MeshFrame::new("y-up", "mm", "unknown").unwrap_err().message,
            "Unknown geometry unit 'unknown'."
        );
    }

    #[test]
    fn should_refuse_unknown_units_and_unimplemented_axis_transform() {
        let unknown = MeshFrame::new("z-up", "unknown", "mm").unwrap_err();
        assert_eq!(unknown.kind, BackendErrorKind::InvalidInput);
        assert_eq!(unknown.message, "Unknown geometry unit 'unknown'.");
        let unsupported = MeshFrame::new("y-up", "m", "mm").unwrap_err();
        assert_eq!(unsupported.kind, BackendErrorKind::Unsupported);
        assert_eq!(
            MeshFrame::new("z-up", "m", "mm").unwrap().uniform_scale(),
            1000.0
        );
    }
}
