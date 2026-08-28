import { z } from 'zod';
import { diffStatsWithContentSchema } from '#schemas/tools/diff.schema.js';
import { rootedFilePathSchema } from '#schemas/rooted-path.schema.js';

/** @public */
export const editFileInputSchema = z.object({
  targetFile: rootedFilePathSchema.describe('The target file to modify.'),
  codeEdit: z.string().describe('Specify ONLY the precise lines of code that you wish to edit'),
});

/** @public */
export const editFileOutputSchema = z.object({
  diffStats: diffStatsWithContentSchema.describe('Statistics and content diff for the changes made'),
});

/** @public */
export type EditFileInput = z.infer<typeof editFileInputSchema>;
/** @public */
export type EditFileOutput = z.infer<typeof editFileOutputSchema>;
