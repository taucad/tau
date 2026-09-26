/**
 * Chats on the graph: `refs/tau/chats/<chatId>` as the transport of a chat's
 * records, and the checkout's `.tau/chats/**` as their canonical form.
 *
 * A chat is files. `.tau/chats/<chatId>/` holds `chat.json` (the record) and
 * this device's `events.jsonl` (the session log the agent host appends to);
 * every *other* device's log arrives beside it as `events/<deviceId>.jsonl`.
 * An attached image or document rides beside them as
 * `attachments/<sha256>.<ext>`, content addressed, so the same bytes are the
 * same entry on every device (D12).
 * The ref's tree is that directory with one rename: this device's own
 * `events.jsonl` is written out as `events/<deviceId>.jsonl` — `deviceId` being
 * the record device of the writing actor form, never the host's own id — so the paths of
 * two devices' logs are disjoint and a merge never has to read a line (A39,
 * S39). The union is therefore a tree union, and the CAS loser replays by
 * putting its own segment back onto the remote tree — there is no merge driver
 * on either leg.
 *
 * It is written by object plumbing rather than by capture-and-commit because
 * `.tau/chats` is `records` in the path registry: `captureRevisionTree` filters
 * on `classify(path).versioned` and would record nothing. The commit is an
 * orphan-parented chain of its own — parent is the previous value of this ref,
 * never a revision of the project's history — so a chat ref can be refused by a
 * server without blocking a branch (A39's record set).
 *
 * Nothing here knows about sync scheduling: {@link writeChatRef} is the writer
 * `sync.machine` (W13) calls after a turn settles, and {@link projectChats} is
 * what the fetch path calls with the refs the fetch wrote.
 */

import { ImmutableRevisionTree, revisionId } from '#algorithms/index.js';
import type { FileSystemProvider } from '@taucad/filesystem';
import type { RevisionId, RevisionTreeInput } from '#algorithms/index.js';
import { equalBytes } from '#object-hash.js';

import type { RevisionActor, RevisionProvenance } from '#revision-authority.js';
import { remoteTrackingRef } from '#remotes.js';
import { RevisionPortError } from '#revision-port.js';
import type { RevisionPort, RevisionPushRef } from '#revision-port.js';

/** Where one chat's records live inside a checkout. @public */
export const chatRecordsPath = (chatId: string): string => `.tau/chats/${chatId}`;

/** The ref that carries one chat between hosts. @public */
export const chatRefName = (chatId: string): string => `refs/tau/chats/${chatId}`;

/** The namespace every chat ref lives in, as a `listRefs` prefix. @public */
export const chatRefPrefix = 'refs/tau/chats';

/** The chat record's file name inside the chat directory. @public */
export const chatRecordFileName = 'chat.json';

/**
 * The session log this device appends to.
 *
 * Unchanged from where the agent host already writes it: a device reads and
 * writes its own log at one stable path, and only the *ref's* tree spells it
 * per device.
 *
 * @public
 */
export const chatLogFileName = 'events.jsonl';

/** One device's log as the ref's tree spells it. @public */
export const chatSegmentPath = (deviceId: string): string => `events/${deviceId}.jsonl`;

/**
 * Whether a tree path is one of this host's own segments, under any actor form.
 *
 * @param context - The segment name this write uses, and every one this host has used.
 * @param path - A path inside the chat ref's tree.
 * @returns `true` for a segment this host wrote.
 */
const isOwnSegment = (context: ChatRefContext, path: string): boolean =>
  path === chatSegmentPath(context.deviceId) ||
  [...(context.ownDevices ?? [])].some((device) => path === chatSegmentPath(device));

/**
 * One attachment blob as the closed tree spells it: `attachments/<64 hex>.<ext>`
 * over the five media types the composer stores (blueprint D12).
 *
 * Restated here rather than imported: `apps/ui/app/utils/attachment.utils.ts`
 * owns the canonical media-type table and mints the names, and nothing under
 * `packages/**` may depend on `apps/**`. Lower-case hex only, because the store
 * writes lower-case and two spellings of one hash would be two entries for one
 * blob — the opposite of what content addressing buys.
 */
const chatAttachmentPattern = /^attachments\/[\da-f]{64}\.(?:jpg|png|webp|gif|pdf)$/u;

/**
 * Every path the chat ref's tree admits: the record, one log per device, and
 * content-addressed attachment blobs.
 *
 * @param path - A tree entry's path, relative to the chat directory.
 * @returns Whether the closed tree carries an entry of that name.
 */
const isChatTreePath = (path: string): boolean =>
  path === chatRecordFileName || /^events\/[^/]+\.jsonl$/u.test(path) || chatAttachmentPattern.test(path);

