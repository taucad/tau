//! Direct, owned geometry access to the pinned Manifold exact engine.

use std::{marker::PhantomData, ops::Deref, rc::Rc};

pub use geospec_engine_native_core::backend::csg::{
    BooleanOp, CsgConnector, FillRule, MeshExport, SectionComponent, SectionOp, SolidId,
};
use geospec_engine_native_core::backend::{
    brep::Bounds,
    csg::{Section as SharedSection, SolidProperties},
    BackendError, BackendErrorKind, TriangleMesh,
};
use manifold_rust::{
    cross_section::{CrossSection, CrossSectionError, FillRule as NativeFillRule},
    linalg::{Mat3x4, Vec2, Vec3},
    manifold::Manifold,
    types::{BooleanEngine, Error, MeshGL, OpType},
};

/// The intake and export profile rounds coordinates through binary32.
pub const NUMERIC_PROFILE: &str = "legacy-f32-v1";

/// Frozen S4 convenience wrapper around the neutral owned section result.
#[derive(Clone, Debug, PartialEq)]
#[repr(transparent)]
pub struct Section(SharedSection);

impl Section {
    pub fn from_contours(
        contours: &[Vec<[f64; 2]>],
        fill_rule: FillRule,
    ) -> Result<Self, BackendError> {
        section_from_contours(contours, fill_rule).map(Self)
    }
}

impl Deref for Section {
    type Target = SharedSection;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

/// A strictly manifold solid owned by Rust, using only the exact engine.
#[derive(Clone)]
pub struct Solid(Manifold);

fn failure(kind: BackendErrorKind, message: impl Into<String>) -> BackendError {
    BackendError {
        kind,
        message: message.into(),
    }
}

fn section_failure(error: CrossSectionError) -> BackendError {
    let kind = match error {
        CrossSectionError::CoordinateOutOfRange => BackendErrorKind::InvalidInput,
        CrossSectionError::ClipperFailure => BackendErrorKind::ComputationFailed,
    };
    failure(kind, error.to_string())
}

fn checked(manifold: Manifold, kind: BackendErrorKind) -> Result<Solid, BackendError> {
    if manifold.status() == Error::NoError {
        Ok(Solid(manifold))
    } else {
        Err(failure(kind, manifold.status().to_str()))
    }
}

fn mesh_gl(mesh: &TriangleMesh, merges: &[[u32; 2]]) -> Result<MeshGL, BackendError> {
    let vertices: Vec<f32> = mesh.positions.iter().flatten().map(|&v| v as f32).collect();
    if vertices.iter().any(|v| !v.is_finite()) {
        return Err(failure(BackendErrorKind::InvalidInput, "Non-Finite Vertex"));
    }
    if mesh.positions.len() > u32::MAX as usize {
        return Err(failure(BackendErrorKind::InvalidInput, "Result Too Large"));
    }
    let vertex_count = mesh.positions.len() as u32;
    if mesh
        .triangles
        .iter()
        .flatten()
        .any(|&index| index >= vertex_count)
    {
        return Err(failure(
            BackendErrorKind::InvalidInput,
            Error::VertexOutOfBounds.to_str(),
        ));
    }
    if merges.iter().flatten().any(|&index| index >= vertex_count) {
        return Err(failure(
            BackendErrorKind::InvalidInput,
            Error::MergeIndexOutOfBounds.to_str(),
        ));
    }
    Ok(MeshGL {
        num_prop: 3,
        vert_properties: vertices,
        tri_verts: mesh.triangles.iter().flatten().copied().collect(),
        merge_from_vert: merges.iter().map(|p| p[0]).collect(),
        merge_to_vert: merges.iter().map(|p| p[1]).collect(),
        ..Default::default()
    })
}

fn exported(mesh: MeshGL) -> MeshExport {
    MeshExport {
        mesh: TriangleMesh {
            positions: mesh
                .vert_properties
                .as_chunks::<3>()
                .0
                .iter()
                .map(|v| [v[0] as f64, v[1] as f64, v[2] as f64])
                .collect(),
            triangles: mesh
                .tri_verts
                .as_chunks::<3>()
                .0
                .iter()
                .map(|t| [t[0], t[1], t[2]])
                .collect(),
        },
        merge_from: mesh.merge_from_vert,
        merge_to: mesh.merge_to_vert,
    }
}

impl Solid {
    pub fn from_mesh(mesh: &TriangleMesh) -> Result<Self, BackendError> {
        Self::from_mesh_with_merge(mesh, &[])
    }

    pub fn from_mesh_with_merge(
        mesh: &TriangleMesh,
        merges: &[[u32; 2]],
    ) -> Result<Self, BackendError> {
        let mut mesh = mesh_gl(mesh, merges)?;
        mesh.merge();
        checked(
            Manifold::from_mesh_gl(&mesh),
            BackendErrorKind::InvalidInput,
        )
    }

