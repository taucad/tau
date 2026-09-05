# OpenCascade.js maintenance

This reference makes the current Tau maintenance contract discoverable without requiring the optional `repos/opencascade.js` checkout. When the checkout is present, its `MAINTAINER.md`, `BUILD_SYSTEM.md`, configuration, and tests are the executable source of truth. Use the `repos` skill to obtain or inspect it. Tau install, build, test, and runtime flows must not depend on the checkout.

## Current package and build surface

The maintained packages are `libcascade` and `@libcascade/toolchain`. `build-configs/configurations.json` owns named compile configurations; YAML owns the symbol set and link flags. The published package contains single-threaded and multi-threaded outputs with matching provenance sidecars. Cross-browser builds keep relaxed SIMD disabled because the supported Safari line cannot parse it.

The supported configuration names are `single-threaded`, `single-threaded-smallest`, `multi-threaded`, `multi-threaded-browser`, and `debug`. The browser-only threaded variant uses a web/worker environment and growable array buffers; the default threaded build keeps Node support and fixed shared memory. Preserve single-threading and multi-threading symbols when pruning bindings.

Every named production configuration uses the wasm32 exception ABI. Keep `OCJS_EXCEPTIONS` consistent for the PCH, every object, and the linker; `build/build-flags.json` and the generated build manifests detect mixed stages. A custom non-exceptions build is still possible by explicit override, so do not describe exceptions as the only build mode.

Start a binding change with a reduced YAML fixture such as `tests/docker/fixtures/simple.yml`, then run the full consumer-shaped build before publication. A subset proof cannot establish full link reachability. For a Replicad consumer build, use its current `libcascade.config.ts` and package scripts; those scripts assemble the generated package in `dist/`.

## Binding generation

Prefer generic generator fixes based on C++ declarations, templates, typedefs, inheritance, and signatures. `BUILTIN_ADDITIONAL_BIND_CODE` and custom binding files are escape seams for C++ that cannot be represented by the generator; they are not a substitute for fixing discovery or type inference. Keep symbol manifests and generated declarations deterministic, and validate the manifest registry and reachability tests after changing scope.

Treat `const Handle<T>&` as input and non-const `Handle<T>&` as output. Return output handles in a generated value-object envelope instead of mutating JavaScript holder objects. Emit `Symbol.dispose` only when an envelope owns a disposable child; pure-data envelopes stay ordinary values. Trailing C++ defaults use generated `optional_override` dispatch so shorter legal call shapes work at runtime. Keep generated declarations flat and fix type failures in the Python code generator.

Replace a manual binding with generic discovery only when the generic path preserves the public surface. Remove the wrapper and declaration entry together, regenerate all artifacts, and add a test of the generated path. Keep NCollection handling generic through AST discovery and generated `using` declarations rather than adding per-class maps. Preserve the current OCCT V8 BRepGraph, NCollection `size_t` API, `Geom2dProp`/`GeomProp`, and `GeomFill_Gordon`/`GeomFill_GordonBuilder` reachability in the full symbol surface.

Use the shared `manifest_registry` for link-time and post-link symbol resolution. Producers serialize attempted `referenced_classes` before export filtering; consumers union that structural field instead of scraping generated declarations or reparsing C++. `verifyBindings` fails every unresolved `truly_missing` symbol. Keep `OCJS_CONFIG` in every cache-sensitive Nx target input so one configuration cannot restore another configuration's artifacts.

Generated headers are included by multiple binding translation units. Shared helper definitions must be inline or templates, and shared globals must use one deliberate linkage model. Do not mask link or build failures with `|| true`.

Strict type enforcement is opt-in through the checkout's `OCJS_STRICT_TYPES=1` gate; ordinary generation still reports deterministic diagnostics. Do not describe the opt-in gate as a universal build default.

## Reproducibility and validation

