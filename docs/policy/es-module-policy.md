---
title: 'ES Module Asset Injection Policy'
description: 'Standards for loading heavy assets (WASM binaries, Emscripten JS glue, large modules) with code-splitting, tree-shaking, and runtime injection. Covers dynamic imports, WASM URL patterns, and assetsInlineLimit.'
status: active
created: '2025-08-06'
updated: '2026-09-04'
related:
  - docs/research/dynamic-es-modules.md
  - docs/policy/worker-policy.md
  - packages/runtime/src/vite/runtime-vite-plugins.ts
  - apps/ui/vite.config.ts
---

# ES Module Asset Injection Policy

Internal reference for loading heavy assets (WASM binaries, Emscripten JS glue, large modules) in a way that enables code-splitting, tree-shaking, and runtime injection.

## Rationale

Static top-level imports of variant modules force all variants into the bundle regardless of runtime selection, bloating bundle size and preventing minimal deployments. Dynamic import patterns and correct bundler configuration are essential for WASM-heavy applications to avoid V8 bytecode cache overflow and streaming compilation failures.

## Problem

Static top-level imports of variant modules force all variants into the bundle, regardless of which is actually used at runtime:

```typescript
// INCORRECT: both variants always bundled (~225KB total)
import single from 'replicad-opencascadejs/src/replicad_single.js'; // ~112KB
import exceptions from 'replicad-opencascadejs/src/replicad_with_exceptions.js'; // ~113KB
```

This pattern prevents consumers from shipping a minimal bundle when they only need one variant.

## The Two-Tier Dynamic Import Pattern

### Tier 1: Static-string dynamic imports (presets)

For known, build-time-resolvable variants, use `import()` with a **static string literal**. All major bundlers (Vite/Rollup, webpack, esbuild) recognize this pattern and create a **code-split chunk** that is loaded on-demand:

```typescript
async function loadBindings(preset: 'single' | 'single-exceptions') {
  if (preset === 'single-exceptions') {
    return import('replicad-opencascadejs/src/replicad_with_exceptions.js');
  }
  return import('replicad-opencascadejs/src/replicad_single.js');
}
```

**Why this works**: The bundler statically detects each `import()` target at build time, creates separate chunks, and handles CJS-to-ESM transformation automatically. Only the selected chunk is downloaded at runtime.

### Tier 2: Variable dynamic imports (custom URLs)

For runtime-provided URLs (benchmarking, CI, custom WASM builds), use `import()` with a runtime variable and a bundler-ignore comment:

```typescript
async function loadCustomBindings(url: string) {
  return import(/* @vite-ignore */ url);
}
```

**Bundler compatibility for ignore comments**:

| Bundler | Comment                     | Behavior                                        |
| ------- | --------------------------- | ----------------------------------------------- |
| Vite    | `/* @vite-ignore */`        | Suppresses warning, preserves as runtime import |
| Rollup  | _(none needed)_             | Warns, preserves as-is (suppress via `onwarn`)  |
| esbuild | _(none needed)_             | Warns, preserves as-is                          |
| webpack | `/* webpackIgnore: true */` | Suppresses warning, preserves as runtime import |

**CJS limitation**: Runtime `import(url)` in browsers requires the target to be an ES module. CJS-to-ESM transformation only happens for static-string imports that bundlers process at build time. In Node.js, `import()` handles CJS files natively. Custom URL injection is therefore primarily a **Node.js-first** capability (benchmarks, CI, testing).

## WASM Binary URL Pattern

For WASM binaries loaded via `fetch()` / `WebAssembly.compileStreaming()`, use the universal `new URL()` pattern with a static string literal:

```typescript
const wasmUrl = new URL('wasm/replicad_single.wasm', import.meta.url).href;
```

