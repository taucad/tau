/**
 * Branded abort error and tracking utilities for chat request cancellation.
 *
 * When users cancel chat requests (stop button), LangGraph and provider SDK
 * internals can surface cancellation from request-local catch blocks or from
 * detached promises that reach the process-level unhandledRejection handler.
 * These utilities provide two layers of identification:
 *
 * 1. **Branded ChatAbortError** — used as the abort reason via
 *    `AbortController.abort(new ChatAbortError(chatId))`, making it accessible
 *    on `signal.reason`. The controller's catch block checks this directly.
 *
 * 2. **Abort tracker** — correlates generic transport-level AbortError
 *    rejections with known chat cancellations. Used by the process-level
 *    `unhandledRejection` handler when detached promises do not carry the
 *    original AbortSignal reason.
 */

/**
 * Module-private brand symbol. Because this is a non-global Symbol (not
 * `Symbol.for()`), it cannot be replicated or forged from outside this module.
 * Only instances created by ChatAbortError's constructor carry this property.
 */
const chatAbortBrand: unique symbol = Symbol('ChatAbortBrand');

/**
 * Branded error used as the abort reason when cancelling chat requests.
 *
 * Pass to `AbortController.abort(new ChatAbortError(chatId))` so the reason
 * is accessible on `signal.reason` for precise identification in catch blocks.
 */
export class ChatAbortError extends Error {
  public override readonly name = 'AbortError';

  public get kind(): 'chat-client-abort' {
    return 'chat-client-abort';
  }

  public get code(): 'CHAT_CLIENT_ABORT' {
    return 'CHAT_CLIENT_ABORT';
  }

  public get [chatAbortBrand](): true {
    return true;
  }

  public constructor(public readonly chatId: string) {
    super(`Chat ${chatId} was cancelled by client`);
  }
}

/**
 * Type guard that verifies the runtime brand symbol on the value.
 * Returns true only for instances created by this module's ChatAbortError
 * constructor — structural look-alikes from other modules will fail.
 */
export function isChatAbortError(value: unknown): value is ChatAbortError {
  return typeof value === 'object' && value !== null && chatAbortBrand in value && value[chatAbortBrand] === true;
}

// ---------------------------------------------------------------------------
// Abort Tracking
//
// Correlates unhandled AbortError rejections from node-fetch with genuine
// chat cancellations. The process-level unhandledRejection handler doesn't
// have access to the AbortSignal, so it needs this registry to distinguish
// our aborts from unrelated AbortErrors.
// ---------------------------------------------------------------------------

/** Milliseconds. */
const trackingWindow = 10_000;

const activeChatAborts = new Set<string>();
const cleanupTimers = new Map<string, ReturnType<typeof setTimeout>>();

const isAbortLikeError = (error: Error): boolean =>
  error.name === 'AbortError' || (error as { type?: unknown }).type === 'aborted';

/**
 * Register that a chat request is about to be aborted.
 *
 * **Must be called BEFORE `AbortController.abort()`** so the tracking is in
 * place when node-fetch's rejection fires (which can happen synchronously
 * during the abort() call).
 *
 * The entry is automatically removed after {@link trackingWindow} to
 * prevent unbounded growth.
 */
export function registerChatAbort(chatId: string): void {
  const existingTimer = cleanupTimers.get(chatId);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  activeChatAborts.add(chatId);

  const timer = setTimeout(() => {
    activeChatAborts.delete(chatId);
    cleanupTimers.delete(chatId);
  }, trackingWindow);

  cleanupTimers.set(chatId, timer);
}

/**
 * Check whether an unhandled rejection is an expected chat cancellation.
 *
 * Tau-branded chat cancellations are expected regardless of tracking state
 * because the private brand proves they came from this cancellation layer.
 * Generic transport aborts are expected only when at least one chat abort was
 * recently registered via {@link registerChatAbort}.
 *
 * This preserves crash-on-unhandled-rejection behavior for unrelated errors
 * while allowing benign cancellation rejections to settle cleanly.
 *
 * **Known limitation:** This checks for ANY active chat abort, not the
 * specific chat that produced the error. If two chats run concurrently and
 * one is cancelled, AbortErrors from the other chat will also be suppressed
 * during the ~10 s tracking window. In practice this is acceptable because
 * unhandled AbortErrors from node-fetch are benign (the request was already
 * torn down), but it means a genuine unexpected AbortError could be silenced
 * if it happens to coincide with a chat cancellation.
 *
 * @todo Correlate errors to specific chatIds for precise attribution. This
 * would require threading `chatId` through the unhandledRejection handler,
 * which is non-trivial since node-fetch rejections don't carry chat context.
 */
export function isExpectedChatCancellationRejection(error: unknown): boolean {
  if (isChatAbortError(error)) {
    return true;
  }

  if (activeChatAborts.size === 0) {
    return false;
  }

  if (!(error instanceof Error)) {
    return false;
  }

  return isAbortLikeError(error);
}

/**
 * Clear all tracking state and pending timers. Call during module/service
 * teardown to prevent timer leaks.
 */
export function clearAbortTracking(): void {
  for (const timer of cleanupTimers.values()) {
    clearTimeout(timer);
  }

  activeChatAborts.clear();
  cleanupTimers.clear();
}
