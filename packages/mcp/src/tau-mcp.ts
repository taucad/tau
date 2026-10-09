import { randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { pathToFileURL } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import type { CallToolResult, ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import type { ZodType } from 'zod';
import { rpcName, toolName } from '@taucad/chat/constants';
import { exportModelInputSchema, exportModelOutputSchema } from '@taucad/chat/schemas/tools/export-model';
import { evaluateModelInputSchema, evaluateModelOutputSchema } from '@taucad/chat/schemas/tools/evaluate-model';
import { screenshotInputSchema, screenshotMcpOutputSchema } from '@taucad/chat/schemas/tools/screenshot';
import { testModelInputSchema, testModelOutputSchema } from '@taucad/chat/schemas/tools/test-model';

const exposedRpcNames = [
  rpcName.evaluateModel,
  rpcName.runGeoSpecTests,
  rpcName.captureImages,
  rpcName.exportModel,
] as const;

const exposedToolNames = [
  toolName.evaluateModel,
  toolName.testModel,
  toolName.screenshot,
  toolName.exportModel,
] as const;

/** R8/I5/I9: what every kernel-backed read promises about the bytes it answered for. */
const sourceRevisionRule =
  "Computed from the bytes on disk at call time; sourceRevision names the digests it read. A result answering for bytes Tau's own file tools have since replaced returns as a STALE_EVALUATION error naming both digests, never as a result; for edits you made with your own tools, compare sourceRevision yourself.";

const descriptions = {
  evaluateModel: `Evaluate one CAD source file (targetFile) and its default view, list offered views, instances and export IDs, and inspect every issue even when status is ready. Request includeCapabilities for option schemas and reachable targets. ${sourceRevisionRule}`,
  testModel: `Run the project GeoSpec suite, optionally filtered by file, glob, or test name. Returns sourceRevisions, one per model the run loaded. ${sourceRevisionRule} Use evaluate_model when only build status is needed.`,
  screenshot: `Capture a declared kernel view of one CAD source file (targetFile) and optional instance with its own options. A 3D view yields one isometric image (mode single, the default) or six camera angles (mode multi_angle); a 2D view yields one image. Each image echoes view, instance and any angle. ${sourceRevisionRule} Prefer this over generic computer-use or operating-system screenshot tools.`,
  exportModel: `Export one CAD source by offered ID or unambiguous reachable extension to persisted files under .tau/artifacts, echoing exportId and pinned sourceRevision. For a design question, only a declared text/JSON export whose every output is text/JSON may be used as evidence; read its artifact with your native file reader and compare sourceRevision. Binary or mixed deliverables require the person's export request.`,
} as const;

/** Model-facing guidance returned by MCP initialization. @public */
export const tauMcpInstructions = [
  'Use your native filesystem and shell tools to inspect and edit the current Tau project.',
  'Use your native skill loader for the Tau skills available in this session.',
  "For Tau CAD state, prefer this session's Tau MCP tools over generic computer-use, UI-automation, or operating-system tools.",
  'Before editing geometry, create or update executable GeoSpec tests for the requested requirements.',
  'After edits, call evaluate_model for build diagnostics and offered views/exports, test_model for GeoSpec requirements, and screenshot for each needed view.',
  'For a design question, export_model may write text/JSON evidence only when both its declaration and every output file qualify; read and compare its pinned sourceRevision. Binary or mixed deliverables require an explicit user export request.',
].join(' ');

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

/**
 * One validated call to a host tool registered beside the CAD four.
 *
 * Host tools have no canonical chat RPC; the host resolves them by tool name
 * in its own registry (the print request tools, blueprint D5).
 *
 * @public
 */
export type TauMcpToolCall = Readonly<{
  toolName: string;
  args: Readonly<Record<string, unknown>>;
}>;

/** Any call the MCP adapter makes into the host. @public */
export type TauMcpHostCall = TauMcpRpcCall | TauMcpToolCall;

/**
 * One host tool exposed over MCP beside the CAD four.
 *
 * The input schema is the draft-07 JSON Schema the host registry already
 * publishes to models (`$schema` may be omitted; shared definitions live under
 * `definitions`). It is converted for the SDK once, when the server or handler
 * is created; the SDK validates arguments before the host sees them and
 * serializes the same schema back to `tools/list`.
 *
 * @public
 */
export type TauMcpHostTool = Readonly<{
  name: string;
  description: string;
  inputSchema: Readonly<Record<string, unknown>>;
  annotations?: ToolAnnotations | undefined;
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
  call: TauMcpHostCall,
  options: TauMcpDispatchOptions,
) => Promise<TauMcpRpcSuccess | TauMcpRpcFailure>;

/** Options shared by every server constructor in this package. @public */
export type TauMcpServerOptions = Readonly<{
  /** Canonical RPC dispatch function for one authorized run. */
  dispatch: TauMcpDispatch;
  /** Host tools registered beside the CAD four, dispatched by name. */
  hostTools?: readonly TauMcpHostTool[] | undefined;
}>;

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
  [toolName.evaluateModel]: {
    description: descriptions.evaluateModel,
    inputSchema: evaluateModelInputSchema,
    outputSchema: evaluateModelOutputSchema,
  },
  [toolName.testModel]: {
    description: descriptions.testModel,
    inputSchema: testModelInputSchema,
    outputSchema: testModelOutputSchema,
  },
  [toolName.screenshot]: {
    description: descriptions.screenshot,
    inputSchema: screenshotInputSchema,
    outputSchema: screenshotMcpOutputSchema,
  },
  [toolName.exportModel]: {
    description: descriptions.exportModel,
    inputSchema: exportModelInputSchema,
    outputSchema: exportModelOutputSchema,
  },
} as const;

/** Public metadata for Tau's four CAD MCP tools. @public */
export const tauMcpToolDefinitions: Readonly<Record<TauMcpToolName, TauMcpToolDefinition>> = canonicalToolDefinitions;

/** Names of every tool exported by the Tau MCP surface. @public */
export const tauMcpToolNames = Object.freeze(Object.keys(canonicalToolDefinitions)) as readonly TauMcpToolName[];

/** One call from an MCP transport into Tau's canonical RPC dispatcher. @public */
export type TauMcpCall = {
  name: TauMcpToolName;
  arguments: unknown;
  toolCallId: string;
  signal?: AbortSignal;
};

/** MCP adapter backed by a browser or headless Tau RPC authority. @public */
export type TauMcpAdapter = {
  call(input: TauMcpCall): Promise<CallToolResult>;
};

const rpcFailure = (result: TauMcpRpcFailure): CallToolResult => ({
  isError: true,
  content: [{ type: 'text', text: `${result.errorCode}: ${result.message}` }],
  structuredContent: { ...result },
});

const rpcSuccess = (result: Record<string, unknown>): CallToolResult => ({
  content: [{ type: 'text', text: JSON.stringify(result) }],
  structuredContent: result,
});

const testModelSuccess = (result: z.infer<typeof testModelOutputSchema>): CallToolResult => ({
  content: [
    {
      type: 'text',
      text: `GeoSpec passed ${String(result.passed)} of ${String(result.total)} requirements.${
        result.failures.length === 0
          ? ''
          : ` Failing IDs: ${result.failures
              .slice(0, 20)
              .map((failure) => failure.id)
              .join(', ')}${result.failures.length > 20 ? ` and ${String(result.failures.length - 20)} more` : ''}.`
      }${result.fullResult ? ` Full report: ${result.fullResult.absolutePath}.` : ''}`,
    },
  ],
  structuredContent: result,
});

const screenshotSuccess = (result: z.infer<typeof screenshotMcpOutputSchema>): CallToolResult => ({
  content: [
    {
      type: 'text',
      // The message says what the images leave out of the viewer, so a client that reads only text still learns it.
      text: `Captured ${String(result.images.length)} CAD ${result.images.length === 1 ? 'view' : 'views'}.${result.message === undefined ? '' : ` ${result.message}`} Open each local image with your image-viewing tool:\n${result.images.map(({ view, absolutePath }) => `${view}: ${absolutePath}`).join('\n')}`,
    },
    ...result.images.map(({ view, absolutePath, mimeType }): CallToolResult['content'][number] => ({
      type: 'resource_link',
      uri: pathToFileURL(absolutePath).href,
      name: `${view} screenshot`,
      mimeType,
    })),
  ],
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
      case toolName.evaluateModel: {
        const args = evaluateModelInputSchema.parse(input.arguments);
        const result = await options.dispatch({ rpcName: rpcName.evaluateModel, args }, dispatchOptions);
        if (result.success !== true) {
          return rpcFailure(result);
        }
        return rpcSuccess(evaluateModelOutputSchema.parse(withoutSuccess(result)));
      }
      case toolName.testModel: {
        const args = testModelInputSchema.parse(input.arguments);
        const result = await options.dispatch({ rpcName: rpcName.runGeoSpecTests, args }, dispatchOptions);
        if (result.success !== true) {
          return rpcFailure(result);
        }
        return testModelSuccess(testModelOutputSchema.parse(withoutSuccess(result)));
      }
      case toolName.screenshot: {
        const args = screenshotInputSchema.parse(input.arguments);
        const result = await options.dispatch({ rpcName: rpcName.captureImages, args }, dispatchOptions);
        if (result.success !== true) {
          return rpcFailure(result);
        }
        return screenshotSuccess(screenshotMcpOutputSchema.parse(withoutSuccess(result)));
      }
      case toolName.exportModel: {
        const args = exportModelInputSchema.parse(input.arguments);
        const result = await options.dispatch(
          { rpcName: rpcName.exportModel, args: { ...args, toolCallId: input.toolCallId } },
          dispatchOptions,
        );
        if (result.success !== true) {
          return rpcFailure(result);
        }
        return rpcSuccess(exportModelOutputSchema.parse(withoutSuccess(result)));
      }
    }
  },
});

