/**
 * The daemon's own MCP endpoint (X4), mounted at `${pathPrefix}/mcp`.
 *
 * An external ACP agent writes files with its own tools; what it cannot do is
 * render, verify or export CAD — so Tau supplies exactly those four CAD
 * tools over MCP, and nothing else. The API's MCP gateway is unchanged and
 * still serves API-coordinated runs; this is its host-local sibling, and the
 * data path never leaves the machine.
 *
 * Admission is a **host-minted, run-scoped capability**, not the daemon's agent
 * token: the capability travels into a vendor adapter's process (it is the
 * `Authorization` header on the `mcpServers` entry), and the agent token admits
 * the whole `/agent` channel. Minting a second, narrower secret is what keeps
 * one leaked adapter environment from becoming channel access.
 *
 * The claim shape and the `authorityKey` fence mirror the API's
 * (`apps/api/app/api/mcp/mcp-capability.service.ts`) so an MCP session id alone
 * can never be swapped onto another caller. What the claim names is the **chat
 * session** (V7): a chat id plus a nonce minted when the ACP session was opened,
 * with the run recorded as provenance only, because one session now answers
 * every turn of a chat and a capability tied to a run would expire under it.
 */

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { z } from 'zod';

import { createTauMcpHttpHandler, serveTauMcpStdio } from '@taucad/mcp';
import type {
  TauMcpDispatch,
  TauMcpHostCall,
  TauMcpHostTool,
  TauMcpRpcFailure,
  TauMcpRpcName,
  TauMcpRpcSuccess,
  TauMcpStdioStreams,
} from '@taucad/mcp';
import { rpcName, toolName } from '@taucad/chat/constants';
import { screenshotImageSchema, screenshotOutputSchema } from '@taucad/chat/schemas/tools/screenshot';
import { testModelOutputSchema } from '@taucad/chat/schemas/tools/test-model';

import type { JsonObject, JsonValue, ToolRegistry } from '@taucad/agent-host';
import { saveChatAttachment } from '#acp/media.js';

/**
 * Milliseconds a host-minted capability may live.
 *
 * The token rides the session's `mcpServers` entry and that list never changes
 * while the session lives (V7), so an expiry underneath a live session would
 * silently disarm the agent's Tau tools mid-chat. The idle timer does not bound
 * a session's life, only its idleness; the ACP port therefore closes a session
 * whose capability is inside `acpCapabilityRenewalMargin` of this lifetime and
 * the next turn resumes with a fresh token (r1 risk 3, review 2-review S1).
 *
 * @public
 */
export const hostMcpCapabilityLifetime = 12 * 60 * 60 * 1000;

/**
 * Milliseconds past its expiry that a capability still admits a turn that holds its binding (E20).
 *
 * The binding lease (W10 EA-R6): a prompt that outlives its capability keeps
 * Tau's tools until the turn releases the binding, because the server list a
 * session was opened with cannot change (V7). The release is the lease's
 * releaser and this ceiling its bound (I30), so a vendor prompt that never
 * ends loses the tools one more lifetime after expiry. A new turn never binds
 * an expired token: `activate` still requires an unexpired one.
 *
 * @public
 */
export const hostMcpLeaseCeiling = hostMcpCapabilityLifetime;

/** The prefix every host capability carries; distinct from the API's `tau-mcp-v1`. @public */
export const hostMcpCapabilityPrefix = 'tau-mcp-host-v1';

/**
 * The exact tool grant a host capability carries.
 *
 * The four CAD tools, the workbench record tool, and the print tools (blueprint D5, Bambu Studio D13): an
 * external agent may read the slicing profiles a machine offers, and open,
 * read, list and stop a print request through the same ledger a Tau turn
 * uses, and is told to wait for the person — nothing here starts a print. Every name is dispatched into the daemon's own registry by tool name.
 *
 * @public
 */
export const hostMcpAllowedTools = [
  toolName.evaluateModel,
  toolName.testModel,
  toolName.screenshot,
  toolName.exportModel,
  toolName.arrangeWorkbench,
  toolName.getPrintProfiles,
  toolName.requestPrint,
  toolName.getPrintRequest,
  toolName.listPrintRequests,
  toolName.cancelPrint,
  toolName.askQuestions,
] as const;

