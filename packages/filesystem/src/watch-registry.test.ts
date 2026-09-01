/* oxlint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call -- oxlint false positive: cannot resolve types through #types.js path import */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WatchRegistry } from '#watch-registry.js';
import { ChangeEventBus } from '#change-event-bus.js';
import type { ChangeEvent, WatchRequest } from '#types.js';

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

  // --- Event type filter ---

  describe('event type filter', () => {
    it('should filter by event type when filter is set', () => {
      const handler = vi.fn();
      registry.watch({ paths: ['/src'], recursive: true, filter: { deleted: false } }, handler);

      emitAndFlush(deletedEvent('/src/file.txt'));
      expect(handler).not.toHaveBeenCalled();

      emitAndFlush(written('/src/file.txt'));
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should deliver all event types when filter is not set', () => {
      const handler = vi.fn();
      registry.watch({ paths: ['/src'], recursive: true }, handler);

      emitAndFlush(written('/src/a.txt'));
      emitAndFlush(deletedEvent('/src/b.txt'));
      expect(handler).toHaveBeenCalledTimes(2);
    });
  });

  // --- Correlation ID ---

  describe('correlationId', () => {
    it('should echo correlationId in outgoing events', () => {
      const handler = vi.fn();
      registry.watch({ paths: ['/src'], recursive: true, correlationId: 'test-123' }, handler);

      emitAndFlush(written('/src/file.txt'));
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ correlationId: 'test-123' }));
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

    it('should exclude renames where new path matches excludes', () => {
      const handler = vi.fn();
      registry.watch({ paths: ['/src'], recursive: true, excludes: ['/src/tmp/*'] }, handler);

      emitAndFlush(renamedEvent('/src/file.txt', '/src/tmp/file.txt'));
      expect(handler).not.toHaveBeenCalled();
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

    it('should tolerate double unsubscribe without error', () => {
      const handler = vi.fn();
      const unsub = registry.watch({ paths: ['/src'] }, handler);

      unsub();
      unsub();

      expect(registry.subscriptionCount).toBe(0);
    });
  });

  // --- Owner cleanup ---

  describe('owner cleanup', () => {
    it('should remove all watches for an owner on cleanupOwner', () => {
      const h1 = vi.fn();
      const h2 = vi.fn();

      registry.watch({ paths: ['/src'], recursive: true }, h1, 'port-1');
      registry.watch({ paths: ['/lib'], recursive: true }, h2, 'port-1');

      expect(registry.subscriptionCount).toBe(2);

      registry.cleanupOwner('port-1');
      expect(registry.subscriptionCount).toBe(0);

      emitAndFlush(written('/src/file.txt'));
      expect(h1).not.toHaveBeenCalled();
      expect(h2).not.toHaveBeenCalled();
    });

    it('should not affect other owners', () => {
      const h1 = vi.fn();
      const h2 = vi.fn();

      registry.watch({ paths: ['/src'] }, h1, 'port-1');
      registry.watch({ paths: ['/lib'] }, h2, 'port-2');

      registry.cleanupOwner('port-1');

      expect(registry.subscriptionCount).toBe(1);
      emitAndFlush(written('/lib/file.txt'));
      expect(h2).toHaveBeenCalledTimes(1);
    });

    it('should only remove the disconnecting owner handlers when multiple owners share a subscription', () => {
      const h1 = vi.fn();
      const h2 = vi.fn();
      const request: WatchRequest = { paths: ['/src'], recursive: true };

      registry.watch(request, h1, 'port-1');
      registry.watch(request, h2, 'port-2');

      expect(registry.subscriptionCount).toBe(1);
      expect(registry.handlerCount).toBe(2);

      registry.cleanupOwner('port-1');

      // Subscription should survive because port-2 still has a handler
      expect(registry.subscriptionCount).toBe(1);
      expect(registry.handlerCount).toBe(1);

      emitAndFlush(written('/src/file.txt'));
      expect(h1).not.toHaveBeenCalled();
      expect(h2).toHaveBeenCalledTimes(1);
    });

    it('should tolerate cleanup of nonexistent owner', () => {
      expect(() => {
        registry.cleanupOwner('nonexistent');
      }).not.toThrow();
    });
  });

  // --- Reset ---

  describe('reset / reconfigure', () => {
    it('should send reset to all subscribers when emitResetAll is called', () => {
      const h1 = vi.fn();
      const h2 = vi.fn();

      registry.watch({ paths: ['/src'], correlationId: 'c1' }, h1);
      registry.watch({ paths: ['/lib'], correlationId: 'c2' }, h2);

      registry.emitResetAll();

      expect(h1).toHaveBeenCalledWith(expect.objectContaining({ type: 'reset', correlationId: 'c1' }));
      expect(h2).toHaveBeenCalledWith(expect.objectContaining({ type: 'reset', correlationId: 'c2' }));
    });

    it('should trigger reset per subscription when backendChanged event occurs', () => {
      const handler = vi.fn();
      registry.watch({ paths: ['/src'], correlationId: 'abc' }, handler);

      bus.emit({ type: 'backendChanged', backend: testBackend });
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ type: 'reset', correlationId: 'abc' }));
    });
  });

  // --- Case sensitivity ---

  describe('case sensitivity', () => {
    it('should treat paths as-is in case-sensitive mode', () => {
      const handler = vi.fn();
      registry.watch({ paths: ['/Src'], recursive: true }, handler);

      emitAndFlush(written('/src/file.txt'));
      expect(handler).not.toHaveBeenCalled();

      emitAndFlush(written('/Src/file.txt'));
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should match regardless of case in case-insensitive mode', () => {
      registry.setCaseSensitive(false);

      const handler = vi.fn();
      registry.watch({ paths: ['/Src'], recursive: true }, handler);

      emitAndFlush(written('/src/file.txt'));
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

    it('should map directoryChanged to change', () => {
      const handler = vi.fn();
      registry.watch({ paths: ['/src'], recursive: true }, handler);

      emitAndFlush(directoryChanged('/src/subdir'));
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ type: 'change' }));
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

      registry.watch({ paths: ['/src'], correlationId: 'c1' }, failing);
      registry.watch({ paths: ['/src'], correlationId: 'c1' }, passing);

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

      const request: WatchRequest = { paths: ['/src'], correlationId: 'bc1' };
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

  // --- Overflow ---

  describe('overflow', () => {
    it('should emit overflow event to all handlers when coalescer queue is exceeded', () => {
      const overflowRegistry = new WatchRegistry(bus, { maxQueueDepth: 3 });

      const handler = vi.fn();
      overflowRegistry.watch({ paths: ['/src'], recursive: true, correlationId: 'ov1' }, handler);

      bus.emit(written('/src/1.txt'));
      bus.emit(written('/src/2.txt'));
      bus.emit(written('/src/3.txt'));
      expect(handler).not.toHaveBeenCalled();

      bus.emit(written('/src/4.txt'));
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ type: 'overflow', correlationId: 'ov1' }));

      overflowRegistry.dispose();
    });

    it('should log error and continue when handler throws during overflow', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const overflowRegistry = new WatchRegistry(bus, { maxQueueDepth: 3 });

      const failing = vi.fn(() => {
        throw new Error('overflow-boom');
      });
      const passing = vi.fn();
      const request: WatchRequest = { paths: ['/src'], recursive: true, correlationId: 'ov2' };
      overflowRegistry.watch(request, failing);
      overflowRegistry.watch(request, passing);

      bus.emit(written('/src/1.txt'));
      bus.emit(written('/src/2.txt'));
      bus.emit(written('/src/3.txt'));
      bus.emit(written('/src/4.txt'));

      expect(failing).toHaveBeenCalledTimes(1);
      expect(passing).toHaveBeenCalledTimes(1);
      expect(passing).toHaveBeenCalledWith(expect.objectContaining({ type: 'overflow' }));
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
      let unsubscribeSelf: (() => void) | undefined;

      unsubscribeSelf = registry.watch({ paths: ['/src'] }, () => {
        unsubscribeSelf?.();
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
