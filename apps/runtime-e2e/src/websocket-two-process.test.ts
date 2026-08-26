/**
 * Two-process UI ↔ API topology suite for the WebSocket transport (WS11b,
 * blueprint scenarios E1–E8).
 *
 * The "API server" is a real child process (`src/fixtures/websocket-api-server.ts`
 * under `node --import tsx`) hosting a kernel behind `webSocketHost`; the "UI"
 * is this vitest process driving `createRuntimeClient` over the browser-safe
 * `@taucad/runtime/transport/websocket` subpath. Geometry, watch events, aborts
 * and failures all cross real localhost sockets.
 *
 * Every `it` owns its own server and its own `mkdtemp` roots, ports are
 * ephemeral (reported back over IPC), and the child's stdout/stderr is folded
 * into any failure message.
 */

import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';

import { decode } from '@msgpack/msgpack';
import { WebSocket } from 'ws';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createRuntimeClient } from '@taucad/runtime';
import { fromNodeFs } from '@taucad/runtime/filesystem/node';
import { createGeometryTestHelpers, extractGltfFromExportResult } from '@taucad/runtime-testing';
import { inProcessTransport } from '@taucad/runtime/transport/in-process';
import { webSocketTransport } from '@taucad/runtime/transport/websocket';
import type { WebSocketTransportOptions } from '@taucad/runtime/transport/websocket';
import type { WorkerState } from '@taucad/runtime/types';

import { boxSource, webSocketRuntime } from '#fixtures/websocket-runtime.js';

const repoRoot = resolve(import.meta.dirname, '../../..');
const fixtureEntry = resolve(import.meta.dirname, 'fixtures/websocket-api-server.ts');

/** The autonomous file-change debounce is 200 ms; 750 ms proves whether a render was scheduled. */
const debounceSettlingWindow = 750;

/**
 * Bounding box of `makeBaseBox(10, height, 30)` as the render result reports
 * it: metres, and Y-up (the CAD Z axis becomes glTF Y).
 *
 * @param height - The `height` parameter, in millimetres.
 * @returns Expected `[x, y, z]` extent.
 */
const boxSize = (height: number): [number, number, number] => [0.01, 0.03, height / 1000];

/** Tight enough to tell two different boxes apart (the helper's default is 0.1 m). */
const boxTolerance = 0.0001;

/** 600 fused unit boxes — measured at ~6.6 s on this machine, so E5's kill always lands mid-render. */
const slowSource = [
  "import { makeBaseBox } from 'replicad';",
  '',
  'export default function main() {',
  '  let shape = makeBaseBox(1, 1, 1);',
  '  for (let index = 1; index < 600; index++) {',
  '    shape = shape.fuse(makeBaseBox(1, 1, 1).translate([index * 0.6, 0, 0]));',
  '  }',
  '  return shape;',
  '}',
  '',
].join('\n');

const geometryHelpers = createGeometryTestHelpers();

const hostLocalDescriptor = {
  id: 'web-socket',
  wire: 'remote',
  memory: { geometryDelivery: 'copy', abortSignal: 'wire-notify' },
  fileSystem: 'host-local',
} as const;

/* ---------------------------------------------------------------- *
 * Harness                                                           *
 * ---------------------------------------------------------------- */

const children: ChildProcess[] = [];
const roots: string[] = [];

/** SIGTERM then SIGKILL to the whole process group (`server-modes.spec.ts:12-44`). */
const stopProcess = async (child: ChildProcess): Promise<void> => {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }
  const exited = (async (): Promise<boolean> => {
    await once(child, 'exit');
    return true;
  })();
  if (!signalProcess(child, 'SIGTERM')) {
    return;
  }
  const stopped = await Promise.race([exited, delay(5000, false)]);
  if (!stopped && signalProcess(child, 'SIGKILL')) {
    await Promise.race([exited, delay(5000, false)]);
  }
};

/**
 * Signal the child's whole process group.
 *
 * @param child - Spawned API server.
 * @param signal - Signal to deliver.
 * @returns `false` when the group is already gone.
 */
const signalProcess = (child: ChildProcess, signal: NodeJS.Signals): boolean => {
  try {
    if (process.platform !== 'win32' && child.pid !== undefined) {
      process.kill(-child.pid, signal);
    } else {
      child.kill(signal);
    }
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH') {
      throw error;
    }
    return false;
  }
};

