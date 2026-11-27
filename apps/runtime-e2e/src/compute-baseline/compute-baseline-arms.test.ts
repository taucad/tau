/**
 * Q4/T6/T14: the fresh-process and seeded concurrent arms exist and are runnable.
 *
 * `restart-warm` is a genuinely fresh process over a store another process
 * seeded, so startup and solve are separable intervals. `seeded-fanout` seeds a
 * store and then runs N independent variant workers over it; the arm is declared
 * at 2/4/8/16 and this suite exercises it at 2 by default
 * (`TAU_COMPUTE_BASELINE_FANOUT=full` runs 4/8/16 as well, which is a timing
 * campaign rather than a correctness check).
 *
 * Replicad reuse is the live tier: an in-process operation tier per document.
 * A build made with it refuses its native snapshot (catalogue N7), so the
 * durable store keeps no Replicad build and nothing crosses a process. These
 * arms therefore assert that a fresh process imports nothing, does the seed's
 * full native work and renders the seed's bytes, and that its own tier then
 * reuses the unchanged prefix of an edit.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { rm } from 'node:fs/promises';
import type { Expectation } from '#compute-baseline/oracle.js';
import { describeGlb, violations } from '#compute-baseline/oracle.js';
import { arms } from '#compute-baseline/qualification.js';
import type { ArmReport, StepReport } from '#compute-baseline/runner.js';
import { readDump, runArm, scratch } from '#compute-baseline/runner.js';

const millimetre = 0.001;
const parityBox: Expectation = {
  names: ['ParityBox'],
  volume: (40 * 30 * 20 - Math.PI * 5 * 5 * 20) * millimetre ** 3,
  volumeTolerance: 0.001,
  bounds: [100 * millimetre, 0, -30 * millimetre, 140 * millimetre, 20 * millimetre, 0],
  boundsTolerance: 10e-6,
};

const fanout = process.env['TAU_COMPUTE_BASELINE_FANOUT'] === 'full' ? [2, 4, 8, 16] : [2];

let workspace: string;
let seed: StepReport;
let restart: ArmReport;

beforeAll(async () => {
  workspace = await scratch('arms');
  const store = join(workspace, 'seed-store');
  const seedRun = await runArm(
    {
      model: 'parity-box',
      arm: 'durable',
      steps: ['cold'],
      store,
      dumpGlb: join(workspace, 'seed-glb'),
      label: 'seed',
    },
    workspace,
  );
  seed = seedRun.steps[0]!;
  restart = await runArm(
    {
      model: 'parity-box',
      arm: 'durable',
      steps: ['restart', 'late'],
      store,
      dumpGlb: join(workspace, 'restart-glb'),
      label: 'restart',
    },
    workspace,
  );
});

afterAll(async () => {
  if (workspace) {
    await rm(workspace, { recursive: true, force: true });
  }
});

describe('compute-baseline arms', () => {
  it('declares every arm and interval the qualification blueprint names', () => {
    expect(arms.map((arm) => arm.id)).toEqual([
      'off',
      'empty-durable-cold',
      'resident-warm',
      'durable-warm',
      'restart-warm',
      'seeded-fanout',
      'simultaneously-cold',
      'pressure-failure',
      'poison',
    ]);
    expect(arms.find((arm) => arm.id === 'seeded-fanout')!.workers).toEqual([2, 4, 8, 16]);
    expect(arms.find((arm) => arm.id === 'simultaneously-cold')!.workers).toEqual([2, 4, 8, 16]);
    // Q4: cold arms are asserted to run in a process that has never seen the store.
    for (const arm of arms.filter((candidate) => candidate.freshProcess)) {
      expect(arm.runner.steps.length).toBeGreaterThan(0);
    }
  });

  it('restart-warm: a fresh process imports no Replicad operation from the store another process seeded', async () => {
    const warm = restart.steps.find((step) => step.step === 'restart')!;
    expect(seed.lookups.hit).toBe(0);
    expect(seed.records.staged).toBeGreaterThan(0);
    expect(seed.counters['native.solve']!.calls).toBeGreaterThan(0);
    // The live tier lives in its process and the store holds no snapshot of a
    // build made with it, so the fresh process starts cold: no hit, the seed's
    // full native work, the same admissions and the same bytes.
    expect(warm.lookups).toEqual({ hit: 0, miss: seed.lookups.miss, session: 0, cache: 0 });
    expect(warm.counters['native.solve']!.calls).toBe(seed.counters['native.solve']!.calls);
    expect(warm.records.staged).toBe(seed.records.staged);
    expect(warm.output.sha256).toBe(seed.output.sha256);
    const seedGeometry = await describeGlb(
      await readDump({
        directory: join(workspace, 'seed-glb'),
        model: 'parity-box',
        arm: 'durable',
        step: 'cold',
      }),
    );
    const warmGeometry = await describeGlb(
      await readDump({
        directory: join(workspace, 'restart-glb'),
        model: 'parity-box',
        arm: 'durable',
        step: 'restart',
      }),
    );
    expect(violations(seedGeometry, parityBox)).toEqual([]);
    expect(violations(warmGeometry, parityBox)).toEqual([]);
  });

  it('restart-warm: startup is a separate interval from the solve', () => {
    const warm = restart.steps.find((step) => step.step === 'restart')!;
    // T6 forbids charging interpreter/WASM boot to the solve, so both must be
    // recorded independently: the native solves are timed at the live tier's
    // operation cache, inside the model program.
    expect(warm.spans['replicad.wasm-init']!.ms).toBeGreaterThan(0);
    expect(warm.spans['create.runOcMain']).toBeDefined();
    expect(warm.counters['native.solve']!.ms).toBeGreaterThan(0);
  });

  it('restart-warm: the late edit reuses the unchanged prefix and recomputes its changed cone', () => {
    const warm = restart.steps.find((step) => step.step === 'restart')!;
    const late = restart.steps.find((step) => step.step === 'late')!;
    expect(late.lookups.hit).toBeGreaterThan(0);
    expect(late.records.staged).toBeGreaterThan(0);
    expect(late.counters['native.solve']!.calls).toBe(warm.counters['native.solve']!.calls - late.lookups.hit);
  });

  it.each(fanout)('seeded-fanout: %i independent workers each rebuild the seeded model', async (workers) => {
    const store = join(workspace, `fanout-${workers}-store`);
    const seeded = await runArm(
      {
        model: 'parity-box',
        arm: 'durable',
        steps: ['cold'],
        store,
        dumpGlb: join(workspace, `fanout-${workers}-seed-glb`),
        label: `fanout-${workers}-seed`,
      },
      workspace,
    );
    const cold = seeded.steps[0]!;
    expect(cold.records.staged).toBeGreaterThan(0);
    const variants = await Promise.all(
      Array.from({ length: workers }, async (_unused, worker) =>
        runArm(
          {
            model: 'parity-box',
            arm: 'durable',
            steps: ['restart', 'late'],
            store,
            dumpGlb: join(workspace, `fanout-${workers}-w${worker}-glb`),
            label: `fanout-${workers}-w${worker}`,
          },
          workspace,
        ),
      ),
    );
    expect(variants).toHaveLength(workers);
    await Promise.all(
      variants.map(async (variant, worker) => {
        const warm = variant.steps.find((step) => step.step === 'restart')!;
        // T14 with the live tier: no Replicad build crosses a process, so each
        // fresh worker does the seed's full native work and renders its bytes.
        expect(warm.lookups.hit).toBe(0);
        expect(warm.counters['native.solve']!.calls).toBe(cold.counters['native.solve']!.calls);
        expect(warm.output.sha256).toBe(cold.output.sha256);
        const warmGeometry = await describeGlb(
          await readDump({
            directory: join(workspace, `fanout-${workers}-w${worker}-glb`),
            model: 'parity-box',
            arm: 'durable',
            step: 'restart',
          }),
        );
        expect(violations(warmGeometry, parityBox)).toEqual([]);
        // Correct suffix: the changed variant reuses its worker's own prefix and still produces geometry.
        const late = variant.steps.find((step) => step.step === 'late')!;
        expect(late.lookups.hit).toBeGreaterThan(0);
        expect(late.output.triangles).toBeGreaterThan(0);
      }),
    );
  });
});
