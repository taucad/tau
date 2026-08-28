// oxlint-disable-next-line import/no-unassigned-import -- IndexedDB polyfill for provider conformance
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FileSystemProvider } from '#types.js';
import { DirectIdbProvider } from '#backend/direct-idb-provider.js';
import { FileSystemAccessProvider } from '#backend/fs-access-provider.js';
import { MemoryProvider } from '#backend/memory-provider.js';
import { OPFSProvider } from '#backend/opfs-provider.js';
import { createMockRootHandle } from '#testing/mock-handle-factory.js';

let databaseSequence = 0;

const providers: ReadonlyArray<{
  name: string;
  create: () => Promise<FileSystemProvider>;
}> = [
  {
    name: 'Memory',
    create: async () => new MemoryProvider(),
  },
  {
    name: 'DirectIDB',
    create: async () => {
      const provider = new DirectIdbProvider(`provider-tree-${databaseSequence++}`);
      await provider.initialize();
      return provider;
    },
  },
  {
    name: 'File System Access',
    create: async () => new FileSystemAccessProvider(createMockRootHandle() as unknown as FileSystemDirectoryHandle),
  },
  {
    name: 'OPFS',
    create: async () => {
      const root = createMockRootHandle() as unknown as FileSystemDirectoryHandle;
      vi.stubGlobal('navigator', { storage: { getDirectory: vi.fn().mockResolvedValue(root) } });
      const provider = new OPFSProvider();
      await provider.initialize();
      return provider;
    },
  },
];

afterEach(() => {
  vi.unstubAllGlobals();
});

const expectCode = async (operation: Promise<unknown>, code: string): Promise<void> => {
  try {
    await operation;
    expect.fail(`Expected ${code}`);
  } catch (error) {
    expect((error as NodeJS.ErrnoException).code).toBe(code);
  }
};

describe.each(providers)('$name provider path-tree conformance', ({ create }) => {
  it('creates missing parent directories when writing a nested file', async () => {
    const provider = await create();
    try {
      await provider.writeFile('one/two/file.txt', 'data');

      await expect(provider.stat('one')).resolves.toMatchObject({ type: 'dir' });
      await expect(provider.stat('one/two')).resolves.toMatchObject({ type: 'dir' });
      await expect(provider.readFile('one/two/file.txt', 'utf8')).resolves.toBe('data');
    } finally {
      provider.dispose();
    }
  });

  it('never turns a file ancestor into a directory during recursive mkdir', async () => {
    const provider = await create();
    try {
      await provider.writeFile('leaf', 'original');

      await expectCode(provider.mkdir('leaf/child', { recursive: true }), 'EEXIST');

      await expect(provider.readFile('leaf', 'utf8')).resolves.toBe('original');
      await expect(provider.exists('leaf/child')).resolves.toBe(false);
      await expect(provider.stat('leaf')).resolves.toMatchObject({ type: 'file' });
    } finally {
      provider.dispose();
    }
  });

  it('rejects writing a file onto a directory without changing the tree', async () => {
    const provider = await create();
    try {
      await provider.mkdir('entry');

      await expectCode(provider.writeFile('entry', 'data'), 'EISDIR');

      await expect(provider.stat('entry')).resolves.toMatchObject({ type: 'dir' });
      await expect(provider.readdir('entry')).resolves.toEqual([]);
    } finally {
      provider.dispose();
    }
  });

  it('rejects wrong-kind deletion without deleting the entry', async () => {
    const provider = await create();
    try {
      await provider.mkdir('directory');
      await provider.writeFile('file', 'data');

      await expectCode(provider.unlink('directory'), 'EISDIR');
      await expectCode(provider.rmdir('file'), 'ENOTDIR');

      await expect(provider.stat('directory')).resolves.toMatchObject({ type: 'dir' });
      await expect(provider.readFile('file', 'utf8')).resolves.toBe('data');
    } finally {
      provider.dispose();
    }
  });

  it('rejects removing a directory that contains an empty directory', async () => {
    const provider = await create();
    try {
      await provider.mkdir('parent/child', { recursive: true });

      await expectCode(provider.rmdir('parent'), 'ENOTEMPTY');

      await expect(provider.stat('parent')).resolves.toMatchObject({ type: 'dir' });
      await expect(provider.stat('parent/child')).resolves.toMatchObject({ type: 'dir' });
    } finally {
      provider.dispose();
    }
  });

  it('preserves the root directory kind and rejects moving the root', async () => {
    const provider = await create();
    try {
      await expectCode(provider.readFile(''), 'EISDIR');
      await expectCode(provider.writeFile('', 'data'), 'EISDIR');
      await expectCode(provider.unlink(''), 'EISDIR');
      await expectCode(provider.mkdir(''), 'EEXIST');
      await expectCode(provider.rename('', 'moved-root'), 'EINVAL');

      await expect(provider.stat('')).resolves.toMatchObject({ type: 'dir' });
      await expect(provider.exists('moved-root')).resolves.toBe(false);
    } finally {
      provider.dispose();
    }
  });

  it('treats exact self-renames as no-ops and rejects descendant directory renames', async () => {
    const provider = await create();
    try {
      await provider.mkdir('directory');
      await provider.writeFile('directory/file.txt', 'data');
      await provider.writeFile('standalone.txt', 'standalone');

      await expect(provider.rename('directory', 'directory')).resolves.toBeUndefined();
      await expect(provider.rename('standalone.txt', 'standalone.txt')).resolves.toBeUndefined();
      await expectCode(provider.rename('directory', 'directory/nested'), 'EINVAL');

      await expect(provider.readFile('directory/file.txt', 'utf8')).resolves.toBe('data');
      await expect(provider.readFile('standalone.txt', 'utf8')).resolves.toBe('standalone');
      await expect(provider.exists('directory/nested')).resolves.toBe(false);
    } finally {
      provider.dispose();
    }
  });

  it('rejects absolute-looking and noncanonical paths before storage access', async () => {
    const provider = await create();
    try {
      await expect(provider.writeFile('/main.ts', 'data')).rejects.toMatchObject({ code: 'INVALID_PATH' });
      await expect(provider.stat('./main.ts')).rejects.toMatchObject({ code: 'INVALID_PATH' });
      await expect(provider.exists('main.ts')).resolves.toBe(false);
    } finally {
      provider.dispose();
    }
  });
});
