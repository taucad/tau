import { describe, it, expect, vi } from 'vitest';
import {
  isEmscriptenObject,
  isCppException,
  withWasmObject,
  extractWasmException,
  decodeOcException,
  formatRuntimeErrorWithOc,
} from '#kernels/occt/oc-exceptions.js';
import type { OcExceptionInstance } from '#kernels/occt/oc-exceptions.js';
import { OcKernelError } from '#kernels/occt/oc-kernel-error.js';
import type { WebAssemblyException } from '#kernels/occt/wasm-exception.js';
import { getWebAssemblyExceptionConstructor } from '#kernels/occt/wasm-exception.js';
import type { KernelStackFrame } from '#types/runtime.types.js';

const emptyOcInstance = {} as unknown as OcExceptionInstance;

// ===================================================================
// Helpers
// ===================================================================

function createMockOcFormatArgs() {
  const parseStackTrace = vi.fn<(error: unknown) => KernelStackFrame[]>().mockReturnValue([]);
  const applySourceMaps = vi.fn<(frames: KernelStackFrame[]) => KernelStackFrame[]>().mockImplementation((f) => f);
  const deriveLocation = vi.fn().mockReturnValue(undefined);
  return { parseStackTrace, applySourceMaps, deriveLocation };
}

// ===================================================================
// Tests
// ===================================================================

describe('isEmscriptenObject', () => {
  it('should return true for object with delete method', () => {
    const object = {
      delete() {
        /* Noop */
      },
      value: 42,
    };
    expect(isEmscriptenObject(object)).toBe(true);
  });

  it('should return false for null', () => {
    expect(isEmscriptenObject(null)).toBe(false);
  });

  it('should return false for object without delete', () => {
    expect(isEmscriptenObject({ value: 42 })).toBe(false);
  });

  it('should return false for object where delete is not a function', () => {
    expect(isEmscriptenObject({ delete: 'not-a-function' })).toBe(false);
  });
});

describe('isCppException', () => {
  it('should return true for Error with numeric excPtr', () => {
    const error = new Error('cpp error');
    Object.assign(error, { excPtr: 12_345 });
    expect(isCppException(error)).toBe(true);
  });

  it('should return false for plain Error', () => {
    expect(isCppException(new Error('plain'))).toBe(false);
  });

  it('should return false for non-Error with excPtr', () => {
    expect(isCppException({ excPtr: 123 })).toBe(false);
  });
});

describe('withWasmObject', () => {
  it('should call delete after callback returns', () => {
    const deleteFunction = vi.fn();
    const object = { delete: deleteFunction, value: 42 };

    const result = withWasmObject(object, (o) => o.value);

    expect(result).toBe(42);
    expect(deleteFunction).toHaveBeenCalledOnce();
  });

  it('should call delete after callback throws', () => {
    const deleteFunction = vi.fn();
    const object = { delete: deleteFunction };

    expect(() => {
      withWasmObject(object, () => {
        throw new Error('boom');
      });
    }).toThrow('boom');
    expect(deleteFunction).toHaveBeenCalledOnce();
  });
});

describe('extractWasmException', () => {
  it('should extract pointer from bare number', () => {
    const result = extractWasmException(42);
    expect(result).toEqual({ pointer: 42, sourceError: undefined });
  });

  it('should extract pointer and sourceError from CppException', () => {
    const error = new Error('cpp');
    Object.assign(error, { excPtr: 999 });
    const result = extractWasmException(error);

    expect(result).toBeDefined();
    expect(result!.pointer).toBe(999);
    expect(result!.sourceError).toBe(error);
  });

  it('should return undefined for non-WASM error', () => {
    expect(extractWasmException(new Error('normal'))).toBeUndefined();
    expect(extractWasmException('string')).toBeUndefined();
    expect(extractWasmException(undefined)).toBeUndefined();
  });
});

