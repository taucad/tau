/**
 * How the chat store describes a failed presentation (a run watch or a transcript read), and whether it is retried.
 *
 * @module
 */
import { UIMessageStreamError } from 'ai';

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
  const decode = UIMessageStreamError.isInstance(error);
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
 * Log one presentation diagnostic with its facts as JSON text: the desktop forwards a renderer warning as the
 * console's flattened text, where an object argument reads only `[object Object]`.
 *
 * @param label - The diagnostic's fixed label.
 * @param facts - Its facts.
 * @public
 */
export const warnPresentation = (label: string, facts: Readonly<Record<string, unknown>>): void => {
  console.warn(label, JSON.stringify(facts));
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
  if (UIMessageStreamError.isInstance(error)) {
    return false;
  }
  const code = presentationErrorCode(error);
  return (
    (code !== undefined && transientPresentationCodes.has(code)) ||
    (error instanceof Error && (error.name === 'AbortError' || error.name === 'ChannelClosedError'))
  );
};
