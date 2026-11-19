/* oxlint-disable eslint/no-await-in-loop -- builds run in order: each one replaces the last. */
/**
 * Handle ledger over the Replicad editing matrix (catalogue E12, memory T6): each of the seven matrix models is
 * rebuilt through the real runtime, alternating parameter sets, with the live tier off and on. After each build and a
 * collection, the OpenCascade handles still alive are counted. Every return to the base parameters must leave exactly
 * as many as the last one: Tau keeps nothing per build, and no handle is ever deleted twice.
 */
import { createHash } from 'node:crypto';
import { setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { esbuildBundler } from '@taucad/esbuild';
import { replicadKernel } from '@taucad/replicad';
import { createRuntimeClient } from '@taucad/runtime/client';
import { fromMemoryFs } from '@taucad/runtime/filesystem';
import { inProcessTransport } from '@taucad/runtime/transport/in-process';
import { defineRuntime } from '@taucad/runtime/worker';
import { installHandleLedger, summarizeLeaks } from '@taucad/runtime-testing';
import { loadFixture } from '@taucad/tau-examples/fixtures';
import * as replicad from 'replicad';

setFlagsFromString('--expose-gc');
const gc = runInNewContext('gc') as () => void;
const collect = async (): Promise<void> => {
  for (let round = 0; round < 4; round += 1) {
    gc();
    await new Promise((resolve) => {
      setTimeout(resolve, 5);
    });
  }
};

type ParameterSet = Readonly<Record<string, unknown>>;

/** The matrix and the parameter sets its edits use (one late feature, one early feature). */
const matrix: ReadonlyArray<{
  readonly name: Parameters<typeof loadFixture<'replicad'>>[1];
  readonly a: ParameterSet;
  readonly b: ParameterSet;
}> = [
  { name: 'gridfinity-box', a: { enableMagnet: true }, b: { xSize: 3 } },
  { name: 'stress-test', a: { loftHeight: 22 }, b: { baseLength: 130 } },
  { name: 'spur-gearbox', a: { inputAngle: 10 }, b: { coverLift: 20 } },
  { name: 'turbofan', a: { reverserTravel: 200 }, b: { vaneAngle: -20 } },
  { name: 'bench-vise', a: { opening: 80 }, b: { jawWidth: 140 } },
  { name: 'six-axis-arm', a: { j2: 20 }, b: { reach: 600 } },
  { name: 'planetary-gear-system', a: { inputAngle: 15 }, b: { faceWidth: 16 } },
];

const base: ParameterSet = {};
// The document opens at the base parameters, so the first edit moves away from them.
const steps = ['a', base, 'b', base, 'a', base, 'b', base] as const;

describe('Replicad handle ledger over the editing matrix', () => {
  for (const { name, a, b } of matrix) {
    for (const computeReuse of [false, true]) {
      const arm = computeReuse ? 'on' : 'off';
      it(`${name} leaks no handle across rebuilds, live tier ${arm}`, async () => {
        const fixture = loadFixture('replicad', name);
        const client = createRuntimeClient({
          transport: inProcessTransport({
            runtime: defineRuntime({
              kernels: [replicadKernel({ wasm: 'single', ...(computeReuse ? {} : { computeReuse: false }) })],
              bundlers: [esbuildBundler()],
            }),
            fileSystem: fromMemoryFs(fixture.files),
            compute: { mode: 'memory' },
          }),
        });
        const document = client.open({ source: { path: fixture.mainFile }, parameters: base, watch: false });
        const view = document.view('model');
        try {
          const render = async (): Promise<void> => {
            const outcome = await view.rendering();
            if (outcome.superseded || !outcome.rendering.success) {
              throw new Error(`Render failed: ${JSON.stringify(outcome).slice(0, 2000)}`);
            }
          };
          await render();
          const ledger = installHandleLedger(replicad.getOC());
          await collect();
          const before = ledger.snapshot();
          const atBase: number[] = [];
          for (const step of steps) {
            const parameters = step === 'a' ? a : step === 'b' ? b : step;
            await document.update({ parameters });
            await render();
            await collect();
            if (step === base) {
              atBase.push(ledger.since(before).length);
            }
          }

          // With the tier, the first cycle fills it; from then on a return to the base parameters is a revisit.
          const settled = computeReuse ? atBase.slice(2) : atBase;
          expect(settled, JSON.stringify(summarizeLeaks(ledger.since(before)).slice(0, 10))).toStrictEqual(
            Array.from({ length: settled.length }, () => settled[0]),
          );
          expect(ledger.stats().doubleDeletes).toBe(0);
        } finally {
          view.close();
          document.close();
          await client.shutdown();
        }
      });
    }
  }
});

/**
 * An interrupted drag (P9c): frames sent back to back as a slider sends them, so each one supersedes the build or the
 * render (its GLB pack included) still running for the last. Each drag ends on a committed value; every return to the
 * base value must leave as many handles as the last one, delete none twice, and render the bytes reuse off renders.
 */
describe('Replicad handle ledger over an interrupted drag', () => {
  const drags: ReadonlyArray<{
    readonly name: Parameters<typeof loadFixture<'replicad'>>[1];
    readonly key: string;
    readonly values: readonly number[];
  }> = [
    { name: 'planetary-gear-system', key: 'inputAngle', values: [3, 6, 9, 12, 15] },
    { name: 'turbofan', key: 'reverserTravel', values: [40, 80, 120, 160, 200] },
  ];

  for (const { name, key, values } of drags) {
    it(`${name} keeps a flat heap and reuse-off bytes over an interrupted ${key} drag`, async () => {
      const fixture = loadFixture('replicad', name);
      const bytesByArm: Record<string, string[]> = {};
      for (const computeReuse of [false, true]) {
        const arm = computeReuse ? 'on' : 'off';
        const client = createRuntimeClient({
          transport: inProcessTransport({
            runtime: defineRuntime({
              kernels: [replicadKernel({ wasm: 'single', ...(computeReuse ? {} : { computeReuse: false }) })],
              bundlers: [esbuildBundler()],
            }),
            fileSystem: fromMemoryFs(fixture.files),
            compute: { mode: 'memory' },
          }),
        });
        let cancelled = 0;
        client.on('telemetry', ({ entries }) => {
          cancelled += entries.filter(({ detail }) => detail?.['operation.outcome'] === 'cancelled').length;
        });
        const document = client.open({ source: { path: fixture.mainFile }, parameters: base, watch: false });
        const view = document.view('model');
        try {
          const render = async (): Promise<string> => {
            const outcome = await view.rendering();
            if (outcome.superseded || !outcome.rendering.success) {
              throw new Error(`Render failed: ${JSON.stringify(outcome).slice(0, 2000)}`);
            }
            const { artifact } = outcome.rendering;
            return createHash('sha256')
              .update((artifact as { content: Uint8Array<ArrayBuffer> }).content)
              .digest('hex');
          };
          await render();
          const ledger = installHandleLedger(replicad.getOC());
          await collect();
          const before = ledger.snapshot();
          const atBase: number[] = [];
          const bytes: string[] = [];
          for (let drag = 0; drag < 4; drag += 1) {
            // Out along the ladder and back to the base value; a frame lands while the last one is still running.
            const frames = [...values, ...values.toReversed().slice(1), 0];
            const pending = [];
            for (const value of frames.slice(0, -1)) {
              pending.push(document.update({ parameters: { [key]: value }, transient: true }));
              await new Promise((resolve) => {
                setTimeout(resolve, 1);
              });
            }
            await document.update({ parameters: { [key]: frames.at(-1) } });
            await Promise.allSettled(pending);
            bytes.push(await render());
            await collect();
            atBase.push(ledger.since(before).length);
          }

          // With the tier, the first drag fills it; from then on every drag replays the same frames.
          const settled = computeReuse ? atBase.slice(1) : atBase;
          expect(settled, JSON.stringify(summarizeLeaks(ledger.since(before)).slice(0, 10))).toStrictEqual(
            Array.from({ length: settled.length }, () => settled[0]),
          );
          expect(ledger.stats().doubleDeletes).toBe(0);
          expect(cancelled, 'no frame was interrupted').toBeGreaterThan(0);
          bytesByArm[arm] = bytes;
        } finally {
          view.close();
          document.close();
          await client.shutdown();
        }
      }
      expect(bytesByArm['on']).toStrictEqual(bytesByArm['off']);
    });
  }
});
