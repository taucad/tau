// oxlint-disable-next-line import/no-unassigned-import -- Side-effect import to polyfill IndexedDB for tests
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChangeEvent, FileSystemProvider } from '#types.js';
import { ChangeEventBus } from '#change-event-bus.js';
import { composeView } from '#composed-view.js';
import { contents } from '#content-ops/contents.js';
import { withReadContentOps } from '#content-ops/read-ops.js';
import { MountTable } from '#mount-table.js';
import { tauPathPolicy } from '#path-registry.js';
import { ProviderRegistry } from '#provider-registry.js';
import { ResourceQueue } from '#resource-queue.js';
import {
  createIdbWorkspaceFileService,
  createWorkspaceFileService,
  decoder,
} from '#testing/workspace-service-harness.js';
import { WorkspaceFileService } from '#workspace-file-service.js';
import type { RootedFileSystem } from '#rooted-views.js';
import { WorkspaceMutationError } from '#workspace-errors.js';
import type { FileStatEntry } from '@taucad/types';

type IdbHarness = Awaited<ReturnType<typeof createIdbWorkspaceFileService>>;

/**
 * The mutating porcelain a rooted view serves (charter D4, W5 step 2).
 *
 * Every case here asserts the two properties the authority's own porcelain has
 * and a per-file re-expression would lose: confinement to the captured mount
 * (Rule 15) and batch semantics — one lock set, one summary event, targeted
 * invalidation (Rule 5a). The mask is not here: it belongs to `composeView`
 * above, and `composed-view.test.ts` pins it.
 */

const projectId = 'proj_ppppppppppppppppppppp';
const projectRoute = `/projects/${projectId}`;

let service: WorkspaceFileService;
let events: ChangeEvent[];
const openServices: WorkspaceFileService[] = [];

const createService = async (): Promise<WorkspaceFileService> => {
  const providerRegistry = new ProviderRegistry();
  const scope = { backend: 'memory', storageRootKey: 'memory:rooted-views' } as const;
  const provider = await providerRegistry.getProvider(scope);
  const mountTable = new MountTable();
  mountTable.mount('/', provider, { class: 'authored', ...scope });
  const eventBus = new ChangeEventBus();
  events = [];
  eventBus.subscribe((event) => {
    events.push(event);
  });
  const created = new WorkspaceFileService({
    providerRegistry,
    resourceQueue: new ResourceQueue(),
    eventBus,
    mountTable,
  });
  openServices.push(created);
  await created.configureProjectRoots({
    projects: [{ projectId, ...scope, providerBasePath: 'gear-system' }],
    roots: [],
  });
  return created;
};

const view = (): RootedFileSystem => service.createRootedFileSystem(projectRoute);

beforeEach(async () => {
  service = await createService();
  for (const [path, content] of Object.entries({
    'src/main.ts': 'export const part = 1;',
    'src/lib/helper.ts': 'export const helper = 2;',
    'tau.json': '{}',
  })) {
    // oxlint-disable-next-line no-await-in-loop -- Deterministic seed order keeps the fixture readable.
    await service.writeFile(`${projectRoute}/${path}`, content);
  }
  events = [];
});

afterEach(() => {
  for (const open of openServices.splice(0)) {
    open.dispose();
  }
});

