import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import {
  EventCoalescer,
  coalesceChangeEvents,
  overflowLossSignals,
  pruneDirectorySummaries,
} from '#event-coalescer.js';
import { getEventOrigin, tagEventOrigin } from '#event-origin-registry.js';
import { scopeEventToRoot } from '#scope-event-to-root.js';
import type { PathChangeEvent } from '#types.js';

const testBackend = 'memory';

const written = (path: string): PathChangeEvent => ({ type: 'fileWritten', path, backend: testBackend });
const deleted = (path: string): PathChangeEvent => ({ type: 'fileDeleted', path, backend: testBackend });
const renamed = (oldPath: string, newPath: string): PathChangeEvent => ({
  type: 'fileRenamed',
  oldPath,
  newPath,
  backend: testBackend,
});

describe('coalesceChangeEvents (pure)', () => {
  it('should preserve the generated final state of every path', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            path: fc.constantFrom('/a.txt', '/b.txt', '/nested/c.txt', '/nested/d.txt'),
            exists: fc.boolean(),
          }),
          { minLength: 1, maxLength: 100 },
        ),
        (facts) => {
          const events = facts.map(({ path, exists }) => (exists ? written(path) : deleted(path)));
          const expected = new Map(facts.map(({ path, exists }) => [path, exists]));
          const actual = new Map(
            coalesceChangeEvents(events).flatMap((event) =>
              'path' in event ? ([[event.path, event.type === 'fileWritten']] as const) : [],
            ),
          );

          expect(actual).toEqual(expected);
        },
      ),
    );
  });

  it('should leave every path a batch of file and directory writes, deletes, moves and copies touched in its final state', () => {
    const presence = (sequence: readonly PathChangeEvent[]): Map<string, boolean> => {
      const state = new Map<string, boolean>();
      for (const event of sequence) {
        switch (event.type) {
          case 'fileRenamed':
          case 'directoryRenamed': {
            state.set(event.oldPath, false);
            state.set(event.newPath, true);
            break;
          }
          case 'fileCopied': {
            state.set(event.targetPath, true);
            break;
          }
          case 'fileWritten':
          case 'directoryCreated': {
            state.set(event.path, true);
            break;
          }
          case 'fileDeleted':
          case 'directoryDeleted': {
            state.set(event.path, false);
            break;
          }
          default: {
            break;
          }
        }
      }
      return state;
    };
    const path = fc.constantFrom('/a', '/b', '/c', '/d/e');
    const directory = fc.constantFrom('/x', '/y', '/z');
    fc.assert(
      fc.property(
        fc.array(
          fc.oneof(
            path.map((at) => written(at)),
            path.map((at) => deleted(at)),
            fc.tuple(path, path).map(([from, to]) => renamed(from, to)),
            fc.tuple(path, path).map(
              ([from, to]): PathChangeEvent => ({
                type: 'fileCopied',
                sourcePath: from,
                targetPath: to,
                backend: testBackend,
              }),
            ),
            directory.map((at): PathChangeEvent => ({ type: 'directoryCreated', path: at, backend: testBackend })),
            directory.map((at): PathChangeEvent => ({ type: 'directoryDeleted', path: at, backend: testBackend })),
            fc.tuple(directory, directory).map(
              ([from, to]): PathChangeEvent => ({
                type: 'directoryRenamed',
                oldPath: from,
                newPath: to,
                backend: testBackend,
              }),
            ),
          ),
          { minLength: 1, maxLength: 40 },
        ),
        (events) => {
          const valid = events.filter((event) =>
            event.type === 'fileRenamed' || event.type === 'directoryRenamed'
              ? event.oldPath !== event.newPath
              : event.type !== 'fileCopied' || event.sourcePath !== event.targetPath,
          );
          expect(presence(coalesceChangeEvents(valid))).toEqual(presence(valid));
        },
      ),
      { numRuns: 500 },
    );
  });

  it('should pass through single events unchanged', () => {
    const events = [written('/a.txt')];
    expect(coalesceChangeEvents(events)).toEqual(events);
  });

  it('should preserve the final delete after a write to an existing path', () => {
    const events = [written('/a.txt'), deleted('/a.txt')];
    expect(coalesceChangeEvents(events)).toEqual([deleted('/a.txt')]);
  });

  it('should collapse deleted → written to a single written (update)', () => {
    const events = [deleted('/a.txt'), written('/a.txt')];
    expect(coalesceChangeEvents(events)).toEqual([written('/a.txt')]);
  });

  it('should not guess that an untyped file delete is a parent-directory summary', () => {
    const events = [deleted('/dir'), deleted('/dir/a.txt'), deleted('/dir/b.txt')];
    const result = coalesceChangeEvents(events);
    expect(result).toEqual(events);
  });

  it('should not suppress child events for unrelated parents', () => {
    const events = [deleted('/other'), deleted('/dir/a.txt')];
    const result = coalesceChangeEvents(events);
    expect(result).toHaveLength(2);
  });

  it('should keep rename events', () => {
    const events = [renamed('/old.txt', '/new.txt')];
    expect(coalesceChangeEvents(events)).toEqual(events);
  });

  it('should preserve rename event alongside other events in multi-event batch', () => {
    const events = [written('/a.txt'), renamed('/old.txt', '/new.txt')];
    const result = coalesceChangeEvents(events);
    expect(result).toHaveLength(2);
    expect(result).toEqual([written('/a.txt'), renamed('/old.txt', '/new.txt')]);
  });

  it('should preserve rename event when fileRenamed is followed by fileDeleted on oldPath', () => {
    const events = [renamed('/a', '/b'), deleted('/a')];
    const result = coalesceChangeEvents(events);
    const allPaths = result.flatMap((event) => {
      const paths: string[] = [];
      if ('path' in event) {
        paths.push(event.path);
      }
      if ('newPath' in event) {
        paths.push(event.newPath);
      }
      return paths;
    });
    expect(allPaths).toContain('/b');
  });

  it('should not cancel rename when fileWritten + fileRenamed + fileDeleted occur on same path', () => {
    const events = [written('/a'), renamed('/a', '/b'), deleted('/a')];
    const result = coalesceChangeEvents(events);
    const allPaths = result.flatMap((event) => {
      const paths: string[] = [];
      if ('path' in event) {
        paths.push(event.path);
      }
      if ('newPath' in event) {
        paths.push(event.newPath);
      }
      return paths;
    });
    expect(allPaths).toContain('/b');
  });

  /*
   * STO-25 SP2g: a revision write replaces a file in four facts — stage a
   * sibling, move the file aside, publish the sibling over it, drop the backup.
   * One window nets them to what an observer can tell: the staged copy moved
   * onto the file, and the backup is gone.
   */
  it('should net a replacement’s four facts to the publish and the backup’s removal', () => {
    const staged = '/p/.part.scad.tau-staged.1.tmp';
    const backup = '/p/.part.scad.tau-backup.1.tmp';
    const events = [written(staged), renamed('/p/part.scad', backup), renamed(staged, '/p/part.scad'), deleted(backup)];
    expect(coalesceChangeEvents(events)).toEqual([renamed(staged, '/p/part.scad'), deleted(backup)]);
  });

  it('should keep a move away from a path nothing re-creates, and its arrival', () => {
    expect(coalesceChangeEvents([renamed('/a', '/b'), written('/c')])).toEqual([renamed('/a', '/b'), written('/c')]);
    expect(coalesceChangeEvents([renamed('/a', '/b'), written('/b')])).toEqual([renamed('/a', '/b'), written('/b')]);
  });

  it('should keep the arrival of a move whose source is written again', () => {
    const events = [renamed('/a', '/b'), written('/a')];
    expect(coalesceChangeEvents(events)).toEqual([written('/b'), written('/a')]);
  });

  it('should keep the final write to a path written, moved away and written again', () => {
    const events = [written('/a'), renamed('/a', '/b'), written('/a')];
    expect(coalesceChangeEvents(events)).toEqual([written('/b'), written('/a')]);
  });

  /* Review item 4: a copy onto a path is an arrival there, so a later delete of it is never folded into an earlier move. */
  it('should keep the delete of a path a copy re-created after the path moved away', () => {
    const copied: PathChangeEvent = { type: 'fileCopied', sourcePath: '/x', targetPath: '/a', backend: testBackend };
    const events = [renamed('/a', '/b'), copied, deleted('/a')];
    expect(coalesceChangeEvents(events)).toEqual([written('/b'), copied, deleted('/a')]);
  });

  it('should carry the origin of a move it nets to an arrival', () => {
    const moved = renamed('/a', '/b');
    tagEventOrigin(moved, 'port-1');
    const [arrival] = coalesceChangeEvents([moved, written('/a')]);
    expect(arrival).toEqual(written('/b'));
    expect(getEventOrigin(arrival!)).toBe('port-1');
  });

  it('should deduplicate repeated writes to the same path', () => {
    const events = [written('/a.txt'), written('/a.txt'), written('/a.txt')];
    const result = coalesceChangeEvents(events);
    expect(result).toEqual([written('/a.txt')]);
  });

  it('should preserve mixed events for different paths', () => {
    const events = [written('/a.txt'), deleted('/b.txt'), written('/c.txt')];
    const result = coalesceChangeEvents(events);
    expect(result).toHaveLength(3);
  });

  it('should pass through backendChanged events', () => {
    const backendEvent: PathChangeEvent = { type: 'backendChanged', backend: testBackend };
    const result = coalesceChangeEvents([backendEvent, written('/a.txt')]);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual(backendEvent);
  });

  it('places a collapsed path fact at its final causal position', () => {
    const backendEvent: PathChangeEvent = { type: 'backendChanged', backend: testBackend };

    expect(coalesceChangeEvents([written('/a.txt'), backendEvent, deleted('/a.txt')])).toEqual([
      backendEvent,
      deleted('/a.txt'),
    ]);
  });

  it('never collapses away a directory summary reset', () => {
    const summary: PathChangeEvent = { type: 'directoryChanged', path: '/src', backend: testBackend };

    expect(coalesceChangeEvents([written('/src'), summary, written('/src')])).toEqual([summary, written('/src')]);
  });

  it('keeps interleaved rename and path histories in causal order', () => {
    expect(coalesceChangeEvents([written('/a'), renamed('/old', '/new'), written('/a')])).toEqual([
      renamed('/old', '/new'),
      written('/a'),
    ]);
  });
});

