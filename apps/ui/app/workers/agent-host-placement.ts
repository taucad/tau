import type { TurnPlacementPort } from '@taucad/agent-host';
import type { TurnPlacementChannel } from '@taucad/agent-host/channel-client';

/** Milliseconds a placement call waits for the page to reconnect its project authority. */
const recoveryBound = 15_000;
const isAborted = (signal: AbortSignal): boolean => signal.aborted;
type CloseInfo = Parameters<Parameters<TurnPlacementChannel['onClose']>[0]>[0];

/** Keep attempt identities and settlement listeners across replacement of a project's placement session. */
export const createResidentPlacement = (
  initial: TurnPlacementChannel,
  requestRecovery: () => void = () => undefined,
): Readonly<{
  port: TurnPlacementPort;
  needsRecovery: () => boolean;
  invalidate: () => void;
  replace: (channel: TurnPlacementChannel) => void;
  close: () => void;
}> => {
  const hostLifetime = new AbortController();
  const generation = (channel: TurnPlacementChannel) => ({
    channel,
    changed: Promise.withResolvers<void>(),
    replaced: new AbortController(),
    closed: false,
    closeInfo: undefined as CloseInfo | undefined,
  });
  let current = generation(initial);
  let automaticRecovery = true;
  const watch = (entry: typeof current): void => {
    entry.channel.onClose((info) => {
      entry.closeInfo = info;
      entry.closed = true;
      if (entry === current && !hostLifetime.signal.aborted && automaticRecovery) {
        automaticRecovery = false;
        requestRecovery();
      }
    });
  };
  watch(current);

  const next = async (previous: typeof current, signal: AbortSignal): Promise<void> => {
    signal.throwIfAborted();
    if (current !== previous) {
      return;
    }
    await new Promise<void>((resolve, reject) => {
      const aborted = (): void => {
        reject(signal.reason instanceof Error ? signal.reason : new Error('Placement recovery was cancelled.'));
      };
      signal.addEventListener('abort', aborted, { once: true });
      // async-iife: bootstrap -- settle a cancellable generation wait; both paths release the abort listener.
      void previous.changed.promise.then(() => {
        signal.removeEventListener('abort', aborted);
        resolve();
      });
    });
    signal.throwIfAborted();
  };

  const call = async <Result>(operation: (channel: TurnPlacementChannel) => Promise<Result>): Promise<Result> => {
    hostLifetime.signal.throwIfAborted();
    const before = current;
    if (before.closed) {
      requestRecovery();
    }
    try {
      const result = await operation(before.channel);
      if (current === before) {
        automaticRecovery = true;
      }
      return result;
    } catch (error) {
      // Only a closed connection has an unknown transport outcome; domain refusals are never retried.
      if (
        !(error instanceof Error) ||
        !('code' in error) ||
        !['CHANNEL_CLOSED', 'PEER_CLOSED', 'PEER_GONE', 'PEER_UNRESPONSIVE'].includes(String(error.code))
      ) {
        throw error;
      }
      try {
        await next(before, AbortSignal.any([hostLifetime.signal, AbortSignal.timeout(recoveryBound)]));
      } catch {
        throw Object.assign(error, {
          details: {
            phase: 'placement.reconnect',
            ...(before.closeInfo === undefined ? {} : { close: before.closeInfo }),
          },
        });
      }
      // Replay the same placement command once. This never restarts a model invocation.
      const replacement = current;
      try {
        const result = await operation(replacement.channel);
        if (current === replacement) {
          automaticRecovery = true;
        }
        return result;
      } catch (retryError) {
        if (retryError instanceof Error) {
          Object.assign(retryError, {
            details: {
              phase: 'placement.replay',
              ...(before.closeInfo === undefined ? {} : { close: before.closeInfo }),
              ...(replacement.closeInfo === undefined ? {} : { replayClose: replacement.closeInfo }),
            },
          });
        }
        throw retryError;
      }
    }
  };

  const port: TurnPlacementPort = {
    admit: async (input) => call(async (channel) => channel.admit(input)),
    complete: async (input) => call(async (channel) => channel.complete(input)),
    abandon: async (input) => call(async (channel) => channel.abandon(input)),
    acknowledge: async (input) => call(async (channel) => channel.acknowledge(input)),
    reconcile: async (input) => call(async (channel) => channel.reconcile(input)),
    settlements: async function* ({ signal }) {
      const watching = AbortSignal.any([signal, hostLifetime.signal]);
      while (!isAborted(watching)) {
        const before = current;
        try {
          yield* before.channel.settlements({ signal: AbortSignal.any([watching, before.replaced.signal]) });
        } catch (error) {
          if (isAborted(watching)) {
            return;
          }
          if (
            current === before &&
            (!(error instanceof Error) ||
              !('code' in error) ||
              !['CHANNEL_CLOSED', 'PEER_CLOSED', 'PEER_GONE', 'PEER_UNRESPONSIVE'].includes(String(error.code)))
          ) {
            throw error;
          }
        }
        if (isAborted(watching)) {
          return;
        }
        // The new session replays unacknowledged settlements, including a lost complete response.
        try {
          // oxlint-disable-next-line no-await-in-loop -- one subscription per authority generation.
          await next(before, watching);
        } catch (error) {
          if (!isAborted(watching)) {
            throw error;
          }
        }
      }
    },
  };
  return {
    port,
    needsRecovery: (): boolean => current.closed,
    invalidate: (): void => {
      current.channel.close('replacement bridges failed');
    },
    replace: (channel: TurnPlacementChannel): void => {
      const previous = current;
      current = generation(channel);
      watch(current);
      previous.changed.resolve();
      previous.replaced.abort();
      previous.channel.close('placement session replaced');
    },
    close: (): void => {
      hostLifetime.abort();
      current.changed.resolve();
      current.channel.close('project host closed');
    },
  };
};
