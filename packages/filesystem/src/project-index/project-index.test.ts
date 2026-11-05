// oxlint-disable-next-line import/no-unassigned-import -- Side-effect import to polyfill IndexedDB for tests
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fc from 'fast-check';
import type { FileStatEntry } from '@taucad/types';
import { directoryConcurrency } from '#concurrency.js';
import { MemoryProvider } from '#backend/memory-provider.js';
import type { ProviderRegistry } from '#provider-registry.js';
import type { FileSystemProvider } from '#types.js';
import { createWorkspaceFileService } from '#testing/workspace-service-harness.js';
import { ProjectIndex, timestampGranularityMilliseconds } from '#project-index/project-index.js';
import type { ObservedRow } from '#project-index/project-index.js';
import { ProjectIndexes } from '#project-index/project-indexes.js';
import { readIndexSnapshot, snapshotPath } from '#project-index/index-snapshot.js';
import { tauPathPolicy } from '#path-registry.js';
import type { WorkspaceFileService } from '#workspace-file-service.js';

const file = (path: string, size: number, mtimeMs: number): ObservedRow => ({ path, kind: 'file', size, mtimeMs });
const directory = (path: string): ObservedRow => ({ path, kind: 'dir', size: 0, mtimeMs: 0 });

/** An index after one complete observation of these rows. */
const observed = (rows: readonly ObservedRow[]): ProjectIndex => {
  const index = new ProjectIndex();
  index.completeObservation(index.beginObservation(), '', rows);
  return index;
};

const paths = (rows: readonly FileStatEntry[]): string[] => rows.map((row) => row.path).toSorted();

