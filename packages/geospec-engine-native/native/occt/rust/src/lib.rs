//! Safe, owned Rust adapter for the private OCCT bridge.

use geospec_engine_native_core::backend::{BackendError, BackendErrorKind, TriangleMesh};
use serde::Serialize;
use std::{ffi::c_char, ptr::NonNull};

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

/// Owns one retained XDE document. It is deliberately neither `Send` nor `Sync`.
pub struct Document {
    raw: NonNull<ffi::Document>,
    _single_threaded: std::marker::PhantomData<*mut ()>,
}

impl Document {
    pub fn from_step(bytes: &[u8]) -> Result<Self, BackendError> {
        if bytes.is_empty() {
            return Err(invalid_input("STEP input is empty."));
        }
        let mut raw = std::ptr::null_mut();
        let mut error = ErrorBuffer::new();
        let status = unsafe {
            ffi::geospec_occt_open_step(bytes.as_ptr(), bytes.len(), &mut raw, error.raw())
        };
        check(status, &error)?;
        let raw = NonNull::new(raw).ok_or_else(|| backend_error("OCCT returned no document."))?;
        Ok(Self {
            raw,
            _single_threaded: std::marker::PhantomData,
        })
    }

    pub fn facts(&self) -> Result<DocumentFacts, BackendError> {
        unsafe { facts(self.raw.as_ptr()) }
    }

    pub fn tessellate(
        &self,
        linear_deflection: f64,
        angular_deflection: f64,
    ) -> Result<TriangleMesh, BackendError> {
        if !linear_deflection.is_finite()
            || !angular_deflection.is_finite()
            || linear_deflection <= 0.0
            || angular_deflection <= 0.0
        {
            return Err(invalid_input(
                "Tessellation deflections must be finite and positive.",
            ));
        }
        unsafe { tessellate(self.raw.as_ptr(), linear_deflection, angular_deflection) }
    }
}

impl Drop for Document {
    fn drop(&mut self) {
        unsafe { ffi::geospec_occt_release(self.raw.as_ptr()) };
    }
}

fn invalid_input(message: impl Into<String>) -> BackendError {
    BackendError {
        kind: BackendErrorKind::InvalidInput,
        message: message.into(),
    }
}

fn backend_error(message: impl Into<String>) -> BackendError {
    BackendError {
        kind: BackendErrorKind::ComputationFailed,
        message: message.into(),
    }
}

struct ErrorBuffer {
    bytes: Vec<u8>,
    raw: ffi::StringBuffer,
}

impl ErrorBuffer {
    fn new() -> Self {
        let mut bytes = vec![0; 512];
        let raw = ffi::StringBuffer {
            data: bytes.as_mut_ptr().cast(),
            capacity: bytes.len(),
            length: 0,
        };
        Self { bytes, raw }
    }

    fn raw(&mut self) -> *mut ffi::StringBuffer {
        self.raw.length = 0;
        &mut self.raw
    }

    fn message(&self) -> String {
        let length = self.raw.length.min(self.bytes.len());
        String::from_utf8_lossy(&self.bytes[..length]).into_owned()
    }
}

fn check(status: i32, error: &ErrorBuffer) -> Result<(), BackendError> {
    if status == ffi::OK {
        return Ok(());
    }
    let message = error.message();
    Err(BackendError {
        kind: match status {
            ffi::INVALID_ARGUMENT | ffi::READ_FAILED | ffi::TRANSFER_FAILED | ffi::NO_SHAPE => {
                BackendErrorKind::InvalidInput
            }
            ffi::UNSUPPORTED => BackendErrorKind::Unsupported,
            _ => BackendErrorKind::ComputationFailed,
        },
        message: if message.is_empty() {
            format!("OCCT bridge failed with status {status}.")
        } else {
            message
        },
    })
}

