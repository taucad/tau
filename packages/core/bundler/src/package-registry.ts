import { readPackageResponse } from '#package-response.js';

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const stringRecord = (value: unknown): value is Record<string, string> =>
  isRecord(value) && Object.values(value).every((item) => typeof item === 'string');

export const isPackageName = (name: string): boolean => /^(?:@[a-z\d][a-z\d._-]*\/)?[a-z\d][a-z\d._-]*$/u.test(name);

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
    if (response.status === 404) {
      return undefined;
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

/** One version document from an abbreviated (`application/vnd.npm.install-v1+json`) or full packument. @public */
export type PackumentVersion = {
  readonly name: string;
  readonly version: string;
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly optionalDependencies?: Readonly<Record<string, string>>;
  readonly peerDependencies?: Readonly<Record<string, string>>;
  readonly peerDependenciesMeta?: Readonly<Record<string, Readonly<{ optional?: boolean }>>>;
  readonly engines?: Readonly<Record<string, string>>;
  readonly bin?: Readonly<Record<string, string>> | string;
  /** Present in full packuments only; abbreviated documents omit it. */
  readonly license?: string;
  readonly os?: readonly string[];
  readonly cpu?: readonly string[];
  /** Registry-computed in abbreviated documents. */
  readonly hasInstallScript?: boolean;
  /** Full packuments carry scripts instead of `hasInstallScript`. */
  readonly scripts?: Readonly<Record<string, string>>;
  readonly deprecated?: string;
  readonly dist: { readonly tarball: string; readonly integrity?: string; readonly shasum?: string };
};

/** Registry metadata for one package name. @public */
export type Packument = {
  readonly name: string;
  readonly 'dist-tags': Readonly<Record<string, string>>;
  readonly versions: Readonly<Record<string, PackumentVersion>>;
};

/**
 * Packument source for the resolver. Resolves `undefined` when the package does not exist;
 * rejects when the registry cannot be reached.
 * @public
 */
export type PackageRegistry = (name: string, signal: AbortSignal) => Promise<Packument | undefined>;

/**
 * Fetch an abbreviated packument from the public npm registry with bounded retries.
 * Version documents are validated by the resolver when it selects them.
 * @param name - Package name.
 * @param signal - Cancellation.
 * @returns The packument, or undefined when the registry answers 404.
 * @internal
 */
export const fetchPackument: PackageRegistry = async (name, signal) => {
  if (!isPackageName(name)) {
    throw new Error(`'${name}' is not a public npm package name.`);
  }
  const metadata = await fetchMetadata(name, signal);
  if (metadata === undefined) {
    return undefined;
  }
  if (!isRecord(metadata) || !isRecord(metadata['versions']) || !stringRecord(metadata['dist-tags'])) {
    throw new Error(`Registry returned incomplete metadata for '${name}'. Retry the operation.`);
  }
  return { name, 'dist-tags': metadata['dist-tags'], versions: metadata['versions'] as Packument['versions'] };
};
