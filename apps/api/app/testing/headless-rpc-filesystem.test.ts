import { describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { RuntimeFileSystemBase } from '@taucad/runtime';
import { MemoryProvider } from '@taucad/filesystem/backend';
import { createHeadlessRpcFileSystem } from '#testing/headless-rpc-filesystem.js';

const createStrictFileSystem = async (files: Record<string, string> = {}) => {
  const base = new MemoryProvider();
  for (const [path, content] of Object.entries(files)) {
    await base.writeFile(path, content);
  }

  return {
    base,
    fileSystem: createHeadlessRpcFileSystem(base),
  };
};

describe('createHeadlessRpcFileSystem', () => {
  it('should list the project root with correct file and directory metadata', async () => {
    const { fileSystem } = await createStrictFileSystem({
      'main.ts': 'export const main = true;\n',
      'checks/existing.geospec.ts': "it('should exist');\n",
    });

    const entries = await fileSystem.readdir('');

    expect(entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'main.ts', type: 'file', contentKind: 'text', lineCount: 2 }),
        expect.objectContaining({ name: 'checks', type: 'dir', size: 0 }),
      ]),
    );
  });

  it('should map project-relative reads, stats, and existence checks to the strict runtime namespace', async () => {
    const { fileSystem } = await createStrictFileSystem({
      'main.ts': 'export const main = true;\n',
    });

    await expect(fileSystem.readFile('main.ts')).resolves.toBe('export const main = true;\n');
    await expect(fileSystem.stat('main.ts')).resolves.toMatchObject({
      isDirectory: false,
      contentKind: 'text',
      lineCount: 2,
    });
    await expect(fileSystem.exists('main.ts')).resolves.toBe(true);
  });

  it('should map every project-relative text mutation to the strict runtime namespace', async () => {
    const { base, fileSystem } = await createStrictFileSystem();

    await fileSystem.writeFile('draft.ts', 'const value = 1;\n');
    await fileSystem.appendFile('draft.ts', 'const retained = true;\n');
    await expect(base.readFile('draft.ts', 'utf8')).resolves.toBe('const value = 1;\nconst retained = true;\n');

    await fileSystem.deleteFile('draft.ts');
    await expect(base.exists('draft.ts')).resolves.toBe(false);
  });

  it('should map project-relative binary writes to the strict runtime namespace', async () => {
    const { base, fileSystem } = await createStrictFileSystem();
    const backing = new Uint8Array([0xff, 0x67, 0x6c, 0x54, 0x46, 0xff]);
    const bytes = backing.subarray(1, 5);

    await fileSystem.writeBinaryFile('model.glb', bytes);

    await expect(base.readFile('model.glb')).resolves.toEqual(new Uint8Array([0x67, 0x6c, 0x54, 0x46]));
  });

  it('should propagate append read errors other than a missing file', async () => {
    const runtimeFileSystem = mock<RuntimeFileSystemBase>();
    const readError = Object.assign(new Error('storage offline'), { name: 'StorageError', code: 'EIO' });
    runtimeFileSystem.readFile.mockRejectedValue(readError);
    const fileSystem = createHeadlessRpcFileSystem(runtimeFileSystem);

    await expect(fileSystem.appendFile('events.jsonl', '{"event":"test"}\n')).rejects.toBe(readError);
    expect(runtimeFileSystem.writeFile).not.toHaveBeenCalled();
  });

  it('should create a missing file when append reads ENOENT', async () => {
    const runtimeFileSystem = mock<RuntimeFileSystemBase>();
    runtimeFileSystem.readFile.mockRejectedValue(Object.assign(new Error('missing'), { code: 'ENOENT' }));
    const fileSystem = createHeadlessRpcFileSystem(runtimeFileSystem);

    await fileSystem.appendFile('events.jsonl', '{"event":"test"}\n');

    expect(runtimeFileSystem.writeFile).toHaveBeenCalledWith('events.jsonl', '{"event":"test"}\n');
  });

  it('should propagate child stat errors instead of fabricating binary file metadata', async () => {
    const runtimeFileSystem = mock<RuntimeFileSystemBase>();
    const statError = Object.assign(new Error('storage offline'), { name: 'StorageError', code: 'EIO' });
    runtimeFileSystem.readdir.mockResolvedValue(['unavailable']);
    runtimeFileSystem.stat.mockRejectedValue(statError);
    const fileSystem = createHeadlessRpcFileSystem(runtimeFileSystem);

    await expect(fileSystem.readdir('')).rejects.toMatchObject({
      name: 'StorageError',
      message: 'storage offline',
      code: 'EIO',
    });
  });

  it('should omit a child that disappears between readdir and stat', async () => {
    const runtimeFileSystem = mock<RuntimeFileSystemBase>();
    const missingError = Object.assign(new Error('ENOENT: child disappeared'), { code: 'ENOENT' });
    runtimeFileSystem.readdir.mockResolvedValue(['gone.ts', 'main.ts']);
    runtimeFileSystem.stat.mockImplementation(async (path) => {
      if (path.endsWith('gone.ts')) {
        throw missingError;
      }
      return { type: 'file', size: 10, mtimeMs: 0, contentKind: 'text', lineCount: 1 };
    });
    const fileSystem = createHeadlessRpcFileSystem(runtimeFileSystem);

    await expect(fileSystem.readdir('')).resolves.toEqual([
      {
        name: 'main.ts',
        type: 'file',
        size: 10,
        contentKind: 'text',
        lineCount: 1,
        modifiedAt: '1970-01-01T00:00:00.000Z',
      },
    ]);
  });

  it('should preserve strict rejection of malformed virtual paths', async () => {
    const { fileSystem } = await createStrictFileSystem({
      'main.ts': 'export {};',
    });

    await expect(fileSystem.readFile('//main.ts')).rejects.toMatchObject({
      name: 'VirtualPathError',
      message: 'Invalid virtual path.',
      code: 'INVALID_PATH',
    });
  });
});
