---
title: 'API Evolution Policy'
description: 'Rules for evolving library APIs over time: future flags, stability tiers, API surface management, advanced error patterns, and provider abstractions.'
status: active
created: '2026-03-10'
updated: '2026-07-14'
related:
  - docs/policy/library-api-policy.md
  - docs/policy/version-policy.md
---

# API Evolution Policy

Internal reference for evolving library APIs over time: future flags, stability tiers, API surface management, advanced error patterns, and provider abstractions. These govern how Tau's public APIs grow, stabilize, and deprecate.

For core API design rules (factories, naming, parameters, plugins), see [Library API Policy](library-api-policy.md). For resource cleanup conventions, see [Resource Cleanup Policy](resource-cleanup-policy.md). For versioning and breaking change management, see [Version Policy](version-policy.md).

## Rationale

Library APIs evolve over time; consumers need incremental adoption paths and clear stability guarantees. Future flags, stability annotations, and typed error hierarchies reduce upgrade friction and prevent accidental breaking changes. These patterns are adapted from React Router, Stripe, Vercel AI SDK, and Google Cloud.

## 1. Configuration with Future Flags

Configuration objects that accept future flags use a `future` field with a flat record of boolean flags. Each flag follows the naming convention from the [Version Policy](version-policy.md): `unstable_*` for experimental, `v{N}_*` for stabilized opt-in breaking changes.

```typescript
type RuntimeClientConfig = {
  kernels: KernelPlugin[];
  middleware?: MiddlewarePlugin[];
  future?: Partial<FutureConfig>;
};

type FutureConfig = {
  unstable_parallelTessellation: boolean;
  v2_middlewareApi: boolean;
};
```

**Config resolution** follows React Router's pattern — merge user values with defaults, and error on obsolete flag names:

```typescript
function resolveConfig(user: Partial<FutureConfig>): FutureConfig {
  if ('unstable_middlewareApi' in user) {
    throw new Error(
      '"future.unstable_middlewareApi" has been stabilized as ' +
        '"future.v2_middlewareApi". Please update your configuration.',
    );
  }
  return {
    unstable_parallelTessellation: user.unstable_parallelTessellation ?? false,
    v2_middlewareApi: user.v2_middlewareApi ?? false,
  };
}
```

**Why**: The `future` config pattern (used by React Router, Remix, and Prisma) lets consumers adopt breaking changes incrementally — one flag at a time — rather than facing a wall of changes on the next major upgrade. The `satisfies` pattern gives full type inference:

```typescript
const runtimeOptions = {
  kernels: [replicad()],
  future: {
    v2_middlewareApi: true,
  },
} satisfies RuntimeDefinitionConfig;

export const runtime = defineRuntime(runtimeOptions);
```

## 2. Stability Annotations in Code

Every public export must carry a stability annotation that matches the [Version Policy](version-policy.md) tiers.

### Stable APIs (default)

No annotation needed. Standard JSDoc with `@param`, `@returns`, `@example`.

### Experimental APIs

Use the `unstable_` prefix in the export name. JSDoc must include `@experimental` and a note that the API may change without notice:

```typescript
/**
 * Streaming geometry export with chunked transfer.
 *
 * @experimental This API is unstable and may change in any minor release.
 * @param input - The geometry and export options
 * @returns An async iterable of geometry chunks
 */
export async function* unstable_streamingExport(
  input: StreamingExportInput,
): AsyncIterable<Uint8Array> { ... }
```

When stabilized, the `unstable_` prefix is removed and the old name re-exported with a hard error:

```typescript
export { streamingExport } from './streaming-export';

/** @deprecated Renamed to `streamingExport`. */
export const unstable_streamingExport = (): never => {
  throw new Error(
    '"unstable_streamingExport" has been stabilized as "streamingExport". ' + 'Please update your imports.',
  );
};
```

### Internal APIs

Use `@internal` JSDoc. These are not part of the public API and carry no stability guarantee:

```typescript
/**
 * @internal Framework use only. Not covered by semver.
 */
export function resolveKernelModule(id: string): Promise<KernelModule> { ... }
```

### Unsafe Escape Hatches

For advanced APIs that are exported but carry no stability guarantee, use the `UNSAFE_` prefix (React Router convention):

```typescript
export { createMemoryTransport as UNSAFE_createMemoryTransport } from './transport';
```

## 3. API Surface Management

