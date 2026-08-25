/* oxlint-disable no-barrel-files/no-barrel-files -- public package entry */
// eslint-disable-next-line import-x/no-extraneous-dependencies -- package-import self-reference resolves this package's source alias.
export { opencascadeNative, opencascadeNative as plugin } from '#opencascade-native.plugin.js';

// eslint-disable-next-line import-x/no-extraneous-dependencies -- package-import self-reference resolves this package's source alias.
export {
  opencascadeNativeKernel,
  opencascadeNativeDetectPattern,
  opencascadeNativeModuleName,
  normalizeSolids,
  toModelApi,
} from '#opencascade-native.kernel.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- package-import self-reference resolves this package's source alias.
export type { OpencascadeNativeModule } from '#opencascade-native.kernel.js';

// eslint-disable-next-line import-x/no-extraneous-dependencies -- package-import self-reference resolves this package's source alias.
export { loadNativeBackend, OpencascadeNativeUnavailableError } from '#opencascade-native-backend.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- package-import self-reference resolves this package's source alias.
export type {
  NativeBinding,
  NativeMesh,
  NativeMetrics,
  NativeProfile,
  NativeSolid,
  NativeTessellation,
} from '#opencascade-native-backend.js';

// eslint-disable-next-line import-x/no-extraneous-dependencies -- package-import self-reference resolves this package's source alias.
export { opencascadeNativeExportSchemas, opencascadeNativeOptionsSchema } from '#opencascade-native.schemas.js';
