// @vitest-environment node
/* oxlint-disable eslint/no-await-in-loop -- renders run in order: each one's memo history is the next one's input. */
/**
 * The mesh report (`tessellation.meshes`, audit R18) counts parts, and counts a part reused only when its kept mesh
 * was delivered; exports keep what they mesh in the memo's one-generation export slot (N14), not the display memo.
 */
import { describe, expect, it } from 'vitest';
import { esbuildBundler } from '@taucad/esbuild';
import { createRuntimeClient } from '@taucad/runtime/client';
import { fromMemoryFs } from '@taucad/runtime/filesystem';
import { inProcessTransport } from '@taucad/runtime/transport/in-process';
import { defineRuntime } from '@taucad/runtime/worker';
import { replicadKernel } from '#replicad.kernel.js';

const renderTimeout = 300_000;

/** Three instanced pins (one group) and a ball: four parts. */
const assembly = `
  import { makeCylinder, makeSphere } from 'replicad';
  export const defaultParams = { size: 10 };
  export default function main(p = defaultParams) {
    const pin = makeCylinder(2, 8);
    return [
      { shape: pin.clone().translate([p.size * 3, 0, 0]), name: 'Pin A' },
      { shape: pin.clone().translate([-p.size * 3, 0, 0]), name: 'Pin B' },
      { shape: pin.clone().translate([0, p.size * 3, 0]), name: 'Pin C' },
      { shape: makeSphere(3).translate([0, p.size * 2, 0]), name: 'Ball' },
    ];
  }
`;

const tessellation = { linearTolerance: 0.1, angularTolerance: 10 };

type Step = Readonly<{ render?: { edges: boolean; tolerance?: number }; export?: number }>;
type Observed = { meshes: unknown; meshedFaces: number; memoBytes: number | undefined };

const session = async (steps: readonly Step[]): Promise<Observed[]> => {
  const client = createRuntimeClient({
    transport: inProcessTransport({
      runtime: defineRuntime({ kernels: [replicadKernel({ wasm: 'single' })], bundlers: [esbuildBundler()] }),
      fileSystem: fromMemoryFs({ 'main.ts': assembly }),
      compute: { mode: 'memory' },
    }),
  });
  const entries: Array<{ name: string; detail?: Readonly<Record<string, unknown>> }> = [];
  client.on('telemetry', (batch) => {
    entries.push(...batch.entries);
  });
  const document = client.open({ source: { path: 'main.ts' }, watch: false });
  const observed: Observed[] = [];
  try {
    await document.evaluation();
    for (const step of steps) {
      if (step.export !== undefined) {
        const exported = await document.export('glb', {
          options: { tessellation: { ...tessellation, linearTolerance: step.export } },
        });
        if (!exported.success) {
          throw new Error('export failed');
        }
      }
      if (step.render === undefined) {
        continue;
      }
      const before = entries.length;
      const view = document.view('model', {
        options: { tessellation: { ...tessellation, linearTolerance: step.render.tolerance ?? 0.1 } },
        content: { includeEdges: step.render.edges },
      });
      const outcome = await view.rendering();
      view.close();
      await new Promise((resolve) => {
        setTimeout(resolve, 50);
      });
      if (outcome.superseded || !outcome.rendering.success) {
        throw new Error('render failed');
      }
      const rendered = entries.slice(before);
      const bytes = rendered.find(({ name }) => name === 'replicad.render-output')?.detail?.['meshMemoBytes'];
      observed.push({
        meshes: outcome.rendering.artifact.tessellation?.meshes,
        meshedFaces: rendered.filter(({ name }) => name === 'replicad.tessellate.faces').length,
        memoBytes: typeof bytes === 'number' ? bytes : undefined,
      });
    }
  } finally {
    document.close();
    await client.shutdown();
  }
  return observed;
};

describe('replicad mesh report', () => {
  it(
    'should report every part, an instanced group counting each instance',
    async () => {
      const [first, second] = await session([{ render: { edges: false } }, { render: { edges: true } }]);

      expect(first!.meshes).toStrictEqual({ reused: 0, computed: 4 });
      expect(second!.meshedFaces).toBe(0);
      expect(second!.meshes).toStrictEqual({ reused: 4, computed: 0 });
    },
    renderTimeout,
  );

  it(
    'should not count a mesh an export kept without edges as reused by a render that needs them',
    async () => {
      const [afterExport] = await session([{ export: 0.1, render: { edges: true } }]);

      expect(afterExport!.meshedFaces).toBeGreaterThan(0);
      expect(afterExport!.meshes).toStrictEqual({ reused: 0, computed: 4 });
    },
    renderTimeout,
  );

  it(
    'should keep no display memory for exports at tolerances no view uses',
    async () => {
      const renders = [1, 1.5, 2].map((tolerance) => ({ render: { edges: false, tolerance } }));
      const without = await session(renders);
      const withExports = await session([
        renders[0]!,
        { export: 0.05, ...renders[1]! },
        { export: 0.02, ...renders[2]! },
      ]);

      // The export slot is dropped at the end of the next render: the display memo holds what it holds without exports.
      expect(withExports.map(({ memoBytes }) => memoBytes)).toStrictEqual(without.map(({ memoBytes }) => memoBytes));
      expect(withExports.map(({ meshes }) => meshes)).toStrictEqual(without.map(({ meshes }) => meshes));
    },
    renderTimeout,
  );
});
