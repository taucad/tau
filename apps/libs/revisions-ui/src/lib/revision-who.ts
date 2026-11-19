/**
 * Who made a revision entry, as every surface shows it (blueprint "Who made it
 * comes from what the server authenticated", I2, A3, B2, Q2, Q3).
 *
 * Pure: the entry's typed who, the signed-in account, Tau Cloud's push record
 * and the debug setting go in, and the who line comes out. The inputs come
 * from `lib/revision-actor`'s `useRevisionWhoContext`: the session store, the
 * app's injected debug setting and `lib/revision-pushes`' store.
 */

import type { RevisionRowWho, RevisionUserActor } from '@taucad/revisions';
import type { RevisionSessionUser } from '#types/revision-client.types.js';
import type { PushRecordSnapshot } from '#types/revision-push.types.js';

/**
 * Who pushed one entry to Tau Cloud, as the server's push record names them (A3).
 *
 * @public
 */
export type RevisionPusher = Readonly<
  | {
      kind: 'account';
      accountId: string;
      /** The directory's name for the account; empty when it has none to show. */
      name: string;
      /** The owner's read of a push that brought an anonymously recorded entry (Q3). */
      recordedAnonymous?: true;
      /** A host device pushed it on the account's behalf. */
      viaDevice?: true;
    }
  /** A member's read of a push that brought an anonymously recorded entry: the server withholds the account (Q3). */
  | { kind: 'anonymous'; viaDevice?: true }
>;

/**
 * Tau Cloud's push record for one project, once the page has read it (A3).
 *
 * @public
 */
export type RevisionPushRecord = Readonly<{
  /** The push that first reached the entry, or `undefined` for one not backed up. */
  pushedBy: (revisionId: string) => RevisionPusher | undefined;
  /** The member directory's name for an account; `undefined` for an account it does not name. */
  memberName: (accountId: string) => string | undefined;
  /** How many accounts are members of the project: more than one is a shared project (Q2). */
  memberCount: number;
}>;

/**
 * What the who-resolver reads besides the entry itself.
 *
 * @public
 */
export type RevisionWhoContext = Readonly<{
  /** The account signed in on this device, or `undefined` signed out. */
  session: RevisionSessionUser | undefined;
  /**
   * Tau Cloud's push record (A3). `undefined` until that package reads it:
   * every entry then falls to "made on this device", its git author, or no name.
   */
  pushRecord: RevisionPushRecord | undefined;
  /** The debug setting: an anonymous entry also shows its pseudonym's hash (Q3). */
  showAnonymousId: boolean;
}>;

/**
 * Who made an entry, as every surface shows it.
 *
 * @public
 */
export type RevisionWho = Readonly<{
  /** The who line; empty when the row shows none. */
  line: string;
  /** The entry is the signed-in account's own. */
  isYou: boolean;
  /** The entry is an agent's result. */
  isAgent: boolean;
}>;

/**
 * The entry a who is asked of: its id, its source, and its typed who (B2): the
 * identity Tau recorded, or the git author of a commit Tau did not write.
 *
 * @public
 */
export type RevisionWhoEntry = Readonly<{ revisionId: string; who: RevisionRowWho; source: string }>;

/** The person a recorded identity names: the user, or the user an agent ran for. */
const personOf = (who: RevisionRowWho): RevisionUserActor | undefined => {
  if (who.kind === 'unrecorded') {
    return undefined;
  }
  return who.identity.kind === 'agent' ? who.identity.onBehalfOf : who.identity;
};

const nobody: RevisionWho = { line: '', isYou: false, isAgent: false };

/** How History marks a commit the person made with git rather than in Tau. */
const madeWithGit = 'made with git';

