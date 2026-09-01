import { kclStdlibReference } from '@taucad/api-extractor/kcl-reference';
import type { KernelConfig } from '#api/chat/prompts/kernel-prompt-configs/kernel.prompt.config.types.js';
import canonicalExample from '#api/chat/prompts/kernel-prompt-configs/zoo.prompt.example.kcl?raw';
import multiFileMain from '#api/chat/prompts/kernel-prompt-configs/zoo.prompt.example-multifile/main.kcl?raw';
import multiFileWidget from '#api/chat/prompts/kernel-prompt-configs/zoo.prompt.example-multifile/widget.kcl?raw';

export const zooConfig: KernelConfig = {
  fileExtension: '.kcl',
  languageName: 'KCL',

  codeStandards: `Output KCL syntax. Use camelCase for variables. Start with \`@settings(defaultLengthUnit = mm)\`. Use pipe operators (\`|>\`) for operation chaining.

<kcl_stdlib_reference>
${kclStdlibReference}
</kcl_stdlib_reference>`,

  commonErrorPatterns: 'missing pipe operators, unclosed sketches, undefined variables, invalid geometric parameters',

  topologyHints: `- Curves: \`arc\`, \`tangentialArc\`, \`arcTo\`, \`tangentialArcTo\`, \`bezierCurve\`, \`circle\`, \`ellipse\`. Prefer \`tangentialArc\` when the next segment must continue smoothly.
- Pipe operator chains keep the analytical structure visible — do not break a smooth chain into multiple sketches just to compute intermediate values.
- Tessellation is handled by the runtime — do not expose it as a parameter.`,

  fileLayoutMode: 'assembly-only',
  canonicalExample,

  topLevelExportExample: 'part = startSketchOn(XY) |> ... |> extrude(length = 10)',

  multiFileExample: {
    mainFile: 'main.kcl',
    files: [
      { path: 'main.kcl', content: multiFileMain },
      { path: 'widget.kcl', content: multiFileWidget },
    ],
  },
};
