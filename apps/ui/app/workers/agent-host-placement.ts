import type { TurnPlacementPort } from '@taucad/agent-host';
import type { TurnPlacementChannel } from '@taucad/agent-host/channel-client';

/** Milliseconds a placement call waits for the page to reconnect its project authority. */
const recoveryBound = 15_000;
const isAborted = (signal: AbortSignal): boolean => signal.aborted;
export type PlacementDiagnostic = {
  event: 'placement.closed' | 'placement.replaced' | 'placement.disposed' | 'placement.recovery-failed';
  generation: number;
  previousGeneration?: number;
  origin?: 'local' | 'remote' | 'timeout';
  code?: string;
  reason?: string;
};

type CloseInfo = Parameters<Parameters<TurnPlacementChannel['onClose']>[0]>[0];

/** Keep attempt identities and settlement listeners across replacement of a project's placement session. */
export const createResidentPlacement = (
  initial: TurnPlacementChannel,
  requestRecovery: () => void = () => undefined,
  observe: (event: PlacementDiagnostic) => void = () => undefined,
): Readonly<{
  port: TurnPlacementPort;
  needsRecovery: () => boolean;
  invalidate: () => void;
  replace: (channel: TurnPlacementChannel) => void;
  close: () => void;
}> => {
  const hostLifetime = new AbortController();
  let generationNumber = 0;
  const report = (event: PlacementDiagnostic): void => {
    try {
      observe(event);
    } catch {
      /* Diagnostics never change placement outcomes. */
    }
  };
  const generation = (channel: TurnPlacementChannel) => ({
    channel,
    number: ++generationNumber,
    changed: Promise.withResolvers<void>(),
    replaced: new AbortController(),
    closed: false,
    closeInfo: undefined as CloseInfo | undefined,
  });
  let current = generation(initial);
  let automaticRecovery = true;
  const watch = (entry: typeof current): void => {
    entry.channel.onClose((info) => {
      if (entry.closed) {
        return;
      }
      if (entry === current && !hostLifetime.signal.aborted) {
        report({ event: 'placement.closed', generation: entry.number, ...info });
      }
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
        report({ event: 'placement.recovery-failed', generation: before.number });
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
        report({ event: 'placement.recovery-failed', generation: replacement.number });
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
    async *settlements({ signal }) {
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
      report({ event: 'placement.replaced', generation: current.number, previousGeneration: previous.number });
      watch(current);
      previous.changed.resolve();
      previous.replaced.abort();
      previous.channel.close('placement session replaced');
    },
    close: (): void => {
      if (hostLifetime.signal.aborted) {
        return;
      }
      report({ event: 'placement.disposed', generation: current.number });
      hostLifetime.abort();
      current.changed.resolve();
      current.channel.close('project host closed');
    },
  };
};
