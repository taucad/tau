// The fixture closure builder: a `tau-plugin.json` v1 manifest pinned to in-test dependency file bytes by their real digests,
// with the canonical registry routes and the seed layout (`blobs/sha256/<hex>` plus `tau-seed.json`) that the
// preparation host, `tau prepare`, `tau mcp`, the daemon and the desktop all read. A test prepares it through the
// shipping host; nothing about the closure is mocked except where its bytes come from.
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { computeClosureIntegrity, parsePluginDeployment } from '@taucad/runtime/preparation/node';
import type {
  DependencyFile,
  DependencyTarget,
  Integrity,
  DependencyFileFormat,
  PluginDeployment,
  PreparationPlugin,
} from '@taucad/runtime/preparation/node';

/**
 * The native targets Tau's kernels declare: a fixture closure pins one variant per target by default, so it prepares
 * on every host CI runs.
 * @public
 */
export const fixtureTargets: readonly DependencyTarget[] = [
  { runtime: 'native', os: 'darwin', arch: 'arm64' },
  { runtime: 'native', os: 'darwin', arch: 'x64' },
  { runtime: 'native', os: 'linux', arch: 'x64', libc: 'glibc' },
  { runtime: 'native', os: 'linux', arch: 'arm64', libc: 'glibc' },
];

/**
 * One dependency file of a fixture closure.
 * @public
 */
export type FixtureDependencyFileInput = {
  /** Dependency file name, unique in the closure. */
  readonly name: string;
  readonly bytes: Uint8Array<ArrayBuffer>;
  readonly format: DependencyFileFormat;
  /** Closure-relative directory the dependency file installs into. */
  readonly destination: string;
  readonly stripComponents?: number;
  /** Digest the pin uses, as registries publish it (PyPI and python-build-standalone sha256, Microsoft sha512). */
  readonly algorithm?: 'sha256' | 'sha384' | 'sha512';
  /** Origin URLs in fallback order; one under `https://registry.example/files/` when absent. */
  readonly urls?: readonly [string, ...string[]];
};

/**
 * What {@link createFixtureClosure} builds a closure from.
 * @public
 */
export type FixtureClosureInput = {
  /** The declaring npm package; `@taucad/fixture` when absent. */
  readonly package?: string;
  /** The dependency every variant belongs to; `engine` when absent. */
  readonly dependency?: string;
  /** The kernel row that requires the dependency; `fixture` for `.py` when absent. */
  readonly kernel?: { readonly name: string; readonly extensions: readonly [string, ...string[]] };
  /** Targets that pin the dependency files; {@link fixtureTargets} when absent. */
  readonly targets?: readonly DependencyTarget[];
  readonly dependencyFiles: readonly [FixtureDependencyFileInput, ...FixtureDependencyFileInput[]];
};

/**
 * One pinned dependency file of a fixture closure with its bytes.
 * @public
 */
export type FixtureDependencyFile = {
  readonly dependencyFile: DependencyFile;
  readonly bytes: Uint8Array<ArrayBuffer>;
  /** Lowercase hex sha256 of the bytes: the blob's seed, store and mirror key. */
  readonly sha256: string;
};

/**
 * A manifest pinned to in-test bytes, and every place a test can serve those bytes from.
 * @public
 */
export type FixtureClosure = {
  readonly package: string;
  readonly dependency: string;
  /** The `tau-plugin.json` document, as a plugin package would ship it. */
  readonly manifest: Readonly<Record<string, unknown>>;
  /** The manifest parsed by the shipping parser, so an invalid fixture fails where a real manifest would. */
  readonly deployment: PluginDeployment;
  /** Dependency files in closure order. */
  readonly dependencyFiles: readonly FixtureDependencyFile[];
  /** Sum of the dependency file byte lengths: what a cold prepare downloads. */
  readonly byteLength: number;
  /** The `closureIntegrity` every receipt of this closure carries. */
  readonly closureIntegrity: Integrity;
  /** Each dependency file's first origin URL and its bytes: the canonical registry. */
  readonly routes: ReadonlyMap<string, Uint8Array<ArrayBuffer>>;
  /**
   * The plugin a preparation host registers.
   * @param extra - Package directory, seal step or launch set.
   * @returns The plugin.
   */
  plugin(extra?: Omit<PreparationPlugin, 'package' | 'deployment'>): PreparationPlugin;
  /**
   * Write every dependency file into a seed directory (see {@link writeSeedDirectory}).
   * @param directory - Seed root; created when missing.
   */
  writeSeed(directory: string): Promise<void>;
  /**
   * Write the manifest as JSON.
   * @param path - File path; its directory is created when missing.
   */
  writeManifest(path: string): Promise<void>;
};