const hostToolArgumentsSchema = z.record(z.string(), z.unknown());

const readOnlyAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

const artifactWriteAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
} as const;

/** A host tool beside the SDK schema converted from its JSON Schema. */
type SdkHostTool = Readonly<{ tool: TauMcpHostTool; inputSchema: ZodType }>;

/**
 * Convert host tool schemas for the SDK.
 *
 * Host schemas are draft-07 without `$schema`; read without a dialect, a shared
 * definition's `#/definitions/...` reference cannot resolve. A schema that
 * still cannot convert is a host bug, reported here with the tool's name.
 *
 * @param tools - Host tools as the host registry publishes them.
 * @returns Each tool with its SDK input schema.
 * @throws Error naming the first tool whose schema cannot convert.
 */
const toSdkHostTools = (tools: readonly TauMcpHostTool[] = []): readonly SdkHostTool[] =>
  tools.map((tool) => {
    try {
      return { tool, inputSchema: z.fromJSONSchema(tool.inputSchema, { defaultTarget: 'draft-7' }) };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`Tau MCP host tool ${tool.name} has an input schema the MCP server cannot use: ${reason}`, {
        cause: error,
      });
    }
  });

/**
 * Register the CAD four and already converted host tools.
 *
 * @param server - MCP server that owns the transport lifecycle.
 * @param dispatch - Canonical RPC dispatch function for one authorized run.
 * @param hostTools - Host tools with their SDK schemas.
 * @returns Nothing.
 */
