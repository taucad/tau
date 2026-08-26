import type { Geometry } from '@taucad/types';
import type { Dependency } from '#types/runtime-dependency.types.js';
import type { KernelResult } from '#types/runtime.types.js';
import type { RuntimeContentInput } from '#types/runtime-content.types.js';
import type { RuntimeFileLocator } from '#types/runtime-file.types.js';

/** Exact content-free input passed to the terminal kernel create hook. @public */
export type NativeBuildInput = {
  readonly entryPath: string;
  readonly parameters: Record<string, unknown>;
} & ({ readonly options: Record<string, unknown> } | { readonly options?: never });

/** Private result carrier used to preserve exact replay input through middleware and caches. @public */
export const nativeBuildInputSymbol: unique symbol = Symbol('nativeBuildInput');

/** @public */
export type NativeBuildInputCarrier = {
  readonly [nativeBuildInputSymbol]?: NativeBuildInput;
};

/**
 * Stable identity for one render request and its dependency graph.
 * @public
 */
export type RenderIdentity = {
  file: RuntimeFileLocator;
  selectedKernelId: string | undefined;
  selectedKernelVersion: string | undefined;
  parameters: Record<string, unknown>;
  renderOptions: Record<string, unknown>;
  content: RuntimeContentInput;
  /** Exact terminal kernel input used to replay native construction after snapshot restoration failure. */
  nativeBuildInput?: NativeBuildInput;
  dependencies: Dependency[];
  dependencyHash: string;
  /** Exact create-input key for the reusable native handle/create-cache entry. */
  nativeHandleKey: string;
};

/**
 * File-scoped kernel selection captured for one request.
 * @public
 */
export type KernelBinding<KernelHandle = unknown> = {
  kernelId: string;
  kernelVersion: string;
  entryPath: string;
  kernel?: KernelHandle;
};

/**
 * Explicit owner for kernel-bound runtime work.
 * @public
 */
export type OperationOwner<KernelHandle = unknown> = {
  kind: 'render-artifact' | 'request';
  file: RuntimeFileLocator;
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
 * Render result held by a materialized render artifact.
 *
 * `data` is `undefined` only for export-scoped materializations (`publish: false`)
 * of kernels that defer their display artifact to the `meshGeometry` phase — the
 * export path consumes the native-handle slots, never the display geometry.
 * Published (display) artifacts always carry `data`; the orchestrator enforces
 * the display-path invariant before publishing.
 * @public
 */
export type MaterializedRenderResult = KernelResult<Geometry | undefined>;

/**
 * Materialized render output plus any native export artifacts available for the same identity.
 * @public
 */
export type MaterializedRender = {
  identity: RenderIdentity;
  owner: OperationOwner;
  result: MaterializedRenderResult;
  liveNativeHandleSlot?: NativeHandleSlot;
  serializedNativeHandleSlot?: SerializedNativeHandleSlot;
};

/**
 * Per-operation dependency-resolution scratchpad shared across parameter and geometry phases.
 * @public
 */
export type CommonDependencySet = {
  readonly fileDependencies: Dependency[];
  readonly trailingDependencies: Dependency[];
};

export type DependencyResolutionContext = {
  /** Kernel/file/framework dependencies shared by parameter and geometry phases. */
  commonDependencies?: Promise<CommonDependencySet>;
  /** Phase-specific middleware dependencies keyed by the concrete execution list. */
  middlewareDependenciesByExecutionList?: Map<string, Promise<Dependency[]>>;
};

/**
 * Create the comparison key used to match render artifacts to mutable native handles.
 * @param identity - Render identity to normalize.
 * @returns A stable comparison key for worker-local artifact matching.
 * @public
 */
export function createRenderIdentityKey(identity: RenderIdentity): string {
  return [
    identity.file.path,
    identity.file.filename,
    identity.selectedKernelId ?? '<no-kernel>',
    identity.selectedKernelVersion ?? '<no-version>',
    identity.dependencyHash,
  ].join('|');
}

/**
 * Create the comparison key used only for native-handle compatibility.
 * @param identity - Render identity carrying the precomputed exact native-build key.
 * @returns Stable key for live and serialized native-handle slots.
 * @public
 */
export function createNativeHandleIdentityKey(identity: RenderIdentity): string {
  return [
    identity.file.path,
    identity.file.filename,
    identity.selectedKernelId ?? '<no-kernel>',
    identity.selectedKernelVersion ?? '<no-version>',
    identity.nativeHandleKey,
  ].join('|');
}
