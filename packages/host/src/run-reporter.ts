import { followChat } from '@taucad/agent-host';
import type { AgentLogEvent, ChatLedger, ChatRead } from '@taucad/agent-host';
import { commandPayloads } from '@taucad/agent-host/wire';
import type { CommandAnswer, CommandVerb } from '@taucad/agent-host/wire';

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
  /** The launcher's long-poll read of one chat's durable rows. */
  readonly read: ChatRead;
  /** Put one frame on the control socket. May throw when the socket is gone. */
  readonly send: (frame: HostControlOutbound) => void;
};

/** A running reporter. @public */
export type RunReporter = {
  /**
   * Follow one chat's runs, from the start of its log. Idempotent per chat.
   *
   * Called for every chat a command names. A replayed prefix
   * re-reports only the states the directory already holds, and the directory
   * keeps the newer `updatedAt`.
   */
  watch(chatId: string): void;
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
 * The launcher's durable rows are the only input, pulled per chat with the
 * same `read` a client uses: a state that reaches a client has, by
 * construction, already reached the disk. Nothing but `run.lifecycle` is read,
 * so no message, tool call or transcript can leak into a control frame even by
 * accident (PH19: the API keeps a directory, never content).
 *
 * A send failure is swallowed on purpose. The control socket comes and goes —
 * every relay reconnect replaces it — and a run must never stop because its
 * *directory* could not be updated; the next transition re-reports, and a
 * missing row is recoverable while a stalled run is not.
 *
 * @param options - The chat read and the control-socket sender.
 * @returns A handle that follows chats and stops reporting.
 * @public
 *
 * @example <caption>Report a daemon's runs</caption>
 * ```typescript
 * import { startRunReporter } from '@taucad/host';
 * import type { NodeAgentLauncher } from '@taucad/agent-host/node-launcher';
 *
 * declare const launcher: NodeAgentLauncher;
 * declare const send: (frame: unknown) => void;
 * const reporter = startRunReporter({ read: launcher.read, send });
 * reporter.watch('chat-1');
 * reporter.close();
 * ```
 */
export const startRunReporter = (options: RunReporterOptions): RunReporter => {
  const controller = new AbortController();
  /* Last reported state per run: a reconnecting client replays the log from its
   * cursor, and a directory that re-reported every replayed prefix would write
   * one row per reader rather than one per transition. */
  const reported = new Map<string, Readonly<{ state: HostRunState; at: string }>>();
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
  const watched = new Set<string>();
  /** Chats named again while their follow was ending: followed once more, so a run admitted in its final read is not
   * dropped (W4.r2). */
  const again = new Set<string>();
  const pump = async (chatId: string): Promise<void> => {
    /* A chat's pull ends once caught up and its current run is terminal, or it has none; the next command that names
     * the chat watches it again. */
    const until = (ledger: ChatLedger): boolean => {
      if (ledger.currentRunId === undefined) {
        return true;
      }
      const lifecycle = ledger.runs[ledger.currentRunId]?.lifecycle;
      return lifecycle === 'completed' || lifecycle === 'failed' || lifecycle === 'cancelled';
    };
    for await (const { events } of followChat(options.read, chatId, { signal: controller.signal, until })) {
      // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- in-process rows are the launcher's own log events.
      for (const event of events as readonly AgentLogEvent[]) {
        if (event.type !== 'run.lifecycle') {
          continue;
        }
        const state = directoryState[event.state];
        const prior = reported.get(event.runId);
        // A re-followed chat replays from row 0: a transition at or before the last one reported is not news.
        if (!state || (prior !== undefined && (prior.state === state || prior.at >= event.recordedAt))) {
          continue;
        }
        reported.set(event.runId, { state, at: event.recordedAt });
        deliver({ v: 1, type: 'run', runId: event.runId, chatId, state, updatedAt: event.recordedAt });
      }
    }
  };
  const watch = (chatId: string): void => {
    if (watched.has(chatId)) {
      again.add(chatId);
      return;
    }
    watched.add(chatId);
    // async-iife: bootstrap -- the pull ends with the run or the launcher; `close()` is the only settlement a caller has.
    void (async (): Promise<void> => {
      try {
        await pump(chatId);
      } catch {
        /* The launcher closed under the read; there is nothing left to report to. */
      }
      watched.delete(chatId);
      if (again.delete(chatId) && !controller.signal.aborted) {
        watch(chatId);
      }
    })();
  };
  return {
    watch,
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

/**
 * The chat an answered command names, when the reporter should follow it: a command whose payload parses and that was
 * not refused. `attach` only reads (W4.r1), unless it took over a run a restart left open, which it records `failed`
 * (W4.r2).
 *
 * @param command - The command as the daemon received it, not yet parsed.
 * @param answer - The command's answer.
 * @returns The chat to watch, if any.
 * @public
 */
export const chatToReport = (
  command: Readonly<{ type: string; payload?: unknown }>,
  answer: CommandAnswer,
): string | undefined => {
  if (answer.status === 'refused' || !Object.hasOwn(commandPayloads, command.type)) {
    return undefined;
  }
  const takeover = 'details' in answer && answer.details['takeover'] === true;
  if (command.type === 'attach' && !takeover) {
    return undefined;
  }
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- narrowed by the hasOwn check above.
  const parsed = commandPayloads[command.type as CommandVerb].safeParse(command.payload);
  return parsed.success ? parsed.data.chatId : undefined;
};
