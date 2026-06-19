import process from 'node:process';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { collectStreamChunks, collectFinalMessage } from '#testing/stream-consumer.js';
import { expectHasToolCall, expectNoErrors, extractUsageData } from '#testing/stream-assertions.js';
import { createTestApp } from '#testing/create-test-app.js';
import type { TestApp } from '#testing/create-test-app.js';
import { buildCadAgent, providerEnvForModelId, requiresEnv } from '#testing/skip-helpers.js';

const modelId = process.env['TEST_MODEL_ID'] ?? 'morph-qwen-3.5-397b';
const providerEnvVariable = providerEnvForModelId(modelId);

describe.skipIf(providerEnvVariable === undefined || requiresEnv(providerEnvVariable))(
  `Morph Integration: ${modelId}`,
  () => {
    let testApp: TestApp;

    beforeAll(async () => {
      testApp = await createTestApp();
    });

    afterAll(async () => {
      await testApp.app.close();
    });

    it('should stream tool calls without errors', async () => {
      const response = await fetch(`${testApp.baseUrl}/v1/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: `test-morph-tools-${Date.now()}`,
          messages: [
            {
              id: 'msg_1',
              role: 'user',
              parts: [
                {
                  type: 'text',
                  text: 'Create a file called morph-test.ts with: export const value = 1;',
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

      expect(response.ok, `HTTP ${response.status}: ${await response.text()}`).toBe(true);

      const chunks = await collectStreamChunks(response);
      const message = await collectFinalMessage(chunks);

      expectNoErrors(message);
      expectHasToolCall(message, 'create_file');
      expect(extractUsageData(chunks)).toBeDefined();
    });
  },
);
