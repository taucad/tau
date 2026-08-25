/* eslint-disable @typescript-eslint/naming-convention -- WASM/wire payloads use upstream field names */
import { describe, it, expect } from 'vitest';
import {
  KclError,
  KclAuthError,
  KclExportError,
  KclConnectionError,
  KclWasmError,
  isKclError,
  isWasmKclError,
  isWasmExecutionResultWithError,
  extractWasmKclError,
  extractExecutionError,
  extractWasmKclErrorDetails,
} from '#kcl-errors.js';
import type { WasmKclErrorExtraction } from '#kcl-errors.js';

import type { KclError as WasmKclError } from '@taucad/kcl-wasm-lib/bindings/KclError';
import type { KclErrorWithOutputs } from '@taucad/kcl-wasm-lib/bindings/KclErrorWithOutputs';
import { createMockWasmKclError } from '#testing/zoo-testing.utils.js';

describe('KclError', () => {
  it('should set kind, msg, and sourceRange', () => {
    const error = new KclError('syntax', 'unexpected token', [5, 10, 0]);
    expect(error.kind).toBe('syntax');
    expect(error.msg).toBe('unexpected token');
    expect(error.sourceRange).toEqual([5, 10, 0]);
  });

  it('should format message as "kind: message"', () => {
    const error = new KclError('runtime', 'division by zero', [0, 5, 0]);
    expect(error.message).toBe('runtime: division by zero');
  });

  it('should extend Error', () => {
    const error = new KclError('lexical', 'bad char', [0, 0, 0]);
    expect(error).toBeInstanceOf(Error);
  });

  describe('simple()', () => {
    it('should create KclError with defaults', () => {
      const error = KclError.simple({ kind: 'internal', message: 'oops' });
      expect(error).toBeInstanceOf(KclError);
      expect(error.kind).toBe('internal');
      expect(error.msg).toBe('oops');
      expect(error.sourceRange).toEqual([0, 0, 0]);
    });
  });
});

describe('KclAuthError', () => {
  it('should set statusCode', () => {
    const error = new KclAuthError('unauthorized', 401);
    expect(error.statusCode).toBe(401);
    expect(error.kind).toBe('auth');
  });

  it('should default sourceRange to [0,0,0]', () => {
    const error = new KclAuthError('forbidden');
    expect(error.sourceRange).toEqual([0, 0, 0]);
  });

  it('should accept custom sourceRange', () => {
    const error = new KclAuthError('token expired', 401, [10, 20, 0]);
    expect(error.sourceRange).toEqual([10, 20, 0]);
  });
});

describe('KclExportError', () => {
  it('should set exportType', () => {
    const error = new KclExportError('export failed', 'step');
    expect(error.exportType).toBe('step');
    expect(error.kind).toBe('export');
  });

  it('should default sourceRange to [0,0,0]', () => {
    const error = new KclExportError('bad format');
    expect(error.sourceRange).toEqual([0, 0, 0]);
  });
});

describe('KclConnectionError', () => {
  describe('apiUnavailable()', () => {
    it('should create error without details', () => {
      const error = KclConnectionError.apiUnavailable();
      expect(error).toBeInstanceOf(KclConnectionError);
      expect(error.isApiUnavailable).toBe(true);
      expect(error.statusCode).toBe(503);
      expect(error.message).toContain('Zoo CAD API is currently unavailable');
    });

    it('should append details to message', () => {
      const error = KclConnectionError.apiUnavailable('timeout after 30s');
      expect(error.message).toContain('timeout after 30s');
    });
  });

  describe('webSocketFailed()', () => {
    it('should create error without details', () => {
      const error = KclConnectionError.webSocketFailed();
      expect(error).toBeInstanceOf(KclConnectionError);
      expect(error.isApiUnavailable).toBe(true);
      expect(error.message).toContain('Failed to establish a connection');
    });

    it('should append details to message', () => {
      const error = KclConnectionError.webSocketFailed('ECONNREFUSED');
      expect(error.message).toContain('ECONNREFUSED');
    });
  });

  it('should set isApiUnavailable to false by default', () => {
    const error = new KclConnectionError('generic connection failure');
    expect(error.isApiUnavailable).toBe(false);
  });
});

describe('KclWasmError', () => {
  it('should wrap WASM error preserving kind and message', () => {
    const wasmError = createMockWasmKclError();
    const error = new KclWasmError(wasmError);

    expect(error).toBeInstanceOf(KclError);
    expect(error.kind).toBe('semantic');
    expect(error.msg).toBe('test error');
    expect(error.wasmError).toBe(wasmError);
  });

  it('should use first source range when available', () => {
    const wasmError = createMockWasmKclError({
      details: {
        msg: 'error',
        sourceRanges: [
          [5, 15, 0],
          [20, 30, 0],
        ],
        backtrace: [],
      },
    });
    const error = new KclWasmError(wasmError);
    expect(error.sourceRange).toEqual([5, 15, 0]);
  });

  it('should default sourceRange to [0,0,0] when no sourceRanges', () => {
    const wasmError = createMockWasmKclError({
      details: { msg: 'error', sourceRanges: [], backtrace: [] },
    });
    const error = new KclWasmError(wasmError);
    expect(error.sourceRange).toEqual([0, 0, 0]);
  });

  describe('createStackFrames', () => {
    it('should return empty array when backtrace is empty', () => {
      const wasmError = createMockWasmKclError();
      const error = new KclWasmError(wasmError);
      expect(error.createStackFrames('const x = 1')).toEqual([]);
    });

    it('should map backtrace entries to stack frames with filenames', () => {
      // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- mock<T>() proxy not assignable to WasmKclError
      const wasmError = {
        kind: 'runtime',
        details: {
          msg: 'error',
          sourceRanges: [[0, 10, 0]],
          backtrace: [
            { fnName: 'myFunction', sourceRange: [0, 5, 0] },
            { fnName: null, sourceRange: [6, 10, 1] },
          ],
        },
        filenames: Object.fromEntries([
          [0, { type: 'local', value: 'main.kcl' }],
          [1, { type: 'import', value: 'utils.kcl' }],
        ]),
      } as unknown as WasmKclError;

      const error = new KclWasmError(wasmError);
      const frames = error.createStackFrames('const x = 1');

      expect(frames).toHaveLength(2);
      expect(frames[0]).toEqual(
        expect.objectContaining({
          functionName: 'myFunction',
          fileName: 'main.kcl',
          context: 'user',
        }),
      );
      expect(frames[1]).toEqual(
        expect.objectContaining({
          functionName: undefined,
          fileName: 'utils.kcl',
          context: 'user',
        }),
      );
    });
  });
});

