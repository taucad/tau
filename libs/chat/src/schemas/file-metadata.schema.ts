import { z } from 'zod';

/** @public */
export const textFileContentMetadataSchema = z
  .object({
    contentKind: z.literal('text'),
    lineCount: z.number().int().min(1),
  })
  .strict();

/** @public */
export const binaryFileContentMetadataSchema = z
  .object({
    contentKind: z.literal('binary'),
  })
  .strict();

/** @public */
export const fileContentMetadataSchema = z.discriminatedUnion('contentKind', [
  textFileContentMetadataSchema,
  binaryFileContentMetadataSchema,
]);

/** @public */
export type TextFileContentMetadataOutput = z.infer<typeof textFileContentMetadataSchema>;
/** @public */
export type BinaryFileContentMetadataOutput = z.infer<typeof binaryFileContentMetadataSchema>;
/** @public */
export type FileContentMetadataOutput = z.infer<typeof fileContentMetadataSchema>;

/**
 * A listed text file's metadata (charter D4, EQ15): the exact line count where
 * counting it was cheap, the size alone otherwise.
 *
 * @public
 */
export const listedTextFileContentMetadataSchema = z
  .object({
    contentKind: z.literal('text'),
    lineCount: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe('Exact line count; absent for a file too large to count while listing.'),
  })
  .strict();
