// @vitest-environment node
/* eslint-disable @typescript-eslint/naming-convention -- Scripted LangChain model fixtures use BaseChatModel's required underscore methods and usage_metadata fields. */
/* oxlint-disable @typescript-eslint/class-literal-property-style -- LangChain BaseChatModel pattern. */
import process from 'node:process';
import IORedisMock from 'ioredis-mock';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Redis } from 'ioredis';
import { AIMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import type { ChatResult } from '@langchain/core/outputs';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager';
import type { RpcGeoSpecClient } from '@taucad/chat/rpc';
import { toolName } from '@taucad/chat/constants';
import type { ChatUsageCost, ChatUsageTokens } from '#api/chat/chat.schema.js';
import { MorphCompactionContractError } from '#api/chat/utils/compaction-errors.js';
import { RedisReadDedupStore } from '#api/chat/redis-read-dedup-store.js';
import { collectStreamChunks, collectFinalMessage } from '#testing/stream-consumer.js';
import {
  expectNoErrors,
  extractUsageData,
  extractContextCompactionData,
  expectHasTextContent,
} from '#testing/stream-assertions.js';
import { createTestApp } from '#testing/create-test-app.js';
import type { CreateTestAppOptions, TestApp } from '#testing/create-test-app.js';
import { buildCadAgent, providerEnvForModelId, requiresEnv } from '#testing/skip-helpers.js';

const modelId = process.env['TEST_MODEL_ID'] ?? 'anthropic-claude-sonnet-4.6';

class ScriptedGeoSpecLoopModel extends BaseChatModel {
  private callCount = 0;

  public constructor() {
    super({});
  }

  public override _llmType(): string {
    return 'scripted-geospec-loop-model';
  }

  public override _combineLLMOutput(): Record<string, unknown> {
    return {};
  }

  public override bindTools(): this {
    return this;
  }

  public override async _generate(
    _messages: BaseMessage[],
    _options: this['ParsedCallOptions'],
    _runManager?: CallbackManagerForLLMRun,
  ): Promise<ChatResult> {
    this.callCount += 1;

    if (this.callCount <= 3) {
      const message = new AIMessage({
        content: '',
        tool_calls: [
          {
            id: `call_test_model_${this.callCount}`,
            name: toolName.testModel,
            args: { files: ['main.geospec.ts'] },
            type: 'tool_call',
          },
        ],
        usage_metadata: { input_tokens: 100, output_tokens: 1, total_tokens: 101 },
        response_metadata: { model: 'scripted-geospec-loop-model' },
      });
      return { generations: [{ text: '', message }] };
    }

    const message = new AIMessage({
      content: 'Stopped after the safeguard reminder.',
      usage_metadata: { input_tokens: 100, output_tokens: 5, total_tokens: 105 },
      response_metadata: { model: 'scripted-geospec-loop-model' },
    });
    return { generations: [{ text: message.content as string, message }] };
  }
}

class RecordingCompactionModel extends BaseChatModel {
  public readonly calls: BaseMessage[][] = [];

  public constructor() {
    super({});
  }

  public override _llmType(): string {
    return 'recording-compaction-model';
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
    const message = new AIMessage({
      content: `recorded turn ${this.calls.length}`,
      usage_metadata: { input_tokens: 100, output_tokens: 5, total_tokens: 105 },
      response_metadata: { model: 'recording-compaction-model' },
    });
    return { generations: [{ text: message.content as string, message }] };
  }
}

class RedisMockStoreService {
  public readonly redis = new IORedisMock() as unknown as Redis;

  private readonly store = new RedisReadDedupStore({ redis: this.redis, ttlSeconds: 60 });

  public getStore(): RedisReadDedupStore {
    return this.store;
  }

  public getReadDedupClearer(): RedisReadDedupStore {
    return this.store;
  }

  public async quit(): Promise<void> {
    await this.redis.quit();
  }
}

class GeminiStreamingSignatureReplayModel extends BaseChatModel {
  public readonly calls: BaseMessage[][] = [];

  public constructor() {
    super({});
  }

  public override _llmType(): string {
    return 'gemini-streaming-signature-replay-model';
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
            id: 'call_create_file_signed_by_gemini',
            name: toolName.createFile,
            args: {
              targetFile: 'main.ts',
              content: 'export default function main() { return "hello"; }\n',
            },
            type: 'tool_call',
          },
        ],
        additional_kwargs: {
          // LangChain's Gemini formatter accepts this positional signature
          // carrier when it matches the final generated parts array. Tau
          // middleware must preserve it without adding a parallel Gemini
          // signature normalizer or preflight validator.
          signatures: ['sig_google_function_call_step_1'],
        },
        usage_metadata: { input_tokens: 100, output_tokens: 5, total_tokens: 105 },
        response_metadata: { model: 'google-gemini-3.5-flash', model_provider: 'google-vertexai' },
      });
      return { generations: [{ text: '', message }] };
    }

    const message = new AIMessage({
      content: 'Created main.ts.',
      usage_metadata: { input_tokens: 120, output_tokens: 5, total_tokens: 125 },
      response_metadata: { model: 'google-gemini-3.5-flash', model_provider: 'google-vertexai' },
    });
    return { generations: [{ text: message.content as string, message }] };
  }
}