/**
 * The chat a ref names, whether it is local or remote-tracking.
 *
 * A fetch writes `refs/tau/chats/c1` to `refs/remotes/<remote>/tau/chats/c1`
 * (`remoteTrackingRef`), so the projection has to read both spellings from the
 * one place that knows the shape.
 *
 * @param ref - A fully-qualified ref name.
 * @returns The chat id, or `undefined` when the ref names no chat.
 * @public
 */
export const chatIdOfRef = (ref: string): string | undefined => {
  const match = /^refs\/(?:remotes\/[^/]+\/tau|tau)\/chats\/(?<chatId>[^/]+)$/u.exec(ref);
  return match?.groups?.['chatId'];
};

/** How one chat-ref write ended. @public */
export type ChatRefWriteStatus =
  /** The ref moved to a new commit. */
  | 'updated'
  /**
   * Nothing new was recorded: the chat directory's bytes are already in the
   * ref, or in the head it was built on, which the ref now names.
   */
  | 'upToDate'
  /** *Sync chats* is off for this project. No ref exists and none was created. */
  | 'disabled'
  /** The ref moved underneath this write. The caller fetches and replays. */
  | 'conflicted';

/** One chat-ref write's outcome. @public */
export type ChatRefWriteResult = Readonly<{
  chatId: string;
  ref: string;
  status: ChatRefWriteStatus;
  /** What the ref names now: the new commit, or what refused the write. */
  head: RevisionId | undefined;
  /**
   * What the write expected the **local** ref to hold, which is what the CAS
   * inside `updateRef` was made against.
   *
   * Deliberately not named `expected`: {@link RevisionPushRef.expected} is the
   * *remote* lease (P18, what this host last saw the remote ref to be), and the
   * two are never the same value — `refs/tau/chats/*` is an orphan chain per
   * host, so two devices never share a local ref. A push made with this value
   * as its lease is a bug.
   */
  expectedLocalHead: RevisionId | undefined;
}>;

/** What every chat-ref effect needs to reach one chat's records. @public */
export type ChatRefContext = Readonly<{
  /** The store that holds the objects and the ref. */
  port: RevisionPort;
  /** The checkout whose `.tau/chats/**` is the canonical form. */
  filesystem: FileSystemProvider;
  /**
   * The name of this device's segment for the actor form writing it: a record
   * device id (`OpsLog.deviceFor`), never the host's own device id (EQ10(a)).
   *
   * It names a *log segment*, so it must be stable across reloads of one
   * profile and different between two profiles; it is opaque to every reader,
   * which only breaks a tie with it, and never an identity a remote can be
   * authenticated by.
   */
  deviceId: string;
  /**
   * Every segment name this host has written under, for any actor form. A
   * segment named by one of them is this host's own and never projected back
   * onto disk, after a sign-in changed which one {@link deviceId} is.
   */
  ownDevices?: ReadonlySet<string>;
}>;

/** Input for {@link writeChatRef}. @public */
export type WriteChatRefInput = ChatRefContext &
  Readonly<{
    chatId: string;
    /**
     * The project's *Sync chats* answer.
     *
     * `false` writes nothing at all — not the commit, not the ref — so a
     * files-only project has no `refs/tau/chats/*` for any push to offer
     * (D25, AC17). The scheduler's own record set is narrowed by the same flag
     * (W13); this is the guard that makes the narrowing unnecessary.
     */
    syncChats: boolean;
    /** Who the commit is by (D18). */
    actor?: RevisionActor;
    actorId: string;
    /** Milliseconds since the Unix epoch. Defaults to the host clock. */
    now?: number;
    /**
     * The remote this project syncs with, whose fetched chat head a write
     * builds on when the local chain does not already hold it. Absent, a
     * write builds on the local chain alone.
     */
    remote?: string;
  }>;

/** Input for {@link replayChatSegment}. @public */
export type ReplayChatSegmentInput = WriteChatRefInput &
  Readonly<{
    /**
     * The head the union is built on: the commit's parent.
     *
     * For an ordinary write it is what the local ref already holds; after a
     * fetch it is the *remote* head this device is catching up to. It is never
     * what the ref update expects — that is always the local ref's current
     * value, read here — because the local chain is this host's alone.
     */
    onto: RevisionId | undefined;
  }>;

/** Input for {@link projectChats}. @public */
export type ProjectChatsInput = ChatRefContext &
  Readonly<{
    /** The refs a fetch just wrote, local or remote-tracking. */
    refs: ReadonlyArray<Readonly<{ name: string; head: RevisionId }>>;
    signal?: AbortSignal;
    /**
     * Told of each chat whose bytes on disk changed, as it changes — also for
     * one whose record then conflicts, whose segments were still written (CH1).
     */
    onWritten?: (chatId: string) => void;
  }>;

const textDecoder = new TextDecoder();

/** One chat directory's bytes, in the ref tree's own spelling. */
type ChatTreeEntries = ReadonlyArray<readonly [string, Uint8Array<ArrayBuffer>]>;

const isNotFound = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  ((error as NodeJS.ErrnoException).code === 'ENOENT' || (error as { name?: unknown }).name === 'NotFoundError');

