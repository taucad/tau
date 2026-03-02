/**
 * Consumer-facing kernel plugin factory functions.
 * Each factory returns a KernelPlugin registration object with resolved module URL.
 *
 * Option types are co-located with their kernel implementations and re-exported here.
 */

import { createKernelPlugin } from '#plugins/plugin-helpers.js';
import type { ReplicadOptions } from '#kernels/replicad/replicad.kernel.js';
import type { ZooOptions } from '#kernels/zoo/zoo.kernel.js';
import type { ManifoldOptions } from '#kernels/manifold/manifold.kernel.js';

/**
 * Create a Replicad kernel plugin registration.
 * Replicad is an OpenCASCADE-based parametric CAD kernel.
 *
 * @example
 * ```typescript
 * replicad()                                          // single WASM (~17 MB)
 * replicad({ wasm: 'single-exceptions' })               // exceptions WASM (~20 MB)
 * replicad({ wasm: { wasmUrl, wasmBindingsUrl } })    // custom build injection
 * ```
 */
export const replicad = createKernelPlugin<ReplicadOptions>({
  id: 'replicad',
  moduleUrl: new URL('../kernels/replicad/replicad.kernel.js', import.meta.url).href,
  extensions: ['ts', 'js'],
  detectImport: /import.*from\s+['"]replicad['"]/s,
  builtinModuleNames: ['replicad'],
});

/**
 * Create a Zoo (KCL) kernel plugin registration.
 * Zoo connects to the Zoo engine via WebSocket for KCL language support.
 *
 * @example
 * ```typescript
 * zoo({ baseUrl: 'wss://my-server/v1/kernels/zoo' })
 * ```
 */
export const zoo = createKernelPlugin<ZooOptions>({
  id: 'zoo',
  moduleUrl: new URL('../kernels/zoo/zoo.kernel.js', import.meta.url).href,
  extensions: ['kcl'],
});

/**
 * Create an OpenSCAD kernel plugin registration.
 *
 * @example
 * ```typescript
 * openscad()
 * ```
 */
export const openscad = createKernelPlugin({
  id: 'openscad',
  moduleUrl: new URL('../kernels/openscad/openscad.kernel.js', import.meta.url).href,
  extensions: ['scad'],
});

/**
 * Create a JSCAD kernel plugin registration.
 *
 * @example
 * ```typescript
 * jscad()
 * ```
 */
export const jscad = createKernelPlugin({
  id: 'jscad',
  moduleUrl: new URL('../kernels/jscad/jscad.kernel.js', import.meta.url).href,
  extensions: ['ts', 'js'],
  detectImport: /import\s+.*from\s+['"]@jscad\/modeling(\/[^'"]*)?['"]/,
  builtinModuleNames: ['@jscad/modeling'],
});

/**
 * Create a Manifold kernel plugin registration.
 *
 * @example
 * ```typescript
 * manifold()
 * ```
 */
export const manifold = createKernelPlugin<ManifoldOptions>({
  id: 'manifold',
  moduleUrl: new URL('../kernels/manifold/manifold.kernel.js', import.meta.url).href,
  extensions: ['ts', 'js'],
  detectImport: /import\s+.*from\s+['"]manifold-3d(\/[^'"]*)?['"]/,
  builtinModuleNames: ['manifold-3d', 'manifold-3d/manifoldCAD'],
});

/**
 * Create a Tau converter kernel plugin registration.
 * Tau is the catch-all kernel that handles STEP, STL, 3MF, and other import formats.
 *
 * @example
 * ```typescript
 * tau()
 * ```
 */
export const tau = createKernelPlugin({
  id: 'tau',
  moduleUrl: new URL('../kernels/tau/tau.kernel.js', import.meta.url).href,
  extensions: ['*'],
});
