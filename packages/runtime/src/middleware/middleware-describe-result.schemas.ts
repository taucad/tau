import { z } from 'zod';
import type { ParameterManifest } from '@taucad/parameters';
import { isParameterManifestShape } from '@taucad/parameters';
import { runtimeIssueSchema, runtimeSourceRevisionSchema } from '#types/runtime-wire-common.schemas.js';

/** Admission for the middleware describe hook result. @public */
export const describeResultSchema = z.union([
  z
    .object({
      success: z.literal(true),
      data: z.object({
        parameters: z.custom<ParameterManifest>(isParameterManifestShape, 'Expected a parameter manifest wire shape'),
      }),
      issues: z.array(runtimeIssueSchema),
      serializedHandle: z.unknown().optional(),
      sourceRevision: runtimeSourceRevisionSchema.optional(),
    })
    .catchall(z.unknown()),
  z
    .object({
      success: z.literal(false),
      issues: z.array(runtimeIssueSchema),
      sourceRevision: runtimeSourceRevisionSchema.optional(),
    })
    .catchall(z.unknown()),
]);
