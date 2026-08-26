//! Bake the OCCT patch level the facade links against into the binary.
//!
//! OCCT's patch version is a parity axis (S2 F7.1), so the artifact has to be
//! able to report which OCCT produced its geometry without a second crossing.

use std::path::PathBuf;

fn main() {
	println!("cargo:rerun-if-env-changed=OCCT_ROOT");

	let Some(root) = std::env::var_os("OCCT_ROOT").map(PathBuf::from) else {
		// No `OCCT_ROOT`: cadrum downloads its own prebuilt and owns the pin.
		println!("cargo:rustc-env=TAU_OCCT_VERSION=unknown");
		return;
	};

	let header = root.join("include/opencascade/Standard_Version.hxx");
	println!("cargo:rerun-if-changed={}", header.display());

	let version = std::fs::read_to_string(&header)
		.ok()
		.and_then(|text| {
			text.lines()
				.find_map(|line| line.strip_prefix("#define OCC_VERSION_COMPLETE "))
				.map(|value| value.trim().trim_matches('"').to_owned())
		})
		.unwrap_or_else(|| panic!("OCCT_ROOT is set but {} has no OCC_VERSION_COMPLETE", header.display()));

	println!("cargo:rustc-env=TAU_OCCT_VERSION={version}");
}
