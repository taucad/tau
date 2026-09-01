---
title: 'Library API Policy'
description: 'Design rules for world-class JavaScript/TypeScript library APIs: factories, defineX, flat options, max 3 params, naming, subpath exports, events, plugins, lazy init, escape hatches.'
status: active
created: '2026-02-23'
updated: '2026-05-17'
related:
  - docs/policy/api-evolution-policy.md
  - docs/policy/resource-cleanup-policy.md
  - docs/research/typescript-overloads.md
  - docs/research/subpath-export-naming.md
  - docs/research/runtime-async-event-contract.md
---

# Library API Policy

Internal reference for designing world-class JavaScript/TypeScript library APIs. Distilled from analysis of Clerk JS, Vite, React Router, Vercel AI SDK, Stripe, and other high-DX libraries.

## Rationale

Consistent API design reduces cognitive load for consumers and plugin authors. These rules codify patterns from high-DX libraries so Tau packages feel familiar and predictable. Factory functions, flat options, and semantic naming enable discoverability without documentation. The max-3-params rule and same-concern smell tests prevent API drift that leads to placeholder parameters and inconsistent interfaces.

For versioning, stability tiers, and breaking change management, see [Version Policy](version-policy.md). For release mechanics, see [Release Policy](release-policy.md). For resource cleanup conventions (`Disposable`, `DisposableStore`, semantic cleanup names), see [Resource Cleanup Policy](resource-cleanup-policy.md). For API evolution, stability annotations, and advanced patterns, see [API Evolution Policy](api-evolution-policy.md).

## 1. Factory Functions Over Classes

Use `createX()` factory functions for consumer-facing instances. Keep class internals hidden behind the returned interface.

```typescript
// CORRECT: factory returns an opaque interface
const client = createRuntimeClient({ kernels: [replicad()] });

// INCORRECT: exposing class constructors
const client = new RuntimeWorkerClient(worker, onLog); // leaks implementation
```

**Why**: Factories allow lazy initialization, hide constructor complexity, and support return-type narrowing without exposing class hierarchies.

## 2. Define Functions for Plugin Authors

Use `defineX()` functions for plugin implementation contracts. The function validates shape and provides type inference without runtime overhead.

```typescript
export default defineKernel({
  name: 'MyKernel',
  version: '1.0.0',
  async onInitialize(options, runtime) { ... },
  async onCreateGeometry(input, runtime, ctx) { ... },
});
```

**Why**: `defineX` is a well-known pattern (Vite's `defineConfig`, Nuxt's `defineNuxtConfig`) that signals "this is a configuration/plugin definition" and enables full type inference on the generic context parameter.

## 3. Flat Options with Sensible Defaults

Prefer flat option objects over deeply nested configuration. Use optional fields with defaults, not required nested objects.

```typescript
// CORRECT: flat, obvious defaults
replicad({ wasm: 'single-exceptions', linearTolerance: 0.1 });

// INCORRECT: deeply nested, hard to read
replicad({
  options: {
    exceptions: { enabled: true },
    mesh: { tolerances: { linear: 0.1 } },
  },
});
```

## 4. Parameter Design

Maximum **3 positional parameters**. Prefer fewer. Each positional parameter must represent a **distinct architectural concern**, not just a different piece of data.

### When to use 1, 2, or 3 parameters

**1 param (options object)** -- Default for factory functions, configuration, and any function where all arguments describe the same concern (operation data, config, etc.). Self-documenting at call sites, trivially extensible.

```typescript
// CORRECT: single object -- self-documenting, easy to extend
createRuntimeClient({ kernels: [replicad()], transport: workerTransport });
render({ file, parameters, tessellation });

// INCORRECT: positional args for same-concern data
render(file, parameters, tessellation);
```

**2 params (primary + config)** -- When there is one clear "subject" and a bag of optional configuration. The first param answers "what", the second answers "how".

```typescript
// CORRECT: clear subject + optional config
exposeFileSystem(fileSystem, options?)
on(event, handler)
fromFsLikeOpaque(fsLike, rootPath?)
```

**3 params (distinct architectural concerns)** -- Only when each parameter represents a genuinely different concern in a consistent interface contract. All methods on the same interface must use the same positional convention.

```typescript
// CORRECT: each param is a different architectural layer
createGeometry(input, runtime, context)
//              ^       ^        ^
//              |       |        └─ kernel state ("mine")
//              |       └────────── framework services ("theirs")
//              └────────────────── operation data ("what")

// CORRECT: standard middleware/interceptor pattern
wrapCreateGeometry(input, handler, runtime)
//                  ^       ^        ^
//                  |       |        └─ middleware context
//                  |       └────────── next-in-chain function
//                  └────────────────── operation data

// INCORRECT: all three are the same concern (operation input data)
createGeometry(file, parameters, tessellation?)
// Should be: createGeometry({ file, parameters, tessellation? })
```

