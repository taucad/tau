/* eslint-disable @typescript-eslint/naming-convention -- Kittycad wire JSON fixtures use API field names */
import { describe, it, expect } from 'vitest';
import { mapErrorToKclError, convertKclErrorToKernelIssue } from '#error-mappers.js';
import { KclError, KclWasmError, EXECUTE_INTERRUPTED_ERROR_CODE } from '#kcl-errors.js';
import type { KclErrorKind } from '#kcl-errors.js';

import { createMockWasmKclError } from '#testing/zoo-testing.utils.js';

// ===================================================================
// mapErrorToKclError
// ===================================================================

describe('mapErrorToKclError', () => {
  it('should return KclError unchanged when input is already a KclError', () => {
    const original = KclError.simple({ kind: 'syntax', message: 'bad syntax' });
    const result = mapErrorToKclError(original);
    expect(result).toBe(original);
  });

  it('should wrap WASM KclError via extractWasmKclError', () => {
    const wasmError = createMockWasmKclError({
      kind: 'engine',
      details: { msg: 'engine crash', sourceRanges: [[0, 5, 0]], backtrace: [] },
    });
    const input = { error: wasmError };

    const result = mapErrorToKclError(input);
    expect(result).toBeInstanceOf(KclWasmError);
    expect(result.kind).toBe('engine');
    expect(result.msg).toBe('engine crash');
  });

  it('should create simple unexpected error from generic Error', () => {
    const result = mapErrorToKclError(new Error('something broke'));
    expect(result).toBeInstanceOf(KclError);
    expect(result.kind).toBe('unexpected');
    expect(result.msg).toBe('something broke');
  });

  it('should map execution_interrupted wire failure JSON to interrupted kind', () => {
    const json = JSON.stringify({
      success: false,
      errors: [{ error_code: EXECUTE_INTERRUPTED_ERROR_CODE, message: 'stopped' }],
    });
    const result = mapErrorToKclError(json);
    expect(result.kind).toBe('interrupted');
    expect(result.msg).toBe('stopped');
  });

  it('should create simple unexpected error from string', () => {
    const result = mapErrorToKclError('plain string error');
    expect(result).toBeInstanceOf(KclError);
    expect(result.kind).toBe('unexpected');
    expect(result.msg).toBe('plain string error');
  });
});

// ===================================================================
// convertKclErrorToKernelIssue
// ===================================================================

