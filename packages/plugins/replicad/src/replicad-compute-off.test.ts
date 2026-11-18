// @vitest-environment node
/**
 * S1/D14/I13: off is off.
 *
 * With `computeReuse: false`, and by default, the kernel constructs no reuse adapter,
 * so it also reads and digests no implementation asset — a consumer branches once
 * before canonicalizing anything, and the off arm pays no keying cost (A5). The
 * adapter's geometry depended on cache history, so it is on only when asked for.
 */
import { describe, expect, it, vi } from 'vitest';
import { createTestGeometry, assertRenderingSuccess } from '@taucad/runtime-testing';
import { defineRuntime } from '@taucad/runtime/worker';
import { esbuildBundler } from '@taucad/esbuild';
import { loadBinaryFile } from '@taucad/runtime/kernel';
import type * as RuntimeKernel from '@taucad/runtime/kernel';
import { replicadKernel } from '#replicad.kernel.js';
import { createReplicadComputeReuse } from '#replicad-compute-reuse.js';
import type * as ReplicadComputeReuse from '#replicad-compute-reuse.js';

vi.mock('@taucad/runtime/kernel', async (importOriginal) => {
  const actual = await importOriginal<typeof RuntimeKernel>();
  return { ...actual, loadBinaryFile: vi.fn(actual.loadBinaryFile) };
});

vi.mock('#replicad-compute-reuse.js', async (importOriginal) => {
  const actual = await importOriginal<typeof ReplicadComputeReuse>();
  return { ...actual, createReplicadComputeReuse: vi.fn(actual.createReplicadComputeReuse) };
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
  it.each([
    ['explicitly off', { computeReuse: false }],
    ['by default', {}],
  ] as const)('S1: an off arm constructs no adapter and reads no implementation asset (%s)', async (_arm, options) => {
    vi.mocked(loadBinaryFile).mockClear();
    vi.mocked(createReplicadComputeReuse).mockClear();
    const result = await createTestGeometry({
      runtime: defineRuntime({
        kernels: [replicadKernel(options)],
        bundlers: [esbuildBundler()],
      }),
      files,
      open: { source: { path: 'box.ts' } },
    });
    assertRenderingSuccess(result);

    const urls = vi.mocked(loadBinaryFile).mock.calls.map(([url]) => String(url));
    expect(urls.filter((url) => url.endsWith('.wasm'))).toStrictEqual([]);
    expect(createReplicadComputeReuse).not.toHaveBeenCalled();
  });
});
