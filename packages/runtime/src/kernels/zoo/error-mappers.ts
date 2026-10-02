// oxlint-disable complexity -- error mapping logic with deeply nested WASM error handling
import type {
  ErrorLocation,
  KernelIssue,
  KernelErrorResult,
  KernelIssueType,
  KernelStackFrame,
} from '#types/runtime.types.js';
import {
  KclError,
  KclWasmError,
  EXECUTE_INTERRUPTED_ERROR_CODE,
  extractWasmKclErrorDetails,
  tryReadWireFailurePayload,
} from '#kernels/zoo/kcl-errors.js';
import { createKernelError } from '#kernels/kernel-helpers.js';
import { sourceRangeToLineColumn } from '#kernels/zoo/source-range-utils.js';

/**
 * Converts any error to a structured KclError, extracting WASM details when available.
 *
 * @param error - the error to convert (KclError, WASM error, or generic Error/string)
 * @returns a KclError instance suitable for diagnostic display
 */
export function mapErrorToKclError(error: unknown): KclError {
  // If it's already a KCL error, return it as-is
  if (error instanceof KclError) {
    return error;
  }

  const wireFailure = tryReadWireFailurePayload(error);
  const firstWireError = wireFailure?.errors[0];
  if (firstWireError?.error_code === EXECUTE_INTERRUPTED_ERROR_CODE) {
    return KclError.simple({
      kind: 'interrupted',
      message: firstWireError.message,
    });
  }

  // Try to extract WASM KclError (handles both direct and nested formats)
  const wasmDetails = extractWasmKclErrorDetails(error);
  if (wasmDetails) {
    return new KclWasmError(wasmDetails.wasmError, wasmDetails.partialOutcome);
  }

  // For any other error, just create a simple unexpected error
  const message = error instanceof Error ? error.message : String(error);
  return KclError.simple({ kind: 'unexpected', message });
}

/**
 * Converts a KclError into a KernelErrorResult with source location and stack frames.
 *
 * @param kclError - structured error emitted by the KCL compiler or runtime
 * @param code - the source code for resolving character offsets to line/column positions
 * @param fileName - the originating file path for error location
 * @returns a KernelErrorResult containing one or more KernelIssues
 */
export function convertKclErrorToKernelIssue(kclError: KclError, code?: string, fileName?: string): KernelErrorResult {
  // Extract source range information if available
  const { sourceRange } = kclError;

  // Default position
  let startLineNumber = 0;
  let startColumn = 0;
  let locationFileName = fileName;
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
    const firstFrame = stackFrames[0];
    if (firstFrame) {
      startLineNumber = firstFrame.lineNumber ?? 0;
      startColumn = firstFrame.columnNumber ?? 0;
      locationFileName = firstFrame.fileName ?? fileName;
    }

    // Create stack string representation if we have stack frames
    if (stackFrames.length > 0) {
      stack = stackFrames
        .map((frame) => {
          const location = frame.fileName
            ? `${frame.fileName}:${frame.lineNumber}:${frame.columnNumber}`
            : `<unknown>:${frame.lineNumber}:${frame.columnNumber}`;
          const functionName = frame.functionName ?? '<anonymous>';
          return `    at ${functionName} (${location})`;
        })
        .join('\n');
    }
  } else {
    // Fallback: use raw source range as character positions
    startLineNumber = sourceRange[2] || 0;
    startColumn = sourceRange[0] || 0;
  }

  // Determine error type based on KCL error kind
  let errorType: KernelIssueType = 'unknown';
  switch (kclError.kind) {
    case 'lexical':
    case 'syntax':
    case 'semantic':
    case 'import_cycle':
    case 'argument':
    case 'type':
    case 'value_already_defined':
    case 'undefined_value':
    case 'invalid_expression':
    case 'refactor': {
      errorType = 'compilation';
      break;
    }

    case 'user_defined':
    case 'max_call_stack':
    case 'engine':
    case 'engine_hangup':
    case 'engine_internal':
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

    case 'connection':
    case 'auth': {
      errorType = 'connection';
      break;
    }

    case 'interrupted': {
      errorType = 'runtime';
      break;
    }

    default: {
      errorType = 'unknown';
      break;
    }
  }

  // Only include location if we have meaningful location data
  const hasLocation = locationFileName && (startLineNumber > 0 || startColumn > 0);
  const location: ErrorLocation | undefined =
    hasLocation && locationFileName ? { fileName: locationFileName, startLineNumber, startColumn } : undefined;

  const kernelIssue: KernelIssue = {
    message: kclError.msg,
    code: errorType === 'kernel' ? 'KERNEL_BINDING_FAILED' : errorType === 'compilation' ? 'BUNDLER_FAILED' : 'RUNTIME',
    location,
    type: errorType,
    stack,
    stackFrames,
    severity: 'error',
  };

  return createKernelError([kernelIssue]);
}
