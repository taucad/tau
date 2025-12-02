import z from 'zod';
import { kernelProviders, manufacturingMethods, engineeringDisciplines } from '@taucad/types/constants';
import { toolNames, toolModes } from '#constants/tool.constants.js';
import { messageStatuses } from '#constants/message.constants.js';

export const messageMetadataSchema = z.object({
  usageCost: z
    .object({
      inputTokens: z.number(),
      outputTokens: z.number(),
      cachedReadTokens: z.number(),
      cachedWriteTokens: z.number().optional(),
      usageCost: z.number().optional(),
    })
    .optional(),
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
});
