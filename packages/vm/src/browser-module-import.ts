/**
 * Dynamically import a generated browser module URL.
 *
 * Bundlers must leave blob/data URLs alone here: they are produced after
 * esbuild finishes bundling user code inside the runtime worker.
 */
export const importBrowserModule = async (moduleUrl: string): Promise<unknown> =>
  import(
    /* webpackIgnore: true */
    /* @vite-ignore */
    moduleUrl
  );
