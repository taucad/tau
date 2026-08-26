//! Primitives, transforms, profile-driven constructions, and local features.
//!
//! Every entry point takes whole arguments and returns a whole solid: no
//! per-vertex or per-scalar surface exists here or in the N-API shell above it.

use cadrum::{Edge, ProfileOrient, Solid};

use crate::{finite, nonzero_vec3, positive, vec3, Error, Result};

/// A closed planar profile, expressed as data rather than as kernel edge
/// handles so a caller crosses the boundary once per construction.
#[derive(Debug, Clone)]
pub enum Profile {
	/// Circle of `radius` centred at `center`, normal to `axis`.
	Circle { radius: f64, axis: [f64; 3], center: [f64; 3] },
	/// Closed polygon through `points` (the closing segment is implicit).
	Polygon { points: Vec<[f64; 3]> },
}

impl Profile {
	fn edges(&self) -> Result<Vec<Edge>> {
		match self {
			Profile::Circle { radius, axis, center } => {
				let radius = positive("profile.radius", *radius)?;
				let axis = nonzero_vec3("profile.axis", *axis)?;
				let center = vec3("profile.center", *center)?;
				Ok(vec![Edge::circle(radius, axis)?.translate(center)])
			}
			Profile::Polygon { points } => {
				if points.len() < 3 {
					return Err(Error::Invalid(format!("polygon profile needs >= 3 points, got {}", points.len())));
				}
				let points = points
					.iter()
					.enumerate()
					.map(|(i, p)| vec3(&format!("profile.points[{i}]"), *p))
					.collect::<Result<Vec<_>>>()?;
				Ok(Edge::polygon(points.iter())?)
			}
		}
	}
}

/// How a swept profile is carried along its spine.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Orient {
	/// Parallel transport — right for straight spines.
	Fixed,
	/// Frenet frame — right for helices and twisted ribbons.
	Torsion,
}

impl Orient {
	fn as_cadrum(self) -> ProfileOrient<'static> {
		match self {
			Orient::Fixed => ProfileOrient::Fixed,
			Orient::Torsion => ProfileOrient::Torsion,
		}
	}
}

/// Axis-aligned box between two opposite corners.
pub fn make_box(min: [f64; 3], max: [f64; 3]) -> Result<Solid> {
	let min = vec3("min", min)?;
	let max = vec3("max", max)?;
	if (max - min).min_element() <= 0.0 {
		return Err(Error::Invalid(format!("box needs max > min on every axis, got {min:?}..{max:?}")));
	}
	Ok(Solid::cube(min, max))
}

/// Cylinder of `radius` spanning the vector `height` from the origin.
pub fn make_cylinder(radius: f64, height: [f64; 3]) -> Result<Solid> {
	Ok(Solid::cylinder(positive("radius", radius)?, nonzero_vec3("height", height)?))
}

/// Sphere of `radius` centred at the origin.
pub fn make_sphere(radius: f64) -> Result<Solid> {
	Ok(Solid::sphere(positive("radius", radius)?))
}

/// Cone (or truncated cone) from `radius_bottom` to `radius_top` along `height`.
pub fn make_cone(radius_bottom: f64, radius_top: f64, height: [f64; 3]) -> Result<Solid> {
	let bottom = finite("radiusBottom", radius_bottom)?;
	let top = finite("radiusTop", radius_top)?;
	if bottom < 0.0 || top < 0.0 || bottom + top <= 0.0 {
		return Err(Error::Invalid(format!("cone radii must be >= 0 and not both 0, got {bottom} and {top}")));
	}
	Ok(Solid::cone(bottom, top, nonzero_vec3("height", height)?))
}

/// Torus of major radius `radius` and minor radius `tube`.
pub fn make_torus(radius: f64, tube: f64, axis: [f64; 3]) -> Result<Solid> {
	Ok(Solid::torus(positive("radius", radius)?, positive("tube", tube)?, nonzero_vec3("axis", axis)?))
}

/// Translate by a vector.
pub fn translate(solid: &Solid, offset: [f64; 3]) -> Result<Solid> {
	Ok(solid.clone().translate(vec3("offset", offset)?))
}

/// Rotate `angle` radians about the axis through `origin` along `direction`.
pub fn rotate(solid: &Solid, origin: [f64; 3], direction: [f64; 3], angle: f64) -> Result<Solid> {
	Ok(solid.clone().rotate(vec3("origin", origin)?, nonzero_vec3("direction", direction)?, finite("angle", angle)?))
}

/// Uniform scale about `center`.
pub fn scale(solid: &Solid, center: [f64; 3], factor: f64) -> Result<Solid> {
	Ok(solid.clone().scale(vec3("center", center)?, positive("factor", factor)?))
}

/// Mirror across the plane through `origin` with the given `normal`.
pub fn mirror(solid: &Solid, origin: [f64; 3], normal: [f64; 3]) -> Result<Solid> {
	Ok(solid.clone().mirror(vec3("origin", origin)?, nonzero_vec3("normal", normal)?))
}

