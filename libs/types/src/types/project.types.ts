import type { ProjectManifest } from '@taucad/project-core';

/** Runtime project view with a separately resolved identity; never serialized directly. @public */
export type Project = ProjectManifest & { readonly id: string };

/** @public */
export type File = {
  content: Uint8Array<ArrayBuffer>;
  // Could add metadata in the future
  lastModified?: number;
  size?: number;
};
