import { z } from 'zod';
import { assertRootedPath } from '@taucad/utils/path';
import type {
  AuthoredPartOccurrence,
  AuthoredAssembly,
  PublishedAuthoredRootReceipt,
  PreparedPublishedPart,
  PublishedPartAsset,
  PublishedAssemblyComponentPlacement,
  PublishedPartRecord,
  PublishedPartOccurrence,
  PublishedPartsRoot,
  PublishedPartsRootOutcome,
  PublishedAssembly,
  PublishedAssemblyAdmission,
  PublishedAssemblyRootSnapshot,
} from '#types/runtime-assembly.types.js';

const filePathSchema = z
  .string()
  .min(1)
  .refine((path) => {
    try {
      return assertRootedPath(path) === path;
    } catch {
      return false;
    }
  }, 'Expected a canonical project-rooted file path.');
const digestSchema = z.custom<PublishedPartAsset['digest']>(
  (value) => typeof value === 'string' && /^sha256:[0-9a-f]{64}$/u.test(value),
);
const safeRecord = <S extends z.ZodType>(valueSchema: S, keySchema: z.ZodType<string> = z.string().min(1)) =>
  z.unknown().transform((input, context): Record<string, z.output<S>> => {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) {
      context.addIssue({ code: 'custom', message: 'Expected a record.' });
      return z.NEVER;
    }
    const entries: Array<[string, z.output<S>]> = [];
    for (const [key, value] of Object.entries(input)) {
      const keyResult = keySchema.safeParse(key);
      if (!keyResult.success) {
        context.addIssue({ code: 'custom', message: keyResult.error.message, path: [key] });
        continue;
      }
      const result = valueSchema.safeParse(value);
      if (!result.success) {
        for (const issue of result.error.issues) {
          context.addIssue({ code: 'custom', message: issue.message, path: [key, ...issue.path] });
        }
        continue;
      }
      entries.push([key, result.data]);
    }
    return Object.fromEntries(entries);
  });
export const publishedPartAssetSchema = z
  .object({
    path: filePathSchema,
    digest: digestSchema,
    byteLength: z.number().int().nonnegative(),
  })
  .strict();
/** Structural pose overlay schema; exact route rigidity and canonical identity are checked by the worker. @internal */
export const publishedAssemblyComponentPlacementSchema: z.ZodType<
  PublishedAssemblyComponentPlacement,
  PublishedAssemblyComponentPlacement
> = z
  .object({
    componentId: z.string().min(1),
    worldTransform: z.tuple([
      z.number(),
      z.number(),
      z.number(),
      z.number(),
      z.number(),
      z.number(),
      z.number(),
      z.number(),
      z.number(),
      z.number(),
      z.number(),
      z.number(),
      z.number(),
      z.number(),
      z.number(),
      z.number(),
    ]),
  })
  .strict();
const exactSchema = z
  .object({
    asset: publishedPartAssetSchema,
    kernelId: z.string().min(1),
    provider: z.string().min(1),
    providerVersion: z.string().min(1),
    codec: z.string().min(1),
    codecVersion: z.string().min(1),
    unit: z.enum(['millimeter', 'meter']),
    linearToleranceMm: z.number().nonnegative(),
    angularToleranceRad: z.number().nonnegative(),
  })
  .strict();
const sourceRevisionSchema = z
  .object({
    entry: filePathSchema,
    files: safeRecord(z.union([digestSchema, z.literal('missing')]), filePathSchema),
  })
  .strict();
const transformSchema = z.array(z.number()).length(16);
const inlineSourceSchema = z
  .object({
    files: safeRecord(z.string(), filePathSchema),
    entry: filePathSchema.optional(),
  })
  .strict()
  .superRefine(({ files, entry }, context) => {
    const paths = Object.keys(files);
    if (paths.length === 0 || (paths.length > 1 && entry === undefined)) {
      context.addIssue({
        code: 'custom',
        message: 'Inline source needs a file and an explicit entry for multiple files.',
      });
    }
    if (entry !== undefined && !Object.hasOwn(files, entry)) {
      context.addIssue({ code: 'custom', message: 'Inline source entry must name one of its files.' });
    }
  });
export const authoredAssemblySourceSchema = z.union([z.object({ path: filePathSchema }).strict(), inlineSourceSchema]);
const authoredOccurrenceSchema: z.ZodType<AuthoredPartOccurrence> = z.lazy(() =>
  z.union([
    z
      .object({ id: z.string().min(1), transform: transformSchema, children: z.array(authoredOccurrenceSchema) })
      .strict(),
    z
      .object({
        id: z.string().min(1),
        transform: transformSchema,
        part: z.string().min(1),
        variant: z.string().min(1).optional(),
      })
      .strict(),
  ]),
);
const publishedOccurrenceSchema: z.ZodType<PublishedPartOccurrence> = z.lazy(() =>
  z.union([
    z
      .object({ id: z.string().min(1), transform: transformSchema, children: z.array(publishedOccurrenceSchema) })
      .strict(),
    z
      .object({
        id: z.string().min(1),
        transform: transformSchema,
        part: z.string().min(1),
        variant: z.string().min(1),
      })
      .strict(),
  ]),
);

