import type { KernelConfig } from '#api/chat/prompts/kernel-prompt-configs/kernel.prompt.config.types.js';
import canonicalExample from '#api/chat/prompts/kernel-prompt-configs/manifold.prompt.example.ts?raw';

export const manifoldConfig: KernelConfig = {
  fileExtension: '.ts',
  languageName: 'Manifold',

  codeStandards: `Output TypeScript with ES module imports from \`manifold-3d/manifoldCAD\`. Export \`defaultParams\` and a default \`main(params)\` function that returns a \`Manifold\` (or array of \`Manifold\`/GLTFNode objects).`,

  commonErrorPatterns:
    'missing manifold imports, returning undefined from main, invalid boolean operation inputs, non-positive dimensions',

  fileLayoutMode: 'full-nesting',
  canonicalExample,
};
