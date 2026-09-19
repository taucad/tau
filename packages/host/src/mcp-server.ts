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
import type { IncomingMessage, ServerResponse } from 'node:http';

import { z } from 'zod';

import { createTauMcpHttpHandler } from '@taucad/mcp';
import type { TauMcpDispatch, TauMcpRpcFailure, TauMcpRpcName, TauMcpRpcSuccess } from '@taucad/mcp';
import { rpcName, toolName } from '@taucad/chat/constants';

import type { JsonValue, ToolRegistry } from '@taucad/agent-host';

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

/** The prefix every host capability carries; distinct from the API's `tau-mcp-v1`. @public */
export const hostMcpCapabilityPrefix = 'tau-mcp-host-v1';

/** The exact CAD-tool grant a host capability carries. @public */
export const hostMcpAllowedTools = [
  toolName.getKernelResult,
  toolName.testModel,
  toolName.screenshot,
  toolName.exportGeometry,
] as const;

/**
 * The one direction the RPC↔tool map is needed here.
 *
 * `@taucad/mcp` speaks canonical *RPC* names, the host registry speaks *tool*
 * names, and the pairing is the same one the API applies
 * (`apps/api/app/api/mcp/mcp-authority.service.ts`).
 */
const toolForRpc: Readonly<Record<TauMcpRpcName, (typeof hostMcpAllowedTools)[number]>> = {
  [rpcName.getKernelResult]: toolName.getKernelResult,
  [rpcName.runGeoSpecTests]: toolName.testModel,
  [rpcName.captureImages]: toolName.screenshot,
  [rpcName.exportGeometry]: toolName.exportGeometry,
};

const capabilityClaimsSchema = z
  .object({
    v: z.literal(1),
    chatId: z.string().min(1),
    /** Nonce naming *this* chat session; a second session in the same chat gets its own. */
    sessionKey: z.string().min(1),
    /** Provenance only: which run opened the session. It fences nothing (V7). */
    runId: z.string().min(1),
    allowedTools: z.tuple([
      z.literal(toolName.getKernelResult),
      z.literal(toolName.testModel),
      z.literal(toolName.screenshot),
      z.literal(toolName.exportGeometry),
    ]),
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
 * @param options - Signing secret, tool registry, and clock seam.
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
 * const mcp = createHostMcpEndpoint({ secret: randomBytes(32).toString('base64url'), registry });
 * const capability = mcp.mint({ runId: 'run-1', chatId: 'chat-1' });
 * ```
 */
export const createHostMcpEndpoint = (options: HostMcpEndpointOptions): HostMcpEndpoint => {
  const now = options.now ?? Date.now;
  const handler = createTauMcpHttpHandler();
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

  const verify = (token: string): HostMcpCapabilityClaims => {
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
    if (
      claims.expiresAt <= now() ||
      claims.issuedAt > now() ||
      claims.expiresAt - claims.issuedAt > hostMcpCapabilityLifetime
    ) {
      throw new HostMcpCapabilityError();
    }
    return claims;
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
    return async (call, dispatchOptions) => {
      const tool = toolForRpc[call.rpcName];
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
        input: call.args as unknown as JsonValue,
        signal: AbortSignal.any(
          [binding.signal, dispatchOptions.signal, signal].filter(
            (candidate): candidate is AbortSignal => candidate !== undefined,
          ),
        ),
      });
      binding.pending.add(pending);
      try {
        const result = await pending;
        // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- the registry returns the canonical RPC result verbatim.
        return result.content as TauMcpRpcSuccess | TauMcpRpcFailure;
      } finally {
        binding.pending.delete(pending);
      }
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
        claims = verify(bearerOf(request.headers.authorization));
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
