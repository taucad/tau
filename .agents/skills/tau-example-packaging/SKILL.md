---
name: tau-example-packaging
description: >-
  Packages a CAD example under libs/tau-examples/src/kernels/<kernel>/<example>/
  for Tau: classifies it with example.json (model, reference, test-fixture,
  spec-fixture), writes a strict tau.json with a fresh proj_ id, shapes its
  README or DESIGN.md, proves it with the geospec-engine CLI, regenerates the
  manifest and WebP thumbnails, runs the example-health and GeoSpec suite gates,
  records licence provenance for ports and decides whether it becomes a
  Community showcase entry (communityLocators) or stays a plain builtin. Use
  when adding, porting, reclassifying, publishing or unpublishing a Tau example,
  when manifest, thumbnail or example-health checks fail, or when asking why an
  example does or does not appear on the Community page. Not for authoring the
  model geometry itself or adding a kernel (create-kernel).
---

# Packaging a Tau example

An example is a directory `libs/tau-examples/src/kernels/<kernel>/<example>/`; its locator is `<kernel>.<example>` and its share link is `/s/builtin~<kernel>.<example>`. Nothing registers it by hand: the generators scan the tree, and the directory's `example.json` class and `tau.json` decide where it goes. Run every command from the repository root with Node 24.

Read [references/packaging-checklist.md](references/packaging-checklist.md) when packaging; it has the ordered checklist, the first-publication sequence and the snippets.

## Where an example goes

