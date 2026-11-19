import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { inviteEmailSkipReasons } from '@taucad/types/constants';
import { isProjectRepositoryId } from '@taucad/api-git-core/git.constants';

export const normalizedPublicationAccessEmailSchema = z.string().trim().toLowerCase().pipe(z.email());

export const publicationVisibilitySchema = z.enum(['private', 'public']);

/**
 * `POST /v1/publications` — a publication is a pointer into the synced graph
 * (D11, A21): `{ projectId, tag, revisionId }`. The project's name and
 * description become the link's title and description (stable cloud link
 * blueprint D3). `visibility` sets who can open the project's one cloud link;
 * without it a live or stopped link keeps its setting and a new link takes
 * `defaultVisibility`, else private. Nothing is uploaded: the bytes arrived with the push and the server
 * materializes the tagged tree.
 */
export const publishRequestSchema = z
  .object({
    /* The same shape the git routes require, so a traversal id is a 400 here
       rather than a refusal further in (review R1). */
    projectId: z.string().refine(isProjectRepositoryId, 'projectId must be a project id'),
    projectName: z.string().min(1),
    /**
     * The version's tag, without `refs/tags/`: `v<number>` (B6). The version's
     * name is free text in the tag itself; the ref is always its number.
     */
    tag: z.string().regex(/^v[1-9]\d{0,8}$/u, 'tag must be a version tag, v<number>'),
    /** The revision that name points at, as the client observed it. */
    revisionId: z.string().min(1).max(64),
    entryPath: z.string().min(1),
    description: z.string().optional(),
    visibility: publicationVisibilitySchema.optional(),
    /**
     * Who can open the link when this publish makes it and names no
     * `visibility`. Decided under the project's lock, so a link made since the
     * client last looked keeps its own setting.
     */
    defaultVisibility: publicationVisibilitySchema.optional(),
  })
  .meta({ id: 'PublishRequest' });

export type PublishRequest = z.infer<typeof publishRequestSchema>;

export class PublishRequestDto extends createZodDto(publishRequestSchema) {}

export const storedPublicationManifestSchema = z.object({
  version: z.literal(1),
  projectId: z.string(),
  entryPath: z.string(),
  files: z.record(z.string(), z.string()),
  kernels: z.array(z.string()),
  runtime: z.string(),
  parameters: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
});

export type StoredPublicationManifest = z.infer<typeof storedPublicationManifestSchema>;

export const publicationOwnerSnapshotSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    image: z.preprocess((value) => (value === null ? undefined : value), z.string().optional()),
  })
  .meta({ id: 'PublicationOwnerSnapshot' });

export const publicationRowSchema = z
  .object({
    id: z.string(),
    projectId: z.string(),
    tag: z.string(),
    revisionId: z.string(),
    ownerId: z.string(),
    parentPublicationId: z.string().nullable(),
    visibility: publicationVisibilitySchema,
    runtimePin: z.string(),
    kernels: z.array(z.string()),
    entryPath: z.string(),
    title: z.string(),
    description: z.string().nullable(),
    forkCount: z.number().int().nonnegative(),
    viewCount: z.number().int().nonnegative(),
    ownerSnapshot: publicationOwnerSnapshotSchema.nullable().optional(),
    createdAt: z.iso.datetime(),
    unpublishedAt: z.iso.datetime().nullable(),
  })
  .meta({ id: 'PublicationRow' });

export const publicationUrlsSchema = z
  .object({
    view: z.url(),
    share: z.url(),
    og: z.url(),
    thumbnail: z.url(),
  })
  .meta({ id: 'PublicationUrls' });

export const publishResponseSchema = z
  .object({
    id: z.string(),
    urls: publicationUrlsSchema,
    /** The project's cloud link, which this publish now points at. */
    share: z.object({
      id: z.string(),
      url: z.url(),
      visibility: publicationVisibilitySchema,
    }),
    version: z.object({ tag: z.string() }),
  })
  .meta({ id: 'PublishResponse' });

export const publicationViewResponseSchema = z
  .object({
    publication: publicationRowSchema,
    viewerRole: z.enum(['owner', 'grantee', 'public']),
    urls: publicationUrlsSchema,
    manifest: storedPublicationManifestSchema,
    files: z.record(z.string(), z.url()),
  })
  .meta({ id: 'PublicationViewResponse' });

export const projectShareAccessStatusSchema = z.enum(['active', 'revoked']);

