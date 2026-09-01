// oxlint-disable-next-line eslint-plugin-import/no-named-as-default -- standard zod default import
import z from 'zod';
import { messageStatuses } from '#constants/message.constants.js';

/**
 * Schema for a file entry in the project filesystem.
 * Constrained to match the FileTreeEntry type from @taucad/types.
 */
const fileTreeEntrySchema = z.object({
  path: z.string(),
  name: z.string(),
  type: z.enum(['file', 'dir']),
  size: z.number(),
});

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
    .object({
      path: z.string(),
      name: z.string(),
    })
    .optional(),
  /** The files currently open in editor tabs */
  openFiles: z
    .array(
      z.object({
        path: z.string(),
        name: z.string(),
      }),
    )
    .optional(),
});

/**
 * Per-message metadata stamped onto `MyUIMessage` rows for UI display:
 * creation timestamp (badges, ordering) and lifecycle status
 * (`pending` / `success` / `error` / `cancelled` — drives spinners, retry
 * affordances, and the hydration auto-regenerate path).
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
