---
title: 'npm Publishing Policy'
description: 'Per-package rules for preparing @taucad/* libraries for npm publication: tsdown shape, dependency hygiene, exports map discipline, validation gates, README requirements.'
status: active
created: '2026-05-22'
updated: '2026-05-22'
related:
  - docs/policy/release-policy.md
  - docs/policy/version-policy.md
  - docs/policy/library-api-policy.md
  - docs/research/runtime-npm-release-bundling.md
  - docs/research/runtime-zero-config-bundling.md
---

# npm Publishing Policy

Internal reference for preparing any `@taucad/*` package for the public npm registry. Covers the package-level concerns: `package.json` shape, `tsdown.config.ts` defaults, dependency classification, `exports`/`publishConfig.exports` discipline, README requirements, and the validation gates each package must clear before publish.

This is the **per-package** policy. The **CI/release-flow** policy (Nx Release, version plans, OIDC, provenance signing) lives in `docs/policy/release-policy.md`. Both apply to every published package.

## Rationale

`@taucad/*` packages share a single tsdown-based build pipeline and Nx-managed release flow. Consumers expect:

- A single `npm install @taucad/<pkg>` materialises everything needed — no follow-up workspace installs.
- Subpath imports (`@taucad/runtime/kernels`, `@taucad/runtime/vite`) resolve under every mainstream module resolver (`node10`, `node16`, `bundler`).
- Dual ESM + CJS until at least Node 24 LTS (Oct 2026); ESM-only thereafter.
- Cryptographic provenance via npm Trusted Publishing.
- A README that explains install, quick start, environment compatibility, and stability — discoverable on npmjs.com without clicking through to GitHub.

Most of these properties are configuration, not code. This policy codifies the configuration so every publishable `@taucad/*` package looks the same to consumers.

## Scope

Applies to every package under `packages/*` and `kernels/*` whose `package.json` declares `"private": false` (currently: `@taucad/runtime`, `@taucad/converter`, `@taucad/json-schema`, `@taucad/js`, `@taucad/cli`, `@taucad/openscad`, `@taucad/filesystem`, `@taucad/memory`, `@taucad/rpc`, `@taucad/billing`, `@taucad/fs-client`, `@taucad/telemetry`, `@taucad/testing`, `@taucad/three`, `@taucad/react`).

Internal workspace libraries under `libs/*` are `"private": true` and exempt from this policy; they must either remain internal or be bundled into a publishable package via `deps.alwaysBundle` (see Rule 4).

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

### 2. No `file:` or Tarball Dependencies in Publishable Packages

Publishable packages must not declare `file:`, `link:`, `portal:`, or git-URL dependencies. Every dep specifier must resolve from the public npm registry (or a configured private registry).

**Why**: `npm publish` packages the manifest as-is. `file:../../tarballs/foo.tgz` resolves to a non-existent path on the consumer's machine and hard-fails install.

CORRECT:

```json
{
  "dependencies": {
    "opencascade.js": "npm:@taucad/opencascade.js@^3.0.0-beta",
    "replicad": "npm:@taucad/replicad@^0.21.0-v8.57"
  }
}
```

INCORRECT:

```json
{
  "dependencies": {
    "opencascade.js": "file:../../tarballs/opencascade-fork/taucad-opencascade.js-3.0.0-beta.d3056ef.tgz",
    "replicad": "file:../../tarballs/replicad-fork/taucad-replicad-0.21.0-v8.57.2-jsdoc.tgz"
  }
}
```

**Migration recipe** for replacing a fork tarball with an aliased npm package:

1. Publish the fork to the `@taucad/*` scope (e.g., `@taucad/replicad`).
2. Replace the `file:` spec with `"<original-name>": "npm:@taucad/<original-name>@^<version>"`.
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
  publint: 'ci-only',
  attw: {
    enabled: 'ci-only',
    profile: 'node16',
    level: 'error',
  },
};

const cjsConfig: Options = { ...baseConfig, format: 'cjs', outDir: 'dist/cjs', dts: false };
const esmConfig: Options = { ...baseConfig, format: 'esm', outDir: 'dist/esm' };

