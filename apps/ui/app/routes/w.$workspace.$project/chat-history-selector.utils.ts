import type { Chat } from '@taucad/chat';

/**
 * Returns the chat id that should become focused after `deletedChatId` is
 * removed from `chats`. Encodes the policy:
 *
 * - If the deleted chat was *not* the focused one, focus does not change.
 * - If the deleted chat *was* the focused one, focus moves to the
 *   most-recently-updated remaining chat (descending by `updatedAt`).
 * - If no chats remain, focus is cleared (`undefined`).
 *
 * Pure and project-id agnostic so the selector component can be exercised
 * without a full XState/IndexedDB harness, and so the policy itself has
 * dedicated regression coverage.
 */
export function pickNextFocusedChatId(
  chats: readonly Chat[],
  deletedChatId: string,
  focusedChatId: string | undefined,
): string | undefined {
  if (focusedChatId !== deletedChatId) {
    return focusedChatId;
  }

  const remaining = chats.filter((chat) => chat.id !== deletedChatId);
  if (remaining.length === 0) {
    return undefined;
  }

  let mostRecent = remaining[0]!;
  for (let i = 1; i < remaining.length; i++) {
    const candidate = remaining[i]!;
    if (candidate.updatedAt > mostRecent.updatedAt) {
      mostRecent = candidate;
    }
  }
  return mostRecent.id;
}
