use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, BTreeSet},
    env,
    ffi::OsString,
    fs,
    path::{Path, PathBuf},
    process::Command,
};

const BINDING_FEATURES: [&str; 3] = ["binding-node", "binding-python", "standalone"];
const PROFILE_ENVIRONMENTS: [&str; 10] = [
    "CARGO_PROFILE_RELEASE_OPT_LEVEL",
    "CARGO_PROFILE_RELEASE_DEBUG",
    "CARGO_PROFILE_RELEASE_SPLIT_DEBUGINFO",
    "CARGO_PROFILE_RELEASE_STRIP",
    "CARGO_PROFILE_RELEASE_DEBUG_ASSERTIONS",
    "CARGO_PROFILE_RELEASE_OVERFLOW_CHECKS",
    "CARGO_PROFILE_RELEASE_LTO",
    "CARGO_PROFILE_RELEASE_PANIC",
    "CARGO_PROFILE_RELEASE_INCREMENTAL",
    "CARGO_PROFILE_RELEASE_CODEGEN_UNITS",
];

#[derive(Deserialize)]
struct Metadata {
    packages: Vec<MetadataPackage>,
    resolve: MetadataResolve,
    workspace_root: String,
}

#[derive(Deserialize)]
struct MetadataPackage {
    id: String,
    name: String,
    version: String,
    source: Option<String>,
    manifest_path: String,
}

#[derive(Deserialize)]
struct MetadataResolve {
    nodes: Vec<MetadataNode>,
}

#[derive(Deserialize)]
struct MetadataNode {
    id: String,
    deps: Vec<MetadataDependency>,
    features: Vec<String>,
}

#[derive(Deserialize)]
struct MetadataDependency {
    name: String,
    pkg: String,
    dep_kinds: Vec<MetadataDependencyKind>,
}

#[derive(Deserialize)]
struct MetadataDependencyKind {
    kind: Option<String>,
    target: Option<String>,
}

struct ResolvedGraphs {
    core: Vec<u8>,
    csg: Vec<u8>,
    brep: Vec<u8>,
    workspace_manifest: PathBuf,
    verification_reasons: Vec<String>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum Binding {
    Node,
    Python,
    Standalone,
}

impl Binding {
    fn feature(self) -> &'static str {
        match self {
            Self::Node => "binding-node",
            Self::Python => "binding-python",
            Self::Standalone => "standalone",
        }
    }

    fn accepts_route(self, route: &str) -> bool {
        match self {
            Self::Node => route == "nx-build-node-release-v1",
            Self::Python => matches!(
                route,
                "nx-build-python-release-v1" | "nx-build-python314-release-v1"
            ),
            Self::Standalone => false,
        }
    }
}

struct ProducerRoute {
    binding: Binding,
    cargo_cwd: PathBuf,
    selected_manifest: PathBuf,
    verification_reasons: Vec<String>,
}

