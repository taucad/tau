// Phase 2: Core Types — ported from include/manifold/common.h, include/manifold/polygon.h,
// include/manifold/manifold.h (MeshGLP/Error), src/shared.h (Halfedge, TriRef, Barycentric, TmpEdge)
//
// The bounding-volume types (Box, Rect) live in types_bounds.rs and the
// MeshGLP interchange mesh in types_meshgl.rs; both are re-exported here so
// this module remains the single public home for all core types.

use std::collections::BTreeMap;
use crate::linalg::{Vec2, Vec3, Vec4, Mat3, Mat3x4};
use crate::math;

#[path = "types_bounds.rs"]
mod types_bounds;
pub use types_bounds::{Box, Rect};

#[path = "types_meshgl.rs"]
mod types_meshgl;
pub use types_meshgl::{MeshGLP, MeshGL, MeshGL64, MeshIndex, MeshPrecision};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

pub const K_PI: f64 = std::f64::consts::PI;
pub const K_TWO_PI: f64 = std::f64::consts::TAU;
pub const K_HALF_PI: f64 = std::f64::consts::FRAC_PI_2;
/// Precision used for epsilon calculations relative to bounding-box scale.
pub const K_PRECISION: f64 = 1e-12;

pub const DEFAULT_SEGMENTS: i32 = 0;
pub const DEFAULT_ANGLE: f64 = 10.0;
pub const DEFAULT_LENGTH: f64 = 1.0;

// ---------------------------------------------------------------------------
// Scalar utilities
// ---------------------------------------------------------------------------

#[inline]
pub fn radians(a: f64) -> f64 {
    a * K_PI / 180.0
}

#[inline]
pub fn degrees(a: f64) -> f64 {
    a * 180.0 / K_PI
}

/// Smooth Hermite interpolation between 0 and 1 when edge0 < x < edge1.
#[inline]
pub fn smoothstep(edge0: f64, edge1: f64, a: f64) -> f64 {
    let x = ((a - edge0) / (edge1 - edge0)).clamp(0.0, 1.0);
    x * x * (3.0 - 2.0 * x)
}

/// Sine function where multiples of 90 degrees come out exact.
///
/// Matches C++ `sind` (common.h), which reduces the argument with
/// `std::remquo(x, 90.0, &quo)` — round-to-nearest (ties to even), remainder
/// in [-45, 45]. A floor-based reduction (remainder in [0, 90)) is
/// mathematically equal but differs by ~1 ULP for reduced arguments in
/// (45, 90), which breaks bit-exactness with the C++ reference (e.g. cylinder
/// circle vertices).
pub fn sind(x: f64) -> f64 {
    if !x.is_finite() {
        return f64::NAN;
    }
    if x < 0.0 {
        return -sind(-x);
    }
    // Reconstruct std::remquo(x, 90.0, &quo): quo = nearest integer to the
    // exact x/90 (ties to even), remainder computed exactly. Round the
    // computed quotient, then fix up the rare off-by-one where the rounded
    // double quotient disagrees with the exact one.
    let mut quo = (x / 90.0).round_ties_even() as i64;
    let mut r = x - quo as f64 * 90.0;
    if r > 45.0 {
        quo += 1;
        r -= 90.0;
    } else if r < -45.0 {
        quo -= 1;
        r += 90.0;
    } else if r == 45.0 && quo % 2 != 0 {
        // Exact tie: remquo rounds the quotient to even.
        quo += 1;
        r = -45.0;
    } else if r == -45.0 && quo % 2 != 0 {
        quo -= 1;
        r = 45.0;
    }
    match ((quo % 4) + 4) % 4 {
        0 => math::sin(radians(r)),
        1 => math::cos(radians(r)),
        2 => -math::sin(radians(r)),
        3 => -math::cos(radians(r)),
        _ => 0.0,
    }
}

