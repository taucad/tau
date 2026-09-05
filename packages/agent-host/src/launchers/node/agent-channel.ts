/**
 * The launcher→channel binding, deliberately free of any one transport.
 *
 * One host, several launchers: `tau serve` hands this a WebSocket accepted on
 * `${pathPrefix}/agent`, and the Electron services utility hands it a
 * `MessagePortMain` minted by main. Both drive the *same*
 * {@link NodeAgentLauncher} through the *same* T0 vocabulary, so launcher 2 is
 * a consumer of this host rather than a second implementation of it — and the
 * client projection still cannot tell which transport it is talking to.
 *
 * There is no new RPC layer here: `@taucad/rpc` channels are the substrate, and
 * this module is the only place in the package that value-imports them.
 */

import { createChannelServer } from '@taucad/rpc';
import type { ChannelServer, ChannelServerHandle } from '@taucad/rpc';

// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import { agentChannelPort } from '#channel/endpoint.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import type { AgentChannelEndpoint } from '#channel/endpoint.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import { agentChannelProtocolSchemas } from '#launchers/node/agent-wire.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import type {
  AgentChannelEvent,
  AgentChannelLiveEvent,
  AgentChannelProtocol,
  AgentChannelResponse,
} from '#launchers/node/agent-wire.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import type { NodeAgentLauncher } from '#launchers/node/node-agent-launcher.js';

/** Re-exported so `@taucad/agent-host/node-launcher` keeps naming its own endpoint type. @public */
// oxlint-disable-next-line no-barrel-files/no-barrel-files -- one type alias kept at its historical name, not a barrel.
export type { AgentChannelEndpoint } from '#channel/endpoint.js';

/** Options for {@link serveAgentChannel}. @public */
export type ServeAgentChannelOptions = {
  /** Context label carried on every dispatch; defaults to `tau-agent`. */
  readonly sessionKey?: string | undefined;
};

/**
 * Serve one client on the T0 agent channel.
 *
 * The returned handle owns only *this connection*. Disposing it ends the
 * client's streams and nothing else: runs the client started keep executing,
 * because always-on lives in the launcher, never on a socket.
 *
 * @param endpoint - Socket, message port, or already-wrapped port.
 * @param launcher - The always-on host answering the vocabulary.
 * @param options - Optional context label.
 * @returns The channel handle for this one connection.
 * @public
 *
 * @example <caption>Serve one accepted WebSocket</caption>
 * ```typescript
 * import { serveAgentChannel } from '@taucad/agent-host/node-launcher';
 *
 * import type { WebSocketLike } from '@taucad/rpc';
 * import type { NodeAgentLauncher } from '@taucad/agent-host/node-launcher';
 *
 * declare const socket: WebSocketLike;
 * declare const launcher: NodeAgentLauncher;
 * const channel = serveAgentChannel(socket, launcher);
 * channel.dispose('client gone');
 * ```
 */
export const serveAgentChannel = (
  endpoint: AgentChannelEndpoint,
  launcher: NodeAgentLauncher,
  options: ServeAgentChannelOptions = {},
): ChannelServerHandle<AgentChannelProtocol> => {
  const implementation: ChannelServer<AgentChannelProtocol> = {
    // oxlint-disable-next-line eslint/max-params -- @taucad/rpc ChannelServer callback contract.
    call: async (_context, _name, request): Promise<AgentChannelResponse> => launcher.execute(request),
    // oxlint-disable-next-line eslint/max-params -- @taucad/rpc ChannelServer callback contract.
    listen: (_context, name, _args, signal) =>
      (name === 'events' ? launcher.events(signal) : launcher.liveEvents(signal)) as AsyncIterable<
        AgentChannelEvent & AgentChannelLiveEvent
      >,
  };
  return createChannelServer<AgentChannelProtocol>({
    port: agentChannelPort(endpoint),
    sessionKey: options.sessionKey ?? 'tau-agent',
    protocolSchemas: agentChannelProtocolSchemas,
    impl: implementation,
  });
};
