import { describe, it, expect } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { RpcDirectoryEntry, RpcFileSystem } from '#rpc/rpc-dependencies.js';
import { rpcClientErrorCode } from '#schemas/rpc.schema.js';
import { handleListDirectory } from '#rpc/handlers/handle-list-directory.js';

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

describe('handleListDirectory', () => {
  it('should return directory entries with modifiedAt when available', async () => {
    const fileSystem = mock<RpcFileSystem>();
    fileSystem.readdir.mockResolvedValue([
      textEntry('index.ts', 200, { modifiedAt: '2026-01-10T08:00:00.000Z', lineCount: 12 }),
      { name: 'utils', type: 'dir', size: 0, modifiedAt: '2026-02-01T12:00:00.000Z' },
    ]);

    const result = await handleListDirectory({ path: 'src' }, fileSystem);

    expect(result).toEqual({
      success: true,
      path: 'src',
      entries: [
        {
          name: 'index.ts',
          type: 'file',
          size: 200,
          contentKind: 'text',
          lineCount: 12,
          modifiedAt: '2026-01-10T08:00:00.000Z',
        },
        { name: 'utils', type: 'dir', size: 0, modifiedAt: '2026-02-01T12:00:00.000Z' },
      ],
    });
  });

  it('should omit modifiedAt when not provided', async () => {
    const fileSystem = mock<RpcFileSystem>();
    fileSystem.readdir.mockResolvedValue([textEntry('readme.md', 500, { lineCount: 8 })]);

    const result = await handleListDirectory({ path: '' }, fileSystem);

    expect(result).toEqual({
      success: true,
      path: '',
      entries: [{ name: 'readme.md', type: 'file', size: 500, contentKind: 'text', lineCount: 8 }],
    });
  });

  it('should resolve the canonical empty path to the project root', async () => {
    const fileSystem = mock<RpcFileSystem>();
    fileSystem.readdir.mockImplementation(async (path) => {
      if (path === '') {
        return [{ name: 'checks', type: 'dir', size: 0 }];
      }
      throw new Error(`Unexpected non-canonical project path: ${path}`);
    });

    const result = await handleListDirectory({ path: '' }, fileSystem);

    expect(result).toEqual({
      success: true,
      path: '',
      entries: [{ name: 'checks', type: 'dir', size: 0 }],
    });
  });

  it.each(['.', './', '/'] as const)('should reject noncanonical root alias %j', async (path) => {
    const fileSystem = mock<RpcFileSystem>();

    const result = await handleListDirectory({ path }, fileSystem);

    expect(result).toMatchObject({ success: false, errorCode: rpcClientErrorCode.validationError });
    expect(fileSystem.readdir).not.toHaveBeenCalled();
  });

  it('should list the project root when path is omitted', async () => {
    const fileSystem = mock<RpcFileSystem>();
    fileSystem.readdir.mockImplementation(async (path) => {
      if (path === '') {
        return [{ name: 'checks', type: 'dir', size: 0 }];
      }
      throw new Error(`Unexpected non-canonical project path: ${path}`);
    });

    const result = await handleListDirectory({}, fileSystem);

    expect(fileSystem.readdir).toHaveBeenCalledWith('');
    expect(result).toEqual({
      success: true,
      path: '',
      entries: [{ name: 'checks', type: 'dir', size: 0 }],
    });
  });

  it('should reject paths outside the project before filesystem access', async () => {
    const fileSystem = mock<RpcFileSystem>();

    const result = await handleListDirectory({ path: '../secret' }, fileSystem);

    expect(result).toMatchObject({ success: false, errorCode: rpcClientErrorCode.validationError });
    expect(fileSystem.readdir).not.toHaveBeenCalled();
  });

  it('should return FILE_NOT_FOUND when readdir fails with ENOENT', async () => {
    const fileSystem = mock<RpcFileSystem>();
    const error = new Error('ENOENT: no such file');
    (error as NodeJS.ErrnoException).code = 'ENOENT';
    fileSystem.readdir.mockRejectedValue(error);

    const result = await handleListDirectory({ path: 'missing-dir' }, fileSystem);

    expect(result).toMatchObject({ success: false, errorCode: rpcClientErrorCode.fileNotFound });
  });

  it('should return error on readdir failure', async () => {
    const fileSystem = mock<RpcFileSystem>();
    fileSystem.readdir.mockRejectedValue(new Error('disk full'));

    const result = await handleListDirectory({ path: 'restricted' }, fileSystem);

    expect(result).toMatchObject({ success: false, errorCode: rpcClientErrorCode.ioError });
  });
});
