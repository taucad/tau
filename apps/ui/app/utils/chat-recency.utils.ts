import type { Chat } from '@taucad/chat';

/** Returns the durable product-recency timestamp that owns chat ordering. */
export const getChatRecencyAt = (chat: Chat): number => {
  if (chat.recencyAt !== undefined) {
    return chat.recencyAt;
  }

  const legacyRecencyAt: unknown = Reflect.get(chat, 'lastUserActivityAt');
  if (typeof legacyRecencyAt === 'number') {
    return legacyRecencyAt;
  }

  let recencyAt = chat.createdAt;
  for (const message of chat.messages) {
    const createdAt = message.role === 'user' ? message.metadata?.createdAt : undefined;
    if (createdAt !== undefined && createdAt > recencyAt) {
      recencyAt = createdAt;
    }
  }
  return recencyAt;
};

/** Orders chats by product recency, creation time, then stable id. */
export const compareChatsByRecency = (left: Chat, right: Chat): number =>
  getChatRecencyAt(right) - getChatRecencyAt(left) ||
  right.createdAt - left.createdAt ||
  left.id.localeCompare(right.id);
