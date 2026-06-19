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
  new Worker(new URL('../workers/section-cap-overlap.worker.js', import.meta.url), {
    type: 'module',
    name: 'tau-section-cap-overlap-worker',
  });

export const createSectionCapOverlapWorkerClient = (
  options: CreateSectionCapOverlapWorkerClientOptions,
): SectionCapOverlapWorkerClient => {
  let worker: Worker | undefined;

  const ensureWorker = (): Worker => {
    if (worker) {
      return worker;
    }

    worker = (options.createWorker ?? createDefaultSectionCapOverlapWorker)();
    worker.addEventListener('message', onMessage);
    worker.addEventListener('error', onError);
    return worker;
  };

  function onMessage(event: MessageEvent<SectionCapWorkerResponse>): void {
    options.onResponse(event.data);
  }

  function onError(event: ErrorEvent): void {
    options.onError(new Error(event.message || 'Section cap overlap worker crashed.'));
  }

  return {
    post(request, transfer) {
      ensureWorker().postMessage(request, transfer);
    },
    dispose() {
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