**4+ params -- Never.** Refactor to an object pattern.

### Smell tests

Three signals that indicate a parameter design violation:

**1. Placeholder params.** If a developer writes underscored params (`_runtime, _ctx`) to skip past positions and reach the arg they need, the API has a positional problem. The arg they need should be accessible without dead code.

```typescript
// INCORRECT: developer must write _runtime, _ctx just to reach nativeHandle
async exportGeometry({ fileType, tessellation }, _runtime, _ctx, nativeHandle) {
  // Only uses fileType, tessellation, and nativeHandle

// CORRECT: nativeHandle is in the input object, no placeholders needed
async exportGeometry({ fileType, tessellation, nativeHandle }, _runtime, _ctx) {
  // Everything the developer needs is in the first param
```

**2. Same-concern params.** If all parameters answer the same question ("what should this operation do?"), they belong in one object regardless of count. Three "input data" params is worse than one input object -- even though it's within max-3.

```typescript
// INCORRECT: all three are operation input data
createGeometry(file, parameters, tessellation?)

// CORRECT: single input object
createGeometry({ file, parameters, tessellation? })
```

**3. Inconsistent destructuring.** If you destructure the first param but pass others through as-is at the same conceptual level, the grouping is wrong. When params at the same level are split across positions, they should be merged.

### Consistency principle

Within a contract interface (`KernelDefinition`, `BundlerDefinition`, middleware hooks), every method must follow the same positional pattern. A developer who learns `createGeometry(input, runtime, context)` should be able to predict the shape of `getParameters(input, runtime, context)` without reading docs. This consistency builds muscle memory and reduces cognitive load across all Tau packages.

### Rationale: why (input, runtime, context) is 3 params, not 2

The `context` and `runtime` parameters represent different ownership boundaries:

- `**runtime`\*\* is "theirs" -- framework-provided services (filesystem, logger, tracer, bundler). The kernel author consumes these but doesn't own or create them.
- `**context**` is "mine" -- the kernel's own state, created during `initialize` and threaded through every subsequent call. The kernel author owns and mutates this.

Merging them into a single object would conflate ownership, require making `KernelRuntime` generic over every kernel's context type, and remove the visual signal at the call site that distinguishes framework services from kernel state. The 3-param pattern is also consistent with the middleware `(input, handler, runtime)` pattern -- a standard composition model used by Express, Koa, and gRPC interceptors.

**Why**: Parameter conventions are enforced by `max-params: 3` in ESLint. The same-concern smell tests require semantic understanding and are enforced through code review and agentic documentation.

## 5. Naming Conventions

Names should describe **what** the code does, not **how** the framework routes it internally. A consumer reading `client.render()` understands the action; `client.renderEntry()` leaks an internal dispatch layer.

### Principles

**Describe the action, not the architecture.** Method names should tell the consumer what happens, not how the framework routes the call.

```typescript
// CORRECT: describes the action
client.render({ file, parameters });
worker.initialize(input);

// INCORRECT: leaks internal dispatch architecture
worker.renderEntry(input);
worker.initializeEntry(input);
```

**Describe the concept, not the container.** Type names should say what the object _is_, not where it lives in an array.

```typescript
// CORRECT: says what the object represents
type KernelRegistration = {
  id: string;
  extensions: string[];
  moduleUrl: string;
};

// INCORRECT: says where it lives (an "entry" in a list)
type KernelWorkerEntry = {
  id: string;
  extensions: string[];
  kernelModuleUrl: string;
};
```

**No abbreviations in public API.** Use full words for exported symbols and parameters. Internal code follows the same principle for readability, with narrow exceptions for universally understood abbreviations (`id`, `url`, `fs`).

```typescript
// Good
(tessellation, context, module, buffer, path);

// Avoid
(tess, ctx, mod, buf, p);
```

**Avoid overloading terms.** If a word is already used for one concept, don't reuse it for another. For example, "entry" was previously overloaded as both "item in a registration list" (`MiddlewareEntry`) and "method entry point" (`renderEntry`), which motivated the rename to `MiddlewareRegistration` and `render()`.

### Consistent prefixes by role

Each naming prefix signals a specific role:

| Prefix     | Role                            | Examples                                            |
| ---------- | ------------------------------- | --------------------------------------------------- |
| `create`\* | Factory function                | `createRuntimeClient`, `createBridgePort`           |
| `define*`  | Plugin definition               | `defineKernel`, `defineMiddleware`, `defineBundler` |
| `is*`      | Type guard                      | `isGeometryFile`, `isKernelPlugin`                  |
| `from*`    | Conversion constructor          | `fromNodeFs`, `fromMemoryFs`, `fromFsLikeOpaque`    |
| `on*`      | Framework hook / event callback | `onInitialize`, `onLog`, `onProgress`               |

