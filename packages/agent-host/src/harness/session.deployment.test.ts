/**
 * A transport whose billing layer follows the deployment answer (D1) is a root: only a run's `deployment.forRun`
 * transport makes calls. Handed straight to a session, it is refused `DEPLOYMENT_UNKNOWN` before anything is prepared
 * or fetched (I1), so no prepared row is left that no call will ever resolve.
 */
import { describe, expect, it, vi } from 'vitest';
import { createMemoryEventLog } from '#harness/harness.fixture.js';
import { createAgentSession } from '#harness/session.js';
import { createGatewayModelTransport } from '#transport/gateway-model-transport.js';
import type { ToolRegistry } from '#waist/ports.js';

const toolRegistry: ToolRegistry = { list: () => [], invoke: async () => ({ content: null, isError: false }) };

describe('a session given a root deployment-following transport', () => {
  it('refuses DEPLOYMENT_UNKNOWN before any prepared row or fetch', async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 500 }));
    const eventLog = await createMemoryEventLog();
    const session = await createAgentSession({
      chatId: 'chat-root',
      runId: 'run-root',
      leaderEpoch: 'epoch-root',
      systemPrompt: 'system',
      model: { id: 'fixture-model', contextWindow: 200_000, providerKind: 'vertexai' },
      modelTransport: createGatewayModelTransport({
        baseUrl: 'https://api.example/',
        fetch,
        billing: { deployment: async () => 'funded', principal: () => 'account-1' },
      }),
      toolRegistry,
      eventLog,
    });
    const outcome = await session.prompt({ id: 'u-1', role: 'user', content: 'Say hello.' });
    const events = await eventLog.read();
    await session.close();

    expect(outcome).toMatchObject({ outcome: 'failed', failure: { code: 'DEPLOYMENT_UNKNOWN' } });
    expect(fetch).not.toHaveBeenCalled();
    expect(events.filter((event) => event.type === 'model.invocation-prepared')).toEqual([]);
  });
});
