/**
 * Per-device message outbox beside the composer record. The Home filesystem is
 * the authority; prepared commands are immutable until the host acknowledges them.
 * Attachments have already been promoted to the chat attachment store before enqueue.
 */
import { z } from 'zod';
import { cadAgentExecutionSchema, safeValidateUiMessages } from '@taucad/chat';
import type { CadAgentExecution, MyUIMessage } from '@taucad/chat';
import { commandPayloads } from '@taucad/agent-host/wire';
import type { HostCommand } from '@taucad/agent-host/wire';
import { composerRecordPaths } from '#db/composer-record-store.js';
import type { ComposerRecordClient } from '#db/composer-record-store.js';
import { isNotFound } from '#db/attachment-store.js';
import { attachmentReferenceOf } from '#utils/attachment.utils.js';

export type ChatMessageQueueIntent = Readonly<{ afterTerminalRunId?: string }>;

export type QueuedStartCommand = Extract<HostCommand, { type: 'start' }>;
export type QueuedCancelCommand = Extract<HostCommand, { type: 'cancel' }>;
export type QueuedChatMessage = Readonly<{
  id: string;
  requestId: string;
  afterTerminalRunId?: string;
  message: MyUIMessage;
  execution?: CadAgentExecution;
  command?: QueuedStartCommand;
  steer?: QueuedCancelCommand;
}>;
export type ChatMessageQueueRecord = Readonly<{ version: 1; items: readonly QueuedChatMessage[]; afterRunId?: string }>;
export type QueueLock = <T>(name: string, task: () => Promise<T>) => Promise<T>;

/** Domain transaction lock; actual file writes and notifications still use the filesystem authority. */
export const withChatQueueLock: QueueLock = async (name, task) => {
  if (!Reflect.has(globalThis, 'navigator') || !Reflect.has(navigator, 'locks')) {
    throw new Error('Queued messages require browser lock support. Your message has not been sent.');
  }
  return navigator.locks.request(`tau-chat-queue:${name}`, task);
};

export const chatMessageQueuePath = (projectId: string, chatId: string): string =>
  composerRecordPaths.chat(projectId, chatId).replace(/\.json$/u, '/queue.json');

const itemSchema = z.strictObject({
  id: z.string().min(1),
  requestId: z.string().min(1),
  afterTerminalRunId: z.string().min(1).optional(),
  message: z.unknown(),
  execution: cadAgentExecutionSchema.optional(),
  command: z
    .strictObject({ type: z.literal('start'), commandId: z.string(), payload: commandPayloads.start })
    .optional(),
  steer: z
    .strictObject({ type: z.literal('cancel'), commandId: z.string(), payload: commandPayloads.cancel })
    .optional(),
});
const recordSchema = z.strictObject({
  version: z.literal(1),
  items: z.array(itemSchema),
  afterRunId: z.string().min(1).optional(),
});
const emptyRecord: ChatMessageQueueRecord = { version: 1, items: [] };

const validate = async (input: unknown, source: 'saved' | 'updated'): Promise<ChatMessageQueueRecord> => {
  const record = recordSchema.parse(input);
  if (record.items.length === 0) {
    return { ...record, items: [] };
  }
  const messages = await safeValidateUiMessages(record.items.map((item) => item.message));
  if (!messages.success) {
    throw new Error('Queued messages could not be read. The saved file has been preserved.', { cause: messages.error });
  }
  const ids = new Set<string>();
  const requests = new Set<string>();
  const items = record.items.map((item, index): QueuedChatMessage => {
    const message = messages.data[index]!;
    if (message.role !== 'user' || message.id !== item.id || ids.has(item.id) || requests.has(item.requestId)) {
      throw new Error('Queued message identities are invalid. The saved file has been preserved.');
    }
    ids.add(item.id);
    requests.add(item.requestId);
    if (message.parts.some((part) => part.type === 'file' && attachmentReferenceOf(part) === undefined)) {
      throw new Error(
        source === 'saved'
          ? 'Queued messages could not be read. The saved file has been preserved.'
          : 'Save attachments before queueing this message.',
      );
    }
    if (
      item.command !== undefined &&
      (item.command.commandId !== item.requestId ||
        item.command.payload.runId !== item.requestId ||
        item.command.payload.message.id !== item.id)
    ) {
      throw new Error('Queued delivery does not match its saved message.');
    }
    return { ...item, message };
  });
  return { ...record, items };
};

