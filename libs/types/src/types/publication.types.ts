import type { InviteEmailOutcome } from '#constants/invite-email.constants.js';

/**
 * Denormalized creator snapshot persisted on publication rows for viewer reads (JSONB).
 *
 * @public
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
/** @public */
export type VisibilityTier = 'private' | 'public';

/** @public */
export type PublicationVisibility = VisibilityTier;

/**
 * Kernel identifiers inferred during publish for persistence (`TEXT[]`).
 * Mirrors `@taucad/runtime` kernel IDs (`KernelPlugin.id`).
 */
/** @public */
export type PublicationKernelId = string;

/** @public */
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
  entryPath: string;
  title: string;
  description?: string;
  forkCount: number;
  viewCount: number;
  ownerSnapshot?: PublicationOwnerSnapshot;
  createdAt: Date;
  unpublishedAt?: Date;
};

/* oxlint-disable typescript-eslint/no-restricted-types -- the cloud link wire format uses null */

/**
 * One invited address on a private cloud link (`project_share_access`).
 *
 * @public
 */
export type ProjectShareAccessGrant = {
  /** `sga_<21>`. */
  id: string;
  recipientEmail: string;
  status: 'active' | 'revoked';
  createdAt: string;
  revokedAt: string | null;
  /** Mail to this recipient cannot be delivered; the reason is not disclosed. */
  notDelivered?: boolean;
};

/**
 * A project's one stable cloud link as its owner sees it: the `share` of
 * `GET /v1/projects/:id/share`, and the answer of `PATCH /v1/projects/:id/share`.
 *
 * @public
 */
export type ProjectShare = {
  /** `shr_<21>`, the reference in `/s/tau~shr_…`. */
  id: string;
  /** The link to copy, the same across publishes. */
  url: string;
  /** Who can open the link. */
  visibility: PublicationVisibility;
  /** `stopped` after Stop sharing; the next publish turns the same link back on. */
  status: 'active' | 'stopped';
  stoppedAt: string | null;
  /** When the link last changed what it shows. */
  publishedAt: string | null;
  /** The version the link shows. Compare `revisionId` with the head to tell whether there are unpublished changes. */
  currentVersion: { publicationId: string; tag: string; revisionId: string } | null;
  access: { grants: ProjectShareAccessGrant[] };
};

/**
 * `GET /v1/projects/:id/share`: the project and its link, `null` before its first publish.
 *
 * @public
 */
export type ProjectShareEnvelope = {
  project: { id: string; name: string | null; description: string | null };
  share: ProjectShare | null;
};

/**
 * `POST /v1/publications` answer: the version's id and links, the project's cloud link and the version's tag.
 *
 * @public
 */
export type PublishResponseBody = {
  id: string;
  urls: { view: string; share: string; og: string; thumbnail: string };
  share: { id: string; url: string; visibility: PublicationVisibility };
  version: { tag: string };
};

/**
 * `POST /v1/projects/:id/share/access` answer: the grant and what happened to its email.
 *
 * @public
 */
export type ProjectShareAccessInviteResponse = ProjectShareAccessGrant & { email: InviteEmailOutcome };

/* oxlint-enable typescript-eslint/no-restricted-types -- end of the cloud link wire types */