const integrityOf = (algorithm: 'sha256' | 'sha384' | 'sha512', bytes: Uint8Array<ArrayBuffer>): Integrity =>
  `${algorithm}-${createHash(algorithm).update(bytes).digest('base64')}`;

/**
 * Lowercase hex sha256 of some bytes: a blob's key in a store, a seed or a mirror.
 * @param bytes - Bytes.
 * @returns The hex digest.
 * @public
 */
export const sha256Hex = (bytes: Uint8Array<ArrayBuffer>): string => createHash('sha256').update(bytes).digest('hex');

/**
 * Write blobs in the seed layout every Tau host reads (`TAU_DEPENDENCY_DIR`, the desktop's bundled dependency files, a
 * `file://` or loopback mirror): `blobs/sha256/<hex>`, plus a `tau-seed.json` index that maps each sha384 or sha512
 * pin to its sha256 blob. The seed directory is the fixture registry of every child-process tier.
 * @param directory - Seed root; created when missing.
 * @param dependencyFiles - Pins and their bytes.
 * @public
 */
export const writeSeedDirectory = async (
  directory: string,
  dependencyFiles: ReadonlyArray<{ readonly integrity: Integrity; readonly bytes: Uint8Array<ArrayBuffer> }>,
): Promise<void> => {
  await mkdir(join(directory, 'blobs', 'sha256'), { recursive: true });
  const indexed: Array<{ readonly integrity: Integrity; readonly blob: string }> = [];
  for (const { integrity, bytes } of dependencyFiles) {
    const blob = `blobs/sha256/${sha256Hex(bytes)}`;
    // oxlint-disable-next-line no-await-in-loop -- a handful of small in-test blobs
    await writeFile(join(directory, blob), bytes);
    if (!integrity.startsWith('sha256-')) {
      indexed.push({ integrity, blob });
    }
  }
  await writeFile(
    join(directory, 'tau-seed.json'),
    `${JSON.stringify({ closures: [{ dependencyFiles: indexed }] })}\n`,
  );
};

/**
 * Build a fixture closure: a manifest whose pins are the real digests of in-test dependency files.
 * @param input - Dependency files and optional package, dependency, kernel and targets.
 * @returns The closure.
 * @public
 */
export const createFixtureClosure = async (input: FixtureClosureInput): Promise<FixtureClosure> => {
  const packageName = input.package ?? '@taucad/fixture';
  const dependency = input.dependency ?? 'engine';
  const kernel = input.kernel ?? { name: 'fixture', extensions: ['py'] };
  const dependencyFiles: FixtureDependencyFile[] = input.dependencyFiles.map((entry) => ({
    bytes: entry.bytes,
    sha256: sha256Hex(entry.bytes),
    dependencyFile: {
      name: entry.name,
      integrity: integrityOf(entry.algorithm ?? 'sha256', entry.bytes),
      byteLength: entry.bytes.byteLength,
      format: entry.format,
      origin: { kind: 'url', urls: entry.urls ?? [`https://registry.example/files/${entry.name}`] },
      destination: entry.destination,
      ...(entry.stripComponents === undefined ? {} : { stripComponents: entry.stripComponents }),
    },
  }));
  const pinned = dependencyFiles.map(({ dependencyFile }) => dependencyFile);
  const manifest = {
    schemaVersion: 1,
    kernels: { [kernel.name]: { requires: [dependency], extensions: kernel.extensions } },
    dependencies: {
      [dependency]: (input.targets ?? fixtureTargets).map((target) => ({ target, files: pinned })),
    },
  };
  const deployment = parsePluginDeployment(manifest, `${packageName} fixture tau-plugin.json`);
  return {
    package: packageName,
    dependency,
    manifest,
    deployment,
    dependencyFiles,
    byteLength: dependencyFiles.reduce((sum, { bytes }) => sum + bytes.byteLength, 0),
    closureIntegrity: await computeClosureIntegrity(pinned),
    routes: new Map(
      dependencyFiles.flatMap(({ dependencyFile, bytes }) =>
        dependencyFile.origin.kind === 'url' ? [[dependencyFile.origin.urls[0], bytes]] : [],
      ),
    ),
    plugin: (extra = {}) => ({ ...extra, package: packageName, deployment }),
    writeSeed: async (directory) =>
      writeSeedDirectory(
        directory,
        dependencyFiles.map(({ dependencyFile, bytes }) => ({ integrity: dependencyFile.integrity, bytes })),
      ),
    writeManifest: async (path) => {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, `${JSON.stringify(manifest, undefined, 2)}\n`);
    },
  };
};
