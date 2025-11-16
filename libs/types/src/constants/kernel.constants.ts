export type KernelLanguage = 'openscad' | 'typescript' | 'kcl';

/** The number of dimensions the kernel supports. */
export type KernelDimensions = 2 | 3;

export type KernelBackend = 'manifold' | 'opencascade' | 'zoo' | 'jscad';

export type KernelConfiguration = {
  id: string;
  name: string;
  language: KernelLanguage;
  dimensions: KernelDimensions[];
  description: string;
  mainFile: string;
  backendProvider: KernelBackend;
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
    dimensions: [3],
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
    dimensions: [2, 3],
    language: 'typescript',
    description: 'TypeScript CAD for precise engineering',
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
    dimensions: [3],
    language: 'kcl',
    description: 'Cloud-native CAD modeling',
    mainFile: 'main.kcl',
    backendProvider: 'zoo',
    longDescription:
      'Cloud-native CAD modeling with precise parametric geometry. Designed for modern CAD workflows with AI integration and collaborative features.',
    emptyCode: `@settings(defaultLengthUnit = mm, kclVersion = 1.0)
`,
    recommended: 'Cloud-native & AI-driven CAD',
    tags: ['Cloud-native', 'Parametric', 'AI Integration', 'Modern CAD', 'KCL'],
    features: ['Cloud-native modeling', 'AI-assisted design', 'Precise geometry', 'Modern syntax', 'STL/STEP export'],
  },
  {
    id: 'jscad',
    name: 'JSCAD',
    dimensions: [2, 3],
    language: 'typescript',
    description: 'TypeScript CAD for Constructive Solid Geometry',
    mainFile: 'main.ts',
    backendProvider: 'jscad',
    longDescription:
      'Open-source modular CAD toolkit using JavaScript. Creates parametric 2D & 3D designs with CSG operations. Perfect for browser-based modeling, 3D printing, and programmatic design generation.',
    emptyCode: `// JSCAD minimal starter
// This code requires the @jscad/modeling API at runtime.
import { primitives } from '@jscad/modeling';
const { cube } = primitives;

export const defaultParams = { size: 20 };

export default function main(p = defaultParams) {
  
  return cube({ size: p.size });
}
`,
    recommended: '3D Printing & Web-Based CAD',
    tags: ['TypeScript', 'CSG', 'Browser-Native', '3D Printing'],
    features: [
      'Constructive Solid Geometry (CSG)',
      'Parametric 2D & 3D modeling',
      'Browser & CLI support',
      'ES module architecture',
    ],
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