unsafe fn copied_string(
    mut call: impl FnMut(*mut ffi::StringBuffer, *mut ffi::StringBuffer) -> i32,
) -> Result<String, BackendError> {
    let mut size = ffi::StringBuffer {
        data: std::ptr::null_mut(),
        capacity: 0,
        length: 0,
    };
    let mut error = ErrorBuffer::new();
    let status = call(&mut size, error.raw());
    if status != ffi::BUFFER_TOO_SMALL && status != ffi::OK {
        check(status, &error)?;
    }
    let mut bytes = vec![0u8; size.length.saturating_add(1)];
    let mut output = ffi::StringBuffer {
        data: bytes.as_mut_ptr().cast(),
        capacity: bytes.len(),
        length: 0,
    };
    check(call(&mut output, error.raw()), &error)?;
    bytes.truncate(output.length);
    String::from_utf8(bytes).map_err(|_| backend_error("OCCT returned non-UTF-8 text."))
}

unsafe fn facts(raw: *const ffi::Document) -> Result<DocumentFacts, BackendError> {
    let mut shape = ffi::ShapeFacts::default();
    let mut unit_scale = 0.0;
    let source_length_unit = copied_string(|unit, error| {
        ffi::geospec_occt_document_facts(raw, &mut shape, &mut unit_scale, unit, error)
    })?;

    let product_count = ffi::geospec_occt_product_count(raw);
    let mut products = Vec::with_capacity(product_count);
    for index in 0..product_count {
        let label = copied_string(|label, error| {
            ffi::geospec_occt_product(raw, index, label, std::ptr::null_mut(), error)
        })?;
        let name = copied_string(|name, error| {
            ffi::geospec_occt_product(raw, index, std::ptr::null_mut(), name, error)
        })?;
        products.push(ProductFacts { label, name });
    }

    let occurrence_count = ffi::geospec_occt_occurrence_count(raw);
    let mut occurrences = Vec::with_capacity(occurrence_count);
    for index in 0..occurrence_count {
        let mut output = ffi::OccurrenceFacts::default();
        let label = copied_string(|label, error| {
            ffi::geospec_occt_occurrence(
                raw,
                index,
                &mut output,
                label,
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                error,
            )
        })?;
        let product_label = copied_string(|product, error| {
            ffi::geospec_occt_occurrence(
                raw,
                index,
                &mut output,
                std::ptr::null_mut(),
                product,
                std::ptr::null_mut(),
                error,
            )
        })?;
        let name = copied_string(|name, error| {
            ffi::geospec_occt_occurrence(
                raw,
                index,
                &mut output,
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                name,
                error,
            )
        })?;
        occurrences.push(OccurrenceFacts {
            label,
            product_label,
            name,
            placement: output.placement,
            bounds: output.bounds.into(),
        });
    }

    let face_count = ffi::geospec_occt_face_count(raw);
    let mut faces = Vec::with_capacity(face_count);
    for index in 0..face_count {
        let mut output = ffi::FaceFacts::default();
        let mut error = ErrorBuffer::new();
        check(
            ffi::geospec_occt_face(raw, index, &mut output, error.raw()),
            &error,
        )?;
        faces.push(output.try_into()?);
    }

    let pmi_count = ffi::geospec_occt_pmi_count(raw);
    let mut pmi = Vec::with_capacity(pmi_count);
    for index in 0..pmi_count {
        let mut output = ffi::PmiFacts::default();
        let label = copied_string(|label, error| {
            ffi::geospec_occt_pmi(raw, index, &mut output, label, std::ptr::null_mut(), error)
        })?;
        let name = copied_string(|name, error| {
            ffi::geospec_occt_pmi(raw, index, &mut output, std::ptr::null_mut(), name, error)
        })?;
        let mut shape_labels = Vec::with_capacity(output.association_count);
        for association in 0..output.association_count {
            shape_labels.push(copied_string(|label, error| {
                ffi::geospec_occt_pmi_association(raw, index, association, label, error)
            })?);
        }
        pmi.push(PmiFacts {
            label,
            name,
            kind: output.kind.try_into()?,
            shape_labels,
        });
    }

    Ok(DocumentFacts {
        source_length_unit,
        source_unit_to_millimeters: unit_scale,
        products,
        occurrences,
        shape: shape.into(),
        faces,
        pmi,
    })
}