- Resolve abbreviated revisions with `git rev-parse` before pinning them. Keep dependency pins and generated provenance exact.
- Keep shared host and Docker toolchain pins in `DEPS.json` and the uv lock; Docker remains a thin entry into the same pinned build path rather than redeclaring those dependencies.
- Preserve PCH, compiler-cache, and Docker-layer inputs when changing build flags; invalidate them deliberately when an input changes.
- Build the PCH with `-Xclang -fno-pch-timestamp`, and keep generator code among its Nx inputs, so cache restores do not fail on rewritten mtimes. Regression diagnostics name the violated invariant and corrective command without depending on transient cache filenames.
- Preserve the vendored LLVM `include/` tree when trimming the Docker layer; libclang needs both libc++ and Clang resource headers.
- Use the pinned uv environment on host and in Docker. Run the full Nx `ocjs:build` graph so validation and provenance remain attached to the materialized artifacts; use the command documented by the checkout rather than an old Tau-root wrapper.
- Keep `build-flags.json` consistent across compile and link stages. The Nx build graph owns validation and provenance: its validation output records compiled and missing symbols plus JS/WASM sizes, and the provenance sidecar is finalized against the same artifacts.
- For one-class binding diagnosis, create a reduced YAML from the current fixture and run it through the supported generator/build path. The removed `python -m ocjs_bindgen --filter` shortcut is not a current interface.
- Run the checkout's Python tests with pytest and its declared JavaScript, package, browser, Docker, and consumer gates. Long full builds are expected; do not replace them with a minimal-YAML result for release acceptance.
- Use explicit resource management for disposable bindings in examples and tests. Require `using`, ownership transfer, or an approved disposal container for disposable results; keep build, fixture, borrowed, and static-factory exemptions narrow. Raw `.delete()` is limited to a documented manual lifetime transfer that cannot be expressed by `using` or an ownership container. Copy borrowed WASM heap views before an asynchronous boundary.
- Expose synchronous `Symbol.dispose` only; documentation and examples use `using`, never `await using` or `Symbol.asyncDispose`.
- For XCAF STEP export, transfer the document with its explicit model type, then call `STEPCAFControl_Writer.Perform(document, filePath, progress)`. An empty filename on `Transfer` selects multi-file behavior and is not a substitute for `Perform`.
- Let the checkout's release workflow publish immutable candidates and registry artifacts. Local source builds are validation inputs, not substitutes for the release owner.
- Ship the LGPL-2.1-only license with the Open CASCADE exception and keep Docker CI fixtures under the checkout's current `build-configs/` surface.

## Evidence pointers

- `repos/opencascade.js/MAINTAINER.md`: current variants, release ownership, consumer gates, and commands.
- `repos/opencascade.js/BUILD_SYSTEM.md`: cache/PCH inputs and build mechanics.
- `repos/opencascade.js/src/ocjs_bindgen/`: current generic discovery, diagnostics, and manifest pipeline.
- `repos/opencascade.js/tests/unit/` and `tests/sentinel/`: strict-type, manifest, deterministic-report, and link-reachability contracts.
- `repos/opencascade.js/build-configs/configurations.json`: supported named configurations.

Historical `opencascade.js` tarball layouts, V8-only configurations, hand-written Jest runners, mandatory strict typing, `general.yml` fork-hygiene jobs, and old package names are migration evidence only. Verify current files before applying an old incident instruction.

## Binding maintenance clarifications

- When a link-reachability diagnostic points at a missing referenced class, name the producer path that must change: `TypescriptBindings.resolve_type` must record the class in `referenced_classes`, which the link scope consumes. Do not redirect the correction to a downstream consumer that only exposes the missing symbol.
- Default-argument dispatch is strict about absence: `undefined` selects the C++ default or `nullopt`; `null` selects a default only for a parameter whose C++ contract admits null, and otherwise raises `BindingError`. Preserve the generator's absence-semantics tag and row-30 coverage when changing overload emission.
- Keep user-code deprecation diagnostics visible as errors. The linker may filter only a recognized OCCT-internal pragma when both the allowlisted header and pragma-message signature match; unrelated warnings and errors pass through verbatim.
- Treat `docs-site/data/` as one ignored, derived tree. `docs:sync` and the site prebuild regenerate the index, per-package shards, `api-tree.json`, `api-type-index.json`, and `api-search-index.json` atomically from the package-owned `libcascade/api-reference.json` feed; do not restore the former split between committed shards and three ignored aggregate indexes.
