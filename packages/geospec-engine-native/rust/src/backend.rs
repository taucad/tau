//! Owned data shared by native geometry adapters; no backend types cross this boundary.

use std::{error::Error, fmt};

pub mod brep;
pub mod csg;
pub mod csg_scope;
pub mod resources;

/// Explicit retention limits, separate from control or binary input lengths.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct AnalysisRetentionLimits {
    pub max_mesh_bytes: u64,
    pub max_mesh_entries: u32,
    pub max_solid_entries: u32,
}

/// Indexed triangles with coordinates in the adapter's declared numeric profile.
#[derive(Clone, Debug, PartialEq)]
pub struct TriangleMesh {
    pub positions: Vec<[f64; 3]>,
    pub triangles: Vec<[u32; 3]>,
}

/// Neutral backend failure categories, distinct from matcher results.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum BackendErrorKind {
    InvalidInput,
    Unsupported,
    ComputationFailed,
    BudgetExceeded { limit: u64, used: u64 },
}

/// An owned backend error, without pointers or foreign exception types.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BackendError {
    pub kind: BackendErrorKind,
    pub message: String,
}

impl fmt::Display for BackendError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.message)
    }
}

impl Error for BackendError {}
