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

For browser renderer output tests, also install `three` at version `^0.184.0` and import the browser subpath. Three is an optional peer for package-root consumers.

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
| Result assertions        | `assertSuccess`, `assertFailure`, `createErrorResult`                                                                                           |
| Runtime mocks            | `createMockLogger`, `createMockFileSystem`, `createMockKernelRuntime`, `createMockRuntime`, `createMockRuntimeClient`, `createMockDependencies` |
| Middleware fixtures      | `createMockInput`, `createMockCreateGeometryHandler`, `createMockGetParametersHandler`                                                          |
| Direct-definition helper | `createGeometryFile`, types `TestKernelDefinition`, `TestRuntimeDefinition`, `MockFileSystem`, `MockFileSystemMocks`, `MockFileSystemOptions`   |
| Bundler conformance      | `describeBundlerConformance`, types `BundlerConformanceFileSystem`, `BundlerConformanceVm`                                                      |
| glTF inspection          | `glbToDocument`, `validateGlbData`, `getInspectReport`, `getGeometryStatsFromInspect`, `getBoundingBoxFromInspect`                              |
| Geometry results         | `extractGltfFromResult`, `extractGltfFromExportResult`, `getSignedVolumeFromGlb`, `createGeometryVariant`, `createGeometryTestHelpers`          |
| Material/color evidence  | `colorParityCases`, `expectLinearBaseColor`, `getAllMaterialBaseColors`, `getMaterialAlphaMode`, `getMaterialBaseColor`                         |
| Coordinates and naming   | `readCoordinateEvidence`, `mapZupMillimetersToYupMeters`, `readGltfNamingSummary`                                                               |

The package root contains the runtime and geometry helpers above. Browser renderer capture has a separate `@taucad/runtime-testing/browser/three-renderer-output` entry so package-root imports do not load Three.

### Browser renderer output

Use the browser subpath in Three.js WebGL and native WebGPU fixture tests. Pass the explicit `'hardware'` or `'software'` profile supplied by the browser configuration. Install before the renderer's first render, then await capture after the final frame. Await disposal before the fixture or React disposes the renderer.

```typescript
import { page } from 'vitest/browser';
import {
  captureRendererOutput,
  createRendererOutputCanvas,
  disposeRendererOutput,
  installRendererOutput,
} from '@taucad/runtime-testing/browser/three-renderer-output';

installRendererOutput(renderer, webGpuProfile);
try {
  await renderFrame();
  const pixels = await captureRendererOutput(renderer);
  const snapshot = createRendererOutputCanvas({ renderer, pixels });
  document.body.append(snapshot);
  try {
    await page.screenshot({ element: snapshot, path: 'final-frame.png' });
  } finally {
    snapshot.remove();
  }
} finally {
  await disposeRendererOutput(renderer);
  renderer.dispose();
}
```

`captureRendererOutput` returns RGBA `Uint8ClampedArray` pixels in Canvas2D orientation with straight alpha. On software native WebGPU, it reads a temporary final output target; on hardware WebGPU and WebGL, it copies the presented canvas. `createRendererOutputCanvas` builds a detached canvas from captured pixels, positioned at the renderer's page bounds for screenshot assertions. The caller adds and removes that canvas; the helper does not render another frame. Captured arrays retain their width and height: a snapshot after any drawing-buffer resize throws `RangeError`, even when the pixel count is unchanged. Copied or external arrays are checked only by length, so their caller must ensure they represent the current frame. Capture again after resizing. A WebGPU renderer must use a native WebGPU backend; Three's WebGL fallback throws. Installing twice or capturing before install or after disposal also throws. `disposeRendererOutput` drains a pending readback, restores the renderer and releases the temporary target; calling it when nothing is installed is safe for fixture cleanup.

### Native dependency preparation

The Node-only `@taucad/runtime-testing/preparation` entry is the harness for `tau-plugin.json` preparation tests (native dependency charter D27). `createFixtureClosure` pins in-test payloads (`tarGz`, `storedZip`, `wheel`) by their real digests and returns the manifest, the parsed deployment, the canonical registry routes and a writer for the seed layout (`blobs/sha256/<hex>` plus `tau-seed.json`). The seed directory is the fixture registry of every child-process tier: `startPayloadMirror` serves it on `127.0.0.1:0` and records each request, so a surface proves mirror order, no-fallback and redirect refusal from outside the process. `createFakeRegistry` is the in-process transport, `installFetchTripwire` fails any stray global `fetch`, and `readGoldenReceipts`, `compareWithGolden` and `appendGoldenSummary` compare a sealed receipt with the producer's `tau-plugin.golden.json` and write the comparison to `TAU_GOLDEN_SUMMARY_FILE` for a CI summary.

