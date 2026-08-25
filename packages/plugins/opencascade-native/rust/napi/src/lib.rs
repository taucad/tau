//! N-API shell over `taucad-occt-facade`.
//!
//! Deliberately thin: argument marshalling, handle lifetime, and error
//! translation only. Every geometric decision lives in the facade so it stays
//! testable with `cargo test` and portable to the Tau-owned `extern "C"` waist.
//!
//! Two rules this file exists to keep:
//!
//! * **One crossing per user-visible operation.** Every list-shaped operation
//!   has a batch form; no entry point takes or returns a single vertex, index,
//!   or scalar coordinate.
//! * **`Result` at both boundaries.** A Rust panic across `napi_callback`
//!   aborts the whole Node process, so `unwrap`, `expect`, panic, and indexing
//!   are denied below rather than reviewed for.

#![deny(clippy::unwrap_used, clippy::expect_used, clippy::panic, clippy::indexing_slicing)]

use napi::bindgen_prelude::*;
use napi_derive::napi;
use taucad_occt_facade as facade;

fn fail(error: facade::Error) -> Error {
	Error::from_reason(error.to_string())
}

fn invalid(message: String) -> Error {
	Error::from_reason(message)
}

fn triple(name: &str, values: &[f64]) -> Result<[f64; 3]> {
	match values {
		[x, y, z] => Ok([*x, *y, *z]),
		other => Err(invalid(format!("{name} must have exactly 3 components, got {}", other.len()))),
	}
}

/// Chord/angle tessellation controls, shared by `mesh` and `toGlb`.
#[napi(object)]
pub struct TessellationOptions {
	pub deflection_linear: f64,
	pub deflection_angular: f64,
	pub relative_linear: bool,
}

impl TryFrom<TessellationOptions> for facade::Tessellation {
	type Error = Error;
	fn try_from(options: TessellationOptions) -> Result<Self> {
		facade::mesh::tessellation(options.deflection_linear, options.deflection_angular, options.relative_linear).map_err(fail)
	}
}

/// A closed planar profile: `kind: 'circle'` uses `radius`/`axis`/`center`,
/// `kind: 'polygon'` uses `points`.
#[napi(object)]
pub struct ProfileInput {
	pub kind: String,
	pub radius: Option<f64>,
	pub axis: Option<Vec<f64>>,
	pub center: Option<Vec<f64>>,
	pub points: Option<Vec<Vec<f64>>>,
}

#[cfg(feature = "modeling")]
impl TryFrom<&ProfileInput> for facade::solid::Profile {
	type Error = Error;
	fn try_from(input: &ProfileInput) -> Result<Self> {
		match input.kind.as_str() {
			"circle" => Ok(facade::solid::Profile::Circle {
				radius: input.radius.ok_or_else(|| invalid("circle profile needs a radius".to_owned()))?,
				axis: triple("profile.axis", input.axis.as_deref().unwrap_or(&facade::solid::AXIS_Z))?,
				center: triple("profile.center", input.center.as_deref().unwrap_or(&[0.0, 0.0, 0.0]))?,
			}),
			"polygon" => {
				let points = input.points.as_ref().ok_or_else(|| invalid("polygon profile needs points".to_owned()))?;
				Ok(facade::solid::Profile::Polygon {
					points: points.iter().map(|p| triple("profile.points[]", p)).collect::<Result<Vec<_>>>()?,
				})
			}
			other => Err(invalid(format!("unknown profile kind '{other}'; expected 'circle' or 'polygon'"))),
		}
	}
}

#[cfg(feature = "modeling")]
fn profiles(inputs: &[ProfileInput]) -> Result<Vec<facade::solid::Profile>> {
	inputs.iter().map(facade::solid::Profile::try_from).collect()
}

#[cfg(feature = "modeling")]
fn orient(name: Option<String>) -> Result<facade::solid::Orient> {
	match name.as_deref() {
		None | Some("fixed") => Ok(facade::solid::Orient::Fixed),
		Some("torsion") => Ok(facade::solid::Orient::Torsion),
		Some(other) => Err(invalid(format!("unknown sweep orientation '{other}'; expected 'fixed' or 'torsion'"))),
	}
}

