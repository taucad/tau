import { rpcClientErrorCodeSchema } from '@taucad/chat';
import { z } from 'zod';

const bytesSchema = z.custom<Uint8Array<ArrayBuffer>>(
  (value) => value instanceof Uint8Array,
  'Expected a Uint8Array byte snapshot.',
);

const fileSnapshotSchema = z
  .object({
    path: z.string().min(1),
    bytes: bytesSchema,
  })
  .strict();

const fileSnapshotsSchema = z
  .array(fileSnapshotSchema)
  .min(1)
  .superRefine((files, context) => {
    const paths = new Set<string>();
    for (const [index, file] of files.entries()) {
      if (paths.has(file.path)) {
        context.addIssue({ code: 'custom', message: `Duplicate file snapshot: ${file.path}`, path: [index, 'path'] });
      }
      paths.add(file.path);
    }
  });

const replayEmissionSchema = z
  .object({
    toolName: z.string().min(1),
    /** Raw JSON as emitted; parsing happens only at replay time. */
    argumentsJson: z.string().min(2),
    /** Bytes installed immediately before consecutive CAS attempts. */
    casConflicts: z.array(bytesSchema).max(2).optional(),
  })
  .strict();

const replaySourceSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('recorded'),
      sourceModel: z.string().min(1),
      recordedAt: z.string().min(1),
      argumentsVerbatim: z.literal(true),
    })
    .strict(),
  z
    .object({
      kind: z.literal('authored'),
      sourcePath: z.string().min(1),
    })
    .strict(),
  z
    .object({
      kind: z.literal('qualification-derived'),
      sourceModel: z.string().min(1),
      provider: z.string().min(1),
      nativeToolName: z.string().min(1),
      invocation: z.number().int().positive(),
      recordedAt: z.string().min(1),
      argumentsVerbatim: z.literal(false),
      evidencePath: z.string().min(1),
    })
    .strict(),
]);

export const replayCaseSchema = z.enum([
  'legacy-qualification',
  'unique-match',
  'context-widening',
  'ambiguous-match',
  'ordered-pair',
  'deletion',
  'eof-append',
  'stale-reapply',
  'stale-conflict',
  'wrong-tool-selection',
  'wrong-target',
  'non-ts-scad',
  'non-ts-kcl',
  'replace-all-rename',
  'folded-match',
  'wrong-but-valid',
]);

export const benchmarkErrorCodeSchema = z.enum([
  'SCHEMA_INVALID',
  'WRONG_TOOL_SELECTION',
  'WRONG_TARGET',
  'WRONG_BUT_VALID',
]);

const expectedFilesSchema = z.object({ files: fileSnapshotsSchema }).strict();

const expectedOutcomeSchema = z.discriminatedUnion('kind', [
  expectedFilesSchema.extend({
    kind: z.literal('success'),
    staleRecovered: z.boolean().optional(),
  }),
  expectedFilesSchema.extend({
    kind: z.literal('error'),
    errorCode: z.union([rpcClientErrorCodeSchema, benchmarkErrorCodeSchema]),
  }),
]);

export const replayFixtureSchema = z
  .object({
    version: z.literal(1),
    id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/u),
    case: replayCaseSchema,
    source: replaySourceSchema,
    targetFile: z.string().min(1),
    initial: z.object({ files: fileSnapshotsSchema }).strict(),
    emissions: z.array(replayEmissionSchema).min(1),
    grade: z
      .object({ kind: z.literal('typescript-parse') })
      .strict()
      .optional(),
    expected: expectedOutcomeSchema,
  })
  .strict()
  .superRefine((fixture, context) => {
    if (!fixture.initial.files.some((file) => file.path === fixture.targetFile)) {
      context.addIssue({ code: 'custom', message: 'targetFile is absent from initial bytes.', path: ['targetFile'] });
    }
    if (!fixture.expected.files.some((file) => file.path === fixture.targetFile)) {
      context.addIssue({ code: 'custom', message: 'targetFile is absent from expected bytes.', path: ['expected'] });
    }
  });

export const replayFixtureStoreSchema = z
  .array(replayFixtureSchema)
  .min(1)
  .superRefine((fixtures, context) => {
    const ids = new Set<string>();
    for (const [index, fixture] of fixtures.entries()) {
      if (ids.has(fixture.id)) {
        context.addIssue({ code: 'custom', message: `Duplicate fixture id: ${fixture.id}`, path: [index, 'id'] });
      }
      ids.add(fixture.id);
    }
  });

export type BenchmarkErrorCode = z.infer<typeof benchmarkErrorCodeSchema>;
export type ReplayCase = z.infer<typeof replayCaseSchema>;
export type ReplayFixture = z.infer<typeof replayFixtureSchema>;
export type ReplayEmission = z.infer<typeof replayEmissionSchema>;
