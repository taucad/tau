//! DNF booleans with arity-aware routing.
//!
//! cadrum evaluates a whole boolean expression in one `BOPAlgo_CellsBuilder`
//! pass. S2 F1.3 measured that pass against multi-tool `BRepAlgoAPI_Fuse` on the
//! same OCCT binary: CellsBuilder is **1.79x faster at arity 2** and **1.65x
//! slower at arity 40**. The algorithm choice moves the number 3x in both
//! directions; the FFI does not move it at all. So the facade routes on arity.
//!
//! Two routes exist today, both CellsBuilder-based:
//!
//! * [`Route::Single`] — one N-ary `Build`. Fewest BOPDS inits, but the
//!   intersection lattice grows super-linearly with operand count.
//! * [`Route::Tree`] — balanced pairwise reduction, i.e. repeated arity-2
//!   `Build`s. More inits, each over a smaller lattice. (A left-fold chain is
//!   the known anti-pattern and is deliberately not offered.)
//!
//! A third route — OCCT's multi-tool `BRepAlgoAPI_Fuse`/`_Cut` — is not
//! reachable from cadrum's public API. See `bench/` for the measured threshold
//! and the report for the prepared upstream patch.

use cadrum::Solid;

use crate::{Error, Result};

/// Operand count at or above which [`fuse_all`] switches from one N-ary
/// `CellsBuilder` pass to a balanced pairwise reduction, or `None` when no
/// measured arity favours the tree route.
///
/// Benchmark-derived on Apple M2 Pro / OCCT 8.0.1 / cadrum 0.8.16
/// (`bench/boolean-arity.mjs`, 25 interleaved samples per cell): the tree route
/// is 1.07x the single route at arity 2 and 1.91x at arity 40 — it never wins,
/// so the constant is `None` and [`fuse_all`] always takes one `Build`. The
/// route that *does* win at high arity is multi-tool `BRepAlgoAPI_Fuse`, which
/// cadrum does not expose; the prepared upstream patch measured 45.7 ms against
/// this path's 74.2 ms at arity 40. [`fuse_all_routed`] still prices the tree
/// route on demand so the constant stays falsifiable.
pub const FUSE_ARITY_THRESHOLD: Option<usize> = None;

/// Which evaluation route a boolean took. Reported so a benchmark can assert
/// the routing decision instead of inferring it from wall time.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Route {
	/// One N-ary `BOPAlgo_CellsBuilder` pass.
	Single,
	/// Balanced pairwise reduction over arity-2 passes.
	Tree,
}

/// Evaluate a DNF boolean expression over `solids` in one kernel pass.
///
/// `clauses` is a flat, 0-terminated DIMACS-style DNF: literals are 1-based
/// indices into `solids`, negative literals are complements, and each `0` ends
/// a conjunctive clause. `[1, -2, 0]` is `solids[0] - solids[1]`;
/// `[1, 0, 2, 0]` is `solids[0] + solids[1]`.
pub fn boolean(solids: &[Solid], clauses: &[i64]) -> Result<Vec<Solid>> {
	validate(solids.len(), clauses)?;
	Ok(Solid::boolean(solids.iter(), clauses.iter().copied()).build_vec()?)
}

fn validate(solid_count: usize, clauses: &[i64]) -> Result<()> {
	if solid_count == 0 {
		return Err(Error::Invalid("boolean needs at least one solid".to_owned()));
	}
	if clauses.is_empty() {
		return Err(Error::Invalid("boolean needs at least one clause".to_owned()));
	}
	if clauses.last() != Some(&0) {
		return Err(Error::Invalid("clause list must end with a 0 terminator".to_owned()));
	}
	let limit = solid_count as i64;
	for &literal in clauses {
		if literal.unsigned_abs() as usize > solid_count {
			return Err(Error::Invalid(format!("literal {literal} is out of range for {limit} solids")));
		}
	}
	Ok(())
}

/// Union of every solid, evaluated through the arity-routed path.
pub fn fuse_all(solids: &[Solid]) -> Result<Solid> {
	fuse_all_routed(solids, route_for(solids.len())).map(|(solid, _)| solid)
}

/// The routing decision for a given operand count.
pub fn route_for(count: usize) -> Route {
	match FUSE_ARITY_THRESHOLD {
		Some(threshold) if count >= threshold => Route::Tree,
		_ => Route::Single,
	}
}

/// Union with an explicit route. Exposed so the benchmark can price both
/// without recompiling.
pub fn fuse_all_routed(solids: &[Solid], route: Route) -> Result<(Solid, Route)> {
	match solids.len() {
		0 => Err(Error::Invalid("fuseAll needs at least one solid".to_owned())),
		1 => Ok((solids[0].clone(), route)),
		_ => match route {
			Route::Single => {
				let clauses: Vec<i64> = (1..=solids.len() as i64).flat_map(|i| [i, 0]).collect();
				Ok((one(boolean(solids, &clauses)?, "fuseAll")?, route))
			}
			Route::Tree => Ok((fuse_tree(solids)?, route)),
		},
	}
}

/// Balanced pairwise reduction: halve the operand list each pass so the depth
/// is log2(n) rather than n.
fn fuse_tree(solids: &[Solid]) -> Result<Solid> {
	let mut level: Vec<Solid> = solids.to_vec();
	while level.len() > 1 {
		let mut next = Vec::with_capacity(level.len().div_ceil(2));
		for pair in level.chunks(2) {
			match pair {
				[a, b] => next.push(one(boolean(&[a.clone(), b.clone()], &[1, 0, 2, 0])?, "fuseAll")?),
				[a] => next.push(a.clone()),
				_ => unreachable!("chunks(2) yields 1 or 2 elements"),
			}
		}
		level = next;
	}
	level.pop().ok_or_else(|| Error::Invalid("fuseAll produced no solid".to_owned()))
}

