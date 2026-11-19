/**
 * The service worker's precache list (progressive loading PL7), generated from the route-class registry and the client
 * build: `build-service-worker.ts` writes it into the worker, and `check-critical-budget.mts` holds the written list
 * equal to it (shell invariant 8). No build tooling here, so the check loads it cheaply.
 *
 * Imports nothing app-aliased, so `react-router.config.ts`'s `buildEnd` and native Node checks can read it.
 */
import { createHash } from 'node:crypto';
/* oxlint-disable-next-line no-restricted-imports -- Called from react-router.config.ts before app aliases exist. */
import { rootKeys } from './interactive-closure.ts';

/** One entry of Vite's `.vite/manifest.json`. */
export type ViteManifestChunk = {
  readonly file: string;
  readonly css?: readonly string[];
  readonly assets?: readonly string[];
  readonly imports?: readonly string[];
  /** Deliberately unused: a dynamic import is deferred-tier, never precached. */
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

/** One document the worker answers, with the interactive roots its class loads on every open. */
export type PrecacheDocument = Readonly<{
  /** Root-relative URL of the document file, e.g. `/w/__shell/__shell/index.html`. */
  document: string;
  /** App-relative modules (`route-classes.ts` `interactive`); empty for a class the guards do not measure. */
  roots: readonly string[];
}>;

/** One precache entry as the worker receives it. */
// oxlint-disable-next-line typescript/no-restricted-types -- Workbox's precache wire value for "no revision".
export type PrecacheEntry = Readonly<{ url: string; revision: string | null }>;

/** Where the build writes the precache list beside the client output, relative to the build directory. */
export const precacheListFile = 'service-worker-precache.json';

/** Whether a precache URL is content-hashed by name, so it carries no revision. */
export const isHashedUrl = (url: string): boolean => url.startsWith('/assets/');

/** Files that never belong in the precache: kernel binaries and source maps. */
const excludedExtensions = ['.wasm', '.map'];

const isSameOriginPath = (reference: string): boolean => reference.startsWith('/') && !reference.startsWith('//');

const isExcluded = (reference: string): boolean =>
  excludedExtensions.some((extension) => reference.endsWith(extension));

/** Asset-bearing tags only: links to pages are navigation, not files required by this document. */
const readDocumentReferences = (html: string): readonly string[] => {
  const references: string[] = [];
  const assetLinkRelations = new Set(['stylesheet', 'preload', 'modulepreload', 'icon', 'manifest']);
  for (const tag of html.matchAll(/<(script|link|img|source|video|audio)\b([^>]*)>/giu)) {
    const name = tag[1]?.toLowerCase();
    const attributes = tag[2] ?? '';
    if (name === 'link') {
      const relation = /(?:^|\s)rel=["']([^"']+)["']/iu.exec(attributes)?.[1];
      if (
        !relation
          ?.toLowerCase()
          .split(/\s+/u)
          .some((value) => assetLinkRelations.has(value))
      ) {
        continue;
      }
    }
    for (const match of attributes.matchAll(/(?:^|\s)(src|href|poster)=["']([^"']+)["']/giu)) {
      const attribute = match[1]?.toLowerCase();
      const reference = match[2];
      if ((attribute === 'href') !== (name === 'link')) {
        continue;
      }
      if (reference !== undefined && isSameOriginPath(reference) && !isExcluded(reference)) {
        references.push(reference);
      }
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
 * Collect the files the worker precaches: each document, what it references, its class's interactive roots, and their
 * static closure.
 *
 * Seeded from each document's own `src`/`href` references and its class's interactive roots, then expanded through the
 * build manifest's **static** import graph (plus each chunk's stylesheets) because Vite does not emit a preload link
 * for every transitive chunk. Stylesheets contribute their `url()` references to the app's own unhashed files, which is
 * how the self-hosted fonts are reached. Hashed images and font fallbacks load when rendered and are cached on first use.
 *
 * @param documents - The documents the worker answers.
 * @param build - Read side of the completed client build.
 * @returns Sorted, same-origin root-relative URLs, documents included.
 * @throws When a document, a root or a referenced file is missing from the build output.
 */
export const collectPrecacheFiles = (documents: readonly PrecacheDocument[], build: ClientBuildView): string[] => {
  const localOrigin = 'https://tau.invalid';
  const fileToKey = new Map(Object.entries(build.manifest).map(([key, chunk]) => [`/${chunk.file}`, key]));
  const pending: string[] = [];
  const collected = new Set<string>();
  for (const { document, roots } of documents) {
    const html = build.readText(document.slice(1));
    if (html === undefined) {
      throw new Error(`Service worker document ${document} was not prerendered`);
    }
    collected.add(document);
    pending.push(...readDocumentReferences(html));
    pending.push(...rootKeys(build.manifest, roots).map((key) => `/${build.manifest[key]?.file ?? key}`));
  }

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
      throw new Error(`Service worker precache references a missing build file: ${reference}`);
    }
    if (reference.endsWith('.css')) {
      // Only the app's own unhashed files (its fonts under `/fonts/`): a hashed `/assets/*` file a stylesheet names
      // (a font fallback, an image) is fetched when used and cached on first use.
      pending.push(
        ...readStylesheetReferences(build.readText(reference.slice(1)) ?? '').filter(
          (stylesheetReference) => !stylesheetReference.startsWith('/assets/'),
        ),
      );
    }
    pending.push(...expandChunk(reference, fileToKey.get(reference), build));
  }

  return [...collected].toSorted((left, right) => left.localeCompare(right));
};

/**
 * Static imports and stylesheets of one built chunk. The files a chunk merely names (`assets`: images, font fallbacks)
 * load when something renders them, so they are cached on first use like any other hashed file, never precached.
 *
 * Dynamic imports are deliberately not followed: a lazily imported module is deferred-tier (T2), and following them
 * would drag in the editor, the viewer and kernel bundles.
 */
const expandChunk = (reference: string, manifestKey: string | undefined, build: ClientBuildView): readonly string[] => {
  if (manifestKey === undefined) {
    if (reference.startsWith('/assets/') && reference.endsWith('.js')) {
      throw new Error(`Service worker precache references a hashed asset absent from the build manifest: ${reference}`);
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
  for (const stylesheet of chunk?.css ?? []) {
    next.push(`/${stylesheet}`);
  }
  return next;
};

/**
 * The precache entries for a list of files: hashed files without a revision, every other file with its content
 * digest, so a deploy that changes a document makes the browser install a new worker.
 *
 * @param files - Root-relative URLs ({@link collectPrecacheFiles}).
 * @param readBytes - Bytes of a client-relative path.
 * @returns The entries, in the files' order.
 */
export const precacheEntries = (
  files: readonly string[],
  readBytes: (relativePath: string) => Uint8Array<ArrayBuffer>,
): PrecacheEntry[] =>
  files.map((url) => ({
    url,
    revision: isHashedUrl(url)
      ? null
      : createHash('sha256')
          .update(readBytes(url.slice(1)))
          .digest('hex')
          .slice(0, 32),
  }));
