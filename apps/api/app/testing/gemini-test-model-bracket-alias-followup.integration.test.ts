// @vitest-environment node
/* eslint-disable @typescript-eslint/naming-convention -- LangChain fixtures use BaseChatModel underscore methods and usage_metadata fields. */
/* oxlint-disable @typescript-eslint/class-literal-property-style -- LangChain BaseChatModel pattern. */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { AIMessage, AIMessageChunk } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import { ChatGenerationChunk } from '@langchain/core/outputs';
import type { ChatResult } from '@langchain/core/outputs';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager';
import type { UIMessage } from 'ai';
import type { RpcGeoSpecClient } from '@taucad/chat/rpc';
import { toolName } from '@taucad/chat/constants';
import type { ChatUsageCost, ChatUsageTokens } from '#api/chat/chat.schema.js';
import { collectFinalMessage, collectStreamChunks } from '#testing/stream-consumer.js';
import { expectNoErrors } from '#testing/stream-assertions.js';
import { createTestApp } from '#testing/create-test-app.js';
import type { CreateTestAppOptions, TestApp } from '#testing/create-test-app.js';
import { buildCadAgent } from '#testing/skip-helpers.js';

const modelId = 'google-gemini-3.5-flash';

class BracketAliasTestModel extends BaseChatModel {
  public readonly calls: BaseMessage[][] = [];

  public constructor() {
    super({});
  }

  public override _llmType(): string {
    return 'bracket-alias-test-model';
  }

  public override _combineLLMOutput(): Record<string, unknown> {
    return {};
  }

  public override bindTools(): this {
    return this;
  }

  public override async _generate(
    messages: BaseMessage[],
    _options: this['ParsedCallOptions'],
    _runManager?: CallbackManagerForLLMRun,
  ): Promise<ChatResult> {
    this.calls.push(messages);

    if (this.calls.length === 1) {
      const message = new AIMessage({
        content: '',
        tool_calls: [
          {
            id: 'call_test_model_bracket_alias',
            name: toolName.testModel,
            args: { 'files[0]': 'main.geospec.ts' },
            type: 'tool_call',
          },
        ],
        usage_metadata: { input_tokens: 100, output_tokens: 10, total_tokens: 110 },
        response_metadata: { model: modelId, model_provider: 'google-vertexai' },
      });
      return { generations: [{ text: '', message }] };
    }

    const message = new AIMessage({
      content: this.calls.length === 2 ? 'GeoSpec passed.' : 'Follow-up accepted.',
      usage_metadata: { input_tokens: 120, output_tokens: 5, total_tokens: 125 },
      response_metadata: { model: modelId, model_provider: 'google-vertexai' },
    });
    return { generations: [{ text: message.content as string, message }] };
  }

  public override async *_streamResponseChunks(
    messages: BaseMessage[],
    _options: this['ParsedCallOptions'],
    runManager?: CallbackManagerForLLMRun,
  ): AsyncGenerator<ChatGenerationChunk> {
    this.calls.push(messages);

    if (this.calls.length === 1) {
      const chunks = [
        new AIMessageChunk({
          content: '',
          tool_call_chunks: [
            {
              index: 0,
              id: 'call_test_model_bracket_alias',
              name: toolName.testModel,
              args: '',
              type: 'tool_call_chunk',
            },
          ],
        }),
        new AIMessageChunk({
          content: '',
          tool_call_chunks: [{ index: 0, args: '{"files[0]":"main.geospec.ts"}', type: 'tool_call_chunk' }],
        }),
        new AIMessageChunk({
          content: '',
          tool_call_chunks: [
            {
              index: 1,
              id: 'call_read_file_seals_test_model',
              name: toolName.readFile,
              args: '',
              type: 'tool_call_chunk',
            },
          ],
        }),
        new AIMessageChunk({
          content: '',
          tool_call_chunks: [{ index: 1, args: '{"targetFile":"main.ts"}', type: 'tool_call_chunk' }],
        }),
      ];

      for (const message of chunks) {
        const generationChunk = new ChatGenerationChunk({ message, text: '' });
        yield generationChunk;
        void runManager?.handleLLMNewToken('', undefined, undefined, undefined, undefined, {
          chunk: generationChunk,
        });
      }

      return;
    }

    const content = this.calls.length === 2 ? 'GeoSpec passed.' : 'Follow-up accepted.';
    const message = new AIMessageChunk({ content });
    const generationChunk = new ChatGenerationChunk({ message, text: content });
    yield generationChunk;
    void runManager?.handleLLMNewToken(content, undefined, undefined, undefined, undefined, {
      chunk: generationChunk,
    });
  }
}

