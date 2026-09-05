/**
 * The first-party client half of the T0 agent channel.
 *
 * R3: `@taucad/rpc` is a dependency of *packages*, never of apps. A page that
 * wants to drive a daemon imports this, not a channel factory — so the
 * transport substrate stays swappable underneath every consumer at once.
 *
 * Browser-safe by construction: no `node:` import may reach this file.
 */

import { createChannelClient } from '@taucad/rpc';
import type { Channel } from '@taucad/rpc';

// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import { agentChannelPort } from '#channel/endpoint.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import type { AgentChannelEndpoint } from '#channel/endpoint.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import { agentChannelProtocolSchemas } from '#launchers/node/agent-wire.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import type {
  AgentChannelCommand,
  AgentChannelEvent,
  AgentChannelLiveEvent,
  AgentChannelProtocol,
  AgentChannelResponse,
} from '#launchers/node/agent-wire.js';

/**
 * Why the channel ended, as a typed reason rather than a silent hang.
 *
 * `remote` covers both a peer that said goodbye and a wire that died under an
 * in-flight command; `timeout` is the close handshake giving up.
 *
 * @public
 */
export type AgentChannelCloseReason = {
  readonly origin: 'local' | 'remote' | 'timeout';
  /**
   * The channel's own bye reason, verbatim — `@taucad/rpc` reports a dead port
   * as `port-closed`. Absent when neither side named one.
   */
  readonly reason?: string | undefined;
  /** The same fact, phrased for a human. */
  readonly message: string;
};

/** A command that could not be delivered, carrying why. @public */
export class AgentChannelError extends Error {
  public readonly code: string;

  public readonly closeReason: AgentChannelCloseReason | undefined;

  public constructor(code: string, message: string, closeReason?: AgentChannelCloseReason) {
    super(message);
    this.name = 'AgentChannelError';
    this.code = code;
    this.closeReason = closeReason;
  }
}

/** Options for {@link createAgentChannelClient}. @public */
export type AgentChannelClientOptions = {
  /** Context label carried on every dispatch; defaults to `tau-agent`. */
  readonly sessionKey?: string | undefined;
};

/** One connection to a daemon speaking the T0 vocabulary. @public */
export type AgentChannelClient = {
  /**
   * Issue one command and await its projection.
   *
   * `signal` is the caller's deadline: aborting it cancels the request on the
   * far side and rejects here, so a host that stops answering surfaces as a
   * typed failure instead of a pending promise.
   */
  execute(command: AgentChannelCommand, signal?: AbortSignal): Promise<AgentChannelResponse>;
  /** Durable events for every chat this daemon owns. */
  events(signal?: AbortSignal): AsyncIterable<AgentChannelEvent>;
  /** Ephemeral model deltas for every chat this daemon owns. */
  liveEvents(signal?: AbortSignal): AsyncIterable<AgentChannelLiveEvent>;
  /** Subscribe to the typed close reason. Fires once; returns an unsubscribe. */
  onClose(handler: (reason: AgentChannelCloseReason) => void): () => void;
  /** Say goodbye and tear down this connection. Idempotent. */
  close(reason?: string): void;
};

const closeMessages = {
  local: 'This connection to the agent host was closed.',
  remote: 'The agent host closed this connection.',
  timeout: 'The agent host stopped answering this connection.',
} as const;

/**
 * Open one T0 agent channel over any supported endpoint.
 *
 * A socket endpoint must be handed over *before* `open`: the server posts its
 * hello the instant the upgrade completes, and a listener attached later never
 * sees it. `agentChannelPort` buffers in both directions from the moment it is
 * called, so passing an unopened socket straight in is the correct usage.
 *
 * @param endpoint - Socket, message port, or already-wrapped port.
 * @param options - Optional context label.
 * @returns A client bound to this one connection.
 * @public
 *
 * @example <caption>Dial a daemon from a page</caption>
 * ```typescript
 * import { createAgentChannelClient } from '@taucad/agent-host/channel-client';
 *
 * const client = createAgentChannelClient(new WebSocket('wss://host.example/agent'));
 * client.onClose((reason) => {
 *   console.warn(reason.origin, reason.message);
 * });
 * const answer = await client.execute({ type: 'resume', chatId: 'chat-1' });
 * ```
 */
export const createAgentChannelClient = (
  endpoint: AgentChannelEndpoint,
  options: AgentChannelClientOptions = {},
): AgentChannelClient => {
  const port = agentChannelPort(endpoint, 'agent-channel-client');
  const channel: Channel<AgentChannelProtocol> = createChannelClient<AgentChannelProtocol>({
    port,
    sessionKey: options.sessionKey ?? 'tau-agent',
    protocolSchemas: agentChannelProtocolSchemas,
  });

  /* Recorded before any consumer handler runs (this subscription is the first
   * one registered), so a command rejected by the close teardown can already
   * name the reason it died of. */
  let closed: AgentChannelCloseReason | undefined;
  channel.onClose((info) => {
    closed = {
      origin: info.origin,
      ...(info.reason === undefined ? {} : { reason: info.reason }),
      message: closeMessages[info.origin],
    };
    /* The channel's own close only stops dispatch; the wire underneath is this
     * client's to release. */
    try {
      port.close();
    } catch {
      // A port that is already gone is the outcome we wanted.
    }
  });

  const deliveryFailure = (error: unknown): AgentChannelError => {
    if (error instanceof AgentChannelError) {
      return error;
    }
    if (closed) {
      return new AgentChannelError('CHANNEL_CLOSED', closed.message, closed);
    }
    const code = error instanceof Error && 'code' in error ? error.code : undefined;
    return new AgentChannelError(
      typeof code === 'string' ? code : 'AGENT_COMMAND_FAILED',
      error instanceof Error ? error.message : String(error),
    );
  };

  const listen = async function* listenStream<Name extends 'events' | 'liveEvents'>(
    name: Name,
    signal?: AbortSignal,
  ): AsyncGenerator<AgentChannelProtocol['listens'][Name]['event']> {
    try {
      yield* channel.listen(name, undefined, signal);
    } catch (error) {
      if (signal?.aborted) {
        return;
      }
      throw deliveryFailure(error);
    }
  };

  return {
    execute: async (command, signal) => {
      if (closed) {
        throw new AgentChannelError('CHANNEL_CLOSED', closed.message, closed);
      }
      try {
        return await channel.call('request', command, signal);
      } catch (error) {
        throw deliveryFailure(error);
      }
    },
    events: (signal) => listen('events', signal),
    liveEvents: (signal) => listen('liveEvents', signal),
    onClose: (handler) =>
      channel.onClose((info) => {
        handler(closed ?? { origin: info.origin, message: closeMessages[info.origin] });
      }),
    close: (reason) => {
      channel.close(reason);
    },
  };
};
