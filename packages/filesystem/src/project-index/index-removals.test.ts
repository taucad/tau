/**
 * The Project Index's removal record (W6.3, S10): what `changes` answers for
 * a path the index stopped holding, how far back it can answer, and that a
 * reload continues it — so a capture driven by index deltas never misses a
 * deletion and never reads a gap as "nothing changed".
 */
// oxlint-disable-next-line import/no-unassigned-import -- Side-effect import to polyfill IndexedDB for tests
import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import { MemoryProvider } from '#backend/memory-provider.js';
import { indexRemovalLimit, ProjectIndex } from '#project-index/project-index.js';
import type { IndexChanges, ObservedRow } from '#project-index/project-index.js';
import { ProjectIndexes } from '#project-index/project-indexes.js';
import { parseIndexSnapshot, readIndexSnapshot, serializeIndexSnapshot } from '#project-index/index-snapshot.js';
import { tauPathPolicy } from '#path-registry.js';

const file = (path: string, size: number, mtimeMs: number): ObservedRow => ({ path, kind: 'file', size, mtimeMs });
const directory = (path: string): ObservedRow => ({ path, kind: 'dir', size: 0, mtimeMs: 0 });

const observed = (rows: readonly ObservedRow[]): ProjectIndex => {
  const index = new ProjectIndex({ trustworthyMtime: true });
  index.completeObservation(index.beginObservation(), '', rows);
  return index;
};

const removedPaths = (changes: IndexChanges): string[] => changes.removed.map(({ path }) => path);
const changedPaths = (changes: IndexChanges): string[] => changes.entries.map(({ path }) => path);

describe('ProjectIndex removals (S10)', () => {
  it('should answer a removed file and a removed directory once, with its kind and generation', () => {
    const index = observed([
      directory('src'),
      file('src/a.ts', 1, 1000),
      file('src/b.ts', 1, 1000),
      file('c.ts', 1, 1),
    ]);
    const before = index.generation;
    index.remove('src/a.ts');
    const fileGone = index.generation;
    index.remove('src');

    const changes = index.changes(before);
    expect(changes.rescan).toBeUndefined();
    expect(changes.removed).toEqual([
      { path: 'src/a.ts', kind: 'file', generation: fileGone },
      { path: 'src', kind: 'dir', generation: index.generation },
    ]);
    expect(changedPaths(changes)).toEqual([]);
    expect(removedPaths(index.changes(fileGone))).toEqual(['src']);
    expect(index.changes(index.generation)).toMatchObject({ entries: [], removed: [] });
  });

  it('should list a path removed and written again both as removed and as changed', () => {
    const index = observed([file('a.ts', 1, 1000)]);
    const before = index.generation;
    index.remove('a.ts');
    index.recordFile('a.ts', { size: 2 });

    const changes = index.changes(before);
    expect(removedPaths(changes)).toEqual(['a.ts']);
    expect(changedPaths(changes)).toEqual(['a.ts']);
  });

  it('should answer a move as its source removed and its target changed', () => {
    const index = observed([directory('src'), file('src/a.ts', 1, 1000)]);
    const before = index.generation;
    index.move('src/a.ts', 'lib/a.ts');

    const changes = index.changes(before);
    expect(removedPaths(changes)).toEqual(['src/a.ts']);
    expect(changedPaths(changes)).toEqual(['lib', 'lib/a.ts']);
  });

  it('should answer what an observation found gone, at one path or under a prefix', () => {
    const index = observed([
      directory('src'),
      file('src/a.ts', 1, 1000),
      file('src/b.ts', 1, 1000),
      file('c.ts', 1, 1),
    ]);
    const before = index.generation;
    index.completeObservation(index.beginObservation(), 'src', [file('src/a.ts', 1, 1000)]);
    index.completePathObservation(index.beginObservation(), 'c.ts', undefined);

    expect(removedPaths(index.changes(before))).toEqual(['src/b.ts', 'c.ts']);
  });

  it('should answer whatever a write of another kind replaced as removed', () => {
    const index = observed([directory('out'), file('out/a.stl', 1, 1000), file('notes', 1, 1000)]);
    const before = index.generation;
    /* A file over a directory takes the directory's children with it; a directory over a file, the file. */
    index.recordFile('out', { size: 3 });
    index.recordFile('notes/today.md', { size: 1 });

    const changes = index.changes(before);
    expect(changes.removed.map(({ path, kind }) => [path, kind])).toEqual([
      ['out', 'dir'],
      ['notes', 'file'],
    ]);
    expect(changedPaths(changes)).toEqual(['out', 'notes', 'notes/today.md']);
  });

  it('should ask the mask about each removal', () => {
    const index = observed([directory('src'), file('src/a.ts', 1, 1000), file('b.ts', 1, 1000)]);
    const before = index.generation;
    index.remove('src/a.ts');
    index.remove('b.ts');

    const admits = (path: string): boolean => !path.startsWith('src');
    expect(removedPaths(index.changes(before, { admits }))).toEqual(['b.ts']);
  });

  it('should answer rescan, never a gap, once a caller is older than the oldest removal it still holds', () => {
    const index = observed([]);
    const start = index.generation;
    for (let at = 0; at <= indexRemovalLimit; at += 1) {
      index.recordFile(`f${String(at)}.ts`, { size: 1 });
    }
    const written = index.generation;
    for (let at = 0; at <= indexRemovalLimit; at += 1) {
      index.remove(`f${String(at)}.ts`);
    }

    /* One past the limit: the first removal is dropped, so a caller from before it cannot be answered. */
    expect(index.changes(start)).toMatchObject({ rescan: true, entries: [], removed: [] });
    expect(index.changes(written)).toMatchObject({ rescan: true });
    const firstKept = written + 1;
    const kept = index.changes(firstKept);
    expect(kept.rescan).toBeUndefined();
    expect(kept.removed).toHaveLength(indexRemovalLimit);
    expect(kept.removed[0]?.path).toBe('f1.ts');
  });

  it('should answer rescan for a since from another epoch or from past its own generation', () => {
    const index = observed([file('a.ts', 1, 1000)]);
    const since = index.generation;
    index.remove('a.ts');

    expect(index.changes(since, { epoch: index.epoch }).rescan).toBeUndefined();
    expect(index.changes(since, { epoch: 'another-lineage' })).toMatchObject({ rescan: true, epoch: index.epoch });
    expect(index.changes(index.generation + 1).rescan).toBe(true);
  });

  it('should continue a loaded snapshot’s removals for the since it reported, and no later one', () => {
    const before = observed([file('a.ts', 1, 1000), file('b.ts', 1, 1000)]);
    const since = before.generation;
    before.remove('a.ts');
    const stored = before.generation;
    const removals = before.removalSnapshot();
    const rows = before.toSnapshot();
    /* A generation the writer issued after it stored: lost with the writer, issued again by the reload. */
    before.remove('b.ts');
    const lost = before.generation;

    const loaded = ProjectIndex.fromSnapshot(rows, stored, { removals });
    expect(loaded.epoch).not.toBe(before.epoch);
    expect(removedPaths(loaded.changes(since, { epoch: before.epoch }))).toEqual(['a.ts']);
    expect(loaded.changes(lost, { epoch: before.epoch }).rescan).toBe(true);
    loaded.remove('b.ts');
    expect(removedPaths(loaded.changes(stored, { epoch: before.epoch }))).toEqual(['b.ts']);
    expect(removedPaths(loaded.changes(stored, { epoch: loaded.epoch }))).toEqual(['b.ts']);
    /* A snapshot without a record knows nothing before its own generation. */
    const bare = ProjectIndex.fromSnapshot(rows, stored);
    expect(bare.changes(since, { epoch: before.epoch }).rescan).toBe(true);
    expect(bare.changes(stored).rescan).toBeUndefined();
  });
});

