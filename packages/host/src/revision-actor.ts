/**
 * Who a Node host records revisions as (S37, A26, AC15; blueprint A1, I1, I3).
 *
 * A disk host records the Tau account it was handed: the session a renderer
 * sends with `setActor` (the desktop), the account a CLI token belongs to
 * (`tau revisions save`, `tau serve`), or, for a cloud host, the project owner
 * the provisioner names in `TAU_HOST_OWNER_ID` and `TAU_HOST_OWNER_NAME`. With
 * no account it records this device's pseudonym, the same `Anonymous` shape a
 * signed-out browser records.
 *
 * What it never reads: the operating system's login name and the environment's
 * `GIT_AUTHOR_*`, `GIT_COMMITTER_*` and `EMAIL`. A commit travels with every
 * push and clone, so a machine account or a mailbox written there leaks to
 * everyone who ever reads the history (Q11: fixed forward, no rewrite).
 *
 * The pseudonym derives from a random salt this host keeps in Tau's config
 * directory and never writes into a tree, so it is stable on this device and
 * unlinkable to anything the history records (EQ10 option (a)).
 */

import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import type { RevisionIdentity, RevisionUserActor, RevisionVia } from '@taucad/revisions';
import { z } from 'zod';

import { defaultConfigDirectory } from '#credential-store.js';

/** What a mint asks the resolver: the run holding the cut, if any, and what asked for it. @public */
export type HostRevisionActorInput = Readonly<{ runId: string | undefined; trigger: string }>;

/** The resolver every mint of a project is authored by: it always names someone (blueprint B1, I1). @public */
export type HostRevisionActorResolver = (input: HostRevisionActorInput) => RevisionIdentity;

/**
 * The person a `setActor` request names, as the page's `revisionUserActor` builds it.
 *
 * Strict, so a request cannot smuggle an agent or a field the trailer does not know.
 */
export const revisionUserActorSchema = z
  .object({
    kind: z.literal('user'),
    id: z.string().min(1),
    name: z.string().min(1).optional(),
    email: z.string().min(1).optional(),
    anonymous: z.boolean().optional(),
  })
  .strict();

/**
 * One environment variable, or nothing when it is unset or empty.
 *
 * @param name - The variable to read.
 * @returns Its value, trimmed, or `undefined`.
 */
const environment = (name: string): string | undefined => {
  const value = process.env[name]?.trim();
  return value === undefined || value === '' ? undefined : value;
};

/** Salts for a host whose config directory cannot be written, so the pseudonym is stable for the process. */
const unstoredSalts = new Map<string, string>();

/**
 * This device's own random salt, created on first use.
 *
 * Synchronous on purpose: it is read once, when a project is wired, and a mint
 * must not wait on it.
 *
 * @returns The salt.
 */
const deviceSalt = (): string => {
  const path = join(defaultConfigDirectory(), 'revision-salt');
  try {
    const held = readFileSync(path, 'utf8').trim();
    if (held !== '') {
      return held;
    }
  } catch {
    /* Not created yet, or unreadable: mint one below. */
  }
  const remembered = unstoredSalts.get(path);
  if (remembered !== undefined) {
    return remembered;
  }
  const minted = randomUUID();
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${minted}\n`, { mode: 0o600, flag: 'wx' });
  } catch {
    /* A concurrent host wrote it first: theirs is the device's salt. */
    try {
      const held = readFileSync(path, 'utf8').trim();
      if (held !== '') {
        return held;
      }
    } catch {
      /* A read-only config directory: this process keeps one for itself. */
    }
    unstoredSalts.set(path, minted);
  }
  return minted;
};

/**
 * This device's pseudonym: what a host with no account records.
 *
 * @returns The anonymous person, with no address.
 */
export const hostDevicePseudonym = (): RevisionUserActor => {
  const digest = createHash('sha256').update(deviceSalt()).digest('hex').slice(0, 8);
  return Object.freeze({ kind: 'user', id: `anon:${digest}`, name: 'Anonymous', anonymous: true });
};

/**
 * The project owner a cloud host acts for (D21), when the provisioner named one.
 *
 * @returns The owner, or `undefined` on any other host.
 */
const cloudOwner = (): RevisionUserActor | undefined => {
  const ownerId = environment('TAU_HOST_OWNER_ID');
  if (ownerId === undefined) {
    return undefined;
  }
  const ownerName = environment('TAU_HOST_OWNER_NAME');
  return Object.freeze({ kind: 'user', id: ownerId, ...(ownerName === undefined ? {} : { name: ownerName }) });
};

/**
 * The leg a host daemon records through (blueprint B1): a Tau Cloud agent host
 * when the provisioner named the project owner it acts for, else `tau serve`.
 *
 * @returns `cloud` or `serve`.
 */
export const daemonRevisionVia = (): RevisionVia =>
  environment('TAU_HOST_OWNER_ID') === undefined ? 'serve' : 'cloud';

/**
 * A cut a run holds is the agent's, in the browser's shape: `git log`'s author
 * stays the person through `onBehalfOf`, while `Tau-Actor` names the run (rule 15).
 *
 * @param person - Who the host records for.
 * @param runId - The run holding the cut, if any.
 * @returns The actor of that cut.
 */
export const actorFor = (person: RevisionUserActor, runId: string | undefined): RevisionIdentity =>
  runId === undefined ? person : { kind: 'agent', id: 'agent', runId, onBehalfOf: person };

/**
 * The `actor` a Node host hands `createProjectRevisions` (AC15).
 *
 * @param account - The signed-in Tau account this host runs for, when it has one.
 * @returns The resolver every mint of that project is authored by.
 * @public
 *
 * @example <caption>A CLI that holds a token for an account</caption>
 * ```typescript
 * import { hostRevisionActor } from '@taucad/host';
 *
 * const actor = hostRevisionActor({ kind: 'user', id: 'usr_1', name: 'Ada' });
 * const person = actor({ runId: undefined, trigger: 'save' });
 * ```
 */
export const hostRevisionActor = (account?: RevisionUserActor): HostRevisionActorResolver => {
  /* Resolved once, at the call that wires the project: a mint must not pay for it. */
  const person = account ?? cloudOwner() ?? hostDevicePseudonym();
  return ({ runId }) => actorFor(person, runId);
};
