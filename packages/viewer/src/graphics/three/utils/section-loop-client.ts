import { createSectionLoopSlicer } from '#graphics/three/utils/section-loop-slicer.js';
import type {
  SectionLoopSliceRequest,
  SectionLoopSliceResult,
  SectionLoopSourceInput,
} from '#graphics/three/utils/section-loop-slicer.js';

/** A message to the section worker's loop slicer. */
export type SectionLoopWorkerRequest = Readonly<{
  id: number;
  loops:
    | Readonly<{ kind: 'prepare'; input: SectionLoopSourceInput }>
    | Readonly<{ kind: 'slice'; request: SectionLoopSliceRequest }>
    | Readonly<{ kind: 'release'; sourceKey: string }>;
}>;

/** The section worker's answer to a {@link SectionLoopWorkerRequest}. */
export type SectionLoopWorkerResponse = Readonly<{
  id: number;
  result:
    | Readonly<{ kind: 'prepared'; milliseconds: number }>
    | Readonly<{ kind: 'sliced'; result: SectionLoopSliceResult }>
    | Readonly<{ kind: 'released' }>;
}>;

/** The part of a `Worker` the client uses, so tests can supply a double. */
export type SectionLoopWorkerPort = {
  postMessage(message: SectionLoopWorkerRequest, transfer: Transferable[]): void;
  terminate(): void;
  addEventListener(type: 'message' | 'error', listener: (event: Event) => void): void;
};

/** A slice and what it cost: preparing the source (when this slice sent it) and slicing it. */
export type SectionLoopClientSlice = Extract<SectionLoopSliceResult, { status: 'ready' }> &
  Readonly<{ prepareMilliseconds: number | undefined }>;

export type SectionLoopClient = Readonly<{
  /**
   * Slices a source by a plane. The source's triangles are read through `readSource` only when the slicer does not
   * hold them at `request.signature`, and are then handed over without a copy.
   */
  slice: (
    request: SectionLoopSliceRequest,
    readSource: () => SectionLoopSourceInput,
  ) => Promise<SectionLoopClientSlice>;
  /** Forgets a source the view no longer shows. */
  release: (sourceKey: string) => void;
  dispose: () => void;
}>;

/** A worker without work for this long is terminated, dropping the sources it holds. */
export const sectionLoopWorkerIdleMilliseconds = 60_000;

const transferablesOf = (input: SectionLoopSourceInput): Transferable[] =>
  input.participants.flatMap(({ positions, index }) => [positions.buffer, index.buffer]);

/**
 * Per-loop slices for sources the stencil cannot cap exactly, off the main thread: one lazy section worker holds each
 * source's triangles and tree and slices them per plane. Without a worker the same slicer runs in-process.
 * @internal
 */
