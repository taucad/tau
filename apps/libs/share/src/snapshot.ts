/** Role of a file in a portable Tau project snapshot. @public */
export type ShareSnapshotFileRole = 'entry' | 'kernel-dependency' | 'middleware-dependency' | 'project-metadata';

/** One selected project file with owned bytes. @public */
export type ShareSnapshotFile = {
  readonly path: string;
  readonly content: Uint8Array<ArrayBuffer>;
  readonly sha256: string;
  readonly role: ShareSnapshotFileRole;
};

/** Non-blocking source-closure diagnostic safe to present to a recipient. @public */
export type ShareSnapshotWarning = {
  readonly code: string;
  readonly message: string;
};

/** Provider-neutral, relevant project snapshot collected before publication. @public */
export type ShareProjectSnapshot = {
  readonly entryPath: string;
  readonly files: readonly ShareSnapshotFile[];
  readonly warnings: readonly ShareSnapshotWarning[];
};
