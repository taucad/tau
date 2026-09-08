//! Direct, owned geometry access to the pinned Manifold exact engine.

use geospec_engine_native_core::backend::{BackendError, BackendErrorKind, TriangleMesh};
use manifold_rust::{
    cross_section::{CrossSection, FillRule as NativeFillRule},
    linalg::Vec2,
    manifold::Manifold,
    types::{BooleanEngine, Error, MeshGL, OpType},
};

/// The intake and export profile rounds coordinates through binary32.
pub const NUMERIC_PROFILE: &str = "legacy-f32-v1";

/// A strictly manifold solid owned by Rust, using only the exact engine.
#[derive(Clone)]
pub struct Solid(Manifold);

/// Export retains native vertex, triangle and merge order.
#[derive(Debug, PartialEq)]
pub struct MeshExport {
    pub mesh: TriangleMesh,
    pub merge_from: Vec<u32>,
    pub merge_to: Vec<u32>,
}

/// Winding rule for the predeclared section controls.
#[derive(Clone, Copy, Debug)]
pub enum FillRule {
    NonZero,
    Positive,
}

/// An outer contour and its immediate holes, in native tree traversal order.
#[derive(Clone, Debug, PartialEq)]
pub struct SectionComponent {
    pub outer: Vec<[f64; 2]>,
    pub holes: Vec<Vec<[f64; 2]>>,
    pub signed_area: f64,
}

/// Section coordinates and component membership are copied without reordering.
#[derive(Clone, Debug, PartialEq)]
pub struct Section {
    pub contours: Vec<Vec<[f64; 2]>>,
    pub signed_area: f64,
    pub components: Vec<SectionComponent>,
}

fn failure(kind: BackendErrorKind, message: impl Into<String>) -> BackendError {
    BackendError {
        kind,
        message: message.into(),
    }
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
                .chunks_exact(3)
                .map(|v| [v[0] as f64, v[1] as f64, v[2] as f64])
                .collect(),
            triangles: mesh
                .tri_verts
                .chunks_exact(3)
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
        checked(
            Manifold::from_mesh_gl(&mesh_gl(mesh, merges)?),
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
        Ok(Section::from_native(&self.0.slice(z)))
    }
}

impl Section {
    pub fn from_contours(
        contours: &[Vec<[f64; 2]>],
        fill_rule: FillRule,
    ) -> Result<Self, BackendError> {
        if contours.iter().flatten().flatten().any(|v| !v.is_finite()) {
            return Err(failure(BackendErrorKind::InvalidInput, "Non-Finite Vertex"));
        }
        let polygons = contours
            .iter()
            .map(|p| p.iter().map(|v| Vec2::new(v[0], v[1])).collect())
            .collect();
        let rule = match fill_rule {
            FillRule::NonZero => NativeFillRule::NonZero,
            FillRule::Positive => NativeFillRule::Positive,
        };
        let section = CrossSection::from_polygons_with_fill_rule(polygons, rule);
        Ok(Self::from_native(&section))
    }

    fn from_native(section: &CrossSection) -> Self {
        let contours = |s: &CrossSection| -> Vec<Vec<[f64; 2]>> {
            s.to_polygons()
                .iter()
                .map(|p| p.iter().map(|v| [v.x, v.y]).collect())
                .collect()
        };
        Self {
            contours: contours(section),
            signed_area: section.area(),
            components: section
                .decompose()
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
        }
    }
}