const scriptedModelService = {
  buildModel() {
    return {
      model: new ScriptedGeoSpecLoopModel(),
      support: {
        tools: true,
        toolChoice: true,
        modalities: { input: ['text', 'image'], output: ['text'] },
      },
    };
  },
  getProviderId() {
    return 'anthropic';
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
    return 'test';
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
} satisfies CreateTestAppOptions['modelService'];

// Live test — requires `MORPH_API_KEY` (tool-offloading) plus the provider
// key derived from `TEST_MODEL_ID`. Skips cleanly when either is missing.
const providerEnvVariable = providerEnvForModelId(modelId);

describe.skipIf(providerEnvVariable === undefined || requiresEnv(providerEnvVariable, 'MORPH_API_KEY'))(
  `Middleware Integration: ${modelId}`,
  () => {
    let testApp: TestApp;

    beforeAll(async () => {
      testApp = await createTestApp();
    }, 30_000);

    afterAll(async () => {
      await testApp.app.close();
    });

    // ===========================================================================
    // Transcript middleware
    // ===========================================================================

    it('should write JSONL transcript to .tau/transcripts/', async () => {
      const threadId = `test-transcript-${Date.now()}`;

      const response = await fetch(`${testApp.baseUrl}/v1/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: threadId,
          messages: [
            {
              id: 'msg_1',
              role: 'user',
              parts: [{ type: 'text', text: 'Say hello in exactly 5 words.' }],
              metadata: { model: modelId, kernel: 'replicad' },
            },
          ],
          agent: buildCadAgent(modelId, 'replicad'),
        }),
      });

      expect(response.ok, `HTTP ${response.status}: ${response.statusText}`).toBe(true);

      const chunks = await collectStreamChunks(response);
      expectNoErrors(chunks);

      const message = await collectFinalMessage(chunks);
      expectHasTextContent(message);

      const transcriptPath = `.tau/transcripts/${threadId}.jsonl`;
      const transcriptExists = await testApp.memFs.exists(transcriptPath);
      expect(transcriptExists, `Expected transcript file at ${transcriptPath}`).toBe(true);

      if (transcriptExists) {
        const content = await testApp.memFs.readFile(transcriptPath);
        const text = typeof content === 'string' ? content : new TextDecoder().decode(content);
        const lines = text.split('\n').filter((l: string) => l.trim().length > 0);
        expect(lines.length).toBeGreaterThan(0);

        // The transcript schema (see `transcript.middleware.ts` JSDoc) records:
        //   - { role: "user", content, timestamp }                   — no `type`
        //   - { role: "assistant", content, timestamp }              — no `type`
        //   - { role: "assistant", type: "thinking", content, ... }  — `type` present
        //   - { role: "tool", toolName, toolCallId, contentLength, … } — no `type`
        // Every line carries `role` + `timestamp`; only thinking blocks add `type`.
        for (const line of lines) {
          const parsed = JSON.parse(line) as Record<string, unknown>;
          expect(parsed).toHaveProperty('role');
          expect(parsed).toHaveProperty('timestamp');
        }
      }
    }, 60_000);

    // ===========================================================================
    // Tool offloading middleware
    // ===========================================================================

    it('should offload large tool results to .tau/tool-results/', async () => {
      const threadId = `test-offload-${Date.now()}`;

      const response = await fetch(`${testApp.baseUrl}/v1/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: threadId,
          messages: [
            {
              id: 'msg_1',
              role: 'user',
              parts: [
                {
                  type: 'text',
                  text: 'Search the web for "TypeScript performance optimization best practices 2026" and give me a detailed summary.',
                },
              ],
              metadata: { model: modelId, kernel: 'replicad' },
            },
          ],
          agent: buildCadAgent(modelId, 'replicad'),
        }),
      });

      expect(response.ok, `HTTP ${response.status}: ${response.statusText}`).toBe(true);

      const chunks = await collectStreamChunks(response);
      expectNoErrors(chunks);

      const message = await collectFinalMessage(chunks);
      expectHasTextContent(message);

      const usageData = extractUsageData(chunks);
      expect(usageData.length).toBeGreaterThan(0);
    }, 120_000);

    // ===========================================================================
    // Context compaction middleware
    // ===========================================================================

    it('should emit data-context-compaction when context exceeds threshold', async () => {
      const threadId = `test-compaction-${Date.now()}`;

      const longContent = 'A'.repeat(9000);
      const messages = [];

      for (let i = 0; i < 40; i++) {
        messages.push({
          id: `msg_user_${i}`,
          role: 'user',
          parts: [{ type: 'text', text: `Turn ${i}: ${longContent}` }],
          metadata: { model: modelId, kernel: 'replicad' },
        });
        messages.push({
          id: `msg_assistant_${i}`,
          role: 'assistant',
          parts: [{ type: 'text', text: `Response ${i}: ${longContent}` }],
          metadata: { model: modelId, kernel: 'replicad' },
        });
      }

      messages.push({
        id: 'msg_final',
        role: 'user',
        parts: [{ type: 'text', text: 'Summarize what we discussed.' }],
        metadata: { model: modelId, kernel: 'replicad' },
      });

      const response = await fetch(`${testApp.baseUrl}/v1/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: threadId, messages, agent: buildCadAgent(modelId, 'replicad') }),
      });

      expect(response.ok, `HTTP ${response.status}: ${response.statusText}`).toBe(true);

      const chunks = await collectStreamChunks(response);
      expectNoErrors(chunks);

      const compactionData = extractContextCompactionData(chunks);

      expect(compactionData.length, 'Expected context compaction data to be emitted').toBeGreaterThan(0);
      const first = compactionData[0]!;
      expect(first).toHaveProperty('tokensBeforeCompaction');
      expect(first).toHaveProperty('tokensAfterCompaction');
      expect(first).toHaveProperty('compressionRatio');
      expect(first).toHaveProperty('messagesEvicted');
      expect(first).toMatchObject({
        status: 'compacted',
        budgetKind: 'estimated',
      });

      const transcriptPath = `.tau/transcripts/${threadId}.jsonl`;
      const transcriptExists = await testApp.memFs.exists(transcriptPath);
      expect(transcriptExists, `Expected transcript at ${transcriptPath}`).toBe(true);
    }, 120_000);

    // ===========================================================================
    // Full pipeline: compaction + transcript + usage tracking
    // ===========================================================================

    it('should emit usage, transcript, and compaction data in a multi-turn conversation', async () => {
      const threadId = `test-pipeline-${Date.now()}`;

      const response = await fetch(`${testApp.baseUrl}/v1/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: threadId,
          messages: [
            {
              id: 'msg_1',
              role: 'user',
              parts: [
                {
                  type: 'text',
                  text: 'Create a file called main.ts with a simple Replicad cube. Use the create_file tool.',
                },
              ],
              metadata: { model: modelId, kernel: 'replicad' },
            },
          ],
          agent: buildCadAgent(modelId, 'replicad'),
        }),
      });

      expect(response.ok, `HTTP ${response.status}: ${response.statusText}`).toBe(true);

      const chunks = await collectStreamChunks(response);
      expectNoErrors(chunks);

      const usageData = extractUsageData(chunks);
      expect(usageData.length, 'Expected usage data to be emitted').toBeGreaterThan(0);

      const transcriptPath = `.tau/transcripts/${threadId}.jsonl`;
      const transcriptExists = await testApp.memFs.exists(transcriptPath);
      expect(transcriptExists, `Expected transcript at ${transcriptPath}`).toBe(true);
    }, 120_000);

    // ===========================================================================
    // Agent loop safeguards — end-to-end integration
    //
    // Drives the test_model prompt against a deterministic broken GeoSpec
    // RPC handler. The model is forced to repeat `run_geospec_tests` -> identical
    // error, and the safeguards middleware MUST fire AP1 (identical_error) within
    // a small bounded number of agent iterations.
    //
    // Prompt-cache benefit after the nudge is asserted by reading
    // `cacheReadTokens` from the usage chunks emitted after the nudge: persisting
    // the reminder via `beforeModel` (state.messages reducer) keeps the prefix
    // cache-stable so the post-nudge turn still benefits from the prior turn's
    // cache prefix.
    // ===========================================================================

    it('should fire AP1 (identical_error) within 8 iterations against a deterministic broken GeoSpec runner', async () => {
      const threadId = `test-safeguard-loop-${Date.now()}`;

      const brokenGeoSpec: RpcGeoSpecClient = {
        async runTests() {
          return {
            success: false,
            errorCode: 'IO_ERROR',
            message: 'Deterministic broken run_geospec_tests: GeoSpec runner unavailable',
          };
        },
      };

      await testApp.app.close();
      testApp = await createTestApp({ geospecStub: brokenGeoSpec, modelService: scriptedModelService });

      await testApp.memFs.writeFile('main.scad', 'cube([10, 10, 10]);');
      await testApp.memFs.writeFile(
        'main.geospec.ts',
        [
          "import { describe, expectGeo, it } from 'geospec';",
          "import { loadModel } from 'geospec/model';",
          '',
          "describe('main model', () => {",
          "  it('should render', async () => {",
          "    const model = await loadModel({ file: 'main.scad' });",
          '    expectGeo(model).toHaveBoundingBox({ size: { x: 10 }, tolerance: 1 });',
          '  });',
          '});',
          '',
        ].join('\n'),
      );

      const response = await fetch(`${testApp.baseUrl}/v1/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: threadId,
          messages: [
            {
              id: 'msg_1',
              role: 'user',
              parts: [
                {
                  type: 'text',
                  text: 'Call test_model four times in a row with the same arguments, even if the first call returns an error. Do not inspect files first and do not stop after the first failure.',
                },
              ],
              metadata: { model: modelId, kernel: 'openscad' },
            },
          ],
          agent: buildCadAgent(modelId, 'openscad', { testingEnabled: true }),
        }),
      });

      expect(response.ok, `HTTP ${response.status}: ${response.statusText}`).toBe(true);

      const chunks = await collectStreamChunks(response);
      expectNoErrors(chunks);

      const transcriptPath = `.tau/transcripts/${threadId}.jsonl`;
      const transcriptExists = await testApp.memFs.exists(transcriptPath);
      expect(transcriptExists, `Expected transcript at ${transcriptPath}`).toBe(true);

      const transcriptContent = await testApp.memFs.readFile(transcriptPath);
      const transcriptText =
        typeof transcriptContent === 'string' ? transcriptContent : new TextDecoder().decode(transcriptContent);
      const safeguardLines = transcriptText
        .split('\n')
        .filter((line) => line.trim().length > 0)
        .map((line) => JSON.parse(line) as Record<string, unknown>)
        .filter((entry) => entry['role'] === 'safeguard');
      expect(safeguardLines.length, 'Expected at least one safeguard intervention').toBeGreaterThanOrEqual(1);
      expect(safeguardLines[0]?.['pattern']).toBe('identical_error');

      const usageData = extractUsageData(chunks);
      expect(usageData.length, 'Expected at least one usage chunk').toBeGreaterThan(0);

      // Bounded iterations. The chat controller emits one usage chunk per LLM
      // turn; capping at 8 enforces termination well before the LangGraph
      // recursion limit (2000).
      expect(usageData.length, `Expected < 8 LLM turns, observed ${usageData.length}`).toBeLessThan(8);

      // Token budget per repeated failure pattern. Sum input tokens across
      // turns and divide by the number of times the same identical_error fired.
      // The safeguard MUST cap rep-cost at <10k input tokens per pattern.
      const totalInputTokens = usageData.reduce((sum, u) => sum + (Number(u['inputTokens']) || 0), 0);
      const tokensPerPattern = totalInputTokens / Math.max(1, safeguardLines.length);
      expect(
        tokensPerPattern,
        `Expected < 10k input tokens per fired pattern, observed ${tokensPerPattern}`,
      ).toBeLessThan(10_000);

      // CS5: persisted SAFEGUARD nudges (agent-safeguards.middleware.ts AP1
      // identical_error) must NOT bust the cache prefix on the very next turn.
      // Note: this is independent of the token-usage reminder gate (R1, see
      // token-usage-context.middleware.ts and
      // docs/research/gemini-prompt-cache-busting.md): the token-usage
      // reminder is suppressed below 70% of the context window so this test's
      // small fixtures do not exercise it; the assertion below is solely
      // about whether the safeguard's <system-reminder> persists across turns
      // without breaking the cacheable prefix. We assert the post-nudge
      // turn's cache_read_input_tokens is at least 80% of the pre-nudge
      // median, demonstrating that injecting the safeguard nudge via
      // state.messages keeps the prefix cache-warm.
      const cacheReadByTurn = usageData.map((u) => Number(u['cacheReadTokens']) || 0);
      if (cacheReadByTurn.length >= 4 && safeguardLines.length > 0) {
        const preNudge = cacheReadByTurn.slice(0, -1);
        const postNudge = cacheReadByTurn.at(-1) ?? 0;
        const sortedPre = [...preNudge].sort((a, b) => a - b);
        const median = sortedPre[Math.floor(sortedPre.length / 2)] ?? 0;
        if (median > 0) {
          expect(
            postNudge,
            `CS5: post-nudge cache_read=${postNudge} should be >= 80% of pre-nudge median=${median}`,
          ).toBeGreaterThanOrEqual(median * 0.8);
        }
      }
    }, 180_000);
  },
);

describe('Middleware Integration: deterministic compaction state rewrite', () => {
  let testApp: TestApp;
  let recordingModel: RecordingCompactionModel;

  beforeAll(async () => {
    recordingModel = new RecordingCompactionModel();
    testApp = await createTestApp({
      modelService: {
        ...scriptedModelService,
        buildModel() {
          return { model: recordingModel };
        },
        getContextWindow() {
          return 1000;
        },
      },
      compactionService: {
        async compact() {
          return {
            compactedMessages: [new AIMessage('[Compacted conversation history]\nSummary without raw evicted text')],
            stats: {
              tokensBeforeCompaction: 2000,
              tokensAfterCompaction: 25,
              compressionRatio: 0.0125,
              messagesEvicted: 4,
            },
          };
        },
      },
    });
  }, 30_000);

  afterAll(async () => {
    await testApp.app.close();
  });

  it('compacts one turn and succeeds on the following turn without resending evicted raw strings', async () => {
    const threadId = `test-deterministic-compaction-${Date.now()}`;
    const evictedText = `EVICT_ME_${Date.now()} ${'A'.repeat(8000)}`;

    const firstResponse = await fetch(`${testApp.baseUrl}/v1/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: threadId,
        messages: [
          {
            id: 'msg_evicted_user',
            role: 'user',
            parts: [{ type: 'text', text: evictedText }],
            metadata: { model: modelId, kernel: 'replicad' },
          },
          {
            id: 'msg_evicted_assistant',
            role: 'assistant',
            parts: [{ type: 'text', text: 'old assistant without sentinel' }],
            metadata: { model: modelId, kernel: 'replicad' },
          },
          {
            id: 'msg_evicted_user_2',
            role: 'user',
            parts: [{ type: 'text', text: 'more old context without sentinel' }],
            metadata: { model: modelId, kernel: 'replicad' },
          },
          {
            id: 'msg_evicted_assistant_2',
            role: 'assistant',
            parts: [{ type: 'text', text: 'more old assistant context without sentinel' }],
            metadata: { model: modelId, kernel: 'replicad' },
          },
          {
            id: 'msg_recent_user',
            role: 'user',
            parts: [{ type: 'text', text: 'recent question' }],
            metadata: { model: modelId, kernel: 'replicad' },
          },
        ],
        agent: buildCadAgent(modelId, 'replicad'),
      }),
    });

    expect(firstResponse.ok, `HTTP ${firstResponse.status}: ${firstResponse.statusText}`).toBe(true);
    const firstChunks = await collectStreamChunks(firstResponse);
    expectNoErrors(firstChunks);
    const compactionData = extractContextCompactionData(firstChunks);
    expect(compactionData.length, 'Expected first turn to compact').toBeGreaterThan(0);
    const compaction = compactionData[0]!;
    expect(compaction['status']).toBe('compacted');

    const secondResponse = await fetch(`${testApp.baseUrl}/v1/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: threadId,
        messages: [
          {
            id: 'msg_evicted_user',
            role: 'user',
            parts: [{ type: 'text', text: evictedText }],
            metadata: { model: modelId, kernel: 'replicad' },
          },
          {
            id: 'msg_evicted_assistant',
            role: 'assistant',
            parts: [{ type: 'text', text: 'old assistant without sentinel' }],
            metadata: { model: modelId, kernel: 'replicad' },
          },
          {
            id: 'msg_evicted_user_2',
            role: 'user',
            parts: [{ type: 'text', text: 'more old context without sentinel' }],
            metadata: { model: modelId, kernel: 'replicad' },
          },
          {
            id: 'msg_evicted_assistant_2',
            role: 'assistant',
            parts: [{ type: 'text', text: 'more old assistant context without sentinel' }],
            metadata: { model: modelId, kernel: 'replicad' },
          },
          {
            id: 'msg_recent_user',
            role: 'user',
            parts: [{ type: 'text', text: 'recent question' }],
            metadata: { model: modelId, kernel: 'replicad' },
          },
          {
            id: 'msg_assistant_after_compaction',
            role: 'assistant',
            parts: [
              { type: 'text', text: 'recorded turn 1' },
              { type: 'data-context-compaction', id: compaction['id'], data: compaction },
            ],
            metadata: { model: modelId, kernel: 'replicad' },
          },
          {
            id: 'msg_followup',
            role: 'user',
            parts: [{ type: 'text', text: 'continue without old raw context' }],
            metadata: { model: modelId, kernel: 'replicad' },
          },
        ],
        agent: buildCadAgent(modelId, 'replicad'),
      }),
    });

    expect(secondResponse.ok, `HTTP ${secondResponse.status}: ${secondResponse.statusText}`).toBe(true);
    const secondChunks = await collectStreamChunks(secondResponse);
    expectNoErrors(secondChunks);

    const secondProviderPayload = recordingModel.calls[1] ?? [];
    expect(recordingModel.calls.length).toBeGreaterThanOrEqual(2);
    expect(providerPayloadText(secondProviderPayload)).not.toContain(evictedText);
    expect(providerPayloadText(secondProviderPayload)).toContain('Summary without raw evicted text');
  }, 60_000);
});

describe('Middleware Integration: Redis read-dedup compaction clear', () => {
  let testApp: TestApp;
  let recordingModel: RecordingCompactionModel;
  let storeService: RedisMockStoreService;

  beforeAll(async () => {
    recordingModel = new RecordingCompactionModel();
    storeService = new RedisMockStoreService();
    testApp = await createTestApp({
      storeService,
      modelService: {
        ...scriptedModelService,
        buildModel() {
          return { model: recordingModel };
        },
        getContextWindow() {
          return 1000;
        },
      },
      compactionService: {
        async compact() {
          return {
            compactedMessages: [new AIMessage('[Compacted conversation history]\nRedis read-dedup clear summary')],
            stats: {
              tokensBeforeCompaction: 2000,
              tokensAfterCompaction: 25,
              compressionRatio: 0.0125,
              messagesEvicted: 4,
            },
          };
        },
      },
    });
  }, 30_000);

  afterAll(async () => {
    await testApp.app.close();
    await storeService.quit();
  });

  it('clears Redis read-dedup pointers after compaction through production store wiring', async () => {
    const threadId = `test-redis-dedup-clear-${Date.now()}`;
    const otherThreadId = `test-redis-dedup-clear-other-${Date.now()}`;
    const store = storeService.getStore();

    await store.put(['recent_reads', threadId], 'fp-1', { priorToolCallId: 'tc-1', modifiedAt: 1 });
    await store.put(['recent_reads', threadId], 'fp-2', { priorToolCallId: 'tc-2', modifiedAt: 2 });
    await store.put(['recent_reads', otherThreadId], 'fp-3', { priorToolCallId: 'tc-3', modifiedAt: 3 });

    const response = await fetch(`${testApp.baseUrl}/v1/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: threadId,
        messages: [
          {
            id: 'msg_evicted_user',
            role: 'user',
            parts: [{ type: 'text', text: `old context ${'A'.repeat(8000)}` }],
            metadata: { model: modelId, kernel: 'replicad' },
          },
          {
            id: 'msg_evicted_assistant',
            role: 'assistant',
            parts: [{ type: 'text', text: 'old assistant context' }],
            metadata: { model: modelId, kernel: 'replicad' },
          },
          {
            id: 'msg_evicted_user_2',
            role: 'user',
            parts: [{ type: 'text', text: `more old context ${'B'.repeat(8000)}` }],
            metadata: { model: modelId, kernel: 'replicad' },
          },
          {
            id: 'msg_evicted_assistant_2',
            role: 'assistant',
            parts: [{ type: 'text', text: 'more old assistant context' }],
            metadata: { model: modelId, kernel: 'replicad' },
          },
          {
            id: 'msg_recent_user',
            role: 'user',
            parts: [{ type: 'text', text: 'recent question' }],
            metadata: { model: modelId, kernel: 'replicad' },
          },
        ],
        agent: buildCadAgent(modelId, 'replicad'),
      }),
    });

    expect(response.ok, `HTTP ${response.status}: ${response.statusText}`).toBe(true);
    const chunks = await collectStreamChunks(response);
    expectNoErrors(chunks);

    const compactionData = extractContextCompactionData(chunks);
    expect(compactionData[0]).toMatchObject({ status: 'compacted' });
    expect(recordingModel.calls).toHaveLength(1);

    expect(await store.get(['recent_reads', threadId], 'fp-1')).toBeNull();
    expect(await store.get(['recent_reads', threadId], 'fp-2')).toBeNull();
    expect(await store.get(['recent_reads', otherThreadId], 'fp-3')).not.toBeNull();
  }, 60_000);
});

