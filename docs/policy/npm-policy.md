---
title: 'npm Publishing Policy'
description: 'Per-package rules for preparing @taucad/* libraries for npm publication: tsdown shape, dependency hygiene, exports map discipline, validation gates, README requirements.'
status: active
created: '2026-05-22'
updated: '2026-08-31'
related:
  - docs/policy/compatibility-policy.md
  - docs/policy/release-policy.md
  - docs/policy/version-policy.md
  - docs/policy/library-api-policy.md
  - docs/policy/runtime-architecture-policy.md
  - docs/research/runtime-npm-release-bundling.md
  - docs/research/runtime-zero-config-bundling.md
  - docs/research/runtime-bundled-publish-architecture.md
  - docs/research/runtime-plugin-toolkit-charter.md
  - docs/research/runtime-plugin-generator-blueprint.md
  - docs/research/runtime-plugin-runtime-slimming-migration-blueprint.md
  - docs/research/runtime-converter-dissolution-blueprint.md
  - docs/research/third-party-fork-org-naming.md
  - docs/research/apache-default-relicensing-blueprint.md
---

# npm Publishing Policy

Internal reference for preparing any `@taucad/*` package for the public npm registry. Covers the package-level concerns: `package.json` shape, `tsdown.config.ts` defaults, dependency classification, `exports`/`publishConfig.exports` discipline, README requirements, and the validation gates each package must clear before publish.

This is the **per-package** policy. The **CI/release-flow** policy (Nx Release, version plans, OIDC, provenance signing) lives in `docs/policy/release-policy.md`. Both apply to every published package.

## Rationale

`@taucad/*` packages share a single tsdown-based build pipeline and Nx-managed release flow. Consumers expect:

- A single `npm install @taucad/<pkg>` materialises everything needed — no follow-up workspace installs.
- Subpath imports (`@taucad/runtime/plugin`, `@taucad/runtime/transport`) and plugin package imports (`@taucad/image`, `@taucad/assimp`) resolve under modern ESM-aware TypeScript and Node.js module resolvers.
- First-party packages publish ESM-only output with no CommonJS compatibility branch.
- Cryptographic provenance via npm Trusted Publishing.
- A README that explains install, quick start, environment compatibility, and stability — discoverable on npmjs.com without clicking through to GitHub.

Most of these properties are configuration, not code. This policy codifies the configuration so every publishable `@taucad/*` package looks the same to consumers.

## Scope

Applies to every package under `packages/*`, `packages/plugins/*`, and `packages/core/*` whose `package.json` declares `"private": false`.

Internal workspace libraries under `libs/*` and `apps/libs/*` are `"private": true` and exempt from publish-specific rules; Rule 1's internal-library dependency shape still applies. They must either remain internal or be bundled into a publishable package via `deps.alwaysBundle` (see Rule 4). Runtime bundles only engine-owned private helpers. Concrete kernels, middleware, bundlers, transcoders, and backend helper logic belong to published plugin or core packages. Telemetry remains private application infrastructure and is not bundled or published.

## Rules

### 1. Dependency Classification

Every dependency declared in a publishable package must be classified into exactly one of these buckets. Bucket selection is non-negotiable.

| Bucket                      | Field                                                             | Treatment                                                    |
| --------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------ |
| A. Bundled-in workspace dep | `devDependencies`                                                 | Bundle into `dist/` via `tsdown.config.ts#deps.alwaysBundle` |
| B. External runtime dep     | `dependencies`                                                    | Installed alongside the package; never bundled               |
| C. Optional runtime dep     | `optionalDependencies`                                            | Best-effort install (e.g., platform-specific natives)        |
| D. Optional peer dep        | `peerDependencies` + `peerDependenciesMeta.<name>.optional: true` | Build-time integration (e.g., `vite`, `rolldown`)            |
| E. Dev-only                 | `devDependencies`                                                 | Test/build tooling — never present at consumer install time  |

**Why**: Mis-classification causes either bloat (bundling a real dep), install failures (bundling a private workspace dep is fine but leaving it in `dependencies` 404s the install), or hidden requirements (forgetting an optional peer in `peerDependenciesMeta`).

CORRECT:

