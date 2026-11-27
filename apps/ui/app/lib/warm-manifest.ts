/**
 * The warm manifest (progressive loading PL8, Brain `research/progressive-loading-architecture.md`, "Warm the next
 * step"): one static file per build that names each guarded route class's interactive tier, so a page can prefetch the
 * modules of the step a visitor most likely takes next, once it is idle.
 *
 * - The build writes it beside the edge shells (`scripts/write-warm-manifest.ts`, from `react-router.config.ts`'s
 *   `buildEnd`): for each class of the route-class registry that names its interactive roots, the same static closure
 *   the critical budget measures (`scripts/check-critical-budget.mts`), less any chunk holding a heavy module family.
 * - `scripts/check-critical-budget.mts` holds every listed file inside its class's measured closure and away from every
 *   heavy family, wasm file and worker or runtime asset (shell invariant 7).
 * - Home reads it through `warm-route-class.ts`; the marketing site (`apps/www/src/app-warm.client.ts`) reads the same
 *   path on the app's host and keeps its own copy of these rules, since it imports nothing from the app.
 *
 * The file imports nothing, so build scripts can read it before app aliases exist.
 */

/** Where the manifest is served on the app's host, from the client build's `__shell/warm.json`. */
export const warmManifestPath = '/__shell/warm.json';

/** The manifest's file, relative to the client build directory. */
export const warmManifestFile = warmManifestPath.slice(1);

/** The manifest's format version; a reader skips any other. */
export const warmManifestVersion = 1;

/** What the build writes. */
export type WarmManifest = Readonly<{
  version: typeof warmManifestVersion;
  /** Each guarded class's warmable interactive files, as root-relative URLs, by class id. */
  classes: Readonly<Record<string, readonly string[]>>;
  /**
   * Each class's send tier (WP-12 step 2): what the first send from a composer that opens the class fetches after
   * Enter, less the class's interactive files. Home prefetches it when its composer is first typed in, an explicit
   * intent, so unlike `classes` it may hold heavy families and the agent host worker's code; never wasm, and never a
   * worker's own entry file.
   */
  send?: Readonly<Record<string, readonly string[]>>;
}>;

/**
 * Whether a URL may be warmed: a hashed script or stylesheet of the build's own `assets` directory, on this origin. A
 * wasm file, a worker, any other directory and any other origin never are, whatever the manifest says (shell invariant
 * 7, "no early kernel"; the build check is the authoritative guard, this is the reader's second line).
 *
 * @param href - A URL from the manifest.
 * @returns `true` when the reader may prefetch it.
 */
export const isWarmableHref = (href: string): boolean =>
  /^\/assets\/[\w.~-]+\.(?:js|css)$/u.test(href) && !/worker/iu.test(href);

/**
 * Whether a URL may be prefetched for a send: a hashed script or stylesheet of the build's own `assets` directory, on
 * this origin, that is not a worker's entry file. Code a worker imports is a plain module and may be.
 *
 * @param href - A URL from the manifest's send tier.
 * @returns `true` when the reader may prefetch it.
 */
export const isSendWarmableHref = (href: string): boolean =>
  /^\/assets\/[\w.~-]+\.(?:js|css)$/u.test(href) && !/\.worker-/iu.test(href);

const isStringList = (files: unknown): files is string[] =>
  Array.isArray(files) && files.every((file): file is string => typeof file === 'string');

/**
 * Read a fetched manifest.
 *
 * @param value - The parsed JSON body.
 * @returns The manifest, or `undefined` when it is not this version's shape.
 */
export const parseWarmManifest = (value: unknown): WarmManifest | undefined => {
  if (typeof value !== 'object' || value === null || !('version' in value) || !('classes' in value)) {
    return undefined;
  }
  const { version, classes } = value;
  if (version !== warmManifestVersion || typeof classes !== 'object' || classes === null) {
    return undefined;
  }
  const parsed: Record<string, readonly string[]> = {};
  for (const [id, files] of Object.entries(classes)) {
    if (!isStringList(files)) {
      return undefined;
    }
    parsed[id] = files;
  }
  const send: Record<string, readonly string[]> = {};
  const sendValue: unknown = 'send' in value ? value.send : undefined;
  if (typeof sendValue === 'object' && sendValue !== null) {
    for (const [id, files] of Object.entries(sendValue)) {
      /* An unreadable send tier is dropped alone: the idle tier still warms. */
      if (isStringList(files)) {
        send[id] = files;
      }
    }
  }
  return { version, classes: parsed, ...(Object.keys(send).length === 0 ? {} : { send }) };
};

/**
 * The files to prefetch for a send that opens a class: its send tier, each one send-warmable.
 *
 * @param manifest - The manifest.
 * @param target - The class the send opens.
 * @returns The URLs, in manifest order.
 */
export const sendHrefs = (manifest: WarmManifest, target: string): string[] =>
  (manifest.send?.[target] ?? []).filter((href) => isSendWarmableHref(href));

/**
 * The files to prefetch for a class: its interactive files, less those of the class the page already loaded, each one
 * warmable.
 *
 * @param manifest - The manifest.
 * @param target - The class to warm.
 * @param loaded - The class whose interactive tier the page already holds, if any.
 * @returns The URLs, in manifest order.
 */
export const warmHrefs = (manifest: WarmManifest, target: string, loaded?: string): string[] => {
  const held = new Set(loaded === undefined ? [] : (manifest.classes[loaded] ?? []));
  return (manifest.classes[target] ?? []).filter((href) => !held.has(href) && isWarmableHref(href));
};
