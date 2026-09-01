---
title: 'Tau Parts Registry & Marketplace'
description: 'Blueprint for a kernel-agnostic registry of reusable Code-CAD parts (KCL, OpenSCAD, Replicad, JSCAD, Manifold, OpenCASCADE) with a Parts sidebar, install/import workflow, and a creator marketplace with verification, ratings, and monetization.'
status: draft
created: '2026-04-23'
updated: '2026-04-23'
category: architecture
related:
  - docs/research/sharing-architecture.md
  - docs/research/dynamic-runtime-plugins.md
  - docs/research/api-npm-and-reproducible-snapshots.md
  - docs/research/vscode-style-resolution-and-virtual-types.md
  - docs/research/node-modules-single-source-of-truth.md
  - docs/research/browser-first-parameter-aware-testing.md
---

# Tau Parts Registry & Marketplace

Blueprint for a registry of reusable Code-CAD parts — parametric hinges, brackets, mounts, gears, fasteners, enclosures — that any Tau user can publish, discover, install, and consume across kernels (KCL, OpenSCAD, Replicad, JSCAD, Manifold, OpenCASCADE), surfaced through a new "Parts" sidebar entry that grows into a full marketplace with verification badges, ratings, and creator monetization.

## Executive Summary

Today the closest thing to a parts library is the `presets.all()` kernel catalog and any user happens to copy-paste between projects. There is no discovery surface, no install workflow, no cross-project reuse, no community attribution. The vision is **`@taucad/parts` as the npm-of-CAD**: a Tau-owned registry that mirrors npm's content-addressed model from [`api-npm-and-reproducible-snapshots.md`](./api-npm-and-reproducible-snapshots.md), reuses the publication infrastructure from [`sharing-architecture.md`](./sharing-architecture.md), plugs into the dynamic plugin loader from [`dynamic-runtime-plugins.md`](./dynamic-runtime-plugins.md), and surfaces in the IDE via a new sidebar entry sibling to the existing `Community` and `Convert` items in `app-sidebar.tsx`. A part is a kernel-tagged, parameter-typed, screenshot-equipped, optionally-tested unit of CAD that imports cleanly into any Tau project: `import { hinge } from '@tau/parts/m3-pivot-hinge'` for an OpenSCAD hinge, `import { bracket } from '@tau/parts/wall-bracket'` for a Replicad bracket. The Parts sidebar is browse-search-install in three clicks; install adds an entry to the project's `taucad.config.ts` deps and the lockfile; the part's source materializes under `/.tau/parts/<scope>/<name>/`.

The registry is content-addressed (sha256-keyed blobs in R2, same bucket as publications), version-tagged (semver, immutable per version), kernel-tagged (a part declares which kernels it supports), and license-tagged (MIT/Apache/CC-BY/proprietary). The marketplace layer adds a Postgres `part`, `part_version`, `part_install`, `part_review`, `creator_payout` schema; a `tau-parts.dev` discovery surface (or `parts.tau.new`); a verification pipeline that runs each part through GeoSpec via Tau's `@taucad/testing` adapter (per [`geospec-standalone-cad-testing-blueprint.md`](./geospec-standalone-cad-testing-blueprint.md)) for watertightness, manifold-ness, and dimensional sanity; and a creator monetization tier (free / one-time / subscription) with Stripe Connect for payouts. **Crucially, this is one consistent `import` mechanism** — kernel files (`.scad`, `.kcl`), TS files (`.ts` for Replicad/Manifold/OC), middleware, transcoders, and even runtime plugins all flow through the same registry / lockfile / Service Worker chain. Specialization happens **above** the install layer; the install layer itself is uniform.

## Table of Contents

