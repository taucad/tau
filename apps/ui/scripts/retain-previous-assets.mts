/**
 * Keep the previous deploys' hashed assets in a new UI deploy (TAU-UI-6).
 *
 * A deploy publishes only its own `/assets/*`, so a page loaded from the build
 * before it fails its next lazy import the moment the new one goes live. This
 * runs last in the Netlify build command, after source-map injection has given
 * every chunk its final bytes. It reads the live deploy's index of served
 * assets, downloads each asset the new build lacks from the live origin, checks
 * it against the index's integrity, and writes it beside the new build's own.
 * An asset is kept for `retainedGenerations` deploys after the one that built it.
 * It then writes the new deploy's index (`tau-served-assets.json`), which the
 * next deploy reads in turn. Netlify stores files by content, so a retained
 * asset is not uploaded again.
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
 *
 * Usage: node scripts/retain-previous-assets.mts   (from apps/ui, after the client build)
 * Exit codes: 0 success, 1 a malformed or unreadable index, or an asset that cannot be retained.
 */
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, posix, relative, resolve, sep } from 'node:path';
import process from 'node:process';
import { pipeline } from 'node:stream/promises';
import { setTimeout } from 'node:timers/promises';

/** File the new deploy publishes at its root, listing every asset it serves. */
export const servedAssetsIndexFileName = 'tau-served-assets.json';

/** `schema` of {@link ServedAssetsIndex}. */
export const servedAssetsIndexSchema = 'tau-ui-served-assets-v1';

/** Deploys after its own that an asset stays served for. */
export const retainedGenerations = 2;

