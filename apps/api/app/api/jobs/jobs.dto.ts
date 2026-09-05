import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const sha256Schema = z.templateLiteral(['sha256:', z.string().regex(/^[\da-f]{64}$/u)]);
const safeLogicalPathSchema = z
  .string()
  .min(1)
  .max(1024)
  .refine(
    (value) =>
      !value.startsWith('/') &&
      !value.includes('\\') &&
      value.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..'),
    'Expected a rooted-safe relative path',
  );

const jobCapabilityValueSchema = z.union([z.boolean(), z.number(), z.string().max(256)]);

export const registerJobRunnerSchema = z.object({
  capabilities: z.record(z.string().trim().min(1).max(128), jobCapabilityValueSchema),
  slots: z.number().int().min(1).max(1024),
});
export class RegisterJobRunnerDto extends createZodDto(registerJobRunnerSchema) {}

export const jobCapabilityRequirementSchema = z.discriminatedUnion('condition', [
  z.object({
    key: z.string().trim().min(1).max(128),
    condition: z.literal('equals'),
    value: jobCapabilityValueSchema,
  }),
  z.object({
    key: z.string().trim().min(1).max(128),
    condition: z.literal('one-of'),
    values: z.array(jobCapabilityValueSchema).min(1).max(32),
  }),
  z.object({
    key: z.string().trim().min(1).max(128),
    condition: z.literal('at-least'),
    value: z.number(),
  }),
]);

export const jobDefinitionSchema = z
  .object({
    type: z.string().trim().min(1).max(128),
    version: z.string().trim().min(1).max(64),
    input: z.object({
      digest: sha256Schema,
      size: z.number().int().nonnegative().max(10_000_000_000_000),
      mediaType: z.string().trim().min(1).max(256),
      storageKey: z.string().trim().min(1).max(2048),
    }),
    requirements: z.array(jobCapabilityRequirementSchema).max(64),
    slotCost: z.number().int().min(1).max(1024),
    maxAttempts: z.number().int().min(1).max(100),
    options: z.record(z.string().max(128), z.json()),
    outputs: z
      .array(
        z.object({
          role: z.string().trim().min(1).max(128),
          logicalPath: safeLogicalPathSchema,
          mediaType: z.string().trim().min(1).max(256),
        }),
      )
      .max(256),
  })
  .superRefine((definition, context) => {
    const requirementKeys = definition.requirements.map(({ key }) => key);
    if (new Set(requirementKeys).size !== requirementKeys.length) {
      context.addIssue({
        code: 'custom',
        message: 'Capability requirement keys must be unique',
        path: ['requirements'],
      });
    }
    const outputPaths = definition.outputs.map(({ logicalPath }) => logicalPath);
    if (new Set(outputPaths).size !== outputPaths.length) {
      context.addIssue({ code: 'custom', message: 'Output logical paths must be unique', path: ['outputs'] });
    }
  });

export const submitJobSchema = z.object({
  projectId: z.string().trim().min(1).max(256),
  idempotencyKey: z.string().trim().min(1).max(256),
  definitionDigest: sha256Schema,
  definition: jobDefinitionSchema,
});

export class SubmitJobDto extends createZodDto(submitJobSchema) {}

export const cancelJobSchema = z.object({
  reason: z.string().trim().min(1).max(1000),
});

export class CancelJobDto extends createZodDto(cancelJobSchema) {}

export const jobProgressSchema = z.object({
  phase: z.string().trim().min(1).max(128),
  completed: z.number().nonnegative(),
  total: z.number().positive(),
  message: z.string().max(2000),
});

export const jobArtifactManifestSchema = z.object({
  artifactId: z.string().min(1).max(256),
  digest: sha256Schema,
  size: z
    .number()
    .int()
    .nonnegative()
    .max(1024 * 1024 * 1024),
  mediaType: z.string().trim().min(1).max(256),
  role: z.string().trim().min(1).max(128),
  logicalPath: safeLogicalPathSchema,
  storageKey: z.string().trim().min(1).max(2048),
  provenance: z.object({
    jobId: z.string().min(1),
    attemptId: z.string().min(1),
    attempt: z.number().int().positive(),
    runnerId: z.string().min(1),
    providerId: z.string().min(1),
    providerVersion: z.string().min(1),
    inputDigest: sha256Schema,
  }),
});

export const jobFailureSchema = z.object({
  code: z.string().trim().min(1).max(128),
  message: z.string().min(1).max(4000),
  retryable: z.boolean(),
});

const attemptIdentitySchema = z.object({
  attemptId: z.string().min(1).max(256),
  attempt: z.number().int().positive(),
});

export const startJobAttemptSchema = attemptIdentitySchema.extend({
  workflowRunId: z.string().min(1).max(256),
  definitionDigest: sha256Schema,
});
export class StartJobAttemptDto extends createZodDto(startJobAttemptSchema) {}

