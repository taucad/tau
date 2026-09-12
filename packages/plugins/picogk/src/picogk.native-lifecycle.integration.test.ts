// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { assertSuccess, createTestRuntimeClient } from '@taucad/runtime-testing';
import { defineRuntime } from '@taucad/runtime/worker';
import { expect, it } from 'vitest';

import { picogk } from '#index.js';

it('should release native listeners on default client shutdown and preserve sibling sessions', async () => {
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
  // The sandbox runtime registers its own process-wide cleanup listeners once, on first launch;
  // they outlive every session, so the baseline is taken after a warm-up session has released.
  const warmUp = createTestRuntimeClient({ runtime, files });
  const warmed = await warmUp.render({ source: { path: 'main.cs' } });
  expect(warmed.superseded).toBe(false);
  await warmUp.shutdown();
  const baseline = signals.map((signal) => process.listenerCount(signal));
  const first = createTestRuntimeClient({ runtime, files });
  const second = createTestRuntimeClient({ runtime, files });
  try {
    for (const client of [first, second]) {
      // oxlint-disable-next-line no-await-in-loop -- separate native clients initialize in a deterministic order.
      const result = await client.render({ source: { path: 'main.cs' } });
      expect(result.superseded).toBe(false);
      if (!result.superseded) {
        assertSuccess(result.geometry);
      }
    }
    expect(signals.map((signal) => process.listenerCount(signal))).toEqual(baseline.map((count) => count + 2));
    await first.shutdown();
    expect(signals.map((signal) => process.listenerCount(signal))).toEqual(baseline.map((count) => count + 1));
    const sibling = await second.render({ source: { path: 'main.cs' } });
    expect(sibling.superseded).toBe(false);
    if (!sibling.superseded) {
      assertSuccess(sibling.geometry);
    }
    await second.shutdown();
    expect(signals.map((signal) => process.listenerCount(signal))).toEqual(baseline);
  } finally {
    await Promise.all([first.shutdown(), second.shutdown()]);
  }
}, 120_000);
