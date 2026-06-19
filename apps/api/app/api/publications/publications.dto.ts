import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const maxPublicationAccessRecipients = 50;

export const normalizedPublicationAccessEmailSchema = z.string().trim().toLowerCase().pipe(z.email());

export const sharedPublicationEmailsSchema = z
  .array(normalizedPublicationAccessEmailSchema)
  .max(maxPublicationAccessRecipients)
  .transform((emails) => [...new Set(emails)]);

export const publishManifestSchema = z
  .object({
    projectId: z.string().min(1),
    projectName: z.string().min(1),
    entryFile: z.string().min(1),
    visibility: z.enum(['private', 'public']),
    title: z.string().min(1),
    description: z.string().optional(),
    parameters: z.record(z.string(), z.unknown()).optional(),
    sharedEmails: sharedPublicationEmailsSchema.optional(),
    notifyRecipients: z.boolean().optional(),
  })
  .superRefine((manifest, context) => {
    if (manifest.visibility === 'public' && (manifest.sharedEmails?.length ?? 0) > 0) {
      context.addIssue({
        code: 'custom',
        message: 'sharedEmails can only be used with private publications',
        path: ['sharedEmails'],
      });
    }
  });

export type PublishManifest = z.infer<typeof publishManifestSchema>;

const filesMapSchema = z.custom<Map<string, Uint8Array<ArrayBuffer>>>((value) => value instanceof Map, {
  message: 'Expected multipart files map',
});

export const publishUploadSchema = z
  .object({
    manifest: z
      .string({ message: 'Missing multipart field manifest' })
      .min(1, 'Missing multipart field manifest')
      .transform((raw, context) => {
        try {
          return JSON.parse(raw) as unknown;
        } catch {
          context.addIssue({
            code: 'custom',
            message: 'Manifest is not valid JSON',
            path: ['manifest'],
          });
          return z.NEVER;
        }
      })
      .pipe(publishManifestSchema),
    files: filesMapSchema,
  })
  .meta({ id: 'PublishUpload' });

export class PublishUploadDto extends createZodDto(publishUploadSchema) {}

export const storedPublicationManifestSchema = z.object({
  version: z.literal(1),
  projectId: z.string(),
  entryFile: z.string(),
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
    ownerId: z.string(),
    parentPublicationId: z.string().nullable(),
    visibility: publicationVisibilitySchema,
    manifestKey: z.string(),
    ogImageKey: z.string().nullable(),
    thumbnailKey: z.string().nullable(),
    runtimePin: z.string(),
    kernels: z.array(z.string()),
    entryFile: z.string(),
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
    manifest: z.url(),
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
