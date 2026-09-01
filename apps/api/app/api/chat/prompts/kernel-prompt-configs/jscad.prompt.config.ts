import { jscadModelingTypes as jscadTypesMap } from '@taucad/api-extractor/kernel-types';
import type { KernelConfig } from '#api/chat/prompts/kernel-prompt-configs/kernel.prompt.config.types.js';
import canonicalExample from '#api/chat/prompts/kernel-prompt-configs/jscad.prompt.example.ts?raw';
import multiFileMain from '#api/chat/prompts/kernel-prompt-configs/jscad.prompt.example-multifile/main.ts?raw';
import multiFileLibWidget from '#api/chat/prompts/kernel-prompt-configs/jscad.prompt.example-multifile/lib/widget.ts?raw';

const jscadModelingTypes = Object.values(jscadTypesMap).join('\n\n');

export const jscadConfig: KernelConfig = {
  fileExtension: '.ts',
  languageName: 'JSCAD',

  codeStandards: `Output TypeScript with ES module imports. Import from \`@jscad/modeling\` submodules. Export \`defaultParams\` object and default \`main(params)\` function returning geometry.

<jscad_api>
${jscadModelingTypes}
</jscad_api>`,

  commonErrorPatterns:
    'incorrect import paths, invalid dimensions, failed boolean operations, malformed vector arrays, segments proliferation, polygon-from-points loops where circle/extrudeRotate exists',

  topologyHints: `- No analytical curves — all geometry is mesh. Choose segment count, not curve form.
- \`primitives.circle({ segments })\`, \`primitives.cylinder({ segments })\`, \`extrusions.extrudeRotate({ segments })\` — segments ≈ \`max(16, π · diameter / 0.3)\` for visible parts.
- Prefer \`extrudeRotate\` or \`extrudeLinear\` over hand-built polygon-from-points loops when the profile has a regular form.`,

  fileLayoutMode: 'full-nesting',
  canonicalExample,

  topLevelExportExample: 'export default function main(p = defaultParams): Geom3 { return makePart(p); }',

  multiFileExample: {
    mainFile: 'main.ts',
    files: [
      { path: 'main.ts', content: multiFileMain },
      { path: 'lib/widget.ts', content: multiFileLibWidget },
    ],
  },
};
