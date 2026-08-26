import { createMiddleware } from 'langchain';
import type { AgentMiddleware } from 'langchain';
import { AIMessage, RemoveMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import { REMOVE_ALL_MESSAGES } from '@langchain/langgraph';
import { z } from 'zod';
import { toolName } from '@taucad/chat/constants';
import { normalizeGeoSpecRunFilterInputAliases } from '@taucad/chat/schemas/tools/test-model-input-normalizer';
import { AttributeKey } from '@taucad/telemetry';
import type { ModelService } from '#api/models/model.service.js';
import { cloneAiMessage } from '#api/chat/utils/ai-message-clone.js';
import type { MetricsService } from '#telemetry/metrics.js';

const repairKind = 'bracket_array_alias';

const compatibilityContextSchema = z.looseObject({
  modelId: z.string().optional(),
  modelService: z.custom<ModelService>().optional(),
});

type ToolCallLike = {
  id?: string;
  name: string;
  args: unknown;
  type?: string;
  [key: string]: unknown;
};

type NormalizedToolCall = {
  toolCall: ToolCallLike;
  healed: boolean;
};

type ToolInputNormalizer = typeof normalizeGeoSpecRunFilterInputAliases;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const toolInputNormalizers: Partial<Record<string, ToolInputNormalizer>> = {
  [toolName.testModel]: normalizeGeoSpecRunFilterInputAliases,
};

function normalizeToolCall(toolCall: ToolCallLike): NormalizedToolCall {
  const normalizer = toolInputNormalizers[toolCall.name];
  if (!normalizer) {
    return { toolCall, healed: false };
  }

  const normalized = normalizer(toolCall.args);
  if (!normalized.changed || !isRecord(normalized.input)) {
    return { toolCall, healed: false };
  }

  return {
    toolCall: {
      ...toolCall,
      args: normalized.input,
    },
    healed: true,
  };
}

function normalizeToolCalls(toolCalls: readonly ToolCallLike[] | undefined): {
  toolCalls: readonly ToolCallLike[];
  healedToolCalls: readonly ToolCallLike[];
} {
  if (!toolCalls || toolCalls.length === 0) {
    return { toolCalls: toolCalls ?? [], healedToolCalls: [] };
  }

  const healedToolCalls: ToolCallLike[] = [];
  const nextToolCalls = toolCalls.map((toolCall) => {
    const normalized = normalizeToolCall(toolCall);
    if (normalized.healed) {
      healedToolCalls.push(normalized.toolCall);
    }
    return normalized.toolCall;
  });

  return { toolCalls: healedToolCalls.length === 0 ? toolCalls : nextToolCalls, healedToolCalls };
}

function matchingNormalizedToolCall(
  block: Record<string, unknown>,
  toolCalls: readonly ToolCallLike[],
): ToolCallLike | undefined {
  const blockId = block['id'];
  if (typeof blockId === 'string') {
    return toolCalls.find((toolCall) => toolCall.id === blockId);
  }

  return undefined;
}

function normalizeToolCallContent(
  content: AIMessage['content'],
  toolCalls: readonly ToolCallLike[],
): AIMessage['content'] {
  if (!Array.isArray(content) || toolCalls.length === 0) {
    return content;
  }

  const nextContent = content.map((block) => {
    if (!isRecord(block)) {
      return block;
    }

    const blockType = block.type;
    if (blockType !== 'tool_call' && blockType !== 'tool_use') {
      return block;
    }

    const normalizedToolCall = matchingNormalizedToolCall(block, toolCalls);
    if (!normalizedToolCall || !isRecord(normalizedToolCall.args)) {
      return block;
    }

    if (blockType === 'tool_use') {
      return isRecord(block['input']) ? { ...block, input: normalizedToolCall.args } : block;
    }

    return isRecord(block['args']) ? { ...block, args: normalizedToolCall.args } : block;
  });

  return nextContent.every((block, index) => block === content[index])
    ? content
    : (nextContent as AIMessage['content']);
}

function rebuildAiMessage(message: AIMessage, toolCalls: readonly ToolCallLike[]): AIMessage {
  return cloneAiMessage(message, {
    content: normalizeToolCallContent(message.content, toolCalls),
    toolCalls: toolCalls as AIMessage['tool_calls'],
  });
}

function recordRepair(
  metricsService: MetricsService,
  context: z.infer<typeof compatibilityContextSchema>,
  tool: string,
): void {
  const { modelId, modelService } = context;
  const providerName = modelId ? modelService?.getOtelProviderName(modelId) : undefined;

  metricsService.genAiToolInputRepairs.add(1, {
    [AttributeKey.GEN_AI_TOOL_NAME]: tool,
    [AttributeKey.GEN_AI_TOOL_INPUT_REPAIR_KIND]: repairKind,
    ...(modelId ? { [AttributeKey.GEN_AI_REQUEST_MODEL]: modelId } : {}),
    ...(providerName ? { [AttributeKey.GEN_AI_PROVIDER_NAME]: providerName } : {}),
  });
}

function recordRepairs(
  metricsService: MetricsService,
  context: z.infer<typeof compatibilityContextSchema>,
  healedToolCalls: readonly ToolCallLike[],
): void {
  if (healedToolCalls.length === 0) {
    return;
  }

  for (const toolCall of healedToolCalls) {
    recordRepair(metricsService, context, toolCall.name);
  }
}

/**
 * Canonicalizes known model-emitted tool-input aliases before strict tool schema
 * validation. The canonical Zod/JSON Schema contract remains unchanged.
 */
export const createToolInputCompatibilityMiddleware = (metricsService: MetricsService): AgentMiddleware =>
  createMiddleware({
    name: 'ToolInputCompatibility',
    contextSchema: compatibilityContextSchema,

    afterModel(state, runtime) {
      const messages = state.messages as BaseMessage[];
      const lastMessage = messages.at(-1);
      if (!lastMessage || !AIMessage.isInstance(lastMessage)) {
        return undefined;
      }

      const { toolCalls, healedToolCalls } = normalizeToolCalls(
        lastMessage.tool_calls as readonly ToolCallLike[] | undefined,
      );
      if (healedToolCalls.length === 0) {
        return undefined;
      }

      recordRepairs(metricsService, runtime.context, healedToolCalls);
      const healedMessage = rebuildAiMessage(lastMessage, toolCalls);
      if (lastMessage.id) {
        return { messages: [healedMessage] };
      }

      return {
        messages: [new RemoveMessage({ id: REMOVE_ALL_MESSAGES }), ...messages.slice(0, -1), healedMessage],
      };
    },

    async wrapToolCall(request, handler) {
      const normalized = normalizeToolCall(request.toolCall as ToolCallLike);
      if (!normalized.healed) {
        return handler(request);
      }

      recordRepair(metricsService, request.runtime.context, normalized.toolCall.name);
      return handler({
        ...request,
        toolCall: normalized.toolCall as typeof request.toolCall,
      });
    },
  });
