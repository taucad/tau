---
title: 'Runtime Test Suite Quality Audit'
description: 'Gap analysis of the @taucad/runtime test suite: strengths, weaknesses, policy violations, and patterns worth promoting to the testing policy.'
status: active
created: '2026-04-17'
updated: '2026-06-01'
category: audit
related:
  - docs/policy/testing-policy.md
  - docs/policy/react-testing-policy.md
  - docs/policy/typescript-policy.md
  - docs/research/geospec-standalone-cad-testing-blueprint.md
  - docs/research/vitest-style-parameter-geometry-testing-blueprint.md
---

# Runtime Test Suite Quality Audit

A systematic, file-by-file review of the `@taucad/runtime` test suite (1,386 tests across 81 files, ~34,895 lines) measured against `docs/policy/testing-policy.md`. This document is a gap analysis intended to drive a planned testing-improvement workstream in the most important package in the Tau ecosystem.

## Executive Summary

The runtime test suite is **structurally healthy** but **inconsistently rigorous**. Strong patterns dominate the framework bridge, error enrichment, glTF utilities, middleware onion-chain, and cross-kernel parity tests. Weakness clusters around three recurring failure modes:

1. **Existence-only assertions** on geometry export paths — `expect(result.success).toBe(true)` followed by `data.length > 0`, with no parsing of the actual GLB/STL/STEP output. This is the largest single class of low-value test in the suite (~50+ instances concentrated in `opencascade.kernel.test.ts`, `jscad.kernel.test.ts`, `replicad.kernel.test.ts` export paths).
2. **`not.toThrow()` without observable follow-up** — at least 15 instances across the framework directory; weakest in resource-disposal tests where the post-condition (port closed, subscription removed) is never asserted.
3. **Coverage gaps in critical worker dispatcher branches** — `runtime-worker-dispatcher.ts` lacks tests for `cleanup`, `fileChanged`, `configureMiddleware`, the bundler-loading loop in `initialize`, telemetry callback wiring, and log-batch debouncing. These are user-visible failure modes during teardown and hot reload.

Strong, promotable patterns include round-trip oracles via `@gltf-transform/core`, spatial-binning cross-kernel parity, golden stack-frame demangling without snapshot files, and the centralized `MockKernelWorker` + `createMockRuntime` factories. **`mock<T>()` from `vitest-mock-extended` is mandated by policy but used in only 8 of 81 test files (10%).**

The single highest-impact improvement is adopting `expectValidGltf` + `expectMeshCount` + `expectBoundingBoxSize` (already defined in `kernel-geometry-testing.utils.ts`) as the **default** for every kernel `createGeometry` and `exportGeometry` test — closing a regression gap that today allows tessellation, units, and orientation bugs to ship green.

## 2026-06-01 Target-State Alignment

This audit remains the runtime test-quality baseline. The target geometry oracle has moved from local helper functions toward GeoSpec:

- Runtime kernel tests should gradually replace existence-only GLB/STL/STEP assertions with GeoSpec mesh/BRep/STEP evidence assertions.
- `kernel-geometry-testing.utils.ts` remains a useful precursor, but new helpers should delegate to GeoSpec once `packages/geospec` exists.
- Export tests should prefer round-trip evidence where possible: export, load through GeoSpec, and assert observable geometry, topology, units, and validity.
- The runtime should emit `GeometryArtifact` evidence for tests and for Tau's `@taucad/testing` adapter, instead of forcing every test to rediscover source, units, parameters, and provenance from raw bytes.

## Table of Contents