describe('Middleware Integration: Gemini streaming function-call signature replay', () => {
  let testApp: TestApp;
  let replayModel: GeminiStreamingSignatureReplayModel;

  beforeAll(async () => {
    replayModel = new GeminiStreamingSignatureReplayModel();
    testApp = await createTestApp({
      modelService: {
        ...scriptedModelService,
        buildModel() {
          return { model: replayModel };
        },
        getProviderId() {
          return 'vertexai';
        },
        getOtelProviderName() {
          return 'gcp.vertex_ai';
        },
      },
    });
  }, 30_000);

  afterAll(async () => {
    await testApp.app.close();
  });

  it('replays a fresh Gemini streaming tool call with its thought signature into the immediate second provider step', async () => {
    const threadId = `test-gemini-signature-replay-${Date.now()}`;

    const response = await fetch(`${testApp.baseUrl}/v1/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: threadId,
        messages: [
          {
            id: 'msg_user_create_file',
            role: 'user',
            parts: [{ type: 'text', text: 'Create main.ts and then confirm it was created.' }],
            metadata: { model: 'google-gemini-3.5-flash', kernel: 'replicad' },
          },
        ],
        agent: buildCadAgent('google-gemini-3.5-flash', 'replicad'),
      }),
    });

    expect(response.ok, `HTTP ${response.status}: ${response.statusText}`).toBe(true);
    const chunks = await collectStreamChunks(response);
    expectNoErrors(chunks);

    expect(replayModel.calls).toHaveLength(2);
    expect(await testApp.memFs.exists('main.ts')).toBe(true);
  }, 60_000);
});

describe('Middleware Integration: deterministic compaction failures', () => {
  let testApp: TestApp;
  let recordingModel: RecordingCompactionModel;
  let compactCalls = 0;

  beforeAll(async () => {
    recordingModel = new RecordingCompactionModel();
    testApp = await createTestApp({
      modelService: {
        ...scriptedModelService,
        buildModel() {
          return { model: recordingModel };
        },
        getContextWindow() {
          return 1000;
        },
      },
      compactionService: {
        async compact() {
          compactCalls += 1;
          throw new MorphCompactionContractError('Morph compact response missing output');
        },
      },
    });
  }, 30_000);

  afterAll(async () => {
    await testApp.app.close();
  });

  it('emits a failed compaction event and blocks provider dispatch when required compaction fails', async () => {
    const threadId = `test-deterministic-compaction-failure-${Date.now()}`;
    compactCalls = 0;

    const response = await fetch(`${testApp.baseUrl}/v1/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: threadId,
        messages: [
          {
            id: 'msg_evicted_user',
            role: 'user',
            parts: [{ type: 'text', text: `old context ${'A'.repeat(8000)}` }],
            metadata: { model: modelId, kernel: 'replicad' },
          },
          {
            id: 'msg_evicted_assistant',
            role: 'assistant',
            parts: [{ type: 'text', text: 'old assistant context' }],
            metadata: { model: modelId, kernel: 'replicad' },
          },
          {
            id: 'msg_evicted_user_2',
            role: 'user',
            parts: [{ type: 'text', text: `more old context ${'B'.repeat(8000)}` }],
            metadata: { model: modelId, kernel: 'replicad' },
          },
          {
            id: 'msg_evicted_assistant_2',
            role: 'assistant',
            parts: [{ type: 'text', text: 'more old assistant context' }],
            metadata: { model: modelId, kernel: 'replicad' },
          },
          {
            id: 'msg_recent_user',
            role: 'user',
            parts: [{ type: 'text', text: 'recent question' }],
            metadata: { model: modelId, kernel: 'replicad' },
          },
          {
            id: 'msg_recent_assistant',
            role: 'assistant',
            parts: [{ type: 'text', text: 'recent answer' }],
            metadata: { model: modelId, kernel: 'replicad' },
          },
        ],
        agent: buildCadAgent(modelId, 'replicad'),
      }),
    });

    expect(response.ok, `HTTP ${response.status}: ${response.statusText}`).toBe(true);
    const chunks = await collectStreamChunks(response);
    const compactionData = extractContextCompactionData(chunks);
    const errorChunk = chunks.find((chunk) => chunk.type === 'error') as { errorText?: string } | undefined;
    const error = JSON.parse(errorChunk?.errorText ?? '{}') as Record<string, unknown>;

    expect(compactCalls).toBe(1);
    expect(recordingModel.calls).toHaveLength(0);
    expect(compactionData[0]).toMatchObject({
      status: 'failed',
      compactionFailureKind: 'morph_contract_error',
      failureDisposition: 'blocked_before_provider',
      transcriptFilePath: null,
    });
    expect(error).toMatchObject({
      code: 'CONTEXT_COMPACTION_FAILED',
      category: 'tool_error',
    });
    expect(error['message']).toContain('Failure kind: morph_contract_error');
  }, 60_000);
});

function providerPayloadText(messages: readonly BaseMessage[]): string {
  return messages
    .map((message) => (typeof message.content === 'string' ? message.content : JSON.stringify(message.content)))
    .join('\n');
}