describe('ProjectIndex', () => {
  describe('queries', () => {
    let index: ProjectIndex;

    beforeEach(() => {
      index = observed([
        directory('src'),
        file('src/main.ts', 100, 1000),
        directory('src/utils'),
        file('src/utils/helper.ts', 50, 2000),
        file('README.md', 200, 3000),
        directory('exports'),
      ]);
    });

    it('should be complete after a whole-root observation', () => {
      expect(index.isComplete).toBe(true);
      expect(new ProjectIndex().isComplete).toBe(false);
    });

    it('should answer one entry with head metadata and no unmeasured facts', () => {
      expect(index.entry('src/main.ts')).toMatchObject({ kind: 'file', size: 100, mtimeMs: 1000 });
      expect(index.entry('src/main.ts')?.facts).toBeUndefined();
      expect(index.entry('missing.ts')).toBeUndefined();
    });

    it('should list one level sorted by name', () => {
      expect(index.children('').map((entry) => entry.path)).toEqual(['README.md', 'exports', 'src']);
      expect(index.children('src').map((entry) => entry.path)).toEqual(['src/main.ts', 'src/utils']);
    });

    it('should stat a subtree relative to it, files only, without content facts it does not know', () => {
      expect(paths(index.statTree(''))).toEqual(['README.md', 'src/main.ts', 'src/utils/helper.ts']);
      expect(index.statTree('src')).toEqual([
        { path: 'main.ts', name: 'main.ts', type: 'file', size: 100, mtimeMs: 1000 },
        { path: 'utils/helper.ts', name: 'helper.ts', type: 'file', size: 50, mtimeMs: 2000 },
      ]);
      expect(index.statTree('missing')).toEqual([]);
    });

    it('should never descend into what the mask refuses', () => {
      const asked: string[] = [];
      const rows = index.statTree('', {
        admits: (path) => {
          asked.push(path);
          return path !== 'src/utils';
        },
      });
      expect(paths(rows)).toEqual(['README.md', 'src/main.ts']);
      expect(asked).not.toContain('src/utils/helper.ts');
    });

    it('should count a subtree', () => {
      expect(index.stats('')).toEqual({ files: 3, dirs: 3, bytes: 350 });
      expect(index.stats('src')).toEqual({ files: 2, dirs: 1, bytes: 150 });
    });

    it('should search paths case-insensitively within the cap', () => {
      expect(index.search('MAIN').map((row) => row.path)).toEqual(['src/main.ts']);
      expect(index.search('', { maxResults: 2 })).toHaveLength(2);
      expect(index.search('utils').map((row) => row.path)).toEqual(['src/utils/helper.ts']);
      expect(index.search('utils', { includeDirectories: true }).map((row) => row.path)).toEqual([
        'src/utils',
        'src/utils/helper.ts',
      ]);
    });

    it('should answer only entries changed after a generation', () => {
      const before = index.generation;
      index.recordFile('src/new.ts', { size: 1 });
      expect(index.changedSince(before).map((entry) => entry.path)).toEqual(['src/new.ts']);
    });
  });

  describe('mutations', () => {
    it('should equal a fresh observation after a generated mutation sequence', () => {
      const candidates = ['a.ts', 'src/b.ts', 'src/c.ts', 'lib/d.ts'] as const;
      const command = fc.record({
        operation: fc.constantFrom('write', 'delete', 'rename'),
        path: fc.constantFrom(...candidates),
        target: fc.constantFrom(...candidates),
        size: fc.integer({ min: 0, max: 10_000 }),
      });

      fc.assert(
        fc.property(fc.array(command, { maxLength: 100 }), (commands) => {
          const incremental = observed([]);
          const files = new Map<string, number>();
          for (const { operation, path, target, size } of commands) {
            if (operation === 'write') {
              files.set(path, size);
              incremental.recordFile(path, { size, mtimeMs: size });
            } else if (operation === 'delete') {
              files.delete(path);
              incremental.remove(path);
            } else {
              const previous = files.get(path);
              if (previous !== undefined && path !== target) {
                files.delete(path);
                files.set(target, previous);
                incremental.move(path, target);
              }
            }
          }
          const fresh = observed([...files].map(([path, size]) => file(path, size, size)));
          const comparable = (index: ProjectIndex): Array<{ path: string; size: number }> =>
            index
              .statTree('')
              .map(({ path, size }) => ({ path, size }))
              .toSorted((left, right) => (left.path < right.path ? -1 : 1));
          expect(comparable(incremental)).toEqual(comparable(fresh));
        }),
      );
    });

    it('should move a directory with its contents', () => {
      const index = observed([directory('a'), file('a/x.ts', 1, 1), directory('a/b'), file('a/b/y.ts', 2, 2)]);
      index.move('a', 'z');
      expect(paths(index.statTree(''))).toEqual(['z/b/y.ts', 'z/x.ts']);
    });

    it('should mark a rename target unknown when the source was never indexed', () => {
      const index = observed([]);
      index.move('unknown/a', 'known/a');
      expect(index.stalePaths).toEqual(['known/a']);
    });
  });

  describe('observation merge (D5)', () => {
    it('should keep a write recorded during a scan and the rest of the scan', () => {
      const index = new ProjectIndex();
      const start = index.beginObservation();
      index.recordFile('written.ts', { size: 5 });
      index.completeObservation(start, '', [file('scanned.ts', 1, 1)]);
      expect(paths(index.statTree(''))).toEqual(['scanned.ts', 'written.ts']);
    });

    it('should keep a removal recorded during a scan over what the scan listed', () => {
      const index = observed([directory('src'), file('src/a.ts', 1, 1), file('b.ts', 1, 1)]);
      const start = index.beginObservation();
      index.remove('src');
      index.completeObservation(start, '', [directory('src'), file('src/a.ts', 1, 1), file('b.ts', 1, 1)]);
      expect(paths(index.statTree(''))).toEqual(['b.ts']);
    });

    it('should report created, removed and changed entries and drop their facts', () => {
      const index = observed([file('same.ts', 1, 1), file('edited.ts', 2, 2), file('gone.ts', 3, 3)]);
      index.recordFacts(
        'edited.ts',
        { contentKind: 'text', lineCount: 2 },
        { size: 2, mtimeMs: 2, observedAt: 10_000 },
      );
      index.recordFacts('same.ts', { contentKind: 'text', lineCount: 1 }, { size: 1, mtimeMs: 1, observedAt: 10_000 });

      const result = index.completeObservation(index.beginObservation(), '', [
        file('same.ts', 1, 1),
        file('edited.ts', 2, 9),
        file('new.ts', 4, 4),
      ]);

      expect(result.checked).toBe(3);
      expect([...result.mismatched].toSorted()).toEqual(['edited.ts', 'gone.ts', 'new.ts']);
      expect(index.factsFor('edited.ts')).toBeUndefined();
      expect(index.factsFor('same.ts')).toEqual({ contentKind: 'text', lineCount: 1 });
    });

    it('should adopt the provider mtime for a write-path fact and keep the facts, untrusted while racy', () => {
      const index = observed([]);
      index.recordFile('a.ts', { size: 3, facts: { contentKind: 'text', lineCount: 1 }, observedAt: 5000 });
      expect(index.factsFor('a.ts')).toEqual({ contentKind: 'text', lineCount: 1 });

      const result = index.completeObservation(index.beginObservation(), '', [file('a.ts', 3, 4999)]);

      expect(result.mismatched).toEqual([]);
      expect(index.entry('a.ts')).toMatchObject({ mtimeMs: 4999, factsAt: { mtimeMs: 4999 } });
      expect(index.factsFor('a.ts')).toEqual({ contentKind: 'text', lineCount: 1 });
      /* Measured within the timestamp granularity of the bytes' own mtime: racy (H12). */
      expect(result.racy).toEqual(['a.ts']);
      expect(index.trusted('a.ts')).toBe(false);
    });
  });

  describe('facts and the racy guard (I5)', () => {
    it('should trust facts measured well after the bytes changed', () => {
      const index = observed([file('a.ts', 3, 1000)]);
      index.recordFacts(
        'a.ts',
        { contentKind: 'text', lineCount: 1, sha256: 'ab' },
        { size: 3, mtimeMs: 1000, observedAt: 1000 + timestampGranularityMilliseconds + 1 },
      );
      expect(index.trusted('a.ts')).toBe(true);
    });

    it('should never trust facts measured inside the timestamp granularity', () => {
      const index = observed([file('a.ts', 3, 1000)]);
      index.recordFacts(
        'a.ts',
        { contentKind: 'text', lineCount: 1 },
        { size: 3, mtimeMs: 1000, observedAt: 1000 + timestampGranularityMilliseconds },
      );
      expect(index.factsFor('a.ts')).toBeDefined();
      expect(index.trusted('a.ts')).toBe(false);
    });

    it('should stop answering facts once the size or mtime moves', () => {
      const index = observed([file('a.ts', 3, 1000)]);
      index.recordFacts('a.ts', { contentKind: 'binary' }, { size: 3, mtimeMs: 1000, observedAt: 99_999 });
      index.completeObservation(index.beginObservation(), '', [file('a.ts', 3, 1001)]);
      expect(index.factsFor('a.ts')).toBeUndefined();
      expect(index.trusted('a.ts')).toBe(false);
    });

    it('should not trust an entry an external fact left unknown', () => {
      const index = observed([file('a.ts', 3, 1000)]);
      index.recordFacts('a.ts', { contentKind: 'binary' }, { size: 3, mtimeMs: 1000, observedAt: 99_999 });
      index.invalidate('a.ts');
      expect(index.trusted('a.ts')).toBe(false);
    });
  });

  describe('snapshot', () => {
    it('should round-trip entries and trusted facts, and need a compare before it is complete', () => {
      const index = observed([directory('src'), file('src/a.ts', 3, 1000), directory('empty')]);
      index.recordFacts(
        'src/a.ts',
        { contentKind: 'text', lineCount: 2 },
        { size: 3, mtimeMs: 1000, observedAt: 9000 },
      );
      index.recordFile('pending.ts', { size: 1, facts: { contentKind: 'text', lineCount: 1 } });

      const loaded = ProjectIndex.fromSnapshot(index.toSnapshot(), index.generation);

      expect(loaded.isComplete).toBe(false);
      expect(loaded.children('').map((entry) => entry.path)).toEqual(['empty', 'pending.ts', 'src']);
      expect(loaded.factsFor('src/a.ts')).toEqual({ contentKind: 'text', lineCount: 2 });
      expect(loaded.trusted('src/a.ts')).toBe(true);
      /* A fact still waiting for the provider's mtime is not persisted. */
      expect(loaded.factsFor('pending.ts')).toBeUndefined();
    });
  });

  describe('performance', () => {
    /* The claim is about the walk — one pass, one row per entry — not about this
     * machine, so it is the best of five runs. */
    it('should stat a 6,265-file tree under 20 ms', () => {
      const rows: ObservedRow[] = [];
      for (let i = 0; i < 6265; i++) {
        const folder = `dir${Math.floor(i / 100)}`;
        if (i % 100 === 0) {
          rows.push(directory(folder));
        }
        rows.push(file(`${folder}/file${i}.ts`, i, 1000));
      }
      const index = observed(rows);

      let elapsed = Number.POSITIVE_INFINITY;
      for (let run = 0; run < 5; run++) {
        const start = performance.now();
        const stats = index.statTree('');
        elapsed = Math.min(elapsed, performance.now() - start);
        expect(stats).toHaveLength(6265);
      }
      expect(elapsed).toBeLessThan(20);
    });
  });
});