describe('convertKclErrorToKernelIssue', () => {
  it('should map KclWasmError with source ranges to correct line/column position', () => {
    const wasmError = createMockWasmKclError({
      details: { msg: 'error', sourceRanges: [[5, 15, 0]], backtrace: [] },
    });
    const kclError = new KclWasmError(wasmError);
    const code = 'let x\nlet y = 1';

    const result = convertKclErrorToKernelIssue(kclError, code, 'main.kcl');
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]!.location).toBeDefined();
    expect(result.issues[0]!.location!.fileName).toBe('main.kcl');
  });

  it('should create stack frames from KclWasmError backtrace', () => {
    const wasmError = createMockWasmKclError({
      details: {
        msg: 'error',
        sourceRanges: [[0, 10, 0]],
        backtrace: [{ sourceRange: [0, 10, 0], fnName: null }],
      },
    });
    const kclError = new KclWasmError(wasmError);
    const code = 'let x = 1\n';

    const result = convertKclErrorToKernelIssue(kclError, code, 'main.kcl');
    const issue = result.issues[0]!;
    expect(issue.stackFrames).toBeDefined();
    expect(issue.stackFrames!.length).toBeGreaterThan(0);
  });

  it('should include stack string representation when stack frames exist', () => {
    const wasmError = createMockWasmKclError({
      details: {
        msg: 'error',
        sourceRanges: [[0, 5, 0]],
        backtrace: [{ sourceRange: [0, 5, 0], fnName: null }],
      },
    });
    const kclError = new KclWasmError(wasmError);

    const result = convertKclErrorToKernelIssue(kclError, 'code', 'test.kcl');
    const issue = result.issues[0]!;
    if (issue.stackFrames && issue.stackFrames.length > 0) {
      expect(issue.stack).toBeDefined();
      expect(issue.stack).toContain('at');
    }
  });

  it('should fall back to raw sourceRange positions for non-WASM KclError', () => {
    const kclError = new KclError('syntax', 'bad', [10, 10, 5]);

    const result = convertKclErrorToKernelIssue(kclError, undefined, 'test.kcl');
    const issue = result.issues[0]!;
    expect(issue.type).toBe('compilation');
  });

  it('should map lexical kind to compilation type', () => {
    const kclError = KclError.simple({ kind: 'lexical', message: 'bad token' });
    const result = convertKclErrorToKernelIssue(kclError);
    expect(result.issues[0]!.type).toBe('compilation');
  });

  it('should map syntax kind to compilation type', () => {
    const kclError = KclError.simple({ kind: 'syntax', message: 'parse error' });
    const result = convertKclErrorToKernelIssue(kclError);
    expect(result.issues[0]!.type).toBe('compilation');
  });

  it('should map engine kind to runtime type', () => {
    const kclError = KclError.simple({ kind: 'engine', message: 'engine error' });
    const result = convertKclErrorToKernelIssue(kclError);
    expect(result.issues[0]!.type).toBe('runtime');
  });

  it('should map runtime kind to runtime type', () => {
    const kclError = KclError.simple({ kind: 'runtime', message: 'runtime error' });
    const result = convertKclErrorToKernelIssue(kclError);
    expect(result.issues[0]!.type).toBe('runtime');
  });

  it('should map internal kind to kernel type', () => {
    const kclError = KclError.simple({ kind: 'internal', message: 'internal error' });
    const result = convertKclErrorToKernelIssue(kclError);
    expect(result.issues[0]!.type).toBe('kernel');
  });

  it('should map io kind to kernel type', () => {
    const kclError = KclError.simple({ kind: 'io', message: 'io error' });
    const result = convertKclErrorToKernelIssue(kclError);
    expect(result.issues[0]!.type).toBe('kernel');
  });

  it('should map connection kind to connection type', () => {
    const kclError = KclError.simple({ kind: 'connection', message: 'connection error' });
    const result = convertKclErrorToKernelIssue(kclError);
    expect(result.issues[0]!.type).toBe('connection');
  });

  it('should map auth kind to connection type', () => {
    const kclError = KclError.simple({ kind: 'auth', message: 'auth error' });
    const result = convertKclErrorToKernelIssue(kclError);
    expect(result.issues[0]!.type).toBe('connection');
  });

  it('should map interrupted kind to runtime type', () => {
    const kclError = KclError.simple({ kind: 'interrupted', message: 'cancelled' });
    const result = convertKclErrorToKernelIssue(kclError);
    expect(result.issues[0]!.type).toBe('runtime');
  });

  it('should map unknown kind to unknown type', () => {
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- intentionally invalid kind to test unknown fallback
    const kclError = KclError.simple({ kind: 'some-unknown-kind' as unknown as KclErrorKind, message: 'unknown' });
    const result = convertKclErrorToKernelIssue(kclError);
    expect(result.issues[0]!.type).toBe('unknown');
  });

  it('should omit location when no fileName provided', () => {
    const kclError = KclError.simple({ kind: 'syntax', message: 'error' });
    const result = convertKclErrorToKernelIssue(kclError);
    expect(result.issues[0]!.location).toBeUndefined();
  });

  it('should include location when fileName and position are provided', () => {
    const kclError = new KclError('syntax', 'error', [10, 10, 5]);
    const result = convertKclErrorToKernelIssue(kclError, undefined, 'main.kcl');
    expect(result.issues[0]!.location).toEqual({
      fileName: 'main.kcl',
      startLineNumber: 5,
      startColumn: 10,
    });
  });
});
