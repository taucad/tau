import type { Dependency } from '#types/runtime-dependency.types.js';
import type { KernelIssue, KernelResult } from '#types/runtime.types.js';
import type { KernelOffers } from '#types/runtime-kernel-v2.types.js';
import type { RuntimeContentInput } from '#types/runtime-content.types.js';
import type { RuntimeFileLocator } from '#types/runtime-file.types.js';

/** Exact content-free input passed to the terminal kernel create hook. @public */
export type NativeBuildInput = {
  readonly entryPath: string;
  readonly parameters: Record<string, unknown>;
} & ({ readonly options: Record<string, unknown> } | { readonly options?: never });

/** Replay identity shared with middleware cache implementations. @public */
export const nativeBuildInputSymbol: unique symbol = Symbol('nativeBuildInput');

/** The replay carrier; its symbol property is runtime-owned. @public */
export type NativeBuildInputCarrier = {
  /** @internal */
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
  kind: 'request';
  file: RuntimeFileLocator;
  binding?: KernelBinding<KernelHandle>;
};

/**
 * Live native kernel handle tagged with the render identity that produced it.
 * @public
 */
export type NativeHandleSlot = {
  /** Stable evaluation identity; the handle payload itself need not be unique or defined. */
  evaluationId: number;
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
  evaluationId: number;
  identityKey: string;
  kernelId: string | undefined;
  kernelVersion: string | undefined;
  serializedNativeHandle: unknown;
};

/** One admitted evaluation, independent of any projection rendered from it. @public */
export type EvaluationSlot = {
  readonly id: number;
  readonly identityKey: string;
  readonly owner: OperationOwner;
  /** The exact terminal input after evaluate middleware, for safe replay and reuse. */
  nativeBuildInput?: NativeBuildInput;
  offers?: KernelOffers;
  issues?: KernelIssue[];
  /** Terminal kernel output retained before response middleware transforms it. */
  terminalOffers?: KernelOffers;
  terminalIssues?: KernelIssue[];
  hasHandle: boolean;
  handle: unknown;
  liveNativeHandleSlot?: NativeHandleSlot;
  serializedNativeHandleSlot?: SerializedNativeHandleSlot;
};

/**
 * Evaluation result held beside native-handle slots. View artifacts are
 * produced separately by the selected view render operation.
 * @public
 */
export type MaterializedRenderResult = KernelResult<undefined>;

/**
 * Materialized evaluation plus native handles available for views and exports.
 * @public
 */
export type MaterializedRender = {
  identity: RenderIdentity;
  owner: OperationOwner;
  result: MaterializedRenderResult;
  evaluationSlot?: EvaluationSlot;
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
  /** Every path discovery named, resolved or not: a change to any of them can change the set. */
  readonly paths: ReadonlySet<string>;
};

/**
 * One middleware execution list's declared dependencies plus the watch paths those declarations
 * name. The paths travel with the cached dependencies so a cache hit still arms the same watch.
 * @public
 */
export type MiddlewareDependencySet = {
  readonly dependencies: Dependency[];
  /** Declared watch path to its debounce tier, in declaration order. */
  readonly watchPaths: ReadonlyMap<string, number>;
};

export type DependencyResolutionContext = {
  /** Kernel/file/framework dependencies shared by parameter and geometry phases. */
  commonDependencies?: Promise<CommonDependencySet>;
  /** Phase-specific middleware dependencies keyed by the concrete execution list. */
  middlewareDependenciesByExecutionList?: Map<string, Promise<MiddlewareDependencySet>>;
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
export function createNativeHandleIdentityKey(
  identity: Pick<RenderIdentity, 'file' | 'selectedKernelId' | 'selectedKernelVersion' | 'nativeHandleKey'>,
): string {
  return JSON.stringify([
    identity.file.path,
    identity.file.filename,
    identity.selectedKernelId ?? '<no-kernel>',
    identity.selectedKernelVersion ?? '<no-version>',
    identity.nativeHandleKey,
  ]);
}
