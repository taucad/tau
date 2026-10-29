import { describe, expect, it, vi } from 'vitest';
import type { Evidence } from '#contract.js';
import type { SubmitOutcome } from '#delivery.js';
import { createEvidenceOutbox, memoryPendingStore } from '#delivery.js';
import type { ProjectedRun } from '#projection.js';
import type { ReportingGrant } from '#reporter.js';
import { createEvidenceReporter, summaryGrantOf } from '#reporter.js';

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

    expect(summaryGrantOf(answer(true), subject)).toEqual(grant());
    expect(summaryGrantOf(answer(false), subject)).toBeUndefined();
    expect(summaryGrantOf({ ...answer(true), projectId: undefined }, subject)).toBeUndefined();
    expect(summaryGrantOf(answer(true, 'project-b'), subject)).toBeUndefined();
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
