import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp } from '#testing/create-test-app.js';
import type { TestApp } from '#testing/create-test-app.js';
import { collectStreamChunks } from '#testing/stream-consumer.js';
import { expectChunkTypesInclude, expectNoErrors } from '#testing/stream-assertions.js';
import { buildCadAgent, requiresEnv } from '#testing/skip-helpers.js';

/**
 * Real-LLM integration coverage for interrupted tool calls with partial input.
 *
 * Each `it` POSTs to `/v1/chat` with a pre-baked message history that contains a
 * partial-input `output-error` tool part — the shape the AI SDK leaves in
 * `chat.messages` after a user interrupts a tool mid-stream. The fact that the
 * request is accepted (no 400 from `ZodValidationException`) and the provider
 * returns a coherent SSE stream proves end-to-end that schema relaxation,
 * server-side healing, and synthetic tool-result injection (sanitizer
 * middleware) all behave as specified for each provider's wire format.
 *
 * Skipped by default — un-skip locally to re-verify against real provider
 * endpoints. Requires `ANTHROPIC_API_KEY`, `GOOGLE_VERTEX_AI_CREDENTIALS`, and
 * `OPENAI_API_KEY` in `apps/api/.env` (auto-loaded by
 * `vitest.integration.config.ts`).
 *
 * Last verified: all three providers (anthropic-claude-haiku-4.5,
 * google-gemini-3.5-flash, openai-gpt-5.3-codex) accepted the partial-input
 * `output-error` history end-to-end, returning clean SSE streams with
 * `text-start` and no error chunks.
 */
describe.skipIf(requiresEnv('ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GOOGLE_VERTEX_AI_CREDENTIALS'))(
  'Interrupted-tool-call provider contracts (real LLM)',
  () => {
    let testApp: TestApp;

    beforeAll(async () => {
      testApp = await createTestApp();
    });

    afterAll(async () => {
      await testApp.app.close();
    });

    const buildInterruptedHistory = (model: string) => ({
      id: `interrupted-tool-${model}-${Date.now()}`,
      messages: [
        {
          id: 'msg_user_initial',
          role: 'user',
          parts: [
            {
              type: 'text',
              text: 'Read the file main.ts so you can describe its contents.',
            },
          ],
          metadata: { model, kernel: 'replicad' },
        },
        {
          id: 'msg_assistant_interrupted',
          role: 'assistant',
          parts: [
            {
              type: 'tool-read_file',
              toolCallId: 'call_interrupted_read',
              state: 'output-error',
              input: undefined,
              rawInput: { limit: 15 },
              errorText: JSON.stringify({
                errorCode: 'USER_INTERRUPTED',
                message: 'Interrupted by user.',
                toolName: 'read_file',
                toolCallId: 'call_interrupted_read',
              }),
            },
          ],
          metadata: { model, kernel: 'replicad' },
        },
        {
          id: 'msg_user_followup',
          role: 'user',
          parts: [
            {
              type: 'text',
              text: 'Never mind the file — just say hi in one short sentence.',
            },
          ],
          metadata: { model, kernel: 'replicad' },
        },
      ],
      agent: buildCadAgent(model, 'replicad'),
    });

    const assertProviderTolerated = async (model: string) => {
      const response = await fetch(`${testApp.baseUrl}/v1/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(buildInterruptedHistory(model)),
      });

      expect(
        response.ok,
        `${model}: expected /v1/chat to accept interrupted-tool history (HTTP ${response.status}: ${response.statusText})`,
      ).toBe(true);
      expect(response.headers.get('content-type')).toContain('text/event-stream');

      const chunks = await collectStreamChunks(response);
      expectNoErrors(chunks);
      expectChunkTypesInclude(chunks, 'text-start');
    };

    it('should accept partial-input output-error history when streaming via Anthropic Haiku', async () => {
      await assertProviderTolerated('anthropic-claude-haiku-4.5');
    }, 120_000);

    it('should accept partial-input output-error history when streaming via Vertex Gemini 3.5 Flash', async () => {
      await assertProviderTolerated('google-gemini-3.5-flash');
    }, 120_000);

    it('should accept partial-input output-error history when streaming via OpenAI GPT-5.3 Codex', async () => {
      await assertProviderTolerated('openai-gpt-5.3-codex');
    }, 120_000);
  },
);
