import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { BaseMessage } from '@langchain/core/messages';
import { createTestApp } from '#testing/create-test-app.js';
import type { TestApp } from '#testing/create-test-app.js';
import { collectStreamChunks } from '#testing/stream-consumer.js';
import { buildCadAgent, requiresEnv } from '#testing/skip-helpers.js';

describe.skipIf(requiresEnv('ANTHROPIC_API_KEY'))('Chat graph-state reconciliation (Anthropic Haiku live)', () => {
  const modelId = 'anthropic-claude-haiku-4.5';
  let testApp: TestApp | undefined;

  beforeAll(async () => {
    testApp = await createTestApp();
    testApp.providerRequestRecorder.enable();
  });

  beforeEach(() => {
    testApp?.providerRequestRecorder.clear();
  });

  afterAll(async () => {
    testApp?.providerRequestRecorder.disable();
    await testApp?.app.close();
  });

  it('removes a cancelled graph-state user message before the replacement provider call', async () => {
    if (!testApp) {
      throw new Error('test app did not start');
    }

    const threadId = `test-reconcile-haiku-${Date.now()}`;
    const anchorMarker = `ANCHOR_${threadId}`;
    const cancelledMarker = `CANCELLED_GHOST_${threadId}`;
    const replacementMarker = `REPLACEMENT_VISIBLE_${threadId}`;

    const seedResponse = await fetch(`${testApp.baseUrl}/v1/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: threadId,
        messages: [
          {
            id: 'msg_anchor',
            role: 'user',
            parts: [{ type: 'text', text: `Reply with exactly "seed ok". Marker: ${anchorMarker}` }],
          },
          {
            id: 'msg_cancelled',
            role: 'user',
            parts: [{ type: 'text', text: `This marker represents a stopped draft: ${cancelledMarker}` }],
          },
        ],
        agent: buildCadAgent(modelId, 'replicad'),
      }),
    });
    expect(seedResponse.ok, `HTTP ${seedResponse.status}: ${seedResponse.statusText}`).toBe(true);
    await collectStreamChunks(seedResponse);

    testApp.providerRequestRecorder.clear();

    const replacementResponse = await fetch(`${testApp.baseUrl}/v1/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: threadId,
        messages: [
          {
            id: 'msg_anchor',
            role: 'user',
            parts: [{ type: 'text', text: `Reply with exactly "seed ok". Marker: ${anchorMarker}` }],
          },
          {
            id: 'msg_replacement',
            role: 'user',
            parts: [{ type: 'text', text: `Reply with exactly "replacement ok". Marker: ${replacementMarker}` }],
          },
        ],
        agent: buildCadAgent(modelId, 'replicad'),
      }),
    });
    expect(replacementResponse.ok, `HTTP ${replacementResponse.status}: ${replacementResponse.statusText}`).toBe(true);
    await collectStreamChunks(replacementResponse);

    const providerText = testApp.providerRequestRecorder
      .getRecords()
      .flatMap((record) => record.messages.flat())
      .map((message) => providerMessageText(message))
      .join('\n');

    expect(providerText).toContain(anchorMarker);
    expect(providerText).toContain(replacementMarker);
    expect(providerText).not.toContain(cancelledMarker);
  }, 120_000);
});

function providerMessageText(message: BaseMessage): string {
  return contentText(message.content);
}

function contentText(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    return content.map((item) => contentText(item)).join('\n');
  }
  if (typeof content === 'object' && content !== null) {
    return JSON.stringify(content);
  }
  return String(content);
}
