import type {
  SectionCapWorkerRequest,
  SectionCapWorkerResponse,
} from '#components/geometry/graphics/three/utils/section-cap-overlap-worker-protocol.js';

export type CreateSectionCapOverlapWorker = () => Worker;

export type SectionCapOverlapWorkerClient = Readonly<{
  post(request: SectionCapWorkerRequest, transfer: Transferable[]): void;
  dispose(): void;
}>;

export type CreateSectionCapOverlapWorkerClientOptions = Readonly<{
  createWorker?: CreateSectionCapOverlapWorker;
  onResponse(response: SectionCapWorkerResponse): void;
  onError(error: Error): void;
}>;

export const canUseSectionCapOverlapWorker = (): boolean => typeof Worker !== 'undefined';

export const createDefaultSectionCapOverlapWorker = (): Worker =>
  new Worker(new URL('../workers/section-cap-overlap.worker.ts', import.meta.url), {
    type: 'module',
    name: 'tau-section-cap-overlap-worker',
  });

export const createSectionCapOverlapWorkerClient = (
  options: CreateSectionCapOverlapWorkerClientOptions,
): SectionCapOverlapWorkerClient => {
  let worker: Worker | undefined;
  let inFlight = false;
  let pending: Readonly<{ request: SectionCapWorkerRequest; transfer: Transferable[] }> | undefined;

  const ensureWorker = (): Worker => {
    if (worker) {
      return worker;
    }

    worker = (options.createWorker ?? createDefaultSectionCapOverlapWorker)();
    worker.addEventListener('message', onMessage);
    worker.addEventListener('error', onError);
    return worker;
  };

  const post = (request: SectionCapWorkerRequest, transfer: Transferable[]): void => {
    inFlight = true;
    ensureWorker().postMessage(request, transfer);
  };

  const postPending = (): void => {
    inFlight = false;
    const next = pending;
    pending = undefined;
    if (next) {
      post(next.request, next.transfer);
    }
  };

  function onMessage(event: MessageEvent<SectionCapWorkerResponse>): void {
    postPending();
    options.onResponse(event.data);
  }

  function onError(event: ErrorEvent): void {
    inFlight = false;
    pending = undefined;
    options.onError(new Error(event.message || 'Section cap overlap worker crashed.'));
  }

  return {
    post(request, transfer) {
      if (inFlight) {
        pending = { request, transfer };
        return;
      }

      post(request, transfer);
    },
    dispose() {
      pending = undefined;
      inFlight = false;
      if (!worker) {
        return;
      }

      worker.removeEventListener('message', onMessage);
      worker.removeEventListener('error', onError);
      worker.terminate();
      worker = undefined;
    },
  };
};
