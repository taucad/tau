import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CrossTabCoordinator, withCrossTabLocks } from '#cross-tab-coordinator.js';

it('should request each token once in its strongest mode, in sorted order', async () => {
  const acquired: Array<[string, LockMode | undefined]> = [];
  const request = vi.fn(async (name: string, options: LockOptions, run: () => Promise<unknown>) => {
    acquired.push([name, options.mode]);
    return run();
  });
  vi.stubGlobal('navigator', { locks: { request } });
  try {
    await withCrossTabLocks(
      [{ token: '/b', shared: true }, { token: '/a', shared: true }, '/b', { token: '/c', shared: true }],
      async () => undefined,
    );
    expect(acquired).toEqual([
      ['tau-fs-write:/a', 'shared'],
      ['tau-fs-write:/b', 'exclusive'],
      ['tau-fs-write:/c', 'shared'],
    ]);
  } finally {
    vi.unstubAllGlobals();
  }
});

it('should acquire a chain longer than a synchronous lock manager can nest', async () => {
  const request = vi.fn(async (_name: string, _options: LockOptions, run: () => Promise<unknown>) => run());
  vi.stubGlobal('navigator', { locks: { request } });
  try {
    const tokens = Array.from({ length: 5000 }, (_, index) => `/file-${String(index).padStart(5, '0')}`);
    await expect(withCrossTabLocks(tokens, async () => 'held')).resolves.toBe('held');
    expect(request).toHaveBeenCalledTimes(5000);
  } finally {
    vi.unstubAllGlobals();
  }
});

it('shares sorted unique lock tokens without creating a notification channel', async () => {
  const channel = vi.fn();
  const acquired: string[] = [];
  const request = vi.fn(async (name: string, options: LockOptions, run: () => Promise<unknown>) => {
    expect(options).toEqual({ mode: 'exclusive' });
    acquired.push(name);
    return run();
  });
  vi.stubGlobal('navigator', { locks: { request } });
  vi.stubGlobal('BroadcastChannel', channel);
  try {
    await expect(withCrossTabLocks(['/b', '/a', '/b'], async () => 'written')).resolves.toBe('written');
    expect(acquired).toEqual(['tau-fs-write:/a', 'tau-fs-write:/b']);
    expect(channel).not.toHaveBeenCalled();
  } finally {
    vi.unstubAllGlobals();
  }
});

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

      await expect(received).resolves.toEqual({
        tabId: expect.any(String),
        seq: 1,
        changes: [{ type: 'write', path: '/remote.txt', authority }],
      });
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
      const change = {
        type: 'directory-change',
        path: '/projects/proj_aaaaaaaaaaaaaaaaaaaaa',
        authority: { storageRootKey: 'opfs:origin', providerBasePath: 'model' },
      };
      sibling.postMessage({ tabId: 'sibling', seq: 1, changes: [change] });
      await new Promise((resolve) => {
        setTimeout(resolve, 20);
      });

      expect(received).toEqual([{ tabId: 'sibling', seq: 1, changes: [change] }]);
    } finally {
      sibling.close();
    }
  });

  it('should publish every fact of one changeset as one notice with an increasing sequence', async () => {
    const sibling = new BroadcastChannel('tau-fs-changes');
    const received: unknown[] = [];
    sibling.addEventListener('message', (event) => received.push(event.data));
    try {
      coordinator.notifyChanges([
        { type: 'write', path: '/a.txt', authority },
        { type: 'delete', path: '/b.txt', authority },
      ]);
      coordinator.notifyDirectoryChange('/c', authority);
      await new Promise((resolve) => {
        setTimeout(resolve, 20);
      });

      expect(received).toEqual([
        {
          tabId: expect.any(String),
          seq: 1,
          changes: [
            { type: 'write', path: '/a.txt', authority },
            { type: 'delete', path: '/b.txt', authority },
          ],
        },
        { tabId: expect.any(String), seq: 2, changes: [{ type: 'directory-change', path: '/c', authority }] },
      ]);
    } finally {
      sibling.close();
    }
  });

  it('should mark a notice that follows a lost one from the same tab', async () => {
    const received: Array<{ gap?: boolean }> = [];
    coordinator.onRemoteChange((notice) => received.push(notice));
    const sibling = new BroadcastChannel('tau-fs-changes');
    const changes = [{ type: 'write', path: '/a.txt', authority }];
    try {
      sibling.postMessage({ tabId: 'sibling', seq: 1, changes });
      sibling.postMessage({ tabId: 'sibling', seq: 2, changes });
      sibling.postMessage({ tabId: 'sibling', seq: 4, changes });
      await new Promise((resolve) => {
        setTimeout(resolve, 20);
      });

      expect(received.map(({ gap }) => gap === true)).toEqual([false, false, true]);
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
        sibling.postMessage({ tabId: 'sibling', seq: 1, changes: [notification] });
      }
      await new Promise((resolve) => {
        setTimeout(resolve, 20);
      });

      expect(received).toEqual([]);
      expect(diagnostic).toHaveBeenCalledTimes(6);
      expect(diagnostic).toHaveBeenCalledWith('[CrossTabCoordinator] Dropped invalid change notice.');
    } finally {
      sibling.close();
      diagnostic.mockRestore();
    }
  });
});
