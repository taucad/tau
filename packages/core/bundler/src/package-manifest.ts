import { init, parse } from 'es-module-lexer';

import { readPackageResponse } from '#package-response.js';
import { satisfies, valid, validRange } from 'semver';

import { sha256Bytes } from '@taucad/runtime/kernel';

import { PackageArtifactCache } from '#package-artifact-cache.js';
import type { BundlerFileSystem, PackageArtifactIdentity } from '#package-artifact-cache.js';
import {
  isPackageName,
  isRecord,
  isRegistryResolution,
  resolveRegistryPackage,
  stringRecord,
} from '#package-registry.js';
import type { PackageRegistryResolution } from '#package-registry.js';

/** One root dependency and the complete sealed code consumed for it. @public */
export type LockedPackage = {
  readonly requested: string;
  readonly registry: PackageRegistryResolution;
  readonly artifact: PackageArtifactIdentity;
};

/** Versioned lock embedded in package.json so selection and manifest commit together. @public */
export type PackageManifestLock = {
  readonly schemaVersion: 1;
  readonly packages: Readonly<Record<string, LockedPackage>>;
};

/** Atomic host commit. A false result means the expected package.json changed. @public */
export type PackageManifestCommit = (input: {
  readonly expected: string | undefined;
  readonly content: string;
}) => Promise<boolean>;

/** Explicit project dependency update, independent of bundling or code execution. @public */
export type UpdatePackageManifestInput = {
  readonly filesystem: BundlerFileSystem;
  /** Complete desired root dependency set. Subpath imports are not admitted by this slice. */
  readonly requests: Readonly<Record<string, string>>;
  readonly mode: 'install' | 'upgrade';
  /** Exact host Node version used for engine admission, including when preparing browser bundles. */
  readonly nodeVersion: string;
  readonly signal: AbortSignal;
  /** Atomically compare and replace package.json through the owning filesystem authority. */
  readonly commit: PackageManifestCommit;
};

const artifactRoot = 'node_modules/.tau-bundler/artifacts/';

const isArtifact = (value: unknown): value is PackageArtifactIdentity => {
  if (!isRecord(value) || !isRecord(value['resolutionMetadata'])) {
    return false;
  }
  const metadata = value['resolutionMetadata'];
  return (
    typeof value['bytesHash'] === 'string' &&
    /^[a-f\d]{64}$/u.test(value['bytesHash']) &&
    value['cachePath'] === `${artifactRoot}${value['bytesHash']}.mjs` &&
    typeof value['exactVersion'] === 'string' &&
    typeof metadata['requestedSpecifier'] === 'string' &&
    (metadata['provider'] === 'esm.sh' || metadata['provider'] === 'jsdelivr') &&
    typeof metadata['resolvedUrl'] === 'string' &&
    (metadata['resolvedUrl'].startsWith('https://esm.sh/') ||
      metadata['resolvedUrl'].startsWith('https://cdn.jsdelivr.net/'))
  );
};

export const parsePackageManifest = (text: string): Record<string, unknown> => {
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    throw new Error('package.json contains invalid JSON.');
  }
  if (!isRecord(value)) {
    throw new Error('package.json must contain an object.');
  }
  return value;
};

