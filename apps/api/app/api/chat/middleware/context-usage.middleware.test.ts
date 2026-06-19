/* eslint-disable @typescript-eslint/naming-convention -- LangChain message properties use snake_case */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AIMessage } from '@langchain/core/messages';
import { createContextUsageMiddleware } from '#api/chat/middleware/context-usage.middleware.js';
import { resolveMiddlewareHook } from '#testing/middleware-testing.utils.js';

describe('createContextUsageMiddleware', () => {
  const mockModelService = {
    getContextWindow: vi.fn(),
    buildModel: vi.fn(),
    getModelCost: vi.fn(),
    normalizeUsageTokens: vi.fn(),
    getOtelProviderName: vi.fn(),
  };

  const createRuntime = (overrides?: { writer?: ReturnType<typeof vi.fn>; context?: Record<string, unknown> }) => ({
    context: {
      modelId: 'anthropic-claude-haiku-4.5',
      modelService: mockModelService,
      ...overrides?.context,
    },
    writer: overrides?.writer ?? vi.fn(),
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should emit context usage data with correct percentage', () => {
    mockModelService.getContextWindow.mockReturnValue(200_000);
    const writer = vi.fn();
    const runtime = createRuntime({ writer });

    const middleware = createContextUsageMiddleware();
    const afterModel = resolveMiddlewareHook(middleware.afterModel);

    const state = {
      messages: [
        new AIMessage({
          content: 'Hello',
          usage_metadata: { input_tokens: 50_000, output_tokens: 100, total_tokens: 50_100 },
        }),
      ],
    };

    afterModel(state, runtime);

    expect(writer).toHaveBeenCalledOnce();
    const emitted = writer.mock.calls[0]![0] as Record<string, unknown>;
    expect(emitted['type']).toBe('context-usage');
    expect(emitted['totalInputTokens']).toBe(50_000);
    expect(emitted['contextWindow']).toBe(200_000);
    expect(emitted['percentUsed']).toBe(25);
    expect(emitted['modelId']).toBe('anthropic-claude-haiku-4.5');
    expect(emitted['id']).toMatch(/^data_/);
    expect(emitted['compactionScheduleStatus']).toBe('none');
  });

  it('should cap percentage at 100', () => {
    mockModelService.getContextWindow.mockReturnValue(100_000);
    const writer = vi.fn();
    const runtime = createRuntime({ writer });

    const middleware = createContextUsageMiddleware();
    const state = {
      messages: [
        new AIMessage({
          content: 'x',
          usage_metadata: { input_tokens: 150_000, output_tokens: 0, total_tokens: 150_000 },
        }),
      ],
    };

    resolveMiddlewareHook(middleware.afterModel)(state, runtime);

    expect(writer.mock.calls[0]![0].percentUsed).toBe(100);
  });

  it('should not emit when writer is not available', () => {
    mockModelService.getContextWindow.mockReturnValue(200_000);
    const runtime = { context: createRuntime().context, writer: undefined };

    const middleware = createContextUsageMiddleware();
    const state = {
      messages: [
        new AIMessage({
          content: 'x',
          usage_metadata: { input_tokens: 1000, output_tokens: 0, total_tokens: 1000 },
        }),
      ],
    };

    resolveMiddlewareHook(middleware.afterModel)(state, runtime);
  });

  it('should not emit when model has no context window', () => {
    mockModelService.getContextWindow.mockReturnValue(undefined);
    const writer = vi.fn();
    const runtime = createRuntime({ writer });

    const middleware = createContextUsageMiddleware();
    const state = {
      messages: [
        new AIMessage({
          content: 'x',
          usage_metadata: { input_tokens: 1000, output_tokens: 0, total_tokens: 1000 },
        }),
      ],
    };

    resolveMiddlewareHook(middleware.afterModel)(state, runtime);

    expect(writer).not.toHaveBeenCalled();
  });

  it('should not emit when last message has no usage metadata', () => {
    mockModelService.getContextWindow.mockReturnValue(200_000);
    const writer = vi.fn();
    const runtime = createRuntime({ writer });

    const middleware = createContextUsageMiddleware();
    const state = {
      messages: [new AIMessage({ content: 'x' })],
    };

    resolveMiddlewareHook(middleware.afterModel)(state, runtime);

    expect(writer).not.toHaveBeenCalled();
  });

  it('should round percentage to one decimal place', () => {
    mockModelService.getContextWindow.mockReturnValue(300_000);
    const writer = vi.fn();
    const runtime = createRuntime({ writer });

    const middleware = createContextUsageMiddleware();
    const state = {
      messages: [
        new AIMessage({
          content: 'x',
          usage_metadata: { input_tokens: 100_000, output_tokens: 0, total_tokens: 100_000 },
        }),
      ],
    };

    resolveMiddlewareHook(middleware.afterModel)(state, runtime);

    expect(writer.mock.calls[0]![0].percentUsed).toBe(33.3);
  });

  it('should include latest budget and compaction cursor metadata when available', () => {
    mockModelService.getContextWindow.mockReturnValue(200_000);
    const writer = vi.fn();
    const runtime = createRuntime({
      writer,
      context: {
        lastContextBudget: {
          budgetKind: 'estimated',
          shouldCompact: true,
          triggerReason: 'previous_usage',
          estimatedInputTokens: 180_000,
          rawEstimatedInputTokens: 170_000,
          contextWindow: 200_000,
          triggerThreshold: 170_000,
          calibrationMultiplier: 1,
          components: [{ name: 'total', tokens: 180_000 }],
        },
        lastCompactionId: 'dat_compaction',
        lastCompactionStatus: 'compacted',
      },
    });

    const middleware = createContextUsageMiddleware();
    const state = {
      messages: [
        new AIMessage({
          content: 'x',
          usage_metadata: { input_tokens: 100_000, output_tokens: 0, total_tokens: 100_000 },
        }),
      ],
    };

    resolveMiddlewareHook(middleware.afterModel)(state, runtime);

    expect(writer.mock.calls[0]![0]).toMatchObject({
      budgetKind: 'estimated',
      triggerReason: 'previous_usage',
      triggerThreshold: 170_000,
      lastCompactionId: 'dat_compaction',
      lastCompactionStatus: 'compacted',
    });
  });

  it('should emit scheduled-next-turn compaction metadata when provider usage crosses threshold', () => {
    mockModelService.getContextWindow.mockReturnValue(200_000);
    const writer = vi.fn();
    const runtime = createRuntime({ writer });

    const middleware = createContextUsageMiddleware();
    const state = {
      messages: [
        new AIMessage({
          content: 'x',
          usage_metadata: { input_tokens: 180_000, output_tokens: 0, total_tokens: 180_000 },
        }),
      ],
    };

    resolveMiddlewareHook(middleware.afterModel)(state, runtime);

    expect(writer.mock.calls[0]![0]).toMatchObject({
      triggerThreshold: 170_000,
      compactionScheduleStatus: 'scheduled_next_turn',
      scheduledTriggerReason: 'previous_usage',
      scheduledInputTokens: 180_000,
    });
  });
});
