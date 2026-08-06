import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventCoalescer, coalesceChangeEvents } from '#event-coalescer.js';
import { getEventOrigin, tagEventOrigin } from '#event-origin-registry.js';
import type { ChangeEvent } from '#types.js';

const testBackend = 'memory';

const written = (path: string): ChangeEvent => ({ type: 'fileWritten', path, backend: testBackend });
const deleted = (path: string): ChangeEvent => ({ type: 'fileDeleted', path, backend: testBackend });
const renamed = (oldPath: string, newPath: string): ChangeEvent => ({
  type: 'fileRenamed',
  oldPath,
  newPath,
  backend: testBackend,
});

describe('coalesceChangeEvents (pure)', () => {
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
    const backendEvent: ChangeEvent = { type: 'backendChanged', backend: testBackend };
    const result = coalesceChangeEvents([backendEvent, written('/a.txt')]);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual(backendEvent);
  });

  it('places a collapsed path fact at its final causal position', () => {
    const backendEvent: ChangeEvent = { type: 'backendChanged', backend: testBackend };

    expect(coalesceChangeEvents([written('/a.txt'), backendEvent, deleted('/a.txt')])).toEqual([
      backendEvent,
      deleted('/a.txt'),
    ]);
  });

  it('never collapses away a directory summary reset', () => {
    const summary: ChangeEvent = { type: 'directoryChanged', path: '/src', backend: testBackend };

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
    const batch = deliver.mock.calls[0]![0] as ChangeEvent[];
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
    const batch = deliver.mock.calls[0]![0] as ChangeEvent[];
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
    const batch = deliver.mock.calls[0]![0] as ChangeEvent[];
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
});
