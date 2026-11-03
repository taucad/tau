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

const fixtures = [
  [
    'birdhouse',
    loadFixture('replicad', 'birdhouse'),
    {
      explicit: {
        binBytes: 143_040,
        sha256: '859ea5b203307f785e5cb6dd0b983d7510afc81586a5ec25cfaf2865a8f0f70f',
      },
      high: {
        binBytes: 114_000,
        sha256: '349f672160f14f5adf0ae02ecaf28bf8b9f63a5d734882d8d16d6a6b48b342d4',
      },
    },
  ],
  [
    'feature-matrix',
    loadFixture('replicad', 'bundler-feature-matrix'),
    {
      explicit: {
        binBytes: 8640,
        sha256: '19f87172285f36487c45bce3c24208ced0a66c234b7679d8787e3f4cbf8767ff',
      },
      high: {
        binBytes: 11_232,
        sha256: '6649f4e793fdb25658769bf9e47583d99b6b6d813c3e0dcbb0dfee7de3d546e1',
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
