import type { ChatRecord } from '@taucad/chat/schemas';

/** Navigation rows contain only ordinary root conversations. */
export const rootChatRecords = (chats: readonly ChatRecord[]): ChatRecord[] =>
  chats.filter((chat) => chat.taskLineage === undefined);
