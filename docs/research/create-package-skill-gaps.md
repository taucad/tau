---
title: '`create-package` skill: gaps observed extracting `@taucad/openscad`'
description: 'Retrospective on what the create-package generator did and did not produce when scaffolding a kernel-style package, with prioritised recommendations to fold back into the skill and template files.'
status: active
created: '2026-04-22'
updated: '2026-04-22'
category: audit
related:
  - docs/research/license-strategy-mit-vs-gpl.md
  - docs/policy/library-api-policy.md
---

# `create-package` skill: gaps observed extracting `@taucad/openscad`

Audit of every post-generator manual fix required to ship the new GPL-isolated `@taucad/openscad` package, so the next kernel/asset-bearing extraction is closer to a one-command operation.

## Executive Summary

The `pnpm nx g ./tools/workspace-plugin/generators.json:package` generator nails the boring parts of a publishable `@taucad/*` package (TS configs, `tsdown` build, `vitest`, `#*` imports, project graph wiring) but is built around the assumption of a **single-entry, MIT, asset-free, dependency-free** package. Extracting `@taucad/openscad` required ~10 distinct manual edits across `package.json`, `project.json`, `vitest.config.ts`, `tsdown.config.ts`, plus three new files the generator never produces (`LICENSE`, `copy-files-from-to.cjson`, `.gitignore` for asset directories). The most surprising friction was the `--scope` whitelist rejecting `kernels/`, forcing a generate-then-`mv` workflow that left three stale path references behind. Eight prioritised recommendations follow; R1–R4 (P0) keep the generator viable for the upcoming OpenCASCADE/Replicad extractions.

## Problem Statement

Per `docs/research/license-strategy-mit-vs-gpl.md` recommendation R6, the OpenSCAD kernel was extracted from `@taucad/runtime` into a new top-level `kernels/openscad/` directory as the standalone `@taucad/openscad` package (GPL-2.0-or-later). The plan called for using the `create-package` skill to scaffold the new package. This document captures every divergence between what the generator produced and what the package actually needed before `pnpm nx build openscad`, `pnpm nx test openscad`, and `pnpm nx lint openscad` all passed.

The next two extractions in flight (extracting `@taucad/opencascade` and `@taucad/replicad` from runtime) will hit the same gaps. Closing them in `tools/workspace-plugin/src/generators/package/files/` and `.agent/skills/create-package/SKILL.md` saves ~30 minutes per extraction and removes a class of "I forgot to update X" footguns.

## Methodology

For each manual edit applied after `pnpm nx g …:package openscad --scope=packages`, the audit captures: which file, what was missing/wrong, why it was needed, and whether the fix belongs in (a) the generator's template files, (b) the SKILL.md post-generation checklist, or (c) the user's responsibility. Sources: the live `kernels/openscad/` directory, git history of post-generation edits, and the SKILL.md post-generation customization list (which currently enumerates 6 steps; this audit found 10+ in practice for a non-trivial package).

## Findings

### Finding 1: `--scope` allowlist rejects `kernels/`

The generator's `schema.json` whitelists `--scope` to exactly `packages | libs`. Attempting `--scope=kernels` errors out before any files are written. Workaround used: scaffold under `--scope=packages`, then `mv packages/openscad kernels/openscad`.

Three references survived the move and required hand-fixing:

| File               | Stale path                                                      | Correct path                      |
| ------------------ | --------------------------------------------------------------- | --------------------------------- |
| `package.json`     | `repository.directory: "packages/openscad"`                     | `kernels/openscad`                |
| `project.json`     | `sourceRoot: "packages/openscad"`                               | `kernels/openscad`                |
| `vitest.config.ts` | `coverage.reportsDirectory: "../../coverage/packages/openscad"` | `../../coverage/kernels/openscad` |

`pnpm-workspace.yaml` had to be edited separately to add `- kernels/*` so pnpm would discover the new tree. The generator does not touch `pnpm-workspace.yaml`.

### Finding 2: License is hardcoded MIT in the template

The `package.json` template emits `"license": "MIT"` unconditionally. For a GPL-2.0-or-later package this is silently wrong — `pnpm publish` and `license-deps` will both believe the false claim. Manual fix required.

The generator also does **not** produce a `LICENSE` file regardless of the `license` field. For non-MIT packages this matters: GPL/LGPL/Apache-2.0 distributions must ship the license text alongside the binary. We had to copy `node_modules/openscad-wasm-prebuilt/COPYING` into `kernels/openscad/LICENSE`.

### Finding 3: README is a single-line stub

The generated README contains only the package name and the `--description` argument. For a package that ships GPL bytecode, takes a non-trivial install (`pnpm add @taucad/openscad`), and needs a usage snippet, the stub is too thin to be useful. Manual rewrite required: ~25 lines covering purpose, license disclosure, install command, and a minimal `createRuntimeClient({ kernels: [openscad()] })` example.

### Finding 4: Single entry point assumption