export const readManifestLock = (manifest: Record<string, unknown>): PackageManifestLock | undefined => {
  const lock = manifest['taucadPackageLock'];
  if (lock === undefined) {
    return undefined;
  }
  if (
    !isRecord(lock) ||
    lock['schemaVersion'] !== 1 ||
    !isRecord(lock['packages']) ||
    !stringRecord(manifest['dependencies'])
  ) {
    throw new Error('Invalid package.json dependency lock. Restore a known-good manifest.');
  }
  const packages: Record<string, LockedPackage> = {};
  for (const [name, entry] of Object.entries(lock['packages'])) {
    if (
      !isPackageName(name) ||
      !isRecord(entry) ||
      typeof entry['requested'] !== 'string' ||
      !isRegistryResolution(entry['registry']) ||
      !isArtifact(entry['artifact']) ||
      entry['registry'].name !== name ||
      entry['artifact'].exactVersion !== entry['registry'].version ||
      entry['artifact'].resolutionMetadata.requestedSpecifier !== `${name}@${entry['registry'].version}` ||
      manifest['dependencies'][name] !== entry['registry'].version
    ) {
      throw new Error(`Invalid dependency lock for '${name}'. Restore a known-good manifest.`);
    }
    packages[name] = { requested: entry['requested'], registry: entry['registry'], artifact: entry['artifact'] };
  }
  if (Object.keys(packages).length !== Object.keys(manifest['dependencies']).length) {
    throw new Error('package.json dependencies differ from its lock. Use an explicit dependency update.');
  }
  return { schemaVersion: 1, packages };
};

export const readLockedArtifact = async (
  filesystem: BundlerFileSystem,
  artifact: PackageArtifactIdentity,
  signal: AbortSignal,
): Promise<string> => {
  signal.throwIfAborted();
  if (!isArtifact(artifact)) {
    throw new Error('Locked package artifact is missing. Restore the locked artifact; do not resolve a new version.');
  }
  let bytes: Uint8Array<ArrayBuffer>;
  if (await filesystem.exists(artifact.cachePath)) {
    bytes = await filesystem.readFile(artifact.cachePath);
  } else {
    // A cold reinstall may retrieve only the locked URL and must reproduce the locked digest.
    let response: Response;
    try {
      response = await fetch(artifact.resolutionMetadata.resolvedUrl, {
        credentials: 'omit',
        redirect: 'error',
        signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
      });
    } catch {
      signal.throwIfAborted();
      throw new Error('Locked package artifact could not be restored. Retry when online or restore the locked bytes.');
    }
    if (!response.ok) {
      throw new Error(`Locked package artifact is unavailable: HTTP ${response.status}. Restore the locked artifact.`);
    }
    bytes = new TextEncoder().encode(await readPackageResponse(response, 10 * 1024 * 1024));
  }
  if ((await sha256Bytes(bytes)) !== artifact.bytesHash) {
    throw new Error('Locked package artifact failed SHA-256 integrity verification. Restore the locked artifact.');
  }
  signal.throwIfAborted();
  const code = new TextDecoder().decode(bytes);
  if (!(await filesystem.exists(artifact.cachePath))) {
    await filesystem.ensureDir(artifactRoot.slice(0, -1));
    await filesystem.writeFile(artifact.cachePath, code);
  }
  return code;
};

const assertSealed = async (code: string, name: string): Promise<void> => {
  await init;
  const [imports] = parse(code);
  if (imports.some((entry) => entry.d !== -2)) {
    throw new Error(
      `Package '${name}' is not a self-contained ESM bundle. Its runtime imports require a transitive lock.`,
    );
  }
};

const checkCompatibility = (packages: Readonly<Record<string, LockedPackage>>, nodeVersion: string): void => {
  for (const [name, { registry }] of Object.entries(packages)) {
    const engine = registry.engines['node'];
    if (engine !== undefined && !satisfies(nodeVersion, engine)) {
      throw new Error(`Package '${name}@${registry.version}' requires Node '${engine}'; host is '${nodeVersion}'.`);
    }
    for (const [peer, range] of Object.entries(registry.peers)) {
      const selected = Object.hasOwn(packages, peer) ? packages[peer] : undefined;
      if (selected === undefined && registry.optionalPeers.includes(peer)) {
        continue;
      }
      if (selected === undefined || !satisfies(selected.registry.version, range)) {
        throw new Error(`Package '${name}' requires peer '${peer}@${range}'. Select a compatible root dependency.`);
      }
    }
  }
};

