import type { ProjectManifest } from '@taucad/project-core';

/** Complete editable project metadata and lazily acquired source files. @public */
export type WarehousePart = {
  readonly locator: string;
  readonly kernel: string;
  readonly manifest: ProjectManifest;
  readonly thumbnailUrl?: string;
  readonly assets: ReadonlyArray<{
    readonly path: string;
    readonly load: () => Promise<Uint8Array<ArrayBuffer>>;
  }>;
};