The generator scaffolds exactly one entry: `src/index.ts` plus a matching `exports` map and `tsdown.config.ts` `entry: ['src/index.ts']`. `@taucad/openscad` needs **two** public entries — the barrel (`./`) and the kernel module (`./kernel`, used by the runtime worker via `new URL(...).href` resolution). Edits required across three files:

- `package.json` `exports`: add `"./kernel": "./src/openscad.kernel.ts"`
- `package.json` `publishConfig.exports`: add the matching dual ESM/CJS entry
- `tsdown.config.ts` `entry`: add `'src/openscad.kernel.ts'`
- `.size-limit.json`: add a separate budget entry per public entry (file does not exist by default)

The runtime, react, converter, cli, and testing packages all ship multiple entries — this is the rule, not the exception.

### Finding 5: No asset pipeline scaffolding

The OpenSCAD kernel needs Geist `.ttf` fonts at runtime (for `text()` rendering). The Tau pattern for vendored assets is:

1. `copy-files-from-to.cjson` declares the source→target copy job
2. `tsdown.config.ts` `copy: (options) => [...]` mirrors assets into `dist`
3. `.gitignore` excludes the copied source assets from version control

The generator produces none of these. All three files were authored by hand:

```jsonc
// kernels/openscad/copy-files-from-to.cjson
{
  "copyFiles": [
    {
      "from": "../../node_modules/geist/dist/fonts/geist-sans/Geist-Regular.ttf",
      "to": "src/fonts/Geist-Regular.ttf",
    },
  ],
}
```

```typescript
// kernels/openscad/tsdown.config.ts (copy: directive added by hand)
copy: (options) => [{ from: 'src/fonts', to: `${options.outDir}/fonts` }],
```

```gitignore
# kernels/openscad/.gitignore
src/fonts/*.ttf
```

### Finding 6: Empty dependencies + no `@taucad/runtime/kernel` subpath

The generator's `package.json` template has empty `dependencies` and `devDependencies` blocks. For an out-of-tree kernel, the realistic minimum is six runtime deps (`@taucad/json-schema`, `@taucad/runtime`, `@taucad/types`, `@taucad/utils`, `json-schema-default`, `openscad-wasm-prebuilt`) plus one devDep (`geist` for fonts). All authored by hand.

A deeper structural gap surfaced here: when porting `openscad.kernel.ts` from `packages/runtime/src/kernels/openscad/`, every internal `#types/runtime.types.js` and `#plugins/plugin-helpers.js` import had to be rewritten to come from a public `@taucad/runtime/*` subpath — but no such "kernel author" subpath existed. We had to **add a new public entry** to `@taucad/runtime`:

- New file `packages/runtime/src/plugins/kernel-author-entry.ts` exposing `defineKernel`, `createKernelPlugin`, `createKernelError`, `createKernelSuccess`, `loadBinaryFile`, `resolveToRelative`, `convertOffToGltf`, `coordinateSystemSchema`, plus a dozen kernel-related types
- New `package.json` `exports` entry `"./kernel": "./src/plugins/kernel-author-entry.ts"`
- Matching `publishConfig.exports` entry
- Added to `tsdown.config.ts` entry list

This is _the_ enabling change for the entire "kernels in their own packages" pattern. It needs to exist before any other kernel can be extracted.

### Finding 7: Relative imports inside a moved package fail lint

The `.oxlintrc.json` workspace rule `no-restricted-imports` forbids relative imports (`./foo.js`) and requires `#`-prefixed subpath imports (`#foo.js`). The generator correctly emits `imports: { "#*": "./src/*" }` in `package.json` (✓), but the kernel sources moved out of `packages/runtime/src/kernels/openscad/` were originally written with sibling-relative imports because they used to live alongside the runtime. After `git mv`, every `./parse-output.js` / `./openscad.schemas.js` import had to be flipped to `#parse-output.js` / `#openscad.schemas.js`. 7 import sites in 5 files.

This is a migration artifact, not a generator gap — but the SKILL.md should warn about it.

### Finding 8: Cross-package JSDoc codeblock examples create dependency cycles

When updating runtime JSDoc examples to reference the new world (`import { openscad } from '@taucad/openscad'`), the JSDoc codeblock validator (`tau-lint(validate-jsdoc-codeblocks)` via tsgolint) failed with `TS2307: Cannot find module '@taucad/openscad'` because the runtime cannot legally have a workspace dep on its own consumer (would create a cycle). The example had to be rewritten to use only kernels still bundled with `@taucad/runtime`.

This is a permanent constraint of the new architecture, not a fix-it-once issue: any cross-package JSDoc example will hit the same cycle. SKILL.md should document the constraint.

### Finding 9: `tsdown unbundle:true` still inlines workspace deps' transitive npm deps

`pnpm nx build openscad` produces `dist/esm/node_modules/.pnpm/zod@4.3.6/...` in the output tree. With `unbundle: true` set, this should not happen for direct deps, but `@taucad/json-schema` (a workspace src dep) re-exports zod and tsdown follows the source resolution into `node_modules`. Not blocking — the bundle is still tree-shakeable downstream — but worth investigating before publishing more workspace-dep-heavy packages.

