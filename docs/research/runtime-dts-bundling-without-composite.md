---
title: 'Bundling Workspace-Dep Types Without Composite Projects'
description: 'Root-cause + direction for rolling @taucad/* workspace-dep .d.ts into the publishable @taucad/runtime bundle while keeping source-based exports (instant type propagation, no composite, no tsc -b, no type-watch). The bridge is isolatedDeclarations.'
status: active
created: '2026-06-01'
updated: '2026-06-01'
category: investigation
related:
  - docs/research/runtime-npm-release-bundling.md
  - docs/research/runtime-zero-config-bundling.md
  - docs/policy/npm-policy.md
  - docs/policy/typescript-policy.md
---

# Bundling Workspace-Dep Types Without Composite Projects

How to roll the `@taucad/*` workspace dependencies' type declarations into a standalone, publishable `@taucad/runtime` `.d.ts` bundle — without converting any package to a TypeScript composite project, and without giving up the source-based `exports` that give us instant, build-free type propagation across the monorepo.

## Executive Summary

A prior attempt to make `@taucad/runtime` self-contained got the JavaScript bundling working but stalled on the **types**: when the `@taucad/*` workspace deps are force-bundled, `rolldown-plugin-dts` failed to inline their `.d.ts` (55 dangling/`MISSING_EXPORT` references). The attempt concluded the only reliable fix is `dts: { build: true }` — i.e. migrate every bundled dep to a **composite** project so `tsc -b` emits real per-project declarations first.

