import { chatRunState, emptyChatLedger, foldChatLedger } from '#log/chat-ledger.js';
import { parseEventLogBytes } from '#log/serialization.js';

/** A run a chat's own log holds that has not ended. @public */
export type UnsettledLogRun = Readonly<{ runId: string; state: 'admitted' | 'running' | 'paused' }>;

/**
 * The run a chat's log holds that has not ended, read from the log's bytes alone: no host, writer or lock (W30).
 *
 * The log is parsed as a writer's open parses it (a torn final line is dropped) and folded through the same ledger, so
 * a run this answers `undefined` for is one the host itself would find settled. A run whose driver is gone still reads
 * here as unsettled until a host claims the chat and records it abandoned: only the driver or that claim settles it.
 *
 * @param bytes - The chat's own log (`events.jsonl`), as it is now; empty when it has none.
 * @returns The current run when it is admitted, running or paused; `undefined` when there is none or it ended.
 * @public
 *
 * @example <caption>Whether a closed chat's log still holds a run</caption>
 * ```typescript
 * import { unsettledLogRun } from '@taucad/agent-host';
 *
 * declare const bytes: Uint8Array<ArrayBuffer>;
 * const run = unsettledLogRun(bytes);
 * ```
 */
export const unsettledLogRun = (bytes: Uint8Array<ArrayBuffer>): UnsettledLogRun | undefined => {
  if (bytes.byteLength === 0) {
    return undefined;
  }
  const ledger = foldChatLedger(emptyChatLedger, parseEventLogBytes(bytes).events);
  const state = chatRunState(ledger);
  if (state === 'none' || state === 'terminal' || ledger.currentRunId === undefined) {
    return undefined;
  }
  return { runId: ledger.currentRunId, state };
};