/** One name from {@link hostMcpAllowedTools}. @public */
export type HostMcpAllowedTool = (typeof hostMcpAllowedTools)[number];

/**
 * The registry tools registered beside the CAD four, by name.
 *
 * They have no chat RPC, so `@taucad/mcp` dispatches them as `{ toolName }`
 * calls and this endpoint answers from the registry's own content.
 */
const hostMcpRegistryTools: ReadonlySet<HostMcpAllowedTool> = new Set<HostMcpAllowedTool>([
  toolName.arrangeWorkbench,
  toolName.askQuestions,
  toolName.getPrintProfiles,
  toolName.requestPrint,
  toolName.getPrintRequest,
  toolName.listPrintRequests,
  toolName.cancelPrint,
]);

/** The registry tools that change nothing, here or on a machine. */
const readOnlyRegistryTools: ReadonlySet<string> = new Set<string>([
  toolName.getPrintProfiles,
  toolName.getPrintRequest,
  toolName.listPrintRequests,
]);

/** Tool-specific hints where the derived registry defaults do not describe the effect. */
const hostMcpAnnotationOverrides: Readonly<Partial<Record<string, NonNullable<TauMcpHostTool['annotations']>>>> = {
  [toolName.arrangeWorkbench]: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  /* Records a question for the person and waits for them; nothing outside the chat changes. */
  [toolName.askQuestions]: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
};

const isJsonObject = (value: JsonValue): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Registry tools whose `chatId` input the endpoint supplies from the signed claim.
 * An external agent does not know Tau's chat id, and must not choose another chat.
 */
const chatScopedRegistryTools: ReadonlySet<string> = new Set<string>([toolName.askQuestions]);

/**
 * A tool's input schema without its `chatId` property.
 *
 * @param schema - The registry's JSON Schema.
 * @returns The schema an external agent sees.
 */
const withoutChatId = (schema: JsonObject): JsonObject => {
  const { properties, required } = schema;
  if (properties === undefined || !isJsonObject(properties)) {
    return schema;
  }
  const { chatId: _chatId, ...rest } = properties;
  return {
    ...schema,
    properties: rest,
    ...(Array.isArray(required) ? { required: required.filter((name) => name !== 'chatId') } : {}),
  };
};

/** Keep a diagnostic summary bounded while the full report remains readable by path. */
const shortDiagnostic = (value: string): string => (value.length > 300 ? `${value.slice(0, 300)}…` : value);

/**
 * How one registry tool presents over MCP.
 *
 * @param definition - The registry's own definition, schema included.
 * @returns The host tool `@taucad/mcp` registers.
 */
const hostToolOf = (definition: ReturnType<ToolRegistry['list']>[number]): TauMcpHostTool => {
  const reads = readOnlyRegistryTools.has(definition.name);
  return {
    name: definition.name,
    description: definition.description,
    inputSchema: chatScopedRegistryTools.has(definition.name)
      ? withoutChatId(definition.inputSchema)
      : definition.inputSchema,
    annotations: hostMcpAnnotationOverrides[definition.name] ?? {
      readOnlyHint: reads,
      destructiveHint: definition.name === toolName.cancelPrint,
      idempotentHint: definition.name !== toolName.cancelPrint,
      /* A print request reaches a machine outside this process once accepted. */
      openWorldHint: !reads,
    },
  };
};

/**
 * The one direction the RPC↔tool map is needed here.
 *
 * `@taucad/mcp` speaks canonical *RPC* names, the host registry speaks *tool*
 * names, and the pairing is the same one the API applies
 * (`apps/api/app/api/mcp/mcp-authority.service.ts`).
 */
const toolForRpc: Readonly<Record<TauMcpRpcName, HostMcpAllowedTool>> = {
  [rpcName.evaluateModel]: toolName.evaluateModel,
  [rpcName.runGeoSpecTests]: toolName.testModel,
  [rpcName.captureImages]: toolName.screenshot,
  [rpcName.exportModel]: toolName.exportModel,
};

/** One filed attachment: its `attachments/<sha256>.<ext>` reference, the real file, and its digest. */
type SavedAttachment = Awaited<ReturnType<typeof saveChatAttachment>>;

/** Where {@link present} files attachments, and what may still cancel the call. */
type PresentContext = {
  /** Files base64 bytes of one media type. */
  readonly save: (data: string, mimeType: string) => Promise<SavedAttachment>;
  readonly signals: ReadonlyArray<AbortSignal | undefined>;
};

