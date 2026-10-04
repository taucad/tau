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
}>;

/**
 * Subscribe to the host's job ledger for one machine.
 *
 * The list seeds the projection and every watched transition folds into it; the
 * host's store stays the only authority. Unmount aborts the watch.
 *
 * @param client - The negotiated machines facet, or nothing while none is available.
 * @param machineId - The machine whose jobs to read, or nothing while none is selected.
 * @param projectId - When set, only jobs whose artifact belongs to this project.
 * @returns The live jobs.
 * @public
 */
export const useMachinesJobs = (
  client: MachineClient | undefined,
  machineId: string | undefined,
  projectId?: string,
): JobsView => {
  const [records, setRecords] = useState<ReadonlyMap<string, MachineJob>>(new Map());
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (client === undefined || machineId === undefined) {
      return;
    }
    const abort = new AbortController();
    const observe = async (): Promise<void> => {
      try {
        setError(undefined);
        const scope = projectId === undefined ? { machineId } : { machineId, projectId };
        const initial = await client.listJobs({ ...scope, signal: abort.signal });
        if (abort.signal.aborted) {
          return;
        }
        setRecords((current) => {
          let next = current;
          for (const job of initial) {
            next = reduceJobs(next, job);
          }
          return next;
        });
        for await (const job of client.watchJobs({ ...scope, signal: abort.signal })) {
          setRecords((current) => reduceJobs(current, job));
        }
      } catch (error) {
        if (!abort.signal.aborted) {
          setError(error instanceof Error ? error.message : String(error));
        }
      }
    };
    // async-iife: bootstrap -- a React effect cannot await; cleanup aborts the ledger watch.
    void observe();
    return () => {
      abort.abort();
    };
  }, [client, machineId, projectId]);

  const jobs = useMemo(
    () => [...records.values()].filter((job) => job.machineId === machineId).sort(byNewest),
    [machineId, records],
  );
  return { jobs, error };
};
