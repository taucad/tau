import { useMemo, useSyncExternalStore } from 'react';
import { machineObservation } from '#services/machine-observation.js';
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

/** The first wait before following the ledger again after its watch ended. Milliseconds. @public */
export const firstResync = 500;
/** The longest wait between resyncs. Milliseconds. @public */
export const longestResync = 30_000;
/**
 * Wait, unless the wait is aborted first.
 *
 * @param milliseconds - How long.
 * @param signal - Ends the wait early.
 * @returns When the time is up or the signal aborted.
 * @public
 */
export const pause = async (milliseconds: number, signal: AbortSignal): Promise<void> =>
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
export const useMachinesJobs = (
  client: MachineClient | undefined,
  machineId: string | undefined,
  hostId?: string,
): JobsView => {
  const store = useMemo(
    () => (client === undefined || machineId === undefined ? undefined : machineObservation(client, machineId, hostId)),
    [client, machineId, hostId],
  );
  const view = useSyncExternalStore(
    store?.subscribe ?? noSubscribe,
    store?.getSnapshot ?? noSnapshot,
    store?.getSnapshot ?? noSnapshot,
  );
  return view === undefined ? emptyJobs : { jobs: view.jobs, error: view.error, isStalled: view.attempt >= 3 };
};
const emptyJobs: JobsView = { jobs: [], error: undefined, isStalled: false };
const noSubscribe = (): (() => void) => () => undefined;
const noSnapshot = (): undefined => undefined;