/**
 * One registry result as the MCP adapter returns it.
 *
 * Screenshots and oversized GeoSpec reports leave the result as attachment
 * files; everything else passes through. Each screenshot keeps its bytes as
 * `dataUrl` too, for a server that returns images inline; one that returns
 * attachments drops them.
 *
 * @param context - Where attachments are filed, and the call's live signals.
 * @param tool - The registry tool that answered.
 * @param result - Its result.
 * @returns The RPC-shaped result the adapter reads.
 */
const present = async (
  context: PresentContext,
  tool: HostMcpAllowedTool,
  result: Awaited<ReturnType<ToolRegistry['invoke']>>,
): Promise<TauMcpRpcSuccess | TauMcpRpcFailure> => {
  if (!hostMcpRegistryTools.has(tool)) {
    if (tool === toolName.screenshot && !result.isError && isJsonObject(result.content)) {
      const { success: _success, ...payload } = result.content;
      const capture = screenshotOutputSchema.parse(payload);
      const images = await Promise.all(
        capture.images.map(async (image) => {
          const { dataUrl, ...echo } = screenshotImageSchema.parse(image);
          const match = /^data:(image\/(?:png|webp));base64,([A-Za-z0-9+/]+=*)$/u.exec(dataUrl);
          if (!match?.[1] || !match[2]) {
            throw new Error('Tau screenshot returned an invalid image data URL.');
          }
          return { ...echo, ...(await context.save(match[2], match[1])), mimeType: match[1], dataUrl };
        }),
      );
      return {
        success: true,
        images,
        ...(capture.sourceRevision ? { sourceRevision: capture.sourceRevision } : {}),
        ...(capture.message === undefined ? {} : { message: capture.message }),
      };
    }
    if (tool === toolName.testModel && !result.isError && isJsonObject(result.content)) {
      const { success: _success, ...payload } = result.content;
      const verdict = testModelOutputSchema.parse(payload);
      const full = JSON.stringify(verdict);
      if (Buffer.byteLength(full, 'utf8') > 128 * 1024) {
        const saved =
          verdict.fullResult ?? (await context.save(Buffer.from(full, 'utf8').toString('base64'), 'application/json'));
        for (const signal of context.signals) {
          signal?.throwIfAborted();
        }
        const failures = verdict.failures.slice(0, 20).map((failure) => ({
          id: shortDiagnostic(failure.id),
          requirement: shortDiagnostic(failure.requirement),
          reason: shortDiagnostic(failure.reason),
          suggestion: shortDiagnostic(failure.suggestion),
          targetFile: failure.targetFile,
        }));
        return {
          success: true,
          passed: verdict.passed,
          total: verdict.total,
          ...(verdict.runStatus === undefined ? {} : { runStatus: verdict.runStatus }),
          ...(verdict.accounting === undefined ? {} : { accounting: verdict.accounting }),
          ...(verdict.lineageStatus === undefined ? {} : { lineageStatus: verdict.lineageStatus }),
          failures,
          passes: [],
          omittedFailures: (verdict.omittedFailures ?? 0) + verdict.failures.length - failures.length,
          omittedPasses: (verdict.omittedPasses ?? 0) + verdict.passes.length,
          omittedSourceRevisions: (verdict.omittedSourceRevisions ?? 0) + (verdict.sourceRevisions?.length ?? 0),
          omittedTests: (verdict.omittedTests ?? 0) + (verdict.tests?.length ?? 0),
          omittedLineage: (verdict.omittedLineage ?? 0) + (verdict.lineage?.length ?? 0),
          fullResult: { ...saved, mimeType: 'application/json' },
        };
      }
    }
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- the registry returns the canonical RPC result verbatim.
    return result.content as TauMcpRpcSuccess | TauMcpRpcFailure;
  }
  /* A registry tool answers plain content with the error bit beside it;
   * the adapter reads `success` and `errorCode` the way it does for an
   * RPC result, so the bit becomes the field here. */
  const content = isJsonObject(result.content) ? result.content : { value: result.content };
  if (!result.isError) {
    return { success: true, ...content };
  }
  return {
    ...content,
    errorCode: typeof content['errorCode'] === 'string' ? content['errorCode'] : 'TOOL_ERROR',
    message: typeof content['message'] === 'string' ? content['message'] : `${tool} failed.`,
  };
};

