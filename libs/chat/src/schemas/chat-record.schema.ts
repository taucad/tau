import { z } from 'zod';
import type { Chat } from '#types/chat.types.js';

/**
 * `.tau/chats/<chatId>/chat.json` — one chat as a file.
 *
 * A chat is files (D25, A30): the record here and the session log beside it are
 * the whole of a chat, they ride `refs/tau/chats/<chatId>` to another device,
 * and every client reads them from the checkout. Nothing about a chat lives in a
 * browser store any more, and nothing about a chat lives in the API.
 *
 * The shape is deliberately *open*. A record written by a newer Tau reaches an
 * older one through a remote, and D14 says the older reader must still read it:
 * so only the fields a reader cannot do without are required, the rest are
 * optional, and unknown keys are carried through untouched rather than
 * stripped — a strict schema here would silently delete a newer client's field
 * every time an older one saved the chat.
 *
 * One {@link Chat} field is deliberately *not* part of it (D25/A39/S39, P26):
 * **`messages`** is derived, not stored. The chat's transcript is the session
 * log's, rebuilt from `events.jsonl` on open; a copy in the record would be a
 * second history of the same turns, and `chat.json` is the one path two devices
 * both claim, so the loser's copy would overwrite the winner's on every replay —
 * through the very path AC17 says must lose no record.
 *
 * A record written before the composer records existed also carries `draft`,
 * `messageEdits` and `hasUnreadTurn`. Those are this device's (a half-written
 * message, an unread badge) and now live in its composer records, so the reader
 * accepts such a record and drops the three keys, and the writer never emits them.
 */

const timestamp = z.number().int().nonnegative();

/** Runtime shape of the durable chat record. @public */
export const chatRecordSchema = z
  .object({
    id: z.string().min(1),
    resourceId: z.string().min(1),
    name: z.string(),
    createdAt: timestamp,
    updatedAt: timestamp,
    checkoutId: z.string().min(1).optional(),
    recencyAt: timestamp.optional(),
    deletedAt: timestamp.optional(),
  })
  .loose();

/** The durable chat record: every {@link Chat} field the file actually holds. @public */
export type ChatRecord = Omit<Chat, (typeof omittedChatFields)[number]>;

/**
 * The chat fields that never reach the file: `messages`, because the log
 * derives it.
 *
 * @public
 */
export const omittedChatFields = ['messages'] as const satisfies ReadonlyArray<keyof Chat>;

/** Per-device keys a pre-composer-record chat file may still carry; dropped on read and write. */
const legacyChatFields = ['draft', 'messageEdits', 'hasUnreadTurn'] as const;

const droppedFields = new Set<string>([...omittedChatFields, ...legacyChatFields]);

const withoutDroppedFields = (value: Readonly<Record<string, unknown>>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(value).filter(([key]) => !droppedFields.has(key)));

/* The *paths* a chat lives at belong to `@taucad/revisions`' `chat-refs`
 * module, which has to know them to build the ref's tree; this module owns the
 * record's shape and nothing else, so the two cannot drift into two spellings
 * of one location. */

/**
 * The bytes one chat is stored as.
 *
 * @param chat - The chat, with or without the fields the file omits.
 * @returns Pretty-printed JSON, newline-terminated — a record a person may read
 *   in the file tree, and a diff a person may read in a revision.
 * @public
 *
 * @example <caption>Persisting a chat</caption>
 * ```typescript
 * import { serializeChatRecord } from '@taucad/chat/schemas';
 * import type { Chat } from '@taucad/chat';
 *
 * declare const chat: Chat;
 * declare const write: (path: string, content: string) => Promise<void>;
 *
 * // `chatRecordsPath` and `chatRecordFileName` come from `@taucad/revisions`,
 * // which owns where a chat's records live.
 * await write(`.tau/chats/${chat.id}/chat.json`, serializeChatRecord(chat));
 * ```
 */
export const serializeChatRecord = (chat: Chat | ChatRecord): string => {
  /* `undefined` is not JSON: a cleared field has to *leave* the record rather
   * than sit in it as a key with no value, or two devices would disagree about
   * whether the field is set. */
  const entries = Object.entries(withoutDroppedFields(chat));
  const record = Object.fromEntries(entries.filter(([, value]) => value !== undefined));
  return `${JSON.stringify(record, undefined, 2)}\n`;
};

/**
 * One chat from the bytes it is stored as.
 *
 * @param text - The record file's UTF-8 content.
 * @returns The chat, or `undefined` when the bytes are not a chat record. A
 *   record this reader cannot parse is never a reason to lose the chat's log,
 *   so the caller decides what an unreadable record means.
 * @public
 */
export const parseChatRecord = (text: string): ChatRecord | undefined => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return undefined;
  }
  const result = chatRecordSchema.safeParse(parsed);
  // oxlint-disable-next-line typescript-eslint/consistent-type-assertions -- the open schema validates the required half; the rest rides through as written (D14).
  return result.success ? (withoutDroppedFields(result.data) as ChatRecord) : undefined;
};
