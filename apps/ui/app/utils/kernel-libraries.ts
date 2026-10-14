import type { KernelProvider } from '@taucad/runtime';

/**
 * Project manifest dependencies, kept separate from executable kernel plugins so the
 * desktop renderer never bundles CAD execution just to create a package.json.
 * The parity test checks these exact package identities against each plugin.
 */
export const kernelLibraries: Partial<Record<KernelProvider, Readonly<Record<string, string>>>> = {
  replicad: { replicad: 'npm:@taulabs/replicad@1.1.0-taulabs.0' },
  jscad: { '@jscad/modeling': '2.13.0' },
  manifold: { 'manifold-3d': '3.4.1' },
  picovoxel: { picovoxel: '0.1.0' },
  tscircuit: {
    tscircuit: 'npm:@tscircuit/core@0.0.1844',
    '@tscircuit/core': '0.0.1844',
    '@tscircuit/props': '0.0.646',
    react: '19.2.7',
  },
};