fn main() {
    let mut watched = [
        "GEOSPEC_OCCT_PREFIX",
        "GEOSPEC_PRODUCER_ROUTE",
        "GEOSPEC_PRODUCER_CARGO_CWD",
        "GEOSPEC_PRODUCER_MANIFEST",
        "CARGO_HOME",
        "HOME",
        "TARGET",
        "HOST",
        "PROFILE",
        "OPT_LEVEL",
        "DEBUG",
        "CARGO_ENCODED_RUSTFLAGS",
        "GEOSPEC_WASM_SIMD_PROFILE",
        "CXXSTDLIB",
        "CRATE_CC_NO_DEFAULTS",
        "CC_SHELL_ESCAPED_FLAGS",
        "MACOSX_DEPLOYMENT_TARGET",
        "SDKROOT",
    ]
    .into_iter()
    .chain(PROFILE_ENVIRONMENTS)
    .map(str::to_owned)
    .collect::<Vec<_>>();
    watched.extend(cc_target_envs("CXX"));
    watched.extend(cc_target_envs("CXXFLAGS"));
    watched.extend(
        env::vars()
            .map(|(name, _)| name)
            .filter(|name| name.starts_with("CARGO_PROFILE_")),
    );
    watched.sort();
    watched.dedup();
    for name in watched {
        println!("cargo:rerun-if-env-changed={name}");
    }

    let manifest = PathBuf::from(env::var_os("CARGO_MANIFEST_DIR").expect("manifest directory"));
    let package = manifest
        .parent()
        .and_then(Path::parent)
        .expect("native package");
    let repository = package
        .parent()
        .and_then(Path::parent)
        .expect("repository root");
    let route = producer_route(&manifest, package, repository);
    let graphs = resolved_graphs(&manifest, &route, package);
    let (profile_context, verified) = supported_profile_context(
        &route,
        &graphs.workspace_manifest,
        &graphs.verification_reasons,
    );
    let common_context = build_context(&profile_context);
    let core_context = component_context(&common_context, b"core-resolved-graph\0", &graphs.core);
    let csg_context = component_context(&common_context, b"csg-resolved-graph\0", &graphs.csg);

    let core = digest(
        package,
        &core_context,
        &[
            "rust/Cargo.toml",
            "rust/src",
            "native/runtime/Cargo.toml",
            "native/runtime/build.rs",
            "native/runtime/src",
        ],
        &[],
    );
    let csg = digest(
        package,
        &csg_context,
        &[
            "native/manifold-rust/source-manifest.json",
            "native/manifold-rust/source/Cargo.toml",
            "native/manifold-rust/source/src",
            "native/manifold-rust/adapter/Cargo.toml",
            "native/manifold-rust/adapter/src",
        ],
        &[],
    );

    let prefix = env::var_os("GEOSPEC_OCCT_PREFIX")
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            repository.join("node_modules/.cache/geospec-engine-native/occt/install")
        });
    let external = installed_occt_inputs(&prefix);
    let brep_build = brep_build_context(&common_context);
    let brep_context = component_context(&brep_build, b"brep-resolved-graph\0", &graphs.brep);
    let brep = digest(
        package,
        &brep_context,
        &[
            "native/occt/source-manifest.json",
            "native/occt/build-occt.sh",
            "native/occt/bridge",
            "native/occt/rust/Cargo.toml",
            "native/occt/rust/build.rs",
            "native/occt/rust/src",
        ],
        &external,
    );

    let output_directory = PathBuf::from(env::var_os("OUT_DIR").expect("output directory"));
    for (name, bytes) in [
        ("producer_profile_context.bin", profile_context.as_slice()),
        ("producer_context.bin", common_context.as_slice()),
        ("producer_core_graph.bin", graphs.core.as_slice()),
        ("producer_csg_graph.bin", graphs.csg.as_slice()),
        ("producer_brep_graph.bin", graphs.brep.as_slice()),
        ("producer_core_context.bin", core_context.as_slice()),
        ("producer_csg_context.bin", csg_context.as_slice()),
        ("producer_brep_context.bin", brep_context.as_slice()),
    ] {
        fs::write(output_directory.join(name), bytes)
            .unwrap_or_else(|error| panic!("write {name}: {error}"));
    }
    fs::write(
        output_directory.join("producer_identity.rs"),
        format!(
            "pub const VERIFIED: bool = {verified};\npub const CORE: &str = \"sha256:{core}\";\npub const CSG: &str = \"sha256:{csg}\";\npub const BREP: &str = \"sha256:{brep}\";\n"
        ),
    )
    .expect("write producer identity");
}

fn selected_binding() -> Binding {
    let selected = BINDING_FEATURES
        .into_iter()
        .filter(|feature| {
            env::var_os(format!(
                "CARGO_FEATURE_{}",
                feature.replace('-', "_").to_ascii_uppercase()
            ))
            .is_some()
        })
        .collect::<Vec<_>>();
    assert!(
        selected.len() == 1,
        "exactly one producer binding feature is required, found {selected:?}"
    );
    match selected[0] {
        "binding-node" => Binding::Node,
        "binding-python" => Binding::Python,
        "standalone" => Binding::Standalone,
        _ => unreachable!(),
    }
}

