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
 */

import { Topic } from '@taucad/events';
import { useSyncExternalStore } from 'react';
import type { RevisionUserActor } from '@taucad/revisions';
import { deviceId } from '#lib/device-id.js';

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

/** The signed-in person, as much of them as the session knows. @public */
export type RevisionSessionUser = Readonly<{ id: string; name?: string; email?: string }>;

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
  if (user?.id === sessionUser?.id && user?.name === sessionUser?.name && user?.email === sessionUser?.email) {
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

/**
 * Hash one workspace and one subject into the stable anonymous id A26 names.
 *
 * Per workspace, so the same subject is one consistent `Anonymous` across a
 * workspace's history and is not linkable across workspaces. Synchronous and
 * non-cryptographic on purpose: this is a *pseudonym*, not a secret — it is
 * derived from an id the store never records, so there is nothing to invert.
 *
 * @param workspace - Workspace slug.
 * @param subject - The signed-in person, or this device when nobody is (P29).
 * @returns A short hexadecimal digest.
 */
const anonymousId = (workspace: string, subject: string): string => {
  let hash = 0;
  for (const character of `${workspace}\0${subject}`) {
    hash = (hash * 31 + (character.codePointAt(0) ?? 0)) % 0x7f_ff_ff_ff;
  }
  return `anon:${hash.toString(16).padStart(8, '0')}`;
};

/**
 * The person half of an actor: the signed-in user, or their anonymous stand-in.
 *
 * @param input - Workspace, session user and the workspace's preference.
 * @returns The user actor every mint in this document is authored by.
 * @public
 */
export const revisionUserActor = (
  input: Readonly<{ workspace: string; user: RevisionSessionUser | undefined; anonymous: boolean }>,
): RevisionUserActor => {
  if (input.anonymous || input.user === undefined) {
    /*
     * Signed in: the person, so anonymity hides *who* and one person stays one
     * `Anonymous` in a workspace however many devices they record from.
     * Signed out: this device (P29) — there is no person to hash, and hashing
     * the same "signed-out" constant made every signed-out person in a shared
     * workspace one identity, which is a false identity, not anonymity.
     *
     * No email either way: it is the identifying half, so an anonymous actor
     * never carries one and nothing downstream has to remember to strip it.
     */
    const subject = input.user === undefined ? `device:${deviceId()}` : `user:${input.user.id}`;
    return { kind: 'user', id: anonymousId(input.workspace, subject), name: 'Anonymous', anonymous: true };
  }
  return {
    kind: 'user',
    id: input.user.id,
    ...(input.user.name === undefined ? {} : { name: input.user.name }),
    ...(input.user.email === undefined ? {} : { email: input.user.email }),
  };
};