const readFileOrUndefined = async (
  filesystem: FileSystemProvider,
  path: string,
): Promise<Uint8Array<ArrayBuffer> | undefined> => {
  try {
    return await filesystem.readFile(path);
  } catch (error) {
    if (isNotFound(error)) {
      return undefined;
    }
    throw error;
  }
};

const readdirOrEmpty = async (filesystem: FileSystemProvider, path: string): Promise<readonly string[]> => {
  try {
    return await filesystem.readdir(path);
  } catch (error) {
    if (isNotFound(error)) {
      return [];
    }
    throw error;
  }
};

/**
 * This device's view of one chat directory, in the ref's own spelling.
 *
 * `events.jsonl` becomes `events/<deviceId>.jsonl`; every segment already on
 * disk keeps its name, because it is another device's and this host never
 * rewrites it. Attachment blobs keep their names too: they are content
 * addressed, so the same bytes are the same entry on every device and one
 * object in the store however many devices hold them.
 *
 * @param input - The chat and the device whose spelling to use.
 * @returns Path/bytes pairs, or an empty list when the chat has no records yet.
 */
const localChatEntries = async (input: ChatRefContext & Readonly<{ chatId: string }>): Promise<ChatTreeEntries> => {
  const directory = chatRecordsPath(input.chatId);
  const [segmentNames, attachmentNames] = await Promise.all([
    readdirOrEmpty(input.filesystem, `${directory}/events`),
    readdirOrEmpty(input.filesystem, `${directory}/attachments`),
  ]);
  const foreign = segmentNames.filter((name) => name.endsWith('.jsonl') && !isOwnSegment(input, `events/${name}`));
  /* Filtered by the same rule the incoming tree is validated against, so a
   * stray file in the directory is left where it is instead of being recorded
   * into a tree every reader would then refuse. */
  const attachments = attachmentNames.filter((name) => chatAttachmentPattern.test(`attachments/${name}`));
  const read = await Promise.all([
    /* This device's checkout binding and failure never travel (RV-W7 #3). */
    readFileOrUndefined(input.filesystem, `${directory}/${chatRecordFileName}`).then(
      (bytes) => [chatRecordFileName, bytes === undefined ? undefined : withoutLocalFields(bytes)] as const,
    ),
    readFileOrUndefined(input.filesystem, `${directory}/${chatLogFileName}`).then(
      (bytes) => [chatSegmentPath(input.deviceId), bytes] as const,
    ),
    ...foreign.map(async (name) =>
      readFileOrUndefined(input.filesystem, `${directory}/events/${name}`).then(
        (bytes) => [`events/${name}`, bytes] as const,
      ),
    ),
    ...attachments.map(async (name) =>
      readFileOrUndefined(input.filesystem, `${directory}/attachments/${name}`).then(
        (bytes) => [`attachments/${name}`, bytes] as const,
      ),
    ),
  ]);
  return read
    .filter((entry): entry is readonly [string, Uint8Array<ArrayBuffer>] => entry[1] !== undefined)
    .map(([path, content]) => [path, content] as const);
};

/**
 * The union of a remote tree and this device's chat directory.
 *
 * Disjoint by construction on the log segments — one path per device — so the
 * union is a plain overlay and the only path both sides can claim is
 * `chat.json`, where this device's record wins because it is the one the person
 * at this device just edited.
 *
 * @param base - The tree the union is built on, or `undefined` for an orphan.
 * @param local - This device's entries, already in the ref's spelling.
 * @returns The tree to record.
 */
const unionTree = (base: ImmutableRevisionTree | undefined, local: ChatTreeEntries): ImmutableRevisionTree => {
  const files = new Map<string, RevisionTreeInput>();
  for (const entry of base?.entries() ?? []) {
    files.set(entry.path, [entry.path, entry.content, entry.mode]);
  }
  for (const [path, content] of local) {
    const previous = files.get(path)?.[1];
    const bytes =
      previous instanceof Uint8Array && path.startsWith('events/') ? appendUnion(previous, content, path) : content;
    files.set(path, [path, bytes]);
  }
  return new ImmutableRevisionTree(files.values());
};

const startsWithBytes = (value: Uint8Array<ArrayBuffer>, prefix: Uint8Array<ArrayBuffer>): boolean =>
  value.byteLength >= prefix.byteLength && prefix.every((byte, index) => value[index] === byte);

const appendUnion = (
  left: Uint8Array<ArrayBuffer>,
  right: Uint8Array<ArrayBuffer>,
  path: string,
): Uint8Array<ArrayBuffer> => {
  if (startsWithBytes(left, right)) {
    return left;
  }
  if (startsWithBytes(right, left)) {
    return right;
  }
  throw new RevisionPortError(
    'CHECKOUT_CONFLICT',
    `Chat segment ${path} diverged on two devices. Keep both records and retry the chat sync.`,
  );
};

