/**
 * Keep the previous deploys' hashed assets in a new UI deploy (TAU-UI-6).
 *
 * A deploy publishes only its own `/assets/*`, so a page loaded from the build
 * before it fails its next lazy import the moment the new one goes live. This
 * runs last in the Netlify build command, after source-map injection has given
 * every chunk its final bytes. It reads the live deploy's index of served
 * assets, downloads each asset the new build lacks from the live origin, checks
 * it against the index's integrity, and writes it beside the new build's own.
 * An asset is kept while either holds: it left the live build at most `retentionWindow` ago
 * (TAU-UI-S: staging deploys many times a day, so a count of deploys can pass within hours and a tab
 * open since then fails its next navigation), or it is within `retainedGenerations` deploys of the
 * one that built it (production deploys per release, so the window alone could keep less).
 * It then writes the new deploy's index (`tau-served-assets.json`), which the
 * next deploy reads in turn. Netlify stores files by content, so a retained
 * asset is not uploaded again.
 *
 * Besides `/assets/*`, it keeps the content-addressed runtime bundles a page starts later: the PicoGK
 * browser host (`picogk-browser/<sha256>/`) and the C# language service (`csharp-language/<sha256>/`).
 * A tab loaded before a deploy that changed one fetches the old bundle by the address its build named,
 * so dropping it would fail PicoGK or the C# service in that tab. They are listed in their own index,
 * `tau-served-runtimes.json`: a build from before them refuses any path outside `assets/` in
 * `tau-served-assets.json`, and a rollback to such a build must still deploy. These bundles are large (PicoGK is about
 * 150 MB per generation) and rarely change, so they are not downloaded again each deploy: with
 * `TAU_RETAIN_ASSETS_STORE` set, the deploy reads them from that directory (a CI cache `deploy-ui.yml`
 * restores) when their integrity matches, and leaves in it exactly the runtime bundle files this deploy
 * serves, its own included, for the next deploy.
 *
 * Generations age per distinct build: a redeploy of the build the live deploy
 * already serves keeps every asset at the age the live index lists.
 *
 * It fails closed: a malformed index, an asset that does not match its integrity,
 * a listed asset the live deploy lost, or a live index it cannot read (a network
 * error, any status but 200 or 404 after the retries, or a 200 that is not the
 * JSON index, such as an SPA catch-all) fails the build, since publishing then
 * would drop every retained asset. Only a 404 means the live site has no index
 * yet; it keeps nothing and says so. A site whose catch-all answers 200 needs
 * `TAU_RETAIN_ASSETS_SKIP=1` for the first deploy that runs this.
 *
 * Optional env vars:
 *   TAU_RETAIN_ASSETS_FROM   Netlify origin of the live deploy, e.g. https://taucad-prod-us.netlify.app
 *                            (`deploy-ui.yml`), never the public host. Unset: only the new deploy's index is written.
 *   TAU_RETAIN_ASSETS_SKIP   `1` retains nothing and asks the live deploy nothing, with a warning: the emergency
 *                            path while the live origin is down (`skip_asset_retention` in `deploy-ui.yml`).
 *   TAU_RETAIN_ASSETS_STORE  Directory of runtime bundle files kept between deploys, by integrity. Unset or empty:
 *                            every retained file is downloaded. It is a cache: a missing or changed file is fetched.
 *
 * Usage: node scripts/retain-previous-assets.mts   (from apps/ui, after the client build)
 * Exit codes: 0 success, 1 a malformed or unreadable index, or an asset that cannot be retained.
 */
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import type { Dirent } from 'node:fs';
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, posix, relative, resolve, sep } from 'node:path';
import process from 'node:process';
import { pipeline } from 'node:stream/promises';
import { setTimeout } from 'node:timers/promises';
import { sri } from '#scripts/subresource-integrity.mts';

/** File the new deploy publishes at its root, listing every asset it serves. */
export const servedAssetsIndexFileName = 'tau-served-assets.json';

/**
 * File the new deploy publishes at its root, listing the runtime bundle files it serves
 * ({@link isRuntimeBundlePath}). It is separate from {@link servedAssetsIndexFileName} because a build from
 * before runtime retention refuses any path outside `assets/` there, and a rollback to one must still deploy.
 */
export const servedRuntimesIndexFileName = 'tau-served-runtimes.json';

/** `schema` of {@link ServedAssetsIndex}. */
export const servedAssetsIndexSchema = 'tau-ui-served-assets-v1';

