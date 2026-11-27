/**
 * The chat list's remembered shape (U6, H5): the rows each project's sidebar chat list last drew on this device, so
 * the list's loading frame reserves those rows instead of a fixed three, and nothing below it moves when the listing
 * answers.
 *
 * A shape is one character per row, in order: `c` a chat, `l` a day label (*Today*, *Earlier*), `m` *Show more chats*
 * and `e` *No chats yet*. One `localStorage` record maps a project id to its shape, capped at
 * {@link chatListShapeProjectLimit} projects by last use. A project never listed on this device has no shape, and its
 * loading frame keeps the default three rows.
 */

/** The `localStorage` key holding the record. */
export const chatListShapeStorageKey = 'tau-chat-list-shape';

/** How many projects the record remembers, by last use. */
export const chatListShapeProjectLimit = 50;

/** One row of a chat list. */
export type ChatListRow = 'c' | 'l' | 'm' | 'e';

type ChatListShapeEntry = Readonly<{ usedAt: number; rows: string }>;
type ChatListShapeRecord = Readonly<{ v: 1; projects: Readonly<Record<string, ChatListShapeEntry>> }>;

const shapePattern = /^[clme]{1,16}$/u;

const isEntry = (value: unknown): value is ChatListShapeEntry =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as ChatListShapeEntry).usedAt === 'number' &&
  typeof (value as ChatListShapeEntry).rows === 'string' &&
  shapePattern.test((value as ChatListShapeEntry).rows);

/**
 * The rows a settled list draws.
 *
 * @param list - Whether it is known empty, its day label before each visible chat, and whether more chats follow.
 * @returns The shape, one character per row.
 */
export const chatListShapeOf = ({
  isKnownEmpty,
  groupLabels,
  hasMore,
}: Readonly<{ isKnownEmpty: boolean; groupLabels: ReadonlyArray<string | undefined>; hasMore: boolean }>): string => {
  if (isKnownEmpty) {
    return 'e';
  }
  const rows = groupLabels.map((label): string => (label === undefined ? 'c' : 'lc')).join('');
  return hasMore ? `${rows}m` : rows;
};

/** The last stored value read, and its parse; `''` before the first read, which no stored record is. */
let cachedRaw = '';
let cachedRecord: ChatListShapeRecord | undefined;

const parseRecord = (raw: string): ChatListShapeRecord | undefined => {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null) {
      return undefined;
    }
    const { v, projects } = parsed as Record<string, unknown>;
    if (v !== 1 || typeof projects !== 'object' || projects === null) {
      return undefined;
    }
    return { v: 1, projects: projects as Record<string, ChatListShapeEntry> };
  } catch {
    return undefined;
  }
};

/** The stored record, parsed once per stored value. Unreadable storage reads as no record. */
const readRecord = (): ChatListShapeRecord | undefined => {
  let raw: string | undefined;
  try {
    raw = globalThis.localStorage.getItem(chatListShapeStorageKey) ?? undefined;
  } catch {
    return undefined;
  }
  if (raw === undefined) {
    return undefined;
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedRecord = parseRecord(raw);
  }
  return cachedRecord;
};

/**
 * A project's remembered chat list rows, or undefined when this device has none. The value is a string, so it is a
 * stable `useSyncExternalStore` snapshot; nothing needs to subscribe, because only a list still loading reads it and
 * each of its renders reads it again.
 *
 * @param projectId - The project.
 * @returns The rows, one character each, or undefined.
 */
export const readChatListShape = (projectId: string): string | undefined => {
  const entry = readRecord()?.projects[projectId];
  return isEntry(entry) ? entry.rows : undefined;
};

/**
 * Remember the rows a project's chat list drew once its listing answered. A full or blocked storage leaves the record
 * as it was; the next loading frame then reserves the last shape it knew, or the default.
 *
 * @param projectId - The project.
 * @param rows - The rows, one character each.
 * @param now - The time of use, for the cap.
 */
export const writeChatListShape = (projectId: string, rows: string, now: number = Date.now()): void => {
  if (!shapePattern.test(rows)) {
    return;
  }
  const record = readRecord();
  const previous = record?.projects[projectId];
  if (isEntry(previous) && previous.rows === rows && now - previous.usedAt < 60_000) {
    return;
  }
  const others = Object.entries((record?.projects ?? {}) as Record<string, unknown>)
    .filter((pair): pair is [string, ChatListShapeEntry] => pair[0] !== projectId && isEntry(pair[1]))
    .toSorted(([, left], [, right]) => right.usedAt - left.usedAt)
    .slice(0, chatListShapeProjectLimit - 1);
  const next: ChatListShapeRecord = {
    v: 1,
    projects: Object.fromEntries([[projectId, { usedAt: now, rows }], ...others]),
  };
  try {
    globalThis.localStorage.setItem(chatListShapeStorageKey, JSON.stringify(next));
  } catch {
    /* Quota or blocked storage: the record stays as it was. */
  }
};
