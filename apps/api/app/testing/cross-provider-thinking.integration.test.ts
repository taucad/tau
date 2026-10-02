import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp } from '#testing/create-test-app.js';
import type { TestApp } from '#testing/create-test-app.js';
import { collectStreamChunks, collectFinalMessage } from '#testing/stream-consumer.js';
import { expectChunkTypesInclude, expectNoErrors } from '#testing/stream-assertions.js';
import { buildCadAgent, requiresEnv } from '#testing/skip-helpers.js';

/**
 * Every `**Sub-title**`-style Markdown heading chunk in streamed reasoning text must begin
 * a new paragraph boundary (`\\n\\n` or stream start); otherwise GPT-5/5.5 summary parts render
 * glued to the preceding sentence.
 */
function assertBoldSubtitlesStartSection(reasoningMarkdown: string): void {
  const boldHeading = /\*\*[^\s*][^*]*?\*\*/g;
  let match = boldHeading.exec(reasoningMarkdown);
  let hitCount = 0;

  expect(
    reasoningMarkdown.includes('**'),
    'Reasoning should include markdown bold subtitles for integration coverage',
  ).toBe(true);

  while (match !== null) {
    hitCount++;
    const start = match.index;
    const prefix = reasoningMarkdown.slice(0, start);
    const hasParagraphLead = prefix.length === 0 || prefix.endsWith('\n\n');
    expect(hasParagraphLead, `Bold subtitle at column ${start} must follow \\n\\n or stream start`).toBe(true);

    match = boldHeading.exec(reasoningMarkdown);
  }

  expect(hitCount, 'Prompt must elicit ≥2 subtitles when run locally').toBeGreaterThanOrEqual(2);
}

/**
 * Real-LLM checks for cross-provider thinking/reasoning portability (checkpoint replay).
 *
 * Un-skip locally with provider keys in `apps/api/.env` to confirm Anthropic thinking
 * history followed by Gemini/OpenAI turns succeeds end-to-end after middleware + V1 config.
 *
 * Always-on coverage lives in `cross-provider-content-normalizer.middleware.test.ts`.
 */
describe.skipIf(requiresEnv('ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GOOGLE_VERTEX_AI_CREDENTIALS'))(
  'Cross-provider thinking-block portability (real LLM)',
  () => {
    let testApp: TestApp;

    beforeAll(async () => {
      testApp = await createTestApp();
    });

    afterAll(async () => {
      await testApp.app.close();
    });

    const buildThinkingThenAskPayload = (models: { first: string; second: string }) => ({
      id: `cross-provider-thinking-${models.first}-${models.second}-${Date.now()}`,
      messages: [
        {
          id: 'msg_user_1',
          role: 'user',
          parts: [{ type: 'text', text: 'Reply with a single word: hello.' }],
          metadata: { model: models.first, kernel: 'replicad' },
        },
        {
          id: 'msg_assistant_thinking',
          role: 'assistant',
          parts: [
            {
              type: 'reasoning',
              text: 'User wants one word.',
              providerMetadata: { anthropic: { thinkingSignature: 'dummy-signature-for-portability-test' } },
            },
            { type: 'text', text: 'hello', state: 'done' },
          ],
          metadata: { model: models.first, kernel: 'replicad' },
        },
        {
          id: 'msg_user_2',
          role: 'user',
          parts: [{ type: 'text', text: 'Now reply with a single word: bye.' }],
          metadata: { model: models.second, kernel: 'replicad' },
        },
      ],
      agent: buildCadAgent(models.second, 'replicad'),
    });

    it('accepts Anthropic-shaped thinking history then Gemini follow-up', async () => {
      const response = await fetch(`${testApp.baseUrl}/v1/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(
          buildThinkingThenAskPayload({ first: 'anthropic-claude-haiku-4.5', second: 'google-gemini-3.5-flash' }),
        ),
      });

      expect(response.ok, `HTTP ${response.status}`).toBe(true);
      expect(response.headers.get('content-type')).toContain('text/event-stream');

      const chunks = await collectStreamChunks(response);
      expectNoErrors(chunks);
      expectChunkTypesInclude(chunks, 'text-start');
    });

    it('accepts Anthropic-shaped thinking history then OpenAI follow-up', async () => {
      const response = await fetch(`${testApp.baseUrl}/v1/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(
          buildThinkingThenAskPayload({ first: 'anthropic-claude-haiku-4.5', second: 'openai-gpt-5.3-codex' }),
        ),
      });

      expect(response.ok, `HTTP ${response.status}`).toBe(true);
      const chunks = await collectStreamChunks(response);
      expectNoErrors(chunks);
      expectChunkTypesInclude(chunks, 'text-start');
    });

    it('accepts Vertex Gemini history then Anthropic follow-up (signature stripped upstream)', async () => {
      const response = await fetch(`${testApp.baseUrl}/v1/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(
          buildThinkingThenAskPayload({ first: 'google-gemini-3.5-flash', second: 'anthropic-claude-haiku-4.5' }),
        ),
      });

      expect(response.ok, `HTTP ${response.status}`).toBe(true);
      const chunks = await collectStreamChunks(response);
      expectNoErrors(chunks);
      expectChunkTypesInclude(chunks, 'text-start');
    });

    it('OpenAI GPT-5.5 reasoning bold subtitles are separated by paragraph breaks (summary seams)', async () => {
      const response = await fetch(`${testApp.baseUrl}/v1/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: `gpt55-summary-boundaries-${Date.now()}`,
          messages: [
            {
              id: 'msg_user_boundary',
              role: 'user',
              parts: [
                {
                  type: 'text',
                  text: 'In your internal reasoning stream only: plan in at least THREE short sections.\nEach section MUST start its title line with a markdown bold subtitle like **Considering X**, **Evaluating Y**, **Deciding Z**.\nWrite a concise paragraph after each subtitle.\nIn the FINAL assistant-visible reply send exactly: Ack.',
                },
              ],
              metadata: { model: 'openai-gpt-5.5', kernel: 'replicad' },
            },
          ],
          agent: buildCadAgent('openai-gpt-5.5', 'replicad'),
        }),
      });

      expect(response.ok, `HTTP ${response.status}`).toBe(true);
      expect(response.headers.get('content-type')).toContain('text/event-stream');

      const chunks = await collectStreamChunks(response);
      expectNoErrors(chunks);
      expectChunkTypesInclude(chunks, 'reasoning-delta');

      const finalAssistant = await collectFinalMessage(chunks);
      expect(finalAssistant.parts.some((part) => part.type === 'text')).toBe(true);

      let reasoningCombined = '';

      for (const part of finalAssistant.parts) {
        if (part.type === 'reasoning' && 'text' in part && typeof (part as { text: unknown }).text === 'string') {
          reasoningCombined += (part as { text: string }).text;
        }
      }

      expect(reasoningCombined.length).toBeGreaterThan(120);
      assertBoldSubtitlesStartSection(reasoningCombined);
    }, 120_000);
  },
);