/// Measured properties of one solid, in one crossing.
#[napi(object)]
pub struct Metrics {
	pub volume: f64,
	pub area: f64,
	pub center: Vec<f64>,
	pub bbox_min: Vec<f64>,
	pub bbox_max: Vec<f64>,
	pub faces: u32,
	pub edges: u32,
}

/// A tessellated batch: typed arrays over the facade's own allocations.
#[napi(object)]
pub struct MeshResult {
	pub positions: Float64Array,
	pub normals: Float64Array,
	pub indices: Uint32Array,
	pub face_ids: BigUint64Array,
	pub triangles: u32,
}

/// An OpenCASCADE solid. Opaque to JavaScript: geometry never leaves except as
/// a whole mesh, a whole GLB, or a whole interchange file.
#[napi]
pub struct Solid {
	inner: facade::Solid,
}

impl From<facade::Solid> for Solid {
	fn from(inner: facade::Solid) -> Self {
		Solid { inner }
	}
}

fn borrow(handles: &[&Solid]) -> Vec<facade::Solid> {
	handles.iter().map(|handle| handle.inner.clone()).collect()
}

#[napi]
impl Solid {
	#[napi(factory)]
	pub fn create_box(min: Vec<f64>, max: Vec<f64>) -> Result<Solid> {
		facade::solid::make_box(triple("min", &min)?, triple("max", &max)?).map(Solid::from).map_err(fail)
	}

	#[napi(factory)]
	pub fn create_cylinder(radius: f64, height: Vec<f64>) -> Result<Solid> {
		facade::solid::make_cylinder(radius, triple("height", &height)?).map(Solid::from).map_err(fail)
	}

	#[napi(factory)]
	pub fn create_sphere(radius: f64) -> Result<Solid> {
		facade::solid::make_sphere(radius).map(Solid::from).map_err(fail)
	}

	#[napi(factory)]
	pub fn create_cone(radius_bottom: f64, radius_top: f64, height: Vec<f64>) -> Result<Solid> {
		facade::solid::make_cone(radius_bottom, radius_top, triple("height", &height)?).map(Solid::from).map_err(fail)
	}

	#[napi(factory)]
	pub fn create_torus(radius: f64, tube: f64, axis: Vec<f64>) -> Result<Solid> {
		facade::solid::make_torus(radius, tube, triple("axis", &axis)?).map(Solid::from).map_err(fail)
	}

	#[napi]
	pub fn translate(&self, offset: Vec<f64>) -> Result<Solid> {
		facade::solid::translate(&self.inner, triple("offset", &offset)?).map(Solid::from).map_err(fail)
	}

	#[napi]
	pub fn rotate(&self, origin: Vec<f64>, direction: Vec<f64>, angle: f64) -> Result<Solid> {
		facade::solid::rotate(&self.inner, triple("origin", &origin)?, triple("direction", &direction)?, angle)
			.map(Solid::from)
			.map_err(fail)
	}

	#[napi]
	pub fn scale(&self, center: Vec<f64>, factor: f64) -> Result<Solid> {
		facade::solid::scale(&self.inner, triple("center", &center)?, factor).map(Solid::from).map_err(fail)
	}

	#[napi]
	pub fn mirror(&self, origin: Vec<f64>, normal: Vec<f64>) -> Result<Solid> {
		facade::solid::mirror(&self.inner, triple("origin", &origin)?, triple("normal", &normal)?).map(Solid::from).map_err(fail)
	}

	#[napi]
	pub fn metrics(&self) -> Metrics {
		let m = facade::solid::metrics(&self.inner);
		Metrics {
			volume: m.volume,
			area: m.area,
			center: m.center.to_vec(),
			bbox_min: m.bbox_min.to_vec(),
			bbox_max: m.bbox_max.to_vec(),
			faces: m.faces,
			edges: m.edges,
		}
	}

	#[napi]
	pub fn edge_ids(&self) -> BigUint64Array {
		BigUint64Array::new(facade::solid::edge_ids(&self.inner))
	}

	#[napi]
	pub fn face_ids(&self) -> BigUint64Array {
		BigUint64Array::new(facade::solid::face_ids(&self.inner))
	}
}

