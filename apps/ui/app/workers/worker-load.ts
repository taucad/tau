/**
 * The one loader for imports inside a worker realm (PL7 service worker staging defects blueprint, FP10).
 *
 * A worker keeps a module that failed to load, and a module whose static dependency failed, for its whole life, so
 * asking again inside the same worker fails again. The loader reports such a failure as `WORKER_LOAD_FAILED`, keeping
 * the browser's own words (which the page's code-load recovery recognises) and the failure as its `cause`. The page
 * answers it with a new worker (`agent-host-client`), or, past its bound, with its own recovery (FP9). Every `import()`
 * in a worker realm goes through {@link loadInWorker}, which `tau-lint/no-unowned-code-load` enforces.
 *
 * Dependency-free: worker bundles import it.
 */

const moduleLoadMessages = [
  /Importing a module script failed/u,
  /Failed to fetch dynamically imported module/u,
  /error loading dynamically imported module/iu,
  /Unable to preload CSS/u,
] as const;

/** The error code of a worker's code that failed to load. */
export const workerLoadFailedCode = 'WORKER_LOAD_FAILED';

/**
 * Whether a value is a worker's code failing to load (`WORKER_LOAD_FAILED`), however it crossed to the page.
 *
 * @param error - The caught value.
 * @returns `true` for a worker load failure.
 */
export const isWorkerLoadFailure = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && 'code' in error && error.code === workerLoadFailedCode;

/**
 * Load code inside a worker through the owner.
 *
 * @param importer - The one `import()` to make, as `async () => import('…')`.
 * @returns The module.
 * @throws A `WORKER_LOAD_FAILED` error for a module load failure; any other error unchanged.
 */
export const loadInWorker = async <Module>(importer: () => Promise<Module>): Promise<Module> => {
  try {
    return await importer();
  } catch (error) {
    if (!(error instanceof Error) || !moduleLoadMessages.some((pattern) => pattern.test(error.message))) {
      throw error;
    }
    throw Object.assign(new Error(`Worker failed to load: ${error.message}`, { cause: error }), {
      code: workerLoadFailedCode,
    });
  }
};
