---
title: 'Runtime API Policy'
description: 'Naming and ownership rules for runtime consumer, plugin-author, transport, filesystem, and artifact APIs.'
status: active
created: '2026-07-20'
updated: '2026-07-21'
related:
  - docs/policy/library-api-policy.md
  - docs/policy/runtime-architecture-policy.md
  - docs/policy/filesystem-authority-policy.md
  - docs/policy/filesystem-policy.md
  - docs/research/runtime-source-api-unification-blueprint.md
  - docs/research/nested-geometry-unit-runtime-source-contract-regression.md
  - docs/research/runtime-path-namespace-documentation-contract.md
---

# Runtime API Policy

Internal reference for naming values as they cross `@taucad/runtime` consumer, project, plugin-author, transport, filesystem, and artifact boundaries.

## Rationale

The same model entry passes through several representations: unresolved consumer input, a project-relative entry path, a normalized runtime entry path, and an internal worker locator. Historical use of `source`, `file`, `filePath`, `entryPath`, and unqualified “absolute path” for overlapping roles obscured both ownership and which filesystem root a path uses. This policy keeps `entryPath` stable when normalization changes only the path invariant, defines runtime paths relative to the supplied filesystem capability, and reserves different names for genuinely different concepts.

## Rules

### 1. Name by Semantic Role, Not by Data Shape

Use the following vocabulary for runtime APIs:

| Semantic role                                | Required name                         | Example                                   | Boundary and invariant                                                                |
| -------------------------------------------- | ------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------- |
| Unresolved consumer model input              | `source`                              | `{ path: 'lib/cube.scad' }`               | `RuntimeClient`, React hooks, headless services, and CLI adapters                     |
| Project-relative file that starts evaluation | `entryPath`                           | `lib/cube.scad`                           | Manifests and project state; normalized POSIX path without a leading `/`              |
| Filesystem-backed consumer input             | `source.path`                         | `lib/cube.scad` or `/lib/cube.scad`       | Path within the runtime filesystem; may be relative before client normalization       |
| Inline source-map key and selector           | `files` key and `entry`               | `lib/cube.scad`                           | `entry` selects one key from `source.files`; it is not a basename-only filename       |
| Normalized file that starts evaluation       | `entryPath`                           | `/lib/cube.scad`                          | Kernel, bundler, and middleware authoring; normalized runtime path beginning with `/` |
| Arbitrary runtime filesystem target          | `path` or qualified `filePath`        | `/.tau/parameters/lib/cube.scad.json`     | Filesystem methods, dependencies, cache, temporary files, and watches                 |
| Runtime-owned directory-plus-basename value  | structural `file` payload             | `{ path: '/lib', filename: 'cube.scad' }` | Worker and transport protocol internals only                                          |
| Authority-global routing path                | qualified `path`                      | `/projects/proj_123/lib/cube.scad`        | Trusted host composition; selects a mount before a runtime filesystem is rooted       |
| Native backing location                      | `basePath`, `hostPath`, or `hostRoot` | `/Users/alice/project`                    | Host adapter boundary only; never exposed to runtime plugins                          |
| Engine-private location                      | engine-qualified `path`               | `lib/cube.scad` in OpenRSCAD's module map | Kernel implementation only                                                            |

Do not choose a name merely because two values are both strings or both refer to a file. Apply one name consistently wherever the same semantic identity crosses a public or plugin-author boundary. Document whether an `entryPath` is project-relative or a normalized runtime path at the owning type boundary; do not encode that normalization stage by renaming the field.

Use **runtime path** as the public term for a path within the filesystem supplied to the runtime. A leading `/` refers to that filesystem's root, not the host operating system's root. Lexical normalization removes redundant separators and dot segments and rejects root escape and host-only path forms. It preserves exact case and Unicode spelling and does not imply native `realpath`, symlink resolution, case folding, or Unicode normalization.

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

Name the project-relative file that starts project evaluation `entryPath`. Use the same string in project manifests, geometry-unit keys, editor/viewer state, RPC targets, thumbnail identity, and screenshot overlays. Project-relative `entryPath` values are normalized POSIX paths without a leading `/`; `RuntimeClient` later resolves the same identity into a runtime path.

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

Name the normalized runtime path of the model entry `entryPath` in every kernel, bundler, and middleware authoring contract.

This applies to:

- `GetParametersInput`;
- `CreateGeometryInput`;
- `GetDependenciesInput`;
- `BundleInput`;
- `KernelBundler.bundle(entryPath)`;
- `KernelBundler.resolveDependencies(entryPath)`; and
- middleware hooks that receive or wrap those inputs.

The value begins with `/`, is rooted at the supplied runtime filesystem rather than the host OS, and identifies the root evaluation file. Returned dependency paths use the same runtime filesystem namespace but remain ordinary paths because they are not evaluation entries.

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

Use `path` for generic filesystem method parameters when the operation name supplies the missing context, such as `readFile(path)` or `stat(path)`. Use `filePath` when a local value, object field, or multi-path operation needs to distinguish a file target from a directory or another path. At runtime plugin boundaries these values are runtime paths unless the owning API explicitly names another namespace.

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

Use `files` for the inline path-to-content map and `entry` for the key that selects an entry from that map. Keys may contain directory segments. Do not describe `entry` as a filename or propagate that model-source selector into project, kernel, bundler, or filesystem APIs. Unrelated domain records may use `entry` only when their surrounding type makes a different meaning explicit.

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
- Do not call a runtime path an unqualified “absolute path”; define the supplied runtime filesystem root instead.
- Do not expose authority-global `/projects/<id>` paths or host filesystem paths to kernels, bundlers, or middleware.

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
- [ ] Runtime `/` is documented as the supplied runtime filesystem root, never the host OS root.
- [ ] Authority-global, host, runtime, project-relative, and engine-private paths remain qualified at their owning boundaries.

## References

- Related: `docs/policy/library-api-policy.md`
- Related: `docs/policy/runtime-architecture-policy.md`
- Related: `docs/policy/filesystem-authority-policy.md`
- Related: `docs/policy/filesystem-policy.md`
- Research: `docs/research/runtime-source-api-unification-blueprint.md`
- Research: `docs/research/nested-geometry-unit-runtime-source-contract-regression.md`
- Research: `docs/research/runtime-path-namespace-documentation-contract.md`
