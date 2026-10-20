# GeoSpec project configuration

The portable `geospec/config` subpath exports the config types, `defineConfig`
and `readGeoSpecConfig`. The Node-only `geospec/config/node` subpath exports
`loadGeoSpecConfig`.

```typescript
import { defineConfig } from 'geospec/config';
import { commandExporter } from 'geospec/model/node';

export default defineConfig({
  include: ['**/*.geospec.ts'],
  exporters: [
    commandExporter({
      id: 'cadquery',
      extensions: ['py'],
      command: ['python', 'export.py'],
      capabilities: { formats: ['step'] },
    }),
  ],
});
```

`defineConfig` returns its argument. Its parameter is not generic, so an object
literal gets the same excess-property checks as `satisfies GeoSpecConfig`.
JavaScript config can use it too, or `/** @type {import('geospec/config').GeoSpecConfig} */`
on a plain object.

`exporters` are live model exporters. For `loadModel({ file })`, the first
exporter whose `extensions` claims the file exports it, so list order is the
override. STEP and GLB sources need no exporter.

## Loading in Node

Load with `await loadGeoSpecConfig({ projectPath, configPath, overrides })`.
An explicit path selects one file; otherwise exactly one of
`geospec.config.js`, `.mjs`, `.ts`, or `.mts` is selected. With none present,
the result contains only defined overrides. Multiple conventional files require
explicit selection. The returned configPath is the real file path. Both the
project and config file are resolved before enforcing project containment.

Executable configuration and its imports are trusted developer code. Node
loads the actual module directly, with standard JSON import attributes and
erasable TypeScript syntax. `.js`/`.ts` follow their package module scope;
`.mjs`/`.mts` are ESM. This is not a sandbox or a plugin loader. A
`geospec/config` import resolves to the loader's own copy when the project has
no install, so `npx geospec run` needs none. Load once per run. Node's
same-process module cache is unchanged; use a fresh process when fresh imports
are required. No same-process reload or transitive import identity is
certified.

Defined own override fields replace config fields. Undefined override fields
are absent. Arrays replace whole values; false and empty arrays are preserved.
Existing discovery and runner code retain their defaults. In particular,
existing discovery currently interprets `include: []` as its default pattern,
and `files: []` as the project root. The config loader does not accept a
`files` field or change either behavior. An empty discovery result is not a
successful test run; existing runner selection rules apply. Returned options
are not a canonical Rust run plan.

## Reading on any host

A host that holds its own exporters reads only the config's data fields, with
`await readGeoSpecConfig({ filesystem, projectPath })`. It evaluates the file
through the spec VM, so the browser and Node hosts get the same object.
Discovery is the same as `loadGeoSpecConfig`. The result is one of:

- `absent`: the project has no config;
- `applied`: `options` holds every field except `exporters`;
- `not-applied` with reason `unresolved-import`: the config imports a package
  other than `geospec/config`, such as the module an exporter comes from. Only
  a native run applies it. Imports are detected before bundling, with no network
  call and nothing written into the project;
- `not-applied` with reason `invalid`: there are several configs, or the config
  does not bundle, throws, or has an invalid field.
