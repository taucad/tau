//! Owned CSG operands, operation results and explicit session release.

use super::{brep::Bounds, BackendError, TriangleMesh};

/// Adapter-owned slot and generation; never a public host or kernel pointer.
#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
pub struct SolidId {
    slot: u32,
    generation: u32,
}

impl SolidId {
    pub const fn new(slot: u32, generation: u32) -> Self {
        Self { slot, generation }
    }
    pub const fn slot(self) -> u32 {
        self.slot
    }
    pub const fn generation(self) -> u32 {
        self.generation
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum BooleanOp {
    Union,
    Difference,
    Intersection,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum SectionOp {
    Union,
    Difference,
    Intersection,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum FillRule {
    NonZero,
    Positive,
}

#[derive(Clone, Debug, PartialEq)]
pub struct MeshExport {
    pub mesh: TriangleMesh,
    pub merge_from: Vec<u32>,
    pub merge_to: Vec<u32>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct SectionComponent {
    pub outer: Vec<[f64; 2]>,
    pub holes: Vec<Vec<[f64; 2]>>,
    pub signed_area: f64,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Section {
    pub contours: Vec<Vec<[f64; 2]>>,
    pub signed_area: f64,
    pub components: Vec<SectionComponent>,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct SolidProperties {
    pub signed_volume: f64,
    pub surface_area: f64,
    /// Empty solids have no geometric bounds.
    pub bounds: Option<Bounds>,
    pub is_empty: bool,
}

/// One thread-confined arena. Core scopes release temporary operands normally.
pub trait CsgConnector {
    fn release(&mut self, solid: SolidId) -> Result<(), BackendError>;
    fn admit(&mut self, mesh: &TriangleMesh, merges: &[[u32; 2]]) -> Result<SolidId, BackendError>;
    fn boolean(
        &mut self,
        operation: BooleanOp,
        operands: &[SolidId],
    ) -> Result<SolidId, BackendError>;
    fn transform(&mut self, solid: SolidId, affine: [f64; 12]) -> Result<SolidId, BackendError>;
    fn decompose(&mut self, solid: SolidId) -> Result<Vec<SolidId>, BackendError>;
    fn properties(&self, solid: SolidId) -> Result<SolidProperties, BackendError>;
    fn export(&self, solid: SolidId) -> Result<MeshExport, BackendError>;
    fn slice(&self, solid: SolidId, z: f64) -> Result<Section, BackendError>;
    fn section(&self, contours: &[Vec<[f64; 2]>], fill: FillRule) -> Result<Section, BackendError>;
    fn section_boolean(
        &self,
        operation: SectionOp,
        left: &Section,
        right: &Section,
    ) -> Result<Section, BackendError>;
}
