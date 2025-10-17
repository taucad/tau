import type { KernelSuccessResult, KernelError, KernelErrorResult } from '@taucad/types';

// Helper functions for creating results
export const createKernelSuccess = <T>(data: T): KernelSuccessResult<T> => ({
  success: true,
  data,
});

export const createKernelError = (error: KernelError): KernelErrorResult => ({
  success: false,
  error,
});