/**
 * Which registry tool one adapter call names, and with what input.
 *
 * @param call - The adapter's validated call.
 * @returns The tool and its input, or a refusal for a name outside the grant.
 */
const routeCall = (
  call: TauMcpHostCall,
): { readonly tool: HostMcpAllowedTool; readonly args: Readonly<Record<string, unknown>> } | TauMcpRpcFailure => {
  if ('rpcName' in call) {
    // Export RPCs carry call identity in args; the tool registry takes it
    // from invocation metadata and adds it after strict input validation.
    if (call.rpcName === rpcName.exportModel) {
      const { toolCallId: _toolCallId, ...input } = call.args;
      return { tool: toolName.exportModel, args: input };
    }
    return { tool: toolForRpc[call.rpcName], args: call.args };
  }
  const tool = hostMcpAllowedTools.find((name) => name === call.toolName);
  if (tool === undefined) {
    return { errorCode: 'TOOL_NOT_ALLOWED', message: `${call.toolName} is not in this capability's grant.` };
  }
  return { tool, args: call.args };
};

/**
 * A Tau fault after the tool answered, coded so the agent does not retry it.
 *
 * @param tool - The tool whose result could not be returned.
 * @param error - What went wrong presenting it.
 * @returns The failure the agent sees.
 */
const hostFault = (tool: string, error: unknown): TauMcpRpcFailure => ({
  errorCode: 'MCP_HOST_FAULT',
  message: `Tau could not return this ${tool} result (${error instanceof Error ? error.message : String(error)}). This is a Tau fault, not a problem with the call; retrying will not help.`,
});

const capabilityClaimsSchema = z
  .object({
    v: z.literal(1),
    chatId: z.string().min(1),
    /** Nonce naming *this* chat session; a second session in the same chat gets its own. */
    sessionKey: z.string().min(1),
    /** Provenance only: which run opened the session. It fences nothing (V7). */
    runId: z.string().min(1),
    allowedTools: z.array(z.enum(hostMcpAllowedTools)).length(hostMcpAllowedTools.length),
    issuedAt: z.number().int().nonnegative(),
    expiresAt: z.number().int().positive(),
  })
  .strict();

/** Verified claims carried by a host MCP capability. @public */
export type HostMcpCapabilityClaims = z.infer<typeof capabilityClaimsSchema>;

/** A capability that failed to verify. @public */
export class HostMcpCapabilityError extends Error {
  public constructor(message = 'Invalid or expired Tau Host MCP capability.') {
    super(message);
    this.name = 'HostMcpCapabilityError';
  }
}

const encode = (value: string): string => Buffer.from(value, 'utf8').toString('base64url');
const decode = (value: string): string => Buffer.from(value, 'base64url').toString('utf8');

/** Options for {@link createHostMcpEndpoint}. @public */
export type HostMcpEndpointOptions = {
  /**
   * Per-daemon signing secret, minted at start. **Never** the agent channel
   * token: this one is handed to a vendor adapter's process.
   */
  readonly secret: string;
  /** Workspace root owning the durable chat attachments returned to the agent. */
  readonly workspaceRoot: string;
  /** The daemon's tool registry; the same one every agent run dispatches through. */
  readonly registry: ToolRegistry;
  /** Clock seam, for tests. */
  readonly now?: (() => number) | undefined;
};

/** The mounted endpoint. @public */
export type HostMcpEndpoint = {
  /**
   * Mint one capability for a chat session, named by a fresh nonce.
   *
   * Called once per session open — new or resumed — never per turn, because the
   * server list handed to an agent must not change while its session lives.
   */
  mint(input: { readonly runId: string; readonly chatId: string }): {
    readonly token: string;
    readonly expiresAt: string;
  };
  /** Verify one capability, or throw {@link HostMcpCapabilityError}. */
  verify(token: string): HostMcpCapabilityClaims;
  /** Stable, non-secret fence preventing MCP session-id swapping across chat sessions. */
  authorityKey(claims: HostMcpCapabilityClaims): string;
  /** Bind a live turn; release rejects new work, cancels and drains admitted work before resolving. */
  activate(input: {
    readonly token: string;
    readonly runId: string;
    readonly chatId: string;
    readonly signal: AbortSignal;
  }): () => Promise<void>;
  /** Answer one HTTP request on the `/mcp` route. */
  handle(request: IncomingMessage, response: ServerResponse): Promise<void>;
  close(): Promise<void>;
};

