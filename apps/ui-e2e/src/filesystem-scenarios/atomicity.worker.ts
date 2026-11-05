/**
 * The I1 writer probe: replace a file's bytes and get killed partway.
 *
 * The page writes the old bytes, starts this worker, and terminates it once it
 * reports that it is mid-write; it then reads the target back and classifies
 * it as old, new or partial. No filesystem package code runs here: the probe
 * qualifies the engine's own writers, which the provider builds on.
 *
 * @module
 */

/** How the replacement is written. */
export type AtomicityWriter = 'writable' | 'writable-close' | 'sync-handle';

/** The probe's instruction. */
export type AtomicityRequest = Readonly<{
  writer: AtomicityWriter;
  directory: string;
  name: string;
  size: number;
  chunk: number;
  /** The byte the replacement is filled with. */
  fill: number;
}>;

/** What the worker reports before it is killed. */
export type AtomicityProgress = Readonly<{ type: 'mid-write' | 'closing' | 'done' | 'error'; detail?: string }>;

type SyncAccessHandle = {
  write: (buffer: ArrayBufferView, options?: { at?: number }) => number;
  flush: () => void;
  close: () => void;
};

const report = (progress: AtomicityProgress): void => {
  self.postMessage(progress);
};

const pause = async (milliseconds: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });

const probe = async (request: AtomicityRequest): Promise<void> => {
  const root = await navigator.storage.getDirectory();
  const directory = await root.getDirectoryHandle(request.directory);
  const file = await directory.getFileHandle(request.name);
  const chunk = new Uint8Array(request.chunk).fill(request.fill);
  const chunks = Math.ceil(request.size / request.chunk);
  if (request.writer === 'sync-handle') {
    const handle = await (
      file as FileSystemFileHandle & { createSyncAccessHandle: () => Promise<SyncAccessHandle> }
    ).createSyncAccessHandle();
    for (let index = 0; index < chunks; index += 1) {
      handle.write(chunk.subarray(0, Math.min(request.chunk, request.size - index * request.chunk)), {
        at: index * request.chunk,
      });
      handle.flush();
      if (index === Math.floor(chunks / 2)) {
        report({ type: 'mid-write' });
        /* Hold the handle open, half written, until the page kills this worker. */
        // oxlint-disable-next-line no-await-in-loop -- the kill lands while this pause holds the write open.
        await pause(60_000);
      }
    }
    handle.close();
    report({ type: 'done' });
    return;
  }
  const writable = await file.createWritable({ keepExistingData: false });
  for (let index = 0; index < chunks; index += 1) {
    // oxlint-disable-next-line no-await-in-loop -- chunks go in order.
    await writable.write(chunk.subarray(0, Math.min(request.chunk, request.size - index * request.chunk)));
    if (request.writer === 'writable' && index === Math.floor(chunks / 2)) {
      report({ type: 'mid-write' });
      // oxlint-disable-next-line no-await-in-loop -- the kill lands while this pause holds the write open.
      await pause(60_000);
    }
  }
  /* `writable-close`: every byte is written; the kill races the commit itself. */
  const closing = writable.close();
  report({ type: 'closing' });
  await closing;
  report({ type: 'done' });
};

const run = async (request: AtomicityRequest): Promise<void> => {
  try {
    await probe(request);
  } catch (error) {
    report({ type: 'error', detail: error instanceof Error ? error.message : String(error) });
  }
};

self.addEventListener('message', (event: MessageEvent<AtomicityRequest>) => {
  // async-iife: bootstrap -- the probe reports its own outcome before the page kills this worker.
  void run(event.data);
});
