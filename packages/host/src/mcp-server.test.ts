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

  it('fences MCP sessions by run, never by session id alone', () => {
    const mcp = createHostMcpEndpoint({ secret, registry });
    const first = mcp.authorityKey(mcp.verify(mcp.mint({ runId: 'run-1', chatId: 'chat-1' }).token));
    const second = mcp.authorityKey(mcp.verify(mcp.mint({ runId: 'run-2', chatId: 'chat-1' }).token));
    const again = mcp.authorityKey(mcp.verify(mcp.mint({ runId: 'run-1', chatId: 'chat-1' }).token));

    expect(first).not.toBe(second);
    // Stable across mints: two capabilities for one run share one MCP session.
    expect(first).toBe(again);
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
    const client = await connectMcpOverFetch({
      url,
      headers: { authorization: `Bearer ${capability.token}` },
    });
    const result = await client.callTool('test_model', {});

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({ passed: 1, total: 1 });
    expect(invocations).toHaveLength(1);
    expect(invocations[0]?.toolName).toBe('test_model');
  }, 30_000);
});
