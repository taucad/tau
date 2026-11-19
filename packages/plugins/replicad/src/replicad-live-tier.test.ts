// @vitest-environment node
/* oxlint-disable eslint/no-await-in-loop -- builds run in order: each one's cache history is the next one's input. */
/**
 * The live tier through the real runtime (audit R6, R16; invariants I1 and I2): delivered bytes equal to reuse off
 * across randomized cache histories, revisits without user code, the fresh (agent) lifecycle, and the off arms.
 */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { esbuildBundler } from '@taucad/esbuild';
import { asKnownArtifact, createRuntimeClient } from '@taucad/runtime/client';
import { fromMemoryFs } from '@taucad/runtime/filesystem';
import { inProcessTransport } from '@taucad/runtime/transport/in-process';
import { defineRuntime } from '@taucad/runtime/worker';
import { geometryCache } from '@taucad/middleware';
import * as replicad from 'replicad';
import { replicadKernel } from '#replicad.kernel.js';

const renderTimeout = 300_000;

/** What user code reports through the shared realm: how often `main` ran and whether a cache was installed. */
type Probe = { calls: number; cached: boolean[] };
const probe = (): Probe => {
  const global = globalThis as { liveTierProbe?: Probe };
  global.liveTierProbe = { calls: 0, cached: [] };
  return global.liveTierProbe;
};

const probed = `
  const probe = globalThis.liveTierProbe;
  if (probe) {
    probe.calls += 1;
    probe.cached.push(getOperationCache() !== undefined);
  }
`;

const bracket = `
  import { drawRoundedRectangle, getOperationCache, makeCylinder } from 'replicad';

  export const defaultParams = { size: 10, top: true, radius: 0.5 };

  export default function main(p = defaultParams) {
    ${probed}
    const plate = drawRoundedRectangle(p.size * 4, p.size * 2, 2).sketchOnPlane().extrude(p.size / 2);
    const boss = makeCylinder(p.size / 2, p.size, [0, 0, 0], [0, 0, 1]);
    const hole = makeCylinder(p.size / 5, p.size * 3, [p.size, 0, -p.size], [0, 0, 1]);
    // The finder closes over \`top\`: its source text is the same for both values.
    const body = plate.fuse(boss).cut(hole).fillet(p.radius, (edges) => edges.inPlane('XY', p.top ? p.size / 2 : 0));
    return [
      { shape: body, name: 'Body' },
      { shape: makeCylinder(2, 8).translate([p.size * 3, 0, 0]), name: 'Pin' },
    ];
  }
`;

/**
 * N7 (catalogue Finding 5): one plate, retained by the tier, is fused, cut and filleted in one build and meets a
 * different boolean in another. Replicad's booleans are destructive, so the hit operand carries parametric curves
 * an earlier boolean added in place.
 */
const retainedOperand = `
  import { drawRoundedRectangle, getOperationCache, makeCylinder } from 'replicad';

  export const defaultParams = { finished: true, height: 10 };

  export default function main(p = defaultParams) {
    ${probed}
    const plate = drawRoundedRectangle(40, 20, 2).sketchOnPlane().extrude(5);
    const fused = plate.fuse(makeCylinder(5, p.height, [0, 0, 0], [0, 0, 1]));
    return p.finished
      ? fused.cut(makeCylinder(2, 30, [10, 0, -10], [0, 0, 1])).fillet(0.5, (edges) => edges.inPlane('XY', 0))
      : fused;
  }
`;

type ParameterSet = Readonly<Record<string, unknown>>;
type Arm = { readonly compute: 'off' | 'memory'; readonly computeReuse?: false; readonly computeReuseBytes?: number };
type Lifecycle = 'live' | 'fresh';
/** What a build delivers: the GLB of the model view and, when asked, the STEP export. */
type Delivered = { readonly glb: string; readonly step?: string };

const tierOn: Arm = { compute: 'memory' };
const tierOff: Arm = { compute: 'memory', computeReuse: false };
/** About half of what one bracket build keeps: builds evict under byte pressure (E12). */
const tierPressed: Arm = { compute: 'memory', computeReuseBytes: 64 * 1024 };

const sha = (bytes: Uint8Array<ArrayBuffer>): string => createHash('sha256').update(bytes).digest('hex').slice(0, 16);

/** Runs `run` for each item, one after the other. */
const inSequence = async <Item, Result>(
  items: readonly Item[],
  run: (item: Item) => Promise<Result>,
): Promise<Result[]> => {
  const results: Result[] = [];
  for (const item of items) {
    results.push(await run(item));
  }
  return results;
};

