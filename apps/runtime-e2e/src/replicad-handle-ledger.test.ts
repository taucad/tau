/* oxlint-disable eslint/no-await-in-loop -- builds run in order: each one replaces the last. */
/**
 * Handle ledger over the Replicad editing matrix (catalogue E12, memory T6): each of the seven matrix models is
 * rebuilt through the real runtime, alternating parameter sets, with the live tier off and on. After each build and a
 * collection, the OpenCascade handles still alive are counted. Every return to the base parameters must leave exactly
 * as many as the last one: Tau keeps nothing per build, and no handle is ever deleted twice.
 */
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

/**
 * Leaks in `@taulabs/replicad` itself, not in Tau. `drawFaceOutline` (the planetary gears' tooth profiles) keeps the
 * `Geom2d_Curve` handle `edgeToCurve` reads from `BRepAdaptor_Curve2d.Curve()`, one per edge and build, which nothing
 * frees. The live tier hides it by reusing the outline. Expected to fail until the fork releases the fix; then the
 * entry goes.
 */
const libraryLeaks = new Set(['planetary-gear-system:off']);

const base: ParameterSet = {};
// The document opens at the base parameters, so the first edit moves away from them.
const steps = ['a', base, 'b', base, 'a', base, 'b', base] as const;

describe('Replicad handle ledger over the editing matrix', () => {
  for (const { name, a, b } of matrix) {
    for (const computeReuse of [false, true]) {
      const arm = computeReuse ? 'on' : 'off';
      const test = libraryLeaks.has(`${name}:${arm}`) ? it.fails : it;
      test(`${name} leaks no handle across rebuilds, live tier ${arm}`, async () => {
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
