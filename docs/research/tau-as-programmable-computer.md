---
title: 'Tau as a Programmable Computer'
description: 'Umbrella blueprint tying filesystem-as-source-of-truth, VSCode-style resolution, virtual types, dynamic plugins, reproducible lockfile, and Parts Registry into Tau as a programmable CAD computer.'
status: draft
created: '2026-04-23'
updated: '2026-04-23'
category: architecture
related:
  - docs/research/node-modules-single-source-of-truth.md
  - docs/research/vscode-style-resolution-and-virtual-types.md
  - docs/research/dynamic-runtime-plugins.md
  - docs/research/api-npm-and-reproducible-snapshots.md
  - docs/research/tau-parts-registry-and-marketplace.md
  - docs/research/sharing-architecture.md
  - docs/research/browser-first-parameter-aware-testing.md
---

# Tau as a Programmable Computer

Umbrella blueprint that ties five sibling investigations into a single end-to-end vision: a Tau project in any browser is a fully reproducible, package-managed, plugin-extensible, IntelliSense-equipped, parts-importable CAD environment indistinguishable in DX from a local VSCode + Node.js + npm + npm registry stack — except every byte runs in the browser.

## Executive Summary

Five sibling research blueprints, each independently scoped, snap together to become "Tau as a programmable computer." The current Tau project is a thin shell over an OPFS filesystem that only the runtime worker reads richly; Monaco reads its own typed slice via a separate `addExtraLib` channel; the kernel runtime reads its own bundle via a third channel; there is no install or version-pin or registry concept. The blueprint set converts that fragmented landscape into a single coherent stack:

1. **[Filesystem as the rich source of truth](./node-modules-single-source-of-truth.md)** — OPFS-backed `/node_modules` is the single resolution point for runtime, IntelliSense, and tests.
2. **[VSCode-style resolution + virtual types](./vscode-style-resolution-and-virtual-types.md)** — `package.json` exports + `tsconfig.json` paths + a virtual `.d.ts` plugin layer give every kernel (TS or non-TS) typed surfaces.
3. **[Dynamic runtime plugins](./dynamic-runtime-plugins.md)** — `taucad.config.ts` lets users install kernels, middleware, transcoders, bundlers from npm at runtime.
4. **[`/api/npm` caching + reproducible lockfile](./api-npm-and-reproducible-snapshots.md)** — content-addressed npm proxy + per-project lockfile pin every byte; snapshots and forks reproduce identically across users and time.
5. **[Tau Parts Registry & Marketplace](./tau-parts-registry-and-marketplace.md)** — community-published, kernel-tagged, parametric parts installable in three clicks; same lockfile model as npm; creator monetization.

Together they answer the user's prompt: _can Tau become a programmable computer?_ Yes — every primitive a programmable computer needs (resolver, types, plugins, registry, lockfile, sharing) is specified in the sibling docs; this doc sequences them, describes their seams, and identifies the smallest coherent slice that demonstrates the full vision end-to-end.

## Table of Contents

