# @taucad/openscad-language

OpenSCAD language server compiled to WebAssembly for the source editor.

The server is Rust (`rust/`) on the [tree-sitter-openscad](https://github.com/openscad/tree-sitter-openscad) grammar. It runs in a module worker with no imports and no I/O: the worker sends project files over JSON-RPC (`tau/workspaceFiles`) and the editor's open documents with the usual `textDocument/did*` notifications.

It serves completion (built-ins, locals, `use`/`include` imports, import paths, argument names, and project declarations that add their own `use <…>` when accepted), hover with doc comments and `{@link}` links, signature help, go to definition (built-ins open generated declaration source through `tau/declarationSource`), references, document highlights, rename, pull diagnostics, import quick fixes, document and workspace symbols, folding and semantic tokens.

## Targets

- `pnpm nx run openscad-language:prepare` builds the module with the pinned Rust toolchain (`rust/rust-toolchain.toml`) and stages it content-addressed under `out/openscad-language/stage`.
- `pnpm nx run openscad-language:test-rust` runs the Rust tests for every LSP method.
- `pnpm nx run openscad-language:test` runs both, then the TypeScript tests, including the WASM integration test and the latency budgets.
- `pnpm nx run openscad-language:benchmark` reports per-method latency on a generated 200-file project.

`prepare` needs `rustup` and a clang with the `wasm32` target. Set `TAU_WASM_CC` to choose the C compiler; without it, the script uses `clang` when it supports `wasm32`, and otherwise downloads a pinned wasi-sdk clang.