### Finding 10: `pnpm-workspace.yaml` is not generator-managed

The `kernels/*` glob had to be added by hand. For new top-level scopes (this is the first time we've added one since `apps/`, `packages/`, `libs/` were created) the generator silently skips this. New packages under existing scopes work fine; new scopes break until the workspace file is patched.

## Recommendations

| #   | Action                                                                                                                                                                                                                                                                                                                                 | Priority | Effort | Impact |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ------ |
| R1  | Add `kernels` to the `--scope` allowlist in `tools/workspace-plugin/src/generators/package/schema.json`. Cheap, unblocks `--scope=kernels` for the upcoming `@taucad/opencascade` and `@taucad/replicad` extractions.                                                                                                                  | P0       | Low    | High   |
| R2  | Make `--license` a generator option (default `MIT`). When non-MIT, copy a templated `LICENSE` file from `tools/workspace-plugin/src/generators/package/licenses/<spdx>.txt`. Wire `license` field in `package.json` from the flag.                                                                                                     | P0       | Low    | High   |
| R3  | Add `--entries` (comma-separated) generator option. Multi-entry packages should declare entries up front and have `package.json` `exports` + `publishConfig.exports` + `tsdown.config.ts` entry array generated correctly first time.                                                                                                  | P0       | Medium | High   |
| R4  | Patch `pnpm-workspace.yaml` from the generator when `--scope` introduces a new top-level scope (idempotent: skip if already present).                                                                                                                                                                                                  | P0       | Low    | Medium |
| R5  | Add `--assets <dir>` generator option that scaffolds `copy-files-from-to.cjson` (empty array), the matching `tsdown.config.ts` `copy:` directive, and a `.gitignore` entry for the asset directory. Authors fill in the source map.                                                                                                    | P1       | Medium | Medium |
| R6  | Generate a richer `README.md` template: install command, minimal usage snippet placeholder, license callout (driven by `--license`). The current one-line stub is too thin to ever be shipped as-is.                                                                                                                                   | P1       | Low    | Medium |
| R7  | Update `.agent/skills/create-package/SKILL.md` post-generation checklist to enumerate: (a) review `repository.directory`, `sourceRoot`, `coverage.reportsDirectory` after any `mv`, (b) flip `./relative.js` → `#relative.js` for moved sources, (c) avoid `@taucad/<self>` references in cross-package JSDoc examples (cycle hazard). | P1       | Low    | High   |
| R8  | Investigate `tsdown unbundle:true` inlining workspace deps' transitive npm deps (zod via `@taucad/json-schema`). Either externalise `zod` explicitly in the openscad config, or fix at the tsdown plugin level so all workspace packages benefit.                                                                                      | P2       | Medium | Low    |

## Code Examples

### Before (post-generator state for `kernels/openscad/package.json`)

```jsonc
{
  "name": "@taucad/openscad",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/taucad/tau.git",
    "directory": "packages/openscad",
  },
  "exports": {
    ".": "./src/index.ts",
  },
  "imports": { "#*": "./src/*" },
  "dependencies": {},
  "devDependencies": {},
}
```

### After (manual fixes applied)

```jsonc
{
  "name": "@taucad/openscad",
  "license": "GPL-2.0-or-later",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/taucad/tau.git",
    "directory": "kernels/openscad",
  },
  "keywords": ["taucad", "cad", "openscad", "wasm", "gpl"],
  "exports": {
    ".": "./src/index.ts",
    "./kernel": "./src/openscad.kernel.ts",
  },
  "publishConfig": {
    "exports": {
      ".": { "types": "./dist/cjs/index.d.cts", "import": "./dist/esm/index.js", "require": "./dist/cjs/index.cjs" },
      "./kernel": {
        "types": "./dist/cjs/openscad.kernel.d.cts",
        "import": "./dist/esm/openscad.kernel.js",
        "require": "./dist/cjs/openscad.kernel.cjs",
      },
    },
  },
  "imports": { "#*": "./src/*" },
  "dependencies": {
    "@taucad/json-schema": "workspace:*",
    "@taucad/runtime": "workspace:*",
    "@taucad/types": "workspace:*",
    "@taucad/utils": "workspace:*",
    "json-schema-default": "catalog:",
    "openscad-wasm-prebuilt": "catalog:",
  },
  "devDependencies": {
    "geist": "catalog:",
  },
}
```

The diff above is exactly the work R1–R6 would automate.

## References

- `tools/workspace-plugin/src/generators/package/files/` — template files to update for R1–R6
- `tools/workspace-plugin/src/generators/package/schema.json` — `--scope` allowlist for R1
- `.agent/skills/create-package/SKILL.md` — post-generation checklist for R7
- `.oxlintrc.json` § `no-restricted-imports` — driver for the `#*` rewrite in Finding 7
- `docs/policy/library-api-policy.md` — public API conventions all generated packages must follow
- Related: `docs/research/license-strategy-mit-vs-gpl.md` § R6 (the trigger for this extraction)
