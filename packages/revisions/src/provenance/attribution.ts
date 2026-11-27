/**
 * `attributionOf`: the only code that decides who an entry is shown as by
 * (blueprint D4).
 *
 * It answers an account only for an entry the server's attribution read
 * joined to a push, and only that push's attested pusher (I3). An unjoined
 * entry is `local` or `pending` and never an account. Steps run in order and
 * the first that matches answers; the step numbers are D4's.
 */

import type { Attribution, CommitReading, Join, PushView, ServerBits, Viewer } from '#provenance/types.js';

type Joined = Readonly<{ push: PushView; bits: ServerBits }>;
type AccountPusher = Readonly<{
  kind: 'account';
  accountId: string;
  former?: true;
}>;
type Basis = Extract<Attribution, { kind: 'account' }>['basis'];

/* Step 1, `local`: no remote-tracking ref reaches the commit, so nothing about
 * it is attested and no answer is an account, not even the viewer's own. */
const localAttribution = (reading: CommitReading, viewer: Viewer): Attribution => {
  if (reading.tauAgent !== undefined) {
    return { kind: 'tauAgent' };
  }
  if (reading.agent !== undefined) {
    return { kind: 'agent', agent: reading.agent.id, onThisDevice: true };
  }
  const own =
    viewer.accountId !== undefined &&
    (reading.person?.id === viewer.accountId ||
      reading.onBehalfOf === viewer.accountId ||
      reading.authorAccountId === viewer.accountId);
  if (own || (reading.claimable !== undefined && viewer.deviceIdentities.includes(reading.claimable))) {
    return { kind: 'local' };
  }
  if (reading.pseudonymous) {
    return { kind: 'anonymous' };
  }
  if (reading.tauWritten && !reading.namesAccount) {
    return { kind: 'beforeSignIn' };
  }
  return { kind: 'external', name: reading.authorName };
};

/* Step 7's bases for the author, in order: record, own git, forge, address. */
const authorBasis = (reading: CommitReading, bits: ServerBits, pusher: string): Basis | undefined => {
  if (reading.shape === 'tau/2' && reading.person?.id === pusher) {
    return 'record';
  }
  const recordNamesOther =
    reading.shape === 'tau/2' &&
    ((reading.person !== undefined && reading.person.id !== pusher) ||
      (reading.onBehalfOf !== undefined && reading.onBehalfOf !== pusher));
  if (reading.authorAccountId === pusher && !recordNamesOther) {
    return 'ownGit';
  }
  if (bits.forge === true) {
    return 'forge';
  }
  return bits.address === true ? 'address' : undefined;
};

/* Step 6 (b): the committer verifies as the pusher on own git, address or forge. */
const committerVerifies = (reading: CommitReading, bits: ServerBits, pusher: string): boolean =>
  reading.committerAccountId === pusher || bits.committerAddress === true || bits.committerForge === true;

const account = (pusher: AccountPusher, push: PushView, basis: Basis): Attribution => ({
  kind: 'account',
  accountId: pusher.accountId,
  basis,
  ...(pusher.former === true ? { former: true } : {}),
  ...(push.viaDevice ? { viaDevice: true } : {}),
});

const external = (reading: CommitReading, pusher: string): Attribution => ({
  kind: 'external',
  name: reading.authorName,
  backedUpBy: pusher,
});

/* Steps 6 to 9, once hiding, claims, pseudonyms and Tau agents are settled. */
const verifiedAttribution = (reading: CommitReading, join: Joined, pusher: AccountPusher): Attribution => {
  const { push, bits } = join;
  const id = pusher.accountId;
  const basis = authorBasis(reading, bits, id);
  /* Step 6: a recognised external agent (D6). */
  if (reading.agent !== undefined) {
    const agent = reading.agent.id;
    if (reading.agent.by === 'author') {
      return committerVerifies(reading, bits, id)
        ? { kind: 'agent', agent, for: id }
        : { kind: 'agent', agent, backedUpBy: id };
    }
    /* A trailer or committer matcher applies only to a commit that verifies as
     * the pusher on record, own git or forge (6a); otherwise steps 7 to 9 decide. */
    if (basis === 'record' || basis === 'ownGit' || basis === 'forge') {
      return { kind: 'agent', agent, for: id };
    }
  }
  /* Step 7: verified as the pusher on one basis. */
  if (basis !== undefined) {
    return account(pusher, push, basis);
  }
  /* Step 8: Tau wrote it and it names no account. */
  if (reading.tauWritten && !reading.namesAccount) {
    return { kind: 'beforeSignIn', backedUpBy: id };
  }
  /* Step 9: external. */
  return external(reading, id);
};

const joinedAttribution = (reading: CommitReading, join: Joined, viewer: Viewer): Attribution => {
  const { push, bits } = join;
  /* Step 2: a hidden push. Every entry reads Anonymous. */
  if (push.pusher.kind === 'hidden') {
    return push.backedUpBy === undefined ? { kind: 'anonymous' } : { kind: 'anonymous', backedUpBy: push.backedUpBy };
  }
  const { pusher } = push;
  const id = pusher.accountId;
  /* Step 3, before step 4 so claimed signed-out work reads as the account (R2-5). A
   * claim never covers a commit that names an account (I12), whatever the bits say. */
  if (bits.claim === true && reading.claimable !== undefined && !reading.namesAccount) {
    return account(pusher, push, 'claim');
  }
  /* Step 4: pseudonymous and not covered. */
  if (reading.pseudonymous) {
    return viewer.owner ? { kind: 'anonymous', backedUpBy: id } : { kind: 'anonymous' };
  }
  /* Step 5: a Tau agent result for the pusher; any other falls to step 9 (R2-6). */
  if (reading.tauAgent !== undefined) {
    const forPusher =
      (reading.shape === 'tau/2' && (reading.person?.id === id || reading.onBehalfOf === id)) ||
      reading.authorAccountId === id;
    return forPusher ? { kind: 'tauAgent', for: id } : external(reading, id);
  }
  return verifiedAttribution(reading, join, pusher);
};

/**
 * Who one entry is shown as by (blueprint D4). The page owns the words.
 *
 * @param reading - The commit's reading, from `readCommit`.
 * @param join - How the commit stands against the server, as the host supplies it.
 * @param viewer - Who is reading.
 * @returns A typed attribution: an account only for the attested pusher of a joined entry.
 * @public
 */
export const attributionOf = (reading: CommitReading, join: Join, viewer: Viewer): Attribution => {
  if (join === 'local') {
    return Object.freeze(localAttribution(reading, viewer));
  }
  if (join === 'pending') {
    return Object.freeze({ kind: 'pending', showLine: viewer.sharedProject });
  }
  return Object.freeze(joinedAttribution(reading, join, viewer));
};
