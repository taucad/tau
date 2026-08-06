/* oxlint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call -- oxlint false positive: cannot resolve types through #types.js path import */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WatchRegistry } from '#watch-registry.js';
import { ChangeEventBus } from '#change-event-bus.js';
import type { ChangeEvent, WatchEvent, WatchRequest } from '#types.js';
import { tagEventAuthorities } from '#event-origin-registry.js';

const testBackend = 'memory';

const written = (path: string): ChangeEvent => ({ type: 'fileWritten', path, backend: testBackend });
const deletedEvent = (path: string): ChangeEvent => ({ type: 'fileDeleted', path, backend: testBackend });
const renamedEvent = (oldPath: string, newPath: string): ChangeEvent => ({
  type: 'fileRenamed',
  oldPath,
  newPath,
  backend: testBackend,
});
const directoryChanged = (path: string): ChangeEvent => ({ type: 'directoryChanged', path, backend: testBackend });
const directoryDeleted = (path: string): ChangeEvent => ({ type: 'directoryDeleted', path, backend: testBackend });
const directoryRenamed = (oldPath: string, newPath: string): ChangeEvent => ({
  type: 'directoryRenamed',
  oldPath,
  newPath,
  backend: testBackend,
});

describe('WatchRegistry', () => {
  let bus: ChangeEventBus;
  let registry: WatchRegistry;

  beforeEach(() => {
    vi.useFakeTimers();
    bus = new ChangeEventBus();
    registry = new WatchRegistry(bus);
  });

  afterEach(() => {
    registry.dispose();
    vi.useRealTimers();
  });

  function emitAndFlush(event: ChangeEvent): void {
    bus.emit(event);
    vi.advanceTimersByTime(100);
  }

  // --- Basic matching ---

  describe('path matching', () => {
    it('should deliver events for exact watched path', () => {
      const handler = vi.fn();
      const request: WatchRequest = { paths: ['/src'] };

      registry.watch(request, handler);
      emitAndFlush(written('/src/file.txt'));

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ type: 'change', path: '/src/file.txt' }));
    });

    it('should not deliver events outside watched path', () => {
      const handler = vi.fn();
      registry.watch({ paths: ['/src'] }, handler);

      emitAndFlush(written('/other/file.txt'));
      expect(handler).not.toHaveBeenCalled();
    });

    it('delivers captured facts only to the matching authority subscription', () => {
      const firstAuthority = {};
      const secondAuthority = {};
      const first = vi.fn();
      const second = vi.fn();
      registry.watch({ paths: ['/src'] }, first, { authority: firstAuthority });
      registry.watch({ paths: ['/src'] }, second, { authority: secondAuthority });
      const event = written('/src/file.txt');
      tagEventAuthorities(event, [firstAuthority], false);

      emitAndFlush(event);

      expect(first).toHaveBeenCalledOnce();
      expect(second).not.toHaveBeenCalled();
    });
  });

  describe('recursive matching', () => {
    it('should match deeply nested paths when recursive is true', () => {
      const handler = vi.fn();
      registry.watch({ paths: ['/src'], recursive: true }, handler);

      emitAndFlush(written('/src/a/b/c/file.txt'));
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should not match nested paths when recursive is false', () => {
      const handler = vi.fn();
      registry.watch({ paths: ['/src'], recursive: false }, handler);

      emitAndFlush(written('/src/a/b/file.txt'));
      expect(handler).not.toHaveBeenCalled();
    });

    it('should match direct children when recursive is false', () => {
      const handler = vi.fn();
      registry.watch({ paths: ['/src'], recursive: false }, handler);

      emitAndFlush(written('/src/file.txt'));
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  // --- Glob filters ---

  describe('includes/excludes', () => {
    it('should deliver only paths matching includes', () => {
      const handler = vi.fn();
      registry.watch({ paths: ['/src'], recursive: true, includes: ['**/*.ts'] }, handler);

      emitAndFlush(written('/src/file.ts'));
      emitAndFlush(written('/src/file.js'));

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ path: '/src/file.ts' }));
    });

    it('should filter out paths matching excludes', () => {
      const handler = vi.fn();
      registry.watch({ paths: ['/src'], recursive: true, excludes: ['/src/node_modules/*'] }, handler);

      emitAndFlush(written('/src/node_modules/pkg'));
      expect(handler).not.toHaveBeenCalled();

      emitAndFlush(written('/src/app.ts'));
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  // --- Rename events ---

  describe('rename events', () => {
    it('should deliver rename events with old and new paths', () => {
      const handler = vi.fn();
      registry.watch({ paths: ['/src'], recursive: true }, handler);

      emitAndFlush(renamedEvent('/src/old.txt', '/src/new.txt'));
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'rename', oldPath: '/src/old.txt', newPath: '/src/new.txt' }),
      );
    });

    it('should deliver a rename when either endpoint remains observable', () => {
      const handler = vi.fn();
      registry.watch({ paths: ['/src'], recursive: true, excludes: ['/src/tmp/*'] }, handler);

      emitAndFlush(renamedEvent('/src/file.txt', '/src/tmp/file.txt'));
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'rename', oldPath: '/src/file.txt', newPath: '/src/tmp/file.txt' }),
      );
    });

    it('should deliver a rename into an exact watched path', () => {
      const handler = vi.fn();
      registry.watch({ paths: ['/src/created.txt'] }, handler);

      emitAndFlush(renamedEvent('/tmp/created.txt', '/src/created.txt'));
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'rename', oldPath: '/tmp/created.txt', newPath: '/src/created.txt' }),
      );
    });
  });

  // --- Dedup / ref-counting ---

  describe('deduplication and ref-counting', () => {
    it('should share one underlying subscription for identical requests', () => {
      const h1 = vi.fn();
      const h2 = vi.fn();
      const request: WatchRequest = { paths: ['/src'], recursive: true };

      registry.watch(request, h1);
      registry.watch(request, h2);

      expect(registry.subscriptionCount).toBe(1);
      expect(registry.handlerCount).toBe(2);

      emitAndFlush(written('/src/file.txt'));
      expect(h1).toHaveBeenCalledTimes(1);
      expect(h2).toHaveBeenCalledTimes(1);
    });

    it('should remove subscription only when all handlers unsubscribe', () => {
      const h1 = vi.fn();
      const h2 = vi.fn();
      const request: WatchRequest = { paths: ['/src'], recursive: true };

      const unsub1 = registry.watch(request, h1);
      const unsub2 = registry.watch(request, h2);

      expect(registry.subscriptionCount).toBe(1);

      unsub1();
      expect(registry.subscriptionCount).toBe(1);
      expect(registry.handlerCount).toBe(1);

      unsub2();
      expect(registry.subscriptionCount).toBe(0);
      expect(registry.handlerCount).toBe(0);
    });

    it('should create separate subscriptions for different requests', () => {
      const h1 = vi.fn();
      const h2 = vi.fn();

      registry.watch({ paths: ['/src'], recursive: true }, h1);
      registry.watch({ paths: ['/lib'], recursive: true }, h2);

      expect(registry.subscriptionCount).toBe(2);
    });

    it('does not alias delimiter-containing paths with a multi-path request', () => {
      const commaPath = vi.fn();
      const separatePaths = vi.fn();

      registry.watch({ paths: ['/a,b'] }, commaPath);
      registry.watch({ paths: ['/a', '/b'] }, separatePaths);

      expect(registry.subscriptionCount).toBe(2);
      emitAndFlush(written('/b'));
      expect(commaPath).not.toHaveBeenCalled();
      expect(separatePaths).toHaveBeenCalledOnce();
    });

    it('owns a normalized request snapshot instead of retaining caller mutation', () => {
      const handler = vi.fn();
      const request: WatchRequest = { paths: ['/src'] };
      registry.watch(request, handler);
      request.paths[0] = '/other';

      emitAndFlush(written('/src/file.ts'));
      expect(handler).toHaveBeenCalledOnce();
      emitAndFlush(written('/other/file.ts'));
      expect(handler).toHaveBeenCalledOnce();
    });

    it('lets duplicate registrations of the same handler own independent disposers', () => {
      const handler = vi.fn();
      const first = registry.watch({ paths: ['/src'] }, handler);
      const second = registry.watch({ paths: ['/src'] }, handler);

      first();
      expect(registry.handlerCount).toBe(1);
      emitAndFlush(written('/src/file.ts'));
      expect(handler).toHaveBeenCalledOnce();

      second();
      expect(registry.handlerCount).toBe(0);
      expect(registry.subscriptionCount).toBe(0);
    });

    it('should tolerate double unsubscribe without error', () => {
      const handler = vi.fn();
      const unsub = registry.watch({ paths: ['/src'] }, handler);

      unsub();
      unsub();

      expect(registry.subscriptionCount).toBe(0);
    });
  });

  // --- Reset ---

  describe('reset / reconfigure', () => {
    it('should send reset to all subscribers when emitResetAll is called', () => {
      const h1 = vi.fn();
      const h2 = vi.fn();

      registry.watch({ paths: ['/src'] }, h1);
      registry.watch({ paths: ['/lib'] }, h2);

      registry.emitResetAll();

      expect(h1).toHaveBeenCalledWith({ type: 'reset' });
      expect(h2).toHaveBeenCalledWith({ type: 'reset' });
    });

    it('flushes older exact facts before a topology reset and never delivers them afterward', () => {
      const events: WatchEvent[] = [];
      registry.watch({ paths: ['/src'], recursive: true }, (event) => events.push(event));
      bus.emit(written('/src/pending.ts'));

      registry.emitResetAll();
      expect(events).toEqual([{ type: 'change', path: '/src/pending.ts' }, { type: 'reset' }]);

      vi.advanceTimersByTime(100);
      expect(events).toEqual([{ type: 'change', path: '/src/pending.ts' }, { type: 'reset' }]);
    });

    it.each([directoryDeleted('/src'), directoryRenamed('/src', '/renamed')])(
      'resets an exact descendant watch for typed ancestor directory fact $type',
      (event) => {
        const handler = vi.fn();
        registry.watch({ paths: ['/src/main.ts'] }, handler);

        bus.emit(event);

        expect(handler).toHaveBeenCalledExactlyOnceWith({ type: 'reset' });
      },
    );

    it('should trigger reset per subscription when backendChanged event occurs', () => {
      const handler = vi.fn();
      registry.watch({ paths: ['/src'] }, handler);

      bus.emit({ type: 'backendChanged', backend: testBackend });
      expect(handler).toHaveBeenCalledWith({ type: 'reset' });
    });

    it('should flush concrete events then reset only subscriptions affected by a directory summary', () => {
      const recursiveEvents: WatchEvent[] = [];
      const descendantHandler = vi.fn();
      const siblingHandler = vi.fn();
      registry.watch({ paths: ['/src'], recursive: true }, (event) => recursiveEvents.push(event));
      registry.watch({ paths: ['/src/subdir/model.ts'] }, descendantHandler);
      registry.watch({ paths: ['/other'], recursive: true }, siblingHandler);

      bus.emit(written('/src/exact.ts'));
      bus.emit(directoryChanged('/src/subdir'));

      expect(recursiveEvents).toEqual([{ type: 'change', path: '/src/exact.ts' }, { type: 'reset' }]);
      expect(descendantHandler).toHaveBeenCalledWith({ type: 'reset' });
      expect(siblingHandler).not.toHaveBeenCalled();
    });
  });

  // --- Exact spelling ---

  describe('exact spelling', () => {
    it('should match exact spelling without synthesizing aliases', () => {
      const handler = vi.fn();
      registry.watch({ paths: ['/Src'], recursive: true }, handler);

      emitAndFlush(written('/src/file.txt'));
      expect(handler).not.toHaveBeenCalled();

      emitAndFlush(written('/Src/file.txt'));
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  // --- Dispose ---

  describe('dispose', () => {
    it('should clear all subscriptions and stop delivery', () => {
      const handler = vi.fn();
      registry.watch({ paths: ['/src'], recursive: true }, handler);

      registry.dispose();

      emitAndFlush(written('/src/file.txt'));
      expect(handler).not.toHaveBeenCalled();
      expect(registry.subscriptionCount).toBe(0);
    });
  });

  // --- Event type mapping ---

  describe('event type mapping', () => {
    it('should map fileWritten to change', () => {
      const handler = vi.fn();
      registry.watch({ paths: ['/src'], recursive: true }, handler);

      emitAndFlush(written('/src/a.txt'));
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ type: 'change' }));
    });

    it('should map fileDeleted to delete', () => {
      const handler = vi.fn();
      registry.watch({ paths: ['/src'], recursive: true }, handler);

      emitAndFlush(deletedEvent('/src/a.txt'));
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ type: 'delete' }));
    });

    it('should map fileRenamed to rename', () => {
      const handler = vi.fn();
      registry.watch({ paths: ['/src'], recursive: true }, handler);

      emitAndFlush(renamedEvent('/src/old.txt', '/src/new.txt'));
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ type: 'rename' }));
    });
  });

  // --- Handler error isolation ---

  describe('error isolation', () => {
    it('should still deliver to other handlers when one handler throws', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const failing = vi.fn(() => {
        throw new Error('boom');
      });
      const passing = vi.fn();

      const request: WatchRequest = { paths: ['/src'], recursive: true };
      registry.watch(request, failing);
      registry.watch(request, passing);

      emitAndFlush(written('/src/file.txt'));

      expect(failing).toHaveBeenCalledTimes(1);
      expect(passing).toHaveBeenCalledTimes(1);

      consoleErrorSpy.mockRestore();
    });

    it('should log error and continue delivery when handler throws during emitResetAll', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const failing = vi.fn(() => {
        throw new Error('reset-boom');
      });
      const passing = vi.fn();

      registry.watch({ paths: ['/src'] }, failing);
      registry.watch({ paths: ['/src'] }, passing);

      registry.emitResetAll();

      expect(failing).toHaveBeenCalledTimes(1);
      expect(passing).toHaveBeenCalledTimes(1);
      expect(passing).toHaveBeenCalledWith(expect.objectContaining({ type: 'reset' }));
      expect(consoleErrorSpy).toHaveBeenCalledWith('[WatchRegistry] Handler error:', expect.any(Error));

      consoleErrorSpy.mockRestore();
    });

    it('should log error and continue delivery when handler throws on backendChanged', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const failing = vi.fn(() => {
        throw new Error('backend-boom');
      });
      const passing = vi.fn();

      const request: WatchRequest = { paths: ['/src'] };
      registry.watch(request, failing);
      registry.watch(request, passing);

      bus.emit({ type: 'backendChanged', backend: testBackend });

      expect(failing).toHaveBeenCalledTimes(1);
      expect(passing).toHaveBeenCalledTimes(1);
      expect(passing).toHaveBeenCalledWith(expect.objectContaining({ type: 'reset' }));
      expect(consoleErrorSpy).toHaveBeenCalledWith('[WatchRegistry] Handler error:', expect.any(Error));

      consoleErrorSpy.mockRestore();
    });
  });

  // --- Queue saturation ---

  describe('queue saturation', () => {
    it('should emit reset to all handlers when the coalescer queue is exceeded', () => {
      const overflowRegistry = new WatchRegistry(bus, { maxQueueDepth: 3 });

      const handler = vi.fn();
      overflowRegistry.watch({ paths: ['/src'], recursive: true }, handler);

      bus.emit(written('/src/1.txt'));
      bus.emit(written('/src/2.txt'));
      bus.emit(written('/src/3.txt'));
      expect(handler).not.toHaveBeenCalled();

      bus.emit(written('/src/4.txt'));
      expect(handler).toHaveBeenCalledWith({ type: 'reset' });

      overflowRegistry.dispose();
    });

    it('should log an error and continue when a handler throws during saturation reset', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const overflowRegistry = new WatchRegistry(bus, { maxQueueDepth: 3 });

      const failing = vi.fn(() => {
        throw new Error('overflow-boom');
      });
      const passing = vi.fn();
      const request: WatchRequest = { paths: ['/src'], recursive: true };
      overflowRegistry.watch(request, failing);
      overflowRegistry.watch(request, passing);

      bus.emit(written('/src/1.txt'));
      bus.emit(written('/src/2.txt'));
      bus.emit(written('/src/3.txt'));
      bus.emit(written('/src/4.txt'));

      expect(failing).toHaveBeenCalledTimes(1);
      expect(passing).toHaveBeenCalledTimes(1);
      expect(passing).toHaveBeenCalledWith({ type: 'reset' });
      expect(consoleErrorSpy).toHaveBeenCalledWith('[WatchRegistry] Handler error:', expect.any(Error));

      consoleErrorSpy.mockRestore();
      overflowRegistry.dispose();
    });
  });

  describe('window propagation', () => {
    it('should pass window to the underlying EventCoalescer', () => {
      const slowRegistry = new WatchRegistry(bus, { coalescingWindow: 500 });
      const handler = vi.fn();
      const request: WatchRequest = { paths: ['/src'], recursive: true };

      slowRegistry.watch(request, handler);
      bus.emit(written('/src/file.txt'));

      vi.advanceTimersByTime(100);
      expect(handler).not.toHaveBeenCalled();

      vi.advanceTimersByTime(400);
      expect(handler).toHaveBeenCalledTimes(1);

      slowRegistry.dispose();
    });

    it('should use different coalescing windows for different registry instances', () => {
      const kernelRegistry = new WatchRegistry(bus, { coalescingWindow: 75 });
      const uiRegistry = new WatchRegistry(bus, { coalescingWindow: 500 });
      const kernelHandler = vi.fn();
      const uiHandler = vi.fn();

      kernelRegistry.watch({ paths: ['/src'], recursive: true }, kernelHandler);
      uiRegistry.watch({ paths: ['/src'], recursive: true }, uiHandler);

      bus.emit(written('/src/file.txt'));

      vi.advanceTimersByTime(75);
      expect(kernelHandler).toHaveBeenCalledTimes(1);
      expect(uiHandler).not.toHaveBeenCalled();

      vi.advanceTimersByTime(425);
      expect(uiHandler).toHaveBeenCalledTimes(1);

      kernelRegistry.dispose();
      uiRegistry.dispose();
    });
  });

  describe('Topic-backed handler dispatch', () => {
    it('should not skip sibling handlers when one self-unsubscribes during delivery', () => {
      const sibling = vi.fn();
      const unsubscribeSelf = registry.watch({ paths: ['/src'] }, () => {
        unsubscribeSelf();
      });

      registry.watch({ paths: ['/src'] }, sibling);

      emitAndFlush(written('/src/file.txt'));

      expect(sibling).toHaveBeenCalledOnce();
    });

    it('should continue delivery when a handler throws', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const failing = vi.fn(() => {
        throw new Error('boom');
      });
      const succeeding = vi.fn();

      registry.watch({ paths: ['/src'] }, failing);
      registry.watch({ paths: ['/src'] }, succeeding);
      emitAndFlush(written('/src/file.txt'));

      expect(failing).toHaveBeenCalledOnce();
      expect(succeeding).toHaveBeenCalledOnce();
      consoleErrorSpy.mockRestore();
    });
  });
});
