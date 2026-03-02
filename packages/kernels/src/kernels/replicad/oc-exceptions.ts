/**
 * OpenCASCADE Exception Handling Utilities
 *
 * Provides exception decoding and human-readable message formatting for
 * OpenCASCADE errors thrown as native WASM exceptions (-fwasm-exceptions).
 *
 * With native WASM exceptions, C++ exceptions propagate as WebAssembly.Exception
 * objects with proper stack traces — no proxy wrapping needed.
 */

import type { OpenCascadeInstance } from 'replicad-opencascadejs/src/replicad_single.js';
import type { OpenCascadeInstance as OpenCascadeWithExceptions } from 'replicad-opencascadejs/src/replicad_with_exceptions.js';
import type { KernelIssue, KernelStackFrame, ErrorLocation } from '#types/kernel.types.js';
import { OcKernelError } from '#kernels/replicad/oc-tracing.js';

// =============================================================================
// Reusable WASM Type Guards
// =============================================================================

/** Emscripten wrapper object with WASM memory management via `delete()`. */
export type EmscriptenObject = Record<string, unknown> & { delete(): void };

/**
 * Emscripten 5.x CppException — Error subclass with an `excPtr` property
 * pointing to the C++ exception in WASM memory.
 */
export type CppException = Error & { excPtr: number };

/**
 * Extracted WASM exception info: the numeric pointer and, when available,
 * the original Error that preserves the JS call-site stack trace.
 */
export type WasmExceptionInfo = {
  pointer: number;
  sourceError: Error | undefined;
};

/**
 * Type guard for Emscripten wrapper objects (any WASM-allocated C++ object).
 * These always expose a `delete()` method for freeing WASM memory.
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
 * Type guard for Emscripten 5.x CppException.
 */
export function isCppException(error: unknown): error is CppException {
  return (
    error instanceof Error && 'excPtr' in error && typeof (error as Record<string, unknown>)['excPtr'] === 'number'
  );
}

/**
 * Execute a callback with a WASM object, ensuring `delete()` is called
 * to free WASM memory even if the callback throws.
 */
export function withWasmObject<T extends { delete(): void }, R>(object: T, callback: (object: T) => R): R {
  try {
    return callback(object);
  } finally {
    object.delete();
  }
}

/**
 * Emscripten module with native WASM exception helpers (exported via
 * -sEXPORT_EXCEPTION_HANDLING_HELPERS). These aren't in the generated
 * .d.ts but exist at runtime.
 */
type EmscriptenExceptionHelpers = {
  getExceptionMessage(ex: WebAssembly.Exception): [string, string];
};

/**
 * Extract a WASM exception pointer from any Emscripten throw form:
 * - bare number (legacy Emscripten — JS stack is unwound)
 * - CppException (Emscripten 5.x Error with excPtr)
 *
 * Returns the pointer and the source Error for stack traces,
 * or undefined if the value is not a WASM exception.
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
 * Check if an error is a native WebAssembly.Exception (from -fwasm-exceptions).
 */
function isWebAssemblyException(error: unknown): error is WebAssembly.Exception {
  return (
    typeof WebAssembly !== 'undefined' &&
    typeof WebAssembly.Exception === 'function' &&
    error instanceof WebAssembly.Exception
  );
}

/**
 * Decode a WebAssembly.Exception using the Emscripten helper `getExceptionMessage`.
 * Returns the formatted message, or undefined if decoding fails.
 */
function decodeWebAssemblyException(
  error: WebAssembly.Exception,
  ocInstance: Partial<EmscriptenExceptionHelpers>,
): { message: string } | undefined {
  if (typeof ocInstance.getExceptionMessage !== 'function') {
    return undefined;
  }

  try {
    const [typeName, rawMessage] = ocInstance.getExceptionMessage(error);
    return { message: formatOcExceptionMessage(typeName, rawMessage) };
  } catch {
    return undefined;
  }
}

// =============================================================================
// OpenCASCADE Exception -> Human-Readable Message Mapping
// =============================================================================

const ocExceptionDescriptions: ReadonlyMap<string, string> = new Map([
  ['BRepSweep_Translation', 'Sweep/extrusion failed — the sweep distance may be zero or the profile is invalid'],
  ['BRepSweep', 'Sweep operation failed — check the profile and sweep parameters'],
  ['BOPAlgo_AlertBOPNotAllowed', 'Boolean operation is not allowed for the given shapes'],
  ['BOPAlgo', 'Boolean operation failed — shapes may be invalid or non-intersecting'],
  ['BRepBuilderAPI', 'Shape construction failed — check dimensions, points, or parameters'],
  ['BRepFilletAPI', 'Fillet/chamfer operation failed — radius may be too large for the edge'],
  ['ChFiDS', 'Fillet/chamfer data error — the edge geometry may be incompatible'],
  ['Standard_ConstructionError', 'Construction failed — input geometry is degenerate or invalid'],
  ['Standard_NullObject', 'Operation received an empty or null shape'],
  ['Standard_NullValue', 'A required value is zero or null'],
  ['Standard_DimensionMismatch', 'Dimension mismatch between inputs'],
  ['Standard_DimensionError', 'Dimension error in the operation'],
  ['Standard_OutOfRange', 'A parameter is outside the valid range'],
  ['Standard_RangeError', 'A value is outside its valid range'],
  ['Standard_TypeMismatch', 'Wrong shape type for this operation'],
  ['Standard_DomainError', 'Mathematical domain error — input is outside the valid domain'],
  ['Standard_DivideByZero', 'Division by zero'],
  ['Standard_Overflow', 'Numeric overflow — value is too large'],
  ['Standard_Underflow', 'Numeric underflow — value is too small'],
  ['Standard_NumericError', 'Numeric error in computation'],
  ['Standard_ImmutableObject', 'Cannot modify an immutable object'],
  ['Standard_NoSuchObject', 'The requested object does not exist'],
  ['Standard_NotImplemented', 'This operation is not implemented'],
  ['Standard_ProgramError', 'Internal program error in the geometry kernel'],
  ['Standard_OutOfMemory', 'Out of memory — the operation requires too many resources'],
  ['StdFail_NotDone', 'Operation did not complete — the algorithm failed to produce a result'],
  ['StdFail_InfiniteSolutions', 'Infinite solutions — the problem is under-constrained'],
  ['StdFail_Undefined', 'Result is undefined for the given input'],
  ['Geom_UndefinedDerivative', 'Curve/surface derivative is undefined at this point'],
  ['Geom_UndefinedValue', 'Curve/surface value is undefined at this point'],
  ['Standard_Failure', 'The geometry kernel encountered an error'],
]);