    pub fn intersection(&self, other: &Self) -> Result<Self, BackendError> {
        checked(
            self.0
                .intersection_with_engine(&other.0, BooleanEngine::Exact),
            BackendErrorKind::ComputationFailed,
        )
    }

    pub fn union_all(solids: &[Self]) -> Result<Self, BackendError> {
        Self::batch(solids, OpType::Add)
    }

    pub fn difference_all(solids: &[Self]) -> Result<Self, BackendError> {
        Self::batch(solids, OpType::Subtract)
    }

    pub fn intersection_all(solids: &[Self]) -> Result<Self, BackendError> {
        Self::batch(solids, OpType::Intersect)
    }

    fn batch(solids: &[Self], operation: OpType) -> Result<Self, BackendError> {
        let operands: Vec<_> = solids.iter().map(|s| s.0.clone()).collect();
        checked(
            Manifold::batch_boolean_with_engine(&operands, operation, BooleanEngine::Exact),
            BackendErrorKind::ComputationFailed,
        )
    }

    pub fn to_mesh(&self) -> Result<TriangleMesh, BackendError> {
        Ok(self.export()?.mesh)
    }

    pub fn export(&self) -> Result<MeshExport, BackendError> {
        Ok(exported(self.0.get_mesh_gl(-1)))
    }

    pub fn signed_volume(&self) -> Result<f64, BackendError> {
        Ok(self.0.volume())
    }

    pub fn surface_area(&self) -> Result<f64, BackendError> {
        Ok(self.0.surface_area())
    }

    fn transform(&self, affine: [f64; 12]) -> Result<Self, BackendError> {
        if affine.iter().any(|value| !value.is_finite()) {
            return Err(failure(
                BackendErrorKind::InvalidInput,
                "Non-Finite Transform",
            ));
        }
        let matrix = Mat3x4::from_cols(
            Vec3::new(affine[0], affine[4], affine[8]),
            Vec3::new(affine[1], affine[5], affine[9]),
            Vec3::new(affine[2], affine[6], affine[10]),
            Vec3::new(affine[3], affine[7], affine[11]),
        );
        checked(
            self.0.transform(&matrix),
            BackendErrorKind::ComputationFailed,
        )
    }

    fn properties(&self) -> SolidProperties {
        let is_empty = self.0.is_empty();
        let bounds = if is_empty {
            None
        } else {
            let bounds = self.0.bounding_box();
            Some(Bounds {
                min: bounds.min.into(),
                max: bounds.max.into(),
            })
        };
        SolidProperties {
            signed_volume: self.0.volume(),
            surface_area: self.0.surface_area(),
            bounds,
            is_empty,
        }
    }

    pub fn decompose(&self) -> Result<Vec<Self>, BackendError> {
        self.0
            .decompose()
            .into_iter()
            .map(|m| checked(m, BackendErrorKind::ComputationFailed))
            .collect()
    }

    pub fn slice(&self, z: f64) -> Result<Section, BackendError> {
        if !z.is_finite() {
            return Err(failure(
                BackendErrorKind::InvalidInput,
                "Non-Finite Slice Height",
            ));
        }
        section_from_native(&self.0.slice(z)).map(Section)
    }
}

fn native_contours(contours: &[Vec<[f64; 2]>]) -> Result<Vec<Vec<Vec2>>, BackendError> {
    if contours.iter().flatten().flatten().any(|v| !v.is_finite()) {
        return Err(failure(BackendErrorKind::InvalidInput, "Non-Finite Vertex"));
    }
    Ok(contours
        .iter()
        .map(|polygon| polygon.iter().copied().map(Vec2::from).collect())
        .collect())
}

fn section_from_native(section: &CrossSection) -> Result<SharedSection, BackendError> {
    let contours = |section: &CrossSection| -> Vec<Vec<[f64; 2]>> {
        section
            .to_polygons()
            .into_iter()
            .map(|polygon| polygon.into_iter().map(Into::into).collect())
            .collect()
    };
    Ok(SharedSection {
        contours: contours(section),
        signed_area: section.area(),
        components: section
            .try_decompose()
            .map_err(section_failure)?
            .iter()
            .map(|part| {
                let mut rings = contours(part).into_iter();
                SectionComponent {
                    outer: rings.next().unwrap_or_default(),
                    holes: rings.collect(),
                    signed_area: part.area(),
                }
            })
            .collect(),
    })
}

fn section_from_contours(
    contours: &[Vec<[f64; 2]>],
    fill_rule: FillRule,
) -> Result<SharedSection, BackendError> {
    let rule = match fill_rule {
        FillRule::NonZero => NativeFillRule::NonZero,
        FillRule::Positive => NativeFillRule::Positive,
    };
    let section = CrossSection::try_from_polygons_with_fill_rule(native_contours(contours)?, rule)
        .map_err(section_failure)?;
    section_from_native(&section)
}

#[derive(Clone)]
struct Slot {
    generation: u32,
    solid: Option<Solid>,
}

/// Thread-confined owner of opaque Manifold solids.
#[derive(Default)]
pub struct ManifoldCsgConnector {
    slots: Vec<Slot>,
    free: Vec<u32>,
    thread_confined: PhantomData<Rc<()>>,
}

impl ManifoldCsgConnector {
    pub fn new() -> Self {
        Self::default()
    }

