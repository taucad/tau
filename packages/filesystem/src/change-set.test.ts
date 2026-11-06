import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ChangeEventBus, commonAncestor, toChangeSet, touchedDirectoriesOf } from '#change-event-bus.js';
import type { ChangeSet } from '#change-event-bus.js';
import { ChangeSetCoalescer, mergeChangeSets } from '#event-coalescer.js';
import { WatchRegistry } from '#watch-registry.js';
import { tagEventAuthorities, tagEventOrigin } from '#event-origin-registry.js';
import type { ChangeEvent, PathChangeEvent } from '#types.js';

const backend = 'memory';
const written = (path: string): PathChangeEvent => ({ type: 'fileWritten', path, backend });
const deleted = (path: string): PathChangeEvent => ({ type: 'fileDeleted', path, backend });
const renamed = (oldPath: string, newPath: string): PathChangeEvent => ({
  type: 'fileRenamed',
  oldPath,
  newPath,
  backend,
});
const envelope = (entries: PathChangeEvent[]): ChangeEvent => ({ type: 'changeSet', entries });

/** A frame scheduler the test closes by hand. */
const manualFrames = (): { schedule: (callback: () => void) => () => void; close: () => void; open: number } => {
  const pending = new Set<() => void>();
  const frames = {
    schedule: (callback: () => void) => {
      pending.add(callback);
      return () => {
        pending.delete(callback);
      };
    },
    close: () => {
      const callbacks = [...pending];
      pending.clear();
      for (const callback of callbacks) {
        callback();
      }
    },
    get open() {
      return pending.size;
    },
  };
  return frames;
};

describe('toChangeSet', () => {
  it('turns exact facts into entries with the distinct parents they touched', () => {
    const set = toChangeSet(
      [written('/p/src/a.ts'), written('/p/src/b.ts'), renamed('/p/old/c.ts', '/p/new/c.ts'), deleted('/p/d.ts')],
      7,
    );

    expect(set).toEqual({
      generation: 7,
      backend,
      entries: [
        { op: 'written', path: '/p/src/a.ts', kind: 'file' },
        { op: 'written', path: '/p/src/b.ts', kind: 'file' },
        { op: 'moved', path: '/p/new/c.ts', oldPath: '/p/old/c.ts', kind: 'file' },
        { op: 'deleted', path: '/p/d.ts', kind: 'file' },
      ],
      touchedDirectories: ['/p', '/p/new', '/p/old', '/p/src'],
    });
  });

  it('maps copies to created targets and directory facts to dir entries', () => {
    const set = toChangeSet(
      [
        { type: 'fileCopied', sourcePath: '/a', targetPath: '/b', backend },
        { type: 'directoryCreated', path: '/d', backend },
        { type: 'directoryCopied', sourcePath: '/d', targetPath: '/e', backend },
        { type: 'directoryDeleted', path: '/f', backend },
        { type: 'directoryRenamed', oldPath: '/g', newPath: '/h', backend },
      ],
      1,
    );

    expect(set?.entries.map((entry) => [entry.op, entry.kind, entry.path])).toEqual([
      ['created', 'file', '/b'],
      ['created', 'dir', '/d'],
      ['created', 'dir', '/e'],
      ['deleted', 'dir', '/f'],
      ['moved', 'dir', '/h'],
    ]);
  });

  it('never carries exact entries beside a summary: the whole set resets their common ancestor', () => {
    const set = toChangeSet(
      [written('/p/src/a.ts'), { type: 'directoryChanged', path: '/p/lib', backend }, written('/p/src/b.ts')],
      3,
    );

    expect(set).toEqual({
      generation: 3,
      backend,
      entries: [],
      touchedDirectories: [],
      reset: { prefix: '/p', reason: 'observer-uncertain' },
    });
  });

  it('resets the root for a backend change', () => {
    expect(toChangeSet([{ type: 'backendChanged', backend }], 2)?.reset).toEqual({ prefix: '/', reason: 'topology' });
  });

  it('keeps an origin only when every fact shares it', () => {
    const first = written('/a');
    const second = written('/b');
    tagEventOrigin(first, 'port-1');
    tagEventOrigin(second, 'port-1');
    expect(toChangeSet([first, second], 1)?.origin).toBe('port-1');

    const third = written('/c');
    expect(toChangeSet([first, third], 1)?.origin).toBeUndefined();
  });

  it('answers undefined for nothing admitted', () => {
    expect(toChangeSet([], 1)).toBeUndefined();
  });

  it('computes common ancestors and touched directories', () => {
    expect(commonAncestor('/a/b/c', '/a/b/d')).toBe('/a/b');
    expect(commonAncestor('/a', '/b')).toBe('/');
    expect(commonAncestor('/a/b', '/a/b')).toBe('/a/b');
    expect(touchedDirectoriesOf([{ op: 'written', path: '/x', kind: 'file' }])).toEqual(['/']);
  });
});

