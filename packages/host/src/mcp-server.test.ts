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
import { once } from 'node:events';
import { mkdtempSync } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
import { createServer, request } from 'node:http';
import type { IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { screenshotMcpOutputSchema } from '@taucad/chat/schemas/tools/screenshot';
import { testModelOutputSchema } from '@taucad/chat/schemas/tools/test-model';

import type { AgentLauncher } from '@taucad/agent-host/launcher';
import type { HostToolDefinition, HostToolInvocation, HostToolResult, ToolRegistry } from '@taucad/agent-host';
import {
  createChatToolRegistry,
  createMachineToolRegistry,
  createProviderRpcFileSystem,
} from '@taucad/agent-tools/registry';
import { MemoryProvider } from '@taucad/filesystem/backend';
import { ResourceQueue } from '@taucad/filesystem';
import { composeView } from '@taucad/filesystem/composed-view';
import { tauPathPolicy } from '@taucad/filesystem/path-registry';
import type { RpcGraphicsClient } from '@taucad/chat/rpc';
import { exportModelOutputSchema } from '@taucad/chat/schemas/tools/export-model';
import { parseToolErrorText } from '@taucad/chat/utils';
import type { BambuStudioEngine, MachinePrintPlanner } from '@taucad/agent-tools/registry';
import {
  defineMachineAction,
  machineActionDescriptorOf,
  standardMachineAction,
  standardMachineActions,
} from '@taucad/runtime/machine';
import type { MachineArtifactReference, MachineClient, MachineDirectoryEntry } from '@taucad/runtime/machine';

import { startAgentServer } from '#agent-server.js';
import type { AgentServerHandle } from '#agent-server.js';
import {
  createHostMcpEndpoint,
  hostMcpCapabilityLifetime,
  HostMcpCapabilityError,
  hostMcpLeaseCeiling,
} from '#mcp-server.js';
import { connectMcpOverFetch } from '#acp/fixtures/mcp-fetch-client.js';

const token = 'agent-server-token-with-at-least-32-characters';
const secret = randomBytes(32).toString('base64url');
const workspaceRoot = mkdtempSync(join(tmpdir(), 'tau-mcp-test-'));

afterAll(async () => rm(workspaceRoot, { recursive: true, force: true }));

const jsonRpcReplySchema = z.object({
  id: z.number(),
  result: z.unknown().optional(),
  error: z.object({ code: z.number(), message: z.string() }).optional(),
});
const toolsListSchema = z.object({
  tools: z.array(
    z.object({
      name: z.string(),
      inputSchema: z.record(z.string(), z.unknown()),
      annotations: z.object({
        readOnlyHint: z.boolean(),
        destructiveHint: z.boolean(),
        idempotentHint: z.boolean(),
        openWorldHint: z.boolean(),
      }),
    }),
  ),
});
/** Bambu Studio functions a test that never reaches them passes. */
const unusedBambuStudio: BambuStudioEngine = {
  findBambuStudio: async () => {
    throw new Error('not used');
  },
  loadBambuStudioCatalog: async () => {
    throw new Error('not used');
  },
  describeBambuStudioSettings: async () => {
    throw new Error('not used');
  },
};
const toolResultSchema = z.object({ isError: z.boolean().optional(), structuredContent: z.unknown().optional() });

/**
 * One raw Streamable-HTTP MCP session: `initialize`, then any request by method.
 *
 * `connectMcpOverFetch` only calls tools; listing them needs the session id it keeps.
 *
 * @param url - The mounted `/mcp` route.
 * @param authorization - The capability's `Authorization` header.
 * @returns The `initialize` reply and a requester bound to its session.
 */
const openMcpSession = async (url: string, authorization: string) => {
  let nextId = 0;
  let sessionId: string | undefined;
  const post = async (body: Readonly<Record<string, unknown>>): Promise<Response> =>
    fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        authorization,
        ...(sessionId === undefined ? {} : { 'mcp-session-id': sessionId }),
      },
      body: JSON.stringify({ jsonrpc: '2.0', ...body }),
    });
  const request = async (method: string, params: Readonly<Record<string, unknown>>) => {
    nextId += 1;
    const response = await post({ id: nextId, method, params });
    sessionId ??= response.headers.get('mcp-session-id') ?? undefined;
    const body = await response.text();
    expect(response.status, body).toBe(200);
    const frame = body.split('\n').find((line) => line.startsWith('data:'));
    return jsonRpcReplySchema.parse(JSON.parse(frame === undefined ? body : frame.slice('data:'.length)));
  };
  const initialized = await request('initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'tau-host-mcp-test', version: '0.0.0' },
  });
  await post({ method: 'notifications/initialized' });
  return { initialized, request };
};

const stubLauncher = (): AgentLauncher =>
  ({
    execute: async () => ({ commandId: 'cmd-1', generation: 0, status: 'applied', effect: 'not-applied', details: {} }),
    read: async () => ({ status: 'batch', chatId: 'chat-1', cursor: 0, nextCursor: 0, endCursor: 0, events: [] }),
    liveEvents: () => ({ [Symbol.asyncIterator]: () => ({ next: async () => ({ done: true, value: undefined }) }) }),
    pendingInterrupts: async () => [],
    host: undefined,
    close: async () => undefined,
  }) as unknown as AgentLauncher;

