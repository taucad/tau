/**
 * The one source of the texts hosts and registries show for the plugin: both host manifests, the development
 * catalog and `package.json` must equal these (`plugin-root.test.ts`), and the taucad/marketplace catalogs are
 * copied from them by hand because that repository has no build.
 *
 * Claude Code prints a catalog entry's `description` whole in `/plugin` and `plugin list --available --json`;
 * Codex shows only the manifest `interface`, whose `shortDescription` allows 30 characters.
 *
 * @module
 */

/** The plugin `description` of both manifests and of every catalog's `tau` entry. @internal */
export const pluginDescription =
  'Code-CAD for coding agents: build replicad, OpenSCAD, JSCAD, Manifold, PicoVoxel, SMLib, tscircuit, build123d, SMLibPy and PicoGK models, check them with GeoSpec tests, screenshot them and export STEP, STL, 3MF or glTF. Needs Node.js 24 and the Tau CLI: npm install -g @taucad/cli@beta.';

/** The `description` of the published taucad marketplace itself, beside its `tau` entry. @internal */
export const marketplaceDescription =
  'Claude Code and Codex marketplace for the Tau code-CAD plugin: the tau MCP server and kernel skills, installed from npm as @taucad/agent-plugin.';

/** The Codex `interface.shortDescription`, at most 30 characters. @internal */
export const codexShortDescription = 'Code-CAD you can see and test';

/** The Codex `interface.longDescription`. @internal */
export const codexLongDescription =
  'Author parametric CAD in replicad, OpenSCAD, JSCAD, Manifold, PicoVoxel, SMLib, tscircuit, build123d, SMLibPy or PicoGK, then let Tau evaluate it, run its GeoSpec geometry tests, render screenshots and export STEP, STL, 3MF or glTF from your project folder. Needs Node.js 24 and the Tau CLI: npm install -g @taucad/cli@beta.';

/** The Codex `interface.defaultPrompt` entries. @internal */
export const codexDefaultPrompts: readonly string[] = [
  'Model a parametric wall bracket in replicad and show me a screenshot.',
  'Run the GeoSpec tests for this Tau project and fix what fails.',
  'Export main.ts as STEP and tell me where the file is.',
];

/** The `keywords` of both manifests. @internal */
export const pluginKeywords: readonly string[] = [
  'cad',
  '3d',
  'mcp',
  'replicad',
  'openscad',
  'jscad',
  'manifold',
  'picovoxel',
  'smlib',
  'tscircuit',
  'build123d',
  'smlibpy',
  'picogk',
  'geospec',
  'step',
  'stl',
  '3mf',
  '3d-printing',
];

/** The npm `description` in `package.json`. @internal */
export const packageDescription =
  'Tau code-CAD plugin for Claude Code and Codex: the tau MCP server launcher and kernel skills (replicad, OpenSCAD, JSCAD, Manifold, PicoVoxel, SMLib, tscircuit, build123d, SMLibPy, PicoGK).';
