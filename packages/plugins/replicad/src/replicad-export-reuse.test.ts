// @vitest-environment node
/* oxlint-disable eslint/no-await-in-loop -- exports run in order: each one's memo history is the next one's input. */
/**
 * Exports compose kept meshes (audit R14, catalogue N14): a GLB or glTF export takes each part's mesh from the mesh
 * memo when a render or an earlier export made it at the same tolerances, and its bytes equal what reuse off exports
 * (I1).
 */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { esbuildBundler } from '@taucad/esbuild';
import { createRuntimeClient } from '@taucad/runtime/client';
import { fromMemoryFs } from '@taucad/runtime/filesystem';
import { inProcessTransport } from '@taucad/runtime/transport/in-process';
import { defineRuntime } from '@taucad/runtime/worker';
import { replicadKernel } from '#replicad.kernel.js';

const renderTimeout = 300_000;

const assembly = `
  import { drawRoundedRectangle, makeCylinder, makeSphere } from 'replicad';

  export const defaultParams = { size: 10, radius: 0.5 };

  export default function main(p = defaultParams) {
    const plate = drawRoundedRectangle(p.size * 4, p.size * 2, 2).sketchOnPlane().extrude(p.size / 2);
    const boss = makeCylinder(p.size / 2, p.size, [0, 0, 0], [0, 0, 1]);
    const body = plate.fuse(boss).fillet(p.radius, (edges) => edges.inPlane('XY', p.size / 2));
    const pin = makeCylinder(2, 8);
    return [
      { shape: body, name: 'Body', color: '#888888' },
      { shape: pin.clone().translate([p.size * 3, 0, 0]), name: 'Pin A' },
      { shape: pin.clone().translate([-p.size * 3, 0, 0]), name: 'Pin B' },
      { shape: makeSphere(3).translate([0, p.size * 2, 0]), name: 'Ball', material: { kind: 'metal' } },
    ];
  }
`;

type Step =
  | 'render'
  | 'render:high'
  | 'render:high:edgeless'
  | 'glb'
  | 'glb:edges'
  | 'gltf'
  | 'glb:z-up'
  | 'stl'
  | Readonly<{ parameters: Readonly<Record<string, unknown>> }>;

/** One document; each step renders the model view or exports, and reports its bytes' digest and the faces it meshed. */
const exportSession = async (computeReuse: boolean, steps: readonly Step[], parameters = {}) => {
  const runtime = defineRuntime({
    kernels: [replicadKernel({ wasm: 'single', ...(computeReuse ? {} : { computeReuse: false }) })],
    bundlers: [esbuildBundler()],
  });
  const client = createRuntimeClient({
    transport: inProcessTransport({
      runtime,
      fileSystem: fromMemoryFs({ 'main.ts': assembly }),
      compute: { mode: 'memory' },
    }),
  });
  const spans: string[] = [];
  client.on('telemetry', (batch) => {
    spans.push(...batch.entries.map(({ name }) => name));
  });
  const document = client.open({ source: { path: 'main.ts' }, parameters, watch: false });
  const delivered: Array<{ step: string; digest: string; meshed: number }> = [];
  try {
    for (const step of steps) {
      if (typeof step === 'object') {
        await document.update({ parameters: step.parameters });
        continue;
      }
      const before = spans.length;
      let bytes: Uint8Array<ArrayBuffer>;
      if (step.startsWith('render')) {
        const view = document.view(
          'model',
          step === 'render'
            ? {}
            : {
                options: { tessellation: 'high' },
                ...(step === 'render:high:edgeless'
                  ? { content: { includeEdges: false, includeTopology: false } }
                  : {}),
              },
        );
        const outcome = await view.rendering();
        view.close();
        if (
          outcome.superseded ||
          !outcome.rendering.success ||
          typeof outcome.rendering.artifact.content === 'string'
        ) {
          throw new Error('render failed');
        }
        bytes = outcome.rendering.artifact.content;
      } else {
        const [format, suffix] = step.split(':') as ['glb' | 'gltf' | 'stl', 'y-up' | 'z-up' | 'edges' | undefined];
        const result = await document.export(
          format,
          suffix === undefined
            ? {}
            : suffix === 'edges'
              ? { content: { includeEdges: true } }
              : { options: { coordinateSystem: suffix } },
        );
        if (!result.success) {
          throw new Error(`export failed: ${JSON.stringify(result.issues)}`);
        }
        const hash = createHash('sha256');
        for (const file of result.files) {
          hash.update(file.name).update(file.bytes);
        }
        bytes = new Uint8Array(hash.digest());
      }
      // Telemetry batches flush after the reply; let them land before counting this step's meshing.
      await new Promise((resolve) => {
        setTimeout(resolve, 50);
      });
      delivered.push({
        step,
        digest: createHash('sha256').update(bytes).digest('hex').slice(0, 16),
        meshed: spans.slice(before).filter((name) => name === 'replicad.tessellate.faces').length,
      });
    }
  } finally {
    document.close();
    await client.shutdown();
  }
  return delivered;
};