describe('ChangeEventBus generation', () => {
  it('advances once per emit, before subscribers run', () => {
    const bus = new ChangeEventBus();
    const seen: number[] = [];
    bus.subscribe(() => {
      seen.push(bus.generation);
    });

    expect(bus.generation).toBe(0);
    bus.emit(written('/a'));
    bus.emit(envelope([written('/b'), written('/c')]));

    expect(seen).toEqual([1, 2]);
  });
});

describe('mergeChangeSets', () => {
  const set = (generation: number, entries: ChangeSet['entries']): ChangeSet => ({
    generation,
    entries,
    touchedDirectories: touchedDirectoriesOf(entries),
  });

  it('collapses an append storm on one log segment into one entry with its write count', () => {
    const appends = Array.from({ length: 40 }, (_, index) =>
      set(index + 1, [{ op: 'written', path: '/p/.tau/chats/c1/log-0001.jsonl', kind: 'file' }]),
    );

    expect(mergeChangeSets(appends)).toEqual({
      generation: 40,
      entries: [{ op: 'written', path: '/p/.tau/chats/c1/log-0001.jsonl', kind: 'file' }],
      touchedDirectories: ['/p/.tau/chats/c1'],
      segments: [{ path: '/p/.tau/chats/c1/log-0001.jsonl', writes: 40 }],
    });
  });

  it('keeps one entry per segment when two segments are appended in one window', () => {
    const merged = mergeChangeSets([
      set(1, [{ op: 'written', path: '/log/a', kind: 'file' }]),
      set(2, [{ op: 'written', path: '/log/b', kind: 'file' }]),
      set(3, [{ op: 'written', path: '/log/a', kind: 'file' }]),
    ]);

    expect(merged?.entries.map((entry) => entry.path)).toEqual(['/log/b', '/log/a']);
    expect(merged?.segments).toEqual([{ path: '/log/a', writes: 2 }]);
  });

  it('keeps a creation through later writes and keeps moves in place', () => {
    const merged = mergeChangeSets([
      set(1, [{ op: 'created', path: '/a', kind: 'file' }]),
      set(2, [{ op: 'moved', path: '/c', oldPath: '/b', kind: 'file' }]),
      set(3, [{ op: 'written', path: '/a', kind: 'file' }]),
    ]);

    expect(merged?.entries).toEqual([
      { op: 'moved', path: '/c', oldPath: '/b', kind: 'file' },
      { op: 'created', path: '/a', kind: 'file' },
    ]);
  });

  it('keeps a directory delete ahead of its recreate, so the old descendants are known gone', () => {
    const merged = mergeChangeSets([
      set(1, [{ op: 'deleted', path: '/p/src', kind: 'dir' }]),
      set(2, [
        { op: 'created', path: '/p/src', kind: 'dir' },
        { op: 'created', path: '/p/src/new.ts', kind: 'file' },
      ]),
    ]);

    expect(merged?.reset).toBeUndefined();
    expect(merged?.entries).toEqual([
      { op: 'deleted', path: '/p/src', kind: 'dir' },
      { op: 'created', path: '/p/src', kind: 'dir' },
      { op: 'created', path: '/p/src/new.ts', kind: 'file' },
    ]);
  });

  it('turns any reset into a reset of everything merged', () => {
    const merged = mergeChangeSets([
      set(1, [{ op: 'written', path: '/p/a/x', kind: 'file' }]),
      { generation: 2, entries: [], touchedDirectories: [], reset: { prefix: '/p/b', reason: 'observer-uncertain' } },
    ]);

    expect(merged).toEqual({
      generation: 2,
      entries: [],
      touchedDirectories: [],
      reset: { prefix: '/p', reason: 'observer-uncertain' },
    });
  });

  it('overflows into a scoped reset past the entry bound', () => {
    const merged = mergeChangeSets(
      [
        set(1, [{ op: 'written', path: '/p/a', kind: 'file' }]),
        set(2, [{ op: 'written', path: '/p/b', kind: 'file' }]),
      ],
      1,
    );

    expect(merged?.reset).toEqual({ prefix: '/p', reason: 'overflow' });
  });
});

