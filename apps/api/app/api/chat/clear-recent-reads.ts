/**
 * @file Clears every `read_file` dedup pointer for a chat from the LangGraph
 * auxiliary store. Used by the compaction middleware after the message tail
 * is summarised — pointers referencing now-evicted `ToolMessage`s would
 * otherwise route the next `read_file` call to a stale
 * `fileUnchangedMarker(priorToolCallId)` that no longer exists in state.
 *
 * Two execution paths:
 *
 * - **Redis fast path**: when the store is a
 *   {@link import('#api/chat/redis-read-dedup-store.js').RedisReadDedupStore}
 *   we dispatch a single `SCAN MATCH ... DEL` pipeline. O(n) on the prefix.
 * - **Generic fallback**: `search(namespace)` returns every item below the
 *   chat-level namespace prefix; we then issue parallel `delete` calls. Used
 *   by `InMemoryStore` under test and any future `BaseStore` variant that
 *   lacks the bulk-clear shortcut.
 */
import type { BaseStore } from '@langchain/langgraph';
import { recentReadsRootNamespace } from '#api/chat/recent-reads-namespace.js';

const isClearable = (store: BaseStore): store is BaseStore & { clearChat(chatId: string): Promise<number> } =>
  'clearChat' in store && typeof (store as { clearChat: unknown }).clearChat === 'function';

/**
 * Clear every dedup pointer under `(recent_reads, chatId)`. No-op when the
 * store is null/undefined (the rest of the agent still works — `read_file`
 * just stops deduplicating, which is the correct degraded behaviour).
 */
export const clearReadDedupForChat = async (store: BaseStore | undefined, chatId: string): Promise<void> => {
  if (!store) {
    return;
  }
  if (isClearable(store)) {
    await store.clearChat(chatId);
    return;
  }

  const namespace = [...recentReadsRootNamespace, chatId];
  const items = await store.search(namespace);
  await Promise.all(items.map(async (item) => store.delete(item.namespace, item.key)));
};
