/**
 * The host-local MCP endpoint: what the capability grants, and what it refuses.
 *
 * The capability is the only thing standing between a vendor adapter's process
 * and this daemon's tools, so the fence is tested the way the API's is —
 * tamper, expiry, wrong run — plus one real Streamable-HTTP round trip proving
 * the mounted route dispatches into the daemon's own registry with no API in
 * the path.
 */

import { randomBytes } from 'node:crypto';

import { afterEach, describe, expect, it } from 'vitest';

import type { NodeAgentLauncher } from '@taucad/agent-host/node-launcher';
import type { HostToolInvocation, ToolRegistry } from '@taucad/agent-host';

import { startAgentServer } from '#agent-server.js';
import type { AgentServerHandle } from '#agent-server.js';
import { createHostMcpEndpoint, hostMcpCapabilityLifetime, HostMcpCapabilityError } from '#mcp-server.js';
import { connectMcpOverFetch } from '#acp/fixtures/mcp-fetch-client.js';

const token = 'agent-server-token-with-at-least-32-characters';
const secret = randomBytes(32).toString('base64url');

const stubLauncher = (): NodeAgentLauncher =>
  ({
    execute: async () => ({
      type: 'tail',
      chatId: 'chat-1',
      batch: { cursor: 0, nextCursor: 0, endCursor: 0, events: [] },
    }),
    events: () => ({ [Symbol.asyncIterator]: () => ({ next: async () => ({ done: true, value: undefined }) }) }),
    liveEvents: () => ({ [Symbol.asyncIterator]: () => ({ next: async () => ({ done: true, value: undefined }) }) }),
    pendingInterrupts: async () => [],
    host: undefined,
    close: async () => undefined,
  }) as unknown as NodeAgentLauncher;

const invocations: HostToolInvocation[] = [];
const registry: ToolRegistry = {
  list: () => [],
  invoke: async (invocation) => {
    invocations.push(invocation);
    return {
      content: {
        success: true,
        failures: [],
        passes: [{ id: 'r-1', requirement: 'is a cube', targetFile: 'main.scad' }],
        passed: 1,
        total: 1,
      },
      isError: false,
    };
  },
};

let server: AgentServerHandle | undefined;
let endpoint: ReturnType<typeof createHostMcpEndpoint> | undefined;

afterEach(async () => {
  invocations.length = 0;
  await server?.close();
  server = undefined;
  await endpoint?.close();
  endpoint = undefined;
});

describe('createHostMcpEndpoint capability', () => {
  it('verifies its own capability and refuses tampered, expired and foreign ones', () => {
    let clock = 1_000_000;
    const mcp = createHostMcpEndpoint({ secret, registry, now: () => clock });
    const capability = mcp.mint({ runId: 'run-1', chatId: 'chat-1' });

    const claims = mcp.verify(capability.token);
    expect(claims).toMatchObject({ v: 1, runId: 'run-1', chatId: 'chat-1' });
    expect(claims.sessionKey).toMatch(/^[\w-]+$/u);
    expect(claims.allowedTools).toEqual(['get_kernel_result', 'test_model', 'screenshot', 'export_geometry']);

    const [prefix, encoded, signature] = capability.token.split('.');
    const forgedClaims = Buffer.from(JSON.stringify({ ...claims, runId: 'run-2' }), 'utf8').toString('base64url');
    expect(() => mcp.verify(`${String(prefix)}.${forgedClaims}.${String(signature)}`)).toThrow(HostMcpCapabilityError);
    expect(() => mcp.verify(`${String(prefix)}.${String(encoded)}.${String(signature)}x`)).toThrow(
      HostMcpCapabilityError,
    );

    // Another daemon's secret never verifies here.
    const other = createHostMcpEndpoint({ secret: randomBytes(32).toString('base64url'), registry, now: () => clock });
    expect(() => mcp.verify(other.mint({ runId: 'run-1', chatId: 'chat-1' }).token)).toThrow(HostMcpCapabilityError);

    clock += hostMcpCapabilityLifetime + 1;
    expect(() => mcp.verify(capability.token)).toThrow(HostMcpCapabilityError);
  });

  it('fences MCP sessions by chat session, never by session id alone', () => {
    const mcp = createHostMcpEndpoint({ secret, registry });
    const session = mcp.mint({ runId: 'run-1', chatId: 'chat-1' });
    const key = mcp.authorityKey(mcp.verify(session.token));

    /* Stable for the life of the session: every turn of the chat presents the
     * same capability, because it is minted when the session is opened (V7). */
    expect(mcp.authorityKey(mcp.verify(session.token))).toBe(key);
    // A capability naming another chat — or another session — is a different authority.
    expect(mcp.authorityKey(mcp.verify(mcp.mint({ runId: 'run-9', chatId: 'chat-2' }).token))).not.toBe(key);
    expect(mcp.authorityKey(mcp.verify(mcp.mint({ runId: 'run-2', chatId: 'chat-1' }).token))).not.toBe(key);
  });

  /* The run is provenance, and provenance must not fence: one session answers
   * every turn of a chat, so a capability keyed to the run that opened it would
   * refuse the chat's second turn. */
  it('keeps serving a chat under the capability its session was opened with', () => {
    const mcp = createHostMcpEndpoint({ secret, registry });
    const opened = mcp.mint({ runId: 'run-1', chatId: 'chat-1' });

    const claims = mcp.verify(opened.token);

    expect(claims.runId).toBe('run-1');
    expect(mcp.authorityKey(claims)).toBe(mcp.authorityKey(mcp.verify(opened.token)));
  });
});

