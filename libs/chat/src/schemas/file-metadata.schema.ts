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
