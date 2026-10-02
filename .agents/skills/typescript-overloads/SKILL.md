---
name: typescript-overloads
description: Resolve TypeScript overloaded function type errors in object literals, factory patterns, and generic wrappers. Use when encountering TS2322 overload assignability errors, implementing interfaces with overloaded methods in object literals, wrapping generic library types that erase backend-specific options, or when vi.fn()/jest.fn() mocks fail to satisfy overloaded signatures.
---

# TypeScript Overloads & Generic Patterns

Handles two recurring TypeScript pain points:

1. Implementing overloaded interface methods in object literals
2. Preserving generic type parameters through wrapper types

## Quick Reference

See [docs/research/typescript-overloads.md](../../../docs/research/typescript-overloads.md) for full analysis, pattern comparison table, and references.

## Pattern 1: Overloaded Methods in Object Literals

**Problem:** Arrow functions and methods in object literals receive _strict_ overload checking. An implementation returning `string | Uint8Array` cannot satisfy separate overload return types.

**Solution:** Declare overloads as a function statement, assign to the object property.

```typescript
const factory = async (): Promise<MyInterface> => {
  const backend = await init();

  function readFile(path: string): Promise<Uint8Array<ArrayBuffer>>;
  function readFile(path: string, encoding: 'utf8'): Promise<string>;
  async function readFile(path: string, encoding?: 'utf8') {
    const data = await backend.read(path);
    return encoding === 'utf8' ? decode(data) : data;
  }

  return { readFile }; // no assertion needed
};
```

**Why:** Function statements get _loose_ implementation checking (same as class methods). The compiler verifies the implementation is compatible with overloads, but doesn't require strict assignability.

**Anti-patterns:**

- `as MyInterface` type assertion on the entire object (hides real errors)
- `as unknown as MyInterface` double cast (suppresses all checking)
- Replacing overloads with union return type (regresses call-site DX)

## Pattern 2: Generic Wrapper Types

**Problem:** Wrapping `LibraryConfig<T extends Base>` with `T = Base` erases subtype-specific options.

```typescript
// BAD: OptionsOf<Base> = object → no storeName, no handle
type Opts = { config: BackendConfiguration<Backend> };

// BAD: escapes type system
type Opts = { config: { backend: any } & Record<string, unknown> };
```

**Solution:** Make both the type alias and function generic over `T`.

```typescript
type Opts<T extends Backend = Backend> = {
  config: BackendConfiguration<T>;
};

const create = async <T extends Backend>(opts: Opts<T>) => resolveMountConfig(opts.config);

// T inferred as typeof IndexedDB → storeName is valid
create({ config: { backend: IndexedDB, storeName: 'myfs' } });
```

## Pattern 3: Mock Overloaded Functions (Vitest/Jest)

`vi.fn<T>()` only captures the _last_ overload signature (`Parameters<T>` limitation).

**Solution:** Wrap `vi.fn()` in a function declaration with proper overloads.

```typescript
const readFileFn = vi.fn();

function readFile(path: string): Promise<Uint8Array<ArrayBuffer>>;
function readFile(path: string, encoding: 'utf8'): Promise<string>;
async function readFile(path: string, encoding?: 'utf8') {
  return readFileFn(path, encoding);
}

// readFile satisfies the overloaded interface
// readFileFn is available for mock assertions
```

Use `createMockFileSystem()` shared factory for `@taucad/runtime` tests.

## Decision Matrix

| Scenario                                       | Pattern                          |
| ---------------------------------------------- | -------------------------------- |
| Object literal implements overloaded interface | Function declaration (Pattern 1) |
| Wrapper type erases generic options            | Generic propagation (Pattern 2)  |
| Mock needs to satisfy overloaded type          | Wrapper + vi.fn() (Pattern 3)    |
| Public API with multiple signatures            | Keep overloads on interface      |
| Internal helper consumed immediately           | Union return type is acceptable  |

## Conditional Return Type Alternative

Single generic signature with conditional return. Good for library internals that compose with `Parameters<T>`/`ReturnType<T>`:

```typescript
readFile<E extends 'utf8' | undefined = undefined>(
  path: string, encoding?: E,
): Promise<E extends 'utf8' ? string : Uint8Array<ArrayBuffer>>;
```

Trade-off: Implementation body still needs a type assertion (TypeScript can't narrow conditional returns inside implementations).
