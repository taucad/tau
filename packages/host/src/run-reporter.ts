import type { AgentChannelEvent } from '@taucad/agent-host';

import type { HostControlOutbound, HostRunState } from '#host.schemas.js';

/**
 * The log's lifecycle vocabulary, mapped to the directory's.
 *
 * Only `paused` differs, and deliberately: inside the log it means the run's
 * own execution is suspended, while a client reading the directory needs to
 * know *why* — an approval it can act on, not a stall.
 */
const directoryState: Readonly<Record<string, HostRunState>> = {
  admitted: 'admitted',
  running: 'running',
  paused: 'awaiting-approval',
  completed: 'completed',
  failed: 'failed',
  cancelled: 'cancelled',
};

/** Options for {@link startRunReporter}. @public */
export type RunReporterOptions = {
  /** The launcher's durable event stream for every chat it owns. */
  readonly events: (signal: AbortSignal) => AsyncIterable<AgentChannelEvent>;
  /** Put one frame on the control socket. May throw when the socket is gone. */
  readonly send: (frame: HostControlOutbound) => void;
};

/** A running reporter. @public */
export type RunReporter = {
  /**
   * Re-send every state whose frame did not reach the relay.
   *
   * Called when a control connection is (re)established. Without it the
   * directory permanently misses any run that changed state while the socket
   * was down — which is precisely the always-on case a cloud host exists for:
   * the client is gone, the relay reconnects, and the run completed in between.
   */
  flush(): void;
  close(): void;
};

/**
 * Report this host's run lifecycle to the API's run directory.
 *
 * The launcher's durable stream is the only input, because it is the same
 * stream the log is written from: a state that reaches a client has, by
 * construction, already reached the disk. Nothing but `run.lifecycle` is read,
 * so no message, tool call or transcript can leak into a control frame even by
 * accident (PH19: the API keeps a directory, never content).
 *
 * A send failure is swallowed on purpose. The control socket comes and goes —
 * every relay reconnect replaces it — and a run must never stop because its
 * *directory* could not be updated; the next transition re-reports, and a
 * missing row is recoverable while a stalled run is not.
 *
 * @param options - The event stream and the control-socket sender.
 * @returns A handle that stops reporting.
 * @public
 *
 * @example <caption>Report a daemon's runs</caption>
 * ```typescript
 * import { startRunReporter } from '@taucad/host';
 * import type { NodeAgentLauncher } from '@taucad/agent-host/node-launcher';
 *
 * declare const launcher: NodeAgentLauncher;
 * declare const send: (frame: unknown) => void;
 * const reporter = startRunReporter({ events: (signal) => launcher.events(signal), send });
 * reporter.close();
 * ```
 */
export const startRunReporter = (options: RunReporterOptions): RunReporter => {
  const controller = new AbortController();
  /* Last reported state per run: a reconnecting client replays the log from its
   * cursor, and a directory that re-reported every replayed prefix would write
   * one row per reader rather than one per transition. */
  const reported = new Map<string, HostRunState>();
  /** Frames the control socket did not take, kept until it does. */
  const undelivered = new Map<string, Extract<HostControlOutbound, { readonly type: 'run' }>>();
  const deliver = (frame: Extract<HostControlOutbound, { readonly type: 'run' }>): void => {
    try {
      options.send(frame);
      undelivered.delete(frame.runId);
    } catch {
      undelivered.set(frame.runId, frame);
    }
  };
  const pump = async (): Promise<void> => {
    for await (const { chatId, event } of options.events(controller.signal)) {
      if (event.type !== 'run.lifecycle') {
        continue;
      }
      const state = directoryState[event.state];
      if (!state || reported.get(event.runId) === state) {
        continue;
      }
      reported.set(event.runId, state);
      deliver({ v: 1, type: 'run', runId: event.runId, chatId, state, updatedAt: event.recordedAt });
    }
  };
  // async-iife: bootstrap -- the stream ends with the launcher; `close()` is the only settlement a caller has.
  void (async (): Promise<void> => {
    try {
      await pump();
    } catch {
      /* The stream ends with the launcher; there is nothing left to report to. */
    }
  })();
  return {
    flush(): void {
      const pending = [...undelivered.values()];
      for (const frame of pending) {
        deliver(frame);
      }
    },
    close(): void {
      controller.abort();
    },
  };
};
