import { describe, it, expect } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { RpcDirectoryEntry, RpcFileSystem } from '#rpc/rpc-dependencies.js';
import { rpcClientErrorCode } from '#schemas/rpc.schema.js';
import { handleGlobSearch } from '#rpc/handlers/handle-glob-search.js';

const textEntry = (
  name: string,
  size: number,
  options?: { modifiedAt?: string; lineCount?: number },
): RpcDirectoryEntry => ({
  name,
  type: 'file',
  size,
  contentKind: 'text',
  lineCount: options?.lineCount ?? 1,
  ...(options?.modifiedAt ? { modifiedAt: options.modifiedAt } : {}),
});

describe('handleGlobSearch', () => {
  it('should return matching files with metadata entries', async () => {
    const fileSystem = mock<RpcFileSystem>();
    fileSystem.readdir.mockResolvedValue([
      textEntry('index.ts', 100, { modifiedAt: '2026-01-15T10:00:00.000Z', lineCount: 10 }),
      textEntry('utils.ts', 200, { modifiedAt: '2026-02-20T14:00:00.000Z', lineCount: 20 }),
      textEntry('readme.md', 50, { lineCount: 3 }),
    ]);

    const result = await handleGlobSearch({ pattern: '*.ts' }, fileSystem);

    expect(result).toMatchObject({
      success: true,
      totalFiles: 2,
      files: ['index.ts', 'utils.ts'],
    });
    expect(result.success && result.entries).toEqual([
      {
        path: 'index.ts',
        isDirectory: false,
        size: 100,
        contentKind: 'text',
        lineCount: 10,
        modifiedAt: '2026-01-15T10:00:00.000Z',
      },
      {
        path: 'utils.ts',
        isDirectory: false,
        size: 200,
        contentKind: 'text',
        lineCount: 20,
        modifiedAt: '2026-02-20T14:00:00.000Z',
      },
    ]);
  });

  it('should return empty results for no matches', async () => {
    const fileSystem = mock<RpcFileSystem>();
    fileSystem.readdir.mockResolvedValue([textEntry('readme.md', 50)]);

    const result = await handleGlobSearch({ pattern: '*.py' }, fileSystem);

    expect(result).toMatchObject({
      success: true,
      files: [],
      entries: [],
      totalFiles: 0,
    });
  });

  it('should recursively search subdirectories', async () => {
    const fileSystem = mock<RpcFileSystem>();
    fileSystem.readdir
      .mockResolvedValueOnce([{ name: 'src', type: 'dir', size: 0 }, textEntry('package.json', 300, { lineCount: 15 })])
      .mockResolvedValueOnce([textEntry('app.ts', 150, { modifiedAt: '2026-03-01T00:00:00.000Z', lineCount: 7 })]);

    const result = await handleGlobSearch({ pattern: '**/*.ts' }, fileSystem);

    expect(result).toMatchObject({
      success: true,
      files: ['src/app.ts'],
      totalFiles: 1,
    });
  });

  it('should recursively walk the canonical project root', async () => {
    const fileSystem = mock<RpcFileSystem>();
    fileSystem.readdir.mockImplementation(async (path) => {
      if (path === '') {
        return [{ name: 'checks', type: 'dir', size: 0 }];
      }
      if (path === 'checks') {
        return [textEntry('existing.geospec.ts', 120, { lineCount: 4 })];
      }
      throw new Error(`Unexpected non-canonical project path: ${path}`);
    });

    const result = await handleGlobSearch({ pattern: '**/*.geospec.ts', path: '' }, fileSystem);

    expect(result).toEqual({
      success: true,
      files: ['checks/existing.geospec.ts'],
      entries: [
        {
          path: 'checks/existing.geospec.ts',
          isDirectory: false,
          size: 120,
          contentKind: 'text',
          lineCount: 4,
        },
      ],
      totalFiles: 1,
    });
  });

  it.each(['.', './', '/'] as const)('should reject noncanonical root alias %j', async (path) => {
    const fileSystem = mock<RpcFileSystem>();

    const result = await handleGlobSearch({ pattern: '**/*.ts', path }, fileSystem);

    expect(result).toMatchObject({ success: false, errorCode: rpcClientErrorCode.validationError });
    expect(fileSystem.readdir).not.toHaveBeenCalled();
  });

  it('should reject paths outside the project before filesystem access', async () => {
    const fileSystem = mock<RpcFileSystem>();

    const result = await handleGlobSearch({ pattern: '*.ts', path: '../secret' }, fileSystem);

    expect(result).toMatchObject({ success: false, errorCode: rpcClientErrorCode.validationError });
    expect(fileSystem.readdir).not.toHaveBeenCalled();
  });

  it('should return FILE_NOT_FOUND when readdir fails with ENOENT', async () => {
    const fileSystem = mock<RpcFileSystem>();
    const error = new Error('ENOENT: no such file');
    (error as NodeJS.ErrnoException).code = 'ENOENT';
    fileSystem.readdir.mockRejectedValue(error);

    const result = await handleGlobSearch({ pattern: '*.ts' }, fileSystem);

    expect(result).toMatchObject({ success: false, errorCode: rpcClientErrorCode.fileNotFound });
  });

  it('should return IO_ERROR on readdir failure', async () => {
    const fileSystem = mock<RpcFileSystem>();
    fileSystem.readdir.mockRejectedValue(new Error('disk error'));

    const result = await handleGlobSearch({ pattern: '*.ts' }, fileSystem);

    expect(result).toMatchObject({ success: false, errorCode: rpcClientErrorCode.ioError });
  });
});
