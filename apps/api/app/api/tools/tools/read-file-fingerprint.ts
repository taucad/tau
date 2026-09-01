/**
 * @file Stable identifier for `read_file` invocations.
 *
 * Centralising the shape keeps the dedup write path (in
 * {@link import('#api/tools/tools/tool-read-file.js').readFileTool}) and the
 * compaction-time clear path (in
 * {@link import('#api/chat/middleware/compaction.middleware.js')}) in
 * lockstep, and ensures the key encoded in
 * {@link import('#api/chat/redis-read-dedup-store.js').RedisReadDedupStore}
 * matches the one used to look up a prior `tool_call_id`.
 */

/**
 * Stable, JSON-serialisable identifier for a `read_file` invocation. Composed
 * of `${targetFile}:${offset ?? 1}:${limit ?? -1}` so identical re-reads share
 * a key while different ranges stay distinct.
 *
 * @public
 */
export type ReadFingerprint = string;

/**
 * Builds the canonical {@link ReadFingerprint} from a `read_file` invocation.
 *
 * @public
 */
export const buildReadFingerprint = (input: { targetFile: string; offset?: number; limit?: number }): ReadFingerprint =>
  `${input.targetFile}:${input.offset ?? 1}:${input.limit ?? -1}`;
