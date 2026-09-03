import { z } from 'zod';
import { binaryFileContentMetadataSchema, textFileContentMetadataSchema } from '#schemas/file-metadata.schema.js';
import { rootedPathSchema } from '#schemas/rooted-path.schema.js';

/** @public */
export const listDirectoryInputSchema = z.object({
  path: rootedPathSchema.optional().describe('The directory to list. Defaults to the project root.'),
});

const baseDirectoryEntrySchema = z.object({
  name: z.string().describe('The name of the file or directory.'),
  size: z.number().int().nonnegative().describe('Byte size when available; directories may report 0 when unknown.'),
});

/** Canonical directory-entry schema shared with the RPC transport. @public */
export const directoryEntrySchema = z.union([
  baseDirectoryEntrySchema.extend({
    type: z.literal('dir').describe('This entry is a directory.'),
  }),
  baseDirectoryEntrySchema.extend({
    type: z.literal('file').describe('This entry is a file.'),
    ...textFileContentMetadataSchema.shape,
  }),
  baseDirectoryEntrySchema.extend({
    type: z.literal('file').describe('This entry is a file.'),
    ...binaryFileContentMetadataSchema.shape,
  }),
]);

/** @public */
export const listDirectoryOutputSchema = z.object({
  entries: z.array(directoryEntrySchema).describe('The list of files and directories in the specified path.'),
  path: rootedPathSchema.describe('The resolved path that was listed.'),
});

/** @public */
export type ListDirectoryInput = z.infer<typeof listDirectoryInputSchema>;
/** @public */
export type ListDirectoryOutput = z.infer<typeof listDirectoryOutputSchema>;
/** @public */
export type DirectoryEntry = z.infer<typeof directoryEntrySchema>;
