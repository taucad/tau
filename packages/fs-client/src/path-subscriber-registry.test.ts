import { describe, it, expect, vi } from 'vitest';
import { PathSubscriberRegistry } from '#path-subscriber-registry.js';

describe('PathSubscriberRegistry', () => {
  it('dedupes the same callback reference and supports redundant unsubscribe', () => {
    const registry = new PathSubscriberRegistry<number>();
    const callback = vi.fn();
    const unsub = registry.subscribePath('a.ts', callback);
    registry.subscribePath('a.ts', callback);
    expect(registry.pathSubscriberCount).toBe(1);
    unsub();
    unsub();
    expect(registry.pathSubscriberCount).toBe(0);
  });

  it('no-ops notifyPath when no subscribers exist', () => {
    const registry = new PathSubscriberRegistry<string>();
    expect(() => {
      registry.notifyPath('missing.ts', 'x');
    }).not.toThrow();
  });

  it('snapshots subscribers before notify so newly added callbacks do not double-fire', () => {
    const registry = new PathSubscriberRegistry<void>();
    const order: string[] = [];
    const mid = (): void => {
      order.push('mid');
      registry.subscribePath('a.ts', () => {
        order.push('late');
      });
    };
    registry.subscribePath('a.ts', () => {
      order.push('first');
    });
    registry.subscribePath('a.ts', mid);
    registry.notifyPath('a.ts', undefined);
    expect(order).toEqual(['first', 'mid']);
  });

  it('clears all path and global listeners', () => {
    const registry = new PathSubscriberRegistry<number>();
    registry.subscribePath('a.ts', vi.fn());
    registry.subscribeGlobal(vi.fn());
    registry.clear();
    expect(registry.pathSubscriberCount).toBe(0);
    const g = vi.fn();
    registry.subscribeGlobal(g);
    registry.clear();
    registry.notifyGlobal(1);
    expect(g).not.toHaveBeenCalled();
  });

  it('tracks whether a path still has subscribers', () => {
    const registry = new PathSubscriberRegistry();
    expect(registry.hasPathSubscribers('a.ts')).toBe(false);
    const unsub = registry.subscribePath('a.ts', vi.fn());
    expect(registry.hasPathSubscribers('a.ts')).toBe(true);
    unsub();
    expect(registry.hasPathSubscribers('a.ts')).toBe(false);
  });

  it('contains handler throws and continues delivery to siblings', () => {
    const registry = new PathSubscriberRegistry<number>();
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const failing = vi.fn(() => {
      throw new Error('boom');
    });
    const succeeding = vi.fn();
    registry.subscribePath('a.ts', failing);
    registry.subscribePath('a.ts', succeeding);
    registry.notifyPath('a.ts', 1);
    expect(failing).toHaveBeenCalledOnce();
    expect(succeeding).toHaveBeenCalledOnce();
    consoleErrorSpy.mockRestore();
  });
});