/**
 * Read one MCP request body.
 *
 * @param request - The inbound request.
 * @returns The parsed JSON body, or `undefined` when the method carries none.
 */
const readJsonBody = async (request: IncomingMessage): Promise<unknown> => {
  if (request.method !== 'POST') {
    return undefined;
  }
  const chunks: Array<Uint8Array<ArrayBuffer>> = [];
  for await (const chunk of request) {
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- an unset request encoding yields byte chunks.
    chunks.push(chunk as Uint8Array<ArrayBuffer>);
  }
  const body = Buffer.concat(chunks).toString('utf8');
  if (body === '') {
    return undefined;
  }
  return JSON.parse(body);
};

const bearerOf = (authorization: string | undefined): string =>
  authorization?.startsWith('Bearer ') ? authorization.slice('Bearer '.length) : '';

/**
 * Mount the host-local Tau MCP endpoint over one tool registry.
 *
 * @param options - Signing secret, workspace root, tool registry, and clock seam.
 * @returns The endpoint: minting, verification, and the HTTP handler.
 * @public
 *
 * @example <caption>Mint a capability for one run</caption>
 * ```typescript
 * import { randomBytes } from 'node:crypto';
 * import { createHostMcpEndpoint } from '@taucad/host';
 * import type { ToolRegistry } from '@taucad/agent-host';
 *
 * declare const registry: ToolRegistry;
 * declare const workspaceRoot: string;
 * const mcp = createHostMcpEndpoint({ secret: randomBytes(32).toString('base64url'), workspaceRoot, registry });
 * const capability = mcp.mint({ runId: 'run-1', chatId: 'chat-1' });
 * ```
 */
