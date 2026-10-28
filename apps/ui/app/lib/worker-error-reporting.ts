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
    const isMessageError = event.type === 'messageerror';
    const errorEvent = typeof ErrorEvent !== 'undefined' && event instanceof ErrorEvent ? event : undefined;
    const message =
      errorEvent !== undefined && errorEvent.message !== ''
        ? errorEvent.message
        : isMessageError
          ? 'A worker message could not be deserialized'
          : 'A worker failed';
    const location =
      errorEvent !== undefined && errorEvent.filename !== ''
        ? { filename: errorEvent.filename, lineno: errorEvent.lineno, colno: errorEvent.colno }
        : {};
    // async-iife: bootstrap -- an event listener cannot await; reporting never rejects.
    void reportUiError(new WorkerFailure(message), {
      tags: { worker: name, ...(name === 'kernel' ? { 'runtime.transport': 'web-worker' } : {}) },
      contexts: { worker: { event: event.type, ...location } },
      fingerprint: ['worker-failure', name, event.type, message],
    });
  };
  worker.addEventListener('error', report);
  worker.addEventListener('messageerror', report);
  return worker;
};
