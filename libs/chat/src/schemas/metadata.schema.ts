// oxlint-disable-next-line eslint-plugin-import/no-named-as-default -- standard zod default import
import z from 'zod';
import {
  cameraPresets,
  paneIdSchema,
  projectPathSchema,
  workbenchIdSchema,
  workbenchLanesSchema,
  workbenchTabSchema,
} from '@taucad/workbench';
import { fileDigestSchema, refusalReasons } from '#schemas/tools/arrange-workbench.tool.schema.js';
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
  baseFileTreeEntrySchema.extend({ type: z.literal('file') }).strict(),
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
  workbench: z
    .strictObject({
      layoutDigest: fileDigestSchema,
      lanes: workbenchLanesSchema,
      visible: z.array(workbenchTabSchema).max(32),
      views: z
        .array(
          z.strictObject({
            id: workbenchIdSchema,
            name: z.string().max(40),
            entryPath: projectPathSchema.nullable(),
            camera: z.union([z.enum(cameraPresets), z.enum(['look', 'pose'])]),
          }),
        )
        .max(16),
      entries: z
        .array(
          z.strictObject({
            path: projectPathSchema,
            operationTimeout: z.number().int().optional(),
            hidden: z.number().int(),
          }),
        )
        .max(16),
      unavailable: z.array(paneIdSchema).max(16),
      refused: z.array(z.strictObject({ tab: workbenchTabSchema, reason: z.enum(refusalReasons) })).max(16),
    })
    .optional(),
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
