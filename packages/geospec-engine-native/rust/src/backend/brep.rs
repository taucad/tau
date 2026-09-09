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

/// Cheap retained XDE admission metadata; obtaining it must not tessellate.
#[derive(Clone, Debug, PartialEq)]
pub struct BrepAdmissionFacts {
    pub source_length_unit: String,
    pub source_unit_to_millimeters: f64,
    pub occurrence_count: usize,
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
    pub pmi: Vec<PmiFacts>,
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

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PmiFacts {
    pub label: String,
    pub name: String,
    pub kind: PmiKind,
    pub shape_labels: Vec<String>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum PmiKind {
    Dimension,
    GeometricTolerance,
    Datum,
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
pub trait BrepSubject {
    fn admission_facts(&self) -> Result<BrepAdmissionFacts, BackendError> {
        Err(BackendError {
            kind: super::BackendErrorKind::Unsupported,
            message: "The BRep connector has no cheap admission facts route.".into(),
        })
    }

    fn reported_facts_and_mesh(&self) -> Result<ReportedBrepBundle, BackendError> {
        Err(BackendError {
            kind: super::BackendErrorKind::Unsupported,
            message: "The BRep connector has no qualified fixed-profile report bundle.".into(),
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

    fn facts(&self) -> Result<Rc<DocumentFacts>, BackendError>;
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
