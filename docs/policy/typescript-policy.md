---
title: 'TypeScript Policy'
description: 'Type assertion rules, mock typing patterns, generic inference, and common gotchas for safe TypeScript usage across the Tau monorepo.'
status: active
created: '2026-03-09'
updated: '2026-09-05'
related:
  - docs/policy/testing-policy.md
  - docs/research/typescript-overloads.md
  - docs/policy/xstate-policy.md
---

# TypeScript Policy

Internal reference for safe, idiomatic TypeScript usage across the Tau monorepo.

## Rationale

Type assertions (`as`) bypass the compiler's structural checks. When misused — particularly `as never` and `as any` — they silently erase type information and mask real type errors, which surface later as runtime bugs. This policy codifies when assertions are acceptable, what alternatives to prefer, and how to handle the common scenarios that tempt developers toward unsafe casts.

## Rules

### 1. Never Use `as never`

`as never` is banned. The `no-restricted-syntax` ESLint rule (targeting `TSAsExpression > TSNeverKeyword`) enforces this at lint time. The rule is defined in `eslint.config.mjs` because oxlint's jsPlugin adapter does not expose TypeScript-specific AST nodes.

**Why**: `never` is the bottom type — assignable to everything and from nothing. Casting to `never` erases all type information with zero compile-time feedback. It is invariably a cover-up for an underlying type mismatch that should be fixed at the source.

CORRECT:

```typescript
import { mock } from 'vitest-mock-extended';
const options = mock<RuntimeClientOptions>();
```

INCORRECT:

```typescript
const options = {} as never;
const options = {} as unknown as RuntimeClientOptions;
```

### 2. Prefer Proper Typing Over Any Assertion

Before reaching for a type assertion, exhaust these alternatives in order:

1. **Fix the type** — If the types don't align, the type definitions may be wrong.
2. **Narrow the type** — Use type guards, discriminated unions, or `satisfies`.
3. **Annotate explicitly** — Add return type annotations or generic parameters.

**Why**: Each alternative preserves compiler verification. Assertions skip verification entirely.

### 3. Prefer Type-Safe Alternatives Over `as unknown as`

`as unknown as Type` bypasses the compiler entirely. Before using it, exhaust
these alternatives in order of preference:

1. **In tests**: Use `mock<T>()` from `vitest-mock-extended` (see `docs/policy/testing-policy.md` Rules 5 & 11).
2. **For third-party type gaps**: Create `.d.ts` module augmentation files.
3. **For WASM bindings**: Encapsulate casts in typed wrapper functions.
4. **Last resort**: `as unknown as Type` with `oxlint-disable-next-line` comment.

**Why**: Each higher-tier alternative preserves some compiler verification.
`as unknown as` preserves none.

| Scenario                         | Preferred Pattern           | Last Resort                              |
| -------------------------------- | --------------------------- | ---------------------------------------- |
| Mock object in test              | `mock<ServiceType>()`       | —                                        |
| WASM enum binding                | Typed wrapper function      | `as unknown as Parameters<typeof fn>[N]` |
| Third-party type gap             | Module augmentation `.d.ts` | `as unknown as Type`                     |
| Private library API              | `'prop' in obj` narrowing   | `as unknown as { prop: Type }`           |
| Intentionally invalid test input | —                           | `'bad' as unknown as ValidType`          |

CORRECT:

```typescript
import { mock } from 'vitest-mock-extended';
const client = mock<RuntimeClient>({ terminate: vi.fn() });
```

INCORRECT:

```typescript
const client = {} as unknown as RuntimeClient;
```

When `as unknown as` is genuinely necessary (last resort), every usage must
have an `oxlint-disable-next-line @typescript-eslint/consistent-type-assertions`
comment explaining why no higher-tier alternative is feasible.

### 4. Annotate Placeholder Actor Return Types

Placeholder actors (XState actors that `throw new Error('not provided')` and are overridden via `machine.provide()`) must have explicit return type annotations. Without them, TypeScript infers `Promise<never>`, and every `provide()` call requires an assertion.

**Why**: `throw` makes TypeScript infer the return type as `never`. Explicit annotation tells TypeScript the contract the `provide()` replacement must satisfy.

CORRECT — use generic parameters and an explicit return type annotation:

```typescript
type LoadedEvent = { type: 'loaded'; data: Data };
type LoadInput = { id: string };

const loadDataActor = fromSafeAsync<LoadedEvent, LoadInput>(async (): Promise<LoadedEvent> => {
  throw new Error('loadDataActor not provided');
});
```

