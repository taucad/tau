import * as THREE from 'three';

/** Every tree the viewer builds, in either realm, so a worker tree and a main-thread tree answer alike. */
export const bvhBuildOptions = { indirect: true, targetLeafSize: 32 } as const;

/** Milliseconds without queued or active work after which the worker is terminated. */
export const bvhWorkerIdleMilliseconds = 60_000;

/** A copy of one attribute's bytes, owned by the message that carries it. */
export type BvhAttributeCopy = Readonly<{
  array: THREE.TypedArray;
  itemSize: number;
  normalized: boolean;
  stride?: number;
  offset?: number;
}>;

/** What the worker needs to rebuild the geometry's tree: positions, the index, its groups and its draw range. */
export type BvhBuildRequest = Readonly<{
  type: 'build';
  id: number;
  position: BvhAttributeCopy;
  index?: BvhAttributeCopy;
  groups: ReadonlyArray<Readonly<{ start: number; count: number; materialIndex?: number }>>;
  drawRange: Readonly<{ start: number; count: number }>;
  options: typeof bvhBuildOptions;
}>;

/** The tree the worker built, serialised without cloning: its roots and indirect buffer travel as transfers. */
export type BvhWorkerMessage =
  | Readonly<{
      type: 'built';
      id: number;
      version: number;
      roots: ArrayBuffer[];
      indirectBuffer: Uint32Array | Uint16Array | undefined;
      /** Milliseconds building the tree in the worker. */
      buildMilliseconds: number;
    }>
  | Readonly<{ type: 'error'; id: number; message: string }>;

/** The serialised tree and its costs, ready for `MeshBVH.deserialize` on the main thread. */
export type BvhWorkerTree = Readonly<{
  version: number;
  roots: ArrayBuffer[];
  indirectBuffer: Uint32Array | Uint16Array | undefined;
  /** Milliseconds copying the geometry's bytes on the main thread. */
  copyMilliseconds: number;
  /** Milliseconds building the tree in the worker. */
  buildMilliseconds: number;
}>;

/**
 * How a request ended. `superseded` means the geometry changed or was released while it waited or built, so its tree
 * was discarded; `failed` means the worker failed twice; `disposed` means the client was disposed first.
 */
export type BvhWorkerOutcome =
  | Readonly<{ status: 'built'; tree: BvhWorkerTree }>
  | Readonly<{ status: 'superseded' }>
  | Readonly<{ status: 'failed'; reason: string }>
  | Readonly<{ status: 'disposed' }>;

/** The part of a `Worker` the client uses, so tests can supply a double. */
export type BvhWorkerPort = {
  postMessage(message: BvhBuildRequest, transfer: Transferable[]): void;
  terminate(): void;
  addEventListener(type: 'message' | 'error' | 'messageerror', listener: (event: Event) => void): void;
};

export type BvhWorkerClient = Readonly<{
  /**
   * Builds the geometry's tree in the worker. `isCurrent` is asked before the copy is made and again when the tree
   * lands; once it says no, the request ends `superseded`. A newer request for the same geometry supersedes a queued
   * one. The promise never rejects.
   */
  build(geometry: THREE.BufferGeometry, isCurrent: () => boolean): Promise<BvhWorkerOutcome>;
  /** Drops the geometry's queued request; one already in the worker is discarded when it lands. */
  release(geometry: THREE.BufferGeometry): void;
  /** Terminates the worker and ends every request `disposed`. */
  dispose(): void;
}>;

type Job = {
  readonly geometry: THREE.BufferGeometry;
  readonly isCurrent: () => boolean;
  readonly resolve: (outcome: BvhWorkerOutcome) => void;
  /** Failed attempts so far: the first failure recreates the worker and retries, the second ends the request. */
  failures: number;
  id: number;
  /** Milliseconds copying the bytes of the last attempt. */
  copyMilliseconds: number;
};

const copyAttribute = (attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute): BvhAttributeCopy => {
  if (attribute instanceof THREE.InterleavedBufferAttribute) {
    return {
      // oxlint-disable-next-line unicorn/prefer-spread -- Keep the typed-array constructor for transferable bytes.
      array: attribute.data.array.slice(),
      itemSize: attribute.itemSize,
      normalized: attribute.normalized,
      stride: attribute.data.stride,
      offset: attribute.offset,
    };
  }
  // oxlint-disable-next-line unicorn/prefer-spread -- Keep the typed-array constructor for transferable bytes.
  return { array: attribute.array.slice(), itemSize: attribute.itemSize, normalized: attribute.normalized };
};

const failureReason = (event: Event): string => {
  if (event instanceof ErrorEvent && event.message.length > 0) {
    return event.message;
  }
  return event.type === 'messageerror' ? 'The BVH worker could not read a message.' : 'The BVH worker failed.';
};

/**
 * One lazily created BVH worker for this realm. It builds one tree at a time from copies of the geometry's bytes,
 * never its own buffers, and holds nothing between requests. A worker error terminates it; the request is retried
 * once on a new worker and fails on a second error. The worker is terminated after a minute without work.
 */
