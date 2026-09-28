# Tau example packaging checklist

Paths are relative to the repository root unless a command says otherwise. `<kernel>/<example>` names the directory under `libs/tau-examples/src/kernels/`; `<kernel>.<example>` is its locator.

## Before you start

- [ ] Read `AGENTS.md` and `libs/AGENTS.md`; for a port, read the upstream licence.
- [ ] The kernel is composed in `exampleRuntime` (`libs/tau-examples/scripts/runtime.ts`). If it is not, the row can only be `reference` or `test-fixture` until the kernel owner composes it (`create-kernel` / `create-plugin`); do not work around a missing dependency.
- [ ] Decide the class: public `model`, heavy or staged `reference`, test-only `test-fixture`, spec-first `spec-fixture`.

## New public example (`model`)

- [ ] Directory `libs/tau-examples/src/kernels/<kernel>/<example>/` with a main file (`main.ts`, `main.py`, `main.cs`, `main.scad` or `main.cpp`); no scratch or dot files.
- [ ] No `example.json` (or `{"kind":"model"}`; add `"geometry":"2d"` for SVG output).
- [ ] `tau.json` with a fresh id, name, description, lowercase tags including the kernel id, `assets.main.entryPath` — and no `thumbnail` yet:

  ```json
  {
    "$schema": "https://tau.new/schemas/tau-schema-v1.json",
    "id": "proj_<21 characters from generatePrefixedId('proj')>",
    "name": "Rover Wheel",
    "description": "One or two sentences saying what the model shows and what it exercises.",
    "tags": ["mechanism", "picovoxel"],
    "assets": { "main": { "entryPath": "main.ts" } }
  }
  ```

- [ ] `README.md` or `DESIGN.md` in the shape SKILL.md describes.
- [ ] GeoSpec suite green, if present:

  ```bash
  node --import tsx packages/geospec-engine/src/cli/main.ts run libs/tau-examples/src/kernels/<kernel>/<example> --test-timeout 300000 --workers 1 --json
  ```

- [ ] `pnpm nx generate-manifest tau-examples`; the row appears in `src/manifest.json` with the right `kind`, `geometry` and `mainFile`.
- [ ] `pnpm nx generate-thumbnails tau-examples` (full run: writes `thumbnail.webp` and the row's entry in `src/thumbnail.assets.ts`). Look at the image; the fixed camera cannot be tuned per example, so fix framing in the model's own layout.
- [ ] Add `"thumbnail": "thumbnail.webp"` to `assets.main`, then `pnpm nx generate-manifest tau-examples` again; `src/builtin.ts` now carries the row and its `thumbnailUrl`.
- [ ] Health: `TAU_EXAMPLE_PATTERN='<kernel>\.<example>$' pnpm nx run runtime-e2e:example-health` (no `^`; the pattern matches `Tau example model health > <kernel>.<example>`). Over 300 s: make the default cheaper (for example a coarser `voxelSize`) rather than demote, because `reference` unpublishes.
- [ ] Suite gate, when the row has a suite: one `it()` in `apps/runtime-e2e/src/geospec-suites.test.ts`.
- [ ] Community: add the locator to `communityLocators` in `apps/ui/app/constants/project-examples.ts` only if the example was selected as a showcase; its position is its display order.

## Reclassify or unpublish

- [ ] Write or delete `example.json`; update the class counts in `libs/tau-examples/scripts/generation.test.ts`.
- [ ] Remove the locator from `communityLocators` (and any curated constant naming it, such as the featured pick) before it stops being a builtin; `project-examples.test.ts` fails on an unresolved locator.
- [ ] `pnpm nx generate-manifest tau-examples`.

## Port from an upstream corpus

- [ ] Source licence is Apache-2.0, MIT or CC0; the origin is verified. Otherwise stop and ask the operator.
- [ ] Ported files stay byte-identical; adaptation lives in `main.ts`.
- [ ] Kernel-level ledger (`<kernel>/provenance.json`, the PicoVoxel shape): pinned `repository` and `commit`, one `upstreams` row per source family with its licence, one `inventory` row per copied file with its sha256 and destinations, and an `adaptations` entry for any changed destination. Extend the ledger's test when adding a family.
- [ ] `.oxfmtrc.json` ignores the ported files and re-includes `main.ts` and `*.geospec.ts`.
- [ ] Vendored part files list licence and attribution per part in `parts.manifest.json`.

## Suite gate snippet

```ts
it('<example> geospec suite passes', { timeout: 180_000 }, async () => {
  const report = await runGeoSpecSuite('libs/tau-examples/src/kernels/<kernel>/<example>');
  expect(report.failed).toBe(0);
  expect(report.success).toBe(true);
});
```

Spec-first rows (`spec-fixture`) assert file and test counts and a wall budget instead, as the `v8-engine-rev2` row does.

## Final verification

```bash
pnpm nx check-manifest tau-examples
pnpm nx check-thumbnails tau-examples
pnpm nx test tau-examples --watch=false
pnpm nx typecheck tau-examples
pnpm nx lint tau-examples --files='src/kernels/<kernel>/<example>/**/*.ts'
pnpm nx test ui --watch=false -- project-examples.test.ts
pnpm nx run runtime-e2e:example-health
pnpm nx run tau-examples:verify-picovoxel   # PicoVoxel rows only
```

`--files` is relative to the project root. Run the unfiltered health target once per batch; it is also part of `runtime-e2e`'s `test` target in CI.
