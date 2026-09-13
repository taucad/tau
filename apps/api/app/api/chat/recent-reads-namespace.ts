/**
 * @file Shared namespace prefix for `read_file` dedup pointers in the
 * LangGraph auxiliary store.
 *
 * Every entry is keyed as `(recentReadsRootNamespace + [chatId], fingerprint)`
 * — the readFile tool writes here, the compaction middleware clears here, and
 * the Redis adapter encodes the path on the wire as
 * `recent_reads:{chatId}:{fingerprint}`. Centralising the prefix prevents
 * silent drift between writers and readers.
 */

/**
 * Root namespace shared by every read-dedup entry. Suffixed with the chat id
 * at the call site so dedup state is partitioned per conversation.
 *
 * @public
 */
export const recentReadsRootNamespace = ['recent_reads'] as const;
