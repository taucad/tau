// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createCanvas } from 'canvas';
import type { RpcImageClient } from '@taucad/chat/rpc';
import { collectFinalMessage, collectStreamChunks } from '#testing/stream-consumer.js';
import {
  expectCacheTokenNormalization,
  expectChunkTypesInclude,
  expectHasTextContent,
  expectMultipleSteps,
  expectNoErrors,
  expectToolCallSucceeded,
  extractUsageData,
} from '#testing/stream-assertions.js';
import { createTestApp } from '#testing/create-test-app.js';
import type { TestApp } from '#testing/create-test-app.js';
import { buildCadAgent, requiresEnv } from '#testing/skip-helpers.js';

const modelId = 'together-kimi-k3';
const redCanvas = createCanvas(64, 64);
const redContext = redCanvas.getContext('2d');
redContext.fillStyle = '#ff0000';
redContext.fillRect(0, 0, redCanvas.width, redCanvas.height);
const redPngDataUrl = redCanvas.toDataURL('image/png');

describe.skipIf(requiresEnv('TOGETHER_API_KEY'))('Together Kimi K3 live integration', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    const imagesStub: RpcImageClient = {
      async captureImages() {
        return { success: true, images: [{ view: 'isometric', dataUrl: redPngDataUrl }] };
      },
    };
    testApp = await createTestApp({ imagesStub });
  }, 30_000);

  afterAll(async () => {
    await testApp.app.close();
  });

  it('should stream reasoning and final text through Tau UI messages', async () => {
    const response = await fetch(`${testApp.baseUrl}/v1/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: `together-kimi-reasoning-${Date.now()}`,
        messages: [
          {
            id: 'msg_1',
            role: 'user',
            parts: [{ type: 'text', text: 'Think briefly, then answer exactly: Ack.' }],
            metadata: { model: modelId, kernel: 'replicad' },
          },
        ],
        agent: buildCadAgent(modelId, 'replicad'),
      }),
    });

    expect(response.ok, `HTTP ${response.status}: ${response.statusText}`).toBe(true);
    const chunks = await collectStreamChunks(response);
    expectNoErrors(chunks);
    expectChunkTypesInclude(chunks, 'reasoning-delta');
    const message = await collectFinalMessage(chunks);
    expectHasTextContent(message);
    expect(message.parts.flatMap((part) => (part.type === 'text' ? [part.text] : [])).join('')).toContain('Ack');
  }, 180_000);

  it('should complete a two-call Tau tool loop with reasoning replay', async () => {
    const response = await fetch(`${testApp.baseUrl}/v1/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: `together-kimi-tool-loop-${Date.now()}`,
        messages: [
          {
            id: 'msg_1',
            role: 'user',
            parts: [
              {
                type: 'text',
                text: 'Create main.ts with exactly this content using create_file: export const answer = 42; Then confirm completion.',
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
    expectChunkTypesInclude(chunks, 'reasoning-delta');
    expectMultipleSteps(chunks, 2);
    expectToolCallSucceeded(await collectFinalMessage(chunks), 'create_file');
    expect(await testApp.memFs.readFile('main.ts', 'utf8')).toContain('export const answer = 42;');
  }, 180_000);

  it('should expose repeated-prefix cache reads through Tau billing usage', async () => {
    const threadId = `together-kimi-cache-${Date.now()}`;
    const sharedPrefix = Array.from(
      { length: 220 },
      (_, index) =>
        `Stable CAD constraint ${index}: preserve dimensions, names, materials, and assembly relationships.`,
    ).join('\n');
    const firstUser = {
      id: 'msg_user_1',
      role: 'user',
      parts: [{ type: 'text', text: `${sharedPrefix}\n\nDo not call tools. Answer exactly: cache probe one.` }],
      metadata: { model: modelId, kernel: 'replicad' },
    };
    const firstResponse = await fetch(`${testApp.baseUrl}/v1/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: threadId, messages: [firstUser], agent: buildCadAgent(modelId, 'replicad') }),
    });

    expect(firstResponse.ok, `Turn 1 HTTP ${firstResponse.status}: ${firstResponse.statusText}`).toBe(true);
    const firstChunks = await collectStreamChunks(firstResponse);
    expectNoErrors(firstChunks);
    const firstMessage = await collectFinalMessage(firstChunks);
    const replayParts = firstMessage.parts.filter((part) => part.type === 'reasoning' || part.type === 'text');

    const secondResponse = await fetch(`${testApp.baseUrl}/v1/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: threadId,
        messages: [
          firstUser,
          {
            id: 'msg_assistant_1',
            role: 'assistant',
            parts: replayParts,
            metadata: { model: modelId, kernel: 'replicad' },
          },
          {
            id: 'msg_user_2',
            role: 'user',
            parts: [{ type: 'text', text: 'Do not call tools. Answer exactly: cache probe two.' }],
            metadata: { model: modelId, kernel: 'replicad' },
          },
        ],
        agent: buildCadAgent(modelId, 'replicad'),
      }),
    });

    expect(secondResponse.ok, `Turn 2 HTTP ${secondResponse.status}: ${secondResponse.statusText}`).toBe(true);
    const secondChunks = await collectStreamChunks(secondResponse);
    expectNoErrors(secondChunks);
    expectCacheTokenNormalization(secondChunks);
    expect(
      extractUsageData(secondChunks).some((usage) => Number(usage['cacheReadTokens']) > 0),
      'Expected Together Kimi cache reads in Tau usage data',
    ).toBe(true);
  }, 180_000);

  it('should ground a Tau screenshot tool result sent as a base64 image', async () => {
    await testApp.memFs.writeFile('main.ts', 'export const screenshotFixture = true;');
    const response = await fetch(`${testApp.baseUrl}/v1/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: `together-kimi-vision-${Date.now()}`,
        messages: [
          {
            id: 'msg_1',
            role: 'user',
            parts: [
              {
                type: 'text',
                text: 'Take one screenshot of main.ts with the screenshot tool. Inspect the pixels and name the single solid color in the image.',
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
    expectToolCallSucceeded(message, 'screenshot');
    const reply = message.parts
      .flatMap((part) => (part.type === 'text' ? [part.text] : []))
      .join(' ')
      .toLowerCase();
    expect(reply).toContain('red');
    expect(reply).not.toContain('base64');
  }, 180_000);
});
