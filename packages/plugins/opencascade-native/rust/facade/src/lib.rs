//! Curated OpenCASCADE facade — pure Rust, no N-API.
//!
//! Design rules inherited from the S2 spike (`docs/research/native-runtime-spike-occt-cadrum-napi.md`, R1):
//!
//! 1. One call per user-visible operation, and a batch form for every op that
//!    can take a list. Never per-scalar, never per-vertex.
//! 2. `Result` at both boundaries — no OCCT throw crosses `cxx`, no Rust panic
//!    crosses `napi_callback`.
//! 3. Arity-aware boolean routing (see [`boolean`]).
//!
//! This crate is deliberately free of `napi` so it is unit-testable with plain
//! `cargo test`, and so it can become the Tau-owned `extern "C"` waist without
//! moving any geometry code.

pub mod boolean;
#[cfg(feature = "step")]
pub mod io;
pub mod mesh;
pub mod solid;

pub use cadrum::{DVec3, Solid, Tessellation};

/// OCCT version the facade was compiled against, read from
/// `$OCCT_ROOT/include/opencascade/Standard_Version.hxx` at build time.
///
/// OCCT's patch level is a parity axis (S2 F7.1: 624/134,920 GLB bytes differ
/// between 8.0.0-rev5 and 8.0.1 on the same source), so the pin is part of the
/// artifact's identity rather than a build detail.
pub const OCCT_VERSION: &str = env!("TAU_OCCT_VERSION");

/// Every fallible facade operation reports through this type.
#[derive(Debug)]
pub enum Error {
	/// The underlying kernel refused the operation.
	Occt(cadrum::Error),
	/// The caller's arguments are not usable (bad arity, empty list, NaN).
	Invalid(String),
}

impl core::fmt::Display for Error {
	fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
		match self {
			Error::Occt(e) => write!(f, "opencascade: {e:?}"),
			Error::Invalid(m) => write!(f, "invalid argument: {m}"),
		}
	}
}

impl std::error::Error for Error {}

impl From<cadrum::Error> for Error {
	fn from(e: cadrum::Error) -> Self {
		Error::Occt(e)
	}
}

/// Facade result alias.
pub type Result<T> = core::result::Result<T, Error>;

/// Reject non-finite scalars before they reach OCCT, where they surface as an
/// opaque failure (or worse, a shape that meshes into NaN vertices).
pub(crate) fn finite(name: &str, value: f64) -> Result<f64> {
	if value.is_finite() {
		Ok(value)
	} else {
		Err(Error::Invalid(format!("{name} must be finite, got {value}")))
	}
}

pub(crate) fn positive(name: &str, value: f64) -> Result<f64> {
	let value = finite(name, value)?;
	if value > 0.0 {
		Ok(value)
	} else {
		Err(Error::Invalid(format!("{name} must be > 0, got {value}")))
	}
}

pub(crate) fn vec3(name: &str, v: [f64; 3]) -> Result<DVec3> {
	for (axis, value) in ["x", "y", "z"].iter().zip(v) {
		finite(&format!("{name}.{axis}"), value)?;
	}
	Ok(DVec3::new(v[0], v[1], v[2]))
}

pub(crate) fn nonzero_vec3(name: &str, v: [f64; 3]) -> Result<DVec3> {
	let v = vec3(name, v)?;
	if v.length_squared() > 0.0 {
		Ok(v)
	} else {
		Err(Error::Invalid(format!("{name} must not be the zero vector")))
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn occt_version_is_the_pinned_patch_level() {
		assert_eq!(OCCT_VERSION, "8.0.1");
	}

	#[test]
	fn rejects_non_finite_scalars() {
		assert!(matches!(finite("r", f64::NAN), Err(Error::Invalid(_))));
		assert!(matches!(positive("r", -1.0), Err(Error::Invalid(_))));
		assert!(matches!(nonzero_vec3("dir", [0.0, 0.0, 0.0]), Err(Error::Invalid(_))));
		assert!(nonzero_vec3("dir", [0.0, 0.0, 1.0]).is_ok());
	}
}
