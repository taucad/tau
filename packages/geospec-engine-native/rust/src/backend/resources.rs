//! Explicit subject resources; this contract performs no I/O.

use std::collections::BTreeMap;

/// Normalized relative resource names and exact caller-supplied owned bytes.
#[derive(Clone, Debug, Default)]
pub struct ResourceBundle {
    pub entries: BTreeMap<String, Vec<u8>>,
}

/// Named binary admission bounds, independent of JSON and early GSM1 ceilings.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BinaryAdmissionLimits {
    pub profile_id: String,
    pub max_subject_bytes: u64,
    pub max_resource_bytes: u64,
    pub max_total_binary_bytes: u64,
    pub max_vertices: u32,
    pub max_triangles: u32,
    pub max_occurrences: u32,
}