const invocations: HostToolInvocation[] = [];
const registry: ToolRegistry = {
  list: () => [],
  invoke: async (invocation): ReturnType<ToolRegistry['invoke']> => {
    invocations.push(invocation);
    if (invocation.toolName === 'screenshot') {
      return {
        content: { success: true, images: [{ view: 'isometric', dataUrl: 'data:image/webp;base64,QUJD' }] },
        isError: false,
      };
    }
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
  it.each([
    { name: 'evaluate_model', input: { targetFile: 'main.scad' } },
    { name: 'test_model', input: {} },
    { name: 'screenshot', input: { targetFile: 'main.scad', mode: 'single' } },
    { name: 'export_model', input: { targetFile: 'main.scad', to: 'glb' } },
  ])('does not release admitted $name work until it settles', async ({ name, input }) => {
    const entered = Promise.withResolvers<void>();
    const unblock = Promise.withResolvers<void>();
    const order: string[] = [];
    endpoint = createHostMcpEndpoint({
      secret,
      workspaceRoot,
      registry: {
        list: () => [],
        invoke: async (input) => {
          entered.resolve();
          await unblock.promise;
          order.push('work');
          return registry.invoke(input);
        },
      },
    });
    server = startAgentServer({ launcher: stubLauncher(), token, workspaceRoot, mcp: endpoint });
    await server.ready;
    const capability = endpoint.mint({ runId: 'candidate', chatId: 'chat-1' });
    const release = endpoint.activate({
      token: capability.token,
      runId: 'candidate',
      chatId: 'chat-1',
      signal: new AbortController().signal,
    });
    const client = await connectMcpOverFetch({
      url: new URL('mcp', server.url()).href,
      headers: { authorization: `Bearer ${capability.token}` },
    });
    const call = client.callTool(name, input);
    await entered.promise;
    const releasing = (async () => {
      // oxlint-disable-next-line no-await-in-loop -- a turn must settle before the next binding.
      await release();
      order.push('release');
    })();
    try {
      expect(release()).toBeInstanceOf(Promise);
      expect(() =>
        endpoint!.activate({
          token: capability.token,
          runId: 'candidate',
          chatId: 'chat-1',
          signal: new AbortController().signal,
        }),
      ).toThrow();
      expect(order).toEqual([]);
    } finally {
      unblock.resolve();
      await call;
      await releasing;
    }
    expect(order).toEqual(['work', 'release']);
  });

  it('verifies its own capability and refuses tampered, expired and foreign ones', () => {
    let clock = 1_000_000;
    const mcp = createHostMcpEndpoint({ secret, workspaceRoot, registry, now: () => clock });
    const capability = mcp.mint({ runId: 'run-1', chatId: 'chat-1' });

    const claims = mcp.verify(capability.token);
    expect(claims).toMatchObject({ v: 1, runId: 'run-1', chatId: 'chat-1' });
    expect(claims.sessionKey).toMatch(/^[\w-]+$/u);
    expect(claims.allowedTools).toEqual([
      'evaluate_model',
      'test_model',
      'screenshot',
      'export_model',
      'arrange_workbench',
      'list_machines',
      'get_machine',
      'machine_action',
      'stop_machine',
      'get_print_profiles',
      'request_job',
      'check_job',
      'ask_questions',
    ]);
    expect(claims.allowedTools).not.toContain('start_machine_print');

    const [prefix, encoded, signature] = capability.token.split('.');
    const forgedClaims = Buffer.from(JSON.stringify({ ...claims, runId: 'run-2' }), 'utf8').toString('base64url');
    expect(() => mcp.verify(`${String(prefix)}.${forgedClaims}.${String(signature)}`)).toThrow(HostMcpCapabilityError);
    expect(() => mcp.verify(`${String(prefix)}.${String(encoded)}.${String(signature)}x`)).toThrow(
      HostMcpCapabilityError,
    );

    // Another daemon's secret never verifies here.
    const other = createHostMcpEndpoint({
      secret: randomBytes(32).toString('base64url'),
      workspaceRoot,
      registry,
      now: () => clock,
    });
    expect(() => mcp.verify(other.mint({ runId: 'run-1', chatId: 'chat-1' }).token)).toThrow(HostMcpCapabilityError);

    clock += hostMcpCapabilityLifetime + 1;
    expect(() => mcp.verify(capability.token)).toThrow(HostMcpCapabilityError);
  });

  it('fences MCP sessions by chat session, never by session id alone', () => {
    const mcp = createHostMcpEndpoint({ secret, workspaceRoot, registry });
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
    const mcp = createHostMcpEndpoint({ secret, workspaceRoot, registry });
    const opened = mcp.mint({ runId: 'run-1', chatId: 'chat-1' });

    const claims = mcp.verify(opened.token);

    expect(claims.runId).toBe('run-1');
    expect(mcp.authorityKey(claims)).toBe(mcp.authorityKey(mcp.verify(opened.token)));
  });
});

