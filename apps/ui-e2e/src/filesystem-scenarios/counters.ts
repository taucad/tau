/**
 * Count what a filesystem scenario costs, from outside the code under test.
 *
 * Installed once in the realm that hosts the authority (the scenario worker),
 * this wraps the platform primitives every filesystem path ends in — Web Locks,
 * OPFS handles and streams, blob reads, broadcasts and fetches — so the counts
 * need no production instrumentation and stay inert everywhere else. Spans come
 * from the production `workerTimings` recorder (#1410) beside these counts.
 *
 * No path, URL or content is kept except the handle names a scenario asks to
 * trace by name.
 *
 * @module
 */

/** The counters one scenario window reports. */
export type ScenarioCounts = {
  /** `navigator.locks.request` calls. */
  lockRequests: number;
  /**
   * Lock chains as seen from outside: requests not issued from inside another
   * lock's callback. A cross-check only; the gated lock-set count is the
   * production `locks.set` counter.
   */
  lockChains: number;
  /** Total milliseconds requests waited before their callback ran. */
  lockWait: number;
  /** Longest single wait. */
  lockWaitMax: number;
  /** `createWritable` opens and the files they committed. */
  writableOpens: number;
  writableCommits: number;
  /** `createSyncAccessHandle` opens and the ones that wrote. */
  syncHandleOpens: number;
  syncHandleWriteSessions: number;
  /** Durable writes: committed writables plus sync sessions that wrote. */
  writes: number;
  bytesWritten: number;
  /** Native `move()` calls (renames and moves). */
  renames: number;
  removes: number;
  /** `getFile()` calls (metadata or content). */
  getFileCalls: number;
  /** `getFileHandle`/`getDirectoryHandle` lookups. */
  handleLookups: number;
  /** Blob/File content reads and their bytes, plus sync-handle reads. */
  blobReads: number;
  bytesRead: number;
  /** `crypto.subtle.digest` calls and bytes. */
  digests: number;
  bytesHashed: number;
  /** `BroadcastChannel.postMessage` (cross-tab ports) and `MessagePort.postMessage`. */
  broadcastPosts: number;
  portPosts: number;
  /** `fetch` calls by kind. */
  network: Record<string, number>;
};

const emptyCounts = (): ScenarioCounts => ({
  lockRequests: 0,
  lockChains: 0,
  lockWait: 0,
  lockWaitMax: 0,
  writableOpens: 0,
  writableCommits: 0,
  syncHandleOpens: 0,
  syncHandleWriteSessions: 0,
  writes: 0,
  bytesWritten: 0,
  renames: 0,
  removes: 0,
  getFileCalls: 0,
  handleLookups: 0,
  blobReads: 0,
  bytesRead: 0,
  digests: 0,
  bytesHashed: 0,
  broadcastPosts: 0,
  portPosts: 0,
  network: {},
});

/** When a write to a traced handle name first began, on `performance.now()`, and the writes and renames before it. */
export type TracedWrite = Readonly<{ name: string; startedAt: number; operationsBefore: number }>;

/** The installed instrumentation. */
export type ScenarioCounters = Readonly<{
  /** Start a fresh window. */
  reset: () => void;
  /** The counts since the last reset. */
  read: () => ScenarioCounts;
  /** Record when any write to a handle with one of these names starts. */
  trace: (names: readonly string[]) => void;
  /** The traced writes since the last reset. */
  traced: () => readonly TracedWrite[];
}>;

/**
 * Classify a request URL into the kinds the scenario gates count.
 *
 * @param url - The request URL.
 * @returns `info-refs`, `upload-pack`, `receive-pack`, `lfs-batch`, `lfs-object` or `other`.
 */
export const networkKind = (url: string): string => {
  if (/\/info\/refs(?:\?|$)/u.test(url)) {
    return 'info-refs';
  }
  if (url.includes('git-upload-pack')) {
    return 'upload-pack';
  }
  if (url.includes('git-receive-pack')) {
    return 'receive-pack';
  }
  if (url.includes('/info/lfs/objects/batch')) {
    return 'lfs-batch';
  }
  if (url.includes('/lfs/')) {
    return 'lfs-object';
  }
  return 'other';
};