| `example.json`                                                        | Effect on HEAD                                                                                                                                                 |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| absent, or `{"kind":"model"}` (`"geometry":"2d"` for flat SVG output) | With `tau.json`: a public builtin in `src/builtin.ts`, loadable at `/s/builtin~…`. Always: one row in the example-health suite (and CI's `runtime-e2e` `test`) |
| `{"kind":"reference"}`                                                | In `manifest.json` only: not a builtin, not health-gated. Use for heavy or staged rows                                                                         |
| `{"kind":"test-fixture"}`                                             | In `src/test-fixtures.ts` (test seed routes only) when it has `tau.json`; never a builtin, not health-gated                                                    |
| `{"kind":"spec-fixture"}`                                             | A spec-first GeoSpec target (`replicad/v8-engine-rev2`); not a builtin, not health-gated                                                                       |

Every non-`model` class count is pinned in `libs/tau-examples/scripts/generation.test.ts` ("discovers only real entrypoints…"); change the pin with the class. There is no "published but health-excluded" state: a `model` row is health-gated, and demoting it to `reference` unpublishes it.

Thumbnails are independent of class: every row with a main file whose kernel is composed in `exampleRuntime` (`libs/tau-examples/scripts/runtime.ts`) must have a 1536×1152 `thumbnail.webp` (6 px edges), or `generation.test.ts` fails. The example shown as the featured Community card (`featuredCommunityLocator`) also sets `"featured": true` in `example.json`, which renders `thumbnail-featured.webp` with 3 px edges: that card is drawn at twice a card's size, so halving the edge width keeps the same on-screen line weight. The featured thumbnail is not a project file (Remix does not copy it).

**Community is curated, not automatic.** A builtin with a thumbnail becomes a card model in `sampleProjects` (`apps/ui/app/constants/project-examples.ts`), which keeps its share link working. The `/community` page and the marketing landing show only the locators listed in `communityLocators` in that file, in display order; `project-examples.test.ts` requires every listed locator to resolve, in order, to a builtin with a thumbnail. Add a locator only when the operator or the task selects the example as a showcase; toy and starter models stay plain builtins. The Community kernel shelf lists only kernels with a `kernelConfigurations` entry (`libs/types/src/constants/kernel.constants.ts`) and an `SvgIcon` mark.

## Files in an example

- **Entry**: the first of `main.ts`, `main.py`, `main.cs`, `main.scad`, `main.cpp` at the example root. A row without one is never rendered, and a `model` row without one fails the health suite.
- **Everything else is shipped**: every file except `example.json`, `thumbnail-featured.webp`, `.DS_Store` and `.tau/cache/` becomes a lazy builtin asset (the thumbnail included), so multi-file examples work and scratch files leak into the builtin. Symbolic links are rejected.
- **`tau.json`** follows the strict `projectManifestSchema` (`libs/types/src/schemas/project-manifest.schema.ts`): `$schema`, `id`, `name`, `description`, `tags`, `assets.main.entryPath`, optional `assets.main.thumbnail`; no other keys. Generate a fresh id; never copy one from another example (duplicates throw):

  ```bash
  pnpm --dir libs/utils exec tsx -e "import { generatePrefixedId } from './src/id.utils.ts'; console.log(generatePrefixedId('proj'))"
  ```

  Name it for what it shows ("Rover Wheel"); the card already shows the kernel, so a kernel prefix only repeats it. Tags are lowercase and include the kernel id.

- **`README.md`** (ports and adapters; recommended shape, not a gate): upstream repository at a pinned commit, upstream source paths, licence, what the Tau adapter changes, parameters, expected cost, and the GeoSpec command when a suite exists (`picovoxel/rover-wheel/README.md`).
- **`DESIGN.md`** (authored flagship assemblies): design brief, frame and assembly tree, as `replicad/v8-engine/DESIGN.md`.
- **`main.geospec.ts`** (optional): a GeoSpec suite beside the entry, loading the model by relative path.

## Workflow

1. **Classify** with `example.json` (or none for a `model`) and adjust the `generation.test.ts` pins.
2. **Write `tau.json`** with a fresh id. For a new public row, leave out `assets.main.thumbnail` until step 5: `generate-manifest` throws when a declared thumbnail file is missing.
3. **Prove the geometry** when the row has a suite:

   ```bash
   node --import tsx packages/geospec-engine/src/cli/main.ts run libs/tau-examples/src/kernels/<kernel>/<example> --test-timeout 300000 --workers 1 --json
   ```

   Every runnable test must pass; spec-first rows mark unmet requirements `it.skip`, never red.

4. **Regenerate the manifest**: `pnpm nx generate-manifest tau-examples`. Never hand-edit `src/{manifest.json,manifest.ts,builtin.ts,test-fixtures.ts,thumbnail.assets.ts}`.
5. **Render thumbnails.** A selected run renders only the named rows and rewrites the complete `src/thumbnail.assets.ts` from manifest rows with an existing thumbnail, independently of which runtimes are composed for this run:

   ```bash
   pnpm exec tsx libs/tau-examples/scripts/generate-thumbnails.mts --only=<kernel>/<example>
   ```

   Use `pnpm nx generate-thumbnails tau-examples` when every composed row must be re-rendered. The camera is fixed (bounds framing, direction `[0.612, −0.612, 0.5]`, +Z up, 45° perspective, AO, edges on), each row renders in a fresh process, 2D rows rasterise their SVG, and PicoVoxel renders on its exact lane. Set `TAU_PICOGK_RESOURCE_ROOT` for PicoGK rows. Then add `"thumbnail": "thumbnail.webp"` to `tau.json` and run `generate-manifest` again. Check selected image and map drift with the same command plus `--check`.

6. **Gate health** for `model` rows (300 s per model, 1,500 s for the suite; 3D rows must be watertight):

   ```bash
   TAU_EXAMPLE_PATTERN='replicad\.v8-engine$' pnpm nx run runtime-e2e:example-health
   ```

   The pattern is a JavaScript regex matched against `Tau example model health > <kernel>.<example>`, so never anchor it with `^`: the run then selects no test and fails its count. Run the unfiltered target once before landing a batch. Native `picogk` rows need `TAU_PICOGK_RESOURCE_ROOT`.

7. **Gate the suite** (when the row has one): add an `it()` to `apps/runtime-e2e/src/geospec-suites.test.ts` (snippet in the checklist).
8. **Curate** only if selected: add the locator to `communityLocators` at its display position.
9. **Verify** with the checklist's final block, then commit by path.

## Licence and provenance

`libs/tau-examples` is Apache-2.0. Port only Apache-2.0, MIT or CC0 sources, keep their headers, and state the upstream and licence in the README. A kernel family with ported sources keeps one ledger beside it, as `picovoxel/provenance.json`: pinned repository and commit, one `upstreams` row (prefix, upstream, licence) per source family, and a sha256 per copied file with any Tau adaptation recorded, checked by `src/picovoxel-provenance.test.ts`. Keep byte-pinned ports out of the formatter with an `.oxfmtrc.json` ignore that re-includes `main.ts` and `*.geospec.ts`. Vendored part files (STEP and similar) carry a `parts.manifest.json` with a licence and attribution per part. An unverified origin is a blocker to raise with the operator, not a licence to guess.