describe('ChangeSetCoalescer', () => {
  it('delivers once per frame however many change sets the frame collected', () => {
    const frames = manualFrames();
    const deliveries: ChangeSet[] = [];
    const coalescer = new ChangeSetCoalescer(
      (merged) => {
        deliveries.push(merged);
      },
      { schedule: frames.schedule },
    );

    for (let index = 0; index < 25; index++) {
      coalescer.push({
        generation: index + 1,
        entries: [{ op: 'written', path: '/log', kind: 'file' }],
        touchedDirectories: ['/'],
      });
    }
    expect(frames.open).toBe(1);
    expect(deliveries).toHaveLength(0);

    frames.close();

    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]?.segments).toEqual([{ path: '/log', writes: 25 }]);
  });

  it('flushes on demand and discards on dispose', () => {
    const frames = manualFrames();
    const deliver = vi.fn();
    const coalescer = new ChangeSetCoalescer(deliver, { schedule: frames.schedule });
    coalescer.push({
      generation: 1,
      entries: [{ op: 'written', path: '/a', kind: 'file' }],
      touchedDirectories: ['/'],
    });
    coalescer.flush();
    expect(deliver).toHaveBeenCalledOnce();
    expect(frames.open).toBe(0);

    coalescer.push({
      generation: 2,
      entries: [{ op: 'written', path: '/a', kind: 'file' }],
      touchedDirectories: ['/'],
    });
    coalescer.dispose();
    frames.close();
    expect(deliver).toHaveBeenCalledOnce();
  });
});

