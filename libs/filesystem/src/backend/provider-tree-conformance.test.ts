// oxlint-disable-next-line import/no-unassigned-import -- IndexedDB polyfill for provider conformance
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FileSystemProvider } from '#types.js';
import { DirectIdbProvider } from '#backend/direct-idb-provider.js';
import { FileSystemAccessProvider } from '#backend/fs-access-provider.js';
import { MemoryProvider } from '#backend/memory-provider.js';
import { OPFSProvider } from '#backend/opfs-provider.js';
import { NodeFsProvider } from '#backend/node/provider.js';
import { NodeFsChannel, NodeFsProviderClient } from '#backend/node/client.js';
import { serveNodeFsProvider } from '#backend/node/host.js';
import { createMockRootHandle } from '#testing/mock-handle-factory.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let databaseSequence = 0;

const temporaryRoots: string[] = [];
const disposers: Array<() => void> = [];

const createTemporaryRoot = (): string => {
  const root = mkdtempSync(join(tmpdir(), 'tau-node-provider-'));
  temporaryRoots.push(root);
  return root;
};

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
  {
    name: 'Node',
    create: async () => new NodeFsProvider(createTemporaryRoot()),
  },
  {
    // The same contract has to survive the process seam, or the client half is
    // a second, unverified implementation of the path tree.
    name: 'Node over a port',
    create: async () => {
      const { port1, port2 } = new MessageChannel();
      const root = createTemporaryRoot();
      const stop = serveNodeFsProvider(port2, { allowRoot: (candidate) => candidate === root });
      const channel = new NodeFsChannel(port1);
      disposers.push(() => {
        channel.close();
        stop();
        port2.close();
      });
      return new NodeFsProviderClient(channel, root);
    },
  },
];

afterEach(() => {
  vi.unstubAllGlobals();
  for (const dispose of disposers.splice(0)) {
    dispose();
  }
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

const expectCode = async (operation: Promise<unknown>, code: string): Promise<void> => {
  try {
    await operation;
    expect.fail(`Expected ${code}`);
  } catch (error) {
    expect((error as NodeJS.ErrnoException).code).toBe(code);
  }
};

const appendFile = async (
  provider: FileSystemProvider,
  path: string,
  data: Uint8Array<ArrayBuffer> | string,
): Promise<void> => {
  const append = (
    provider as FileSystemProvider & {
      appendFile?: (path: string, data: Uint8Array<ArrayBuffer> | string) => Promise<void>;
    }
  ).appendFile;
  if (append === undefined) {
    throw new Error('appendFile is not implemented');
  }
  await append.call(provider, path, data);
};

describe.each(providers)('$name provider path-tree conformance', ({ create }) => {
  it('creates a missing file and its parents when appending', async () => {
    const provider = await create();
    try {
      await appendFile(provider, 'one/two/log.bin', new Uint8Array([1, 2, 3]));

      await expect(provider.stat('one/two')).resolves.toMatchObject({ type: 'dir' });
      await expect(provider.readFile('one/two/log.bin')).resolves.toEqual(new Uint8Array([1, 2, 3]));
    } finally {
      provider.dispose();
    }
  });

  it('round-trips appended bytes through readFile', async () => {
    const provider = await create();
    try {
      await appendFile(provider, 'events.log', new Uint8Array([0, 255, 10]));

      await expect(provider.readFile('events.log')).resolves.toEqual(new Uint8Array([0, 255, 10]));
    } finally {
      provider.dispose();
    }
  });

  it('preserves prior bytes when appending', async () => {
    const provider = await create();
    try {
      await provider.writeFile('events.log', new Uint8Array([1, 2]));
      await appendFile(provider, 'events.log', new Uint8Array([3, 4]));

      await expect(provider.readFile('events.log')).resolves.toEqual(new Uint8Array([1, 2, 3, 4]));
    } finally {
      provider.dispose();
    }
  });

  it('preserves append enqueue order under concurrency', async () => {
    const provider = await create();
    try {
      await Promise.all([
        appendFile(provider, 'events.log', 'first\n'),
        appendFile(provider, 'events.log', 'second\n'),
        appendFile(provider, 'events.log', 'third\n'),
      ]);

      await expect(provider.readFile('events.log', 'utf8')).resolves.toBe('first\nsecond\nthird\n');
    } finally {
      provider.dispose();
    }
  });

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