    fn insert(&mut self, solid: Solid) -> Result<SolidId, BackendError> {
        if let Some(slot) = self.free.pop() {
            let entry = &mut self.slots[slot as usize];
            entry.solid = Some(solid);
            return Ok(SolidId::new(slot, entry.generation));
        }
        let slot = u32::try_from(self.slots.len())
            .map_err(|_| failure(BackendErrorKind::ComputationFailed, "Result Too Large"))?;
        self.slots.push(Slot {
            generation: 0,
            solid: Some(solid),
        });
        Ok(SolidId::new(slot, 0))
    }

    fn solid(&self, id: SolidId) -> Result<&Solid, BackendError> {
        self.slots
            .get(id.slot() as usize)
            .filter(|entry| entry.generation == id.generation())
            .and_then(|entry| entry.solid.as_ref())
            .ok_or_else(|| failure(BackendErrorKind::InvalidInput, "Unknown or Released Solid"))
    }
}

impl CsgConnector for ManifoldCsgConnector {
    fn release(&mut self, id: SolidId) -> Result<(), BackendError> {
        let Some(entry) = self.slots.get_mut(id.slot() as usize) else {
            return Err(failure(
                BackendErrorKind::InvalidInput,
                "Unknown or Released Solid",
            ));
        };
        if entry.generation != id.generation() || entry.solid.take().is_none() {
            return Err(failure(
                BackendErrorKind::InvalidInput,
                "Unknown or Released Solid",
            ));
        }
        if let Some(generation) = entry.generation.checked_add(1) {
            entry.generation = generation;
            self.free.push(id.slot());
        }
        Ok(())
    }

    fn admit(&mut self, mesh: &TriangleMesh, merges: &[[u32; 2]]) -> Result<SolidId, BackendError> {
        self.insert(Solid::from_mesh_with_merge(mesh, merges)?)
    }

    fn boolean(
        &mut self,
        operation: BooleanOp,
        operands: &[SolidId],
    ) -> Result<SolidId, BackendError> {
        let solids = operands
            .iter()
            .map(|&id| self.solid(id).cloned())
            .collect::<Result<Vec<_>, _>>()?;
        let result = match operation {
            BooleanOp::Union => Solid::union_all(&solids),
            BooleanOp::Difference => Solid::difference_all(&solids),
            BooleanOp::Intersection => Solid::intersection_all(&solids),
        }?;
        self.insert(result)
    }

    fn transform(&mut self, id: SolidId, affine: [f64; 12]) -> Result<SolidId, BackendError> {
        let solid = self.solid(id)?.transform(affine)?;
        self.insert(solid)
    }

    fn decompose(&mut self, id: SolidId) -> Result<Vec<SolidId>, BackendError> {
        let parts = self.solid(id)?.decompose()?;
        parts.into_iter().map(|part| self.insert(part)).collect()
    }

    fn properties(&self, id: SolidId) -> Result<SolidProperties, BackendError> {
        Ok(self.solid(id)?.properties())
    }

    fn export(&self, id: SolidId) -> Result<MeshExport, BackendError> {
        self.solid(id)?.export()
    }

    fn slice(&self, id: SolidId, z: f64) -> Result<SharedSection, BackendError> {
        if !z.is_finite() {
            return Err(failure(
                BackendErrorKind::InvalidInput,
                "Non-Finite Slice Height",
            ));
        }
        section_from_native(&self.solid(id)?.0.slice(z))
    }

    fn section(
        &self,
        contours: &[Vec<[f64; 2]>],
        fill_rule: FillRule,
    ) -> Result<SharedSection, BackendError> {
        section_from_contours(contours, fill_rule)
    }

    fn section_boolean(
        &self,
        operation: SectionOp,
        left: &SharedSection,
        right: &SharedSection,
    ) -> Result<SharedSection, BackendError> {
        let left = CrossSection::new(native_contours(&left.contours)?);
        let right = CrossSection::new(native_contours(&right.contours)?);
        let result = match operation {
            SectionOp::Union => left.try_union(&right),
            SectionOp::Difference => left.try_difference(&right),
            SectionOp::Intersection => left.try_intersection(&right),
        }
        .map_err(section_failure)?;
        section_from_native(&result)
    }
}
