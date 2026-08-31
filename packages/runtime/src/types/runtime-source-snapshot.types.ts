import type { KernelProviderId, KernelResult } from '#types/runtime.types.js';

/** Semantic ownership of one file selected by a runtime source snapshot. @public */
export type RuntimeSourceSnapshotFileRole = 'entry' | 'kernel-dependency' | 'middleware-dependency' | 'additional';

/** One coherent runtime source file with owned bytes and exact content hash. @public */
export type RuntimeSourceSnapshotFile = {
  readonly path: string;
  readonly content: Uint8Array<ArrayBuffer>;
  readonly sha256: string;
  readonly role: RuntimeSourceSnapshotFileRole;
};

/** Successful runtime source-closure snapshot data. @public */
export type RuntimeSourceSnapshotData = {
  readonly entryPath: string;
  readonly files: readonly RuntimeSourceSnapshotFile[];
  readonly unresolvedPaths: readonly string[];
  readonly kernelId: KernelProviderId;
};

/** Result of collecting a runtime source closure without computing geometry. @public */
export type RuntimeSourceSnapshotResult = KernelResult<RuntimeSourceSnapshotData>;
