---
title: '@taucad/runtime Next.js Compatibility Audit'
description: 'Audit of the OCJS docs-site Next.js workarounds around @taucad/runtime, with source-level runtime fixes and a proposed Next.js example/adapter path.'
status: draft
created: '2026-06-01'
updated: '2026-06-01'
category: audit
related:
  - docs/research/runtime-worker-bundling-strategy.md
  - docs/research/runtime-zero-config-bundling.md
  - docs/research/runtime-cross-origin-isolation-distribution.md
  - docs/research/runtime-asset-and-plugin-library-architecture.md
---

# @taucad/runtime Next.js Compatibility Audit

Audit of the workarounds currently required to run `@taucad/runtime` inside the Next.js 16 / webpack OCJS docs-site playground, plus the source-level changes needed to move those responsibilities into `@taucad/runtime` itself and support Turbopack directly.

## Executive Summary

The OCJS docs-site playground works by compensating for several runtime packaging and environment issues in the Next.js application layer. The biggest smells are not the individual stubs; they are the fact that a consumer app must understand runtime internals such as `runtime-protocol.schemas.js`, `KernelRuntimeWorker`, `ResolvedMiddleware`, `execute-code-node.js`, and `@taucad/utils/dist/esm/id.utils.js` to make a browser worker render.

The problems cluster into six source-level gaps:

1. `@taucad/runtime` has no Next-safe browser client entry. The package root exports `presets`, which should move to a dedicated `@taucad/runtime/presets` subpath, and `createRuntimeClient` statically imports the in-process transport fallback, so a browser-only web-worker consumer still exposes a wide graph to Next.
2. Next cannot reliably discover the runtime's dynamic plugin handoff (`moduleUrl` plus `import(/* @vite-ignore */ url)`) inside the worker. The docs-site therefore preloads kernel, bundler, and middleware definitions with direct imports.
3. Several universal modules contain guarded Node branches that are still statically visible to Next's browser graph (`environment`, `execute-code-node`, `worker-crash-trap`, `wasm-loader`, and kernel file helpers).
4. The published `runtime-protocol.schemas.js` referenced `SharedArrayBuffer` and `MessagePort` constructors at module evaluation time, which throws in non-isolated browser documents before the app can even show a helpful message.
5. The runtime browser graph reaches an ID helper through `@taucad/utils` that the docs-site currently replaces with a `crypto.randomUUID()` shim.
6. Runtime framework adapters exist for Vite and React Router, but there is no `@taucad/runtime/nextjs` export for Next headers, worker construction guidance, or worker-side runtime module loading.

The recommended direction is a first-class worker-side runtime module loader in `@taucad/runtime`, plus a narrow `@taucad/runtime/nextjs` surface for Next headers/config guidance. The native path remains the existing `moduleUrl: new URL(..., import.meta.url).href` registration flow; Next/Turbopack and other strict bundlers get an app-owned worker entry that statically imports typed module descriptors created from the same plugin factories (`replicad.createModule(load)`, `esbuild.createModule(load)`, etc.). A sibling `examples/nextjs` application should validate the package under Turbopack with Replicad over `webWorkerTransport`, and the OCJS docs-site can later consume the resulting package tarball.

## Problem Statement

The immediate user-visible failure was:

```text
ReferenceError: SharedArrayBuffer is not defined
```

It was thrown while loading:

```text
@taucad/runtime/dist/esm/types/runtime-protocol.schemas.js
```

inside the Next.js app browser bundle for:

```text
repos/opencascade.js/docs-site/components/playground/runtime-playground-client-entry.tsx
```

That single crash exposed a broader issue. The docs-site currently makes `@taucad/runtime` work in Next by aliasing package internals, copying protocol schemas, replacing Node modules with stubs, and authoring a custom worker class that bypasses the runtime's dynamic plugin loading path.

The goal of this audit is to identify every known Next.js workaround, trace it to the runtime source cause, and recommend a source-owned architecture before implementing the new Next.js example and docs-site tarball upgrade.

## Scope and Non-Goals

In scope:

- OCJS docs-site runtime playground integration in `repos/opencascade.js/docs-site`.
- `@taucad/runtime` client, transport, worker, plugin, bundler, schema, and cross-origin-isolation source seams that force those docs-site workarounds.
- A proposed `examples/nextjs` app, following the shape of `examples/electron-tau`, using Replicad and browser `webWorkerTransport`.
- Direct Turbopack support in that example site. Webpack can remain a comparison/debug fallback, but it is not the target integration.
- A local tarball adoption path for the docs-site after runtime source changes.

Out of scope for this research pass:

- Implementing the runtime changes.
- Removing the existing docs-site hacks.
- Publishing to npm.
- Reworking the OCJS bottle playground model itself.
- Replacing the OCJS docs-site's webpack setup before the runtime tarball and `examples/nextjs` prove the source-level fixes.

## Methodology

1. Read `.agent/skills/create-research/SKILL.md` and followed the research-doc format.
2. Audited the only Next.js app in the workspace: `repos/opencascade.js/docs-site`.
3. Inventoried `next.config.ts`, `tsconfig.json`, `package.json`, playground stubs, the custom worker constructor, the custom runtime worker, and direct `dist/esm` imports.
4. Traced each docs-site workaround back into `packages/runtime/src`: `runtime-client`, web-worker transport, `KernelRuntimeWorker`, `KernelWorker`, esbuild execution, protocol schemas, environment helpers, Replicad kernel loading, and cross-origin isolation helpers.
5. Reviewed `examples/electron-tau` for the existing example project conventions and Nx target shape.
6. Cross-checked existing runtime research docs for prior decisions on worker bundling, zero-config bundling, and cross-origin isolation.
7. Reviewed `docs/policy/library-api-policy.md` and the current plugin factory helpers to keep the proposed API aligned with Tau's factory, plugin, subpath export, and escape-hatch conventions.

