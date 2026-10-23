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
 * The index fails closed: a malformed index or an asset that does not match its
 * integrity fails the build. A live site without an index (the first deploy
 * that runs this) or that cannot be reached keeps nothing and says so.
 *
 * Optional env vars:
 *   TAU_RETAIN_ASSETS_FROM   Origin of the live deploy, e.g. https://taucad.dev (`deploy-ui.yml`).
 *                            Unset: only the new deploy's index is written.
 *
 * Usage: node scripts/retain-previous-assets.mts   (from apps/ui, after the client build)
 * Exit codes: 0 success, 1 a malformed index or an asset that cannot be retained.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, posix, relative, resolve, sep } from 'node:path';
import process from 'node:process';
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

const assetPath = /^assets\/[\w.-]+(?:\/[\w.-]+)*$/u;
const sha384Integrity = /^sha384-[A-Za-z0-9+/]+={0,2}$/u;
const downloadConcurrency = 8;
/** Milliseconds to wait before each retry of a failed request. */
const retryBackoff = [1000, 2000, 4000] as const;
/** Milliseconds one request may take, the body included. */
const defaultRequestTimeout = 30_000;

/**
 * Files only the local Node server uses: precompressed siblings (`compress-static-assets.mts`)
 * and source maps, which the upload deletes before a deploy. Netlify neither serves them as
 * chunks nor needs them kept.
 */
const isLocalOnly = (path: string): boolean => /\.(?:br|gz|map)$/u.test(path);

type Transport = {
  readonly requestTimeout: number;
  readonly wait: (milliseconds: number) => Promise<void>;
};

const integrityOf = (bytes: Uint8Array<ArrayBuffer>): string =>
  `sha384-${createHash('sha384').update(bytes).digest('base64')}`;

const assertServedAsset = (asset: ServedAsset): void => {
  if (!assetPath.test(asset.path) || asset.path.split('/').includes('..')) {
    throw new Error(`The live asset index refuses the path ${JSON.stringify(asset.path)}.`);
  }
  if (!sha384Integrity.test(asset.integrity) || !Number.isInteger(asset.generation) || asset.generation < 0) {
    throw new Error(`The live asset index has a malformed entry for ${asset.path}.`);
  }
};

/**
 * The assets a new deploy keeps from the live one.
 *
 * @param previous - The live deploy's index.
 * @param ownPaths - Asset paths the new build has itself.
 * @param generations - Deploys after its own that an asset stays served for.
 * @returns The assets to download, one generation older than the live index lists them.
 * @throws When the index names a path outside `assets/`.
 */
export const planRetention = (
  previous: ServedAssetsIndex,
  ownPaths: ReadonlySet<string>,
  generations: number = retainedGenerations,
): readonly ServedAsset[] => {
  for (const asset of previous.assets) {
    assertServedAsset(asset);
  }
  return previous.assets
    .filter((asset) => asset.generation + 1 <= generations && !ownPaths.has(asset.path) && !isLocalOnly(asset.path))
    .map((asset) => ({ ...asset, generation: asset.generation + 1 }));
};

const listOwnAssets = async (clientDirectory: string): Promise<readonly ServedAsset[]> => {
  // A build without its asset directory is broken; publishing an empty index would drop every retained asset.
  const entries = await readdir(join(clientDirectory, 'assets'), { recursive: true, withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile() && !isLocalOnly(entry.name));
  return Promise.all(
    files.map(async (entry) => {
      const absolute = join(entry.parentPath, entry.name);
      const path = relative(clientDirectory, absolute).split(sep).join(posix.sep);
      return { path, integrity: integrityOf(new Uint8Array(await readFile(absolute))), generation: 0 };
    }),
  );
};

/** One request, its body read within the timeout; a 5xx or a network error is retried after the backoff. */
const fetchWithRetry = async (
  url: string,
  transport: Transport,
): Promise<{ readonly status: number; readonly body: Uint8Array<ArrayBuffer> }> => {
  let lastError: unknown;
  for (const backoff of [0, ...retryBackoff]) {
    if (backoff > 0) {
      // oxlint-disable-next-line no-await-in-loop -- Retries are sequential by definition.
      await transport.wait(backoff);
    }
    try {
      const signal = AbortSignal.timeout(transport.requestTimeout);
      // oxlint-disable-next-line no-await-in-loop -- Retries are sequential by definition.
      const response = await fetch(url, { cache: 'no-store', signal });
      // oxlint-disable-next-line no-await-in-loop -- The body belongs to this attempt.
      const body = new Uint8Array(await response.arrayBuffer());
      if (response.status < 500) {
        return { status: response.status, body };
      }
      lastError = new Error(`${url} answered ${String(response.status)}`);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
};

const readLiveIndex = async (origin: string, transport: Transport): Promise<ServedAssetsIndex | undefined> => {
  let response: { readonly status: number; readonly body: Uint8Array<ArrayBuffer> };
  try {
    response = await fetchWithRetry(`${origin}/${servedAssetsIndexFileName}`, transport);
  } catch (error) {
    console.warn(`::warning::No assets retained: ${origin} could not be reached (${String(error)}).`);
    return undefined;
  }
  if (response.status === 404) {
    console.log(`→ ${origin} publishes no ${servedAssetsIndexFileName} yet; nothing to retain.`);
    return undefined;
  }
  if (response.status !== 200) {
    console.warn(
      `::warning::No assets retained: ${origin}/${servedAssetsIndexFileName} answered ${String(response.status)}.`,
    );
    return undefined;
  }
  const index = JSON.parse(new TextDecoder().decode(response.body)) as Partial<ServedAssetsIndex>;
  if (index.schema !== servedAssetsIndexSchema || !Array.isArray(index.assets)) {
    throw new Error(`${origin}/${servedAssetsIndexFileName} is not a ${servedAssetsIndexSchema} index.`);
  }
  return index as ServedAssetsIndex;
};

type Download = { readonly origin: string; readonly clientDirectory: string; readonly transport: Transport };

const downloadAsset = async ({ origin, clientDirectory, transport }: Download, asset: ServedAsset): Promise<number> => {
  const response = await fetchWithRetry(`${origin}/${asset.path}`, transport);
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
}): Promise<{ readonly retained: number; readonly bytes: number; readonly index: ServedAssetsIndex }> => {
  const transport: Transport = {
    requestTimeout: options.requestTimeout ?? defaultRequestTimeout,
    wait: options.wait ?? (async (milliseconds) => setTimeout(milliseconds)),
  };
  const own = await listOwnAssets(options.clientDirectory);
  const origin = options.origin?.replace(/\/+$/u, '');
  const previous = origin === undefined ? undefined : await readLiveIndex(origin, transport);
  const kept = previous === undefined ? [] : planRetention(previous, new Set(own.map((asset) => asset.path)));

  let bytes = 0;
  const download: Download = { origin: origin ?? '', clientDirectory: options.clientDirectory, transport };
  const queue = [...kept];
  const worker = async (): Promise<void> => {
    for (let asset = queue.shift(); asset !== undefined; asset = queue.shift()) {
      // oxlint-disable-next-line no-await-in-loop -- Each worker downloads one asset at a time.
      const size = await downloadAsset(download, asset);
      bytes += size;
    }
  };
  await Promise.all(Array.from({ length: Math.min(downloadConcurrency, queue.length) }, worker));

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
  const { retained, bytes, index } = await retainPreviousAssets({
    clientDirectory: resolve(import.meta.dirname, '../build/client'),
    origin,
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
