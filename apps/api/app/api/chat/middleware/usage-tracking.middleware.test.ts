import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { AIMessage } from '@langchain/core/messages';
import { AttributeKey, GenAiTokenType } from '@taucad/telemetry';
import { MetricsService } from '#telemetry/metrics.js';
import type { ModelService } from '#api/models/model.service.js';
import { createUsageTrackingMiddleware } from '#api/chat/middleware/usage-tracking.middleware.js';
import { resolveMiddlewareHook } from '#testing/middleware-testing.utils.js';

const mockModelService = mock<ModelService>();
const metricsService = new MetricsService();

vi.mock('@taucad/utils/id', () => ({
  generatePrefixedId: vi.fn(() => 'dat_test_123'),
}));

/* eslint-disable @typescript-eslint/naming-convention -- LangChain API uses snake_case */
const createAIMessageWithUsage = (overrides?: {
  inputTokens?: number;
  outputTokens?: number;
  cacheRead?: number;
  cacheCreation?: number;
  reasoning?: number;
  responseModel?: string;
  responseModelKey?: 'model' | 'model_name';
}): AIMessage => {
  const {
    inputTokens = 100,
    outputTokens = 50,
    cacheRead = 0,
    cacheCreation = 0,
    reasoning = 0,
    responseModel = 'claude-3-5-sonnet-20241022',
    responseModelKey = 'model',
  } = overrides ?? {};

  return new AIMessage({
    content: 'Test response',
    response_metadata: { [responseModelKey]: responseModel },
    usage_metadata: {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens: inputTokens + outputTokens,
      input_token_details: {
        cache_read: cacheRead,
        cache_creation: cacheCreation,
      },
      output_token_details: {
        reasoning,
      },
    },
  });
};
/* eslint-enable @typescript-eslint/naming-convention -- Re-enable naming convention after LangChain metadata */

