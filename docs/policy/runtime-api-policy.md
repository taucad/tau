---
title: 'Runtime API Policy'
description: 'Naming and ownership rules for runtime consumer, plugin-author, transport, filesystem, and artifact APIs.'
status: active
created: '2026-07-20'
updated: '2026-07-20'
related:
  - docs/policy/library-api-policy.md
  - docs/policy/runtime-architecture-policy.md
  - docs/research/runtime-source-api-unification-blueprint.md
  - docs/research/nested-geometry-unit-runtime-source-contract-regression.md
---

# Runtime API Policy

Internal reference for naming values as they cross `@taucad/runtime` consumer, project, plugin-author, transport, filesystem, and artifact boundaries.

## Rationale

The same model entry passes through several representations: unresolved consumer input, a project-relative entry path, the canonical absolute form of that entry path, and a normalized worker locator. Historical use of `source`, `file`, `filePath`, and `entryPath` for overlapping roles obscured ownership and caused callers to construct representations owned by lower layers. This policy keeps `entryPath` stable when normalization changes only the path invariant, while reserving different names for genuinely different concepts.

## Rules

### 1. Name by Semantic Role, Not by Data Shape

Use the following vocabulary for runtime APIs:

| Semantic role                                          | Required name                  | Boundary                                                          |
| ------------------------------------------------------ | ------------------------------ | ----------------------------------------------------------------- |
| Unresolved consumer model input                        | `source`                       | `RuntimeClient`, React hooks, headless services, CLI adapters     |
| Project-relative file that starts evaluation           | `entryPath`                    | manifests, project state, editor/viewer orchestration             |
| Canonical absolute virtual path that starts evaluation | `entryPath`                    | kernel, bundler, and middleware authoring                         |
| Arbitrary filesystem operation target                  | `path` or qualified `filePath` | filesystem methods, cache, temporary-file, and dependency helpers |
| Inline source-map entry selector                       | `entry`                        | `InlineRuntimeSource` only                                        |
| Homogeneous file or artifact collection                | `files`                        | inline source maps and transcoder inputs                          |
| Runtime-owned directory-plus-basename value            | structural `file` payload      | worker and transport protocol internals only                      |

Do not choose a name merely because two values are both strings or both refer to a file. Apply one name consistently wherever the same semantic identity crosses a public or plugin-author boundary. Document whether an `entryPath` is project-relative or canonical absolute at the owning type boundary; do not encode that normalization stage by renaming the field.

**Why**: Normalization changes an entry path's invariant, not the identity or role that its name communicates.

CORRECT:

```typescript
const entryPath = manifest.assets.main.entryPath;

await client.render({
  source: { path: entryPath },
});
```

INCORRECT:

```typescript
const file = manifest.assets.main.entryPath;

await client.render({
  filePath: file,
});
```

### 2. Use `source` at Consumer Operation Ingress

Name unresolved model input `source` on every high-level operation that may establish its own model identity. Reuse the shared `RuntimeSource` contract and the runtime's single normalization boundary.

Only source-bearing operations accept it:

- `RuntimeClient.render({ source })`;
- request-scoped `RuntimeClient.export(format, { source })`;
- `useRuntime({ source })`; and
- wrappers that directly adapt one of those operations.

Do not add `source` to active-render mutations such as `updateParameters()` or `setOptions()`, to source-free export of the latest settled render, or to a React export helper that already owns source through its hook.

**Why**: `source` may require inline staging, entry selection, path canonicalization, and transport dispatch; consumer layers must not pre-resolve those concerns.

CORRECT:

```typescript
await client.export('glb', {
  source: { path: 'lib/cube.scad' },
  parameters,
});
```

INCORRECT:

```typescript
await client.export('glb', {
  entryPath: '/lib/cube.scad',
  parameters,
});
```

### 3. Use `entryPath` for Project Identity

Name the project-relative file that starts project evaluation `entryPath`. Use the same string in project manifests, geometry-unit keys, editor/viewer state, RPC targets, thumbnail identity, and screenshot overlays.

