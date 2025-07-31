import type { SourceRange } from '@taucad/kcl-wasm-lib/bindings/SourceRange';
import type { KclError as WasmKclError } from '@taucad/kcl-wasm-lib/bindings/KclError';
import type { KernelStackFrame } from '#types/kernel.types.js';
import { sourceRangeToLineColumn } from '#components/geometry/kernel/zoo/source-range-utils.js';

export type WasmFileInfo = {
  type: string;
  value: string;
};

/**
 * This addresses some shortcomings of the WASM KclError type.
 * - The `filenames` field is not included in the type.
 */
export type ExtendedWasmKclError = WasmKclError & {
  filenames?: Record<string | number, WasmFileInfo>;
};

// Simplified error kinds that map to KernelError types
export type KclErrorKind =
  | 'lexical'
  | 'syntax'
  | 'semantic'
  | 'type'
  | 'engine'
  | 'runtime'
  | 'internal'
  | 'io'
  | 'unexpected'
  | 'auth'
  | 'export'
  | 'unknown';

export class KclError extends Error {
  /**
   * Create a simple error with minimal information
   */
  public static simple(kind: KclErrorKind, message: string, lineNumber = 0, column = 0): KclError {
    const sourceRange: SourceRange = [column, column, lineNumber];
    return new KclError(kind, message, sourceRange);
  }

  public readonly kind: KclErrorKind;
  public readonly sourceRange: SourceRange;
  public readonly msg: string;

  public constructor(kind: KclErrorKind, message: string, sourceRange: SourceRange) {
    super(`${kind}: ${message}`);
    this.kind = kind;
    this.msg = message;
    this.sourceRange = sourceRange;
  }
}

// Special auth error with status code
export class KclAuthError extends KclError {
  public readonly statusCode?: number;

  public constructor(message: string, statusCode?: number, sourceRange?: SourceRange) {
    const defaultSourceRange: SourceRange = [0, 0, 0];
    super('auth', message, sourceRange ?? defaultSourceRange);
    this.statusCode = statusCode;
  }
}

// Special export error with export type
export class KclExportError extends KclError {
  public readonly exportType?: string;

  public constructor(message: string, exportType?: string, sourceRange?: SourceRange) {
    const defaultSourceRange: SourceRange = [0, 0, 0];
    super('export', message, sourceRange ?? defaultSourceRange);
    this.exportType = exportType;
  }
}

// WASM KclError wrapper that preserves original error structure
export class KclWasmError extends KclError {
  public readonly wasmError: WasmKclError;

  public constructor(wasmError: WasmKclError) {
    const { kind, details } = wasmError;
    const { msg, sourceRanges } = details;

    // Use the first source range if available, otherwise default
    const sourceRange: SourceRange = sourceRanges.length > 0 ? sourceRanges[0]! : [0, 0, 0];

    super(kind as KclErrorKind, msg, sourceRange);
    this.wasmError = wasmError;
  }

  /**
   * Create stack frames from the WASM error backtrace
   */
  public createStackFrames(code: string): KernelStackFrame[] {
    const extendedError = this.wasmError as ExtendedWasmKclError;
    const { backtrace } = extendedError.details;
    const { filenames } = extendedError;

    if (backtrace.length === 0) {
      return [];
    }

    return backtrace.map((item) => {
      const { fnName, sourceRange } = item;
      const [_startChar, _endChar, moduleId] = sourceRange;

      // Get filename from filenames object using moduleId
      let fileName: string | undefined;
      if (filenames?.[moduleId]) {
        const fileInfo = filenames[moduleId];
        fileName = fileInfo.value;
      }

      // Convert source range to line/column positions
      const position = sourceRangeToLineColumn(sourceRange, code);

      const stackFrame: KernelStackFrame = {
        functionName: fnName ?? undefined,
        fileName,
        lineNumber: position.line,
        columnNumber: position.column,
      };

      return stackFrame;
    });
  }
}

// Type guards
export const isKclError = (error: unknown): error is KclError => {
  return error instanceof KclError;
};

export const isWasmKclError = (error: unknown): error is WasmKclError => {
  return (
    error !== null &&
    typeof error === 'object' &&
    'kind' in error &&
    'details' in error &&
    typeof (error as WasmKclError).kind === 'string' &&
    typeof (error as WasmKclError).details === 'object'
  );
};

// Type guard for WASM execution result that contains an error
export const isWasmExecutionResultWithError = (
  error: unknown,
): error is {
  error: WasmKclError;
  filenames?: Record<string | number, WasmFileInfo>;
} => {
  return (
    error !== null &&
    typeof error === 'object' &&
    'error' in error &&
    isWasmKclError((error as { error: unknown }).error)
  );
};

// Helper to extract KclError from various WASM error formats
export const extractWasmKclError = (error: unknown): WasmKclError | undefined => {
  // Direct WASM KclError
  if (isWasmKclError(error)) {
    return error;
  }

  // WASM execution result with nested error
  if (isWasmExecutionResultWithError(error)) {
    // Create an extended error that includes filenames from the root level
    const extendedError = error.error as ExtendedWasmKclError;
    extendedError.filenames = error.filenames;
    return extendedError;
  }

  return undefined;
};

// Helper function to extract error information from execution results
export function extractExecutionError(
  errors: unknown[],
  code: string,
  messagePrefix: string,
): { message: string; startColumn: number; startLineNumber: number } {
  const firstError = errors[0];
  let errorMessage = messagePrefix;
  let startColumn = 0;
  let startLineNumber = 0;

  // Check if the error has the nested structure with source ranges
  const wasmError = extractWasmKclError(firstError);
  if (wasmError) {
    const { details } = wasmError;
    errorMessage = `${messagePrefix}: ${details.msg}`;

    // Extract source range if available
    if (details.sourceRanges.length > 0) {
      const sourceRange = details.sourceRanges[0]!;
      const position = sourceRangeToLineColumn(sourceRange, code);
      startColumn = position.column;
      startLineNumber = position.line;
    }
  } else {
    // Fallback to original error message extraction
    const errorMessages = errors.map((error) => {
      if (typeof error === 'string') {
        return error;
      }

      const errorObject = error as { message?: string; msg?: string };
      return errorObject.message ?? errorObject.msg ?? JSON.stringify(error);
    });
    errorMessage = `${messagePrefix}: ${errorMessages.join(', ')}`;
  }

  return { message: errorMessage, startColumn, startLineNumber };
}