## Current Docs-Site Workarounds

| Workaround                                             | File(s)                                                                                              | What it avoids                                                                                | Runtime source seam                                                                                           |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Alias package root to a slim local entry               | `repos/opencascade.js/docs-site/next.config.ts`, `tsconfig.json`, `lib/playground/runtime-entry.ts`  | Root import pulls too much runtime graph into the browser bundle                              | `packages/runtime/src/index.ts` exports `presets`; `runtime-client.ts` statically imports in-process fallback |
| Replace runtime protocol schemas                       | `next.config.ts`, `lib/playground/runtime-protocol-schemas.ts`                                       | `SharedArrayBuffer` / `MessagePort` constructor references crash when unavailable             | `packages/runtime/src/types/runtime-protocol.schemas.ts` used constructor-dependent schemas                   |
| Replace universal environment module                   | `next.config.ts`, `lib/playground/environment-stub.ts`                                               | Browser graph sees `node:url` path from `resolveFileUrl`                                      | `packages/runtime/src/framework/environment.ts` mixes browser detection and Node file URL conversion          |
| Replace Node builtins with stubs                       | `node-module-stub.ts`, `node-fs-promises-stub.ts`, `node-worker-threads-stub.ts`, `node-url-stub.ts` | Next browser graph externalizes or errors on `node:*` imports                                 | Guarded Node branches live in modules reached by browser entries                                              |
| Replace Node execute path                              | `execute-code-node-stub.ts`, `playground-esbuild.bundler.ts`                                         | Browser bundle sees `execute-code-node.js`, which imports `node:fs`, `node:os`, `node:path`   | `packages/runtime/src/bundler/esbuild-core.ts` has a Node execution branch in the shared bundler module       |
| Replace worker crash/error trap outside worker context | `worker-error-trap-stub.ts`, `next.config.ts`                                                        | Browser main-thread graph reaches process-based crash trap branches                           | `worker-error-trap.ts` / `_internal/worker-crash-trap.ts` import shared environment and branch to `process`   |
| Replace ID utility                                     | `id-utils-stub.ts`, `next.config.ts`                                                                 | Published runtime graph reaches `@taucad/utils/dist/esm/id.utils.js` and its dependency chain | Runtime depends on a general utility package for ID generation in browser/worker code                         |
| Custom worker constructor                              | `playground-worker-ctor.ts`                                                                          | Next needs `new Worker(new URL(..., import.meta.url))` at the app's static call site          | `webWorkerClient` owns a default package-local `new URL('../worker/web.js', import.meta.url)`                 |
| Custom runtime worker with static plugin definitions   | `playground-runtime-worker.ts`                                                                       | Next cannot turn runtime `moduleUrl` strings into a worker chunk graph                        | `KernelRuntimeWorker` and `KernelWorker` dynamically import kernel, bundler, middleware, and transcoder URLs  |
| Direct published `dist/esm` imports                    | `runtime-entry.ts`, `playground-runtime-worker.ts`                                                   | Needed internals are not exported in a Next-appropriate shape                                 | Public package surface lacks a browser/Next adapter and worker-side runtime module loader                     |
| Manual COI headers                                     | `next.config.ts`                                                                                     | SAB and pthread WASM require cross-origin isolation                                           | Runtime has shared COI primitives, but no Next adapter                                                        |
| Force webpack and WASM experiments                     | `package.json`, `next.config.ts`                                                                     | Current integration is known only under `next dev --webpack` / `next build --webpack`         | No Next example validates Turbopack directly                                                                  |

## Findings

### Finding 1: The package root is not a Next-safe browser entry

`repos/opencascade.js/docs-site/lib/playground/runtime-entry.ts` exists because the published package root exports more than the playground needs. Its comment states that the root also exports `presets`, which pulls every built-in kernel/transcoder plugin and breaks webpack.

The source confirms this. `packages/runtime/src/index.ts` exports `presets` from `#plugins/presets.js`, and `presets.all()` imports every kernel factory plus converter transcoding. Even when the app explicitly configures a single kernel and a web worker, Next must still analyze the package root graph.

The source fix should move `presets` out of the root export entirely. Keep `presets` available as an explicit opt-in subpath:

```typescript
import { presets } from '@taucad/runtime/presets';
```

This preserves the convenience API for consumers that intentionally want the full graph while keeping `@taucad/runtime` and `@taucad/runtime/nextjs` lean by default.

The root also re-exports `createRuntimeClient` from `runtime-client.ts`, which statically imports `inProcessTransport` to provide the optional default transport. That default is useful for Node and tests, but it means a browser-only client import still reaches in-process transport code at build time.

### Finding 2: The default in-process transport is source-coupled to the client

`packages/runtime/src/client/runtime-client.ts` imports:

```typescript
import { inProcessTransport } from '#transport/in-process-transport.js';
```

and later defaults:

```typescript
const transportPlugin = options.transport ?? inProcessTransport({});
```

The docs-site always supplies `webWorkerTransport`, but Next still sees the static in-process transport import. The local `in-process-transport-stub.ts` documents this as a browser-bundle stub for the default import path, although the current `next.config.ts` no longer wires that exact stub. The smell remains in the runtime source: optional fallback behavior is paid for by every client entry.

