import type { AgentChannelClient } from '@taucad/agent-host';
import type { AgentHostTransport } from '#services/agent-host-transport.js';

/** Read through a call, so a check after an `await` is not narrowed by the one before it. */
const isAborted = (signal: AbortSignal): boolean => signal.aborted;

/** Resubscriptions of a live stream after its connection died, before the stream ends (T9 E7's budget). */
const liveResubscribeLimit = 5;

/**
 * Drive the shared agent-host client over a paired daemon's agent channel.
 *
 * The daemon owns its workspace, its tools and its credentials: nothing here
 * initializes it, transfers a filesystem bridge, or claims workspace authority.
 * That asymmetry is the whole reason the transport seam exists.
 *
 * **The channel client heals the wire.** A relayed channel does not outlive its
 * relay session, and a run does not end when the socket does. The client redials
 * through the placement (T9 E7) and re-sends every unanswered command with its
 * key, so the daemon's applied set answers one that already landed `replayed`;
 * reads redial on their next call, from the reader's own cursor. Only when the
 * redial budget is spent does a command reject, with the channel's close code.
 *
 * @param source - The placement's channel client, or how to open it; its first
 *   dial's refusal reaches the caller verbatim.
 * @returns A transport `createAgentHostClient` cannot tell from the worker's.
 * @public
 */
export const createDaemonAgentHostTransport = (
  source: AgentChannelClient | (() => Promise<AgentChannelClient>),
): AgentHostTransport => {
  let disposed = false;
  let client: AgentChannelClient | undefined;
  const open = async (): Promise<AgentChannelClient> => {
    const next = typeof source === 'function' ? await source() : source;
    client = next;
    if (disposed) {
      next.close();
    }
    return next;
  };
  const opened = open();
  const channel = async (): Promise<AgentChannelClient> => opened;

  return {
    /* A daemon is configured from its own CLI; there is nothing to initialize —
     * readiness is just the placement's dial, and its refusal reaches whoever
     * awaits a command, verbatim (the same shape the worker transport uses). */
    ready: (async () => {
      await opened;
    })(),
    execute: async (command, signal) => {
      const next = await channel();
      return next.execute(signal === undefined ? command : { ...command, signal });
    },
    read: async (input) => {
      const next = await channel();
      return next.read(input);
    },
    catchUp: async function* catchUp(input) {
      const next = await channel();
      for await (const frame of next.catchUp(input)) {
        yield frame;
      }
    },
    liveEvents: async function* liveEvents(chatId, signal) {
      const live = await channel();
      let closes = 0;
      const offClose = live.onClose(() => {
        closes += 1;
      });
      try {
        for (let resubscribed = 0; !signal.aborted; resubscribed += 1) {
          const before = closes;
          try {
            // oxlint-disable-next-line no-await-in-loop -- one subscription at a time, by construction.
            for await (const event of live.liveEvents({ chatId, signal })) {
              resubscribed = 0;
              yield event;
            }
          } catch (error) {
            if (isAborted(signal)) {
              return;
            }
            if (closes === before || resubscribed >= liveResubscribeLimit) {
              throw error;
            }
            continue;
          }
          /* The host ended the stream itself, or the wire died under it: only the second is resubscribed, on the
           * connection the client redials. */
          if (closes === before || resubscribed >= liveResubscribeLimit) {
            return;
          }
        }
      } finally {
        offClose();
      }
    },
    close: () => {
      disposed = true;
      // Teardown is local: the daemon keeps running, which is the point of it.
      client?.close();
    },
  };
};
