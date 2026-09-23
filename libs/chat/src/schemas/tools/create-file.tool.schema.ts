import { z } from 'zod';
import { diffStatsWithContentSchema } from '#schemas/tools/diff.schema.js';
import { rootedFilePathSchema } from '#schemas/rooted-path.schema.js';
import { writeRevisionSchema } from '#schemas/tools/source-revision.schema.js';

/** @public */
export const createFileInputSchema = z.object({
  targetFile: rootedFilePathSchema.describe('The path of the file to create, relative to the project root.'),
  content: z.string().describe('The content to write to the new file.'),
});

/** @public */
export const createFileOutputSchema = z.object({
  message: z.string().optional().describe('Additional information about the operation.'),
  diffStats: diffStatsWithContentSchema.describe('Statistics and content diff for the changes made'),
  revision: writeRevisionSchema.optional().describe('Digest of the bytes this write left at the path (R4).'),
});

/** @public */
export type CreateFileInput = z.infer<typeof createFileInputSchema>;
/** @public */
export type CreateFileOutput = z.infer<typeof createFileOutputSchema>;