type ApiServer = {
  /** Base URL the transport dials; the transport appends `/runtime` and `/fs`. */
  readonly url: string;
  readonly child: ChildProcess;
  /** Interleaved child stdout/stderr, for failure messages. */
  readonly logs: string[];
};

type ApiServerOptions = {
  /** `host-local` (W1) gives the API its own filesystem; `bridged` (W2) makes the UI the authority. */
  readonly mode: 'host-local' | 'bridged';
  /** Project root for `host-local`. */
  readonly serverRoot?: string;
  /** Comma-separated origin allowlist; the default `''` denies every browser. */
  readonly allowedOrigins?: string;
};

/** Boot one API-server child and wait for its ephemeral port, racing an early exit. */
const startApiServer = async (options: ApiServerOptions): Promise<ApiServer> => {
  /* eslint-disable @typescript-eslint/naming-convention -- environment variables are SCREAMING_SNAKE. */
  const environment = {
    ...process.env,
    PORT: '0',
    TAU_WS_MODE: options.mode,
    TAU_SERVER_ROOT: options.serverRoot ?? process.cwd(),
    TAU_ALLOWED_ORIGINS: options.allowedOrigins ?? '',
  };
  /* eslint-enable @typescript-eslint/naming-convention -- restore project naming checks. */
  const child = spawn(process.execPath, ['--import', 'tsx', fixtureEntry], {
    cwd: repoRoot,
    detached: process.platform !== 'win32',
    env: environment,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  children.push(child);

  const logs: string[] = [];
  child.stdout?.setEncoding('utf8').on('data', (chunk: string) => logs.push(chunk));
  child.stderr?.setEncoding('utf8').on('data', (chunk: string) => logs.push(chunk));

  const listening = (async (): Promise<{ port: number }> => {
    const [message] = (await once(child, 'message')) as [{ port: number }];
    return message;
  })();
  const crashed = (async (): Promise<never> => {
    const [code, signal] = (await once(child, 'exit')) as [number | undefined, NodeJS.Signals | undefined];
    throw new Error(
      `API server exited before listening (code ${String(code)}, signal ${String(signal)}).\n${logs.join('')}`,
    );
  })();
  const { port } = await Promise.race([listening, crashed]);
  return { url: `ws://127.0.0.1:${String(port)}`, child, logs };
};

const makeRoot = async (files: Record<string, string>): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), 'tau-ws-2p-'));
  roots.push(root);
  await Promise.all(Object.entries(files).map(async ([name, content]) => writeFile(join(root, name), content, 'utf8')));
  return root;
};

type StateTracker = {
  readonly states: WorkerState[];
  /** Number of states seen so far — the watermark a per-edit assertion slices from. */
  mark(): number;
  /** States recorded since `from` that were a render start. */
  renders(from: number): WorkerState[];
  settle(): Promise<void>;
  stop(): void;
};

/**
 * Watermark-count `state` events, mirroring the flagship watch test.
 *
 * @param subscribe - `(handler) => client.on('state', handler)` for the client under test.
 * @returns The {@link StateTracker}.
 */
const trackStates = (subscribe: (handler: (state: WorkerState) => void) => () => void): StateTracker => {
  const states: WorkerState[] = [];
  const stop = subscribe((state) => {
    states.push(state);
  });
  return {
    states,
    mark: () => states.length,
    renders: (from) => states.slice(from).filter((state) => state === 'rendering'),
    async settle(): Promise<void> {
      await vi.waitFor(
        () => {
          expect(states.at(-1)).toBe('idle');
        },
        { timeout: 120_000, interval: 50 },
      );
    },
    stop,
  };
};

type WebSocketPlugin = ReturnType<typeof webSocketTransport>;

type CapturedTransport = {
  /** Pass to `createRuntimeClient`; materialises the real plugin and remembers the handle. */
  readonly plugin: WebSocketPlugin;
  /** The materialised transport handle — the only route to `closed` (the client only exposes a descriptor). */
  handle(): ReturnType<WebSocketPlugin['materialize']>;
};

/**
 * Wrap a `webSocketTransport` plugin so the test keeps the materialised
 * client handle `createRuntimeClient` would otherwise swallow.
 *
 * @param options - Transport options.
 * @returns The {@link CapturedTransport}.
 */
const capturingTransport = (options: WebSocketTransportOptions): CapturedTransport => {
  const plugin = webSocketTransport(options);
  let materialised: ReturnType<WebSocketPlugin['materialize']> | undefined;
  return {
    plugin: {
      ...plugin,
      materialize: () => {
        materialised = plugin.materialize();
        return materialised;
      },
    },
    handle() {
      if (!materialised) {
        throw new Error('transport was never materialised');
      }
      return materialised;
    },
  };
};

