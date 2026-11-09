/**
 * The PicoGK browser host pin: decide whether a tree's host inputs are already pinned, prove two builds of the host are
 * byte-identical, write the pin from a verified bundle, plan the write-once publish of every file to the dependency
 * buckets, and prove that every blob a pin names is served with its pinned digest by each environment's host.
 *
 * The pin is `packages/plugins/picogk/browser-host.pin.json` (charter `picogk-interim-digest-consumer`, D8). Its shape,
 * schema version 1, is stable for the UI that loads the host by digest:
 *
 *   {
 *     "//": "<provenance note>",
 *     "schemaVersion": 1,
 *     "inputsKey": "picogk-browser-host-v2-<picovoxel ref>-<package version>-<hashFiles>-<tooling>",
 *     "manifest": { "sha256": "<64 hex>", "byteLength": <bytes of assets-manifest.json> },
 *     "files": { "count": <manifest entries>, "byteLength": <sum of their byte lengths> }
 *   }
 *
 * Every manifest entry and the manifest itself is one blob, `blobs/sha256/<hex>` (D7), in each environment's locked
 * dependency bucket: `tau-prod-dependencies` behind `dependencies.tau.new` and `tau-staging-au-dependencies` behind
 * `dependencies.taucad.dev`. A pin is proven on both hosts, since the production and staging UIs each load from their
 * own. The pin is absent
 * until the release bot's first pin pull request lands; an absent pin pins nothing, so the producer builds and the
 * blob check has nothing to prove.
 *
 * Usage: node scripts/src/picogk-browser-host-pin.ts <command> …
 *   status --pin <pin.json> --key <inputsKey>             `pinned=` and `tag=` lines for $GITHUB_OUTPUT
 *   compare <bundle> <bundle>                             refuse unless both trees hold the same bytes
 *   write --key <inputsKey> --bundle <dir> --out <pin>    verify a bundle and write its pin
 *   plan --pin <pin.json> --key <inputsKey> --bundle <dir> --tag <tag> --out <tsv>
 *                                                         verify a bundle against its pin and list `sha256 path type` rows
 *   check --pin <pin.json> [--environment <name> | --base <url>]
 *                                                         prove every pinned blob is served with its digest by both
 *                                                         hosts, or by one environment's (`production`, `staging`)
 *   served --pin <pin.json>                               `served=` line for $GITHUB_OUTPUT: whether both hosts already
 *                                                         serve every blob, probing an unserved manifest with one HEAD
 * Exit codes: 0 success (`served=false` included); 1 a refusal or failed check; 2 usage.
 */
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

/** The committed pin of one published PicoGK browser host. */
export type PicogkBrowserHostPin = {
  readonly schemaVersion: 1;
  readonly inputsKey: string;
  readonly manifest: { readonly sha256: string; readonly byteLength: number };
  readonly files: { readonly count: number; readonly byteLength: number };
};

/** One file a `tau-picogk-browser-v2` manifest lists. */
export type ManifestFile = { readonly path: string; readonly sha256: string; readonly byteLength: number };

/** One write-once blob of a publish: its digest, the bundle file holding it and the `Content-Type` it is served with. */
export type PublishRow = { readonly sha256: string; readonly path: string; readonly contentType: string };

/** Each environment's digest-addressed base: the public host of its locked dependency bucket. */
export const blobBases = {
  production: 'https://dependencies.tau.new/blobs/sha256/',
  staging: 'https://dependencies.taucad.dev/blobs/sha256/',
} as const;

/** An environment that serves the host: the key of its blob base. */
export type BlobEnvironment = keyof typeof blobBases;

const isBlobEnvironment = (name: string): name is BlobEnvironment => Object.hasOwn(blobBases, name);

/** The bundle's manifest file, the one the pin's `manifest` digest names. */
const manifestName = 'assets-manifest.json';