unsafe fn tessellate(
    raw: *const ffi::Document,
    linear: f64,
    angular: f64,
) -> Result<TriangleMesh, BackendError> {
    let mut position_count = 0;
    let mut triangle_count = 0;
    let mut error = ErrorBuffer::new();
    check(
        ffi::geospec_occt_tessellate(
            raw,
            linear,
            angular,
            std::ptr::null_mut(),
            0,
            std::ptr::null_mut(),
            0,
            &mut position_count,
            &mut triangle_count,
            error.raw(),
        ),
        &error,
    )?;
    let mut positions = vec![0.0; position_count * 3];
    let mut triangles = vec![0u32; triangle_count * 3];
    check(
        ffi::geospec_occt_tessellate(
            raw,
            linear,
            angular,
            positions.as_mut_ptr(),
            position_count,
            triangles.as_mut_ptr(),
            triangle_count,
            &mut position_count,
            &mut triangle_count,
            error.raw(),
        ),
        &error,
    )?;
    Ok(TriangleMesh {
        positions: positions
            .chunks_exact(3)
            .map(|v| [v[0], v[1], v[2]])
            .collect(),
        triangles: triangles
            .chunks_exact(3)
            .map(|v| [v[0], v[1], v[2]])
            .collect(),
    })
}

impl From<ffi::Bounds> for Bounds {
    fn from(value: ffi::Bounds) -> Self {
        Self {
            min: value.min,
            max: value.max,
        }
    }
}

impl From<ffi::ShapeFacts> for ShapeFacts {
    fn from(value: ffi::ShapeFacts) -> Self {
        Self {
            valid: value.valid != 0,
            bounds: value.bounds.into(),
            volume: value.volume,
            surface_area: value.surface_area,
            center_of_mass: value.center_of_mass,
            topology: TopologyCounts {
                solids: value.solids,
                shells: value.shells,
                faces: value.faces,
                wires: value.wires,
                edges: value.edges,
                vertices: value.vertices,
            },
        }
    }
}

impl TryFrom<ffi::FaceFacts> for FaceFacts {
    type Error = BackendError;

    fn try_from(value: ffi::FaceFacts) -> Result<Self, Self::Error> {
        let surface = match value.surface_type {
            0 => SurfaceFacts::Plane {
                origin: value.origin,
                normal: value.direction,
            },
            1 => SurfaceFacts::Cylinder {
                origin: value.origin,
                axis: value.direction,
                radius: value.radius,
            },
            2 => SurfaceFacts::Cone {
                origin: value.origin,
                axis: value.direction,
                reference_radius: value.radius,
                semi_angle: value.semi_angle,
            },
            3 => SurfaceFacts::Sphere {
                center: value.origin,
                radius: value.radius,
            },
            4 => SurfaceFacts::Torus {
                center: value.origin,
                axis: value.direction,
                major_radius: value.radius,
                minor_radius: value.secondary_radius,
            },
            5 => SurfaceFacts::Bezier {
                u_degree: value.u_degree,
                v_degree: value.v_degree,
                u_poles: value.u_poles,
                v_poles: value.v_poles,
            },
            6 => SurfaceFacts::Bspline {
                u_degree: value.u_degree,
                v_degree: value.v_degree,
                u_poles: value.u_poles,
                v_poles: value.v_poles,
                u_knots: value.u_knots,
                v_knots: value.v_knots,
                u_rational: value.u_rational != 0,
                v_rational: value.v_rational != 0,
            },
            7 => SurfaceFacts::Revolution,
            8 => SurfaceFacts::Extrusion,
            9 => SurfaceFacts::Offset,
            10 => SurfaceFacts::Other,
            _ => return Err(backend_error("OCCT returned an unknown surface type.")),
        };
        Ok(Self {
            index: value.index,
            parameter_bounds: value.parameter_bounds,
            area: value.area,
            center_of_mass: value.center_of_mass,
            surface,
        })
    }
}

impl TryFrom<i32> for PmiKind {
    type Error = BackendError;

    fn try_from(value: i32) -> Result<Self, Self::Error> {
        match value {
            0 => Ok(Self::Dimension),
            1 => Ok(Self::GeometricTolerance),
            2 => Ok(Self::Datum),
            _ => Err(backend_error("OCCT returned an unknown PMI kind.")),
        }
    }
}

mod ffi {
    use super::c_char;

    pub const OK: i32 = 0;
    pub const INVALID_ARGUMENT: i32 = 1;
    pub const READ_FAILED: i32 = 2;
    pub const TRANSFER_FAILED: i32 = 3;
    pub const NO_SHAPE: i32 = 4;
    pub const BUFFER_TOO_SMALL: i32 = 6;
    pub const UNSUPPORTED: i32 = 7;