The fix belongs in runtime, not in Next config. A browser/Next client entry should either require an explicit transport or lazy-load the in-process fallback only when actually omitted.

### Finding 3: Protocol schemas must be safe in missing-SAB environments

The runtime protocol schema module is imported by both in-process and web-worker transports. In browsers, `SharedArrayBuffer` may be hidden until the document is cross-origin isolated. The published package used constructor-backed Zod schemas that evaluated those globals at import time.

That explains the immediate crash:

```text
SharedArrayBuffer is not defined
```

The source-level fix is straightforward and already exists in the working tree from the preceding debug pass: use `z.custom` guards that check `typeof SharedArrayBuffer !== 'undefined'` and `typeof MessagePort !== 'undefined'` inside validation. Keep the regression test that imports the schema with those globals removed.

This should ship in the runtime tarball so the docs-site can delete its local `runtime-protocol-schemas.ts` copy.

### Finding 4: Next cannot consume the runtime's dynamic plugin URL handoff as-is

The runtime plugin model registers kernels, bundlers, middleware, and transcoders as URL strings:

- `replicad.plugin.ts`: `moduleUrl: new URL('replicad.kernel.js', import.meta.url).href`
- `bundler-factories.ts`: `moduleUrl: new URL('../bundler/esbuild.bundler.js', import.meta.url).href`
- Middleware/transcoder factories follow the same pattern.

Then the worker imports them dynamically:

- `KernelRuntimeWorker.loadKernelModule()` imports `config.moduleUrl`.
- `KernelWorker.ensureLoadedBundler()` imports `bundlerEntry.bundlerModuleUrl`.
- `KernelWorker.loadMiddleware()` imports middleware `entry.url`.
- `KernelWorker.loadTranscoders()` imports transcoder `entry.moduleUrl`.

That architecture is correct for built `dist/` artifacts and Vite/Rolldown-style library asset handling, but it is not enough for a Next app worker graph. The docs-site had to create `PlaygroundRuntimeWorker`, inject the OCJS kernel definition directly, inject the esbuild definition directly, and override middleware loading with a static array.

The runtime should own a first-class worker-side module loader path for bundlers that cannot chase those dynamic URL strings.

### Finding 5: The bundled web-worker default is not the right Next integration point

`webWorkerClient` owns:

```typescript
const defaultWebWorkerUrl = new URL('../worker/web.js', import.meta.url);
```

The prior worker-bundling research correctly notes that worker URLs are most robust when authored at the consumer's bundler entry level. The docs-site follows that rule with:

```typescript
new Worker(new URL('./playground-runtime-worker.ts', import.meta.url), {
  type: 'module',
});
```

inside `PlaygroundWorker`.

This is not a docs-site failure. It is a framework-specific integration requirement. Runtime should continue exposing the default worker for bundlers that support it, but a `nextjs` adapter should make the app-owned worker constructor pattern official and boring.

### Finding 6: Browser modules still expose guarded Node branches to Next

The runtime tries to be isomorphic in several places:

- `framework/environment.ts` dynamically imports `node:url` only when `isNode()` and `file:`.
- `framework/wasm-loader.ts` falls back to `node:fs/promises` for `file:` URLs.
- `kernels/kernel-module-helpers.ts` does the same for binary file loading.
- `bundler/esbuild-core.ts` dynamically imports `execute-code-node.js` only when `isNode()`.
- `execute-code-node.ts` imports `node:fs`, `node:os`, and `node:path`.
- `worker-crash-trap.ts` branches to `process.on/off` in Node.
- `replicad.kernel.ts` falls back to `node:fs/promises` for source maps and raw binary files.

Those guards are runtime-correct, but Next's browser compiler still sees the modules. The docs-site replaces them with stubs because the package does not provide clean browser-only entry slices for these concerns.

The runtime needs more physical separation between browser/worker and Node helpers. Feature checks are not a substitute for a browser-safe import graph.

### Finding 7: The docs-site is importing package internals that should not be public coupling

The custom worker imports:

```typescript
import type { ResolvedMiddleware } from '../../node_modules/@taucad/runtime/dist/esm/framework/kernel-worker.js';
import { geometryCacheMiddleware } from '../../node_modules/@taucad/runtime/dist/esm/middleware/geometry-cache.middleware.js';
import { parameterCacheMiddleware } from '../../node_modules/@taucad/runtime/dist/esm/middleware/parameter-cache.middleware.js';
```

This bypasses package exports and pins the docs-site to `dist/esm` paths. It is a symptom of the missing worker-side runtime module loader: the docs-site needs to provide already-imported definitions inside the worker bundle, but the public API only models URL-based plugin registration.

### Finding 8: Runtime already has the right framework-adapter precedent

`packages/runtime/src/vite/index.ts`, `react-router/index.ts`, and `cross-origin-isolation/index.ts` already model the correct packaging pattern:

- generic primitives live in `@taucad/runtime/cross-origin-isolation`;
- framework adapters wrap the primitives into that framework's native shape;
- package exports carry narrow subpaths.

Next should follow the same pattern. A `@taucad/runtime/nextjs` export is consistent with the existing API, not a special exception.

### Finding 9: Replicad is the right Next example kernel, but it will exercise the same hard parts

The requested `examples/nextjs` should use Replicad, not OCJS, because it validates the runtime's default published browser path rather than the OCJS docs-site's special kernel. Replicad will still exercise:

- app-owned worker construction;
- worker-side static module loading for strict bundlers;
- dynamic kernel registration;
- esbuild bundling and browser-side code execution;
- WASM URL handling for `replicad_single.wasm` and `replicad_multi.wasm`;
- COI headers for multi-threaded WASM and SAB-backed transport;
- Node fallback isolation in `replicad.kernel.ts` and shared helpers.

