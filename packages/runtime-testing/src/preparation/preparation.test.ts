// The harness proves itself against the shipping preparation host: a fixture closure prepares from the fake registry,
// from a seed with no request, and from a loopback mirror over that seed under no-fallback; the tripwire fails a
// stray global fetch; and golden comparison distinguishes a match from drift.
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { PreparationError, createPreparationHost } from '@taucad/runtime/preparation/node';
import type {
  ClosureReceipt,
  CreatePreparationHostOptions,
  HostIndicators,
  PreparationHost,
} from '@taucad/runtime/preparation/node';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  appendGoldenSummary,
  compareWithGolden,
  createFakeRegistry,
  createFixtureClosure,
  goldenSummaryRow,
  installFetchTripwire,
  readGoldenReceipts,
  sha256Hex,
  startPayloadMirror,
  tarGz,
  utf8,
  wheel,
} from '#preparation/index.js';
import type { FixtureClosure, PayloadMirror } from '#preparation/index.js';

const linuxHost: HostIndicators = {
  os: 'linux',
  arch: 'x64',
  libc: 'glibc',
  libcVersion: '2.39',
  translated: false,
  wasm: { threads: false },
};

const sitePackages = 'python/lib/python3.13/site-packages';

const closureOf = async (): Promise<FixtureClosure> =>
  createFixtureClosure({
    payloads: [
      {
        name: 'python',
        bytes: tarGz(
          { name: 'python/bin/python3.13', data: 'interpreter', mode: 0o755 },
          { name: 'python/bin/python3', linkname: 'python3.13', mode: 0o777 },
        ),
        format: 'tar.gz',
        destination: 'python',
        stripComponents: 1,
      },
      {
        name: 'demo',
        bytes: wheel('demo', { 'demo/__init__.py': 'VALUE = 1\n' }),
        format: 'wheel',
        destination: sitePackages,
      },
      // A sha512 pin, as Microsoft publishes: the seed reaches it only through `tau-seed.json`.
      { name: 'worker.py', bytes: utf8('print("ready")\n'), format: 'raw', destination: 'worker', algorithm: 'sha512' },
    ],
  });

let scratch = '';
let disposers: Array<() => Promise<void> | void> = [];

beforeEach(async () => {
  installFetchTripwire();
  scratch = await mkdtemp(join(tmpdir(), 'tau-runtime-testing-preparation-'));
});

afterEach(async () => {
  for (const dispose of disposers.toReversed()) {
    // oxlint-disable-next-line no-await-in-loop -- disposers run in reverse order
    await dispose();
  }
  disposers = [];
  vi.unstubAllGlobals();
  await rm(scratch, { recursive: true, force: true });
});

const hostOf = (closure: FixtureClosure, options: Partial<CreatePreparationHostOptions>): PreparationHost => {
  const host = createPreparationHost({
    plugins: [closure.plugin()],
    store: join(scratch, 'store'),
    indicators: linuxHost,
    ...options,
  });
  disposers.push(() => {
    host.dispose();
  });
  return host;
};

const prepared = async (host: PreparationHost, closure: FixtureClosure, offline = false): Promise<ClosureReceipt> => {
  const outcome = await host.prepare({ package: closure.package, offline, signal: AbortSignal.timeout(30_000) });
  if (outcome.status !== 'ready') {
    throw new Error(`Expected ready, got ${JSON.stringify(outcome)}`);
  }
  return outcome.receipts[closure.dependency]!;
};

