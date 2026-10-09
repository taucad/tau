import { useEffect, useMemo, useState } from 'react';
import type { MachineClient, MachineJob, MachineJobState } from '@taucad/runtime/machine';

const terminalStates: ReadonlySet<MachineJobState> = new Set(['started', 'denied', 'withdrawn', 'rejected', 'failed']);

/**
 * Whether a job still needs the person or the host.
 *
 * `unknown` is not terminal: the start was sent and nobody knows whether the
 * machine took it, so it stays in front until it is reconciled. `awaiting-start`
 * waits for a person at the machine.
 *
 * @param job - Any job.
 * @returns True while the job is not settled.
 * @public
 */
export const isOpenJob = (job: Pick<MachineJob, 'state'>): boolean => !terminalStates.has(job.state);

/**
 * The run a job started, when it is known: the run the host recorded, else the start receipt's.
 *
 * @param job - Any job.
 * @returns The run id, or `undefined` before a start or when the machine named none.
 * @public
 */
export const startedRunIdOf = ({ run, receipt }: Pick<MachineJob, 'run' | 'receipt'>): string | undefined =>
  run?.runId ?? (receipt?.kind === 'start' && receipt.status === 'accepted' ? receipt.runId : undefined);

const byNewest = (left: MachineJob, right: MachineJob): number =>
  Date.parse(right.createdAt) - Date.parse(left.createdAt) || left.jobId.localeCompare(right.jobId);

/**
 * Fold one journaled job into the projection keyed by job id; an older record never replaces a newer one.
 *
 * @param current - The projection before the record.
 * @param job - The record as the host journaled it.
 * @returns The projection after the record.
 * @public
 */
export const reduceJobs = (
  current: ReadonlyMap<string, MachineJob>,
  job: MachineJob,
): ReadonlyMap<string, MachineJob> => {
  const previous = current.get(job.jobId);
  if (previous && Date.parse(previous.updatedAt) > Date.parse(job.updatedAt)) {
    return current;
  }
  return new Map(current).set(job.jobId, job);
};

/** The jobs one machine currently holds, newest first. @public */
export type JobsView = Readonly<{
  jobs: readonly MachineJob[];
  error: string | undefined;
  /** The watch keeps ending without news: what is shown may be out of date while Tau keeps resyncing. */
  isStalled: boolean;
}>;

/** The first wait before following the ledger again after its watch ended. Milliseconds. */
const firstResync = 500;
/** The longest wait between resyncs. Milliseconds. */
const longestResync = 30_000;
/** This many watches ending without news within {@link stallWindow} say the updates stopped. */
const stallEndings = 3;
/** Milliseconds. */
const stallWindow = 60_000;

/**
 * Wait, unless the wait is aborted first.
 *
 * @param milliseconds - How long.
 * @param signal - Ends the wait early.
 * @returns When the time is up or the signal aborted.
 */
const pause = async (milliseconds: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve) => {
    const timer = globalThis.setTimeout(resolve, milliseconds);
    signal.addEventListener(
      'abort',
      () => {
        globalThis.clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });

/**
 * Subscribe to the host's job ledger for one machine: every job on it, whichever project asked.
 *
 * The list seeds the projection and every watched transition folds into it; the host's store stays the only
 * authority. A watch that ends (a host restart, a transport resync) means resync: list again, then watch again,
 * waiting longer each time one ends without news. Three such endings within a minute mark the view stalled until news
 * arrives; the resyncs go on. Unmount aborts the watch.
 *
 * @param client - The negotiated machines facet, or nothing while none is available.
 * @param machineId - The machine whose jobs to read, or nothing while none is selected.
 * @returns The live jobs.
 * @public
 */
export const useMachinesJobs = (client: MachineClient | undefined, machineId: string | undefined): JobsView => {
  const [records, setRecords] = useState<ReadonlyMap<string, MachineJob>>(new Map());
  const [error, setError] = useState<string>();
  /* The machine whose watch stalled: another machine's view starts unstalled. */
  const [stalledFor, setStalledFor] = useState<string>();

  useEffect(() => {
    if (client === undefined || machineId === undefined) {
      return;
    }
    const abort = new AbortController();
    const { signal } = abort;
    const fold = (jobs: readonly MachineJob[]): void => {
      setRecords((current) => {
        let next = current;
        for (const job of jobs) {
          next = reduceJobs(next, job);
        }
        return next;
      });
    };
    /* Read through a call: the abort lands while awaiting, which narrowing on the property cannot see. */
    const isAborted = (): boolean => signal.aborted;
    const observe = async (): Promise<void> => {
      let wait = firstResync;
      /* When each watch since the last news ended. */
      let endings: number[] = [];
      while (!isAborted()) {
        try {
          // oxlint-disable-next-line no-await-in-loop -- each resync lists, then watches, in order; never in parallel.
          const initial = await client.listJobs({ machineId, signal });
          if (isAborted()) {
            return;
          }
          setError(undefined);
          fold(initial);
          // oxlint-disable-next-line no-await-in-loop -- the watch runs until it ends; the next resync follows it.
          for await (const job of client.watchJobs({ machineId, signal })) {
            fold([job]);
            wait = firstResync;
            endings = [];
            setStalledFor(undefined);
          }
          const now = Date.now();
          endings = [...endings.filter((at) => now - at < stallWindow), now];
          if (endings.length >= stallEndings && !isAborted()) {
            setStalledFor(machineId);
          }
        } catch (error_) {
          if (isAborted()) {
            return;
          }
          setError(error_ instanceof Error ? error_.message : String(error_));
        }
        // oxlint-disable-next-line no-await-in-loop -- the backoff between resyncs is the point of the loop.
        await pause(wait, signal);
        wait = Math.min(wait * 2, longestResync);
      }
    };
    // async-iife: bootstrap -- a React effect cannot await; cleanup aborts the ledger watch.
    void observe();
    return () => {
      abort.abort();
    };
  }, [client, machineId]);

  const jobs = useMemo(
    () => [...records.values()].filter((job) => job.machineId === machineId).sort(byNewest),
    [machineId, records],
  );
  return { jobs, error, isStalled: stalledFor !== undefined && stalledFor === machineId };
};