export const createHostMcpEndpoint = (options: HostMcpEndpointOptions): HostMcpEndpoint => {
  const now = options.now ?? Date.now;
  /* Offered iff the registry offers them: a daemon without a granted machines
   * facet lists none, so an external agent is never told about a tool this
   * host cannot serve. */
  const handler = createTauMcpHttpHandler({
    hostTools: options.registry
      .list()
      .filter((definition) => hostMcpRegistryTools.has(definition.name as HostMcpAllowedTool))
      .map((definition) => hostToolOf(definition)),
  });
  type Binding = {
    readonly runId: string;
    readonly signal: AbortSignal;
    readonly pending: Set<Promise<unknown>>;
    abort(): void;
  };
  const active = new Map<string, Binding>();

  const signature = (encodedClaims: string): Uint8Array<ArrayBuffer> =>
    Uint8Array.from(
      createHmac('sha256', options.secret).update(`${hostMcpCapabilityPrefix}.${encodedClaims}`).digest(),
    );

  /** Signature, schema and issue time; expiry is the caller's (the binding lease reads it differently). */
  const verifySigned = (token: string): HostMcpCapabilityClaims => {
    const [prefix, encodedClaims, supplied, extra] = token.split('.');
    if (prefix !== hostMcpCapabilityPrefix || !encodedClaims || !supplied || extra !== undefined) {
      throw new HostMcpCapabilityError();
    }
    const expected = signature(encodedClaims);
    const received = Buffer.from(supplied, 'base64url');
    if (received.byteLength !== expected.byteLength || !timingSafeEqual(received, expected)) {
      throw new HostMcpCapabilityError();
    }
    let claims: HostMcpCapabilityClaims;
    try {
      claims = capabilityClaimsSchema.parse(JSON.parse(decode(encodedClaims)));
    } catch {
      throw new HostMcpCapabilityError();
    }
    if (claims.issuedAt > now() || claims.expiresAt - claims.issuedAt > hostMcpCapabilityLifetime) {
      throw new HostMcpCapabilityError();
    }
    return claims;
  };

  const verify = (token: string): HostMcpCapabilityClaims => {
    const claims = verifySigned(token);
    if (claims.expiresAt <= now()) {
      throw new HostMcpCapabilityError();
    }
    return claims;
  };

  /**
   * A request's claims under the binding lease (E20): an expired token is still
   * admitted while its session holds a binding, up to the ceiling past expiry.
   *
   * @param token - The bearer the request carried.
   * @returns The verified claims.
   * @throws {@link HostMcpCapabilityError} for a bad token, or an expired one with no binding or past the ceiling.
   */
  const verifyLeased = (token: string): HostMcpCapabilityClaims => {
    const claims = verifySigned(token);
    const at = now();
    if (claims.expiresAt > at || (active.has(claims.sessionKey) && at < claims.expiresAt + hostMcpLeaseCeiling)) {
      return claims;
    }
    throw new HostMcpCapabilityError();
  };

  /* The chat *session*, not the run: one session spans every turn of a chat, so
   * a capability minted for another chat — or for another session of the same
   * chat — cannot be presented against this one's MCP session id. */
  const authorityKey = (claims: HostMcpCapabilityClaims): string =>
    `sha256:${createHash('sha256')
      .update(
        JSON.stringify({ chatId: claims.chatId, sessionKey: claims.sessionKey, allowedTools: claims.allowedTools }),
      )
      .digest('hex')}`;

  /**
   * One run's dispatch into the daemon's own registry — no network hop, no API.
   *
   * @param claims - Verified capability whose grant bounds the dispatch.
   * @param binding - Active run captured when this MCP request began.
   * @param signal - Cancels in-flight tools when the HTTP response closes.
   * @returns The dispatcher `@taucad/mcp` calls.
   */
  const dispatchFor = (
    claims: HostMcpCapabilityClaims,
    binding: Binding | undefined,
    signal: AbortSignal,
  ): TauMcpDispatch => {
    /**
     * One allowed tool, by name, into the daemon's registry.
     *
     * Keyed by tool name rather than RPC name because the print request tools
     * have no chat RPC — they are registry tools — and this is the one call
     * the MCP adapter makes for either kind.
     *
     * @param tool - The registry tool name the grant is checked against.
     * @param args - Arguments the MCP adapter already validated.
     * @param dispatchOptions - The adapter's call identity and cancellation.
     * @returns The registry result verbatim.
     */
    const invokeAllowed = async (
      tool: HostMcpAllowedTool,
      args: Readonly<Record<string, unknown>>,
      dispatchOptions: Parameters<TauMcpDispatch>[1],
    ): Promise<TauMcpRpcSuccess | TauMcpRpcFailure> => {
      if (!claims.allowedTools.includes(tool)) {
        return { errorCode: 'TOOL_NOT_ALLOWED', message: `${tool} is not in this capability's grant.` };
      }
      if (!binding || binding.signal.aborted) {
        return { errorCode: 'MCP_RUN_INACTIVE', message: 'This ACP session has no active Tau turn.' };
      }
      const pending = options.registry.invoke({
        toolCallId: dispatchOptions.toolCallId,
        toolName: tool,
        /* The run this capability was minted for. A candidate turn reopens its
         * vendor session — and remints — in its own checkout (`acp/run.ts`
         * closes a session whose `cwd` changed), so this names *that* turn's
         * active run and the registry resolves its checkout. Direct turns publish the
         * live root under their own run, and a run whose checkout was released
         * falls back to it, so a stale id is never a stale directory. */
        runId: binding.runId,
        // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- `@taucad/mcp` validated these args against the tool's own schema.
        input: (chatScopedRegistryTools.has(tool) ? { ...args, chatId: claims.chatId } : args) as unknown as JsonValue,
        signal: AbortSignal.any(
          [binding.signal, dispatchOptions.signal, signal].filter(
            (candidate): candidate is AbortSignal => candidate !== undefined,
          ),
        ),
      });
      binding.pending.add(pending);
      try {
        const result = await pending;
        /* A throw here is Tau's own fault after the tool answered — the agent's
         * call was fine and a retry repeats it — so it is coded as such rather
         * than reaching the agent as a bare runtime message it reads as its own. */
        return await present(
          {
            save: async (data, mimeType) =>
              saveChatAttachment({ workspaceRoot: options.workspaceRoot, chatId: claims.chatId, data, mimeType }),
            signals: [signal, binding.signal],
          },
          tool,
          result,
        ).catch((error: unknown) => hostFault(tool, error));
      } finally {
        binding.pending.delete(pending);
      }
    };
    return async (call, dispatchOptions) => {
      const route = routeCall(call);
      return 'errorCode' in route ? route : invokeAllowed(route.tool, route.args, dispatchOptions);
    };
  };

  const refuse = (response: ServerResponse, status: number, message: string): void => {
    response
      .writeHead(status, { 'content-type': 'application/json' })
      .end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32_000, message }, id: null }));
  };

  return {
    verify,
    authorityKey,
    activate: ({ token, runId, chatId, signal }) => {
      const claims = verify(token);
      if (claims.chatId !== chatId || signal.aborted) {
        throw new HostMcpCapabilityError('Tau Host MCP capability does not match an active turn.');
      }
      if (active.has(claims.sessionKey)) {
        throw new HostMcpCapabilityError('The prior Tau MCP turn has not settled.');
      }
      const bindingLifetime = new AbortController();
      const binding = {
        runId,
        pending: new Set<Promise<unknown>>(),
        signal: AbortSignal.any([signal, bindingLifetime.signal]),
        abort: (): void => {
          bindingLifetime.abort();
        },
      };
      active.set(claims.sessionKey, binding);
      return async () => {
        binding.abort();
        await Promise.allSettled(binding.pending);
        if (active.get(claims.sessionKey) === binding) {
          active.delete(claims.sessionKey);
        }
      };
    },
    mint: ({ runId, chatId }) => {
      const issuedAt = now();
      const claims: HostMcpCapabilityClaims = {
        v: 1,
        chatId,
        sessionKey: randomBytes(16).toString('base64url'),
        runId,
        allowedTools: [...hostMcpAllowedTools],
        issuedAt,
        expiresAt: issuedAt + hostMcpCapabilityLifetime,
      };
      const encodedClaims = encode(JSON.stringify(claims));
      return {
        token: `${hostMcpCapabilityPrefix}.${encodedClaims}.${Buffer.from(signature(encodedClaims)).toString('base64url')}`,
        expiresAt: new Date(claims.expiresAt).toISOString(),
      };
    },
    handle: async (request, response) => {
      let claims: HostMcpCapabilityClaims;
      try {
        claims = verifyLeased(bearerOf(request.headers.authorization));
      } catch {
        refuse(response, 401, 'A Tau Host MCP capability is required.');
        return;
      }
      const controller = new AbortController();
      response.on('close', () => {
        controller.abort();
      });
      const binding = active.get(claims.sessionKey);
      let body: unknown;
      try {
        body = await readJsonBody(request);
      } catch {
        refuse(response, 400, 'MCP request body was not JSON.');
        return;
      }
      await handler.handle({
        request,
        response,
        body,
        dispatch: dispatchFor(claims, binding, controller.signal),
        authorityKey: authorityKey(claims),
      });
    },
    close: async () => {
      for (const binding of active.values()) {
        binding.abort();
      }
      await Promise.allSettled([...active.values()].flatMap((binding) => [...binding.pending]));
      active.clear();
      await handler.close();
    },
  };
};

