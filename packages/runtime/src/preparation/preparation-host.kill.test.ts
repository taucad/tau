/**
 * Kill-at-phase restart and cross-process contention (W2 oracle; spike S27).
 *
 * Child processes prepare one store through a throttled loopback `node:http` mirror. A child SIGKILLed in any phase
 * must leave nothing a fresh host reads as `ready`, only verified blobs and its own staging, which the next prepare
 * sweeps. Two children preparing an empty store at once must leave one closure and one blob per digest. A garbage
 * collection run from another process must keep every closure a live host links and every staging directory whose
 * owner is alive.
 */

/* oxlint-disable no-await-in-loop -- each child is started, observed and killed before the next */

import { spawn } from 'node:child_process';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { childPackage, childPayloadBytes, childPlugin } from '#preparation/preparation-child.fixture.js';
import { createPreparationHost } from '#preparation/preparation-host.js';
import type { GarbageReport } from '#preparation/preparation-host.types.js';
import { forbidGlobalFetch, linuxHost, temporaryDirectory } from '#preparation/preparation.fixture.js';

const childPath = join(dirname(fileURLToPath(import.meta.url)), 'preparation-child.fixture.ts');
const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const childTimeout = 120_000;
const chunkBytes = 64 * 1024;
const chunkDelay = 15;

type Mirror = { readonly url: string; readonly requests: Map<string, number>; readonly close: () => Promise<void> };

const cleanups: Array<() => Promise<void>> = [];
let loopbackFetch: typeof fetch = forbidGlobalFetch();

beforeAll(() => {
  // The setup file stubs the global fetch; the parent reaches only its own loopback mirror, through Node's fetch.
  vi.unstubAllGlobals();
  loopbackFetch = globalThis.fetch;
  vi.stubGlobal('fetch', forbidGlobalFetch());
});

afterAll(() => {
  vi.unstubAllGlobals();
});

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).toReversed()) {
    await cleanup();
  }
});

