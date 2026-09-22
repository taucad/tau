import { createHash } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { RpcFileSystem } from '#rpc/rpc-dependencies.js';
import { rpcClientErrorCode } from '#schemas/rpc.schema.js';
import { handleEditFile } from '#rpc/handlers/handle-edit-file.js';

/** `expect.stringMatching` is untyped, so the matcher is named once and typed at its declaration. */
const anyContentDigest = expect.stringMatching(/^sha256:[0-9a-f]{64}$/u) as unknown as string;

describe('handleEditFile', () => {
  it('should replace a single occurrence and return count', async () => {
    const fileSystem = mock<RpcFileSystem>();
    fileSystem.editFile.mockResolvedValue({
      occurrences: 1,
      diffStats: { linesAdded: 1, linesRemoved: 1, originalContent: 'foo', modifiedContent: 'bar' },
    });

    const result = await handleEditFile({ targetFile: 'main.ts', oldString: 'foo', newString: 'bar' }, fileSystem);

    expect(result).toEqual({
      success: true,
      message: 'Replaced 1 occurrence in main.ts',
      occurrences: 1,
      diffStats: { linesAdded: 1, linesRemoved: 1, originalContent: 'foo', modifiedContent: 'bar' },
      revision: { path: 'main.ts', digest: anyContentDigest },
    });
    expect(fileSystem.editFile).toHaveBeenCalledWith('main.ts', 'foo', 'bar', undefined);
    expect(fileSystem.readFile).not.toHaveBeenCalled();
  });

  it('should pass replaceAll flag to filesystem', async () => {
    const fileSystem = mock<RpcFileSystem>();
    fileSystem.editFile.mockResolvedValue({
      occurrences: 3,
      diffStats: { linesAdded: 1, linesRemoved: 1, originalContent: 'xxx', modifiedContent: 'yyy' },
    });

    const result = await handleEditFile(
      { targetFile: 'main.ts', oldString: 'x', newString: 'y', replaceAll: true },
      fileSystem,
    );

    expect(result).toEqual({
      success: true,
      message: 'Replaced 3 occurrences in main.ts',
      occurrences: 3,
      diffStats: { linesAdded: 1, linesRemoved: 1, originalContent: 'xxx', modifiedContent: 'yyy' },
      revision: { path: 'main.ts', digest: anyContentDigest },
    });
    expect(fileSystem.editFile).toHaveBeenCalledWith('main.ts', 'x', 'y', true);
    expect(fileSystem.readFile).not.toHaveBeenCalled();
  });

  it('should report the digest of the file the edit left behind, not of the replacement text (R4)', async () => {
    const fileSystem = mock<RpcFileSystem>();
    const modifiedContent = 'const a = 1;\nconst b = 2;\n';
    fileSystem.editFile.mockResolvedValue({
      occurrences: 1,
      diffStats: { linesAdded: 1, linesRemoved: 1, originalContent: 'const a = 0;\nconst b = 2;\n', modifiedContent },
    });

    const result = await handleEditFile({ targetFile: 'main.ts', oldString: '0', newString: '1' }, fileSystem);

    expect(result).toMatchObject({
      revision: {
        path: 'main.ts',
        digest: `sha256:${createHash('sha256').update(modifiedContent, 'utf8').digest('hex')}`,
      },
    });
  });

  it('should return FILE_NOT_FOUND when file does not exist', async () => {
    const fileSystem = mock<RpcFileSystem>();
    const error = new Error('ENOENT: no such file');
    (error as NodeJS.ErrnoException).code = 'ENOENT';
    fileSystem.editFile.mockRejectedValue(error);

    const result = await handleEditFile({ targetFile: 'missing.ts', oldString: 'a', newString: 'b' }, fileSystem);

    expect(result).toMatchObject({ success: false, errorCode: rpcClientErrorCode.fileNotFound });
    expect(result).toMatchObject({ retryable: true });
  });

  it('should return IO_ERROR for generic filesystem errors', async () => {
    const fileSystem = mock<RpcFileSystem>();
    fileSystem.editFile.mockRejectedValue(new Error('disk full'));

    const result = await handleEditFile({ targetFile: 'main.ts', oldString: 'a', newString: 'b' }, fileSystem);

    expect(result).toMatchObject({ success: false, errorCode: rpcClientErrorCode.ioError });
    expect(result).toMatchObject({ retryable: true });
  });

  it('requires deterministic diffStats without falling back to whole-file reads', async () => {
    const fileSystem = mock<RpcFileSystem>();
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- Intentionally violate the typed contract to exercise the runtime boundary.
    fileSystem.editFile.mockResolvedValue({ occurrences: 1 } as unknown as Awaited<
      ReturnType<RpcFileSystem['editFile']>
    >);

    const result = await handleEditFile({ targetFile: 'main.ts', oldString: 'a', newString: 'b' }, fileSystem);

    expect(result).toMatchObject({
      success: false,
      errorCode: rpcClientErrorCode.ioError,
      message: 'Deterministic editFile implementations must return diffStats.',
    });
    expect(fileSystem.readFile).not.toHaveBeenCalled();
  });

  it('preserves deterministic edit error codes as retryable client failures', async () => {
    const fileSystem = mock<RpcFileSystem>();
    fileSystem.editFile.mockRejectedValue(
      Object.assign(new Error('oldString matched 2 locations.'), { code: rpcClientErrorCode.ambiguousMatch }),
    );

    const result = await handleEditFile({ targetFile: 'main.ts', oldString: 'x', newString: 'y' }, fileSystem);

    expect(result).toEqual({
      success: false,
      errorCode: rpcClientErrorCode.ambiguousMatch,
      message: 'oldString matched 2 locations.',
      retryable: true,
    });
  });
});