/// Local features live in their own `impl` block: `napi-derive` registers a
/// whole block at once, so `#[cfg]` has to gate the block, not the methods.
#[cfg(feature = "modeling")]
#[napi]
impl Solid {
	/// Fillet the named edges, or every edge when `edgeIds` is omitted.
	#[napi]
	pub fn fillet(&self, radius: f64, edge_ids: Option<BigUint64Array>) -> Result<Solid> {
		facade::solid::fillet(&self.inner, radius, edge_ids.as_deref().unwrap_or_default()).map(Solid::from).map_err(fail)
	}

	/// Chamfer the named edges, or every edge when `edgeIds` is omitted.
	#[napi]
	pub fn chamfer(&self, distance: f64, edge_ids: Option<BigUint64Array>) -> Result<Solid> {
		facade::solid::chamfer(&self.inner, distance, edge_ids.as_deref().unwrap_or_default()).map(Solid::from).map_err(fail)
	}

	/// Hollow the solid, opening the named faces.
	#[napi]
	pub fn shell(&self, thickness: f64, open_face_ids: Option<BigUint64Array>) -> Result<Solid> {
		facade::solid::shell(&self.inner, thickness, open_face_ids.as_deref().unwrap_or_default()).map(Solid::from).map_err(fail)
	}
}

/// Evaluate a DNF boolean expression in one kernel pass.
///
/// `clauses` is a flat 0-terminated clause list of 1-based literals into
/// `solids`; negative literals are complements.
#[napi]
pub fn boolean(solids: Vec<&Solid>, clauses: Int32Array) -> Result<Vec<Solid>> {
	let operands = borrow(&solids);
	let clauses: Vec<i64> = clauses.iter().map(|&literal| i64::from(literal)).collect();
	facade::boolean::boolean(&operands, &clauses)
		.map(|pieces| pieces.into_iter().map(Solid::from).collect())
		.map_err(fail)
}

/// Union of every operand.
///
/// `route` overrides the arity routing (`'single'` = one N-ary CellsBuilder
/// pass, `'tree'` = balanced pairwise reduction); omit it to take the measured
/// threshold. The override exists so `bench/boolean-arity.mjs` can price both
/// routes without recompiling — it is not a modelling knob.
#[napi]
pub fn fuse_all(solids: Vec<&Solid>, route: Option<String>) -> Result<Solid> {
	let operands = borrow(&solids);
	let route = match route.as_deref() {
		None => facade::boolean::route_for(operands.len()),
		Some("single") => facade::boolean::Route::Single,
		Some("tree") => facade::boolean::Route::Tree,
		Some(other) => return Err(invalid(format!("unknown fuse route '{other}'; expected 'single' or 'tree'"))),
	};
	facade::boolean::fuse_all_routed(&operands, route).map(|(solid, _)| Solid::from(solid)).map_err(fail)
}

/// Subtract every tool from `base` in one kernel pass.
#[napi]
pub fn cut_all(base: &Solid, tools: Vec<&Solid>) -> Result<Solid> {
	facade::boolean::cut_all(&base.inner, &borrow(&tools)).map(Solid::from).map_err(fail)
}

/// Intersection of every operand in one kernel pass.
#[napi]
pub fn common_all(solids: Vec<&Solid>) -> Result<Solid> {
	facade::boolean::common_all(&borrow(&solids)).map(Solid::from).map_err(fail)
}

/// Linear extrusion of a closed profile.
#[cfg(feature = "modeling")]
#[napi]
pub fn extrude(profile: ProfileInput, direction: Vec<f64>) -> Result<Solid> {
	facade::solid::extrude(&(&profile).try_into()?, triple("direction", &direction)?).map(Solid::from).map_err(fail)
}

/// Loft through two or more sections.
#[cfg(feature = "modeling")]
#[napi]
pub fn loft(sections: Vec<ProfileInput>, ruled: Option<bool>) -> Result<Solid> {
	facade::solid::loft(&profiles(&sections)?, ruled.unwrap_or(false)).map(Solid::from).map_err(fail)
}

