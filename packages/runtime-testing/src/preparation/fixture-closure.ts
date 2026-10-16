// The fixture closure builder: a `tau-plugin.json` v1 manifest pinned to in-test payload bytes by their real digests,
// with the canonical registry routes and the seed layout (`blobs/sha256/<hex>` plus `tau-seed.json`) that the
// preparation host, `tau prepare`, `tau mcp`, the daemon and the desktop all read. A test prepares it through the
// shipping host; nothing about the closure is mocked except where its bytes come from.
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { computeClosureIntegrity, parsePluginDeployment } from '@taucad/runtime/preparation/node';
import type {
  DependencyPayload,
  DependencyTarget,
  Integrity,
  PayloadFormat,
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
 * One payload of a fixture closure.
 * @public
 */
export type FixturePayloadInput = {
  /** Payload name, unique in the closure. */
  readonly name: string;
  readonly bytes: Uint8Array<ArrayBuffer>;
  readonly format: PayloadFormat;
  /** Closure-relative directory the payload installs into. */
  readonly destination: string;
  readonly stripComponents?: number;
  /** Digest the pin uses, as registries publish it (PyPI and python-build-standalone sha256, Microsoft sha512). */
  readonly algorithm?: 'sha256' | 'sha384' | 'sha512';
  /** Origin URLs in fallback order; one under `https://registry.example/payloads/` when absent. */
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
  /** Targets that pin the payloads; {@link fixtureTargets} when absent. */
  readonly targets?: readonly DependencyTarget[];
  readonly payloads: readonly [FixturePayloadInput, ...FixturePayloadInput[]];
};

/**
 * One pinned payload of a fixture closure with its bytes.
 * @public
 */
export type FixturePayload = {
  readonly payload: DependencyPayload;
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
  /** Payloads in closure order. */
  readonly payloads: readonly FixturePayload[];
  /** Sum of the payload byte lengths: what a cold prepare downloads. */
  readonly byteLength: number;
  /** The `closureIntegrity` every receipt of this closure carries. */
  readonly closureIntegrity: Integrity;
  /** Each payload's first origin URL and its bytes: the canonical registry. */
  readonly routes: ReadonlyMap<string, Uint8Array<ArrayBuffer>>;
  /**
   * The plugin a preparation host registers.
   * @param extra - Package directory, seal step or launch set.
   * @returns The plugin.
   */
  plugin(extra?: Omit<PreparationPlugin, 'package' | 'deployment'>): PreparationPlugin;
  /**
   * Write every payload into a seed directory (see {@link writeSeedDirectory}).
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
 * Write blobs in the seed layout every Tau host reads (`TAU_PAYLOAD_DIR`, the desktop's bundled payloads, a
 * `file://` or loopback mirror): `blobs/sha256/<hex>`, plus a `tau-seed.json` index that maps each sha384 or sha512
 * pin to its sha256 blob. The seed directory is the fixture registry of every child-process tier.
 * @param directory - Seed root; created when missing.
 * @param payloads - Pins and their bytes.
 * @public
 */
export const writeSeedDirectory = async (
  directory: string,
  payloads: ReadonlyArray<{ readonly integrity: Integrity; readonly bytes: Uint8Array<ArrayBuffer> }>,
): Promise<void> => {
  await mkdir(join(directory, 'blobs', 'sha256'), { recursive: true });
  const indexed: Array<{ readonly integrity: Integrity; readonly blob: string }> = [];
  for (const { integrity, bytes } of payloads) {
    const blob = `blobs/sha256/${sha256Hex(bytes)}`;
    // oxlint-disable-next-line no-await-in-loop -- a handful of small in-test blobs
    await writeFile(join(directory, blob), bytes);
    if (!integrity.startsWith('sha256-')) {
      indexed.push({ integrity, blob });
    }
  }
  await writeFile(join(directory, 'tau-seed.json'), `${JSON.stringify({ closures: [{ payloads: indexed }] })}\n`);
};

/**
 * Build a fixture closure: a manifest whose pins are the real digests of in-test payloads.
 * @param input - Payloads and optional package, dependency, kernel and targets.
 * @returns The closure.
 * @public
 */
export const createFixtureClosure = async (input: FixtureClosureInput): Promise<FixtureClosure> => {
  const packageName = input.package ?? '@taucad/fixture';
  const dependency = input.dependency ?? 'engine';
  const kernel = input.kernel ?? { name: 'fixture', extensions: ['py'] };
  const payloads: FixturePayload[] = input.payloads.map((entry) => ({
    bytes: entry.bytes,
    sha256: sha256Hex(entry.bytes),
    payload: {
      name: entry.name,
      integrity: integrityOf(entry.algorithm ?? 'sha256', entry.bytes),
      byteLength: entry.bytes.byteLength,
      format: entry.format,
      origin: { kind: 'url', urls: entry.urls ?? [`https://registry.example/payloads/${entry.name}`] },
      destination: entry.destination,
      ...(entry.stripComponents === undefined ? {} : { stripComponents: entry.stripComponents }),
    },
  }));
  const pinned = payloads.map(({ payload }) => payload);
  const manifest = {
    schemaVersion: 1,
    kernels: { [kernel.name]: { requires: [dependency], extensions: kernel.extensions } },
    dependencies: {
      [dependency]: (input.targets ?? fixtureTargets).map((target) => ({ target, payloads: pinned })),
    },
  };
  const deployment = parsePluginDeployment(manifest, `${packageName} fixture tau-plugin.json`);
  return {
    package: packageName,
    dependency,
    manifest,
    deployment,
    payloads,
    byteLength: payloads.reduce((sum, { bytes }) => sum + bytes.byteLength, 0),
    closureIntegrity: await computeClosureIntegrity(pinned),
    routes: new Map(
      payloads.flatMap(({ payload, bytes }) =>
        payload.origin.kind === 'url' ? [[payload.origin.urls[0], bytes]] : [],
      ),
    ),
    plugin: (extra = {}) => ({ ...extra, package: packageName, deployment }),
    writeSeed: async (directory) =>
      writeSeedDirectory(
        directory,
        payloads.map(({ payload, bytes }) => ({ integrity: payload.integrity, bytes })),
      ),
    writeManifest: async (path) => {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, `${JSON.stringify(manifest, undefined, 2)}\n`);
    },
  };
};
