/**
 * Rooted bridge conformance suite (charter W10, wire v3's second slice): the
 * calls a rooted connection answers over a real authority — `apply`, `glob`,
 * `grep`, `indexStats`, the index queries `facts` and `changedSince`, and
 * `readStream` — run against every transport a rooted connection rides:
 *
 * - **in-process port**: `createFileSystemBridgePort` over the root's view;
 * - **authority connection**: a rooted connection to `exposeFileSystem`, whose
 *   `handlerForRoot` composes the view;
 * - **worker port**: the same composition in a real `worker_threads` thread.
 *
 * Every transport serves the same workspace composition (see
 * `filesystem-bridge-rooted.test-fixture.ts`), so a difference between rows is
 * a transport's, never a fixture's.
 */
import { MessageChannel as NodeMessageChannel, Worker } from 'node:worker_threads';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MessagePortLike } from '@taucad/rpc';
import {
  createFileSystemBridgePort,
  createFileSystemBridgeProxy,
  createTransferredFileSystemBridgeProxy,
  exposeFileSystem,
  openFileSystemBridge,
  workspaceBridgeService,
} from '#filesystem-bridge.js';
import type { FileSystemBridgeRootedProxy, RootedBridgeConsumer } from '#filesystem-bridge.js';
import { tauPathPolicy } from '@taucad/filesystem/path-registry';
import {
  maxFactsByteCap,
  maxGlobPatternLength,
  maxGrepFileBytes,
  maxGrepLineCharacters,
} from '#filesystem-bridge-protocol.js';
import { grepMatchDeadline } from '#filesystem-bridge-grep-matcher.js';
import type {
  FileSystemBridgeEvent,
  FileSystemBridgeRuntimeService,
  GrepMatch,
  GrepOptions,
  LongCallProgress,
} from '#filesystem-bridge-protocol.js';
import type { Changeset, ChangesetEntry } from '@taucad/filesystem';
import { observeFileSystemBridgeCrossings } from '#filesystem-bridge-crossings.js';
import type { FileSystemBridgeCrossings } from '#filesystem-bridge-crossings.js';
import { computeEventRelay } from '#filesystem-bridge-compute-events.js';
import type { ComputeCrashNotice } from '#filesystem-bridge-compute-events.js';
import {
  nodeGrepMatcherWorker,
  conformanceProjectRoot,
  rootedHandlersFor,
  rootedWorkspaceHandlers,
  seededWorkspace,
  seededWorkspaceWithProvider,
} from '#filesystem-bridge-rooted.test-fixture.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

type Seed = Record<string, string | Uint8Array<ArrayBuffer>>;

const files: Seed = {
  'main.ts': 'import { part } from "./lib/part";\nexport default part;\n',
  'lib/part.ts': 'export const part = 1;\n// TODO: fillet\nexport const Other = 2;\n',
  'lib/notes.md': 'todo list\nsecond line\n',
  'lib/blob.bin': new Uint8Array([0, 1, 2, 0, 255, 0]),
  'docs/readme.md': 'Read me.\n',
  '.tau/project.json': '{"name":"secret-project"}',
};

type Opened = {
  readonly proxy: FileSystemBridgeRootedProxy;
  /** The host side's I2 crossings since the transport opened. */
  hostCrossings(): Promise<ReadonlyMap<string, FileSystemBridgeCrossings>>;
  /** Write a root file on the authority itself, not through any connection. */
  externalWrite(path: string, content: string): Promise<void>;
  /** Report a compute restart on the authority, as its supervisor would. */
  computeRestarted(report: ComputeCrashNotice): void;
  /** Take the authority away from under the connection. */
  killAuthority(): Promise<void>;
  close(): Promise<void>;
};

type Transport = {
  readonly name: string;
  open(seed: Seed, consumer: RootedBridgeConsumer): Promise<Opened>;
};

const inProcessPort: Transport = {
  name: 'in-process port',
  async open(seed, consumer) {
    const { service, handlers } = await rootedWorkspaceHandlers(seed, consumer);
    const crossings = observeFileSystemBridgeCrossings();
    const compute = computeEventRelay();
    const connection = createFileSystemBridgePort(handlers, {
      grepMatcherWorker: nodeGrepMatcherWorker,
      computeEvents: compute.source,
    });
    const proxy = createFileSystemBridgeProxy(connection);
    await proxy.ready;
    return {
      proxy,
      hostCrossings: async () => crossings.snapshot(),
      externalWrite: async (path, content) => service.writeFile(`${conformanceProjectRoot}/${path}`, content),
      computeRestarted: compute.onCrash,
      async killAuthority() {
        connection.dispose();
      },
      async close() {
        crossings.stop();
        proxy.dispose();
        service.dispose();
      },
    };
  },
};

