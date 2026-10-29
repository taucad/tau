/**
 * Retained-closure revalidation digests files where their bytes live (`hashFiles`).
 *
 * The filesystem is served through the production bridge (`createFileSystemBridgePort`),
 * and the kernel's end of the port is tapped, so these tests count the round trips and
 * the body bytes that actually cross it.
 */
import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFileSystemBridgeHello, createFileSystemBridgePort, fileSystemBridgeSchemas } from '@taucad/fs-bridge';
import { createBridgePort } from '@taucad/rpc/bridge';
import { NodeFsChannel, NodeFsProviderClient } from '@taucad/filesystem/backend';
import { serveNodeFsProvider } from '@taucad/filesystem/backend/node';
import type { NodeFsPort } from '@taucad/filesystem/backend/node';
import { composeView } from '@taucad/filesystem/composed-view';
import { tauPathPolicy } from '@taucad/filesystem/path-registry';
import type { MessagePortLike } from '@taucad/rpc';
import { sha256Bytes } from '@taucad/utils/hash';
import { KernelRuntimeWorker } from '#framework/kernel-runtime-worker.js';
import { defineRuntime } from '#worker/runtime-definition.js';
import { defineKernelV2 } from '#types/runtime-kernel-v2.types.js';
import type { RuntimeFileSystemBase } from '#types/runtime-kernel.types.js';
import { createKernelSuccess } from '#kernels/kernel-helpers.js';
import { _fromMemoryFsHandle as fromMemoryFs } from '#transport/_internal/from-memory-fs-handle.js';
/* oxlint-disable no-restricted-imports, import/extensions -- Runtime-private white-box fixture. */
import { createGeometryFile, createParameterDeclaration } from '../../test/support/kernel-worker.fixture.js';
/* oxlint-enable no-restricted-imports, import/extensions */

const workers: KernelRuntimeWorker[] = [];
afterEach(async () => {
  await Promise.all(workers.splice(0).map(async (worker) => worker.cleanup()));
});

const encoder = new TextEncoder();

/** Body bytes anywhere inside one wire frame. */
const bodyBytes = (value: unknown): number => {
  if (value instanceof Uint8Array) {
    return value.byteLength;
  }
  if (value === null || typeof value !== 'object') {
    return 0;
  }
  return Object.values(value).reduce<number>((total, entry) => total + bodyBytes(entry), 0);
};

/**
 * The kernel's end of the filesystem bridge, recording every bridge call it sends and the
 * body bytes every reply carries back.
 */
const tapPort = (port: MessagePortLike) => {
  const calls: string[] = [];
  let repliedBodyBytes = 0;
  const listeners = new Map<unknown, unknown>();
  const tapped: MessagePortLike = {
    postMessage(data: unknown, transfer?: unknown) {
      const frame = data as { k?: unknown; n?: unknown };
      if (frame.k === 'rq' && typeof frame.n === 'string') {
        calls.push(frame.n);
      }
      port.postMessage(data, transfer);
    },
    addEventListener(type: 'close' | 'message', listener: (event: MessageEvent) => void, options?: unknown) {
      const wrapped =
        type === 'message'
          ? (event: MessageEvent): void => {
              repliedBodyBytes += bodyBytes(event.data);
              listener(event);
            }
          : listener;
      listeners.set(listener, wrapped);
      port.addEventListener(type, wrapped, options);
    },
    removeEventListener(type: 'close' | 'message', listener: unknown, options?: unknown) {
      port.removeEventListener(type, listeners.get(listener) ?? listener, options);
    },
    start() {
      port.start?.();
    },
    close() {
      port.close();
    },
  };
  return {
    port: tapped,
    /** Forget what was recorded so far. */
    reset() {
      calls.length = 0;
      repliedBodyBytes = 0;
    },
    calls,
    get repliedBodyBytes() {
      return repliedBodyBytes;
    },
  };
};

