/**
 * Generates the offline shell service worker from real build output (B5 R3).
 *
 * Called from `react-router.config.ts`'s `buildEnd`, the only hook that runs
 * after prerendering, so the emitted `/usage` document exists. Nothing here is
 * hand-maintained: the allowlist is the set of assets that document actually
 * references, expanded through the Vite build manifest's static import graph,
 * and every entry must exist on disk or the build fails.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { transform } from 'esbuild';

/** One entry of Vite's `.vite/manifest.json`. */
export type ViteManifestChunk = {
  readonly file: string;
  readonly css?: readonly string[];
  readonly assets?: readonly string[];
  readonly imports?: readonly string[];
  /** Deliberately unused: a dynamic import is not needed to boot the shell. */
  readonly dynamicImports?: readonly string[];
};

/** Vite build manifest, keyed by source path. */
export type ViteManifest = Readonly<Record<string, ViteManifestChunk>>;

/** Read side of a completed client build, so the collector can be tested on a fixture. */
export type ClientBuildView = {
  /** Text of a path relative to the client build root, or `undefined` when absent. */
  readonly readText: (relativePath: string) => string | undefined;
  /** Whether a path relative to the client build root exists. */
  readonly exists: (relativePath: string) => boolean;
  /** The parsed Vite build manifest. */
  readonly manifest: ViteManifest;
};

/**
 * Assets that never belong in a usage shell: kernel binaries are megabytes of
 * geometry engine that the usage page never loads.
 */
const excludedExtensions = ['.wasm', '.map'];

const isSameOriginPath = (reference: string): boolean => reference.startsWith('/') && !reference.startsWith('//');

const isExcluded = (reference: string): boolean =>
  excludedExtensions.some((extension) => reference.endsWith(extension));

/** `src="/a.js"` / `href='/b.css'` values of a prerendered document. */
const readDocumentReferences = (html: string): readonly string[] => {
  const references: string[] = [];
  for (const match of html.matchAll(/(?:src|href)=["']([^"']+)["']/gu)) {
    const reference = match[1];
    if (reference !== undefined && isSameOriginPath(reference) && !isExcluded(reference)) {
      references.push(reference);
    }
  }
  return references;
};

/** `url(/fonts/x.woff2)` references inside a stylesheet the document loads. */
const readStylesheetReferences = (css: string): readonly string[] => {
  const references: string[] = [];
  for (const match of css.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gu)) {
    const reference = match[1];
    if (reference !== undefined && isSameOriginPath(reference) && !isExcluded(reference)) {
      references.push(reference);
    }
  }
  return references;
};

/**
 * Collect the static assets one prerendered document needs to boot.
 *
 * Seeded from the document's own `src`/`href` references, then expanded through
 * the build manifest's **static** import graph (plus each chunk's CSS and
 * assets) because Vite does not emit a preload link for every transitive chunk.
 * Stylesheets contribute their `url()` references, which is how self-hosted
 * fonts are reached.
 *
 * @param documentPaths - Shell document paths, e.g. `['/usage']`.
 * @param build - Read side of the completed client build.
 * @returns Sorted, same-origin absolute asset paths.
 * @throws When a document or a referenced asset is missing from the build output.
 */
export const collectOfflineShellAssets = (
  documentPaths: readonly string[],
  build: ClientBuildView,
): readonly string[] => {
  const localOrigin = 'https://tau.invalid';
  const fileToKey = new Map(Object.entries(build.manifest).map(([key, chunk]) => [`/${chunk.file}`, key]));
  const pending: string[] = [];
  for (const documentPath of documentPaths) {
    pending.push(...readDocumentReferences(readDocument(documentPath, build)));
  }

  const collected = new Set<string>();
  while (pending.length > 0) {
    const queuedReference = pending.pop();
    if (queuedReference === undefined) {
      continue;
    }
    const parsedReference = new URL(queuedReference, localOrigin);
    if (parsedReference.origin !== localOrigin) {
      continue;
    }
    const reference = parsedReference.pathname;
    if (isExcluded(reference) || collected.has(reference)) {
      continue;
    }
    collected.add(reference);

    if (!build.exists(reference.slice(1))) {
      throw new Error(`Offline shell allowlist references a missing build asset: ${reference}`);
    }
    if (reference.endsWith('.css')) {
      pending.push(...readStylesheetReferences(build.readText(reference.slice(1)) ?? ''));
    }
    pending.push(...expandChunk(reference, fileToKey.get(reference), build));
  }

  return [...collected].sort((left, right) => left.localeCompare(right));
};

