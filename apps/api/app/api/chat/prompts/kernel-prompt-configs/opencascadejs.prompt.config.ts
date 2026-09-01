import type { KernelConfig } from '#api/chat/prompts/kernel-prompt-configs/kernel.prompt.config.types.js';
import canonicalExample from '#api/chat/prompts/kernel-prompt-configs/opencascadejs.prompt.example.ts?raw';
import multiFileMain from '#api/chat/prompts/kernel-prompt-configs/opencascadejs.prompt.example-multifile/main.ts?raw';
import multiFileLibWidget from '#api/chat/prompts/kernel-prompt-configs/opencascadejs.prompt.example-multifile/lib/widget.ts?raw';

export const opencascadejsConfig: KernelConfig = {
  fileExtension: '.ts',
  languageName: 'OpenCascade.js',

  codeStandards: `Output TypeScript with \`import { ClassName } from 'opencascade.js'\` using named imports. Export \`defaultParams\` and a default \`main(params)\` function returning a \`TopoDS_Shape\`. Always call \`.delete()\` on OCCT objects in a \`finally\` block to prevent memory leaks.`,

  commonErrorPatterns:
    'memory leaks from missing .delete() calls, wrong constructor overload suffix (e.g. _2 vs _3), unfreed gp_Pnt/gp_Dir temporaries, using Shape() before Build()',

  topologyHints: `- Curves: \`GC_MakeArcOfCircle\`, \`Geom_Circle\`, \`Geom_BSplineCurve\`, \`Geom2dAPI_PointsToBSpline\` (for data-driven fits), \`BRepBuilderAPI_MakeEdge\` from a \`Geom\`-curve. Never chain \`BRepBuilderAPI_MakePolygon\` for what is a single analytical edge.
- Profile sketches: build wires from analytical edges, not polylines. Close every wire explicitly.
- Tessellation runs at export time via \`BRepMesh_IncrementalMesh\` — do not parameterise it in \`defaultParams\`.
- Memory: always \`.delete()\` intermediate \`gp_*\`, \`Geom*\`, \`BRep*\`, \`TopoDS_*\` handles in a finally block.`,

  fileLayoutMode: 'full-nesting',
  canonicalExample,

  topLevelExportExample: 'export default function main(p = defaultParams): TopoDS_Shape { return makePart(p); }',

  multiFileExample: {
    mainFile: 'main.ts',
    files: [
      { path: 'main.ts', content: multiFileMain },
      { path: 'lib/widget.ts', content: multiFileLibWidget },
    ],
  },
};
