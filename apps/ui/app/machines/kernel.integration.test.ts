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
 * The original L1 (raw bridge round-trip) and L3 (event-driven setFile
 * legacy event) coverage was specific to v5 plumbing and is no longer
 * reachable in v6 — those layers are deleted here per the plan.
 */

import { describe, it, expect, afterEach } from 'vitest';

import { createRuntimeClient } from '@taucad/runtime';
import { defineRuntime } from '@taucad/runtime/worker';
import { fromMemoryFs } from '@taucad/runtime/filesystem';
import { replicad, tau } from '@taucad/runtime/kernels';
import { esbuild } from '@taucad/runtime/bundler';
import { inProcessTransport } from '@taucad/runtime/transport/in-process';
import { gltfCoordinateTransform, gltfEdgeDetection } from '@taucad/runtime/middleware';
import { converterTranscoder } from '@taucad/runtime/transcoder';
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
  kernels: [replicad({ withBrepEdges: true }), tau()],
  middleware: [gltfCoordinateTransform(), gltfEdgeDetection()],
  bundlers: [esbuild()],
  transcoders: [converterTranscoder()],
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

type IntegrationClient = ReturnType<typeof createIntegrationClient> | ReturnType<typeof createUiRuntimeClient>;

describe('Kernel Integration — v6 zero-arg connect + transport-owned FS', { timeout: 120_000 }, () => {
  let client: IntegrationClient | undefined;

  afterEach(async () => {
    client?.terminate();
    client = undefined;
  });

  it('renders non-empty geometry from a transport-owned filesystem (FileInput)', async () => {
    const fileSystem = fromMemoryFs({
      '/projects/proj_hollow_box/main.ts': hollowBoxSource,
    });

    client = createIntegrationClient(fileSystem);

    await client.connect();

    const outcome = await client.openFile({
      file: { path: '/projects/proj_hollow_box', filename: 'main.ts' },
    });

    expect(outcome.superseded).toBe(false);
    if (!outcome.superseded) {
      expect(outcome.geometry.success).toBe(true);
      if (outcome.geometry.success) {
        expect(outcome.geometry.data.length).toBeGreaterThan(0);
      }
    }
  });

  it('renders non-empty geometry from inline code (CodeInput control path)', async () => {
    client = createIntegrationClient();

    await client.connect();

    const outcome = await client.openFile({
      code: { 'main.ts': hollowBoxSource },
    });

    expect(outcome.superseded).toBe(false);
    if (!outcome.superseded) {
      expect(outcome.geometry.success).toBe(true);
      if (outcome.geometry.success) {
        expect(outcome.geometry.data.length).toBeGreaterThan(0);
      }
    }
  });

  it('updateParameters re-renders against the previously opened file', async () => {
    const fileSystem = fromMemoryFs({
      '/projects/proj_hollow_box/main.ts': hollowBoxSource,
    });

    client = createIntegrationClient(fileSystem);

    await client.connect();

    const initial = await client.openFile({
      file: { path: '/projects/proj_hollow_box', filename: 'main.ts' },
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
        expect(updated.geometry.data.length).toBeGreaterThan(0);
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
      '/projects/proj_ui_replicad/main.ts': uiCylinderSource,
    });

    client = createUiRuntimeClient(fileSystem);

    try {
      await client.connect();

      const outcome = await client.openFile({
        file: { path: '/projects/proj_ui_replicad', filename: 'main.ts' },
      });

      expect(outcome.superseded).toBe(false);
      if (!outcome.superseded) {
        expect(outcome.geometry.success).toBe(true);
        if (outcome.geometry.success) {
          expect(outcome.geometry.data.length).toBeGreaterThan(0);
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
});
