// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync, unwatchFile, watchFile, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
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
  const trustRoot = mkdtempSync(join(tmpdir(), 'tau-native-lifecycle-'));
  const trustFile = join(trustRoot, 'trust.json');
  writeFileSync(trustFile, '{"version":1,"trusted":true}\n');
  const trustListener = (): void => {
    // Keep the shared watcher observable after both native sessions release it.
  };
  const watcher = watchFile(trustFile, { interval: 250, persistent: false }, trustListener);
  const signals = ['exit', 'SIGINT', 'SIGTERM'] as const;
  const baseline = signals.map((signal) => process.listenerCount(signal));
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
            trustFile,
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
    expect(watcher.listenerCount('change')).toBe(3);
    await first.shutdown();
    expect(signals.map((signal) => process.listenerCount(signal))).toEqual(baseline.map((count) => count + 1));
    expect(watcher.listenerCount('change')).toBe(2);
    const sibling = await second.render({ source: { path: 'main.cs' } });
    expect(sibling.superseded).toBe(false);
    if (!sibling.superseded) {
      assertSuccess(sibling.geometry);
    }
    await second.shutdown();
    expect(signals.map((signal) => process.listenerCount(signal))).toEqual(baseline);
    expect(watcher.listenerCount('change')).toBe(1);
  } finally {
    await Promise.all([first.shutdown(), second.shutdown()]);
    unwatchFile(trustFile, trustListener);
    rmSync(trustRoot, { recursive: true, force: true });
  }
}, 120_000);
