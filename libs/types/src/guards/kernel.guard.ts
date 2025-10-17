import type { KernelErrorResult, KernelResult, KernelSuccessResult } from '#types/kernel.types.js';

// Helper type guards

export const isKernelSuccess = <T>(result: KernelResult<T>): result is KernelSuccessResult<T> => {
  return result.success;
};

export const isKernelError = <T>(result: KernelResult<T>): result is KernelErrorResult => {
  return !result.success;
};