// A digest-addressed mirror that sends 64 KiB every 15 ms, so downloads overlap and phases last long enough.
const startMirror = async (): Promise<Mirror> => {
  const blobs = new Map(
    Object.values(childPayloadBytes()).map(
      (bytes) => [createHash('sha256').update(bytes).digest('hex'), bytes] as const,
    ),
  );
  const requests = new Map<string, number>();
  const server: Server = createServer((request, response) => {
    const hex = /^\/blobs\/sha256\/(?<hex>[\da-f]{64})$/u.exec(request.url ?? '')?.groups?.['hex'];
    const bytes = hex === undefined ? undefined : blobs.get(hex);
    requests.set(request.url ?? '', (requests.get(request.url ?? '') ?? 0) + 1);
    if (bytes === undefined) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { 'content-length': bytes.byteLength });
    let offset = 0;
    const send = (): void => {
      if (response.destroyed) {
        return;
      }
      if (offset >= bytes.byteLength) {
        response.end();
        return;
      }
      response.write(bytes.subarray(offset, offset + chunkBytes));
      offset += chunkBytes;
      setTimeout(send, chunkDelay);
    };
    send();
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}/`,
    requests,
    close: async () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(() => {
          resolve();
        });
      }),
  };
};

type Child = {
  readonly process: ChildProcessWithoutNullStreams;
  readonly lines: string[];
  /** Resolves with the first line that starts with `prefix`. */
  readonly waitFor: (prefix: string) => Promise<string>;
  readonly exited: Promise<void>;
};

const startChild = (arguments_: readonly string[]): Child => {
  const child = spawn(process.execPath, ['--import', '@oxc-node/core/register', childPath, ...arguments_], {
    cwd: packageRoot,
    // The loopback mirror must not go through a proxy (S7).
    // eslint-disable-next-line @typescript-eslint/naming-convention -- environment variable names
    env: { ...process.env, NO_PROXY: '127.0.0.1,localhost', no_proxy: '127.0.0.1,localhost' },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const lines: string[] = [];
  const waiters: Array<{
    readonly prefix: string;
    readonly resolve: (line: string) => void;
    readonly reject: (error: Error) => void;
  }> = [];
  let buffer = '';
  let errors = '';
  let closed = false;
  const exited = Promise.withResolvers<void>();
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk: string) => {
    errors += chunk;
  });
  child.stdout.on('data', (chunk: string) => {
    buffer += chunk;
    const parts = buffer.split('\n');
    buffer = parts.pop() ?? '';
    for (const line of parts) {
      lines.push(line);
      for (const waiter of waiters.filter(({ prefix }) => line.startsWith(prefix))) {
        waiter.resolve(line);
      }
    }
  });
  child.on('close', () => {
    closed = true;
    for (const waiter of waiters) {
      waiter.reject(
        new Error(`The child exited before printing ${waiter.prefix}. Output:\n${lines.join('\n')}\n${errors}`),
      );
    }
    exited.resolve();
  });
  return {
    process: child,
    lines,
    exited: exited.promise,
    waitFor: async (prefix) => {
      const seen = lines.find((line) => line.startsWith(prefix));
      if (seen !== undefined) {
        return seen;
      }
      if (closed) {
        throw new Error(`The child exited before printing ${prefix}. Output:\n${lines.join('\n')}\n${errors}`);
      }
      const waiter = Promise.withResolvers<string>();
      waiters.push({ prefix, resolve: waiter.resolve, reject: waiter.reject });
      return waiter.promise;
    },
  };
};

const resultOf = (line: string): unknown => JSON.parse(line.slice('RESULT '.length));

const listing = async (path: string): Promise<string[]> => {
  try {
    return await readdir(path);
  } catch {
    return [];
  }
};

const workspace = async (): Promise<{
  readonly store: string;
  readonly hostPath: (name: string) => Promise<string>;
}> => {
  const directory = await temporaryDirectory('tau-preparation-kill-');
  cleanups.push(directory.remove);
  return {
    store: join(directory.path, 'store'),
    hostPath: async (name) => {
      const path = join(directory.path, `${name}.mjs`);
      await writeFile(path, '// host installation\n');
      return path;
    },
  };
};

const parentHost = (store: string, hostPath: string, mirror: string) => {
  const host = createPreparationHost({
    plugins: [childPlugin().plugin],
    store,
    hostPath,
    indicators: linuxHost,
    tauVersion: '1.0.0',
    fetch: async (input, init) => {
      const url = input instanceof Request ? input.url : input instanceof URL ? input.href : input;
      return url.startsWith(mirror) ? loopbackFetch(input, init) : forbidGlobalFetch()(input, init);
    },
    mirror: { baseUrl: mirror, noFallback: true },
  });
  cleanups.push(async () => {
    host.dispose();
  });
  return host;
};

const expectVerifiedBlobs = async (store: string): Promise<string[]> => {
  const names = await listing(join(store, 'blobs', 'sha256'));
  for (const name of names) {
    const bytes = await readFile(join(store, 'blobs', 'sha256', name));
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(name);
  }
  return names;
};

describe('preparation across processes', () => {
  it.each(['downloading', 'verifying', 'extracting'] as const)(
    'should never report ready after a child is SIGKILLed while %s, and a fresh host should repair the store',
    async (phase) => {
      const mirror = await startMirror();
      cleanups.push(mirror.close);
      const { store, hostPath } = await workspace();
      const child = startChild(['prepare', store, await hostPath('child'), mirror.url, phase]);

      await child.waitFor(`FROZEN ${phase}`);
      child.process.kill('SIGKILL');
      await child.exited;

      const fresh = parentHost(store, await hostPath('fresh'), mirror.url);
      await expect(fresh.inspect({ package: childPackage })).resolves.toMatchObject({ state: { status: 'idle' } });
      expect(await listing(join(store, 'closures', 'sha256'))).toEqual([]);
      expect(await listing(join(store, 'tmp'))).toHaveLength(1);
      const kept = await expectVerifiedBlobs(store);

      const outcome = await fresh.prepare({ package: childPackage, signal: AbortSignal.timeout(childTimeout) });

      expect(outcome.status).toBe('ready');
      expect(await listing(join(store, 'tmp'))).toEqual([]);
      expect(await listing(join(store, 'closures', 'sha256'))).toHaveLength(1);
      // Blobs the killed child verified are reused; the rest are fetched once more.
      for (const name of kept) {
        expect(mirror.requests.get(`/blobs/sha256/${name}`)).toBe(1);
      }
    },
    childTimeout,
  );

  it(
    'should leave one closure and one blob per digest when two processes prepare an empty store at once',
    async () => {
      const mirror = await startMirror();
      cleanups.push(mirror.close);
      const { store, hostPath } = await workspace();
      const first = startChild(['prepare', store, await hostPath('first'), mirror.url]);
      const second = startChild(['prepare', store, await hostPath('second'), mirror.url]);

      const [left, right] = await Promise.all([first.waitFor('RESULT '), second.waitFor('RESULT ')]);
      await Promise.all([first.exited, second.exited]);

      expect(resultOf(left)).toEqual(resultOf(right));
      expect(resultOf(left)).toMatchObject({ status: 'ready' });
      expect(await listing(join(store, 'closures', 'sha256'))).toHaveLength(1);
      const blobs = await expectVerifiedBlobs(store);
      expect(blobs.toSorted()).toEqual(
        Object.values(childPayloadBytes())
          .map((bytes) => createHash('sha256').update(bytes).digest('hex'))
          .toSorted(),
      );
      expect(await listing(join(store, 'tmp'))).toEqual([]);
      expect(await listing(join(store, 'links'))).toHaveLength(2);
    },
    childTimeout,
  );

  it(
    'should keep linked closures and live staging when another process collects garbage, then collect what died',
    async () => {
      const mirror = await startMirror();
      cleanups.push(mirror.close);
      const { store, hostPath } = await workspace();
      const user = parentHost(store, await hostPath('user'), mirror.url);
      const prepared = await user.prepare({ package: childPackage, signal: AbortSignal.timeout(childTimeout) });
      expect(prepared.status).toBe('ready');
      const root = prepared.status === 'ready' ? (prepared.receipts['engine']?.root ?? '') : '';

      // A second installation is frozen mid-download with its staging in tmp/.
      const { store: frozenStore } = await workspace();
      const frozen = startChild(['prepare', frozenStore, await hostPath('frozen'), mirror.url, 'downloading']);
      await frozen.waitFor('FROZEN downloading');
      const gcWhileFrozen = startChild(['gc', frozenStore, await hostPath('collector')]);
      const whileFrozen = resultOf(await gcWhileFrozen.waitFor('RESULT ')) as GarbageReport;
      expect(whileFrozen.staging).toEqual([]);
      expect(await listing(join(frozenStore, 'tmp'))).toHaveLength(1);
      frozen.process.kill('SIGKILL');
      await frozen.exited;
      const gcAfterKill = startChild(['gc', frozenStore, await hostPath('collector')]);
      expect((resultOf(await gcAfterKill.waitFor('RESULT ')) as GarbageReport).staging).toHaveLength(1);
      expect(await listing(join(frozenStore, 'tmp'))).toEqual([]);

      // The closure `user` links survives a collection run by another process, and stays readable.
      const collector = startChild(['gc', store, await hostPath('collector')]);
      const report = resultOf(await collector.waitFor('RESULT ')) as GarbageReport;
      expect(report.closures).toEqual([]);
      expect(await readFile(join(root, 'worker', 'worker.py'), 'utf8')).toBe('print("ready")\n');
      await expect(user.inspect({ package: childPackage })).resolves.toMatchObject({ state: { status: 'ready' } });

      // A new session over the same store is ready with no download.
      const requests = [...mirror.requests.values()].reduce((sum, count) => sum + count, 0);
      const session = parentHost(store, await hostPath('user'), mirror.url);
      await expect(
        session.prepare({ package: childPackage, signal: AbortSignal.timeout(childTimeout) }),
      ).resolves.toMatchObject({
        status: 'ready',
      });
      expect([...mirror.requests.values()].reduce((sum, count) => sum + count, 0)).toBe(requests);
    },
    childTimeout,
  );
});
