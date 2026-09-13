/**
 * Denormalized creator snapshot persisted on publication rows for viewer reads (JSONB).
 */
export type PublicationOwnerSnapshot = {
  id: string;
  name: string;
  /** Avatar URL — omitted when absent. */
  image?: string;
};

/**
 * Stored publication visibility tier (`TEXT`).
 */
export type VisibilityTier = 'private' | 'public';

export type PublicationVisibility = VisibilityTier;

/**
 * Kernel identifiers inferred during publish for persistence (`TEXT[]`).
 * Mirrors `@taucad/runtime` kernel IDs (`KernelPlugin.id`).
 */
export type PublicationKernelId = string;

export type PublicationRecord = {
  id: string;
  projectId: string;
  ownerId: string;
  parentPublicationId?: string;
  visibility: PublicationVisibility;
  manifestKey: string;
  ogImageKey?: string;
  thumbnailKey?: string;
  runtimePin: string;
  kernels: PublicationKernelId[];
  entryFile: string;
  title: string;
  description?: string;
  forkCount: number;
  viewCount: number;
  ownerSnapshot?: PublicationOwnerSnapshot;
  createdAt: Date;
  unpublishedAt?: Date;
};
