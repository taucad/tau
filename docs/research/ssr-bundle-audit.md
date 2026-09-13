---
title: 'SSR Bundle Audit: Apps/UI Netlify Function Weight Decomposition'
description: 'Forensic decomposition of the 22 MB apps/ui SSR Function bundle on Netlify, identifying sourcemap shipment, workspace-package internalisation, and kernel/worker chunk leakage as the three dominant contributors with prioritised remediation toward a <5 MB target.'
status: draft
created: '2026-05-06'
updated: '2026-05-21'
category: audit
related:
  - docs/policy/ssr-bundle-policy.md
  - docs/research/netlify-production-performance-audit.md
  - docs/research/runtime-cross-origin-isolation-distribution.md
  - docs/research/runtime-zero-config-bundling.md
---

# SSR Bundle Audit: Apps/UI Netlify Function Weight Decomposition

Forensic decomposition of the `apps/ui` SSR Function bundle that Netlify deploys to **`us-east-2`** (single region per site — see [`netlify-multi-region-functions.md`](../architecture/netlify-multi-region-functions.md)). Quantifies what the 22 MB of bytes actually contains, traces each large chunk back to the `app/` source that pulls it in, and ranks remediations by reclaimable bytes per unit of effort.

## Executive Summary

The deployed SSR Function is **22 MB unzipped** (44% of Netlify's 50 MB hard limit), composed of **12.2 MB of source maps (55%) plus 9.7 MB of JavaScript across 158 chunks (45%)**. Three architectural antipatterns produce the bulk of those 9.7 MB of JS:

1. **Source maps ship in the deployed Function** (12.2 MB) — Vite's `build.sourcemap: true` writes `.map` files alongside JS in `build/server/`, and the Netlify Function packager uploads everything in that directory. SSR stack traces don't read them at runtime.
2. **All `@taucad/*` workspace packages are bundled into the SSR output** (~1.7 MB+ in the two `src-*.js` chunks) — Vite's default treats workspace packages as in-tree source rather than externals, so `@taucad/runtime`, `@taucad/converter`, `@taucad/assimpjs/dist/assimpjs-all.js`, `@taucad/fs-client/*`, `@taucad/react` all land in the Function.
3. **Every route that statically imports `@taucad/runtime` (44 files in `app/`) cascades 33 kernel chunks + 3 worker chunks + ~30 supporting middleware/transcoder/bundler chunks into the SSR build** — even though SSR never executes them. The `new URL('<kernel>.kernel.js', import.meta.url)` chunk-emit pattern in `packages/runtime/src/kernels/*/[name].plugin.ts` is correct for the worker bootstrap, but Vite mirrors the asset emit into the SSR `build/server/assets/` tree alongside the client.

A pure config change (R1: disable SSR sourcemap shipment + R2: externalise workspace packages) reclaimed the bulk of the sourcemap + duplication overhead. A **2026-05-06 local `pnpm nx build ui` measurement** lands at **~10 MB** for `build/server/` ( **`index.js` ~2.5 MB** ), down from the **22 MB / 3.4 MB `index.js`** baseline recorded in this doc — short of the ≤5 MB stretch goal (R7 / further decoupling still open). Multi-region cold-start planning should budget against the **current** measured tarball, not the original 22 MB headline.

## P1 follow-up status (2026-05-06)

| Rec        | Status                      | Notes                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1         | **Resolved**                | Server maps not shipped: no global `build.sourcemap: true`; `react-router build --sourcemapClient hidden` only. Rolldown rejects `build.sourcemap: false` / `--sourcemapServer false` for the SSR environment — omit SSR `sourcemap` instead of forcing boolean false.                                                                                                                    |
| R2         | **Resolved**                | Hybrid `ssr.external` in `apps/ui/vite.config.ts`: **only** `@taucad/runtime` and `@taucad/openscad` (packages with static `new URL('./<file>.js', import.meta.url)` chunk-emit patterns). Other `@taucad/*` workspace deps bundle into the SSR output for portability across Node Function hosts. Concrete audit command is copied in the `vite.config.ts` comment above `ssr.external`. |
| R3         | **Resolved**                | `createRuntimeClient` / `fromChannelFs` via `import()` in `connectKernelActor`. Kernel options use a required `LazyKernelOptionsFactory` (`kernel-options.presets.ts`: `defaultKernelOptions` / `debugKernelOptions` thunks that dynamically import `kernel-worker.constants`) so SSR does not static-pull the editor kernel graph.                                                       |
| R4         | **Partial**                 | `kernel-monaco-extensions.constants.test.ts` asserts `kernelSourceExtensionsById` stays aligned with `defaultKernels`. `kernel-monaco-language.utils.ts` uses the static map + `@taucad/converter/formats`. Full Appendix C sweep (MDX examples, etc.) remains.                                                                                                                           |
| R5–R6      | **Resolved**                | Docs Replicad reference + auth splashback behind `lazy()` + `Suspense` (see `docs-mdx.tsx`, `auth.$/route.tsx`).                                                                                                                                                                                                                                                                          |
| R7         | **Open**                    | Three.js / `graphics/three` lazy-split was prototyped and **reverted** (no `du`/`index.js` win). Hybrid `ssr.external` + lazy kernel-options thunks keep the runtime/Worker chunk cascade and `index.js` cold-parse surface in check; revisit a Three.js split only if a route pulls the viewer into the SSR critical path.                                                               |
| R8 (audit) | **Resolved**                | `rollup-plugin-visualizer` gated on `STATS=1`.                                                                                                                                                                                                                                                                                                                                            |
| R9         | **Resolved (intermediate)** | `pnpm nx run ui:size` (after `ui:build`) gates **`build/server`** at **11 MiB** and **`index.js`** at **3 MiB**. Current build ~**10.1 MiB** dir, **`index.js` ~2.5 MiB**. Stretch ≤5 MB total blocked by other static imports.                                                                                                                                                           |
| R10        | **Resolved**                | [`docs/policy/ssr-bundle-policy.md`](../policy/ssr-bundle-policy.md).                                                                                                                                                                                                                                                                                                                     |

## Incident: 2026-05-21 — Monaco rename participant SSR regression

**Symptom.** `pnpm nx build ui` failed during the React Router v7 server build:

```
[plugin react-router]
TypeError: Unknown file extension ".css" for
  /Users/.../node_modules/.pnpm/monaco-editor@0.55.1/node_modules/
  monaco-editor/esm/vs/base/browser/ui/codicons/codicon/codicon.css
```

**Smoking gun.** R17's TS file-rename participant added a static value import at the top of [`apps/ui/app/hooks/use-monaco-model-service.tsx`](../../apps/ui/app/hooks/use-monaco-model-service.tsx):

```ts
import { registerTsFileRenameParticipant } from '#lib/monaco-typescript-extras/register-materializing-typescript-providers.js';
```

That hook is statically imported by the route module `apps/ui/app/routes/projects_.$id/route.tsx` (via `MonacoModelServiceProvider`). The register module value-imports `monaco-editor/esm/vs/language/typescript/languageFeatures.js`, whose subgraph reaches `codicon.css`. Rolldown traces the static graph (not effect bodies), so the entire Monaco TS-language chain landed in `build/server` even though the runtime call lives inside `useEffect`.

**Class of bug.** Implicit "client-only by convention" boundaries — e.g. `monaco.lib.ts` being treated as client-only because _most_ importers were `.client` files — were one careless import away from re-triggering the same failure.

**Resolution.** Two-layer defence wired in this commit:

1. Every module under `apps/ui/app/` with a static value import of `monaco-editor` or `monaco-editor/esm/*` was renamed to `*.client.{ts,tsx}` so React Router v7's server build replaces it with empty exports:
   - `lib/monaco.lib.ts` → `monaco.lib.client.ts`
   - `lib/monaco-typescript-extras/register-materializing-typescript-providers.ts` → `*.client.ts`
   - `lib/monaco-typescript-extras/materializing-lib-files.ts` → `*.client.ts`
   - `lib/monaco-typescript-extras/materializing-rename-adapter.ts` → `*.client.ts`
   - `lib/monaco-typescript-extras/tau-ts-definition-adapters.ts` → `*.client.ts`
   - `lib/monaco-typescript-extras/tau-call-hierarchy-bridge.ts` → `*.client.ts`
   - `lib/monaco-typescript-extras/tau-workspace-symbol-search.ts` → `*.client.ts`
2. A `no-restricted-imports` block in [`eslint.config.mjs`](../../eslint.config.mjs) forbids static value imports of `monaco-editor` / `monaco-editor/*` from any `apps/ui/app/**` source file that is not `*.client.{ts,tsx}`, `*.worker.ts`, or a test. `allowTypeImports: true` keeps `import type * as Monaco from 'monaco-editor'` legal everywhere.

The two defences are independent: even if the lint rule is bypassed via `eslint-disable`, the `.client` runtime guarantee still terminates the static graph at the server boundary. See policy rule #7 in [`docs/policy/ssr-bundle-policy.md`](../policy/ssr-bundle-policy.md).

## Table of Contents

1. [Problem Statement](#problem-statement)
2. [Methodology](#methodology)
3. [Baseline Measurements](#baseline-measurements)
4. [Findings](#findings)
5. [Recommendations](#recommendations)
6. [Trade-offs](#trade-offs)
7. [Code Examples](#code-examples)
8. [References](#references)
9. [Appendix](#appendix)

## Problem Statement

The parent audit ([`netlify-production-performance-audit.md`](netlify-production-performance-audit.md)) Finding 4 / R9 flagged the 22 MB SSR Function bundle as a P1 risk: it gates safe multi-region rollout (each region pays its own cold start, scaling linearly with bundle size), threatens the 50 MB hard limit, and was measured to produce a **24.84 s cold-start TTFB** on shot 1 of the homepage from a Sydney POP. We need to know exactly what's in the bundle before deciding which trims to attempt and in what order.

### Scope and Non-Goals

**In scope**: byte composition of `apps/ui/build/server/` after `pnpm nx build ui`, attribution of each chunk back to the `app/` source that pulled it in, prioritised remediations.

**Out of scope**: client bundle (`build/client/` is 303 MB but is served lazily and content-addressed; covered by [`homepage-time-to-interactive-analysis.md`](homepage-time-to-interactive-analysis.md)). WASM payload size (separate kernel-build workstreams). Cold-start latency mechanics beyond bundle size (Lambda init, Node.js module-load cost — separate investigation).

## Methodology

| Source                                                                 | What was inspected                                                                                |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `du -sh apps/ui/build/server` and `du -ah \| sort -hr`                 | Aggregate + per-file sizes after `pnpm nx build ui`                                               |
| `find build/server -name '*.map'` vs `-name '*.js' -not -name '*.map'` | Sourcemap vs JS byte split                                                                        |
| `ls build/server/assets/ \| rg <pattern>`                              | Chunk classification (kernel, worker, MDX, support)                                               |
| `head -3 build/server/assets/<chunk>.js`                               | Chunk identity via top-of-file imports                                                            |
| `rg -ao 'sourceMappingURL=' <chunk>`                                   | Confirmation the map is referenced                                                                |
| `strings <chunk> \| rg -ao '@taucad/[^"\\x27 ]+'`                      | Workspace-package surface inside opaque chunks                                                    |
| `rg -l "from '@taucad/runtime" apps/ui/app/`                           | Static value-import footprint of the runtime                                                      |
| `rg -lP "^import.*from 'three(/\|')" apps/ui/app/`                     | Three.js consumer surface                                                                         |
| `rg -l "ClientOnly" apps/ui/app/`                                      | Existing client-only deferral pattern usage                                                       |
| [`apps/ui/vite.config.ts`](../../apps/ui/vite.config.ts)               | `ssr.noExternal`, `build.sourcemap`, plugin order                                                 |
| [`apps/ui/app/entry.server.tsx`](../../apps/ui/app/entry.server.tsx)   | Direct SSR entry import surface                                                                   |
| `apps/ui/stats.html` (rollup-plugin-visualizer)                        | 929 KB visualizer artefact for spot-check (not the source of truth — table-derived numbers above) |

All measurements taken from the existing `apps/ui/build/server/` produced by the deploy artifact landed at Netlify deploy `nain@375e232` (same timestamp as the deployed Function). No fresh build was required to interpret the output.

## Baseline Measurements

### Aggregate sizes

| Metric                               | Bytes                     |
| ------------------------------------ | ------------------------- |
| `build/server/` total                | **22 MB**                 |
| Source maps (`*.map`)                | **12.2 MB** (55%)         |
| JavaScript (`*.js`, no maps)         | **9.7 MB** (45%)          |
| `build/server/index.js` (main entry) | 3.4 MB                    |
| `build/server/index.js.map`          | 5.2 MB                    |
| `build/server/assets/` (158 chunks)  | 14 MB raw / ~6 MB JS-only |

### Top 10 largest JS chunks (excluding maps)

| Chunk                                  | Size   | Identity (top-of-file imports)                                                                                                            |
| -------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `index.js`                             | 3.4 MB | Main SSR entry — all React components statically reachable from routes                                                                    |
| `assets/src-DIpOskfi.js`               | 936 KB | Workspace package barrel: `@taucad/converter`, `@taucad/fs-client/*`, `@taucad/react`, `@taucad/runtime/*`, `@taucad/types`               |
| `assets/src-YIsqPQg6.js`               | 760 KB | Workspace package barrel: `@taucad/assimpjs/dist/assimpjs-all.js`, `@taucad/assimpjs/dist/assimpjs-exporter.js` (assimp WASM ZIP harness) |
| `assets/search-default-BEpSpjAY.js`    | 396 KB | Fumadocs search index (built from `remark` + `zwitch`)                                                                                    |
| `assets/types-Bi37iqjz.js`             | 304 KB | Shared `@taucad/types` runtime portions                                                                                                   |
| `assets/client-DKKuT1cf.js`            | 300 KB | Cookie/theme/Tooltip/Button shared chunk imported by `src-*`                                                                              |
| `assets/custom-kernel-CPaPGIkE.js`     | 180 KB | Docs MDX page: `runtime/guides/custom-kernel`                                                                                             |
| `assets/filesystem-oSapfdzk.js`        | 152 KB | `@taucad/runtime/filesystem` (channel/browser/node/handle variants)                                                                       |
| `assets/error-handling-BOSXsqCU.js`    | 144 KB | Docs MDX page                                                                                                                             |
| `assets/custom-middleware-D4aGlrDi.js` | 144 KB | Docs MDX page                                                                                                                             |

### Chunk-class inventory

| Class                                                          | Count   | Examples                                                                                                                                                                                                                   |
| -------------------------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Total `.js` chunks (no maps)                                   | **158** | —                                                                                                                                                                                                                          |
| Kernel chunks                                                  | **33**  | `replicad.kernel-*.js`, `opencascade.kernel-*.js`, `manifold.kernel-*.js`, `jscad.kernel-*.js`, `openscad.kernel-*.js`, `zoo.kernel-*.js`, `tau.kernel-*.js`, `custom-kernel-*.js`, plus `*-kernel-*` schema/helper splits |
| Worker chunks                                                  | **3**   | `kernel-runtime-worker-*.js` (runtime worker entry), `object-store.worker-*.js`, `file-manager.worker-*.js`, `import.worker-*.js` (4 files but `import.worker` counted in helpers)                                         |
| MDX content (Fumadocs `/docs/*` + `/llms.mdx/*` source pages)  | **65**  | `your-first-kernel-*.js`, `live-rendering-*.js`, `bundler-configuration-*.js`, `cross-origin-isolation-*.js`, etc.                                                                                                         |
| Other (workspace barrels, runtime support, React Router infra) | **~57** | `src-*.js`, `client-*.js`, `types-*.js`, `filesystem-*.js`, middleware/transcoder factories                                                                                                                                |

### Duplicated chunks (same source, two outputs)

The build emits paired `*-<hashA>.js` AND `*-<hashB>.js` for the same source modules — symptom of the same module landing in both the SSR graph and the worker graph (Vite emits separate chunks per Rollup environment):

| Pair                                                                      | Same source                                                          |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `kernel-runtime-worker-COSF3Z6d.js` + `kernel-runtime-worker-ChrSz_m2.js` | `packages/runtime/src/worker/web.ts` (the worker bootstrap)          |
| `your-first-kernel-ByMSRvH1.js` + `your-first-kernel-RGOaRnG4.js`         | `apps/ui/content/docs/runtime/getting-started/your-first-kernel.mdx` |
| `kernel-selection-A2fDukkc.js` + `kernel-selection-Bgg2QcAr.js`           | Same MDX page                                                        |
| `custom-kernel-CPaPGIkE.js` + `custom-kernel-S79WwjbC.js`                 | Same MDX page                                                        |
| `kernels-DOeDW7AX.js` + `kernels-dA2pIGpE.js`                             | Same MDX page                                                        |
| `testing-kernels-CBTLgFs_.js` + `testing-kernels-Dr3PUvTZ.js`             | Same MDX page                                                        |
| `choosing-a-kernel-OlR1jtn8.js` + `choosing-a-kernel-ClM4dFyX.js`         | Same MDX page                                                        |

## Findings

### Finding 1: Source maps account for 55% of the deployed Function bytes

**Severity**: P0 — single largest reclaimable contribution; zero refactoring risk.

`apps/ui/vite.config.ts` sets `build.sourcemap: true` unconditionally:

```ts
// apps/ui/vite.config.ts
build: {
  sourcemap: true,
  // ...
},
```

This emits `.map` files into both `build/client/` (where they are useful for browser DevTools and not in the Function package) AND `build/server/` (where they are useful for SSR stack traces during local development but not in production — Node.js does not consume `.map` files at runtime unless `--enable-source-maps` is passed AND the maps live next to the JS). The Netlify Functions packager uploads the entire `build/server/` directory.

Concrete contributions:

```
build/server/index.js.map               5.2 MB
build/server/assets/src-DIpOskfi.js.map 1.5 MB
build/server/assets/src-YIsqPQg6.js.map 1.1 MB
build/server/assets/search-default-*.js.map  744 KB
build/server/assets/object-store.worker-*.js.map  460 KB
build/server/assets/file-manager.worker-*.js.map  384 KB
build/server/assets/advanced-*.js.map           268 KB
build/server/assets/jszip.min-*.js.map          208 KB
build/server/assets/remark-*.js.map             196 KB
build/server/assets/kernel-runtime-worker-*.js.map  180 KB
build/server/assets/opencascade_full-*.js.map   160 KB
build/server/assets/zoo.kernel-*.js.map         156 KB
build/server/assets/create-runtime-filesystem-*.js.map  148 KB
... (long tail, ~40 more *.map files >50 KB each)
```

Total `.map` bytes in `build/server/`: **12.2 MB** measured directly via:

```bash
find apps/ui/build/server -name '*.map' -print0 | xargs -0 stat -f%z | awk '{s+=$1} END {printf "%.1f MB\n", s/1024/1024}'
```

### Finding 2: Workspace `@taucad/*` packages are bundled inline rather than externalised

**Severity**: P0 — large reclaimable contribution; mostly config, low refactoring risk.

`apps/ui/vite.config.ts` declares only three explicit `ssr.noExternal` entries:

```ts
ssr: {
  noExternal: ['@headless-tree/core', '@headless-tree/react', 'posthog-js'],
},
```

It does NOT declare `ssr.external`. Vite's default for SSR builds is to externalise installed `node_modules` deps (those are `require()`d at runtime from disk) BUT to inline workspace packages — because they are typically TS source rather than pre-built JS, and Vite has no signal to externalise them. The two large `src-*.js` chunks confirm this: `strings build/server/assets/src-DIpOskfi.js | rg -ao '@taucad/[^" ]+' | sort -u` returns 22 distinct workspace subpaths (full inventory in [Appendix B](#b-workspace-packages-bundled-into-the-ssr-function)).

The smoking-gun chunk for assimp:

```
build/server/assets/src-YIsqPQg6.js (760 KB):
  @taucad/assimpjs/dist/assimpjs-all.js
  @taucad/assimpjs/dist/assimpjs-exporter.js
```

`@taucad/assimpjs` is the Emscripten-compiled assimp WASM harness used by `@taucad/converter` for client-side and worker-side CAD format conversion. It has zero SSR purpose. It lands in the Function only because something in the SSR graph statically imports `@taucad/converter` which transitively pulls assimpjs.

### Finding 3: All 33 kernel chunks + 3 worker chunks are emitted into `build/server/assets/`

**Severity**: P0 — large reclaimable contribution; requires source refactoring.

Each runtime kernel uses the chunk-emit URL pattern to point the worker at its implementation:

```ts
// packages/runtime/src/kernels/replicad/replicad.plugin.ts:56
moduleUrl: new URL('replicad.kernel.js', import.meta.url).href,

// packages/runtime/src/kernels/tau/tau.plugin.ts:20
moduleUrl: new URL('tau.kernel.js', import.meta.url).href,

// + opencascade, manifold, jscad, openscad, zoo, custom kernels
```

This is the canonical pattern documented in [`runtime-zero-config-bundling.md`](runtime-zero-config-bundling.md): the worker bootstrap consumes the URL at runtime, the kernel implementation chunk lives next to it on disk, no per-consumer `new URL` boilerplate. **The pattern is correct for the client/worker bundle**.

The leak is that Vite mirrors the asset emit into the SSR build's `build/server/assets/` tree alongside `build/client/assets/`. The `tsModuleUrlPlugin` from `@taucad/vite` resolves `.ts` paths in `new URL` references at build time, and the React Router build wires both client and server outputs to share an asset tree — so any kernel referenced from the SSR graph emits its `.kernel.js` chunk into both trees.

The 44 files in `apps/ui/app/` that statically import `@taucad/runtime` (full list in [Appendix C](#c-app-files-importing-taucadruntime)) are the entry points pulling kernels into SSR. Most of them only need TYPE imports, but TypeScript's `import { type X, value }` pattern combined with Vite's SSR resolver still drags the value side in unless the import is split into a pure `import type` declaration.

The three worker entries (`kernel-runtime-worker`, `object-store.worker`, `file-manager.worker`, plus `import.worker`) similarly land in SSR via `new Worker(new URL(...))` references inside `apps/ui/app/machines/file-manager.machine.ts` and the `@taucad/runtime` transport layer.

### Finding 4: `apps/ui/app/machines/cad.machine.ts` value-imports `createRuntimeClient` and is reachable from every project route

**Severity**: P1 — single hotspot that explodes the SSR graph downstream.

```ts
// apps/ui/app/machines/cad.machine.ts:5
import { createRuntimeClient } from '@taucad/runtime';
import type { CapabilitiesManifest, ExportResult, ... } from '@taucad/runtime';
```

The `import type { ... }` block is correctly type-only. The `import { createRuntimeClient }` is the value pull. `cad.machine.ts` is imported by `file-manager.machine.ts`, which is imported by `use-file-manager.tsx`, which is wrapped around the `<App>` shell in `root.tsx`. So **every SSR'd route reaches `createRuntimeClient`**, and through it the runtime's transport, kernel registry, and middleware factories.

This is the load-bearing leak. Splitting the value import out of `cad.machine.ts` (e.g. inject `createRuntimeClient` via a `clientFactory` parameter on the machine actor input, materialised lazily on the client side only) breaks the SSR cascade for every route that doesn't itself consume the runtime.

### Finding 5: Docs `KernelModelView` + `ReplicadReference` pull Three.js + replicad kernel into the docs SSR graph

**Severity**: P2 — narrow blast radius (one MDX page) but high per-component weight.

[`apps/ui/app/components/docs/kernel-model-view.tsx`](../../apps/ui/app/components/docs/kernel-model-view.tsx) statically imports:

```ts
import { Scene, PerspectiveCamera, AmbientLight, DirectionalLight, Box3, Vector3 } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createRuntimeClientOptions } from '@taucad/runtime';
import { inProcessTransport } from '@taucad/runtime/transport/in-process';
import { fromMemoryFs } from '@taucad/runtime/filesystem';
import { replicad } from '@taucad/runtime/kernels';
import { esbuild } from '@taucad/runtime/bundler';
import { gltfCoordinateTransform } from '@taucad/runtime/middleware';
```

It is consumed by [`apps/ui/app/components/docs/replicad-reference.tsx`](../../apps/ui/app/components/docs/replicad-reference.tsx), which is rendered inside `'use client'` + `<ClientOnly>`. The `'use client'` directive is a Fumadocs/React-Server-Components convention — it does NOT prevent Vite from bundling the module on the SSR side. `<ClientOnly>` is a runtime guard, not a build-time one. Both signals are honoured at render time; Vite still resolves the static imports at build time.

Used by exactly one MDX page: `apps/ui/content/docs/runtime/concepts/interactive-architecture.mdx`.

### Finding 6: `apps/ui/app/routes/auth.$/splashback/auth-splashback.tsx` statically imports Three.js + jscad kernel

**Severity**: P2 — narrow blast radius (auth screens only).

The auth splashback is a heavy WebGL animation behind the login forms. It value-imports `@taucad/runtime`, `@taucad/runtime/transport/in-process`, `@taucad/runtime/filesystem`, `@taucad/runtime/kernels` (jscad), `@taucad/runtime/middleware`, `@taucad/runtime/bundler` — same pattern as `kernel-model-view.tsx`. Plus 10+ other splashback files importing `three` directly. None of these need SSR.

### Finding 7: 50+ files under `app/components/geometry/graphics/three/` statically import `three`

**Severity**: P3 — large surface, but the consumers are Three.js scene infrastructure that should never SSR.

The full Three.js scene/camera/material/controls/gizmo subsystem lives under `apps/ui/app/components/geometry/graphics/three/`. None of these modules need SSR; they only run inside `<ModelViewer>` mounted on the client. They land in the SSR bundle because their exports are statically imported by downstream consumers (e.g. `<ModelViewer>`, `controls-listener.machine.ts`, `screenshot-capability.machine.ts`) which are themselves reachable from project routes.

### Finding 8: Fumadocs MDX content (65 chunks) is legitimately in the SSR bundle but contributes ~3 MB

**Severity**: P3 — load-bearing for `/docs/*` SSR; treat as fixed cost.

Each `apps/ui/content/docs/**/*.mdx` page compiles to a separate Vite chunk (`your-first-kernel-*.js`, `live-rendering-*.js`, etc.). These are needed for `/docs/*` SSR (and for the prerender pass — see [`netlify-production-performance-audit.md`](netlify-production-performance-audit.md) R4). The doubled chunks ([Appendix A](#a-duplicated-chunks)) suggest some MDX modules also land in a separate worker graph, but the duplication is a Vite emit artefact rather than an authoring error.

Recommendation: leave alone unless docs grow >2× from current volume.

### Finding 9: `entry.server.tsx` itself is clean — only imports `applyHandleRequestHeaders` from `@taucad/runtime/react-router`

**Severity**: N/A — confirms the SSR entry is not the leak source.

```ts
// apps/ui/app/entry.server.tsx
import { createReadableStreamFromReadable } from '@react-router/node';
import { applyHandleRequestHeaders } from '@taucad/runtime/react-router';
import { isbot } from 'isbot';
import { renderToPipeableStream } from 'react-dom/server';
import { ServerRouter } from 'react-router';
```

`applyHandleRequestHeaders` is a tiny pure function. The leak is downstream, in the route + machine + hook graph reachable from `<ServerRouter>`.

### Finding 10: `rollup-plugin-visualizer` is enabled and produces `apps/ui/stats.html` (929 KB) on every build

**Severity**: P3 — costs build time, not runtime; useful for ongoing work but should be opt-in for CI.

`apps/ui/vite.config.ts` always includes `visualizer({...})` in the plugin list. The visualizer is invaluable for refactor work but adds build time and writes a 929 KB HTML report on each build. Could be gated behind an env var (`STATS=1 pnpm nx build ui`).

## Recommendations

| #   | Action                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Priority | Effort                                  | Reclaim                                                      | Risk                                                                                                 |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | --------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| R1  | Set `build.sourcemap` to `'hidden'` (or `false` for SSR specifically) so `.map` files are not emitted into `build/server/` and therefore not packaged into the Netlify Function. Browser DevTools sourcemaps for `build/client/` can stay.                                                                                                                                                                                                             | P0       | Trivial (1-line config)                 | **~12.2 MB**                                                 | None — Node SSR doesn't consume `.map` at runtime                                                    |
| R2  | Add an `ssr.external` allowlist for workspace packages that ship runnable JS via `node_modules` (`@taucad/runtime`, `@taucad/converter`, `@taucad/assimpjs`, `@taucad/types`, `@taucad/utils`, `@taucad/units`, `@taucad/json-schema`, `@taucad/fs-client/*`, `@taucad/react`). Verify each has a valid `exports`/`main` for Node consumption. Validate that Netlify's secondary esbuild pass resolves them at runtime by reading from `node_modules`. | P0       | Low (config + verify)                   | **~1.5–2.5 MB**                                              | Low — fail-safe revert is removing the entry; CI/build fails fast if a package isn't Node-resolvable |
| R3  | Convert `apps/ui/app/machines/cad.machine.ts`'s `createRuntimeClient` value-import into a factory injected at machine-spawn time on the client. Same for `file-manager.machine.ts` and any other machine that value-imports `@taucad/runtime`. Type imports stay.                                                                                                                                                                                      | P1       | Med (touches machine actor input shape) | **~3–4 MB** (cascades 33 kernel chunks + workers out of SSR) | Med — machine API change; test coverage must catch missed call sites                                 |
| R4  | Audit the 44 files in `apps/ui/app/` matching `from '@taucad/runtime` (Appendix C). For files that only need types, change `import { type X }` syntax to `import type { X }` (separate declaration). For files that need values (e.g. `chat-prompt-examples.ts` only uses `KernelProvider` as a type), change to `import type`.                                                                                                                        | P1       | Low (mechanical, file-by-file)          | **~0.5–1 MB**                                                | None                                                                                                 |
| R5  | Wrap `apps/ui/app/components/docs/replicad-reference.tsx` and `kernel-model-view.tsx` in a `lazy(() => import(...))` boundary at the consuming MDX layer (same pattern as `_index/hero-viewer-gate.tsx`). The `'use client'` directive alone does not prevent Vite SSR bundling.                                                                                                                                                                       | P2       | Low (one wrapper component)             | **~0.3 MB**                                                  | None — already uses `<ClientOnly>` at render time, so deferring the import is purely additive        |
| R6  | Lazy-load `apps/ui/app/routes/auth.$/splashback/auth-splashback.tsx` via `lazy()` in `auth.$/route.tsx`. The splashback is decorative; never SSR critical-path.                                                                                                                                                                                                                                                                                        | P2       | Low                                     | **~0.5–1 MB**                                                | None                                                                                                 |
| R7  | Decouple the Three.js scene subsystem (`app/components/geometry/graphics/three/**`) from SSR by routing all consumers through `<ClientOnly>` boundaries OR splitting `ModelViewer` into a server-safe shell + client-only Three.js implementation behind `lazy()`. Track byte impact via `du -sh build/server` per pass.                                                                                                                               | P2       | High (50+ consumer call sites)          | **~1–2 MB**                                                  | Med — refactor risk on the editor's hot path                                                         |
| R8  | Gate `rollup-plugin-visualizer` behind `process.env.STATS === '1'` so CI doesn't pay the cost on every build.                                                                                                                                                                                                                                                                                                                                          | P3       | Trivial                                 | Build time only, no runtime bytes                            | None                                                                                                 |
| R9  | Add a CI guard that `du -sh apps/ui/build/server` stays below an explicit budget (e.g. `< 8 MB` after R1+R2 land, ratcheted down as later Rs ship). Fails fast on regressions.                                                                                                                                                                                                                                                                         | P3       | Low (one shell check in CI)             | Prevents future regression                                   | None                                                                                                 |
| R10 | Document the SSR-leak antipatterns in [`docs/policy/library-api-policy.md`](../policy/library-api-policy.md) (or a new `docs/policy/ssr-bundle-policy.md`): "no value-imports of `@taucad/runtime` from machines/hooks reachable from `root.tsx`", "always wrap kernel-aware components in `lazy()` not just `<ClientOnly>`".                                                                                                                          | P3       | Low                                     | Prevents future regression                                   | None                                                                                                 |

### Suggested execution order

1. **R1** + **R2** in one PR — trivial config changes that together reclaim ~14 MB. Land before R3+ so byte deltas from the refactors are measurable against a clean baseline.
2. **R4** (mechanical type-import sweep) — file-by-file, easy review.
3. **R3** (machine refactor) — biggest single-source win after the config wins.
4. **R5** + **R6** (docs + auth splashback lazy boundaries) — independent, low-risk.
5. **R9** (CI byte-budget guard) — lock in the gains.
6. **R7** (Three.js subsystem decoupling) — schedule as a separate workstream; biggest blast radius.
7. **R8**, **R10** (cleanup, docs).

### Projected impact

| Phase                              | Bundle size | Function cold-start TTFB (homepage, Sydney POP, projected) |
| ---------------------------------- | ----------- | ---------------------------------------------------------- |
| Today (baseline)                   | 22 MB       | 24.84 s (measured shot 1)                                  |
| After R1 (sourcemap strip)         | ~10 MB      | ~12 s (size-linear estimate)                               |
| After R1+R2 (config wins)          | ~8 MB       | ~10 s                                                      |
| After R1–R4 (mechanical refactors) | ~5 MB       | ~6 s                                                       |
| After R1–R7 (full pass)            | ~3–4 MB     | ~3–4 s                                                     |

Cold-start projections are linear extrapolations from the bundle-size→cold-start curve documented in AWS Lambda Node runtime docs. Real measurements should drive the budget; targets above are coarse.

## Trade-offs

### Sourcemap strip (R1) vs runtime debugging

| Dimension               | Keep maps in SSR                                                                    | Strip maps from SSR                               |
| ----------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------- |
| Production stack traces | Resolve to original TS line numbers if Node was started with `--enable-source-maps` | Resolve to bundled JS line numbers; less readable |
| Function bytes          | +12.2 MB                                                                            | 0                                                 |
| Local dev experience    | Unchanged (dev server uses inline maps)                                             | Unchanged                                         |
| Recovery path           | Re-enable + redeploy                                                                | Re-enable + redeploy                              |

Verdict: ship with maps stripped; if a production crash needs source attribution, redeploy a one-off branch with maps enabled and reproduce.

### Workspace externalisation (R2) vs build-time bundling

| Dimension                    | Bundle workspace pkgs (today)   | Externalise + resolve from `node_modules`                              |
| ---------------------------- | ------------------------------- | ---------------------------------------------------------------------- |
| Function bytes               | +1.5–2.5 MB per package surface | 0 (deps live in `node_modules`, deduped across functions)              |
| Cold-start cost              | One-time bundle parse           | First-`require()`-per-package cost (negligible for ESM)                |
| Risk: missing dep on Netlify | None (bundled)                  | Real — must verify each `@taucad/*` is published OR workspace-resolved |
| Risk: ESM/CJS interop issues | Solved by Vite at build         | Surfaces at runtime if a dep is CJS-only                               |

Verdict: externalise progressively, one workspace package at a time, with a smoke test (`curl /` + `curl /v/<id>`) per addition.

### Machine refactor (R3) vs leave-as-is

| Dimension          | Leave `cad.machine.ts` value-importing `createRuntimeClient` | Inject factory at spawn time                        |
| ------------------ | ------------------------------------------------------------ | --------------------------------------------------- |
| Function bytes     | +3–4 MB cascading kernel/worker chunks                       | 0 — runtime never reaches SSR graph                 |
| Machine ergonomics | One import statement                                         | Slightly more setup at spawn site (one extra param) |
| Test impact        | None                                                         | Update test setup to provide the factory            |
| Risk of regression | None                                                         | Med — must catch every spawn site                   |

Verdict: do the refactor; the savings dominate the ergonomics cost.

## Code Examples

### R1: Strip SSR sourcemaps

```ts
// apps/ui/vite.config.ts
build: {
  // Browser DevTools maps stay in build/client/; SSR maps are not consumed
  // by Node at runtime and add 12 MB to the deployed Function.
  sourcemap: process.env['BUILD_TARGET'] === 'ssr' ? false : true,
  // ...
},
```

Or, more idiomatically, use Vite's per-build hook:

```ts
build: {
  sourcemap: ({ environment }) => environment === 'ssr' ? false : true,
  // ...
},
```

### R2: Externalise workspace packages

```ts
// apps/ui/vite.config.ts
ssr: {
  noExternal: ['@headless-tree/core', '@headless-tree/react', 'posthog-js'],
  external: [
    '@taucad/runtime',
    '@taucad/converter',
    '@taucad/assimpjs',
    '@taucad/fs-client/file-content-service',
    '@taucad/fs-client/file-system-client',
    '@taucad/fs-client/file-tree-service',
    '@taucad/fs-client/refresh-generation-guard',
    '@taucad/fs-client/visibility-provider',
    '@taucad/fs-client/worker-change-channel',
    '@taucad/fs-client/workspace-path-resolver',
    '@taucad/react',
    '@taucad/types',
    '@taucad/utils',
    '@taucad/units',
    '@taucad/json-schema',
  ],
},
```

Verify each package has a valid Node-resolvable `exports` map and that `apps/ui/package.json` declares it as a runtime dep (not just devDep) so Netlify's `pnpm install` provisions it.

### R3: Inject `createRuntimeClient` instead of value-importing it

```ts
// apps/ui/app/machines/cad.machine.ts (sketch — type-only top-of-file)
import type { CreateRuntimeClient, ... } from '@taucad/runtime';

export type CadInput = {
  createRuntimeClient: CreateRuntimeClient;
  // ...
};

export const cadMachine = setup({
  types: { context: {} as CadContext, input: {} as CadInput, ... },
  // ...
}).createMachine({
  context: ({ input }) => ({
    runtimeClient: input.createRuntimeClient({ /* ... */ }),
    // ...
  }),
});
```

Spawn site (client only):

```tsx
// e.g. apps/ui/app/hooks/use-cad-preview.tsx
import { createRuntimeClient } from '@taucad/runtime';
// ...
const actor = useActor(cadMachine, { input: { createRuntimeClient /* ... */ } });
```

### R4: Type-only imports

Before:

```ts
// apps/ui/app/constants/chat-prompt-examples.ts
import type { KernelProvider } from '@taucad/runtime';
//   ^ already type-only ✅
```

After (no change needed in this case — the file was already type-only). The sweep targets files like:

```ts
// apps/ui/app/routes/projects_.community/route.tsx
import type { KernelProvider } from '@taucad/runtime';
//   ^ already type-only ✅
```

The actual leak surface is files like `cad.machine.ts` (R3 covers the value side); R4 catches incidental `import { value, type X }` patterns flagged by the audit list in [Appendix C](#c-app-files-importing-taucadruntime).

### R5: Lazy boundary for docs Three.js components

```tsx
// apps/ui/app/components/docs/replicad-reference-gate.tsx
import { lazy, Suspense } from 'react';
import { ClientOnly } from '#components/ui/utils/client-only.js';
import { Loader } from '#components/ui/loader.js';

const ReplicadReferenceLazy = lazy(async () => {
  const m = await import('#components/docs/replicad-reference.js');
  return { default: m.ReplicadReference };
});

export function ReplicadReferenceGate(): React.JSX.Element {
  return (
    <ClientOnly>
      <Suspense fallback={<Loader />}>
        <ReplicadReferenceLazy />
      </Suspense>
    </ClientOnly>
  );
}
```

Update `apps/ui/content/docs/runtime/concepts/interactive-architecture.mdx` to import the gate, not the underlying component.

### R9: CI byte-budget guard

```bash
# .github/workflows/ci.yml (sketch)
- name: SSR bundle byte budget
  run: |
    SIZE=$(du -sb apps/ui/build/server | awk '{print $1}')
    BUDGET=8388608  # 8 MB after R1+R2
    if [ "$SIZE" -gt "$BUDGET" ]; then
      echo "SSR bundle $SIZE bytes exceeds budget $BUDGET bytes"
      exit 1
    fi
```

## References

- Vite SSR externals: [https://vite.dev/guide/ssr.html#ssr-externals](https://vite.dev/guide/ssr.html#ssr-externals)
- Node.js sourcemap support: [https://nodejs.org/api/cli.html#--enable-source-maps](https://nodejs.org/api/cli.html#--enable-source-maps)
- Netlify Functions size limit: [https://docs.netlify.com/functions/overview/](https://docs.netlify.com/functions/overview/) (50 MB unzipped)
- Related: [`docs/research/netlify-production-performance-audit.md`](netlify-production-performance-audit.md) — parent audit, R9 reference
- Related: [`docs/research/runtime-zero-config-bundling.md`](runtime-zero-config-bundling.md) — `new URL(..., import.meta.url)` chunk-emit pattern rationale
- Related: [`docs/research/runtime-cross-origin-isolation-distribution.md`](runtime-cross-origin-isolation-distribution.md) — runtime distribution model context

## Appendix

### A. Duplicated chunks

The build emits the same source module to two distinct chunks, once for the SSR graph and once for the worker graph. This is a Vite environment-emit artefact, not a regression to fix at the source level — it would resolve naturally if R3 removes the runtime/worker references from the SSR graph.

| Module                               | SSR chunk                           | Worker chunk                        |
| ------------------------------------ | ----------------------------------- | ----------------------------------- |
| `packages/runtime/src/worker/web.ts` | `kernel-runtime-worker-COSF3Z6d.js` | `kernel-runtime-worker-ChrSz_m2.js` |
| `your-first-kernel.mdx`              | `your-first-kernel-ByMSRvH1.js`     | `your-first-kernel-RGOaRnG4.js`     |
| `kernel-selection.mdx`               | `kernel-selection-A2fDukkc.js`      | `kernel-selection-Bgg2QcAr.js`      |
| `custom-kernel.mdx`                  | `custom-kernel-CPaPGIkE.js`         | `custom-kernel-S79WwjbC.js`         |
| `kernels` (barrel)                   | `kernels-DOeDW7AX.js`               | `kernels-dA2pIGpE.js`               |
| `testing-kernels.mdx`                | `testing-kernels-CBTLgFs_.js`       | `testing-kernels-Dr3PUvTZ.js`       |
| `choosing-a-kernel.mdx`              | `choosing-a-kernel-OlR1jtn8.js`     | `choosing-a-kernel-ClM4dFyX.js`     |

### B. Workspace packages bundled into the SSR Function

Extracted from `strings build/server/assets/src-DIpOskfi.js | rg -ao '@taucad/[^"\x27 ]+' | sort -u`:

```
@taucad/converter
@taucad/fs-client/file-content-service
@taucad/fs-client/file-system-client
@taucad/fs-client/file-tree-service
@taucad/fs-client/refresh-generation-guard
@taucad/fs-client/visibility-provider
@taucad/fs-client/worker-change-channel
@taucad/fs-client/workspace-path-resolver
@taucad/react
@taucad/runtime
@taucad/runtime/bundler
@taucad/runtime/filesystem
@taucad/runtime/filesystem/browser
@taucad/runtime/filesystem/handle
@taucad/runtime/filesystem/node
@taucad/runtime/kernels
@taucad/runtime/transcoder
@taucad/runtime/transport-internals
@taucad/runtime/transport/in-process
@taucad/runtime/transport
@taucad/types
```

Plus from `src-YIsqPQg6.js`:

```
@taucad/assimpjs/dist/assimpjs-all.js
@taucad/assimpjs/dist/assimpjs-exporter.js
```

### C. App files importing `@taucad/runtime`

The 44 files (some type-only, some value) reachable from the SSR graph today via `rg -l "from '@taucad/runtime" apps/ui/app/`. Marked `value` if a runtime symbol is value-imported (and therefore drags chunks); `type-only` if the file is already clean.

Production-code files (excluding tests):

| File                                                               | Kind                                                                   |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| `app/entry.server.tsx`                                             | value (`applyHandleRequestHeaders` from `/react-router` — narrow, OK)  |
| `app/machines/cad.machine.ts`                                      | **value** (`createRuntimeClient`, `fromChannelFs`) — Finding 4 hotspot |
| `app/machines/file-manager.machine.ts`                             | value — review for same pattern                                        |
| `app/machines/file-manager.worker.ts`                              | value (worker-side, expected)                                          |
| `app/middleware/parameter-file-resolver.middleware.ts`             | value                                                                  |
| `app/middleware/parameter-file-resolver.factory.ts`                | value                                                                  |
| `app/utils/kernel.utils.ts`                                        | type or value? — audit                                                 |
| `app/types/runtime-client.alias.ts`                                | type-only                                                              |
| `app/constants/kernel-worker.constants.ts`                         | value                                                                  |
| `app/constants/project-examples.ts`                                | type or value? — audit                                                 |
| `app/constants/chat-prompt-examples.ts`                            | type-only                                                              |
| `app/hooks/use-project-manager.tsx`                                | value (likely) — audit                                                 |
| `app/hooks/use-kernel.tsx`                                         | value                                                                  |
| `app/hooks/use-kernel-diagnostics.ts`                              | value                                                                  |
| `app/components/chat/chat-context-actions.tsx`                     | value                                                                  |
| `app/components/chat/kernel-selector.tsx`                          | value                                                                  |
| `app/components/chat/chat-kernel-selector.tsx`                     | value                                                                  |
| `app/components/docs/kernel-model-view.tsx`                        | value — Finding 5                                                      |
| `app/routes/_index/hero-viewer.tsx`                                | value (already lazy-gated, but Vite still bundles)                     |
| `app/routes/auth.$/splashback/auth-splashback.tsx`                 | value — Finding 6                                                      |
| `app/routes/projects_.new/route.tsx`                               | type-only                                                              |
| `app/routes/projects_.community/route.tsx`                         | type-only                                                              |
| `app/routes/projects_.library/route.tsx`                           | type-only                                                              |
| `app/routes/projects_.$id/export-formats.utils.ts`                 | type-only                                                              |
| `app/routes/projects_.$id/chat-message-tool-get-kernel-result.tsx` | type-only                                                              |
| `app/routes/projects_.$id/chat-kernel-utils.ts`                    | type-only                                                              |
| `app/routes/projects_.$id/chat-stack-trace.tsx`                    | type-only                                                              |
| `app/routes/projects_.$id/chat-kernel-types.ts`                    | type-only                                                              |
| `app/routes/projects_.$id/chat-kernel-traces.tsx`                  | type-only                                                              |

(Test files omitted — they don't ship to SSR.)

### D. Three.js consumer surface

50+ files under `apps/ui/app/components/geometry/graphics/three/` import `three` directly. Sample:

```
app/components/geometry/graphics/three/stage.tsx
app/components/geometry/graphics/three/use-camera-framing.ts
app/components/geometry/graphics/three/controls.tsx
app/components/geometry/graphics/three/actor-bridge.tsx
app/components/geometry/graphics/three/react/section-view-controls.tsx
app/components/geometry/graphics/three/react/lights.tsx
app/components/geometry/graphics/three/react/section-view.tsx
app/components/geometry/graphics/three/react/transform-controls-drei.tsx
app/components/geometry/graphics/three/react/gltf-mesh.tsx
app/components/geometry/graphics/three/react/axes-helper.tsx
app/components/geometry/graphics/three/react/measure-tool.tsx
app/components/geometry/graphics/three/scene-overlay.tsx
app/components/geometry/graphics/three/grid.tsx
app/components/geometry/graphics/three/up-direction-handler.tsx
app/components/geometry/graphics/three/use-camera-reset.tsx
app/components/geometry/graphics/three/materials/gltf-matcap.ts
app/components/geometry/graphics/three/utils/gizmo.utils.ts
app/components/geometry/graphics/three/utils/snap-detection.utils.ts
app/components/geometry/graphics/three/utils/lights.utils.ts
app/components/geometry/graphics/three/materials/infinite-grid-material.ts
app/components/geometry/graphics/three/materials/striped-material.ts
app/components/geometry/graphics/three/use-section-view.ts
app/components/geometry/graphics/three/utils/spatial.utils.ts
app/components/geometry/graphics/three/utils/rotation.utils.ts
app/components/geometry/graphics/three/materials/gltf-edges.ts
app/components/geometry/graphics/three/materials/matcap-material.ts
app/components/geometry/graphics/three/geometries/circle-geometry.ts
app/components/geometry/graphics/three/controls/viewport-gizmo-cube-axes.ts
app/components/geometry/graphics/three/controls/viewport-gizmo-cube.tsx
app/components/geometry/graphics/three/geometries/svg-geometry.ts
app/components/geometry/graphics/three/controls/viewport-gizmo-axes.tsx
app/components/geometry/graphics/three/controls/transform-controls.ts
app/components/geometry/graphics/three/geometries/rounded-rectangle-geometry.ts
app/components/geometry/graphics/three/geometries/label-geometry.ts
app/components/geometry/graphics/three/controls/viewport-gizmo-onshape.tsx
app/machines/controls-listener.machine.ts
app/components/geometry/graphics/three/geometries/font-geometry.ts
app/machines/screenshot-capability.machine.ts
app/components/docs/shared-renderer.tsx
app/components/docs/kernel-model-view.tsx
app/routes/auth.$/splashback/animated-group.tsx
app/routes/auth.$/splashback/use-preloaded-meshes.ts
app/routes/auth.$/splashback/morphing-points-material.ts
app/routes/auth.$/splashback/preview-gltf-mesh.tsx
app/routes/auth.$/splashback/point-sampler.ts
app/routes/auth.$/splashback/assembly-point-sampler.ts
app/routes/auth.$/splashback/morphing-points.tsx
app/routes/auth.$/splashback/gltf-loader.ts
app/routes/auth.$/splashback/use-sampled-points.ts
app/routes/auth.$/splashback/unified-splashback-viewer.tsx
app/routes/auth.$/splashback/split-morphing-points.tsx
```

These are all client-only by intent; the leak path is the consumer chain (`<ModelViewer>`, `controls-listener.machine.ts`, `screenshot-capability.machine.ts`) which is reachable from project routes.
