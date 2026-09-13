---
title: '`@taucad/runtime` npm Release Bundling Strategy'
description: 'Audit and recommendations for shipping @taucad/runtime as a standalone npm package — bundle workspace deps, preserve plugin chunks, fix tarball/file: deps, harden README and validation gates.'
status: draft
created: '2026-05-22'
updated: '2026-05-22'
category: architecture
related:
  - docs/research/runtime-zero-config-bundling.md
  - docs/policy/release-policy.md
  - docs/policy/version-policy.md
  - docs/policy/library-api-policy.md
  - docs/policy/npm-policy.md
---

# `@taucad/runtime` npm Release Bundling Strategy

How to take the current workspace-shaped `@taucad/runtime` package to a fully standalone, npm-publishable artefact: bundle every workspace `@taucad/*` dependency into `dist/`, keep the per-plugin chunk contract intact, normalise tarball/`file:` dependencies to real npm specifiers, and gate every release with a fixed set of validators.

## Executive Summary

`@taucad/runtime` already produces a dual ESM/CJS dual-tree under `dist/` via `tsdown`, ships per-plugin chunks under `unbundle: true`, and copies WASM/font assets correctly. Three classes of issue still block npm publication:

1. **Workspace `@taucad/*` deps leak through `dependencies`.** The current package declares `@taucad/converter`, `@taucad/filesystem`, `@taucad/json-schema`, `@taucad/memory`, `@taucad/rpc`, `@taucad/types`, `@taucad/utils` as `workspace:*` dependencies. `@taucad/types`, `@taucad/utils`, and `@taucad/units` (transitive) are marked `"private": true` and have never been published. A `pnpm pack`-installed consumer would fail `npm install` immediately. **Fix**: bundle every workspace `@taucad/*` dep into the runtime's `dist/` via `deps.alwaysBundle: [/^@taucad\/(converter|filesystem|json-schema|memory|rpc|types|units|utils)(\/|$)/]` and move them out of `dependencies`. Only the externally-published `@taucad/kcl-wasm-lib` and `@taucad/opencascade.js` stay as real deps.
2. **`file:` / tarball dependencies are not publishable.** `opencascade.js: file:../../tarballs/opencascade-fork/...` and `replicad: file:../../tarballs/replicad-fork/...` resolve only inside this workspace. **Fix**: publish the fork tarballs as scoped `@taucad/*` packages (already partially done — `@taucad/opencascade.js@3.0.0-beta.1` and `@taucad/replicad-opencascadejs@0.21.0-v8.57` are live) and use `npm:` aliases so consumer-facing `import 'replicad'` / `import 'opencascade.js'` paths continue to work.
3. **The build does not run `publint`/`attw` and ships ~32 deep-import subpaths**, each of which the type resolver must validate. **Fix**: enable `publint: 'ci-only'` and `attw: { enabled: 'ci-only', profile: 'node16', level: 'error' }` in the tsdown config and gate the existing `pkgcheck` target into the release workflow.

The current `unbundle: true` shape is the right call and must stay — it is the only mode that preserves the `new URL('replicad.kernel.js', import.meta.url)` plugin contract documented in `runtime-zero-config-bundling.md`. Bundling workspace deps via `deps.alwaysBundle` does **not** conflict with `unbundle: true`: the workspace dep files are pulled into the source graph and emitted as additional chunks alongside the per-plugin chunks; rolldown deduplicates symbol sets at the chunk level.

After these three fixes, plus a README polish pass, `@taucad/runtime` is npm-ready.

## Table of Contents