/**
 * Who a commit made with git reads as: the person whose Tau no-reply address
 * authored it, marked {@link madeWithGit}, on every project, so the row says
 * both who and how even where Tau's own entries show no who line.
 *
 * The address is the commit's claim, so it is believed only as far as the
 * server confirms it. Tau Cloud backs up such a commit on a project it
 * registered only for the account its address names, so a pushed one is that
 * account's when that account pushed it. A project linked to GitHub takes
 * commits without that check: one that another account pushed, or a push the
 * server withholds, reads as any pushed entry does. Not pushed yet, it is
 * made on this device, and reads as its address says. Until the push record
 * is read, it claims no account: it reads as its git author.
 *
 * @param who - The entry's typed who.
 * @param context - The session and push record.
 * @param pusher - Who pushed the entry, when it is on Tau Cloud.
 * @returns The who, or `undefined` when the entry is not a commit made with git under a Tau no-reply address.
 */
const madeWithGitWho = (
  who: RevisionRowWho,
  context: RevisionWhoContext,
  pusher: RevisionPusher | undefined,
): RevisionWho | undefined => {
  if (who.kind !== 'unrecorded' || who.authorAccountId === undefined) {
    return undefined;
  }
  const lineOf = (name: string, viaDevice = false): string =>
    [...(name === '' ? [] : [name]), madeWithGit, ...(viaDevice ? ['by a cloud agent'] : [])].join(' · ');
  /* Unread, the push record cannot say who pushed it, so the address claims no account yet. */
  if (context.pushRecord === undefined) {
    return { line: lineOf(who.authorName ?? ''), isYou: false, isAgent: false };
  }
  const accountId = who.authorAccountId;
  if (pusher !== undefined && (pusher.kind !== 'account' || pusher.accountId !== accountId)) {
    return undefined;
  }
  const isYou = context.session?.id === accountId;
  const pushedName = pusher?.kind === 'account' && pusher.name !== '' ? pusher.name : undefined;
  const name = isYou ? 'You' : (pushedName ?? context.pushRecord.memberName(accountId) ?? who.authorName ?? '');
  return { line: lineOf(name, pusher?.viaDevice === true), isYou, isAgent: false };
};

/**
 * Who a pushed entry reads as: the account the server authenticated, with
 * `recorded as` beside it when the entry names another account in the
 * directory, and `by a cloud agent` when a host device pushed it.
 *
 * @param input - The entry, the resolver's context, the push that reached it,
 *   the entry's anonymous line and whether the project is shared.
 * @returns The who line and what it stands for.
 */
const pushedWho = (
  input: Readonly<{
    person: RevisionUserActor | undefined;
    context: RevisionWhoContext;
    pusher: RevisionPusher;
    anonymous: string;
    isShared: boolean;
  }>,
): RevisionWho => {
  const { person, context, pusher } = input;
  const joined = (parts: readonly string[]): string => {
    const named = parts.filter((part) => part !== '');
    return named.length === 0 ? '' : [...named, ...(pusher.viaDevice === true ? ['by a cloud agent'] : [])].join(' · ');
  };
  /* A client never shows what it was not given, and never unmasks a pseudonym the record did not mark for the owner. */
  if (pusher.kind === 'anonymous' || (person?.anonymous === true && pusher.recordedAnonymous !== true)) {
    return { line: joined([input.anonymous]), isYou: false, isAgent: false };
  }
  const nameOf = (accountId: string, name: string): string => (context.session?.id === accountId ? 'You' : name);
  const isYou = context.session?.id === pusher.accountId;
  const recorded =
    pusher.recordedAnonymous === true
      ? 'Anonymous'
      : person === undefined || person.id === pusher.accountId
        ? undefined
        : context.pushRecord?.memberName(person.id);
  if (recorded === undefined) {
    return { line: joined([input.isShared ? nameOf(pusher.accountId, pusher.name) : '']), isYou, isAgent: false };
  }
  const recordedAs = pusher.recordedAnonymous === true || person === undefined ? recorded : nameOf(person.id, recorded);
  return { line: joined([nameOf(pusher.accountId, pusher.name), `recorded as ${recordedAs}`]), isYou, isAgent: false };
};

