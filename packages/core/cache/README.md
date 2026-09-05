# @taucad/cache-core

[![npm](https://img.shields.io/npm/v/@taucad/cache-core)](https://www.npmjs.com/package/@taucad/cache-core)
[![downloads](https://img.shields.io/npm/dm/@taucad/cache-core)](https://www.npmjs.com/package/@taucad/cache-core)
[![size](https://img.shields.io/npm/unpacked-size/@taucad/cache-core)](https://www.npmjs.com/package/@taucad/cache-core)
[![license](https://img.shields.io/npm/l/@taucad/cache-core)](./LICENSE)
[![provenance](https://img.shields.io/badge/provenance-npm-blue)](https://docs.npmjs.com/generating-provenance-statements)

Deterministic content-addressed storage and compute reuse for browser, worker, and server runtimes.

The package supplies strict canonical values, branded SHA-256 identities, defensive in-memory content and action stores, and a transactional compute reuse service. Kernel, meshing, solver, and slicing integrations can share these primitives without depending on the Tau runtime.

## Install

```bash
npm i @taucad/cache-core
```

## Quick start

```typescript
import { createComputeReuseService, createMemoryActionStore, createMemoryContentStore } from '@taucad/cache-core';
import type { CacheCodec, ComputeAction } from '@taucad/cache-core';

const contentStore = createMemoryContentStore({ maxBytes: 64 * 1024 * 1024 });
const actionStore = createMemoryActionStore({ maxBytes: 4 * 1024 * 1024 });
const reuse = createComputeReuseService({ contentStore, actionStore });

const codec: CacheCodec<string> = {
  id: 'text',
  version: '1',
  mediaType: 'text/plain;charset=utf-8',
  encode: ({ value }) => new TextEncoder().encode(value),
  decode: ({ bytes }) => new TextDecoder().decode(bytes),
};

const action: ComputeAction = {
  schemaVersion: 1,
  namespace: 'example.solver',
  producer: { id: 'solver', version: '1.0.0', implementationAssets: [] },
  operation: 'solve',
  inputs: [],
  arguments: { iterations: 100 },
  environment: null,
  codec: { id: codec.id, version: codec.version },
};

const result = await reuse.evaluate({
  action,
  codec,
  policy: 'best-effort',
  compute: async ({ signal }) => {
    signal.throwIfAborted();
    return 'completed';
  },
});
```

`best-effort` treats cache corruption or adapter failures as misses and preserves the successful compute result. `required` reports corruption and persistence failures. In both modes, an ordinary miss computes normally. Content is written before its action record, so an action hit never observes a partially published result.

Each action input carries an explicit `kind` (`content`, `action`, or `scene`). Action inputs form the dependency edges in the stored Merkle DAG.

Use `createTieredContentStore` and `createTieredActionStore` to put an opportunistic memory tier in front of a required durable adapter. Reads warm faster tiers. Writes may fail in opportunistic tiers, but every tier marked `required: true` must accept content before the action becomes publishable.

## API

| Entry                        | Purpose                                                      |
| ---------------------------- | ------------------------------------------------------------ |
| `@taucad/cache-core`         | Canonical values, digests, stores, codecs, and compute reuse |
| `@taucad/cache-core/testing` | Framework-neutral conformance checks for store adapters      |

Durable adapters can run `runContentStoreConformance` and `runActionStoreConformance` from the testing entry. Project, host, and remote adapters should also run `runOwnerScopedStoreConformance`; it verifies content-before-action publication, concurrent idempotency, defensive reads, and that digest knowledge cannot authorize a foreign owner. Codecs can run `runCacheCodecConformance` with representative values and a semantic equality predicate.

## Environment

| Host              | Supported | Notes                                              |
| ----------------- | --------- | -------------------------------------------------- |
| Browser or worker | Yes       | Web Crypto and standard encoding/cancellation APIs |
| Node.js           | Yes       | `>=24`                                             |

The root package has no runtime dependencies and performs no initialization at module scope.

## Versioning and stability

Pre-1.0: a minor version may break. Pin `~0.1.0` rather than `^0.1.0`. See [version-policy.md](https://github.com/taucad/tau/blob/main/docs/policy/version-policy.md).

## Security and provenance

Every release is published from GitHub Actions with npm trusted publishing and [provenance](https://docs.npmjs.com/generating-provenance-statements). Verify a downloaded tree:

```bash
npm audit signatures
```

## License

Apache-2.0 — see [LICENSE](./LICENSE).

## Links

- [Documentation](https://tau.new/docs/runtime)
- [Source](https://github.com/taucad/tau/tree/main/packages/core/cache)
- [Changelog](https://github.com/taucad/tau/blob/main/packages/core/cache/CHANGELOG.md)
- [Issues](https://github.com/taucad/tau/issues)
