import type { KernelProvider } from '@taucad/runtime';

/**
 * Project manifest dependencies, kept separate from executable kernel plugins so the
 * desktop renderer never bundles CAD execution just to create a package.json.
 * The parity test checks these exact package identities against each plugin.
 */
export const kernelLibraries: Partial<Record<KernelProvider, Readonly<Record<string, string>>>> = {
  replicad: {
    replicad: 'npm:@taulabs/replicad@1.1.0-taulabs.1',
    'replicad-opencascadejs': 'npm:@taulabs/replicad-opencascadejs@0.23.0-beta.0',
  },
  opencascadejs: { libcascade: '3.1.0' },
  jscad: { '@jscad/modeling': '2.13.0' },
  manifold: { 'manifold-3d': '3.4.1' },
  picovoxel: { picovoxel: '0.1.0' },
  smlib: { '@classcad/smlibwasm': '0.3.4' },
  tscircuit: {
    tscircuit: 'npm:@tscircuit/core@0.0.1844',
    '@tscircuit/core': '0.0.1844',
    '@tscircuit/props': '0.0.646',
    react: '19.3.0',
    'react-dom': '19.3.0',
    '@tscircuit/capacity-autorouter': '0.0.879',
    '@tscircuit/checks': '0.0.183',
    '@tscircuit/circuit-json-util': '0.0.111',
    '@tscircuit/create-fdm-enclosure': '0.0.7',
    '@tscircuit/footprinter': '0.0.426',
    '@tscircuit/infgrid-ijump-astar': '0.0.35',
    '@tscircuit/math-utils': '0.0.38',
    '@tscircuit/schematic-match-adapt': '0.0.22',
    'circuit-json-to-bpc': '0.0.14',
    'bpc-graph': '0.0.67',
    '@tscircuit/matchpack': '0.0.91',
    'circuit-json': '0.0.485',
    'circuit-json-to-connectivity-map': '0.0.30',
    'circuit-json-to-spice': '0.0.46',
    'schematic-symbols': '0.0.244',
    spicets: '0.0.5',
    typescript: '5.9.3',
    '@tscircuit/soup-util': '0.0.41',
    'connectivity-map': '1.0.0',
    '@tscircuit/copper-pour-solver': '0.0.52',
    '@tscircuit/image-utils': '0.0.10',
    '@tscircuit/infer-cable-insertion-point': '0.0.4',
    '@tscircuit/miniflex': '0.0.4',
    '@tscircuit/schematic-trace-solver': '0.0.184',
    '@tscircuit/solver-utils': '0.0.21',
    'calculate-elbow': '0.0.13',
    'graphics-debug': '0.0.100',
    minicssgrid: '0.0.9',
    spicey: '0.0.14',
    debug: '4.4.3',
    flatbush: '4.6.2',
  },
};