/**
 * Who made an entry: the one answer History, the chat marker, the agent's tool
 * card and the arrival sentence show (blueprint "Who made it comes from what
 * the server authenticated", I2).
 *
 * In order: an agent's result reads `Agent`; a commit the person made with
 * git under their Tau no-reply address is that person, `made with git`; an
 * entry on Tau Cloud is the account that pushed it; an entry made on this device is whoever is signed in
 * here, and nobody signed out; a commit Tau did not write is its git author;
 * anything else shows no name. The recorded identity is read by its type (B2),
 * never printed and never trusted for a name, and no id is parsed for what it
 * might mean. A single-person project
 * shows no who line on its person's entries; a shared one names every entry,
 * yours as `You` (Q2). An anonymous entry reads `Anonymous`, its hash only
 * behind the debug setting (Q3).
 *
 * A pushed entry whose recorded actor is another account in the project's
 * directory reads as the pusher with `recorded as` that account beside it,
 * never folded into either; so does the owner's read of an anonymously
 * recorded entry (`recorded as Anonymous`). A push a host device made on the
 * account's behalf adds `by a cloud agent` to a line that names someone.
 *
 * @param entry - The entry's id, source and typed who.
 * @param context - The session, project, push record and debug setting.
 * @returns The who line and what it stands for.
 * @public
 */
export const revisionWho = (entry: RevisionWhoEntry, context: RevisionWhoContext): RevisionWho => {
  const isShared = (context.pushRecord?.memberCount ?? 1) > 1;
  const account = (accountId: string, name: string): RevisionWho => {
    const isYou = context.session?.id === accountId;
    return { line: isShared ? (isYou ? 'You' : name) : '', isYou, isAgent: false };
  };
  if (entry.source === 'agent') {
    return { line: 'Agent', isYou: false, isAgent: true };
  }
  const person = personOf(entry.who);
  const isAnonymous = person?.anonymous === true;
  /* The pseudonym's hash, behind the debug setting only: the id with the prefix every pseudonym carries (Q3). */
  const anonymous =
    context.showAnonymousId && isAnonymous ? `Anonymous · ${person.id.replace(/^anon:/u, '')}` : 'Anonymous';
  const pusher = context.pushRecord?.pushedBy(entry.revisionId);
  const git = madeWithGitWho(entry.who, context, pusher);
  if (git !== undefined) {
    return git;
  }
  if (pusher !== undefined) {
    return pushedWho({ person, context, pusher, anonymous, isShared });
  }
  if (isAnonymous) {
    return { line: anonymous, isYou: false, isAgent: false };
  }
  /* Made on this device by whoever is signed in here: the recorded person is the session's account. */
  const mine = context.session === undefined || person?.id !== context.session.id ? undefined : context.session;
  if (mine !== undefined) {
    return account(mine.id, mine.name ?? '');
  }
  if (entry.who.kind === 'unrecorded' && entry.who.authorName !== undefined && entry.who.authorName !== '') {
    return { line: entry.who.authorName, isYou: false, isAgent: false };
  }
  return nobody;
};

/**
 * The resolver's view of a joined push store.
 *
 * @param pushes - One account's push records for one project, joined to the held rows.
 * @returns The push record {@link revisionWho} reads.
 * @public
 */
export const revisionPushRecordOf = (pushes: PushRecordSnapshot): RevisionPushRecord => ({
  pushedBy: (revisionId) => {
    const push = pushes.pushOf(revisionId);
    if (push === undefined) {
      return undefined;
    }
    const viaDevice: { viaDevice?: true } = push.viaDevice ? { viaDevice: true } : {};
    if (push.pusher.kind === 'anonymous') {
      return { kind: 'anonymous', ...viaDevice };
    }
    const { accountId } = push.pusher;
    return {
      kind: 'account',
      accountId,
      name: push.pusher.name ?? pushes.nameOf(accountId) ?? '',
      ...(push.anonymous === true ? { recordedAnonymous: push.anonymous } : {}),
      ...viaDevice,
    };
  },
  memberName: (accountId) => pushes.nameOf(accountId),
  memberCount: pushes.memberCount,
});
