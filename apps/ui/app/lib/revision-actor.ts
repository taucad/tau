/**
 * Who this document records revisions as (S37, A26, EQ8).
 *
 * Two things live here: the workspace's anonymity preference, and the mapping
 * from *this document's session* to the {@link RevisionActor} the effects module
 * stamps on every mint.
 *
 * **Where the setting is stored, and why it is not `tau.json`.** `tau.json` is
 * the project manifest: it is versioned, it is per project, and it syncs with
 * the graph. Writing an identity preference there would publish a personal
 * choice to every collaborator and every clone, would have to be answered once
 * per project rather than once per workspace (EQ8 ruled *per workspace*), and
 * flipping it would itself be a change that mints a revision. So the preference
 * is host state, keyed by workspace slug, in the same per-document store the
 * other view preferences use. A disk host answers the same question from its own
 * config; neither ever writes it into the tree.
 *
 * Anonymity is applied **here**, before the revision is written, which is what
 * makes "switching it never rewrites history" true rather than aspirational:
 * what was recorded was recorded, and the next mint records differently.
 *
 * **Anonymity is a promise (EQ10 option (a)).** The pseudonym derives from a
 * salt nothing in the tree records: for a signed-in person, the one the API
 * serves their account for this workspace (`GET /v1/revisions/salt`), cached
 * here in host state; signed out, a random one this device keeps per
 * workspace. So the same person is one `Anonymous` in a workspace on every
 * device, a different one in every other workspace, and nobody holding the
 * history — even with every user id it records — can recompute who it is.
 *
 * The account's salt is fetched as soon as a signed-in document opens a
 * workspace, whether or not anonymity is on, so it is already in host state
 * the first time anonymity is chosen and survives going offline. The one
 * residual is a device that has never been online signed in to that
 * workspace: until the API has answered once, it records under its own
 * device salt, a second pseudonym for the same person that is still
 * unlinkable.
 *
 * The salt is keyed by the workspace slug from the route. It is the one
 * workspace name two devices share: a workspace's `wsp_` id is minted per
 * device (`handle-store.ts`) and Home has none, so an id would give the same
 * person a different pseudonym on every device.
 */

import { Topic } from '@taucad/events';
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import type { RevisionRowWho, RevisionUserActor } from '@taucad/revisions';
import { randomUuid } from '@taucad/utils/id';
import { ENV } from '#environment.config.js';
import { useFeature } from '#flags/use-feature.js';
import { recordApiRequestId } from '#lib/api-request-id.js';
import { getPushRecords, subscribePushRecords } from '#lib/revision-pushes.js';
import type { PushRecordSnapshot } from '#lib/revision-pushes.js';

/** Local-storage key prefix; one entry per workspace (EQ8). @public */
export const anonymousRevisionsStorageKeyPrefix = 'tau-anonymous-revisions:';

const topic = new Topic<void>({ name: 'revision-anonymity' });

const storageKey = (workspace: string): string => `${anonymousRevisionsStorageKeyPrefix}${workspace}`;

/**
 * Whether revisions recorded in this workspace hide the person who made them.
 *
 * @param workspace - Workspace slug from the route.
 * @returns True when the person chose anonymity here.
 * @public
 */
export const getAnonymousRevisions = (workspace: string): boolean => {
  try {
    return globalThis.localStorage.getItem(storageKey(workspace)) === 'true';
  } catch {
    /* A document with no storage records attributed revisions, which is the
     * same answer a document that never chose anonymity gives. */
    return false;
  }
};

/**
 * Choose whether this workspace's revisions name the person who made them.
 *
 * @param workspace - Workspace slug from the route.
 * @param anonymous - True to record `Anonymous` instead of the signed-in user.
 * @returns Nothing; the next mint reads the new value.
 * @public
 */
export const setAnonymousRevisions = (workspace: string, anonymous: boolean): void => {
  try {
    globalThis.localStorage.setItem(storageKey(workspace), anonymous ? 'true' : 'false');
  } catch {
    /* The preference is unavailable rather than silently inverted: a document
     * that cannot store it also cannot read it back, so it stays attributed. */
  }
  topic.emit();
};

/**
 * React binding for {@link getAnonymousRevisions}.
 *
 * @param workspace - Workspace slug from the route.
 * @returns The current preference, re-rendering when it changes.
 * @public
 */
export const useAnonymousRevisions = (workspace: string): boolean =>
  useSyncExternalStore(
    (listener) => topic.subscribe(listener),
    () => getAnonymousRevisions(workspace),
    () => false,
  );

/**
 * The signed-in person, as much of them as a revision records.
 *
 * No account address: a revision's author travels with every push and export,
 * so it is `<id>@users.noreply.tau.new` unless a linked forge supplies its own
 * no-reply identity (D33).
 *
 * @public
 */
export type RevisionSessionUser = Readonly<{ id: string; name?: string }>;

const sessionTopic = new Topic<void>({ name: 'revision-session-user' });
let sessionUser: RevisionSessionUser | undefined;

