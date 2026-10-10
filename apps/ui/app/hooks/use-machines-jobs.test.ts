// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { MachineClient, MachineJob, MachineListJobsInput } from '@taucad/runtime/machine';
import {
  agentJob,
  artifact,
  createFixture,
  later,
  timestamp,
} from '#routes/w.$workspace.$project/chat-print.fixture.js';
import { isOpenJob, reduceJobs, useMachinesJobs } from '#hooks/use-machines-jobs.js';

/** A watch that ends at once, as a host restart or a transport resync ends it. */
const endedWatch = async function* (): AsyncGenerator<MachineJob> {
  yield* [];
};

/** A watch that lasts until its signal aborts. */
const openWatch = (signal: AbortSignal | undefined): AsyncIterable<MachineJob> => ({
  [Symbol.asyncIterator]: () => ({
    next: async () =>
      new Promise<IteratorResult<MachineJob>>((resolve) => {
        signal?.addEventListener('abort', () => {
          resolve({ value: undefined, done: true });
        });
      }),
  }),
});

describe('reduceJobs', () => {
  it('should keep one record per job and never let an older record replace a newer one', () => {
    const approved = agentJob({ state: 'approved', updatedAt: later });
    const stale = agentJob({ state: 'awaiting-approval', updatedAt: timestamp });
    const other = agentJob({ jobId: 'job-2' });
    let projection: ReadonlyMap<string, MachineJob> = new Map();
    for (const job of [approved, stale, other]) {
      projection = reduceJobs(projection, job);
    }
    expect([...projection.values()].map((job) => [job.jobId, job.state])).toEqual([
      ['job-agent-1', 'approved'],
      ['job-2', 'awaiting-approval'],
    ]);
  });
});

describe('useMachinesJobs', () => {
  it('should follow a job from approval to its start through the journal', async () => {
    const fixture = createFixture({ jobs: [agentJob()] });
    const { result } = renderHook(() => useMachinesJobs(fixture.client, 'machine-1'));
    await waitFor(() => {
      expect(result.current.jobs.map((job) => job.state)).toEqual(['awaiting-approval']);
    });
    for (const state of ['approved', 'transferring', 'confirming', 'started'] as const) {
      fixture.journal(agentJob({ state, updatedAt: later }));
      // oxlint-disable-next-line no-await-in-loop -- each transition is read before the next is journaled.
      await waitFor(() => {
        expect(result.current.jobs[0]?.state).toBe(state);
      });
    }
    expect(isOpenJob(result.current.jobs[0]!)).toBe(false);
  });

  it('should list every job on the machine, whichever project asked, newest first', async () => {
    const fixture = createFixture({
      jobs: [
        agentJob({ jobId: 'mine', createdAt: timestamp }),
        agentJob({ jobId: 'theirs', createdAt: later, artifact: { ...artifact, projectId: 'proj_other' } }),
        agentJob({ jobId: 'elsewhere', machineId: 'machine-2' }),
      ],
    });
    const { result } = renderHook(() => useMachinesJobs(fixture.client, 'machine-1'));
    await waitFor(() => {
      expect(result.current.jobs.map((job) => job.jobId)).toEqual(['theirs', 'mine']);
    });
  });

  it('should list again and watch again when the watch ends, and abort the watch on unmount', async () => {
    const first = agentJob();
    const second = agentJob({ jobId: 'job-2', createdAt: later });
    const signals: Array<AbortSignal | undefined> = [];
    const listJobs = vi
      .fn<MachineClient['listJobs']>()
      .mockResolvedValueOnce([first])
      .mockResolvedValue([first, second]);
    const watchJobs = vi.fn((input: MachineListJobsInput): AsyncIterable<MachineJob> => {
      signals.push(input.signal);
      return signals.length === 1 ? endedWatch() : openWatch(input.signal);
    });
    const client = { ...createFixture().client, listJobs, watchJobs };
    const { result, unmount } = renderHook(() => useMachinesJobs(client, 'machine-1'));

    await waitFor(() => {
      expect(result.current.jobs.map((job) => job.jobId)).toEqual(['job-2', 'job-agent-1']);
    });
    expect(listJobs).toHaveBeenCalledTimes(2);
    expect(watchJobs).toHaveBeenCalledTimes(2);
    expect(listJobs).toHaveBeenLastCalledWith(expect.objectContaining({ machineId: 'machine-1' }));
    expect(listJobs.mock.calls[0]?.[0]).not.toHaveProperty('projectId');

    unmount();
    expect(signals.at(-1)?.aborted).toBe(true);
  });

  it('should say the updates stopped once three watches end without news within a minute, and clear on news', async () => {
    vi.useFakeTimers();
    try {
      /* Three watches end at once (500 ms and 1 s apart by the backoff); the fourth brings news and stays open. */
      const watchJobs = vi.fn((input: MachineListJobsInput): AsyncIterable<MachineJob> => {
        if (watchJobs.mock.calls.length <= 3) {
          return endedWatch();
        }
        const news = async function* (): AsyncGenerator<MachineJob> {
          yield agentJob({ state: 'approved', updatedAt: later });
          yield* openWatch(input.signal);
        };
        return news();
      });
      const client = { ...createFixture({ jobs: [agentJob()] }).client, watchJobs };
      const { result, unmount } = renderHook(() => useMachinesJobs(client, 'machine-1'));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
      expect(watchJobs).toHaveBeenCalledTimes(2);
      expect(result.current.isStalled).toBe(false);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
      expect(watchJobs).toHaveBeenCalledTimes(3);
      expect(result.current.isStalled).toBe(true);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });
      expect(watchJobs).toHaveBeenCalledTimes(4);
      expect(result.current.isStalled).toBe(false);
      expect(result.current.jobs[0]?.state).toBe('approved');
      unmount();
    } finally {
      vi.useRealTimers();
    }
  });
});