// The build-only receipt `prepare-browser-host.mts` writes beside the manifest; it is never served or published.
const receiptName = 'assets-receipt.json';
const pinNote =
  'Written by the release bot from a verified build (.github/workflows/picogk-browser-host-publish.yml, scripts/src/picogk-browser-host-pin.ts); never edit by hand. Every blob is served write-once at https://dependencies.tau.new/blobs/sha256/<hex> and https://dependencies.taucad.dev/blobs/sha256/<hex> before this file lands.';
const hex64 = /^[\da-f]{64}$/u;
const inputsKeyPattern = /^picogk-browser-host-v\d+-[\da-f]{40}-[\w.+-]+-[\da-f]{64}-[\da-f]{64}$/u;
const pathPattern = /^[\w./-]+$/u;

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isByteLength = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;
const sha256 = (bytes: Uint8Array<ArrayBuffer>): string => createHash('sha256').update(bytes).digest('hex');

/**
 * Whether a string has the shape of the browser host's inputs key, the `key` job's output in `picogk-browser-host.yml`.
 * @param key - A candidate inputs key.
 * @returns True for `picogk-browser-host-v<n>-<ref>-<version>-<files hash>-<tooling hash>`.
 */
export const isInputsKey = (key: string): boolean => inputsKeyPattern.test(key);

/**
 * The `dependency@` tag that publishes the host built from an inputs key (D9): the first 16 hex of the key's sha256, since
 * the key itself starts with the PicoVoxel ref that many keys share.
 * @param inputsKey - A browser host inputs key.
 * @returns `dependency@picogk-browser-<16 hex>`.
 */
export const dependencyTag = (inputsKey: string): string =>
  `dependency@picogk-browser-${sha256(new TextEncoder().encode(inputsKey)).slice(0, 16)}`;

/**
 * Validate a parsed pin.
 * @param value - The parsed `browser-host.pin.json`.
 * @returns The pin.
 * @throws When the value is not a schema v1 PicoGK browser host pin.
 */
export const parsePin = (value: unknown): PicogkBrowserHostPin => {
  if (!isRecord(value) || value['schemaVersion'] !== 1) {
    throw new TypeError('Not a schema v1 PicoGK browser host pin.');
  }
  const { inputsKey, manifest, files } = value;
  if (typeof inputsKey !== 'string' || !isInputsKey(inputsKey)) {
    throw new TypeError('The PicoGK browser host pin has no valid inputsKey.');
  }
  if (
    !isRecord(manifest) ||
    typeof manifest['sha256'] !== 'string' ||
    !hex64.test(manifest['sha256']) ||
    !isByteLength(manifest['byteLength']) ||
    manifest['byteLength'] === 0
  ) {
    throw new TypeError('The PicoGK browser host pin has no valid manifest digest and byte length.');
  }
  if (!isRecord(files) || !isByteLength(files['count']) || files['count'] === 0 || !isByteLength(files['byteLength'])) {
    throw new TypeError('The PicoGK browser host pin has no valid file count and byte length.');
  }
  return {
    schemaVersion: 1,
    inputsKey,
    manifest: { sha256: manifest['sha256'], byteLength: manifest['byteLength'] },
    files: { count: files['count'], byteLength: files['byteLength'] },
  };
};

/**
 * Read a pin file.
 * @param path - The pin's path.
 * @returns The pin, or `undefined` when no file exists: nothing is pinned yet.
 * @throws When the file exists but is not a valid pin.
 */
