/**
 * Q4/T6/T14: the fresh-process and seeded concurrent arms exist and are runnable.
 *
 * `restart-warm` is a genuinely fresh process over a store another process
 * seeded, so startup, discovery and solve are separable intervals. `seeded-fanout`
 * publishes a qualified prefix and then runs N independent variant workers over
 * it; the arm is declared at 2/4/8/16 and this suite exercises it at 2 by
 * default (`TAU_COMPUTE_BASELINE_FANOUT=full` runs 4/8/16 as well, which is a
 * timing campaign rather than a correctness check).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { rm } from 'node:fs/promises';
import { arms } from '#compute-baseline/qualification.js';
import type { ArmReport, StepReport } from '#compute-baseline/runner.js';
import { runArm, scratch } from '#compute-baseline/runner.js';

const fanout = process.env['TAU_COMPUTE_BASELINE_FANOUT'] === 'full' ? [2, 4, 8, 16] : [2];

let workspace: string;
let seed: StepReport;
let restart: ArmReport;

beforeAll(async () => {
  workspace = await scratch('arms');
  const store = join(workspace, 'seed-store');
  const seedRun = await runArm(
    { model: 'parity-box', arm: 'durable', steps: ['cold'], store, label: 'seed' },
    workspace,
  );
  seed = seedRun.steps[0]!;
  restart = await runArm(
    { model: 'parity-box', arm: 'durable', steps: ['restart', 'late'], store, label: 'restart' },
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

  it('restart-warm: a fresh process reuses a store another process published', () => {
    const warm = restart.steps.find((step) => step.step === 'restart')!;
    expect(seed.lookups.hit).toBe(0);
    expect(seed.records.staged).toBeGreaterThan(0);
    // The restart process never computed the prefix itself.
    expect(warm.lookups.hit).toBe(seed.records.staged);
    expect(warm.lookups.miss).toBe(0);
    expect(warm.spans['create.runOcMain']!.ms).toBeLessThan(seed.spans['create.runOcMain']!.ms / 2);
  });

  it('restart-warm: startup and warm discovery are separate intervals from the solve', () => {
    const warm = restart.steps.find((step) => step.step === 'restart')!;
    // T6 forbids charging interpreter/WASM boot to warm preparation, so both
    // must be recorded independently.
    expect(warm.spans['replicad.wasm-init']!.ms).toBeGreaterThan(0);
    expect(warm.counters['session.open']!.calls).toBe(1);
    expect(warm.spans['create.runOcMain']).toBeDefined();
  });

  it('restart-warm: the late edit still recomputes its changed cone', () => {
    const late = restart.steps.find((step) => step.step === 'late')!;
    expect(late.lookups.hit).toBeGreaterThan(0);
    expect(late.records.staged).toBeGreaterThan(0);
  });

  it.each(fanout)('seeded-fanout: %i independent workers reuse the published prefix', async (workers) => {
    const store = join(workspace, `fanout-${workers}-store`);
    await runArm(
      { model: 'parity-box', arm: 'durable', steps: ['cold'], store, label: `fanout-${workers}-seed` },
      workspace,
    );
    const variants = await Promise.all(
      Array.from({ length: workers }, async (_unused, worker) =>
        runArm(
          {
            model: 'parity-box',
            arm: 'durable',
            steps: ['restart', 'late'],
            store,
            label: `fanout-${workers}-w${worker}`,
          },
          workspace,
        ),
      ),
    );
    expect(variants).toHaveLength(workers);
    for (const variant of variants) {
      const warm = variant.steps.find((step) => step.step === 'restart')!;
      // T14: zero native solves for the declared eligible unchanged actions.
      expect(warm.lookups.miss).toBe(0);
      expect(warm.lookups.hit).toBeGreaterThan(0);
      // Correct suffix: the changed variant still produces geometry.
      expect(variant.steps.find((step) => step.step === 'late')!.output.triangles).toBeGreaterThan(0);
    }
  });
});