Do not call this value `entry`, `file`, `filename`, `path`, or `source`. Do not split it into directory and basename fields in application code.

**Why**: Project code owns logical entry identity but does not own runtime canonicalization; the name remains stable when RuntimeClient resolves the same path.

CORRECT:

```typescript
type GeometryUnit = {
  entryPath: string;
};
```

INCORRECT:

```typescript
type GeometryUnit = {
  file: {
    path: string;
    filename: string;
  };
};
```

### 4. Use `entryPath` Across Plugin Authoring

Name the canonical absolute virtual path of the model entry `entryPath` in every kernel, bundler, and middleware authoring contract.

This applies to:

- `GetParametersInput`;
- `CreateGeometryInput`;
- `GetDependenciesInput`;
- `BundleInput`;
- `KernelBundler.bundle(entryPath)`;
- `KernelBundler.resolveDependencies(entryPath)`; and
- middleware hooks that receive or wrap those inputs.

The value is canonical, absolute within the runtime filesystem, and identifies the root evaluation file. Returned dependency paths remain ordinary paths and do not become entry paths.

**Why**: Kernel and bundler authors operate on the same resolved root; different names imply a distinction that does not exist.

CORRECT:

```typescript
export default defineKernel({
  async getDependencies({ entryPath }, runtime) {
    return runtime.bundler.resolveDependencies(entryPath);
  },

  async createGeometry({ entryPath }, runtime) {
    const source = await runtime.filesystem.readFile(entryPath, 'utf8');
    return evaluate(source);
  },
});
```

INCORRECT:

```typescript
export default defineKernel({
  async getDependencies({ filePath }, runtime) {
    return runtime.bundler.resolveDependencies(filePath);
  },
});
```

### 5. Reserve `path` and `filePath` for Arbitrary Filesystem Targets

Use `path` for generic filesystem method parameters when the operation name supplies the missing context, such as `readFile(path)` or `stat(path)`. Use `filePath` when a local value, object field, or multi-path operation needs to distinguish a file target from a directory or another path.

Both names are reserved for values that may address an arbitrary filesystem target rather than the model entry specifically. Do not use either name for the canonical root passed through plugin evaluation phases.

Appropriate uses include:

- `filesystem.readFile(filePath)`;
- `filesystem.writeFile(filePath, contents)`;
- temporary export paths;
- cache-entry paths;
- a dependency resolver visiting arbitrary files; and
- UI file-browser or editor operations on an arbitrary file.

Do not mechanically normalize existing `path` and `filePath` parameters between the generic forms. Rename only values whose semantic role is the root evaluation entry.

**Why**: Making every path an `entryPath` would erase the distinction this policy establishes and create false entry ownership; forcing a qualified name into self-describing filesystem methods would add noise without information.

CORRECT:

```typescript
const loadDependency = async (filePath: string): Promise<string> => runtime.filesystem.readFile(filePath, 'utf8');
```

INCORRECT:

```typescript
const loadDependency = async (entryPath: string): Promise<string> => runtime.filesystem.readFile(entryPath, 'utf8');
```

### 6. Keep Normalized Locators Runtime-Owned

Keep the directory-plus-basename locator produced by source normalization inside worker and transport protocol implementation. A structural protocol field named `file` may carry that record because it contains file components rather than a path string; do not expose a reusable named locator type through consumer or plugin-author package barrels.

Do not accept the normalized record as a `RuntimeSource`, reconstruct it in project or UI code, or introduce a second public normalization helper. `RuntimeClient` is the only high-level owner of converting `source` into the protocol record.

**Why**: Allowing consumers to construct the post-normalization representation creates two public identities for the same source and bypasses canonicalization.

CORRECT:

```typescript
await client.render({
  source: { path: 'lib/cube.scad' },
});
```

INCORRECT:

```typescript
await client.render({
  source: {
    path: {
      path: '/lib',
      filename: 'cube.scad',
    },
  },
});
```

