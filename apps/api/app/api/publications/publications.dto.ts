import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { isProjectRepositoryId } from '#api/git/git.constants.js';

const maxPublicationAccessRecipients = 50;

export const normalizedPublicationAccessEmailSchema = z.string().trim().toLowerCase().pipe(z.email());

export const sharedPublicationEmailsSchema = z
  .array(normalizedPublicationAccessEmailSchema)
  .max(maxPublicationAccessRecipients)
  .transform((emails) => [...new Set(emails)]);

/**
 * `POST /v1/publications` — a publication is a pointer into the synced graph
 * (D11, A21): `{ projectId, tag, revisionId }` plus the three things only a
 * person decides (who may see it, what it is called, who it is shared with).
 * Nothing is uploaded: the bytes arrived with the push and the server
 * materializes the tagged tree.
 */
export const publishRequestSchema = z
  .object({
    /* The same shape the git routes require, so a traversal id is a 400 here
       rather than a refusal further in (review R1). */
    projectId: z.string().refine(isProjectRepositoryId, 'projectId must be a project id'),
    projectName: z.string().min(1),
    /** The named version, without `refs/tags/`. */
    tag: z.string().min(1).max(200),
    /** The revision that name points at, as the client observed it. */
    revisionId: z.string().min(1).max(64),
    entryPath: z.string().min(1),
    visibility: z.enum(['private', 'public']),
    title: z.string().min(1),
    description: z.string().optional(),
    sharedEmails: sharedPublicationEmailsSchema.optional(),
    notifyRecipients: z.boolean().optional(),
  })
  .superRefine((request, context) => {
    if (request.visibility === 'public' && (request.sharedEmails?.length ?? 0) > 0) {
      context.addIssue({
        code: 'custom',
        message: 'sharedEmails can only be used with private publications',
        path: ['sharedEmails'],
      });
    }
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

export const publicationVisibilitySchema = z.enum(['private', 'public']);

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

export const publicationAccessStatusSchema = z.enum(['active', 'revoked']);

export const publicationAccessGrantSchema = z
  .object({
    id: z.string(),
    publicationId: z.string(),
    recipientEmail: z.email(),
    status: publicationAccessStatusSchema,
    createdAt: z.iso.datetime(),
    revokedAt: z.iso.datetime().nullable(),
  })
  .meta({ id: 'PublicationAccessGrant' });

export const invitePublicationAccessSchema = z
  .object({
    email: normalizedPublicationAccessEmailSchema,
    notifyRecipient: z.boolean().optional(),
  })
  .meta({ id: 'InvitePublicationAccess' });

export const updatePublicationVisibilitySchema = z
  .object({
    visibility: publicationVisibilitySchema,
  })
  .meta({ id: 'UpdatePublicationVisibility' });

export const publicationVisibilityUpdateSchema = z
  .object({
    id: z.string(),
    visibility: publicationVisibilitySchema,
  })
  .meta({ id: 'PublicationVisibilityUpdate' });

export const publicationAccessListSchema = z
  .object({
    grants: z.array(publicationAccessGrantSchema),
  })
  .meta({ id: 'PublicationAccessList' });

export const projectShareEnvelopeSchema = z
  .object({
    project: z.object({
      id: z.string(),
      name: z.string().nullable(),
      description: z.string().nullable(),
    }),
    currentPublication: z
      .object({
        id: z.string(),
        tag: z.string(),
        title: z.string(),
        description: z.string().nullable(),
        visibility: publicationVisibilitySchema,
        createdAt: z.iso.datetime(),
        urls: z.object({
          share: z.url(),
        }),
        access: z.object({
          grants: z.array(publicationAccessGrantSchema),
        }),
      })
      .nullable(),
    snapshot: z.object({
      state: z.enum(['unpublished', 'published-current']),
      lastPublishedAt: z.iso.datetime().optional(),
    }),
  })
  .meta({ id: 'ProjectShareEnvelope' });

export class PublicationUrlsDto extends createZodDto(publicationUrlsSchema) {}
export class PublishResponseDto extends createZodDto(publishResponseSchema) {}
export class PublicationViewResponseDto extends createZodDto(publicationViewResponseSchema) {}
export class InvitePublicationAccessDto extends createZodDto(invitePublicationAccessSchema) {}
export class UpdatePublicationVisibilityDto extends createZodDto(updatePublicationVisibilitySchema) {}
export class PublicationVisibilityUpdateDto extends createZodDto(publicationVisibilityUpdateSchema) {}
export class PublicationAccessGrantDto extends createZodDto(publicationAccessGrantSchema) {}
export class PublicationAccessListDto extends createZodDto(publicationAccessListSchema) {}
export class ProjectShareEnvelopeDto extends createZodDto(projectShareEnvelopeSchema) {}

export type PublicationWireRow = z.infer<typeof publicationRowSchema>;
export type PublishResponse = z.infer<typeof publishResponseSchema>;
export type PublicationViewResponse = z.infer<typeof publicationViewResponseSchema>;
export type InvitePublicationAccess = z.infer<typeof invitePublicationAccessSchema>;
export type UpdatePublicationVisibility = z.infer<typeof updatePublicationVisibilitySchema>;
export type PublicationVisibilityUpdate = z.infer<typeof publicationVisibilityUpdateSchema>;
export type PublicationAccessGrant = z.infer<typeof publicationAccessGrantSchema>;
export type PublicationAccessList = z.infer<typeof publicationAccessListSchema>;
export type ProjectShareEnvelope = z.infer<typeof projectShareEnvelopeSchema>;
