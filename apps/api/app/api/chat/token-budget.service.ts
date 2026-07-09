import { Injectable } from '@nestjs/common';
import type { ModelRequest } from 'langchain';
import type { BaseMessage, UsageMetadata } from '@langchain/core/messages';
import { AIMessage, SystemMessage } from '@langchain/core/messages';
import { IMAGE_TOKEN_ESTIMATE, isImageBlock } from '#api/chat/utils/image-block.utils.js';

/** Default fraction of max input tokens that triggers compaction. */
// eslint-disable-next-line @typescript-eslint/naming-convention -- Domain constant
export const DEFAULT_CONTEXT_COMPACTION_TRIGGER_FRACTION = 0.85;

/** Conservative fallback used when the selected model does not declare a context window. */
// eslint-disable-next-line @typescript-eslint/naming-convention -- Domain constant
export const FALLBACK_CONTEXT_WINDOW = 200_000;

// eslint-disable-next-line @typescript-eslint/naming-convention -- Domain constant
const CHARS_PER_TOKEN = 4;

// eslint-disable-next-line @typescript-eslint/naming-convention -- Domain constant
const MESSAGE_OVERHEAD_TOKENS = 8;
// eslint-disable-next-line @typescript-eslint/naming-convention -- Domain constant
const CONTENT_BLOCK_OVERHEAD_TOKENS = 4;
// eslint-disable-next-line @typescript-eslint/naming-convention -- Domain constant
const TOOL_SCHEMA_OVERHEAD_TOKENS = 32;
// eslint-disable-next-line @typescript-eslint/naming-convention -- Domain constant
const SYSTEM_MESSAGE_OVERHEAD_TOKENS = 16;
// eslint-disable-next-line @typescript-eslint/naming-convention -- Domain constant
const PROMPT_CACHE_BLOCK_OVERHEAD_TOKENS = 4;
// eslint-disable-next-line @typescript-eslint/naming-convention -- Domain constant
const OVERFLOW_CALIBRATION_INCREMENT = 0.15;
// eslint-disable-next-line @typescript-eslint/naming-convention -- Domain constant
const MAX_CALIBRATION_MULTIPLIER = 3;
// eslint-disable-next-line @typescript-eslint/naming-convention -- Domain constant
const CALIBRATION_DECAY = 0.98;

type MaybeContentBlock = Record<string, unknown>;

/** @public */
export type TokenBudgetKind = 'estimated';

/** @public */
export type TokenBudgetTriggerReason = 'none' | 'estimate' | 'previous_usage' | 'overflow';

/** @public */
export type TokenBudgetComponentName =
  | 'message_content'
  | 'system_message'
  | 'tool_schemas'
  | 'tool_call_args'
  | 'media'
  | 'model_settings'
  | 'response_format'
  | 'provider_overhead'
  | 'total';

/** @public */
export type TokenBudgetComponent = {
  name: TokenBudgetComponentName;
  tokens: number;
};

/** @public */
export type TokenBudgetDecision = {
  budgetKind: TokenBudgetKind;
  shouldCompact: boolean;
  triggerReason: TokenBudgetTriggerReason;
  estimatedInputTokens: number;
  rawEstimatedInputTokens: number;
  contextWindow: number;
  triggerThreshold: number;
  calibrationMultiplier: number;
  components: TokenBudgetComponent[];
  previousUsageInputTokens?: number;
};

export type EvaluateModelRequestBudgetInput = {
  request: Pick<ModelRequest, 'messages' | 'systemMessage' | 'tools' | 'modelSettings' | 'responseFormat'>;
  modelId: string;
  providerId?: string | undefined;
  contextWindow?: number | undefined;
  previousUsageInputTokens?: number | undefined;
};

/** @public */
export type RecordObservedUsageInput = {
  modelId: string;
  providerId?: string | undefined;
  actualInputTokens: number | undefined;
  estimatedInputTokens?: number | undefined;
};

/**
 * Centralized estimate-backed token budget service.
 *
 * This service deliberately does not call provider token-count APIs. It owns
 * the conservative estimate, previous-usage hard trigger, and bounded
 * calibration slot so all middleware makes the same budget decision.
 */
@Injectable()
export class TokenBudgetService {
  private readonly calibrationByKey = new Map<string, number>();
  private readonly lastEstimateByKey = new Map<string, number>();

