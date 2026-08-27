import type { Chat, MyMessagePart, MyUIMessage } from '@taucad/chat';

/**
 * Pure cross-chat restore timeline.
 *
 * Every `create_file`/`edit_file`/`delete_file` tool part persists the full
 * file content before and after the mutation (`diffStats`), so restoring the
 * project filesystem to any earlier point is a **materialize-from-snapshots**
 * operation, not diff-reversal: replay every op across all project chats up to
 * a cutoff and write the resulting content back. Because ops carry full
 * content, `materializeAt` is a pure function of the cutoff — order-independent
 * and idempotent — so the user can navigate revisions back and forward freely.
 *
 * This module is pure: no React, no I/O. The stateful orchestration
 * (fetch-fresh -> build -> apply) lives in `revision.machine.ts`.
 *
 * See docs/research/chat-restore-time-travel.md for the full design and the
 * H-numbered invariants referenced below.
 */

/**
 * H10: project-internal state (parameters, cache, transcripts) is written
 * outside the chat tools; exclude it so restore never reverts it and a turn
 * that only touched it is not counted as a Revision.
 */
export const isDesignPath = (path: string): boolean => !path.startsWith('.tau/');

export type FileOp = {
  path: string;
  kind: 'create' | 'edit' | 'delete';
  /** Did the file exist prior to this op? Drives revert-to-absent vs revert-to-content. */
  existedBefore: boolean;
  /** Pre-op content when known (edit / overwrite / captured delete). */
  before?: string;
  /** Post-op content (create / edit); undefined for delete. */
  after?: string;
  linesAdded: number;
  linesRemoved: number;
  /** Assistant `createdAt` or a legacy fallback (H2) — a display/sort key only, NEVER identity (see `turnMessageId`). */
  time: number;
  chatId: string;
  /**
   * User-message id of the turn that produced this op — the stable
   * revision-membership key. Ownership, not a timestamp window, decides which
   * Revision an op belongs to, so colliding/duplicate `time`s can never fold or
   * drop a turn. See docs/research/revision-anchor-identity-collapse.md.
   */
  turnMessageId: string;
  /** `messageIndex * 1e4 + partIndex`: stable intra-chat sequence. */
  order: number;
  /** Global index in the sorted timeline — the total-order boundary key (H5). */
  seq: number;
};

type OpContext = { time: number; chatId: string; order: number; turnMessageId: string };

/**
 * Monotonic anchor for a user message. H2: user rows *should* carry
 * `metadata.createdAt`, but legacy rows may not — fall back to the running
 * per-chat max so ordering never breaks on an absent timestamp.
 */
const userAnchor = (message: MyUIMessage, chat: Chat, previous: number): number =>
  message.metadata?.createdAt ?? Math.max(previous, chat.createdAt);

/**
 * Convert a single message part into a `FileOp` (minus its global `seq`), or
 * `undefined` when the part is not a committed file mutation.
 *
 * Discriminants are `tool-${toolName.createFile|editFile|deleteFile}` — the same
 * AI-SDK part types the chat-message render switch matches. Only committed
 * (`output-available`) parts carry diffStats; interrupted parts (normalized by
 * `finalizeInterruptedToolParts`) have no output and are naturally skipped.
 */
function toFileOp(part: MyMessagePart, context: OpContext): Omit<FileOp, 'seq'> | undefined {
  switch (part.type) {
    case 'tool-create_file': {
      if (part.state !== 'output-available') {
        return undefined;
      }
      const diff = part.output.diffStats;
      return {
        path: part.input.targetFile,
        kind: 'create',
        // A genuine creation reverts to absent; an overwrite reverts to originalContent.
        existedBefore: diff.originalContent !== '' || diff.linesRemoved > 0,
        before: diff.originalContent,
        after: diff.modifiedContent,
        linesAdded: diff.linesAdded,
        linesRemoved: diff.linesRemoved,
        ...context,
      };
    }
    case 'tool-edit_file': {
      if (part.state !== 'output-available') {
        return undefined;
      }
      const diff = part.output.diffStats;
      if (diff.linesAdded === 0 && diff.linesRemoved === 0) {
        return undefined; // No-op edit (E6).
      }
      return {
        path: part.input.targetFile,
        kind: 'edit',
        existedBefore: true,
        before: diff.originalContent,
        after: diff.modifiedContent,
        linesAdded: diff.linesAdded,
        linesRemoved: diff.linesRemoved,
        ...context,
      };
    }
    case 'tool-delete_file': {
      if (part.state !== 'output-available') {
        return undefined;
      }
      const diff = part.output.diffStats; // Optional — undefined for legacy / missing / binary deletes.
      return {
        path: part.input.targetFile,
        kind: 'delete',
        existedBefore: true,
        before: diff?.originalContent,
        linesAdded: 0,
        linesRemoved: diff?.linesRemoved ?? 0,
        ...context,
      };
    }
    default: {
      return undefined;
    }
  }
}

