import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { esbuild } from '@taucad/esbuild';
import { replicadKernel } from '@taucad/replicad';
import { rolldown } from '@taucad/rolldown';
import { createRuntimeClient } from '@taucad/runtime/client';
import { fromMemoryFs } from '@taucad/runtime/filesystem';
import { inProcessTransport } from '@taucad/runtime/transport/in-process';
import { defineRuntime } from '@taucad/runtime/worker';
import { loadFixture } from '@taucad/tau-examples/fixtures';

const exportFixture = async (
  bundler: ReturnType<typeof esbuild> | ReturnType<typeof rolldown>,
  fixture: ReturnType<typeof loadFixture>,
): Promise<{ bytes: number; sha256: string }> => {
  const runtime = defineRuntime({
    plugins: [bundler],
    kernels: [replicadKernel({ wasm: 'multi' })],
  });
  const client = createRuntimeClient({
    transport: inProcessTransport({ runtime, fileSystem: fromMemoryFs(fixture.files) }),
  });
  try {
    const result = await client.export('glb', { source: { path: fixture.mainFile } });
    if (!result.success) {
      throw new Error(result.issues.map(({ message }) => message).join('; '));
    }
    const output = result.data.find(({ name }) => name.endsWith('.glb'))?.bytes;
    if (output === undefined) {
      throw new Error('Runtime returned no GLB output.');
    }
    return {
      bytes: output.byteLength,
      sha256: createHash('sha256').update(output).digest('hex'),
    };
  } finally {
    client.terminate();
  }
};

describe('native bundler product parity', () => {
  it.each([
    [
      'birdhouse',
      loadFixture('replicad', 'birdhouse'),
      { bytes: 144_116, sha256: '3fd5203e572edcd210cf25d989177955c96e2cfc573859e93efc1ae51296cfeb' },
    ],
    [
      'feature-matrix',
      loadFixture('replicad', 'bundler-feature-matrix'),
      { bytes: 10_568, sha256: '5b61e65501a9016d381a0f1f1d6dc041b8f7acece251393b92a11295c30133c1' },
    ],
  ] as const)(
    'produces exact %s GLB bytes',
    async (name, fixture, canonical) => {
      const esbuildOutput = await exportFixture(esbuild(), fixture);
      const rolldownOutput = await exportFixture(rolldown(), fixture);
      expect(rolldownOutput).toEqual(esbuildOutput);
      expect(rolldownOutput).toEqual(canonical);
      console.info(
        JSON.stringify({
          arm: 'native',
          fixture: name,
          ...rolldownOutput,
        }),
      );
    },
    300_000,
  );
});