If the Replicad Next example builds and renders with a package tarball under Turbopack, the docs-site should be able to consume the same runtime API changes without local stubs.

### Finding 10: There is no automated Next compatibility gate today

`examples/electron-tau` has an Nx project, build target, serve target, Vitest tests, and Playwright e2e tests. There is no sibling Next example to prove that:

- the package tarball works after build;
- the web-worker approach is used;
- the browser bundle does not need Node-module replacement stubs;
- Replicad renders in a real browser;
- cross-origin isolation headers are present;
- the package root or `nextjs` entry is safe under Next Turbopack.

This is why docs-site regressions are discovered in the app browser rather than caught as package compatibility failures.

### Finding 11: Turbopack support must be solved in the example, not deferred

The current docs-site scripts force webpack with `next dev --webpack` and `next build --webpack`. That is useful evidence of the workaround era, but it is not acceptable as the target architecture. Next's default direction is Turbopack, so the runtime adapter and example must make the Turbopack path work directly.

This changes the acceptance bar for `@taucad/runtime/nextjs`: the adapter cannot be only a `webpack(config)` helper that injects aliases or `NormalModuleReplacementPlugin` stubs. It needs a source-level package graph that Turbopack can consume without per-file replacements, plus a worker-side runtime module loading pattern that Turbopack can analyze from the app-owned worker entry.

### Finding 12: Module descriptors should be authored by plugin factories, not a parallel `defineRuntimeModule`

The first-cut descriptor idea used a standalone `defineRuntimeModule({ kind, id, ... })` helper. That technically works, but it creates a second public place where plugin identity is declared. It also asks plugin authors to understand two adjacent concepts: "plugin registration" for the client and "runtime module definition" for the worker.

The current plugin factories already own the relevant identity:

- `createKernelPlugin` carries a literal kernel ID through the returned registration type.
- `createTranscoderPlugin` carries literal transcoder IDs and source-format typing.
- `createBundlerPlugin` and `createMiddlewarePlugin` can be updated to carry literal IDs the same way.

Library API policy favors clear factory functions, plain plugin registration objects, and narrow authoring helpers. The best fit is therefore to extend each plugin factory with a worker-only descriptor helper:

```typescript
export const myKernel = createKernelPlugin({
  id: 'my-kernel',
  moduleUrl: new URL('./my-kernel.kernel.js', import.meta.url).href,
  extensions: ['cad'],
});

export const myKernelModule = myKernel.createModule(() =>
  import('./my-kernel.kernel.js').then((module) => module.default),
);
```

This preserves the existing consumer API (`myKernel()` returns plain data), avoids exposing implementation definitions to the main-thread graph, and gives strict kind/ID typing without duplicating plugin identity.

## Recommendations

| ID  | Priority | Recommendation                                                                                                                                                                                                                                                                                                            | Owner                                                |
| --- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| R1  | P0       | Ship constructor-safe protocol schemas for `SharedArrayBuffer` and `MessagePort`; keep the no-SAB import regression test.                                                                                                                                                                                                 | `packages/runtime`                                   |
| R2  | P0       | Add a Next/browser-safe client entry that does not export `presets` and does not statically import the in-process default transport. Prefer `@taucad/runtime/nextjs`; alternatively add `@taucad/runtime/client` and re-export it from `nextjs`.                                                                          | `packages/runtime`                                   |
| R3  | P0       | Move `presets` from the package root to a dedicated `@taucad/runtime/presets` subpath export. The root entry should not expose `presets.all()` because that opt-in convenience imports every kernel/transcoder path.                                                                                                      | `packages/runtime`                                   |
| R4  | P0       | Make the browser/Next entry require an explicit transport or use a lazy default transport loader so web-worker consumers do not pay for in-process imports.                                                                                                                                                               | `packages/runtime`                                   |
| R5  | P0       | Add a worker-side runtime module loader API. The default loader keeps the current `moduleUrl` dynamic import path; strict bundlers can provide typed, statically imported kernel, bundler, middleware, and transcoder modules from the worker entry, authored through each plugin factory's `.createModule(load)` helper. | `packages/runtime`                                   |
| R6  | P0       | Add a `@taucad/runtime/nextjs` adapter with Next-shaped COI headers/config helpers and documented app-owned worker construction. It should not be a worker-definition DSL.                                                                                                                                                | `packages/runtime`                                   |
| R7  | P1       | Physically split Node-only helpers from browser-safe modules instead of relying only on `isNode()` branches. Focus first on `execute-code-node`, file URL resolution, and Node filesystem fallbacks.                                                                                                                      | `packages/runtime`                                   |
| R8  | P1       | Remove the runtime browser graph's dependency on `@taucad/utils/id` or expose a browser-safe ID helper from `@taucad/utils` that does not resolve to Node crypto in published browser bundles.                                                                                                                            | `packages/runtime`, `packages/utils`                 |
| R9  | P0       | Create `examples/nextjs`, modeled after `examples/electron-tau`, using Next 16, React 19, Replicad, esbuild, `webWorkerTransport`, a Next-owned worker entry, Turbopack by default, and Playwright smoke coverage.                                                                                                        | `examples`                                           |
| R10 | P1       | Package `@taucad/runtime` into a local `.tgz` after the source fixes and point the OCJS docs-site at that file dependency until npm publish.                                                                                                                                                                              | `packages/runtime`, `repos/opencascade.js/docs-site` |
| R11 | P1       | Remove docs-site webpack replacements and local copies once the tarball lands. Keep only integration code that is genuinely app-owned, such as the worker entry if Next still requires it.                                                                                                                                | `repos/opencascade.js/docs-site`                     |
| R12 | P0       | Make Turbopack the required Next acceptance path. Webpack may remain a comparison fallback, but the example must pass under ordinary Next/Turbopack dev and build commands without docs-site-style module replacement stubs.                                                                                              | `packages/runtime`, `examples`                       |

