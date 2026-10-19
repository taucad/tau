/**
 * A `Worker` stand-in that records each start, for tests that count the
 * language workers a page runs. A worker that never answers is enough: the
 * count is taken when it starts.
 */

/** A class usable as the `Worker` global or as a Vite `?worker` default export. */
export type WorkerStubClass = new (url?: string | URL, options?: WorkerOptions) => Worker;

/**
 * Create a `Worker` class that appends a label to `started` on construction.
 *
 * @param started - Receives one label per worker started.
 * @param label - The label to record; defaults to the worker's `name` option.
 * @returns The worker class.
 */
export function createWorkerStub(started: string[], label?: string): WorkerStubClass {
  return class extends EventTarget {
    public onmessage: ((event: MessageEvent) => void) | undefined = undefined;
    public onerror: ((event: ErrorEvent) => void) | undefined = undefined;

    public constructor(_url?: string | URL, options?: WorkerOptions) {
      super();
      started.push(label ?? options?.name ?? 'worker');
    }

    public postMessage(): void {
      // Never answers.
    }

    public terminate(): void {
      // Nothing runs.
    }
  } as unknown as WorkerStubClass;
}