/// Cosine function where multiples of 90 degrees come out exact.
#[inline]
pub fn cosd(x: f64) -> f64 {
    sind(x + 90.0)
}

// ---------------------------------------------------------------------------
// Polygon types
// ---------------------------------------------------------------------------

/// Single polygon contour, wound CCW. First and last point are implicitly connected.
pub type SimplePolygon = Vec<Vec2>;

/// Set of polygons with holes (arbitrary nesting).
pub type Polygons = Vec<SimplePolygon>;

/// Polygon vertex with index.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct PolyVert {
    pub pos: Vec2,
    pub idx: i32,
}

/// Single indexed polygon contour, wound CCW.
pub type SimplePolygonIdx = Vec<PolyVert>;

/// Set of indexed polygons with holes.
pub type PolygonsIdx = Vec<SimplePolygonIdx>;

// ---------------------------------------------------------------------------
// OpType
// ---------------------------------------------------------------------------

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum OpType {
    Add,
    Subtract,
    Intersect,
}

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum Error {
    NoError,
    NonFiniteVertex,
    NotManifold,
    VertexOutOfBounds,
    PropertiesWrongLength,
    MissingPositionProperties,
    MergeVectorsDifferentLengths,
    MergeIndexOutOfBounds,
    TransformWrongLength,
    RunIndexWrongLength,
    FaceIdWrongLength,
    InvalidConstruction,
    ResultTooLarge,
    InvalidTangents,
    /// The operation was interrupted through a [`crate::cancel::CancelToken`]
    /// and returned an empty result.
    ///
    /// Appended last, matching C++ `Manifold::Error::Cancelled`
    /// (cpp-reference/manifold/include/manifold/manifold.h:139). The order of
    /// every preceding variant is load-bearing: the FFI maps them to status
    /// codes 0-13 positionally, so new variants only ever go on the end.
    Cancelled,
    /// The mesh is not geometrically closed and orientable, so even the
    /// robust (non-manifold) boolean engine cannot interpret it as a solid.
    /// Produced only by the `from_mesh_gl_robust` import path; the strict
    /// import keeps reporting `NotManifold`. FFI status code 15.
    NotClosed,
}

impl Error {
    pub fn to_str(self) -> &'static str {
        match self {
            Error::NoError => "No Error",
            Error::NonFiniteVertex => "Non-Finite Vertex",
            Error::NotManifold => "Not Manifold",
            Error::VertexOutOfBounds => "Vertex Out of Bounds",
            Error::PropertiesWrongLength => "Properties Wrong Length",
            Error::MissingPositionProperties => "Missing Position Properties",
            Error::MergeVectorsDifferentLengths => "Merge Vectors Different Lengths",
            Error::MergeIndexOutOfBounds => "Merge Index Out of Bounds",
            Error::TransformWrongLength => "Transform Wrong Length",
            Error::RunIndexWrongLength => "Run Index Wrong Length",
            Error::FaceIdWrongLength => "Face ID Wrong Length",
            Error::InvalidConstruction => "Invalid Construction",
            Error::ResultTooLarge => "Result Too Large",
            Error::InvalidTangents => "Invalid Tangents",
            Error::Cancelled => "Cancelled",
            Error::NotClosed => "Not Closed",
        }
    }
}

impl std::fmt::Display for Error {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.to_str())
    }
}

// ---------------------------------------------------------------------------
// BooleanEngine (exact vs robust boolean pipeline selection)
// ---------------------------------------------------------------------------

/// Which 3D boolean implementation to run.
///
/// Selection is input-based only: `Auto` never catches panics from the exact
/// engine — a panic there is a bug to report, not a dispatch signal.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Hash)]
pub enum BooleanEngine {
    /// The ported exact pipeline (default). Byte-identical results to the
    /// C++ reference; requires strictly manifold operands.
    #[default]
    Exact,
    /// The robust engine (`src/robust`, Barki et al. 2015): exact rational
    /// arithmetic, accepts closed orientable triangle soup (non-manifold,
    /// disconnected, voids). Slower; triangulation may differ from Exact.
    Robust,
    /// `Exact` unless either operand carries non-manifold soup geometry
    /// (imported via `Manifold::from_mesh_gl_robust`), then `Robust`.
    Auto,
}