describe('coalesceChangeEvents (origin merge)', () => {
  it('should preserve origin when a single path sequence shares one origin', () => {
    const firstWritten = written('/a.txt');
    const secondWritten = written('/a.txt');
    tagEventOrigin(firstWritten, 'p1');
    tagEventOrigin(secondWritten, 'p1');
    const result = coalesceChangeEvents([firstWritten, secondWritten]);
    expect(result).toHaveLength(1);
    expect(getEventOrigin(result[0]!)).toBe('p1');
  });

  it('should clear origin when the same path mixes origins', () => {
    const firstWritten = written('/a.txt');
    const secondWritten = written('/a.txt');
    tagEventOrigin(firstWritten, 'p1');
    tagEventOrigin(secondWritten, 'p2');
    const result = coalesceChangeEvents([firstWritten, secondWritten]);
    expect(result).toHaveLength(1);
    expect(getEventOrigin(result[0]!)).toBeUndefined();
    expect(result[0]).not.toBe(secondWritten);
    expect(getEventOrigin(secondWritten)).toBe('p2');
  });

  it('should clear origin when defined origin mixes with external observer (undefined)', () => {
    const taggedWritten = written('/a.txt');
    const externalWritten = written('/a.txt');
    tagEventOrigin(taggedWritten, 'p1');
    const result = coalesceChangeEvents([taggedWritten, externalWritten]);
    expect(result).toHaveLength(1);
    expect(getEventOrigin(result[0]!)).toBeUndefined();
  });

  it('should preserve origin through deleted → written collapse when both share an origin', () => {
    const d = deleted('/a.txt');
    const w = written('/a.txt');
    tagEventOrigin(d, 'k');
    tagEventOrigin(w, 'k');
    const result = coalesceChangeEvents([d, w]);
    expect(result).toHaveLength(1);
    expect(result[0]).not.toBe(w);
    expect(getEventOrigin(result[0]!)).toBe('k');
  });

  it('should clear origin through deleted → written collapse when origins differ', () => {
    const d = deleted('/a.txt');
    const w = written('/a.txt');
    tagEventOrigin(d, 'k');
    tagEventOrigin(w, 'u');
    const result = coalesceChangeEvents([d, w]);
    expect(result).toHaveLength(1);
    expect(result[0]).not.toBe(w);
    expect(getEventOrigin(result[0]!)).toBeUndefined();
    expect(getEventOrigin(w)).toBe('u');
  });

  it('should not merge origins across different paths', () => {
    const a = written('/a.txt');
    const b = written('/b.txt');
    tagEventOrigin(a, 'p1');
    tagEventOrigin(b, 'p2');
    const result = coalesceChangeEvents([a, b]);
    expect(result).toHaveLength(2);
    expect(getEventOrigin(result[0]!)).toBe('p1');
    expect(getEventOrigin(result[1]!)).toBe('p2');
  });
});