/**
 * Format an OpenCASCADE exception into a human-readable KernelError message.
 */
export function formatOcExceptionMessage(typeName: string, rawMessage: string): string {
  // Check rawMessage first — it's typically the more specific identifier
  // (e.g., "BRepSweep_Translation::Constructor" vs "Standard_ConstructionError")
  const candidates = [rawMessage, typeName].filter(Boolean);
  for (const candidate of candidates) {
    for (const [prefix, description] of ocExceptionDescriptions) {
      if (candidate.startsWith(prefix)) {
        const identifier = candidate;
        return `KernelError: ${description} (${identifier})`;
      }
    }
  }

  if (typeName && rawMessage) {
    return `KernelError: ${typeName}: ${rawMessage}`;
  }

  if (typeName || rawMessage) {
    return `KernelError: ${typeName || rawMessage}`;
  }

  return 'KernelError: Unknown kernel error';
}

// =============================================================================
// OC Exception Decoding
// =============================================================================

/**
 * Extract the exception type name from an OpenCASCADE Standard_Failure object.
 */
function extractExceptionTypeName(
  errorData: ReturnType<OpenCascadeWithExceptions['OCJS']['getStandard_FailureData']>,
): string {
  try {
    // eslint-disable-next-line new-cap, @typescript-eslint/naming-convention -- C++ method with PascalCase convention
    const dynType = errorData.ExceptionType() as unknown as { Name(): string; delete(): void };
    // eslint-disable-next-line new-cap -- C++ method Name() is PascalCase in OpenCASCADE
    return withWasmObject(dynType, (dt) => dt.Name());
  } catch {
    return '';
  }
}

/**
 * Extract message, type name, and C++ stack from an OpenCASCADE Standard_Failure.
 * Frees WASM memory for the error data when done.
 */
function extractStandardFailureData(
  ocInstance: OpenCascadeInstance,
  errorPointer: number,
): { message: string; typeName: string; cppStack: string } {
  const oc = ocInstance as OpenCascadeWithExceptions;
  return withWasmObject(oc.OCJS.getStandard_FailureData(errorPointer), (errorData) => {
    // eslint-disable-next-line new-cap -- C++ method
    const errorMessage = errorData.GetMessageString();
    // eslint-disable-next-line new-cap -- C++ method
    const cppStack = errorData.GetStackString();
    const typeName = extractExceptionTypeName(errorData);
    return { message: errorMessage, typeName, cppStack };
  });
}

/**
 * Decode an OpenCASCADE exception pointer into a human-readable message.
 * Returns the enriched message and optional C++ stack, or falls back to a generic message.
 */
export function decodeOcException(
  pointer: number,
  ocInstance: OpenCascadeInstance,
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
 * Format a runtime error into a KernelIssue, with OC exception decoding.
 *
 * Handles (in priority order):
 * - WebAssembly.Exception: native wasm-exceptions via getExceptionMessage()
 * - bare number: legacy Emscripten throw (JS stack is unwound)
 * - CppException: Emscripten 5.x Error with excPtr
 * - Error instances: standard JS errors with stack traces
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
  ocInstance: OpenCascadeInstance;
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
    return { message: error.message, location, type: 'kernel', severity: 'error', stackFrames };
  }

  if (isWebAssemblyException(error)) {
    const decoded = decodeWebAssemblyException(error, ocInstance as Partial<EmscriptenExceptionHelpers>);
    if (decoded) {
      const stackFrames = applySourceMaps(parseStackTrace(new Error(decoded.message)));
      const location = deriveLocation(stackFrames, sourceMap);
      return { message: decoded.message, location, type: 'kernel', severity: 'error', stackFrames };
    }
  }

  const wasmException = extractWasmException(error);
  if (wasmException) {
    const { message, cppStack } = decodeOcException(wasmException.pointer, ocInstance);
    const errorForStack = wasmException.sourceError ?? new Error(message);
    const stackFrames = applySourceMaps(parseStackTrace(errorForStack));
    const location = deriveLocation(stackFrames, sourceMap);
    return { message, location, type: 'kernel', severity: 'error', stack: cppStack, stackFrames };
  }

  const stackFrames = applySourceMaps(parseStackTrace(error));
  const location = deriveLocation(stackFrames, sourceMap);
  return {
    message: error instanceof Error ? error.message : String(error),
    location,
    type: 'runtime',
    severity: 'error',
    stackFrames,
  };
}
