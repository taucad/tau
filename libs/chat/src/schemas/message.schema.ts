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
import { useSkillInputSchema, useSkillOutputSchema } from '#schemas/tools/use-skill.tool.schema.js';
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
// - static completed tool states keep Tau's strict per-tool input/output schemas
// - interrupted/historical tool lifecycle states are normalized in preprocess

const approvalRequestedSchema = z.object({
  id: z.string(),
  approved: z.never().optional(),
  reason: z.never().optional(),
});

const approvalRespondedSchema = z.object({
  id: z.string(),
  approved: z.boolean(),
  reason: z.string().optional(),
});

const approvalApprovedSchema = z
  .object({
    id: z.string(),
    approved: z.literal(true),
    reason: z.string().optional(),
  })
  .optional();

const approvalDeniedSchema = z.object({
  id: z.string(),
  approved: z.literal(false),
  reason: z.string().optional(),
});

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
      title: z.string().optional(),
      state: z.literal('input-streaming'),
      providerExecuted: z.boolean().optional(),
      callProviderMetadata: providerMetadataSchema.optional(),
      input: z.unknown().optional(),
      rawInput: z.unknown().optional(),
      output: z.never().optional(),
      errorText: z.never().optional(),
      approval: z.never().optional(),
    }),
    // Input-available state
    z.object({
      type: z.literal(toolType),
      toolCallId: z.string(),
      title: z.string().optional(),
      state: z.literal('input-available'),
      providerExecuted: z.boolean().optional(),
      input: inputSchema,
      rawInput: z.unknown().optional(),
      output: z.never().optional(),
      errorText: z.never().optional(),
      callProviderMetadata: providerMetadataSchema.optional(),
      approval: z.never().optional(),
    }),
    // Output-available state
    z.object({
      type: z.literal(toolType),
      toolCallId: z.string(),
      title: z.string().optional(),
      state: z.literal('output-available'),
      providerExecuted: z.boolean().optional(),
      input: inputSchema,
      rawInput: z.unknown().optional(),
      output: outputSchema,
      errorText: z.never().optional(),
      callProviderMetadata: providerMetadataSchema.optional(),
      preliminary: z.boolean().optional(),
      approval: approvalApprovedSchema,
    }),
    // Output-error state — `input` may be absent because the LLM stream was
    // interrupted before arguments fully serialised; invalid static input is
    // moved to `rawInput` by the lifecycle normalizer at the schema boundary.
    // See docs/policy/interrupted-tool-call-contract.md.
    z.object({
      type: z.literal(toolType),
      toolCallId: z.string(),
      title: z.string().optional(),
      state: z.literal('output-error'),
      providerExecuted: z.boolean().optional(),
      input: z.union([inputSchema, z.undefined()]),
      rawInput: z.unknown().optional(),
      output: z.never().optional(),
      errorText: z.string(),
      callProviderMetadata: providerMetadataSchema.optional(),
      approval: approvalApprovedSchema,
    }),
    // Approval-lifecycle states — backfilled from the upstream AI SDK
    // `validateUIMessages` schema (`node_modules/ai/src/ui/validate-ui-messages.ts`).
    // See docs/research/interrupted-tool-call-validation-failure.md R7.
    z.object({
      type: z.literal(toolType),
      toolCallId: z.string(),
      title: z.string().optional(),
      state: z.literal('approval-requested'),
      providerExecuted: z.boolean().optional(),
      input: z.unknown(),
      rawInput: z.unknown().optional(),
      output: z.never().optional(),
      errorText: z.never().optional(),
      callProviderMetadata: providerMetadataSchema.optional(),
      approval: approvalRequestedSchema,
    }),
    z.object({
      type: z.literal(toolType),
      toolCallId: z.string(),
      title: z.string().optional(),
      state: z.literal('approval-responded'),
      providerExecuted: z.boolean().optional(),
      input: z.unknown(),
      rawInput: z.unknown().optional(),
      output: z.never().optional(),
      errorText: z.never().optional(),
      callProviderMetadata: providerMetadataSchema.optional(),
      approval: approvalRespondedSchema,
    }),
    z.object({
      type: z.literal(toolType),
      toolCallId: z.string(),
      title: z.string().optional(),
      state: z.literal('output-denied'),
      providerExecuted: z.boolean().optional(),
      input: z.unknown(),
      rawInput: z.unknown().optional(),
      output: z.never().optional(),
      errorText: z.never().optional(),
      callProviderMetadata: providerMetadataSchema.optional(),
      approval: approvalDeniedSchema,
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
      title: z.string().optional(),
      state: z.literal('input-streaming'),
      providerExecuted: z.boolean().optional(),
      callProviderMetadata: providerMetadataSchema.optional(),
      input: z.unknown().optional(),
      rawInput: z.unknown().optional(),
      output: z.never().optional(),
      errorText: z.never().optional(),
      approval: z.never().optional(),
    }),
    // Input-available state
    z.object({
      type: z.literal(toolType),
      toolCallId: z.string(),
      title: z.string().optional(),
      state: z.literal('input-available'),
      providerExecuted: z.boolean().optional(),
      input: emptyInput,
      rawInput: z.unknown().optional(),
      output: z.never().optional(),
      errorText: z.never().optional(),
      callProviderMetadata: providerMetadataSchema.optional(),
      approval: z.never().optional(),
    }),
    // Output-available state
    z.object({
      type: z.literal(toolType),
      toolCallId: z.string(),
      title: z.string().optional(),
      state: z.literal('output-available'),
      providerExecuted: z.boolean().optional(),
      input: emptyInput,
      rawInput: z.unknown().optional(),
      output: outputSchema,
      errorText: z.never().optional(),
      callProviderMetadata: providerMetadataSchema.optional(),
      preliminary: z.boolean().optional(),
      approval: approvalApprovedSchema,
    }),
    // Output-error state — see comment in createToolSchemas above.
    z.object({
      type: z.literal(toolType),
      toolCallId: z.string(),
      title: z.string().optional(),
      state: z.literal('output-error'),
      providerExecuted: z.boolean().optional(),
      input: z.union([emptyInput, z.undefined()]),
      rawInput: z.unknown().optional(),
      output: z.never().optional(),
      errorText: z.string(),
      callProviderMetadata: providerMetadataSchema.optional(),
      approval: approvalApprovedSchema,
    }),
    // Approval-lifecycle states — see createToolSchemas notes; backfilled
    // to match upstream `validateUIMessages`.
    z.object({
      type: z.literal(toolType),
      toolCallId: z.string(),
      title: z.string().optional(),
      state: z.literal('approval-requested'),
      providerExecuted: z.boolean().optional(),
      input: z.unknown(),
      rawInput: z.unknown().optional(),
      output: z.never().optional(),
      errorText: z.never().optional(),
      callProviderMetadata: providerMetadataSchema.optional(),
      approval: approvalRequestedSchema,
    }),
    z.object({
      type: z.literal(toolType),
      toolCallId: z.string(),
      title: z.string().optional(),
      state: z.literal('approval-responded'),
      providerExecuted: z.boolean().optional(),
      input: z.unknown(),
      rawInput: z.unknown().optional(),
      output: z.never().optional(),
      errorText: z.never().optional(),
      callProviderMetadata: providerMetadataSchema.optional(),
      approval: approvalRespondedSchema,
    }),
    z.object({
      type: z.literal(toolType),
      toolCallId: z.string(),
      title: z.string().optional(),
      state: z.literal('output-denied'),
      providerExecuted: z.boolean().optional(),
      input: z.unknown(),
      rawInput: z.unknown().optional(),
      output: z.never().optional(),
      errorText: z.never().optional(),
      callProviderMetadata: providerMetadataSchema.optional(),
      approval: approvalDeniedSchema,
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
  ...createToolSchemas(toolName.useSkill, useSkillInputSchema, useSkillOutputSchema),
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
              title: z.string().optional(),
              state: z.literal('input-streaming'),
              input: z.unknown().optional(),
              rawInput: z.unknown().optional(),
              providerExecuted: z.boolean().optional(),
              callProviderMetadata: providerMetadataSchema.optional(),
              output: z.never().optional(),
              errorText: z.never().optional(),
              approval: z.never().optional(),
            }),
            z.object({
              type: z.literal('dynamic-tool'),
              toolName: z.string(),
              toolCallId: z.string(),
              title: z.string().optional(),
              state: z.literal('input-available'),
              input: z.unknown(),
              rawInput: z.unknown().optional(),
              providerExecuted: z.boolean().optional(),
              output: z.never().optional(),
              errorText: z.never().optional(),
              callProviderMetadata: providerMetadataSchema.optional(),
              approval: z.never().optional(),
            }),
            z.object({
              type: z.literal('dynamic-tool'),
              toolName: z.string(),
              toolCallId: z.string(),
              title: z.string().optional(),
              state: z.literal('output-available'),
              input: z.unknown(),
              rawInput: z.unknown().optional(),
              providerExecuted: z.boolean().optional(),
              output: z.unknown(),
              errorText: z.never().optional(),
              callProviderMetadata: providerMetadataSchema.optional(),
              preliminary: z.boolean().optional(),
              approval: approvalApprovedSchema,
            }),
            z.object({
              type: z.literal('dynamic-tool'),
              toolName: z.string(),
              toolCallId: z.string(),
              title: z.string().optional(),
              state: z.literal('output-error'),
              input: z.unknown().optional(),
              rawInput: z.unknown().optional(),
              providerExecuted: z.boolean().optional(),
              output: z.never().optional(),
              errorText: z.string(),
              callProviderMetadata: providerMetadataSchema.optional(),
              approval: approvalApprovedSchema,
            }),
            // Approval-lifecycle states for dynamic tool parts. Mirrors
            // upstream `validateUIMessages`.
            z.object({
              type: z.literal('dynamic-tool'),
              toolName: z.string(),
              toolCallId: z.string(),
              title: z.string().optional(),
              state: z.literal('approval-requested'),
              input: z.unknown(),
              rawInput: z.unknown().optional(),
              providerExecuted: z.boolean().optional(),
              output: z.never().optional(),
              errorText: z.never().optional(),
              callProviderMetadata: providerMetadataSchema.optional(),
              approval: approvalRequestedSchema,
            }),
            z.object({
              type: z.literal('dynamic-tool'),
              toolName: z.string(),
              toolCallId: z.string(),
              title: z.string().optional(),
              state: z.literal('approval-responded'),
              input: z.unknown(),
              rawInput: z.unknown().optional(),
              providerExecuted: z.boolean().optional(),
              output: z.never().optional(),
              errorText: z.never().optional(),
              callProviderMetadata: providerMetadataSchema.optional(),
              approval: approvalRespondedSchema,
            }),
            z.object({
              type: z.literal('dynamic-tool'),
              toolName: z.string(),
              toolCallId: z.string(),
              title: z.string().optional(),
              state: z.literal('output-denied'),
              input: z.unknown(),
              rawInput: z.unknown().optional(),
              providerExecuted: z.boolean().optional(),
              output: z.never().optional(),
              errorText: z.never().optional(),
              callProviderMetadata: providerMetadataSchema.optional(),
              approval: approvalDeniedSchema,
            }),
            ...toolPartSchemas,
          ]),
        )
        .nonempty('Message must contain at least one part'),
    }),
  )
  .nonempty('Messages array must not be empty');

