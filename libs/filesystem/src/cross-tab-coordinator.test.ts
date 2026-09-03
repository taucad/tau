import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CrossTabCoordinator } from '#cross-tab-coordinator.js';

describe('CrossTabCoordinator', () => {
  let coordinator: CrossTabCoordinator;
  const authority = { storageRootKey: 'indexeddb:test', providerBasePath: '' };

  beforeEach(() => {
    coordinator = new CrossTabCoordinator();
  });

  afterEach(() => {
    coordinator.dispose();
  });

  it('should execute an operation and return its result without Web Locks', async () => {
    await expect(coordinator.withLocks(['/test.txt'], async () => 'written')).resolves.toBe('written');
  });

  it('should propagate operation errors', async () => {
    await expect(
      coordinator.withLocks(['/fail.txt'], async () => {
        throw new TypeError('write failed');
      }),
    ).rejects.toThrow(new TypeError('write failed'));
  });

  it('should publish a successful mutation to sibling channels', async () => {
    const sibling = new BroadcastChannel('tau-fs-changes');
    try {
      const received = new Promise<unknown>((resolve) => {
        sibling.addEventListener('message', (event) => {
          resolve(event.data);
        });
      });

      await coordinator.withMutationLocks(
        ['/remote.txt'],
        { type: 'write', path: '/remote.txt', authority },
        async () => undefined,
      );

      await expect(received).resolves.toEqual({ type: 'write', path: '/remote.txt', authority });
    } finally {
      sibling.close();
    }
  });

  it('should not publish a failed mutation', async () => {
    const sibling = new BroadcastChannel('tau-fs-changes');
    const received: unknown[] = [];
    sibling.addEventListener('message', (event) => received.push(event.data));
    try {
      await expect(
        coordinator.withMutationLocks(['/failed.txt'], { type: 'write', path: '/failed.txt', authority }, async () => {
          throw new Error('failed');
        }),
      ).rejects.toThrow('failed');
      await new Promise((resolve) => {
        setTimeout(resolve, 20);
      });
      expect(received).toEqual([]);
    } finally {
      sibling.close();
    }
  });

  it('should receive directory invalidations with their canonical physical authority', async () => {
    const received: unknown[] = [];
    coordinator.onRemoteChange((notification) => received.push(notification));
    const sibling = new BroadcastChannel('tau-fs-changes');
    try {
      sibling.postMessage({
        type: 'directory-change',
        path: '/projects/proj_aaaaaaaaaaaaaaaaaaaaa',
        authority: { storageRootKey: 'opfs:origin', providerBasePath: 'model' },
      });
      await new Promise((resolve) => {
        setTimeout(resolve, 20);
      });

      expect(received).toEqual([
        {
          type: 'directory-change',
          path: '/projects/proj_aaaaaaaaaaaaaaaaaaaaa',
          authority: { storageRootKey: 'opfs:origin', providerBasePath: 'model' },
        },
      ]);
    } finally {
      sibling.close();
    }
  });

  it('should drop malformed change notifications with a diagnostic', async () => {
    const received: unknown[] = [];
    const diagnostic = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    coordinator.onRemoteChange((notification) => received.push(notification));
    const sibling = new BroadcastChannel('tau-fs-changes');
    try {
      for (const notification of [
        { type: 'write', path: 42, authority },
        { type: 'write', path: 'relative.txt', authority },
        { type: 'write', path: '/src/../main.ts', authority },
        { type: 'write', path: '/main.ts', authority: { ...authority, storageRootKey: '' } },
        { type: 'write', path: '/main.ts', authority: { ...authority, providerBasePath: '/rooted' } },
        { type: 'write', path: '/main.ts', authority: { ...authority, providerBasePath: 'src/../main' } },
      ]) {
        sibling.postMessage(notification);
      }
      await new Promise((resolve) => {
        setTimeout(resolve, 20);
      });

      expect(received).toEqual([]);
      expect(diagnostic).toHaveBeenCalledTimes(6);
      expect(diagnostic).toHaveBeenCalledWith('[CrossTabCoordinator] Dropped invalid change notification.');
    } finally {
      sibling.close();
      diagnostic.mockRestore();
    }
  });
});