const authorityConnection: Transport = {
  name: 'authority connection',
  async open(seed, consumer) {
    const service = await seededWorkspace(seed);
    const crossings = observeFileSystemBridgeCrossings();
    const compute = computeEventRelay();
    const boundary = new MessageChannel();
    const exposed = exposeFileSystem(workspaceBridgeService(service), {
      policy: tauPathPolicy,
      grepMatcherWorker: nodeGrepMatcherWorker,
      computeEvents: compute.source,
      handlerForRoot: (root, context, rootConsumer) =>
        rootedHandlersFor({ service, root, context, consumer: rootConsumer }),
      messageSource: boundary.port2,
    });
    const connection = openFileSystemBridge(boundary.port1, { root: conformanceProjectRoot, consumer });
    const proxy = createTransferredFileSystemBridgeProxy(connection.port);
    await proxy.ready;
    return {
      proxy,
      hostCrossings: async () => crossings.snapshot(),
      externalWrite: async (path, content) => service.writeFile(`${conformanceProjectRoot}/${path}`, content),
      computeRestarted: compute.onCrash,
      async killAuthority() {
        exposed.cleanup();
      },
      async close() {
        crossings.stop();
        proxy.dispose();
        exposed.cleanup();
        boundary.port1.close();
        boundary.port2.close();
        service.dispose();
      },
    };
  },
};

const workerMessage = async <Reply>(worker: Worker, type: string): Promise<Reply> =>
  new Promise<Reply>((resolve) => {
    const onMessage = (message: { type: string }): void => {
      if (message.type === type) {
        worker.off('message', onMessage);
        resolve(message as Reply);
      }
    };
    worker.on('message', onMessage);
  });

const workerPort: Transport = {
  name: 'worker port',
  async open(seed, consumer) {
    const worker = new Worker(new URL('filesystem-bridge-conformance.test-worker.ts', import.meta.url));
    const channel = new NodeMessageChannel();
    const serving = workerMessage(worker, 'serving');
    worker.postMessage({ type: 'serve-rooted', port: channel.port1, files: seed, consumer }, [channel.port1]);
    await serving;
    const proxy = createTransferredFileSystemBridgeProxy(channel.port2 as unknown as MessagePortLike);
    await proxy.ready;
    return {
      proxy,
      async hostCrossings() {
        const reply = workerMessage<{ crossings: Array<[string, FileSystemBridgeCrossings]> }>(worker, 'crossings');
        worker.postMessage({ type: 'crossings' });
        const { crossings } = await reply;
        return new Map(crossings);
      },
      async externalWrite(path, content) {
        const written = workerMessage(worker, 'written');
        worker.postMessage({ type: 'external-write', path, content });
        await written;
      },
      computeRestarted(report) {
        worker.postMessage({ type: 'compute-restarted', report });
      },
      async killAuthority() {
        await worker.terminate();
      },
      async close() {
        proxy.dispose();
        await worker.terminate();
      },
    };
  },
};

const opened: Opened[] = [];

afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  for (const transport of opened.splice(0).reverse()) {
    // oxlint-disable-next-line no-await-in-loop -- transports close in reverse order.
    await transport.close();
  }
});

const open = async (
  transport: Transport,
  consumer: RootedBridgeConsumer = 'working-copy',
  seed: Seed = files,
): Promise<Opened> => {
  const handle = await transport.open(seed, consumer);
  opened.push(handle);
  return handle;
};

const readAll = async (stream: ReadableStream<Uint8Array<ArrayBuffer>>): Promise<string[]> => {
  const chunks: string[] = [];
  for await (const chunk of stream) {
    chunks.push(decoder.decode(chunk));
  }
  return chunks;
};

const paths = (rows: ReadonlyArray<{ path: string }>): string[] => rows.map((row) => row.path).toSorted();

const grepMatches = async (
  proxy: FileSystemBridgeRootedProxy,
  pattern: string,
  options?: GrepOptions,
): Promise<readonly GrepMatch[]> => {
  const result = await proxy.grep(pattern, options);
  return result.matches;
};

const grepPaths = async (
  proxy: FileSystemBridgeRootedProxy,
  pattern: string,
  options?: GrepOptions,
): Promise<string[]> => {
  const matches = await grepMatches(proxy, pattern, options);
  return matches.map((match) => match.path);
};

