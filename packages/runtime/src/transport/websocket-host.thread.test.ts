/**
 * `webSocketHost` thread-per-connection mode: each accepted connection gets its
 * own worker thread (its own realm), the connection's runtime socket is spliced
 * to that thread, and the thread is terminated when the connection goes away.
 *
 * The thread runs `websocket-host.thread.fixture.ts` under tsx through the
 * host's `workerCtor` seam; the fixture kernel reports a per-realm token, so
 * realm identity is observable without replicad (the runtime cannot depend on it).
 * The shared `describe.each` block runs the same client-visible behaviour against
 * the in-realm worker factory and the thread mode.
 */

import { once } from 'node:events';
import { access, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Worker as NodeWorker } from 'node:worker_threads';
import type { WorkerOptions } from 'node:worker_threads';
import { WebSocket } from 'ws';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createSqliteComputeEngine, fromSqlite } from '#cache/sqlite-compute-engine.js';
import { createRuntimeClient } from '#client/runtime-document-client-core.js';
import { fromNodeFs } from '#filesystem/from-node-fs.js';
import { fromMemoryFs } from '#filesystem/runtime-filesystem.js';
import type { RuntimeFileSystem } from '#filesystem/runtime-filesystem.js';
import type { ComputeBinding } from '#types/runtime-compute.types.js';
import { webSocketTransport } from '#transport/web-socket-transport.js';
import { webSocketHost } from '#transport/websocket-host.js';
import type { WebSocketHostHandle, WebSocketHostOptions } from '#transport/websocket-host.js';
import { threadFixtureRuntime } from '#transport/websocket-host.thread.fixture-runtime.js';
import type { ThreadFixtureReport } from '#transport/websocket-host.thread.fixture-runtime.js';
import { createRuntimeWorker } from '#worker/create-runtime-worker.js';

const entryUrl = new URL('websocket-host.thread.fixture.ts', import.meta.url);

/** One spawned connection thread and the moment it exited. */
type SpawnedThread = { readonly worker: NodeWorker; exitedAt?: number; readonly exited: Promise<number> };

let host: WebSocketHostHandle | undefined;
const threads: SpawnedThread[] = [];
const disposers: Array<() => Promise<void>> = [];

/** Runs the `.ts` entry under tsx, and records every thread the host spawns. */
class TsxWorker extends NodeWorker {
  public constructor(url: string | URL, options?: WorkerOptions) {
    super(url, { ...options, execArgv: ['--import', 'tsx'] });
    const thread: SpawnedThread = {
      worker: this,
      exited: once(this, 'exit').then(([code]: unknown[]) => {
        thread.exitedAt = performance.now();
        return code as number;
      }),
    };
    threads.push(thread);
  }
}

afterEach(async () => {
  await host?.close();
  host = undefined;
  await Promise.all(disposers.splice(0).map(async (dispose) => dispose()));
  await Promise.all(threads.splice(0).map(async (thread) => thread.worker.terminate()));
});

const makeRoot = async (files: Readonly<Record<string, string>>): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), 'tau-ws-thread-'));
  disposers.push(async () => rm(root, { recursive: true, force: true }));
  await Promise.all(Object.entries(files).map(async ([path, content]) => writeFile(join(root, path), content)));
  return root;
};

const modes = {
  'in-realm': (): WebSocketHostOptions['worker'] => () => createRuntimeWorker({ runtime: threadFixtureRuntime }),
  thread: (): WebSocketHostOptions['worker'] => ({
    url: entryUrl,
    workerCtor: TsxWorker,
    workerData: { label: 'connection-thread' },
  }),
} as const;

type Mode = keyof typeof modes;

const startHost = async (mode: Mode, options: Omit<WebSocketHostOptions, 'worker'> = {}): Promise<string> => {
  host = webSocketHost({ worker: modes[mode](), ...options });
  await host.ready;
  return `ws://127.0.0.1:${String(host.address().port)}`;
};

type FixtureClient = ReturnType<typeof createClient>;

const createClient = (
  url: string,
  options: { readonly fileSystem?: RuntimeFileSystem; readonly compute?: ComputeBinding } = {},
) => {
  const client = createRuntimeClient({ transport: webSocketTransport({ url, ...options }) });
  disposers.push(async () => {
    client.terminate();
  });
  return client;
};