- [Vision](#vision)
- [The Five Pillars](#the-five-pillars)
- [Why Now](#why-now)
- [Cross-Cutting Concerns](#cross-cutting-concerns)
- [Integration Map](#integration-map)
- [Phasing](#phasing)
- [Smallest Coherent Demo](#smallest-coherent-demo)
- [Risks](#risks)
- [References](#references)

## Vision

A user opens `tau.new`, signs in, and:

1. Runs an agent prompt: "Build me a 3D-printable enclosure for an ESP32 with a hinged lid using the M3 pivot hinge from the registry." The agent installs `@tau/m3-pivot-hinge`, drops it into the project's `taucad.config.ts`, and writes an OpenSCAD file that imports it.
2. The Monaco editor IntelliSenses the hinge's parameters (`leaf_width`, `pin_diameter`, `knuckles`) at the import site because the registry-backed virtual-types layer projects them.
3. The kernel renders the assembly in the live viewer in <1s; the hinge's pre-rendered preview also appears in the parts pane.
4. The user adds a `taucad.config.ts` middleware: `import { telemetryMiddleware } from '@acme/telemetry'`. `pnpm`-equivalent install resolves it via `/api/npm`, populates `/node_modules/@acme/telemetry/`, the runtime reconfigures, and renders are now traced.
5. The user clicks `Publish` — a publication is created, the lockfile snapshots every dep down to its sha256, the project is sharable. A friend opens the share link in a different browser; same bytes resolve to the same renders. Same fork-from-publish flow as today, but with full dep reproducibility.
6. The user marks the enclosure as a Part itself (`@user/esp32-enclosure-v1`); it appears in the Parts sidebar; another user installs it.

**Every step above is a Code-CAD operation that was previously gated by "you'd need to set up VSCode + Node + npm + a registry."** The blueprint set removes that gate.

## The Five Pillars

### Pillar 1 — Filesystem as the rich source of truth

**Doc**: [`node-modules-single-source-of-truth.md`](./node-modules-single-source-of-truth.md)

The OPFS `/node_modules` mount becomes the single resolution surface for esbuild, Monaco, the test runtime, and the agent. The existing `SharedPool` accelerates hot reads. The existing `BoundedFileCache` provides L1 cache. `MonacoModelService` learns to read from `/node_modules`. `ModuleManager` resolves from the same filesystem instead of the bundled JS map. **No more "three parallel worlds."**

Status: foundational. Required for every other pillar.

### Pillar 2 — VSCode-style resolution + virtual types

**Doc**: [`vscode-style-resolution-and-virtual-types.md`](./vscode-style-resolution-and-virtual-types.md)

A new `@taucad/resolver` package implements `nodeNextResolution` semantics for `package.json#exports` and `tsconfig.json#paths`, used by both esbuild and Monaco's `setCompilerOptions`. A new `getVirtualTypes(input)` plugin hook on `KernelDefinition` and `MiddlewareDefinition` lets each kernel project typed surfaces — including non-TS ones (KCL, OpenSCAD) that get auto-emitted `.d.ts` ambient declarations from their parameter JSON Schema. Auto-generated `/.tau/tsconfig.generated.json` makes Monaco reflect the kernel's reality.

Status: depends on Pillar 1. Unlocks "open module → full source nav" + "typed parameter forms."

### Pillar 3 — Dynamic runtime plugins

**Doc**: [`dynamic-runtime-plugins.md`](./dynamic-runtime-plugins.md)

A user-authored `taucad.config.ts` declares which kernels, middleware, transcoders, and bundlers the runtime should load. The kernel worker bundles the config and reconstructs `RuntimeClientOptions` on every config change. Plugins resolve from `/node_modules` (via Pillar 1) or from in-project files; they're discovered via `package.json#exports` (via Pillar 2). `RuntimeClient.reconfigure()` swaps the live runtime hot. **Tau becomes user-extensible without forking the source tree.**

Status: depends on Pillars 1 + 2.

### Pillar 4 — /api/npm caching + reproducible lockfile

**Doc**: [`api-npm-and-reproducible-snapshots.md`](./api-npm-and-reproducible-snapshots.md)

A same-origin Express `/api/npm/*` proxy mirrors `registry.npmjs.org` tarballs into R2/MinIO, content-addressed by sha256. Strong HTTP caching + Service Worker `tau-npm-v1` Cache Storage means an offline user reload is instant. A new `/.tau/lockfile.json` pins every dep (npm, plugin, part, runtime) by version + sha256. **Publications snapshot the lockfile too; a fork or share replays bit-identical bytes.**

Status: required for Pillars 3 + 5 to be reproducible. Independent of Pillar 1 in implementation order.

### Pillar 5 — Tau Parts Registry & Marketplace

**Doc**: [`tau-parts-registry-and-marketplace.md`](./tau-parts-registry-and-marketplace.md)

A new `Parts` sidebar entry sits between `Community` and `Convert`. A new Postgres `part`/`part_version`/`part_install`/`part_review` schema mirrors `publication`. A new `/api/parts/*` API mirrors `/api/npm/*` (same content-addressed bucket, same lockfile, same Service Worker). A verification pipeline runs published parts through GeoSpec via Tau's `@taucad/testing` adapter for watertight/manifold/parameter-robust badges. A creator marketplace adds Stripe Connect Express for paid parts.

Status: depends on Pillars 1–4.

## Why Now

Three preconditions just landed or are landing:

| Precondition                            | State                                                          |
| --------------------------------------- | -------------------------------------------------------------- |
| Cross-origin isolation + SAB            | Shipped (per `apps/ui/server.ts` Express + `coiMiddleware`)    |
| `defineKernel` / `defineMiddleware` etc | Shipped (`packages/runtime/src/types/define-plugin.test-d.ts`) |
| `executeCode` polyglot pipeline         | Shipped (browser + Node)                                       |
| Browser-first testing primitive         | Designed (per `browser-first-parameter-aware-testing.md`)      |
| Sharing/publication content-addressing  | Designed (per `sharing-architecture.md`)                       |
| Filesystem layer with OPFS + SharedPool | Shipped (per `packages/filesystem/`)                           |

Six existing assets, two designed-but-not-yet-built. The umbrella vision is the smallest set of bets that turns the existing primitives into a recognisable VSCode-class CAD experience.

## Cross-Cutting Concerns

### Security model

All five pillars share a single security model:

- Plugins, parts, and npm packages execute inside the existing kernel-worker sandbox (web worker; no DOM; no `eval`-of-user-code in the main thread).
- Network egress from a plugin/part is blocked by default; opt-in via manifest `permissions` field with a user-confirmation dialog.
- Filesystem access from a plugin/part is scoped to the project root; no escape outside `/`.
- Service Worker validates `/api/npm/-/sha256/<sha>` responses against the lockfile entry's integrity hash before serving.

### Versioning model

| Layer                  | Versioning unit                                 | Mutability                               |
| ---------------------- | ----------------------------------------------- | ---------------------------------------- |
| Tau runtime            | Semver (`@taucad/runtime`)                      | Mutable; published via Nx Release        |
| User project           | nanoid `Project` row + per-publication revision | Immutable per revision                   |
| npm package            | Semver tag in `npm_package_version`             | Immutable per version                    |
| Plugin (npm-published) | Semver tag                                      | Immutable per version                    |
| Part                   | Semver tag in `part_version`                    | Immutable per version                    |
| Lockfile               | `lockfileVersion` integer + per-dep sha256      | Immutable; regenerated on any dep change |

### Reproducibility budget

A target metric: **opening a published Tau project in a fresh browser profile produces a render bit-identical to the author's original 1 year later, assuming registry availability.** This is the contract reproducibility gives us — required for engineering use cases (regulatory submissions, parts ordering, supply chain). Lockfile + content-addressed storage + immutable versions are the mechanism.

### Telemetry

Each pillar surfaces metrics via the existing `@taucad/telemetry`:

- Pillar 1: cache hit ratio, fs read latency.
- Pillar 2: resolver miss rate, virtual-types regeneration count.
- Pillar 3: plugin load time, reconfigure frequency, plugin error count.
- Pillar 4: `/api/npm` cache hit ratio, R2 origin reads, lockfile mismatch warnings.
- Pillar 5: install conversion rate, verification pass rate, creator earnings.

## Integration Map

```
                        ┌────────────────────────────────────┐
                        │           User UI Layer             │
                        │  Editor · Viewer · Parts Sidebar    │
                        │  Composer · Settings · Publish      │
                        └──────────────┬──────────────────────┘
                                       │
                                       ▼
                        ┌────────────────────────────────────┐
                        │  Project filesystem (OPFS-backed)   │
                        │  /                                  │
                        │  ├── *.scad, *.kcl, *.ts (sources) │
                        │  ├── taucad.config.ts (P3)         │
                        │  ├── .tau/                         │
                        │  │   ├── tsconfig.generated.json (P2) │
                        │  │   ├── types/*.d.ts (P2)         │
                        │  │   ├── lockfile.json (P4)        │
                        │  │   └── parts/<scope>/<name>/ (P5)│
                        │  └── node_modules/ (P1, populated   │
                        │      via /api/npm in P4)            │
                        └──────────────┬──────────────────────┘
                                       │
            ┌──────────────────────────┼─────────────────────────┐
            ▼                          ▼                         ▼
    ┌──────────────┐         ┌──────────────────┐      ┌──────────────────┐
    │ TauResolver  │         │ MonacoModelSvc   │      │ Runtime Worker   │
    │ (P2)         │◄────────┤ + TypeAcq (P2)   │      │ (P3)             │
    └──────┬───────┘         └────────┬─────────┘      └────────┬─────────┘
           │                          │                          │
           │                          │                          │
           ▼                          ▼                          ▼
    ┌────────────────────────────────────────────────────────────────────┐
    │             Service Worker — tau-npm-v1 + tau-parts-v1 (P4 / P5)   │
    └──────────────────────────────────┬─────────────────────────────────┘
                                       │
                                       ▼
                        ┌──────────────────────────────────┐
                        │ /api/npm/*    /api/parts/*       │
                        │ (P4)          (P5)               │
                        └──────────┬───────────────────────┘
                                   │
                                   ▼
                        ┌──────────────────────────────────┐
                        │ R2 / MinIO (content-addressed)   │
                        │ Postgres (npm metadata, parts,    │
                        │           publications)          │
                        └──────────────────────────────────┘
```

## Phasing

### Phase 1 — Foundation (P1 + P4 read paths)

- Land the OPFS `/node_modules` mount + cache integration (Pillar 1).
- Land `/api/npm/*` read proxy + Service Worker + lockfile read path (Pillar 4 minus publish/reproducibility).
- **Outcome**: Hand-edit a project's `package.json`, install pulls real npm packages into a real `/node_modules`, IntelliSense and runtime both see them.

### Phase 2 — Typed reuse (P2)

- Land `@taucad/resolver` package, esbuild + Monaco unification.
- Land `getVirtualTypes` hook + auto-tsconfig emission.
- Wire KCL and OpenSCAD parameter virtual `.d.ts` emitters.
- **Outcome**: Open a `.scad` file, hover params in Monaco, see types projected from the kernel.

### Phase 3 — Extensibility (P3)

- Land `taucad.config.ts` schema + bundler in kernel worker.
- Land `RuntimeClient.reconfigure()` swap path.
- **Outcome**: Add a third-party kernel from npm, see it appear in the kernel selector at runtime.

### Phase 4 — Reproducibility (P4 publish path)

- Land lockfile write/snapshot path.
- Wire publication record to include lockfile.
- Wire fork to replay lockfile.
- **Outcome**: Publish project A, fork into project B in a different browser, render byte-identical to A.

### Phase 5 — Community (P5)

- Land Parts schema + read API + sidebar + browse + install.
- Land publish part flow + verification phases 1–4.
- **Outcome**: Publish a hinge, install it from another project, see it appear in IntelliSense.

### Phase 6 — Marketplace (P5 monetization)

- Stripe Connect Express + paid parts + creator dashboard.
- **Outcome**: A third-party creator earns money on Tau.

## Smallest Coherent Demo

To prove the vision works end-to-end before committing the full roadmap, a minimum demonstration:

1. Hand-craft a `taucad.config.ts` that imports a one-file fake plugin from `/node_modules/@demo/fake-kernel/` (skip Pillars 4+5 by using a hand-staged `node_modules`).
2. Show Monaco IntelliSense the plugin's `defineKernel` types from a hand-staged `.d.ts` (skip Pillar 5 virtual-types layer; just hand-write the types).
3. Show the runtime executing the new kernel in the live viewer.
4. Show `RuntimeClient.reconfigure()` swapping a middleware.

If that 4-step demo runs end-to-end on a single afternoon's hand-staging, the architecture is sound; the rest is implementation work, not exploration.

## Risks

| Risk                                                               | Mitigation                                                                                         |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| Bundle/install perf regresses with full `/node_modules`            | Pillar 1 specifies SharedPool + BoundedFileCache hot-path; benchmark per phase.                    |
| TypeScript LSP perf in Monaco with thousands of `.d.ts` extra libs | `addExtraLib` is sparse-loading; Pillar 2 specifies on-demand registration via `onLanguage`.       |
| Plugin-author abuse of `taucad.config.ts` (RCE, network, FS)       | Pillar 3's worker sandbox + permission manifest; Pillar 5's verification pipeline.                 |
| `/api/npm` traffic costs                                           | R2 + Service Worker absorbs hot files; warm cache locally; only first install hits origin.         |
| Lockfile drift between dev and shared snapshot                     | Pillar 4 specifies `lockfileVersion` strict matching + per-dep sha256 verification.                |
| Verification queue depth at Parts Registry scale                   | Pillar 5 specifies async queue with priority lanes; charge for "expedited" if needed.              |
| Marketplace operational complexity (Stripe, tax, KYC, refunds)     | Phase 6 only; defer until free Parts traction validates demand.                                    |
| Multi-kernel discovery confusion (which `@tau/hinge` to install?)  | Pillar 5's `family` metadata clusters siblings; install picks the active project's kernel.         |
| User confusion about "what installed what"                         | Lockfile is human-readable; new "Dependencies" pane in IDE shows a tree; agent can answer in chat. |
| Forward compatibility across Tau runtime upgrades                  | Pillar 4 lockfile records the runtime version range; load-time refusal with clear upgrade prompt.  |

## References

The five sibling blueprints, in dependency order:

1. [`docs/research/node-modules-single-source-of-truth.md`](./node-modules-single-source-of-truth.md) — Pillar 1.
2. [`docs/research/vscode-style-resolution-and-virtual-types.md`](./vscode-style-resolution-and-virtual-types.md) — Pillar 2.
3. [`docs/research/dynamic-runtime-plugins.md`](./dynamic-runtime-plugins.md) — Pillar 3.
4. [`docs/research/api-npm-and-reproducible-snapshots.md`](./api-npm-and-reproducible-snapshots.md) — Pillar 4.
5. [`docs/research/tau-parts-registry-and-marketplace.md`](./tau-parts-registry-and-marketplace.md) — Pillar 5.

Background:

- [`docs/research/sharing-architecture.md`](./sharing-architecture.md) — publication infra reused.
- [`docs/research/browser-first-parameter-aware-testing.md`](./browser-first-parameter-aware-testing.md) — verification harness reused.