/** One invited address on a private cloud link. */
export const projectShareAccessGrantSchema = z
  .object({
    id: z.string(),
    recipientEmail: z.email(),
    status: projectShareAccessStatusSchema,
    createdAt: z.iso.datetime(),
    revokedAt: z.iso.datetime().nullable(),
    /** Mail to this recipient cannot be delivered (bounced, reported or suppressed); the reason is not disclosed. */
    notDelivered: z.boolean().optional(),
  })
  .meta({ id: 'ProjectShareAccessGrant' });

/** What happened to an invite's email (stable cloud link blueprint D7, E4). */
export const inviteEmailOutcomeSchema = z
  .discriminatedUnion('status', [
    z.object({ status: z.literal('sent') }),
    z.object({ status: z.literal('skipped'), reason: z.enum(inviteEmailSkipReasons) }),
    z.object({ status: z.literal('not_requested') }),
  ])
  .meta({ id: 'InviteEmailOutcome' });

/** `POST /v1/projects/:id/share/access` answers the grant and what happened to its email. */
export const projectShareAccessInviteResponseSchema = projectShareAccessGrantSchema
  .extend({ email: inviteEmailOutcomeSchema })
  .meta({ id: 'ProjectShareAccessInviteResponse' });

/** `POST /v1/projects/:id/share/access`. The email is sent unless `notifyRecipient` is `false`. */
export const inviteProjectShareAccessSchema = z
  .object({
    email: normalizedPublicationAccessEmailSchema,
    notifyRecipient: z.boolean().optional(),
  })
  .meta({ id: 'InviteProjectShareAccess' });

/** `PATCH /v1/projects/:id/share`: who can open the link. */
export const updateProjectShareSchema = z
  .object({
    visibility: publicationVisibilitySchema,
  })
  .meta({ id: 'UpdateProjectShare' });

/** A project's cloud link as its owner sees it. */
export const projectShareSchema = z
  .object({
    id: z.string(),
    url: z.url(),
    visibility: publicationVisibilitySchema,
    /** `stopped` after "Stop sharing" (or project deletion); the next publish turns the same link back on. */
    status: z.enum(['active', 'stopped']),
    stoppedAt: z.iso.datetime().nullable(),
    publishedAt: z.iso.datetime().nullable(),
    /** The version the link shows; `revisionId` lets the client tell whether there are unpublished changes. */
    currentVersion: z
      .object({
        publicationId: z.string(),
        tag: z.string(),
        revisionId: z.string(),
      })
      .nullable(),
    access: z.object({
      grants: z.array(projectShareAccessGrantSchema),
    }),
  })
  .meta({ id: 'ProjectShare' });

/** `GET /v1/projects/:id/share`: the project and its link, `null` before its first publish. */
export const projectShareEnvelopeSchema = z
  .object({
    project: z.object({
      id: z.string(),
      name: z.string().nullable(),
      description: z.string().nullable(),
    }),
    share: projectShareSchema.nullable(),
  })
  .meta({ id: 'ProjectShareEnvelope' });

export class PublicationUrlsDto extends createZodDto(publicationUrlsSchema) {}
export class PublishResponseDto extends createZodDto(publishResponseSchema) {}
export class PublicationViewResponseDto extends createZodDto(publicationViewResponseSchema) {}
export class InviteProjectShareAccessDto extends createZodDto(inviteProjectShareAccessSchema) {}
export class UpdateProjectShareDto extends createZodDto(updateProjectShareSchema) {}
export class ProjectShareDto extends createZodDto(projectShareSchema) {}
export class ProjectShareAccessGrantDto extends createZodDto(projectShareAccessGrantSchema) {}
export class ProjectShareAccessInviteResponseDto extends createZodDto(projectShareAccessInviteResponseSchema) {}
export class ProjectShareEnvelopeDto extends createZodDto(projectShareEnvelopeSchema) {}

export type PublicationWireRow = z.infer<typeof publicationRowSchema>;
export type PublishResponse = z.infer<typeof publishResponseSchema>;
export type PublicationViewResponse = z.infer<typeof publicationViewResponseSchema>;
export type InviteEmailOutcomeDto = z.infer<typeof inviteEmailOutcomeSchema>;
export type InviteProjectShareAccess = z.infer<typeof inviteProjectShareAccessSchema>;
export type UpdateProjectShare = z.infer<typeof updateProjectShareSchema>;
export type ProjectShare = z.infer<typeof projectShareSchema>;
export type ProjectShareAccessGrant = z.infer<typeof projectShareAccessGrantSchema>;
export type ProjectShareAccessInviteResponse = z.infer<typeof projectShareAccessInviteResponseSchema>;
export type ProjectShareEnvelope = z.infer<typeof projectShareEnvelopeSchema>;