```json
{
  "dependencies": {
    "@gltf-transform/core": "catalog:",
    "manifold-3d": "catalog:"
  },
  "optionalDependencies": {
    "ws": "catalog:"
  },
  "peerDependencies": {
    "vite": ">=7.0.0"
  },
  "peerDependenciesMeta": {
    "vite": { "optional": true }
  },
  "devDependencies": {
    "@taucad/types": "workspace:*",
    "@taucad/utils": "workspace:*",
    "publint": "catalog:",
    "@arethetypeswrong/core": "catalog:"
  }
}
```

INCORRECT:

```json
{
  "dependencies": {
    "@taucad/types": "workspace:*",
    "@taucad/utils": "workspace:*",
    "vitest-mock-extended": "catalog:"
  }
}
```

Plugin and core packages have additional dependency rules:

| Package class                                | Required dependency shape                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@taucad/runtime`                            | Must not depend on concrete plugin packages, concrete backend packages, native/Python runners, or toolchain-specific `@taucad/*-core` packages.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Plugin toolkit and `@taucad/*-core` package  | Declares `@taucad/runtime` as a required (non-optional) `peerDependencies` range plus a `workspace:*` `devDependencies` entry for development — never a hard dependency. One runtime instance serves the whole install; a hard dependency can fork runtime instances and protocol/type identity. (Ratified 2026-08-21.) While the train sits on a prerelease line the range must carry the prerelease lower bound (`^0.1.0-beta.0`, not `^0.1.0`): a caret range without one excludes every prerelease, so npm rejects the install and `nx release version` refuses to bump across it under `preserveMatchingDependencyRanges`. |
| Browser/WASM-safe plugin package             | May depend on browser/WASM-safe runtime deps and shared core packages; must not hard-depend on native, Python, or daemon implementation packages.                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Native/Python/daemon plugin package          | May declare platform-specific payloads as `optionalDependencies` only when install may legitimately fail on unsupported hosts; otherwise use explicit runtime diagnostics.                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `@taucad/*-core` helper package              | May depend on small shared helper deps; must not export `plugin` and must not initialize heavy backends at root import.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| CLI package                                  | May depend on first-party plugin packages for out-of-box defaults, but must lazy-load them by requested source/target or explicit `--plugin`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `zod`-emitting package                       | Declares `zod` as a required (non-optional) `peerDependencies` range — the literal `^4.0.0`, never `catalog:`, which would publish the workspace pin — plus a `catalog:` `devDependencies` entry, wherever the built emit imports `zod` or `zod/*`. Schema instance identity (`instanceof ZodType`) and type identity (the `$strip`/`$strict` brands) must not fork across an install. Leaf consumers that never re-export schemas (CLI, apps, `@taucad/geospec*`) declare `zod` in `dependencies` to satisfy the peer — never a `libs/*` or `apps/libs/*` project. (Ratified 2026-08-22; amended 2026-08-23.)                  |
| Internal `type:lib` / `type:app-lib` project | Never declares an identity-singleton dependency named by the workspace peer-rule registry (today `zod`) in `dependencies` or `optionalDependencies`; the published bundle owner or leaf application satisfies that peer. A buildable internal library explicitly externalises that singleton in its build config so its private `dist` cannot vendor a second copy. Ordinary third-party runtime dependencies remain declared because they record what the bundle owner must externalise.                                                                                                                                       |

**Why**: Tree shaking removes code from bundles; it does not remove packages from `node_modules`. Payload isolation must be represented in the package graph.

### 2. No `file:` or Tarball Dependencies in Publishable Packages

Publishable packages must not declare `file:`, `link:`, `portal:`, or git-URL dependencies. Every dep specifier must resolve from the public npm registry (or a configured private registry).

**Why**: `npm publish` packages the manifest as-is. `file:../../tarballs/foo.tgz` resolves to a non-existent path on the consumer's machine and hard-fails install.

CORRECT:

```json
{
  "dependencies": {
    "libcascade": "^3.0.0",
    "replicad": "npm:@taulabs/replicad@0.23.4-beta.2",
    "replicad-opencascadejs": "npm:@taulabs/replicad-opencascadejs@0.23.0-beta.0"
  }
}
```

INCORRECT:

```json
{
  "dependencies": {
    "libcascade": "file:../../tarballs/opencascade-fork/libcascade-3.0.0.tgz",
    "replicad": "file:../../tarballs/replicad-fork/taulabs-replicad-0.23.4-beta.2.tgz"
  }
}
```

**Migration recipe** for replacing a fork tarball with an aliased npm package:

1. Publish the fork to the `@taulabs/*` npm scope (e.g., `@taulabs/replicad`).
2. Replace the `file:` spec with `"<original-name>": "npm:@taulabs/<original-name>@<version>"`.
3. Consumers continue to write `import 'replicad'` — the alias is invisible.

### 3. tsdown Configuration Defaults

Every publishable package's `tsdown.config.ts` starts from a canonical baseline. The workspace package generator (`tools/workspace-plugin/src/generators/package/files/tsdown.config.ts__tmpl__`) emits this baseline.

```typescript
import { defineConfig, type Options } from 'tsdown';

const baseConfig: Options = {
  entry: ['src/index.ts'],
  sourcemap: false,
  clean: true,
  dts: true,
  minify: true,
  tsconfig: 'tsconfig.build.json',
  unbundle: true,
};

const packageConfig: Options = { ...baseConfig, format: 'esm', outDir: 'dist' };

export default defineConfig(packageConfig);
```

Required fields:

- `unbundle: true` — emit source files mirroring `src/` structure. Required for any package whose consumers use `new URL(literal, import.meta.url)` for asset/plugin discovery (see `docs/research/runtime-zero-config-bundling.md`). Default-on workspace-wide for consistency.
- `dts: true` — emit `.d.mts` declarations beside ESM JavaScript.
- `minify: true` — non-negotiable for published artefacts.
- `tsconfig: 'tsconfig.build.json'` — separate from `tsconfig.json` (dev) and `tsconfig.spec.json` (tests).

Optional fields by package shape:

- `copy: ...` — when the package ships WASM, fonts, or other non-JS assets that must land beside the compiled output.
- `deps.alwaysBundle: [...]` — when the package bundles workspace deps (Rule 4).
- `banner: { js: '#!/usr/bin/env node' }` — only for CLI bin scripts.

**Why**: `unbundle: true` is required for the plugin-chunk contract; ESM-only output matches Tau's browser-first runtime architecture; `pkgcheck` checks metadata, bundled declarations, strict consumer resolution, `publint`, and `attw` so export-map and declaration-resolution bugs are caught before publish.

### 4. Bundle Private Workspace Deps via `deps.alwaysBundle`

When a publishable package depends on a private workspace library (anything under `libs/*`, or any private `packages/**` helper), bundle it via tsdown's `deps.alwaysBundle`. Move the dep specifier from `dependencies` to `devDependencies` so it is not re-installed by consumers.

Published first-party packages are different. `@taucad/*` plugin and core packages that have their own public package identity must stay external when they provide independent versioning, optional host payloads, or payload isolation. For example, `@taucad/cli` may depend on `@taucad/image`, but `@taucad/runtime` must not bundle or depend on it.

Use a single regex per package that names every private workspace dep explicitly. Do not use a catch-all `/^@taucad\//` — externally-published packages (for example, plugin packages, `@taucad/kcl-wasm-lib`, or `libcascade`) must stay external.

CORRECT:

```typescript
const TAU_WORKSPACE_BUNDLE = /^@taucad\/(events|filesystem|fs-bridge|json-schema|memory|rpc|types|units|utils)(\/|$)/;

export default defineConfig({
  // ...
  deps: {
    alwaysBundle: [TAU_WORKSPACE_BUNDLE],
  },
});
```

The runtime bundle list is exactly events, filesystem, fs-bridge, JSON Schema, memory, RPC, types, units, and utils. Concrete plugin and public core packages stay external.

Every bundled private workspace library has exactly one published owner at any time — the pkgcheck bundle-ownership gate enforces this. When a private helper serves multiple published packages after the plugin split, either its shared logic becomes a published core package the plugins consume, or the private library is dissolved into its consumers. Never bundle the same private library into two published owners. `@taucad/converter` takes the dissolution path: it is removed entirely (per-backend import kernels in plugin packages, shared glTF machinery in `@taucad/geometry-core`), so no package bundles it — see `docs/research/runtime-converter-dissolution-blueprint.md`.

INCORRECT:

```typescript
deps: {
  alwaysBundle: [/^@taucad\//],
}
```

The `(\/|$)` suffix is required so subpath imports (`@taucad/utils/id`, `@taucad/types/constants`) match — without it, the regex bundles only bare-specifier imports and leaves subpaths external (the failure mode in [rolldown/tsdown#544](https://github.com/rolldown/tsdown/issues/544)).

**Why**: Bundling workspace deps gives consumers a single-install experience. Subpath-aware regexes prevent silent partial-bundling regressions. Keeping the explicit list (rather than `/^@taucad\//`) prevents accidentally bundling externally-published `@taucad/*` packages, which would duplicate WASM bindings and break consumer dedup.

### 5. `exports` and `publishConfig.exports` Must Stay in Lockstep

Workspace dev-mode resolution requires `exports` to map every subpath to a source `.ts` file (so monorepo consumers get fast TS resolution without a build step). Publish-time resolution requires `publishConfig.exports` to map the same subpaths to `dist/*` files.

**Both maps must list exactly the same keys.** Missing a key in either causes a runtime failure (workspace: source not found; publish: subpath not exported).

Every runtime subpath in `package.json#publishConfig.exports` must follow this canonical ESM-only shape:

```json
{
  "./foo": {
    "types": "./dist/foo.d.mts",
    "import": "./dist/foo.mjs",
    "default": "./dist/foo.mjs"
  }
}
```

Ordering matters: `types` first, then `import`, then `default`.

For type-only entries (no runtime code), expose only `types`:

```json
{
  "./types": {
    "types": "./dist/types/index.d.mts"
  }
}
```

Do **not** emit `import` or `default` for type-only entries.

**Why**: Subpath drift between `exports` and `publishConfig.exports` is the single largest source of post-publish 404 reports. Locking the shape removes the entire class of failure.

**Enforced by**: `tools/pkgcheck.ts` runs `publint` against a staged copy of the package with `publishConfig` applied (`applyPublishConfig` function in the orchestrator).

Plugin and core packages add package-shape invariants:

| Package shape                                 | Root export rule                                                                                                                                                                    |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Plugin toolkit package (`packages/plugins/*`) | Declare the package-named callable factory, re-export that same binding as `plugin` for mechanical loaders, and expose role-named direct factories; do not export a default plugin. |
| Single-capability subpath                     | Export one named capability factory or authoring artifact when a smaller import is useful; keep incompatible host payloads behind explicit subpaths or packages.                    |
| Core helper package (`packages/core/*`)       | Do not export `plugin`; expose helpers and types only.                                                                                                                              |

CORRECT:

```typescript
export { image, image as plugin } from '#image.plugin.js';
export { imageTranscoder } from '#image.transcoder.js';
```

INCORRECT:

```typescript
export { default } from './plugin';
```

### 6. Required `package.json` Fields

Every publishable package must declare these fields. Missing fields fail `publint`.

| Field                   | Required value                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------- |
| `name`                  | `@taucad/<pkg>`                                                                                         |
| `version`               | SemVer per `docs/policy/version-policy.md` (managed by Nx Release)                                      |
| `description`           | One-line, ≤120 chars, shown on npmjs.com search                                                         |
| `keywords`              | At least 3 relevant terms                                                                               |
| `license`               | `Apache-2.0` per the repository-wide rule in Rule 12                                                    |
| `author`                | Same canonical author across all packages                                                               |
| `repository`            | `{ "type": "git", "url": "git+https://github.com/taucad/tau.git", "directory": "<package directory>" }` |
| `homepage`              | `https://tau.new/docs/<pkg>` (or repo URL until docs land)                                              |
| `bugs`                  | `{ "url": "https://github.com/taucad/tau/issues" }`                                                     |
| `type`                  | `"module"`                                                                                              |
| `engines`               | `{ "node": ">=24.0.0" }` (matches the workspace's minimum supported Node release)                       |
| `sideEffects`           | `false` unless the package has top-level side effects (rare)                                            |
| `files`                 | `["dist", "README.md", "CHANGELOG.md"]` — never include source, tests, or configs                       |
| `main`                  | `./dist/index.mjs` for packages with a root runtime export                                              |
| `types`                 | `./dist/index.d.mts` for packages with a root export                                                    |
| `exports`               | Map every public subpath to its source `.ts` (workspace dev)                                            |
| `publishConfig.exports` | Map every public subpath to its ESM output (publish-time override)                                      |
| `publishConfig.access`  | `"public"` for scoped packages                                                                          |

No `prepublishOnly` hook: `nx.json` `targetDefaults["nx-release-publish"].dependsOn` includes `pkgcheck`, so the gate runs as a native dependency of publish for every package. Do not add the hook back.

INCORRECT (missing `engines`, `sideEffects`, `bugs`, `homepage`):

```json
{
  "name": "@taucad/runtime",
  "version": "0.1.0",
  "main": "./dist/index.mjs"
}
```

### 7. Validation Gates

Every package must pass `tools/pkgcheck.ts` before publish. The orchestrator runs these sub-checks in order; any single failure blocks the publish.

| Check                            | Tool                                                         | Purpose                                                                    | Severity |
| -------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------- | -------- |
| 1. Tau metadata                  | `tools/pkgcheck.ts`                                          | Tau-specific ESM-only metadata and publish-map checks                      | error    |
| 2. Bundle ownership              | `tools/pkgcheck.ts`                                          | One published owner per bundled workspace package                          | error    |
| 3. Bundled declaration specifier | `tools/pkgcheck.ts`                                          | No bundled workspace specifier remains in runtime declarations             | error    |
| 4. Strict consumer types         | `tsc`                                                        | Runtime declarations pass with `skipLibCheck: false` under both resolvers  | error    |
| 5. `publint`                     | [publint](https://publint.dev)                               | `package.json` field validity (`exports`, `main`, `types` vs actual files) | error    |
| 6. `attw`                        | [@arethetypeswrong/core](https://arethetypeswrong.github.io) | TypeScript type resolution for ESM-only packages (`profile: 'esm-only'`)   | error    |
| 7. `madge`                       | [madge](https://github.com/pahen/madge)                      | Circular dependency detection inside `src/`                                | error    |
| 8. `size-limit`                  | [size-limit](https://github.com/ai/size-limit)               | Per-entry bundle size budgets (defined in `.size-limit.json`)              | error    |

Run locally:

```bash
pnpm nx run <pkg>:pkgcheck
```

Run in CI by `nx affected -t pkgcheck`, and at publish time as a `dependsOn` of each package's `nx-release-publish` target (see `docs/policy/release-policy.md`).

`pkgcheck` runs against a **staged copy** of the package with `publishConfig` applied (the same transform `npm publish` applies at publish time). This catches issues that only manifest after publish — for example, an `exports` map that resolves in workspace dev but breaks in the published shape.

### 8. README Required Sections

Every publishable package's README is the primary npmjs.com landing page. The discoverability of a `@taucad/*` package against competitors (`@gltf-transform/core`, `replicad`, etc.) depends on a complete README. Required sections in this order:

| Section                    | Purpose                                                                                                         |
| -------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **Title + badges**         | npm version, weekly downloads, bundle-size, license, provenance                                                 |
| **One-line description**   | Same prose as `package.json#description`                                                                        |
| **Why this package?**      | 3–5 bullets covering the core value props                                                                       |
| **Installation**           | `npm install` snippet with pnpm and yarn alternatives; peer-dep notes                                           |
| **Quick start**            | Minimal complete example — **runnable**, not a fragment                                                         |
| **Feature/API tables**     | When the package exposes multiple subpaths or plugins, a table per kind (kernels, transports, middleware, etc.) |
| **Environment matrix**     | Per-subpath browser/Node/edge compatibility, when the package targets multiple environments                     |
| **Versioning & stability** | Pre-1.0 minor-bump warning + link to `release-policy.md`                                                        |
| **Security & provenance**  | Provenance verification snippet (`npm audit signatures`)                                                        |
| **License**                | Explicit license block; note bundled deps' original licenses if applicable                                      |
| **Links**                  | Documentation, source, changelog, issue tracker, discussions                                                    |

INCORRECT (missing badges, install, environment matrix, versioning):

```markdown
# @taucad/runtime

Multi-kernel CAD runtime.

## Quick start

[code]
```

CORRECT:

See `docs/research/runtime-npm-release-bundling.md#readme-audit` for the canonical full structure applied to `@taucad/runtime`.

### 9. ESM-Only Package Output

Every publishable Tau package ships ESM-only output.

- `dist/*.mjs` is the JavaScript output tree.
- `dist/*.d.mts` is the declaration output tree.
- `publishConfig.exports` must not declare `require` conditions.
- `attw` runs with `profile: 'esm-only'`.

**Why**: Tau's public runtime surface is browser-first and ESM-native; carrying a parallel CJS tree doubles publish metadata and type-resolution failure modes without matching the repo architecture.

### 10. `peerDependencies` for Build-Time and Test Integration

Build-time integrations (Vite plugins, Rolldown plugins, React Router plugins) must declare their host as an **optional** peer dependency, never a hard dep. A dedicated testing package whose shipped root imports a test runner is the exception: the runner is a **required** peer because every consumer of that package needs it. Production packages must not ship testing subpaths solely to expose runner-backed helpers; keep their own runner in `devDependencies` and publish reusable helpers from a separate testing package.

CORRECT:

```json
{
  "peerDependencies": {
    "vite": ">=7.0.0",
    "rolldown": ">=1.0.0-rc.1"
  },
  "peerDependenciesMeta": {
    "vite": { "optional": true },
    "rolldown": { "optional": true }
  }
}
```

Dedicated testing package:

```json
{
  "peerDependencies": {
    "@taucad/runtime": "^0.1.0-beta.0",
    "vitest": ">=2.0.0"
  },
  "devDependencies": {
    "@taucad/runtime": "workspace:*",
    "vitest": "catalog:"
  }
}
```

INCORRECT:

```json
{
  "dependencies": {
    "vite": ">=7.0.0"
  }
}
```

**Why**: Browser-only consumers should not install build tools or test runners. Optional peers communicate optional integration points. A package explicitly installed for testing has no non-testing use, so making its runner peer optional would allow an invalid install that fails as soon as the root is imported.

### 11. No `private: true` on Publishable Packages

Publishable packages must declare `"private": false` (or omit the field entirely — defaults to `false`). Setting `"private": true` blocks `npm publish` silently.

`libs/*` packages (internal-only) **must** declare `"private": true` and are never published.

### 12. Use Apache-2.0 for Every Workspace Package

Every workspace package — published _and_ private — declares `"license": "Apache-2.0"`.

| Projects                | `license` field | `LICENSE` file                       |
| ----------------------- | --------------- | ------------------------------------ |
| Every workspace package | `Apache-2.0`    | Required — canonical Apache-2.0 text |

Rules that follow from the table:

- Published package license files are named exactly `LICENSE` — npm includes them in the tarball regardless of the
  `files` array. The private repository root retains its historical lowercase [`license`](../../license) filename.
  Verify published artifacts with `npm pack --dry-run | grep LICENSE`.
- License texts are **verbatim**. Do not add a preamble, summary, or extra restriction.
- **Every** workspace package carries a same-directory license file, private ones included. Apache packages use bytes
  identical to the canonical root text. `scripts/src/validate-license-partitions.ts` proves the SPDX field, file
  presence, and byte identity across the workspace.
- The workspace generator always emits Apache-2.0. Architectural placement still derives tags, privacy, and build
  defaults, but never legal terms.
- Moving Tau-authored code between the editor, API, `apps/libs`, `libs`, ordinary packages, the GeoSpec substrate, and
  the GeoSpec engine keeps Apache-2.0 unchanged. Review third-party code separately.

Routing prose for consumers lives in `LICENSING.md` at the repository root. The current decision record is
`docs/research/apache-default-relicensing-blueprint.md`; older licensing comparisons remain historical evidence.

**Why**: the tarball is the unit of distribution, so the SPDX field and licence text must travel with each package
independently. One repository-wide licence avoids coupling package placement to legal terms.

## Decision Tables

### When to Bundle vs Externalise a Dep

| Dep characteristic                                                                     | Bundle into `dist/`            | Externalise (`dependencies`)            |
| -------------------------------------------------------------------------------------- | ------------------------------ | --------------------------------------- |
| Listed in `libs/*` or `apps/libs/*` with `private: true`                               | **Yes** (Rule 4)               | No — never publishable                  |
| Private package listed in `packages/**` and intentionally hidden inside a public owner | **Yes**                        | No                                      |
| Published plugin/core package listed in `packages/**`                                  | No                             | **Yes**                                 |
| First-party package needed only for CLI out-of-box defaults                            | No                             | **Yes** — lazy-load at command time     |
| Browser package would otherwise install native/Python/daemon payloads                  | No                             | **Yes** — split into explicit package   |
| Published externally (npm registry)                                                    | No                             | **Yes**                                 |
| Test-only, imported by a dedicated `*-testing` package root                            | No                             | No — required peer (Rule 10)            |
| Test-only, used by a production package's own tests alone (`vitest`)                   | No — `devDependencies`         | No                                      |
| Build-time integration (`vite`, `rolldown`)                                            | No                             | No — declare as optional peer (Rule 10) |
| Node built-in shim (`ws` before Node 22)                                               | Optional — depends on min Node | No — use `optionalDependencies`         |

### attw Profile Selection

| Package output shape    | Profile                            |
| ----------------------- | ---------------------------------- |
| Tau first-party package | `esm-only`                         |
| Legacy CJS-only         | `strict` (validates all resolvers) |

`strict` is rarely correct in 2026 — it requires every resolver including the decade-old `node10` to succeed.

## Summary Checklist

Before merging a PR that touches a publishable package's `package.json` or `tsdown.config.ts`:

- [ ] Every dep classified per Rule 1; mis-categorised deps moved
- [ ] Internal libraries declare ordinary runtime dependencies, but no identity-singleton dependency from the peer-rule registry
- [ ] Plugin/core package deps preserve payload isolation; browser/WASM packages do not hard-depend on native/Python/daemon packages
- [ ] No `file:`, `link:`, `portal:`, or git-URL deps (Rule 2)
- [ ] `tsdown.config.ts` matches the canonical ESM-only baseline (Rule 3): `unbundle: true`, `dts: true`, `minify: true`, `format: 'esm'`, `outDir: 'dist'`
- [ ] Workspace deps bundled via `deps.alwaysBundle` with subpath-aware regex (Rule 4)
- [ ] `exports` and `publishConfig.exports` list identical keys (Rule 5)
- [ ] Plugin packages export named `plugin` and no default plugin; core packages export no `plugin`
- [ ] All required `package.json` fields present (Rule 6): `engines`, `sideEffects`, `bugs`, `homepage`; no `prepublishOnly` hook
- [ ] `pnpm nx run <pkg>:pkgcheck` passes (Rule 7)
- [ ] README covers every required section (Rule 8)
- [ ] Build-time integrations declared as optional peers (Rule 10)
- [ ] `"private": false` (or omitted) on publishable packages (Rule 11)
- [ ] `license` is `Apache-2.0` and a verbatim canonical `LICENSE` file is present (Rule 12)

## Known Limitations

- **tsdown's `exports: true` auto-generation is experimental** as of v0.21.x and not yet adopted (would collapse the `exports`/`publishConfig.exports` map into a single source-of-truth derived from `entry`). Track and reassess at v0.2 of each package.
- **`@arethetypeswrong/core` programmatic API is not yet wrapped by `tools/pkgcheck.ts`** — the orchestrator shells out to the workspace-local `attw --pack . --format table` CLI. Output parsing is line-based and brittle. Replace with the programmatic API once `tsdown.dev/options/lint`'s integration covers all current `pkgcheck` checks.
- **`size-limit` is opt-in via `.size-limit.json`** — not every publishable package declares one. Packages without a `.size-limit.json` skip the size check silently. Add a `.size-limit.json` to every publishable package as the next sweep.
- **Provenance verification is consumer-side only.** This policy mandates `npm publish --provenance` (per `release-policy.md`), but a malicious release still passes its own signing. Provenance gives auditability, not absence of compromise.

## References

- Release/CI flow: `docs/policy/release-policy.md`
- Versioning: `docs/policy/version-policy.md`
- Library API shape: `docs/policy/library-api-policy.md`
- Runtime plugin architecture: `docs/policy/runtime-architecture-policy.md`, `docs/research/runtime-plugin-toolkit-charter.md`
- Bundling rationale: `docs/research/runtime-zero-config-bundling.md`, `docs/research/runtime-npm-release-bundling.md`
- tsdown docs: [tsdown.dev/options/dependencies](https://tsdown.dev/options/dependencies), [tsdown.dev/options/unbundle](https://tsdown.dev/options/unbundle), [tsdown.dev/options/lint](https://tsdown.dev/options/lint), [tsdown.dev/options/package-exports](https://tsdown.dev/options/package-exports)
- npm best practices 2026: [pkgpulse.com/guides/publishing-npm-package-complete-guide-2026](https://www.pkgpulse.com/guides/publishing-npm-package-complete-guide-2026)
- attw: [arethetypeswrong.github.io](https://arethetypeswrong.github.io)
- publint: [publint.dev](https://publint.dev)