/** A memory provider standing in for a durable root, with a count of content reads outside the index's own files. */
const durableRoot = async (): Promise<{ provider: MemoryProvider; reads: () => number }> => {
  const provider = new MemoryProvider();
  await provider.mkdir('project', { recursive: true });
  const readFile = vi.spyOn(provider, 'readFile');
  return {
    provider,
    reads: () => readFile.mock.calls.filter(([path]) => !String(path).includes('.tau-index')).length,
  };
};

const defaultTab = { tabId: 'tab-a', seq: 0 };
const indexesOver = (provider: FileSystemProvider, tab: { tabId: string; seq: number } = defaultTab): ProjectIndexes =>
  new ProjectIndexes({
    resolve: () => ({ provider, path: 'project', persist: { lockName: 'tau-index:test:project' } }),
    policy: tauPathPolicy,
    tab: () => tab,
    persistDelayMilliseconds: 60_000,
  });

describe('ProjectIndexes', () => {
  it('should open, list and compare a root reading no file content (I3)', async () => {
    const { provider, reads } = await durableRoot();
    await provider.writeFile('project/src/a.ts', 'a\nb');
    await provider.writeFile('project/.jj/store', 'ref');
    await provider.writeFile('project/.tau-index/junk', 'x');
    const indexes = indexesOver(provider);

    const index = await indexes.ready('/p');
    const compared = await indexes.compare('/p');

    expect(paths(index.statTree(''))).toEqual(['src/a.ts']);
    expect(compared.mismatched).toEqual([]);
    expect(reads()).toBe(0);
  });

  it('should answer lazy facts once, within the byte cap, and cache them by (size, mtime)', async () => {
    const { provider, reads } = await durableRoot();
    await provider.writeFile('project/small.ts', 'one\ntwo');
    await provider.writeFile('project/large.ts', 'x'.repeat(100));
    const indexes = indexesOver(provider);

    const first = await indexes.facts('/p', ['small.ts', 'large.ts', 'missing.ts'], { byteCap: 50 });
    const second = await indexes.facts('/p', ['small.ts']);

    expect([...first]).toEqual([['small.ts', { contentKind: 'text', lineCount: 2 }]]);
    expect(second.get('small.ts')).toEqual({ contentKind: 'text', lineCount: 2 });
    expect(reads()).toBe(1);
  });

  it('should record facts from the write path without a read', async () => {
    const { provider, reads } = await durableRoot();
    const indexes = new ProjectIndexes({
      resolve: () => ({ provider, path: 'project' }),
      persistDelayMilliseconds: 60_000,
    });
    await indexes.ready('/p');
    await provider.writeFile('project/a.ts', 'a\nb\nc');
    indexes.addFile('/p/a.ts', { size: 5, facts: { contentKind: 'text', lineCount: 3 } });

    const facts = await indexes.facts('/p', ['a.ts']);
    expect(facts.get('a.ts')).toEqual({ contentKind: 'text', lineCount: 3 });
    expect(reads()).toBe(0);
  });

  it('should survive a reload and detect an external edit by its compare', async () => {
    const { provider, reads } = await durableRoot();
    await provider.writeFile('project/kept.ts', 'kept');
    await provider.writeFile('project/edited.ts', 'before');
    const first = indexesOver(provider);
    await first.facts('/p', ['kept.ts', 'edited.ts']);
    expect(await first.persist('/p')).toBe('written');
    await provider.writeFile('project/edited.ts', 'after!!');
    await provider.writeFile('project/added.ts', 'new');
    const readsBefore = reads();

    const second = indexesOver(provider, { tabId: 'tab-b', seq: 0 });
    const index = await second.ready('/p');
    const facts = await second.facts('/p', ['kept.ts']);

    expect(paths(index.statTree(''))).toEqual(['added.ts', 'edited.ts', 'kept.ts']);
    expect(index.entry('edited.ts')).toMatchObject({ size: 7 });
    expect(index.factsFor('edited.ts')).toBeUndefined();
    expect(facts.get('kept.ts')).toEqual({ contentKind: 'text', lineCount: 1 });
    expect(reads()).toBe(readsBefore);
  });

  it('should never let a tab that is behind overwrite a newer snapshot', async () => {
    const { provider } = await durableRoot();
    await provider.writeFile('project/a.ts', 'a');
    const tabA = { tabId: 'tab-a', seq: 0 };
    const tabB = { tabId: 'tab-b', seq: 0 };
    const a = indexesOver(provider, tabA);
    const b = indexesOver(provider, tabB);
    await a.ready('/p');
    await b.ready('/p');

    /* Tab A publishes a change notice tab B never receives. */
    await provider.writeFile('project/b.ts', 'b');
    a.addFile('/p/b.ts', { size: 1 });
    tabA.seq = 1;
    expect(await a.persist('/p')).toBe('written');

    expect(await b.persist('/p')).toBe('stale');
    const stored = await readIndexSnapshot(provider, 'project');
    expect(stored?.vector.seqByTab).toEqual({ 'tab-a': 1 });
    expect(stored?.entries.map(([path]) => path)).toContain('b.ts');

    /* Once B accounts for A's notice it is no longer behind. */
    b.noteNotice('tab-a', 1, false);
    expect(await b.persist('/p')).toBe('written');
  });

  it('should re-observe what a notice left unknown before storing a snapshot that claims it', async () => {
    const { provider, reads } = await durableRoot();
    await provider.writeFile('project/a.ts', 'a');
    const indexes = indexesOver(provider);
    await indexes.ready('/p');
    /* Another tab's notice names b.ts: the index knows only that it is unknown. */
    await provider.writeFile('project/b.ts', 'bb');
    indexes.noteNotice('tab-b', 1, false);
    indexes.invalidate('/p/b.ts');

    expect(await indexes.persist('/p')).toBe('written');

    const stored = await readIndexSnapshot(provider, 'project');
    expect(stored?.vector.seqByTab).toMatchObject({ 'tab-b': 1 });
    expect(stored?.entries.find(([path]) => path === 'b.ts')?.slice(0, 3)).toEqual(['b.ts', 'f', 2]);
    expect(reads()).toBe(0);
  });

  it('should mark a snapshot from two incomparable tabs for a rescan', async () => {
    const { provider } = await durableRoot();
    await provider.writeFile('project/a.ts', 'a');
    const a = indexesOver(provider, { tabId: 'tab-a', seq: 1 });
    const b = indexesOver(provider, { tabId: 'tab-b', seq: 1 });
    await a.ready('/p');
    await b.ready('/p');
    expect(await a.persist('/p')).toBe('written');
    expect(await b.persist('/p')).toBe('written');

    const stored = await readIndexSnapshot(provider, 'project');
    expect(stored).toMatchObject({ rescan: true, vector: { seqByTab: { 'tab-a': 1, 'tab-b': 1 } } });
    const loads = vi.spyOn(ProjectIndex, 'fromSnapshot');
    await indexesOver(provider, { tabId: 'tab-c', seq: 0 }).ready('/p');
    expect(loads).not.toHaveBeenCalled();
    expect(snapshotPath('project')).toBe('project/.tau-index/snapshot.json');
  });

  it('should compare in full after a sequence gap', async () => {
    const { provider } = await durableRoot();
    await provider.writeFile('project/a.ts', 'a');
    const indexes = indexesOver(provider);
    await indexes.ready('/p');
    /* Another tab wrote; its notice was lost. */
    await provider.writeFile('project/b.ts', 'b');
    indexes.noteNotice('tab-z', 5, true);

    const index = await indexes.ready('/p');

    expect(paths(index.statTree(''))).toEqual(['a.ts', 'b.ts']);
  });

  it('should re-observe only the path an external fact names', async () => {
    const { provider } = await durableRoot();
    await provider.writeFile('project/a.ts', 'a');
    await provider.writeFile('project/b.ts', 'b');
    const indexes = new ProjectIndexes({ resolve: () => ({ provider, path: 'project' }) });
    await indexes.ready('/p');
    await provider.writeFile('project/a.ts', 'grown');
    await provider.unlink('project/b.ts');
    const listings = vi.spyOn(provider, 'readdirWithStats');

    indexes.invalidate('/p/a.ts');
    const index = await indexes.ready('/p');

    expect(index.entry('a.ts')?.size).toBe(5);
    /* Not named, so not re-observed: the scoped refresh lists nothing. */
    expect(index.entry('b.ts')).toBeDefined();
    expect(listings).not.toHaveBeenCalled();
  });

  /* G7: one index holds one mount's tree. */
  it('should not answer or record past a nested mount', async () => {
    const { provider } = await durableRoot();
    await provider.writeFile('project/main.ts', 'm');
    const indexes = new ProjectIndexes({
      mountPrefixes: () => ['/p', '/p/nested'],
      resolve: () => ({ provider, path: 'project' }),
    });
    await indexes.ready('/p');

    indexes.addFile('/p/nested/added.ts', { size: 1 });

    expect(indexes.statTree('/p/nested')).toBeUndefined();
    expect(indexes.statType('/p/nested/added.ts')).toBeUndefined();
    expect(indexes.statTree('/p')?.map((row) => row.path)).toEqual(['main.ts']);
  });

  /* W7c: a topology change drops the changed prefix and the root covering it, and no sibling. */
  it('should evict the changed prefix and the root that covers it, leaving every sibling warm', async () => {
    const { provider } = await durableRoot();
    const indexes = new ProjectIndexes({ resolve: () => ({ provider, path: 'project' }) });
    await indexes.ready('/');
    await indexes.ready('/previews/x');
    await indexes.ready('/projects/p');

    indexes.evict('/previews/x');

    expect(indexes.get('/previews/x')).toBeUndefined();
    expect(indexes.get('/')).toBeUndefined();
    expect(indexes.get('/projects/p')).toBeDefined();
  });
});