fn producer_route(runtime_manifest: &Path, package: &Path, repository: &Path) -> ProducerRoute {
    let binding = selected_binding();
    let fallback_manifest = match binding {
        Binding::Node => package.join("bindings/node/Cargo.toml"),
        Binding::Python => package.join("bindings/python/Cargo.toml"),
        Binding::Standalone => runtime_manifest.join("Cargo.toml"),
    };
    let expected_cwd = match binding {
        Binding::Node => package,
        Binding::Python | Binding::Standalone => repository,
    }
    .canonicalize()
    .expect("canonical owned Cargo cwd");
    let mut verification_reasons = Vec::new();

    match env::var("GEOSPEC_PRODUCER_ROUTE") {
        Ok(route) if binding.accepts_route(&route) => {}
        Ok(route) => verification_reasons.push(format!("unsupported-route={route}")),
        Err(_) => verification_reasons.push("missing-route".into()),
    }

    let cargo_cwd = match env::var_os("GEOSPEC_PRODUCER_CARGO_CWD") {
        Some(path) => canonicalize_declared(Path::new(&path), repository, "producer Cargo cwd"),
        None => {
            verification_reasons.push("missing-cargo-cwd".into());
            expected_cwd.clone()
        }
    };
    if cargo_cwd != expected_cwd {
        verification_reasons.push("unexpected-cargo-cwd".into());
    }

    let selected_manifest = match env::var_os("GEOSPEC_PRODUCER_MANIFEST") {
        Some(path) => canonicalize_declared(
            &resolve_from(&cargo_cwd, Path::new(&path)),
            repository,
            "producer manifest",
        ),
        None => {
            verification_reasons.push("missing-producer-manifest".into());
            fallback_manifest
                .canonicalize()
                .expect("canonical fallback producer manifest")
        }
    };
    if !selected_manifest.is_file() {
        panic!(
            "producer manifest is not a file: {}",
            selected_manifest.display()
        );
    }

    ProducerRoute {
        binding,
        cargo_cwd,
        selected_manifest,
        verification_reasons,
    }
}

fn canonicalize_declared(path: &Path, base: &Path, label: &str) -> PathBuf {
    resolve_from(base, path)
        .canonicalize()
        .unwrap_or_else(|error| panic!("canonicalize {label} {}: {error}", path.display()))
}

fn resolve_from(base: &Path, path: &Path) -> PathBuf {
    if path.is_absolute() {
        path.to_owned()
    } else {
        base.join(path)
    }
}

fn supported_profile_context(
    route: &ProducerRoute,
    workspace_manifest: &Path,
    graph_reasons: &[String],
) -> (Vec<u8>, bool) {
    let mut reasons = route.verification_reasons.clone();
    reasons.extend_from_slice(graph_reasons);
    for (name, expected) in [
        ("PROFILE", "release"),
        ("OPT_LEVEL", "3"),
        ("DEBUG", "false"),
    ] {
        let actual = env::var(name).unwrap_or_default();
        if actual != expected {
            reasons.push(format!("{name}={actual}"));
        }
    }
    let overrides = env::vars()
        .filter(|(name, _)| name.starts_with("CARGO_PROFILE_"))
        .collect::<Vec<_>>();
    reasons.extend(
        overrides
            .iter()
            .map(|(name, value)| format!("{name}={value}")),
    );

    let cargo = env::var_os("CARGO").unwrap_or_else(|| OsString::from("cargo"));
    let version = Command::new(&cargo)
        .arg("-Vv")
        .output()
        .expect("Cargo version");
    assert!(
        version.status.success(),
        "cargo -Vv failed: {}",
        String::from_utf8_lossy(&version.stderr)
    );
    let mut bytes = b"geospec-supported-cargo-profile-v2\0release-defaults\0".to_vec();
    bytes.extend_from_slice(&version.stdout);
    append_context_file(&mut bytes, "selected-manifest", &route.selected_manifest);
    append_context_file(&mut bytes, "workspace-manifest", workspace_manifest);
    for (label, path) in effective_config_candidates(route) {
        println!("cargo:rerun-if-changed={}", path.display());
        if path.exists() {
            append_context_file(&mut bytes, &label, &path);
        }
    }
    reasons.sort();
    bytes.extend_from_slice(if reasons.is_empty() {
        b"verified\0"
    } else {
        b"unverified\0"
    });
    for reason in &reasons {
        bytes.extend_from_slice(reason.as_bytes());
        bytes.push(0);
    }
    (bytes, reasons.is_empty())
}

fn effective_config_candidates(route: &ProducerRoute) -> Vec<(String, PathBuf)> {
    let mut candidates = BTreeMap::<PathBuf, String>::new();
    if let Some(home) = env::var_os("CARGO_HOME") {
        let home = resolve_from(&route.cargo_cwd, Path::new(&home));
        add_config_pair(&mut candidates, "cargo-home", &home);
    } else if let Some(home) = env::var_os("HOME") {
        add_config_pair(
            &mut candidates,
            "cargo-home",
            &PathBuf::from(home).join(".cargo"),
        );
    }
    add_config_ancestors(&mut candidates, "cargo-cwd", &route.cargo_cwd);
    if route.binding == Binding::Python {
        add_config_ancestors(
            &mut candidates,
            "manifest-parent",
            route
                .selected_manifest
                .parent()
                .expect("producer manifest parent"),
        );
    }
    let mut candidates = candidates
        .into_iter()
        .map(|(path, label)| (label, path))
        .collect::<Vec<_>>();
    candidates.sort_by(|left, right| left.0.cmp(&right.0));
    candidates
}