describe('EventCoalescer (timed)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should deliver events after the window elapses', () => {
    const deliver = vi.fn();
    const coalescer = new EventCoalescer(deliver, { coalescingWindow: 50 });

    coalescer.push(written('/a.txt'));
    expect(deliver).not.toHaveBeenCalled();

    vi.advanceTimersByTime(50);
    expect(deliver).toHaveBeenCalledTimes(1);
    const batch = deliver.mock.calls[0]![0] as PathChangeEvent[];
    expect(batch).toEqual([written('/a.txt')]);
    expect(getEventOrigin(batch[0]!)).toBeUndefined();

    coalescer.dispose();
  });

  it('should coalesce events within the same window', () => {
    const deliver = vi.fn();
    const coalescer = new EventCoalescer(deliver, { coalescingWindow: 50 });

    coalescer.push(written('/a.txt'));
    coalescer.push(written('/a.txt'));

    vi.advanceTimersByTime(50);
    expect(deliver).toHaveBeenCalledTimes(1);
    const batch = deliver.mock.calls[0]![0] as PathChangeEvent[];
    expect(batch).toEqual([written('/a.txt')]);
    expect(getEventOrigin(batch[0]!)).toBeUndefined();

    coalescer.dispose();
  });

  it('should deliver tagged origin from push without second push arg', () => {
    const deliver = vi.fn();
    const coalescer = new EventCoalescer(deliver, { coalescingWindow: 50 });
    const writtenEvent = written('/o.txt');
    tagEventOrigin(writtenEvent, 'port_a');
    coalescer.push(writtenEvent);
    vi.advanceTimersByTime(50);
    const batch = deliver.mock.calls[0]![0] as PathChangeEvent[];
    expect(batch).toEqual([writtenEvent]);
    expect(getEventOrigin(batch[0]!)).toBe('port_a');
    coalescer.dispose();
  });

  it('should deliver the final delete for written+deleted within one window', () => {
    const deliver = vi.fn();
    const coalescer = new EventCoalescer(deliver, { coalescingWindow: 50 });

    coalescer.push(written('/a.txt'));
    coalescer.push(deleted('/a.txt'));

    vi.advanceTimersByTime(50);
    expect(deliver).toHaveBeenCalledWith([deleted('/a.txt')]);

    coalescer.dispose();
  });

  it('should deliver immediately when flush() is called', () => {
    const deliver = vi.fn();
    const coalescer = new EventCoalescer(deliver, { coalescingWindow: 500 });

    coalescer.push(written('/a.txt'));
    coalescer.flush();

    expect(deliver).toHaveBeenCalledTimes(1);

    coalescer.dispose();
  });

  it('should trigger overflow callback when queue exceeds max depth', () => {
    const deliver = vi.fn();
    const onOverflow = vi.fn();
    const coalescer = new EventCoalescer(deliver, { maxQueueDepth: 3, onOverflow });

    coalescer.push(written('/1.txt'));
    coalescer.push(written('/2.txt'));
    coalescer.push(written('/3.txt'));
    expect(onOverflow).not.toHaveBeenCalled();

    coalescer.push(written('/4.txt'));
    expect(onOverflow).toHaveBeenCalledTimes(1);
    expect(onOverflow).toHaveBeenCalledWith([
      written('/1.txt'),
      written('/2.txt'),
      written('/3.txt'),
      written('/4.txt'),
    ]);
    expect(deliver).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1000);
    expect(deliver).not.toHaveBeenCalled();

    coalescer.dispose();
  });

  it('should overflow at 10,000 events by default', () => {
    const deliver = vi.fn();
    const onOverflow = vi.fn();
    const coalescer = new EventCoalescer(deliver, { onOverflow });

    for (let i = 0; i < 10_000; i++) {
      coalescer.push(written(`/${i}.txt`));
    }
    expect(onOverflow).not.toHaveBeenCalled();

    coalescer.push(written('/overflow.txt'));
    expect(onOverflow).toHaveBeenCalledTimes(1);

    coalescer.dispose();
  });

  it('should prevent further delivery after dispose()', () => {
    const deliver = vi.fn();
    const coalescer = new EventCoalescer(deliver, { coalescingWindow: 50 });

    coalescer.push(written('/a.txt'));
    coalescer.dispose();

    vi.advanceTimersByTime(100);
    expect(deliver).not.toHaveBeenCalled();
  });

  it('should process separate windows independently', () => {
    const deliver = vi.fn();
    const coalescer = new EventCoalescer(deliver, { coalescingWindow: 50 });

    coalescer.push(written('/a.txt'));
    vi.advanceTimersByTime(50);
    expect(deliver).toHaveBeenCalledTimes(1);

    coalescer.push(written('/b.txt'));
    vi.advanceTimersByTime(50);
    expect(deliver).toHaveBeenCalledTimes(2);
    expect(deliver).toHaveBeenLastCalledWith([written('/b.txt')]);

    coalescer.dispose();
  });

  it('should deliver continuous traffic by the first event deadline', () => {
    const deliver = vi.fn();
    const coalescer = new EventCoalescer(deliver, { coalescingWindow: 75 });

    coalescer.push(written('/a.txt'));
    vi.advanceTimersByTime(50);
    expect(deliver).not.toHaveBeenCalled();

    coalescer.push(written('/b.txt'));
    vi.advanceTimersByTime(25);
    expect(deliver).toHaveBeenCalledTimes(1);
    expect(deliver).toHaveBeenCalledWith([written('/a.txt'), written('/b.txt')]);

    coalescer.push(written('/c.txt'));
    vi.advanceTimersByTime(75);
    expect(deliver).toHaveBeenCalledTimes(2);
    expect(deliver).toHaveBeenLastCalledWith([written('/c.txt')]);

    coalescer.dispose();
  });

  it('should respect configurable window for different tiers', () => {
    const kernelDeliver = vi.fn();
    const uiDeliver = vi.fn();
    const kernelCoalescer = new EventCoalescer(kernelDeliver, { coalescingWindow: 75 });
    const uiCoalescer = new EventCoalescer(uiDeliver, { coalescingWindow: 500 });

    kernelCoalescer.push(written('/a.txt'));
    uiCoalescer.push(written('/a.txt'));

    vi.advanceTimersByTime(75);
    expect(kernelDeliver).toHaveBeenCalledTimes(1);
    expect(uiDeliver).not.toHaveBeenCalled();

    vi.advanceTimersByTime(425);
    expect(uiDeliver).toHaveBeenCalledTimes(1);

    kernelCoalescer.dispose();
    uiCoalescer.dispose();
  });

  describe('leading edge', () => {
    it('should deliver a lone write on the next tick', () => {
      const deliver = vi.fn();
      const coalescer = new EventCoalescer(deliver, { coalescingWindow: 75, leadingEdge: true });

      coalescer.push(written('/a.txt'));
      vi.advanceTimersByTime(1);

      expect(deliver).toHaveBeenCalledExactlyOnceWith([written('/a.txt')]);

      coalescer.dispose();
    });

    it('should deliver a burst of ten writes within 50 ms in at most two batches', () => {
      const deliver = vi.fn<(events: PathChangeEvent[]) => void>();
      const coalescer = new EventCoalescer(deliver, { coalescingWindow: 75, leadingEdge: true });
      const paths = Array.from({ length: 10 }, (_, index) => `/burst/${index}.txt`);

      for (const path of paths) {
        coalescer.push(written(path));
        vi.advanceTimersByTime(5);
      }
      vi.advanceTimersByTime(75);

      expect(deliver.mock.calls.length).toBeLessThanOrEqual(2);
      expect(deliver.mock.calls.flatMap(([batch]) => batch)).toEqual(paths.map((path) => written(path)));

      coalescer.dispose();
    });

    it('should batch events pushed in the same tick and coalesce events a delivery causes into the window', () => {
      const batches: PathChangeEvent[][] = [];
      const coalescer = new EventCoalescer(
        (events) => {
          batches.push(events);
          if (batches.length === 1) {
            coalescer.push(written('/echo.txt'));
          }
        },
        { coalescingWindow: 75, leadingEdge: true },
      );

      coalescer.push(written('/a.txt'));
      coalescer.push(written('/b.txt'));
      vi.advanceTimersByTime(1);
      expect(batches).toEqual([[written('/a.txt'), written('/b.txt')]]);

      vi.advanceTimersByTime(75);
      expect(batches).toEqual([[written('/a.txt'), written('/b.txt')], [written('/echo.txt')]]);

      coalescer.dispose();
    });
  });
});

