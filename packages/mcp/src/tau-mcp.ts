import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ZodType } from 'zod';
import { rpcName, toolName } from '@taucad/chat/constants';
import { exportGeometryInputSchema, exportGeometryOutputSchema } from '@taucad/chat/schemas/tools/export-geometry';
import { getKernelResultInputSchema, getKernelResultOutputSchema } from '@taucad/chat/schemas/tools/get-kernel-result';
import { screenshotInputSchema, screenshotOutputSchema } from '@taucad/chat/schemas/tools/screenshot';
import { testModelInputSchema, testModelOutputSchema } from '@taucad/chat/schemas/tools/test-model';

const exposedRpcNames = [
  rpcName.getKernelResult,
  rpcName.runGeoSpecTests,
  rpcName.captureImages,
  rpcName.exportGeometry,
] as const;

const exposedToolNames = [
  toolName.getKernelResult,
  toolName.testModel,
  toolName.screenshot,
  toolName.exportGeometry,
] as const;

const descriptions = {
  getKernelResult:
    'Check one CAD source file for compile or runtime issues. Use test_model for geometry requirements, not compile status.',
  testModel:
    'Run the project GeoSpec suite, optionally filtered by file, glob, or test name. Use get_kernel_result when only compile status is needed.',
  screenshot:
    'Capture a deterministic isometric or six-view image set for one CAD source file. Use test_model for machine-verifiable geometry requirements.',
  exportGeometry:
    'Export one CAD source file to a persisted artifact under .tau/artifacts. Use screenshot for visual inspection, not interchange output.',
} as const;

/** RPC names exposed to external agents through Tau MCP. @public */
export type TauMcpRpcName = (typeof exposedRpcNames)[number];

/** MCP tool names exposed to external agents. @public */
export type TauMcpToolName = (typeof exposedToolNames)[number];

/** Execution metadata forwarded from MCP to the selected Tau authority. @public */
export type TauMcpDispatchOptions = {
  /** Stable identifier used to deduplicate one tool request within a run. */
  toolCallId: string;
  /** Cancels the underlying browser or headless operation. */
  signal?: AbortSignal;
};

/** One validated call into Tau's canonical RPC dispatcher. @public */
export type TauMcpRpcCall = Readonly<{
  rpcName: TauMcpRpcName;
  args: Readonly<Record<string, unknown>>;
}>;

/** A successful canonical RPC result. @public */
export type TauMcpRpcSuccess = Readonly<{ success: true } & Record<string, unknown>>;

/** A business or transport failure returned by the canonical RPC dispatcher. @public */
export type TauMcpRpcFailure = Readonly<{
  success?: false;
  errorCode: string;
  message: string;
  rpcName?: string;
  validationErrors?: ReadonlyArray<{ path: string; message: string }>;
  rawOutput?: unknown;
}>;

/** Transport-neutral port implemented by browser-backed and headless Tau authorities. @public */
export type TauMcpDispatch = (
  call: TauMcpRpcCall,
  options: TauMcpDispatchOptions,
) => Promise<TauMcpRpcSuccess | TauMcpRpcFailure>;

/** Options for one stateless Streamable HTTP MCP request. @public */
export type TauMcpHttpRequestOptions = Readonly<{
  request: IncomingMessage;
  response: ServerResponse;
  body?: unknown;
  dispatch: TauMcpDispatch;
  /** Stable, non-secret identity of the capability authorized for this request. */
  authorityKey: string;
}>;

/** Stateful SDK transport owner for one API process. @public */
export type TauMcpHttpHandler = Readonly<{
  handle(options: TauMcpHttpRequestOptions): Promise<void>;
  close(): Promise<void>;
}>;

/** Public metadata for one read-only Tau MCP tool. @public */
export type TauMcpToolDefinition = Readonly<{
  description: string;
  inputSchema: ZodType;
  outputSchema: ZodType;
}>;

const canonicalToolDefinitions = {
  [toolName.getKernelResult]: {
    description: descriptions.getKernelResult,
    inputSchema: getKernelResultInputSchema,
    outputSchema: getKernelResultOutputSchema,
  },
  [toolName.testModel]: {
    description: descriptions.testModel,
    inputSchema: testModelInputSchema,
    outputSchema: testModelOutputSchema,
  },
  [toolName.screenshot]: {
    description: descriptions.screenshot,
    inputSchema: screenshotInputSchema,
    outputSchema: screenshotOutputSchema,
  },
  [toolName.exportGeometry]: {
    description: descriptions.exportGeometry,
    inputSchema: exportGeometryInputSchema,
    outputSchema: exportGeometryOutputSchema,
  },
} as const;

