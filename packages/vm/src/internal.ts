/* oxlint-disable no-barrel-files/no-barrel-files -- package-private compatibility surface for @taucad/runtime */
export {
  EsbuildBundler,
  clearExecuteCache,
  createDetectionPlugin,
  createVfsPlugin,
  executeCode,
  extractExternalImports,
  extractProjectDependencies,
  initializeEsbuild,
} from '#esbuild-core.js';
export { ModuleManager } from '#module-manager.js';
export {
  esbuildNamespace,
  httpFetchMaxSizeBytes,
  httpFetchTimeout,
  nodeExecFilePrefix,
  vfsNamespacePrefix,
} from '#esbuild.constants.js';
export type {
  BundleResult,
  BundlerOptions,
  DetectionPluginOptions,
  EsbuildBundlerContext,
  VfsPluginOptions,
} from '#esbuild-core.js';
export type { BuiltinModule, FetchedModule } from '#module-manager.js';
export type { VmExecuteResult } from '#types.js';
