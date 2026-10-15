// Where a payload's bytes come from: the store, the seed, the mirror, then the manifest's own origins, in that order.
// The digest is the only key; every source's bytes are verified before anything is written.
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { constants } from 'node:fs';
import { access, mkdir, readFile } from 'node:fs/promises';
import { isIP } from 'node:net';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ArchiveError, fetchVerified, integrityMatches, integrityToHex } from '@taucad/archive-core';

import { PreparationError } from '#preparation/preparation-error.js';
import { blobKey, publishBlob, writeAtomically } from '#preparation/preparation-store.js';
import type { StoreLayout } from '#preparation/preparation-store.js';
import type { DependencyPayload, Integrity, PayloadAcquisition } from '#preparation/preparation.types.js';

const maximumRedirects = 5;
const blobPathPattern = /^blobs\/sha256\/(?<hex>[\da-f]{64})$/u;

/**
 * The bytes of one payload and where they came from.
 * @internal
 */
export type AcquiredPayload = {
  readonly bytes: Uint8Array<ArrayBuffer>;
  /** Lowercase hex sha256 of the bytes: the blob's store key. */
  readonly key: string;
  readonly acquiredFrom: PayloadAcquisition;
};

/**
 * What one attempt's acquisitions share.
 * @internal
 */
export type AcquisitionContext = {
  readonly layout: StoreLayout;
  readonly fetch: typeof fetch;
  readonly mirror?: { readonly baseUrl: string; readonly noFallback?: boolean };
  readonly seed?: string;
  /** Store, seed and `file://` mirror only. */
  readonly offline: boolean;
  /** Package root for `packagePath` and `packageAsset` origins. */
  readonly directory?: string;
  /** `tmp/<attemptId>`: blobs are staged here before their rename. */
  readonly staging: string;
  readonly signal: AbortSignal;
  readonly onPhase: (phase: 'downloading' | 'verifying') => void;
  /** Bytes of the current response body received so far. */
  readonly onBytes: (received: number) => void;
  /** `tau-seed.json` lookups, cached per attempt. */
  readonly indexes: Map<string, Promise<ReadonlyMap<string, string>>>;
};

/** No source the host may use holds the payload. */
export class OfflineMiss extends Error {
  public override readonly name = 'OfflineMiss';
}

type Candidate =
  | { readonly kind: 'store'; readonly key: string }
  | { readonly kind: 'seed'; readonly path: string; readonly key: string }
  | { readonly kind: 'mirror'; readonly url: string; readonly key: string; readonly network: boolean }
  | { readonly kind: 'origin'; readonly url: string }
  | { readonly kind: 'package'; readonly path: string };

type Failure = { readonly location: string; readonly error: unknown };

const sourcePath = (layout: StoreLayout, key: string): string => join(layout.root, 'blobs', 'source', `${key}.json`);

const sha256Hex = (bytes: Uint8Array<ArrayBuffer>): string => createHash('sha256').update(bytes).digest('hex');

const megabytes = (byteLength: number): string => `${(byteLength / 1e6).toFixed(1)} MB`;

const mirrorBase = (baseUrl: string): string => (baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);

// `tau-seed.json` maps a sha384 or sha512 pin to its sha256 blob; a sha256 pin needs no index.
const readIndex = async (text: string | undefined): Promise<ReadonlyMap<string, string>> => {
  const index = new Map<string, string>();
  if (text === undefined) {
    return index;
  }
  try {
    const parsed = JSON.parse(text) as {
      readonly closures?: ReadonlyArray<{
        readonly payloads?: ReadonlyArray<{ readonly integrity?: unknown; readonly blob?: unknown }>;
      }>;
    };
    for (const closure of parsed.closures ?? []) {
      for (const { integrity, blob } of closure.payloads ?? []) {
        const hex = typeof blob === 'string' ? blobPathPattern.exec(blob)?.groups?.['hex'] : undefined;
        if (typeof integrity === 'string' && hex !== undefined) {
          index.set(integrity, hex);
        }
      }
    }
  } catch {
    // An unreadable index serves no non-sha256 pin; sha256 pins still resolve by name.
  }
  return index;
};