/** Public metadata for the four read-only Tau MCP tools. @public */
export const tauMcpToolDefinitions: Readonly<Record<TauMcpToolName, TauMcpToolDefinition>> = canonicalToolDefinitions;

/** Names of every tool exported by the read-only Tau MCP surface. @public */
export const tauMcpToolNames = Object.freeze(Object.keys(canonicalToolDefinitions)) as readonly TauMcpToolName[];

/** One call from an MCP transport into Tau's canonical RPC dispatcher. @public */
export type TauMcpCall = {
  name: TauMcpToolName;
  arguments: unknown;
  toolCallId: string;
  signal?: AbortSignal;
};

/** Read-only MCP adapter backed by a browser or headless Tau RPC authority. @public */
export type TauMcpAdapter = {
  call(input: TauMcpCall): Promise<CallToolResult>;
};

const rpcFailure = (result: { errorCode: string; message: string }): CallToolResult => ({
  isError: true,
  content: [{ type: 'text', text: `${result.errorCode}: ${result.message}` }],
});

const rpcSuccess = (result: Record<string, unknown>): CallToolResult => ({
  content: [{ type: 'text', text: JSON.stringify(result) }],
  structuredContent: result,
});

const withoutSuccess = <Value extends { success: true }>(result: Value): Omit<Value, 'success'> => {
  const { success: _success, ...value } = result;
  return value;
};

/**
 * Create the read-only Tau MCP adapter.
 *
 * @param options - Canonical RPC dispatch function for one authorized run.
 * @returns An adapter that validates and maps MCP calls to Tau RPC calls.
 * @public
 */
export const createTauMcpAdapter = (options: { dispatch: TauMcpDispatch }): TauMcpAdapter => ({
  async call(input) {
    input.signal?.throwIfAborted();
    const dispatchOptions = { toolCallId: input.toolCallId, signal: input.signal };

    switch (input.name) {
      case toolName.getKernelResult: {
        const args = getKernelResultInputSchema.parse(input.arguments);
        const result = await options.dispatch({ rpcName: rpcName.getKernelResult, args }, dispatchOptions);
        if (result.success !== true) {
          return rpcFailure(result);
        }
        return rpcSuccess(getKernelResultOutputSchema.parse(withoutSuccess(result)));
      }
      case toolName.testModel: {
        const args = testModelInputSchema.parse(input.arguments);
        const result = await options.dispatch({ rpcName: rpcName.runGeoSpecTests, args }, dispatchOptions);
        if (result.success !== true) {
          return rpcFailure(result);
        }
        return rpcSuccess(testModelOutputSchema.parse(withoutSuccess(result)));
      }
      case toolName.screenshot: {
        const args = screenshotInputSchema.parse(input.arguments);
        const result = await options.dispatch({ rpcName: rpcName.captureImages, args }, dispatchOptions);
        if (result.success !== true) {
          return rpcFailure(result);
        }
        return rpcSuccess(screenshotOutputSchema.parse(withoutSuccess(result)));
      }
      case toolName.exportGeometry: {
        const args = exportGeometryInputSchema.parse(input.arguments);
        const result = await options.dispatch(
          { rpcName: rpcName.exportGeometry, args: { ...args, toolCallId: input.toolCallId } },
          dispatchOptions,
        );
        if (result.success !== true) {
          return rpcFailure(result);
        }
        return rpcSuccess(exportGeometryOutputSchema.parse(withoutSuccess(result)));
      }
    }
  },
});

const readOnlyAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

/**
 * Register Tau's read-only CAD tools on an MCP server.
 *
 * @param server - MCP server that owns the transport lifecycle.
 * @param options - Canonical RPC dispatch function for one authorized run.
 * @returns Nothing.
 * @public
 */