describe('createFixtureClosure', () => {
  it('should pin every payload by its real digest for every native target', async () => {
    const closure = await closureOf();

    expect(Object.keys(closure.manifest)).toEqual(['schemaVersion', 'kernels', 'dependencies']);
    expect(closure.deployment.dependencies['engine']?.map(({ target }) => target)).toHaveLength(4);
    expect(closure.payloads.map(({ payload }) => payload.integrity.split('-')[0])).toEqual([
      'sha256',
      'sha256',
      'sha512',
    ]);
    expect(closure.byteLength).toBe(closure.payloads.reduce((sum, { bytes }) => sum + bytes.byteLength, 0));
    expect([...closure.routes.keys()]).toEqual([
      'https://registry.example/payloads/python',
      'https://registry.example/payloads/demo',
      'https://registry.example/payloads/worker.py',
    ]);
  });

  it('should write the manifest a plugin package ships', async () => {
    const closure = await closureOf();
    const path = join(scratch, 'plugin', 'tau-plugin.json');

    await closure.writeManifest(path);

    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual(closure.manifest);
  });

  it('should honour a custom package, dependency, kernel, target and origin', async () => {
    const closure = await createFixtureClosure({
      package: '@taucad/picogk-fixture',
      dependency: 'runtime',
      kernel: { name: 'picogk', extensions: ['cs'] },
      targets: [{ runtime: 'native', os: 'darwin', arch: 'arm64', minimumOsVersion: '14.0' }],
      payloads: [
        {
          name: 'layer',
          bytes: utf8('layer'),
          format: 'raw',
          destination: 'tau-worker',
          urls: ['https://cdn.example/layer', 'https://mirror.example/layer'],
        },
      ],
    });

    expect(closure.manifest).toMatchObject({
      kernels: { picogk: { requires: ['runtime'], extensions: ['cs'] } },
      dependencies: { runtime: [{ target: { os: 'darwin', minimumOsVersion: '14.0' } }] },
    });
    expect([...closure.routes.keys()]).toEqual(['https://cdn.example/layer']);
  });
});

describe('preparing a fixture closure', () => {
  it('should prepare from the fake registry once and reuse the store with no request', async () => {
    const closure = await closureOf();
    const registry = createFakeRegistry(closure.routes);
    const host = hostOf(closure, { fetch: registry.fetch });

    const receipt = await prepared(host, closure);
    const calls = registry.calls.length;
    await prepared(host, closure);

    expect(receipt.closureIntegrity).toBe(closure.closureIntegrity);
    expect(receipt.files.map(({ path }) => path)).toEqual(
      expect.arrayContaining(['python/bin/python3', `${sitePackages}/demo/__init__.py`, 'worker/worker.py']),
    );
    expect(calls).toBe(3);
    expect(registry.calls).toHaveLength(3);
  });

  it('should seal one tree in two stores, so a golden entry compares by treeIntegrity', async () => {
    const closure = await closureOf();
    const registry = createFakeRegistry(closure.routes);
    const first = await prepared(hostOf(closure, { fetch: registry.fetch }), closure);
    const second = await prepared(hostOf(closure, { fetch: registry.fetch, store: join(scratch, 'other') }), closure);
    const goldenPath = join(scratch, 'tau-plugin.golden.json');
    await writeFile(
      goldenPath,
      JSON.stringify({
        'linux-x64-glibc': {
          closureIntegrity: first.closureIntegrity,
          treeIntegrity: first.treeIntegrity,
          fileCount: first.files.length,
        },
        'darwin-arm64': { closureIntegrity: first.closureIntegrity, treeIntegrity: 'sha256-drifted' },
        'darwin-x64': { closureIntegrity: first.closureIntegrity, treeIntegrity: first.treeIntegrity },
      }),
    );
    const golden = await readGoldenReceipts(goldenPath);

    expect(second.treeIntegrity).toBe(first.treeIntegrity);
    expect(compareWithGolden(second, golden, 'linux-x64-glibc').status).toBe('match');
    expect(compareWithGolden(second, golden, 'darwin-arm64')).toMatchObject({
      status: 'mismatch',
      expected: { treeIntegrity: 'sha256-drifted' },
    });
    expect(compareWithGolden(second, golden, 'darwin-x64').status).toBe('match');
    expect(compareWithGolden(second, golden, 'linux-arm64-glibc').status).toBe('no-golden');
    const summary = join(scratch, 'summary.md');
    // Built by assignment, as environment keys are not camelCase.
    const environment: Record<string, string> = {};
    environment['TAU_GOLDEN_SUMMARY_FILE'] = summary;
    await appendGoldenSummary(
      '@taucad/fixture engine',
      compareWithGolden(second, golden, 'linux-x64-glibc'),
      environment,
    );
    await appendGoldenSummary('@taucad/fixture engine', compareWithGolden(second, golden, 'linux-arm64-glibc'), {});
    expect(await readFile(summary, 'utf8')).toBe(
      `${goldenSummaryRow('@taucad/fixture engine', compareWithGolden(second, golden, 'linux-x64-glibc'))}\n`,
    );
    expect(goldenSummaryRow('@taucad/fixture engine', compareWithGolden(second, golden, 'linux-arm64-glibc'))).toBe(
      `| @taucad/fixture engine | linux-arm64-glibc | \`${first.treeIntegrity}\` | \`none\` | ${String(
        first.files.length,
      )} | no-golden |`,
    );
  });

  it('should prepare offline from a seed directory with no request, including a sha512 pin', async () => {
    const closure = await closureOf();
    const registry = createFakeRegistry(closure.routes);
    const seed = join(scratch, 'seed');
    await closure.writeSeed(seed);

    const receipt = await prepared(hostOf(closure, { fetch: registry.fetch, seed }), closure, true);

    expect(receipt.closureIntegrity).toBe(closure.closureIntegrity);
    expect(registry.calls).toEqual([]);
    expect(JSON.parse(await readFile(join(seed, 'tau-seed.json'), 'utf8'))).toEqual({
      closures: [
        {
          payloads: [
            { integrity: closure.payloads[2]!.payload.integrity, blob: `blobs/sha256/${closure.payloads[2]!.sha256}` },
          ],
        },
      ],
    });
  });

  it('should refuse a registry miss with DOWNLOAD_FAILED naming the URL', async () => {
    const closure = await closureOf();
    const registry = createFakeRegistry(closure.routes);
    registry.route('https://registry.example/payloads/python', { status: 503 });

    const failure = hostOf(closure, { fetch: registry.fetch }).prepare({
      package: closure.package,
      signal: AbortSignal.timeout(30_000),
    });

    await expect(failure).rejects.toBeInstanceOf(PreparationError);
    await expect(failure).rejects.toMatchObject({
      code: 'DOWNLOAD_FAILED',
      message: expect.stringContaining('https://registry.example/payloads/python') as unknown,
    });
  });
});

