import type { Shape } from '~/types/cad.types.js';

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

export const kernelProviders = ['replicad', 'openscad', 'zoo'] as const;
export type KernelProvider = (typeof kernelProviders)[number];

export type KernelResult<T> = KernelSuccessResult<T> | KernelErrorResult;

// Specific result types for different kernel operations
export type BuildShapesResult = KernelResult<Shape[]>;

export type ExtractParametersResult = KernelResult<{
  defaultParameters: Record<string, unknown>;
  jsonSchema: unknown;
}>;

export type ExtractNameResult = KernelResult<string | undefined>;

export type ExtractSchemaResult = KernelResult<unknown>;

export type ExportGeometryResult = KernelResult<Array<{ blob: Blob; name: string }>>;

// Helper type guards
export const isKernelSuccess = <T>(result: KernelResult<T>): result is KernelSuccessResult<T> => {
  return result.success;
};

export const isKernelError = <T>(result: KernelResult<T>): result is KernelErrorResult => {
  return !result.success;
};

// Helper functions for creating results
export const createKernelSuccess = <T>(data: T): KernelSuccessResult<T> => ({
  success: true,
  data,
});

export const createKernelError = (error: KernelError): KernelErrorResult => ({
  success: false,
  error,
});