### Callback and hook naming

Always use the `on*` prefix for callbacks and framework hooks. Never use `*Callback` suffixes or bare verbs.

```typescript
// CORRECT: on* prefix for callbacks
client.on('progress', handler)
{ onLog: (entry) => console.log(entry) }

// CORRECT: on* prefix for framework hooks (subclass overrides)
protected abstract onInitialize(input, runtime): Promise<Context>;
protected abstract onCreateGeometry(input, runtime): Promise<Result>;

// INCORRECT: bare verbs or *Callback suffix
{ print: (msg) => console.log(msg) }
{ logCallback: (entry) => console.log(entry) }
```

**Why**: Consistent naming prefixes let developers predict API shape without reading docs. When every factory starts with `create`_, every type guard starts with `is_`, and every hook starts with `on\*`, the API becomes self-documenting.

## 6. Subpath Exports

Organize `package.json` exports by what each audience needs, not by internal file structure.

```text
@taucad/runtime                -- createRuntimeClient, presets, types (consumer)
@taucad/runtime/kernel         -- replicad(), openscad() factories (consumer)
@taucad/runtime/middleware     -- defineMiddleware(), cache factories (author + consumer)
@taucad/runtime/bundler        -- defineBundler(), esbuild() factory (author + consumer)
@taucad/runtime/transport      -- RuntimeTransport, createWorkerTransport (advanced)
@taucad/runtime/testing        -- test utilities (testing)
```

### Singular subpath naming

Use **singular nouns** for all subpath export segments. Subpaths are module namespaces that a developer imports from, not REST-style collection endpoints. The package name itself may be plural (it scopes a collection of modules), but every subpath within it is singular.

**Why**: Singular subpaths eliminate the doubled-name stutter (`@taucad/runtime/kernels`), align sibling categories so developers can predict paths by analogy, and match the convention used by tRPC, Effect-TS, Drizzle ORM, and TanStack Router.

CORRECT:

```typescript
import { replicad } from '@taucad/runtime/kernel';
import { esbuild } from '@taucad/runtime/bundler';
import { defineMiddleware } from '@taucad/runtime/middleware';
```

INCORRECT:

```typescript
import { replicad } from '@taucad/runtime/kernels'; // stutters package name
import { esbuild } from '@taucad/runtime/bundlers'; // inconsistent with ./middleware
```

| Segment type              | Convention    | Examples                                   |
| ------------------------- | ------------- | ------------------------------------------ |
| Category barrel           | Singular      | `./kernel`, `./bundler`, `./middleware`    |
| Individual implementation | Singular      | `./kernel/replicad`, `./bundler/esbuild`   |
| Standalone module         | Singular      | `./transport`, `./filesystem`, `./testing` |
| Package name              | May be plural | `@taucad/runtime` (scopes a collection)    |

For the full library survey, analysis, and trade-offs behind this convention, see [Subpath Export Naming Research](../research/subpath-export-naming.md).

### Package metadata subpath

Use `./metadata` as the canonical subpath for exposing package metadata (name, version) to external consumers. The internal source file may be named differently (e.g., `package-info.ts`), but the public subpath is always `./metadata`.

CORRECT:

```typescript
import { packageName, packageVersion } from '@taucad/runtime/metadata';
```

INCORRECT:

```typescript
import { packageVersion } from '@taucad/runtime/package-info'; // exposes internal file name
import { packageVersion } from '@taucad/runtime/version'; // ambiguous, conflicts with semver tools
```

**Why**: `./metadata` is explicit, unambiguous, and consistent with Node.js ecosystem patterns for package self-description. Exposing the internal source filename (`package-info`) as the subpath leaks implementation details into the public API surface.

## 7. Subscribe-Anytime Events

Use `.on(event, handler)` returning an unsubscribe function. Events should be subscribable at any point in the lifecycle.

```typescript
const off = client.on('progress', (phase) => console.log(phase));
// Later:
off();
```

**Why**: Works naturally with React's `useEffect` cleanup, avoids config-time binding, and follows the EventEmitter pattern without inheriting `EventEmitter`.

## 8. Plugin Factories Return Plain Objects

Plugin selection functions return plain registration objects, not class instances. The object carries the module URL and configuration.

```typescript
export function replicad(options?: ReplicadOptions): KernelPlugin {
  return {
    id: 'replicad',
    moduleUrl: new URL('../kernels/replicad.kernel.js', import.meta.url).href,
    extensions: ['ts', 'js'],
    options,
  };
}
```

**Why**: Plain objects are serializable, inspectable, and composable. No prototype chain, no hidden state.

## 9. Lazy Initialization for Expensive Resources

Defer Worker creation, WASM loading, and network connections until first use. The factory call itself should be instant.

