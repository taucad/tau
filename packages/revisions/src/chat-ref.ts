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
 * `events.jsonl` is written out as `events/<deviceId>.jsonl`, so the paths of
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
  /** The chat directory's bytes already match the ref. Nothing was written. */
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
   * This host's stable identity among the devices writing one chat.
   *
   * It names a *log segment*, so it must be stable across reloads of one
   * profile and different between two profiles; it is never an identity a
   * remote can be authenticated by and never leaves the tree.
   */
  deviceId: string;
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
  const foreign = segmentNames.filter((name) => name.endsWith('.jsonl') && name !== `${input.deviceId}.jsonl`);
  /* Filtered by the same rule the incoming tree is validated against, so a
   * stray file in the directory is left where it is instead of being recorded
   * into a tree every reader would then refuse. */
  const attachments = attachmentNames.filter((name) => chatAttachmentPattern.test(`attachments/${name}`));
  const read = await Promise.all([
    readFileOrUndefined(input.filesystem, `${directory}/${chatRecordFileName}`).then(
      (bytes) => [chatRecordFileName, bytes] as const,
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

const reconcileMetadata = (
  local: Uint8Array<ArrayBuffer> | undefined,
  base: Uint8Array<ArrayBuffer> | undefined,
  incoming: Uint8Array<ArrayBuffer> | undefined,
): Uint8Array<ArrayBuffer> | undefined => {
  if (local === undefined || (base !== undefined && equalBytes(local, base))) {
    return incoming;
  }
  if (incoming === undefined || equalBytes(local, incoming) || (base !== undefined && equalBytes(incoming, base))) {
    return local;
  }
  throw new RevisionPortError(
    'CHECKOUT_CONFLICT',
    'This chat’s details changed on two devices. Keep the local details or the incoming details, then retry.',
  );
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
 * The local ref's current value is the commit's parent *and* the lease the ref
 * update is made under, because for an ordinary write those are the same head.
 * They part company after a fetch: see {@link replayChatSegment}, which is what
 * a `conflicted` result and a rejected push both route to.
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
  return replayChatSegment({ ...input, onto: await input.port.readRef(chatRefName(input.chatId)) });
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
  if (sameTree(tree, base)) {
    /* This device has nothing the base does not already hold. The local ref is
     * left where it is: its tree is a subset of the base's, and the next write
     * parents on it with every projected segment read back off disk, so nothing
     * is lost by not re-pointing it here. */
    return unchanged;
  }
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
  const head = revisionId(receipt.commitId);
  /* The parent is the head being caught up to; the lease is what *this host's*
   * ref holds. They differ on every real second device, and using `onto` for
   * both is why a fetched replay could never publish (a1 review R2). */
  const published = await input.port.updateRef({ name: ref, expectedHead: localHead, head });
  return Object.freeze(
    published.status === 'updated'
      ? { chatId: input.chatId, ref, status: 'updated', head, expectedLocalHead: localHead }
      : { chatId: input.chatId, ref, status: 'conflicted', head: published.actualHead, expectedLocalHead: localHead },
  );
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
  const projected = await Promise.allSettled(
    input.refs.map(async (ref) => {
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
      const incomingRecord = tree.get(chatRecordFileName);
      const metadata = reconcileMetadata(localRecord, base?.get(chatRecordFileName), incomingRecord);
      const changed = await writeEntries({
        filesystem: input.filesystem,
        directory,
        entries: [
          ...tree
            .entries()
            .filter(
              (entry) =>
                entry.path !== chatSegmentPath(input.deviceId) &&
                entry.path !== chatLogFileName &&
                entry.path !== chatRecordFileName,
            ),
          ...(metadata === undefined ? [] : [{ path: chatRecordFileName, content: metadata }]),
        ],
        signal: input.signal,
      });
      return changed ? chatId : undefined;
    }),
  );
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
