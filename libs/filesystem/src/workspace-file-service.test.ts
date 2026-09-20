// oxlint-disable-next-line import/no-unassigned-import -- Side-effect import to polyfill IndexedDB for tests
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { WorkspaceFileService } from '#workspace-file-service.js';
import { ProviderRegistry } from '#provider-registry.js';
import { ResourceQueue } from '#resource-queue.js';
import { ChangeEventBus } from '#change-event-bus.js';
import { MountTable } from '#mount-table.js';
import { CrossTabCoordinator } from '#cross-tab-coordinator.js';
import { SharedPool } from '@taucad/memory';
import type { ChangeEvent, FileSystemProvider, WatchEvent } from '#types.js';
import {
  createIdbWorkspaceFileService,
  createWorkspaceFileService,
  decoder,
  encoder,
  waitFor,
} from '#testing/workspace-service-harness.js';
import { projectToManifest, serializeProjectManifest } from '@taucad/types';

describe('WorkspaceFileService', () => {
  let service: WorkspaceFileService;
  let eventBus: ChangeEventBus;
  let providerRegistry: ProviderRegistry;
  let rootProvider: FileSystemProvider;

  beforeEach(async () => {
    const context = await createWorkspaceFileService();
    service = context.service;
    eventBus = context.eventBus;
    providerRegistry = context.providerRegistry;
    rootProvider = context.provider;
  });

  describe('checkout routes', () => {
    const projectId = 'proj_kkkkkkkkkkkkkkkkkkkkk';
    const checkoutId = 'chk_bracket_fillet';
    const checkoutBasePath = `.tau/checkouts/${projectId}/${checkoutId}`;

    /*
     * North-star W2 red pin (execution-queue ruling P2). A linked checkout is
     * git's worktree made addressable (charter D4, blueprint S4): a persistent
     * `/checkouts/<id>` route over the project's own storage root, class
     * `authored`, installed explicitly and never a discovery candidate, so that
     * `createRootedFileSystem('/checkouts/<id>')` needs no new capability and
     * ESTALE keeps its meaning. `ProjectRootConfiguration` has no such row
     * today. Remove `.fails` in the change that installs the route.
     */
    it('should install a linked checkout route over the project storage root, invisible to discovery', async () => {
      const provider = await providerRegistry.getProvider({ backend: 'indexeddb' });
      await provider.mkdir(projectId);
      await provider.writeFile(
        `${projectId}/tau.json`,
        serializeProjectManifest(
          projectToManifest({
            id: projectId,
            name: 'bracket',
            description: '',
            tags: [],
            assets: { main: { entryPath: 'main.ts' } },
          }),
        ),
      );
      const configuration = {
        projects: [{ projectId, backend: 'indexeddb', providerBasePath: projectId }],
        checkouts: [{ checkoutId, projectId, backend: 'indexeddb', providerBasePath: checkoutBasePath }],
        roots: [{ backend: 'indexeddb' }],
      } as const;
      await service.configureProjectRoots(configuration);

      const view = service.createRootedFileSystem(`/checkouts/${checkoutId}`);
      await view.writeFile('main.ts', 'export const bracket = 1;');

      expect(decoder.decode(await provider.readFile(`${checkoutBasePath}/main.ts`))).toBe('export const bracket = 1;');
      const { entries } = await service.listProjectManifests();
      expect(entries.map((entry) => entry.locator.relativeDirectory)).toEqual([projectId]);

      await service.configureProjectRoots({ ...configuration, checkouts: [] });
      await expect(view.readFile('main.ts')).rejects.toMatchObject({ code: 'ESTALE' });
    });

    /* The capture walk itself is `@taucad/revisions/algorithms` (D9/W8), and its
       own suite pins that it takes kinds from `readdirEntries` and stats
       nothing. What is this service's claim is the half below: a rooted view
       over a checkout offers `readdirEntries` and asks the provider for
       mount-prefixed paths. */
    it('should list a checkout from its entry kinds without a stat per file', async () => {
      const provider = await providerRegistry.getProvider({ backend: 'indexeddb' });
      await service.configureProjectRoots({
        projects: [{ projectId, backend: 'indexeddb', providerBasePath: projectId }],
        checkouts: [{ checkoutId, projectId, backend: 'indexeddb', providerBasePath: checkoutBasePath }],
        roots: [{ backend: 'indexeddb' }],
      } as const);
      const view = service.createRootedFileSystem(`/checkouts/${checkoutId}`);
      await view.writeFile('main.ts', 'export const bracket = 1;\n');
      await view.writeFile('parts/fillet.ts', 'export const fillet = 2;\n');
      const stat = vi.spyOn(provider, 'stat');
      const readdirEntries = vi.spyOn(provider, 'readdirEntries');

      const listing = view.readdirEntries;
      if (listing === undefined) {
        throw new TypeError('A rooted checkout view offers readdirEntries.');
      }
      const kinds = async (path: string): Promise<readonly string[]> => {
        const entries = await listing(path);
        return entries.map(({ name, kind }) => `${kind}:${name}`);
      };

      expect([...(await kinds('')), ...(await kinds('parts'))]).toEqual([
        'file:main.ts',
        'dir:parts',
        'file:fillet.ts',
      ]);
      expect(stat).not.toHaveBeenCalled();
      expect(readdirEntries.mock.calls).toEqual([[checkoutBasePath], [`${checkoutBasePath}/parts`]]);
    });

    /* A1 review R4 nit: `/checkouts/a/b` canonicalizes to itself, so a slashed
       id would install a route nested under another checkout's prefix. */
    it('should refuse a checkout id that is more than one path segment', async () => {
      await expect(
        service.configureProjectRoots({
          projects: [{ projectId, backend: 'indexeddb', providerBasePath: projectId }],
          checkouts: [
            {
              checkoutId: `${checkoutId}/nested`,
              projectId,
              backend: 'indexeddb',
              providerBasePath: `${checkoutBasePath}/nested`,
            },
          ],
          roots: [{ backend: 'indexeddb' }],
        } as const),
      ).rejects.toThrow('one path segment');
    });
  });

  // ---------------------------------------------------------------------------
  // writeFile / readFile round-trip
  // ---------------------------------------------------------------------------

  describe('writeFile + readFile', () => {
    it('should round-trip a string via utf8 encoding', async () => {
      await service.writeFile('/hello.txt', 'world');
      const result = await service.readFile('/hello.txt', 'utf8');
      expect(result).toBe('world');
    });

    it('should round-trip a string via encoding object', async () => {
      await service.writeFile('/hello.txt', 'world');
      const result = await service.readFile('/hello.txt', { encoding: 'utf8' });
      expect(result).toBe('world');
    });

    it('should round-trip Uint8Array data', async () => {
      const data = encoder.encode('binary content');
      await service.writeFile('/bin.dat', data);
      const result = await service.readFile('/bin.dat');
      expect(result).toBeInstanceOf(Uint8Array);
      expect(decoder.decode(result as Uint8Array<ArrayBuffer>)).toBe('binary content');
    });

    it('should return raw Uint8Array when no encoding is specified', async () => {
      await service.writeFile('/raw.txt', 'hello');
      const result = await service.readFile('/raw.txt');
      expect(result).toBeInstanceOf(Uint8Array);
    });

    it('should overwrite an existing file', async () => {
      await service.writeFile('/file.txt', 'first');
      await service.writeFile('/file.txt', 'second');
      const result = await service.readFile('/file.txt', 'utf8');
      expect(result).toBe('second');
    });

    it('should auto-create parent directories for nested paths', async () => {
      await service.writeFile('/a/b/c/file.txt', 'nested');
      const result = await service.readFile('/a/b/c/file.txt', 'utf8');
      expect(result).toBe('nested');
    });

    it('should write an empty file', async () => {
      await service.writeFile('/empty.txt', '');
      const result = await service.readFile('/empty.txt', 'utf8');
      expect(result).toBe('');
    });

    it('refreshes provider admission state only after entering the existing lock', async () => {
      const coordinator = new CrossTabCoordinator();
      const context = await createWorkspaceFileService({ crossTabCoordinator: coordinator });
      const originalWithLocks = coordinator.withLocks.bind(coordinator);
      let insideLock = false;
      vi.spyOn(coordinator, 'withLocks').mockImplementation(async (paths, operation) =>
        originalWithLocks(paths, async () => {
          insideLock = true;
          try {
            return await operation();
          } finally {
            insideLock = false;
          }
        }),
      );
      const refresh = vi.fn(async () => {
        expect(insideLock).toBe(true);
      });
      context.provider.refresh = refresh;

      try {
        await context.service.writeFile('/locked.txt', 'data');
        expect(refresh).toHaveBeenCalledOnce();
      } finally {
        context.service.dispose();
        coordinator.dispose();
      }
    });
  });

  // ---------------------------------------------------------------------------
  // readFile errors
  // ---------------------------------------------------------------------------

  describe('readFile errors', () => {
    it('should throw for a non-existent file', async () => {
      await expect(service.readFile('/nope.txt')).rejects.toThrow();
    });

    it('should throw for a non-existent nested file', async () => {
      await expect(service.readFile('/a/b/c.txt')).rejects.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // AbortSignal cancellation
  // ---------------------------------------------------------------------------

  describe('AbortSignal cancellation', () => {
    it('should throw AbortError for readFile with pre-aborted signal', async () => {
      await service.writeFile('/cancel.txt', 'data');
      const controller = new AbortController();
      controller.abort();
      await expect(service.readFile('/cancel.txt', { signal: controller.signal })).rejects.toThrow('aborted');
    });

    it('should throw AbortError for readDirectory with pre-aborted signal', async () => {
      await service.mkdir('/canceldir', { recursive: true });
      await service.writeFile('/canceldir/a.txt', 'x');
      const controller = new AbortController();
      controller.abort();
      await expect(service.readDirectory('/canceldir', { signal: controller.signal })).rejects.toThrow('aborted');
    });
  });

  // ---------------------------------------------------------------------------
  // readFileStream
  // ---------------------------------------------------------------------------

  describe('readFileStream', () => {
    it('should return a ReadableStream producing correct content', async () => {
      await service.writeFile('/stream.txt', 'hello streaming world');
      const stream = await service.readFileStream('/stream.txt');
      const reader = stream.getReader();
      const chunks: Array<Uint8Array<ArrayBuffer>> = [];

      // oxlint-disable-next-line @typescript-eslint/no-unnecessary-condition -- reader loop
      while (true) {
        // oxlint-disable-next-line no-await-in-loop -- inherent stream reading pattern
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        chunks.push(value);
      }

      const combined = new Uint8Array(chunks.reduce((sum, c) => sum + c.byteLength, 0));
      let offset = 0;
      for (const chunk of chunks) {
        combined.set(chunk, offset);
        offset += chunk.byteLength;
      }

      expect(decoder.decode(combined)).toBe('hello streaming world');
    });

    it('should throw AbortError for readFileStream with pre-aborted signal', async () => {
      await service.writeFile('/abort-stream.txt', 'data');
      const controller = new AbortController();
      controller.abort();
      await expect(service.readFileStream('/abort-stream.txt', { signal: controller.signal })).rejects.toThrow(
        'aborted',
      );
    });

    it('should wrap readFile output into single-chunk stream when provider lacks readFileStream', async () => {
      await service.writeFile('/fallback.txt', 'fallback content');
      const stream = await service.readFileStream('/fallback.txt');
      const reader = stream.getReader();
      const { done, value } = await reader.read();

      expect(done).toBe(false);
      expect(decoder.decode(value)).toBe('fallback content');

      const end = await reader.read();
      expect(end.done).toBe(true);
    });

    it('rejects invalid ranges before any provider I/O', async () => {
      const nativeRead = vi.fn(() => new ReadableStream<Uint8Array<ArrayBuffer>>());
      rootProvider.readFileStream = nativeRead;
      const bufferedRead = vi.spyOn(rootProvider, 'readFile');

      await expect(service.readFileStream('/stream.txt', { position: Number.NaN })).rejects.toThrow(RangeError);
      expect(nativeRead).not.toHaveBeenCalled();
      expect(bufferedRead).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // readdir
  // ---------------------------------------------------------------------------

  describe('readdir', () => {
    it('should list entries in a directory', async () => {
      await service.writeFile('/dir/a.txt', 'a');
      await service.writeFile('/dir/b.txt', 'b');
      const entries = await service.readdir('/dir');
      expect(entries.sort()).toEqual(['a.txt', 'b.txt']);
    });

    it('should return an empty array for an empty directory', async () => {
      await service.mkdir('/empty');
      const entries = await service.readdir('/empty');
      expect(entries).toEqual([]);
    });

    it('should include subdirectories in the listing', async () => {
      await service.mkdir('/parent/child', { recursive: true });
      await service.writeFile('/parent/file.txt', 'x');
      const entries = await service.readdir('/parent');
      expect(entries.sort()).toEqual(['child', 'file.txt']);
    });
  });

  // ---------------------------------------------------------------------------
  // stat / lstat
  // ---------------------------------------------------------------------------

  describe('stat', () => {
    it('should return file stat with type "file"', async () => {
      await service.writeFile('/f.txt', 'content');
      const stat = await service.stat('/f.txt');
      expect(stat.type).toBe('file');
      expect(stat.size).toBeGreaterThan(0);
      expect(stat.mtimeMs).toBeGreaterThan(0);
    });

    it('should return directory stat with type "dir"', async () => {
      await service.mkdir('/mydir');
      const stat = await service.stat('/mydir');
      expect(stat.type).toBe('dir');
    });

    it('should throw for a non-existent path', async () => {
      await expect(service.stat('/missing')).rejects.toThrow();
    });
  });

  describe('lstat', () => {
    it('should return stat for a file', async () => {
      await service.writeFile('/f.txt', 'data');
      const stat = await service.lstat('/f.txt');
      expect(stat.type).toBe('file');
    });

    it('should return stat for a directory', async () => {
      await service.mkdir('/d');
      const stat = await service.lstat('/d');
      expect(stat.type).toBe('dir');
    });
  });

  // ---------------------------------------------------------------------------
  // exists
  // ---------------------------------------------------------------------------

  describe('exists', () => {
    it('should return true for an existing file', async () => {
      await service.writeFile('/e.txt', 'exists');
      expect(await service.exists('/e.txt')).toBe(true);
    });

    it('should return false for a missing file', async () => {
      expect(await service.exists('/missing.txt')).toBe(false);
    });

    it('should return true for an existing directory', async () => {
      await service.mkdir('/dir');
      expect(await service.exists('/dir')).toBe(true);
    });
  });

  it('rejects every generic mutation path into the authority-global bundled types mount', async () => {
    await service.writeFile('/source.txt', 'source');
    await service.writeFile('/source-dir/file.txt', 'source');
    const cases: ReadonlyArray<{ name: string; run: () => Promise<unknown> }> = [
      { name: 'writeFile', run: async () => service.writeFile('/node_modules/file.ts', 'x') },
      {
        name: 'writeFiles',
        run: async () => service.writeFiles(Object.fromEntries([['/node_modules/file.ts', { content: 'x' }]])),
      },
      { name: 'mkdir', run: async () => service.mkdir('/node_modules/package') },
      { name: 'move source', run: async () => service.move('/node_modules/file.ts', '/target.ts') },
      { name: 'move target', run: async () => service.move('/source.txt', '/node_modules/file.ts') },
      /* `duplicate` and `copyTree` are the rooted surface's since W12d; the
       * rooted `assertMutableRoot` refuses the same mount (W5 G8). */
      { name: 'unlink', run: async () => service.unlink('/node_modules/file.ts') },
      { name: 'rmdir', run: async () => service.rmdir('/node_modules/package', { recursive: true }) },
      {
        name: 'canonical alias',
        run: async () => service.writeFile('/safe/../node_modules/alias.ts', 'x'),
      },
    ];

    for (const { name, run } of cases) {
      // oxlint-disable-next-line no-await-in-loop -- Each public endpoint is an independent trust-boundary assertion.
      await expect(run(), name).rejects.toMatchObject({ code: 'BUNDLED_TYPES_WORKSPACE' });
    }
    await expect(service.bulkMove([{ source: '/source.txt', target: '/node_modules/bulk.ts' }])).resolves.toMatchObject(
      {
        moved: [],
        failed: [{ error: { code: 'BUNDLED_TYPES_WORKSPACE' } }],
      },
    );
    await expect(service.readFile('/source.txt', 'utf8')).resolves.toBe('source');
    await expect(service.readFile('/source-dir/file.txt', 'utf8')).resolves.toBe('source');
  });

  // ---------------------------------------------------------------------------
  // readDirectory
  // ---------------------------------------------------------------------------

  describe('readDirectory', () => {
    it('should return sorted tree nodes (folders first)', async () => {
      await service.mkdir('/tree/sub', { recursive: true });
      await service.writeFile('/tree/file.txt', 'x');
      const nodes = await service.readDirectory('/tree');
      expect(nodes).toHaveLength(2);
      expect(nodes[0]!.name).toBe('sub');
      expect(nodes[0]!.children).toEqual([]);
      expect(nodes[1]!.name).toBe('file.txt');
      expect(nodes[1]!.children).toBeUndefined();
    });

    it('should propagate ENOENT from the provider when the directory does not exist', async () => {
      try {
        await service.readDirectory('/nowhere');
        expect.fail('should have thrown');
      } catch (error) {
        expect((error as NodeJS.ErrnoException).code).toBe('ENOENT');
        expect((error as Error).message.toLowerCase()).toContain('enoent');
      }
    });

    it('should still skip individual children whose stat fails when using readdir without readdirWithStats', async () => {
      await service.mkdir('/stat-skip', { recursive: true });
      await service.writeFile('/stat-skip/good.txt', 'a');

      const savedReaddirWithStats = rootProvider.readdirWithStats;
      const originalReaddir = rootProvider.readdir.bind(rootProvider);
      const originalStat = rootProvider.stat.bind(rootProvider);

      Object.defineProperty(rootProvider, 'readdirWithStats', {
        value: undefined,
        configurable: true,
        enumerable: true,
      });
      try {
        vi.spyOn(rootProvider, 'readdir').mockImplementation(async (directoryPath: string) => {
          if (directoryPath === '/stat-skip') {
            return ['good.txt', 'ghost.txt'];
          }

          return originalReaddir(directoryPath);
        });
        vi.spyOn(rootProvider, 'stat').mockImplementation(async (filePath: string) => {
          if (filePath === '/stat-skip/ghost.txt') {
            throw new Error('stat failed for deleted child');
          }

          return originalStat(filePath);
        });

        const nodes = await service.readDirectory('/stat-skip');
        const names = nodes.map((n) => n.name).sort();
        expect(names).toEqual(['good.txt']);
      } finally {
        Object.defineProperty(rootProvider, 'readdirWithStats', {
          value: savedReaddirWithStats,
          configurable: true,
          enumerable: true,
        });
      }
    });

    it('should return equivalent listings on subsequent calls', async () => {
      await service.writeFile('/cached/a.txt', 'a');
      const first = await service.readDirectory('/cached');
      const second = await service.readDirectory('/cached');
      expect(first).toEqual(second);
    });

    it('should use readdirWithStats when available', async () => {
      await service.writeFile('/rws/file.txt', 'content');
      await service.mkdir('/rws/dir');

      expect(rootProvider.readdirWithStats).toBeDefined();

      const nodes = await service.readDirectory('/rws');
      expect(nodes).toHaveLength(2);
      const directory = nodes.find((n) => n.name === 'dir');
      const file = nodes.find((n) => n.name === 'file.txt');
      expect(directory!.children).toEqual([]);
      expect(file!.children).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // recursive mkdir + readDirectory
  // ---------------------------------------------------------------------------

  describe('recursive mkdir + readDirectory', () => {
    it('should show new subdirectories in readDirectory after recursive mkdir', async () => {
      await service.writeFile('/project/.tau/parameters/main.ts.json', '{}');
      const before = await service.readDirectory('/project/.tau');
      expect(before.map((n) => n.name)).toEqual(['parameters']);

      await service.mkdir('/project/.tau/cache/params', { recursive: true });
      await service.writeFile('/project/.tau/cache/params/hash.json', '{"key":"value"}');

      const after = await service.readDirectory('/project/.tau');
      const names = after.map((n) => n.name);
      expect(names).toContain('parameters');
      expect(names).toContain('cache');
    });
  });

  // ---------------------------------------------------------------------------
  // readShallowDirectory
  // ---------------------------------------------------------------------------

  describe('readShallowDirectory', () => {
    it('should return empty array for memory scope', async () => {
      const nodes = await service.readShallowDirectory('/', {
        scope: { backend: 'memory', storageRootKey: 'memory:shallow-directory' },
      });
      expect(nodes).toEqual([]);
    });

    it('should return files and folders sorted (folders first, alpha) when backend has entries', async () => {
      const mockProvider = mock<FileSystemProvider>({
        readdir: vi.fn().mockResolvedValue(['zebra.txt', 'alpha', 'beta.txt', 'alpha-dir']),
        stat: vi.fn().mockImplementation(async (path: string) => {
          const directories = new Set(['/alpha', '/alpha-dir']);
          if (directories.has(path)) {
            return { type: 'dir', size: 10, mtimeMs: 1 };
          }
          return { type: 'file', size: 10, mtimeMs: 1, contentKind: 'text', lineCount: 1 };
        }),
        readdirWithStats: undefined,
      });
      vi.spyOn(providerRegistry, 'getProvider').mockResolvedValue(mockProvider);

      const nodes = await service.readShallowDirectory('/', { scope: { backend: 'indexeddb' } });

      expect(nodes).toEqual([
        { id: '/alpha', name: 'alpha', size: 10, mtimeMs: 1, children: [] },
        { id: '/alpha-dir', name: 'alpha-dir', size: 10, mtimeMs: 1, children: [] },
        { id: '/beta.txt', name: 'beta.txt', size: 10, mtimeMs: 1, contentKind: 'text', lineCount: 1 },
        { id: '/zebra.txt', name: 'zebra.txt', size: 10, mtimeMs: 1, contentKind: 'text', lineCount: 1 },
      ]);
    });

    it('should propagate errors when getProvider throws', async () => {
      // Audit R7: structured error propagation replaces the previous
      // swallow-to-`[]` fallback so the /files route can surface
      // recovery UI for revoked permissions / missing handles.
      vi.spyOn(providerRegistry, 'getProvider').mockRejectedValue(new Error('no provider'));

      await expect(service.readShallowDirectory('/', { scope: { backend: 'indexeddb' } })).rejects.toThrow(
        'no provider',
      );
    });

    it('should propagate errors when readdir throws', async () => {
      const mockProvider = mock<FileSystemProvider>({
        readdir: vi.fn().mockRejectedValue(new Error('ENOENT')),
        readdirWithStats: undefined,
      });
      vi.spyOn(providerRegistry, 'getProvider').mockResolvedValue(mockProvider);

      await expect(service.readShallowDirectory('/', { scope: { backend: 'indexeddb' } })).rejects.toThrow('ENOENT');
    });

    it('should skip entries where stat throws', async () => {
      const mockProvider = mock<FileSystemProvider>({
        readdir: vi.fn().mockResolvedValue(['good.txt', 'bad.txt']),
        stat: vi.fn().mockImplementation(async (path: string) => {
          if (path === '/good.txt') {
            return { type: 'file', size: 5, mtimeMs: 1, contentKind: 'text', lineCount: 1 };
          }
          throw new Error('stat failed');
        }),
        readdirWithStats: undefined,
      });
      vi.spyOn(providerRegistry, 'getProvider').mockResolvedValue(mockProvider);

      const nodes = await service.readShallowDirectory('/', { scope: { backend: 'indexeddb' } });
      expect(nodes).toEqual([
        { id: '/good.txt', name: 'good.txt', size: 5, mtimeMs: 1, contentKind: 'text', lineCount: 1 },
      ]);
    });

    it('should build correct paths when root is /', async () => {
      const mockProvider = mock<FileSystemProvider>({
        readdir: vi.fn().mockResolvedValue(['file.txt']),
        stat: vi.fn().mockResolvedValue({ type: 'file', size: 1, mtimeMs: 1, contentKind: 'text', lineCount: 1 }),
        readdirWithStats: undefined,
      });
      vi.spyOn(providerRegistry, 'getProvider').mockResolvedValue(mockProvider);

      const nodes = await service.readShallowDirectory('/', { scope: { backend: 'indexeddb' } });
      expect(nodes[0]!.id).toBe('/file.txt');
      expect(mockProvider.stat).toHaveBeenCalledWith('/file.txt');
    });

    it('should build correct paths for nested directories', async () => {
      const mockProvider = mock<FileSystemProvider>({
        readdir: vi.fn().mockResolvedValue(['child.txt']),
        stat: vi.fn().mockResolvedValue({ type: 'file', size: 1, mtimeMs: 1, contentKind: 'text', lineCount: 1 }),
        readdirWithStats: undefined,
      });
      vi.spyOn(providerRegistry, 'getProvider').mockResolvedValue(mockProvider);

      const nodes = await service.readShallowDirectory('/parent/sub', { scope: { backend: 'indexeddb' } });
      expect(nodes[0]!.id).toBe('/parent/sub/child.txt');
      expect(mockProvider.stat).toHaveBeenCalledWith('/parent/sub/child.txt');
    });
  });

  // ---------------------------------------------------------------------------
  // readDirectory after mutations
  // ---------------------------------------------------------------------------

  describe('readDirectory after mutations', () => {
    it('should return fresh listing after write', async () => {
      await service.writeFile('/cacheinv/a.txt', 'a');
      const first = await service.readDirectory('/cacheinv');
      expect(first).toHaveLength(1);

      await service.writeFile('/cacheinv/b.txt', 'b');
      const second = await service.readDirectory('/cacheinv');
      expect(second).toHaveLength(2);
    });

    it('should return fresh listing after unlink', async () => {
      await service.writeFile('/cacheinv2/a.txt', 'a');
      await service.readDirectory('/cacheinv2');

      await service.unlink('/cacheinv2/a.txt');
      const after = await service.readDirectory('/cacheinv2');
      expect(after).toHaveLength(0);
    });

    it('should return a fresh listing after a move', async () => {
      await service.writeFile('/ren-cache/old.txt', 'data');
      await service.readDirectory('/ren-cache');

      await service.move('/ren-cache/old.txt', '/ren-cache/new.txt');
      const nodes = await service.readDirectory('/ren-cache');
      const names = nodes.map((n) => n.name);
      expect(names).toContain('new.txt');
      expect(names).not.toContain('old.txt');
    });
  });

  // ---------------------------------------------------------------------------
  // dispose
  // ---------------------------------------------------------------------------

  describe('dispose', () => {
    it('should clear the event bus (no subscribers fire after dispose)', async () => {
      const handler = vi.fn();
      eventBus.subscribe(handler);
      service.dispose();
      eventBus.emit({ type: 'fileWritten', path: '/x', backend: 'memory' });
      expect(handler).not.toHaveBeenCalled();
    });

    it('clears search, pool, route, and discovery derivatives without reviving providers', async () => {
      const pool = new SharedPool(new SharedArrayBuffer(128 * 1024), { maxEntries: 8 });
      service.setFilePool(pool);
      await service.writeFile('/cached.txt', 'cached');
      await service.readFile('/cached.txt');
      /* Captured before dispose: after it the mount is gone, so a fresh rooted
       * handle cannot even be created and the stale one must refuse. */
      const rooted = service.createRootedFileSystem('/');
      await rooted.search!('cached');
      await service.configureProjectRoots({ projects: [], roots: [{ backend: 'indexeddb' }] });
      const getProvider = vi.spyOn(providerRegistry, 'getProvider');

      service.dispose();

      expect(pool.has('/cached.txt')).toBe(false);
      await expect(service.listProjectManifests()).resolves.toEqual({ entries: [], roots: [] });
      await expect(rooted.search!('cached')).rejects.toThrow();
      expect(getProvider).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // watch API
  // ---------------------------------------------------------------------------

  describe('watch', () => {
    it('should return an unsubscribe function', async () => {
      const unsub = service.watch({ paths: ['/'] }, () => {
        /* Intentionally empty */
      });
      expect(typeof unsub).toBe('function');
      unsub();
    });

    it('should coalesce watch events within 75ms kernel window', async () => {
      const received: WatchEvent[] = [];
      service.watch({ paths: ['/src'], recursive: true }, (event) => {
        received.push(event);
      });

      eventBus.emit({ type: 'fileWritten', path: '/src/a.txt', backend: 'memory' });
      eventBus.emit({ type: 'fileWritten', path: '/src/b.txt', backend: 'memory' });

      expect(received).toHaveLength(0);
      await waitFor(() => received.length >= 2);
      expect(received).toHaveLength(2);
      expect(received.every((event) => event.type === 'change')).toBe(true);
    });
  });

  /* The abort signal went with `getDirectoryStat` (W12d). The rooted `statTree`
   * takes an entry filter, not a signal: a warm index answers without I/O, and a
   * cold build is one walk the rooted view owns. */
});

// =============================================================================
// Integration: WorkspaceFileService + DirectIdbProvider
// =============================================================================

describe('WorkspaceFileService integration [DirectIDB]', () => {
  let service: WorkspaceFileService;

  beforeEach(async () => {
    ({ service } = await createIdbWorkspaceFileService());
  });

  it('should round-trip a string through write and read', async () => {
    await service.writeFile('/test.txt', 'hello');
    const result = await service.readFile('/test.txt', 'utf8');
    expect(result).toBe('hello');
  });

  it('should support writing and reading binary data', async () => {
    const data = new Uint8Array([1, 2, 3, 4]);
    await service.writeFile('/bin.dat', data);
    const result = await service.readFile('/bin.dat');
    expect(result).toEqual(data);
  });

  it('should support batch writeFiles', async () => {
    /* eslint-disable @typescript-eslint/naming-convention -- Path-keyed object */
    await service.writeFiles({
      '/batch/a.txt': { content: encoder.encode('a') },
      '/batch/b.txt': { content: encoder.encode('b') },
    });
    /* eslint-enable @typescript-eslint/naming-convention -- Re-enable after path-keyed object */
    expect(await service.readFile('/batch/a.txt', 'utf8')).toBe('a');
    expect(await service.readFile('/batch/b.txt', 'utf8')).toBe('b');
  });

  it('should emit fileWritten change event on write', async () => {
    const events: ChangeEvent[] = [];
    const eventBus = new ChangeEventBus();

    const providerRegistry = new ProviderRegistry({
      databasePrefix: `test-events-${crypto.randomUUID()}`,
    });
    const provider = await providerRegistry.getProvider({ backend: 'indexeddb' });
    const mountTable = new MountTable();
    mountTable.mount('/', provider, {
      class: 'authored',
      backend: 'indexeddb',
      storageRootKey: providerRegistry.resolveStorageRootKey({ backend: 'indexeddb' }),
    });

    const eventService = new WorkspaceFileService({
      providerRegistry,
      resourceQueue: new ResourceQueue(),
      eventBus,
      mountTable,
    });

    eventBus.subscribe((event) => events.push(event));
    await eventService.writeFile('/evented.txt', 'hello');

    expect(events).toContainEqual(expect.objectContaining({ type: 'fileWritten', path: '/evented.txt' }));
  });

  it('should build the per-root tree index via statTree', async () => {
    await service.writeFile('/tree/a.txt', 'a');
    await service.writeFile('/tree/b/c.txt', 'c');
    const stats = await service.createRootedFileSystem('/').statTree!('');
    expect(stats.length).toBeGreaterThan(0);
  });

  // ---------------------------------------------------------------------------
  // SharedPool integration
  // ---------------------------------------------------------------------------

  describe('SharedPool integration', () => {
    async function createWorkspaceFileServiceWithPool() {
      const buffer = new SharedArrayBuffer(128 * 1024);
      const pool = new SharedPool(buffer, { maxEntries: 128 });

      const providerRegistry = new ProviderRegistry();
      const provider = await providerRegistry.getProvider({ backend: 'memory', storageRootKey: 'memory:test-root' });
      const mountTable = new MountTable();
      mountTable.mount('/', provider, { class: 'authored', backend: 'memory', storageRootKey: 'memory:test-root' });

      const resourceQueue = new ResourceQueue();
      const eventBus = new ChangeEventBus();

      const svc = new WorkspaceFileService({
        providerRegistry,
        resourceQueue,
        eventBus,
        filePool: pool,
        mountTable,
      });

      return { service: svc, pool, eventBus, provider };
    }

    it('stores utf8 reads in the pool under the same conditions as byte reads', async () => {
      const { service: svc, pool } = await createWorkspaceFileServiceWithPool();
      await svc.writeFile('/decoded.txt', 'decoded content');

      await expect(svc.readFile('/decoded.txt', 'utf8')).resolves.toBe('decoded content');

      expect(decoder.decode(pool.resolveCopy('/decoded.txt'))).toBe('decoded content');
    });

    it('keeps a scoped utf8 read out of the pool', async () => {
      const { service: svc, pool } = await createWorkspaceFileServiceWithPool();
      await svc.writeFile('/scoped.txt', 'scoped content');
      const scope = { backend: 'memory', storageRootKey: 'memory:test-root' } as const;

      await expect(svc.readFile('/scoped.txt', { encoding: 'utf8', scope })).resolves.toBe('scoped content');

      expect(pool.has('/scoped.txt')).toBe(false);
    });

    it('keeps cached state for the writes that survived a partial batch failure', async () => {
      const { service: svc, pool, provider } = await createWorkspaceFileServiceWithPool();
      await svc.writeFile('/keep.txt', 'keep');
      await svc.writeFile('/doomed.txt', 'before');
      await svc.readFile('/keep.txt');
      await svc.readFile('/doomed.txt');
      await svc.createRootedFileSystem('/').statTree!('');
      const readdirWithStats = vi.spyOn(provider, 'readdirWithStats');
      const writeFile = provider.writeFile.bind(provider);
      const successfulPath = '/ok.txt';
      const failedPath = '/doomed.txt';
      const failedProviderPath = 'doomed.txt';
      vi.spyOn(provider, 'writeFile').mockImplementation(async (path, data) => {
        if (path === failedProviderPath) {
          throw new Error('write failed');
        }
        return writeFile(path, data);
      });

      await expect(
        svc.writeFiles({ [successfulPath]: { content: 'ok' }, [failedPath]: { content: 'after' } }),
      ).rejects.toThrow('write failed');

      expect(pool.has('/keep.txt')).toBe(true);
      expect(pool.has('/doomed.txt')).toBe(false);
      await expect(svc.createRootedFileSystem('/').statTree!('')).resolves.toContainEqual(
        expect.objectContaining({ path: 'ok.txt' }),
      );
      expect(readdirWithStats).not.toHaveBeenCalled();
    });

    it('should store binary content in pool after readFile', async () => {
      const { service: svc, pool } = await createWorkspaceFileServiceWithPool();
      await svc.writeFile('/cached.txt', 'pooled content');

      await svc.readFile('/cached.txt');

      const cached = pool.resolveCopy('/cached.txt');
      expect(cached).toBeDefined();
      expect(decoder.decode(cached)).toBe('pooled content');
    });

    it('stores aliased reads under only their canonical shared-pool key', async () => {
      const { service: svc, pool } = await createWorkspaceFileServiceWithPool();
      await svc.writeFile('/directory/cached.txt', 'pooled content');

      await svc.readFile('/directory/./cached.txt');

      expect(pool.has('/directory/cached.txt')).toBe(true);
      expect(pool.has('/directory/./cached.txt')).toBe(false);
    });

    it('should invalidate pool entry on writeFile', async () => {
      const { service: svc, pool } = await createWorkspaceFileServiceWithPool();
      await svc.writeFile('/update.txt', 'original');
      await svc.readFile('/update.txt');
      expect(pool.has('/update.txt')).toBe(true);

      await svc.writeFile('/update.txt', 'updated');
      expect(pool.has('/update.txt')).toBe(false);
    });

    it('should invalidate pooled content when writeFiles restores a file', async () => {
      const { service: svc, pool } = await createWorkspaceFileServiceWithPool();
      const path = '/main.scad';
      await svc.writeFile(path, 'cube-with-cutout');
      await svc.readFile(path);
      expect(decoder.decode(pool.resolveCopy(path))).toBe('cube-with-cutout');

      await svc.writeFiles({ [path]: { content: 'plain-cube' } });

      expect(pool.has(path)).toBe(false);
      expect(await svc.readFile(path, 'utf8')).toBe('plain-cube');
    });

    it('should invalidate pool entries on rename', async () => {
      const { service: svc, pool } = await createWorkspaceFileServiceWithPool();
      await svc.writeFile('/old.txt', 'data');
      await svc.readFile('/old.txt');
      expect(pool.has('/old.txt')).toBe(true);

      await svc.move('/old.txt', '/new.txt');
      expect(pool.has('/old.txt')).toBe(false);
      expect(pool.has('/new.txt')).toBe(false);
    });

    it('should invalidate pool entry on unlink', async () => {
      const { service: svc, pool } = await createWorkspaceFileServiceWithPool();
      await svc.writeFile('/delete.txt', 'data');
      await svc.readFile('/delete.txt');
      expect(pool.has('/delete.txt')).toBe(true);

      await svc.unlink('/delete.txt');
      expect(pool.has('/delete.txt')).toBe(false);
    });

    it('should work identically without pool', async () => {
      const { service: svc } = await createWorkspaceFileService();
      await svc.writeFile('/no-pool.txt', 'data');

      const content = await svc.readFile('/no-pool.txt', 'utf8');
      expect(content).toBe('data');
    });

    it('should accept filePool via setFilePool after construction', async () => {
      const { service: svc } = await createWorkspaceFileService();
      const buffer = new SharedArrayBuffer(128 * 1024);
      const pool = new SharedPool(buffer, { maxEntries: 128 });

      svc.setFilePool(pool);

      await svc.writeFile('/late-pool.txt', 'late binding');
      await svc.readFile('/late-pool.txt');

      const cached = pool.resolveCopy('/late-pool.txt');
      expect(cached).toBeDefined();
      expect(decoder.decode(cached)).toBe('late binding');
    });

    it('should invalidate late-bound pool on writeFile', async () => {
      const { service: svc } = await createWorkspaceFileService();
      const buffer = new SharedArrayBuffer(128 * 1024);
      const pool = new SharedPool(buffer, { maxEntries: 128 });

      svc.setFilePool(pool);

      await svc.writeFile('/invalidate.txt', 'original');
      await svc.readFile('/invalidate.txt');
      expect(pool.has('/invalidate.txt')).toBe(true);

      await svc.writeFile('/invalidate.txt', 'updated');
      expect(pool.has('/invalidate.txt')).toBe(false);
    });

    it('keeps pooled bytes readable after the returned buffer is transferred away', async () => {
      const { service: svc, pool } = await createWorkspaceFileServiceWithPool();
      await svc.writeFile('/transferred.bin', 'pooled payload');

      const first = (await svc.readFile('/transferred.bin')) as Uint8Array<ArrayBuffer>;
      // The bridge transfers read results to the main thread, which detaches
      // this buffer on the worker side. The pool must already hold its own copy.
      structuredClone(first, { transfer: [first.buffer] });
      expect(first.buffer.detached).toBe(true);

      expect(decoder.decode(pool.resolveCopy('/transferred.bin'))).toBe('pooled payload');
      await expect(svc.readFile('/transferred.bin', 'utf8')).resolves.toBe('pooled payload');
    });
  });

  // ---------------------------------------------------------------------------
  // getZippedDirectory
  // ---------------------------------------------------------------------------

  describe('getZippedDirectory', () => {
    /* Scope-only since W3: a routed path is archived on its rooted view. */
    const scope = { backend: 'indexeddb' } as const;

    it('should return a Blob containing the directory files as a zip', async () => {
      await service.writeFile('/ziptest/a.txt', 'hello');
      await service.writeFile('/ziptest/b.txt', 'world');

      const blob = await service.getZippedDirectory('/ziptest', { scope });

      expect(blob).toBeInstanceOf(Blob);
      expect(blob.size).toBeGreaterThan(0);
    });

    it('should include files with correct relative paths in the zip', async () => {
      await service.writeFile('/ziptest/sub/nested.txt', 'nested content');
      await service.writeFile('/ziptest/root.txt', 'root content');

      const blob = await service.getZippedDirectory('/ziptest', { scope });
      const jszipModule = await import('jszip');
      const jszip = jszipModule.default;
      const zip = await jszip.loadAsync(await blob.arrayBuffer());

      const paths = Object.keys(zip.files).sort();
      expect(paths).toContain('root.txt');
      expect(paths).toContain('sub/nested.txt');

      const rootContent = await zip.files['root.txt']!.async('string');
      expect(rootContent).toBe('root content');

      const nestedContent = await zip.files['sub/nested.txt']!.async('string');
      expect(nestedContent).toBe('nested content');
    });

    it('should handle empty directories', async () => {
      await service.mkdir('/emptydir', { recursive: true });

      const blob = await service.getZippedDirectory('/emptydir', { scope });

      expect(blob).toBeInstanceOf(Blob);
      expect(blob.size).toBeGreaterThan(0);
    });

    it('rejects missing and file paths instead of returning plausible empty archives', async () => {
      await service.writeFile('/file.txt', 'file');

      await expect(service.getZippedDirectory('/missing', { scope })).rejects.toMatchObject({ code: 'ENOENT' });
      await expect(service.getZippedDirectory('/file.txt', { scope })).rejects.toMatchObject({ code: 'ENOTDIR' });
    });
  });

  describe('protected dynamic mounts', () => {
    let mountedService: WorkspaceFileService;
    let mountedRegistry: ProviderRegistry;

    beforeEach(async () => {
      mountedRegistry = new ProviderRegistry();
      const rootProvider = await mountedRegistry.getProvider({
        backend: 'memory',
        storageRootKey: 'memory:dynamic-test-root',
      });

      const mountTable = new MountTable();
      mountTable.mount('/', rootProvider, {
        class: 'authored',
        backend: 'memory',
        storageRootKey: 'memory:dynamic-test-root',
      });

      mountedService = new WorkspaceFileService({
        providerRegistry: mountedRegistry,
        resourceQueue: new ResourceQueue(),
        eventBus: new ChangeEventBus(),
        mountTable,
      });
    });

    it('mounts and unmounts one isolated preview root', async () => {
      await mountedService.mount('/previews/card-a', {
        class: 'authored',
        backend: 'memory',
        storageRootKey: 'memory:preview:card-a',
      });
      await mountedService.writeFile('/previews/card-a/main.ts', 'preview');
      await expect(mountedService.readFile('/previews/card-a/main.ts', 'utf8')).resolves.toBe('preview');

      mountedService.unmount('/previews/card-a');
      await expect(mountedService.exists('/previews/card-a/main.ts')).resolves.toBe(false);
    });

    it.each(['/data', '/projects/proj_a', '/previews/a/nested', '/previews/../projects/proj_a'])(
      'rejects dynamic prefix %s before provider lookup',
      async (prefix) => {
        const getProvider = vi.spyOn(mountedRegistry, 'getProvider');
        await expect(
          mountedService.mount(prefix, { class: 'authored', backend: 'memory', storageRootKey: 'memory:preview:a' }),
        ).rejects.toThrow(/not admitted|canonical/);
        expect(getProvider).not.toHaveBeenCalled();
      },
    );

    it('rejects a preview identity that does not match its prefix before provider lookup', async () => {
      const getProvider = vi.spyOn(mountedRegistry, 'getProvider');
      await expect(
        mountedService.mount('/previews/card-a', {
          class: 'authored',
          backend: 'memory',
          storageRootKey: 'memory:preview:card-b',
        }),
      ).rejects.toThrow('protected prefix');
      expect(getProvider).not.toHaveBeenCalled();
    });
  });
});