describe('createFakeRegistry', () => {
  it('should hold a response, throttle its body and stop the stream when the caller aborts', async () => {
    const registry = createFakeRegistry();
    const bytes = new Uint8Array(200 * 1024);
    const release = Promise.withResolvers<void>();
    registry.route('https://registry.example/slow', { bytes, hold: release.promise, chunkDelay: 5 });
    registry.route('https://registry.example/held', { hold: Promise.resolve(), status: 410 });

    const pending = registry.fetch('https://registry.example/slow');
    release.resolve();
    const response = await pending;
    const whole = new Uint8Array(await response.arrayBuffer());
    const controller = new AbortController();
    const partial = await registry.fetch(new URL('https://registry.example/slow'), { signal: controller.signal });
    const reader = partial.body!.getReader();
    await reader.read();
    controller.abort(new Error('caller left'));

    expect(whole.byteLength).toBe(bytes.byteLength);
    await expect(reader.read()).rejects.toThrow('caller left');
    const held = await registry.fetch(new Request('https://registry.example/held'));
    expect(held.status).toBe(410);
    expect(registry.count('https://registry.example/slow')).toBe(2);
  });

  it('should reject a request whose signal is already aborted', async () => {
    const registry = createFakeRegistry();
    const controller = new AbortController();
    controller.abort(new Error('gone'));
    const held = new AbortController();
    registry.route('https://registry.example/held', { hold: Promise.resolve(), bytes: utf8('x') });
    const pending = registry.fetch('https://registry.example/held', { signal: held.signal });
    held.abort(new Error('left while held'));

    await expect(registry.fetch('https://registry.example/a', { signal: controller.signal })).rejects.toThrow('gone');
    await expect(pending).rejects.toThrow('left while held');
  });
});

