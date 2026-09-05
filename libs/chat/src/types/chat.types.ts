import type { ConstantRecord, ChatError } from '@taucad/types';
import type { KernelId } from '@taucad/types/constants';
import type { messageRole, messageStatus } from '#constants/message.constants.js';
import type { CadAgentExecution } from '#schemas/agent-config.schema.js';
import type { MyUIMessage } from '#types/message.types.js';

/** @public */
export type MessageRole = ConstantRecord<typeof messageRole>;

/** @public */
export type MessageStatus = ConstantRecord<typeof messageStatus>;

/** @public */
export type MessagePart = MyUIMessage['parts'][number];

/** @public */
export type ChatStartupRequest = {
  id: string;
  kind: 'regenerate-tail';
  messageId: string;
  source: 'homepage-initial-message' | 'fix-with-ai-new-chat';
  createdAt: number;
};

/** @public */
export type Chat = {
  id: string;
  resourceId: string; // Links chat to a resource (e.g., build)
  name: string;
  messages: MyUIMessage[];
  draft?: MyUIMessage; // Main draft
  messageEdits?: Record<string, MyUIMessage>; // Edit drafts by messageId
  error?: ChatError; // Persisted error for display after page reload
  startupRequest?: ChatStartupRequest;
  /** Chat-scoped execution target. Paseo targets contain opaque ids only. */
  activeExecution?: CadAgentExecution;
  /**
   * Chat-scoped active CAD kernel. Same semantics as {@link Chat.activeExecution}
   * — present means this chat owns its kernel choice, absent means consumers
   * fall back to the cookie default.
   */
  activeKernel?: KernelId;
  /** Product recency for chat ordering, in Unix epoch milliseconds. */
  recencyAt?: number;
  /** Whether this browser profile has an unattended turn requiring review. */
  hasUnreadTurn?: boolean;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number; // Soft delete support
};
