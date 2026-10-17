import type { ExactRequest, ExactResponse } from './measurement-exact.worker.js';

/** Milliseconds a query may take before its worker is reset. */
const queryTimeout = 120_000;
/**
 * Milliseconds the worker may sit with no query before it is terminated. A
 * measuring session asks a run of queries; each new worker would compile and
 * instantiate the 16 MB GeoSpec engine and reserve its 128 MiB heap again.
 */
const idleTimeout = 30_000;

type PendingQuery = { readonly finish: (response: ExactResponse) => void };

let worker: Worker | undefined;
let idleTimer: ReturnType<typeof setTimeout> | undefined;
const pending = new Map<number, PendingQuery>();

const unavailable = (id: number, reason: string): ExactResponse => ({ id, status: 'unavailable', reason });

/** Terminate the worker and answer every query it still owes. */
const resetWorker = (reason: string): void => {
  const current = worker;
  worker = undefined;
  clearTimeout(idleTimer);
  idleTimer = undefined;
  current?.terminate();
  for (const [id, query] of pending) {
    query.finish(unavailable(id, reason));
  }
};

const armIdleTimer = (): void => {
  clearTimeout(idleTimer);
  idleTimer = pending.size === 0 && worker !== undefined ? setTimeout(resetWorker, idleTimeout, 'idle') : undefined;
};

const acquireWorker = (): Worker => {
  if (worker) {
    return worker;
  }
  const created = new Worker(new URL('measurement-exact.worker.ts', import.meta.url), { type: 'module' });
  created.addEventListener('error', () => {
    resetWorker('The AP242 worker failed.');
  });
  created.addEventListener('message', (event: MessageEvent<ExactResponse>) => {
    pending.get(event.data.id)?.finish(event.data);
  });
  created.addEventListener('messageerror', () => {
    resetWorker('The AP242 response could not be decoded.');
  });
  worker = created;
  return created;
};

/**
 * Browser worker transport for one bounded AP242 query.
 *
 * Queries share one idle-timed worker, and the request's AP242 bytes are
 * transferred to it when they own their buffer, so the caller must not read
 * them afterwards.
 */
export const runExactRequest = async (request: ExactRequest, signal?: AbortSignal): Promise<ExactResponse> =>
  new Promise<ExactResponse>((resolve) => {
    if (signal?.aborted) {
      resolve(unavailable(request.id, 'The exact query was cancelled.'));
      return;
    }
    const target = acquireWorker();
    const finish = (response: ExactResponse): void => {
      if (pending.get(request.id)?.finish !== finish) {
        return;
      }
      pending.delete(request.id);
      signal?.removeEventListener('abort', onAbort);
      clearTimeout(queryTimer);
      armIdleTimer();
      resolve(response);
    };
    const onAbort = (): void => {
      finish(unavailable(request.id, 'The exact query was cancelled.'));
      if (pending.size === 0) {
        // Nothing else waits on the worker, so stop the abandoned native query with it.
        resetWorker('The exact query was cancelled.');
      }
    };
    const queryTimer = setTimeout(() => {
      // A native query that outlives its budget can only be stopped with its worker.
      resetWorker('The AP242 query timed out.');
    }, queryTimeout);
    pending.set(request.id, { finish });
    armIdleTimer();
    signal?.addEventListener('abort', onAbort, { once: true });
    // Transfer a copy: the export's bytes may still be held elsewhere, and a transfer would detach them.
    const owned = new Uint8Array(request.source.bytes);
    try {
      target.postMessage({ ...request, source: { ...request.source, bytes: owned } }, [owned.buffer]);
    } catch {
      finish(unavailable(request.id, 'The AP242 request could not be sent.'));
    }
  });
