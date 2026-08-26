// oxlint-disable-next-line eslint-plugin-import/no-named-as-default -- standard zod default import
import z from 'zod';
import { messageStatuses } from '#constants/message.constants.js';
import { binaryFileContentMetadataSchema, textFileContentMetadataSchema } from '#schemas/file-metadata.schema.js';

/**
 * Schema for a file entry in the project filesystem.
 * Constrained to match the FileTreeEntry type from @taucad/types.
 */
const baseFileTreeEntrySchema = z.object({
  path: z.string(),
  name: z.string(),
  size: z.number().int().nonnegative(),
});

const fileTreeEntrySchema = z.union([
  baseFileTreeEntrySchema.extend({ type: z.literal('dir') }).strict(),
  baseFileTreeEntrySchema.extend({ type: z.literal('file'), ...textFileContentMetadataSchema.shape }).strict(),
  baseFileTreeEntrySchema.extend({ type: z.literal('file'), ...binaryFileContentMetadataSchema.shape }).strict(),
]);

const baseFileReferenceSchema = z
  .object({
    path: z.string(),
    name: z.string(),
  })
  .strict();

const fileReferenceSchema = z.union([
  baseFileReferenceSchema
    .extend({ size: z.number().int().nonnegative(), ...textFileContentMetadataSchema.shape })
    .strict(),
  baseFileReferenceSchema
    .extend({ size: z.number().int().nonnegative(), ...binaryFileContentMetadataSchema.shape })
    .strict(),
  baseFileReferenceSchema,
]);

/**
 * Schema for the editor context snapshot.
 * Provides the LLM with awareness of what the user is currently working on.
 * @public
 */
export const snapshotSchema = z.object({
  /** Array of file entries representing the project filesystem */
  fileTree: z.array(fileTreeEntrySchema).optional(),
  /** The file currently being rendered by the CAD engine */
  activeFile: z
    .union([
      baseFileReferenceSchema
        .extend({ size: z.number().int().nonnegative(), ...textFileContentMetadataSchema.shape })
        .strict(),
      baseFileReferenceSchema
        .extend({ size: z.number().int().nonnegative(), ...binaryFileContentMetadataSchema.shape })
        .strict(),
      baseFileReferenceSchema,
    ])
    .optional(),
  /** The files currently open in editor tabs */
  openFiles: z.array(fileReferenceSchema).optional(),
});

/**
 * Per-message metadata stamped onto `MyUIMessage` rows for UI display:
 * creation timestamp (badges, ordering) and lifecycle status
 * (`pending` / `success` / `error` / `cancelled` — drives spinners and retry
 * affordances). Persisted command intent, such as one-shot startup
 * auto-submit, must live outside message metadata.
 *
 * Per-turn agent configuration (kernel, model, mode, toolChoice,
 * testingEnabled, snapshot, contextPayload) lives on `body.agent` and is
 * enforced by `cadAgentConfigSchema`. Server handlers must never derive
 * request configuration from per-message metadata.
 *
 * @public
 */
export const messageMetadataSchema = z.object({
  createdAt: z.number().optional(),
  status: z.enum(messageStatuses).optional(),
});