export const heartbeatJobAttemptSchema = attemptIdentitySchema;
export class HeartbeatJobAttemptDto extends createZodDto(heartbeatJobAttemptSchema) {}

export const reportJobProgressSchema = attemptIdentitySchema.extend({ progress: jobProgressSchema });
export class ReportJobProgressDto extends createZodDto(reportJobProgressSchema) {}

export const retryJobAttemptSchema = attemptIdentitySchema.extend({
  outcome: z.object({ status: z.literal('failed'), failure: jobFailureSchema }),
});
export class RetryJobAttemptDto extends createZodDto(retryJobAttemptSchema) {}

export const finishJobAttemptSchema = attemptIdentitySchema.extend({
  outcome: z.discriminatedUnion('status', [
    z.object({
      status: z.literal('completed'),
      artifacts: z.array(jobArtifactManifestSchema).max(256),
      result: z.json(),
    }),
    z.object({ status: z.literal('cancelled'), reason: z.string().min(1).max(4000) }),
    z.object({ status: z.literal('failed'), failure: jobFailureSchema }),
  ]),
});
export class FinishJobAttemptDto extends createZodDto(finishJobAttemptSchema) {}

const workerArtifactAttemptSchema = attemptIdentitySchema.extend({
  jobId: z.string().min(1).max(256),
});

export const workerArtifactUploadSchema = workerArtifactAttemptSchema.extend({
  digest: sha256Schema,
  size: z
    .number()
    .int()
    .nonnegative()
    .max(1024 * 1024 * 1024),
  mediaType: z.string().trim().min(1).max(256),
});
export class WorkerArtifactUploadDto extends createZodDto(workerArtifactUploadSchema) {}

const multipartUploadIdentitySchema = workerArtifactAttemptSchema.extend({
  digest: sha256Schema,
  uploadId: z.string().min(1).max(2048),
});

export const workerArtifactUploadPartSchema = multipartUploadIdentitySchema.extend({
  partNumber: z.number().int().min(1).max(10_000),
  checksumSha256: z.string().regex(/^[\d+/A-Za-z]{43}=$/u),
});
export class WorkerArtifactUploadPartDto extends createZodDto(workerArtifactUploadPartSchema) {}

export const workerArtifactCompleteUploadSchema = multipartUploadIdentitySchema.extend({
  parts: z
    .array(
      z.object({
        partNumber: z.number().int().min(1).max(10_000),
        etag: z.string().min(1).max(256),
        checksumSha256: z.string().regex(/^[\d+/A-Za-z]{43}=$/u),
      }),
    )
    .min(1)
    .max(10_000)
    .superRefine((parts, context) => {
      const partNumbers = parts.map(({ partNumber }) => partNumber);
      if (new Set(partNumbers).size !== partNumbers.length) {
        context.addIssue({ code: 'custom', message: 'Multipart upload part numbers must be unique' });
      }
    }),
});
export class WorkerArtifactCompleteUploadDto extends createZodDto(workerArtifactCompleteUploadSchema) {}

export const workerArtifactAbortUploadSchema = multipartUploadIdentitySchema;
export class WorkerArtifactAbortUploadDto extends createZodDto(workerArtifactAbortUploadSchema) {}

export const workerArtifactDownloadSchema = workerArtifactAttemptSchema.extend({ digest: sha256Schema });
export class WorkerArtifactDownloadDto extends createZodDto(workerArtifactDownloadSchema) {}

export const workerActionRecordSchema = z
  .object({
    schemaVersion: z.literal(1),
    actionDigest: sha256Schema,
    codec: z
      .object({
        id: z.string().trim().min(1).max(256),
        version: z.string().trim().min(1).max(128),
      })
      .strict(),
    output: z
      .object({
        digest: sha256Schema,
        size: z
          .number()
          .int()
          .nonnegative()
          .max(1024 * 1024 * 1024),
        mediaType: z.string().trim().min(1).max(256),
      })
      .strict(),
    dependencies: z.array(sha256Schema).max(1024),
  })
  .strict()
  .superRefine((record, context) => {
    if (new Set(record.dependencies).size !== record.dependencies.length) {
      context.addIssue({ code: 'custom', message: 'Action dependencies must be unique', path: ['dependencies'] });
    }
  });

export const workerActionReadSchema = workerArtifactAttemptSchema.extend({ actionDigest: sha256Schema }).strict();
export class WorkerActionReadDto extends createZodDto(workerActionReadSchema) {}

export const workerActionPublishSchema = workerArtifactAttemptSchema
  .extend({ record: workerActionRecordSchema })
  .strict();
export class WorkerActionPublishDto extends createZodDto(workerActionPublishSchema) {}