type ChatRecordFields = Readonly<Record<string, unknown>>;

const recordConflict = (): RevisionPortError =>
  new RevisionPortError(
    'CHECKOUT_CONFLICT',
    'This chat’s details changed on two devices. Keep the local details or the incoming details, then retry.',
  );

const parseRecordFields = (bytes: Uint8Array<ArrayBuffer>): ChatRecordFields | undefined => {
  try {
    const parsed: unknown = JSON.parse(textDecoder.decode(bytes));
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? Object.fromEntries(Object.entries(parsed))
      : undefined;
  } catch {
    return undefined;
  }
};

const byKey = ([left]: readonly [string, unknown], [right]: readonly [string, unknown]): number =>
  left < right ? -1 : left > right ? 1 : 0;

/* Nested objects with their keys sorted, so equal values compare and serialize alike on every device. */
const canonicalJson = (value: unknown): string =>
  JSON.stringify(value, (_key, nested: unknown) =>
    typeof nested === 'object' && nested !== null && !Array.isArray(nested)
      ? Object.fromEntries(Object.entries(nested).toSorted(byKey))
      : nested,
  );

const sameValue = (left: unknown, right: unknown): boolean => canonicalJson(left) === canonicalJson(right);

/* The app's `serializeChatRecord` format — two-space JSON and a newline — restated
 * because `packages/**` imports no app code. */
const serializeRecord = (record: ChatRecordFields): Uint8Array<ArrayBuffer> =>
  new TextEncoder().encode(`${JSON.stringify(record, undefined, 2)}\n`);

/* Fields every device moves on every turn: the later instant is the answer. */
const latestFields = new Set(['updatedAt', 'recencyAt']);
/* Fields that only ever settle: the earlier instant is the answer, and a tombstone wins. */
const earliestFields = new Set(['createdAt', 'deletedAt']);
/* This device's own checkout binding and failure: they never travel (RV-W7 #3). */
const localFields = ['checkoutId', 'error'] as const;

/**
 * A record as it travels: without the fields that are this device's alone.
 *
 * @param bytes - A `chat.json`.
 * @returns The same bytes when it holds neither field or is not a record; else
 *   the record without them, in its own key order.
 */