/* eslint-disable @typescript-eslint/naming-convention -- Mock objects match OpenCASCADE C++ API naming conventions */
describe('decodeOcException', () => {
  it('should return decoded message when OC instance provides exception data', () => {
    const mockOcInstance = {
      OCJS: {
        getStandard_FailureData: vi.fn().mockReturnValue({
          // `what()` is the supported API; deprecated `GetMessageString` is omitted from the mock.
          what: () => 'shape is null',
          // oxlint-disable-next-line new-cap -- Mock of OpenCASCADE C++ bindings
          GetStackString: () => 'at BRepAlgoAPI_Fuse',
          // oxlint-disable-next-line new-cap -- Mock of OpenCASCADE C++ bindings
          ExceptionType: () => ({
            // oxlint-disable-next-line new-cap -- Mock of OpenCASCADE C++ bindings
            Name: () => 'Standard_NullObject',
            delete: vi.fn(),
          }),
          delete: vi.fn(),
        }),
      },
    };

    const result = decodeOcException(42, mockOcInstance as unknown as OcExceptionInstance);
    expect(result.message).toContain('KernelError:');
    expect(result.message).toContain('Standard_NullObject');
    expect(result.cppStack).toBe('at BRepAlgoAPI_Fuse');
  });

  it('should return generic message when OC instance throws during extraction', () => {
    const mockOcInstance = {
      OCJS: {
        getStandard_FailureData: vi.fn().mockImplementation(() => {
          throw new Error('WASM error');
        }),
      },
    };

    const result = decodeOcException(42, mockOcInstance as unknown as OcExceptionInstance);
    expect(result.message).toContain('Unknown kernel error (code 42)');
    expect(result.cppStack).toBeUndefined();
  });
});
/* eslint-enable @typescript-eslint/naming-convention -- re-enable after mock block */

/* eslint-disable @typescript-eslint/naming-convention -- Mock objects match OpenCASCADE C++ API naming conventions */
describe('formatRuntimeErrorWithOc', () => {
  it('should format OcKernelError with stack frames and location', () => {
    const error = new OcKernelError('Standard_NullObject', 'shape is null');
    const helpers = createMockOcFormatArgs();
    helpers.deriveLocation.mockReturnValue({ fileName: 'test.ts', startLineNumber: 10, startColumn: 5 });

    const result = formatRuntimeErrorWithOc({
      error,
      ocInstance: emptyOcInstance,
      ...helpers,
    });

    expect(result.type).toBe('kernel');
    expect(result.severity).toBe('error');
    expect(result.message).toContain('KernelError:');
    expect(result.location).toEqual({ fileName: 'test.ts', startLineNumber: 10, startColumn: 5 });
    expect(helpers.parseStackTrace).toHaveBeenCalledWith(error);
  });

  it('should decode WASM exception from bare number pointer', () => {
    const helpers = createMockOcFormatArgs();
    const mockOcInstance = {
      OCJS: {
        getStandard_FailureData: vi.fn().mockImplementation(() => {
          throw new Error('no data');
        }),
      },
    };

    const result = formatRuntimeErrorWithOc({
      error: 42,
      ocInstance: mockOcInstance as unknown as OcExceptionInstance,
      ...helpers,
    });

    expect(result.type).toBe('kernel');
    expect(result.message).toContain('Unknown kernel error (code 42)');
  });

  it('should decode CppException with sourceError for stack trace', () => {
    const sourceError = new Error('cpp crash');
    Object.assign(sourceError, { excPtr: 100 });

    const helpers = createMockOcFormatArgs();
    const mockOcInstance = {
      OCJS: {
        getStandard_FailureData: vi.fn().mockImplementation(() => {
          throw new Error('no data');
        }),
      },
    };

    const result = formatRuntimeErrorWithOc({
      error: sourceError,
      ocInstance: mockOcInstance as unknown as OcExceptionInstance,
      ...helpers,
    });

    expect(result.type).toBe('kernel');
    expect(helpers.parseStackTrace).toHaveBeenCalledWith(sourceError);
  });

  it('should format generic Error as runtime type', () => {
    const helpers = createMockOcFormatArgs();

    const result = formatRuntimeErrorWithOc({
      error: new Error('runtime failure'),
      ocInstance: emptyOcInstance,
      ...helpers,
    });

    expect(result.type).toBe('runtime');
    expect(result.message).toBe('runtime failure');
  });

  it('should format string error as runtime type', () => {
    const helpers = createMockOcFormatArgs();

    const result = formatRuntimeErrorWithOc({
      error: 'string error',
      ocInstance: emptyOcInstance,
      ...helpers,
    });

    expect(result.type).toBe('runtime');
    expect(result.message).toBe('string error');
  });

  it('should produce a descriptive kernel error for undecodable WebAssembly.Exception', () => {
    const exceptionConstructor = getWebAssemblyExceptionConstructor();
    if (!exceptionConstructor) {
      throw new Error('Expected WebAssembly.Exception constructor for this test');
    }
    const exceptionPrototype = exceptionConstructor.prototype as Record<string, unknown>;
    const fakeException = Object.create(exceptionPrototype) as WebAssemblyException;
    const helpers = createMockOcFormatArgs();

    const result = formatRuntimeErrorWithOc({
      error: fakeException,
      ocInstance: emptyOcInstance,
      ...helpers,
    });

    expect(result.type).toBe('kernel');
    expect(result.severity).toBe('error');
    expect(result.message).toContain('KernelError:');
    expect(result.message).not.toBe('[object WebAssembly.Exception]');
  });
});
/* eslint-enable @typescript-eslint/naming-convention -- re-enable after mock block */
