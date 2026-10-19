/**
 * The platform half of a launcher (RH-S0, option one-launcher): where a project's chat logs live and how this process
 * becomes a chat's writer. Only `createNodeChatStore` and `createBrowserChatStore` make one, so no host can hand-roll a
 * leader that always answers `leader` (RH-R2); the leadership port stays internal (guide question `leadership-port`).
 */

import type { AttachmentReader } from '#harness/session-record.js';
import type { EventLogAppender } from '#log/event-log-appender.js';
import { EventLogError } from '#log/event-log-error.js';
import type { StorageDurabilityClass } from '#log/event-types.js';
import type { SourceLiveEvent } from '#waist/ports.js';
import type { CommandAnswer, HostCommand } from '#wire/commands.schema.js';
import type { ReadAnswer, ReadInput } from '#wire/frames.schema.js';

declare const chatStoreBrand: unique symbol;

/**
 * Where a project's chat logs live and how this process becomes a chat's writer: W3's log binding with its access
 * modes, plus W6's leadership (Node: the kernel lock; browser: M2). Opaque, like `RuntimeFileSystem`.
 *
 * @public
 */
export type ChatStore = Readonly<{ [chatStoreBrand]: 'node' | 'browser' }>;

/** What a leadership binding may ask of its launcher (RH-R9, RH-R16). @internal */
export type LeadershipHost = Readonly<{
  /** Open the chat's writer, which takes the binding's lock and reads the log (W3): M2's `readView`. */
  openView: (
    chatId: string,
  ) => Promise<Readonly<{ kind: 'read'; epoch: number }> | Readonly<{ kind: 'refused'; code: string }>>;
  /** Close a view no claim took, releasing the binding's lock. */
  dropView: (chatId: string) => Promise<void>;
  /** Name the epoch the chat's next incarnation claims at (D5). */
  assume: (chatId: string, epoch: number) => void;
  /** Open the chat's M1 incarnation, which abandons a driverless run and reconciles before it serves (RH-R9). */
  claim: (chatId: string) => Promise<void>;
  /** Stop the chat's M1 and close its writer, which frees the binding's lock (RH-R8). */
  relinquish: (chatId: string) => Promise<void>;
  /** Run a command in this process at the epoch this worker leads (a claim's write, or another tab's forward). */
  execute: (command: HostCommand, epoch: number) => Promise<CommandAnswer>;
  /** Serve a read in this process: from its writer when it has one, else from the log as it is. */
  read: (input: ReadInput) => Promise<ReadAnswer>;
  /** Whether this process holds the chat's writer open. */
  writing: (chatId: string) => boolean;
  /** Wake the chat's parked reads: a holder changed, or a row landed elsewhere. */
  wakeReads: (chatId: string) => void;
  /** Deliver a live delta another process's run published to this process's subscribers. */
  publishLive: (event: SourceLiveEvent) => void;
}>;

/**
 * The launcher's only view of leadership (T4). `local` runs the command in this process: `epoch` is the term epoch a
 * write claims at, and `undefined` where the binding's own read of the log decides it (Node).
 *
 * @internal
 */
export type LeadershipPort = Readonly<{
  execute: (
    chatId: string,
    command: HostCommand,
    local: (epoch: number | undefined) => Promise<CommandAnswer>,
  ) => Promise<CommandAnswer>;
  read: (input: ReadInput, local: () => Promise<ReadAnswer>) => Promise<ReadAnswer>;
  role: (chatId: string) => Readonly<{ role: 'leader' | 'follower' | 'none'; epoch: number }>;
  /** A read-only view of whether this process can route a cancel to a live compatible holder. */
  stoppability: (chatId: string) => 'stoppable' | 'other-build' | 'background-window';
  /** A term's first append is its claim. */
  appended: (chatId: string, endCursor: number) => void;
  /** An append was refused `LOG_FENCED`. */
  fenced: (chatId: string) => void;
  /** M1 became quiescent (no run executing, no command in flight, no settlement awaiting `acknowledge`) or left it. */
  quiescent: (chatId: string, quiescent: boolean) => void;
  /** A live delta of a run this process drives, for followers that watch it. */
  liveEvent: (event: SourceLiveEvent) => void;
  /** Take the chat to reconcile it; `wait` queues behind another holder instead of skipping it (RH-R16). */
  reconcile: (chatId: string, request: Readonly<{ wait: boolean }>) => void;
  close: () => Promise<void>;
}>;

