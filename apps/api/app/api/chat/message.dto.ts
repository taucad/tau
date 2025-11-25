/**
 * This file is a copy of the ai library's core/prompt/message.ts file.
 * It is used to validate the messages sent to the ai library.
 */

import { z } from 'zod';
import { kernelProviders, manufacturingMethods, tools, toolSelections } from '@taucad/types/constants';

const requiredUnknownSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.unknown()),
  z.record(z.string(), z.unknown()),
]);

const toolCallSchema = z.object({
  toolCallId: z.string(),
  toolName: z.string(),
  args: requiredUnknownSchema,
});

const toolResultSchema = z.object({
  ...toolCallSchema.shape,
  result: requiredUnknownSchema,
});

const toolInvocationPartialCallSchema = z.object({
  ...toolCallSchema.shape,
  state: z.literal('partial-call'),
  step: z.number().optional(),
});

const toolInvocationCallSchema = z.object({
  ...toolCallSchema.shape,
  state: z.literal('call'),
  step: z.number().optional(),
});

const toolInvocationResultSchema = z.object({
  ...toolResultSchema.shape,
  state: z.literal('result'),
  step: z.number().optional(),
});

// Core/prompt/content-part.ts
const textPartSchema = z.object({
  type: z.literal('text'),
  text: z.string(),
});
const filePartSchema = z.object({
  type: z.literal('file'),
  data: z.string(),
  mimeType: z.string(),
});
const reasoningPartSchema = z.object({
  type: z.literal('reasoning'),
  reasoning: z.string(),
  details: z.array(
    z.union([
      z.object({ type: z.literal('text'), text: z.string(), signature: z.string().optional() }),
      z.object({ type: z.literal('redacted'), data: z.string() }),
    ]),
  ),
});

const toolInvocationPartSchema = z.object({
  type: z.literal('tool-invocation'),
  toolInvocation: z.union([toolInvocationPartialCallSchema, toolInvocationCallSchema, toolInvocationResultSchema]),
});

const toolChoiceSchema = z.union([z.enum(toolSelections), z.array(z.enum(tools))]);

const messageMetadataSchema = z.object({
  kernel: z.enum(kernelProviders),
  toolChoice: toolChoiceSchema.optional(),
  manufacturingMethod: z.enum(manufacturingMethods).optional(),
});

export const uiMessageSchema = z.object({
  id: z.string(),
  createdAt: z.date(),
  content: z.string(),
  role: z.enum(['system', 'user', 'assistant', 'data']),
  parts: z.array(z.union([textPartSchema, filePartSchema, reasoningPartSchema, toolInvocationPartSchema])),
  metadata: messageMetadataSchema,
  model: z.string(),
});
