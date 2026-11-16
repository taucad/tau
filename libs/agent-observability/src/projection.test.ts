import { describe, expect, it, vi } from 'vitest';
import { evidenceSchema } from '#contract.js';
import type { Evidence } from '#contract.js';
import { compareEvidence, contractId, evidenceKeys, sha256Hex, verifyEvidenceDigest } from '#identity.js';
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
      fact: { kind: 'tool', name: 'external-tool', outcome: 'completed', toolClass: 'other' },
    });
    expect(projection.evidence[1]?.clocks.intervals).toEqual([
      { phase: 'admission', domain: 'host-recorded', start: at, end: at + 1000 },
    ]);
  });

  it('names the model call a tool came from as the API names that attempt, and none when the host did not see it', async () => {
    const attemptId = 'run a:1:0';
    const projection = await projectRun(run({ tools: [{ ...run().tools[0]!, modelCall: attemptId }] }), context());

    expect(projection.evidence.map((evidence) => evidence.payload)).toMatchObject([
      { fact: { kind: 'tool', modelCall: await contractId('inv', attemptId) } },
      { fact: { kind: 'outcome' } },
    ]);
    const unseen = await projectRun(run(), context());
    expect(unseen.evidence[0]?.payload).toMatchObject({ fact: { modelCall: null } });
  });

  it('names a first-party tool and its class, and any other tool only as external-tool (LQ5)', async () => {
    const named = async (toolName: string) => {
      const projection = await projectRun(run({ tools: [{ ...run().tools[0]!, toolName }] }), context());
      expect(evidenceSchema.safeParse(projection.evidence[0]).success).toBe(true);
      return projection;
    };

    const edit = await named('edit_file');
    expect(edit.evidence[0]?.payload).toMatchObject({
      fact: { kind: 'tool', name: 'edit_file', toolClass: 'write' },
    });
    const test = await named('test_model');
    expect(test.evidence[0]?.payload).toMatchObject({ fact: { name: 'test_model', toolClass: 'verification' } });
    const external = await named('mcp__SYNTHETIC_SERVER__lookup');
    expect(external.evidence[0]?.payload).toMatchObject({ fact: { name: 'external-tool', toolClass: 'other' } });
    expect(JSON.stringify(external)).not.toContain('SYNTHETIC_SERVER');
    expect(external.evidence[0]?.versions.mapper).toBe('host-turn-v5');
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
      /* The run completed and its only check, at the final revision, passed: the rule decides it verified. */
      expect(projection.evidence[2]?.payload).toMatchObject({
        fact: { kind: 'outcome', success: 'verified', assessment: 'cad-checks-v1' },
      });
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

  describe('the cad-checks-v1 assessor (LW7)', () => {
    /* A tool call at row `startedAt`, `startedAt` seconds into the run, with its check's result when it ran one. */
    const tool = (
      [call, toolName, startedAt]: readonly [call: string, toolName: string, startedAt: number],
      check?: 'passed' | 'failed' | 'inconclusive',
    ): ProjectedRun['tools'][number] => ({
      call,
      toolName,
      outcome: 'completed',
      input: row(startedAt),
      output: row(startedAt + 1),
      startedAt: at + startedAt * 1000,
      settledAt: at + startedAt * 1000 + 500,
      ...(check === undefined
        ? {}
        : { check: { result: check, revision: [`m\u0000m=sha256:${'a'.repeat(64)}`], requirements: [] } }),
    });
    const success = async (change: Partial<ProjectedRun>) => {
      const projection = await projectRun(run(change), context());
      const outcome = projection.evidence.find((evidence) => evidence.semantic.kind === 'outcome')!;
      expect(evidenceSchema.safeParse(outcome).success).toBe(true);
      return outcome.payload.plane === 'summary' && outcome.payload.fact.kind === 'outcome'
        ? { success: outcome.payload.fact.success, assessment: outcome.payload.fact.assessment }
        : undefined;
    };
    const verified = { success: 'verified', assessment: 'cad-checks-v1' };
    const failed = { success: 'failed', assessment: 'cad-checks-v1' };
    const unknown = { success: 'unknown', assessment: null };

    it('decides a completed run whose checks at the final revision all passed verified', async () => {
      expect(
        await success({ tools: [tool(['c1', 'edit_file', 3]), tool(['c2', 'test_model', 10], 'passed')] }),
      ).toEqual(verified);
    });

    it('decides a completed run failed when a check at the final revision failed', async () => {
      expect(
        await success({
          tools: [tool(['c1', 'test_model', 3], 'passed'), tool(['c2', 'test_model', 10], 'failed')],
        }),
      ).toEqual(failed);
    });

    it('judges only the checks after the last edit, so an earlier failure that was fixed does not count', async () => {
      expect(
        await success({
          tools: [
            tool(['c1', 'test_model', 3], 'failed'),
            tool(['c2', 'edit_file', 10]),
            tool(['c3', 'test_model', 20], 'passed'),
          ],
        }),
      ).toEqual(verified);
    });

    it('ignores a todo or workbench update after the last check, which changes no model file', async () => {
      expect(
        await success({
          tools: [
            tool(['c1', 'edit_file', 3]),
            tool(['c2', 'test_model', 10], 'passed'),
            tool(['c3', 'update_todos', 20]),
            tool(['c4', 'arrange_workbench', 30]),
          ],
        }),
      ).toEqual(verified);
    });

    it('cannot decide a run with no check, no check after its last edit, or no decided check', async () => {
      expect(await success({ tools: [tool(['c1', 'edit_file', 3])] })).toEqual(unknown);
      expect(
        await success({ tools: [tool(['c1', 'test_model', 3], 'passed'), tool(['c2', 'edit_file', 10])] }),
      ).toEqual(unknown);
      expect(await success({ tools: [tool(['c1', 'test_model', 3], 'inconclusive')] })).toEqual(unknown);
    });

    it('decides nothing for a run that did not complete, whatever its checks said', async () => {
      for (const termination of ['failed', 'cancelled', 'abandoned', 'unknown'] as const) {
        // oxlint-disable-next-line no-await-in-loop -- one termination at a time keeps the failure readable
        expect(await success({ termination, tools: [tool(['c1', 'test_model', 3], 'passed')] })).toEqual(unknown);
      }
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

  it('cites each committed row with one digest, whichever fact cites it, so admission keeps every fact', async () => {
    const tool = run().tools[0]!;
    const shown = run({
      presentedAt: at + 2500,
      rating: { value: 'positive', at: at + 7000 },
      tools: [{ ...tool, check: { result: 'passed', revision: [`ENTRY=sha256:${'a'.repeat(64)}`], requirements: [] } }],
    });
    const summary = await projectRun(shown, context());
    const feedback = await projectRun(shown, context({ plane: 'feedback' }));
    const cited = [...summary.evidence, ...feedback.evidence].flatMap((evidence) => evidence.lineage);
    const digests = new Map<string, Set<string>>();
    for (const item of cited) {
      digests.set(item.source, (digests.get(item.source) ?? new Set()).add(item.digest));
    }

    /* The tool and its check share rows 3 and 4; the outcome, presentation and rating share the ending row 6. */
    expect(cited).toHaveLength(7);
    expect(digests.size).toBe(3);
    expect([...digests.values()].map((held) => held.size)).toEqual([1, 1, 1]);
    /* The fact's own source digest still differs per fact. */
    expect(new Set(summary.evidence.map((evidence) => evidence.source.digest)).size).toBe(summary.evidence.length);
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
    /* An outcome after the grant carries no phase time from before it. */
    expect(late.evidence[0]?.clocks.intervals).toEqual([]);
  });

  it('clips an outcome’s phases at the grant, so a run that began before it reports only the time since', async () => {
    const projection = await projectRun(
      run({ intervals: [{ phase: 'approval', start: at, end: at + 2000 }] }),
      context({ grantedAt: at + 500 }),
    );

    expect(projection.evidence.at(-1)?.clocks.intervals).toEqual([
      { phase: 'approval', domain: 'host-recorded', start: at + 500, end: at + 2000 },
    ]);
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

  it('names a failed run’s ending code, the wrapped one first, with its owner and retry class (W5)', async () => {
    const outcomeOf = async (failure: NonNullable<ProjectedRun['ending']>['failure']) => {
      const projection = await projectRun(
        run({ termination: 'failed', ending: { source: row(6), at: at + 6000, failure } }),
        context(),
      );
      const evidence = projection.evidence.find((item) => item.semantic.kind === 'outcome')!;
      expect(evidenceSchema.safeParse(evidence).success).toBe(true);
      expect(evidence.versions.mapper).toBe('host-turn-v5');
      return evidence.payload.plane === 'summary' ? evidence.payload.fact : undefined;
    };

    expect(await outcomeOf({ code: 'RUN_ABANDONED', wrapped: 'MODEL_ATTEMPT_PENDING' })).toEqual({
      kind: 'outcome',
      termination: 'failed',
      success: 'unknown',
      assessment: null,
      failureClass: { owner: 'host', retry: 'wait' },
      code: 'MODEL_ATTEMPT_PENDING',
      turn: {
        startRevision: null,
        finalRevision: null,
        filesChanged: 0,
        checksPassed: 0,
        checksFailed: 0,
        priorTurns: 0,
        modelCalls: 0,
        toolCalls: 1,
        host: null,
        kernel: null,
        model: null,
      },
    });
    expect(await outcomeOf({ code: 'INSUFFICIENT_CREDIT', wrapped: undefined })).toMatchObject({
      failureClass: { owner: 'gateway', retry: 'resume' },
      code: 'INSUFFICIENT_CREDIT',
    });
    /* A code this build does not know reads as the registry's unknown entry; one that is not a code is not sent. */
    expect(await outcomeOf({ code: 'A_NEWER_CODE', wrapped: undefined })).toMatchObject({
      failureClass: { owner: 'unknown', retry: 'never' },
      code: 'A_NEWER_CODE',
    });
    const malformed = await outcomeOf({ code: 'not a code: user text', wrapped: undefined });
    expect(malformed).toMatchObject({ failureClass: { owner: 'unknown', retry: 'never' } });
    expect(malformed).not.toHaveProperty('code');
    const uncoded = await outcomeOf(undefined);
    expect(uncoded).not.toHaveProperty('failureClass');
    expect(uncoded).not.toHaveProperty('code');
  });
});

describe('projectRun with the content grant (LW6)', () => {
  const revision = 'rev-final';
  const contentRun = (change: Partial<ProjectedRun> = {}): ProjectedRun =>
    run({
      tools: [
        {
          ...run().tools[0]!,
          toolName: 'edit_file',
          arguments: { targetFile: 'main.ts', content: 'cube(10)' },
          result: 'Edited main.ts',
        },
        {
          call: 'call-2',
          toolName: 'test_model',
          outcome: 'completed',
          input: row(4),
          output: row(5),
          startedAt: at + 4000,
          settledAt: at + 5000,
          arguments: { targetFile: 'main.ts' },
          result: { tests: [] },
          check: { result: 'passed', revision: ['main.ts\u0000main.ts=sha256:x'], requirements: ['spec.ts#1'] },
        },
      ],
      finalRevision: revision,
      filesChanged: 1,
      priorTurns: 2,
      invocations: [
        { purpose: 'generation', modelId: 'anthropic/model-a' },
        { purpose: 'compaction', modelId: 'anthropic/model-a' },
        { purpose: 'generation', modelId: 'anthropic/model-b' },
      ],
      content: {
        prompt: [{ type: 'text', text: 'Make a 10 mm cube' }],
        reply: [
          { type: 'thinking', thinking: 'SYNTHETIC_THOUGHT' },
          { type: 'text', text: 'Made the cube.' },
        ],
        changedPaths: ['main.ts'],
      },
      ...change,
    });
  const design = vi.fn(async () => [{ path: 'main.ts', text: 'export default cube(10);', bytes: 24 }]);
  const granted = (change: Partial<ProjectionContext> = {}) =>
    context({ content: { since: at, design }, host: 'browser', ...change });
  const sections = (evidence: Evidence | undefined) => {
    if (evidence?.payload.plane !== 'content') {
      throw new Error(`expected content, got ${evidence?.payload.plane}`);
    }
    return evidence.payload;
  };
  const outcomeOf = (projection: Awaited<ReturnType<typeof projectRun>>) =>
    projection.evidence.find((evidence) => evidence.semantic.kind === 'outcome');

  it('writes the root’s message in, and reply, design read at the final revision and check lines out', async () => {
    const projection = await projectRun(contentRun(), granted());
    const outcome = outcomeOf(projection)!;
    const payload = sections(outcome);

    expect(evidenceSchema.safeParse(outcome).success).toBe(true);
    expect(await verifyEvidenceDigest(outcome)).toBe(true);
    expect(outcome.projection.redactor).toBe('content-v1');
    expect(design).toHaveBeenCalledWith({ revision, paths: ['main.ts'] });
    expect(payload.input?.messages).toEqual([
      {
        role: 'user',
        parts: [{ kind: 'text', text: 'Make a 10 mm cube', originalBytes: 17, retainedBytes: 17, redaction: 'none' }],
      },
    ]);
    expect(payload.output?.messages).toHaveLength(1);
    expect(payload.output?.messages[0]?.parts).toMatchObject([
      { kind: 'text', text: 'Made the cube.' },
      { kind: 'source', path: 'main.ts', text: 'export default cube(10);', digest: null },
      { kind: 'check', result: 'passed', text: 'test_model passed: spec.ts#1' },
    ]);
    expect(JSON.stringify(outcome)).not.toContain('SYNTHETIC_THOUGHT');
    /* The same fact and source as the summary, so a call is one fact whichever plane carries it. */
    const summary = outcomeOf(await projectRun(contentRun(), context({ host: 'browser' })))!;
    expect(summary.payload).toMatchObject({ plane: 'summary', fact: payload.fact });
    expect(summary.source).toEqual(outcome.source);
    expect(compareEvidence(summary, outcome)).toBe('projection');
  });

  it('counts what the run did on its outcome, as digests and closed labels, under either plane', async () => {
    const outcome = outcomeOf(await projectRun(contentRun(), context({ host: 'desktop' })))!;

    expect(outcome.payload).toMatchObject({
      plane: 'summary',
      fact: {
        turn: {
          startRevision: null,
          finalRevision: await sha256Hex(JSON.stringify(['host-revision', revision])),
          filesChanged: 1,
          checksPassed: 1,
          checksFailed: 0,
          priorTurns: 2,
          modelCalls: 2,
          toolCalls: 2,
          host: 'desktop',
          kernel: null,
          model: await contractId('model', 'anthropic/model-b'),
        },
      },
    });
    expect(JSON.stringify(outcome)).not.toContain(revision);
  });

  it('names the kernel the run targeted on its outcome (LW17)', async () => {
    const outcome = outcomeOf(await projectRun({ ...contentRun(), kernel: 'replicad' }, context({ host: 'browser' })))!;

    expect(outcome.payload).toMatchObject({ plane: 'summary', fact: { turn: { kernel: 'replicad' } } });
  });

  it('labels each tool with the host, kernel and model its run names on its outcome (LW17)', async () => {
    const projection = await projectRun({ ...contentRun(), kernel: 'replicad' }, context({ host: 'browser' }));
    const tools = projection.evidence.filter((item) => item.semantic.kind === 'tool');
    const labels = { host: 'browser', kernel: 'replicad', model: await contractId('model', 'anthropic/model-b') };

    expect(tools).toHaveLength(2);
    for (const tool of tools) {
      expect(evidenceSchema.safeParse(tool).success).toBe(true);
      expect(tool.payload).toMatchObject({ plane: 'summary', fact: { kind: 'tool', labels } });
    }
    const outcome = outcomeOf(projection)!;
    expect(outcome.payload).toMatchObject({ fact: { turn: labels } });
  });

  it('writes a tool’s arguments in and its result out, and nothing of either without the grant', async () => {
    const granted_ = await projectRun(contentRun(), granted());
    const [edit] = granted_.evidence;
    const payload = sections(edit);

    expect(evidenceSchema.safeParse(edit).success).toBe(true);
    expect(payload.input?.messages).toMatchObject([
      {
        role: 'assistant',
        parts: [{ kind: 'tool-call', name: 'edit_file', text: '{"targetFile":"main.ts","content":"cube(10)"}' }],
      },
    ]);
    expect(payload.output?.messages).toMatchObject([
      { role: 'tool', parts: [{ kind: 'tool-result', error: false, digest: null, text: 'Edited main.ts' }] },
    ]);
    expect(edit?.coverage).toMatchObject({ input: 'complete', output: 'complete' });

    const ungranted = await projectRun(contentRun(), context());
    expect(ungranted.evidence.every((evidence) => evidence.payload.plane === 'summary')).toBe(true);
    for (const text of ['cube(10)', 'Edited main.ts', 'Make a 10 mm cube', 'Made the cube.']) {
      expect(JSON.stringify(ungranted)).not.toContain(text);
    }
  });

  it('keeps only the size and digest of a tool result over 64 KiB, and an image result as its type and size', async () => {
    const large = 'x'.repeat(70_000);
    const image = 'A'.repeat(4000);
    const projection = await projectRun(
      contentRun({
        tools: [
          { ...contentRun().tools[0]!, result: large },
          {
            ...contentRun().tools[0]!,
            call: 'call-3',
            toolName: 'screenshot',
            input: row(7),
            output: row(8),
            result: [
              { type: 'text', text: 'Captured' },
              { type: 'image', mimeType: 'image/png', data: image },
            ],
          },
        ],
      }),
      granted(),
    );
    const [over, shot] = projection.evidence;

    expect(sections(over).output?.messages[0]?.parts[0]).toEqual({
      kind: 'tool-result',
      call: await contractId('call', 'chat a/1:call-1'),
      error: false,
      digest: await sha256Hex(large),
      text: '',
      originalBytes: 70_000,
      retainedBytes: 0,
      redaction: 'truncated',
    });
    expect(over?.coverage.output).toBe('truncated');
    expect(sections(shot).output?.messages[0]?.parts).toEqual([
      expect.objectContaining({ kind: 'tool-result', text: 'Captured' }),
      { kind: 'media', mime: 'image/png', bytes: 3000, digest: await sha256Hex(image) },
    ]);
    expect(JSON.stringify(shot)).not.toContain(image);
  });

  it('keeps a file past the design cap as its size and digest, and re-projects the same bytes', async () => {
    const big = 'y'.repeat(140_000);
    const reader = vi.fn(async () => [
      { path: 'big.ts', text: big, bytes: 140_000 },
      { path: 'part.bin', text: undefined, bytes: 12 },
    ]);
    const changed = contentRun({ content: { ...contentRun().content!, changedPaths: ['big.ts', 'part.bin'] } });
    const first = outcomeOf(await projectRun(changed, granted({ content: { since: at, design: reader } })))!;
    const again = outcomeOf(await projectRun(changed, granted({ content: { since: at, design: reader } })))!;

    expect(sections(first).output?.messages[0]?.parts).toMatchObject([
      { kind: 'text' },
      {
        kind: 'source',
        path: 'big.ts',
        text: '',
        retainedBytes: 0,
        originalBytes: 140_000,
        digest: await sha256Hex(big),
      },
      { kind: 'source', path: 'part.bin', text: '', retainedBytes: 0, originalBytes: 12, digest: null },
      { kind: 'check' },
    ]);
    expect(first.projection.digest).toBe(again.projection.digest);
    expect(evidenceSchema.safeParse(first).success).toBe(true);
  });

  it('writes only summaries for facts from before the content grant, and keeps no earlier turn’s text', async () => {
    const projection = await projectRun(contentRun(), granted({ content: { since: at + 5000, design } }));

    expect(projection.evidence.map((evidence) => [evidence.semantic.kind, evidence.payload.plane])).toEqual([
      ['tool', 'summary'],
      ['tool', 'summary'],
      ['cad', 'summary'],
      ['outcome', 'content'],
    ]);
    const root = sections(outcomeOf(projection));
    expect(root.input?.messages.filter((message) => message.role === 'user')).toHaveLength(1);
  });

  it('falls back to the summary when the content cannot fit the envelope', async () => {
    const huge = Array.from({ length: 40 }, (_, index) => `"${index}"`.repeat(20_000)).join('');
    const projection = await projectRun(
      contentRun({ tools: [{ ...contentRun().tools[0]!, arguments: { huge }, result: huge.slice(0, 60_000) }] }),
      granted(),
    );
    for (const evidence of projection.evidence) {
      expect(new TextEncoder().encode(JSON.stringify(evidence)).byteLength).toBeLessThanOrEqual(262_144);
      expect(evidenceSchema.safeParse(evidence).success).toBe(true);
    }
  });
});
