import type { KernelConfig } from '#api/chat/prompts/kernel-prompt-configs/kernel.prompt.config.types.js';
import canonicalExample from '#api/chat/prompts/kernel-prompt-configs/manifold.prompt.example.ts?raw';
import multiFileMain from '#api/chat/prompts/kernel-prompt-configs/manifold.prompt.example-multifile/main.ts?raw';
import multiFileLibWidget from '#api/chat/prompts/kernel-prompt-configs/manifold.prompt.example-multifile/lib/widget.ts?raw';

export const manifoldConfig: KernelConfig = {
  fileExtension: '.ts',
  languageName: 'Manifold',

  codeStandards: `Output TypeScript with ES module imports from \`manifold-3d/manifoldCAD\`. Export \`defaultParams\` and a default \`main(params)\` function that returns a \`Manifold\` (or array of \`Manifold\`/GLTFNode objects).`,

  commonErrorPatterns:
    'missing manifold imports, returning undefined from main, invalid boolean operation inputs, non-positive dimensions, segments proliferation on small features, polygon-from-points loops where CrossSection.circle or revolve already exist',

  topologyHints: `- No analytical curves — all geometry is mesh. Choose segment count, not curve form.
- Cylinders / spheres / revolves: segments ≈ \`max(16, π · diameter / 0.3)\` for visible parts, 0.1 for export-grade. Default 32 for small, 64 for large.
- Prefer \`Manifold.cylinder\` / \`Manifold.sphere\` / \`Manifold.revolve\` over manual CrossSection-from-points loops.
- Avoid Manifold-of-Manifold compositions where a single \`Manifold.compose(arr)\` would do.`,

  fileLayoutMode: 'full-nesting',
  canonicalExample,

  topLevelExportExample: 'export default function main(p = defaultParams): Manifold { return makePart(p); }',

  multiFileExample: {
    mainFile: 'main.ts',
    files: [
      { path: 'main.ts', content: multiFileMain },
      { path: 'lib/widget.ts', content: multiFileLibWidget },
    ],
  },
};
