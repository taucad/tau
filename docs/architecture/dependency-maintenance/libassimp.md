# libassimp maintenance

This reference records the current Tau-side route for the optional `repos/libassimp` checkout. Its `AGENTS.md`, `MAINTAINER.md`, manifests, and tests own executable details when present. Use the `repos` skill to inspect it; ordinary Tau workflows must not require it.

## Current package surface

`libassimp` is an ESM TypeScript/WASM package with one public entry over `create-assimp`. Its C++/Embind boundary exposes conversion and returns copied bytes; native handles do not escape to consumers. The public API supports one import followed by ordered, sequential exports, including sidecar resolution through JSPI where available and deterministic replay otherwise.

`assimp-builds.json` owns production and native-test format admission. `scripts/assimp-builds-to-presets.mjs` derives CMake presets, the documentation matrix reads the same manifest, and tests compare the generated TypeScript format surface with the compiled artifact. Add or remove a format in that manifest and review the generated matrix, capability surface, native subset, and output-byte determinism together.

## Validation and release

- Run the checkout's `libassimp:quality`, `test`, `build`, and `validate-pack` Nx targets.
- Verify browser and Node package entries, supported formats, sidecar containment, ordered multi-target failure attribution, and a geometry round trip. A byte-count-only assertion does not establish a valid export.
- Keep the Emscripten image digest and workflow container literals synchronized. Re-anchor byte and timing budgets only in the change that alters the measured artifact.
- Keep `unbundle: true`; WASM URL resolution depends on the relative output layout.
- GitHub Actions owns npm publication, provenance, registry verification, tags, and releases. Do not publish a workstation build.

## Engine patches

The checkout's `assimp/` submodule carries engine changes. Its canonical GLB scene contract is Y-up in metres; 3MF exports are Z-up in millimetres. Importers communicate source axes and units through scene metadata such as `AI_METADATA_UP_AXIS`, and exporters apply the required transform at the target-format boundary. Tau's Assimp adapter performs no geometry or coordinate post-processing.

Treat spec-compliant GLB input as a conversion precondition and fail invalid input. Prove unit and axis changes by round-tripping geometry across supported format pairs, including the browser path. Unit-axis conversion and 3MF/lib3mf filesystem behavior belong to `UnitAxisContract` and `Lib3MFBridge` plus their targeted regression tests, not to OpenCascade or Replicad documentation.

## Evidence pointers

- `repos/libassimp/AGENTS.md`: architecture, commands, build manifest, and package invariants.
- `repos/libassimp/MAINTAINER.md`: current release and toolchain ownership.
- `repos/libassimp/assimp-builds.json` and `tests/assimp-builds-presets.test.mjs`: admitted build surface.
- `repos/libassimp/tests/format-matrix.test.mjs`, `tests/browser/convert.browser.test.mjs`, and `src/convert.test.ts`: format, browser, round-trip, and option contracts.
- `repos/libassimp/assimp/`: current engine sources, including unit-axis and Lib3MF bridge fixes.

Historical converter-package wrappers, TinyUSDZ branch notes, and old per-format runtime exports are incident context, not current libassimp rules.