/** Options for {@link serveLocalHostMcp}. @public */
export type LocalHostMcpOptions = {
  /** The project a call works in when its client names none. */
  readonly workspaceRoot: string;
  /**
   * Work in `workspaceRoot` even when a call names its own folder, because the
   * launcher chose the project explicitly (`tau mcp --project`).
   */
  readonly pinned?: boolean | undefined;
  /** A registry built with `checkouts` set to {@link LocalHostMcpOptions.checkouts}. */
  readonly registry: ToolRegistry;
  /**
   * The registry's run → root map. A call that names another project folder
   * is recorded here under its own run id, so the registry works in that folder.
   */
  readonly checkouts: Map<string, { readonly cwd: string }>;
};

/** A local MCP server serving one agent. @public */
export type LocalHostMcp = {
  readonly server: Awaited<ReturnType<typeof serveTauMcpStdio>>;
  /** Close the server and remove the screenshots and reports it filed. */
  close(): Promise<void>;
};

/**
 * The project folder one call names, if any.
 *
 * Codex advertises no MCP roots; it names the thread's folder per call in
 * `_meta["codex/sandbox-state-meta"].sandboxCwd`, a `file:` URL (Codex 0.157
 * serializes its `PathUri` so), once the server declares that capability.
 *
 * @param meta - The request's `_meta`.
 * @returns An absolute folder, or `undefined`.
 */
