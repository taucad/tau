import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { requestedMaxTokens } from '@taucad/agent-host';
import type { AgentSession } from '@taucad/agent-host';
import { createNodeEventLog } from '@taucad/agent-host/node';
import { isModelListEntryEnabled, modelList } from '#api/models/model.constants.js';
import {
  createLiveSession,
  createLiveToolRegistry,
  liveCompletionCeiling,
  liveSessionModel,
} from '#testing/live/live-gateway.harness.js';

/**
 * Hermetic guard on what the live suites ask the provider for.
 *
 * The live tier is only evidence about production if it sends production's own
 * numbers. A test-only ceiling below what a real turn carries under-tests the
 * path and, on a reasoning row, can end a turn on `length` with the budget spent
 * on thinking and no answer — which is why the number now comes from the host's
 * own `requestedMaxTokens` instead of a literal in each suite.
 */
describe('live completion ceiling', () => {
  const enabledRows = Object.values(modelList)
    .flatMap((provider) => Object.values(provider))
    .filter((row) => isModelListEntryEnabled(row));

  it('should ask for what a production turn asks for on every enabled catalog row', () => {
    expect(enabledRows.length).toBeGreaterThan(0);
    for (const row of enabledRows) {
      expect(liveCompletionCeiling(row.id), row.id).toBe(requestedMaxTokens(row.details.maxTokens, undefined));
    }
  });

  it('should carry the route ceiling into the session model rather than a cheaper test value', () => {
    for (const row of enabledRows) {
      expect(liveSessionModel(row.id).maxTokens, row.id).toBe(row.details.maxTokens);
      expect(liveCompletionCeiling(row.id), row.id).toBeLessThanOrEqual(row.details.maxTokens);
    }
  });
});

/**
 * Hermetic guard on the words a live prompt uses.
 *
 * Grok 4.7 refuses "reply with the exact token …" as a jailbreak and completes
 * the run with no tool call, so a suite worded that way measures the model's
 * safety policy instead of Tau's wire
 * (docs/research/grok-4-7-live-suite-refusal-blueprint.md). The stand-in
 * gateway counts what reaches it and refuses all of it, so a prompt that gets
 * through ends its run at once without a provider.
 */
describe('live prompt vocabulary', () => {
  /** Verbatim: the sequential-tools prompt Grok 4.7 refused in 5 of 10 full-path runs. */
  const refusedPrompt =
    'Call read_file on alpha.ts. Its contents name a second file; call read_file on that second file too, then reply with the exact token the second file contains and nothing else.';
  const markerPrompt =
    'Call read_file on alpha.ts. Its contents name a second file; call read_file on that second file too, then reply with the exact marker the second file exports and nothing else.';

  let gatewayRequests = 0;
  let gateway: Server | undefined;
  let baseUrl = '';
  let root = '';

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'tau-api-live-vocabulary-'));
    const server = createServer((request, response) => {
      gatewayRequests++;
      request.resume();
      response.writeHead(400, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ code: 'UPSTREAM_REJECTED', message: 'Hermetic gateway.' }));
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    gateway = server;
    baseUrl = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
  });

  afterAll(async () => {
    if (gateway) {
      gateway.closeAllConnections();
      gateway.close();
      await once(gateway, 'close');
    }
    await rm(root, { recursive: true, force: true });
  });

  const openSession = async (chatId: string): Promise<AgentSession> =>
    createLiveSession({
      gateway: { baseUrl, bearer: 'hermetic', close: async () => undefined },
      chatId,
      runId: `${chatId}-run-1`,
      leaderEpoch: `${chatId}-epoch-1`,
      systemPrompt: 'Hermetic live prompt vocabulary check.',
      model: liveSessionModel('xai-grok-4.7'),
      toolRegistry: createLiveToolRegistry({}),
      eventLog: await createNodeEventLog({ filePath: join(root, chatId, 'events.jsonl') }),
    });

  it('should refuse a prompt that asks for a token before it reaches the gateway', async () => {
    const before = gatewayRequests;
    const session = await openSession('token-prompt');
    try {
      await expect(session.prompt({ id: 'token-prompt-user-1', role: 'user', content: refusedPrompt })).rejects.toThrow(
        'grok-4-7-live-suite-refusal-blueprint',
      );
    } finally {
      await session.close();
    }
    expect(gatewayRequests - before).toBe(0);
  });

  it('should send a prompt that asks for a marker', async () => {
    const before = gatewayRequests;
    const session = await openSession('marker-prompt');
    try {
      await session.prompt({ id: 'marker-prompt-user-1', role: 'user', content: markerPrompt });
    } finally {
      await session.close();
    }
    expect(gatewayRequests - before).toBe(1);
  });
});
