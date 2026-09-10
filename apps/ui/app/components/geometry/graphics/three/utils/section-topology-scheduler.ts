export type SectionTopologyJobOutcome = 'completed' | 'discarded' | 'failed';

type SectionTopologyJob = Readonly<{
  generation: number;
  run: () => Promise<void>;
}>;

export type SectionTopologyScheduler = Readonly<{
  submit: (job: SectionTopologyJob) => Promise<SectionTopologyJobOutcome>;
  dispose: () => void;
  stats: () => Readonly<{ started: number; discarded: number }>;
}>;

/** Runs one topology generation while retaining only the newest queued successor. @internal */
export const createSectionTopologyScheduler = (): SectionTopologyScheduler => {
  type Pending = SectionTopologyJob & {
    resolve: (outcome: SectionTopologyJobOutcome) => void;
  };
  let active: Pending | undefined;
  let pending: Pending | undefined;
  let disposed = false;
  let started = 0;
  let discarded = 0;

  const start = async (job: Pending): Promise<void> => {
    active = job;
    started += 1;
    try {
      await job.run();
      const stale = disposed || (pending !== undefined && pending.generation > job.generation);
      discarded += stale ? 1 : 0;
      job.resolve(stale ? 'discarded' : 'completed');
    } catch {
      job.resolve(disposed ? 'discarded' : 'failed');
    } finally {
      active = undefined;
      const next = pending;
      pending = undefined;
      if (next) {
        if (disposed) {
          discarded += 1;
          next.resolve('discarded');
        } else {
          // async-iife: continue the serialized queue without blocking this completed job.
          void start(next);
        }
      }
    }
  };

  return {
    submit: async (job) =>
      new Promise<SectionTopologyJobOutcome>((resolve) => {
        const request = { ...job, resolve };
        if (disposed) {
          discarded += 1;
          resolve('discarded');
          return;
        }
        if (!active) {
          // async-iife: begin the scheduler's owned asynchronous job.
          void start(request);
          return;
        }
        if (pending) {
          discarded += 1;
          pending.resolve('discarded');
        }
        pending = request;
      }),
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      if (pending) {
        discarded += 1;
        pending.resolve('discarded');
        pending = undefined;
      }
    },
    stats: () => ({ started, discarded }),
  };
};
