import type { Chat } from '@taucad/chat';
import { compareChatsByRecency } from '#utils/chat-recency.utils.js';

/** Deterministic focus repair after a chat is deleted. */
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
  for (let index = 1; index < remaining.length; index++) {
    const candidate = remaining[index]!;
    if (compareChatsByRecency(candidate, mostRecent) < 0) {
      mostRecent = candidate;
    }
  }
  return mostRecent.id;
}