describe('WatchRegistry change-set watches', () => {
  let bus: ChangeEventBus;
  let registry: WatchRegistry;
  let frames: ReturnType<typeof manualFrames>;

  beforeEach(() => {
    vi.useFakeTimers();
    bus = new ChangeEventBus();
    frames = manualFrames();
    registry = new WatchRegistry(bus, { frameScheduler: frames.schedule });
  });

  afterEach(() => {
    registry.dispose();
    vi.useRealTimers();
  });

  it('delivers one change set for an agent turn of fifty writes (S8)', () => {
    const deliveries: ChangeSet[] = [];
    registry.watchChangeSets({ paths: ['/projects/p'], recursive: true }, (set) => {
      deliveries.push(set);
    });

    bus.emit(envelope(Array.from({ length: 50 }, (_, index) => written(`/projects/p/agent/t/file-${index}.ts`))));

    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]?.entries).toHaveLength(50);
    expect(deliveries[0]?.touchedDirectories).toEqual(['/projects/p/agent/t']);
    expect(deliveries[0]?.generation).toBe(1);
  });

  it('carries only the facts the watch admits, and nothing for a changeset outside it', () => {
    const handler = vi.fn();
    registry.watchChangeSets({ paths: ['/projects/p/src'], recursive: true, excludes: ['**/*.log'] }, handler);

    bus.emit(
      envelope([written('/projects/p/src/a.ts'), written('/projects/p/src/b.log'), written('/projects/q/c.ts')]),
    );
    bus.emit(envelope([written('/projects/q/d.ts'), written('/projects/p/other.ts')]));

    expect(handler).toHaveBeenCalledOnce();
    expect((handler.mock.calls[0]![0] as ChangeSet).entries.map((entry) => entry.path)).toEqual([
      '/projects/p/src/a.ts',
    ]);
  });

  it('matches a direct watch on its own level only', () => {
    const handler = vi.fn();
    registry.watchChangeSets({ paths: ['/p/src'] }, handler);

    bus.emit(written('/p/src/deep/a.ts'));
    expect(handler).not.toHaveBeenCalled();

    bus.emit(written('/p/src/a.ts'));
    expect(handler).toHaveBeenCalledOnce();
  });

  it('resets a watch whose ancestor directory was replaced', () => {
    const handler = vi.fn();
    registry.watchChangeSets({ paths: ['/p/src/lib'], recursive: true }, handler);

    bus.emit({ type: 'directoryDeleted', path: '/p/src', backend });

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ entries: [], reset: { prefix: '/p/src', reason: 'topology' } }),
    );
  });

  it('resets the common ancestor when one changeset replaces two watched ancestors', () => {
    const handler = vi.fn();
    registry.watchChangeSets({ paths: ['/p/a/lib', '/p/b/lib'], recursive: true }, handler);

    bus.emit(
      envelope([
        { type: 'directoryDeleted', path: '/p/a', backend },
        { type: 'directoryDeleted', path: '/p/b', backend },
      ]),
    );

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ entries: [], reset: { prefix: '/p', reason: 'topology' } }),
    );
  });

  it('resets on a summary that covers the watch', () => {
    const handler = vi.fn();
    registry.watchChangeSets({ paths: ['/p/src/lib'], recursive: true }, handler);

    bus.emit({ type: 'directoryChanged', path: '/p', backend });

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ reset: { prefix: '/p', reason: 'observer-uncertain' } }),
    );
  });

  it('coalesces a chat append storm into one delivery and one entry per segment with frame cadence', () => {
    const deliveries: ChangeSet[] = [];
    registry.watchChangeSets({ paths: ['/p/.tau'], recursive: true, coalesce: 'frame' }, (set) => {
      deliveries.push(set);
    });

    for (let index = 0; index < 30; index++) {
      bus.emit(written('/p/.tau/chats/c1/segment-0.jsonl'));
      bus.emit(written('/p/.tau/chats/c2/segment-0.jsonl'));
    }
    expect(deliveries).toHaveLength(0);
    frames.close();

    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]?.entries).toHaveLength(2);
    expect(deliveries[0]?.segments).toEqual([
      { path: '/p/.tau/chats/c1/segment-0.jsonl', writes: 30 },
      { path: '/p/.tau/chats/c2/segment-0.jsonl', writes: 30 },
    ]);
  });

  it('filters by captured authority', () => {
    const mine = {};
    const theirs = {};
    const handler = vi.fn();
    registry.watchChangeSets({ paths: ['/'], recursive: true }, handler, { authority: mine });

    const foreign = written('/a');
    tagEventAuthorities(foreign, [theirs], false);
    bus.emit(foreign);
    expect(handler).not.toHaveBeenCalled();

    const own = written('/b');
    tagEventAuthorities(own, [mine], false);
    bus.emit(own);
    expect(handler).toHaveBeenCalledOnce();
  });

  it('shares one subscription between identical requests and leaves the bus when the last one goes', () => {
    const subscribe = vi.spyOn(bus, 'subscribe');
    const first = vi.fn();
    const second = vi.fn();
    const stopFirst = registry.watchChangeSets({ paths: ['/a'], recursive: true }, first);
    const stopSecond = registry.watchChangeSets({ paths: ['/a'], recursive: true }, second);
    const stopEvents = registry.watch({ paths: ['/b'], recursive: true }, vi.fn());

    expect(registry.subscriptionCount).toBe(2);
    expect(subscribe).toHaveBeenCalledOnce();

    bus.emit(written('/a/x'));
    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();

    stopFirst();
    stopSecond();
    stopEvents();
    expect(registry.subscriptionCount).toBe(0);
    bus.emit(written('/a/y'));
    expect(first).toHaveBeenCalledOnce();
  });

  it('delivers a root reset from emitResetAll', () => {
    const handler = vi.fn();
    registry.watchChangeSets({ paths: ['/a'] }, handler);

    registry.emitResetAll('sequence-gap');

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ entries: [], reset: { prefix: '/', reason: 'sequence-gap' } }),
    );
  });

  it('offers each fact only to the watches its path can reach', () => {
    const watched = Array.from({ length: 200 }, () => vi.fn<(set: ChangeSet) => void>());
    for (const [index, handler] of watched.entries()) {
      registry.watchChangeSets({ paths: [`/projects/p${index}`], recursive: true }, handler);
    }

    bus.emit(written('/projects/p7/src/a.ts'));

    expect(watched.filter((handler) => handler.mock.calls.length > 0)).toEqual([watched[7]]);
  });
});
