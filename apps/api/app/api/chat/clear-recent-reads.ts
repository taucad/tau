/**
 * @file Clears every `read_file` dedup pointer for a chat from the LangGraph
 * auxiliary store. Used by the compaction middleware after the message tail
 * is summarised — pointers referencing now-evicted `ToolMessage`s would
 * otherwise route the next `read_file` call to a stale
 * `fileUnchangedMarker(priorToolCallId)` that no longer exists in state.
 *
 * The cleanup is a Tau-owned sidecar maintenance capability, not a generic
 * LangGraph `BaseStore.search` operation. Production Redis intentionally does
 * not implement search; callers must pass the raw clearer that owns the
 * chat-level bulk-delete operation.
 */

export type ReadDedupClearer = {
  clearChat(chatId: string): Promise<number>;
};

export class MissingReadDedupClearerError extends Error {
  public constructor(chatId: string) {
    super(
      `Read-dedup clear requested after compaction for chat ${chatId}, but no ReadDedupClearer was wired. This is an implementation bug; pass StoreService.getReadDedupClearer() into createCompactionMiddleware.`,
    );
    this.name = 'MissingReadDedupClearerError';
  }
}

export type ClearReadDedupForChatOptions = {
  chatId: string;
  readDedupClearer?: ReadDedupClearer;
  storeActive: boolean;
};

/**
 * Clear every dedup pointer under `(recent_reads, chatId)`. No-op when the
 * store is null/undefined (the rest of the agent still works — `read_file`
 * just stops deduplicating, which is the correct degraded behaviour).
 */
export const clearReadDedupForChat = async ({
  chatId,
  readDedupClearer,
  storeActive,
}: ClearReadDedupForChatOptions): Promise<void> => {
  if (!storeActive) {
    return;
  }
  if (!readDedupClearer) {
    throw new MissingReadDedupClearerError(chatId);
  }
  await readDedupClearer.clearChat(chatId);
};
