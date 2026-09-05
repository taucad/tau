import { isStaticToolUIPart, safeValidateUIMessages } from 'ai';
import type { SafeValidateUIMessagesResult } from 'ai';
import { z } from 'zod';
import { isRecord } from '@taucad/utils/schema';
import {
  normalizeProjectPathToolInputAliases,
  normalizeProjectPathToolOutputAliases,
} from '#schemas/tools/project-path-input-normalizer.js';
import { messageMetadataSchema } from '#schemas/metadata.schema.js';
import { commonReasoningMetadataSchema } from '#schemas/common-reasoning-metadata.schema.js';
import { dataPartSchema } from '#schemas/message-data.schema.js';
import { getToolInputSchema, uiMessageTools } from '#schemas/tool-input.registry.js';
import type { MyUIMessage } from '#types/message.types.js';

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
  readonly output?: unknown;
};

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
  if (typeof part.type !== 'string') {
    return part;
  }

  const { type } = part;
  const staticTool = isStaticToolPartType(type);
  const dynamicTool = isDynamicToolPartType(type);
  if (!staticTool && !dynamicTool) {
    return part;
  }

  const tool = dynamicTool && typeof part.toolName === 'string' ? part.toolName : type.replace(/^tool-/, '');
  const pathNormalized = normalizeProjectPathToolInputAliases(tool, part.input);
  const outputNormalized = normalizeProjectPathToolOutputAliases(tool, part.output);
  const normalizedPart =
    pathNormalized.changed || outputNormalized.changed
      ? {
          ...part,
          ...(pathNormalized.changed ? { input: pathNormalized.input } : {}),
          ...(outputNormalized.changed ? { output: outputNormalized.input } : {}),
        }
      : part;
  if (typeof normalizedPart.state !== 'string') {
    return normalizedPart;
  }

  const { state } = normalizedPart;
  if (historical && (state === 'input-streaming' || state === 'input-available')) {
    return normalizeHistoricalInProgressToolPart(normalizedPart, type);
  }

  if (staticTool && state === 'output-error' && normalizedPart.input !== undefined) {
    const inputSchema = getToolInputSchema(type);
    return inputSchema ? withInvalidInputDemoted(normalizedPart, inputSchema) : normalizedPart;
  }

  return normalizedPart;
};

const normalizeMessageParts = (message: RawMessageWithParts, historical: boolean): RawMessageWithParts => {
  if (!Array.isArray(message.parts)) {
    return message;
  }

  let nextParts: unknown[] | undefined;
  for (let index = 0; index < message.parts.length; index += 1) {
    const part: unknown = message.parts[index];
    if (!isRecord(part)) {
      continue;
    }

    const normalizedPart = normalizeToolPart(part, historical);
    if (normalizedPart === part) {
      continue;
    }

    nextParts ??= message.parts.map((part: unknown) => part);
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
    const message: unknown = input[index];
    if (!isRecord(message)) {
      continue;
    }

    const historical = message['role'] === 'assistant' && seenLaterUser;
    const normalizedMessage = normalizeMessageParts(message, historical);
    if (normalizedMessage !== message) {
      nextMessages ??= input.map((message: unknown) => message);
      nextMessages[index] = normalizedMessage;
    }

    if (message['role'] === 'user') {
      seenLaterUser = true;
    }
  }

  return nextMessages ?? input;
};

const validateCommonReasoningMetadata = (messages: MyUIMessage[]): z.ZodError | undefined => {
  for (const message of messages) {
    for (const part of message.parts) {
      if (part.type === 'reasoning' && part.providerMetadata?.['common'] !== undefined) {
        const result = commonReasoningMetadataSchema.safeParse(part.providerMetadata['common']);
        if (!result.success) {
          return result.error;
        }
      }
    }
  }
  return undefined;
};

const withMessageInputPath = (error: z.ZodError, messageIndex: number, partIndex: number): z.ZodError =>
  new z.ZodError(
    error.issues.map((issue) => ({
      ...issue,
      path: ['messages', messageIndex, 'parts', partIndex, 'input', ...issue.path],
    })),
  );

const validateStaticToolLifecycleInputs = (messages: MyUIMessage[]): z.ZodError | undefined => {
  for (const [messageIndex, message] of messages.entries()) {
    for (const [partIndex, part] of message.parts.entries()) {
      if (!isStaticToolUIPart(part)) {
        continue;
      }
      const inputSchema = getToolInputSchema(part.type);
      if (!inputSchema) {
        return new z.ZodError([
          {
            code: 'custom',
            path: ['messages', messageIndex, 'parts', partIndex, 'type'],
            message: `Unsupported static tool: ${part.type}`,
          },
        ]);
      }
      const schema =
        part.state === 'input-streaming' && inputSchema instanceof z.ZodObject ? inputSchema.partial() : inputSchema;
      if (
        part.state !== 'input-streaming' &&
        part.state !== 'approval-requested' &&
        part.state !== 'approval-responded' &&
        part.state !== 'output-denied'
      ) {
        continue;
      }
      if (part.state === 'input-streaming' && part.input === undefined) {
        continue;
      }
      const result = schema.safeParse(part.input);
      if (!result.success) {
        return withMessageInputPath(result.error, messageIndex, partIndex);
      }
    }
  }
  return undefined;
};

/** Validates and normalizes Tau UI messages through the installed AI SDK. @public */
export const safeValidateUiMessages = async (messages: unknown): Promise<SafeValidateUIMessagesResult<MyUIMessage>> => {
  const result = await safeValidateUIMessages<MyUIMessage>({
    messages: normalizeToolLifecycleParts(messages),
    metadataSchema: messageMetadataSchema.optional(),
    dataSchemas: dataPartSchema.shape,
    tools: uiMessageTools,
  });
  if (!result.success) {
    return result;
  }

  const extensionError = validateStaticToolLifecycleInputs(result.data) ?? validateCommonReasoningMetadata(result.data);
  return extensionError ? { success: false, error: extensionError } : result;
};

/** Validates Tau UI messages or throws the validation error. @public */
export const validateUiMessages = async (messages: unknown): Promise<MyUIMessage[]> => {
  const result = await safeValidateUiMessages(messages);
  if (!result.success) {
    throw result.error;
  }
  return result.data;
};

/**
 * Synchronous envelope used only for DTO typing and JSON Schema generation.
 * Elements remain `unknown` until the shared async chat-turn parser performs
 * full AI SDK message validation.
 * @public
 */
export const uiMessagesSchema = z.array(z.unknown()).nonempty('Messages array must not be empty');

/** @internal */
// oxlint-disable-next-line tau-lint/require-public-export-jsdoc -- @internal test-only export
export const _normalizeToolLifecyclePartsForTesting = normalizeToolLifecycleParts;
