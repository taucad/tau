// @vitest-environment node
/**
 * The SMLib render's edge overlay is optional decoration: when the kernel cannot measure a body's edges
 * against its mesh and cannot give its own polylines either, the render keeps its faces and drops those
 * edges instead of failing.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertRenderingSuccess, createTestRuntimeClient } from '@taucad/runtime-testing';
import { esbuildBundler } from '@taucad/esbuild';
import { defineRuntime } from '@taucad/runtime/worker';
import type * as SmlibKernelModule from '#utils/smlib-kernel.js';
import { smlibKernel } from '#smlib.kernel.js';

vi.setConfig({ testTimeout: 30_000 });

const failing = vi.hoisted(() => ({ edges: false }));

vi.mock('#utils/smlib-kernel.js', async (importOriginal) => {
  const actual = await importOriginal<typeof SmlibKernelModule>();
  const unlessFailing =
    <A extends unknown[], R>(call: (...arguments_: A) => R) =>
    (...arguments_: A): R => {
      if (failing.edges) {
        throw new Error('kernel cannot read this body');
      }
      return call(...arguments_);
    };
  return {
    ...actual,
    edgeTopology: unlessFailing(actual.edgeTopology),
    boundaryPolylines: unlessFailing(actual.boundaryPolylines),
  };
});

const boxCode = `
  import { Box } from '@classcad/smlibwasm';
  export default function main() {
    return Box(10, 10, 10);
  }
`;

afterEach(() => {
  failing.edges = false;
});

describe('SMLib edge overlay fallback', () => {
  it('should render the faces without edges when neither the mesh nor the kernel can draw them', async () => {
    const client = createTestRuntimeClient({
      runtime: defineRuntime({ kernels: [smlibKernel()], bundlers: [esbuildBundler()] }),
      files: { 'box.ts': boxCode },
    });
    const document = client.open({ source: { path: 'box.ts' }, watch: false });
    try {
      const evaluated = await document.evaluation();
      expect(evaluated.superseded).toBe(false);
      failing.edges = true;
      const view = document.view('model', { content: { includeEdges: true } });
      const outcome = await view.rendering();
      view.close();
      if (outcome.superseded) {
        throw new Error('render was superseded');
      }
      assertRenderingSuccess(outcome.rendering);
      expect(outcome.rendering.artifact.tessellation?.triangles).toBeGreaterThan(0);
    } finally {
      document.close();
      await client.shutdown();
    }
  });
});