/* Platform shapes the DOM library this project compiles against does not carry. */
type SyncAccessHandle = {
  read: (buffer: ArrayBufferView, options?: { at?: number }) => number;
  write: (buffer: ArrayBufferView, options?: { at?: number }) => number;
  close: () => void;
};
type SyncHandleFactory = { createSyncAccessHandle?: () => Promise<SyncAccessHandle> };
type Movable = { move?: (...parameters: unknown[]) => Promise<void> };
type LockRequest = (name: string, ...rest: unknown[]) => Promise<unknown>;

let installed: ScenarioCounters | undefined;

/**
 * Install the counters in this realm, once.
 *
 * @returns The realm's counters.
 */
export const installScenarioCounters = (): ScenarioCounters => {
  if (installed !== undefined) {
    return installed;
  }
  let counts = emptyCounts();
  let tracedNames = new Set<string>();
  let tracedWrites: TracedWrite[] = [];
  const noteWriteStart = (name: string): void => {
    if (tracedNames.has(name) && !tracedWrites.some((write) => write.name === name)) {
      tracedWrites.push({ name, startedAt: performance.now(), operationsBefore: counts.writes + counts.renames });
    }
  };

  /* Locks: a request issued synchronously inside another lock's callback is the
   * next link of the same chain (`withCrossTabLocks` acquires one token per
   * nested callback); any other request starts a new lock set. */
  const locks = navigator.locks as unknown as { request: LockRequest };
  const request = locks.request.bind(navigator.locks);
  let insideCallback = 0;
  locks.request = async (name, ...rest) => {
    counts.lockRequests += 1;
    if (insideCallback === 0) {
      counts.lockChains += 1;
    }
    const requestedAt = performance.now();
    const callbackIndex = rest.findIndex((value) => typeof value === 'function');
    const callback = rest[callbackIndex] as (lock: unknown) => unknown;
    const wrapped = (lock: unknown): unknown => {
      const waited = performance.now() - requestedAt;
      counts.lockWait += waited;
      counts.lockWaitMax = Math.max(counts.lockWaitMax, waited);
      insideCallback += 1;
      try {
        return callback(lock);
      } finally {
        insideCallback -= 1;
      }
    };
    const forwarded = [...rest];
    forwarded[callbackIndex] = wrapped;
    return request(name, ...forwarded);
  };

  /* OPFS writers. */
  const fileHandle = FileSystemFileHandle.prototype as FileSystemFileHandle & SyncHandleFactory;
  const { createWritable } = fileHandle;
  fileHandle.createWritable = async function (this: FileSystemFileHandle, ...parameters) {
    counts.writableOpens += 1;
    noteWriteStart(this.name);
    const stream = await createWritable.apply(this, parameters);
    const write = stream.write.bind(stream);
    const close = stream.close.bind(stream);
    stream.write = async (data) => {
      if (data instanceof Blob) {
        counts.bytesWritten += data.size;
      } else if (ArrayBuffer.isView(data) || data instanceof ArrayBuffer) {
        counts.bytesWritten += data.byteLength;
      } else if (typeof data === 'string') {
        counts.bytesWritten += new TextEncoder().encode(data).byteLength;
      }
      return write(data);
    };
    stream.close = async () => {
      await close();
      counts.writableCommits += 1;
      counts.writes += 1;
    };
    return stream;
  };
  const { createSyncAccessHandle } = fileHandle;
  if (createSyncAccessHandle !== undefined) {
    fileHandle.createSyncAccessHandle = async function (this: FileSystemFileHandle) {
      counts.syncHandleOpens += 1;
      const handle = await createSyncAccessHandle.call(this);
      const { name } = this;
      const read = handle.read.bind(handle);
      const write = handle.write.bind(handle);
      const close = handle.close.bind(handle);
      let wrote = false;
      handle.read = (buffer, options) => {
        const bytes = read(buffer, options);
        counts.blobReads += 1;
        counts.bytesRead += bytes;
        return bytes;
      };
      handle.write = (buffer, options) => {
        if (!wrote) {
          noteWriteStart(name);
        }
        wrote = true;
        const bytes = write(buffer, options);
        counts.bytesWritten += bytes;
        return bytes;
      };
      handle.close = () => {
        close();
        if (wrote) {
          counts.syncHandleWriteSessions += 1;
          counts.writes += 1;
        }
      };
      return handle;
    };
  }
  /* Engines define `move()` on the base handle or on each handle kind; wrap whichever own it. */
  const wrapMove = (prototype: FileSystemHandle): void => {
    const move = Object.getOwnPropertyDescriptor(prototype, 'move')?.value as Movable['move'];
    if (move !== undefined) {
      Object.defineProperty(prototype, 'move', {
        configurable: true,
        writable: true,
        async value(this: FileSystemHandle, ...parameters: unknown[]) {
          counts.renames += 1;
          return move.apply(this, parameters);
        },
      });
    }
  };
  wrapMove(FileSystemHandle.prototype);
  wrapMove(FileSystemFileHandle.prototype);
  wrapMove(FileSystemDirectoryHandle.prototype);
  const directory = FileSystemDirectoryHandle.prototype;
  const { removeEntry } = directory;
  directory.removeEntry = async function (this: FileSystemDirectoryHandle, ...parameters) {
    counts.removes += 1;
    return removeEntry.apply(this, parameters);
  };
  const { getFileHandle } = directory;
  directory.getFileHandle = async function (this: FileSystemDirectoryHandle, ...parameters) {
    counts.handleLookups += 1;
    return getFileHandle.apply(this, parameters);
  };
  const { getDirectoryHandle } = directory;
  directory.getDirectoryHandle = async function (this: FileSystemDirectoryHandle, ...parameters) {
    counts.handleLookups += 1;
    return getDirectoryHandle.apply(this, parameters);
  };
  const { getFile } = fileHandle;
  fileHandle.getFile = async function (this: FileSystemFileHandle) {
    counts.getFileCalls += 1;
    return getFile.call(this);
  };

  /* Content reads. `slice()` makes a Blob whose reads are counted here too. */
  const blob = Blob.prototype;
  const { arrayBuffer } = blob;
  blob.arrayBuffer = async function (this: Blob) {
    const result = await arrayBuffer.call(this);
    counts.blobReads += 1;
    counts.bytesRead += result.byteLength;
    return result;
  };
  const { text } = blob;
  blob.text = async function (this: Blob) {
    counts.blobReads += 1;
    counts.bytesRead += this.size;
    return text.call(this);
  };
  const { bytes } = blob;
  blob.bytes = async function (this: Blob) {
    counts.blobReads += 1;
    counts.bytesRead += this.size;
    return bytes.call(this);
  };
  const { stream } = blob;
  blob.stream = function (this: Blob) {
    counts.blobReads += 1;
    counts.bytesRead += this.size;
    return stream.call(this);
  };

  /* Hashing. */
  const subtle = crypto.subtle as SubtleCrypto & { digest: SubtleCrypto['digest'] };
  const digest = subtle.digest.bind(subtle);
  subtle.digest = async (algorithm, data) => {
    counts.digests += 1;
    counts.bytesHashed += data.byteLength;
    return digest(algorithm, data);
  };

  /* Ports. */
  const broadcastPost = BroadcastChannel.prototype.postMessage;
  BroadcastChannel.prototype.postMessage = function (this: BroadcastChannel, message: unknown) {
    counts.broadcastPosts += 1;
    broadcastPost.call(this, message);
  };
  const portPost = MessagePort.prototype.postMessage;
  MessagePort.prototype.postMessage = function (this: MessagePort, ...parameters: unknown[]) {
    counts.portPosts += 1;
    (portPost as (...values: unknown[]) => void).apply(this, parameters);
  };

  /* Network. */
  const fetchOriginal = globalThis.fetch.bind(globalThis);
  globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const kind = networkKind(url);
    counts.network[kind] = (counts.network[kind] ?? 0) + 1;
    return fetchOriginal(input, init);
  };

  installed = Object.freeze({
    reset: () => {
      counts = emptyCounts();
      tracedWrites = [];
    },
    read: () => ({ ...counts, network: { ...counts.network } }),
    trace: (names: readonly string[]) => {
      tracedNames = new Set(names);
      tracedWrites = [];
    },
    traced: () => [...tracedWrites],
  });
  return installed;
};