```typescript
import { createPreparationHost } from '@taucad/runtime/preparation/node';
import { createFakeRegistry, createFixtureClosure, utf8 } from '@taucad/runtime-testing/preparation';

const closure = await createFixtureClosure({
  payloads: [{ name: 'worker.py', bytes: utf8('print("ready")\n'), format: 'raw', destination: 'worker' }],
});
const registry = createFakeRegistry(closure.routes);
const host = createPreparationHost({ plugins: [closure.plugin()], store: '/tmp/tau-store', fetch: registry.fetch });
const outcome = await host.prepare({ package: closure.package, signal: AbortSignal.timeout(30_000) });
```

The tiers of the native dependency tests, with their owners:

| Tier                  | What it proves                                                                                                                             | Owner (Nx target · file)                                                                                                                                          |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0 Types               | Public preparation inference                                                                                                               | `runtime:test` · `preparation/preparation.test-d.ts`                                                                                                              |
| 1 Units               | Archive readers, integrity, `fetchVerified`, manifest schema, variant selection                                                            | `archive-core:test` · `tar`, `zip`, `wheel`, `integrity`, `fetch-verified` tests; `runtime:test` · `plugin-deployment`, `select-variant`, `host-indicators` tests |
| 2 Preparation host    | Happy, failure, tamper, refusal, cancel, join, offline, mirror, seed, kill-at-phase (a `node:http` mirror), receipt-stale, store exhausted | `runtime:test` · `preparation-host.test.ts`, `preparation-host.kill.test.ts`; `runtime-testing:test` · `preparation/preparation.test.ts`                          |
| 2 CLI in process      | `tau prepare` exit codes and records                                                                                                       | `cli:test` · `commands/prepare.test.ts`                                                                                                                           |
| 3a Kernel options     | Receipt to kernel options                                                                                                                  | `build123d:test` · `build123d-closure.test.ts`; `picogk:test` · `picogk-closure.test.ts`, `picogk-closure.prepare.test.ts`                                        |
| 3b Real closures      | Golden `treeIntegrity`, re-verification and the native suites on darwin-arm64                                                              | `build123d:test:native-darwin`, `picogk:test:native-darwin` (the `native-darwin` workflow)                                                                        |
| 4 MCP and daemon      | `prepare_kernel` and evaluation over `tau mcp` and `tau serve` (4a fixture closure under a `node:http` mirror, 4b real bytes)              | `cli:test` · `commands/mcp.integration.test.ts`, `commands/serve.integration.test.ts`; `cli:test:native-darwin`                                                   |
| 5 CLI binary          | `tau prepare` as a child against a `node:http` mirror; `tau export` from the seed                                                          | `cli:test` · `commands/prepare-mirror.integration.test.ts`, `build123d-export.integration.test.ts`                                                                |
| 6 Desktop             | Store seeding and first use from the package (closed-port mirror)                                                                          | `desktop:test` · `tau/native-store.test.ts`; `desktop-e2e:test:e2e:packaged` (nightly)                                                                            |
| 7 Clean machine       | Notarised first-use download on macOS 26                                                                                                   | `qualify-desktop-macos.yml` (W12)                                                                                                                                 |
| 8 Consumers           | Each consumer surface (charter W22)                                                                                                        | A project joins `native-darwin` by declaring `test:native-darwin`                                                                                                 |
| 9 Standalone projects | Exported projects build outside Tau (charter W23)                                                                                          | `ci.yml` standalone rows, the nuget step of the `native-darwin` workflow                                                                                          |

The weekly `pin-freshness.yml` job checks every pin against its publisher (HEAD `Content-Length`, PyPI `yanked` and sha256, python-build-standalone `SHA256SUMS`, Microsoft `releases.json`) and only reports.

## Environment

| Host           | Supported | Notes                                                                          |
| -------------- | --------- | ------------------------------------------------------------------------------ |
| Browser worker | Yes       | browser-safe runtime entries; no Node built-ins (`./preparation` is Node-only) |
| Node.js        | Yes       | Node `>=24`; in-process tests use the platform MessageChannel                  |

The renderer-output subpath requires a DOM canvas and Three.js; use it in browser tests.

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
