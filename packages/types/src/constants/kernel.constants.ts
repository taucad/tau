import type { CodeLanguage } from '#types/code.types.js';

/** The number of dimensions the kernel supports. */
export type KernelDimensions = 2 | 3;

export type KernelBackend = 'manifold' | 'opencascade' | 'zoo' | 'jscad';

export type KernelConfiguration = {
  id: string;
  name: string;
  language: CodeLanguage;
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
    id: 'manifold',
    name: 'Manifold',
    dimensions: [2, 3],
    language: 'typescript',
    description: 'Fast mesh-focused CAD with robust booleans',
    mainFile: 'main.ts',
    backendProvider: 'manifold',
    longDescription:
      'Manifold is a high-performance geometry kernel focused on topological robustness and mesh-first workflows. It is ideal for boolean-heavy modeling, procedural generation, and browser-native CAD experiences.',
    emptyCode: `import {} from 'manifold-3d/manifoldCAD';

export const defaultParams = {};

export default function main(p = defaultParams) {}
`,
    recommended: 'Procedural & Mesh-First CAD',
    tags: ['TypeScript', 'Robust Booleans', 'Mesh Kernel', 'WASM', 'Browser-Native'],
    features: ['Fast booleans', 'Robust topology', 'WASM runtime', 'GLTF-native scene output'],
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
    emptyCode: `import {} from '@jscad/modeling';

export const defaultParams = {};

export default function main(p = defaultParams) {}
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
  {
    id: 'opencascadejs',
    name: 'OpenCascade',
    dimensions: [2, 3],
    language: 'typescript',
    description: 'Direct OpenCASCADE API for advanced CAD',
    mainFile: 'main.ts',
    backendProvider: 'opencascade',
    longDescription:
      'Direct access to the OpenCASCADE Technology (OCCT) kernel via opencascade.js. Full control over BRep operations, precise geometry, and advanced CAD algorithms without abstraction layers.',
    emptyCode: `import {} from 'opencascade.js';

export const defaultParams = {};

export default function main(p = defaultParams) {}
`,
    recommended: 'Advanced CAD & Full Kernel Access',
    tags: ['OpenCASCADE', 'BRep', 'TypeScript', 'WASM', 'Precision'],
    features: [
      'Full OpenCascade API access',
      'BRep kernel',
      'STEP/STL export',
      'Advanced boolean operations',
      'Precise tolerancing',
    ],
  },
] as const satisfies KernelConfiguration[];

export type KernelId = (typeof kernelConfigurations)[number]['id'];

export type KernelBackendProvider = (typeof kernelConfigurations)[number]['backendProvider'];

export const kernelProviders = kernelConfigurations.map((option) => option.id) as [KernelId];

export const backendProviders = kernelConfigurations.map((option) => option.backendProvider) as [KernelBackendProvider];

/**
 * Narrow per-kernel entry type preserving the literal `id` union and all
 * other const-asserted field literals. Prefer this over
 * {@link KernelConfiguration} (which widens `id` to `string`) when the
 * value participates in typed-id consumers like `SvgIcon` or
 * `KernelTierBadge`.
 */
export type KernelEntry = (typeof kernelConfigurations)[number];

const kernelById = new Map<KernelId, KernelEntry>(kernelConfigurations.map((k) => [k.id, k]));

/**
 * Resolve a {@link KernelId} to its {@link KernelEntry}. The lookup cannot
 * miss because `id` is the closed union literally derived from
 * `kernelConfigurations[number]['id']`, so the non-null assertion is safe
 * by construction. Encapsulating it here removes the `?? 'openscad'`
 * fallback class at every consumer site.
 *
 * Preferred over a `Record<KernelId, KernelEntry>` lookup because the
 * repo runs with `noUncheckedIndexedAccess: true`, which widens dynamic
 * indexed access to `T | undefined` regardless of key narrowness.
 */
export function resolveKernel(id: KernelId): KernelEntry {
  // oxlint-disable-next-line @typescript-eslint/no-non-null-assertion -- safe by construction: `id` is the closed union of registered kernel ids
  return kernelById.get(id)!;
}

/**
 * Type guard for {@link KernelId}. Use at every external-data boundary
 * (cookies, IndexedDB rows, Postgres rows, wire payloads) to heal stale
 * ids — e.g. ids referencing a kernel that was retired from
 * {@link kernelConfigurations} after the value was persisted.
 */
export const isKernelId = (v: unknown): v is KernelId =>
  typeof v === 'string' && (kernelProviders as readonly string[]).includes(v);

// oxlint-disable-next-line unicorn/no-array-reduce -- we know the keys are unique
export const languageFromKernel = kernelConfigurations.reduce(
  (accumulator, option: KernelConfiguration) => {
    accumulator[option.id as KernelId] = option.language;
    return accumulator;
  },
  {} as Record<KernelId, CodeLanguage>,
);