describe('the mounted /mcp route', () => {
  it('should export through the real registry without mixing RPC metadata into tool input', async () => {
    const provider = new MemoryProvider();
    const fileSystem = createProviderRpcFileSystem({
      provider: composeView({ filesystem: provider }, { consumer: 'user', policy: tauPathPolicy }),
      mutations: new ResourceQueue(),
    });
    const exportModel = vi.fn<RpcGraphicsClient['exportModel']>(async () => ({
      success: true,
      exportId: 'netlist',
      files: [{ name: 'netlist.json', mimeType: 'application/json', bytes: new TextEncoder().encode('{}') }],
    }));
    const realRegistry = createChatToolRegistry({
      fileSystemFor: () => fileSystem,
      graphics: { exportModel },
      testingEnabled: false,
    });
    endpoint = createHostMcpEndpoint({
      secret,
      workspaceRoot,
      registry: {
        list: () => realRegistry.list(),
        invoke: async (invocation) => {
          invocations.push(invocation);
          return realRegistry.invoke(invocation);
        },
      },
    });
    server = startAgentServer({ launcher: stubLauncher(), token, workspaceRoot, mcp: endpoint });
    await server.ready;
    const capability = endpoint.mint({ runId: 'run-1', chatId: 'chat-1' });
    const release = endpoint.activate({
      token: capability.token,
      runId: 'run-1',
      chatId: 'chat-1',
      signal: new AbortController().signal,
    });
    try {
      const client = await connectMcpOverFetch({
        url: new URL('mcp', server.url()).href,
        headers: { authorization: `Bearer ${capability.token}` },
      });
      const input = { targetFile: 'main.tsx', to: 'netlist' };
      const result = await client.callTool('export_model', input);
      expect(result.isError, JSON.stringify(result)).not.toBe(true);
      const output = exportModelOutputSchema.parse(result.structuredContent);
      expect(invocations).toHaveLength(1);
      const invocation = invocations[0]!;
      expect(invocation.input).toEqual(input);
      expect(invocation.toolCallId).not.toBe('');
      expect(exportModel).toHaveBeenCalledExactlyOnceWith(input, { signal: invocation.signal });
      expect(output.files[0]?.artifactPath).toBe(
        `.tau/artifacts/${invocation.toolCallId}__main.tsx-netlist/netlist.json`,
      );
      expect(await fileSystem.readFile(output.files[0]!.artifactPath)).toBe('{}');
    } finally {
      await release();
    }
  });

  it('should preserve registry validation details through MCP error presentation', async () => {
    const error = {
      errorCode: 'TOOL_INPUT_VALIDATION_FAILED',
      message: 'Invalid profile selection',
      toolName: 'get_print_profiles',
      toolCallId: 'call-profile',
      validationErrors: [{ path: 'keys', message: 'Too many keys' }],
    };
    endpoint = createHostMcpEndpoint({
      secret,
      workspaceRoot,
      registry: {
        list: () => [{ name: 'get_print_profiles', description: 'Profiles', inputSchema: { type: 'object' } }],
        invoke: async () => ({ content: error, isError: true }),
      },
    });
    server = startAgentServer({ launcher: stubLauncher(), token, workspaceRoot, mcp: endpoint });
    await server.ready;
    const capability = endpoint.mint({ runId: 'run-1', chatId: 'chat-1' });
    const release = endpoint.activate({
      token: capability.token,
      runId: 'run-1',
      chatId: 'chat-1',
      signal: new AbortController().signal,
    });
    try {
      const client = await connectMcpOverFetch({
        url: new URL('mcp', server.url()).href,
        headers: { authorization: `Bearer ${capability.token}` },
      });
      const result = await client.callTool('get_print_profiles', {});
      expect(result.isError).toBe(true);
      expect(parseToolErrorText(JSON.stringify(result.structuredContent))).toEqual(error);
    } finally {
      await release();
    }
  });

  it('never attributes a request admitted under one run to the next run', async () => {
    const runIds: string[] = [];
    endpoint = createHostMcpEndpoint({
      secret,
      workspaceRoot,
      registry: {
        list: () => [],
        invoke: async (invocation) => {
          expect(invocation.runId).toBeDefined();
          if (invocation.runId === undefined) {
            throw new Error('missing run id');
          }
          runIds.push(invocation.runId);
          return { content: { success: true, status: 'ready' }, isError: false };
        },
      },
    });
    const rawServer = createServer((incoming, response) => {
      void endpoint?.handle(incoming, response);
    });
    rawServer.listen(0, '127.0.0.1');
    await once(rawServer, 'listening');
    const address = rawServer.address() as AddressInfo;
    const url = `http://127.0.0.1:${String(address.port)}/mcp`;
    const capability = endpoint.mint({ chatId: 'chat-1', runId: 'run-1' });
    const headers = {
      authorization: `Bearer ${capability.token}`,
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
    };
    try {
      const initialized = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 0,
          method: 'initialize',
          params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } },
        }),
      });
      const mcpSessionId = initialized.headers.get('mcp-session-id');
      await initialized.text();
      expect(mcpSessionId).toBeTypeOf('string');

      const releaseFirst = endpoint.activate({
        token: capability.token,
        runId: 'run-1',
        chatId: 'chat-1',
        signal: new AbortController().signal,
      });
      const admitted = once(rawServer, 'request');
      const slow = request(url, { method: 'POST', headers: { ...headers, 'mcp-session-id': mcpSessionId ?? '' } });
      const response = new Promise<IncomingMessage>((resolve) => {
        slow.once('response', resolve);
      });
      slow.write(' ');
      await admitted;
      await releaseFirst();
      const releaseSecond = endpoint.activate({
        token: capability.token,
        runId: 'run-2',
        chatId: 'chat-1',
        signal: new AbortController().signal,
      });
      slow.end(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: { name: 'evaluate_model', arguments: { targetFile: 'main.ts' } },
        }),
      );
      const reply = await response;
      reply.resume();
      await once(reply, 'end');
      await releaseSecond();

      expect(runIds).not.toContain('run-2');
    } finally {
      rawServer.closeAllConnections();
      await new Promise<void>((resolve, reject) => {
        rawServer.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }
  }, 30_000);

  it('dispatches a tool call into the daemon registry and refuses an unauthorized one', async () => {
    endpoint = createHostMcpEndpoint({ secret, workspaceRoot, registry });
    server = startAgentServer({
      launcher: stubLauncher(),
      token,
      workspaceRoot,
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
    await release();

    const idle = await client.callTool('test_model', {});
    expect(idle.isError).toBe(true);
    expect(JSON.stringify(idle)).toContain('MCP_RUN_INACTIVE');
    expect(invocations).toHaveLength(1);
  }, 30_000);

  it.each([false, true])(
    'keeps six screenshots and an oversized GeoSpec report readable outside MCP payloads (record artifact: %s)',
    async (alreadyRetained) => {
      const views = ['front', 'back', 'right', 'left', 'top', 'bottom'];
      const recordArtifact = {
        path: '.tau/artifacts/call__geospec-json/result.json',
        mimeType: 'application/json',
        byteLength: 200_000,
        sha256: 'a'.repeat(64),
      };
      endpoint = createHostMcpEndpoint({
        secret,
        workspaceRoot,
        registry: {
          list: () => [],
          invoke: async (invocation): ReturnType<ToolRegistry['invoke']> => {
            if (invocation.toolName === 'screenshot') {
              return {
                isError: false,
                content: {
                  success: true,
                  images: views.map((view) => ({ view, dataUrl: 'data:image/webp;base64,QUJD' })),
                  sourceRevision: { entry: 'main.cs', files: { 'main.cs': `sha256:${'a'.repeat(64)}` } },
                  message: 'Section cutaways narrower than 180° are not shown in captures.',
                },
              };
            }
            return {
              isError: false,
              content: {
                success: true,
                passed: 0,
                total: 1,
                runStatus: 'failed',
                lineageStatus: 'unavailable',
                tests: [{ id: 'main.cs:0', requirement: 'Mesh is sound', targetFile: 'main.cs', status: 'failed' }],
                ...(alreadyRetained ? { fullResult: recordArtifact } : {}),
                passes: [],
                failures: [
                  {
                    id: 'large-1',
                    requirement: 'Mesh is sound',
                    reason: 'Failed',
                    suggestion: 'Inspect details',
                    targetFile: 'main.cs',
                    diagnostics: [
                      {
                        code: 'GEOMETRY',
                        severity: 'error',
                        message: 'Large mesh',
                        details: { vertices: 'x'.repeat(150_000) },
                      },
                    ],
                  },
                ],
              },
            };
          },
        },
      });
      server = startAgentServer({ launcher: stubLauncher(), token, workspaceRoot, mcp: endpoint });
      await server.ready;
      const capability = endpoint.mint({ runId: 'run-capture', chatId: 'chat-capture' });
      const release = endpoint.activate({
        token: capability.token,
        runId: 'run-capture',
        chatId: 'chat-capture',
        signal: new AbortController().signal,
      });
      const client = await connectMcpOverFetch({
        url: new URL('mcp', server.url()).href,
        headers: { authorization: `Bearer ${capability.token}` },
      });
      try {
        const capture = await client.callTool('screenshot', { targetFile: 'main.cs', mode: 'multi_angle' });
        const manifest = screenshotMcpOutputSchema.parse(capture.structuredContent);
        const { images } = manifest;
        expect(images.map((image) => image.view)).toEqual(views);
        expect(manifest.sourceRevision?.entry).toBe('main.cs');
        expect(manifest.message).toBe('Section cutaways narrower than 180° are not shown in captures.');
        expect(JSON.stringify(capture)).not.toContain('QUJD');
        expect(Buffer.byteLength(JSON.stringify(capture), 'utf8')).toBeLessThan(128 * 1024);
        for (const image of images) {
          // oxlint-disable-next-line no-await-in-loop -- each named view must remain retrievable.
          await expect(readFile(image.absolutePath)).resolves.toEqual(Buffer.from('ABC'));
        }
        const tests = await client.callTool('test_model', {});
        const summary = testModelOutputSchema.parse(tests.structuredContent);
        expect(summary).toMatchObject({ passed: 0, total: 1, omittedPasses: 0, omittedFailures: 0 });
        expect(summary).toMatchObject({
          runStatus: 'failed',
          lineageStatus: 'unavailable',
          omittedTests: 1,
          omittedLineage: 0,
        });
        expect(summary.failures[0]?.id).toBe('large-1');
        expect(JSON.stringify(tests).length).toBeLessThan(128 * 1024);
        expect(summary.fullResult).toBeDefined();
        if (alreadyRetained) {
          expect(summary.fullResult).toStrictEqual(recordArtifact);
          return;
        }
        const fullPath = summary.fullResult?.absolutePath;
        if (fullPath === undefined) {
          throw new Error('Expected the host-created attachment path');
        }
        const full = JSON.parse(await readFile(fullPath, 'utf8')) as unknown;
        expect(testModelOutputSchema.parse(full).failures[0]?.diagnostics?.[0]?.details).toEqual({
          vertices: 'x'.repeat(150_000),
        });
      } finally {
        await release();
      }
    },
    30_000,
  );

  it('codes a fault Tau hits after the tool answered, so the agent does not retry its own call', async () => {
    endpoint = createHostMcpEndpoint({
      secret,
      workspaceRoot,
      registry: {
        list: () => [],
        invoke: async (): ReturnType<ToolRegistry['invoke']> => ({
          isError: false,
          // A capture Tau cannot save: the renderer answered, the host post-processing throws.
          content: { success: true, images: [{ view: 'isometric', dataUrl: 'data:image/gif;base64,R0lG' }] },
        }),
      },
    });
    server = startAgentServer({ launcher: stubLauncher(), token, workspaceRoot, mcp: endpoint });
    await server.ready;
    const capability = endpoint.mint({ runId: 'run-fault', chatId: 'chat-fault' });
    const release = endpoint.activate({
      token: capability.token,
      runId: 'run-fault',
      chatId: 'chat-fault',
      signal: new AbortController().signal,
    });
    const client = await connectMcpOverFetch({
      url: new URL('mcp', server.url()).href,
      headers: { authorization: `Bearer ${capability.token}` },
    });
    try {
      const capture = await client.callTool('screenshot', { targetFile: 'main.cs', mode: 'single' });
      expect(capture.isError).toBe(true);
      expect(capture.structuredContent).toMatchObject({
        errorCode: 'MCP_HOST_FAULT',
        message: expect.stringContaining('retrying will not help') as string,
      });
    } finally {
      await release();
    }
  }, 30_000);

  /* The real machine registry's definitions and handler, never a hand-written
   * schema: a hand-written one is how a draft-07 `definitions` reference the
   * SDK could not read reached every external agent's `initialize` as HTTP 500. */
  it('should initialize, list and call the machine tools from the real machine registry', async () => {
    const timestamp = '2026-10-05T00:00:00.000Z';
    const qualified = { status: 'qualified', profileId: 'x1c-hardware-2026-10' } as const;
    const actions = [
      defineMachineAction(
        {
          componentId: 'chamber-light',
          id: 'switch.set',
          version: 1,
          label: 'Chamber light',
          effects: ['illumination'],
          scope: 'any',
          when: ['ready', 'active'],
          safety: { authority: 'agent', attended: false, interlocks: [] },
          requires: [],
          confirms: 'acknowledgement',
          qualification: qualified,
        },
        standardMachineActions['switch.set'].schema,
      ),
      standardMachineAction({
        id: 'run.cancel',
        componentId: 'controller',
        label: 'Cancel the print',
        when: ['active'],
        qualification: qualified,
      }),
    ].map((definition) => machineActionDescriptorOf(definition));
    const stop = { motion: 'halts', spindle: 'none', heaters: 'off', position: 'kept', recovery: [] } as const;
    const machine: MachineDirectoryEntry = {
      machineId: 'machine-1',
      name: 'Workshop X1C',
      providerId: 'bambu',
      freshness: 'current',
      descriptor: {
        id: 'physical-machine-1',
        name: 'X1C',
        vendor: 'Bambu Lab',
        model: 'X1C',
        firmware: '01.08.00.00',
        capabilities: {
          connection: { transport: 'network', exclusive: false, opening: 'nothing', identity: 'authenticated' },
          axes: [],
          components: [
            { id: 'controller', label: 'Printer', kind: 'controller' },
            { id: 'chamber-light', label: 'Chamber light', kind: 'light' },
          ],
          /* A printer: slicing tools are offered only for an `fff` process. */
          processes: [
            {
              type: 'fff',
              version: 1,
              geometry: {
                unit: 'mm',
                buildVolume: { x: 256, y: 256, z: 256 },
                enclosure: { outer: { x: 389, y: 389, z: 457 }, enclosed: true, doors: [] },
                kinematics: 'corexy',
                bedMotion: 'z',
                origin: 'front-left',
                toolheadHome: { x: 1, y: 1, z: 256 },
                materialSystemMount: 'none',
              },
              filamentDiameter: { value: 1.75, unit: 'mm' },
              bed: {
                maximumTemperature: { value: 110, unit: 'Cel' },
                plates: [{ id: 'textured-pei', label: 'Textured PEI plate' }],
              },
              chamber: { enclosed: true, heated: false },
              speedProfiles: [],
              slicing: {
                recommended: {
                  layerHeight: { value: 0.2, unit: 'mm' },
                  walls: 2,
                  infillPercent: 15,
                  nozzleTemperature: { value: 220, unit: 'Cel' },
                  bedTemperature: { value: 55, unit: 'Cel' },
                },
                presets: [{ id: 'standard', label: 'Standard', layerHeight: { value: 0.2, unit: 'mm' } }],
              },
            },
          ],
          actions,
          holds: [],
          jobs: {
            type: 'supported',
            accepts: [],
            delivery: 'stored',
            start: 'remote',
            submission: actions[0]!.configuration,
            attestations: [],
            safety: { authority: 'approved-agent', attended: false, interlocks: [] },
          },
          stop,
          revision: 'revision-1',
          incarnation: 'incarnation-1',
          qualifications: [],
        },
      },
      snapshot: {
        connection: 'connected',
        observedAt: timestamp,
        state: { status: 'active' },
        run: {
          runId: 'run-1',
          origin: 'tau',
          delivery: 'stored',
          state: 'running',
          progress: { basis: 'executed', counters: [] },
        },
        components: [],
        activities: [],
        checks: [],
        availability: [],
        alerts: [],
        operations: [],
      },
    };
    const requestJob = vi.fn<MachineClient['requestJob']>(async (input) => ({
      version: 1,
      jobId: input.jobId,
      machineId: input.machineId,
      artifact: input.artifact,
      configuration: input.configuration,
      requestedBy: input.requestedBy,
      state: 'awaiting-approval',
      createdAt: timestamp,
      updatedAt: timestamp,
      program: { name: 'main.gcode.3mf', facts: { process: 'fff', layers: 125 } },
      checks: [],
    }));
    const applyAction = vi.fn<MachineClient['applyAction']>(async (input) => ({
      operationId: input.operationId,
      machineId: input.machineId,
      kind: 'action',
      observedAt: timestamp,
      status: 'accepted',
    }));
    const stopMachine = vi.fn<MachineClient['stop']>(async (input) => ({
      operationId: input.operationId ?? 'stop',
      machineId: input.machineId,
      kind: 'stop',
      observedAt: timestamp,
      status: 'accepted',
    }));
    /* Only what the machine tools read; any other client call fails the test. */
    const client = {
      list: async () => ({
        cursor: { hostId: 'host-1', authorityId: 'authority-1', generation: 'generation-1', position: 1, revision: 1 },
        entries: [machine],
      }),
      /* The machine reads the program and completes nothing: it is ready as planned. */
      checkJob: vi.fn<MachineClient['checkJob']>(async (input) => ({
        status: 'ready',
        program: { name: 'main.gcode.3mf', facts: { process: 'fff', layers: 125 } },
        checks: [],
        configuration: input.configuration,
      })),
      requestJob,
      applyAction,
      stop: stopMachine,
      listJobs: async () => [],
      listProviders: async () => [
        { id: 'bambu', vendor: 'Bambu Lab', manifest: { identity: { typeId: 'bambu.x1c' } } },
      ],
    } as unknown as MachineClient;
    const planPrint = vi.fn<MachinePrintPlanner>(async () => ({
      artifact: {
        path: '.tau/artifacts/call__main.ts-gcode.3mf/main.gcode.3mf',
        digest: `sha256:${'d'.repeat(64)}`,
      } as unknown as MachineArtifactReference,
      configuration: { expectedBedType: 'textured-pei' },
      program: { name: 'main.gcode.3mf', facts: { process: 'fff', layers: 125 } },
    }));
    /* A host without Bambu Studio: the profiles tool names the reference engine and why. */
    const machineRegistry = createMachineToolRegistry(client, {
      planPrint,
      machineSettings: { readMachineSettings: async () => ({ status: 'absent' }) },
      bambuStudio: { ...unusedBambuStudio, findBambuStudio: async () => undefined },
    });
    endpoint = createHostMcpEndpoint({
      secret,
      workspaceRoot,
      registry: {
        list: (): HostToolDefinition[] => [
          ...machineRegistry.list(),
          {
            name: 'arrange_workbench',
            description: 'Arrange the workbench.',
            inputSchema: { type: 'object', properties: { open: { type: 'array', items: { type: 'object' } } } },
          },
          {
            name: 'ask_questions',
            description: 'Ask the person.',
            inputSchema: {
              type: 'object',
              properties: { chatId: { type: 'string' }, questions: { type: 'array', items: { type: 'object' } } },
              required: ['chatId', 'questions'],
            },
          },
        ],
        invoke: async (invocation): Promise<HostToolResult> => {
          invocations.push(invocation);
          if (invocation.toolName === 'ask_questions') {
            return {
              content: {
                success: true,
                status: 'answered',
                path: '.tau/chats/chat-1/questions.yaml',
                answers: [{ id: 'material', answer: 'PLA', source: 'person' }],
              },
              isError: false,
            };
          }
          if (invocation.toolName === 'arrange_workbench') {
            return {
              content: {
                status: 'written',
                revisions: [
                  {
                    path: '.tau/workbench/layout.json',
                    digest: `sha256:${'a'.repeat(64)}`,
                    previousDigest: 'missing',
                  },
                ],
                visible: [{ kind: 'pane', pane: 'model' }],
              },
              isError: false,
            };
          }
          return machineRegistry.invoke(invocation);
        },
      },
    });
    server = startAgentServer({ launcher: stubLauncher(), token, workspaceRoot, mcp: endpoint });
    await server.ready;
    const capability = endpoint.mint({ runId: 'run-1', chatId: 'chat-1' });
    const release = endpoint.activate({
      token: capability.token,
      runId: 'run-1',
      chatId: 'chat-1',
      signal: new AbortController().signal,
    });
    const session = await openMcpSession(new URL('mcp', server.url()).href, `Bearer ${capability.token}`);

    expect(session.initialized).toMatchObject({ result: { serverInfo: { name: '@taucad/mcp' } } });
    const listed = await session.request('tools/list', {});
    const { tools } = toolsListSchema.parse(listed.result);
    /* The grant, in order; the registry's other machine tools are never registered. */
    expect(tools.map(({ name }) => name)).toEqual([
      'evaluate_model',
      'test_model',
      'screenshot',
      'export_model',
      'list_machines',
      'get_machine',
      'machine_action',
      'stop_machine',
      'get_print_profiles',
      'request_job',
      'check_job',
      'arrange_workbench',
      'ask_questions',
    ]);
    /* The endpoint supplies the chat; the agent never sees or chooses it. */
    const askSchema = tools.find(({ name }) => name === 'ask_questions')?.inputSchema;
    expect(askSchema).toMatchObject({ type: 'object', required: ['questions'] });
    expect(Object.keys((askSchema?.['properties'] ?? {}) as Record<string, unknown>)).toEqual(['questions']);
    expect(tools.find(({ name }) => name === 'ask_questions')?.annotations).toEqual({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    });
    expect(tools.find(({ name }) => name === 'arrange_workbench')?.annotations).toEqual({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    });
    expect(
      tools
        .filter(({ name }) => ['evaluate_model', 'test_model', 'screenshot'].includes(name))
        .map(({ annotations }) => annotations),
    ).toEqual(
      Array.from({ length: 3 }, () => ({
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      })),
    );
    expect(tools.find(({ name }) => name === 'export_model')?.annotations).toEqual({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    });
    expect(tools.find(({ name }) => name === 'request_job')?.annotations).toEqual({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    });
    expect(tools.find(({ name }) => name === 'machine_action')?.annotations).toEqual({
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    });
    expect(tools.find(({ name }) => name === 'stop_machine')?.annotations).toEqual({
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    });
    for (const name of ['list_machines', 'get_machine', 'get_print_profiles', 'check_job']) {
      expect(tools.find((tool) => tool.name === name)?.annotations).toEqual({
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      });
    }
    /* A job names either a CAD source Tau slices or a finished program; neither is required alone. */
    const requestJobSchema = tools.find(({ name }) => name === 'request_job')?.inputSchema;
    expect(requestJobSchema).toMatchObject({
      type: 'object',
      properties: { targetFile: { type: 'string' }, artifact: { type: 'string' } },
    });
    expect(requestJobSchema?.['required'] ?? []).not.toEqual(expect.arrayContaining(['targetFile']));

    const call = async (name: string, args: Readonly<Record<string, unknown>>) => {
      const reply = await session.request('tools/call', { name, arguments: args });
      return toolResultSchema.parse(reply.result);
    };
    expect(await call('arrange_workbench', { open: [{ kind: 'pane', pane: 'model' }] })).toMatchObject({
      structuredContent: { status: 'written', visible: [{ kind: 'pane', pane: 'model' }] },
    });
    expect(invocations[0]).toMatchObject({ toolName: 'arrange_workbench', runId: 'run-1' });
    invocations.length = 0;
    expect(await call('ask_questions', { questions: [{ id: 'material' }] })).toMatchObject({
      structuredContent: { status: 'answered', answers: [{ answer: 'PLA', source: 'person' }] },
    });
    expect(invocations[0]).toMatchObject({
      toolName: 'ask_questions',
      input: { chatId: 'chat-1', questions: [{ id: 'material' }] },
    });
    invocations.length = 0;
    const options = { layerHeight: 0.2, supports: { enabled: true, angles: [45, 60] } };
    const requested = await call('request_job', { targetFile: 'main.ts', options });

    expect(requested.isError, JSON.stringify(requested)).not.toBe(true);
    expect(invocations).toHaveLength(1);
    expect(invocations[0]).toMatchObject({ toolName: 'request_job', runId: 'run-1' });
    /* An MCP caller has no interrupt port: the registry sees no `approve` and
     * hands the job back awaiting approval instead of pausing anything. */
    expect(invocations[0]?.approve).toBeUndefined();
    expect(planPrint.mock.calls[0]?.[0]).toMatchObject({ targetFile: 'main.ts', options });
    const jobId = invocations[0]?.toolCallId;
    expect(requestJob.mock.calls[0]?.[0].requestedBy).toEqual({
      kind: 'agent',
      id: 'external-agent',
      label: 'External agent',
    });
    expect(requested.structuredContent).toMatchObject({
      job: { jobId, machineId: 'machine-1', state: 'awaiting-approval', program: { name: 'main.gcode.3mf' } },
      machineName: 'Workshop X1C',
    });
    expect(z.object({ nextStep: z.string() }).parse(requested.structuredContent).nextStep).toContain(
      `Waiting for a person to accept job ${String(jobId)} in Tau's Print pane`,
    );

    /* The SDK validates against the registry's published schema before the host sees the call... */
    await expect(call('request_job', { targetFile: 'main.ts', preset: 'ultra' })).resolves.toMatchObject({
      isError: true,
    });
    await expect(call('capture_machine_still', { machineId: 'machine-1' })).resolves.toMatchObject({ isError: true });
    expect(invocations).toHaveLength(1);
    /* ...and what the wire form leaves open (slicer options are any JSON on the
     * wire) the registry refuses before anything reaches the machine host. */
    await expect(call('request_job', { targetFile: 'main.ts', options: 'fine' })).resolves.toMatchObject({
      isError: true,
    });
    expect(requestJob).toHaveBeenCalledTimes(1);

    /* An external agent reads the machine as text, applies the host's unattended actions only, and may stop. */
    const read = await call('get_machine', {});
    expect(JSON.stringify(read.structuredContent)).toContain('chamber-light switch.set {on: boolean}');
    await expect(call('machine_action', { componentId: 'controller', action: 'run.cancel' })).resolves.toMatchObject({
      structuredContent: {
        status: 'needs-approval',
        message: expect.stringContaining('Ask the person to do it in Tau.') as string,
      },
    });
    expect(applyAction).not.toHaveBeenCalled();
    await expect(
      call('machine_action', { componentId: 'chamber-light', action: 'switch.set', parameters: { on: true } }),
    ).resolves.toMatchObject({ structuredContent: { status: 'done' } });
    expect(applyAction).toHaveBeenCalledOnce();
    expect(applyAction.mock.calls[0]?.[0]).not.toHaveProperty('approval');
    await expect(call('stop_machine', {})).resolves.toMatchObject({ structuredContent: { status: 'done' } });
    expect(stopMachine).toHaveBeenCalledOnce();

    /* Codex reads the same slicing profiles a Tau turn does. */
    await expect(call('get_print_profiles', {})).resolves.toMatchObject({
      structuredContent: { machineId: 'machine-1', engine: 'reference' },
    });
    await release();
  }, 30_000);

  it('captures the active run for each call made through one long-lived MCP session', async () => {
    endpoint = createHostMcpEndpoint({ secret, workspaceRoot, registry });
    server = startAgentServer({
      launcher: stubLauncher(),
      token,
      workspaceRoot,
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
      // oxlint-disable-next-line no-await-in-loop -- finish this turn before rebinding the shared MCP session.
      await release();
    }

    expect(invocations.map((invocation) => invocation.runId)).toEqual(['run-1', 'run-2']);
  }, 30_000);

  /*
   * W10 EA-S3, EA-A4: the binding lease. The capability rides the vendor
   * session for its whole life (V7), so a prompt that outlives it must keep
   * its tools while the turn holds the binding — and no longer than the
   * ceiling (I30, E20).
   */
  describe('the binding lease', () => {
    const mount = async (
      clock: () => number,
    ): Promise<{ readonly url: string; readonly mcp: ReturnType<typeof createHostMcpEndpoint> }> => {
      const mcp = createHostMcpEndpoint({ secret, registry, workspaceRoot, now: clock });
      endpoint = mcp;
      server = startAgentServer({ launcher: stubLauncher(), token, workspaceRoot: '/tmp/tau-mcp-test', mcp });
      await server.ready;
      return { url: new URL('mcp', server.url()).href, mcp };
    };

    it('should admit a bound session after expiry until release', async () => {
      let clock = Date.now();
      const { url, mcp } = await mount(() => clock);
      const capability = mcp.mint({ runId: 'run-1', chatId: 'chat-1' });
      const client = await connectMcpOverFetch({ url, headers: { authorization: `Bearer ${capability.token}` } });
      const release = mcp.activate({
        token: capability.token,
        runId: 'run-1',
        chatId: 'chat-1',
        signal: new AbortController().signal,
      });

      clock += hostMcpCapabilityLifetime + 60_000;
      await expect(client.callTool('test_model', {})).resolves.toMatchObject({ structuredContent: { passed: 1 } });

      await release();
      await expect(client.callTool('test_model', {})).rejects.toThrow();
      expect(invocations).toHaveLength(1);
    }, 30_000);

    it('should refuse an expired unbound token', async () => {
      let clock = Date.now();
      const { url, mcp } = await mount(() => clock);
      const capability = mcp.mint({ runId: 'run-1', chatId: 'chat-1' });
      clock += hostMcpCapabilityLifetime + 1;

      await expect(
        connectMcpOverFetch({ url, headers: { authorization: `Bearer ${capability.token}` } }),
      ).rejects.toThrow();
      expect(() =>
        mcp.activate({
          token: capability.token,
          runId: 'run-1',
          chatId: 'chat-1',
          signal: new AbortController().signal,
        }),
      ).toThrow(HostMcpCapabilityError);
    }, 30_000);

    it('should refuse past the lease ceiling', async () => {
      let clock = Date.now();
      const { url, mcp } = await mount(() => clock);
      const capability = mcp.mint({ runId: 'run-1', chatId: 'chat-1' });
      const client = await connectMcpOverFetch({ url, headers: { authorization: `Bearer ${capability.token}` } });
      const release = mcp.activate({
        token: capability.token,
        runId: 'run-1',
        chatId: 'chat-1',
        signal: new AbortController().signal,
      });

      clock += hostMcpCapabilityLifetime + hostMcpLeaseCeiling;
      await expect(client.callTool('test_model', {})).rejects.toThrow();
      expect(invocations).toHaveLength(0);
      await release();
    }, 30_000);
  });

  it('refuses a capability minted for another chat on this session', async () => {
    endpoint = createHostMcpEndpoint({ secret, workspaceRoot, registry });
    server = startAgentServer({
      launcher: stubLauncher(),
      token,
      workspaceRoot,
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
