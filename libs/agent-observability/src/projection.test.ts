import { describe, expect, it } from 'vitest';
import { evidenceSchema } from '#contract.js';
import { compareEvidence, contractId, evidenceKeys, verifyEvidenceDigest } from '#identity.js';
import type { ProjectedRun, ProjectionContext } from '#projection.js';
import { projectRun } from '#projection.js';

const at = Date.parse('2026-10-29T00:00:00.000Z');
const row = (sequence: number, leaderEpoch = 'epoch-a') => ({ chatId: 'chat a/1', leaderEpoch, sequence });

const run = (change: Partial<ProjectedRun> = {}): ProjectedRun => ({
  chatId: 'chat a/1',
  runId: 'run-1',
  termination: 'completed',
  tools: [
    {
      call: 'call-1',
      toolName: 'SYNTHETIC_TOOL_NAME',
      outcome: 'completed',
      input: row(3),
      output: row(4),
      startedAt: at + 3000,
      settledAt: at + 4000,
    },
  ],
  intervals: [
    { phase: 'admission', start: at, end: at + 1000 },
    { phase: 'tool', start: at + 3000, end: at + 4000 },
  ],
  ending: { source: row(6), at: at + 6000 },
  ...change,
});

const context = (change: Partial<ProjectionContext> = {}): ProjectionContext => ({
  principal: 'user-a',
  project: 'project-a',
  policyEpoch: 'epoch-1',
  protection: 'free',
  uploader: 'device-a',
  ownsEpoch: (epoch) => epoch === 'epoch-a',
  grantedAt: at,
  hostBuild: undefined,
  ...change,
});

