// Guarantees G1–G5 of the managed profile (charter D25, W10), one test each, over a real store on disk, in-test
// archives and a hermetic registry: each scenario reads its profile from environment variables with
// `readManagedPreparation`, then opens the host the way a Node host entry does. G6 (the effective profile `tau prepare
// --inspect --json` prints) is the CLI's test.
/* eslint-disable @typescript-eslint/naming-convention -- environment variable names are SCREAMING_SNAKE_CASE. */
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { readManagedPreparation } from '#preparation/managed-environment.js';
import { PreparationError } from '#preparation/preparation-error.js';
import { createPreparationHost } from '#preparation/preparation-host.js';
import type { ClosureReceipt } from '#preparation/preparation.types.js';
import type { PreparationHost, PrepareOutcome } from '#preparation/preparation-host.types.js';

import {
  createFakeRegistry,
  forbidGlobalFetch,
  linuxHost,
  linuxTarget,
  originOf,
  pluginOf,
  pythonPayloadBytes,
  pythonPayloads,
  servePayloads,
  sha256Hex,
  temporaryDirectory,
} from '#preparation/preparation.fixture.js';
import type { FakeRegistry } from '#preparation/preparation.fixture.js';

const packageName = '@taucad/demo';
const mirror = 'https://mirror.corp.example/tau/';
const bytes = pythonPayloadBytes();
const payloads = pythonPayloads(bytes);
const plugin = pluginOf(packageName, { engine: [{ target: linuxTarget, payloads }] });

let cleanups: Array<() => Promise<void> | void> = [];

beforeEach(() => {
  // Any request outside the injected transport fails the scenario.
  vi.stubGlobal('fetch', forbidGlobalFetch());
});

afterEach(async () => {
  vi.unstubAllGlobals();
  for (const cleanup of cleanups.toReversed()) {
    // oxlint-disable-next-line no-await-in-loop -- cleanups run in reverse order
    await cleanup();
  }
  cleanups = [];
});

const directory = async (prefix: string): Promise<string> => {
  const created = await temporaryDirectory(prefix);
  cleanups.push(created.remove);
  return created.path;
};

/** A registry serving every payload at its manifest URL and, under `mirror`, at its digest. */
const registryServing = (sources: { readonly origin?: boolean; readonly mirror?: boolean }): FakeRegistry => {
  const registry = createFakeRegistry();
  if (sources.origin !== false) {
    servePayloads(
      registry,
      payloads.map((payload) => [payload, bytes[payload.name as keyof typeof bytes]] as const),
    );
  }
  if (sources.mirror === true) {
    for (const payloadBytes of Object.values(bytes)) {
      registry.route(`${mirror}blobs/sha256/${sha256Hex(payloadBytes)}`, { bytes: payloadBytes });
    }
  }
  return registry;
};

/** A seed directory in the bundle layout holding every payload, or the given bytes under each payload's name. */
const seedDirectory = async (
  contents: (payloadBytes: Uint8Array<ArrayBuffer>) => Uint8Array<ArrayBuffer> = (payloadBytes) => payloadBytes,
): Promise<string> => {
  const seed = await directory('tau-managed-seed-');
  await mkdir(join(seed, 'blobs', 'sha256'), { recursive: true });
  for (const payloadBytes of Object.values(bytes)) {
    // oxlint-disable-next-line no-await-in-loop -- three seed files
    await writeFile(join(seed, 'blobs', 'sha256', sha256Hex(payloadBytes)), contents(payloadBytes));
  }
  return seed;
};

/**
 * The host a Node entry opens under an environment, and how it prepares: the interpreted profile gives the mirror, the
 * seed, the selection and whether the call is offline.
 */
const managedHost = (
  store: string,
  environment: Readonly<Record<string, string>>,
  transport: typeof fetch,
): { readonly host: PreparationHost; readonly prepare: () => Promise<PrepareOutcome> } => {
  const managed = readManagedPreparation(environment);
  const host = createPreparationHost({
    plugins: [plugin],
    store,
    indicators: linuxHost,
    fetch: transport,
    tauVersion: '1.0.0',
    ...(managed.mirror === undefined ? {} : { mirror: managed.mirror }),
    ...(managed.seed === undefined ? {} : { seed: managed.seed }),
    selection: managed.selection,
  });
  cleanups.push(() => {
    host.dispose();
  });
  return {
    host,
    prepare: async () =>
      host.prepare({ package: packageName, offline: managed.offline, signal: AbortSignal.timeout(30_000) }),
  };
};

