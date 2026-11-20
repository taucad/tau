import { workerCodeLoadFailureType } from '#lib/code-loading.js';
import type { WorkerCodeLoadFailureMessage } from '#lib/code-loading.js';

/**
 * The one factory for the web app's module workers (PL7 staging defects blueprint FP10, D18): every
 * `new Worker(new URL(…), { type: 'module' })` is the body of a thunk passed to {@link createModuleWorker}, which
 * `tau-lint/code-loading-owner` enforces.
 *
 * A worker is a realm of its own: a module it failed to load, its script or anything the script imports, stays failed
 * for the worker's life, so the only recovery is a new worker. The factory hears both ways a worker's code can fail:
 * its script (a bare `error` event, before the worker ran) and an import inside it (the worker's `loadCode` posts
 * {@link workerCodeLoadFailureType}, which the factory takes off the worker's own channel). Either becomes one
 * {@link WorkerCodeLoadError}, handed once to the page's handler ({@link setWorkerCodeLoadHandler}), and an import's is
 * also dispatched as the worker's `error` event, so the worker's owner retires it as it retires any failed worker.
 * The owner replaces it within the page's bound and backoff, after which the page's own recovery (a reload into the
 * live build, or Reload offered) takes over.
 */

/** A worker whose code failed to load; `cause` is the browser's own failure. */
export class WorkerCodeLoadError extends Error {
  public override readonly name = 'WorkerCodeLoadError';
  /** The wire code a worker's owner reports it by. */
  public get code(): 'WORKER_LOAD_FAILED' {
    return 'WORKER_LOAD_FAILED';
  }
  /** The worker's name, as the factory was given it. */
  public readonly worker: string;

  /**
   * @param worker - The worker's name, as the factory was given it.
   * @param failure - The browser's failure to load the worker's code.
   */
  public constructor(worker: string, failure: Error) {
    super(`The ${worker} worker failed to load: ${failure.message}`, { cause: failure });
    this.worker = worker;
  }
}

/**
 * Whether a value is a worker's code failing to load: a {@link WorkerCodeLoadError}, or an error a worker's own
 * protocol carried across with the same code.
 *
 * @param value - The caught value.
 * @returns `true` for a worker code load failure.
 */
export const isWorkerCodeLoadFailure = (value: unknown): boolean =>
  value instanceof WorkerCodeLoadError ||
  (value instanceof Object && (value as { code?: unknown }).code === 'WORKER_LOAD_FAILED');

/** What the page does with a worker whose code failed to load: count it, and hand it on past the bound. */
export type WorkerCodeLoadHandler = (failure: WorkerCodeLoadError) => void;

let handler: WorkerCodeLoadHandler | undefined;

/**
 * Install the page's handler for workers whose code failed to load. The page installs one at boot.
 *
 * @param next - The handler, or `undefined` to remove it.
 * @returns Restores the handler installed before.
 */
export const setWorkerCodeLoadHandler = (next: WorkerCodeLoadHandler | undefined): (() => void) => {
  const previous = handler;
  handler = next;
  return () => {
    handler = previous;
  };
};

/** Options for {@link createModuleWorker}. */
export type CreateModuleWorkerOptions = Readonly<{
  /** The worker's name in reports and bounds, such as `agent-host`. */
  name: string;
}>;

const isFailureMessage = (data: unknown): data is WorkerCodeLoadFailureMessage =>
  typeof data === 'object' &&
  data !== null &&
  (data as { type?: unknown }).type === workerCodeLoadFailureType &&
  typeof (data as { message?: unknown }).message === 'string';

/** Errors the factory dispatched itself, so its own `error` listener does not count them twice. */
const dispatched = new WeakSet<Event>();

/**
 * Start a module worker through the one factory.
 *
 * @example
 * ```ts
 * const worker = createModuleWorker(() => new Worker(new URL('x.worker.ts', import.meta.url), { type: 'module' }), {
 *   name: 'x',
 * });
 * ```
 *
 * @param construct - Constructs the worker with a literal `new URL(…, import.meta.url)`, so the bundler emits it.
 * @param options - The worker's name.
 * @returns The worker, as constructed.
 */
export const createModuleWorker = (construct: () => Worker, options: CreateModuleWorkerOptions): Worker => {
  const worker = construct();
  let hasFailed = false;
  const fail = (failure: WorkerCodeLoadError): void => {
    if (hasFailed) {
      return;
    }
    hasFailed = true;
    try {
      handler?.(failure);
    } catch {
      // The page's own fault never replaces the failure the worker's owner handles.
    }
  };
  // First, so the worker's own protocol never sees the factory's message.
  worker.addEventListener('message', (event: MessageEvent<unknown>) => {
    if (!isFailureMessage(event.data)) {
      return;
    }
    event.stopImmediatePropagation();
    const failure = new WorkerCodeLoadError(options.name, new TypeError(event.data.message));
    fail(failure);
    const announced = new ErrorEvent('error', { error: failure, message: failure.message });
    dispatched.add(announced);
    worker.dispatchEvent(announced);
  });
  worker.addEventListener('error', (event: Event) => {
    // A module worker whose script, or a static import of it, fails to load fires a bare `error` event; an uncaught
    // error inside a running worker fires an `ErrorEvent` with its message, which is the owner's to handle.
    const thrown: unknown = (event as Partial<ErrorEvent>).error;
    const { message } = event as Partial<ErrorEvent>;
    if (dispatched.has(event) || thrown !== undefined || (message !== undefined && message !== '')) {
      return;
    }
    fail(new WorkerCodeLoadError(options.name, new TypeError('Importing a module script failed.')));
  });
  return worker;
};
