import type { KernelProvider } from '~/types/kernel.types.js';

export const emptyReplicadCode = `import {} from 'replicad';

export const defaultParams = {};

export default function main(p = defaultParams) {}
`;

export const emptyOpenscadCode = ``;

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
    emptyCode: emptyOpenscadCode,
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
    emptyCode: emptyReplicadCode,
    recommended: 'Engineering & Manufacturing',
    tags: ['Boundary Representation', 'OpenCascade', 'Exact Geometry', 'TypeScript', 'Precision'],
    features: ['Exact geometry', 'TypeScript API', 'CAD operations', 'STEP export'],
    examples: [
      { name: 'Mechanical Part', description: 'Precision engineered component' },
      { name: 'Assembly', description: 'Multi-part mechanical assembly' },
      { name: 'Sheet Metal', description: 'Bend and fold operations' },
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