/// Subtract every tool from `base` in one kernel pass.
///
/// `base - t1 - t2 - ...` is a single DNF clause (`base AND NOT t1 AND ...`),
/// so no arity routing applies: it is always one `Build`.
pub fn cut_all(base: &Solid, tools: &[Solid]) -> Result<Solid> {
	if tools.is_empty() {
		return Ok(base.clone());
	}
	let mut solids = Vec::with_capacity(tools.len() + 1);
	solids.push(base.clone());
	solids.extend_from_slice(tools);

	let mut clauses: Vec<i64> = Vec::with_capacity(tools.len() + 2);
	clauses.push(1);
	clauses.extend((2..=solids.len() as i64).map(|i| -i));
	clauses.push(0);

	one(boolean(&solids, &clauses)?, "cutAll")
}

/// Intersection of every solid — one clause, one pass.
pub fn common_all(solids: &[Solid]) -> Result<Solid> {
	if solids.is_empty() {
		return Err(Error::Invalid("commonAll needs at least one solid".to_owned()));
	}
	let mut clauses: Vec<i64> = (1..=solids.len() as i64).collect();
	clauses.push(0);
	one(boolean(solids, &clauses)?, "commonAll")
}

fn one(mut pieces: Vec<Solid>, op: &str) -> Result<Solid> {
	match pieces.len() {
		1 => Ok(pieces.remove(0)),
		n => Err(Error::Invalid(format!("{op} produced {n} disjoint pieces; use boolean() to receive them all"))),
	}
}

#[cfg(test)]
mod tests {
	use super::*;
	use crate::solid::{make_box, metrics};

	fn overlapping(count: usize) -> Vec<Solid> {
		(0..count)
			.map(|i| {
				let x = i as f64 * 3.0;
				make_box([x, 0.0, 0.0], [x + 4.0, 4.0, 4.0]).expect("box")
			})
			.collect()
	}

	#[test]
	fn dnf_union_and_difference_agree_with_measured_volume() {
		let a = make_box([0.0; 3], [10.0, 10.0, 10.0]).expect("a");
		let b = make_box([5.0, 5.0, 5.0], [15.0, 15.0, 15.0]).expect("b");

		let union = boolean(&[a.clone(), b.clone()], &[1, 0, 2, 0]).expect("union");
		assert_eq!(union.len(), 1);
		assert!((metrics(&union[0]).volume - (1000.0 + 1000.0 - 125.0)).abs() < 1e-6);

		let difference = boolean(&[a.clone(), b.clone()], &[1, -2, 0]).expect("difference");
		assert!((metrics(&difference[0]).volume - 875.0).abs() < 1e-6);

		let intersection = common_all(&[a, b]).expect("intersection");
		assert!((metrics(&intersection).volume - 125.0).abs() < 1e-6);
	}

	#[test]
	fn malformed_clause_lists_are_rejected() {
		let a = make_box([0.0; 3], [1.0, 1.0, 1.0]).expect("a");
		assert!(boolean(&[], &[1, 0]).is_err());
		assert!(boolean(&[a.clone()], &[]).is_err());
		assert!(boolean(&[a.clone()], &[1]).is_err());
		assert!(boolean(&[a], &[2, 0]).is_err());
	}

	#[test]
	fn both_fuse_routes_produce_the_same_volume() {
		let boxes = overlapping(6);
		let (single, _) = fuse_all_routed(&boxes, Route::Single).expect("single");
		let (tree, _) = fuse_all_routed(&boxes, Route::Tree).expect("tree");
		let a = metrics(&single);
		let b = metrics(&tree);
		assert!((a.volume - b.volume).abs() < 1e-6, "{} vs {}", a.volume, b.volume);
		assert_eq!(a.faces, b.faces);
	}

	#[test]
	fn routing_follows_the_measured_threshold() {
		assert_eq!(route_for(2), Route::Single);
		assert_eq!(route_for(40), match FUSE_ARITY_THRESHOLD {
			Some(threshold) if threshold <= 40 => Route::Tree,
			_ => Route::Single,
		});
		assert_eq!(fuse_all(&overlapping(1)).map(|s| metrics(&s).faces).expect("single operand"), 6);
		assert!(fuse_all(&[]).is_err());
	}

	#[test]
	fn cut_all_removes_every_tool_in_one_pass() {
		let base = make_box([0.0, 0.0, 0.0], [10.0, 10.0, 10.0]).expect("base");
		let tools = vec![
			make_box([-1.0, -1.0, -1.0], [1.0, 1.0, 1.0]).expect("t0"),
			make_box([9.0, 9.0, 9.0], [11.0, 11.0, 11.0]).expect("t1"),
		];
		let out = cut_all(&base, &tools).expect("cut");
		assert!((metrics(&out).volume - (1000.0 - 1.0 - 1.0)).abs() < 1e-6);
		assert_eq!(metrics(&cut_all(&base, &[]).expect("no tools")).volume, metrics(&base).volume);
	}

	#[test]
	fn a_disjoint_union_reports_rather_than_silently_dropping_pieces() {
		let a = make_box([0.0; 3], [1.0, 1.0, 1.0]).expect("a");
		let b = make_box([50.0, 50.0, 50.0], [51.0, 51.0, 51.0]).expect("b");
		assert!(fuse_all(&[a.clone(), b.clone()]).is_err());
		assert_eq!(boolean(&[a, b], &[1, 0, 2, 0]).expect("pieces").len(), 2);
	}
}
