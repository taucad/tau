//! Shared F1 data and fixed requirement; no geometric admission or proof algorithm.

use std::fmt;

pub const PROFILE: &str = "geospec.rational-orthogonal-plate/v1";
pub const CONTRACT: &str = "geospec.plate-two-windows/v1";
pub const CERTIFICATE_SCHEMA: &str = "geospec.plate-certificate/v1";
pub const INGEST_PROFILE: &str = "geospec-rational-orthogonal-plate-v1";
pub const BACKEND_PROFILE: &str = "portable-rational-plate-v1";
pub const MAX_PRIMARY_BYTES: usize = 64 * 1024;
pub const MAX_WINDOWS: usize = 16;
pub const MAX_GRID_CELLS: u32 = 5000;
pub const MAX_INTEGER_BITS: u64 = 16384;
pub const MAX_OWNED_BYTES: usize = 2 * 1024 * 1024;

/// Exact reduced n/d spelling. Numeric parsing belongs to the syntax primitive.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RationalText(pub String);

pub type Point3 = [RationalText; 3];

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Box3 {
    pub min: Point3,
    pub max: Point3,
}

/// Syntactically valid source, not a proof of positive/separated through-windows.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RawPlate {
    pub plate: Box3,
    pub windows: Vec<Box3>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PlaneLists {
    pub x: Vec<RationalText>,
    pub y: Vec<RationalText>,
    pub z: Vec<RationalText>,
}

/// Producer admission output; the independent checker must not trust this object.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AdmittedPlate {
    pub raw: RawPlate,
    pub planes: PlaneLists,
    pub cell_count: u32,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PredicateValues {
    pub bounds: Box3,
    pub material_volume: RationalText,
    pub material_in_a: RationalText,
    pub material_in_b: RationalText,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MaterialWitnesses {
    pub a: Option<Point3>,
    pub b: Option<Point3>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PlateCertificate {
    pub planes: PlaneLists,
    pub occupied_cells: Vec<u32>,
    pub material_witnesses: MaterialWitnesses,
}

/// Cacheable geometry only: no prior claim/plan metadata or retained BigInt limbs.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PlateAnalysis {
    pub window_count: u32,
    pub cell_count: u32,
    pub measured: PredicateValues,
    pub predicates: [bool; 4],
    pub certificate: PlateCertificate,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VerificationBinding {
    pub subject_content_hash: String,
    pub subject_hash: String,
    pub plan_hash: String,
    pub verifier_source_hash: String,
}

/// Fresh trusted request metadata, supplied by Engine preparation/composition.
pub struct VerificationRequest<'a> {
    pub source: &'a super::plate_syntax::PlateSource,
    pub canonical_plan: &'a [u8],
    pub claim_id: &'a str,
    pub subject_slot: &'a str,
    pub expected_subject_hash: &'a str,
    pub expected_verifier_source_hash: &'a str,
}

/// Certificate and values to check; the checker derives its own geometric truth.
pub struct PlateCandidate<'a> {
    pub binding: &'a VerificationBinding,
    pub analysis: &'a PlateAnalysis,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VerifiedPlate {
    pub measured: PredicateValues,
    pub predicates: [bool; 4],
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum PlateErrorKind {
    InvalidRepresentation,
    UnsupportedDomain,
    ArithmeticLimit,
    Unverified,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PlateError {
    pub kind: PlateErrorKind,
    pub message: String,
}

impl PlateError {
    pub fn new(kind: PlateErrorKind, message: impl Into<String>) -> Self {
        Self {
            kind,
            message: message.into(),
        }
    }
}

impl fmt::Display for PlateError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.message)
    }
}

impl std::error::Error for PlateError {}

/// Ordered logical debits, paid before cold work or the corresponding warm lookup.
pub fn request_charges(cell_count: u32, window_count: u32) -> [u64; 5] {
    [
        1,
        u64::from(cell_count),
        1,
        u64::from(cell_count),
        2 * (u64::from(window_count) + 1),
    ]
}

/// Fixed requirement data; this does not assert any predicate or domain property.
pub fn target_bounds() -> Box3 {
    literal_box(["0/1", "0/1", "0/1"], ["10/1", "10/1", "2/1"])
}

pub fn required_windows() -> [Box3; 2] {
    [
        literal_box(["3/2", "3/2", "0/1"], ["5/2", "5/2", "2/1"]),
        literal_box(["15/2", "15/2", "0/1"], ["17/2", "17/2", "2/1"]),
    ]
}

fn literal_box(min: [&str; 3], max: [&str; 3]) -> Box3 {
    Box3 {
        min: min.map(|value| RationalText(value.into())),
        max: max.map(|value| RationalText(value.into())),
    }
}