const withoutLocalFields = (bytes: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> => {
  const record = parseRecordFields(bytes);
  if (record === undefined || localFields.every((key) => !(key in record))) {
    return bytes;
  }
  return serializeRecord(
    Object.fromEntries(Object.entries(record).filter(([key]) => !localFields.some((field) => field === key))),
  );
};

/**
 * The record to write here: the reconciled one, with this device's own fields
 * as this device holds them.
 *
 * @param merged - The reconciled record, without local fields.
 * @param local - This device's `chat.json` as it is on disk.
 * @param shared - `local` without its local fields.
 * @returns `local` itself when nothing shared changed, so a re-run writes nothing.
 */
const withLocalFieldsOf = (
  merged: Uint8Array<ArrayBuffer>,
  local: Uint8Array<ArrayBuffer>,
  shared: Uint8Array<ArrayBuffer>,
): Uint8Array<ArrayBuffer> => {
  if (equalBytes(merged, shared)) {
    return local;
  }
  const record = parseRecordFields(merged);
  const own = parseRecordFields(local);
  if (record === undefined || own === undefined || localFields.every((key) => !(key in own) && !(key in record))) {
    return merged;
  }
  const kept = Object.entries(record).filter(([key]) => !localFields.some((field) => field === key));
  return serializeRecord(
    Object.fromEntries([...kept, ...localFields.flatMap((key) => (key in own ? [[key, own[key]] as const] : []))]),
  );
};

/**
 * One field of `chat.json`, three ways (CH1): the side that changed, a join for
 * the timestamps, and a conflict only where both sides changed anything else.
 * Symmetric: swapping the two sides gives the same value.
 *
 * @param field - The field's name, this device's value and the fetched value
 *   (`undefined` when absent), and each known ancestor's value.
 * @returns The merged value, `undefined` to leave the field out.
 * @throws RevisionPortError `CHECKOUT_CONFLICT` when both sides changed a field with no join.
 */
const mergeRecordField = ({
  key,
  local,
  incoming,
  bases,
}: Readonly<{ key: string; local: unknown; incoming: unknown; bases: readonly unknown[] }>): unknown => {
  if (sameValue(local, incoming)) {
    return local;
  }
  const localChanged = !bases.some((base) => sameValue(base, local));
  const incomingChanged = !bases.some((base) => sameValue(base, incoming));
  if (localChanged !== incomingChanged) {
    return localChanged ? local : incoming;
  }
  const join = latestFields.has(key) ? Math.max : earliestFields.has(key) ? Math.min : undefined;
  if (join !== undefined) {
    if (typeof local === 'number' && typeof incoming === 'number') {
      return join(local, incoming);
    }
    /* One side has no instant yet: the present one wins (a tombstone is never cleared). */
    if (typeof local === 'number' && incoming === undefined) {
      return local;
    }
    if (typeof incoming === 'number' && local === undefined) {
      return incoming;
    }
  }
  /* Each side equals a different ancestor: neither changed anything the other
   * has not seen, so either value is the record's; the larger reads the same
   * from both sides. */
  if (!localChanged) {
    return canonicalJson(local) > canonicalJson(incoming) ? local : incoming;
  }
  throw recordConflict();
};

/**
 * Three-way `chat.json` without local fields, against every ancestor both sides
 * are known to share (D40), field by field (CH1).
 *
 * Two are known: the incoming commit's parent, and this device's own chat ref —
 * what it last recorded. The second is the only one a device's own push has when
 * it comes back, since a chat's first commit has no parent. When both sides
 * changed the record, it is merged per field by {@link mergeRecordField} and
 * written in one order every device agrees on — the first ancestor's keys, then
 * the rest sorted, nested keys sorted — so either device merging writes the
 * same bytes.
 *
 * @param local - This device's record.
 * @param bases - Each known ancestor's record.
 * @param incoming - The fetched record.
 * @returns The record, or `undefined` for none.
 * @throws RevisionPortError `CHECKOUT_CONFLICT` when both sides changed a field
 *   with no join, or either side is not a record.
 */
const reconcileShared = (
  local: Uint8Array<ArrayBuffer> | undefined,
  bases: ReadonlyArray<Uint8Array<ArrayBuffer> | undefined>,
  incoming: Uint8Array<ArrayBuffer> | undefined,
): Uint8Array<ArrayBuffer> | undefined => {
  const isBase = (bytes: Uint8Array<ArrayBuffer>): boolean =>
    bases.some((base) => base !== undefined && equalBytes(bytes, base));
  if (local === undefined || isBase(local)) {
    return incoming;
  }
  if (incoming === undefined || equalBytes(local, incoming) || isBase(incoming)) {
    return local;
  }
  const localFieldsOf = parseRecordFields(local);
  const incomingFieldsOf = parseRecordFields(incoming);
  if (localFieldsOf === undefined || incomingFieldsOf === undefined) {
    throw recordConflict();
  }
  const baseRecords = bases.flatMap((base) => {
    const parsed = base === undefined ? undefined : parseRecordFields(base);
    return parsed === undefined ? [] : [parsed];
  });
  const keys = new Set([...Object.keys(localFieldsOf), ...Object.keys(incomingFieldsOf)]);
  const first = Object.keys(baseRecords[0] ?? {}).filter((key) => keys.has(key));
  const rest = [...keys].filter((key) => !first.includes(key)).toSorted();
  const merged: Array<readonly [string, unknown]> = [];
  for (const key of [...first, ...rest]) {
    const value = mergeRecordField({
      key,
      local: localFieldsOf[key],
      incoming: incomingFieldsOf[key],
      bases: baseRecords.map((base) => base[key]),
    });
    if (value !== undefined) {
      merged.push([key, JSON.parse(canonicalJson(value)) as unknown]);
    }
  }
  return serializeRecord(Object.fromEntries(merged));
};

/**
 * `chat.json` as this device should hold it after a fetch: the shared fields
 * reconciled by {@link reconcileShared}, and `checkoutId`/`error` kept as this
 * device has them in every branch — they never travel (RV-W7 #3).
 *
 * @param local - This device's `chat.json`.
 * @param bases - Each known ancestor's `chat.json`.
 * @param incoming - The fetched `chat.json`.
 * @returns The record to write, or `undefined` for none.
 * @throws RevisionPortError `CHECKOUT_CONFLICT` as {@link reconcileShared} does.
 */
const reconcileMetadata = (
  local: Uint8Array<ArrayBuffer> | undefined,
  bases: ReadonlyArray<Uint8Array<ArrayBuffer> | undefined>,
  incoming: Uint8Array<ArrayBuffer> | undefined,
): Uint8Array<ArrayBuffer> | undefined => {
  const shared = local === undefined ? undefined : withoutLocalFields(local);
  const merged = reconcileShared(
    shared,
    bases.map((base) => (base === undefined ? undefined : withoutLocalFields(base))),
    incoming === undefined ? undefined : withoutLocalFields(incoming),
  );
  return local === undefined || shared === undefined || merged === undefined
    ? merged
    : withLocalFieldsOf(merged, local, shared);
};

const sameTree = (left: ImmutableRevisionTree, right: ImmutableRevisionTree | undefined): boolean => {
  if (right === undefined || left.size !== right.size) {
    return false;
  }
  return left.entries().every((entry) => {
    const other = right.get(entry.path);
    return other !== undefined && right.mode(entry.path) === entry.mode && equalBytes(other, entry.content);
  });
};

/** Validate the complete, deliberately small schema of an incoming chat-ref tree. */
const assertChatTree = (tree: ImmutableRevisionTree): void => {
  for (const entry of tree.entries()) {
    if (entry.mode !== '100644' || !isChatTreePath(entry.path)) {
      throw new RevisionPortError('UNSUPPORTED_OPERATION', `Chat ref contains an unsupported record: ${entry.path}`);
    }
    if (entry.path === chatRecordFileName) {
      try {
        const record: unknown = JSON.parse(textDecoder.decode(entry.content));
        if (typeof record !== 'object' || record === null || Array.isArray(record)) {
          throw new TypeError('not an object');
        }
      } catch {
        throw new RevisionPortError('UNSUPPORTED_OPERATION', 'Chat ref contains an invalid chat.json record.');
      }
    }
  }
};

/**
 * Write tree entries into one chat's directory, skipping bytes already there.
 *
 * Idempotent on purpose: the watch plane sees one change per real change
 * (A38's "coalesce at the seam"), so a projection that re-ran changes nothing.
 *
 * @param options - The checkout, chat directory, entries, and cancellation signal.
 * @returns Whether any byte on disk changed.
 */
const writeEntries = async (
  options: Readonly<{
    filesystem: FileSystemProvider;
    directory: string;
    entries: ReadonlyArray<Readonly<{ path: string; content: Uint8Array<ArrayBuffer> }>>;
    signal?: AbortSignal;
  }>,
): Promise<boolean> => {
  const { filesystem, directory, entries, signal } = options;
  const writes = await Promise.allSettled(
    entries.map(async (entry) => {
      signal?.throwIfAborted();
      const target = `${directory}/${entry.path}`;
      const current = await readFileOrUndefined(filesystem, target);
      const content =
        current !== undefined && entry.path.startsWith('events/')
          ? appendUnion(current, entry.content, entry.path)
          : entry.content;
      if (current !== undefined && equalBytes(current, content)) {
        return false;
      }
      signal?.throwIfAborted();
      await filesystem.writeFile(target, content);
      return true;
    }),
  );
  const rejected = writes.find((result) => result.status === 'rejected');
  if (rejected !== undefined) {
    throw rejected.reason instanceof Error ? rejected.reason : new Error(String(rejected.reason));
  }
  return writes.filter((result) => result.status === 'fulfilled').some((result) => result.value);
};

const chatProvenance = (input: WriteChatRefInput, now: number): RevisionProvenance =>
  Object.freeze({
    source: 'user',
    actorId: input.actorId,
    ...(input.actor === undefined ? {} : { actor: input.actor }),
    createdAt: now,
  });

/**
 * Record this device's chat directory onto `refs/tau/chats/<chatId>`.
 *
 * The commit's parent is the local ref's current value, unless the fetched
 * head (`refs/remotes/<remote>/tau/chats/<chatId>`) holds something the local
 * chain does not: then it is that head. A fetch writes only the tracking ref,
 * so a chat this device only received has no local chain at all, and building
 * on nothing minted a root the remote refuses as not a fast-forward (W13c).
 * The lease the ref update is made under is always the local ref's own value;
 * see {@link replayChatSegment}, which is what a `conflicted` result and a
 * rejected push both route to.
 *
 * @param input - The chat, the device, and the project's *Sync chats* answer.
 * @returns What the ref holds now, and why.
 * @public
 *
 * @example <caption>After a turn settles</caption>
 * ```typescript
 * import { replayChatSegment, writeChatRef } from '@taucad/revisions';
 *
 * declare const input: Parameters<typeof writeChatRef>[0];
 *
 * const written = await writeChatRef(input);
 * if (written.status === 'conflicted') {
 *   await replayChatSegment({ ...input, onto: written.head });
 * }
 * ```
 */
export const writeChatRef = async (input: WriteChatRefInput): Promise<ChatRefWriteResult> => {
  if (!input.syncChats) {
    return Object.freeze({
      chatId: input.chatId,
      ref: chatRefName(input.chatId),
      status: 'disabled',
      head: undefined,
      expectedLocalHead: undefined,
    });
  }
  const ref = chatRefName(input.chatId);
  const [local, fetched] = await Promise.all([
    input.port.readRef(ref),
    input.remote === undefined ? undefined : input.port.readRef(remoteTrackingRef(input.remote, ref)),
  ]);
  /* Every segment only grows on the remote, so a tracking head the local chain
   * lacks is the newer base; this device's own bytes come back off disk. A
   * chain that already holds it stays its own: a native push moves no tracking
   * ref, so the fetched head can be behind what this device pushed. */
  const holdsFetched = async (): Promise<boolean> => {
    if (fetched === undefined || fetched === local) {
      return true;
    }
    if (local === undefined) {
      return false;
    }
    const { behind } = await input.port.divergence({ head: local, base: fetched });
    return behind === 0;
  };
  const onto = (await holdsFetched()) ? local : fetched;
  return replayChatSegment({ ...input, onto });
};

/**
 * Put this device's segment back onto a head it did not write, and publish.
 *
 * The same operation as a first write with a different base, which is why the
 * CAS loser needs no merge: the base tree already holds every other device's
 * segment, and this device's segment is one path nobody else writes.
 *
 * Two heads, deliberately distinct: `onto` is the **parent** — after a fetch,
 * the remote head this device is catching up to — and the ref update's
 * expectation is the **local** ref's own current value, read here. A local
 * chain is one host's, so the cross-device race is a push rejection, never this
 * CAS (P18, a1 review R2).
 *
 * @param input - The chat, the device, and the head to build the union on.
 * @returns What the ref holds now, and why.
 * @public
 *
 * @example <caption>After a push the remote refused</caption>
 * ```typescript
 * import { chatRefName, projectChats, replayChatSegment } from '@taucad/revisions';
 * import type { RevisionFetchResult } from '@taucad/revisions';
 *
 * declare const input: Omit<Parameters<typeof replayChatSegment>[0], 'onto'>;
 * declare const fetched: RevisionFetchResult;
 *
 * const remoteHead = fetched.refs.find((reference) => reference.name.endsWith(chatRefName(input.chatId).slice(10)))?.head;
 * await projectChats({ ...input, refs: fetched.refs });
 * const replayed = await replayChatSegment({ ...input, onto: remoteHead });
 * // Push with the *fetched* head as the lease, never `replayed.expectedLocalHead`.
 * ```
 */
export const replayChatSegment = async (input: ReplayChatSegmentInput): Promise<ChatRefWriteResult> => {
  const ref = chatRefName(input.chatId);
  const localHead = await input.port.readRef(ref);
  if (!input.syncChats) {
    return Object.freeze({
      chatId: input.chatId,
      ref,
      status: 'disabled',
      head: undefined,
      expectedLocalHead: localHead,
    });
  }
  const base = input.onto === undefined ? undefined : await input.port.readTree(input.onto);
  if (base !== undefined) {
    assertChatTree(base);
  }
  const tree = unionTree(base, await localChatEntries(input));
  const unchanged = Object.freeze({
    chatId: input.chatId,
    ref,
    status: 'upToDate',
    head: input.onto,
    expectedLocalHead: localHead,
  } as const);
  if (tree.size === 0) {
    /* Nothing to ship: a chat whose directory has not been written yet is not
     * an empty chat, it is a chat this host has no records for. */
    return unchanged;
  }
  const nothingNew = sameTree(tree, base);
  if (nothingNew && input.onto === localHead) {
    return unchanged;
  }
  /* Nothing of this device's that the base lacks: the local ref follows the
   * base (W13c). Left behind, it was offered again on every sync, and the
   * remote refused that stale chain as not a fast-forward each time. */
  const head = nothingNew ? input.onto : await recordUnion(input, tree);
  if (head === undefined) {
    return unchanged;
  }
  /* The parent is the head being caught up to; the lease is what *this host's*
   * ref holds. They differ on every real second device, and using `onto` for
   * both is why a fetched replay could never publish (a1 review R2). */
  const published = await input.port.updateRef({ name: ref, expectedHead: localHead, head });
  const status = nothingNew ? 'upToDate' : 'updated';
  return Object.freeze(
    published.status === 'updated'
      ? { chatId: input.chatId, ref, status, head, expectedLocalHead: localHead }
      : { chatId: input.chatId, ref, status: 'conflicted', head: published.actualHead, expectedLocalHead: localHead },
  );
};

/**
 * Write one union tree as the next commit of a chat chain, parented on `onto`.
 *
 * @param input - The chat and the head the union is built on.
 * @param tree - The union to record.
 * @returns The new commit.
 */
const recordUnion = async (input: ReplayChatSegmentInput, tree: ImmutableRevisionTree): Promise<RevisionId> => {
  const now = input.now ?? Date.now();
  const receipt = await input.port.writeRevision({
    parents: input.onto === undefined ? [] : [input.onto],
    tree,
    /* A chat tree is closed, so it can never carry the `.gitattributes` a
     * pointer needs behind it, and its attachments are capped where plain git
     * carries them on any remote. Recorded verbatim, the blobs are ordinary
     * objects every device and every remote kind can serve. */
    largeObjects: false,
    provenance: chatProvenance(input, now),
    summary: { generated: `Chat ${input.chatId}` },
  });
  return revisionId(receipt.commitId);
};

/*
 * How many chat refs one fetch projects at once (L4-F10, R34). Each reads up to
 * three trees, and a second device's first open can bring every chat the
 * project has, so an unbounded fan-out held every tree in memory at once — the
 * shape `readTree`'s own fan-out bug had before C49.
 *
 * ponytail: the base tree is still read whole for its `chat.json`; reading that
 * one file needs a single-path read on `RevisionPort` (both legs), which is the
 * upgrade path if second-device opens measure slow (L4 E9).
 */
const chatProjectionConcurrency = 16;

/**
 * `Promise.allSettled` over `items`, with at most `limit` running at once.
 *
 * @param items - The work, in order.
 * @param limit - The most that may run together.
 * @param run - One item's work.
 * @returns One settled result per item, in the items' order.
 */
const settleBounded = async <Item, Result>(
  items: readonly Item[],
  limit: number,
  run: (item: Item) => Promise<Result>,
): Promise<ReadonlyArray<PromiseSettledResult<Result>>> => {
  const results: Array<PromiseSettledResult<Result>> = [];
  let next = 0;
  const lane = async (): Promise<void> => {
    while (next < items.length) {
      const index = next;
      next += 1;
      try {
        // oxlint-disable-next-line no-await-in-loop -- each lane is one sequential slot of the bounded pool.
        results[index] = { status: 'fulfilled', value: await run(items[index]!) };
      } catch (error) {
        results[index] = { status: 'rejected', reason: error };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
  return results;
};

/**
 * Write every fetched chat ref's tree into the checkout's `.tau/chats/**`.
 *
 * The *fetch path* writes the projection (A39): a client reads chats from
 * files, so a chat that arrived as a ref is not a chat until its bytes are in
 * the checkout. Writes go through the checkout's own filesystem — the host's
 * authority, not a user-facing bridge port — so the watch plane reports an
 * ordinary content change and nothing treats the projection as a user edit.
 *
 * This device's own segment is never written back: it lives at
 * `events.jsonl`, the file its agent host appends to, and overwriting that
 * with a tree's copy would truncate a live log.
 *
 * @param input - The refs a fetch wrote, and where to project them.
 * @returns The chat ids whose records changed on disk.
 * @public
 */
export const projectChats = async (input: ProjectChatsInput): Promise<readonly string[]> => {
  const projected = await settleBounded(input.refs, chatProjectionConcurrency, async (ref) => {
    const chatId = chatIdOfRef(ref.name);
    if (chatId === undefined) {
      return undefined;
    }
    const tree = await input.port.readTree(ref.head);
    if (tree === undefined) {
      return undefined;
    }
    assertChatTree(tree);
    input.signal?.throwIfAborted();
    const directory = chatRecordsPath(chatId);
    const localRecord = await readFileOrUndefined(input.filesystem, `${directory}/${chatRecordFileName}`);
    const revision = await input.port.readRevision(ref.head);
    const base = revision?.parents[0] === undefined ? undefined : await input.port.readTree(revision.parents[0]);
    const recorded = await input.port.readRef(chatRefName(chatId));
    const own = recorded === undefined ? undefined : await input.port.readTree(recorded);
    const incomingRecord = tree.get(chatRecordFileName);
    /* A record conflict never withholds the other device's log (CH1): the
     * segments and attachments are written either way, the record only when it
     * reconciled, and the conflict is reported after them. */
    let metadata: Uint8Array<ArrayBuffer> | undefined;
    let conflict: RevisionPortError | undefined;
    try {
      metadata = reconcileMetadata(
        localRecord,
        [base?.get(chatRecordFileName), own?.get(chatRecordFileName)],
        incomingRecord,
      );
    } catch (error) {
      if (!(error instanceof RevisionPortError)) {
        throw error;
      }
      conflict = error;
    }
    const changed = await writeEntries({
      filesystem: input.filesystem,
      directory,
      entries: [
        ...tree
          .entries()
          .filter(
            (entry) =>
              !isOwnSegment(input, entry.path) && entry.path !== chatLogFileName && entry.path !== chatRecordFileName,
          ),
        ...(metadata === undefined ? [] : [{ path: chatRecordFileName, content: metadata }]),
      ],
      signal: input.signal,
    });
    if (changed) {
      input.onWritten?.(chatId);
    }
    if (conflict !== undefined) {
      throw conflict;
    }
    return changed ? chatId : undefined;
  });
  const rejected = projected.find((result) => result.status === 'rejected');
  if (rejected !== undefined) {
    throw rejected.reason instanceof Error ? rejected.reason : new Error(String(rejected.reason));
  }
  return Object.freeze(
    projected.flatMap((result) => (result.status === 'fulfilled' && result.value !== undefined ? [result.value] : [])),
  );
};

/**
 * The chat record as it is stored, for a host that only needs its bytes.
 *
 * @param filesystem - The checkout holding `.tau/chats/**`.
 * @param chatId - The chat to read.
 * @returns The record's UTF-8 text, or `undefined` when the chat has none.
 * @public
 */
export const readChatRecord = async (filesystem: FileSystemProvider, chatId: string): Promise<string | undefined> => {
  const bytes = await readFileOrUndefined(filesystem, `${chatRecordsPath(chatId)}/${chatRecordFileName}`);
  return bytes === undefined ? undefined : textDecoder.decode(bytes);
};
