import type { ProjectTaskMessage } from '@taucad/agent-host/wire';

/**
 * Render the same bounded message envelope for model delivery and inbox byte accounting.
 *
 * @param message - A validated durable mailbox row, preserving its full accepted text.
 * @returns The model-facing data envelope; callers own their surrounding prompt separators.
 * @internal
 */
export const formatProjectTaskMailboxMessage = (message: ProjectTaskMessage): string =>
  `<task-message sequence="${message.sequence}" sender="${message.senderTaskId ?? 'host'}">\n${message.text}\n</task-message>`;
