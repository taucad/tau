/**
 * The interactive closure of a route class on the web client build (progressive loading, Brain
 * `research/progressive-loading-architecture.md`): the chunks its roots load statically and their stylesheets, read
 * from Vite's `.vite/manifest.json`. One walk for the critical budget check (`check-critical-budget.mts`), which
 * measures it, and the warm manifest (`write-warm-manifest.ts`), which lists it for prefetching.
 *
 * Imports nothing, so `react-router.config.ts`'s `buildEnd` can load it before app aliases exist.
 */

/** One entry of Vite's `.vite/manifest.json`, as far as the closure reads it. */
export type ViteManifestChunk = Readonly<{ file: string; imports?: readonly string[]; css?: readonly string[] }>;
export type ViteManifest = Readonly<Record<string, ViteManifestChunk>>;

const stripQuery = (key: string): string => key.split('?', 1)[0] ?? key;

/**
 * The manifest keys of each app-relative root (React Router suffixes its client route modules with a query).
 *
 * @param manifest - The client build manifest.
 * @param roots - App-relative source paths.
 * @returns The matching keys.
 * @throws When a root has no manifest entry, so a renamed module never passes by matching nothing.
 */
export const rootKeys = (manifest: ViteManifest, roots: readonly string[]): string[] =>
  roots.flatMap((root) => {
    const keys = Object.keys(manifest).filter((key) => stripQuery(key) === `app/${root}`);
    if (keys.length === 0) {
      throw new Error(`interactive-closure: the client manifest has no entry for app/${root}`);
    }
    return keys;
  });

/**
 * The scripts and stylesheets a page loads before any dynamic import: the roots' own chunks, everything they import
 * statically, transitively, and the stylesheets of each.
 *
 * @param manifest - The client build manifest.
 * @param keys - The manifest keys to start from.
 * @returns The JavaScript and CSS files, each sorted.
 */
export const staticClosure = (manifest: ViteManifest, keys: readonly string[]): { js: string[]; css: string[] } => {
  const seen = new Set<string>();
  const js = new Set<string>();
  const css = new Set<string>();
  const pending = [...keys];
  while (pending.length > 0) {
    const key = pending.pop();
    if (key === undefined || seen.has(key)) {
      continue;
    }
    seen.add(key);
    const chunk = manifest[key];
    if (chunk === undefined) {
      continue;
    }
    js.add(chunk.file);
    for (const file of chunk.css ?? []) {
      css.add(file);
    }
    pending.push(...(chunk.imports ?? []));
  }
  return { js: [...js].toSorted(), css: [...css].toSorted() };
};
