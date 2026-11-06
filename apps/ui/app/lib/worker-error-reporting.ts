import { ENV } from '#environment.config.js';
import { reportUiError } from '#lib/error-reporting.js';

/**
 * The page workers whose failures are reported (SB4), as the `worker` tag names them. `observability-harness` is the
 * staging harness's own throwing worker (SB15), never a product worker.
 */
export type ReportedWorker =
  | 'file-manager'
  | 'agent-host'
  | 'import-github'
  | 'printer'
  | 'kernel'
  | 'observability-harness';

/** A worker failure seen on the main thread: an uncaught error inside it, or a message it could not deserialize. */
export class WorkerFailure extends Error {
  public override readonly name = 'WorkerFailure';
}

/** What the worker threw, as far as the event carries it: `ErrorEvent.error` is often `null` across the worker boundary. */
type Thrown = { readonly name: string; readonly message: string; readonly stack?: string };

const describeThrown = (error: unknown): Thrown | undefined => {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, ...(error.stack === undefined ? {} : { stack: error.stack }) };
  }
  return typeof error === 'string' && error !== '' ? { name: 'Error', message: error } : undefined;
};

/**
 * The report's message: the browser's own error message, else the thrown error's, else the failing script, and the
 * generic sentence only when the event carries none of them (a worker script that fails to load fires a plain `error`
 * event with nothing in it).
 */
const failureMessage = ({
  type,
  eventMessage,
  thrown,
  scriptUrl,
}: {
  readonly type: string;
  readonly eventMessage: string | undefined;
  readonly thrown: Thrown | undefined;
  readonly scriptUrl: string | undefined;
}): string => {
  if (eventMessage !== undefined && eventMessage !== '') {
    return eventMessage;
  }
  if (thrown !== undefined && thrown.message !== '') {
    return `${thrown.name}: ${thrown.message}`;
  }
  if (type === 'error' && scriptUrl !== undefined) {
    return `A worker failed in ${scriptPath(scriptUrl)}`;
  }
  return type === 'messageerror' ? 'A worker message could not be deserialized' : 'A worker failed';
};

/** The script's path, so one failing script groups the same on every host that serves it. */
const scriptPath = (scriptUrl: string): string => {
  try {
    return new URL(scriptUrl).pathname;
  } catch {
    return scriptUrl;
  }
};

/** Workers that have reported once: one report per worker incarnation, whatever follows. */
const reportedWorkers = new WeakSet<Worker>();

/**
 * Report a worker's main-thread `error` and `messageerror` events, once per incarnation (this `Worker` object), with
 * the `worker` tag and, for a kernel worker, the transport of the runtime vocabulary. The page's other listeners
 * keep their own handling. While reporting is configured, every such event is marked handled, so the browser does not
 * repeat it on `window` for the global handlers to report a second time.
 *
 * @param worker - A worker the page just started.
 * @param name - Which worker it is.
 * @returns The same worker.
 */
export const reportWorkerFailures = <Started extends Worker>(worker: Started, name: ReportedWorker): Started => {
  const report = (event: Event): void => {
    if (!ENV.SENTRY_DSN) {
      return;
    }
    if (event.type === 'error') {
      event.preventDefault();
    }
    if (reportedWorkers.has(worker)) {
      return;
    }
    reportedWorkers.add(worker);
    const errorEvent = typeof ErrorEvent !== 'undefined' && event instanceof ErrorEvent ? event : undefined;
    const thrown = describeThrown(errorEvent?.error);
    const scriptUrl = errorEvent !== undefined && errorEvent.filename !== '' ? errorEvent.filename : undefined;
    const message = failureMessage({ type: event.type, eventMessage: errorEvent?.message, thrown, scriptUrl });
    const location =
      scriptUrl === undefined ? {} : { filename: scriptUrl, lineno: errorEvent?.lineno, colno: errorEvent?.colno };
    // async-iife: bootstrap -- an event listener cannot await; reporting never rejects.
    void reportUiError(new WorkerFailure(message, thrown === undefined ? undefined : { cause: errorEvent?.error }), {
      tags: { worker: name, ...(name === 'kernel' ? { 'runtime.transport': 'web-worker' } : {}) },
      contexts: { worker: { event: event.type, ...location, ...(thrown === undefined ? {} : { error: thrown }) } },
      fingerprint: [
        'worker-failure',
        name,
        event.type,
        ...(thrown === undefined ? [] : [thrown.name]),
        message,
        ...(scriptUrl === undefined ? [] : [scriptPath(scriptUrl)]),
      ],
    });
  };
  worker.addEventListener('error', report);
  worker.addEventListener('messageerror', report);
  return worker;
};
