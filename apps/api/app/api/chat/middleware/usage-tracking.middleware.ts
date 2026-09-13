import { createMiddleware } from 'langchain';
import type { AgentMiddleware } from 'langchain';
import type { AIMessage } from '@langchain/core/messages';
import { z } from 'zod';
import { AttributeKey, GenAiTokenType } from '@taucad/telemetry';
import { idPrefix } from '@taucad/types/constants';
import { generatePrefixedId } from '@taucad/utils/id';
import type { ModelService } from '#api/models/model.service.js';
import type { MetricsService } from '#telemetry/metrics.js';

/**
 * Context schema for usage tracking middleware.
 * Requires modelId and modelService to calculate token costs.
 */
const usageContextSchema = z.object({
  modelId: z.string(),
  modelService: z.custom<ModelService>(),
});

/**
 * Create a middleware that tracks token usage and costs after each model call.
 *
 * Uses the `afterModel` hook to:
 * 1. Extract `usage_metadata` from the last AIMessage
 * 2. Normalize tokens using ModelService.normalizeUsageTokens()
 * 3. Calculate costs using ModelService.getModelCost()
 * 4. Write usage data to the stream via runtime.writer()
 *
 * The usage data is emitted as a custom stream event with type 'usage',
 * which gets transformed to a 'data-usage' part in the UI message stream.
 */
export const createUsageTrackingMiddleware = (metricsService: MetricsService): AgentMiddleware =>
  createMiddleware({
    name: 'UsageTracking',
    contextSchema: usageContextSchema,

    afterModel(state, runtime) {
      const { context } = runtime;
      const { modelId, modelService } = context;

      /* oxlint-disable-next-line typescript-eslint/no-unsafe-call -- LangChain state.messages is typed as any */
      const lastMessage = state.messages.at(-1) as AIMessage | undefined;

      if (lastMessage?.usage_metadata) {
        const usage = lastMessage.usage_metadata;

        const cacheReadTokens = usage.input_token_details?.cache_read ?? 0;
        const cacheWriteTokens = usage.input_token_details?.cache_creation ?? 0;
        const reasoningTokens = usage.output_token_details?.reasoning ?? 0;

        const rawUsage = {
          inputTokens: usage.input_tokens,
          outputTokens: usage.output_tokens,
          reasoningTokens,
          cacheReadTokens,
          cacheWriteTokens,
        };

        const normalizedUsage = modelService.normalizeUsageTokens(modelId, rawUsage);
        const usageCost = modelService.getModelCost(modelId, normalizedUsage);
        const usageId = generatePrefixedId(idPrefix.data);

        const otelProviderName = modelService.getOtelProviderName(modelId);
        const responseModel = String(
          (lastMessage.response_metadata['model'] as string | undefined) ??
            lastMessage.response_metadata.model_name ??
            '',
        );
        const metricAttributes: Record<string, string> = {
          [AttributeKey.GEN_AI_OPERATION_NAME]: 'chat',
          [AttributeKey.GEN_AI_REQUEST_MODEL]: modelId,
          ...(otelProviderName ? { [AttributeKey.GEN_AI_PROVIDER_NAME]: otelProviderName } : {}),
          ...(responseModel ? { [AttributeKey.GEN_AI_RESPONSE_MODEL]: responseModel } : {}),
        };
        // Provider-agnostic token-usage metrics. We record the **normalized**
        // input count (cache-read tokens already subtracted; see
        // `ModelService.normalizeUsageTokens`) so the prompt-cache hit rate
        // formula `cache_read / (input + cache_read)` works identically across
        // providers — including Anthropic and Vertex AI Gemini, both of which
        // double-count cache reads inside the raw `input_tokens` field
        // (see `Provider.inputTokensIncludesCacheReadTokens` in
        // `apps/api/app/api/providers/provider.service.ts`).
        //
        // Splitting cache reads onto their own series is the precondition for
        // the "Prompt cache hit rate" panel in
        // `infra/grafana/dashboards/ai-agent.json` and the
        // `GenAiPromptCacheHitRateLow` warning alert.
        metricsService.genAiTokenUsage.record(normalizedUsage.inputTokens, {
          ...metricAttributes,
          [AttributeKey.GEN_AI_TOKEN_TYPE]: GenAiTokenType.INPUT,
        });
        metricsService.genAiTokenUsage.record(normalizedUsage.outputTokens, {
          ...metricAttributes,
          [AttributeKey.GEN_AI_TOKEN_TYPE]: GenAiTokenType.OUTPUT,
        });
        if (cacheReadTokens > 0) {
          metricsService.genAiTokenUsage.record(cacheReadTokens, {
            ...metricAttributes,
            [AttributeKey.GEN_AI_TOKEN_TYPE]: GenAiTokenType.CACHE_READ,
          });
        }
        if (usageCost.totalCost) {
          metricsService.genAiCost.add(usageCost.totalCost, metricAttributes);
        }

        const { writer } = runtime;
        if (writer) {
          writer({
            type: 'usage',
            id: usageId,
            model: modelId,
            ...normalizedUsage,
            ...usageCost,
          });
        }
      }
    },
  });
