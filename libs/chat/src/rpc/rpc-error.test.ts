import { describe, it, expect } from 'vitest';
import { rpcClientErrorCode } from '#schemas/rpc.schema.js';
import { getErrorCode, getErrorMessage, toRpcError } from '#rpc/rpc-error.js';

function makeErrnoError(message: string, code: string): Error {
  const error = new Error(message);
  (error as NodeJS.ErrnoException).code = code;
  return error;
}

describe('getErrorCode', () => {
  describe('errno code lookup (primary signal)', () => {
    it('should map ENOENT to FILE_NOT_FOUND', () => {
      const error = makeErrnoError('No such file or directory', 'ENOENT');
      expect(getErrorCode(error)).toBe(rpcClientErrorCode.fileNotFound);
    });

    it('should map EACCES to PERMISSION_DENIED', () => {
      const error = makeErrnoError('Permission denied', 'EACCES');
      expect(getErrorCode(error)).toBe(rpcClientErrorCode.permissionDenied);
    });

    it('should map EPERM to PERMISSION_DENIED', () => {
      const error = makeErrnoError('Operation not permitted', 'EPERM');
      expect(getErrorCode(error)).toBe(rpcClientErrorCode.permissionDenied);
    });

    it('should fall through to message matching for unknown errno codes', () => {
      const error = makeErrnoError('Connection refused', 'ECONNREFUSED');
      expect(getErrorCode(error)).toBe(rpcClientErrorCode.ioError);
    });
  });

  describe('ZenFS-style errors (kerium Exception)', () => {
    it('should classify via code property even when message is "No such file or directory"', () => {
      const error = makeErrnoError('No such file or directory', 'ENOENT');
      expect(getErrorCode(error)).toBe(rpcClientErrorCode.fileNotFound);
    });
  });

  describe('Node.js-style errors (ErrnoException)', () => {
    it('should classify ENOENT ErrnoException as FILE_NOT_FOUND', () => {
      const error = makeErrnoError("ENOENT: no such file or directory, open '/missing.json'", 'ENOENT');
      expect(getErrorCode(error)).toBe(rpcClientErrorCode.fileNotFound);
    });

    it('should classify EACCES ErrnoException as PERMISSION_DENIED', () => {
      const error = makeErrnoError("EACCES: permission denied, open '/etc/shadow'", 'EACCES');
      expect(getErrorCode(error)).toBe(rpcClientErrorCode.permissionDenied);
    });
  });

  describe('fromMemoryFS-style errors (with code property)', () => {
    it('should classify ENOENT memoryFS error as FILE_NOT_FOUND', () => {
      const error = makeErrnoError('ENOENT: no such file: /missing.json', 'ENOENT');
      expect(getErrorCode(error)).toBe(rpcClientErrorCode.fileNotFound);
    });
  });

  describe('message fallback (errors without code property)', () => {
    it('should classify "not found" message as FILE_NOT_FOUND', () => {
      expect(getErrorCode(new Error('File not found'))).toBe(rpcClientErrorCode.fileNotFound);
    });

    it('should classify "enoent" in message as FILE_NOT_FOUND', () => {
      expect(getErrorCode(new Error('ENOENT: no such file'))).toBe(rpcClientErrorCode.fileNotFound);
    });

    it('should classify "no such file" message as FILE_NOT_FOUND', () => {
      expect(getErrorCode(new Error('No such file or directory'))).toBe(rpcClientErrorCode.fileNotFound);
    });

    it('should classify "permission" message as PERMISSION_DENIED', () => {
      expect(getErrorCode(new Error('Permission denied'))).toBe(rpcClientErrorCode.permissionDenied);
    });

    it('should classify "parse" message as PARSE_ERROR', () => {
      expect(getErrorCode(new Error('Failed to parse input'))).toBe(rpcClientErrorCode.parseError);
    });

    it('should classify "json" message as PARSE_ERROR', () => {
      expect(getErrorCode(new Error('Invalid JSON'))).toBe(rpcClientErrorCode.parseError);
    });

    it('should fall back to IO_ERROR for unrecognized Error messages', () => {
      expect(getErrorCode(new Error('Something went wrong'))).toBe(rpcClientErrorCode.ioError);
    });
  });

  describe('non-Error values', () => {
    it('should return UNKNOWN for null', () => {
      expect(getErrorCode(null)).toBe(rpcClientErrorCode.unknown);
    });

    it('should return UNKNOWN for undefined', () => {
      expect(getErrorCode(undefined)).toBe(rpcClientErrorCode.unknown);
    });

    it('should return UNKNOWN for strings', () => {
      expect(getErrorCode('some error')).toBe(rpcClientErrorCode.unknown);
    });

    it('should return UNKNOWN for numbers', () => {
      expect(getErrorCode(42)).toBe(rpcClientErrorCode.unknown);
    });
  });

  describe('errno code takes precedence over message', () => {
    it('should use ENOENT code even if message contains "permission"', () => {
      const error = makeErrnoError('permission denied', 'ENOENT');
      expect(getErrorCode(error)).toBe(rpcClientErrorCode.fileNotFound);
    });

    it('should use EACCES code even if message contains "not found"', () => {
      const error = makeErrnoError('file not found', 'EACCES');
      expect(getErrorCode(error)).toBe(rpcClientErrorCode.permissionDenied);
    });
  });
});

describe('getErrorMessage', () => {
  it('should return the error message for Error instances', () => {
    expect(getErrorMessage(new Error('test message'))).toBe('test message');
  });

  it('should return "Unknown error" for non-Error values', () => {
    expect(getErrorMessage(null)).toBe('Unknown error');
    expect(getErrorMessage('string error')).toBe('Unknown error');
  });
});

describe('toRpcError', () => {
  it('should produce a structured RpcHandlerError with correct shape', () => {
    const error = makeErrnoError('No such file or directory', 'ENOENT');
    const result = toRpcError(error);

    expect(result).toStrictEqual({
      success: false,
      errorCode: rpcClientErrorCode.fileNotFound,
      message: 'No such file or directory',
    });
  });

  it('should classify and wrap a permission error', () => {
    const error = makeErrnoError('Permission denied', 'EACCES');
    const result = toRpcError(error);

    expect(result).toStrictEqual({
      success: false,
      errorCode: rpcClientErrorCode.permissionDenied,
      message: 'Permission denied',
    });
  });

  it('should handle non-Error values', () => {
    const result = toRpcError('raw string error');

    expect(result).toStrictEqual({
      success: false,
      errorCode: rpcClientErrorCode.unknown,
      message: 'Unknown error',
    });
  });
});
