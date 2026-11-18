/**
 * The resident agent-host worker's implementation module, loaded once (STO-25 SP6-warm).
 *
 * A `provide` needs the host implementation, the bulk of the worker's code; nothing about loading it depends on what
 * the provide carries. The worker therefore starts the load as soon as the page connects (`warm`), so the module
 * arrives while the page is still opening the project, and the first provide only waits for what is left of it.
 *
 * A load that failed is forgotten, warm or not: the next use loads again, and only a use reports the failure.
 */

/** One module, loaded at most once at a time. */
export type ImplementationLoader<Module> = Readonly<{
  /** Start the load now if nothing has; its failure is left for the next use to retry and report. Never throws. */
  warm: () => void;
  /** The module: the load in flight or done, or a new one when none is or the last one failed. */
  get: () => Promise<Module>;
}>;

/**
 * Load a module once, and let the load start before its first use.
 *
 * @param load - Loads the module; a rejection is the failure a use reports.
 * @returns The loader.
 */
export const createImplementationLoader = <Module>(load: () => Promise<Module>): ImplementationLoader<Module> => {
  let loading: Promise<Module> | undefined;
  const get = async (): Promise<Module> => {
    const current = loading ?? load();
    loading = current;
    try {
      return await current;
    } catch (error) {
      if (loading === current) {
        loading = undefined;
      }
      throw error;
    }
  };
  return Object.freeze({
    warm: () => {
      if (loading === undefined) {
        // async-iife: bootstrap -- an early load nobody waits on; its failure is the next use's to retry and report.
        void (async (): Promise<void> => {
          try {
            await get();
          } catch {
            /* Forgotten by `get`: the first use loads again. */
          }
        })();
      }
    },
    get,
  });
};
