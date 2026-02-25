/**
 * Consumer-facing kernel plugin factory functions.
 * Each factory returns a KernelPlugin registration object with resolved module URL.
 */

import { createKernelPlugin } from '#plugins/plugin-helpers.js';

/**
 * Replicad kernel options.
 */
export type ReplicadOptions = {
  /** Enable OpenCASCADE exception messages for detailed error feedback. Slower geometry computation when enabled. */
  withExceptions?: boolean;
  /** OC API call tracing mode. 'summary' (default) emits aggregated stats, 'per-call' emits individual spans. */
  ocTracing?: 'off' | 'summary' | 'per-call';
  /** Include Boundary Representation (BRep) edge lines in the generated GLTF geometry. Defaults to `false`. */
  withBrepEdges?: boolean;
};

/**
 * Zoo (KCL) kernel options.
 */
export type ZooOptions = {
  /** WebSocket base URL for the Zoo engine connection. Defaults to 'wss://api.zoo.dev'. */
  baseUrl?: string;
};

/**
 * TSCircuit kernel options.
 */
export type TscircuitOptions = {
  /** Include external 3D component models during Circuit JSON to GLTF conversion. */
  includeModels?: boolean;
  /** Disable parts-engine network fetches for deterministic/offline-friendly rendering. */
  partsEngineDisabled?: boolean;
};

/**
 * Create a Replicad kernel plugin registration.
 * Replicad is an OpenCASCADE-based parametric CAD kernel.
 *
 * @example
 * ```typescript
 * replicad({ withExceptions: true })
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
 * Create a TSCircuit kernel plugin registration.
 *
 * @example
 * ```typescript
 * tscircuit({ includeModels: false, partsEngineDisabled: true })
 * ```
 */
export const tscircuit = createKernelPlugin<TscircuitOptions>({
  id: 'tscircuit',
  moduleUrl: new URL('../kernels/tscircuit/tscircuit.kernel.js', import.meta.url).href,
  extensions: ['tsx', 'jsx', 'ts', 'js'],
  detectImport:
    /(?:import|export)\s+.*from\s+['"](?:@tscircuit\/core|tscircuit|@tsci\/[^'"]+)['"]|require\s*\(\s*['"](?:@tscircuit\/core|tscircuit|@tsci\/[^'"]+)['"]\s*\)|\bcircuit\.add\s*\(/s,
  builtinModuleNames: ['@tscircuit/core', 'tscircuit', '@tsci'],
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