/// Which winding numbers count as solid material.
///
/// The robust engine labels every cell of the arrangement with a winding
/// number per operand; this rule turns that integer into "inside" or
/// "outside". It is a *robust-engine* semantic only — the exact engine has no
/// winding labels to reinterpret and ignores the rule entirely.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Hash)]
pub enum WindingRule {
    /// `w >= 1` (default). Inside-out geometry (negative winding) is not
    /// material, so an inverted region of a self-intersecting scan is
    /// discarded — the mathematically standard interpretation of orientation.
    #[default]
    Positive,
    /// `w != 0`. Inside-out geometry is kept as solid, matching the intent of
    /// scans and CAD exports whose shells are wound inconsistently. Chosen
    /// per call for models where dropping the inverted chunk is not what the
    /// user wants.
    Nonzero,
}

static BOOLEAN_ENGINE_DEFAULT: std::sync::atomic::AtomicU8 = std::sync::atomic::AtomicU8::new(0);

/// Process-global default engine, in the style of [`Quality`]: the plain
/// boolean entry points ([`crate::manifold::Manifold::boolean`], CSG-tree
/// evaluation, Minkowski) read this; `_with_engine` variants override it
/// per call.
pub struct BooleanConfig;

impl BooleanConfig {
    pub fn set_default_engine(engine: BooleanEngine) {
        let v = match engine {
            BooleanEngine::Exact => 0u8,
            BooleanEngine::Robust => 1,
            BooleanEngine::Auto => 2,
        };
        BOOLEAN_ENGINE_DEFAULT.store(v, std::sync::atomic::Ordering::Relaxed);
    }

    pub fn default_engine() -> BooleanEngine {
        match BOOLEAN_ENGINE_DEFAULT.load(std::sync::atomic::Ordering::Relaxed) {
            1 => BooleanEngine::Robust,
            2 => BooleanEngine::Auto,
            _ => BooleanEngine::Exact,
        }
    }

    pub fn reset_to_defaults() {
        Self::set_default_engine(BooleanEngine::Exact);
    }
}

// ---------------------------------------------------------------------------
// Quality (static global for circle quantization)
// ---------------------------------------------------------------------------

use std::sync::OnceLock;
use std::sync::Mutex;

struct QualityState {
    min_circular_angle: f64,
    min_circular_edge_length: f64,
    circular_segments: i32,
}

static QUALITY_STATE: OnceLock<Mutex<QualityState>> = OnceLock::new();

fn quality_state() -> &'static Mutex<QualityState> {
    QUALITY_STATE.get_or_init(|| {
        Mutex::new(QualityState {
            min_circular_angle: DEFAULT_ANGLE,
            min_circular_edge_length: DEFAULT_LENGTH,
            circular_segments: DEFAULT_SEGMENTS,
        })
    })
}

pub struct Quality;

impl Quality {
    pub fn set_min_circular_angle(angle: f64) {
        quality_state().lock().unwrap().min_circular_angle = angle;
    }

    pub fn set_min_circular_edge_length(length: f64) {
        quality_state().lock().unwrap().min_circular_edge_length = length;
    }

    pub fn set_circular_segments(n: i32) {
        quality_state().lock().unwrap().circular_segments = n;
    }

    pub fn get_circular_segments(radius: f64) -> i32 {
        let q = quality_state().lock().unwrap();
        if q.circular_segments > 0 {
            return q.circular_segments;
        }
        // Match C++ exactly: int truncation (not ceil), fmin (not fmax), round down to multiple of 4
        let n_seg_a = (360.0 / q.min_circular_angle) as i32;
        let n_seg_l = (2.0 * radius.abs() * K_PI / q.min_circular_edge_length) as i32;
        let mut n_seg = n_seg_a.min(n_seg_l) + 3;
        n_seg -= n_seg % 4;
        n_seg.max(4)
    }

