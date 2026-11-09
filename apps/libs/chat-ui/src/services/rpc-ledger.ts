/**
 * In-memory record of Socket.IO RPC outcomes keyed by assistant tool-call id so
 * `finalizeInterruptedToolParts` preserves tools that settled before interrupt.
 *
 * Bridges the transport gap unique to Tau: the LangGraph agent runs on the API,
 * but mutating tools execute in the browser via Socket.IO RPC. When the SSE
 * stream is cancelled after the RPC settled but before the matching
 * `tool-output-available` chunk is delivered, the ledger lets the UI recover
 * the real outcome instead of stamping `USER_INTERRUPTED` over a real success
 * or a real RPC-side failure.
 */
import type { RpcClientErrorCode } from '@taucad/chat';

/**
 * Entry lifetime after settlement before automatic eviction. Milliseconds.
 *
 * The actual consumer (`finalizeInterruptedToolParts`) fires within
 * milliseconds of stream finalization, so 10s is a generous buffer for
 * tab-suspended scenarios where finalization is deferred. Smaller than the
 * prior 60s to keep idle ledger entries from lingering — namespace cleanup
 * on `release()` already covers session disposal, this TTL is the safety
 * net for streams that finalize successfully but never read the entry back.
 */
const rpcLedgerEntryTtl = 10_000;

export type RpcOutcome =
  | { kind: 'success'; output: unknown }
  | { kind: 'error'; errorCode: RpcClientErrorCode; message: string };

type LedgerEntry = { outcome: RpcOutcome; settledAt: number };

const ledgerByChatId = new Map<string, Map<string, LedgerEntry>>();

function pruneExpiredEntries(chatId: string): void {
  const ledger = ledgerByChatId.get(chatId);
  if (!ledger) {
    return;
  }

  const cutoff = Date.now() - rpcLedgerEntryTtl;
  for (const [toolCallId, entry] of ledger) {
    if (entry.settledAt < cutoff) {
      ledger.delete(toolCallId);
    }
  }

  if (ledger.size === 0) {
    ledgerByChatId.delete(chatId);
  }
}

/** Records the outcome of an RPC tied to {@link toolCallId}. */
export function recordRpcOutcome(chatId: string, toolCallId: string, outcome: RpcOutcome): void {
  pruneExpiredEntries(chatId);
  let ledger = ledgerByChatId.get(chatId);
  if (!ledger) {
    ledger = new Map();
    ledgerByChatId.set(chatId, ledger);
  }

  ledger.set(toolCallId, { outcome, settledAt: Date.now() });
}

/** Lookup a recorded outcome after pruning stale entries for the chat. */
export function getRpcOutcome(chatId: string, toolCallId: string): RpcOutcome | undefined {
  pruneExpiredEntries(chatId);
  return ledgerByChatId.get(chatId)?.get(toolCallId)?.outcome;
}

/** Removes every entry for {@link chatId} (e.g. session disposal). */
export function clearLedger(chatId: string): void {
  ledgerByChatId.delete(chatId);
}