  public evaluateModelRequest(input: EvaluateModelRequestBudgetInput): TokenBudgetDecision {
    const contextWindow = input.contextWindow ?? FALLBACK_CONTEXT_WINDOW;
    const triggerThreshold = Math.floor(contextWindow * DEFAULT_CONTEXT_COMPACTION_TRIGGER_FRACTION);
    const rawComponents = this.estimateRawComponents(input);
    const rawEstimatedInputTokens = sumComponents(rawComponents);
    const calibrationMultiplier = this.getCalibrationMultiplier(input);
    const estimatedInputTokens = Math.ceil(rawEstimatedInputTokens * calibrationMultiplier);
    const previousUsage = findMostRecentUsageMetadata(input.request.messages);
    const previousUsageInputTokens = input.previousUsageInputTokens ?? previousUsage?.input_tokens;

    let triggerReason: TokenBudgetTriggerReason = 'none';
    if (previousUsageInputTokens !== undefined && previousUsageInputTokens >= triggerThreshold) {
      triggerReason = 'previous_usage';
    } else if (estimatedInputTokens >= triggerThreshold) {
      triggerReason = 'estimate';
    }

    this.lastEstimateByKey.set(this.key(input), estimatedInputTokens);

    return {
      budgetKind: 'estimated',
      shouldCompact: triggerReason !== 'none',
      triggerReason,
      estimatedInputTokens,
      rawEstimatedInputTokens,
      contextWindow,
      triggerThreshold,
      calibrationMultiplier,
      components: [...rawComponents, { name: 'total', tokens: estimatedInputTokens }],
      ...(previousUsageInputTokens !== undefined ? { previousUsageInputTokens } : {}),
    };
  }

  public recordObservedUsage(input: RecordObservedUsageInput): void {
    const { actualInputTokens } = input;
    if (actualInputTokens === undefined || actualInputTokens <= 0) {
      return;
    }

    const key = this.key(input);
    const estimatedInputTokens = input.estimatedInputTokens ?? this.lastEstimateByKey.get(key);
    if (estimatedInputTokens === undefined || estimatedInputTokens <= 0) {
      return;
    }

    const ratio = actualInputTokens / estimatedInputTokens;
    if (!Number.isFinite(ratio) || ratio <= 1) {
      return;
    }

    const current = this.calibrationByKey.get(key) ?? 1;
    const next = clampMultiplier(Math.max(current * CALIBRATION_DECAY, ratio));
    this.calibrationByKey.set(key, next);
  }

  public recordOverflow(input: { modelId: string; providerId?: string | undefined }): void {
    const key = this.key(input);
    const current = this.calibrationByKey.get(key) ?? 1;
    this.calibrationByKey.set(key, clampMultiplier(current + OVERFLOW_CALIBRATION_INCREMENT));
  }

  public getCalibrationMultiplier(input: { modelId: string; providerId?: string | undefined }): number {
    return this.calibrationByKey.get(this.key(input)) ?? 1;
  }

  private estimateRawComponents(input: EvaluateModelRequestBudgetInput): TokenBudgetComponent[] {
    const totals: Record<TokenBudgetComponentName, number> = {
      message_content: 0,
      system_message: 0,
      tool_schemas: 0,
      tool_call_args: 0,
      media: 0,
      model_settings: 0,
      response_format: 0,
      provider_overhead: 0,
      total: 0,
    };

    for (const message of input.request.messages) {
      // Anthropic responses carry tool-call args both as native tool_use content
      // blocks and in the normalized tool_calls array; skip the blocks so their
      // args are counted once, via tool_calls below.
      const hasToolCalls = message instanceof AIMessage && (message.tool_calls?.length ?? 0) > 0;
      const estimate = estimateContent(message.content, hasToolCalls);
      totals.message_content += estimate.textTokens;
      totals.media += estimate.mediaTokens;
      totals.tool_call_args += estimate.structuredTokens;
      totals.provider_overhead += MESSAGE_OVERHEAD_TOKENS + estimate.blockCount * CONTENT_BLOCK_OVERHEAD_TOKENS;

      if (message instanceof AIMessage && message.tool_calls?.length) {
        for (const call of message.tool_calls) {
          totals.tool_call_args += estimateStringTokens(stableStringify(call.args));
          totals.provider_overhead += CONTENT_BLOCK_OVERHEAD_TOKENS;
        }
      }
    }

    const systemContent = getSystemMessageContent(input.request.systemMessage);
    if (systemContent !== undefined) {
      const estimate = estimateContent(systemContent);
      totals.system_message += estimate.textTokens + estimate.structuredTokens;
      totals.media += estimate.mediaTokens;
      totals.provider_overhead += SYSTEM_MESSAGE_OVERHEAD_TOKENS + estimate.blockCount * CONTENT_BLOCK_OVERHEAD_TOKENS;
      totals.provider_overhead += estimate.cacheControlledBlockCount * PROMPT_CACHE_BLOCK_OVERHEAD_TOKENS;
    }

    for (const tool of input.request.tools ?? []) {
      totals.tool_schemas += estimateToolTokens(tool);
      totals.provider_overhead += TOOL_SCHEMA_OVERHEAD_TOKENS;
    }

    if (input.request.modelSettings !== undefined) {
      totals.model_settings += estimateStringTokens(stableStringify(input.request.modelSettings));
      totals.provider_overhead += CONTENT_BLOCK_OVERHEAD_TOKENS;
    }

    if (input.request.responseFormat !== undefined) {
      totals.response_format += estimateStringTokens(stableStringify(input.request.responseFormat));
      totals.provider_overhead += CONTENT_BLOCK_OVERHEAD_TOKENS;
    }

    return componentOrder
      .filter((name) => name !== 'total')
      .map((name) => ({ name, tokens: Math.ceil(totals[name]) }))
      .filter((component) => component.tokens > 0);
  }

