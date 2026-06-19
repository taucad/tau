import { describe, expect, it } from 'vitest';
import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { EvaluateModelRequestBudgetInput } from '#api/chat/token-budget.service.js';
import { TokenBudgetService, estimateMessageContentTokens } from '#api/chat/token-budget.service.js';

describe('estimateMessageContentTokens', () => {
  it('should count string content as chars/4', () => {
    expect(estimateMessageContentTokens([new HumanMessage('A'.repeat(400))])).toBe(100);
  });

  it('should count image_url blocks as the flat image estimate', () => {
    const messages = [
      new HumanMessage([{ type: 'image_url', image_url: { url: 'data:image/png;base64,' + 'A'.repeat(500_000) } }]),
    ];
    expect(estimateMessageContentTokens(messages)).toBe(2000);
  });

  it('should count file parts with image mediaType as the flat image estimate', () => {
    const messages = [new HumanMessage([{ type: 'file', mediaType: 'image/jpeg', data: 'A'.repeat(500_000) }])];
    expect(estimateMessageContentTokens(messages)).toBe(2000);
  });

  it('should count mixed text and image blocks without stringifying image payloads', () => {
    const messages = [
      new HumanMessage([
        { type: 'text', text: 'A'.repeat(400) },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,' + 'A'.repeat(1_000_000) } },
        { type: 'text', text: 'B'.repeat(200) },
      ]),
    ];

    expect(estimateMessageContentTokens(messages)).toBe(2150);
  });
});

