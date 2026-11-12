import { describe, expect, it, vi } from 'vitest';
import type { Evidence } from '#contract.js';
import type { SubmitOutcome } from '#delivery.js';
import { createEvidenceOutbox, memoryPendingStore } from '#delivery.js';
import type { ProjectedRun } from '#projection.js';
import type { ReportingGrant } from '#reporter.js';
import { createEvidenceReporter, purposeGrantOf, summaryGrantOf } from '#reporter.js';

const at = Date.parse('2026-10-29T00:00:00.000Z');

const run = (index: number, endedAt = at + 1000): ProjectedRun => ({
  chatId: 'chat-1',
  runId: `run-${index}`,
  termination: 'completed',
  tools: [],
  intervals: [],
  ending: { source: { chatId: 'chat-1', leaderEpoch: 'epoch-a', sequence: index }, at: endedAt },
});

const grant = (change: Partial<ReportingGrant> = {}): ReportingGrant => ({
  principal: 'user-a',
  project: 'project-a',
  policyEpoch: 'policy-1',
  protection: 'unknown',
  ...change,
});

const accepted: SubmitOutcome = {
  kind: 'receipt',
  receipt: { receipt: 'r', disposition: 'accepted', duplicate: false, receivedAt: '', expiresAt: '' },
};

const setup = (
  answers: Array<ReportingGrant | undefined | Error>,
  submit = vi.fn<(evidence: Evidence) => Promise<SubmitOutcome>>(async () => accepted),
) => {
  let clock = at;
  const sent: Evidence[] = [];
  const store = memoryPendingStore();
  submit.mockImplementation(async (evidence: Evidence) => {
    sent.push(evidence);
    return accepted;
  });
  const outbox = createEvidenceOutbox({ store, submit, now: () => clock });
  const scheduled: Array<{ callback: () => void; milliseconds: number }> = [];
  const reporter = createEvidenceReporter({
    outbox,
    grant: async () => {
      const answer = answers.length > 1 ? answers.shift() : answers[0];
      if (answer instanceof Error) {
        throw answer;
      }
      return answer;
    },
    uploader: 'host-a',
    hostBuild: undefined,
    now: () => clock,
    schedule: (callback, milliseconds) => {
      scheduled.push({ callback, milliseconds });
      return () => undefined;
    },
  });
  return {
    reporter,
    store,
    sent,
    submit,
    scheduled,
    advance: (milliseconds: number) => {
      clock += milliseconds;
    },
  };
};

const held = async (store: ReturnType<typeof memoryPendingStore>): Promise<number> => {
  const size = await store.size();
  return size.items;
};

describe('summaryGrantOf', () => {
  const answer = (allowed: boolean, projectId: string | undefined = 'project-a') => ({
    epoch: 'policy-1',
    projectId,
    purposes: [
      { purpose: 'summary', allowed },
      { purpose: 'content', allowed: true },
    ],
  });

  it('should grant only a project-scoped answer that allows summaries', () => {
    const subject = { principal: 'user-a', project: 'project-a' };

    /* The same answer says whether content is allowed too: the summary grant carries it (LW6). */
    expect(summaryGrantOf(answer(true), subject)).toEqual(grant({ content: {} }));
    expect(summaryGrantOf(answer(false), subject)).toBeUndefined();
    expect(summaryGrantOf({ ...answer(true), projectId: undefined }, subject)).toBeUndefined();
    expect(summaryGrantOf(answer(true, 'project-b'), subject)).toBeUndefined();
  });

  it('should date the grant on the host clock, shifted by how far it read ahead of the server', () => {
    const subject = { principal: 'user-a', project: 'project-a' };
    const since = (allowedSince: number, answeredAt?: number) => ({
      epoch: 'policy-1',
      projectId: 'project-a',
      purposes: [{ purpose: 'summary', allowed: true, allowedSince }],
      ...(answeredAt === undefined ? {} : { answeredAt }),
    });

    /* The host's clock reads 90 s ahead of the server's: the decision is 90 s later on it. */
    expect(purposeGrantOf(since(at, at + 10_000), { ...subject, receivedAt: at + 100_000 }, 'summary')).toEqual(
      grant({ allowedSince: at + 90_000 }),
    );
    /* Behind it, the decision is earlier on the host's clock by as much. */
    expect(purposeGrantOf(since(at, at + 10_000), { ...subject, receivedAt: at }, 'summary')).toEqual(
      grant({ allowedSince: at - 10_000 }),
    );
    /* Without the server's answer time, or the receipt time, nothing dates the grant. */
    expect(purposeGrantOf(since(at), { ...subject, receivedAt: at }, 'summary')).toEqual(grant());
    expect(purposeGrantOf(since(at, at), subject, 'summary')).toEqual(grant());
    expect(purposeGrantOf(since(-1, at), { ...subject, receivedAt: at }, 'summary')).toEqual(grant());
    expect(purposeGrantOf(since(Number.NaN, at), { ...subject, receivedAt: at }, 'summary')).toEqual(grant());
  });
});

