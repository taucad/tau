import type { KernelConfig } from '#api/chat/prompts/kernel-prompt-configs/kernel.prompt.config.types.js';
import canonicalExample from '#api/chat/prompts/kernel-prompt-configs/picovoxel.prompt.example.ts?raw';
import multiFileMain from '#api/chat/prompts/kernel-prompt-configs/picovoxel.prompt.example-multifile/main.ts?raw';
import multiFileWidget from '#api/chat/prompts/kernel-prompt-configs/picovoxel.prompt.example-multifile/lib/widget.ts?raw';

export const picovoxelConfig: KernelConfig = {
  fileExtension: '.ts',
  languageName: 'Picovoxel',
  codeStandards:
    'Output TypeScript with ES module imports from Picovoxel public modules. Export `defaultParams` and a default `main(pico, params)` function returning a `Mesh`, `Voxels`, or a flat non-empty array of them. The runtime creates and disposes the Pico session; never call `createPico()` or import `picovoxel/multi`.',
  commonErrorPatterns:
    'creating a separate Pico session, returning stats or rich result containers instead of geometry, nested or empty result arrays, non-positive voxelSize, callbacks where serialized SDF expressions are required, retaining disposed geometry',
  testingProfile: { includeBrepFeatureExamples: false },
  topologyHints: `- Picovoxel output is a triangle mesh sampled from voxel or implicit fields, not analytical BRep.
- Smaller voxel sizes increase memory and runtime cubically; use the coarsest size that preserves the required feature.
- Prefer built-in sphere, beam, capsule, implicit, boolean, ShapeKernel, and LatticeLibrary operations over manual triangle construction.
- Return the final Mesh or Voxels value; dispose short-lived heavy intermediates when they are no longer needed.
- Keep the exact lane for reproducible models and exports.`,
  fileLayoutMode: 'full-nesting',
  canonicalExample,
  topLevelExportExample:
    'export default function main(pico: Pico, p = defaultParams): Voxels { return makePart(pico, p); }',
  multiFileExample: {
    mainFile: 'main.ts',
    files: [
      { path: 'main.ts', content: multiFileMain },
      { path: 'lib/widget.ts', content: multiFileWidget },
    ],
  },
};
