/**
 * Compute reuse qualification, CI subset (audit R5; program invariant I1).
 *
 * Runs the qualification harness (`harness/qualify-arm.mts`) on the CI models in fresh processes and asserts
 * what is deterministic on any machine:
 * - reuse off renders the pinned GLB bytes on every matrix step (the byte-parity reference);
 * - reuse on renders the same bytes as reuse off on every step, after a back-to-back scrub, in the agent's
 *   fresh lifecycle and across ten randomized cache histories (memory and durable stores);
 * - the multi-thread WASM build renders the same bytes as the single-thread build;
 * - an edit that supersedes a running build (worker transport) renders the reuse-off bytes of the committed
 *   value; how long the superseded build kept running is recorded as data only;
 * - the work per step (model runs, tessellations, store writes) equals the pinned counts.
 *
 * Timings are recorded by the full campaign (`pnpm nx compute-qualify runtime-e2e`) as data, never asserted
 * here. A change that moves a pinned hash or count fails this suite on purpose: it is updated only together
 * with the change that explains it, never regenerated to turn the suite green.
 */
import { readFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { QualifyCounts, QualifyOptions, QualifyReport } from '#compute-baseline/qualification-runner.js';
import { qualifyScratch, runQualifyArm } from '#compute-baseline/qualification-runner.js';

type ScenarioCounts = {
  readonly matrix?: readonly QualifyCounts[];
  readonly scrub?: readonly QualifyCounts[];
  readonly agent?: readonly QualifyCounts[];
};

type ModelPins = {
  readonly off: {
    readonly matrix: ReadonlyArray<{
      readonly token: string;
      readonly sha256: string;
      readonly triangles: number;
    }>;
    readonly scrub: ReadonlyArray<{
      readonly phase: string;
      readonly sha256: string;
    }>;
  };
  readonly counts: Readonly<Record<string, ScenarioCounts>>;
};

type Pins = {
  readonly campaign: string;
  readonly models: Readonly<Record<string, ModelPins>>;
};

const pins = JSON.parse(readFileSync(join(import.meta.dirname, 'qualification-baselines.json'), 'utf8')) as Pins;

/**
 * The cheap subset: a parameter-edit model and a pose-edit model of the seven-model matrix, and the
 * retained-operand fixture (booleans on operands the model keeps using) for the history gate.
 */
const ciModels = ['gridfinity-box', 'six-axis-arm', 'retained-operand'] as const;

const historyCount = 10;

/** Run arms two at a time: each is its own process with its own kernel. */
const runAll = async (options: readonly QualifyOptions[], workspace: string): Promise<QualifyReport[]> => {
  const reports: QualifyReport[] = [];
  for (let start = 0; start < options.length; start += 2) {
    // oxlint-disable-next-line no-await-in-loop -- bounded concurrency: two processes at a time.
    const batch = await Promise.all(
      options.slice(start, start + 2).map(async (option) => runQualifyArm(option, workspace)),
    );
    reports.push(...batch);
  }

  return reports;
};

const hashes = (report: QualifyReport): Array<string | undefined> => report.steps.map((step) => step.output?.sha256);
const counts = (report: QualifyReport): QualifyCounts[] => report.steps.map((step) => step.counts);

describe.each(ciModels)('compute reuse qualification: %s', (model) => {
  const modelPins = pins.models[model]!;
  let workspace: string;
  let reports: Record<string, QualifyReport>;

  beforeAll(async () => {
    workspace = await qualifyScratch(model);
    const options: QualifyOptions[] = [
      { model, arm: 'off', scenario: 'matrix' },
      { model, arm: 'memory', scenario: 'matrix' },
      { model, arm: 'off', scenario: 'scrub' },
      { model, arm: 'memory', scenario: 'scrub' },
      { model, arm: 'off', scenario: 'agent' },
      { model, arm: 'memory', scenario: 'agent' },
      {
        model,
        arm: 'memory',
        scenario: 'history',
        histories: historyCount,
        seed: 1,
      },
      {
        model,
        arm: 'durable',
        scenario: 'history',
        histories: historyCount,
        seed: 2,
      },
      { model, arm: 'off', scenario: 'matrix', wasm: 'multi' },
      { model, arm: 'off', scenario: 'abort' },
      { model, arm: 'memory', scenario: 'abort' },
    ];
    const results = await runAll(options, workspace);
    reports = Object.fromEntries(
      results.map((report, index) => [
        `${report.scenario}.${report.arm}${options[index]!.wasm === 'multi' ? '.multi' : ''}`,
        report,
      ]),
    );
  }, 1_800_000);

  afterAll(async () => {
    if (workspace) {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  /** Reuse-off bytes per geometry, from the matrix run. */
  const offByGeometry = (): Map<string, string> => {
    const map = new Map<string, string>();
    for (const step of reports['matrix.off']!.steps) {
      if (step.geometry && step.output?.sha256) {
        map.set(step.geometry, step.output.sha256);
      }
    }

    return map;
  };

  it('should render the pinned reuse-off bytes on every matrix step', () => {
    expect(hashes(reports['matrix.off']!)).toEqual(modelPins.off.matrix.map((step) => step.sha256));
  });

  it('should render a comment-only edit as the base bytes and a literal edit as different bytes', () => {
    const { steps } = reports['matrix.off']!;
    const base = steps.find((step) => step.token === 'base')!.output!.sha256;
    expect(steps.find((step) => step.token === 'comment')!.output!.sha256).toBe(base);
    expect(steps.find((step) => step.token === 'literal')!.output!.sha256).not.toBe(base);
  });

  it('should render every matrix step with reuse on byte-equal to reuse off', () => {
    expect(hashes(reports['matrix.memory']!)).toEqual(hashes(reports['matrix.off']!));
  });

  it('should keep the GLB bytes independent of cache history in memory and durable stores', () => {
    const reference = offByGeometry();
    for (const arm of ['memory', 'durable']) {
      const report = reports[`history.${arm}`]!;
      const rendered = report.steps.filter((step) => step.output?.sha256);
      expect(new Set(rendered.map((step) => step.history)).size).toBe(historyCount);
      const mismatches = rendered
        .filter((step) => step.output!.sha256 !== reference.get(step.geometry!))
        .map((step) => `${arm} history ${step.history} ${step.phase} ${step.token}`);
      expect(mismatches).toEqual([]);
    }
  });

  it('should end a back-to-back scrub and its revisit on the reuse-off bytes', () => {
    expect(hashes(reports['scrub.off']!)).toEqual(modelPins.off.scrub.map((step) => step.sha256));
    expect(hashes(reports['scrub.memory']!)).toEqual(hashes(reports['scrub.off']!));
  });

  it('should render the agent loop in the fresh lifecycle byte-equal to reuse off and to the live document', () => {
    expect(hashes(reports['agent.memory']!)).toEqual(hashes(reports['agent.off']!));
    const live = offByGeometry().get('base');
    const uiCalls = reports['agent.memory']!.steps.filter((step) => step.content === 'ui');
    expect(uiCalls.map((step) => step.output!.sha256)).toEqual(uiCalls.map(() => live));
  });

  it.each(['off', 'memory'])('should do the pinned work per step with reuse %s', (arm) => {
    const pinned = modelPins.counts[arm]!;
    expect(counts(reports[`matrix.${arm}`]!)).toEqual(pinned.matrix);
    expect(counts(reports[`scrub.${arm}`]!)).toEqual(pinned.scrub);
    expect(counts(reports[`agent.${arm}`]!)).toEqual(pinned.agent);
  });

  it('should render the multi-thread WASM build byte-equal to the single-thread build', () => {
    expect(hashes(reports['matrix.off.multi']!)).toEqual(hashes(reports['matrix.off']!));
  });

  it('should render the committed value of an edit that superseded a running build', () => {
    // Which build the supersede lands in depends on timing; the bytes of the committed value do not.
    expect(hashes(reports['abort.memory']!)).toEqual(hashes(reports['abort.off']!));
    const trials = reports['abort.off']!.steps.filter((step) => step.phase === 'supersede');
    expect(trials.length).toBeGreaterThan(0);
  });

  it('should start the committed edit soon after it superseded a running build or render', () => {
    // P9c, worker transport. The arm supersedes main() as it starts on odd trials and the render as its GLB pack starts
    // on even ones: the worker holds at the end of the phase before until the supersede is issued, so both phases are
    // sampled on every machine and the pack's first poll already sees the abort, even for a one-part model
    // (gridfinity-box). The pack makes no OCCT call and polls the abort word before each part and before writing:
    // without those polls the superseded render runs to its end and is delivered. The 500 ms bound is ten times the heavy-model worst case (16 to 49 ms on planetary-gear-system's
    // 20 s faceWidth build), below the 0.7 to 0.9 s a whole stale render adds there.
    const trials = ['abort.off', 'abort.memory'].flatMap((key) =>
      reports[key]!.steps.flatMap((step) => (step.phase === 'supersede' && step.abort ? [step.abort] : [])),
    );
    for (const target of ['main', 'pack'] as const) {
      const placed = trials.filter((trial) => trial.target === target);
      expect(placed.length, target).toBeGreaterThan(0);
      for (const trial of placed) {
        expect(trial.valid, JSON.stringify(trial)).toBe(true);
        expect(trial.nextBuildAfterIssue, JSON.stringify(trial)).toBeLessThan(500);
        if (target === 'pack') {
          expect(trial.supersededRender, JSON.stringify(trial)).toBe('cancelled');
        }
      }
    }
  });

  it('should do no compute store work with reuse off', () => {
    for (const scenario of ['matrix', 'scrub', 'agent']) {
      expect(reports[`${scenario}.off`]!.steps.every((step) => step.counts.storeWrites === 0)).toBe(true);
    }
  });
});

/**
 * Audit F12: with the text-BRep operation adapter on, spur-gearbox rendered different bytes from reuse off on every
 * rebuilt step, a comment-only edit included, and the bytes depended on what the cache held. The live tier replaced
 * the adapter and is on whenever compute reuse is, so reuse on must render the reuse-off bytes here as everywhere else.
 */
describe('compute reuse qualification: spur-gearbox matrix parity', () => {
  const model = 'spur-gearbox';
  let workspace: string;
  let off: QualifyReport;
  let memory: QualifyReport;

  beforeAll(async () => {
    workspace = await qualifyScratch(model);
    const results = await runAll(
      [
        { model, arm: 'off', scenario: 'matrix' },
        { model, arm: 'memory', scenario: 'matrix' },
      ],
      workspace,
    );
    off = results[0]!;
    memory = results[1]!;
  }, 1_800_000);

  afterAll(async () => {
    if (workspace) {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it('should render the pinned reuse-off bytes on every matrix step', () => {
    expect(hashes(off)).toEqual(pins.models[model]!.off.matrix.map((step) => step.sha256));
  });

  it('should render every matrix step with reuse on byte-equal to reuse off', () => {
    expect(hashes(memory)).toEqual(hashes(off));
  });
});
