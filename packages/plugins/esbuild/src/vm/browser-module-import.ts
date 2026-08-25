/**
 * Dynamically import a generated browser module URL.
 *
 * Bundlers must leave blob/data URLs alone here: they are produced after
 * esbuild finishes bundling user code inside the runtime worker.
 *
 * @param specifier - generated module URL to import
 * @returns the imported module namespace
 */
export const importBrowserModule = async (specifier: string): Promise<unknown> =>
  import(
    /* webpackIgnore: true */
    /* @vite-ignore */
    specifier
  );
