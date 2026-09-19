/* oxlint-disable no-barrel-files/no-barrel-files -- public package entry */
export { opencascadeNative, opencascadeNative as plugin } from '#opencascade-native.plugin.js';

export {
  opencascadeNativeKernel,
  opencascadeNativeDetectPattern,
  opencascadeNativeModuleName,
  normalizeSolids,
  toModelApi,
} from '#opencascade-native.kernel.js';
export type { OpencascadeNativeModule } from '#opencascade-native.kernel.js';

export { loadNativeBackend, OpencascadeNativeUnavailableError } from '#opencascade-native-backend.js';
export type {
  NativeBinding,
  NativeMesh,
  NativeMetrics,
  NativeProfile,
  NativeSolid,
  NativeTessellation,
} from '#opencascade-native-backend.js';

export { opencascadeNativeExportSchemas, opencascadeNativeOptionsSchema } from '#opencascade-native.schemas.js';
