// @vitest-environment node
/**
 * S1/D14/I13: off is off.
 *
 * With `computeReuse: false` the kernel constructs no reuse adapter, so it also
 * reads and digests no implementation asset — a consumer branches once before
 * canonicalizing anything, and the off arm pays no keying cost (A5).
 */
import { describe, expect, it, vi } from 'vitest';
import { createTestGeometry, assertSuccess } from '@taucad/runtime-testing';
import { defineRuntime } from '@taucad/runtime/worker';
import { esbuildBundler } from '@taucad/esbuild';
import { loadBinaryFile } from '@taucad/runtime/kernel';
import type * as RuntimeKernel from '@taucad/runtime/kernel';
import { replicadKernel } from '#replicad.kernel.js';

vi.mock('@taucad/runtime/kernel', async (importOriginal) => {
  const actual = await importOriginal<typeof RuntimeKernel>();
  return { ...actual, loadBinaryFile: vi.fn(actual.loadBinaryFile) };
});

vi.setConfig({ testTimeout: 30_000 });

const files = {
  'box.ts': `
    import { drawRoundedRectangle } from 'replicad';

    export default function main() {
      return drawRoundedRectangle(50, 30).sketchOnPlane().extrude(10);
    }
  `,
};

describe('replicad compute reuse off arm', () => {
  it('S1: an off arm reads no implementation asset', async () => {
    const result = await createTestGeometry({
      runtime: defineRuntime({
        kernels: [replicadKernel({ computeReuse: false })],
        bundlers: [esbuildBundler()],
      }),
      files,
      mainFile: 'box.ts',
    });
    assertSuccess(result);

    const urls = vi.mocked(loadBinaryFile).mock.calls.map(([url]) => String(url));
    expect(urls.filter((url) => url.endsWith('.wasm'))).toStrictEqual([]);
  });
});
