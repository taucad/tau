import type { KernelProvider } from '@taucad/runtime';
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

/**
 * Kernels whose plugins declare npm libraries (`kernel-libraries.ts`), so creating any other project loads no plugin.
 * ponytail: hand-kept beside `kernelLibraries`; `kernel.utils.test.ts` fails when the two differ.
 */
export const kernelsWithLibraries: ReadonlySet<KernelProvider> = new Set([
  'replicad',
  'jscad',
  'manifold',
  'picovoxel',
  'tscircuit',
]);

/**
 * The npm `dependencies` a new project of this kernel declares, as the kernel plugin publishes them
 * (`{ replicad: 'npm:@taulabs/replicad@…' }`); empty for a kernel without npm libraries. The plugins load in their
 * own chunk, on demand; no wasm loads.
 */
export async function getKernelDependencies(kernelId: KernelProvider): Promise<Record<string, string>> {
  if (!kernelsWithLibraries.has(kernelId)) {
    return {};
  }

  const { kernelLibraries } = await import('#utils/kernel-libraries.js');
  return { ...kernelLibraries[kernelId] };
}

/**
 * Format kernel names as a readable list with the specified conjunction.
 * @example formatKernelList('or') // "OpenSCAD, Replicad, Manifold, Zoo, or JSCAD"
 * @example formatKernelList('and') // "OpenSCAD, Replicad, Manifold, Zoo, and JSCAD"
 */
export function formatKernelList(conjunction: 'and' | 'or' = 'and'): string {
  const names = kernelConfigurations.map((k) => k.name);
  if (names.length <= 1) {
    return names[0] ?? '';
  }

  return `${names.slice(0, -1).join(', ')}, ${conjunction} ${names.at(-1)}`;
}
