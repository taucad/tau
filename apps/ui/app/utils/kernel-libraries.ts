import type { KernelProvider } from '@taucad/runtime';

/**
 * Project dependency metadata must not import executable kernels into the desktop renderer.
 * shortcut: this version snapshot is checked against every plugin by kernel.utils.test.ts;
 * regenerate it from their builtinDependencies when a kernel dependency changes.
 */
export const kernelLibraries: Partial<Record<KernelProvider, Readonly<Record<string, string>>>> = {
  replicad: {
    replicad: 'npm:@taulabs/replicad@1.1.0-taulabs.0',
  },
  jscad: {
    '@jscad/modeling': '2.13.0',
  },
  manifold: {
    'manifold-3d': '3.4.1',
  },
  picovoxel: {
    picovoxel: '0.1.0',
  },
  tscircuit: {
    tscircuit: 'npm:@tscircuit/core@0.0.1844',
    '@tscircuit/core': '0.0.1844',
    '@tscircuit/props': '0.0.646',
    react: '19.2.7',
  },
};
