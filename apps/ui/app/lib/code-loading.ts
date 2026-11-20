/**
 * The one owner of every code load in the page realm (PL7 service worker staging defects blueprint, FP9).
 *
 * A JavaScript realm keeps a failed module, and a module whose static dependency failed, for its whole life: asking
 * again for the same specifier fails again, and `React.lazy` keeps its rejection too. So a failed load is recovered
 * by a new realm (a document load into the live build), never by retrying in place. Route modules keep React Router's
 * patched loader (TAU-UI-S, RR9); every other `import()` in the page goes through {@link load}, and every lazy
 * component through `lazy` (`#lib/lazy-component`), which `tau-lint/no-unowned-code-load` enforces.
 *
 * - `load(async () => import('…'))` hands a module load failure to the page's recovery (`stale-build-recovery`, which
 *   installs itself with {@link setCodeLoadFailureHandler}) and rejects with the same failure, so the caller still
 *   sees it. The recovery decides: reload, offer the reload, or call it genuine.
 * - `load(async () => import('…'), { optional: true })` is for code the caller can do without (decoration, analytics): the
 *   failure is the caller's, which degrades, and it never reloads the page.
 * - `lazy(factory, { fallback })` (`#lib/lazy-component`, kept apart so worker bundles never take React) renders `fallback` in place of optional code whose load failed, instead of failing
 *   the panel that holds it.
 *
 * This module has no dependencies, so a worker or the server can import modules that use it: there no recovery is
 * installed and {@link load} only passes the failure on. Worker realms have their own owner (FP10).
 */

const moduleLoadMessages = [
  /Importing a module script failed/u,
  /Failed to fetch dynamically imported module/u,
  /error loading dynamically imported module/iu,
  /Unable to preload CSS/u,
] as const;

const isOwnModuleLoadFailure = (error: unknown): boolean =>
  error instanceof Error && moduleLoadMessages.some((pattern) => pattern.test(error.message));

/**
 * Whether a caught value is a browser's failure to load a module script, worded per engine: WebKit "Importing a
 * module script failed.", Chromium "Failed to fetch dynamically imported module", Firefox "error loading dynamically
 * imported module", Vite's preloader "Unable to preload CSS". A failure wrapped once (its `cause`) counts too.
 *
 * @param error - The caught value.
 * @returns `true` for a module load failure.
 */
export const isModuleLoadFailure = (error: unknown): boolean =>
  isOwnModuleLoadFailure(error) || (error instanceof Error && isOwnModuleLoadFailure(error.cause));

/** Receives each module load failure of required code, once per {@link load}. */
export type CodeLoadFailureHandler = (failure: unknown) => void;

let failureHandler: CodeLoadFailureHandler | undefined;

/**
 * Install the page's recovery for failed code loads; `stale-build-recovery` does this once per page.
 *
 * @param handler - The recovery, or `undefined` to remove it.
 */
export const setCodeLoadFailureHandler = (handler: CodeLoadFailureHandler | undefined): void => {
  failureHandler = handler;
};

/** How a load is made. */
export type LoadOptions = Readonly<{
  /**
   * The caller can do without this code and degrades on its own: a failure is not handed to the recovery, so it
   * never reloads the page.
   */
  optional?: boolean;
}>;

/**
 * Load code through the owner: the one way the page realm calls `import()`.
 *
 * @param importer - The one `import()` to make, as `() => import('…')`.
 * @param options - Whether the code is optional.
 * @returns The module.
 * @throws The importer's own rejection, after handing a module load failure of required code to the recovery.
 */
export const load = async <Module>(importer: () => Promise<Module>, options: LoadOptions = {}): Promise<Module> => {
  try {
    return await importer();
  } catch (error) {
    if (options.optional !== true && isModuleLoadFailure(error)) {
      failureHandler?.(error);
    }
    throw error;
  }
};

/**
 * Hand a code-load failure the owner did not make itself to the page's recovery: a module worker whose script, or code
 * inside it, failed to load once its owner has no new worker left to try (FP10).
 *
 * @param failure - The failure.
 */
export const reportCodeLoadFailure = (failure: unknown): void => {
  failureHandler?.(failure);
};