type RawMessageWithParts = {
  readonly role?: unknown;
  readonly parts?: unknown;
};

type RawToolLikePart = {
  readonly type?: unknown;
  readonly toolName?: unknown;
  readonly toolCallId?: unknown;
  readonly state?: unknown;
  readonly input?: unknown;
  readonly rawInput?: unknown;
  readonly errorText?: unknown;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isStaticToolPartType = (type: string): boolean => type.startsWith('tool-');

const isDynamicToolPartType = (type: string): boolean => type === 'dynamic-tool';

const getToolNameForInterruptedPart = (part: RawToolLikePart, type: string): string =>
  type === 'dynamic-tool' && typeof part.toolName === 'string' ? part.toolName : type.replace(/^tool-/, '');

const buildInterruptedErrorText = (part: RawToolLikePart, type: string): string => {
  if (typeof part.errorText === 'string' && part.errorText.length > 0) {
    return part.errorText;
  }

  const toolCallId = typeof part.toolCallId === 'string' ? part.toolCallId : '';
  return JSON.stringify({
    errorCode: 'USER_INTERRUPTED',
    message: 'Interrupted by user.',
    toolName: getToolNameForInterruptedPart(part, type),
    toolCallId,
  });
};

const withInvalidInputDemoted = (part: RawToolLikePart, inputSchema: z.ZodType): RawToolLikePart => {
  if (part.input === undefined || inputSchema.safeParse(part.input).success) {
    return part;
  }

  return { ...part, input: undefined, rawInput: part.input };
};

const normalizeHistoricalInProgressToolPart = (part: RawToolLikePart, type: string): RawToolLikePart => {
  const next = {
    ...part,
    state: 'output-error',
    errorText: buildInterruptedErrorText(part, type),
  };

  if (isDynamicToolPartType(type)) {
    return next;
  }

  const inputSchema = getToolInputSchema(type);
  return inputSchema ? withInvalidInputDemoted(next, inputSchema) : next;
};

const normalizeToolPart = (part: RawToolLikePart, historical: boolean): RawToolLikePart => {
  if (typeof part.type !== 'string' || typeof part.state !== 'string') {
    return part;
  }

  const { type, state } = part;
  const staticTool = isStaticToolPartType(type);
  const dynamicTool = isDynamicToolPartType(type);
  if (!staticTool && !dynamicTool) {
    return part;
  }

  if (historical && (state === 'input-streaming' || state === 'input-available')) {
    return normalizeHistoricalInProgressToolPart(part, type);
  }

  if (staticTool && state === 'output-error' && part.input !== undefined) {
    const inputSchema = getToolInputSchema(type);
    return inputSchema ? withInvalidInputDemoted(part, inputSchema) : part;
  }

  return part;
};

const normalizeMessageParts = (message: RawMessageWithParts, historical: boolean): RawMessageWithParts => {
  if (!Array.isArray(message.parts)) {
    return message;
  }

  let nextParts: unknown[] | undefined;
  for (let index = 0; index < message.parts.length; index += 1) {
    const part = message.parts[index];
    if (!isRecord(part)) {
      continue;
    }

    const normalizedPart = normalizeToolPart(part, historical);
    if (normalizedPart === part) {
      continue;
    }

    nextParts ??= [...message.parts];
    nextParts[index] = normalizedPart;
  }

  return nextParts ? { ...message, parts: nextParts } : message;
};

/**
 * Normalizes interrupted tool lifecycle records before strict UI-message
 * validation. Historical assistant tool parts followed by a later user message
 * are no longer live stream state; stale `input-streaming` / `input-available`
 * static and dynamic tool parts are canonicalized to `output-error` so the
 * downstream provider-pairing path can synthesize a coherent interrupted result.
 *
 * Static tool parts consult `tool-input.registry.ts` only when strict validation
 * is meaningful, preserving the hot path and keeping completed tool input
 * schemas authoritative. Dynamic tools have no static input contract and are
 * normalized by lifecycle shape plus `toolName`.
 */
const normalizeToolLifecycleParts = (input: unknown): unknown => {
  if (!Array.isArray(input)) {
    return input;
  }

  let nextMessages: unknown[] | undefined;
  let seenLaterUser = false;
  for (let index = input.length - 1; index >= 0; index -= 1) {
    const message = input[index];
    if (!isRecord(message)) {
      continue;
    }

    const historical = message['role'] === 'assistant' && seenLaterUser;
    const normalizedMessage = normalizeMessageParts(message, historical);
    if (normalizedMessage !== message) {
      nextMessages ??= [...input];
      nextMessages[index] = normalizedMessage;
    }

    if (message['role'] === 'user') {
      seenLaterUser = true;
    }
  }

  return nextMessages ?? input;
};

/** @public */
export const uiMessagesSchema: z.ZodType<MyUIMessage[]> = z.preprocess(
  normalizeToolLifecycleParts,
  rawUiMessagesSchema,
);

/**
 * Test-only export of the raw preprocess. Asserts reference-identity behavior
 * (no allocation on the no-heal path, copy-on-write on the heal path) without
 * going through Zod's discriminated-union resolver, which always copies.
 *
 * @internal
 */
// oxlint-disable-next-line tau-lint/require-public-export-jsdoc -- @internal test-only export
export const _normalizeToolLifecyclePartsForTesting = normalizeToolLifecycleParts;