Principles for managing the public API surface over time. Adapted from React Router's "Less is More" design goal, Stripe's additive-only principle, and Google Cloud's API design guide.

### Addition

New public APIs should be added at the lowest viable abstraction layer. Before adding a new export:

1. **Can it be composed from existing primitives?** If yes, document the composition instead of adding a new export.
2. **Does it belong in consumer space?** APIs that can be implemented by consumers in their own code should not be first-party. Provide a recipe in docs instead.
3. **Is it additive?** New exports, new optional fields, and new event types are always safe to add in minor releases.

### Consolidation

When multiple APIs serve overlapping purposes, prefer consolidation over proliferation. React Router's `useRoute` consolidates `useLoaderData`, `useActionData`, `useRouteLoaderData`, and `useMatches` into a single hook with type-safe route ID lookup.

```typescript
// Before: 4 separate hooks
const data = useLoaderData();
const actionData = useActionData();
const parentData = useRouteLoaderData('parent');
const matches = useMatches();

// After: 1 hook with route-aware type inference
const route = useRoute();
const parentRoute = useRoute('parent');
```

Apply the same principle to `@taucad/runtime`: when adding a new API, check whether an existing API can be extended to cover the use case.

### Removal

APIs are removed only in major releases after the deprecation protocol from the [Version Policy](version-policy.md). The removal PR must:

1. Delete the implementation
2. Update the migration guide with before/after examples
3. Update the changelog with a "Breaking Changes" entry
4. Add a codemod transform if the change is mechanical

## 4. Adapter Pattern for Platform Abstraction

When a library needs to work across multiple platforms (browser, Node.js, Cloudflare Workers, Deno), use the adapter pattern. Adapted from React Router's platform adapters and AWS SDK v3's middleware stack.

### Core Principle

The core library defines a platform-agnostic interface. Adapters implement that interface for each platform. Consumer code depends only on the core interface, never on platform-specific details.

```typescript
// Core: platform-agnostic interface
type RuntimeTransport = {
  send(message: RuntimeCommand): void;
  onMessage(handler: (message: RuntimeResponse) => void): void;
  close(): void;
  dispose(): void;
};

// Adapter: browser Web Worker
function createWorkerTransport(worker: Worker): RuntimeTransport { ... }

// Adapter: Node.js worker_threads
function createNodeTransport(worker: NodeWorker): RuntimeTransport { ... }

// Adapter: in-process (testing)
function createInlineTransport(runtime: KernelRuntimeWorker): RuntimeTransport { ... }
```

### Adapter Export Convention

Adapters are exported from dedicated subpaths, not from the main entry point. This prevents platform-specific code from being bundled in environments where it can't run:

```text
@taucad/runtime                     -- core (platform-agnostic)
@taucad/runtime/transport           -- transport adapters
@taucad/runtime/transport/worker    -- Web Worker adapter (browser)
@taucad/runtime/transport/node      -- worker_threads adapter (Node.js)
```

### Shared API Across Adapters

All adapters for the same interface must expose the same factory signature pattern. A developer who learns `createWorkerTransport(worker, options?)` can predict the shape of `createNodeTransport(worker, options?)`.

## 5. Error Hierarchy with Symbol Markers

Adapted from the Vercel AI SDK's `AISDKError` pattern. Library errors should form a typed hierarchy with cross-package `isInstance()` checks that survive bundler transformations, multiple package instances, and `instanceof` pitfalls.

