/**
 * This file is a copy of the ai library's core/prompt/message.ts file.
 * It is used to validate the messages sent to the ai library.
 */

import { z } from 'zod';
import { messageMetadataSchema } from '#schemas/metadata.schema.js';
import { providerMetadataSchema } from '#schemas/message-provider.schema.js';
import { commonReasoningMetadataSchema } from '#schemas/common-reasoning-metadata.schema.js';
import type { MyUIMessage } from '#types/message.types.js';
import { usageDataSchema, contextCompactionDataSchema, contextUsageDataSchema } from '#schemas/message-data.schema.js';
import { editFileInputSchema, editFileOutputSchema } from '#schemas/tools/edit-file.tool.schema.js';
import { testModelOutputSchema } from '@taucad/testing';
import { webBrowserInputSchema, webBrowserOutputSchema } from '#schemas/tools/web-browser.tool.schema.js';
import { webSearchInputSchema, webSearchOutputSchema } from '#schemas/tools/web-search.tool.schema.js';
import { readFileInputSchema, readFileOutputSchema } from '#schemas/tools/read-file.tool.schema.js';
import { listDirectoryInputSchema, listDirectoryOutputSchema } from '#schemas/tools/list-directory.tool.schema.js';
import { createFileInputSchema, createFileOutputSchema } from '#schemas/tools/create-file.tool.schema.js';
import { deleteFileInputSchema, deleteFileOutputSchema } from '#schemas/tools/delete-file.tool.schema.js';
import { grepInputSchema, grepOutputSchema } from '#schemas/tools/grep.tool.schema.js';
import { globSearchInputSchema, globSearchOutputSchema } from '#schemas/tools/glob-search.tool.schema.js';
import {
  getKernelResultInputSchema,
  getKernelResultOutputSchema,
} from '#schemas/tools/get-kernel-result.tool.schema.js';
import { exportGeometryInputSchema, exportGeometryOutputSchema } from '#schemas/tools/export-geometry.tool.schema.js';
import { screenshotInputSchema, screenshotOutputSchema } from '#schemas/tools/screenshot.tool.schema.js';
import { toolName } from '#constants/tool.constants.js';
import type { ToolName } from '#types/tool.types.js';
import { getToolInputSchema } from '#schemas/tool-input.registry.js';
import { testModelInputSchema } from '#schemas/tools/test-model.tool.schema.js';

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
    // Output-error state — `input` may be absent because the LLM stream was
    // interrupted before arguments fully serialised; the partial value is
    // moved to `rawInput` by the preprocess healer at the schema's top level.
    // See docs/policy/interrupted-tool-call-contract.md.
    z.object({
      type: z.literal(toolType),
      toolCallId: z.string(),
      state: z.literal('output-error'),
      providerExecuted: z.boolean().optional(),
      input: z.union([inputSchema, z.undefined()]),
      rawInput: z.unknown().optional(),
      output: z.never().optional(),
      errorText: z.string(),
      callProviderMetadata: providerMetadataSchema.optional(),
    }),
    // Approval-lifecycle states — backfilled from the upstream AI SDK
    // `validateUIMessages` schema (`node_modules/ai/src/ui/validate-ui-messages.ts`).
    // See docs/research/interrupted-tool-call-validation-failure.md R7.
    z.object({
      type: z.literal(toolType),
      toolCallId: z.string(),
      state: z.literal('approval-requested'),
      providerExecuted: z.boolean().optional(),
      input: inputSchema,
      output: z.never().optional(),
      errorText: z.never().optional(),
      callProviderMetadata: providerMetadataSchema.optional(),
      approval: z.object({
        id: z.string(),
        approved: z.never().optional(),
        reason: z.never().optional(),
      }),
    }),
    z.object({
      type: z.literal(toolType),
      toolCallId: z.string(),
      state: z.literal('approval-responded'),
      providerExecuted: z.boolean().optional(),
      input: inputSchema,
      output: z.never().optional(),
      errorText: z.never().optional(),
      callProviderMetadata: providerMetadataSchema.optional(),
      approval: z.object({
        id: z.string(),
        approved: z.boolean(),
        reason: z.string().optional(),
      }),
    }),
    z.object({
      type: z.literal(toolType),
      toolCallId: z.string(),
      state: z.literal('output-denied'),
      providerExecuted: z.boolean().optional(),
      input: inputSchema,
      output: z.never().optional(),
      errorText: z.never().optional(),
      callProviderMetadata: providerMetadataSchema.optional(),
      approval: z.object({
        id: z.string(),
        approved: z.literal(false),
        reason: z.string().optional(),
      }),
    }),
  ] as const;
};

