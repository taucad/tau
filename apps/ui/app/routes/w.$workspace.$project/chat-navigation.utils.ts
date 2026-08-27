import type { Chat } from '@taucad/chat';

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
    if (candidate.updatedAt > mostRecent.updatedAt) {
      mostRecent = candidate;
    }
  }
  return mostRecent.id;
}
