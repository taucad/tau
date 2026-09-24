import { useEffect, useMemo, useState } from 'react';
import type { MachineClient, PrintRequest, PrintRequestState } from '@taucad/runtime/machine';

const terminalStates: ReadonlySet<PrintRequestState> = new Set([
  'started',
  'denied',
  'withdrawn',
  'rejected',
  'failed',
]);

/**
 * Whether a request still needs the person or the host.
 *
 * `unknown` is not terminal: the start was sent and nobody knows whether the
 * printer took it, so it stays in front until it is reconciled.
 *
 * @param request - Any request.
 * @returns True while the request is not settled.
 * @public
 */
export const isOpenPrintRequest = (request: Pick<PrintRequest, 'state'>): boolean => !terminalStates.has(request.state);

const byNewest = (left: PrintRequest, right: PrintRequest): number =>
  Date.parse(right.createdAt) - Date.parse(left.createdAt) || left.requestId.localeCompare(right.requestId);

/**
 * Fold one journaled request into the projection keyed by request id.
 *
 * @param current - The projection before the record.
 * @param request - The record as the host journaled it.
 * @returns The projection after the record.
 * @public
 */
export const reducePrintRequests = (
  current: ReadonlyMap<string, PrintRequest>,
  request: PrintRequest,
): ReadonlyMap<string, PrintRequest> => {
  const previous = current.get(request.requestId);
  if (previous && Date.parse(previous.updatedAt) > Date.parse(request.updatedAt)) {
    return current;
  }
  return new Map(current).set(request.requestId, request);
};

/** The print requests one machine currently holds, newest first. @public */
export type PrintRequestsView = Readonly<{
  requests: readonly PrintRequest[];
  error: string | undefined;
}>;

/**
 * Subscribe to the host's print request ledger for one machine.
 *
 * The list seeds the projection and every watched transition folds into it;
 * the host journal stays the only authority (blueprint D4). Unmount aborts the watch.
 *
 * @param client - The negotiated machines facet.
 * @param machineId - The machine whose requests to read, or nothing while none is selected.
 * @returns The live requests.
 * @public
 */
export const useMachinesPrintRequests = (client: MachineClient, machineId: string | undefined): PrintRequestsView => {
  const [records, setRecords] = useState<ReadonlyMap<string, PrintRequest>>(new Map());
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (machineId === undefined) {
      return;
    }
    const abort = new AbortController();
    const observe = async (): Promise<void> => {
      try {
        setError(undefined);
        const initial = await client.listPrintRequests({ machineId, signal: abort.signal });
        if (abort.signal.aborted) {
          return;
        }
        setRecords((current) => {
          let next = current;
          for (const request of initial) {
            next = reducePrintRequests(next, request);
          }
          return next;
        });
        for await (const request of client.watchPrintRequests({ machineId, signal: abort.signal })) {
          setRecords((current) => reducePrintRequests(current, request));
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
  }, [client, machineId]);

  const requests = useMemo(
    () => [...records.values()].filter((request) => request.machineId === machineId).sort(byNewest),
    [machineId, records],
  );
  return { requests, error };
};