/** Wire and durable validation for one pinned completed-part record. @public */
export const publishedPartRecordSchema: z.ZodType<PublishedPartRecord> = z
  .object({
    schemaVersion: z.literal(1),
    variants: safeRecord(
      z
        .object({
          source: sourceRevisionSchema,
          glb: publishedPartAssetSchema,
          exact: exactSchema.optional(),
        })
        .strict(),
    ),
  })
  .strict();

/** Wire and durable validation for a host-issued pinned reference. @internal */
export const publishedPartReferenceSchema = z
  .object({
    path: filePathSchema,
    digest: digestSchema,
  })
  .strict();

/** Authored input is rooted and JSON-safe under the bound host authority. @internal */
export const authoredPartsAssemblySchema: z.ZodType<AuthoredAssembly> = z
  .object({
    schemaVersion: z.literal(1),
    parts: safeRecord(
      z.union([
        z
          .object({
            source: authoredAssemblySourceSchema,
            variants: safeRecord(z.object({ source: authoredAssemblySourceSchema }).strict()).optional(),
          })
          .strict(),
        z.object({ publishedPart: publishedPartReferenceSchema }).strict(),
      ]),
    ),
    occurrences: z.array(authoredOccurrenceSchema),
  })
  .strict();

/** Serializable receipt; it intentionally contains no asset-reader function. @internal */
export const preparedPublishedPartSchema: z.ZodType<PreparedPublishedPart> = z
  .object({
    reference: publishedPartReferenceSchema,
    record: publishedPartRecordSchema,
  })
  .strict();

/** Internal checked root and serializable transition result. @internal */
export const publishedPartsRootSchema: z.ZodType<PublishedPartsRoot> = z
  .object({
    schemaVersion: z.literal(1),
    generation: z.number().int().nonnegative(),
    parts: safeRecord(publishedPartReferenceSchema),
    occurrences: z.array(publishedOccurrenceSchema),
  })
  .strict();

const publishedAssemblySchema: z.ZodType<PublishedAssembly> = z
  .object({
    schemaVersion: z.literal(1),
    parts: safeRecord(publishedPartRecordSchema),
    occurrences: z.array(publishedOccurrenceSchema),
  })
  .strict();

/** Wire admission contains data only; the verified reader remains client-local. @internal */
export const publishedAssemblyAdmissionSchema: z.ZodType<PublishedAssemblyAdmission> = z
  .object({
    publication: publishedAssemblySchema,
    partRecords: safeRecord(publishedPartReferenceSchema),
  })
  .strict();

/** Internal pinned-root RPC args preserve arbitrary authored part names. @internal */
export const publishedPartsRootRequestSchema = z
  .object({
    path: filePathSchema,
    parts: safeRecord(publishedPartReferenceSchema),
  })
  .strict();

/** Internal root transition result schema. @internal */
export const publishedPartsRootOutcomeSchema: z.ZodType<PublishedPartsRootOutcome> = z.discriminatedUnion('status', [
  z
    .object({
      status: z.literal('published'),
      root: publishedPartAssetSchema,
      generation: z.number().int().nonnegative(),
    })
    .strict(),
  z.object({ status: z.literal('superseded') }).strict(),
]);

/** Fresh read result for a rooted publication after an ambiguous receipt. @internal */
export const publishedAssemblyRootSnapshotSchema: z.ZodType<PublishedAssemblyRootSnapshot> = z.discriminatedUnion(
  'status',
  [
    z.object({ status: z.literal('absent') }).strict(),
    z
      .object({
        status: z.literal('present'),
        root: publishedPartAssetSchema,
        generation: z.number().int().nonnegative(),
      })
      .strict(),
  ],
);

/** Serializable host receipt for an internally checked authored-root transition. @internal */
export const publishedAuthoredRootReceiptSchema: z.ZodType<PublishedAuthoredRootReceipt> = z
  .object({
    outcome: z.union([
      publishedPartsRootOutcomeSchema,
      z
        .object({
          status: z.literal('invalid'),
          issues: z.array(
            z
              .object({
                code: z.enum(['SCENE_REFERENCE_INVALID', 'SCENE_DISPLAY_INVALID']),
                path: z.string(),
                message: z.string(),
                recovery: z.string(),
              })
              .strict(),
          ),
        })
        .strict(),
    ]),
    partRecords: safeRecord(publishedPartReferenceSchema).optional(),
    publication: publishedAssemblySchema.optional(),
  })
  .strict();