type SocketRecorder = {
  readonly dialled: Array<{ readonly url: string; readonly socket: WebSocket }>;
  readonly createSocket: NonNullable<WebSocketTransportOptions['createSocket']>;
  /** The socket dialled for `route`, or `undefined` when the client never opened it. */
  routed(route: 'runtime' | 'fs'): WebSocket | undefined;
};

/**
 * `createSocket` is the sanctioned seam for reaching the transport's own
 * sockets (the option exists for exactly this); the host wraps `ws` sockets
 * the same way, so nothing about the wire changes.
 *
 * @returns The {@link SocketRecorder}.
 */
const recordSockets = (): SocketRecorder => {
  const dialled: Array<{ url: string; socket: WebSocket }> = [];
  return {
    dialled,
    createSocket: (url) => {
      const socket = new WebSocket(url);
      dialled.push({ url, socket });
      /* `ws` narrows `binaryType` to its own union while the structural
       * `WebSocketLike` declares `binaryType: string`; the members themselves
       * match, which is why `webSocketHost` wraps these very sockets. */
      return socket as unknown as ReturnType<NonNullable<WebSocketTransportOptions['createSocket']>>;
    },
    routed: (route) => dialled.find((entry) => new URL(entry.url).pathname === `/${route}`)?.socket,
  };
};