/** Deploys after its own that an asset stays served for, however long ago it left the live build. */
export const retainedGenerations = 2;

/** Milliseconds after leaving the live build that an asset stays served for, up to {@link retainedGenerationsCap}. */
export const retentionWindow = 7 * 24 * 60 * 60_000;

/**
 * Deploys after its own that the window keeps an asset for at most: each deploy downloads every retained
 * asset again (about 15 MiB a staging deploy, measured 2026-11-05), so the window must not grow without bound.
 */
export const retainedGenerationsCap = 10;

/** One served asset: its path under the client root, its SRI integrity and its age in deploys. */
export type ServedAsset = {
  readonly path: string;
  readonly integrity: string;
  /** `0` for the deploy's own build, `n` for an asset kept from `n` deploys before. */
  readonly generation: number;
  /** Milliseconds since the epoch when the asset left the live build; absent while it is part of it. */
  readonly retiredAt?: number;
};

/** Every asset one deploy serves. */
export type ServedAssetsIndex = {
  readonly schema: typeof servedAssetsIndexSchema;
  readonly assets: readonly ServedAsset[];
};

/** Characters a published asset path may not carry: controls, a backslash, and URL syntax (`?`, `#`, `%`). */
// oxlint-disable-next-line no-control-regex -- Control characters are exactly what this refuses.
const forbiddenPathCharacter = /[\u0000-\u001F\u007F\\?#%]/u;

/**
 * Roots of the content-addressed runtime bundles a deploy serves beside `/assets/*`, each under a
 * `<sha256>/` directory: the PicoGK browser host and the C# language service (their Vite plugins).
 */
export const runtimeBundleRoots = ['picogk-browser', 'csharp-language'] as const;

const contentAddress = /^[a-f\d]{64}$/u;

/**
 * Whether a path belongs to a content-addressed runtime bundle: `<root>/<sha256>/<file>`.
 *
 * @param path - A path relative to the client root, with `/` separators.
 * @returns `true` for a runtime bundle file.
 */
export const isRuntimeBundlePath = (path: string): boolean => {
  const [root, address, ...rest] = path.split('/');
  return (
    (runtimeBundleRoots as readonly string[]).includes(root ?? '') &&
    contentAddress.test(address ?? '') &&
    rest.length > 0
  );
};

const isSafePath = (path: string): boolean =>
  !forbiddenPathCharacter.test(path) &&
  path
    .split('/')
    .slice(1)
    .every((segment) => segment !== '' && segment !== '.' && segment !== '..');

/**
 * Whether a path can be published by one deploy and read back by the next: under `assets/`,
 * every segment a real name, nothing a URL or a file system would read differently. This is
 * the one check both sides apply, so no build can publish a name its successor refuses.
 *
 * @param path - A path relative to the client root, with `/` separators.
 * @returns `true` when the path is safe to publish and to retain.
 */
export const isServableAssetPath = (path: string): boolean =>
  path.split('/')[0] === 'assets' && path.split('/').length > 1 && isSafePath(path);

/**
 * The same check for {@link servedRuntimesIndexFileName}: a file under a runtime bundle's content address.
 *
 * @param path - A path relative to the client root, with `/` separators.
 * @returns `true` when the path is safe to publish and to retain as a runtime bundle file.
 */
export const isServableRuntimePath = (path: string): boolean => isRuntimeBundlePath(path) && isSafePath(path);

/** Which index a retention pass reads and writes. */
type IndexKind = {
  readonly fileName: string;
  readonly isServable: (path: string) => boolean;
  /** The top-level directories the build's own files are listed from. */
  readonly roots: readonly string[];
  /** Whether a build may lack every root (a build without the PicoGK or C# bundle). */
  readonly optional: boolean;
  /**
   * Whether a 200 that is not JSON means "no index yet": the live deploy's assets index was read just
   * before, so such an answer is a catch-all on a build from before runtime retention, not an outage.
   */
  readonly catchAllMeansNone: boolean;
};

const assetsKind: IndexKind = {
  fileName: servedAssetsIndexFileName,
  isServable: isServableAssetPath,
  roots: ['assets'],
  optional: false,
  catchAllMeansNone: false,
};

const runtimesKind: IndexKind = {
  fileName: servedRuntimesIndexFileName,
  isServable: isServableRuntimePath,
  roots: runtimeBundleRoots,
  optional: true,
  catchAllMeansNone: true,
};

const refusePath = (path: string, where: string): Error =>
  new Error(`The ${where} refuses the path ${JSON.stringify(path)}.`);

/** The URL of an asset on an origin, each segment encoded. */
const assetUrl = (origin: string, path: string): string =>
  `${origin}/${path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')}`;
const sha384Integrity = /^sha384-[A-Za-z0-9+/]+={0,2}$/u;
const downloadConcurrency = 8;
/** Milliseconds to wait before each retry of a failed request. */
const retryBackoff = [1000, 2000, 4000] as const;
/** Milliseconds one request may take, the body included. */
const defaultRequestTimeout = 30_000;

/**
 * Files no page loads, so keeping them would only cost transfer: precompressed siblings only the
 * local Node server uses (`compress-static-assets.mts`), source maps (deleted by the upload), and
 * the build's module-graph provenance (`tau-module-graph-*.json`, about 3 MiB a build).
 */
const isNeverLoadedByPages = (path: string): boolean =>
  /\.(?:br|gz|map)$/u.test(path) || /(?:^|\/)tau-module-graph-[^/]+\.json$/u.test(path);

type Transport = {
  readonly requestTimeout: number;
  readonly wait: (milliseconds: number) => Promise<void>;
};

/** Check one live index entry, which arrives as untrusted JSON. */
const assertServedAsset = (entry: unknown, isServable: (path: string) => boolean): ServedAsset => {
  if (typeof entry !== 'object' || entry === null) {
    throw new TypeError(`The live asset index has a malformed entry: ${JSON.stringify(entry)}.`);
  }
  const { path, integrity, generation, retiredAt } = entry as Partial<Record<keyof ServedAsset, unknown>>;
  if (typeof path !== 'string' || typeof integrity !== 'string' || typeof generation !== 'number') {
    throw new TypeError(`The live asset index has a malformed entry: ${JSON.stringify(entry)}.`);
  }
  if (!isServable(path)) {
    throw refusePath(path, 'live asset index');
  }
  if (!sha384Integrity.test(integrity) || !Number.isInteger(generation) || generation < 0) {
    throw new Error(`The live asset index has a malformed entry for ${path}.`);
  }
  if (retiredAt === undefined) {
    return { path, integrity, generation };
  }
  if (typeof retiredAt !== 'number' || !Number.isInteger(retiredAt) || retiredAt < 0) {
    throw new Error(`The live asset index has a malformed retirement time for ${path}.`);
  }
  return { path, integrity, generation, retiredAt };
};

/**
 * Check a live index, which arrives as untrusted JSON, once: its schema, every entry, and one entry
 * per path (a path listed twice keeps its youngest generation, so it is downloaded once).
 *
 * @param value - The parsed JSON.
 * @param source - Where it came from, for the error.
 * @returns The index with checked entries.
 * @throws When the schema, an entry or a path is not one this script publishes.
 */
export const parseServedAssetsIndex = (
  value: unknown,
  source: string,
  isServable: (path: string) => boolean = isServableAssetPath,
): ServedAssetsIndex => {
  const index = (typeof value === 'object' && value !== null ? value : {}) as Partial<
    Record<'schema' | 'assets', unknown>
  >;
  if (index.schema !== servedAssetsIndexSchema || !Array.isArray(index.assets)) {
    throw new Error(`${source} is not a ${servedAssetsIndexSchema} index.`);
  }
  const youngest = new Map<string, ServedAsset>();
  for (const entry of index.assets as readonly unknown[]) {
    const asset = assertServedAsset(entry, isServable);
    const known = youngest.get(asset.path);
    if (known === undefined || asset.generation < known.generation) {
      youngest.set(asset.path, asset);
    }
  }
  return { schema: servedAssetsIndexSchema, assets: [...youngest.values()] };
};

/**
 * Whether the new build is the one the live deploy already serves: its own asset paths are exactly
 * the live index's generation `0`. The paths carry Vite's content hashes, taken before source-map
 * injection, so they identify the build even if an injector stamps per-run ids into the bytes (the
 * unpinned `npx @posthog/cli` has minted random chunk ids in older modes). The build id cannot tell
 * either, since every build stamps a fresh one (`vite.config.ts`).
 *
 * @param previous - The live deploy's index.
 * @param own - The new build's own assets.
 * @returns `true` for a redeploy of the same build, whose generations must not age.
 */
export const isSameBuild = (previous: ServedAssetsIndex, own: readonly ServedAsset[]): boolean => {
  const live = new Set(previous.assets.filter((asset) => asset.generation === 0).map((asset) => asset.path));
  return live.size === own.length && own.every((asset) => live.has(asset.path));
};

/**
 * The assets a new deploy keeps from the live one.
 *
 * @param previous - The live deploy's index, checked ({@link parseServedAssetsIndex}).
 * @param ownPaths - Asset paths the new build has itself.
 * @param options - `now`: this deploy's time (milliseconds since the epoch); `generations`: deploys after
 *   its own that an asset stays served for; `window`: milliseconds after leaving the live build that it
 *   stays served for, within `cap` deploys; `shouldAge`: `false` for a redeploy of the same build
 *   ({@link isSameBuild}), whose ages stay as listed.
 * @returns The assets to download, one generation older than the live index lists them unless not aging.
 *   Those leaving the live build with this deploy are stamped now; an entry an index from before the stamp
 *   lists stays unstamped and only the generation count keeps it.
 */
export const planRetention = (
  previous: ServedAssetsIndex,
  ownPaths: ReadonlySet<string>,
  options: {
    readonly now: number;
    readonly generations?: number;
    readonly window?: number;
    readonly cap?: number;
    readonly shouldAge?: boolean;
  },
): readonly ServedAsset[] => {
  const {
    now,
    generations = retainedGenerations,
    window = retentionWindow,
    cap = retainedGenerationsCap,
    shouldAge = true,
  } = options;
  const step = shouldAge ? 1 : 0;
  return previous.assets
    .filter((asset) => !ownPaths.has(asset.path))
    .map((asset) => {
      const aged = { ...asset, generation: asset.generation + step };
      return asset.generation === 0 && shouldAge ? { ...aged, retiredAt: now } : aged;
    })
    .filter(
      (asset) =>
        asset.generation <= generations ||
        (asset.generation <= cap && asset.retiredAt !== undefined && now - asset.retiredAt <= window),
    );
};

/** Files hashed at once: the build holds about 2,000 files and 330 MiB, which must not all be read together. */
const hashConcurrency = 16;

/**
 * Map `items` through `task`, at most `limit` at a time, keeping the input order.
 *
 * @param items - The inputs.
 * @param limit - Tasks in flight at most.
 * @param task - The work for one input.
 * @returns The results, in input order.
 */
export const mapWithConcurrency = async <T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T) => Promise<R>,
): Promise<R[]> => {
  const results: R[] = Array.from({ length: items.length });
  let next = 0;
  const worker = async (): Promise<void> => {
    for (let index = next++; index < items.length; index = next++) {
      // oxlint-disable-next-line no-await-in-loop -- Each worker runs one task at a time.
      results[index] = await task(items[index] as T);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
};

/** SRI integrity of a file, streamed so a large asset is never held whole. */
const integrityOfFile = async (path: string): Promise<string> => {
  const hash = createHash('sha384');
  await pipeline(createReadStream(path), hash);
  return `sha384-${hash.digest('base64')}`;
};

/** Every file under a root, or none when the build lacks it and it is optional. */
const listRoot = async (directory: string, optional: boolean): Promise<Dirent[]> => {
  try {
    return await readdir(directory, { recursive: true, withFileTypes: true });
  } catch (error) {
    if (optional && (error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
};

const listOwnAssets = async (clientDirectory: string, kind: IndexKind): Promise<readonly ServedAsset[]> => {
  // A build without its asset directory is broken; publishing an empty index would drop every retained asset.
  const listed = await Promise.all(
    kind.roots.map(async (root) => listRoot(join(clientDirectory, root), kind.optional)),
  );
  const files = listed.flat().filter((entry) => entry.isFile() && !isNeverLoadedByPages(entry.name));
  const paths = files.map((entry) => {
    const absolute = join(entry.parentPath, entry.name);
    const path = relative(clientDirectory, absolute).split(sep).join(posix.sep);
    if (!kind.isServable(path)) {
      // Published, it would fail every later deploy that reads this index.
      throw refusePath(path, 'new build');
    }
    return { absolute, path };
  });
  return mapWithConcurrency(paths, hashConcurrency, async ({ absolute, path }) => ({
    path,
    integrity: await integrityOfFile(absolute),
    generation: 0,
  }));
};

/** One finished request: its status, content type and whole body. */
type Fetched = { readonly status: number; readonly contentType: string; readonly body: Uint8Array<ArrayBuffer> };

/** Milliseconds a `Retry-After` may ask for before the wait is capped. */
const retryAfterCap = 30_000;

/** Answers worth asking again: a request timeout, a throttle, and any server error. */
const isRetryable = (status: number): boolean => status === 408 || status === 429 || status >= 500;

/**
 * Milliseconds a `Retry-After` header asks for (seconds or an HTTP date), capped.
 *
 * @param header - The header value, when present.
 * @returns The wait, or `undefined` when the header names none.
 */
const retryAfterWait = (header: string | undefined): number | undefined => {
  if (header === undefined || header.trim() === '') {
    return undefined;
  }
  const seconds = Number(header);
  const milliseconds = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(header) - Date.now();
  return Number.isFinite(milliseconds) ? Math.min(Math.max(milliseconds, 0), retryAfterCap) : undefined;
};

/**
 * One request, its body read within the timeout. A network error, a 408, a 429 or a 5xx is
 * retried after the backoff, or after the wait a `Retry-After` names (capped).
 */
const fetchWithRetry = async (url: string, transport: Transport): Promise<Fetched> => {
  let lastError: unknown;
  let requestedWait: number | undefined;
  for (const backoff of [0, ...retryBackoff]) {
    // A `Retry-After` may ask for longer than the backoff, never for less (zero, or a date already past).
    const wait = Math.min(Math.max(requestedWait ?? 0, backoff), retryAfterCap);
    if (wait > 0) {
      // oxlint-disable-next-line no-await-in-loop -- Retries are sequential by definition.
      await transport.wait(wait);
    }
    requestedWait = undefined;
    try {
      const signal = AbortSignal.timeout(transport.requestTimeout);
      // oxlint-disable-next-line no-await-in-loop -- Retries are sequential by definition.
      const response = await fetch(url, { cache: 'no-store', signal });
      // oxlint-disable-next-line no-await-in-loop -- The body belongs to this attempt.
      const body = new Uint8Array(await response.arrayBuffer());
      if (!isRetryable(response.status)) {
        return { status: response.status, contentType: response.headers.get('content-type') ?? '', body };
      }
      requestedWait = retryAfterWait(response.headers.get('retry-after') ?? undefined);
      lastError = new Error(`${url} answered ${String(response.status)}`);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
};

/** The environment variable that skips retention for one deploy, when the live origin is down and a fix must ship. */
export const skipRetentionVariable = 'TAU_RETAIN_ASSETS_SKIP';

/** Why the live index could not be read; the deploy fails rather than drop the generations it should keep. */
const unreadableIndex = (origin: string, fileName: string, reason: string): Error =>
  new Error(
    `Retention could not read the live asset index at ${origin}/${fileName} (${reason}). ` +
      `Publishing now would drop every retained asset. Re-run once the live deploy answers, or set ` +
      `${skipRetentionVariable}=1 to ship this deploy without retention.`,
  );

const readLiveIndex = async (
  origin: string,
  transport: Transport,
  kind: IndexKind,
): Promise<ServedAssetsIndex | undefined> => {
  const { fileName } = kind;
  let response: Fetched;
  try {
    response = await fetchWithRetry(`${origin}/${fileName}`, transport);
  } catch (error) {
    // After the retries: a live deploy that cannot be reached, or keeps failing, may still have assets to keep.
    throw unreadableIndex(origin, fileName, String(error));
  }
  // No index yet: only a 404. The first deploy that runs this on a site whose catch-all answers 200 skips once.
  if (response.status === 404) {
    console.log(`→ ${origin} publishes no ${fileName} yet; nothing to retain.`);
    return undefined;
  }
  if (response.status !== 200) {
    throw unreadableIndex(origin, fileName, `answered ${String(response.status)}`);
  }
  /* A 200 that is not the index (an SPA catch-all, a maintenance page, a rollback to a deploy from
   * before retention) may stand in front of assets pages still load: it fails rather than keep none. */
  if (!response.contentType.includes('application/json')) {
    if (kind.catchAllMeansNone) {
      console.log(`→ ${origin} answers ${fileName} with its catch-all, a build from before it; nothing to retain.`);
      return undefined;
    }
    throw unreadableIndex(
      origin,
      fileName,
      `answered 200 ${response.contentType || 'without a content type'}, not the index`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(response.body));
  } catch (error) {
    throw unreadableIndex(origin, fileName, `answered JSON that does not parse (${String(error)})`);
  }
  return parseServedAssetsIndex(parsed, `${origin}/${fileName}`, kind.isServable);
};

type Download = {
  readonly origin: string;
  readonly clientDirectory: string;
  readonly transport: Transport;
  readonly store: string | undefined;
};

/** A store file's name: its SRI integrity, made safe as a file name. */
const storeFileName = (integrity: string): string => integrity.replaceAll('/', '_').replaceAll('+', '-');

/** A runtime bundle file's bytes from the store, when it holds them unchanged. */
const readFromStore = async (
  store: string | undefined,
  asset: ServedAsset,
): Promise<Uint8Array<ArrayBuffer> | undefined> => {
  if (store === undefined || !isRuntimeBundlePath(asset.path)) {
    return undefined;
  }
  const file = join(store, storeFileName(asset.integrity));
  let bytes: Uint8Array<ArrayBuffer>;
  try {
    bytes = Uint8Array.from(await readFile(file));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
  if (sri(bytes) === asset.integrity) {
    return bytes;
  }
  // A cache is not trusted: a changed file is dropped, fetched from the live deploy, and stored again.
  await rm(file, { force: true });
  return undefined;
};

/** Where one retained asset's bytes came from. */
type Retained = { readonly bytes: number; readonly fromStore: boolean };

const downloadAsset = async (
  { origin, clientDirectory, transport, store }: Download,
  asset: ServedAsset,
): Promise<Retained> => {
  const destination = join(clientDirectory, asset.path);
  const stored = await readFromStore(store, asset);
  if (stored !== undefined) {
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, stored);
    return { bytes: stored.byteLength, fromStore: true };
  }
  const response = await fetchWithRetry(assetUrl(origin, asset.path), transport);
  if (response.status !== 200) {
    throw new Error(
      `${asset.path} answered ${String(response.status)} on ${origin}; the live deploy lost an asset its index lists.`,
    );
  }
  const bytes = response.body;
  if (sri(bytes) !== asset.integrity) {
    throw new Error(`${asset.path} does not match its integrity in the live index; refusing to publish it.`);
  }
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, bytes);
  return { bytes: bytes.byteLength, fromStore: false };
};

/**
 * Leave in the store exactly the runtime bundle files this deploy serves, its own and those it kept,
 * so the next deploy reads them from it rather than downloading them again.
 *
 * @param store - The store directory.
 * @param clientDirectory - The new client build, which now holds every served file.
 * @param served - The new deploy's index entries.
 */
const refreshStore = async (store: string, clientDirectory: string, served: readonly ServedAsset[]): Promise<void> => {
  const wanted = new Map(
    served.filter((asset) => isRuntimeBundlePath(asset.path)).map((asset) => [storeFileName(asset.integrity), asset]),
  );
  await mkdir(store, { recursive: true });
  const present = new Set(await readdir(store));
  await Promise.all(
    [...present].filter((name) => !wanted.has(name)).map(async (name) => rm(join(store, name), { recursive: true })),
  );
  await mapWithConcurrency(
    [...wanted].filter(([name]) => !present.has(name)),
    hashConcurrency,
    async ([name, asset]) => copyFile(join(clientDirectory, asset.path), join(store, name)),
  );
};

type Pass = {
  readonly clientDirectory: string;
  readonly origin: string | undefined;
  readonly transport: Transport;
  readonly skip: boolean;
  readonly now: number;
  readonly store: string | undefined;
};

type PassResult = {
  readonly retained: number;
  readonly bytes: number;
  readonly storedBytes: number;
  readonly index: ServedAssetsIndex;
};

/** One index: list the build's own files, keep the live deploy's, write the new index. */
const retainIndex = async (pass: Pass, kind: IndexKind): Promise<PassResult> => {
  const own = await listOwnAssets(pass.clientDirectory, kind);
  const previous =
    pass.origin === undefined || pass.skip ? undefined : await readLiveIndex(pass.origin, pass.transport, kind);
  const kept =
    previous === undefined
      ? []
      : planRetention(previous, new Set(own.map((asset) => asset.path)), {
          now: pass.now,
          shouldAge: !isSameBuild(previous, own),
        });
  const download: Download = {
    origin: pass.origin ?? '',
    clientDirectory: pass.clientDirectory,
    transport: pass.transport,
    store: pass.store,
  };
  const results = await mapWithConcurrency(kept, downloadConcurrency, async (asset) => downloadAsset(download, asset));
  const index: ServedAssetsIndex = {
    schema: servedAssetsIndexSchema,
    assets: [...own, ...kept].toSorted((left, right) => left.path.localeCompare(right.path)),
  };
  await writeFile(join(pass.clientDirectory, kind.fileName), `${JSON.stringify(index)}\n`);
  return {
    retained: kept.length,
    bytes: results.reduce((total, result) => total + result.bytes, 0),
    storedBytes: results.reduce((total, result) => total + (result.fromStore ? result.bytes : 0), 0),
    index,
  };
};

/**
 * Retain the live deploy's assets and runtime bundles in a new client build and write both indexes.
 *
 * @param options - The new client build directory and the live deploy's origin (none: indexes only).
 * @returns How many files and bytes were retained (both indexes), and the two new indexes.
 */
export const retainPreviousAssets = async (options: {
  readonly clientDirectory: string;
  readonly origin: string | undefined;
  /** Milliseconds one request may take; defaults to 30 s. */
  readonly requestTimeout?: number;
  /** Waits out a retry's backoff; replaceable in tests. */
  readonly wait?: (milliseconds: number) => Promise<void>;
  /** Retain nothing and ask the live deploy nothing (`TAU_RETAIN_ASSETS_SKIP`): an emergency deploy while it is down. */
  readonly skip?: boolean;
  /** This deploy's time in milliseconds since the epoch; replaceable in tests. */
  readonly now?: number;
  /** Directory of runtime bundle files kept between deploys (`TAU_RETAIN_ASSETS_STORE`); none: download them all. */
  readonly store?: string;
}): Promise<{
  readonly retained: number;
  readonly bytes: number;
  /** Of `bytes`, those read from the store rather than downloaded. */
  readonly storedBytes: number;
  /** The `/assets/*` index (`tau-served-assets.json`). */
  readonly index: ServedAssetsIndex;
  /** The runtime bundle index (`tau-served-runtimes.json`). */
  readonly runtimes: ServedAssetsIndex;
}> => {
  const pass: Pass = {
    clientDirectory: options.clientDirectory,
    origin: options.origin?.replace(/\/+$/u, ''),
    transport: {
      requestTimeout: options.requestTimeout ?? defaultRequestTimeout,
      wait: options.wait ?? (async (milliseconds) => setTimeout(milliseconds)),
    },
    skip: options.skip === true,
    now: options.now ?? Date.now(),
    store: options.store,
  };
  // The assets index first: it fails closed on an unreadable live deploy before any runtime is fetched.
  const assets = await retainIndex(pass, assetsKind);
  const runtimes = await retainIndex(pass, runtimesKind);
  if (options.store !== undefined) {
    await refreshStore(options.store, options.clientDirectory, runtimes.index.assets);
  }
  return {
    retained: assets.retained + runtimes.retained,
    bytes: assets.bytes + runtimes.bytes,
    storedBytes: assets.storedBytes + runtimes.storedBytes,
    index: assets.index,
    runtimes: runtimes.index,
  };
};

const main = async (): Promise<void> => {
  const configured = process.env['TAU_RETAIN_ASSETS_FROM']?.trim();
  const origin = configured === undefined || configured === '' ? undefined : configured;
  const skip = process.env[skipRetentionVariable]?.trim() === '1';
  if (skip) {
    console.warn(
      `::warning::${skipRetentionVariable}=1: this deploy retains NO previous assets. Pages open across it ` +
        'may fail their next lazy import until they reload. Use only to ship a fix while the live origin is down.',
    );
  }
  const configuredStore = process.env['TAU_RETAIN_ASSETS_STORE']?.trim();
  const store = configuredStore === undefined || configuredStore === '' ? undefined : resolve(configuredStore);
  const { retained, bytes, storedBytes, index, runtimes } = await retainPreviousAssets({
    clientDirectory: resolve(import.meta.dirname, '../build/client'),
    origin,
    skip,
    store,
  });
  console.log(
    `✓ ${String(retained)} assets (${String(Math.round(bytes / 1024))} KiB, ${String(Math.round(storedBytes / 1024))} KiB of it from the store) retained from ${origin ?? 'no live deploy'}; ${String(index.assets.length)} assets and ${String(runtimes.assets.length)} runtime files served.`,
  );
};

if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) {
  try {
    await main();
  } catch (error) {
    console.error('retain-previous-assets failed:', error);
    process.exit(1);
  }
}