## Proposed `@taucad/runtime/nextjs` Surface

The exact API can be refined during implementation, but the adapter should make the common case feel like a package feature, not a pile of copied stubs.

```typescript
// @taucad/runtime/nextjs
export { createRuntimeClient, createRuntimeClientOptions, fromMemoryFs } from './client-browser-safe';

export { nextRuntimeHeaders, nextRuntimeConfig } from './nextjs-adapter';
```

Candidate responsibilities:

1. `nextRuntimeHeaders()` returns Next `headers()` entries or a header list helper derived from `@taucad/runtime/cross-origin-isolation`.
2. `nextRuntimeConfig(options)` provides Next-shaped config fragments only for true framework invariants, not per-file webpack aliases or replacements.
3. The entry exports only browser-safe client primitives and types. It must not export `presets.all()` or any Node transport by accident.
4. The entry documents the app-owned worker pattern rather than hiding it behind a framework-specific worker-definition DSL.

The adapter should not hide the app-owned worker entry entirely if Next still requires the literal `new Worker(new URL(..., import.meta.url))`. In that case, the adapter should document the pattern and make the worker body trivial.

## Proposed Runtime Module Loader

The native plugin registration path should remain unchanged. Consumer-facing plugin factories still return plain objects with module URLs:

```typescript
export const replicad = createKernelPlugin({
  id: 'replicad',
  moduleUrl: new URL('replicad.kernel.js', import.meta.url).href,
  extensions: ['ts', 'js'],
});
```

That remains the default loader behavior for Vite, Rolldown, Node workers, Electron, CLI, UI, tests, and any environment that can consume the emitted module URLs. The new API should add a worker-side loading seam, not replace registrations with implementation objects.

The key DX adjustment is that the typed worker module descriptor should be created by the same plugin factory, not by a separate public `defineRuntimeModule()` helper. A plugin factory already owns the stable plugin `id`, plugin kind, and option typing. Extending that factory with a worker-only descriptor helper keeps one source of identity and avoids a parallel authoring model.

Target plugin factory shape:

```typescript
export const replicad = createKernelPlugin({
  id: 'replicad',
  moduleUrl: new URL('replicad.kernel.js', import.meta.url).href,
  extensions: ['ts', 'js'],
});

export const replicadKernelModule = replicad.createModule(() =>
  import('./replicad.kernel.js').then((module) => module.default),
);
```

The call result remains plain registration data:

```typescript
createRuntimeClient({
  kernels: [replicad()],
  bundlers: [esbuild()],
});
```

`replicad.createModule(load)` is not used on the client side and should not be sent over `postMessage`. It is a worker-entry authoring helper that preserves the plugin factory's `kind` and literal `id`, then pairs them with an implementation loader.

The `load` callback should be the only descriptor form. It may return either a value or a promise:

```typescript
type RuntimeModuleLoad<Definition> = () => Definition | Promise<Definition>;
```

This avoids a public `definition | load` union. Lazy `load()` keeps heavy implementation modules out of the main/client graph, gives bundlers an explicit static import edge inside the worker entry, and still supports tests with inline definitions:

```typescript
const testKernel = createKernelPlugin({
  id: 'test',
  moduleUrl: 'test://kernel',
  extensions: ['test'],
});

const testKernelModule = testKernel.createModule(() => testKernelDefinition);
```

Built-in descriptor subpaths should export descriptors authored this way:

```typescript
// @taucad/runtime/kernel/replicad/module
import { replicad } from '../replicad.plugin.js';

export const replicadKernelModule = replicad.createModule(() =>
  import('../replicad.kernel.js').then((module) => module.default),
);
```

The same pattern applies to bundlers, middleware, and transcoders:

```typescript
export const esbuildBundlerModule = esbuild.createModule(() =>
  import('../esbuild.bundler.js').then((module) => module.default ?? module),
);

export const geometryCacheModule = geometryCache.createModule(() =>
  import('../geometry-cache.middleware.js').then((module) => module.geometryCacheMiddleware),
);
```

Target worker API:

```typescript
import { createRuntimeWorker, createRuntimeModuleLoader } from '@taucad/runtime/worker';
import { webWorkerHost } from '@taucad/runtime/transport/web';

import { replicadKernelModule } from '@taucad/runtime/kernel/replicad/module';
import { esbuildBundlerModule } from '@taucad/runtime/bundler/esbuild/module';
import { geometryCacheModule } from '@taucad/runtime/middleware/geometry-cache/module';
import { parameterCacheModule } from '@taucad/runtime/middleware/parameter-cache/module';

const worker = createRuntimeWorker({
  moduleLoader: createRuntimeModuleLoader({
    modules: [replicadKernelModule, esbuildBundlerModule, geometryCacheModule, parameterCacheModule],
  }),
});

await webWorkerHost({ worker }).open();
```

Default worker API:

```typescript
const worker = createRuntimeWorker();
```

The default loader dynamically imports `request.moduleUrl`. A static loader first checks its typed module descriptors by `{ kind, id }`, then falls back to the default loader unless configured to be strict.

