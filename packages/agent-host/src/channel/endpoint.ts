/**
 * One transport normaliser, shared by both halves of the agent channel.
 *
 * The daemon serves the T0 vocabulary over whatever wire the launcher was
 * handed, and the client dials it over whatever wire the page has. Neither half
 * may grow its own notion of "which transports exist", so membership lives here
 * once and both `serveAgentChannel` and `createAgentChannelClient` call it.
 *
 * Browser-safe by construction: no `node:` import may reach this file, because
 * the client half runs inside a page bundle.
 */

import { wrapMessagePort, wrapMessagePortMain, wrapWebSocket } from '@taucad/rpc';
import type { MessagePortLike, MessagePortMainLike, Port, WebSocketLike } from '@taucad/rpc';
import { msgpackCodec } from '@taucad/rpc/codec/msgpack';

/**
 * Anything the agent channel can be carried on.
 *
 * A byte-oriented socket is framed with the msgpack codec; a WHATWG-shaped
 * message port carries structured frames directly; an emitter-shaped port
 * (Electron's `MessagePortMain`, or a `node:worker_threads` port driven through
 * `on/off/start/close`) goes through the emitter adapter; an already-wrapped
 * {@link Port} is used as given.
 *
 * @public
 */
export type AgentChannelEndpoint = Port<unknown> | MessagePortLike | MessagePortMainLike | WebSocketLike;

/**
 * Normalize one endpoint into a {@link Port}.
 *
 * Membership, never parameter types: a `Port` is the only shape with
 * `onMessage`, a socket the only one with `send`, and an emitter-shaped port
 * the only remaining one with `on`.
 *
 * @param endpoint - The caller's transport.
 * @param label - Diagnostic label carried onto adapter close errors.
 * @returns A frame-carrying port.
 * @public
 */
export const agentChannelPort = (endpoint: AgentChannelEndpoint, label = 'agent-channel'): Port<unknown> => {
  if ('onMessage' in endpoint) {
    return endpoint;
  }
  if ('send' in endpoint) {
    return wrapWebSocket<unknown>(endpoint, msgpackCodec);
  }
  if ('on' in endpoint && 'postMessage' in endpoint) {
    return wrapMessagePortMain<unknown>(endpoint, { label });
  }
  if ('postMessage' in endpoint) {
    return wrapMessagePort<unknown>(endpoint, { label });
  }
  throw new TypeError('agentChannelPort: endpoint is neither a Port, a MessagePort, nor a WebSocket');
};
