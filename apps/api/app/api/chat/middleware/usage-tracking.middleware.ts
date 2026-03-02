import { createMiddleware } from 'langchain';
import type { AIMessage } from '@langchain/core/messages';
import { z } from 'zod';
import { idPrefix } from '@taucad/types/constants';
import { generatePrefixedId } from '@taucad/utils/id';
import type { ModelService } from '#api/models/model.service.js';

/**
 * Context schema for usage tracking middleware.
 * Requires modelId and modelService to calculate token costs.
 */
const usageContextSchema = z.object({
  modelId: z.string(),
  modelService: z.custom<ModelService>(),
});

/**
 * Middleware that tracks token usage and costs after each model call.
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
export const usageTrackingMiddleware = createMiddleware({
  name: 'UsageTracking',
  contextSchema: usageContextSchema,

  afterModel(state, runtime) {
    const { context } = runtime;
    const { modelId, modelService } = context;

    // Get the last message (should be the AIMessage with usage_metadata)
    const lastMessage = state.messages.at(-1) as AIMessage | undefined;

    if (lastMessage?.usage_metadata) {
      const usage = lastMessage.usage_metadata;

      // Extract cache token counts from metadata
      let cacheReadTokens = usage.input_token_details?.cache_read ?? 0;
      let cacheWriteTokens = usage.input_token_details?.cache_creation ?? 0;

      // Some providers (like Anthropic) have cache values doubled due to streaming
      // aggregation - both message_start and message_delta report cache values,
      // which get summed during chunk concatenation. We need to halve them.
      if (modelService.streamingDoublesCacheTokens(modelId)) {
        cacheReadTokens = Math.round(cacheReadTokens / 2);
        cacheWriteTokens = Math.round(cacheWriteTokens / 2);
      }

      const reasoningTokens = usage.output_token_details?.reasoning ?? 0;

      // Extract raw usage tokens from the message metadata
      const rawUsage = {
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
        reasoningTokens,
        cacheReadTokens,
        cacheWriteTokens,
      };

      // Normalize tokens (some providers include cached tokens in input count)
      const normalizedUsage = modelService.normalizeUsageTokens(modelId, rawUsage);

      // Calculate costs based on the model's pricing
      const usageCost = modelService.getModelCost(modelId, normalizedUsage);

      // Generate a unique ID for this usage record
      const usageId = generatePrefixedId(idPrefix.data);

      // Write usage data to the stream
      // The writer is available when streaming with 'custom' mode enabled
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

    // No state modification needed
  },
});
