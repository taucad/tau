export type KernelLanguage = 'openscad' | 'typescript' | 'kcl';

export type KernelConfiguration = {
  id: string;
  name: string;
  language: KernelLanguage;
  description: string;
  mainFile: string;
  backendProvider: string;
  longDescription: string;
  emptyCode: string;
  recommended: string;
  tags: string[];
  features: string[];
};

export const kernelConfigurations = [
  {
    id: 'openscad',
    name: 'OpenSCAD',
    language: 'openscad',
    description: 'Constructive Solid Geometry for 3D printing',
    mainFile: 'main.scad',
    backendProvider: 'manifold',
    longDescription:
      'Constructive Solid Geometry (CSG) - build complex geometries by combining basic primitives with boolean operations. Outputs mesh files perfect for 3D printing.',
    emptyCode: ``,
    recommended: '3D Printing & Prototyping',
    tags: ['Constructive Solid Geometry', 'Mesh Export', 'Scripting', '3D Printing'],
    features: ['Boolean operations', 'Parametric design', 'STL export', 'Large community'],
  },
  {
    id: 'replicad',
    name: 'Replicad',
    language: 'typescript',
    description: 'TypeScript-based CAD for precise engineering',
    mainFile: 'main.ts',
    backendProvider: 'opencascade',
    longDescription:
      'Boundary Representation (BRep) for mathematically exact geometry. Perfect for engineering applications requiring precise measurements and tolerances.',
    emptyCode: `import {} from 'replicad';

export const defaultParams = {};

export default function main(p = defaultParams) {}
`,
    recommended: 'Engineering & Manufacturing',
    tags: ['Boundary Representation', 'OpenCascade', 'Exact Geometry', 'TypeScript', 'Precision'],
    features: ['Exact geometry', 'TypeScript API', 'CAD operations', 'STEP export'],
  },
  {
    id: 'zoo',
    name: 'Zoo (KCL)',
    language: 'kcl',
    description: 'Cloud-native CAD modeling',
    mainFile: 'main.kcl',
    backendProvider: 'zoo',
    longDescription:
      'Cloud-native CAD modeling with precise parametric geometry. Designed for modern CAD workflows with AI integration and collaborative features.',
    emptyCode: `@settings(defaultLengthUnit = mm)
`,
    recommended: 'Cloud-native & AI-driven CAD',
    tags: ['Cloud-native', 'Parametric', 'AI Integration', 'Modern CAD', 'KCL'],
    features: ['Cloud-native modeling', 'AI-assisted design', 'Precise geometry', 'Modern syntax', 'STL/STEP export'],
  },
] as const satisfies KernelConfiguration[];

export type KernelId = (typeof kernelConfigurations)[number]['id'];

export type KernelBackendProvider = (typeof kernelConfigurations)[number]['backendProvider'];

export const kernelProviders = kernelConfigurations.map((option) => option.id) as [KernelId];

export const backendProviders = kernelConfigurations.map((option) => option.backendProvider) as [KernelBackendProvider];

// eslint-disable-next-line unicorn/no-array-reduce -- we know the keys are unique
export const languageFromKernel = kernelConfigurations.reduce(
  (acc, option: KernelConfiguration) => {
    acc[option.id as KernelId] = option.language;
    return acc;
  },
  {} as Record<KernelId, KernelLanguage>,
);