const createModelService = (model: BracketAliasTestModel): CreateTestAppOptions['modelService'] => ({
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
    return 'google';
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

const createGeoSpecStub = (calls: unknown[]): RpcGeoSpecClient => ({
  async runTests(args) {
    calls.push(structuredClone(args));
    expect(args.files).toEqual(['main.geospec.ts']);

    return {
      success: true,
      failures: [],
      passes: [
        {
          id: 'geospec-bracket-alias-regression',
          requirement: 'Gemini bracket-alias test_model input is canonicalized',
          targetFile: 'main.geospec.ts',
        },
      ],
      passed: 1,
      total: 1,
    };
  },
});

function getTestModelPart(message: UIMessage): Record<string, unknown> {
  const part = message.parts.find((candidate) => {
    if (candidate.type === 'dynamic-tool') {
      return candidate.toolName === toolName.testModel;
    }

    return candidate.type === `tool-${toolName.testModel}`;
  });

  expect(part, 'Expected a test_model tool part in the assistant message').toBeDefined();
  return part as unknown as Record<string, unknown>;
}

async function assertOk(response: Response): Promise<void> {
  if (response.ok) {
    return;
  }

  throw new Error(`HTTP ${response.status}: ${response.statusText}\n${await response.text()}`);
}

describe('Gemini test_model bracket-alias follow-up replay', () => {
  let testApp: TestApp;
  let model: BracketAliasTestModel;
  const geoSpecCalls: unknown[] = [];

  beforeAll(async () => {
    model = new BracketAliasTestModel();
    testApp = await createTestApp({
      modelService: createModelService(model),
      geospecStub: createGeoSpecStub(geoSpecCalls),
    });
  }, 30_000);

  afterAll(async () => {
    await testApp.app.close();
  });

  it('persists canonical test_model input so an immediate follow-up turn validates', async () => {
    const threadId = `gemini-test-model-bracket-alias-${Date.now()}`;
    const firstUserMessage = {
      id: 'msg_user_initial',
      role: 'user',
      parts: [
        {
          type: 'text',
          text: 'Run test_model for main.geospec.ts and then tell me whether it passed.',
        },
      ],
      metadata: { model: modelId, kernel: 'replicad' },
    };
    await testApp.memFs.writeFile('main.ts', 'export default function main() { return "ok"; }\n');

    const firstResponse = await fetch(`${testApp.baseUrl}/v1/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: threadId,
        messages: [firstUserMessage],
        agent: buildCadAgent(modelId, 'replicad', { testingEnabled: true }),
      }),
    });
    await assertOk(firstResponse);

    const firstChunks = await collectStreamChunks(firstResponse);
    expectNoErrors(firstChunks);

    const assistantMessage = await collectFinalMessage(firstChunks);
    const testModelPart = getTestModelPart(assistantMessage);
    const { input } = testModelPart;
    expect(input).toEqual({ files: ['main.geospec.ts'] });
    expect(Object.hasOwn(input as Record<string, unknown>, 'files[0]')).toBe(false);
    expect(geoSpecCalls).toEqual([{ files: ['main.geospec.ts'] }]);

    const followUpUserMessage = {
      id: 'msg_user_followup',
      role: 'user',
      parts: [
        {
          type: 'text',
          text: 'Can we make the start and end of the thread blend into the cylinder?',
        },
      ],
      metadata: { model: modelId, kernel: 'replicad' },
    };

    const followUpResponse = await fetch(`${testApp.baseUrl}/v1/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: threadId,
        messages: [firstUserMessage, assistantMessage, followUpUserMessage],
        agent: buildCadAgent(modelId, 'replicad', { testingEnabled: true }),
      }),
    });
    await assertOk(followUpResponse);

    const followUpChunks = await collectStreamChunks(followUpResponse);
    expectNoErrors(followUpChunks);
    expect(model.calls.length).toBeGreaterThanOrEqual(3);
  }, 60_000);
});
