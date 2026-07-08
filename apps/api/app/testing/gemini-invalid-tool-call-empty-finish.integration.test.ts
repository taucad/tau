// @vitest-environment node
/* eslint-disable @typescript-eslint/naming-convention -- LangChain fixtures use BaseChatModel underscore methods and token fields. */
/* oxlint-disable @typescript-eslint/class-literal-property-style -- LangChain BaseChatModel pattern. */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { AIMessage, AIMessageChunk } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import { ChatGenerationChunk } from '@langchain/core/outputs';
import type { ChatResult } from '@langchain/core/outputs';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager';
import type { UIMessageChunk } from 'ai';
import { toolName } from '@taucad/chat/constants';
import type { ChatUsageCost, ChatUsageTokens } from '#api/chat/chat.schema.js';
import { collectStreamChunks } from '#testing/stream-consumer.js';
import { createTestApp } from '#testing/create-test-app.js';
import type { CreateTestAppOptions, TestApp } from '#testing/create-test-app.js';
import { buildCadAgent } from '#testing/skip-helpers.js';

const modelId = 'google-gemini-3.5-flash';

class MalformedGeminiToolCallModel extends BaseChatModel {
  public readonly calls: BaseMessage[][] = [];

  public constructor() {
    super({});
  }

  public override _llmType(): string {
    return 'malformed-gemini-tool-call-test-model';
  }

  public override _combineLLMOutput(): Record<string, unknown> {
    return {};
  }

  public override bindTools(): this {
    return this;
  }

  public override async _generate(messages: BaseMessage[]): Promise<ChatResult> {
    this.calls.push(messages);
    const message = new AIMessage({
      content: '',
      invalid_tool_calls: [
        {
          id: 'call_bad_read',
          name: toolName.readFile,
          args: '{"limit":150}{"targetFile":"main.ts"}',
          error: 'Malformed args.',
          type: 'invalid_tool_call',
        },
      ],
      usage_metadata: { input_tokens: 100, output_tokens: 5, total_tokens: 105 },
      response_metadata: { model: modelId, model_provider: 'google-vertexai' },
    });
    return { generations: [{ text: '', message }] };
  }

  public override async *_streamResponseChunks(
    messages: BaseMessage[],
    _options: this['ParsedCallOptions'],
    runManager?: CallbackManagerForLLMRun,
  ): AsyncGenerator<ChatGenerationChunk> {
    this.calls.push(messages);

    const message = new AIMessageChunk({
      content: '',
      tool_call_chunks: [
        {
          index: 0,
          id: 'call_bad_read',
          name: toolName.readFile,
          args: '{"limit":150}{"targetFile":"main.ts"}',
          type: 'tool_call_chunk',
        },
      ],
      usage_metadata: { input_tokens: 100, output_tokens: 5, total_tokens: 105 },
      response_metadata: { model: modelId, model_provider: 'google-vertexai' },
    });
    const generationChunk = new ChatGenerationChunk({ message, text: '' });
    yield generationChunk;
    void runManager?.handleLLMNewToken('', undefined, undefined, undefined, undefined, {
      chunk: generationChunk,
    });
  }
}

const createModelService = (model: MalformedGeminiToolCallModel): CreateTestAppOptions['modelService'] => ({
  buildModel() {
    return {
      model,
      support: {
        tools: true,
        toolChoice: true,
        modalities: { input: ['text', 'image'], output: ['text'] },
      },
    };
  },
  getProviderId() {
    return 'vertexai';
  },
  createProviderDiagnosticsContext(options: Record<string, unknown>) {
    return {
      ...options,
      verbose: false,
      nextProviderAttemptId: () => 1,
      setLatestModelCallSummary: () => undefined,
      getLatestModelCallSummary: () => undefined,
    };
  },
  getContextWindow() {
    return 200_000;
  },
  getKnowledgeCutoff() {
    return '2026-01-01';
  },
  getModelSupport() {
    return {
      tools: true,
      toolChoice: true,
      modalities: { input: ['text', 'image'], output: ['text'] },
    };
  },
  filterProviderToolNamesForModel({ toolNames }) {
    return [...toolNames];
  },
  getOtelProviderName() {
    return 'google';
  },
  normalizeUsageTokens(_modelId: string, usage: ChatUsageTokens): ChatUsageTokens {
    return usage;
  },
  getModelCost(_modelId: string, _usage: ChatUsageTokens): ChatUsageCost {
    return {
      inputTokensCost: 0,
      outputTokensCost: 0,
      cacheReadTokensCost: 0,
      cacheWriteTokensCost: 0,
      totalCost: 0,
    };
  },
});

async function assertOk(response: Response): Promise<void> {
  if (response.ok) {
    return;
  }

  throw new Error(`HTTP ${response.status}: ${response.statusText}\n${await response.text()}`);
}

function getErrorText(chunks: UIMessageChunk[]): string {
  return chunks
    .filter((chunk) => chunk.type === 'error')
    .map((chunk) =>
      'errorText' in chunk && typeof chunk.errorText === 'string' ? chunk.errorText : JSON.stringify(chunk),
    )
    .join('\n');
}

describe('Gemini malformed streamed tool call replay', () => {
  let testApp: TestApp;
  let model: MalformedGeminiToolCallModel;

  beforeAll(async () => {
    model = new MalformedGeminiToolCallModel();
    testApp = await createTestApp({ modelService: createModelService(model) });
  }, 30_000);

  afterAll(async () => {
    await testApp.app.close();
  });

  it('surfaces a provider error instead of silently finishing when Gemini emits no valid tool calls', async () => {
    const response = await fetch(`${testApp.baseUrl}/v1/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: `gemini-invalid-tool-call-empty-finish-${Date.now()}`,
        messages: [
          {
            id: 'msg_user_initial',
            role: 'user',
            parts: [{ type: 'text', text: 'make a cube with cylinder cutout' }],
            metadata: { model: modelId, kernel: 'replicad' },
          },
        ],
        agent: buildCadAgent(modelId, 'replicad', { testingEnabled: true }),
      }),
    });
    await assertOk(response);

    const chunks = await collectStreamChunks(response);
    const errorText = getErrorText(chunks);

    expect(errorText).toContain('Provider returned malformed tool calls');
    expect(errorText).toContain(toolName.readFile);
    expect(errorText).toContain('Malformed args.');
  }, 60_000);
});