// The sha256 key of a pin: its own hex for a sha256 pin, else the `tau-seed.json` entry at `location`.
const indexedKey = async (
  context: AcquisitionContext,
  source: { readonly location: string; readonly load: () => Promise<string | undefined> },
  integrity: Integrity,
): Promise<string | undefined> => {
  const { algorithm, hex } = integrityToHex(integrity);
  if (algorithm === 'sha256') {
    return hex;
  }
  let pending = context.indexes.get(source.location);
  if (pending === undefined) {
    const loadIndex = async (): Promise<ReadonlyMap<string, string>> => readIndex(await source.load());
    pending = loadIndex();
    context.indexes.set(source.location, pending);
  }
  const index = await pending;
  return index.get(integrity);
};

const readOptional = async (path: string): Promise<string | undefined> => {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return undefined;
  }
};

const fetchText = async (context: AcquisitionContext, url: string): Promise<string | undefined> => {
  try {
    const response = await context.fetch(url, { signal: context.signal, credentials: 'omit' });
    return response.ok ? await response.text() : undefined;
  } catch {
    context.signal.throwIfAborted();
    return undefined;
  }
};

// A manifest origin may redirect only over HTTPS to a named host, never to an address literal or localhost.
const originRedirect = {
  maximum: maximumRedirects,
  allow: (url: URL): boolean => {
    const host = url.hostname.replaceAll(/^\[|\]$/gu, '');
    return isIP(host) === 0 && host !== 'localhost' && !host.endsWith('.localhost');
  },
};

const insidePackage = (directory: string, path: string): string => {
  const target = resolve(directory, path);
  const fromRoot = relative(directory, target);
  if (fromRoot.startsWith('..') || isAbsolute(fromRoot)) {
    throw new PreparationError('MANIFEST_INVALID', `Package path '${path}' escapes the package at ${directory}.`);
  }
  return target;
};

const candidatesOf = async (payload: DependencyPayload, context: AcquisitionContext): Promise<Candidate[]> => {
  const candidates: Candidate[] = [];
  const stored = await blobKey(context.layout, payload.integrity);
  if (stored !== undefined) {
    candidates.push({ kind: 'store', key: stored });
  }
  if (context.seed !== undefined) {
    const { seed } = context;
    const key = await indexedKey(
      context,
      { location: `seed:${seed}`, load: async () => readOptional(join(seed, 'tau-seed.json')) },
      payload.integrity,
    );
    if (key !== undefined) {
      candidates.push({ kind: 'seed', path: join(seed, 'blobs', 'sha256', key), key });
    }
  }
  if (context.mirror !== undefined) {
    const base = mirrorBase(context.mirror.baseUrl);
    const network = !base.startsWith('file:');
    if (!network || !context.offline) {
      const key = await indexedKey(
        context,
        {
          location: `mirror:${base}`,
          load: async () =>
            network ? fetchText(context, `${base}tau-seed.json`) : readOptional(fileURLToPath(`${base}tau-seed.json`)),
        },
        payload.integrity,
      );
      if (key !== undefined) {
        candidates.push({ kind: 'mirror', url: `${base}blobs/sha256/${key}`, key, network });
      }
    }
  }
  const { origin } = payload;
  if (origin.kind === 'packagePath' || origin.kind === 'packageAsset') {
    if (context.directory === undefined) {
      throw new PreparationError(
        'MANIFEST_INVALID',
        `Payload ${payload.name} is read from its npm package, but the host was given no directory for that package.`,
      );
    }
    const path =
      origin.kind === 'packagePath'
        ? insidePackage(context.directory, origin.path)
        : createRequire(join(context.directory, 'package.json')).resolve(origin.specifier);
    candidates.push({ kind: 'package', path });
  } else if (!context.offline && context.mirror?.noFallback !== true) {
    candidates.push(...origin.urls.map((url): Candidate => ({ kind: 'origin', url })));
  }
  return candidates;
};

const readable = async (path: string): Promise<boolean> => {
  try {
    await access(path, constants.R_OK);
    return true;
  } catch {
    return false;
  }
};

/**
 * Whether a payload can be acquired without a network request: from the store, the seed, a `file://` mirror or its
 * own npm package. Existence only; the bytes are still verified when they are read.
 * @internal
 * @param payload - A manifest payload.
 * @param context - The attempt's sources (`offline` is assumed).
 * @returns `true` when some local source names it.
 */