/**
 * Resolve exact public npm versions, acquire sealed CDN artifacts, and atomically commit package.json.
 * Install reuses locked versions offline; upgrade resolves the original requested ranges afresh.
 * Registry SRI identifies the original tarball; artifact SHA-256 identifies the consumed CDN bytes.
 * @param input - Requests, admission environment, rooted cache, cancellation and atomic host commit.
 * @returns Committed lock; no package scripts or downloaded code are executed.
 * @public
 */
export const updatePackageManifest = async (input: UpdatePackageManifestInput): Promise<PackageManifestLock> => {
  const { filesystem, requests, mode, nodeVersion, signal, commit } = input;
  signal.throwIfAborted();
  if (valid(nodeVersion) !== nodeVersion) {
    throw new Error('An exact host Node version is required.');
  }
  const expected = (await filesystem.exists('package.json'))
    ? await filesystem.readFile('package.json', 'utf8')
    : undefined;
  const manifest = expected === undefined ? {} : parsePackageManifest(expected);
  const previous = readManifestLock(manifest);
  const packages: Record<string, LockedPackage> = {};
  // One invocation owns the cache's cancellation and request coalescing lifetime.
  const cache = new PackageArtifactCache(filesystem);
  try {
    for (const [name, requested] of Object.entries(requests).sort(([left], [right]) => left.localeCompare(right))) {
      if (!isPackageName(name) || typeof requested !== 'string' || requested.length === 0) {
        throw new Error('A public npm package name and nonempty version request are required.');
      }
      const locked =
        previous !== undefined && Object.hasOwn(previous.packages, name) ? previous.packages[name] : undefined;
      if (mode === 'install' && locked !== undefined) {
        if (requested !== locked.requested) {
          throw new Error(
            `Request for '${name}' changed from '${locked.requested}' to '${requested}'. Use upgrade explicitly.`,
          );
        }
        // oxlint-disable-next-line no-await-in-loop -- validate each committed root before admitting it
        const code = await readLockedArtifact(filesystem, locked.artifact, signal);
        // oxlint-disable-next-line no-await-in-loop -- persisted locks must retain closure admission
        await assertSealed(code, name);
        packages[name] = locked;
        continue;
      }
      // oxlint-disable-next-line no-await-in-loop -- bounded registry pressure and deterministic admission order
      const registry = await resolveRegistryPackage({ name, requested, signal });
      if (validRange(requested) !== null && !satisfies(registry.version, requested)) {
        throw new Error(`Registry selection for '${name}' does not satisfy '${requested}'.`);
      }
      // oxlint-disable-next-line no-await-in-loop -- acquire only the registry-selected exact version
      const artifact = await cache.ensure(`${name}@${registry.version}`, signal);
      if (
        artifact.exactVersion !== registry.version ||
        artifact.resolutionMetadata.requestedSpecifier !== `${name}@${registry.version}`
      ) {
        throw new Error(`Cached resolution for '${name}' conflicts with the selected registry version.`);
      }
      // oxlint-disable-next-line no-await-in-loop -- verify bytes before publishing the lock
      const code = await readLockedArtifact(filesystem, artifact, signal);
      // oxlint-disable-next-line no-await-in-loop -- admission never publishes partially locked runtime imports
      await assertSealed(code, name);
      packages[name] = { requested, registry, artifact };
    }
    checkCompatibility(packages, nodeVersion);
    const lock: PackageManifestLock = { schemaVersion: 1, packages };
    const dependencies = Object.fromEntries(
      Object.entries(packages).map(([name, entry]) => [name, entry.registry.version]),
    );
    const content = `${JSON.stringify({ ...manifest, dependencies, taucadPackageLock: lock }, null, 2)}\n`;
    signal.throwIfAborted();
    if (!(await commit({ expected, content }))) {
      throw new Error(
        'package.json changed during resolution. Reload the manifest and retry; no update was committed.',
      );
    }
    return lock;
  } finally {
    cache.dispose();
  }
};
