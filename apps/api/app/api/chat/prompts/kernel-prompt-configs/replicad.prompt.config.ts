import { replicadTypes as replicadTypesMap } from '@taucad/api-extractor/kernel-types';
import type { KernelConfig } from '#api/chat/prompts/kernel-prompt-configs/kernel.prompt.config.types.js';
import canonicalExample from '#api/chat/prompts/kernel-prompt-configs/replicad.prompt.example.ts?raw';
import multiShapeExample from '#api/chat/prompts/kernel-prompt-configs/replicad.prompt.example-multishape.ts?raw';
import multiFileMain from '#api/chat/prompts/kernel-prompt-configs/replicad.prompt.example-multifile/main.ts?raw';
import multiFileLibWidget from '#api/chat/prompts/kernel-prompt-configs/replicad.prompt.example-multifile/lib/widget.ts?raw';

const replicadTypes = Object.values(replicadTypesMap).join('\n\n');

export const replicadConfig: KernelConfig = {
  fileExtension: '.ts',
  languageName: 'Replicad',

  codeStandards: `Output TypeScript with ES module imports. Use camelCase for variables. Export \`defaultParams\` object and default \`main(params)\` function returning geometry.

<replicad_api>
${replicadTypes}
</replicad_api>`,

  commonErrorPatterns:
    'invalid dimensions, self-intersecting geometry, unclosed sketches, failed boolean operations on coincident surfaces, polyline curves where splines or analytical arcs are available',

  topologyHints: `- Curves: \`drawLine\`, \`drawArc\`, \`drawTangentArc\`, \`drawCircle\`, \`drawEllipse\`, \`drawBezierCurve\`, \`drawSplineCurve\` (interpolating B-spline through provided points).
- For involutes/airfoils/spirals/cycloids: sample the form into ~8 control points, then \`drawSplineCurve(points)\`. For arcs: \`drawArc\` / \`drawCircle\`. Never chain straight segments where an arc or spline fits.
- Tessellation (linearDeflection, angularDeflection) is set at export time by the runtime — do not parameterise it in \`defaultParams\`.`,

  fileLayoutMode: 'full-nesting',
  canonicalExample,
  multiShapeExample,

  topLevelExportExample: 'export default function main(p = defaultParams): Shape3D { return makePart(p); }',

  multiFileExample: {
    mainFile: 'main.ts',
    files: [
      { path: 'main.ts', content: multiFileMain },
      { path: 'lib/widget.ts', content: multiFileLibWidget },
    ],
  },
};
