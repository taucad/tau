import { parsePackage } from 'cdn-resolve';

import { assertRootedPath, sha256Bytes, sha256String } from '@taucad/runtime/kernel';

/** Minimal rooted filesystem required by compiler-neutral bundler source work. @public */
export type BundlerFileSystem = {
  exists(path: string): Promise<boolean>;
  stat?(path: string): Promise<{ readonly type: 'file' | 'dir' }>;
  readFile(path: string): Promise<Uint8Array<ArrayBuffer>>;
  readFile(path: string, encoding: 'utf8'): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  ensureDir(path: string): Promise<void>;
};

/** Durable identity for one self-contained CDN package artifact. @public */
export type PackageArtifactIdentity = {
  readonly cachePath: string;
  readonly exactVersion: string;
  readonly bytesHash: string;
  readonly resolutionMetadata: {
    readonly requestedSpecifier: string;
    readonly provider: 'esm.sh' | 'jsdelivr';
    readonly resolvedUrl: string;
  };
};

type PackageArtifactManifest = PackageArtifactIdentity & { readonly schemaVersion: 1 };
type PendingAcquisition = {
  readonly controller: AbortController;
  readonly promise: Promise<PackageArtifactIdentity>;
  waiters: number;
};

const artifactRoot = 'node_modules/.tau-bundler';
const maximumResponseBytes = 10 * 1024 * 1024;
const fetchTimeoutMilliseconds = 15_000;
const retryDelayMilliseconds = 60_000;
const maximumFailures = 64;
const versionPattern = /@(\d+\.\d+\.\d+(?:-[\d.A-Za-z-]+(?:\.[\d.A-Za-z-]+)*)?)/u;

const throwIfAborted = (signal: AbortSignal): void => {
  signal.throwIfAborted();
};

const responseVersion = (response: Response, code: string, requestedVersion: string): string => {
  if (/^\d+\.\d+\.\d+(?:-[\d.A-Za-z-]+(?:\.[\d.A-Za-z-]+)*)?$/u.test(requestedVersion)) {
    return requestedVersion;
  }
  const evidence = `${response.url}\n${response.headers.get('x-esm-path') ?? ''}\n${code.slice(0, 1024)}`;
  const version = versionPattern.exec(evidence)?.[1];
  if (version === undefined) {
    throw new Error('CDN response did not identify an exact package version.');
  }
  return version;
};

const readText = async (filesystem: BundlerFileSystem, path: string): Promise<string> =>
  filesystem.readFile(path, 'utf8');

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const isManifest = (value: unknown): value is PackageArtifactManifest => {
  if (!isRecord(value) || value['schemaVersion'] !== 1 || !isRecord(value['resolutionMetadata'])) {
    return false;
  }
  const metadata = value['resolutionMetadata'];
  return (
    typeof value['cachePath'] === 'string' &&
    typeof value['exactVersion'] === 'string' &&
    typeof value['bytesHash'] === 'string' &&
    typeof metadata['requestedSpecifier'] === 'string' &&
    (metadata['provider'] === 'esm.sh' || metadata['provider'] === 'jsdelivr') &&
    typeof metadata['resolvedUrl'] === 'string'
  );
};

/** Content-addressed cache for self-contained CDN package artifacts. @public */
export class PackageArtifactCache {
  readonly #filesystem: BundlerFileSystem;
  readonly #pending = new Map<string, PendingAcquisition>();
  readonly #failures = new Map<string, { readonly at: number; readonly error: Error }>();

  public constructor(filesystem: BundlerFileSystem) {
    this.#filesystem = filesystem;
  }

  /**
   * Resolve a package through its committed manifest or acquire it once.
   * @param specifier - Bare package specifier.
   * @param signal - Operation-local cancellation signal.
   * @returns Exact committed artifact identity.
   */
  public async ensure(specifier: string, signal: AbortSignal): Promise<PackageArtifactIdentity> {
    throwIfAborted(signal);
    let pending = this.#pending.get(specifier);
    if (pending === undefined) {
      const failure = this.#failures.get(specifier);
      if (failure !== undefined && Date.now() - failure.at < retryDelayMilliseconds) {
        throw failure.error;
      }
      const controller = new AbortController();
      const promise = this.#startAcquisition(specifier, controller.signal);
      pending = { controller, promise, waiters: 0 };
      this.#pending.set(specifier, pending);
    }
    return this.#waitFor(pending, signal);
  }

  /** Drop bounded in-memory request state. Durable filesystem artifacts remain reusable. */
  public dispose(): void {
    for (const { controller } of this.#pending.values()) {
      controller.abort();
    }
    this.#pending.clear();
    this.#failures.clear();
  }