/// Linear extrusion of a closed profile.
#[cfg(feature = "modeling")]
pub fn extrude(profile: &Profile, direction: [f64; 3]) -> Result<Solid> {
	let edges = profile.edges()?;
	Ok(Solid::extrude(edges.iter(), nonzero_vec3("direction", direction)?)?)
}

/// Loft through two or more sections.
#[cfg(feature = "modeling")]
pub fn loft(sections: &[Profile], ruled: bool) -> Result<Solid> {
	if sections.len() < 2 {
		return Err(Error::Invalid(format!("loft needs >= 2 sections, got {}", sections.len())));
	}
	let edges = sections.iter().map(Profile::edges).collect::<Result<Vec<_>>>()?;
	Ok(Solid::loft(edges.iter().map(|section| section.iter()), ruled)?)
}

/// Sweep a closed profile along an open or closed spine.
#[cfg(feature = "modeling")]
pub fn sweep(profile: &Profile, spine: &Profile, orient: Orient) -> Result<Solid> {
	let profile = profile.edges()?;
	let spine = spine.edges()?;
	Ok(Solid::sweep(profile.iter(), spine.iter(), orient.as_cadrum())?)
}

/// Sweep a profile along a straight spine from `start` to `end`.
///
/// The straight case is common enough (and awkward enough to express as a
/// degenerate polygon) to deserve its own entry point.
#[cfg(feature = "modeling")]
pub fn sweep_line(profile: &Profile, start: [f64; 3], end: [f64; 3], orient: Orient) -> Result<Solid> {
	let start = vec3("start", start)?;
	let end = vec3("end", end)?;
	if start == end {
		return Err(Error::Invalid("sweep spine start and end must differ".to_owned()));
	}
	let profile = profile.edges()?;
	let spine = [Edge::line(start, end)?];
	Ok(Solid::sweep(profile.iter(), spine.iter(), orient.as_cadrum())?)
}

/// Select edges by id; an empty selector means "every edge".
#[cfg(feature = "modeling")]
fn select_edges<'a>(solid: &'a Solid, ids: &[u64]) -> Result<Vec<&'a Edge>> {
	if ids.is_empty() {
		return Ok(solid.iter_edge().collect());
	}
	let selected: Vec<&Edge> = solid.iter_edge().filter(|edge| ids.contains(&edge.id())).collect();
	if selected.len() != ids.len() {
		return Err(Error::Invalid(format!("{} of {} edge ids are not on this solid", ids.len() - selected.len(), ids.len())));
	}
	Ok(selected)
}

/// Constant-radius fillet on the selected edges (all edges when `edge_ids` is empty).
#[cfg(feature = "modeling")]
pub fn fillet(solid: &Solid, radius: f64, edge_ids: &[u64]) -> Result<Solid> {
	Ok(solid.fillet_edges(positive("radius", radius)?, select_edges(solid, edge_ids)?)?)
}

/// Constant-distance chamfer on the selected edges (all edges when `edge_ids` is empty).
#[cfg(feature = "modeling")]
pub fn chamfer(solid: &Solid, distance: f64, edge_ids: &[u64]) -> Result<Solid> {
	Ok(solid.chamfer_edges(positive("distance", distance)?, select_edges(solid, edge_ids)?)?)
}

/// Hollow the solid, removing the faces named by `open_face_ids`.
#[cfg(feature = "modeling")]
pub fn shell(solid: &Solid, thickness: f64, open_face_ids: &[u64]) -> Result<Solid> {
	let thickness = finite("thickness", thickness)?;
	if thickness == 0.0 {
		return Err(Error::Invalid("shell thickness must not be 0".to_owned()));
	}
	let faces: Vec<_> = solid.iter_face().filter(|face| open_face_ids.contains(&face.id())).collect();
	if faces.len() != open_face_ids.len() {
		return Err(Error::Invalid(format!(
			"{} of {} face ids are not on this solid",
			open_face_ids.len() - faces.len(),
			open_face_ids.len()
		)));
	}
	Ok(solid.shell(thickness, faces)?)
}

/// Everything a parity gate or a UI inspector needs, in one crossing.
#[derive(Debug, Clone, PartialEq)]
pub struct Metrics {
	pub volume: f64,
	pub area: f64,
	pub center: [f64; 3],
	pub bbox_min: [f64; 3],
	pub bbox_max: [f64; 3],
	pub faces: u32,
	pub edges: u32,
}

/// Measure a solid. One call, never one call per quantity.
pub fn metrics(solid: &Solid) -> Metrics {
	let [min, max] = solid.bounding_box();
	let center = solid.center();
	Metrics {
		volume: solid.volume(),
		area: solid.area(),
		center: center.to_array(),
		bbox_min: min.to_array(),
		bbox_max: max.to_array(),
		faces: solid.iter_face().count() as u32,
		edges: solid.iter_edge().count() as u32,
	}
}

/// Stable ids of every edge, for a follow-up fillet/chamfer selection.
pub fn edge_ids(solid: &Solid) -> Vec<u64> {
	solid.iter_edge().map(Edge::id).collect()
}

/// Stable ids of every face, for a follow-up shell selection.
pub fn face_ids(solid: &Solid) -> Vec<u64> {
	solid.iter_face().map(cadrum::Face::id).collect()
}