    pub fn reset_to_defaults() {
        let mut q = quality_state().lock().unwrap();
        q.min_circular_angle = DEFAULT_ANGLE;
        q.min_circular_edge_length = DEFAULT_LENGTH;
        q.circular_segments = DEFAULT_SEGMENTS;
    }
}

// ---------------------------------------------------------------------------
// ExecutionParams
// ---------------------------------------------------------------------------

#[derive(Clone, Debug)]
pub struct ExecutionParams {
    pub intermediate_checks: bool,
    pub self_intersection_checks: bool,
    pub process_overlaps: bool,
    pub suppress_errors: bool,
    pub cleanup_triangles: bool,
    pub verbose: i32,
}

impl Default for ExecutionParams {
    fn default() -> Self {
        ExecutionParams {
            intermediate_checks: false,
            self_intersection_checks: false,
            process_overlaps: true,
            suppress_errors: false,
            cleanup_triangles: true,
            verbose: 0,
        }
    }
}

// ---------------------------------------------------------------------------
// Smoothness
// ---------------------------------------------------------------------------

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Smoothness {
    /// The halfedge index = 3 * tri + i
    pub halfedge: usize,
    /// 0 = sharp, 1 = smooth
    pub smoothness: f64,
}

// ---------------------------------------------------------------------------
// RayHit (from include/manifold/common.h)
// ---------------------------------------------------------------------------

/// Result of a RayCast query: a single triangle-ray intersection.
#[derive(Clone, Debug, Default)]
pub struct RayHit {
    /// Triangle index that was hit.
    pub face_id: u64,
    /// Parametric distance along the ray segment in [0, 1].
    /// 0 = origin, 1 = endpoint.
    pub distance: f64,
    /// 3D position of the hit point.
    pub position: Vec3,
    /// Geometric face normal at the hit.
    pub normal: Vec3,
}

// ---------------------------------------------------------------------------
// Halfedge (from src/shared.h)
// ---------------------------------------------------------------------------

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Halfedge {
    pub start_vert: i32,
    pub end_vert: i32,
    pub paired_halfedge: i32,
    pub prop_vert: i32,
}

impl Halfedge {
    pub fn is_forward(&self) -> bool {
        self.start_vert < self.end_vert
    }
}

impl PartialOrd for Halfedge {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for Halfedge {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        if self.start_vert == other.start_vert {
            self.end_vert.cmp(&other.end_vert)
        } else {
            self.start_vert.cmp(&other.start_vert)
        }
    }
}

// ---------------------------------------------------------------------------
// Barycentric (from src/shared.h)
// ---------------------------------------------------------------------------

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Barycentric {
    pub tri: i32,
    pub uvw: Vec4,
}

// ---------------------------------------------------------------------------
// TriRef (from src/shared.h)
// ---------------------------------------------------------------------------

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct TriRef {
    /// Unique ID of the mesh instance of this triangle.
    pub mesh_id: i32,
    /// OriginalID of the mesh this triangle came from.
    pub original_id: i32,
    /// Source face ID.
    pub face_id: i32,
    /// Triangles with same coplanar_id are coplanar.
    pub coplanar_id: i32,
}

impl TriRef {
    pub fn same_face(&self, other: &TriRef) -> bool {
        self.mesh_id == other.mesh_id
            && self.coplanar_id == other.coplanar_id
            && self.face_id == other.face_id
    }
}

// ---------------------------------------------------------------------------
// TmpEdge (from src/shared.h)
// ---------------------------------------------------------------------------

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct TmpEdge {
    pub first: i32,
    pub second: i32,
    pub halfedge_idx: i32,
}

