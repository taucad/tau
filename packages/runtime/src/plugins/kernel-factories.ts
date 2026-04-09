/* oxlint-disable no-barrel-files/no-barrel-files -- kernel factory re-exports */

/**
 * Consumer-facing kernel plugin factory functions.
 *
 * Each kernel owns its registration metadata in a co-located `*.plugin.ts` file.
 * This module re-exports all kernel factories for public consumption.
 */

export { replicad } from '#kernels/replicad/replicad.plugin.js';
export { opencascade } from '#kernels/opencascade/opencascade.plugin.js';
export { zoo } from '#kernels/zoo/zoo.plugin.js';
export { openscad } from '#kernels/openscad/openscad.plugin.js';
export { jscad } from '#kernels/jscad/jscad.plugin.js';
export { manifold } from '#kernels/manifold/manifold.plugin.js';
export { tau } from '#kernels/tau/tau.plugin.js';
export { buerli } from '#kernels/buerli/buerli.plugin.js';