fn add_config_ancestors(candidates: &mut BTreeMap<PathBuf, String>, role: &str, start: &Path) {
    for (depth, ancestor) in start.ancestors().enumerate() {
        add_config_pair(
            candidates,
            &format!("{role}/{depth:04}"),
            &ancestor.join(".cargo"),
        );
    }
}

fn add_config_pair(candidates: &mut BTreeMap<PathBuf, String>, role: &str, directory: &Path) {
    for name in ["config", "config.toml"] {
        candidates
            .entry(directory.join(name))
            .or_insert_with(|| format!("{role}/{name}"));
    }
}

fn append_context_file(bytes: &mut Vec<u8>, label: &str, path: &Path) {
    println!("cargo:rerun-if-changed={}", path.display());
    let source = fs::read(path)
        .unwrap_or_else(|error| panic!("read producer input {}: {error}", path.display()));
    bytes.extend_from_slice(&(label.len() as u64).to_le_bytes());
    bytes.extend_from_slice(label.as_bytes());
    bytes.extend_from_slice(&(source.len() as u64).to_le_bytes());
    bytes.extend_from_slice(&source);
}

fn resolved_graphs(
    runtime_manifest: &Path,
    route: &ProducerRoute,
    package_root: &Path,
) -> ResolvedGraphs {
    let cargo = env::var_os("CARGO").unwrap_or_else(|| OsString::from("cargo"));
    let target = env::var("TARGET").expect("target triple");
    let output = Command::new(&cargo)
        .args([
            "metadata",
            "--format-version",
            "1",
            "--locked",
            "--offline",
            "--filter-platform",
            &target,
            "--manifest-path",
        ])
        .arg(&route.selected_manifest)
        .current_dir(&route.cargo_cwd)
        .output()
        .unwrap_or_else(|error| {
            panic!(
                "Cargo metadata for {}: {error}",
                route.selected_manifest.display()
            )
        });
    assert!(
        output.status.success(),
        "Cargo metadata for {} failed: {}",
        route.selected_manifest.display(),
        String::from_utf8_lossy(&output.stderr)
    );
    let metadata: Metadata =
        serde_json::from_slice(&output.stdout).expect("decode Cargo metadata output");
    let workspace_root = PathBuf::from(&metadata.workspace_root)
        .canonicalize()
        .expect("canonical consuming workspace root");
    let workspace_manifest = workspace_root.join("Cargo.toml");
    let lock = workspace_root.join("Cargo.lock");
    println!("cargo:rerun-if-changed={}", lock.display());
    let checksums = lock_checksums(&lock);
    let runtime_path = runtime_manifest
        .join("Cargo.toml")
        .canonicalize()
        .expect("canonical runtime manifest");
    let runtime_id = metadata
        .packages
        .iter()
        .find(|item| {
            Path::new(&item.manifest_path)
                .canonicalize()
                .is_ok_and(|path| path == runtime_path)
        })
        .map(|item| item.id.as_str())
        .expect("runtime package in consuming metadata");
    let runtime_node = metadata
        .resolve
        .nodes
        .iter()
        .find(|node| node.id == runtime_id)
        .expect("runtime node in consuming metadata");
    let actual_binding_features = runtime_node
        .features
        .iter()
        .filter(|feature| BINDING_FEATURES.contains(&feature.as_str()))
        .map(String::as_str)
        .collect::<Vec<_>>();
    let expected_binding_features = [route.binding.feature()];
    let verification_reasons = (actual_binding_features != expected_binding_features)
        .then(|| {
            format!(
                "resolved-binding-features={}",
                actual_binding_features.join(",")
            )
        })
        .into_iter()
        .collect();
    let core_id = package_id(&metadata, "geospec-engine-native-core");
    let csg_id = package_id(&metadata, "geospec-engine-native-csg");
    let brep_id = package_id(&metadata, "geospec-engine-native-occt");

    let core = encode_graph(
        &metadata,
        &[runtime_id, core_id],
        &["geospec-engine-native-csg", "geospec-engine-native-occt"],
        package_root,
        &checksums,
    );
    let csg = encode_graph(&metadata, &[csg_id], &[], package_root, &checksums);
    let brep = encode_graph(&metadata, &[brep_id], &[], package_root, &checksums);
    ResolvedGraphs {
        core,
        csg,
        brep,
        workspace_manifest,
        verification_reasons,
    }
}

