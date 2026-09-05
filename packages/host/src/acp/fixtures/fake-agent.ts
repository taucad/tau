/**
 * A deterministic ACP agent, spoken by hand over newline-delimited JSON-RPC.
 *
 * Not built on `@agentclientprotocol/sdk` on purpose: it stands in for a vendor
 * adapter this repo does not control, so an independent implementation proves
 * the daemon's client half rather than proving the SDK talks to itself.
 *
 * Run as an adapter override (`TAU_ACP_ADAPTER_OVERRIDE=<this file>:codex`,
 * honoured only under `NODE_ENV=test`). It is spawned with the same allowlisted
 * environment a real adapter gets, so the *only* way to steer it is the prompt
 * text — which is exactly how a real agent behaves:
 *
 * | Prompt contains | Behaviour |
 * | --- | --- |
 * | (always) | one text chunk echoing `{ cwd, env }`, then a permission-gated `write_file` tool call |
 * | `mcp` | calls `test_model` through the `tau` MCP server and reports the evidence |
 * | `escape` | tries `fs/write_text_file` above `cwd` and reports the refusal |
 * | `slow` | stops after the first chunk and waits to be cancelled |
 * | `noask` | writes without the permission round trip (the auto-approving mode a real CLI config produces — SP-4 Result 3) |
 */

import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { connectMcpOverFetch } from '#acp/fixtures/mcp-fetch-client.js';

type JsonRpcMessage = {
  readonly jsonrpc: '2.0';
  readonly id?: number | string;
  readonly method?: string;
  readonly params?: Record<string, unknown>;
  readonly result?: unknown;
  readonly error?: { readonly code: number; readonly message: string };
};

type McpServerEntry = { readonly name?: string; readonly url?: string; readonly headers?: readonly unknown[] };

/**
 * Every ACP field this fixture reads is a string; anything else is a caller bug.
 *
 * @param value - Raw JSON-RPC parameter.
 * @param fallback - Value used when the parameter is absent or not a string.
 * @returns `value` when it is a string, else `fallback`.
 */
const asString = (value: unknown, fallback = ''): string => (typeof value === 'string' ? value : fallback);

const pause = async (ms: number): Promise<void> => {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
};

const sessions = new Map<string, { readonly cwd: string; readonly mcpServers: readonly McpServerEntry[] }>();
const pending = new Map<number, (message: JsonRpcMessage) => void>();
const cancelled = new Set<string>();
let nextId = 0;

const send = (message: JsonRpcMessage): void => {
  process.stdout.write(`${JSON.stringify(message)}\n`);
};

const request = async (method: string, params: Record<string, unknown>): Promise<JsonRpcMessage> => {
  nextId += 1;
  const id = nextId;
  const answered = new Promise<JsonRpcMessage>((resolve) => {
    pending.set(id, resolve);
  });
  send({ jsonrpc: '2.0', id, method, params });
  return answered;
};

const update = async (sessionId: string, sessionUpdate: Record<string, unknown>): Promise<void> => {
  send({ jsonrpc: '2.0', method: 'session/update', params: { sessionId, update: sessionUpdate } });
  /* Yield so an update the client acts on lands before the next one is written;
   * a real adapter's updates are separated by real work. */
  await pause(1);
};

const textChunk = async (sessionId: string, text: string): Promise<void> =>
  update(sessionId, { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text } });

const toolCall = async (
  sessionId: string,
  call: { readonly toolCallId: string; readonly title: string; readonly rawInput?: unknown },
): Promise<void> => update(sessionId, { sessionUpdate: 'tool_call', status: 'pending', kind: 'edit', ...call });

const toolCallUpdate = async (
  sessionId: string,
  result: { readonly toolCallId: string; readonly status: 'completed' | 'failed'; readonly rawOutput: unknown },
): Promise<void> => update(sessionId, { sessionUpdate: 'tool_call_update', ...result });

const promptText = (blocks: readonly unknown[]): string =>
  blocks
    .map((block) =>
      typeof block === 'object' && block !== null && 'text' in block ? String((block as { text: unknown }).text) : '',
    )
    .join(' ');

const callTauMcp = async (sessionId: string, servers: readonly McpServerEntry[]): Promise<void> => {
  const tau = servers.find((server) => server.name === 'tau');
  if (!tau?.url) {
    await textChunk(sessionId, 'mcp: no tau server was configured for this session');
    return;
  }
  await toolCall(sessionId, { toolCallId: 'mcp-1', title: 'test_model' });
  try {
    const headers = Object.fromEntries(
      (tau.headers ?? []).flatMap((header) =>
        typeof header === 'object' && header !== null && 'name' in header && 'value' in header
          ? [[String((header as { name: unknown }).name), String((header as { value: unknown }).value)]]
          : [],
      ),
    );
    const client = await connectMcpOverFetch({ url: tau.url, headers });
    const result = await client.callTool('test_model', {});
    await toolCallUpdate(sessionId, {
      toolCallId: 'mcp-1',
      status: result.isError === true ? 'failed' : 'completed',
      rawOutput: result,
    });
  } catch (error) {
    await toolCallUpdate(sessionId, {
      toolCallId: 'mcp-1',
      status: 'failed',
      rawOutput: { message: error instanceof Error ? error.message : String(error) },
    });
  }
};

const attemptEscape = async (sessionId: string, cwd: string): Promise<void> => {
  const outside = join(cwd, '..', 'escaped.txt');
  const answer = await request('fs/write_text_file', { sessionId, path: outside, content: 'escaped' });
  await textChunk(sessionId, `escape: ${answer.error ? answer.error.message : 'accepted'}`);
};