/// The `axis` argument shared by primitives that stand on the Z axis.
pub const AXIS_Z: [f64; 3] = [0.0, 0.0, 1.0];

#[cfg(all(test, feature = "modeling"))]
mod tests {
	use super::*;

	#[test]
	fn box_metrics_are_exact() {
		let solid = make_box([0.0, 0.0, 0.0], [10.0, 20.0, 30.0]).expect("box");
		let m = metrics(&solid);
		assert!((m.volume - 6000.0).abs() < 1e-9, "volume {}", m.volume);
		assert!((m.area - 2.0 * (200.0 + 300.0 + 600.0)).abs() < 1e-9, "area {}", m.area);
		assert_eq!(m.faces, 6);
		assert_eq!(m.edges, 12);
		// OCCT inflates a bounding box by the shape's gap tolerance (1e-7 here),
		// so a bbox is never an exact-equality quantity — the parity gate uses
		// the same tolerance.
		assert!(m.bbox_max.iter().zip([10.0, 20.0, 30.0]).all(|(a, b)| (a - b).abs() < 1e-6), "bbox {:?}", m.bbox_max);
	}

	#[test]
	fn degenerate_arguments_are_rejected_before_occt() {
		assert!(make_box([0.0; 3], [0.0; 3]).is_err());
		assert!(make_cylinder(0.0, AXIS_Z).is_err());
		assert!(make_sphere(f64::NAN).is_err());
		assert!(make_cone(0.0, 0.0, AXIS_Z).is_err());
		assert!(make_torus(5.0, 0.0, AXIS_Z).is_err());
		assert!(loft(&[], false).is_err());
	}

	#[test]
	fn transforms_move_the_bounding_box() {
		let solid = make_box([0.0; 3], [1.0, 1.0, 1.0]).expect("box");
		let moved = translate(&solid, [5.0, 0.0, 0.0]).expect("translate");
		assert!((metrics(&moved).bbox_min[0] - 5.0).abs() < 1e-6, "bbox {:?}", metrics(&moved).bbox_min);
		let mirrored = mirror(&solid, [0.0; 3], AXIS_Z).expect("mirror");
		assert!((metrics(&mirrored).volume - 1.0).abs() < 1e-9);
		assert!(scale(&solid, [0.0; 3], 2.0).is_ok());
		assert!(rotate(&solid, [0.0; 3], AXIS_Z, std::f64::consts::FRAC_PI_2).is_ok());
	}

	#[test]
	fn fillet_and_chamfer_default_to_every_edge() {
		let solid = make_box([0.0; 3], [20.0, 20.0, 20.0]).expect("box");
		let filleted = fillet(&solid, 3.0, &[]).expect("fillet");
		assert!(metrics(&filleted).faces > 6);
		let chamfered = chamfer(&solid, 2.0, &[]).expect("chamfer");
		assert!(metrics(&chamfered).faces > 6);
		assert!(fillet(&solid, 3.0, &[u64::MAX]).is_err());
	}

	#[test]
	fn shell_removes_the_named_face() {
		let solid = make_box([0.0; 3], [10.0, 10.0, 10.0]).expect("box");
		let open = face_ids(&solid);
		let hollow = shell(&solid, -1.0, &open[..1]).expect("shell");
		assert!(metrics(&hollow).volume < metrics(&solid).volume);
		assert!(shell(&solid, 0.0, &[]).is_err());
		assert!(shell(&solid, 1.0, &[u64::MAX]).is_err());
	}

	#[test]
	fn profile_constructions_build_solids() {
		let square = Profile::Polygon { points: vec![[0.0, 0.0, 0.0], [10.0, 0.0, 0.0], [10.0, 10.0, 0.0], [0.0, 10.0, 0.0]] };
		let prism = extrude(&square, [0.0, 0.0, 5.0]).expect("extrude");
		assert!((metrics(&prism).volume - 500.0).abs() < 1e-6);

		let sections: Vec<Profile> = [(0.0, 10.0), (15.0, 5.0), (30.0, 8.0)]
			.iter()
			.map(|&(z, radius)| Profile::Circle { radius, axis: AXIS_Z, center: [0.0, 0.0, z] })
			.collect();
		assert!(loft(&sections, false).is_ok());

		let circle = Profile::Circle { radius: 5.0, axis: AXIS_Z, center: [0.0; 3] };
		let pipe = sweep_line(&circle, [0.0; 3], [0.0, 0.0, 30.0], Orient::Fixed).expect("sweep");
		assert!(metrics(&pipe).volume > 0.0);
		assert!(sweep_line(&circle, [0.0; 3], [0.0; 3], Orient::Torsion).is_err());
		assert!(Profile::Polygon { points: vec![[0.0; 3]] }.edges().is_err());
	}

	#[test]
	fn ids_are_stable_within_a_shape() {
		let solid = make_box([0.0; 3], [1.0, 1.0, 1.0]).expect("box");
		assert_eq!(edge_ids(&solid).len(), 12);
		assert_eq!(face_ids(&solid).len(), 6);
		assert_eq!(edge_ids(&solid), edge_ids(&solid));
	}
}