fn package_id<'a>(metadata: &'a Metadata, name: &str) -> &'a str {
    let matches = metadata
        .packages
        .iter()
        .filter(|item| item.name == name)
        .collect::<Vec<_>>();
    assert_eq!(matches.len(), 1, "expected one {name} package");
    &matches[0].id
}

fn encode_graph(
    metadata: &Metadata,
    roots: &[&str],
    skipped_packages: &[&str],
    package_root: &Path,
    checksums: &BTreeMap<(String, String, String), String>,
) -> Vec<u8> {
    let packages = metadata
        .packages
        .iter()
        .map(|item| (item.id.as_str(), item))
        .collect::<BTreeMap<_, _>>();
    let nodes = metadata
        .resolve
        .nodes
        .iter()
        .map(|item| (item.id.as_str(), item))
        .collect::<BTreeMap<_, _>>();
    let mut pending = roots
        .iter()
        .map(|value| (*value).to_owned())
        .collect::<Vec<_>>();
    let mut selected = BTreeSet::new();
    while let Some(id) = pending.pop() {
        if !selected.insert(id.clone()) {
            continue;
        }
        let node = nodes
            .get(id.as_str())
            .unwrap_or_else(|| panic!("resolved node missing for {id}"));
        for dependency in &node.deps {
            let package = packages
                .get(dependency.pkg.as_str())
                .unwrap_or_else(|| panic!("resolved package missing for {}", dependency.pkg));
            if skipped_packages.contains(&package.name.as_str())
                || !dependency
                    .dep_kinds
                    .iter()
                    .any(|kind| kind.kind.as_deref() != Some("dev"))
            {
                continue;
            }
            pending.push(dependency.pkg.clone());
        }
    }

    let stable_keys = selected
        .iter()
        .map(|id| {
            let package = packages[id.as_str()];
            (
                id.as_str(),
                stable_package_key(package, package_root, checksums),
            )
        })
        .collect::<BTreeMap<_, _>>();
    let mut records = Vec::new();
    for id in &selected {
        let package = packages[id.as_str()];
        let node = nodes[id.as_str()];
        let mut features = node
            .features
            .iter()
            .filter(|feature| {
                package.name != "geospec-engine-native-runtime"
                    || !BINDING_FEATURES.contains(&feature.as_str())
            })
            .cloned()
            .collect::<Vec<_>>();
        features.sort();
        let mut dependencies = node
            .deps
            .iter()
            .filter(|dependency| selected.contains(&dependency.pkg))
            .flat_map(|dependency| {
                dependency
                    .dep_kinds
                    .iter()
                    .filter(|kind| kind.kind.as_deref() != Some("dev"))
                    .map(|kind| {
                        format!(
                            "{}|{}|{}|{}",
                            dependency.name,
                            stable_keys[dependency.pkg.as_str()],
                            kind.kind.as_deref().unwrap_or("normal"),
                            kind.target.as_deref().unwrap_or("")
                        )
                    })
            })
            .collect::<Vec<_>>();
        dependencies.sort();
        records.push(format!(
            "{}\0features\0{}\0dependencies\0{}\0",
            stable_keys[id.as_str()],
            features.join(","),
            dependencies.join(",")
        ));
    }
    records.sort();
    let mut bytes = b"geospec-resolved-common-graph-v1\0".to_vec();
    for record in records {
        bytes.extend_from_slice(record.as_bytes());
    }
    bytes
}

fn stable_package_key(
    package: &MetadataPackage,
    package_root: &Path,
    checksums: &BTreeMap<(String, String, String), String>,
) -> String {
    if let Some(source) = package.source.as_deref() {
        let checksum = checksums
            .get(&(
                package.name.clone(),
                package.version.clone(),
                source.to_owned(),
            ))
            .unwrap_or_else(|| {
                panic!(
                    "selected registry package has no lock checksum: {} {} {source}",
                    package.name, package.version
                )
            });
        return format!(
            "{}@{}|{}|sha256:{}",
            package.name, package.version, source, checksum
        );
    }
    let manifest = Path::new(&package.manifest_path)
        .canonicalize()
        .unwrap_or_else(|error| {
            panic!(
                "canonicalize selected path package {}: {error}",
                package.manifest_path
            )
        });
    let relative = manifest.strip_prefix(package_root).unwrap_or_else(|_| {
        panic!(
            "selected path package is outside the native package root: {}",
            manifest.display()
        )
    });
    format!(
        "{}@{}|path:{}",
        package.name,
        package.version,
        relative.to_string_lossy().replace('\\', "/")
    )
}

