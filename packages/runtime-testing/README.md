# @taucad/runtime-testing

[![npm](https://img.shields.io/npm/v/@taucad/runtime-testing)](https://www.npmjs.com/package/@taucad/runtime-testing)
[![downloads](https://img.shields.io/npm/dm/@taucad/runtime-testing)](https://www.npmjs.com/package/@taucad/runtime-testing)
[![size](https://img.shields.io/npm/unpacked-size/@taucad/runtime-testing)](https://www.npmjs.com/package/@taucad/runtime-testing)
[![license](https://img.shields.io/npm/l/@taucad/runtime-testing)](./LICENSE)
[![provenance](https://img.shields.io/badge/provenance-npm-blue)](https://docs.npmjs.com/generating-provenance-statements)

Public-client harnesses, mocks, glTF inspection, and geometry assertions for Tau runtime and plugin authors.

## Why @taucad/runtime-testing?

- **Production-path integration** — `createTestRuntimeClient` composes `createRuntimeClient`, `inProcessTransport`, and `fromMemoryFs` through public runtime entries.
- **No runtime internals** — plugin tests exercise `render`, `export`, events, and shutdown through the same client contract as hosts.
- **One authoring surface** — runtime results, geometry evidence, materials, coordinates, naming, and volume checks share one development-only package.
- **Production packages stay lean** — Vitest-backed utilities live here instead of shipped runtime or geometry-core subpaths.

## Install

```bash
npm install -D @taucad/runtime-testing vitest
npm install @taucad/runtime
```

`@taucad/runtime` and Vitest are required peers. Install one runtime instance and a Vitest version `>=2`.

## Quick start

```typescript
import { afterEach, expect, it } from 'vitest';
import { esbuild } from '@taucad/esbuild';
import { replicad } from '@taucad/replicad';
import { assertSuccess, createGeometryTestHelpers, createTestRuntimeClient } from '@taucad/runtime-testing';
import { defineRuntime } from '@taucad/runtime/worker';

const runtime = defineRuntime({
  plugins: [replicad({ kernels: { default: { wasm: 'single' } } }), esbuild()],
});

const clients = new Set<ReturnType<typeof createTestRuntimeClient>>();

afterEach(async () => {
  await Promise.all([...clients].map((client) => client.shutdown()));
  clients.clear();
});

it('renders through a real runtime client', async () => {
  const client = createTestRuntimeClient({
    runtime,
    files: {
      'main.ts': `
        import { makeBaseBox } from 'replicad';
        export default () => makeBaseBox(10, 20, 30);
      `,
    },
  });
  clients.add(client);

  const outcome = await client.render({ source: { path: 'main.ts' } });
  expect(outcome.superseded).toBe(false);
  if (!outcome.superseded) {
    assertSuccess(outcome.geometry);
    await createGeometryTestHelpers().expectValidGltf(outcome.geometry);
  }
});
```

The caller owns a client returned by `createTestRuntimeClient`. Always call `shutdown()`. `createTestGeometry` and `getTestParameters` are one-shot helpers that close their own clients.

## API

| Area                     | Exports                                                                                                                                         |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Integration harness      | `createTestRuntimeClient`, `createTestGeometry`, `getTestParameters`, type `CreateTestRuntimeClientOptions`                                     |
| Result assertions        | `assertSuccess`, `assertFailure`, `createSuccessResult`, `createGltfSuccessResult`, `createErrorResult`                                         |
| Runtime mocks            | `createMockLogger`, `createMockFileSystem`, `createMockKernelRuntime`, `createMockRuntime`, `createMockRuntimeClient`, `createMockDependencies` |
| Middleware fixtures      | `createMockInput`, `createMockCreateGeometryHandler`, `createMockGetParametersHandler`                                                          |
| Direct-definition helper | `createGeometryFile`, types `TestKernelDefinition`, `TestRuntimeDefinition`, `MockFileSystem`, `MockFileSystemMocks`, `MockFileSystemOptions`   |
| glTF inspection          | `glbToDocument`, `validateGlbData`, `getInspectReport`, `getGeometryStatsFromInspect`, `getBoundingBoxFromInspect`                              |
| Geometry results         | `extractGltfFromResult`, `extractGltfFromExportResult`, `getSignedVolumeFromGlb`, `createGeometryVariant`, `createGeometryTestHelpers`          |
| Material/color evidence  | `colorParityCases`, `expectLinearBaseColor`, `getAllMaterialBaseColors`, `getMaterialAlphaMode`, `getMaterialBaseColor`                         |
| Coordinates and naming   | `readCoordinateEvidence`, `mapZupMillimetersToYupMeters`, `readGltfNamingSummary`                                                               |

Only the package root is a code entry point.

## Environment

| Host           | Supported | Notes                                                         |
| -------------- | --------- | ------------------------------------------------------------- |
| Browser worker | Yes       | browser-safe runtime entries; no Node built-ins               |
| Node.js        | Yes       | Node `>=24`; in-process tests use the platform MessageChannel |

## Versioning and stability

Pre-1.0: a minor version may break. Pin `~0.1.0` rather than `^0.1.0`. This package releases in the fixed version group with `@taucad/runtime`, so the peer range stays aligned. See [version-policy.md](https://github.com/taucad/tau/blob/main/docs/policy/version-policy.md).

## Security and provenance

Every release is published from GitHub Actions with npm trusted publishing and [provenance](https://docs.npmjs.com/generating-provenance-statements). Verify a downloaded tree:

```bash
npm audit signatures
```

## License

Apache-2.0 — see [LICENSE](./LICENSE).

## Links

- [Documentation](https://tau.new/docs/runtime/api/testing)
- [Source](https://github.com/taucad/tau/tree/main/packages/runtime-testing)
- [Changelog](https://github.com/taucad/tau/blob/main/packages/runtime-testing/CHANGELOG.md)
- [Issues](https://github.com/taucad/tau/issues)
