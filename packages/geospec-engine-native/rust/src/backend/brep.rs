//! Owned BRep facts and thread-confined retained query contract.

use super::{BackendError, TriangleMesh};
use serde::Serialize;
use std::{collections::BTreeMap, rc::Rc};

/// Complete analytic boundary certificate for the declared continuous wall domain.
/// Kernel/model tolerance is evidence, not an exact-real certification.
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContinuousWallDomain {
    pub maximum_topology_tolerance_mm: f64,
    pub domain: ContinuousWallShape,
}

/// Qualified nominal domain of one actual located occurrence. Domain indices
/// remain local to its certificate; these complete maps bind them to existing
/// occurrence face/edge query addresses. They do not imply a whole-document or
/// arbitrary tolerance-bearing STEP exact-real proof.
#[derive(Clone, Debug, PartialEq)]
pub struct SelectedContinuousDomain {
    pub occurrence: u32,
    pub domain: ContinuousWallDomain,
    /// Entry i-1 maps domain-local one-based face i to a one-based occurrence
    /// face query ordinal (max6 entries).
    pub domain_face_to_occurrence_face: Vec<u32>,
    /// Entry i-1 maps domain-local one-based edge i to a one-based occurrence
    /// edge query ordinal (max12 entries).
    pub domain_edge_to_occurrence_edge: Vec<u32>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase"
)]
pub enum ContinuousWallShape {
    AxisAlignedBox {
        corners: [[f64; 3]; 8],
        face_indices: [u32; 6],
        face_corner_indices: [[u32; 4]; 6],
        outward_normals: [[f64; 3]; 6],
        opposite_face_pairs: [[u32; 2]; 3],
        edge_lengths: [f64; 3],
    },
    RightCircularCylinder {
        origin: [f64; 3],
        axis: [f64; 3],
        radius: f64,
        from: f64,
        to: f64,
        lateral_face: u32,
        cap_faces: [u32; 2],
        lateral_parameter_bounds: [f64; 4],
        rim_centers: [[f64; 3]; 2],
        rim_radii: [f64; 2],
        rim_edge_indices: [u32; 2],
        seam_edge_index: u32,
        periodic_attachment: CylinderPeriodicAttachment,
    },
}