    #[repr(C)]
    pub struct Document {
        _private: [u8; 0],
    }

    #[repr(C)]
    pub struct StringBuffer {
        pub data: *mut c_char,
        pub capacity: usize,
        pub length: usize,
    }

    #[derive(Clone, Copy, Default)]
    #[repr(C)]
    pub struct Bounds {
        pub min: [f64; 3],
        pub max: [f64; 3],
    }

    #[derive(Clone, Copy, Default)]
    #[repr(C)]
    pub struct ShapeFacts {
        pub valid: i32,
        pub bounds: Bounds,
        pub volume: f64,
        pub surface_area: f64,
        pub center_of_mass: [f64; 3],
        pub solids: usize,
        pub shells: usize,
        pub faces: usize,
        pub wires: usize,
        pub edges: usize,
        pub vertices: usize,
    }

    #[derive(Clone, Copy, Default)]
    #[repr(C)]
    pub struct OccurrenceFacts {
        pub placement: [f64; 12],
        pub bounds: Bounds,
    }

    #[derive(Clone, Copy, Default)]
    #[repr(C)]
    pub struct FaceFacts {
        pub index: u32,
        pub surface_type: i32,
        pub parameter_bounds: [f64; 4],
        pub area: f64,
        pub center_of_mass: [f64; 3],
        pub origin: [f64; 3],
        pub direction: [f64; 3],
        pub radius: f64,
        pub secondary_radius: f64,
        pub semi_angle: f64,
        pub u_degree: u32,
        pub v_degree: u32,
        pub u_poles: u32,
        pub v_poles: u32,
        pub u_knots: u32,
        pub v_knots: u32,
        pub u_rational: i32,
        pub v_rational: i32,
    }

    #[derive(Clone, Copy, Default)]
    #[repr(C)]
    pub struct PmiFacts {
        pub kind: i32,
        pub association_count: usize,
    }

    unsafe extern "C" {
        pub fn geospec_occt_open_step(
            bytes: *const u8,
            length: usize,
            out: *mut *mut Document,
            error: *mut StringBuffer,
        ) -> i32;
        pub fn geospec_occt_release(document: *mut Document);
        pub fn geospec_occt_document_facts(
            document: *const Document,
            shape: *mut ShapeFacts,
            unit_scale: *mut f64,
            unit: *mut StringBuffer,
            error: *mut StringBuffer,
        ) -> i32;
        pub fn geospec_occt_product_count(document: *const Document) -> usize;
        pub fn geospec_occt_product(
            document: *const Document,
            index: usize,
            label: *mut StringBuffer,
            name: *mut StringBuffer,
            error: *mut StringBuffer,
        ) -> i32;
        pub fn geospec_occt_occurrence_count(document: *const Document) -> usize;
        pub fn geospec_occt_occurrence(
            document: *const Document,
            index: usize,
            facts: *mut OccurrenceFacts,
            label: *mut StringBuffer,
            product: *mut StringBuffer,
            name: *mut StringBuffer,
            error: *mut StringBuffer,
        ) -> i32;
        pub fn geospec_occt_face_count(document: *const Document) -> usize;
        pub fn geospec_occt_face(
            document: *const Document,
            index: usize,
            facts: *mut FaceFacts,
            error: *mut StringBuffer,
        ) -> i32;
        pub fn geospec_occt_pmi_count(document: *const Document) -> usize;
        pub fn geospec_occt_pmi(
            document: *const Document,
            index: usize,
            facts: *mut PmiFacts,
            label: *mut StringBuffer,
            name: *mut StringBuffer,
            error: *mut StringBuffer,
        ) -> i32;
        pub fn geospec_occt_pmi_association(
            document: *const Document,
            index: usize,
            association: usize,
            label: *mut StringBuffer,
            error: *mut StringBuffer,
        ) -> i32;
        pub fn geospec_occt_tessellate(
            document: *const Document,
            linear: f64,
            angular: f64,
            positions: *mut f64,
            position_capacity: usize,
            triangles: *mut u32,
            triangle_capacity: usize,
            position_count: *mut usize,
            triangle_count: *mut usize,
            error: *mut StringBuffer,
        ) -> i32;
    }
}