export const locallyAvailable = async (payload: DependencyPayload, context: AcquisitionContext): Promise<boolean> => {
  const candidates = await candidatesOf(payload, { ...context, offline: true });
  for (const candidate of candidates) {
    const path =
      candidate.kind === 'store'
        ? join(context.layout.blobs, candidate.key)
        : candidate.kind === 'mirror'
          ? fileURLToPath(candidate.url)
          : candidate.kind === 'origin'
            ? undefined
            : candidate.path;
    // oxlint-disable-next-line no-await-in-loop -- the first local hit answers
    if (path !== undefined && (await readable(path))) {
      return true;
    }
  }
  return false;
};

const countingFetch =
  (transport: typeof fetch, onBytes: (received: number) => void): typeof fetch =>
  async (input, init) => {
    const response = await transport(input, init);
    if (!response.ok || response.body === null) {
      return response;
    }
    let received = 0;
    onBytes(0);
    const counted = response.body.pipeThrough(
      new TransformStream<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>({
        transform(chunk, controller) {
          received += chunk.byteLength;
          onBytes(received);
          controller.enqueue(chunk);
        },
      }),
    );
    return new Response(counted, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  };

const readVerified = async (
  file: { readonly path: string; readonly expectedKey?: string },
  payload: DependencyPayload,
  context: AcquisitionContext,
): Promise<{ readonly bytes: Uint8Array<ArrayBuffer>; readonly key: string }> => {
  const { path, expectedKey } = file;
  const bytes = new Uint8Array(await readFile(path, { signal: context.signal }));
  context.onPhase('verifying');
  const key = sha256Hex(bytes);
  if (
    bytes.byteLength !== payload.byteLength ||
    (expectedKey !== undefined && key !== expectedKey) ||
    !(await integrityMatches(bytes, payload.integrity))
  ) {
    throw new ArchiveError('INTEGRITY_MISMATCH', `${path} does not match the pin of ${payload.name}.`, {
      reason: 'digest',
      path,
    });
  }
  return { bytes, key };
};

const download = async (
  request: {
    readonly url: string;
    readonly redirect: { readonly maximum: number; readonly allow: (url: URL) => boolean };
  },
  payload: DependencyPayload,
  context: AcquisitionContext,
): Promise<{ readonly bytes: Uint8Array<ArrayBuffer>; readonly key: string }> => {
  context.onPhase('downloading');
  const { url, redirect } = request;
  const bytes = await fetchVerified({
    url,
    integrity: payload.integrity,
    byteLength: payload.byteLength,
    redirect,
    fetch: countingFetch(context.fetch, context.onBytes),
    signal: context.signal,
  });
  context.onPhase('verifying');
  return { bytes, key: sha256Hex(bytes) };
};

const fromCandidate = async (
  candidate: Candidate,
  payload: DependencyPayload,
  context: AcquisitionContext,
): Promise<{
  readonly bytes: Uint8Array<ArrayBuffer>;
  readonly key: string;
  readonly acquiredFrom?: PayloadAcquisition;
}> => {
  switch (candidate.kind) {
    case 'store': {
      const verified = await readVerified(
        { path: join(context.layout.blobs, candidate.key), expectedKey: candidate.key },
        payload,
        context,
      );
      const recorded = await readOptional(sourcePath(context.layout, candidate.key));
      return {
        ...verified,
        ...(recorded === undefined ? {} : { acquiredFrom: JSON.parse(recorded) as PayloadAcquisition }),
      };
    }
    case 'seed': {
      return {
        ...(await readVerified({ path: candidate.path, expectedKey: candidate.key }, payload, context)),
        acquiredFrom: { kind: 'seed', location: candidate.path },
      };
    }
    case 'mirror': {
      if (!candidate.network) {
        const path = fileURLToPath(candidate.url);
        return {
          ...(await readVerified({ path, expectedKey: candidate.key }, payload, context)),
          acquiredFrom: { kind: 'mirror', location: candidate.url },
        };
      }
      const { origin } = new URL(candidate.url);
      const fetched = await download(
        { url: candidate.url, redirect: { maximum: maximumRedirects, allow: (url) => url.origin === origin } },
        payload,
        context,
      );
      if (fetched.key !== candidate.key) {
        throw new ArchiveError('INTEGRITY_MISMATCH', `${candidate.url} does not hold the blob its name promises.`, {
          reason: 'digest',
          path: candidate.url,
        });
      }
      return { ...fetched, acquiredFrom: { kind: 'mirror', location: candidate.url } };
    }
    case 'origin': {
      return {
        ...(await download({ url: candidate.url, redirect: originRedirect }, payload, context)),
        acquiredFrom: { kind: 'origin', location: candidate.url },
      };
    }
    case 'package': {
      return {
        ...(await readVerified({ path: candidate.path }, payload, context)),
        acquiredFrom: { kind: 'origin', location: candidate.path },
      };
    }
  }
};

const locationOf = (candidate: Candidate): string =>
  candidate.kind === 'store'
    ? `store blob ${candidate.key}`
    : candidate.kind === 'seed' || candidate.kind === 'package'
      ? candidate.path
      : candidate.url;

const failure = (payload: DependencyPayload, failures: readonly Failure[]): PreparationError => {
  const mismatch = failures.find(({ error }) => error instanceof ArchiveError && error.code === 'INTEGRITY_MISMATCH');
  if (mismatch !== undefined) {
    return new PreparationError(
      'INTEGRITY_MISMATCH',
      `${payload.name} from ${mismatch.location} does not match its pinned integrity. Nothing was written; the mirror, the seed or the pin is wrong.`,
      { cause: mismatch.error },
    );
  }
  const attempts = failures
    .map(
      ({ location, error }) =>
        `${location} (${error instanceof ArchiveError ? (error.detail ?? error.message) : String(error)})`,
    )
    .join(', ');
  return new PreparationError(
    'DOWNLOAD_FAILED',
    `Could not download ${payload.name} (${megabytes(payload.byteLength)}) from ${attempts}. Verified payloads are kept, so preparing again fetches only what is missing.`,
    { cause: failures.at(-1)?.error },
  );
};

/**
 * Acquire one payload's verified bytes and publish them as a blob: the store first, then the seed, the mirror and
 * the manifest's origins. A source whose bytes do not match is skipped, never trusted.
 * @internal
 * @param payload - A manifest payload.
 * @param context - The attempt's sources.
 * @returns The verified bytes, their sha256 key and their source.
 * @throws {OfflineMiss} When no permitted source holds the payload and no network source was tried.
 * @throws {PreparationError} `DOWNLOAD_FAILED` naming every URL tried and the size; `INTEGRITY_MISMATCH` when a
 * source served other bytes and none served the pinned ones.
 */
export const acquirePayload = async (
  payload: DependencyPayload,
  context: AcquisitionContext,
): Promise<AcquiredPayload> => {
  const failures: Failure[] = [];
  for (const candidate of await candidatesOf(payload, context)) {
    context.signal.throwIfAborted();
    try {
      // oxlint-disable-next-line no-await-in-loop -- sources are tried in order; the first verified one wins
      const acquired = await fromCandidate(candidate, payload, context);
      const acquiredFrom = acquired.acquiredFrom ?? { kind: 'origin', location: locationOf(candidate) };
      if (candidate.kind !== 'store') {
        // oxlint-disable-next-line no-await-in-loop -- publish before extraction so a later attempt reuses it
        await publishBlob(context.layout, {
          bytes: acquired.bytes,
          key: acquired.key,
          integrity: payload.integrity,
          staging: context.staging,
        });
        // oxlint-disable-next-line no-await-in-loop -- ditto
        await mkdir(join(context.layout.root, 'blobs', 'source'), { recursive: true });
        // oxlint-disable-next-line no-await-in-loop -- ditto
        await writeAtomically(sourcePath(context.layout, acquired.key), JSON.stringify(acquiredFrom));
      }
      return { bytes: acquired.bytes, key: acquired.key, acquiredFrom };
    } catch (error) {
      context.signal.throwIfAborted();
      if (error instanceof PreparationError) {
        throw error;
      }
      failures.push({ location: locationOf(candidate), error });
    }
  }
  const mismatched = failures.some(({ error }) => error instanceof ArchiveError && error.code === 'INTEGRITY_MISMATCH');
  if (context.offline && !mismatched) {
    throw new OfflineMiss(`${payload.name} is in no source this host may use without the network.`);
  }
  if (failures.length === 0) {
    // Only a no-fallback mirror that does not index a sha384 or sha512 pin leaves nothing to try.
    failures.push({
      location: `${mirrorBase(context.mirror?.baseUrl ?? '')}tau-seed.json`,
      error: new ArchiveError('DOWNLOAD_FAILED', 'the mirror does not index this pin', {
        reason: 'http-status',
        detail: 'not indexed',
      }),
    });
  }
  throw failure(payload, failures);
};
