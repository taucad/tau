/* oxlint-disable no-barrel-files/no-barrel-files -- public package entry */
export { smlibpy, smlibpy as plugin } from '#smlibpy.plugin.js';

export { smlibpyKernel } from '#smlibpy.kernel.js';
export type { SmlibpyNativeHandle } from '#smlibpy.kernel.js';
export { smlibpyDetectPattern, smlibpyModuleName } from '#smlibpy.constants.js';
export {
  smlibpyClosureSchema,
  smlibpyExportSchemas,
  smlibpyOptionsSchema,
  smlibpyRenderSchema,
} from '#smlibpy.schemas.js';
export { sealSmlibpyClosure, smlibpyLaunchSet, smlibpyOptionsFromClosure } from '#smlibpy-closure.js';
export type { SmlibpyClosureOptions } from '#smlibpy-closure.js';
export { smlibpyNative } from '#native.js';
