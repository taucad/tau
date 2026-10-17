import type { ChatRecord } from '@taucad/chat/schemas';

/** A descendant URL opens its root chat and selects the thread without starting a turn. */
export function resolveThreadRoute(
  chatId: string | undefined,
  chats: readonly ChatRecord[],
): {
  rootChatId: string | undefined;
  taskId?: string;
} {
  const lineage = chats.find((chat) => chat.id === chatId)?.taskLineage;
  return lineage === undefined ? { rootChatId: chatId } : { rootChatId: lineage.rootChatId, taskId: lineage.taskId };
}