fn lock_checksums(path: &Path) -> BTreeMap<(String, String, String), String> {
    let source = fs::read_to_string(path)
        .unwrap_or_else(|error| panic!("read consuming lock {}: {error}", path.display()));
    let mut result = BTreeMap::new();
    let mut current = BTreeMap::<String, String>::new();
    let finish = |current: &mut BTreeMap<String, String>,
                  result: &mut BTreeMap<(String, String, String), String>| {
        if let (Some(name), Some(version), Some(source), Some(checksum)) = (
            current.get("name"),
            current.get("version"),
            current.get("source"),
            current.get("checksum"),
        ) {
            result.insert(
                (name.clone(), version.clone(), source.clone()),
                checksum.clone(),
            );
        }
        current.clear();
    };
    for line in source.lines() {
        let line = line.trim();
        if line == "[[package]]" {
            finish(&mut current, &mut result);
            continue;
        }
        for key in ["name", "version", "source", "checksum"] {
            if let Some(value) = line.strip_prefix(&format!("{key} = \"")) {
                if let Some(value) = value.strip_suffix('"') {
                    current.insert(key.to_owned(), value.to_owned());
                }
            }
        }
    }
    finish(&mut current, &mut result);
    result
}

fn component_context(common: &[u8], label: &[u8], graph: &[u8]) -> Vec<u8> {
    let mut bytes = common.to_vec();
    bytes.extend_from_slice(label);
    bytes.extend_from_slice(graph);
    bytes
}

fn digest(root: &Path, context: &[u8], inputs: &[&str], external: &[(String, PathBuf)]) -> String {
    let mut files = Vec::new();
    for input in inputs {
        let path = root.join(input);
        let metadata = fs::metadata(&path)
            .unwrap_or_else(|error| panic!("inspect producer input {}: {error}", path.display()));
        if metadata.is_dir() {
            files.extend(collect(&path));
        } else if metadata.is_file() {
            files.push(path);
        } else {
            panic!(
                "producer input {} is not a file or directory",
                path.display()
            );
        }
    }
    files.sort();
    let mut hash = Sha256::new();
    hash.update(b"geospec-producer-build-v2\0");
    hash.update(context);
    for path in files {
        println!("cargo:rerun-if-changed={}", path.display());
        let label = path
            .strip_prefix(root)
            .map(|value| value.to_string_lossy().replace('\\', "/"))
            .expect("internal producer input must stay under its package root");
        hash_file(&mut hash, &label, &path);
    }
    for (label, path) in external {
        println!("cargo:rerun-if-changed={}", path.display());
        hash_file(&mut hash, label, path);
    }
    format!("{:x}", hash.finalize())
}

fn hash_file(hash: &mut Sha256, label: &str, path: &Path) {
    let bytes = fs::read(path)
        .unwrap_or_else(|error| panic!("read producer input {}: {error}", path.display()));
    hash.update((label.len() as u64).to_le_bytes());
    hash.update(label.as_bytes());
    hash.update((bytes.len() as u64).to_le_bytes());
    hash.update(bytes);
}

fn collect(root: &Path) -> Vec<PathBuf> {
    let mut result = Vec::new();
    let entries = fs::read_dir(root)
        .unwrap_or_else(|error| panic!("read producer directory {}: {error}", root.display()));
    for entry in entries {
        let path = entry
            .unwrap_or_else(|error| {
                panic!(
                    "read producer directory entry in {}: {error}",
                    root.display()
                )
            })
            .path();
        if path.is_dir() {
            result.extend(collect(&path));
        } else {
            result.push(path);
        }
    }
    result
}