For basic error design rules (codes, actionable messages, migration errors), see [Library API Policy § 17](library-api-policy.md#17-error-design).

### Base Error Class

Define a base error class with a `Symbol.for()` marker. `Symbol.for()` returns the same symbol across realms, packages, and bundled copies — making it reliable where `instanceof` fails:

```typescript
const marker = 'taucad.kernels.error';
const symbol = Symbol.for(marker);

export class KernelSDKError extends Error {
  private readonly [symbol] = true;

  readonly cause?: unknown;

  constructor({ name, message, cause }: { name: string; message: string; cause?: unknown }) {
    super(message);
    this.name = name;
    this.cause = cause;
  }

  static isInstance(error: unknown): error is KernelSDKError {
    return KernelSDKError.hasMarker(error, marker);
  }

  protected static hasMarker(error: unknown, markerKey: string): boolean {
    const markerSymbol = Symbol.for(markerKey);
    return (
      error != null &&
      typeof error === 'object' &&
      markerSymbol in error &&
      typeof error[markerSymbol] === 'boolean' &&
      error[markerSymbol] === true
    );
  }
}
```

### Subclass Per Error Type

Each error subclass gets its own marker, enabling type-narrowing without `instanceof`:

```typescript
const wasmMarker = 'taucad.kernels.error.WASM_INIT_FAILED';
const wasmSymbol = Symbol.for(wasmMarker);

export class WasmInitError extends KernelSDKError {
  private readonly [wasmSymbol] = true;
  readonly wasmUrl: string;

  constructor({ message, cause, wasmUrl }: { message: string; cause?: unknown; wasmUrl: string }) {
    super({ name: 'WASM_INIT_FAILED', message, cause });
    this.wasmUrl = wasmUrl;
  }

  static isInstance(error: unknown): error is WasmInitError {
    return KernelSDKError.hasMarker(error, wasmMarker);
  }
}
```

### Usage

```typescript
try {
  await client.render({ file, parameters });
} catch (error) {
  if (WasmInitError.isInstance(error)) {
    console.error(`WASM failed to load from ${error.wasmUrl}:`, error.cause);
  } else if (KernelSDKError.isInstance(error)) {
    console.error(`Kernel error [${error.name}]:`, error.message);
  }
}
```

**Why `Symbol.for()` over `instanceof`**: When a library is bundled multiple times (e.g., in both a framework and an application), `instanceof` fails because the class constructor differs between copies. `Symbol.for()` returns the same symbol globally, making the marker check work across all copies. This is the AI SDK's proven approach for a library consumed in diverse bundler configurations.

## 6. Safe Changes (Always Additive)

Adapted from Stripe's "safe changes" definition. These changes are always backward-compatible and can ship in any minor or patch release:

- Adding new optional fields to option objects
- Adding new properties to response/result objects
- Adding new event types to `on()` subscriptions
- Adding new enum values when the consumer handles an `else`/`default` case
- Adding new export subpaths to `package.json`
- Adding new kernels, middleware, or bundler plugins
- Adding new methods to existing objects (when the object is not user-constructible)
- Widening input types (accepting more inputs)
- Adding new deprecation warnings

These changes never require consumer action and should form the bulk of minor releases. Design option objects and result types to be open for extension: use optional fields and document that new fields may appear.

### Open for Extension Pattern

Design types so that consumers tolerate new fields. TypeScript's structural typing helps — as long as consumers don't do exhaustive checks on object keys, new optional fields are invisible to them:

```typescript
// CORRECT: open for extension — new fields can be added in minor releases
type RenderResult = {
  geometry: GeometryData;
  duration: number;
  // future minor releases may add: `warnings`, `stats`, `metadata`, etc.
};

// Avoid: closed to extension — consumer destructures exhaustively
const { geometry, duration, ...rest } = result;
if (Object.keys(rest).length > 0) throw new Error('Unexpected fields');
```

## 7. Provider / Registry Pattern

When a library supports multiple pluggable implementations of the same capability (e.g., multiple CAD kernels, multiple AI providers), use a typed registry pattern. Adapted from the Vercel AI SDK's `createProviderRegistry`.

### Registry Factory

```typescript
export function createKernelRegistry<PROVIDERS extends Record<string, KernelProvider>, SEPARATOR extends string = ':'>(
  providers: PROVIDERS,
  options?: { separator?: SEPARATOR },
): KernelRegistry<PROVIDERS, SEPARATOR> {
  const separator = options?.separator ?? (':' as SEPARATOR);
  const registry = new Map<string, KernelProvider>();

  for (const [id, provider] of Object.entries(providers)) {
    registry.set(id, provider);
  }

  return {
    kernel(modelId: `${Extract<keyof PROVIDERS, string>}${SEPARATOR}${string}`) {
      const [providerId, ...rest] = modelId.split(separator);
      const provider = registry.get(providerId!);
      if (!provider) {
        throw new Error(
          `Kernel provider "${providerId}" not found. ` + `Available: ${[...registry.keys()].join(', ')}`,
        );
      }
      return provider.kernel(rest.join(separator));
    },
  };
}
```

### Usage

```typescript
const registry = createKernelRegistry({
  replicad: replicadProvider(),
  jscad: jscadProvider(),
  manifold: manifoldProvider(),
});

const kernel = registry.kernel('replicad:default');
```

**Why**: The registry pattern decouples kernel selection from kernel creation. Consumers declare available providers once, then reference kernels by qualified ID (`provider:model`). This is the same pattern the AI SDK uses for `openai:gpt-4o` — it scales cleanly to dozens of providers without a combinatorial API surface.

## 8. Implementation Method Naming (`do*` Convention)

When a public-facing method delegates to a provider implementation, the implementation method uses the `do*` prefix to signal it is not meant to be called directly by consumers. Adapted from the Vercel AI SDK's `doGenerate` / `doStream` pattern.

```typescript
// Consumer-facing: clean, documented API
type RuntimeClient = {
  render(input: RenderInput): Promise<RenderResult>;
};

// Provider implementation: do* prefix signals "framework calls this, not you"
type KernelDefinition = {
  doRender(options: KernelRenderOptions): Promise<KernelRenderResult>;
};
```

**Why**: The `do*` prefix creates a clear visual boundary between the consumer API and the provider contract. Consumers see `render()`, providers implement `doRender()`. This prevents the confusion of having two methods with the same name at different abstraction layers.

**When to use**: Only for provider/plugin contracts where the framework wraps the implementation with middleware, error handling, telemetry, or other concerns. Regular internal methods do not need the `do*` prefix.

## 9. Type-Level Testing

Every public type export must have corresponding type-level tests. Adapted from the Vercel AI SDK's `*.test-d.ts` pattern using `expectTypeOf` from `vitest`.

```typescript
// src/types.test-d.ts
import { expectTypeOf, describe, it } from 'vitest';
import { createRuntimeClient } from './index';
import { inProcessTransport } from './transport/in-process';
import { replicad } from './kernels/replicad';
import { defineRuntime } from './worker';

describe('createRuntimeClient', () => {
  it('should infer kernel context types', () => {
    const runtime = defineRuntime({ kernels: [replicad()] });
    const client = createRuntimeClient({
      transport: inProcessTransport({ runtime }),
    });
    expectTypeOf(client.render).toBeFunction();
    expectTypeOf(client.on).toBeCallableWith('progress', (_phase: string) => {});
  });
});
```

**Rules**:

- Type test files use the `.test-d.ts` suffix (excluded from build output).
- Every factory function, type alias, and generic utility has at least one type test.
- Type tests run as part of CI (`pnpm nx test <project>`) alongside runtime tests.
- Type tests catch regressions that runtime tests miss: return type narrowing, generic inference, conditional types, and discriminated union exhaustiveness.

**Why**: The semver-ts specification requires that minor releases don't introduce new type errors. Type-level tests are the only reliable way to enforce this. The AI SDK uses this pattern extensively — every `tool()`, `generateText()`, and schema utility has corresponding type tests that would catch breaking type changes before they ship.

Capability-driven APIs require positive and negative route tests. For every independently declared capability property, type tests must prove that capable routes accept the property, incapable routes reject it, composed routes preserve only the supported intersection, and route selectors/capability manifests infer the same surface exposed at runtime. A generic catch-all options bag is not a substitute for route inference.

### Pre-release contract replacement

Before a public package's first release, an internally consumed authoring or RPC contract may be replaced atomically without aliases, overload bridges, codemods, deprecation warnings, or migration guides. The repository must migrate every first-party producer and consumer in the same change, remove the old names, and retain type/runtime coverage for the resulting contract. This exception does not apply once any affected version has been published.

## 10. Flexible Schema Acceptance

When a library accepts user-provided schemas for validation (parameter schemas, output schemas, structured data), accept multiple schema formats rather than coupling to a single library. Adapted from the Vercel AI SDK's `FlexibleSchema` pattern.

```typescript
type FlexibleSchema<T = unknown> =
  | Schema<T> // native @taucad schema
  | ZodSchema<T> // Zod v3 or v4
  | StandardSchema<T>; // any Standard Schema compliant library

type Schema<T = unknown> = {
  readonly jsonSchema: JSONSchema7;
  readonly validate?: (value: unknown) => ValidationResult<T>;
};

type ValidationResult<T> = { success: true; value: T } | { success: false; error: Error };
```

**Why**: Consumers have strong preferences about validation libraries. Some use Zod, others use Valibot, ArkType, or raw JSON Schema. The AI SDK supports all of them through `FlexibleSchema`, and so should any library that accepts user-defined schemas. The `jsonSchema()` factory provides the low-level escape hatch, while `zodSchema()` provides zero-config integration for the most popular library.