describe('the content grant (LW6)', () => {
  const subject = { principal: 'user-a', project: 'project-a', receivedAt: at + 100_000 };
  const answer = (content: boolean | undefined, allowedSince?: number) => ({
    epoch: 'policy-1',
    projectId: 'project-a',
    answeredAt: at + 10_000,
    purposes: [
      { purpose: 'summary', allowed: true },
      ...(content === undefined ? [] : [{ purpose: 'content', allowed: content, allowedSince }]),
    ],
  });

  it('should carry content on the summary grant only when the same answer allows it, dated on the host clock', () => {
    expect(summaryGrantOf(answer(undefined), subject)?.content).toBeUndefined();
    expect(summaryGrantOf(answer(false), subject)?.content).toBeUndefined();
    expect(purposeGrantOf(answer(true, at), subject, 'summary')?.content).toEqual({ allowedSince: at + 90_000 });
    /* The feedback grant never carries content. */
    expect(
      purposeGrantOf(
        {
          ...answer(true),
          purposes: [
            { purpose: 'feedback', allowed: true },
            { purpose: 'content', allowed: true },
          ],
        },
        subject,
        'feedback',
      )?.content,
    ).toBeUndefined();
  });

  const toolRun = (index: number): ProjectedRun => ({
    ...run(index),
    tools: [
      {
        call: `call-${index}`,
        toolName: 'edit_file',
        outcome: 'completed',
        input: { chatId: 'chat-1', leaderEpoch: 'epoch-a', sequence: 100 + index },
        output: { chatId: 'chat-1', leaderEpoch: 'epoch-a', sequence: 200 + index },
        startedAt: at + 500,
        settledAt: at + 600,
        arguments: { targetFile: 'main.ts' },
        result: 'SYNTHETIC_RESULT',
      },
    ],
    content: { prompt: 'SYNTHETIC_PROMPT', reply: 'SYNTHETIC_REPLY', changedPaths: [] },
  });

  it('should project content from when content was allowed, and only summaries once it is not', async () => {
    const { reporter, sent } = setup([
      grant({ allowedSince: at, content: { allowedSince: at } }),
      grant({ allowedSince: at }),
    ]);

    await reporter.report([toolRun(1)], () => true);
    expect(sent.map((evidence) => evidence.payload.plane)).toEqual(['content', 'content']);
    expect(JSON.stringify(sent)).toContain('SYNTHETIC_PROMPT');

    await reporter.report([toolRun(2)], () => true);
    expect(sent.slice(2).map((evidence) => evidence.payload.plane)).toEqual(['summary', 'summary']);
    expect(JSON.stringify(sent.slice(2))).not.toContain('SYNTHETIC');
  });

  it('should project only summaries for facts before content was allowed', async () => {
    const { reporter, sent, advance } = setup([grant({ allowedSince: at, content: { allowedSince: at + 800 } })]);
    advance(2000);

    await reporter.report([toolRun(1)], () => true);
    expect(sent.map((evidence) => [evidence.semantic.kind, evidence.payload.plane])).toEqual([
      ['tool', 'summary'],
      ['outcome', 'content'],
    ]);
  });
});