export const registerTauMcpTools = (server: McpServer, options: { dispatch: TauMcpDispatch }): void => {
  const adapter = createTauMcpAdapter(options);

  server.registerTool(
    toolName.getKernelResult,
    { ...canonicalToolDefinitions[toolName.getKernelResult], annotations: readOnlyAnnotations },
    async (args, extra) =>
      adapter.call({
        name: toolName.getKernelResult,
        arguments: args,
        toolCallId: String(extra.requestId),
        signal: extra.signal,
      }),
  );
  server.registerTool(
    toolName.testModel,
    { ...canonicalToolDefinitions[toolName.testModel], annotations: readOnlyAnnotations },
    async (args, extra) =>
      adapter.call({
        name: toolName.testModel,
        arguments: args,
        toolCallId: String(extra.requestId),
        signal: extra.signal,
      }),
  );
  server.registerTool(
    toolName.screenshot,
    { ...canonicalToolDefinitions[toolName.screenshot], annotations: readOnlyAnnotations },
    async (args, extra) =>
      adapter.call({
        name: toolName.screenshot,
        arguments: args,
        toolCallId: String(extra.requestId),
        signal: extra.signal,
      }),
  );
  server.registerTool(
    toolName.exportGeometry,
    { ...canonicalToolDefinitions[toolName.exportGeometry], annotations: readOnlyAnnotations },
    async (args, extra) =>
      adapter.call({
        name: toolName.exportGeometry,
        arguments: args,
        toolCallId: String(extra.requestId),
        signal: extra.signal,
      }),
  );
};

/**
 * Create one tool-only Tau MCP server.
 *
 * The supplied dispatcher must already be bound to one authorized Tau run.
 * This package deliberately owns no filesystem, project-selection, or
 * credential authority.
 *
 * @param options - Canonical RPC dispatch function for one authorized run.
 * @returns A tool-only MCP server that has not yet been connected to a transport.
 * @public
 */
export const createTauMcpServer = (options: { readonly dispatch: TauMcpDispatch }): McpServer => {
  const server = new McpServer({ name: '@taucad/mcp', version: '0.0.1' });
  registerTauMcpTools(server, options);
  return server;
};

/**
 * Create an MCP Streamable HTTP handler with standard session semantics.
 *
 * MCP cancellation notifications arrive on a request after the tool-call POST,
 * so the SDK server and transport live for the session rather than one HTTP
 * request. Every request must present the same server-verified authority key;
 * a session id alone never grants access.
 *
 * @returns A stateful HTTP handler and its process-lifetime cleanup function.
 * @public
 */
export const createTauMcpHttpHandler = (): TauMcpHttpHandler => {
  type Session = {
    readonly server: McpServer;
    readonly transport: StreamableHTTPServerTransport;
    readonly authorityKey: string;
    dispatch: TauMcpDispatch;
  };
  const sessions = new Map<string, Session>();

  const reject = (response: ServerResponse, status: number, message: string): void => {
    response
      .writeHead(status, { 'content-type': 'application/json' })
      .end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32_000, message }, id: null }));
  };

  const handle = async (options: TauMcpHttpRequestOptions): Promise<void> => {
    const sessionHeader = options.request.headers['mcp-session-id'];
    const sessionId = Array.isArray(sessionHeader) ? sessionHeader[0] : sessionHeader;
    if (sessionId) {
      const session = sessions.get(sessionId);
      if (!session) {
        reject(options.response, 404, 'MCP session not found.');
        return;
      }
      if (session.authorityKey !== options.authorityKey) {
        reject(options.response, 403, 'MCP session authority mismatch.');
        return;
      }
      session.dispatch = options.dispatch;
      await session.transport.handleRequest(options.request, options.response, options.body);
      return;
    }

    if (options.request.method !== 'POST' || !isInitializeRequest(options.body)) {
      reject(options.response, 400, 'MCP initialization or session id required.');
      return;
    }

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: randomUUID,
      onsessioninitialized: (initializedSessionId) => {
        sessions.set(initializedSessionId, session);
      },
      onsessionclosed: (closedSessionId) => {
        sessions.delete(closedSessionId);
      },
    });
    const server = createTauMcpServer({
      dispatch: async (call, dispatchOptions) => session.dispatch(call, dispatchOptions),
    });
    const session: Session = { server, transport, authorityKey: options.authorityKey, dispatch: options.dispatch };
    // oxlint-disable-next-line unicorn/prefer-add-event-listener -- The SDK transport exposes an onclose callback, not EventTarget.
    transport.onclose = () => {
      const initializedSessionId = transport.sessionId;
      if (initializedSessionId) {
        sessions.delete(initializedSessionId);
      }
    };

    try {
      await server.connect(transport);
      await transport.handleRequest(options.request, options.response, options.body);
    } catch (error) {
      await server.close();
      throw error;
    }
  };

  return {
    handle,
    close: async () => {
      const active = [...new Set(sessions.values())];
      sessions.clear();
      await Promise.all(active.map(async ({ server }) => server.close()));
    },
  };
};
