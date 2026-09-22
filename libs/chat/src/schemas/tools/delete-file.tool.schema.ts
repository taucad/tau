import { z } from 'zod';
import { diffStatsWithContentSchema } from '#schemas/tools/diff.schema.js';
import { rootedFilePathSchema } from '#schemas/rooted-path.schema.js';
import { writeRevisionSchema } from '#schemas/tools/source-revision.schema.js';

/** @public */
export const deleteFileInputSchema = z.object({
  targetFile: rootedFilePathSchema.describe('The path of the file to delete, relative to the project root.'),
});

/** @public */
export const deleteFileOutputSchema = z.object({
  message: z.string().describe('Information about the operation.'),
  diffStats: diffStatsWithContentSchema
    .optional()
    .describe(
      'Pre-deletion file content, captured so the delete is invertible for restore. Absent for missing/binary/legacy deletes.',
    ),
  revision: writeRevisionSchema.optional().describe('The deleted path, recorded as "missing" (R4).'),
});

/** @public */
export type DeleteFileInput = z.infer<typeof deleteFileInputSchema>;
/** @public */
export type DeleteFileOutput = z.infer<typeof deleteFileOutputSchema>;