describe.each([inProcessPort, authorityConnection, workerPort])('rooted bridge conformance: $name', (transport) => {
  describe('apply', () => {
    it('applies one changeset and answers every entry in its receipt', async () => {
      const { proxy } = await open(transport);
      const receipt = await proxy.apply({
        entries: [
          { op: 'mkdir', path: 'out', recursive: true },
          { op: 'write', path: 'out/a.txt', data: 'alpha' },
          { op: 'write', path: 'out/b.bin', data: encoder.encode('bytes') },
          { op: 'move', from: 'docs/readme.md', to: 'docs/README.md' },
          { op: 'delete', path: 'lib/notes.md' },
          { op: 'write', path: 'out/done', data: '', phase: 1 },
        ],
      });
      expect(receipt).toMatchObject({ state: 'applied', applied: 6, failed: 0, uncertain: 0, skipped: 0 });
      expect(receipt.entries.map((entry) => entry.outcome)).toEqual(Array.from({ length: 6 }, () => 'applied'));
      await expect(proxy.readFile('out/a.txt', 'utf8')).resolves.toBe('alpha');
      await expect(proxy.readFile('out/b.bin', 'utf8')).resolves.toBe('bytes');
      await expect(proxy.exists('docs/README.md')).resolves.toBe(true);
      await expect(proxy.exists('lib/notes.md')).resolves.toBe(false);
    });

    it("answers a refused entry as an Error carrying the provider's code", async () => {
      const { proxy } = await open(transport);
      const receipt = await proxy.apply({
        entries: [{ op: 'write', path: 'main.ts', data: 'clobber', create: true }],
      });
      expect(receipt).toMatchObject({ state: 'known-not-applied', failed: 1 });
      const [entry] = receipt.entries;
      expect(entry?.outcome).toBe('failed');
      expect(entry?.error).toBeInstanceOf(Error);
      expect(entry?.error).toMatchObject({ code: 'EEXIST' });
      await expect(proxy.readFile('main.ts', 'utf8')).resolves.toContain('import');
    });

    it('stages a stream entry on the caller side and writes its bytes', async () => {
      const { proxy } = await open(transport);
      const data = new ReadableStream<Uint8Array<ArrayBuffer>>({
        start(controller) {
          controller.enqueue(encoder.encode('streamed '));
          controller.enqueue(encoder.encode('bytes'));
          controller.close();
        },
      });
      const receipt = await proxy.apply({ entries: [{ op: 'write', path: 'streamed.txt', data }] });
      expect(receipt.state).toBe('applied');
      await expect(proxy.readFile('streamed.txt', 'utf8')).resolves.toBe('streamed bytes');
    });

    it('refuses an aborted changeset without a round trip, writing nothing', async () => {
      const { proxy } = await open(transport);
      const signal = AbortSignal.abort();
      await expect(
        proxy.apply({ entries: [{ op: 'write', path: 'never.txt', data: 'x' }], signal }),
      ).rejects.toMatchObject({ name: 'AbortError' });
      await expect(
        proxy.apply({ entries: [{ op: 'write', path: 'never.txt', data: 'x' }] }, { signal }),
      ).rejects.toMatchObject({ name: 'AbortError' });
      await expect(proxy.exists('never.txt')).resolves.toBe(false);
    });

    it('copies in-hand bytes by default and hands over whole buffers when the caller owns them (I2)', async () => {
      const { proxy } = await open(transport);
      const crossings = observeFileSystemBridgeCrossings();
      try {
        const kept = encoder.encode('kept');
        const handed = encoder.encode('handed');
        const larger = encoder.encode('a view into a larger buffer');
        const view = larger.subarray(2, 6);
        await proxy.apply({ entries: [{ op: 'write', path: 'kept.bin', data: kept }] });
        await proxy.apply(
          {
            entries: [
              { op: 'write', path: 'handed.bin', data: handed },
              { op: 'append', path: 'view.log', data: view },
            ],
          },
          { transfer: 'owned' },
        );
        expect(kept.byteLength).toBe(4);
        expect(handed.byteLength).toBe(0);
        // A partial view is copied even when owned: the rest of its buffer is not the call's.
        expect(larger.byteLength).toBe(27);
        expect(Object.fromEntries(crossings.snapshot())).toMatchObject({
          'kept.bin': { transfers: 0, copies: 1, bytes: 4 },
          'handed.bin': { transfers: 1, copies: 0, bytes: 6 },
          'view.log': { transfers: 0, copies: 1, bytes: 4 },
        });
        await expect(proxy.readFile('handed.bin', 'utf8')).resolves.toBe('handed');
        await expect(proxy.readFile('view.log', 'utf8')).resolves.toBe('view');
      } finally {
        crossings.stop();
      }
    });

    it('refuses an out-of-contract changeset before the authority sees it', async () => {
      const { proxy } = await open(transport);
      const entries: ChangesetEntry[] = Array.from({ length: 257 }, (_, index) => ({
        op: 'mkdir',
        path: `d${String(index)}`,
      }));
      await expect(proxy.apply({ entries })).rejects.toMatchObject({ code: 'WIRE_VALIDATION_FAILED' });
    });
  });

  describe('glob', () => {
    it('matches a slash-free pattern at any depth and a slashed one against the root-relative path', async () => {
      const { proxy } = await open(transport);
      expect(paths(await proxy.glob('*.ts'))).toEqual(['lib/part.ts', 'main.ts']);
      expect(paths(await proxy.glob('lib/*'))).toEqual(['lib/blob.bin', 'lib/notes.md', 'lib/part.ts']);
      expect(paths(await proxy.glob('**/*.md'))).toEqual(['docs/readme.md', 'lib/notes.md']);
    });

    it('starts under a path, matches files only, and caps its rows', async () => {
      const { proxy } = await open(transport);
      expect(paths(await proxy.glob('*.md', { path: 'lib' }))).toEqual(['lib/notes.md']);
      expect(paths(await proxy.glob('*.md', { path: 'nowhere' }))).toEqual([]);
      expect(paths(await proxy.glob('lib'))).toEqual([]);
      expect(await proxy.glob('*', { maxResults: 2 })).toHaveLength(2);
    });
  });

  describe('grep', () => {
    it('finds lines case-insensitively by default, with 1-based line and column', async () => {
      const { proxy } = await open(transport);
      const result = await proxy.grep('todo');
      expect(result).toMatchObject({ truncated: false });
      expect(result.matches.toSorted((left, right) => left.path.localeCompare(right.path))).toEqual([
        { path: 'lib/notes.md', line: 1, column: 1, text: 'todo list' },
        { path: 'lib/part.ts', line: 2, column: 4, text: '// TODO: fillet' },
      ]);
    });

    it('honours case, literal patterns, a file glob and context lines', async () => {
      const { proxy } = await open(transport);
      await expect(grepPaths(proxy, 'TODO', { caseSensitive: true })).resolves.toEqual(['lib/part.ts']);
      await expect(grepMatches(proxy, './lib', { fixedStrings: true })).resolves.toMatchObject([
        { path: 'main.ts', line: 1, column: 23 },
      ]);
      await expect(grepPaths(proxy, 'me', { glob: '*.md', path: 'docs' })).resolves.toEqual(['docs/readme.md']);
      const [match] = await grepMatches(proxy, 'fillet', { context: 1 });
      expect(match).toMatchObject({
        before: ['export const part = 1;'],
        after: ['export const Other = 2;'],
      });
    });

    it('skips binary files, counts what it searched, and truncates at the cap', async () => {
      const { proxy } = await open(transport);
      const everything = await proxy.grep('', { maxResults: 3 });
      expect(everything.matches).toHaveLength(3);
      expect(everything.truncated).toBe(true);
      const all = await proxy.grep('e');
      expect(all.filesSkipped).toBeGreaterThanOrEqual(1);
      expect(all.matches.some((found) => found.path === 'lib/blob.bin')).toBe(false);
      expect(all.filesSearched).toBeGreaterThanOrEqual(4);
    });

    it('skips files over the size cap and clips long lines', async () => {
      const { proxy } = await open(transport, 'working-copy', {
        'long.txt': `${'x'.repeat(maxGrepLineCharacters + 50)} needle\n`,
        'small.txt': 'needle\n',
      });
      const capped = await proxy.grep('needle', { maxFileBytes: 10 });
      expect(capped.matches.map((match) => match.path)).toEqual(['small.txt']);
      expect(capped.filesSkipped).toBe(1);
      const [long] = await grepMatches(proxy, 'needle', { glob: 'long.txt' });
      expect(long?.text).toHaveLength(maxGrepLineCharacters);
      expect(long?.column).toBe(maxGrepLineCharacters + 52);
    });

    it('refuses out-of-contract caps and patterns before the authority sees them', async () => {
      const { proxy } = await open(transport);
      const longPattern = `${'*'.repeat(maxGlobPatternLength)}.ts`;
      const refused = { code: 'WIRE_VALIDATION_FAILED' };
      await expect(proxy.grep('x', { maxFileBytes: maxGrepFileBytes + 1 })).rejects.toMatchObject(refused);
      await expect(proxy.grep('x', { glob: longPattern })).rejects.toMatchObject(refused);
      await expect(proxy.glob(longPattern)).rejects.toMatchObject(refused);
      await expect(proxy.facts(['main.ts'], { byteCap: maxFactsByteCap + 1 })).rejects.toMatchObject(refused);
      await expect(proxy.grep('x', { maxFileBytes: maxGrepFileBytes })).resolves.toMatchObject({ truncated: false });
    });

    it('refuses an invalid expression with EINVAL', async () => {
      const { proxy } = await open(transport);
      await expect(proxy.grep('(unclosed')).rejects.toMatchObject({ code: 'EINVAL' });
    });

    it('stops a pattern that backtracks past its deadline with ETIMEDOUT, and the authority keeps answering', async () => {
      const { proxy } = await open(transport, 'working-copy', {
        'evil.txt': `${'a'.repeat(40)}!\n`,
        'fine.txt': 'aaa\n',
      });
      const started = performance.now();
      await expect(proxy.grep(String.raw`^(a+)+$`)).rejects.toMatchObject({ code: 'ETIMEDOUT' });
      // One file's deadline and a worker's start, not the pattern's lifetime.
      expect(performance.now() - started).toBeLessThan(grepMatchDeadline + 5000);
      await expect(proxy.readFile('fine.txt', 'utf8')).resolves.toBe('aaa\n');
      // A literal never backtracks, so it stays on the authority's own thread.
      await expect(grepPaths(proxy, '(a+)+$', { fixedStrings: true })).resolves.toEqual([]);
      await expect(grepPaths(proxy, 'a+$', { glob: 'fine.txt' })).resolves.toEqual(['fine.txt']);
    });

    it('reports progress per file and stops on an aborted signal', async () => {
      const { proxy } = await open(transport);
      const reports: LongCallProgress[] = [];
      const result = await proxy.grep('export', {
        onProgress(progress) {
          reports.push(progress);
        },
      });
      expect(result.matches.length).toBeGreaterThan(0);
      // Progress counts every file read, including one its bytes show is binary.
      const last = reports.at(-1);
      expect(last?.done).toBe(last?.total);
      expect(last?.total).toBeGreaterThanOrEqual(result.filesSearched);
      expect(last?.total).toBeLessThanOrEqual(result.filesSearched + result.filesSkipped);
      await expect(proxy.grep('export', { signal: AbortSignal.abort() })).rejects.toMatchObject({
        name: 'AbortError',
      });
    });
  });

  describe('index queries', () => {
    it("totals a subtree from the root's index", async () => {
      const { proxy } = await open(transport);
      const lib = await proxy.indexStats('lib');
      expect(lib).toMatchObject({ files: 3, bytes: 6 + 22 + 63 });
      // Content facts count only where the index already knows them (I3).
      expect(lib.textFiles + lib.binaryFiles).toBeLessThanOrEqual(lib.files);
      const root = await proxy.indexStats('');
      expect(root.files).toBeGreaterThanOrEqual(5);
      await expect(proxy.indexStats('', { signal: AbortSignal.abort() })).rejects.toMatchObject({
        name: 'AbortError',
      });
    });

    it('answers content facts as a map, leaves out a missing path and a directory, and records what it measured', async () => {
      const { proxy } = await open(transport);
      // An index query first, so the root's index is open and keeps what `facts` measures.
      await expect(proxy.indexStats('lib')).resolves.toMatchObject({ files: 3 });
      const facts = await proxy.facts(['lib/part.ts', 'lib/notes.md', 'lib/blob.bin', 'lib', 'no/such.ts'], {
        lineCount: true,
      });
      expect(facts).toBeInstanceOf(Map);
      expect([...facts.keys()]).toEqual(['lib/part.ts', 'lib/notes.md', 'lib/blob.bin']);
      expect(facts.get('lib/part.ts')).toMatchObject({ contentKind: 'text', lineCount: 4 });
      expect(facts.get('lib/notes.md')).toMatchObject({ contentKind: 'text', lineCount: 3 });
      expect(facts.get('lib/blob.bin')).toEqual({ contentKind: 'binary' });
      // Measured once on the authority, then answered from its index.
      await expect(proxy.indexStats('lib')).resolves.toEqual({
        files: 3,
        bytes: 6 + 22 + 63,
        textFiles: 2,
        binaryFiles: 1,
        lines: 3 + 4,
      });
    });

    it('digests a file on request, and stops on an aborted signal', async () => {
      const { proxy } = await open(transport);
      const [facts, digests] = await Promise.all([
        proxy.facts(['main.ts'], { digests: ['sha256'] }),
        proxy.hashFiles(['main.ts']),
      ]);
      expect(facts.get('main.ts')?.sha256).toBe(digests['main.ts']);
      await expect(proxy.facts(['main.ts'], { signal: AbortSignal.abort() })).rejects.toMatchObject({
        name: 'AbortError',
      });
    });

    it('answers what the index changed after a generation, and only that', async () => {
      const { proxy } = await open(transport);
      const first = await proxy.changedSince(0);
      expect(first.entries.map(({ path }) => path)).toEqual(expect.arrayContaining(['lib/part.ts', 'main.ts']));
      expect(first.entries.every((entry) => !('factsAt' in entry))).toBe(true);
      await proxy.writeFile('lib/new.ts', 'export {};\n');
      const next = await proxy.changedSince(first.generation);
      expect(next.generation).toBeGreaterThan(first.generation);
      expect(next.entries.map(({ path }) => path)).toContain('lib/new.ts');
      expect(next.entries.map(({ path }) => path)).not.toContain('lib/part.ts');
      await expect(proxy.changedSince(next.generation)).resolves.toMatchObject({ entries: [] });
      await expect(proxy.changedSince(0, { signal: AbortSignal.abort() })).rejects.toMatchObject({
        name: 'AbortError',
      });
    });

    it("masks what changed by the connection's view", async () => {
      const { proxy } = await open(transport, 'agent', { ...files, '.git/HEAD': 'ref: refs/heads/main\n' });
      const rows = await proxy.statTree('');
      const visible = new Set(rows.map(({ path }) => path));
      const changed = await proxy.changedSince(0);
      const changedFiles = changed.entries.filter(({ kind }) => kind === 'file').map(({ path }) => path);
      expect(changedFiles).toContain('lib/part.ts');
      expect(changedFiles.some((path) => path.startsWith('.git'))).toBe(false);
      expect(changedFiles.every((path) => visible.has(path))).toBe(true);
    });
  });

  describe('readStream', () => {
    it('streams a file in pages, from an offset and for a length', async () => {
      const { proxy } = await open(transport);
      expect(await readAll(proxy.readStream('docs/readme.md', { chunkBytes: 4 }))).toEqual(['Read', ' me.', '\n']);
      expect(await readAll(proxy.readStream('docs/readme.md', { offset: 5, length: 3, chunkBytes: 2 }))).toEqual([
        'me',
        '.',
      ]);
      expect(await readAll(proxy.readStream('docs/readme.md'))).toEqual(['Read me.\n']);
      expect(await readAll(proxy.readStream('docs/readme.md', { offset: 50 }))).toEqual([]);
    });

    it('stops at the signal and refuses an out-of-contract page size', async () => {
      const { proxy } = await open(transport);
      const controller = new AbortController();
      const reader = proxy.readStream('docs/readme.md', { chunkBytes: 2, signal: controller.signal }).getReader();
      const first = await reader.read();
      expect(decoder.decode(first.value)).toBe('Re');
      controller.abort();
      await expect(reader.read()).rejects.toMatchObject({ name: 'AbortError' });
      expect(() => proxy.readStream('docs/readme.md', { chunkBytes: 0 })).toThrow(RangeError);
    });
  });

  describe('the event channel', () => {
    /** Every event a subscriber hears, and a wait for the next that matches. */
    const listen = (proxy: FileSystemBridgeRootedProxy) => {
      const heard: FileSystemBridgeEvent[] = [];
      const waiters = new Set<() => void>();
      const subscription = proxy.events((event) => {
        heard.push(event);
        for (const wake of waiters) {
          wake();
        }
      });
      const until = async (found: (events: readonly FileSystemBridgeEvent[]) => boolean): Promise<void> => {
        while (!found(heard)) {
          // oxlint-disable-next-line no-await-in-loop -- each event wakes the wait once.
          await new Promise<void>((resolve) => {
            waiters.add(resolve);
          });
        }
      };
      return { heard, subscription, until };
    };

    const changedPaths = (events: readonly FileSystemBridgeEvent[]): string[] =>
      events.flatMap((event) => (event.kind === 'changeSet' ? event.set.entries.map((entry) => entry.path) : []));

    it('carries each change set of the root once to every subscriber, in its own namespace', async () => {
      const host = await open(transport);
      const first = listen(host.proxy);
      const second = listen(host.proxy);
      await first.subscription.ready;
      await second.subscription.ready;
      await host.externalWrite('lib/new.ts', 'x');
      await first.until((events) => changedPaths(events).includes('lib/new.ts'));
      await second.until((events) => changedPaths(events).includes('lib/new.ts'));
      expect(first.heard.filter((event) => event.kind === 'changeSet')).toHaveLength(1);
      // One subscriber leaving keeps the channel open for the other.
      first.subscription.unsubscribe();
      await host.externalWrite('docs/later.md', 'later');
      await second.until((events) => changedPaths(events).includes('docs/later.md'));
      expect(changedPaths(first.heard)).not.toContain('docs/later.md');
      second.subscription.unsubscribe();
    });

    it("does not echo the connection's own writes", async () => {
      const host = await open(transport);
      const events = listen(host.proxy);
      await events.subscription.ready;
      await host.proxy.apply({ entries: [{ op: 'write', path: 'own.ts', data: 'x' }] });
      await host.externalWrite('external.ts', 'x');
      await events.until((heard) => changedPaths(heard).includes('external.ts'));
      expect(changedPaths(events.heard)).not.toContain('own.ts');
      events.subscription.unsubscribe();
    });

    it("keeps a masked view's hidden paths out of its channel", async () => {
      const agent = await open(transport, 'agent');
      const events = listen(agent.proxy);
      await events.subscription.ready;
      await agent.externalWrite('.tau/project.json', '{"name":"renamed"}');
      await agent.externalWrite('visible.ts', 'x');
      await events.until((heard) => changedPaths(heard).includes('visible.ts'));
      expect(changedPaths(events.heard)).not.toContain('.tau/project.json');
      events.subscription.unsubscribe();
    });

    it("carries the authority's compute restarts", async () => {
      const host = await open(transport);
      const events = listen(host.proxy);
      await events.subscription.ready;
      host.computeRestarted({ failedCalls: 2, restarts: 1, abandoned: false });
      await events.until((heard) => heard.some((event) => event.kind === 'compute-restarted'));
      expect(events.heard).toContainEqual({ kind: 'compute-restarted', failedCalls: 2, restarts: 1, abandoned: false });
      events.subscription.unsubscribe();
    });

    it('tells every subscriber, once, that the authority is lost when the connection dies', async () => {
      const host = await open(transport);
      const events = listen(host.proxy);
      await events.subscription.ready;
      await host.killAuthority();
      await events.until((heard) => heard.some((event) => event.kind === 'authority-lost'));
      await host.proxy.closed;
      // A subscriber that arrives afterwards hears it too.
      const late = listen(host.proxy);
      await late.until((heard) => heard.length > 0);
      expect(events.heard.filter((event) => event.kind === 'authority-lost')).toHaveLength(1);
      expect(late.heard).toEqual([{ kind: 'authority-lost' }]);
    });

    it('says nothing is lost when the caller disposes its own connection', async () => {
      const { proxy } = await open(transport);
      const events = listen(proxy);
      await events.subscription.ready;
      proxy.dispose();
      await proxy.closed;
      await new Promise((resolve) => {
        setTimeout(resolve, 20);
      });
      expect(events.heard).toEqual([]);
    });
  });

  describe('a masked consumer', () => {
    it("answers glob and grep through the view's mask", async () => {
      const working = await open(transport, 'working-copy');
      const agent = await open(transport, 'agent');
      expect(paths(await working.proxy.glob('*.json'))).toEqual(['.tau/project.json']);
      expect(await agent.proxy.glob('*.json')).toEqual([]);
      await expect(grepPaths(working.proxy, 'secret-project')).resolves.toEqual(['.tau/project.json']);
      await expect(grepPaths(agent.proxy, 'secret-project')).resolves.toEqual([]);
    });

    it.each(['agent', 'user'] as const)('applies a changeset of visible paths for the %s', async (consumer) => {
      const { proxy } = await open(transport, consumer);
      const receipt = await proxy.apply({
        entries: [
          { op: 'write', path: 'src/new.ts', data: 'export {};\n' },
          { op: 'move', from: 'docs/readme.md', to: 'docs/README.md' },
        ],
      });
      expect(receipt).toMatchObject({ state: 'applied', applied: 2 });
      await expect(proxy.readFile('src/new.ts', 'utf8')).resolves.toBe('export {};\n');
    });

    it.each(['agent', 'user'] as const)(
      'refuses the whole changeset for the %s when one entry is masked, applying nothing',
      async (consumer) => {
        const { proxy } = await open(transport, consumer);
        await expect(
          proxy.apply({
            entries: [
              { op: 'write', path: 'visible.ts', data: 'x' },
              { op: 'write', path: '.tau/project.json', data: '{}' },
            ],
          }),
        ).rejects.toMatchObject({ code: 'EPERM', reason: 'WORKSPACE_MASKED_PATH' });
        await expect(proxy.exists('visible.ts')).resolves.toBe(false);
        await expect(
          proxy.apply({ entries: [{ op: 'write', path: 'visible.ts', data: 'x' }], lifecycle: true }),
        ).rejects.toMatchObject({ code: 'EPERM' });
        await expect(proxy.exists('visible.ts')).resolves.toBe(false);
      },
    );

    it('refuses a records entry for the agent with EROFS and admits it for the user', async () => {
      const agent = await open(transport, 'agent');
      const user = await open(transport, 'user');
      const changeset: Changeset = { entries: [{ op: 'write', path: '.tau/chats/c1.json', data: '{}' }] };
      await expect(agent.proxy.apply(changeset)).rejects.toMatchObject({
        code: 'EROFS',
        reason: 'WORKSPACE_MASKED_PATH',
      });
      await expect(user.proxy.apply(changeset)).resolves.toMatchObject({ state: 'applied' });
    });

    it('carries the masked reason beside the code on a single write, and no reason on an ordinary failure', async () => {
      const { proxy } = await open(transport, 'agent');
      await expect(proxy.writeFile('.tau/project.json', '{}')).rejects.toMatchObject({
        code: 'EPERM',
        reason: 'WORKSPACE_MASKED_PATH',
      });
      const missing = await proxy.readFile('no/such/file.ts').catch((error: unknown) => error);
      expect(missing).toMatchObject({ code: 'ENOENT' });
      expect((missing as { reason?: unknown }).reason).toBeUndefined();
    });
  });
});

