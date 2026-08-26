/* eslint-disable @typescript-eslint/naming-convention -- test data uses filenames as object keys */
// @vitest-environment node
/**
 * Kernel Integration Test (R12 v6 rewrite).
 *
 * Reproduces the production wiring between the runtime client, an
 * opaque {@link RuntimeFileSystem}, and multi-kernel selection to
 * deterministically prove that v6's zero-arg `client.connect()` plus
 * a transport-owned filesystem produces non-empty geometry.
 *
 * Topology mirrors the shape used by `apps/ui/app/constants/kernel-worker.constants.ts`:
 * everything the transport needs is supplied at construction time, so
 * `await client.connect()` takes no arguments. The original v5 suite
 * threaded a `WorkspaceFileService` through `createBridgeServer` and
 * `client.connect({ port })`; in v6 the transport owns the FS, so we
 * supply it via the bundled `fromMemoryFs` factory (or any opaque
 * `fromX`). This is the same wiring path the editor uses — only the
 * concrete transport differs (`webWorkerTransport(...)` in the
 * browser, `inProcessTransport(...)` here for the node test
 * environment).
 *
 * The original L1 (raw bridge round-trip) and L3 (event-driven entry
 * selection) coverage was specific to v5 plumbing and is no longer
 * reachable in v6 — those layers are deleted here per the plan.
 */

import { describe, it, expect, afterEach } from 'vitest';

import { createRuntimeClient } from '@taucad/runtime';
import { defineRuntime } from '@taucad/runtime/worker';
import { fromMemoryFs } from '@taucad/runtime/filesystem';
import { replicad } from '@taucad/replicad';
import { esbuild } from '@taucad/esbuild';
import { inProcessTransport } from '@taucad/runtime/transport/in-process';
import { gltfCoordinateTransform, gltfEdgeDetection } from '@taucad/middleware';
import { assimp } from '@taucad/assimp';
import { runtime as uiRuntime } from '#runtime/ui-runtime.definition.js';

const hollowBoxSource = `
import { drawRoundedRectangle } from 'replicad';
import type { Shape3D } from 'replicad';

export const defaultParams = {
  width: 100,
  length: 150,
  height: 50,
  thickness: 2,
  cornerRadius: 5,
};

export default function main(p = defaultParams): Shape3D {
  const outer = drawRoundedRectangle(p.width, p.length, p.cornerRadius)
    .sketchOnPlane()
    .extrude(p.height);
  const hollowBox = outer.shell(p.thickness, (f) => f.inPlane('XY', p.height));
  return hollowBox;
}
`;

const integrationRuntime = defineRuntime({
  plugins: [assimp(), replicad(), esbuild()],
  middleware: [gltfCoordinateTransform(), gltfEdgeDetection()],
});

const createIntegrationClient = (fileSystem = fromMemoryFs()) =>
  createRuntimeClient({
    transport: inProcessTransport({ runtime: integrationRuntime, fileSystem }),
  });

const uiRuntimeConfig = {
  tauApiUrl: 'http://localhost:4000',
  tauWebSocketUrl: 'ws://localhost:4001',
};

const uiCylinderSource = `
import { makeCylinder } from 'replicad';

export const defaultParams = {
  radius: 10,
  height: 24,
};

export default function main(params = defaultParams) {
  return makeCylinder(params.radius, params.height);
}
`;

const createUiRuntimeClient = (fileSystem = fromMemoryFs()) =>
  createRuntimeClient({
    transport: inProcessTransport({ runtime: uiRuntime, fileSystem }),
    config: uiRuntimeConfig,
  });

const glbPrimitiveModes = (bytes: Uint8Array<ArrayBuffer>): number[][] => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const jsonLength = view.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength))) as {
    meshes: Array<{ primitives: Array<{ mode?: number }> }>;
  };
  return json.meshes.map((mesh) => mesh.primitives.map((primitive) => primitive.mode ?? 4));
};

type IntegrationClient = ReturnType<typeof createIntegrationClient> | ReturnType<typeof createUiRuntimeClient>;