export const createSectionLoopClient = (createWorker: () => SectionLoopWorkerPort | undefined): SectionLoopClient => {
  let worker: SectionLoopWorkerPort | undefined;
  let isWorkerUnavailable = false;
  let sequence = 0;
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  /** The signature of each source the current worker holds. */
  const prepared = new Map<string, string>();
  const requests = new Map<
    number,
    Readonly<{ resolve: (response: SectionLoopWorkerResponse['result']) => void; reject: (error: Error) => void }>
  >();
  const inProcess = createSectionLoopSlicer();

  const terminate = (): void => {
    clearTimeout(idleTimer);
    idleTimer = undefined;
    worker?.terminate();
    worker = undefined;
    prepared.clear();
  };

  const scheduleIdleTerminate = (): void => {
    clearTimeout(idleTimer);
    idleTimer = requests.size === 0 && worker ? setTimeout(terminate, sectionLoopWorkerIdleMilliseconds) : undefined;
  };

  const acquire = (): SectionLoopWorkerPort | undefined => {
    if (worker !== undefined || isWorkerUnavailable) {
      return worker;
    }
    let created: SectionLoopWorkerPort | undefined;
    try {
      created = createWorker();
    } catch {
      created = undefined;
    }
    if (!created) {
      isWorkerUnavailable = true;
      return undefined;
    }
    const current = created;
    current.addEventListener('message', (event) => {
      const { data } = event as MessageEvent<SectionLoopWorkerResponse>;
      const request = requests.get(data.id);
      requests.delete(data.id);
      request?.resolve(data.result);
      if (worker === current) {
        scheduleIdleTerminate();
      }
    });
    current.addEventListener('error', (event) => {
      const message = event instanceof ErrorEvent ? event.message : '';
      const error = new Error(message === '' ? 'Section loop worker failed' : message);
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

  const send = async (
    target: SectionLoopWorkerPort,
    loops: SectionLoopWorkerRequest['loops'],
    transfer: Transferable[] = [],
  ): Promise<SectionLoopWorkerResponse['result']> => {
    clearTimeout(idleTimer);
    idleTimer = undefined;
    const id = ++sequence;
    return new Promise((resolve, reject) => {
      requests.set(id, { resolve, reject });
      target.postMessage({ id, loops }, transfer);
    });
  };

  const sliceInWorker = async (
    target: SectionLoopWorkerPort,
    request: SectionLoopSliceRequest,
    readSource: () => SectionLoopSourceInput,
  ): Promise<SectionLoopClientSlice> => {
    let prepareMilliseconds: number | undefined;
    // Two rounds at most: a worker restarted between sending a source and slicing it no longer holds the source.
    for (let attempt = 0; attempt < 2; attempt++) {
      if (prepared.get(request.sourceKey) !== request.signature) {
        const input = readSource();
        prepared.set(request.sourceKey, request.signature);
        // oxlint-disable-next-line no-await-in-loop -- The source must land before the slice that reads it.
        const response = await send(target, { kind: 'prepare', input }, transferablesOf(input));
        prepareMilliseconds = response.kind === 'prepared' ? response.milliseconds : undefined;
      }
      // oxlint-disable-next-line no-await-in-loop -- A missing source is sent again before one more slice.
      const response = await send(target, { kind: 'slice', request });
      if (response.kind === 'sliced' && response.result.status === 'ready') {
        return { ...response.result, prepareMilliseconds };
      }
      prepared.delete(request.sourceKey);
    }
    throw new Error(`Section loop worker lost source ${request.sourceKey}`);
  };

  return {
    async slice(request, readSource) {
      const target = acquire();
      if (target) {
        return sliceInWorker(target, request, readSource);
      }
      let prepareMilliseconds: number | undefined;
      let result = inProcess.slice(request);
      if (result.status === 'missing') {
        prepareMilliseconds = inProcess.prepare(readSource());
        result = inProcess.slice(request);
      }
      if (result.status === 'missing') {
        throw new Error(`Section loop slicer lost source ${request.sourceKey}`);
      }
      return { ...result, prepareMilliseconds };
    },
    release(sourceKey) {
      inProcess.release(sourceKey);
      if (worker && prepared.delete(sourceKey)) {
        // A release needs no answer; the worker's reply matches no request and is dropped.
        worker.postMessage({ id: ++sequence, loops: { kind: 'release', sourceKey } }, []);
      }
    },
    dispose() {
      terminate();
      for (const request of requests.values()) {
        request.reject(new Error('Section loop client disposed'));
      }
      requests.clear();
    },
  };
};

const sharedClient = createSectionLoopClient(() =>
  typeof Worker === 'undefined' || import.meta.env.MODE === 'test'
    ? undefined
    : (new Worker(new URL('section-surface-topology.worker.ts', import.meta.url), {
        type: 'module',
        name: 'tau-section-loops',
      }) as unknown as SectionLoopWorkerPort),
);

/** The page's shared per-loop slice client. @internal */
export const getSectionLoopClient = (): SectionLoopClient => sharedClient;
