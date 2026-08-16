import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { collectStreamChunks, collectFinalMessage } from '#testing/stream-consumer.js';
import { expectChunkTypesInclude, expectHasTextContent, expectNoErrors } from '#testing/stream-assertions.js';
import { createTestApp } from '#testing/create-test-app.js';
import type { TestApp } from '#testing/create-test-app.js';
import { buildCadAgent, requiresEnv } from '#testing/skip-helpers.js';

const modelId = 'xai-grok-4.6';

describe.skipIf(requiresEnv('XAI_API_KEY'))('xAI Grok 4.6 live integration', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp();
  });

  afterAll(async () => {
    await testApp.app.close();
  });

  it('should stream reasoning and final text through the chat endpoint', async () => {
    const response = await fetch(`${testApp.baseUrl}/v1/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: `test-thread-xai-reasoning-${Date.now()}`,
        messages: [
          {
            id: 'msg_1',
            role: 'user',
            parts: [
              {
                type: 'text',
                text: 'Think briefly about the best CAD primitive for a cube, then answer exactly: Ack.',
              },
            ],
            metadata: {
              model: modelId,
              kernel: 'replicad',
            },
          },
        ],
        agent: buildCadAgent(modelId, 'replicad'),
      }),
    });

    expect(response.ok, `HTTP ${response.status}: ${response.statusText}`).toBe(true);

    const chunks = await collectStreamChunks(response);
    expectNoErrors(chunks);
    expectChunkTypesInclude(chunks, 'reasoning-delta');
    expectHasTextContent(await collectFinalMessage(chunks));
  }, 120_000);
});
