// Tier-2 scenarios of the preparation host (W2 oracle, T1): a real store on disk, in-test archives and a hermetic
// registry `fetch`. The global `fetch` is replaced by a tripwire, so no scenario can reach the network.
import { lstat, mkdir, readdir, readFile, rm, utimes, writeFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

import { measureCapacityDomain } from '@taucad/filesystem';
import type * as Filesystem from '@taucad/filesystem';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { computeClosureIntegrity, computeTreeIntegrity } from '#preparation/closure-receipt.js';
import { PreparationError } from '#preparation/preparation-error.js';
import { createPreparationHost } from '#preparation/preparation-host.js';
import { readStoreGeneration, sha256Key } from '#preparation/preparation-store.js';
import type {
  CreatePreparationHostOptions,
  PluginPreparation,
  PreparationHost,
  PrepareOutcome,
} from '#preparation/preparation-host.types.js';
import type { DependencyPayload, DependencyVariant, HostIndicators } from '#preparation/preparation.types.js';

import {
  createFakeRegistry,
  forbidGlobalFetch,
  linuxHost,
  linuxTarget,
  originOf,
  payloadOf,
  pluginOf,
  pythonPayloadBytes,
  pythonPayloads,
  servePayloads,
  sha256Hex,
  tarGz,
  temporaryDirectory,
  utf8,
} from '#preparation/preparation.fixture.js';
import type { FakeRegistry } from '#preparation/preparation.fixture.js';

vi.mock('@taucad/filesystem', async (importOriginal) => {
  const actual = await importOriginal<typeof Filesystem>();
  return { ...actual, measureCapacityDomain: vi.fn(actual.measureCapacityDomain) };
});

const packageName = '@taucad/demo';
const prepareTimeout = 30_000;

type Scenario = {
  readonly store: string;
  readonly hostPath: string;
  readonly registry: FakeRegistry;
  readonly bytes: ReturnType<typeof pythonPayloadBytes>;
  readonly payloads: readonly [DependencyPayload, ...DependencyPayload[]];
  readonly host: PreparationHost;
  readonly events: PluginPreparation[];
  /** Another host over the same store, as a second process or a restarted one sees it. */
  readonly reopen: (options?: Partial<CreatePreparationHostOptions>) => PreparationHost;
};

let cleanups: Array<() => Promise<void> | void> = [];

beforeEach(() => {
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

const scenario = async (
  options: {
    readonly variants?: (
      payloads: readonly [DependencyPayload, ...DependencyPayload[]],
    ) => readonly DependencyVariant[];
    readonly serve?: boolean;
    readonly host?: Partial<CreatePreparationHostOptions>;
  } = {},
): Promise<Scenario> => {
  const directory = await temporaryDirectory('tau-preparation-');
  cleanups.push(directory.remove);
  const store = join(directory.path, 'store');
  const hostPath = join(directory.path, 'tau-host.mjs');
  await writeFile(hostPath, '// host installation\n');
  const bytes = pythonPayloadBytes();
  const payloads = pythonPayloads(bytes);
  const plugin = pluginOf(packageName, {
    engine: options.variants?.(payloads) ?? [{ target: linuxTarget, payloads }],
  });
  const registry = createFakeRegistry();
  if (options.serve !== false) {
    servePayloads(
      registry,
      payloads.map((payload) => [payload, bytes[payload.name as keyof typeof bytes]] as const),
    );
  }
  const reopen = (overrides: Partial<CreatePreparationHostOptions> = {}): PreparationHost => {
    const created = createPreparationHost({
      plugins: [plugin],
      store,
      hostPath,
      indicators: linuxHost,
      fetch: registry.fetch,
      tauVersion: '1.0.0',
      ...options.host,
      ...overrides,
    });
    cleanups.push(() => {
      created.dispose();
    });
    return created;
  };
  const host = reopen();
  const events: PluginPreparation[] = [];
  host.on('preparation', (event) => {
    events.push(event);
  });
  return { store, hostPath, registry, bytes, payloads, host, events, reopen };
};

const prepare = async (
  host: PreparationHost,
  input: { readonly offline?: boolean; readonly signal?: AbortSignal } = {},
): Promise<PrepareOutcome> =>
  host.prepare({
    package: packageName,
    signal: input.signal ?? AbortSignal.timeout(prepareTimeout),
    ...(input.offline === undefined ? {} : { offline: input.offline }),
  });

const readyReceipt = (outcome: PrepareOutcome) => {
  if (outcome.status !== 'ready') {
    throw new Error(`Expected ready, got ${JSON.stringify(outcome)}`);
  }
  const receipt = outcome.receipts['engine'];
  if (receipt === undefined) {
    throw new Error('No engine receipt');
  }
  return receipt;
};

const listFiles = async (root: string): Promise<string[]> => {
  try {
    const entries = await readdir(root, { recursive: true, withFileTypes: true });
    return entries
      .filter((entry) => !entry.isDirectory())
      .map((entry) => relative(root, join(entry.parentPath, entry.name)).split(sep).join('/'))
      .toSorted();
  } catch {
    return [];
  }
};

const entriesOf = async (path: string): Promise<string[]> => {
  try {
    const names = await readdir(path);
    return names.toSorted();
  } catch {
    return [];
  }
};

const exists = async (path: string): Promise<boolean> => {
  try {
    await lstat(path);
    return true;
  } catch {
    return false;
  }
};

const blobPath = (store: string, bytes: Uint8Array<ArrayBuffer>): string =>
  join(store, 'blobs', 'sha256', sha256Hex(bytes));

const expectPreparationError = async (
  promise: Promise<unknown>,
  code: PreparationError['code'],
): Promise<PreparationError> => {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(PreparationError);
    expect((error as PreparationError).code).toBe(code);
    return error as PreparationError;
  }
  return expect.fail(`should have thrown ${code}`);
};

describe('createPreparationHost', () => {
  describe('happy path', () => {
    it('should seal a receipt that lists every file and prepare again with zero fetch calls', async () => {
      const { store, registry, payloads, host, events, reopen } = await scenario();

      const receipt = readyReceipt(await prepare(host));

      const files = await listFiles(receipt.root);
      const onDisk = files.filter((path) => path !== 'receipt.json');
      expect(receipt.files.map((row) => row.path)).toEqual(onDisk);
      expect(onDisk).toEqual(
        expect.arrayContaining([
          'python/bin/python3',
          'python/bin/python3.13',
          'python/lib/python3.13/os.py',
          'python/lib/python3.13/site-packages/demo/__init__.py',
          'python/share/man/man1/demo.1',
          'worker/worker.py',
        ]),
      );
      expect(receipt.files.find((row) => row.path === 'python/bin/python3')?.symlinkTarget).toBe('python3.13');
      expect(receipt.closureIntegrity).toBe(await computeClosureIntegrity(payloads));
      expect(receipt.treeIntegrity).toBe(await computeTreeIntegrity(receipt.files));
      expect(receipt.root).toBe(join(store, 'closures', 'sha256', sha256Key(receipt.closureIntegrity)));
      expect(receipt.payloads.map(({ name, acquiredFrom }) => [name, acquiredFrom])).toEqual(
        payloads.map((payload) => [payload.name, { kind: 'origin', location: originOf(payload.name) }]),
      );
      expect(registry.calls.toSorted()).toEqual(payloads.map((payload) => originOf(payload.name)).toSorted());
      expect(await entriesOf(join(store, 'tmp'))).toEqual([]);
      expect(events.at(-1)?.state.status).toBe('ready');
      expect(await readStoreGeneration(store)).not.toBe('0');

      const again = reopen();
      await expect(again.inspect({ package: packageName })).resolves.toMatchObject({ state: { status: 'ready' } });
      expect(readyReceipt(await prepare(again)).treeIntegrity).toBe(receipt.treeIntegrity);
      expect(registry.calls).toHaveLength(payloads.length);
    });

    it('should report progress through downloading, verifying and extracting with bounded byte counts', async () => {
      const { host, events, payloads } = await scenario();

      await prepare(host);

      const preparing = events.flatMap(({ state }) => (state.status === 'preparing' ? [state] : []));
      expect(new Set(preparing.map((state) => state.phase))).toEqual(
        new Set(['downloading', 'verifying', 'extracting']),
      );
      const totalBytes = payloads.reduce((sum, payload) => sum + payload.byteLength, 0);
      for (const state of preparing) {
        expect(state.totalPayloads).toBe(payloads.length);
        expect(state.totalBytes).toBe(totalBytes);
        expect(state.completedBytes).toBeLessThanOrEqual(totalBytes);
      }
      expect(new Set(preparing.map((state) => state.attemptId)).size).toBe(1);
    });
  });

  describe('failures', () => {
    it('should name the URL and size on DOWNLOAD_FAILED, keep verified blobs and fetch only the missing payload on retry', async () => {
      const { store, registry, bytes, host, events } = await scenario();
      let release = (): void => undefined;
      registry.route(originOf('demo'), {
        status: 404,
        hold: new Promise((resolve) => {
          release = resolve;
        }),
      });

      const pending = expectPreparationError(prepare(host), 'DOWNLOAD_FAILED');
      await vi.waitFor(
        async () => {
          expect(await exists(blobPath(store, bytes.python))).toBe(true);
          expect(await exists(blobPath(store, bytes['worker.py']))).toBe(true);
        },
        { timeout: prepareTimeout },
      );
      release();
      const error = await pending;

      expect(error.message).toContain(originOf('demo'));
      expect(error.message).toContain(`(${(bytes.demo.byteLength / 1e6).toFixed(1)} MB)`);
      expect(events.at(-1)?.state).toMatchObject({ status: 'failed', code: 'DOWNLOAD_FAILED' });
      expect(await entriesOf(join(store, 'closures', 'sha256'))).toEqual([]);
      expect(await entriesOf(join(store, 'tmp'))).toEqual([]);

      registry.route(originOf('demo'), { bytes: bytes.demo });
      await expect(prepare(host)).resolves.toMatchObject({ status: 'ready' });
      expect(registry.count(originOf('demo'))).toBe(2);
      expect(registry.count(originOf('python'))).toBe(1);
      expect(registry.count(originOf('worker.py'))).toBe(1);
    });

    it('should refuse tampered bytes with INTEGRITY_MISMATCH and write nothing under closures', async () => {
      const { store, registry, bytes, host } = await scenario();
      const tampered = new Uint8Array(bytes.demo);
      const flipped = tampered.length - 30;
      tampered[flipped] = ((tampered[flipped] ?? 0) + 1) % 256;
      registry.route(originOf('demo'), { bytes: tampered });

      const error = await expectPreparationError(prepare(host), 'INTEGRITY_MISMATCH');

      expect(error.message).toContain(originOf('demo'));
      expect(await entriesOf(join(store, 'closures', 'sha256'))).toEqual([]);
      expect(await exists(blobPath(store, tampered))).toBe(false);
      expect(await exists(blobPath(store, bytes.demo))).toBe(false);
    });

    it('should refuse an archive that escapes its destination and leave no staging behind', async () => {
      const hostile = tarGz(
        { name: 'python/bin/python3', data: 'ok' },
        { name: '../../escape.sh', data: 'echo pwned' },
      );
      const { store, registry, host, events } = await scenario({
        variants: (payloads) => [
          {
            target: linuxTarget,
            payloads: [
              payloadOf({
                name: 'python',
                bytes: hostile,
                format: 'tar.gz',
                destination: 'python',
                stripComponents: 1,
              }),
              ...payloads.slice(1),
            ],
          },
        ],
      });
      registry.route(originOf('python'), { bytes: hostile });

      const error = await expectPreparationError(prepare(host), 'EXTRACTION_REFUSED');

      expect(error.message).toContain('Payload python (tar.gz) was refused while unpacking');
      expect(events.at(-1)?.state).toMatchObject({ status: 'failed', code: 'EXTRACTION_REFUSED' });
      expect(await entriesOf(join(store, 'closures', 'sha256'))).toEqual([]);
      expect(await entriesOf(join(store, 'tmp'))).toEqual([]);
      expect(await exists(join(store, 'escape.sh'))).toBe(false);
    });

    it('should refuse with STORE_EXHAUSTED before any download when the volume cannot hold the closure', async () => {
      const { registry, host } = await scenario();
      vi.mocked(measureCapacityDomain).mockResolvedValueOnce({
        outcome: 'measured',
        freeBytes: 4096,
        totalBytes: 64 * 1024 ** 3,
      });

      const error = await expectPreparationError(prepare(host), 'STORE_EXHAUSTED');

      expect(error.message).toContain('tau prepare --gc');
      expect(registry.calls).toEqual([]);
    });
  });

  describe('cancellation', () => {
    it.each(['downloading', 'verifying', 'extracting'] as const)(
      'should resolve cancelled at %s, keep only verified blobs and delete staging',
      async (phase) => {
        const { store, bytes, host } = await scenario();
        const controller = new AbortController();
        let cancelledAt: string | undefined;
        host.on('preparation', ({ state }) => {
          if (state.status === 'preparing' && state.phase === phase && !controller.signal.aborted) {
            cancelledAt = state.payload;
            controller.abort(new Error('cancelled by the test'));
          }
        });

        const outcome = await prepare(host, { signal: controller.signal });

        expect(outcome.status).toBe('cancelled');
        await vi.waitFor(async () => {
          expect(await entriesOf(join(store, 'tmp'))).toEqual([]);
        });
        expect(await entriesOf(join(store, 'closures', 'sha256'))).toEqual([]);
        const blobs = await entriesOf(join(store, 'blobs', 'sha256'));
        for (const name of blobs) {
          // oxlint-disable-next-line no-await-in-loop -- a handful of blobs
          expect(sha256Hex(new Uint8Array(await readFile(join(store, 'blobs', 'sha256', name))))).toBe(name);
        }
        if (phase !== 'downloading') {
          expect(blobs).toContain(sha256Hex(bytes[cancelledAt as keyof typeof bytes]));
        }
      },
    );
  });

  describe('joining', () => {
    it('should join one attempt per selection with one fetch per payload and strictly increasing revisions', async () => {
      const { registry, payloads, host, events } = await scenario();

      const [first, second] = await Promise.all([
        prepare(host),
        host.prepare({ package: packageName, dependencies: ['engine'], signal: AbortSignal.timeout(prepareTimeout) }),
      ]);

      expect(first.status).toBe('ready');
      expect(second.status).toBe('ready');
      expect(first.status === 'ready' && second.status === 'ready' && first.attemptId === second.attemptId).toBe(true);
      for (const payload of payloads) {
        expect(registry.count(originOf(payload.name))).toBe(1);
      }
      const revisions = events.map(({ revision }) => revision);
      expect(revisions).toEqual(revisions.toSorted((left, right) => left - right));
      expect(new Set(revisions).size).toBe(revisions.length);
    });

    it('should keep the attempt running for the remaining caller when one joined caller aborts', async () => {
      const { registry, host } = await scenario();
      let release = (): void => undefined;
      registry.route(originOf('demo'), {
        bytes: pythonPayloadBytes().demo,
        holdBody: new Promise((resolve) => {
          release = resolve;
        }),
      });
      const leaving = new AbortController();

      const left = prepare(host, { signal: leaving.signal });
      const stays = prepare(host);
      leaving.abort();
      const leftOutcome = await left;
      release();

      expect(leftOutcome.status).toBe('cancelled');
      await expect(stays).resolves.toMatchObject({ status: 'ready' });
    });
  });

  describe('offline', () => {
    it('should answer blocked offline-miss on a cold store with zero fetch calls', async () => {
      const { store, registry, host } = await scenario();

      const outcome = await prepare(host, { offline: true });

      expect(outcome).toMatchObject({ status: 'blocked', reason: 'offline-miss' });
      expect(outcome.status === 'blocked' && outcome.message).toContain('python, demo, worker.py');
      expect(registry.calls).toEqual([]);
      expect(await entriesOf(join(store, 'tmp'))).toEqual([]);
    });

    it('should prepare offline from a seed matched by name and digest', async () => {
      const seed = await temporaryDirectory('tau-seed-');
      cleanups.push(seed.remove);
      const { registry, bytes, host } = await scenario({ host: { seed: seed.path } });
      await mkdir(join(seed.path, 'blobs', 'sha256'), { recursive: true });
      for (const payloadBytes of Object.values(bytes)) {
        // oxlint-disable-next-line no-await-in-loop -- three seed files
        await writeFile(join(seed.path, 'blobs', 'sha256', sha256Hex(payloadBytes)), payloadBytes);
      }

      const receipt = readyReceipt(await prepare(host, { offline: true }));

      expect(registry.calls).toEqual([]);
      expect(receipt.payloads.every(({ acquiredFrom }) => acquiredFrom.kind === 'seed')).toBe(true);
    });

    it('should skip a seed file whose bytes do not hash to its name', async () => {
      const seed = await temporaryDirectory('tau-seed-');
      cleanups.push(seed.remove);
      const { registry, bytes, host } = await scenario({ host: { seed: seed.path } });
      await mkdir(join(seed.path, 'blobs', 'sha256'), { recursive: true });
      await writeFile(join(seed.path, 'blobs', 'sha256', sha256Hex(bytes.python)), bytes.python);
      await writeFile(join(seed.path, 'blobs', 'sha256', sha256Hex(bytes.demo)), utf8('not the wheel'));

      const receipt = readyReceipt(await prepare(host));

      expect(receipt.payloads.map(({ name, acquiredFrom }) => [name, acquiredFrom.kind])).toEqual([
        ['python', 'seed'],
        ['demo', 'origin'],
        ['worker.py', 'origin'],
      ]);
      expect(registry.calls.toSorted()).toEqual([originOf('demo'), originOf('worker.py')]);
    });
  });

  describe('mirror', () => {
    const mirror = 'http://127.0.0.1:8123/tau/';

    it('should try the mirror before every manifest URL', async () => {
      const { registry, bytes, host } = await scenario({ serve: false, host: { mirror: { baseUrl: mirror } } });
      for (const payloadBytes of Object.values(bytes)) {
        registry.route(`${mirror}blobs/sha256/${sha256Hex(payloadBytes)}`, { bytes: payloadBytes });
      }

      const receipt = readyReceipt(await prepare(host));

      expect(registry.calls.every((url) => url.startsWith(mirror))).toBe(true);
      expect(receipt.payloads.every(({ acquiredFrom }) => acquiredFrom.kind === 'mirror')).toBe(true);
    });

    it('should fall back to the manifest URL after a mirror miss unless no-fallback is set', async () => {
      const open = await scenario({ host: { mirror: { baseUrl: mirror } } });
      const missing = `${mirror}blobs/sha256/${sha256Hex(open.bytes.demo)}`;

      await expect(prepare(open.host)).resolves.toMatchObject({ status: 'ready' });
      expect(open.registry.calls.filter((url) => url === missing || url === originOf('demo'))).toEqual([
        missing,
        originOf('demo'),
      ]);

      const locked = await scenario({ host: { mirror: { baseUrl: mirror, noFallback: true } } });
      const error = await expectPreparationError(prepare(locked.host), 'DOWNLOAD_FAILED');

      expect(error.message).toContain(`${mirror}blobs/sha256/`);
      expect(locked.registry.calls.filter((url) => url.startsWith('https://registry.example/'))).toEqual([]);
    });
  });

  describe('verify and repair', () => {
    it('should report stale files and repair only the payload that wrote them, from the store', async () => {
      const { store, registry, bytes, host } = await scenario();
      const receipt = readyReceipt(await prepare(host));
      await writeFile(join(receipt.root, 'worker', 'worker.py'), 'print("tampered")\n');
      await writeFile(join(receipt.root, 'stray.txt'), 'not in the receipt');
      // Only worker.py may be re-unpacked: the other blobs are gone, and the repair runs offline.
      await rm(blobPath(store, bytes.python));
      await rm(blobPath(store, bytes.demo));
      const calls = registry.calls.length;

      const [stale] = await host.verify({ package: packageName, signal: AbortSignal.timeout(prepareTimeout) });
      const [repaired] = await host.verify({
        package: packageName,
        repair: true,
        offline: true,
        signal: AbortSignal.timeout(prepareTimeout),
      });
      const [intact] = await host.verify({ package: packageName, signal: AbortSignal.timeout(prepareTimeout) });

      expect(stale).toMatchObject({
        status: 'stale',
        payloads: ['worker.py'],
        files: ['stray.txt', 'worker/worker.py'],
      });
      expect(repaired).toMatchObject({ status: 'repaired', payloads: ['worker.py'] });
      expect(intact).toMatchObject({ status: 'intact', payloads: [], files: [] });
      expect(await readFile(join(receipt.root, 'worker', 'worker.py'), 'utf8')).toBe('print("ready")\n');
      expect(registry.calls).toHaveLength(calls);
    });

    it('should treat a receipt from another Tau version as idle, then re-verify it locally on prepare', async () => {
      const { registry, payloads, host, reopen } = await scenario();
      readyReceipt(await prepare(host));
      const upgraded = reopen({ tauVersion: '2.0.0' });

      await expect(upgraded.inspect({ package: packageName })).resolves.toMatchObject({ state: { status: 'idle' } });
      await expect(upgraded.describe()).resolves.toMatchObject([{ state: 'stale' }]);
      const receipt = readyReceipt(await prepare(upgraded));

      expect(receipt.tauVersion).toBe('2.0.0');
      expect(registry.calls).toHaveLength(payloads.length);
      await expect(upgraded.inspect({ package: packageName })).resolves.toMatchObject({ state: { status: 'ready' } });
    });
  });

  describe('selection', () => {
    const glibcHost = (libcVersion: string): HostIndicators => ({ ...linuxHost, libcVersion });

    it('should launch the recorded closure and report a better variant after the floor is crossed', async () => {
      const { host, reopen } = await scenario({
        variants: (payloads) => [
          { target: { ...linuxTarget, minimumLibcVersion: '2.17' }, payloads },
          { target: { ...linuxTarget, minimumLibcVersion: '2.31' }, payloads: [payloads[0], payloads[2]!] },
        ],
        host: { indicators: glibcHost('2.28') },
      });
      const recorded = readyReceipt(await prepare(host));

      const upgraded = reopen({ indicators: glibcHost('2.39') });
      const inspected = await upgraded.inspect({ package: packageName });

      expect(inspected.state.status === 'ready' && inspected.state.receipts['engine']?.closureIntegrity).toBe(
        recorded.closureIntegrity,
      );
      expect(inspected.state.status === 'ready' && inspected.state.betterVariantAvailable).toEqual({
        engine: { ...linuxTarget, minimumLibcVersion: '2.31' },
      });
      expect(readyReceipt(await prepare(upgraded)).closureIntegrity).not.toBe(recorded.closureIntegrity);
    });

    it('should block on the failing axis when no variant fits and on Windows', async () => {
      const darwin = await scenario({
        host: {
          indicators: { os: 'darwin', arch: 'arm64', osVersion: '15.0', translated: false, wasm: { threads: false } },
        },
      });
      const windows = await scenario({
        host: {
          indicators: {
            os: 'win32',
            arch: 'x64',
            osVersion: '10.0.26100',
            translated: false,
            wasm: { threads: false },
          },
        },
      });

      const blocked = await prepare(darwin.host);
      const refused = await prepare(windows.host);

      expect(blocked).toMatchObject({
        status: 'blocked',
        reason: 'unsupported-target',
        detail: { axis: 'os', nearest: linuxTarget },
      });
      expect(refused).toMatchObject({ status: 'blocked', reason: 'unsupported-target', detail: { axis: 'os' } });
      expect(refused.status === 'blocked' && refused.message).toContain('Native kernels do not run on Windows yet');
      expect(darwin.registry.calls).toEqual([]);
      await expect(darwin.host.describe()).resolves.toMatchObject([{ state: 'unsupported' }]);
    });
  });

  describe('garbage collection', () => {
    it('should keep linked closures, collect them once their host is gone and keep young orphan blobs', async () => {
      const { store, hostPath, host } = await scenario();
      const receipt = readyReceipt(await prepare(host));

      const live = await host.collectGarbage();
      expect(live).toMatchObject({ closures: [], blobs: [], links: [] });

      await rm(hostPath);
      const dryRun = await host.collectGarbage({ dryRun: true });
      expect(dryRun.closures).toHaveLength(1);
      expect(dryRun.links).toHaveLength(1);
      expect(await exists(receipt.root)).toBe(true);

      const collected = await host.collectGarbage();
      expect(collected.closures).toEqual(dryRun.closures);
      expect(collected.blobs).toEqual([]);
      expect(await exists(receipt.root)).toBe(false);

      const old = new Date(Date.now() - 48 * 60 * 60 * 1000);
      const blobs = await entriesOf(join(store, 'blobs', 'sha256'));
      await Promise.all(blobs.map(async (name) => utimes(join(store, 'blobs', 'sha256', name), old, old)));
      const aged = await host.collectGarbage();
      expect(aged.blobs.toSorted()).toEqual(blobs);
      expect(await entriesOf(join(store, 'blobs', 'sha256'))).toEqual([]);
    });
  });
});