/**
 * Static imports, CSS and assets of one built chunk.
 *
 * Dynamic imports are deliberately not followed: nothing lazily imported is
 * needed to boot the shell, and following them would drag in kernel bundles.
 */
const expandChunk = (reference: string, manifestKey: string | undefined, build: ClientBuildView): readonly string[] => {
  if (manifestKey === undefined) {
    if (reference.startsWith('/assets/') && reference.endsWith('.js')) {
      throw new Error(`Offline shell allowlist references a hashed asset absent from the build manifest: ${reference}`);
    }
    return [];
  }
  const chunk = build.manifest[manifestKey];
  const next: string[] = [];
  for (const imported of chunk?.imports ?? []) {
    const importedFile = build.manifest[imported]?.file;
    if (importedFile === undefined) {
      throw new Error(`Build manifest entry ${manifestKey} imports unknown chunk ${imported}`);
    }
    next.push(`/${importedFile}`);
  }
  for (const asset of [...(chunk?.css ?? []), ...(chunk?.assets ?? [])]) {
    if (!isExcluded(`/${asset}`)) {
      next.push(`/${asset}`);
    }
  }
  return next;
};

/** Prerendered document body; React Router writes `<path>/index.html`. */
const readDocument = (documentPath: string, build: ClientBuildView): string => {
  const candidates = [`${documentPath.slice(1)}/index.html`, `${documentPath.slice(1)}.html`];
  for (const candidate of candidates) {
    const html = build.readText(candidate);
    if (html !== undefined) {
      return html;
    }
  }
  throw new Error(`Offline shell document ${documentPath} was not prerendered (looked for ${candidates.join(', ')})`);
};

/**
 * Version digest of one shell.
 *
 * Covers the document bodies and the asset list, so any deploy that changes the
 * shell changes the worker's bytes — which is what makes the browser install a
 * new version at all.
 *
 * @param documentPaths - Shell document paths.
 * @param assets - The generated allowlist.
 * @param build - Read side of the completed client build.
 * @returns A 16-character hex digest.
 */
export const offlineShellVersion = (
  documentPaths: readonly string[],
  assets: readonly string[],
  build: ClientBuildView,
): string => {
  const hash = createHash('sha256');
  for (const documentPath of documentPaths) {
    hash.update(documentPath).update(readDocument(documentPath, build));
  }
  hash.update(assets.join('\n'));
  return hash.digest('hex').slice(0, 16);
};

/**
 * Write the offline shell worker into the client build output.
 *
 * @param options - Client build directory, worker source path, and shell document paths.
 * @returns The generated manifest, for build logging.
 */
export const generateOfflineShell = async (options: {
  readonly clientDirectory: string;
  readonly workerSourcePath: string;
  readonly documentPaths: readonly string[];
}): Promise<{
  readonly version: string;
  readonly documents: readonly string[];
  readonly assets: readonly string[];
}> => {
  const resolvePath = (relativePath: string): string => join(options.clientDirectory, relativePath);
  const manifestPath = resolvePath('.vite/manifest.json');
  if (!existsSync(manifestPath)) {
    throw new Error(
      `Offline shell needs the Vite build manifest at ${manifestPath} (set build.manifest in vite.config)`,
    );
  }
  const build: ClientBuildView = {
    readText: (relativePath) =>
      existsSync(resolvePath(relativePath)) ? readFileSync(resolvePath(relativePath), 'utf8') : undefined,
    exists: (relativePath) => existsSync(resolvePath(relativePath)),
    manifest: JSON.parse(readFileSync(manifestPath, 'utf8')) as ViteManifest,
  };

  const assets = collectOfflineShellAssets(options.documentPaths, build);
  const manifest = {
    version: offlineShellVersion(options.documentPaths, assets, build),
    documents: options.documentPaths,
    assets,
  };

  const worker = await transform(readFileSync(options.workerSourcePath, 'utf8'), {
    loader: 'ts',
    // A classic worker script: module service workers are still not universal.
    format: 'iife',
    target: 'es2022',
    define: { 'globalThis.__TAU_OFFLINE_SHELL__': JSON.stringify(manifest) },
  });
  writeFileSync(resolvePath('offline-shell-worker.js'), worker.code, 'utf8');

  const bytes = assets.reduce((total, asset) => total + statSync(resolvePath(asset.slice(1))).size, 0);
  console.log(
    `[offline-shell] version ${manifest.version}: ${String(assets.length)} assets, ${String(Math.round(bytes / 1024))} KiB`,
  );
  return manifest;
};