/** Render one fixture file and parse the kernel's report. */
const renderReport = async (client: FixtureClient, path: string): Promise<ThreadFixtureReport> => {
  const document = client.open({ source: { path }, watch: false });
  const view = document.view('model');
  try {
    const outcome = await view.rendering();
    if (outcome.superseded || !outcome.rendering.success) {
      throw new Error(`Expected one successful rendering of ${path}: ${JSON.stringify(outcome)}`);
    }
    const { content } = outcome.rendering.artifact;
    return JSON.parse(typeof content === 'string' ? content : new TextDecoder().decode(content)) as ThreadFixtureReport;
  } finally {
    view.close();
    document.close();
  }
};

const fileExists = async (path: string): Promise<boolean> => {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
};

describe.each(Object.keys(modes) as Mode[])('webSocketHost client behaviour (%s)', { concurrent: false }, (mode) => {
  it('should serve one kernel worker per connection so two clients render concurrently', async () => {
    const url = await startHost(mode, { fileSystem: fromNodeFs(await makeRoot({ 'main.fixture': 'box' })) });
    const first = createClient(url);
    const second = createClient(url);

    const reports = await Promise.all([renderReport(first, 'main.fixture'), renderReport(second, 'main.fixture')]);

    expect(reports.map((report) => report.source)).toEqual(['box', 'box']);
    await Promise.all([first.shutdown(), second.shutdown()]);
  });

  it('should render from the filesystem a client serves over the /fs socket', async () => {
    const url = await startHost(mode);
    const client = createClient(url, { fileSystem: fromMemoryFs({ 'main.fixture': 'from-client' }) });

    await expect(renderReport(client, 'main.fixture')).resolves.toMatchObject({ source: 'from-client' });
    await client.shutdown();
  });

  it('should close an unpaired /runtime socket with 1008 without starting a worker', async () => {
    const url = await startHost(mode, { pairingTimeout: 300 });
    const socket = new WebSocket(`${url}/runtime?session=never-paired`);
    disposers.push(async () => {
      socket.terminate();
    });

    const [code, reason] = (await once(socket, 'close')) as [number, Uint8Array<ArrayBuffer>];

    expect(code).toBe(1008);
    expect(new TextDecoder().decode(reason)).toBe('no /fs socket paired for this session');
    expect(threads).toHaveLength(0);
  });

  it('should settle every client with host-exit and resolve close() only after teardown', async () => {
    const url = await startHost(mode, { fileSystem: fromNodeFs(await makeRoot({ 'main.fixture': 'box' })) });
    const handle = host;
    if (!handle) {
      throw new Error('host was not started');
    }
    const first = webSocketTransport({ url }).materialize();
    const second = webSocketTransport({ url }).materialize();
    const [firstReady, secondReady] = await Promise.all([first.open(), second.open()]);
    await Promise.all([firstReady.channel.ready, secondReady.channel.ready]);

    host = undefined;
    await handle.close();

    expect(threads.every((thread) => thread.exitedAt !== undefined)).toBe(true);
    await expect(first.closed).resolves.toEqual({ cause: 'host-exit', phase: 'session' });
    await expect(second.closed).resolves.toEqual({ cause: 'host-exit', phase: 'session' });
  });

  it('should reuse a durable computation across connections through the paired /compute socket', async () => {
    const url = await startHost(mode, {
      fileSystem: fromNodeFs(await makeRoot({ 'main.fixture': 'compute' })),
      allowPrivateComputePairing: true,
    });
    const engine = createSqliteComputeEngine({ directory: await makeRoot({}) });
    disposers.push(async () => engine.dispose());
    const compute: ComputeBinding = {
      mode: 'durable',
      store: fromSqlite({ store: engine, workspace: 'thread-fixture' }),
    };

    const first = createClient(url, { compute });
    await expect(renderReport(first, 'main.fixture')).resolves.toMatchObject({
      compute: { source: 'computed', publication: 'stored' },
    });
    await first.shutdown();

    const second = createClient(url, { compute });
    await expect(renderReport(second, 'main.fixture')).resolves.toMatchObject({ compute: { source: 'cache' } });
    await second.shutdown();
  });
});