export default defineConfig([esmConfig, cjsConfig]);
```

Required fields:

- `unbundle: true` — emit source files mirroring `src/` structure. Required for any package whose consumers use `new URL(literal, import.meta.url)` for asset/plugin discovery (see `docs/research/runtime-zero-config-bundling.md`). Default-on workspace-wide for consistency.
- `dts: true` (ESM only) — emit `.d.ts`. The companion CJS config sets `dts: false`; `.d.cts` files are generated by the `tools/generate-cjs-dts.plugin.ts` post-build step.
- `minify: true` — non-negotiable for published artefacts.
- `tsconfig: 'tsconfig.build.json'` — separate from `tsconfig.json` (dev) and `tsconfig.spec.json` (tests).
- `publint: 'ci-only'` and `attw: { enabled: 'ci-only', profile: 'node16', level: 'error' }` — package validation gates that run in CI.

Optional fields by package shape:

- `copy: ...` — when the package ships WASM, fonts, or other non-JS assets that must land beside the compiled output.
- `deps.alwaysBundle: [...]` — when the package bundles workspace deps (Rule 4).
- `banner: { js: '#!/usr/bin/env node' }` — only for CLI bin scripts.

**Why**: `unbundle: true` is required for the plugin-chunk contract; dual ESM/CJS output is required until Node 24 LTS (Oct 2026) at the earliest; `publint`/`attw` catch the entire class of `exports`-map and `.d.ts` resolution bugs that otherwise only surface after publish.

### 4. Bundle Workspace `@taucad/*` Deps via `deps.alwaysBundle`

When a publishable package depends on a private workspace library (anything under `libs/*`, or any `packages/*` package the user does not want to expose as a separate install), bundle it via tsdown's `deps.alwaysBundle`. Move the dep specifier from `dependencies` to `devDependencies` so it is not re-installed by consumers.

Use a single regex per package that names every workspace dep explicitly. Do not use a catch-all `/^@taucad\//` — externally-published `@taucad/*` packages (e.g., `@taucad/kcl-wasm-lib`, `@taucad/opencascade.js`) must stay external.

CORRECT:

```typescript
const TAU_WORKSPACE_BUNDLE = /^@taucad\/(converter|filesystem|json-schema|memory|rpc|types|units|utils)(\/|$)/;

export default defineConfig({
  // ...
  deps: {
    alwaysBundle: [TAU_WORKSPACE_BUNDLE],
  },
});
```

INCORRECT:

```typescript
deps: {
  alwaysBundle: [/^@taucad\//],
}
```

The `(\/|$)` suffix is required so subpath imports (`@taucad/utils/id`, `@taucad/types/constants`) match — without it, the regex bundles only bare-specifier imports and leaves subpaths external (the failure mode in [rolldown/tsdown#544](https://github.com/rolldown/tsdown/issues/544)).

**Why**: Bundling workspace deps gives consumers a single-install experience. Subpath-aware regexes prevent silent partial-bundling regressions. Keeping the explicit list (rather than `/^@taucad\//`) prevents accidentally bundling externally-published `@taucad/*` packages, which would duplicate WASM bindings and break consumer dedup.

### 5. `exports` and `publishConfig.exports` Must Stay in Lockstep

Workspace dev-mode resolution requires `exports` to map every subpath to a source `.ts` file (so monorepo consumers get fast TS resolution without a build step). Publish-time resolution requires `publishConfig.exports` to map the same subpaths to `dist/{cjs,esm}/*` files.

**Both maps must list exactly the same keys.** Missing a key in either causes a runtime failure (workspace: source not found; publish: subpath not exported).

Every subpath in `package.json#publishConfig.exports` must follow this canonical shape for dual ESM/CJS:

```json
{
  "./foo": {
    "require": {
      "types": "./dist/cjs/foo.d.cts",
      "default": "./dist/cjs/foo.cjs"
    },
    "import": {
      "types": "./dist/esm/foo.d.ts",
      "default": "./dist/esm/foo.js"
    }
  }
}
```

Ordering matters: `require` before `import` for legacy resolver compatibility; `types` before `default` within each condition (Node honours the first matching key).

For type-only entries (no runtime code), expose only `types`:

```json
{
  "./types": {
    "types": "./dist/esm/types/index.d.ts"
  }
}
```

Do **not** emit a `default` condition for type-only entries — that triggers `false-cjs`/`false-esm` attw warnings.

**Why**: Subpath drift between `exports` and `publishConfig.exports` is the single largest source of post-publish 404 reports. Locking the shape removes the entire class of failure.

**Enforced by**: `tools/pkgcheck.ts` runs `publint` against a staged copy of the package with `publishConfig` applied (`applyPublishConfig` function in the orchestrator).

### 6. Required `package.json` Fields

Every publishable package must declare these fields. Missing fields fail `publint`.

| Field                    | Required value                                                                                                      |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `name`                   | `@taucad/<pkg>`                                                                                                     |
| `version`                | SemVer per `docs/policy/version-policy.md` (managed by Nx Release)                                                  |
| `description`            | One-line, ≤120 chars, shown on npmjs.com search                                                                     |
| `keywords`               | At least 3 relevant terms                                                                                           |
| `license`                | `MIT` (or as agreed for kernel-specific exceptions, see `kernels/openscad` for GPL-2.0)                             |
| `author`                 | Same canonical author across all packages                                                                           |
| `repository`             | `{ "type": "git", "url": "git+https://github.com/taucad/tau.git", "directory": "packages/<pkg>" }`                  |
| `homepage`               | `https://tau.new/docs/<pkg>` (or repo URL until docs land)                                                          |
| `bugs`                   | `{ "url": "https://github.com/taucad/tau/issues" }`                                                                 |
| `type`                   | `"module"`                                                                                                          |
| `engines`                | `{ "node": ">=22" }` (matches Node 22 LTS WebSocket global and stable ESM resolver)                                 |
| `sideEffects`            | `false` unless the package has top-level side effects (rare)                                                        |
| `files`                  | `["dist", "README.md", "CHANGELOG.md"]` — never include source, tests, or configs                                   |
| `main`                   | `./dist/cjs/index.cjs`                                                                                              |
| `module`                 | `./dist/esm/index.js`                                                                                               |
| `types`                  | `./dist/esm/index.d.ts` (per Node 16+ resolution; `dist/cjs/index.d.cts` is referenced via `publishConfig.exports`) |
| `exports`                | Map every public subpath to its source `.ts` (workspace dev)                                                        |
| `publishConfig.exports`  | Map every public subpath to its dual ESM/CJS output (publish-time override)                                         |
| `publishConfig.access`   | `"public"` for scoped packages                                                                                      |
| `scripts.prepublishOnly` | `"pnpm nx run <pkg>:pkgcheck"`                                                                                      |

INCORRECT (missing `engines`, `sideEffects`, `bugs`, `homepage`, `prepublishOnly`):

```json
{
  "name": "@taucad/runtime",
  "version": "0.1.0",
  "main": "./dist/cjs/index.cjs"
}
```

### 7. Validation Gates

Every package must pass `tools/pkgcheck.ts` before publish. The orchestrator runs four sub-checks in order; any single failure blocks the publish.

| Check           | Tool                                                         | Purpose                                                                                       | Severity |
| --------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------- | -------- |
| 1. `publint`    | [publint](https://publint.dev)                               | `package.json` field validity (`exports`, `main`, `module`, `types` vs actual files)          | error    |
| 2. `attw`       | [@arethetypeswrong/core](https://arethetypeswrong.github.io) | TypeScript type resolution across `node10`/`node16`/`bundler` resolvers (`profile: 'node16'`) | error    |
| 3. `madge`      | [madge](https://github.com/pahen/madge)                      | Circular dependency detection inside `src/`                                                   | error    |
| 4. `size-limit` | [size-limit](https://github.com/ai/size-limit)               | Per-entry bundle size budgets (defined in `.size-limit.json`)                                 | error    |

Run locally:

```bash
pnpm nx run <pkg>:pkgcheck
```

Run in CI as part of `pnpm ci:affected` (added to the publish workflow per `docs/policy/release-policy.md`).

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

### 9. Dual ESM/CJS Output Until Node 24 LTS

Every publishable package ships dual ESM + CJS until Node 24 reaches LTS (October 2026). At that cutover, the policy switches to ESM-only and this rule is replaced.

Until then:

- `dist/esm/*.js` is the ESM tree (with `.d.ts`).
- `dist/cjs/*.cjs` is the CJS tree (with `.d.cts` generated via `tools/generate-cjs-dts.plugin.ts`).
- `attw` runs with `profile: 'node16'` (ignores `node10` failures; enforces dual-resolution correctness).

**Why**: A non-trivial slice of consumers (Vitest 1.x, older Jest, plenty of older CI scripts) cannot yet load ESM. The cost of shipping CJS is one extra build directory; the cost of breaking those consumers is a backlog of compat issues. Reassess at Node 24 LTS — `require(esm)` is unflagged-default on every maintained Node line at that point.

### 10. `peerDependencies` for Build-Time Integration

Build-time integrations (Vite plugins, Rolldown plugins, Vitest helpers, React Router plugins) must declare their host as an **optional** peer dependency, never a hard dep.

CORRECT:

```json
{
  "peerDependencies": {
    "vite": ">=7.0.0",
    "rolldown": ">=1.0.0-rc.1",
    "vitest": ">=3.0.0"
  },
  "peerDependenciesMeta": {
    "vite": { "optional": true },
    "rolldown": { "optional": true },
    "vitest": { "optional": true }
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

**Why**: Browser-only consumers should not install Vite or Vitest. Marking them optional peers communicates the integration intent without forcing the install.

### 11. No `private: true` on Publishable Packages

Publishable packages must declare `"private": false` (or omit the field entirely — defaults to `false`). Setting `"private": true` blocks `npm publish` silently.

`libs/*` packages (internal-only) **must** declare `"private": true` and are never published.

## Decision Tables

### When to Bundle vs Externalise a Dep

| Dep characteristic                                               | Bundle into `dist/`            | Externalise (`dependencies`)            |
| ---------------------------------------------------------------- | ------------------------------ | --------------------------------------- |
| Listed in `libs/*` with `private: true`                          | **Yes** (Rule 4)               | No — never publishable                  |
| Listed in `packages/*` and consumer wants single-install         | **Yes**                        | No                                      |
| Listed in `packages/*` and consumer wants independent versioning | No                             | **Yes**                                 |
| Published externally (npm registry)                              | No                             | **Yes**                                 |
| Test-only (`vitest-mock-extended`, `@vitest/spy`)                | No — move to `devDependencies` | No                                      |
| Build-time integration (`vite`, `rolldown`)                      | No                             | No — declare as optional peer (Rule 10) |
| Node built-in shim (`ws` before Node 22)                         | Optional — depends on min Node | No — use `optionalDependencies`         |

### attw Profile Selection

| Package output shape             | Profile                            |
| -------------------------------- | ---------------------------------- |
| Dual ESM + CJS (current default) | `node16`                           |
| ESM-only (post Node 24 LTS)      | `esm-only`                         |
| Legacy CJS-only                  | `strict` (validates all resolvers) |

`strict` is rarely correct in 2026 — it requires every resolver including the decade-old `node10` to succeed, and dual ESM/CJS packages almost always trip a `node10` rule that has no observable consequence.

## Summary Checklist

Before merging a PR that touches a publishable package's `package.json` or `tsdown.config.ts`:

- [ ] Every dep classified per Rule 1; mis-categorised deps moved
- [ ] No `file:`, `link:`, `portal:`, or git-URL deps (Rule 2)
- [ ] `tsdown.config.ts` matches the canonical baseline (Rule 3): `unbundle: true`, dual ESM+CJS, `publint: 'ci-only'`, `attw: { enabled: 'ci-only', profile: 'node16', level: 'error' }`
- [ ] Workspace deps bundled via `deps.alwaysBundle` with subpath-aware regex (Rule 4)
- [ ] `exports` and `publishConfig.exports` list identical keys (Rule 5)
- [ ] All required `package.json` fields present (Rule 6): `engines`, `sideEffects`, `bugs`, `homepage`, `prepublishOnly`
- [ ] `pnpm nx run <pkg>:pkgcheck` passes (Rule 7)
- [ ] README covers every required section (Rule 8)
- [ ] Build-time integrations declared as optional peers (Rule 10)
- [ ] `"private": false` (or omitted) on publishable packages (Rule 11)

## Known Limitations

- **tsdown's `exports: true` auto-generation is experimental** as of v0.21.x and not yet adopted (would collapse the dual `exports`/`publishConfig.exports` map into a single source-of-truth derived from `entry`). Track and reassess at v0.2 of each package.
- **`@arethetypeswrong/core` programmatic API is not yet wrapped by `tools/pkgcheck.ts`** — the orchestrator shells out to `pnpm attw --pack . --format table`. Output parsing is line-based and brittle. Replace with the programmatic API once `tsdown.dev/options/lint`'s integration covers all current `pkgcheck` checks.
- **`size-limit` is opt-in via `.size-limit.json`** — not every publishable package declares one. Packages without a `.size-limit.json` skip the size check silently. Add a `.size-limit.json` to every publishable package as the next sweep.
- **Provenance verification is consumer-side only.** This policy mandates `npm publish --provenance` (per `release-policy.md`), but a malicious release still passes its own signing. Provenance gives auditability, not absence of compromise.

## References

- Release/CI flow: `docs/policy/release-policy.md`
- Versioning: `docs/policy/version-policy.md`
- Library API shape: `docs/policy/library-api-policy.md`
- Bundling rationale: `docs/research/runtime-zero-config-bundling.md`, `docs/research/runtime-npm-release-bundling.md`
- tsdown docs: [tsdown.dev/options/dependencies](https://tsdown.dev/options/dependencies), [tsdown.dev/options/unbundle](https://tsdown.dev/options/unbundle), [tsdown.dev/options/lint](https://tsdown.dev/options/lint), [tsdown.dev/options/package-exports](https://tsdown.dev/options/package-exports)
- npm best practices 2026: [pkgpulse.com/guides/publishing-npm-package-complete-guide-2026](https://www.pkgpulse.com/guides/publishing-npm-package-complete-guide-2026)
- attw: [arethetypeswrong.github.io](https://arethetypeswrong.github.io)
- publint: [publint.dev](https://publint.dev)
