import { z } from 'zod';
import { diffStatsWithContentSchema } from '#schemas/tools/diff.schema.js';
import { rootedFilePathSchema } from '#schemas/rooted-path.schema.js';
import { writeRevisionSchema } from '#schemas/tools/source-revision.schema.js';

/** Maximum UTF-8 bytes accepted for an edit target or replacement. @public */
export const editFileMaxBytes = 256 * 1024;

const textEncoder = new TextEncoder();
const boundedEditTextSchema = z
  .string()
  .refine((value) => value.isWellFormed(), { message: 'Edit text must be well-formed UTF-16.' })
  .refine((value) => textEncoder.encode(value).byteLength <= editFileMaxBytes, {
    message: `Edit text exceeds the ${editFileMaxBytes}-byte limit.`,
  });

/** @public */
export const editFileInputSchema = z.object({
  targetFile: rootedFilePathSchema.describe('The target file to modify.'),
  oldString: boundedEditTextSchema.min(1, 'oldString must not be empty.').describe('The exact text to replace.'),
  newString: boundedEditTextSchema.describe('The replacement text. May be empty to delete oldString.'),
  replaceAll: z.boolean().optional().describe('Replace every match. Omit to require one unique match.'),
  expectedDigest: z
    .string()
    .regex(/^sha256:[0-9a-f]{64}$/u, 'Expected a lowercase sha256 content digest.')
    .optional()
    .describe(
      'Reviewed raw-byte digest. Requires one atomic literal edit; on conflict reread and review, never blindly retry.',
    ),
});

/** @public */
export const editFileOutputSchema = z.object({
  diffStats: diffStatsWithContentSchema.describe('Statistics and content diff for the changes made'),
  revision: writeRevisionSchema.optional().describe('Digest of the bytes this edit left at the path (R4).'),
});

/** @public */
export type DeterministicEditFileInput = z.infer<typeof editFileInputSchema> & { codeEdit?: undefined };
/** @public */
export type EditFileInput =
  | DeterministicEditFileInput
  | {
      /** Historical persisted tool parts may still carry the retired Morph input. @deprecated */
      targetFile: string;
      codeEdit: string;
      oldString?: undefined;
      newString?: undefined;
      replaceAll?: undefined;
    };
/** @public */
export type EditFileOutput = z.infer<typeof editFileOutputSchema>;
