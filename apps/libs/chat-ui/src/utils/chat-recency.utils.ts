import type { Chat } from '@taucad/chat';
import type { ChatRecord } from '@taucad/chat/schemas';

type ChatRecencySource = Chat | ChatRecord;

/** Returns the durable product-recency timestamp that owns chat ordering. */
export const getChatRecencyAt = (chat: ChatRecencySource): number => {
  if (chat.recencyAt !== undefined) {
    return chat.recencyAt;
  }

  const legacyRecencyAt: unknown = Reflect.get(chat, 'lastUserActivityAt');
  if (typeof legacyRecencyAt === 'number') {
    return legacyRecencyAt;
  }

  let recencyAt = chat.createdAt;
  for (const message of 'messages' in chat ? chat.messages : []) {
    const createdAt = message.role === 'user' ? message.metadata?.createdAt : undefined;
    if (createdAt !== undefined && createdAt > recencyAt) {
      recencyAt = createdAt;
    }
  }
  return recencyAt;
};

/** Orders chats by product recency, creation time, then stable id. */
export const compareChatsByRecency = (left: ChatRecencySource, right: ChatRecencySource): number =>
  getChatRecencyAt(right) - getChatRecencyAt(left) ||
  right.createdAt - left.createdAt ||
  left.id.localeCompare(right.id);