/**
 * One client over one fixture; `build` renders a parameter set (after an optional source edit) and digests what it
 * delivers. `cached` composes the production build cache, which publishes native-handle snapshots.
 */
const session = (input: { source: string; arm: Arm; lifecycle?: Lifecycle; cached?: boolean }) => {
  const { source, arm, lifecycle = 'live' } = input;
  const runtime = defineRuntime({
    kernels: [
      replicadKernel({
        wasm: 'single',
        ...(arm.computeReuse === false ? { computeReuse: false } : {}),
        ...(arm.computeReuseBytes === undefined ? {} : { computeReuseBytes: arm.computeReuseBytes }),
      }),
    ],
    bundlers: [esbuildBundler()],
    ...(input.cached === true ? { middleware: [geometryCache()] } : {}),
  });
  const client = createRuntimeClient({
    transport: inProcessTransport({
      runtime,
      fileSystem: fromMemoryFs({ 'main.ts': source }),
      compute: { mode: arm.compute },
    }),
  });
  type Document = ReturnType<typeof client.open>;
  let live: { document: Document; view: ReturnType<Document['view']> } | undefined;

  const deliver = async (document: Document, view: ReturnType<Document['view']>, step: boolean): Promise<Delivered> => {
    const outcome = await view.rendering();
    if (outcome.superseded || !outcome.rendering.success) {
      throw new Error(`Render failed: ${JSON.stringify(outcome)}`);
    }
    const artifact = asKnownArtifact(outcome.rendering.artifact);
    if (artifact?.mimeType !== 'model/gltf-binary' || typeof artifact.content === 'string') {
      throw new Error('Expected a GLB');
    }
    const glb = sha(artifact.content);
    if (!step) {
      return { glb };
    }
    const exported = await document.export('step', {});
    if (!exported.success) {
      throw new Error('STEP export failed');
    }
    const [file] = exported.files;
    const text = new TextDecoder().decode(file.bytes);
    if (!text.includes('DATA;')) {
      throw new Error('STEP export wrote no data section');
    }
    // The header carries a time stamp and the writer numbers assembly usages across a process's exports; the rest of
    // the data section is the geometry.
    const data = text
      .slice(text.indexOf('DATA;'))
      .replaceAll(/NEXT_ASSEMBLY_USAGE_OCCURRENCE\('\d+'/gu, "NEXT_ASSEMBLY_USAGE_OCCURRENCE('n'");
    return { glb, step: sha(new TextEncoder().encode(data)) };
  };

  return {
    async build(parameters: ParameterSet, step = false, stage?: Readonly<Record<string, string>>): Promise<Delivered> {
      if (lifecycle === 'fresh') {
        const document = client.open({ source: { path: 'main.ts' }, parameters, watch: false });
        const view = document.view('model');
        try {
          return await deliver(document, view, step);
        } finally {
          view.close();
          document.close();
        }
      }
      if (live) {
        await live.document.update(stage ? { stage, parameters } : { parameters });
      } else {
        const document = client.open({ source: { path: 'main.ts' }, parameters, watch: false });
        live = { document, view: document.view('model') };
      }
      return deliver(live.document, live.view, step);
    },
    async close(): Promise<void> {
      live?.view.close();
      live?.document.close();
      await client.shutdown();
    },
  };
};

const buildAll = async (input: {
  readonly source: string;
  readonly arm: Arm;
  readonly steps: readonly ParameterSet[];
  readonly lifecycle?: Lifecycle;
  readonly step?: boolean;
}): Promise<Delivered[]> => {
  const opened = session(input);
  try {
    return await inSequence(input.steps, async (parameters) => opened.build(parameters, input.step));
  } finally {
    await opened.close();
  }
};

/** Reuse off, one fresh client per parameter set: what each build delivers with no history at all. */
const referenceOf = async (source: string, sets: readonly ParameterSet[]): Promise<Delivered[]> =>
  inSequence(sets, async (parameters) => {
    const [delivered] = await buildAll({ source, arm: tierOff, steps: [parameters], step: true });
    return delivered!;
  });

/** Deterministic histories (Park–Miller). */
const random = (seed: number) => {
  let state = seed;
  return (): number => {
    state = (state * 16_807) % 2_147_483_647;
    return state / 2_147_483_647;
  };
};

/** Sets of every combination of the given parameter values. */
const combinations = (values: Readonly<Record<string, readonly unknown[]>>): ParameterSet[] => {
  let sets: ParameterSet[] = [{}];
  for (const [key, options] of Object.entries(values)) {
    sets = sets.flatMap((set) => options.map((option) => ({ ...set, [key]: option })));
  }
  return sets;
};

/**
 * History-independence gate (I1): ten randomized histories with the tier on; every build delivers the GLB reuse off
 * delivers for its parameters, and the last build of each history exports the same STEP.
 */
const expectHistoryIndependence = async (
  source: string,
  sets: readonly ParameterSet[],
  { seed, arm = tierOn }: { readonly seed: number; readonly arm?: Arm },
) => {
  const reference = await referenceOf(source, sets);
  const next = random(seed);
  const histories = Array.from({ length: 10 }, () => Array.from({ length: 6 }, () => Math.floor(next() * sets.length)));
  await inSequence(histories, async (history) => {
    const opened = session({ source, arm });
    try {
      const delivered = await inSequence(history, async (index) =>
        opened.build(sets[index]!, index === history.at(-1)),
      );
      expect({ history, glb: delivered.map(({ glb }) => glb) }).toStrictEqual({
        history,
        glb: history.map((index) => reference[index]!.glb),
      });
      expect(delivered.at(-1)!.step).toBe(reference[history.at(-1)!]!.step);
    } finally {
      await opened.close();
    }
  });
  return reference;
};

describe('replicad live tier', () => {
  const sets = combinations({ size: [10, 12], top: [true, false], radius: [0.5, 1] });

  describe('history independence', () => {
    it(
      'should deliver what reuse off delivers for every build of ten randomized cache histories',
      async () => {
        const reference = await expectHistoryIndependence(bracket, sets, { seed: 5 });

        // The finder closure selects different edges for `top`: the gate covers both values.
        expect(new Set(reference.map(({ glb }) => glb)).size).toBe(sets.length);
      },
      renderTimeout,
    );

    it(
      'should deliver what reuse off delivers when a retained operand meets a different boolean (N7)',
      async () => {
        await expectHistoryIndependence(retainedOperand, combinations({ finished: [true, false], height: [10, 12] }), {
          seed: 11,
        });
      },
      renderTimeout,
    );

    it(
      'should deliver what reuse off delivers while byte pressure evicts entries in every build (E12)',
      async () => {
        await expectHistoryIndependence(bracket, sets, { seed: 7, arm: tierPressed });
        await expectHistoryIndependence(retainedOperand, combinations({ finished: [true, false], height: [10, 12] }), {
          seed: 13,
          arm: tierPressed,
        });
      },
      renderTimeout,
    );

    it(
      'should deliver what reuse off delivers right after the plate was finished (N7 repro)',
      async () => {
        const [reference] = await referenceOf(retainedOperand, [{ finished: false, height: 12 }]);

        const [, edited] = await buildAll({
          source: retainedOperand,
          arm: tierOn,
          steps: [
            { finished: true, height: 10 },
            { finished: false, height: 12 },
          ],
          step: true,
        });

        expect(edited).toStrictEqual(reference);
      },
      renderTimeout,
    );
  });

  it(
    'should select by a finder closure the truth for both parameter values',
    async () => {
      const top = { size: 10, top: true, radius: 0.5 };
      const bottom = { size: 10, top: false, radius: 0.5 };
      const reference = await referenceOf(bracket, [top, bottom]);

      const delivered = await buildAll({ source: bracket, arm: tierOn, steps: [top, bottom, top, bottom] });

      expect(reference[0]!.glb).not.toBe(reference[1]!.glb);
      expect(delivered.map(({ glb }) => glb)).toStrictEqual([...reference, ...reference].map(({ glb }) => glb));
    },
    renderTimeout,
  );

  it(
    'should answer a revisit from the scene table without running user code',
    async () => {
      const calls = probe();
      const [a, b] = [sets[0]!, sets[5]!];

      const delivered = await buildAll({ source: bracket, arm: tierOn, steps: [a, b, a, b] });

      expect(delivered[2]).toStrictEqual(delivered[0]);
      expect(delivered[3]).toStrictEqual(delivered[1]);
      expect(calls.calls).toBe(2);
    },
    renderTimeout,
  );

  it(
    'should give the fresh lifecycle the geometry and reuse of the live one',
    async () => {
      const steps = [sets[0]!, sets[3]!, sets[0]!, sets[6]!];
      const live = probe();
      const liveDelivered = await buildAll({ source: bracket, arm: tierOn, steps, lifecycle: 'live' });
      const liveCalls = live.calls;
      const fresh = probe();
      const freshDelivered = await buildAll({ source: bracket, arm: tierOn, steps, lifecycle: 'fresh' });

      expect(freshDelivered).toStrictEqual(liveDelivered);
      expect(fresh.calls).toBe(liveCalls);
      expect(fresh.cached).toStrictEqual([true, true, true]);
    },
    renderTimeout,
  );

  it.each([
    ['compute reuse is off', { compute: 'off' }],
    ['the kernel switches the tier off', tierOff],
  ] as const)(
    'should run user code with no operation cache and no scene table when %s',
    async (_case, arm) => {
      const calls = probe();
      const [a, b] = [sets[0]!, sets[5]!];

      await buildAll({ source: bracket, arm, steps: [a, b, a] });

      expect(calls.cached).toStrictEqual([false, false, false]);
    },
    renderTimeout,
  );
  describe('build key and snapshots', () => {
    it(
      'should answer a comment-only edit from the scene table and run user code for a real edit',
      async () => {
        const calls = probe();
        const opened = session({ source: bracket, arm: tierOn });
        try {
          const first = await opened.build(sets[0]!);
          const commented = await opened.build(sets[0]!, false, {
            'main.ts': `// A comment the bundler drops.\n${bracket.replace('const boss', '\n\n    const boss')}`,
          });
          const before = calls.calls;
          const edited = await opened.build(sets[0]!, false, {
            'main.ts': bracket.replace('p.size / 2, p.size,', 'p.size / 2, p.size + 1,'),
          });

          expect(commented).toStrictEqual(first);
          expect(before).toBe(1);
          expect(calls.calls).toBe(2);
          expect(edited).not.toStrictEqual(first);
        } finally {
          await opened.close();
        }
      },
      renderTimeout,
    );

    /** Digests of the native-handle snapshots the build cache writes while each step settles. */
    const snapshotsOf = async (arm: Arm, steps: ReadonlyArray<{ parameters: ParameterSet; comment: string }>) => {
      type BinaryBrepData = { getPtr(): number; getSize(): number };
      // eslint-disable-next-line @typescript-eslint/naming-convention -- OCCT embind mirrors the C++ method name.
      type BinaryBrep = { Write: (shape: unknown, withTriangles: boolean, withNormals: boolean) => BinaryBrepData };
      const written: string[][] = [];
      let current: string[] = [];
      const restore: Array<() => void> = [];
      const watch = (): void => {
        // The realm's OpenCASCADE instance exists once the first build ran; snapshots are written through its binary
        // BRep writer.
        const oc = replicad.getOC() as unknown as { ReplicadBinaryBrep: BinaryBrep; wasmMemory: WebAssembly.Memory };
        if (restore.length > 0) {
          return;
        }
        const writer = oc.ReplicadBinaryBrep;
        const { Write: write } = writer;
        const spy: BinaryBrep['Write'] = (shape, withTriangles, withNormals) => {
          const data = write.call(writer, shape, withTriangles, withNormals);
          const pointer = data.getPtr();
          current.push(sha(new Uint8Array(oc.wasmMemory.buffer).slice(pointer, pointer + data.getSize())));
          return data;
        };
        // Embind's dispatcher looks its overload table up on the method it is called through, so the spy carries it.
        writer.Write = Object.assign(spy, write);
        restore.push(() => {
          writer.Write = write;
        });
      };
      const opened = session({ source: retainedOperand, arm, cached: true });
      try {
        for (const { parameters, comment } of steps) {
          await opened.build(parameters, false, { 'main.ts': `${comment}\n${retainedOperand}` });
          watch();
          current = [];
          // The build cache publishes when the worker is idle.
          await new Promise((resolve) => {
            setTimeout(resolve, 1500);
          });
          written.push(current);
        }
      } finally {
        for (const undo of restore) {
          undo();
        }
        await opened.close();
      }
      return written;
    };

    it(
      'should publish no native-handle snapshot for a build made with the tier, a scene-table revisit included',
      async () => {
        const plain = { finished: false, height: 12 };
        const finished = { finished: true, height: 12 };
        const [reference] = await snapshotsOf(tierOff, [{ parameters: plain, comment: '' }]);

        // No hit; a hit whose destructive cut reaches the plate's shared shapes; a comment edit the build cache
        // misses and the scene table answers.
        const written = await snapshotsOf(tierOn, [
          { parameters: plain, comment: '' },
          { parameters: finished, comment: '' },
          { parameters: plain, comment: '// a comment' },
        ]);

        expect(reference).toHaveLength(1);
        expect(written).toStrictEqual([[], [], []]);
      },
      renderTimeout,
    );
  });
});
