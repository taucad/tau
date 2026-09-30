import { z } from 'zod';
import { rootedFilePathSchema } from '#schemas/rooted-path.schema.js';
import { kernelIssueSchema } from '#schemas/tools/issue.schema.js';
import { sourceRevisionSchema } from '#schemas/tools/source-revision.schema.js';

/** @public */
export const exportModelInputSchema = z
  .object({
    targetFile: rootedFilePathSchema.describe('Project-relative CAD source file to export.'),
    to: z.string().min(1).describe('A declared export ID or unambiguous reachable file extension without a dot.'),
    options: z
      .any()
      .describe('JSON object of options for the chosen export or route.')
      .pipe(z.record(z.string(), z.json()))
      .optional(),
  })
  .strict();

/** @public */
export const exportModelOutputSchema = z.object({
  to: z.string().describe('The requested export target.'),
  exportId: z.string().describe('The declared export ID resolved for this request.'),
  files: z
    .array(
      z.object({
        name: z.string().describe('Producer-authored relative file name.'),
        artifactPath: rootedFilePathSchema.describe('Project-relative persisted path under .tau/artifacts/.'),
        mimeType: z.string().describe('MIME type of the exported file.'),
        byteLength: z.number().int().nonnegative(),
      }),
    )
    .min(1)
    .describe('Ordered files, primary first, followed by required companions.'),
  warnings: z.array(kernelIssueSchema).optional(),
  sourceRevision: sourceRevisionSchema.optional().describe('Digests of the pinned source exported.'),
});

/** @public */
export type ExportModelInput = z.infer<typeof exportModelInputSchema>;
/** @public */
export type ExportModelOutput = z.infer<typeof exportModelOutputSchema>;
