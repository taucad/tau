// @vitest-environment node
/* oxlint-disable tau-lint/no-time-unit-suffix -- Public @getpaseo/client option names use millisecond suffixes. */
/**
 * The Paseo runner against a real SDK client and a real E2EE session.
 *
 * This is the fixture's own proof: `createPaseoClient` performs the genuine
 * relay handshake and ECDH negotiation against `startPaseoFakeDaemon`, and the
 * runner drives it through admission, prompt delivery, projection and the
 * terminal lifecycle. Nothing here is stubbed above the socket — if the fake
 * stopped satisfying the SDK, this fails rather than the browser leg.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { createPaseoClient } from '@getpaseo/client';
import type { PaseoClient } from '@getpaseo/client';
import { buildRelayWebSocketUrl } from '@getpaseo/protocol/daemon-endpoints';
import { startPaseoFakeDaemon } from '../../../../ui-e2e/src/support/paseo-fake-daemon.js';
import type { PaseoFakeDaemon } from '../../../../ui-e2e/src/support/paseo-fake-daemon.js';
import { createPaseoRunnerPort } from '#lib/paseo/paseo-runner.js';
import type { ExternalAgentLogEvent, ExternalAgentTurn, JsonObject } from '@taucad/agent-host';

let daemon: PaseoFakeDaemon | undefined;
let client: PaseoClient | undefined;

afterEach(async () => {
  await client?.close();
  await daemon?.close();
  client = undefined;
  daemon = undefined;
});

const connect = async (fake: PaseoFakeDaemon): Promise<PaseoClient> => {
  const paseo = createPaseoClient({
    url: buildRelayWebSocketUrl({
      endpoint: fake.endpoint,
      useTls: false,
      serverId: fake.serverId,
      role: 'client',
      version: '2',
    }),
    clientId: 'tau-web-test',
    appVersion: 'tau-web',
    e2ee: { enabled: true, daemonPublicKeyB64: fake.daemonPublicKeyB64 },
    reconnect: { enabled: false },
    connectTimeoutMs: 15_000,
    logger: { debug: () => undefined, info: () => undefined, warn: () => undefined, error: () => undefined },
  });
  await paseo.connect();
  return paseo;
};

const runTurn = async (fake: PaseoFakeDaemon, options: { readonly mcp?: Record<string, unknown> } = {}) => {
  client = await connect(fake);
  const appended: ExternalAgentLogEvent[] = [];
  let state: JsonObject = {};
  let ids = 0;
  const port = createPaseoRunnerPort({
    clientFor: async () => client!,
    createId: () => `id-${++ids}`,
    ...(options.mcp ? { mcpServersFor: () => options.mcp as never } : {}),
  });
  const turn: ExternalAgentTurn = {
    agentId: 'fake-claude',
    agent: { kind: 'paseo', id: 'fake-claude', connectionId: 'connection-1' },
    chatId: 'chat-1',
    runId: 'run-1',
    message: { id: 'msg-1', role: 'user', content: [{ type: 'text', text: 'make a bracket' }] },
    history: [],
    append: async (events) => {
      appended.push(...events);
    },
    remember: async (next) => {
      state = { ...state, ...next };
    },
    approve: async () => 'approved',
    signal: new AbortController().signal,
  };
  await port.run(turn);
  return { appended, state };
};

describe('the Paseo runner over a real E2EE session', () => {
  it('creates a run-scoped agent, delivers the prompt once, and projects the turn', async () => {
    daemon = await startPaseoFakeDaemon({
      turn: {
        items: [
          { type: 'assistant_message', text: 'Building it now.' },
          {
            type: 'tool_call',
            callId: 'call-1',
            name: 'write',
            status: 'completed',
            error: null,
            detail: { type: 'write', filePath: 'bracket.scad', content: 'cube(10);' },
          },
        ],
      },
    });

    const { appended, state } = await runTurn(daemon);

    // The turn projected: assistant text, then the tool call's input/output pair.
    expect(appended.map((event) => (event as { message: { role: string } }).message.role)).toEqual([
      'assistant',
      'tool-input',
      'tool-output',
    ]);
    for (const event of appended) {
      expect((event as { message: { metadata: { tauInternal: unknown } } }).message.metadata.tauInternal).toMatchObject(
        { kind: 'external-tool', origin: 'external' },
      );
    }
    // A run-scoped agent, never the template the user selected.
    expect(state['paseoAgentId']).toMatch(/^run-agent-/u);
    expect(state['paseoSendState']).toBe('sent');
    expect(state['paseoCursorEpoch']).toBe('epoch-1');
    // Exactly one prompt reached the daemon.
    expect(daemon.received().filter(({ type }) => type === 'send_agent_message_request')).toHaveLength(1);
    // The template was labelled with the run so a crashed retry can recover it.
    expect(daemon.received().some(({ type }) => type === 'create_agent_request')).toBe(true);
  }, 60_000);

  it('offers the daemon-minted Tau MCP endpoint to the agent it creates', async () => {
    daemon = await startPaseoFakeDaemon({ turn: { items: [{ type: 'assistant_message', text: 'ok' }] } });

    await runTurn(daemon, {
      mcp: { tau: { type: 'http', url: 'http://127.0.0.1:9/mcp', headers: { Authorization: 'Bearer cap' } } },
    });

    /* The capability rides the agent this run creates — not a later call, and
     * never the template the user picked. */
    const create = daemon.createRequests().at(-1);
    expect(create?.config?.mcpServers?.['tau']).toMatchObject({
      type: 'http',
      url: 'http://127.0.0.1:9/mcp',
      headers: { Authorization: 'Bearer cap' },
    });
  }, 60_000);

  it('raises a permission through the durable inbox and resumes on approval', async () => {
    daemon = await startPaseoFakeDaemon({
      turn: {
        permission: { id: 'perm-1', name: 'write', title: 'write bracket.scad' },
        items: [{ type: 'assistant_message', text: 'Approved, writing.' }],
      },
    });

    const { appended } = await runTurn(daemon);

    expect(appended.map((event) => (event as { message: { role: string } }).message.role)).toEqual(['assistant']);
    expect(daemon.received().some(({ type }) => type === 'agent_permission_response')).toBe(true);
  }, 60_000);
});
