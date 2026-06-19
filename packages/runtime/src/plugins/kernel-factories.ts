/* oxlint-disable no-barrel-files/no-barrel-files -- kernel factory re-exports */

/**
 * Consumer-facing kernel plugin factory functions.
 *
 * Each kernel implementation owns its registration metadata directly through
 * `defineKernel(...)`; this entry re-exports the callable factories.
 */

export { replicad } from '#kernels/replicad/replicad.kernel.js';
export { opencascade } from '#kernels/opencascade/opencascade.kernel.js';
export { zoo } from '#kernels/zoo/zoo.kernel.js';
export { jscad } from '#kernels/jscad/jscad.kernel.js';
export { manifold } from '#kernels/manifold/manifold.kernel.js';
export { tau } from '#kernels/tau/tau.kernel.js';
