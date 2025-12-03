/**
 * This file is a copy of the ai library's core/prompt/message.ts file.
 * It is used to validate the messages sent to the ai library.
 */

import { z } from 'zod';
import { messageMetadataSchema } from '#schemas/metadata.schema.js';
import { providerMetadataSchema } from '#schemas/message-provider.schema.js';
import type { MyUIMessage } from '#types/message.types.js';
import { dataPartSchema } from '#schemas/message-data.schema.js';
import { fileEditInputSchema, fileEditOutputSchema } from '#schemas/tools/file-edit.tool.schema.js';
import { imageAnalysisInputSchema, imageAnalysisOutputSchema } from '#schemas/tools/image-analysis.tool.schema.js';
import { webBrowserInputSchema, webBrowserOutputSchema } from '#schemas/tools/web-browser.tool.schema.js';
import { webSearchInputSchema, webSearchOutputSchema } from '#schemas/tools/web-search.tool.schema.js';
import { toolName } from '#constants/tool.constants.js';
import type { ToolName } from '#types/tool.types.js';

// Copied from https://github.com/vercel/ai/blob/0ed1ee6f34a252a9d1970d99ea8585529cbceeed/packages/ai/src/ui/validate-ui-messages.ts.
// This is necessary as the AI SDK's `validateUIMessages` function is async and nestjs-zod does
// not support async validation.
// @see https://github.com/BenLorantfy/nestjs-zod/issues/145
//
// Modifications:
// - removed approval related fields

// Helper function to create tool schemas for a specific tool
// Uses proper generic constraints to preserve exact schema types
const createToolSchemas = <
  Name extends ToolName,
  Input extends z.ZodObject<z.ZodRawShape>,
  Output extends z.ZodObject<z.ZodRawShape> | z.ZodArray<z.ZodType> | z.ZodString,
>(
  toolName: Name,
  inputSchema: Input,
  outputSchema: Output,
) => {
  const toolType = `tool-${toolName}` as const;
  return [
    // Input-streaming state
    z.object({
      type: z.literal(toolType),
      toolCallId: z.string(),
      state: z.literal('input-streaming'),
      providerExecuted: z.boolean().optional(),
      input: z.union([inputSchema.partial(), z.undefined()]),
      output: z.never().optional(),
      errorText: z.never().optional(),
    }),
    // Input-available state
    z.object({
      type: z.literal(toolType),
      toolCallId: z.string(),
      state: z.literal('input-available'),
      providerExecuted: z.boolean().optional(),
      input: inputSchema,
      output: z.never().optional(),
      errorText: z.never().optional(),
      callProviderMetadata: providerMetadataSchema.optional(),
    }),
    // Output-available state
    z.object({
      type: z.literal(toolType),
      toolCallId: z.string(),
      state: z.literal('output-available'),
      providerExecuted: z.boolean().optional(),
      input: inputSchema,
      output: outputSchema,
      errorText: z.never().optional(),
      callProviderMetadata: providerMetadataSchema.optional(),
      preliminary: z.boolean().optional(),
    }),
    // Output-error state
    z.object({
      type: z.literal(toolType),
      toolCallId: z.string(),
      state: z.literal('output-error'),
      providerExecuted: z.boolean().optional(),
      input: inputSchema,
      output: z.never().optional(),
      errorText: z.string(),
      callProviderMetadata: providerMetadataSchema.optional(),
    }),
  ] as const;
};

// Specialized helper for transfer tools with empty input schemas
// Uses z.record(z.never()) for input which correctly types to Record<string, never>
const createTransferToolSchemas = <Name extends ToolName>(toolName: Name) => {
  const toolType = `tool-${toolName}` as const;
  // Empty input schema that correctly resolves to Record<string, never>
  const emptyInput = z.record(z.string(), z.never());
  return [
    // Input-streaming state
    z.object({
      type: z.literal(toolType),
      toolCallId: z.string(),
      state: z.literal('input-streaming'),
      providerExecuted: z.boolean().optional(),
      input: z.union([emptyInput, z.undefined()]),
      output: z.never().optional(),
      errorText: z.never().optional(),
    }),
    // Input-available state
    z.object({
      type: z.literal(toolType),
      toolCallId: z.string(),
      state: z.literal('input-available'),
      providerExecuted: z.boolean().optional(),
      input: emptyInput,
      output: z.never().optional(),
      errorText: z.never().optional(),
      callProviderMetadata: providerMetadataSchema.optional(),
    }),
    // Output-available state
    z.object({
      type: z.literal(toolType),
      toolCallId: z.string(),
      state: z.literal('output-available'),
      providerExecuted: z.boolean().optional(),
      input: emptyInput,
      output: z.string(),
      errorText: z.never().optional(),
      callProviderMetadata: providerMetadataSchema.optional(),
      preliminary: z.boolean().optional(),
    }),
    // Output-error state
    z.object({
      type: z.literal(toolType),
      toolCallId: z.string(),
      state: z.literal('output-error'),
      providerExecuted: z.boolean().optional(),
      input: emptyInput,
      output: z.never().optional(),
      errorText: z.string(),
      callProviderMetadata: providerMetadataSchema.optional(),
    }),
  ] as const;
};