This gives strict kind-level safety: kernel descriptors must carry a `KernelDefinition`, bundler descriptors must carry a `BundlerDefinition`, middleware descriptors must carry a `KernelMiddleware`, and transcoder descriptors must carry a `TranscoderDefinition`. It also improves ID safety. `createKernelPlugin` and `createTranscoderPlugin` already carry literal IDs through their public types; `createBundlerPlugin` and `createMiddlewarePlugin` should be updated to do the same so descriptor lookup can be fully typed across all module kinds.

There should not be a public raw `moduleLoader: { loadKernel, loadBundler, ... }` object in the first iteration. That shape exposes four implementation hooks before we have a demonstrated consumer that needs all of them, and it makes ordinary Next.js users learn runtime internals. Keep the low-level loader interface internal to `packages/runtime` for now. The public escape hatch is a descriptor created from a plugin factory:

```typescript
const customReplicadModule = replicad.createModule(() =>
  import('./custom-replicad.kernel.js').then((module) => module.default),
);
```

This API satisfies the native `new URL(...)` module URL pattern and creates an explicit override point for Next/Turbopack, Electron variants, test workers, and future remote host topologies. It also avoids overloading `transport` with plugin implementation concerns.

## Package-Scoped Implementation Plan

Phase 1 should land entirely inside `packages/runtime`. The goal is that every existing runtime consumer keeps working through the new loader infrastructure before any app or example code changes.

### Phase 1: Runtime Worker Module Loading

| Step | Change                                                                                                                                                                                                                                                             | Scope              | Tests                                                                                                                                                     |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Add public worker factory `createRuntimeWorker(options?)` over `KernelRuntimeWorker`. Keep `KernelRuntimeWorker` available from internals for low-level composition, but route docs/examples through the factory.                                                  | `packages/runtime` | Type-level surface test for `@taucad/runtime/worker`; unit test that `createRuntimeWorker()` preserves current behavior.                                  |
| 2    | Add the internal `RuntimeModuleLoader` contract with `loadKernel`, `loadBundler`, `loadMiddleware`, and `loadTranscoder`. The default implementation dynamically imports `request.moduleUrl`; the public factory remains `createRuntimeModuleLoader({ modules })`. | `packages/runtime` | Unit tests proving each default loader path imports from URL and resolves `default ?? module` consistently where appropriate.                             |
| 3    | Thread the loader through `KernelRuntimeWorker` and `KernelWorker` instead of direct `import(/* @vite-ignore */ url)` calls.                                                                                                                                       | `packages/runtime` | Existing kernel, bundler, middleware, and transcoder tests should continue passing unchanged.                                                             |
| 4    | Extend plugin factory helpers with `.createModule(load)` and add `createRuntimeModuleLoader({ modules })` for typed static descriptors. Also carry literal IDs through bundler and middleware plugin factories.                                                    | `packages/runtime` | Compile-time tests for kind safety, literal ID preservation, and descriptor definition typing; runtime tests that descriptor matches win over URL import. |
| 5    | Export first-party descriptors for built-in kernels, bundlers, middleware, and transcoders from explicit implementation subpaths, authored via their plugin factory `.createModule(load)` helpers.                                                                 | `packages/runtime` | Export coverage tests and browser-safe import tests for descriptor subpaths.                                                                              |
| 6    | Add actionable mismatch errors for missing static modules, duplicate descriptors, kind/id collisions, and invalid definitions.                                                                                                                                     | `packages/runtime` | Error tests with exact code/message assertions.                                                                                                           |

The loader must be an implementation detail of the worker side. `RuntimeClientOptions` should continue to list enabled plugins as registrations (`kernels`, `bundlers`, `middleware`, `transcoders`) and should not carry definitions, because definitions cannot cross the `postMessage` boundary.

### Phase 2: Preserve Existing Consumers

Before introducing `examples/nextjs`, the package should prove compatibility across existing runtime usage:

| Consumer path      | Expected behavior under new loader                                                                                                                                                                                                                 | Validation                                                                                                      |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Browser web worker | Default `@taucad/runtime/worker/web` uses `createRuntimeWorker()` with default URL loader; `webWorkerTransport` behavior remains unchanged.                                                                                                        | Transport conformance and browser compatibility tests.                                                          |
| Node worker        | Default node worker entry uses `createRuntimeWorker()` with default URL loader.                                                                                                                                                                    | Node worker bootstrap/integration tests.                                                                        |
| In-process runtime | In-process transport uses the same worker abstraction and default loader.                                                                                                                                                                          | Existing in-process runtime tests.                                                                              |
| CLI                | CLI renders through current runtime APIs without custom loader config.                                                                                                                                                                             | Runtime package tests plus later affected CLI smoke if touched indirectly.                                      |
| UI                 | UI call sites continue using plugin registrations and existing transports; no UI app migration is required in phase 1.                                                                                                                             | Runtime browser-safe import tests; defer full UI app tests unless runtime public exports change.                |
| Testing utilities  | Test helpers should either use plugin-factory descriptors with inline `load()` definitions or the default loader for URL-based fixtures.                                                                                                           | Update runtime test utilities only inside `packages/runtime`; keep `packages/testing` untouched in phase 1.     |
| Electron precedent | `examples/electron-tau` can continue relying on Vite/Rollup URL chunk emission. No Electron example changes are required for phase 1. The design keeps the door open for Electron to provide a custom loader later if it wants static descriptors. | No direct Electron changes in phase 1; avoid breaking exported transport-author primitives used by the example. |

Runtime test command target:

```bash
pnpm nx test runtime --watch=false
pnpm nx typecheck runtime
pnpm nx build runtime
```

