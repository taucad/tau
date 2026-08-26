/**
 * `@taucad/openrscad` — CAD kernel for `@taucad/runtime`.
 *
 * @public
 * @module
 */

/* oxlint-disable no-barrel-files/no-barrel-files -- public package entry */
export { openrscad, openrscad as plugin } from '#openrscad.plugin.js';
export {
  createOpenrscadKernel,
  openrscadKernel,
  openrscadRenderSchema,
  openrscadExportSchemas,
} from '#openrscad.kernel.js';
export type { CreateOpenrscadKernelOptions } from '#openrscad.kernel.js';
