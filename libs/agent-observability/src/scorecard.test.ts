import { describe, expect, it } from 'vitest';
import type { Evidence } from '#contract.js';
import type { ProjectedRun, ProjectionContext } from '#projection.js';
import { projectRun } from '#projection.js';
import { phaseDurations, reconcileEvidence, scoreCohort, scorecard } from '#scorecard.js';

const at = Date.parse('2026-10-29T00:00:00.000Z');
const row = (sequence: number, leaderEpoch = 'epoch-a') => ({ chatId: 'chat-1', leaderEpoch, sequence });

/** A completed tool call whose input row is `sequence`, running from `start` to `end` after `at`. */
const tool = (
  call: string,
  sequence: number,
  [start, end]: readonly [number, number],
): ProjectedRun['tools'][number] => ({
  call,
  toolName: 'SYNTHETIC_TOOL',
  outcome: 'completed',
  input: row(sequence),
  output: row(sequence + 1),
  startedAt: at + start,
  settledAt: at + end,
});

const run = (change: Partial<ProjectedRun> = {}): ProjectedRun => ({
  chatId: 'chat-1',
  runId: 'run-1',
  termination: 'completed',
  tools: [tool('call-1', 3, [3000, 5000]), tool('call-2', 5, [4000, 6000])],
  intervals: [
    { phase: 'admission', start: at, end: at + 1000 },
    { phase: 'tool', start: at + 3000, end: at + 5000 },
    { phase: 'tool', start: at + 4000, end: at + 6000 },
  ],
  ending: { source: row(8), at: at + 8000 },
  ...change,
});

const context = (change: Partial<ProjectionContext> = {}): ProjectionContext => ({
  principal: 'user-a',
  project: 'project-a',
  policyEpoch: 'epoch-1',
  protection: 'free',
  uploader: 'device-a',
  ownsEpoch: () => true,
  grantedAt: at,
  hostBuild: 'build-1',
  ...change,
});

const project = async (projected: ProjectedRun, change: Partial<ProjectionContext> = {}): Promise<Evidence[]> => {
  const { evidence } = await projectRun(projected, context(change));
  return [...evidence];
};

describe('scorecard', () => {
  it('counts a run once across uploaders and replays, and never reads content', async () => {
    const first = await project(run({ presentedAt: at + 2000 }));
    const otherDevice = await project(run(), { uploader: 'device-b' });
    const content = { ...first[0]!, payload: { plane: 'content', family: 'tool', stage: 'result', blocks: [] } };

    const card = scorecard([...first, ...otherDevice, ...first, content as Evidence]);

    expect(card.reconciliation).toEqual({ read: 12, duplicates: 7, replicas: 0, conflicts: 0, content: 1 });
    expect(card.runs).toHaveLength(1);
    expect(card.runs[0]).toMatchObject({
      termination: 'completed',
      success: 'unknown',
      tools: { total: 2, byClass: { other: 2 }, byOutcome: { completed: 2 } },
      pattern: 'other',
      presented: true,
      rating: 'none',
      protection: 'free',
      release: 'build-1',
    });
    expect(JSON.stringify(card)).not.toContain('SYNTHETIC_TOOL');
  });

  it('keeps the first claim on a changed identity as a conflict, and a copied fact from another row as a replica', async () => {
    const original = await project(run());
    const changed = original.map((item) =>
      item.semantic.kind === 'outcome' ? { ...item, projection: { ...item.projection, digest: 'f'.repeat(64) } } : item,
    );
    const copied = await project(run({ ending: { source: row(8, 'epoch-b'), at: at + 8000 } }));

    const { reconciliation } = reconcileEvidence([...original, ...changed, ...copied]);

    expect(reconciliation).toMatchObject({ conflicts: 1, duplicates: 4, replicas: 1 });
    expect(scorecard([...original, ...copied]).runs).toHaveLength(1);
  });

  it('times a phase as the union of its intervals in one clock domain, and leaves an open one untimed', async () => {
    const card = scorecard(await project(run()));
    const [score] = card.runs;

    expect(score?.phases).toEqual({ 'admission@host-recorded': 1000, 'tool@host-recorded': 3000 });
    expect(score?.openIntervals).toBe(0);

    expect(
      phaseDurations([
        { phase: 'tool', domain: 'host-recorded', start: 0, end: 10 },
        { phase: 'tool', domain: 'api-recorded', start: 5, end: 10 },
        { phase: 'tool', domain: 'host-recorded', start: 20, end: null },
      ]),
    ).toEqual({ durations: { 'tool@host-recorded': 10, 'tool@api-recorded': 5 }, open: 1 });

    const open = scoreCohort([
      { ...score!, phases: {}, openIntervals: 1 },
      { ...score!, run: 'other' },
    ]);
    expect(open).toMatchObject({ runs: 2, openIntervals: 1, phases: { 'tool@host-recorded': { runs: 1 } } });
  });

  it('reports a run with no outcome fact as unreported, never as completed', async () => {
    const pending = await project(run({ ending: undefined }));
    const toolsOnly = scorecard(pending);

    expect(toolsOnly.runs.map((score) => score.termination)).toEqual(['unreported']);
    expect(toolsOnly.overall.termination).toEqual({ unreported: 1 });
  });

  it('joins a rating to its run and splits cohorts by release and protection', async () => {
    const rated = run({ rating: { value: 'negative', at: at + 9000 } });
    const pro = run({ runId: 'run-2', tools: [], intervals: [], ending: { source: row(20), at: at + 20_000 } });
    const card = scorecard([
      ...(await project(rated)),
      ...(await project(rated, { plane: 'feedback' })),
      ...(await project(pro, { protection: 'pro', hostBuild: 'build-2' })),
    ]);

    expect(card.runs.map((score) => [score.rating, score.protection, score.release])).toEqual([
      ['negative', 'free', 'build-1'],
      ['none', 'pro', 'build-2'],
    ]);
    expect(card.overall.rating).toEqual({ negative: 1, none: 1 });
    expect(Object.keys(card.byRelease)).toEqual(['build-1', 'build-2']);
    expect(card.byProtection['pro']).toMatchObject({ runs: 1, patterns: { none: 1 } });
  });
});
