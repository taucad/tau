import z from 'zod';
import { kernelProviders, manufacturingMethods, engineeringDisciplines } from '@taucad/types/constants';
import { toolNames, toolModes } from '#constants/tool.constants.js';
import { messageStatuses } from '#constants/message.constants.js';
import { chatModes } from '#constants/chat-mode.constants.js';

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

export const messageMetadataSchema = z.object({
  toolChoice: z
    .union([
      // Allow single tool selection or array of tools
      z.enum(toolModes),
      z.array(z.enum(toolNames)),
    ])
    .optional(),
  kernel: z.enum(kernelProviders).optional(),
  manufacturingMethod: z.enum(manufacturingMethods).optional(),
  engineeringDiscipline: z.enum(Object.keys(engineeringDisciplines)).optional(),
  createdAt: z.number().optional(),
  status: z.enum(messageStatuses).optional(),
  model: z.string().optional(),
  /**
   * Snapshot of the user's editor context at message submission time.
   * Provides the LLM with awareness of what the user is currently working on.
   */
  snapshot: snapshotSchema.optional(),
  /** Chat mode: agent (default) or plan */
  mode: z.enum(chatModes).optional(),
  /** Whether testing tools (test_model, edit_tests) are enabled */
  testingEnabled: z.boolean().optional(),
});
