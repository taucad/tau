//! Backend-neutral, source-attributed PMI inventory; never geometric compliance.

use super::brep::SourceFaceKey;
use serde::Serialize;

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PmiField<T> {
    pub status: PmiFieldStatus,
    pub value: Option<T>,
    pub reason: Option<String>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum PmiFieldStatus {
    Supported,
    Missing,
    Invalid,
    Ambiguous,
    Unsupported,
}

impl<T> PmiField<T> {
    pub fn supported(value: T) -> Self {
        Self {
            status: PmiFieldStatus::Supported,
            value: Some(value),
            reason: None,
        }
    }
    pub fn unavailable(status: PmiFieldStatus, reason: impl Into<String>) -> Self {
        Self {
            status,
            value: None,
            reason: Some(reason.into()),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PmiNumber {
    pub source_id: u32,
    pub authored_text: String,
    pub unit_id: u32,
    pub unit_records: Vec<PmiRawEntity>,
    pub millimetres: String,
    pub name: String,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PmiLimits {
    pub lower_millimetres: String,
    pub upper_millimetres: String,
    pub basis: String,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PmiRawEntity {
    pub source_id: u32,
    pub kind: String,
    pub arguments: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PmiFaceAssociation {
    pub source_face_id: u32,
    pub occurrence_route: Vec<u32>,
    /// None identifies the whole non-assembly representation, not occurrence0.
    pub occurrence: Option<u32>,
    pub public_face_ordinal: u32,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PmiShapeReference {
    pub source_aspect_id: Option<u32>,
    pub source_usage_ids: Vec<u32>,
    pub source_item_ids: Vec<u32>,
    pub requested_route: PmiField<Vec<u32>>,
    pub associations: PmiField<Vec<PmiFaceAssociation>>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PmiRecord {
    pub source_id: u32,
    pub family: String,
    pub channel: String,
    pub kind: String,
    pub name: PmiField<String>,
    pub first: Vec<PmiShapeReference>,
    pub second: Vec<PmiShapeReference>,
    pub numbers: PmiField<Vec<PmiNumber>>,
    pub limits: PmiField<PmiLimits>,
    pub interpretation: PmiField<String>,
    pub raw: Vec<PmiRawEntity>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PmiInventory {
    pub contract: &'static str,
    pub status: String,
    pub file_schema: String,
    /// Exact original header range, retained internally without a wire change.
    #[serde(skip)]
    pub file_schema_span: [usize; 2],
    pub edition_validation: &'static str,
    pub records: Vec<PmiRecord>,
}

impl From<&super::brep::ResolvedSourceFace> for PmiFaceAssociation {
    fn from(value: &super::brep::ResolvedSourceFace) -> Self {
        let SourceFaceKey {
            source_face_entity,
            occurrence_route,
        } = &value.key;
        Self {
            source_face_id: *source_face_entity,
            occurrence_route: occurrence_route.clone(),
            occurrence: Some(value.occurrence),
            public_face_ordinal: value.public_face_ordinal,
        }
    }
}
