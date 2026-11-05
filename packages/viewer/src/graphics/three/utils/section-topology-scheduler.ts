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

/**
 * Runs one topology generation while retaining only the newest queued successor. `dispose` discards the running and
 * queued jobs; a later submit starts afresh, as the topology worker client does after `release`, so a viewer that
 * React remounts (StrictMode runs every effect's cleanup once) keeps building caps.
 * @internal
 * @returns The scheduler.
 */
export const createSectionTopologyScheduler = (): SectionTopologyScheduler => {
  type Pending = SectionTopologyJob & {
    resolve: (outcome: SectionTopologyJobOutcome) => void;
  };
  let active: Pending | undefined;
  let pending: Pending | undefined;
  // Bumped by each dispose; a job that started before it is discarded.
  let epoch = 0;
  let started = 0;
  let discarded = 0;

  const start = async (job: Pending): Promise<void> => {
    active = job;
    started += 1;
    const startedIn = epoch;
    try {
      await job.run();
      const stale = startedIn !== epoch || (pending !== undefined && pending.generation > job.generation);
      discarded += stale ? 1 : 0;
      job.resolve(stale ? 'discarded' : 'completed');
    } catch {
      job.resolve(startedIn === epoch ? 'failed' : 'discarded');
    } finally {
      active = undefined;
      const next = pending;
      pending = undefined;
      if (next) {
        // async-iife: continue the serialized queue without blocking this completed job.
        void start(next);
      }
    }
  };

  return {
    submit: async (job) =>
      new Promise<SectionTopologyJobOutcome>((resolve) => {
        const request = { ...job, resolve };
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
      epoch += 1;
      if (pending) {
        discarded += 1;
        pending.resolve('discarded');
        pending = undefined;
      }
    },
    stats: () => ({ started, discarded }),
  };
};