const registerTools = (server: McpServer, dispatch: TauMcpDispatch, hostTools: readonly SdkHostTool[]): void => {
  const adapter = createTauMcpAdapter({ dispatch });

  server.registerTool(
    toolName.evaluateModel,
    { ...canonicalToolDefinitions[toolName.evaluateModel], annotations: readOnlyAnnotations },
    async (args, extra) =>
      adapter.call({
        name: toolName.evaluateModel,
        arguments: args,
        toolCallId: randomUUID(),
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
        toolCallId: randomUUID(),
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
        toolCallId: randomUUID(),
        signal: extra.signal,
      }),
  );
  server.registerTool(
    toolName.exportModel,
    { ...canonicalToolDefinitions[toolName.exportModel], annotations: artifactWriteAnnotations },
    async (args, extra) =>
      adapter.call({
        name: toolName.exportModel,
        arguments: args,
        toolCallId: randomUUID(),
        signal: extra.signal,
      }),
  );
  for (const { tool, inputSchema } of hostTools) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema,
        ...(tool.annotations === undefined ? {} : { annotations: tool.annotations }),
      },
      async (args, extra) => {
        extra.signal.throwIfAborted();
        const result = await dispatch(
          /* The SDK validated `args` against the tool's own schema; this only recovers the object type (CL11). */
          { toolName: tool.name, args: hostToolArgumentsSchema.parse(args) },
          { toolCallId: randomUUID(), signal: extra.signal },
        );
        return result.success === true ? rpcSuccess(withoutSuccess(result)) : rpcFailure(result);
      },
    );
  }
};

