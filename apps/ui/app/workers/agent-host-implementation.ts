/**
 * The resident agent-host worker's implementation module, loaded once (STO-25 SP6-warm).
 *
 * A `provide` needs the host implementation, the bulk of the worker's code; nothing about loading it depends on what
 * the provide carries. The worker therefore starts the load as soon as the page connects (`warm`), so the module
 * arrives while the page is still opening the project, and the first provide only waits for what is left of it.
 *
 * A load that failed is kept, warm or not (PL7 staging defects FP10, D17): this worker's realm keeps the failed module,
 * and every module that failed with it, so loading again here cannot succeed. The worker's `loadCode` has already told
 * the page, which replaces the worker with a new one. Every use reports the failure; an early failure nobody waited on
 * is logged, never thrown.
 */

/** One module, loaded at most once. */
export type ImplementationLoader<Module> = Readonly<{
  /** Start the load now if nothing has. Never throws. */
  warm: () => void;
  /** The module: the one load, in flight or settled; a failed load fails every use. */
  get: () => Promise<Module>;
}>;

/**
 * Load a module once, and let the load start before its first use.
 *
 * @param load - Loads the module; a rejection is the failure every use reports.
 * @returns The loader.
 */
export const createImplementationLoader = <Module>(load: () => Promise<Module>): ImplementationLoader<Module> => {
  let loading: Promise<Module> | undefined;
  const get = async (): Promise<Module> => {
    loading ??= load();
    return loading;
  };
  return Object.freeze({
    warm: () => {
      if (loading === undefined) {
        // async-iife: bootstrap -- an early load nobody waits on; a use waiting on it reports its failure.
        void (async (): Promise<void> => {
          try {
            await get();
          } catch (error) {
            console.warn('[agent-host worker] early implementation load failed', error);
          }
        })();
      }
    },
    get,
  });
};
