# Replicad maintenance

This reference records Tau's current Replicad integration boundary. The optional `repos/replicad` checkout remains the executable source for that fork; use the `repos` skill to inspect it. Tau runtime and install workflows do not depend on the checkout.

## Current owners

The checkout is a pnpm/Lerna workspace. `packages/replicad` owns the modeling API, `packages/replicad-evaluator` owns portable evaluation, `packages/replicad-cli` owns command-line export, and `packages/replicad-opencascadejs` owns the Replicad-specific OCCT package surface.

The OCCT consumer package builds its single and multi variants through `@libcascade/toolchain` from `libcascade.config.ts`; the package manifest pins the toolchain version. Custom C++ wrappers live under that package's `build-config/wrappers/` and must be declared with their provided symbols in the config. Validate both variants and the assembled package surface when changing bindings or toolchain inputs.

The current package exports `single` and `multi` initializers plus their JavaScript, CommonJS, WASM, and declaration artifacts. It does not use the historical `single-exceptions` name or ship the old OCJS symbols/provenance layout as its package contract. Regenerate Tau's editor declarations with `pnpm nx run api-extractor:extract-replicad` after a public Replicad type change.

## Integration rules

- Keep source work in the package that owns the public behavior. Do not recreate the deleted Tau runtime converter or factory-wrapper architecture around Replicad.
- Preserve browser and Node evaluation entrypoints. Package tests and examples consume workspace dependencies through the declared package surface.
- Treat STL, STEP, SVG, JSON, and projection behavior as Replicad/CLI export contracts; verify output by parsing or round-tripping geometry where the format supports it.
- When validating a new OpenCascade.js generator or toolchain change, first prove the reduced binding surface, then build the full Replicad OCCT consumer. Compare generated declarations and link reachability against the established package rather than overwriting the baseline.
- Do not remove or stub a Replicad API to work around a missing OCCT symbol. Fix the binding owner, rebuild the current single and multi consumer surfaces, and verify call sites against the generated declarations.
- Describe upstream changes in their own terms. Do not embed Tau research row identifiers or private plan shorthand in source, documentation, or commit messages.

## Evidence pointers

- `repos/replicad/packages/replicad-opencascadejs/package.json`: current toolchain pin, build variants, and package exports.
- `repos/replicad/packages/replicad-opencascadejs/README.md`: config, wrapper, Docker, and local-image workflow.
- `repos/replicad/packages/replicad-evaluator/package.json` and `packages/replicad-cli/package.json`: evaluation and export owners.
- `repos/replicad/packages/replicad/src/` and its tests: modeling and serialization behavior.

Old `src-vendored` publication steps, runtime-owned Replicad wrappers, and local tarball replacement flows are historical unless the current checkout names them.