```typescript
const client = createRuntimeClient({ ... }); // instant, no Worker created
await client.connect({ fileSystem });        // Worker created here
await client.render({ file, params });        // auto-connects if needed
```

## 10. High-Level Wrappers with Low-Level Escape Hatches

Expose a simple high-level API for 90% of users. Export the lower-level primitives for advanced use cases.

```typescript
// High-level (most users)
import { createRuntimeClient } from '@taucad/runtime';

// Low-level (custom transport authors)
import { createWorkerTransport } from '@taucad/runtime/transport';
```

## 11. No Optional Interface Methods

All methods on a contract interface should be required. If a method is optional, the framework must handle the missing case, which adds complexity. Instead, require all methods and let the framework build higher-level operations from the primitives.

```typescript
// CORRECT: all required, framework builds ensureDirectoryExists internally
type RuntimeFileSystem = {
  readFile(path: string, encoding: 'utf8'): Promise<string>;
  writeFile(path: string, data: string | Uint8Array): Promise<void>;
  mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
  // ... all required
};

// INCORRECT: optional methods that need fallback logic everywhere
type RuntimeFileSystem = {
  readFile(path: string): Promise<string>;
  mkdir?(path: string): Promise<void>; // optional = complexity
  ensureDirectoryExists?(path: string): void; // maybe exists, maybe not
};
```

## 12. TypeScript-First Design

- Export types separately using `export type`
- Use comprehensive generics for plugin context types
- Prefer `type` over `interface` (project convention)
- Use discriminated unions for message protocols

For advanced TypeScript patterns (overloaded function types, generic wrappers, factory assignability), see [TypeScript Overloads Research](../research/typescript-overloads.md).

## 13. JSDoc Standards

Every public export must include:

- A description (1-2 sentences explaining purpose)
- `@param` with description for each parameter
- `@returns` with description
- `@example` for factory functions and key utilities
- `@internal` for framework-only APIs
- `@deprecated` with migration path when deprecating

## 14. Environment-Aware Conditional Exports

Use `package.json` export conditions for environment-specific code:

```json
{
  "exports": {
    ".": {
      "import": {
        "types": "./dist/esm/index.d.ts",
        "default": "./dist/esm/index.js"
      },
      "require": {
        "types": "./dist/cjs/index.d.cts",
        "default": "./dist/cjs/index.cjs"
      }
    }
  }
}
```

## 15. Presets for Zero-Config

Provide preset configurations that cover common use cases. Let advanced users compose their own.

```typescript
import { createRuntimeClient, presets } from '@taucad/runtime';

const client = createRuntimeClient(presets.all());
```

## 16. Type-Safe Options Helpers

Every options type that consumers declare as a standalone constant should have a companion `createXOptions()` helper. The helper provides full intellisense via generic inference -- consumers get autocomplete and type checking without importing the type explicitly.

```typescript
// Without helper: requires explicit type import
import type { RuntimeClientOptions } from '@taucad/runtime';
const options: RuntimeClientOptions = { kernels: [replicad()] };

// With helper: intellisense via inference, no type import needed
import { createRuntimeClientOptions } from '@taucad/runtime';
const options = createRuntimeClientOptions({ kernels: [replicad()] });
```

The identity overload returns the input as-is (zero runtime cost). A second merge overload enables declarative overrides when consumers need variations of a base configuration.

Add `createXOptions` to the naming conventions table in section 5:

| Prefix           | Role                                  | Examples                     |
| ---------------- | ------------------------------------- | ---------------------------- |
| `createXOptions` | Options helper (intellisense + merge) | `createRuntimeClientOptions` |

**Canonical implementation**: `createRuntimeClientOptions` in `@taucad/runtime`.

## 17. Options Override Patterns

When an options object contains **plugin arrays** (items with an `id` field), **config objects** (nested plain objects), and **opaque fields** (functional objects like transports), use a three-tier merge strategy in the `createXOptions` merge overload:

| Tier           | Field type                          | Strategy                                                                               | Rationale                                                                                               |
| -------------- | ----------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Plugin arrays  | `kernels`, `middleware`, `bundlers` | **ID-based merge**: match by `id`, replace in-place preserving order, append new items | Plugins have identity (`id`); consumers want to swap one plugin without rewriting the entire array      |
| Config objects | `tessellation`, nested settings     | **Deep merge**: recursively merge keys; absent keys preserve base                      | Config objects have structure (keys); consumers want to override one nested key without losing siblings |
| Opaque fields  | `transport`, `fileSystem`           | **Full replacement**: override replaces entirely                                       | Functional objects have unity (methods work as a set); deep merge would create broken hybrids           |

### Before (manual array manipulation)

```typescript
const debugOptions: RuntimeClientOptions = {
  ...defaultOptions,
  kernels: defaultOptions.kernels.map((k) => (k.id === 'replicad' ? replicad({ withSourceMapping: true }) : k)),
};
```

