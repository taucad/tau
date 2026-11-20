/**
 * The one factory for the page's module workers (PL7 service worker staging defects blueprint, FP10).
 *
 * Vite bundles a worker only from `new Worker(new URL('…', import.meta.url), { type: 'module' })` written at the call
 * site, so the factory takes that expression as a thunk. It reports the worker's failures (`reportWorkerFailures`)
 * and, when the script itself fails to load (a plain `error` event with nothing in it, which a running worker's
 * uncaught error never is), tells the worker's owner with a `WORKER_LOAD_FAILED` error. An owner that can start a new
 * worker passes `onLoadFailure` and restarts within its own bound; for every other owner the failure goes to the
 * page's code-load recovery (FP9), since a new document is the realm that can load it.
 * `tau-lint/no-unowned-code-load` keeps every page-realm `new Worker` inside this factory.
 */

import { reportCodeLoadFailure } from '#lib/code-loading.js';
import { reportWorkerFailures } from '#lib/worker-error-reporting.js';
import type { ReportedWorker } from '#lib/worker-error-reporting.js';
import { workerLoadFailedCode } from '#workers/worker-load.js';

/** How a module worker is made. */
export type ModuleWorkerOptions = Readonly<{
  /** Which worker it is, as error reports tag it. */
  name: ReportedWorker;
  /**
   * The owner's answer to the script failing to load, typically a restart within its bound. Defaults to the page's
   * code-load recovery.
   */
  onLoadFailure?: (failure: Error) => void;
}>;

/**
 * Whether an `error` event on a `Worker` is its script failing to load: a plain event, or an `ErrorEvent` with no
 * message, never an uncaught error inside a running worker.
 */
const isScriptLoadFailure = (event: Event): boolean =>
  typeof ErrorEvent === 'undefined' || !(event instanceof ErrorEvent) || event.message === '';

/**
 * Create a module worker through the owner.
 *
 * @param create - `() => new Worker(new URL('…', import.meta.url), { type: 'module' })`.
 * @param options - Its name and the owner's answer to a load failure.
 * @returns The worker.
 */
export const createModuleWorker = <Started extends Worker>(
  create: () => Started,
  { name, onLoadFailure = reportCodeLoadFailure }: ModuleWorkerOptions,
): Started => {
  const worker = reportWorkerFailures(create(), name);
  let isReported = false;
  worker.addEventListener('error', (event) => {
    if (isReported || !isScriptLoadFailure(event)) {
      return;
    }
    isReported = true;
    onLoadFailure(
      Object.assign(new Error(`The ${name} worker's script failed to load.`), { code: workerLoadFailedCode }),
    );
  });
  return worker;
};