const callerRoot = (meta: Readonly<Record<string, unknown>> | undefined): string | undefined => {
  const sandbox = meta?.['codex/sandbox-state-meta'];
  const cwd =
    typeof sandbox === 'object' && sandbox !== null && 'sandboxCwd' in sandbox ? sandbox.sandboxCwd : undefined;
  if (typeof cwd !== 'string') {
    return undefined;
  }
  try {
    const path = cwd.startsWith('file:') ? fileURLToPath(cwd) : cwd;
    return isAbsolute(path) ? path : undefined;
  } catch {
    // ponytail: a URL that names no local folder counts as no folder.
    return undefined;
  }
};

/**
 * Serve Tau's CAD tools to one local agent over stdio.
 *
 * The local sibling of {@link createHostMcpEndpoint}: the agent launched this
 * process, so its stdio pipe is the admission and there is no capability to
 * mint. `ask_questions` is withheld because no Tau chat waits on the answer.
 * Screenshots return inline, and they and large GeoSpec reports are filed in a
 * temporary folder that `close` removes, never in the project, where Tau
 * revisions or the agent's own commits would pick them up.
 *
 * @param options - Default project, registry and its run → root map.
 * @param streams - Protocol streams; default this process's stdin and stdout.
 * @returns The connected server and its cleanup; the server's `onclose` fires when the agent goes away.
 * @public
 *
 * @example <caption>Serve the current folder</caption>
 * ```typescript
 * import { createHostToolRegistry } from '@taucad/host/agent-tools';
 * import { serveLocalHostMcp } from '@taucad/host';
 *
 * const workspaceRoot = process.cwd();
 * const checkouts = new Map<string, { readonly cwd: string }>();
 * const registry = createHostToolRegistry({ workspaceRoot, checkouts });
 * const local = await serveLocalHostMcp({ workspaceRoot, registry, checkouts });
 * process.stdin.once('end', async () => {
 *   await local.close();
 * });
 * ```
 */
export const serveLocalHostMcp = async (
  options: LocalHostMcpOptions,
  streams?: TauMcpStdioStreams,
): Promise<LocalHostMcp> => {
  const directory = await mkdtemp(join(tmpdir(), 'tau-mcp-'));
  await mkdir(join(directory, 'attachments'));
  /* Content-addressed like a chat attachment, so `path` keeps the
   * `attachments/<sha256>.<ext>` shape the MCP screenshot schema requires. */
  const save = async (data: string, mimeType: string): Promise<SavedAttachment> => {
    const bytes = Buffer.from(data, 'base64');
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const path = `attachments/${sha256}.${mimeType === 'application/json' ? 'json' : mimeType.slice('image/'.length)}`;
    const absolutePath = join(directory, path);
    await writeFile(absolutePath, bytes);
    return { path, absolutePath, byteLength: bytes.length, sha256 };
  };
  const server = await serveTauMcpStdio(
    {
      hostTools: options.registry
        .list()
        .filter(
          (definition) =>
            hostMcpRegistryTools.has(definition.name as HostMcpAllowedTool) &&
            !chatScopedRegistryTools.has(definition.name),
        )
        .map((definition) => hostToolOf(definition)),
      screenshotImages: 'inline',
      dispatch: async (call, dispatchOptions) => {
        const route = routeCall(call);
        if ('errorCode' in route) {
          return route;
        }
        const workspaceRoot = (options.pinned ? undefined : callerRoot(dispatchOptions.meta)) ?? options.workspaceRoot;
        const runId = `mcp:${workspaceRoot}`;
        options.checkouts.set(runId, { cwd: workspaceRoot });
        const result = await options.registry.invoke({
          toolCallId: dispatchOptions.toolCallId,
          toolName: route.tool,
          runId,
          // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- `@taucad/mcp` validated these args against the tool's own schema.
          input: route.args as unknown as JsonValue,
          signal: dispatchOptions.signal ?? new AbortController().signal,
        });
        return present({ save, signals: [dispatchOptions.signal] }, route.tool, result).catch((error: unknown) =>
          hostFault(route.tool, error),
        );
      },
    },
    streams,
  );
  return {
    server,
    close: async () => {
      await server.close();
      await rm(directory, { recursive: true, force: true });
    },
  };
};