afterEach(async () => {
  await Promise.all(children.splice(0).map(async (child) => stopProcess(child)));
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

/* ---------------------------------------------------------------- *
 * Scenarios                                                         *
 * ---------------------------------------------------------------- */

describe('WebSocket transport across two processes', { concurrent: false }, () => {
  it('E1: renders host-local geometry over the socket, byte-identical to an in-process render', async () => {
    const serverRoot = await makeRoot({ 'main.ts': boxSource(20) });
    const server = await startApiServer({ mode: 'host-local', serverRoot });
    const captured = capturingTransport({ url: server.url });
    const client = createRuntimeClient({ transport: captured.plugin });

    try {
      await client.connect();
      const ready = await captured.handle().open();
      await ready.channel.ready;
      expect(ready.channel.hello.payload).toMatchObject({ server: 'kernel-runtime-worker', protocolVersion: 1 });
      expect(client.transport.id).toBe('web-socket');
      expect(client.transport.descriptor).toEqual(hostLocalDescriptor);

      const outcome = await client.render({ source: { path: 'main.ts' } });
      if (outcome.superseded) {
        throw new Error(`Expected the remote render to settle.\n${server.logs.join('')}`);
      }
      await geometryHelpers.expectValidGltf(outcome.geometry);
      await geometryHelpers.expectMeshCount(outcome.geometry, 1);

      const remote = extractGltfFromExportResult(await client.export('glb', { source: { path: 'main.ts' } }));
      expect(remote?.byteLength).toBeGreaterThan(0);

      /* Hash-Parity: the same source through the same runtime definition, in
       * this process, must produce the same bytes. */
      const localRoot = await makeRoot({ 'main.ts': boxSource(20) });
      const local = createRuntimeClient({
        transport: inProcessTransport({ runtime: webSocketRuntime, fileSystem: fromNodeFs(localRoot) }),
      });
      try {
        const expected = extractGltfFromExportResult(await local.export('glb', { source: { path: 'main.ts' } }));
        expect(Buffer.from(remote!).equals(Buffer.from(expected!))).toBe(true);
      } finally {
        local.terminate();
      }
    } finally {
      client.terminate();
    }
  });

  it('E2: re-renders exactly once per external edit to the API server root', async () => {
    const serverRoot = await makeRoot({ 'main.ts': boxSource(20) });
    const entryPath = join(serverRoot, 'main.ts');
    const server = await startApiServer({ mode: 'host-local', serverRoot });
    const client = createRuntimeClient({ transport: webSocketTransport({ url: server.url }) });
    const tracker = trackStates((handler) => client.on('state', handler));

    try {
      const initial = await client.render({ source: { path: 'main.ts' } });
      if (initial.superseded) {
        throw new Error(`Expected the initial remote render to settle.\n${server.logs.join('')}`);
      }
      await geometryHelpers.expectBoundingBoxSize(initial.geometry, boxSize(20), boxTolerance);
      await tracker.settle();

      // 1. A plain external write, straight through node:fs on the server's own root.
      let mark = tracker.mark();
      await writeFile(entryPath, boxSource(25), 'utf8');
      await delay(debounceSettlingWindow);
      expect(tracker.renders(mark)).toEqual(['rendering']);
      await tracker.settle();

      // 2. An editor-style atomic save.
      mark = tracker.mark();
      const temporaryPath = join(serverRoot, '.main.ts.editor.tmp');
      await writeFile(temporaryPath, boxSource(30), 'utf8');
      await rename(temporaryPath, entryPath);
      await delay(debounceSettlingWindow);
      expect(tracker.renders(mark)).toEqual(['rendering']);
      await tracker.settle();

      // 3. Tau's own cache writes are excluded and must never feed back.
      mark = tracker.mark();
      const cacheDirectory = join(serverRoot, '.tau/cache/geometry');
      await mkdir(cacheDirectory, { recursive: true });
      for (let index = 0; index < 20; index++) {
        // oxlint-disable-next-line no-await-in-loop -- sequential burst mirrors the cache writer's own ordering
        await writeFile(join(cacheDirectory, `burst-${String(index)}.bin`), new Uint8Array([index]));
      }
      await delay(debounceSettlingWindow);
      expect(tracker.renders(mark)).toEqual([]);

      // The autonomous re-renders really produced the edited geometry, not the original.
      const grown = await client.render({ source: { path: 'main.ts' } });
      if (grown.superseded) {
        throw new Error(`Expected the post-edit render to settle.\n${server.logs.join('')}`);
      }
      await geometryHelpers.expectBoundingBoxSize(grown.geometry, boxSize(30), boxTolerance);
    } finally {
      tracker.stop();
      client.terminate();
    }
  });

  it('E3: serves the UI filesystem to the remote kernel, cache writes and watch included', async () => {
    const uiRoot = await makeRoot({ 'main.ts': boxSource(20) });
    const server = await startApiServer({ mode: 'bridged' });
    const captured = capturingTransport({ url: server.url, fileSystem: fromNodeFs(uiRoot) });
    const client = createRuntimeClient({ transport: captured.plugin });
    const tracker = trackStates((handler) => client.on('state', handler));
    /* The remote kernel's cache writes are void bridged calls. When the
     * msgpack `nil` for a void result is rejected (`voidResult` strict), the
     * UI-side authority still performs the write, so the cache directory
     * exists either way — only the kernel-side rejection tells the truth,
     * and the geometry-cache middleware surfaces it as a `warn` log. */
    const cacheWriteWarnings: string[] = [];
    const stopLogs = client.on('log', (entry) => {
      if (entry.level === 'warn' && /cache write error/i.test(entry.message)) {
        cacheWriteWarnings.push(entry.message);
      }
    });

    try {
      await client.connect();
      expect(client.transport.descriptor).toEqual({ ...hostLocalDescriptor, fileSystem: 'bridged' });

      const initial = await client.render({ source: { path: 'main.ts' } });
      if (initial.superseded) {
        throw new Error(`Expected the bridged render to settle.\n${server.logs.join('')}`);
      }
      await geometryHelpers.expectMeshCount(initial.geometry, 1);
      await tracker.settle();

      /* The remote kernel wrote its caches back through the `/fs` socket —
       * every one of those calls is a void result, the msgpack `nil` the
       * blueprint's Finding 3 pincer is about. */
      await vi.waitFor(
        async () => {
          expect(await readdir(join(uiRoot, '.tau/cache'))).not.toHaveLength(0);
        },
        { timeout: 30_000, interval: 100 },
      );
      // Red before WS3: every void bridged call rejected with "Expected no result".
      expect(cacheWriteWarnings).toEqual([]);

      // An external edit in the UI root: the watch registration crossed the socket.
      let mark = tracker.mark();
      await writeFile(join(uiRoot, 'main.ts'), boxSource(25), 'utf8');
      await delay(debounceSettlingWindow);
      expect(tracker.renders(mark)).toEqual(['rendering']);
      await tracker.settle();

      // A parameter update is one render, not two.
      mark = tracker.mark();
      const updated = await client.updateParameters({ height: 40 });
      if (updated.superseded) {
        throw new Error(`Expected the parameter update to settle.\n${server.logs.join('')}`);
      }
      await geometryHelpers.expectBoundingBoxSize(updated.geometry, boxSize(40), boxTolerance);
      await delay(debounceSettlingWindow);
      expect(tracker.renders(mark)).toEqual(['rendering']);
      await tracker.settle();

      // Cache writes in the UI root are excluded from the bridged watch too.
      mark = tracker.mark();
      const cacheDirectory = join(uiRoot, '.tau/cache/geometry');
      await mkdir(cacheDirectory, { recursive: true });
      for (let index = 0; index < 20; index++) {
        // oxlint-disable-next-line no-await-in-loop -- sequential burst mirrors the cache writer's own ordering
        await writeFile(join(cacheDirectory, `burst-${String(index)}.bin`), new Uint8Array([index]));
      }
      await delay(debounceSettlingWindow);
      expect(tracker.renders(mark)).toEqual([]);
    } finally {
      stopLogs();
      tracker.stop();
      client.terminate();
    }
  });

  it('E4: surfaces a lone /fs socket failure as a render error, leaving the runtime wire up', async () => {
    const uiRoot = await makeRoot({ 'main.ts': boxSource(20), 'other.ts': boxSource(35) });
    const server = await startApiServer({ mode: 'bridged' });
    const sockets = recordSockets();
    const captured = capturingTransport({
      url: server.url,
      fileSystem: fromNodeFs(uiRoot),
      createSocket: sockets.createSocket,
    });
    const client = createRuntimeClient({ transport: captured.plugin });

    try {
      const initial = await client.render({ source: { path: 'main.ts' } });
      if (initial.superseded) {
        throw new Error(`Expected the bridged render to settle.\n${server.logs.join('')}`);
      }

      const fileSystemSocket = sockets.routed('fs');
      expect(fileSystemSocket).toBeDefined();
      /* 4000 is deliberately not 1008: a 1008 is the host rejecting the socket
       * on topology grounds, and that one does settle the transport. */
      fileSystemSocket?.close(4000, 'filesystem socket dropped by the test');

      /* Bounded, not hung: this used to wedge forever, because nothing on the
       * host disposed the bridge proxy when the `/fs` socket died. */
      const startedAt = Date.now();
      let failed = true;
      try {
        const outcome = await client.render({ source: { path: 'other.ts' } });
        failed = outcome.superseded ? false : !outcome.geometry.success;
      } catch {
        failed = true;
      }
      expect(failed).toBe(true);
      expect(Date.now() - startedAt).toBeLessThan(10_000);

      /* The runtime wire is still up: a lone `/fs` death is a render error, not
       * a transport close. */
      const unsettled = Symbol('unsettled');
      await expect(Promise.race([captured.handle().closed, Promise.resolve(unsettled)])).resolves.toBe(unsettled);
    } finally {
      client.terminate();
    }
  }, 120_000);

  it('E5: settles wire-failure when the API server dies mid-render, and a later close() cannot overwrite it', async () => {
    const uiRoot = await makeRoot({ 'main.ts': boxSource(20), 'slow.ts': slowSource });
    const server = await startApiServer({ mode: 'bridged' });
    const sockets = recordSockets();
    const captured = capturingTransport({
      url: server.url,
      fileSystem: fromNodeFs(uiRoot),
      createSocket: sockets.createSocket,
    });
    const client = createRuntimeClient({ transport: captured.plugin });
    const tracker = trackStates((handler) => client.on('state', handler));

    try {
      const pending = client.render({ source: { path: 'slow.ts' } });
      /* Never let the rejection float between the kill and the assertion. */
      const settled = (async (): Promise<{ rejected: boolean }> => {
        try {
          await pending;
          return { rejected: false };
        } catch {
          return { rejected: true };
        }
      })();
      await vi.waitFor(
        () => {
          expect(tracker.states).toContain('rendering');
        },
        { timeout: 120_000, interval: 25 },
      );

      const killedAt = Date.now();
      expect(signalProcess(server.child, 'SIGKILL')).toBe(true);

      await expect(settled).resolves.toEqual({ rejected: true });
      const neverSettled = (async (): Promise<{ cause: string }> => {
        await delay(10_000);
        return { cause: 'never settled' };
      })();
      const result = await Promise.race([captured.handle().closed, neverSettled]);
      const settleDuration = Date.now() - killedAt;
      expect(result.cause).toBe('wire-failure');
      expect(settleDuration).toBeLessThan(10_000);

      /* A late close() must not overwrite the first cause. */
      await captured.handle().close();
      await expect(captured.handle().closed).resolves.toMatchObject({ cause: 'wire-failure' });

      /* The UI's own `/fs` bridge server went down with the transport. */
      await vi.waitFor(
        () => {
          expect(sockets.dialled).toHaveLength(2);
          expect(sockets.dialled.map((entry) => entry.socket.readyState)).toEqual([WebSocket.CLOSED, WebSocket.CLOSED]);
        },
        { timeout: 10_000, interval: 50 },
      );
    } finally {
      tracker.stop();
      client.terminate();
    }
  });

  it('E6: serves two UI clients from one API server without cross-talk', async () => {
    const serverRoot = await makeRoot({ 'main-a.ts': boxSource(20), 'main-b.ts': boxSource(70) });
    const server = await startApiServer({ mode: 'host-local', serverRoot });
    const first = createRuntimeClient({ transport: webSocketTransport({ url: server.url }) });
    const second = createRuntimeClient({ transport: webSocketTransport({ url: server.url }) });

    try {
      const [one, two] = await Promise.all([
        first.render({ source: { path: 'main-a.ts' } }),
        second.render({ source: { path: 'main-b.ts' } }),
      ]);
      if (one.superseded || two.superseded) {
        throw new Error(`Expected both remote renders to settle.\n${server.logs.join('')}`);
      }
      await geometryHelpers.expectBoundingBoxSize(one.geometry, boxSize(20), boxTolerance);
      await geometryHelpers.expectBoundingBoxSize(two.geometry, boxSize(70), boxTolerance);

      // Closing one connection leaves the other's kernel alone.
      first.terminate();
      const again = await second.render({ source: { path: 'main-b.ts' } });
      if (again.superseded) {
        throw new Error(`Expected the surviving client to keep rendering.\n${server.logs.join('')}`);
      }
      await geometryHelpers.expectBoundingBoxSize(again.geometry, boxSize(70), boxTolerance);
    } finally {
      first.terminate();
      second.terminate();
    }
  });

  it('E7: exports STL bytes over the socket identical to a deterministic in-process export', async () => {
    const serverRoot = await makeRoot({ 'main.ts': boxSource(20) });
    const server = await startApiServer({ mode: 'host-local', serverRoot });
    const client = createRuntimeClient({ transport: webSocketTransport({ url: server.url }) });
    const localRoot = await makeRoot({ 'main.ts': boxSource(20) });
    const local = createRuntimeClient({
      transport: inProcessTransport({ runtime: webSocketRuntime, fileSystem: fromNodeFs(localRoot) }),
    });

    const stlBytes = async (result: Awaited<ReturnType<typeof client.export>>): Promise<Uint8Array<ArrayBuffer>> => {
      if (!result.success) {
        throw new Error(`STL export failed.\n${server.logs.join('')}`);
      }
      expect(result.data).toHaveLength(1);
      return result.data[0]!.bytes;
    };

    try {
      // The format has to be deterministic before it can prove anything about the wire.
      const localOnce = await stlBytes(await local.export('stl', { source: { path: 'main.ts' } }));
      const localTwice = await stlBytes(await local.export('stl', { source: { path: 'main.ts' } }));
      expect(localOnce).toEqual(localTwice);
      expect(localOnce.byteLength).toBeGreaterThan(0);

      const remote = await stlBytes(await client.export('stl', { source: { path: 'main.ts' } }));
      expect(remote.byteLength).toBeGreaterThan(0);
      expect(remote).toEqual(localOnce);
    } finally {
      client.terminate();
      local.terminate();
    }
  });

  it('E8: enforces the origin allowlist at the HTTP upgrade across processes', async () => {
    const serverRoot = await makeRoot({ 'main.ts': boxSource(20) });
    const server = await startApiServer({ mode: 'host-local', serverRoot, allowedOrigins: 'http://ui.test' });

    const allowed = new WebSocket(`${server.url}/runtime`, { origin: 'http://ui.test' });
    const [frame] = (await once(allowed, 'message')) as [Uint8Array<ArrayBuffer>];
    /* The wire is msgpack and the runtime hello is the first frame the host
     * posts — decoding it here is the codec assertion E7's parity cannot make. */
    expect(decode(frame)).toMatchObject({
      v: 1,
      k: 'lh',
      d: { server: 'kernel-runtime-worker', protocolVersion: 1 },
    });
    allowed.close();

    const denied = new WebSocket(`${server.url}/runtime`, { origin: 'http://evil.test' });
    const [error] = (await once(denied, 'error')) as [Error];
    expect(error.message).toContain('403');

    const anonymous = new WebSocket(`${server.url}/runtime`);
    await once(anonymous, 'open');
    anonymous.close();
  });
});
