import { describe, it, expect } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { RpcFileSystem } from '#rpc/rpc-dependencies.js';
import { rpcName } from '#constants/rpc.constants.js';
import { rpcClientErrorCode, rpcSchemasRegistry } from '#schemas/rpc.schema.js';
import { handleDeleteFile } from '#rpc/handlers/handle-delete-file.js';

describe('handleDeleteFile', () => {
  it.each(['/src/a.ts', './src/a.ts'])(
    'should normalize agent path %j before every filesystem call',
    async (targetFile) => {
      const fileSystem = mock<RpcFileSystem>();
      fileSystem.readFile.mockResolvedValue('x');

      await handleDeleteFile({ targetFile }, fileSystem);

      expect(fileSystem.readFile).toHaveBeenCalledWith('src/a.ts');
      expect(fileSystem.deleteFile).toHaveBeenCalledWith('src/a.ts');
    },
  );

  it('should reject paths outside the project before filesystem access', async () => {
    const fileSystem = mock<RpcFileSystem>();

    const result = await handleDeleteFile({ targetFile: '../secret' }, fileSystem);

    expect(result).toMatchObject({ success: false, errorCode: rpcClientErrorCode.validationError });
    expect(fileSystem.readFile).not.toHaveBeenCalled();
    expect(fileSystem.deleteFile).not.toHaveBeenCalled();
  });

  it('should capture pre-deletion content as diffStats reading and deleting the same file exactly once (single round-trip)', async () => {
    const fileSystem = mock<RpcFileSystem>();
    fileSystem.readFile.mockResolvedValue('line1\nline2\nline3');
    fileSystem.deleteFile.mockResolvedValue();

    const result = await handleDeleteFile({ targetFile: 'src/old.ts' }, fileSystem);

    expect(result).toEqual({
      success: true,
      message: 'File deleted: src/old.ts',
      diffStats: {
        linesAdded: 0,
        linesRemoved: 3,
        originalContent: 'line1\nline2\nline3',
        modifiedContent: '',
      },
    });
    // Content is read inside the handler, so there is no separate read_file RPC.
    expect(fileSystem.readFile).toHaveBeenCalledTimes(1);
    expect(fileSystem.readFile).toHaveBeenCalledWith('src/old.ts');
    expect(fileSystem.deleteFile).toHaveBeenCalledTimes(1);
    expect(fileSystem.deleteFile).toHaveBeenCalledWith('src/old.ts');
  });

  it('should still delete and omit diffStats when the file is missing or unreadable', async () => {
    const fileSystem = mock<RpcFileSystem>();
    fileSystem.readFile.mockRejectedValue(new Error('ENOENT: no such file'));
    fileSystem.deleteFile.mockResolvedValue();

    const result = await handleDeleteFile({ targetFile: 'gone.ts' }, fileSystem);

    expect(result).toEqual({ success: true, message: 'File deleted: gone.ts', diffStats: undefined });
    expect(fileSystem.deleteFile).toHaveBeenCalledTimes(1);
    expect(fileSystem.deleteFile).toHaveBeenCalledWith('gone.ts');
  });

  it('should return an RPC error and not report success when the delete itself fails', async () => {
    const fileSystem = mock<RpcFileSystem>();
    fileSystem.readFile.mockResolvedValue('content');
    fileSystem.deleteFile.mockRejectedValue(new Error('EPERM: operation not permitted'));

    const result = await handleDeleteFile({ targetFile: 'locked.ts' }, fileSystem);

    expect(result).toMatchObject({ success: false });
  });

  it('should produce a success result that satisfies the delete RPC schema, with and without diffStats', () => {
    const { resultSchema } = rpcSchemasRegistry[rpcName.deleteFile];

    expect(
      resultSchema.safeParse({
        success: true,
        message: 'File deleted: a.ts',
        diffStats: { linesAdded: 0, linesRemoved: 2, originalContent: 'a\nb', modifiedContent: '' },
      }).success,
    ).toBe(true);
    // DiffStats is optional — a legacy/missing delete result is still valid.
    expect(resultSchema.safeParse({ success: true, message: 'File deleted: a.ts' }).success).toBe(true);
  });
});
