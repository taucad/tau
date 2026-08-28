import { describe, it, expect } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { RpcFileSystem } from '#rpc/rpc-dependencies.js';
import { rpcClientErrorCode } from '#schemas/rpc.schema.js';
import { handleAppendFile } from '#rpc/handlers/handle-append-file.js';

describe('handleAppendFile', () => {
  it('should pass a canonical rooted path through unchanged', async () => {
    const fileSystem = mock<RpcFileSystem>();

    await handleAppendFile({ targetFile: 'src/a.ts', content: 'x' }, fileSystem);

    expect(fileSystem.appendFile).toHaveBeenCalledWith('src/a.ts', 'x');
  });

  it.each(['/src/a.ts', './src/a.ts'])('should reject noncanonical rooted path %j', async (targetFile) => {
    const fileSystem = mock<RpcFileSystem>();

    const result = await handleAppendFile({ targetFile, content: 'x' }, fileSystem);

    expect(result).toMatchObject({ success: false, errorCode: rpcClientErrorCode.validationError });
    expect(fileSystem.appendFile).not.toHaveBeenCalled();
  });

  it('should reject host paths before filesystem access', async () => {
    const fileSystem = mock<RpcFileSystem>();

    const result = await handleAppendFile({ targetFile: 'file:///secret', content: 'x' }, fileSystem);

    expect(result).toMatchObject({ success: false, errorCode: rpcClientErrorCode.validationError });
    expect(fileSystem.appendFile).not.toHaveBeenCalled();
  });

  it('should append content and return bytes written', async () => {
    const fileSystem = mock<RpcFileSystem>();
    fileSystem.appendFile.mockResolvedValue(undefined);

    const result = await handleAppendFile({ targetFile: 'log.jsonl', content: '{"event":"test"}\n' }, fileSystem);

    expect(result).toEqual({
      success: true,
      // oxlint-disable-next-line typescript/no-unsafe-assignment -- expected string containing log.jsonl
      message: expect.stringContaining('log.jsonl'),
      // oxlint-disable-next-line typescript/no-unsafe-assignment -- expected any number
      bytesWritten: expect.any(Number),
    });
    expect(fileSystem.appendFile).toHaveBeenCalledWith('log.jsonl', '{"event":"test"}\n');
  });

  it('should calculate correct byte count for multi-byte characters', async () => {
    const fileSystem = mock<RpcFileSystem>();
    fileSystem.appendFile.mockResolvedValue(undefined);

    const content = '日本語テスト';
    const result = await handleAppendFile({ targetFile: 'test.txt', content }, fileSystem);

    expect(result).toMatchObject({ success: true });
    if (result.success) {
      expect(result.bytesWritten).toBe(new TextEncoder().encode(content).byteLength);
    }
  });

  it('should return FILE_NOT_FOUND error when path does not exist', async () => {
    const fileSystem = mock<RpcFileSystem>();
    const error = new Error('File not found');
    (error as NodeJS.ErrnoException).code = 'ENOENT';
    fileSystem.appendFile.mockRejectedValue(error);

    const result = await handleAppendFile({ targetFile: 'missing/file.txt', content: 'data' }, fileSystem);

    expect(result).toMatchObject({
      success: false,
      errorCode: rpcClientErrorCode.fileNotFound,
    });
  });

  it('should return IO_ERROR for generic filesystem errors', async () => {
    const fileSystem = mock<RpcFileSystem>();
    fileSystem.appendFile.mockRejectedValue(new Error('Disk full'));

    const result = await handleAppendFile({ targetFile: 'test.txt', content: 'data' }, fileSystem);

    expect(result).toMatchObject({
      success: false,
      errorCode: rpcClientErrorCode.ioError,
      message: 'Disk full',
    });
  });
});
