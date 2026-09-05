/**
 * The daemon's own MCP endpoint (X4), mounted at `${pathPrefix}/mcp`.
 *
 * An external ACP agent writes files with its own tools; what it cannot do is
 * render, verify or export CAD — so Tau supplies exactly those four read-only
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
 * can never be swapped onto another run.
 */

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

import { z } from 'zod';

import { createTauMcpHttpHandler } from '@taucad/mcp';
import type { TauMcpDispatch, TauMcpRpcFailure, TauMcpRpcName, TauMcpRpcSuccess } from '@taucad/mcp';
import { rpcName, toolName } from '@taucad/chat/constants';

import type { ToolRegistry } from '@taucad/agent-host';

/** Milliseconds a host-minted capability may live. @public */
export const hostMcpCapabilityLifetime = 12 * 60 * 60 * 1000;

/** The prefix every host capability carries; distinct from the API's `tau-mcp-v1`. @public */
export const hostMcpCapabilityPrefix = 'tau-mcp-host-v1';

/** The exact read-only grant a host capability carries. @public */
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
    runId: z.string().min(1),
    chatId: z.string().min(1),
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
  /** Mint one run-scoped capability. */
  mint(input: { readonly runId: string; readonly chatId: string }): {
    readonly token: string;
    readonly expiresAt: string;
  };
  /** Verify one capability, or throw {@link HostMcpCapabilityError}. */
  verify(token: string): HostMcpCapabilityClaims;
  /** Stable, non-secret fence preventing MCP session-id swapping across runs. */
  authorityKey(claims: HostMcpCapabilityClaims): string;
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

  const authorityKey = (claims: HostMcpCapabilityClaims): string =>
    `sha256:${createHash('sha256')
      .update(JSON.stringify({ runId: claims.runId, chatId: claims.chatId, allowedTools: claims.allowedTools }))
      .digest('hex')}`;

  /**
   * One run's dispatch into the daemon's own registry — no network hop, no API.
   *
   * @param claims - Verified capability whose grant bounds the dispatch.
   * @param signal - Cancels in-flight tools when the HTTP response closes.
   * @returns The dispatcher `@taucad/mcp` calls.
   */
  const dispatchFor = (claims: HostMcpCapabilityClaims, signal: AbortSignal): TauMcpDispatch => {
    return async (call, dispatchOptions) => {
      const tool = toolForRpc[call.rpcName];
      if (!claims.allowedTools.includes(tool)) {
        return { errorCode: 'TOOL_NOT_ALLOWED', message: `${tool} is not in this capability's grant.` };
      }
      const result = await options.registry.invoke({
        toolCallId: dispatchOptions.toolCallId,
        toolName: tool,
        // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- `@taucad/mcp` validated these args against the tool's own schema.
        input: call.args as never,
        signal: dispatchOptions.signal ?? signal,
      });
      // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- the registry returns the canonical RPC result verbatim.
      return result.content as TauMcpRpcSuccess | TauMcpRpcFailure;
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
    mint: ({ runId, chatId }) => {
      const issuedAt = now();
      const claims: HostMcpCapabilityClaims = {
        v: 1,
        runId,
        chatId,
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
        dispatch: dispatchFor(claims, controller.signal),
        authorityKey: authorityKey(claims),
      });
    },
    close: async () => handler.close(),
  };
};