describe('Kernel Integration — v6 zero-arg connect + transport-owned FS', { timeout: 120_000 }, () => {
  let client: IntegrationClient | undefined;

  afterEach(async () => {
    client?.terminate();
    client = undefined;
  });

  it('renders non-empty geometry from a transport-owned filesystem source', async () => {
    const fileSystem = fromMemoryFs({
      '/main.ts': hollowBoxSource,
    });

    client = createIntegrationClient(fileSystem);

    await client.connect();

    const outcome = await client.render({
      source: { path: '/main.ts' },
      content: { includeEdges: true },
    });

    expect(outcome.superseded).toBe(false);
    if (!outcome.superseded) {
      expect(outcome.geometry.success).toBe(true);
      if (outcome.geometry.success) {
        expect(outcome.geometry.data.format).toBe('gltf');
        if (outcome.geometry.data.format === 'gltf') {
          expect(outcome.geometry.data.content.byteLength).toBeGreaterThan(0);
        }
      }
    }
  });

  it('renders non-empty geometry from inline source files', async () => {
    client = createIntegrationClient();

    await client.connect();

    const outcome = await client.render({
      source: { files: { 'main.ts': hollowBoxSource } },
    });

    expect(outcome.superseded).toBe(false);
    if (!outcome.superseded) {
      expect(outcome.geometry.success).toBe(true);
      if (outcome.geometry.success) {
        expect(outcome.geometry.data.format).toBe('gltf');
        if (outcome.geometry.data.format === 'gltf') {
          expect(outcome.geometry.data.content.byteLength).toBeGreaterThan(0);
        }
      }
    }
  });

  it('renders concurrent root and nested entry paths in independent clients', async () => {
    const fileSystem = fromMemoryFs({
      '/main.ts': hollowBoxSource,
      '/lib/cube.ts': uiCylinderSource,
    });
    const rootClient = createIntegrationClient(fileSystem);
    const nestedClient = createIntegrationClient(fileSystem);

    try {
      await Promise.all([rootClient.connect(), nestedClient.connect()]);

      const outcomes = await Promise.all([
        rootClient.render({ source: { path: '/main.ts' } }),
        nestedClient.render({ source: { path: '/lib/cube.ts' } }),
      ]);

      for (const outcome of outcomes) {
        expect(outcome.superseded).toBe(false);
        if (outcome.superseded) {
          continue;
        }
        expect(outcome.geometry.success).toBe(true);
        if (!outcome.geometry.success) {
          continue;
        }
        expect(outcome.geometry.data.format).toBe('gltf');
        if (outcome.geometry.data.format === 'gltf') {
          expect(outcome.geometry.data.content.byteLength).toBeGreaterThan(0);
        }
      }
    } finally {
      rootClient.terminate();
      nestedClient.terminate();
    }
  });

  it('updateParameters re-renders against the previously opened file', async () => {
    const fileSystem = fromMemoryFs({
      '/main.ts': hollowBoxSource,
    });

    client = createIntegrationClient(fileSystem);

    await client.connect();

    const initial = await client.render({
      source: { path: '/main.ts' },
      content: { includeEdges: true },
    });
    expect(initial.superseded).toBe(false);

    const updated = await client.updateParameters({
      width: 200,
      length: 300,
      height: 100,
      thickness: 4,
      cornerRadius: 10,
    });

    expect(updated.superseded).toBe(false);
    if (!updated.superseded) {
      expect(updated.geometry.success).toBe(true);
      if (updated.geometry.success) {
        expect(updated.geometry.data.format).toBe('gltf');
        if (updated.geometry.data.format === 'gltf') {
          expect(updated.geometry.data.content.byteLength).toBeGreaterThan(0);
        }
      }
    }
  });

  it('renders Replicad geometry through the production UI runtime under SAB/COI auto selection', async () => {
    const previousCrossOriginIsolated = Object.getOwnPropertyDescriptor(globalThis, 'crossOriginIsolated');
    Object.defineProperty(globalThis, 'crossOriginIsolated', {
      configurable: true,
      value: true,
    });

    const fileSystem = fromMemoryFs({
      '/main.ts': uiCylinderSource,
    });

    client = createUiRuntimeClient(fileSystem);

    try {
      await client.connect();

      const outcome = await client.render({
        source: { path: '/main.ts' },
      });

      expect(outcome.superseded).toBe(false);
      if (!outcome.superseded) {
        expect(outcome.geometry.success).toBe(true);
        if (outcome.geometry.success) {
          expect(outcome.geometry.data.format).toBe('gltf');
          if (outcome.geometry.data.format === 'gltf') {
            expect(outcome.geometry.data.content.byteLength).toBeGreaterThan(0);
          }
        }
      }
    } finally {
      if (previousCrossOriginIsolated) {
        Object.defineProperty(globalThis, 'crossOriginIsolated', previousCrossOriginIsolated);
      } else {
        Reflect.deleteProperty(globalThis, 'crossOriginIsolated');
      }
    }
  });

  it('uses OpenRSCAD native edges without selecting the JavaScript edge fallback', async () => {
    client = createUiRuntimeClient(
      fromMemoryFs({
        '/main.scad': 'color("red") cube(2);',
      }),
    );
    await client.connect();

    const outcome = await client.render({
      source: { path: '/main.scad' },
      content: { includeEdges: true },
    });

    expect(outcome.superseded).toBe(false);
    if (outcome.superseded || !outcome.geometry.success || outcome.geometry.data.format !== 'gltf') {
      throw new Error('Expected successful OpenRSCAD GLB render');
    }
    expect(glbPrimitiveModes(outcome.geometry.data.content)).toEqual([[4, 1]]);
  });
});