INCORRECT — no return type annotation, infers `Promise<never>`:

```typescript
const loadDataActor = fromSafeAsync<LoadedEvent, LoadInput>(async () => {
  throw new Error('loadDataActor not provided');
});
```

### 5. Match Mock Types Exactly in `provide()`

When providing actor implementations via `machine.provide()`, the mock's input and return types must exactly match the placeholder actor's types. Use generic parameters on the mock's `fromSafeAsync` call.

**Why**: XState's `provide()` type system performs exact structural matching. Even subtle differences (e.g., `false` vs `boolean`, `string` vs `string | undefined`) cause type errors.

CORRECT — generic parameters match the original actor:

```typescript
machine.provide({
  actors: {
    loadDataActor: fromSafeAsync<LoadedEvent, LoadInput>(async ({ input }) => {
      return { type: 'loaded', data: await fetchData(input.id) };
    }),
  },
});
```

INCORRECT — `as never` masks the type mismatch:

```typescript
machine.provide({
  actors: {
    loadDataActor: fromSafeAsync(async ({ input }) => {
      return { type: 'loaded', data: await fetchData(input.id) };
    }) as never,
  },
});
```

### 6. Preserve Generic Type Information

Generic-aware libraries (notably `@taucad/runtime`'s `RuntimeClient`/`CapabilitiesManifest`/`ExportRoute` and the `KernelPlugin`/`MiddlewarePlugin`/`TranscoderPlugin` carrier types) propagate phantom plugin tuples through every leaf field. Four common patterns silently erode that propagation; this rule blocks all four.

**Why**: Type information lost at one seam cascades — every downstream consumer falls back to wide-default unions (`FileExtension`, `string`, `Record<string, unknown>`), and the loss is invisible at the call site. Sentinel tests in [`packages/runtime/src/types/define-plugin.test-d.ts`](../../packages/runtime/src/types/define-plugin.test-d.ts) (`describe('Type-info preservation invariants (audit-R4)')`) lock in the invariants. Violations of any sub-rule below will trip those sentinels.

#### 6a. Inline named-type expansion to bypass variance failures

When a TypeScript variance failure blocks a structural assignment between a narrow generic instantiation and a wider one (e.g., `RuntimeClient<NarrowKernels>` to `RuntimeClient<KernelPlugin[]>`), inline the named-type expansion at the failing site **before** reaching for `unknown`/`any` fallbacks. Inline shapes are checked structurally; named generic instantiations are checked invariantly when the parameter appears in conditional/distributive positions.

**Why**: The named alias remains exported and structurally equivalent — consumers can still type variables and parameters with it. Only the carrier-type usage is inlined to sidestep the variance check. No type information is lost.

CORRECT — inline expansion at the carrier:

```typescript
renderCapabilities: {
  [K in CollectKernelIds<Kernels>]?: {
    renderOptions: {
      schema: JSONSchema7;
      defaults: RenderOptionsFor<Kernels, K>;
    };
    content?: ContentCapability<RenderContentFor<Kernels, Middleware, K>>;
  };
};
```

INCORRECT — `unknown`/`any` fallback that erases the per-kernel narrowing:

```typescript
renderCapabilities: {
  [K in string]?: {
    renderOptions: { schema: JSONSchema7; defaults: unknown };
    content?: ContentCapability<Record<string, boolean>>;
  };
};
```

#### 6b. Never use `ReturnType<typeof genericFn>` for long-lived bindings

`ReturnType<typeof X>` picks the **last overload** of `X` — for generic-returning factory functions like `createRuntimeClient`, that is the implementation signature, which has no generic parameters bound and resolves to the wide-default form. This silently erodes narrow types across the entire scope of the binding.

**Why**: An explicit `RuntimeClient<MyKernels, MyTranscoders>` alias derived from `ReturnType<typeof kernelFactory>` calls (which return concrete `KernelPlugin<...>`, not generics) preserves narrow type information at every call site.

CORRECT:

```typescript
type TestKernels = readonly [ReturnType<typeof replicad>, ReturnType<typeof tau>];
type TestRuntimeClient = RuntimeClient<TestKernels>;
let client: TestRuntimeClient | undefined;
```

INCORRECT:

```typescript
let client: ReturnType<typeof createRuntimeClient> | undefined;
```

#### 6c. Constrain `Id extends string` in plugin-union utility types

When declaring **union types** that include `KernelPlugin<...>` or `TranscoderPlugin<...>` (not generic constraints, not `infer` carriers), use `string` for the `Id` slot. With `any` in the `Id` slot, every `plugin.id` access leaks `any` and triggers `no-unsafe-argument` lints — which then get papered over with `as string` casts.

**Why**: Generic constraints (`<Kernels extends readonly KernelPlugin<any, any, any>[]>`) and `Extract<…, KernelPlugin<any, any, infer Id>>` projections must use `any` to accept literal narrowing through `infer`. Union types are different — they describe a value, not a projection, so the constraint is sound.

CORRECT:

```typescript
type PluginWithId =
  | KernelPlugin<any, any, string>
  | MiddlewarePlugin
  | BundlerPlugin
  | TranscoderPlugin<any, any, string>;
```

INCORRECT:

```typescript
type PluginWithId = KernelPlugin<any, any, any> | TranscoderPlugin<any, any, any>;
// Forces `plugin.id as string` casts at every access site.
```

#### 6d. Bound `as unknown as` casts in the runtime client surface

Every `as unknown as` cast in [`packages/runtime/src/client/*.ts`](../../packages/runtime/src/client) requires a `// SAFETY:` comment block within five lines above it explaining **why** the cast is sound (typically: the value is a structural witness of the narrower carrier type emitted at a worker boundary).

**Why**: The runtime client surface is the public type contract for every consumer. Drive-by escape hatches there cascade into invisible erosion across `apps/ui`, `apps/api`, and `packages/react`. The sentinel test [`runtime-client.surface.test.ts`](../../packages/runtime/src/client/runtime-client.surface.test.ts) enforces this at PR-review time (type-checking is the wrong layer — the casts are type-system-legal).

CORRECT — a documented witness-narrowing seam:

```typescript
// SAFETY (R7 — see docs/research/runtime-type-bag-propagation.md):
// The implementation signature returns the wide-default `RuntimeClient`
// because the worker physically emits a wide `CapabilitiesManifest` over
// `postMessage`. The public overload narrows the return — every concrete
// value the worker emits is a member of the narrower carrier.
export function createRuntimeClient(options: RuntimeClientOptions): RuntimeClient { ... }
```

INCORRECT — undocumented cast:

```typescript
return wideManifest as unknown as CapabilitiesManifest<Kernels, Transcoders>;
```

For the full rationale and trade-off analysis, see [`docs/research/runtime-client-type-preservation-audit.md`](../research/runtime-client-type-preservation-audit.md).

### 7. Do Not Use `as const` on Individual Literals

`as const` on individual literal values (e.g., `'foo' as const`, `true as const`, `42 as const`) is banned. The `tau-lint/no-literal-const-assertion` oxlint rule enforces this at lint time with auto-fix support.

**Why**: When a function's return type is constrained — by generic parameters (`fromSafeAsync<TReturn, TInput>`), explicit return type annotations, or contextual typing (`.provide()` overrides) — TypeScript contextually types string literals to their literal types automatically. The `as const` assertion is a no-op in these positions and adds visual noise.

CORRECT:

```typescript
return { type: 'dataFetched', data };
```

INCORRECT:

```typescript
return { type: 'dataFetched' as const, data };
```

**When `as const` IS needed** — inside `.map()`, `.flatMap()`, or other callbacks where contextual typing is lost, hoist `as const` to the outermost container instead of individual properties:

```typescript
// CORRECT — container-level as const
entries.map((e) => ({ type: e.isDir ? 'dir' : 'file', name: e.name }) as const);

// INCORRECT — literal-level as const (banned by lint rule)
entries.map((e) => ({ type: e.isDir ? ('dir' as const) : ('file' as const), name: e.name }));
```

The rule only targets `as const` on individual literal values — whole-object `{ ... } as const` and whole-array `[...] as const` are permitted and preferred.

### 8. Widen Literal Types in Mock Return Values

When a mock's return value has literal types (e.g., `false`, `undefined`) that are narrower than the slot's expected type (e.g., `boolean`, `string | undefined`), widen explicitly.

**Why**: TypeScript infers the narrowest possible literal type for object literals. If the slot expects `boolean` but the mock returns `{ hasMore: false }`, the literal `false` doesn't match `boolean` in invariant positions.

CORRECT:

```typescript
return { hasMore: false as boolean, endCursor: undefined as string | undefined };
```

### 9. Handle `process.exit` Mocks Correctly

`process.exit()` returns `never` (it never returns). Mock implementations cannot actually return `never`, so cast the mock function itself.

**Why**: Casting the return value `as never` would violate Rule 1. Instead, cast the entire function to match the `typeof process.exit` signature.

CORRECT:

```typescript
vi.spyOn(process, 'exit').mockImplementation(
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- process.exit returns never
  (() => undefined) as unknown as typeof process.exit,
);
```

### 10. Use `as T` for `JSON.parse` Return Values

`JSON.parse()` returns `any`. In generic functions with a known return type `T`, cast directly to `T`.

**Why**: `as T` is safe from `any` (which is assignable to everything) and more explicit than `as never`.

CORRECT:

```typescript
function parseJson<T>(input: string): T {
  return JSON.parse(input) as T;
}
```

### 11. Iterator `done` Results Use `void`, Not `never`

When implementing `AsyncIterator<T, TReturn>`, the `done: true` result needs `value: TReturn`. Use `TReturn = void` (not `never`) when the iterator has no meaningful return value.

**Why**: `void` accepts `undefined` as a value. `never` accepts nothing, forcing `as never` on every `return` statement.

CORRECT:

```typescript
async *generate(): AsyncGenerator<ServerMessage, void> {
  // ...
}

return { done: true, value: undefined };
```

INCORRECT:

```typescript
return { done: true, value: undefined as never };
```

### 12. Preserve Consumer Input and Project Boundaries

Use `z.input<typeof schema>` for caller-supplied values when defaults, coercions or transforms make the accepted input differ from parsed output. Use the schema's output type only after parsing. Keep the runtime schema and public consumer type under one owner.

Keep one path-alias convention within a project; migrate its consumers instead of layering another parallel scheme. Resolve module/declaration errors at the owning source export, tsconfig inclusion or package boundary. Verify public isolated-declaration output with the package's actual type/build checks rather than patching emitted files or masking missing type information downstream.

Runtime app/lib/spec configurations checked by tsgo must not reference another workspace project or its emitted `out-tsc` declarations. Same-project app/spec references remain valid; separate declaration build configurations retain their own purpose. Use source exports across project boundaries and verify with `pnpm nx run scripts:validate-tsgo-runtime-references`.

Browser-delivered syntax must work in the supported browsers after the actual production transform. Verify lowering, required helpers and disposal behavior before introducing `using` or `await using`; use explicit `try/finally` disposal when that pipeline cannot provide them. Do not turn a historical bundler limitation into a permanent syntax ban: the current UI targets ES2022, and installed Rolldown can lower both forms, while end-to-end browser acceptance remains required for a changed use site.

Declaration emit can reveal TS90xx diagnostics hidden behind earlier semantic errors in a standalone typecheck. If isolated declaration emit reports TS9010 on an inline `as const satisfies` expression, separate the declaration and compatibility check or give the declaration an explicit type. This diagnostic is conditional on the actual emit configuration, not a blanket syntax prohibition.

### 13. Implementation and Diagnostic Conventions

Describe source comments, JSDoc and consumer-facing documentation through the behavior and rationale readers need. Do not use private Tau research row identifiers or plan shorthand as their explanation. Internal research, charters and execution records retain stable decision/work IDs under their own workflow contract; that is distinct from publishing opaque internal references in product code or prose.

Prefer early returns to reduce nesting, composition over inheritance, functional patterns, and const-bound functions over function declarations. Keep functions to at most three parameters; group additional related data in an options object and follow the public API policy's operation-envelope rules.

When removing temporary investigation logs, retain structured error reporting at the owning boundaries. WASM parse failures (including relaxed SIMD), OpenCascade.js initialization, render/network failures and FileManager worker errors must expose named, useful error fields instead of opaque or `undefined` messages. Preserve the concrete failure information needed to diagnose the affected layer.

## Anti-Patterns

### `as unknown as` for Empty Mock Stubs in Tests

**Symptom**: `const options = {} as unknown as ConfigType` for configuration objects in tests.

**Root cause**: The test doesn't need specific configuration values but TypeScript requires the full type.

**Fix**: `mock<ConfigType>()` from `vitest-mock-extended` (Rule 3, testing-policy Rule 5).

### `as never` for XState `provide()` Type Mismatches

**Symptom**: `provide()` call fails because the mock actor type doesn't match the slot.

**Root cause**: The placeholder actor infers `Promise<never>` because it only throws, or the mock's input type doesn't match.

**Fix**: Add explicit return type to the placeholder (Rule 4), and annotate the mock's input parameter (Rule 5).

### `as never` for WASM Enum Values

**Symptom**: OpenCASCADE WASM enum values cast `as never` because the binding types don't match the function parameter types.

**Root cause**: WASM binding type definitions are auto-generated and often imprecise.

**Fix**: Encapsulate in typed wrapper functions. Use `as unknown as Parameters<typeof fn>[N]` inside the wrapper (Rule 3, last resort).

### `as never` in Unreachable Code Paths

**Symptom**: `return undefined as never` in branches guarded by type narrowing that TypeScript can't verify.

**Root cause**: The function's return type doesn't include `undefined`, but the code path is reachable from TypeScript's perspective.

**Fix**: Return the current value (`return context.field`), restructure with exhaustive checks, or widen the return type to include `undefined`.

### `ReturnType<typeof createRuntimeClient>` for Client Bindings

**Symptom**: `let client: ReturnType<typeof createRuntimeClient> | undefined;` followed by call sites where narrow per-format / per-kernel type narrowing has silently disappeared.

**Root cause**: `ReturnType<typeof X>` resolves against `X`'s implementation signature — for generic-returning factories like `createRuntimeClient` that signature is the wide-default form (no generic parameters bound), so the binding loses every narrow `Kernels`/`Transcoders` projection.

**Fix**: Declare an explicit `RuntimeClient<MyKernels, MyTranscoders>` alias derived from `ReturnType<typeof kernelFactory>` calls (kernel/transcoder factories return concrete plugins, not generics). Rule 6b. See [`docs/research/runtime-client-type-preservation-audit.md`](../research/runtime-client-type-preservation-audit.md) Finding 2.

### Plugin-Union Types with `KernelPlugin<any, any, any>`

**Symptom**: Lint errors `@typescript-eslint/no-unsafe-argument` on `plugin.id` accesses, papered over with `plugin.id as string`.

**Root cause**: Using `any` in the `Id` slot of plugin-union types leaks `any` into every `.id` access. The `any` was needed for generic constraints / `infer` carriers — but in **union types** (which describe values rather than projections) `string` is sound.

**Fix**: Constrain `Id extends string` in plugin-union utility types. Rule 6c.

## Summary Checklist

- [ ] No `as never` in any file (`no-restricted-syntax` ESLint rule enforced at lint time)
- [ ] No `as any` (`@typescript-eslint/no-explicit-any` enforced)
- [ ] No `as unknown as` for mock objects in tests (use `mock<T>()` from `vitest-mock-extended`)
- [ ] Remaining `as unknown as Type` have `oxlint-disable-next-line` with description
- [ ] Placeholder actors have explicit return type annotations
- [ ] Mock input types match original actor input types exactly
- [ ] No `literal as const` on individual values (`tau-lint/no-literal-const-assertion` enforced)
- [ ] Iterator `TReturn` uses `void`, not `never`
- [ ] No `ReturnType<typeof genericFn>` for long-lived bindings of generic-returning functions (Rule 6b)
- [ ] Plugin-union types constrain `Id extends string`, not `any` (Rule 6c)
- [ ] Inline named-type expansion when variance blocks narrow → wide assignment, before reaching for `unknown`/`any` (Rule 6a)
- [ ] Every `as unknown as` in the runtime client surface has a `// SAFETY:` comment block within 5 lines above (Rule 6d)

## References

- Related: `docs/policy/testing-policy.md` — `mock<T>()` usage and type-safe mock patterns
- Related: `docs/research/typescript-overloads.md` — overloaded function patterns and mock compatibility
- Related: `docs/policy/xstate-policy.md` — `fromSafeAsync` usage and async actor patterns
- Related: `docs/research/runtime-client-type-preservation-audit.md` — generic type-info preservation across the runtime client surface (Rule 6)
- Related: `docs/research/runtime-type-bag-propagation.md` — top-level `Kernels`/`Transcoders` bag propagation through `RuntimeClient`
- [TypeScript Handbook — Type Assertions](https://www.typescriptlang.org/docs/handbook/2/everyday-types.html#type-assertions)
- [TypeScript Handbook — Conditional Types (overload inference)](https://www.typescriptlang.org/docs/handbook/2/conditional-types.html)