/** One served asset: its path under the client root, its SRI integrity and its age in deploys. */
export type ServedAsset = {
  readonly path: string;
  readonly integrity: string;
  /** `0` for the deploy's own build, `n` for an asset kept from `n` deploys before. */
  readonly generation: number;
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
 * Whether a path can be published by one deploy and read back by the next: under `assets/`,
 * every segment a real name, nothing a URL or a file system would read differently. This is
 * the one check both sides apply, so no build can publish a name its successor refuses.
 *
 * @param path - A path relative to the client root, with `/` separators.
 * @returns `true` when the path is safe to publish and to retain.
 */
export const isServableAssetPath = (path: string): boolean => {
  const segments = path.split('/');
  return (
    segments[0] === 'assets' &&
    segments.length > 1 &&
    !forbiddenPathCharacter.test(path) &&
    segments.slice(1).every((segment) => segment !== '' && segment !== '.' && segment !== '..')
  );
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

const integrityOf = (bytes: Uint8Array<ArrayBuffer>): string =>
  `sha384-${createHash('sha384').update(bytes).digest('base64')}`;

/** Check one live index entry, which arrives as untrusted JSON. */
const assertServedAsset = (entry: unknown): ServedAsset => {
  if (typeof entry !== 'object' || entry === null) {
    throw new TypeError(`The live asset index has a malformed entry: ${JSON.stringify(entry)}.`);
  }
  const { path, integrity, generation } = entry as Partial<Record<keyof ServedAsset, unknown>>;
  if (typeof path !== 'string' || typeof integrity !== 'string' || typeof generation !== 'number') {
    throw new TypeError(`The live asset index has a malformed entry: ${JSON.stringify(entry)}.`);
  }
  if (!isServableAssetPath(path)) {
    throw refusePath(path, 'live asset index');
  }
  if (!sha384Integrity.test(integrity) || !Number.isInteger(generation) || generation < 0) {
    throw new Error(`The live asset index has a malformed entry for ${path}.`);
  }
  return { path, integrity, generation };
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
export const parseServedAssetsIndex = (value: unknown, source: string): ServedAssetsIndex => {
  const index = (typeof value === 'object' && value !== null ? value : {}) as Partial<
    Record<'schema' | 'assets', unknown>
  >;
  if (index.schema !== servedAssetsIndexSchema || !Array.isArray(index.assets)) {
    throw new Error(`${source} is not a ${servedAssetsIndexSchema} index.`);
  }
  const youngest = new Map<string, ServedAsset>();
  for (const entry of index.assets as readonly unknown[]) {
    const asset = assertServedAsset(entry);
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
 * @param options - `generations`: deploys after its own that an asset stays served for; `shouldAge`:
 *   `false` for a redeploy of the same build ({@link isSameBuild}), whose ages stay as listed.
 * @returns The assets to download, one generation older than the live index lists them unless not aging.
 */
export const planRetention = (
  previous: ServedAssetsIndex,
  ownPaths: ReadonlySet<string>,
  options: { readonly generations?: number; readonly shouldAge?: boolean } = {},
): readonly ServedAsset[] => {
  const { generations = retainedGenerations, shouldAge = true } = options;
  const step = shouldAge ? 1 : 0;
  return previous.assets
    .filter(
      (asset) =>
        asset.generation + step <= generations && !ownPaths.has(asset.path) && !isNeverLoadedByPages(asset.path),
    )
    .map((asset) => ({ ...asset, generation: asset.generation + step }));
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

const listOwnAssets = async (clientDirectory: string): Promise<readonly ServedAsset[]> => {
  // A build without its asset directory is broken; publishing an empty index would drop every retained asset.
  const entries = await readdir(join(clientDirectory, 'assets'), { recursive: true, withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile() && !isNeverLoadedByPages(entry.name));
  const paths = files.map((entry) => {
    const absolute = join(entry.parentPath, entry.name);
    const path = relative(clientDirectory, absolute).split(sep).join(posix.sep);
    if (!isServableAssetPath(path)) {
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
const unreadableIndex = (origin: string, reason: string): Error =>
  new Error(
    `Retention could not read the live asset index at ${origin}/${servedAssetsIndexFileName} (${reason}). ` +
      `Publishing now would drop every retained asset. Re-run once the live deploy answers, or set ` +
      `${skipRetentionVariable}=1 to ship this deploy without retention.`,
  );

const readLiveIndex = async (origin: string, transport: Transport): Promise<ServedAssetsIndex | undefined> => {
  let response: Fetched;
  try {
    response = await fetchWithRetry(`${origin}/${servedAssetsIndexFileName}`, transport);
  } catch (error) {
    // After the retries: a live deploy that cannot be reached, or keeps failing, may still have assets to keep.
    throw unreadableIndex(origin, String(error));
  }
  // No index yet: only a 404. The first deploy that runs this on a site whose catch-all answers 200 skips once.
  if (response.status === 404) {
    console.log(`→ ${origin} publishes no ${servedAssetsIndexFileName} yet; nothing to retain.`);
    return undefined;
  }
  if (response.status !== 200) {
    throw unreadableIndex(origin, `answered ${String(response.status)}`);
  }
  /* A 200 that is not the index (an SPA catch-all, a maintenance page, a rollback to a deploy from
   * before retention) may stand in front of assets pages still load: it fails rather than keep none. */
  if (!response.contentType.includes('application/json')) {
    throw unreadableIndex(origin, `answered 200 ${response.contentType || 'without a content type'}, not the index`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(response.body));
  } catch (error) {
    throw unreadableIndex(origin, `answered JSON that does not parse (${String(error)})`);
  }
  return parseServedAssetsIndex(parsed, `${origin}/${servedAssetsIndexFileName}`);
};

type Download = { readonly origin: string; readonly clientDirectory: string; readonly transport: Transport };

const downloadAsset = async ({ origin, clientDirectory, transport }: Download, asset: ServedAsset): Promise<number> => {
  const response = await fetchWithRetry(assetUrl(origin, asset.path), transport);
  if (response.status !== 200) {
    throw new Error(
      `${asset.path} answered ${String(response.status)} on ${origin}; the live deploy lost an asset its index lists.`,
    );
  }
  const bytes = response.body;
  if (integrityOf(bytes) !== asset.integrity) {
    throw new Error(`${asset.path} does not match its integrity in the live index; refusing to publish it.`);
  }
  const destination = join(clientDirectory, asset.path);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, bytes);
  return bytes.byteLength;
};

/**
 * Retain the live deploy's assets in a new client build and write its index.
 *
 * @param options - The new client build directory and the live deploy's origin (none: index only).
 * @returns How many assets and bytes were retained, and the new index.
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
}): Promise<{ readonly retained: number; readonly bytes: number; readonly index: ServedAssetsIndex }> => {
  const transport: Transport = {
    requestTimeout: options.requestTimeout ?? defaultRequestTimeout,
    wait: options.wait ?? (async (milliseconds) => setTimeout(milliseconds)),
  };
  const own = await listOwnAssets(options.clientDirectory);
  const origin = options.origin?.replace(/\/+$/u, '');
  const previous = origin === undefined || options.skip === true ? undefined : await readLiveIndex(origin, transport);
  const kept =
    previous === undefined
      ? []
      : planRetention(previous, new Set(own.map((asset) => asset.path)), { shouldAge: !isSameBuild(previous, own) });

  const download: Download = { origin: origin ?? '', clientDirectory: options.clientDirectory, transport };
  const sizes = await mapWithConcurrency(kept, downloadConcurrency, async (asset) => downloadAsset(download, asset));
  const bytes = sizes.reduce((total, size) => total + size, 0);

  const index: ServedAssetsIndex = {
    schema: servedAssetsIndexSchema,
    assets: [...own, ...kept].toSorted((left, right) => left.path.localeCompare(right.path)),
  };
  await writeFile(join(options.clientDirectory, servedAssetsIndexFileName), `${JSON.stringify(index)}\n`);
  return { retained: kept.length, bytes, index };
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
  const { retained, bytes, index } = await retainPreviousAssets({
    clientDirectory: resolve(import.meta.dirname, '../build/client'),
    origin,
    skip,
  });
  console.log(
    `✓ ${String(retained)} assets (${String(Math.round(bytes / 1024))} KiB) retained from ${origin ?? 'no live deploy'}; ${String(index.assets.length)} served.`,
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
