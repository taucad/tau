import { createMiddleware } from 'langchain';
import type { AgentMiddleware } from 'langchain';
import type { ProviderDiagnosticsContext, ProviderModelCallSummary } from '#api/chat/utils/provider-diagnostics.js';
import { summarizeModelCallForDebugLog, summarizeModelCallMessages } from '#api/chat/utils/provider-diagnostics.js';

const googleIncompatibleToolBlockTypes = new Set([
  'tool_use',
  'tool_call',
  'tool_call_chunk',
  'input_json_delta',
  'server_tool_use',
]);
const anthropicContentToolUseBlockTypes = new Set(['tool_use', 'tool_call', 'tool_call_chunk', 'server_tool_use']);

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function summaryHasContentPartType(summary: ProviderModelCallSummary, types: ReadonlySet<string>): boolean {
  return summary.tail.some((message) => {
    const content = asRecord(message.content);
    const parts = content?.['parts'];
    if (!Array.isArray(parts)) {
      return false;
    }

    return parts.some((part) => {
      const record = asRecord(part);
      const type = record?.['type'];
      return typeof type === 'string' && types.has(type);
    });
  });
}

function findDuplicateAnthropicToolUseId(summary: ProviderModelCallSummary): Record<string, unknown> | undefined {
  for (const message of summary.tail) {
    const content = asRecord(message.content);
    const parts = content?.['parts'];
    if (!Array.isArray(parts)) {
      continue;
    }

    const seenIds = new Set<string>();
    for (const part of parts) {
      const record = asRecord(part);
      const type = record?.['type'];
      const id = record?.['id'];
      if (typeof type !== 'string' || !anthropicContentToolUseBlockTypes.has(type) || typeof id !== 'string') {
        continue;
      }

      if (seenIds.has(id)) {
        return {
          messageIndex: message.index,
          id,
          parts: parts.map((candidate) => {
            const candidateRecord = asRecord(candidate);
            return {
              type: candidateRecord?.['type'],
              id: candidateRecord?.['id'],
              name: candidateRecord?.['name'],
            };
          }),
        };
      }
      seenIds.add(id);
    }
  }

  return undefined;
}

export const createProviderDiagnosticsMiddleware = (context: ProviderDiagnosticsContext): AgentMiddleware =>
  createMiddleware({
    name: 'ProviderDiagnostics',

    async wrapModelCall(request, handler) {
      const summary = summarizeModelCallMessages(request.messages);
      context.setLatestModelCallSummary(summary);

      if (context.providerId === 'vertexai' && summaryHasContentPartType(summary, googleIncompatibleToolBlockTypes)) {
        context.logger.error(
          {
            chatId: context.chatId,
            modelId: context.modelId,
            providerId: context.providerId,
            providerDiagnostics: {
              modelCall: summary,
            },
          },
          `Prepared Google Vertex model call contains unsupported tool content blocks for ${context.modelId}`,
        );
      }
      const duplicateAnthropicToolUse = findDuplicateAnthropicToolUseId(summary);
      if (context.providerId === 'anthropic' && duplicateAnthropicToolUse) {
        context.logger.error(
          {
            chatId: context.chatId,
            modelId: context.modelId,
            providerId: context.providerId,
            duplicateAnthropicToolUse,
            providerDiagnostics: {
              modelCall: summary,
            },
          },
          `Prepared Anthropic model call contains duplicate tool_use ids for ${context.modelId}`,
        );
      }

      if (context.verbose && context.logger.debug) {
        context.logger.debug(
          {
            chatId: context.chatId,
            modelId: context.modelId,
            providerId: context.providerId,
            providerDiagnostics: {
              modelCall: summarizeModelCallForDebugLog(summary),
            },
          },
          `Prepared provider model call for ${context.modelId}`,
        );
      }

      return handler(request);
    },
  });