const seed = async (files: Record<string, string | Uint8Array<ArrayBuffer>>): Promise<RuntimeFileSystemBase> => {
  const handle = fromMemoryFs();
  if (handle.kind !== 'inline') {
    throw new Error('fromMemoryFs() must return an inline filesystem in tests.');
  }
  const base = handle.create();
  for (const [path, content] of Object.entries(files)) {
    const separator = path.lastIndexOf('/');
    if (separator !== -1) {
      // oxlint-disable-next-line no-await-in-loop -- fixture seeding is sequential.
      await base.mkdir(path.slice(0, separator), { recursive: true });
    }
    // oxlint-disable-next-line no-await-in-loop -- fixture seeding is sequential.
    await base.writeFile(path, content);
  }
  return base;
};

/** A kernel whose entry depends on every other seeded file. */
const createHarness = async (
  files: Record<string, string | Uint8Array<ArrayBuffer>>,
  options?: {
    readonly host?: (base: RuntimeFileSystemBase) => RuntimeFileSystemBase;
    /** Serve the bridge as a host that predates `hashFiles` does: no such call, no such hello field. */
    readonly legacyHost?: boolean;
    /** Paths the kernel reports as unresolved, so they are retained as absent. */
    readonly unresolved?: readonly string[];
    /** An already-seeded filesystem to serve instead of a fresh memory one. */
    readonly base?: RuntimeFileSystemBase;
  },
) => {
  const base = options?.base ?? (await seed(files));
  const dependencies = Object.keys(files).filter((path) => path !== 'main.ts');
  const counts = { evaluations: 0, resolves: 0 };
  const kernel = defineKernelV2({
    id: 'closure',
    name: 'Closure',
    version: '1.0.0',
    extensions: ['ts'],
    views: { model: { title: 'Model', mimeType: 'image/svg+xml' } },
    exports: {},
    async initialize() {
      return {};
    },
    async resolve({ entryPath }) {
      counts.resolves++;
      return { resolved: [entryPath, ...dependencies], unresolved: [...(options?.unresolved ?? [])] };
    },
    async describe({ entryPath }, runtime) {
      const source = await runtime.filesystem.readFile(entryPath, 'utf8');
      const declaration = createParameterDeclaration({ label: source }, { properties: { label: { type: 'string' } } });
      if (!declaration.success) {
        throw new Error('Invalid parameter fixture');
      }
      return createKernelSuccess({ parameters: declaration.data });
    },
    async evaluate({ parameters }) {
      counts.evaluations++;
      return { handle: { label: String(parameters['label']) } };
    },
    async render({ handle }) {
      return { content: `<svg xmlns="http://www.w3.org/2000/svg"><text>${handle.label}</text></svg>` };
    },
  })();
  const served = options?.host?.(base) ?? base;
  const unwatched = { ...served, watch: undefined };
  const tap = tapPort(
    options?.legacyHost === true
      ? createBridgePort(unwatched, {
          hello: createFileSystemBridgeHello({ state: 'ready', capabilities: served.capabilities, watchable: false }),
          protocolSchemas: fileSystemBridgeSchemas,
        }).port
      : createFileSystemBridgePort(unwatched).port,
  );
  const worker = new KernelRuntimeWorker({ runtime: defineRuntime({ kernels: [kernel] }) });
  workers.push(worker);
  await worker.initialize({
    callbacks: { onLog: () => undefined },
    transferables: { fileSystemPort: tap.port },
  });
  return { worker, base, counts, tap };
};

/** Evaluate one long-lived document, answering with the source revision it reports. */
const evaluate = async (
  worker: KernelRuntimeWorker,
  request: { readonly documentId: string; intent: number },
): Promise<Record<string, unknown>> => {
  let result: Parameters<NonNullable<KernelRuntimeWorker['onEvaluated']>>[0] | undefined;
  worker.onEvaluated = (event) => {
    if (event.documentId === request.documentId) {
      result = event;
    }
  };
  if (request.intent === 0) {
    worker.handleOpenDocument({
      documentId: request.documentId,
      intent: 0,
      file: createGeometryFile('main.ts'),
      parameters: {},
      watch: false,
    });
  } else {
    worker.handleUpdateDocument({ documentId: request.documentId, intent: request.intent });
  }
  request.intent++;
  await vi.waitFor(() => {
    expect(result).toBeDefined();
  });
  if (!result?.success || !result.sourceRevision) {
    throw new Error(`Missing source revision: ${JSON.stringify(result)}`);
  }
  return result.sourceRevision.files;
};