  private key(input: { modelId: string; providerId?: string | undefined }): string {
    return `${input.providerId ?? 'unknown'}:${input.modelId}`;
  }
}

const componentOrder: readonly TokenBudgetComponentName[] = [
  'message_content',
  'system_message',
  'tool_schemas',
  'tool_call_args',
  'media',
  'model_settings',
  'response_format',
  'provider_overhead',
  'total',
];

/** @public */
export function findMostRecentUsageMetadata(messages: readonly BaseMessage[]): UsageMetadata | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]!;
    if (message instanceof AIMessage) {
      const usage = message.usage_metadata as UsageMetadata | undefined;
      if (usage) {
        return usage;
      }
    }
  }
  return undefined;
}

/** @public */
export function estimateMessageContentTokens(messages: readonly BaseMessage[]): number {
  let total = 0;
  for (const message of messages) {
    const estimate = estimateContent(message.content);
    total += estimate.textTokens + estimate.structuredTokens + estimate.mediaTokens;
  }
  return total;
}

function getSystemMessageContent(systemMessage: BaseMessage | string | undefined): BaseMessage['content'] | undefined {
  if (systemMessage === undefined) {
    return undefined;
  }
  if (typeof systemMessage === 'string') {
    return systemMessage;
  }
  if (systemMessage instanceof SystemMessage) {
    return systemMessage.content;
  }
  return systemMessage.content;
}

function estimateContent(
  content: BaseMessage['content'],
  skipToolUseArgs = false,
): {
  textTokens: number;
  structuredTokens: number;
  mediaTokens: number;
  blockCount: number;
  cacheControlledBlockCount: number;
} {
  if (typeof content === 'string') {
    return {
      textTokens: estimateStringTokens(content),
      structuredTokens: 0,
      mediaTokens: 0,
      blockCount: content.length > 0 ? 1 : 0,
      cacheControlledBlockCount: 0,
    };
  }

  if (!Array.isArray(content)) {
    return {
      textTokens: estimateStringTokens(stableStringify(content)),
      structuredTokens: 0,
      mediaTokens: 0,
      blockCount: 1,
      cacheControlledBlockCount: 0,
    };
  }

  let textTokens = 0;
  let structuredTokens = 0;
  let mediaTokens = 0;
  let cacheControlledBlockCount = 0;

  for (const block of content as MaybeContentBlock[]) {
    const isRedundantToolUse = skipToolUseArgs && block['type'] === 'tool_use';
    if (isImageBlock(block)) {
      mediaTokens += IMAGE_TOKEN_ESTIMATE;
    } else if (!isRedundantToolUse) {
      const text = block['text'] ?? block['reasoning'] ?? block['thinking'];
      if (typeof text === 'string') {
        textTokens += estimateStringTokens(text);
      } else {
        structuredTokens += estimateStringTokens(stableStringify(block));
      }
    }

    if (isCacheControlled(block)) {
      cacheControlledBlockCount += 1;
    }
  }

  return {
    textTokens,
    structuredTokens,
    mediaTokens,
    blockCount: content.length,
    cacheControlledBlockCount,
  };
}

function estimateToolTokens(tool: unknown): number {
  if (!tool || typeof tool !== 'object') {
    return estimateStringTokens(stableStringify(tool));
  }

  const record = tool as Record<string, unknown>;
  const schema = record['schema'] ?? record['argsSchema'] ?? record['inputSchema'];
  return estimateStringTokens(
    stableStringify({
      name: record['name'],
      description: record['description'],
      schema,
    }),
  );
}

function estimateStringTokens(value: string): number {
  if (value.length === 0) {
    return 0;
  }
  return Math.ceil(value.length / CHARS_PER_TOKEN);
}

function stableStringify(value: unknown): string {
  const seen = new WeakSet<object>();

  const normalize = (input: unknown, depth: number): unknown => {
    if (input === null || typeof input !== 'object') {
      if (typeof input === 'function' || typeof input === 'symbol') {
        return String(input);
      }
      return input;
    }

    if (seen.has(input)) {
      return '[Circular]';
    }
    if (depth > 6) {
      return `[${input.constructor?.name ?? 'Object'}]`;
    }

    seen.add(input);

    if (Array.isArray(input)) {
      return input.map((item) => normalize(item, depth + 1));
    }

    const record = input as Record<string, unknown>;
    const normalized: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      const valueForKey = record[key];
      if (typeof valueForKey === 'function') {
        continue;
      }
      normalized[key] = normalize(valueForKey, depth + 1);
    }
    return normalized;
  };

  try {
    return JSON.stringify(normalize(value, 0));
  } catch {
    return String(value);
  }
}

function isCacheControlled(block: MaybeContentBlock): boolean {
  const value = block['cache_control'];
  return value !== undefined && value !== null;
}

function sumComponents(components: readonly TokenBudgetComponent[]): number {
  return components.reduce((sum, component) => sum + component.tokens, 0);
}

function clampMultiplier(value: number): number {
  if (!Number.isFinite(value)) {
    return 1;
  }
  return Math.min(MAX_CALIBRATION_MULTIPLIER, Math.max(1, value));
}
