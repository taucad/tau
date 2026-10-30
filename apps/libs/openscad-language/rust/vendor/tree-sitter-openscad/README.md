# tree-sitter-openscad (vendored)

The generated parser of [openscad/tree-sitter-openscad](https://github.com/openscad/tree-sitter-openscad), copied unchanged from the `tree-sitter-openscad-ng` 0.7.1 crate (`src/parser.c` and `src/tree_sitter/*.h`, MIT, see `LICENSE`).

It is vendored rather than used as a crate dependency because that crate's build script compiles `tree-sitter-language`'s tree-sitter 0.26 WebAssembly shims, which refuse to build for `wasm32-unknown-unknown` against tree-sitter 0.27. `../build.rs` compiles the parser with the `tree-sitter-language` headers and lets the `tree-sitter` crate supply the C library, as tree-sitter 0.27 expects.

To update, copy the same files from a newer crate release and run `pnpm nx run openscad-language:test`.
