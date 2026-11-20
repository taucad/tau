/**
 * The one owner of loading code at run time (PL7 staging defects blueprint FP9, D21): every dynamic `import()` in the
 * web app's page goes through {@link loadCode} (`lazyCode` for React components), which `tau-lint/code-loading-owner`
 * enforces.
 *
 * A JavaScript realm keeps a module that failed to load, and every module that failed as its dependency, failed for
 * the realm's life: asking again for the same specifier fails again, without a request (Finding 9). So this owner
 * never retries in place. It hands the failure, once, to the realm's recovery (the page installs the stale-build
 * recovery, which reloads the document into the live build within its guard, budget and no-input window, or offers
 * the reload) and rethrows it, so the caller's own error path runs: a panel then offers Reload, never an in-place
 * retry. Optional code ({@link LoadCodeOptions.optional}) degrades instead: the recovery hears of it, never reloads
 * for it, and the caller falls back.
 *
 * Realm-neutral and dependency-free: the page installs its recovery through {@link setCodeLoadFailureSink}; a
 * dedicated module worker tells its page by default ({@link workerCodeLoadFailureType}, FP10), and the page replaces
 * the worker, since a new worker is a new realm.
 */

/** How the realm's recovery should treat a failed load: code the caller needs, or code it can do without. */
export type CodeLoadKind = 'required' | 'optional';

/** The realm's recovery for a failed code load; told once per failure, never asked to retry it. */
export type CodeLoadFailureSink = (failure: unknown, kind: CodeLoadKind) => void;

/** Options for {@link loadCode}. */
export type LoadCodeOptions = {
  /**
   * Code the caller can do without (a decorative component, an enhancement): the recovery reports it and never
   * reloads the page for it; the caller degrades to its fallback.
   */
  readonly optional?: boolean;
};

const codeLoadMessages = [
  /Importing a module script failed/u,
  /Failed to fetch dynamically imported module/u,
  /error loading dynamically imported module/iu,
  /Unable to preload CSS/u,
] as const;

/**
 * Whether a caught value is, or wraps as its `cause`, a browser's failure to load a module script, worded per engine
 * and without a stack:
 * WebKit "Importing a module script failed.", Chromium "Failed to fetch dynamically imported module", Firefox "error
 * loading dynamically imported module", Vite's preloader "Unable to preload CSS".
 *
 * @param error - The caught value.
 * @returns `true` for a dynamic import or Vite preload failure in any engine.
 */
export const isCodeLoadFailure = (error: unknown): boolean => {
  // A wrapper (a worker's own load error, a test runner's mocked module) keeps the browser's failure as its cause.
  for (let current: unknown = error, depth = 0; current instanceof Error && depth < 4; depth += 1) {
    const { message } = current;
    if (codeLoadMessages.some((pattern) => pattern.test(message))) {
      return true;
    }
    current = current.cause;
  }
  return false;
};

/**
 * The message a module worker's realm posts to the page when code it needs failed to load (PL7 staging defects
 * FP10): the page's module-worker factory (`@taucad/ui-core/lib/worker-factory`) takes it off the worker's own channel
 * and replaces the worker, since that realm can never load the module again.
 */
export const workerCodeLoadFailureType = 'tau/worker-code-load-failed';

/** {@link workerCodeLoadFailureType}'s message. */
export type WorkerCodeLoadFailureMessage = Readonly<{
  type: typeof workerCodeLoadFailureType;
  /** The browser's own wording, which names the module that failed. */
  message: string;
}>;

/**
 * Whether this realm is a dedicated worker, whose parent hears what it posts on its own scope. A service worker or a
 * shared worker has no one parent to tell.
 */
const isDedicatedWorker = (): boolean => {
  const scope = (globalThis as { DedicatedWorkerGlobalScope?: abstract new () => unknown }).DedicatedWorkerGlobalScope;
  return scope !== undefined && globalThis instanceof scope;
};

/**
 * A dedicated worker's recovery, installed by default: tell the page, which owns replacing the worker. Optional code
 * degrades inside the worker and is not worth a new one.
 */
const tellParentWorker: CodeLoadFailureSink = (failure, kind) => {
  if (kind === 'required') {
    const message: WorkerCodeLoadFailureMessage = {
      type: workerCodeLoadFailureType,
      message: failure instanceof Error ? failure.message : String(failure),
    };
    globalThis.postMessage(message);
  }
};

let sink: CodeLoadFailureSink | undefined;
let isSinkInstalled = false;

/**
 * Install this realm's recovery for failed code loads. The page installs the stale-build recovery once, at boot.
 *
 * @param next - The recovery, or `undefined` to remove it.
 * @returns Restores the recovery installed before.
 */
export const setCodeLoadFailureSink = (next: CodeLoadFailureSink | undefined): (() => void) => {
  const previous = sink;
  const wasInstalled = isSinkInstalled;
  sink = next;
  isSinkInstalled = true;
  return () => {
    sink = previous;
    isSinkInstalled = wasInstalled;
  };
};

/** The installed recovery, or a dedicated worker's default: telling its page. */
const currentSink = (): CodeLoadFailureSink | undefined =>
  isSinkInstalled ? sink : isDedicatedWorker() ? tellParentWorker : undefined;

/**
 * Load code through the realm's one owner: run the importer once and, when the browser fails to load the module, hand
 * the failure to the realm's recovery before rethrowing it. Never retries: the same specifier would fail again in
 * this realm.
 *
 * @example
 * ```ts
 * const { createTerminalRenderer } = await loadCode(async () => import('#components/terminal/terminal-renderer.js'));
 * ```
 *
 * @param importer - Calls `import()` with a literal specifier, so the bundler still splits the chunk.
 * @param options - Whether the caller can do without the code.
 * @returns The module.
 */
export const loadCode = async <Module>(importer: () => Promise<Module>, options?: LoadCodeOptions): Promise<Module> => {
  try {
    return await importer();
  } catch (error) {
    if (isCodeLoadFailure(error)) {
      try {
        currentSink()?.(error, options?.optional === true ? 'optional' : 'required');
      } catch {
        // The recovery's own fault never replaces the failure the caller handles.
      }
    }
    throw error;
  }
};
