/**
 * The client's one app runtime (app state orchestration charter D5, operator ruling OQ4).
 *
 * The client entry creates the runtime and holds it here; `AppRuntimeProvider` reads it. The holder sits above every
 * React tree, so neither StrictMode nor a remount below the billing fence makes a second runtime (B9). It keeps the
 * runtime in `import.meta.hot.data`, so a hot update of this module or of the entry does not create another one in
 * development. The server never holds a runtime here: it creates one per request and passes it to the provider.
 */
import type { AppRuntime } from '#runtime/app-runtime.js';

type HotData = { appRuntime?: AppRuntime };

const hotData = import.meta.hot?.data as HotData | undefined;
let held: AppRuntime | undefined = hotData?.appRuntime;

/**
 * Hold the client's runtime.
 *
 * @param runtime - The runtime the client entry created.
 * @returns The same runtime.
 * @public
 */
export const holdAppRuntime = (runtime: AppRuntime): AppRuntime => {
  held = runtime;
  if (hotData) {
    hotData.appRuntime = runtime;
  }
  return runtime;
};

/**
 * The held runtime, if the client entry made one.
 *
 * @returns The runtime, or `undefined` on the server and before the entry ran.
 * @public
 */
export const heldAppRuntime = (): AppRuntime | undefined => held;
