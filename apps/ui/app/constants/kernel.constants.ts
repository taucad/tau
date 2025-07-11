import type { KernelProvider } from '~/types/kernel.types.js';

export type KernelOption = {
  id: KernelProvider;
  name: string;
  description: string;
  mainFile: string;
  longDescription: string;
  emptyCode: string;
  recommended: string;
  tags: string[];
  features: string[];
  examples: Array<{ name: string; description: string }>;
};

export const kernelOptions: KernelOption[] = [
  {
    id: 'openscad',
    name: 'OpenSCAD',
    description: 'Constructive Solid Geometry for 3D printing',
    mainFile: 'main.scad',
    longDescription:
      'Uses Constructive Solid Geometry (CSG) - build complex shapes by combining basic primitives with boolean operations. Outputs mesh files perfect for 3D printing.',
    emptyCode: ``,
    recommended: '3D Printing & Prototyping',
    tags: ['Constructive Solid Geometry', 'Mesh Export', 'Scripting', '3D Printing'],
    features: ['Boolean operations', 'Parametric design', 'STL export', 'Large community'],
    examples: [
      { name: 'Basic Box', description: 'Simple parametric box with rounded corners' },
      { name: 'Gear Generator', description: 'Customizable gear with configurable teeth' },
      { name: 'Phone Case', description: 'Parametric phone case generator' },
    ],
  },
  {
    id: 'replicad',
    name: 'Replicad',
    description: 'TypeScript-based CAD for precise engineering',
    mainFile: 'main.ts',
    longDescription:
      'Uses Boundary Representation (BRep) for mathematically exact geometry. Perfect for engineering applications requiring precise measurements and tolerances.',
    emptyCode: `import {} from 'replicad';

export const defaultParams = {};

export default function main(p = defaultParams) {}
`,
    recommended: 'Engineering & Manufacturing',
    tags: ['Boundary Representation', 'OpenCascade', 'Exact Geometry', 'TypeScript', 'Precision'],
    features: ['Exact geometry', 'TypeScript API', 'CAD operations', 'STEP export'],
    examples: [
      { name: 'Mechanical Part', description: 'Precision engineered component' },
      { name: 'Assembly', description: 'Multi-part mechanical assembly' },
      { name: 'Sheet Metal', description: 'Bend and fold operations' },
    ],
  },
  {
    id: 'zoo',
    name: 'Zoo (KCL)',
    description: 'Cloud-native CAD with KittyCAD Language',
    mainFile: 'main.kcl',
    longDescription:
      'Uses KittyCAD Language (KCL) for cloud-native CAD modeling. Combines the power of Zoo\'s geometry engine with parametric design and AI-powered features like Text-to-CAD.',
    emptyCode: `// KCL (KittyCAD Language) example
const width = 20
const height = 10
const depth = 15

// Create a basic box shape
box(width, height, depth)
`,
    recommended: 'Cloud-native CAD & AI-powered Design',
    tags: ['Cloud-native', 'KCL', 'Text-to-CAD', 'AI-powered', 'Parametric', 'Precision'],
    features: ['Cloud geometry engine', 'KCL language', 'STL & STEP export', 'Text-to-CAD integration'],
    examples: [
      { name: 'Engine Valve', description: 'Parametric engine valve with precise dimensions' },
      { name: 'Brake Rotor', description: 'Automotive brake rotor with cooling vanes' },
      { name: 'Mechanical Assembly', description: 'Multi-part assembly with constraints' },
    ],
  },
];

// Helper function to get kernel option by id
export function getKernelOption(kernelId: KernelProvider): KernelOption {
  const option = kernelOptions.find((option) => option.id === kernelId);

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