- [Problem Statement](#problem-statement)
- [Scope and Non-Goals](#scope-and-non-goals)
- [Findings](#findings)
- [Target Architecture](#target-architecture)
- [Part Anatomy](#part-anatomy)
- [Registry API](#registry-api)
- [Parts Sidebar UX](#parts-sidebar-ux)
- [Install Flow](#install-flow)
- [Verification & Quality Tiers](#verification--quality-tiers)
- [Marketplace & Monetization](#marketplace--monetization)
- [Recommendations Roadmap](#recommendations-roadmap)
- [Trade-offs](#trade-offs)
- [Open Questions](#open-questions)
- [References](#references)

## Problem Statement

Five concrete frictions sum to "no community CAD library":

1. **Reuse is copy-paste.** A user designing a hinge for project A cannot reach into project B's hinge without manually copying files, parameters, and (mentally) the kernel context. The agent cannot suggest "use the hinge from your previous project."
2. **No discovery surface.** Tau has no equivalent of npm.com, Thingiverse, GrabCAD, or Onshape Public Documents. The `Community` sidebar entry exists (`route.constants.ts:57-60`) but routes to publications, not parts.
3. **No multi-kernel sharing.** A bracket parametrically generated in OpenSCAD cannot be referenced by a Replicad project today. The kernel boundary is an unwanted distribution boundary.
4. **No quality signals.** A user who finds a hinge somewhere has no programmatic guarantee it produces watertight, manifold geometry across its parameter range. GeoSpec plus the Tau adapter creates the testing primitive, but the registry records which parts pass.
5. **No creator economy.** Skilled CAD authors have no incentive to invest time in publishing high-quality parametric parts; CAD's equivalent of "the npm package author" doesn't exist as a recognized role.

## Scope and Non-Goals

**In scope**

- Part anatomy: file structure, manifest, metadata, kernel tags, screenshots, tests.
- Registry storage and API (`/api/parts/*`): publish, version, query, install.
- Parts sidebar UX in `app-sidebar.tsx`.
- Install flow: from registry to project FS to lockfile to import-resolution.
- Verification pipeline running browser-first tests on every published version.
- Quality tiers and badges.
- Discovery surface: search, filter by kernel/category/license, top creators.
- Monetization plumbing: free / one-time / subscription parts, Stripe Connect for creator payouts.

**Out of scope**

- Procedural part _generation_ (e.g., GPT-3.5 → STEP file) — orthogonal direction.
- Part _editing_ in the registry UI — parts are authored in the Tau IDE, published to the registry.
- Federated / decentralized registries — single Tau-owned registry initially.
- Cryptographic supply-chain attestation (Sigstore-style) — defer to mature lockfile rotation story.
- Trademark / IP enforcement at scale — operational, not architectural; covered by takedown contract.

## Findings

### Finding 1: The publication infrastructure is 80% of the registry infrastructure

`sharing-architecture.md` already specifies content-addressed S3-compatible storage (R2 prod, MinIO dev), a Postgres `publication` table with manifest+visibility+lineage, an O(1) fork via pointer-copy with copy-on-write, and a 3-tier visibility model. **Parts are publications with three additional axes:**

| Axis             | Publication                                       | Part                                                            |
| ---------------- | ------------------------------------------------- | --------------------------------------------------------------- |
| Identity         | nanoid slug (`tau.new/p/abc123`)                  | scoped name (`@user/hinge` or `@tau/m3-pivot-hinge`)            |
| Versioning       | Implicit per `Publish` event (immutable revision) | Semver — explicit `1.0.0`, `1.1.0` etc.                         |
| Discovery        | Public/Unlisted/Private                           | Public + listed in registry; filtered by kernel/category        |
| Consumption      | Open in viewer / Fork                             | Install into another project                                    |
| Manifest content | Project files + chat (opt-in) + lockfile          | Same + part-specific metadata (kernel tags, screenshots, tests) |

The implication is huge: a part can be published with one extra commit step on top of a normal publication. The registry table is a thin extension of `publication` (or its own table that references publication blobs).

### Finding 2: Kernel-agnostic imports are already nearly possible via the resolver

Per [`vscode-style-resolution-and-virtual-types.md`](./vscode-style-resolution-and-virtual-types.md), `TauResolver` handles `package.json#exports` and `tsconfig.paths`. A part published as `@tau/parts/m3-pivot-hinge` materializes at `/.tau/parts/@tau/m3-pivot-hinge/` in the user's project filesystem. The resolver maps `import { hinge } from '@tau/parts/m3-pivot-hinge'` to that path; the kernel reads the file (`.scad`, `.kcl`, `.ts`) like any other source file; the virtual-types layer surfaces the part's parameter shape as if it were a local file.

So **a part import is just a normal local import after install** — no special-case hot path in the bundler, no kernel-specific machinery. The registry's only job is to **deliver the bytes**.

### Finding 3: The lockfile already has a `kind: 'part'` slot

[`api-npm-and-reproducible-snapshots.md`](./api-npm-and-reproducible-snapshots.md)'s lockfile spec already enumerates `kind: 'npm' | 'plugin' | 'part' | 'runtime' | 'builtin'`. Parts replay through the same Service Worker → R2 → on-disk path as npm packages. Reproducibility is automatic.

### Finding 4: Sidebar sibling is the natural placement

`app-sidebar.tsx:42-48` shows three layers: `NavChat`, `NavHistory + NavMain`, `NavMain (secondary)`. `navMain` lists `Projects`, `Community`, `Convert`, `Import`, `Usage` (`route.constants.ts:36-81`). **A new `Parts` entry slots between `Community` and `Convert`** — it is the discovery surface for community-published reusable units, distinct from `Community` (which surfaces full publications) and `Convert` (which is the format conversion utility). Icon candidate: `Boxes` from lucide (a stack of cubes — different from `Hammer`/Projects and `Frame`/Sample-projects).

### Finding 5: Cross-kernel sharing requires a "neutral" part format only for _display_

A part is **kernel-native at runtime** — an OpenSCAD hinge runs in the OpenSCAD kernel, a Replicad hinge in the Replicad kernel. The cross-kernel surface is **not** a universal CAD format; it is a registry that lets a user discover parts authored for any kernel and pick the one matching their project. For users who want a particular part adapted across kernels, the answer is **multiple part listings** (one per kernel, sharing a `family` field and a `glb` preview). Trying to make a single part run on every kernel is the bad-old "lowest common denominator" CAD interchange story; we deliberately avoid it.

### Finding 6: Verification at publish time is enabled by browser-first testing

GeoSpec plus Tau's `@taucad/testing` adapter runs in the browser and Node. **The same test modules can run server-side in a headless browser worker** as part of the registry's publish pipeline:

1. Author publishes part with `*.test.ts` files.
2. Registry server queues a verification job.
3. Worker spins up GeoSpec through the Tau adapter, runs every test across declared parameter groups, captures pass/fail + geometry evidence hash.
4. Result attached to the part version: `verification.status: 'verified' | 'failed' | 'pending'`, `verification.tests: 12 passed, 0 failed`.

Result is a programmatic quality signal — much stronger than star ratings.

## Target Architecture

| Layer                   | Module                                                                | Responsibility                                                                                      |
| ----------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| **Registry storage**    | R2 / MinIO via `ObjectStorageService` (per `sharing-architecture.md`) | Content-addressed sha256 blobs under `tau-content/parts/<sha256>`                                   |
| **Registry DB**         | New `part`, `part_version`, `part_install`, `part_review` tables      | Postgres schema mirroring `publication` shape                                                       |
| **Registry API**        | New NestJS `parts` module in `apps/api/app/api/parts/`                | `/api/parts/*` REST + Socket.IO subscriptions                                                       |
| **Verification worker** | New background job in `apps/api`                                      | Runs GeoSpec through `@taucad/testing` against each new version; records pass/fail + evidence hash  |
| **Sidebar entry**       | New `'Parts'` route in `route.constants.ts:36-81`                     | Sibling to `Community`/`Convert`; lucide `Boxes` icon                                               |
| **Browse UI**           | New `apps/ui/app/routes/parts.tsx`                                    | Grid of parts; filters; search; infinite scroll                                                     |
| **Part detail UI**      | `apps/ui/app/routes/parts.$slug.tsx`                                  | Screenshots, parameters, install button, reviews, version history                                   |
| **Install action**      | New mutation in `apps/ui/app/services/parts.service.ts`               | Updates `taucad.config.ts` deps; updates `/.tau/lockfile.json`; downloads files into `/.tau/parts/` |
| **Publish action**      | New `tool-publish-part` (chat tool) + `Publish` button in IDE         | Wraps current project as a part; uploads via `/api/parts/publish`                                   |
| **Marketplace**         | New `payout` table; Stripe Connect integration                        | Creator payouts for paid parts                                                                      |

## Part Anatomy

A part is a self-contained directory:

```
@tau/m3-pivot-hinge/
  part.json              ← manifest
  index.scad             ← primary source (or index.ts, index.kcl)
  README.md              ← author docs
  preview.glb            ← rendered preview (auto-generated at publish)
  thumbnail.png          ← marketplace thumbnail (auto-generated at publish)
  test.ts                ← optional verification tests
  examples/              ← optional usage examples
    basic-mount.scad
    flush-mount.scad
  LICENSE                ← required (MIT/Apache/CC-BY/proprietary)
```

### `part.json` manifest

```json
{
  "name": "@tau/m3-pivot-hinge",
  "version": "1.2.0",
  "description": "Parametric M3-screw pivot hinge with adjustable leaf width and pin diameter.",
  "kernel": "openscad",
  "category": "fasteners",
  "tags": ["hinge", "m3", "pivot", "3d-print", "fdm-friendly"],
  "license": "MIT",
  "author": {
    "id": "u_abc123",
    "name": "Hingemaster",
    "url": "https://tau.new/u/hingemaster"
  },
  "entry": "./index.scad",
  "examples": ["./examples/basic-mount.scad", "./examples/flush-mount.scad"],
  "tests": ["./test.ts"],
  "parameters": {
    "leaf_width": { "type": "number", "default": 30, "min": 10, "max": 100, "unit": "mm" },
    "pin_diameter": { "type": "number", "default": 3, "min": 1, "max": 10, "unit": "mm" },
    "knuckles": { "type": "integer", "default": 3, "min": 2, "max": 8 }
  },
  "supports": {
    "openscad": ">=2024.06",
    "tau-runtime": "^1.4.0"
  },
  "preview": {
    "glb": "./preview.glb",
    "thumbnail": "./thumbnail.png"
  },
  "pricing": {
    "model": "free"
  }
}
```

`parameters` is the same JSON Schema shape that `getParameters` returns — fed directly into the virtual-types layer so consumers get full IntelliSense:

```typescript
// User project after install
import { hinge, defaultParams } from '@tau/m3-pivot-hinge';
//                ^ typed as { leaf_width: number; pin_diameter: number; knuckles: number }
```

### Multi-kernel parts (sibling listings)

Authors who want a hinge across kernels publish multiple listings sharing a `family` field:

```json
{ "name": "@tau/m3-pivot-hinge", "kernel": "openscad", "family": "m3-pivot-hinge" }
{ "name": "@tau/m3-pivot-hinge-replicad", "kernel": "replicad", "family": "m3-pivot-hinge" }
```

The Parts UI groups by `family`; install picks the one matching the active project's kernel.

## Registry API

| Method | Path                                                    | Purpose                                                    |
| ------ | ------------------------------------------------------- | ---------------------------------------------------------- |
| GET    | `/api/parts/search?q=hinge&kernel=openscad&license=MIT` | Faceted search; returns paginated `PartSummary[]`          |
| GET    | `/api/parts/categories`                                 | Catalog of category tags                                   |
| GET    | `/api/parts/:scope?/:name`                              | Part detail incl. all versions                             |
| GET    | `/api/parts/:scope?/:name/:version`                     | Specific version manifest + verification status            |
| GET    | `/api/parts/:scope?/:name/:version/files/*`             | Per-file fetch (mirrors `/api/npm` pattern)                |
| GET    | `/api/parts/-/sha256/:sha`                              | Content-addressed lookup (lockfile replay)                 |
| POST   | `/api/parts/publish` (auth required, body: tar of part) | Author publishes new version; returns assigned version row |
| POST   | `/api/parts/:scope?/:name/:version/install`             | Records install for analytics + ratings denominator        |
| POST   | `/api/parts/:scope?/:name/reviews` (auth required)      | Creator review                                             |
| GET    | `/api/parts/family/:familyId`                           | All parts sharing a family (multi-kernel listings)         |

All responses set the same COEP-safe headers as `/api/npm/*`. Same Service Worker intercepts both paths under `/api/`.

### Backed by the same content-addressed bucket

Part files share R2 with publications and npm. A `part.json`'s `files` table maps logical paths (`./index.scad`) to sha256 keys; identical files across versions or across parts (e.g., shared `LICENSE`) dedupe.

## Parts Sidebar UX

### Sidebar item

Add to `route.constants.ts:36-81` `navMain` between `Community` and `Convert`:

```typescript
{
  title: 'Parts',
  url: '/parts',
  icon: Boxes,
}
```

### Parts route — `/parts`

Layout sketch:

- **Left**: faceted filter rail — kernel (Replicad / OpenSCAD / KCL / JSCAD / Manifold / OpenCASCADE / All), category (fasteners / mounts / gears / electronics / enclosures / artistic), license (MIT / Apache / CC-BY / proprietary), price (free / paid), verification (verified / unverified).
- **Top**: search bar + sort (popular / newest / top rated).
- **Main**: card grid. Each card shows thumbnail, name, kernel badge, author, star rating, install count, free/paid badge.
- **Right** (optional): "Featured" carousel and "Recently installed" personal list.

Cards link to `/parts/:scope/:name`.

### Part detail — `/parts/:scope/:name`

- Hero: rotating GLB viewer (uses Tau's existing `chat-viewer-dockview.tsx` GLB pane embedded read-only).
- Tabs: **Overview** (README + parameters table), **Versions** (changelog), **Reviews**, **Source** (browse files), **Tests** (verification report).
- Action: `Install` button (large primary). Drops down to "Install latest", "Install specific version", "Open in new project".
- Sidebar: author profile card, related parts (same family or category), license badge, verification badge.

### Install button behaviour

Click → modal: "Add `@tau/m3-pivot-hinge@1.2.0` to which project?" → choose existing project or new. On confirm:

1. POST `/api/parts/<...>/install` for analytics.
2. Add to `taucad.config.ts` `dependencies` (auto-edits via `MonacoModelService` write).
3. Add to `/.tau/lockfile.json` (per [`api-npm-and-reproducible-snapshots.md`](./api-npm-and-reproducible-snapshots.md)).
4. Download files via `/api/parts/<...>/files/*` into `/.tau/parts/<scope>/<name>/`.
5. Toast: "Installed; `import { hinge } from '@tau/m3-pivot-hinge'` is now available."

## Install Flow

```
Browse / Detail → Install click
        │
        ▼
  parts.service.installPart(slug, version, projectId)
        │
        ▼
  ┌─────────────────────────────────────┐
  │ 1. POST /api/parts/<slug>/install    │ (analytics; anonymous OK)
  │ 2. Add lockfile entry kind:'part'   │
  │ 3. Resolve files via /api/parts/-/sha256/:sha │
  │ 4. Write into /.tau/parts/<scope>/<name>/ via FileService │
  │ 5. Edit taucad.config.ts to add the dep │
  └──────────────┬──────────────────────┘
                 │
                 ▼
  RuntimeClient.reconfigure() (per dynamic-runtime-plugins)
                 │
                 ▼
  TauResolver picks up the new path (per vscode-style-resolution)
                 │
                 ▼
  IntelliSense surfaces the part's parameter shape
                 │
                 ▼
  User can now `import { hinge } from '@tau/m3-pivot-hinge'`
```

Time budget: <2 seconds for a 50KB part on a warm proxy cache; <10 seconds cold.

### Resolver mapping

`taucad.config.ts` after install:

```typescript
import { defineConfig } from '@taucad/runtime/config';

export default defineConfig({
  dependencies: {
    '@tau/m3-pivot-hinge': '^1.2.0',
  },
});
```

`TauResolver`'s tsconfig overlay:

```json
{
  "compilerOptions": {
    "paths": {
      "@tau/m3-pivot-hinge": ["./.tau/parts/@tau/m3-pivot-hinge/index.scad"],
      "@tau/m3-pivot-hinge/*": ["./.tau/parts/@tau/m3-pivot-hinge/*"]
    }
  }
}
```

For an OpenSCAD part, `index.scad` becomes the import target; the OpenSCAD kernel reads it via the existing kernel pipeline. For a TS part, `index.ts` is the target; the bundler picks it up. **Same import semantics across kernels** — that's the whole point.

## Verification & Quality Tiers

Each published version goes through a verification queue:

| Phase                | Action                                                                              | Outcome                         |
| -------------------- | ----------------------------------------------------------------------------------- | ------------------------------- |
| **1. Static**        | Validate `part.json`, license file present, manifest schema, no banned package deps | Pass / fail with reason         |
| **2. Render**        | Spawn headless browser worker; load part; render with default params; capture GLB   | Pass = renderable, fail = abort |
| **3. Watertight**    | Run `analyzeGlb(...).watertight`                                                    | Watertight badge if pass        |
| **4. Manifold**      | Connected components = 1                                                            | Manifold badge                  |
| **5. Tests**         | Run `*.test.ts` from manifest                                                       | "X tests passing" badge         |
| **6. Cross-param**   | Sample parameter space (8 samples), re-render each, repeat watertight/manifold      | "Robust" badge                  |
| **7. Sandbox check** | No outbound network calls, no FS writes outside part dir                            | Sandbox badge                   |

Quality tiers:

| Tier         | Badge       | Requirement                                             |
| ------------ | ----------- | ------------------------------------------------------- |
| **Verified** | Green check | Phases 1–4 pass                                         |
| **Tested**   | Blue beaker | + Phase 5 with at least one assertion                   |
| **Robust**   | Gold star   | + Phase 6 across 8 parameter samples                    |
| **Trusted**  | Crown       | + manual review by Tau curator (rare; for top creators) |

Failed verification → `pending review`; author can fix and republish; the failed version stays installable but with a clear "verification failed" warning.

## Marketplace & Monetization

### Pricing models

| Model            | Description                            | Stripe product      |
| ---------------- | -------------------------------------- | ------------------- |
| **Free**         | Default; no payment                    | None                |
| **One-time**     | Pay once per user, all versions        | One-shot Checkout   |
| **Subscription** | Monthly / annual access to all updates | Stripe Subscription |
| **Bundle**       | A creator's collection at a discount   | Composite product   |

Revenue split: 80% creator / 20% Tau (matches Gumroad/Lemon Squeezy reference rates and undercuts App Store's 30%).

### Creator dashboard

A new `/u/me/parts` route shows:

- Published parts with install counts, ratings, verification status.
- Earnings (cumulative + monthly) with Stripe Connect status.
- "New version" workflow that diffs against last version and warns about breaking parameter renames.
- Analytics: views, installs, conversion rate per part.

### Stripe Connect

For paid parts, creators onboard via Stripe Connect Express (lowest friction; KYC handled by Stripe). Tau's platform fee = 20%, Stripe fees + payouts handled by Stripe. Tax handling defers to Stripe Tax (EU VAT, US sales tax, etc.).

### Anti-abuse

| Risk                              | Mitigation                                                                     |
| --------------------------------- | ------------------------------------------------------------------------------ |
| Plagiarized parts                 | DMCA takedown contract + verified-creator badge                                |
| Malicious code in published parts | Sandboxed verification + permission audit on publish                           |
| Fake reviews                      | Reviews require verified install; one review per (user, part)                  |
| Squatting popular names           | First-come-first-served on `@tau/`-scope NOT permitted; reserved scope         |
| Dependency-confusion attacks      | Internal scopes (`@tau/`, `@taucad/`) reserved; user scope `@<username>/` only |

## Recommendations Roadmap

| #   | Action                                                                                                                                                            | Priority | Effort | Impact                    | Phase |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ------------------------- | ----- |
| R1  | Schema-define `Part`, `PartVersion`, `PartInstall`, `PartReview` Postgres tables, mirroring `publication` shape from `sharing-architecture.md`.                   | **P0**   | M      | Foundation for everything | 1     |
| R2  | NestJS `parts` module: `/api/parts/search`, `/api/parts/:slug`, `/api/parts/:slug/:version`, `/api/parts/-/sha256/:sha`, `/api/parts/publish` — read paths first. | **P0**   | M      | Registry API              | 1     |
| R3  | Define and document the `part.json` manifest schema in `libs/types/src/types/part.types.ts`. Zod-validated.                                                       | **P0**   | S      | Author contract           | 1     |
| R4  | Add `Parts` sidebar entry to `route.constants.ts`; route `/parts` with grid + filter + search.                                                                    | **P0**   | M      | Discovery surface         | 1     |
| R5  | Part detail route `/parts/:scope/:name` with overview, versions, reviews, source browser tabs.                                                                    | **P0**   | M      | Detail surface            | 1     |
| R6  | `parts.service.installPart(slug, version, projectId)` flow: writes lockfile + files + edits taucad.config.ts.                                                     | **P0**   | M      | Install loop              | 1     |
| R7  | `tool-publish-part` chat tool + manual `Publish as Part` button in IDE: bundles current project as a part, uploads.                                               | **P1**   | M      | Author flow               | 2     |
| R8  | Verification worker (`apps/api/app/queue/`) running phases 1–4 (static, render, watertight, manifold).                                                            | **P1**   | L      | Quality signal            | 2     |
| R9  | Phase 5 (tests) + 6 (cross-param) + 7 (sandbox) verification.                                                                                                     | **P2**   | L      | Stronger quality tier     | 2     |
| R10 | Reviews + ratings + install counts; review form on part detail.                                                                                                   | **P1**   | M      | Social signal             | 2     |
| R11 | Stripe Connect Express onboarding; one-time and subscription product types; payout flow.                                                                          | **P2**   | L      | Monetization              | 3     |
| R12 | Creator dashboard at `/u/me/parts` with earnings, analytics, version diffing.                                                                                     | **P2**   | M      | Creator UX                | 3     |
| R13 | Bundles: composite product + bundle pricing.                                                                                                                      | **P3**   | M      | Pricing flexibility       | 3     |
| R14 | Multi-kernel `family` discovery: surface other-kernel siblings on part detail.                                                                                    | **P2**   | S      | Cross-kernel UX           | 2     |
| R15 | DMCA takedown contract + admin moderation tooling at `/admin/parts`.                                                                                              | **P1**   | M      | Operational safety        | 2     |
| R16 | "Featured" curation on `/parts` home; weekly Tau-picks.                                                                                                           | **P3**   | S      | Discovery polish          | 3     |
| R17 | Part collections: user-created lists ("My favourite hinges") with public/private visibility.                                                                      | **P3**   | M      | Social DX                 | 3     |
| R18 | Auto-suggest in chat agent: when user mentions a part name, suggest installable parts via `/api/parts/search`.                                                    | **P3**   | M      | Agent integration         | 3     |

Phase 1 (R1–R6) ships browse + install for free parts. Phase 2 (R7–R10, R14, R15) opens publication and verification. Phase 3 (R11–R13, R16–R18) adds monetization and polish.

## Trade-offs

### Single registry vs federated

| Dimension          | Single registry (recommended)             | Federated (Verdaccio-style)             |
| ------------------ | ----------------------------------------- | --------------------------------------- |
| Discovery UX       | One search, one ranking, one trust signal | Fragmented; users must register sources |
| Trust model        | Tau's verification + curation             | Per-source — variable quality           |
| Install simplicity | `import '@tau/...'` always works          | Source resolution required              |
| Open ecosystem     | Less so                                   | More so                                 |
| Operational cost   | Tau-borne                                 | User-borne                              |

Single registry wins for v1; defer federation for when there's actual demand.

### Scope ownership

| Scope          | Use                                     |
| -------------- | --------------------------------------- |
| `@tau/`        | Reserved — Tau-curated official parts   |
| `@taucad/`     | Reserved — Tau team published           |
| `@<username>/` | User-published (auto-claimed at signup) |
| Unscoped       | Disallowed — every part is scoped       |

### Pricing model

Free-only is simpler but kills creator economics. Adding paid is non-trivial (Stripe Connect, tax, refunds, account abuse) but required for the marketplace promise. Defer paid to Phase 3 — sufficient depth in free to validate UX first.

### Multi-kernel: forced unify vs. multi-listing

Forcing one universal CAD format (STEP? IFC? glTF?) destroys the parametric value. Multi-listing per kernel is honest about the kernel choice and lets each implementation use its kernel's strengths.

### Verification cost

Phase 6 (cross-param sampling) is the expensive one — 8 renders per published version. Spread across off-peak with backoff; charge enterprise tier for "priority verification" if cost becomes an issue at scale.

## Open Questions

1. **Should parts include their own tests automatically?** Verification phase 5 reads tests from manifest; if absent, verification stops at phase 4. Encourage but don't require — many simple parts (a fastener) don't need tests.
2. **What about derived parts (one part imports another)?** Lockfile records transitive parts the same way it records transitive npm deps. Resolver handles the import. Should "Just Work."
3. **Anonymous vs. authenticated browse?** Browse public, install requires auth. Mirrors npmjs.com.
4. **Should Tau curate `@tau/` scope from day one?** Recommended yes — even 10 high-quality `@tau/` parts at launch demonstrate quality bar and prevent name squatting.
5. **What's the moderation backstop for malicious parts?** Sandboxed verification catches most; trusted-author flagging + per-install warning ("this part requires network access") catches the rest. Hard takedown via admin tooling.
6. **GPL parts compatibility?** A GPL-licensed OpenSCAD part imported into a user's project doesn't make the user's project GPL — it's runtime composition, not derivative work. Document explicitly to dispel concerns.
7. **Versioning conflicts across deps?** Two parts depending on different versions of a third part — npm-style hoisting + flat-tree per [`node-modules-single-source-of-truth.md`](./node-modules-single-source-of-truth.md). Either version pinning resolves both, or the install warns.
8. **Search ranking algorithm?** Start with weighted (install_count × verification_score × recency); refine via signals as data accrues.
9. **Should the agent be able to publish parts on behalf of users?** Yes (Phase 3) — `tool-publish-part` already in roadmap. Requires explicit user approval per publish.
10. **How do parts integrate with `Community` (publications)?** A publication can declare "this is also installable as a part" — single Publish action, two surfaces. Author opt-in.

## References

External:

- [npmjs.com](https://www.npmjs.com/) — UX precedent for search/install/profile.
- [Thingiverse](https://www.thingiverse.com/) — community-published 3D models, weak parametric story.
- [GrabCAD Library](https://grabcad.com/library) — engineering CAD library, mostly STEP files.
- [Onshape Public Documents](https://cad.onshape.com/documents?nodeId=0&resourceType=public) — closed registry, closed source.
- [Stripe Connect Express](https://stripe.com/docs/connect/express-accounts) — creator onboarding model.
- [Gumroad pricing](https://help.gumroad.com/article/142-payouts) — 80/20 revenue split reference.
- [Lemon Squeezy MoR model](https://www.lemonsqueezy.com/) — alternative payouts via merchant-of-record.
- [npm scopes](https://docs.npmjs.com/about-scopes) — name squatting prevention precedent.

Internal:

- Foundation: [`docs/research/sharing-architecture.md`](./sharing-architecture.md) — publication infrastructure this extends.
- Foundation: [`docs/research/api-npm-and-reproducible-snapshots.md`](./api-npm-and-reproducible-snapshots.md) — `/api/parts/*` mirrors `/api/npm/*` patterns; lockfile entries.
- Foundation: [`docs/research/dynamic-runtime-plugins.md`](./dynamic-runtime-plugins.md) — `taucad.config.ts` records part deps; resolver picks them up.
- Foundation: [`docs/research/vscode-style-resolution-and-virtual-types.md`](./vscode-style-resolution-and-virtual-types.md) — virtual types surface part parameter shapes in IntelliSense.
- Foundation: [`docs/research/node-modules-single-source-of-truth.md`](./node-modules-single-source-of-truth.md) — same FS-as-SSoT principle applies to `/.tau/parts/`.
- Drives: [`docs/research/geospec-standalone-cad-testing-blueprint.md`](./geospec-standalone-cad-testing-blueprint.md) — verification reuses GeoSpec through Tau's adapter.