// Specialized helper for tools with empty input schemas
// Uses z.record(z.never()) for input which correctly types to Record<string, never>
const createEmptyInputToolSchemas = <Name extends ToolName, Output extends z.ZodObject<z.ZodRawShape> | z.ZodString>(
  toolName: Name,
  outputSchema: Output,
) => {
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
      output: outputSchema,
      errorText: z.never().optional(),
      callProviderMetadata: providerMetadataSchema.optional(),
      preliminary: z.boolean().optional(),
    }),
    // Output-error state — see comment in createToolSchemas above.
    z.object({
      type: z.literal(toolType),
      toolCallId: z.string(),
      state: z.literal('output-error'),
      providerExecuted: z.boolean().optional(),
      input: z.union([emptyInput, z.undefined()]),
      rawInput: z.unknown().optional(),
      output: z.never().optional(),
      errorText: z.string(),
      callProviderMetadata: providerMetadataSchema.optional(),
    }),
    // Approval-lifecycle states — see createToolSchemas notes; backfilled
    // to match upstream `validateUIMessages`.
    z.object({
      type: z.literal(toolType),
      toolCallId: z.string(),
      state: z.literal('approval-requested'),
      providerExecuted: z.boolean().optional(),
      input: emptyInput,
      output: z.never().optional(),
      errorText: z.never().optional(),
      callProviderMetadata: providerMetadataSchema.optional(),
      approval: z.object({
        id: z.string(),
        approved: z.never().optional(),
        reason: z.never().optional(),
      }),
    }),
    z.object({
      type: z.literal(toolType),
      toolCallId: z.string(),
      state: z.literal('approval-responded'),
      providerExecuted: z.boolean().optional(),
      input: emptyInput,
      output: z.never().optional(),
      errorText: z.never().optional(),
      callProviderMetadata: providerMetadataSchema.optional(),
      approval: z.object({
        id: z.string(),
        approved: z.boolean(),
        reason: z.string().optional(),
      }),
    }),
    z.object({
      type: z.literal(toolType),
      toolCallId: z.string(),
      state: z.literal('output-denied'),
      providerExecuted: z.boolean().optional(),
      input: emptyInput,
      output: z.never().optional(),
      errorText: z.never().optional(),
      callProviderMetadata: providerMetadataSchema.optional(),
      approval: z.object({
        id: z.string(),
        approved: z.literal(false),
        reason: z.string().optional(),
      }),
    }),
  ] as const;
};

// Generate tool part schemas by iterating over tools and preserving discriminated unions
const toolPartSchemas = [
  ...createToolSchemas(toolName.webSearch, webSearchInputSchema, webSearchOutputSchema),
  ...createToolSchemas(toolName.webBrowser, webBrowserInputSchema, webBrowserOutputSchema),
  // Testing tools
  ...createToolSchemas(toolName.testModel, testModelInputSchema, testModelOutputSchema),
  // Filesystem tools
  ...createToolSchemas(toolName.readFile, readFileInputSchema, readFileOutputSchema),
  ...createToolSchemas(toolName.listDirectory, listDirectoryInputSchema, listDirectoryOutputSchema),
  ...createToolSchemas(toolName.createFile, createFileInputSchema, createFileOutputSchema),
  ...createToolSchemas(toolName.editFile, editFileInputSchema, editFileOutputSchema),
  ...createToolSchemas(toolName.deleteFile, deleteFileInputSchema, deleteFileOutputSchema),
  ...createToolSchemas(toolName.grep, grepInputSchema, grepOutputSchema),
  ...createToolSchemas(toolName.globSearch, globSearchInputSchema, globSearchOutputSchema),
  // Kernel tools
  ...createToolSchemas(toolName.getKernelResult, getKernelResultInputSchema, getKernelResultOutputSchema),
  ...createToolSchemas(toolName.exportGeometry, exportGeometryInputSchema, exportGeometryOutputSchema),
  // Screenshot tool
  ...createToolSchemas(toolName.screenshot, screenshotInputSchema, screenshotOutputSchema),
  // Transfer tools use empty input schemas with string output
  ...createEmptyInputToolSchemas(toolName.transferToCadExpert, z.string()),
  ...createEmptyInputToolSchemas(toolName.transferToResearchExpert, z.string()),
  ...createEmptyInputToolSchemas(toolName.transferBackToSupervisor, z.string()),
];

