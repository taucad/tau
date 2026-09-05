/**
 * The two thin bindings a dedicated-worker host needs, so an *app* never has to
 * value-import `@taucad/rpc` (R3).
 *
 * Deliberately protocol-agnostic: the browser worker's own vocabulary carries UI
 * types (transferred `MessagePort`s, a project storage discriminant) that have
 * no business in a published package, so it stays app-local and only the
 * channel binding lives here.
 */

import { createChannelClient, createChannelServer, wrapMessagePort } from '@taucad/rpc';
import type {
  Channel,
  ChannelServer,
  ChannelServerHandle,
  MessagePortLike,
  RpcProtocol,
  WireProtocolSchemas,
} from '@taucad/rpc';

/** Shared options for both halves of a worker channel. @public */
export type AgentWorkerChannelOptions<Protocol extends RpcProtocol> = {
  /** Context label carried on every dispatch; typically the worker session id. */
  readonly sessionKey: string;
  /** Wire validators for this worker's protocol. */
  readonly protocolSchemas: WireProtocolSchemas<Protocol>;
  /** Diagnostic label used on adapter close errors. */
  readonly label?: string | undefined;
};

/**
 * Bind the main-thread half of a dedicated-worker channel.
 *
 * @param port - The WHATWG-shaped port the worker was handed the twin of.
 * @param options - Session key, wire validators, optional label.
 * @returns A typed channel client.
 * @public
 */
export const connectAgentWorkerChannel = <Protocol extends RpcProtocol>(
  port: MessagePortLike,
  options: AgentWorkerChannelOptions<Protocol>,
): Channel<Protocol> =>
  createChannelClient<Protocol>({
    port: wrapMessagePort(port, { label: options.label ?? 'agent-worker-main' }),
    sessionKey: options.sessionKey,
    protocolSchemas: options.protocolSchemas,
  });

/**
 * Bind the worker-side half of a dedicated-worker channel.
 *
 * @param port - The WHATWG-shaped port transferred into the worker.
 * @param options - Session key, wire validators, the implementation, optional label.
 * @returns The server handle for this one connection.
 * @public
 */
export const serveAgentWorkerChannel = <Protocol extends RpcProtocol>(
  port: MessagePortLike,
  options: AgentWorkerChannelOptions<Protocol> & { readonly impl: ChannelServer<Protocol> },
): ChannelServerHandle<Protocol> =>
  createChannelServer<Protocol>({
    port: wrapMessagePort(port, { label: options.label ?? 'agent-worker' }),
    sessionKey: options.sessionKey,
    protocolSchemas: options.protocolSchemas,
    impl: options.impl,
  } as Parameters<typeof createChannelServer<Protocol>>[0]);