/// Sweep a closed profile along a closed or open spine profile.
#[cfg(feature = "modeling")]
#[napi]
pub fn sweep(profile: ProfileInput, spine: ProfileInput, orientation: Option<String>) -> Result<Solid> {
	facade::solid::sweep(&(&profile).try_into()?, &(&spine).try_into()?, orient(orientation)?).map(Solid::from).map_err(fail)
}

/// Arguments for [`sweep_line`], as one object.
#[cfg(feature = "modeling")]
#[napi(object)]
pub struct SweepLineOptions {
	pub profile: ProfileInput,
	pub start: Vec<f64>,
	pub end: Vec<f64>,
	pub orientation: Option<String>,
}

/// Sweep a closed profile along a straight spine.
#[cfg(feature = "modeling")]
#[napi]
pub fn sweep_line(options: SweepLineOptions) -> Result<Solid> {
	let SweepLineOptions { profile, start, end, orientation } = options;
	facade::solid::sweep_line(&(&profile).try_into()?, triple("start", &start)?, triple("end", &end)?, orient(orientation)?)
		.map(Solid::from)
		.map_err(fail)
}

/// Tessellate a batch of solids; the arrays are views over the Rust buffers.
#[napi]
pub fn mesh(solids: Vec<&Solid>, tessellation: TessellationOptions) -> Result<MeshResult> {
	let operands: Vec<&facade::Solid> = solids.iter().map(|handle| &handle.inner).collect();
	let data = facade::mesh::mesh(&operands, tessellation.try_into()?).map_err(fail)?;
	let triangles = data.triangles() as u32;
	Ok(MeshResult {
		positions: Float64Array::new(data.positions),
		normals: Float64Array::new(data.normals),
		indices: Uint32Array::new(data.indices),
		face_ids: BigUint64Array::new(data.face_ids),
		triangles,
	})
}

/// Tessellate and encode a batch of solids as one glTF-binary buffer.
#[napi]
pub fn to_glb(solids: Vec<&Solid>, tessellation: TessellationOptions) -> Result<Buffer> {
	let operands: Vec<&facade::Solid> = solids.iter().map(|handle| &handle.inner).collect();
	facade::mesh::to_glb(&operands, tessellation.try_into()?).map(Buffer::from).map_err(fail)
}

/// Read every solid out of a STEP file.
#[cfg(feature = "step")]
#[napi]
pub fn read_step(bytes: Buffer) -> Result<Vec<Solid>> {
	facade::io::read_step(bytes.as_ref())
		.map(|solids| solids.into_iter().map(Solid::from).collect())
		.map_err(fail)
}

/// Write a batch of solids to a STEP file.
#[cfg(feature = "step")]
#[napi]
pub fn write_step(solids: Vec<&Solid>) -> Result<Buffer> {
	let operands: Vec<&facade::Solid> = solids.iter().map(|handle| &handle.inner).collect();
	facade::io::write_step(&operands).map(Buffer::from).map_err(fail)
}

/// Read every solid out of an OCCT BRep file.
#[cfg(feature = "step")]
#[napi]
pub fn read_brep(bytes: Buffer) -> Result<Vec<Solid>> {
	facade::io::read_brep(bytes.as_ref())
		.map(|solids| solids.into_iter().map(Solid::from).collect())
		.map_err(fail)
}

/// Write a batch of solids to an OCCT BRep file — the byte-stable interchange
/// the parity corpus fingerprints.
#[cfg(feature = "step")]
#[napi]
pub fn write_brep(solids: Vec<&Solid>) -> Result<Buffer> {
	let operands: Vec<&facade::Solid> = solids.iter().map(|handle| &handle.inner).collect();
	facade::io::write_brep(&operands).map(Buffer::from).map_err(fail)
}

/// Backend identity. OCCT's patch level is a parity axis, so it is reported
/// rather than assumed.
#[napi(object)]
pub struct BackendVersion {
	pub backend: String,
	pub occt: String,
	pub package: String,
}

#[napi]
pub fn version() -> BackendVersion {
	BackendVersion {
		backend: "native".to_owned(),
		occt: facade::OCCT_VERSION.to_owned(),
		package: env!("CARGO_PKG_VERSION").to_owned(),
	}
}