### After (declarative ID-based merge)

```typescript
const debugOptions = createRuntimeClientOptions(defaultOptions, {
  kernels: [replicad({ withSourceMapping: true })],
});
```

The merge automatically finds the `replicad` kernel by `id`, replaces it in-place, and preserves all other kernels in their original position.

## 18. ES Module Asset Injection

When a factory option selects between heavy asset variants (e.g., WASM builds, large modules), use the **two-tier dynamic import pattern** to enable code-splitting and tree-shaking.

**Design the option as a discriminated union** of preset strings and a custom config object:

```typescript
type WasmOption = 'single' | 'single-exceptions' | { wasmUrl: string; wasmBindingsUrl: string };
```

This allows zero-config consumers to benefit from code-split presets, while advanced consumers can inject custom builds at runtime.

See [ES Module Policy](es-module-policy.md) for the full pattern, bundler compatibility matrix, serialization constraints, and anti-patterns.

## 19. Error Design

Errors in a library API should be predictable, debuggable, and actionable. Adapted from Stripe's error object design and Google Cloud's error model.

### Error Codes

Use string error codes rather than numeric codes or bare message strings. Error codes are stable across releases and can be referenced in documentation:

```typescript
type KernelError = {
  code: 'KERNEL_NOT_FOUND' | 'WASM_INIT_FAILED' | 'BUNDLER_ERROR' | 'RENDER_TIMEOUT';
  message: string;
  cause?: unknown;
};
```

### Actionable Messages

Error messages should tell the developer what to do, not just what went wrong:

```typescript
// CORRECT: actionable
throw new Error(
  `Kernel "${id}" not found. Available kernels: ${available.join(', ')}. ` +
    'Make sure you included it in the `kernels` array when calling createRuntimeClient().',
);

// INCORRECT: describes the problem without guidance
throw new Error(`Unknown kernel: ${id}`);
```

### Migration-Aware Errors

When an API is renamed or removed, the error message at the old call site should point to the replacement:

```typescript
// When a future flag obsoletes an old config name
if (config.future?.unstable_splitModules !== undefined) {
  throw new Error(
    '"future.unstable_splitModules" has been stabilized as "future.v2_splitModules". ' +
      'Please update your configuration.',
  );
}
```