describe('the mounted /mcp route', () => {
  it('dispatches a tool call into the daemon registry and refuses an unauthorized one', async () => {
    endpoint = createHostMcpEndpoint({ secret, registry });
    server = startAgentServer({
      launcher: stubLauncher(),
      token,
      workspaceRoot: '/tmp/tau-mcp-test',
      mcp: endpoint,
    });
    await server.ready;
    const url = new URL('mcp', server.url()).href;

    const unauthorized = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
    });
    expect(unauthorized.status).toBe(401);

    const capability = endpoint.mint({ runId: 'run-1', chatId: 'chat-1' });
    const turn = new AbortController();
    const release = endpoint.activate({
      token: capability.token,
      runId: 'run-1',
      chatId: 'chat-1',
      signal: turn.signal,
    });
    const client = await connectMcpOverFetch({
      url,
      headers: { authorization: `Bearer ${capability.token}` },
    });
    const result = await client.callTool('test_model', {});

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({ passed: 1, total: 1 });
    expect(invocations).toHaveLength(1);
    expect(invocations[0]?.toolName).toBe('test_model');
    /* The run the capability was minted for rides the invocation, so a candidate
     * turn's Tau tools resolve that run's checkout rather than the live root. */
    expect(invocations[0]?.runId).toBe('run-1');
    turn.abort();
    expect(invocations[0]?.signal.aborted).toBe(true);
    release();

    const idle = await client.callTool('test_model', {});
    expect(idle.isError).toBe(true);
    expect(JSON.stringify(idle)).toContain('MCP_RUN_INACTIVE');
    expect(invocations).toHaveLength(1);
  }, 30_000);

  it('captures the active run for each call made through one long-lived MCP session', async () => {
    endpoint = createHostMcpEndpoint({ secret, registry });
    server = startAgentServer({
      launcher: stubLauncher(),
      token,
      workspaceRoot: '/tmp/tau-mcp-test',
      mcp: endpoint,
    });
    await server.ready;
    const capability = endpoint.mint({ runId: 'run-opened', chatId: 'chat-1' });
    const client = await connectMcpOverFetch({
      url: new URL('mcp', server.url()).href,
      headers: { authorization: `Bearer ${capability.token}` },
    });

    for (const runId of ['run-1', 'run-2']) {
      const release = endpoint.activate({
        token: capability.token,
        runId,
        chatId: 'chat-1',
        signal: new AbortController().signal,
      });
      // oxlint-disable-next-line no-await-in-loop -- the release between calls is the contract under test.
      await client.callTool('test_model', {});
      release();
    }

    expect(invocations.map((invocation) => invocation.runId)).toEqual(['run-1', 'run-2']);
  }, 30_000);

  it('refuses a capability minted for another chat on this session', async () => {
    endpoint = createHostMcpEndpoint({ secret, registry });
    server = startAgentServer({
      launcher: stubLauncher(),
      token,
      workspaceRoot: '/tmp/tau-mcp-test',
      mcp: endpoint,
    });
    await server.ready;
    const url = new URL('mcp', server.url()).href;
    const post = async (bearer: string, body: unknown, session: string): Promise<Response> =>
      fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
          authorization: `Bearer ${bearer}`,
          ...(session === '' ? {} : { 'mcp-session-id': session }),
        },
        body: JSON.stringify(body),
      });

    const mine = endpoint.mint({ runId: 'run-1', chatId: 'chat-1' });
    const initialized = await post(
      mine.token,
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } },
      },
      '',
    );
    const mcpSessionId = initialized.headers.get('mcp-session-id') ?? '';
    expect(mcpSessionId).not.toBe('');

    /* A well-formed capability this daemon really did mint — for a different
     * chat. It verifies, and it is still refused on this session (V7). */
    const foreign = endpoint.mint({ runId: 'run-2', chatId: 'chat-2' });
    const refused = await post(
      foreign.token,
      { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'test_model', arguments: {} } },
      mcpSessionId,
    );

    expect(refused.status).toBe(403);
    expect(await refused.text()).toContain('authority mismatch');
    expect(invocations).toHaveLength(0);
  }, 30_000);
});