describe('projectRun', () => {
  it('writes a valid tool and outcome fact that join the API run and carry no names or text', async () => {
    const projection = await projectRun(run(), context());

    expect(projection).toMatchObject({ foreign: 0, beforeGrant: 0, pending: 0 });
    expect(projection.evidence.map((evidence) => evidence.semantic.kind)).toEqual(['tool', 'outcome']);
    // The API names a chat's run the same way, so host and provider facts share it.
    const chatRun = await contractId('chat', 'chat a/1');
    const digests = await Promise.all(projection.evidence.map(async (evidence) => verifyEvidenceDigest(evidence)));
    expect(digests).toEqual([true, true]);
    for (const evidence of projection.evidence) {
      expect(evidenceSchema.safeParse(evidence).success).toBe(true);
      expect(evidence.authority).toBe('host-reported');
      expect(evidence.run).toBe(chatRun);
    }
    expect(JSON.stringify(projection)).not.toContain('SYNTHETIC_TOOL_NAME');
    expect(projection.evidence[0]?.payload).toMatchObject({
      plane: 'summary',
      fact: { kind: 'tool', outcome: 'completed', toolClass: 'other' },
    });
    expect(projection.evidence[1]?.clocks.intervals).toEqual([
      { phase: 'admission', domain: 'host-recorded', start: at, end: at + 1000 },
    ]);
  });

  describe('test_model checks', () => {
    const check: NonNullable<ProjectedRun['tools'][number]['check']> = {
      result: 'passed',
      revision: [`SYNTHETIC_ENTRY\u0000SYNTHETIC_PATH=sha256:${'a'.repeat(64)}`],
      requirements: ['SYNTHETIC_SPEC#1', 'SYNTHETIC_SPEC#2'],
    };
    const checked = (change: Partial<typeof check> = {}) =>
      run({ tools: [{ ...run().tools[0]!, check: { ...check, ...change } }] });

    it('writes a cad fact from the output row that names the check only by digest', async () => {
      const projection = await projectRun(checked(), context());

      expect(projection.evidence.map((evidence) => evidence.semantic.kind)).toEqual(['tool', 'cad', 'outcome']);
      const cad = projection.evidence[1]!;
      expect(evidenceSchema.safeParse(cad).success).toBe(true);
      expect(await verifyEvidenceDigest(cad)).toBe(true);
      expect(cad.source).toMatchObject({ kind: 'row', sequence: 4 });
      expect(cad.payload).toMatchObject({
        plane: 'summary',
        fact: { kind: 'cad', result: 'passed', exportRequested: false, artifact: null },
      });
      /* The run's success stays unknown: a passed check decides its requirements, not the task. */
      expect(projection.evidence[2]?.payload).toMatchObject({ fact: { kind: 'outcome', success: 'unknown' } });
      for (const text of ['SYNTHETIC_ENTRY', 'SYNTHETIC_PATH', 'SYNTHETIC_SPEC']) {
        expect(JSON.stringify(projection)).not.toContain(text);
      }
    });

    it('names a different requirement set or revision differently, and the same one identically', async () => {
      const fact = async (change: Partial<typeof check>) => {
        const projection = await projectRun(checked(change), context());
        return projection.evidence[1]?.payload.plane === 'summary' ? projection.evidence[1].payload.fact : undefined;
      };
      const base = await fact({});
      const fewer = await fact({ requirements: ['SYNTHETIC_SPEC#1'] });
      const edited = await fact({ revision: [`SYNTHETIC_ENTRY\u0000SYNTHETIC_PATH=sha256:${'b'.repeat(64)}`] });

      expect(await fact({})).toEqual(base);
      expect(fewer).toMatchObject({ sourceRevision: (base as { sourceRevision: string }).sourceRevision });
      expect(fewer).not.toMatchObject({ requirement: (base as { requirement: string }).requirement });
      expect(edited).not.toMatchObject({ sourceRevision: (base as { sourceRevision: string }).sourceRevision });
    });

    it('writes nothing for a check that named no revision', async () => {
      const projection = await projectRun(checked({ revision: [] }), context());

      expect(projection.evidence.map((evidence) => evidence.semantic.kind)).toEqual(['tool', 'outcome']);
    });
  });

  it('writes byte-identical facts from any uploader, so a replay or another tab counts once', async () => {
    const first = await projectRun(run(), context());
    const second = await projectRun(run(), context({ uploader: 'device-b' }));

    expect(first.evidence.map((evidence, index) => compareEvidence(evidence, second.evidence[index]!))).toEqual([
      'duplicate',
      'duplicate',
    ]);
  });

  it('reports the UI’s first showing of a run’s text as this device’s interaction, apart from every row fact', async () => {
    const projection = await projectRun(run({ presentedAt: at + 2500 }), context());

    expect(projection.evidence.map((evidence) => evidence.semantic.kind)).toEqual(['tool', 'outcome', 'response']);
    const presented = projection.evidence[2]!;
    expect(evidenceSchema.safeParse(presented).success).toBe(true);
    expect(await verifyEvidenceDigest(presented)).toBe(true);
    expect(presented.source).toMatchObject({
      kind: 'interaction',
      interaction: await contractId('presented', 'chat a/1:run-1'),
    });
    expect(presented.delivery.cursor.view).toBe('interaction');
    expect(presented.clocks).toMatchObject({ occurredAt: at + 2500, intervals: [] });
    expect(presented.payload).toEqual({
      plane: 'summary',
      fact: { kind: 'response', action: 'presented', evidence: await contractId('run', 'run-1') },
    });
    /* The row facts are those a device that never showed the run writes. */
    const unseen = await projectRun(run(), context({ uploader: 'device-b' }));
    expect(
      projection.evidence.slice(0, 2).map((evidence, index) => compareEvidence(evidence, unseen.evidence[index]!)),
    ).toEqual(['duplicate', 'duplicate']);
  });

  it('writes a rating only on the feedback plane, as this device’s interaction, with no row fact beside it', async () => {
    const rated = run({ rating: { value: 'negative', at: at + 7000 } });
    const feedback = await projectRun(rated, context({ plane: 'feedback' }));
    const summary = await projectRun(rated, context());

    expect(feedback).toMatchObject({ foreign: 0, foreignTails: [], beforeGrant: 0, pending: 0 });
    expect(feedback.evidence).toHaveLength(1);
    const [rating] = feedback.evidence;
    expect(evidenceSchema.safeParse(rating).success).toBe(true);
    expect(await verifyEvidenceDigest(rating!)).toBe(true);
    expect(rating!.source).toMatchObject({
      kind: 'interaction',
      interaction: await contractId('rated', 'rated:chat a/1:run-1'),
    });
    expect(rating!.payload).toEqual({
      plane: 'feedback',
      fact: { kind: 'rating', scale: 'thumbs.1', value: 'negative', evidence: await contractId('run', 'run-1') },
    });
    expect(summary.evidence.map((evidence) => evidence.payload.plane)).toEqual(['summary', 'summary']);
    expect(await projectRun(run(), context({ plane: 'feedback' }))).toMatchObject({ evidence: [], pending: 0 });
    expect(
      await projectRun(
        run({ rating: { value: 'positive', at: at + 7000 }, ending: undefined }),
        context({ plane: 'feedback' }),
      ),
    ).toMatchObject({ evidence: [], pending: 1 });
  });

  it('keeps a shown run’s rating and presentation as separate sources, whatever the ids look like', async () => {
    const shown = run({ chatId: 'chat_1', presentedAt: at + 2500, rating: { value: 'negative', at: at + 7000 } });
    const summary = await projectRun(shown, context());
    const feedback = await projectRun(shown, context({ plane: 'feedback' }));
    const presentation = summary.evidence.find((evidence) => evidence.semantic.kind === 'response');
    const [rating] = feedback.evidence;

    expect(rating!.source).toMatchObject({ kind: 'interaction', interaction: 'rated:chat_1:run-1' });
    expect(evidenceKeys(rating!).source).not.toBe(evidenceKeys(presentation!).source);
    expect(compareEvidence(presentation!, rating!)).not.toBe('conflict');
  });

  it('holds a presentation back until the run ends, and never sends one shown before the grant', async () => {
    const open = await projectRun(run({ presentedAt: at + 2500, ending: undefined, tools: [] }), context());
    const early = await projectRun(run({ presentedAt: at - 1 }), context());

    expect(open).toMatchObject({ evidence: [], pending: 2 });
    expect(early.evidence.map((evidence) => evidence.semantic.kind)).toEqual(['tool', 'outcome']);
    expect(early.beforeGrant).toBe(1);
  });

  it('holds a tool call back until its output or the run’s ending, then reports it unknown', async () => {
    const open = run({
      tools: [{ ...run().tools[0]!, output: undefined, settledAt: undefined, outcome: 'unknown' }],
      ending: undefined,
      termination: 'unknown',
    });

    expect(await projectRun(open, context())).toMatchObject({ evidence: [], pending: 2 });

    const ended = await projectRun({ ...open, ending: { source: row(6), at: at + 6000 } }, context());
    expect(ended.evidence[0]).toMatchObject({
      coverage: { events: 'missing' },
      payload: { fact: { kind: 'tool', outcome: 'unknown' } },
    });
  });

  it('leaves another device’s rows to it and never backfills what happened before the grant', async () => {
    const foreign = await projectRun(run({ ending: { source: row(6, 'epoch-b'), at: at + 6000 } }), context());
    expect(foreign).toMatchObject({ foreign: 1 });
    expect(foreign.evidence.map((evidence) => evidence.semantic.kind)).toEqual(['tool']);

    const late = await projectRun(run(), context({ grantedAt: at + 5000 }));
    expect(late).toMatchObject({ beforeGrant: 1 });
    expect(late.evidence.map((evidence) => evidence.semantic.kind)).toEqual(['outcome']);
  });

  it('reports each foreign epoch it read, by its contract id, and flags an unended run whose tail is elsewhere', async () => {
    const epochB = await contractId('epoch', 'epoch-b');
    const own = await projectRun(run({ sources: [row(1), row(3), row(4), row(6)] }), context());
    expect(own.foreignTails).toEqual([]);

    const handedOff = await projectRun(
      run({
        ending: { source: row(6, 'epoch-b'), at: at + 6000 },
        sources: [row(1), row(3), row(4), row(6, 'epoch-b')],
      }),
      context(),
    );
    expect(handedOff.foreignTails).toEqual([{ epoch: epochB, facts: 1, through: 6, open: false }]);

    const takenOver = await projectRun(
      run({ ending: undefined, termination: 'unknown', sources: [row(1), row(3), row(4), row(2, 'epoch-b')] }),
      context(),
    );
    expect(takenOver).toMatchObject({
      pending: 1,
      foreignTails: [{ epoch: epochB, facts: 0, through: 2, open: true }],
    });
  });
});