  async #startAcquisition(specifier: string, signal: AbortSignal): Promise<PackageArtifactIdentity> {
    try {
      const hit = await this.#readHit(specifier, signal);
      if (hit !== undefined) {
        return hit;
      }
      const identity = await this.#acquire(specifier, signal);
      this.#failures.delete(specifier);
      return identity;
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error(String(error));
      if (!signal.aborted) {
        this.#rememberFailure(specifier, normalized);
      }
      throw normalized;
    } finally {
      this.#pending.delete(specifier);
    }
  }

  async #waitFor(pending: PendingAcquisition, signal: AbortSignal): Promise<PackageArtifactIdentity> {
    pending.waiters += 1;
    try {
      return await new Promise<PackageArtifactIdentity>((resolve, reject) => {
        const onAbort = (): void => {
          reject(signal.reason instanceof Error ? signal.reason : new DOMException('Aborted', 'AbortError'));
        };
        if (signal.aborted) {
          onAbort();
          return;
        }
        signal.addEventListener('abort', onAbort, { once: true });
        pending.promise
          .then((identity) => {
            signal.removeEventListener('abort', onAbort);
            resolve(identity);
          })
          .catch((error: unknown) => {
            signal.removeEventListener('abort', onAbort);
            reject(error instanceof Error ? error : new Error(String(error)));
          });
      });
    } finally {
      pending.waiters -= 1;
      if (pending.waiters === 0) {
        pending.controller.abort();
      }
    }
  }

  async #readHit(specifier: string, signal: AbortSignal): Promise<PackageArtifactIdentity | undefined> {
    const manifestPath = await this.#manifestPath(specifier);
    if (!(await this.#filesystem.exists(manifestPath))) {
      return undefined;
    }
    try {
      throwIfAborted(signal);
      const manifest: unknown = JSON.parse(await readText(this.#filesystem, manifestPath));
      if (
        !isManifest(manifest) ||
        manifest.resolutionMetadata.requestedSpecifier !== specifier ||
        !(await this.#filesystem.exists(manifest.cachePath))
      ) {
        return undefined;
      }
      const bytes = await this.#filesystem.readFile(manifest.cachePath);
      if ((await sha256Bytes(bytes)) !== manifest.bytesHash) {
        return undefined;
      }
      const { schemaVersion: _, ...identity } = manifest;
      return identity;
    } catch {
      return undefined;
    }
  }

  async #acquire(specifier: string, signal: AbortSignal): Promise<PackageArtifactIdentity> {
    const parsed = parsePackage(specifier);
    const candidates: ReadonlyArray<{ readonly provider: 'esm.sh' | 'jsdelivr'; readonly url: string }> = [
      { provider: 'esm.sh', url: `https://esm.sh/${specifier}?bundle` },
      { provider: 'jsdelivr', url: `https://cdn.jsdelivr.net/npm/${specifier}/+esm` },
    ];
    let lastError: unknown;

    for (const candidate of candidates) {
      try {
        // oxlint-disable-next-line no-await-in-loop -- fallback providers are intentionally sequential
        return await this.#acquireCandidate({ specifier, requestedVersion: parsed.version, candidate, signal });
      } catch (error) {
        signal.throwIfAborted();
        lastError = error;
      }
    }
    throw new Error(`Failed to acquire package '${specifier}'.`, { cause: lastError });
  }

  async #acquireCandidate(input: {
    readonly specifier: string;
    readonly requestedVersion: string;
    readonly candidate: { readonly provider: 'esm.sh' | 'jsdelivr'; readonly url: string };
    readonly signal: AbortSignal;
  }): Promise<PackageArtifactIdentity> {
    const { specifier, requestedVersion, candidate, signal } = input;
    const operationSignal = AbortSignal.any([signal, AbortSignal.timeout(fetchTimeoutMilliseconds)]);
    const response = await fetch(candidate.url, { signal: operationSignal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }
    const declaredBytes = Number(response.headers.get('content-length') ?? 0);
    if (declaredBytes > maximumResponseBytes) {
      throw new Error(`Response exceeds ${maximumResponseBytes} bytes.`);
    }
    const code = await response.text();
    const bytes = new TextEncoder().encode(code);
    if (bytes.byteLength > maximumResponseBytes) {
      throw new Error(`Response exceeds ${maximumResponseBytes} bytes.`);
    }
    throwIfAborted(signal);

    const bytesHash = await sha256Bytes(bytes);
    const exactVersion = responseVersion(response, code, requestedVersion);
    const cachePath = assertRootedPath(`${artifactRoot}/artifacts/${bytesHash}.mjs`);
    const identity: PackageArtifactIdentity = {
      cachePath,
      exactVersion,
      bytesHash,
      resolutionMetadata: {
        requestedSpecifier: specifier,
        provider: candidate.provider,
        resolvedUrl: response.url.length === 0 ? candidate.url : response.url,
      },
    };
    await this.#filesystem.ensureDir(`${artifactRoot}/artifacts`);
    await this.#filesystem.ensureDir(`${artifactRoot}/requests`);
    throwIfAborted(signal);
    await this.#filesystem.writeFile(cachePath, code);
    throwIfAborted(signal);
    await this.#filesystem.writeFile(
      await this.#manifestPath(specifier),
      JSON.stringify({ schemaVersion: 1, ...identity } satisfies PackageArtifactManifest),
    );
    return identity;
  }

  async #manifestPath(specifier: string): Promise<string> {
    return assertRootedPath(`${artifactRoot}/requests/${await sha256String(specifier)}.json`);
  }

  #rememberFailure(specifier: string, error: Error): void {
    if (this.#failures.size >= maximumFailures) {
      const oldest = this.#failures.keys().next().value;
      if (oldest !== undefined) {
        this.#failures.delete(oldest);
      }
    }
    this.#failures.set(specifier, { at: Date.now(), error });
  }
}
