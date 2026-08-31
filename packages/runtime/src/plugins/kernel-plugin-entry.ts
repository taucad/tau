// oxlint-disable no-barrel-files/no-barrel-files -- package entry path
/**
 * Public author surface for kernels living outside `@taucad/runtime`.
 *
 * Out-of-tree kernels (e.g. `@taucad/openrscad`) consume this entry instead
 * of reaching into the runtime's `#`-prefixed internals. The surface is
 * intentionally minimal: defineKernel, the lifecycle types it touches, and
 * a couple of pure helpers that every existing first-party kernel already
 * depends on.
 *
 * @module
 * @public
 */

export { defineKernel } from '#types/runtime-kernel.types.js';
export type {
  AnyKernelDefinition,
  CreateGeometryInput,
  CreateGeometryOutput,
  ExportGeometryInput,
  GetDependenciesInput,
  GetParametersInput,
  InitializeInput,
  KernelDefinition,
  KernelFileSystem,
  KernelPluginFactory,
  KernelRuntime,
  RuntimeFileSystemBase,
  RuntimeLogger,
  RuntimeLogOptions,
  RuntimeWatchEvent,
  RuntimeWatchRequest,
} from '#types/runtime-kernel.types.js';
export type { GetDependenciesResult } from '#types/runtime-dependency.types.js';

export type {
  CreateGeometryResult,
  ErrorLocation,
  ExportGeometryResult,
  GetParametersResult,
  KernelErrorResult,
  KernelIssue,
  KernelIssueType,
  KernelStackFrame,
  KernelSuccessResult,
} from '#types/runtime.types.js';

export type { KernelPlugin } from '#plugins/plugin-types.js';
export {
  finalizeMeshOutput,
  finalizeRenderOutput,
  RenderArtifactFinalizationError,
} from '#framework/render-artifact-finalizer.js';
export type { MeshArtifactFinalizerInput, RenderArtifactFinalizerInput } from '#framework/render-artifact-finalizer.js';
export { createKernelError, createKernelSuccess } from '#kernels/kernel-helpers.js';
export {
  convertRawIssuesToKernelIssues,
  createKernelModuleRegistryExpression,
  createKernelModuleShim,
  enrichIssueLocation,
  extractDefaultParameters,
  getModuleRegistry,
  isRecordObject,
  KERNEL_MODULES_KEY,
  loadBinaryFile,
  registerKernelModule,
  toVmEntryPath,
} from '#kernels/kernel-module-helpers.js';
export type { RuntimeModuleExports } from '#kernels/kernel-module-helpers.js';
export { checkAbort } from '#framework/cooperative-abort.js';
export { named } from '#framework/named.js';
export { getWebAssemblyExceptionConstructor, isWebAssemblyException } from '#framework/wasm-exception.js';
export type { WebAssemblyException } from '#framework/wasm-exception.js';
export {
  createFrameClassifier,
  classifyLibraryFrames,
  demangleStackFrames,
  deriveLocationFromFrames,
  applyLibrarySourceMaps,
  parseStackTrace,
  preserveExportNames,
  resolveSourcePath,
} from '#framework/error-enrichment.js';
export { createKernelLibraryTracer, defineLibraryTracePolicy } from '#framework/kernel-library-tracing.js';
export type { KernelLibraryTraceHandle, KernelLibraryTraceMode } from '#framework/kernel-library-tracing.js';
export { isNode, resolveFileUrl } from '#framework/environment.js';
export { withoutEmscriptenProcessListeners } from '#framework/emscripten-listeners.js';
export { compileWasmStreaming } from '#framework/wasm-loader.js';
export { resolveWasmUrl } from '#framework/wasm-url.js';
export type { MaterializedRender } from '#framework/render-artifact.js';
export { isNotFoundError } from '#filesystem/filesystem-errors.js';
export { asBuffer } from '@taucad/utils/file';
export { hashString, sha256Bytes, sha256String } from '@taucad/utils/hash';
export { resolveImportPath } from '@taucad/utils/import';
export { assertRootedPath, joinRelativePath, resolveRootedPath } from '@taucad/utils/path';
export { jsonSchemaFromJson } from '@taucad/utils/schema';
export { Topic } from '@taucad/events';
export type { TopicOptions, TopicSubscribeOptions, TopicSubscription } from '@taucad/events';
export { coordinateSystemSchema, gltfExportConventionSchema, unitSchema } from '#types/export-option-schemas.js';
export type { CoordinateSystemOptions, UnitOptions } from '#types/export-option-schemas.js';
