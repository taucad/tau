/**
 * Buerli (ClassCAD) kernel plugin registration.
 *
 * Encapsulates all kernel metadata: id, extensions, detect pattern,
 * builtin module names, and module URL resolution.
 * Uses WASM-only variant — no WebSocket connections.
 */

import { createKernelPlugin } from '#plugins/plugin-helpers.js';
import type { BuerliOptions } from '#kernels/buerli/buerli.kernel.js';

/**
 * Canonical regex for detecting @buerli.io/classcad usage in source code.
 *
 * Branches: ESM import, CJS require, dynamic import().
 * @public
 */
export const buerliDetectPattern =
  /import\s+.*from\s+["']@buerli\.io\/classcad["']|require\s*\(\s*["']@buerli\.io\/classcad["']\s*\)|import\s*\(\s*["']@buerli\.io\/classcad["']\s*\)/;

/**
 * Create a Buerli (ClassCAD) kernel plugin registration.
 *
 * @public
 */
export const buerli = createKernelPlugin<BuerliOptions>({
  id: 'buerli',
  moduleUrl: new URL('buerli.kernel.js', import.meta.url).href,
  extensions: ['ts', 'js'],
  detectImport: buerliDetectPattern,
  builtinModuleNames: ['@buerli.io/classcad'],
});