const closure = (count: number): Record<string, string> => ({
  'main.ts': 'entry',
  ...Object.fromEntries(Array.from({ length: count - 1 }, (_, index) => [`lib/part-${index}.ts`, `part ${index}`])),
});

describe('retained-closure revalidation over the filesystem bridge', () => {
  it('revalidates a 300-file closure with one bridge call and no file bodies', async () => {
    const { worker, counts, tap } = await createHarness(closure(300));
    const request = { documentId: randomUUID(), intent: 0 };
    await evaluate(worker, request);
    expect(counts.evaluations).toBe(1);

    tap.reset();
    await evaluate(worker, request);

    expect(counts.evaluations).toBe(1);
    expect(tap.calls).toEqual(['hashFiles']);
    expect(tap.repliedBodyBytes).toBe(0);
  });

  it('detects a same-length rewrite inside one mtime tick and re-evaluates', async () => {
    const { worker, base, counts } = await createHarness(closure(3), {
      /* The host reports one frozen stat for every file: a stamp could not tell the rewrite apart. */
      host: (filesystem) => ({
        ...filesystem,
        stat: async () => ({ type: 'file', size: 5, mtimeMs: 1, contentKind: 'text', lineCount: 1 }),
      }),
    });
    const request = { documentId: randomUUID(), intent: 0 };
    const first = await evaluate(worker, request);

    await base.writeFile('lib/part-1.ts', 'PART 1');
    const second = await evaluate(worker, request);

    expect(counts.evaluations).toBe(2);
    expect(second['lib/part-1.ts']).not.toEqual(first['lib/part-1.ts']);
    expect(second['main.ts']).toEqual(first['main.ts']);
  });

  it("records the kernel's own digest, so an unchanged closure keeps its cache keys", async () => {
    const { worker, base, counts } = await createHarness(closure(2));
    const request = { documentId: randomUUID(), intent: 0 };
    const before = await evaluate(worker, request);
    expect(JSON.stringify(before['lib/part-0.ts'])).toContain(await sha256Bytes(encoder.encode('part 0')));

    /* A host digest in any other form would read as a move and resolve the closure again. */
    expect(await evaluate(worker, request)).toEqual(before);
    expect(counts.resolves).toBe(1);

    await base.writeFile('lib/part-0.ts', 'part X');
    const after = await evaluate(worker, request);

    expect(JSON.stringify(after['lib/part-0.ts'])).toContain(await sha256Bytes(encoder.encode('part X')));
  });

  it('detects a retained-missing path that appears, in the same one call', async () => {
    const { worker, base, counts, tap } = await createHarness(closure(2), { unresolved: ['lib/optional.ts'] });
    const request = { documentId: randomUUID(), intent: 0 };
    await evaluate(worker, request);

    tap.reset();
    await evaluate(worker, request);
    expect(tap.calls).toEqual(['hashFiles']);
    expect(counts.resolves).toBe(1);

    await base.writeFile('lib/optional.ts', 'now here');
    tap.reset();
    await evaluate(worker, request);

    expect(tap.calls[0]).toBe('hashFiles');
    expect(tap.calls).not.toContain('exists');
    /* The appearance invalidates the closure, so it is resolved again. */
    expect(counts.resolves).toBe(2);
  });

  it('falls back to reading bodies when the host does not answer hashFiles', async () => {
    const { worker, base, counts, tap } = await createHarness(closure(3), { legacyHost: true });
    const request = { documentId: randomUUID(), intent: 0 };
    await evaluate(worker, request);

    tap.reset();
    await evaluate(worker, request);
    expect(tap.calls).not.toContain('hashFiles');
    expect(tap.calls.filter((call) => call === 'readFile')).toHaveLength(3);
    expect(counts.evaluations).toBe(1);

    await base.writeFile('lib/part-1.ts', 'PART 1');
    await evaluate(worker, request);
    expect(counts.evaluations).toBe(2);
  });
});

