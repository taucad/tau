// @vitest-environment node
/* oxlint-disable eslint/no-await-in-loop -- builds run in order: each one replaces the last. */
/**
 * Build epochs through the real runtime (catalogue E12, memory R5 and T6): the runtime releases a replaced build and
 * the kernel deletes what it delivered without waiting for the collector; module-scope shapes survive parameter-only
 * rebuilds (A3); and over a long drag the WebAssembly heap and the live OpenCascade handles stay flat, with the live
 * tier on, off, and under byte pressure.
 */
import { createHash } from 'node:crypto';
import { setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { esbuildBundler } from '@taucad/esbuild';
import { asKnownArtifact, createRuntimeClient } from '@taucad/runtime/client';
import { fromMemoryFs } from '@taucad/runtime/filesystem';
import { inProcessTransport } from '@taucad/runtime/transport/in-process';
import { defineRuntime } from '@taucad/runtime/worker';
import { installHandleLedger, summarizeLeaks } from '@taucad/runtime-testing';
import type { HandleLedger } from '@taucad/runtime-testing';
import * as replicad from 'replicad';
import { replicadKernel } from '#replicad.kernel.js';

const renderTimeout = 300_000;

setFlagsFromString('--expose-gc');
const gc = runInNewContext('gc') as () => void;
/** Collect and let the finalization registry run, as an idle worker would between edits. */
const collect = async (): Promise<void> => {
  for (let round = 0; round < 4; round += 1) {
    gc();
    await new Promise((resolve) => {
      setTimeout(resolve, 5);
    });
  }
};

type Options = { readonly computeReuse?: false; readonly computeReuseBytes?: number };

/** One live document over `source`; `build` renders a parameter set and digests the GLB. */
const session = (source: string, options: Options = {}) => {
  const client = createRuntimeClient({
    transport: inProcessTransport({
      runtime: defineRuntime({
        kernels: [replicadKernel({ wasm: 'single', ...options })],
        bundlers: [esbuildBundler()],
      }),
      fileSystem: fromMemoryFs({ 'main.ts': source }),
      compute: { mode: 'memory' },
    }),
  });
  const tierBytes: number[] = [];
  let tierEvicted = 0;
  client.on('telemetry', (batch) => {
    for (const entry of batch.entries) {
      const bytes = entry.name === 'replicad.run-main' ? entry.detail?.['tierBytes'] : undefined;
      if (typeof bytes === 'number') {
        tierBytes.push(bytes);
        tierEvicted += Number(entry.detail?.['tierEvicted'] ?? 0);
      }
    }
  });
  type Document = ReturnType<typeof client.open>;
  let live: { document: Document; view: ReturnType<Document['view']> } | undefined;
  return {
    tierBytes,
    evicted: () => tierEvicted,
    async build(parameters: Readonly<Record<string, unknown>>): Promise<string> {
      if (live) {
        await live.document.update({ parameters });
      } else {
        const document = client.open({ source: { path: 'main.ts' }, parameters, watch: false });
        live = { document, view: document.view('model') };
      }
      const outcome = await live.view.rendering();
      if (outcome.superseded || !outcome.rendering.success) {
        throw new Error(`Render failed: ${JSON.stringify(outcome).slice(0, 2000)}`);
      }
      const artifact = asKnownArtifact(outcome.rendering.artifact);
      if (artifact?.mimeType !== 'model/gltf-binary' || typeof artifact.content === 'string') {
        throw new Error('Expected a GLB');
      }
      return createHash('sha256').update(artifact.content).digest('hex');
    },
    async close(): Promise<void> {
      live?.view.close();
      live?.document.close();
      await client.shutdown();
    },
  };
};

/** The instance the kernel bound for Replicad, ledgered once per test file. */
const ledgerOf = (): HandleLedger => installHandleLedger(replicad.getOC());
const heapBytes = (): number =>
  (replicad.getOC() as unknown as { wasmMemory: WebAssembly.Memory }).wasmMemory.buffer.byteLength;

/** One primitive and no intermediate: every handle a build leaves is what it delivers. */
const pin = `
  import { makeCylinder } from 'replicad';
  export const defaultParams = { radius: 2 };
  export default function main(p = defaultParams) {
    return makeCylinder(p.radius, 8);
  }
`;

/** A sketched plate with a boss, a hole and a fillet, plus a pin: intermediates, a finder and two entries. */
const bracket = `
  import { drawRoundedRectangle, makeCylinder } from 'replicad';
  export const defaultParams = { size: 10 };
  export default function main(p = defaultParams) {
    const plate = drawRoundedRectangle(p.size * 4, p.size * 2, 2).sketchOnPlane().extrude(p.size / 2);
    const boss = makeCylinder(p.size / 2, p.size, [0, 0, 0], [0, 0, 1]);
    const hole = makeCylinder(p.size / 5, p.size * 3, [p.size, 0, -p.size], [0, 0, 1]);
    const body = plate.fuse(boss).cut(hole).fillet(0.5, (edges) => edges.inPlane('XY', 0));
    return [{ shape: body, name: 'Body' }, { shape: makeCylinder(2, 8).translate([p.size * 3, 0, 0]), name: 'Pin' }];
  }
`;

/** A shape built at module scope and returned by some builds only. */
const moduleScope = `
  import { makeBaseBox, makeCylinder } from 'replicad';
  const base = makeBaseBox(10, 10, 10);
  export const defaultParams = { useBase: true, radius: 2 };
  export default function main(p = defaultParams) {
    return p.useBase ? base : makeCylinder(p.radius, 8);
  }
`;

/** A shape memoized in module state during `main` and returned as it is whenever its key comes back. */
const memoized = `
  import { makeCylinder } from 'replicad';
  const cache = new Map();
  export const defaultParams = { key: 1 };
  export default function main(p = defaultParams) {
    let shape = cache.get(p.key);
    if (!shape) {
      shape = makeCylinder(p.key, 8);
      cache.set(p.key, shape);
    }
    return shape;
  }
`;

describe('replicad build epochs', () => {
  it(
    'should delete what a replaced build delivered without the collector',
    async () => {
      const opened = session(pin, { computeReuse: false });
      try {
        await opened.build({ radius: 2 });
        const ledger = ledgerOf();
        const before = ledger.snapshot();
        const alive: number[] = [];
        for (let step = 1; step <= 6; step += 1) {
          await opened.build({ radius: 2 + step });
          alive.push(ledger.since(before).length);
        }

        // Without `releaseHandle` each build adds the cylinder it delivered until the collector runs. With it, the
        // replaced build's cylinder stays parked for one more build, then goes.
        expect(alive, JSON.stringify(summarizeLeaks(ledger.since(before)))).toStrictEqual([1, 2, 2, 2, 2, 2]);
        expect(ledger.stats().doubleDeletes).toBe(0);
      } finally {
        await opened.close();
      }
    },
    renderTimeout,
  );

  it(
    'should keep a module-scope shape that builds deliver, release and deliver again (A3)',
    async () => {
      for (const options of [{ computeReuse: false }, {}] as const) {
        const opened = session(moduleScope, options);
        try {
          const glbs = [];
          for (const useBase of [true, false, false, true, false, true]) {
            glbs.push(await opened.build({ useBase, radius: glbs.length + 1 }));
          }
          expect(new Set([glbs[0], glbs[3], glbs[5]]).size).toBe(1);
        } finally {
          await opened.close();
        }
      }
    },
    renderTimeout,
  );

  it(
    'should deliver a shape kept in module state again after the build that returned it was released',
    async () => {
      for (const options of [{ computeReuse: false }, {}] as const) {
        const opened = session(memoized, options);
        try {
          const first = await opened.build({ key: 1 });
          const ledger = ledgerOf();
          await collect();
          const before = ledger.snapshot();
          const glbs: string[] = [];
          const alive: number[] = [];
          for (let step = 1; step <= 40; step += 1) {
            glbs.push(await opened.build({ key: step % 2 === 0 ? 1 : 2 }));
            await collect();
            alive.push(ledger.since(before).length);
          }

          expect(glbs.filter((_, index) => index % 2 === 1)).toStrictEqual(Array.from({ length: 20 }, () => first));
          expect(new Set(glbs).size).toBe(2);
          const settled = alive.slice(9);
          expect(settled, JSON.stringify(summarizeLeaks(ledger.since(before)))).toStrictEqual(
            Array.from({ length: settled.length }, () => settled[0]),
          );
          expect(ledger.stats().doubleDeletes).toBe(0);
        } finally {
          await opened.close();
        }
      }
    },
    renderTimeout,
  );

  /**
   * T6 for E12: a 40-step drag through distinct values. After the first ten steps, collection leaves exactly as many
   * live handles and the same WebAssembly heap as at the end: nothing accumulates per edit.
   */
  const expectFlatDrag = async (options: Options): Promise<{ tierBytes: number[]; evicted: number }> => {
    const opened = session(bracket, options);
    try {
      await opened.build({ size: 10 });
      const ledger = ledgerOf();
      await collect();
      const before = ledger.snapshot();
      const handles: number[] = [];
      const heaps: number[] = [];
      for (let step = 1; step <= 40; step += 1) {
        await opened.build({ size: 10 + step / 4 });
        await collect();
        handles.push(ledger.since(before).length);
        heaps.push(heapBytes());
      }

      const settled = handles.slice(9);
      expect(settled, JSON.stringify(summarizeLeaks(ledger.since(before)).slice(0, 10))).toStrictEqual(
        Array.from({ length: settled.length }, () => settled[0]),
      );
      expect(heaps.at(-1)).toBe(heaps[9]);
      expect(ledger.stats().doubleDeletes).toBe(0);
      return { tierBytes: opened.tierBytes, evicted: opened.evicted() };
    } finally {
      await opened.close();
    }
  };

  it(
    'should keep the heap and live handles flat over a long drag with reuse off',
    async () => {
      const { tierBytes } = await expectFlatDrag({ computeReuse: false });
      expect(tierBytes).toStrictEqual([]);
    },
    renderTimeout,
  );

  it(
    'should keep the heap and live handles flat over a long drag with the live tier',
    async () => {
      const { tierBytes } = await expectFlatDrag({});
      expect(tierBytes).toHaveLength(41);
    },
    renderTimeout,
  );

  it(
    'should keep the live tier within its byte budget over a long drag',
    async () => {
      const budget = 128 * 1024;
      const { tierBytes, evicted } = await expectFlatDrag({ computeReuseBytes: budget });
      expect(tierBytes.length).toBe(41);
      expect(Math.max(...tierBytes)).toBeLessThanOrEqual(budget);
      expect(evicted).toBeGreaterThan(0);
    },
    renderTimeout,
  );
});