impl TmpEdge {
    pub fn new(start: i32, end: i32, idx: i32) -> Self {
        TmpEdge {
            first: start.min(end),
            second: start.max(end),
            halfedge_idx: idx,
        }
    }
}

impl PartialOrd for TmpEdge {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for TmpEdge {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        if self.first == other.first {
            self.second.cmp(&other.second)
        } else {
            self.first.cmp(&other.first)
        }
    }
}

// ---------------------------------------------------------------------------
// MeshRelationD (from src/impl.h)
// ---------------------------------------------------------------------------

/// Transform relation between meshes.
#[derive(Clone, Debug)]
pub struct Relation {
    pub original_id: i32,
    pub transform: Mat3x4,
    pub back_side: bool,
    /// True when this meshID's contribution to `properties_` slots 0..2 holds
    /// world-frame vertex normals (set by `CalculateNormals` at slot 0).
    /// Carries through Transforms and Booleans; exported as run_flags bit 1.
    /// Per C++ #1718.
    pub has_normals: bool,
}

impl Default for Relation {
    fn default() -> Self {
        Relation {
            original_id: -1,
            transform: Mat3x4::identity(),
            back_side: false,
            has_normals: false,
        }
    }
}

impl Relation {
    /// Normal transform: inverse-transpose of the 3×3 linear part.
    /// Multiply stored-property normals by this to get world-space normals.
    /// Matches C++ Relation::GetNormalTransform()
    pub fn get_normal_transform(&self) -> Mat3 {
        let sign = if self.back_side { -1.0 } else { 1.0 };
        // NormalTransform(M) = inverse(transpose(M)) = (M^T)^{-1}
        self.transform.rotation().transpose().inverse() * sign
    }

    /// Inverse normal transform: transpose of the 3×3 linear part.
    /// Multiply world-space normals by this before storing in properties.
    /// Matches C++ Relation::GetInverseNormalTransform()
    pub fn get_inverse_normal_transform(&self) -> Mat3 {
        let sign = if self.back_side { -1.0 } else { 1.0 };
        // InverseNormalTransform(M) = M^T
        self.transform.rotation().transpose() * sign
    }
}

/// Mesh relation table stored on ManifoldImpl.
#[derive(Clone, Debug, Default)]
pub struct MeshRelationD {
    /// originalID of this Manifold if it is an original; -1 otherwise.
    pub original_id: i32,
    // C++ uses std::map (ordered by meshID); several sites iterate this map
    // and feed the order into output runs and fresh-ID assignment, so an
    // unordered map here breaks determinism and C++ parity.
    pub mesh_id_transform: BTreeMap<i32, Relation>,
    pub tri_ref: Vec<TriRef>,
}

impl MeshRelationD {
    pub fn new() -> Self {
        MeshRelationD {
            original_id: -1,
            mesh_id_transform: BTreeMap::new(),
            tri_ref: Vec::new(),
        }
    }
}

// ---------------------------------------------------------------------------
// Inline utility from shared.h
// ---------------------------------------------------------------------------

/// Return next halfedge index within the same triangle (wraps 0→1→2→0).
#[inline]
pub fn next_halfedge(current: i32) -> i32 {
    let n = current + 1;
    if n % 3 == 0 { n - 3 } else { n }
}

/// Returns the previous halfedge index within the same triangle.
/// For triangle t: PrevHalfedge(3t+i) = 3t + (i+2)%3
pub fn prev_halfedge(current: i32) -> i32 {
    let base = current - (current % 3);
    let pos = (current % 3 + 2) % 3;
    base + pos
}

/// Return next index within 0..3 (wraps 0→1→2→0).
#[inline]
pub fn next3(i: i32) -> i32 {
    let n = i + 1;
    if n == 3 { 0 } else { n }
}

// ---------------------------------------------------------------------------
#[cfg(test)]
#[path = "types_tests.rs"]
mod tests;