const readyReceipt = (outcome: PrepareOutcome): ClosureReceipt => {
  const receipt = outcome.status === 'ready' ? outcome.receipts['engine'] : undefined;
  if (receipt === undefined) {
    throw new Error(`Expected a ready engine closure, got ${JSON.stringify(outcome)}`);
  }
  return receipt;
};

const entriesOf = async (path: string): Promise<string[]> => {
  try {
    return await readdir(path);
  } catch {
    return [];
  }
};

const rejection = async (promise: Promise<unknown>): Promise<PreparationError> => {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(PreparationError);
    return error as PreparationError;
  }
  return expect.fail('should have rejected with a PreparationError');
};

describe('managed profile guarantees (D25)', () => {
  it('G1: makes zero requests on a warm store under TAU_ACQUISITION=locked, with or without a mirror', async () => {
    const store = join(await directory('tau-managed-'), 'store');
    const registry = registryServing({ mirror: true });
    readyReceipt(await managedHost(store, {}, registry.fetch).prepare());
    const warmed = registry.calls.length;

    const environments: ReadonlyArray<Readonly<Record<string, string>>> = [
      { TAU_ACQUISITION: 'locked' },
      { TAU_ACQUISITION: 'locked', TAU_PAYLOAD_MIRROR: mirror },
    ];
    for (const environment of environments) {
      const { host, prepare } = managedHost(store, environment, registry.fetch);
      // oxlint-disable-next-line no-await-in-loop -- each profile is checked on the same warm store in turn
      await expect(prepare()).resolves.toMatchObject({ status: 'ready' });
      // oxlint-disable-next-line no-await-in-loop -- as above
      await expect(host.inspect({ package: packageName })).resolves.toMatchObject({ state: { status: 'ready' } });
      // oxlint-disable-next-line no-await-in-loop -- as above
      await expect(host.inspectLaunch({ package: packageName })).resolves.toMatchObject({ status: 'ready' });
      // oxlint-disable-next-line no-await-in-loop -- as above
      await expect(host.describe()).resolves.toMatchObject([{ state: 'ready' }]);
    }

    expect(registry.calls).toHaveLength(warmed);
  });

  it('G2: writes only pinned digests: a seed or mirror file that does not hash to its name leaves nothing behind', async () => {
    // One byte flipped: the declared length still matches, so only the digest can refuse it.
    const flipped = new Uint8Array(bytes.demo);
    flipped[0] = 0xff - (flipped[0] ?? 0);
    const tampered = (payloadBytes: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> =>
      payloadBytes === bytes.demo ? flipped : payloadBytes;
    const seed = await seedDirectory(tampered);
    const seeded = join(await directory('tau-managed-'), 'store');
    const fromSeed = managedHost(seeded, { TAU_ACQUISITION: 'locked', TAU_PAYLOAD_DIR: seed }, forbidGlobalFetch());

    const seedError = await rejection(fromSeed.prepare());

    const registry = registryServing({ origin: false });
    registry.route(`${mirror}blobs/sha256/${sha256Hex(bytes.python)}`, { bytes: bytes.python });
    registry.route(`${mirror}blobs/sha256/${sha256Hex(bytes.demo)}`, { bytes: flipped });
    registry.route(`${mirror}blobs/sha256/${sha256Hex(bytes['worker.py'])}`, { bytes: bytes['worker.py'] });
    const mirrored = join(await directory('tau-managed-'), 'store');
    const fromMirror = managedHost(mirrored, { TAU_ACQUISITION: 'locked', TAU_PAYLOAD_MIRROR: mirror }, registry.fetch);

    const mirrorError = await rejection(fromMirror.prepare());

    expect(seedError.code).toBe('INTEGRITY_MISMATCH');
    expect(seedError.message).toContain(join(seed, 'blobs', 'sha256', sha256Hex(bytes.demo)));
    expect(mirrorError.code).toBe('INTEGRITY_MISMATCH');
    expect(mirrorError.message).toContain(`${mirror}blobs/sha256/${sha256Hex(bytes.demo)}`);
    for (const store of [seeded, mirrored]) {
      // oxlint-disable-next-line no-await-in-loop -- two stores
      expect(await entriesOf(join(store, 'blobs', 'sha256'))).not.toContain(sha256Hex(flipped));
      // oxlint-disable-next-line no-await-in-loop -- as above
      expect(await entriesOf(join(store, 'closures', 'sha256'))).toEqual([]);
      // oxlint-disable-next-line no-await-in-loop -- as above
      expect(await entriesOf(join(store, 'tmp'))).toEqual([]);
    }
  });

  it('G3: answers a miss with a typed refusal naming what to populate, never another version or origin', async () => {
    const store = join(await directory('tau-managed-'), 'store');
    const registry = registryServing({});
    const seed = await directory('tau-managed-empty-seed-');
    const { prepare } = managedHost(store, { TAU_ACQUISITION: 'locked', TAU_PAYLOAD_DIR: seed }, registry.fetch);

    const outcome = await prepare();

    expect(outcome).toMatchObject({ status: 'blocked', reason: 'offline-miss' });
    expect(outcome.status === 'blocked' && outcome.message).toContain('python, demo, worker.py');
    expect(registry.calls).toEqual([]);
    expect(await entriesOf(join(store, 'closures', 'sha256'))).toEqual([]);
  });

  it('G4: keeps every request on the mirror under locked: no manifest origin after a miss, no redirect off it', async () => {
    const missing = `${mirror}blobs/sha256/${sha256Hex(bytes.demo)}`;
    const missed = registryServing({ mirror: true });
    missed.route(missing, { status: 404 });
    const missStore = join(await directory('tau-managed-'), 'store');

    const missError = await rejection(
      managedHost(missStore, { TAU_ACQUISITION: 'locked', TAU_PAYLOAD_MIRROR: mirror }, missed.fetch).prepare(),
    );

    const redirected = `${mirror}blobs/sha256/${sha256Hex(bytes['worker.py'])}`;
    const redirecting = registryServing({ mirror: true });
    const transport: typeof fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url !== redirected) {
        return redirecting.fetch(input, init);
      }
      redirecting.calls.push(url);
      return new Response(null, { status: 302, headers: { location: originOf('worker.py') } });
    };
    const redirectStore = join(await directory('tau-managed-'), 'store');

    const redirectError = await rejection(
      managedHost(redirectStore, { TAU_ACQUISITION: 'locked', TAU_PAYLOAD_MIRROR: mirror }, transport).prepare(),
    );

    expect(missError.code).toBe('DOWNLOAD_FAILED');
    expect(missError.message).toContain(missing);
    expect(redirectError.code).toBe('DOWNLOAD_FAILED');
    expect(redirectError.message).toContain(redirected);
    for (const registry of [missed, redirecting]) {
      expect(registry.calls.length).toBeGreaterThan(0);
      expect(registry.calls.every((url) => url.startsWith(mirror))).toBe(true);
    }
    expect(redirecting.calls).toContain(redirected);
    for (const store of [missStore, redirectStore]) {
      // oxlint-disable-next-line no-await-in-loop -- two stores
      expect(await entriesOf(join(store, 'closures', 'sha256'))).toEqual([]);
    }
  });

  it('G5: seals the same files and identities whether the bytes came online, from a mirror or from a seed', async () => {
    const online = registryServing({});
    const mirrored = registryServing({ origin: false, mirror: true });
    const seed = await seedDirectory();
    const receipts = [
      readyReceipt(await managedHost(join(await directory('tau-managed-'), 'store'), {}, online.fetch).prepare()),
      readyReceipt(
        await managedHost(
          join(await directory('tau-managed-'), 'store'),
          { TAU_ACQUISITION: 'locked', TAU_PAYLOAD_MIRROR: mirror },
          mirrored.fetch,
        ).prepare(),
      ),
      readyReceipt(
        await managedHost(
          join(await directory('tau-managed-'), 'store'),
          { TAU_ACQUISITION: 'locked', TAU_PAYLOAD_DIR: seed },
          forbidGlobalFetch(),
        ).prepare(),
      ),
    ];

    expect(receipts.map(({ payloads: rows }) => rows.map(({ acquiredFrom }) => acquiredFrom.kind)[0])).toEqual([
      'origin',
      'mirror',
      'seed',
    ]);
    const [first, ...others] = receipts.map(({ closureIntegrity, treeIntegrity, files }) => ({
      closureIntegrity,
      treeIntegrity,
      files,
    }));
    for (const other of others) {
      expect(other).toEqual(first);
    }
  });
});