export const readPin = async (path: string): Promise<PicogkBrowserHostPin | undefined> => {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (error) {
    if (isRecord(error) && error['code'] === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
  return parsePin(JSON.parse(text));
};

/**
 * Whether the producer must build: the tree's inputs key is pinned exactly when it equals the pin's.
 * @param pin - The committed pin, or `undefined` when none exists.
 * @param inputsKey - The tree's inputs key.
 * @returns Whether the key is pinned, and the `dependency@` tag a build of this key publishes from.
 * @throws When the key is not an inputs key.
 */
export const pinStatus = (
  pin: PicogkBrowserHostPin | undefined,
  inputsKey: string,
): { readonly pinned: boolean; readonly tag: string } => {
  if (!isInputsKey(inputsKey)) {
    throw new TypeError(`Not a PicoGK browser host inputs key: ${JSON.stringify(inputsKey)}.`);
  }
  return { pinned: pin?.inputsKey === inputsKey, tag: dependencyTag(inputsKey) };
};

const manifestEntries = (variant: unknown, name: string): ManifestFile[] => {
  if (!isRecord(variant) || !Array.isArray(variant['runtimeFiles']) || !Array.isArray(variant['references'])) {
    throw new TypeError(`The PicoGK browser manifest's ${name} variant has no runtimeFiles and references.`);
  }
  return [...(variant['runtimeFiles'] as unknown[]), ...(variant['references'] as unknown[])].map((entry) => {
    if (
      !isRecord(entry) ||
      typeof entry['path'] !== 'string' ||
      !pathPattern.test(entry['path']) ||
      entry['path'].split('/').some((part) => part === '' || part === '.' || part === '..') ||
      typeof entry['sha256'] !== 'string' ||
      !hex64.test(entry['sha256']) ||
      !isByteLength(entry['byteLength'])
    ) {
      throw new TypeError(`The PicoGK browser manifest's ${name} variant lists an invalid file.`);
    }
    return { path: entry['path'], sha256: entry['sha256'], byteLength: entry['byteLength'] };
  });
};

/**
 * Every file a `tau-picogk-browser-v2` manifest lists, serial then threaded, in manifest order.
 * @param bytes - The manifest's bytes.
 * @returns The listed files.
 * @throws When the bytes are not a v2 manifest or list a path twice (as the loader refuses one).
 */
export const manifestFiles = (bytes: Uint8Array<ArrayBuffer>): ManifestFile[] => {
  const manifest: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  if (!isRecord(manifest) || manifest['format'] !== 'tau-picogk-browser-v2') {
    throw new TypeError('Not a tau-picogk-browser-v2 manifest.');
  }
  const files = [
    ...manifestEntries(manifest['single'], 'single'),
    ...(manifest['multi'] === undefined ? [] : manifestEntries(manifest['multi'], 'multi')),
  ];
  const seen = new Set<string>();
  for (const { path } of files) {
    const key = path.toLocaleLowerCase('en-US');
    if (seen.has(key) || key === manifestName || key === receiptName) {
      throw new TypeError(`The PicoGK browser manifest lists ${path} twice or over its own files.`);
    }
    seen.add(key);
  }
  return files;
};

/**
 * The `Content-Type` a blob is served with: `application/wasm`, `text/javascript`, `application/json`, else
 * `application/octet-stream`. The loader verifies and runs every byte itself, so the type serves streaming compilation
 * and inspection, never trust.
 * @param path - The file's bundle path.
 * @returns Its media type.
 */
export const contentType = (path: string): string => {
  const extension = /\.([\da-z]+)$/iu.exec(path)?.[1]?.toLowerCase();
  switch (extension) {
    case 'wasm': {
      return 'application/wasm';
    }
    case 'js':
    case 'mjs': {
      return 'text/javascript';
    }
    case 'json': {
      return 'application/json';
    }
    default: {
      return 'application/octet-stream';
    }
  }
};

const hashFile = async (path: string): Promise<{ readonly sha256: string; readonly byteLength: number }> => {
  const hash = createHash('sha256');
  let byteLength = 0;
  for await (const chunk of createReadStream(path) as AsyncIterable<Uint8Array<ArrayBuffer>>) {
    hash.update(chunk);
    byteLength += chunk.byteLength;
  }
  return { sha256: hash.digest('hex'), byteLength };
};

const listFiles = async (root: string): Promise<string[]> => {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => !entry.isDirectory())
    .map((entry) => relative(root, join(entry.parentPath, entry.name)).split(sep).join('/'))
    .sort();
};

/** A bundle whose every file matches its manifest. */
export type VerifiedBundle = {
  readonly manifest: { readonly sha256: string; readonly byteLength: number };
  readonly files: readonly ManifestFile[];
};

/**
 * Verify a prepared bundle: every manifest entry is present with its digest and byte length, and the directory holds
 * nothing else but the manifest and its build-only receipt, so what is pinned is exactly what is published.
 * @param root - The bundle directory (`out/picogk-browser-host/bundle`, or the downloaded artifact).
 * @returns The manifest's identity and its files.
 * @throws When a file is missing, different or unlisted.
 */
export const verifyBundle = async (root: string): Promise<VerifiedBundle> => {
  const bytes = new Uint8Array(await readFile(join(root, manifestName)));
  const files = manifestFiles(bytes);
  const listed = new Set([manifestName, receiptName, ...files.map(({ path }) => path)]);
  const present = await listFiles(root);
  const unlisted = present.filter((path) => !listed.has(path));
  if (unlisted.length > 0) {
    throw new Error(`The bundle holds files its manifest does not list: ${unlisted.join(', ')}.`);
  }
  for (const file of files) {
    let actual: { readonly sha256: string; readonly byteLength: number };
    try {
      // oxlint-disable-next-line no-await-in-loop -- one file is hashed at a time, bounding memory
      actual = await hashFile(join(root, file.path));
    } catch {
      throw new Error(`The bundle is missing ${file.path}.`);
    }
    if (actual.sha256 !== file.sha256 || actual.byteLength !== file.byteLength) {
      throw new Error(`The bundle's ${file.path} does not match its manifest entry.`);
    }
  }
  return { manifest: { sha256: sha256(bytes), byteLength: bytes.byteLength }, files };
};

/**
 * The pin of a verified bundle built from an inputs key.
 * @param inputsKey - The key the bundle was built from.
 * @param bundle - The verified bundle.
 * @returns The pin, ready to serialize.
 * @throws When the key is not an inputs key.
 */
export const pinFor = (inputsKey: string, bundle: VerifiedBundle): PicogkBrowserHostPin =>
  parsePin({
    schemaVersion: 1,
    inputsKey,
    manifest: bundle.manifest,
    files: {
      count: bundle.files.length,
      byteLength: bundle.files.reduce((total, file) => total + file.byteLength, 0),
    },
  });

/**
 * The bytes of a pin file, with its provenance note and a trailing newline.
 * @param pin - The pin.
 * @returns The JSON text to commit.
 */
export const serializePin = (pin: PicogkBrowserHostPin): string =>
  `${JSON.stringify({ '//': pinNote, ...pin }, undefined, 2)}\n`;

/**
 * Compare two builds of the host file by file (charter I4). Every file of either tree counts, the manifest and the
 * receipt included, so a build that differs anywhere is never pinned.
 * @param first - One build's bundle directory.
 * @param second - The other's.
 * @returns One line per difference; empty when the trees hold the same bytes at the same paths.
 */
export const compareBundles = async (first: string, second: string): Promise<string[]> => {
  const [left, right] = await Promise.all([listFiles(first), listFiles(second)]);
  const rightSet = new Set(right);
  const leftSet = new Set(left);
  const differences = [
    ...left.filter((path) => !rightSet.has(path)).map((path) => `${path} is only in the first build`),
    ...right.filter((path) => !leftSet.has(path)).map((path) => `${path} is only in the second build`),
  ];
  for (const path of left.filter((name) => rightSet.has(name))) {
    // oxlint-disable-next-line no-await-in-loop -- one pair is hashed at a time, bounding memory
    const [a, b] = await Promise.all([hashFile(join(first, path)), hashFile(join(second, path))]);
    if (a.sha256 !== b.sha256 || a.byteLength !== b.byteLength) {
      differences.push(
        `${path} differs (${a.sha256} ${String(a.byteLength)} B, ${b.sha256} ${String(b.byteLength)} B)`,
      );
    }
  }
  return differences;
};

/**
 * The blobs a tag run writes, after proving the bundle is the pinned one: the tag names the pin's key, the tree's key
 * is the pin's, and the bundle's manifest and files are the pinned ones. One row per distinct digest, files first and
 * the manifest last, so a manifest in a bucket means every file it names is there too.
 * @param options - The pin at the tag, the tag, the tree's inputs key and the verified bundle.
 * @param options.pin - The pin the tagged commit carries.
 * @param options.tag - The `dependency@` tag of this run.
 * @param options.inputsKey - The inputs key computed at the tag.
 * @param options.bundle - The verified bundle.
 * @returns The rows to publish.
 * @throws When anything differs from the pin.
 */
export const publishPlan = (options: {
  readonly pin: PicogkBrowserHostPin | undefined;
  readonly tag: string;
  readonly inputsKey: string;
  readonly bundle: VerifiedBundle;
}): PublishRow[] => {
  const { pin, tag, inputsKey, bundle } = options;
  if (pin === undefined) {
    throw new Error(`${tag} carries no PicoGK browser host pin; nothing is published.`);
  }
  if (dependencyTag(pin.inputsKey) !== tag) {
    throw new Error(`${tag} is not the tag of the pinned inputs key (${dependencyTag(pin.inputsKey)}).`);
  }
  if (pin.inputsKey !== inputsKey) {
    throw new Error(`The tree's inputs key ${inputsKey} is not the pinned ${pin.inputsKey}.`);
  }
  const actual = pinFor(inputsKey, bundle);
  if (JSON.stringify(actual) !== JSON.stringify(pin)) {
    throw new Error(
      `The bundle does not match the pin: built ${JSON.stringify(actual)}, pinned ${JSON.stringify(pin)}.`,
    );
  }
  const rows = new Map<string, PublishRow>();
  for (const { sha256: digest, path } of bundle.files) {
    const type = contentType(path);
    const existing = rows.get(digest);
    // The same bytes under two extensions are one blob; it is served as plain bytes rather than as either type.
    rows.set(digest, {
      sha256: digest,
      path: existing?.path ?? path,
      contentType: existing === undefined || existing.contentType === type ? type : 'application/octet-stream',
    });
  }
  rows.delete(bundle.manifest.sha256);
  return [
    ...rows.values(),
    { sha256: bundle.manifest.sha256, path: manifestName, contentType: contentType(manifestName) },
  ];
};

type Fetched = { readonly bytes?: Uint8Array<ArrayBuffer>; readonly failure?: string };

/** One blob to fetch: its URL, the digest and length it must have, and whether its bytes are kept. */
type BlobRequest = {
  readonly url: string;
  readonly expected: { readonly sha256: string; readonly byteLength: number };
  readonly transport: typeof fetch;
  readonly keep: boolean;
};

const fetchOnce = async ({ url, expected, transport, keep }: BlobRequest): Promise<Fetched> => {
  let response: Response;
  try {
    response = await transport(url, { redirect: 'error' });
  } catch (error) {
    return { failure: `${url} could not be fetched: ${error instanceof Error ? error.message : String(error)}` };
  }
  if (response.status !== 200 || response.body === null) {
    return { failure: `${url} answered HTTP ${String(response.status)}` };
  }
  const hash = createHash('sha256');
  const kept = keep ? new Uint8Array(expected.byteLength) : new Uint8Array();
  let byteLength = 0;
  // Leaving the loop early cancels the body, so an oversized blob is never read to its end.
  for await (const chunk of response.body) {
    byteLength += chunk.byteLength;
    if (byteLength > expected.byteLength) {
      return { failure: `${url} serves more than the pinned ${String(expected.byteLength)} bytes` };
    }
    hash.update(chunk);
    if (keep) {
      kept.set(chunk, byteLength - chunk.byteLength);
    }
  }
  if (byteLength !== expected.byteLength) {
    return { failure: `${url} served ${String(byteLength)} bytes, not ${String(expected.byteLength)}` };
  }
  if (hash.digest('hex') !== expected.sha256) {
    return { failure: `${url} does not hash to ${expected.sha256}` };
  }
  return { bytes: kept };
};

/** How a check retries a blob that is not served yet: a just-written blob can meet a cached miss at the edge. */
export type RetryPolicy = { readonly attempts: number; readonly wait: (attempt: number) => Promise<void> };

const defaultRetry: RetryPolicy = {
  attempts: 3,
  wait: async (attempt) =>
    new Promise((resolve) => {
      setTimeout(resolve, attempt * 5000);
    }),
};

const fetchBlob = async (request: BlobRequest, retry: RetryPolicy): Promise<Fetched> => {
  let result: Fetched = {};
  for (let attempt = 1; attempt <= retry.attempts; attempt++) {
    if (attempt > 1) {
      // oxlint-disable-next-line no-await-in-loop -- attempts are sequential by design
      await retry.wait(attempt - 1);
    }
    // oxlint-disable-next-line no-await-in-loop -- attempts are sequential by design
    result = await fetchOnce(request);
    if (result.failure === undefined) {
      return result;
    }
  }
  return result;
};

/**
 * Prove that a host serves every blob a pin names (D9, I2): the manifest at its pinned digest and byte length, then
 * every file the manifest lists at its own. A pin pull request may merge only when this returns no failure for the
 * production host and for the staging host.
 * @param options - The pin, the blob base and the transport.
 * @param options.pin - The pin to prove.
 * @param options.base - The digest-addressed base, ending in `/`.
 * @param options.transport - The `fetch` to use.
 * @param options.concurrency - How many blobs are fetched at once.
 * @param options.retry - How often, and after how long, a blob that is not served yet is fetched again.
 * @returns One line per blob that is not served with its pinned bytes.
 */
export const checkPinnedBlobs = async (options: {
  readonly pin: PicogkBrowserHostPin;
  readonly base: string;
  readonly transport: typeof fetch;
  readonly concurrency?: number;
  readonly retry?: RetryPolicy;
}): Promise<string[]> => {
  const { pin, base, transport } = options;
  const retry = options.retry ?? defaultRetry;
  const manifest = await fetchBlob(
    { url: `${base}${pin.manifest.sha256}`, expected: pin.manifest, transport, keep: true },
    retry,
  );
  if (manifest.bytes === undefined) {
    return [`manifest: ${String(manifest.failure)}`];
  }
  const files = manifestFiles(manifest.bytes);
  const byteLength = files.reduce((total, file) => total + file.byteLength, 0);
  if (files.length !== pin.files.count || byteLength !== pin.files.byteLength) {
    return [
      `manifest lists ${String(files.length)} files of ${String(byteLength)} bytes, not the pinned ${String(pin.files.count)} of ${String(pin.files.byteLength)}`,
    ];
  }
  const blobs = [...new Map(files.toReversed().map((file) => [file.sha256, file])).values()];
  const failures: string[] = [];
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < blobs.length) {
      const file = blobs[next++]!;
      // oxlint-disable-next-line no-await-in-loop -- each worker fetches one blob at a time
      const { failure } = await fetchBlob(
        { url: `${base}${file.sha256}`, expected: file, transport, keep: false },
        retry,
      );
      if (failure !== undefined) {
        failures.push(`${file.path}: ${failure}`);
      }
    }
  };
  await Promise.all(Array.from({ length: options.concurrency ?? 16 }, worker));
  return failures.sort();
};

