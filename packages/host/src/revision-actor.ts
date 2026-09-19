/**
 * Who a Node host records revisions as (S37, A26, AC15).
 *
 * The browser answers this from its signed-in session. A disk host has no
 * session, so it answers with the account it is running under — the OS user,
 * and the `GIT_AUTHOR_*` / `EMAIL` variables when the environment sets them,
 * which is the same pair every other tool on that machine authors with. That is
 * a person a clone's `git log` can read, where the opaque `tau-host` fallback is
 * not.
 *
 * No `git config` probe: reading it means a child process on a path that must
 * never block, and the callback is synchronous because a mint is. A host that
 * knows better — the desktop, once W13 wires its signed-in session — passes its
 * own actor instead, and this stays the fallback it already is.
 *
 * What this is *not*: a Tau account, and not an address it invented. A machine
 * with no configured mailbox records none, and `revision-headers` then writes
 * the commit under `<id>@users.noreply.tau.new`.
 */

import { userInfo } from 'node:os';

import type { RevisionActor, RevisionUserActor } from '@taucad/revisions';

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

/**
 * The account this process runs under.
 *
 * @returns The person this host records for.
 */
const account = (): RevisionUserActor => {
  let username = 'tau-host';
  try {
    username = userInfo().username;
  } catch {
    /* A container with no passwd entry for its uid: the host still records, and
     * `tau-host` is then the truthful answer rather than a guess. */
  }
  const name = environment('GIT_AUTHOR_NAME') ?? environment('GIT_COMMITTER_NAME') ?? username;
  const email = environment('GIT_AUTHOR_EMAIL') ?? environment('EMAIL');
  return Object.freeze({
    kind: 'user',
    /* The address when there is one: it is the id every clone already agrees
     * on, and it survives a rename of the account. */
    id: email ?? username,
    name,
    ...(email === undefined ? {} : { email }),
  });
};

/**
 * The `actor` a Node host hands `createProjectRevisions` (AC15).
 *
 * @returns The resolver every mint of that project is authored by.
 * @public
 *
 * @example <caption>A host that records the person running it</caption>
 * ```typescript
 * import { createProjectRevisions, hostRevisionActor } from '@taucad/host';
 *
 * const workspaceRoot = '/Users/ada/projects/bracket';
 * const revisions = createProjectRevisions({ workspaceRoot, actor: hostRevisionActor() });
 * ```
 */
export const hostRevisionActor = (): ((
  input: Readonly<{ runId: string | undefined; trigger: string }>,
) => RevisionActor | undefined) => {
  /* Resolved once, at the call that wires the project: the identity of the
   * process does not change under it, and a mint must not pay for it. */
  const person = account();
  return () => person;
};
