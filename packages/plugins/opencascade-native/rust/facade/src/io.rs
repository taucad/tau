//! STEP and BRep interchange.
//!
//! Bytes in, bytes out — the whole file crosses the boundary once. STEP pulls
//! in OCCT's DataExchange module and is 88% of the addon's size growth
//! (S2 F6.4), which is why the payload split is a build decision rather than a
//! runtime one.

use cadrum::Solid;

use crate::{Error, Result};

/// Read every solid out of a STEP part21 file.
pub fn read_step(bytes: &[u8]) -> Result<Vec<Solid>> {
	if bytes.is_empty() {
		return Err(Error::Invalid("readStep received an empty buffer".to_owned()));
	}
	let mut cursor = std::io::Cursor::new(bytes);
	let solids = Solid::read_step(&mut cursor)?;
	if solids.is_empty() {
		return Err(Error::Invalid("readStep found no solids in the file".to_owned()));
	}
	Ok(solids)
}

/// Write a batch of solids to a STEP part21 file.
pub fn write_step(solids: &[&Solid]) -> Result<Vec<u8>> {
	if solids.is_empty() {
		return Err(Error::Invalid("writeStep needs at least one solid".to_owned()));
	}
	let mut out: Vec<u8> = Vec::with_capacity(1 << 16);
	Solid::write_step(solids.iter().copied(), &mut out)?;
	Ok(out)
}

/// Read every solid out of an OCCT BRep file.
pub fn read_brep(bytes: &[u8]) -> Result<Vec<Solid>> {
	if bytes.is_empty() {
		return Err(Error::Invalid("readBrep received an empty buffer".to_owned()));
	}
	let mut cursor = std::io::Cursor::new(bytes);
	Ok(Solid::read_brep(&mut cursor)?)
}

/// Write a batch of solids to an OCCT BRep file.
///
/// BRep is the exact-geometry serialization the parity corpus fingerprints:
/// unlike STEP it carries no timestamp header, so identical input gives
/// identical bytes.
pub fn write_brep(solids: &[&Solid]) -> Result<Vec<u8>> {
	if solids.is_empty() {
		return Err(Error::Invalid("writeBrep needs at least one solid".to_owned()));
	}
	let mut out: Vec<u8> = Vec::with_capacity(1 << 16);
	Solid::write_brep(solids.iter().copied(), &mut out)?;
	Ok(out)
}

#[cfg(test)]
mod tests {
	use super::*;
	use crate::solid::{make_box, metrics};

	#[test]
	fn step_round_trips_a_solid() {
		let solid = make_box([0.0; 3], [10.0, 20.0, 30.0]).expect("box");
		let step = write_step(&[&solid]).expect("write");
		assert!(step.starts_with(b"ISO-10303-21;"), "not a part21 file");

		let read = read_step(&step).expect("read");
		assert_eq!(read.len(), 1);
		assert!((metrics(&read[0]).volume - 6000.0).abs() < 1e-6);
	}

	#[test]
	fn brep_round_trips_and_is_byte_stable() {
		let solid = make_box([0.0; 3], [1.0, 2.0, 3.0]).expect("box");
		let first = write_brep(&[&solid]).expect("write");
		let second = write_brep(&[&solid]).expect("write again");
		assert_eq!(first, second, "BRep output is not reproducible");
		assert_eq!(read_brep(&first).expect("read").len(), 1);
	}

	#[test]
	fn empty_input_is_an_error_not_an_empty_result() {
		assert!(read_step(&[]).is_err());
		assert!(read_brep(&[]).is_err());
		assert!(write_step(&[]).is_err());
		assert!(write_brep(&[]).is_err());
		assert!(read_step(b"not a step file").is_err());
	}
}
