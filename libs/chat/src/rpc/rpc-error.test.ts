import { describe, it, expect } from 'vitest';
import { VirtualPathError } from '@taucad/utils/path';
import { rpcClientErrorCode } from '#schemas/rpc.schema.js';
import { getErrorCode, getErrorMessage, toRpcError } from '#rpc/rpc-error.js';

function makeErrnoError(message: string, code: string): Error {
  const error = new Error(message);
  (error as NodeJS.ErrnoException).code = code;
  return error;
}

describe('getErrorCode', () => {
  it.each(['INVALID_PATH', 'PATH_OUTSIDE_ROOT'] as const)(
    'should map VirtualPathError %s to VALIDATION_ERROR',
    (code) => {
      expect(getErrorCode(new VirtualPathError(code, '../secret'))).toBe(rpcClientErrorCode.validationError);
    },
  );

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

  describe('errors without a code property', () => {
    /* Classification comes from `code` alone. These messages read like a
     * classification and are deliberately not treated as one: the substring
     * heuristics they used to drive reported `PARSE_ERROR` for any failure
     * whose path ended in `.json`. */
    it.each([
      'File not found',
      'ENOENT: no such file',
      'No such file or directory',
      'Permission denied',
      'Failed to parse input',
      'Invalid JSON',
      'Something went wrong',
    ])('should classify %s as IO_ERROR', (message) => {
      expect(getErrorCode(new Error(message))).toBe(rpcClientErrorCode.ioError);
    });

    it('should not read a classification out of a path in the message', () => {
      /* The defect this pins: a write that failed for any reason on
       * `tau.json` was reported to the client as a parse failure. */
      expect(getErrorCode(new Error('Write failed: /project/tau.json'))).toBe(rpcClientErrorCode.ioError);
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
  it('should preserve VirtualPathError details as a validation failure', () => {
    expect(toRpcError(new VirtualPathError('PATH_OUTSIDE_ROOT', '../secret'))).toStrictEqual({
      success: false,
      errorCode: rpcClientErrorCode.validationError,
      message: 'Virtual path escapes the filesystem root.',
    });
  });

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