describe('replicad exports compose kept meshes', () => {
  it(
    'should export the bytes reuse off exports while taking meshes a render or an earlier export made',
    async () => {
      const steps: Step[] = ['render:high', 'glb', 'gltf', 'glb:z-up', 'stl', 'render'];
      const off = await exportSession(false, steps);
      const on = await exportSession(true, steps);

      expect(on.map(({ step, digest }) => ({ step, digest }))).toStrictEqual(
        off.map(({ step, digest }) => ({ step, digest })),
      );
      // Reuse off meshes every part on every glTF export.
      expect(off.filter(({ step }) => step.startsWith('gl')).every(({ meshed }) => meshed > 0)).toBe(true);
      // Reuse on: a view rendered at the export's tolerances meshes once, and every glTF export composes its meshes;
      // a z-up export changes only the packing. The medium view meshes at its own tolerances.
      expect(on.map(({ step, meshed }) => [step, meshed > 0])).toStrictEqual([
        ['render:high', true],
        ['glb', false],
        ['gltf', false],
        ['glb:z-up', false],
        ['stl', false],
        ['render', true],
      ]);
    },
    renderTimeout,
  );

  it(
    'should reuse the export slot mesh for an edge-collecting export after an edgeless render',
    async () => {
      const [reference] = await exportSession(false, ['glb:edges']);
      const [, first, repeat] = await exportSession(true, ['render:high:edgeless', 'glb:edges', 'glb:edges']);

      // The edgeless display meshes cannot serve an export that collects edges: the first export meshes into the
      // export slot, and the repeat takes the slot's meshes instead of the unusable display ones.
      expect(first!.meshed).toBeGreaterThan(0);
      expect(repeat!.meshed).toBe(0);
      expect(first!.digest).toBe(reference!.digest);
      expect(repeat!.digest).toBe(reference!.digest);
    },
    renderTimeout,
  );

  it(
    'should export the bytes reuse off exports after a one-part edit, meshing only the edited part',
    async () => {
      const [reference] = await exportSession(false, ['glb'], { size: 10, radius: 1 });
      const [first, edited] = await exportSession(true, ['glb', { parameters: { size: 10, radius: 1 } }, 'glb'], {
        size: 10,
        radius: 0.5,
      });

      expect(edited!.digest).toBe(reference!.digest);
      // Three meshings for four parts (the two pins are one instanced group); the fillet radius changes the body
      // alone, so the pins and the ball keep their meshes.
      expect(first!.meshed).toBe(3);
      expect(edited!.meshed).toBe(1);
    },
    renderTimeout,
  );

  it(
    'should reuse a part prototype mesh in an export after a pose edit, with the bytes reuse off exports',
    async () => {
      const posed = `
        import { makeBaseBox, makeCylinder } from 'replicad';
        export const defaultParams = { angle: 0 };
        export default function main(p = defaultParams) {
          return [
            { shape: makeBaseBox(20, 10, 4), name: 'Base' },
            { shape: makeCylinder(2, 12).rotate(p.angle, [0, 0, 0], [0, 0, 1]).translate([5, 0, 4]), name: 'Arm' },
          ];
        }
      `;
      const tolerances = { linearTolerance: 0.05, angularTolerance: 10 };
      const exported = async (computeReuse: boolean, angles: readonly number[]) => {
        const client = createRuntimeClient({
          transport: inProcessTransport({
            runtime: defineRuntime({
              kernels: [replicadKernel({ wasm: 'single', ...(computeReuse ? {} : { computeReuse: false }) })],
              bundlers: [esbuildBundler()],
            }),
            fileSystem: fromMemoryFs({ 'main.ts': posed }),
            compute: { mode: 'memory' },
          }),
        });
        const spans: string[] = [];
        client.on('telemetry', (batch) => {
          spans.push(...batch.entries.map(({ name }) => name));
        });
        const document = client.open({ source: { path: 'main.ts' }, parameters: { angle: angles[0] }, watch: false });
        const delivered: Array<{ digest: string; meshed: number }> = [];
        try {
          for (const [index, angle] of angles.entries()) {
            if (index > 0) {
              await document.update({ parameters: { angle } });
            }
            const before = spans.length;
            const result = await document.export('glb', { options: { tessellation: tolerances } });
            if (!result.success) {
              throw new Error('export failed');
            }
            await new Promise((resolve) => {
              setTimeout(resolve, 50);
            });
            delivered.push({
              digest: createHash('sha256').update(result.files[0].bytes).digest('hex').slice(0, 16),
              meshed: spans.slice(before).filter((name) => name === 'replicad.tessellate.faces').length,
            });
          }
        } finally {
          document.close();
          await client.shutdown();
        }
        return delivered;
      };

      const [, reference] = await exported(false, [0, 30]);
      const [first, afterPose] = await exported(true, [0, 30]);

      expect(first!.meshed).toBeGreaterThan(0);
      // The arm moved: its unplaced prototype mesh is kept, so nothing is meshed again.
      expect(afterPose!.meshed).toBe(0);
      expect(afterPose!.digest).toBe(reference!.digest);
    },
    renderTimeout,
  );
});
