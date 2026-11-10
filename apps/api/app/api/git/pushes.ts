import type { PushRecord } from '@taucad/api-git-core/store/manifest';
import type { ProjectMemberName } from '@taucad/api-projects/collaboration/project-access.service';

/**
 * The push-record read (blueprint A3, Q1–Q3):
 * `GET /v1/projects/:projectId/git/pushes?after=<generation>`.
 *
 * Who made a backed-up entry is the account the server authenticated when it
 * was pushed, never what a commit's trailer claims (I2). Every push appends a
 * {@link PushRecord} to the manifest; this read hands a member those records
 * with the branch tips each one moved, and the member directory that names
 * the accounts. The client joins the tips to the graph it holds: an entry
 * belongs to the first push whose tip reaches it.
 *
 * Two things are never in the answer: an email address (the directory carries
 * ids and names only), and — to anyone but the project's owner — the account
 * behind a push that brought an anonymously recorded commit (Q3). Such a push
 * reads `{ kind: 'anonymous' }` for members, so a client cannot show what it
 * was never given. The route is `pushes.controller.ts`.
 */

/** The push-read format this build answers. */
export const pushPageFormat = 1;

/** Push reads per caller per window: one per History open, with room for paging and reconnects. */
export const pushReadsPerWindow = 60;

/** The ref family whose tips a push page lists. Chats (`refs/tau/chats/*`) and tags are left out. */
export const pushTipPrefix = 'refs/heads/';

/** Who pushed, as this viewer may see it. */
export type PushPusher =
  | { readonly kind: 'account'; readonly accountId: string; readonly name?: string }
  /** A push that brought an anonymous commit, read by a member who is not the owner (Q3). */
  | { readonly kind: 'anonymous' };

/** One push, as a member reads it. */
export type PushEntry = {
  readonly generation: number;
  /** When the server committed it, ISO 8601. */
  readonly pushedAt: string;
  readonly pusher: PushPusher;
  /**
   * Present on the owner's read of a push that brought an anonymous commit:
   * the account is shown to the owner, who should still read the entry as
   * recorded anonymously.
   */
  readonly anonymous?: true;
  /** Whether a host device pushed it on the account's behalf ("by a cloud agent host"). */
  readonly viaDevice: boolean;
  /** The branches it moved and the commit each now holds, in name order. A deleted branch is not listed. */
  readonly tips: ReadonlyArray<{ readonly ref: string; readonly tip: string }>;
  /** Present when the record counted more moved refs than it listed, so a branch may be missing. */
  readonly truncated?: true;
};

/** One member directory entry: an id and a name, never an address. */
export type PushMember = ProjectMemberName;

/** The answer. */
export type PushPage = {
  readonly format: typeof pushPageFormat;
  /** Oldest first. */
  readonly pushes: readonly PushEntry[];
  /** The project's members, and any other account a listed push names. */
  readonly members: readonly PushMember[];
  /** The `after` that reads the next page; absent on the last one. */
  readonly next?: number;
};

/**
 * Reads the `after` query: a non-negative integer generation, `0` when absent.
 *
 * @param query - The raw query value.
 * @returns The generation, or `undefined` when it is not one.
 */
export const parsePushAfter = (query: unknown): number | undefined => {
  if (query === undefined || query === '') {
    return 0;
  }
  if (typeof query !== 'string' || !/^(?:0|[1-9]\d{0,15})$/u.test(query)) {
    return undefined;
  }
  const after = Number(query);
  return Number.isSafeInteger(after) ? after : undefined;
};

/** The mark on an entry whose record counted more moved refs than it listed. */
const truncatedMark: Pick<PushEntry, 'truncated'> = { truncated: true };

/**
 * The entries a viewer may read, from the raw records.
 *
 * A record that moved no branch (a compaction, a tombstone, a push of chats
 * or tags alone) is left out: it changes no row's answer.
 *
 * @param records - The raw push records, oldest first.
 * @param viewer - Whether the viewer is the project's owner.
 * @returns The visible entries.
 */
export const visiblePushes = (
  records: readonly PushRecord[],
  viewer: { readonly owner: boolean },
): readonly PushEntry[] =>
  records.flatMap((record): PushEntry[] => {
    const tips = record.refs.flatMap((move) =>
      move.tip !== undefined && move.ref.startsWith(pushTipPrefix) ? [{ ref: move.ref, tip: move.tip }] : [],
    );
    if (tips.length === 0) {
      return [];
    }
    const hidden = record.anonymous === true && !viewer.owner;
    return [
      {
        generation: record.generation,
        pushedAt: record.committedAt,
        pusher: hidden ? { kind: 'anonymous' } : { kind: 'account', accountId: record.committedBy },
        ...(record.anonymous === true && viewer.owner ? { anonymous: record.anonymous } : {}),
        viaDevice: record.viaDevice !== undefined,
        tips,
        ...(record.omitted === undefined ? {} : truncatedMark),
      },
    ];
  });

/**
 * The accounts the visible entries name, for the directory lookup. A hidden
 * pusher is not among them, so the directory cannot name them either.
 *
 * @param entries - The visible entries.
 * @returns Distinct account ids, in first-seen order.
 */
export const pushersOf = (entries: readonly PushEntry[]): string[] => [
  ...new Set(entries.flatMap((entry) => (entry.pusher.kind === 'account' ? [entry.pusher.accountId] : []))),
];

/**
 * The page: the entries with each pusher's name from the directory.
 *
 * @param args - The visible entries, the directory and the continuation.
 * @returns The answer.
 */
export const buildPushPage = (args: {
  readonly entries: readonly PushEntry[];
  readonly members: readonly PushMember[];
  readonly next?: number;
}): PushPage => {
  const names = new Map(
    args.members.flatMap((member) => (member.name === undefined ? [] : [[member.accountId, member.name]])),
  );
  return {
    format: pushPageFormat,
    pushes: args.entries.map((entry) => {
      if (entry.pusher.kind !== 'account') {
        return entry;
      }
      const name = names.get(entry.pusher.accountId);
      return name === undefined ? entry : { ...entry, pusher: { ...entry.pusher, name } };
    }),
    members: args.members,
    ...(args.next === undefined ? {} : { next: args.next }),
  };
};