fn installed_occt_inputs(prefix: &Path) -> Vec<(String, PathBuf)> {
    let library = prefix.join("lib");
    let configuration = library.join("cmake/opencascade/OpenCASCADEConfig.cmake");
    println!("cargo:rerun-if-changed={}", configuration.display());
    let contents = fs::read_to_string(&configuration)
        .unwrap_or_else(|error| panic!("read producer input {}: {error}", configuration.display()));
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
                "{} has an unterminated OpenCASCADE library list",
                configuration.display()
            )
        });
    let toolkits = contents[start..end]
        .split(|character: char| character == ';' || character.is_whitespace())
        .filter(|name| !name.is_empty())
        .collect::<Vec<_>>();
    assert!(
        !toolkits.is_empty() && toolkits.contains(&"TKDESTEP"),
        "{} does not contain the TKDESTEP closure",
        configuration.display()
    );
    let mut inputs = toolkits
        .into_iter()
        .enumerate()
        .map(|(index, toolkit)| {
            (
                format!("linked-occt-archive/{index:04}-lib{toolkit}.a"),
                library.join(format!("lib{toolkit}.a")),
            )
        })
        .collect::<Vec<_>>();
    let include = prefix.join("include/opencascade");
    println!("cargo:rerun-if-changed={}", include.display());
    let mut headers = collect(&include);
    headers.sort();
    inputs.extend(headers.into_iter().map(|path| {
        let relative = path
            .strip_prefix(&include)
            .expect("installed OCCT header under include root")
            .to_string_lossy()
            .replace('\\', "/");
        (format!("installed-occt-header/{relative}"), path)
    }));
    inputs
}

fn build_context(profile_context: &[u8]) -> Vec<u8> {
    if let Some(profile) = env::var_os("GEOSPEC_WASM_SIMD_PROFILE") {
        assert_eq!(
            profile,
            OsString::from("simd128-v1"),
            "unsupported WASM SIMD profile"
        );
        assert_eq!(
            env::var("TARGET").as_deref(),
            Ok("wasm32-unknown-emscripten")
        );
        assert!(
            semantic_rustflags()
                .windows(2)
                .any(|flags| flags == ["-C", "target-feature=+simd128"]),
            "selected WASM producer must compile Rust with +simd128"
        );
        let selected_cxx_flags = cc_target_envs("CXXFLAGS")
            .into_iter()
            .find_map(|name| env::var(name).ok())
            .unwrap_or_default();
        assert!(
            selected_cxx_flags
                .split_whitespace()
                .any(|flag| flag == "-msimd128"),
            "selected WASM producer must compile the OCCT bridge with -msimd128"
        );
    }
    let mut entries = env::vars()
        .filter_map(|(name, value)| {
            if name == "CARGO_CFG_FEATURE" {
                let value = value
                    .split(',')
                    .filter(|feature| !BINDING_FEATURES.contains(feature))
                    .collect::<Vec<_>>()
                    .join(",");
                return (!value.is_empty()).then_some((name, value));
            }
            (name == "TARGET"
                || name == "PROFILE"
                || name == "OPT_LEVEL"
                || name == "DEBUG"
                || name.starts_with("CARGO_CFG_")
                || (name.starts_with("CARGO_FEATURE_")
                    && !BINDING_FEATURES.iter().any(|feature| {
                        name == format!(
                            "CARGO_FEATURE_{}",
                            feature.replace('-', "_").to_ascii_uppercase()
                        )
                    })))
            .then_some((name, value))
        })
        .collect::<Vec<_>>();
    entries.sort();
    let rustc = env::var("RUSTC").expect("rustc path");
    let rustc_version = Command::new(&rustc)
        .arg("-vV")
        .output()
        .expect("rustc version");
    assert!(
        rustc_version.status.success(),
        "{rustc} -vV failed: {}",
        String::from_utf8_lossy(&rustc_version.stderr)
    );
    let mut bytes = profile_context.to_vec();
    bytes.extend_from_slice(b"rustc\0");
    bytes.extend_from_slice(&rustc_version.stdout);
    bytes.extend_from_slice(b"semantic-rustflags\0");
    for flag in semantic_rustflags() {
        bytes.extend_from_slice(flag.as_bytes());
        bytes.push(0);
    }
    if let Some(profile) = env::var_os("GEOSPEC_WASM_SIMD_PROFILE") {
        bytes.extend_from_slice(b"wasm-simd-profile\0");
        bytes.extend_from_slice(profile.as_encoded_bytes());
        bytes.push(0);
    }
    for (name, value) in entries {
        bytes.extend_from_slice(name.as_bytes());
        bytes.push(0);
        bytes.extend_from_slice(value.as_bytes());
        bytes.push(0);
    }
    bytes
}

