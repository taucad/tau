import { maxSatisfying, valid, validRange } from 'semver';

import { readPackageResponse } from '#package-response.js';

/** Registry metadata retained independently of CDN artifact integrity. @public */
export type PackageRegistryResolution = {
  readonly name: string;
  readonly version: string;
  readonly tarball: string;
  readonly integrity: string;
  readonly peers: Readonly<Record<string, string>>;
  readonly optionalPeers: readonly string[];
  readonly engines: Readonly<Record<string, string>>;
};

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const stringRecord = (value: unknown): value is Record<string, string> =>
  isRecord(value) && Object.values(value).every((item) => typeof item === 'string');

export const isPackageName = (name: string): boolean => /^(?:@[a-z\d][a-z\d._-]*\/)?[a-z\d][a-z\d._-]*$/u.test(name);

export const isIntegrity = (value: string): boolean => /^sha512-[A-Za-z\d+/]{86}==$/u.test(value);

export const isRegistryResolution = (value: unknown): value is PackageRegistryResolution =>
  isRecord(value) &&
  typeof value['name'] === 'string' &&
  isPackageName(value['name']) &&
  typeof value['version'] === 'string' &&
  valid(value['version']) === value['version'] &&
  typeof value['tarball'] === 'string' &&
  value['tarball'].startsWith('https://registry.npmjs.org/') &&
  typeof value['integrity'] === 'string' &&
  isIntegrity(value['integrity']) &&
  stringRecord(value['peers']) &&
  stringRecord(value['engines']) &&
  Array.isArray(value['optionalPeers']) &&
  value['optionalPeers'].every((name) => typeof name === 'string');

const maximumMetadataBytes = 20 * 1024 * 1024;

const waitForRetry = async (signal: AbortSignal, delayMilliseconds: number): Promise<void> =>
  new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(signal.reason instanceof Error ? signal.reason : new DOMException('Aborted', 'AbortError'));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, delayMilliseconds);
    signal.addEventListener('abort', onAbort, { once: true });
  });

const fetchMetadata = async (name: string, signal: AbortSignal): Promise<unknown> => {
  const url = `https://registry.npmjs.org/${encodeURIComponent(name)}`;
  // Retry only transport failures and transient status codes; never reuse stale metadata on an upgrade.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt > 0) {
      // oxlint-disable-next-line no-await-in-loop -- bounded retry backoff avoids hammering the registry
      await waitForRetry(signal, 100 * 2 ** (attempt - 1));
    }
    let response: Response;
    try {
      // oxlint-disable-next-line no-await-in-loop -- bounded sequential registry retries
      response = await fetch(url, {
        signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
        credentials: 'omit',
        redirect: 'error',
        cache: 'no-store',
        headers: { accept: 'application/vnd.npm.install-v1+json' },
      });
    } catch {
      signal.throwIfAborted();
      if (attempt < 2) {
        continue;
      }
      throw new Error(`Registry unavailable for '${name}' after 3 attempts. Retry when online.`);
    }
    if (!response.ok) {
      if ((response.status === 429 || response.status >= 500) && attempt < 2) {
        continue;
      }
      throw new Error(`Registry lookup failed for '${name}': HTTP ${response.status}.`);
    }
    let text: string;
    try {
      // oxlint-disable-next-line no-await-in-loop -- consume the successful retry response
      text = await readPackageResponse(response, maximumMetadataBytes);
    } catch {
      signal.throwIfAborted();
      if (attempt < 2) {
        continue;
      }
      throw new Error(`Registry response for '${name}' is incomplete or exceeds the size limit. Retry the operation.`);
    }
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new Error(`Registry returned invalid JSON for '${name}'. Retry the operation.`);
    }
  }
  throw new Error(`Registry unavailable for '${name}'.`);
};

export const resolveRegistryPackage = async (input: {
  readonly name: string;
  readonly requested: string;
  readonly signal: AbortSignal;
}): Promise<PackageRegistryResolution> => {
  const { name, requested, signal } = input;
  if (!isPackageName(name) || requested.length === 0) {
    throw new Error('A public npm package name and nonempty version request are required.');
  }
  const metadata = await fetchMetadata(name, signal);
  if (!isRecord(metadata) || !isRecord(metadata['versions']) || !stringRecord(metadata['dist-tags'])) {
    throw new Error(`Registry returned incomplete metadata for '${name}'.`);
  }
  const { versions } = metadata;
  const range = validRange(requested);
  const version = range === null ? metadata['dist-tags'][requested] : maxSatisfying(Object.keys(versions), range);
  if (!version || !Object.hasOwn(versions, version)) {
    throw new Error(`No published version of '${name}' satisfies '${requested}'. Check the range or dist-tag.`);
  }
  const entry = versions[version];
  if (!isRecord(entry) || entry['name'] !== name || entry['version'] !== version || !isRecord(entry['dist'])) {
    throw new Error(`Registry returned incomplete metadata for '${name}@${version}'.`);
  }
  const peerMeta = entry['peerDependenciesMeta'];
  const result = {
    name,
    version,
    tarball: entry['dist']['tarball'],
    integrity: entry['dist']['integrity'],
    peers: entry['peerDependencies'] ?? {},
    engines: entry['engines'] ?? {},
    optionalPeers: isRecord(peerMeta)
      ? Object.entries(peerMeta)
          .filter(([, meta]) => isRecord(meta) && meta['optional'] === true)
          .map(([peer]) => peer)
      : [],
  };
  if (!isRegistryResolution(result)) {
    throw new Error(`Registry metadata for '${name}@${version}' lacks valid integrity or compatibility fields.`);
  }
  return result;
};