For advanced error hierarchy patterns with `Symbol.for()` markers and cross-realm `isInstance()` checks, see [API Evolution Policy § Error Hierarchy](api-evolution-policy.md#5-error-hierarchy-with-symbol-markers).

## 20. Discriminated-Union Outcomes for Race-Prone Async APIs

When an async method may be **superseded** by a follow-up call before the
underlying work completes, do not silently drop the prior Promise or reject it
with a control-flow exception (a `RenderSupersededError`-style throw on
supersession is an anti-pattern: every consumer pays the cost of a try/catch
they do not care about — for context, the runtime previously exported
`RenderSupersededError` and has since deleted it in favour of the discriminated
outcome shown below). Instead, return a **discriminated-union outcome** so
callers can deterministically branch on supersession without ever throwing.

The pattern, distilled from `RuntimeClient.openFile` / `updateParameters` /
`setOptions` (`packages/runtime/src/client/runtime-client.ts`):

```typescript
export type RenderOutcome =
  | { readonly superseded: false; readonly geometry: HashedGeometryResult }
  | { readonly superseded: true };

const outcome = await client.openFile({ file: '/main.ts', parameters });

if (outcome.superseded) {
  // A newer openFile / updateParameters / setOptions call took ownership of
  // the worker before this one settled. The newer call's RenderOutcome
  // carries the authoritative geometry — this caller can safely no-op.
  return;
}

// outcome.geometry is HashedGeometryResult — typed and narrowed.
renderToScreen(outcome.geometry);
```

Rules of thumb for outcome-shaped APIs:

- **Do not throw on supersession.** Throwing means every consumer must wrap
  the call in `try/catch` even when supersession is the expected,
  benign outcome (e.g. user typing in a parameter slider).
- **Do throw on real errors.** `RenderTimeoutError`, `RuntimeTerminatedError`,
  and `RuntimeNotConnectedError` are still surfaced via Promise rejection —
  they are not normal control flow.
- **Make the discriminant a literal**, not an enum or symbol. `superseded:
true | false` lets TypeScript narrow without any runtime helper.
- **Carry the result on the success branch only.** Putting `geometry?:
HashedGeometryResult` on both branches forces every caller into a
  needless null check; the discriminant exists to avoid that.
- **Document the supersession trigger** in the JSDoc. Consumers need to
  know which sibling calls invalidate the in-flight outcome so they
  can reason about ordering without reading the runtime source.

## 21. Temporal Values

All numeric temporal values — durations, timeouts, intervals, delays, debounces, ages, windows, polling cadences — are in **milliseconds**. Never encode the unit in the identifier (no `Ms`, `Sec`, `S`, `Min`, `Seconds`, `Hours` suffixes; no `ms`/`s`/`min` prefixes).

**Why**: A single canonical unit eliminates conversion bugs at module boundaries. Milliseconds is the JavaScript ecosystem's de facto temporal unit (`setTimeout`, `setInterval`, `Date.now`, `performance.now`, `AbortSignal.timeout`, `requestAnimationFrame` callback timestamp), so aligning with it removes ambient cognitive load. Allowing unit suffixes invites divergence — once one module accepts seconds for "human readability", every consumer must read JSDoc to know which unit applies, and every wire-protocol round-trip becomes a conversion-bug surface.

CORRECT:

```typescript
type CacheOptions = {
  /** Evict entries older than this. */
  maxAge: number;
  /** Delay between retry attempts. */
  retryDelay: number;
  /** Reject the render after this duration. */
  renderTimeout: number;
};

await sleep(250);
client.setOptions({ renderTimeout: 30_000 });
```

INCORRECT:

```typescript
type CacheOptions = {
  maxAgeMs: number; // suffix duplicates the canonical unit
  retryDelaySeconds: number; // breaks the single-unit rule
  renderTimeoutMin: number; // forces consumer-side conversion
};

await sleep(0.25); // ambiguous: seconds or milliseconds?
client.setOptions({ renderTimeoutMs: 30_000 }); // suffix is forbidden
```

### Documenting the unit

Because the identifier carries no suffix, every public temporal field must declare `Milliseconds.` in its JSDoc — a single word on its own sentence. This is the only acceptable place for the unit to appear in source.

CORRECT:

```typescript
type RuntimeClientOptions = {
  /**
   * Reject the render with `RenderTimeoutError` after this duration. Milliseconds.
   *
   * @defaultValue 30000
   */
  renderTimeout?: number;
};
```

### Allowlisted exceptions

Three narrow categories may retain a `Ms` suffix because the identifier is bound to an external contract that we cannot rename:

| Category                        | Examples                                                             | Why exempt                                            |
| ------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------- |
| Node.js `fs.Stats` time fields  | `mtimeMs`, `atimeMs`, `ctimeMs`, `birthtimeMs` (and prefixed copies) | Stdlib API surface                                    |
| Persisted JSON contracts        | `responseTimeMs`, `durationMs`, `p95Ms`, `reasoningStartedAtMs`, …   | Wire format read by dashboards / runbooks / consumers |
| Internal millisecond formatters | `formatMs(n: number): string`                                        | The suffix is the function's purpose, not a unit hint |

The full allowlist lives in `libs/oxlint/src/rules/no-time-unit-suffix.js`. Adding a new entry requires a wire-protocol or stdlib justification — internal renames are never allowlisted.

### Branded duration types

If a future API genuinely needs to accept multiple temporal units (e.g., a CLI surface that takes `--timeout 30s`), introduce a branded `Milliseconds` type and a converter (`seconds(30)` → `Milliseconds`). Do not solve unit ambiguity by reintroducing suffixes.

**Enforced by**: `tau-lint/no-time-unit-suffix` (forbids `Ms`/`Sec`/`Min`/etc. suffixes on identifiers) and `tau-lint/no-bare-time-identifier` (requires the `Milliseconds.` JSDoc tag on temporal fields).

## 22. Async Surface Hygiene (Antipatterns)

Five patterns that signal an async/sync mismatch in your API contract. If you find yourself reaching for any of them, **the contract is wrong** — fix the contract, not the syntax.

For the full root-cause analysis, the eigenquestion that motivates this section, and the recommended transport-layer split, see [Runtime Async-Event Contract Research](../research/runtime-async-event-contract.md).

### Antipattern 1 — `void (async () => { … })()` IIFE inside a sync callback

INCORRECT:

```typescript
onGeometryComputed(transportResult) {
  void (async () => {
    const resolved = await resolveTransportResult(transportResult);
    emitGeometry(resolved);
  })();
},
```

The callback signature is `(result) => void` but the body needs to `await`. The IIFE is the syntactic glue. A consumer reading this can only conclude the API is wrong, or that there is a load-bearing reason that requires deep familiarity with the dispatcher. Both are bad. **Either** make the callback return `Promise<void>` (and have the dispatcher await it), **or** move the async work upstream so the payload arrives already-resolved at the sync boundary.

CORRECT (pre-resolved payload):

```typescript
events.on('geometry', (geometry) => {
  // geometry is already HashedGeometryResult; the transport awaited
  // resolveGeometry before emitting. Body stays sync.
  emitGeometry(geometry);
});
```

### Antipattern 2 — `void promise.then(…)` to "consume" a promise

INCORRECT:

```typescript
void resolveTransportResult(transportResult).then((resolved) => {
  emitGeometry(resolved);
});
```

Identical root cause to Antipattern 1. `void` discards the error pipeline (rejected promises become unhandled-rejection warnings) and hides asyncness from any caller that wants to know "is this done yet?". **Fix the contract** so the caller sees the Promise — return it from the function, expose it through the event surface, or pre-resolve before emitting.

### Antipattern 3 — `await Promise.resolve()` to drain microtasks

INCORRECT (in tests _or_ production code):

```typescript
async function flushMicrotasks(iterations = 100): Promise<void> {
  for (let i = 0; i < iterations; i++) {
    await Promise.resolve();
  }
}

// Test body:
pushResponse({ type: 'geometryComputed', result: wireResult });
await flushMicrotasks();
await flushMicrotasks();
expect(eventResult).toBeDefined();
```

A test that needs this is testing **schedule timing**, not behaviour. The API failed to expose its own asyncness; the test author is reverse-engineering the dispatcher's microtask schedule. A shape change that adds one more `await` in an internal IIFE silently breaks every such test until the iteration count is bumped.

CORRECT — add an awaitable surface to the API:

```typescript
// Test body:
await pushResponse({ type: 'geometryComputed', result: wireResult });
expect(eventResult).toBeDefined();
```

`pushResponse` returns `Promise<void>` that resolves only after the transport's materialisation step completes. **Library authors must expose the asyncness their API performs.** Forcing consumers to drain microtasks is a contract violation.

### Antipattern 4 — `new Promise((resolve, reject) => { void (async () => {…})() })`

INCORRECT:

```typescript
return new Promise<void>((resolve, reject) => {
  pendingConnect = { reject };
  void (async () => {
    try {
      await ensureConnected(connectOptions);
      resolve();
    } catch (error) {
      reject(classifyError(error));
    }
  })();
});
```

This shape arises when **slot capture must precede the awaited chain** (here, `pendingConnect = { reject }` so `terminate()` can later reject the in-flight call). The author resolves it by writing the Promise constructor by hand and stuffing the body into an IIFE — usually with a `// oxlint-disable @typescript-eslint/promise-function-async` comment ten lines above as a tombstone confession.

CORRECT — use [`Promise.withResolvers()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/withResolvers) (TC39 Stage 4, Node 22+, all evergreen browsers) and keep the body an `async function`:

```typescript
async connect(connectOptions: ConnectOptions): Promise<void> {
  const slot = Promise.withResolvers<void>();
  pendingConnect = { reject: slot.reject };
  try {
    await ensureConnected(connectOptions);
    slot.resolve();
  } catch (error) {
    slot.reject(classifyError(error));
  }
  return slot.promise;
}
```

For older Node targets, ship an inline shim — eight lines, well-understood Deferred pattern. The lint suppression goes away with the IIFE.

### Antipattern 5 — Wire primitives in public option objects

INCORRECT:

```typescript
export type ConnectOptions =
  | { fileSystem: RuntimeFileSystemBase; filePoolBuffer?: SharedArrayBuffer }
  | { port: MessagePort; filePoolBuffer?: SharedArrayBuffer };
```

`MessagePort` is a `MessageChannel`-shaped primitive. A WebSocket transport cannot synthesise one. An Electron IPC transport cannot synthesise one. An FFI transport cannot synthesise one. Yet the public surface accepts it — the runtime client therefore advertises a coupling to one specific wire choice.

The same critique applies to any wire-shape primitive in a public option object: `Worker`, `WebSocket`, `ipcRenderer`, `MessagePortMain`, raw `SharedArrayBuffer`. These are channel-specific. A public option type that includes them couples the consumer to a single transport choice and blocks the runtime from being deployed over alternative channels.

CORRECT — accept an opaque transport-ready value and let the transport bind the wire primitive internally:

```typescript
// The opaque RuntimeFileSystem is produced by from* factories.
// Consumers cannot inspect or branch on its representation.
export type RuntimeFileSystem = { readonly [opaqueBrand]: unique symbol };

export const fromMemoryFs: () => RuntimeFileSystem;
export const fromNodeFs: (basePath: string) => RuntimeFileSystem;
export const fromBrowserFs: (...) => RuntimeFileSystem;
export const fromFsLikeOpaque: (fsLike: FsLike, rootPath?: string) => RuntimeFileSystem;
export const fromWorkerOpaque: (worker: Worker) => RuntimeFileSystem;

// The wired transport callable is the only surface that binds wire primitives from options.
const client = createRuntimeClient({
  ...presets.all(),
  transport: webWorkerTransport({
    url: kernelWorkerUrl,
    fileSystem,            // opaque RuntimeFileSystem
    filePoolBuffer,        // optional SAB allocated upstream
  }),
});
await client.connect();    // no arguments
```

A Worker / in-process transport binds the FS bridge via `MessagePort` internally; a WebSocket transport multiplexes it over the same socket; an Electron IPC transport binds it via `MessagePortMain`. The runtime client never types against any wire primitive — that responsibility lives entirely inside the wired {@link TransportPlugin} callable and its `.materialize()` handle.

### Smell tests

Three signals that one of these antipatterns has crept in:

1. **Lint suppression as a tombstone.** A `// oxlint-disable @typescript-eslint/promise-function-async` (or any comment that explains "the lint rule is correct but the architecture forces us around it") is a code smell at the **architecture** level, not the lint level.
2. **`flushMicrotasks` helpers in test files.** If a downstream consumer needs to write `flushMicrotasks()` to test your API, you have either Antipattern 1 or Antipattern 2.
3. **Wire-primitive imports in `package.json`-published types.** `import type { MessagePort } from 'node:worker_threads'` (or the global DOM `MessagePort`) appearing in any `*.d.ts` is a candidate Antipattern 5.

### Why this matters for library DX

Internal callers can usually work around these patterns. **Downstream consumers cannot.** A consumer who imports `RuntimeClient` and writes their own tests inherits every microtask drain, every IIFE schedule, every wire-primitive coupling. The blast radius of a sync-void-callback-with-async-body is the entire ecosystem of consumers who try to test against your API. Fixing the contract once eliminates the class.

## 23. Plugin-Layer Values Are Plain-Data Specs

Plugin-layer values produced by factories like `fromMemoryFs(...)`, `fromNodeFs(...)`, `fromBrowserFs(...)`, `fromFsLike(...)`, `inProcessTransport({...})`, `webWorkerTransport({...})`, `replicad()`, `manifold()`, `esbuild()`, and `parameterCache()` are **plain-data specs**, not live instances. They describe **how to materialise** a live binding when a `RuntimeClient` is constructed. Each call to `createRuntimeClient(spec)` runs the spec's `materialize()` factory **once per client lifetime**, producing a fresh, isolated live binding (filesystem adapter, transport bridge, kernel handle).

This shape is what allows the same option object — including the same `fromMemoryFs(seed)` value — to feed an arbitrary number of clients without leaking state across them. The contract is: **specs are immutable plain data; instances are per-client and ephemeral**.

### Rule: declare static specs at module scope

If the spec value does not depend on per-render input, declare it at module scope and pass it directly to `createRuntimeClient` (or to the helper that builds your options). This dogfoods the multi-client-from-one-spec contract on every cold module load.

```typescript
// CORRECT: module-scope spec, multi-client safe
import { createRuntimeClient, createRuntimeClientOptions, fromMemoryFs, presets } from '@taucad/runtime';
import { inProcessTransport } from '@taucad/runtime/transport/in-process';

const replicadReferenceClientOptions = createRuntimeClientOptions({
  ...presets.all(),
  transport: inProcessTransport({ fileSystem: fromMemoryFs() }),
});

export const ReplicadReference = ({ code }: { code: Record<string, string> }) => {
  // Each <KernelModelView /> instance produces its own materialised filesystem,
  // transport, and kernel — even though the spec object is shared.
  return <KernelModelView clientOptions={replicadReferenceClientOptions} code={code} />;
};
```

### Antipattern: wrapping static specs in `useMemo`

`useMemo(() => createRuntimeClientOptions({...}), [])` is the React-flavoured way of pretending a plain-data spec has component-scope ownership. It does not. The spec is referentially identical across every render of the component **and** across every component instance — `useMemo` adds runtime overhead and reader confusion without changing the behaviour. The same critique applies to `useState(() => createRuntimeClientOptions({...}))`.

```typescript
// INCORRECT: useMemo over a static spec
const ReplicadReference = ({ code }: Props) => {
  const clientOptions = useMemo(
    () =>
      createRuntimeClientOptions({
        ...presets.all(),
        transport: inProcessTransport({ fileSystem: fromMemoryFs() }),
      }),
    [],
  );
  return <KernelModelView clientOptions={clientOptions} code={code} />;
};
```

`useMemo` is only legitimate when a spec **depends on per-render inputs** (props, route parameters, user-selected paths). In that case the dependency array reflects the genuine inputs and `useMemo` is doing real work.

### Why this matters

When specs are declared at module scope, every multi-instance render path automatically exercises the multi-client-from-one-spec invariant. If a `from*` factory ever regresses to capturing shared mutable state (e.g. an inline filesystem instance instead of a `create()` factory), the failure surfaces immediately — a single hot-reload of the docs page will produce two `RuntimeClient`s that read each other's writes. By contrast, ad-hoc inline `createRuntimeClient({...})` calls inside components mask the regression because most components only ever produce one client per page.

**Fail loudly, dogfood the contract, keep static specs at module scope.**