/** Fake only the clocks the bridge reads, so a port's real message turns still run. */
const fakeClocks = (): void => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
  vi.spyOn(performance, 'now').mockImplementation(() => Date.now());
};

/** Advance fake time a second at a time, letting real port deliveries land in between. */
const advance = async (milliseconds: number): Promise<void> => {
  for (let elapsed = 0; elapsed < milliseconds; elapsed += 1000) {
    // oxlint-disable-next-line no-await-in-loop -- time moves in order.
    await vi.advanceTimersByTimeAsync(Math.min(1000, milliseconds - elapsed));
    for (let turn = 0; turn < 4; turn += 1) {
      // oxlint-disable-next-line no-await-in-loop -- each turn delivers the frames the last one posted.
      await new Promise((resolve) => {
        setImmediate(resolve);
      });
    }
  }
};

/**
 * A connection whose authority's provider can be held mid-batch, so a test
 * can cut a mutating call off while the authority is part-way through it.
 */
const openHeld = async (
  transport: 'in-process port' | 'authority connection',
): Promise<{ proxy: FileSystemBridgeRootedProxy; holdBatch(batch: number): HeldBatch }> => {
  const { service, projectProvider } = await seededWorkspaceWithProvider(files);
  let proxy: FileSystemBridgeRootedProxy;
  let cleanup: () => void;
  if (transport === 'in-process port') {
    const handlers = rootedHandlersFor({
      service,
      root: conformanceProjectRoot,
      context: { originClientId: 'conformance' },
      consumer: 'working-copy',
    });
    proxy = createFileSystemBridgeProxy(createFileSystemBridgePort(handlers));
    cleanup = () => undefined;
  } else {
    const boundary = new MessageChannel();
    const exposed = exposeFileSystem(workspaceBridgeService(service), {
      policy: tauPathPolicy,
      handlerForRoot: (root, context, rootConsumer) =>
        rootedHandlersFor({ service, root, context, consumer: rootConsumer }),
      messageSource: boundary.port2,
    });
    const connection = openFileSystemBridge(boundary.port1, { root: conformanceProjectRoot, consumer: 'working-copy' });
    proxy = createTransferredFileSystemBridgeProxy(connection.port);
    cleanup = () => {
      exposed.cleanup();
      boundary.port1.close();
      boundary.port2.close();
    };
  }
  opened.push({
    proxy,
    hostCrossings: async () => new Map(),
    externalWrite: async () => undefined,
    computeRestarted: () => undefined,
    killAuthority: async () => undefined,
    async close() {
      proxy.dispose();
      cleanup();
      service.dispose();
    },
  });
  await proxy.ready;
  const applyBatch = projectProvider.applyBatch!.bind(projectProvider);
  return {
    proxy,
    holdBatch(batch) {
      const reached = Promise.withResolvers<void>();
      const release = Promise.withResolvers<void>();
      const serverAborted = Promise.withResolvers<void>();
      const settled = Promise.withResolvers<boolean>();
      let batches = 0;
      projectProvider.applyBatch = async (entries, options) => {
        batches += 1;
        if (batches !== batch) {
          return applyBatch(entries, options);
        }
        options?.signal?.addEventListener('abort', () => {
          serverAborted.resolve();
        });
        reached.resolve();
        await release.promise;
        const receipts = await applyBatch(entries, options);
        settled.resolve(receipts.every(({ outcome }) => outcome === 'applied'));
        return receipts;
      };
      return {
        reached: reached.promise,
        serverAborted: serverAborted.promise,
        settled: settled.promise,
        release: release.resolve,
        batches: () => batches,
      };
    },
  };
};