/* STO-25 SP2g: an overflowed window becomes a reset of every directory it touched, never a silent drop (I5, I7). */
describe('overflowLossSignals', () => {
  it('should reset every directory a discarded fact left unknown, and nothing a copy only read', () => {
    expect(
      overflowLossSignals([
        written('/p/a/one.scad'),
        written('/p/a/two.scad'),
        renamed('/p/a/two.scad', '/p/b/two.scad'),
        { type: 'fileCopied', sourcePath: '/p/src/three.scad', targetPath: '/p/c/three.scad', backend: testBackend },
        { type: 'directoryDeleted', path: '/p/gone', backend: testBackend },
        { type: 'directoryRenamed', oldPath: '/p/d', newPath: '/q/d', backend: testBackend },
      ]),
    ).toEqual([
      /* A removal or move is a fact the port's scoping needs as itself: above a root it resets that root. */
      { type: 'directoryDeleted', path: '/p/gone', backend: testBackend },
      { type: 'directoryRenamed', oldPath: '/p/d', newPath: '/q/d', backend: testBackend },
      ...['/p/a', '/p/b', '/p/c', '/p', '/p/gone', '/p/d', '/q', '/q/d'].map(
        (path): PathChangeEvent => ({ type: 'directoryChanged', path, backend: testBackend }),
      ),
    ]);
  });

  it('should re-list a removed directory the same window re-created or touched, never tell it gone', () => {
    const signals = overflowLossSignals([
      { type: 'directoryDeleted', path: '/p/x', backend: testBackend },
      written('/p/x/a'),
      { type: 'directoryRenamed', oldPath: '/p/y', newPath: '/p/z', backend: testBackend },
      { type: 'directoryCreated', path: '/p/y', backend: testBackend },
    ]);
    expect(signals.map((event) => event.type)).not.toContain('directoryDeleted');
    expect(signals.map((event) => event.type)).not.toContain('directoryRenamed');
    expect(scopeEventToRoot(signals.find((event) => 'path' in event && event.path === '/p/x')!, '/p/x/deep')).toEqual({
      type: 'directoryChanged',
      path: '',
      backend: testBackend,
    });
    expect(scopeEventToRoot(signals.find((event) => 'path' in event && event.path === '/p/z')!, '/p/z/deep')).toEqual({
      type: 'directoryChanged',
      path: '',
      backend: testBackend,
    });
    /* The intent is the value's own: a copy across a realm or a later step still resets the port. */
    expect(
      scopeEventToRoot(
        structuredClone(signals.find((event) => 'path' in event && event.path === '/p/x')!),
        '/p/x/deep',
      ),
    ).toEqual({ type: 'directoryChanged', path: '', backend: testBackend });
    /* An ordinary summary above a root still says only that its listing changed. */
    expect(
      scopeEventToRoot({ type: 'directoryChanged', path: '/p/x', backend: testBackend }, '/p/x/deep'),
    ).toBeUndefined();
  });

  it('should keep a discarded backendChanged as its backend’s whole signal, and scope every other backend', () => {
    expect(
      overflowLossSignals([
        written('/a/one.txt'),
        { type: 'backendChanged', backend: testBackend },
        { type: 'fileDeleted', path: '/b/two.txt', backend: 'opfs' },
      ]),
    ).toEqual([
      { type: 'backendChanged', backend: testBackend },
      { type: 'directoryChanged', path: '/b', backend: 'opfs' },
    ]);
  });
});