describe('createEvidenceReporter', () => {
  it('should report runs that ended after it saw the grant, and never one before', async () => {
    const { reporter, sent, advance } = setup([grant()]);

    await reporter.refresh();
    await reporter.report([run(0, at - 1)], () => true);
    advance(5000);
    await reporter.report([run(1, at + 2000)], () => true);

    expect(sent.map((evidence) => evidence.semantic.kind)).toEqual(['outcome']);
    expect(reporter.coverage()).toMatchObject({ projected: 1, beforeGrant: 1, stop: 'empty' });
  });

  it('should report from the time the account granted, however late it first read the grant', async () => {
    /* A project the API registers after its first run began: the first read grants nothing, a later one does. */
    const { reporter, sent, advance } = setup([undefined, grant({ allowedSince: at - 60_000 })]);

    await reporter.refresh();
    advance(30_000);
    await reporter.report([run(0, at + 1000), run(1, at - 120_000)], () => true);

    expect(sent.map((evidence) => evidence.semantic.kind)).toEqual(['outcome']);
    expect(reporter.coverage()).toMatchObject({ projected: 1, beforeGrant: 1 });
  });

  it('should never date a grant later than now, whatever the server answers', async () => {
    const { reporter, sent } = setup([grant({ allowedSince: at + 3_600_000 })]);

    await reporter.refresh();
    await reporter.report([run(0, at)], () => true);

    expect(sent).toHaveLength(1);
  });

  it('should adopt the decision time when a later read of the same grant gives it, and project its runs again', async () => {
    const { reporter, sent, advance } = setup([grant(), grant(), grant({ allowedSince: at - 60_000 })]);

    advance(30_000);
    await reporter.refresh();
    await reporter.report([run(0, at + 1000)], () => true);
    expect(sent).toEqual([]);
    await reporter.report([run(0, at + 1000)], () => true);

    expect(sent).toHaveLength(1);
  });

  it('should not send a settled run again', async () => {
    const { reporter, sent } = setup([grant()]);

    await reporter.refresh();
    await reporter.report([run(0)], () => true);
    await reporter.report([run(0)], () => true);

    expect(sent).toHaveLength(1);
  });

  it('should project a run again when its evidence could not be queued', async () => {
    const { reporter, store, sent } = setup([grant()]);
    const hold = vi.spyOn(store, 'hold').mockRejectedValueOnce(new Error('quota'));

    await reporter.refresh();
    await expect(reporter.report([run(0)], () => true)).rejects.toThrow('quota');
    hold.mockRestore();
    await reporter.report([run(0)], () => true);

    expect(sent).toHaveLength(1);
  });

  it('should leave rows another device led to it', async () => {
    const { reporter, sent } = setup([grant()]);

    await reporter.refresh();
    await reporter.report([run(0)], () => false);

    expect(sent).toEqual([]);
    expect(reporter.coverage()).toMatchObject({ foreign: 1, projected: 0 });
  });

  it('should purge what it held when the grant is withdrawn, and start a new clock for a new epoch', async () => {
    const retry: SubmitOutcome = { kind: 'retry', afterMilliseconds: 1000 };
    const { reporter, store, submit, advance } = setup([
      grant(),
      grant(),
      undefined,
      grant({ policyEpoch: 'policy-2' }),
    ]);
    submit.mockResolvedValue(retry);

    await reporter.refresh();
    await reporter.report([run(0)], () => true);
    expect(await held(store)).toBe(1);

    await reporter.report([run(1)], () => true);
    expect(await held(store)).toBe(0);
    expect(reporter.coverage()).toMatchObject({ ungranted: 1 });

    advance(5000);
    await reporter.report([run(2)], () => true);
    expect(await held(store)).toBe(0);
    expect(reporter.coverage()).toMatchObject({ beforeGrant: 1 });
  });

  it('should project and send nothing while the grant cannot be read, and keep what it holds', async () => {
    const { reporter, store, submit, sent } = setup([grant(), grant(), new Error('offline')]);
    submit.mockResolvedValueOnce({ kind: 'retry', afterMilliseconds: 1000 });

    await reporter.refresh();
    await reporter.report([run(0)], () => true);
    const callsBefore = submit.mock.calls.length;
    await reporter.report([run(1)], () => true);

    expect(submit.mock.calls.length).toBe(callsBefore);
    expect(await held(store)).toBe(1);
    expect(sent).toEqual([]);
    expect(reporter.coverage()).toMatchObject({ unknownGrant: 1, stop: 'retry' });
  });

  it('should try a drain again once after the server’s wait', async () => {
    const { reporter, submit, scheduled, sent } = setup([grant()]);
    submit.mockImplementationOnce(async () => ({ kind: 'retry', afterMilliseconds: 7000 }));

    await reporter.refresh();
    await reporter.report([run(0)], () => true);
    expect(scheduled.map((entry) => entry.milliseconds)).toEqual([7000]);

    scheduled[0]!.callback();
    await vi.waitFor(() => {
      expect(reporter.coverage().stop).toBe('empty');
    });
    expect(sent).toHaveLength(1);
  });

  it('should refuse reports once closed', async () => {
    const { reporter, sent } = setup([grant()]);

    await reporter.refresh();
    reporter.close();
    await reporter.report([run(0)], () => true);

    expect(sent).toEqual([]);
  });
});
