import type { ExactRequest, ExactResponse } from './measurement-exact.worker.js';

/** Browser worker transport for one bounded AP242 query. */
export const runExactRequest = async (request: ExactRequest, signal?: AbortSignal): Promise<ExactResponse> => {
  const worker = new Worker(new URL('measurement-exact.worker.ts', import.meta.url), { type: 'module' });
  return new Promise<ExactResponse>((resolve) => {
    let finished = false;
    const finish = (response: ExactResponse): void => {
      if (finished) {
        return;
      }
      finished = true;
      signal?.removeEventListener('abort', onAbort);
      clearTimeout(queryTimeout);
      worker.terminate();
      resolve(response);
    };
    const onAbort = (): void => {
      finish({ id: request.id, status: 'unavailable', reason: 'The exact query was cancelled.' });
    };
    const queryTimeout = setTimeout(() => {
      finish({ id: request.id, status: 'unavailable', reason: 'The AP242 query timed out.' });
    }, 120_000);
    if (signal?.aborted) {
      onAbort();
      return;
    }
    signal?.addEventListener('abort', onAbort, { once: true });
    worker.addEventListener('error', () => {
      finish({ id: request.id, status: 'unavailable', reason: 'The AP242 worker failed.' });
    });
    worker.addEventListener('message', (event: MessageEvent<ExactResponse>) => {
      finish(
        event.data.id === request.id
          ? event.data
          : { id: request.id, status: 'unavailable', reason: 'The AP242 response identity changed.' },
      );
    });
    worker.addEventListener('messageerror', () => {
      finish({ id: request.id, status: 'unavailable', reason: 'The AP242 response could not be decoded.' });
    });
    try {
      worker.postMessage(request);
    } catch {
      finish({ id: request.id, status: 'unavailable', reason: 'The AP242 request could not be sent.' });
    }
  });
};
