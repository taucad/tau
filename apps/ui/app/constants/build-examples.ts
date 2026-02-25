import { mockBuilds, jscadExamples } from '@taucad/tau-examples';
import type { Build } from '@taucad/types';
import type { KernelProvider } from '@taucad/kernels';
import { encodeTextFile } from '#utils/filesystem.utils.js';

// Sample data
type Model = {
  id: string;
  name: string;
  code: string;
  thumbnail: string;
  language: KernelProvider;
};

type Files = Record<string, { content: Uint8Array<ArrayBuffer> }>;

export type BuildWithFiles = Build & { files: Files };

const createBuild = (model: Omit<Model, 'language'>, mainFile: string, kernel: KernelProvider): BuildWithFiles => {
  return {
    id: model.id,
    assets: {
      mechanical: {
        main: mainFile,
        parameters: {},
      },
    },
    name: model.name,
    description: `A 3D ${model.name} model built with ${kernel}`,
    author: {
      name: 'Tau Team',
      avatar: '/avatar-sample.png',
    },
    createdAt: 1_740_702_000_000,
    updatedAt: 1_740_702_000_000,
    tags: ['3d-printing', 'parametric', kernel],
    thumbnail: model.thumbnail,
    files: { [mainFile]: { content: encodeTextFile(model.code) } },
  };
};

export const replicadBuilds: BuildWithFiles[] = mockBuilds.map((model) => {
  const mainFile = 'main.ts';
  const language = 'replicad';
  return createBuild(model, mainFile, language);
});

const openScadModels: Model[] = [
  {
    id: 'openscad_param_box',
    name: 'Parametric Box (OpenSCAD)',
    code: `// Parametric Hollow Box Example\n// Demonstrates OpenSCAD Customizer parameters\n// and basic CSG operations.\n\n// [size] = 40                // Overall box size (mm)\n// [wall] = 3                 // Wall thickness (mm)\n// [round] = 2                // Fillet radius on outer edges\n\n$fn = 48; // smooth circles for fillets\n\nmodule roundedCube(sz, r=0, center=true) {\n  if (r <= 0)\n    cube(sz, center=center);\n  else\n    minkowski() {\n      cube(sz - 2*r, center=center);\n      sphere(r = r);\n    }\n}\n\n// Outer shell\nroundedCube(size, round);\n\n// Subtract inner cavity\ntranslate([0,0,0])\n  roundedCube(size - 2*wall, round > wall ? round - wall : 0);`,
    thumbnail: '/placeholder.svg',
    language: 'openscad',
  },
  {
    id: 'openscad_cube',
    name: 'OpenSCAD Cube',
    code: 'cube(10);',
    thumbnail: '/placeholder.svg',
    language: 'openscad',
  },
] as const;

export const openscadBuilds: BuildWithFiles[] = openScadModels.map((model) => {
  const mainFile = 'main.scad';
  const language = 'openscad';
  return createBuild(model, mainFile, language);
});

const jscadBuilds: BuildWithFiles[] = jscadExamples.map((model) => {
  const mainFile = 'main.ts';
  const language: KernelProvider = 'jscad';
  return createBuild(model, mainFile, language);
});

const tscircuitModels: Model[] = [
  {
    id: 'tscircuit_basic_board',
    name: 'TSCircuit Basic Board',
    code: `circuit.add(
  <board width="48mm" height="30mm">
    <hole name="H1" diameter="2.4mm" pcbX={-18} pcbY={10} />
    <hole name="H2" diameter="2.4mm" pcbX={18} pcbY={10} />
  </board>
);`,
    thumbnail: '/placeholder.svg',
    language: 'tscircuit',
  },
] as const;

const tscircuitBuilds: BuildWithFiles[] = tscircuitModels.map((model) => {
  const mainFile = 'main.tsx';
  const language: KernelProvider = 'tscircuit';
  return createBuild(model, mainFile, language);
});

export const sampleBuilds: BuildWithFiles[] = [
  ...replicadBuilds,
  ...openscadBuilds,
  ...jscadBuilds,
  ...tscircuitBuilds,
];
