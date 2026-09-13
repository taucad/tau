import type { KernelConfig } from '#api/chat/prompts/kernel-prompt-configs/kernel.prompt.config.types.js';
import canonicalExample from '#api/chat/prompts/kernel-prompt-configs/openscad.prompt.example.scad?raw';
import multiFileMain from '#api/chat/prompts/kernel-prompt-configs/openscad.prompt.example-multifile/main.scad?raw';
import multiFileLibWidget from '#api/chat/prompts/kernel-prompt-configs/openscad.prompt.example-multifile/lib/widget.scad?raw';

export const openscadConfig: KernelConfig = {
  fileExtension: '.scad',
  languageName: 'OpenSCAD',

  codeStandards: `Output executable OpenSCAD code. Use snake_case for variables (e.g., \`grip_diameter\`). Define modules for reusable geometry. Use hex colors (e.g., \`color("#8B5A2B")\`). Multi-select: \`children([0:2])\` for geometry, \`select(vec, [indices])\` for data.`,

  commonErrorPatterns:
    'missing semicolons, undefined variables, invalid dimensions (must be positive), unclosed modules, $fn baked globally instead of $fa/$fs adaptive tessellation, hull()/minkowski() used as stand-ins for loft or rotate_extrude',

  topologyHints: `- No analytical curves — mesh kernel. Choose \`$fn\` / \`$fa\` / \`$fs\`, not curve form.
- Prefer adaptive tessellation globally: \`$fa = 2; $fs = 0.4;\` at the top of \`main.scad\`. Set \`$fn\` locally only when a specific feature needs an exact count (e.g. hex sockets).
- Avoid \`$fn > 64\` on small features; the kernel will tessellate to the export deliverable independently.
- \`hull()\` and \`minkowski()\` are correct for genuine convex-hull and offset operations and catastrophic as stand-ins for loft or \`rotate_extrude\`.
- Use \`for\`-loops into a single sketch then \`extrude\` once, not \`union()\` of N pre-positioned children.
- \`render()\` forces eager CGAL/Manifold lifting — apply only to reused sub-trees, never to leaves.`,

  fileLayoutMode: 'full-nesting',
  canonicalExample,

  topLevelExportExample: 'myModule();',

  multiFileExample: {
    mainFile: 'main.scad',
    files: [
      { path: 'main.scad', content: multiFileMain },
      { path: 'lib/widget.scad', content: multiFileLibWidget },
    ],
  },
};