/**
 * The desktop topology: the bridge host serves the agent's composed view over a
 * `NodeFsProviderClient`, whose provider leg crosses a real `MessageChannel` to
 * `serveNodeFsProvider` over a `NodeFsProvider` on disk. The provider leg is
 * tapped like the bridge is.
 */
const desktopFileSystem = (files: Record<string, string>) => {
  const sandbox = mkdtempSync(join(tmpdir(), 'tau-desktop-hash-'));
  const root = join(sandbox, 'root');
  const write = (path: string, content: string): void => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  };
  mkdirSync(root);
  for (const [path, content] of Object.entries(files)) {
    write(path, content);
  }
  const { port1, port2 } = new MessageChannel();
  const stop = serveNodeFsProvider(port2, {
    policy: tauPathPolicy,
    allowRoot: (candidate) => candidate === root,
  }).close;
  const leg = { ops: [] as string[], repliedBodyBytes: 0 };
  const tapped: NodeFsPort = {
    postMessage(message) {
      leg.ops.push(String((message as { op?: unknown }).op));
      port1.postMessage(message);
    },
    addEventListener(type, listener) {
      port1.addEventListener(type as 'message', (event: MessageEvent) => {
        leg.repliedBodyBytes += bodyBytes(event.data);
        listener(event);
      });
    },
    start: () => {
      port1.start();
    },
    close: () => {
      port1.close();
    },
  };
  const channel = new NodeFsChannel(tapped);
  const view = composeView(
    { filesystem: new NodeFsProviderClient(channel, root) },
    { consumer: 'agent', policy: tauPathPolicy },
  );
  desktopCleanups.push(async () => {
    channel.close();
    await stop();
    port2.close();
    rmSync(sandbox, { recursive: true, force: true });
  });
  return {
    base: view as unknown as RuntimeFileSystemBase,
    leg,
    root,
    write,
    reset() {
      leg.ops.length = 0;
      leg.repliedBodyBytes = 0;
    },
  };
};

const desktopCleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  await Promise.all(workers.splice(0).map(async (worker) => worker.cleanup()));
  await Promise.all(desktopCleanups.splice(0).map(async (cleanup) => cleanup()));
});

describe('retained-closure revalidation on the desktop provider leg', () => {
  it('revalidates a 300-file closure with one provider request and no body bytes', async () => {
    const files = closure(300);
    const desktop = desktopFileSystem(files);
    const { worker, counts, tap } = await createHarness(files, { base: desktop.base });
    const request = { documentId: randomUUID(), intent: 0 };
    await evaluate(worker, request);

    tap.reset();
    desktop.reset();
    await evaluate(worker, request);

    expect(counts.evaluations).toBe(1);
    expect(tap.calls).toEqual(['hashFiles']);
    expect(desktop.leg.ops).toEqual(['hashFiles']);
    expect(desktop.leg.repliedBodyBytes).toBe(0);
  });

  it('detects a same-length rewrite on disk that keeps the mtime', async () => {
    const files = closure(3);
    const desktop = desktopFileSystem(files);
    const { worker, counts } = await createHarness(files, { base: desktop.base });
    const request = { documentId: randomUUID(), intent: 0 };
    const first = await evaluate(worker, request);

    const file = join(desktop.root, 'lib/part-1.ts');
    const tick = new Date(1_700_000_000_000);
    utimesSync(file, tick, tick);
    const stamp = statSync(file);
    desktop.write('lib/part-1.ts', 'PART 1');
    utimesSync(file, tick, tick);
    expect([statSync(file).size, statSync(file).mtimeMs]).toEqual([stamp.size, stamp.mtimeMs]);
    const second = await evaluate(worker, request);

    expect(counts.evaluations).toBe(2);
    expect(second['lib/part-1.ts']).not.toEqual(first['lib/part-1.ts']);
  });
});