/**
 * Publish who is signed in, for the one consumer that mints revisions.
 *
 * A module store rather than a hook chain: the session lives behind a react-query
 * provider that only the application root mounts, and the revision client is
 * read in a worker-facing hook and in tests that have no such provider. One
 * publisher, many readers, and nothing downstream grows a query dependency.
 *
 * @param user - The signed-in person, or `undefined` when signed out.
 * @returns Nothing; readers re-render.
 * @public
 */
export const setRevisionSessionUser = (user: RevisionSessionUser | undefined): void => {
  if (user?.id === sessionUser?.id && user?.name === sessionUser?.name) {
    return;
  }
  sessionUser = user;
  sessionTopic.emit();
};

/** The published session user, for a caller outside React. @public */
export const getRevisionSessionUser = (): RevisionSessionUser | undefined => sessionUser;

/**
 * Hear every change of the published session user, outside React.
 *
 * What lets the revision client take a sign-in, a sign-out or an account
 * switch as an event (audit R6) instead of a React effect re-running on it.
 *
 * @param listener - Called after each change; read {@link getRevisionSessionUser}.
 * @returns The unsubscribe function.
 * @public
 */
export const subscribeRevisionSessionUser = (listener: () => void): (() => void) => sessionTopic.subscribe(listener);

/**
 * React binding for {@link getRevisionSessionUser}.
 *
 * @returns The signed-in person, or `undefined`.
 * @public
 */
export const useRevisionSessionUser = (): RevisionSessionUser | undefined =>
  useSyncExternalStore(subscribeRevisionSessionUser, getRevisionSessionUser, () => undefined);

/** Local-storage key prefix for the salts this host keeps; never written to the tree (EQ10). @public */
export const revisionSaltStorageKeyPrefix = 'tau-revision-salt:';

const saltTopic = new Topic<void>({ name: 'revision-salt' });

/** Salts for a document whose storage throws, so its pseudonym is still stable for the session. */
const unstoredSalts = new Map<string, string>();

/** Account salts already asked for, so every mounted consumer shares one request. */
const requestedSalts = new Set<string>();

const saltKey = (workspace: string, userId?: string): string =>
  `${revisionSaltStorageKeyPrefix}${workspace}${userId === undefined ? '' : `\0${userId}`}`;

const readSalt = (key: string): string | undefined => {
  try {
    return globalThis.localStorage.getItem(key) ?? undefined;
  } catch {
    return unstoredSalts.get(key);
  }
};

const writeSalt = (key: string, salt: string): void => {
  try {
    globalThis.localStorage.setItem(key, salt);
  } catch {
    /* No storage: a session copy keeps the pseudonym stable until the document closes. */
    unstoredSalts.set(key, salt);
  }
};

/**
 * This device's own random salt for a workspace: what a signed-out person's
 * pseudonym derives from (P29), and a signed-in person's until the API's salt
 * arrives. Random rather than the device id, so a pseudonym is never derived
 * from an identifier this host also holds for another purpose.
 */
const deviceSalt = (workspace: string): string => {
  const key = saltKey(workspace);
  const held = readSalt(key);
  if (held !== undefined) {
    return held;
  }
  const minted = randomUuid();
  writeSalt(key, minted);
  return minted;
};

/**
 * Hash a salt into the stable anonymous id A26 names.
 *
 * Synchronous and non-cryptographic on purpose: the pseudonym is not the
 * secret, the salt is. It comes from nothing the history records — the API's
 * per-`(workspace, account)` salt, or this device's random one — so knowing the
 * workspace and every user id in the history still recomputes nothing (L6-F10).
 *
 * @param salt - The salt this pseudonym is for.
 * @returns A short hexadecimal digest.
 */
const anonymousId = (salt: string): string => {
  let hash = 0;
  for (const character of salt) {
    hash = (hash * 31 + (character.codePointAt(0) ?? 0)) % 0x7f_ff_ff_ff;
  }
  return `anon:${hash.toString(16).padStart(8, '0')}`;
};

const fetchAccountSalt = async (workspace: string): Promise<string> => {
  const response = await fetch(
    `${ENV.TAU_API_URL.replace(/\/$/u, '')}/v1/revisions/salt?workspace=${encodeURIComponent(workspace)}`,
    // eslint-disable-next-line @typescript-eslint/naming-convention -- HTTP header names retain TitleCase on the wire.
    { credentials: 'include', headers: { Accept: 'application/json' } },
  );
  if (!response.ok) {
    throw recordApiRequestId(new Error(`Tau Cloud answered ${String(response.status)}`), response);
  }
  const { salt } = (await response.json()) as { salt?: unknown };
  if (typeof salt !== 'string' || salt === '') {
    throw new Error('Tau Cloud answered without a salt');
  }
  return salt;
};

/**
 * The signed-in account's salt for this workspace, fetched once per account
 * and workspace as soon as either is known, and cached in host state (EQ10
 * option (a)).
 *
 * Fetched whether or not anonymity is on, so the first anonymous revision
 * already has it (coordinator ruling 2026-09-25). A failed request is asked
 * again on the next mount; until an answer has ever arrived the pseudonym
 * uses this device's own salt.
 *
 * @param input - Workspace slug and the signed-in account.
 * @returns The salt, or `undefined` signed out or before the API has answered once.
 * @public
 */
