// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { assertRenderingSuccess, createTestRuntimeClient } from '@taucad/runtime-testing';
import { defineRuntime } from '@taucad/runtime/worker';
import { expect, it } from 'vitest';

import { picogk } from '#index.js';

const targetRoot = resolve(
  import.meta.dirname,
  '../../../../apps/desktop/resources/picogk',
  `${process.platform}-${process.arch}`,
);
const manifest = JSON.parse(readFileSync(join(targetRoot, 'tau-runtime-manifest.json'), 'utf8')) as {
  workerPath: string;
  workerSha256: string;
  resourceFiles: Array<{ path: string; sha256: string; label: string }>;
};
// Upstream PicoGK ships no Linux voxel library, so a Linux payload carries the managed worker
// without it and these suites run only where the native engine is present.
const nativeEngineAvailable = manifest.resourceFiles.some(({ path }) => /^picogk\.\d/u.test(path));

it.runIf(nativeEngineAvailable)(
  'should release native listeners on default client shutdown and preserve sibling sessions',
  async () => {
    const signals = ['exit', 'SIGINT', 'SIGTERM'] as const;
    const runtime = defineRuntime({
      plugins: [
        picogk({
          kernels: {
            default: {
              workerExecutable: join(targetRoot, manifest.workerPath),
              workerSha256: manifest.workerSha256,
              resourceFiles: manifest.resourceFiles.map(({ path, ...resource }) => ({
                ...resource,
                path: join(targetRoot, path),
              })),
              requestTimeout: 120_000,
            },
          },
        }),
      ],
    });
    const files = {
      'main.cs':
        'using System.Numerics; using PicoGK; Library.Go(1f, () => { Library.oViewer().Add(Utils.mshCreateCube(new Vector3(2, 4, 6))); });',
    };
    const makeClient = () => createTestRuntimeClient({ runtime, files });
    const renderModel = async (client: ReturnType<typeof makeClient>) => {
      const document = client.open({ source: { path: 'main.cs' }, watch: false });
      const view = document.view('model');
      try {
        const outcome = await view.rendering();
        expect(outcome.superseded).toBe(false);
        if (outcome.superseded) {
          throw new Error('PicoGK render was unexpectedly superseded.');
        }
        assertRenderingSuccess(outcome.rendering);
        return outcome.rendering;
      } finally {
        view.close();
        document.close();
      }
    };
    // The sandbox runtime registers its own process-wide cleanup listeners once, on first launch;
    // they outlive every session, so the baseline is taken after a warm-up session has released.
    const warmUp = makeClient();
    await renderModel(warmUp);
    await warmUp.shutdown();
    const baseline = signals.map((signal) => process.listenerCount(signal));
    const first = makeClient();
    const second = makeClient();
    try {
      for (const client of [first, second]) {
        // oxlint-disable-next-line no-await-in-loop -- separate native clients initialize in a deterministic order.
        await renderModel(client);
      }
      expect(signals.map((signal) => process.listenerCount(signal))).toEqual(baseline.map((count) => count + 2));
      await first.shutdown();
      expect(signals.map((signal) => process.listenerCount(signal))).toEqual(baseline.map((count) => count + 1));
      await renderModel(second);
      await second.shutdown();
      expect(signals.map((signal) => process.listenerCount(signal))).toEqual(baseline);
    } finally {
      await Promise.all([first.shutdown(), second.shutdown()]);
    }
  },
  120_000,
);
