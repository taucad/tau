/**
 * Marker prefix the tool-result offloading middleware writes into a deduped
 * `read_file` tool result.
 *
 * Three call sites consume this marker:
 *
 * - The API offloading middleware writes `fileUnchangedMarker.build(priorId)`
 *   into `ToolMessage.content` when a `read_file` call hits a stable
 *   `(targetFile, offset, limit, modifiedAt)` fingerprint that was already
 *   read in the same chat — the substitution skips persisting the file again
 *   and keeps the prompt cache stable.
 * - The UI's `chat-message-tool-read-file.tsx` calls
 *   `fileUnchangedMarker.matches(part.output.content)` to swap the row's verb
 *   to "Re-read, cached" and apply a dimmed body, mirroring claude-code's
 *   `<Text dimColor>Unchanged since last read</Text>`.
 * - The activity-group rollup in `assistant-message-activity.ts` counts how
 *   many reads carry the marker and surfaces an `(M cached)` suffix.
 *
 * The full marker body also gives the LLM explicit guidance to refer back to
 * the prior tool result rather than re-issuing the same `read_file` call.
 *
 * @public
 */
export const fileUnchangedMarker = {
  prefix: '[File unchanged since last read',
  build: (priorToolCallId: string): string =>
    `${fileUnchangedMarker.prefix} in tool_call ${priorToolCallId}. ` +
    `Refer to the earlier read_file output in this conversation.]`,
  matches: (content: string): boolean => content.startsWith(fileUnchangedMarker.prefix),
} as const;