### 7. Keep Inline-Source Names Local to `RuntimeSource`

Use `files` for the inline filename-to-content map and `entry` for the key that selects an entry from that map. Do not propagate that model-source selector into project, kernel, bundler, or filesystem APIs. Unrelated domain records may use `entry` only when their surrounding type makes a different meaning explicit.

`source.path` remains the filesystem-source discriminant. Do not rename it to `entryPath`: it is unresolved consumer input and may be relative before runtime normalization.

**Why**: `entry` selects a key from an inline `files` map, whereas `entryPath` identifies a filesystem path; these are different data contracts rather than different normalization stages of one field.

CORRECT:

```typescript
await client.render({
  source: {
    files: {
      'main.ts': mainSource,
      'lib/part.ts': partSource,
    },
    entry: 'main.ts',
  },
});
```

INCORRECT:

```typescript
await client.render({
  source: {
    files: {
      'main.ts': mainSource,
    },
    entryPath: '/main.ts',
  },
});
```

### 8. Name Artifact Inputs Independently from Model Source

Use `files` for the artifact set passed to transcoders and use format-specific result names such as `file`, `bytes`, or `data` only where their concrete result type makes the meaning explicit. Do not rename transcoder artifact collections to `source` or `entryPath`.

**Why**: Transcoders consume produced artifacts, not unresolved model source or an evaluation entry.

CORRECT:

```typescript
async transcode({ from, to, files }) {
  return convertArtifacts(from, to, files);
}
```

INCORRECT:

```typescript
async transcode({ from, to, source }) {
  return convertArtifacts(from, to, source);
}
```

### 9. Enforce Naming at Shared Type Boundaries

Define the vocabulary once in shared runtime input types and reuse those types through `defineKernel`, `defineBundler`, middleware handlers, testing helpers, React adapters, and public documentation.

Use positive declaration tests to prove inferred authoring inputs expose the required names. Do not add compatibility aliases or negative tests solely to preserve knowledge of unreleased field names.

Do not add a syntax-only lint rule for this policy. Whether a path is an entry or an arbitrary file is semantic and cannot be inferred reliably from an identifier alone.

**Why**: Shared types make the correct name unavoidable without false-positive lint rules or duplicated validation.

CORRECT:

```typescript
const kernel = defineKernel({
  async createGeometry({ entryPath }) {
    expectTypeOf(entryPath).toEqualTypeOf<string>();
    return createResult();
  },
});
```

INCORRECT:

```typescript
type CompatibleCreateGeometryInput = {
  entryPath?: string;
  filePath?: string;
};
```

## Anti-Patterns

- Do not use `filePath` for a kernel or middleware entry merely because the value is a path.
- Do not rename every path-like value to `entryPath`; dependencies and temporary files are not entries.
- Do not pass `RuntimeSource` below the RuntimeClient normalization boundary.
- Do not expose a named normalized-locator type to application consumers.
- Do not call a project-relative entry `filename`; it may contain directory segments.
- Do not add aliases for pre-release field names.
- Do not infer semantic role from whether a path is relative or absolute; the owning boundary defines the role.

## Summary Checklist

- [ ] Consumer-owned model input is named `source`.
- [ ] Project-relative evaluation identity is named `entryPath`.
- [ ] Kernel, bundler, and middleware evaluation roots are named `entryPath`.
- [ ] Arbitrary filesystem targets use generic `path` or qualified `filePath`, never `entryPath`.
- [ ] Inline source selectors use `entry` only inside `RuntimeSource`.
- [ ] Artifact collections use `files`.
- [ ] Normalized protocol locators remain runtime-owned.
- [ ] Shared types and positive type tests enforce the vocabulary.
- [ ] No compatibility alias or semantic-name lint rule was added.

## References

- Related: `docs/policy/library-api-policy.md`
- Related: `docs/policy/runtime-architecture-policy.md`
- Research: `docs/research/runtime-source-api-unification-blueprint.md`
- Research: `docs/research/nested-geometry-unit-runtime-source-contract-regression.md`
