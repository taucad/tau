import { describe, expect, it } from 'vitest';
import { evidenceSchema } from '#contract.js';
import { compareEvidence, contractId, verifyEvidenceDigest } from '#identity.js';
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

  it('writes byte-identical facts from any uploader, so a replay or another tab counts once', async () => {
    const first = await projectRun(run(), context());
    const second = await projectRun(run(), context({ uploader: 'device-b' }));

    expect(first.evidence.map((evidence, index) => compareEvidence(evidence, second.evidence[index]!))).toEqual([
      'duplicate',
      'duplicate',
    ]);
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
