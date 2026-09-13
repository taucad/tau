# GeoSpec project configuration

The portable `geospec/config` subpath exports types. The Node-only
`geospec/config/node` subpath exports `loadGeoSpecConfig`.

```typescript
import type { GeoSpecConfig } from 'geospec/config';
import manifest from './tau.json' with { type: 'json' };

export default {
  include: ['**/*.geospec.ts'],
  subjects: {
    part: {
      kind: 'tau-project',
      manifestPath: 'tau.json',
      manifest,
      format: 'step',
    },
  },
} satisfies GeoSpecConfig;
```

JavaScript config can use `/** @type {import('geospec/config').GeoSpecConfig} */`
on a plain object. An identity `defineConfig` helper is unnecessary.

Load with `await loadGeoSpecConfig({ projectPath, configPath, overrides })`.
An explicit path selects one file; otherwise exactly one of
`geospec.config.js`, `.mjs`, `.ts`, or `.mts` is selected. With none present,
the result contains only defined overrides. Multiple conventional files require
explicit selection. The returned configPath is the real file path. Both the
project and config file are resolved before enforcing project containment.

Executable configuration and its imports are trusted developer code. Node
loads the actual module directly, with standard JSON import attributes and
erasable TypeScript syntax. `.js`/`.ts` follow their package module scope;
`.mjs`/`.mts` are ESM. This is not a sandbox or a plugin loader.
Load once per run. Node's same-process module cache is unchanged; use a fresh
process when fresh imports are required. No same-process reload or transitive
import identity is certified.

Defined own override fields replace config fields. Undefined override fields
are absent. Arrays and subjects replace whole values; false and empty arrays
are preserved. Existing discovery and runner code retain their defaults.
In particular, existing discovery currently interprets `include: []` as its
default pattern, and `files: []` as the project root. The config loader does
not accept a `files` field or change either behavior. An empty discovery
result is not a successful test run; existing runner selection rules apply.

Tau descriptors contain imported JSON data and a normalized project-relative
manifestPath. The loader validates the descriptor's supported outer fields,
but does not parse original manifest bytes, validate the Tau manifest schema,
resolve an asset, export geometry, or establish finalized geometry/provenance.
Those host integration obligations remain separate. Similarly, cacheDirectory
requests a location; loading configuration creates no store and confers no
cache authority. Returned options are not a canonical Rust run plan.