describe('createUsageTrackingMiddleware', () => {
  let writer: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    writer = vi.fn();
    vi.spyOn(metricsService.genAiTokenUsage, 'record');
    vi.spyOn(metricsService.genAiCost, 'add');

    mockModelService.getOtelProviderName.mockReturnValue('anthropic');
    mockModelService.normalizeUsageTokens.mockImplementation((_id, usage) => usage);
    mockModelService.getModelCost.mockReturnValue({
      inputTokensCost: 0.001,
      outputTokensCost: 0.002,
      cacheReadTokensCost: 0,
      cacheWriteTokensCost: 0,
      totalCost: 0.003,
    });
  });

  it('should record NORMALIZED input tokens (cache reads excluded) so the cache-hit-rate formula is provider-agnostic', () => {
    const middleware = createUsageTrackingMiddleware(metricsService);
    const afterModel = resolveMiddlewareHook(middleware.afterModel);

    // Anthropic-shape: raw input_tokens = 500 includes 100 cache reads. The
    // normalized count drops cache reads down to 400 net input tokens.
    const aiMessage = createAIMessageWithUsage({
      inputTokens: 500,
      outputTokens: 200,
      cacheRead: 100,
    });

    mockModelService.normalizeUsageTokens.mockReturnValue({
      inputTokens: 400,
      outputTokens: 200,
      reasoningTokens: 0,
      cacheReadTokens: 100,
      cacheWriteTokens: 0,
    });

    afterModel(
      // oxlint-disable-next-line @typescript-eslint/no-explicit-any -- Partial mock state/runtime for middleware testing
      { messages: [aiMessage] } as any,
      // oxlint-disable-next-line @typescript-eslint/no-explicit-any -- Partial mock state/runtime for middleware testing
      { context: { modelId: 'claude-3.5-sonnet', modelService: mockModelService }, writer } as any,
    );

    const { calls } = (metricsService.genAiTokenUsage.record as ReturnType<typeof vi.fn>).mock;
    type MetricCall = [number, Record<string, string>];
    const inputCall = calls.find(
      (call: unknown) => (call as MetricCall)[1][AttributeKey.GEN_AI_TOKEN_TYPE] === GenAiTokenType.INPUT,
    ) as MetricCall | undefined;
    const outputCall = calls.find(
      (call: unknown) => (call as MetricCall)[1][AttributeKey.GEN_AI_TOKEN_TYPE] === GenAiTokenType.OUTPUT,
    ) as MetricCall | undefined;

    expect(inputCall?.[0]).toBe(400);
    expect(outputCall?.[0]).toBe(200);
  });

  it('should record cache_read tokens as a third token-type series when cache reads occurred', () => {
    mockModelService.normalizeUsageTokens.mockImplementation((_id, usage) => ({
      inputTokens: usage.inputTokens - usage.cacheReadTokens - usage.cacheWriteTokens,
      outputTokens: usage.outputTokens,
      reasoningTokens: usage.reasoningTokens,
      cacheReadTokens: usage.cacheReadTokens,
      cacheWriteTokens: usage.cacheWriteTokens,
    }));

    const middleware = createUsageTrackingMiddleware(metricsService);
    const afterModel = resolveMiddlewareHook(middleware.afterModel);

    const aiMessage = createAIMessageWithUsage({
      inputTokens: 130_000,
      outputTokens: 800,
      cacheRead: 100_000,
    });

    afterModel(
      // oxlint-disable-next-line @typescript-eslint/no-explicit-any -- Partial mock state/runtime for middleware testing
      { messages: [aiMessage] } as any,
      // oxlint-disable-next-line @typescript-eslint/no-explicit-any -- Partial mock state/runtime for middleware testing
      { context: { modelId: 'anthropic-claude-opus-4.8', modelService: mockModelService }, writer } as any,
    );

    const { calls } = (metricsService.genAiTokenUsage.record as ReturnType<typeof vi.fn>).mock;
    type MetricCall = [number, Record<string, string>];
    const cacheReadCall = calls.find(
      (call: unknown) => (call as MetricCall)[1][AttributeKey.GEN_AI_TOKEN_TYPE] === GenAiTokenType.CACHE_READ,
    ) as MetricCall | undefined;

    expect(cacheReadCall, 'cache_read series must be recorded when cache hits occur').toBeDefined();
    expect(cacheReadCall?.[0]).toBe(100_000);
  });

  it('should NOT record a cache_read series when cache reads were zero', () => {
    const middleware = createUsageTrackingMiddleware(metricsService);
    const afterModel = resolveMiddlewareHook(middleware.afterModel);

    const aiMessage = createAIMessageWithUsage({
      inputTokens: 1000,
      outputTokens: 200,
      cacheRead: 0,
    });

    afterModel(
      // oxlint-disable-next-line @typescript-eslint/no-explicit-any -- Partial mock state/runtime for middleware testing
      { messages: [aiMessage] } as any,
      // oxlint-disable-next-line @typescript-eslint/no-explicit-any -- Partial mock state/runtime for middleware testing
      { context: { modelId: 'claude-3.5-sonnet', modelService: mockModelService }, writer } as any,
    );

    const { calls } = (metricsService.genAiTokenUsage.record as ReturnType<typeof vi.fn>).mock;
    type MetricCall = [number, Record<string, string>];
    const cacheReadCall = calls.find(
      (call: unknown) => (call as MetricCall)[1][AttributeKey.GEN_AI_TOKEN_TYPE] === GenAiTokenType.CACHE_READ,
    ) as MetricCall | undefined;

    expect(cacheReadCall, 'cache_read series must not be emitted when no cache hits occurred').toBeUndefined();
  });

  it('should populate response_model from response_metadata.model (Anthropic)', () => {
    const middleware = createUsageTrackingMiddleware(metricsService);
    const afterModel = resolveMiddlewareHook(middleware.afterModel);

    const aiMessage = createAIMessageWithUsage({
      responseModel: 'claude-3-5-sonnet-20241022',
      responseModelKey: 'model',
    });

    afterModel(
      // oxlint-disable-next-line @typescript-eslint/no-explicit-any -- Partial mock state/runtime for middleware testing
      { messages: [aiMessage] } as any,
      // oxlint-disable-next-line @typescript-eslint/no-explicit-any -- Partial mock state/runtime for middleware testing
      { context: { modelId: 'claude-3.5-sonnet', modelService: mockModelService }, writer } as any,
    );

    const [, attributes] = (metricsService.genAiTokenUsage.record as ReturnType<typeof vi.fn>).mock.calls[0] as [
      number,
      Record<string, string>,
    ];
    expect(attributes[AttributeKey.GEN_AI_RESPONSE_MODEL]).toBe('claude-3-5-sonnet-20241022');
  });

  it('should fall back to response_metadata.model_name (OpenAI)', () => {
    const middleware = createUsageTrackingMiddleware(metricsService);
    const afterModel = resolveMiddlewareHook(middleware.afterModel);

    const aiMessage = createAIMessageWithUsage({ responseModel: 'gpt-4o-2024-05-13', responseModelKey: 'model_name' });

    afterModel(
      // oxlint-disable-next-line @typescript-eslint/no-explicit-any -- Partial mock state/runtime for middleware testing
      { messages: [aiMessage] } as any,
      // oxlint-disable-next-line @typescript-eslint/no-explicit-any -- Partial mock state/runtime for middleware testing
      { context: { modelId: 'gpt-4o', modelService: mockModelService }, writer } as any,
    );

    const [, attributes] = (metricsService.genAiTokenUsage.record as ReturnType<typeof vi.fn>).mock.calls[0] as [
      number,
      Record<string, string>,
    ];
    expect(attributes[AttributeKey.GEN_AI_RESPONSE_MODEL]).toBe('gpt-4o-2024-05-13');
  });

  it('should increment cost counter when totalCost > 0', () => {
    const middleware = createUsageTrackingMiddleware(metricsService);
    const afterModel = resolveMiddlewareHook(middleware.afterModel);

    const aiMessage = createAIMessageWithUsage();

    afterModel(
      // oxlint-disable-next-line @typescript-eslint/no-explicit-any -- Partial mock state/runtime for middleware testing
      { messages: [aiMessage] } as any,
      // oxlint-disable-next-line @typescript-eslint/no-explicit-any -- Partial mock state/runtime for middleware testing
      { context: { modelId: 'claude-3.5-sonnet', modelService: mockModelService }, writer } as any,
    );

    expect(metricsService.genAiCost.add).toHaveBeenCalledWith(
      0.003,
      expect.objectContaining({
        [AttributeKey.GEN_AI_OPERATION_NAME]: 'chat',
      }),
    );
  });

  it('should skip recording when usage_metadata is absent', () => {
    const middleware = createUsageTrackingMiddleware(metricsService);
    const afterModel = resolveMiddlewareHook(middleware.afterModel);

    const aiMessage = new AIMessage({ content: 'No usage' });

    afterModel(
      // oxlint-disable-next-line @typescript-eslint/no-explicit-any -- Partial mock state/runtime for middleware testing
      { messages: [aiMessage] } as any,
      // oxlint-disable-next-line @typescript-eslint/no-explicit-any -- Partial mock state/runtime for middleware testing
      { context: { modelId: 'claude-3.5-sonnet', modelService: mockModelService }, writer } as any,
    );

    expect(metricsService.genAiTokenUsage.record).not.toHaveBeenCalled();
    expect(metricsService.genAiCost.add).not.toHaveBeenCalled();
  });

  it('should write usage data to the stream writer', () => {
    const middleware = createUsageTrackingMiddleware(metricsService);
    const afterModel = resolveMiddlewareHook(middleware.afterModel);

    const aiMessage = createAIMessageWithUsage();

    afterModel(
      // oxlint-disable-next-line @typescript-eslint/no-explicit-any -- Partial mock state/runtime for middleware testing
      { messages: [aiMessage] } as any,
      // oxlint-disable-next-line @typescript-eslint/no-explicit-any -- Partial mock state/runtime for middleware testing
      { context: { modelId: 'claude-3.5-sonnet', modelService: mockModelService }, writer } as any,
    );

    expect(writer).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'usage',
        model: 'claude-3.5-sonnet',
      }),
    );
  });

  it('should pass through LangChain Anthropic cache counts into normalizeUsageTokens', () => {
    mockModelService.normalizeUsageTokens.mockImplementation((_id, usage) => ({
      inputTokens: usage.inputTokens - usage.cacheReadTokens - usage.cacheWriteTokens,
      outputTokens: usage.outputTokens,
      reasoningTokens: usage.reasoningTokens,
      cacheReadTokens: usage.cacheReadTokens,
      cacheWriteTokens: usage.cacheWriteTokens,
    }));

    const middleware = createUsageTrackingMiddleware(metricsService);
    const afterModel = resolveMiddlewareHook(middleware.afterModel);

    // Mirrors LangChain buildUsageMetadata: input_tokens = API input + cache_read + cache_creation
    const aiMessage = createAIMessageWithUsage({
      inputTokens: 255_000,
      outputTokens: 1000,
      cacheRead: 100_000,
      cacheCreation: 5000,
    });

    afterModel(
      // oxlint-disable-next-line @typescript-eslint/no-explicit-any -- Partial mock state/runtime for middleware testing
      { messages: [aiMessage] } as any,
      // oxlint-disable-next-line @typescript-eslint/no-explicit-any -- Partial mock state/runtime for middleware testing
      { context: { modelId: 'anthropic-claude-opus-4.8', modelService: mockModelService }, writer } as any,
    );

    expect(writer).toHaveBeenCalledWith(
      expect.objectContaining({
        inputTokens: 150_000,
        cacheReadTokens: 100_000,
        cacheWriteTokens: 5000,
      }),
    );
  });
});