type HeldBatch = {
  /** The held batch has started. */
  readonly reached: Promise<void>;
  /** The authority's own signal for the call has fired: the caller's cancel arrived. */
  readonly serverAborted: Promise<void>;
  /** The held batch finished; `true` when every entry of it applied. */
  readonly settled: Promise<boolean>;
  release(): void;
  batches(): number;
};

describe.each(['in-process port', 'authority connection'] as const)(
  'rooted bridge conformance: a mutating call cut off mid-call over the %s (W10 F1)',
  (transport) => {
    it('reports a three-phase changeset aborted mid-call as potentially applied, and the root shows what landed', async () => {
      const { proxy, holdBatch } = await openHeld(transport);
      const held = holdBatch(2);
      const controller = new AbortController();
      const applying = proxy.apply(
        {
          entries: [
            { op: 'write', path: 'phase-0.ts', data: '0', phase: 0 },
            { op: 'write', path: 'phase-1.ts', data: '1', phase: 1 },
            { op: 'write', path: 'phase-2.ts', data: '2', phase: 2 },
          ],
        },
        { signal: controller.signal },
      );
      await held.reached;
      controller.abort();
      await expect(applying).rejects.toMatchObject({ name: 'AbortError', applicationState: 'potentially-applied' });
      await held.serverAborted;
      held.release();
      // The phase in flight settles as its provider answers; the abort stops the phase after it.
      const phaseOneLanded = await held.settled;
      await expect(proxy.exists('phase-0.ts')).resolves.toBe(true);
      await expect(proxy.exists('phase-1.ts')).resolves.toBe(phaseOneLanded);
      await expect(proxy.exists('phase-2.ts')).resolves.toBe(false);
      expect(held.batches()).toBe(2);
    });

    it('reports a copy aborted mid-call as potentially applied', async () => {
      const { proxy, holdBatch } = await openHeld(transport);
      const held = holdBatch(1);
      const controller = new AbortController();
      const copying = proxy.copyTree('lib', 'backup', { signal: controller.signal });
      await held.reached;
      controller.abort();
      await expect(copying).rejects.toMatchObject({ name: 'AbortError', applicationState: 'potentially-applied' });
      await held.serverAborted;
      held.release();
      await held.settled;
    });

    it('reports an abort before the call reached the wire as known not applied', async () => {
      const { proxy } = await openHeld(transport);
      await expect(
        proxy.apply({ entries: [{ op: 'write', path: 'never.ts', data: 'x' }] }, { signal: AbortSignal.abort() }),
      ).rejects.toMatchObject({ name: 'AbortError', applicationState: 'known-not-applied' });
      await expect(proxy.exists('never.ts')).resolves.toBe(false);
    });
  },
);