describe('pruneDirectorySummaries', () => {
  const summary = (path: string, backend: PathChangeEvent['backend'] = testBackend): PathChangeEvent => ({
    type: 'directoryChanged',
    path,
    backend,
  });

  it('should keep one summary per directory, at its last place', () => {
    expect(pruneDirectorySummaries([summary('/a'), written('/a/x'), summary('/a')])).toEqual([
      written('/a/x'),
      summary('/a'),
    ]);
  });

  it('should drop a summary a later summary of an ancestor covers', () => {
    expect(
      pruneDirectorySummaries([summary('a/b'), written('a/b/x'), summary('a'), summary('c'), summary('')]),
    ).toEqual([written('a/b/x'), summary('')]);
    expect(pruneDirectorySummaries([summary('/a/b'), summary('/')])).toEqual([summary('/')]);
  });

  it('should keep a summary no later ancestor covers, and one of another backend', () => {
    const events = [summary('/a'), summary('/a/b'), summary('/ab'), summary('/a/c', 'opfs')];
    expect(pruneDirectorySummaries([...events, summary('/', 'opfs')])).toEqual([
      summary('/a'),
      summary('/a/b'),
      summary('/ab'),
      summary('/', 'opfs'),
    ]);
  });

  it('should return the same facts when no summary repeats or is covered', () => {
    const events = [written('/a'), summary('/b'), deleted('/c')];
    expect(pruneDirectorySummaries(events)).toBe(events);
  });
});
