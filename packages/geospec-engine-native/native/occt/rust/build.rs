use std::{
    env, fs,
    path::{Path, PathBuf},
};

fn main() {
    println!("cargo:rerun-if-env-changed=GEOSPEC_OCCT_PREFIX");
    println!("cargo:rerun-if-changed=../bridge/geospec_occt_bridge.cpp");
    println!("cargo:rerun-if-changed=../bridge/geospec_occt_bridge.h");

    let manifest = PathBuf::from(env::var_os("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR"));
    let repository = manifest
        .ancestors()
        .nth(5)
        .expect("OCCT crate must stay under the Tau package");
    let prefix = env::var_os("GEOSPEC_OCCT_PREFIX")
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            repository.join("node_modules/.cache/geospec-engine-native/occt/install")
        });
    let include = prefix.join("include/opencascade");
    let library = prefix.join("lib");
    if !include.join("Standard_Version.hxx").is_file() || !library.is_dir() {
        panic!(
            "OCCT static prefix is missing at {}. Run native/occt/build-occt.sh first.",
            prefix.display()
        );
    }

    // Rebuild the bridge and relink when the selected installed prefix changes.
    println!("cargo:rerun-if-changed={}", include.display());
    let toolkits = configured_toolkits(&prefix);
    for toolkit in &toolkits {
        println!(
            "cargo:rerun-if-changed={}",
            library.join(format!("lib{toolkit}.a")).display()
        );
    }

    cc::Build::new()
        .cpp(true)
        .std("c++17")
        .warnings(true)
        .flag("-Werror=deprecated-declarations")
        // Installed-header `__FILE__` strings must not carry the builder's prefix path.
        .flag(format!("-ffile-prefix-map={}=occt", prefix.display()))
        .include(&include)
        .include("../bridge")
        .file("../bridge/geospec_occt_bridge.cpp")
        .compile("geospec_occt_bridge");

    // em++ links the prefix archives itself, so the Emscripten staticlib must not re-bundle their members.
    let kind = if env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("emscripten") {
        "static:-bundle"
    } else {
        "static"
    };
    println!("cargo:rustc-link-search=native={}", library.display());
    for toolkit in toolkits {
        println!("cargo:rustc-link-lib={kind}={toolkit}");
    }
}

fn configured_toolkits(prefix: &Path) -> Vec<String> {
    let configuration = prefix.join("lib/cmake/opencascade/OpenCASCADEConfig.cmake");
    println!("cargo:rerun-if-changed={}", configuration.display());
    let contents = fs::read_to_string(&configuration)
        .unwrap_or_else(|error| panic!("cannot read {}: {error}", configuration.display()));
    let marker = "set (OpenCASCADE_LIBRARIES ";
    let start = contents.find(marker).unwrap_or_else(|| {
        panic!(
            "{} has no OpenCASCADE library list",
            configuration.display()
        )
    }) + marker.len();
    let end = contents[start..]
        .find(')')
        .map(|offset| start + offset)
        .unwrap_or_else(|| {
            panic!(
                "{} has an unterminated library list",
                configuration.display()
            )
        });
    let toolkits: Vec<_> = contents[start..end]
        .split(|character: char| character == ';' || character.is_whitespace())
        .filter(|name| !name.is_empty())
        .map(str::to_owned)
        .collect();
    if toolkits.is_empty() || !toolkits.iter().any(|name| name == "TKDESTEP") {
        panic!(
            "{} does not contain the TKDESTEP closure",
            configuration.display()
        );
    }
    toolkits
}
