import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OPFSProvider } from '#backend/opfs-provider.js';
import { createMockRootHandle } from '#testing/mock-handle-factory.js';

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
