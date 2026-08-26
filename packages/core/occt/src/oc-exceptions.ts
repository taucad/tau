/**
 * OpenCASCADE Exception Handling Utilities
 *
 * Provides exception decoding and human-readable message formatting for
 * OpenCASCADE errors thrown as native WASM exceptions (-fwasm-exceptions).
 *
 * With native WASM exceptions, C++ exceptions propagate as WebAssembly.Exception
 * objects with proper stack traces — no proxy wrapping needed.
 *
 * Shared between the replicad and opencascade kernels via a structural
 * {@link OcExceptionInstance} type so neither kernel has to import the other's
 * WASM bindings.
 */

import type { ErrorLocation, KernelIssue, KernelStackFrame } from '@taucad/runtime/types';
import { OcKernelError, formatOcExceptionMessage } from '#oc-kernel-error.js';
import type { WebAssemblyException } from '@taucad/runtime/kernel';
import { isWebAssemblyException } from '@taucad/runtime/kernel';

// =============================================================================
// Structural OC instance type
// =============================================================================

/**
 * The OCJS exception-introspection helper exported by every OCCT WASM build
 * compiled with exception handling.
 * @public
 */
export type OcjsExceptionApi = {
  // eslint-disable-next-line @typescript-eslint/naming-convention -- C++ class method preserved verbatim
  getStandard_FailureData(pointer: number): {
    what(): string;
    // eslint-disable-next-line @typescript-eslint/naming-convention -- C++ method with PascalCase convention
    GetStackString(): string;
    // eslint-disable-next-line @typescript-eslint/naming-convention -- C++ method with PascalCase convention
    ExceptionType(): unknown;
    delete(): void;
  };
};

/**
 * Minimal structural shape required by the OC exception decoder. Any OpenCASCADE
 * WASM instance that exposes `OCJS.getStandard_FailureData` (and optionally the
 * Emscripten `getExceptionMessage` runtime helper) satisfies this contract.
 * @public
 */
export type OcExceptionInstance = {
  OCJS: OcjsExceptionApi;
  getExceptionMessage?: unknown;
};

// =============================================================================
// Reusable WASM Type Guards
// =============================================================================

/** Emscripten wrapper object with WASM memory management via `delete()`. @public */
export type EmscriptenObject = Record<string, unknown> & { delete(): void };

/**
 * Emscripten 5.x CppException — Error subclass with an `excPtr` property
 * pointing to the C++ exception in WASM memory.
 * @public
 */
export type CppException = Error & { excPtr: number };

/**
 * Extracted WASM exception info: the numeric pointer and, when available,
 * the original Error that preserves the JS call-site stack trace.
 * @public
 */
export type WasmExceptionInfo = {
  pointer: number;
  sourceError: Error | undefined;
};

/**
 * Checks whether a value is an Emscripten wrapper object with a `delete()` method for WASM memory cleanup.
 *
 * @param value - The value to check
 * @returns `true` if the value is an Emscripten-allocated C++ object
 * @public
 */
export function isEmscriptenObject(value: unknown): value is EmscriptenObject {
  return (
    value !== null &&
    typeof value === 'object' &&
    'delete' in value &&
    typeof (value as Record<string, unknown>)['delete'] === 'function'
  );
}

/**
 * Checks whether an error is an Emscripten 5.x CppException with a WASM pointer.
 *
 * @param error - The error to check
 * @returns `true` if the error is a CppException with an `excPtr` property
 * @public
 */
export function isCppException(error: unknown): error is CppException {
  return (
    error instanceof Error && 'excPtr' in error && typeof (error as Record<string, unknown>)['excPtr'] === 'number'
  );
}

/**
 * Executes a callback with a WASM object and guarantees `delete()` is called afterward.
 *
 * @template T - The WASM object type
 * @template R - The callback return type
 * @param object - The WASM-allocated object to use and then free
 * @param callback - The function to execute with the object
 * @returns The callback's return value
 * @public
 */
export function withWasmObject<T extends { delete(): void }, R>(object: T, callback: (object: T) => R): R {
  try {
    return callback(object);
  } finally {
    object.delete();
  }
}

/**
 * Extracts a WASM exception pointer from any Emscripten throw form (bare number or CppException).
 *
 * @param error - The thrown value to inspect
 * @returns The exception pointer and source Error, or `undefined` if not a WASM exception
 * @public
 */
export function extractWasmException(error: unknown): WasmExceptionInfo | undefined {
  if (typeof error === 'number') {
    return { pointer: error, sourceError: undefined };
  }

  if (isCppException(error)) {
    return { pointer: error.excPtr, sourceError: error };
  }

  return undefined;
}

/**
 * Decode a WebAssembly.Exception using the Emscripten helper `getExceptionMessage`.
 * Returns the formatted message, or undefined if decoding fails.
 *
 * @param error - the WebAssembly exception to decode
 * @param ocInstance - the OC instance providing the `getExceptionMessage` helper
 * @returns the decoded message, or undefined if decoding fails
 */
function decodeWebAssemblyException(
  error: WebAssemblyException,
  ocInstance: OcExceptionInstance,
): { message: string } | undefined {
  const { getExceptionMessage } = ocInstance;
  if (typeof getExceptionMessage !== 'function') {
    return undefined;
  }

  try {
    const decoder = getExceptionMessage as (ex: WebAssemblyException) => [string, string];
    const [typeName, rawMessage] = decoder(error);
    return { message: formatOcExceptionMessage(typeName, rawMessage) };
  } catch {
    return undefined;
  }
}

// =============================================================================
// OC Exception Decoding
// =============================================================================

/**
 * Extract the exception type name from an OpenCASCADE Standard_Failure object.
 *
 * @param errorData - the Standard_Failure data from OpenCASCADE
 * @returns the exception type name, or empty string on failure
 */