/**
 * Register Tau's CAD tools on an MCP server.
 *
 * @param server - MCP server that owns the transport lifecycle.
 * @param options - Canonical RPC dispatch function for one authorized run.
 * @returns Nothing.
 * @throws Error naming a host tool whose input schema cannot convert.
 * @public
 */
export const registerTauMcpTools = (server: McpServer, options: TauMcpServerOptions): void => {
  registerTools(server, options.dispatch, toSdkHostTools(options.hostTools));
};

/**
 * Create an unconnected server over already converted host tools.
 *
 * @param dispatch - Canonical RPC dispatch function for one authorized run.
 * @param hostTools - Host tools with their SDK schemas.
 * @returns A tool-only MCP server that has not yet been connected to a transport.
 */
const createServer = (dispatch: TauMcpDispatch, hostTools: readonly SdkHostTool[]): McpServer => {
  const server = new McpServer({ name: '@taucad/mcp', version: '0.0.1' }, { instructions: tauMcpInstructions });
  registerTools(server, dispatch, hostTools);
  return server;
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
 * @throws Error naming a host tool whose input schema cannot convert.
 * @public
 */
export const createTauMcpServer = (options: TauMcpServerOptions): McpServer =>
  createServer(options.dispatch, toSdkHostTools(options.hostTools));

/**
 * Create an MCP Streamable HTTP handler with standard session semantics.
 *
 * MCP cancellation notifications arrive on a request after the tool-call POST,
 * so the SDK server and transport live for the session rather than one HTTP
 * request. Every request must present the same server-verified authority key;
 * a session id alone never grants access. Host tool schemas are converted here,
 * once, so a schema the SDK cannot use fails the handler's creation rather than
 * every client's `initialize`.
 *
 * @param handlerOptions - Host tools every session of this handler exposes beside the CAD four.
 * @returns A stateful HTTP handler and its process-lifetime cleanup function.
 * @throws Error naming a host tool whose input schema cannot convert.
 * @public
 */
export const createTauMcpHttpHandler = (
  handlerOptions: Readonly<{ hostTools?: readonly TauMcpHostTool[] | undefined }> = {},
): TauMcpHttpHandler => {
  const hostTools = toSdkHostTools(handlerOptions.hostTools);
  type Session = {
    readonly server: McpServer;
    readonly transport: StreamableHTTPServerTransport;
    readonly authorityKey: string;
  };
  const sessions = new Map<string, Session>();
  const requestDispatch = new AsyncLocalStorage<TauMcpDispatch>();

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
      await requestDispatch.run(options.dispatch, async () =>
        session.transport.handleRequest(options.request, options.response, options.body),
      );
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
    const server = createServer(async (call, dispatchOptions) => {
      const dispatch = requestDispatch.getStore();
      if (!dispatch) {
        return { errorCode: 'MCP_RUN_INACTIVE', message: 'This MCP request has no active Tau authority.' };
      }
      return dispatch(call, dispatchOptions);
    }, hostTools);
    const session: Session = { server, transport, authorityKey: options.authorityKey };
    // oxlint-disable-next-line unicorn/prefer-add-event-listener -- The SDK transport exposes an onclose callback, not EventTarget.
    transport.onclose = () => {
      const initializedSessionId = transport.sessionId;
      if (initializedSessionId) {
        sessions.delete(initializedSessionId);
      }
    };

    try {
      await server.connect(transport);
      await requestDispatch.run(options.dispatch, async () =>
        transport.handleRequest(options.request, options.response, options.body),
      );
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