If `pnpm nx lint runtime` reports unrelated existing issues, capture them rather than expanding scope.

## Proposed Next.js Example

Create `examples/nextjs` as a sibling of `examples/electron-tau`.

Recommended shape:

| File                                                               | Purpose                                                                                                                  |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `examples/nextjs/package.json`                                     | Private example package with `next`, `react`, `react-dom`, `@taucad/runtime`, `three`, Playwright/Vitest deps as needed. |
| `examples/nextjs/project.json`                                     | Nx app with `dev`, `build`, `serve`, `test`, and `test:e2e` targets mirroring the Electron example style.                |
| `examples/nextjs/next.config.ts`                                   | Uses `@taucad/runtime/nextjs` headers/config and keeps Turbopack as the primary path.                                    |
| `examples/nextjs/app/page.tsx`                                     | Minimal client entry that renders a Replicad sample and displays bbox/status.                                            |
| `examples/nextjs/app/runtime-worker.ts` or `src/runtime-worker.ts` | App-owned `Worker(new URL(...))` target that opens `createRuntimeWorker({ moduleLoader })` through `webWorkerHost`.      |
| `examples/nextjs/src/runtime-client.ts`                            | `createRuntimeClientOptions` with `webWorkerTransport`, `fromMemoryFs`, `replicad()`, and `esbuild()`.                   |
| `examples/nextjs/e2e/render.spec.ts`                               | Starts the app, asserts worker transport, cross-origin isolation, and a non-empty Replicad GLB render.                   |

Replicad sample code can be intentionally small:

```typescript
import { draw, makeCylinder } from 'replicad';

export const defaultParams = { radius: 10, height: 20 };

export default function main(params = defaultParams) {
  return makeCylinder(params.radius, params.height);
}
```

The important part is not the geometry complexity. The example exists to prove the package integration: Next/Turbopack browser main thread plus web worker plus Replicad plus esbuild plus WASM plus runtime protocol.

Example worker body:

```typescript
import { createRuntimeWorker, createRuntimeModuleLoader } from '@taucad/runtime/worker';
import { webWorkerHost } from '@taucad/runtime/transport/web';
import { replicadKernelModule } from '@taucad/runtime/kernel/replicad/module';
import { esbuildBundlerModule } from '@taucad/runtime/bundler/esbuild/module';

const worker = createRuntimeWorker({
  moduleLoader: createRuntimeModuleLoader({
    modules: [replicadKernelModule, esbuildBundlerModule],
  }),
});

await webWorkerHost({ worker }).open();
```

Example client body:

```typescript
const client = createRuntimeClient({
  transport: webWorkerTransport({
    url: new URL('./runtime-worker.ts', import.meta.url),
    fileSystem: fromMemoryFs(),
  }),
  kernels: [replicad()],
  bundlers: [esbuild()],
});
```

The example must use the default Next/Turbopack path. Webpack can be added as an explicit secondary comparison target only after the Turbopack path is green.

## Local Tarball Adoption Path

After the runtime source fixes and Next example are implemented:

1. Build the package:

```bash
pnpm nx build runtime
```

2. Pack the runtime into a repo-local tarball directory:

```bash
pnpm --dir packages/runtime pack --pack-destination ../../tarballs/runtime-nextjs
```

3. Point the docs-site to the tarball:

```json
{
  "dependencies": {
    "@taucad/runtime": "file:../../../tarballs/runtime-nextjs/taucad-runtime-0.1.0-beta.1.tgz"
  },
  "pnpm": {
    "overrides": {
      "@taucad/runtime": "file:../../../tarballs/runtime-nextjs/taucad-runtime-0.1.0-beta.1.tgz"
    }
  }
}
```

4. Reinstall in the docs-site and remove local runtime shims only after the example and docs-site both pass.

The exact tarball filename should be verified after `pnpm pack`; npm usually strips the scope into a filename like `taucad-runtime-0.1.0-beta.1.tgz`.

## Validation Plan

Runtime-level:

- `pnpm nx test runtime --watch=false` for touched modules.
- `pnpm nx typecheck runtime`.
- `pnpm nx build runtime`.
- Schema regression: import `runtime-protocol.schemas` with `SharedArrayBuffer` and `MessagePort` removed from `globalThis`.
- Browser-safe import tests for the new `@taucad/runtime/nextjs` entry: no `node:*`, no in-process default transport, no `presets` graph.
- Runtime module loader tests:
  - default loader preserves the current `moduleUrl` dynamic import path;
  - plugin-factory descriptors preserve kind-specific definition typing and literal IDs;
  - descriptor loader resolves kernel, bundler, middleware, and transcoder registrations by `{ kind, id }`;
  - descriptor loader falls back to URL import by default;
  - strict descriptor mode fails with actionable errors when a requested module is missing;
  - duplicate descriptor IDs and kind mismatches fail clearly.
- Existing runtime compatibility tests for browser worker, node worker, in-process transport, middleware, transcoders, and runtime testing utilities continue to pass.

Example-level:

- `pnpm nx build example-nextjs`.
- `pnpm nx test:e2e example-nextjs` with Playwright.
- Dev/build commands must use Turbopack by default. Do not force `--webpack` in the example unless a separate comparison target is added.
- Start the app and validate it manually through the Browser plugin (`@Browser`) before claiming the integration works.
- Browser assertions:
  - `crossOriginIsolated === true` when headers are enabled.
  - Runtime transport descriptor reports web-worker.
  - Replicad render produces a GLB with non-zero bytes and a plausible bounding box.
  - No Next overlay and no console `Module "node:*" has been externalized` errors.
  - No docs-site-style `NormalModuleReplacementPlugin` or webpack-only aliasing is required for the default path.
  - Static descriptor imports are present in the app-owned worker entry and no runtime plugin implementation is imported into the browser main bundle unnecessarily.

