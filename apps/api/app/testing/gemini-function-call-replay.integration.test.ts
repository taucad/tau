// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { collectFinalMessage, collectStreamChunks } from '#testing/stream-consumer.js';
import {
  expectHasToolCall,
  expectMultipleSteps,
  expectNoErrors,
  expectToolCallSucceeded,
} from '#testing/stream-assertions.js';
import { createTestApp } from '#testing/create-test-app.js';
import type { TestApp } from '#testing/create-test-app.js';
import { buildCadAgent, requiresEnv } from '#testing/skip-helpers.js';

const modelId = 'google-gemini-3.5-flash';

describe.skipIf(requiresEnv('GOOGLE_VERTEX_AI_CREDENTIALS'))('Gemini function-call replay (live)', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp();
  }, 30_000);

  afterAll(async () => {
    await testApp.app.close();
  });

  it('completes the immediate second provider step after a Gemini tool call', async () => {
    const response = await fetch(`${testApp.baseUrl}/v1/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: `gemini-function-call-replay-${Date.now()}`,
        messages: [
          {
            id: 'msg_user_create_file',
            role: 'user',
            parts: [
              {
                type: 'text',
                text: [
                  'Use the create_file tool exactly once.',
                  'Create main.ts with this exact content:',
                  'export default function main() { return "hello"; }',
                  'After the tool result, reply with one short confirmation sentence.',
                ].join('\n'),
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
    expectMultipleSteps(chunks, 2);

    const finalMessage = await collectFinalMessage(chunks);
    expectHasToolCall(finalMessage, 'create_file');
    expectToolCallSucceeded(finalMessage, 'create_file');
    expect(await testApp.memFs.exists('main.ts')).toBe(true);
  }, 120_000);
});