/** Whether a pin's blobs are already served on both hosts, and why: the producer's publish decision (D31). */
export type ServedDecision = { readonly served: boolean; readonly reason: string };

/**
 * Whether every blob a freshly written pin names is already served, with its digest, by both hosts (charter D31: the
 * inputs key decides whether to build; the output digest names what is published). A rebuilt host whose manifest digest
 * both hosts already serve updates the pin record and publishes nothing.
 *
 * The probes stay minimal, since the digest may never have been published: one `HEAD` of the manifest per host, once
 * and without a retry, production then staging, and the first that is not `200` (a `404` is "not served") ends the
 * decision with no further request. Only when both hosts answer `200` is each proven in full with
 * {@link checkPinnedBlobs}; any failure there also reads as not served, so the producer falls back to tagging and
 * publishing, which writes whatever is missing.
 * @param options - The pin, the transport and the full check's retry policy and concurrency.
 * @param options.pin - The pin just written from the verified bundle.
 * @param options.transport - The `fetch` to use.
 * @param options.retry - How the full check retries a blob that is not served yet.
 * @param options.concurrency - How many blobs the full check fetches at once.
 * @returns Whether both hosts serve every blob, and a one-line reason.
 */
export const pinServed = async (options: {
  readonly pin: PicogkBrowserHostPin;
  readonly transport: typeof fetch;
  readonly retry?: RetryPolicy;
  readonly concurrency?: number;
}): Promise<ServedDecision> => {
  const { pin, transport } = options;
  const bases = Object.values(blobBases);
  for (const base of bases) {
    const url = `${base}${pin.manifest.sha256}`;
    let response: Response;
    try {
      // oxlint-disable-next-line no-await-in-loop -- the first host that does not serve the manifest ends the probes
      response = await transport(url, { method: 'HEAD', redirect: 'error' });
    } catch (error) {
      return {
        served: false,
        reason: `${url} could not be probed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
    if (response.status === 404) {
      return { served: false, reason: `${url} is not served (HTTP 404)` };
    }
    if (response.status !== 200) {
      return { served: false, reason: `${url} answered HTTP ${String(response.status)}` };
    }
    const length = response.headers.get('content-length');
    if (length !== null && length !== String(pin.manifest.byteLength)) {
      return {
        served: false,
        reason: `${url} is ${length} bytes, not the pinned ${String(pin.manifest.byteLength)}`,
      };
    }
  }
  for (const base of bases) {
    // oxlint-disable-next-line no-await-in-loop -- one host is proven at a time, and the first failure ends the decision
    const failures = await checkPinnedBlobs({
      pin,
      base,
      transport,
      ...(options.retry === undefined ? {} : { retry: options.retry }),
      ...(options.concurrency === undefined ? {} : { concurrency: options.concurrency }),
    });
    if (failures.length > 0) {
      return { served: false, reason: failures.join('; ') };
    }
  }
  return {
    served: true,
    reason: `manifest ${pin.manifest.sha256} and its ${String(pin.files.count)} files are already served with their digests at ${bases.join(' and ')}`,
  };
};

/** Where the command line writes. */
export type Io = { readonly out: (line: string) => void; readonly err: (line: string) => void };

const usage =
  'Usage: node scripts/src/picogk-browser-host-pin.ts status --pin <pin> --key <key> | compare <bundle> <bundle> | write --key <key> --bundle <dir> --out <pin> | plan --pin <pin> --key <key> --bundle <dir> --tag <tag> --out <tsv> | check --pin <pin> [--environment production|staging | --base <url>] | served --pin <pin>';

const flags = (args: readonly string[], names: readonly string[], optional: readonly string[] = []) => {
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index]!.replace(/^--/u, '');
    const value = args[index + 1];
    if (!args[index]!.startsWith('--') || ![...names, ...optional].includes(name) || value === undefined) {
      return undefined;
    }
    values.set(name, value);
  }
  return names.every((name) => values.has(name)) ? values : undefined;
};

// The `served` command: a `served=` step output, with its reason on stderr so the output file holds one line.
const reportServed = async (
  path: string,
  io: Io,
  network: { readonly transport: typeof fetch; readonly retry: RetryPolicy },
): Promise<number> => {
  const pin = await readPin(path);
  if (pin === undefined) {
    throw new Error(`${path} does not exist; write the pin before asking whether it is served.`);
  }
  const { served, reason } = await pinServed({ pin, ...network });
  io.err(served ? `Already served: ${reason}.` : `Not served: ${reason}.`);
  io.out(`served=${String(served)}`);
  return 0;
};

/**
 * Run one command.
 * @param argv - The arguments after the script path.
 * @param io - Where to write results and diagnostics.
 * @param network - The `fetch` the `check` command uses and how it retries a blob that is not served yet; by default
 *   the global `fetch` with three attempts.
 * @param network.transport - The `fetch` to use.
 * @param network.retry - The retry policy.
 * @returns The exit code.
 */
export const run = async (
  argv: readonly string[],
  io: Io,
  network?: { readonly transport: typeof fetch; readonly retry: RetryPolicy },
): Promise<number> => {
  const [command, ...args] = argv;
  const { transport, retry } = network ?? { transport: fetch, retry: defaultRetry };
  try {
    if (command === 'compare' && args.length === 2) {
      const differences = await compareBundles(args[0]!, args[1]!);
      if (differences.length > 0) {
        io.err(`The two builds of the PicoGK browser host differ; nothing is pinned:\n  ${differences.join('\n  ')}`);
        return 1;
      }
      io.out('The two builds of the PicoGK browser host are byte-identical.');
      return 0;
    }
    const options =
      command === 'status'
        ? flags(args, ['pin', 'key'])
        : command === 'write'
          ? flags(args, ['key', 'bundle', 'out'])
          : command === 'plan'
            ? flags(args, ['pin', 'key', 'bundle', 'tag', 'out'])
            : command === 'check'
              ? flags(args, ['pin'], ['environment', 'base'])
              : command === 'served'
                ? flags(args, ['pin'])
                : undefined;
    const environment = options?.get('environment');
    // `--environment` names one known host and cannot be combined with an explicit `--base`.
    const environmentBase =
      environment === undefined ? undefined : isBlobEnvironment(environment) ? blobBases[environment] : '';
    if (options === undefined || environmentBase === '' || (environmentBase !== undefined && options.has('base'))) {
      io.err(usage);
      return 2;
    }
    const value = (name: string): string => options.get(name)!;
    if (command === 'status') {
      const { pinned, tag } = pinStatus(await readPin(value('pin')), value('key'));
      io.out(`pinned=${String(pinned)}`);
      io.out(`tag=${tag}`);
      return 0;
    }
    if (command === 'write') {
      const pin = pinFor(value('key'), await verifyBundle(value('bundle')));
      await writeFile(value('out'), serializePin(pin));
      io.out(`Pinned manifest ${pin.manifest.sha256} (${String(pin.files.count)} files) for ${pin.inputsKey}.`);
      return 0;
    }
    if (command === 'served') {
      return await reportServed(value('pin'), io, { transport, retry });
    }
    if (command === 'plan') {
      const rows = publishPlan({
        pin: await readPin(value('pin')),
        tag: value('tag'),
        inputsKey: value('key'),
        bundle: await verifyBundle(value('bundle')),
      });
      await writeFile(value('out'), rows.map((row) => `${row.sha256}\t${row.path}\t${row.contentType}\n`).join(''));
      io.out(`Planned ${String(rows.length)} write-once blobs.`);
      return 0;
    }
    const pin = await readPin(value('pin'));
    if (pin === undefined) {
      io.out(`::notice title=No PicoGK browser host pin::${value('pin')} does not exist yet, so no blob is checked.`);
      return 0;
    }
    const base = options.get('base') ?? environmentBase;
    const bases = base === undefined ? Object.values(blobBases) : [base];
    const failures: string[] = [];
    for (const each of bases) {
      // oxlint-disable-next-line no-await-in-loop -- one host is proven at a time, so its failures stay together
      const missing = await checkPinnedBlobs({
        pin,
        base: each,
        transport,
        retry,
      });
      failures.push(...missing);
      if (missing.length === 0) {
        io.out(
          `Every blob of manifest ${pin.manifest.sha256} (${String(pin.files.count)} files) is served at ${each}.`,
        );
      }
    }
    if (failures.length > 0) {
      io.err(`Pinned PicoGK browser host blobs that are not served with their digest:\n  ${failures.join('\n  ')}`);
      return 1;
    }
    return 0;
  } catch (error) {
    io.err(error instanceof Error ? error.message : String(error));
    return 1;
  }
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await run(process.argv.slice(2), {
    out: (line) => {
      console.log(line);
    },
    err: (line) => {
      console.error(line);
    },
  });
}