/// Raw periodic attachment facts for the narrowly qualified phase-zero cell.
/// Complete affine correspondence and regular topology remain backend-asserted
/// premises; these fields alone are not an arbitrary STEP proof certificate.
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CylinderPeriodicAttachment {
    pub profile: CylinderAttachmentProfile,
    pub phase_x: [f64; 3],
    pub phase_y: [f64; 3],
    pub surface_period: f64,
    pub rim_curve_ranges: [[f64; 2]; 2],
    pub rim_curve_periods: [f64; 2],
    pub cap_pcurve_ranges: [[f64; 2]; 2],
    pub cap_pcurve_periods: [f64; 2],
    pub cap_pcurve_stored: [bool; 2],
    pub seam_curve_range: [f64; 2],
    pub lateral_boundary: [CylinderBoundaryUse; 4],
    pub vertices: [CylinderVertex; 2],
    pub seam_vertex_indices: [u32; 2],
    pub rim_vertex_indices: [[u32; 2]; 2],
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
pub enum CylinderAttachmentProfile {
    #[serde(rename = "geospec-cylinder-phase-zero-attachment-v1")]
    PhaseZeroV1,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum CylinderBoundaryOrientation {
    Forward,
    Reversed,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum CylinderBoundarySide {
    U0,
    U1,
    V0,
    V1,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CylinderBoundaryUse {
    pub edge_index: u32,
    pub orientation: CylinderBoundaryOrientation,
    pub side: CylinderBoundarySide,
    pub curve_range: [f64; 2],
    pub pcurve_stored: bool,
    pub parameter_endpoints: [[f64; 2]; 2],
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CylinderVertex {
    pub vertex_index: u32,
    pub point: [f64; 3],
}

/// Original Part21 face identity and its complete root-to-leaf occurrence route.
/// The route contains at most 32 original NAUO entity labels, never XDE names.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SourceFaceKey {
    pub source_face_entity: u32,
    pub occurrence_route: Vec<u32>,
}

/// Forward transfer association for independently source-derived geometry.
/// Private query addresses must never become public canonical face identities.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ResolvedSourceFace {
    pub key: SourceFaceKey,
    pub occurrence: u32,
    pub public_face_ordinal: u32,
    pub private_query_face: u32,
    /// Original Part21 `ADVANCED_FACE.same_sense`.
    pub source_same_sense: bool,
    /// Whether the located transferred face has `TopAbs_REVERSED` orientation.
    pub transferred_reversed: bool,
}

/// Cheap retained XDE admission metadata; obtaining it must not tessellate.
#[derive(Clone, Debug, PartialEq)]
pub struct BrepAdmissionFacts {
    pub source_length_unit: String,
    pub source_unit_to_millimeters: f64,
    pub occurrence_count: usize,
}

/// Bounded public-subject metadata captured by the same successful STEP read.
/// Returning this record declares support for the native STEP subject profile.
#[derive(Clone, Debug, PartialEq)]
pub struct StepSubjectMetadata {
    pub schema: Option<String>,
    pub source_byte_length: usize,
    pub free_shape_count: usize,
    pub native_read_stream: bool,
}

/// One coherent fixed-profile report. The core owns its successful retention;
/// entity ordinals still address immutable nominal query shapes.
#[derive(Clone, Debug)]
pub struct ReportedBrepBundle {
    pub facts: Rc<DocumentFacts>,
    pub whole_faces: Rc<[LocatedFace]>,
    pub occurrence_faces: Vec<Rc<[LocatedFace]>>,
    pub mesh: Rc<TriangleMesh>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentFacts {
    pub source_length_unit: String,
    pub source_unit_to_millimeters: f64,
    pub products: Vec<ProductFacts>,
    pub occurrences: Vec<OccurrenceFacts>,
    pub shape: ShapeFacts,
    pub faces: Vec<FaceFacts>,
    pub subshapes: Vec<SubshapeFacts>,
    pub datum_placements: Vec<DatumPlacementFacts>,
    pub semantic_datums: Vec<SemanticDatumFacts>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProductFacts {
    pub label: String,
    pub name: String,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OccurrenceFacts {
    pub label: String,
    pub product_label: String,
    pub name: String,
    pub placement: [f64; 12],
    pub bounds: Bounds,
    pub path: String,
    pub parent: Option<u32>,
    pub product: u32,
    pub product_name: String,
    pub instance_name: Option<String>,
    pub ordinal_path: Vec<u32>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShapeFacts {
    pub valid: bool,
    pub bounds: Bounds,
    pub volume: f64,
    pub surface_area: f64,
    pub center_of_mass: [f64; 3],
    pub topology: TopologyCounts,
}

#[derive(Clone, Copy, Debug, PartialEq, Serialize)]
pub struct Bounds {
    pub min: [f64; 3],
    pub max: [f64; 3],
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TopologyCounts {
    pub compounds: usize,
    pub solids: usize,
    pub shells: usize,
    pub faces: usize,
    pub wires: usize,
    pub edges: usize,
    pub vertices: usize,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FaceFacts {
    pub index: u32,
    pub parameter_bounds: [f64; 4],
    pub area: f64,
    pub center_of_mass: [f64; 3],
    pub surface: SurfaceFacts,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum SurfaceFacts {
    Plane {
        origin: [f64; 3],
        normal: [f64; 3],
    },
    Cylinder {
        origin: [f64; 3],
        axis: [f64; 3],
        radius: f64,
    },
    Cone {
        origin: [f64; 3],
        axis: [f64; 3],
        reference_radius: f64,
        semi_angle: f64,
    },
    Sphere {
        center: [f64; 3],
        radius: f64,
    },
    Torus {
        center: [f64; 3],
        axis: [f64; 3],
        major_radius: f64,
        minor_radius: f64,
    },
    Bezier {
        u_degree: u32,
        v_degree: u32,
        u_poles: u32,
        v_poles: u32,
    },
    Bspline {
        u_degree: u32,
        v_degree: u32,
        u_poles: u32,
        v_poles: u32,
        u_knots: u32,
        v_knots: u32,
        u_rational: bool,
        v_rational: bool,
    },
    Revolution,
    Extrusion,
    Offset,
    Other,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum SubshapeType {
    Face,
    Edge,
    Vertex,
    Solid,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SubshapeFacts {
    pub occurrence: Option<u32>,
    pub occurrence_path: String,
    pub name: String,
    pub shape_type: SubshapeType,
    pub face_index: Option<u32>,
    pub shape_label: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DatumPlacementFacts {
    pub occurrence: Option<u32>,
    pub occurrence_path: String,
    pub name: String,
    pub origin: [f64; 3],
    pub x_axis: [f64; 3],
    pub z_axis: [f64; 3],
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SemanticDatumFacts {
    pub occurrence: Option<u32>,
    pub occurrence_path: String,
    pub label: String,
    pub feature_name: Option<String>,
    pub face_indices: Vec<u32>,
}

/// Entity ordinals are local to one retained subject, never foreign pointers.
#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
pub enum BrepEntity {
    Whole,
    WholeFace(u32),
    Occurrence(u32),
    Face { occurrence: u32, face: u32 },
}

/// Positive finite deflections; validated before a query is issued.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct TessellationProfile {
    pub linear_deflection_mm: f64,
    pub angular_deflection_rad: f64,
}

#[derive(Clone, Debug, PartialEq)]
pub struct LocatedFace {
    pub entity: BrepEntity,
    pub facts: FaceFacts,
    pub bounds: Bounds,
    pub reversed: bool,
    pub edge_indices: Vec<u32>,
    pub shape_label: Option<String>,
}

#[derive(Clone, Debug, PartialEq)]
pub enum CurveFacts {
    Line {
        origin: [f64; 3],
        direction: [f64; 3],
    },
    Circle {
        center: [f64; 3],
        axis: [f64; 3],
        radius: f64,
    },
    Ellipse {
        center: [f64; 3],
        axis: [f64; 3],
        major_radius: f64,
        minor_radius: f64,
    },
    Bspline,
    Other,
}

#[derive(Clone, Debug, PartialEq)]
pub struct EdgeFacts {
    pub index: u32,
    pub length: f64,
    pub bounds: Bounds,
    pub start: [f64; 3],
    pub end: [f64; 3],
    pub curve: CurveFacts,
}

#[derive(Clone, Debug, PartialEq)]
pub struct ValidityCheck {
    pub shape: String,
    pub status: String,
}

#[derive(Clone, Debug, PartialEq)]
pub struct SmallEdge {
    pub length: f64,
    pub shape: Option<String>,
    pub location: Option<[f64; 3]>,
}

/// None means not measured; an empty measured vector is still evidence.
#[derive(Clone, Debug, PartialEq)]
pub struct ValidityFacts {
    pub valid: bool,
    pub checks: Option<Vec<ValidityCheck>>,
    pub max_tolerance: Option<f64>,
    pub free_bounds: Option<u32>,
    pub small_edges: Option<Vec<SmallEdge>>,
    pub same_parameter: Option<bool>,
    pub closed_shells: Option<bool>,
    pub closed_solids: Option<bool>,
    pub solid_count: Option<u32>,
    pub invalid_solid_count: Option<u32>,
    pub open_edge_count: Option<u32>,
    pub closed_wires: Option<bool>,
    pub reason: Option<String>,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Extrema {
    pub distance: f64,
    pub point_a: [f64; 3],
    pub point_b: [f64; 3],
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum PointState {
    In,
    On,
    Out,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct CommonVolume {
    pub volume: f64,
    pub centroid: [f64; 3],
}

/// Source wall facet options, with units stated at the connector boundary.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct WallOptions {
    pub work_unit_budget: u64,
    pub mesh_linear_tolerance_mm: f64,
    pub mesh_angular_tolerance_degrees: f64,
}

#[derive(Clone, Debug, PartialEq)]
pub struct WallSupport {
    pub face_index: Option<u32>,
    pub surface_type: Option<String>,
    pub support_type: Option<String>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct WallThickness {
    /// Actual completed logical requests reported by the kernel.
    pub consumed: u64,
    pub value: f64,
    pub location: Option<[f64; 3]>,
    pub point_a: Option<[f64; 3]>,
    pub point_b: Option<[f64; 3]>,
    pub solid_index: Option<u32>,
    pub tie_count: Option<u32>,
    pub algorithm: String,
    pub tolerance: f64,
    pub support_a: Option<WallSupport>,
    pub support_b: Option<WallSupport>,
    pub rejections: BTreeMap<String, u32>,
}

#[derive(Clone, Debug, PartialEq)]
// Preserve the inline connector return contract; boxing adds a per-query
// allocation and changes callers outside the core quality scope.
#[allow(clippy::large_enum_variant)]
pub enum WallThicknessOutcome {
    Measured(WallThickness),
    Empty {
        consumed: u64,
        rejections: BTreeMap<String, u32>,
    },
    BudgetExceeded {
        consumed: u64,
        limit: u64,
    },
}

/// Validated regular-solid difference facts. Zero residual volume alone never
/// establishes containment: contained follows empty residual solid topology.
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RegularSolidContainment {
    pub contained: bool,
    pub residual_solid_count: u32,
    pub residual_volume: f64,
    pub residual_bounds: Option<Bounds>,
    pub residual_center_of_mass: Option<[f64; 3]>,
}

/// Qualified full cylindrical-band trim; distances are along the unit axis.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct CylinderAxialExtent {
    pub origin: [f64; 3],
    pub axis: [f64; 3],
    pub radius: f64,
    pub from: f64,
    pub to: f64,
}

/// Associated closed lateral band under the nominal reconstruction profile.
/// Raw axis/frame values are retained; the nominal axis is mathematically
/// normalized. Tolerance-qualified attachment is not source-exact STEP or an
/// exact-real assertion about the stored periodic span. No caps are included.
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NominalCylindricalBand {
    pub profile: CylindricalBandProfile,
    pub occurrence: u32,
    pub public_face_ordinal: u32,
    pub private_query_face: u32,
    pub source_face_entity: u32,
    pub source_route_count: u32,
    /// The first source_route_count entries are the original NAUO route.
    pub source_route: [u32; 32],
    pub source_same_sense: bool,
    pub transferred_reversed: bool,
    pub origin: [f64; 3],
    pub axis: [f64; 3],
    pub phase_x: [f64; 3],
    pub phase_y: [f64; 3],
    pub radius: f64,
    pub from: f64,
    pub to: f64,
    /// Raw U0,U1,V0,V1, without snapping or replacing the stored period.
    pub parameter_bounds: [f64; 4],
    pub surface_period: f64,
    /// Ordered by nominal lower/upper station. Edge IDs are face-local 1..3.
    pub rims: [CylindricalBandRim; 2],
    pub seam_edge_index: u32,
    pub seam_origin: [f64; 3],
    pub seam_axis: [f64; 3],
    pub seam_curve_range: [f64; 2],
    pub seam_vertex_indices: [u32; 2],
    pub boundary: [CylinderBoundaryUse; 4],
    /// Complete face-local vertex inventory, one-based IDs 1..2.
    pub vertices: [CylinderVertex; 2],
    pub face_tolerance_mm: f64,
    pub edge_tolerances_mm: [f64; 3],
    pub vertex_tolerances_mm: [f64; 2],
    /// Radius times absolute raw U-span minus stored surface period.
    pub period_residual_mm: f64,
    pub boundary_residuals: [CylindricalBandBoundaryResidual; 4],
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
pub enum CylindricalBandProfile {
    #[serde(rename = "geospec-nominal-cylindrical-band-clearance-v1")]
    NominalV1,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CylindricalBandRim {
    pub edge_index: u32,
    pub center: [f64; 3],
    pub axis: [f64; 3],
    pub phase_x: [f64; 3],
    pub phase_y: [f64; 3],
    pub radius: f64,
    pub curve_range: [f64; 2],
    pub curve_period: f64,
    pub vertex_indices: [u32; 2],
}

/// Admission residuals in millimetres, not downstream predicate error bounds.
/// The limit is the maximum tolerance of this face, edge and its vertices.
#[derive(Clone, Copy, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CylindricalBandBoundaryResidual {
    pub parameter_coverage_mm: f64,
    pub curve_surface_mm: f64,
    pub vertex_attachment_mm: f64,
    pub limit_mm: f64,
}

/// Fixed entry limits for the kernel-model straight-bore inventory. These do
/// not bound kernel temporary memory or elapsed work.
pub const MAX_CIRCULAR_BORE_CANDIDATES: usize = 4096;
pub const MAX_CIRCULAR_BORE_OWNED_BYTES: u64 = 1024 * 1024;

/// Fixed limits for the complete per-face edge-treatment inventory. They bound
/// retained transfer and Rust-owned evidence, not transient kernel work.
pub const MAX_EDGE_TREATMENT_ROWS: usize = 4096;
pub const MAX_EDGE_TREATMENT_BOUNDARY_USES: usize = 8;
pub const MAX_EDGE_TREATMENT_RESIDUALS: usize = 16;
pub const MAX_EDGE_TREATMENT_OWNED_BYTES: u64 = 1024 * 1024;

/// One nonplanar public Explorer face, including unsupported representations.
/// Every candidate must return a disposition; an omitted row is not absence.
#[derive(Clone, Debug, PartialEq)]
pub struct CircularBoreCandidate {
    pub public_face_ordinal: u32,
    pub private_query_face: u32,
    pub disposition: CircularBoreDisposition,
}

#[derive(Clone, Debug, PartialEq)]
pub enum CircularBoreDisposition {
    Qualified(CircularBoreTopology),
    NonMember(CircularBoreNonMember),
    Unqualified(CircularBoreUnqualified),
}

/// Complete local bore evidence from one actual located regular solid. This is
/// a kernel-model topology record, not an exact-real source certificate.
#[derive(Clone, Debug, PartialEq)]
pub struct CircularBoreTopology {
    /// Zero-based unique solid ordinal in the nominal whole document.
    pub owning_solid_ordinal: u32,
    pub band: CylinderAxialExtent,
    /// Ordered by the band's finite from/to stations.
    pub ends: [CircularBoreEnd; 2],
    pub maximum_topology_tolerance_mm: f64,
    /// Successful valid Common may contain shared boundary topology. Its solid
    /// count must be zero; measured volume is never the membership criterion.
    pub interior_residual_solid_count: u32,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct CircularBoreEnd {
    /// One-based edge ordinal in this owning solid's unique topology map.
    pub owning_solid_edge_ordinal: u32,
    pub adjacent_public_face_ordinal: u32,
    pub termination: CircularBoreTermination,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum CircularBoreTermination {
    Mouth,
    PlanarDiskBottom,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum CircularBoreNonMember {
    ExteriorCylinder,
    SealedCavity,
    ObstructedInterior,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum CircularBoreUnqualified {
    UnsupportedSurface,
    UnsupportedOrientation,
    AmbiguousOwnership,
    InvalidSolid,
    IncompleteBand,
    UnsupportedTermination,
    AmbiguousAssociation,
}

/// Core-retained successful inventory; adapters retain no copy or Boolean
/// intermediates. Capacity, not only length, participates in owned accounting.
#[derive(Clone, Debug, PartialEq)]
pub struct CircularBoreInventory {
    pub candidates: Vec<CircularBoreCandidate>,
}

/// Clear finite bore in one complete regular closed selected material solid.
/// Unlike the whole-document A7 inventory, every face/edge address here is
/// local to `band.occurrence`. Extra material in that occurrence is excluded.
#[derive(Clone, Debug, PartialEq)]
pub struct SelectedBoreVoid {
    pub band: NominalCylindricalBand,
    pub ends: [CircularBoreEnd; 2],
    pub maximum_topology_tolerance_mm: f64,
}

/// Complete selected regular material, not a lateral-face approximation.
/// The bore variant is enclosed by the band's end slab with clear bore
/// interior; the cylinder variant is its complete nominal capped cylinder.
#[derive(Clone, Debug, PartialEq)]
pub enum SelectedInterferenceMaterial {
    BoreSlab(NominalCylindricalBand),
    FiniteCylinder(NominalCylindricalBand),
}

impl CircularBoreInventory {
    pub fn owned_bytes(&self) -> u64 {
        (std::mem::size_of::<Self>() as u64).saturating_add(
            (self.candidates.capacity() as u64)
                .saturating_mul(std::mem::size_of::<CircularBoreCandidate>() as u64),
        )
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct EdgeTreatmentCounts {
    pub public_face_count: u32,
    pub candidate_edge_use_count: u32,
}

#[derive(Clone, Debug, PartialEq)]
pub struct EdgeTreatmentInventory {
    pub counts: EdgeTreatmentCounts,
    pub rows: Vec<EdgeTreatmentRow>,
}

impl EdgeTreatmentInventory {
    pub fn owned_bytes(&self) -> u64 {
        let mut bytes = (std::mem::size_of::<Self>() as u64).saturating_add(
            (self.rows.capacity() as u64)
                .saturating_mul(std::mem::size_of::<EdgeTreatmentRow>() as u64),
        );
        for row in &self.rows {
            bytes = bytes
                .saturating_add(row.occurrence_path.capacity() as u64)
                .saturating_add(
                    row.source_face_key
                        .as_ref()
                        .map_or(0, |value| value.capacity() as u64),
                )
                .saturating_add(match &row.label {
                    EdgeTreatmentLabel::Unique(value) => value.capacity() as u64,
                    EdgeTreatmentLabel::Absent | EdgeTreatmentLabel::Ambiguous => 0,
                })
                .saturating_add(row.chamfer.owned_bytes())
                .saturating_add(row.fillet.owned_bytes());
        }
        bytes
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct EdgeTreatmentRow {
    pub occurrence: Option<u32>,
    pub occurrence_path: String,
    pub public_face_ordinal: u32,
    pub private_query_face: u32,
    pub owning_solid_ordinal: Option<u32>,
    pub source_face_key: Option<String>,
    pub source_same_sense: Option<bool>,
    pub transferred_reversed: bool,
    pub label: EdgeTreatmentLabel,
    pub chamfer: EdgeTreatmentDisposition,
    pub fillet: EdgeTreatmentDisposition,
}

#[derive(Clone, Debug, PartialEq)]
pub enum EdgeTreatmentLabel {
    Unique(String),
    Absent,
    Ambiguous,
}

#[derive(Clone, Debug, PartialEq)]
pub enum EdgeTreatmentDisposition {
    Qualified(Box<EdgeTreatmentCertificate>),
    NonMember(EdgeTreatmentReason),
    Unqualified(EdgeTreatmentReason),
}

impl EdgeTreatmentDisposition {
    fn owned_bytes(&self) -> u64 {
        match self {
            Self::Qualified(certificate) => certificate.owned_bytes(),
            Self::NonMember(_) | Self::Unqualified(_) => 0,
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum EdgeTreatmentReason {
    UnsupportedSurface,
    UnsupportedTrim,
    UnsupportedOrientation,
    AmbiguousOwnership,
    InvalidSolid,
    AmbiguousAssociation,
    IncompleteBoundary,
    DegenerateSupport,
    OutsideTopology,
    OutsideMaterialBranch,
    NonTangentSupport,
    UnequalOffsets,
}

#[derive(Clone, Debug, PartialEq)]
pub struct EdgeTreatmentCertificate {
    pub kind: EdgeTreatmentKind,
    pub metric_value_mm: f64,
    pub surface: SurfaceFacts,
    pub parameter_bounds: [f64; 4],
    pub supports: [EdgeTreatmentSupport; 2],
    pub boundary_uses: Vec<EdgeTreatmentBoundaryUse>,
    pub residuals: Vec<EdgeTreatmentResidual>,
    pub wire_count: u32,
    pub maximum_topology_tolerance_mm: f64,
    pub material_side: EdgeTreatmentMaterialSide,
    pub full_u: bool,
    pub sweep_interval: [f64; 2],
}

impl EdgeTreatmentCertificate {
    fn owned_bytes(&self) -> u64 {
        (std::mem::size_of::<Self>() as u64)
            .saturating_add(
                (self.boundary_uses.capacity() as u64)
                    .saturating_mul(std::mem::size_of::<EdgeTreatmentBoundaryUse>() as u64),
            )
            .saturating_add(
                (self.residuals.capacity() as u64)
                    .saturating_mul(std::mem::size_of::<EdgeTreatmentResidual>() as u64),
            )
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum EdgeTreatmentKind {
    PlanarChamfer,
    ConicalChamfer,
    CylindricalFillet,
    ToroidalFillet,
}

#[derive(Clone, Debug, PartialEq)]
pub struct EdgeTreatmentSupport {
    pub public_face_ordinal: u32,
    pub private_query_face: u32,
    pub surface: SurfaceFacts,
    pub parameter_bounds: [f64; 4],
    pub transferred_reversed: bool,
    pub maximum_topology_tolerance_mm: f64,
}

#[derive(Clone, Debug, PartialEq)]
pub struct EdgeTreatmentBoundaryUse {
    pub owning_solid_edge_ordinal: u32,
    pub wire_ordinal: u32,
    pub reversed: bool,
    pub seam: bool,
    pub role: EdgeTreatmentBoundaryRole,
    pub curve: CurveFacts,
    pub parameter_range: [f64; 2],
    pub start: [f64; 3],
    pub end: [f64; 3],
    pub length_mm: f64,
    pub edge_tolerance_mm: f64,
    pub vertex_tolerances_mm: [f64; 2],
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum EdgeTreatmentBoundaryRole {
    Rail0,
    Rail1,
    End,
    Seam,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct EdgeTreatmentResidual {
    pub kind: EdgeTreatmentResidualKind,
    pub value_mm: f64,
    pub limit_mm: f64,
    pub scale_mm: f64,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum EdgeTreatmentResidualKind {
    RailCoincidence,
    AxisCoincidence,
    ParallelDirection,
    TangentDirection,
    EqualOffsets,
    RailStation,
    MaterialBranch,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum EdgeTreatmentMaterialSide {
    Convex,
    Concave,
}

/// Semantic admission profiles supplied by the selected connector. Artifact
/// source/build receipts qualify these names; a name alone is not certification.
#[derive(Clone, Copy, Debug)]
pub struct BrepIdentityProfile {
    pub ingest_profile: &'static str,
    pub backend_profile: &'static str,
}

/// Composition supplies a connector; no kernel type enters the core.
pub trait BrepConnector {
    fn identity_profile(&self) -> BrepIdentityProfile;
    fn open_step(&self, bytes: &[u8]) -> Result<Box<dyn BrepSubject>, BackendError>;
}

/// Retained synchronous owner-thread queries, deliberately without Send/Sync.
/// Bounded source-associated nominal finite face. Kind 0 is a planar region;
/// kind 1 exposes attached full circular rims only, never the cone interior.
/// Raw coordinates are retained; nominal plane membership projects attached
/// vertices/centers onto the raw support. Residuals qualify this mapping.
#[derive(Clone, Copy, Debug, Default)]
#[repr(C)]
pub struct FiniteContactCircle {
    pub edge_index: u32,
    pub outer: u32,
    pub center: [f64; 3],
    pub axis: [f64; 3],
    pub radius: f64,
    pub range: [f64; 2],
    pub period: f64,
    pub attachment_residual: f64,
    pub tolerance: f64,
}
#[derive(Clone, Copy, Debug, Default)]
#[repr(C)]
pub struct FiniteContactFace {
    pub occurrence: u32,
    pub public_face_ordinal: u32,
    pub private_query_face: u32,
    pub source_face_entity: u32,
    pub source_route_count: u32,
    pub source_route: [u32; 32],
    pub source_same_sense: u32,
    pub transferred_reversed: u32,
    pub kind: u32,
    pub origin: [f64; 3],
    pub normal: [f64; 3],
    pub vertex_count: u32,
    pub vertices: [[f64; 3]; 8],
    pub lines: [FiniteContactLine; 8],
    pub circle_count: u32,
    pub circles: [FiniteContactCircle; 8],
    pub wire_count: u32,
    pub edge_use_count: u32,
    pub attachment_residual: f64,
    pub tolerance: f64,
    pub face_tolerance: f64,
}
#[derive(Clone, Copy, Debug, Default)]
#[repr(C)]
pub struct FiniteContactLine {
    pub edge_index: u32,
    pub start_vertex: u32,
    pub end_vertex: u32,
    pub reversed: u32,
    pub origin: [f64; 3],
    pub direction: [f64; 3],
    pub range: [f64; 2],
    pub attachment_residual: f64,
    pub edge_tolerance: f64,
    pub vertex_tolerances: [f64; 2],
}
pub trait BrepSubject {
    /// Complete bounded plane region or source-attached circular rim evidence.
    fn finite_contact_face(&self, _face: BrepEntity) -> Result<FiniteContactFace, BackendError> {
        Err(BackendError {
            kind: super::BackendErrorKind::Unsupported,
            message: "The connector has no qualified finite-contact face admission.".into(),
        })
    }
    fn admission_facts(&self) -> Result<BrepAdmissionFacts, BackendError> {
        Err(BackendError {
            kind: super::BackendErrorKind::Unsupported,
            message: "The BRep connector has no cheap admission facts route.".into(),
        })
    }

    fn step_subject_metadata(&self) -> Result<Option<StepSubjectMetadata>, BackendError> {
        Ok(None)
    }

    fn reported_facts_and_mesh(&self) -> Result<ReportedBrepBundle, BackendError> {
        Err(BackendError {
            kind: super::BackendErrorKind::Unsupported,
            message: "The BRep connector has no qualified fixed-profile report bundle.".into(),
        })
    }

    /// The report's mesh facet alone, from a retained copy+mesh generation that
    /// a later `reported_facts` reuses. `None` means only the combined report
    /// exists, so the caller demands `reported_facts_and_mesh` instead.
    fn reported_mesh(&self) -> Result<Option<Rc<TriangleMesh>>, BackendError> {
        Ok(None)
    }

    /// The report's facts facet from the generation that produced `mesh`; the
    /// returned bundle carries that same mesh.
    fn reported_facts(&self, mesh: Rc<TriangleMesh>) -> Result<ReportedBrepBundle, BackendError> {
        Ok(ReportedBrepBundle {
            mesh,
            ..self.reported_facts_and_mesh()?
        })
    }

    /// Unqualified trims must refuse; world AABB projections are not evidence.
    fn cylinder_axial_extent(
        &self,
        _face: BrepEntity,
    ) -> Result<CylinderAxialExtent, BackendError> {
        Err(BackendError {
            kind: super::BackendErrorKind::Unsupported,
            message: "The BRep connector has no qualified trimmed-cylinder axial extent.".into(),
        })
    }

    /// Complete associated nominal lateral band for one occurrence face.
    /// The caller charges the distinct face before this uncached query.
    /// Missing/ambiguous source or trim evidence is Unsupported, never absence.
    fn nominal_cylindrical_band(
        &self,
        _face: BrepEntity,
    ) -> Result<NominalCylindricalBand, BackendError> {
        Err(BackendError {
            kind: super::BackendErrorKind::Unsupported,
            message: "The BRep connector has no associated nominal cylindrical-band query.".into(),
        })
    }

    /// Complete bounded dispositions for nonplanar whole-document Explorer
    /// faces. Unsupported/split trims remain visible. The caller charges the
    /// inventory plus all candidate requests before this query or cache lookup.
    fn circular_bores(
        &self,
        _max_candidates: usize,
    ) -> Result<CircularBoreInventory, BackendError> {
        Err(BackendError {
            kind: super::BackendErrorKind::Unsupported,
            message: "The BRep connector has no qualified circular-bore topology query.".into(),
        })
    }

    /// Certify complete bore-slab or finite-cylinder material for a selected face.
    fn selected_interference_material(
        &self,
        _face: BrepEntity,
    ) -> Result<SelectedInterferenceMaterial, BackendError> {
        Err(BackendError {
            kind: super::BackendErrorKind::Unsupported,
            message: "Complete selected interference material is unavailable.".into(),
        })
    }

    /// One actual occurrence face, complete single-solid material, two mouths,
    /// and empty regular-solid Common throughout its finite bore interior.
    /// No fallback to the face's local owner within a composite occurrence.
    fn selected_bore_void(&self, _face: BrepEntity) -> Result<SelectedBoreVoid, BackendError> {
        Err(BackendError {
            kind: super::BackendErrorKind::Unsupported,
            message: "The connector has no complete selected-material bore query.".into(),
        })
    }

    fn edge_treatment_counts(&self) -> Result<EdgeTreatmentCounts, BackendError> {
        Err(BackendError {
            kind: super::BackendErrorKind::Unsupported,
            message: "The BRep connector has no qualified edge-treatment count route.".into(),
        })
    }

    fn edge_treatments(&self, _max_rows: usize) -> Result<EdgeTreatmentInventory, BackendError> {
        Err(BackendError {
            kind: super::BackendErrorKind::Unsupported,
            message: "The BRep connector has no qualified edge-treatment topology query.".into(),
        })
    }

    /// One requested subject-target difference. Implementations must validate
    /// regular closed 3D operands and successful valid result topology; faces,
    /// open shells and indeterminate results cannot be reported contained.
    fn regular_solid_containment(
        &self,
        _subject: BrepEntity,
        _target: BrepEntity,
    ) -> Result<RegularSolidContainment, BackendError> {
        Err(BackendError {
            kind: super::BackendErrorKind::Unsupported,
            message: "The BRep connector has no qualified regular-solid containment query.".into(),
        })
    }

    /// Query one complete nominal analytic solid; no sampled support-pair verdict.
    fn continuous_wall_domain(
        &self,
        _entity: BrepEntity,
    ) -> Result<ContinuousWallDomain, BackendError> {
        Err(BackendError {
            kind: super::BackendErrorKind::Unsupported,
            message: "The BRep connector has no qualified continuous wall domain query.".into(),
        })
    }

    /// Requalifies the actual placed occurrence through the same complete
    /// analytic domain predicates as Whole, with explicit source associations.
    /// No default fallback to Whole or an unplaced shared product is permitted.
    fn selected_continuous_domain(
        &self,
        _occurrence: u32,
    ) -> Result<SelectedContinuousDomain, BackendError> {
        Err(BackendError {
            kind: super::BackendErrorKind::Unsupported,
            message: "The BRep connector has no qualified selected continuous domain query.".into(),
        })
    }

    /// Resolve original source entities forward through this actual document's
    /// transfer graph. Missing or ambiguous associations cannot use name,
    /// nearest-placement, or reverse first-match fallbacks.
    fn resolve_source_face(
        &self,
        _key: &SourceFaceKey,
    ) -> Result<ResolvedSourceFace, BackendError> {
        Err(BackendError {
            kind: super::BackendErrorKind::Unsupported,
            message: "The BRep connector has no qualified source-face transfer association.".into(),
        })
    }

    /// Ordered source occurrence metadata without preparing a report or
    /// transferring whole-document face/PMI inventories.
    fn source_occurrences(&self) -> Result<Rc<[OccurrenceFacts]>, BackendError> {
        Err(BackendError {
            kind: super::BackendErrorKind::Unsupported,
            message: "The BRep connector has no source occurrence metadata route.".into(),
        })
    }

    /// `source_occurrences` without measuring occurrence bounds: every field
    /// except `bounds`, which a connector may leave unmeasured (NaN).
    fn source_occurrence_structure(&self) -> Result<Rc<[OccurrenceFacts]>, BackendError> {
        self.source_occurrences()
    }

    fn facts(&self) -> Result<Rc<DocumentFacts>, BackendError>;
    /// All uniquely forward-transferred public faces for an original source face.
    /// Empty/missing and ambiguous bindings remain typed inventory states.
    fn pmi_source_faces(
        &self,
        _source_face_id: u32,
    ) -> Result<super::pmi::PmiField<Vec<super::pmi::PmiFaceAssociation>>, BackendError> {
        Ok(super::pmi::PmiField::unavailable(
            super::pmi::PmiFieldStatus::Unsupported,
            "Connector has no PMI forward-association inventory.",
        ))
    }
    /// Located faces in the whole retained shape, including flat STEP documents.
    fn faces(&self) -> Result<Rc<[LocatedFace]>, BackendError>;
    fn occurrence_faces(&self, occurrence: u32) -> Result<Rc<[LocatedFace]>, BackendError>;
    fn occurrence_edges(&self, occurrence: u32) -> Result<Rc<[EdgeFacts]>, BackendError>;
    fn validity(&self) -> Result<Rc<ValidityFacts>, BackendError>;
    fn extrema(&self, a: BrepEntity, b: BrepEntity) -> Result<Extrema, BackendError>;
    fn classify_points(
        &self,
        occurrence: u32,
        points: &[[f64; 3]],
    ) -> Result<Vec<PointState>, BackendError>;
    fn common_volume(&self, a: u32, b: u32) -> Result<CommonVolume, BackendError>;
    /// Classify against the located trimmed face. Off-surface points are Out.
    fn classify_face_points(
        &self,
        face: BrepEntity,
        points: &[[f64; 3]],
        tolerance_mm: f64,
    ) -> Result<Vec<PointState>, BackendError>;
    fn minimum_wall_thickness(
        &self,
        options: &WallOptions,
    ) -> Result<WallThicknessOutcome, BackendError>;
    fn tessellate(
        &self,
        entity: BrepEntity,
        profile: TessellationProfile,
    ) -> Result<Rc<TriangleMesh>, BackendError>;
}
