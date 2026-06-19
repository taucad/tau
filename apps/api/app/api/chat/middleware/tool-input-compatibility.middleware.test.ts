import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { REMOVE_ALL_MESSAGES } from '@langchain/langgraph';
import { AttributeKey } from '@taucad/telemetry';
import { toolName } from '@taucad/chat/constants';
import { describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { ModelService } from '#api/models/model.service.js';
import { resolveMiddlewareHook, invokeWrapToolCall } from '#testing/middleware-testing.utils.js';
import type { MetricsService } from '#telemetry/metrics.js';
import { createToolInputCompatibilityMiddleware } from '#api/chat/middleware/tool-input-compatibility.middleware.js';

const createMetricsService = () =>
  mock<MetricsService>({
    genAiToolInputRepairs: {
      add: vi.fn(),
    } as unknown as MetricsService['genAiToolInputRepairs'],
  });

const createRuntime = () => ({
  context: {
    modelId: 'gemini-2.5-pro',
    modelService: mock<ModelService>({
      getOtelProviderName: vi.fn().mockReturnValue('vertexai'),
    }),
  },
});

describe('createToolInputCompatibilityMiddleware', () => {
  it('should canonicalize test_model bracket aliases on the last AIMessage', () => {
    const metricsService = createMetricsService();
    const middleware = createToolInputCompatibilityMiddleware(metricsService);
    const afterModel = resolveMiddlewareHook(middleware.afterModel);
    const readFileToolCall = { id: 'call_read', name: toolName.readFile, args: { targetFile: 'main.ts' } };
    const testModelToolCall = {
      id: 'call_test_model',
      name: toolName.testModel,
      args: { 'files[0]': 'main.geospec.ts', 'exclude[0]': '**/*.slow.geospec.ts' },
      type: 'tool_call',
    };
    const aiMessage = new AIMessage({
      id: 'msg-1',
      content: [{ type: 'tool_call', id: 'call_test_model', name: toolName.testModel, args: testModelToolCall.args }],
      tool_calls: [readFileToolCall, testModelToolCall],
      response_metadata: { model: 'gemini-2.5-pro' },
    });

    const update = afterModel({ messages: [new HumanMessage('run tests'), aiMessage] }, createRuntime()) as {
      messages: AIMessage[];
    };

    expect(update.messages).toHaveLength(1);
    const healedMessage = update.messages[0];
    expect(healedMessage.id).toBe('msg-1');
    expect(healedMessage.tool_calls?.[0]).toBe(readFileToolCall);
    expect(healedMessage.tool_calls?.[1]?.args).toEqual({
      files: ['main.geospec.ts'],
      exclude: ['**/*.slow.geospec.ts'],
    });
    expect(healedMessage.content).toEqual([
      {
        type: 'tool_call',
        id: 'call_test_model',
        name: toolName.testModel,
        args: {
          files: ['main.geospec.ts'],
          exclude: ['**/*.slow.geospec.ts'],
        },
      },
    ]);
    expect(metricsService.genAiToolInputRepairs.add).toHaveBeenCalledWith(1, {
      [AttributeKey.GEN_AI_TOOL_NAME]: toolName.testModel,
      [AttributeKey.GEN_AI_TOOL_INPUT_REPAIR_KIND]: 'bracket_array_alias',
      [AttributeKey.GEN_AI_REQUEST_MODEL]: 'gemini-2.5-pro',
      [AttributeKey.GEN_AI_PROVIDER_NAME]: 'vertexai',
    });
  });

  it('should rewrite id-less AIMessage state without appending a duplicate assistant message', () => {
    const metricsService = createMetricsService();
    const middleware = createToolInputCompatibilityMiddleware(metricsService);
    const afterModel = resolveMiddlewareHook(middleware.afterModel);
    const human = new HumanMessage('run tests');
    const aiMessage = new AIMessage({
      content: '',
      tool_calls: [
        {
          id: 'call_test_model',
          name: toolName.testModel,
          args: { 'include[0]': 'parts/**/*.geospec.ts' },
        },
      ],
    });

    const update = afterModel({ messages: [human, aiMessage] }, createRuntime()) as {
      messages: Array<{ id?: string } | AIMessage | HumanMessage>;
    };

    expect(update.messages[0]?.id).toBe(REMOVE_ALL_MESSAGES);
    expect(update.messages[1]).toBe(human);
    expect((update.messages[2] as AIMessage).tool_calls?.[0]?.args).toEqual({
      include: ['parts/**/*.geospec.ts'],
    });
  });

  it('should clone wrapToolCall requests with canonical args and leave the original request untouched', async () => {
    const metricsService = createMetricsService();
    const middleware = createToolInputCompatibilityMiddleware(metricsService);
    const handler = vi.fn().mockResolvedValue('ok');
    const originalArgs = { 'files[0]': 'main.geospec.ts' };
    const payload = {
      toolCall: { name: toolName.testModel, id: 'call_test_model', args: originalArgs },
      runtime: createRuntime(),
    };

    await invokeWrapToolCall(middleware, payload, handler);

    expect(payload.toolCall.args).toBe(originalArgs);
    expect(handler).toHaveBeenCalledWith({
      ...payload,
      toolCall: {
        ...payload.toolCall,
        args: { files: ['main.geospec.ts'] },
      },
    });
  });

  it('should pass blocked collisions through unchanged so strict schema validation owns the error', async () => {
    const metricsService = createMetricsService();
    const middleware = createToolInputCompatibilityMiddleware(metricsService);
    const handler = vi.fn().mockResolvedValue('ok');
    const payload = {
      toolCall: {
        name: toolName.testModel,
        id: 'call_test_model',
        args: { files: ['main.geospec.ts'], 'files[0]': 'other.geospec.ts' },
      },
      runtime: createRuntime(),
    };

    await invokeWrapToolCall(middleware, payload, handler);

    expect(handler).toHaveBeenCalledWith(payload);
    expect(metricsService.genAiToolInputRepairs.add).not.toHaveBeenCalled();
  });

  it('should leave unrelated tools unchanged', () => {
    const metricsService = createMetricsService();
    const middleware = createToolInputCompatibilityMiddleware(metricsService);
    const afterModel = resolveMiddlewareHook(middleware.afterModel);
    const toolCall = { id: 'call_read', name: toolName.readFile, args: { 'files[0]': 'main.geospec.ts' } };
    const aiMessage = new AIMessage({
      id: 'msg-1',
      content: '',
      tool_calls: [toolCall],
    });

    const update: unknown = afterModel({ messages: [aiMessage] }, createRuntime());

    expect(update).toBeUndefined();
    expect(metricsService.genAiToolInputRepairs.add).not.toHaveBeenCalled();
  });
});
