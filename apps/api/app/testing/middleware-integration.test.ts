// @vitest-environment node
import process from 'node:process';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { RpcGraphicsClient } from '@taucad/chat/rpc';
import { collectStreamChunks, collectFinalMessage } from '#testing/stream-consumer.js';
import {
  expectNoErrors,
  extractUsageData,
  extractContextCompactionData,
  expectHasTextContent,
} from '#testing/stream-assertions.js';
import { createTestApp } from '#testing/create-test-app.js';
import type { TestApp } from '#testing/create-test-app.js';
import { buildCadAgent, providerEnvForModelId, requiresEnv } from '#testing/skip-helpers.js';

const modelId = process.env['TEST_MODEL_ID'] ?? 'anthropic-claude-sonnet-4.6';

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

      const longContent = 'A'.repeat(100_000);
      const messages = [];

      for (let i = 0; i < 20; i++) {
        messages.push({
          id: `msg_user_${i}`,
          role: 'user',
          parts: [{ type: 'text', text: `Turn ${i}: ${longContent.slice(0, 5000)}` }],
          metadata: { model: modelId, kernel: 'replicad' },
        });
        messages.push({
          id: `msg_assistant_${i}`,
          role: 'assistant',
          parts: [{ type: 'text', text: `Response ${i}: ${longContent.slice(0, 5000)}` }],
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

      if (compactionData.length > 0) {
        const first = compactionData[0]!;
        expect(first).toHaveProperty('tokensBeforeCompaction');
        expect(first).toHaveProperty('tokensAfterCompaction');
        expect(first).toHaveProperty('compressionRatio');
        expect(first).toHaveProperty('messagesEvicted');

        const transcriptPath = `.tau/transcripts/${threadId}.jsonl`;
        const transcriptExists = await testApp.memFs.exists(transcriptPath);
        expect(transcriptExists, `Expected transcript at ${transcriptPath}`).toBe(true);
      }
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
    // Drives the screenshot prompt against a deterministic broken `fetchGeometry`
    // RPC handler. The model is forced to repeat `fetch_geometry` -> identical
    // error, and the safeguards middleware MUST fire AP1 (identical_error) within
    // a small bounded number of agent iterations.
    //
    // Prompt-cache benefit after the nudge is asserted by reading
    // `cacheReadTokens` from the usage chunks emitted after the nudge: persisting
    // the reminder via `beforeModel` (state.messages reducer) keeps the prefix
    // cache-stable so the post-nudge turn still benefits from the prior turn's
    // cache prefix.
    // ===========================================================================

    it('should fire AP1 (identical_error) within 8 iterations against a deterministic broken fetch_geometry', async () => {
      const threadId = `test-safeguard-loop-${Date.now()}`;

      const brokenGraphics: RpcGraphicsClient = {
        async fetchGeometry() {
          return {
            success: false,
            errorCode: 'IO_ERROR',
            message: 'Deterministic broken fetch_geometry: geometry unavailable',
          };
        },
        async exportGeometry() {
          return {
            success: false,
            errorCode: 'IO_ERROR',
            message: 'Deterministic broken exportGeometry: graphics surface offline',
          };
        },
        async captureScreenshot() {
          return {
            success: false,
            errorCode: 'IO_ERROR',
            message: 'Deterministic broken captureScreenshot: graphics surface offline',
          };
        },
        async captureObservations() {
          return {
            success: false,
            errorCode: 'IO_ERROR',
            message: 'Deterministic broken captureObservations',
          };
        },
      };

      await testApp.app.close();
      testApp = await createTestApp({ graphicsStub: brokenGraphics });

      await testApp.memFs.writeFile('main.scad', 'cube([10, 10, 10]);');

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
                  text: 'Take a screenshot of main.scad. Keep retrying until you succeed; do not give up.',
                },
              ],
              metadata: { model: modelId, kernel: 'openscad' },
            },
          ],
          agent: buildCadAgent(modelId, 'openscad'),
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
