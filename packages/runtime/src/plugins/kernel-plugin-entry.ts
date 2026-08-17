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
export { loadBinaryFile } from '#kernels/kernel-module-helpers.js';
export { createEmptyGlb, createEmptyGltf, createEmptyGltfGeometry } from '#utils/glb-writer.js';
export { formatShapeName } from '#utils/shape-names.js';
export { convertOffToGltf } from '#utils/off-to-gltf.js';
export { canonicalizeOffWithManifold, convertOffToManifoldGltf } from '#utils/off-manifold-canonicalizer.js';
export type { ConvertOffToManifoldGltfOptions } from '#utils/off-manifold-canonicalizer.js';
export { asBuffer } from '@taucad/utils/file';
export { hashString, sha256Bytes, sha256String } from '@taucad/utils/hash';
export { resolveImportPath } from '@taucad/utils/import';
export { joinPath, resolveVirtualPath } from '@taucad/utils/path';
export { coordinateSystemSchema, unitSchema } from '#types/export-option-schemas.js';
export type { CoordinateSystemOptions, UnitOptions } from '#types/export-option-schemas.js';
