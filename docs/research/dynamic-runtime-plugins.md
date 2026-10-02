---
title: 'Dynamic Runtime Plugins: Browser-Configurable Kernels, Middleware, and Transcoders'
description: 'Blueprint for letting users install kernels, middleware, transcoders, and bundler plugins from npm at runtime via a taucad.config.ts file resolved through the project filesystem — turning Tau into a programmable CAD computer with no app rebuild.'
status: draft
created: '2026-04-23'
updated: '2026-04-23'
category: architecture
related:
  - docs/research/node-modules-single-source-of-truth.md
  - docs/research/vscode-style-resolution-and-virtual-types.md
  - docs/research/api-npm-and-reproducible-snapshots.md
  - docs/research/tau-parts-registry-and-marketplace.md
  - docs/research/browser-first-parameter-aware-testing.md
  - docs/research/sharing-architecture.md
  - docs/policy/library-api-policy.md
  - docs/policy/filesystem-policy.md
---

# Dynamic Runtime Plugins: Browser-Configurable Kernels, Middleware, and Transcoders

Blueprint for evolving the `RuntimeClientOptions` plugin surface from app-build-time configuration into a fully runtime-resolved system where any user can `npm install @cool/custom-kernel` or drop a `taucad.config.ts` into their project and have it picked up by the kernel worker on the next render.

## Executive Summary

`@taucad/runtime` already has a rich, well-typed plugin surface — `defineKernel`, `defineMiddleware`, `defineTranscoder`, `defineBundler` — but every plugin must be imported and passed to `createRuntimeClient` at app build time (`runtime-client.ts:337-373`). Today this means Tau ships a fixed catalog (Replicad, OpenCASCADE, Manifold, JSCAD, KCL/Zoo, OpenSCAD via the GPL-isolated `@taucad/openscad` package) and the only way for a user to add a custom kernel is to fork the app. The architecture is **almost there** — kernels are loaded by `import(/* @vite-ignore */ config.moduleUrl)` (`kernel-runtime-worker.ts:298-300`), so the loader is already dynamic. The two missing pieces are (1) **discovery** — where does the worker learn about user plugins? — and (2) **provenance** — how do we trust an npm package to register a kernel that runs in the user's worker? The recommended answer is a `taucad.config.ts` file at the project root, bundled and executed inside the kernel worker the same way user source is, with its `defineConfig({ kernels, middleware, transcoders, bundlers })` export driving a hot-reloadable `RuntimeClientOptions` reconstruction.

This unlocks four product capabilities at once: third-party kernels (CadQuery-via-Pyodide, Brep-CAD, custom DSLs); user-installable verification adapters (GeoSpec remains the standalone test engine while Tau project integration lives in `@taucad/testing` per [`geospec-standalone-cad-testing-blueprint.md`](./geospec-standalone-cad-testing-blueprint.md)); "bring your own observability" (custom telemetry middleware); and the Parts Registry [`tau-parts-registry-and-marketplace.md`](./tau-parts-registry-and-marketplace.md) where parts can ship with their own renderer adapters. The security model is the same as today's user code — everything runs in the kernel worker, which has no DOM access, no cross-origin network access (subject to COEP), no chat/auth credentials. Sandboxing is by **execution context**, not by code review.

## Table of Contents

