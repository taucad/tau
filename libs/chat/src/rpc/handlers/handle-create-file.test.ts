import { createHash } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { RpcFileSystem } from '#rpc/rpc-dependencies.js';
import { rpcClientErrorCode } from '#schemas/rpc.schema.js';
import { handleCreateFile } from '#rpc/handlers/handle-create-file.js';

/** `expect.stringMatching` is untyped, so the matcher is named once and typed at its declaration. */
const anyContentDigest = expect.stringMatching(/^sha256:[0-9a-f]{64}$/u) as unknown as string;

describe('handleCreateFile', () => {
  it('should pass a canonical rooted path through unchanged', async () => {
    const fileSystem = mock<RpcFileSystem>();
    fileSystem.exists.mockResolvedValue(false);
    fileSystem.writeFile.mockResolvedValue();

    await handleCreateFile({ targetFile: 'src/a.ts', content: 'x' }, fileSystem);

    expect(fileSystem.writeFile).toHaveBeenCalledWith('src/a.ts', 'x');
  });

  it.each(['/src/a.ts', './src/a.ts'])('should reject noncanonical rooted path %j', async (targetFile) => {
    const fileSystem = mock<RpcFileSystem>();

    const result = await handleCreateFile({ targetFile, content: 'x' }, fileSystem);

    expect(result).toMatchObject({ success: false, errorCode: rpcClientErrorCode.validationError });
    expect(fileSystem.exists).not.toHaveBeenCalled();
    expect(fileSystem.writeFile).not.toHaveBeenCalled();
  });

  it('should reject host paths before filesystem access', async () => {
    const fileSystem = mock<RpcFileSystem>();

    const result = await handleCreateFile({ targetFile: 'C:/secret', content: 'x' }, fileSystem);

    expect(result).toMatchObject({ success: false, errorCode: rpcClientErrorCode.validationError });
    expect(fileSystem.exists).not.toHaveBeenCalled();
    expect(fileSystem.writeFile).not.toHaveBeenCalled();
  });

  it('should capture prior content as originalContent and linesRemoved when overwriting an existing file', async () => {
    const fileSystem = mock<RpcFileSystem>();
    fileSystem.exists.mockResolvedValue(true);
    fileSystem.readFile.mockResolvedValue('old1\nold2');
    fileSystem.writeFile.mockResolvedValue();

    const result = await handleCreateFile({ targetFile: 'src/a.ts', content: 'new1\nnew2\nnew3' }, fileSystem);

    expect(result).toEqual({
      success: true,
      message: 'File created: src/a.ts',
      diffStats: {
        linesAdded: 3,
        linesRemoved: 2,
        originalContent: 'old1\nold2',
        modifiedContent: 'new1\nnew2\nnew3',
      },
      revision: { path: 'src/a.ts', digest: anyContentDigest },
    });
    expect(fileSystem.writeFile).toHaveBeenCalledWith('src/a.ts', 'new1\nnew2\nnew3');
  });

  it('should emit empty originalContent and zero linesRemoved for a genuinely new file, without reading', async () => {
    const fileSystem = mock<RpcFileSystem>();
    fileSystem.exists.mockResolvedValue(false);
    fileSystem.writeFile.mockResolvedValue();

    const result = await handleCreateFile({ targetFile: 'src/new.ts', content: 'a\nb' }, fileSystem);

    expect(result).toEqual({
      success: true,
      message: 'File created: src/new.ts',
      diffStats: {
        linesAdded: 2,
        linesRemoved: 0,
        originalContent: '',
        modifiedContent: 'a\nb',
      },
      revision: { path: 'src/new.ts', digest: anyContentDigest },
    });
    expect(fileSystem.readFile).not.toHaveBeenCalled();
  });

  it('should report the digest of the bytes it wrote (R4)', async () => {
    const fileSystem = mock<RpcFileSystem>();
    fileSystem.exists.mockResolvedValue(false);
    fileSystem.writeFile.mockResolvedValue();
    const content = 'export const width = 10;\n';

    const result = await handleCreateFile({ targetFile: 'src/a.ts', content }, fileSystem);

    // Hashed here by an independent implementation: the digest must identify the bytes, not the code path.
    expect(result).toMatchObject({
      revision: { path: 'src/a.ts', digest: `sha256:${createHash('sha256').update(content, 'utf8').digest('hex')}` },
    });
  });

  it('should return an RPC error when the write fails', async () => {
    const fileSystem = mock<RpcFileSystem>();
    fileSystem.exists.mockResolvedValue(false);
    fileSystem.writeFile.mockRejectedValue(new Error('EACCES: permission denied'));

    const result = await handleCreateFile({ targetFile: 'src/nope.ts', content: 'x' }, fileSystem);

    expect(result).toMatchObject({ success: false });
  });
});