That conclusion is the _old_ (pre-2025) answer and it directly conflicts with our deliberate architecture: we run **non-buildable, source-export libraries** so that a type change in `@taucad/utils` propagates to consumers instantly with no intermediate build and no `tsc -b --watch`. This is the modern Nx recommendation (Nx RFC #29099, May 2026) and we adopted it on purpose.

**The eigenquestion is not "JS bundle vs. DTS bundle" or "composite vs. non-composite." It is:**

> **Can each exported source file's `.d.ts` be derived from that single file alone, with no whole-program type inference?**

If yes, a source-level declaration bundler (Oxc via `rolldown-plugin-dts`) can emit and inline every workspace dep's types _during_ the runtime publish build — no prior per-package build, no composite, no `tsc -b`. If no, the bundler is forced into the whole-program `tsc` fallback that mis-resolves cross-package source imports (exactly the failure observed).

The property that guarantees "yes" is **`isolatedDeclarations`**. It is the same property that makes instant source-propagation safe, so the two goals are not in tension — they share one root requirement. The bundling failure and the dev-ergonomics requirement have a single, common fix.

> **Validation result (2026-06-01): eigenquestion PROVEN — yes.** A probe runtime bundle re-exporting the previously-dangling symbols, built with `isolatedDeclarations` + Oxc + the subpath-aware `noExternal` pattern, emits a `.d.ts` that `tsc --noEmit --skipLibCheck` accepts with **0 errors**, with every dep symbol **inlined locally** (`declare class LruMap<V>`, `declare class SharedPool`, `declare class Topic<E>`, `type Port`/`Channel`/`RpcProtocol`, `type Geometry`/`FileExtension`, `type ChangeEvent`, `declare function toJsonSchema`) and **zero residual `@taucad/*` imports**. No composite, no `references`, no `tsc -b`; source `exports` untouched. See [Finding 7](#finding-7-validation-the-r6-gate-passed).

**Adoption cost (revised after the experiment — the pre-experiment estimate of "17 trivial violations" was wrong; see [Finding 4](#finding-4-adoption-cost-the-oxc-build-is-the-only-reliable-oracle)):** the **workspace deps** are cheap to make `isolatedDeclarations`-clean — ~14 annotation files, mostly `as const` + standalone `satisfies` and a few explicit annotations where inference is lost across a call (`Object.values`/`Object.keys`/`reduce`). But two findings change the picture:

1. **The standalone-`tsc` probe undercounts.** Semantic errors (e.g. `FileSystemDirectoryHandle.entries`) block declaration emit, so the `TS90xx` `isolatedDeclarations` checks silently never run. The **Oxc build is the only reliable oracle** — it surfaced `filesystem`'s `streamChunkSize` (TS9010) and `units`' spread-array consts (TS9018) that the `tsc` probe masked. `@taucad/units` (a 9th dep in the bundle pattern) was omitted from the original table entirely.
2. **The runtime package _itself_ is the real productionization gate, not the deps.** `@taucad/runtime`'s own source has **32** `isolatedDeclarations` violations — `export default defineKernel(...)`/`defineBundler(...)`/`defineTranscoder(...)` (TS9037) and `defineMiddleware(...)`/`new LruMap(...)` consts (TS9010). These generic factories infer their return type from their argument, so they cannot emit a declaration without an explicit (likely widened, e.g. `AnyKernelDefinition`-style) public return type. That is genuine API-surface work and is the concrete R2 prerequisite — orthogonal to the eigenquestion, which is already answered "yes."

This is still dramatically cheaper and architecturally correct versus a 9-package composite migration, and — critically — it _preserves_ the source-export dev workflow instead of breaking it.

> **Flag-scoping caveat:** `isolatedDeclarations` cannot go base-wide as-is. `nx typecheck` runs `tsgo` with `--noEmit --composite false --declaration false`, which is incompatible with `isolatedDeclarations` and trips `TS5069` repo-wide. Scope the flag to the publish build tsconfig (or the bundled libs' shared lib config), not `tsconfig.base.json`. The dep annotations are correct and stand on their own regardless of where the flag is enabled.

## Problem Statement

The goal (from `runtime-npm-release-bundling.md`): ship `@taucad/runtime` as a single npm install with **no `@taucad/*` workspace deps** in the published manifest. Several of those deps (`@taucad/types`, `@taucad/utils`) are `private: true` and will never be published, so they _must_ be bundled — both their JS and their types.

The JS side is solved (`deps.alwaysBundle` / `noExternal` + `unbundle: true`). The blocker is the **type declarations**. The prior worker reported:

- With the bundled deps inlined and `dts.resolve` asked to pull their types in, `rolldown-plugin-dts` drops the declarations: ~40+ dangling type refs on the current toolchain (silent), surfacing as **55 `MISSING_EXPORT` errors** after a toolchain bump (rolldown promoted the warning to an error).
- A `tsc --noEmit` over the emitted `.d.ts` confirmed **55 "Cannot find name"** errors spanning every dep: `Port`/`Channel`/`RpcProtocol` (`@taucad/rpc`), `FileExtension`/`Geometry`/`GeometryResponse` (`@taucad/types`), `SharedPool` (`@taucad/memory`), `ChangeEvent` (`@taucad/filesystem`), `LruMap` (`@taucad/utils`), `JSONSchema7` (`@taucad/json-schema`).
- Recommended fix: `dts: { build: true }` → composite projects across the transitive graph.

**Why the recommended fix is rejected.** Composite projects require `composite: true` + `declaration` emit + `references` wiring, and `tsc -b` builds each project to `.d.ts` _before_ consumers can type-check against it. That reintroduces exactly the build-before-types coupling we eliminated. Per the Nx RFC (#29099): _"There is a strict requirement for libraries to be non-buildable if you want both TypeScript and bundlers to [resolve] to source."_ Our `exports` point at `.ts`; go-to-definition lands on source; edits propagate with zero build. Composite would force buildable libraries and a watch step. **Non-negotiable to keep.**

So the real question is whether a standalone types bundle can be produced _without_ that migration.

## Methodology

1. **Local config audit** — read `tsconfig.base.json`, every bundled dep's `tsconfig.lib.json`, and `packages/runtime/tsconfig.build.json` to check for the documented tsdown DTS-bundling failure preconditions (`baseUrl`, non-relative `paths`) and for `isolatedDeclarations`.
2. **Quantified adoption probe** — ran the `isolatedDeclarations` checker directly against each bundled dep:
   `tsc -p <pkg>/tsconfig.lib.json --isolatedDeclarations --emitDeclarationOnly --declaration --outDir /tmp/...` and counted `error TS` lines per package.
3. **Prior-art survey (May 2026)** — `rolldown-plugin-dts` and `tsdown` declaration docs (Oxc/`isolatedDeclarations` path), tsdown issues #523 (path-mapping DTS failures), #544 (workspace subpath `noExternal` matching), `rolldown-plugin-dts` #230 (rolldown rc.17 promoting `MISSING_EXPORT` from warning to error), and Nx RFC #29099 + Nx "Managing Dependencies" (buildable vs non-buildable libraries).

### Scope and Non-Goals

**In scope**: how to emit + inline the bundled workspace deps' `.d.ts` without composite projects; the eigenquestion and its evidence; adoption cost.
**Out of scope**: the JS-bundling config, dependency bucketing, `publint`/`attw`, and README work — all covered in `runtime-npm-release-bundling.md`. This doc layers the **types** answer onto that plan.

## Findings

### Finding 1: The failure was the `tsc` whole-program fallback, not a fundamental DTS-bundler defect

`rolldown-plugin-dts` has two declaration engines:

- **Oxc `isolatedDeclarations` path** — auto-enabled when `isolatedDeclarations: true` is in `compilerOptions`. Emits each file's `.d.ts` from that file alone, then bundles the resulting declaration graph. Fast, and resolution is _per-file_ and _local_.
- **`tsc` fallback** — used when `isolatedDeclarations` is off. Generates declarations via whole-program inference. This is the mode that ran in the failed attempt (we have `isolatedDeclarations` nowhere — see Finding 3), and it is the mode that mis-resolves cross-package **source** imports when those packages are pulled into one synthetic program through `exports`→`src/*.ts`.

The decisive evidence the worker itself produced: `LruMap` — a fully type-annotated class exported from a leaf file via the bare subpath `@taucad/utils/cache`, with no `#` self-imports — _still_ failed. Under the Oxc path that file's declaration is trivially derivable in isolation. The failure is a property of the **whole-program fallback's** module identity across the source-export boundary, not of the declaration content. Change the engine and the class of failure disappears.

### Finding 2: Our tsconfig does NOT have the documented tsdown DTS-failure preconditions

The most-reported cause of tsdown DTS-bundling failures in monorepos (tsdown #523) is `baseUrl` + non-relative `paths` in the base tsconfig, which makes the DTS resolver read phantom/wrong declaration files. We are clean:

- `tsconfig.base.json` has **no `baseUrl`** and **no `paths`**.
- The only path mapping anywhere is `"#*": ["./src/*"]` (self-import subpath), already relative with a `./` prefix.

So we are not blocked by the #523 class. The remaining contributors are (a) the engine choice (Finding 1) and (b) `noExternal`/`alwaysBundle` subpath matching (Finding 5).

### Finding 3: `isolatedDeclarations` is currently enabled nowhere — this is the missing bridge

A repo-wide grep over every `tsconfig*.json` returns **zero** `isolatedDeclarations` occurrences. Yet two of its companion flags are already on globally in `tsconfig.base.json`:

- `verbatimModuleSyntax: true`
- `erasableSyntaxOnly: true`

These two are the hard part of adopting `isolatedDeclarations` (they force explicit `import type`, ban non-erasable constructs). Having them already means the code is written in an `isolatedDeclarations`-compatible style; only the explicit-annotation requirement remains. Turning the flag on is the bridge that makes per-file declaration emission — and therefore source-level DTS bundling — work.

**Where to enable it (validated):** _not_ base-wide. `nx typecheck` runs `tsgo` with `--noEmit --composite false --declaration false`, which is incompatible with `isolatedDeclarations` and trips `TS5069` across the whole repo. Scope the flag to the publish build tsconfig (`packages/runtime/tsconfig.build.json`) or the shared lib config the bundled deps extend — never `tsconfig.base.json`. The Oxc DTS engine reads the flag from the build's resolved tsconfig, so a scoped enablement is sufficient to engage the Oxc path during the runtime publish build.

### Finding 4: Adoption cost — the Oxc build is the only reliable oracle

The pre-experiment estimate ran a standalone `tsc --isolatedDeclarations` probe per package and counted **17 violations across 8 deps**. The 2026-06-01 experiment proved that count **wrong on two axes**, and that the standalone-`tsc` methodology is itself unreliable:

1. **Standalone `tsc` masks violations.** When a file has a _semantic_ error (e.g. `@taucad/filesystem` referencing `FileSystemDirectoryHandle.entries`), declaration emit is blocked for that file, so the `TS90xx` `isolatedDeclarations` diagnostics silently never run for it. The probe reported `filesystem: 3` but the **Oxc build** (`rolldown-plugin-dts`'s real engine) additionally caught `streamChunkSize` (TS9010). **Use the Oxc build as the oracle, not standalone `tsc`.**
2. **`@taucad/units` was omitted.** It is a 9th dep in the bundle pattern and carries `TS9018` (spread-element arrays in `standardInternationalBaseUnits`/`DerivedUnits`) — a harder class than "add an annotation."

**Corrected dep-side cost (validated, all annotations kept and green):** ~14 annotation files. The fix shapes:

- **`as const` + standalone `satisfies`** — the inline `X = {…} as const satisfies T` form _itself_ trips TS9010 in TS 5.9, so the `satisfies` must be a standalone statement. Applies to most `libs/types/src/constants/*.constants.ts` (`cad`, `file`, `filesystem`, `format-names`, `id`, `logger`, `manufacturing`, `mime-types`, `kernel`) and `@taucad/converter`'s `formats.ts`.
- **Explicit type where inference is lost across a call** — `api.constants.ts` (`ErrorCategory[]` after `Object.values`), `json-schema/helpers.ts` (`string[]` after `Object.keys`), `kernel.constants.ts` `languageFromKernel` (`Record<KernelId, CodeLanguage>` after `reduce`).
- **Small type-def change** — `KernelConfiguration.{dimensions,tags,features}` made `readonly` so `as const` data stays assignable to the `satisfies` target.

**`@taucad/units` is the one non-trivial dep:** the obvious `: Record<string, BaseUnit>` annotation regresses _its own_ typecheck, because the `string` index signature makes every access `… | undefined` under `noUncheckedIndexedAccess`. A correct narrow-key-preserving fix means refactoring ~35 array-spreads — that is R2 scope, not a one-liner.

There are still **zero** decorator conflicts (decorators live in the NestJS `apps/api` side, not these libs). The structural-violation wall is in the **runtime package itself**, not the deps — see Finding 7.

For comparison, the rejected alternative is converting 9 packages to composite, wiring `references` across the transitive graph, switching to `tsc -b`, and accepting a build-before-types watch step in dev — an architectural reversal — to solve a problem the deps solve with ~14 annotation files.

### Finding 5: `noExternal`/`alwaysBundle` must match subpaths (drop the `$` anchor)

Independent of the engine, tsdown #544 documents that `noExternal`/`deps.alwaysBundle` use strict specifier matching: a pattern anchored at the package name (`/^@taucad\/utils$/`) will **not** match a subpath import like `@taucad/utils/cache`, so that import gets externalized and then dangles. We import workspace deps via subpaths throughout (e.g. `@taucad/utils/id`, `@taucad/utils/cache`, `@taucad/types/constants`). The pattern must therefore be subpath-aware, matching the convention already recommended in `runtime-npm-release-bundling.md`:

```ts
/^@taucad\/(converter|events|filesystem|json-schema|memory|rpc|types|units|utils)(\/|$)/;
```

The `(\/|$)` tail is load-bearing: it matches both the bare specifier and every subpath, while still excluding the externally-published `@taucad/kcl-wasm-lib` and `@taucad/opencascade.js`.

### Finding 6: Non-buildable (source-export) libraries are the current Nx recommendation — and require this approach

Nx RFC #29099 and the Nx "Managing Dependencies" guide (May 2026) are explicit: _start with non-buildable libraries_ whose `package.json` `exports` point at source; consumers compile the source as part of their own build, so types resolve instantly with no build step. Buildable/composite libraries are reserved for packages that must be published or need independent incremental builds. Our internal libs are the former. The publish requirement for `@taucad/runtime` does not change that — it is satisfied by **bundling at the runtime boundary** (one buildable package) rather than by making every leaf lib buildable. `isolatedDeclarations` is what lets that single buildable boundary inline the source-export leaves' types.

### Finding 7: Validation — the R6 gate PASSED

The 2026-06-01 experiment built a **probe entry** that re-exports the previously-dangling symbols (`LruMap`, `SharedPool`, `Topic`, `Port`, `Channel`, `RpcProtocol`, `Geometry`, `FileExtension`, `ChangeEvent`, `toJsonSchema`), with `isolatedDeclarations` scoped to the build tsconfig and the subpath-aware `noExternal` pattern from Finding 5. Result:

```text
✔ Build complete in 268ms
GATE: tsc --noEmit --skipLibCheck dist/r6-probe/r6-dts-probe.d.ts → EXIT 0 (zero errors)
```

The emitted `.d.ts` inlines every symbol **locally** (`declare class SharedPool`, `declare class LruMap<V>`, `declare class Topic<E>`, `type Port<T>`, `type RpcProtocol`, `type Channel<P>`, `type Geometry`, `type FileExtension = keyof typeof mimeTypes` with `mimeTypes` itself inlined, `type ChangeEvent`, `declare function toJsonSchema`) with **zero residual `@taucad/*` imports** (only JSDoc-comment mentions remained). Oxc was confirmed as the active engine (the `TS90xx` diagnostics originate from `rolldown-plugin-dts`'s Oxc path). All probe + config changes were reverted after evidence capture; `nx build runtime` is green.

This is the decisive proof: once `isolatedDeclarations` is satisfied, the workspace deps' declarations bundle cleanly with no composite, no `references`, no `tsc -b`, and source `exports` untouched.

### Finding 8: The real productionization gate is the runtime package's own generic factories

The full `nx build runtime` DTS bundle does **not** yet pass — blocked not by the deps (Finding 7) but by **`@taucad/runtime`'s own 32 `isolatedDeclarations` violations**:

- `export default defineKernel(...)` / `defineBundler(...)` / `defineTranscoder(...)` → **TS9037** (default export of an expression whose type can't be named).
- `defineMiddleware(...)` / `new LruMap(...)` module-scope `const`s → **TS9010** (missing explicit type).

These are **generic factories that infer their return type from the argument**, so a declaration cannot be emitted without naming an explicit (and likely _widened_) public return type — e.g. an `AnyKernelDefinition`-style alias for the kernel/middleware/transcoder/bundler factories. This is genuine public-API-surface design work: it changes what consumers see in the runtime's `.d.ts`. It is orthogonal to the eigenquestion (which Finding 7 settles) but it is the concrete prerequisite for the _full_ runtime publish bundle, alongside the `@taucad/units` spread-array refactor (Finding 4).

## Recommendations

| #   | Action                                                                                                                                                                                                                                                                                                                                                                           | Priority             | Effort | Impact | Status                                                    |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ------ | ------ | --------------------------------------------------------- |
| R1  | Make the bundled workspace deps `isolatedDeclarations`-clean (~14 annotation files — `as const` + standalone `satisfies`, explicit types where inference is lost across `Object.values`/`Object.keys`/`reduce`, and `readonly` on `KernelConfiguration.{dimensions,tags,features}`). Use the **Oxc build** as the oracle, not standalone `tsc`.                                  | **P0**               | Low    | High   | ✅ Done (2026-06-01) — 8 deps clean, all typechecks green |
| R6  | **Validation gate** — build a probe re-exporting the dep symbols with `isolatedDeclarations`+Oxc+subpath `noExternal`; `tsc --noEmit` the emitted `.d.ts` and assert **0** "Cannot find name"/`MISSING_EXPORT`. Proves the eigenquestion "yes".                                                                                                                                  | **P0**               | Low    | High   | ✅ PASSED (2026-06-01) — see Finding 7                    |
| R3  | Keep all library `exports` pointing at `src/*.ts`. Do **not** add `composite`, `references`, or `tsc -b` to any bundled lib. Preserve instant source propagation.                                                                                                                                                                                                                | **P0**               | None   | High   | Standing constraint                                       |
| R7  | **Make `@taucad/runtime`'s own surface `isolatedDeclarations`-clean** — give the 32 generic-factory exports (`defineKernel`/`defineMiddleware`/`defineBundler`/`defineTranscoder` defaults + `defineMiddleware`/`new LruMap` consts) explicit (likely widened, `AnyKernelDefinition`-style) public return types. This is the real R2 prerequisite and is public-API design work. | **P0** (for publish) | Medium | High   | Pending — Finding 8                                       |
| R8  | **Refactor `@taucad/units`** spread-array consts (`standardInternationalBaseUnits`/`DerivedUnits`, TS9018) to a narrow-key-preserving form (not `Record<string, BaseUnit>`, which regresses its own typecheck under `noUncheckedIndexedAccess`).                                                                                                                                 | P1 (for publish)     | Medium | Medium | Pending — Finding 4                                       |
| R2  | Wire the runtime publish build to force-bundle the workspace deps with the subpath-aware pattern `/^@taucad\/(converter\|events\|filesystem\|json-schema\|memory\|rpc\|types\|units\|utils)(\/\|$)/`, `isolatedDeclarations` scoped to the build tsconfig (not base), Oxc engaged.                                                                                               | **P0**               | Low    | High   | Pending (blocked on R7+R8)                                |
| R4  | Add a CI guard that runs the `isolatedDeclarations` check across the bundled libs **and** the runtime via the Oxc build (standalone `tsc` masks violations — Finding 4) so a future non-annotated export can't reintroduce the dangling-types failure.                                                                                                                           | P1                   | Low    | High   | Pending                                                   |
| R5  | Pin `tsdown` / `rolldown-plugin-dts` / `rolldown` to a set where the Oxc DTS path is healthy, and treat `MISSING_EXPORT` as a hard build error (rolldown rc.17+ already does). Never ship silently-dangling `.d.ts`.                                                                                                                                                             | P1                   | Low    | Medium | Pending                                                   |

Sequencing: **R1 → R6 (both done — eigenquestion proven)** → R7 + R8 (make the runtime package itself emittable) → R2 (wire the publish build) → R4/R5 (lock it in). R3 is a standing constraint.

## Trade-offs

| Approach                                                                          | Instant type propagation (no watch)                      | Self-contained published `.d.ts`                            | Adoption cost                                                                                                                    | Verdict                                               |
| --------------------------------------------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| **`isolatedDeclarations` + Oxc DTS bundle** _(recommended; validated 2026-06-01)_ | **Preserved** — exports stay on source                   | **Yes** — per-file decls inline cleanly (proven, Finding 7) | ~14 dep annotation files + runtime's 32 generic-factory return types (R7) + `units` refactor (R8); flag scoped to build tsconfig | **Adopt**                                             |
| `dts: { build: true }` + composite projects                                       | **Lost** — buildable libs reintroduce build-before-types | Yes                                                         | 9-package composite migration + `references` wiring + `tsc -b` watch                                                             | Reject — reverses the architecture                    |
| Status quo (`tsc` fallback, bundle types)                                         | Preserved                                                | **No** — 55 dangling/`MISSING_EXPORT`                       | n/a                                                                                                                              | Broken — the failure being fixed                      |
| Publish each leaf lib to npm, externalize                                         | Preserved                                                | N/A (no bundling)                                           | Make `types`/`utils` public; 8 extra installs per consumer; version-skew                                                         | Reject — violates "single install, no `@taucad` deps" |

## Why `isolatedDeclarations` is the eigenquestion's answer, restated

Two requirements that look independent:

1. **Dev ergonomics**: a type edit in a leaf lib must reach consumers with no build step (source `exports`, no composite, no watch).
2. **Publish**: the runtime's `.d.ts` must inline the leaf libs' types into one self-contained bundle.

Both reduce to the same property: _the declaration for any exported symbol must be computable from its own source file, without a prior whole-program/whole-project build._ That is the definition of `isolatedDeclarations`. Requirement (1) needs it so the language server resolves source without a build; requirement (2) needs it so the bundler's Oxc engine can emit and inline each file's declaration during a single pass. Enable it once and both fall out — which is why this is one decision, not two competing ones.

## References

- Nx RFC: Linking Packages with Workspaces (non-buildable vs buildable libraries): https://github.com/nrwl/nx/discussions/29099
- Nx — Managing Dependencies (buildable vs non-buildable): https://nx.dev/docs/getting-started/tutorials/managing-dependencies
- tsdown — Declaration Files / `isolatedDeclarations` + Oxc: https://tsdown.dev/options/dts
- `rolldown-plugin-dts` (Oxc `isolatedDeclarations` engine): https://github.com/sxzz/rolldown-plugin-dts
- tsdown #523 — DTS fails with `baseUrl`/non-relative `paths` (root cause we do NOT have): https://github.com/rolldown/tsdown/issues/523
- tsdown #544 — workspace subpath `noExternal` matching: https://github.com/rolldown/tsdown/issues/544
- `rolldown-plugin-dts` #230 — rolldown rc.17 promotes `MISSING_EXPORT` to error: https://github.com/sxzz/rolldown-plugin-dts/issues/230
- Companion JS-bundling plan: `docs/research/runtime-npm-release-bundling.md`
- Plugin-chunk contract prior art: `docs/research/runtime-zero-config-bundling.md`

## Appendix A: Reproduction commands

Per-package `isolatedDeclarations` violation count (run from repo root):

> **Caveat (Finding 4):** standalone `tsc --isolatedDeclarations` **undercounts** — a semantic error in a file blocks its declaration emit, so the `TS90xx` checks silently skip it, and the list below also omits `@taucad/units`. Treat the per-package `tsc` probe as a _lower bound_ only; the **Oxc build** (`pnpm nx build runtime` with the bundle pattern) is the authoritative oracle.

```bash
# Lower-bound probe only — NOT authoritative (see caveat above)
for pkg in libs/utils libs/types libs/units packages/memory packages/rpc \
           packages/events packages/filesystem packages/json-schema packages/converter; do
  n=$(pnpm exec tsc -p "$pkg/tsconfig.lib.json" \
        --isolatedDeclarations --emitDeclarationOnly --declaration \
        --outDir "/tmp/idc-$(basename "$pkg")" 2>&1 | grep -cE "error TS")
  echo "$pkg: $n"
done
```

Authoritative gate (R6) — `isolatedDeclarations` scoped to the build tsconfig + the subpath-aware `noExternal` pattern, then `tsc --noEmit` over the emitted declarations:

```bash
pnpm nx build runtime
pnpm exec tsc --noEmit --skipLibCheck \
  packages/runtime/dist/esm/index.d.ts  # expect 0 "Cannot find name" / MISSING_EXPORT
```

Note: the full `nx build runtime` DTS bundle is currently gated by the runtime's own 32 generic-factory violations (Finding 8 / R7); the 2026-06-01 proof used a scoped probe entry re-exporting only the dep symbols to isolate the eigenquestion.
