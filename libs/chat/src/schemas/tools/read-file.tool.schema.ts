import { z } from 'zod';

/** @public */
export const readFileInputSchema = z.object({
  targetFile: z.string().describe('The path of the file to read, relative to the project root.'),
  offset: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe('The line number to start reading from (1-based). If not provided, reads from the beginning.'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(2000)
    .optional()
    .describe('Maximum number of lines to read (1-2000, default 2000). Use offset to paginate huge files.'),
});

/** @public */
export const readFileOutputSchema = z.object({
  content: z.string().describe('The raw content of the file.'),
  totalLines: z.number().describe('The total number of lines in the file.'),
  startLine: z.number().optional().describe('The starting line number (1-based) of the returned content.'),
  truncated: z
    .boolean()
    .optional()
    .describe('True when the returned slice was capped at MAX_READ_LINES (2000); use offset to paginate.'),
  modifiedAt: z
    .string()
    .optional()
    .describe('ISO-8601 timestamp of the file at read time (used by the offload middleware for dedup).'),
});

/** @public */
export type ReadFileInput = z.infer<typeof readFileInputSchema>;
/** @public */
export type ReadFileOutput = z.infer<typeof readFileOutputSchema>;
