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

type GlbDigest = { binBytes: number; sha256: string };

/**
 * Digest a GLB without its `asset.generator`, which names the writing package's version and so
 * changes on every release. The JSON chunk is re-serialized without it; the BIN chunk is hashed as is.
 */
const digestGlb = (glb: Uint8Array<ArrayBuffer>): GlbDigest => {
  const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
  const jsonLength = view.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + jsonLength))) as {
    asset: { generator?: string };
  };
  delete json.asset.generator;
  const binStart = 20 + jsonLength;
  const binLength = binStart < glb.byteLength ? view.getUint32(binStart, true) : 0;
  const bin = glb.subarray(binStart + 8, binStart + 8 + binLength);
  return {
    binBytes: binLength,
    sha256: createHash('sha256').update(JSON.stringify(json)).update(bin).digest('hex'),
  };
};

/** The tolerances replicad exports used before presets; explicit requests still mesh exactly with them. */
const legacyExportTolerances = {
  linearTolerance: 0.01,
  angularTolerance: 20,
} as const;

const exportFixture = async (
  bundler: ReturnType<typeof esbuild> | ReturnType<typeof rolldown>,
  fixture: ReturnType<typeof loadFixture>,
  options?: Readonly<Record<string, unknown>>,
): Promise<GlbDigest> => {
  const runtime = defineRuntime({
    plugins: [bundler],
    kernels: [replicadKernel({ wasm: 'multi' })],
  });
  const client = createRuntimeClient({
    transport: inProcessTransport({
      runtime,
      fileSystem: fromMemoryFs(fixture.files),
    }),
  });
  const document = client.open({
    source: { path: fixture.mainFile },
    watch: false,
  });
  try {
    const result = await document.export('glb', options === undefined ? undefined : { options });
    if (!result.success) {
      throw new Error(result.issues.map(({ message }) => message).join('; '));
    }
    const output = result.files.find(({ name }) => name.endsWith('.glb'))?.bytes;
    if (output === undefined) {
      throw new Error('Runtime returned no GLB output.');
    }
    return digestGlb(output);
  } finally {
    document.close();
    await client.shutdown();
  }
};

/** Closed solids carry `doubleSided: false` since tau #1406, which changes each JSON chunk, not the BIN. */
const fixtures = [
  [
    'birdhouse',
    loadFixture('replicad', 'birdhouse'),
    {
      explicit: {
        binBytes: 143_040,
        sha256: '8494e2a2ed2184123589d8a2d6e042e7cae7254e77248f3ca21151e288b281c8',
      },
      high: {
        binBytes: 114_000,
        sha256: 'fbc517ecd99dfe0f233e318c1f474d6ae0d6b7a82d6d85e53291dfba14c24fa2',
      },
    },
  ],
  [
    'feature-matrix',
    loadFixture('replicad', 'bundler-feature-matrix'),
    {
      explicit: {
        binBytes: 8640,
        sha256: 'cfc6bf7aaf47873e47c86a7c993b72e13970b8980e0afa4eff9b5e37511a13f1',
      },
      high: {
        binBytes: 11_232,
        sha256: 'db08aaef39311b32c2f13123f5cc8772dfbb99d4566c767954eed23d7851949d',
      },
    },
  ],
] as const;

describe('native bundler product parity', () => {
  it.each(fixtures)(
    'produces exact %s GLB bytes at explicit tolerances',
    async (name, fixture, canonical) => {
      const options = { tessellation: legacyExportTolerances };
      const esbuildOutput = await exportFixture(esbuild(), fixture, options);
      const rolldownOutput = await exportFixture(rolldown(), fixture, options);
      expect(rolldownOutput).toEqual(esbuildOutput);
      expect(rolldownOutput).toEqual(canonical.explicit);
      console.info(
        JSON.stringify({
          arm: 'native',
          fixture: name,
          tessellation: 'explicit',
          ...rolldownOutput,
        }),
      );
    },
    300_000,
  );

  it.each(fixtures)(
    'exports %s at the high preset, which is the export default',
    async (name, fixture, canonical) => {
      const options = { tessellation: 'high' };
      const esbuildOutput = await exportFixture(esbuild(), fixture, options);
      const rolldownOutput = await exportFixture(rolldown(), fixture, options);
      const defaultOutput = await exportFixture(rolldown(), fixture);
      expect(rolldownOutput).toEqual(esbuildOutput);
      expect(defaultOutput).toEqual(rolldownOutput);
      expect(rolldownOutput).toEqual(canonical.high);
      expect(rolldownOutput).not.toEqual(canonical.explicit);
      console.info(
        JSON.stringify({
          arm: 'native',
          fixture: name,
          tessellation: 'high',
          ...rolldownOutput,
        }),
      );
    },
    300_000,
  );
});