This pattern is recognized by all major bundlers ([web.dev reference](https://web.dev/articles/bundling-non-js-resources#universal_pattern_for_browsers_and_bundlers)). The bundler copies the asset to the output directory and rewrites the URL at build time.

**Key constraint**: The path must be a static string literal, not a variable. Variables prevent the bundler from detecting and copying the asset.

## Serialization Constraint

When options cross a `postMessage` boundary (e.g., main thread to Web Worker), they are serialized via the structured clone algorithm. This means:

- Strings (URLs) survive serialization
- Functions, URL objects, and module references do **not**

Therefore, WASM configuration must be expressed as plain strings (URL strings), not as functions or object references. Preset resolution (mapping a preset name to URLs and module imports) must happen on the worker side where `import.meta.url` resolves correctly relative to the kernel module.

## Putting It Together

The recommended architecture for factory options that select between heavy asset variants:

1. **Consumer API**: Union type of preset strings and a custom config object

   ```typescript
   type WasmOption = 'single' | 'single-exceptions' | { wasmUrl: string; wasmBindingsUrl: string };
   ```

2. **Factory**: Passes the raw option through as a serializable value (string or plain object)

3. **Worker-side resolution**: Maps presets to URLs using `new URL()` and loads modules via static-string `import()`. Custom configs use variable `import()` with ignore comments.

4. **Pure initialization function**: Receives the already-resolved URL and loaded module factory. Zero module-level state, zero static imports of variant modules.

## Bundler Configuration: The WASM Inlining Footgun

The `new URL()` pattern above is processed by Vite at build time. Vite applies its `assetsInlineLimit` setting to decide whether to **inline** the referenced file as a `data:` URL or **emit** it as a separate hashed asset. For WASM binaries, inlining is catastrophic.

### Why WASM Inlining Breaks Caching

When Vite inlines a WASM binary, three things go wrong simultaneously:

1. **Base64 bloat**: A 20 MB `.wasm` file becomes a ~27 MB base64 string embedded in a JS chunk (33% overhead). The containing chunk balloons from ~100 KB to tens of megabytes.

2. **V8 bytecode cache overflow**: Chrome's `GeneratedCodeCache` has a per-entry size limit (~20-30 MB, approximately 1/8 of the total cache size). When V8 produces a bytecode cache for a bloated chunk (e.g., 59.6 MB for a 57 MB chunk), Chrome's storage layer **silently drops** it. There is no error, no warning — the cache write simply doesn't persist. On the next page load, V8 recompiles the entire chunk from source.

3. **No streaming compilation**: Inlined WASM is a base64 string that must be decoded at runtime, not a fetch-able resource. `WebAssembly.compileStreaming()` cannot be used. V8's Liftoff compiler cannot begin compilation until the entire string is parsed and decoded.

### The `assetsInlineLimit` Callback Trap

Vite's `assetsInlineLimit` callback has **unintuitive return semantics**:

| Return value | Behavior                                        |
| ------------ | ----------------------------------------------- |
| `true`       | **Force inline** — regardless of file size      |
| `false`      | **Never inline** — always emit as separate file |
| `undefined`  | Use the default 4 KB threshold                  |

A numeric limit belongs to the top-level `assetsInlineLimit` option; it is not a supported callback return type.

A common mistake is writing a callback that returns a boolean to exclude one file type, inadvertently force-inlining everything else:

```typescript
// INCORRECT: returns true for all non-SVG files, including multi-MB WASM binaries
assetsInlineLimit(file) {
  return !file.endsWith('.svg');
}
```

The correct pattern:

```typescript
// CORRECT: exclude SVGs from inlining, use default threshold for everything else
assetsInlineLimit(file) {
  if (file.endsWith('.svg')) {
    return false;
  }
  return undefined; // default 4 KB threshold applies
}
```

`tauRuntime()` enforces `false` for `.wasm` assets in `packages/runtime/src/vite/runtime-vite-plugins.ts` and preserves the consumer policy for other files. The UI callback in `apps/ui/vite.config.ts` separately excludes SVGs. Keep the WASM invariant in the shared runtime integration.

### Verifying Correct Build Output

After building, check that WASM files appear as separate assets in the build output:

```
build/client/assets/replicad_single-BF2EjB3m.wasm     19,885 kB
build/client/assets/esbuild-Cpd5nU_H.wasm              13,524 kB
build/client/assets/kcl_wasm_lib_bg-BdkQwGXP.wasm      14,858 kB
```

If `.wasm` files are **absent** from the asset list, they are being inlined. Check `assetsInlineLimit`.

Also verify that JS chunks containing WASM bindings are small (< 100 KB), not multi-MB:

```
build/client/assets/replicad_single-DiVE9Huy.js         67 kB  ✓ (bindings only)
build/client/assets/replicad.kernel-Ck9z3i8a.js         307 kB ✓ (kernel code only)
```

### Chunk Size Budget for V8 Caching

To ensure V8 bytecode caching works reliably across browsers and cache configurations:

- **Hard limit**: Keep individual JS chunks under **15 MB** (bytecode is ~1.05x source size, and cache limits vary by browser/configuration).
- **Practical target**: Keep WASM-adjacent JS chunks under **500 KB** by emitting all WASM as separate files. The JS chunk should contain only the bindings/glue code.
- **Diagnostic**: If `chrome://tracing` shows `v8.compileModule` with `cacheKind=ABSENT` on reload 3+, the bytecode cache is being rejected. Check chunk sizes.

### Historical Performance Evidence (March 2026)

| Metric                       | With WASM inlining | Without (fixed) |
| ---------------------------- | ------------------ | --------------- |
| `replicad.kernel` chunk size | 57 MB              | 308 KB          |
| V8 compile time (per reload) | 232ms              | < 1ms (cached)  |
| `kernel.select` latency      | 936ms-1.15s        | < 1ms           |
| Total render time            | 1.26-1.56s         | 229ms           |

> For the full investigation, see [Dynamic ES Module Research](../research/dynamic-es-modules.md).

## WASM Module Reuse Across Workers

### Runtime-client ownership

Keep the runtime client alive across ordinary file and parameter updates. In `apps/ui/app/machines/cad.machine.ts`, the connection path creates the client with `createRuntimeClient()`; abort teardown and `destroyKernel` terminate it and dispose its event subscriptions. Follow [Worker Lifecycle Policy](worker-policy.md) for ownership and teardown requirements.

The March 2026 investigation measured approximately 50–60 ms of warm-cache WASM compilation and Emscripten initialization per worker creation. Those measurements describe that experiment, not a fixed cost or a guarantee about the current worker topology. Measure current startup before adding cross-project pooling or precompiled-module coordination.

`WebAssembly.Module` is structured-cloneable through `postMessage`, but it is not a transferable to put in a transfer list. If profiling justifies sharing compiled modules, keep instance ownership and cleanup explicit and account for worker-startup races. The original trade-off analysis remains in [Dynamic ES Module Research](../research/dynamic-es-modules.md).

### V8 isolate cache boundaries

| Cache Level                    | Scope             | Survives Worker Termination |
| ------------------------------ | ----------------- | --------------------------- |
| NativeModuleCache              | Renderer process  | Yes                         |
| GeneratedCodeCache (disk)      | Browser profile   | Yes                         |
| Compiled instance (in-isolate) | Worker V8 isolate | **No**                      |

### Deprecated approaches

**Do not** cache `WebAssembly.Module` in IndexedDB. Firefox removed structured clone support for `WebAssembly.Module` in IndexedDB in v63 (October 2018), and the WebAssembly Community Group decided browsers should handle caching implicitly. This approach is deprecated across all browsers.

**Do not** use `WebAssembly.compile(arrayBuffer)` expecting code caching — V8 only caches TurboFan code produced via `compileStreaming`. Always use `compileStreaming` for compilation to ensure disk caching.

> For the full trace analysis and external research, see [Dynamic ES Module Research](../research/dynamic-es-modules.md#8-residual-wasm-init-cost-post-fix).

## Anti-patterns

- **Top-level static imports of variant modules** -- forces all variants into the bundle
- **Module-level URL constants for unused variants** -- references assets that may never be needed
- **Passing functions through `postMessage`** -- functions are not structured-cloneable
- **Dynamic `import(variable)` without ignore comments** -- produces bundler warnings in CI/CD
- **Assuming CJS works with browser `import()`** -- it does not; only Node.js handles CJS via `import()`
- **`assetsInlineLimit` returning `true` for WASM files** -- inlines multi-MB binaries into JS, breaking V8 bytecode cache and disabling streaming compilation
- **JS chunks > 20 MB containing inlined binary data** -- exceeds Chrome's `GeneratedCodeCache` per-entry limit, causing silent cache rejection and full recompilation on every page load
- **Terminating a runtime client on every file or parameter update** -- discards reusable worker state. Terminate at its ownership boundary; use measured startup costs when evaluating wider pooling