- [Problem Statement](#problem-statement)
- [Scope and Non-Goals](#scope-and-non-goals)
- [Findings](#findings)
- [Target Architecture](#target-architecture)
- [`taucad.config.ts` Contract](#taucadconfigts-contract)
- [Hot-Reload and Lifecycle](#hot-reload-and-lifecycle)
- [Security Model](#security-model)
- [Recommendations Roadmap](#recommendations-roadmap)
- [Trade-offs](#trade-offs)
- [Open Questions](#open-questions)
- [References](#references)

## Problem Statement

The current plugin pipeline is end-to-end statically linked. A typical bootstrap is:

```typescript
import { createRuntimeClient } from '@taucad/runtime';
import { presets } from '@taucad/runtime/presets';

const client = await createRuntimeClient({
  kernels: presets.all(), // baked at app build time
  middleware: [parameterFileResolverMiddleware(), geometryCacheMiddleware()],
  transcoders: [converterTranscoder()],
});
```

There is no path from this to "the user installed `@acme/sketch-kernel` and it just shows up in the kernel selector." Specifically:

1. **No discovery mechanism.** The worker init payload (`workerClient.initialize`, `runtime-worker-client.ts:221-248`) carries `kernelModules`, `middlewareEntries`, `bundlerEntries`, `transcoderModules` — all populated by the main thread before connect. There is no callback for "the worker has just bundled the user's project; here are its declared dependencies."
2. **No declarative config surface.** Users cannot add a kernel without app code changes. There is no `taucad.config.ts`, no `package.json#tau` field, no `.tau/runtime-config.json`.
3. **No reconnection plumbing.** `RuntimeClient.connect()` is a one-shot per machine lifecycle (`apps/ui/app/machines/cad.machine.ts`). Adding a kernel mid-session would require disconnect + reconnect — currently only triggered on hard reload.
4. **No version negotiation.** A custom kernel built against `@taucad/runtime@1.4` may break on `2.0`. Today this would surface as a runtime crash; we need a contract.
5. **No virtual-types feedback to the editor.** A user-installed kernel that adds a new export format or middleware option needs IntelliSense for those without manually editing `tsconfig.json` — solved by [`vscode-style-resolution-and-virtual-types.md`](./vscode-style-resolution-and-virtual-types.md) but only if user plugins can hook into `getVirtualTypes`.

## Scope and Non-Goals

**In scope**

- A `taucad.config.ts` declarative entry point at the project root.
- Worker-side discovery + dynamic `import()` of plugin module URLs.
- Hot reload on `taucad.config.ts` change without losing chat/editor state.
- Version negotiation between plugins and `@taucad/runtime`.
- Virtual-types integration so user-installed kernels appear in IntelliSense.
- Lockfile pinning of plugin versions for reproducible publications (per [`api-npm-and-reproducible-snapshots.md`](./api-npm-and-reproducible-snapshots.md)).

**Out of scope**

- A full plugin marketplace UI — that's [`tau-parts-registry-and-marketplace.md`](./tau-parts-registry-and-marketplace.md). This doc covers the _runtime hook_; the marketplace is a _consumer_ of it.
- Cross-tab plugin synchronisation — current FM machine is per-tab; defer.
- Server-side plugin execution (e.g., a Tau worker running in Cloudflare Workers) — out of scope, distinct deployment story.
- Native (non-WASM) plugins — browser-only.
- Approving/signing plugins from a registry — defer to the marketplace doc's verification model.

## Findings

### Finding 1: The plugin runtime contract is already complete

Per the existing exploration of plugin contracts, `defineKernel`, `defineMiddleware`, `defineTranscoder`, and `defineBundler` are well-typed identity functions returning rich definitions. The runtime worker dispatches `KernelDefinition.createGeometry`, `MiddlewareDefinition.wrapCreateGeometry`, etc. without caring **where** the definition came from — it only knows the `moduleUrl` it was loaded from.

| Plugin type | Definition field                                    | Loader                                                                       | Wire payload                            |
| ----------- | --------------------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------- |
| Kernel      | `KernelDefinition`                                  | `import(moduleUrl).default` (`kernel-runtime-worker.ts:284-331`)             | `kernelModules: KernelPlugin[]`         |
| Middleware  | `KernelMiddlewareOptions` → `defineMiddleware(...)` | Loaded from `middlewareEntries` in worker init                               | `middlewareEntries: MiddlewarePlugin[]` |
| Transcoder  | `TranscoderDefinition`                              | `import(moduleUrl).default` (`kernel-worker.ts:1904-1927`)                   | `transcoderModules: TranscoderPlugin[]` |
| Bundler     | `BundlerDefinition`                                 | `ensureLoadedBundler` in dispatcher (`runtime-worker-dispatcher.ts:190-191`) | `bundlerEntries: BundlerPlugin[]`       |

**Implication:** if we can produce a `KernelPlugin[]` (etc.) from a `taucad.config.ts` after the user's project loads, the rest of the worker doesn't change. The hard work is discovery + bundling + version negotiation, not the plugin contract.

### Finding 2: The kernel worker already runs the user's `executeCode` pipeline

`kernel-worker.ts:2516-2527` (cited in `browser-first-parameter-aware-testing.md` Finding 3) shows `executeCode(code: string)` bundles user code with esbuild and dynamically imports it via `URL.createObjectURL` + `import()`. **This is exactly the mechanism we need for `taucad.config.ts`.** The config file is just another TypeScript module bundled and executed in the same context as user CAD code. Its named export `default` is a `TauConfig` object that drives plugin resolution.

The only addition to the bundler is one extra entry point (`/.tau/config.bundle.js`) that the kernel-worker bundles before any normal render, and one extra dispatcher callback (`onConfigResolved`) that hands the resulting `TauConfig` back to `RuntimeClient` on the main thread for plugin re-registration.

### Finding 3: Plugin source hosting is `/node_modules/<pkg>` — already the SSoT

Per [`node-modules-single-source-of-truth.md`](./node-modules-single-source-of-truth.md), `/node_modules/` is OPFS-backed and shared across projects. A plugin published as `@acme/sketch-kernel` is just an npm package: its `package.json` declares `main`/`exports`, its bundled JS lives at `/node_modules/@acme/sketch-kernel/dist/index.js`, and the `TauResolver` from [`vscode-style-resolution-and-virtual-types.md`](./vscode-style-resolution-and-virtual-types.md) resolves `import sketchKernel from '@acme/sketch-kernel'` to that file.

So the `moduleUrl` we hand to the worker is `file:///node_modules/@acme/sketch-kernel/dist/index.js` — same scheme as built-ins. The worker's `import(moduleUrl)` is identical for built-in and user plugins, modulo the worker's import of an `OPFS` URL (which already works since the runtime FS bridge serves these reads).

### Finding 4: Per-project config is already a precedent

`docs/policy/filesystem-context-policy.md` and `parameter-storage-architecture.md` establish a `/.tau/` namespace for project-scoped derived state (`.tau/parameters/<entry>.json`, `.tau/cache/`). Adding `/.tau/config.ts` and `/.tau/lockfile.json` to that namespace is a natural extension. Per SG15 in `sharing-architecture.md`, `/.tau/cache/` is excluded from publications but **`/.tau/config.ts` and lockfile would be included** because they are authored, not derived.

### Finding 5: Version negotiation has a clean precedent in `defineKernel.version`

`KernelDefinition.version` and `KernelMiddlewareOptions.version` already exist (per Section A of plugin contracts). Adding a peer-style requirement `peerRuntimeVersion: '^1.4.0'` to each plugin definition lets the runtime check on load and either warn or reject. Today's contract doesn't enforce this; user plugins make the lack of enforcement urgent.

```typescript
type KernelDefinition = {
  name: string;
  version: string;
  /** Required @taucad/runtime semver range. Worker rejects load on mismatch. */
  peerRuntimeVersion?: string;
  // ...
};
```

### Finding 6: Hot reload is straightforward via the existing watch path

The runtime worker already watches user files via `getDependencies` returning paths and the FM machine relaying FS events. Adding `/.tau/config.ts` to the watch set means a change re-bundles the config, re-resolves the plugin set, and triggers a soft `RuntimeClient.reconfigure()` (new method). The CAD machine already handles full reconnects on kernel change; reconfigure is a strict subset.

## Target Architecture

| Layer                     | Module                                                                                                                | Responsibility                                                                                        |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **Author surface**        | `import { defineConfig } from '@taucad/runtime/config'`                                                               | Typed identity function returning a `TauConfig`                                                       |
| **Project config**        | `/.tau/config.ts` (or `taucad.config.ts` at project root)                                                             | User's declarative plugin manifest                                                                    |
| **Resolver**              | `TauResolver` (from [`vscode-style-resolution-and-virtual-types.md`](./vscode-style-resolution-and-virtual-types.md)) | Resolves `'@acme/sketch-kernel'` → `/node_modules/@acme/sketch-kernel/dist/index.js`                  |
| **Config bundler**        | New `ConfigBundler` in kernel worker                                                                                  | Bundles `/.tau/config.ts` with esbuild, executes via `executeCode`, harvests `TauConfig`              |
| **Plugin registrar**      | New `PluginRegistry` on `RuntimeClient`                                                                               | Diffs incoming `TauConfig` against current plugin set; calls `addPlugin`/`removePlugin` on the worker |
| **Worker plugin API**     | New `addKernelPlugin`, `removeKernelPlugin`, `addMiddleware`, etc.                                                    | Hot-add/remove without full reconnect                                                                 |
| **Lockfile**              | `/.tau/lockfile.json` (per [`api-npm-and-reproducible-snapshots.md`](./api-npm-and-reproducible-snapshots.md))        | Pins resolved plugin versions + sha256                                                                |
| **Virtual types**         | `/.tau/types/runtime-config.d.ts` (auto-emitted)                                                                      | Per-project typed plugin slot list — IntelliSense for `defineConfig({ ... })`                         |
| **Lifecycle integration** | `cadMachine` `Reconfigure` event                                                                                      | Replaces today's full disconnect-on-kernel-change with a softer plugin-set update                     |

### Architecture diagram

```
                User edits /.tau/config.ts
                          │
                          ▼
              FM machine FS event coalescer
                          │
          ┌───────────────┴───────────────┐
          │                               │
          ▼                               ▼
  RuntimeClient (main)           Monaco TS worker
  reconfigure(configPath)        re-typechecks
          │
          ▼
  workerClient.bundleConfig(configPath)
          │
          ▼ (kernel worker)
  ┌───────────────────┐
  │ ConfigBundler     │
  │  esbuild bundle   │
  │  executeCode()    │
  │  → TauConfig      │
  └────────┬──────────┘
           │
           ▼
  for each declared plugin spec:
    TauResolver.resolveToUri(spec.module)
      → file:///node_modules/.../index.js
    import(/* @vite-ignore */ url)
      → KernelDefinition / MiddlewareDefinition / ...
    validate peerRuntimeVersion
    register via addKernelPlugin / addMiddleware / ...
           │
           ▼
  emit TauConfigResolved event back to main
           │
           ▼
  RuntimeClient updates capabilitiesManifest
  CAD machine updates kernel selector UI
```

## `taucad.config.ts` Contract

```typescript
// Author API
import { defineConfig } from '@taucad/runtime/config';
import sketchKernel from '@acme/sketch-kernel';
import { telemetryMiddleware } from '@acme/telemetry';
import { stepFastTranscoder } from '@acme/step-fast';

export default defineConfig({
  kernels: [
    // Strings reference @taucad/runtime built-ins (preset.all() included by default)
    'replicad',
    'opencascade',
    // Imports register user plugins
    sketchKernel,
  ],

  middleware: [telemetryMiddleware({ endpoint: '/api/telemetry/custom' })],

  transcoders: [stepFastTranscoder],

  bundlers: [], // optional

  // Optional: override built-in plugin options
  pluginOptions: {
    replicad: {
      tessellation: { linearTolerance: 0.05 },
    },
  },

  // Optional: enable/disable specific built-ins
  enable: {
    replicad: true,
    opencascade: true,
    'kcl-zoo': false, // user opted out
  },

  // Optional: pin runtime requirement (validated on load)
  runtimeVersion: '^1.4.0',
});
```

### Type definitions

```typescript
// packages/runtime/src/config/define-config.ts (new)
export type TauConfig = {
  kernels?: ReadonlyArray<KernelSpec>;
  middleware?: ReadonlyArray<MiddlewareSpec>;
  transcoders?: ReadonlyArray<TranscoderSpec>;
  bundlers?: ReadonlyArray<BundlerSpec>;
  pluginOptions?: Record<string, Record<string, unknown>>;
  enable?: Record<string, boolean>;
  runtimeVersion?: string;
};

export type KernelSpec =
  | string // built-in id, e.g. 'replicad'
  | KernelPlugin // user-imported KernelPlugin
  | KernelDefinition; // user-imported KernelDefinition (auto-wrapped)

// Symmetric for MiddlewareSpec, TranscoderSpec, BundlerSpec.

export function defineConfig(config: TauConfig): TauConfig {
  return config;
}
```

`defineConfig` is identity-typed — same pattern as `defineKernel`. The IntelliSense win comes from the per-project virtual `runtime-config.d.ts` that lists currently-installed plugin IDs as a string union, so `kernels: ['replicad', '?']` autocompletes valid built-ins.

### Why `defineConfig` not just an inline object

Three reasons, mirroring Vite:

1. **Type inference**: defineConfig's generics narrow plugin option types based on the kernel's `optionsSchema`.
2. **Discoverability**: `defineConfig(...)` is what every contributor will search for; mirrors `vite.config.ts` muscle memory.
3. **Config evolution**: future versions can return a wrapped config without breaking the author signature.

## Hot-Reload and Lifecycle

The CAD machine already has `Reconfigure` semantics for kernel switches; we extend them:

| Event source            | What changed                             | Action                                                                                   |
| ----------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------- |
| Add new plugin          | `kernels: [...prev, new]` in config      | `addKernelPlugin` — no disconnect, no UI flash                                           |
| Remove plugin           | `kernels: [...prev]` minus one           | If active kernel removed → fallback to first available; else just deregister             |
| Update plugin options   | `pluginOptions['replicad'].tessellation` | Re-call `kernel.initialize` with new options; current render canceled and re-issued      |
| Replace plugin version  | New `moduleUrl` for same plugin id       | Full plugin teardown + reload (handle/state lost — explicitly documented)                |
| Toggle enable           | `enable['kcl-zoo']: false`               | Same as remove                                                                           |
| Change `runtimeVersion` | Range constraint changed                 | Re-validate every plugin's `peerRuntimeVersion` against the new range; reject mismatches |

Hot-reload boundaries:

- **Render in flight**: Cancel via existing `RenderTimeoutError` path; re-bundle config; re-issue render against the new plugin set.
- **Editor IntelliSense**: TS worker re-reads `/.tau/types/runtime-config.d.ts` automatically.
- **Capabilities manifest**: `RuntimeClient.routesFor()` recomputes; UI kernel selector + export-format dropdown update reactively.
- **WASM heap**: Removing a kernel does NOT free its WASM heap automatically — explicit `cleanup` hook required (already part of `KernelDefinition`).

## Security Model

Everything runs in the kernel worker. The worker has:

- No DOM access.
- No `document.cookie` / no auth tokens.
- COEP-restricted network: any third-party fetch goes through the same origin or fails.
- No access to the user's IndexedDB tables (only the FM worker has the `tau-db` handles).
- No access to `chat-rpc-socket.service.ts` (main-thread only).
- Read-write access to the project filesystem via `RuntimeFileSystemBridge`.

This is the same threat model as user CAD source code: any TS the user types in `cube.ts` runs in the same worker. A malicious npm plugin could:

1. Trash user files via `fileSystem.writeFile`.
2. Attempt cryptomining with WASM workloads (impacts UX, not credentials).
3. Exfiltrate file contents via the constrained network paths.

Mitigations (recommended but **not** blocking):

| Mitigation                      | Mechanism                                                                                                    | Impact   |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------ | -------- |
| Plugin allowlist (default-deny) | `tau.config.ts` requires explicit opt-in per plugin; new plugins prompt user on first load                   | High     |
| Filesystem path restrictions    | Restrict plugin FS access to `/node_modules/<plugin>/**` + sandboxed `/tmp/<plugin>/**`                      | Medium   |
| Network egress allowlist        | Plugins declare required hosts in `package.json#tau.permissions.hosts`; runtime enforces                     | Medium   |
| Static analysis warning         | `pnpm tau lint-plugin <pkg>` surfaces `eval`, `Function(...)`, `crypto.subtle`, suspicious URLs              | Low      |
| Verified publisher badge        | Marketplace concept — see [`tau-parts-registry-and-marketplace.md`](./tau-parts-registry-and-marketplace.md) | Med-High |

Phase-1 ships **no enforcement** — user opts in by editing `taucad.config.ts`; we surface a clear "this kernel will execute in your browser" warning on first add. Marketplace verification (Phase 3) layers signing on top.

## Recommendations Roadmap

| #   | Action                                                                                                                                                                                                                | Priority | Effort | Impact                                 | Phase |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | -------------------------------------- | ----- |
| R1  | Add `defineConfig` to `@taucad/runtime/config` entry point with `TauConfig` type. Pure identity function; ships in 1 day.                                                                                             | **P0**   | XS     | Locks in the public author API         | 1     |
| R2  | Implement `ConfigBundler` in the kernel worker — bundles `/.tau/config.ts` (or `/taucad.config.ts`) with esbuild, returns the parsed `TauConfig`.                                                                     | **P0**   | M      | Discovery mechanism                    | 1     |
| R3  | Add `RuntimeClient.reconfigure(config: TauConfig)` method. Diffs against current plugin set; calls hot add/remove/replace.                                                                                            | **P0**   | M      | Lifecycle hook                         | 1     |
| R4  | Implement `addKernelPlugin`, `removeKernelPlugin`, `addMiddleware`, `removeMiddleware`, `addTranscoder`, `removeTranscoder`, `addBundler`, `removeBundler` in the worker.                                             | **P0**   | M      | Hot reload without disconnect          | 1     |
| R5  | Add `peerRuntimeVersion?: string` to `KernelDefinition` / `KernelMiddlewareOptions` / `TranscoderDefinition` / `BundlerDefinition`. Worker validates on load, rejects mismatch with typed `PeerVersionMismatchError`. | **P1**   | S      | Version safety for third-party plugins | 1     |
| R6  | Auto-emit `/.tau/types/runtime-config.d.ts` per project enumerating built-in IDs as a literal union; user-installed plugins extend the union via virtual-types hook.                                                  | **P1**   | M      | IntelliSense for `defineConfig`        | 2     |
| R7  | Wire `/.tau/config.ts` into the existing FS watch path so a save triggers `RuntimeClient.reconfigure`.                                                                                                                | **P1**   | S      | Hot reload UX                          | 2     |
| R8  | Update `cadMachine` to handle `Reconfigure` events as a softer alternative to `KernelChange` — no full disconnect, no chat-streaming interruption.                                                                    | **P1**   | M      | Mid-session plugin install             | 2     |
| R9  | Add a "Plugins" tab to the Settings dialog that shows currently-loaded plugins, their versions, peer-requirement status, and an "Open config" button.                                                                 | **P2**   | M      | Discoverability                        | 2     |
| R10 | Document the contract in `docs/policy/library-api-policy.md` §RuntimePlugins; flag that user-facing plugin packages should ship `peerRuntimeVersion`.                                                                 | **P2**   | XS     | Policy lock-in                         | 2     |
| R11 | Add per-plugin permission declaration in `package.json#tau.permissions` (filesystem paths, network hosts) — informational only in P2, enforced in P3.                                                                 | **P3**   | M      | Security tier 1                        | 3     |
| R12 | Implement filesystem path allowlist enforcement in `RuntimeFileSystemBridge` — plugins cannot read/write outside their declared scope.                                                                                | **P3**   | L      | Security tier 2                        | 3     |
| R13 | Implement network allowlist via a Service Worker proxy that blocks fetches outside `package.json#tau.permissions.hosts`.                                                                                              | **P3**   | L      | Security tier 3                        | 3     |
| R14 | Marketplace integration: "Install from registry" button in the Plugins tab → adds entry to `taucad.config.ts` + lockfile (per [`tau-parts-registry-and-marketplace.md`](./tau-parts-registry-and-marketplace.md)).    | **P2**   | M      | Marketplace consumer                   | 3     |

Phase 1 (R1–R5) makes hand-authored configs work. Phase 2 (R6–R10) ships the polish. Phase 3 (R11–R14) layers security and marketplace.

## Trade-offs

### Config location: `/.tau/config.ts` vs `taucad.config.ts` at root

| Option                | Pros                                                        | Cons                                       |
| --------------------- | ----------------------------------------------------------- | ------------------------------------------ |
| `/.tau/config.ts`     | Hidden by default; co-located with other generated metadata | Less discoverable for new users            |
| `taucad.config.ts`    | Vite-style discoverability; obvious in file tree            | Adds top-level file users must learn about |
| Both, with precedence | Most flexible                                               | Two conventions = confusion                |

**Recommend `taucad.config.ts` at project root.** Discoverability outweighs cleanliness; matches Vite/Vitest/Next/Remix muscle memory. The `/.tau/` namespace remains the home for **derived** state (cache, lockfile, generated types).

### Soft reload vs full disconnect on plugin change

| Dimension                 | Soft reconfigure (recommended)                    | Full disconnect+reconnect                |
| ------------------------- | ------------------------------------------------- | ---------------------------------------- |
| WASM heap retention       | Yes — kernels not removed stay loaded             | No — every kernel re-initializes         |
| Mid-render handling       | Cancel + re-issue                                 | Cancel + reconnect + re-issue            |
| Implementation complexity | Higher                                            | Lower (already exists for kernel switch) |
| User-perceived latency    | <100 ms for add/remove                            | 1–3 s cold reconnect                     |
| State leakage risk        | Higher — plugin lifecycles must clean up properly | Lower — every reconnect is clean         |

Soft reconfigure is required for the chat-driven flow (mid-session plugin install must not interrupt streaming). The trade-off cost is solid plugin `cleanup` discipline — already required by the contract.

### Plugin-spec wire format: serialized vs reference

When the worker evaluates `taucad.config.ts`, it ends up with `KernelDefinition` objects in worker memory. We do NOT need to serialize these back to the main thread — the main thread only needs to know **which plugin IDs are active** for UI purposes (kernel selector, export-format dropdown). A small `PluginManifest = { kernels: { id, version }[]; middleware: ... }` posted from worker to main covers it. Avoids the perennial "Zod schemas crossing postMessage" trap.

### Where does `taucad.config.ts` get its types?

The user's editor needs `defineConfig` typed. Two options:

1. The user `import { defineConfig } from '@taucad/runtime/config'` — works only if `@taucad/runtime` is in `/node_modules/`.
2. Auto-injected via virtual-types overlay — works always, but couples editor to virtual-types layer.

Recommend (1) — prerequires `node_modules` SSoT (already P0 elsewhere) and matches the rest of Tau's authoring model. (2) is a fallback if a user wants config without any deps.

## Open Questions

1. **Should `taucad.config.ts` execution happen in the kernel worker or a dedicated config worker?** Kernel worker is simpler but blocks renders during config bundling; dedicated worker is cleaner but adds startup cost. Recommend kernel worker for Phase 1; revisit if config compile time becomes user-visible.
2. **What's the contract when two plugins claim the same kernel id?** Current presets all use unique IDs (`'replicad'`, `'opencascade'`, etc.). User plugins could collide intentionally (override) or accidentally. Recommend last-write-wins with a console warning; let opinionated users error explicitly.
3. **How does this interact with `RuntimeClient.connect()`'s eager initialization?** Today `connect` posts the full plugin set to the worker. Should `connect` defer until after `taucad.config.ts` resolves, or eagerly load presets and reconcile? Recommend eager-then-reconcile to keep first paint fast.
4. **Does `defineConfig` accept async/dynamic-import factories?** A user plugin that needs runtime fetch before registering (e.g., download a model card) is a real use case. Recommend yes — `kernels: [() => loadAcmeKernel()]` resolves promises before reconciliation.
5. **Should we also support `package.json#tau` as a config alternative?** Vite supports both `vite.config.ts` and `package.json#vite`. Useful but doubles the surface area. Defer; users can always do it manually.
6. **What about plugins distributed via the Tau Parts Registry vs npm?** Same loader mechanism; just a different `module` URL prefix (e.g., `tau:@cool/sketch-kernel` resolves through registry instead of npm). Covered in [`tau-parts-registry-and-marketplace.md`](./tau-parts-registry-and-marketplace.md).
7. **How does plugin code get audited before first execution?** Phase 1: not at all (user opts in by editing config). Phase 3: registry verification + permission declarations. Worth a UX prompt on first install: "This plugin runs JavaScript in your browser worker. Continue?"
8. **Lockfile granularity** — pin just the top-level plugin or its full transitive tree? Recommend full tree (matches npm's `package-lock.json`) for true reproducibility; covered in [`api-npm-and-reproducible-snapshots.md`](./api-npm-and-reproducible-snapshots.md).

## References

External:

- [Vite plugin API](https://vite.dev/guide/api-plugin) — `defineConfig` precedent.
- [Astro integrations](https://docs.astro.build/en/reference/integrations-reference/) — declarative integration registration via config.
- [Rollup plugin design](https://rollupjs.org/plugin-development/) — hooks-based plugin lifecycle.
- [VS Code Extension API](https://code.visualstudio.com/api) — runtime extension installation as the canonical UX prior art.

Internal:

- Foundation: [`docs/research/node-modules-single-source-of-truth.md`](./node-modules-single-source-of-truth.md) — where plugin npm packages live.
- Foundation: [`docs/research/vscode-style-resolution-and-virtual-types.md`](./vscode-style-resolution-and-virtual-types.md) — how `taucad.config.ts` resolves plugin imports.
- Sibling blueprint: [`docs/research/api-npm-and-reproducible-snapshots.md`](./api-npm-and-reproducible-snapshots.md) — lockfile-pinning of plugin versions.
- Sibling blueprint: [`docs/research/tau-parts-registry-and-marketplace.md`](./tau-parts-registry-and-marketplace.md) — discovery + verification UX.
- Sibling blueprint: [`docs/research/geospec-standalone-cad-testing-blueprint.md`](./geospec-standalone-cad-testing-blueprint.md) — GeoSpec is the standalone test engine and `@taucad/testing` is the Tau integration layer.
- Related: [`docs/research/sharing-architecture.md`](./sharing-architecture.md) — `taucad.config.ts` is included in publication payloads (vs SG15-excluded `node_modules`).
- Policy: [`docs/policy/library-api-policy.md`](../policy/library-api-policy.md), [`docs/policy/filesystem-policy.md`](../policy/filesystem-policy.md).
