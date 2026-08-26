import { z } from 'zod';
import { binaryFileContentMetadataSchema, textFileContentMetadataSchema } from '#schemas/file-metadata.schema.js';

/** @public */
export const globSearchInputSchema = z.object({
  pattern: z.string().describe('The glob pattern to match files against (e.g., "**/*.ts", "lib/**/*.scad").'),
  path: z.string().optional().describe('The base directory to search from. Defaults to project root.'),
});

const baseGlobEntrySchema = z.object({
  path: z.string().describe('The matched path.'),
  size: z.number().int().nonnegative().describe('Byte size when available; directories may report 0 when unknown.'),
  modifiedAt: z.string().optional().describe('ISO-8601 modification timestamp when available.'),
});

const globEntrySchema = z.union([
  baseGlobEntrySchema.extend({
    isDirectory: z.literal(true).describe('This match is a directory.'),
  }),
  baseGlobEntrySchema.extend({
    isDirectory: z.literal(false).optional().describe('This match is a file.'),
    ...textFileContentMetadataSchema.shape,
  }),
  baseGlobEntrySchema.extend({
    isDirectory: z.literal(false).optional().describe('This match is a file.'),
    ...binaryFileContentMetadataSchema.shape,
  }),
]);

/** @public */
export const globSearchOutputSchema = z.object({
  files: z.array(z.string()).describe('The list of file paths matching the glob pattern.'),
  entries: z.array(globEntrySchema).describe('The matched paths with byte size and text/binary metadata.'),
  totalFiles: z.number().describe('The total number of files found.'),
});

/** @public */
export type GlobSearchInput = z.infer<typeof globSearchInputSchema>;
/** @public */
export type GlobSearchOutput = z.infer<typeof globSearchOutputSchema>;