fn semantic_rustflags() -> Vec<String> {
    const PYTHON_DARWIN_SYMBOL_LOOKUP: [&str; 4] =
        ["-C", "link-arg=-undefined", "-C", "link-arg=dynamic_lookup"];
    let Some(encoded) = env::var_os("CARGO_ENCODED_RUSTFLAGS") else {
        return Vec::new();
    };
    let flags = encoded
        .to_string_lossy()
        .split('\u{1f}')
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
        .collect::<Vec<_>>();
    let mut semantic = Vec::new();
    let mut index = 0;
    while index < flags.len() {
        let is_python_darwin_symbol_lookup = flags[index..]
            .get(..PYTHON_DARWIN_SYMBOL_LOOKUP.len())
            .is_some_and(|candidate| {
                candidate
                    .iter()
                    .map(String::as_str)
                    .eq(PYTHON_DARWIN_SYMBOL_LOOKUP)
            });
        if is_python_darwin_symbol_lookup {
            index += PYTHON_DARWIN_SYMBOL_LOOKUP.len();
            continue;
        }
        semantic.push(flags[index].clone());
        index += 1;
    }
    semantic
}

fn brep_build_context(rust_context: &[u8]) -> Vec<u8> {
    let cxx_variables = cc_target_envs("CXX");
    let selected = cxx_variables
        .iter()
        .find_map(|name| env::var_os(name).map(|value| (name, value)));
    let (compiler, arguments) = cxx_command(selected.as_ref().map(|(_, value)| value));
    let version = Command::new(&compiler)
        .arg("--version")
        .output()
        .unwrap_or_else(|error| panic!("C++ compiler identity {}: {error}", compiler.display()));
    assert!(
        version.status.success(),
        "{} --version failed: {}",
        compiler.display(),
        String::from_utf8_lossy(&version.stderr)
    );
    let mut bytes = rust_context.to_vec();
    bytes.extend_from_slice(b"cxx\0");
    bytes.extend_from_slice(
        compiler
            .file_name()
            .expect("C++ compiler file name")
            .as_encoded_bytes(),
    );
    bytes.push(0);
    for argument in arguments {
        bytes.extend_from_slice(argument.as_bytes());
        bytes.push(0);
    }
    bytes.extend_from_slice(&version.stdout);
    if let Some((name, _)) = selected {
        bytes.extend_from_slice(name.as_bytes());
        bytes.push(0);
    }
    for name in cc_target_envs("CXXFLAGS").into_iter().rev().chain(
        [
            "CXXSTDLIB",
            "CRATE_CC_NO_DEFAULTS",
            "CC_SHELL_ESCAPED_FLAGS",
            "MACOSX_DEPLOYMENT_TARGET",
            "SDKROOT",
        ]
        .into_iter()
        .map(str::to_owned),
    ) {
        if let Some(value) = env::var_os(&name) {
            bytes.extend_from_slice(name.as_bytes());
            bytes.push(0);
            bytes.extend_from_slice(value.as_encoded_bytes());
            bytes.push(0);
        }
    }
    bytes
}

fn cc_target_envs(name: &str) -> Vec<String> {
    let target = env::var("TARGET").expect("target triple");
    let host = env::var("HOST").expect("host triple");
    let kind = if target == host { "HOST" } else { "TARGET" };
    vec![
        format!("{name}_{target}"),
        format!("{name}_{}", target.replace(['-', '.'], "_")),
        format!("{kind}_{name}"),
        name.into(),
    ]
}

fn cxx_command(configured: Option<&OsString>) -> (PathBuf, Vec<String>) {
    let Some(configured) = configured else {
        return (PathBuf::from("c++"), Vec::new());
    };
    let path = PathBuf::from(configured);
    if path.is_file() {
        return (path, Vec::new());
    }
    let configured = configured.to_string_lossy();
    let mut parts = configured.split_whitespace();
    let first = parts.next().unwrap_or("c++");
    let wrappers = [
        "ccache",
        "distcc",
        "sccache",
        "icecc",
        "cachepot",
        "buildcache",
        "kache",
    ];
    let (compiler, arguments) = if Path::new(first)
        .file_stem()
        .and_then(|value| value.to_str())
        .is_some_and(|value| wrappers.contains(&value))
    {
        (parts.next().unwrap_or("c++"), parts)
    } else {
        (first, parts)
    };
    (
        PathBuf::from(compiler),
        arguments.map(str::to_owned).collect(),
    )
}
