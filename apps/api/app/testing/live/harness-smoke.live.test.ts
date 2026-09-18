import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createNodeEventLog } from '@taucad/agent-host/node';
import type { ProviderMessage } from '@taucad/agent-host';
import {
  createLiveSession,
  createLiveToolRegistry,
  hasLiveCredential,
  liveCredentialName,
  liveSessionModel,
  runWithRateLimitRetry,
  startLiveGateway,
} from '#testing/live/live-gateway.harness.js';
import type { LiveGateway } from '#testing/live/live-gateway.harness.js';

const modelId = 'google-gemini-3.7-flash';

const textOf = (message: ProviderMessage): string =>
  typeof message.content === 'string'
    ? message.content
    : Array.isArray(message.content)
      ? message.content
          .flatMap((block) =>
            block !== null && typeof block === 'object' && !Array.isArray(block) && typeof block['text'] === 'string'
              ? [block['text']]
              : [],
          )
          .join('')
      : '';

describe.skipIf(!hasLiveCredential(modelId))(
  `live gateway harness (set ${liveCredentialName(modelId)} in apps/api/.env to run)`,
  () => {
    let gateway: LiveGateway;
    let root: string;

    beforeAll(async () => {
      gateway = await startLiveGateway();
      root = await mkdtemp(join(tmpdir(), 'tau-api-live-'));
    });

    afterAll(async () => {
      await gateway.close();
      await rm(root, { recursive: true, force: true });
    });

    it('should complete a text turn on Vertex with assistant text and usage', async () => {
      const nonce = `tau-live-${Date.now().toString(36)}`;
      // A minimal text turn, so this smoke proves the harness itself. The full
      // toolbelt against every provider is the live provider matrix's job.
      const toolRegistry = createLiveToolRegistry({});
      const snapshot = await runWithRateLimitRetry(async () => {
        const session = await createLiveSession({
          gateway,
          chatId: nonce,
          runId: `${nonce}-run-1`,
          leaderEpoch: `${nonce}-epoch-1`,
          systemPrompt: 'Answer in one short sentence. Do not call a tool.',
          model: liveSessionModel(modelId),
          toolRegistry,
          eventLog: await createNodeEventLog({ filePath: join(root, nonce, 'events.jsonl') }),
        });
        try {
          await session.prompt({
            id: `${nonce}-user-1`,
            role: 'user',
            content: `Reply with the word ${nonce} and nothing else.`,
          });
          return await session.snapshot();
        } finally {
          await session.close();
        }
      });

      expect(snapshot.state, JSON.stringify(snapshot.failure ?? snapshot.messages.slice(-2))).toBe('completed');
      const assistant = snapshot.messages.findLast((message) => message.role === 'assistant');
      if (!assistant) {
        expect.fail('the turn produced no assistant message');
      }
      expect(textOf(assistant)).toContain(nonce);
      const { usage } = assistant.metadata ?? {};
      expect(usage?.input).toBeGreaterThan(0);
      expect(usage?.output).toBeGreaterThan(0);
    });

    it('should list the production CAD toolbelt from the real tool registry', () => {
      const names = createLiveToolRegistry({})
        .list()
        .map((tool) => tool.name);
      expect(names).toContain('edit_file');
      expect(names).toContain('get_kernel_result');
    });
  },
);