describe('webSocketHost thread per connection', { concurrent: false }, () => {
  it('should give each connection its own realm and hand it the configured workerData', async () => {
    const url = await startHost('thread', { fileSystem: fromNodeFs(await makeRoot({ 'main.fixture': 'box' })) });
    const first = createClient(url);
    const second = createClient(url);

    const [one, two] = await Promise.all([renderReport(first, 'main.fixture'), renderReport(second, 'main.fixture')]);

    expect(threads).toHaveLength(2);
    expect(one.token).not.toBe(two.token);
    expect(one.workerData).toMatchObject({ label: 'connection-thread' });
    expect(two.workerData).toMatchObject({ label: 'connection-thread' });
    await Promise.all([first.shutdown(), second.shutdown()]);
  });

  it.each([
    ['an inline host filesystem', 'host'],
    ['the client-served /fs proxy', 'client'],
  ] as const)('should reach %s from the connection thread', async (_name, owner) => {
    const url =
      owner === 'host'
        ? await startHost('thread', { fileSystem: fromNodeFs(await makeRoot({ 'main.fixture': 'from-host' })) })
        : await startHost('thread');
    const client =
      owner === 'host'
        ? createClient(url)
        : createClient(url, { fileSystem: fromMemoryFs({ 'main.fixture': 'from-client' }) });

    const report = await renderReport(client, 'main.fixture');

    expect(report.source).toBe(owner === 'host' ? 'from-host' : 'from-client');
    expect(threads).toHaveLength(1);
    await client.shutdown();
  });

  it('should terminate a hung connection thread after its socket closes while another connection keeps serving', async () => {
    const url = await startHost('thread', {
      fileSystem: fromNodeFs(await makeRoot({ 'main.fixture': 'box', 'loop.fixture': 'loop' })),
    });
    const hung = createClient(url);
    const hungDocument = hung.open({ source: { path: 'loop.fixture' }, watch: false });
    hungDocument.evaluation().catch(() => undefined);
    await vi.waitFor(
      () => {
        expect(threads).toHaveLength(1);
      },
      { timeout: 10_000 },
    );
    const [hungThread] = threads;
    /* Give the hung model time to enter its loop. */
    await new Promise((resolve) => {
      setTimeout(resolve, 1000);
    });

    const healthy = createClient(url);
    await expect(renderReport(healthy, 'main.fixture')).resolves.toMatchObject({ source: 'box' });

    const closedAt = performance.now();
    hung.terminate();
    await hungThread?.exited;

    expect((hungThread?.exitedAt ?? Number.POSITIVE_INFINITY) - closedAt).toBeLessThan(3000);
    await expect(renderReport(healthy, 'main.fixture')).resolves.toMatchObject({ source: 'box' });
    await healthy.shutdown();
  }, 30_000);

  it('should cancel in-thread work when the client aborts over the wire', async () => {
    const root = await makeRoot({ 'main.fixture': 'box', 'wait.fixture': 'wait' });
    const url = await startHost('thread', { fileSystem: fromNodeFs(root) });
    const client = createClient(url);
    const before = await renderReport(client, 'main.fixture');
    const waiting = client.open({ source: { path: 'wait.fixture' }, watch: false });
    waiting.evaluation().catch(() => undefined);
    await vi.waitFor(
      async () => {
        expect(await fileExists(join(root, 'waiting.txt'))).toBe(true);
      },
      { timeout: 10_000 },
    );

    waiting.close();

    await vi.waitFor(
      async () => {
        expect(await fileExists(join(root, 'aborted.txt'))).toBe(true);
      },
      { timeout: 10_000 },
    );
    const after = await renderReport(client, 'main.fixture');
    expect(after.token).toBe(before.token);
    await client.shutdown();
  }, 30_000);

  it('should close the runtime socket with 1011 when the connection thread exits', async () => {
    const url = await startHost('thread', { fileSystem: fromNodeFs(await makeRoot({ 'main.fixture': 'box' })) });
    const transport = webSocketTransport({ url }).materialize();
    const ready = await transport.open();
    await ready.channel.ready;
    const [thread] = threads;

    await thread?.worker.terminate();

    const closed = await transport.closed;
    expect(closed.cause).toBe('wire-failure');
    expect(closed.cause === 'wire-failure' ? closed.error.message : '').toContain('1011');
  });
});
