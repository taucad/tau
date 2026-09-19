/**
 * Q1/T1/T10: parity and work counters must FAIL on a deliberately wrong cache.
 *
 * The fault is injected at the real seam: the harness's `poison` arm answers
 * every `KernelComputeSession.lookup` with a BRep captured from an earlier
 * honest run, so the kernel restores a wrong shape through the production
 * `replicad-compute-reuse` adapter and never calls `input.compute()`
 * (`packages/plugins/replicad/src/replicad-compute-reuse.ts:228-233`). Nothing is
 * stubbed downstream of that: the render, the tessellation and the GLB are the
 * production path.
 *
 * "A gate passes before the change, therefore the gate is wrong" is rejected --
 * so each assertion is stated as a pair: it holds on the honest arm and is
 * violated on the poisoned one.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { rm } from 'node:fs/promises';
import type { Expectation, Geometry } from '#compute-baseline/oracle.js';
import { describeGlb, violations } from '#compute-baseline/oracle.js';
import type { StepReport } from '#compute-baseline/runner.js';
import { readDump, runArm, scratch } from '#compute-baseline/runner.js';

const millimetre = 0.001;
const expectation: Expectation = {
  names: ['ParityBox'],
  volume: (40 * 30 * 20 - Math.PI * 5 * 5 * 20) * millimetre ** 3,
  volumeTolerance: 0.001,
  bounds: [100 * millimetre, 0, -30 * millimetre, 140 * millimetre, 20 * millimetre, 0],
  boundsTolerance: 10e-6,
};

let workspace: string;
let honest: StepReport;
let poisoned: StepReport;
let off: StepReport;
let honestGeometry: Geometry;
let poisonedGeometry: Geometry;

beforeAll(async () => {
  workspace = await scratch('parity');
  const dumps = join(workspace, 'glb');
  const brep = join(workspace, 'captured.brep');
  const honestRun = await runArm(
    { model: 'parity-box', arm: 'memory', steps: ['cold'], captureBrep: brep, dumpGlb: dumps, label: 'honest' },
    workspace,
  );
  const poisonedRun = await runArm(
    { model: 'parity-box', arm: 'poison', steps: ['cold'], poisonBrep: brep, dumpGlb: dumps, label: 'poison' },
    workspace,
  );
  const offRun = await runArm(
    { model: 'parity-box', arm: 'bypass', steps: ['cold'], store: join(workspace, 'off-store'), label: 'off' },
    workspace,
  );
  honest = honestRun.steps[0]!;
  poisoned = poisonedRun.steps[0]!;
  off = offRun.steps[0]!;
  honestGeometry = await describeGlb(
    await readDump({ directory: dumps, model: 'parity-box', arm: 'memory', step: 'cold' }),
  );
  poisonedGeometry = await describeGlb(
    await readDump({ directory: dumps, model: 'parity-box', arm: 'poison', step: 'cold' }),
  );
});

afterAll(async () => {
  if (workspace) {
    await rm(workspace, { recursive: true, force: true });
  }
});

describe('compute-baseline fault injection', () => {
  it('injects a wrong cached BRep on every lookup', () => {
    // Red-first precondition: the fault actually reached the production adapter.
    expect(honest.poisonedLookups).toBe(0);
    expect(poisoned.poisonedLookups).toBeGreaterThan(0);
    expect(poisoned.lookups.hit).toBe(poisoned.poisonedLookups);
    expect(poisoned.lookups.miss).toBe(0);
  });

  it('parity mutation: the geometry oracle passes honestly and fails on the wrong cache', () => {
    expect(violations(honestGeometry, expectation)).toEqual([]);
    expect(violations(poisonedGeometry, expectation)).not.toEqual([]);
  });

  it('parity mutation: the rendered bytes and geometry digests diverge', () => {
    expect(poisoned.output.sha256).not.toBe(honest.output.sha256);
    expect(poisoned.output.geometrySha256).not.toBe(honest.output.geometrySha256);
  });

  it('work counters: the wrong cache collapses native solve work and publication', () => {
    // T10: hit counts never stand alone -- the avoided native work is the claim.
    expect(honest.records.staged).toBeGreaterThan(0);
    expect(honest.spans['create.runOcMain']!.ms).toBeGreaterThan(0);
    expect(poisoned.records.staged).toBe(0);
    expect(poisoned.spans['create.runOcMain']!.ms).toBeLessThan(honest.spans['create.runOcMain']!.ms / 2);
    expect(poisoned.counters['brep.serialize']).toBeUndefined();
  });

  it('T1: the off arm performs no cache work at all', () => {
    expect(off.lookups).toEqual({ hit: 0, miss: 0, session: 0, cache: 0 });
    expect(off.records.staged).toBe(0);
    expect(off.counters['brep.serialize']).toBeUndefined();
    expect(off.counters['brep.restore']).toBeUndefined();
  });

  it('T1: the off arm still renders the correct geometry', () => {
    // The zero-work baseline is only a baseline if it is also correct.
    expect(off.output.triangles).toBe(honest.output.triangles);
    expect(off.output.geometrySha256).toBe(honest.output.geometrySha256);
  });
});