describe('startPayloadMirror', () => {
  const mirrorOf = async (closure: FixtureClosure): Promise<PayloadMirror> => {
    const seed = join(scratch, 'mirror-seed');
    await closure.writeSeed(seed);
    const mirror = await startPayloadMirror(seed);
    disposers.push(async () => mirror.close());
    return mirror;
  };

  it('should serve every blob once under no-fallback while the canonical registry sees nothing', async () => {
    vi.unstubAllGlobals();
    const closure = await closureOf();
    const mirror = await mirrorOf(closure);
    const registry = createFakeRegistry(closure.routes);
    const transport = globalThis.fetch;
    const fetchVia: typeof fetch = async (input, init) =>
      new Request(input).url.startsWith(mirror.url) ? transport(input, init) : registry.fetch(input, init);

    const receipt = await prepared(
      hostOf(closure, { fetch: fetchVia, mirror: { baseUrl: mirror.url, noFallback: true } }),
      closure,
    );

    expect(receipt.closureIntegrity).toBe(closure.closureIntegrity);
    expect(mirror.requests.filter(({ path }) => path.startsWith('blobs/'))).toEqual(
      closure.payloads.map(({ sha256 }) => ({ method: 'GET', path: `blobs/sha256/${sha256}`, status: 200 })),
    );
    expect(registry.calls).toEqual([]);
  });

  it('should answer an override, a missing blob and an unserved path, and refuse a loopback redirect', async () => {
    vi.unstubAllGlobals();
    const closure = await closureOf();
    const mirror = await mirrorOf(closure);
    const python = `blobs/sha256/${closure.payloads[0]!.sha256}`;
    mirror.override(python, { redirect: `${mirror.url}blobs/sha256/${'0'.repeat(64)}` });
    mirror.override('tau-seed.json', { status: 500 });

    const head = await fetch(`${mirror.url}blobs/sha256/${closure.payloads[1]!.sha256}`, { method: 'HEAD' });
    const missing = await fetch(`${mirror.url}blobs/sha256/${sha256Hex(utf8('absent'))}`);
    const unserved = await fetch(`${mirror.url}../etc/passwd`);
    const index = await fetch(`${mirror.url}tau-seed.json`);
    const failure = hostOf(closure, { mirror: { baseUrl: mirror.url, noFallback: true } }).prepare({
      package: closure.package,
      signal: AbortSignal.timeout(30_000),
    });

    expect(head.headers.get('content-length')).toBe(String(closure.payloads[1]!.bytes.byteLength));
    expect([missing.status, unserved.status, index.status]).toEqual([404, 404, 500]);
    await expect(failure).rejects.toMatchObject({ code: 'DOWNLOAD_FAILED' });
    expect(mirror.requests).toContainEqual({ method: 'GET', path: python, status: 302 });
    await mirror.close();
    await mirror[Symbol.asyncDispose]();
  });
});

describe('installFetchTripwire', () => {
  it('should fail a global fetch, naming the URL, until restored', async () => {
    vi.unstubAllGlobals();
    const original = globalThis.fetch;
    const restore = installFetchTripwire();

    await expect(fetch('https://pypi.org/simple/')).rejects.toThrow(
      'The global fetch was called for https://pypi.org/simple/',
    );
    await expect(fetch(new URL('https://example.com/a'))).rejects.toThrow('https://example.com/a');
    await expect(fetch(new Request('https://example.com/b'))).rejects.toThrow('https://example.com/b');
    restore();
    expect(globalThis.fetch).toBe(original);
  });
});

describe('readGoldenReceipts', () => {
  it('should refuse a file that is not an object of entries', async () => {
    const path = join(scratch, 'golden.json');
    await writeFile(path, '[]');
    await expect(readGoldenReceipts(path)).rejects.toThrow('is not an object of golden receipts');
    await writeFile(
      path,
      JSON.stringify({ 'darwin-arm64': { closureIntegrity: 'sha256-a', treeIntegrity: 'sha256-b', fileCount: 1.5 } }),
    );
    await expect(readGoldenReceipts(path)).rejects.toThrow('entry darwin-arm64 needs closureIntegrity');
  });
});