describe('ProjectIndexes removal record', () => {
  it('should store the removal record with the snapshot and answer it after a reload, reading no content (I3)', async () => {
    const provider = new MemoryProvider();
    Object.defineProperty(provider, 'capabilities', { value: { ...provider.capabilities, trustworthyMtime: true } });
    await provider.mkdir('project/src', { recursive: true });
    await provider.writeFile('project/src/a.ts', 'a');
    await provider.writeFile('project/b.ts', 'b');
    const reads = vi.spyOn(provider, 'readFile');
    const over = (): ProjectIndexes =>
      new ProjectIndexes({
        resolve: () => ({ provider, path: 'project', persist: { lockName: 'tau-index:test:removals' } }),
        policy: tauPathPolicy,
        tab: () => ({ tabId: 'tab-a', seq: 0 }),
        persistDelayMilliseconds: 60_000,
      });
    const first = over();
    const index = await first.ready('/p');
    const since = index.generation;
    const { epoch } = index;
    await provider.unlink('project/src/a.ts');
    first.removeFile('/p/src/a.ts');
    expect(await first.persist('/p')).toBe('written');

    const stored = await readIndexSnapshot(provider, 'project');
    expect(stored?.removals?.removed.map(([path]) => path)).toEqual(['src/a.ts']);
    const reloaded = await over().ready('/p');
    expect(removedPaths(reloaded.changes(since, { epoch }))).toEqual(['src/a.ts']);
    expect(reads.mock.calls.filter(([path]) => !String(path).includes('.tau/index'))).toStrictEqual([]);
  });

  it('should drop a malformed removal record whole, so the reload answers rescan rather than a gap', () => {
    const snapshot = {
      vector: { generation: 5, seqByTab: {} },
      rescan: false,
      writtenAt: 1,
      entries: [],
      removals: { epoch: 'e', floor: 0, removed: [['a.ts', 'f', 3]] as Array<[string, 'f' | 'd', number]> },
    } as const;
    expect(parseIndexSnapshot(serializeIndexSnapshot(snapshot))?.removals).toEqual(snapshot.removals);
    const malformed = JSON.parse(serializeIndexSnapshot(snapshot)) as { removals: { removed: unknown[] } };
    malformed.removals.removed.push(['', 'f', 4]);
    const parsed = parseIndexSnapshot(JSON.stringify(malformed));
    expect(parsed).toBeDefined();
    expect(parsed?.removals).toBeUndefined();
  });
});
