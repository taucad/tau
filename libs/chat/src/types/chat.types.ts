import type { ConstantRecord } from '@taucad/types';
import type { messageRole, messageStatus } from '#constants/message.constants.js';
import type { MyUIMessage } from '#types/message.types.js';

export type MessageRole = ConstantRecord<typeof messageRole>;

export type MessageStatus = ConstantRecord<typeof messageStatus>;

export type MessagePart = MyUIMessage['parts'][number];

export type MessageAnnotation = {
  type: 'usage';
  usageTokens: ChatUsageTokens;
  usageCost: ChatUsageCost;
  model: string;
};

export type ChatUsageTokens = {
  inputTokens: number;
  outputTokens: number;
  cachedReadTokens: number;
  cachedWriteTokens: number;
};

export type ChatUsageCost = {
  inputTokensCost: number;
  outputTokensCost: number;
  cachedReadTokensCost: number;
  cachedWriteTokensCost: number;
  totalCost: number;
};

export type Chat = {
  id: string;
  name: string;
  messages: MyUIMessage[];
  draft?: MyUIMessage; // Main draft
  messageEdits?: Record<string, MyUIMessage>; // Edit drafts by messageId
  createdAt: number;
  updatedAt: number;
};