const rawUiMessagesSchema = z
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
              // Narrow `common` to typed reasoning timing (server-stamped on
              // reasoning-start/end); sibling provider namespaces stay on the
              // loose record schema.
              providerMetadata: providerMetadataSchema
                .and(z.object({ common: commonReasoningMetadataSchema.optional() }))
                .optional(),
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
              type: z.literal('data-usage'),
              id: z.string().optional(),
              data: usageDataSchema,
            }),
            z.object({
              type: z.literal('data-context-compaction'),
              id: z.string().optional(),
              data: contextCompactionDataSchema,
            }),
            z.object({
              type: z.literal('data-context-usage'),
              id: z.string().optional(),
              data: contextUsageDataSchema,
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
              rawInput: z.unknown().optional(),
              providerExecuted: z.boolean().optional(),
              output: z.never().optional(),
              errorText: z.string(),
              callProviderMetadata: providerMetadataSchema.optional(),
            }),
            // Approval-lifecycle states for dynamic tool parts. Mirrors
            // upstream `validateUIMessages`.
            z.object({
              type: z.literal('dynamic-tool'),
              toolName: z.string(),
              toolCallId: z.string(),
              state: z.literal('approval-requested'),
              input: z.unknown(),
              providerExecuted: z.boolean().optional(),
              output: z.never().optional(),
              errorText: z.never().optional(),
              callProviderMetadata: providerMetadataSchema.optional(),
              approval: z.object({
                id: z.string(),
                approved: z.never().optional(),
                reason: z.never().optional(),
              }),
            }),
            z.object({
              type: z.literal('dynamic-tool'),
              toolName: z.string(),
              toolCallId: z.string(),
              state: z.literal('approval-responded'),
              input: z.unknown(),
              providerExecuted: z.boolean().optional(),
              output: z.never().optional(),
              errorText: z.never().optional(),
              callProviderMetadata: providerMetadataSchema.optional(),
              approval: z.object({
                id: z.string(),
                approved: z.boolean(),
                reason: z.string().optional(),
              }),
            }),
            z.object({
              type: z.literal('dynamic-tool'),
              toolName: z.string(),
              toolCallId: z.string(),
              state: z.literal('output-denied'),
              input: z.unknown(),
              providerExecuted: z.boolean().optional(),
              output: z.never().optional(),
              errorText: z.never().optional(),
              callProviderMetadata: providerMetadataSchema.optional(),
              approval: z.object({
                id: z.string(),
                approved: z.literal(false),
                reason: z.string().optional(),
              }),
            }),
            ...toolPartSchemas,
          ]),
        )
        .nonempty('Message must contain at least one part'),
    }),
  )
  .nonempty('Messages array must not be empty');

/**
 * Sole sanitiser for interrupted tool parts on the wire: walks every tool part
 * in `output-error` state and demotes any `input` that no longer satisfies the
 * strict per-tool schema into `rawInput`, clearing `input` to `undefined`.
 *
 * This recovers inbound payloads (regenerate, edit, retry, send) that resubmit
 * an `output-error` part whose `input` was only partially serialised before the
 * LLM stream was interrupted — across every caller (web, CLI, SDKs) and any
 * chats whose `output-error` parts were captured before this preprocess
 * existed. The healer runs as `z.preprocess` inside `uiMessagesSchema` itself,
 * so strict per-tool input validation downstream still rejects genuinely
 * malformed completed tool calls.
 *
 * Client-side healing is intentionally absent — the API is the single source
 * of truth for normalising interrupted tool parts, and the UI renders
 * `output-error` parts directly without depending on a valid `input`. See
 * docs/policy/interrupted-tool-call-contract.md ("Anti-Pattern: Duplicate
 * Healing on the Client").
 *
 * Static tool parts (e.g. `tool-read_file`) consult the registry; dynamic
 * tool parts have no strict input contract and are passed through unchanged.
 *
 * See docs/policy/interrupted-tool-call-contract.md.
 */
const healInterruptedToolParts = (input: unknown): unknown => {
  if (!Array.isArray(input)) {
    return input;
  }
  return input.map((message: unknown) => {
    if (!message || typeof message !== 'object' || !('parts' in message) || !Array.isArray(message.parts)) {
      return message;
    }
    const originalParts: unknown[] = message.parts;
    let healedParts: unknown[] | undefined;
    for (let index = 0; index < originalParts.length; index += 1) {
      const part: unknown = originalParts[index];
      if (
        !part ||
        typeof part !== 'object' ||
        (part as { state?: unknown }).state !== 'output-error' ||
        (part as { input?: unknown }).input === undefined ||
        typeof (part as { type?: unknown }).type !== 'string' ||
        (part as { type: string }).type === 'dynamic-tool'
      ) {
        continue;
      }
      const typedPart = part as { type: string; input: unknown };
      const inputSchema = getToolInputSchema(typedPart.type);
      if (!inputSchema || inputSchema.safeParse(typedPart.input).success) {
        continue;
      }
      healedParts ??= [...originalParts];
      healedParts[index] = { ...typedPart, input: undefined, rawInput: typedPart.input };
    }
    return healedParts ? { ...message, parts: healedParts } : message;
  });
};

/** @public */
export const uiMessagesSchema: z.ZodType<MyUIMessage[]> = z.preprocess(healInterruptedToolParts, rawUiMessagesSchema);

/**
 * Test-only export of the raw preprocess. Asserts reference-identity behaviour
 * (no allocation on the no-heal path, copy-on-write on the heal path) without
 * going through Zod's discriminated-union resolver, which always copies.
 *
 * @internal
 */
// oxlint-disable-next-line tau-lint/require-public-export-jsdoc -- @internal test-only export
export const _healInterruptedToolPartsForTesting = healInterruptedToolParts;
