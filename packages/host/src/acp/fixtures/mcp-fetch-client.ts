/**
 * A dependency-free Streamable-HTTP MCP client, used by the fake ACP agent.
 *
 * Deliberately *not* the MCP SDK: the fake agent stands in for a vendor adapter
 * this repo does not control, so proving the daemon's `/mcp` route with an
 * independent implementation is worth more than proving the SDK talks to
 * itself. It is also why this is `fetch` and 60 lines rather than a dependency.
 */

/** One MCP tool result, as the transport hands it back. @public */
export type McpToolResult = {
  readonly isError?: boolean;
  readonly content?: ReadonlyArray<{ readonly type: string; readonly text?: string }>;
  readonly structuredContent?: unknown;
};

type JsonRpcEnvelope = {
  readonly id?: number | string;
  readonly result?: unknown;
  readonly error?: { readonly code: number; readonly message: string };
};

/**
 * Read one JSON or `text/event-stream` reply and return the frame answering `id`.
 *
 * @param response - The HTTP response to drain.
 * @param id - JSON-RPC request id the caller is waiting on.
 * @returns The matching envelope.
 */
const replyFor = async (response: Response, id: number): Promise<JsonRpcEnvelope> => {
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`MCP request failed with HTTP ${String(response.status)}: ${body}`);
  }
  const frames = response.headers.get('content-type')?.includes('text/event-stream')
    ? body
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice('data:'.length).trim())
    : [body];
  for (const frame of frames) {
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- a JSON-RPC frame is validated by the id match below.
    const parsed = JSON.parse(frame) as JsonRpcEnvelope;
    if (parsed.id === id) {
      return parsed;
    }
  }
  throw new Error(`MCP reply for request ${String(id)} was not present in the response.`);
};

/** One connected MCP session. @public */
export type McpFetchClient = {
  callTool(name: string, args: Record<string, unknown>): Promise<McpToolResult>;
};

/**
 * Initialize one Streamable-HTTP MCP session.
 *
 * @param options - Endpoint, headers, and client identity.
 * @returns A client bound to the negotiated session.
 * @public
 */
export const connectMcpOverFetch = async (options: {
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
}): Promise<McpFetchClient> => {
  let nextId = 0;
  const base = {
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
    ...options.headers,
  };
  const post = async (body: unknown, headers: Readonly<Record<string, string>>): Promise<Response> =>
    fetch(options.url, { method: 'POST', headers: { ...base, ...headers }, body: JSON.stringify(body) });

  nextId += 1;
  const initializeId = nextId;
  const initialized = await post(
    {
      jsonrpc: '2.0',
      id: initializeId,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'tau-fake-acp-agent', version: '0.0.0' },
      },
    },
    {},
  );
  const sessionId = initialized.headers.get('mcp-session-id') ?? '';
  const reply = await replyFor(initialized, initializeId);
  if (reply.error) {
    throw new Error(`MCP initialize failed: ${reply.error.message}`);
  }
  const session: Readonly<Record<string, string>> = sessionId === '' ? {} : { 'mcp-session-id': sessionId };
  await post({ jsonrpc: '2.0', method: 'notifications/initialized' }, session);

  return {
    callTool: async (name, args) => {
      nextId += 1;
      const id = nextId;
      const response = await post(
        { jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } },
        session,
      );
      const result = await replyFor(response, id);
      if (result.error) {
        throw new Error(`MCP tool ${name} failed: ${result.error.message}`);
      }
      // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- the MCP tool-result shape is fixed by the protocol.
      return result.result as McpToolResult;
    },
  };
};