export const createBvhWorkerClient = (
  createWorker: () => BvhWorkerPort = () =>
    new Worker(new URL('../workers/bvh.worker.ts', import.meta.url), { type: 'module', name: 'tau-bvh' }),
): BvhWorkerClient => {
  let worker: BvhWorkerPort | undefined;
  let active: Job | undefined;
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  let nextId = 1;
  let disposed = false;
  const queue: Job[] = [];

  const terminate = (): void => {
    clearTimeout(idleTimer);
    idleTimer = undefined;
    const current = worker;
    worker = undefined;
    current?.terminate();
  };

  const settle = (job: Job, outcome: BvhWorkerOutcome): void => {
    if (active === job) {
      active = undefined;
    }
    job.resolve(outcome);
  };

  const fail = (job: Job, reason: string): void => {
    // A worker that threw or posted an error may hold a broken heap: never reuse it.
    terminate();
    job.failures += 1;
    if (job.failures < 2 && !disposed) {
      active = undefined;
      queue.unshift(job);
    } else {
      settle(job, { status: 'failed', reason });
    }
    pump();
  };

  const onMessage = (source: BvhWorkerPort, event: Event): void => {
    const message = (event as MessageEvent<BvhWorkerMessage>).data;
    const job = active;
    if (worker !== source || !job || message.id !== job.id) {
      return;
    }
    if (message.type === 'error') {
      fail(job, message.message);
      return;
    }
    settle(
      job,
      job.isCurrent()
        ? {
            status: 'built',
            tree: {
              version: message.version,
              roots: message.roots,
              indirectBuffer: message.indirectBuffer,
              copyMilliseconds: job.copyMilliseconds,
              buildMilliseconds: message.buildMilliseconds,
            },
          }
        : { status: 'superseded' },
    );
    pump();
  };

  const acquire = (): BvhWorkerPort => {
    if (worker) {
      return worker;
    }
    const created = createWorker();
    worker = created;
    created.addEventListener('message', (event) => {
      onMessage(created, event);
    });
    const onFailure = (event: Event): void => {
      // Handled here: the client retries or fails the request, so the error does not reach the page as uncaught.
      event.preventDefault();
      if (worker === created && active) {
        fail(active, failureReason(event));
      }
    };
    created.addEventListener('error', onFailure);
    created.addEventListener('messageerror', onFailure);
    return created;
  };

  const post = (job: Job): void => {
    const position = job.geometry.getAttribute('position') as
      | THREE.BufferAttribute
      | THREE.InterleavedBufferAttribute
      | undefined;
    if (!position) {
      settle(job, { status: 'failed', reason: 'The geometry has no position attribute.' });
      return;
    }
    const copyStartedAt = performance.now();
    const positionCopy = copyAttribute(position);
    const index = job.geometry.getIndex();
    const indexCopy = index ? copyAttribute(index) : undefined;
    job.copyMilliseconds = performance.now() - copyStartedAt;
    job.id = nextId++;
    const request: BvhBuildRequest = {
      type: 'build',
      id: job.id,
      position: positionCopy,
      index: indexCopy,
      groups: job.geometry.groups.map(({ start, count, materialIndex }) => ({ start, count, materialIndex })),
      drawRange: { start: job.geometry.drawRange.start, count: job.geometry.drawRange.count },
      options: bvhBuildOptions,
    };
    const transfer: Transferable[] = [positionCopy.array.buffer as ArrayBuffer];
    if (indexCopy) {
      transfer.push(indexCopy.array.buffer as ArrayBuffer);
    }
    try {
      acquire().postMessage(request, transfer);
    } catch (error) {
      fail(job, error instanceof Error ? error.message : String(error));
    }
  };

  function pump(): void {
    if (disposed) {
      return;
    }
    while (!active && queue.length > 0) {
      const job = queue.shift()!;
      if (!job.isCurrent()) {
        settle(job, { status: 'superseded' });
        continue;
      }
      clearTimeout(idleTimer);
      idleTimer = undefined;
      active = job;
      post(job);
    }
    if (!active && queue.length === 0 && worker && idleTimer === undefined) {
      idleTimer = setTimeout(terminate, bvhWorkerIdleMilliseconds);
    }
  }

  return {
    // Async, yet the request is queued and posted before the first await, in the caller's turn.
    async build(geometry, isCurrent) {
      if (disposed) {
        return { status: 'disposed' };
      }
      return new Promise((resolve) => {
        const queued = queue.findIndex((job) => job.geometry === geometry);
        if (queued !== -1) {
          const [superseded] = queue.splice(queued, 1);
          superseded!.resolve({ status: 'superseded' });
        }
        queue.push({ geometry, isCurrent, resolve, failures: 0, id: 0, copyMilliseconds: 0 });
        pump();
      });
    },
    release(geometry) {
      for (let index = queue.length - 1; index >= 0; index--) {
        if (queue[index]!.geometry === geometry) {
          const [released] = queue.splice(index, 1);
          released!.resolve({ status: 'superseded' });
        }
      }
    },
    dispose() {
      disposed = true;
      terminate();
      const pending = [...(active ? [active] : []), ...queue.splice(0)];
      active = undefined;
      for (const job of pending) {
        job.resolve({ status: 'disposed' });
      }
    },
  };
};
