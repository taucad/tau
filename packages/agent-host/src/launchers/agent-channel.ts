/**
 * The launcher→channel binding, deliberately free of any one transport and of any platform (W6 RH-S2).
 *
 * `tau serve` hands this a WebSocket accepted on `${pathPrefix}/agent`, the Electron services utility a
 * `MessagePortMain` minted by main, and the resident browser worker a transferred `MessagePort` per stream. All drive
 * the *same* {@link AgentLauncher} through the *same* vocabulary, so the client projection cannot tell which transport
 * or which host it is talking to.
 *
 * There is no new RPC layer here: `@taucad/rpc` channels are the substrate, and
 * this module is the only place in the package that value-imports them.
 */

import { createChannelServer } from '@taucad/rpc';
import type { ChannelServer, ChannelServerHandle } from '@taucad/rpc';

import { agentChannelPort } from '#channel/endpoint.js';
import type { AgentChannelEndpoint } from '#channel/endpoint.js';
import { agentWireVersion } from '#wire/frames.schema.js';
import { agentWireCompatSchemas } from '#channel/wire-v1.js';
import type { AgentWireCompatProtocol, V1Request } from '#channel/wire-v1.js';
import { createV1Session } from '#launchers/agent-wire-v1-session.js';
import type { AgentChannelRevisionEvent, AgentWireProtocol } from '#wire/frames.schema.js';
import type { CommandVerb, HostCommand } from '#wire/commands.schema.js';
import type { RefusalCode } from '#wire/refusals.js';
import type { JsonValue } from '#log/event-types.js';
import type { AgentLauncher } from '#launchers/agent-launcher.js';

/** Options for {@link serveAgentChannel}. @public */
export type ServeAgentChannelOptions = {
  /** This owner's build, sent in the hello and compared for equality by the client (I32). */
  readonly build: string;
  /** Send `lk` at this interval, so a client's liveness bound can tell slow from dead (T9 E3). Milliseconds. */
  readonly keepaliveInterval?: number | undefined;
  /** Context label carried on every dispatch; defaults to `tau-agent`. */
  readonly sessionKey?: string | undefined;
  /** The single revision root owned by this host connection, when present. */
  readonly revisions?:
    | Readonly<{
        request(input: JsonValue): Promise<Readonly<{ result: JsonValue; status: JsonValue }>>;
        events(signal: AbortSignal): AsyncIterable<AgentChannelRevisionEvent>;
      }>
    | undefined;
};

/** The keepalive an owner sends to a daemon's clients by default (T9 E3). Milliseconds. */
const defaultKeepaliveInterval = 2000;

/**
 * Serve one client on the agent channel: one call per verb answering `ans`, the long-poll `read`, the live deltas,
 * and this host's revision root.
 *
 * The returned handle owns only *this connection* (RH-R3). Disposing it ends the client's streams and nothing else:
 * runs the client started keep executing, because always-on lives in the launcher, never on a connection (D17).
 *
 * @param endpoint - Socket, message port, or already-wrapped port.
 * @param launcher - The always-on host answering the vocabulary.
 * @param options - The owner's build, keepalive and revision root.
 * @returns The channel handle for this one connection. The agent wire notifies nothing, so the handle names no
 * protocol (and not the internal v1 compatibility one).
 * @public
 *
 * @example <caption>Serve one accepted WebSocket</caption>
 * ```typescript
 * import { serveAgentChannel } from '@taucad/agent-host/launcher';
 * import type { AgentLauncher } from '@taucad/agent-host/launcher';
 * import type { AgentChannelEndpoint } from '@taucad/agent-host';
 *
 * declare const socket: AgentChannelEndpoint;
 * declare const launcher: AgentLauncher;
 * const channel = serveAgentChannel(socket, launcher, { build: '1.2.3' });
 * channel.dispose('client gone');
 * ```
 */
export const serveAgentChannel = (
  endpoint: AgentChannelEndpoint,
  launcher: AgentLauncher,
  options: ServeAgentChannelOptions,
): ChannelServerHandle => {
  /* I32: the compatibility window is open, so this connection also answers a v1 client (`request`, `events`, and
   * `liveEvents` with no chat), from the same launcher. */
  const v1 = createV1Session(launcher, options.revisions);
  const implementation: ChannelServer<AgentWireCompatProtocol> = {
    // oxlint-disable-next-line eslint/max-params -- @taucad/rpc ChannelServer callback contract.
    call: async (_context, name, args, signal) => {
      if (name === 'request') {
        return v1.request(args as V1Request);
      }
      if (name === 'read') {
        return launcher.read({ ...(args as AgentWireProtocol['calls']['read']['args']), signal });
      }
      if (name === 'revision') {
        if (options.revisions === undefined) {
          throw Object.assign(new Error('This agent host does not serve revisions.'), {
            code: 'REVISIONS_UNAVAILABLE' satisfies RefusalCode,
          });
        }
        return options.revisions.request((args as AgentWireProtocol['calls']['revision']['args']).request);
      }
      const { commandId, payload } = args as AgentWireProtocol['calls'][CommandVerb]['args'];
      // The adapter parses the payload strictly; the method name is the verb (SC-R1, SC-R4).
      return launcher.execute({ type: name, commandId, payload } as HostCommand);
    },
    // oxlint-disable-next-line eslint/max-params -- @taucad/rpc ChannelServer callback contract.
    listen: (_context, name, args, signal) => {
      if (name === 'catchUp') {
        return launcher.catchUp({
          ...(args as AgentWireProtocol['listens']['catchUp']['args']),
          signal,
        }) as AsyncIterable<never>;
      }
      if (name === 'events') {
        return v1.events(signal) as AsyncIterable<never>;
      }
      if (name === 'liveEvents') {
        return (
          args ? launcher.liveEvents({ chatId: args.chatId, signal }) : v1.liveEvents(signal)
        ) as AsyncIterable<never>;
      }
      return (options.revisions?.events(signal) ?? emptyRevisionEvents()) as AsyncIterable<never>;
    },
  };
  const handle = createChannelServer<AgentWireCompatProtocol>({
    port: agentChannelPort(endpoint),
    sessionKey: options.sessionKey ?? 'tau-agent',
    hello: { wire: agentWireVersion, build: options.build },
    keepaliveInterval: options.keepaliveInterval ?? defaultKeepaliveInterval,
    protocolSchemas: agentWireCompatSchemas,
    impl: implementation,
  });
  handle.onClose(() => {
    v1.close();
  });
  return handle;
};

/** An absent optional revision surface is an empty stream, not a hanging one. */
const emptyRevisionEvents = async function* (): AsyncGenerator<AgentChannelRevisionEvent> {
  yield* [];
};