Docs-site-level:

- `pnpm --dir repos/opencascade.js/docs-site typecheck`.
- `pnpm --dir repos/opencascade.js/docs-site build`.
- Browser playground smoke:
  - no `SharedArrayBuffer is not defined` import-time crash;
  - no docs-site protocol-schema copy;
  - no Node-module replacement stubs required;
  - existing OCJS playground still renders through a web worker.

## Migration Order

1. Land the constructor-safe schema fix in `packages/runtime`.
2. Add the runtime worker module loader primitives inside `packages/runtime`.
3. Route all runtime worker code paths through the loader while preserving default URL dynamic imports.
4. Add first-party typed module descriptors authored via plugin-factory `.createModule(load)` helpers, plus export coverage for the built-in kernels, bundlers, middleware, and transcoders.
5. Add `@taucad/runtime/nextjs` and a browser-safe client entry.
6. Split the highest-risk Node-only branches out of browser-visible modules.
7. Run runtime package tests, typecheck, and build until the package is internally green.
8. Create `examples/nextjs` and make it green against workspace source under Turbopack.
9. Start `examples/nextjs` and validate the app in the Browser plugin.
10. Build and pack `@taucad/runtime` into a local `.tgz`.
11. Update the OCJS docs-site to consume the local `.tgz`.
12. Delete docs-site workarounds one by one, proving each deletion with typecheck/build/browser smoke.
13. Publish the package only after the tarball path proves the external-consumer shape.

## Risks and Trade-Offs

### Turbopack first, webpack only as a fallback

The current docs-site explicitly uses `next dev --webpack` and `next build --webpack`, which is evidence of the workaround rather than a target. The new example must run through the default Next/Turbopack path. If webpack coverage is useful for comparison, add it as an explicit secondary target after Turbopack is green.

### Keep dynamic plugin loading for non-Next consumers

The runtime module loader should default to the existing dynamic `moduleUrl` model. Plugin-factory descriptors are an additional worker-side path, not a replacement. The URL model is still appropriate for built `dist/` artifacts, Vite/Rolldown, Node, CLI contexts, and Electron's current utility-process example.

### Do not overload transport with module resolution

Transport owns wire topology: web worker, node worker, in-process, Electron utility, memory delivery, abort signaling, and filesystem authority. Module loading owns implementation discovery inside the worker. Pushing static plugin definitions into `transport` would make transport semantically responsible for kernel/bundler/middleware/transcoder identity and would repeat the type confusion the Electron filesystem audit already corrected.

### Avoid a "magic" Next config helper that hides too much

Some Next requirements are inherently app-owned, especially the `new Worker(new URL(..., import.meta.url))` site. The adapter should reduce boilerplate, not pretend Next can always discover package-owned workers.

### Cross-origin isolation can break third-party assets

COEP `require-corp` can reject third-party subresources without CORP/CORS headers. The Next helper should allow route-scoped headers or explicit path patterns, matching the docs-site's current scoped `/docs/package/playground`, `/_next/static/:path*`, and WASM asset coverage.

## Appendix A: Source Evidence

Key docs-site files:

- `repos/opencascade.js/docs-site/next.config.ts`
- `repos/opencascade.js/docs-site/package.json`
- `repos/opencascade.js/docs-site/tsconfig.json`
- `repos/opencascade.js/docs-site/lib/playground/runtime-entry.ts`
- `repos/opencascade.js/docs-site/lib/playground/client-options.ts`
- `repos/opencascade.js/docs-site/lib/playground/playground-worker-ctor.ts`
- `repos/opencascade.js/docs-site/lib/playground/playground-runtime-worker.ts`
- `repos/opencascade.js/docs-site/lib/playground/playground-esbuild.bundler.ts`
- `repos/opencascade.js/docs-site/lib/playground/*-stub.ts`

Key runtime files:

- `packages/runtime/src/index.ts`
- `packages/runtime/src/client/runtime-client.ts`
- `packages/runtime/src/types/runtime-protocol.schemas.ts`
- `packages/runtime/src/transport/web-worker-client.ts`
- `packages/runtime/src/transport/web-worker-host.ts`
- `packages/runtime/src/worker/web.ts`
- `packages/runtime/src/framework/kernel-runtime-worker.ts`
- `packages/runtime/src/framework/kernel-worker.ts`
- `packages/runtime/src/framework/environment.ts`
- `packages/runtime/src/framework/wasm-loader.ts`
- `packages/runtime/src/bundler/esbuild-core.ts`
- `packages/runtime/src/bundler/execute-code-node.ts`
- `packages/runtime/src/kernels/kernel-module-helpers.ts`
- `packages/runtime/src/kernels/replicad/replicad.plugin.ts`
- `packages/runtime/src/kernels/replicad/replicad.kernel.ts`
- `packages/runtime/src/plugins/presets.ts`
- `packages/runtime/src/plugins/bundler-factories.ts`
- `packages/runtime/src/cross-origin-isolation/index.ts`
- `packages/runtime/src/vite/index.ts`
- `packages/runtime/src/react-router/index.ts`
- `packages/runtime/package.json`
- `packages/runtime/tsdown.config.ts`

Key example files:

- `examples/electron-tau/project.json`
- `examples/electron-tau/package.json`
- `examples/electron-tau/src/renderer/app.tsx`
- `examples/electron-tau/src/transport/electron-utility-transport.ts`