describe('rooted bridge conformance: apply outlives the ordinary deadline (W10, I10)', () => {
  it('keeps an apply alive past 30 s while its authority applies it, and answers its receipt', async () => {
    const { service, handlers } = await rootedWorkspaceHandlers(files, 'working-copy');
    const apply = handlers.apply!.bind(handlers);
    const slow: FileSystemBridgeRuntimeService = {
      ...handlers,
      async apply(changeset) {
        await new Promise((resolve) => {
          setTimeout(resolve, 45_000);
        });
        return apply(changeset);
      },
    };
    const proxy = createFileSystemBridgeProxy(createFileSystemBridgePort(slow));
    opened.push({
      proxy,
      hostCrossings: async () => new Map(),
      externalWrite: async () => undefined,
      computeRestarted: () => undefined,
      killAuthority: async () => undefined,
      async close() {
        proxy.dispose();
        service.dispose();
      },
    });
    await proxy.ready;
    fakeClocks();

    let settled = false;
    const pending = proxy.apply({ entries: [{ op: 'write', path: 'late.txt', data: 'late' }] });
    const observe = async (): Promise<void> => {
      try {
        await pending;
      } finally {
        settled = true;
      }
    };
    const observed = observe();
    await advance(40_000);
    // Past the ordinary 30 s deadline, the authority still applying: not failed (I10).
    expect(settled).toBe(false);
    await advance(6000);
    await observed;
    await expect(pending).resolves.toMatchObject({ state: 'applied', applied: 1 });
    vi.useRealTimers();
    await expect(proxy.readFile('late.txt', 'utf8')).resolves.toBe('late');
  });
});
