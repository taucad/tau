import type { UIMessage } from 'ai';
import type { ConstantRecord } from '#/types/constant.types.js';
import type { messageRole, messageStatus } from '#/constants/message.constants.js';

export type MessageRole = ConstantRecord<typeof messageRole>;

export type MessageStatus = ConstantRecord<typeof messageStatus>;

export type SourceOrigin = 'web' | 'notion' | 'history' | 'projects';

export type MessagePart = UIMessage['parts'][number];

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
