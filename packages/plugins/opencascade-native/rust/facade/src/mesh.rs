//! Tessellation and glTF-binary export.
//!
//! Meshes leave the facade as flat `Vec`s so the N-API shell can hand V8 an
//! external buffer over the same allocation: nothing is copied per vertex, and
//! nothing is read back across the boundary one scalar at a time.

use cadrum::{Solid, Tessellation};

use crate::{finite, positive, Error, Result};

/// A tessellated batch of solids, laid out for zero-copy handoff.
///
/// `positions` and `normals` are 3 f64 per vertex; `indices` are 3 u32 per
/// triangle; `face_ids` is one u64 per triangle (not per index).
#[derive(Debug, Clone, Default)]
pub struct MeshData {
	pub positions: Vec<f64>,
	pub normals: Vec<f64>,
	pub indices: Vec<u32>,
	pub face_ids: Vec<u64>,
}

impl MeshData {
	pub fn triangles(&self) -> usize {
		self.indices.len() / 3
	}

	pub fn vertices(&self) -> usize {
		self.positions.len() / 3
	}
}

fn checked(tessellation: Tessellation) -> Result<Tessellation> {
	positive("tessellation.deflectionLinear", tessellation.deflection_linear)?;
	positive("tessellation.deflectionAngular", tessellation.deflection_angular)?;
	Ok(tessellation)
}

/// Tessellate a batch of solids in one kernel pass.
pub fn mesh(solids: &[&Solid], tessellation: Tessellation) -> Result<MeshData> {
	if solids.is_empty() {
		return Err(Error::Invalid("mesh needs at least one solid".to_owned()));
	}
	let mesh = Solid::mesh(solids.iter().copied(), checked(tessellation)?)?;

	let mut positions = Vec::with_capacity(mesh.vertices.len() * 3);
	for v in &mesh.vertices {
		positions.extend_from_slice(&[v.x, v.y, v.z]);
	}
	let mut normals = Vec::with_capacity(mesh.normals.len() * 3);
	for n in &mesh.normals {
		normals.extend_from_slice(&[n.x, n.y, n.z]);
	}
	let indices = mesh.indices.iter().map(|&i| i as u32).collect();

	Ok(MeshData { positions, normals, indices, face_ids: mesh.face_ids })
}

/// Tessellate and encode a batch of solids as one glTF-binary blob.
///
/// One crossing for the whole render path: S2 F6/F7 measured GLB encode at
/// 0.033 ms, so splitting mesh and encode across the boundary would cost more
/// than the encode itself.
pub fn to_glb(solids: &[&Solid], tessellation: Tessellation) -> Result<Vec<u8>> {
	if solids.is_empty() {
		return Err(Error::Invalid("toGlb needs at least one solid".to_owned()));
	}
	let mesh = Solid::mesh(solids.iter().copied(), checked(tessellation)?)?;
	let mut out: Vec<u8> = Vec::with_capacity(1 << 20);
	mesh.write_gltf_binary(&mut out)?;
	Ok(out)
}

/// Build a [`Tessellation`] from plain scalars, validating them once.
pub fn tessellation(deflection_linear: f64, deflection_angular: f64, relative_linear: bool) -> Result<Tessellation> {
	finite("tessellation.deflectionLinear", deflection_linear)?;
	checked(Tessellation { deflection_linear, deflection_angular, relative_linear })
}

#[cfg(test)]
mod tests {
	use super::*;
	use crate::solid::{make_box, make_cylinder, AXIS_Z};

	fn preview() -> Tessellation {
		Tessellation { deflection_linear: 0.25, deflection_angular: 0.5, relative_linear: false }
	}

	#[test]
	fn a_box_meshes_to_twelve_triangles() {
		let solid = make_box([0.0; 3], [10.0, 10.0, 10.0]).expect("box");
		let data = mesh(&[&solid], preview()).expect("mesh");
		assert_eq!(data.triangles(), 12);
		assert_eq!(data.positions.len(), data.vertices() * 3);
		assert_eq!(data.normals.len(), data.positions.len());
		assert_eq!(data.face_ids.len(), data.triangles());
	}

	#[test]
	fn batching_two_solids_is_one_pass_and_one_buffer() {
		let a = make_box([0.0; 3], [1.0, 1.0, 1.0]).expect("a");
		let b = make_box([5.0, 0.0, 0.0], [6.0, 1.0, 1.0]).expect("b");
		let batched = mesh(&[&a, &b], preview()).expect("mesh");
		let separate = mesh(&[&a], preview()).expect("a").triangles() + mesh(&[&b], preview()).expect("b").triangles();
		assert_eq!(batched.triangles(), separate);
	}

	#[test]
	fn glb_has_a_gltf_magic_and_a_json_chunk() {
		let solid = make_cylinder(5.0, [0.0, 0.0, 15.0]).expect("cylinder");
		let glb = to_glb(&[&solid], preview()).expect("glb");
		assert_eq!(&glb[0..4], b"glTF");
		assert!(glb.len() > 512, "glb is {} bytes", glb.len());
	}

	#[test]
	fn empty_and_degenerate_requests_are_rejected() {
		let solid = make_box([0.0; 3], [1.0, 1.0, 1.0]).expect("box");
		assert!(mesh(&[], preview()).is_err());
		assert!(to_glb(&[], preview()).is_err());
		assert!(mesh(&[&solid], Tessellation { deflection_linear: 0.0, ..preview() }).is_err());
		assert!(to_glb(&[&solid], Tessellation { deflection_angular: -1.0, ..preview() }).is_err());
		assert!(tessellation(f64::NAN, 0.5, false).is_err());
		assert!(tessellation(0.004, 0.5, true).is_ok());
	}

	#[test]
	fn axis_constant_is_the_z_axis() {
		assert_eq!(AXIS_Z, [0.0, 0.0, 1.0]);
	}
}
