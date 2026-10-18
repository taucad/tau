// @vitest-environment node
/**
 * Replicad — y-up exports release the rotated copies they make.
 *
 * STEP and STL exports rotate a copy of every shape into y-up. Those copies used to be left to replicad's
 * `FinalizationRegistry`, so each export kept a second B-rep of the model in the OCCT heap until a GC
 * happened to run (D-RT-20).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Shape } from 'replicad';
import type { AnyShape } from 'replicad';
import { defineRuntime } from '@taucad/runtime/worker';
import { createTestRuntimeClient } from '@taucad/runtime-testing';
import { esbuildBundler } from '@taucad/esbuild';
import { replicadKernel } from '#replicad.kernel.js';

const files = {
  'main.ts': `import { makeBox } from 'replicad';
export default function main() {
  return [
    { shape: makeBox([0, 0, 0], [10, 20, 30]), name: 'First' },
    { shape: makeBox([0, 0, 0], [4, 6, 8]).translate([20, 0, 0]), name: 'Second' },
  ];
}
`,
};

const isDeleted = (shape: AnyShape): boolean => {
  try {
    void shape.wrapped;
    return false;
  } catch {
    return true;
  }
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Replicad y-up export copies', { timeout: 120_000 }, () => {
  it.each([
    ['step', { coordinateSystem: 'y-up' }],
    ['stl', { coordinateSystem: 'y-up', binary: true }],
  ] as const)('deletes the rotated copies once a %s export returns', async (format, options) => {
    const client = createTestRuntimeClient({
      runtime: defineRuntime({ kernels: [replicadKernel({ wasm: 'single' })], bundlers: [esbuildBundler()] }),
      files,
    });
    const document = client.open({ source: { path: 'main.ts' } });
    const view = document.view();
    try {
      await view.rendering();
      const rotated: AnyShape[] = [];
      const { rotate } = Shape.prototype;
      vi.spyOn(Shape.prototype, 'rotate').mockImplementation(function (this: AnyShape, ...arguments_) {
        const result = rotate.apply(this, arguments_) as AnyShape;
        rotated.push(result);
        return result;
      });

      const result = await document.export(format, { options });

      expect(result.success).toBe(true);
      expect(rotated.map((shape) => isDeleted(shape))).toEqual([true, true]);
    } finally {
      view.close();
      document.close();
      await client.shutdown();
    }
  });
});
