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
 * Realm-neutral and dependency-free: the page and the module workers share it, each installing its own recovery
 * through {@link setCodeLoadFailureSink}.
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

let sink: CodeLoadFailureSink | undefined;

/**
 * Install this realm's recovery for failed code loads. The page installs the stale-build recovery once, at boot.
 *
 * @param next - The recovery, or `undefined` to remove it.
 * @returns Restores the recovery installed before.
 */
export const setCodeLoadFailureSink = (next: CodeLoadFailureSink | undefined): (() => void) => {
  const previous = sink;
  sink = next;
  return () => {
    sink = previous;
  };
};

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
        sink?.(error, options?.optional === true ? 'optional' : 'required');
      } catch {
        // The recovery's own fault never replaces the failure the caller handles.
      }
    }
    throw error;
  }
};
