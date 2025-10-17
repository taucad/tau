import type { KernelStackFrame } from '@taucad/types';
import { KclError, KclWasmError, extractWasmKclError } from '#components/geometry/kernel/zoo/kcl-errors.js';
import { createKernelError } from '#components/geometry/kernel/utils/kernel-helpers.js';
import { sourceRangeToLineColumn } from '#components/geometry/kernel/zoo/source-range-utils.js';

/**
 * Main error mapping function - converts any error to KclError
 */
export function mapErrorToKclError(error: unknown): KclError {
  // If it's already a KCL error, return it as-is
  if (error instanceof KclError) {
    return error;
  }

  // Try to extract WASM KclError (handles both direct and nested formats)
  const wasmError = extractWasmKclError(error);
  if (wasmError) {
    return new KclWasmError(wasmError);
  }

  // For any other error, just create a simple unexpected error
  const message = error instanceof Error ? error.message : String(error);
  return KclError.simple('unexpected', message);
}

/**
 * Convert KCL errors to KernelError format
 */
export function convertKclErrorToKernelError(kclError: KclError, code?: string): ReturnType<typeof createKernelError> {
  // Extract source range information if available
  const { sourceRange } = kclError;

  // Default position
  let startLineNumber = 0;
  let startColumn = 0;
  let stackFrames: KernelStackFrame[] | undefined;
  let stack: string | undefined;

  // If this is a KclWasmError and we have code, use proper position conversion
  if (kclError instanceof KclWasmError && code) {
    const wasmSourceRanges = kclError.wasmError.details.sourceRanges;
    if (wasmSourceRanges.length > 0) {
      const range = wasmSourceRanges[0]!;
      const position = sourceRangeToLineColumn(range, code);
      startColumn = position.column;
      startLineNumber = position.line;
    }

    // Create stack frames from backtrace
    stackFrames = kclError.createStackFrames(code);

    // Create stack string representation if we have stack frames
    if (stackFrames.length > 0) {
      stack = stackFrames
        .map((frame) => {
          const location = frame.fileName
            ? `${frame.fileName}:${frame.lineNumber}:${frame.columnNumber}`
            : `<unknown>:${frame.lineNumber}:${frame.columnNumber}`;
          const funcName = frame.functionName ?? '<anonymous>';
          return `    at ${funcName} (${location})`;
        })
        .join('\n');
    }
  } else {
    // Fallback: use raw source range as character positions
    startLineNumber = sourceRange[2] || 0;
    startColumn = sourceRange[0] || 0;
  }

  // Determine error type based on KCL error kind
  let errorType: 'compilation' | 'runtime' | 'kernel' | 'unknown' = 'unknown';
  switch (kclError.kind) {
    case 'lexical':
    case 'syntax':
    case 'semantic':
    case 'type': {
      errorType = 'compilation';
      break;
    }

    case 'engine':
    case 'runtime': {
      errorType = 'runtime';
      break;
    }

    case 'internal':
    case 'io':
    case 'unexpected': {
      errorType = 'kernel';
      break;
    }

    default: {
      errorType = 'unknown';
      break;
    }
  }

  return createKernelError({
    message: kclError.msg,
    startLineNumber,
    startColumn,
    type: errorType,
    stack,
    stackFrames,
  });
}
