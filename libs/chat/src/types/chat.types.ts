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
  /** Exact pending command input until the host durably accepts Start; absent in older records. */
  message?: MyUIMessage;
  source: 'homepage-initial-message' | 'fix-with-ai-new-chat' | 'resolve-conflict-new-chat';
  createdAt: number;
};

/** @public */
export type Chat = {
  id: string;
  resourceId: string; // Links chat to a resource (e.g., build)
  name: string;
  messages: MyUIMessage[];
  error?: ChatError; // Persisted error for display after page reload
  startupRequest?: ChatStartupRequest;
  /**
   * Chat-scoped execution target; opaque ids only, never credentials. The chat
   * owns its intent and each device its placement: a persisted Tau execution
   * holds no device-relative host (see `TauAgentHostId`).
   */
  activeExecution?: CadAgentExecution;
  /**
   * Chat-scoped active CAD kernel. Same semantics as {@link Chat.activeExecution}
   * — present means this chat owns its kernel choice, absent means consumers
   * fall back to the cookie default.
   */
  activeKernel?: KernelId;
  /**
   * Durable checkout for this chat's future turns. A linked checkout's id derives from its branch, so the branch is
   * the portable fact: a device that has no checkout with this id places the turn on the one holding that branch,
   * opening it when the branch is present there (`@taucad/revisions/turn-placement`).
   */
  checkoutId?: string;
  /** Product recency for chat ordering, in Unix epoch milliseconds. */
  recencyAt?: number;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number; // Soft delete support
  /** Irreversible product deletion; the tombstone remains for record synchronization. */
  purgedAt?: number;
};
