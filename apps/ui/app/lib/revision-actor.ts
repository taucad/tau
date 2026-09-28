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
import { useEffect, useSyncExternalStore } from 'react';
import type { RevisionUserActor } from '@taucad/revisions';
import { randomUuid } from '@taucad/utils/id';
import { ENV } from '#environment.config.js';

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
 * React binding for {@link getRevisionSessionUser}.
 *
 * @returns The signed-in person, or `undefined`.
 * @public
 */
export const useRevisionSessionUser = (): RevisionSessionUser | undefined =>
  useSyncExternalStore(
    (listener) => sessionTopic.subscribe(listener),
    getRevisionSessionUser,
    () => undefined,
  );

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
    throw new Error(`Tau Cloud answered ${String(response.status)}`);
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