/**
 * `ProjectIndexes` bookkeeping as the authority drives it: every mutation must
 * leave the per-root index answering the next `statTree`. W5 moved these rows
 * here byte-for-byte from the Service spec because the index owns them.
 */
describe('WorkspaceFileService', () => {
  let service: WorkspaceFileService;
  let provider: FileSystemProvider;
  let providerRegistry: ProviderRegistry;

  beforeEach(async () => {
    ({ service, provider, providerRegistry } = await createWorkspaceFileService());
  });

  // ---------------------------------------------------------------------------
  // Cold index build
  // ---------------------------------------------------------------------------

  describe('cold build', () => {
    it('should merge a cold scan with a concurrent rename instead of discarding it', async () => {
      await service.writeFile('/old.ts', 'old');
      const scanned = Promise.withResolvers<void>();
      const release = Promise.withResolvers<void>();
      const readdirWithStats = provider.readdirWithStats!.bind(provider);
      vi.spyOn(provider, 'readdirWithStats').mockImplementation((async (path: string) => {
        const entries = await readdirWithStats(path);
        if (path === '') {
          scanned.resolve();
          await release.promise;
        }
        return entries;
      }) as typeof readdirWithStats);

      const rooted = service.createRootedFileSystem('/');
      const pending = rooted.statTree!('');
      await scanned.promise;
      await service.move('/old.ts', '/new.ts');
      release.resolve();

      await expect(pending).resolves.toMatchObject([{ path: 'new.ts' }]);
      await expect(rooted.statTree!('')).resolves.toMatchObject([{ path: 'new.ts' }]);
    });

    it('should discard a cold scan when its captured mount is replaced', async () => {
      const projectId = 'proj_coldcoldcoldcoldcoldc';
      const root = `/projects/${projectId}`;
      await service.configureProjectRoots({
        projects: [{ projectId, backend: 'memory', storageRootKey: 'memory:project:old', providerBasePath: projectId }],
        roots: [],
      });
      const oldRoot = service.createRootedFileSystem(root);
      await oldRoot.writeFile('old.ts', 'old');
      const oldProvider = await providerRegistry.getProvider({
        backend: 'memory',
        storageRootKey: 'memory:project:old',
      });
      const scanned = Promise.withResolvers<void>();
      const release = Promise.withResolvers<void>();
      const readdirWithStats = oldProvider.readdirWithStats!.bind(oldProvider);
      vi.spyOn(oldProvider, 'readdirWithStats').mockImplementation((async (path: string) => {
        const entries = await readdirWithStats(path);
        if (path === projectId) {
          scanned.resolve();
          await release.promise;
        }
        return entries;
      }) as typeof readdirWithStats);

      const pending = oldRoot.statTree!('');
      await scanned.promise;
      await service.configureProjectRoots({
        projects: [{ projectId, backend: 'memory', storageRootKey: 'memory:project:new', providerBasePath: projectId }],
        roots: [],
      });
      const replacement = service.createRootedFileSystem(root);
      await replacement.writeFile('new.ts', 'new');
      release.resolve();

      await expect(pending).rejects.toMatchObject({ code: 'ESTALE' });
      await expect(replacement.statTree!('')).resolves.toMatchObject([{ path: 'new.ts' }]);
    });

    /* Budget row (W7b): the walk lists sibling directories from one bounded
     * pool. Fully sequential, a 500-directory project pays 500 round trips in
     * series, which is the whole cold-index latency on a port or on IndexedDB. */
    it('should list sibling directories from one bounded pool', async () => {
      const directories = directoryConcurrency * 3;
      for (let directory = 0; directory < directories; directory++) {
        // oxlint-disable-next-line no-await-in-loop -- Fixture writes, one directory at a time.
        await service.writeFile(`/dir${directory}/a.txt`, 'a');
      }
      let inFlight = 0;
      let maxInFlight = 0;
      const listings = provider.readdirWithStats!.bind(provider);
      vi.spyOn(provider, 'readdirWithStats').mockImplementation((async (path: string) => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        try {
          return await listings(path);
        } finally {
          inFlight -= 1;
        }
      }) as typeof listings);

      const stats = await service.createRootedFileSystem('/').statTree!('');

      expect(stats).toHaveLength(directories);
      expect(maxInFlight).toBeGreaterThan(1);
      expect(maxInFlight).toBeLessThanOrEqual(directoryConcurrency);
    });

    /* The policy's `statTree` (6,265 files) row, asserted where a consumer pays
     * it — through the authority's rooted surface, not on a bare index. A
     * ceiling, not a target (EQ5), and the best of five runs for the reason the
     * index's own row gives. */
    it('should answer a warm statTree over 6,265 files inside its 10 ms budget', async () => {
      const files = 6265;
      /* Straight at the provider: this measures the read path, and 6,265 trips
       * through the mutation pipeline would measure the write one. */
      await Promise.all(
        Array.from({ length: files }, async (_, file) =>
          provider.writeFile(`dir${Math.floor(file / 100)}/file${file}.ts`, 'export {};\n'),
        ),
      );
      const rooted = service.createRootedFileSystem('/');
      expect(await rooted.statTree!('')).toHaveLength(files);

      let elapsed = Number.POSITIVE_INFINITY;
      for (let run = 0; run < 5; run++) {
        const start = performance.now();
        // oxlint-disable-next-line no-await-in-loop -- Runs are measured one at a time, by definition.
        const stats = await rooted.statTree!('');
        elapsed = Math.min(elapsed, performance.now() - start);
        expect(stats).toHaveLength(files);
      }

      expect(elapsed).toBeLessThan(10);
    });

    /* Budget row (W7c): mounting one prefix used to drop every index, so the
     * next query on each open root paid a full cold walk again. */
    it('should leave a warm sibling index warm when an unrelated prefix is mounted', async () => {
      await service.mount('/previews/a', {
        class: 'authored',
        backend: 'memory',
        storageRootKey: 'memory:preview:a',
      });
      const preview = service.createRootedFileSystem('/previews/a');
      await preview.writeFile('main.ts', 'a');
      expect(await preview.statTree!('')).toHaveLength(1);
      const previewProvider = await providerRegistry.getProvider({
        backend: 'memory',
        storageRootKey: 'memory:preview:a',
      });
      const rebuilds = vi.spyOn(previewProvider, 'readdirWithStats');

      await service.mount('/previews/b', {
        class: 'authored',
        backend: 'memory',
        storageRootKey: 'memory:preview:b',
      });

      expect(await preview.statTree!('')).toHaveLength(1);
      expect(rebuilds).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // In-memory tree integration
  // ---------------------------------------------------------------------------

  describe('in-memory tree integration', () => {
    /* The index is read through the rooted surface since W12d, where the view
     * masks its rows; the invalidation the authority owns is what these pin. */
    const statTree = async (path: string): Promise<FileStatEntry[]> =>
      service.createRootedFileSystem('/').statTree!(path);

    it('should reflect writeFile in subsequent statTree', async () => {
      await service.writeFile('/root/a.txt', 'aaa');
      await statTree('root');

      await service.writeFile('/root/b.txt', 'bb');

      const stats = await statTree('root');
      const paths = stats.map((s) => s.path).sort();
      expect(paths).toEqual(['a.txt', 'b.txt']);
    });

    it('should reflect mkdir in subsequent statTree', async () => {
      await service.writeFile('/root/a.txt', 'a');
      await statTree('root');

      await service.mkdir('/root/sub');
      await service.writeFile('/root/sub/x.txt', 'x');

      const stats = await statTree('root/sub');
      expect(stats).toHaveLength(1);
      expect(stats[0]!.path).toBe('x.txt');
    });

    it('should reflect unlink in subsequent statTree', async () => {
      await service.writeFile('/root/a.txt', 'a');
      await service.writeFile('/root/b.txt', 'b');
      await statTree('root');

      await service.unlink('/root/a.txt');

      const stats = await statTree('root');
      expect(stats).toHaveLength(1);
      expect(stats[0]!.path).toBe('b.txt');
    });

    it('should reflect a move in subsequent statTree', async () => {
      await service.writeFile('/root/old.txt', 'data');
      await statTree('root');

      await service.move('/root/old.txt', '/root/new.txt');

      const stats = await statTree('root');
      const paths = stats.map((s) => s.path);
      expect(paths).toContain('new.txt');
      expect(paths).not.toContain('old.txt');
    });

    it('should reflect rmdir in subsequent statTree', async () => {
      await service.mkdir('/root/sub', { recursive: true });
      await service.writeFile('/root/a.txt', 'a');
      await statTree('root');

      await service.rmdir('/root/sub');

      const stats = await statTree('root');
      expect(stats).toHaveLength(1);
      expect(stats[0]!.path).toBe('a.txt');
    });

    it('should reflect duplicateFile in subsequent statTree', async () => {
      await service.writeFile('/root/src.txt', 'copy');
      await statTree('root');

      await service.createRootedFileSystem('/').duplicate!('root/src.txt', 'root/dst.txt');

      const stats = await statTree('root');
      const paths = stats.map((s) => s.path).sort();
      expect(paths).toEqual(['dst.txt', 'src.txt']);
    });

    it('should reflect a rooted copyTree in subsequent statTree', async () => {
      await service.writeFile('/root/src/a.txt', 'aaa');
      await service.writeFile('/root/src/sub/b.txt', 'bb');
      await statTree('root');

      await service.createRootedFileSystem('/').copyTree!('root/src', 'root/dest');

      const stats = await statTree('root/dest');
      const paths = stats.map((s) => s.path).sort();
      expect(paths).toEqual(['a.txt', 'sub/b.txt']);
    });
  });
});