describe('rooted porcelain', () => {
  it('should copy a subtree inside the captured mount', async () => {
    const rooted = view();

    await rooted.copyTree!('src', 'backup');

    await expect(rooted.readFile('backup/main.ts', 'utf8')).resolves.toBe('export const part = 1;');
    await expect(rooted.readFile('backup/lib/helper.ts', 'utf8')).resolves.toBe('export const helper = 2;');
  });

  it('should copy a subtree as one batch with one summary event (Rule 5a)', async () => {
    await view().copyTree!('src', 'backup');

    expect(events.filter((event) => event.type === 'directoryCopied')).toStrictEqual([
      {
        type: 'directoryCopied',
        sourcePath: `${projectRoute}/src`,
        targetPath: `${projectRoute}/backup`,
        backend: 'memory',
      },
    ]);
  });

  it('should refuse a copy whose operand leaves the captured mount', async () => {
    const rooted = view();

    await expect(rooted.copyTree!('src', '/projects/other/backup')).rejects.toThrow();
    await expect(rooted.copyTree!('../elsewhere', 'backup')).rejects.toThrow();
  });

  it('should honour the caller filter on every entry of a copy', async () => {
    await view().copyTree!('src', 'backup', { admits: (relativePath) => relativePath !== 'lib' });

    await expect(view().exists('backup/main.ts')).resolves.toBe(true);
    await expect(view().exists('backup/lib')).resolves.toBe(false);
  });

  it('should duplicate one file', async () => {
    await view().duplicate!('src/main.ts', 'src/main.copy.ts');

    await expect(view().readFile('src/main.copy.ts', 'utf8')).resolves.toBe('export const part = 1;');
  });

  it('should move one path and answer with the resulting stat', async () => {
    const stat = await view().move!('src/main.ts', 'src/renamed.ts');

    expect(stat).toMatchObject({ type: 'file' });
    await expect(view().exists('src/main.ts')).resolves.toBe(false);
    expect(events.filter((event) => event.type === 'fileRenamed')).toHaveLength(1);
  });

  it('should report every completed and failed edit of a bulk move', async () => {
    const result = await view().bulkMove!([
      { source: 'src/main.ts', target: 'src/one.ts' },
      { source: 'src/absent.ts', target: 'src/two.ts' },
    ]);

    expect(result.moved.map(({ edit }) => edit.target)).toStrictEqual(['src/one.ts']);
    expect(result.failed.map(({ error }) => error.code)).toStrictEqual(['NOT_FOUND']);
  });

  it('should write a batch of files through the canonical mutation path', async () => {
    await view().writeFiles!({
      'src/a.ts': { content: 'export const a = 1;' },
      'src/b.ts': { content: 'export const b = 2;' },
    });

    await expect(view().readFile('src/a.ts', 'utf8')).resolves.toBe('export const a = 1;');
    await expect(view().readFile('src/b.ts', 'utf8')).resolves.toBe('export const b = 2;');
  });

  it('should refuse a batch write that leaves the captured mount', async () => {
    await expect(view().writeFiles!({ '../escape.ts': { content: 'nope' } })).rejects.toThrow();
  });

  it('should answer the move preflight with the typed refusal', async () => {
    const rooted = view();

    await expect(rooted.canMove!('src/main.ts', 'src/renamed.ts')).resolves.toBe(true);
    await expect(rooted.canMove!('src/absent.ts', 'src/renamed.ts')).resolves.toMatchObject({ code: 'NOT_FOUND' });
    await expect(rooted.canMove!('src/main.ts', 'tau.json')).resolves.toMatchObject({ code: 'NAME_EXISTS' });
    await expect(rooted.canMove!('src/main.ts', '/absolute')).resolves.toMatchObject({ code: 'INVALID_NAME' });
  });

  it('should answer the rename, create and delete preflights', async () => {
    const rooted = view();

    await expect(rooted.canRename!('src/main.ts', 'renamed.ts')).resolves.toBe(true);
    await expect(rooted.canRename!('src/main.ts', 'nested/name.ts')).resolves.toMatchObject({ code: 'INVALID_NAME' });
    await expect(rooted.canCreate!('src/fresh.ts', 'file')).resolves.toBe(true);
    await expect(rooted.canCreate!('tau.json', 'file')).resolves.toMatchObject({ code: 'NAME_EXISTS' });
    await expect(rooted.canDelete!('tau.json')).resolves.toBe(true);
    await expect(rooted.canDelete!('absent.json')).resolves.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('should fail closed once the captured mount is replaced', async () => {
    const rooted = view();
    service.disposeStorageRoot('memory:rooted-views');

    await expect(rooted.copyTree!('src', 'backup')).rejects.toMatchObject({ code: 'ESTALE' });
    await expect(rooted.move!('src/main.ts', 'src/renamed.ts')).rejects.toMatchObject({ code: 'ESTALE' });
    await expect(rooted.writeFiles!({ 'src/a.ts': { content: 'a' } })).rejects.toMatchObject({ code: 'ESTALE' });
  });

  it('should keep the preflight refusal spelled in the rooted namespace', async () => {
    const refusal = await view().canMove!('src/absent.ts', 'src/renamed.ts');

    expect(refusal).toBeInstanceOf(WorkspaceMutationError);
    expect((refusal as WorkspaceMutationError).path).toBe('src/absent.ts');
  });

  it('should acquire the mutation locks once for a whole batch', async () => {
    const queue = new ResourceQueue();
    const claim = vi.spyOn(queue, 'queueForMany');
    const providerRegistry = new ProviderRegistry();
    const scope = { backend: 'memory', storageRootKey: 'memory:rooted-views-locks' } as const;
    const provider = await providerRegistry.getProvider(scope);
    const mountTable = new MountTable();
    mountTable.mount('/', provider, { class: 'authored', ...scope });
    const batched = new WorkspaceFileService({
      providerRegistry,
      resourceQueue: queue,
      eventBus: new ChangeEventBus(),
      mountTable,
    });
    openServices.push(batched);
    await batched.configureProjectRoots({
      projects: [{ projectId, ...scope, providerBasePath: 'gear-system' }],
      roots: [],
    });
    const rooted = batched.createRootedFileSystem(projectRoute);
    await rooted.writeFiles!({ 'a.ts': { content: 'a' } });
    claim.mockClear();

    await rooted.copyTree!('', 'backup');

    expect(claim).toHaveBeenCalledOnce();
  });
});

/**
 * The rooted surface also serves rows the authority used to own directly:
 * `duplicate`/`copyTree`, the recursive `contents` walk, `statTree`, `search`
 * and `archive`. W5 moved them here byte-for-byte from the Service spec — they
 * still drive the composition root, because that is where a rooted view is
 * opened, but `rooted-views.ts` owns what they assert.
 */
describe('WorkspaceFileService', () => {
  let service: WorkspaceFileService;

  beforeEach(async () => {
    ({ service } = await createWorkspaceFileService());
  });

  // ---------------------------------------------------------------------------
  // duplicate / copyTree over the rooted surface
  // ---------------------------------------------------------------------------

  /* The authority had `duplicateFile` and `copyDirectory`; both walked or wrote a
   * project tree unmasked (W0 pin (d)), and W12d retired them with their last
   * consumers. The rows are the authority's, kept on the surface that now serves
   * them — where the composed view above supplies the entry filter (D4). */
  describe('duplicate and copyTree over the rooted surface', () => {
    it('should copy a file to a new location', async () => {
      await service.writeFile('/src.txt', 'copy me');
      await service.createRootedFileSystem('/').duplicate!('src.txt', 'dst.txt');
      const content = await service.readFile('/dst.txt', 'utf8');
      expect(content).toBe('copy me');
      expect(await service.exists('/src.txt')).toBe(true);
    });

    it('should create parent directories for the destination', async () => {
      await service.writeFile('/orig.txt', 'data');
      await service.createRootedFileSystem('/').duplicate!('orig.txt', 'deep/nested/copy.txt');
      const content = await service.readFile('/deep/nested/copy.txt', 'utf8');
      expect(content).toBe('data');
    });

    it('should recursively copy a directory', async () => {
      await service.writeFile('/source/a.txt', 'aaa');
      await service.writeFile('/source/sub/b.txt', 'bbb');
      await service.createRootedFileSystem('/').copyTree!('source', 'dest');
      expect(await service.readFile('/dest/a.txt', 'utf8')).toBe('aaa');
      expect(await service.readFile('/dest/sub/b.txt', 'utf8')).toBe('bbb');
    });

    it('should preserve empty directories, including an entirely empty source', async () => {
      const rooted = service.createRootedFileSystem('/');
      await service.mkdir('/source/empty/nested', { recursive: true });
      await rooted.copyTree!('source', 'dest');
      await service.mkdir('/entirely-empty');
      await rooted.copyTree!('entirely-empty', 'empty-copy');

      await expect(service.stat('/dest/empty')).resolves.toMatchObject({ type: 'dir' });
      await expect(service.stat('/dest/empty/nested')).resolves.toMatchObject({ type: 'dir' });
      await expect(service.stat('/empty-copy')).resolves.toMatchObject({ type: 'dir' });
    });
  });

  // ---------------------------------------------------------------------------
  // recursive contents over the rooted surface
  // ---------------------------------------------------------------------------

  /* The authority had `getDirectoryContents`; its last consumer (project
   * duplication) moved to the project's own composed view in W7, so the walk is
   * reached as the `contents` content operation over a rooted surface (D2). The
   * rows are the authority's, kept on the surface that now serves them. */
  describe('contents over the rooted surface', () => {
    const rootedContents = async (path: string): Promise<Record<string, Uint8Array<ArrayBuffer>>> =>
      contents(service.createRootedFileSystem('/'), path);

    it('should return all files with relative paths', async () => {
      await service.writeFile('/proj/readme.md', '# Hi');
      await service.writeFile('/proj/src/main.ts', 'code');
      const files = await rootedContents('proj');
      expect(decoder.decode(files['readme.md'])).toBe('# Hi');
      expect(decoder.decode(files['src/main.ts'])).toBe('code');
    });

    it('should propagate a missing-directory error', async () => {
      await expect(rootedContents('nonexistent')).rejects.toMatchObject({ code: 'ENOENT' });
    });

    it('distinguishes an empty directory from a file path', async () => {
      await service.mkdir('/empty');
      await service.writeFile('/file.txt', 'file');

      await expect(rootedContents('empty')).resolves.toEqual({});
      await expect(rootedContents('file.txt')).rejects.toMatchObject({ code: 'ENOTDIR' });
    });
  });

  // ---------------------------------------------------------------------------
  // statTree over the rooted surface
  // ---------------------------------------------------------------------------

  /* `getDirectoryStat` answered from the per-root index with nothing masking the
   * rows on the way out; W12d retired it and a consumer reaches the same index
   * through `statTree`, where the composed view applies its policy (D3). */
  describe('statTree over the rooted surface', () => {
    const statTree = async (path: string): Promise<FileStatEntry[]> =>
      service.createRootedFileSystem('/').statTree!(path);

    it('should return stat entries for all files recursively', async () => {
      await service.writeFile('/stats/a.txt', 'aaa');
      await service.writeFile('/stats/sub/b.txt', 'bb');
      const stats = await statTree('stats');
      expect(stats).toHaveLength(2);

      const paths = stats.map((s) => s.path).sort();
      expect(paths).toEqual(['a.txt', 'sub/b.txt']);

      const aEntry = stats.find((s) => s.name === 'a.txt')!;
      expect(aEntry.type).toBe('file');
      expect(aEntry.size).toBeGreaterThan(0);
      expect(aEntry.mtimeMs).toBeGreaterThan(0);
    });

    it('should return empty array for an empty directory', async () => {
      await service.mkdir('/emptystats');
      const stats = await statTree('emptystats');
      expect(stats).toEqual([]);
    });

    it('should return subdirectory stats from in-memory tree after initial scan', async () => {
      await service.writeFile('/stats/a.txt', 'aaa');
      await service.writeFile('/stats/sub/b.txt', 'bb');
      await statTree('stats');

      const subStats = await statTree('stats/sub');
      expect(subStats).toHaveLength(1);
      expect(subStats[0]!.path).toBe('b.txt');
      expect(subStats[0]!.name).toBe('b.txt');
    });

    it('should list a new file under a subpath after write following initial scan', async () => {
      await service.writeFile('/stats/a.txt', 'aaa');
      await statTree('stats');
      await service.writeFile('/stats/sub/c.txt', 'ccc');

      const subStats = await statTree('stats/sub');
      expect(subStats.some((s) => s.path === 'c.txt' && s.name === 'c.txt')).toBe(true);
    });
  });
});

describe('WorkspaceFileService integration [DirectIDB]', () => {
  let service: WorkspaceFileService;
  let rootProvider: FileSystemProvider;
  let mountMemory: IdbHarness['mountMemory'];
  let scanSpies: IdbHarness['scanSpies'];

  beforeEach(async () => {
    ({ service, rootProvider, mountMemory, scanSpies } = await createIdbWorkspaceFileService());
  });

  /* The index is read through the rooted surface since W12d (D3); these rows are
   * the authority's index behaviour, on the surface that now serves it. */
  describe('search over the rooted surface', () => {
    const search = async (
      root: string,
      query: string,
      options?: { maxResults?: number; includeDirectories?: boolean },
    ): Promise<FileStatEntry[]> => service.createRootedFileSystem(root).search!(query, options);
    const warmRoot = async (root: string): Promise<unknown> => service.createRootedFileSystem(root).statTree!('');

    it('should return matching files from the tree index', async () => {
      await service.writeFile('/src/main.ts', 'console.log("hi")');
      await service.writeFile('/src/utils/helper.ts', 'export {}');
      await service.writeFile('/README.md', '# Hello');
      await warmRoot('/');

      const results = await search('/', 'helper');
      expect(results).toHaveLength(1);
      expect(results[0]!.path).toBe('src/utils/helper.ts');
    });

    it('should build the requested root when the tree is cold', async () => {
      const results = await search('/', 'anything');
      expect(results).toEqual([]);
    });

    it('should forward maxResults option', async () => {
      await service.writeFile('/a.ts', 'a');
      await service.writeFile('/b.ts', 'b');
      await service.writeFile('/c.ts', 'c');
      await warmRoot('/');

      const results = await search('/', '.ts', { maxResults: 2 });
      expect(results).toHaveLength(2);
    });

    it('should forward includeDirectories option', async () => {
      await service.writeFile('/src/main.ts', 'a');
      await warmRoot('/');

      const results = await search('/', 'src', { includeDirectories: true });
      const types = results.map((r) => r.type);
      expect(types).toContain('dir');
    });

    /*
     * Charter D3: the index is per root, so two roots queried alternately both
     * stay warm. The single-slot index this replaced rebuilt on every switch.
     */
    it('keeps two roots warm across alternating searches', async () => {
      const a = await mountMemory('/a', 'memory:warm-a');
      const b = await mountMemory('/b', 'memory:warm-b');
      await service.writeFile('/a/a-only.ts', 'a');
      await service.writeFile('/b/b-only.ts', 'b');
      await expect(search('/a', 'only')).resolves.toMatchObject([{ path: 'a-only.ts' }]);
      await expect(search('/b', 'only')).resolves.toMatchObject([{ path: 'b-only.ts' }]);
      const reads = [...scanSpies(a), ...scanSpies(b)];

      await expect(search('/a', 'only')).resolves.toMatchObject([{ path: 'a-only.ts' }]);
      await expect(search('/b', 'only')).resolves.toMatchObject([{ path: 'b-only.ts' }]);

      for (const spy of reads) {
        expect(spy).not.toHaveBeenCalled();
      }
    });

    /*
     * Charter D3's acceptance: a warm query performs no provider walk at all.
     * The spies cover every read a scan can make, so a fallback walk sneaking
     * back in fails here rather than only showing up as latency.
     */
    it('serves a warm search and statTree without reading the provider', async () => {
      await service.writeFile('/src/main.ts', 'a');
      await service.writeFile('/src/util/helper.ts', 'b');
      const rooted = service.createRootedFileSystem('/');
      const reads = (['readdirWithStats', 'readdirEntries', 'readdir', 'stat'] as const)
        .filter((method) => typeof rootProvider[method] === 'function')
        .map((method) => vi.spyOn(rootProvider, method));

      await expect(rooted.search!('helper')).resolves.toMatchObject([{ path: 'src/util/helper.ts' }]);

      /* Cold: exactly one scan of the root and its one subdirectory. */
      expect(reads.some((spy) => spy.mock.calls.length > 0)).toBe(true);
      for (const spy of reads) {
        spy.mockClear();
      }

      await expect(rooted.search!('main')).resolves.toMatchObject([{ path: 'src/main.ts' }]);
      await expect(rooted.statTree!('')).resolves.toHaveLength(2);
      await expect(rooted.statTree!('src/util')).resolves.toMatchObject([{ path: 'helper.ts' }]);

      for (const spy of reads) {
        expect(spy).not.toHaveBeenCalled();
      }
    });

    it('returns concurrent root scans from their local trees independent of completion order', async () => {
      const aProvider = await mountMemory('/a', 'memory:concurrent-a');
      const bProvider = await mountMemory('/b', 'memory:concurrent-b');
      await service.writeFile('/a/a-only.ts', 'a');
      await service.writeFile('/b/b-only.ts', 'b');
      const aGate = Promise.withResolvers<void>();
      const bGate = Promise.withResolvers<void>();
      const holdReaddir = (provider: FileSystemProvider, gate: PromiseWithResolvers<void>): void => {
        const original = provider.readdir.bind(provider);
        vi.spyOn(provider, 'readdir').mockImplementation(async (path) => {
          await gate.promise;
          return original(path);
        });
      };
      holdReaddir(aProvider, aGate);
      holdReaddir(bProvider, bGate);

      const a = search('/a', 'only');
      const b = search('/b', 'only');
      bGate.resolve();
      await expect(b).resolves.toMatchObject([{ path: 'b-only.ts' }]);
      aGate.resolve();
      await expect(a).resolves.toMatchObject([{ path: 'a-only.ts' }]);
    });
  });

  // ---------------------------------------------------------------------------
  // archive over the rooted view — the surface a project export now reaches
  // ---------------------------------------------------------------------------

  /*
   * The whole-project export is served by `archive` over the connection's
   * composed view (charter D2, W3), so these are the assertions the authority's
   * own zip used to carry. Nothing filters the control plane here: the view
   * never enumerates it. `versionedOnly` is the caller's own filter, built the
   * way the file-manager worker builds it.
   */
  describe('archive over the project rooted view', () => {
    const projectId = 'proj_zzzzzzzzzzzzzzzzzzzzz';
    const projectRoute = `/projects/${projectId}`;

    /** Every seeded path, project-relative, across all four registry answers. */
    const seeded = {
      'main.ts': 'export const part = 1;',
      'tau.json': '{}',
      '.gitignore': 'node_modules',
      '.tau/parameters/size.json': '{"width":10}',
      'thumbnail.webp': 'webp-bytes',
      'exports/part.stl': 'solid part',
      '.tau/chats/chat_a/log.json': '{"messages":[]}',
      '.git/HEAD': 'ref: refs/heads/main',
      '.git/refs/heads/main': 'abc123',
    } as const;

    /** Archived files, excluding the parent folder rows JSZip creates on its own. */
    const zipEntries = async (blob: Blob): Promise<string[]> => {
      const jszipModule = await import('jszip');
      const jszip = jszipModule.default;
      const zip = await jszip.loadAsync(await blob.arrayBuffer());
      return Object.values(zip.files)
        .filter((file) => !file.dir)
        .map((file) => file.name)
        .sort();
    };

    /** The rooted read content operation exactly as `handlerForRoot` composes it. */
    const projectArchive = async (path: string, options?: { versionedOnly?: boolean }): Promise<Blob> =>
      withReadContentOps(
        composeView(
          { filesystem: service.createRootedFileSystem(projectRoute) },
          { consumer: 'user', policy: tauPathPolicy },
        ),
        tauPathPolicy,
      ).archive(path, options);

    beforeEach(async () => {
      await service.configureProjectRoots({
        projects: [{ projectId, backend: 'memory', storageRootKey: 'memory:0', providerBasePath: 'gear-system' }],
        roots: [],
      });
      for (const [path, content] of Object.entries(seeded)) {
        // oxlint-disable-next-line no-await-in-loop -- Deterministic seed order keeps the fixture readable.
        await service.writeFile(`${projectRoute}/${path}`, content);
      }
    });

    it('should omit control-plane paths from a project archive without reading their bytes', async () => {
      const readFile = vi.spyOn(rootProvider, 'readFile');

      const entries = await zipEntries(await projectArchive(''));

      expect(entries).toContain('main.ts');
      expect(entries).toContain('.tau/chats/chat_a/log.json');
      expect(entries).toContain('thumbnail.webp');
      expect(entries.filter((entry) => entry.startsWith('.git/'))).toEqual([]);
      expect(readFile.mock.calls.filter(([path]) => path.includes('/.git/') || path.includes('/revisions/'))).toEqual(
        [],
      );
    });

    it('should archive only versioned project bytes when versionedOnly is set', async () => {
      const entries = await zipEntries(await projectArchive('', { versionedOnly: true }));

      expect(entries).toEqual(['.gitignore', '.tau/parameters/size.json', 'main.ts', 'tau.json']);
    });

    it('should archive an unversioned records folder when that folder is the archive root', async () => {
      const entries = await zipEntries(await projectArchive('exports'));

      expect(entries).toEqual(['part.stl']);
    });

    /* The registry is asked about project-relative spellings whatever the
     * archive root is, so a versioned-only export of one folder keeps that
     * folder's versioned bytes instead of misclassifying every name. */
    it('should classify project-relative when a versionedOnly archive is rooted at a subfolder', async () => {
      const entries = await zipEntries(await projectArchive('.tau/parameters', { versionedOnly: true }));

      expect(entries).toEqual(['size.json']);
    });
  });
});