// Generate tool part schemas by iterating over tools and preserving discriminated unions
const toolPartSchemas = [
  ...createToolSchemas(toolName.webSearch, webSearchInputSchema, webSearchOutputSchema),
  ...createToolSchemas(toolName.webBrowser, webBrowserInputSchema, webBrowserOutputSchema),
  ...createToolSchemas(toolName.fileEdit, fileEditInputSchema, fileEditOutputSchema),
  ...createToolSchemas(toolName.imageAnalysis, imageAnalysisInputSchema, imageAnalysisOutputSchema),
  // Transfer tools use specialized schemas (empty input, string output)
  ...createTransferToolSchemas(toolName.transferToCadExpert),
  ...createTransferToolSchemas(toolName.transferToResearchExpert),
  ...createTransferToolSchemas(toolName.transferBackToSupervisor),
];

export const uiMessagesSchema: z.ZodType<MyUIMessage[]> = z
  .array(
    z.object({
      id: z.string(),
      role: z.enum(['system', 'user', 'assistant']),
      metadata: messageMetadataSchema.optional(),
      parts: z
        .array(
          z.union([
            z.object({
              type: z.literal('text'),
              text: z.string(),
              state: z.enum(['streaming', 'done']).optional(),
              providerMetadata: providerMetadataSchema.optional(),
            }),
            z.object({
              type: z.literal('reasoning'),
              text: z.string(),
              state: z.enum(['streaming', 'done']).optional(),
              providerMetadata: providerMetadataSchema.optional(),
            }),
            z.object({
              type: z.literal('source-url'),
              sourceId: z.string(),
              url: z.string(),
              title: z.string().optional(),
              providerMetadata: providerMetadataSchema.optional(),
            }),
            z.object({
              type: z.literal('source-document'),
              sourceId: z.string(),
              mediaType: z.string(),
              title: z.string(),
              filename: z.string().optional(),
              providerMetadata: providerMetadataSchema.optional(),
            }),
            z.object({
              type: z.literal('file'),
              mediaType: z.string(),
              filename: z.string().optional(),
              url: z.string(),
              providerMetadata: providerMetadataSchema.optional(),
            }),
            z.object({
              type: z.literal('step-start'),
            }),
            z.object({
              type: z.enum(Object.values(dataPartSchema)),
              id: z.string().optional(),
              data: z.unknown(),
            }),
            z.object({
              type: z.literal('dynamic-tool'),
              toolName: z.string(),
              toolCallId: z.string(),
              state: z.literal('input-streaming'),
              input: z.unknown(),
              providerExecuted: z.boolean().optional(),
              output: z.never().optional(),
              errorText: z.never().optional(),
            }),
            z.object({
              type: z.literal('dynamic-tool'),
              toolName: z.string(),
              toolCallId: z.string(),
              state: z.literal('input-available'),
              input: z.unknown(),
              providerExecuted: z.boolean().optional(),
              output: z.never().optional(),
              errorText: z.never().optional(),
              callProviderMetadata: providerMetadataSchema.optional(),
            }),
            z.object({
              type: z.literal('dynamic-tool'),
              toolName: z.string(),
              toolCallId: z.string(),
              state: z.literal('output-available'),
              input: z.unknown(),
              providerExecuted: z.boolean().optional(),
              output: z.unknown(),
              errorText: z.never().optional(),
              callProviderMetadata: providerMetadataSchema.optional(),
              preliminary: z.boolean().optional(),
            }),
            z.object({
              type: z.literal('dynamic-tool'),
              toolName: z.string(),
              toolCallId: z.string(),
              state: z.literal('output-error'),
              input: z.unknown(),
              providerExecuted: z.boolean().optional(),
              output: z.never().optional(),
              errorText: z.string(),
              callProviderMetadata: providerMetadataSchema.optional(),
            }),
            ...toolPartSchemas,
          ]),
        )
        .nonempty('Message must contain at least one part'),
    }),
  )
  .nonempty('Messages array must not be empty');