export const useRevisionSalt = (
  input: Readonly<{ workspace: string; userId: string | undefined }>,
): string | undefined => {
  const { workspace, userId } = input;
  const key = userId === undefined ? undefined : saltKey(workspace, userId);
  const salt = useSyncExternalStore(
    (listener) => saltTopic.subscribe(listener),
    () => (key === undefined ? undefined : readSalt(key)),
    () => undefined,
  );
  useEffect(() => {
    if (key === undefined || workspace === '' || salt !== undefined || requestedSalts.has(key)) {
      return;
    }
    requestedSalts.add(key);
    // async-iife: bootstrap -- the answer lands in host state and re-renders every consumer.
    void (async (): Promise<void> => {
      try {
        writeSalt(key, await fetchAccountSalt(workspace));
        saltTopic.emit();
      } catch {
        /* Offline, or not signed in on the server: this device's salt stands in. */
        requestedSalts.delete(key);
      }
    })();
  }, [key, salt, workspace]);
  return salt;
};
/**
 * The person half of an actor: the signed-in user, or their anonymous stand-in.
 *
 * @param input - Workspace, session user and the workspace's preference.
 * @returns The user actor every mint in this document is authored by.
 * @public
 */
export const revisionUserActor = (
  input: Readonly<{
    workspace: string;
    user: RevisionSessionUser | undefined;
    anonymous: boolean;
    /** The account's salt for this workspace, from {@link useRevisionSalt}; absent signed out or before it answers. */
    salt?: string;
    /**
     * The name and address commits are authored with instead of the session's,
     * for a project linked to GitHub: GitHub declines a push that exposes a
     * private address (GH007), so a linked project records the account's
     * no-reply identity (D33). The actor id stays the Tau user.
     */
    commitIdentity?: Readonly<{ name: string; email: string }>;
  }>,
): RevisionUserActor => {
  if (input.anonymous || input.user === undefined) {
    /*
     * Signed in: the account's salt, so anonymity hides *who* and one person
     * stays one `Anonymous` in a workspace however many devices they record
     * from (EQ10). Signed out: this device's own salt (P29) — there is no
     * account, and one shared "signed-out" pseudonym would make every
     * signed-out person in a workspace one false identity.
     *
     * No email either way: it is the identifying half, so an anonymous actor
     * never carries one and nothing downstream has to remember to strip it.
     */
    const salt = (input.user === undefined ? undefined : input.salt) ?? deviceSalt(input.workspace);
    return { kind: 'user', id: anonymousId(salt), name: 'Anonymous', anonymous: true };
  }
  if (input.commitIdentity !== undefined) {
    return { kind: 'user', id: input.user.id, ...input.commitIdentity };
  }
  return { kind: 'user', id: input.user.id, ...(input.user.name === undefined ? {} : { name: input.user.name }) };
};

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

/**
 * Who a pushed entry reads as: the account the server authenticated, with
 * `recorded as` beside it when the entry names another account in the
 * directory, and `by a cloud agent host` when a host device pushed it.
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
    return named.length === 0
      ? ''
      : [...named, ...(pusher.viaDevice === true ? ['by a cloud agent host'] : [])].join(' · ');
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
 * In order: an agent's result reads `Agent`; an entry on Tau Cloud is the
 * account that pushed it; an entry made on this device is whoever is signed in
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
 * account's behalf adds `by a cloud agent host` to a line that names someone.
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
  if (pusher !== undefined) {
    return pushedWho({ person, context, pusher, anonymous, isShared });
  }
  if (isAnonymous) {
    return { line: anonymous, isYou: false, isAgent: false };
  }
  const { session } = context;
  if (session !== undefined && person?.id === session.id) {
    return account(session.id, session.name ?? '');
  }
  if (entry.who.kind === 'unrecorded' && entry.who.authorName !== undefined && entry.who.authorName !== '') {
    return { line: entry.who.authorName, isYou: false, isAgent: false };
  }
  return nobody;
};

/**
 * React binding for one project's {@link RevisionWhoContext}.
 *
 * The push record is whatever `refreshPushRecords` has read for this
 * account and project, joined to the rows the page holds; the History hook
 * drives those reads, so every reader here sees the same answer.
 *
 * @param projectId - The open project's id, when there is one.
 * @returns The context, re-rendering on sign-in, sign-out, the debug setting, and each push or row that arrives.
 * @public
 */
export const useRevisionWhoContext = (projectId: string | undefined): RevisionWhoContext => {
  const session = useRevisionSessionUser();
  const showAnonymousId = useFeature('tauDebug');
  const accountId = session?.id;
  const pushes = useSyncExternalStore(
    subscribePushRecords,
    () => getPushRecords(projectId, accountId),
    () => undefined,
  );
  const pushRecord = useMemo(() => (pushes === undefined ? undefined : revisionPushRecordOf(pushes)), [pushes]);
  return useMemo(() => ({ session, pushRecord, showAnonymousId }), [pushRecord, session, showAnonymousId]);
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