function extractExceptionTypeName(errorData: ReturnType<OcjsExceptionApi['getStandard_FailureData']>): string {
  try {
    // oxlint-disable-next-line new-cap, @typescript-eslint/consistent-type-assertions -- OpenCASCADE C++ bindings use PascalCase methods; structural type uses unknown for cross-kernel compatibility
    const dynType = errorData.ExceptionType() as {
      // eslint-disable-next-line @typescript-eslint/naming-convention -- C++ method with PascalCase convention
      Name(): string;
      delete(): void;
    };

    // oxlint-disable-next-line new-cap -- OpenCASCADE C++ bindings use PascalCase methods
    return withWasmObject(dynType, (dt) => dt.Name());
  } catch {
    return '';
  }
}

/**
 * Extract message, type name, and C++ stack from an OpenCASCADE Standard_Failure.
 * Frees WASM memory for the error data when done.
 *
 * @param ocInstance - the OpenCASCADE WASM instance
 * @param errorPointer - the pointer to the Standard_Failure in WASM memory
 * @returns the extracted message, type name, and C++ stack trace
 */
function extractStandardFailureData(
  ocInstance: OcExceptionInstance,
  errorPointer: number,
): { message: string; typeName: string; cppStack: string } {
  return withWasmObject(ocInstance.OCJS.getStandard_FailureData(errorPointer), (errorData) => {
    const errorMessage = errorData.what();
    // oxlint-disable-next-line new-cap -- OpenCASCADE C++ bindings use PascalCase methods
    const cppStack = errorData.GetStackString();
    const typeName = extractExceptionTypeName(errorData);
    return { message: errorMessage, typeName, cppStack };
  });
}

/**
 * Decodes an OpenCASCADE exception pointer into a human-readable message.
 *
 * @param pointer - The WASM memory pointer to the Standard_Failure object
 * @param ocInstance - The OpenCascade instance for accessing exception data
 * @returns The decoded message and optional C++ stack trace
 * @public
 */
export function decodeOcException(
  pointer: number,
  ocInstance: OcExceptionInstance,
): { message: string; cppStack?: string } {
  let message = `KernelError: Unknown kernel error (code ${pointer})`;
  let cppStack: string | undefined;

  try {
    const failureData = extractStandardFailureData(ocInstance, pointer);
    message = formatOcExceptionMessage(failureData.typeName, failureData.message);
    cppStack = failureData.cppStack || undefined;
  } catch {
    // Fall through to generic message
  }

  return { message, cppStack };
}

// =============================================================================
// Runtime Error Formatting
// =============================================================================

/**
 * Formats a runtime error into a KernelIssue with OpenCASCADE exception decoding and stack enrichment.
 *
 * @returns A structured KernelIssue with decoded message, location, and stack frames
 * @public
 */
export function formatRuntimeErrorWithOc({
  error,
  ocInstance,
  parseStackTrace,
  applySourceMaps,
  deriveLocation,
  sourceMap,
}: {
  /** The error thrown during execution */
  error: unknown;
  /** The OC instance (may or may not have exception support depending on WASM build) */
  ocInstance: OcExceptionInstance;
  /** Function to parse error stack traces into structured frames */
  parseStackTrace: (error: unknown) => KernelStackFrame[];
  /** Function to apply source map resolution to stack frames */
  applySourceMaps: (frames: KernelStackFrame[]) => KernelStackFrame[];
  /** Function to derive error location from stack frames */
  deriveLocation: (frames: KernelStackFrame[], sourceMap?: string) => ErrorLocation | undefined;
  /** Optional source map JSON string */
  sourceMap?: string;
}): KernelIssue {
  if (error instanceof OcKernelError) {
    const stackFrames = applySourceMaps(parseStackTrace(error));
    const location = deriveLocation(stackFrames, sourceMap);
    return {
      message: error.message,
      code: 'KERNEL_BINDING_FAILED',
      location,
      type: 'kernel',
      severity: 'error',
      stackFrames,
    };
  }

  if (isWebAssemblyException(error)) {
    const decoded = decodeWebAssemblyException(error, ocInstance);
    const message = decoded?.message ?? 'KernelError: The geometry kernel threw an undecodable C++ exception';

    // WebAssembly.Exception is not an Error and has no .stack — parseStackTrace
    // returns []. This is intentional: the OC proxy should have already
    // converted it to an OcKernelError with Error.captureStackTrace. If we
    // reach here, the exception bypassed the proxy; returning empty frames is
    // more honest than manufacturing misleading framework frames.
    const stackFrames = applySourceMaps(parseStackTrace(error));
    const location = deriveLocation(stackFrames, sourceMap);
    return {
      message,
      code: 'KERNEL_BINDING_FAILED',
      location,
      type: 'kernel',
      severity: 'error',
      stackFrames,
    };
  }

  const wasmException = extractWasmException(error);
  if (wasmException) {
    const { message, cppStack } = decodeOcException(wasmException.pointer, ocInstance);
    const errorForStack = wasmException.sourceError ?? new Error(message);
    const stackFrames = applySourceMaps(parseStackTrace(errorForStack));
    const location = deriveLocation(stackFrames, sourceMap);
    return {
      message,
      code: 'KERNEL_BINDING_FAILED',
      location,
      type: 'kernel',
      severity: 'error',
      stack: cppStack,
      stackFrames,
    };
  }

  const stackFrames = applySourceMaps(parseStackTrace(error));
  const location = deriveLocation(stackFrames, sourceMap);
  return {
    message: error instanceof Error ? error.message : String(error),
    code: 'RUNTIME',
    location,
    type: 'runtime',
    severity: 'error',
    stackFrames,
  };
}
