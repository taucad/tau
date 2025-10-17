import type { KernelProvider } from '@taucad/types';
import { kernelConfigurations } from '@taucad/types/constants';
import type { KernelConfiguration } from '@taucad/types/constants';

// Helper function to get kernel option by id
export function getKernelOption(kernelId: KernelProvider): KernelConfiguration {
  const option = kernelConfigurations.find((option) => option.id === kernelId);

  if (!option) {
    throw new Error(`Kernel option not found for id: ${kernelId}`);
  }

  return option;
}

// Helper function to get main file for a kernel
export function getMainFile(kernelId: KernelProvider): string {
  const option = getKernelOption(kernelId);

  return option.mainFile;
}

// Helper function to get empty code for a kernel
export function getEmptyCode(kernelId: KernelProvider): string {
  const option = getKernelOption(kernelId);
  return option.emptyCode;
}