/** One platform's half, behind the opaque {@link ChatStore}. @internal */
export type ChatStoreBinding = Readonly<{
  platform: 'node' | 'browser';
  /** The durability class stamped on each admission (W3 §11). */
  durability: StorageDurabilityClass;
  attachments: AttachmentReader;
  /** The chat's durable bytes as they are now; never creates, locks or keeps a handle (RH-R1). */
  readBytes: (chatId: string) => Promise<Uint8Array<ArrayBuffer>>;
  /** Acknowledged source observation; changes invalidate bytes, never authorize serving a cached view. */
  observeBytes?:
    | ((
        chatId: string,
        input: Readonly<{
          signal: AbortSignal;
          onChange: () => void;
          onError: (error: unknown) => void;
        }>,
      ) => Promise<() => void>)
    | undefined;
  /** A write open: the binding's lock, then a read of the log whose tail is the fence register (W3). */
  openWriter: (chatId: string) => Promise<EventLogAppender>;
  leadership: (host: LeadershipHost) => LeadershipPort;
  /**
   * Whether the chat's record (`chat.json`) carries a permanent delete's tombstone, `purgedAt` (OQ2). A purged chat's
   * writer never opens, appends or writes an attachment, so nothing its purge removed is written back.
   */
  purged?: ((chatId: string) => Promise<boolean>) | undefined;
}>;

const bindingKey = Symbol('tau.chatStore');

/** The chat record's name beside the log, restated: `@taucad/revisions` owns it and this package does not import it. @internal */
export const chatRecordFileName = 'chat.json';

/**
 * Whether a chat record's text carries a permanent delete's tombstone.
 *
 * @param text - `chat.json`'s text, or `undefined` when the chat has no record.
 * @returns `true` for a record whose `purgedAt` is a number; an unreadable record is not a tombstone.
 * @internal
 */
export const isPurgedChatRecord = (text: string | undefined): boolean => {
  if (text === undefined) {
    return false;
  }
  try {
    const record: unknown = JSON.parse(text);
    return (
      typeof record === 'object' && record !== null && typeof (record as { purgedAt?: unknown }).purgedAt === 'number'
    );
  } catch {
    return false;
  }
};

/**
 * The refusal every write into a purged chat answers.
 *
 * @param chatId - The purged chat.
 * @returns A `LOG_FENCED` error naming it.
 * @internal
 */
export const purgedChatError = (chatId: string): EventLogError =>
  new EventLogError(
    'LOG_FENCED',
    `Chat "${chatId}" was deleted permanently; its log and attachments are not written again.`,
  );

/**
 * Fence a binding's writes by the chat's tombstone (OQ2): a purged chat's writer is refused `LOG_FENCED` at open, at
 * each append and at each attachment write, so a run that outlives the purge stops at its next row and writes nothing
 * back. The check reads the record each time; the append it guards costs a sync already.
 *
 * @param binding - A platform's half.
 * @returns The same binding with its writes fenced, or unchanged when it cannot read a record.
 */
const fencePurged = (binding: ChatStoreBinding): ChatStoreBinding => {
  const { purged, attachments } = binding;
  if (purged === undefined) {
    return binding;
  }
  const refuse = async (chatId: string): Promise<void> => {
    if (await purged(chatId)) {
      throw purgedChatError(chatId);
    }
  };
  const write = attachments.write?.bind(attachments);
  return {
    ...binding,
    attachments:
      write === undefined
        ? attachments
        : {
            read: attachments.read.bind(attachments),
            write: async (chatId, path, bytes) => {
              await refuse(chatId);
              await write(chatId, path, bytes);
            },
          },
    openWriter: async (chatId) => {
      await refuse(chatId);
      const log = await binding.openWriter(chatId);
      return {
        ...log,
        append: async (event) => {
          await refuse(chatId);
          return log.append(event);
        },
      };
    },
  };
};

/**
 * Wrap a platform binding as an opaque store.
 *
 * @param binding - The platform's half.
 * @returns The opaque store a launcher takes.
 * @internal
 */
export const createChatStore = (binding: ChatStoreBinding): ChatStore =>
  // ponytail: one documented cast brands the object; the brand symbol is never exported, so no caller can forge one.
  ({ [bindingKey]: fencePurged(binding) }) as unknown as ChatStore;

/**
 * Read a store's platform binding.
 *
 * @param store - A store from `createNodeChatStore` or `createBrowserChatStore`.
 * @returns Its binding.
 * @internal
 */
export const chatStoreBinding = (store: ChatStore): ChatStoreBinding => {
  const binding = (store as unknown as Readonly<Record<symbol, ChatStoreBinding | undefined>>)[bindingKey];
  if (binding === undefined) {
    throw new TypeError('A chat store comes only from createNodeChatStore or createBrowserChatStore.');
  }
  return binding;
};

/** One storage path segment, never a path: a chat id is a directory name under `.tau/chats`. @internal */
export const requireChatPathSegment = (value: string, label = 'chatId'): string => {
  if (!value || value === '.' || value === '..' || value.includes('/') || value.includes('\\')) {
    throw Object.assign(new Error(`${label} must be one storage path segment.`), { code: 'STORAGE_PATH_INVALID' });
  }
  return value;
};
