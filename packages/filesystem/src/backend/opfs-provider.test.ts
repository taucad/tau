import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FileSystemAccessProvider } from '#backend/fs-access-provider.js';
import { OPFSProvider } from '#backend/opfs-provider.js';
import { createMockRootHandle } from '#testing/mock-handle-factory.js';
import type { MockRootHandleOptions } from '#testing/mock-handle-factory.js';

describe('OPFSProvider lifecycle', () => {
  beforeEach(() => {
    const root = createMockRootHandle() as unknown as FileSystemDirectoryHandle;
    vi.stubGlobal('navigator', { storage: { getDirectory: vi.fn().mockResolvedValue(root) } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const operations: ReadonlyArray<{
    name: string;
    run: (provider: OPFSProvider) => Promise<unknown>;
  }> = [
    { name: 'writeFile', run: async (provider) => provider.writeFile('/file', 'x') },
    { name: 'readFile', run: async (provider) => provider.readFile('/file') },
    { name: 'readdir', run: async (provider) => provider.readdir('/') },
    { name: 'readdirWithStats', run: async (provider) => provider.readdirWithStats('/') },
    { name: 'stat', run: async (provider) => provider.stat('/') },
    { name: 'lstat', run: async (provider) => provider.lstat('/') },
    { name: 'exists', run: async (provider) => provider.exists('/') },
    { name: 'mkdir', run: async (provider) => provider.mkdir('/directory') },
    { name: 'unlink', run: async (provider) => provider.unlink('/file') },
    { name: 'rmdir', run: async (provider) => provider.rmdir('/directory') },
    { name: 'rename', run: async (provider) => provider.rename('/source', '/target') },
    { name: 'readFileStream', run: async (provider) => provider.readFileStream('/file') },
    { name: 'refresh', run: async (provider) => provider.refresh() },
  ];

  it.each(['before initialization', 'after disposal'] as const)('rejects every public operation %s', async (phase) => {
    for (const operation of operations) {
      const provider = new OPFSProvider();
      if (phase === 'after disposal') {
        // oxlint-disable-next-line no-await-in-loop -- Each operation needs an independently revoked root.
        await provider.initialize();
        provider.dispose();
      }
      // oxlint-disable-next-line no-await-in-loop -- Table assertions intentionally execute in a deterministic order.
      await expect(operation.run(provider), operation.name).rejects.toThrow('not initialized');
    }
  });

  it('allows operations after initialization and revokes them on dispose', async () => {
    const provider = new OPFSProvider();
    await provider.initialize();
    await provider.writeFile('/file.txt', 'ready');
    await expect(provider.readFile('/file.txt', 'utf8')).resolves.toBe('ready');

    provider.dispose();
    await expect(provider.readFile('/file.txt')).rejects.toThrow('not initialized');
  });
});

describe('OPFS writes via sync access handles', () => {
  const bytes = new Uint8Array([0, 1, 2, 250, 251, 252]);

  const mountRoot = (
    options: MockRootHandleOptions,
  ): { root: ReturnType<typeof createMockRootHandle>; acquired: string[] } => {
    const acquired: string[] = [];
    const root = createMockRootHandle({ ...options, onAcquireWriteApi: (api) => acquired.push(api) });
    vi.stubGlobal('navigator', { storage: { getDirectory: vi.fn().mockResolvedValue(root) } });
    return { root, acquired };
  };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('writes through createSyncAccessHandle when the API exists', async () => {
    const { acquired } = mountRoot({});
    const provider = new OPFSProvider();
    await provider.initialize();

    await provider.writeFile('/nested/data.bin', bytes);

    expect(acquired).toEqual(['sync']);
    await expect(provider.readFile('/nested/data.bin')).resolves.toEqual(bytes);
  });

  it('truncates a longer prior file instead of leaving a tail', async () => {
    mountRoot({});
    const provider = new OPFSProvider();
    await provider.initialize();

    await provider.writeFile('/data.bin', new Uint8Array([9, 9, 9, 9, 9, 9, 9, 9]));
    await provider.writeFile('/data.bin', new Uint8Array([1, 2]));

    await expect(provider.readFile('/data.bin')).resolves.toEqual(new Uint8Array([1, 2]));
  });

  it('falls back to createWritable when the environment lacks the API', async () => {
    const { acquired } = mountRoot({ syncAccess: false });
    const provider = new OPFSProvider();
    await provider.initialize();

    await provider.writeFile('/data.bin', bytes);

    expect(acquired).toEqual(['writable']);
    await expect(provider.readFile('/data.bin')).resolves.toEqual(bytes);
  });

  it('retries once then falls back to createWritable while another sync handle is open', async () => {
    const { root, acquired } = mountRoot({});
    const provider = new OPFSProvider();
    await provider.initialize();
    await provider.writeFile('/data.bin', new Uint8Array([7]));

    const contendedHandle = await root.getFileHandle('data.bin');
    const contender = await contendedHandle.createSyncAccessHandle!();
    acquired.length = 0;
    try {
      await provider.writeFile('/data.bin', bytes);
    } finally {
      contender.close();
    }

    expect(acquired).toEqual(['sync', 'sync', 'writable']);
    await expect(provider.readFile('/data.bin')).resolves.toEqual(bytes);
  });

  it('keeps the user-picked webaccess provider on createWritable', async () => {
    const acquired: string[] = [];
    const root = createMockRootHandle({ onAcquireWriteApi: (api) => acquired.push(api) });
    const provider = new FileSystemAccessProvider(root as unknown as FileSystemDirectoryHandle);

    await provider.writeFile('/data.bin', bytes);

    expect(acquired).toEqual(['writable']);
    await expect(provider.readFile('/data.bin')).resolves.toEqual(bytes);
  });
});