- [Methodology](#methodology)
- [Suite Inventory](#suite-inventory)
- [Findings by Area](#findings-by-area)
  - [Framework](#framework)
  - [Kernels](#kernels)
  - [Middleware](#middleware)
  - [Client](#client)
  - [Bundler](#bundler)
  - [Transport](#transport)
  - [Filesystem](#filesystem)
  - [Transcoders](#transcoders)
  - [Utils](#utils)
  - [Type-Level Tests](#type-level-tests)
  - [Plugins, Benchmarks, Smoke](#plugins-benchmarks-smoke)
- [Policy Conformance Matrix](#policy-conformance-matrix)
- [Strongest Tests Worth Emulating](#strongest-tests-worth-emulating)
- [Weakest Tests](#weakest-tests)
- [Skipped Tests](#skipped-tests)
- [Untested Code Paths](#untested-code-paths)
- [Patterns to Promote into Testing Policy](#patterns-to-promote-into-testing-policy)
- [Mock Factory Duplication](#mock-factory-duplication)
- [Recommendations](#recommendations)
- [Appendix A: Test File Inventory by Size](#appendix-a-test-file-inventory-by-size)
- [Appendix B: Policy Anti-Pattern Counts](#appendix-b-policy-anti-pattern-counts)

## Methodology

- Enumerated every `*.test.ts` and `*.test-d.ts` file in `packages/runtime/src/` (81 files).
- Quantitative scan via ripgrep for: `as unknown as`, `not.toThrow`, `console.{log,error,warn}`, `it.skip`/`describe.skip`, `@ts-expect-error`, `mock<`, `mockDeep`, `useFakeTimers`, `expect(...).toBe(true)`, `data.length).toBeGreaterThan(0)`, naked `toBeDefined()`.
- Three parallel deep-read passes (framework / kernels / middleware+client+bundler+transport+filesystem+transcoders+utils+types+plugins+benchmarks+smoke) reading every file >300 lines and sampling smaller files; cross-referenced findings with corresponding source modules to identify untested branches.
- Compared every pattern against `docs/policy/testing-policy.md` sections 1–11.
- All line numbers reflect the workspace state at audit time (commit on `observability-v1` branch, ahead 12); pin to that revision when citing.

## Suite Inventory

| Metric                                   | Value                                                                        |
| ---------------------------------------- | ---------------------------------------------------------------------------- |
| Source files (`*.ts`, excluding tests)   | 134                                                                          |
| Test files (`*.test.ts` + `*.test-d.ts`) | 81                                                                           |
| Test-to-source ratio                     | 0.60                                                                         |
| `it()` / `test()` blocks                 | 1,386                                                                        |
| `describe()` blocks                      | 430                                                                          |
| Total test LOC                           | 34,895                                                                       |
| Largest test file                        | `kernels/replicad/replicad.kernel.test.ts` (4,137 lines, 108 `it`s)          |
| Files using `mock<T>()`                  | 8 / 81 (10%)                                                                 |
| Files using `mockDeep<T>()`              | 0                                                                            |
| Files using `useFakeTimers`              | 5                                                                            |
| Files with `as unknown as`               | 15 (≈25 occurrences)                                                         |
| Files with `console.*`                   | 3 (`benchmarks/wasm-size`, `kernels/zoo/zoo-logs`, `kernels/zoo/zoo.kernel`) |
| Files with `it.skip` / `describe.skip`   | 3                                                                            |
| Files with `@ts-expect-error`            | 4 (concentrated: 53 in `framework/kernel-worker.test.ts`)                    |

Section breakdown (by directory):

| Directory                            | Files | LOC    | `it`s         |
| ------------------------------------ | ----- | ------ | ------------- |
| `kernels/`                           | 23    | 13,400 | 619           |
| `framework/`                         | 22    | 10,200 | 393           |
| `middleware/`                        | 7     | 3,400  | 137           |
| `bundler/`                           | 3     | 1,383  | 65            |
| `client/`                            | 3     | 2,160  | 65            |
| `filesystem/`                        | 5     | 912    | 60            |
| `utils/`                             | 6     | 1,930  | 80            |
| `transport/`                         | 2     | ~250   | 16            |
| `transcoders/converter/`             | 2     | 304    | 17            |
| `plugins/`                           | 2     | ~200   | 10            |
| `types/`                             | 2     | 2,740  | 0 (type-only) |
| `testing/`, `benchmarks/`, top-level | 5     | 225    | 24            |

## Findings by Area

### Framework

**Verdict: Mixed, leaning strong.** This is the heart of the runtime; tests for the bridge, error enrichment, render loop, tracer, and wasm loader are exemplary. The dispatcher and worker client carry the most policy debt.

#### Strengths

- `framework/runtime-filesystem-bridge.test.ts:284-301` and `:316-331` — fake-timer-driven 30 s timeout test with `try { ... } finally { vi.useRealTimers(); }` and asserted rejection substring. Textbook execution of policy §6.
- `framework/error-enrichment.test.ts:253-301` — "realistic production stack trace" with a fixed frame array and exact demangled name expectations. Golden-data style without an external snapshot file (avoids snapshot churn).
- `framework/error-enrichment.test.ts:319-346` — deterministic URL classifier table: each input URL maps to an exact category string. High-density coverage in compact prose.
- `framework/wasm-loader.test.ts:18-24, 71-77` — global `fetch` stubs always restored via `vi.unstubAllGlobals()` in `try`/`finally`.
- `framework/runtime-worker-dispatcher.test.ts:217-244` — Emscripten-style unhandled rejection on a never-settling promise; asserts the structured wire response (`type: 'error'` + message substring), which is exactly what consumers see.
- `framework/runtime-worker-dispatcher.test.ts:433-477` — pool storage + `geometryComputed` shape (`{delivery: 'pooled', key}`) verified end-to-end in one flow.
- `framework/kernel-worker.test.ts:140-210` — two concurrent gated renders verifying that an older render's `finally` cannot wrongly clear `_renderInProgress`. Has an explicit comment naming the bug class.
- `framework/kernel-worker.test.ts:1039-1081` — signal-buffer + `checkAbort` end-to-end with `onError` invocation containing the issue text `'timed out'` (async matcher, not just "threw").
- `framework/runtime-tracer.test.ts:101-120` — paired `not.toThrow` + `expect(measure).not.toHaveBeenCalled`. **Best example in the suite of how to assert "no-op safety" correctly.**

#### Weaknesses

- **`framework/kernel-worker.test.ts` carries 53 `@ts-expect-error` annotations** to access private state (`_renderInProgress`, `_filesystem`, etc.). This is by far the heaviest test in the suite and the volume of internal-state probes signals an architecture-level coupling problem: the unit being tested has no observable seam for these properties. Either expose protected hooks or factor the unit so internal state is no longer the assertion target.
- `framework/runtime-worker-client.test.ts:163-180` — empty `catch {}` after a `proxy.render()` that should reject (line 174-176). Policy §3 violation: error type and message are never asserted; a regression that changes the error class would still pass.
- `framework/runtime-worker-client.test.ts:111-117` — `terminate` with no pending work asserted only via `not.toThrow()`; the neighboring test (`:102-108`) shows the right shape with `expect(transport.close).toHaveBeenCalledOnce()`.
- `framework/kernel-runtime-worker.test.ts:262-276` — title says "cache clears after `notifyFileChanged`" but no second `getInitSpy` invocation is asserted. The assertion does not match the contract under test.
- `framework/worker-telemetry.test.ts:33-48` — `if (send.mock.calls.length > 0) { ... }` makes "send was never called" a silent pass. **Conditional assertions are an anti-pattern; the test passes when nothing happened.**
- `framework/async-polyfills.test.ts:38-55` — fallback `waitForSlotChange` resolves after one `setTimeout` without ever changing the slot; only elapsed time `>= 10` is checked, so the "wait for change" semantic is unverified.
- `framework/async-polyfills.test.ts:68-70` — `cooperativeYield` test only awaits, no `expect`. Test passes if the function silently never resolves except in degenerate cases.
- `framework/environment.test.ts:51-55` — `assertCrossOriginIsolated` only asserts `not.toThrow()` after `isNode()`; the actual COOP/COEP/SAB behavior is unverified.
- `framework/runtime-worker-dispatcher.test.ts:165-178` — "responds with exported on successful export" only checks `expect(response).toBeDefined()`. No shape assertion on the export result.
- `framework/signal-channel.test.ts` is effectively a layout test of `runtime-protocol.types.ts` constants. It belongs in a constants-level test or could be deleted; it doesn't exercise framework logic.
- 11 tests in `runtime-worker-dispatcher.test.ts` lines 71-339 use names like `responds`, `forwards`, `catches`, `cleans up`, `handles` — missing the `should` prefix from policy §2.

### Kernels

**Verdict: Mixed.** Excellent helper infrastructure (`createGeometryTestHelpers()` with `expectValidGltf`, `expectMeshCount`, `expectBoundingBoxSize`, `expectBoundingBoxCenter`) is heavily used inside `replicad.kernel.test.ts` (105 references) and `jscad.kernel.test.ts` (97 references) — but **export paths in nearly every kernel still default to `data.length > 0`**, leaving a wide regression hole.

#### Strengths

- `kernels/cross-kernel-mesh-parity.test.ts:107-206` — same cylinder BRep input through replicad and OpenCASCADE GLTF pipelines; spatial-keyed normal map + position overlap (≥95%) at fine grid; **normal match rate = 1**. This is a unique and high-value test that catches mesh-orientation and normalization regressions across kernel boundaries.
- `kernels/cross-kernel-mesh-parity.test.ts:208-272` and `:274-324` — material/PBR field comparison across kernels with `toBeCloseTo` tolerances.
- `kernels/replicad/replicad.kernel.test.ts:2080-2122` — STEP **round-trip** that re-imports the exported file and asserts `measureVolume`, `measureArea`, and `faces.length` match the original. **Real geometric invariants** rather than "export succeeded".
- `kernels/replicad/replicad.kernel.test.ts:2051-2078` — STEP export decoded as text; asserts presence of `CLOSED_SHELL` and `ADVANCED_BREP_SHAPE_REPRESENTATION` keywords — format + semantic markers.
- `kernels/opencascade/opencascade.kernel.test.ts:298-316` and `:319-337` — coarse-vs-fine tessellation check: fine GLB/STL byte length > coarse on filleted geometry. Indirect but meaningful triangle-density signal.
- `kernels/openscad/parse-output.test.ts:15-37` — exact structured `KernelIssue` objects expected for each parser stderr line. High coverage density per LOC.
- `kernels/replicad/oc-kernel-error.test.ts` and `oc-exceptions.test.ts` — assert message substrings + error class together, including the canonical "not `[object WebAssembly.Exception]`" anti-regression check.

#### Weaknesses

- `opencascade/opencascade.kernel.test.ts:195-199, 201-205, 207-211` — three back-to-back tests for parameterized geometry, array of shapes, and named shape entries that only call `assertSuccess`. **No bbox, no mesh count, no GLTF validity.** A shape regression could pass.
- `opencascade/opencascade.kernel.test.ts:215-220` — failure path asserts `success === false` only; no `issues` content / message check (policy §3).
- `opencascade/opencascade.kernel.test.ts:286-294` — unsupported export format: `success === false` only, no error type/message assertion.
- `opencascade/opencascade.kernel.test.ts:381-386` (fillet) and `:398-403` (compound) — `assertSuccess + expectValidGltf` only. Curved-surface tessellation regressions would not fail.
- `jscad/jscad.kernel.test.ts:972-996` — GLB export checks only `data.length > 0`. The same file uses `expectValidGltf` 97 times for `createGeometry`; the export path is the gap.
- `openscad/openscad.kernel.test.ts:949-958` — multiple primitives only checks `success` + `offData` defined. The dedicated "Geometry validation" suite does it correctly; this older test is leftover.
- `replicad/replicad.kernel.test.ts:2124-2141` — STL export: `assertSuccess + data.length > 0`. No STL parse, vertex count, or content checksum.
- `kernels/zoo/zoo.kernel.test.ts:16-17, 39` — file documents that `createGeometry` is not tested because it requires the cloud WebSocket; falls back to `console.error` on parameter-extraction failure (noisy in CI). Real-API parity for KCL geometry is a known gap.
- `kernels/tau/tau.kernel.test.ts` — entirely mocks `@taucad/converter`. Wiring + MIME types + error mapping are tested; **no real STEP→GLB integration is exercised**.

### Middleware

**Verdict: Strong, with a few `as unknown as` exceptions.**

#### Strengths

- `middleware/runtime-worker-middleware.test.ts:57-90` — middleware order recorded into an array (`['M1-before', 'M2-before', 'inner', 'M2-after', 'M1-after']`) and verified with `toEqual`. **Best onion-chain test in the suite.**
- `middleware/geometry-cache.middleware.test.ts:91-116` — cache hit asserts the inner handler is **not called** AND the restored GLTF bytes equal the seeded `gltfContent`. Behavioral, not implementation.
- L1/L2 cache, dependency-hash invalidation, max-entries eviction, age-based expiry, WebRTC skip, and `serializedHandle` round-trip are all covered.
- Parameter cache mirrors the geometry cache shape (hit/miss, hash change, JSON parse errors, memory cache); strong.
- `middleware/gltf-edge-detection.middleware.test.ts` (672 lines) uses GLTF factories + NodeIO assertions on output edges.

#### Weaknesses

- `middleware/runtime-worker-middleware.test.ts` and `kernel-worker-export-middleware.test.ts` use `as unknown as` to spy on protected methods (with documented oxlint rationale). Could be cleaner with a protected test subclass exposed via a `testing/` helper.
- Hash-collision behavior is not exercised in either cache (artificial unless a bug suspects it).

### Client

**Verdict: Strong.**

- `client/runtime-client.test.ts` runs full `createRuntimeClient` + `render` + `export` flows via `in-process-transport` + replicad — real end-to-end coverage at 1,475 lines.
- `client/runtime-client-options.test.ts` asserts merge **semantics**: identity (returns same reference when no overrides), array replace-by-id, deep merge for non-array fields. Far stronger than testing field shapes.
- `client/render-input.test-d.ts` (357 lines) uses `expectTypeOf` + `@ts-expect-error` to enforce `CodeInput` mutual exclusion and `file` key constraints. Genuine type-level guarantees.
- One isolated `as unknown as RuntimeResponse` at `runtime-client.test.ts:347` for an internal probe.
- A few `expect(...).toBeDefined()` blocks in the capabilities section (`:1454-1457`) are followed by schema-field checks (`:1458-1471`); acceptable but the bare-`toBeDefined` lines could be removed.

### Bundler

**Verdict: Mixed.**

- `bundler/esbuild.bundler.test.ts:19-22` mocks `esbuild-wasm` entirely. Tests exercise the real `createVfsPlugin` + captured `onLoad`/`onResolve` handlers (`:62-106`). HTTP-URL safety, builtin module routing, source map emission are covered. Not a real bundle execution, but the right seam for the unit.
- `bundler/module-manager.test.ts:52-79` — strong: cache hit skips fetch + write; miss fetches `esm.sh` with asserted path **and** `AbortSignal`. Real orchestration coverage.
- `bundler/execute-cache.test.ts:18-28` — cache hit asserts module **reference equality**. Strong.
- `bundler/execute-cache.test.ts:45-58` — selective `clearExecuteCache` only asserts `success: true`; should follow the reference-equality pattern from the hit test to prove invalidation.
- `bundler/execute-cache.test.ts:77-85` — failures are not cached: solid.

### Transport

**Verdict: Mixed.**

- `transport/in-process-transport.test.ts` runs full client + replicad render/telemetry/error paths through the in-process transport — strong.
- `transport/in-process-transport.test.ts:26-38` — `close()` and double-`close()` only assert `not.toThrow()`. No idle-resource state is observed. Direct policy §1 violation.
- `transport/worker-transport.test.ts` uses a stubbed global `Worker` (16-35) rather than a real worker or `MessageChannel`. Asserts `postMessage` arguments and `terminate`; transferables verified at lines 81-91. **No multi-message ordering, no `onerror` path, no real cross-thread structured-clone failure scenarios.**

### Filesystem

**Verdict: Strong, with `as unknown as Worker` debt.**

- `filesystem-wrappers.test.ts` lines 136, 145, 159, 169 cast plain objects to `Worker`. Could use `mock<Worker>()` from `vitest-mock-extended` per policy §5. Same pattern at `filesystem-bridge.test.ts:18`.
- `filesystem-wrappers.test.ts:222-231` — `dispose()` `not.toThrow()` without asserting the port closed or listener cleanup ran. Compare with `:168-178` which **does** spy `removeEventListener`; the dispose test should follow that template.
- `from-node-fs.test.ts`, `create-runtime-filesystem.test.ts`, and `filesystem-constructors.test.ts` are clean and behavioral.

### Transcoders

**Verdict: Mixed.**

- `transcoders/converter/converter.transcoder.test.ts` mocks `@taucad/converter` (`vi.mock(...)`). Wiring, MIME mapping, and error message substring checks are tested. The actual converter integration is not exercised here (covered separately in `packages/converter`).
- `:31-34` initialize test uses `expect(context).toBeDefined()` only.
- `transcoders/converter/converter-export-options.test.ts` is solid Zod / schema transformation coverage; one `toThrow()` without a message at `:24-26` (policy §3).

### Utils

**Verdict: Strong, with one significant skip.**

- `utils/glb-writer.test.ts:78-88` — GLB magic `0x46546c67` + version 2 + length, then NodeIO `readBinary` round-trip with accessor checks. **Practical glTF compliance without booting a full validator.**
- `utils/edge-detection.test.ts:269-272` — `describe.skip('Edge Detection Middleware', ...)` with a comment that dynamic middleware loading is unavailable in the unit test environment. Middleware-level coverage exists in `gltf-edge-detection.middleware.test.ts` with mocked handler — **but the OpenSCAD-driven full pipeline is unverified anywhere.**
- `utils/off-to-gltf.test.ts` and `export-glb.test.ts` use parsed glTF documents to verify material/alpha — good shape over byte-length.
- `utils/export-stl.test.ts`, `import-off.test.ts` assert structured outputs.

### Type-Level Tests

**Verdict: Strong; size is justified.**

- `types/define-plugin.test-d.ts` (2,623 lines) — exercises `expectTypeOf` **inside** the `defineKernel` / `defineMiddleware` callback bodies (e.g. `:79-119`), proving context inference flows through the full public API. Size reflects the surface area of the plugin system, not noise.
- `types/bridge.types.test-d.ts` — focused 117-line `StringKeyedObject` + `createBridgeServer` assignability tests with `toExtend` and rejection cases.
- `client/render-input.test-d.ts` — already noted, strong.

### Plugins, Benchmarks, Smoke

- `plugins/presets.test.ts` pins exact kernel + middleware IDs and asserts referential inequality across `presets.all()` invocations to guard against catalog drift. **Good plugin-registry test pattern.**
- `plugins/plugin-helpers.test.ts` asserts emitted plugin shape including stripping of schema fields.
- `testing/browser-compat.test.ts`, `testing/smoke-esm.test.ts` are import-resolution gates. They use heavy `toBeDefined` + `toBeTypeOf('function')` by design — appropriate at the boundary, not behavioral.
- `index.test.ts:4-8` — only `toHaveProperty('kernels'|'middleware'|'bundlers')`. Could be deleted or expanded to assert the catalog shape.
- `node.test.ts:17-23` — second test only checks `render` is a function with a path; no behavior asserted.
- **`benchmarks/wasm-size.test.ts` is misclassified as a test.** Lines 26-28 silently pass when WASM artifacts are missing (`console.log` + early `return`); lines 40-68 are a "report" test that only logs. 8 `console.log` calls. Should move to a CI artifact-budget script or use `expect.fail()` on missing artifacts.

## Policy Conformance Matrix

| Policy section                                              | Conformance             | Notes                                                                                                                                     |
| ----------------------------------------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| §1 Observable behavior, not implementation                  | **Mixed**               | ~50 export-path tests assert only success+length; `not.toThrow()` without state ~15×                                                      |
| §2 Test naming `should <verb> <outcome>`                    | **Mixed**               | At least 25 names in `runtime-worker-dispatcher`, `worker-error-trap`, `environment` omit `should`                                        |
| §3 Error assertions (message + type)                        | **Mixed**               | Multiple failure-path tests check only `success === false`; empty `catch {}` in 2+ files                                                  |
| §4 Resource cleanup                                         | **Strong**              | `try/finally` discipline solid; render-loop test exemplary; no systematic leaks found                                                     |
| §5 `mock<T>()` from vitest-mock-extended                    | **Weak**                | Only 8/81 files use it; 0 use `mockDeep`; ~25 `as unknown as` casts where `mock<T>()` would work                                          |
| §6 Async patterns (rejects.toThrow, fake timers in finally) | **Strong**              | Bridge timeouts and dispatcher tests exemplary                                                                                            |
| §7 Immutability and side-effect checks                      | **Strong but sparse**   | Few input-mutation tests exist; most don't need them                                                                                      |
| §8 No console output                                        | **Localized violation** | Only `wasm-size.test.ts` (8) and `zoo-logs.test.ts` (7, but **the strings are test fixtures** asserting console-log-suppression behavior) |
| §9 Structure assertions over existence                      | **Mixed**               | 27 `data.length > 0` style checks; 172 bare `toBeDefined()` — many on export paths                                                        |
| §10 Test file organization                                  | **Strong**              | Co-location, `vitest` imports, helper directory followed                                                                                  |
| §11 No type-assertion mocks (`as unknown as T`)             | **Mixed**               | 25 occurrences across 15 files; some justified for invalid-input tests, most are debt                                                     |

## Strongest Tests Worth Emulating

1. **`framework/runtime-filesystem-bridge.test.ts:284-301`** — fake-timer rejection test with `try/finally` cleanup and exact substring assertion. Reference for §6.
2. **`framework/error-enrichment.test.ts:253-301`** — golden stack frame demangling without snapshot files. Reference for high-density structured assertions.
3. **`framework/runtime-tracer.test.ts:101-120`** — paired `not.toThrow` + `expect(measure).not.toHaveBeenCalled`. Reference for asserting "no-op safety" the right way.
4. **`framework/runtime-worker-dispatcher.test.ts:217-244`** — Emscripten unhandled-rejection on a never-settling promise; verifies wire response. Reference for adversarial async error testing.
5. **`kernels/cross-kernel-mesh-parity.test.ts:107-206`** — spatial-binning normal-map parity across two kernels emitting distinct GLTF byte streams. Reference for cross-implementation oracle testing.
6. **`kernels/replicad/replicad.kernel.test.ts:2080-2122`** — STEP round-trip with volume/area/face invariants. Reference for export-format correctness.
7. **`middleware/runtime-worker-middleware.test.ts:57-90`** — middleware order array verified with `toEqual`. Reference for chain/onion behavior tests.
8. **`utils/glb-writer.test.ts:78-88`** — header magic + NodeIO round-trip. Reference for binary-format validation without external tools.
9. **`bundler/module-manager.test.ts:52-79`** — fetch hit/miss with `AbortSignal` asserted. Reference for orchestration logic with mocked I/O.
10. **`client/runtime-client-options.test.ts`** — option-merge semantics (identity, replace-by-id, deep merge). Reference for testing pure functions over mutable inputs.

## Weakest Tests

| #   | Location                                                             | Why it's weak                                                                           |
| --- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 1   | `framework/kernel-worker.test.ts:1128-1144`                          | `setGeometryPoolBuffer`/`setFilePoolBuffer` only `not.toThrow()`                        |
| 2   | `framework/kernel-worker.test.ts:2000-2006`                          | `rebuildAndPushCapabilities` no-callback case asserts nothing observable                |
| 3   | `framework/runtime-worker-client.test.ts:111-117`                    | `terminate` with no work — `not.toThrow()` only; neighboring test shows the right shape |
| 4   | `framework/runtime-worker-client.test.ts:163-180`                    | empty `catch {}` swallows the expected error type/message (§3)                          |
| 5   | `framework/kernel-runtime-worker.test.ts:262-276`                    | name claims cache invalidation but never asserts re-init                                |
| 6   | `framework/worker-telemetry.test.ts:33-48`                           | conditional `if (calls.length > 0)` allows zero-assertion green                         |
| 7   | `framework/async-polyfills.test.ts:38-55`                            | only checks elapsed time; "wait for slot change" semantic unverified                    |
| 8   | `framework/async-polyfills.test.ts:68-70`                            | `cooperativeYield` test has no `expect`                                                 |
| 9   | `framework/environment.test.ts:51-55`                                | `assertCrossOriginIsolated` only `not.toThrow` after `isNode()`                         |
| 10  | `framework/runtime-worker-dispatcher.test.ts:165-178`                | `expect(response).toBeDefined()` on success path                                        |
| 11  | `opencascade/opencascade.kernel.test.ts:195-199, :201-205, :207-211` | three tests `assertSuccess`-only; no geometry verification                              |
| 12  | `opencascade/opencascade.kernel.test.ts:215-220, :286-294`           | failure path asserts `success === false` only                                           |
| 13  | `opencascade/opencascade.kernel.test.ts:381-386, :398-403`           | fillet/compound: `expectValidGltf` only — tessellation regression escape hatch          |
| 14  | `jscad/jscad.kernel.test.ts:972-996`                                 | GLB export `data.length > 0` (file uses `expectValidGltf` 97× elsewhere)                |
| 15  | `openscad/openscad.kernel.test.ts:949-958`                           | multiple primitives `success + offData defined`                                         |
| 16  | `replicad/replicad.kernel.test.ts:2124-2141`                         | STL export `data.length > 0`, no STL parse                                              |
| 17  | `transport/in-process-transport.test.ts:26-38`                       | `close()` / double-`close()` `not.toThrow()` only                                       |
| 18  | `filesystem/filesystem-wrappers.test.ts:222-231`                     | `dispose()` `not.toThrow()` — should spy listener cleanup like `:168-178`               |
| 19  | `transcoders/converter/converter.transcoder.test.ts:31-34`           | `expect(context).toBeDefined()` for initialize                                          |
| 20  | `transcoders/converter/converter-export-options.test.ts:24-26`       | `toThrow()` without message or type                                                     |
| 21  | `index.test.ts:4-8`                                                  | three `toHaveProperty` checks, nothing else                                             |
| 22  | `node.test.ts:17-23`                                                 | "render is a function" — no behavior asserted                                           |
| 23  | `benchmarks/wasm-size.test.ts:24-28`                                 | missing artifacts → silent pass via `console.log + return`                              |
| 24  | `benchmarks/wasm-size.test.ts:40-68`                                 | "prints size report" — no `expect()` at all                                             |
| 25  | `framework/signal-channel.test.ts` (whole file)                      | layout test of protocol constants; not exercising framework logic                       |

## Skipped Tests

| Location                                                 | Status                                                                                                  | Recommendation                                                                                                                                                                                             |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `kernels/opencascade/opencascade.kernel.test.ts:410-414` | Skipped pending full OCCT WASM build with XCAF symbols (`TDocStd_Application`)                          | **Keep skipped** with the existing comment; promote to a separate Nx target gated on `OCJS_FULL_BUILD=1`                                                                                                   |
| `kernels/replicad/replicad.kernel.test.ts:689-892`       | **No skip reason** — large speaker-model integration with rich `KernelError` assertions                 | **P0**: investigate. Either (a) WASM-variant flake → quarantine with explicit `skip(reason)`, (b) behavior changed → fix and unskip, or (c) shrink to minimal repro. As-is it's dead weight                |
| `utils/edge-detection.test.ts:269-272`                   | `describe.skip` for the integration suite — comment explains dynamic middleware loading isn't available | Middleware unit tests cover the calculation; **promote integration coverage by adding an OpenSCAD edge-detection test in `openscad.kernel.test.ts`** since OpenSCAD is the primary edge-detection consumer |

## Untested Code Paths

### `framework/runtime-worker-dispatcher.ts`

| Branch                                                         | Notes                                                                                 |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `cleanup` command (`:264-272`)                                 | Clears log timer + `flushLogs` + `worker.cleanup()` — no test sends `type: 'cleanup'` |
| `fileChanged` command                                          | Not exercised through the dispatcher in tests                                         |
| `configureMiddleware` command                                  | Not exercised                                                                         |
| `initialize` → `bundlerEntries` loop (`:188-192`)              | `ensureLoadedBundler` not called from a dispatcher-driven test                        |
| `onLog` debounce → `logBatch` (`:94-116`)                      | No test verifies that multiple logs coalesce and flush after `logFlushDebounceMs`     |
| `worker.setTelemetrySend` (`:118-120`)                         | Telemetry-callback wiring not asserted                                                |
| `signalBuffer` on initialize (`:136-138`)                      | Not asserted in dispatcher tests                                                      |
| `progress` and `parameters` callbacks on `render` (`:206-217`) | Not exercised dispatcher-side                                                         |

### `framework/runtime-message-adapter.ts`

| Branch                                | Notes                                                                           |
| ------------------------------------- | ------------------------------------------------------------------------------- |
| `getWorkerMessagePort()` success path | Only main-thread negative case tested; worker-context success branch unverified |

### `transport/worker-transport.ts`

| Branch                                      | Notes                           |
| ------------------------------------------- | ------------------------------- |
| `onerror` handler                           | No `worker.onerror`-driven test |
| Multi-message ordering                      | Not stressed                    |
| Real cross-thread structured-clone failures | Stub Worker bypasses these      |

### `kernels/zoo/`

KCL `createGeometry` requires the cloud WebSocket and is **not tested anywhere in the runtime package**. Mock the WebSocket layer or build a deterministic local KCL evaluator stub for parity with other kernels.

### `kernels/tau/`

Real STEP→GLB integration is mocked. Add at least one happy-path integration that runs `@taucad/converter` end-to-end (or move to `packages/converter` if cycle concerns prevent it here).

### Per-kernel feature coverage

- **OpenCASCADE**: GD&T/XCAF (skipped), full bbox/face-count assertion on parameterized/named/array shapes.
- **OpenSCAD**: hulls, minkowski, imports — feature coverage spotty by nature; OFF-only paths weaker than GLTF paths.
- **Manifold**: broader CSG / smooth scenarios beyond a few primitives.
- **JSCAD**: full GLB semantic validation on export; STEP rejection issue list.
- **Replicad**: full export-format matrix with parsed validation (binary STL content, 3MF if active).

## Patterns to Promote into Testing Policy

The following patterns are demonstrated in the runtime suite and should be codified in `docs/policy/testing-policy.md`:

### P1. Round-Trip Oracle for Binary Formats

When testing binary serializers (GLB, STL, STEP, 3MF, OFF), parse the output back through an independent reader and assert structural invariants (vertex count, accessor types, container keywords). Reference: `utils/glb-writer.test.ts:78-88`, `replicad.kernel.test.ts:2080-2122`.

### P2. Cross-Implementation Parity via Spatial Binning

When two implementations should produce semantically equivalent output but differ in byte layout, compare in a coordinate space (spatial keys, normal dot products, position set overlap) rather than byte-for-byte. Reference: `cross-kernel-mesh-parity.test.ts`.

### P3. Golden Data Inline (No Snapshot Files)

For deterministic transformations (stack demangling, parser output, URL classification), use **inline fixed expectations** rather than `toMatchSnapshot()`. Avoids snapshot churn and makes diffs reviewable. Reference: `error-enrichment.test.ts:253-301`.

### P4. Pair `not.toThrow()` with a Second Observable

When testing "no-op safety" (e.g. `tracer.measure()` after `reset`), pair `not.toThrow()` with `expect(sideEffect).not.toHaveBeenCalled()`. Make explicit in policy §1: a `not.toThrow()` test **must** include a second assertion proving the operation had the intended (or absence of) effect. Reference: `runtime-tracer.test.ts:101-120`.

### P5. Onion-Chain Order via Recorded Array

When testing middleware/interceptor ordering, push markers into an array from each layer and assert with `toEqual([...])`. Reference: `runtime-worker-middleware.test.ts:57-90`.

### P6. Adversarial Async Error Testing

For runtimes that wrap third-party promise behavior (Emscripten, WASM), explicitly construct never-settling promises with side-channel rejections and verify the structured wire response. Reference: `runtime-worker-dispatcher.test.ts:217-244`.

### P7. Plugin Catalog Drift Guards

For registries (kernel/middleware/preset), pin exact IDs in a `toEqual` array and assert referential inequality across repeated calls (`presets.all() !== presets.all()`). Reference: `plugins/presets.test.ts`.

### P8. Conditional Assertions Are an Anti-Pattern

`if (mock.calls.length > 0) { expect(...) }` permits zero-assertion green runs. Tests must either guarantee the condition holds or assert that it does **not**. **Add to policy §1 with an `INCORRECT` example.** Reference of the violation: `worker-telemetry.test.ts:33-48`.

### P9. Geometry Validation Default-On

For any test that produces geometry (kernel `createGeometry`, exporters, transcoders), the **default** assertion shape is `expectValidGltf` + `expectMeshCount` + `expectBoundingBoxSize` (or format-equivalent). `data.length > 0` is **not acceptable** as a primary assertion for geometry. Reference: helpers in `testing/kernel-geometry-testing.utils.ts`; widespread misuse in `opencascade.kernel.test.ts`, `jscad.kernel.test.ts` exports.

### P10. Type-Level Assertions Inside Generic Bodies

For inferred generics in callback APIs (`defineKernel((ctx) => ...)`), use `expectTypeOf(ctx)...` **inside** the callback body, not just on the outer return. Reference: `define-plugin.test-d.ts:79-119`.

### P11. When `@ts-expect-error` for Private Access Is Acceptable

When the ratio of `@ts-expect-error` to `it` blocks crosses ~5%, treat it as a refactor signal: introduce a `protected` test subclass or expose a typed test seam in `testing/`. **Add to policy §10**: 53 `@ts-expect-error` in one file (`kernel-worker.test.ts`) is a code smell, not a test smell.

## Mock Factory Duplication

Existing centralized factories in `testing/kernel-testing.utils.ts` are well-adopted (`createMockFileSystem`, `createMockRuntime`, `MockKernelWorker`, `createMockLogger`, `createMockResponse`, `createMockKernelRuntime`, `createMockRuntimeClient`). Gaps:

| Local factory                        | File                                                                                    | Promote to                                                                                    |
| ------------------------------------ | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `createMockPort`                     | `framework/runtime-worker-dispatcher.test.ts:12-32`                                     | `createFakeRuntimeMessagePort` in `testing/`                                                  |
| `createMockTransport`                | `framework/runtime-worker-client.test.ts:15-29`                                         | Same factory as above (callback-stored handler + simulate message)                            |
| `createMockWorker`                   | `framework/runtime-worker-dispatcher.test.ts:34-57` (uses `as unknown as KernelWorker`) | `createKernelWorkerStub()` next to `MockKernelWorker`                                         |
| `createMockWorkerInstance`           | `transport/worker-transport.test.ts:16-35`                                              | Justified separation (transport seam) but should use `mock<Worker>()` instead of plain object |
| `capturePluginHandlers`, `mockBuild` | `bundler/esbuild.bundler.test.ts:62-106`                                                | Justified (esbuild plugin capture is a different seam)                                        |

## Recommendations

Numbered, prioritized actions for a follow-up workstream.

| #   | Action                                                                                                                                                                                                                                                                                                                                                                    | Priority | Effort | Impact |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ------ |
| R1  | Adopt P9 (Geometry Validation Default-On). Replace every `data.length > 0` and `assertSuccess`-only assertion in kernel `createGeometry`/`exportGeometry` tests with `expectValidGltf` + `expectMeshCount` + `expectBoundingBoxSize`. Roughly 50 sites across `opencascade.kernel.test.ts`, `jscad.kernel.test.ts`, `replicad.kernel.test.ts`, `openscad.kernel.test.ts`. | P0       | Medium | High   |
| R2  | Investigate `replicad.kernel.test.ts:689-892` skip. Either fix-and-unskip, quarantine with reason, or shrink to a minimal repro.                                                                                                                                                                                                                                          | P0       | Medium | High   |
| R3  | Cover the untested `runtime-worker-dispatcher.ts` branches: `cleanup`, `fileChanged`, `configureMiddleware`, bundler loop, log debounce, telemetry callback wiring, signal buffer.                                                                                                                                                                                        | P0       | Medium | High   |
| R4  | Move `benchmarks/wasm-size.test.ts` out of the test suite. Use a CI script with `expect.fail()` on missing artifacts, or convert to an Nx artifact-budget target.                                                                                                                                                                                                         | P0       | Low    | Medium |
| R5  | Refactor `framework/kernel-worker.test.ts` to expose protected test seams; reduce 53 `@ts-expect-error` to <5.                                                                                                                                                                                                                                                            | P1       | High   | High   |
| R6  | Promote patterns P1-P11 into `docs/policy/testing-policy.md`; add an explicit "no conditional assertions" anti-pattern (P8).                                                                                                                                                                                                                                              | P1       | Low    | High   |
| R7  | Replace `as unknown as T` casts with `mock<T>()` in the 15 files where `vitest-mock-extended` is appropriate. Adoption is currently 10%; target 80%+.                                                                                                                                                                                                                     | P1       | Medium | Medium |
| R8  | Fix the 25 weakest tests listed above (one PR per cluster).                                                                                                                                                                                                                                                                                                               | P1       | Medium | High   |
| R9  | Add a real `@taucad/converter` integration test for `kernels/tau/tau.kernel.test.ts`, or document why mocking is sufficient and unify with `packages/converter` coverage.                                                                                                                                                                                                 | P1       | Medium | Medium |
| R10 | Add a KCL local-evaluator stub or mock WebSocket so `kernels/zoo/zoo.kernel.test.ts` covers `createGeometry`.                                                                                                                                                                                                                                                             | P2       | High   | Medium |
| R11 | Add a real `MessageChannel`-based test pair for `transport/worker-transport.ts` covering `onerror`, multi-message ordering, and structured-clone edge cases.                                                                                                                                                                                                              | P2       | Medium | Medium |
| R12 | Extend `cross-kernel-mesh-parity.test.ts` beyond cylinder: cube + boolean (cut/fuse) + revolution. Same kernels, same oracle.                                                                                                                                                                                                                                             | P2       | Low    | High   |
| R13 | Rename ~25 tests to start with `should` per policy §2 (mostly in `runtime-worker-dispatcher`, `worker-error-trap`, `environment`).                                                                                                                                                                                                                                        | P3       | Low    | Low    |
| R14 | Delete or expand `index.test.ts`, `node.test.ts:17-23`, `framework/signal-channel.test.ts` (low-value layout tests).                                                                                                                                                                                                                                                      | P3       | Low    | Low    |
| R15 | Promote local `createMockPort`/`createMockTransport`/`createMockWorker` factories into `testing/kernel-testing.utils.ts`.                                                                                                                                                                                                                                                 | P3       | Low    | Medium |

## Appendix A: Test File Inventory by Size

| Lines | `it` blocks | File                                                      |
| ----: | ----------: | --------------------------------------------------------- |
| 4,137 |         108 | `kernels/replicad/replicad.kernel.test.ts`                |
| 2,623 |      (type) | `types/define-plugin.test-d.ts`                           |
| 2,360 |          82 | `kernels/openscad/openscad.kernel.test.ts`                |
| 2,186 |          67 | `framework/kernel-worker.test.ts`                         |
| 1,713 |          59 | `kernels/jscad/jscad.kernel.test.ts`                      |
| 1,475 |          42 | `client/runtime-client.test.ts`                           |
|   881 |          45 | `framework/runtime-worker-client.test.ts`                 |
|   844 |          36 | `kernels/openscad/parse-output.test.ts`                   |
|   841 |          51 | `framework/runtime-filesystem-bridge.test.ts`             |
|   797 |          33 | `middleware/geometry-cache.middleware.test.ts`            |
|   797 |          25 | `framework/runtime-worker-dispatcher.test.ts`             |
|   756 |          20 | `kernels/zoo/zoo.kernel.test.ts`                          |
|   756 |          30 | `bundler/esbuild.bundler.test.ts`                         |
|   672 |          14 | `middleware/gltf-edge-detection.middleware.test.ts`       |
|   572 |          33 | `framework/error-enrichment.test.ts`                      |
|   559 |          30 | `kernels/jscad/jscad.schema.test.ts`                      |
|   552 |          14 | `middleware/runtime-worker-middleware.test.ts`            |
|   541 |          26 | `bundler/module-manager.test.ts`                          |
|   486 |          19 | `utils/glb-writer.test.ts`                                |
|   469 |          23 | `middleware/runtime-middleware.test.ts`                   |
|   463 |          21 | `middleware/parameter-cache.middleware.test.ts`           |
|   451 |          13 | `utils/edge-detection.test.ts`                            |
|   448 |          16 | `framework/kernel-runtime-worker.test.ts`                 |
|   416 |          23 | `kernels/opencascade/opencascade.kernel.test.ts`          |
|   393 |          25 | `kernels/replicad/oc-tracing.test.ts`                     |
|   357 |      (type) | `client/render-input.test-d.ts`                           |
|   356 |          11 | `kernels/manifold/manifold.kernel.test.ts`                |
|   338 |          12 | `middleware/gltf-coordinate-transform.middleware.test.ts` |
|   328 |          23 | `client/runtime-client-options.test.ts`                   |

## Appendix B: Policy Anti-Pattern Counts

### `as unknown as` (policy §11)

|  Count | File                                                 |
| -----: | ---------------------------------------------------- |
|      6 | `kernels/replicad/oc-exceptions.test.ts`             |
|      4 | `filesystem/filesystem-wrappers.test.ts`             |
|      2 | `middleware/runtime-worker-middleware.test.ts`       |
|      2 | `middleware/kernel-worker-export-middleware.test.ts` |
| 1 each | 11 other files                                       |

### `not.toThrow()` (policy §1, when standalone)

Approximately 15 standalone occurrences; full list per area in [Findings](#findings-by-area). Concentrated in `framework/cooperative-abort.test.ts`, `framework/named.test.ts`, `framework/worker-preload-polyfill.test.ts`, `framework/environment.test.ts`, `transport/in-process-transport.test.ts`, `filesystem/filesystem-wrappers.test.ts`.

### `console.*` in tests (policy §8)

| Count | File                             | Justified?                                                   |
| ----: | -------------------------------- | ------------------------------------------------------------ |
|     8 | `benchmarks/wasm-size.test.ts`   | No — should be a script, not a test                          |
|     7 | `kernels/zoo/zoo-logs.test.ts`   | Yes — strings are fixtures asserting console-log-suppression |
|     1 | `kernels/zoo/zoo.kernel.test.ts` | No — diagnostic `console.error` on parameter failure         |

### `@ts-expect-error` density

| Count | File                                      |
| ----: | ----------------------------------------- |
|    53 | `framework/kernel-worker.test.ts`         |
|     3 | `framework/kernel-runtime-worker.test.ts` |
|     2 | `framework/async-polyfills.test.ts`       |
|     1 | `filesystem/filesystem-bridge.test.ts`    |

### `mock<T>()` adoption

8 of 81 test files (10%). Files using it: `kernel-testing.utils.ts` (factory definitions), `runtime-client.test.ts`, `client/runtime-client-options.test.ts`, `runtime-worker-client.test.ts`, `kernel-worker-export-middleware.test.ts`, `runtime-worker-middleware.test.ts`, `geometry-cache.middleware.test.ts`, `parameter-cache.middleware.test.ts`. Zero usage of `mockDeep<T>()`.

### `useFakeTimers` adoption

5 of 81 test files: `framework/kernel-worker.test.ts` (6 calls), `framework/runtime-worker-client.test.ts` (3), `framework/runtime-filesystem-bridge.test.ts` (3), `framework/runtime-render-loop.test.ts` (1), `bundler/module-manager.test.ts` (1). Other timing-sensitive paths (debounce, log batch, throttle, watch coalescing) likely under-tested.