- [Problem Statement](#problem-statement)
- [Methodology](#methodology)
- [Findings](#findings)
- [Recommendations](#recommendations)
- [Trade-offs](#trade-offs)
- [Code Examples](#code-examples)
- [README Audit](#readme-audit)
- [References](#references)
- [Appendix A: Dependency Classification Matrix](#appendix-a-dependency-classification-matrix)
- [Appendix B: Final tsdown.config.ts](#appendix-b-final-tsdownconfigts)
- [Appendix C: Final package.json shape](#appendix-c-final-packagejson-shape)

## Problem Statement

The user requirement: ship `@taucad/runtime` to the public npm registry with the following constraints.

- **No `@taucad/*` workspace dependencies** in the published `package.json`. The runtime must be installable as a single npm dep with no further `@taucad/*` installs.
- **All plugins remain included in the bundle as they are today.** The `kernels/replicad`, `kernels/opencascade`, `kernels/manifold`, `kernels/jscad`, `kernels/zoo`, `kernels/tau`, `middleware/*`, `bundler/esbuild`, and `transcoders/converter` files must still ship as discoverable, dynamically-importable chunks under `dist/esm/` (the contract documented in `runtime-zero-config-bundling.md`).
- **Production-ready** — pass `publint`, `attw`, size-limit, and `pnpm pack --dry-run` audit; README must be best-in-class.

Three structural problems block this today:

1. **Internal workspace dependencies.** `package.json#dependencies` declares 7 `workspace:*` packages, 3 of which (`@taucad/types`, `@taucad/utils`, `@taucad/units`) are `"private": true` and would 404 on `npm install`. The other 4 (`@taucad/converter`, `@taucad/filesystem`, `@taucad/json-schema`, `@taucad/memory`, `@taucad/rpc`) are publishable but the user wants a single-install consumer experience.
2. **`file:`-protocol dependencies.** `opencascade.js: file:../../tarballs/...` and `replicad: file:../../tarballs/...` will produce a published package that points at non-existent paths.
3. **No package-validation gate.** The build does not run `publint` or `attw`; the `pkgcheck` Nx target exists (`tools/pkgcheck.ts`) but is not wired into the release pipeline. There is no `prepublishOnly` script.

## Methodology

This investigation combined four sources.

1. **In-tree audit** of `packages/runtime/package.json`, `tsdown.config.ts`, `src/index.ts`, all `src/**/*.plugin.ts` files, `tools/pkgcheck.ts`, and `tools/tsdown.plugin.ts`.
2. **Workspace-dep graph traversal** via ripgrep (`rg "from ['\"]@taucad/(filesystem|converter|json-schema|memory|rpc|types|utils|units)"`) on `packages/runtime/src` to enumerate every workspace import surface.
3. **tsdown source reading** for May 2026 best-practice signal: `tsdown.dev/options/dependencies` (the `deps` namespace, March 2026), `tsdown.dev/options/unbundle`, `tsdown.dev/options/lint` (publint + attw), `tsdown.dev/options/package-exports`, and rolldown/tsdown#544 (the workspace-package bundling issue closed Dec 17, 2025).
4. **Peer-library survey** of recently-published comparable libraries: `@gltf-transform/core`, `@duckdb/duckdb-wasm`, `@kittycad/lib`, `replicad`, and the tsdown project's own self-published `tsdown.config.ts`.

The existing `docs/research/runtime-zero-config-bundling.md` is the prior art on the plugin-chunk contract (Findings 1–2 there are pre-requisite reading); this doc focuses specifically on the **publication** layer.

## Findings

### Finding 1: `unbundle: true` is non-negotiable and is fully compatible with bundling workspace deps

The runtime's plugin contract (formalised in `runtime-zero-config-bundling.md` Findings 1–2) requires that each kernel/middleware/transcoder/bundler chunk land at a **predictable, sibling-of-the-plugin-file URL** in `dist/esm/`. Example: `kernels/replicad/replicad.plugin.js` executes `new URL('replicad.kernel.js', import.meta.url).href` at plugin-definition time. For that URL to resolve, `replicad.kernel.js` must exist beside `replicad.plugin.js` in the published tree.

This requires `unbundle: true` (tsdown's equivalent of rollup's `preserveModules`). Single-file or auto-chunked output places these files in hashed chunks under `chunks/`, breaking the contract.

A naïve reading of the tsdown docs suggests `unbundle: true` precludes bundling external packages. **It does not.** When `deps.alwaysBundle` matches a workspace dep, tsdown adds its source files to the input graph. With `unbundle: true`, those files are also emitted to `dist/esm/` mirroring their source path (typically under `dist/esm/node_modules/<pkg>/<file>.js` or as a flattened sibling, depending on rolldown's `preserveModulesRoot` heuristics). The plugin-chunk topology is unaffected: every original `entry` still produces its own chunk, and consumer-side `import` statements within those chunks resolve via the bundled-into-place workspace files.

The concrete validation: rolldown/tsdown#544 closed Dec 17, 2025 confirms `deps.alwaysBundle: [/^@scope\//]` works with `workspace:*` dependencies — the original bug was operator error (matching pattern needs to include subpath imports like `@scope/pkg/sub`, which a regex anchored at `^@scope\/` handles correctly).

### Finding 2: `deps.alwaysBundle` (tsdown 0.21.0+, March 2026) is the canonical API

tsdown 0.21.0 renamed the dependency-handling options into a single `deps` namespace. The old `noExternal: [...]` is deprecated in favour of `deps.alwaysBundle: [...]`. The full migration table is:

| Deprecated              | Replacement                  | Purpose                                     |
| ----------------------- | ---------------------------- | ------------------------------------------- |
| `noExternal`            | `deps.alwaysBundle`          | Force-bundle deps (override `dependencies`) |
| `external`              | `deps.neverBundle`           | Force-externalise deps                      |
| `inlineOnly`            | `deps.onlyBundle`            | Whitelist; error on unexpected bundling     |
| `deps.onlyAllowBundle`  | `deps.onlyBundle`            | Renamed                                     |
| `skipNodeModulesBundle` | `deps.skipNodeModulesBundle` | Externalise every `node_modules/*`          |

For the runtime's needs:

```ts
deps: {
  alwaysBundle: [
    /^@taucad\/(converter|filesystem|json-schema|memory|rpc|types|units|utils)(\/|$)/,
  ],
},
```

The regex anchors at `^@taucad/` and lists each workspace package by name with an optional `/subpath` capture. This matches both `@taucad/utils` and `@taucad/utils/id` (the subpath-export pattern that motivated tsdown/issues/544). Listing each scope member explicitly (rather than `/^@taucad\//`) keeps the externally-published `@taucad/kcl-wasm-lib` and `@taucad/opencascade.js` excluded from bundling.

### Finding 3: `file:` and tarball dependencies must be normalised before publish

The current `packages/runtime/package.json` declares:

```json
"opencascade.js": "file:../../tarballs/opencascade-fork/taucad-opencascade.js-3.0.0-beta.d3056ef.tgz",
"replicad": "file:../../tarballs/replicad-fork/taucad-replicad-0.21.0-v8.57.2-jsdoc.tgz",
"replicad-opencascadejs": "npm:@taucad/replicad-opencascadejs@0.21.0-v8.57",
```

`file:` deps resolve relative to the package directory. After `npm publish`, the published tarball references paths that do not exist on the consumer's machine. npm will hard-fail on install.

Three of the published fork artefacts already exist on npm under the `@taucad/*` scope:

| Workspace specifier                               | npm-published replacement             | Status        |
| ------------------------------------------------- | ------------------------------------- | ------------- |
| `file:tarballs/opencascade-fork/...tgz`           | `@taucad/opencascade.js@3.0.0-beta.1` | **Published** |
| `file:tarballs/replicad-fork/...tgz`              | `@taucad/replicad@TBD` (not yet)      | **Missing**   |
| `npm:@taucad/replicad-opencascadejs@0.21.0-v8.57` | (same, already an `npm:` alias)       | **OK**        |

**Two paths** to resolve `replicad`:

- **Path A (recommended)**: publish the `replicad` fork as `@taucad/replicad@0.21.0-v8.57.2-jsdoc` and alias it: `"replicad": "npm:@taucad/replicad@^0.21.0-v8.57.2-jsdoc"`. Consumers continue to `import 'replicad'`; the alias hides the fork.
- **Path B**: bundle `replicad` into `@taucad/runtime` via `deps.alwaysBundle: ['replicad']`. Risk: replicad pulls in `replicad-opencascadejs` and `opencascade.js` (multi-MB WASM bindings); attempting to bundle these breaks the kernel's own `new URL(...wasm)` asset references (the same class of bug as the CLI bundle attempt documented in `runtime-zero-config-bundling.md` Finding 6). **Reject Path B.**

Path A also generalises: every fork tarball under `tarballs/` should be published under `@taucad/<original-name>` and aliased back to the consumer-facing name via `npm:`. This is exactly what `replicad-opencascadejs` already does and is the existing convention.

### Finding 4: Publish-time `publint`/`attw` validation is industry standard for May 2026

The recommended May 2026 pattern (per `tsdown.dev/options/lint`, the tsdown project's own `tsdown.config.ts`, and `pkgpulse.com/guides/publishing-npm-package-complete-guide-2026`) is to enable `publint` and `attw` in `ci-only` mode so dev-mode `tsdown build` stays fast and CI catches publication regressions:

```ts
export default defineConfig({
  publint: 'ci-only',
  attw: {
    enabled: 'ci-only',
    profile: 'node16',
    level: 'error',
  },
});
```

`profile: 'node16'` is the right call for `@taucad/runtime` because:

- The package ships dual ESM + CJS (consumers must include `require` paths).
- `strict` flags `node10` (legacy ten-year-old resolver) failures, which add noise without value — no consumer pinning to Node ≤14 will load WASM-bearing kernels.
- `esm-only` is wrong: we are explicitly dual-publishing.

The repo already has a `tools/pkgcheck.ts` orchestrator that runs `publint`, `attw`, `madge` (circular deps), and `size-limit` against a staged copy of the package with `publishConfig` applied. This is the right shape; it just isn't wired into release CI.

### Finding 5: The dependency tree must be classified into four buckets

After fix-up, every entry in `dependencies` falls into one of four buckets. The current state mixes them and must be sorted before publish.

| Bucket                      | Treatment                                                               | Members today                                                                                                                                                                                                                                                                                                                                      |
| --------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Bundle into `dist/`**  | Move to `devDependencies`; bundle via `deps.alwaysBundle`               | `@taucad/converter`, `@taucad/filesystem`, `@taucad/json-schema`, `@taucad/memory`, `@taucad/rpc`, `@taucad/types`, `@taucad/utils` (+ transitive `@taucad/units`)                                                                                                                                                                                 |
| **B. Real runtime deps**    | Keep in `dependencies`                                                  | `@gltf-transform/core`, `@gltf-transform/extensions`, `@gltf-transform/functions`, `@jscad/modeling`, `@kittycad/lib`, `@msgpack/msgpack`, `@taucad/kcl-wasm-lib`, `cdn-resolve`, `culori`, `deepmerge`, `es-module-lexer`, `esbuild-wasm`, `json-schema-default`, `manifold-3d`, `source-map-js`, `type-fest`, `uint8array-extras`, `uzip`, `zod` |
| **C. Tarball/file: deps**   | Republish under `@taucad/*`, alias with `npm:`                          | `opencascade.js` (→ `@taucad/opencascade.js`), `replicad` (→ `@taucad/replicad`)                                                                                                                                                                                                                                                                   |
| **D. Optional peer deps**   | Keep in `peerDependencies` with `peerDependenciesMeta.*.optional: true` | `vite`, `vitest`, `rolldown`                                                                                                                                                                                                                                                                                                                       |
| **E. Drop / move**          | Remove from runtime entirely                                            | `vitest-mock-extended` (test-only, currently mis-declared as `dependencies` — should be `devDependencies` of the consumer test runner)                                                                                                                                                                                                             |
| **F. Drop unconditionally** | Remove                                                                  | `ws` (server-only WebSocket — `kernels/zoo/engine-connection.ts` should use the browser `WebSocket` global and require it as a Node 22+ runtime built-in)                                                                                                                                                                                          |

The `ws` line item deserves attention: Node 22+ ships a stable global `WebSocket` (per Node.js 22 LTS, October 2024). Removing `ws` saves a runtime dep entirely; if Node 18 must be supported, ship `ws` in `optionalDependencies` instead so browser consumers don't install it.

### Finding 6: Subpath `exports` must match `publishConfig.exports` byte-for-byte

The current `package.json` declares 32 `exports` keys mapping to `src/*.ts` (workspace dev mode) and 32 corresponding `publishConfig.exports` keys mapping to `dist/{cjs,esm}/*`. `publishConfig.exports` overrides `exports` at publish time (per npm's `publishConfig` spec, validated by `tools/pkgcheck.ts`'s `applyPublishConfig`).

Two systematic risks:

1. **Drift between the two maps.** New subpaths added to `exports` for workspace dev are not always mirrored into `publishConfig.exports`. The `tsdown.config.ts` `entry` array and the two maps must stay in lockstep. **Mitigation**: lint script (or generator) that diffs `Object.keys(exports)` vs `Object.keys(publishConfig.exports)` vs `tsdown.config.ts` `entry`. Fail the build on drift.
2. **`./types` exports default to `dist/cjs/types/index.cjs` but the file is type-only.** Type-only subpaths should expose only `types` conditions, not `default`. Currently both are emitted, which causes `false-cjs` / `false-esm` attw warnings. **Mitigation**: regenerate via tsdown 0.21+'s experimental `exports: true` auto-generation feature once it stabilises; until then, manually audit type-only entries.

### Finding 7: Tsdown's experimental auto-`exports` would eliminate the dual-map drift class

tsdown 0.21+ exposes an experimental `exports: true` config that auto-generates the `exports`/`main`/`module`/`types` fields from the entry array:

```ts
export default defineConfig({
  exports: {
    all: false, // export only entry files
    devExports: true, // map to src/*.ts during dev for monorepo
    customExports: {
      /* overrides */
    },
  },
});
```

This would replace the hand-maintained 32-entry `exports` + 32-entry `publishConfig.exports` pair with a single source-of-truth (the `entry` array). **Adopt with caution** until the feature stabilises (tsdown changelog flags it as experimental as of 0.21.x); for the v0.1 release of `@taucad/runtime`, keep the manual map and add a CI assertion that the two maps match. Reassess at v0.2.

### Finding 8: README quality bar for a flagship multi-kernel runtime

The current README is well-written but undersells the package. Audit against the npm best-practice rubric (badges, install snippet, terminology, breadth of examples, links, browser+Node coverage):

| Section                          | Current        | Target                                                                                                 |
| -------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------ |
| **Badges**                       | None           | npm version, weekly downloads, bundle-size (`size-limit`), license, provenance                         |
| **Install snippet**              | Missing        | `npm install @taucad/runtime` (with pnpm/yarn alternatives, peer-dep note)                             |
| **Quick start**                  | Present, good  | Keep; add a Node CLI snippet alongside the browser one                                                 |
| **Kernels overview table**       | Implicit       | Add: kernel id, license, source language, async, WASM size, supported export formats                   |
| **Browser vs Node** matrix       | Implicit       | Explicit table: which subpath works in which environment (`/node`, `/worker/node` are Node-only)       |
| **Subpath exports table**        | Partial        | Complete table mirroring `package.json#exports` — every subpath, one-line purpose, environment         |
| **Vite consumer setup**          | Linked         | Inline: `import { runtime } from '@taucad/runtime/vite'; plugins: [runtime()]`                         |
| **CDN/script-tag note**          | Missing        | Note that WASM-bearing kernels require a bundler (no CDN-only support)                                 |
| **Versioning & compat policy**   | Missing        | "Pre-1.0 minors may break; SemVer applies once 1.0"; link to release-policy                            |
| **Migration / changelog link**   | Missing        | Link to `CHANGELOG.md` and `docs/`                                                                     |
| **Comparison to alternatives**   | Missing        | Brief positioning vs `@gltf-transform/core` (no kernels), raw `replicad` (single kernel, no transport) |
| **Security / supply chain note** | Missing        | "All releases signed via npm provenance; verify with `npm audit signatures`"                           |
| **License & attribution**        | Implicit (MIT) | Explicit MIT block; note that bundled fork deps stay under their original licenses                     |

A README that scores well on the [README maturity model](https://github.com/RichardLitt/standard-readme) consistently wins discoverability against single-kernel competitors.

## Recommendations

| #   | Action                                                                                                                                                                                       | Priority | Effort | Impact |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ------ |
| R1  | Add `deps.alwaysBundle: [/^@taucad\/(converter\|filesystem\|json-schema\|memory\|rpc\|types\|units\|utils)(\/\|$)/]` to `packages/runtime/tsdown.config.ts`.                                 | **P0**   | Low    | High   |
| R2  | Move every bundled `@taucad/*` workspace dep from `dependencies` to `devDependencies` in `packages/runtime/package.json`.                                                                    | **P0**   | Low    | High   |
| R3  | Publish the `replicad` fork as `@taucad/replicad` to npm; replace `"replicad": "file:..."` with `"replicad": "npm:@taucad/replicad@^<version>"`.                                             | **P0**   | Medium | High   |
| R4  | Replace `"opencascade.js": "file:..."` with `"opencascade.js": "npm:@taucad/opencascade.js@^3.0.0-beta"` (already published).                                                                | **P0**   | Low    | High   |
| R5  | Remove `vitest-mock-extended` from `dependencies` (test-only).                                                                                                                               | **P0**   | Low    | Medium |
| R6  | Audit `ws`: remove if Node 22+ minimum acceptable; otherwise move to `optionalDependencies` so browser consumers don't install it.                                                           | P1       | Low    | Medium |
| R7  | Add `publint: 'ci-only'` and `attw: { enabled: 'ci-only', profile: 'node16', level: 'error' }` to `tsdown.config.ts`.                                                                        | **P0**   | Low    | High   |
| R8  | Wire `nx run runtime:pkgcheck` (already implemented in `tools/pkgcheck.ts`) into the release workflow as a hard gate before `npm publish`.                                                   | **P0**   | Low    | High   |
| R9  | Add CI assertion that `Object.keys(exports)` ≡ `Object.keys(publishConfig.exports)` ≡ entries derivable from `tsdown.config.ts` `entry` array. Fail build on drift.                          | P1       | Medium | High   |
| R10 | Rewrite `packages/runtime/README.md` against the audit table in Finding 8 (badges, install snippet, kernels table, environment matrix, subpath exports table, compat policy, security note). | **P0**   | Medium | High   |
| R11 | Add a `prepublishOnly` script to `packages/runtime/package.json` that runs `pnpm nx build runtime` and `pnpm nx pkgcheck runtime`.                                                           | P1       | Low    | Medium |
| R12 | Add `"engines": { "node": ">=22" }` to `packages/runtime/package.json` (matches Node 22 LTS WebSocket global + `--experimental-vm-modules` default-on).                                      | P1       | Low    | Medium |
| R13 | Track tsdown's experimental `exports: true` auto-generation feature; revisit at v0.2 to collapse the dual `exports`/`publishConfig.exports` map.                                             | P3       | Low    | Future |
| R14 | Confirm `peerDependencies` (`rolldown`, `vite`, `vitest`) reflect actual SemVer ranges supported. `vite >=7` is correct; `vitest >=2` is loose — tighten to `>=3` if no 2.x test in CI.      | P2       | Low    | Low    |
| R15 | Mirror the `npm-policy` policy doc (this doc's companion) for every other publishable `@taucad/*` package (`@taucad/converter`, `@taucad/json-schema`, `@taucad/js`).                        | P1       | Medium | High   |

## Trade-offs

### Bundling vs externalising workspace deps

| Approach                                                                         | Pros                                                                                                                                              | Cons                                                                                                                  |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **Bundle all `@taucad/*` workspace deps into `@taucad/runtime`** _(recommended)_ | Single-install consumer experience; no version-skew between runtime and internal libs; private libs (`types`, `utils`) never need to be published | Modest dist size increase (~50–80 KB minified); duplicated code if another `@taucad/*` package also bundles them      |
| Publish each `@taucad/*` workspace dep individually and externalise in runtime   | Smaller dist for runtime; deps can be consumed independently                                                                                      | 6 extra installs for every runtime consumer; private libs (`types`, `utils`) must be made public; version-skew matrix |
| Hybrid: bundle private libs, externalise publishable ones                        | Smallest dist                                                                                                                                     | Most complex matrix; defeats the user's "no @taucad deps" requirement                                                 |

The user explicitly required "no @taucad deps". The bundle-everything path is the only fit.

### `unbundle: true` vs auto-chunked output

| Mode                                   | Plugin contract works?                                     | Dist size                                | Tree-shakable                          |
| -------------------------------------- | ---------------------------------------------------------- | ---------------------------------------- | -------------------------------------- |
| `unbundle: true` _(current; required)_ | **Yes** — each plugin file lands at a known sibling path   | Larger (no symbol-sharing across chunks) | Yes, but at the file/entry granularity |
| Auto-chunked (rolldown default)        | **No** — file names hashed, plugin URLs break              | Smaller (shared chunks)                  | Yes                                    |
| Single-file (`splitting: false`)       | **No** — plugins inlined; dynamic `import(moduleUrl)` 404s | Smallest                                 | No                                     |

This is a hard architectural constraint — `unbundle: true` is the only viable mode and cannot change without rewriting the dynamic-plugin contract.

### dual ESM/CJS vs ESM-only

| Strategy                                         | Pros                                                             | Cons                                                                                           |
| ------------------------------------------------ | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Dual ESM + CJS _(current; recommended for v0.1)_ | Maximum consumer compatibility; CJS-only test runners still work | Larger dist (`dist/cjs` + `dist/esm`); dual-package-hazard risk for identity-sensitive symbols |
| ESM-only                                         | Single tree; smaller install; aligns with Node 22+'s native ESM  | Breaks CJS-only consumers (Vitest 1.x, older Jest, plenty of CI scripts)                       |
| ESM-only with `tsx`/`tsm` shim recommendation    | Best of both                                                     | Pushes interop burden onto consumers                                                           |

Stay dual until v1.0; reassess once Node 24 LTS lands (Oct 2026) — by then `require(esm)` is unflagged-default on all maintained Node lines and CJS-only consumers have stronger migration pressure.

## Code Examples

### Recommended `packages/runtime/tsdown.config.ts`

```typescript
import { defineConfig, type Options } from 'tsdown';

// Workspace @taucad/* deps that must be bundled into dist/.
// @taucad/kcl-wasm-lib and @taucad/opencascade.js are externally
// published and stay as real npm dependencies.
const TAU_WORKSPACE_BUNDLE = /^@taucad\/(converter|filesystem|json-schema|memory|rpc|types|units|utils)(\/|$)/;

const baseConfig: Options = {
  entry: [
    'src/index.ts',
    'src/types/index.ts',
    'src/plugins/kernel-plugin-entry.ts',
    'src/plugins/kernels-entry.ts',
    'src/plugins/middleware-entry.ts',
    'src/plugins/bundler-entry.ts',
    'src/plugins/transcoder-factories.ts',
    'src/runner/index.ts',
    'src/transport/index.ts',
    'src/transport/in-process.ts',
    'src/transport/web.ts',
    'src/transport/node.ts',
    'src/host/index.ts',
    'src/node.ts',
    'src/filesystem/index.ts',
    'src/filesystem/from-node-fs.ts',
    'src/filesystem/from-browser-fs.ts',
    'src/testing/index.ts',
    'src/framework/kernel-runtime-worker.ts',
    'src/worker/web.ts',
    'src/worker/node.ts',
    'src/worker-internals.ts',
    'src/transport-internals.ts',
    'src/kernels/replicad/replicad.kernel.ts',
    'src/kernels/jscad/jscad.kernel.ts',
    'src/kernels/manifold/manifold.kernel.ts',
    'src/kernels/opencascade/opencascade.kernel.ts',
    'src/kernels/zoo/zoo.kernel.ts',
    'src/kernels/zoo/engine-connection.ts',
    'src/kernels/tau/tau.kernel.ts',
    'src/bundler/esbuild.bundler.ts',
    'src/middleware/runtime-middleware.ts',
    'src/middleware/parameter-cache.middleware.ts',
    'src/middleware/geometry-cache.middleware.ts',
    'src/middleware/gltf-coordinate-transform.middleware.ts',
    'src/middleware/gltf-edge-detection.middleware.ts',
    'src/cross-origin-isolation/index.ts',
    'src/cross-origin-isolation/express.ts',
    'src/react-router/index.ts',
    'src/vite/index.ts',
    'src/rolldown/index.ts',
    'src/utils/package-info.ts',
  ],
  sourcemap: false,
  clean: true,
  dts: true,
  minify: true,
  tsconfig: 'tsconfig.build.json',
  unbundle: true,
  deps: {
    alwaysBundle: [TAU_WORKSPACE_BUNDLE],
  },
  copy: (options) => [
    { from: 'src/kernels/replicad/fonts', to: `${options.outDir}/kernels/replicad/fonts` },
    { from: 'src/bundler/wasm', to: `${options.outDir}/bundler/wasm` },
    { from: 'src/kernels/replicad/wasm', to: `${options.outDir}/kernels/replicad/wasm` },
    { from: 'src/kernels/zoo/wasm', to: `${options.outDir}/kernels/zoo/wasm` },
    { from: 'src/kernels/manifold/wasm', to: `${options.outDir}/kernels/manifold/wasm` },
    { from: 'src/kernels/opencascade/wasm', to: `${options.outDir}/kernels/opencascade/wasm` },
  ],
  publint: 'ci-only',
  attw: {
    enabled: 'ci-only',
    profile: 'node16',
    level: 'error',
  },
};

const baseEntries = baseConfig.entry as string[];
const cjsConfig: Options = {
  ...baseConfig,
  entry: baseEntries.filter((entryPath) => !entryPath.startsWith('src/worker/')),
  format: 'cjs',
  outDir: 'dist/cjs',
  dts: false,
};

const esmConfig: Options = {
  ...baseConfig,
  format: 'esm',
  outDir: 'dist/esm',
};

export default defineConfig([esmConfig, cjsConfig]);
```

### Recommended `package.json` diff

```diff
-  "main": "./dist/cjs/index.cjs",
-  "types": "./dist/cjs/index.d.cts",
-  "module": "./dist/esm/index.js",
+  "main": "./dist/cjs/index.cjs",
+  "module": "./dist/esm/index.js",
+  "types": "./dist/esm/index.d.ts",
+  "engines": { "node": ">=22" },
+  "sideEffects": false,
+  "scripts": {
+    "prepublishOnly": "pnpm nx run runtime:pkgcheck"
+  },
   "dependencies": {
     "@gltf-transform/core": "catalog:",
     "@gltf-transform/extensions": "catalog:",
     "@gltf-transform/functions": "catalog:",
     "@jscad/modeling": "catalog:",
     "@kittycad/lib": "catalog:",
     "@msgpack/msgpack": "catalog:",
-    "@taucad/converter": "workspace:*",
-    "@taucad/filesystem": "workspace:*",
-    "@taucad/json-schema": "workspace:*",
     "@taucad/kcl-wasm-lib": "catalog:",
-    "@taucad/memory": "workspace:*",
-    "@taucad/rpc": "workspace:*",
-    "@taucad/types": "workspace:*",
-    "@taucad/utils": "workspace:*",
     "cdn-resolve": "catalog:",
     "culori": "catalog:",
     "deepmerge": "catalog:",
     "es-module-lexer": "catalog:",
     "esbuild-wasm": "catalog:",
     "json-schema-default": "catalog:",
     "manifold-3d": "catalog:",
-    "opencascade.js": "file:../../tarballs/opencascade-fork/taucad-opencascade.js-3.0.0-beta.d3056ef.tgz",
-    "replicad": "file:../../tarballs/replicad-fork/taucad-replicad-0.21.0-v8.57.2-jsdoc.tgz",
+    "opencascade.js": "npm:@taucad/opencascade.js@^3.0.0-beta",
+    "replicad": "npm:@taucad/replicad@^0.21.0-v8.57",
     "replicad-opencascadejs": "npm:@taucad/replicad-opencascadejs@0.21.0-v8.57",
     "source-map-js": "catalog:",
     "type-fest": "catalog:",
     "uint8array-extras": "catalog:",
     "uzip": "catalog:",
-    "vitest-mock-extended": "catalog:",
-    "ws": "catalog:",
     "zod": "catalog:"
   },
+  "optionalDependencies": {
+    "ws": "catalog:"
+  },
   "devDependencies": {
+    "@taucad/converter": "workspace:*",
+    "@taucad/filesystem": "workspace:*",
+    "@taucad/json-schema": "workspace:*",
+    "@taucad/memory": "workspace:*",
+    "@taucad/rpc": "workspace:*",
+    "@taucad/types": "workspace:*",
+    "@taucad/units": "workspace:*",
+    "@taucad/utils": "workspace:*",
     "@taucad/tau-examples": "workspace:*",
+    "@arethetypeswrong/core": "catalog:",
+    "publint": "catalog:",
+    "vitest-mock-extended": "catalog:",
     "geist": "catalog:",
     "vite": "catalog:",
     "vitest": "catalog:"
   },
```

## README Audit

The current README (186 lines) covers the core lifecycle and most subpaths but misses several conventions that make a flagship multi-kernel runtime discoverable on npm. The full target structure:

```markdown
# @taucad/runtime

[badges: npm version | downloads/month | size | license MIT | provenance]

> Multi-kernel CAD runtime for browser and Node.js. One client, many kernels.

`@taucad/runtime` powers [tau.new](https://tau.new). It is the shared engine
across the editor, the CLI, headless test suites, and AI agents.

## Why @taucad/runtime?

- **Six built-in kernels** — Replicad, OpenCascade, Manifold, JSCAD, Zoo, Tau.
- **Pluggable transports** — same client over in-process, web worker,
  Node `worker_threads`, or your own custom transport.
- **Pluggable middleware** — parameter caching, geometry caching, glTF
  coordinate transforms, edge detection — or write your own.
- **Pluggable transcoders** — convert between glTF, STEP, STL, IGES, USDZ,
  3MF, OBJ, and more without per-kernel branching.
- **Standalone install** — bundles every workspace dependency; you install
  one package and get the whole runtime.

## Installation

\`\`\`bash
npm install @taucad/runtime

# or

pnpm add @taucad/runtime

# or

yarn add @taucad/runtime
\`\`\`

WASM-bearing kernels (Replicad, OpenCascade, Manifold, Zoo) ship as part of
the package. No additional runtime install required.

## Quick start (Node)

[existing code, plus a `createNodeClient` variant]

## Quick start (Browser + Vite)

\`\`\`typescript
// vite.config.ts
import { defineConfig } from 'vite';
import { runtime } from '@taucad/runtime/vite';

export default defineConfig({ plugins: [runtime()] });
\`\`\`

Then the same `createRuntimeClient` snippet works in the browser.

## Built-in kernels

| Kernel        | Source language | Async | WASM | Exports                 |
| ------------- | --------------- | ----- | ---- | ----------------------- |
| `replicad`    | TypeScript      | Yes   | Yes  | glb, gltf, step, stl, … |
| `opencascade` | TypeScript      | Yes   | Yes  | step, glb, …            |
| `manifold`    | TypeScript      | Yes   | Yes  | glb, 3mf, …             |
| `jscad`       | TypeScript      | No    | No   | stl, gltf               |
| `zoo`         | KCL             | Yes   | Yes  | glb, step               |
| `tau`         | TypeScript      | No    | No   | glb                     |

(license details, where applicable, in dedicated section)

## The lifecycle

[existing content — keep]

## Lifecycle states

[existing table — keep]

## Subpath exports

| Subpath                                  | Environment     | Purpose                                                               |
| ---------------------------------------- | --------------- | --------------------------------------------------------------------- |
| `@taucad/runtime`                        | Browser + Node  | Public client surface, connectors, types, error classes.              |
| `@taucad/runtime/kernels`                | Browser + Node  | Built-in kernel plugin factories (`replicad`, `openscad`, …).         |
| `@taucad/runtime/transport`              | Browser + Node  | Author API for custom transports.                                     |
| `@taucad/runtime/transport/web`          | Browser only    | `webWorkerTransport` — browser `Worker` host.                         |
| `@taucad/runtime/transport/node`         | Node only       | `nodeWorkerTransport` — `node:worker_threads` host.                   |
| `@taucad/runtime/transport/in-process`   | Browser + Node  | `inProcessTransport` — same-isolate transport.                        |
| `@taucad/runtime/worker/web`             | Browser only    | Web Worker entry point (use via `new URL(..., import.meta.url)`).     |
| `@taucad/runtime/worker/node`            | Node only       | `worker_threads` entry point.                                         |
| `@taucad/runtime/filesystem`             | Browser + Node  | `fromMemoryFs`, `fromBrowserFs`, file primitives.                     |
| `@taucad/runtime/filesystem/node`        | Node only       | `fromNodeFs`.                                                         |
| `@taucad/runtime/filesystem/browser`     | Browser only    | `fromBrowserFs`.                                                      |
| `@taucad/runtime/middleware`             | Browser + Node  | Built-in middleware (parameter cache, geometry cache, file resolver). |
| `@taucad/runtime/testing`                | Node only       | `createMockRuntimeClient`, kernel testing utilities.                  |
| `@taucad/runtime/node`                   | Node only       | `createNodeClient` for headless/CLI usage.                            |
| `@taucad/runtime/vite`                   | Build-time only | One-line Vite plugin for the runtime invariants.                      |
| `@taucad/runtime/rolldown`               | Build-time only | One-line Rolldown plugin for the runtime invariants.                  |
| `@taucad/runtime/react-router`           | Build-time only | One-line React Router v7 plugin.                                      |
| `@taucad/runtime/cross-origin-isolation` | Build-time only | COOP/COEP header helpers.                                             |

## Transports

[existing content]

## Versioning & stability

`@taucad/runtime` follows [SemVer](https://semver.org). While the package is
below `1.0.0`, minor versions may include breaking changes — pin to the
exact minor (`^0.X.0` → `~0.X.0`) for stability. The API stabilises at v1.0.

See [docs/policy/release-policy.md](https://github.com/taucad/tau/blob/main/docs/policy/release-policy.md)
for the full versioning and release strategy.

## Security & provenance

Every release is published with [npm provenance](https://docs.npmjs.com/generating-provenance-statements)
via GitHub Actions OIDC. Verify the signing chain:

\`\`\`bash
npm audit signatures
\`\`\`

## License

MIT. Bundled dependencies retain their original licenses — see
`dist/LICENSES.txt` in the published tarball for a per-dep manifest.

## Links

- [Documentation](https://tau.new/docs/runtime)
- [Source](https://github.com/taucad/tau)
- [Changelog](https://github.com/taucad/tau/blob/main/packages/runtime/CHANGELOG.md)
- [Issue tracker](https://github.com/taucad/tau/issues)
- [Discussions](https://github.com/taucad/tau/discussions)
```

The diff against the current README is mostly additive: keep all existing prose, add badges, install snippet, kernels table, environment-aware subpath table, versioning policy, security note, and links section.

## References

- Prior art on the plugin-chunk contract: `docs/research/runtime-zero-config-bundling.md`
- Versioning and CI publish flow: `docs/policy/release-policy.md`, `docs/policy/version-policy.md`
- Library-shape conventions: `docs/policy/library-api-policy.md`
- tsdown deps namespace (March 2026): [tsdown.dev/options/dependencies](https://tsdown.dev/options/dependencies)
- tsdown unbundle mode: [tsdown.dev/options/unbundle](https://tsdown.dev/options/unbundle)
- tsdown publint + attw integration: [tsdown.dev/options/lint](https://tsdown.dev/options/lint)
- tsdown auto-generated exports (experimental): [tsdown.dev/options/package-exports](https://tsdown.dev/options/package-exports)
- Workspace-package bundling regression (closed Dec 2025): [rolldown/tsdown#544](https://github.com/rolldown/tsdown/issues/544)
- npm publishing best practices May 2026: [pkgpulse.com/guides/publishing-npm-package-complete-guide-2026](https://www.pkgpulse.com/guides/publishing-npm-package-complete-guide-2026)
- attw resolution profiles: [arethetypeswrong.github.io](https://arethetypeswrong.github.io/)
- publint rules: [publint.dev](https://publint.dev/)

## Appendix A: Dependency Classification Matrix

Every entry in the current `packages/runtime/package.json#dependencies` classified.

| Package                      | Today                                             | Bucket              | Action                                                                                                 |
| ---------------------------- | ------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------ |
| `@gltf-transform/core`       | `catalog:` (4.3+)                                 | B. runtime dep      | Keep                                                                                                   |
| `@gltf-transform/extensions` | `catalog:`                                        | B. runtime dep      | Keep                                                                                                   |
| `@gltf-transform/functions`  | `catalog:`                                        | B. runtime dep      | Keep                                                                                                   |
| `@jscad/modeling`            | `catalog:` (2.13+)                                | B. runtime dep      | Keep — required for jscad kernel even if user doesn't use it (tree-shaken at consumer)                 |
| `@kittycad/lib`              | `catalog:` (2.0.48+)                              | B. runtime dep      | Keep — zoo kernel                                                                                      |
| `@msgpack/msgpack`           | `catalog:`                                        | B. runtime dep      | Keep                                                                                                   |
| `@taucad/converter`          | `workspace:*`                                     | A. bundle into dist | Move to `devDependencies`; bundle via `deps.alwaysBundle`                                              |
| `@taucad/filesystem`         | `workspace:*`                                     | A. bundle           | Same                                                                                                   |
| `@taucad/json-schema`        | `workspace:*`                                     | A. bundle           | Same                                                                                                   |
| `@taucad/kcl-wasm-lib`       | `catalog:` (0.1.148, published)                   | B. runtime dep      | Keep — externally published                                                                            |
| `@taucad/memory`             | `workspace:*`                                     | A. bundle           | Same                                                                                                   |
| `@taucad/rpc`                | `workspace:*`                                     | A. bundle           | Same                                                                                                   |
| `@taucad/types`              | `workspace:*` (`private: true`)                   | A. bundle           | Same — never publishable                                                                               |
| `@taucad/utils`              | `workspace:*`                                     | A. bundle           | Same — pulls in `@taucad/units` (also bundle)                                                          |
| `cdn-resolve`                | `catalog:`                                        | B. runtime dep      | Keep                                                                                                   |
| `culori`                     | `catalog:`                                        | B. runtime dep      | Keep                                                                                                   |
| `deepmerge`                  | `catalog:`                                        | B. runtime dep      | Keep                                                                                                   |
| `es-module-lexer`            | `catalog:`                                        | B. runtime dep      | Keep                                                                                                   |
| `esbuild-wasm`               | `catalog:`                                        | B. runtime dep      | Keep                                                                                                   |
| `json-schema-default`        | `catalog:`                                        | B. runtime dep      | Keep                                                                                                   |
| `manifold-3d`                | `catalog:`                                        | B. runtime dep      | Keep                                                                                                   |
| `opencascade.js`             | `file:../../tarballs/opencascade-fork/...`        | C. tarball          | Replace with `npm:@taucad/opencascade.js@^3.0.0-beta` (published)                                      |
| `replicad`                   | `file:../../tarballs/replicad-fork/...`           | C. tarball          | Publish `@taucad/replicad` to npm, alias `npm:@taucad/replicad@^<version>`                             |
| `replicad-opencascadejs`     | `npm:@taucad/replicad-opencascadejs@0.21.0-v8.57` | C. already aliased  | Keep                                                                                                   |
| `source-map-js`              | `catalog:`                                        | B. runtime dep      | Keep                                                                                                   |
| `type-fest`                  | `catalog:`                                        | B. runtime dep      | Keep                                                                                                   |
| `uint8array-extras`          | `catalog:`                                        | B. runtime dep      | Keep                                                                                                   |
| `uzip`                       | `catalog:`                                        | B. runtime dep      | Keep                                                                                                   |
| `vitest-mock-extended`       | `catalog:`                                        | E. drop             | Move to `devDependencies` — test-only, currently mis-categorised                                       |
| `ws`                         | `catalog:`                                        | F. drop / optional  | Use Node 22+ global `WebSocket` (zoo kernel); move `ws` to `optionalDependencies` if Node 18 supported |
| `zod`                        | `catalog:`                                        | B. runtime dep      | Keep                                                                                                   |

## Appendix B: Final tsdown.config.ts

See `## Code Examples` → "Recommended `packages/runtime/tsdown.config.ts`" above.

## Appendix C: Final package.json shape

See `## Code Examples` → "Recommended `package.json` diff" above. The full final shape combines the current 32-subpath `exports` + `publishConfig.exports` map (unchanged) with the dependency reorganisation and the new `engines`, `sideEffects`, and `scripts.prepublishOnly` fields.
