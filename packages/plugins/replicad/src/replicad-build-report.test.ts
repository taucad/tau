// @vitest-environment node
/* oxlint-disable eslint/no-await-in-loop -- builds run in order: each one's cache history is the next one's input. */
/**
 * What an evaluation reports about its build and its mesh (audit R18, F43): whether a build ran, what the live tier
 * reused inside it, its costliest operations, and the parts whose display mesh the mesh memo kept.
 */
import { describe, expect, it } from 'vitest';
import { esbuildBundler } from '@taucad/esbuild';
import { createRuntimeClient } from '@taucad/runtime/client';
import type { Evaluation, Rendering } from '@taucad/runtime/client';
import { fromMemoryFs } from '@taucad/runtime/filesystem';
import { inProcessTransport } from '@taucad/runtime/transport/in-process';
import { defineRuntime } from '@taucad/runtime/worker';
import { replicadKernel } from '#replicad.kernel.js';

/** Any number: elapsed times vary from run to run. */
const anyNumber: unknown = expect.any(Number);

const renderTimeout = 300_000;

const bracket = `
  import { drawRoundedRectangle, makeCylinder } from 'replicad';

  export const defaultParams = { size: 10, radius: 0.5 };

  export default function main(p = defaultParams) {
    const plate = drawRoundedRectangle(p.size * 4, p.size * 2, 2).sketchOnPlane().extrude(p.size / 2);
    const boss = makeCylinder(p.size / 2, p.size, [0, 0, 0], [0, 0, 1]);
    const body = plate.fuse(boss).fillet(p.radius, (edges) => edges.inPlane('XY', p.size / 2));
    return [
      { shape: body, name: 'Body' },
      { shape: makeCylinder(2, 8).translate([p.size * 3, 0, 0]), name: 'Pin' },
    ];
  }
`;

/** One agent-style client: each call opens a document, evaluates, renders the model view and closes. */
const agentClient = (computeReuse: boolean) => {
  const runtime = defineRuntime({
    kernels: [replicadKernel({ wasm: 'single', ...(computeReuse ? {} : { computeReuse: false }) })],
    bundlers: [esbuildBundler()],
  });
  const client = createRuntimeClient({
    transport: inProcessTransport({
      runtime,
      fileSystem: fromMemoryFs({ 'main.ts': bracket }),
      compute: { mode: 'memory' },
    }),
  });
  return {
    async call(
      parameters: Readonly<Record<string, unknown>>,
    ): Promise<{ evaluation: Evaluation; rendering: Rendering }> {
      const document = client.open({ source: { path: 'main.ts' }, parameters, watch: false });
      const view = document.view('model');
      try {
        const evaluated = await document.evaluation();
        const rendered = await view.rendering();
        if (evaluated.superseded || rendered.superseded) {
          throw new Error('superseded');
        }
        return { evaluation: evaluated.evaluation, rendering: rendered.rendering };
      } finally {
        view.close();
        document.close();
      }
    },
    shutdown: async () => client.shutdown(),
  };
};

const meshesOf = (rendering: Rendering) =>
  rendering.success ? rendering.artifact.tessellation?.meshes : 'render failed';

describe('replicad build report', () => {
  it(
    'should report what the live tier reused, the costliest operations and the meshes the memo kept',
    async () => {
      const agent = agentClient(true);
      try {
        const first = await agent.call({ size: 10, radius: 0.5 });
        expect(first.evaluation.build).toMatchObject({ reused: false, operations: { reused: 0 } });
        expect(first.evaluation.build?.operations?.computed).toBeGreaterThan(0);
        const costliest = first.evaluation.build?.costliest ?? [];
        expect(costliest.length).toBeGreaterThan(0);
        expect(costliest.length).toBeLessThanOrEqual(3);
        expect(costliest.map(({ elapsed }) => elapsed)).toStrictEqual(
          costliest.map(({ elapsed }) => elapsed).toSorted((left, right) => right - left),
        );
        expect(costliest.every(({ operation, calls }) => /^\w+(?:\.\w+)?$/u.test(operation) && calls > 0)).toBe(true);
        expect(meshesOf(first.rendering)).toStrictEqual({ reused: 0, computed: 2 });

        // A fillet radius edit: the plate, boss and fuse upstream of it are reused, the pin's mesh is kept.
        const edited = await agent.call({ size: 10, radius: 1 });
        expect(edited.evaluation.build?.reused).toBe(false);
        expect(edited.evaluation.build?.operations?.reused).toBeGreaterThan(0);
        expect(meshesOf(edited.rendering)).toStrictEqual({ reused: 1, computed: 1 });

        // A revisit: the scene table answers without user code, and both meshes are kept.
        const revisit = await agent.call({ size: 10, radius: 0.5 });
        expect(revisit.evaluation.build).toMatchObject({ reused: true });
        expect(revisit.evaluation.build).not.toHaveProperty('operations');
        expect(meshesOf(revisit.rendering)).toStrictEqual({ reused: 2, computed: 0 });
      } finally {
        await agent.shutdown();
      }
    },
    renderTimeout,
  );

  it(
    'should report only the build and its cost when the kernel switches the live tier off',
    async () => {
      const agent = agentClient(false);
      try {
        const { evaluation, rendering } = await agent.call({ size: 10, radius: 0.5 });
        expect(evaluation.build).toStrictEqual({ reused: false, elapsed: anyNumber });
        expect(meshesOf(rendering)).toBeUndefined();
      } finally {
        await agent.shutdown();
      }
    },
    renderTimeout,
  );
});
