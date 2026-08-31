import { describe, expect, it } from 'vitest';

import { createRuntimeClient } from '@taucad/runtime/client';
import { createWebWorkerClientOptions } from '@taucad/runtime/transport/web';

const fixtureModules = import.meta.glob(
  '../../../../../libs/tau-examples/src/kernels/replicad/{birdhouse,bundler-feature-matrix}/**/*.{ts,tsx,js,jsx,json,txt,bin}',
  { eager: true, import: 'default', query: '?raw' },
) as Readonly<Record<string, string>>;

const fixture = (name: 'birdhouse' | 'bundler-feature-matrix', mainFile: string) => {
  const marker = `/replicad/${name}/`;
  const files = Object.fromEntries(
    Object.entries(fixtureModules)
      .filter(([path]) => path.includes(marker))
      .map(([path, source]) => [path.slice(path.indexOf(marker) + marker.length), source]),
  );
  return { files, mainFile };
};

const hash = async (bytes: Uint8Array<ArrayBuffer>): Promise<string> =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

const exportFixture = async (
  arm: 'esbuild' | 'rolldown',
  input: ReturnType<typeof fixture>,
): Promise<{ bytes: number; sha256: string }> => {
  const createWorker = (): Worker =>
    arm === 'esbuild'
      ? new Worker(new URL('bundler-esbuild.worker.ts', import.meta.url), {
          name: 'tau-bundler-esbuild',
          type: 'module',
        })
      : new Worker(new URL('bundler-rolldown.worker.ts', import.meta.url), {
          name: 'tau-bundler-rolldown',
          type: 'module',
        });
  const client = createRuntimeClient(
    createWebWorkerClientOptions({ createWorker, files: input.files, renderTimeout: 300_000 }),
  );
  try {
    const result = await client.export('glb', { source: { path: input.mainFile } });
    if (!result.success) {
      throw new Error(result.issues.map(({ message }) => message).join('; '));
    }
    const output = result.data.find(({ name }) => name.endsWith('.glb'))?.bytes;
    if (output === undefined) {
      throw new Error('Runtime returned no GLB output.');
    }
    return { bytes: output.byteLength, sha256: await hash(output) };
  } finally {
    client.terminate();
  }
};

describe('isolated-browser bundler product parity', () => {
  it.each([
    [
      'birdhouse',
      fixture('birdhouse', 'main.ts'),
      { bytes: 144_116, sha256: '3fd5203e572edcd210cf25d989177955c96e2cfc573859e93efc1ae51296cfeb' },
    ],
    [
      'feature-matrix',
      fixture('bundler-feature-matrix', 'main.ts'),
      { bytes: 10_568, sha256: '5b61e65501a9016d381a0f1f1d6dc041b8f7acece251393b92a11295c30133c1' },
    ],
  ] as const)('produces exact %s GLB bytes', async (name, input, canonical) => {
    expect(globalThis.crossOriginIsolated).toBe(true);
    const esbuildOutput = await exportFixture('esbuild', input);
    const rolldownOutput = await exportFixture('rolldown', input);
    expect(rolldownOutput).toEqual(esbuildOutput);
    expect(rolldownOutput).toEqual(canonical);
    console.info(JSON.stringify({ arm: 'browser', fixture: name, ...rolldownOutput }));
  });
});
