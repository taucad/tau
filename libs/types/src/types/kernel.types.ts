import type { backendProviders, kernelProviders } from '#constants/kernel.constants.js';
import type { Geometry } from '#types/cad.types.js';

export type KernelStackFrame = {
  fileName?: string;
  functionName?: string;
  lineNumber?: number;
  columnNumber?: number;
  source?: string;
};

export type KernelError = {
  message: string;
  startLineNumber: number;
  startColumn: number;
  endLineNumber?: number;
  endColumn?: number;
  stack?: string;
  stackFrames?: KernelStackFrame[];
  type?: 'compilation' | 'runtime' | 'kernel' | 'unknown';
};

// Result pattern types for kernel operations
export type KernelSuccessResult<T> = {
  success: true;
  data: T;
};

export type KernelErrorResult = {
  success: false;
  error: KernelError;
};

export type KernelProvider = (typeof kernelProviders)[number];
export type BackendProvider = (typeof backendProviders)[number];

export type KernelResult<T> = KernelSuccessResult<T> | KernelErrorResult;

// Specific result types for different kernel operations
export type ComputeGeometryResult = KernelResult<Geometry[]>;

export type ExtractParametersResult = KernelResult<{
  defaultParameters: Record<string, unknown>;
  jsonSchema: unknown;
}>;

export type ExtractNameResult = KernelResult<string | undefined>;

export type ExtractSchemaResult = KernelResult<unknown>;

export type ExportGeometryResult = KernelResult<Array<{ blob: Blob; name: string }>>;
