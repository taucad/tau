import type {
  SectionCanonicalTopologyWorkerInput,
  SectionCanonicalTopologyWorkerResult,
} from '#graphics/three/utils/section-surface-topology.js';

/** The part of a `Worker` the client uses, so tests can supply a double. */
export type SectionTopologyWorkerPort = {
  postMessage(message: Readonly<{ id: number; input: SectionCanonicalTopologyWorkerInput }>): void;
  terminate(): void;
  addEventListener(type: 'message' | 'error', listener: (event: Event) => void): void;
};

export type SectionTopologyWorkerClient = Readonly<{
  /** Builds a canonical recipe off the main thread, or returns `undefined` when no worker can be created. */
  build(input: SectionCanonicalTopologyWorkerInput): Promise<SectionCanonicalTopologyWorkerResult> | undefined;
  /** Terminates the worker now when nothing is in flight; otherwise it terminates once idle. */
  release(): void;
}>;

const idleTerminateMilliseconds = 1000;

/**
 * One lazy topology worker that terminates after a second without work, like the measurement-features client,
 * so the worker realm and the heap of its last build do not outlive Section use.
 * @internal
 */
export const createSectionTopologyWorkerClient = (
  createWorker: () => SectionTopologyWorkerPort | undefined,
): SectionTopologyWorkerClient => {
  let worker: SectionTopologyWorkerPort | undefined;
  let sequence = 0;
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  const requests = new Map<
    number,
    Readonly<{
      resolve: (result: SectionCanonicalTopologyWorkerResult) => void;
      reject: (error: Error) => void;
    }>
  >();

  const terminate = (): void => {
    clearTimeout(idleTimer);
    idleTimer = undefined;
    worker?.terminate();
    worker = undefined;
  };

  const scheduleIdleTerminate = (): void => {
    if (worker && requests.size === 0 && idleTimer === undefined) {
      idleTimer = setTimeout(terminate, idleTerminateMilliseconds);
    }
  };

  const acquire = (): SectionTopologyWorkerPort | undefined => {
    if (worker) {
      return worker;
    }
    let created: SectionTopologyWorkerPort | undefined;
    try {
      created = createWorker();
    } catch {
      return undefined;
    }
    if (!created) {
      return undefined;
    }
    const current = created;
    current.addEventListener('message', (event) => {
      const { data } = event as MessageEvent<Readonly<{ id: number; result: SectionCanonicalTopologyWorkerResult }>>;
      const request = requests.get(data.id);
      requests.delete(data.id);
      request?.resolve(data.result);
      if (worker === current) {
        scheduleIdleTerminate();
      }
    });
    current.addEventListener('error', (event) => {
      const message = event instanceof ErrorEvent ? event.message : '';
      const error = new Error(message || 'Section topology worker failed');
      if (worker === current) {
        terminate();
      }
      for (const request of requests.values()) {
        request.reject(error);
      }
      requests.clear();
    });
    worker = current;
    return worker;
  };

  return {
    build(input): Promise<SectionCanonicalTopologyWorkerResult> | undefined {
      const target = acquire();
      if (!target) {
        return undefined;
      }
      clearTimeout(idleTimer);
      idleTimer = undefined;
      const id = ++sequence;
      return new Promise<SectionCanonicalTopologyWorkerResult>((resolve, reject) => {
        requests.set(id, { resolve, reject });
        // The page keeps its own arrays: they become the retained topology, and a retry after a failure resends them.
        target.postMessage({ id, input });
      });
    },
    release() {
      if (requests.size === 0) {
        terminate();
      }
    },
  };
};

const topologyWorkerClient = createSectionTopologyWorkerClient(() =>
  typeof Worker === 'undefined' || import.meta.env.MODE === 'test'
    ? undefined
    : new Worker(new URL('section-surface-topology.worker.ts', import.meta.url), {
        type: 'module',
        name: 'tau-section-topology',
      }),
);

/** Builds a canonical topology recipe on the shared page worker, or `undefined` without one. @internal */
export const buildSectionTopologyRecipeInWorker = (
  input: SectionCanonicalTopologyWorkerInput,
): Promise<SectionCanonicalTopologyWorkerResult> | undefined => topologyWorkerClient.build(input);

/** Releases the shared topology worker when its viewer unmounts; an in-flight build finishes first. @internal */
export const releaseSectionTopologyWorker = (): void => {
  topologyWorkerClient.release();
};