/** One transaction always re-reads under the shared lock, so independent tabs cannot overwrite each other. */
export type ChatMessageQueueStore = {
  readonly path: string;
  read(): Promise<ChatMessageQueueRecord>;
  update(change: (record: ChatMessageQueueRecord) => ChatMessageQueueRecord): Promise<ChatMessageQueueRecord>;
  exclusive<T>(task: () => Promise<T>): Promise<T>;
  enqueue(item: QueuedChatMessage): Promise<ChatMessageQueueRecord>;
  change(
    id: string,
    change: (item: QueuedChatMessage) => QueuedChatMessage | undefined,
  ): Promise<ChatMessageQueueRecord>;
  move(id: string, beforeId: string | undefined): Promise<ChatMessageQueueRecord>;
  acknowledge(id: string, commandId: string): Promise<ChatMessageQueueRecord>;
  remove(): Promise<void>;
};
export const createChatMessageQueueStore = (
  client: Pick<ComposerRecordClient, 'readFile' | 'writeFile' | 'unlink'>,
  path: string,
  lock: QueueLock = withChatQueueLock,
): ChatMessageQueueStore => {
  const read = async (): Promise<ChatMessageQueueRecord> => {
    try {
      return await validate(JSON.parse(new TextDecoder().decode(await client.readFile(path))), 'saved');
    } catch (error) {
      if (isNotFound(error)) {
        return emptyRecord;
      }
      throw error;
    }
  };
  const update = async (
    change: (record: ChatMessageQueueRecord) => ChatMessageQueueRecord,
  ): Promise<ChatMessageQueueRecord> =>
    lock(path, async () => {
      const current = await read();
      const next = change(current);
      if (next === current) {
        return current;
      }
      const valid = await validate(next, 'updated');
      await client.writeFile(path, new TextEncoder().encode(`${JSON.stringify(valid)}\n`));
      return valid;
    });
  return {
    path,
    read,
    update,
    exclusive: async <T>(task: () => Promise<T>): Promise<T> => lock(`${path}:delivery`, task),
    enqueue: async (item: QueuedChatMessage): Promise<ChatMessageQueueRecord> =>
      update((record) =>
        record.items.some((entry) => entry.id === item.id) ? record : { ...record, items: [...record.items, item] },
      ),
    change: async (
      id: string,
      change: (item: QueuedChatMessage) => QueuedChatMessage | undefined,
    ): Promise<ChatMessageQueueRecord> =>
      update((record) => ({
        ...record,
        items: record.items.flatMap((item) => {
          if (item.id !== id) {
            return [item];
          }
          if (item.command !== undefined || item.steer !== undefined) {
            throw new Error('This message is being sent. Wait for delivery to be confirmed.');
          }
          const next = change(item);
          return next === undefined ? [] : [next];
        }),
      })),
    move: async (id: string, beforeId: string | undefined): Promise<ChatMessageQueueRecord> =>
      lock(`${path}:delivery`, async () =>
        update((record) => {
          if (record.items.some((entry) => entry.command !== undefined || entry.steer !== undefined)) {
            throw new Error('Wait for the current message to finish sending.');
          }
          const item = record.items.find((entry) => entry.id === id);
          if (item === undefined || (beforeId !== undefined && !record.items.some((entry) => entry.id === beforeId))) {
            throw new Error('The queue changed. Choose the message position again.');
          }
          if (beforeId === id) {
            return record;
          }
          const items = record.items.filter((entry) => entry.id !== id);
          const index = beforeId === undefined ? items.length : items.findIndex((entry) => entry.id === beforeId);
          items.splice(index, 0, item);
          return { ...record, items };
        }),
      ),
    acknowledge: async (id: string, commandId: string): Promise<ChatMessageQueueRecord> =>
      update((record) => {
        const item = record.items.find((entry) => entry.id === id);
        return item?.command?.commandId === commandId
          ? {
              ...record,
              afterRunId: item.command.payload.runId,
              items: record.items.filter((entry) => entry.id !== id),
            }
          : record;
      }),
    remove: async (): Promise<void> =>
      lock(path, async () => {
        try {
          await client.unlink(path);
        } catch (error) {
          if (!isNotFound(error)) {
            throw error;
          }
        }
      }),
  };
};