const runPrompt = async (sessionId: string, blocks: readonly unknown[]): Promise<string> => {
  const session = sessions.get(sessionId);
  if (!session) {
    return 'refusal';
  }
  const text = promptText(blocks);
  await textChunk(
    sessionId,
    JSON.stringify({ cwd: session.cwd, env: Object.keys(process.env).toSorted((a, b) => a.localeCompare(b)) }),
  );
  if (text.includes('slow')) {
    for (let waited = 0; waited < 300 && !cancelled.has(sessionId); waited += 1) {
      // oxlint-disable-next-line no-await-in-loop -- polling for a cancel notification is ordered by construction.
      await pause(100);
    }
    return cancelled.has(sessionId) ? 'cancelled' : 'end_turn';
  }
  if (text.includes('escape')) {
    await attemptEscape(sessionId, session.cwd);
  }
  await toolCall(sessionId, { toolCallId: 'write-1', title: 'write hello.txt', rawInput: { path: 'hello.txt' } });
  /* SP-4 Result 3: a real adapter under the user's own `approval_policy =
   * "never"` writes without asking at all, so the fixture models that too. */
  const permission = text.includes('noask')
    ? { result: { outcome: { outcome: 'selected', optionId: 'allow' } } }
    : await request('session/request_permission', {
        sessionId,
        toolCall: { toolCallId: 'write-1', title: 'write hello.txt' },
        options: [
          { optionId: 'allow', name: 'Allow', kind: 'allow_once' },
          { optionId: 'reject', name: 'Reject', kind: 'reject_once' },
        ],
      });
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- the permission response shape is fixed by ACP.
  const outcome = (permission.result as { outcome?: { outcome?: string; optionId?: string } } | undefined)?.outcome;
  if (outcome?.outcome !== 'selected' || outcome.optionId !== 'allow') {
    await toolCallUpdate(sessionId, {
      toolCallId: 'write-1',
      status: 'failed',
      rawOutput: { outcome: outcome?.outcome ?? 'unknown' },
    });
    return 'refusal';
  }
  await writeFile(join(session.cwd, 'hello.txt'), text, 'utf8');
  await toolCallUpdate(sessionId, {
    toolCallId: 'write-1',
    status: 'completed',
    rawOutput: { path: 'hello.txt', bytes: Buffer.byteLength(text) },
  });
  if (text.includes('mcp')) {
    await callTauMcp(sessionId, session.mcpServers);
  }
  return cancelled.has(sessionId) ? 'cancelled' : 'end_turn';
};

const handle = async (message: JsonRpcMessage): Promise<void> => {
  if (message.id !== undefined && message.method === undefined) {
    pending.get(Number(message.id))?.(message);
    pending.delete(Number(message.id));
    return;
  }
  const params = message.params ?? {};
  const reply = (result: unknown): void => {
    if (message.id !== undefined) {
      send({ jsonrpc: '2.0', id: message.id, result });
    }
  };
  switch (message.method) {
    case 'initialize': {
      reply({
        protocolVersion: 1,
        agentCapabilities: { loadSession: true, sessionCapabilities: { resume: {} } },
        authMethods: [],
      });
      return;
    }
    case 'session/new': {
      const sessionId = `fake-session-${String(sessions.size + 1)}`;
      sessions.set(sessionId, {
        cwd: asString(params['cwd'], process.cwd()),
        // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- the `session/new` MCP server list is fixed by ACP.
        mcpServers: (params['mcpServers'] ?? []) as readonly McpServerEntry[],
      });
      reply({ sessionId });
      return;
    }
    case 'session/resume':
    case 'session/load': {
      const sessionId = asString(params['sessionId']);
      sessions.set(sessionId, {
        cwd: asString(params['cwd'], process.cwd()),
        // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- the resume MCP server list is fixed by ACP.
        mcpServers: (params['mcpServers'] ?? []) as readonly McpServerEntry[],
      });
      cancelled.delete(sessionId);
      reply({});
      return;
    }
    case 'session/cancel': {
      cancelled.add(asString(params['sessionId']));
      return;
    }
    case 'session/prompt': {
      const sessionId = asString(params['sessionId']);
      // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- the prompt block list is fixed by ACP.
      const stopReason = await runPrompt(sessionId, (params['prompt'] ?? []) as readonly unknown[]);
      reply({ stopReason });
      return;
    }
    default: {
      if (message.id !== undefined) {
        send({
          jsonrpc: '2.0',
          id: message.id,
          error: { code: -32_601, message: `Unknown method ${asString(message.method, '(none)')}` },
        });
      }
    }
  }
};

let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk: string) => {
  buffer += chunk;
  const lines = buffer.split('\n');
  buffer = lines.pop() ?? '';
  for (const line of lines) {
    if (line.trim() === '') {
      continue;
    }
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- inbound frames are JSON-RPC by construction of the stream.
    const message = JSON.parse(line) as JsonRpcMessage;
    /* async-iife: bootstrap. Concurrently, never chained: a chain would queue
     * the permission *response* behind the `session/prompt` request that is
     * waiting for it, and a `session/cancel` behind the turn it should stop. */
    const dispatch = async (): Promise<void> => {
      try {
        await handle(message);
      } catch {
        /* A fixture that cannot answer one frame keeps serving the rest. */
      }
    };
    void dispatch();
  }
});