describe('TokenBudgetService', () => {
  it('should evaluate the full LangChain model request components', () => {
    const service = new TokenBudgetService();
    const decision = service.evaluateModelRequest({
      modelId: 'anthropic-claude-haiku-4.5',
      providerId: 'anthropic',
      contextWindow: 100_000,
      request: createModelRequest({
        systemMessage: new SystemMessage('System prompt'),
        messages: [
          new HumanMessage('Build a cube'),
          new AIMessage({
            content: 'I will call a tool',
            tool_calls: [{ id: 'tc1', name: 'read_file', args: { path: '/tmp/a.ts', detail: 'A'.repeat(500) } }],
          }),
        ],
        tools: [
          {
            name: 'read_file',
            description: 'Read a file',
            schema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
          },
        ],
        modelSettings: { cache_control: { type: 'ephemeral', ttl: '5m' } },
        responseFormat: { type: 'json_schema', json_schema: { name: 'shape', schema: { type: 'object' } } },
      }),
    });

    expect(decision.budgetKind).toBe('estimated');
    expect(componentTokens(decision, 'message_content')).toBeGreaterThan(0);
    expect(componentTokens(decision, 'system_message')).toBeGreaterThan(0);
    expect(componentTokens(decision, 'tool_schemas')).toBeGreaterThan(0);
    expect(componentTokens(decision, 'tool_call_args')).toBeGreaterThan(0);
    expect(componentTokens(decision, 'model_settings')).toBeGreaterThan(0);
    expect(componentTokens(decision, 'response_format')).toBeGreaterThan(0);
    expect(componentTokens(decision, 'provider_overhead')).toBeGreaterThan(0);
  });

  it('should trigger from previous provider input usage independent of the estimate', () => {
    const service = new TokenBudgetService();
    const decision = service.evaluateModelRequest({
      modelId: 'anthropic-claude-haiku-4.5',
      providerId: 'anthropic',
      contextWindow: 1000,
      request: createModelRequest({
        messages: [
          new HumanMessage('small'),
          new AIMessage({
            content: 'done',
            usage_metadata: { input_tokens: 400, output_tokens: 10, total_tokens: 410 },
          }),
          new HumanMessage('next'),
        ],
      }),
      previousUsageInputTokens: 850,
    });

    expect(decision.shouldCompact).toBe(true);
    expect(decision.triggerReason).toBe('previous_usage');
    expect(decision.previousUsageInputTokens).toBe(850);
  });

  it('should recover previous provider usage from request messages as a fallback', () => {
    const service = new TokenBudgetService();
    const decision = service.evaluateModelRequest({
      modelId: 'anthropic-claude-haiku-4.5',
      providerId: 'anthropic',
      contextWindow: 1000,
      request: createModelRequest({
        messages: [
          new HumanMessage('small'),
          new AIMessage({
            content: 'done',
            usage_metadata: { input_tokens: 850, output_tokens: 10, total_tokens: 860 },
          }),
          new HumanMessage('next'),
        ],
      }),
    });

    expect(decision.shouldCompact).toBe(true);
    expect(decision.triggerReason).toBe('previous_usage');
    expect(decision.previousUsageInputTokens).toBe(850);
  });

  it('should trigger from a large system message when chat messages are small', () => {
    const service = new TokenBudgetService();
    const decision = service.evaluateModelRequest({
      modelId: 'anthropic-claude-haiku-4.5',
      providerId: 'anthropic',
      contextWindow: 1000,
      request: createModelRequest({
        systemMessage: new SystemMessage('S'.repeat(4000)),
        messages: [new HumanMessage('small')],
      }),
    });

    expect(decision.shouldCompact).toBe(true);
    expect(decision.triggerReason).toBe('estimate');
    expect(componentTokens(decision, 'system_message')).toBeGreaterThanOrEqual(1000);
  });

  it('should trigger from large tool schemas when messages are small', () => {
    const service = new TokenBudgetService();
    const decision = service.evaluateModelRequest({
      modelId: 'anthropic-claude-haiku-4.5',
      providerId: 'anthropic',
      contextWindow: 1000,
      request: createModelRequest({
        messages: [new HumanMessage('small')],
        tools: [
          {
            name: 'large_tool',
            description: 'T'.repeat(4000),
            schema: { type: 'object', properties: { value: { type: 'string' } } },
          },
        ],
      }),
    });

    expect(decision.shouldCompact).toBe(true);
    expect(decision.triggerReason).toBe('estimate');
    expect(componentTokens(decision, 'tool_schemas')).toBeGreaterThanOrEqual(1000);
  });

  it('should trigger from estimated input tokens when the full payload crosses threshold', () => {
    const service = new TokenBudgetService();
    const decision = service.evaluateModelRequest({
      modelId: 'anthropic-claude-haiku-4.5',
      providerId: 'anthropic',
      contextWindow: 1000,
      request: createModelRequest({
        messages: [new HumanMessage('A'.repeat(4000)), new AIMessage('B'.repeat(4000))],
      }),
    });

    expect(decision.shouldCompact).toBe(true);
    expect(decision.triggerReason).toBe('estimate');
  });

  it('should calibrate upward from observed provider usage with a bounded multiplier', () => {
    const service = new TokenBudgetService();
    const firstDecision = service.evaluateModelRequest({
      modelId: 'anthropic-claude-haiku-4.5',
      providerId: 'anthropic',
      contextWindow: 200_000,
      request: createModelRequest({
        messages: [new HumanMessage('A'.repeat(4000))],
      }),
    });

    service.recordObservedUsage({
      modelId: 'anthropic-claude-haiku-4.5',
      providerId: 'anthropic',
      actualInputTokens: firstDecision.estimatedInputTokens * 2,
      estimatedInputTokens: firstDecision.estimatedInputTokens,
    });

    const secondDecision = service.evaluateModelRequest({
      modelId: 'anthropic-claude-haiku-4.5',
      providerId: 'anthropic',
      contextWindow: 200_000,
      request: createModelRequest({
        messages: [new HumanMessage('A'.repeat(4000))],
      }),
    });

    expect(secondDecision.calibrationMultiplier).toBeGreaterThan(1);
    expect(secondDecision.estimatedInputTokens).toBeGreaterThan(firstDecision.estimatedInputTokens);
  });

  it('should bump calibration on overflow without exceeding the service cap', () => {
    const service = new TokenBudgetService();
    for (let index = 0; index < 30; index++) {
      service.recordOverflow({ modelId: 'anthropic-claude-haiku-4.5', providerId: 'anthropic' });
    }

    expect(service.getCalibrationMultiplier({ modelId: 'anthropic-claude-haiku-4.5', providerId: 'anthropic' })).toBe(
      3,
    );
  });
});

function createModelRequest(
  overrides: Partial<EvaluateModelRequestBudgetInput['request']>,
): EvaluateModelRequestBudgetInput['request'] {
  return {
    messages: [],
    systemMessage: new SystemMessage(''),
    tools: [],
    ...overrides,
  };
}

function componentTokens(
  decision: ReturnType<TokenBudgetService['evaluateModelRequest']>,
  name: ReturnType<TokenBudgetService['evaluateModelRequest']>['components'][number]['name'],
): number {
  return decision.components.find((component) => component.name === name)?.tokens ?? 0;
}
