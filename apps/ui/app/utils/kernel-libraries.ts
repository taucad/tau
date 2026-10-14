import type { KernelProvider } from '@taucad/runtime';
import { jscadKernel } from '@taucad/jscad';
import { manifoldKernel } from '@taucad/manifold';
import { picovoxelKernel } from '@taucad/picovoxel';
import { replicadKernel } from '@taucad/replicad';
import { tscircuitKernel } from '@taucad/tscircuit';

/**
 * The npm libraries each kernel's models import, as the kernel plugin declares them (`builtinDependencies`). Read
 * only through `getKernelDependencies`, which loads this module on demand: the plugins stay out of the main bundle.
 * Tau-only modules (`@taucad/replicad/annotations`) have no npm identity and are not listed.
 */
export const kernelLibraries: Partial<Record<KernelProvider, Readonly<Record<string, string>>>> = {
  replicad: replicadKernel().builtinDependencies,
  jscad: jscadKernel().builtinDependencies,
  manifold: manifoldKernel().builtinDependencies,
  picovoxel: picovoxelKernel().builtinDependencies,
  tscircuit: tscircuitKernel().builtinDependencies,
};
