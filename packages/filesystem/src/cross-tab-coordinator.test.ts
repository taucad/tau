import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CrossTabCoordinator } from '#cross-tab-coordinator.js';

describe('CrossTabCoordinator', () => {
  let coordinator: CrossTabCoordinator;
  const authority = { storageRootKey: 'indexeddb:test', providerBasePath: '/' };

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
        authority: { storageRootKey: 'opfs:origin', providerBasePath: '/projects/model' },
      });
      await new Promise((resolve) => {
        setTimeout(resolve, 20);
      });

      expect(received).toEqual([
        {
          type: 'directory-change',
          path: '/projects/proj_aaaaaaaaaaaaaaaaaaaaa',
          authority: { storageRootKey: 'opfs:origin', providerBasePath: '/projects/model' },
        },
      ]);
    } finally {
      sibling.close();
    }
  });
});
