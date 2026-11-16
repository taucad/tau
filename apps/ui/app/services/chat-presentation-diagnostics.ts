/**
 * How the chat store logs its diagnostics, describes a failed presentation (a run watch or a transcript read), and
 * whether it is retried.
 *
 * @module
 */
/**
 * Whether the AI SDK's stream reader refused a chunk. Matched by the SDK's stable error name, so this module never
 * loads `ai`, a heavy module the critical path defers.
 */
const isStreamDecodeError = (
  error: unknown,
): error is Error & { readonly chunkId?: string; readonly chunkType?: string } =>
  error instanceof Error && error.name === 'AI_UIMessageStreamError';

/** A failure's string `code`, as Tau's channel and host errors carry it. */
const presentationErrorCode = (error: unknown): string | undefined => {
  const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
  return typeof code === 'string' ? code : undefined;
};

/** A failure's name and code, without its message. */
const presentationErrorLabel = (error: unknown): string => {
  const name = error instanceof Error ? error.name : 'UnknownError';
  const code = presentationErrorCode(error);
  return code === undefined ? name : `${name} (${code})`;
};

/**
 * Describe a failed SDK frame without exposing tool inputs, outputs, or exception payloads.
 *
 * A message is kept only when the SDK's stream decoder or a coded Tau error wrote it: those name ids and states, while
 * an arbitrary exception's message can carry whatever payload it was thrown over. A cause is named, never quoted.
 *
 * @param error - What the watch or the transcript read rejected with.
 * @returns Facts safe to log.
 * @public
 */
export const presentationErrorFacts = (
  error: unknown,
): Readonly<{
  errorName: string;
  errorCode?: string;
  errorMessage?: string;
  errorCause?: string;
  chunkId?: string;
  chunkType?: string;
}> => {
  const decode = isStreamDecodeError(error);
  const code = presentationErrorCode(error);
  const cause = error instanceof Error ? error.cause : undefined;
  return {
    errorName: error instanceof Error ? error.name : 'UnknownError',
    ...(code === undefined ? {} : { errorCode: code }),
    ...(error instanceof Error && (decode || code !== undefined) ? { errorMessage: error.message } : {}),
    ...(cause === undefined ? {} : { errorCause: presentationErrorLabel(cause) }),
    ...(decode ? { chunkId: error.chunkId, chunkType: error.chunkType } : {}),
  };
};

/**
 * Log one chat store diagnostic with its facts as JSON text: the desktop forwards a renderer console line as the
 * console's flattened text, where an object argument reads only `[object Object]`.
 *
 * @param level - The console level.
 * @param label - The diagnostic's fixed label.
 * @param facts - Its facts, JSON-safe.
 * @public
 */
export const logFacts = (level: 'info' | 'warn', label: string, facts: Readonly<Record<string, unknown>>): void => {
  console[level](label, JSON.stringify(facts));
};

/**
 * Log one presentation diagnostic at warning level ({@link logFacts}).
 *
 * @param label - The diagnostic's fixed label.
 * @param facts - Its facts.
 * @public
 */
export const warnPresentation = (label: string, facts: Readonly<Record<string, unknown>>): void => {
  logFacts('warn', label, facts);
};

/** Channel and host closes that end one connection while the owner, and the run, carry on. */
const transientPresentationCodes: ReadonlySet<string> = new Set([
  'PEER_GONE',
  'PEER_CLOSED',
  'PEER_UNRESPONSIVE',
  'CHANNEL_CLOSED',
  'CLIENT_CLOSED',
  'LEADERSHIP_LOST',
]);

/**
 * Whether a presentation failure came from a connection being dropped or replaced rather than from the log itself.
 * Such a failure says nothing about the projected history, so it is retried; a decode failure, or any other, would
 * fail the same way again, so it is latched (`blockedPresentationRunId`, `failedTranscriptProjection`).
 *
 * @param error - What the watch or the transcript read rejected with.
 * @returns Whether to retry.
 * @public
 */
export const isTransientPresentationFailure = (error: unknown): boolean => {
  if (isStreamDecodeError(error)) {
    return false;
  }
  const code = presentationErrorCode(error);
  return (
    (code !== undefined && transientPresentationCodes.has(code)) ||
    (error instanceof Error && (error.name === 'AbortError' || error.name === 'ChannelClosedError'))
  );
};
