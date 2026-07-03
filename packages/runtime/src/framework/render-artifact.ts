import type { GeometryFile } from '@taucad/types';
import type { Dependency } from '#types/runtime-dependency.types.js';
import type { HashedGeometryResult } from '#types/runtime.types.js';

/**
 * Stable identity for one render request and its dependency graph.
 * @public
 */
export type RenderIdentity = {
  file: GeometryFile;
  projectRootPath: string;
  selectedKernelId: string | undefined;
  selectedKernelVersion: string | undefined;
  parameters: Record<string, unknown>;
  renderOptions: Record<string, unknown>;
  dependencies: Dependency[];
  dependencyHash: string;
};

/**
 * File-scoped kernel selection captured as operation data.
 * @public
 */
export type KernelBinding<KernelHandle = unknown> = {
  kernelId: string;
  kernelVersion: string;
  filePath: string;
  kernel?: KernelHandle;
};

/**
 * Explicit owner for kernel-bound runtime work.
 * @public
 */
export type OperationOwner<KernelHandle = unknown> = {
  kind: 'render-artifact' | 'request';
  file: GeometryFile;
  projectRootPath: string;
  binding?: KernelBinding<KernelHandle>;
};

/**
 * Live native kernel handle tagged with the render identity that produced it.
 * @public
 */
export type NativeHandleSlot = {
  identityKey: string;
  kernelId: string | undefined;
  kernelVersion: string | undefined;
  handle: unknown;
};

/**
 * Durable serialized native handle tagged with the render identity that produced it.
 * @public
 */
export type SerializedNativeHandleSlot = {
  identityKey: string;
  kernelId: string | undefined;
  kernelVersion: string | undefined;
  serializedNativeHandle: unknown;
};

/**
 * Materialized render output plus any native export artifacts available for the same identity.
 * @public
 */
export type MaterializedRender = {
  identity: RenderIdentity;
  owner: OperationOwner;
  result: HashedGeometryResult;
  liveNativeHandleSlot?: NativeHandleSlot;
  serializedNativeHandleSlot?: SerializedNativeHandleSlot;
};

/**
 * Per-operation dependency-resolution scratchpad shared across parameter and geometry phases.
 * @public
 */
export type DependencyResolutionContext = {
  baseDependencies?: Dependency[];
};

/**
 * Create the comparison key used to match render artifacts to mutable native handles.
 * @param identity - Render identity to normalize.
 * @returns A stable comparison key for worker-local artifact matching.
 * @public
 */
export function createRenderIdentityKey(identity: RenderIdentity): string {
  return [
    identity.projectRootPath,
    identity.file.filename,
    identity.selectedKernelId ?? '<no-kernel>',
    identity.selectedKernelVersion ?? '<no-version>',
    identity.dependencyHash,
  ].join('|');
}
