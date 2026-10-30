//! Compiles the vendored tree-sitter-openscad parser. On `wasm32-unknown-unknown` the parser uses the libc headers
//! that `tree-sitter-language` ships, and the `tree-sitter` crate links the matching implementations.

fn main() {
    let source = std::path::Path::new("vendor/tree-sitter-openscad/src");
    let mut build = cc::Build::new();
    build.std("c11").include(source).file(source.join("parser.c")).warnings(false);
    if std::env::var("TARGET").is_ok_and(|target| target == "wasm32-unknown-unknown") {
        let headers = std::env::var("DEP_TREE_SITTER_LANGUAGE_WASM_HEADERS")
            .expect("tree-sitter-language provides the wasm32 libc headers");
        build.include(headers);
    }
    build.compile("tree-sitter-openscad");
    println!("cargo:rerun-if-changed=vendor/tree-sitter-openscad/src");
}