describe('isKclError', () => {
  it('should return true for KclError instances', () => {
    expect(isKclError(new KclError('runtime', 'msg', [0, 0, 0]))).toBe(true);
  });

  it('should return false for plain Error', () => {
    expect(isKclError(new Error('plain'))).toBe(false);
  });

  it('should return false for non-error values', () => {
    expect(isKclError('string')).toBe(false);
    expect(isKclError(null)).toBe(false);
  });
});

describe('isWasmKclError', () => {
  it('should return true for objects with kind and details', () => {
    expect(isWasmKclError(createMockWasmKclError())).toBe(true);
  });

  it('should return false for plain objects', () => {
    expect(isWasmKclError({ kind: 'runtime' })).toBe(false);
  });

  it('should return false for null', () => {
    expect(isWasmKclError(null)).toBe(false);
  });
});

describe('isWasmExecutionResultWithError', () => {
  it('should return true for objects with nested WasmKclError', () => {
    const result = { error: createMockWasmKclError() };
    expect(isWasmExecutionResultWithError(result)).toBe(true);
  });

  it('should return false for objects without error field', () => {
    expect(isWasmExecutionResultWithError({ other: 'value' })).toBe(false);
  });

  it('should return false for null', () => {
    expect(isWasmExecutionResultWithError(null)).toBe(false);
  });
});

describe('extractWasmKclError', () => {
  it('should return direct WasmKclError', () => {
    const wasmError = createMockWasmKclError();
    expect(extractWasmKclError(wasmError)).toBe(wasmError);
  });

  it('should extract nested error from execution result', () => {
    const wasmError = createMockWasmKclError();
    const result = {
      error: wasmError,
      filenames: Object.fromEntries([[0, { type: 'local', value: 'main.kcl' }]]),
    };
    const extracted = extractWasmKclError(result);
    expect(extracted).toBe(wasmError);
    expect((extracted as { filenames?: unknown }).filenames).toBeDefined();
  });

  it('should return undefined for non-matching input', () => {
    expect(extractWasmKclError('not an error')).toBeUndefined();
    expect(extractWasmKclError(null)).toBeUndefined();
    expect(extractWasmKclError({ message: 'plain' })).toBeUndefined();
  });
});

describe('extractWasmKclErrorDetails', () => {
  it('should return partialOutcome for KclErrorWithOutputs-shaped payloads', () => {
    const wasmError = createMockWasmKclError();
    const payload = {
      error: wasmError,
      nonFatal: [{ sourceRange: [0, 0, 0], message: 'w', suggestion: null, severity: 'Warning', tag: 'None' }],
      variables: { a: { type: 'Number', value: 1, ty: { type: 'Unknown' } } },
      operations: [],
      artifactCommands: [],
      artifactGraph: { map: {}, itemCount: 0 },
      sceneGraph: null,
      filenames: { 0: { type: 'Local', value: 'main.kcl', original_import_path: null } },
      sourceFiles: {},
      defaultPlanes: null,
    } as unknown as KclErrorWithOutputs;

    const details: WasmKclErrorExtraction | undefined = extractWasmKclErrorDetails(payload);
    expect(details?.wasmError).toBe(wasmError);
    expect(details?.partialOutcome?.variables['a']).toEqual({ type: 'Number', value: 1, ty: { type: 'Unknown' } });
    expect(details?.partialOutcome?.warnings).toHaveLength(1);
  });
});

describe('extractExecutionError', () => {
  it('should extract message and position from WASM error', () => {
    const wasmError = createMockWasmKclError({
      details: {
        msg: 'undefined variable',
        sourceRanges: [[15, 25, 0]],
        backtrace: [],
      },
    });

    const result = extractExecutionError([wasmError], 'const x = 1\nconst y = z', 'Execution error');

    expect(result.message).toBe('Execution error: undefined variable');
    expect(result.startLineNumber).toBeGreaterThanOrEqual(1);
  });

  it('should fall back to string error messages', () => {
    const result = extractExecutionError(['plain string error'], 'code', 'Error');
    expect(result.message).toBe('Error: plain string error');
    expect(result.startColumn).toBe(0);
    expect(result.startLineNumber).toBe(0);
  });

  it('should handle objects with message property', () => {
    const result = extractExecutionError([{ message: 'obj error' }], 'code', 'Prefix');
    expect(result.message).toBe('Prefix: obj error');
  });

  it('should handle empty errors array gracefully', () => {
    const result = extractExecutionError([], 'code', 'Error');
    expect(result.message).toContain('Error');
  });
});