/**
 * Whether the latest user turn contains at least one committed design-file
 * mutation. Terminal request emits carry the settled message snapshot, so this
 * reuses the canonical file-op extraction semantics without waiting for a
 * React Query chat refetch or mistaking chat-only turns for revisions.
 */
export function latestTurnHasDesignOps(messages: readonly MyUIMessage[]): boolean {
  const latestUserIndex = messages.findLastIndex((message) => message.role === 'user');
  if (latestUserIndex === -1) {
    return false;
  }

  const turnMessageId = messages[latestUserIndex]!.id;
  for (const [messageOffset, message] of messages.slice(latestUserIndex).entries()) {
    for (const [partIndex, part] of message.parts.entries()) {
      const op = toFileOp(part, {
        time: message.metadata?.createdAt ?? 0,
        chatId: '',
        order: (latestUserIndex + messageOffset) * 1e4 + partIndex,
        turnMessageId,
      });
      if (op && isDesignPath(op.path)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Extract the design-file ops from one chat, in message order. Assistant
 * op-time is the assistant `createdAt`, falling back to the preceding user
 * anchor for legacy messages (H2). `.tau/` paths are excluded (H10).
 */
export function extractOps(chat: Chat): Array<Omit<FileOp, 'seq'>> {
  const ops: Array<Omit<FileOp, 'seq'>> = [];
  let lastUserTime = chat.createdAt;
  // The user turn each op belongs to — set when a user message is seen so every
  // subsequent assistant op is tagged with its owning turn (H1 membership).
  let turnMessageId = '';
  for (const [messageIndex, message] of chat.messages.entries()) {
    if (message.role === 'user') {
      lastUserTime = userAnchor(message, chat, lastUserTime);
      turnMessageId = message.id;
    }
    const time = message.metadata?.createdAt ?? lastUserTime; // Assistant fallback (H2).
    for (const [partIndex, part] of message.parts.entries()) {
      const op = toFileOp(part, {
        time,
        chatId: chat.id,
        order: messageIndex * 1e4 + partIndex,
        turnMessageId,
      });
      if (op && isDesignPath(op.path)) {
        ops.push(op);
      }
    }
  }
  return ops;
}

/**
 * Merge every chat's ops into one totally-ordered timeline. Ordered by
 * `(time, chatId, order)` — a total order with a deterministic tiebreak (E9) —
 * then each op is assigned its global `seq` (H5).
 */
export function buildTimeline(chats: Chat[]): FileOp[] {
  return chats
    .flatMap((chat) => extractOps(chat))
    .sort((a, b) => a.time - b.time || a.chatId.localeCompare(b.chatId) || a.order - b.order)
    .map((op, seq) => ({ ...op, seq }));
}

/** Per-file change totals within a Revision — drives the marker's file rows (H8). */
export type RevisionFileChange = {
  path: string;
  linesAdded: number;
  linesRemoved: number;
};

/**
 * A Revision is a user turn that produced >=1 design op. `cutoffSeq` is the
 * timeline index where the *next global turn* begins (H1 + H5); materializing
 * up to it yields the state *after* this turn (Model B / inclusive).
 */
export type Revision = {
  n: number;
  chatId: string;
  messageId: string;
  /** Display/sort timestamp (user-message `createdAt` or fallback) — NOT identity; match Revisions by `messageId`. */
  anchor: number;
  cutoffSeq: number;
  /** H8 — per-file change totals for this turn, in first-seen path order. */
  files: RevisionFileChange[];
  /** Paths from `files` (derived) — retained for the top-bar chip and existing callers. */
  changedPaths: string[];
  linesAdded: number;
  linesRemoved: number;
};

/** Aggregate a turn's ops into per-file totals, in first-seen path order (H8). */
const aggregateByPath = (ops: FileOp[]): RevisionFileChange[] => {
  const byPath = new Map<string, RevisionFileChange>();
  for (const op of ops) {
    const existing = byPath.get(op.path);
    if (existing) {
      existing.linesAdded += op.linesAdded;
      existing.linesRemoved += op.linesRemoved;
    } else {
      byPath.set(op.path, { path: op.path, linesAdded: op.linesAdded, linesRemoved: op.linesRemoved });
    }
  }
  return [...byPath.values()];
};

export function buildRevisions(chats: Chat[], timeline: FileOp[]): Revision[] {
  // H1: ONE global list of user turns across ALL chats, ordered by the same
  // total-order key as the op timeline `(anchor, chatId, order)`. The `order`
  // tiebreak keeps colliding anchors from reordering turns (stability), so
  // identity never depends on a unique timestamp.
  const turns: Array<{ chatId: string; messageId: string; anchor: number; order: number }> = [];
  for (const chat of chats) {
    let previous = chat.createdAt;
    for (const [messageIndex, message] of chat.messages.entries()) {
      if (message.role !== 'user') {
        continue;
      }
      previous = userAnchor(message, chat, previous); // H2.
      turns.push({ chatId: chat.id, messageId: message.id, anchor: previous, order: messageIndex * 1e4 });
    }
  }
  turns.sort((a, b) => a.anchor - b.anchor || a.chatId.localeCompare(b.chatId) || a.order - b.order);

  // Membership by OWNERSHIP, not a timestamp window: each op already carries the
  // id of the user turn that produced it, so colliding/duplicate `time`s can
  // never fold two turns together or leave one with an empty slice.
  const opsByTurn = new Map<string, FileOp[]>();
  for (const op of timeline) {
    const list = opsByTurn.get(op.turnMessageId);
    if (list) {
      list.push(op);
    } else {
      opsByTurn.set(op.turnMessageId, [op]);
    }
  }

  // The cutoffSeq (Model B / inclusive) is still a total-order seq boundary so
  // `materializeAt` yields the state *after* this turn. Derive it from op
  // ownership + seq (not a raw-time bisect): for turn k it is the earliest seq
  // owned by any turn ordered after k, or the whole timeline for the tip.
  const orderIndexByTurn = new Map(turns.map((turn, index) => [turn.messageId, index]));
  const firstSeqOfTurnIndex = Array.from<number>({ length: turns.length }).fill(Number.POSITIVE_INFINITY);
  for (const op of timeline) {
    const k = orderIndexByTurn.get(op.turnMessageId);
    if (k !== undefined && op.seq < firstSeqOfTurnIndex[k]!) {
      firstSeqOfTurnIndex[k] = op.seq;
    }
  }
  const cutoffAfter = Array.from<number>({ length: turns.length + 1 }).fill(timeline.length);
  for (let k = turns.length - 1; k >= 0; k -= 1) {
    cutoffAfter[k] = Math.min(firstSeqOfTurnIndex[k]!, cutoffAfter[k + 1]!);
  }

  const revisions: Revision[] = [];
  for (const [index, turn] of turns.entries()) {
    const ops = opsByTurn.get(turn.messageId) ?? [];
    if (ops.length === 0) {
      continue; // Non-mutating turn -> no Revision (RV1).
    }
    const files = aggregateByPath(ops);
    revisions.push({
      n: 0,
      chatId: turn.chatId,
      messageId: turn.messageId,
      anchor: turn.anchor,
      cutoffSeq: cutoffAfter[index + 1]!, // Earliest seq owned by a later turn (tip -> timeline length).
      files,
      changedPaths: files.map((file) => file.path), // H8 (derived).
      linesAdded: files.reduce((sum, file) => sum + file.linesAdded, 0),
      linesRemoved: files.reduce((sum, file) => sum + file.linesRemoved, 0),
    });
  }
  return revisions.map((revision, index) => ({ ...revision, n: index + 1 })); // Contiguous 1..N (RV7).
}

export type RestorePlan = {
  /** Path -> content to write. */
  write: Map<string, string>;
  /** Paths to delete. */
  remove: Set<string>;
  /** Existed-before but content not captured (legacy pre-capture ops only). */
  unrecoverable: Set<string>;
};

/**
 * Materialize the filesystem state at a cutoff. H5: `cutoffSeq` is a timeline
 * index (total order), not a raw timestamp, so a same-millisecond boundary can
 * never include/exclude the wrong op. Only paths that appear in the timeline
 * are in the plan (R3), so imported/manual files never touched by a chat are
 * left untouched.
 */
export function materializeAt(timeline: FileOp[], cutoffSeq: number): RestorePlan {
  const byPath = new Map<string, FileOp[]>();
  for (const op of timeline) {
    const list = byPath.get(op.path);
    if (list) {
      list.push(op);
    } else {
      byPath.set(op.path, [op]);
    }
  }

  const plan: RestorePlan = {
    write: new Map(),
    remove: new Set(),
    unrecoverable: new Set(),
  };
  for (const [path, ops] of byPath) {
    const before = ops.filter((op) => op.seq < cutoffSeq); // Total-order prefix.
    if (before.length > 0) {
      const last = before.at(-1)!;
      if (last.kind === 'delete') {
        plan.remove.add(path);
      } else {
        plan.write.set(path, last.after!);
      }
    } else {
      const first = ops[0]!; // Earliest op, all at/after cutoff.
      if (first.existedBefore) {
        if (first.before === undefined) {
          plan.unrecoverable.add(path);
        } else {
          plan.write.set(path, first.before);
        }
      } else {
        plan.remove.add(path);
      }
    }
  }
  return plan;
}

/**
 * The user-message ids of the Revisions abandoned by editing after a
 * back-restore: those ordered strictly after the current head Revision. Used to
 * grow `supersededTurnIds` on a new-turn-after-back-restore (R9). Compared by
 * Revision order (`n`), not anchor timestamps, so colliding anchors cannot
 * mis-abandon a turn. The just-submitted (op-less) turn is naturally excluded
 * because it is not yet a Revision. Empty when the user is at the head/tip.
 */
export const computeAbandonedTurnIds = (revisions: Revision[], head: Revision | undefined): string[] =>
  revisions.filter((revision) => revision.n > (head?.n ?? 0)).map((revision) => revision.messageId);

/**
 * Back-compat read for the persisted revision head. Legacy project records
 * stored a numeric `restorePoint` (a user-message-`createdAt` anchor); the head
 * is now a stable `headTurnId`. Returns an already-migrated `headTurnId` as-is;
 * otherwise translates a legacy anchor to its Revision's `messageId` via the
 * current timeline, falling back to `''` (follow the tip) when the record was at
 * the tip (`0`), missing, or the anchor no longer resolves (e.g. anchors that
 * collapsed under the very bug this migration heals).
 *
 * ponytail: best-effort translation from the chats available at load; an
 * unresolved legacy parked-restore reverts to the tip rather than baseline —
 * strictly safer than the pre-fix stranding.
 */
export function migrateHeadTurnId(
  persisted: { headTurnId?: string; restorePoint?: number; supersededTurnIds?: readonly string[] } | undefined,
  chats: Chat[],
): string {
  if (typeof persisted?.headTurnId === 'string') {
    return persisted.headTurnId;
  }
  const legacyAnchor = persisted?.restorePoint ?? 0;
  if (legacyAnchor === 0) {
    return '';
  }
  const revisions = buildRevisions(chats, buildTimeline(activeOps(chats, [...(persisted?.supersededTurnIds ?? [])])));
  return revisions.find((revision) => revision.anchor === legacyAnchor)?.messageId ?? '';
}

/**
 * Drop the ops of superseded (abandoned) turns so `buildTimeline`/
 * `buildRevisions` exclude them without deleting the underlying messages (R9,
 * non-destructive fork). A superseded turn spans its user message through the
 * messages up to (but not including) the next user message. Identity when the
 * set is empty (H11 — the P2 state, before supersession wiring ships).
 */
export function activeOps(chats: Chat[], supersededTurnIds: readonly string[]): Chat[] {
  if (supersededTurnIds.length === 0) {
    return chats;
  }
  const superseded = new Set(supersededTurnIds);
  return chats.map((chat) => {
    let dropping = false;
    const messages = chat.messages.filter((message) => {
      if (message.role === 'user') {
        dropping = superseded.has(message.id);
      }
      return !dropping;
    });
    return messages.length === chat.messages.length ? chat : { ...chat, messages };
  });
}

export type ResolvedRestore = {
  plan: RestorePlan;
  /** The concrete Revision resolved from the requested target (real anchor). */
  target: { messageId: string; anchor: number };
  /** The resolved target is the newest Revision — restoring it means "follow the tip". */
  isLatest: boolean;
  n: number;
};

/**
 * Resolve a restore request against the current (non-superseded) timeline and
 * materialize its plan. Locate the target Revision by `messageId`, falling back
 * to `anchor` (R12 — the button passes the rendered bubble's `createdAt`), and
 * finally to the newest Revision when the anchor is the RETURN_TO_LATEST
 * sentinel (`+Infinity`). Throws a plain `Error` when the target no longer
 * exists (H9).
 */
export function resolveRestore(
  chats: Chat[],
  requested: { messageId: string; anchor: number },
  supersededTurnIds: readonly string[],
): ResolvedRestore {
  const timeline = buildTimeline(activeOps(chats, supersededTurnIds));
  const revisions = buildRevisions(chats, timeline);
  const target =
    revisions.find((revision) => revision.messageId === requested.messageId) ??
    revisions.find((revision) => revision.anchor === requested.anchor) ??
    (requested.anchor === Number.POSITIVE_INFINITY ? revisions.at(-1) : undefined);
  if (!target) {
    throw new Error('Revision no longer exists');
  }
  return {
    plan: materializeAt(timeline, target.cutoffSeq),
    target: { messageId: target.messageId, anchor: target.anchor },
    isLatest: revisions.at(-1)?.messageId === target.messageId,
    n: target.n,
  };
}
